/* 015_CrossLinks.sql — main menu link back to Sanpu Travel (visible to everyone). Idempotent. */
SET NOCOUNT ON;
IF NOT EXISTS (SELECT 1 FROM dbo.Menus WHERE MenuKey = 'cust.sanpu')
    INSERT dbo.Menus(MenuKey, Title, RoutePath, IconKey, SortOrder, ApplicationArea, IsExternal, Description)
    VALUES ('cust.sanpu', N'Sanpu Travel', 'https://sanpu-travel.vercel.app/', 'map', 15, 'Customer', 1, N'Tours, hotels, flights, buses and taxis');
UPDATE dbo.Menus SET Title = N'More from Sanpu' WHERE MenuKey = 'cust.grp.explore';
