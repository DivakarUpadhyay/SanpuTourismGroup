/* 014_StaffAccess.sql — permissions, roles, menus and settings for marketing, customer care, travel services and payments.
   Insert-if-missing only, so administrator edits are kept. Idempotent. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;
DECLARE @P TABLE (K varchar(100), M varchar(50), A varchar(50), D nvarchar(300));
INSERT @P VALUES
 ('Marketing.View','Marketing','View',N'See promotions, coupons and their performance'),
 ('Marketing.Manage','Marketing','Manage',N'Create and change promotions and coupon codes'),
 ('Help.Manage','Help','Manage',N'Write and publish help center articles'),
 ('Contact.Manage','Contact','Manage',N'Answer and close customer contact requests'),
 ('Service.View','Service','View',N'See hotels, flights, buses, taxis, inventory and their bookings'),
 ('Service.Manage','Service','Manage',N'Create services and open, price or close inventory');
INSERT dbo.Permissions(PermissionKey, ModuleKey, ActionKey, Description)
SELECT K, M, A, D FROM @P p WHERE NOT EXISTS (SELECT 1 FROM dbo.Permissions x WHERE x.PermissionKey = p.K);

INSERT dbo.Roles(RoleKey, RoleName, Description, IsSystem)
SELECT 'marketing_manager', N'Marketing Manager', N'Runs promotions, coupons and the help center', 0
WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleKey = 'marketing_manager');

DECLARE @G TABLE (RoleKey varchar(50), Pattern varchar(100));
INSERT @G VALUES
 ('system_admin','Marketing.%'),('system_admin','Help.%'),('system_admin','Contact.%'),('system_admin','Service.%'),
 ('marketing_manager','Marketing.%'),('marketing_manager','Help.Manage'),('marketing_manager','Contact.Manage'),('marketing_manager','Ops.Dashboard.View'),
 ('marketing_manager','Catalog.View'),('marketing_manager','Service.View'),('marketing_manager','Account.Self'),
 ('ops_manager','Service.%'),('ops_manager','Contact.Manage'),('ops_manager','Marketing.View'),
 ('reservations_agent','Service.View'),('reservations_agent','Contact.Manage'),
 ('finance','Service.View'),('finance','Marketing.View');
INSERT dbo.RolePermissions(RoleId, PermissionId)
SELECT DISTINCT r.RoleId, p.PermissionId
FROM @G g JOIN dbo.Roles r ON r.RoleKey = g.RoleKey JOIN dbo.Permissions p ON p.PermissionKey LIKE g.Pattern
WHERE NOT EXISTS (SELECT 1 FROM dbo.RolePermissions x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);
-- new grants must invalidate cached permission sets (only when something was actually granted)
IF @@ROWCOUNT > 0
    UPDATE u SET PermissionVersion = PermissionVersion + 1 FROM dbo.Users u
    WHERE EXISTS (SELECT 1 FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId WHERE ur.UserId = u.UserId AND r.RoleKey IN (SELECT RoleKey FROM @G));

INSERT dbo.Users(Email, NormalizedEmail, DisplayName, UserType, IsDemo, EmailVerifiedAtUtc)
SELECT 'marketing@demo.sanpu.test', 'marketing@demo.sanpu.test', N'Kao Yu-Ting', 'Staff', 1, SYSUTCDATETIME()
WHERE NOT EXISTS (SELECT 1 FROM dbo.Users WHERE NormalizedEmail = 'marketing@demo.sanpu.test');
INSERT dbo.UserRoles(UserId, RoleId)
SELECT u.UserId, r.RoleId FROM dbo.Users u JOIN dbo.Roles r ON r.RoleKey = 'marketing_manager'
WHERE u.NormalizedEmail = 'marketing@demo.sanpu.test' AND NOT EXISTS (SELECT 1 FROM dbo.UserRoles y WHERE y.UserId = u.UserId);

/* ---- admin menus ---- */
DECLARE @M TABLE (K varchar(100), PK varchar(100), T nvarchar(100), R nvarchar(200), I varchar(50), S int, Perms varchar(400));
INSERT @M VALUES
 ('grp.services', NULL, N'Travel services', NULL, 'plane', 25, NULL),
 ('svc.catalog', 'grp.services', N'Hotels, flights, buses & taxis', '/admin/services', 'building', 10, 'Service.View,Service.Manage'),
 ('svc.bookings', 'grp.services', N'Service bookings', '/admin/service-bookings', 'ticket', 20, 'Service.View,Service.Manage'),
 ('grp.marketing', NULL, N'Sales & marketing', NULL, 'tag', 35, NULL),
 ('mkt.promotions', 'grp.marketing', N'Promotions & banners', '/admin/promotions', 'sparkle', 10, 'Marketing.View,Marketing.Manage'),
 ('mkt.coupons', 'grp.marketing', N'Coupon codes', '/admin/coupons', 'tag', 20, 'Marketing.View,Marketing.Manage'),
 ('grp.care', NULL, N'Customer care', NULL, 'help', 37, NULL),
 ('care.contacts', 'grp.care', N'Contact requests', '/admin/contacts', 'phone', 10, 'Contact.Manage'),
 ('care.help', 'grp.care', N'Help center', '/admin/help', 'help', 20, 'Help.Manage');
INSERT dbo.Menus(MenuKey, Title, RoutePath, IconKey, SortOrder, ApplicationArea)
SELECT K, T, R, I, S, 'Admin' FROM @M m WHERE NOT EXISTS (SELECT 1 FROM dbo.Menus x WHERE x.MenuKey = m.K);
UPDATE c SET ParentMenuId = p.MenuId FROM dbo.Menus c JOIN @M m ON m.K = c.MenuKey JOIN dbo.Menus p ON p.MenuKey = m.PK WHERE c.ParentMenuId IS NULL AND m.PK IS NOT NULL;
INSERT dbo.MenuPermissions(MenuId, PermissionId)
SELECT DISTINCT mn.MenuId, p.PermissionId
FROM @M m CROSS APPLY STRING_SPLIT(ISNULL(m.Perms, ''), ',') s JOIN dbo.Menus mn ON mn.MenuKey = m.K JOIN dbo.Permissions p ON p.PermissionKey = s.value
WHERE s.value <> '' AND NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions y WHERE y.MenuId = mn.MenuId);

/* ---- payment settings ---- */
INSERT dbo.AppSettings(SettingKey, SettingValue, ValueType, Category, Description, ValidationJson, IsPublic, IsEditable)
SELECT k, v, t, c, d, j, 1, 1 FROM (VALUES
 ('Feature.PartialPayment', N'true', 'Bool', 'Features', N'Let customers pay a deposit now and the balance later', NULL),
 ('Payment.DepositPercent', N'30', 'Int', 'Payments', N'Deposit as a percentage of the booking total', N'{"min":5,"max":90}'),
 ('Payment.BalanceDueDays', N'14', 'Int', 'Payments', N'The balance is due this many days before the start date', N'{"min":1,"max":90}')
) s(k, v, t, c, d, j) WHERE NOT EXISTS (SELECT 1 FROM dbo.AppSettings a WHERE a.SettingKey = s.k);
COMMIT;
PRINT '014_StaffAccess applied';
