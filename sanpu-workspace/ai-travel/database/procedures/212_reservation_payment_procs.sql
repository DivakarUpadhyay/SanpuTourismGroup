SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
GO
CREATE OR ALTER VIEW dbo.vw_ReservationPayments AS
SELECT p.PaymentId, p.MerchantTradeNo, p.ReservationId, p.TravelerUserId, p.Mode, p.Amount, p.Currency, p.Provider, p.Status, p.ProviderTradeNo, p.PaymentMethod,
       p.ProviderMessage, p.CreatedAtUtc, p.CompletedAtUtc, r.Ref AS OrderRef, r.ItemName, r.Status AS ReservationStatus, r.Total, r.PaidAmount, r.StartDate, r.EndDate,
       r.Travelers, u.DisplayName AS TravelerName, u.Email AS TravelerEmail
FROM dbo.ReservationPayments p
JOIN dbo.Reservations r ON r.ReservationId = p.ReservationId
JOIN dbo.Users u ON u.UserId = p.TravelerUserId;
GO
/* Starts a checkout. The amount is computed here, never taken from the browser. The held price is extended while the traveler is on the payment page. */
CREATE OR ALTER PROCEDURE dbo.usp_ReservationPayment_Create
    @ReservationId int, @TravelerUserId uniqueidentifier, @Mode varchar(10), @DepositPercent int, @Provider varchar(20), @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    DECLARE @Status varchar(25), @Total decimal(12,2), @Paid decimal(12,2), @Exp datetime2(3), @Currency char(3), @Amount decimal(12,2);
    SELECT @Status = Status, @Total = Total, @Paid = PaidAmount, @Exp = ExpiresAtUtc, @Currency = Currency
    FROM dbo.Reservations WITH (UPDLOCK, HOLDLOCK) WHERE ReservationId = @ReservationId AND TravelerUserId = @TravelerUserId;
    IF @Status IS NULL THROW 50001, 'not_found', 1;
    IF @Status = 'AwaitingConfirmation' AND @Exp < SYSUTCDATETIME() THROW 50071, 'quote_expired', 1;
    IF @Status NOT IN ('AwaitingConfirmation','PartiallyPaid') THROW 50072, 'not_payable', 1;
    IF @Mode = 'Deposit' AND @Paid > 0 THROW 50073, 'bad_amount', 1;
    SET @Amount = CASE WHEN @Mode = 'Deposit' THEN ROUND(@Total * @DepositPercent / 100.0, 0) ELSE CEILING(@Total - @Paid) END;
    IF @Amount <= 0 THROW 50073, 'bad_amount', 1;

    DECLARE @Trade varchar(20) = 'AI' + FORMAT(SYSUTCDATETIME(), 'yyMMddHHmmss') + RIGHT(CONVERT(varchar(36), NEWID()), 6);   -- "AI" keeps trades apart from Sanpu Travel on the same merchant
    INSERT dbo.ReservationPayments(MerchantTradeNo, ReservationId, TravelerUserId, Mode, Amount, Currency, Provider, Status)
    VALUES (@Trade, @ReservationId, @TravelerUserId, @Mode, @Amount, @Currency, @Provider, 'Pending');
    IF @Status = 'AwaitingConfirmation'
        UPDATE dbo.Reservations SET ExpiresAtUtc = DATEADD(MINUTE, 30, SYSUTCDATETIME()), UpdatedAtUtc = SYSUTCDATETIME() WHERE ReservationId = @ReservationId;
    EXEC dbo.usp_Audit_Write @TravelerUserId, 'Reservation.PaymentStarted', 'Reservation', @ReservationId, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT *, CAST(0 AS bit) AS JustCompleted FROM dbo.vw_ReservationPayments WHERE MerchantTradeNo = @Trade;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ReservationPayment_Get @MerchantTradeNo varchar(20) AS
BEGIN
    SET NOCOUNT ON;
    SELECT *, CAST(0 AS bit) AS JustCompleted FROM dbo.vw_ReservationPayments WHERE MerchantTradeNo = @MerchantTradeNo;
END;
GO
/* Records the gateway's verified outcome once. Money that arrives after a booking closed is kept on record and flagged for a refund. */
CREATE OR ALTER PROCEDURE dbo.usp_ReservationPayment_Complete
    @MerchantTradeNo varchar(20), @Paid bit, @ProviderTradeNo varchar(40) = NULL, @PaymentMethod varchar(40) = NULL, @Message nvarchar(200) = NULL, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    DECLARE @Current varchar(10), @ReservationId int, @Traveler uniqueidentifier, @Amount decimal(12,2), @Just bit = 0;
    SELECT @Current = Status, @ReservationId = ReservationId, @Traveler = TravelerUserId, @Amount = Amount
    FROM dbo.ReservationPayments WITH (UPDLOCK, HOLDLOCK) WHERE MerchantTradeNo = @MerchantTradeNo;
    IF @Current IS NULL THROW 50001, 'not_found', 1;
    IF @Current = 'Pending'
    BEGIN
        SET @Just = 1;
        IF @Paid = 1
        BEGIN
            DECLARE @Status varchar(25), @Total decimal(12,2), @Before decimal(12,2);
            SELECT @Status = Status, @Total = Total, @Before = PaidAmount FROM dbo.Reservations WITH (UPDLOCK, HOLDLOCK) WHERE ReservationId = @ReservationId;
            IF @Status IN ('AwaitingConfirmation','PartiallyPaid','Expired') AND @Before < @Total
                UPDATE dbo.Reservations SET PaidAmount = CASE WHEN @Before + @Amount >= @Total THEN @Total ELSE @Before + @Amount END,
                    PaymentRef = ISNULL(@ProviderTradeNo, @MerchantTradeNo), Status = CASE WHEN @Before + @Amount >= @Total THEN 'Confirmed' ELSE 'PartiallyPaid' END, UpdatedAtUtc = SYSUTCDATETIME()
                WHERE ReservationId = @ReservationId;
            ELSE SET @Message = N'Paid after the booking closed: refund needed';
        END;
        UPDATE dbo.ReservationPayments SET Status = CASE WHEN @Paid = 1 THEN 'Paid' ELSE 'Failed' END, ProviderTradeNo = @ProviderTradeNo, PaymentMethod = @PaymentMethod,
            ProviderMessage = @Message, CompletedAtUtc = SYSUTCDATETIME()
        WHERE MerchantTradeNo = @MerchantTradeNo;
        DECLARE @Action varchar(40) = CASE WHEN @Paid = 1 THEN 'Reservation.Paid' ELSE 'Reservation.PaymentFailed' END;
        EXEC dbo.usp_Audit_Write @Traveler, @Action, 'Reservation', @ReservationId, NULL, @CorrelationId, NULL;
    END;
    COMMIT;
    SELECT *, @Just AS JustCompleted FROM dbo.vw_ReservationPayments WHERE MerchantTradeNo = @MerchantTradeNo;
END;
GO
/* Staff view of every payment attempt. */
CREATE OR ALTER PROCEDURE dbo.usp_ReservationPayment_ListAll @Status varchar(10) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (300) *, CAST(0 AS bit) AS JustCompleted FROM dbo.vw_ReservationPayments
    WHERE @Status IS NULL OR Status = @Status ORDER BY CreatedAtUtc DESC;
END;
GO
