using Divakar.Sanpu.Core.Api;
using Divakar.Sanpu.Erp.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Divakar.Sanpu.Erp.Api;

/// <summary>Customer payments (deposit, balance or full) through the configured gateway (ECPay in Taiwan, or the simulated provider).</summary>
[ApiController, Route("api/v1/payments"), Tags("Payments")]
public sealed class PaymentsController(PaymentService payments, ILogger<PaymentsController> log) : ControllerBase
{
    [HttpGet("summary"), HasPermission("Booking.ViewOwn")]
    public Task<PaymentSummary> Summary([FromQuery] string orderType, [FromQuery] int orderId, CancellationToken ct) => payments.SummaryAsync(orderType, orderId, ct);

    /// <summary>Starts a checkout. The amount is computed on the server. For ECPay the response holds the signed form to POST to the hosted page.</summary>
    [HttpPost("checkout"), HasPermission("Booking.ViewOwn"), EnableRateLimiting("auth")]
    public Task<CheckoutResponse> Checkout(CheckoutRequest r, CancellationToken ct) => payments.CheckoutAsync(r, ct);

    /// <summary>Re-checks a pending checkout with the gateway (for example after an ATM transfer).</summary>
    [HttpPost("{tradeNo}/refresh"), HasPermission("Booking.ViewOwn")]
    public Task<PaymentIntentRow> Refresh(string tradeNo, CancellationToken ct) => payments.RefreshAsync(tradeNo, ct);

    /// <summary>ECPay browser return (OrderResultURL). Verified by signature + QueryTradeInfo, then the customer is sent back to My bookings.</summary>
    [HttpPost("ecpay/result"), AllowAnonymous, Consumes("application/x-www-form-urlencoded"), ApiExplorerSettings(IgnoreApi = true)]
    public async Task<IActionResult> EcpayResult(CancellationToken ct)
    {
        var intent = await HandleAsync(ct);
        var outcome = intent is null ? "invalid" : intent.Status.ToLowerInvariant();
        return Redirect($"/my/bookings?payment={outcome}&ref={Uri.EscapeDataString(intent?.OrderRef ?? "")}&trade={Uri.EscapeDataString(intent?.MerchantTradeNo ?? "")}");
    }

    /// <summary>ECPay server notification (ReturnURL). Must answer "1|OK" when handled. Only reachable when the API has a public URL.</summary>
    [HttpPost("ecpay/notify"), AllowAnonymous, Consumes("application/x-www-form-urlencoded"), ApiExplorerSettings(IgnoreApi = true)]
    public async Task<ContentResult> EcpayNotify(CancellationToken ct) => Content(await HandleAsync(ct) is null ? "0|ERR" : "1|OK", "text/plain");

    private async Task<PaymentIntentRow?> HandleAsync(CancellationToken ct)
    {
        var form = (await Request.ReadFormAsync(ct)).ToDictionary(k => k.Key, k => k.Value.ToString());
        var intent = await payments.HandleCallbackAsync(form, ct);
        if (intent is null) log.LogWarning("Rejected payment callback for trade {Trade}", form.GetValueOrDefault("MerchantTradeNo"));
        return intent;
    }
}
