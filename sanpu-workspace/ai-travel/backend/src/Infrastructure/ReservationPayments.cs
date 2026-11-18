using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Web;
using Divakar.Sanpu.AiOps.Application;
using Divakar.Sanpu.Core.Infrastructure;

namespace Divakar.Sanpu.AiOps.Infrastructure;

public sealed class ReservationPaymentRepository(Db db) : IReservationPaymentRepository
{
    public async Task<ReservationPaymentRow> CreateAsync(int reservationId, Guid traveler, string mode, int depositPercent, string provider, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<ReservationPaymentRow>("dbo.usp_ReservationPayment_Create", new { ReservationId = reservationId, TravelerUserId = traveler, Mode = mode, DepositPercent = depositPercent, Provider = provider, CorrelationId = correlationId }, ct))!;
    public Task<ReservationPaymentRow?> GetAsync(string tradeNo, CancellationToken ct) => db.QuerySingleAsync<ReservationPaymentRow>("dbo.usp_ReservationPayment_Get", new { MerchantTradeNo = tradeNo }, ct);
    public async Task<ReservationPaymentRow> CompleteAsync(string tradeNo, bool paid, string? providerTradeNo, string? method, string? message, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<ReservationPaymentRow>("dbo.usp_ReservationPayment_Complete", new { MerchantTradeNo = tradeNo, Paid = paid, ProviderTradeNo = providerTradeNo, PaymentMethod = method, Message = message, CorrelationId = correlationId }, ct))!;
    public Task<IReadOnlyList<ReservationPaymentRow>> AllAsync(string? status, CancellationToken ct) => db.QueryAsync<ReservationPaymentRow>("dbo.usp_ReservationPayment_ListAll", new { Status = status }, ct);
}

/// <summary>Completes payments instantly without a redirect. Used by automated tests and when no gateway keys are configured.</summary>
public sealed class SimulatedPaymentGateway : IPaymentGateway
{
    public string Name => "Simulated";
    public (string Action, IReadOnlyDictionary<string, string> Fields)? BuildCheckout(ReservationPaymentRow payment, string returnUrl, string notifyUrl, string backUrl) => null;
    public bool VerifyCallback(IReadOnlyDictionary<string, string> form) => false;
    public Task<GatewayTradeStatus> QueryAsync(string merchantTradeNo, CancellationToken ct) => Task.FromResult(new GatewayTradeStatus(false, 0, null, null, "Simulated provider has no callbacks"));
}

/// <summary>
/// ECPay all-in-one checkout (AioCheckOut V5), card only so the result is known at once. The browser posts a signed form to ECPay's hosted page;
/// ECPay posts the result back (OrderResultURL in the browser, ReturnURL server to server). Every callback is verified with CheckMacValue (SHA256)
/// and then confirmed with QueryTradeInfo before the payment is recorded.
/// </summary>
public sealed class EcpayPaymentGateway(HttpClient http, PaymentOptions options) : IPaymentGateway
{
    private static readonly TimeZoneInfo Taipei = TimeZoneInfo.CreateCustomTimeZone("Taipei", TimeSpan.FromHours(8), "Taipei", "Taipei");
    private EcpayOptions E => options.Ecpay;
    public string Name => "ECPay";

    public (string Action, IReadOnlyDictionary<string, string> Fields)? BuildCheckout(ReservationPaymentRow payment, string returnUrl, string notifyUrl, string backUrl)
    {
        var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Taipei);
        var fields = new Dictionary<string, string>
        {
            ["MerchantID"] = E.MerchantId,
            ["MerchantTradeNo"] = payment.MerchantTradeNo,
            ["MerchantTradeDate"] = now.ToString("yyyy/MM/dd HH:mm:ss", CultureInfo.InvariantCulture),
            ["PaymentType"] = "aio",
            ["TotalAmount"] = decimal.ToInt32(decimal.Round(payment.Amount, 0)).ToString(CultureInfo.InvariantCulture),
            ["TradeDesc"] = Clean($"Sanpu AI Travel booking {payment.OrderRef}"),
            ["ItemName"] = Clean($"{payment.ItemName} ({payment.Mode.ToLowerInvariant()} payment) x 1"),
            ["ReturnURL"] = notifyUrl,
            ["OrderResultURL"] = returnUrl,
            ["ClientBackURL"] = backUrl,
            ["ChoosePayment"] = "Credit",
            ["EncryptType"] = "1",
            ["CustomField1"] = payment.OrderRef
        };
        fields["CheckMacValue"] = CheckMac(fields);
        return (E.CheckoutUrl, fields);
    }

    public bool VerifyCallback(IReadOnlyDictionary<string, string> form) =>
        form.TryGetValue("CheckMacValue", out var mac) && form.TryGetValue("MerchantID", out var mid) && mid == E.MerchantId
        && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(CheckMac(form)), Encoding.ASCII.GetBytes(mac.ToUpperInvariant()));

    public async Task<GatewayTradeStatus> QueryAsync(string merchantTradeNo, CancellationToken ct)
    {
        var q = new Dictionary<string, string>
        {
            ["MerchantID"] = E.MerchantId,
            ["MerchantTradeNo"] = merchantTradeNo,
            ["TimeStamp"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture)
        };
        q["CheckMacValue"] = CheckMac(q);
        using var res = await http.PostAsync(E.QueryUrl, new FormUrlEncodedContent(q), ct);
        res.EnsureSuccessStatusCode();
        var body = HttpUtility.ParseQueryString(await res.Content.ReadAsStringAsync(ct));
        var r = body.AllKeys.Where(k => k is not null).ToDictionary(k => k!, k => body[k] ?? "");
        if (r.ContainsKey("CheckMacValue") && !VerifyCallback(r)) return new GatewayTradeStatus(false, 0, null, null, "Query response signature invalid");
        var paid = r.GetValueOrDefault("TradeStatus") == "1";
        decimal.TryParse(r.GetValueOrDefault("TradeAmt"), NumberStyles.Number, CultureInfo.InvariantCulture, out var amount);
        return new GatewayTradeStatus(paid, amount, r.GetValueOrDefault("TradeNo"), r.GetValueOrDefault("PaymentType"), paid ? "Paid" : "TradeStatus " + r.GetValueOrDefault("TradeStatus"));
    }

    /// <summary>ECPay CheckMacValue: sort keys A–Z, wrap with HashKey/HashIV, URL-encode (lower case, .NET rules), SHA256, upper-case hex.</summary>
    internal string CheckMac(IEnumerable<KeyValuePair<string, string>> fields)
    {
        var sorted = fields.Where(f => !f.Key.Equals("CheckMacValue", StringComparison.OrdinalIgnoreCase)).OrderBy(f => f.Key, StringComparer.OrdinalIgnoreCase);
        var raw = $"HashKey={E.HashKey}&{string.Join("&", sorted.Select(f => $"{f.Key}={f.Value}"))}&HashIV={E.HashIv}";
        var encoded = HttpUtility.UrlEncode(raw).ToLowerInvariant();
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(encoded)));
    }

    // ECPay rejects some characters in ItemName/TradeDesc; keep it to plain text.
    private static string Clean(string s)
    {
        var t = new string(s.Where(c => char.IsLetterOrDigit(c) || " -()._,".Contains(c)).ToArray()).Trim();
        return t[..Math.Min(t.Length, 190)];
    }
}
