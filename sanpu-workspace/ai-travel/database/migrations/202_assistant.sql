/* 202_assistant.sql — bookings made with the AI assistant. The assistant can only PREPARE a booking (status AwaitingConfirmation);
   the traveler confirms and pays (deposit or full) with a button, never the model. Prices come from Sanpu Travel live search. Idempotent. */
SET NOCOUNT ON;
IF OBJECT_ID('dbo.Reservations') IS NULL
CREATE TABLE dbo.Reservations (
    ReservationId  int IDENTITY(1,1) CONSTRAINT PK_Reservations PRIMARY KEY,
    Ref            AS ('AI-' + RIGHT('000000' + CAST(ReservationId AS varchar(10)), 6)) PERSISTED,
    TravelerUserId uniqueidentifier NOT NULL CONSTRAINT FK_Reservations_User REFERENCES dbo.Users(UserId),
    Kind           varchar(10)   NOT NULL CONSTRAINT CK_Reservations_Kind CHECK (Kind IN ('Tour','Hotel','Flight','Bus','Taxi')),
    ItemCode       varchar(40)   NOT NULL,
    ItemName       nvarchar(200) NOT NULL,
    ImageUrl       varchar(300)  NULL,
    StartDate      date          NOT NULL,
    EndDate        date          NULL,
    Travelers      int           NOT NULL CONSTRAINT CK_Reservations_Travelers CHECK (Travelers BETWEEN 1 AND 20),
    Units          int           NOT NULL CONSTRAINT DF_Reservations_Units DEFAULT 1,
    DepartureId    int           NULL,
    Total          decimal(12,2) NOT NULL CONSTRAINT CK_Reservations_Total CHECK (Total > 0),
    Currency       char(3)       NOT NULL CONSTRAINT DF_Reservations_Cur DEFAULT 'TWD',
    Status         varchar(25)   NOT NULL CONSTRAINT CK_Reservations_Status CHECK (Status IN ('AwaitingConfirmation','Confirmed','PartiallyPaid','Cancelled','Expired')),
    PaidAmount     decimal(12,2) NOT NULL CONSTRAINT DF_Reservations_Paid DEFAULT 0,
    PaymentRef     varchar(40)   NULL,
    Notes          nvarchar(300) NULL,
    CreatedVia     varchar(20)   NOT NULL CONSTRAINT DF_Reservations_Via DEFAULT 'Assistant',
    ExpiresAtUtc   datetime2(3)  NOT NULL,
    CreatedAtUtc   datetime2(3)  NOT NULL CONSTRAINT DF_Reservations_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc   datetime2(3)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reservations_Traveler') CREATE INDEX IX_Reservations_Traveler ON dbo.Reservations(TravelerUserId, CreatedAtUtc DESC);
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '202_assistant.sql') INSERT dbo.SchemaVersions(ScriptName) VALUES ('202_assistant.sql');
