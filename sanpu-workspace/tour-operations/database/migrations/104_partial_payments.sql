/* 104_partial_payments.sql — deposit + balance payments for hotel/flight/bus/taxi bookings (tour bookings already track AmountPaid).
   Every payment is a ledger row; the booking keeps running totals. Idempotent. */
SET NOCOUNT ON;
IF COL_LENGTH('dbo.ServiceBookings', 'AmountPaid') IS NULL
    ALTER TABLE dbo.ServiceBookings ADD AmountPaid decimal(12,2) NOT NULL CONSTRAINT DF_ServiceBookings_Paid DEFAULT 0;
IF COL_LENGTH('dbo.ServiceBookings', 'BalanceDueDate') IS NULL
    ALTER TABLE dbo.ServiceBookings ADD BalanceDueDate date NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ServiceBookings_Pay' AND definition LIKE '%PartiallyPaid%')
BEGIN
    ALTER TABLE dbo.ServiceBookings DROP CONSTRAINT CK_ServiceBookings_Pay;
    ALTER TABLE dbo.ServiceBookings ADD CONSTRAINT CK_ServiceBookings_Pay CHECK (PaymentStatus IN ('Unpaid','PartiallyPaid','Paid','Refunded'));
END
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ServiceBookings_PaidRange')
    ALTER TABLE dbo.ServiceBookings ADD CONSTRAINT CK_ServiceBookings_PaidRange CHECK (AmountPaid >= 0 AND AmountPaid <= TotalAmount);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Bookings_PayStatus' AND definition LIKE '%PartiallyPaid%')
BEGIN
    ALTER TABLE dbo.Bookings DROP CONSTRAINT CK_Bookings_PayStatus;
    ALTER TABLE dbo.Bookings ADD CONSTRAINT CK_Bookings_PayStatus CHECK (PaymentStatus IN ('Unpaid','PartiallyPaid','Paid','PartiallyRefunded','Refunded'));
END
IF COL_LENGTH('dbo.Bookings', 'BalanceDueDate') IS NULL
    ALTER TABLE dbo.Bookings ADD BalanceDueDate date NULL;
GO
IF OBJECT_ID('dbo.ServicePayments') IS NULL
CREATE TABLE dbo.ServicePayments (
    PaymentId        int IDENTITY(1,1) CONSTRAINT PK_ServicePayments PRIMARY KEY,
    ServiceBookingId int NOT NULL CONSTRAINT FK_ServicePayments_Booking REFERENCES dbo.ServiceBookings(ServiceBookingId),
    Amount           decimal(12,2) NOT NULL CONSTRAINT CK_ServicePayments_Amount CHECK (Amount > 0),
    Mode             varchar(10) NOT NULL CONSTRAINT CK_ServicePayments_Mode CHECK (Mode IN ('Deposit','Balance','Full')),
    Provider         varchar(20) NOT NULL CONSTRAINT DF_ServicePayments_Provider DEFAULT 'SIMULATED',
    ProviderRef      varchar(40) NOT NULL,
    IdempotencyKey   varchar(64) NOT NULL CONSTRAINT UQ_ServicePayments_Idem UNIQUE,
    CreatedBy        uniqueidentifier NOT NULL,
    CreatedAtUtc     datetime2(3) NOT NULL CONSTRAINT DF_ServicePayments_Created DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '104_partial_payments.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('104_partial_payments.sql');
