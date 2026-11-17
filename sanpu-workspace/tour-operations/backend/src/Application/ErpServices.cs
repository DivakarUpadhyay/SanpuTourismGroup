using System.Text.Json;
using System.Text.RegularExpressions;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Domain;
using Divakar.Sanpu.Erp.Domain;

namespace Divakar.Sanpu.Erp.Application;

public sealed class CatalogService(IErpRepository repo)
{
    public Task<IReadOnlyList<DestinationRow>> DestinationsAsync(CancellationToken ct) => repo.DestinationsAsync(ct);

    public Task<IReadOnlyList<TourCardRow>> SearchAsync(string? destination, string? month, int? pax, CancellationToken ct)
    {
        DateTime? m = null;
        if (!string.IsNullOrWhiteSpace(month))
        {
            if (!DateTime.TryParseExact(month + "-01", "yyyy-MM-dd", null, System.Globalization.DateTimeStyles.None, out var parsed)) throw AppException.Validation("month", "Use YYYY-MM.");
            m = parsed;
        }
        var p = pax ?? 1;
        if (p is < 1 or > 50) throw AppException.Validation("pax", "Use 1 to 50 travelers.");
        return repo.SearchToursAsync(string.IsNullOrWhiteSpace(destination) ? null : destination, m, p, ct);
    }

    public async Task<TourDetail> TourAsync(string code, CancellationToken ct) => await repo.GetTourAsync(code, ct) ?? throw AppException.NotFound("Tour");
    public async Task<DepartureForBookingRow> DepartureAsync(int id, CancellationToken ct) => await repo.GetDepartureAsync(id, ct) ?? throw AppException.NotFound("Departure");
}

/// <summary>Customer self-service booking. Ownership is enforced inside the procedures (other customers' bookings look "not found").</summary>
public sealed class CustomerBookingService(IErpRepository repo, ISettings settings, ICurrentUser current, IPiiProtector pii)
{
    public async Task<HoldRow> HoldAsync(HoldRequest request, CancellationToken ct)
    {
        var maxPax = await settings.GetIntAsync("Booking.MaxPaxPerBooking", 10, ct);
        new FieldErrors()
            .Check(request.Pax >= 1 && request.Pax <= maxPax, "pax", $"Book 1 to {maxPax} travelers.")
            .Check(Regex.IsMatch(request.IdempotencyKey ?? "", "^[A-Za-z0-9\\-]{8,64}$"), "idempotencyKey", "Send an 8–64 character idempotency key.")
            .ThrowIfAny();
        var minutes = await settings.GetIntAsync("Booking.HoldMinutes", 15, ct);
        return await repo.CreateHoldAsync(request.DepartureId, current.RequireUserId(), request.Pax, request.IdempotencyKey!, minutes, current.CorrelationId, ct);
    }

    public async Task<BookingCreatedRow> BookAsync(CreateBookingRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(!string.IsNullOrWhiteSpace(r.LeadName) && r.LeadName.Trim().Length is >= 2 and <= 100, "leadName", "Enter the lead traveler's name (2–100 characters).")
            .Check(Phone.IsValid(r.LeadPhone), "leadPhone", "Enter a phone number like +886912345678.")
            .Check(string.IsNullOrWhiteSpace(r.PassportNo) || Regex.IsMatch(r.PassportNo.Trim(), "^[A-Za-z0-9]{6,20}$"), "passportNo", "Use 6–20 letters or digits.")
            .Check((r.SpecialRequests?.Length ?? 0) <= 1000, "specialRequests", "Use at most 1000 characters.")
            .Check(string.IsNullOrWhiteSpace(r.CouponCode) || CustomerRules.IsCouponCode(r.CouponCode), "couponCode", "Enter a valid coupon code.")
            .Check(r.AcceptTerms, "acceptTerms", "Please accept the terms and privacy notice.")
            .ThrowIfAny();
        var passport = string.IsNullOrWhiteSpace(r.PassportNo) ? null : r.PassportNo.Trim().ToUpperInvariant();
        return await repo.CreateBookingFromHoldAsync(r.HoldId, current.RequireUserId(), r.LeadName.Trim(), pii.Protect(r.LeadPhone.Trim()), Mask.Phone(r.LeadPhone),
            pii.Protect(passport), passport is null ? null : Mask.Document(passport), string.IsNullOrWhiteSpace(r.SpecialRequests) ? null : r.SpecialRequests.Trim(), current.CorrelationId, ct,
            string.IsNullOrWhiteSpace(r.CouponCode) ? null : r.CouponCode.Trim().ToUpperInvariant());
    }

    public Task<IReadOnlyList<MyBookingRow>> MineAsync(CancellationToken ct) => repo.ListMyBookingsAsync(current.RequireUserId(), ct);

    public async Task<MyBookingDetail> MyBookingAsync(int id, CancellationToken ct)
    {
        var (booking, history) = await repo.GetMyBookingAsync(id, current.RequireUserId(), ct);
        if (booking is null) throw AppException.NotFound("Booking");
        var canCancel = BookingStatus.CanCustomerCancel(booking.Status) && await settings.GetBoolAsync("Feature.CustomerCancellation", true, ct);
        return new MyBookingDetail(booking, history, canCancel ? ["cancel"] : []);
    }

    public async Task CancelAsync(int id, CancelRequest r, CancellationToken ct)
    {
        if (!await settings.GetBoolAsync("Feature.CustomerCancellation", true, ct)) throw AppException.Forbidden("feature_disabled", "Online cancellation is turned off. Please contact us.");
        if (string.IsNullOrWhiteSpace(r.Reason) || r.Reason.Length > 300) throw AppException.Validation("reason", "Tell us why (up to 300 characters).");
        await repo.RequestCancelAsync(id, current.RequireUserId(), r.Reason.Trim(), current.CorrelationId, ct);
    }
}

/// <summary>Staff booking operations: list, detail, decisions through the workflow engine, cancellation, simulated payments, refunds, audited PII reveal.</summary>
public sealed class BookingOpsService(IErpRepository repo, ICurrentUser current, IPiiProtector pii)
{
    private static readonly string[] Statuses = ["Pending", "Confirmed", "Rejected", "CancelRequested", "Cancelled"];

    public async Task<PagedResult<OpsBookingRow>> ListAsync(string? search, string? status, DateTime? from, string? sort, int? page, int? size, CancellationToken ct)
    {
        if (status is not null && !Statuses.Contains(status)) throw AppException.Validation("status", "Unknown status.");
        var (p, s) = Paging.Clamp(page, size);
        var rows = await repo.ListBookingsAsync(string.IsNullOrWhiteSpace(search) ? null : search.Trim(), status, from, sort is "departure" or "amount" ? sort : "newest", p, s, ct);
        return new PagedResult<OpsBookingRow>(rows, rows.FirstOrDefault()?.Total ?? 0, p, s);
    }

    public async Task<OpsBookingDetail> GetAsync(int id, CancellationToken ct)
    {
        var (b, history, payments, refunds) = await repo.GetBookingAsync(id, ct);
        if (b is null) throw AppException.NotFound("Booking");
        var approvals = await repo.ApprovalHistoryAsync("Booking", id, ct);
        return new OpsBookingDetail(b, history, payments, refunds, approvals, BookingStatus.AllowedActions(b.Status, b.PaymentStatus));
    }

    public async Task<ApprovalResultRow?> DecideAsync(int id, DecisionRequest r, CancellationToken ct)
    {
        if (r.Decision is not ("Approved" or "Rejected")) throw AppException.Validation("decision", "Use Approved or Rejected.");
        if (r.Decision == "Rejected" && string.IsNullOrWhiteSpace(r.Comment)) throw AppException.Validation("comment", "Say why the booking is rejected.");
        return await repo.DecideBookingAsync(id, r.Decision, r.Comment?.Trim(), current.RequireUserId(), current.CorrelationId, ct);
    }

    public async Task CancelAsync(int id, CancelRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.Reason) || r.Reason.Length > 300) throw AppException.Validation("reason", "Give a reason (up to 300 characters).");
        await repo.CancelBookingAsync(id, r.Reason.Trim(), current.RequireUserId(), current.CorrelationId, ct);
    }

    public async Task<PaymentRow> PaymentAsync(int id, PaymentRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(r.Amount > 0 && decimal.Round(r.Amount, 2) == r.Amount, "amount", "Enter a positive amount with at most 2 decimals.")
            .Check(r.Method is "BankTransfer" or "Cash" or "CardSimulated", "method", "Use BankTransfer, Cash or CardSimulated.")
            .Check(Regex.IsMatch(r.IdempotencyKey ?? "", "^[A-Za-z0-9\\-]{8,64}$"), "idempotencyKey", "Send an 8–64 character idempotency key.")
            .ThrowIfAny();
        return await repo.RecordPaymentAsync(id, r.Amount, r.Method, r.IdempotencyKey!, current.RequireUserId(), current.CorrelationId, ct) ?? throw AppException.NotFound("Booking");
    }

    public async Task<RefundRow> RefundAsync(int id, RefundRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(r.Amount > 0 && decimal.Round(r.Amount, 2) == r.Amount, "amount", "Enter a positive amount with at most 2 decimals.")
            .Check(!string.IsNullOrWhiteSpace(r.Reason) && r.Reason.Length <= 100, "reason", "Choose a reason.")
            .ThrowIfAny();
        return await repo.CreateRefundAsync(id, r.Amount, r.Reason.Trim(), current.RequireUserId(), current.CorrelationId, ct) ?? throw AppException.NotFound("Booking");
    }

    /// <summary>Decrypts phone/passport for one booking. Requires Pii.Reveal and writes Booking.PiiRevealed to the audit log first.</summary>
    public async Task<object> RevealPiiAsync(int id, CancellationToken ct)
    {
        var row = await repo.RevealPiiAsync(id, current.RequireUserId(), current.CorrelationId, ct) ?? throw AppException.NotFound("Booking");
        return new { phone = pii.Unprotect(row.LeadPhoneEnc), passport = pii.Unprotect(row.PassportEnc), note = "Revealed values are audited. Seeded demo bookings hold no real numbers." };
    }
}

public sealed class ApprovalService(IErpRepository repo, ICurrentUser current)
{
    public Task<IReadOnlyList<InboxRow>> InboxAsync(CancellationToken ct) => repo.InboxAsync(current.RequireUserId(), ct);

    public async Task<ApprovalResultRow?> ActAsync(int id, ApprovalActRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(r.Decision is "Approved" or "Rejected" or "Delegated", "decision", "Use Approved, Rejected or Delegated.")
            .Check(r.Decision != "Rejected" || !string.IsNullOrWhiteSpace(r.Comment), "comment", "A comment is required to reject.")
            .Check(r.Decision != "Delegated" || r.DelegateToUserId is not null, "delegateToUserId", "Choose who to delegate to.")
            .Check((r.Comment?.Length ?? 0) <= 500, "comment", "Use at most 500 characters.")
            .ThrowIfAny();
        return await repo.ActAsync(id, r.Decision, r.Comment?.Trim(), r.DelegateToUserId, RowVersions.Parse(r.RowVersion), current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<WorkflowList> WorkflowsAsync(CancellationToken ct) => repo.WorkflowsAsync(ct);

    public async Task SaveWorkflowAsync(WorkflowSaveRequest r, CancellationToken ct)
    {
        var e = new FieldErrors()
            .Check(Regex.IsMatch(r.WorkflowKey ?? "", "^[a-z][a-z0-9.]{2,59}$"), "workflowKey", "Use lower-case letters, digits and dots.")
            .Check(r.EntityType is "Booking" or "Refund" or "GroupPlan", "entityType", "Use Booking, Refund or GroupPlan.")
            .Check(!string.IsNullOrWhiteSpace(r.Name) && r.Name.Length <= 100, "name", "Enter a name.")
            .Check(r.Steps is { Count: > 0 and <= 10 }, "steps", "Add 1 to 10 steps.");
        foreach (var (s, i) in (r.Steps ?? []).Select((s, i) => (s, i)))
        {
            e.Check(!string.IsNullOrWhiteSpace(s.Name), $"steps[{i}].name", "Enter a step name.")
             .Check(s.ConditionType is "Always" or "AmountGreaterThan" or "PaxGreaterThan", $"steps[{i}].conditionType", "Unknown condition.")
             .Check(s.ConditionType == "Always" || s.ConditionValue is >= 0, $"steps[{i}].conditionValue", "Enter the threshold.")
             .Check(s.SlaHours is >= 1 and <= 168, $"steps[{i}].slaHours", "Use 1 to 168 hours.");
        }
        e.ThrowIfAny();
        var json = JsonSerializer.Serialize(r.Steps!.Select((s, i) => new
        {
            order = i + 1, name = s.Name.Trim(), approverRoleId = s.ApproverRoleId, conditionType = s.ConditionType,
            conditionValue = s.ConditionType == "Always" ? null : s.ConditionValue, slaHours = s.SlaHours, escalateRoleId = s.EscalateRoleId
        }));
        await repo.SaveWorkflowAsync(r.WorkflowKey!, r.EntityType, r.Name.Trim(), json, current.RequireUserId(), current.CorrelationId, ct);
    }
}

/// <summary>Master data, dashboard, tasks and privacy for operations staff.</summary>
public sealed class OpsService(IErpRepository repo, ICurrentUser current)
{
    public Task<OpsDashboard> DashboardAsync(CancellationToken ct) => repo.DashboardAsync(ct);
    public Task<OpsLookups> LookupsAsync(CancellationToken ct) => repo.LookupsAsync(ct);
    public Task<IReadOnlyList<BusinessUnitRow>> BusinessUnitsAsync(CancellationToken ct) => repo.BusinessUnitsAsync(ct);

    public Task<int> SaveBusinessUnitAsync(int? id, BusinessUnitRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(Regex.IsMatch(r.Code ?? "", "^[A-Z][A-Z0-9]{1,19}$"), "code", "Use 2–20 capital letters or digits.")
            .Check(!string.IsNullOrWhiteSpace(r.Name) && r.Name.Length <= 100, "name", "Enter a name.")
            .Check(r.Kind is "Tours" or "Lodging" or "Coaches" or "Meals" or "Retail" or "Other", "kind", "Choose a kind.")
            .ThrowIfAny();
        return repo.UpsertBusinessUnitAsync(id, r, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<SupplierRow>> SuppliersAsync(string? search, CancellationToken ct) => repo.SuppliersAsync(search, ct);

    public Task<int> SaveSupplierAsync(int? id, SupplierRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(Regex.IsMatch(r.Code ?? "", "^[A-Z0-9\\-]{3,20}$"), "code", "Use 3–20 capital letters, digits or dashes.")
            .Check(!string.IsNullOrWhiteSpace(r.Name) && r.Name.Length <= 150, "name", "Enter a name.")
            .Check(r.SupplierType is "Hotel" or "Coach" or "Restaurant" or "Guide" or "OTA", "supplierType", "Choose a type.")
            .Check(r.AdapterType is "LocalMock" or "Webhook" or "Live", "adapterType", "Choose LocalMock, Webhook or Live.")
            .Check(string.IsNullOrWhiteSpace(r.ContactEmail) || EmailAddress.IsValid(r.ContactEmail), "contactEmail", "Enter a valid email.")
            .Check(string.IsNullOrWhiteSpace(r.WebhookSecretRef) || Regex.IsMatch(r.WebhookSecretRef, "^[A-Z][A-Z0-9_]{2,99}$"), "webhookSecretRef", "Enter the NAME of an environment variable, never the secret.")
            .Check(r.AdapterType != "Webhook" || !string.IsNullOrWhiteSpace(r.WebhookSecretRef), "webhookSecretRef", "Webhook suppliers need a secret reference.")
            .Check(r.RateLimitPerMin is >= 1 and <= 600, "rateLimitPerMin", "Use 1 to 600.")
            .ThrowIfAny();
        return repo.UpsertSupplierAsync(id, r, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<TourRow>> ToursAsync(string? search, CancellationToken ct) => repo.ToursAsync(search, ct);

    public Task<int> SaveTourAsync(int? id, TourRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(Regex.IsMatch(r.Code ?? "", "^[A-Z0-9\\-]{3,30}$"), "code", "Use 3–30 capital letters, digits or dashes.")
            .Check(!string.IsNullOrWhiteSpace(r.Title) && r.Title.Length <= 150, "title", "Enter a title (max 150).")
            .Check((r.Slogan?.Length ?? 0) <= 100, "slogan", "Use at most 100 characters.")
            .Check(r.Days is >= 1 and <= 30, "days", "Use 1 to 30 days.")
            .Check(r.BasePrice > 0 && decimal.Round(r.BasePrice, 2) == r.BasePrice, "basePrice", "Enter a positive price.")
            .Check((r.Summary?.Length ?? 0) <= 2000, "summary", "Use at most 2000 characters.")
            .Check(string.IsNullOrWhiteSpace(r.ImageUrl) || CustomerRules.IsImagePath(r.ImageUrl), "imageUrl", "Upload a photo or choose one from the library (leave empty to use the destination image).")
            .ThrowIfAny();
        return repo.UpsertTourAsync(id, r, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<DepartureRow>> DeparturesAsync(int? tourId, DateTime? from, CancellationToken ct) => repo.DeparturesAsync(tourId, from, ct);

    public Task<int> SaveDepartureAsync(int? id, DepartureRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(r.DepartureDate is not null, "departureDate", "Choose a date.")
            .Check(id is not null || r.DepartureDate is null || r.DepartureDate.Value.Date > DateTime.UtcNow.Date, "departureDate", "New departures must be in the future.")
            .Check(r.TourId > 0, "tourId", "Choose a tour.")
            .Check(r.Capacity is >= 1 and <= 200, "capacity", "Use 1 to 200 seats.")
            .Check(r.Price > 0, "price", "Enter a positive price.")
            .Check(r.Status is "Open" or "Closed" or "Cancelled", "status", "Use Open, Closed or Cancelled.")
            .ThrowIfAny();
        return repo.UpsertDepartureAsync(id, r with { DepartureDate = r.DepartureDate!.Value.Date }, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<CostAssumptionRow>> CostAssumptionsAsync(CancellationToken ct) => repo.CostAssumptionsAsync(ct);

    public Task UpdateCostAssumptionAsync(string key, CostAssumptionRequest r, CancellationToken ct) =>
        r.Value is < 0 or > 10_000_000 ? throw AppException.Validation("value", "Use 0 to 10,000,000.") : repo.UpdateCostAssumptionAsync(key, r.Value, current.RequireUserId(), current.CorrelationId, ct);

    public Task<IReadOnlyList<TaskRow>> TasksAsync(bool mine, string? status, bool overdue, CancellationToken ct) =>
        repo.TasksAsync(mine ? current.RequireUserId() : null, status, overdue, ct);

    public Task UpdateTaskAsync(int id, TaskActionRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(r.Action is "take" or "assign" or "start" or "done", "action", "Use take, assign, start or done.")
            .Check(r.Action != "assign" || r.AssignToUserId is not null, "assignToUserId", "Choose a staff member.")
            .Check((r.Note?.Length ?? 0) <= 1000, "note", "Use at most 1000 characters.")
            .ThrowIfAny();
        return repo.UpdateTaskAsync(id, r.Action, r.AssignToUserId, r.Note, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<RetentionPolicyRow>> RetentionPoliciesAsync(CancellationToken ct) => repo.RetentionPoliciesAsync(ct);

    public Task UpdateRetentionPolicyAsync(int id, RetentionPolicyRequest r, CancellationToken ct)
    {
        new FieldErrors().Check(r.KeepDays is >= 30 and <= 3650, "keepDays", "Use 30 to 3650 days.").Check(r.Action is "Anonymise" or "Delete" or "Keep", "action", "Choose an action.").ThrowIfAny();
        return repo.UpdateRetentionPolicyAsync(id, r, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<PrivacyRunRow> RunPrivacyAsync(bool dryRun, CancellationToken ct) => repo.RunPrivacyAsync(dryRun, current.RequireUserId(), current.CorrelationId, ct);
}

public sealed class ReconciliationService(IErpRepository repo, ICurrentUser current)
{
    private static void CheckPeriod(string? p) { if (!Regex.IsMatch(p ?? "", "^20[0-9]{2}-(0[1-9]|1[0-2])$")) throw AppException.Validation("period", "Use YYYY-MM."); }

    public Task<IReadOnlyList<ReconRow>> RunAsync(ReconRunRequest r, CancellationToken ct) { CheckPeriod(r.Period); return repo.RunReconciliationAsync(r.Period, current.RequireUserId(), current.CorrelationId, ct); }
    public Task<IReadOnlyList<ReconRow>> ListAsync(string? period, CancellationToken ct) { if (period is not null) CheckPeriod(period); return repo.ReconciliationsAsync(period, ct); }

    public Task ResolveAsync(int id, ReconResolveRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(r.Action is "accept" or "settle", "action", "Use accept or settle.")
            .Check(r.Action != "accept" || !string.IsNullOrWhiteSpace(r.Note), "note", "Explain why the difference is accepted.")
            .ThrowIfAny();
        return repo.ResolveReconciliationAsync(id, r.Action, r.Note?.Trim(), current.RequireUserId(), current.CorrelationId, ct);
    }
}

public sealed record GroupSimResult(GroupPlanSavedRow Plan, IReadOnlyList<GroupPlanOption> Options, object Inputs);

/// <summary>Group assembly + profitability. Maths is the pure Domain GroupPlanner; inputs and results are saved for reproducibility.</summary>
public sealed class GroupSimService(IErpRepository repo, ISettings settings, ICurrentUser current)
{
    public async Task<GroupSimResult> RunAsync(GroupSimRequest r, CancellationToken ct)
    {
        if (!await settings.GetBoolAsync("Feature.GroupSimulation", true, ct)) throw AppException.Forbidden("feature_disabled", "Group simulation is turned off in Settings.");
        if (r.TargetMarginPct is < 0 or > 80) throw AppException.Validation("targetMarginPct", "Use 0 to 80.");
        var inputs = await repo.GroupSimInputsAsync(r.DepartureId, ct);
        var dep = inputs.Departure ?? throw AppException.NotFound("Departure");
        var vehicles = inputs.Vehicles.Where(v => r.VehicleCodes is not { Count: > 0 } || r.VehicleCodes.Contains(v.Code))
            .Select(v => new VehicleOption(v.Code, v.Name, v.Seats, v.CostPerDay)).ToList();
        if (vehicles.Count == 0) throw AppException.Validation("vehicleCodes", "Choose at least one vehicle type.");
        decimal A(string key) => inputs.Assumptions.FirstOrDefault(a => a.AssumptionKey == key)?.Value ?? throw new AppException(422, "missing_assumption", $"Cost assumption {key} is missing.");
        var costs = new CostAssumptions(A("GuideCostPerDay"), A("MealCostPerPaxDay"), A("HotelCostPerPaxNight"), A("InsurancePerPax"), A("OverheadPct"));
        IReadOnlyList<GroupPlanOption> options;
        try { options = GroupPlanner.Plan(dep.Pax, dep.Days, dep.Revenue, vehicles, costs, r.TargetMarginPct); }
        catch (ArgumentException ex) { throw new AppException(422, "simulation_not_possible", ex.Message); }
        var best = options[0];
        var inputSnapshot = new { departure = dep, vehicles, costs, r.TargetMarginPct };
        var saved = await repo.SaveGroupPlanAsync(dep.DepartureId, JsonSerializer.Serialize(inputSnapshot), JsonSerializer.Serialize(options), best.OptionKey,
            best.TotalCost, best.Revenue, best.MarginPct, current.RequireUserId(), current.CorrelationId, ct);
        return new GroupSimResult(saved, options, inputSnapshot);
    }

    public async Task<GroupPlanSavedRow> SubmitAsync(int id, CancellationToken ct) =>
        await repo.SubmitGroupPlanAsync(id, current.RequireUserId(), current.CorrelationId, ct) ?? throw AppException.NotFound("Group plan");

    public Task<IReadOnlyList<GroupPlanRow>> ListAsync(int? departureId, CancellationToken ct) => repo.GroupPlansAsync(departureId, ct);
}
