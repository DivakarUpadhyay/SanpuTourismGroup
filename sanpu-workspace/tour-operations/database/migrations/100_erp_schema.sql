/* 100_erp_schema.sql — Tour Operations ERP (app A). Idempotent. */
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF OBJECT_ID('dbo.BusinessUnits') IS NULL
CREATE TABLE dbo.BusinessUnits (
    BusinessUnitId int IDENTITY(1,1) CONSTRAINT PK_BusinessUnits PRIMARY KEY,
    Code     varchar(20)   NOT NULL CONSTRAINT UQ_BusinessUnits_Code UNIQUE,
    Name     nvarchar(100) NOT NULL,
    Kind     varchar(20)   NOT NULL CONSTRAINT CK_BusinessUnits_Kind CHECK (Kind IN ('Tours','Lodging','Coaches','Meals','Retail','Other')),
    IsActive bit NOT NULL CONSTRAINT DF_BusinessUnits_Active DEFAULT 1,
    IsDemo   bit NOT NULL CONSTRAINT DF_BusinessUnits_Demo DEFAULT 0,
    RowVersion rowversion NOT NULL
);

IF OBJECT_ID('dbo.Destinations') IS NULL
CREATE TABLE dbo.Destinations (
    DestinationId int IDENTITY(1,1) CONSTRAINT PK_Destinations PRIMARY KEY,
    Code    varchar(20)   NOT NULL CONSTRAINT UQ_Destinations_Code UNIQUE,
    Name    nvarchar(100) NOT NULL,
    Region  nvarchar(50)  NOT NULL,
    IsActive bit NOT NULL CONSTRAINT DF_Destinations_Active DEFAULT 1,
    IsDemo  bit NOT NULL CONSTRAINT DF_Destinations_Demo DEFAULT 0
);

IF OBJECT_ID('dbo.Suppliers') IS NULL
CREATE TABLE dbo.Suppliers (
    SupplierId      int IDENTITY(1,1) CONSTRAINT PK_Suppliers PRIMARY KEY,
    Code            varchar(20)   NOT NULL CONSTRAINT UQ_Suppliers_Code UNIQUE,
    Name            nvarchar(150) NOT NULL,
    SupplierType    varchar(20)   NOT NULL CONSTRAINT CK_Suppliers_Type CHECK (SupplierType IN ('Hotel','Coach','Restaurant','Guide','OTA')),
    BusinessUnitId  int NULL CONSTRAINT FK_Suppliers_BU REFERENCES dbo.BusinessUnits(BusinessUnitId),
    ContactEmail    nvarchar(256) NULL,
    AdapterType     varchar(20)   NOT NULL CONSTRAINT DF_Suppliers_Adapter DEFAULT 'LocalMock' CONSTRAINT CK_Suppliers_Adapter CHECK (AdapterType IN ('LocalMock','Webhook','Live')),
    WebhookSecretRef varchar(100) NULL,          -- name of an environment variable, never the secret
    RateLimitPerMin int NOT NULL CONSTRAINT DF_Suppliers_Rate DEFAULT 60 CONSTRAINT CK_Suppliers_Rate CHECK (RateLimitPerMin BETWEEN 1 AND 600),
    ConnectionStatus varchar(20)  NOT NULL CONSTRAINT DF_Suppliers_ConnStatus DEFAULT 'LocalMock',
    LastSyncAtUtc   datetime2(3) NULL,
    IsActive        bit NOT NULL CONSTRAINT DF_Suppliers_Active DEFAULT 1,
    IsDemo          bit NOT NULL CONSTRAINT DF_Suppliers_Demo DEFAULT 0,
    UpdatedAtUtc    datetime2(3) NOT NULL CONSTRAINT DF_Suppliers_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion      rowversion NOT NULL
);

IF OBJECT_ID('dbo.Tours') IS NULL
CREATE TABLE dbo.Tours (
    TourId         int IDENTITY(1,1) CONSTRAINT PK_Tours PRIMARY KEY,
    Code           varchar(30)   NOT NULL CONSTRAINT UQ_Tours_Code UNIQUE,
    Title          nvarchar(150) NOT NULL,
    Slogan         nvarchar(100) NULL,
    DestinationId  int NOT NULL CONSTRAINT FK_Tours_Destination REFERENCES dbo.Destinations(DestinationId),
    BusinessUnitId int NOT NULL CONSTRAINT FK_Tours_BU REFERENCES dbo.BusinessUnits(BusinessUnitId),
    Days           int NOT NULL CONSTRAINT CK_Tours_Days CHECK (Days BETWEEN 1 AND 30),
    BasePrice      decimal(12,2) NOT NULL CONSTRAINT CK_Tours_Price CHECK (BasePrice > 0),
    Currency       char(3) NOT NULL CONSTRAINT DF_Tours_Currency DEFAULT 'TWD',
    Summary        nvarchar(2000) NULL,
    IsPublished    bit NOT NULL CONSTRAINT DF_Tours_Published DEFAULT 0,
    IsDemo         bit NOT NULL CONSTRAINT DF_Tours_Demo DEFAULT 0,
    CreatedAtUtc   datetime2(3) NOT NULL CONSTRAINT DF_Tours_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc   datetime2(3) NOT NULL CONSTRAINT DF_Tours_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion     rowversion NOT NULL
);

IF OBJECT_ID('dbo.Departures') IS NULL
CREATE TABLE dbo.Departures (
    DepartureId   int IDENTITY(1,1) CONSTRAINT PK_Departures PRIMARY KEY,
    TourId        int NOT NULL CONSTRAINT FK_Departures_Tour REFERENCES dbo.Tours(TourId),
    DepartureDate date NOT NULL,
    Capacity      int NOT NULL CONSTRAINT CK_Departures_Cap CHECK (Capacity BETWEEN 1 AND 200),
    SeatsSold     int NOT NULL CONSTRAINT DF_Departures_Sold DEFAULT 0,
    SeatsHeld     int NOT NULL CONSTRAINT DF_Departures_Held DEFAULT 0,
    Price         decimal(12,2) NOT NULL CONSTRAINT CK_Departures_Price CHECK (Price > 0),
    Status        varchar(20) NOT NULL CONSTRAINT DF_Departures_Status DEFAULT 'Open' CONSTRAINT CK_Departures_Status CHECK (Status IN ('Open','Closed','Cancelled')),
    IsDemo        bit NOT NULL CONSTRAINT DF_Departures_Demo DEFAULT 0,
    UpdatedAtUtc  datetime2(3) NOT NULL CONSTRAINT DF_Departures_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion    rowversion NOT NULL,
    CONSTRAINT CK_Departures_Seats CHECK (SeatsSold >= 0 AND SeatsHeld >= 0 AND SeatsSold + SeatsHeld <= Capacity),
    CONSTRAINT UQ_Departures_TourDate UNIQUE (TourId, DepartureDate)
);

IF OBJECT_ID('dbo.InventoryHolds') IS NULL
CREATE TABLE dbo.InventoryHolds (
    HoldId         uniqueidentifier NOT NULL CONSTRAINT PK_InventoryHolds PRIMARY KEY CONSTRAINT DF_InventoryHolds_Id DEFAULT NEWID(),
    DepartureId    int NOT NULL CONSTRAINT FK_InventoryHolds_Departure REFERENCES dbo.Departures(DepartureId),
    UserId         uniqueidentifier NOT NULL CONSTRAINT FK_InventoryHolds_User REFERENCES dbo.Users(UserId),
    Pax            int NOT NULL CONSTRAINT CK_InventoryHolds_Pax CHECK (Pax BETWEEN 1 AND 50),
    ExpiresAtUtc   datetime2(3) NOT NULL,
    Status         varchar(20) NOT NULL CONSTRAINT DF_InventoryHolds_Status DEFAULT 'Active' CONSTRAINT CK_InventoryHolds_Status CHECK (Status IN ('Active','Converted','Expired','Released')),
    IdempotencyKey varchar(64) NOT NULL,
    CreatedAtUtc   datetime2(3) NOT NULL CONSTRAINT DF_InventoryHolds_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_InventoryHolds_Idem UNIQUE (UserId, IdempotencyKey)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InventoryHolds_Active')
    CREATE INDEX IX_InventoryHolds_Active ON dbo.InventoryHolds(DepartureId, Status, ExpiresAtUtc);

IF OBJECT_ID('dbo.Bookings') IS NULL
CREATE TABLE dbo.Bookings (
    BookingId        int IDENTITY(1,1) CONSTRAINT PK_Bookings PRIMARY KEY,
    BookingRef       AS ('BK-' + RIGHT('000000' + CAST(BookingId AS varchar(10)), 6)) PERSISTED,
    CustomerUserId   uniqueidentifier NOT NULL CONSTRAINT FK_Bookings_Customer REFERENCES dbo.Users(UserId),
    DepartureId      int NOT NULL CONSTRAINT FK_Bookings_Departure REFERENCES dbo.Departures(DepartureId),
    HoldId           uniqueidentifier NULL CONSTRAINT FK_Bookings_Hold REFERENCES dbo.InventoryHolds(HoldId),
    Pax              int NOT NULL CONSTRAINT CK_Bookings_Pax CHECK (Pax BETWEEN 1 AND 50),
    UnitPrice        decimal(12,2) NOT NULL,
    TotalAmount      decimal(12,2) NOT NULL,
    Currency         char(3) NOT NULL CONSTRAINT DF_Bookings_Currency DEFAULT 'TWD',
    Status           varchar(20) NOT NULL CONSTRAINT CK_Bookings_Status CHECK (Status IN ('Pending','Confirmed','Rejected','CancelRequested','Cancelled')),
    PaymentStatus    varchar(20) NOT NULL CONSTRAINT DF_Bookings_PayStatus DEFAULT 'Unpaid' CONSTRAINT CK_Bookings_PayStatus CHECK (PaymentStatus IN ('Unpaid','Paid','PartiallyRefunded','Refunded')),
    AmountPaid       decimal(12,2) NOT NULL CONSTRAINT DF_Bookings_Paid DEFAULT 0,
    AmountRefunded   decimal(12,2) NOT NULL CONSTRAINT DF_Bookings_Refunded DEFAULT 0,
    LeadName         nvarchar(100) NOT NULL,
    LeadPhoneEnc     varbinary(512) NULL,
    LeadPhoneMasked  nvarchar(30) NULL,
    PassportEnc      varbinary(512) NULL,
    PassportMasked   nvarchar(30) NULL,
    SpecialRequests  nvarchar(1000) NULL,
    CancelReason     nvarchar(300) NULL,
    CreatedBy        uniqueidentifier NOT NULL,
    CreatedAtUtc     datetime2(3) NOT NULL CONSTRAINT DF_Bookings_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc     datetime2(3) NOT NULL CONSTRAINT DF_Bookings_Updated DEFAULT SYSUTCDATETIME(),
    IsDemo           bit NOT NULL CONSTRAINT DF_Bookings_Demo DEFAULT 0,
    RowVersion       rowversion NOT NULL,
    CONSTRAINT CK_Bookings_Money CHECK (AmountPaid >= 0 AND AmountRefunded >= 0 AND AmountRefunded <= AmountPaid)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bookings_Customer') CREATE INDEX IX_Bookings_Customer ON dbo.Bookings(CustomerUserId, CreatedAtUtc DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bookings_Departure') CREATE INDEX IX_Bookings_Departure ON dbo.Bookings(DepartureId, Status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bookings_Status') CREATE INDEX IX_Bookings_Status ON dbo.Bookings(Status, CreatedAtUtc DESC);

IF OBJECT_ID('dbo.BookingStatusHistory') IS NULL
CREATE TABLE dbo.BookingStatusHistory (
    HistoryId    bigint IDENTITY(1,1) CONSTRAINT PK_BookingStatusHistory PRIMARY KEY,
    BookingId    int NOT NULL CONSTRAINT FK_BookingStatusHistory_Booking REFERENCES dbo.Bookings(BookingId),
    FromStatus   varchar(20) NULL,
    ToStatus     varchar(20) NOT NULL,
    ActorUserId  uniqueidentifier NULL,
    Comment      nvarchar(500) NULL,
    OccurredAtUtc datetime2(3) NOT NULL CONSTRAINT DF_BookingStatusHistory_At DEFAULT SYSUTCDATETIME()
);

/* ---- Workflow engine (routing is data, not code) ---- */
IF OBJECT_ID('dbo.WorkflowDefinitions') IS NULL
CREATE TABLE dbo.WorkflowDefinitions (
    WorkflowId   int IDENTITY(1,1) CONSTRAINT PK_WorkflowDefinitions PRIMARY KEY,
    WorkflowKey  varchar(60) NOT NULL,
    Version      int NOT NULL,
    EntityType   varchar(30) NOT NULL CONSTRAINT CK_WorkflowDefinitions_Entity CHECK (EntityType IN ('Booking','Refund','GroupPlan')),
    Name         nvarchar(100) NOT NULL,
    IsActive     bit NOT NULL CONSTRAINT DF_WorkflowDefinitions_Active DEFAULT 1,
    CreatedBy    uniqueidentifier NULL,
    CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_WorkflowDefinitions_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_WorkflowDefinitions UNIQUE (WorkflowKey, Version)
);

IF OBJECT_ID('dbo.WorkflowSteps') IS NULL
CREATE TABLE dbo.WorkflowSteps (
    StepId         int IDENTITY(1,1) CONSTRAINT PK_WorkflowSteps PRIMARY KEY,
    WorkflowId     int NOT NULL CONSTRAINT FK_WorkflowSteps_Workflow REFERENCES dbo.WorkflowDefinitions(WorkflowId),
    StepNo         int NOT NULL,
    Name           nvarchar(100) NOT NULL,
    ApproverRoleId int NOT NULL CONSTRAINT FK_WorkflowSteps_Role REFERENCES dbo.Roles(RoleId),
    ConditionType  varchar(30) NOT NULL CONSTRAINT CK_WorkflowSteps_Cond CHECK (ConditionType IN ('Always','AmountGreaterThan','PaxGreaterThan')),
    ConditionValue decimal(12,2) NULL,
    SlaHours       int NOT NULL CONSTRAINT CK_WorkflowSteps_Sla CHECK (SlaHours BETWEEN 1 AND 168),
    EscalateRoleId int NULL CONSTRAINT FK_WorkflowSteps_Escalate REFERENCES dbo.Roles(RoleId),
    CONSTRAINT UQ_WorkflowSteps UNIQUE (WorkflowId, StepNo)
);

IF OBJECT_ID('dbo.ApprovalRequests') IS NULL
CREATE TABLE dbo.ApprovalRequests (
    ApprovalRequestId int IDENTITY(1,1) CONSTRAINT PK_ApprovalRequests PRIMARY KEY,
    WorkflowId     int NOT NULL CONSTRAINT FK_ApprovalRequests_Workflow REFERENCES dbo.WorkflowDefinitions(WorkflowId),
    EntityType     varchar(30) NOT NULL,
    EntityId       int NOT NULL,
    EntityRef      varchar(30) NOT NULL,
    Amount         decimal(12,2) NULL,
    Pax            int NULL,
    CurrentStepNo  int NOT NULL,
    Status         varchar(20) NOT NULL CONSTRAINT CK_ApprovalRequests_Status CHECK (Status IN ('Pending','Approved','Rejected','Cancelled')),
    AssignedUserId uniqueidentifier NULL,       -- set when delegated
    RequestedBy    uniqueidentifier NOT NULL,
    StepDueAtUtc   datetime2(3) NOT NULL,
    CreatedAtUtc   datetime2(3) NOT NULL CONSTRAINT DF_ApprovalRequests_Created DEFAULT SYSUTCDATETIME(),
    CompletedAtUtc datetime2(3) NULL,
    RowVersion     rowversion NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ApprovalRequests_Entity') CREATE INDEX IX_ApprovalRequests_Entity ON dbo.ApprovalRequests(EntityType, EntityId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ApprovalRequests_Pending') CREATE INDEX IX_ApprovalRequests_Pending ON dbo.ApprovalRequests(Status, StepDueAtUtc);

IF OBJECT_ID('dbo.ApprovalActions') IS NULL
CREATE TABLE dbo.ApprovalActions (
    ActionId          bigint IDENTITY(1,1) CONSTRAINT PK_ApprovalActions PRIMARY KEY,
    ApprovalRequestId int NOT NULL CONSTRAINT FK_ApprovalActions_Request REFERENCES dbo.ApprovalRequests(ApprovalRequestId),
    StepNo            int NOT NULL,
    ActorUserId       uniqueidentifier NOT NULL,
    Decision          varchar(20) NOT NULL CONSTRAINT CK_ApprovalActions_Decision CHECK (Decision IN ('Approved','Rejected','Delegated','Escalated')),
    Comment           nvarchar(500) NULL,
    DelegatedToUserId uniqueidentifier NULL,
    ActedAtUtc        datetime2(3) NOT NULL CONSTRAINT DF_ApprovalActions_At DEFAULT SYSUTCDATETIME()
);
GO
CREATE OR ALTER TRIGGER dbo.TR_ApprovalActions_Immutable ON dbo.ApprovalActions INSTEAD OF UPDATE, DELETE AS BEGIN THROW 50090, 'history_immutable', 1; END;
GO
CREATE OR ALTER TRIGGER dbo.TR_BookingStatusHistory_Immutable ON dbo.BookingStatusHistory INSTEAD OF UPDATE, DELETE AS BEGIN THROW 50090, 'history_immutable', 1; END;
GO

/* ---- Finance (simulated provider only) ---- */
IF OBJECT_ID('dbo.Payments') IS NULL
CREATE TABLE dbo.Payments (
    PaymentId      int IDENTITY(1,1) CONSTRAINT PK_Payments PRIMARY KEY,
    BookingId      int NOT NULL CONSTRAINT FK_Payments_Booking REFERENCES dbo.Bookings(BookingId),
    Amount         decimal(12,2) NOT NULL CONSTRAINT CK_Payments_Amount CHECK (Amount > 0),
    Currency       char(3) NOT NULL,
    Provider       varchar(20) NOT NULL CONSTRAINT DF_Payments_Provider DEFAULT 'SIMULATED',
    ProviderRef    varchar(64) NOT NULL,
    Method         varchar(20) NOT NULL CONSTRAINT CK_Payments_Method CHECK (Method IN ('BankTransfer','Cash','CardSimulated')),
    IdempotencyKey varchar(64) NOT NULL CONSTRAINT UQ_Payments_Idem UNIQUE,
    CreatedBy      uniqueidentifier NOT NULL,
    CreatedAtUtc   datetime2(3) NOT NULL CONSTRAINT DF_Payments_Created DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.Refunds') IS NULL
CREATE TABLE dbo.Refunds (
    RefundId          int IDENTITY(1,1) CONSTRAINT PK_Refunds PRIMARY KEY,
    RefundRef         AS ('RF-' + RIGHT('000000' + CAST(RefundId AS varchar(10)), 6)) PERSISTED,
    BookingId         int NOT NULL CONSTRAINT FK_Refunds_Booking REFERENCES dbo.Bookings(BookingId),
    Amount            decimal(12,2) NOT NULL CONSTRAINT CK_Refunds_Amount CHECK (Amount > 0),
    Reason            nvarchar(100) NOT NULL,
    Status            varchar(20) NOT NULL CONSTRAINT CK_Refunds_Status CHECK (Status IN ('PendingApproval','Processed','Rejected')),
    ApprovalRequestId int NULL CONSTRAINT FK_Refunds_Approval REFERENCES dbo.ApprovalRequests(ApprovalRequestId),
    CreatedBy         uniqueidentifier NOT NULL,
    CreatedAtUtc      datetime2(3) NOT NULL CONSTRAINT DF_Refunds_Created DEFAULT SYSUTCDATETIME(),
    ProcessedAtUtc    datetime2(3) NULL
);

/* ---- Costs, suppliers, reconciliation, integration ---- */
IF OBJECT_ID('dbo.DepartureCosts') IS NULL
CREATE TABLE dbo.DepartureCosts (
    CostId      int IDENTITY(1,1) CONSTRAINT PK_DepartureCosts PRIMARY KEY,
    DepartureId int NOT NULL CONSTRAINT FK_DepartureCosts_Departure REFERENCES dbo.Departures(DepartureId),
    SupplierId  int NOT NULL CONSTRAINT FK_DepartureCosts_Supplier REFERENCES dbo.Suppliers(SupplierId),
    CostType    varchar(20) NOT NULL CONSTRAINT CK_DepartureCosts_Type CHECK (CostType IN ('Hotel','Coach','Meal','Guide','Other')),
    Amount      decimal(12,2) NOT NULL CONSTRAINT CK_DepartureCosts_Amount CHECK (Amount >= 0),
    IsDemo      bit NOT NULL CONSTRAINT DF_DepartureCosts_Demo DEFAULT 0,
    CONSTRAINT UQ_DepartureCosts UNIQUE (DepartureId, SupplierId, CostType)
);

IF OBJECT_ID('dbo.SupplierStatements') IS NULL
CREATE TABLE dbo.SupplierStatements (
    StatementId  int IDENTITY(1,1) CONSTRAINT PK_SupplierStatements PRIMARY KEY,
    SupplierId   int NOT NULL CONSTRAINT FK_SupplierStatements_Supplier REFERENCES dbo.Suppliers(SupplierId),
    Period       char(7) NOT NULL CONSTRAINT CK_SupplierStatements_Period CHECK (Period LIKE '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
    Amount       decimal(12,2) NOT NULL,
    Source       varchar(20) NOT NULL CONSTRAINT CK_SupplierStatements_Source CHECK (Source IN ('Webhook','Manual','Seed')),
    ReceivedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_SupplierStatements_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_SupplierStatements UNIQUE (SupplierId, Period)
);

IF OBJECT_ID('dbo.Reconciliations') IS NULL
CREATE TABLE dbo.Reconciliations (
    ReconId        int IDENTITY(1,1) CONSTRAINT PK_Reconciliations PRIMARY KEY,
    SupplierId     int NOT NULL CONSTRAINT FK_Reconciliations_Supplier REFERENCES dbo.Suppliers(SupplierId),
    Period         char(7) NOT NULL,
    OurAmount      decimal(12,2) NOT NULL,
    SupplierAmount decimal(12,2) NULL,
    Difference     AS (ISNULL(SupplierAmount, 0) - OurAmount) PERSISTED,
    Status         varchar(20) NOT NULL CONSTRAINT CK_Reconciliations_Status CHECK (Status IN ('Matched','Mismatch','MissingStatement','Accepted','Settled')),
    ResolutionNote nvarchar(500) NULL,
    ResolvedBy     uniqueidentifier NULL,
    RunAtUtc       datetime2(3) NOT NULL CONSTRAINT DF_Reconciliations_At DEFAULT SYSUTCDATETIME(),
    RowVersion     rowversion NOT NULL,
    CONSTRAINT UQ_Reconciliations UNIQUE (SupplierId, Period)
);

IF OBJECT_ID('dbo.IntegrationEvents') IS NULL
CREATE TABLE dbo.IntegrationEvents (
    EventId          bigint IDENTITY(1,1) CONSTRAINT PK_IntegrationEvents PRIMARY KEY,
    SupplierId       int NOT NULL CONSTRAINT FK_IntegrationEvents_Supplier REFERENCES dbo.Suppliers(SupplierId),
    EventType        varchar(60) NOT NULL,
    IdempotencyKey   varchar(100) NOT NULL,
    CorrelationId    varchar(64) NULL,
    PayloadJson      nvarchar(max) NOT NULL,
    Status           varchar(20) NOT NULL CONSTRAINT CK_IntegrationEvents_Status CHECK (Status IN ('Received','Processed','Failed','DeadLetter')),
    Attempts         int NOT NULL CONSTRAINT DF_IntegrationEvents_Attempts DEFAULT 0,
    DuplicateCount   int NOT NULL CONSTRAINT DF_IntegrationEvents_Dups DEFAULT 0,
    NextAttemptAtUtc datetime2(3) NULL,
    LastError        nvarchar(500) NULL,
    ReceivedAtUtc    datetime2(3) NOT NULL CONSTRAINT DF_IntegrationEvents_At DEFAULT SYSUTCDATETIME(),
    ProcessedAtUtc   datetime2(3) NULL,
    IsDemo           bit NOT NULL CONSTRAINT DF_IntegrationEvents_Demo DEFAULT 0,
    CONSTRAINT UQ_IntegrationEvents UNIQUE (SupplierId, IdempotencyKey)
);

IF OBJECT_ID('dbo.VehicleTypes') IS NULL
CREATE TABLE dbo.VehicleTypes (
    VehicleTypeId int IDENTITY(1,1) CONSTRAINT PK_VehicleTypes PRIMARY KEY,
    Code       varchar(20) NOT NULL CONSTRAINT UQ_VehicleTypes_Code UNIQUE,
    Name       nvarchar(100) NOT NULL,
    Seats      int NOT NULL CONSTRAINT CK_VehicleTypes_Seats CHECK (Seats BETWEEN 1 AND 80),
    CostPerDay decimal(12,2) NOT NULL CONSTRAINT CK_VehicleTypes_Cost CHECK (CostPerDay >= 0),
    SupplierId int NULL CONSTRAINT FK_VehicleTypes_Supplier REFERENCES dbo.Suppliers(SupplierId),
    IsActive   bit NOT NULL CONSTRAINT DF_VehicleTypes_Active DEFAULT 1,
    IsDemo     bit NOT NULL CONSTRAINT DF_VehicleTypes_Demo DEFAULT 0
);

IF OBJECT_ID('dbo.CostAssumptions') IS NULL
CREATE TABLE dbo.CostAssumptions (
    AssumptionId int IDENTITY(1,1) CONSTRAINT PK_CostAssumptions PRIMARY KEY,
    AssumptionKey varchar(50) NOT NULL CONSTRAINT UQ_CostAssumptions_Key UNIQUE,
    Value        decimal(12,2) NOT NULL CONSTRAINT CK_CostAssumptions_Value CHECK (Value >= 0),
    Unit         varchar(30) NOT NULL,
    Description  nvarchar(200) NULL,
    UpdatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_CostAssumptions_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion   rowversion NOT NULL
);

IF OBJECT_ID('dbo.GroupPlans') IS NULL
CREATE TABLE dbo.GroupPlans (
    GroupPlanId        int IDENTITY(1,1) CONSTRAINT PK_GroupPlans PRIMARY KEY,
    PlanRef            AS ('GP-' + RIGHT('000000' + CAST(GroupPlanId AS varchar(10)), 6)) PERSISTED,
    DepartureId        int NOT NULL CONSTRAINT FK_GroupPlans_Departure REFERENCES dbo.Departures(DepartureId),
    Status             varchar(20) NOT NULL CONSTRAINT CK_GroupPlans_Status CHECK (Status IN ('Draft','Submitted','Approved','Rejected')),
    InputsJson         nvarchar(max) NOT NULL,
    ResultJson         nvarchar(max) NOT NULL,
    ChosenOption       varchar(100) NOT NULL,
    ProjectedCost      decimal(12,2) NOT NULL,
    ProjectedRevenue   decimal(12,2) NOT NULL,
    ProjectedMarginPct decimal(6,2) NOT NULL,
    ApprovalRequestId  int NULL CONSTRAINT FK_GroupPlans_Approval REFERENCES dbo.ApprovalRequests(ApprovalRequestId),
    CreatedBy          uniqueidentifier NOT NULL,
    CreatedAtUtc       datetime2(3) NOT NULL CONSTRAINT DF_GroupPlans_Created DEFAULT SYSUTCDATETIME(),
    RowVersion         rowversion NOT NULL
);

/* ---- Employee operations ---- */
IF OBJECT_ID('dbo.StaffTasks') IS NULL
CREATE TABLE dbo.StaffTasks (
    TaskId         int IDENTITY(1,1) CONSTRAINT PK_StaffTasks PRIMARY KEY,
    Title          nvarchar(200) NOT NULL,
    TaskType       varchar(20) NOT NULL CONSTRAINT CK_StaffTasks_Type CHECK (TaskType IN ('Customer','Supplier','Exception','Finance','Approval')),
    EntityType     varchar(30) NULL,
    EntityRef      varchar(30) NULL,
    AssignedUserId uniqueidentifier NULL CONSTRAINT FK_StaffTasks_User REFERENCES dbo.Users(UserId),
    Status         varchar(20) NOT NULL CONSTRAINT DF_StaffTasks_Status DEFAULT 'Open' CONSTRAINT CK_StaffTasks_Status CHECK (Status IN ('Open','InProgress','Done')),
    Priority       varchar(10) NOT NULL CONSTRAINT DF_StaffTasks_Priority DEFAULT 'Normal' CONSTRAINT CK_StaffTasks_Priority CHECK (Priority IN ('Low','Normal','High')),
    DueAtUtc       datetime2(3) NOT NULL,
    Note           nvarchar(1000) NULL,
    CreatedAtUtc   datetime2(3) NOT NULL CONSTRAINT DF_StaffTasks_Created DEFAULT SYSUTCDATETIME(),
    CompletedAtUtc datetime2(3) NULL,
    IsDemo         bit NOT NULL CONSTRAINT DF_StaffTasks_Demo DEFAULT 0,
    RowVersion     rowversion NOT NULL
);

IF OBJECT_ID('dbo.RetentionPolicies') IS NULL
CREATE TABLE dbo.RetentionPolicies (
    PolicyId  int IDENTITY(1,1) CONSTRAINT PK_RetentionPolicies PRIMARY KEY,
    DataClass varchar(50) NOT NULL CONSTRAINT UQ_RetentionPolicies UNIQUE,
    Fields    nvarchar(200) NOT NULL,
    KeepDays  int NOT NULL CONSTRAINT CK_RetentionPolicies_Days CHECK (KeepDays BETWEEN 30 AND 3650),
    Action    varchar(20) NOT NULL CONSTRAINT CK_RetentionPolicies_Action CHECK (Action IN ('Anonymise','Delete','Keep')),
    IsActive  bit NOT NULL CONSTRAINT DF_RetentionPolicies_Active DEFAULT 1,
    LastRunAtUtc datetime2(3) NULL,
    RowVersion rowversion NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '100_erp_schema.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('100_erp_schema.sql');
