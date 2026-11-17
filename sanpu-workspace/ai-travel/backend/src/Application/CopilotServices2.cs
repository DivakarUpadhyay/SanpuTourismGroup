using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Divakar.Sanpu.AiOps.Domain;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Domain;

namespace Divakar.Sanpu.AiOps.Application;

/// <summary>Natural-language search. The question becomes a fixed, schema-checked filter (by the model or a keyword parser);
/// the stored procedure applies the caller's row scope first. The model never writes SQL and never sees rows.</summary>
public sealed class SearchService(IAiOpsRepository repo, AiGateway ai, ISettings settings, ICurrentUser current, IClock clock)
{
    private static readonly string[] Mobility = ["None", "LimitedWalking", "Wheelchair"];
    private static readonly string[] Statuses = ["Draft", "Active", "Disrupted", "Completed"];

    public async Task<SearchResult> AskAsync(SearchRequest r, CancellationToken ct)
    {
        var q = r.Question?.Trim() ?? "";
        if (q.Length is 0 or > 500) throw AppException.Validation("question", "Ask a question of 1–500 characters.");
        var canViewAll = current.Has("Trip.View");
        if (!canViewAll && !current.Has("Trip.ViewOwn")) throw AppException.Forbidden();
        var scope = canViewAll ? "all trips (staff)" : "only your own trips";
        if (!canViewAll && !await settings.GetBoolAsync("Feature.CustomerAsk", true, ct)) throw AppException.Forbidden("feature_disabled", "Asking about trips is turned off.");

        var (blocked, pattern) = InjectionGuard.Check(q, await settings.GetListAsync("Ai.InjectionPatterns", ct));
        if (blocked)
        {
            await repo.WriteUsageAsync("search.parse", "guard", null, 0, 0, 0, 0, "blocked_injection", null, current.UserId, current.CorrelationId, ct);
            return new SearchResult(q, true, "The question looks like an attempt to change the assistant's rules, so it was not run.", null, "guard", [], scope, $"matched rule: {pattern}");
        }

        var (regions, suppliers) = await repo.SearchVocabularyAsync(ct);
        SearchFilter? filter = null;
        var by = "keyword parser (deterministic)";
        string? notice = null;
        var codes = regions.Select(x => x.Code).ToList();
        var result = await ai.CompleteJsonAsync("search.parse", "search.parse",
            new Dictionary<string, string> { ["regions"] = JsonSerializer.Serialize(codes), ["question"] = JsonSerializer.Serialize(q) }, e => ValidateFilter(e, codes), ct);
        if (result.Ok)
        {
            var e = result.Json!.Value;
            string? S(string n) => e.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
            filter = new SearchFilter(S("regionCode"), S("supplierText"), S("month"), S("mobility"), S("status"), S("text"));
            by = $"AI ({result.Model}) → schema-checked filter";
        }
        else
        {
            notice = result.Message;
            filter = KeywordParse(q, regions, suppliers, clock.UtcNow);
        }
        DateTime? month = filter.Month is not null && DateTime.TryParseExact(filter.Month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var m) ? m : null;
        var rows = await repo.SearchTripsAsync(current.RequireUserId(), canViewAll, filter, month, ct);
        return new SearchResult(q, false, null, filter, by, rows, scope, notice);
    }

    private static string? ValidateFilter(JsonElement e, IReadOnlyList<string> regions)
    {
        string? S(string n) => e.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        foreach (var p in e.EnumerateObject())
            if (p.Name is not ("regionCode" or "supplierText" or "month" or "mobility" or "status" or "text")) return $"unexpected field {p.Name}";
            else if (p.Value.ValueKind is not (JsonValueKind.String or JsonValueKind.Null)) return $"{p.Name} must be a string or null";
        if (S("regionCode") is string rc && !regions.Contains(rc)) return "unknown region";
        if (S("month") is string mo && !Regex.IsMatch(mo, "^20[0-9]{2}-(0[1-9]|1[0-2])$")) return "month must be YYYY-MM";
        if (S("mobility") is string mb && !Mobility.Contains(mb)) return "unknown mobility";
        if (S("status") is string st && !Statuses.Contains(st)) return "unknown status";
        if ((S("supplierText")?.Length ?? 0) > 100 || (S("text")?.Length ?? 0) > 100) return "text too long";
        return null;
    }

    /// <summary>Fallback interpretation when no model is available. Recognises region names, supplier names, months, mobility words and status words.</summary>
    public static SearchFilter KeywordParse(string q, IReadOnlyList<RegionRow> regions, IReadOnlyList<string> suppliers, DateTime now)
    {
        var lower = q.ToLowerInvariant();
        var region = regions.FirstOrDefault(r => lower.Contains(r.Code.ToLowerInvariant()) || r.Name.Split([' ', '/'], StringSplitOptions.RemoveEmptyEntries).Any(w => w.Length > 2 && lower.Contains(w.ToLowerInvariant())))?.Code;
        string? supplier = null;
        foreach (var s in suppliers)
        {
            var word = s.Replace("DEMO", "").Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault(w => w.Length > 3 && lower.Contains(w.ToLowerInvariant()));
            if (word is not null) { supplier = word; break; }
        }
        string? month = Regex.Match(q, "20[0-9]{2}-(0[1-9]|1[0-2])") is { Success: true } mm ? mm.Value : null;
        if (month is null)
        {
            var names = CultureInfo.InvariantCulture.DateTimeFormat.MonthNames;
            for (var i = 0; i < 12; i++)
                if (Regex.IsMatch(lower, $@"\b({names[i].ToLowerInvariant()}|{names[i][..3].ToLowerInvariant()})\b"))
                {
                    var year = i + 1 < now.Month ? now.Year + 1 : now.Year;
                    month = $"{year}-{i + 1:00}";
                    break;
                }
        }
        var mobility = Regex.IsMatch(lower, "wheelchair") ? "Wheelchair" : Regex.IsMatch(lower, "elderly|parents|limited walking|mobility|senior") ? "LimitedWalking" : null;
        var status = Regex.IsMatch(lower, "disrupt") ? "Disrupted" : Regex.IsMatch(lower, "draft") ? "Draft" : null;
        var tripRef = Regex.Match(q, @"TR-\d{4}", RegexOptions.IgnoreCase) is { Success: true } tr ? tr.Value.ToUpperInvariant() : null;
        return new SearchFilter(region, supplier, month, mobility, status, tripRef);
    }
}

/// <summary>Document intake: strict file checks, private storage, PII redaction, rule-based extraction with confidence and source spans,
/// optional AI extraction for missing fields, then human review. Nothing changes a trip until a reviewer accepts.</summary>
public sealed class DocumentService(IAiOpsRepository repo, IDocumentStore store, AiGateway ai, ISettings settings, ICurrentUser current)
{
    private static readonly string[] FieldNames = ["supplier", "hotelName", "checkIn", "nights", "guests", "confirmationNo", "vehicle", "serviceDate"];

    public async Task<DocDetail> UploadAsync(string fileName, byte[] content, CancellationToken ct)
    {
        var max = await settings.GetIntAsync("Docs.MaxUploadBytes", 2_097_152, ct);
        var allowed = await settings.GetListAsync("Docs.AllowedExtensions", ct);
        var safeName = Regex.Replace(Path.GetFileName(fileName ?? "upload"), @"[^\w.\- ]", "_");
        if (safeName.Length > 200) safeName = safeName[^200..];
        var ext = Path.GetExtension(safeName).ToLowerInvariant();
        new FieldErrors()
            .Check(content.Length is > 0 && content.Length <= max, "file", $"Upload 1 byte to {max / 1024} KB.")
            .Check(allowed.Contains(ext), "file", $"Allowed types: {string.Join(", ", allowed)}.")
            .ThrowIfAny();
        var (ok, contentType) = Sniff(ext, content);
        if (!ok) throw AppException.Validation("file", "The file content does not match its extension.");

        var text = ext == ".txt" ? Encoding.UTF8.GetString(content) : "";
        if (text.Contains('\0')) throw AppException.Validation("file", "Text files must not contain binary data.");
        var (redacted, redactions) = PiiRedactor.Redact(text);
        var fields = ExtractRules(redacted).ToList();
        var docType = Regex.IsMatch(redacted, "hotel|check-?in", RegexOptions.IgnoreCase) ? "HotelConfirmation"
                    : Regex.IsMatch(redacted, "coach|vehicle|bus", RegexOptions.IgnoreCase) ? "SupplierNotice" : "Other";
        if (redacted.Length > 0 && fields.Count < 4)
        {
            var result = await ai.CompleteJsonAsync("document.extract", "document.extract",
                new Dictionary<string, string> { ["fields"] = JsonSerializer.Serialize(FieldNames), ["text"] = JsonSerializer.Serialize(redacted.Length > 6000 ? redacted[..6000] : redacted) }, ValidateExtraction, ct);
            if (result.Ok)
                foreach (var f in result.Json!.Value.GetProperty("fields").EnumerateArray())
                {
                    var name = f.GetProperty("fieldName").GetString()!;
                    if (fields.Any(x => x.FieldName == name)) continue;
                    var value = f.GetProperty("value").GetString()!;
                    var at = redacted.IndexOf(value, StringComparison.OrdinalIgnoreCase);
                    // a value the model cannot point to in the document is treated as low confidence
                    fields.Add(new ExtractedField(name, value, Math.Min(0.8m, at >= 0 ? f.GetProperty("confidence").GetDecimal() : 0.3m), "AI", at >= 0 ? at : null, at >= 0 ? value.Length : null));
                }
        }
        var stored = await store.SaveAsync(content, ext, ct);
        var sha = Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();
        var created = await repo.CreateDocumentAsync(safeName, stored, contentType, content.Length, sha, docType,
            redacted.Length > 0 ? redacted : "(no text layer: binary file stored for manual review)", redactions, JsonSerializer.Serialize(fields, Map.Json), current.RequireUserId(), current.CorrelationId, ct);
        return await GetAsync(created.DocumentId, ct);
    }

    private static string? ValidateExtraction(JsonElement e)
    {
        if (!e.TryGetProperty("fields", out var f) || f.ValueKind != JsonValueKind.Array) return "fields must be an array";
        foreach (var x in f.EnumerateArray())
        {
            if (!x.TryGetProperty("fieldName", out var n) || n.ValueKind != JsonValueKind.String || !FieldNames.Contains(n.GetString())) return "unknown fieldName";
            if (!x.TryGetProperty("value", out var v) || v.ValueKind != JsonValueKind.String || v.GetString()!.Length > 300) return "value must be a short string";
            if (!x.TryGetProperty("confidence", out var c) || c.ValueKind != JsonValueKind.Number || c.GetDecimal() is < 0 or > 1) return "confidence must be 0..1";
        }
        return null;
    }

    public static (bool Ok, string ContentType) Sniff(string ext, byte[] b) => ext switch
    {
        ".pdf" => (b.Length > 4 && b[0] == 0x25 && b[1] == 0x50 && b[2] == 0x44 && b[3] == 0x46, "application/pdf"),
        ".png" => (b.Length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47, "image/png"),
        ".txt" => (IsUtf8(b), "text/plain"),
        _ => (false, "application/octet-stream")
    };

    private static bool IsUtf8(byte[] b)
    {
        try { _ = new UTF8Encoding(false, true).GetString(b); return true; } catch (DecoderFallbackException) { return false; }
    }

    public static IEnumerable<ExtractedField> ExtractRules(string text)
    {
        (string Field, string Pattern, decimal Confidence)[] rules =
        [
            ("supplier", @"Supplier\s*[:]\s*(.{3,100})", 0.9m),
            ("hotelName", @"Hotel\s*[:]\s*(.{3,100})", 0.9m),
            ("checkIn", @"Check-?in\s*(?:date)?\s*[:]?\s*(\d{4}-\d{2}-\d{2})", 0.92m),
            ("serviceDate", @"(?:Service\s+date|Date)\s*[:]\s*(\d{4}-\d{2}-\d{2})", 0.88m),
            ("nights", @"(\d{1,2})\s*nights?\b", 0.7m),
            ("guests", @"(\d{1,2})\s*(?:guests|pax|adults|travell?ers)\b", 0.65m),
            ("confirmationNo", @"(?:Confirmation|Booking|Ref(?:erence)?)\s*(?:No\.?|Number|#)?\s*[:]\s*([A-Z0-9\-]{5,20})", 0.9m),
            ("vehicle", @"Vehicle\s*[:]\s*(.{3,80})", 0.85m)
        ];
        foreach (var (field, pattern, confidence) in rules)
        {
            var m = Regex.Match(text, pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
            if (m.Success) yield return new ExtractedField(field, m.Groups[1].Value.Trim(), confidence, "Rule", m.Groups[1].Index, m.Groups[1].Length);
        }
    }

    public Task<IReadOnlyList<DocListRow>> ListAsync(string? status, CancellationToken ct) => repo.DocumentsAsync(status, ct);
    public async Task<DocDetail> GetAsync(int id, CancellationToken ct) => await repo.GetDocumentAsync(id, ct) ?? throw AppException.NotFound("Document");

    public async Task ReviewAsync(int id, DocReviewRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(r.Decision is "Accepted" or "Rejected", "decision", "Use Accepted or Rejected.")
            .Check(r.Decision != "Accepted" || r.TripId is not null, "tripId", "Choose the trip this document belongs to.")
            .Check(r.Decision != "Rejected" || !string.IsNullOrWhiteSpace(r.Comment), "comment", "Say why the document is rejected.")
            .Check((r.Fields ?? []).All(f => FieldNames.Contains(f.FieldName) && (f.ReviewedValue?.Length ?? 0) <= 300), "fields", "Unknown field or value too long.")
            .ThrowIfAny();
        await repo.ReviewDocumentAsync(id, r.Decision, r.TripId, r.Fields is null ? null : JsonSerializer.Serialize(r.Fields, Map.Json), r.Comment?.Trim(),
            RowVersions.Parse(r.RowVersion), current.RequireUserId(), current.CorrelationId, ct);
    }
}

/// <summary>Curated, fictional evaluation suite: accuracy, grounding, injection, permission-leak and output-validation cases from SQL.</summary>
public sealed class EvalService(IAiOpsRepository repo, AiGateway ai, ISettings settings, ICurrentUser current, IClock clock)
{
    public Task<EvalReport> ReportAsync(CancellationToken ct) => repo.EvalRunsAsync(ct);

    public async Task<EvalReport> RunAsync(CancellationToken ct)
    {
        var cases = await repo.EvalCasesAsync(ct);
        var trips = await repo.TripsAsync(null, null, ct);
        var scenarios = await repo.ScenariosAsync(ct);
        var patterns = await settings.GetListAsync("Ai.InjectionPatterns", ct);
        var results = new List<object>();
        int passed = 0, replacements = 0, groundedReplacements = 0;
        foreach (var c in cases)
        {
            using var input = JsonDocument.Parse(c.InputJson);
            using var expected = JsonDocument.Parse(c.ExpectedJson);
            string S(string n) => input.RootElement.TryGetProperty(n, out var v) ? v.GetString() ?? "" : "";
            bool ok; string detail;
            try
            {
                switch (c.Kind)
                {
                    case "Accuracy" or "Grounding":
                        var trip = trips.FirstOrDefault(t => t.Name == S("tripName")) ?? throw new InvalidOperationException("trip not found: " + S("tripName"));
                        var sc = scenarios.FirstOrDefault(s => s.Code == S("scenario")) ?? throw new InvalidOperationException("scenario not found");
                        var inputs = await repo.SimInputsAsync(trip.TripId, sc.ScenarioId, ct);
                        // always evaluate against version 1 (the seeded baseline), so approved recoveries do not change the score
                        var baseline = await repo.GetTripAsync(trip.TripId, null, 1, ct) ?? throw new InvalidOperationException("baseline version missing");
                        var items = baseline.Items.Select(i => new PlanItem(i.ItemKey, i.DayNo, Map.T(i.StartTime), i.DurationMin, i.PlaceId, i.Title, i.Category, i.DependsOnItemKey, "Planned", i.CostPerPax)).ToList();
                        var scenario = Map.Scenario(inputs.Scenario!);
                        var places = inputs.Places.Select(Map.Place).ToDictionary(p => p.PlaceId);
                        var impacts = DisruptionSimulator.Simulate(items, scenario, places);
                        var changes = RecoveryPlanner.Plan(items, impacts, scenario, places.Values.ToList(), Map.Trip(inputs.Trip!));
                        var after = RecoveryPlanner.Apply(items, changes, places);
                        var reps = changes.Where(x => x.Action == "Replace").ToList();
                        replacements += reps.Count;
                        groundedReplacements += reps.Count(x => x.ToPlaceId is int id && places.ContainsKey(id));
                        var e = expected.RootElement;
                        var checks = new List<(bool, string)>();
                        if (e.TryGetProperty("noOutdoorOnAffectedDays", out _))
                            checks.Add((!after.Any(i => i.Status != "Cancelled" && scenario.AffectedCategories.Contains(i.Category) && (scenario.DayNo is null || i.DayNo == scenario.DayNo)), "no affected-category items remain"));
                        if (e.TryGetProperty("minReplacements", out var minR)) checks.Add((reps.Count >= minR.GetInt32(), $"{reps.Count} replacement(s)"));
                        if (e.TryGetProperty("shiftedDependants", out _))
                        {
                            var shifted = changes.Where(x => x.Action == "Shift").Select(x => x.ItemKey).ToHashSet();
                            var dependantHandled = changes.Any(x => items.First(i => i.ItemKey == x.ItemKey).DependsOnItemKey is string d && shifted.Contains(d));
                            checks.Add((shifted.Count > 0 && dependantHandled, $"{shifted.Count} shifted; dependant {(dependantHandled ? "re-planned" : "not handled")}"));
                        }
                        if (e.TryGetProperty("replacementCategory", out var cat)) checks.Add((reps.Any(x => places[x.ToPlaceId!.Value].Category == cat.GetString()), "replacement in " + cat.GetString()));
                        if (e.TryGetProperty("allAccessible", out _)) checks.Add((reps.All(x => places[x.ToPlaceId!.Value].WheelchairAccessible), "all replacements accessible"));
                        if (e.TryGetProperty("allPlacesGrounded", out _)) checks.Add((reps.All(x => x.ToPlaceId is int id && places.ContainsKey(id)), "all places exist in DB"));
                        ok = checks.Count > 0 && checks.All(x => x.Item1);
                        detail = string.Join("; ", checks.Select(x => (x.Item1 ? "✓ " : "✗ ") + x.Item2));
                        break;
                    case "Injection":
                        var (blocked, pattern) = InjectionGuard.Check(S("question"), patterns);
                        ok = blocked == expected.RootElement.GetProperty("blocked").GetBoolean();
                        detail = blocked ? $"blocked by {pattern}" : "not blocked";
                        break;
                    case "PermissionLeak":
                        var userId = await repo.UserIdByEmailAsync(EmailAddress.Normalize(S("asUser")), ct) ?? throw new InvalidOperationException("user not found");
                        var (regions, suppliers) = await repo.SearchVocabularyAsync(ct);
                        var filter = SearchService.KeywordParse(S("question"), regions, suppliers, clock.UtcNow);
                        var rows = await repo.SearchTripsAsync(userId, false, filter with { Month = null }, null, ct);
                        var foreign = 0;
                        foreach (var row in rows) if (await repo.GetTripAsync(row.TripId, userId, null, ct) is null) foreign++;
                        ok = foreign == expected.RootElement.GetProperty("foreignRows").GetInt32();
                        detail = $"{rows.Count} row(s) returned, {foreign} belonging to someone else";
                        break;
                    case "Validation":
                        var parsed = AiGateway.ParseObject(S("modelOutput"));
                        var problem = parsed is null ? "not JSON" : AiSchemas.Explanation(parsed.Value);
                        ok = (problem is not null) == expected.RootElement.GetProperty("rejected").GetBoolean();
                        detail = problem is null ? "accepted" : "rejected: " + problem;
                        break;
                    default: ok = false; detail = "unknown kind"; break;
                }
            }
            catch (Exception ex) when (ex is InvalidOperationException or KeyNotFoundException or AppException)
            {
                ok = false; detail = "error: " + ex.Message;
            }
            if (ok) passed++;
            results.Add(new { caseId = c.CaseId, passed = ok, detail = detail.Length > 1000 ? detail[..1000] : detail });
        }
        var status = await ai.StatusAsync(ct);
        var grounding = replacements == 0 ? 1m : Math.Round((decimal)groundedReplacements / replacements, 3);
        await repo.SaveEvalRunAsync(cases.Count, passed, grounding, status.Available ? status.Model : "deterministic", JsonSerializer.Serialize(results), current.RequireUserId(), current.CorrelationId, ct);
        return await repo.EvalRunsAsync(ct);
    }

    public Task FeedbackAsync(int resultId, EvalFeedbackRequest r, CancellationToken ct) =>
        string.IsNullOrWhiteSpace(r.Feedback) || r.Feedback.Length > 500
            ? throw AppException.Validation("feedback", "Write 1–500 characters.")
            : repo.EvalFeedbackAsync(resultId, r.Feedback.Trim(), current.RequireUserId(), current.CorrelationId, ct);
}

/// <summary>Planning-rule administration (scenarios, templates, constraints), prompts, usage and the dashboard.</summary>
public sealed class CopilotAdminService(IAiOpsRepository repo, AiGateway ai, ICurrentUser current)
{
    public Task<AiLookups> LookupsAsync(CancellationToken ct) => repo.LookupsAsync(ct);

    public async Task<AiDashboard> DashboardAsync(CancellationToken ct)
    {
        var (k, recent, byRegion) = await repo.DashboardAsync(ct);
        return new AiDashboard(k, recent, byRegion, await ai.StatusAsync(ct));
    }

    public Task<AiStatus> StatusAsync(CancellationToken ct) => ai.StatusAsync(ct);
    public Task<IReadOnlyList<ScenarioRow>> ScenariosAsync(CancellationToken ct) => repo.ScenariosAsync(ct);

    public Task<int> SaveScenarioAsync(int? id, ScenarioRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(Regex.IsMatch(r.Code ?? "", "^[A-Z][A-Z0-9\\-]{2,29}$"), "code", "Use 3–30 capital letters, digits or dashes.")
            .Check(!string.IsNullOrWhiteSpace(r.Name) && r.Name.Length <= 150, "name", "Enter a name.")
            .Check(r.AffectedCategories is { Count: > 0 } && r.AffectedCategories.All(Categories.All.Contains), "affectedCategories", "Choose at least one known category.")
            .Check(r.Effect is "Cancel" or "Delay", "effect", "Use Cancel or Delay.")
            .Check(r.Effect != "Delay" || r.DelayMinutes is > 0 and <= 4320, "delayMinutes", "A delay needs 1–4320 minutes.")
            .Check(r.DayNo is null or >= 1 and <= 14, "dayNo", "Use 1–14 or leave empty for all days.")
            .Check((r.Description?.Length ?? 0) <= 500, "description", "Use at most 500 characters.")
            .ThrowIfAny();
        return repo.UpsertScenarioAsync(id, r with { DelayMinutes = r.Effect == "Delay" ? r.DelayMinutes : 0 }, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<ConstraintRow>> ConstraintsAsync(CancellationToken ct) => repo.ConstraintsAsync(ct);

    public async Task UpdateConstraintAsync(int id, ConstraintRequest r, CancellationToken ct)
    {
        var rule = (await repo.ConstraintsAsync(ct)).FirstOrDefault(c => c.ConstraintId == id) ?? throw AppException.NotFound("Constraint");
        var ok = rule.RuleType switch
        {
            "MaxItemsPerDay" => int.TryParse(r.Value, out var n) && n is >= 1 and <= 10,
            "NoStartBefore" or "LatestHotelCheckIn" => TimeOnly.TryParseExact(r.Value, "HH:mm", out _),
            _ => string.IsNullOrEmpty(r.Value)
        };
        if (!ok) throw AppException.Validation("value", rule.RuleType switch { "MaxItemsPerDay" => "Use 1–10.", "NoStartBefore" or "LatestHotelCheckIn" => "Use HH:mm.", _ => "This rule takes no value." });
        await repo.UpdateConstraintAsync(id, r, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<TemplateCatalog> TemplatesAsync(CancellationToken ct) => repo.TemplatesAsync(ct);

    public Task<int> SaveTemplateAsync(int? id, TemplateRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(Regex.IsMatch(r.Code ?? "", "^[A-Z][A-Z0-9\\-]{2,29}$"), "code", "Use 3–30 capital letters, digits or dashes.")
            .Check(!string.IsNullOrWhiteSpace(r.Name) && r.Name.Length <= 150, "name", "Enter a name.")
            .Check(r.Days is >= 1 and <= 14, "days", "Use 1–14 days.")
            .Check(r.Pace is "Relaxed" or "Balanced" or "Packed", "pace", "Choose a pace.")
            .ThrowIfAny();
        return repo.UpsertTemplateAsync(id, r, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<IReadOnlyList<PromptRow>> PromptsAsync(CancellationToken ct) => repo.PromptsAsync(ct);

    /// <summary>New prompt versions must keep the same {{placeholders}} as the active version, so a typo cannot break a feature.</summary>
    public async Task SavePromptAsync(string key, PromptSaveRequest r, CancellationToken ct)
    {
        var active = await repo.ActivePromptAsync(key, ct) ?? throw AppException.NotFound("Prompt");
        if (string.IsNullOrWhiteSpace(r.Body) || r.Body.Length > 8000) throw AppException.Validation("body", "Write 1–8000 characters.");
        static HashSet<string> Holes(string s) => Regex.Matches(s, @"\{\{(\w+)\}\}").Select(m => m.Groups[1].Value).ToHashSet();
        if (!Holes(active.Body).SetEquals(Holes(r.Body)))
            throw AppException.Validation("body", "Keep exactly these placeholders: " + string.Join(", ", Holes(active.Body).Select(h => "{{" + h + "}}")));
        await repo.SavePromptAsync(key, r.Body, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task<UsageReport> UsageAsync(DateTime? from, DateTime? to, CancellationToken ct) => repo.UsageAsync(from, to, ct);
}
