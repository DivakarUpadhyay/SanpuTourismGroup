SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
GO
/* Public list: published articles of one kind, optional category, newest first, paged; also the category list with counts. */
CREATE OR ALTER PROCEDURE dbo.usp_Articles_Public @Kind varchar(10), @Category nvarchar(60) = NULL, @Page int = 1, @PageSize int = 9 AS
BEGIN
    SET NOCOUNT ON;
    SELECT ArticleId, Kind, Slug, Title, Summary, Category, Tags, ImageUrl, ImageAlt, AuthorName, ReadMinutes, PublishedAtUtc, WrittenBy,
           COUNT(*) OVER () AS TotalCount
    FROM dbo.Articles WHERE Kind = @Kind AND Status = 'Published' AND (@Category IS NULL OR Category = @Category)
    ORDER BY PublishedAtUtc DESC OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
    SELECT Category, COUNT(*) AS Articles FROM dbo.Articles WHERE Kind = @Kind AND Status = 'Published' GROUP BY Category ORDER BY Category;
END;
GO
/* One published article by slug, plus three related ones (same kind, same category first). */
CREATE OR ALTER PROCEDURE dbo.usp_Article_GetPublic @Slug varchar(160) AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Id int, @Kind varchar(10), @Cat nvarchar(60);
    SELECT @Id = ArticleId, @Kind = Kind, @Cat = Category FROM dbo.Articles WHERE Slug = @Slug AND Status = 'Published';
    IF @Id IS NULL THROW 50001, 'not_found', 1;
    SELECT ArticleId, Kind, Slug, Title, Summary, Body, Category, Tags, ImageUrl, ImageAlt, AuthorName, ReadMinutes, PublishedAtUtc, WrittenBy FROM dbo.Articles WHERE ArticleId = @Id;
    SELECT TOP 3 ArticleId, Kind, Slug, Title, Summary, Category, ImageUrl, ImageAlt, ReadMinutes, PublishedAtUtc
    FROM dbo.Articles WHERE Kind = @Kind AND Status = 'Published' AND ArticleId <> @Id
    ORDER BY CASE WHEN Category = @Cat THEN 0 ELSE 1 END, PublishedAtUtc DESC;
END;
GO
/* Staff list (all statuses). */
CREATE OR ALTER PROCEDURE dbo.usp_Articles_Admin @Kind varchar(10) = NULL, @Status varchar(10) = NULL, @Search nvarchar(100) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT ArticleId, Kind, Slug, Title, Summary, Body, Category, Tags, ImageUrl, ImageAlt, AuthorName, Status, WrittenBy, AiModel, ReadMinutes,
           PublishedAtUtc, CreatedAtUtc, UpdatedAtUtc, RowVersion
    FROM dbo.Articles
    WHERE (@Kind IS NULL OR Kind = @Kind) AND (@Status IS NULL OR Status = @Status)
      AND (@Search IS NULL OR Title LIKE N'%' + @Search + N'%' OR Category LIKE N'%' + @Search + N'%')
    ORDER BY COALESCE(PublishedAtUtc, CreatedAtUtc) DESC;
END;
GO
/* Create (ArticleId NULL) or update. The slug comes from the title and stays unique. Publishing stamps PublishedAtUtc once. */
CREATE OR ALTER PROCEDURE dbo.usp_Article_Save
    @ArticleId int = NULL, @Kind varchar(10), @Title nvarchar(200), @Summary nvarchar(400), @Body nvarchar(max), @Category nvarchar(60), @Tags nvarchar(200) = NULL,
    @ImageUrl varchar(300) = NULL, @ImageAlt nvarchar(200) = NULL, @Status varchar(10), @WrittenBy varchar(10) = 'Staff', @AiModel varchar(60) = NULL,
    @ActorUserId uniqueidentifier = NULL, @RowVersion varbinary(8) = NULL, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Read int = CASE WHEN LEN(@Body) / 1100 < 2 THEN 2 ELSE LEN(@Body) / 1100 END;   -- ~200 words a minute
    BEGIN TRAN;
    IF @ArticleId IS NULL
    BEGIN
        DECLARE @Base varchar(150) = LEFT(dbo.fn_Slugify(@Title), 150), @Slug varchar(160), @n int = 1;
        SET @Slug = @Base;
        WHILE EXISTS (SELECT 1 FROM dbo.Articles WITH (UPDLOCK, HOLDLOCK) WHERE Slug = @Slug) BEGIN SET @n += 1; SET @Slug = @Base + '-' + CAST(@n AS varchar(5)); END;
        INSERT dbo.Articles(Kind, Slug, Title, Summary, Body, Category, Tags, ImageUrl, ImageAlt, Status, WrittenBy, AiModel, ReadMinutes, PublishedAtUtc, UpdatedBy)
        VALUES (@Kind, @Slug, @Title, @Summary, @Body, @Category, @Tags, @ImageUrl, @ImageAlt, @Status, @WrittenBy, @AiModel, @Read,
                CASE WHEN @Status = 'Published' THEN SYSUTCDATETIME() END, @ActorUserId);
        SET @ArticleId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.Articles SET Kind = @Kind, Title = @Title, Summary = @Summary, Body = @Body, Category = @Category, Tags = @Tags, ImageUrl = @ImageUrl, ImageAlt = @ImageAlt,
               Status = @Status, ReadMinutes = @Read, PublishedAtUtc = CASE WHEN @Status = 'Published' THEN COALESCE(PublishedAtUtc, SYSUTCDATETIME()) ELSE PublishedAtUtc END,
               UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE ArticleId = @ArticleId AND (@RowVersion IS NULL OR RowVersion = @RowVersion);
        IF @@ROWCOUNT = 0 THROW 50009, 'concurrency_conflict', 1;
    END
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Article.Saved', 'Article', @ArticleId, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT ArticleId, Slug, Status FROM dbo.Articles WHERE ArticleId = @ArticleId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Article_SetStatus @ArticleId int, @Status varchar(10), @ActorUserId uniqueidentifier = NULL, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    UPDATE dbo.Articles SET Status = @Status, PublishedAtUtc = CASE WHEN @Status = 'Published' THEN COALESCE(PublishedAtUtc, SYSUTCDATETIME()) ELSE PublishedAtUtc END,
           UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId WHERE ArticleId = @ArticleId;
    IF @@ROWCOUNT = 0 THROW 50001, 'not_found', 1;
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Article.Status', 'Article', @ArticleId, NULL, @CorrelationId, NULL;
END;
GO
/* For the writer bot: when it last wrote each kind, and the titles it already used (to avoid repeats). */
CREATE OR ALTER PROCEDURE dbo.usp_Articles_BotState AS
BEGIN
    SET NOCOUNT ON;
    SELECT Kind, MAX(CreatedAtUtc) AS LastAtUtc, COUNT(*) AS Articles FROM dbo.Articles WHERE WrittenBy = 'AI' GROUP BY Kind;
    SELECT TOP 60 Kind, Title FROM dbo.Articles ORDER BY CreatedAtUtc DESC;
END;
GO
