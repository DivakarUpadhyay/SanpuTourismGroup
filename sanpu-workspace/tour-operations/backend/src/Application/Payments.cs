using Divakar.Sanpu.Core.Application;

namespace Divakar.Sanpu.Erp.Application;

/// <summary>"Payments" configuration. Keys come from user-secrets / environment, never from source control.</summary>
public sealed class PaymentOptions
{
    /// <summary>"ECPay" (redirect checkout) or "Simulated" (completes instantly; used by automated tests and when no gateway is configured).</summary>
    public string Provider { get; set; } = "Simulated";
    /// <summary>Public base URL of the customer site, used for the gateway's return links (for example http://localhost:3101).</summary>
    public string PublicBaseUrl { get; set; } = "http://localhost:3101";
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

/// <summary>Result of asking the gateway about a trade (server to server).</summary>
public sealed record GatewayTradeStatus(bool Paid, decimal Amount, string? ProviderTradeNo, string? Method, string? Message);

/// <summary>A payment gateway. Implementations: ECPay (Taiwan) and a simulated provider.</summary>
public interface IPaymentGateway
{
    string Name { get; }
    /// <summary>Form the browser must POST to the gateway's hosted checkout page; null when the provider completes without a redirect.</summary>
    (string Action, IReadOnlyDictionary<string, string> Fields)? BuildCheckout(PaymentIntentRow intent, string returnUrl, string notifyUrl, string backUrl);
    /// <summary>Checks the signature of a callback posted by the gateway.</summary>
    bool VerifyCallback(IReadOnlyDictionary<string, string> form);
    /// <summary>Asks the gateway directly whether the trade is paid (never trust the browser post alone).</summary>
    Task<GatewayTradeStatus> QueryAsync(string merchantTradeNo, CancellationToken ct);
}

public sealed class PaymentService(ICustomerRepository repo, ISettings settings, ICurrentUser current, IPaymentGateway gateway, PaymentOptions options)
{
    private async Task<(int Deposit, int DueDays)> RulesAsync(CancellationToken ct)
    {
        var partial = await settings.GetBoolAsync("Feature.PartialPayment", true, ct);
        return (partial ? await settings.GetIntAsync("Payment.DepositPercent", 30, ct) : 0, await settings.GetIntAsync("Payment.BalanceDueDays", 14, ct));
    }

    public async Task<PaymentSummary> SummaryAsync(string orderType, int orderId, CancellationToken ct)
    {
        if (orderType is not ("Tour" or "Service")) throw AppException.Validation("orderType", "Use Tour or Service.");
        var (deposit, due) = await RulesAsync(ct);
        return await repo.PaymentSummaryAsync(orderType, orderId, current.RequireUserId(), deposit, due, ct);
    }

    /// <summary>Creates the intent (amount computed in SQL) and either completes it (simulated) or returns the gateway form.</summary>
    public async Task<CheckoutResponse> CheckoutAsync(CheckoutRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(r.OrderType is "Tour" or "Service", "orderType", "Use Tour or Service.")
            .Check(r.OrderId > 0, "orderId", "Choose a booking.")
            .Check(r.Mode is "Deposit" or "Balance" or "Full", "mode", "Choose deposit, balance or full payment.")
            .ThrowIfAny();
        var (deposit, due) = await RulesAsync(ct);
        var intent = await repo.CreateIntentAsync(r.OrderType, r.OrderId, current.RequireUserId(), r.Mode, deposit, due, gateway.Name, current.CorrelationId, ct);
        var site = options.PublicBaseUrl.TrimEnd('/');
        var form = gateway.BuildCheckout(intent,
            returnUrl: $"{site}/api/v1/payments/ecpay/result",
            notifyUrl: $"{site}/api/v1/payments/ecpay/notify",
            backUrl: $"{site}/my/bookings");
        if (form is null)
        {
            var done = await repo.CompleteIntentAsync(intent.MerchantTradeNo, true, intent.Amount, "SIM-" + intent.MerchantTradeNo, "Simulated payment", "Card", due, current.CorrelationId, ct);
            return new CheckoutResponse(gateway.Name, done.MerchantTradeNo, done.Amount, true, null, null);
        }
        return new CheckoutResponse(gateway.Name, intent.MerchantTradeNo, intent.Amount, false, form.Value.Action, form.Value.Fields);
    }

    /// <summary>
    /// Handles the gateway's callback (browser return or server notify). The signature is checked, then the trade is confirmed
    /// with the gateway's query API before anything is recorded. Returns the intent after completion, or null when the callback is invalid.
    /// </summary>
    public async Task<PaymentIntentRow?> HandleCallbackAsync(IReadOnlyDictionary<string, string> form, CancellationToken ct)
    {
        if (!gateway.VerifyCallback(form) || !form.TryGetValue("MerchantTradeNo", out var tradeNo)) return null;
        var intent = await repo.GetIntentAsync(tradeNo, ct);
        if (intent is null) return null;
        if (intent.Status != "Pending") return intent;
        var (_, due) = await RulesAsync(ct);
        var status = await gateway.QueryAsync(tradeNo, ct);
        return await repo.CompleteIntentAsync(tradeNo, status.Paid && status.Amount == intent.Amount, status.Amount, status.ProviderTradeNo, status.Message, status.Method, due, current.CorrelationId, ct);
    }

    /// <summary>Lets the customer re-check a checkout they returned from (for example when the browser post-back was lost).</summary>
    public async Task<PaymentIntentRow> RefreshAsync(string tradeNo, CancellationToken ct)
    {
        var intent = await repo.GetIntentAsync(tradeNo, ct);
        if (intent is null || intent.CustomerUserId != current.RequireUserId()) throw AppException.NotFound("Payment");
        if (intent.Status != "Pending" || gateway.Name == "Simulated") return intent;
        var (_, due) = await RulesAsync(ct);
        var status = await gateway.QueryAsync(tradeNo, ct);
        if (!status.Paid) return intent;   // still waiting (for example an ATM transfer not made yet)
        return await repo.CompleteIntentAsync(tradeNo, status.Amount == intent.Amount, status.Amount, status.ProviderTradeNo, status.Message, status.Method, due, current.CorrelationId, ct);
    }
}
