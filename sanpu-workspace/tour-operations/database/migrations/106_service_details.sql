/* 106_service_details.sql — content for the hotel / flight / bus / taxi detail pages. All optional; staff edit it in Admin. Idempotent. */
SET NOCOUNT ON;
IF COL_LENGTH('dbo.TravelServices', 'Description') IS NULL ALTER TABLE dbo.TravelServices ADD Description nvarchar(1500) NULL;
IF COL_LENGTH('dbo.TravelServices', 'Address') IS NULL ALTER TABLE dbo.TravelServices ADD Address nvarchar(250) NULL;
IF COL_LENGTH('dbo.TravelServices', 'Highlights') IS NULL ALTER TABLE dbo.TravelServices ADD Highlights nvarchar(800) NULL;   -- one per line
IF COL_LENGTH('dbo.TravelServices', 'FactsJson') IS NULL ALTER TABLE dbo.TravelServices ADD FactsJson nvarchar(2000) NULL;   -- [{"label":"Check-in","value":"15:00"}, ...]
IF COL_LENGTH('dbo.TravelServices', 'Gallery') IS NULL ALTER TABLE dbo.TravelServices ADD Gallery nvarchar(800) NULL;         -- image paths, comma separated
IF COL_LENGTH('dbo.TravelServices', 'Latitude') IS NULL ALTER TABLE dbo.TravelServices ADD Latitude decimal(9,6) NULL;
IF COL_LENGTH('dbo.TravelServices', 'Longitude') IS NULL ALTER TABLE dbo.TravelServices ADD Longitude decimal(9,6) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_TravelServices_FactsJson')
    ALTER TABLE dbo.TravelServices ADD CONSTRAINT CK_TravelServices_FactsJson CHECK (FactsJson IS NULL OR ISJSON(FactsJson) = 1);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_TravelServices_Geo')
    ALTER TABLE dbo.TravelServices ADD CONSTRAINT CK_TravelServices_Geo CHECK ((Latitude IS NULL OR Latitude BETWEEN -90 AND 90) AND (Longitude IS NULL OR Longitude BETWEEN -180 AND 180));
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '106_service_details.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('106_service_details.sql');
