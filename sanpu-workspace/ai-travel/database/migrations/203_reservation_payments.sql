/* 203_reservation_payments.sql — every card payment attempt on an assistant booking. A booking only counts as paid after the
   gateway confirms the trade (signature + server-to-server query). Idempotent. */
SET NOCOUNT ON;
IF OBJECT_ID('dbo.ReservationPayments') IS NULL
CREATE TABLE dbo.ReservationPayments (
    PaymentId       int IDENTITY(1,1) CONSTRAINT PK_ReservationPayments PRIMARY KEY,
    MerchantTradeNo varchar(20)   NOT NULL CONSTRAINT UQ_ReservationPayments_Trade UNIQUE,
    ReservationId   int           NOT NULL CONSTRAINT FK_ReservationPayments_Reservation REFERENCES dbo.Reservations(ReservationId),
    TravelerUserId  uniqueidentifier NOT NULL CONSTRAINT FK_ReservationPayments_User REFERENCES dbo.Users(UserId),
    Mode            varchar(10)   NOT NULL CONSTRAINT CK_ReservationPayments_Mode CHECK (Mode IN ('Deposit','Balance','Full')),
    Amount          decimal(12,2) NOT NULL CONSTRAINT CK_ReservationPayments_Amount CHECK (Amount > 0),
    Currency        char(3)       NOT NULL,
    Provider        varchar(20)   NOT NULL,
    Status          varchar(10)   NOT NULL CONSTRAINT CK_ReservationPayments_Status CHECK (Status IN ('Pending','Paid','Failed')),
    ProviderTradeNo varchar(40)   NULL,
    PaymentMethod   varchar(40)   NULL,
    ProviderMessage nvarchar(200) NULL,
    CreatedAtUtc    datetime2(3)  NOT NULL CONSTRAINT DF_ReservationPayments_Created DEFAULT SYSUTCDATETIME(),
    CompletedAtUtc  datetime2(3)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ReservationPayments_Reservation') CREATE INDEX IX_ReservationPayments_Reservation ON dbo.ReservationPayments(ReservationId, CreatedAtUtc DESC);
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '203_reservation_payments.sql') INSERT dbo.SchemaVersions(ScriptName) VALUES ('203_reservation_payments.sql');
