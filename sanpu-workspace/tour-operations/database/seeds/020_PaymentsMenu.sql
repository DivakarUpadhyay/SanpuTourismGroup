/* 020_PaymentsMenu.sql — admin page listing every payment transaction (Partners & finance). Idempotent. */
SET NOCOUNT ON;
IF NOT EXISTS (SELECT 1 FROM dbo.Menus WHERE MenuKey = 'ops.payments')
    INSERT dbo.Menus(MenuKey, ParentMenuId, Title, RoutePath, IconKey, SortOrder, ApplicationArea, Description)
    SELECT 'ops.payments', p.MenuId, N'Payments & transactions', '/admin/payments', 'ticket', 15, 'Admin', N'Every deposit, balance and full payment with its gateway result'
    FROM dbo.Menus p WHERE p.MenuKey = 'grp.partners';
INSERT dbo.MenuPermissions(MenuId, PermissionId)
SELECT m.MenuId, p.PermissionId FROM dbo.Menus m JOIN dbo.Permissions p ON p.PermissionKey IN ('Finance.Payment','Finance.Reconcile','Booking.View')
WHERE m.MenuKey = 'ops.payments' AND NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions x WHERE x.MenuId = m.MenuId AND x.PermissionId = p.PermissionId);
