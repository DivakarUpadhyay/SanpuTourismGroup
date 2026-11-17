/* 003_menu_descriptions.sql — optional one-line description per menu (shown in customer mega-menus). Idempotent. */
SET NOCOUNT ON;
IF COL_LENGTH('dbo.Menus', 'Description') IS NULL ALTER TABLE dbo.Menus ADD Description nvarchar(200) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '003_menu_descriptions.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('003_menu_descriptions.sql');
