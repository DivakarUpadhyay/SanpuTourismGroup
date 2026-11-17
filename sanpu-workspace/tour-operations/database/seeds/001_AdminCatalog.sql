/* 001_AdminCatalog.sql — ERP roles, permissions, menus, settings, content, demo users (no passwords).
   Insert-if-missing only: re-running never overwrites administrator edits. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;

/* ---- permissions ---- */
DECLARE @P TABLE (K varchar(100), M varchar(50), A varchar(50), D nvarchar(300));
INSERT @P VALUES
 ('Admin.Dashboard.View','Admin','View',N'System administration overview'),
 ('Admin.Users.View','Admin','View',N'List users and onboarding status'),
 ('Admin.Users.Edit','Admin','Edit',N'Invite users, assign roles, lock, deactivate, revoke sessions'),
 ('Admin.Roles.View','Admin','View',N'See roles and their permissions'),
 ('Admin.Roles.Edit','Admin','Edit',N'Create/edit roles and grant permissions'),
 ('Admin.Permissions.View','Admin','View',N'Browse the permission catalog'),
 ('Admin.Permissions.Edit','Admin','Edit',N'Edit permission descriptions / activation'),
 ('Admin.Menus.View','Admin','View',N'See the menu tree'),
 ('Admin.Menus.Edit','Admin','Edit',N'Create, move, delete menus and map permissions'),
 ('Admin.Settings.View','Admin','View',N'See application settings'),
 ('Admin.Settings.Edit','Admin','Edit',N'Change application settings'),
 ('Admin.Audit.View','Admin','View',N'Search the audit log'),
 ('Admin.Content.Edit','Admin','Edit',N'Edit content and notification templates'),
 ('Account.Self','Account','Self',N'Use own profile, password and data export'),
 ('Ops.Dashboard.View','Ops','View',N'Operations dashboard'),
 ('Catalog.View','Catalog','View',N'See tours and business units'),
 ('Catalog.Edit','Catalog','Edit',N'Create and edit tours and business units'),
 ('Departure.View','Departure','View',N'See departures and capacity'),
 ('Departure.Edit','Departure','Edit',N'Create and edit departures and capacity'),
 ('Booking.View','Booking','View',N'See all bookings (PII masked)'),
 ('Booking.Approve','Booking','Approve',N'Approve or reject bookings'),
 ('Booking.Cancel','Booking','Cancel',N'Cancel bookings and return seats'),
 ('Booking.Create','Booking','Create',N'Customer: hold seats and book'),
 ('Booking.ViewOwn','Booking','ViewOwn',N'Customer: see and cancel own bookings'),
 ('Pii.Reveal','Pii','Reveal',N'Reveal masked phone/passport (audited)'),
 ('Approval.Act','Approval','Act',N'Act on approval requests assigned to my role'),
 ('Workflow.View','Workflow','View',N'See workflow definitions'),
 ('Workflow.Edit','Workflow','Edit',N'Save new workflow versions'),
 ('Supplier.View','Supplier','View',N'See suppliers and connections'),
 ('Supplier.Edit','Supplier','Edit',N'Create and edit suppliers'),
 ('Integration.View','Integration','View',N'See webhook / integration events'),
 ('Integration.Retry','Integration','Retry',N'Retry failed integration events'),
 ('Finance.Payment','Finance','Payment',N'Record simulated payments'),
 ('Finance.Refund','Finance','Refund',N'Request refunds'),
 ('Finance.Reconcile','Finance','Reconcile',N'Run and resolve supplier reconciliation'),
 ('CostAssumption.Edit','CostAssumption','Edit',N'Edit cost assumptions used by simulations'),
 ('GroupPlan.Simulate','GroupPlan','Simulate',N'Run group assembly simulations'),
 ('GroupPlan.Submit','GroupPlan','Submit',N'Submit a group plan for approval'),
 ('Task.View','Task','View',N'See the staff task queue'),
 ('Task.Work','Task','Work',N'Take, assign and complete tasks'),
 ('Privacy.Manage','Privacy','Manage',N'Manage retention policies and run anonymisation');
INSERT dbo.Permissions(PermissionKey, ModuleKey, ActionKey, Description)
SELECT K, M, A, D FROM @P p WHERE NOT EXISTS (SELECT 1 FROM dbo.Permissions x WHERE x.PermissionKey = p.K);

/* ---- roles ---- */
DECLARE @R TABLE (K varchar(50), N nvarchar(100), D nvarchar(300), S bit);
INSERT @R VALUES
 ('system_admin', N'System Administrator', N'Full access; protected role', 1),
 ('ops_manager', N'Operations Manager', N'Runs departures, approves bookings and group plans', 0),
 ('reservations_agent', N'Reservations Agent', N'Handles bookings and customer tasks', 0),
 ('finance', N'Finance Officer', N'Payments, refunds, reconciliation', 0),
 ('director', N'Director', N'Escalation approver for large refunds and plans', 0),
 ('customer', N'Customer', N'Self-service booking portal', 1);
INSERT dbo.Roles(RoleKey, RoleName, Description, IsSystem)
SELECT K, N, D, S FROM @R r WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles x WHERE x.RoleKey = r.K);

/* ---- role grants (patterns) ---- */
DECLARE @G TABLE (RoleKey varchar(50), Pattern varchar(100));
INSERT @G VALUES
 ('system_admin','%'),
 ('ops_manager','Ops.%'),('ops_manager','Catalog.%'),('ops_manager','Departure.%'),('ops_manager','Booking.View'),('ops_manager','Booking.Approve'),
 ('ops_manager','Booking.Cancel'),('ops_manager','Approval.Act'),('ops_manager','Workflow.View'),('ops_manager','Supplier.View'),('ops_manager','Integration.%'),
 ('ops_manager','GroupPlan.%'),('ops_manager','Task.%'),('ops_manager','CostAssumption.Edit'),('ops_manager','Pii.Reveal'),('ops_manager','Admin.Audit.View'),('ops_manager','Account.Self'),
 ('reservations_agent','Ops.Dashboard.View'),('reservations_agent','Booking.View'),('reservations_agent','Booking.Cancel'),('reservations_agent','Departure.View'),
 ('reservations_agent','Catalog.View'),('reservations_agent','Task.%'),('reservations_agent','GroupPlan.Simulate'),('reservations_agent','GroupPlan.Submit'),('reservations_agent','Account.Self'),
 ('finance','Ops.Dashboard.View'),('finance','Booking.View'),('finance','Finance.%'),('finance','Approval.Act'),('finance','Supplier.View'),('finance','Integration.View'),
 ('finance','Task.%'),('finance','Account.Self'),
 ('director','Ops.Dashboard.View'),('director','Approval.Act'),('director','Booking.View'),('director','Booking.Approve'),('director','Workflow.View'),('director','Admin.Audit.View'),('director','Account.Self'),
 ('customer','Booking.Create'),('customer','Booking.ViewOwn'),('customer','Account.Self');
INSERT dbo.RolePermissions(RoleId, PermissionId)
SELECT DISTINCT r.RoleId, p.PermissionId
FROM @G g JOIN dbo.Roles r ON r.RoleKey = g.RoleKey JOIN dbo.Permissions p ON p.PermissionKey LIKE g.Pattern
WHERE NOT EXISTS (SELECT 1 FROM dbo.RolePermissions x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId)
  AND NOT (g.RoleKey = 'system_admin' AND p.PermissionKey IN ('Booking.Create','Booking.ViewOwn'));

/* ---- menus: (key, parentKey, title, route, icon, sort, area, permissions csv) ---- */
DECLARE @M TABLE (K varchar(100), PK varchar(100), T nvarchar(100), R nvarchar(200), I varchar(50), S int, A varchar(10), Perms varchar(400));
INSERT @M VALUES
 ('admin.dashboard', NULL, N'Dashboard', '/admin', 'dashboard', 10, 'Admin', 'Ops.Dashboard.View,Admin.Dashboard.View'),
 ('grp.ops', NULL, N'Operations', NULL, 'briefcase', 20, 'Admin', NULL),
 ('ops.bookings', 'grp.ops', N'Bookings', '/admin/bookings', 'ticket', 10, 'Admin', 'Booking.View'),
 ('ops.approvals', 'grp.ops', N'Approval inbox', '/admin/approvals', 'check', 20, 'Admin', 'Approval.Act'),
 ('ops.departures', 'grp.ops', N'Departures', '/admin/departures', 'calendar', 30, 'Admin', 'Departure.View'),
 ('ops.tours', 'grp.ops', N'Tours', '/admin/tours', 'map', 40, 'Admin', 'Catalog.View'),
 ('ops.tasks', 'grp.ops', N'Task queue', '/admin/tasks', 'list', 50, 'Admin', 'Task.View'),
 ('ops.groupsim', 'grp.ops', N'Group simulation', '/admin/group-sim', 'users', 60, 'Admin', 'GroupPlan.Simulate'),
 ('grp.partners', NULL, N'Partners & finance', NULL, 'handshake', 30, 'Admin', NULL),
 ('ops.suppliers', 'grp.partners', N'Suppliers', '/admin/suppliers', 'truck', 10, 'Admin', 'Supplier.View'),
 ('ops.integrations', 'grp.partners', N'Integrations', '/admin/integrations', 'plug', 20, 'Admin', 'Integration.View'),
 ('ops.reconciliation', 'grp.partners', N'Reconciliation', '/admin/reconciliation', 'scale', 30, 'Admin', 'Finance.Reconcile'),
 ('ops.units', 'grp.partners', N'Business units', '/admin/business-units', 'building', 40, 'Admin', 'Catalog.View'),
 ('ops.costs', 'grp.partners', N'Cost assumptions', '/admin/cost-assumptions', 'calculator', 50, 'Admin', 'CostAssumption.Edit'),
 ('grp.admin', NULL, N'Administration', NULL, 'settings', 40, 'Admin', NULL),
 ('admin.system', 'grp.admin', N'System overview', '/admin/system', 'gauge', 5, 'Admin', 'Admin.Dashboard.View'),
 ('admin.users', 'grp.admin', N'Users', '/admin/users', 'user', 10, 'Admin', 'Admin.Users.View'),
 ('admin.roles', 'grp.admin', N'Roles', '/admin/roles', 'shield', 20, 'Admin', 'Admin.Roles.View'),
 ('admin.permissions', 'grp.admin', N'Permissions', '/admin/permissions', 'key', 30, 'Admin', 'Admin.Permissions.View'),
 ('admin.menus', 'grp.admin', N'Menus', '/admin/menus', 'tree', 40, 'Admin', 'Admin.Menus.View'),
 ('admin.settings', 'grp.admin', N'Settings', '/admin/settings', 'sliders', 50, 'Admin', 'Admin.Settings.View'),
 ('admin.workflows', 'grp.admin', N'Workflows', '/admin/workflows', 'flow', 60, 'Admin', 'Workflow.View'),
 ('admin.content', 'grp.admin', N'Content', '/admin/content', 'file', 70, 'Admin', 'Admin.Content.Edit'),
 ('admin.privacy', 'grp.admin', N'Privacy & retention', '/admin/privacy', 'lock', 80, 'Admin', 'Privacy.Manage'),
 ('admin.audit', 'grp.admin', N'Audit log', '/admin/audit', 'history', 90, 'Admin', 'Admin.Audit.View'),
 ('cust.tours', NULL, N'Tours', '/', 'map', 10, 'Customer', NULL),
 ('cust.bookings', NULL, N'My bookings', '/my/bookings', 'ticket', 20, 'Customer', 'Booking.ViewOwn'),
 ('cust.account', NULL, N'My account', '/account', 'user', 30, 'Customer', 'Account.Self');
INSERT dbo.Menus(MenuKey, Title, RoutePath, IconKey, SortOrder, ApplicationArea)
SELECT K, T, R, I, S, A FROM @M m WHERE NOT EXISTS (SELECT 1 FROM dbo.Menus x WHERE x.MenuKey = m.K);
UPDATE c SET ParentMenuId = p.MenuId FROM dbo.Menus c JOIN @M m ON m.K = c.MenuKey JOIN dbo.Menus p ON p.MenuKey = m.PK WHERE c.ParentMenuId IS NULL AND m.PK IS NOT NULL;
INSERT dbo.MenuPermissions(MenuId, PermissionId)
SELECT DISTINCT mn.MenuId, p.PermissionId
FROM @M m CROSS APPLY STRING_SPLIT(ISNULL(m.Perms, ''), ',') s JOIN dbo.Menus mn ON mn.MenuKey = m.K JOIN dbo.Permissions p ON p.PermissionKey = s.value
WHERE s.value <> '' AND NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions x WHERE x.MenuId = mn.MenuId AND x.PermissionId = p.PermissionId)
  AND NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions y WHERE y.MenuId = mn.MenuId);   -- only seed menus that have no mapping yet

/* ---- settings ---- */
DECLARE @S TABLE (K varchar(150), V nvarchar(max), T varchar(20), C varchar(50), D nvarchar(500), Vj nvarchar(1000), Pub bit, Ed bit);
INSERT @S VALUES
 ('Ui.BrandName', N'Sanpu Travel', 'String', 'Content', N'Product name in the header', N'{"maxLength":60}', 1, 1),
 ('Ui.HeroTagline', N'Vertically integrated, distinctly different', 'String', 'Content', N'Gold tagline above the home title', N'{"maxLength":60}', 1, 1),
 ('Ui.HeroTitle', N'Tours run by one connected group', 'String', 'Content', N'Home page title', N'{"maxLength":120}', 1, 1),
 ('Ui.DemoLabel', N'', 'String', 'Content', N'Badge shown on seeded demo records', N'{"maxLength":40}', 1, 1),
 ('Ui.SupportEmail', N'support@sanpu.test', 'String', 'Content', N'Shown in the footer', N'{"maxLength":120}', 1, 1),
 ('Ui.Languages', N'["en"]', 'Json', 'Content', N'Languages offered on the profile page', N'{"type":"array"}', 1, 1),
 ('Booking.HoldMinutes', N'15', 'Int', 'Booking', N'How long a seat hold lasts', N'{"min":1,"max":60}', 1, 1),
 ('Booking.MaxPaxPerBooking', N'10', 'Int', 'Booking', N'Largest party per booking', N'{"min":1,"max":50}', 1, 1),
 ('Feature.GroupSimulation', N'true', 'Bool', 'Features', N'Show the group simulation module', NULL, 1, 1),
 ('Feature.CustomerCancellation', N'true', 'Bool', 'Features', N'Customers may request cancellation online', NULL, 1, 1),
 ('Feature.CustomerSignup', N'true', 'Bool', 'Features', N'Allow customer self sign-up', NULL, 1, 1),
 ('Auth.MaxFailedLogins', N'5', 'Int', 'Security', N'Failed logins before a temporary lockout', N'{"min":3,"max":20}', 0, 1),
 ('Auth.LockoutMinutes', N'15', 'Int', 'Security', N'Lockout length', N'{"min":1,"max":1440}', 0, 1),
 ('Auth.AccessTokenMinutes', N'10', 'Int', 'Security', N'JWT lifetime', N'{"min":2,"max":60}', 0, 1),
 ('Auth.RefreshTokenDays', N'14', 'Int', 'Security', N'Refresh token lifetime', N'{"min":1,"max":90}', 0, 1),
 ('Auth.InvitationHours', N'72', 'Int', 'Security', N'Invitation link lifetime', N'{"min":1,"max":336}', 0, 1),
 ('Auth.ResetTokenMinutes', N'30', 'Int', 'Security', N'Password reset link lifetime', N'{"min":5,"max":1440}', 0, 1),
 ('Auth.DefaultCustomerRole', N'customer', 'String', 'Security', N'Role given to self-registered customers', N'{"maxLength":50}', 0, 0),
 ('Integration.MaxAttempts', N'5', 'Int', 'Integration', N'Retries before an event goes to dead letter', N'{"min":1,"max":10}', 0, 1),
 ('Integration.SignatureToleranceSeconds', N'300', 'Int', 'Integration', N'Allowed clock skew for webhook signatures', N'{"min":30,"max":900}', 0, 1),
 ('Tasks.CancelRequestSlaHours', N'4', 'Int', 'Operations', N'SLA for customer cancellation tasks', N'{"min":1,"max":72}', 0, 1),
 ('Tasks.ReconMismatchSlaHours', N'24', 'Int', 'Operations', N'SLA for reconciliation exception tasks', N'{"min":1,"max":168}', 0, 1),
 ('Privacy.NoticeVersion', N'2026-11', 'String', 'Privacy', N'Privacy notice version customers accept', N'{"maxLength":20}', 1, 1),
 ('Email.Mode', N'DevOutbox', 'String', 'Email', N'DevOutbox keeps mail in the local test inbox; Smtp needs SMTP_* env vars', N'{"allowed":["DevOutbox","Smtp"]}', 0, 1),
 ('Email.SmtpPasswordRef', N'SMTP_PASSWORD', 'SecretRef', 'Email', N'Name of the env var holding the SMTP password (value never stored here)', NULL, 0, 1),
 ('Payments.Provider', N'SIMULATED', 'String', 'Finance', N'Only SIMULATED until a real provider is approved', N'{"allowed":["SIMULATED"]}', 1, 0);
INSERT dbo.AppSettings(SettingKey, SettingValue, ValueType, Category, Description, ValidationJson, IsPublic, IsEditable)
SELECT K, V, T, C, D, Vj, Pub, Ed FROM @S s WHERE NOT EXISTS (SELECT 1 FROM dbo.AppSettings x WHERE x.SettingKey = s.K);

/* ---- content & notification templates ---- */
DECLARE @C TABLE (K varchar(100), L varchar(10), Kind varchar(20), Sub nvarchar(200), B nvarchar(max), Pub bit);
INSERT @C VALUES
 ('email.invitation','en','Notification',N'Your Sanpu Tour Ops ERP invitation',N'Hello {{displayName}},\n\nYou have been invited to Sanpu Tour Ops ERP. Set your password here (valid {{hours}} hours):\n{{link}}\n\nIf you did not expect this, ignore this email.',0),
 ('email.password_reset','en','Notification',N'Reset your password',N'Hello {{displayName}},\n\nUse this link within {{minutes}} minutes to set a new password:\n{{link}}\n\nIf you did not ask for this, you can ignore it.',0),
 ('home.hero','en','Content',N'Tours run by one connected group',N'Transport, hotels, dining and guides from one group, so every departure is planned end to end.',1),
 ('privacy.notice','en','Content',N'Privacy notice',N'We use your name, phone and ID number only to run your booking. Phone and ID are encrypted and shown masked to staff. Data is anonymised after the retention period.',1);
INSERT dbo.ContentTemplates(TemplateKey, Locale, Kind, Subject, Body, IsPublic)
SELECT K, L, Kind, Sub, REPLACE(B, '\n', CHAR(10)), Pub FROM @C c WHERE NOT EXISTS (SELECT 1 FROM dbo.ContentTemplates x WHERE x.TemplateKey = c.K AND x.Locale = c.L);

/* ---- demo users (no password: provisioned by the CLI with random passwords) ---- */
DECLARE @U TABLE (E nvarchar(256), N nvarchar(100), T varchar(10), R varchar(50));
INSERT @U VALUES
 ('admin@demo.sanpu.test', N'System Administrator', 'Staff', 'system_admin'),
 ('ops.manager@demo.sanpu.test', N'Wang Chih-Wei', 'Staff', 'ops_manager'),
 ('agent@demo.sanpu.test', N'Lin Mei-Hua', 'Staff', 'reservations_agent'),
 ('finance@demo.sanpu.test', N'Huang Li', 'Staff', 'finance'),
 ('director@demo.sanpu.test', N'Tsai Ming', 'Staff', 'director'),
 ('traveler.chen@demo.sanpu.test', N'Chen Ya-Ting', 'Customer', 'customer'),
 ('traveler.lee@demo.sanpu.test', N'Lee Min', 'Customer', 'customer');
INSERT dbo.Users(Email, NormalizedEmail, DisplayName, UserType, IsDemo, EmailVerifiedAtUtc)
SELECT E, LOWER(E), N, T, 1, SYSUTCDATETIME() FROM @U u WHERE NOT EXISTS (SELECT 1 FROM dbo.Users x WHERE x.NormalizedEmail = LOWER(u.E));
INSERT dbo.UserRoles(UserId, RoleId)
SELECT x.UserId, r.RoleId FROM @U u JOIN dbo.Users x ON x.NormalizedEmail = LOWER(u.E) JOIN dbo.Roles r ON r.RoleKey = u.R
WHERE NOT EXISTS (SELECT 1 FROM dbo.UserRoles y WHERE y.UserId = x.UserId);

COMMIT;
PRINT '001_AdminCatalog applied';
