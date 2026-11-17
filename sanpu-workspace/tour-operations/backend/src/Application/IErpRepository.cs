namespace Divakar.Sanpu.Erp.Application;

/// <summary>ERP data access. One method = one stored procedure (see database/procedures/110_erp_procs.sql).</summary>
public interface IErpRepository
{
    // catalog
    Task<IReadOnlyList<DestinationRow>> DestinationsAsync(CancellationToken ct);
    Task<IReadOnlyList<TourCardRow>> SearchToursAsync(string? destinationCode, DateTime? month, int pax, CancellationToken ct);
    Task<TourDetail?> GetTourAsync(string code, CancellationToken ct);
    Task<DepartureForBookingRow?> GetDepartureAsync(int departureId, CancellationToken ct);
    // customer bookings
    Task<HoldRow> CreateHoldAsync(int departureId, Guid userId, int pax, string idempotencyKey, int holdMinutes, string correlationId, CancellationToken ct);
    Task<BookingCreatedRow> CreateBookingFromHoldAsync(Guid holdId, Guid userId, string leadName, byte[]? phoneEnc, string? phoneMasked, byte[]? passportEnc, string? passportMasked, string? requests, string correlationId, CancellationToken ct, string? couponCode = null);
    Task<IReadOnlyList<MyBookingRow>> ListMyBookingsAsync(Guid userId, CancellationToken ct);
    Task<(MyBookingDetailRow? Booking, IReadOnlyList<StatusHistoryRow> History)> GetMyBookingAsync(int bookingId, Guid userId, CancellationToken ct);
    Task RequestCancelAsync(int bookingId, Guid userId, string reason, string correlationId, CancellationToken ct);
    Task<int> ReleaseExpiredHoldsAsync(CancellationToken ct);
    // staff bookings & finance
    Task<IReadOnlyList<OpsBookingRow>> ListBookingsAsync(string? search, string? status, DateTime? fromDate, string sort, int page, int pageSize, CancellationToken ct);
    Task<(OpsBookingDetailRow? Booking, IReadOnlyList<StatusHistoryRow> History, IReadOnlyList<PaymentRow> Payments, IReadOnlyList<RefundRow> Refunds)> GetBookingAsync(int bookingId, CancellationToken ct);
    Task<ApprovalHistory> ApprovalHistoryAsync(string entityType, int entityId, CancellationToken ct);
    Task<ApprovalResultRow?> DecideBookingAsync(int bookingId, string decision, string? comment, Guid actor, string correlationId, CancellationToken ct);
    Task CancelBookingAsync(int bookingId, string reason, Guid actor, string correlationId, CancellationToken ct);
    Task<PiiRow?> RevealPiiAsync(int bookingId, Guid actor, string correlationId, CancellationToken ct);
    Task<PaymentRow?> RecordPaymentAsync(int bookingId, decimal amount, string method, string idempotencyKey, Guid actor, string correlationId, CancellationToken ct);
    Task<RefundRow?> CreateRefundAsync(int bookingId, decimal amount, string reason, Guid actor, string correlationId, CancellationToken ct);
    // approvals & workflows
    Task<IReadOnlyList<InboxRow>> InboxAsync(Guid userId, CancellationToken ct);
    Task<ApprovalResultRow?> ActAsync(int approvalRequestId, string decision, string? comment, Guid? delegateTo, byte[]? rowVersion, Guid actor, string correlationId, CancellationToken ct);
    Task<WorkflowList> WorkflowsAsync(CancellationToken ct);
    Task SaveWorkflowAsync(string key, string entityType, string name, string stepsJson, Guid actor, string correlationId, CancellationToken ct);
    // ops master data
    Task<OpsDashboard> DashboardAsync(CancellationToken ct);
    Task<OpsLookups> LookupsAsync(CancellationToken ct);
    Task<IReadOnlyList<BusinessUnitRow>> BusinessUnitsAsync(CancellationToken ct);
    Task<int> UpsertBusinessUnitAsync(int? id, BusinessUnitRequest r, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<SupplierRow>> SuppliersAsync(string? search, CancellationToken ct);
    Task<int> UpsertSupplierAsync(int? id, SupplierRequest r, Guid actor, string correlationId, CancellationToken ct);
    Task<SupplierKeyRow?> SupplierByCodeAsync(string code, CancellationToken ct);
    Task<IReadOnlyList<TourRow>> ToursAsync(string? search, CancellationToken ct);
    Task<int> UpsertTourAsync(int? id, TourRequest r, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<DepartureRow>> DeparturesAsync(int? tourId, DateTime? fromDate, CancellationToken ct);
    Task<int> UpsertDepartureAsync(int? id, DepartureRequest r, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<CostAssumptionRow>> CostAssumptionsAsync(CancellationToken ct);
    Task UpdateCostAssumptionAsync(string key, decimal value, Guid actor, string correlationId, CancellationToken ct);
    // tasks & privacy
    Task<IReadOnlyList<TaskRow>> TasksAsync(Guid? assignedUserId, string? status, bool overdueOnly, CancellationToken ct);
    Task UpdateTaskAsync(int taskId, string action, Guid? assignTo, string? note, Guid actor, string correlationId, CancellationToken ct);
    Task CreateTaskAsync(string title, string taskType, string? entityType, string? entityRef, string priority, int dueInHours, CancellationToken ct);
    Task<IReadOnlyList<RetentionPolicyRow>> RetentionPoliciesAsync(CancellationToken ct);
    Task UpdateRetentionPolicyAsync(int policyId, RetentionPolicyRequest r, Guid actor, string correlationId, CancellationToken ct);
    Task<PrivacyRunRow> RunPrivacyAsync(bool dryRun, Guid actor, string correlationId, CancellationToken ct);
    // integration
    Task<IngestRow> IngestEventAsync(int supplierId, string eventType, string idempotencyKey, string correlationId, string payloadJson, CancellationToken ct);
    Task<StoredEventRow?> GetEventAsync(long eventId, CancellationToken ct);
    Task<MarkResultRow?> MarkEventAsync(long eventId, bool succeeded, string? error, int maxAttempts, CancellationToken ct);
    Task<IReadOnlyList<long>> DueRetriesAsync(int max, CancellationToken ct);
    Task<IReadOnlyList<IntegrationEventRow>> EventsAsync(string? status, int? supplierId, int page, int pageSize, CancellationToken ct);
    Task ApplyStatementAsync(int supplierId, string period, decimal amount, CancellationToken ct);
    Task ApplyAllotmentAsync(string tourCode, DateTime departureDate, int capacity, CancellationToken ct);
    // reconciliation & group simulation
    Task<IReadOnlyList<ReconRow>> RunReconciliationAsync(string period, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<ReconRow>> ReconciliationsAsync(string? period, CancellationToken ct);
    Task ResolveReconciliationAsync(int reconId, string action, string? note, Guid actor, string correlationId, CancellationToken ct);
    Task<GroupSimInputs> GroupSimInputsAsync(int departureId, CancellationToken ct);
    Task<GroupPlanSavedRow> SaveGroupPlanAsync(int departureId, string inputsJson, string resultJson, string chosenOption, decimal cost, decimal revenue, decimal marginPct, Guid actor, string correlationId, CancellationToken ct);
    Task<GroupPlanSavedRow?> SubmitGroupPlanAsync(int groupPlanId, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<GroupPlanRow>> GroupPlansAsync(int? departureId, CancellationToken ct);
}
