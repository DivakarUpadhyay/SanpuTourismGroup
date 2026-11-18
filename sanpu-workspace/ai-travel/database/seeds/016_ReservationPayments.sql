/* 016_ReservationPayments.sql — staff menu for card payments on assistant bookings. Idempotent. */
SET NOCOUNT ON;
IF NOT EXISTS (SELECT 1 FROM dbo.Menus WHERE MenuKey = 'ai.payments')
    INSERT dbo.Menus(MenuKey, Title, RoutePath, IconKey, SortOrder, ApplicationArea, Description)
    VALUES ('ai.payments', N'Payments', '/admin/payments', 'ticket', 26, 'Admin', N'Every card payment travelers made on assistant bookings');
UPDATE c SET ParentMenuId = p.MenuId FROM dbo.Menus c JOIN dbo.Menus p ON p.MenuKey = 'grp.copilot' WHERE c.MenuKey = 'ai.payments' AND c.ParentMenuId IS NULL;
INSERT dbo.MenuPermissions(MenuId, PermissionId)
SELECT m.MenuId, p.PermissionId FROM dbo.Menus m JOIN dbo.Permissions p ON p.PermissionKey = 'Reservation.View'
WHERE m.MenuKey = 'ai.payments' AND NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions x WHERE x.MenuId = m.MenuId AND x.PermissionId = p.PermissionId);
