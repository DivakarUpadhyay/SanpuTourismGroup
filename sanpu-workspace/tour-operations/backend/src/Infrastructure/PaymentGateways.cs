using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Web;
using Divakar.Sanpu.Erp.Application;

namespace Divakar.Sanpu.Erp.Infrastructure;

/// <summary>Completes payments instantly without a redirect. Used by automated tests and when no gateway keys are configured.</summary>
public sealed class SimulatedPaymentGateway : IPaymentGateway
{
    public string Name => "Simulated";
    public (string Action, IReadOnlyDictionary<string, string> Fields)? BuildCheckout(PaymentIntentRow intent, string returnUrl, string notifyUrl, string backUrl) => null;
    public bool VerifyCallback(IReadOnlyDictionary<string, string> form) => false;
    public Task<GatewayTradeStatus> QueryAsync(string merchantTradeNo, CancellationToken ct) => Task.FromResult(new GatewayTradeStatus(false, 0, null, null, "Simulated provider has no callbacks"));
}

/// <summary>
/// ECPay (綠界科技) all-in-one checkout (AioCheckOut V5). The browser posts a signed form to ECPay's hosted page; ECPay posts the result
/// back (OrderResultURL in the browser, ReturnURL server to server). Every callback is verified with CheckMacValue (SHA256) and then
/// confirmed with QueryTradeInfo before the payment is recorded.
/// </summary>
public sealed class EcpayPaymentGateway(HttpClient http, PaymentOptions options, Microsoft.Extensions.Logging.ILogger<EcpayPaymentGateway> log) : IPaymentGateway
{
    private static readonly TimeZoneInfo Taipei = TimeZoneInfo.CreateCustomTimeZone("Taipei", TimeSpan.FromHours(8), "Taipei", "Taipei");
    private EcpayOptions E => options.Ecpay;
    public string Name => "ECPay";

    public (string Action, IReadOnlyDictionary<string, string> Fields)? BuildCheckout(PaymentIntentRow intent, string returnUrl, string notifyUrl, string backUrl)
    {
        var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Taipei);
        var item = Clean($"{intent.ItemName ?? intent.OrderRef} ({intent.Mode.ToLowerInvariant()} payment) x 1");
        var fields = new Dictionary<string, string>
        {
            ["MerchantID"] = E.MerchantId,
            ["MerchantTradeNo"] = intent.MerchantTradeNo,
            ["MerchantTradeDate"] = now.ToString("yyyy/MM/dd HH:mm:ss", CultureInfo.InvariantCulture),
            ["PaymentType"] = "aio",
            ["TotalAmount"] = decimal.ToInt32(decimal.Round(intent.Amount, 0)).ToString(CultureInfo.InvariantCulture),
            ["TradeDesc"] = Clean($"Sanpu booking {intent.OrderRef}"),
            ["ItemName"] = item,
            ["ReturnURL"] = notifyUrl,
            ["OrderResultURL"] = returnUrl,
            ["ClientBackURL"] = backUrl,
            ["ChoosePayment"] = "ALL",
            ["EncryptType"] = "1",
            ["CustomField1"] = intent.OrderRef
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
        var macOk = !r.ContainsKey("CheckMacValue") || VerifyCallback(r);
        Microsoft.Extensions.Logging.LoggerExtensions.LogInformation(log, "ECPay query {Trade}: TradeStatus={Status} TradeAmt={Amt} PaymentType={Type} MacOk={Mac} Keys={Keys}",
            merchantTradeNo, r.GetValueOrDefault("TradeStatus"), r.GetValueOrDefault("TradeAmt"), r.GetValueOrDefault("PaymentType"), macOk, string.Join(",", r.Keys));
        if (!macOk) return new GatewayTradeStatus(false, 0, null, null, "Query response signature invalid");
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
