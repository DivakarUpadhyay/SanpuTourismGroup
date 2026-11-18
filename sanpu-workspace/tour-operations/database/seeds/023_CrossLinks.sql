/* 023_CrossLinks.sql — main menu link to Sanpu AI Travel (visible to everyone). Idempotent. */
SET NOCOUNT ON;
IF NOT EXISTS (SELECT 1 FROM dbo.Menus WHERE MenuKey = 'cust.ai')
    INSERT dbo.Menus(MenuKey, Title, RoutePath, IconKey, SortOrder, ApplicationArea, IsExternal, Description)
    VALUES ('cust.ai', N'AI Travel', 'https://sanpu-trip-copilot.vercel.app/assistant', 'sparkle', 32, 'Customer', 1, N'Plan, compare and book with our AI assistant');
