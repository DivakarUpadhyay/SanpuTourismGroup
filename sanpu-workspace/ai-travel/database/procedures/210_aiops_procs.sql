/* 210_aiops_procs.sql — AI Operations Copilot procedures.
   Extra error numbers: 50031 invalid_state · 50032 self_approval · 50038 stale_version · 50039 budget_exceeded */
SET NOCOUNT ON;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AiOps_Lookups AS
BEGIN
    SET NOCOUNT ON;
    SELECT r.RegionId, r.Code, r.Name, r.ImageUrl,
           (SELECT COUNT(*) FROM dbo.Places p WHERE p.RegionId = r.RegionId) AS PlaceCount,
           (SELECT COUNT(*) FROM dbo.ItineraryTemplates t WHERE t.RegionId = r.RegionId AND t.IsActive = 1) AS TemplateCount
    FROM dbo.Regions r ORDER BY r.Name;
    SELECT t.TemplateId, t.Code, t.Name, t.RegionId, t.Days, t.Pace, t.Description, t.IsDemo FROM dbo.ItineraryTemplates t WHERE t.IsActive = 1 ORDER BY t.Name;
    SELECT ScenarioId, Code, Name FROM dbo.DisruptionScenarios WHERE IsActive = 1 ORDER BY Name;
END;
GO
/* ---------------- TRIPS & ITINERARIES ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Trip_Create
    @TravelerUserId uniqueidentifier, @Name nvarchar(120), @TemplateId int, @StartDate date, @Days int, @Pax int, @Pace varchar(10),
    @MobilityNeeds varchar(20), @BudgetPerPax decimal(10,2), @Notes nvarchar(1000) = NULL, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Region int = (SELECT RegionId FROM dbo.ItineraryTemplates WHERE TemplateId = @TemplateId AND IsActive = 1);
    IF @Region IS NULL THROW 50013, 'invalid_reference', 1;
    IF @StartDate < CAST(SYSUTCDATETIME() AS date) THROW 50041, 'start_in_past', 1;
    BEGIN TRAN;
    INSERT dbo.Trips(TravelerUserId, Name, RegionId, TemplateId, StartDate, Days, Pax, Pace, MobilityNeeds, BudgetPerPax, Notes)
    VALUES (@TravelerUserId, @Name, @Region, @TemplateId, @StartDate, @Days, @Pax, @Pace, @MobilityNeeds, @BudgetPerPax, @Notes);
    DECLARE @Id int = SCOPE_IDENTITY();
    DECLARE @Ref nvarchar(20) = (SELECT TripRef FROM dbo.Trips WHERE TripId = @Id);
    EXEC dbo.usp_Audit_Write @TravelerUserId, 'Trip.Created', 'Trip', @Ref, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT TripId, TripRef FROM dbo.Trips WHERE TripId = @Id;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Trip_GenerationInputs @TripId int AS
BEGIN
    SET NOCOUNT ON;
    SELECT TripId, TripRef, TravelerUserId, Name, RegionId, TemplateId, StartDate, Days, Pax, Pace, MobilityNeeds, BudgetPerPax, Notes, CurrentVersion, Status
    FROM dbo.Trips WHERE TripId = @TripId;
    SELECT ti.ItemKey, ti.DayNo, ti.StartTime, ti.DurationMin, ti.DependsOnItemKey, p.PlaceId, p.Code AS PlaceCode, p.Name AS PlaceName, p.Category,
           p.OpenTime, p.CloseTime, p.WheelchairAccessible, p.CostPerPax, p.SupplierName
    FROM dbo.Trips t JOIN dbo.TemplateItems ti ON ti.TemplateId = t.TemplateId JOIN dbo.Places p ON p.PlaceId = ti.PlaceId
    WHERE t.TripId = @TripId ORDER BY ti.DayNo, ti.StartTime;
    SELECT p.PlaceId, p.Code AS PlaceCode, p.Name AS PlaceName, p.Category, p.OpenTime, p.CloseTime, p.WheelchairAccessible, p.CostPerPax, p.SupplierName
    FROM dbo.Places p JOIN dbo.Trips t ON t.RegionId = p.RegionId WHERE t.TripId = @TripId AND p.IsActive = 1;
    SELECT Code, RuleType, Value FROM dbo.TravelConstraints WHERE IsActive = 1;
END;
GO
/* @ItemsJson: [{"itemKey","dayNo","startTime":"09:30","durationMin","placeId","title","category","dependsOnItemKey","status","costPerPax"}] */
CREATE OR ALTER PROCEDURE dbo.usp_Itinerary_SaveVersion
    @TripId int, @Source varchar(20), @Summary nvarchar(1000), @ItemsJson nvarchar(max), @ProposalId int = NULL,
    @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF ISJSON(@ItemsJson) = 0 THROW 50041, 'validation_failed', 1;
    BEGIN TRAN;
    DECLARE @Cur int = (SELECT CurrentVersion FROM dbo.Trips WITH (UPDLOCK) WHERE TripId = @TripId);
    IF @Cur IS NULL THROW 50001, 'not_found', 1;
    INSERT dbo.ItineraryVersions(TripId, VersionNo, Source, Summary, ProposalId, CreatedBy) VALUES (@TripId, @Cur + 1, @Source, @Summary, @ProposalId, @ActorUserId);
    DECLARE @Vid int = SCOPE_IDENTITY();
    INSERT dbo.ItineraryItems(VersionId, ItemKey, DayNo, StartTime, DurationMin, PlaceId, Title, Category, DependsOnItemKey, Status, CostPerPax)
    SELECT @Vid, itemKey, dayNo, CAST(startTime AS time(0)), durationMin, placeId, title, category, NULLIF(dependsOnItemKey, ''), ISNULL(status, 'Planned'), costPerPax
    FROM OPENJSON(@ItemsJson) WITH (itemKey varchar(30), dayNo int, startTime varchar(8), durationMin int, placeId int, title nvarchar(150),
                                    category varchar(20), dependsOnItemKey varchar(30), status varchar(20), costPerPax decimal(10,2));
    IF NOT EXISTS (SELECT 1 FROM dbo.ItineraryItems WHERE VersionId = @Vid) THROW 50041, 'items_required', 1;
    UPDATE dbo.Trips SET CurrentVersion = @Cur + 1, Status = 'Active', UpdatedAtUtc = SYSUTCDATETIME() WHERE TripId = @TripId;
    DECLARE @Ref nvarchar(20) = (SELECT TripRef FROM dbo.Trips WHERE TripId = @TripId), @d nvarchar(200);
    SET @d = (SELECT @Cur + 1 AS version, @Source AS source FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Itinerary.VersionSaved', 'Trip', @Ref, @d, @CorrelationId, NULL;
    COMMIT;
    SELECT @Vid AS VersionId, @Cur + 1 AS VersionNo;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Trip_ListForTraveler @TravelerUserId uniqueidentifier AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.TripId, t.TripRef, t.Name, r.Name AS RegionName, r.ImageUrl AS RegionImageUrl, t.StartDate, t.Days, t.Pax, t.CurrentVersion, t.Status, t.IsDemo,
           (SELECT COUNT(*) FROM dbo.RecoveryProposals p WHERE p.TripId = t.TripId AND p.Status = 'PendingReview') AS PendingProposals
    FROM dbo.Trips t JOIN dbo.Regions r ON r.RegionId = t.RegionId WHERE t.TravelerUserId = @TravelerUserId ORDER BY t.StartDate;
END;
GO
/* Shared reader for trip detail. @TravelerUserId set = traveler scope (other people's trips return nothing). */
CREATE OR ALTER PROCEDURE dbo.usp_Trip_Get @TripId int, @TravelerUserId uniqueidentifier = NULL, @VersionNo int = NULL AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Trips WHERE TripId = @TripId AND (@TravelerUserId IS NULL OR TravelerUserId = @TravelerUserId)) RETURN;
    SELECT t.TripId, t.TripRef, t.TravelerUserId, dbo.fn_MaskEmail(u.Email) AS TravelerEmailMasked, u.DisplayName AS TravelerName, t.Name, t.RegionId,
           r.Name AS RegionName, r.ImageUrl AS RegionImageUrl, t.TemplateId, t.StartDate, t.Days, t.Pax, t.Pace, t.MobilityNeeds, t.BudgetPerPax, t.Notes, t.CurrentVersion, t.Status, t.IsDemo, t.RowVersion
    FROM dbo.Trips t JOIN dbo.Regions r ON r.RegionId = t.RegionId JOIN dbo.Users u ON u.UserId = t.TravelerUserId WHERE t.TripId = @TripId;
    DECLARE @V int = ISNULL(@VersionNo, (SELECT CurrentVersion FROM dbo.Trips WHERE TripId = @TripId));
    SELECT v.VersionId, v.VersionNo, v.Source, v.Summary, v.ProposalId, v.CreatedAtUtc FROM dbo.ItineraryVersions v WHERE v.TripId = @TripId ORDER BY v.VersionNo;
    SELECT i.ItemId, i.ItemKey, i.DayNo, CONVERT(char(5), i.StartTime, 108) AS StartTime, i.DurationMin, i.PlaceId, p.Code AS PlaceCode, p.Name AS PlaceName,
           i.Title, i.Category, i.DependsOnItemKey, i.Status, i.CostPerPax, p.SupplierName, p.WheelchairAccessible
    FROM dbo.ItineraryItems i JOIN dbo.ItineraryVersions v ON v.VersionId = i.VersionId JOIN dbo.Places p ON p.PlaceId = i.PlaceId
    WHERE v.TripId = @TripId AND v.VersionNo = @V ORDER BY i.DayNo, i.StartTime;
    SELECT p.ProposalId, p.ProposalRef, p.Status, p.ExplanationSource, p.CostImpactPerPax, p.CreatedAtUtc, p.DecidedAtUtc
    FROM dbo.RecoveryProposals p WHERE p.TripId = @TripId ORDER BY p.ProposalId DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Trip_List @Search nvarchar(100) = NULL, @Status varchar(20) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.TripId, t.TripRef, t.Name, u.DisplayName AS TravelerName, dbo.fn_MaskEmail(u.Email) AS TravelerEmailMasked, r.Name AS RegionName,
           t.StartDate, t.Days, t.Pax, t.MobilityNeeds, t.CurrentVersion, t.Status, t.IsDemo,
           (SELECT COUNT(*) FROM dbo.RecoveryProposals p WHERE p.TripId = t.TripId AND p.Status = 'PendingReview') AS PendingProposals
    FROM dbo.Trips t JOIN dbo.Users u ON u.UserId = t.TravelerUserId JOIN dbo.Regions r ON r.RegionId = t.RegionId
    WHERE (@Search IS NULL OR t.TripRef LIKE '%' + @Search + '%' OR t.Name LIKE '%' + @Search + '%' OR u.DisplayName LIKE '%' + @Search + '%')
      AND (@Status IS NULL OR t.Status = @Status)
    ORDER BY t.StartDate;
END;
GO
/* ---------------- SCENARIOS, CONSTRAINTS, TEMPLATES ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Scenario_List AS
BEGIN
    SET NOCOUNT ON;
    SELECT s.ScenarioId, s.Code, s.Name, s.RegionId, r.Name AS RegionName, s.AffectedCategories, s.Effect, s.DelayMinutes, s.DayNo, s.Description,
           s.IsActive, s.IsDemo, s.RowVersion
    FROM dbo.DisruptionScenarios s LEFT JOIN dbo.Regions r ON r.RegionId = s.RegionId ORDER BY s.Code;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Scenario_Upsert
    @ScenarioId int = NULL, @Code varchar(30), @Name nvarchar(150), @RegionId int = NULL, @AffectedCategories varchar(200), @Effect varchar(10),
    @DelayMinutes int, @DayNo int = NULL, @Description nvarchar(500) = NULL, @IsActive bit, @RowVersion binary(8) = NULL,
    @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF EXISTS (SELECT 1 FROM dbo.DisruptionScenarios WHERE Code = @Code AND ScenarioId <> ISNULL(@ScenarioId, -1)) THROW 50012, 'duplicate_key', 1;
    IF EXISTS (SELECT 1 FROM STRING_SPLIT(@AffectedCategories, ',') s WHERE LTRIM(s.value) NOT IN ('Outdoor','Indoor','Rail','Coach','Hotel','Meal')) THROW 50041, 'invalid_category', 1;
    BEGIN TRAN;
    IF @ScenarioId IS NULL
    BEGIN
        INSERT dbo.DisruptionScenarios(Code, Name, RegionId, AffectedCategories, Effect, DelayMinutes, DayNo, Description, IsActive)
        VALUES (@Code, @Name, @RegionId, @AffectedCategories, @Effect, @DelayMinutes, @DayNo, @Description, @IsActive);
        SET @ScenarioId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        DECLARE @Rv binary(8) = (SELECT RowVersion FROM dbo.DisruptionScenarios WITH (UPDLOCK) WHERE ScenarioId = @ScenarioId);
        IF @Rv IS NULL THROW 50001, 'not_found', 1;
        IF @RowVersion IS NOT NULL AND @Rv <> @RowVersion THROW 50009, 'concurrency_conflict', 1;
        UPDATE dbo.DisruptionScenarios SET Code = @Code, Name = @Name, RegionId = @RegionId, AffectedCategories = @AffectedCategories, Effect = @Effect,
               DelayMinutes = @DelayMinutes, DayNo = @DayNo, Description = @Description, IsActive = @IsActive WHERE ScenarioId = @ScenarioId;
    END
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Scenario.Saved', 'Scenario', @Code, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT @ScenarioId AS ScenarioId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Constraints_List AS
BEGIN
    SET NOCOUNT ON;
    SELECT ConstraintId, Code, Name, RuleType, Value, IsActive, RowVersion FROM dbo.TravelConstraints ORDER BY Code;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Constraints_Update @ConstraintId int, @Value nvarchar(50), @IsActive bit, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    UPDATE dbo.TravelConstraints SET Value = @Value, IsActive = @IsActive WHERE ConstraintId = @ConstraintId;
    IF @@ROWCOUNT = 0 THROW 50001, 'not_found', 1;
    DECLARE @id nvarchar(20) = CAST(@ConstraintId AS nvarchar(20));
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Constraint.Changed', 'TravelConstraint', @id, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Template_List AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.TemplateId, t.Code, t.Name, t.RegionId, r.Name AS RegionName, t.Days, t.Pace, t.Description, t.IsActive, t.IsDemo, t.RowVersion
    FROM dbo.ItineraryTemplates t JOIN dbo.Regions r ON r.RegionId = t.RegionId ORDER BY t.Code;
    SELECT ti.TemplateId, ti.ItemKey, ti.DayNo, CONVERT(char(5), ti.StartTime, 108) AS StartTime, ti.DurationMin, ti.PlaceId, p.Name AS PlaceName, p.Category, ti.DependsOnItemKey
    FROM dbo.TemplateItems ti JOIN dbo.Places p ON p.PlaceId = ti.PlaceId ORDER BY ti.TemplateId, ti.DayNo, ti.StartTime;
    SELECT p.PlaceId, p.Code, p.Name, p.RegionId, p.Category, CONVERT(char(5), p.OpenTime, 108) AS OpenTime, CONVERT(char(5), p.CloseTime, 108) AS CloseTime,
           p.WheelchairAccessible, p.CostPerPax, p.SupplierName, p.IsDemo
    FROM dbo.Places p WHERE p.IsActive = 1 ORDER BY p.RegionId, p.Category, p.Name;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Template_Upsert
    @TemplateId int = NULL, @Code varchar(30), @Name nvarchar(150), @RegionId int, @Days int, @Pace varchar(10), @Description nvarchar(1000) = NULL,
    @IsActive bit, @RowVersion binary(8) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF EXISTS (SELECT 1 FROM dbo.ItineraryTemplates WHERE Code = @Code AND TemplateId <> ISNULL(@TemplateId, -1)) THROW 50012, 'duplicate_key', 1;
    BEGIN TRAN;
    IF @TemplateId IS NULL
    BEGIN
        INSERT dbo.ItineraryTemplates(Code, Name, RegionId, Days, Pace, Description, IsActive) VALUES (@Code, @Name, @RegionId, @Days, @Pace, @Description, @IsActive);
        SET @TemplateId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        DECLARE @Rv binary(8) = (SELECT RowVersion FROM dbo.ItineraryTemplates WITH (UPDLOCK) WHERE TemplateId = @TemplateId);
        IF @Rv IS NULL THROW 50001, 'not_found', 1;
        IF @RowVersion IS NOT NULL AND @Rv <> @RowVersion THROW 50009, 'concurrency_conflict', 1;
        UPDATE dbo.ItineraryTemplates SET Code = @Code, Name = @Name, RegionId = @RegionId, Days = @Days, Pace = @Pace, Description = @Description, IsActive = @IsActive
        WHERE TemplateId = @TemplateId;
    END
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Template.Saved', 'ItineraryTemplate', @Code, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT @TemplateId AS TemplateId;
END;
GO
/* ---------------- SIMULATION & PROPOSALS ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Sim_Inputs @TripId int, @ScenarioId int AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.TripId, t.TripRef, t.RegionId, t.StartDate, t.Days, t.Pax, t.Pace, t.MobilityNeeds, t.BudgetPerPax, t.CurrentVersion,
           (SELECT v.VersionId FROM dbo.ItineraryVersions v WHERE v.TripId = t.TripId AND v.VersionNo = t.CurrentVersion) AS VersionId
    FROM dbo.Trips t WHERE t.TripId = @TripId;
    SELECT i.ItemKey, i.DayNo, CONVERT(char(5), i.StartTime, 108) AS StartTime, i.DurationMin, i.PlaceId, p.Code AS PlaceCode, p.Name AS PlaceName,
           i.Title, i.Category, i.DependsOnItemKey, i.Status, i.CostPerPax, CONVERT(char(5), p.OpenTime, 108) AS OpenTime, CONVERT(char(5), p.CloseTime, 108) AS CloseTime,
           p.WheelchairAccessible, p.SupplierName
    FROM dbo.Trips t JOIN dbo.ItineraryVersions v ON v.TripId = t.TripId AND v.VersionNo = t.CurrentVersion
    JOIN dbo.ItineraryItems i ON i.VersionId = v.VersionId JOIN dbo.Places p ON p.PlaceId = i.PlaceId
    WHERE t.TripId = @TripId ORDER BY i.DayNo, i.StartTime;
    SELECT ScenarioId, Code, Name, RegionId, AffectedCategories, Effect, DelayMinutes, DayNo FROM dbo.DisruptionScenarios WHERE ScenarioId = @ScenarioId AND IsActive = 1;
    SELECT p.PlaceId, p.Code AS PlaceCode, p.Name AS PlaceName, p.Category, CONVERT(char(5), p.OpenTime, 108) AS OpenTime, CONVERT(char(5), p.CloseTime, 108) AS CloseTime,
           p.WheelchairAccessible, p.CostPerPax, p.SupplierName
    FROM dbo.Places p JOIN dbo.Trips t ON t.RegionId = p.RegionId WHERE t.TripId = @TripId AND p.IsActive = 1;
    SELECT Code, RuleType, Value FROM dbo.TravelConstraints WHERE IsActive = 1;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Sim_Save
    @TripId int, @VersionId int, @ScenarioId int, @ImpactJson nvarchar(max), @ImpactCount int, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF ISJSON(@ImpactJson) = 0 THROW 50041, 'validation_failed', 1;
    BEGIN TRAN;
    INSERT dbo.Simulations(TripId, VersionId, ScenarioId, ImpactJson, ImpactCount, RunBy) VALUES (@TripId, @VersionId, @ScenarioId, @ImpactJson, @ImpactCount, @ActorUserId);
    DECLARE @Id int = SCOPE_IDENTITY();
    IF @ImpactCount > 0 UPDATE dbo.Trips SET Status = 'Disrupted', UpdatedAtUtc = SYSUTCDATETIME() WHERE TripId = @TripId;
    DECLARE @Ref nvarchar(20) = (SELECT TripRef FROM dbo.Trips WHERE TripId = @TripId), @d nvarchar(200);
    SET @d = (SELECT @ScenarioId AS scenarioId, @ImpactCount AS impacted FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Simulation.Run', 'Trip', @Ref, @d, @CorrelationId, NULL;
    COMMIT;
    SELECT @Id AS SimulationId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Sim_Get @SimulationId int AS
BEGIN
    SET NOCOUNT ON;
    SELECT s.SimulationId, s.TripId, s.VersionId, s.ScenarioId, sc.Code AS ScenarioCode, sc.Name AS ScenarioName, s.ImpactJson, s.ImpactCount, s.RunBy, s.RunAtUtc
    FROM dbo.Simulations s JOIN dbo.DisruptionScenarios sc ON sc.ScenarioId = s.ScenarioId WHERE s.SimulationId = @SimulationId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Proposal_Save
    @SimulationId int, @TripId int, @BaseVersionId int, @ChangesJson nvarchar(max), @Explanation nvarchar(4000), @ExplanationSource varchar(20),
    @ValidationJson nvarchar(max), @CostImpactPerPax decimal(10,2), @PromptId int = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF ISJSON(@ChangesJson) = 0 OR ISJSON(@ValidationJson) = 0 THROW 50041, 'validation_failed', 1;
    BEGIN TRAN;
    UPDATE dbo.RecoveryProposals SET Status = 'Superseded' WHERE TripId = @TripId AND Status = 'PendingReview';
    INSERT dbo.RecoveryProposals(SimulationId, TripId, BaseVersionId, Status, ChangesJson, Explanation, ExplanationSource, ValidationJson, CostImpactPerPax, PromptId, ProposedBy)
    VALUES (@SimulationId, @TripId, @BaseVersionId, 'PendingReview', @ChangesJson, @Explanation, @ExplanationSource, @ValidationJson, @CostImpactPerPax, @PromptId, @ActorUserId);
    DECLARE @Id int = SCOPE_IDENTITY();
    DECLARE @Ref nvarchar(20) = (SELECT ProposalRef FROM dbo.RecoveryProposals WHERE ProposalId = @Id);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Proposal.Created', 'RecoveryProposal', @Ref, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT ProposalId, ProposalRef, Status FROM dbo.RecoveryProposals WHERE ProposalId = @Id;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Proposal_List @Status varchar(20) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT p.ProposalId, p.ProposalRef, p.TripId, t.TripRef, t.Name AS TripName, p.Status, p.ExplanationSource, p.CostImpactPerPax, p.CreatedAtUtc,
           dbo.fn_MaskEmail(u.Email) AS ProposedByMasked, sc.Name AS ScenarioName
    FROM dbo.RecoveryProposals p JOIN dbo.Trips t ON t.TripId = p.TripId JOIN dbo.Users u ON u.UserId = p.ProposedBy
    JOIN dbo.Simulations s ON s.SimulationId = p.SimulationId JOIN dbo.DisruptionScenarios sc ON sc.ScenarioId = s.ScenarioId
    WHERE @Status IS NULL OR p.Status = @Status ORDER BY p.ProposalId DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Proposal_Get @ProposalId int AS
BEGIN
    SET NOCOUNT ON;
    SELECT p.ProposalId, p.ProposalRef, p.SimulationId, p.TripId, t.TripRef, t.Name AS TripName, t.Pax, t.CurrentVersion, p.BaseVersionId,
           v.VersionNo AS BaseVersionNo, p.Status, p.ChangesJson, p.Explanation, p.ExplanationSource, p.ValidationJson, p.CostImpactPerPax, p.PromptId,
           p.ProposedBy, dbo.fn_MaskEmail(u.Email) AS ProposedByMasked, p.DecidedAtUtc, p.DecisionComment, p.CreatedAtUtc, p.RowVersion,
           s.ImpactJson, sc.Name AS ScenarioName
    FROM dbo.RecoveryProposals p JOIN dbo.Trips t ON t.TripId = p.TripId JOIN dbo.ItineraryVersions v ON v.VersionId = p.BaseVersionId
    JOIN dbo.Users u ON u.UserId = p.ProposedBy JOIN dbo.Simulations s ON s.SimulationId = p.SimulationId JOIN dbo.DisruptionScenarios sc ON sc.ScenarioId = s.ScenarioId
    WHERE p.ProposalId = @ProposalId;
    SELECT i.ItemKey, i.DayNo, CONVERT(char(5), i.StartTime, 108) AS StartTime, i.DurationMin, i.PlaceId, p.Code AS PlaceCode, p.Name AS PlaceName,
           i.Title, i.Category, i.DependsOnItemKey, i.Status, i.CostPerPax, CONVERT(char(5), p.OpenTime, 108) AS OpenTime, CONVERT(char(5), p.CloseTime, 108) AS CloseTime,
           p.WheelchairAccessible, p.SupplierName
    FROM dbo.RecoveryProposals rp JOIN dbo.ItineraryItems i ON i.VersionId = rp.BaseVersionId JOIN dbo.Places p ON p.PlaceId = i.PlaceId
    WHERE rp.ProposalId = @ProposalId ORDER BY i.DayNo, i.StartTime;
END;
GO
/* Human approval. Approve = new itinerary version from @NewItemsJson (built by the API from base + validated changes). */
CREATE OR ALTER PROCEDURE dbo.usp_Proposal_Decide
    @ProposalId int, @Decision varchar(20), @Comment nvarchar(500) = NULL, @NewItemsJson nvarchar(max) = NULL, @RowVersion binary(8) = NULL,
    @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @St varchar(20), @Trip int, @Base int, @By uniqueidentifier, @Rv binary(8), @Ref nvarchar(20);
    BEGIN TRAN;
    SELECT @St = Status, @Trip = TripId, @Base = BaseVersionId, @By = ProposedBy, @Rv = RowVersion, @Ref = ProposalRef
    FROM dbo.RecoveryProposals WITH (UPDLOCK, HOLDLOCK) WHERE ProposalId = @ProposalId;
    IF @St IS NULL THROW 50001, 'not_found', 1;
    IF @RowVersion IS NOT NULL AND @Rv <> @RowVersion THROW 50009, 'concurrency_conflict', 1;
    IF @St <> 'PendingReview' THROW 50031, 'invalid_state', 1;
    IF @By = @ActorUserId THROW 50032, 'self_approval', 1;
    IF @Decision = 'Rejected' AND NULLIF(LTRIM(@Comment), '') IS NULL THROW 50041, 'comment_required', 1;
    IF @Decision = 'Approved'
    BEGIN
        IF (SELECT v.VersionId FROM dbo.Trips t JOIN dbo.ItineraryVersions v ON v.TripId = t.TripId AND v.VersionNo = t.CurrentVersion WHERE t.TripId = @Trip) <> @Base
            THROW 50038, 'stale_version', 1;
        DECLARE @Summary nvarchar(1000) = N'Recovery ' + @Ref + N' approved';
        DECLARE @Out TABLE (VersionId int, VersionNo int);
        INSERT @Out EXEC dbo.usp_Itinerary_SaveVersion @Trip, 'Recovery', @Summary, @NewItemsJson, @ProposalId, @ActorUserId, @CorrelationId;
    END
    ELSE IF @Decision <> 'Rejected' THROW 50041, 'validation_failed', 1;
    UPDATE dbo.RecoveryProposals SET Status = @Decision, DecidedBy = @ActorUserId, DecidedAtUtc = SYSUTCDATETIME(), DecisionComment = @Comment WHERE ProposalId = @ProposalId;
    IF @Decision = 'Rejected' AND NOT EXISTS (SELECT 1 FROM dbo.RecoveryProposals WHERE TripId = @Trip AND Status = 'PendingReview')
        UPDATE dbo.Trips SET Status = 'Disrupted' WHERE TripId = @Trip;
    DECLARE @a varchar(60) = 'Proposal.' + @Decision;
    EXEC dbo.usp_Audit_Write @ActorUserId, @a, 'RecoveryProposal', @Ref, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT ProposalId, Status, (SELECT CurrentVersion FROM dbo.Trips WHERE TripId = @Trip) AS CurrentVersion FROM dbo.RecoveryProposals WHERE ProposalId = @ProposalId;
END;
GO
/* ---------------- PERMISSION-SCOPED SEARCH (the model never writes SQL) ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Search_Trips
    @UserId uniqueidentifier, @CanViewAll bit, @RegionCode varchar(20) = NULL, @SupplierText nvarchar(100) = NULL, @Month date = NULL,
    @Mobility varchar(20) = NULL, @Status varchar(20) = NULL, @Text nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (50) t.TripId, t.TripRef, t.Name, r.Name AS RegionName, t.StartDate, t.Days, t.Pax, t.MobilityNeeds, t.Status, t.IsDemo,
           (SELECT STRING_AGG(x.SupplierName, ', ') FROM (SELECT DISTINCT p.SupplierName FROM dbo.ItineraryVersions v JOIN dbo.ItineraryItems i ON i.VersionId = v.VersionId
                   JOIN dbo.Places p ON p.PlaceId = i.PlaceId WHERE v.TripId = t.TripId AND v.VersionNo = t.CurrentVersion AND p.SupplierName IS NOT NULL) x) AS Suppliers
    FROM dbo.Trips t JOIN dbo.Regions r ON r.RegionId = t.RegionId
    WHERE (@CanViewAll = 1 OR t.TravelerUserId = @UserId)                     -- row scope first
      AND (@RegionCode IS NULL OR r.Code = @RegionCode)
      AND (@Month IS NULL OR (t.StartDate >= @Month AND t.StartDate < DATEADD(MONTH, 1, @Month)))
      AND (@Mobility IS NULL OR t.MobilityNeeds = @Mobility)
      AND (@Status IS NULL OR t.Status = @Status)
      AND (@Text IS NULL OR t.Name LIKE '%' + @Text + '%' OR t.TripRef LIKE '%' + @Text + '%')
      AND (@SupplierText IS NULL OR EXISTS (SELECT 1 FROM dbo.ItineraryVersions v JOIN dbo.ItineraryItems i ON i.VersionId = v.VersionId
                                             JOIN dbo.Places p ON p.PlaceId = i.PlaceId
                                             WHERE v.TripId = t.TripId AND v.VersionNo = t.CurrentVersion AND p.SupplierName LIKE '%' + @SupplierText + '%'))
    ORDER BY t.StartDate;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Search_Vocabulary AS
BEGIN
    SET NOCOUNT ON;
    SELECT Code, Name FROM dbo.Regions;
    SELECT DISTINCT SupplierName FROM dbo.Places WHERE SupplierName IS NOT NULL;
END;
GO
/* ---------------- DOCUMENTS ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Doc_Create
    @OriginalName nvarchar(200), @StoredName varchar(80), @ContentType varchar(60), @SizeBytes int, @Sha256 char(64), @DocType varchar(30),
    @RedactedText nvarchar(max), @RedactionCount int, @FieldsJson nvarchar(max), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    INSERT dbo.Documents(OriginalName, StoredName, ContentType, SizeBytes, Sha256, DocType, Status, RedactedText, RedactionCount, UploadedBy)
    VALUES (@OriginalName, @StoredName, @ContentType, @SizeBytes, @Sha256, @DocType, 'Extracted', @RedactedText, @RedactionCount, @ActorUserId);
    DECLARE @Id int = SCOPE_IDENTITY();
    INSERT dbo.DocumentFields(DocumentId, FieldName, Value, Confidence, Method, SpanStart, SpanLength)
    SELECT @Id, fieldName, value, confidence, method, spanStart, spanLength
    FROM OPENJSON(@FieldsJson) WITH (fieldName varchar(50), value nvarchar(300), confidence decimal(4,3), method varchar(20), spanStart int, spanLength int);
    DECLARE @Ref nvarchar(20) = (SELECT DocumentRef FROM dbo.Documents WHERE DocumentId = @Id);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Document.Uploaded', 'Document', @Ref, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT DocumentId, DocumentRef FROM dbo.Documents WHERE DocumentId = @Id;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Doc_List @Status varchar(20) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT d.DocumentId, d.DocumentRef, d.OriginalName, d.DocType, d.Status, d.SizeBytes, d.RedactionCount, d.UploadedAtUtc, d.TripId, t.TripRef, d.IsDemo,
           (SELECT COUNT(*) FROM dbo.DocumentFields f WHERE f.DocumentId = d.DocumentId) AS FieldCount,
           (SELECT CAST(AVG(f.Confidence) AS decimal(4,3)) FROM dbo.DocumentFields f WHERE f.DocumentId = d.DocumentId) AS AvgConfidence
    FROM dbo.Documents d LEFT JOIN dbo.Trips t ON t.TripId = d.TripId
    WHERE @Status IS NULL OR d.Status = @Status ORDER BY d.DocumentId DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Doc_Get @DocumentId int AS
BEGIN
    SET NOCOUNT ON;
    SELECT d.DocumentId, d.DocumentRef, d.OriginalName, d.ContentType, d.SizeBytes, d.Sha256, d.DocType, d.Status, d.TripId, d.RedactedText, d.RedactionCount,
           d.UploadedAtUtc, dbo.fn_MaskEmail(u.Email) AS UploadedByMasked, d.ReviewComment, d.IsDemo, d.RowVersion
    FROM dbo.Documents d JOIN dbo.Users u ON u.UserId = d.UploadedBy WHERE d.DocumentId = @DocumentId;
    SELECT FieldId, FieldName, Value, Confidence, Method, SpanStart, SpanLength, ReviewedValue FROM dbo.DocumentFields WHERE DocumentId = @DocumentId ORDER BY FieldName;
END;
GO
/* @FieldsJson: [{"fieldName","reviewedValue"}] */
CREATE OR ALTER PROCEDURE dbo.usp_Doc_Review
    @DocumentId int, @Decision varchar(20), @TripId int = NULL, @FieldsJson nvarchar(max) = NULL, @Comment nvarchar(500) = NULL,
    @RowVersion binary(8) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @St varchar(20), @Rv binary(8), @Ref nvarchar(20);
    BEGIN TRAN;
    SELECT @St = Status, @Rv = RowVersion, @Ref = DocumentRef FROM dbo.Documents WITH (UPDLOCK) WHERE DocumentId = @DocumentId;
    IF @St IS NULL THROW 50001, 'not_found', 1;
    IF @RowVersion IS NOT NULL AND @Rv <> @RowVersion THROW 50009, 'concurrency_conflict', 1;
    IF @St <> 'Extracted' THROW 50031, 'invalid_state', 1;
    IF @Decision = 'Accepted'
    BEGIN
        IF @TripId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.Trips WHERE TripId = @TripId) THROW 50041, 'trip_required', 1;
        UPDATE f SET ReviewedValue = j.reviewedValue FROM dbo.DocumentFields f
        JOIN OPENJSON(ISNULL(@FieldsJson, '[]')) WITH (fieldName varchar(50), reviewedValue nvarchar(300)) j ON j.fieldName = f.FieldName
        WHERE f.DocumentId = @DocumentId;
        UPDATE dbo.DocumentFields SET ReviewedValue = ISNULL(ReviewedValue, Value) WHERE DocumentId = @DocumentId;
    END
    ELSE IF @Decision = 'Rejected'
    BEGIN
        IF NULLIF(LTRIM(@Comment), '') IS NULL THROW 50041, 'comment_required', 1;
    END
    ELSE THROW 50041, 'validation_failed', 1;
    UPDATE dbo.Documents SET Status = @Decision, TripId = CASE WHEN @Decision = 'Accepted' THEN @TripId ELSE TripId END, ReviewedBy = @ActorUserId,
           ReviewedAtUtc = SYSUTCDATETIME(), ReviewComment = @Comment WHERE DocumentId = @DocumentId;
    DECLARE @a varchar(60) = 'Document.' + @Decision;
    EXEC dbo.usp_Audit_Write @ActorUserId, @a, 'Document', @Ref, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
/* ---------------- PROMPTS, USAGE, EVALS ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Prompt_List AS
BEGIN
    SET NOCOUNT ON;
    SELECT p.PromptId, p.PromptKey, p.Version, p.Body, p.IsActive, p.CreatedAtUtc, dbo.fn_MaskEmail(u.Email) AS CreatedByMasked
    FROM dbo.PromptTemplates p LEFT JOIN dbo.Users u ON u.UserId = p.CreatedBy ORDER BY p.PromptKey, p.Version DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Prompt_GetActive @PromptKey varchar(60) AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (1) PromptId, PromptKey, Version, Body FROM dbo.PromptTemplates WHERE PromptKey = @PromptKey AND IsActive = 1 ORDER BY Version DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Prompt_SaveVersion @PromptKey varchar(60), @Body nvarchar(max), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.PromptTemplates WHERE PromptKey = @PromptKey) THROW 50001, 'not_found', 1;
    BEGIN TRAN;
    DECLARE @V int = (SELECT MAX(Version) FROM dbo.PromptTemplates WITH (UPDLOCK) WHERE PromptKey = @PromptKey) + 1;
    UPDATE dbo.PromptTemplates SET IsActive = 0 WHERE PromptKey = @PromptKey;
    INSERT dbo.PromptTemplates(PromptKey, Version, Body, CreatedBy) VALUES (@PromptKey, @V, @Body, @ActorUserId);
    DECLARE @d nvarchar(50) = N'{"version":' + CAST(@V AS nvarchar(10)) + N'}';
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Prompt.VersionSaved', 'PromptTemplate', @PromptKey, @d, @CorrelationId, NULL;
    COMMIT;
    SELECT SCOPE_IDENTITY() AS PromptId, @V AS Version;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AiUsage_Write
    @Feature varchar(50), @Provider varchar(30), @Model varchar(60) = NULL, @InputTokens int, @OutputTokens int, @CostUsd decimal(10,6), @LatencyMs int,
    @Outcome varchar(30), @PromptId int = NULL, @UserId uniqueidentifier = NULL, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT dbo.AiUsageLogs(Feature, Provider, Model, InputTokens, OutputTokens, CostUsd, LatencyMs, Outcome, PromptId, UserId, CorrelationId)
    VALUES (@Feature, @Provider, @Model, @InputTokens, @OutputTokens, @CostUsd, @LatencyMs, @Outcome, @PromptId, @UserId, @CorrelationId);
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AiUsage_MonthCost AS
BEGIN
    SET NOCOUNT ON;
    SELECT ISNULL(SUM(CostUsd), 0) AS CostUsd FROM dbo.AiUsageLogs WHERE OccurredAtUtc >= DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1);
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AiUsage_List @FromUtc datetime2(3) = NULL, @ToUtc datetime2(3) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (200) UsageId, OccurredAtUtc, Feature, Provider, Model, InputTokens, OutputTokens, CostUsd, LatencyMs, Outcome, PromptId, CorrelationId
    FROM dbo.AiUsageLogs WHERE (@FromUtc IS NULL OR OccurredAtUtc >= @FromUtc) AND (@ToUtc IS NULL OR OccurredAtUtc < @ToUtc) ORDER BY UsageId DESC;
    SELECT Feature, Outcome, COUNT(*) AS Calls, SUM(InputTokens) AS InputTokens, SUM(OutputTokens) AS OutputTokens, SUM(CostUsd) AS CostUsd
    FROM dbo.AiUsageLogs WHERE (@FromUtc IS NULL OR OccurredAtUtc >= @FromUtc) AND (@ToUtc IS NULL OR OccurredAtUtc < @ToUtc)
    GROUP BY Feature, Outcome ORDER BY Feature, Outcome;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Eval_Cases AS
BEGIN
    SET NOCOUNT ON;
    SELECT CaseId, Code, Name, Kind, InputJson, ExpectedJson FROM dbo.EvalCases WHERE IsActive = 1 ORDER BY Code;
END;
GO
/* @ResultsJson: [{"caseId","passed","detail"}] */
CREATE OR ALTER PROCEDURE dbo.usp_Eval_SaveRun
    @Total int, @Passed int, @GroundingScore decimal(4,3), @UsedModel varchar(60) = NULL, @ResultsJson nvarchar(max), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    INSERT dbo.EvalRuns(RunBy, Total, Passed, GroundingScore, UsedModel) VALUES (@ActorUserId, @Total, @Passed, @GroundingScore, @UsedModel);
    DECLARE @Run int = SCOPE_IDENTITY();
    INSERT dbo.EvalResults(RunId, CaseId, Passed, Detail)
    SELECT @Run, caseId, passed, detail FROM OPENJSON(@ResultsJson) WITH (caseId int, passed bit, detail nvarchar(1000));
    DECLARE @id nvarchar(20) = CAST(@Run AS nvarchar(20));
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Eval.Run', 'EvalRun', @id, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT @Run AS RunId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Eval_Runs AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (20) RunId, RunAtUtc, Total, Passed, GroundingScore, UsedModel FROM dbo.EvalRuns ORDER BY RunId DESC;
    DECLARE @Last int = (SELECT MAX(RunId) FROM dbo.EvalRuns);
    SELECT r.ResultId, r.RunId, c.Code, c.Name, c.Kind, r.Passed, r.Detail, r.HumanFeedback FROM dbo.EvalResults r JOIN dbo.EvalCases c ON c.CaseId = r.CaseId
    WHERE r.RunId = @Last ORDER BY c.Code;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Eval_Feedback @ResultId int, @Feedback nvarchar(500), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.EvalResults SET HumanFeedback = @Feedback, FeedbackBy = @ActorUserId WHERE ResultId = @ResultId;
    IF @@ROWCOUNT = 0 THROW 50001, 'not_found', 1;
    DECLARE @id nvarchar(20) = CAST(@ResultId AS nvarchar(20));
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Eval.Feedback', 'EvalResult', @id, NULL, @CorrelationId, NULL;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AiOps_Dashboard AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        (SELECT COUNT(*) FROM dbo.Trips WHERE Status IN ('Active','Disrupted')) AS ActiveTrips,
        (SELECT COUNT(*) FROM dbo.Trips WHERE Status = 'Disrupted') AS DisruptedTrips,
        (SELECT COUNT(*) FROM dbo.RecoveryProposals WHERE Status = 'PendingReview') AS PendingProposals,
        (SELECT COUNT(*) FROM dbo.Documents WHERE Status = 'Extracted') AS DocumentsToReview,
        (SELECT ISNULL(SUM(CostUsd), 0) FROM dbo.AiUsageLogs WHERE OccurredAtUtc >= DATEADD(DAY, -30, SYSUTCDATETIME())) AS AiCost30d,
        (SELECT COUNT(*) FROM dbo.AiUsageLogs WHERE OccurredAtUtc >= DATEADD(DAY, -30, SYSUTCDATETIME()) AND Outcome <> 'ok') AS AiFallbacks30d,
        (SELECT TOP (1) GroundingScore FROM dbo.EvalRuns ORDER BY RunId DESC) AS LastGroundingScore,
        (SELECT TOP (1) CAST(Passed AS varchar(5)) + '/' + CAST(Total AS varchar(5)) FROM dbo.EvalRuns ORDER BY RunId DESC) AS LastEvalResult;
    SELECT TOP (8) p.ProposalId, p.ProposalRef, t.TripRef, p.Status, p.CreatedAtUtc FROM dbo.RecoveryProposals p JOIN dbo.Trips t ON t.TripId = p.TripId ORDER BY p.ProposalId DESC;
    SELECT r.Name AS RegionName, COUNT(*) AS Trips FROM dbo.Trips t JOIN dbo.Regions r ON r.RegionId = t.RegionId GROUP BY r.Name ORDER BY Trips DESC;
END;
GO
