using Divakar.Sanpu.AiOps.Application;
using Divakar.Sanpu.Core.Api;
using Divakar.Sanpu.Core.Application;
using Microsoft.AspNetCore.Mvc;
namespace Divakar.Sanpu.AiOps.Api;

[ApiController, Route("api/v1"), Tags("Trips (traveler)")]
public sealed class TravelerController(TripService trips, CopilotAdminService admin) : ControllerBase
{
    /// <summary>Public home-page showcase (regions with images, active templates). Read-only, no personal data.</summary>
    [HttpGet("public/showcase"), Microsoft.AspNetCore.Authorization.AllowAnonymous]
    public async Task<PublicShowcase> Showcase(CancellationToken ct) { var l = await admin.LookupsAsync(ct); return new PublicShowcase(l.Regions, l.Templates); }

    [HttpGet("trip-options"), HasPermission("Trip.Create|Trip.View|Scenario.View|Scenario.Edit")]
    public Task<AiLookups> Options(CancellationToken ct) => admin.LookupsAsync(ct);

    /// <summary>Create a trip and build version 1 from the chosen DB template (deterministic rules; the model may only write the summary).</summary>
    [HttpPost("trips"), HasPermission("Trip.Create")]
    public async Task<IActionResult> Create(CreateTripRequest r, CancellationToken ct) => StatusCode(201, await trips.CreateAsync(r, ct));

    [HttpGet("my/trips"), HasPermission("Trip.ViewOwn")]
    public Task<IReadOnlyList<TripListRow>> Mine(CancellationToken ct) => trips.MineAsync(ct);

    /// <summary>Own trip only: another traveler's trip id returns 404.</summary>
    [HttpGet("my/trips/{id:int}"), HasPermission("Trip.ViewOwn")]
    public Task<TripDetail> MyTrip(int id, CancellationToken ct) => trips.MyTripAsync(id, ct);
}

[ApiController, Route("api/v1/aiops"), Tags("Copilot")]
public sealed class CopilotController(TripService trips, RecoveryService recovery, SearchService search, CopilotAdminService admin) : ControllerBase
{
    [HttpGet("dashboard"), HasPermission("AiOps.Dashboard.View")]
    public Task<AiDashboard> Dashboard(CancellationToken ct) => admin.DashboardAsync(ct);

    /// <summary>Natural-language search with row scoping: staff (Trip.View) see all trips, travelers only their own. Injection attempts are blocked.</summary>
    [HttpPost("search"), HasPermission("Ai.Search")]
    public Task<SearchResult> Search(SearchRequest r, CancellationToken ct) => search.AskAsync(r, ct);

    [HttpGet("trips"), HasPermission("Trip.View")]
    public Task<IReadOnlyList<TripListRow>> Trips([FromQuery] string? search, [FromQuery] string? status, CancellationToken ct) => trips.ListAsync(search, status, ct);

    [HttpGet("trips/{id:int}"), HasPermission("Trip.View")]
    public Task<TripDetail> Trip(int id, [FromQuery] int? version, CancellationToken ct) => trips.GetAsync(id, version, ct);

    /// <summary>Deterministic disruption simulation over the dependency graph; saved for audit.</summary>
    [HttpPost("simulations"), HasPermission("Simulation.Run")]
    public Task<SimulationResult> Simulate(SimulateRequest r, CancellationToken ct) => recovery.SimulateAsync(r, ct);

    /// <summary>Build a recovery proposal from verified places, validate it, and (if available) let the model explain it. Status PendingReview.</summary>
    [HttpPost("simulations/{id:int}/proposal"), HasPermission("Simulation.Run")]
    public Task<ProposalDetail> Propose(int id, ProposalRequest r, CancellationToken ct) => recovery.ProposeAsync(id, r, ct);

    [HttpGet("proposals"), HasPermission("Proposal.View")]
    public Task<IReadOnlyList<ProposalListRow>> Proposals([FromQuery] string? status, CancellationToken ct) => recovery.ListAsync(status, ct);

    [HttpGet("proposals/{id:int}"), HasPermission("Proposal.View")]
    public Task<ProposalDetail> Proposal(int id, CancellationToken ct) => recovery.GetAsync(id, ct);

    /// <summary>Human approval. Approve saves a new itinerary version in one transaction; the proposer cannot approve (403 self_approval).</summary>
    [HttpPost("proposals/{id:int}/decision"), HasPermission("Ai.Proposal.Approve")]
    public Task<DecisionResultRow?> Decide(int id, ProposalDecisionRequest r, CancellationToken ct) => recovery.DecideAsync(id, r, ct);
}

[ApiController, Route("api/v1/aiops/documents"), Tags("Document intake")]
public sealed class DocumentsController(DocumentService docs) : ControllerBase
{
    /// <summary>Upload .txt/.pdf/.png up to Docs.MaxUploadBytes. Checked by extension and magic bytes; PII redacted before extraction.</summary>
    [HttpPost, HasPermission("Document.Upload"), RequestSizeLimit(2_200_000)]
    public async Task<IActionResult> Upload(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) throw AppException.Validation("file", "Choose a file.");
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        return StatusCode(201, await docs.UploadAsync(file.FileName, ms.ToArray(), ct));
    }

    [HttpGet, HasPermission("Document.Upload|Document.Review")]
    public Task<IReadOnlyList<DocListRow>> List([FromQuery] string? status, CancellationToken ct) => docs.ListAsync(status, ct);

    [HttpGet("{id:int}"), HasPermission("Document.Upload|Document.Review")]
    public Task<DocDetail> Get(int id, CancellationToken ct) => docs.GetAsync(id, ct);

    [HttpPost("{id:int}/review"), HasPermission("Document.Review")]
    public async Task<IActionResult> Review(int id, DocReviewRequest r, CancellationToken ct) { await docs.ReviewAsync(id, r, ct); return NoContent(); }
}

[ApiController, Route("api/v1/aiops"), Tags("Planning rules & AI model")]
public sealed class RulesController(CopilotAdminService admin, EvalService evals, AdminService coreAdmin) : ControllerBase
{
    [HttpGet("scenarios"), HasPermission("Scenario.View|Simulation.Run")]
    public Task<IReadOnlyList<ScenarioRow>> Scenarios(CancellationToken ct) => admin.ScenariosAsync(ct);
    [HttpPost("scenarios"), HasPermission("Scenario.Edit")]
    public async Task<object> CreateScenario(ScenarioRequest r, CancellationToken ct) => new { id = await admin.SaveScenarioAsync(null, r, ct) };
    [HttpPut("scenarios/{id:int}"), HasPermission("Scenario.Edit")]
    public async Task<object> UpdateScenario(int id, ScenarioRequest r, CancellationToken ct) => new { id = await admin.SaveScenarioAsync(id, r, ct) };

    [HttpGet("templates"), HasPermission("Template.Edit")]
    public Task<TemplateCatalog> Templates(CancellationToken ct) => admin.TemplatesAsync(ct);
    [HttpPost("templates"), HasPermission("Template.Edit")]
    public async Task<object> CreateTemplate(TemplateRequest r, CancellationToken ct) => new { id = await admin.SaveTemplateAsync(null, r, ct) };
    [HttpPut("templates/{id:int}"), HasPermission("Template.Edit")]
    public async Task<object> UpdateTemplate(int id, TemplateRequest r, CancellationToken ct) => new { id = await admin.SaveTemplateAsync(id, r, ct) };

    [HttpGet("constraints"), HasPermission("Constraint.Edit")]
    public Task<IReadOnlyList<ConstraintRow>> Constraints(CancellationToken ct) => admin.ConstraintsAsync(ct);
    [HttpPut("constraints/{id:int}"), HasPermission("Constraint.Edit")]
    public async Task<IActionResult> UpdateConstraint(int id, ConstraintRequest r, CancellationToken ct) { await admin.UpdateConstraintAsync(id, r, ct); return NoContent(); }

    /// <summary>AI status (key present? budget?) plus the Ai.* settings and prompt versions. The API key value is never returned.</summary>
    [HttpGet("ai-config"), HasPermission("Ai.Config.View")]
    public async Task<object> AiConfig(CancellationToken ct) => new
    {
        status = await admin.StatusAsync(ct),
        settings = (await coreAdmin.GetSettingsAsync("AI", ct)).Select(s => new { s.SettingKey, s.SettingValue, s.ValueType, s.Description, s.ValidationJson, s.IsEditable, s.RowVersion }),
        prompts = await admin.PromptsAsync(ct)
    };

    /// <summary>Change one Ai.* setting (typed validation from the shared settings engine).</summary>
    [HttpPut("ai-config/{key}"), HasPermission("Ai.Config.Edit")]
    public async Task<IActionResult> UpdateAiSetting(string key, SettingUpsertRequest r, CancellationToken ct)
    {
        if (!key.StartsWith("Ai.", StringComparison.Ordinal)) throw AppException.Forbidden("forbidden", "Only Ai.* settings can be changed here.");
        await coreAdmin.UpsertSettingAsync(key, r with { ValueType = null, Category = null }, ct);
        return NoContent();
    }

    /// <summary>Save a new prompt version (old versions stay read-only for reproducibility).</summary>
    [HttpPost("prompts/{key}"), HasPermission("Ai.Config.Edit")]
    public async Task<IActionResult> SavePrompt(string key, PromptSaveRequest r, CancellationToken ct) { await admin.SavePromptAsync(key, r, ct); return NoContent(); }

    [HttpGet("evals"), HasPermission("Ai.Eval.Run")]
    public Task<EvalReport> Evals(CancellationToken ct) => evals.ReportAsync(ct);
    [HttpPost("evals/run"), HasPermission("Ai.Eval.Run")]
    public Task<EvalReport> RunEvals(CancellationToken ct) => evals.RunAsync(ct);
    [HttpPost("evals/results/{id:int}/feedback"), HasPermission("Ai.Eval.Run")]
    public async Task<IActionResult> Feedback(int id, EvalFeedbackRequest r, CancellationToken ct) { await evals.FeedbackAsync(id, r, ct); return NoContent(); }

    [HttpGet("ai-usage"), HasPermission("Ai.Usage.View")]
    public Task<UsageReport> Usage([FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct) => admin.UsageAsync(from, to, ct);
}

[ApiController, Route("api/v1"), Tags("AI assistant")]
public sealed class AssistantController(AssistantService assistant) : ControllerBase
{
    /// <summary>One chat turn. Send the conversation so far (user/assistant text). The reply comes with cards (tours, options, comparisons, a booking to confirm).</summary>
    [HttpPost("assistant/chat"), Microsoft.AspNetCore.Authorization.AllowAnonymous, Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("public")]
    public Task<ChatReply> Chat(ChatRequest r, CancellationToken ct) => assistant.ChatAsync(r, ct);

    [HttpGet("my/bookings"), HasPermission("Reservation.ViewOwn")]
    public Task<IReadOnlyList<ReservationRow>> MyBookings(CancellationToken ct) => assistant.MineAsync(ct);

    /// <summary>The traveler pays (sandbox): Deposit, Full or Balance. Confirms the booking when fully paid.</summary>
    [HttpPost("my/bookings/{id:int}/pay"), HasPermission("Reservation.ViewOwn")]
    public Task<ReservationRow> Pay(int id, PayRequest r, CancellationToken ct) => assistant.PayAsync(id, r, ct);

    [HttpPost("my/bookings/{id:int}/cancel"), HasPermission("Reservation.ViewOwn")]
    public Task<ReservationRow> Cancel(int id, CancellationToken ct) => assistant.CancelAsync(id, ct);

    /// <summary>Staff: every booking made through the assistant.</summary>
    [HttpGet("aiops/reservations"), HasPermission("Reservation.View")]
    public Task<IReadOnlyList<ReservationRow>> All([FromQuery] string? status, CancellationToken ct) => assistant.AllAsync(status, ct);
}

[ApiController, Route("api/v1/assistant"), Tags("AI assistant")]
public sealed class AssistantDirectController(AssistantService assistant) : ControllerBase
{
    /// <summary>"Book this" on an option card: prepares the booking at the live price without a model call. The traveler still confirms and pays.</summary>
    [HttpPost("prepare"), HasPermission("Assistant.Use")]
    public Task<ChatReply> Prepare(System.Text.Json.JsonElement input, CancellationToken ct) => assistant.PrepareDirectAsync(input, ct);
}
