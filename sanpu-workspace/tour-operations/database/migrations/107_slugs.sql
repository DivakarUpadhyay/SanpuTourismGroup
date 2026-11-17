/* 107_slugs.sql — readable, unique URL slugs (e.g. /tours/east-rift-valley-3d2n) for destinations, tours and travel services.
   Old codes keep working in the API. New rows get a slug from their name automatically (trigger). Idempotent. */
SET NOCOUNT ON;
GO
/* lower-case words joined by single dashes; anything that is not a letter or digit becomes a dash */
CREATE OR ALTER FUNCTION dbo.fn_Slugify (@s nvarchar(300)) RETURNS varchar(120) WITH SCHEMABINDING AS
BEGIN
    DECLARE @out varchar(300) = '', @i int = 1, @c nchar(1), @dash bit = 0;
    SET @s = LOWER(LTRIM(RTRIM(ISNULL(@s, N''))));
    WHILE @i <= LEN(@s)
    BEGIN
        SET @c = SUBSTRING(@s, @i, 1);
        IF @c LIKE N'[a-z0-9]' COLLATE Latin1_General_BIN BEGIN SET @out += CAST(@c AS char(1)); SET @dash = 0; END
        ELSE IF @dash = 0 AND LEN(@out) > 0 BEGIN SET @out += '-'; SET @dash = 1; END
        SET @i += 1;
    END
    IF RIGHT(@out, 1) = '-' SET @out = LEFT(@out, LEN(@out) - 1);
    RETURN LEFT(@out, 120);
END;
GO
IF COL_LENGTH('dbo.Destinations', 'Slug') IS NULL ALTER TABLE dbo.Destinations ADD Slug varchar(120) NULL;
IF COL_LENGTH('dbo.Tours', 'Slug') IS NULL ALTER TABLE dbo.Tours ADD Slug varchar(120) NULL;
IF COL_LENGTH('dbo.TravelServices', 'Slug') IS NULL ALTER TABLE dbo.TravelServices ADD Slug varchar(120) NULL;
GO
-- fill missing slugs; a clash gets the code appended so every slug stays unique
UPDATE d SET Slug = dbo.fn_Slugify(d.Name) FROM dbo.Destinations d WHERE d.Slug IS NULL;
UPDATE t SET Slug = dbo.fn_Slugify(t.Title) FROM dbo.Tours t WHERE t.Slug IS NULL;
UPDATE s SET Slug = dbo.fn_Slugify(s.Name) FROM dbo.TravelServices s WHERE s.Slug IS NULL;
UPDATE d SET Slug = LEFT(d.Slug + '-' + LOWER(d.Code), 120) FROM dbo.Destinations d WHERE EXISTS (SELECT 1 FROM dbo.Destinations x WHERE x.Slug = d.Slug AND x.DestinationId < d.DestinationId);
UPDATE t SET Slug = LEFT(t.Slug + '-' + LOWER(t.Code), 120) FROM dbo.Tours t WHERE EXISTS (SELECT 1 FROM dbo.Tours x WHERE x.Slug = t.Slug AND x.TourId < t.TourId);
UPDATE s SET Slug = LEFT(s.Slug + '-' + LOWER(s.Code), 120) FROM dbo.TravelServices s WHERE EXISTS (SELECT 1 FROM dbo.TravelServices x WHERE x.Slug = s.Slug AND x.ServiceId < s.ServiceId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Destinations_Slug') CREATE UNIQUE INDEX UX_Destinations_Slug ON dbo.Destinations(Slug) WHERE Slug IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Tours_Slug') CREATE UNIQUE INDEX UX_Tours_Slug ON dbo.Tours(Slug) WHERE Slug IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_TravelServices_Slug') CREATE UNIQUE INDEX UX_TravelServices_Slug ON dbo.TravelServices(Slug) WHERE Slug IS NOT NULL;
GO
/* new rows get a slug from their name; a clash gets the code appended */
CREATE OR ALTER TRIGGER dbo.TR_Destinations_Slug ON dbo.Destinations AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    UPDATE d SET Slug = CASE WHEN EXISTS (SELECT 1 FROM dbo.Destinations x WHERE x.Slug = dbo.fn_Slugify(d.Name) AND x.DestinationId <> d.DestinationId)
                             THEN LEFT(dbo.fn_Slugify(d.Name) + '-' + LOWER(d.Code), 120) ELSE dbo.fn_Slugify(d.Name) END
    FROM dbo.Destinations d JOIN inserted i ON i.DestinationId = d.DestinationId WHERE d.Slug IS NULL;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_Tours_Slug ON dbo.Tours AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    UPDATE t SET Slug = CASE WHEN EXISTS (SELECT 1 FROM dbo.Tours x WHERE x.Slug = dbo.fn_Slugify(t.Title) AND x.TourId <> t.TourId)
                             THEN LEFT(dbo.fn_Slugify(t.Title) + '-' + LOWER(t.Code), 120) ELSE dbo.fn_Slugify(t.Title) END
    FROM dbo.Tours t JOIN inserted i ON i.TourId = t.TourId WHERE t.Slug IS NULL;
END;
GO
CREATE OR ALTER TRIGGER dbo.TR_TravelServices_Slug ON dbo.TravelServices AFTER INSERT AS
BEGIN
    SET NOCOUNT ON;
    UPDATE s SET Slug = CASE WHEN EXISTS (SELECT 1 FROM dbo.TravelServices x WHERE x.Slug = dbo.fn_Slugify(s.Name) AND x.ServiceId <> s.ServiceId)
                             THEN LEFT(dbo.fn_Slugify(s.Name) + '-' + LOWER(s.Code), 120) ELSE dbo.fn_Slugify(s.Name) END
    FROM dbo.TravelServices s JOIN inserted i ON i.ServiceId = s.ServiceId WHERE s.Slug IS NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '107_slugs.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('107_slugs.sql');
