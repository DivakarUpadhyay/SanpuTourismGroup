namespace Divakar.Sanpu.AiOps.Application;

public sealed record RegionRow { public int RegionId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public string? ImageUrl { get; init; } public int PlaceCount { get; init; } public int TemplateCount { get; init; } }
/// <summary>Anonymous home-page showcase: regions and active templates only (no scenarios, no trips).</summary>
public sealed record PublicShowcase(IReadOnlyList<RegionRow> Regions, IReadOnlyList<TemplateOptionRow> Templates);
public sealed record TemplateOptionRow { public int TemplateId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public int RegionId { get; init; } public int Days { get; init; } public string Pace { get; init; } = ""; public string? Description { get; init; } public bool IsDemo { get; init; } }
public sealed record ScenarioOptionRow { public int ScenarioId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; }
public sealed record AiLookups(IReadOnlyList<RegionRow> Regions, IReadOnlyList<TemplateOptionRow> Templates, IReadOnlyList<ScenarioOptionRow> Scenarios);

public sealed record TripCreatedRow { public int TripId { get; init; } public string TripRef { get; init; } = ""; }
public sealed record TripHeaderRow
{
    public int TripId { get; init; } public string TripRef { get; init; } = ""; public Guid TravelerUserId { get; init; } public string Name { get; init; } = ""; public int RegionId { get; init; }
    public int? TemplateId { get; init; } public DateTime StartDate { get; init; } public int Days { get; init; } public int Pax { get; init; } public string Pace { get; init; } = "";
    public string MobilityNeeds { get; init; } = ""; public decimal BudgetPerPax { get; init; } public string? Notes { get; init; } public int CurrentVersion { get; init; } public string Status { get; init; } = "";
}
public sealed record PlaceRow
{
    public int PlaceId { get; init; } public string PlaceCode { get; init; } = ""; public string PlaceName { get; init; } = ""; public string Category { get; init; } = "";
    public TimeSpan OpenTime { get; init; } public TimeSpan CloseTime { get; init; } public bool WheelchairAccessible { get; init; } public decimal CostPerPax { get; init; } public string? SupplierName { get; init; }
}
public sealed record PlaceTextRow
{
    public int PlaceId { get; init; } public string PlaceCode { get; init; } = ""; public string PlaceName { get; init; } = ""; public string Category { get; init; } = "";
    public string OpenTime { get; init; } = ""; public string CloseTime { get; init; } = ""; public bool WheelchairAccessible { get; init; } public decimal CostPerPax { get; init; } public string? SupplierName { get; init; }
}
public sealed record TemplateItemRow
{
    public string ItemKey { get; init; } = ""; public int DayNo { get; init; } public TimeSpan StartTime { get; init; } public int DurationMin { get; init; } public string? DependsOnItemKey { get; init; }
    public int PlaceId { get; init; } public string PlaceCode { get; init; } = ""; public string PlaceName { get; init; } = ""; public string Category { get; init; } = ""; public TimeSpan OpenTime { get; init; }
    public TimeSpan CloseTime { get; init; } public bool WheelchairAccessible { get; init; } public decimal CostPerPax { get; init; } public string? SupplierName { get; init; }
}
public sealed record ConstraintRow { public int ConstraintId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public string RuleType { get; init; } = ""; public string? Value { get; init; } public bool IsActive { get; init; } }
public sealed record GenerationInputs(TripHeaderRow? Trip, IReadOnlyList<TemplateItemRow> TemplateItems, IReadOnlyList<PlaceRow> Places, IReadOnlyList<ConstraintRow> Constraints);
public sealed record VersionSavedRow { public int VersionId { get; init; } public int VersionNo { get; init; } }

public sealed record TripListRow
{
    public int TripId { get; init; } public string TripRef { get; init; } = ""; public string Name { get; init; } = ""; public string? TravelerName { get; init; } public string? TravelerEmailMasked { get; init; }
    public string RegionName { get; init; } = ""; public DateTime StartDate { get; init; } public int Days { get; init; } public int Pax { get; init; } public string? MobilityNeeds { get; init; }
    public int CurrentVersion { get; init; } public string Status { get; init; } = ""; public bool IsDemo { get; init; } public int PendingProposals { get; init; } public string? RegionImageUrl { get; init; }
}
public sealed record TripDetailRow
{
    public int TripId { get; init; } public string TripRef { get; init; } = ""; public Guid TravelerUserId { get; init; } public string? TravelerEmailMasked { get; init; } public string? TravelerName { get; init; }
    public string Name { get; init; } = ""; public int RegionId { get; init; } public string RegionName { get; init; } = ""; public int? TemplateId { get; init; } public DateTime StartDate { get; init; } public int Days { get; init; }
    public int Pax { get; init; } public string Pace { get; init; } = ""; public string MobilityNeeds { get; init; } = ""; public decimal BudgetPerPax { get; init; } public string? Notes { get; init; }
    public int CurrentVersion { get; init; } public string Status { get; init; } = ""; public bool IsDemo { get; init; } public byte[]? RowVersion { get; init; } public string? RegionImageUrl { get; init; }
}
public sealed record VersionRow { public int VersionId { get; init; } public int VersionNo { get; init; } public string Source { get; init; } = ""; public string? Summary { get; init; } public int? ProposalId { get; init; } public DateTime CreatedAtUtc { get; init; } }
public sealed record ItemRow
{
    public int ItemId { get; init; } public string ItemKey { get; init; } = ""; public int DayNo { get; init; } public string StartTime { get; init; } = ""; public int DurationMin { get; init; } public int PlaceId { get; init; }
    public string PlaceCode { get; init; } = ""; public string PlaceName { get; init; } = ""; public string Title { get; init; } = ""; public string Category { get; init; } = ""; public string? DependsOnItemKey { get; init; }
    public string Status { get; init; } = ""; public decimal CostPerPax { get; init; } public string? SupplierName { get; init; } public bool WheelchairAccessible { get; init; }
}
public sealed record ProposalBriefRow { public int ProposalId { get; init; } public string ProposalRef { get; init; } = ""; public string Status { get; init; } = ""; public string ExplanationSource { get; init; } = ""; public decimal CostImpactPerPax { get; init; } public DateTime CreatedAtUtc { get; init; } public DateTime? DecidedAtUtc { get; init; } }
public sealed record TripDetail(TripDetailRow Trip, IReadOnlyList<VersionRow> Versions, IReadOnlyList<ItemRow> Items, IReadOnlyList<ProposalBriefRow> Proposals);

public sealed record ScenarioRow
{
    public int ScenarioId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public int? RegionId { get; init; } public string? RegionName { get; init; }
    public string AffectedCategories { get; init; } = ""; public string Effect { get; init; } = ""; public int DelayMinutes { get; init; } public int? DayNo { get; init; } public string? Description { get; init; }
    public bool IsActive { get; init; } public bool IsDemo { get; init; } public byte[]? RowVersion { get; init; }
}
public sealed record TemplateRow { public int TemplateId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public int RegionId { get; init; } public string RegionName { get; init; } = ""; public int Days { get; init; } public string Pace { get; init; } = ""; public string? Description { get; init; } public bool IsActive { get; init; } public bool IsDemo { get; init; } public byte[]? RowVersion { get; init; } }
public sealed record TemplateItemListRow { public int TemplateId { get; init; } public string ItemKey { get; init; } = ""; public int DayNo { get; init; } public string StartTime { get; init; } = ""; public int DurationMin { get; init; } public int PlaceId { get; init; } public string PlaceName { get; init; } = ""; public string Category { get; init; } = ""; public string? DependsOnItemKey { get; init; } }
public sealed record PlaceListRow { public int PlaceId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public int RegionId { get; init; } public string Category { get; init; } = ""; public string OpenTime { get; init; } = ""; public string CloseTime { get; init; } = ""; public bool WheelchairAccessible { get; init; } public decimal CostPerPax { get; init; } public string? SupplierName { get; init; } public bool IsDemo { get; init; } }
public sealed record TemplateCatalog(IReadOnlyList<TemplateRow> Templates, IReadOnlyList<TemplateItemListRow> Items, IReadOnlyList<PlaceListRow> Places);

public sealed record SimTripRow { public int TripId { get; init; } public string TripRef { get; init; } = ""; public int RegionId { get; init; } public DateTime StartDate { get; init; } public int Days { get; init; } public int Pax { get; init; } public string Pace { get; init; } = ""; public string MobilityNeeds { get; init; } = ""; public decimal BudgetPerPax { get; init; } public int CurrentVersion { get; init; } public int? VersionId { get; init; } }
public sealed record SimItemRow
{
    public string ItemKey { get; init; } = ""; public int DayNo { get; init; } public string StartTime { get; init; } = ""; public int DurationMin { get; init; } public int PlaceId { get; init; } public string PlaceCode { get; init; } = "";
    public string PlaceName { get; init; } = ""; public string Title { get; init; } = ""; public string Category { get; init; } = ""; public string? DependsOnItemKey { get; init; } public string Status { get; init; } = "";
    public decimal CostPerPax { get; init; } public string OpenTime { get; init; } = ""; public string CloseTime { get; init; } = ""; public bool WheelchairAccessible { get; init; } public string? SupplierName { get; init; }
}
public sealed record SimScenarioRow { public int ScenarioId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public int? RegionId { get; init; } public string AffectedCategories { get; init; } = ""; public string Effect { get; init; } = ""; public int DelayMinutes { get; init; } public int? DayNo { get; init; } }
public sealed record RuleRow { public string Code { get; init; } = ""; public string RuleType { get; init; } = ""; public string? Value { get; init; } }
public sealed record SimInputs(SimTripRow? Trip, IReadOnlyList<SimItemRow> Items, SimScenarioRow? Scenario, IReadOnlyList<PlaceTextRow> Places, IReadOnlyList<RuleRow> Rules);
public sealed record SimulationRow { public int SimulationId { get; init; } public int TripId { get; init; } public int VersionId { get; init; } public int ScenarioId { get; init; } public string ScenarioCode { get; init; } = ""; public string ScenarioName { get; init; } = ""; public string ImpactJson { get; init; } = ""; public int ImpactCount { get; init; } public Guid RunBy { get; init; } public DateTime RunAtUtc { get; init; } }

public sealed record ProposalSavedRow { public int ProposalId { get; init; } public string ProposalRef { get; init; } = ""; public string Status { get; init; } = ""; }
public sealed record ProposalListRow { public int ProposalId { get; init; } public string ProposalRef { get; init; } = ""; public int TripId { get; init; } public string TripRef { get; init; } = ""; public string TripName { get; init; } = ""; public string Status { get; init; } = ""; public string ExplanationSource { get; init; } = ""; public decimal CostImpactPerPax { get; init; } public DateTime CreatedAtUtc { get; init; } public string? ProposedByMasked { get; init; } public string ScenarioName { get; init; } = ""; }
public sealed record ProposalRow
{
    public int ProposalId { get; init; } public string ProposalRef { get; init; } = ""; public int SimulationId { get; init; } public int TripId { get; init; } public string TripRef { get; init; } = ""; public string TripName { get; init; } = "";
    public int Pax { get; init; } public int CurrentVersion { get; init; } public int BaseVersionId { get; init; } public int BaseVersionNo { get; init; } public string Status { get; init; } = ""; public string ChangesJson { get; init; } = "";
    public string Explanation { get; init; } = ""; public string ExplanationSource { get; init; } = ""; public string ValidationJson { get; init; } = ""; public decimal CostImpactPerPax { get; init; } public int? PromptId { get; init; }
    public Guid ProposedBy { get; init; } public string? ProposedByMasked { get; init; } public DateTime? DecidedAtUtc { get; init; } public string? DecisionComment { get; init; } public DateTime CreatedAtUtc { get; init; }
    public byte[]? RowVersion { get; init; } public string ImpactJson { get; init; } = ""; public string ScenarioName { get; init; } = "";
}
public sealed record ProposalDetail(ProposalRow Proposal, IReadOnlyList<SimItemRow> BaseItems, bool CanDecide);
public sealed record DecisionResultRow { public int ProposalId { get; init; } public string Status { get; init; } = ""; public int CurrentVersion { get; init; } }

public sealed record SearchRow { public int TripId { get; init; } public string TripRef { get; init; } = ""; public string Name { get; init; } = ""; public string RegionName { get; init; } = ""; public DateTime StartDate { get; init; } public int Days { get; init; } public int Pax { get; init; } public string MobilityNeeds { get; init; } = ""; public string Status { get; init; } = ""; public bool IsDemo { get; init; } public string? Suppliers { get; init; } }
public sealed record SearchFilter(string? RegionCode, string? SupplierText, string? Month, string? Mobility, string? Status, string? Text);
public sealed record SearchResult(string Question, bool Blocked, string? BlockedReason, SearchFilter? Interpretation, string InterpretedBy, IReadOnlyList<SearchRow> Results, string Scope, string? Notice);

public sealed record DocCreatedRow { public int DocumentId { get; init; } public string DocumentRef { get; init; } = ""; }
public sealed record DocListRow { public int DocumentId { get; init; } public string DocumentRef { get; init; } = ""; public string OriginalName { get; init; } = ""; public string DocType { get; init; } = ""; public string Status { get; init; } = ""; public int SizeBytes { get; init; } public int RedactionCount { get; init; } public DateTime UploadedAtUtc { get; init; } public int? TripId { get; init; } public string? TripRef { get; init; } public bool IsDemo { get; init; } public int FieldCount { get; init; } public decimal? AvgConfidence { get; init; } }
public sealed record DocRow { public int DocumentId { get; init; } public string DocumentRef { get; init; } = ""; public string OriginalName { get; init; } = ""; public string ContentType { get; init; } = ""; public int SizeBytes { get; init; } public string Sha256 { get; init; } = ""; public string DocType { get; init; } = ""; public string Status { get; init; } = ""; public int? TripId { get; init; } public string RedactedText { get; init; } = ""; public int RedactionCount { get; init; } public DateTime UploadedAtUtc { get; init; } public string? UploadedByMasked { get; init; } public string? ReviewComment { get; init; } public bool IsDemo { get; init; } public byte[]? RowVersion { get; init; } }
public sealed record DocFieldRow { public int FieldId { get; init; } public string FieldName { get; init; } = ""; public string? Value { get; init; } public decimal Confidence { get; init; } public string Method { get; init; } = ""; public int? SpanStart { get; init; } public int? SpanLength { get; init; } public string? ReviewedValue { get; init; } }
public sealed record DocDetail(DocRow Document, IReadOnlyList<DocFieldRow> Fields);
public sealed record ExtractedField(string FieldName, string? Value, decimal Confidence, string Method, int? SpanStart, int? SpanLength);

public sealed record PromptRow { public int PromptId { get; init; } public string PromptKey { get; init; } = ""; public int Version { get; init; } public string Body { get; init; } = ""; public bool IsActive { get; init; } public DateTime CreatedAtUtc { get; init; } public string? CreatedByMasked { get; init; } }
public sealed record UsageRow { public long UsageId { get; init; } public DateTime OccurredAtUtc { get; init; } public string Feature { get; init; } = ""; public string Provider { get; init; } = ""; public string? Model { get; init; } public int InputTokens { get; init; } public int OutputTokens { get; init; } public decimal CostUsd { get; init; } public int LatencyMs { get; init; } public string Outcome { get; init; } = ""; public int? PromptId { get; init; } public string? CorrelationId { get; init; } }
public sealed record UsageSummaryRow { public string Feature { get; init; } = ""; public string Outcome { get; init; } = ""; public int Calls { get; init; } public int InputTokens { get; init; } public int OutputTokens { get; init; } public decimal CostUsd { get; init; } }
public sealed record UsageReport(IReadOnlyList<UsageRow> Rows, IReadOnlyList<UsageSummaryRow> Summary);
public sealed record EvalCaseRow { public int CaseId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public string Kind { get; init; } = ""; public string InputJson { get; init; } = ""; public string ExpectedJson { get; init; } = ""; }
public sealed record EvalRunRow { public int RunId { get; init; } public DateTime RunAtUtc { get; init; } public int Total { get; init; } public int Passed { get; init; } public decimal GroundingScore { get; init; } public string? UsedModel { get; init; } }
public sealed record EvalResultRow { public int ResultId { get; init; } public int RunId { get; init; } public string Code { get; init; } = ""; public string Name { get; init; } = ""; public string Kind { get; init; } = ""; public bool Passed { get; init; } public string Detail { get; init; } = ""; public string? HumanFeedback { get; init; } }
public sealed record EvalReport(IReadOnlyList<EvalRunRow> Runs, IReadOnlyList<EvalResultRow> LastResults);

public sealed record DashKpiRow { public int ActiveTrips { get; init; } public int DisruptedTrips { get; init; } public int PendingProposals { get; init; } public int DocumentsToReview { get; init; } public decimal AiCost30d { get; init; } public int AiFallbacks30d { get; init; } public decimal? LastGroundingScore { get; init; } public string? LastEvalResult { get; init; } }
public sealed record DashProposalRow { public int ProposalId { get; init; } public string ProposalRef { get; init; } = ""; public string TripRef { get; init; } = ""; public string Status { get; init; } = ""; public DateTime CreatedAtUtc { get; init; } }
public sealed record DashRegionRow { public string RegionName { get; init; } = ""; public int Trips { get; init; } }
public sealed record AiDashboard(DashKpiRow Kpis, IReadOnlyList<DashProposalRow> RecentProposals, IReadOnlyList<DashRegionRow> TripsByRegion, AiStatus Ai);
public sealed record AiStatus(string Provider, string Model, bool KeyConfigured, bool Available, string Message, decimal MonthCostUsd, decimal MonthlyBudgetUsd);

// ---------- requests ----------
public sealed record CreateTripRequest(string Name, int TemplateId, DateTime? StartDate, int Pax, string Pace, string MobilityNeeds, decimal BudgetPerPax, string? Notes);
public sealed record SimulateRequest(int TripId, int ScenarioId);
public sealed record ProposalRequest(bool UseAi = true);
public sealed record ProposalDecisionRequest(string Decision, string? Comment, string? RowVersion);
public sealed record SearchRequest(string Question);
public sealed record DocReviewRequest(string Decision, int? TripId, IReadOnlyList<FieldReviewInput>? Fields, string? Comment, string? RowVersion);
public sealed record FieldReviewInput(string FieldName, string? ReviewedValue);
public sealed record ScenarioRequest(string Code, string Name, int? RegionId, IReadOnlyList<string> AffectedCategories, string Effect, int DelayMinutes, int? DayNo, string? Description, bool IsActive, string? RowVersion);
public sealed record TemplateRequest(string Code, string Name, int RegionId, int Days, string Pace, string? Description, bool IsActive, string? RowVersion);
public sealed record ConstraintRequest(string? Value, bool IsActive);
public sealed record PromptSaveRequest(string Body);
public sealed record EvalFeedbackRequest(string Feedback);
