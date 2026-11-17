using System.Text.RegularExpressions;

namespace Divakar.Sanpu.AiOps.Domain;

public sealed record PlaceInfo(int PlaceId, string PlaceCode, string PlaceName, string Category, TimeOnly OpenTime, TimeOnly CloseTime, bool WheelchairAccessible, decimal CostPerPax, string? SupplierName);

public sealed record PlanItem(string ItemKey, int DayNo, TimeOnly StartTime, int DurationMin, int PlaceId, string Title, string Category, string? DependsOnItemKey, string Status, decimal CostPerPax)
{
    public TimeOnly EndTime => StartTime.AddMinutes(DurationMin);
}

public sealed record Scenario(string Code, string Name, IReadOnlySet<string> AffectedCategories, string Effect, int DelayMinutes, int? DayNo);

public sealed record TripProfile(int Pax, string Pace, string MobilityNeeds, decimal BudgetPerPax);

public sealed record ConstraintRule(string Code, string RuleType, string? Value);

public sealed record Impact(string ItemKey, string Kind, string Reason, int ShiftMinutes = 0);

public sealed record Change(string Action, string ItemKey, int? FromPlaceId, int? ToPlaceId, string? NewStartTime, string Reason, decimal CostDeltaPerPax);

public sealed record ValidationCheck(string Name, bool Passed, string Detail);

public static class Categories
{
    public static readonly IReadOnlySet<string> All = new HashSet<string> { "Outdoor", "Indoor", "Rail", "Coach", "Hotel", "Meal" };
    public static readonly IReadOnlySet<string> Transport = new HashSet<string> { "Rail", "Coach" };
}

/// <summary>Applies a disruption scenario to an itinerary and follows the dependency graph. Deterministic: same inputs, same impacts.</summary>
public static class DisruptionSimulator
{
    public static IReadOnlyList<Impact> Simulate(IReadOnlyList<PlanItem> items, Scenario scenario, IReadOnlyDictionary<int, PlaceInfo> places)
    {
        var impacts = new Dictionary<string, Impact>();
        foreach (var i in items.Where(i => i.Status != "Cancelled" && scenario.AffectedCategories.Contains(i.Category) && (scenario.DayNo is null || i.DayNo == scenario.DayNo)))
        {
            impacts[i.ItemKey] = scenario.Effect == "Cancel"
                ? new Impact(i.ItemKey, "Cancelled", $"{scenario.Name}: {i.Category.ToLowerInvariant()} items cannot run")
                : new Impact(i.ItemKey, "Delayed", $"{scenario.Name}: starts {scenario.DelayMinutes} min late", scenario.DelayMinutes);
        }

        // follow dependencies until nothing changes (graph is small; guard against cycles with a pass limit)
        for (var pass = 0; pass < items.Count; pass++)
        {
            var changed = false;
            foreach (var i in items.Where(i => i.DependsOnItemKey is not null && !impacts.ContainsKey(i.ItemKey)))
            {
                if (!impacts.TryGetValue(i.DependsOnItemKey!, out var parent)) continue;
                var parentItem = items.First(x => x.ItemKey == parent.ItemKey);
                if (parent.Kind == "Cancelled")
                    impacts[i.ItemKey] = new Impact(i.ItemKey, "DependencyBroken", $"depends on cancelled item {parentItem.Title}");
                else if (parent.ShiftMinutes > 0 && i.DayNo == parentItem.DayNo)
                {
                    var parentEnd = parentItem.EndTime.AddMinutes(parent.ShiftMinutes);
                    var shift = parentEnd > i.StartTime ? (int)(parentEnd - i.StartTime).TotalMinutes : 0;
                    if (shift > 0) impacts[i.ItemKey] = new Impact(i.ItemKey, "Delayed", $"follows {parentItem.Title}, now {shift} min later", shift);
                    else continue;
                }
                else continue;
                changed = true;
            }
            if (!changed) break;
        }

        // delayed items that no longer fit opening hours become at risk
        foreach (var d in impacts.Values.Where(x => x.Kind == "Delayed").ToList())
        {
            var item = items.First(x => x.ItemKey == d.ItemKey);
            if (!places.TryGetValue(item.PlaceId, out var p)) continue;
            var newStart = item.StartTime.AddMinutes(d.ShiftMinutes);
            if (newStart < item.StartTime || newStart.AddMinutes(item.DurationMin) > p.CloseTime)
                impacts[d.ItemKey] = d with { Kind = "AtRisk", Reason = d.Reason + $"; would end after closing ({p.CloseTime:HH\\:mm})" };
        }
        return items.Where(i => impacts.ContainsKey(i.ItemKey)).Select(i => impacts[i.ItemKey]).ToList();
    }
}

/// <summary>Builds feasible recovery changes from verified place data only (no invented places, prices or times).
/// Rules: activities move to an unaffected activity category; transport moves to another supplier of the same mode;
/// mobility needs require accessible places; replacements must fit opening hours and are cheapest-first.</summary>
public static class RecoveryPlanner
{
    public static IReadOnlyList<Change> Plan(IReadOnlyList<PlanItem> items, IReadOnlyList<Impact> impacts, Scenario scenario, IReadOnlyList<PlaceInfo> candidates, TripProfile trip)
    {
        var changes = new List<Change>();
        var used = items.Select(i => (i.PlaceId, i.DayNo)).ToHashSet();     // a place may repeat on another day, never twice in one day
        var byKey = items.ToDictionary(i => i.ItemKey);
        foreach (var impact in impacts)
        {
            var item = byKey[impact.ItemKey];
            switch (impact.Kind)
            {
                case "Cancelled":
                case "AtRisk":
                    // an at-risk item is late: look for a replacement that fits at its new (shifted) start time
                    var target = impact.ShiftMinutes > 0 ? item with { StartTime = item.StartTime.AddMinutes(impact.ShiftMinutes) } : item;
                    var nextStart = items.Where(i => i.DayNo == item.DayNo && i.StartTime > item.StartTime).Select(i => (TimeOnly?)i.StartTime).Min();
                    var found = FindReplacement(target, scenario, candidates, trip, used, nextStart);
                    if (found is var (replacement, start))
                    {
                        used.Add((replacement.PlaceId, item.DayNo));
                        changes.Add(new Change("Replace", item.ItemKey, item.PlaceId, replacement.PlaceId, start != item.StartTime ? start.ToString("HH:mm") : null,
                            $"{impact.Reason}. Replaced with {replacement.PlaceName} ({replacement.Category}, open {replacement.OpenTime:HH\\:mm}–{replacement.CloseTime:HH\\:mm}{(replacement.WheelchairAccessible ? ", accessible" : "")}).",
                            replacement.CostPerPax - item.CostPerPax));
                    }
                    else changes.Add(new Change("Cancel", item.ItemKey, item.PlaceId, null, null, $"{impact.Reason}. No feasible replacement in verified place data.", -item.CostPerPax));
                    break;
                case "Delayed":
                    changes.Add(new Change("Shift", item.ItemKey, null, null, item.StartTime.AddMinutes(impact.ShiftMinutes).ToString("HH:mm"), impact.Reason, 0));
                    break;
                case "DependencyBroken":
                    var parentReplaced = changes.Any(c => c.ItemKey == item.DependsOnItemKey && c.Action == "Replace");
                    if (!parentReplaced) changes.Add(new Change("Flag", item.ItemKey, null, null, null, impact.Reason + "; check manually", 0));
                    break;
            }
        }
        return changes;
    }

    /// <summary>Cheapest verified place that fits. The start may move up to 60 minutes later to meet opening time,
    /// as long as the activity still ends before closing and before the next item of the day.</summary>
    private static (PlaceInfo Place, TimeOnly Start)? FindReplacement(PlanItem item, Scenario scenario, IReadOnlyList<PlaceInfo> candidates, TripProfile trip,
        HashSet<(int, int)> used, TimeOnly? nextStart)
    {
        var current = candidates.FirstOrDefault(c => c.PlaceId == item.PlaceId);
        IEnumerable<PlaceInfo> pool = Categories.Transport.Contains(item.Category)
            ? candidates.Where(c => c.Category == item.Category && c.SupplierName != current?.SupplierName)
            : item.Category is "Outdoor" or "Indoor"
                ? candidates.Where(c => c.Category is "Outdoor" or "Indoor" && !scenario.AffectedCategories.Contains(c.Category))
                : candidates.Where(c => c.Category == item.Category && !scenario.AffectedCategories.Contains(c.Category));
        return pool
            .Where(c => c.PlaceId != item.PlaceId && !used.Contains((c.PlaceId, item.DayNo)))
            .Where(c => trip.MobilityNeeds == "None" || c.WheelchairAccessible)
            .Where(c => c.CostPerPax - item.CostPerPax <= trip.BudgetPerPax * 0.1m)
            .Select(c => (Place: c, Start: item.StartTime >= c.OpenTime ? item.StartTime : c.OpenTime))
            .Where(x => (x.Start - item.StartTime).TotalMinutes <= 60 && x.Start.AddMinutes(item.DurationMin) <= x.Place.CloseTime
                        && x.Start.AddMinutes(item.DurationMin) > x.Start
                        && (nextStart is null || x.Start.AddMinutes(item.DurationMin) <= nextStart || Categories.Transport.Contains(item.Category)))
            .OrderBy(x => used.Any(u => u.Item1 == x.Place.PlaceId))          // variety first: a place not yet in the trip
            .ThenBy(x => x.Start).ThenBy(x => x.Place.CostPerPax).ThenBy(x => x.Place.PlaceCode, StringComparer.Ordinal)
            .Select(x => ((PlaceInfo, TimeOnly)?)(x.Place, x.Start))
            .FirstOrDefault();
    }

    /// <summary>The new itinerary that approval would save: base items with the validated changes applied.</summary>
    public static IReadOnlyList<PlanItem> Apply(IReadOnlyList<PlanItem> items, IReadOnlyList<Change> changes, IReadOnlyDictionary<int, PlaceInfo> places)
    {
        var result = new List<PlanItem>();
        foreach (var i in items)
        {
            var c = changes.FirstOrDefault(x => x.ItemKey == i.ItemKey);
            result.Add(c?.Action switch
            {
                "Replace" when c.ToPlaceId is int to && places.TryGetValue(to, out var p) => i with
                {
                    PlaceId = p.PlaceId, Title = p.PlaceName, Category = p.Category, CostPerPax = p.CostPerPax, Status = "Replaced",
                    StartTime = TimeOnly.TryParse(c.NewStartTime, out var rs) ? rs : i.StartTime
                },
                "Cancel" => i with { Status = "Cancelled" },
                "Shift" when TimeOnly.TryParse(c.NewStartTime, out var t) => i with { StartTime = t, Status = "Planned" },
                _ => i
            });
        }
        return result;
    }
}

/// <summary>Re-checks every proposal (deterministic or AI-ranked) against the database facts before a human sees it.</summary>
public static class ProposalValidator
{
    private static readonly HashSet<string> Actions = ["Replace", "Cancel", "Shift", "Flag"];

    public static IReadOnlyList<ValidationCheck> Validate(IReadOnlyList<PlanItem> baseItems, IReadOnlyList<Change> changes, IReadOnlyDictionary<int, PlaceInfo> regionPlaces,
        TripProfile trip, IReadOnlyList<ConstraintRule> rules, Scenario scenario)
    {
        var checks = new List<ValidationCheck>();
        var keys = baseItems.Select(i => i.ItemKey).ToHashSet();
        checks.Add(new("schema", changes.All(c => Actions.Contains(c.Action) && !string.IsNullOrWhiteSpace(c.Reason)), "every change has a known action and a reason"));
        checks.Add(new("items exist", changes.All(c => keys.Contains(c.ItemKey)), "every change refers to an item in the base version"));
        var grounded = changes.Where(c => c.Action == "Replace").All(c => c.ToPlaceId is int id && regionPlaces.ContainsKey(id));
        checks.Add(new("grounded places", grounded, "every replacement place exists in the Places table for this region"));
        var after = RecoveryPlanner.Apply(baseItems, changes, regionPlaces);
        var active = after.Where(i => i.Status != "Cancelled").ToList();
        checks.Add(new("scenario respected", !active.Any(i => scenario.Effect == "Cancel" && scenario.AffectedCategories.Contains(i.Category) && (scenario.DayNo is null || i.DayNo == scenario.DayNo)
                                                         && !Categories.Transport.Contains(i.Category)),
            "no remaining item is in a category the scenario closes"));
        foreach (var rule in rules)
        {
            switch (rule.RuleType)
            {
                case "MobilityNeedsAccessible" when trip.MobilityNeeds != "None":
                    var bad = active.Where(i => changes.Any(c => c.ItemKey == i.ItemKey) && regionPlaces.TryGetValue(i.PlaceId, out var p) && !p.WheelchairAccessible).Select(i => i.Title).ToList();
                    checks.Add(new("accessibility", bad.Count == 0, bad.Count == 0 ? "changed items are accessible" : "not accessible: " + string.Join(", ", bad)));
                    break;
                case "RespectOpeningHours":
                    var closed = active.Where(i => regionPlaces.TryGetValue(i.PlaceId, out var p) && (i.StartTime < p.OpenTime || i.EndTime > p.CloseTime) && changes.Any(c => c.ItemKey == i.ItemKey))
                        .Select(i => i.Title).ToList();
                    checks.Add(new("opening hours", closed.Count == 0, closed.Count == 0 ? "changed items fit opening hours" : "outside opening hours: " + string.Join(", ", closed)));
                    break;
                case "MaxItemsPerDay" when int.TryParse(rule.Value, out var max):
                    var busy = active.GroupBy(i => i.DayNo).Where(g => g.Count() > max).Select(g => g.Key).ToList();
                    checks.Add(new("items per day", busy.Count == 0, busy.Count == 0 ? $"at most {max} per day" : "too many items on day " + string.Join(", ", busy)));
                    break;
                case "LatestHotelCheckIn" when TimeOnly.TryParse(rule.Value, out var latest):
                    var late = active.Where(i => i.Category == "Hotel" && i.StartTime > latest).Select(i => i.Title).ToList();
                    checks.Add(new("hotel check-in", late.Count == 0, late.Count == 0 ? $"check-in before {latest:HH\\:mm}" : "late check-in: " + string.Join(", ", late)));
                    break;
            }
        }
        return checks;
    }
}

/// <summary>Blocks obvious prompt-injection / exfiltration attempts before text reaches a model. Patterns come from AppSettings.</summary>
public static class InjectionGuard
{
    public static (bool Blocked, string? Pattern) Check(string text, IEnumerable<string> patterns)
    {
        foreach (var p in patterns)
        {
            try { if (Regex.IsMatch(text, p, RegexOptions.IgnoreCase, TimeSpan.FromMilliseconds(50))) return (true, p); }
            catch (Exception ex) when (ex is ArgumentException or RegexMatchTimeoutException) { }
        }
        return (false, null);
    }
}

/// <summary>Removes phone numbers, emails and ID/passport numbers from text before it is stored for review or sent to a model.</summary>
public static class PiiRedactor
{
    private static readonly (Regex Pattern, string Label)[] Rules =
    [
        (new Regex(@"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", RegexOptions.Compiled), "[email]"),
        (new Regex(@"(?<![\d\-])\+?\d{1,4}[ \-]?\d{2,4}[ \-]?\d{3}(?:[ \-]?\d{3,4})?(?![\d\-])", RegexOptions.Compiled), "[phone]"),
        (new Regex(@"\b[A-Z]{1,2}\d{7,9}\b", RegexOptions.Compiled), "[id-number]")
    ];

    public static (string Text, int Count) Redact(string text)
    {
        var count = 0;
        foreach (var (pattern, label) in Rules) text = pattern.Replace(text, _ => { count++; return label; });
        return (text, count);
    }
}
