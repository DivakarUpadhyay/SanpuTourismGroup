/* 012_CustomerMenus.sql — multi-level customer navigation for the travel site. Groups have no route; their children are the pages.
   New menus are inserted; the original "Tours" entry is moved under the Tours group only while it still has its seeded route ('/').
   Menus without permissions are public; "My trips" needs a signed-in customer. Idempotent. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;
DECLARE @M TABLE (K varchar(100), PK varchar(100), T nvarchar(100), R nvarchar(200), I varchar(50), S int, Perms varchar(400));
INSERT @M VALUES
 ('cust.grp.tours',   NULL,              N'Tours',              NULL,           'map',      10, NULL),
 ('cust.tours',       'cust.grp.tours',  N'All tours',          '/tours',       'map',      10, NULL),
 ('cust.destinations','cust.grp.tours',  N'Destination guides', '/destinations','globe',    20, NULL),
 ('cust.calendar',    'cust.grp.tours',  N'Departure calendar', '/calendar',    'calendar', 30, NULL),
 ('cust.compare',     'cust.grp.tours',  N'Compare tours',      '/compare',     'scale',    40, NULL),
 ('cust.grp.travel',  NULL,              N'Book travel',        NULL,           'truck',    20, NULL),
 ('cust.hotels',      'cust.grp.travel', N'Hotels',             '/hotels',      'building', 10, NULL),
 ('cust.flights',     'cust.grp.travel', N'Flights',            '/flights',     'plane',    20, NULL),
 ('cust.buses',       'cust.grp.travel', N'Buses',              '/buses',       'bus',      30, NULL),
 ('cust.taxis',       'cust.grp.travel', N'Airport & city taxis','/taxis',      'car',      40, NULL),
 ('cust.deals',       NULL,              N'Deals',              '/deals',       'tag',      30, NULL),
 ('cust.grp.help',    NULL,              N'Help',               NULL,           'help',     40, NULL),
 ('cust.help',        'cust.grp.help',   N'Help center',        '/help',        'help',     10, NULL),
 ('cust.contact',     'cust.grp.help',   N'Contact us',         '/contact',     'phone',    20, NULL),
 ('cust.grp.mine',    NULL,              N'My trips',           NULL,           'ticket',   50, 'Booking.ViewOwn'),
 ('cust.bookings',    'cust.grp.mine',   N'My bookings',        '/my/bookings', 'ticket',   10, 'Booking.ViewOwn'),
 ('cust.foryou',      'cust.grp.mine',   N'Recommended for you','/for-you',     'sparkle',  20, 'Booking.ViewOwn'),
 ('cust.account',     'cust.grp.mine',   N'My account',         '/account',     'user',     30, 'Account.Self');

-- move the original entries into the new groups (only while they still look as seeded)
UPDATE dbo.Menus SET RoutePath = '/tours', Title = N'All tours' WHERE MenuKey = 'cust.tours' AND RoutePath = '/';
UPDATE c SET ParentMenuId = p.MenuId, SortOrder = m.S
FROM dbo.Menus c JOIN @M m ON m.K = c.MenuKey JOIN dbo.Menus p ON p.MenuKey = m.PK
WHERE c.MenuKey IN ('cust.tours', 'cust.bookings', 'cust.account') AND c.ParentMenuId IS NULL;

INSERT dbo.Menus(MenuKey, Title, RoutePath, IconKey, SortOrder, ApplicationArea)
SELECT K, T, R, I, S, 'Customer' FROM @M m WHERE NOT EXISTS (SELECT 1 FROM dbo.Menus x WHERE x.MenuKey = m.K);
UPDATE c SET ParentMenuId = p.MenuId FROM dbo.Menus c JOIN @M m ON m.K = c.MenuKey JOIN dbo.Menus p ON p.MenuKey = m.PK
WHERE c.ParentMenuId IS NULL AND m.PK IS NOT NULL;
INSERT dbo.MenuPermissions(MenuId, PermissionId)
SELECT DISTINCT mn.MenuId, p.PermissionId
FROM @M m CROSS APPLY STRING_SPLIT(ISNULL(m.Perms, ''), ',') s JOIN dbo.Menus mn ON mn.MenuKey = m.K JOIN dbo.Permissions p ON p.PermissionKey = s.value
WHERE s.value <> '' AND NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions y WHERE y.MenuId = mn.MenuId);
-- one-line descriptions for the mega-menu (only when empty, so staff edits are kept)
UPDATE m SET Description = v.D FROM dbo.Menus m JOIN (VALUES
 ('cust.tours', N'Guided trips with live seats and prices'), ('cust.destinations', N'History, best time to go and what is nearby'),
 ('cust.calendar', N'Every open departure, month by month'), ('cust.compare', N'Put two or three tours side by side'),
 ('cust.hotels', N'Rooms in our own and partner hotels'), ('cust.flights', N'Island and east-coast flights'),
 ('cust.buses', N'Reserved seats on express and mountain buses'), ('cust.taxis', N'Fixed-price airport and city transfers'),
 ('cust.help', N'Answers about bookings, payments and changes'), ('cust.contact', N'Message our team, reply within a working day'),
 ('cust.bookings', N'Tours, stays and rides in one place'), ('cust.foryou', N'Ideas based on what you viewed and booked'),
 ('cust.account', N'Profile, password and sessions')) v(K, D) ON v.K = m.MenuKey WHERE m.Description IS NULL;
COMMIT;
PRINT '012_CustomerMenus applied';
