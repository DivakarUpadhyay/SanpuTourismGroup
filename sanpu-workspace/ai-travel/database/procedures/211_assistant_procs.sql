SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
GO
/* Holds the quote for 30 minutes. Asking again for the same item and date replaces the old quote. */
CREATE OR ALTER PROCEDURE dbo.usp_Reservation_Prepare
    @TravelerUserId uniqueidentifier, @Kind varchar(10), @ItemCode varchar(40), @ItemName nvarchar(200), @ImageUrl varchar(300) = NULL,
    @StartDate date, @EndDate date = NULL, @Travelers int, @Units int = 1, @DepartureId int = NULL, @Total decimal(12,2), @Currency char(3) = 'TWD',
    @Notes nvarchar(300) = NULL, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @StartDate < CAST(SYSUTCDATETIME() AS date) THROW 50070, 'past_date', 1;
    UPDATE dbo.Reservations SET Status = 'Expired', UpdatedAtUtc = SYSUTCDATETIME()
    WHERE TravelerUserId = @TravelerUserId AND Status = 'AwaitingConfirmation' AND (ExpiresAtUtc < SYSUTCDATETIME() OR (ItemCode = @ItemCode AND StartDate = @StartDate));
    INSERT dbo.Reservations(TravelerUserId, Kind, ItemCode, ItemName, ImageUrl, StartDate, EndDate, Travelers, Units, DepartureId, Total, Currency, Status, Notes, ExpiresAtUtc)
    VALUES (@TravelerUserId, @Kind, @ItemCode, @ItemName, @ImageUrl, @StartDate, @EndDate, @Travelers, @Units, @DepartureId, @Total, @Currency, 'AwaitingConfirmation', @Notes, DATEADD(MINUTE, 30, SYSUTCDATETIME()));
    DECLARE @Id int = SCOPE_IDENTITY();
    EXEC dbo.usp_Audit_Write @TravelerUserId, 'Reservation.Prepared', 'Reservation', @Id, NULL, @CorrelationId, NULL;
    SELECT * FROM dbo.Reservations WHERE ReservationId = @Id;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Reservation_ListForTraveler @TravelerUserId uniqueidentifier AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Reservations SET Status = 'Expired', UpdatedAtUtc = SYSUTCDATETIME()
    WHERE TravelerUserId = @TravelerUserId AND Status = 'AwaitingConfirmation' AND ExpiresAtUtc < SYSUTCDATETIME();
    SELECT * FROM dbo.Reservations WHERE TravelerUserId = @TravelerUserId AND Status <> 'Expired' ORDER BY CreatedAtUtc DESC;
END;
GO
/* Staff view of every assistant booking. */
CREATE OR ALTER PROCEDURE dbo.usp_Reservation_ListAll @Status varchar(25) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT r.*, u.DisplayName AS TravelerName, u.Email AS TravelerEmail
    FROM dbo.Reservations r JOIN dbo.Users u ON u.UserId = r.TravelerUserId
    WHERE r.Status <> 'Expired' AND (@Status IS NULL OR r.Status = @Status) ORDER BY r.CreatedAtUtc DESC;
END;
GO
/* Pay a deposit, the full amount or the remaining balance. Owner only, open reservations only. */
CREATE OR ALTER PROCEDURE dbo.usp_Reservation_Pay
    @ReservationId int, @TravelerUserId uniqueidentifier, @Amount decimal(12,2), @PaymentRef varchar(40), @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    DECLARE @Status varchar(25), @Total decimal(12,2), @Paid decimal(12,2), @Exp datetime2(3);
    SELECT @Status = Status, @Total = Total, @Paid = PaidAmount, @Exp = ExpiresAtUtc
    FROM dbo.Reservations WITH (UPDLOCK, HOLDLOCK) WHERE ReservationId = @ReservationId AND TravelerUserId = @TravelerUserId;
    IF @Status IS NULL THROW 50001, 'not_found', 1;
    IF @Status = 'AwaitingConfirmation' AND @Exp < SYSUTCDATETIME() THROW 50071, 'quote_expired', 1;
    IF @Status NOT IN ('AwaitingConfirmation','PartiallyPaid') THROW 50072, 'not_payable', 1;
    IF @Amount <= 0 OR @Paid + @Amount > @Total THROW 50073, 'bad_amount', 1;
    UPDATE dbo.Reservations SET PaidAmount = PaidAmount + @Amount, PaymentRef = @PaymentRef,
        Status = CASE WHEN @Paid + @Amount >= @Total THEN 'Confirmed' ELSE 'PartiallyPaid' END, UpdatedAtUtc = SYSUTCDATETIME()
    WHERE ReservationId = @ReservationId;
    EXEC dbo.usp_Audit_Write @TravelerUserId, 'Reservation.Paid', 'Reservation', @ReservationId, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT * FROM dbo.Reservations WHERE ReservationId = @ReservationId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Reservation_Cancel @ReservationId int, @TravelerUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Reservations WHERE ReservationId = @ReservationId AND TravelerUserId = @TravelerUserId) THROW 50001, 'not_found', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Reservations WHERE ReservationId = @ReservationId AND Status IN ('AwaitingConfirmation','Confirmed','PartiallyPaid')) THROW 50072, 'not_payable', 1;
    UPDATE dbo.Reservations SET Status = 'Cancelled', UpdatedAtUtc = SYSUTCDATETIME() WHERE ReservationId = @ReservationId;
    EXEC dbo.usp_Audit_Write @TravelerUserId, 'Reservation.Cancelled', 'Reservation', @ReservationId, NULL, @CorrelationId, NULL;
    SELECT * FROM dbo.Reservations WHERE ReservationId = @ReservationId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_DisplayName @UserId uniqueidentifier AS
BEGIN
    SET NOCOUNT ON;
    SELECT DisplayName FROM dbo.Users WHERE UserId = @UserId;
END;
GO
