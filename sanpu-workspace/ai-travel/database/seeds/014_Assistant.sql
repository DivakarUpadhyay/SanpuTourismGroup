/* 014_Assistant.sql — AI assistant for travelers (plan, compare, book, check bookings) and the staff view of assistant bookings. Idempotent. */
SET NOCOUNT ON;
DECLARE @P TABLE (K varchar(100), M varchar(50), A varchar(50), D nvarchar(300));
INSERT @P VALUES
 ('Assistant.Use','Assistant','Use',N'Chat with the AI travel assistant (plan, compare, prepare bookings)'),
 ('Reservation.ViewOwn','Reservation','ViewOwn',N'Traveler: see, pay and cancel own bookings'),
 ('Reservation.View','Reservation','View',N'Staff: see all bookings made with the assistant');
INSERT dbo.Permissions(PermissionKey, ModuleKey, ActionKey, Description)
SELECT K, M, A, D FROM @P p WHERE NOT EXISTS (SELECT 1 FROM dbo.Permissions x WHERE x.PermissionKey = p.K);

DECLARE @RP TABLE (R varchar(50), P varchar(100));
INSERT @RP VALUES ('traveler','Assistant.Use'),('traveler','Reservation.ViewOwn'),
 ('system_admin','Reservation.View'),('ops_supervisor','Reservation.View'),('ops_agent','Reservation.View');
INSERT dbo.RolePermissions(RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId FROM @RP x JOIN dbo.Roles r ON r.RoleKey = x.R JOIN dbo.Permissions p ON p.PermissionKey = x.P
WHERE NOT EXISTS (SELECT 1 FROM dbo.RolePermissions y WHERE y.RoleId = r.RoleId AND y.PermissionId = p.PermissionId);
UPDATE u SET PermissionVersion = PermissionVersion + 1 FROM dbo.Users u
WHERE EXISTS (SELECT 1 FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId WHERE ur.UserId = u.UserId AND r.RoleKey IN (SELECT R FROM @RP))
  AND NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '014_Assistant.seed');

DECLARE @M TABLE (K varchar(100), PK varchar(100), T nvarchar(100), R varchar(200), I varchar(50), S int, A varchar(20), Perms varchar(400), D nvarchar(300));
INSERT @M VALUES
 ('cust.assistant', NULL, N'AI assistant', '/assistant', 'sparkle', 12, 'Customer', 'Assistant.Use', N'Plan, compare and book in one conversation'),
 ('cust.bookings', NULL, N'My bookings', '/my/bookings', 'ticket', 22, 'Customer', 'Reservation.ViewOwn', N'Bookings you made with the assistant'),
 ('ai.reservations', 'grp.copilot', N'Assistant bookings', '/admin/reservations', 'ticket', 25, 'Admin', 'Reservation.View', N'Every booking travelers made with the AI assistant');
INSERT dbo.Menus(MenuKey, Title, RoutePath, IconKey, SortOrder, ApplicationArea, Description)
SELECT K, T, R, I, S, A, D FROM @M m WHERE NOT EXISTS (SELECT 1 FROM dbo.Menus x WHERE x.MenuKey = m.K);
UPDATE c SET ParentMenuId = p.MenuId FROM dbo.Menus c JOIN @M m ON m.K = c.MenuKey JOIN dbo.Menus p ON p.MenuKey = m.PK WHERE c.ParentMenuId IS NULL AND m.PK IS NOT NULL;
INSERT dbo.MenuPermissions(MenuId, PermissionId)
SELECT DISTINCT mn.MenuId, p.PermissionId FROM @M m CROSS APPLY STRING_SPLIT(ISNULL(m.Perms, ''), ',') s
JOIN dbo.Menus mn ON mn.MenuKey = m.K JOIN dbo.Permissions p ON p.PermissionKey = s.value
WHERE s.value <> '' AND NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions x WHERE x.MenuId = mn.MenuId AND x.PermissionId = p.PermissionId);

-- the assistant replaces the older single-question page in the customer menu
UPDATE dbo.Menus SET IsActive = 0 WHERE MenuKey = 'cust.ask';
UPDATE dbo.Menus SET Title = N'Trip plans', Description = N'Day-by-day plans with live disruption recovery' WHERE MenuKey = 'cust.trips';
UPDATE dbo.Menus SET Title = N'Plan from a template', SortOrder = 35 WHERE MenuKey = 'cust.plan';

IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = 'Assistant.MaxToolRounds')
    INSERT dbo.AppSettings(SettingKey, SettingValue, ValueType, Category, Description, ValidationJson, IsPublic, IsEditable)
    VALUES ('Assistant.MaxToolRounds', N'8', 'Int', 'Ai', N'Most tool calls the assistant may make for one message', N'{"min":1,"max":15}', 0, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = 'Assistant.DepositPercent')
    INSERT dbo.AppSettings(SettingKey, SettingValue, ValueType, Category, Description, ValidationJson, IsPublic, IsEditable)
    VALUES ('Assistant.DepositPercent', N'30', 'Int', 'Ai', N'Deposit share when a traveler pays part now', N'{"min":10,"max":90}', 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '014_Assistant.seed')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('014_Assistant.seed');
IF NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = 'Assistant.ProviderOrder')
    INSERT dbo.AppSettings(SettingKey, SettingValue, ValueType, Category, Description, ValidationJson, IsPublic, IsEditable)
    VALUES ('Assistant.ProviderOrder', N'Gemini,OpenAI,Anthropic', 'String', 'Ai', N'Which AI answers first; the next one takes over when the first is unavailable', N'{"maxLength":40}', 0, 1);
