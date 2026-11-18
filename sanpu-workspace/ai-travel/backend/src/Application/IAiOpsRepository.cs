namespace Divakar.Sanpu.AiOps.Application;

/// <summary>AI Copilot data access. One method = one stored procedure (database/procedures/210_aiops_procs.sql).</summary>
public interface IAiOpsRepository
{
    Task<AiLookups> LookupsAsync(CancellationToken ct);
    Task<TripCreatedRow> CreateTripAsync(Guid travelerId, CreateTripRequest r, int days, string correlationId, CancellationToken ct);
    Task<GenerationInputs> GenerationInputsAsync(int tripId, CancellationToken ct);
    Task<VersionSavedRow> SaveVersionAsync(int tripId, string source, string summary, string itemsJson, int? proposalId, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<TripListRow>> TripsForTravelerAsync(Guid travelerId, CancellationToken ct);
    Task<TripDetail?> GetTripAsync(int tripId, Guid? travelerScope, int? versionNo, CancellationToken ct);
    Task<IReadOnlyList<TripListRow>> TripsAsync(string? search, string? status, CancellationToken ct);
    Task<IReadOnlyList<ScenarioRow>> ScenariosAsync(CancellationToken ct);
    Task<int> UpsertScenarioAsync(int? id, ScenarioRequest r, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<ConstraintRow>> ConstraintsAsync(CancellationToken ct);
    Task UpdateConstraintAsync(int id, ConstraintRequest r, Guid actor, string correlationId, CancellationToken ct);
    Task<TemplateCatalog> TemplatesAsync(CancellationToken ct);
    Task<int> UpsertTemplateAsync(int? id, TemplateRequest r, Guid actor, string correlationId, CancellationToken ct);
    Task<SimInputs> SimInputsAsync(int tripId, int scenarioId, CancellationToken ct);
    Task<int> SaveSimulationAsync(int tripId, int versionId, int scenarioId, string impactJson, int impactCount, Guid actor, string correlationId, CancellationToken ct);
    Task<SimulationRow?> GetSimulationAsync(int simulationId, CancellationToken ct);
    Task<ProposalSavedRow> SaveProposalAsync(int simulationId, int tripId, int baseVersionId, string changesJson, string explanation, string source, string validationJson, decimal costImpact, int? promptId, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<ProposalListRow>> ProposalsAsync(string? status, CancellationToken ct);
    Task<(ProposalRow? Proposal, IReadOnlyList<SimItemRow> BaseItems)> GetProposalAsync(int proposalId, CancellationToken ct);
    Task<DecisionResultRow?> DecideProposalAsync(int proposalId, string decision, string? comment, string? newItemsJson, byte[]? rowVersion, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<SearchRow>> SearchTripsAsync(Guid userId, bool canViewAll, SearchFilter filter, DateTime? month, CancellationToken ct);
    Task<(IReadOnlyList<RegionRow> Regions, IReadOnlyList<string> Suppliers)> SearchVocabularyAsync(CancellationToken ct);
    Task<DocCreatedRow> CreateDocumentAsync(string originalName, string storedName, string contentType, int size, string sha256, string docType, string redactedText, int redactions, string fieldsJson, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<DocListRow>> DocumentsAsync(string? status, CancellationToken ct);
    Task<DocDetail?> GetDocumentAsync(int id, CancellationToken ct);
    Task ReviewDocumentAsync(int id, string decision, int? tripId, string? fieldsJson, string? comment, byte[]? rowVersion, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<PromptRow>> PromptsAsync(CancellationToken ct);
    Task<PromptRow?> ActivePromptAsync(string key, CancellationToken ct);
    Task SavePromptAsync(string key, string body, Guid actor, string correlationId, CancellationToken ct);
    Task WriteUsageAsync(string feature, string provider, string? model, int inTok, int outTok, decimal cost, int latencyMs, string outcome, int? promptId, Guid? userId, string correlationId, CancellationToken ct);
    Task<decimal> MonthCostAsync(CancellationToken ct);
    Task<UsageReport> UsageAsync(DateTime? from, DateTime? to, CancellationToken ct);
    Task<IReadOnlyList<EvalCaseRow>> EvalCasesAsync(CancellationToken ct);
    Task<int> SaveEvalRunAsync(int total, int passed, decimal grounding, string? model, string resultsJson, Guid actor, string correlationId, CancellationToken ct);
    Task<EvalReport> EvalRunsAsync(CancellationToken ct);
    Task EvalFeedbackAsync(int resultId, string feedback, Guid actor, string correlationId, CancellationToken ct);
    Task<(DashKpiRow Kpis, IReadOnlyList<DashProposalRow> Recent, IReadOnlyList<DashRegionRow> ByRegion)> DashboardAsync(CancellationToken ct);
    Task<Guid?> UserIdByEmailAsync(string normalizedEmail, CancellationToken ct);
    Task<string?> UserDisplayNameAsync(Guid userId, CancellationToken ct);
}

/// <summary>LLM provider abstraction. The only implementation calls Claude through the official Anthropic SDK;
/// it throws <see cref="AiUnavailableException"/> when no key is configured so callers fall back to deterministic logic.</summary>
public interface IAiProvider
{
    string Name { get; }
    bool IsConfigured { get; }
    Task<AiCompletion> CompleteAsync(string model, string system, string user, int maxTokens, TimeSpan timeout, CancellationToken ct);
}

public sealed record AiCompletion(string Text, int InputTokens, int OutputTokens, string Model, string StopReason);

public sealed class AiUnavailableException(string outcome, string message) : Exception(message)
{
    public string Outcome { get; } = outcome;
}

/// <summary>Stores uploaded files privately under random names (outside any web root).</summary>
public interface IDocumentStore
{
    Task<string> SaveAsync(byte[] content, string extension, CancellationToken ct);
}
