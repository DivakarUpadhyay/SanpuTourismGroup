using Dapper;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Infrastructure;
using Divakar.Sanpu.Erp.Application;

namespace Divakar.Sanpu.Erp.Infrastructure;

/// <summary>Dapper + stored procedures only (CommandType.StoredProcedure via Db). No SQL text is built from user input.</summary>
public sealed class ErpRepository(Db db) : IErpRepository
{
    private static IReadOnlyList<T> L<T>(IEnumerable<T> x) => x.AsList();

    // ---------- catalog ----------
    public Task<IReadOnlyList<DestinationRow>> DestinationsAsync(CancellationToken ct) => db.QueryAsync<DestinationRow>("dbo.usp_Catalog_Destinations", null, ct);

    public Task<IReadOnlyList<TourCardRow>> SearchToursAsync(string? destinationCode, DateTime? month, int pax, CancellationToken ct) =>
        db.QueryAsync<TourCardRow>("dbo.usp_Catalog_SearchTours", new { DestinationCode = destinationCode, Month = month, Pax = pax }, ct);

    public Task<TourDetail?> GetTourAsync(string code, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Catalog_GetTour", new { Code = code }, async g =>
        {
            var tour = await g.ReadFirstOrDefaultAsync<TourDetailRow>();
            var deps = L(await g.ReadAsync<DepartureSlotRow>());
            var guide = await g.ReadFirstOrDefaultAsync<DestinationGuideRow>();
            var history = L(await g.ReadAsync<HistoryEntryRow>());
            var nearby = L(await g.ReadAsync<NearbyPlaceRow>());
            return tour is null ? null : new TourDetail(tour, deps, guide, history, nearby);
        }, ct);

    public Task<DepartureForBookingRow?> GetDepartureAsync(int departureId, CancellationToken ct) =>
        db.QuerySingleAsync<DepartureForBookingRow>("dbo.usp_Catalog_GetDeparture", new { DepartureId = departureId }, ct);

    // ---------- customer bookings ----------
    public async Task<HoldRow> CreateHoldAsync(int departureId, Guid userId, int pax, string idempotencyKey, int holdMinutes, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<HoldRow>("dbo.usp_Booking_CreateHold", new { DepartureId = departureId, UserId = userId, Pax = pax, IdempotencyKey = idempotencyKey, HoldMinutes = holdMinutes, CorrelationId = correlationId }, ct))!;

    public async Task<BookingCreatedRow> CreateBookingFromHoldAsync(Guid holdId, Guid userId, string leadName, byte[]? phoneEnc, string? phoneMasked, byte[]? passportEnc, string? passportMasked, string? requests, string correlationId, CancellationToken ct, string? couponCode = null) =>
        (await db.QuerySingleAsync<BookingCreatedRow>("dbo.usp_Booking_CreateFromHold", new
        {
            HoldId = holdId, UserId = userId, LeadName = leadName, LeadPhoneEnc = phoneEnc, LeadPhoneMasked = phoneMasked, PassportEnc = passportEnc,
            PassportMasked = passportMasked, SpecialRequests = requests, CorrelationId = correlationId, CouponCode = couponCode
        }, ct))!;

    public Task<IReadOnlyList<MyBookingRow>> ListMyBookingsAsync(Guid userId, CancellationToken ct) =>
        db.QueryAsync<MyBookingRow>("dbo.usp_Booking_ListForCustomer", new { CustomerUserId = userId }, ct);

    public Task<(MyBookingDetailRow? Booking, IReadOnlyList<StatusHistoryRow> History)> GetMyBookingAsync(int bookingId, Guid userId, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Booking_GetForCustomer", new { BookingId = bookingId, CustomerUserId = userId },
            async g => (await g.ReadFirstOrDefaultAsync<MyBookingDetailRow>(), L(await g.ReadAsync<StatusHistoryRow>())), ct);

    public Task RequestCancelAsync(int bookingId, Guid userId, string reason, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Booking_RequestCancel", new { BookingId = bookingId, CustomerUserId = userId, Reason = reason, CorrelationId = correlationId }, ct);

    public async Task<int> ReleaseExpiredHoldsAsync(CancellationToken ct) => await db.QuerySingleAsync<int>("dbo.usp_Booking_ReleaseExpiredHolds", new { DepartureId = (int?)null }, ct);

    // ---------- staff bookings & finance ----------
    public Task<IReadOnlyList<OpsBookingRow>> ListBookingsAsync(string? search, string? status, DateTime? fromDate, string sort, int page, int pageSize, CancellationToken ct) =>
        db.QueryAsync<OpsBookingRow>("dbo.usp_Ops_Bookings_List", new { Search = search, Status = status, FromDate = fromDate, Sort = sort, Page = page, PageSize = pageSize }, ct);

    public Task<(OpsBookingDetailRow? Booking, IReadOnlyList<StatusHistoryRow> History, IReadOnlyList<PaymentRow> Payments, IReadOnlyList<RefundRow> Refunds)> GetBookingAsync(int bookingId, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Ops_Bookings_Get", new { BookingId = bookingId }, async g =>
            (await g.ReadFirstOrDefaultAsync<OpsBookingDetailRow>(), L(await g.ReadAsync<StatusHistoryRow>()), L(await g.ReadAsync<PaymentRow>()), L(await g.ReadAsync<RefundRow>())), ct);

    public Task<ApprovalHistory> ApprovalHistoryAsync(string entityType, int entityId, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Approval_History", new { EntityType = entityType, EntityId = entityId },
            async g => new ApprovalHistory(L(await g.ReadAsync<ApprovalHeaderRow>()), L(await g.ReadAsync<ApprovalActionRow>())), ct);

    public Task<ApprovalResultRow?> DecideBookingAsync(int bookingId, string decision, string? comment, Guid actor, string correlationId, CancellationToken ct) =>
        db.QuerySingleAsync<ApprovalResultRow>("dbo.usp_Booking_Decide", new { BookingId = bookingId, Decision = decision, Comment = comment, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task CancelBookingAsync(int bookingId, string reason, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Booking_Cancel", new { BookingId = bookingId, Reason = reason, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<PiiRow?> RevealPiiAsync(int bookingId, Guid actor, string correlationId, CancellationToken ct) =>
        db.QuerySingleAsync<PiiRow>("dbo.usp_Booking_RevealPii", new { BookingId = bookingId, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<PaymentRow?> RecordPaymentAsync(int bookingId, decimal amount, string method, string idempotencyKey, Guid actor, string correlationId, CancellationToken ct) =>
        db.QuerySingleAsync<PaymentRow>("dbo.usp_Finance_RecordPayment", new { BookingId = bookingId, Amount = amount, Method = method, IdempotencyKey = idempotencyKey, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<RefundRow?> CreateRefundAsync(int bookingId, decimal amount, string reason, Guid actor, string correlationId, CancellationToken ct) =>
        db.QuerySingleAsync<RefundRow>("dbo.usp_Finance_CreateRefund", new { BookingId = bookingId, Amount = amount, Reason = reason, ActorUserId = actor, CorrelationId = correlationId }, ct);

    // ---------- approvals & workflows ----------
    public Task<IReadOnlyList<InboxRow>> InboxAsync(Guid userId, CancellationToken ct) => db.QueryAsync<InboxRow>("dbo.usp_Approval_Inbox", new { UserId = userId }, ct);

    public Task<ApprovalResultRow?> ActAsync(int approvalRequestId, string decision, string? comment, Guid? delegateTo, byte[]? rowVersion, Guid actor, string correlationId, CancellationToken ct) =>
        db.QuerySingleAsync<ApprovalResultRow>("dbo.usp_Approval_Act", new
        {
            ApprovalRequestId = approvalRequestId, Decision = decision, Comment = comment, DelegateToUserId = delegateTo, RowVersion = rowVersion, ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<WorkflowList> WorkflowsAsync(CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Workflow_List", null, async g => new WorkflowList(L(await g.ReadAsync<WorkflowRow>()), L(await g.ReadAsync<WorkflowStepRow>())), ct);

    public Task SaveWorkflowAsync(string key, string entityType, string name, string stepsJson, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Workflow_SaveVersion", new { WorkflowKey = key, EntityType = entityType, Name = name, StepsJson = stepsJson, ActorUserId = actor, CorrelationId = correlationId }, ct);

    // ---------- ops master data ----------
    public Task<OpsDashboard> DashboardAsync(CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Ops_Dashboard", null, async g =>
            new OpsDashboard(await g.ReadFirstAsync<OpsKpiRow>(), L(await g.ReadAsync<UpcomingDepartureRow>()), L(await g.ReadAsync<UnitRevenueRow>())), ct);

    public Task<OpsLookups> LookupsAsync(CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Ops_Lookups", null, async g => new OpsLookups(
            L(await g.ReadAsync<LookupRow>()), L(await g.ReadAsync<LookupRow>()), L(await g.ReadAsync<VehicleLookupRow>()),
            L(await g.ReadAsync<LookupRow>()), L(await g.ReadAsync<StaffLookupRow>()), L(await g.ReadAsync<LookupRow>())), ct);

    public Task<IReadOnlyList<BusinessUnitRow>> BusinessUnitsAsync(CancellationToken ct) => db.QueryAsync<BusinessUnitRow>("dbo.usp_Ops_BusinessUnits_List", null, ct);

    public async Task<int> UpsertBusinessUnitAsync(int? id, BusinessUnitRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Ops_BusinessUnits_Upsert", new { BusinessUnitId = id, r.Code, r.Name, r.Kind, r.IsActive, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<IReadOnlyList<SupplierRow>> SuppliersAsync(string? search, CancellationToken ct) => db.QueryAsync<SupplierRow>("dbo.usp_Ops_Suppliers_List", new { Search = search }, ct);

    public async Task<int> UpsertSupplierAsync(int? id, SupplierRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Ops_Suppliers_Upsert", new
        {
            SupplierId = id, r.Code, r.Name, r.SupplierType, r.BusinessUnitId, ContactEmail = string.IsNullOrWhiteSpace(r.ContactEmail) ? null : r.ContactEmail.Trim(), r.AdapterType,
            WebhookSecretRef = string.IsNullOrWhiteSpace(r.WebhookSecretRef) ? null : r.WebhookSecretRef, r.RateLimitPerMin, r.IsActive, RowVersion = RowVersions.Parse(r.RowVersion),
            ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<SupplierKeyRow?> SupplierByCodeAsync(string code, CancellationToken ct) => db.QuerySingleAsync<SupplierKeyRow>("dbo.usp_Ops_Suppliers_GetByCode", new { Code = code }, ct);

    public Task<IReadOnlyList<TourRow>> ToursAsync(string? search, CancellationToken ct) => db.QueryAsync<TourRow>("dbo.usp_Ops_Tours_List", new { Search = search }, ct);

    public async Task<int> UpsertTourAsync(int? id, TourRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Ops_Tours_Upsert", new
        {
            TourId = id, r.Code, r.Title, r.Slogan, r.DestinationId, r.BusinessUnitId, r.Days, r.BasePrice, r.Summary, r.IsPublished, RowVersion = RowVersions.Parse(r.RowVersion),
            ActorUserId = actor, CorrelationId = correlationId, ImageUrl = string.IsNullOrWhiteSpace(r.ImageUrl) ? null : r.ImageUrl.Trim()
        }, ct);

    public Task<IReadOnlyList<DepartureRow>> DeparturesAsync(int? tourId, DateTime? fromDate, CancellationToken ct) =>
        db.QueryAsync<DepartureRow>("dbo.usp_Ops_Departures_List", new { TourId = tourId, FromDate = fromDate }, ct);

    public async Task<int> UpsertDepartureAsync(int? id, DepartureRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Ops_Departures_Upsert", new
        {
            DepartureId = id, r.TourId, r.DepartureDate, r.Capacity, r.Price, r.Status, RowVersion = RowVersions.Parse(r.RowVersion), ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<IReadOnlyList<CostAssumptionRow>> CostAssumptionsAsync(CancellationToken ct) => db.QueryAsync<CostAssumptionRow>("dbo.usp_Ops_CostAssumptions_List", null, ct);

    public Task UpdateCostAssumptionAsync(string key, decimal value, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Ops_CostAssumptions_Update", new { AssumptionKey = key, Value = value, ActorUserId = actor, CorrelationId = correlationId }, ct);

    // ---------- tasks & privacy ----------
    public Task<IReadOnlyList<TaskRow>> TasksAsync(Guid? assignedUserId, string? status, bool overdueOnly, CancellationToken ct) =>
        db.QueryAsync<TaskRow>("dbo.usp_Tasks_List", new { AssignedUserId = assignedUserId, Status = status, OverdueOnly = overdueOnly }, ct);

    public Task UpdateTaskAsync(int taskId, string action, Guid? assignTo, string? note, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Tasks_Update", new { TaskId = taskId, Action = action, AssignToUserId = assignTo, Note = note, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task CreateTaskAsync(string title, string taskType, string? entityType, string? entityRef, string priority, int dueInHours, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Tasks_Create", new { Title = title, TaskType = taskType, EntityType = entityType, EntityRef = entityRef, Priority = priority, DueInHours = dueInHours }, ct);

    public Task<IReadOnlyList<RetentionPolicyRow>> RetentionPoliciesAsync(CancellationToken ct) => db.QueryAsync<RetentionPolicyRow>("dbo.usp_Privacy_Policies_List", null, ct);

    public Task UpdateRetentionPolicyAsync(int policyId, RetentionPolicyRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Privacy_Policies_Update", new { PolicyId = policyId, r.KeepDays, r.Action, r.IsActive, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public async Task<PrivacyRunRow> RunPrivacyAsync(bool dryRun, Guid actor, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<PrivacyRunRow>("dbo.usp_Privacy_Run", new { DryRun = dryRun, ActorUserId = actor, CorrelationId = correlationId }, ct))!;

    // ---------- integration ----------
    public async Task<IngestRow> IngestEventAsync(int supplierId, string eventType, string idempotencyKey, string correlationId, string payloadJson, CancellationToken ct) =>
        (await db.QuerySingleAsync<IngestRow>("dbo.usp_Integration_IngestEvent", new { SupplierId = supplierId, EventType = eventType, IdempotencyKey = idempotencyKey, CorrelationId = correlationId, PayloadJson = payloadJson }, ct))!;

    public Task<StoredEventRow?> GetEventAsync(long eventId, CancellationToken ct) => db.QuerySingleAsync<StoredEventRow>("dbo.usp_Integration_Get", new { EventId = eventId }, ct);

    public Task<MarkResultRow?> MarkEventAsync(long eventId, bool succeeded, string? error, int maxAttempts, CancellationToken ct) =>
        db.QuerySingleAsync<MarkResultRow>("dbo.usp_Integration_MarkResult", new { EventId = eventId, Succeeded = succeeded, Error = error, MaxAttempts = maxAttempts }, ct);

    public Task<IReadOnlyList<long>> DueRetriesAsync(int max, CancellationToken ct) => db.QueryAsync<long>("dbo.usp_Integration_DueRetries", new { Max = max }, ct);

    public Task<IReadOnlyList<IntegrationEventRow>> EventsAsync(string? status, int? supplierId, int page, int pageSize, CancellationToken ct) =>
        db.QueryAsync<IntegrationEventRow>("dbo.usp_Integration_List", new { Status = status, SupplierId = supplierId, Page = page, PageSize = pageSize }, ct);

    public Task ApplyStatementAsync(int supplierId, string period, decimal amount, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Integration_ApplyStatement", new { SupplierId = supplierId, Period = period, Amount = amount }, ct);

    public Task ApplyAllotmentAsync(string tourCode, DateTime departureDate, int capacity, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Integration_ApplyAllotment", new { TourCode = tourCode, DepartureDate = departureDate, Capacity = capacity }, ct);

    // ---------- reconciliation & group simulation ----------
    public Task<IReadOnlyList<ReconRow>> RunReconciliationAsync(string period, Guid actor, string correlationId, CancellationToken ct) =>
        db.QueryAsync<ReconRow>("dbo.usp_Recon_Run", new { Period = period, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<IReadOnlyList<ReconRow>> ReconciliationsAsync(string? period, CancellationToken ct) => db.QueryAsync<ReconRow>("dbo.usp_Recon_List", new { Period = period }, ct);

    public Task ResolveReconciliationAsync(int reconId, string action, string? note, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Recon_Resolve", new { ReconId = reconId, Action = action, Note = note, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<GroupSimInputs> GroupSimInputsAsync(int departureId, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_GroupSim_Inputs", new { DepartureId = departureId }, async g =>
            new GroupSimInputs(await g.ReadFirstOrDefaultAsync<GroupSimDepartureRow>(), L(await g.ReadAsync<GroupSimVehicleRow>()), L(await g.ReadAsync<AssumptionValueRow>())), ct);

    public async Task<GroupPlanSavedRow> SaveGroupPlanAsync(int departureId, string inputsJson, string resultJson, string chosenOption, decimal cost, decimal revenue, decimal marginPct, Guid actor, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<GroupPlanSavedRow>("dbo.usp_GroupSim_Save", new
        {
            DepartureId = departureId, InputsJson = inputsJson, ResultJson = resultJson, ChosenOption = chosenOption, ProjectedCost = cost, ProjectedRevenue = revenue,
            ProjectedMarginPct = marginPct, ActorUserId = actor, CorrelationId = correlationId
        }, ct))!;

    public Task<GroupPlanSavedRow?> SubmitGroupPlanAsync(int groupPlanId, Guid actor, string correlationId, CancellationToken ct) =>
        db.QuerySingleAsync<GroupPlanSavedRow>("dbo.usp_GroupSim_Submit", new { GroupPlanId = groupPlanId, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<IReadOnlyList<GroupPlanRow>> GroupPlansAsync(int? departureId, CancellationToken ct) => db.QueryAsync<GroupPlanRow>("dbo.usp_GroupSim_List", new { DepartureId = departureId }, ct);
}
