/* 200_aiops_schema.sql — AI Operations Copilot (app B). Idempotent. */
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF OBJECT_ID('dbo.Regions') IS NULL
CREATE TABLE dbo.Regions (
    RegionId int IDENTITY(1,1) CONSTRAINT PK_Regions PRIMARY KEY,
    Code varchar(20) NOT NULL CONSTRAINT UQ_Regions_Code UNIQUE,
    Name nvarchar(100) NOT NULL,
    IsDemo bit NOT NULL CONSTRAINT DF_Regions_Demo DEFAULT 0
);

IF OBJECT_ID('dbo.Places') IS NULL
CREATE TABLE dbo.Places (
    PlaceId      int IDENTITY(1,1) CONSTRAINT PK_Places PRIMARY KEY,
    Code         varchar(30) NOT NULL CONSTRAINT UQ_Places_Code UNIQUE,
    Name         nvarchar(150) NOT NULL,
    RegionId     int NOT NULL CONSTRAINT FK_Places_Region REFERENCES dbo.Regions(RegionId),
    Category     varchar(20) NOT NULL CONSTRAINT CK_Places_Category CHECK (Category IN ('Outdoor','Indoor','Rail','Coach','Hotel','Meal')),
    SupplierName nvarchar(150) NULL,
    OpenTime     time(0) NOT NULL,
    CloseTime    time(0) NOT NULL,
    WheelchairAccessible bit NOT NULL CONSTRAINT DF_Places_Wheelchair DEFAULT 0,
    CostPerPax   decimal(10,2) NOT NULL CONSTRAINT DF_Places_Cost DEFAULT 0,
    IsActive     bit NOT NULL CONSTRAINT DF_Places_Active DEFAULT 1,
    IsDemo       bit NOT NULL CONSTRAINT DF_Places_Demo DEFAULT 0
);

IF OBJECT_ID('dbo.ItineraryTemplates') IS NULL
CREATE TABLE dbo.ItineraryTemplates (
    TemplateId  int IDENTITY(1,1) CONSTRAINT PK_ItineraryTemplates PRIMARY KEY,
    Code        varchar(30) NOT NULL CONSTRAINT UQ_ItineraryTemplates_Code UNIQUE,
    Name        nvarchar(150) NOT NULL,
    RegionId    int NOT NULL CONSTRAINT FK_ItineraryTemplates_Region REFERENCES dbo.Regions(RegionId),
    Days        int NOT NULL CONSTRAINT CK_ItineraryTemplates_Days CHECK (Days BETWEEN 1 AND 14),
    Pace        varchar(10) NOT NULL CONSTRAINT CK_ItineraryTemplates_Pace CHECK (Pace IN ('Relaxed','Balanced','Packed')),
    Description nvarchar(1000) NULL,
    IsActive    bit NOT NULL CONSTRAINT DF_ItineraryTemplates_Active DEFAULT 1,
    IsDemo      bit NOT NULL CONSTRAINT DF_ItineraryTemplates_Demo DEFAULT 0,
    RowVersion  rowversion NOT NULL
);

IF OBJECT_ID('dbo.TemplateItems') IS NULL
CREATE TABLE dbo.TemplateItems (
    TemplateItemId int IDENTITY(1,1) CONSTRAINT PK_TemplateItems PRIMARY KEY,
    TemplateId     int NOT NULL CONSTRAINT FK_TemplateItems_Template REFERENCES dbo.ItineraryTemplates(TemplateId) ON DELETE CASCADE,
    ItemKey        varchar(30) NOT NULL,
    DayNo          int NOT NULL,
    StartTime      time(0) NOT NULL,
    DurationMin    int NOT NULL CONSTRAINT CK_TemplateItems_Duration CHECK (DurationMin BETWEEN 15 AND 1440),
    PlaceId        int NOT NULL CONSTRAINT FK_TemplateItems_Place REFERENCES dbo.Places(PlaceId),
    DependsOnItemKey varchar(30) NULL,
    CONSTRAINT UQ_TemplateItems UNIQUE (TemplateId, ItemKey)
);

IF OBJECT_ID('dbo.TravelConstraints') IS NULL
CREATE TABLE dbo.TravelConstraints (
    ConstraintId int IDENTITY(1,1) CONSTRAINT PK_TravelConstraints PRIMARY KEY,
    Code     varchar(40) NOT NULL CONSTRAINT UQ_TravelConstraints_Code UNIQUE,
    Name     nvarchar(150) NOT NULL,
    RuleType varchar(40) NOT NULL CONSTRAINT CK_TravelConstraints_Rule CHECK (RuleType IN ('MaxItemsPerDay','NoStartBefore','LatestHotelCheckIn','MobilityNeedsAccessible','RespectOpeningHours')),
    Value    nvarchar(50) NULL,
    IsActive bit NOT NULL CONSTRAINT DF_TravelConstraints_Active DEFAULT 1,
    RowVersion rowversion NOT NULL
);

IF OBJECT_ID('dbo.Trips') IS NULL
CREATE TABLE dbo.Trips (
    TripId         int IDENTITY(1,1) CONSTRAINT PK_Trips PRIMARY KEY,
    TripRef        AS ('TR-' + RIGHT('0000' + CAST(TripId AS varchar(10)), 4)) PERSISTED,
    TravelerUserId uniqueidentifier NOT NULL CONSTRAINT FK_Trips_User REFERENCES dbo.Users(UserId),
    Name           nvarchar(120) NOT NULL,
    RegionId       int NOT NULL CONSTRAINT FK_Trips_Region REFERENCES dbo.Regions(RegionId),
    TemplateId     int NULL CONSTRAINT FK_Trips_Template REFERENCES dbo.ItineraryTemplates(TemplateId),
    StartDate      date NOT NULL,
    Days           int NOT NULL CONSTRAINT CK_Trips_Days CHECK (Days BETWEEN 1 AND 14),
    Pax            int NOT NULL CONSTRAINT CK_Trips_Pax CHECK (Pax BETWEEN 1 AND 20),
    Pace           varchar(10) NOT NULL,
    MobilityNeeds  varchar(20) NOT NULL CONSTRAINT DF_Trips_Mobility DEFAULT 'None' CONSTRAINT CK_Trips_Mobility CHECK (MobilityNeeds IN ('None','LimitedWalking','Wheelchair')),
    BudgetPerPax   decimal(10,2) NOT NULL,
    Notes          nvarchar(1000) NULL,
    CurrentVersion int NOT NULL CONSTRAINT DF_Trips_Version DEFAULT 0,
    Status         varchar(20) NOT NULL CONSTRAINT DF_Trips_Status DEFAULT 'Draft' CONSTRAINT CK_Trips_Status CHECK (Status IN ('Draft','Active','Disrupted','Completed')),
    CreatedAtUtc   datetime2(3) NOT NULL CONSTRAINT DF_Trips_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc   datetime2(3) NOT NULL CONSTRAINT DF_Trips_Updated DEFAULT SYSUTCDATETIME(),
    IsDemo         bit NOT NULL CONSTRAINT DF_Trips_Demo DEFAULT 0,
    RowVersion     rowversion NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Trips_Traveler') CREATE INDEX IX_Trips_Traveler ON dbo.Trips(TravelerUserId);

IF OBJECT_ID('dbo.ItineraryVersions') IS NULL
CREATE TABLE dbo.ItineraryVersions (
    VersionId    int IDENTITY(1,1) CONSTRAINT PK_ItineraryVersions PRIMARY KEY,
    TripId       int NOT NULL CONSTRAINT FK_ItineraryVersions_Trip REFERENCES dbo.Trips(TripId),
    VersionNo    int NOT NULL,
    Source       varchar(20) NOT NULL CONSTRAINT CK_ItineraryVersions_Source CHECK (Source IN ('Template','AI','Recovery')),
    Summary      nvarchar(1000) NULL,
    ProposalId   int NULL,
    CreatedBy    uniqueidentifier NULL,
    CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_ItineraryVersions_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_ItineraryVersions UNIQUE (TripId, VersionNo)
);

IF OBJECT_ID('dbo.ItineraryItems') IS NULL
CREATE TABLE dbo.ItineraryItems (
    ItemId       int IDENTITY(1,1) CONSTRAINT PK_ItineraryItems PRIMARY KEY,
    VersionId    int NOT NULL CONSTRAINT FK_ItineraryItems_Version REFERENCES dbo.ItineraryVersions(VersionId),
    ItemKey      varchar(30) NOT NULL,
    DayNo        int NOT NULL,
    StartTime    time(0) NOT NULL,
    DurationMin  int NOT NULL,
    PlaceId      int NOT NULL CONSTRAINT FK_ItineraryItems_Place REFERENCES dbo.Places(PlaceId),
    Title        nvarchar(150) NOT NULL,
    Category     varchar(20) NOT NULL,
    DependsOnItemKey varchar(30) NULL,
    Status       varchar(20) NOT NULL CONSTRAINT DF_ItineraryItems_Status DEFAULT 'Planned' CONSTRAINT CK_ItineraryItems_Status CHECK (Status IN ('Planned','Disrupted','Replaced','Cancelled')),
    CostPerPax   decimal(10,2) NOT NULL,
    CONSTRAINT UQ_ItineraryItems UNIQUE (VersionId, ItemKey)
);

IF OBJECT_ID('dbo.DisruptionScenarios') IS NULL
CREATE TABLE dbo.DisruptionScenarios (
    ScenarioId   int IDENTITY(1,1) CONSTRAINT PK_DisruptionScenarios PRIMARY KEY,
    Code         varchar(30) NOT NULL CONSTRAINT UQ_DisruptionScenarios_Code UNIQUE,
    Name         nvarchar(150) NOT NULL,
    RegionId     int NULL CONSTRAINT FK_DisruptionScenarios_Region REFERENCES dbo.Regions(RegionId),
    AffectedCategories varchar(200) NOT NULL,       -- comma list of Places.Category
    Effect       varchar(10) NOT NULL CONSTRAINT CK_DisruptionScenarios_Effect CHECK (Effect IN ('Cancel','Delay')),
    DelayMinutes int NOT NULL CONSTRAINT DF_DisruptionScenarios_Delay DEFAULT 0 CONSTRAINT CK_DisruptionScenarios_Delay CHECK (DelayMinutes BETWEEN 0 AND 4320),
    DayNo        int NULL,                          -- NULL = all days
    Description  nvarchar(500) NULL,
    IsActive     bit NOT NULL CONSTRAINT DF_DisruptionScenarios_Active DEFAULT 1,
    IsDemo       bit NOT NULL CONSTRAINT DF_DisruptionScenarios_Demo DEFAULT 0,
    RowVersion   rowversion NOT NULL
);

IF OBJECT_ID('dbo.PromptTemplates') IS NULL
CREATE TABLE dbo.PromptTemplates (
    PromptId     int IDENTITY(1,1) CONSTRAINT PK_PromptTemplates PRIMARY KEY,
    PromptKey    varchar(60) NOT NULL,
    Version      int NOT NULL,
    Body         nvarchar(max) NOT NULL,
    IsActive     bit NOT NULL CONSTRAINT DF_PromptTemplates_Active DEFAULT 1,
    CreatedBy    uniqueidentifier NULL,
    CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_PromptTemplates_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_PromptTemplates UNIQUE (PromptKey, Version)
);

IF OBJECT_ID('dbo.Simulations') IS NULL
CREATE TABLE dbo.Simulations (
    SimulationId int IDENTITY(1,1) CONSTRAINT PK_Simulations PRIMARY KEY,
    TripId       int NOT NULL CONSTRAINT FK_Simulations_Trip REFERENCES dbo.Trips(TripId),
    VersionId    int NOT NULL CONSTRAINT FK_Simulations_Version REFERENCES dbo.ItineraryVersions(VersionId),
    ScenarioId   int NOT NULL CONSTRAINT FK_Simulations_Scenario REFERENCES dbo.DisruptionScenarios(ScenarioId),
    ImpactJson   nvarchar(max) NOT NULL,
    ImpactCount  int NOT NULL,
    RunBy        uniqueidentifier NOT NULL,
    RunAtUtc     datetime2(3) NOT NULL CONSTRAINT DF_Simulations_At DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.RecoveryProposals') IS NULL
CREATE TABLE dbo.RecoveryProposals (
    ProposalId        int IDENTITY(1,1) CONSTRAINT PK_RecoveryProposals PRIMARY KEY,
    ProposalRef       AS ('RP-' + RIGHT('00000' + CAST(ProposalId AS varchar(10)), 5)) PERSISTED,
    SimulationId      int NOT NULL CONSTRAINT FK_RecoveryProposals_Sim REFERENCES dbo.Simulations(SimulationId),
    TripId            int NOT NULL CONSTRAINT FK_RecoveryProposals_Trip REFERENCES dbo.Trips(TripId),
    BaseVersionId     int NOT NULL CONSTRAINT FK_RecoveryProposals_Version REFERENCES dbo.ItineraryVersions(VersionId),
    Status            varchar(20) NOT NULL CONSTRAINT CK_RecoveryProposals_Status CHECK (Status IN ('PendingReview','Approved','Rejected','Superseded')),
    ChangesJson       nvarchar(max) NOT NULL,
    Explanation       nvarchar(4000) NOT NULL,
    ExplanationSource varchar(20) NOT NULL CONSTRAINT CK_RecoveryProposals_Source CHECK (ExplanationSource IN ('AI','Deterministic')),
    ValidationJson    nvarchar(max) NOT NULL,
    CostImpactPerPax  decimal(10,2) NOT NULL,
    PromptId          int NULL CONSTRAINT FK_RecoveryProposals_Prompt REFERENCES dbo.PromptTemplates(PromptId),
    ProposedBy        uniqueidentifier NOT NULL,
    DecidedBy         uniqueidentifier NULL,
    DecidedAtUtc      datetime2(3) NULL,
    DecisionComment   nvarchar(500) NULL,
    CreatedAtUtc      datetime2(3) NOT NULL CONSTRAINT DF_RecoveryProposals_Created DEFAULT SYSUTCDATETIME(),
    RowVersion        rowversion NOT NULL
);

IF OBJECT_ID('dbo.AiUsageLogs') IS NULL
CREATE TABLE dbo.AiUsageLogs (
    UsageId       bigint IDENTITY(1,1) CONSTRAINT PK_AiUsageLogs PRIMARY KEY,
    OccurredAtUtc datetime2(3) NOT NULL CONSTRAINT DF_AiUsageLogs_At DEFAULT SYSUTCDATETIME(),
    Feature       varchar(50) NOT NULL,
    Provider      varchar(30) NOT NULL,
    Model         varchar(60) NULL,
    InputTokens   int NOT NULL CONSTRAINT DF_AiUsageLogs_In DEFAULT 0,
    OutputTokens  int NOT NULL CONSTRAINT DF_AiUsageLogs_Out DEFAULT 0,
    CostUsd       decimal(10,6) NOT NULL CONSTRAINT DF_AiUsageLogs_Cost DEFAULT 0,
    LatencyMs     int NOT NULL CONSTRAINT DF_AiUsageLogs_Latency DEFAULT 0,
    Outcome       varchar(30) NOT NULL,
    PromptId      int NULL,
    UserId        uniqueidentifier NULL,
    CorrelationId varchar(64) NULL
);

IF OBJECT_ID('dbo.Documents') IS NULL
CREATE TABLE dbo.Documents (
    DocumentId    int IDENTITY(1,1) CONSTRAINT PK_Documents PRIMARY KEY,
    DocumentRef   AS ('DOC-' + RIGHT('00000' + CAST(DocumentId AS varchar(10)), 5)) PERSISTED,
    OriginalName  nvarchar(200) NOT NULL,
    StoredName    varchar(80) NOT NULL CONSTRAINT UQ_Documents_Stored UNIQUE,
    ContentType   varchar(60) NOT NULL,
    SizeBytes     int NOT NULL CONSTRAINT CK_Documents_Size CHECK (SizeBytes BETWEEN 1 AND 2097152),
    Sha256        char(64) NOT NULL,
    DocType       varchar(30) NOT NULL,
    Status        varchar(20) NOT NULL CONSTRAINT CK_Documents_Status CHECK (Status IN ('Extracted','Accepted','Rejected')),
    TripId        int NULL CONSTRAINT FK_Documents_Trip REFERENCES dbo.Trips(TripId),
    RedactedText  nvarchar(max) NOT NULL,
    RedactionCount int NOT NULL,
    UploadedBy    uniqueidentifier NOT NULL,
    UploadedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_Documents_At DEFAULT SYSUTCDATETIME(),
    ReviewedBy    uniqueidentifier NULL,
    ReviewedAtUtc datetime2(3) NULL,
    ReviewComment nvarchar(500) NULL,
    IsDemo        bit NOT NULL CONSTRAINT DF_Documents_Demo DEFAULT 0,
    RowVersion    rowversion NOT NULL
);

IF OBJECT_ID('dbo.DocumentFields') IS NULL
CREATE TABLE dbo.DocumentFields (
    FieldId      int IDENTITY(1,1) CONSTRAINT PK_DocumentFields PRIMARY KEY,
    DocumentId   int NOT NULL CONSTRAINT FK_DocumentFields_Doc REFERENCES dbo.Documents(DocumentId) ON DELETE CASCADE,
    FieldName    varchar(50) NOT NULL,
    Value        nvarchar(300) NULL,
    Confidence   decimal(4,3) NOT NULL CONSTRAINT CK_DocumentFields_Conf CHECK (Confidence BETWEEN 0 AND 1),
    Method       varchar(20) NOT NULL CONSTRAINT CK_DocumentFields_Method CHECK (Method IN ('Rule','AI')),
    SpanStart    int NULL,
    SpanLength   int NULL,
    ReviewedValue nvarchar(300) NULL,
    CONSTRAINT UQ_DocumentFields UNIQUE (DocumentId, FieldName)
);

IF OBJECT_ID('dbo.EvalCases') IS NULL
CREATE TABLE dbo.EvalCases (
    CaseId    int IDENTITY(1,1) CONSTRAINT PK_EvalCases PRIMARY KEY,
    Code      varchar(20) NOT NULL CONSTRAINT UQ_EvalCases_Code UNIQUE,
    Name      nvarchar(200) NOT NULL,
    Kind      varchar(20) NOT NULL CONSTRAINT CK_EvalCases_Kind CHECK (Kind IN ('Accuracy','Injection','PermissionLeak','Grounding','Validation')),
    InputJson nvarchar(max) NOT NULL,
    ExpectedJson nvarchar(max) NOT NULL,
    IsActive  bit NOT NULL CONSTRAINT DF_EvalCases_Active DEFAULT 1,
    IsDemo    bit NOT NULL CONSTRAINT DF_EvalCases_Demo DEFAULT 1
);

IF OBJECT_ID('dbo.EvalRuns') IS NULL
CREATE TABLE dbo.EvalRuns (
    RunId          int IDENTITY(1,1) CONSTRAINT PK_EvalRuns PRIMARY KEY,
    RunAtUtc       datetime2(3) NOT NULL CONSTRAINT DF_EvalRuns_At DEFAULT SYSUTCDATETIME(),
    RunBy          uniqueidentifier NOT NULL,
    Total          int NOT NULL,
    Passed         int NOT NULL,
    GroundingScore decimal(4,3) NOT NULL,
    UsedModel      varchar(60) NULL
);

IF OBJECT_ID('dbo.EvalResults') IS NULL
CREATE TABLE dbo.EvalResults (
    ResultId  int IDENTITY(1,1) CONSTRAINT PK_EvalResults PRIMARY KEY,
    RunId     int NOT NULL CONSTRAINT FK_EvalResults_Run REFERENCES dbo.EvalRuns(RunId),
    CaseId    int NOT NULL CONSTRAINT FK_EvalResults_Case REFERENCES dbo.EvalCases(CaseId),
    Passed    bit NOT NULL,
    Detail    nvarchar(1000) NOT NULL,
    HumanFeedback nvarchar(500) NULL,
    FeedbackBy uniqueidentifier NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '200_aiops_schema.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('200_aiops_schema.sql');
