namespace Divakar.Sanpu.Erp.Application;

/* ---------- help & contact ---------- */
public sealed record HelpArticleRow { public int ArticleId { get; init; } public string Category { get; init; } = ""; public string Question { get; init; } = ""; public string Answer { get; init; } = ""; public int HelpfulYes { get; init; } public int HelpfulNo { get; init; } }
public sealed record OpsHelpArticleRow
{
    public int ArticleId { get; init; } public string Category { get; init; } = ""; public string Question { get; init; } = ""; public string Answer { get; init; } = "";
    public int SortOrder { get; init; } public bool IsPublished { get; init; } public int HelpfulYes { get; init; } public int HelpfulNo { get; init; } public byte[]? RowVersion { get; init; }
}
public sealed record HelpArticleRequest(int? ArticleId, string Category, string Question, string Answer, int SortOrder, bool IsPublished, string? RowVersion);
public sealed record HelpFeedbackRequest(bool Helpful);
public sealed record ContactRequest(string Name, string Email, string Topic, string? BookingRef, string Message);
public sealed record ContactCreatedRow { public string ContactRef { get; init; } = ""; public DateTime CreatedAtUtc { get; init; } }
public sealed record ContactListRow
{
    public int ContactId { get; init; } public string ContactRef { get; init; } = ""; public string Name { get; init; } = ""; public string Email { get; init; } = ""; public string Topic { get; init; } = "";
    public string? BookingRef { get; init; } public string Message { get; init; } = ""; public string Status { get; init; } = ""; public DateTime CreatedAtUtc { get; init; }
    public int? TaskId { get; init; } public string? TaskStatus { get; init; } public DateTime? DueAtUtc { get; init; }
}
public sealed record ContactStatusRequest(string Status);

/* ---------- discovery ---------- */
public sealed record RecommendationRow
{
    public string Code { get; init; } = ""; public string Title { get; init; } = ""; public string? Slogan { get; init; } public int Days { get; init; } public string Currency { get; init; } = "TWD";
    public string? Summary { get; init; } public string DestinationName { get; init; } = ""; public string Region { get; init; } = ""; public string? ImageUrl { get; init; } public string BusinessUnitName { get; init; } = "";
    public decimal? FromPrice { get; init; } public DateTime? NextDeparture { get; init; } public decimal Score { get; init; } public string Reason { get; init; } = "";
}
public sealed record CalendarRow
{
    public int DepartureId { get; init; } public DateTime DepartureDate { get; init; } public decimal Price { get; init; } public int SeatsLeft { get; init; } public string Status { get; init; } = "";
    public string TourCode { get; init; } = ""; public string TourTitle { get; init; } = ""; public int Days { get; init; } public string Currency { get; init; } = "TWD"; public string DestinationName { get; init; } = "";
}
public sealed record CompareRow
{
    public string Code { get; init; } = ""; public string Title { get; init; } = ""; public string? Slogan { get; init; } public int Days { get; init; } public string Currency { get; init; } = "TWD"; public string? Summary { get; init; }
    public string DestinationName { get; init; } = ""; public string Region { get; init; } = ""; public string BusinessUnitName { get; init; } = ""; public string? ImageUrl { get; init; }
    public string? BestTime { get; init; } public string? GettingThere { get; init; } public decimal? FromPrice { get; init; } public DateTime? NextDeparture { get; init; }
    public int OpenDepartures { get; init; } public int? SeatsLeft { get; init; } public int NearbyCount { get; init; } public string? NearbyNames { get; init; }
}
public sealed record DestinationHeaderRow
{
    public int DestinationId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public string Region { get; init; } = ""; public string? ImageUrl { get; init; }
    public string? Overview { get; init; } public string? BestTime { get; init; } public string? GettingThere { get; init; } public string? LocalTip { get; init; }
}
public sealed record DestinationTourRow
{
    public string Code { get; init; } = ""; public string Title { get; init; } = ""; public string? Slogan { get; init; } public int Days { get; init; } public string Currency { get; init; } = "TWD"; public string? Summary { get; init; }
    public string? ImageUrl { get; init; } public string DestinationName { get; init; } = ""; public string BusinessUnitName { get; init; } = ""; public decimal? FromPrice { get; init; } public DateTime? NextDeparture { get; init; } public int OpenDepartures { get; init; }
}
public sealed record DestinationGuide(DestinationHeaderRow Destination, IReadOnlyList<HistoryEntryRow> History, IReadOnlyList<NearbyPlaceRow> Nearby, IReadOnlyList<DestinationTourRow> Tours);

/* ---------- marketing ---------- */
public sealed record PromotionRow
{
    public int PromotionId { get; init; } public string Title { get; init; } = ""; public string? Subtitle { get; init; } public string Placement { get; init; } = ""; public string? ImageUrl { get; init; }
    public string? CtaText { get; init; } public string? CtaUrl { get; init; } public string? CouponCode { get; init; } public string? Badge { get; init; } public DateTime EndsAtUtc { get; init; }
}
public sealed record OpsPromotionRow
{
    public int PromotionId { get; init; } public string Title { get; init; } = ""; public string? Subtitle { get; init; } public string Placement { get; init; } = ""; public string? ImageUrl { get; init; }
    public string? CtaText { get; init; } public string? CtaUrl { get; init; } public string? CouponCode { get; init; } public string? Badge { get; init; } public DateTime StartsAtUtc { get; init; } public DateTime EndsAtUtc { get; init; }
    public int Priority { get; init; } public bool IsActive { get; init; } public int Impressions { get; init; } public int Clicks { get; init; } public decimal ClickRate { get; init; } public byte[]? RowVersion { get; init; }
}
public sealed record PromotionRequest(int? PromotionId, string Title, string? Subtitle, string Placement, string? ImageUrl, string? CtaText, string? CtaUrl, string? CouponCode, string? Badge,
    DateTime? StartsAtUtc, DateTime? EndsAtUtc, int Priority, bool IsActive, string? RowVersion);
public sealed record PromotionTrackRequest(string Kind);
public sealed record PublicCouponRow
{
    public string Code { get; init; } = ""; public string Description { get; init; } = ""; public string DiscountType { get; init; } = ""; public decimal DiscountValue { get; init; }
    public decimal? MaxDiscount { get; init; } public decimal MinAmount { get; init; } public string AppliesTo { get; init; } = ""; public DateTime EndsAtUtc { get; init; }
}
public sealed record OpsCouponRow
{
    public int CouponId { get; init; } public string Code { get; init; } = ""; public string Description { get; init; } = ""; public string DiscountType { get; init; } = ""; public decimal DiscountValue { get; init; }
    public decimal? MaxDiscount { get; init; } public decimal MinAmount { get; init; } public string AppliesTo { get; init; } = ""; public DateTime StartsAtUtc { get; init; } public DateTime EndsAtUtc { get; init; }
    public int? UsageLimit { get; init; } public int PerCustomerLimit { get; init; } public int TimesUsed { get; init; } public bool IsPublic { get; init; } public bool IsActive { get; init; }
    public decimal TotalDiscount { get; init; } public byte[]? RowVersion { get; init; }
}
public sealed record CouponRequest(int? CouponId, string Code, string Description, string DiscountType, decimal DiscountValue, decimal? MaxDiscount, decimal MinAmount, string AppliesTo,
    DateTime? StartsAtUtc, DateTime? EndsAtUtc, int? UsageLimit, int PerCustomerLimit, bool IsPublic, bool IsActive, string? RowVersion);
public sealed record CouponCheckRequest(string Code, string Kind, decimal Amount);
public sealed record CouponCheckRow { public string Code { get; init; } = ""; public string Description { get; init; } = ""; public decimal DiscountAmount { get; init; } public decimal TotalAfter { get; init; } }
public sealed record RedemptionRow { public int RedemptionId { get; init; } public string OrderType { get; init; } = ""; public string OrderRef { get; init; } = ""; public decimal DiscountAmount { get; init; } public DateTime RedeemedAtUtc { get; init; } public string CustomerName { get; init; } = ""; }
public sealed record SavedIdRow { public int Id { get; init; } }

/* ---------- travel services ---------- */
public sealed record PlaceRow { public int PlaceId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public string Kind { get; init; } = ""; public string City { get; init; } = ""; }
public sealed record ServiceResultRow
{
    public int ServiceId { get; init; } public string Code { get; init; } = ""; public string Kind { get; init; } = ""; public string Name { get; init; } = ""; public string? Features { get; init; }
    public string? CancellationPolicy { get; init; } public string? ImageUrl { get; init; } public decimal? Rating { get; init; } public TimeSpan? DepartTime { get; init; } public int? DurationMin { get; init; }
    public int PeoplePerUnit { get; init; } public int MaxPerBooking { get; init; } public string Currency { get; init; } = "TWD"; public string? ProviderName { get; init; }
    public string FromCode { get; init; } = ""; public string FromName { get; init; } = ""; public string FromCity { get; init; } = ""; public string? ToCode { get; init; } public string? ToName { get; init; } public string? ToCity { get; init; }
    public int Available { get; init; } public decimal TotalPrice { get; init; } public decimal NightlyPrice { get; init; } public int Nights { get; init; }
}
public sealed record ServiceBookRequest(string ServiceCode, DateTime? Date, DateTime? EndDate, int Units, int Travelers, string LeadName, string LeadPhone, string? PickupAddress, string? PickupTime,
    string? Notes, string? CouponCode, bool AcceptTerms, string IdempotencyKey);
public sealed record ServiceBookedRow { public int ServiceBookingId { get; init; } public string BookingRef { get; init; } = ""; public string Status { get; init; } = ""; public decimal TotalAmount { get; init; } }
public sealed record MyServiceBookingRow
{
    public int ServiceBookingId { get; init; } public string BookingRef { get; init; } = ""; public string Kind { get; init; } = ""; public string ServiceName { get; init; } = ""; public string FromName { get; init; } = "";
    public string? ToName { get; init; } public DateTime StartDate { get; init; } public DateTime EndDate { get; init; } public int Units { get; init; } public int Travelers { get; init; }
    public decimal TotalAmount { get; init; } public decimal DiscountAmount { get; init; } public string Currency { get; init; } = "TWD"; public string Status { get; init; } = ""; public string PaymentStatus { get; init; } = "";
    public DateTime CreatedAtUtc { get; init; } public TimeSpan? DepartTime { get; init; } public string? ImageUrl { get; init; }
}
/* ---------- service detail ---------- */
public sealed record ServiceDetailRow
{
    public int ServiceId { get; init; } public string Code { get; init; } = ""; public string Kind { get; init; } = ""; public string Name { get; init; } = ""; public string? Description { get; init; }
    public string? Address { get; init; } public string? Highlights { get; init; } public string? FactsJson { get; init; } public string? Gallery { get; init; } public decimal? Latitude { get; init; } public decimal? Longitude { get; init; }
    public string? Features { get; init; } public string? CancellationPolicy { get; init; } public string? ImageUrl { get; init; } public decimal? Rating { get; init; } public TimeSpan? DepartTime { get; init; }
    public int? DurationMin { get; init; } public int PeoplePerUnit { get; init; } public int MaxPerBooking { get; init; } public decimal BasePrice { get; init; } public string Currency { get; init; } = "TWD";
    public string? ProviderName { get; init; } public string FromCode { get; init; } = ""; public string FromName { get; init; } = ""; public string FromCity { get; init; } = ""; public string? ToCode { get; init; }
    public string? ToName { get; init; } public string? ToCity { get; init; }
}
public sealed record ServiceDayRow { public DateTime ServiceDate { get; init; } public decimal Price { get; init; } public int Available { get; init; } public string Status { get; init; } = ""; }
public sealed record SimilarServiceRow
{
    public string Code { get; init; } = ""; public string Kind { get; init; } = ""; public string Name { get; init; } = ""; public string? ImageUrl { get; init; } public decimal? Rating { get; init; }
    public TimeSpan? DepartTime { get; init; } public int? DurationMin { get; init; } public decimal BasePrice { get; init; } public string Currency { get; init; } = "TWD"; public string FromName { get; init; } = ""; public string? ToName { get; init; } public string FromCity { get; init; } = "";
}
public sealed record ServiceDetail(ServiceDetailRow Service, IReadOnlyList<ServiceDayRow> Calendar, IReadOnlyList<SimilarServiceRow> Similar);

/* ---------- payments ---------- */
public sealed record PaymentIntentRow
{
    public int IntentId { get; init; } public string MerchantTradeNo { get; init; } = ""; public string OrderType { get; init; } = ""; public int OrderId { get; init; } public string OrderRef { get; init; } = "";
    public Guid CustomerUserId { get; init; } public string Mode { get; init; } = ""; public decimal Amount { get; init; } public string Currency { get; init; } = "TWD"; public string Provider { get; init; } = "";
    public string Status { get; init; } = ""; public string? ProviderTradeNo { get; init; } public string? ProviderMessage { get; init; } public string? PaymentMethod { get; init; }
    public DateTime? CompletedAtUtc { get; init; } public string? ItemName { get; init; }
}
public sealed record PaymentSummaryRow
{
    public string OrderRef { get; init; } = ""; public string Status { get; init; } = ""; public string PaymentStatus { get; init; } = ""; public decimal TotalAmount { get; init; } public decimal AmountPaid { get; init; }
    public decimal Balance { get; init; } public DateTime StartDate { get; init; } public DateTime? BalanceDueDate { get; init; } public bool CanPay { get; init; } public bool CanPayDeposit { get; init; }
    public decimal DepositAmount { get; init; } public int DepositPercent { get; init; }
}
public sealed record PaymentHistoryRow { public string MerchantTradeNo { get; init; } = ""; public string Mode { get; init; } = ""; public decimal Amount { get; init; } public string Provider { get; init; } = ""; public string Status { get; init; } = ""; public string? PaymentMethod { get; init; } public DateTime CreatedAtUtc { get; init; } public DateTime? CompletedAtUtc { get; init; } }
public sealed record PaymentSummary(PaymentSummaryRow Summary, IReadOnlyList<PaymentHistoryRow> History);
public sealed record CheckoutRequest(string OrderType, int OrderId, string Mode);
/// <summary>Either the payment is already done (simulated provider) or the browser must POST <see cref="Fields"/> to <see cref="Action"/> (gateway page).</summary>
public sealed record CheckoutResponse(string Provider, string MerchantTradeNo, decimal Amount, bool Completed, string? Action, IReadOnlyDictionary<string, string>? Fields);
public sealed record OpsServiceRow
{
    public int ServiceId { get; init; } public string Code { get; init; } = ""; public string Kind { get; init; } = ""; public string Name { get; init; } = ""; public int? SupplierId { get; init; } public string? ProviderName { get; init; }
    public int FromPlaceId { get; init; } public string FromName { get; init; } = ""; public int? ToPlaceId { get; init; } public string? ToName { get; init; } public TimeSpan? DepartTime { get; init; } public int? DurationMin { get; init; }
    public int Capacity { get; init; } public int MaxPerBooking { get; init; } public int PeoplePerUnit { get; init; } public decimal BasePrice { get; init; } public string Currency { get; init; } = "TWD"; public decimal? Rating { get; init; }
    public string? Features { get; init; } public string? CancellationPolicy { get; init; } public string? ImageUrl { get; init; } public bool IsActive { get; init; } public bool IsDemo { get; init; } public byte[]? RowVersion { get; init; }
    public int OpenDates { get; init; } public int UpcomingSold { get; init; }
}
public sealed record ServiceRequest(int? ServiceId, string Code, string Kind, string Name, int? SupplierId, int FromPlaceId, int? ToPlaceId, string? DepartTime, int? DurationMin, int Capacity,
    int MaxPerBooking, int PeoplePerUnit, decimal BasePrice, decimal? Rating, string? Features, string? CancellationPolicy, string? ImageUrl, bool IsActive, string? RowVersion);
public sealed record InventoryRow { public int InventoryId { get; init; } public DateTime ServiceDate { get; init; } public int Capacity { get; init; } public int Sold { get; init; } public int Held { get; init; } public int Available { get; init; } public decimal Price { get; init; } public string Status { get; init; } = ""; }
public sealed record InventoryRangeRequest(DateTime? From, DateTime? To, int Capacity, decimal Price, string Status);
public sealed record OpsServiceBookingRow
{
    public int ServiceBookingId { get; init; } public string BookingRef { get; init; } = ""; public string Kind { get; init; } = ""; public string ServiceName { get; init; } = ""; public DateTime StartDate { get; init; } public DateTime EndDate { get; init; }
    public int Units { get; init; } public int Travelers { get; init; } public decimal TotalAmount { get; init; } public decimal DiscountAmount { get; init; } public string? CouponCode { get; init; } public string Currency { get; init; } = "TWD";
    public string Status { get; init; } = ""; public string PaymentStatus { get; init; } = ""; public string LeadName { get; init; } = ""; public string? LeadPhoneMasked { get; init; } public string? PickupAddress { get; init; }
    public TimeSpan? PickupTime { get; init; } public DateTime CreatedAtUtc { get; init; }
}
