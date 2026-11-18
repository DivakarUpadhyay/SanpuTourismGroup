/* 013_BusinessMenus.sql — the admin panel shows business pages only. Technical pages (system health, AI model settings,
   permissions, menus, raw settings, workflow engine, content templates, data retention, audit log, role matrix) are
   switched off; their routes then answer 403. Re-enable a page by setting IsActive = 1. Idempotent. */
SET NOCOUNT ON;
UPDATE dbo.Menus SET IsActive = 0, UpdatedAtUtc = SYSUTCDATETIME()
WHERE ApplicationArea = 'Admin' AND IsActive = 1
  AND MenuKey IN ('admin.system','admin.permissions','admin.menus','admin.settings','admin.content','admin.audit','admin.roles','ai.config','ai.evals','ai.usage','grp.model');
UPDATE dbo.Menus SET Title = N'Team & access' WHERE MenuKey = 'grp.admin' AND ApplicationArea = 'Admin';
UPDATE dbo.Menus SET Title = N'People' WHERE MenuKey = 'admin.users' AND ApplicationArea = 'Admin';
