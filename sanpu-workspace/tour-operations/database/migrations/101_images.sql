/* 101_images.sql — image paths are content, so they live in the database (staff can change them without a rebuild). Idempotent. */
SET NOCOUNT ON;
IF COL_LENGTH('dbo.Destinations', 'ImageUrl') IS NULL ALTER TABLE dbo.Destinations ADD ImageUrl nvarchar(300) NULL;
IF COL_LENGTH('dbo.Tours', 'ImageUrl') IS NULL ALTER TABLE dbo.Tours ADD ImageUrl nvarchar(300) NULL;   -- optional override of the destination image
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '101_images.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('101_images.sql');
