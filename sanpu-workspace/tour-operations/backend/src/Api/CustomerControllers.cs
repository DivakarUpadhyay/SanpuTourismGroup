using Divakar.Sanpu.Core.Api;
using Divakar.Sanpu.Erp.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Divakar.Sanpu.Erp.Api;

/* ======================= customer-facing ======================= */

[ApiController, Route("api/v1/help"), Tags("Help & contact"), AllowAnonymous]
public sealed class HelpController(HelpContactService help) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<HelpArticleRow>> List([FromQuery] string? search, CancellationToken ct) => help.HelpAsync(search, ct);

    [HttpPost("{id:int}/feedback"), EnableRateLimiting("public")]
    public async Task<IActionResult> Feedback(int id, HelpFeedbackRequest r, CancellationToken ct) { await help.FeedbackAsync(id, r, ct); return NoContent(); }

    /// <summary>Contact form. Opens a staff task due within Contact.SlaHours (booking/payment topics are High priority).</summary>
    [HttpPost("/api/v1/contact"), EnableRateLimiting("auth")]
    public async Task<IActionResult> Contact(ContactRequest r, CancellationToken ct) => StatusCode(201, await help.ContactAsync(r, ct));
}

[ApiController, Route("api/v1/discover"), Tags("Discovery"), AllowAnonymous]
public sealed class DiscoveryController(DiscoveryService discovery) : ControllerBase
{
    /// <summary>Records a tour page view (signed-in views feed personal recommendations; one per 30 minutes per tour).</summary>
    [HttpPost("tours/{code}/view")]
    public async Task<IActionResult> View(string code, CancellationToken ct) { await discovery.RecordViewAsync(code, ct); return NoContent(); }

    /// <summary>Scored recommendations with a reason each. Personal when signed in, popular otherwise.</summary>
    [HttpGet("recommendations")]
    public Task<IReadOnlyList<RecommendationRow>> Recommend([FromQuery] string? exclude, [FromQuery] int? max, CancellationToken ct) => discovery.RecommendAsync(exclude, max, ct);

    [HttpGet("calendar")]
    public Task<IReadOnlyList<CalendarRow>> Calendar([FromQuery] string? month, CancellationToken ct) => discovery.CalendarAsync(month, ct);

    [HttpGet("compare")]
    public Task<IReadOnlyList<CompareRow>> Compare([FromQuery] string? codes, CancellationToken ct) => discovery.CompareAsync(codes, ct);

    [HttpGet("destinations/{code}")]
    public Task<DestinationGuide> Destination(string code, CancellationToken ct) => discovery.DestinationAsync(code, ct);
}

[ApiController, Route("api/v1/marketing"), Tags("Deals"), AllowAnonymous]
public sealed class MarketingController(MarketingService marketing) : ControllerBase
{
    [HttpGet("promotions")]
    public Task<IReadOnlyList<PromotionRow>> Promotions([FromQuery] string placement, CancellationToken ct) => marketing.ActiveAsync(placement, ct);

    [HttpPost("promotions/{id:int}/track"), EnableRateLimiting("public")]
    public async Task<IActionResult> Track(int id, PromotionTrackRequest r, CancellationToken ct) { await marketing.TrackAsync(id, r, ct); return NoContent(); }

    [HttpGet("coupons")]
    public Task<IReadOnlyList<PublicCouponRow>> Coupons(CancellationToken ct) => marketing.PublicCouponsAsync(ct);

    /// <summary>Discount preview before booking. The booking itself re-checks the coupon inside its transaction.</summary>
    [HttpPost("coupons/check"), EnableRateLimiting("public")]
    public Task<CouponCheckRow> Check(CouponCheckRequest r, CancellationToken ct) => marketing.CheckAsync(r, ct);
}

[ApiController, Route("api/v1/travel"), Tags("Hotels, flights, buses & taxis")]
public sealed class TravelController(TravelServicesService travel) : ControllerBase
{
    [HttpGet("places"), AllowAnonymous]
    public Task<IReadOnlyList<PlaceRow>> Places([FromQuery] string? kind, CancellationToken ct) => travel.PlacesAsync(kind, ct);

    /// <summary>Detail page data: description, facts, gallery, a 45-day price/availability calendar from `from`, and similar options.</summary>
    [HttpGet("services/{code}"), AllowAnonymous]
    public Task<ServiceDetail> Detail(string code, [FromQuery] DateTime? from, CancellationToken ct) => travel.DetailAsync(code, from, ct);

    /// <summary>Availability search. Hotels need check-in (date) and check-out (endDate); prices are totals for all nights.</summary>
    [HttpGet("search"), AllowAnonymous]
    public Task<IReadOnlyList<ServiceResultRow>> Search([FromQuery] string kind, [FromQuery] string? from, [FromQuery] string? to, [FromQuery] DateTime? date, [FromQuery] DateTime? endDate,
        [FromQuery] int? units, [FromQuery] int? travelers, [FromQuery] string? sort, CancellationToken ct) => travel.SearchAsync(kind, from, to, date, endDate, units, travelers, sort, ct);

    /// <summary>Instant booking: locks inventory, applies a coupon, confirms. Same idempotency key returns the same booking.</summary>
    [HttpPost("bookings"), HasPermission("Booking.Create")]
    public async Task<IActionResult> Book(ServiceBookRequest r, CancellationToken ct) => StatusCode(201, await travel.BookAsync(r, ct));

    [HttpGet("my/bookings"), HasPermission("Booking.ViewOwn")]
    public Task<IReadOnlyList<MyServiceBookingRow>> Mine(CancellationToken ct) => travel.MineAsync(ct);

    [HttpPost("my/bookings/{id:int}/cancel"), HasPermission("Booking.ViewOwn")]
    public async Task<IActionResult> Cancel(int id, CancellationToken ct) { await travel.CancelAsync(id, ct); return NoContent(); }
}

/* ======================= staff ======================= */

[ApiController, Route("api/v1/ops/marketing"), Tags("Marketing (staff)")]
public sealed class OpsMarketingController(MarketingService marketing) : ControllerBase
{
    [HttpGet("promotions"), HasPermission("Marketing.View|Marketing.Manage")]
    public Task<IReadOnlyList<OpsPromotionRow>> Promotions(CancellationToken ct) => marketing.OpsPromotionsAsync(ct);

    [HttpPost("promotions"), HasPermission("Marketing.Manage")]
    public async Task<object> SavePromotion(PromotionRequest r, CancellationToken ct) => new { promotionId = await marketing.SavePromotionAsync(r, ct) };

    [HttpGet("coupons"), HasPermission("Marketing.View|Marketing.Manage")]
    public Task<IReadOnlyList<OpsCouponRow>> Coupons(CancellationToken ct) => marketing.OpsCouponsAsync(ct);

    [HttpPost("coupons"), HasPermission("Marketing.Manage")]
    public async Task<object> SaveCoupon(CouponRequest r, CancellationToken ct) => new { couponId = await marketing.SaveCouponAsync(r, ct) };

    [HttpGet("coupons/{id:int}/redemptions"), HasPermission("Marketing.View|Marketing.Manage")]
    public Task<IReadOnlyList<RedemptionRow>> Redemptions(int id, CancellationToken ct) => marketing.RedemptionsAsync(id, ct);
}

[ApiController, Route("api/v1/ops/help"), Tags("Help & contact (staff)")]
public sealed class OpsHelpController(HelpContactService help) : ControllerBase
{
    [HttpGet("articles"), HasPermission("Help.Manage")]
    public Task<IReadOnlyList<OpsHelpArticleRow>> Articles(CancellationToken ct) => help.OpsHelpAsync(ct);

    [HttpPost("articles"), HasPermission("Help.Manage")]
    public async Task<object> Save(HelpArticleRequest r, CancellationToken ct) => new { articleId = await help.SaveHelpAsync(r, ct) };

    [HttpGet("contacts"), HasPermission("Contact.Manage")]
    public Task<IReadOnlyList<ContactListRow>> Contacts([FromQuery] string? status, CancellationToken ct) => help.ContactsAsync(status, ct);

    [HttpPost("contacts/{id:int}/status"), HasPermission("Contact.Manage")]
    public async Task<IActionResult> SetStatus(int id, ContactStatusRequest r, CancellationToken ct) { await help.SetContactStatusAsync(id, r, ct); return NoContent(); }
}

[ApiController, Route("api/v1/ops/services"), Tags("Travel services (staff)")]
public sealed class OpsServicesController(TravelServicesService travel) : ControllerBase
{
    [HttpGet, HasPermission("Service.View|Service.Manage")]
    public Task<IReadOnlyList<OpsServiceRow>> List([FromQuery] string? kind, [FromQuery] string? search, CancellationToken ct) => travel.OpsServicesAsync(kind, search, ct);

    [HttpPost, HasPermission("Service.Manage")]
    public async Task<object> Save(ServiceRequest r, CancellationToken ct) => new { serviceId = await travel.SaveServiceAsync(r, ct) };

    [HttpGet("{id:int}/inventory"), HasPermission("Service.View|Service.Manage")]
    public Task<IReadOnlyList<InventoryRow>> Inventory(int id, [FromQuery] DateTime? from, CancellationToken ct) => travel.InventoryAsync(id, from, ct);

    /// <summary>Open, re-price or close a date range. Capacity cannot drop below units already sold.</summary>
    [HttpPost("{id:int}/inventory"), HasPermission("Service.Manage")]
    public async Task<IActionResult> SetInventory(int id, InventoryRangeRequest r, CancellationToken ct) { await travel.SetInventoryAsync(id, r, ct); return NoContent(); }

    [HttpGet("bookings"), HasPermission("Service.View|Service.Manage")]
    public Task<IReadOnlyList<OpsServiceBookingRow>> Bookings([FromQuery] string? kind, [FromQuery] string? search, CancellationToken ct) => travel.OpsBookingsAsync(kind, search, ct);

    [HttpGet("places"), HasPermission("Service.View|Service.Manage")]
    public Task<IReadOnlyList<PlaceRow>> Places(CancellationToken ct) => travel.PlacesAsync(null, ct);
}
