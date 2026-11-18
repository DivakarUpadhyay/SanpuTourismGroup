/* 111_payment_before_confirmation.sql — nothing is Confirmed until a payment has succeeded.
   Hotels, flights, buses and taxis start as AwaitingPayment and become Confirmed on the first successful payment. Idempotent. */
SET NOCOUNT ON;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ServiceBookings_Status' AND definition NOT LIKE '%AwaitingPayment%')
    ALTER TABLE dbo.ServiceBookings DROP CONSTRAINT CK_ServiceBookings_Status;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ServiceBookings_Status')
    ALTER TABLE dbo.ServiceBookings ADD CONSTRAINT CK_ServiceBookings_Status CHECK (Status IN ('AwaitingPayment','Confirmed','Cancelled','Completed'));
GO
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_ServiceBookings_Status' AND definition LIKE '%Confirmed%')
    ALTER TABLE dbo.ServiceBookings DROP CONSTRAINT DF_ServiceBookings_Status;
GO
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_ServiceBookings_Status')
    ALTER TABLE dbo.ServiceBookings ADD CONSTRAINT DF_ServiceBookings_Status DEFAULT 'AwaitingPayment' FOR Status;
GO
-- existing bookings: unpaid services go back to awaiting payment
UPDATE dbo.ServiceBookings SET Status = 'AwaitingPayment' WHERE Status = 'Confirmed' AND AmountPaid = 0;
-- existing tours confirmed without payment have no open approval left, so they are closed and their seats released
DECLARE @T TABLE (BookingId int, Pax int, DepartureId int);
UPDATE dbo.Bookings SET Status = 'Cancelled', CancelReason = N'Closed: confirmed without a successful payment', UpdatedAtUtc = SYSUTCDATETIME()
OUTPUT inserted.BookingId, inserted.Pax, inserted.DepartureId INTO @T WHERE Status = 'Confirmed' AND AmountPaid = 0;
UPDATE d SET SeatsSold = d.SeatsSold - t.Pax FROM dbo.Departures d JOIN @T t ON t.DepartureId = d.DepartureId;
INSERT dbo.BookingStatusHistory(BookingId, FromStatus, ToStatus, ActorUserId, Comment) SELECT BookingId, 'Confirmed', 'Cancelled', NULL, N'Closed: confirmed without a successful payment' FROM @T;
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '111_payment_before_confirmation.sql') INSERT dbo.SchemaVersions(ScriptName) VALUES ('111_payment_before_confirmation.sql');
