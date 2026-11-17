/* 112_payment_procs.sql — customer payments through a gateway: create intent (amount computed here), complete intent (idempotent),
   and the payment ledger for both order types. Replaces the earlier direct-pay procedures. */
DROP PROCEDURE IF EXISTS dbo.usp_ServiceBooking_Pay;
DROP PROCEDURE IF EXISTS dbo.usp_Tour_CustomerPay;
GO
/* @Mode: Deposit (first payment only, while the start is more than @BalanceDueDays away), Balance (the rest) or Full. */
CREATE OR ALTER PROCEDURE dbo.usp_Payment_CreateIntent
    @OrderType varchar(10), @OrderId int, @UserId uniqueidentifier, @Mode varchar(10), @DepositPercent int, @BalanceDueDays int, @Provider varchar(20),
    @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @Mode NOT IN ('Deposit','Balance','Full') OR @OrderType NOT IN ('Tour','Service') THROW 50041, 'validation_failed', 1;
    BEGIN TRAN;
    DECLARE @St varchar(20), @Ref varchar(20), @Total decimal(12,2), @Paid decimal(12,2), @Start date, @Name nvarchar(150);
    IF @OrderType = 'Tour'
        SELECT @St = b.Status, @Ref = b.BookingRef, @Total = b.TotalAmount, @Paid = b.AmountPaid, @Start = dp.DepartureDate, @Name = t.Title
        FROM dbo.Bookings b WITH (UPDLOCK) JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId JOIN dbo.Tours t ON t.TourId = dp.TourId
        WHERE b.BookingId = @OrderId AND b.CustomerUserId = @UserId;
    ELSE
        SELECT @St = b.Status, @Ref = b.BookingRef, @Total = b.TotalAmount, @Paid = b.AmountPaid, @Start = b.StartDate, @Name = s.Name
        FROM dbo.ServiceBookings b WITH (UPDLOCK) JOIN dbo.TravelServices s ON s.ServiceId = b.ServiceId
        WHERE b.ServiceBookingId = @OrderId AND b.CustomerUserId = @UserId;
    IF @St IS NULL THROW 50001, 'not_found', 1;
    IF @St <> 'Confirmed' OR @Paid >= @Total THROW 50031, 'invalid_state', 1;
    IF @Mode = 'Deposit' AND (@Paid > 0 OR @DepositPercent NOT BETWEEN 1 AND 99 OR DATEDIFF(DAY, CAST(SYSUTCDATETIME() AS date), @Start) <= @BalanceDueDays)
        THROW 50067, 'deposit_not_available', 1;
    DECLARE @Amount decimal(12,2) = CASE @Mode WHEN 'Deposit' THEN ROUND(@Total * @DepositPercent / 100.0, 0) ELSE @Total - @Paid END;
    -- an older unfinished checkout for the same order is replaced by this one
    UPDATE dbo.PaymentIntents SET Status = 'Expired' WHERE OrderType = @OrderType AND OrderId = @OrderId AND Status = 'Pending';
    DECLARE @TradeNo varchar(20) = 'SP' + FORMAT(SYSUTCDATETIME(), 'yyMMddHHmmss') + RIGHT('000000' + CAST(ABS(CHECKSUM(NEWID())) % 1000000 AS varchar(6)), 6);
    INSERT dbo.PaymentIntents(MerchantTradeNo, OrderType, OrderId, OrderRef, CustomerUserId, Mode, Amount, Provider)
    VALUES (@TradeNo, @OrderType, @OrderId, @Ref, @UserId, @Mode, @Amount, @Provider);
    DECLARE @d nvarchar(200) = (SELECT @TradeNo AS tradeNo, @Mode AS mode, @Amount AS amount, @Provider AS provider FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.usp_Audit_Write @UserId, 'Payment.CheckoutStarted', @OrderType, @Ref, @d, @CorrelationId, NULL;
    COMMIT;
    SELECT i.IntentId, i.MerchantTradeNo, i.OrderType, i.OrderId, i.OrderRef, i.Mode, i.Amount, i.Currency, i.Provider, i.Status, i.CreatedAtUtc, @Name AS ItemName
    FROM dbo.PaymentIntents i WHERE i.MerchantTradeNo = @TradeNo;
END;
GO
/* Called after the gateway result is verified. Idempotent: a Paid intent is returned as-is. The paid amount must match the intent. */
CREATE OR ALTER PROCEDURE dbo.usp_Payment_CompleteIntent
    @MerchantTradeNo varchar(20), @Succeeded bit, @PaidAmount decimal(12,2), @ProviderTradeNo varchar(40) = NULL, @ProviderMessage nvarchar(200) = NULL,
    @PaymentMethod varchar(40) = NULL, @BalanceDueDays int, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    DECLARE @Id int, @St varchar(10), @Type varchar(10), @OrderId int, @Ref varchar(20), @User uniqueidentifier, @Mode varchar(10), @Amount decimal(12,2);
    SELECT @Id = IntentId, @St = Status, @Type = OrderType, @OrderId = OrderId, @Ref = OrderRef, @User = CustomerUserId, @Mode = Mode, @Amount = Amount
    FROM dbo.PaymentIntents WITH (UPDLOCK) WHERE MerchantTradeNo = @MerchantTradeNo;
    IF @Id IS NULL THROW 50001, 'not_found', 1;
    IF @St = 'Pending'
    BEGIN
        IF @Succeeded = 0
            UPDATE dbo.PaymentIntents SET Status = 'Failed', ProviderTradeNo = @ProviderTradeNo, ProviderMessage = @ProviderMessage, CompletedAtUtc = SYSUTCDATETIME() WHERE IntentId = @Id;
        ELSE
        BEGIN
            IF @PaidAmount <> @Amount THROW 50035, 'amount_mismatch', 1;
            IF @Type = 'Tour'
            BEGIN
                EXEC dbo.usp_Finance_RecordPayment @OrderId, @Amount, 'Card', @MerchantTradeNo, @User, @CorrelationId;
                UPDATE b SET BalanceDueDate = CASE WHEN b.AmountPaid >= b.TotalAmount THEN NULL ELSE DATEADD(DAY, -@BalanceDueDays, dp.DepartureDate) END
                FROM dbo.Bookings b JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId WHERE b.BookingId = @OrderId;
            END
            ELSE
            BEGIN
                DECLARE @Total decimal(12,2), @Paid decimal(12,2), @Start date, @BSt varchar(20);
                SELECT @Total = TotalAmount, @Paid = AmountPaid, @Start = StartDate, @BSt = Status FROM dbo.ServiceBookings WITH (UPDLOCK) WHERE ServiceBookingId = @OrderId;
                IF @BSt <> 'Confirmed' OR @Paid + @Amount > @Total THROW 50035, 'amount_exceeds_balance', 1;
                INSERT dbo.ServicePayments(ServiceBookingId, Amount, Mode, Provider, ProviderRef, IdempotencyKey, CreatedBy)
                VALUES (@OrderId, @Amount, @Mode, (SELECT Provider FROM dbo.PaymentIntents WHERE IntentId = @Id), ISNULL(@ProviderTradeNo, @MerchantTradeNo), @MerchantTradeNo, @User);
                UPDATE dbo.ServiceBookings SET AmountPaid = AmountPaid + @Amount,
                       PaymentStatus = CASE WHEN AmountPaid + @Amount >= TotalAmount THEN 'Paid' ELSE 'PartiallyPaid' END,
                       BalanceDueDate = CASE WHEN AmountPaid + @Amount >= TotalAmount THEN NULL ELSE DATEADD(DAY, -@BalanceDueDays, @Start) END
                WHERE ServiceBookingId = @OrderId;
                DECLARE @d nvarchar(200) = (SELECT @Amount AS amount, @Mode AS mode, @ProviderTradeNo AS providerTradeNo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
                EXEC dbo.usp_Audit_Write @User, 'ServiceBooking.Paid', 'ServiceBooking', @Ref, @d, @CorrelationId, NULL;
            END
            UPDATE dbo.PaymentIntents SET Status = 'Paid', ProviderTradeNo = @ProviderTradeNo, ProviderMessage = @ProviderMessage, PaymentMethod = @PaymentMethod,
                   CompletedAtUtc = SYSUTCDATETIME() WHERE IntentId = @Id;
        END
    END
    COMMIT;
    SELECT IntentId, MerchantTradeNo, OrderType, OrderId, OrderRef, Mode, Amount, Currency, Provider, Status, ProviderTradeNo, ProviderMessage, PaymentMethod, CompletedAtUtc
    FROM dbo.PaymentIntents WHERE IntentId = @Id;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Payment_GetIntent @MerchantTradeNo varchar(20) AS
BEGIN
    SET NOCOUNT ON;
    SELECT IntentId, MerchantTradeNo, OrderType, OrderId, OrderRef, CustomerUserId, Mode, Amount, Currency, Provider, Status, ProviderTradeNo, ProviderMessage, PaymentMethod, CompletedAtUtc
    FROM dbo.PaymentIntents WHERE MerchantTradeNo = @MerchantTradeNo;
END;
GO
/* Payment summary for one of the customer's orders: totals, what is due, and whether a deposit is still possible. */
CREATE OR ALTER PROCEDURE dbo.usp_Payment_Summary @OrderType varchar(10), @OrderId int, @UserId uniqueidentifier, @DepositPercent int, @BalanceDueDays int AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @St varchar(20), @Ref varchar(20), @Total decimal(12,2), @Paid decimal(12,2), @Start date, @Due date, @Pay varchar(20);
    IF @OrderType = 'Tour'
        SELECT @St = b.Status, @Ref = b.BookingRef, @Total = b.TotalAmount, @Paid = b.AmountPaid, @Start = dp.DepartureDate, @Due = b.BalanceDueDate, @Pay = b.PaymentStatus
        FROM dbo.Bookings b JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId WHERE b.BookingId = @OrderId AND b.CustomerUserId = @UserId;
    ELSE
        SELECT @St = Status, @Ref = BookingRef, @Total = TotalAmount, @Paid = AmountPaid, @Start = StartDate, @Due = BalanceDueDate, @Pay = PaymentStatus
        FROM dbo.ServiceBookings WHERE ServiceBookingId = @OrderId AND CustomerUserId = @UserId;
    IF @St IS NULL THROW 50001, 'not_found', 1;
    DECLARE @CanPay bit = CASE WHEN @St = 'Confirmed' AND @Paid < @Total THEN 1 ELSE 0 END;
    SELECT @Ref AS OrderRef, @St AS Status, @Pay AS PaymentStatus, @Total AS TotalAmount, @Paid AS AmountPaid, @Total - @Paid AS Balance, @Start AS StartDate,
           COALESCE(@Due, CASE WHEN @Paid > 0 AND @Paid < @Total THEN DATEADD(DAY, -@BalanceDueDays, @Start) END) AS BalanceDueDate,
           @CanPay AS CanPay,
           CAST(CASE WHEN @CanPay = 1 AND @Paid = 0 AND @DepositPercent BETWEEN 1 AND 99 AND DATEDIFF(DAY, CAST(SYSUTCDATETIME() AS date), @Start) > @BalanceDueDays THEN 1 ELSE 0 END AS bit) AS CanPayDeposit,
           CAST(ROUND(@Total * @DepositPercent / 100.0, 0) AS decimal(12,2)) AS DepositAmount, @DepositPercent AS DepositPercent;
    SELECT MerchantTradeNo, Mode, Amount, Provider, Status, PaymentMethod, CreatedAtUtc, CompletedAtUtc FROM dbo.PaymentIntents
    WHERE OrderType = @OrderType AND OrderId = @OrderId AND CustomerUserId = @UserId AND Status IN ('Paid','Failed') ORDER BY CreatedAtUtc DESC;
END;
GO
