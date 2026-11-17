using System.Text.Json;
using Divakar.Sanpu.AiOps.Domain;
using Divakar.Sanpu.Core.Application;

namespace Divakar.Sanpu.AiOps.Application;

internal static class Map
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static TimeOnly T(string s) => TimeOnly.ParseExact(s, "HH:mm");
    public static PlaceInfo Place(PlaceTextRow p) => new(p.PlaceId, p.PlaceCode, p.PlaceName, p.Category, T(p.OpenTime), T(p.CloseTime), p.WheelchairAccessible, p.CostPerPax, p.SupplierName);
    public static PlaceInfo Place(PlaceRow p) => new(p.PlaceId, p.PlaceCode, p.PlaceName, p.Category, TimeOnly.FromTimeSpan(p.OpenTime), TimeOnly.FromTimeSpan(p.CloseTime), p.WheelchairAccessible, p.CostPerPax, p.SupplierName);
    public static PlanItem Item(SimItemRow i) => new(i.ItemKey, i.DayNo, T(i.StartTime), i.DurationMin, i.PlaceId, i.Title, i.Category, i.DependsOnItemKey, i.Status, i.CostPerPax);
    public static Scenario Scenario(SimScenarioRow s) => new(s.Code, s.Name, s.AffectedCategories.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToHashSet(), s.Effect, s.DelayMinutes, s.DayNo);
    public static TripProfile Trip(SimTripRow t) => new(t.Pax, t.Pace, t.MobilityNeeds, t.BudgetPerPax);
    public static string ItemsJson(IEnumerable<PlanItem> items) => JsonSerializer.Serialize(items.Select(i => new
    {
        itemKey = i.ItemKey, dayNo = i.DayNo, startTime = i.StartTime.ToString("HH:mm"), durationMin = i.DurationMin, placeId = i.PlaceId, title = i.Title,
        category = i.Category, dependsOnItemKey = i.DependsOnItemKey, status = i.Status, costPerPax = i.CostPerPax
    }));
}

/// <summary>Trip planning: build an itinerary from a DB template, adapt it to pace and mobility rules, optionally let the model write a summary.</summary>
public sealed class TripService(IAiOpsRepository repo, AiGateway ai, ISettings settings, ICurrentUser current)
{
    public async Task<TripDetail> CreateAsync(CreateTripRequest r, CancellationToken ct)
    {
        var lookups = await repo.LookupsAsync(ct);
        var template = lookups.Templates.FirstOrDefault(t => t.TemplateId == r.TemplateId);
        new FieldErrors()
            .Check(!string.IsNullOrWhiteSpace(r.Name) && r.Name.Trim().Length <= 120, "name", "Enter a trip name (max 120).")
            .Check(template is not null, "templateId", "Choose a template.")
            .Check(r.StartDate is not null, "startDate", "Choose a start date.")
            .Check(r.StartDate is null || r.StartDate.Value.Date >= DateTime.UtcNow.Date, "startDate", "The start date cannot be in the past.")
            .Check(r.StartDate is null || r.StartDate.Value.Date <= DateTime.UtcNow.Date.AddYears(2), "startDate", "Plan at most two years ahead.")
            .Check(r.Pax is >= 1 and <= 20, "pax", "Use 1 to 20 travelers.")
            .Check(r.Pace is "Relaxed" or "Balanced" or "Packed", "pace", "Choose a pace.")
            .Check(r.MobilityNeeds is "None" or "LimitedWalking" or "Wheelchair", "mobilityNeeds", "Choose mobility needs.")
            .Check(r.BudgetPerPax is >= 1000 and <= 500000, "budgetPerPax", "Use TWD 1,000 to 500,000.")
            .Check((r.Notes?.Length ?? 0) <= 1000, "notes", "Use at most 1000 characters.")
            .ThrowIfAny();
        var trip = await repo.CreateTripAsync(current.RequireUserId(), r with { Name = r.Name.Trim(), Notes = r.Notes?.Trim() }, template!.Days, current.CorrelationId, ct);
        await GenerateAsync(trip.TripId, ct);
        return await repo.GetTripAsync(trip.TripId, current.RequireUserId(), null, ct) ?? throw AppException.NotFound("Trip");
    }

    private async Task GenerateAsync(int tripId, CancellationToken ct)
    {
        var inputs = await repo.GenerationInputsAsync(tripId, ct);
        var trip = inputs.Trip ?? throw AppException.NotFound("Trip");
        var places = inputs.Places.Select(Map.Place).ToList();
        var noStartBefore = inputs.Constraints.FirstOrDefault(c => c.RuleType == "NoStartBefore" && c.IsActive)?.Value;
        var maxPerDay = int.TryParse(inputs.Constraints.FirstOrDefault(c => c.RuleType == "MaxItemsPerDay")?.Value, out var m) ? m : 99;
        if (trip.Pace == "Relaxed") maxPerDay = Math.Min(maxPerDay, 4);
        var earliest = TimeOnly.TryParse(noStartBefore, out var e) ? e : new TimeOnly(7, 0);
        if (trip.Pace == "Relaxed" && earliest < new TimeOnly(9, 0)) earliest = new TimeOnly(9, 0);

        var items = new List<PlanItem>();
        // a place may appear on several days but never twice in one day; template places count as used on their own day
        var used = inputs.TemplateItems.Select(t => (t.PlaceId, t.DayNo)).ToHashSet();
        var removed = 0;
        foreach (var t in inputs.TemplateItems)
        {
            var place = places.First(p => p.PlaceId == t.PlaceId);
            var start = TimeOnly.FromTimeSpan(t.StartTime);
            if (trip.MobilityNeeds != "None" && !place.WheelchairAccessible)
            {
                var alt = places.Where(p => p.Category == place.Category || (place.Category is "Outdoor" or "Indoor" && p.Category is "Outdoor" or "Indoor"))
                    .Where(p => p.WheelchairAccessible && !used.Contains((p.PlaceId, t.DayNo)) && start >= p.OpenTime && start.AddMinutes(t.DurationMin) <= p.CloseTime)
                    .OrderBy(p => used.Any(u => u.Item1 == p.PlaceId)).ThenBy(p => p.CostPerPax).FirstOrDefault();
                if (alt is null) { removed++; continue; }     // never keep an inaccessible activity for travelers with mobility needs
                place = alt;
                used.Add((alt.PlaceId, t.DayNo));
            }
            if (start < earliest && place.Category is not ("Rail" or "Coach")) start = earliest;
            items.Add(new PlanItem(t.ItemKey, t.DayNo, start, t.DurationMin, place.PlaceId, place.PlaceName, place.Category, t.DependsOnItemKey, "Planned", place.CostPerPax));
        }
        // drop dependencies on removed items so the plan stays consistent
        items = items.Select(i => i.DependsOnItemKey is string d && items.All(x => x.ItemKey != d) ? i with { DependsOnItemKey = null } : i).ToList();
        // respect activities-per-day: keep transport/hotel/meals, drop the latest optional activities first
        foreach (var day in items.GroupBy(i => i.DayNo).ToList())
        {
            var extra = day.Count() - maxPerDay;
            foreach (var drop in day.Where(i => i.Category is "Outdoor" or "Indoor" && !items.Any(x => x.DependsOnItemKey == i.ItemKey)).OrderByDescending(i => i.StartTime).Take(Math.Max(0, extra)).ToList())
                items.Remove(drop);
        }

        var summary = $"{trip.Days}-day {trip.Pace.ToLowerInvariant()} plan with {items.Count} items, built from the template by deterministic rules"
                      + (trip.MobilityNeeds != "None" ? $"; inaccessible places swapped for {trip.MobilityNeeds} needs" + (removed > 0 ? $" and {removed} activity(ies) without an accessible alternative removed." : ".") : ".");
        var data = JsonSerializer.Serialize(new { trip.Days, trip.Pace, trip.MobilityNeeds, items = items.Select(i => new { i.DayNo, start = i.StartTime.ToString("HH:mm"), i.Title, i.Category }) });
        var result = await ai.CompleteJsonAsync("itinerary.summary", "itinerary.summary", new Dictionary<string, string> { ["data"] = data }, AiSchemas.Summary, ct);
        if (result.Ok) summary = "AI-written summary (check it): " + result.Json!.Value.GetProperty("summary").GetString();
        await repo.SaveVersionAsync(tripId, "Template", summary, Map.ItemsJson(items), null, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<TripListRow>> MineAsync(CancellationToken ct) => repo.TripsForTravelerAsync(current.RequireUserId(), ct);

    /// <summary>Traveler scope is applied inside the procedure: another traveler's trip returns 404.</summary>
    public async Task<TripDetail> MyTripAsync(int id, CancellationToken ct) => await repo.GetTripAsync(id, current.RequireUserId(), null, ct) ?? throw AppException.NotFound("Trip");

    public Task<IReadOnlyList<TripListRow>> ListAsync(string? search, string? status, CancellationToken ct) => repo.TripsAsync(string.IsNullOrWhiteSpace(search) ? null : search.Trim(), status, ct);
    public async Task<TripDetail> GetAsync(int id, int? version, CancellationToken ct) => await repo.GetTripAsync(id, null, version, ct) ?? throw AppException.NotFound("Trip");
}

public sealed record SimulationResult(int SimulationId, string Scenario, IReadOnlyList<Impact> Impacts);

/// <summary>Disruption simulation → deterministic recovery plan → validation → optional AI explanation → human approval → new itinerary version.</summary>
public sealed class RecoveryService(IAiOpsRepository repo, AiGateway ai, ICurrentUser current)
{
    public async Task<SimulationResult> SimulateAsync(SimulateRequest r, CancellationToken ct)
    {
        var (inputs, items, scenario, places) = await LoadAsync(r.TripId, r.ScenarioId, ct);
        var impacts = DisruptionSimulator.Simulate(items, scenario, places);
        var id = await repo.SaveSimulationAsync(r.TripId, inputs.Trip!.VersionId!.Value, r.ScenarioId, JsonSerializer.Serialize(impacts, Map.Json), impacts.Count, current.RequireUserId(), current.CorrelationId, ct);
        return new SimulationResult(id, scenario.Name, impacts);
    }

    public async Task<ProposalDetail> ProposeAsync(int simulationId, ProposalRequest r, CancellationToken ct)
    {
        var sim = await repo.GetSimulationAsync(simulationId, ct) ?? throw AppException.NotFound("Simulation");
        var (inputs, items, scenario, places) = await LoadAsync(sim.TripId, sim.ScenarioId, ct);
        if (inputs.Trip!.VersionId != sim.VersionId) throw AppException.Conflict("stale_version", "The itinerary changed after this simulation. Run the simulation again.");
        var impacts = JsonSerializer.Deserialize<List<Impact>>(sim.ImpactJson, Map.Json) ?? [];
        if (impacts.Count == 0) throw AppException.Conflict("nothing_to_recover", "This scenario does not affect the trip, so no proposal is needed.");
        var trip = Map.Trip(inputs.Trip);
        var changes = RecoveryPlanner.Plan(items, impacts, scenario, places.Values.ToList(), trip);
        var checks = ProposalValidator.Validate(items, changes, places, trip, inputs.Rules.Select(x => new ConstraintRule(x.Code, x.RuleType, x.Value)).ToList(), scenario);
        var cost = changes.Sum(c => c.CostDeltaPerPax);
        var explanation = Deterministic(scenario, changes, items, places, cost);
        var source = "Deterministic";
        int? promptId = null;
        if (r.UseAi)
        {
            var data = JsonSerializer.Serialize(new
            {
                scenario = scenario.Name, trip = new { trip.Pax, trip.Pace, trip.MobilityNeeds },
                changes = changes.Select(c => new
                {
                    c.Action, item = items.First(i => i.ItemKey == c.ItemKey).Title,
                    replacement = c.ToPlaceId is int p && places.TryGetValue(p, out var pl) ? pl.PlaceName : null, c.NewStartTime, c.Reason, c.CostDeltaPerPax
                }),
                checks = checks.Select(x => new { x.Name, x.Passed })
            });
            var result = await ai.CompleteJsonAsync("recovery.explain", "recovery.explain", new Dictionary<string, string> { ["data"] = data }, AiSchemas.Explanation, ct);
            promptId = result.PromptId;
            if (result.Ok) { explanation = result.Json!.Value.GetProperty("explanation").GetString()!; source = "AI"; }
            else explanation += $"\n\n[{result.Message}]";
        }
        var saved = await repo.SaveProposalAsync(simulationId, sim.TripId, sim.VersionId, JsonSerializer.Serialize(changes, Map.Json), explanation, source,
            JsonSerializer.Serialize(checks, Map.Json), cost, promptId, current.RequireUserId(), current.CorrelationId, ct);
        return await GetAsync(saved.ProposalId, ct);
    }

    public Task<IReadOnlyList<ProposalListRow>> ListAsync(string? status, CancellationToken ct) => repo.ProposalsAsync(status, ct);

    public async Task<ProposalDetail> GetAsync(int id, CancellationToken ct)
    {
        var (p, items) = await repo.GetProposalAsync(id, ct);
        if (p is null) throw AppException.NotFound("Proposal");
        var canDecide = p.Status == "PendingReview" && current.Has("Ai.Proposal.Approve") && p.ProposedBy != current.UserId;
        return new ProposalDetail(p, items, canDecide);
    }

    public async Task<DecisionResultRow?> DecideAsync(int id, ProposalDecisionRequest r, CancellationToken ct)
    {
        if (r.Decision is not ("Approved" or "Rejected")) throw AppException.Validation("decision", "Use Approved or Rejected.");
        if (r.Decision == "Rejected" && string.IsNullOrWhiteSpace(r.Comment)) throw AppException.Validation("comment", "Say why the proposal is rejected.");
        var (p, baseItems) = await repo.GetProposalAsync(id, ct);
        if (p is null) throw AppException.NotFound("Proposal");
        string? newItems = null;
        if (r.Decision == "Approved")
        {
            var checks = JsonSerializer.Deserialize<List<ValidationCheck>>(p.ValidationJson, Map.Json) ?? [];
            if (checks.Any(c => !c.Passed && c.Name is "schema" or "items exist" or "grounded places"))
                throw AppException.Conflict("validation_failed", "This proposal failed a blocking check and cannot be approved.");
            var changes = JsonSerializer.Deserialize<List<Change>>(p.ChangesJson, Map.Json) ?? [];
            var sim = await repo.GetSimulationAsync(p.SimulationId, ct) ?? throw AppException.NotFound("Simulation");
            var inputs = await repo.SimInputsAsync(p.TripId, sim.ScenarioId, ct);
            var places = inputs.Places.Select(Map.Place).ToDictionary(x => x.PlaceId);
            newItems = Map.ItemsJson(RecoveryPlanner.Apply(baseItems.Select(Map.Item).ToList(), changes, places));
        }
        return await repo.DecideProposalAsync(id, r.Decision, r.Comment?.Trim(), newItems, RowVersions.Parse(r.RowVersion), current.RequireUserId(), current.CorrelationId, ct);
    }

    private async Task<(SimInputs Inputs, List<PlanItem> Items, Scenario Scenario, Dictionary<int, PlaceInfo> Places)> LoadAsync(int tripId, int scenarioId, CancellationToken ct)
    {
        var inputs = await repo.SimInputsAsync(tripId, scenarioId, ct);
        if (inputs.Trip is null) throw AppException.NotFound("Trip");
        if (inputs.Scenario is null) throw AppException.NotFound("Scenario");
        if (inputs.Trip.VersionId is null || inputs.Items.Count == 0) throw AppException.Conflict("no_itinerary", "This trip has no itinerary yet.");
        if (inputs.Scenario.RegionId is int region && region != inputs.Trip.RegionId) throw AppException.Conflict("scenario_other_region", "This scenario applies to another region.");
        return (inputs, inputs.Items.Select(Map.Item).ToList(), Map.Scenario(inputs.Scenario), inputs.Places.Select(Map.Place).ToDictionary(p => p.PlaceId));
    }

    public static string Deterministic(Scenario scenario, IReadOnlyList<Change> changes, IReadOnlyList<PlanItem> items, IReadOnlyDictionary<int, PlaceInfo> places, decimal cost)
    {
        var lines = changes.Select(c =>
        {
            var title = items.First(i => i.ItemKey == c.ItemKey).Title;
            return c.Action switch
            {
                "Replace" => $"• Replace {title} with {places[c.ToPlaceId!.Value].PlaceName}.",
                "Shift" => $"• Move {title} to {c.NewStartTime}.",
                "Cancel" => $"• Cancel {title} (no feasible replacement).",
                _ => $"• Check {title}: {c.Reason}"
            };
        });
        return $"{scenario.Name}. Rule-based recovery plan (deterministic):\n{string.Join("\n", lines)}\nCost change per traveler: TWD {cost:+0;-0;0}.";
    }
}
