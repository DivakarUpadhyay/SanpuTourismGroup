/* 025_ContactInbox.sql — the team address that receives contact form messages. Set the real address in the database. Idempotent. */
SET NOCOUNT ON;
IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = 'Contact.InboxEmail')
    INSERT dbo.AppSettings(SettingKey, SettingValue, ValueType, Category, Description, ValidationJson, IsPublic, IsEditable)
    VALUES ('Contact.InboxEmail', N'', 'String', 'Operations', N'Team email address that receives contact form messages', N'{"maxLength":256}', 0, 1);
