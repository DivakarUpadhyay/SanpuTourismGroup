using Divakar.Sanpu.Core.Api;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Erp.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Divakar.Sanpu.Erp.Api;

[ApiController, Route("api/v1/catalog"), Tags("Catalog (customer)"), AllowAnonymous]
public sealed class CatalogController(CatalogService catalog) : ControllerBase
{
    [HttpGet("destinations")]
    public Task<IReadOnlyList<DestinationRow>> Destinations(CancellationToken ct) => catalog.DestinationsAsync(ct);

    /// <summary>Published tours with at least one open departure that has room for `pax`. Fictional demo catalog.</summary>
    [HttpGet("tours")]
    public Task<IReadOnlyList<TourCardRow>> Tours([FromQuery] string? destination, [FromQuery] string? month, [FromQuery] int? pax, CancellationToken ct) => catalog.SearchAsync(destination, month, pax, ct);

    [HttpGet("tours/{code}")]
    public Task<TourDetail> Tour(string code, CancellationToken ct) => catalog.TourAsync(code, ct);

    [HttpGet("departures/{id:int}")]
    public Task<DepartureForBookingRow> Departure(int id, CancellationToken ct) => catalog.DepartureAsync(id, ct);
}

[ApiController, Route("api/v1/bookings"), Tags("Bookings (customer)")]
public sealed class CustomerBookingsController(CustomerBookingService bookings) : ControllerBase
{
    /// <summary>Hold seats for Booking.HoldMinutes. Final-seat safe (UPDLOCK/HOLDLOCK). Same idempotency key returns the same hold.</summary>
    [HttpPost("holds"), HasPermission("Booking.Create")]
    public async Task<IActionResult> Hold(HoldRequest request, CancellationToken ct) => StatusCode(201, await bookings.HoldAsync(request, ct));

    /// <summary>Turn a hold into a booking (Pending approval). Phone and passport are encrypted (AES-GCM) and stored masked for display.</summary>
    [HttpPost, HasPermission("Booking.Create")]
    public async Task<IActionResult> Create(CreateBookingRequest request, CancellationToken ct) => StatusCode(201, await bookings.BookAsync(request, ct));
}

[ApiController, Route("api/v1/my/bookings"), Tags("Bookings (customer)"), HasPermission("Booking.ViewOwn")]
public sealed class MyBookingsController(CustomerBookingService bookings) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<MyBookingRow>> Mine(CancellationToken ct) => bookings.MineAsync(ct);

    /// <summary>Own booking only; another customer's id returns 404 (no IDOR).</summary>
    [HttpGet("{id:int}")]
    public Task<MyBookingDetail> Get(int id, CancellationToken ct) => bookings.MyBookingAsync(id, ct);

    [HttpPost("{id:int}/cancel")]
    public async Task<IActionResult> Cancel(int id, CancelRequest request, CancellationToken ct) { await bookings.CancelAsync(id, request, ct); return NoContent(); }
}

[ApiController, Route("api/v1/ops"), Tags("Operations")]
public sealed class OpsController(OpsService ops) : ControllerBase
{
    [HttpGet("dashboard"), HasPermission("Ops.Dashboard.View")]
    public Task<OpsDashboard> Dashboard(CancellationToken ct) => ops.DashboardAsync(ct);

    [HttpGet("lookups")]
    [HasPermission("Ops.Dashboard.View|Catalog.View|Departure.View|Supplier.View|Workflow.View|Task.View|GroupPlan.Simulate|Finance.Reconcile")]
    public Task<OpsLookups> Lookups(CancellationToken ct) => ops.LookupsAsync(ct);

    [HttpGet("business-units"), HasPermission("Catalog.View")]
    public Task<IReadOnlyList<BusinessUnitRow>> Units(CancellationToken ct) => ops.BusinessUnitsAsync(ct);
    [HttpPost("business-units"), HasPermission("Catalog.Edit")]
    public async Task<object> CreateUnit(BusinessUnitRequest r, CancellationToken ct) => new { id = await ops.SaveBusinessUnitAsync(null, r, ct) };
    [HttpPut("business-units/{id:int}"), HasPermission("Catalog.Edit")]
    public async Task<object> UpdateUnit(int id, BusinessUnitRequest r, CancellationToken ct) => new { id = await ops.SaveBusinessUnitAsync(id, r, ct) };

    [HttpGet("suppliers"), HasPermission("Supplier.View")]
    public Task<IReadOnlyList<SupplierRow>> Suppliers([FromQuery] string? search, CancellationToken ct) => ops.SuppliersAsync(search, ct);
    [HttpPost("suppliers"), HasPermission("Supplier.Edit")]
    public async Task<object> CreateSupplier(SupplierRequest r, CancellationToken ct) => new { id = await ops.SaveSupplierAsync(null, r, ct) };
    [HttpPut("suppliers/{id:int}"), HasPermission("Supplier.Edit")]
    public async Task<object> UpdateSupplier(int id, SupplierRequest r, CancellationToken ct) => new { id = await ops.SaveSupplierAsync(id, r, ct) };

    [HttpGet("tours"), HasPermission("Catalog.View")]
    public Task<IReadOnlyList<TourRow>> Tours([FromQuery] string? search, CancellationToken ct) => ops.ToursAsync(search, ct);
    [HttpPost("tours"), HasPermission("Catalog.Edit")]
    public async Task<object> CreateTour(TourRequest r, CancellationToken ct) => new { id = await ops.SaveTourAsync(null, r, ct) };
    [HttpPut("tours/{id:int}"), HasPermission("Catalog.Edit")]
    public async Task<object> UpdateTour(int id, TourRequest r, CancellationToken ct) => new { id = await ops.SaveTourAsync(id, r, ct) };

    [HttpGet("departures"), HasPermission("Departure.View")]
    public Task<IReadOnlyList<DepartureRow>> Departures([FromQuery] int? tourId, [FromQuery] DateTime? from, CancellationToken ct) => ops.DeparturesAsync(tourId, from, ct);
    [HttpPost("departures"), HasPermission("Departure.Edit")]
    public async Task<object> CreateDeparture(DepartureRequest r, CancellationToken ct) => new { id = await ops.SaveDepartureAsync(null, r, ct) };
    /// <summary>409 capacity_below_sold if capacity would drop below sold + held seats.</summary>
    [HttpPut("departures/{id:int}"), HasPermission("Departure.Edit")]
    public async Task<object> UpdateDeparture(int id, DepartureRequest r, CancellationToken ct) => new { id = await ops.SaveDepartureAsync(id, r, ct) };

    [HttpGet("cost-assumptions"), HasPermission("CostAssumption.Edit|GroupPlan.Simulate")]
    public Task<IReadOnlyList<CostAssumptionRow>> Costs(CancellationToken ct) => ops.CostAssumptionsAsync(ct);
    [HttpPut("cost-assumptions/{key}"), HasPermission("CostAssumption.Edit")]
    public async Task<IActionResult> UpdateCost(string key, CostAssumptionRequest r, CancellationToken ct) { await ops.UpdateCostAssumptionAsync(key, r, ct); return NoContent(); }

    [HttpGet("tasks"), HasPermission("Task.View")]
    public Task<IReadOnlyList<TaskRow>> Tasks([FromQuery] bool mine = false, [FromQuery] string? status = null, [FromQuery] bool overdue = false, CancellationToken ct = default) => ops.TasksAsync(mine, status, overdue, ct);
    [HttpPost("tasks/{id:int}"), HasPermission("Task.Work")]
    public async Task<IActionResult> UpdateTask(int id, TaskActionRequest r, CancellationToken ct) { await ops.UpdateTaskAsync(id, r, ct); return NoContent(); }

    [HttpGet("privacy/policies"), HasPermission("Privacy.Manage")]
    public Task<IReadOnlyList<RetentionPolicyRow>> Policies(CancellationToken ct) => ops.RetentionPoliciesAsync(ct);
    [HttpPut("privacy/policies/{id:int}"), HasPermission("Privacy.Manage")]
    public async Task<IActionResult> UpdatePolicy(int id, RetentionPolicyRequest r, CancellationToken ct) { await ops.UpdateRetentionPolicyAsync(id, r, ct); return NoContent(); }
    /// <summary>Anonymise traveler PII past the retention period. dryRun=true only counts.</summary>
    [HttpPost("privacy/run"), HasPermission("Privacy.Manage")]
    public Task<PrivacyRunRow> RunPrivacy([FromQuery] bool dryRun = true, CancellationToken ct = default) => ops.RunPrivacyAsync(dryRun, ct);
}

[ApiController, Route("api/v1/ops/bookings"), Tags("Operations: bookings & finance")]
public sealed class OpsBookingsController(BookingOpsService bookings) : ControllerBase
{
    [HttpGet, HasPermission("Booking.View")]
    public Task<PagedResult<OpsBookingRow>> List([FromQuery] string? search, [FromQuery] string? status, [FromQuery] DateTime? from, [FromQuery] string? sort, [FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken ct) =>
        bookings.ListAsync(search, status, from, sort, page, pageSize, ct);

    [HttpGet("{id:int}"), HasPermission("Booking.View")]
    public Task<OpsBookingDetail> Get(int id, CancellationToken ct) => bookings.GetAsync(id, ct);

    /// <summary>Approve/reject through the workflow engine. Self-approval is blocked (403 self_approval).</summary>
    [HttpPost("{id:int}/decision"), HasPermission("Booking.Approve")]
    public Task<ApprovalResultRow?> Decide(int id, DecisionRequest r, CancellationToken ct) => bookings.DecideAsync(id, r, ct);

    [HttpPost("{id:int}/cancel"), HasPermission("Booking.Cancel")]
    public async Task<IActionResult> Cancel(int id, CancelRequest r, CancellationToken ct) { await bookings.CancelAsync(id, r, ct); return NoContent(); }

    /// <summary>SIMULATED payment provider only (no card data). Idempotent by key.</summary>
    [HttpPost("{id:int}/payments"), HasPermission("Finance.Payment")]
    public Task<PaymentRow> Payment(int id, PaymentRequest r, CancellationToken ct) => bookings.PaymentAsync(id, r, ct);

    /// <summary>Request a refund; the refund workflow decides (two steps above TWD 20,000 in the seed configuration).</summary>
    [HttpPost("{id:int}/refunds"), HasPermission("Finance.Refund")]
    public Task<RefundRow> Refund(int id, RefundRequest r, CancellationToken ct) => bookings.RefundAsync(id, r, ct);

    [HttpPost("{id:int}/reveal-pii"), HasPermission("Pii.Reveal")]
    public Task<object> Reveal(int id, CancellationToken ct) => bookings.RevealPiiAsync(id, ct);
}

[ApiController, Route("api/v1/ops"), Tags("Operations: approvals & workflows")]
public sealed class ApprovalsController(ApprovalService approvals) : ControllerBase
{
    [HttpGet("approvals/inbox"), HasPermission("Approval.Act")]
    public Task<IReadOnlyList<InboxRow>> Inbox(CancellationToken ct) => approvals.InboxAsync(ct);

    [HttpPost("approvals/{id:int}/act"), HasPermission("Approval.Act")]
    public Task<ApprovalResultRow?> Act(int id, ApprovalActRequest r, CancellationToken ct) => approvals.ActAsync(id, r, ct);

    [HttpGet("workflows"), HasPermission("Workflow.View")]
    public Task<WorkflowList> Workflows(CancellationToken ct) => approvals.WorkflowsAsync(ct);

    /// <summary>Saves a new version and makes it active. Running requests keep the version they started with.</summary>
    [HttpPost("workflows"), HasPermission("Workflow.Edit")]
    public async Task<IActionResult> Save(WorkflowSaveRequest r, CancellationToken ct) { await approvals.SaveWorkflowAsync(r, ct); return NoContent(); }
}

[ApiController, Route("api/v1"), Tags("Integration (suppliers / OTA)")]
public sealed class IntegrationController(IntegrationService integration) : ControllerBase
{
    /// <summary>Supplier webhook. Headers: X-Sanpu-Timestamp (unix s), X-Sanpu-Signature (hex HMAC-SHA256 of "{ts}.{body}"), X-Idempotency-Key, X-Correlation-Id.
    /// Duplicate keys return 200 outcome=duplicate. Body: {"eventType": "...", "data": {...}}.</summary>
    [HttpPost("integrations/webhooks/{supplierCode}"), AllowAnonymous, EnableRateLimiting("webhook"), RequestSizeLimit(65_536)]
    public async Task<IActionResult> Webhook(string supplierCode, CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body);
        var body = await reader.ReadToEndAsync(ct);
        var result = await integration.ReceiveAsync(supplierCode, new WebhookEnvelope(Request.Headers["X-Sanpu-Timestamp"], Request.Headers["X-Sanpu-Signature"],
            Request.Headers["X-Idempotency-Key"], Request.Headers["X-Correlation-Id"], body), ct);
        return result.Outcome == "duplicate" ? Ok(result) : Accepted(result);
    }

    /// <summary>LOCAL MOCK supplier for demos: signs and sends an event through the same pipeline. Not a live connection.</summary>
    [HttpPost("ops/integrations/mock-send"), HasPermission("Integration.Retry")]
    public Task<WebhookResult> MockSend(MockSupplierEventRequest r, CancellationToken ct) => integration.MockSendAsync(r, ct);

    [HttpGet("ops/integrations/events"), HasPermission("Integration.View")]
    public Task<PagedResult<IntegrationEventRow>> Events([FromQuery] string? status, [FromQuery] int? supplierId, [FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken ct) =>
        integration.ListAsync(status, supplierId, page, pageSize, ct);

    [HttpPost("ops/integrations/events/{id:long}/retry"), HasPermission("Integration.Retry")]
    public Task<MarkResultRow> Retry(long id, CancellationToken ct) => integration.RetryAsync(id, ct);
}

[ApiController, Route("api/v1/ops"), Tags("Operations: reconciliation & group simulation")]
public sealed class FinanceSimController(ReconciliationService recon, GroupSimService sim) : ControllerBase
{
    [HttpGet("reconciliation"), HasPermission("Finance.Reconcile")]
    public Task<IReadOnlyList<ReconRow>> Recon([FromQuery] string? period, CancellationToken ct) => recon.ListAsync(period, ct);

    /// <summary>Compare our supplier costs with supplier statements for a month. Mismatches open an exception task (once).</summary>
    [HttpPost("reconciliation/run"), HasPermission("Finance.Reconcile")]
    public Task<IReadOnlyList<ReconRow>> RunRecon(ReconRunRequest r, CancellationToken ct) => recon.RunAsync(r, ct);

    [HttpPost("reconciliation/{id:int}/resolve"), HasPermission("Finance.Reconcile")]
    public async Task<IActionResult> Resolve(int id, ReconResolveRequest r, CancellationToken ct) { await recon.ResolveAsync(id, r, ct); return NoContent(); }

    [HttpGet("group-sim"), HasPermission("GroupPlan.Simulate")]
    public Task<IReadOnlyList<GroupPlanRow>> Plans([FromQuery] int? departureId, CancellationToken ct) => sim.ListAsync(departureId, ct);

    /// <summary>Deterministic vehicle/cost allocation for a departure; saved as a Draft plan with inputs and results.</summary>
    [HttpPost("group-sim/run"), HasPermission("GroupPlan.Simulate")]
    public Task<GroupSimResult> Run(GroupSimRequest r, CancellationToken ct) => sim.RunAsync(r, ct);

    /// <summary>Send the plan to the group-plan approval workflow; another user must approve it.</summary>
    [HttpPost("group-sim/{id:int}/submit"), HasPermission("GroupPlan.Submit")]
    public Task<GroupPlanSavedRow> Submit(int id, CancellationToken ct) => sim.SubmitAsync(id, ct);
}
