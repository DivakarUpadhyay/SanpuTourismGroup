SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;   -- required by persisted computed columns and filtered indexes, even when run outside db-setup
GO
/* 111_customer_procs.sql — help center, contact, recommendations, calendar, compare, destination guides,
   promotions, coupons and the travel-services engine. Error contract: THROW 500xx with a code string. */

/* ================= COUPONS ================= */
/* Validates a coupon for a customer, order kind and amount; returns the discount. @Lock = 1 inside a booking transaction. */
CREATE OR ALTER PROCEDURE dbo.usp_Coupon_Evaluate
    @Code varchar(30), @UserId uniqueidentifier, @Kind varchar(10), @Amount decimal(12,2),
    @Discount decimal(12,2) OUTPUT, @CouponId int OUTPUT, @Lock bit = 0
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Type varchar(10), @Value decimal(12,2), @Max decimal(12,2), @Min decimal(12,2), @Applies varchar(10),
            @Start datetime2(3), @End datetime2(3), @Limit int, @PerCust int, @Used int, @Active bit;
    IF @Lock = 1
        SELECT @CouponId = CouponId, @Type = DiscountType, @Value = DiscountValue, @Max = MaxDiscount, @Min = MinAmount, @Applies = AppliesTo,
               @Start = StartsAtUtc, @End = EndsAtUtc, @Limit = UsageLimit, @PerCust = PerCustomerLimit, @Used = TimesUsed, @Active = IsActive
        FROM dbo.Coupons WITH (UPDLOCK, HOLDLOCK) WHERE Code = UPPER(@Code);
    ELSE
        SELECT @CouponId = CouponId, @Type = DiscountType, @Value = DiscountValue, @Max = MaxDiscount, @Min = MinAmount, @Applies = AppliesTo,
               @Start = StartsAtUtc, @End = EndsAtUtc, @Limit = UsageLimit, @PerCust = PerCustomerLimit, @Used = TimesUsed, @Active = IsActive
        FROM dbo.Coupons WHERE Code = UPPER(@Code);
    IF @CouponId IS NULL OR @Active = 0 THROW 50060, 'coupon_not_found', 1;
    IF SYSUTCDATETIME() < @Start OR SYSUTCDATETIME() >= @End THROW 50061, 'coupon_expired', 1;
    IF @Applies <> 'All' AND @Applies <> @Kind THROW 50064, 'coupon_not_applicable', 1;
    IF @Amount < @Min THROW 50062, 'coupon_min_amount', 1;
    IF @Limit IS NOT NULL AND @Used >= @Limit THROW 50063, 'coupon_limit_reached', 1;
    IF @UserId IS NOT NULL AND (SELECT COUNT(*) FROM dbo.CouponRedemptions WHERE CouponId = @CouponId AND CustomerUserId = @UserId) >= @PerCust
        THROW 50063, 'coupon_limit_reached', 1;
    SET @Discount = CASE WHEN @Type = 'Percent' THEN ROUND(@Amount * @Value / 100, 0) ELSE @Value END;
    IF @Max IS NOT NULL AND @Discount > @Max SET @Discount = @Max;
    IF @Discount > @Amount SET @Discount = @Amount;
END;
GO
/* Preview for the checkout form (no redemption). */
CREATE OR ALTER PROCEDURE dbo.usp_Coupon_Check @Code varchar(30), @UserId uniqueidentifier = NULL, @Kind varchar(10), @Amount decimal(12,2) AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Discount decimal(12,2), @CouponId int;
    EXEC dbo.usp_Coupon_Evaluate @Code, @UserId, @Kind, @Amount, @Discount OUTPUT, @CouponId OUTPUT, 0;
    SELECT c.Code, c.Description, @Discount AS DiscountAmount, @Amount - @Discount AS TotalAfter FROM dbo.Coupons c WHERE c.CouponId = @CouponId;
END;
GO
/* Gives a coupon use back when its order is rejected or cancelled. */
CREATE OR ALTER PROCEDURE dbo.usp_Coupon_Release @OrderType varchar(10), @OrderRef varchar(20) AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Cid int = (SELECT CouponId FROM dbo.CouponRedemptions WHERE OrderType = @OrderType AND OrderRef = @OrderRef);
    IF @Cid IS NULL RETURN;
    DELETE dbo.CouponRedemptions WHERE OrderType = @OrderType AND OrderRef = @OrderRef;
    UPDATE dbo.Coupons SET TimesUsed = CASE WHEN TimesUsed > 0 THEN TimesUsed - 1 ELSE 0 END WHERE CouponId = @Cid;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Coupons_Public AS
BEGIN
    SET NOCOUNT ON;
    SELECT Code, Description, DiscountType, DiscountValue, MaxDiscount, MinAmount, AppliesTo, StartsAtUtc, EndsAtUtc, UsageLimit, TimesUsed, PerCustomerLimit
    FROM dbo.Coupons WHERE IsPublic = 1 AND IsActive = 1 AND SYSUTCDATETIME() >= StartsAtUtc AND SYSUTCDATETIME() < EndsAtUtc
      AND (UsageLimit IS NULL OR TimesUsed < UsageLimit)
    ORDER BY EndsAtUtc;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Coupons_List AS
BEGIN
    SET NOCOUNT ON;
    SELECT c.CouponId, c.Code, c.Description, c.DiscountType, c.DiscountValue, c.MaxDiscount, c.MinAmount, c.AppliesTo, c.StartsAtUtc, c.EndsAtUtc,
           c.UsageLimit, c.PerCustomerLimit, c.TimesUsed, c.IsPublic, c.IsActive, c.RowVersion,
           ISNULL((SELECT SUM(r.DiscountAmount) FROM dbo.CouponRedemptions r WHERE r.CouponId = c.CouponId), 0) AS TotalDiscount
    FROM dbo.Coupons c ORDER BY c.IsActive DESC, c.EndsAtUtc DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Coupons_Upsert
    @CouponId int = NULL, @Code varchar(30), @Description nvarchar(200), @DiscountType varchar(10), @DiscountValue decimal(12,2), @MaxDiscount decimal(12,2) = NULL,
    @MinAmount decimal(12,2), @AppliesTo varchar(10), @StartsAtUtc datetime2(3), @EndsAtUtc datetime2(3), @UsageLimit int = NULL, @PerCustomerLimit int,
    @IsPublic bit, @IsActive bit, @RowVersion binary(8) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    SET @Code = UPPER(LTRIM(RTRIM(@Code)));
    BEGIN TRAN;
    IF @CouponId IS NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.Coupons WHERE Code = @Code) THROW 50013, 'duplicate_key', 1;
        INSERT dbo.Coupons(Code, Description, DiscountType, DiscountValue, MaxDiscount, MinAmount, AppliesTo, StartsAtUtc, EndsAtUtc, UsageLimit, PerCustomerLimit, IsPublic, IsActive)
        VALUES (@Code, @Description, @DiscountType, @DiscountValue, @MaxDiscount, @MinAmount, @AppliesTo, @StartsAtUtc, @EndsAtUtc, @UsageLimit, @PerCustomerLimit, @IsPublic, @IsActive);
        SET @CouponId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.Coupons SET Description = @Description, DiscountType = @DiscountType, DiscountValue = @DiscountValue, MaxDiscount = @MaxDiscount, MinAmount = @MinAmount,
               AppliesTo = @AppliesTo, StartsAtUtc = @StartsAtUtc, EndsAtUtc = @EndsAtUtc, UsageLimit = @UsageLimit, PerCustomerLimit = @PerCustomerLimit,
               IsPublic = @IsPublic, IsActive = @IsActive, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE CouponId = @CouponId AND (@RowVersion IS NULL OR RowVersion = @RowVersion);
        IF @@ROWCOUNT = 0
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.Coupons WHERE CouponId = @CouponId) THROW 50009, 'concurrency_conflict', 1;
            THROW 50001, 'not_found', 1;
        END
    END
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Coupon.Saved', 'Coupon', @Code, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT CouponId, Code FROM dbo.Coupons WHERE CouponId = @CouponId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Coupons_Redemptions @CouponId int AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 200 r.RedemptionId, r.OrderType, r.OrderRef, r.DiscountAmount, r.RedeemedAtUtc, u.DisplayName AS CustomerName
    FROM dbo.CouponRedemptions r JOIN dbo.Users u ON u.UserId = r.CustomerUserId WHERE r.CouponId = @CouponId ORDER BY r.RedeemedAtUtc DESC;
END;
GO

/* ================= PROMOTIONS (ad banners) ================= */
CREATE OR ALTER PROCEDURE dbo.usp_Promotions_Active @Placement varchar(20) AS
BEGIN
    SET NOCOUNT ON;
    SELECT p.PromotionId, p.Title, p.Subtitle, p.Placement, p.ImageUrl, p.CtaText, p.CtaUrl, p.CouponCode, p.Badge, p.EndsAtUtc
    FROM dbo.Promotions p
    WHERE p.Placement = @Placement AND p.IsActive = 1 AND SYSUTCDATETIME() >= p.StartsAtUtc AND SYSUTCDATETIME() < p.EndsAtUtc
    ORDER BY p.Priority DESC, p.EndsAtUtc;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Promotions_Track @PromotionId int, @Kind varchar(10) AS
BEGIN
    SET NOCOUNT ON;
    IF @Kind = 'click' UPDATE dbo.Promotions SET Clicks = Clicks + 1 WHERE PromotionId = @PromotionId AND IsActive = 1;
    ELSE UPDATE dbo.Promotions SET Impressions = Impressions + 1 WHERE PromotionId = @PromotionId AND IsActive = 1;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Promotions_List AS
BEGIN
    SET NOCOUNT ON;
    SELECT PromotionId, Title, Subtitle, Placement, ImageUrl, CtaText, CtaUrl, CouponCode, Badge, StartsAtUtc, EndsAtUtc, Priority, IsActive,
           Impressions, Clicks, CAST(CASE WHEN Impressions = 0 THEN 0 ELSE 100.0 * Clicks / Impressions END AS decimal(6,2)) AS ClickRate, RowVersion
    FROM dbo.Promotions ORDER BY IsActive DESC, Priority DESC, EndsAtUtc DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Promotions_Upsert
    @PromotionId int = NULL, @Title nvarchar(120), @Subtitle nvarchar(300) = NULL, @Placement varchar(20), @ImageUrl nvarchar(300) = NULL, @CtaText nvarchar(40) = NULL,
    @CtaUrl nvarchar(300) = NULL, @CouponCode varchar(30) = NULL, @Badge nvarchar(30) = NULL, @StartsAtUtc datetime2(3), @EndsAtUtc datetime2(3), @Priority int,
    @IsActive bit, @RowVersion binary(8) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @CouponCode IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Coupons WHERE Code = UPPER(@CouponCode)) THROW 50060, 'coupon_not_found', 1;
    BEGIN TRAN;
    IF @PromotionId IS NULL
    BEGIN
        INSERT dbo.Promotions(Title, Subtitle, Placement, ImageUrl, CtaText, CtaUrl, CouponCode, Badge, StartsAtUtc, EndsAtUtc, Priority, IsActive)
        VALUES (@Title, @Subtitle, @Placement, @ImageUrl, @CtaText, @CtaUrl, UPPER(@CouponCode), @Badge, @StartsAtUtc, @EndsAtUtc, @Priority, @IsActive);
        SET @PromotionId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.Promotions SET Title = @Title, Subtitle = @Subtitle, Placement = @Placement, ImageUrl = @ImageUrl, CtaText = @CtaText, CtaUrl = @CtaUrl,
               CouponCode = UPPER(@CouponCode), Badge = @Badge, StartsAtUtc = @StartsAtUtc, EndsAtUtc = @EndsAtUtc, Priority = @Priority, IsActive = @IsActive, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE PromotionId = @PromotionId AND (@RowVersion IS NULL OR RowVersion = @RowVersion);
        IF @@ROWCOUNT = 0
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.Promotions WHERE PromotionId = @PromotionId) THROW 50009, 'concurrency_conflict', 1;
            THROW 50001, 'not_found', 1;
        END
    END
    DECLARE @pid nvarchar(20) = CAST(@PromotionId AS nvarchar(20));
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Promotion.Saved', 'Promotion', @pid, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT PromotionId FROM dbo.Promotions WHERE PromotionId = @PromotionId;
END;
GO

/* ================= HELP CENTER & CONTACT ================= */
CREATE OR ALTER PROCEDURE dbo.usp_Help_List @Search nvarchar(100) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT ArticleId, Category, Question, Answer, HelpfulYes, HelpfulNo FROM dbo.HelpArticles
    WHERE IsPublished = 1 AND (@Search IS NULL OR Question LIKE N'%' + @Search + N'%' OR Answer LIKE N'%' + @Search + N'%')
    ORDER BY Category, SortOrder, ArticleId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Help_Feedback @ArticleId int, @Helpful bit AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.HelpArticles SET HelpfulYes = HelpfulYes + CASE WHEN @Helpful = 1 THEN 1 ELSE 0 END, HelpfulNo = HelpfulNo + CASE WHEN @Helpful = 0 THEN 1 ELSE 0 END
    WHERE ArticleId = @ArticleId AND IsPublished = 1;
    IF @@ROWCOUNT = 0 THROW 50001, 'not_found', 1;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Help_List AS
BEGIN
    SET NOCOUNT ON;
    SELECT ArticleId, Category, Question, Answer, SortOrder, IsPublished, HelpfulYes, HelpfulNo, RowVersion FROM dbo.HelpArticles ORDER BY Category, SortOrder, ArticleId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Help_Upsert
    @ArticleId int = NULL, @Category nvarchar(50), @Question nvarchar(200), @Answer nvarchar(2000), @SortOrder int, @IsPublished bit,
    @RowVersion binary(8) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    IF @ArticleId IS NULL
    BEGIN
        INSERT dbo.HelpArticles(Category, Question, Answer, SortOrder, IsPublished) VALUES (@Category, @Question, @Answer, @SortOrder, @IsPublished);
        SET @ArticleId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.HelpArticles SET Category = @Category, Question = @Question, Answer = @Answer, SortOrder = @SortOrder, IsPublished = @IsPublished, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE ArticleId = @ArticleId AND (@RowVersion IS NULL OR RowVersion = @RowVersion);
        IF @@ROWCOUNT = 0
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.HelpArticles WHERE ArticleId = @ArticleId) THROW 50009, 'concurrency_conflict', 1;
            THROW 50001, 'not_found', 1;
        END
    END
    DECLARE @aid nvarchar(20) = CAST(@ArticleId AS nvarchar(20));
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Help.Saved', 'HelpArticle', @aid, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT ArticleId FROM dbo.HelpArticles WHERE ArticleId = @ArticleId;
END;
GO
/* A contact request opens a Customer task due within the SLA (Contact.SlaHours); booking/payment topics are High priority. */
CREATE OR ALTER PROCEDURE dbo.usp_Contact_Create
    @UserId uniqueidentifier = NULL, @Name nvarchar(100), @Email nvarchar(256), @Topic varchar(20), @BookingRef varchar(20) = NULL,
    @Message nvarchar(2000), @SlaHours int, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    INSERT dbo.ContactRequests(UserId, Name, Email, Topic, BookingRef, Message) VALUES (@UserId, @Name, @Email, @Topic, NULLIF(@BookingRef, ''), @Message);
    DECLARE @Id int = SCOPE_IDENTITY();
    DECLARE @Ref varchar(20) = (SELECT ContactRef FROM dbo.ContactRequests WHERE ContactId = @Id);
    DECLARE @Title nvarchar(200) = LEFT(N'Reply to ' + @Name + N' (' + @Topic + N')' + ISNULL(N' about ' + NULLIF(@BookingRef, ''), N''), 200);
    INSERT dbo.StaffTasks(Title, TaskType, EntityType, EntityRef, Priority, DueAtUtc, Note)
    VALUES (@Title, 'Customer', 'Contact', @Ref, CASE WHEN @Topic IN ('Booking','Change','Payment') THEN 'High' ELSE 'Normal' END,
            DATEADD(HOUR, @SlaHours, SYSUTCDATETIME()), LEFT(@Message, 1000));
    UPDATE dbo.ContactRequests SET TaskId = SCOPE_IDENTITY() WHERE ContactId = @Id;
    EXEC dbo.usp_Audit_Write @UserId, 'Contact.Created', 'Contact', @Ref, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT ContactRef, CreatedAtUtc FROM dbo.ContactRequests WHERE ContactId = @Id;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Contact_List @Status varchar(20) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 300 c.ContactId, c.ContactRef, c.Name, c.Email, c.Topic, c.BookingRef, c.Message, c.Status, c.CreatedAtUtc, t.TaskId, t.Status AS TaskStatus, t.DueAtUtc
    FROM dbo.ContactRequests c LEFT JOIN dbo.StaffTasks t ON t.TaskId = c.TaskId
    WHERE @Status IS NULL OR c.Status = @Status ORDER BY c.CreatedAtUtc DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Contact_SetStatus @ContactId int, @Status varchar(20), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    DECLARE @Ref varchar(20), @Task int;
    SELECT @Ref = ContactRef, @Task = TaskId FROM dbo.ContactRequests WITH (UPDLOCK) WHERE ContactId = @ContactId;
    IF @Ref IS NULL THROW 50001, 'not_found', 1;
    UPDATE dbo.ContactRequests SET Status = @Status WHERE ContactId = @ContactId;
    IF @Status IN ('Answered','Closed') UPDATE dbo.StaffTasks SET Status = 'Done', CompletedAtUtc = SYSUTCDATETIME() WHERE TaskId = @Task AND Status <> 'Done';
    DECLARE @d nvarchar(100) = (SELECT @Status AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Contact.StatusChanged', 'Contact', @Ref, @d, @CorrelationId, NULL;
    COMMIT;
END;
GO

/* ================= DISCOVERY: views, recommendations, calendar, compare, destination guide ================= */
CREATE OR ALTER PROCEDURE dbo.usp_Tour_RecordView @TourCode varchar(30), @UserId uniqueidentifier = NULL AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @TourId int = (SELECT TourId FROM dbo.Tours WHERE Code = @TourCode AND IsPublished = 1);
    IF @TourId IS NULL RETURN;
    -- one view per user and tour per 30 minutes (anonymous views are counted for popularity only)
    IF @UserId IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.TourViews WHERE UserId = @UserId AND TourId = @TourId AND ViewedAtUtc > DATEADD(MINUTE, -30, SYSUTCDATETIME())) RETURN;
    INSERT dbo.TourViews(TourId, UserId) VALUES (@TourId, @UserId);
END;
GO
/* Recommendations from real signals, best first, each with the reason that scored highest:
   +4 viewed this tour but has not booked it; +3 per destination region the user viewed or booked; +2 business unit the user booked before;
   + popularity (seats sold in 90 days) and recent views by everyone; tours the user already booked are excluded. Anonymous: popularity only. */
CREATE OR ALTER PROCEDURE dbo.usp_Recommend_Tours @UserId uniqueidentifier = NULL, @Max int = 6, @ExcludeCode varchar(30) = NULL AS
BEGIN
    SET NOCOUNT ON;
    WITH cand AS (
        SELECT t.TourId, t.Code, t.Title, t.Slogan, t.Days, t.Currency, t.Summary, t.BusinessUnitId, d.Region, d.Name AS DestinationName, d.DestinationId,
               COALESCE(t.ImageUrl, d.ImageUrl) AS ImageUrl, bu.Name AS BusinessUnitName,
               x.FromPrice, x.NextDeparture
        FROM dbo.Tours t JOIN dbo.Destinations d ON d.DestinationId = t.DestinationId JOIN dbo.BusinessUnits bu ON bu.BusinessUnitId = t.BusinessUnitId
        CROSS APPLY (SELECT MIN(dp.Price) AS FromPrice, MIN(dp.DepartureDate) AS NextDeparture FROM dbo.Departures dp
                     WHERE dp.TourId = t.TourId AND dp.Status = 'Open' AND dp.DepartureDate > CAST(SYSUTCDATETIME() AS date) AND dp.Capacity - dp.SeatsSold - dp.SeatsHeld > 0) x
        WHERE t.IsPublished = 1 AND x.NextDeparture IS NOT NULL AND (@ExcludeCode IS NULL OR t.Code <> @ExcludeCode)
          AND (@UserId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.Bookings b JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId
                                               WHERE b.CustomerUserId = @UserId AND dp.TourId = t.TourId AND b.Status IN ('Pending','Confirmed','CancelRequested')))
    ), sig AS (
        SELECT c.*,
            ViewedSelf = CASE WHEN @UserId IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.TourViews v WHERE v.UserId = @UserId AND v.TourId = c.TourId AND v.ViewedAtUtc > DATEADD(DAY, -60, SYSUTCDATETIME())) THEN 1 ELSE 0 END,
            RegionHits = CASE WHEN @UserId IS NULL THEN 0 ELSE
                (SELECT COUNT(*) FROM dbo.TourViews v JOIN dbo.Tours t2 ON t2.TourId = v.TourId JOIN dbo.Destinations d2 ON d2.DestinationId = t2.DestinationId
                 WHERE v.UserId = @UserId AND d2.Region = c.Region AND t2.TourId <> c.TourId AND v.ViewedAtUtc > DATEADD(DAY, -60, SYSUTCDATETIME()))
              + (SELECT COUNT(*) FROM dbo.Bookings b JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId JOIN dbo.Tours t2 ON t2.TourId = dp.TourId
                 JOIN dbo.Destinations d2 ON d2.DestinationId = t2.DestinationId WHERE b.CustomerUserId = @UserId AND d2.Region = c.Region AND t2.TourId <> c.TourId) END,
            SameUnit = CASE WHEN @UserId IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Bookings b JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId JOIN dbo.Tours t2 ON t2.TourId = dp.TourId
                                                                 WHERE b.CustomerUserId = @UserId AND t2.BusinessUnitId = c.BusinessUnitId) THEN 1 ELSE 0 END,
            SeatsSold90 = (SELECT ISNULL(SUM(b.Pax), 0) FROM dbo.Bookings b JOIN dbo.Departures dp ON dp.DepartureId = b.DepartureId
                           WHERE dp.TourId = c.TourId AND b.Status IN ('Confirmed','Pending') AND b.CreatedAtUtc > DATEADD(DAY, -90, SYSUTCDATETIME())),
            Views14 = (SELECT COUNT(*) FROM dbo.TourViews v WHERE v.TourId = c.TourId AND v.ViewedAtUtc > DATEADD(DAY, -14, SYSUTCDATETIME()))
        FROM cand c
    )
    SELECT TOP (@Max) Code, Title, Slogan, Days, Currency, Summary, DestinationName, Region, ImageUrl, BusinessUnitName, FromPrice, NextDeparture,
        CAST(ViewedSelf * 4 + LEAST(RegionHits, 3) * 3 + SameUnit * 2 + LOG(1 + SeatsSold90) + LOG(1 + Views14) * 0.5
             + CASE WHEN NextDeparture <= DATEADD(DAY, 21, CAST(SYSUTCDATETIME() AS date)) THEN 0.5 ELSE 0 END AS decimal(8,3)) AS Score,
        CASE WHEN ViewedSelf = 1 THEN N'You looked at this recently'
             WHEN RegionHits > 0 THEN N'Because you like the ' + Region + N' region'
             WHEN SameUnit = 1 THEN N'Similar to a trip you booked'
             WHEN SeatsSold90 > 0 THEN N'Popular with travelers right now'
             WHEN NextDeparture <= DATEADD(DAY, 21, CAST(SYSUTCDATETIME() AS date)) THEN N'Departing soon'
             ELSE N'Open for booking' END AS Reason
    FROM sig
    ORDER BY Score DESC, NextDeparture;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Catalog_Calendar @Month date AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @From date = DATEFROMPARTS(YEAR(@Month), MONTH(@Month), 1);
    SELECT dp.DepartureId, dp.DepartureDate, dp.Price, dp.Capacity - dp.SeatsSold - dp.SeatsHeld AS SeatsLeft, dp.Status,
           t.Code AS TourCode, t.Title AS TourTitle, t.Days, t.Currency, d.Name AS DestinationName
    FROM dbo.Departures dp JOIN dbo.Tours t ON t.TourId = dp.TourId JOIN dbo.Destinations d ON d.DestinationId = t.DestinationId
    WHERE t.IsPublished = 1 AND dp.Status <> 'Cancelled' AND dp.DepartureDate >= @From AND dp.DepartureDate < DATEADD(MONTH, 1, @From)
      AND dp.DepartureDate > CAST(SYSUTCDATETIME() AS date)
    ORDER BY dp.DepartureDate, t.Title;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Catalog_Compare @CodesJson nvarchar(400) AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.Code, t.Title, t.Slogan, t.Days, t.Currency, t.Summary, d.Name AS DestinationName, d.Region, bu.Name AS BusinessUnitName,
           COALESCE(t.ImageUrl, d.ImageUrl) AS ImageUrl, d.BestTime, d.GettingThere,
           x.FromPrice, x.NextDeparture, x.OpenDepartures, x.SeatsLeft,
           (SELECT COUNT(*) FROM dbo.NearbyPlaces n WHERE n.DestinationId = d.DestinationId AND n.IsActive = 1) AS NearbyCount,
           (SELECT STRING_AGG(CAST(n.Name AS nvarchar(max)), N', ') WITHIN GROUP (ORDER BY n.SortOrder) FROM dbo.NearbyPlaces n WHERE n.DestinationId = d.DestinationId AND n.IsActive = 1) AS NearbyNames
    FROM OPENJSON(@CodesJson) j
    JOIN dbo.Tours t ON t.Code = j.[value] AND t.IsPublished = 1
    JOIN dbo.Destinations d ON d.DestinationId = t.DestinationId JOIN dbo.BusinessUnits bu ON bu.BusinessUnitId = t.BusinessUnitId
    OUTER APPLY (SELECT MIN(dp.Price) AS FromPrice, MIN(dp.DepartureDate) AS NextDeparture, COUNT(*) AS OpenDepartures, SUM(dp.Capacity - dp.SeatsSold - dp.SeatsHeld) AS SeatsLeft
                 FROM dbo.Departures dp WHERE dp.TourId = t.TourId AND dp.Status = 'Open' AND dp.DepartureDate > CAST(SYSUTCDATETIME() AS date)) x
    ORDER BY CAST(j.[key] AS int);
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Destinations_Get @Code varchar(20) AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Id int = (SELECT DestinationId FROM dbo.Destinations WHERE Code = @Code AND IsActive = 1);
    SELECT DestinationId, Code, Name, Region, ImageUrl, Overview, BestTime, GettingThere, LocalTip FROM dbo.Destinations WHERE DestinationId = @Id;
    SELECT Era, Title, Detail FROM dbo.DestinationHistory WHERE DestinationId = @Id ORDER BY SortOrder, HistoryId;
    SELECT Name, Category, DistanceKm, TravelMinutes, Detail FROM dbo.NearbyPlaces WHERE DestinationId = @Id AND IsActive = 1 ORDER BY SortOrder, NearbyPlaceId;
    SELECT t.Code, t.Title, t.Slogan, t.Days, t.Currency, t.Summary, COALESCE(t.ImageUrl, d.ImageUrl) AS ImageUrl, d.Name AS DestinationName, bu.Name AS BusinessUnitName,
           x.FromPrice, x.NextDeparture, ISNULL(x.OpenDepartures, 0) AS OpenDepartures
    FROM dbo.Tours t JOIN dbo.Destinations d ON d.DestinationId = t.DestinationId JOIN dbo.BusinessUnits bu ON bu.BusinessUnitId = t.BusinessUnitId
    OUTER APPLY (SELECT MIN(dp.Price) AS FromPrice, MIN(dp.DepartureDate) AS NextDeparture, COUNT(*) AS OpenDepartures FROM dbo.Departures dp
                 WHERE dp.TourId = t.TourId AND dp.Status = 'Open' AND dp.DepartureDate > CAST(SYSUTCDATETIME() AS date)) x
    WHERE t.DestinationId = @Id AND t.IsPublished = 1 ORDER BY x.NextDeparture;
END;
GO

/* ================= TRAVEL SERVICES (hotels, flights, buses, taxis) ================= */
CREATE OR ALTER PROCEDURE dbo.usp_Places_List @Kind varchar(10) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT p.PlaceId, p.Code, p.Name, p.Kind, p.City FROM dbo.Places p
    WHERE p.IsActive = 1 AND (@Kind IS NULL OR EXISTS (SELECT 1 FROM dbo.TravelServices s WHERE s.IsActive = 1 AND s.Kind = @Kind AND (s.FromPlaceId = p.PlaceId OR s.ToPlaceId = p.PlaceId)))
    ORDER BY p.City, p.Kind, p.Name;
END;
GO
/* Search: hotels price every night from @Date to @EndDate (exclusive) and need @Units rooms free on each night; transport uses one date. */
CREATE OR ALTER PROCEDURE dbo.usp_Services_Search
    @Kind varchar(10), @From varchar(10) = NULL, @To varchar(10) = NULL, @Date date, @EndDate date = NULL, @Units int = 1, @Travelers int = 1, @Sort varchar(10) = 'price'
AS
BEGIN
    SET NOCOUNT ON;
    IF @Date <= CAST(SYSUTCDATETIME() AS date) OR (@Kind = 'Hotel' AND (@EndDate IS NULL OR @EndDate <= @Date OR DATEDIFF(DAY, @Date, @EndDate) > 30)) THROW 50065, 'invalid_dates', 1;
    DECLARE @Nights int = CASE WHEN @Kind = 'Hotel' THEN DATEDIFF(DAY, @Date, @EndDate) ELSE 1 END;
    DECLARE @Last date = CASE WHEN @Kind = 'Hotel' THEN DATEADD(DAY, -1, @EndDate) ELSE @Date END;
    SELECT s.ServiceId, s.Code, s.Kind, s.Name, s.Features, s.CancellationPolicy, s.ImageUrl, s.Rating, s.DepartTime, s.DurationMin, s.PeoplePerUnit, s.MaxPerBooking, s.Currency,
           sp.Name AS ProviderName, f.Code AS FromCode, f.Name AS FromName, f.City AS FromCity, tp.Code AS ToCode, tp.Name AS ToName, tp.City AS ToCity,
           a.Available, a.TotalPrice, a.TotalPrice / @Nights AS NightlyPrice, @Nights AS Nights
    FROM dbo.TravelServices s
    JOIN dbo.Places f ON f.PlaceId = s.FromPlaceId
    LEFT JOIN dbo.Places tp ON tp.PlaceId = s.ToPlaceId
    LEFT JOIN dbo.Suppliers sp ON sp.SupplierId = s.SupplierId
    CROSS APPLY (SELECT MIN(i.Capacity - i.Sold - i.Held) AS Available, SUM(i.Price) AS TotalPrice, COUNT(*) AS Days
                 FROM dbo.ServiceInventory i WHERE i.ServiceId = s.ServiceId AND i.Status = 'Open' AND i.ServiceDate BETWEEN @Date AND @Last) a
    WHERE s.IsActive = 1 AND s.Kind = @Kind AND a.Days = @Nights AND a.Available >= @Units
      AND (@From IS NULL OR f.Code = @From OR (s.Kind = 'Hotel' AND f.City = (SELECT City FROM dbo.Places WHERE Code = @From)))
      AND (@To IS NULL OR tp.Code = @To OR tp.City = (SELECT City FROM dbo.Places WHERE Code = @To))
      AND s.PeoplePerUnit * @Units >= @Travelers
    ORDER BY CASE WHEN @Sort = 'rating' THEN -ISNULL(s.Rating, 0) END, CASE WHEN @Sort = 'time' THEN s.DepartTime END, a.TotalPrice;
END;
GO
/* Atomic booking (no separate hold): locks every inventory row it needs, checks capacity, applies a coupon, confirms instantly.
   Idempotent per (customer, key): a retry returns the same booking. */
CREATE OR ALTER PROCEDURE dbo.usp_ServiceBooking_Create
    @UserId uniqueidentifier, @ServiceCode varchar(30), @Date date, @EndDate date = NULL, @Units int, @Travelers int, @LeadName nvarchar(100),
    @LeadPhoneEnc varbinary(512) = NULL, @LeadPhoneMasked nvarchar(30) = NULL, @PickupAddress nvarchar(200) = NULL, @PickupTime time(0) = NULL,
    @Notes nvarchar(500) = NULL, @CouponCode varchar(30) = NULL, @IdempotencyKey varchar(64), @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    BEGIN TRAN;
    DECLARE @Existing int = (SELECT ServiceBookingId FROM dbo.ServiceBookings WHERE CustomerUserId = @UserId AND IdempotencyKey = @IdempotencyKey);
    IF @Existing IS NULL
    BEGIN
        DECLARE @Sid int, @Kind varchar(10), @MaxPer int, @PPU int, @Active bit;
        SELECT @Sid = ServiceId, @Kind = Kind, @MaxPer = MaxPerBooking, @PPU = PeoplePerUnit, @Active = IsActive FROM dbo.TravelServices WHERE Code = @ServiceCode;
        IF @Sid IS NULL OR @Active = 0 THROW 50001, 'not_found', 1;
        IF @Kind <> 'Hotel' SET @EndDate = @Date;
        IF @Date <= CAST(SYSUTCDATETIME() AS date) OR (@Kind = 'Hotel' AND (@EndDate IS NULL OR @EndDate <= @Date OR DATEDIFF(DAY, @Date, @EndDate) > 30)) THROW 50065, 'invalid_dates', 1;
        IF @Units < 1 OR @Units > @MaxPer OR @Travelers < 1 OR @Travelers > @PPU * @Units THROW 50041, 'validation_failed', 1;
        IF @Kind = 'Taxi' AND (NULLIF(LTRIM(@PickupAddress), '') IS NULL OR @PickupTime IS NULL) THROW 50041, 'validation_failed', 1;
        DECLARE @Nights int = CASE WHEN @Kind = 'Hotel' THEN DATEDIFF(DAY, @Date, @EndDate) ELSE 1 END;
        DECLARE @Last date = CASE WHEN @Kind = 'Hotel' THEN DATEADD(DAY, -1, @EndDate) ELSE @Date END;
        DECLARE @Rows int, @MinFree int, @Sum decimal(12,2);
        SELECT @Rows = COUNT(*), @MinFree = MIN(Capacity - Sold - Held), @Sum = SUM(Price)
        FROM dbo.ServiceInventory WITH (UPDLOCK, HOLDLOCK) WHERE ServiceId = @Sid AND Status = 'Open' AND ServiceDate BETWEEN @Date AND @Last;
        IF @Rows <> @Nights OR @MinFree < @Units THROW 50066, 'sold_out', 1;
        DECLARE @Subtotal decimal(12,2) = @Sum * @Units, @Discount decimal(12,2) = 0, @CouponId int = NULL;
        SET @CouponCode = NULLIF(UPPER(LTRIM(RTRIM(@CouponCode))), '');
        IF @CouponCode IS NOT NULL EXEC dbo.usp_Coupon_Evaluate @CouponCode, @UserId, @Kind, @Subtotal, @Discount OUTPUT, @CouponId OUTPUT, 1;
        UPDATE dbo.ServiceInventory SET Sold = Sold + @Units WHERE ServiceId = @Sid AND ServiceDate BETWEEN @Date AND @Last;
        INSERT dbo.ServiceBookings(CustomerUserId, ServiceId, StartDate, EndDate, Units, Travelers, Subtotal, DiscountAmount, TotalAmount, CouponCode, LeadName,
                                   LeadPhoneEnc, LeadPhoneMasked, PickupAddress, PickupTime, Notes, IdempotencyKey)
        VALUES (@UserId, @Sid, @Date, @EndDate, @Units, @Travelers, @Subtotal, @Discount, @Subtotal - @Discount, @CouponCode, @LeadName,
                @LeadPhoneEnc, @LeadPhoneMasked, @PickupAddress, @PickupTime, @Notes, @IdempotencyKey);
        SET @Existing = SCOPE_IDENTITY();
        DECLARE @Ref varchar(20) = (SELECT BookingRef FROM dbo.ServiceBookings WHERE ServiceBookingId = @Existing);
        IF @CouponId IS NOT NULL
        BEGIN
            INSERT dbo.CouponRedemptions(CouponId, CustomerUserId, OrderType, OrderRef, DiscountAmount) VALUES (@CouponId, @UserId, 'Service', @Ref, @Discount);
            UPDATE dbo.Coupons SET TimesUsed = TimesUsed + 1 WHERE CouponId = @CouponId;
        END
        DECLARE @d nvarchar(300) = (SELECT @ServiceCode AS service, @Date AS startDate, @EndDate AS endDate, @Units AS units, @Discount AS discount FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write @UserId, 'ServiceBooking.Created', 'ServiceBooking', @Ref, @d, @CorrelationId, NULL;
    END
    COMMIT;
    SELECT ServiceBookingId, BookingRef, Status, TotalAmount FROM dbo.ServiceBookings WHERE ServiceBookingId = @Existing;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ServiceBooking_ListForCustomer @UserId uniqueidentifier AS
BEGIN
    SET NOCOUNT ON;
    SELECT b.ServiceBookingId, b.BookingRef, s.Kind, s.Name AS ServiceName, f.Name AS FromName, tp.Name AS ToName, b.StartDate, b.EndDate, b.Units, b.Travelers,
           b.TotalAmount, b.DiscountAmount, b.Currency, b.Status, b.PaymentStatus, b.CreatedAtUtc, s.DepartTime, s.ImageUrl
    FROM dbo.ServiceBookings b JOIN dbo.TravelServices s ON s.ServiceId = b.ServiceId JOIN dbo.Places f ON f.PlaceId = s.FromPlaceId LEFT JOIN dbo.Places tp ON tp.PlaceId = s.ToPlaceId
    WHERE b.CustomerUserId = @UserId ORDER BY b.StartDate DESC, b.ServiceBookingId DESC;
END;
GO
/* Customer cancellation: free up to 24 hours before the start; seats/rooms go back to inventory; a paid booking is marked Refunded. */
CREATE OR ALTER PROCEDURE dbo.usp_ServiceBooking_Cancel @ServiceBookingId int, @UserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    DECLARE @St varchar(20), @Sid int, @Start date, @End date, @Units int, @Ref varchar(20), @Kind varchar(10), @Pay varchar(20);
    SELECT @St = b.Status, @Sid = b.ServiceId, @Start = b.StartDate, @End = b.EndDate, @Units = b.Units, @Ref = b.BookingRef, @Pay = b.PaymentStatus, @Kind = s.Kind
    FROM dbo.ServiceBookings b WITH (UPDLOCK) JOIN dbo.TravelServices s ON s.ServiceId = b.ServiceId
    WHERE b.ServiceBookingId = @ServiceBookingId AND b.CustomerUserId = @UserId;
    IF @St IS NULL THROW 50001, 'not_found', 1;
    IF @St <> 'Confirmed' OR @Start <= CAST(DATEADD(HOUR, 24, SYSUTCDATETIME()) AS date) THROW 50031, 'invalid_state', 1;
    DECLARE @Last date = CASE WHEN @Kind = 'Hotel' THEN DATEADD(DAY, -1, @End) ELSE @Start END;
    UPDATE dbo.ServiceInventory SET Sold = Sold - @Units WHERE ServiceId = @Sid AND ServiceDate BETWEEN @Start AND @Last;
    UPDATE dbo.ServiceBookings SET Status = 'Cancelled', CancelledAtUtc = SYSUTCDATETIME(), PaymentStatus = CASE WHEN @Pay IN ('Paid', 'PartiallyPaid') THEN 'Refunded' ELSE PaymentStatus END
    WHERE ServiceBookingId = @ServiceBookingId;
    EXEC dbo.usp_Coupon_Release 'Service', @Ref;
    EXEC dbo.usp_Audit_Write @UserId, 'ServiceBooking.Cancelled', 'ServiceBooking', @Ref, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
/* ---- staff: services, inventory, bookings ---- */
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Services_List @Kind varchar(10) = NULL, @Search nvarchar(100) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT s.ServiceId, s.Code, s.Kind, s.Name, s.SupplierId, sp.Name AS ProviderName, s.FromPlaceId, f.Name AS FromName, s.ToPlaceId, tp.Name AS ToName,
           s.DepartTime, s.DurationMin, s.Capacity, s.MaxPerBooking, s.PeoplePerUnit, s.BasePrice, s.Currency, s.Rating, s.Features, s.CancellationPolicy, s.ImageUrl,
           s.IsActive, s.IsDemo, s.RowVersion,
           (SELECT COUNT(*) FROM dbo.ServiceInventory i WHERE i.ServiceId = s.ServiceId AND i.ServiceDate > CAST(SYSUTCDATETIME() AS date) AND i.Status = 'Open') AS OpenDates,
           (SELECT ISNULL(SUM(i.Sold), 0) FROM dbo.ServiceInventory i WHERE i.ServiceId = s.ServiceId AND i.ServiceDate > CAST(SYSUTCDATETIME() AS date)) AS UpcomingSold
    FROM dbo.TravelServices s JOIN dbo.Places f ON f.PlaceId = s.FromPlaceId LEFT JOIN dbo.Places tp ON tp.PlaceId = s.ToPlaceId LEFT JOIN dbo.Suppliers sp ON sp.SupplierId = s.SupplierId
    WHERE (@Kind IS NULL OR s.Kind = @Kind) AND (@Search IS NULL OR s.Name LIKE N'%' + @Search + N'%' OR s.Code LIKE @Search + '%')
    ORDER BY s.Kind, s.Name;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_Services_Upsert
    @ServiceId int = NULL, @Code varchar(30), @Kind varchar(10), @Name nvarchar(150), @SupplierId int = NULL, @FromPlaceId int, @ToPlaceId int = NULL,
    @DepartTime time(0) = NULL, @DurationMin int = NULL, @Capacity int, @MaxPerBooking int, @PeoplePerUnit int, @BasePrice decimal(12,2), @Rating decimal(2,1) = NULL,
    @Features nvarchar(400) = NULL, @CancellationPolicy nvarchar(300) = NULL, @ImageUrl nvarchar(300) = NULL, @IsActive bit,
    @RowVersion binary(8) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    IF @ServiceId IS NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.TravelServices WHERE Code = @Code) THROW 50013, 'duplicate_key', 1;
        INSERT dbo.TravelServices(Code, Kind, Name, SupplierId, FromPlaceId, ToPlaceId, DepartTime, DurationMin, Capacity, MaxPerBooking, PeoplePerUnit, BasePrice, Rating, Features, CancellationPolicy, ImageUrl, IsActive)
        VALUES (@Code, @Kind, @Name, @SupplierId, @FromPlaceId, @ToPlaceId, @DepartTime, @DurationMin, @Capacity, @MaxPerBooking, @PeoplePerUnit, @BasePrice, @Rating, @Features, @CancellationPolicy, @ImageUrl, @IsActive);
        SET @ServiceId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.TravelServices SET Name = @Name, SupplierId = @SupplierId, FromPlaceId = @FromPlaceId, ToPlaceId = @ToPlaceId, DepartTime = @DepartTime, DurationMin = @DurationMin,
               Capacity = @Capacity, MaxPerBooking = @MaxPerBooking, PeoplePerUnit = @PeoplePerUnit, BasePrice = @BasePrice, Rating = @Rating, Features = @Features,
               CancellationPolicy = @CancellationPolicy, ImageUrl = @ImageUrl, IsActive = @IsActive, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE ServiceId = @ServiceId AND (@RowVersion IS NULL OR RowVersion = @RowVersion);
        IF @@ROWCOUNT = 0
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.TravelServices WHERE ServiceId = @ServiceId) THROW 50009, 'concurrency_conflict', 1;
            THROW 50001, 'not_found', 1;
        END
    END
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Service.Saved', 'TravelService', @Code, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT ServiceId, Code FROM dbo.TravelServices WHERE ServiceId = @ServiceId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_ServiceInventory_List @ServiceId int, @From date, @Days int = 60 AS
BEGIN
    SET NOCOUNT ON;
    SELECT InventoryId, ServiceDate, Capacity, Sold, Held, Capacity - Sold - Held AS Available, Price, Status
    FROM dbo.ServiceInventory WHERE ServiceId = @ServiceId AND ServiceDate >= @From AND ServiceDate < DATEADD(DAY, @Days, @From) ORDER BY ServiceDate;
END;
GO
/* Opens, re-prices or closes a date range. Capacity can never go below what is already sold. */
CREATE OR ALTER PROCEDURE dbo.usp_Ops_ServiceInventory_SetRange
    @ServiceId int, @From date, @To date, @Capacity int, @Price decimal(12,2), @Status varchar(10), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @To < @From OR DATEDIFF(DAY, @From, @To) > 366 OR @From <= CAST(SYSUTCDATETIME() AS date) THROW 50065, 'invalid_dates', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.TravelServices WHERE ServiceId = @ServiceId) THROW 50001, 'not_found', 1;
    BEGIN TRAN;
    IF EXISTS (SELECT 1 FROM dbo.ServiceInventory WITH (UPDLOCK) WHERE ServiceId = @ServiceId AND ServiceDate BETWEEN @From AND @To AND Sold + Held > @Capacity)
        THROW 50030, 'insufficient_capacity', 1;
    WITH d AS (SELECT TOP (DATEDIFF(DAY, @From, @To) + 1) DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1, @From) AS D FROM sys.all_objects)
    MERGE dbo.ServiceInventory AS t USING d ON t.ServiceId = @ServiceId AND t.ServiceDate = d.D
    WHEN MATCHED THEN UPDATE SET Capacity = @Capacity, Price = @Price, Status = @Status
    WHEN NOT MATCHED THEN INSERT (ServiceId, ServiceDate, Capacity, Price, Status) VALUES (@ServiceId, d.D, @Capacity, @Price, @Status);
    DECLARE @code nvarchar(30) = (SELECT Code FROM dbo.TravelServices WHERE ServiceId = @ServiceId),
            @d2 nvarchar(300) = (SELECT @From AS [from], @To AS [to], @Capacity AS capacity, @Price AS price, @Status AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Service.InventoryChanged', 'TravelService', @code, @d2, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Ops_ServiceBookings_List @Kind varchar(10) = NULL, @Search nvarchar(100) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 300 b.ServiceBookingId, b.BookingRef, s.Kind, s.Name AS ServiceName, b.StartDate, b.EndDate, b.Units, b.Travelers, b.TotalAmount, b.DiscountAmount,
           b.CouponCode, b.Currency, b.Status, b.PaymentStatus, b.LeadName, b.LeadPhoneMasked, b.PickupAddress, b.PickupTime, b.CreatedAtUtc
    FROM dbo.ServiceBookings b JOIN dbo.TravelServices s ON s.ServiceId = b.ServiceId
    WHERE (@Kind IS NULL OR s.Kind = @Kind) AND (@Search IS NULL OR b.BookingRef = @Search OR b.LeadName LIKE N'%' + @Search + N'%')
    ORDER BY b.CreatedAtUtc DESC;
END;
GO
/* Detail page: the service, a 45-day price/availability calendar from @From, and up to 4 similar options
   (same type, same city for hotels or same route/destination city for transport). */
CREATE OR ALTER PROCEDURE dbo.usp_Services_Get @Code varchar(30), @From date AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Sid int, @Kind varchar(10), @FromPlace int, @ToPlace int;
    SELECT @Sid = ServiceId, @Kind = Kind, @FromPlace = FromPlaceId, @ToPlace = ToPlaceId FROM dbo.TravelServices WHERE Code = @Code AND IsActive = 1;
    IF @Sid IS NULL THROW 50001, 'not_found', 1;
    IF @From <= CAST(SYSUTCDATETIME() AS date) SET @From = DATEADD(DAY, 1, CAST(SYSUTCDATETIME() AS date));
    SELECT s.ServiceId, s.Code, s.Kind, s.Name, s.Description, s.Address, s.Highlights, s.FactsJson, s.Gallery, s.Latitude, s.Longitude, s.Features, s.CancellationPolicy,
           s.ImageUrl, s.Rating, s.DepartTime, s.DurationMin, s.PeoplePerUnit, s.MaxPerBooking, s.BasePrice, s.Currency, sp.Name AS ProviderName,
           f.Code AS FromCode, f.Name AS FromName, f.City AS FromCity, tp.Code AS ToCode, tp.Name AS ToName, tp.City AS ToCity
    FROM dbo.TravelServices s JOIN dbo.Places f ON f.PlaceId = s.FromPlaceId LEFT JOIN dbo.Places tp ON tp.PlaceId = s.ToPlaceId LEFT JOIN dbo.Suppliers sp ON sp.SupplierId = s.SupplierId
    WHERE s.ServiceId = @Sid;
    SELECT ServiceDate, Price, Capacity - Sold - Held AS Available, Status
    FROM dbo.ServiceInventory WHERE ServiceId = @Sid AND ServiceDate >= @From AND ServiceDate < DATEADD(DAY, 45, @From) ORDER BY ServiceDate;
    SELECT TOP 4 s.Code, s.Kind, s.Name, s.ImageUrl, s.Rating, s.DepartTime, s.DurationMin, s.BasePrice, s.Currency, f.Name AS FromName, tp.Name AS ToName, f.City AS FromCity
    FROM dbo.TravelServices s JOIN dbo.Places f ON f.PlaceId = s.FromPlaceId LEFT JOIN dbo.Places tp ON tp.PlaceId = s.ToPlaceId
    WHERE s.IsActive = 1 AND s.Kind = @Kind AND s.ServiceId <> @Sid
    ORDER BY CASE WHEN f.City = (SELECT City FROM dbo.Places WHERE PlaceId = @FromPlace) THEN 0                       -- same city / origin first
                  WHEN @ToPlace IS NOT NULL AND tp.City = (SELECT City FROM dbo.Places WHERE PlaceId = @ToPlace) THEN 1   -- then same destination
                  ELSE 2 END, s.Rating DESC, s.BasePrice;
END;
GO
