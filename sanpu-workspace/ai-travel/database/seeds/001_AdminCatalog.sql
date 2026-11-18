/* 001_AdminCatalog.sql — AI Copilot roles, permissions, menus, settings, content, demo users (no passwords). Insert-if-missing only. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;

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
 ('AiOps.Dashboard.View','AiOps','View',N'Copilot operations dashboard'),
 ('Ai.Search','Ai','Search',N'Ask the copilot; results are limited to rows the caller may see'),
 ('Trip.View','Trip','View',N'See all trips (staff)'),
 ('Trip.ViewOwn','Trip','ViewOwn',N'Traveler: see own trips'),
 ('Trip.Create','Trip','Create',N'Traveler: create a trip and generate an itinerary'),
 ('Scenario.View','Scenario','View',N'See disruption scenarios'),
 ('Scenario.Edit','Scenario','Edit',N'Create and edit disruption scenarios'),
 ('Simulation.Run','Simulation','Run',N'Run disruption simulations and draft proposals'),
 ('Proposal.View','Proposal','View',N'See recovery proposals'),
 ('Ai.Proposal.Approve','Ai','Approve',N'Approve or reject recovery proposals (human in the loop)'),
 ('Document.Upload','Document','Upload',N'Upload supplier / itinerary documents'),
 ('Document.Review','Document','Review',N'Review extracted fields and accept or reject documents'),
 ('Template.Edit','Template','Edit',N'Edit itinerary templates'),
 ('Constraint.Edit','Constraint','Edit',N'Edit travel constraint rules'),
 ('Ai.Config.View','Ai','View',N'See AI configuration and prompt versions'),
 ('Ai.Config.Edit','Ai','Edit',N'Change AI settings and save prompt versions'),
 ('Ai.Eval.Run','Ai','Eval',N'Run the evaluation suite and add feedback'),
 ('Ai.Usage.View','Ai','Usage',N'See AI token usage and cost');
INSERT dbo.Permissions(PermissionKey, ModuleKey, ActionKey, Description)
SELECT K, M, A, D FROM @P p WHERE NOT EXISTS (SELECT 1 FROM dbo.Permissions x WHERE x.PermissionKey = p.K);

DECLARE @R TABLE (K varchar(50), N nvarchar(100), D nvarchar(300), S bit);
INSERT @R VALUES
 ('system_admin', N'System Administrator', N'Full access; protected role', 1),
 ('ops_agent', N'Operations Agent', N'Runs simulations, drafts proposals, uploads documents', 0),
 ('ops_supervisor', N'Operations Supervisor', N'Approves recovery proposals and reviews documents', 0),
 ('ai_engineer', N'AI Engineer', N'Owns model settings, prompts, evaluations and cost', 0),
 ('traveler', N'Traveler', N'Self-service trip planning', 1);
INSERT dbo.Roles(RoleKey, RoleName, Description, IsSystem)
SELECT K, N, D, S FROM @R r WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles x WHERE x.RoleKey = r.K);

DECLARE @G TABLE (RoleKey varchar(50), Pattern varchar(100));
INSERT @G VALUES
 ('system_admin','%'),
 ('ops_agent','AiOps.Dashboard.View'),('ops_agent','Ai.Search'),('ops_agent','Trip.View'),('ops_agent','Scenario.View'),('ops_agent','Simulation.Run'),
 ('ops_agent','Proposal.View'),('ops_agent','Document.Upload'),('ops_agent','Account.Self'),
 ('ops_supervisor','AiOps.Dashboard.View'),('ops_supervisor','Ai.Search'),('ops_supervisor','Trip.View'),('ops_supervisor','Scenario.%'),('ops_supervisor','Simulation.Run'),
 ('ops_supervisor','Proposal.View'),('ops_supervisor','Ai.Proposal.Approve'),('ops_supervisor','Document.%'),('ops_supervisor','Template.Edit'),('ops_supervisor','Constraint.Edit'),
 ('ops_supervisor','Admin.Audit.View'),('ops_supervisor','Account.Self'),
 ('ai_engineer','AiOps.Dashboard.View'),('ai_engineer','Ai.Config.%'),('ai_engineer','Ai.Eval.Run'),('ai_engineer','Ai.Usage.View'),('ai_engineer','Scenario.View'),
 ('ai_engineer','Proposal.View'),('ai_engineer','Account.Self'),
 ('traveler','Trip.ViewOwn'),('traveler','Trip.Create'),('traveler','Ai.Search'),('traveler','Account.Self');
INSERT dbo.RolePermissions(RoleId, PermissionId)
SELECT DISTINCT r.RoleId, p.PermissionId
FROM @G g JOIN dbo.Roles r ON r.RoleKey = g.RoleKey JOIN dbo.Permissions p ON p.PermissionKey LIKE g.Pattern
WHERE NOT EXISTS (SELECT 1 FROM dbo.RolePermissions x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId)
  AND NOT (g.RoleKey = 'system_admin' AND p.PermissionKey IN ('Trip.ViewOwn','Trip.Create'));

DECLARE @M TABLE (K varchar(100), PK varchar(100), T nvarchar(100), R nvarchar(200), I varchar(50), S int, A varchar(10), Perms varchar(400));
INSERT @M VALUES
 ('admin.dashboard', NULL, N'Dashboard', '/admin', 'dashboard', 10, 'Admin', 'AiOps.Dashboard.View,Admin.Dashboard.View'),
 ('grp.copilot', NULL, N'Copilot', NULL, 'sparkle', 20, 'Admin', NULL),
 ('ai.search', 'grp.copilot', N'Ask the copilot', '/admin/search', 'search', 10, 'Admin', 'Trip.View'),
 ('ai.trips', 'grp.copilot', N'Trips', '/admin/trips', 'map', 20, 'Admin', 'Trip.View'),
 ('ai.proposals', 'grp.copilot', N'Recovery proposals', '/admin/proposals', 'check', 30, 'Admin', 'Proposal.View'),
 ('ai.documents', 'grp.copilot', N'Document intake', '/admin/documents', 'file', 40, 'Admin', 'Document.Upload,Document.Review'),
 ('grp.rules', NULL, N'Planning rules', NULL, 'flow', 30, 'Admin', NULL),
 ('ai.scenarios', 'grp.rules', N'Disruption scenarios', '/admin/scenarios', 'storm', 10, 'Admin', 'Scenario.View'),
 ('ai.templates', 'grp.rules', N'Itinerary templates', '/admin/templates', 'calendar', 20, 'Admin', 'Template.Edit'),
 ('ai.constraints', 'grp.rules', N'Travel constraints', '/admin/constraints', 'sliders', 30, 'Admin', 'Constraint.Edit'),
 ('grp.model', NULL, N'AI model', NULL, 'cpu', 40, 'Admin', NULL),
 ('ai.config', 'grp.model', N'AI configuration', '/admin/ai', 'settings', 10, 'Admin', 'Ai.Config.View'),
 ('ai.evals', 'grp.model', N'Evaluation suite', '/admin/evals', 'gauge', 20, 'Admin', 'Ai.Eval.Run'),
 ('ai.usage', 'grp.model', N'Usage & cost', '/admin/ai-usage', 'calculator', 30, 'Admin', 'Ai.Usage.View'),
 ('grp.admin', NULL, N'Administration', NULL, 'settings', 50, 'Admin', NULL),
 ('admin.system', 'grp.admin', N'System overview', '/admin/system', 'gauge', 5, 'Admin', 'Admin.Dashboard.View'),
 ('admin.users', 'grp.admin', N'Users', '/admin/users', 'user', 10, 'Admin', 'Admin.Users.View'),
 ('admin.roles', 'grp.admin', N'Roles', '/admin/roles', 'shield', 20, 'Admin', 'Admin.Roles.View'),
 ('admin.permissions', 'grp.admin', N'Permissions', '/admin/permissions', 'key', 30, 'Admin', 'Admin.Permissions.View'),
 ('admin.menus', 'grp.admin', N'Menus', '/admin/menus', 'tree', 40, 'Admin', 'Admin.Menus.View'),
 ('admin.settings', 'grp.admin', N'Settings', '/admin/settings', 'sliders', 50, 'Admin', 'Admin.Settings.View'),
 ('admin.content', 'grp.admin', N'Content', '/admin/content', 'file', 70, 'Admin', 'Admin.Content.Edit'),
 ('admin.audit', 'grp.admin', N'Audit log', '/admin/audit', 'history', 90, 'Admin', 'Admin.Audit.View'),
 ('cust.home', NULL, N'Home', '/', 'home', 10, 'Customer', NULL),
 ('cust.trips', NULL, N'My trips', '/my/trips', 'map', 20, 'Customer', 'Trip.ViewOwn'),
 ('cust.plan', NULL, N'Plan a trip', '/trips/new', 'plus', 30, 'Customer', 'Trip.Create'),
 ('cust.ask', NULL, N'Ask about my trips', '/my/ask', 'search', 40, 'Customer', 'Ai.Search'),
 ('cust.account', NULL, N'My account', '/account', 'user', 50, 'Customer', 'Account.Self');
INSERT dbo.Menus(MenuKey, Title, RoutePath, IconKey, SortOrder, ApplicationArea)
SELECT K, T, R, I, S, A FROM @M m WHERE NOT EXISTS (SELECT 1 FROM dbo.Menus x WHERE x.MenuKey = m.K);
UPDATE c SET ParentMenuId = p.MenuId FROM dbo.Menus c JOIN @M m ON m.K = c.MenuKey JOIN dbo.Menus p ON p.MenuKey = m.PK WHERE c.ParentMenuId IS NULL AND m.PK IS NOT NULL;
INSERT dbo.MenuPermissions(MenuId, PermissionId)
SELECT DISTINCT mn.MenuId, p.PermissionId
FROM @M m CROSS APPLY STRING_SPLIT(ISNULL(m.Perms, ''), ',') s JOIN dbo.Menus mn ON mn.MenuKey = m.K JOIN dbo.Permissions p ON p.PermissionKey = s.value
WHERE s.value <> '' AND NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions x WHERE x.MenuId = mn.MenuId AND x.PermissionId = p.PermissionId)
  AND NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions y WHERE y.MenuId = mn.MenuId);

DECLARE @S TABLE (K varchar(150), V nvarchar(max), T varchar(20), C varchar(50), D nvarchar(500), Vj nvarchar(1000), Pub bit, Ed bit);
INSERT @S VALUES
 ('Ui.BrandName', N'Sanpu AI Travel', 'String', 'Content', N'Product name in the header', N'{"maxLength":60}', 1, 1),
 ('Ui.HeroTagline', N'Energetic, with big ambitions', 'String', 'Content', N'Gold tagline above the home title', N'{"maxLength":60}', 1, 1),
 ('Ui.HeroTitle', N'Trips that recover on their own, with a human saying yes', 'String', 'Content', N'Home page title', N'{"maxLength":120}', 1, 1),
 ('Ui.DemoLabel', N'', 'String', 'Content', N'Badge shown on seeded demo records', N'{"maxLength":40}', 1, 1),
 ('Ui.SupportEmail', N'support@sanpu.test', 'String', 'Content', N'Shown in the footer', N'{"maxLength":120}', 1, 1),
 ('Ui.Languages', N'["en"]', 'Json', 'Content', N'Languages offered on the profile page', N'{"type":"array"}', 1, 1),
 ('Feature.CustomerAsk', N'true', 'Bool', 'Features', N'Travelers can ask the copilot about their own trips', NULL, 1, 1),
 ('Feature.CustomerSignup', N'true', 'Bool', 'Features', N'Allow traveler self sign-up', NULL, 1, 1),
 ('Ai.Provider', N'Anthropic', 'String', 'AI', N'Anthropic or Disabled. Disabled forces the deterministic fallback.', N'{"allowed":["Anthropic","Disabled"]}', 0, 1),
 ('Ai.Model', N'claude-opus-5-5', 'String', 'AI', N'Model id used for explanations and parsing', N'{"maxLength":60}', 0, 1),
 ('Ai.Models', N'["claude-opus-5-5","claude-sonnet-5-5","claude-haiku-5-5"]', 'Json', 'AI', N'Models offered on the AI configuration page', N'{"type":"array"}', 0, 1),
 ('Ai.ApiKeyRef', N'ANTHROPIC_API_KEY', 'SecretRef', 'AI', N'Name of the server env var with the API key. The key itself is never stored here.', NULL, 0, 1),
 ('Ai.TimeoutSeconds', N'30', 'Int', 'AI', N'Per-call timeout', N'{"min":5,"max":120}', 0, 1),
 ('Ai.MaxTokens', N'1500', 'Int', 'AI', N'Output token cap per call', N'{"min":256,"max":8000}', 0, 1),
 ('Ai.MonthlyBudgetUsd', N'20', 'Decimal', 'AI', N'Calls stop (fallback) once this month''s logged cost reaches it', N'{"min":0,"max":1000}', 0, 1),
 ('Ai.InputUsdPerMTok', N'4', 'Decimal', 'AI', N'Cost estimate per million input tokens. Set to your contracted price.', N'{"min":0,"max":100}', 0, 1),
 ('Ai.OutputUsdPerMTok', N'20', 'Decimal', 'AI', N'Cost estimate per million output tokens. Set to your contracted price.', N'{"min":0,"max":200}', 0, 1),
 ('Ai.InjectionPatterns', N'["ignore (all|any|previous|prior) (instructions|rules)","disregard (the|all|previous) (rules|instructions)","system prompt","you are now","act as (an? )?admin","show (me )?all (trips|users|bookings)","drop table","<script"]', 'Json', 'AI', N'Regex patterns that block a question before it reaches the model', N'{"type":"array"}', 0, 1),
 ('Docs.MaxUploadBytes', N'2097152', 'Int', 'Documents', N'Upload size limit', N'{"min":1024,"max":2097152}', 0, 1),
 ('Docs.AllowedExtensions', N'[".txt",".pdf",".png"]', 'Json', 'Documents', N'Allowed file types (checked by extension and magic bytes)', N'{"type":"array"}', 0, 1),
 ('Auth.MaxFailedLogins', N'5', 'Int', 'Security', N'Failed logins before a temporary lockout', N'{"min":3,"max":20}', 0, 1),
 ('Auth.LockoutMinutes', N'15', 'Int', 'Security', N'Lockout length', N'{"min":1,"max":1440}', 0, 1),
 ('Auth.AccessTokenMinutes', N'10', 'Int', 'Security', N'JWT lifetime', N'{"min":2,"max":60}', 0, 1),
 ('Auth.RefreshTokenDays', N'14', 'Int', 'Security', N'Refresh token lifetime', N'{"min":1,"max":90}', 0, 1),
 ('Auth.InvitationHours', N'72', 'Int', 'Security', N'Invitation link lifetime', N'{"min":1,"max":336}', 0, 1),
 ('Auth.ResetTokenMinutes', N'30', 'Int', 'Security', N'Password reset link lifetime', N'{"min":5,"max":1440}', 0, 1),
 ('Auth.DefaultCustomerRole', N'traveler', 'String', 'Security', N'Role given to self-registered travelers', N'{"maxLength":50}', 0, 0),
 ('Privacy.NoticeVersion', N'2026-11', 'String', 'Privacy', N'Privacy notice version', N'{"maxLength":20}', 1, 1),
 ('Email.Mode', N'DevOutbox', 'String', 'Email', N'DevOutbox keeps mail in the local test inbox; Smtp needs SMTP_* env vars', N'{"allowed":["DevOutbox","Smtp"]}', 0, 1);
INSERT dbo.AppSettings(SettingKey, SettingValue, ValueType, Category, Description, ValidationJson, IsPublic, IsEditable)
SELECT K, V, T, C, D, Vj, Pub, Ed FROM @S s WHERE NOT EXISTS (SELECT 1 FROM dbo.AppSettings x WHERE x.SettingKey = s.K);

DECLARE @C TABLE (K varchar(100), L varchar(10), Kind varchar(20), Sub nvarchar(200), B nvarchar(max), Pub bit);
INSERT @C VALUES
 ('email.invitation','en','Notification',N'Your Sanpu AI Copilot invitation',N'Hello {{displayName}},\n\nYou have been invited to the Sanpu AI Operations Copilot. Set your password here (valid {{hours}} hours):\n{{link}}',0),
 ('email.password_reset','en','Notification',N'Reset your password',N'Hello {{displayName}},\n\nUse this link within {{minutes}} minutes to set a new password:\n{{link}}',0),
 ('home.hero','en','Content',N'Trips that recover, with a human saying yes',N'Plan a trip from a template, see what a typhoon or a late train would change, and get a recovery plan that a staff member approves.',1),
 ('privacy.notice','en','Content',N'Privacy notice',N'Before any text goes to the AI provider we remove phone numbers, ID numbers and emails, and we only send trip details you are allowed to see. AI suggestions never change your trip until a staff member approves them.',1);
INSERT dbo.ContentTemplates(TemplateKey, Locale, Kind, Subject, Body, IsPublic)
SELECT K, L, Kind, Sub, REPLACE(B, '\n', CHAR(10)), Pub FROM @C c WHERE NOT EXISTS (SELECT 1 FROM dbo.ContentTemplates x WHERE x.TemplateKey = c.K AND x.Locale = c.L);

DECLARE @U TABLE (E nvarchar(256), N nvarchar(100), T varchar(10), R varchar(50));
INSERT @U VALUES
 ('admin@demo.sanpu.test', N'System Administrator', 'Staff', 'system_admin'),
 ('ops.agent@demo.sanpu.test', N'Kao Yi-Chen', 'Staff', 'ops_agent'),
 ('supervisor@demo.sanpu.test', N'Wu Jia-Hao', 'Staff', 'ops_supervisor'),
 ('ai.engineer@demo.sanpu.test', N'Liao Shu-Fen', 'Staff', 'ai_engineer'),
 ('traveler.chen@demo.sanpu.test', N'Chen Ya-Ting', 'Customer', 'traveler'),
 ('traveler.lee@demo.sanpu.test', N'Lee Min', 'Customer', 'traveler');
INSERT dbo.Users(Email, NormalizedEmail, DisplayName, UserType, IsDemo, EmailVerifiedAtUtc)
SELECT E, LOWER(E), N, T, 1, SYSUTCDATETIME() FROM @U u WHERE NOT EXISTS (SELECT 1 FROM dbo.Users x WHERE x.NormalizedEmail = LOWER(u.E));
INSERT dbo.UserRoles(UserId, RoleId)
SELECT x.UserId, r.RoleId FROM @U u JOIN dbo.Users x ON x.NormalizedEmail = LOWER(u.E) JOIN dbo.Roles r ON r.RoleKey = u.R
WHERE NOT EXISTS (SELECT 1 FROM dbo.UserRoles y WHERE y.UserId = x.UserId);

COMMIT;
PRINT '001_AdminCatalog applied';
