using Divakar.Sanpu.AiOps.Application;
using Divakar.Sanpu.Core.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Divakar.Sanpu.AiOps.Api;

/// <summary>Traveler payments on assistant bookings (deposit, balance or full) through the configured gateway (ECPay, or the simulated provider).</summary>
[ApiController, Route("api/v1"), Tags("Payments")]
public sealed class ReservationPaymentsController(ReservationPaymentService payments, ILogger<ReservationPaymentsController> log) : ControllerBase
{
    /// <summary>Starts a checkout. The amount is computed on the server. For ECPay the response holds the signed form to POST to the hosted page.</summary>
    [HttpPost("my/bookings/{id:int}/checkout"), HasPermission("Reservation.ViewOwn"), EnableRateLimiting("auth")]
    public Task<ReservationCheckoutResponse> Checkout(int id, PayRequest r, CancellationToken ct) => payments.CheckoutAsync(id, r, ct);

    /// <summary>Re-checks a pending checkout with the gateway.</summary>
    [HttpPost("payments/{tradeNo}/refresh"), HasPermission("Reservation.ViewOwn")]
    public Task<ReservationPaymentRow> Refresh(string tradeNo, CancellationToken ct) => payments.RefreshAsync(tradeNo, ct);

    /// <summary>ECPay browser return (OrderResultURL). Verified by signature + QueryTradeInfo, then the traveler is sent back to My bookings.</summary>
    [HttpPost("payments/ecpay/result"), AllowAnonymous, Consumes("application/x-www-form-urlencoded"), ApiExplorerSettings(IgnoreApi = true)]
    public async Task<IActionResult> EcpayResult(CancellationToken ct)
    {
        var payment = await HandleAsync(ct);
        var outcome = payment is null ? "invalid" : payment.Status.ToLowerInvariant();
        return Redirect($"/my/bookings?payment={outcome}&ref={Uri.EscapeDataString(payment?.OrderRef ?? "")}&trade={Uri.EscapeDataString(payment?.MerchantTradeNo ?? "")}");
    }

    /// <summary>ECPay server notification (ReturnURL). Must answer "1|OK" when handled.</summary>
    [HttpPost("payments/ecpay/notify"), AllowAnonymous, Consumes("application/x-www-form-urlencoded"), ApiExplorerSettings(IgnoreApi = true)]
    public async Task<ContentResult> EcpayNotify(CancellationToken ct) => Content(await HandleAsync(ct) is null ? "0|ERR" : "1|OK", "text/plain");

    /// <summary>Staff: every payment attempt on assistant bookings, paid, pending or failed.</summary>
    [HttpGet("aiops/payments"), HasPermission("Reservation.View")]
    public Task<IReadOnlyList<ReservationPaymentRow>> All([FromQuery] string? status, CancellationToken ct) => payments.AllAsync(status, ct);

    private async Task<ReservationPaymentRow?> HandleAsync(CancellationToken ct)
    {
        var form = (await Request.ReadFormAsync(ct)).ToDictionary(k => k.Key, k => k.Value.ToString());
        var payment = await payments.HandleCallbackAsync(form, ct);
        if (payment is null) log.LogWarning("Rejected payment callback for trade {Trade}", form.GetValueOrDefault("MerchantTradeNo"));
        return payment;
    }
}
