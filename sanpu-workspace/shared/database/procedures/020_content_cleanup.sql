/* 020_content_cleanup.sql — removes legacy "DEMO" / "(DEMO)" / "Fictional ..." wording from rows created by older seeds.
   Runs over every nvarchar column of the business tables; the insert-only audit log and token tables are never touched.
   Idempotent: rows without the old wording are not updated. */
SET NOCOUNT ON;
DECLARE @sql nvarchar(max) = N'';
SELECT @sql += N'UPDATE ' + QUOTENAME(s.name) + N'.' + QUOTENAME(t.name) + N' SET ' + QUOTENAME(c.name) + N' = '
     + N'LTRIM(REPLACE(REPLACE(REPLACE(REPLACE(CASE WHEN ' + QUOTENAME(c.name) + N' LIKE N''DEMO [A-Z0-9]%'' THEN STUFF(' + QUOTENAME(c.name) + N', 1, 5, N'''') ELSE ' + QUOTENAME(c.name) + N' END, '
     + N'N'' (DEMO)'', N''''), N'' Fictional itinerary.'', N''''), N'' Fictional package.'', N''''), N''DEMO '', N''''))'
     + N' WHERE ' + QUOTENAME(c.name) + N' LIKE N''%DEMO [A-Z0-9]%'' OR ' + QUOTENAME(c.name) + N' LIKE N''DEMO [A-Z0-9]%'' OR ' + QUOTENAME(c.name) + N' LIKE N''% (DEMO)%'' OR ' + QUOTENAME(c.name) + N' LIKE N''% Fictional %'';' + CHAR(10)
FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE s.name = 'dbo' AND ty.name IN ('nvarchar', 'varchar') AND c.max_length <> -1 AND c.is_computed = 0
  AND t.name NOT IN ('AuditLogs', 'RefreshTokens', 'UserInvitations', 'PasswordResetTokens', 'SchemaVersions', 'Users')
  AND NOT EXISTS (SELECT 1 FROM sys.triggers tr WHERE tr.parent_id = t.object_id AND (tr.is_instead_of_trigger = 1 OR tr.name LIKE '%Immutable%'))   -- insert-only history
  AND c.name NOT IN ('Code', 'Email', 'NormalizedEmail', 'IdempotencyKey', 'EventId', 'CorrelationId', 'SettingKey', 'Status');
EXEC sys.sp_executesql @sql;
-- display names (the Users table is handled on its own so emails are never touched)
UPDATE dbo.Users SET DisplayName = REPLACE(DisplayName, N' (DEMO)', N'') WHERE DisplayName LIKE N'% (DEMO)%';
-- legacy settings/content wording
UPDATE dbo.AppSettings SET SettingValue = N'' WHERE SettingKey = 'Ui.DemoLabel';
UPDATE dbo.ContentTemplates SET Body = REPLACE(Body, N' All tours shown here are fictional demo data.', N'') WHERE Body LIKE N'%fictional demo data%';
UPDATE dbo.ContentTemplates SET Body = REPLACE(Body, N' All trips and places here are fictional demo data.', N'') WHERE Body LIKE N'%fictional demo data%';
UPDATE dbo.ContentTemplates SET Subject = N'Privacy notice', Body = REPLACE(Body, N' Demo text: a real deployment needs review under Taiwan''s Personal Data Protection Act.', N'') WHERE TemplateKey = 'privacy.notice' AND Subject = N'Privacy notice (demo)';
UPDATE dbo.AppSettings SET SettingValue = N'support@sanpu.test' WHERE SettingKey = 'Ui.SupportEmail' AND SettingValue = N'support@demo.sanpu.test';
UPDATE dbo.AppSettings SET SettingValue = N'Sanpu Travel' WHERE SettingKey = 'Ui.BrandName' AND SettingValue = N'Sanpu Tour Ops ERP';
UPDATE dbo.AppSettings SET SettingValue = N'Sanpu Trip Copilot' WHERE SettingKey = 'Ui.BrandName' AND SettingValue = N'Sanpu AI Operations Copilot';
UPDATE dbo.Users SET DisplayName = N'System Administrator' WHERE DisplayName = N'Demo Admin';
