namespace Divakar.Sanpu.Erp.Application;

// ---------- catalog (customer) ----------
public sealed record DestinationRow { public int DestinationId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public string Region { get; init; } = ""; public bool IsDemo { get; init; } public string? ImageUrl { get; init; } public int TourCount { get; init; } }
public sealed record TourCardRow
{
    public int TourId { get; init; } public string Code { get; init; } = ""; public string Title { get; init; } = ""; public string? Slogan { get; init; }
    public int Days { get; init; } public decimal BasePrice { get; init; } public string Currency { get; init; } = ""; public string? Summary { get; init; } public bool IsDemo { get; init; }
    public string DestinationCode { get; init; } = ""; public string DestinationName { get; init; } = ""; public string Region { get; init; } = ""; public string BusinessUnitName { get; init; } = "";
    public decimal? FromPrice { get; init; } public DateTime? NextDeparture { get; init; } public int OpenDepartures { get; init; } public string? ImageUrl { get; init; }
}
public sealed record TourDetailRow
{
    public int TourId { get; init; } public string Code { get; init; } = ""; public string Title { get; init; } = ""; public string? Slogan { get; init; } public int Days { get; init; }
    public decimal BasePrice { get; init; } public string Currency { get; init; } = ""; public string? Summary { get; init; } public bool IsDemo { get; init; }
    public string DestinationName { get; init; } = ""; public string Region { get; init; } = ""; public string BusinessUnitName { get; init; } = ""; public string? ImageUrl { get; init; }
}
public sealed record DepartureSlotRow { public int DepartureId { get; init; } public DateTime DepartureDate { get; init; } public int Capacity { get; init; } public int SeatsLeft { get; init; } public decimal Price { get; init; } public string Status { get; init; } = ""; }
public sealed record DestinationGuideRow { public string? Overview { get; init; } public string? BestTime { get; init; } public string? GettingThere { get; init; } public string? LocalTip { get; init; } }
public sealed record HistoryEntryRow { public string Era { get; init; } = ""; public string Title { get; init; } = ""; public string Detail { get; init; } = ""; }
public sealed record NearbyPlaceRow { public string Name { get; init; } = ""; public string Category { get; init; } = ""; public decimal DistanceKm { get; init; } public int TravelMinutes { get; init; } public string Detail { get; init; } = ""; }
public sealed record TourDetail(TourDetailRow Tour, IReadOnlyList<DepartureSlotRow> Departures, DestinationGuideRow? Guide = null,
    IReadOnlyList<HistoryEntryRow>? History = null, IReadOnlyList<NearbyPlaceRow>? Nearby = null);
public sealed record DepartureForBookingRow { public int DepartureId { get; init; } public DateTime DepartureDate { get; init; } public decimal Price { get; init; } public string Status { get; init; } = ""; public int SeatsLeft { get; init; } public string TourCode { get; init; } = ""; public string TourTitle { get; init; } = ""; public int Days { get; init; } public string Currency { get; init; } = ""; public bool IsDemo { get; init; } }

// ---------- bookings ----------
public sealed record HoldRow { public Guid HoldId { get; init; } public int DepartureId { get; init; } public int Pax { get; init; } public DateTime ExpiresAtUtc { get; init; } public string Status { get; init; } = ""; public decimal UnitPrice { get; init; } public decimal TotalAmount { get; init; } }
public sealed record BookingCreatedRow { public int BookingId { get; init; } public string BookingRef { get; init; } = ""; public string Status { get; init; } = ""; }
public sealed record MyBookingRow
{
    public int BookingId { get; init; } public string BookingRef { get; init; } = ""; public int Pax { get; init; } public decimal TotalAmount { get; init; } public string Currency { get; init; } = "";
    public string Status { get; init; } = ""; public string PaymentStatus { get; init; } = ""; public DateTime CreatedAtUtc { get; init; } public DateTime DepartureDate { get; init; }
    public string TourCode { get; init; } = ""; public string TourTitle { get; init; } = ""; public bool IsDemo { get; init; }
}
public sealed record MyBookingDetailRow
{
    public int BookingId { get; init; } public string BookingRef { get; init; } = ""; public int Pax { get; init; } public decimal UnitPrice { get; init; } public decimal TotalAmount { get; init; }
    public string Currency { get; init; } = ""; public string Status { get; init; } = ""; public string PaymentStatus { get; init; } = ""; public decimal AmountPaid { get; init; } public decimal AmountRefunded { get; init; }
    public string LeadName { get; init; } = ""; public string? LeadPhoneMasked { get; init; } public string? PassportMasked { get; init; } public string? SpecialRequests { get; init; }
    public string? CancelReason { get; init; } public DateTime CreatedAtUtc { get; init; } public DateTime DepartureDate { get; init; } public string TourCode { get; init; } = ""; public string TourTitle { get; init; } = ""; public bool IsDemo { get; init; }
}
public sealed record StatusHistoryRow { public string? FromStatus { get; init; } public string ToStatus { get; init; } = ""; public string? Comment { get; init; } public DateTime OccurredAtUtc { get; init; } public string? ActorMasked { get; init; } }
public sealed record MyBookingDetail(MyBookingDetailRow Booking, IReadOnlyList<StatusHistoryRow> History, IReadOnlyList<string> AllowedActions);

public sealed record OpsBookingRow
{
    public int BookingId { get; init; } public string BookingRef { get; init; } = ""; public string LeadName { get; init; } = ""; public int Pax { get; init; } public decimal TotalAmount { get; init; }
    public string Currency { get; init; } = ""; public string Status { get; init; } = ""; public string PaymentStatus { get; init; } = ""; public DateTime CreatedAtUtc { get; init; } public bool IsDemo { get; init; }
    public DateTime DepartureDate { get; init; } public string TourCode { get; init; } = ""; public string TourTitle { get; init; } = ""; public int Total { get; init; }
}
public sealed record OpsBookingDetailRow
{
    public int BookingId { get; init; } public string BookingRef { get; init; } = ""; public Guid CustomerUserId { get; init; } public string? CustomerEmailMasked { get; init; } public int Pax { get; init; }
    public decimal UnitPrice { get; init; } public decimal TotalAmount { get; init; } public string Currency { get; init; } = ""; public string Status { get; init; } = ""; public string PaymentStatus { get; init; } = "";
    public decimal AmountPaid { get; init; } public decimal AmountRefunded { get; init; } public string LeadName { get; init; } = ""; public string? LeadPhoneMasked { get; init; } public string? PassportMasked { get; init; }
    public string? SpecialRequests { get; init; } public string? CancelReason { get; init; } public DateTime CreatedAtUtc { get; init; } public Guid CreatedBy { get; init; } public bool IsDemo { get; init; }
    public byte[]? RowVersion { get; init; } public int DepartureId { get; init; } public DateTime DepartureDate { get; init; } public string TourCode { get; init; } = ""; public string TourTitle { get; init; } = "";
}
public sealed record PaymentRow { public int PaymentId { get; init; } public decimal Amount { get; init; } public string Currency { get; init; } = ""; public string Provider { get; init; } = ""; public string ProviderRef { get; init; } = ""; public string Method { get; init; } = ""; public DateTime CreatedAtUtc { get; init; } }
public sealed record RefundRow { public int RefundId { get; init; } public string RefundRef { get; init; } = ""; public decimal Amount { get; init; } public string Reason { get; init; } = ""; public string Status { get; init; } = ""; public DateTime CreatedAtUtc { get; init; } public DateTime? ProcessedAtUtc { get; init; } }
public sealed record ApprovalHeaderRow { public int ApprovalRequestId { get; init; } public string Status { get; init; } = ""; public int CurrentStepNo { get; init; } public DateTime StepDueAtUtc { get; init; } public string WorkflowName { get; init; } = ""; public int Version { get; init; } public byte[]? RowVersion { get; init; } }
public sealed record ApprovalActionRow { public int ApprovalRequestId { get; init; } public int StepNo { get; init; } public string Decision { get; init; } = ""; public string? Comment { get; init; } public DateTime ActedAtUtc { get; init; } public string? ActorMasked { get; init; } }
public sealed record ApprovalHistory(IReadOnlyList<ApprovalHeaderRow> Requests, IReadOnlyList<ApprovalActionRow> Actions);
public sealed record OpsBookingDetail(OpsBookingDetailRow Booking, IReadOnlyList<StatusHistoryRow> History, IReadOnlyList<PaymentRow> Payments, IReadOnlyList<RefundRow> Refunds,
    ApprovalHistory Approvals, IReadOnlyList<string> AllowedActions);
public sealed record PiiRow { public byte[]? LeadPhoneEnc { get; init; } public byte[]? PassportEnc { get; init; } }

// ---------- approvals & workflows ----------
public sealed record InboxRow
{
    public int ApprovalRequestId { get; init; } public string EntityType { get; init; } = ""; public int EntityId { get; init; } public string EntityRef { get; init; } = ""; public decimal? Amount { get; init; }
    public int? Pax { get; init; } public int CurrentStepNo { get; init; } public DateTime StepDueAtUtc { get; init; } public bool IsOverdue { get; init; } public string WorkflowName { get; init; } = "";
    public string StepName { get; init; } = ""; public string ApproverRole { get; init; } = ""; public int StepCount { get; init; } public string? RequestedByMasked { get; init; } public byte[]? RowVersion { get; init; } public bool IsOwnRequest { get; init; }
}
public sealed record ApprovalResultRow { public string Status { get; init; } = ""; public int CurrentStepNo { get; init; } }
public sealed record WorkflowRow { public int WorkflowId { get; init; } public string WorkflowKey { get; init; } = ""; public int Version { get; init; } public string EntityType { get; init; } = ""; public string Name { get; init; } = ""; public bool IsActive { get; init; } public DateTime CreatedAtUtc { get; init; } }
public sealed record WorkflowStepRow
{
    public int WorkflowId { get; init; } public int StepNo { get; init; } public string Name { get; init; } = ""; public int ApproverRoleId { get; init; } public string ApproverRole { get; init; } = "";
    public string ConditionType { get; init; } = ""; public decimal? ConditionValue { get; init; } public int SlaHours { get; init; } public int? EscalateRoleId { get; init; } public string? EscalateRole { get; init; }
}
public sealed record WorkflowList(IReadOnlyList<WorkflowRow> Workflows, IReadOnlyList<WorkflowStepRow> Steps);

// ---------- ops ----------
public sealed record OpsKpiRow
{
    public int BookingsToday { get; init; } public int PendingApprovals { get; init; } public int SeatsOnHold { get; init; } public decimal LoadFactorPct { get; init; } public int OpenTasks { get; init; }
    public int OverdueTasks { get; init; } public decimal UnreconciledAmount { get; init; } public int FailedIntegrations { get; init; } public decimal ConfirmedRevenue { get; init; }
}
public sealed record UpcomingDepartureRow { public int DepartureId { get; init; } public DateTime DepartureDate { get; init; } public string TourCode { get; init; } = ""; public string TourTitle { get; init; } = ""; public int Capacity { get; init; } public int SeatsSold { get; init; } public int SeatsHeld { get; init; } public string Status { get; init; } = ""; }
public sealed record UnitRevenueRow { public string Code { get; init; } = ""; public string Name { get; init; } = ""; public int Bookings { get; init; } public decimal Revenue { get; init; } }
public sealed record OpsDashboard(OpsKpiRow Kpis, IReadOnlyList<UpcomingDepartureRow> Upcoming, IReadOnlyList<UnitRevenueRow> ByBusinessUnit);

public sealed record LookupRow { public int Id { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; }
public sealed record VehicleLookupRow { public int Id { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public int Seats { get; init; } public decimal CostPerDay { get; init; } }
public sealed record StaffLookupRow { public Guid UserId { get; init; } public string DisplayName { get; init; } = ""; public string? EmailMasked { get; init; } }
public sealed record OpsLookups(IReadOnlyList<LookupRow> Destinations, IReadOnlyList<LookupRow> BusinessUnits, IReadOnlyList<VehicleLookupRow> Vehicles,
    IReadOnlyList<LookupRow> Roles, IReadOnlyList<StaffLookupRow> Staff, IReadOnlyList<LookupRow> Suppliers);

public sealed record BusinessUnitRow { public int BusinessUnitId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public string Kind { get; init; } = ""; public bool IsActive { get; init; } public bool IsDemo { get; init; } public byte[]? RowVersion { get; init; } public int TourCount { get; init; } }
public sealed record SupplierRow
{
    public int SupplierId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public string SupplierType { get; init; } = ""; public int? BusinessUnitId { get; init; }
    public string? ContactEmail { get; init; } public string? ContactEmailMasked { get; init; } public string AdapterType { get; init; } = ""; public string? WebhookSecretRef { get; init; } public int RateLimitPerMin { get; init; }
    public string ConnectionStatus { get; init; } = ""; public DateTime? LastSyncAtUtc { get; init; } public bool IsActive { get; init; } public bool IsDemo { get; init; } public byte[]? RowVersion { get; init; } public int FailedEvents { get; init; }
}
public sealed record SupplierKeyRow { public int SupplierId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public string AdapterType { get; init; } = ""; public string? WebhookSecretRef { get; init; } public int RateLimitPerMin { get; init; } public bool IsActive { get; init; } }
public sealed record TourRow
{
    public int TourId { get; init; } public string Code { get; init; } = ""; public string Title { get; init; } = ""; public string? Slogan { get; init; } public int DestinationId { get; init; } public string DestinationName { get; init; } = "";
    public int BusinessUnitId { get; init; } public string BusinessUnitCode { get; init; } = ""; public int Days { get; init; } public decimal BasePrice { get; init; } public string Currency { get; init; } = ""; public string? Summary { get; init; }
    public bool IsPublished { get; init; } public bool IsDemo { get; init; } public byte[]? RowVersion { get; init; } public int UpcomingDepartures { get; init; }
    public string? ImageUrl { get; init; } public string? DestinationImageUrl { get; init; }
}
public sealed record DepartureRow
{
    public int DepartureId { get; init; } public int TourId { get; init; } public string TourCode { get; init; } = ""; public string TourTitle { get; init; } = ""; public DateTime DepartureDate { get; init; }
    public int Capacity { get; init; } public int SeatsSold { get; init; } public int SeatsHeld { get; init; } public int SeatsLeft { get; init; } public decimal Price { get; init; } public string Status { get; init; } = ""; public bool IsDemo { get; init; } public byte[]? RowVersion { get; init; }
}
public sealed record CostAssumptionRow { public int AssumptionId { get; init; } public string AssumptionKey { get; init; } = ""; public decimal Value { get; init; } public string Unit { get; init; } = ""; public string? Description { get; init; } public DateTime UpdatedAtUtc { get; init; } }
public sealed record TaskRow
{
    public int TaskId { get; init; } public string Title { get; init; } = ""; public string TaskType { get; init; } = ""; public string? EntityType { get; init; } public string? EntityRef { get; init; } public Guid? AssignedUserId { get; init; }
    public string? AssignedTo { get; init; } public string Status { get; init; } = ""; public string Priority { get; init; } = ""; public DateTime DueAtUtc { get; init; } public bool IsOverdue { get; init; } public string? Note { get; init; }
    public DateTime CreatedAtUtc { get; init; } public DateTime? CompletedAtUtc { get; init; } public bool IsDemo { get; init; }
}
public sealed record RetentionPolicyRow { public int PolicyId { get; init; } public string DataClass { get; init; } = ""; public string Fields { get; init; } = ""; public int KeepDays { get; init; } public string Action { get; init; } = ""; public bool IsActive { get; init; } public DateTime? LastRunAtUtc { get; init; } }
public sealed record PrivacyRunRow { public int Affected { get; init; } public bool DryRun { get; init; } }

// ---------- integration / reconciliation / group sim ----------
public sealed record IngestRow { public long EventId { get; init; } public string Outcome { get; init; } = ""; public string Status { get; init; } = ""; }
public sealed record IntegrationEventRow
{
    public long EventId { get; init; } public string SupplierCode { get; init; } = ""; public string SupplierName { get; init; } = ""; public string EventType { get; init; } = ""; public string IdempotencyKey { get; init; } = "";
    public string? CorrelationId { get; init; } public string Status { get; init; } = ""; public int Attempts { get; init; } public int DuplicateCount { get; init; } public DateTime? NextAttemptAtUtc { get; init; }
    public string? LastError { get; init; } public DateTime ReceivedAtUtc { get; init; } public DateTime? ProcessedAtUtc { get; init; } public string PayloadJson { get; init; } = ""; public bool IsDemo { get; init; } public int Total { get; init; }
}
public sealed record StoredEventRow { public long EventId { get; init; } public int SupplierId { get; init; } public string SupplierCode { get; init; } = ""; public string EventType { get; init; } = ""; public string IdempotencyKey { get; init; } = ""; public string? CorrelationId { get; init; } public string PayloadJson { get; init; } = ""; public string Status { get; init; } = ""; public int Attempts { get; init; } }
public sealed record MarkResultRow { public long EventId { get; init; } public string Status { get; init; } = ""; public int Attempts { get; init; } public DateTime? NextAttemptAtUtc { get; init; } }
public sealed record ReconRow
{
    public int ReconId { get; init; } public int SupplierId { get; init; } public string SupplierCode { get; init; } = ""; public string SupplierName { get; init; } = ""; public string Period { get; init; } = "";
    public decimal OurAmount { get; init; } public decimal? SupplierAmount { get; init; } public decimal Difference { get; init; } public string Status { get; init; } = ""; public string? ResolutionNote { get; init; } public DateTime RunAtUtc { get; init; } public byte[]? RowVersion { get; init; }
}
public sealed record GroupSimDepartureRow { public int DepartureId { get; init; } public DateTime DepartureDate { get; init; } public string TourCode { get; init; } = ""; public string TourTitle { get; init; } = ""; public int Days { get; init; } public decimal Price { get; init; } public int Capacity { get; init; } public int Pax { get; init; } public decimal Revenue { get; init; } }
public sealed record GroupSimVehicleRow { public int VehicleTypeId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public int Seats { get; init; } public decimal CostPerDay { get; init; } }
public sealed record AssumptionValueRow { public string AssumptionKey { get; init; } = ""; public decimal Value { get; init; } }
public sealed record GroupSimInputs(GroupSimDepartureRow? Departure, IReadOnlyList<GroupSimVehicleRow> Vehicles, IReadOnlyList<AssumptionValueRow> Assumptions);
public sealed record GroupPlanSavedRow { public int GroupPlanId { get; init; } public string PlanRef { get; init; } = ""; public string Status { get; init; } = ""; public int? ApprovalRequestId { get; init; } }
public sealed record GroupPlanRow
{
    public int GroupPlanId { get; init; } public string PlanRef { get; init; } = ""; public int DepartureId { get; init; } public DateTime DepartureDate { get; init; } public string TourCode { get; init; } = ""; public string Status { get; init; } = "";
    public string ChosenOption { get; init; } = ""; public decimal ProjectedCost { get; init; } public decimal ProjectedRevenue { get; init; } public decimal ProjectedMarginPct { get; init; } public int? ApprovalRequestId { get; init; }
    public DateTime CreatedAtUtc { get; init; } public string? CreatedByMasked { get; init; } public string ResultJson { get; init; } = "";
}

// ---------- requests ----------
public sealed record HoldRequest(int DepartureId, int Pax, string IdempotencyKey);
public sealed record CreateBookingRequest(Guid HoldId, string LeadName, string LeadPhone, string? PassportNo, string? SpecialRequests, bool AcceptTerms, string? CouponCode = null);
public sealed record CancelRequest(string Reason);
public sealed record DecisionRequest(string Decision, string? Comment);
public sealed record PaymentRequest(decimal Amount, string Method, string IdempotencyKey);
public sealed record RefundRequest(decimal Amount, string Reason);
public sealed record ApprovalActRequest(string Decision, string? Comment, Guid? DelegateToUserId, string? RowVersion);
public sealed record WorkflowStepInput(string Name, int ApproverRoleId, string ConditionType, decimal? ConditionValue, int SlaHours, int? EscalateRoleId);
public sealed record WorkflowSaveRequest(string WorkflowKey, string EntityType, string Name, IReadOnlyList<WorkflowStepInput> Steps);
public sealed record BusinessUnitRequest(string Code, string Name, string Kind, bool IsActive);
public sealed record SupplierRequest(string Code, string Name, string SupplierType, int? BusinessUnitId, string? ContactEmail, string AdapterType, string? WebhookSecretRef, int RateLimitPerMin, bool IsActive, string? RowVersion);
public sealed record TourRequest(string Code, string Title, string? Slogan, int DestinationId, int BusinessUnitId, int Days, decimal BasePrice, string? Summary, bool IsPublished, string? RowVersion, string? ImageUrl = null);
public sealed record DepartureRequest(int TourId, DateTime? DepartureDate, int Capacity, decimal Price, string Status, string? RowVersion);
public sealed record CostAssumptionRequest(decimal Value);
public sealed record TaskActionRequest(string Action, Guid? AssignToUserId, string? Note);
public sealed record RetentionPolicyRequest(int KeepDays, string Action, bool IsActive);
public sealed record ReconRunRequest(string Period);
public sealed record ReconResolveRequest(string Action, string? Note);
public sealed record GroupSimRequest(int DepartureId, IReadOnlyList<string>? VehicleCodes, decimal TargetMarginPct);
public sealed record MockSupplierEventRequest(string SupplierCode, string EventType, string IdempotencyKey, Dictionary<string, object?> Payload);
