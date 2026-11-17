namespace Divakar.Sanpu.Erp.Application;

/// <summary>Customer experience data access: every call is one stored procedure (Dapper, no EF).</summary>
public interface ICustomerRepository
{
    // help & contact
    Task<IReadOnlyList<HelpArticleRow>> HelpAsync(string? search, CancellationToken ct);
    Task HelpFeedbackAsync(int articleId, bool helpful, CancellationToken ct);
    Task<IReadOnlyList<OpsHelpArticleRow>> OpsHelpAsync(CancellationToken ct);
    Task<int> SaveHelpAsync(HelpArticleRequest r, Guid actor, string correlationId, CancellationToken ct);
    Task<ContactCreatedRow> CreateContactAsync(Guid? userId, ContactRequest r, int slaHours, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<ContactListRow>> ContactsAsync(string? status, CancellationToken ct);
    Task SetContactStatusAsync(int id, string status, Guid actor, string correlationId, CancellationToken ct);

    // discovery
    Task RecordTourViewAsync(string code, Guid? userId, CancellationToken ct);
    Task<IReadOnlyList<RecommendationRow>> RecommendAsync(Guid? userId, int max, string? excludeCode, CancellationToken ct);
    Task<IReadOnlyList<CalendarRow>> CalendarAsync(DateTime month, CancellationToken ct);
    Task<IReadOnlyList<CompareRow>> CompareAsync(IReadOnlyList<string> codes, CancellationToken ct);
    Task<DestinationGuide?> DestinationAsync(string code, CancellationToken ct);

    // marketing
    Task<IReadOnlyList<PromotionRow>> ActivePromotionsAsync(string placement, CancellationToken ct);
    Task TrackPromotionAsync(int id, string kind, CancellationToken ct);
    Task<IReadOnlyList<OpsPromotionRow>> OpsPromotionsAsync(CancellationToken ct);
    Task<int> SavePromotionAsync(PromotionRequest r, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<PublicCouponRow>> PublicCouponsAsync(CancellationToken ct);
    Task<CouponCheckRow> CheckCouponAsync(string code, Guid? userId, string kind, decimal amount, CancellationToken ct);
    Task<IReadOnlyList<OpsCouponRow>> OpsCouponsAsync(CancellationToken ct);
    Task<int> SaveCouponAsync(CouponRequest r, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<RedemptionRow>> RedemptionsAsync(int couponId, CancellationToken ct);

    // travel services
    Task<IReadOnlyList<PlaceRow>> PlacesAsync(string? kind, CancellationToken ct);
    Task<ServiceDetail> ServiceDetailAsync(string code, DateTime from, CancellationToken ct);
    Task<IReadOnlyList<ServiceResultRow>> SearchServicesAsync(string kind, string? from, string? to, DateTime date, DateTime? endDate, int units, int travelers, string sort, CancellationToken ct);
    Task<ServiceBookedRow> BookServiceAsync(Guid userId, ServiceBookRequest r, byte[]? phoneEnc, string? phoneMasked, TimeSpan? pickupTime, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<MyServiceBookingRow>> MyServiceBookingsAsync(Guid userId, CancellationToken ct);
    Task CancelServiceBookingAsync(int id, Guid userId, string correlationId, CancellationToken ct);

    // payments (gateway intents)
    Task<PaymentIntentRow> CreateIntentAsync(string orderType, int orderId, Guid userId, string mode, int depositPercent, int balanceDueDays, string provider, string correlationId, CancellationToken ct);
    Task<PaymentIntentRow> CompleteIntentAsync(string tradeNo, bool succeeded, decimal paidAmount, string? providerTradeNo, string? message, string? method, int balanceDueDays, string correlationId, CancellationToken ct);
    Task<PaymentIntentRow?> GetIntentAsync(string tradeNo, CancellationToken ct);
    Task<PaymentSummary> PaymentSummaryAsync(string orderType, int orderId, Guid userId, int depositPercent, int balanceDueDays, CancellationToken ct);
    Task<IReadOnlyList<OpsServiceRow>> OpsServicesAsync(string? kind, string? search, CancellationToken ct);
    Task<int> SaveServiceAsync(ServiceRequest r, TimeSpan? departTime, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<InventoryRow>> InventoryAsync(int serviceId, DateTime from, int days, CancellationToken ct);
    Task SetInventoryRangeAsync(int serviceId, InventoryRangeRequest r, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<OpsServiceBookingRow>> OpsServiceBookingsAsync(string? kind, string? search, CancellationToken ct);
}
