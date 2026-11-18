/* 109_articles.sql — News (Taiwan travel industry and Sanpu company news) and Blog (travel guides and Sanpu stories).
   Articles are written by staff or by the AI writer bot, always original wording, with photos from the site's own
   photo library. Idempotent. */
SET NOCOUNT ON;
IF OBJECT_ID('dbo.Articles') IS NULL
CREATE TABLE dbo.Articles (
    ArticleId      int IDENTITY(1,1) CONSTRAINT PK_Articles PRIMARY KEY,
    Kind           varchar(10)   NOT NULL CONSTRAINT CK_Articles_Kind CHECK (Kind IN ('News','Blog')),
    Slug           varchar(160)  NOT NULL CONSTRAINT UQ_Articles_Slug UNIQUE,
    Title          nvarchar(200) NOT NULL,
    Summary        nvarchar(400) NOT NULL,
    Body           nvarchar(max) NOT NULL,
    Category       nvarchar(60)  NOT NULL,
    Tags           nvarchar(200) NULL,
    ImageUrl       varchar(300)  NULL,
    ImageAlt       nvarchar(200) NULL,
    AuthorName     nvarchar(100) NOT NULL CONSTRAINT DF_Articles_Author DEFAULT N'Sanpu Travel Editorial',
    Status         varchar(10)   NOT NULL CONSTRAINT CK_Articles_Status CHECK (Status IN ('Draft','Published','Archived')),
    WrittenBy      varchar(10)   NOT NULL CONSTRAINT CK_Articles_WrittenBy CHECK (WrittenBy IN ('Staff','AI')),
    AiModel        varchar(60)   NULL,
    ReadMinutes    int           NOT NULL CONSTRAINT DF_Articles_Read DEFAULT 3,
    PublishedAtUtc datetime2(3)  NULL,
    CreatedAtUtc   datetime2(3)  NOT NULL CONSTRAINT DF_Articles_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc   datetime2(3)  NULL,
    UpdatedBy      uniqueidentifier NULL,
    RowVersion     rowversion
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Articles_Public') CREATE INDEX IX_Articles_Public ON dbo.Articles(Kind, Status, PublishedAtUtc DESC);
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '109_articles.sql') INSERT dbo.SchemaVersions(ScriptName) VALUES ('109_articles.sql');
