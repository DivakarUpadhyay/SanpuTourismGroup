using System.Text.RegularExpressions;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Domain;

namespace Divakar.Sanpu.Erp.Application;

/// <summary>Allowed values shared by validators and the UI.</summary>
public static class CustomerRules
{
    public static readonly string[] ContactTopics = ["Booking", "Change", "Payment", "Feedback", "Partnership", "Other"];
    public static readonly string[] ContactStatuses = ["Open", "Answered", "Closed"];
    public static readonly string[] Placements = ["HomeHero", "HomeStrip", "Deals", "Checkout"];
    public static readonly string[] ServiceKinds = ["Hotel", "Flight", "Bus", "Taxi"];
    public static readonly string[] CouponKinds = ["Tour", "Hotel", "Flight", "Bus", "Taxi"];
    public static readonly string[] CouponAppliesTo = ["All", "Tour", "Hotel", "Flight", "Bus", "Taxi"];
    public static bool IsSitePath(string? v) => string.IsNullOrWhiteSpace(v) || (v.StartsWith('/') && !v.StartsWith("//") && v.Length <= 300);
    public static bool IsImagePath(string? v) => string.IsNullOrWhiteSpace(v) || Regex.IsMatch(v, @"^/images/[a-z0-9/_\-]+\.(svg|png|jpg|jpeg|webp)$") || Regex.IsMatch(v, @"^/api/v1/media/[a-f0-9]{32}\.(jpg|png|webp)$");
    public static bool IsCouponCode(string? v) => !string.IsNullOrWhiteSpace(v) && Regex.IsMatch(v.Trim(), "^[A-Za-z0-9-]{3,30}$");
}

public sealed class HelpContactService(ICustomerRepository repo, ISettings settings, ICurrentUser current)
{
    public Task<IReadOnlyList<HelpArticleRow>> HelpAsync(string? search, CancellationToken ct) =>
        repo.HelpAsync(string.IsNullOrWhiteSpace(search) ? null : search.Trim()[..Math.Min(search.Trim().Length, 100)], ct);

    public Task FeedbackAsync(int id, HelpFeedbackRequest r, CancellationToken ct) => repo.HelpFeedbackAsync(id, r.Helpful, ct);

    public async Task<ContactCreatedRow> ContactAsync(ContactRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(!string.IsNullOrWhiteSpace(r.Name) && r.Name.Trim().Length is >= 2 and <= 100, "name", "Enter your name (2–100 characters).")
            .Check(EmailAddress.IsValid(r.Email ?? "") && r.Email!.Length <= 256, "email", "Enter a valid email address.")
            .Check(CustomerRules.ContactTopics.Contains(r.Topic), "topic", "Choose a topic.")
            .Check(string.IsNullOrWhiteSpace(r.BookingRef) || Regex.IsMatch(r.BookingRef.Trim(), "^(BK|SB)-\\d{6}$"), "bookingRef", "Use a booking reference like BK-000123 or SB-000045.")
            .Check(!string.IsNullOrWhiteSpace(r.Message) && r.Message.Trim().Length is >= 10 and <= 2000, "message", "Write 10–2000 characters.")
            .ThrowIfAny();
        var sla = await settings.GetIntAsync("Contact.SlaHours", 24, ct);
        return await repo.CreateContactAsync(current.UserId, r with { Name = r.Name.Trim(), Email = r.Email!.Trim(), BookingRef = r.BookingRef?.Trim().ToUpperInvariant(), Message = r.Message.Trim() },
            sla, current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<OpsHelpArticleRow>> OpsHelpAsync(CancellationToken ct) => repo.OpsHelpAsync(ct);

    public Task<int> SaveHelpAsync(HelpArticleRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(!string.IsNullOrWhiteSpace(r.Category) && r.Category.Length <= 50, "category", "Enter a category (up to 50 characters).")
            .Check(!string.IsNullOrWhiteSpace(r.Question) && r.Question.Length is >= 5 and <= 200, "question", "Write a question (5–200 characters).")
            .Check(!string.IsNullOrWhiteSpace(r.Answer) && r.Answer.Length is >= 10 and <= 2000, "answer", "Write an answer (10–2000 characters).")
            .Check(r.SortOrder is >= 0 and <= 9999, "sortOrder", "Use 0–9999.")
            .ThrowIfAny();
        return repo.SaveHelpAsync(r, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<ContactListRow>> ContactsAsync(string? status, CancellationToken ct) =>
        repo.ContactsAsync(CustomerRules.ContactStatuses.Contains(status) ? status : null, ct);

    public Task SetContactStatusAsync(int id, ContactStatusRequest r, CancellationToken ct)
    {
        if (!CustomerRules.ContactStatuses.Contains(r.Status)) throw AppException.Validation("status", "Use Open, Answered or Closed.");
        return repo.SetContactStatusAsync(id, r.Status, current.RequireUserId(), current.CorrelationId, ct);
    }
}

public sealed class DiscoveryService(ICustomerRepository repo, ISettings settings, ICurrentUser current)
{
    public Task RecordViewAsync(string code, CancellationToken ct) => repo.RecordTourViewAsync(code, current.UserId, ct);

    /// <summary>Signed-in customers get personal recommendations; visitors get what is popular now.</summary>
    public async Task<IReadOnlyList<RecommendationRow>> RecommendAsync(string? exclude, int? max, CancellationToken ct)
    {
        var limit = Math.Clamp(max ?? await settings.GetIntAsync("Recommend.Max", 6, ct), 1, 12);
        return await repo.RecommendAsync(current.UserId, limit, string.IsNullOrWhiteSpace(exclude) ? null : exclude, ct);
    }

    public Task<IReadOnlyList<CalendarRow>> CalendarAsync(string? month, CancellationToken ct)
    {
        var m = DateTime.UtcNow.Date;
        if (!string.IsNullOrWhiteSpace(month) && !DateTime.TryParseExact(month + "-01", "yyyy-MM-dd", null, System.Globalization.DateTimeStyles.None, out m))
            throw AppException.Validation("month", "Use YYYY-MM.");
        return repo.CalendarAsync(m, ct);
    }

    public Task<IReadOnlyList<CompareRow>> CompareAsync(string? codes, CancellationToken ct)
    {
        var list = (codes ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Distinct().ToList();
        if (list.Count is < 2 or > 3 || list.Any(c => !Regex.IsMatch(c, "^[A-Za-z0-9-]{3,120}$"))) throw AppException.Validation("codes", "Choose 2 or 3 tours to compare.");
        return repo.CompareAsync(list, ct);
    }

    public async Task<DestinationGuide> DestinationAsync(string code, CancellationToken ct) =>
        await repo.DestinationAsync(code, ct) ?? throw AppException.NotFound("Destination");
}

public sealed class MarketingService(ICustomerRepository repo, ICurrentUser current)
{
    public Task<IReadOnlyList<PromotionRow>> ActiveAsync(string placement, CancellationToken ct)
    {
        if (!CustomerRules.Placements.Contains(placement)) throw AppException.Validation("placement", "Unknown placement.");
        return repo.ActivePromotionsAsync(placement, ct);
    }

    public Task TrackAsync(int id, PromotionTrackRequest r, CancellationToken ct)
    {
        if (r.Kind is not ("impression" or "click")) throw AppException.Validation("kind", "Use impression or click.");
        return repo.TrackPromotionAsync(id, r.Kind, ct);
    }

    public Task<IReadOnlyList<PublicCouponRow>> PublicCouponsAsync(CancellationToken ct) => repo.PublicCouponsAsync(ct);

    public Task<CouponCheckRow> CheckAsync(CouponCheckRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(CustomerRules.IsCouponCode(r.Code), "code", "Enter a coupon code (letters, digits and dashes).")
            .Check(CustomerRules.CouponKinds.Contains(r.Kind), "kind", "Unknown booking type.")
            .Check(r.Amount is > 0 and <= 10_000_000, "amount", "Amount must be positive.")
            .ThrowIfAny();
        return repo.CheckCouponAsync(r.Code.Trim().ToUpperInvariant(), current.UserId, r.Kind, r.Amount, ct);
    }

    public Task<IReadOnlyList<OpsPromotionRow>> OpsPromotionsAsync(CancellationToken ct) => repo.OpsPromotionsAsync(ct);

    public Task<int> SavePromotionAsync(PromotionRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(!string.IsNullOrWhiteSpace(r.Title) && r.Title.Length <= 120, "title", "Enter a title (up to 120 characters).")
            .Check((r.Subtitle?.Length ?? 0) <= 300, "subtitle", "Use at most 300 characters.")
            .Check(CustomerRules.Placements.Contains(r.Placement), "placement", "Choose where the banner shows.")
            .Check(CustomerRules.IsImagePath(r.ImageUrl), "imageUrl", "Use a site image path like /images/destinations/kinmen.svg.")
            .Check(CustomerRules.IsSitePath(r.CtaUrl), "ctaUrl", "Links must point inside this site and start with /.")
            .Check((r.CtaText?.Length ?? 0) <= 40, "ctaText", "Use at most 40 characters.")
            .Check(string.IsNullOrWhiteSpace(r.CouponCode) || CustomerRules.IsCouponCode(r.CouponCode), "couponCode", "Use an existing coupon code.")
            .Check(r.StartsAtUtc is not null, "startsAtUtc", "Choose a start date.")
            .Check(r.EndsAtUtc is not null && r.EndsAtUtc > r.StartsAtUtc, "endsAtUtc", "The end must be after the start.")
            .Check(r.Priority is >= 0 and <= 100, "priority", "Use 0–100.")
            .ThrowIfAny();
        return repo.SavePromotionAsync(r, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<OpsCouponRow>> OpsCouponsAsync(CancellationToken ct) => repo.OpsCouponsAsync(ct);

    public Task<int> SaveCouponAsync(CouponRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(CustomerRules.IsCouponCode(r.Code), "code", "Use 3–30 letters, digits or dashes.")
            .Check(!string.IsNullOrWhiteSpace(r.Description) && r.Description.Length <= 200, "description", "Describe the offer (up to 200 characters).")
            .Check(r.DiscountType is "Percent" or "Fixed", "discountType", "Choose Percent or Fixed.")
            .Check(r.DiscountValue > 0 && (r.DiscountType != "Percent" || r.DiscountValue <= 90), "discountValue", "Percent must be 1–90; a fixed amount must be positive.")
            .Check(r.MaxDiscount is null or > 0, "maxDiscount", "Leave empty or enter a positive cap.")
            .Check(r.MinAmount >= 0, "minAmount", "Use 0 or more.")
            .Check(CustomerRules.CouponAppliesTo.Contains(r.AppliesTo), "appliesTo", "Choose what the coupon applies to.")
            .Check(r.StartsAtUtc is not null, "startsAtUtc", "Choose a start date.")
            .Check(r.EndsAtUtc is not null && r.EndsAtUtc > r.StartsAtUtc, "endsAtUtc", "The end must be after the start.")
            .Check(r.UsageLimit is null or > 0, "usageLimit", "Leave empty for no limit, or enter a positive number.")
            .Check(r.PerCustomerLimit is >= 1 and <= 100, "perCustomerLimit", "Use 1–100.")
            .ThrowIfAny();
        return repo.SaveCouponAsync(r with { Code = r.Code.Trim().ToUpperInvariant() }, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<RedemptionRow>> RedemptionsAsync(int couponId, CancellationToken ct) => repo.RedemptionsAsync(couponId, ct);
}

public sealed class TravelServicesService(ICustomerRepository repo, ICurrentUser current, IPiiProtector pii)
{
    public Task<IReadOnlyList<PlaceRow>> PlacesAsync(string? kind, CancellationToken ct) =>
        repo.PlacesAsync(CustomerRules.ServiceKinds.Contains(kind) ? kind : null, ct);

    public Task<ServiceDetail> DetailAsync(string code, DateTime? from, CancellationToken ct)
    {
        if (!Regex.IsMatch(code ?? "", "^[A-Za-z0-9-]{3,120}$")) throw AppException.NotFound("Service");   // slug or code
        return repo.ServiceDetailAsync(code!, (from ?? DateTime.UtcNow.Date.AddDays(1)).Date, ct);
    }

    public Task<IReadOnlyList<ServiceResultRow>> SearchAsync(string kind, string? from, string? to, DateTime? date, DateTime? endDate, int? units, int? travelers, string? sort, CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        new FieldErrors()
            .Check(CustomerRules.ServiceKinds.Contains(kind), "kind", "Unknown service type.")
            .Check(date is not null && date.Value.Date > today && date.Value.Date <= today.AddDays(365), "date", "Choose a date from tomorrow up to a year ahead.")
            .Check(kind != "Hotel" || (endDate is not null && endDate > date && (endDate.Value - date!.Value).TotalDays <= 30), "endDate", "Check-out must be 1–30 nights after check-in.")
            .Check(units is null or >= 1 and <= 20, "units", "Use 1–20.")
            .Check(travelers is null or >= 1 and <= 60, "travelers", "Use 1–60.")
            .Check(string.IsNullOrWhiteSpace(from) || Regex.IsMatch(from, "^[A-Z0-9-]{2,10}$"), "from", "Unknown place.")
            .Check(string.IsNullOrWhiteSpace(to) || Regex.IsMatch(to, "^[A-Z0-9-]{2,10}$"), "to", "Unknown place.")
            .ThrowIfAny();
        return repo.SearchServicesAsync(kind, NullIfEmpty(from), NullIfEmpty(to), date!.Value.Date, endDate?.Date, units ?? 1, travelers ?? 1,
            sort is "rating" or "time" ? sort : "price", ct);
    }

    public Task<ServiceBookedRow> BookAsync(ServiceBookRequest r, CancellationToken ct)
    {
        TimeSpan? pickup = null;
        new FieldErrors()
            .Check(Regex.IsMatch(r.ServiceCode ?? "", "^[A-Z0-9-]{3,30}$"), "serviceCode", "Choose an option.")
            .Check(r.Date is not null && r.Date.Value.Date > DateTime.UtcNow.Date, "date", "Choose a future date.")
            .Check(r.Units is >= 1 and <= 20, "units", "Use 1–20.")
            .Check(r.Travelers is >= 1 and <= 60, "travelers", "Use 1–60.")
            .Check(!string.IsNullOrWhiteSpace(r.LeadName) && r.LeadName.Trim().Length is >= 2 and <= 100, "leadName", "Enter the lead traveler's name (2–100 characters).")
            .Check(Phone.IsValid(r.LeadPhone), "leadPhone", "Enter a phone number like +886912345678.")
            .Check((r.PickupAddress?.Length ?? 0) <= 200, "pickupAddress", "Use at most 200 characters.")
            .Check(string.IsNullOrWhiteSpace(r.PickupTime) || TimeSpan.TryParse(r.PickupTime, out var t) && (pickup = t) is not null, "pickupTime", "Use HH:mm.")
            .Check((r.Notes?.Length ?? 0) <= 500, "notes", "Use at most 500 characters.")
            .Check(string.IsNullOrWhiteSpace(r.CouponCode) || CustomerRules.IsCouponCode(r.CouponCode), "couponCode", "Enter a valid coupon code.")
            .Check(r.AcceptTerms, "acceptTerms", "Please accept the terms and privacy notice.")
            .Check(Regex.IsMatch(r.IdempotencyKey ?? "", "^[A-Za-z0-9\\-]{8,64}$"), "idempotencyKey", "Send an 8–64 character idempotency key.")
            .ThrowIfAny();
        return repo.BookServiceAsync(current.RequireUserId(), r with { LeadName = r.LeadName.Trim(), CouponCode = r.CouponCode?.Trim().ToUpperInvariant() },
            pii.Protect(r.LeadPhone.Trim()), Mask.Phone(r.LeadPhone), pickup, current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<MyServiceBookingRow>> MineAsync(CancellationToken ct) => repo.MyServiceBookingsAsync(current.RequireUserId(), ct);
    public Task CancelAsync(int id, CancellationToken ct) => repo.CancelServiceBookingAsync(id, current.RequireUserId(), current.CorrelationId, ct);

    public Task<IReadOnlyList<OpsServiceRow>> OpsServicesAsync(string? kind, string? search, CancellationToken ct) =>
        repo.OpsServicesAsync(CustomerRules.ServiceKinds.Contains(kind) ? kind : null, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), ct);

    public Task<int> SaveServiceAsync(ServiceRequest r, CancellationToken ct)
    {
        TimeSpan? depart = null;
        new FieldErrors()
            .Check(Regex.IsMatch(r.Code ?? "", "^[A-Z0-9-]{3,30}$"), "code", "Use 3–30 capital letters, digits or dashes.")
            .Check(CustomerRules.ServiceKinds.Contains(r.Kind), "kind", "Choose Hotel, Flight, Bus or Taxi.")
            .Check(!string.IsNullOrWhiteSpace(r.Name) && r.Name.Length <= 150, "name", "Enter a name (up to 150 characters).")
            .Check(r.FromPlaceId > 0, "fromPlaceId", "Choose a place.")
            .Check(r.Kind == "Hotel" || r.ToPlaceId > 0, "toPlaceId", "Choose where it goes.")
            .Check(string.IsNullOrWhiteSpace(r.DepartTime) || TimeSpan.TryParse(r.DepartTime, out var t) && (depart = t) is not null, "departTime", "Use HH:mm.")
            .Check(r.DurationMin is null or > 0 and <= 1440, "durationMin", "Use 1–1440 minutes.")
            .Check(r.Capacity is >= 1 and <= 1000, "capacity", "Use 1–1000.")
            .Check(r.MaxPerBooking is >= 1 and <= 20, "maxPerBooking", "Use 1–20.")
            .Check(r.PeoplePerUnit is >= 1 and <= 20, "peoplePerUnit", "Use 1–20.")
            .Check(r.BasePrice is > 0 and <= 1_000_000, "basePrice", "Enter a positive price.")
            .Check(r.Rating is null or >= 1 and <= 5, "rating", "Use 1–5.")
            .Check((r.Features?.Length ?? 0) <= 400, "features", "Use at most 400 characters.")
            .Check((r.CancellationPolicy?.Length ?? 0) <= 300, "cancellationPolicy", "Use at most 300 characters.")
            .Check(CustomerRules.IsImagePath(r.ImageUrl), "imageUrl", "Use a site image path like /images/destinations/taipei.svg.")
            .ThrowIfAny();
        return repo.SaveServiceAsync(r, depart, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<InventoryRow>> InventoryAsync(int serviceId, DateTime? from, CancellationToken ct) =>
        repo.InventoryAsync(serviceId, (from ?? DateTime.UtcNow.Date.AddDays(1)).Date, 60, ct);

    public Task SetInventoryAsync(int serviceId, InventoryRangeRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(r.From is not null && r.From.Value.Date > DateTime.UtcNow.Date, "from", "Start from tomorrow or later.")
            .Check(r.To is not null && r.To >= r.From && (r.To.Value - r.From!.Value).TotalDays <= 366, "to", "Choose an end within a year of the start.")
            .Check(r.Capacity is >= 0 and <= 1000, "capacity", "Use 0–1000.")
            .Check(r.Price is > 0 and <= 1_000_000, "price", "Enter a positive price.")
            .Check(r.Status is "Open" or "Closed", "status", "Use Open or Closed.")
            .ThrowIfAny();
        return repo.SetInventoryRangeAsync(serviceId, r, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<OpsServiceBookingRow>> OpsBookingsAsync(string? kind, string? search, CancellationToken ct) =>
        repo.OpsServiceBookingsAsync(CustomerRules.ServiceKinds.Contains(kind) ? kind : null, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), ct);

    private static string? NullIfEmpty(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
}
