using System.Text.Json;
using Dapper;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Infrastructure;
using Divakar.Sanpu.Erp.Application;

namespace Divakar.Sanpu.Erp.Infrastructure;

/// <summary>Customer experience data access. Dapper + stored procedures only; no SQL text is built from user input.</summary>
public sealed class CustomerRepository(Db db) : ICustomerRepository
{
    private static IReadOnlyList<T> L<T>(IEnumerable<T> x) => x.AsList();

    // ---------- help & contact ----------
    public Task<IReadOnlyList<HelpArticleRow>> HelpAsync(string? search, CancellationToken ct) => db.QueryAsync<HelpArticleRow>("dbo.usp_Help_List", new { Search = search }, ct);
    public Task HelpFeedbackAsync(int articleId, bool helpful, CancellationToken ct) => db.ExecuteAsync("dbo.usp_Help_Feedback", new { ArticleId = articleId, Helpful = helpful }, ct);
    public Task<IReadOnlyList<OpsHelpArticleRow>> OpsHelpAsync(CancellationToken ct) => db.QueryAsync<OpsHelpArticleRow>("dbo.usp_Ops_Help_List", null, ct);

    public async Task<int> SaveHelpAsync(HelpArticleRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Ops_Help_Upsert", new
        {
            r.ArticleId, Category = r.Category.Trim(), Question = r.Question.Trim(), Answer = r.Answer.Trim(), r.SortOrder, r.IsPublished,
            RowVersion = RowVersions.Parse(r.RowVersion), ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public async Task<ContactCreatedRow> CreateContactAsync(Guid? userId, ContactRequest r, int slaHours, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<ContactCreatedRow>("dbo.usp_Contact_Create", new
        {
            UserId = userId, r.Name, r.Email, r.Topic, r.BookingRef, r.Message, SlaHours = slaHours, CorrelationId = correlationId
        }, ct))!;

    public Task<IReadOnlyList<ContactListRow>> ContactsAsync(string? status, CancellationToken ct) => db.QueryAsync<ContactListRow>("dbo.usp_Ops_Contact_List", new { Status = status }, ct);
    public Task SetContactStatusAsync(int id, string status, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Ops_Contact_SetStatus", new { ContactId = id, Status = status, ActorUserId = actor, CorrelationId = correlationId }, ct);

    // ---------- discovery ----------
    public Task RecordTourViewAsync(string code, Guid? userId, CancellationToken ct) => db.ExecuteAsync("dbo.usp_Tour_RecordView", new { TourCode = code, UserId = userId }, ct);
    public Task<IReadOnlyList<RecommendationRow>> RecommendAsync(Guid? userId, int max, string? excludeCode, CancellationToken ct) =>
        db.QueryAsync<RecommendationRow>("dbo.usp_Recommend_Tours", new { UserId = userId, Max = max, ExcludeCode = excludeCode }, ct);
    public Task<IReadOnlyList<CalendarRow>> CalendarAsync(DateTime month, CancellationToken ct) => db.QueryAsync<CalendarRow>("dbo.usp_Catalog_Calendar", new { Month = month }, ct);
    public Task<IReadOnlyList<CompareRow>> CompareAsync(IReadOnlyList<string> codes, CancellationToken ct) =>
        db.QueryAsync<CompareRow>("dbo.usp_Catalog_Compare", new { CodesJson = JsonSerializer.Serialize(codes) }, ct);

    public Task<DestinationGuide?> DestinationAsync(string code, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Destinations_Get", new { Code = code }, async g =>
        {
            var head = await g.ReadFirstOrDefaultAsync<DestinationHeaderRow>();
            var history = L(await g.ReadAsync<HistoryEntryRow>());
            var nearby = L(await g.ReadAsync<NearbyPlaceRow>());
            var tours = L(await g.ReadAsync<DestinationTourRow>());
            return head is null ? null : new DestinationGuide(head, history, nearby, tours);
        }, ct);

    // ---------- marketing ----------
    public Task<IReadOnlyList<PromotionRow>> ActivePromotionsAsync(string placement, CancellationToken ct) => db.QueryAsync<PromotionRow>("dbo.usp_Promotions_Active", new { Placement = placement }, ct);
    public Task TrackPromotionAsync(int id, string kind, CancellationToken ct) => db.ExecuteAsync("dbo.usp_Promotions_Track", new { PromotionId = id, Kind = kind }, ct);
    public Task<IReadOnlyList<OpsPromotionRow>> OpsPromotionsAsync(CancellationToken ct) => db.QueryAsync<OpsPromotionRow>("dbo.usp_Ops_Promotions_List", null, ct);

    public async Task<int> SavePromotionAsync(PromotionRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Ops_Promotions_Upsert", new
        {
            r.PromotionId, Title = r.Title.Trim(), Subtitle = Clean(r.Subtitle), r.Placement, ImageUrl = Clean(r.ImageUrl), CtaText = Clean(r.CtaText), CtaUrl = Clean(r.CtaUrl),
            CouponCode = Clean(r.CouponCode)?.ToUpperInvariant(), Badge = Clean(r.Badge), r.StartsAtUtc, r.EndsAtUtc, r.Priority, r.IsActive,
            RowVersion = RowVersions.Parse(r.RowVersion), ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<IReadOnlyList<PublicCouponRow>> PublicCouponsAsync(CancellationToken ct) => db.QueryAsync<PublicCouponRow>("dbo.usp_Coupons_Public", null, ct);
    public async Task<CouponCheckRow> CheckCouponAsync(string code, Guid? userId, string kind, decimal amount, CancellationToken ct) =>
        (await db.QuerySingleAsync<CouponCheckRow>("dbo.usp_Coupon_Check", new { Code = code, UserId = userId, Kind = kind, Amount = amount }, ct))!;
    public Task<IReadOnlyList<OpsCouponRow>> OpsCouponsAsync(CancellationToken ct) => db.QueryAsync<OpsCouponRow>("dbo.usp_Ops_Coupons_List", null, ct);

    public async Task<int> SaveCouponAsync(CouponRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Ops_Coupons_Upsert", new
        {
            r.CouponId, r.Code, Description = r.Description.Trim(), r.DiscountType, r.DiscountValue, r.MaxDiscount, r.MinAmount, r.AppliesTo, r.StartsAtUtc, r.EndsAtUtc,
            r.UsageLimit, r.PerCustomerLimit, r.IsPublic, r.IsActive, RowVersion = RowVersions.Parse(r.RowVersion), ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<IReadOnlyList<RedemptionRow>> RedemptionsAsync(int couponId, CancellationToken ct) => db.QueryAsync<RedemptionRow>("dbo.usp_Ops_Coupons_Redemptions", new { CouponId = couponId }, ct);

    // ---------- travel services ----------
    public Task<IReadOnlyList<PlaceRow>> PlacesAsync(string? kind, CancellationToken ct) => db.QueryAsync<PlaceRow>("dbo.usp_Places_List", new { Kind = kind }, ct);

    public Task<ServiceDetail> ServiceDetailAsync(string code, DateTime from, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Services_Get", new { Code = code, From = from }, async g =>
            new ServiceDetail((await g.ReadFirstAsync<ServiceDetailRow>()), L(await g.ReadAsync<ServiceDayRow>()), L(await g.ReadAsync<SimilarServiceRow>())), ct);

    public Task<IReadOnlyList<ServiceResultRow>> SearchServicesAsync(string kind, string? from, string? to, DateTime date, DateTime? endDate, int units, int travelers, string sort, CancellationToken ct) =>
        db.QueryAsync<ServiceResultRow>("dbo.usp_Services_Search", new { Kind = kind, From = from, To = to, Date = date, EndDate = endDate, Units = units, Travelers = travelers, Sort = sort }, ct);

    public async Task<ServiceBookedRow> BookServiceAsync(Guid userId, ServiceBookRequest r, byte[]? phoneEnc, string? phoneMasked, TimeSpan? pickupTime, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<ServiceBookedRow>("dbo.usp_ServiceBooking_Create", new
        {
            UserId = userId, r.ServiceCode, Date = r.Date!.Value.Date, EndDate = r.EndDate?.Date, r.Units, r.Travelers, r.LeadName, LeadPhoneEnc = phoneEnc, LeadPhoneMasked = phoneMasked,
            PickupAddress = Clean(r.PickupAddress), PickupTime = pickupTime, Notes = Clean(r.Notes), CouponCode = Clean(r.CouponCode), r.IdempotencyKey, CorrelationId = correlationId
        }, ct))!;

    public Task<IReadOnlyList<MyServiceBookingRow>> MyServiceBookingsAsync(Guid userId, CancellationToken ct) => db.QueryAsync<MyServiceBookingRow>("dbo.usp_ServiceBooking_ListForCustomer", new { UserId = userId }, ct);
    public Task CancelServiceBookingAsync(int id, Guid userId, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_ServiceBooking_Cancel", new { ServiceBookingId = id, UserId = userId, CorrelationId = correlationId }, ct);

    // ---------- payments ----------
    public async Task<PaymentIntentRow> CreateIntentAsync(string orderType, int orderId, Guid userId, string mode, int depositPercent, int balanceDueDays, string provider, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<PaymentIntentRow>("dbo.usp_Payment_CreateIntent", new
        {
            OrderType = orderType, OrderId = orderId, UserId = userId, Mode = mode, DepositPercent = depositPercent, BalanceDueDays = balanceDueDays, Provider = provider, CorrelationId = correlationId
        }, ct))!;

    public async Task<PaymentIntentRow> CompleteIntentAsync(string tradeNo, bool succeeded, decimal paidAmount, string? providerTradeNo, string? message, string? method, int balanceDueDays, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<PaymentIntentRow>("dbo.usp_Payment_CompleteIntent", new
        {
            MerchantTradeNo = tradeNo, Succeeded = succeeded, PaidAmount = paidAmount, ProviderTradeNo = providerTradeNo, ProviderMessage = message, PaymentMethod = method,
            BalanceDueDays = balanceDueDays, CorrelationId = correlationId
        }, ct))!;

    public Task<PaymentIntentRow?> GetIntentAsync(string tradeNo, CancellationToken ct) => db.QuerySingleAsync<PaymentIntentRow>("dbo.usp_Payment_GetIntent", new { MerchantTradeNo = tradeNo }, ct);

    public async Task<PaymentSummary> PaymentSummaryAsync(string orderType, int orderId, Guid userId, int depositPercent, int balanceDueDays, CancellationToken ct) =>
        await db.MultipleAsync("dbo.usp_Payment_Summary", new { OrderType = orderType, OrderId = orderId, UserId = userId, DepositPercent = depositPercent, BalanceDueDays = balanceDueDays },
            async g => new PaymentSummary((await g.ReadFirstAsync<PaymentSummaryRow>()), L(await g.ReadAsync<PaymentHistoryRow>())), ct);

    public Task<IReadOnlyList<OpsServiceRow>> OpsServicesAsync(string? kind, string? search, CancellationToken ct) => db.QueryAsync<OpsServiceRow>("dbo.usp_Ops_Services_List", new { Kind = kind, Search = search }, ct);

    public async Task<int> SaveServiceAsync(ServiceRequest r, TimeSpan? departTime, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Ops_Services_Upsert", new
        {
            r.ServiceId, r.Code, r.Kind, Name = r.Name.Trim(), r.SupplierId, r.FromPlaceId, ToPlaceId = r.Kind == "Hotel" ? null : r.ToPlaceId, DepartTime = departTime, r.DurationMin,
            r.Capacity, r.MaxPerBooking, r.PeoplePerUnit, r.BasePrice, r.Rating, Features = Clean(r.Features), CancellationPolicy = Clean(r.CancellationPolicy), ImageUrl = Clean(r.ImageUrl),
            r.IsActive, RowVersion = RowVersions.Parse(r.RowVersion), ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<IReadOnlyList<InventoryRow>> InventoryAsync(int serviceId, DateTime from, int days, CancellationToken ct) =>
        db.QueryAsync<InventoryRow>("dbo.usp_Ops_ServiceInventory_List", new { ServiceId = serviceId, From = from, Days = days }, ct);

    public Task SetInventoryRangeAsync(int serviceId, InventoryRangeRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Ops_ServiceInventory_SetRange", new
        {
            ServiceId = serviceId, From = r.From!.Value.Date, To = r.To!.Value.Date, r.Capacity, r.Price, r.Status, ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<IReadOnlyList<OpsServiceBookingRow>> OpsServiceBookingsAsync(string? kind, string? search, CancellationToken ct) =>
        db.QueryAsync<OpsServiceBookingRow>("dbo.usp_Ops_ServiceBookings_List", new { Kind = kind, Search = search }, ct);

    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
}
