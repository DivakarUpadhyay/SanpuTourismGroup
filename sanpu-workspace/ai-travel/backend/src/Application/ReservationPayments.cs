using System.Globalization;
using System.Text.Json.Serialization;
using Divakar.Sanpu.Core.Application;

namespace Divakar.Sanpu.AiOps.Application;

/// <summary>"Payments" configuration. Keys come from user-secrets / environment, never from source control.</summary>
public sealed class PaymentOptions
{
    /// <summary>"ECPay" (redirect checkout) or "Simulated" (completes instantly; used by automated tests and when no gateway is configured).</summary>
    public string Provider { get; set; } = "Simulated";
    /// <summary>Public base URL of the customer site, used for the gateway's return links.</summary>
    public string PublicBaseUrl { get; set; } = "http://localhost:3102";
    public EcpayOptions Ecpay { get; set; } = new();
}

public sealed class EcpayOptions
{
    public string MerchantId { get; set; } = "";
    public string HashKey { get; set; } = "";
    public string HashIv { get; set; } = "";
    public string CheckoutUrl { get; set; } = "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";
    public string QueryUrl { get; set; } = "https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5";
    public bool IsConfigured => MerchantId.Length > 0 && HashKey.Length > 0 && HashIv.Length > 0;
}

public sealed record ReservationPaymentRow
{
    public string MerchantTradeNo { get; init; } = "";
    public int ReservationId { get; init; }
    [JsonIgnore] public Guid TravelerUserId { get; init; }
    public string Mode { get; init; } = "";
    public decimal Amount { get; init; }
    public string Currency { get; init; } = "TWD";
    public string Provider { get; init; } = "";
    public string Status { get; init; } = "";
    public string? ProviderTradeNo { get; init; }
    public string? PaymentMethod { get; init; }
    public string? ProviderMessage { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime? CompletedAtUtc { get; init; }
    public string OrderRef { get; init; } = "";
    public string ItemName { get; init; } = "";
    public string ReservationStatus { get; init; } = "";
    public decimal Total { get; init; }
    public decimal PaidAmount { get; init; }
    public DateTime StartDate { get; init; }
    public DateTime? EndDate { get; init; }
    public int Travelers { get; init; }
    public string? TravelerName { get; init; }
    public string? TravelerEmail { get; init; }
    /// <summary>True only for the call that recorded the outcome, so the email goes out once.</summary>
    [JsonIgnore] public bool JustCompleted { get; init; }
}

public sealed record ReservationCheckoutResponse(string Provider, string MerchantTradeNo, decimal Amount, bool Completed, string? Action, IReadOnlyDictionary<string, string>? Fields);

/// <summary>Result of asking the gateway about a trade (server to server).</summary>
public sealed record GatewayTradeStatus(bool Paid, decimal Amount, string? ProviderTradeNo, string? Method, string? Message);

public interface IReservationPaymentRepository
{
    Task<ReservationPaymentRow> CreateAsync(int reservationId, Guid traveler, string mode, int depositPercent, string provider, string correlationId, CancellationToken ct);
    Task<ReservationPaymentRow?> GetAsync(string tradeNo, CancellationToken ct);
    Task<ReservationPaymentRow> CompleteAsync(string tradeNo, bool paid, string? providerTradeNo, string? method, string? message, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<ReservationPaymentRow>> AllAsync(string? status, CancellationToken ct);
}

/// <summary>A payment gateway. Implementations: ECPay (Taiwan) and a simulated provider.</summary>
public interface IPaymentGateway
{
    string Name { get; }
    /// <summary>Form the browser must POST to the gateway's hosted checkout page; null when the provider completes without a redirect.</summary>
    (string Action, IReadOnlyDictionary<string, string> Fields)? BuildCheckout(ReservationPaymentRow payment, string returnUrl, string notifyUrl, string backUrl);
    /// <summary>Checks the signature of a callback posted by the gateway.</summary>
    bool VerifyCallback(IReadOnlyDictionary<string, string> form);
    /// <summary>Asks the gateway directly whether the trade is paid (never trust the browser post alone).</summary>
    Task<GatewayTradeStatus> QueryAsync(string merchantTradeNo, CancellationToken ct);
}

public sealed class ReservationPaymentService(IReservationPaymentRepository repo, ISettings settings, ICurrentUser current, IPaymentGateway gateway, PaymentOptions options, Mailer mail)
{
    private string Site => options.PublicBaseUrl.TrimEnd('/');

    /// <summary>Creates the payment (amount computed in SQL) and either completes it (simulated) or returns the gateway form.</summary>
    public async Task<ReservationCheckoutResponse> CheckoutAsync(int reservationId, PayRequest request, CancellationToken ct)
    {
        if (request.Mode is not ("Deposit" or "Balance" or "Full")) throw AppException.Validation("mode", "Choose Deposit, Full or Balance.");
        var pct = await settings.GetIntAsync("Assistant.DepositPercent", 30, ct);
        var payment = await repo.CreateAsync(reservationId, current.RequireUserId(), request.Mode, pct, gateway.Name, current.CorrelationId, ct);
        var form = gateway.BuildCheckout(payment, $"{Site}/api/v1/payments/ecpay/result", $"{Site}/api/v1/payments/ecpay/notify", $"{Site}/my/bookings");
        if (form is null)
        {
            var done = await FinishAsync(payment.MerchantTradeNo, new GatewayTradeStatus(true, payment.Amount, "SIM-" + payment.MerchantTradeNo, "Card", "Simulated payment"), ct);
            return new ReservationCheckoutResponse(gateway.Name, done.MerchantTradeNo, done.Amount, true, null, null);
        }
        return new ReservationCheckoutResponse(gateway.Name, payment.MerchantTradeNo, payment.Amount, false, form.Value.Action, form.Value.Fields);
    }

    /// <summary>
    /// Handles the gateway's callback (browser return or server notify). The signature is checked, then the trade is confirmed
    /// with the gateway's query API before anything is recorded. Returns null when the callback is invalid.
    /// </summary>
    public async Task<ReservationPaymentRow?> HandleCallbackAsync(IReadOnlyDictionary<string, string> form, CancellationToken ct)
    {
        if (!gateway.VerifyCallback(form) || !form.TryGetValue("MerchantTradeNo", out var tradeNo)) return null;
        var payment = await repo.GetAsync(tradeNo, ct);
        if (payment is null || payment.Status != "Pending") return payment;
        var status = await gateway.QueryAsync(tradeNo, ct);
        if (status.Paid) return await FinishAsync(payment, status, ct);
        if (form.GetValueOrDefault("RtnCode") == "1") return payment;   // the gateway has not published the trade yet: stays pending until re-checked
        return await FinishAsync(tradeNo, status with { Paid = false, Message = form.GetValueOrDefault("RtnMsg") ?? status.Message }, ct);
    }

    /// <summary>Lets the traveler re-check a checkout they returned from (for example when the browser post-back was lost).</summary>
    public async Task<ReservationPaymentRow> RefreshAsync(string tradeNo, CancellationToken ct)
    {
        var payment = await repo.GetAsync(tradeNo, ct);
        if (payment is null || payment.TravelerUserId != current.RequireUserId()) throw AppException.NotFound("Payment");
        if (payment.Status != "Pending" || gateway.Name == "Simulated") return payment;
        var status = await gateway.QueryAsync(tradeNo, ct);
        return status.Paid ? await FinishAsync(payment, status, ct) : payment;
    }

    public Task<IReadOnlyList<ReservationPaymentRow>> AllAsync(string? status, CancellationToken ct) =>
        repo.AllAsync(status is "Paid" or "Pending" or "Failed" ? status : null, ct);

    private Task<ReservationPaymentRow> FinishAsync(ReservationPaymentRow payment, GatewayTradeStatus status, CancellationToken ct) =>
        FinishAsync(payment.MerchantTradeNo, status.Amount == payment.Amount ? status : status with { Paid = false, Message = "The paid amount does not match this booking" }, ct);

    private async Task<ReservationPaymentRow> FinishAsync(string tradeNo, GatewayTradeStatus status, CancellationToken ct)
    {
        var p = await repo.CompleteAsync(tradeNo, status.Paid, status.ProviderTradeNo, status.Method, status.Message, current.CorrelationId, ct);
        if (p.JustCompleted) await NotifyAsync(p, ct);
        return p;
    }

    /// <summary>Emails the traveler the outcome. Callbacks have no signed-in user, so the address comes from the payment.</summary>
    private Task NotifyAsync(ReservationPaymentRow p, CancellationToken ct)
    {
        var balance = p.Total - p.PaidAmount;
        var balanceText = balance == 0 ? "Nothing, fully paid" : Mailer.Money(balance, p.Currency);
        var paymentRef = p.ProviderTradeNo ?? p.MerchantTradeNo;
        var link = Site + "/my/bookings";
        return p.Status == "Paid"
            ? mail.ToUserAsync(p.TravelerUserId, "email.reservation_paid", new()
            {
                ["status"] = p.ReservationStatus == "Confirmed" ? "Confirmed" : "Deposit paid", ["ref"] = p.OrderRef, ["item"] = p.ItemName,
                ["date"] = p.StartDate.ToString("ddd d MMM yyyy", CultureInfo.InvariantCulture) + (p.EndDate is { } e ? " – " + e.ToString("ddd d MMM yyyy", CultureInfo.InvariantCulture) : ""),
                ["pax"] = p.Travelers.ToString(CultureInfo.InvariantCulture), ["amount"] = Mailer.Money(p.Amount, p.Currency), ["total"] = Mailer.Money(p.Total, p.Currency),
                ["balance"] = balanceText, ["paymentRef"] = paymentRef, ["link"] = link
            }, ct)
            : mail.ToUserAsync(p.TravelerUserId, "email.payment_failed", new()
            {
                ["ref"] = p.OrderRef, ["item"] = p.ItemName, ["amount"] = Mailer.Money(p.Amount, p.Currency), ["method"] = p.PaymentMethod ?? "Card", ["paymentRef"] = paymentRef,
                ["balance"] = balanceText, ["reason"] = string.IsNullOrWhiteSpace(p.ProviderMessage) ? "The payment was declined or cancelled." : p.ProviderMessage!, ["link"] = link
            }, ct);
    }
}
