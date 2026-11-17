/* 003_BookingsAndOperations.sql — workflows, demo bookings (created through the real procs so seat counts stay correct),
   payments, costs, supplier statements, integration events, tasks, retention. Idempotent via fixed idempotency keys. */
SET NOCOUNT ON; SET XACT_ABORT ON;
DECLARE @Today date = CAST(SYSUTCDATETIME() AS date);

/* ---- workflow definitions (routing lives here, not in code) ---- */
IF NOT EXISTS (SELECT 1 FROM dbo.WorkflowDefinitions WHERE EntityType = 'Booking')
BEGIN
    DECLARE @om int = (SELECT RoleId FROM dbo.Roles WHERE RoleKey = 'ops_manager'), @fin int = (SELECT RoleId FROM dbo.Roles WHERE RoleKey = 'finance'),
            @dir int = (SELECT RoleId FROM dbo.Roles WHERE RoleKey = 'director');
    DECLARE @j nvarchar(max);
    SET @j = N'[{"order":1,"name":"Operations review","approverRoleId":' + CAST(@om AS nvarchar) + N',"conditionType":"Always","slaHours":4,"escalateRoleId":' + CAST(@dir AS nvarchar) + N'}]';
    EXEC dbo.usp_Workflow_SaveVersion 'booking.approval', 'Booking', N'Booking approval', @j, NULL;
    SET @j = N'[{"order":1,"name":"Operations check","approverRoleId":' + CAST(@om AS nvarchar) + N',"conditionType":"Always","slaHours":8},'
           + N'{"order":2,"name":"Finance sign-off","approverRoleId":' + CAST(@fin AS nvarchar) + N',"conditionType":"AmountGreaterThan","conditionValue":20000,"slaHours":8,"escalateRoleId":' + CAST(@dir AS nvarchar) + N'}]';
    EXEC dbo.usp_Workflow_SaveVersion 'refund.approval', 'Refund', N'Refund approval', @j, NULL;
    SET @j = N'[{"order":1,"name":"Operations manager","approverRoleId":' + CAST(@om AS nvarchar) + N',"conditionType":"Always","slaHours":24},'
           + N'{"order":2,"name":"Director (large plans)","approverRoleId":' + CAST(@dir AS nvarchar) + N',"conditionType":"AmountGreaterThan","conditionValue":300000,"slaHours":24}]';
    EXEC dbo.usp_Workflow_SaveVersion 'groupplan.approval', 'GroupPlan', N'Group plan approval', @j, NULL;
END;

/* ---- demo bookings via the real procedures ---- */
DECLARE @chen uniqueidentifier = (SELECT UserId FROM dbo.Users WHERE NormalizedEmail = 'traveler.chen@demo.sanpu.test');
DECLARE @lee  uniqueidentifier = (SELECT UserId FROM dbo.Users WHERE NormalizedEmail = 'traveler.lee@demo.sanpu.test');
DECLARE @ops  uniqueidentifier = (SELECT UserId FROM dbo.Users WHERE NormalizedEmail = 'ops.manager@demo.sanpu.test');
DECLARE @fn   uniqueidentifier = (SELECT UserId FROM dbo.Users WHERE NormalizedEmail = 'finance@demo.sanpu.test');

DECLARE @B TABLE (N int, Cust varchar(10), Tour varchar(30), DayOffset int, Pax int, Lead nvarchar(100), Approve bit, Pay bit);
INSERT @B VALUES
 (1,'chen','TW-ERV-3D',18, 2, N'Chen Ya-Ting', 1, 1),
 (2,'lee', 'TW-ERV-3D',18, 4, N'Lee Min', 1, 1),
 (3,'lee', 'TW-ERV-3D',18,30, N'Company Outing Group', 1, 0),
 (4,'chen','TW-ALI-2D',12, 1, N'Chen Ya-Ting', 0, 0),
 (5,'lee', 'TW-SML-2D', 9, 2, N'Lee Min', 0, 0),
 (6,'lee', 'TW-KIN-3D',25, 3, N'Lee Min', 1, 1),
 (7,'chen','TW-TNN-2D',29, 2, N'Chen Ya-Ting', 1, 0);

DECLARE @n int = 1, @cust uniqueidentifier, @dep int, @pax int, @lead nvarchar(100), @appr bit, @pay bit, @key varchar(64), @hold uniqueidentifier, @bid int;
DECLARE @H TABLE (HoldId uniqueidentifier, DepartureId int, Pax int, ExpiresAtUtc datetime2(3), Status varchar(20), UnitPrice decimal(12,2), TotalAmount decimal(12,2));
DECLARE @BK TABLE (BookingId int, BookingRef varchar(20), Status varchar(20));
WHILE @n <= 7
BEGIN
    SELECT @cust = CASE b.Cust WHEN 'chen' THEN @chen ELSE @lee END, @pax = b.Pax, @lead = b.Lead, @appr = b.Approve, @pay = b.Pay,
           @dep = (SELECT dp.DepartureId FROM dbo.Departures dp JOIN dbo.Tours t ON t.TourId = dp.TourId WHERE t.Code = b.Tour AND dp.DepartureDate = DATEADD(DAY, b.DayOffset, @Today))
    FROM @B b WHERE b.N = @n;
    SET @key = 'seed-booking-' + CAST(@n AS varchar(5));
    IF @dep IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.InventoryHolds WHERE UserId = @cust AND IdempotencyKey = @key)
    BEGIN
        DELETE @H; DELETE @BK;
        INSERT @H EXEC dbo.usp_Booking_CreateHold @dep, @cust, @pax, @key, 15, 'seed';
        SET @hold = (SELECT HoldId FROM @H);
        DECLARE @phoneMask nvarchar(30) = N'+886 9•• ••• ' + RIGHT('00' + CAST(300 + @n AS varchar(5)), 3), @passMask nvarchar(30) = N'A1••••••' + CAST(@n AS varchar(2));
        INSERT @BK EXEC dbo.usp_Booking_CreateFromHold @hold, @cust, @lead, NULL, @phoneMask, NULL, @passMask, NULL, 'seed';
        SET @bid = (SELECT BookingId FROM @BK);
        UPDATE dbo.Bookings SET IsDemo = 1 WHERE BookingId = @bid;
        IF @appr = 1 EXEC dbo.usp_Booking_Decide @bid, 'Approved', N'Seed: approved for demo', @ops, 'seed';
        IF @pay = 1
        BEGIN
            DECLARE @amt decimal(12,2) = (SELECT TotalAmount FROM dbo.Bookings WHERE BookingId = @bid), @pk varchar(64) = 'seed-pay-' + CAST(@n AS varchar(5));
            DECLARE @PayOut TABLE (PaymentId int, BookingId int, Amount decimal(12,2), Currency char(3), Provider varchar(20), ProviderRef varchar(64), Method varchar(20), CreatedAtUtc datetime2(3));
            INSERT @PayOut EXEC dbo.usp_Finance_RecordPayment @bid, @amt, 'BankTransfer', @pk, @fn, 'seed';
        END
    END
    SET @n += 1;
END;

/* ---- supplier costs per departure (fictional rates) ---- */
INSERT dbo.DepartureCosts(DepartureId, SupplierId, CostType, Amount, IsDemo)
SELECT dp.DepartureId, s.SupplierId, 'Coach', 18000 * t.Days, 1
FROM dbo.Departures dp JOIN dbo.Tours t ON t.TourId = dp.TourId CROSS JOIN dbo.Suppliers s
WHERE s.Code = 'SUP-BUS-01' AND dp.IsDemo = 1 AND t.Code IN ('TW-ERV-3D','TW-ALI-2D','TW-TNN-2D','TW-TPE-1D')
  AND NOT EXISTS (SELECT 1 FROM dbo.DepartureCosts c WHERE c.DepartureId = dp.DepartureId AND c.SupplierId = s.SupplierId AND c.CostType = 'Coach');
INSERT dbo.DepartureCosts(DepartureId, SupplierId, CostType, Amount, IsDemo)
SELECT dp.DepartureId, s.SupplierId, 'Hotel', 1900 * 20 * (t.Days - 1), 1
FROM dbo.Departures dp JOIN dbo.Tours t ON t.TourId = dp.TourId
JOIN dbo.Suppliers s ON s.Code = CASE WHEN t.Code = 'TW-SML-2D' THEN 'SUP-HTL-01' ELSE 'SUP-HTL-02' END
WHERE dp.IsDemo = 1 AND t.Days > 1
  AND NOT EXISTS (SELECT 1 FROM dbo.DepartureCosts c WHERE c.DepartureId = dp.DepartureId AND c.SupplierId = s.SupplierId AND c.CostType = 'Hotel');

/* ---- supplier statements for the month of the first departures: one match, one mismatch (+2,500) ---- */
DECLARE @Period char(7) = CONVERT(char(7), DATEADD(DAY, 18, @Today), 126);
DECLARE @From date = CAST(@Period + '-01' AS date);
INSERT dbo.SupplierStatements(SupplierId, Period, Amount, Source)
SELECT s.SupplierId, @Period,
       ISNULL((SELECT SUM(c.Amount) FROM dbo.DepartureCosts c JOIN dbo.Departures dp ON dp.DepartureId = c.DepartureId
               WHERE c.SupplierId = s.SupplierId AND dp.DepartureDate >= @From AND dp.DepartureDate < DATEADD(MONTH, 1, @From)), 0)
       + CASE WHEN s.Code = 'SUP-BUS-01' THEN 2500 ELSE 0 END, 'Seed'
FROM dbo.Suppliers s WHERE s.Code IN ('SUP-BUS-01','SUP-HTL-02')
  AND NOT EXISTS (SELECT 1 FROM dbo.SupplierStatements x WHERE x.SupplierId = s.SupplierId AND x.Period = @Period);

/* ---- integration events (demo history: processed, duplicate, failed awaiting retry) ---- */
INSERT dbo.IntegrationEvents(SupplierId, EventType, IdempotencyKey, CorrelationId, PayloadJson, Status, Attempts, DuplicateCount, NextAttemptAtUtc, LastError, ProcessedAtUtc, IsDemo)
SELECT s.SupplierId, v.EventType, v.IdemKey, v.Corr, v.Payload, v.Status, v.Attempts, v.Dups,
       CASE WHEN v.Status = 'Failed' THEN DATEADD(MINUTE, 2, SYSUTCDATETIME()) END, v.Err, CASE WHEN v.Status = 'Processed' THEN SYSUTCDATETIME() END, 1
FROM (VALUES
 ('SUP-HTL-01','statement.issued','seed-evt-1001','corr-seed-1', N'{"period":"' + @Period + N'","amount":0,"note":"DEMO"}','Processed',1,0,NULL),
 ('SUP-HTL-02','allotment.updated','seed-evt-1002','corr-seed-2', N'{"tourCode":"TW-ERV-3D","departureDate":"2000-01-01","capacity":40}','Failed',1,1,N'not_found: departure does not exist'),
 ('SUP-BUS-01','vehicle.cancelled','seed-evt-1003','corr-seed-3', N'{"tourCode":"TW-ALI-2D","departureDate":"' + CONVERT(char(10), DATEADD(DAY, 12, @Today), 126) + N'","note":"DEMO coach breakdown"}','Processed',1,2,NULL)
) v(Sup, EventType, IdemKey, Corr, Payload, Status, Attempts, Dups, Err)
JOIN dbo.Suppliers s ON s.Code = v.Sup
WHERE NOT EXISTS (SELECT 1 FROM dbo.IntegrationEvents e WHERE e.SupplierId = s.SupplierId AND e.IdempotencyKey = v.IdemKey);

/* ---- staff tasks ---- */
DECLARE @agent uniqueidentifier = (SELECT UserId FROM dbo.Users WHERE NormalizedEmail = 'agent@demo.sanpu.test');
INSERT dbo.StaffTasks(Title, TaskType, EntityType, EntityRef, AssignedUserId, Status, Priority, DueAtUtc, IsDemo)
SELECT v.Title, v.Typ, v.Et, v.Ref, CASE WHEN v.Mine = 1 THEN @agent END, v.St, v.Pr, DATEADD(HOUR, v.DueH, SYSUTCDATETIME()), 1
FROM (VALUES
 (N'Call lead traveler about dietary needs (BK-000001)', 'Customer', 'Booking', 'BK-000001', 1, 'Open', 'Normal', 6),
 (N'Replace coach for Alishan departure', 'Supplier', 'Departure', 'TW-ALI-2D', 0, 'Open', 'High', -2),
 (N'Send rooming list to Rift Valley Inn', 'Supplier', 'Departure', 'TW-ERV-3D', 1, 'InProgress', 'Normal', 30)
) v(Title, Typ, Et, Ref, Mine, St, Pr, DueH)
WHERE NOT EXISTS (SELECT 1 FROM dbo.StaffTasks k WHERE k.Title = v.Title);

/* ---- retention policies ---- */
MERGE dbo.RetentionPolicies AS t USING (VALUES
 ('TravelerPII', N'Bookings.LeadName, LeadPhoneEnc, PassportEnc, SpecialRequests', 730, 'Anonymise'),
 ('IntegrationPayloads', N'IntegrationEvents.PayloadJson', 180, 'Delete'),
 ('AuditLogs', N'AuditLogs (all)', 2555, 'Keep')) AS s(C, F, K, A)
ON t.DataClass = s.C WHEN NOT MATCHED THEN INSERT (DataClass, Fields, KeepDays, Action) VALUES (s.C, s.F, s.K, s.A);

PRINT '003_BookingsAndOperations applied';
