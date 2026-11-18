/* 110_article_bot.sql — the AI writer's schedule, one row per section (News, Blog): which days, what time (Taiwan time),
   publish at once or keep as draft, and optional topics the admin wants covered. Idempotent. */
SET NOCOUNT ON;
IF OBJECT_ID('dbo.ArticleBotSchedules') IS NULL
CREATE TABLE dbo.ArticleBotSchedules (
    Kind          varchar(10)   NOT NULL CONSTRAINT PK_ArticleBotSchedules PRIMARY KEY CONSTRAINT CK_ArticleBot_Kind CHECK (Kind IN ('News','Blog')),
    IsEnabled     bit           NOT NULL,
    Days          varchar(40)   NOT NULL,          -- e.g. 'Mon,Wed,Fri'
    TimeLocal     char(5)       NOT NULL,          -- 'HH:mm' Taiwan time
    AutoPublish   bit           NOT NULL,
    Topics        nvarchar(2000) NULL,             -- one per line; empty = the writer picks
    LastRunUtc    datetime2(3)  NULL,
    LastResult    nvarchar(300) NULL,
    UpdatedAtUtc  datetime2(3)  NULL,
    UpdatedBy     uniqueidentifier NULL
);
GO
INSERT dbo.ArticleBotSchedules(Kind, IsEnabled, Days, TimeLocal, AutoPublish)
SELECT k, 1, d, t, 1 FROM (VALUES ('News', 'Mon,Wed,Fri', '09:00'), ('Blog', 'Tue,Thu,Sat', '10:00')) v(k, d, t)
WHERE NOT EXISTS (SELECT 1 FROM dbo.ArticleBotSchedules x WHERE x.Kind = v.k);
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '110_article_bot.sql') INSERT dbo.SchemaVersions(ScriptName) VALUES ('110_article_bot.sql');
