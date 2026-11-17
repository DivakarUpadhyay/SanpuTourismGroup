/* 201_images.sql — region image paths live in the database. Idempotent. */
SET NOCOUNT ON;
IF COL_LENGTH('dbo.Regions', 'ImageUrl') IS NULL ALTER TABLE dbo.Regions ADD ImageUrl nvarchar(300) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '201_images.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('201_images.sql');
