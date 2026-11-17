/* 110_erp_procs.sql — ERP stored procedures. Error numbers (in addition to the shared ones):
   50030 insufficient_capacity · 50031 invalid_state · 50032 self_approval · 50033 capacity_below_sold
   50034 not_approver · 50035 amount_exceeds_balance · 50036 hold_expired · 50037 departure_closed */
SET NOCOUNT ON;
GO
/* ---------------- CATALOG (customer) ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Catalog_Destinations AS
BEGIN
    SET NOCOUNT ON;
    SELECT d.DestinationId, d.Code, d.Name, d.Region, d.IsDemo, d.ImageUrl,
           (SELECT COUNT(*) FROM dbo.Tours t WHERE t.DestinationId = d.DestinationId AND t.IsPublished = 1) AS TourCount
    FROM dbo.Destinations d WHERE d.IsActive = 1 ORDER BY d.Region, d.Name;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Catalog_SearchTours @DestinationCode varchar(20) = NULL, @Month date = NULL, @Pax int = 1 AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Today date = CAST(SYSUTCDATETIME() AS date);
    SELECT t.TourId, t.Code, t.Title, t.Slogan, t.Days, t.BasePrice, t.Currency, t.Summary, t.IsDemo,
           d.Code AS DestinationCode, d.Name AS DestinationName, d.Region, bu.Name AS BusinessUnitName,
           COALESCE(t.ImageUrl, d.ImageUrl) AS ImageUrl, x.FromPrice, x.NextDeparture, x.OpenDepartures
    FROM dbo.Tours t
    JOIN dbo.Destinations d ON d.DestinationId = t.DestinationId
    JOIN dbo.BusinessUnits bu ON bu.BusinessUnitId = t.BusinessUnitId
    CROSS APPLY (SELECT MIN(dp.Price) AS FromPrice, MIN(dp.DepartureDate) AS NextDeparture, COUNT(*) AS OpenDepartures
                 FROM dbo.Departures dp
                 WHERE dp.TourId = t.TourId AND dp.Status = 'Open' AND dp.DepartureDate > @Today
                   AND dp.Capacity - dp.SeatsSold - dp.SeatsHeld >= ISNULL(@Pax, 1)
                   AND (@Month IS NULL OR (dp.DepartureDate >= @Month AND dp.DepartureDate < DATEADD(MONTH, 1, @Month)))) x
    WHERE t.IsPublished = 1 AND x.OpenDepartures > 0 AND (@DestinationCode IS NULL OR d.Code = @DestinationCode)
    ORDER BY x.NextDeparture, t.Title;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Catalog_GetTour @Code varchar(30) AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.TourId, t.Code, t.Title, t.Slogan, t.Days, t.BasePrice, t.Currency, t.Summary, t.IsDemo,
           d.Name AS DestinationName, d.Region, bu.Name AS BusinessUnitName, COALESCE(t.ImageUrl, d.ImageUrl) AS ImageUrl
    FROM dbo.Tours t JOIN dbo.Destinations d ON d.DestinationId = t.DestinationId JOIN dbo.BusinessUnits bu ON bu.BusinessUnitId = t.BusinessUnitId
    WHERE t.Code = @Code AND t.IsPublished = 1;
    SELECT dp.DepartureId, dp.DepartureDate, dp.Capacity, dp.Capacity - dp.SeatsSold - dp.SeatsHeld AS SeatsLeft, dp.Price, dp.Status
    FROM dbo.Departures dp JOIN dbo.Tours t ON t.TourId = dp.TourId
    WHERE t.Code = @Code AND t.IsPublished = 1 AND dp.DepartureDate > CAST(SYSUTCDATETIME() AS date) AND dp.Status <> 'Cancelled'
    ORDER BY dp.DepartureDate;
    -- destination guide: at-a-glance facts, history timeline, nearby places
    SELECT d.Overview, d.BestTime, d.GettingThere, d.LocalTip
    FROM dbo.Tours t JOIN dbo.Destinations d ON d.DestinationId = t.DestinationId WHERE t.Code = @Code AND t.IsPublished = 1;
    SELECT h.Era, h.Title, h.Detail
    FROM dbo.Tours t JOIN dbo.DestinationHistory h ON h.DestinationId = t.DestinationId WHERE t.Code = @Code AND t.IsPublished = 1 ORDER BY h.SortOrder, h.HistoryId;
    SELECT n.Name, n.Category, n.DistanceKm, n.TravelMinutes, n.Detail
    FROM dbo.Tours t JOIN dbo.NearbyPlaces n ON n.DestinationId = t.DestinationId WHERE t.Code = @Code AND t.IsPublished = 1 AND n.IsActive = 1 ORDER BY n.SortOrder, n.NearbyPlaceId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Catalog_GetDeparture @DepartureId int AS
BEGIN
    SET NOCOUNT ON;
    SELECT dp.DepartureId, dp.DepartureDate, dp.Price, dp.Status, dp.Capacity - dp.SeatsSold - dp.SeatsHeld AS SeatsLeft,
           t.Code AS TourCode, t.Title AS TourTitle, t.Days, t.Currency, t.IsDemo
    FROM dbo.Departures dp JOIN dbo.Tours t ON t.TourId = dp.TourId
    WHERE dp.DepartureId = @DepartureId AND t.IsPublished = 1;
END;
GO
/* ---------------- WORKFLOW ENGINE ---------------- */
CREATE OR ALTER FUNCTION dbo.fn_NextWorkflowStep(@WorkflowId int, @AfterStepNo int, @Amount decimal(12,2), @Pax int) RETURNS TABLE AS
RETURN
    SELECT TOP (1) s.StepNo, s.SlaHours, s.ApproverRoleId
    FROM dbo.WorkflowSteps s
    WHERE s.WorkflowId = @WorkflowId AND s.StepNo > @AfterStepNo
      AND (s.ConditionType = 'Always'
           OR (s.ConditionType = 'AmountGreaterThan' AND ISNULL(@Amount, 0) > s.ConditionValue)
           OR (s.ConditionType = 'PaxGreaterThan' AND ISNULL(@Pax, 0) > s.ConditionValue))
    ORDER BY s.StepNo;
GO
/* Applies the final outcome of an approval to its entity. Called inside the caller's transaction. */
CREATE OR ALTER PROCEDURE dbo.usp_Approval_ApplyOutcome
    @EntityType varchar(30), @EntityId int, @Outcome varchar(20), @ActorUserId uniqueidentifier, @Comment nvarchar(500) = NULL, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @EntityType = 'Booking'
    BEGIN
        DECLARE @Pax int, @Dep int, @St varchar(20), @Ref varchar(20);
        SELECT @Pax = Pax, @Dep = DepartureId, @St = Status, @Ref = BookingRef FROM dbo.Bookings WITH (UPDLOCK) WHERE BookingId = @EntityId;
        IF @St <> 'Pending' THROW 50031, 'invalid_state', 1;
        DECLARE @To varchar(20) = CASE WHEN @Outcome = 'Approved' THEN 'Confirmed' ELSE 'Rejected' END;
        UPDATE dbo.Departures SET SeatsHeld = SeatsHeld - @Pax,
               SeatsSold = SeatsSold + CASE WHEN @Outcome = 'Approved' THEN @Pax ELSE 0 END, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE DepartureId = @Dep;
        UPDATE dbo.Bookings SET Status = @To, UpdatedAtUtc = SYSUTCDATETIME() WHERE BookingId = @EntityId;
        IF @To = 'Rejected' EXEC dbo.usp_Coupon_Release 'Tour', @Ref;   -- a rejected booking gives its coupon use back
        INSERT dbo.BookingStatusHistory(BookingId, FromStatus, ToStatus, ActorUserId, Comment) VALUES (@EntityId, 'Pending', @To, @ActorUserId, @Comment);
        DECLARE @a varchar(60) = 'Booking.' + @To;
        EXEC dbo.usp_Audit_Write @ActorUserId, @a, 'Booking', @Ref, N'{"from":"Pending"}', @CorrelationId, NULL;
    END
    ELSE IF @EntityType = 'Refund'
    BEGIN
        DECLARE @B int, @Amt decimal(12,2), @RS varchar(20);
        SELECT @B = BookingId, @Amt = Amount, @RS = Status FROM dbo.Refunds WITH (UPDLOCK) WHERE RefundId = @EntityId;
        IF @RS <> 'PendingApproval' THROW 50031, 'invalid_state', 1;
        IF @Outcome = 'Approved'
        BEGIN
            UPDATE dbo.Refunds SET Status = 'Processed', ProcessedAtUtc = SYSUTCDATETIME() WHERE RefundId = @EntityId;
            UPDATE dbo.Bookings SET AmountRefunded = AmountRefunded + @Amt,
                   PaymentStatus = CASE WHEN AmountRefunded + @Amt >= AmountPaid THEN 'Refunded' ELSE 'PartiallyRefunded' END, UpdatedAtUtc = SYSUTCDATETIME()
            WHERE BookingId = @B;
        END
        ELSE UPDATE dbo.Refunds SET Status = 'Rejected' WHERE RefundId = @EntityId;
        DECLARE @ra varchar(60) = 'Refund.' + CASE WHEN @Outcome = 'Approved' THEN 'Processed' ELSE 'Rejected' END, @rid nvarchar(20) = CAST(@EntityId AS nvarchar(20));
        EXEC dbo.usp_Audit_Write @ActorUserId, @ra, 'Refund', @rid, NULL, @CorrelationId, NULL;
    END
    ELSE IF @EntityType = 'GroupPlan'
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM dbo.GroupPlans WHERE GroupPlanId = @EntityId AND Status = 'Submitted') THROW 50031, 'invalid_state', 1;
        UPDATE dbo.GroupPlans SET Status = @Outcome WHERE GroupPlanId = @EntityId;
        DECLARE @ga varchar(60) = 'GroupPlan.' + @Outcome, @gid nvarchar(20) = CAST(@EntityId AS nvarchar(20));
        EXEC dbo.usp_Audit_Write @ActorUserId, @ga, 'GroupPlan', @gid, NULL, @CorrelationId, NULL;
    END
END;
GO
/* Starts the active workflow for an entity type. If no step matches, the item is auto-approved. Call inside a transaction. */
CREATE OR ALTER PROCEDURE dbo.usp_Approval_Start
    @EntityType varchar(30), @EntityId int, @EntityRef varchar(30), @Amount decimal(12,2), @Pax int, @RequestedBy uniqueidentifier,
    @CorrelationId varchar(64) = NULL, @ApprovalRequestId int OUTPUT, @AutoApproved bit OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @AutoApproved = 0; SET @ApprovalRequestId = NULL;
    DECLARE @Wf int = (SELECT TOP (1) WorkflowId FROM dbo.WorkflowDefinitions WHERE EntityType = @EntityType AND IsActive = 1 ORDER BY Version DESC);
    DECLARE @Step int, @Sla int;
    IF @Wf IS NOT NULL SELECT @Step = StepNo, @Sla = SlaHours FROM dbo.fn_NextWorkflowStep(@Wf, 0, @Amount, @Pax);
    IF @Step IS NULL
    BEGIN
        SET @AutoApproved = 1;
        EXEC dbo.usp_Approval_ApplyOutcome @EntityType, @EntityId, 'Approved', NULL, N'auto: no workflow step applies', @CorrelationId;
        RETURN;
    END
    INSERT dbo.ApprovalRequests(WorkflowId, EntityType, EntityId, EntityRef, Amount, Pax, CurrentStepNo, Status, RequestedBy, StepDueAtUtc)
    VALUES (@Wf, @EntityType, @EntityId, @EntityRef, @Amount, @Pax, @Step, 'Pending', @RequestedBy, DATEADD(HOUR, @Sla, SYSUTCDATETIME()));
    SET @ApprovalRequestId = SCOPE_IDENTITY();
END;
GO
/* @Decision: Approved | Rejected | Delegated */
CREATE OR ALTER PROCEDURE dbo.usp_Approval_Act
    @ApprovalRequestId int, @Decision varchar(20), @Comment nvarchar(500) = NULL, @DelegateToUserId uniqueidentifier = NULL,
    @RowVersion binary(8) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Wf int, @Step int, @Status varchar(20), @Et varchar(30), @Eid int, @Amt decimal(12,2), @Pax int, @Req uniqueidentifier,
            @Assigned uniqueidentifier, @Rv binary(8), @Role int;
    BEGIN TRAN;
    SELECT @Wf = WorkflowId, @Step = CurrentStepNo, @Status = Status, @Et = EntityType, @Eid = EntityId, @Amt = Amount, @Pax = Pax,
           @Req = RequestedBy, @Assigned = AssignedUserId, @Rv = RowVersion
    FROM dbo.ApprovalRequests WITH (UPDLOCK, HOLDLOCK) WHERE ApprovalRequestId = @ApprovalRequestId;
    IF @Wf IS NULL THROW 50001, 'not_found', 1;
    IF @RowVersion IS NOT NULL AND @RowVersion <> @Rv THROW 50009, 'concurrency_conflict', 1;
    IF @Status <> 'Pending' THROW 50031, 'invalid_state', 1;
    IF @Req = @ActorUserId THROW 50032, 'self_approval', 1;
    SELECT @Role = ApproverRoleId FROM dbo.WorkflowSteps WHERE WorkflowId = @Wf AND StepNo = @Step;
    IF NOT ((@Assigned IS NOT NULL AND @Assigned = @ActorUserId)
            OR (@Assigned IS NULL AND EXISTS (SELECT 1 FROM dbo.UserRoles WHERE UserId = @ActorUserId AND RoleId = @Role)))
        THROW 50034, 'not_approver', 1;
    IF @Decision = 'Rejected' AND NULLIF(LTRIM(@Comment), '') IS NULL THROW 50041, 'comment_required', 1;

    IF @Decision = 'Delegated'
    BEGIN
        IF @DelegateToUserId IS NULL OR @DelegateToUserId = @Req
           OR NOT EXISTS (SELECT 1 FROM dbo.UserRoles ur JOIN dbo.Users u ON u.UserId = ur.UserId WHERE ur.UserId = @DelegateToUserId AND ur.RoleId = @Role AND u.IsActive = 1)
            THROW 50041, 'invalid_delegate', 1;
        UPDATE dbo.ApprovalRequests SET AssignedUserId = @DelegateToUserId WHERE ApprovalRequestId = @ApprovalRequestId;
        INSERT dbo.ApprovalActions(ApprovalRequestId, StepNo, ActorUserId, Decision, Comment, DelegatedToUserId) VALUES (@ApprovalRequestId, @Step, @ActorUserId, 'Delegated', @Comment, @DelegateToUserId);
    END
    ELSE IF @Decision IN ('Approved','Rejected')
    BEGIN
        INSERT dbo.ApprovalActions(ApprovalRequestId, StepNo, ActorUserId, Decision, Comment) VALUES (@ApprovalRequestId, @Step, @ActorUserId, @Decision, @Comment);
        DECLARE @Next int, @Sla int;
        IF @Decision = 'Approved' SELECT @Next = StepNo, @Sla = SlaHours FROM dbo.fn_NextWorkflowStep(@Wf, @Step, @Amt, @Pax);
        IF @Decision = 'Approved' AND @Next IS NOT NULL
            UPDATE dbo.ApprovalRequests SET CurrentStepNo = @Next, AssignedUserId = NULL, StepDueAtUtc = DATEADD(HOUR, @Sla, SYSUTCDATETIME())
            WHERE ApprovalRequestId = @ApprovalRequestId;
        ELSE
        BEGIN
            UPDATE dbo.ApprovalRequests SET Status = @Decision, CompletedAtUtc = SYSUTCDATETIME() WHERE ApprovalRequestId = @ApprovalRequestId;
            EXEC dbo.usp_Approval_ApplyOutcome @Et, @Eid, @Decision, @ActorUserId, @Comment, @CorrelationId;
        END
    END
    ELSE THROW 50041, 'validation_failed', 1;
    DECLARE @a varchar(60) = 'Approval.' + @Decision, @id nvarchar(20) = CAST(@ApprovalRequestId AS nvarchar(20));
    DECLARE @d nvarchar(300) = (SELECT @Et AS entityType, @Eid AS entityId, @Step AS stepNo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.usp_Audit_Write @ActorUserId, @a, 'ApprovalRequest', @id, @d, @CorrelationId, NULL;
    COMMIT;
    SELECT Status, CurrentStepNo FROM dbo.ApprovalRequests WHERE ApprovalRequestId = @ApprovalRequestId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Approval_Inbox @UserId uniqueidentifier AS
BEGIN
    SET NOCOUNT ON;
    SELECT ar.ApprovalRequestId, ar.EntityType, ar.EntityId, ar.EntityRef, ar.Amount, ar.Pax, ar.CurrentStepNo, ar.StepDueAtUtc,
           CASE WHEN ar.StepDueAtUtc < SYSUTCDATETIME() THEN 1 ELSE 0 END AS IsOverdue,
           wd.Name AS WorkflowName, ws.Name AS StepName, r.RoleName AS ApproverRole,
           (SELECT COUNT(*) FROM dbo.WorkflowSteps x WHERE x.WorkflowId = ar.WorkflowId) AS StepCount,
           dbo.fn_MaskEmail(ru.Email) AS RequestedByMasked, ar.RowVersion,
           CASE WHEN ar.RequestedBy = @UserId THEN 1 ELSE 0 END AS IsOwnRequest
    FROM dbo.ApprovalRequests ar
    JOIN dbo.WorkflowDefinitions wd ON wd.WorkflowId = ar.WorkflowId
    JOIN dbo.WorkflowSteps ws ON ws.WorkflowId = ar.WorkflowId AND ws.StepNo = ar.CurrentStepNo
    JOIN dbo.Roles r ON r.RoleId = ws.ApproverRoleId
    JOIN dbo.Users ru ON ru.UserId = ar.RequestedBy
    WHERE ar.Status = 'Pending'
      AND ((ar.AssignedUserId = @UserId) OR (ar.AssignedUserId IS NULL AND EXISTS (SELECT 1 FROM dbo.UserRoles ur WHERE ur.UserId = @UserId AND ur.RoleId = ws.ApproverRoleId)))
    ORDER BY ar.StepDueAtUtc;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Approval_History @EntityType varchar(30), @EntityId int AS
BEGIN
    SET NOCOUNT ON;
    SELECT ar.ApprovalRequestId, ar.Status, ar.CurrentStepNo, ar.StepDueAtUtc, wd.Name AS WorkflowName, wd.Version, ar.RowVersion
    FROM dbo.ApprovalRequests ar JOIN dbo.WorkflowDefinitions wd ON wd.WorkflowId = ar.WorkflowId
    WHERE ar.EntityType = @EntityType AND ar.EntityId = @EntityId ORDER BY ar.ApprovalRequestId DESC;
    SELECT aa.ApprovalRequestId, aa.StepNo, aa.Decision, aa.Comment, aa.ActedAtUtc, dbo.fn_MaskEmail(u.Email) AS ActorMasked
    FROM dbo.ApprovalActions aa JOIN dbo.ApprovalRequests ar ON ar.ApprovalRequestId = aa.ApprovalRequestId JOIN dbo.Users u ON u.UserId = aa.ActorUserId
    WHERE ar.EntityType = @EntityType AND ar.EntityId = @EntityId ORDER BY aa.ActionId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Workflow_List AS
BEGIN
    SET NOCOUNT ON;
    SELECT wd.WorkflowId, wd.WorkflowKey, wd.Version, wd.EntityType, wd.Name, wd.IsActive, wd.CreatedAtUtc
    FROM dbo.WorkflowDefinitions wd ORDER BY wd.WorkflowKey, wd.Version DESC;
    SELECT s.WorkflowId, s.StepNo, s.Name, s.ApproverRoleId, r.RoleName AS ApproverRole, s.ConditionType, s.ConditionValue, s.SlaHours,
           s.EscalateRoleId, er.RoleName AS EscalateRole
    FROM dbo.WorkflowSteps s JOIN dbo.Roles r ON r.RoleId = s.ApproverRoleId LEFT JOIN dbo.Roles er ON er.RoleId = s.EscalateRoleId
    ORDER BY s.WorkflowId, s.StepNo;
END;
GO
/* @StepsJson: [{"name":"..","approverRoleId":1,"conditionType":"Always","conditionValue":null,"slaHours":4,"escalateRoleId":null}] */
CREATE OR ALTER PROCEDURE dbo.usp_Workflow_SaveVersion
    @WorkflowKey varchar(60), @EntityType varchar(30), @Name nvarchar(100), @StepsJson nvarchar(max), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @S TABLE (StepNo int IDENTITY(1,1), Name nvarchar(100), ApproverRoleId int, ConditionType varchar(30), ConditionValue decimal(12,2), SlaHours int, EscalateRoleId int);
    INSERT @S(Name, ApproverRoleId, ConditionType, ConditionValue, SlaHours, EscalateRoleId)
    SELECT name, approverRoleId, conditionType, conditionValue, slaHours, escalateRoleId
    FROM OPENJSON(@StepsJson) WITH (name nvarchar(100), approverRoleId int, conditionType varchar(30), conditionValue decimal(12,2), slaHours int, escalateRoleId int, ord int '$.order')
    ORDER BY ord;
    IF NOT EXISTS (SELECT 1 FROM @S) THROW 50041, 'steps_required', 1;
    IF EXISTS (SELECT 1 FROM @S s WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles r WHERE r.RoleId = s.ApproverRoleId AND r.IsActive = 1)
                                     OR (s.EscalateRoleId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Roles r WHERE r.RoleId = s.EscalateRoleId)))
        THROW 50013, 'invalid_reference', 1;
    DECLARE @Ver int = ISNULL((SELECT MAX(Version) FROM dbo.WorkflowDefinitions WHERE WorkflowKey = @WorkflowKey), 0) + 1;
    BEGIN TRAN;
    UPDATE dbo.WorkflowDefinitions SET IsActive = 0 WHERE WorkflowKey = @WorkflowKey OR EntityType = @EntityType;
    INSERT dbo.WorkflowDefinitions(WorkflowKey, Version, EntityType, Name, IsActive, CreatedBy) VALUES (@WorkflowKey, @Ver, @EntityType, @Name, 1, @ActorUserId);
    DECLARE @Wf int = SCOPE_IDENTITY();
    INSERT dbo.WorkflowSteps(WorkflowId, StepNo, Name, ApproverRoleId, ConditionType, ConditionValue, SlaHours, EscalateRoleId)
    SELECT @Wf, StepNo, Name, ApproverRoleId, ConditionType, ConditionValue, SlaHours, EscalateRoleId FROM @S;
    DECLARE @d nvarchar(100) = N'{"version":' + CAST(@Ver AS nvarchar(10)) + N'}';
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Workflow.VersionSaved', 'Workflow', @WorkflowKey, @d, @CorrelationId, NULL;
    COMMIT;
    SELECT @Wf AS WorkflowId, @Ver AS Version;
END;
GO
/* ---------------- BOOKINGS ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Booking_ReleaseExpiredHolds @DepartureId int = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @X TABLE (DepartureId int, Pax int);
    BEGIN TRAN;
    UPDATE dbo.InventoryHolds SET Status = 'Expired' OUTPUT inserted.DepartureId, inserted.Pax INTO @X
    WHERE Status = 'Active' AND ExpiresAtUtc <= SYSUTCDATETIME() AND (@DepartureId IS NULL OR DepartureId = @DepartureId);
    UPDATE d SET SeatsHeld = d.SeatsHeld - x.Pax, UpdatedAtUtc = SYSUTCDATETIME()
    FROM dbo.Departures d JOIN (SELECT DepartureId, SUM(Pax) AS Pax FROM @X GROUP BY DepartureId) x ON x.DepartureId = d.DepartureId;
    COMMIT;
    SELECT COUNT(*) AS Released FROM @X;
END;
GO
/* Final-seat safe: SERIALIZABLE + UPDLOCK/HOLDLOCK on the departure row. Same idempotency key returns the first hold. */
CREATE OR ALTER PROCEDURE dbo.usp_Booking_CreateHold
    @DepartureId int, @UserId uniqueidentifier, @Pax int, @IdempotencyKey varchar(64), @HoldMinutes int, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    IF @Pax < 1 OR @Pax > 50 THROW 50041, 'validation_failed', 1;
    BEGIN TRAN;
    DECLARE @Existing uniqueidentifier = (SELECT HoldId FROM dbo.InventoryHolds WHERE UserId = @UserId AND IdempotencyKey = @IdempotencyKey);
    IF @Existing IS NULL
    BEGIN
        DECLARE @Cap int, @Sold int, @Held int, @Status varchar(20), @Date date;
        SELECT @Cap = Capacity, @Sold = SeatsSold, @Held = SeatsHeld, @Status = Status, @Date = DepartureDate
        FROM dbo.Departures WITH (UPDLOCK, HOLDLOCK) WHERE DepartureId = @DepartureId;
        IF @Cap IS NULL THROW 50001, 'not_found', 1;
        IF @Status <> 'Open' OR @Date <= CAST(SYSUTCDATETIME() AS date) THROW 50037, 'departure_closed', 1;
        -- give back expired holds for this departure before counting
        DECLARE @Expired int = ISNULL((SELECT SUM(Pax) FROM dbo.InventoryHolds WHERE DepartureId = @DepartureId AND Status = 'Active' AND ExpiresAtUtc <= SYSUTCDATETIME()), 0);
        IF @Expired > 0
        BEGIN
            UPDATE dbo.InventoryHolds SET Status = 'Expired' WHERE DepartureId = @DepartureId AND Status = 'Active' AND ExpiresAtUtc <= SYSUTCDATETIME();
            SET @Held = @Held - @Expired;
        END
        IF @Cap - @Sold - @Held < @Pax THROW 50030, 'insufficient_capacity', 1;
        SET @Existing = NEWID();
        INSERT dbo.InventoryHolds(HoldId, DepartureId, UserId, Pax, ExpiresAtUtc, IdempotencyKey)
        VALUES (@Existing, @DepartureId, @UserId, @Pax, DATEADD(MINUTE, @HoldMinutes, SYSUTCDATETIME()), @IdempotencyKey);
        UPDATE dbo.Departures SET SeatsHeld = @Held + @Pax, UpdatedAtUtc = SYSUTCDATETIME() WHERE DepartureId = @DepartureId;
        DECLARE @d nvarchar(200) = (SELECT @DepartureId AS departureId, @Pax AS pax FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), @hid nvarchar(100) = CAST(@Existing AS nvarchar(100));
        EXEC dbo.usp_Audit_Write @UserId, 'Booking.HoldCreated', 'InventoryHold', @hid, @d, @CorrelationId, NULL;
    END
    COMMIT;
    SELECT h.HoldId, h.DepartureId, h.Pax, h.ExpiresAtUtc, h.Status, dp.Price AS UnitPrice, dp.Price * h.Pax AS TotalAmount
    FROM dbo.InventoryHolds h JOIN dbo.Departures dp ON dp.DepartureId = h.DepartureId WHERE h.HoldId = @Existing;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Booking_CreateFromHold
    @HoldId uniqueidentifier, @UserId uniqueidentifier, @LeadName nvarchar(100), @LeadPhoneEnc varbinary(512), @LeadPhoneMasked nvarchar(30),
    @PassportEnc varbinary(512) = NULL, @PassportMasked nvarchar(30) = NULL, @SpecialRequests nvarchar(1000) = NULL, @CorrelationId varchar(64) = NULL,
    @CouponCode varchar(30) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Dep int, @Pax int, @Status varchar(20), @Exp datetime2(3), @Owner uniqueidentifier;
    BEGIN TRAN;
    SELECT @Dep = DepartureId, @Pax = Pax, @Status = Status, @Exp = ExpiresAtUtc, @Owner = UserId FROM dbo.InventoryHolds WITH (UPDLOCK) WHERE HoldId = @HoldId;
    IF @Dep IS NULL OR @Owner <> @UserId THROW 50001, 'not_found', 1;
    -- idempotent: hold already converted returns the same booking
    IF @Status = 'Converted'
    BEGIN
        COMMIT;
        SELECT BookingId, BookingRef, Status FROM dbo.Bookings WHERE HoldId = @HoldId;
        RETURN;
    END
    IF @Status <> 'Active' OR @Exp <= SYSUTCDATETIME() THROW 50036, 'hold_expired', 1;
    DECLARE @Price decimal(12,2) = (SELECT Price FROM dbo.Departures WHERE DepartureId = @Dep);
    DECLARE @Gross decimal(12,2) = @Price * @Pax, @Discount decimal(12,2) = 0, @CouponId int = NULL;
    SET @CouponCode = NULLIF(UPPER(LTRIM(RTRIM(@CouponCode))), '');
    IF @CouponCode IS NOT NULL EXEC dbo.usp_Coupon_Evaluate @CouponCode, @UserId, 'Tour', @Gross, @Discount OUTPUT, @CouponId OUTPUT, 1;
    INSERT dbo.Bookings(CustomerUserId, DepartureId, HoldId, Pax, UnitPrice, TotalAmount, Status, LeadName, LeadPhoneEnc, LeadPhoneMasked,
                        PassportEnc, PassportMasked, SpecialRequests, CreatedBy, CouponCode, DiscountAmount)
    VALUES (@UserId, @Dep, @HoldId, @Pax, @Price, @Gross - @Discount, 'Pending', @LeadName, @LeadPhoneEnc, @LeadPhoneMasked,
            @PassportEnc, @PassportMasked, @SpecialRequests, @UserId, @CouponCode, @Discount);
    DECLARE @BookingId int = SCOPE_IDENTITY();
    DECLARE @Ref varchar(20) = (SELECT BookingRef FROM dbo.Bookings WHERE BookingId = @BookingId);
    IF @CouponId IS NOT NULL
    BEGIN
        INSERT dbo.CouponRedemptions(CouponId, CustomerUserId, OrderType, OrderRef, DiscountAmount) VALUES (@CouponId, @UserId, 'Tour', @Ref, @Discount);
        UPDATE dbo.Coupons SET TimesUsed = TimesUsed + 1 WHERE CouponId = @CouponId;
    END
    UPDATE dbo.InventoryHolds SET Status = 'Converted' WHERE HoldId = @HoldId;   -- seats stay in SeatsHeld until the decision
    INSERT dbo.BookingStatusHistory(BookingId, FromStatus, ToStatus, ActorUserId) VALUES (@BookingId, NULL, 'Pending', @UserId);
    EXEC dbo.usp_Audit_Write @UserId, 'Booking.Created', 'Booking', @Ref, NULL, @CorrelationId, NULL;
    DECLARE @Amt decimal(12,2) = @Gross - @Discount, @Ar int, @Auto bit;
    EXEC dbo.usp_Approval_Start 'Booking', @BookingId, @Ref, @Amt, @Pax, @UserId, @CorrelationId, @Ar OUTPUT, @Auto OUTPUT;
    COMMIT;
    SELECT BookingId, BookingRef, Status FROM dbo.Bookings WHERE BookingId = @BookingId;
END;
GO
/* Staff decision from the booking page: routes through the same approval engine. */
CREATE OR ALTER PROCEDURE dbo.usp_Booking_Decide
    @BookingId int, @Decision varchar(20), @Comment nvarchar(500) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Ar int = (SELECT TOP (1) ApprovalRequestId FROM dbo.ApprovalRequests WHERE EntityType = 'Booking' AND EntityId = @BookingId AND Status = 'Pending');
    IF @Ar IS NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM dbo.Bookings WHERE BookingId = @BookingId) THROW 50001, 'not_found', 1;
        THROW 50031, 'invalid_state', 1;
    END
    EXEC dbo.usp_Approval_Act @Ar, @Decision, @Comment, NULL, NULL, @ActorUserId, @CorrelationId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Booking_Cancel
    @BookingId int, @Reason nvarchar(300), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @St varchar(20), @Pax int, @Dep int, @Ref varchar(20);
    BEGIN TRAN;
    SELECT @St = Status, @Pax = Pax, @Dep = DepartureId, @Ref = BookingRef FROM dbo.Bookings WITH (UPDLOCK) WHERE BookingId = @BookingId;
    IF @St IS NULL THROW 50001, 'not_found', 1;
    IF @St NOT IN ('Pending','Confirmed','CancelRequested') THROW 50031, 'invalid_state', 1;
    IF @St = 'Pending'
    BEGIN
        UPDATE dbo.Departures SET SeatsHeld = SeatsHeld - @Pax, UpdatedAtUtc = SYSUTCDATETIME() WHERE DepartureId = @Dep;
        UPDATE dbo.ApprovalRequests SET Status = 'Cancelled', CompletedAtUtc = SYSUTCDATETIME() WHERE EntityType = 'Booking' AND EntityId = @BookingId AND Status = 'Pending';
    END
    ELSE UPDATE dbo.Departures SET SeatsSold = SeatsSold - @Pax, UpdatedAtUtc = SYSUTCDATETIME() WHERE DepartureId = @Dep;
    UPDATE dbo.Bookings SET Status = 'Cancelled', CancelReason = @Reason, UpdatedAtUtc = SYSUTCDATETIME() WHERE BookingId = @BookingId;
    INSERT dbo.BookingStatusHistory(BookingId, FromStatus, ToStatus, ActorUserId, Comment) VALUES (@BookingId, @St, 'Cancelled', @ActorUserId, @Reason);
    UPDATE dbo.StaffTasks SET Status = 'Done', CompletedAtUtc = SYSUTCDATETIME() WHERE EntityType = 'Booking' AND EntityRef = @Ref AND Status <> 'Done';
    EXEC dbo.usp_Coupon_Release 'Tour', @Ref;
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Booking.Cancelled', 'Booking', @Ref, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
/* Customer side. Ownership is part of the WHERE, so another customer's id looks like "not found" (no IDOR). */
CREATE OR ALTER PROCEDURE dbo.usp_Booking_RequestCancel
    @BookingId int, @CustomerUserId uniqueidentifier, @Reason nvarchar(300), @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @St varchar(20), @Ref varchar(20);
    SELECT @St = Status, @Ref = BookingRef FROM dbo.Bookings WHERE BookingId = @BookingId AND CustomerUserId = @CustomerUserId;
    IF @St IS NULL THROW 50001, 'not_found', 1;
    IF @St = 'Pending'
    BEGIN
        EXEC dbo.usp_Booking_Cancel @BookingId, @Reason, @CustomerUserId, @CorrelationId;
        RETURN;
    END
    IF @St <> 'Confirmed' THROW 50031, 'invalid_state', 1;
    BEGIN TRAN;
    UPDATE dbo.Bookings SET Status = 'CancelRequested', CancelReason = @Reason, UpdatedAtUtc = SYSUTCDATETIME() WHERE BookingId = @BookingId;
    INSERT dbo.BookingStatusHistory(BookingId, FromStatus, ToStatus, ActorUserId, Comment) VALUES (@BookingId, 'Confirmed', 'CancelRequested', @CustomerUserId, @Reason);
    DECLARE @Hours int = ISNULL(TRY_CAST((SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = 'Tasks.CancelRequestSlaHours') AS int), 4);
    DECLARE @Title nvarchar(200) = N'Handle cancellation request ' + @Ref;
    INSERT dbo.StaffTasks(Title, TaskType, EntityType, EntityRef, Priority, DueAtUtc) VALUES (@Title, 'Customer', 'Booking', @Ref, 'High', DATEADD(HOUR, @Hours, SYSUTCDATETIME()));
    EXEC dbo.usp_Audit_Write @CustomerUserId, 'Booking.CancelRequested', 'Booking', @Ref, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Booking_ListForCustomer @CustomerUserId uniqueidentifier AS
BEGIN
    SET NOCOUNT ON;
    SELECT b.BookingId, b.BookingRef, b.Pax, b.TotalAmount, b.Currency, b.Status, b.PaymentStatus, b.CreatedAtUtc,
           dp.DepartureDate, t.Code AS TourCode, t.Title AS TourTitle, t.IsDemo
    FROM dbo.Bookings b JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId JOIN dbo.Tours t ON t.TourId = dp.TourId
    WHERE b.CustomerUserId = @CustomerUserId ORDER BY b.BookingId DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Booking_GetForCustomer @BookingId int, @CustomerUserId uniqueidentifier AS
BEGIN
    SET NOCOUNT ON;
    SELECT b.BookingId, b.BookingRef, b.Pax, b.UnitPrice, b.TotalAmount, b.Currency, b.Status, b.PaymentStatus, b.AmountPaid, b.AmountRefunded,
           b.LeadName, b.LeadPhoneMasked, b.PassportMasked, b.SpecialRequests, b.CancelReason, b.CreatedAtUtc,
           dp.DepartureDate, t.Code AS TourCode, t.Title AS TourTitle, t.IsDemo
    FROM dbo.Bookings b JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId JOIN dbo.Tours t ON t.TourId = dp.TourId
    WHERE b.BookingId = @BookingId AND b.CustomerUserId = @CustomerUserId;
    SELECT h.FromStatus, h.ToStatus, h.Comment, h.OccurredAtUtc FROM dbo.BookingStatusHistory h
    JOIN dbo.Bookings b ON b.BookingId = h.BookingId WHERE h.BookingId = @BookingId AND b.CustomerUserId = @CustomerUserId ORDER BY h.HistoryId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Bookings_List
    @Search nvarchar(100) = NULL, @Status varchar(20) = NULL, @FromDate date = NULL, @Sort varchar(20) = 'newest', @Page int = 1, @PageSize int = 25
AS
BEGIN
    SET NOCOUNT ON;
    SELECT b.BookingId, b.BookingRef, b.LeadName, b.Pax, b.TotalAmount, b.Currency, b.Status, b.PaymentStatus, b.CreatedAtUtc, b.IsDemo,
           dp.DepartureDate, t.Code AS TourCode, t.Title AS TourTitle, COUNT(*) OVER () AS Total
    FROM dbo.Bookings b JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId JOIN dbo.Tours t ON t.TourId = dp.TourId
    WHERE (@Search IS NULL OR b.BookingRef LIKE '%' + @Search + '%' OR b.LeadName LIKE '%' + @Search + '%' OR t.Title LIKE '%' + @Search + '%')
      AND (@Status IS NULL OR b.Status = @Status) AND (@FromDate IS NULL OR dp.DepartureDate >= @FromDate)
    ORDER BY CASE WHEN @Sort = 'departure' THEN dp.DepartureDate END ASC,
             CASE WHEN @Sort = 'amount' THEN b.TotalAmount END DESC,
             b.BookingId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Bookings_Get @BookingId int AS
BEGIN
    SET NOCOUNT ON;
    SELECT b.BookingId, b.BookingRef, b.CustomerUserId, dbo.fn_MaskEmail(u.Email) AS CustomerEmailMasked, b.Pax, b.UnitPrice, b.TotalAmount, b.Currency,
           b.Status, b.PaymentStatus, b.AmountPaid, b.AmountRefunded, b.LeadName, b.LeadPhoneMasked, b.PassportMasked, b.SpecialRequests,
           b.CancelReason, b.CreatedAtUtc, b.CreatedBy, b.IsDemo, b.RowVersion, dp.DepartureId, dp.DepartureDate, t.Code AS TourCode, t.Title AS TourTitle
    FROM dbo.Bookings b JOIN dbo.Users u ON u.UserId = b.CustomerUserId
    JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId JOIN dbo.Tours t ON t.TourId = dp.TourId
    WHERE b.BookingId = @BookingId;
    SELECT h.FromStatus, h.ToStatus, h.Comment, h.OccurredAtUtc, dbo.fn_MaskEmail(u.Email) AS ActorMasked
    FROM dbo.BookingStatusHistory h LEFT JOIN dbo.Users u ON u.UserId = h.ActorUserId WHERE h.BookingId = @BookingId ORDER BY h.HistoryId;
    SELECT PaymentId, Amount, Currency, Provider, ProviderRef, Method, CreatedAtUtc FROM dbo.Payments WHERE BookingId = @BookingId ORDER BY PaymentId;
    SELECT RefundId, RefundRef, Amount, Reason, Status, CreatedAtUtc, ProcessedAtUtc FROM dbo.Refunds WHERE BookingId = @BookingId ORDER BY RefundId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Booking_RevealPii @BookingId int, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Ref varchar(20) = (SELECT BookingRef FROM dbo.Bookings WHERE BookingId = @BookingId);
    IF @Ref IS NULL THROW 50001, 'not_found', 1;
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Booking.PiiRevealed', 'Booking', @Ref, N'{"fields":["phone","passport"]}', @CorrelationId, NULL;
    SELECT LeadPhoneEnc, PassportEnc FROM dbo.Bookings WHERE BookingId = @BookingId;
END;
GO
/* ---------------- FINANCE (SIMULATED provider) ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Finance_RecordPayment
    @BookingId int, @Amount decimal(12,2), @Method varchar(20), @IdempotencyKey varchar(64), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM dbo.Payments WHERE IdempotencyKey = @IdempotencyKey)
    BEGIN
        DECLARE @St varchar(20), @Total decimal(12,2), @Paid decimal(12,2), @Cur char(3), @Ref varchar(20);
        SELECT @St = Status, @Total = TotalAmount, @Paid = AmountPaid, @Cur = Currency, @Ref = BookingRef FROM dbo.Bookings WITH (UPDLOCK) WHERE BookingId = @BookingId;
        IF @St IS NULL THROW 50001, 'not_found', 1;
        IF @St <> 'Confirmed' THROW 50031, 'invalid_state', 1;
        IF @Amount <= 0 OR @Amount > @Total - @Paid THROW 50035, 'amount_exceeds_balance', 1;
        INSERT dbo.Payments(BookingId, Amount, Currency, ProviderRef, Method, IdempotencyKey, CreatedBy)
        VALUES (@BookingId, @Amount, @Cur, 'SIM-' + LEFT(REPLACE(CONVERT(varchar(36), NEWID()), '-', ''), 12), @Method, @IdempotencyKey, @ActorUserId);
        UPDATE dbo.Bookings SET AmountPaid = AmountPaid + @Amount, PaymentStatus = CASE WHEN AmountPaid + @Amount >= TotalAmount THEN 'Paid' ELSE 'PartiallyPaid' END,
               UpdatedAtUtc = SYSUTCDATETIME() WHERE BookingId = @BookingId;
        DECLARE @d nvarchar(200) = (SELECT @Amount AS amount, @Method AS method, 'SIMULATED' AS provider FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @ActorUserId, 'Payment.Recorded', 'Booking', @Ref, @d, @CorrelationId, NULL;
    END
    COMMIT;
    SELECT PaymentId, BookingId, Amount, Currency, Provider, ProviderRef, Method, CreatedAtUtc FROM dbo.Payments WHERE IdempotencyKey = @IdempotencyKey;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Finance_CreateRefund
    @BookingId int, @Amount decimal(12,2), @Reason nvarchar(100), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Paid decimal(12,2), @Refunded decimal(12,2), @Ref varchar(20);
    BEGIN TRAN;
    SELECT @Paid = AmountPaid, @Refunded = AmountRefunded, @Ref = BookingRef FROM dbo.Bookings WITH (UPDLOCK) WHERE BookingId = @BookingId;
    IF @Ref IS NULL THROW 50001, 'not_found', 1;
    DECLARE @Pending decimal(12,2) = ISNULL((SELECT SUM(Amount) FROM dbo.Refunds WHERE BookingId = @BookingId AND Status = 'PendingApproval'), 0);
    IF @Amount <= 0 OR @Amount > @Paid - @Refunded - @Pending THROW 50035, 'amount_exceeds_balance', 1;
    INSERT dbo.Refunds(BookingId, Amount, Reason, Status, CreatedBy) VALUES (@BookingId, @Amount, @Reason, 'PendingApproval', @ActorUserId);
    DECLARE @RefundId int = SCOPE_IDENTITY();
    DECLARE @RRef varchar(20) = (SELECT RefundRef FROM dbo.Refunds WHERE RefundId = @RefundId);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Refund.Requested', 'Booking', @Ref, NULL, @CorrelationId, NULL;
    DECLARE @Ar int, @Auto bit;
    EXEC dbo.usp_Approval_Start 'Refund', @RefundId, @RRef, @Amount, NULL, @ActorUserId, @CorrelationId, @Ar OUTPUT, @Auto OUTPUT;
    UPDATE dbo.Refunds SET ApprovalRequestId = @Ar WHERE RefundId = @RefundId;
    COMMIT;
    SELECT RefundId, RefundRef, Amount, Reason, Status, CreatedAtUtc, ProcessedAtUtc FROM dbo.Refunds WHERE RefundId = @RefundId;
END;
GO
/* ---------------- OPS CRUD ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Ops_BusinessUnits_List AS
BEGIN
    SET NOCOUNT ON;
    SELECT bu.BusinessUnitId, bu.Code, bu.Name, bu.Kind, bu.IsActive, bu.IsDemo, bu.RowVersion,
           (SELECT COUNT(*) FROM dbo.Tours t WHERE t.BusinessUnitId = bu.BusinessUnitId) AS TourCount
    FROM dbo.BusinessUnits bu ORDER BY bu.Code;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_BusinessUnits_Upsert
    @BusinessUnitId int = NULL, @Code varchar(20), @Name nvarchar(100), @Kind varchar(20), @IsActive bit, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF EXISTS (SELECT 1 FROM dbo.BusinessUnits WHERE Code = @Code AND BusinessUnitId <> ISNULL(@BusinessUnitId, -1)) THROW 50012, 'duplicate_key', 1;
    BEGIN TRAN;
    IF @BusinessUnitId IS NULL
    BEGIN
        INSERT dbo.BusinessUnits(Code, Name, Kind, IsActive) VALUES (@Code, @Name, @Kind, @IsActive);
        SET @BusinessUnitId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.BusinessUnits SET Code = @Code, Name = @Name, Kind = @Kind, IsActive = @IsActive WHERE BusinessUnitId = @BusinessUnitId;
        IF @@ROWCOUNT = 0 THROW 50001, 'not_found', 1;
    END
    EXEC dbo.usp_Audit_Write @ActorUserId, 'BusinessUnit.Saved', 'BusinessUnit', @Code, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT @BusinessUnitId AS BusinessUnitId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Suppliers_List @Search nvarchar(100) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT s.SupplierId, s.Code, s.Name, s.SupplierType, s.BusinessUnitId, s.ContactEmail, dbo.fn_MaskEmail(s.ContactEmail) AS ContactEmailMasked,
           s.AdapterType, s.WebhookSecretRef, s.RateLimitPerMin, s.ConnectionStatus, s.LastSyncAtUtc, s.IsActive, s.IsDemo, s.RowVersion,
           (SELECT COUNT(*) FROM dbo.IntegrationEvents e WHERE e.SupplierId = s.SupplierId AND e.Status IN ('Failed','DeadLetter')) AS FailedEvents
    FROM dbo.Suppliers s
    WHERE @Search IS NULL OR s.Code LIKE '%' + @Search + '%' OR s.Name LIKE '%' + @Search + '%'
    ORDER BY s.Code;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Suppliers_Upsert
    @SupplierId int = NULL, @Code varchar(20), @Name nvarchar(150), @SupplierType varchar(20), @BusinessUnitId int = NULL, @ContactEmail nvarchar(256) = NULL,
    @AdapterType varchar(20), @WebhookSecretRef varchar(100) = NULL, @RateLimitPerMin int, @IsActive bit, @RowVersion binary(8) = NULL,
    @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF EXISTS (SELECT 1 FROM dbo.Suppliers WHERE Code = @Code AND SupplierId <> ISNULL(@SupplierId, -1)) THROW 50012, 'duplicate_key', 1;
    DECLARE @Conn varchar(20) = CASE @AdapterType WHEN 'LocalMock' THEN 'LocalMock' WHEN 'Webhook' THEN 'WebhookReady' ELSE 'PendingCredentials' END;
    BEGIN TRAN;
    IF @SupplierId IS NULL
    BEGIN
        INSERT dbo.Suppliers(Code, Name, SupplierType, BusinessUnitId, ContactEmail, AdapterType, WebhookSecretRef, RateLimitPerMin, ConnectionStatus, IsActive)
        VALUES (@Code, @Name, @SupplierType, @BusinessUnitId, @ContactEmail, @AdapterType, @WebhookSecretRef, @RateLimitPerMin, @Conn, @IsActive);
        SET @SupplierId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        DECLARE @Rv binary(8) = (SELECT RowVersion FROM dbo.Suppliers WITH (UPDLOCK) WHERE SupplierId = @SupplierId);
        IF @Rv IS NULL THROW 50001, 'not_found', 1;
        IF @RowVersion IS NOT NULL AND @Rv <> @RowVersion THROW 50009, 'concurrency_conflict', 1;
        UPDATE dbo.Suppliers SET Code = @Code, Name = @Name, SupplierType = @SupplierType, BusinessUnitId = @BusinessUnitId, ContactEmail = @ContactEmail,
               AdapterType = @AdapterType, WebhookSecretRef = @WebhookSecretRef, RateLimitPerMin = @RateLimitPerMin, ConnectionStatus = @Conn,
               IsActive = @IsActive, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE SupplierId = @SupplierId;
    END
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Supplier.Saved', 'Supplier', @Code, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT @SupplierId AS SupplierId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Suppliers_GetByCode @Code varchar(20) AS
BEGIN
    SET NOCOUNT ON;
    SELECT SupplierId, Code, Name, AdapterType, WebhookSecretRef, RateLimitPerMin, IsActive FROM dbo.Suppliers WHERE Code = @Code;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Tours_List @Search nvarchar(100) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.TourId, t.Code, t.Title, t.Slogan, t.DestinationId, d.Name AS DestinationName, t.BusinessUnitId, bu.Code AS BusinessUnitCode,
           t.Days, t.BasePrice, t.Currency, t.Summary, t.IsPublished, t.IsDemo, t.RowVersion, t.ImageUrl, d.ImageUrl AS DestinationImageUrl,
           (SELECT COUNT(*) FROM dbo.Departures dp WHERE dp.TourId = t.TourId AND dp.DepartureDate > CAST(SYSUTCDATETIME() AS date)) AS UpcomingDepartures
    FROM dbo.Tours t JOIN dbo.Destinations d ON d.DestinationId = t.DestinationId JOIN dbo.BusinessUnits bu ON bu.BusinessUnitId = t.BusinessUnitId
    WHERE @Search IS NULL OR t.Code LIKE '%' + @Search + '%' OR t.Title LIKE '%' + @Search + '%'
    ORDER BY t.Code;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Tours_Upsert
    @TourId int = NULL, @Code varchar(30), @Title nvarchar(150), @Slogan nvarchar(100) = NULL, @DestinationId int, @BusinessUnitId int, @Days int,
    @BasePrice decimal(12,2), @Summary nvarchar(2000) = NULL, @IsPublished bit, @RowVersion binary(8) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL,
    @ImageUrl nvarchar(300) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF EXISTS (SELECT 1 FROM dbo.Tours WHERE Code = @Code AND TourId <> ISNULL(@TourId, -1)) THROW 50012, 'duplicate_key', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.Destinations WHERE DestinationId = @DestinationId) OR NOT EXISTS (SELECT 1 FROM dbo.BusinessUnits WHERE BusinessUnitId = @BusinessUnitId)
        THROW 50013, 'invalid_reference', 1;
    BEGIN TRAN;
    IF @TourId IS NULL
    BEGIN
        INSERT dbo.Tours(Code, Title, Slogan, DestinationId, BusinessUnitId, Days, BasePrice, Summary, IsPublished, ImageUrl)
        VALUES (@Code, @Title, @Slogan, @DestinationId, @BusinessUnitId, @Days, @BasePrice, @Summary, @IsPublished, @ImageUrl);
        SET @TourId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        DECLARE @Rv binary(8) = (SELECT RowVersion FROM dbo.Tours WITH (UPDLOCK) WHERE TourId = @TourId);
        IF @Rv IS NULL THROW 50001, 'not_found', 1;
        IF @RowVersion IS NOT NULL AND @Rv <> @RowVersion THROW 50009, 'concurrency_conflict', 1;
        UPDATE dbo.Tours SET Code = @Code, Title = @Title, Slogan = @Slogan, DestinationId = @DestinationId, BusinessUnitId = @BusinessUnitId, Days = @Days,
               BasePrice = @BasePrice, Summary = @Summary, IsPublished = @IsPublished, ImageUrl = @ImageUrl, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE TourId = @TourId;
    END
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Tour.Saved', 'Tour', @Code, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT @TourId AS TourId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Departures_List @TourId int = NULL, @FromDate date = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT dp.DepartureId, dp.TourId, t.Code AS TourCode, t.Title AS TourTitle, dp.DepartureDate, dp.Capacity, dp.SeatsSold, dp.SeatsHeld,
           dp.Capacity - dp.SeatsSold - dp.SeatsHeld AS SeatsLeft, dp.Price, dp.Status, dp.IsDemo, dp.RowVersion
    FROM dbo.Departures dp JOIN dbo.Tours t ON t.TourId = dp.TourId
    WHERE (@TourId IS NULL OR dp.TourId = @TourId) AND (@FromDate IS NULL OR dp.DepartureDate >= @FromDate)
    ORDER BY dp.DepartureDate, t.Code;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Departures_Upsert
    @DepartureId int = NULL, @TourId int, @DepartureDate date, @Capacity int, @Price decimal(12,2), @Status varchar(20), @RowVersion binary(8) = NULL,
    @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Tours WHERE TourId = @TourId) THROW 50013, 'invalid_reference', 1;
    IF EXISTS (SELECT 1 FROM dbo.Departures WHERE TourId = @TourId AND DepartureDate = @DepartureDate AND DepartureId <> ISNULL(@DepartureId, -1)) THROW 50012, 'duplicate_departure', 1;
    BEGIN TRAN;
    IF @DepartureId IS NULL
    BEGIN
        INSERT dbo.Departures(TourId, DepartureDate, Capacity, Price, Status) VALUES (@TourId, @DepartureDate, @Capacity, @Price, @Status);
        SET @DepartureId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        DECLARE @Rv binary(8), @Sold int, @Held int;
        SELECT @Rv = RowVersion, @Sold = SeatsSold, @Held = SeatsHeld FROM dbo.Departures WITH (UPDLOCK, HOLDLOCK) WHERE DepartureId = @DepartureId;
        IF @Rv IS NULL THROW 50001, 'not_found', 1;
        IF @RowVersion IS NOT NULL AND @Rv <> @RowVersion THROW 50009, 'concurrency_conflict', 1;
        IF @Capacity < @Sold + @Held THROW 50033, 'capacity_below_sold', 1;
        UPDATE dbo.Departures SET TourId = @TourId, DepartureDate = @DepartureDate, Capacity = @Capacity, Price = @Price, Status = @Status, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE DepartureId = @DepartureId;
    END
    DECLARE @id nvarchar(20) = CAST(@DepartureId AS nvarchar(20));
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Departure.Saved', 'Departure', @id, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT @DepartureId AS DepartureId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Lookups AS
BEGIN
    SET NOCOUNT ON;
    SELECT DestinationId AS Id, Code, Name FROM dbo.Destinations WHERE IsActive = 1 ORDER BY Name;
    SELECT BusinessUnitId AS Id, Code, Name FROM dbo.BusinessUnits WHERE IsActive = 1 ORDER BY Code;
    SELECT VehicleTypeId AS Id, Code, Name, Seats, CostPerDay FROM dbo.VehicleTypes WHERE IsActive = 1 ORDER BY Seats DESC;
    SELECT RoleId AS Id, RoleKey AS Code, RoleName AS Name FROM dbo.Roles WHERE IsActive = 1 ORDER BY RoleName;
    SELECT u.UserId, u.DisplayName, dbo.fn_MaskEmail(u.Email) AS EmailMasked FROM dbo.Users u WHERE u.UserType = 'Staff' AND u.IsActive = 1 AND u.PasswordHash IS NOT NULL ORDER BY u.DisplayName;
    SELECT SupplierId AS Id, Code, Name FROM dbo.Suppliers WHERE IsActive = 1 ORDER BY Code;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_CostAssumptions_List AS
BEGIN
    SET NOCOUNT ON;
    SELECT AssumptionId, AssumptionKey, Value, Unit, Description, UpdatedAtUtc, RowVersion FROM dbo.CostAssumptions ORDER BY AssumptionKey;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_CostAssumptions_Update @AssumptionKey varchar(50), @Value decimal(12,2), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @Value < 0 THROW 50041, 'validation_failed', 1;
    BEGIN TRAN;
    UPDATE dbo.CostAssumptions SET Value = @Value, UpdatedAtUtc = SYSUTCDATETIME() WHERE AssumptionKey = @AssumptionKey;
    IF @@ROWCOUNT = 0 THROW 50001, 'not_found', 1;
    EXEC dbo.usp_Audit_Write @ActorUserId, 'CostAssumption.Changed', 'CostAssumption', @AssumptionKey, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Dashboard AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Today date = CAST(SYSUTCDATETIME() AS date);
    SELECT
        (SELECT COUNT(*) FROM dbo.Bookings WHERE CreatedAtUtc >= @Today) AS BookingsToday,
        (SELECT COUNT(*) FROM dbo.ApprovalRequests WHERE Status = 'Pending') AS PendingApprovals,
        (SELECT ISNULL(SUM(Pax), 0) FROM dbo.InventoryHolds WHERE Status = 'Active' AND ExpiresAtUtc > SYSUTCDATETIME()) AS SeatsOnHold,
        (SELECT CAST(CASE WHEN SUM(Capacity) = 0 THEN 0 ELSE 100.0 * SUM(SeatsSold) / SUM(Capacity) END AS decimal(5,1))
           FROM dbo.Departures WHERE Status = 'Open' AND DepartureDate BETWEEN @Today AND DATEADD(DAY, 60, @Today)) AS LoadFactorPct,
        (SELECT COUNT(*) FROM dbo.StaffTasks WHERE Status <> 'Done') AS OpenTasks,
        (SELECT COUNT(*) FROM dbo.StaffTasks WHERE Status <> 'Done' AND DueAtUtc < SYSUTCDATETIME()) AS OverdueTasks,
        (SELECT ISNULL(SUM(ABS(Difference)), 0) FROM dbo.Reconciliations WHERE Status IN ('Mismatch','MissingStatement')) AS UnreconciledAmount,
        (SELECT COUNT(*) FROM dbo.IntegrationEvents WHERE Status IN ('Failed','DeadLetter')) AS FailedIntegrations,
        (SELECT ISNULL(SUM(TotalAmount), 0) FROM dbo.Bookings WHERE Status = 'Confirmed') AS ConfirmedRevenue;
    SELECT TOP (8) dp.DepartureId, dp.DepartureDate, t.Code AS TourCode, t.Title AS TourTitle, dp.Capacity, dp.SeatsSold, dp.SeatsHeld, dp.Status
    FROM dbo.Departures dp JOIN dbo.Tours t ON t.TourId = dp.TourId
    WHERE dp.DepartureDate >= @Today AND dp.Status = 'Open' ORDER BY dp.DepartureDate;
    SELECT bu.Code, bu.Name, COUNT(b.BookingId) AS Bookings, ISNULL(SUM(CASE WHEN b.Status = 'Confirmed' THEN b.TotalAmount END), 0) AS Revenue
    FROM dbo.BusinessUnits bu LEFT JOIN dbo.Tours t ON t.BusinessUnitId = bu.BusinessUnitId
    LEFT JOIN dbo.Departures dp ON dp.TourId = t.TourId LEFT JOIN dbo.Bookings b ON b.DepartureId = dp.DepartureId
    GROUP BY bu.Code, bu.Name ORDER BY Revenue DESC;
END;
GO
/* ---------------- INTEGRATION ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Integration_IngestEvent
    @SupplierId int, @EventType varchar(60), @IdempotencyKey varchar(100), @CorrelationId varchar(64), @PayloadJson nvarchar(max)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Id bigint;
    BEGIN TRAN;
    SELECT @Id = EventId FROM dbo.IntegrationEvents WITH (UPDLOCK, HOLDLOCK) WHERE SupplierId = @SupplierId AND IdempotencyKey = @IdempotencyKey;
    IF @Id IS NOT NULL
    BEGIN
        UPDATE dbo.IntegrationEvents SET DuplicateCount = DuplicateCount + 1 WHERE EventId = @Id;
        COMMIT;
        SELECT EventId, 'duplicate' AS Outcome, Status FROM dbo.IntegrationEvents WHERE EventId = @Id;
        RETURN;
    END
    INSERT dbo.IntegrationEvents(SupplierId, EventType, IdempotencyKey, CorrelationId, PayloadJson, Status)
    VALUES (@SupplierId, @EventType, @IdempotencyKey, @CorrelationId, @PayloadJson, 'Received');
    SET @Id = SCOPE_IDENTITY();
    UPDATE dbo.Suppliers SET LastSyncAtUtc = SYSUTCDATETIME() WHERE SupplierId = @SupplierId;
    COMMIT;
    SELECT @Id AS EventId, 'new' AS Outcome, 'Received' AS Status;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Integration_Get @EventId bigint AS
BEGIN
    SET NOCOUNT ON;
    SELECT e.EventId, e.SupplierId, s.Code AS SupplierCode, e.EventType, e.IdempotencyKey, e.CorrelationId, e.PayloadJson, e.Status, e.Attempts
    FROM dbo.IntegrationEvents e JOIN dbo.Suppliers s ON s.SupplierId = e.SupplierId WHERE e.EventId = @EventId;
END;
GO
/* Backoff: 1, 2, 4, 8 … minutes; DeadLetter after @MaxAttempts. */
CREATE OR ALTER PROCEDURE dbo.usp_Integration_MarkResult @EventId bigint, @Succeeded bit, @Error nvarchar(500) = NULL, @MaxAttempts int = 5 AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.IntegrationEvents SET
        Attempts = Attempts + 1,
        Status = CASE WHEN @Succeeded = 1 THEN 'Processed' WHEN Attempts + 1 >= @MaxAttempts THEN 'DeadLetter' ELSE 'Failed' END,
        NextAttemptAtUtc = CASE WHEN @Succeeded = 1 OR Attempts + 1 >= @MaxAttempts THEN NULL ELSE DATEADD(MINUTE, POWER(2, Attempts), SYSUTCDATETIME()) END,
        LastError = CASE WHEN @Succeeded = 1 THEN NULL ELSE LEFT(@Error, 500) END,
        ProcessedAtUtc = CASE WHEN @Succeeded = 1 THEN SYSUTCDATETIME() ELSE NULL END
    WHERE EventId = @EventId;
    SELECT EventId, Status, Attempts, NextAttemptAtUtc FROM dbo.IntegrationEvents WHERE EventId = @EventId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Integration_DueRetries @Max int = 20 AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@Max) EventId FROM dbo.IntegrationEvents WHERE Status = 'Failed' AND NextAttemptAtUtc <= SYSUTCDATETIME() ORDER BY NextAttemptAtUtc;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Integration_List @Status varchar(20) = NULL, @SupplierId int = NULL, @Page int = 1, @PageSize int = 50 AS
BEGIN
    SET NOCOUNT ON;
    SELECT e.EventId, s.Code AS SupplierCode, s.Name AS SupplierName, e.EventType, e.IdempotencyKey, e.CorrelationId, e.Status, e.Attempts, e.DuplicateCount,
           e.NextAttemptAtUtc, e.LastError, e.ReceivedAtUtc, e.ProcessedAtUtc, e.PayloadJson, e.IsDemo, COUNT(*) OVER () AS Total
    FROM dbo.IntegrationEvents e JOIN dbo.Suppliers s ON s.SupplierId = e.SupplierId
    WHERE (@Status IS NULL OR e.Status = @Status) AND (@SupplierId IS NULL OR e.SupplierId = @SupplierId)
    ORDER BY e.EventId DESC OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Integration_ApplyStatement @SupplierId int, @Period char(7), @Amount decimal(12,2) AS
BEGIN
    SET NOCOUNT ON;
    MERGE dbo.SupplierStatements AS t
    USING (SELECT @SupplierId AS SupplierId, @Period AS Period) AS s ON t.SupplierId = s.SupplierId AND t.Period = s.Period
    WHEN MATCHED THEN UPDATE SET Amount = @Amount, Source = 'Webhook', ReceivedAtUtc = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (SupplierId, Period, Amount, Source) VALUES (@SupplierId, @Period, @Amount, 'Webhook');
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Integration_ApplyAllotment @TourCode varchar(30), @DepartureDate date, @Capacity int AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Dep int, @Sold int, @Held int;
    BEGIN TRAN;
    SELECT @Dep = dp.DepartureId, @Sold = dp.SeatsSold, @Held = dp.SeatsHeld
    FROM dbo.Departures dp WITH (UPDLOCK, HOLDLOCK) JOIN dbo.Tours t ON t.TourId = dp.TourId WHERE t.Code = @TourCode AND dp.DepartureDate = @DepartureDate;
    IF @Dep IS NULL THROW 50001, 'not_found', 1;
    IF @Capacity < @Sold + @Held THROW 50033, 'capacity_below_sold', 1;
    UPDATE dbo.Departures SET Capacity = @Capacity, UpdatedAtUtc = SYSUTCDATETIME() WHERE DepartureId = @Dep;
    COMMIT;
END;
GO
/* ---------------- RECONCILIATION ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Recon_Run @Period char(7), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @Period NOT LIKE '[0-9][0-9][0-9][0-9]-[0-1][0-9]' THROW 50041, 'validation_failed', 1;
    DECLARE @From date = CAST(@Period + '-01' AS date);
    DECLARE @R TABLE (SupplierId int PRIMARY KEY, OurAmount decimal(12,2), SupplierAmount decimal(12,2) NULL);
    INSERT @R(SupplierId, OurAmount, SupplierAmount)
    SELECT s.SupplierId,
           ISNULL((SELECT SUM(c.Amount) FROM dbo.DepartureCosts c JOIN dbo.Departures dp ON dp.DepartureId = c.DepartureId
                   WHERE c.SupplierId = s.SupplierId AND dp.Status <> 'Cancelled' AND dp.DepartureDate >= @From AND dp.DepartureDate < DATEADD(MONTH, 1, @From)), 0),
           (SELECT st.Amount FROM dbo.SupplierStatements st WHERE st.SupplierId = s.SupplierId AND st.Period = @Period)
    FROM dbo.Suppliers s WHERE s.IsActive = 1;
    DELETE @R WHERE OurAmount = 0 AND SupplierAmount IS NULL;
    BEGIN TRAN;
    MERGE dbo.Reconciliations AS t
    USING (SELECT SupplierId, OurAmount, SupplierAmount,
                  CASE WHEN SupplierAmount IS NULL THEN 'MissingStatement' WHEN SupplierAmount = OurAmount THEN 'Matched' ELSE 'Mismatch' END AS Status FROM @R) AS s
    ON t.SupplierId = s.SupplierId AND t.Period = @Period
    WHEN MATCHED AND t.Status NOT IN ('Accepted','Settled') THEN
        UPDATE SET OurAmount = s.OurAmount, SupplierAmount = s.SupplierAmount, Status = s.Status, RunAtUtc = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (SupplierId, Period, OurAmount, SupplierAmount, Status) VALUES (s.SupplierId, @Period, s.OurAmount, s.SupplierAmount, s.Status);
    -- one exception task per mismatch, never duplicated on rerun
    DECLARE @Sla int = ISNULL(TRY_CAST((SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = 'Tasks.ReconMismatchSlaHours') AS int), 24);
    INSERT dbo.StaffTasks(Title, TaskType, EntityType, EntityRef, Priority, DueAtUtc)
    SELECT N'Reconciliation mismatch ' + s.Code + N' ' + @Period, 'Exception', 'Reconciliation', 'RC-' + CAST(r.ReconId AS varchar(10)), 'High', DATEADD(HOUR, @Sla, SYSUTCDATETIME())
    FROM dbo.Reconciliations r JOIN dbo.Suppliers s ON s.SupplierId = r.SupplierId
    WHERE r.Period = @Period AND r.Status IN ('Mismatch','MissingStatement')
      AND NOT EXISTS (SELECT 1 FROM dbo.StaffTasks k WHERE k.EntityType = 'Reconciliation' AND k.EntityRef = 'RC-' + CAST(r.ReconId AS varchar(10)));
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Reconciliation.Run', 'Reconciliation', @Period, NULL, @CorrelationId, NULL;
    COMMIT;
    EXEC dbo.usp_Recon_List @Period;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Recon_List @Period char(7) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT r.ReconId, r.SupplierId, s.Code AS SupplierCode, s.Name AS SupplierName, r.Period, r.OurAmount, r.SupplierAmount, r.Difference, r.Status,
           r.ResolutionNote, r.RunAtUtc, r.RowVersion
    FROM dbo.Reconciliations r JOIN dbo.Suppliers s ON s.SupplierId = r.SupplierId
    WHERE @Period IS NULL OR r.Period = @Period ORDER BY r.Period DESC, s.Code;
END;
GO
/* @Action: accept (mismatch/missing, note required) | settle (matched/accepted) */
CREATE OR ALTER PROCEDURE dbo.usp_Recon_Resolve @ReconId int, @Action varchar(10), @Note nvarchar(500) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @St varchar(20);
    BEGIN TRAN;
    SELECT @St = Status FROM dbo.Reconciliations WITH (UPDLOCK) WHERE ReconId = @ReconId;
    IF @St IS NULL THROW 50001, 'not_found', 1;
    IF @Action = 'accept'
    BEGIN
        IF @St NOT IN ('Mismatch','MissingStatement') THROW 50031, 'invalid_state', 1;
        IF NULLIF(LTRIM(@Note), '') IS NULL THROW 50041, 'note_required', 1;
        UPDATE dbo.Reconciliations SET Status = 'Accepted', ResolutionNote = @Note, ResolvedBy = @ActorUserId WHERE ReconId = @ReconId;
        UPDATE dbo.StaffTasks SET Status = 'Done', CompletedAtUtc = SYSUTCDATETIME(), Note = @Note
        WHERE EntityType = 'Reconciliation' AND EntityRef = 'RC-' + CAST(@ReconId AS varchar(10)) AND Status <> 'Done';
    END
    ELSE IF @Action = 'settle'
    BEGIN
        IF @St NOT IN ('Matched','Accepted') THROW 50031, 'invalid_state', 1;
        UPDATE dbo.Reconciliations SET Status = 'Settled', ResolvedBy = @ActorUserId, ResolutionNote = ISNULL(@Note, ResolutionNote) WHERE ReconId = @ReconId;
    END
    ELSE THROW 50041, 'validation_failed', 1;
    DECLARE @a varchar(60) = 'Reconciliation.' + CASE WHEN @Action = 'accept' THEN 'Accepted' ELSE 'Settled' END, @id nvarchar(20) = CAST(@ReconId AS nvarchar(20));
    EXEC dbo.usp_Audit_Write @ActorUserId, @a, 'Reconciliation', @id, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
/* ---------------- GROUP SIMULATION ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_GroupSim_Inputs @DepartureId int AS
BEGIN
    SET NOCOUNT ON;
    SELECT dp.DepartureId, dp.DepartureDate, t.Code AS TourCode, t.Title AS TourTitle, t.Days, dp.Price, dp.Capacity,
           ISNULL((SELECT SUM(Pax) FROM dbo.Bookings b WHERE b.DepartureId = dp.DepartureId AND b.Status IN ('Pending','Confirmed','CancelRequested')), 0) AS Pax,
           ISNULL((SELECT SUM(TotalAmount) FROM dbo.Bookings b WHERE b.DepartureId = dp.DepartureId AND b.Status IN ('Pending','Confirmed','CancelRequested')), 0) AS Revenue
    FROM dbo.Departures dp JOIN dbo.Tours t ON t.TourId = dp.TourId WHERE dp.DepartureId = @DepartureId;
    SELECT VehicleTypeId, Code, Name, Seats, CostPerDay FROM dbo.VehicleTypes WHERE IsActive = 1 ORDER BY Seats DESC;
    SELECT AssumptionKey, Value FROM dbo.CostAssumptions;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_GroupSim_Save
    @DepartureId int, @InputsJson nvarchar(max), @ResultJson nvarchar(max), @ChosenOption varchar(100), @ProjectedCost decimal(12,2),
    @ProjectedRevenue decimal(12,2), @ProjectedMarginPct decimal(6,2), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF ISJSON(@InputsJson) = 0 OR ISJSON(@ResultJson) = 0 THROW 50041, 'validation_failed', 1;
    BEGIN TRAN;
    INSERT dbo.GroupPlans(DepartureId, Status, InputsJson, ResultJson, ChosenOption, ProjectedCost, ProjectedRevenue, ProjectedMarginPct, CreatedBy)
    VALUES (@DepartureId, 'Draft', @InputsJson, @ResultJson, @ChosenOption, @ProjectedCost, @ProjectedRevenue, @ProjectedMarginPct, @ActorUserId);
    DECLARE @Id int = SCOPE_IDENTITY(), @sid nvarchar(20);
    SET @sid = CAST(@Id AS nvarchar(20));
    EXEC dbo.usp_Audit_Write @ActorUserId, 'GroupPlan.Simulated', 'GroupPlan', @sid, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT GroupPlanId, PlanRef, Status FROM dbo.GroupPlans WHERE GroupPlanId = @Id;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_GroupSim_Submit @GroupPlanId int, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @St varchar(20), @Ref varchar(20), @Cost decimal(12,2);
    BEGIN TRAN;
    SELECT @St = Status, @Ref = PlanRef, @Cost = ProjectedCost FROM dbo.GroupPlans WITH (UPDLOCK) WHERE GroupPlanId = @GroupPlanId;
    IF @St IS NULL THROW 50001, 'not_found', 1;
    IF @St <> 'Draft' THROW 50031, 'invalid_state', 1;
    UPDATE dbo.GroupPlans SET Status = 'Submitted' WHERE GroupPlanId = @GroupPlanId;
    DECLARE @Ar int, @Auto bit;
    EXEC dbo.usp_Approval_Start 'GroupPlan', @GroupPlanId, @Ref, @Cost, NULL, @ActorUserId, @CorrelationId, @Ar OUTPUT, @Auto OUTPUT;
    UPDATE dbo.GroupPlans SET ApprovalRequestId = @Ar WHERE GroupPlanId = @GroupPlanId;
    EXEC dbo.usp_Audit_Write @ActorUserId, 'GroupPlan.Submitted', 'GroupPlan', @Ref, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT GroupPlanId, PlanRef, Status, ApprovalRequestId FROM dbo.GroupPlans WHERE GroupPlanId = @GroupPlanId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_GroupSim_List @DepartureId int = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT g.GroupPlanId, g.PlanRef, g.DepartureId, dp.DepartureDate, t.Code AS TourCode, g.Status, g.ChosenOption, g.ProjectedCost, g.ProjectedRevenue,
           g.ProjectedMarginPct, g.ApprovalRequestId, g.CreatedAtUtc, dbo.fn_MaskEmail(u.Email) AS CreatedByMasked, g.ResultJson
    FROM dbo.GroupPlans g JOIN dbo.Departures dp ON dp.DepartureId = g.DepartureId JOIN dbo.Tours t ON t.TourId = dp.TourId JOIN dbo.Users u ON u.UserId = g.CreatedBy
    WHERE @DepartureId IS NULL OR g.DepartureId = @DepartureId ORDER BY g.GroupPlanId DESC;
END;
GO
/* ---------------- TASKS ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_List @AssignedUserId uniqueidentifier = NULL, @Status varchar(20) = NULL, @OverdueOnly bit = 0 AS
BEGIN
    SET NOCOUNT ON;
    SELECT k.TaskId, k.Title, k.TaskType, k.EntityType, k.EntityRef, k.AssignedUserId, u.DisplayName AS AssignedTo, k.Status, k.Priority, k.DueAtUtc,
           CASE WHEN k.Status <> 'Done' AND k.DueAtUtc < SYSUTCDATETIME() THEN 1 ELSE 0 END AS IsOverdue, k.Note, k.CreatedAtUtc, k.CompletedAtUtc, k.IsDemo, k.RowVersion
    FROM dbo.StaffTasks k LEFT JOIN dbo.Users u ON u.UserId = k.AssignedUserId
    WHERE (@AssignedUserId IS NULL OR k.AssignedUserId = @AssignedUserId) AND (@Status IS NULL OR k.Status = @Status)
      AND (@OverdueOnly = 0 OR (k.Status <> 'Done' AND k.DueAtUtc < SYSUTCDATETIME()))
    ORDER BY CASE k.Status WHEN 'Done' THEN 1 ELSE 0 END, k.DueAtUtc;
END;
GO
/* @Action: take | assign | start | done */
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_Update
    @TaskId int, @Action varchar(10), @AssignToUserId uniqueidentifier = NULL, @Note nvarchar(1000) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @St varchar(20);
    BEGIN TRAN;
    SELECT @St = Status FROM dbo.StaffTasks WITH (UPDLOCK) WHERE TaskId = @TaskId;
    IF @St IS NULL THROW 50001, 'not_found', 1;
    IF @St = 'Done' THROW 50031, 'invalid_state', 1;
    IF @Action = 'take' UPDATE dbo.StaffTasks SET AssignedUserId = @ActorUserId, Status = 'InProgress' WHERE TaskId = @TaskId;
    ELSE IF @Action = 'assign'
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @AssignToUserId AND IsActive = 1 AND UserType = 'Staff') THROW 50013, 'invalid_reference', 1;
        UPDATE dbo.StaffTasks SET AssignedUserId = @AssignToUserId WHERE TaskId = @TaskId;
    END
    ELSE IF @Action = 'start' UPDATE dbo.StaffTasks SET Status = 'InProgress' WHERE TaskId = @TaskId;
    ELSE IF @Action = 'done' UPDATE dbo.StaffTasks SET Status = 'Done', CompletedAtUtc = SYSUTCDATETIME(), Note = ISNULL(@Note, Note) WHERE TaskId = @TaskId;
    ELSE THROW 50041, 'validation_failed', 1;
    DECLARE @a varchar(60) = 'Task.' + @Action, @id nvarchar(20) = CAST(@TaskId AS nvarchar(20));
    EXEC dbo.usp_Audit_Write @ActorUserId, @a, 'Task', @id, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Tasks_Create
    @Title nvarchar(200), @TaskType varchar(20), @EntityType varchar(30) = NULL, @EntityRef varchar(30) = NULL, @Priority varchar(10), @DueInHours int,
    @ActorUserId uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT dbo.StaffTasks(Title, TaskType, EntityType, EntityRef, Priority, DueAtUtc) VALUES (@Title, @TaskType, @EntityType, @EntityRef, @Priority, DATEADD(HOUR, @DueInHours, SYSUTCDATETIME()));
    SELECT SCOPE_IDENTITY() AS TaskId;
END;
GO
/* ---------------- PRIVACY / RETENTION ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Privacy_Policies_List AS
BEGIN
    SET NOCOUNT ON;
    SELECT PolicyId, DataClass, Fields, KeepDays, Action, IsActive, LastRunAtUtc, RowVersion FROM dbo.RetentionPolicies ORDER BY DataClass;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Privacy_Policies_Update @PolicyId int, @KeepDays int, @Action varchar(20), @IsActive bit, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    UPDATE dbo.RetentionPolicies SET KeepDays = @KeepDays, Action = @Action, IsActive = @IsActive WHERE PolicyId = @PolicyId;
    IF @@ROWCOUNT = 0 THROW 50001, 'not_found', 1;
    DECLARE @id nvarchar(20) = CAST(@PolicyId AS nvarchar(20));
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Retention.PolicyChanged', 'RetentionPolicy', @id, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
/* Anonymises traveler PII on bookings whose departure is older than the policy's KeepDays. */
CREATE OR ALTER PROCEDURE dbo.usp_Privacy_Run @DryRun bit, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Keep int, @Act varchar(20);
    SELECT @Keep = KeepDays, @Act = Action FROM dbo.RetentionPolicies WHERE DataClass = 'TravelerPII' AND IsActive = 1;
    IF @Keep IS NULL BEGIN SELECT 0 AS Affected, CAST(@DryRun AS bit) AS DryRun; RETURN; END
    DECLARE @Cut date = DATEADD(DAY, -@Keep, CAST(SYSUTCDATETIME() AS date));
    DECLARE @N int = (SELECT COUNT(*) FROM dbo.Bookings b JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId
                      WHERE dp.DepartureDate < @Cut AND (b.LeadPhoneEnc IS NOT NULL OR b.PassportEnc IS NOT NULL OR b.LeadName <> N'[anonymised]'));
    IF @DryRun = 0 AND @Act = 'Anonymise'
    BEGIN
        BEGIN TRAN;
        UPDATE b SET LeadName = N'[anonymised]', LeadPhoneEnc = NULL, LeadPhoneMasked = NULL, PassportEnc = NULL, PassportMasked = NULL, SpecialRequests = NULL
        FROM dbo.Bookings b JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId WHERE dp.DepartureDate < @Cut;
        UPDATE dbo.RetentionPolicies SET LastRunAtUtc = SYSUTCDATETIME() WHERE DataClass = 'TravelerPII';
        DECLARE @d nvarchar(100) = N'{"affected":' + CAST(@N AS nvarchar(10)) + N'}';
        EXEC dbo.usp_Audit_Write @ActorUserId, 'Retention.Run', 'RetentionPolicy', 'TravelerPII', @d, @CorrelationId, NULL;
        COMMIT;
    END
    SELECT @N AS Affected, CAST(@DryRun AS bit) AS DryRun;
END;
GO
