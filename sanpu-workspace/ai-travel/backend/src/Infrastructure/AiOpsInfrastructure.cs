using System.Security.Cryptography;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Messages;
using Dapper;
using Divakar.Sanpu.AiOps.Application;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Infrastructure;

namespace Divakar.Sanpu.AiOps.Infrastructure;

/// <summary>Claude through the official Anthropic C# SDK. The key is read from the secret store (env / user-secrets / vault) by the name
/// held in AppSettings Ai.ApiKeyRef; without a key every call raises AiUnavailableException and callers use deterministic rules.</summary>
public sealed class AnthropicProvider(ISecretStore secrets) : IAiProvider
{
    private readonly string? _key = secrets.Get("ANTHROPIC_API_KEY");
    public string Name => "Anthropic";
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_key) && _key!.StartsWith("sk-", StringComparison.Ordinal);   // a placeholder is not a key

    public async Task<AiCompletion> CompleteAsync(string model, string system, string user, int maxTokens, TimeSpan timeout, CancellationToken ct)
    {
        if (!IsConfigured) throw new AiUnavailableException("unavailable", "ANTHROPIC_API_KEY is not configured.");
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout);
        var client = new AnthropicClient { ApiKey = _key };
        try
        {
            var response = await client.Messages.Create(new MessageCreateParams
            {
                Model = model,
                MaxTokens = maxTokens,
                System = system,
                Messages = [new UserMessageParam { Content = user }]
            }, cts.Token);
            var text = string.Concat(response.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
            return new AiCompletion(text, (int)response.Usage.InputTokens, (int)response.Usage.OutputTokens, model, response.StopReason?.ToString() ?? "");
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new TimeoutException("AI provider timeout"); }
        catch (AnthropicUnauthorizedException) { throw new AiUnavailableException("auth_failed", "The AI provider rejected the API key."); }
        catch (AnthropicRateLimitException) { throw new AiUnavailableException("rate_limited", "The AI provider is rate limiting; try again later."); }
        catch (AnthropicApiException ex) { throw new AiUnavailableException("provider_error", "The AI provider returned an error: " + ex.GetType().Name); }
        catch (HttpRequestException) { throw new AiUnavailableException("network_error", "The AI provider could not be reached."); }
    }
}

/// <summary>Private file storage: random file names, fixed root outside the web root, no user-controlled paths.</summary>
public sealed class LocalDocumentStore(string root) : IDocumentStore
{
    public async Task<string> SaveAsync(byte[] content, string extension, CancellationToken ct)
    {
        Directory.CreateDirectory(root);
        var name = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant() + extension;
        await File.WriteAllBytesAsync(Path.Combine(root, name), content, ct);
        return name;
    }
}

public sealed class AiOpsRepository(Db db) : IAiOpsRepository
{
    private static IReadOnlyList<T> L<T>(IEnumerable<T> x) => x.AsList();

    public Task<AiLookups> LookupsAsync(CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_AiOps_Lookups", null, async g => new AiLookups(L(await g.ReadAsync<RegionRow>()), L(await g.ReadAsync<TemplateOptionRow>()), L(await g.ReadAsync<ScenarioOptionRow>())), ct);

    public async Task<TripCreatedRow> CreateTripAsync(Guid travelerId, CreateTripRequest r, int days, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<TripCreatedRow>("dbo.usp_Trip_Create", new
        {
            TravelerUserId = travelerId, r.Name, r.TemplateId, StartDate = r.StartDate!.Value.Date, Days = days, r.Pax, r.Pace, r.MobilityNeeds, r.BudgetPerPax, r.Notes, CorrelationId = correlationId
        }, ct))!;

    public Task<GenerationInputs> GenerationInputsAsync(int tripId, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Trip_GenerationInputs", new { TripId = tripId }, async g => new GenerationInputs(
            await g.ReadFirstOrDefaultAsync<TripHeaderRow>(), L(await g.ReadAsync<TemplateItemRow>()), L(await g.ReadAsync<PlaceRow>()), L(await g.ReadAsync<ConstraintRow>())), ct);

    public async Task<VersionSavedRow> SaveVersionAsync(int tripId, string source, string summary, string itemsJson, int? proposalId, Guid actor, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<VersionSavedRow>("dbo.usp_Itinerary_SaveVersion", new { TripId = tripId, Source = source, Summary = summary, ItemsJson = itemsJson, ProposalId = proposalId, ActorUserId = actor, CorrelationId = correlationId }, ct))!;

    public Task<IReadOnlyList<TripListRow>> TripsForTravelerAsync(Guid travelerId, CancellationToken ct) => db.QueryAsync<TripListRow>("dbo.usp_Trip_ListForTraveler", new { TravelerUserId = travelerId }, ct);

    public Task<TripDetail?> GetTripAsync(int tripId, Guid? travelerScope, int? versionNo, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Trip_Get", new { TripId = tripId, TravelerUserId = travelerScope, VersionNo = versionNo }, async g =>
        {
            if (g.IsConsumed) return null;
            var trip = await g.ReadFirstOrDefaultAsync<TripDetailRow>();
            if (trip is null) return null;
            return new TripDetail(trip, L(await g.ReadAsync<VersionRow>()), L(await g.ReadAsync<ItemRow>()), L(await g.ReadAsync<ProposalBriefRow>()));
        }, ct);

    public Task<IReadOnlyList<TripListRow>> TripsAsync(string? search, string? status, CancellationToken ct) => db.QueryAsync<TripListRow>("dbo.usp_Trip_List", new { Search = search, Status = status }, ct);
    public Task<IReadOnlyList<ScenarioRow>> ScenariosAsync(CancellationToken ct) => db.QueryAsync<ScenarioRow>("dbo.usp_Scenario_List", null, ct);

    public async Task<int> UpsertScenarioAsync(int? id, ScenarioRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Scenario_Upsert", new
        {
            ScenarioId = id, r.Code, r.Name, r.RegionId, AffectedCategories = string.Join(",", r.AffectedCategories), r.Effect, r.DelayMinutes, r.DayNo, r.Description, r.IsActive,
            RowVersion = RowVersions.Parse(r.RowVersion), ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<IReadOnlyList<ConstraintRow>> ConstraintsAsync(CancellationToken ct) => db.QueryAsync<ConstraintRow>("dbo.usp_Constraints_List", null, ct);
    public Task UpdateConstraintAsync(int id, ConstraintRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Constraints_Update", new { ConstraintId = id, r.Value, r.IsActive, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<TemplateCatalog> TemplatesAsync(CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Template_List", null, async g => new TemplateCatalog(L(await g.ReadAsync<TemplateRow>()), L(await g.ReadAsync<TemplateItemListRow>()), L(await g.ReadAsync<PlaceListRow>())), ct);

    public async Task<int> UpsertTemplateAsync(int? id, TemplateRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Template_Upsert", new
        {
            TemplateId = id, r.Code, r.Name, r.RegionId, r.Days, r.Pace, r.Description, r.IsActive, RowVersion = RowVersions.Parse(r.RowVersion), ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<SimInputs> SimInputsAsync(int tripId, int scenarioId, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Sim_Inputs", new { TripId = tripId, ScenarioId = scenarioId }, async g => new SimInputs(
            await g.ReadFirstOrDefaultAsync<SimTripRow>(), L(await g.ReadAsync<SimItemRow>()), await g.ReadFirstOrDefaultAsync<SimScenarioRow>(),
            L(await g.ReadAsync<PlaceTextRow>()), L(await g.ReadAsync<RuleRow>())), ct);

    public async Task<int> SaveSimulationAsync(int tripId, int versionId, int scenarioId, string impactJson, int impactCount, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Sim_Save", new { TripId = tripId, VersionId = versionId, ScenarioId = scenarioId, ImpactJson = impactJson, ImpactCount = impactCount, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<SimulationRow?> GetSimulationAsync(int simulationId, CancellationToken ct) => db.QuerySingleAsync<SimulationRow>("dbo.usp_Sim_Get", new { SimulationId = simulationId }, ct);

    public async Task<ProposalSavedRow> SaveProposalAsync(int simulationId, int tripId, int baseVersionId, string changesJson, string explanation, string source, string validationJson, decimal costImpact, int? promptId, Guid actor, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<ProposalSavedRow>("dbo.usp_Proposal_Save", new
        {
            SimulationId = simulationId, TripId = tripId, BaseVersionId = baseVersionId, ChangesJson = changesJson, Explanation = explanation, ExplanationSource = source,
            ValidationJson = validationJson, CostImpactPerPax = costImpact, PromptId = promptId, ActorUserId = actor, CorrelationId = correlationId
        }, ct))!;

    public Task<IReadOnlyList<ProposalListRow>> ProposalsAsync(string? status, CancellationToken ct) => db.QueryAsync<ProposalListRow>("dbo.usp_Proposal_List", new { Status = status }, ct);

    public Task<(ProposalRow? Proposal, IReadOnlyList<SimItemRow> BaseItems)> GetProposalAsync(int proposalId, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Proposal_Get", new { ProposalId = proposalId }, async g => (await g.ReadFirstOrDefaultAsync<ProposalRow>(), L(await g.ReadAsync<SimItemRow>())), ct);

    public Task<DecisionResultRow?> DecideProposalAsync(int proposalId, string decision, string? comment, string? newItemsJson, byte[]? rowVersion, Guid actor, string correlationId, CancellationToken ct) =>
        db.QuerySingleAsync<DecisionResultRow>("dbo.usp_Proposal_Decide", new
        {
            ProposalId = proposalId, Decision = decision, Comment = comment, NewItemsJson = newItemsJson, RowVersion = rowVersion, ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<IReadOnlyList<SearchRow>> SearchTripsAsync(Guid userId, bool canViewAll, SearchFilter f, DateTime? month, CancellationToken ct) =>
        db.QueryAsync<SearchRow>("dbo.usp_Search_Trips", new
        {
            UserId = userId, CanViewAll = canViewAll, f.RegionCode, f.SupplierText, Month = month, Mobility = f.Mobility, f.Status, f.Text
        }, ct);

    public Task<(IReadOnlyList<RegionRow> Regions, IReadOnlyList<string> Suppliers)> SearchVocabularyAsync(CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Search_Vocabulary", null, async g =>
            ((IReadOnlyList<RegionRow>)L(await g.ReadAsync<RegionRow>()), L(await g.ReadAsync<string>())), ct);

    public async Task<DocCreatedRow> CreateDocumentAsync(string originalName, string storedName, string contentType, int size, string sha256, string docType, string redactedText, int redactions, string fieldsJson, Guid actor, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<DocCreatedRow>("dbo.usp_Doc_Create", new
        {
            OriginalName = originalName, StoredName = storedName, ContentType = contentType, SizeBytes = size, Sha256 = sha256, DocType = docType, RedactedText = redactedText,
            RedactionCount = redactions, FieldsJson = fieldsJson, ActorUserId = actor, CorrelationId = correlationId
        }, ct))!;

    public Task<IReadOnlyList<DocListRow>> DocumentsAsync(string? status, CancellationToken ct) => db.QueryAsync<DocListRow>("dbo.usp_Doc_List", new { Status = status }, ct);

    public Task<DocDetail?> GetDocumentAsync(int id, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Doc_Get", new { DocumentId = id }, async g =>
        {
            var d = await g.ReadFirstOrDefaultAsync<DocRow>();
            var f = L(await g.ReadAsync<DocFieldRow>());
            return d is null ? null : new DocDetail(d, f);
        }, ct);

    public Task ReviewDocumentAsync(int id, string decision, int? tripId, string? fieldsJson, string? comment, byte[]? rowVersion, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Doc_Review", new
        {
            DocumentId = id, Decision = decision, TripId = tripId, FieldsJson = fieldsJson, Comment = comment, RowVersion = rowVersion, ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<IReadOnlyList<PromptRow>> PromptsAsync(CancellationToken ct) => db.QueryAsync<PromptRow>("dbo.usp_Prompt_List", null, ct);
    public Task<PromptRow?> ActivePromptAsync(string key, CancellationToken ct) => db.QuerySingleAsync<PromptRow>("dbo.usp_Prompt_GetActive", new { PromptKey = key }, ct);
    public Task SavePromptAsync(string key, string body, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Prompt_SaveVersion", new { PromptKey = key, Body = body, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task WriteUsageAsync(string feature, string provider, string? model, int inTok, int outTok, decimal cost, int latencyMs, string outcome, int? promptId, Guid? userId, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_AiUsage_Write", new
        {
            Feature = feature, Provider = provider, Model = model, InputTokens = inTok, OutputTokens = outTok, CostUsd = cost, LatencyMs = latencyMs, Outcome = outcome,
            PromptId = promptId, UserId = userId, CorrelationId = correlationId
        }, ct);

    public async Task<decimal> MonthCostAsync(CancellationToken ct) => await db.QuerySingleAsync<decimal>("dbo.usp_AiUsage_MonthCost", null, ct);

    public Task<UsageReport> UsageAsync(DateTime? from, DateTime? to, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_AiUsage_List", new { FromUtc = from, ToUtc = to }, async g => new UsageReport(L(await g.ReadAsync<UsageRow>()), L(await g.ReadAsync<UsageSummaryRow>())), ct);

    public Task<IReadOnlyList<EvalCaseRow>> EvalCasesAsync(CancellationToken ct) => db.QueryAsync<EvalCaseRow>("dbo.usp_Eval_Cases", null, ct);

    public async Task<int> SaveEvalRunAsync(int total, int passed, decimal grounding, string? model, string resultsJson, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Eval_SaveRun", new { Total = total, Passed = passed, GroundingScore = grounding, UsedModel = model, ResultsJson = resultsJson, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<EvalReport> EvalRunsAsync(CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Eval_Runs", null, async g => new EvalReport(L(await g.ReadAsync<EvalRunRow>()), L(await g.ReadAsync<EvalResultRow>())), ct);

    public Task EvalFeedbackAsync(int resultId, string feedback, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Eval_Feedback", new { ResultId = resultId, Feedback = feedback, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<(DashKpiRow Kpis, IReadOnlyList<DashProposalRow> Recent, IReadOnlyList<DashRegionRow> ByRegion)> DashboardAsync(CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_AiOps_Dashboard", null, async g => (await g.ReadFirstAsync<DashKpiRow>(), L(await g.ReadAsync<DashProposalRow>()), L(await g.ReadAsync<DashRegionRow>())), ct);

    public async Task<string?> UserDisplayNameAsync(Guid userId, CancellationToken ct) => (await db.QueryAsync<string>("dbo.usp_User_DisplayName", new { UserId = userId }, ct)).FirstOrDefault();

    public async Task<Guid?> UserIdByEmailAsync(string normalizedEmail, CancellationToken ct) =>
        (await db.QuerySingleAsync<UserAuthRow>("dbo.usp_Auth_GetUserByEmail", new { NormalizedEmail = normalizedEmail }, ct))?.UserId;
}
