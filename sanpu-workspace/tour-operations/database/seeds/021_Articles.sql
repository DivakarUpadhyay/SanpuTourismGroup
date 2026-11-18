/* 021_Articles.sql — News & blog: permission, menus, writer-bot settings and the first articles (original text written
   for Sanpu; photos from the site's own library). Idempotent. */
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionKey = 'Content.Articles')
    INSERT dbo.Permissions(PermissionKey, ModuleKey, ActionKey, Description) VALUES ('Content.Articles', 'Content', 'Articles', N'Write, edit, publish news and blog articles and run the AI writer');
INSERT dbo.RolePermissions(RoleId, PermissionId)
SELECT r.RoleId, p.PermissionId FROM dbo.Roles r JOIN dbo.Permissions p ON p.PermissionKey = 'Content.Articles'
WHERE r.RoleKey IN ('system_admin','marketing_manager') AND NOT EXISTS (SELECT 1 FROM dbo.RolePermissions x WHERE x.RoleId = r.RoleId AND x.PermissionId = p.PermissionId);

-- admin: Sales & marketing > News & blog
IF NOT EXISTS (SELECT 1 FROM dbo.Menus WHERE MenuKey = 'mkt.articles')
    INSERT dbo.Menus(MenuKey, ParentMenuId, Title, RoutePath, IconKey, SortOrder, ApplicationArea, Description)
    SELECT 'mkt.articles', p.MenuId, N'News & blog', '/admin/articles', 'file', 30, 'Admin', N'Articles and the AI writer bot' FROM dbo.Menus p WHERE p.MenuKey = 'grp.marketing';
INSERT dbo.MenuPermissions(MenuId, PermissionId)
SELECT m.MenuId, p.PermissionId FROM dbo.Menus m JOIN dbo.Permissions p ON p.PermissionKey = 'Content.Articles'
WHERE m.MenuKey = 'mkt.articles' AND NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions x WHERE x.MenuId = m.MenuId);

-- customer: Stories > News, Blog
DECLARE @M TABLE (K varchar(100), PK varchar(100), T nvarchar(100), R varchar(200), I varchar(50), S int, D nvarchar(300));
INSERT @M VALUES
 ('cust.grp.stories', NULL, N'Stories', NULL, 'file', 35, NULL),
 ('cust.news', 'cust.grp.stories', N'News', '/news', 'file', 10, N'Taiwan travel industry and Sanpu updates'),
 ('cust.blog', 'cust.grp.stories', N'Travel blog', '/blog', 'map', 20, N'Guides, ideas and stories from our team');
INSERT dbo.Menus(MenuKey, Title, RoutePath, IconKey, SortOrder, ApplicationArea, Description)
SELECT K, T, R, I, S, 'Customer', D FROM @M m WHERE NOT EXISTS (SELECT 1 FROM dbo.Menus x WHERE x.MenuKey = m.K);
UPDATE c SET ParentMenuId = p.MenuId FROM dbo.Menus c JOIN @M m ON m.K = c.MenuKey JOIN dbo.Menus p ON p.MenuKey = m.PK WHERE c.ParentMenuId IS NULL AND m.PK IS NOT NULL;

-- writer bot
DECLARE @S TABLE (K varchar(150), V nvarchar(max), T varchar(20), D nvarchar(500), Vj nvarchar(1000));
INSERT @S VALUES
 ('ContentBot.Enabled', N'true', 'Bool', N'The AI writer publishes new articles on its own schedule', NULL),
 ('ContentBot.IntervalHours', N'24', 'Int', N'Hours between new articles of each kind (news and blog)', N'{"min":6,"max":168}'),
 ('ContentBot.AutoPublish', N'true', 'Bool', N'Publish the bot''s articles at once (false = keep them as drafts for review)', NULL);
INSERT dbo.AppSettings(SettingKey, SettingValue, ValueType, Category, Description, ValidationJson, IsPublic, IsEditable)
SELECT K, V, T, 'Content', D, Vj, 0, 1 FROM @S s WHERE NOT EXISTS (SELECT 1 FROM dbo.AppSettings x WHERE x.SettingKey = s.K);

-- first articles (original text)
DECLARE @A TABLE (Kind varchar(10), Title nvarchar(200), Summary nvarchar(400), Cat nvarchar(60), Tags nvarchar(200), Img varchar(300), Alt nvarchar(200), Days int, Body nvarchar(max));
INSERT @A VALUES
('News', N'Sanpu launches AI Travel, an assistant that plans and books in one conversation',
 N'Travelers can now describe a trip in their own words and get live options, comparisons and a booking ready to confirm.',
 N'Sanpu news', N'AI Travel,product', '/images/photos/taipei.jpg', N'Taipei skyline at dusk', 2,
N'Sanpu has opened AI Travel, a new way to plan a trip with us. Instead of filling in search forms, travelers type what they have in mind, for example "three relaxed days in Hualien for two", and the assistant looks up live tours, rooms, flights, buses and taxis from our booking system.

## What it does
- Suggests a day-by-day plan built from real departures and transport
- Compares tours side by side, including seats left and next dates
- Prepares a booking at the live price and holds it for 30 minutes
- Shows every booking, payment and balance in one place

## People stay in control
The assistant never pays for anyone. Each booking it prepares waits for the traveler to review it and choose a deposit or full payment. When weather or a supplier changes a trip, our operations team reviews the recovery plan before anything changes.

AI Travel is free to use with a Sanpu account.'),
('News', N'Holiday season: more express bus seats between Taipei and Tainan',
 N'We have added extra departures on our busiest intercity route for the year-end holidays.',
 N'Sanpu news', N'buses,Tainan,holidays', '/images/photos/bus.jpg', N'Intercity coach on a highway', 5,
N'Year-end travel in Taiwan is busy, and the Taipei to Tainan corridor is one of the first routes to sell out. To give travelers more choice, Sanpu has added extra express bus departures on weekends and public holidays through the season.

## What changes
- More morning departures, so you reach Tainan in time for lunch
- Reserved seats on every departure, with free changes until 24 hours before
- Coupon codes from the Deals page work on these trips

Seats are released in our booking system as soon as each departure is confirmed with the operator, so the earlier you look, the better the choice of times.'),
('News', N'Why the cooler months are Taiwan''s busiest travel season',
 N'From October to April, clear skies and mild temperatures bring travelers back to the mountains and the east coast.',
 N'Industry', N'seasons,east coast,mountains', '/images/photos/hualien.jpg', N'Gorge and river near Hualien', 9,
N'Taiwan travel follows the weather. Summer is hot and humid, and from July to September typhoons can close mountain roads and ferry routes. As temperatures drop in autumn, demand moves back to the places that are hardest to enjoy in summer.

## Where travelers go
- **Mountains:** sunrise viewing and forest trails around Alishan are at their best in clear, cool air.
- **East coast:** the Hualien and Taitung valleys are easier to explore by bicycle when the heat eases.
- **Islands:** Kinmen''s heritage villages are comfortable to walk for a full day.

## What it means for booking
Popular weekends fill early, especially around public holidays. Booking with a deposit lets you secure seats and rooms now and pay the balance closer to the date.'),
('News', N'Smaller groups for our Kinmen heritage tours',
 N'Our Kinmen departures now run with fewer travelers per guide, for quieter visits to the old villages.',
 N'Sanpu news', N'Kinmen,tours', '/images/photos/kinmen.jpg', N'Traditional houses in a Kinmen village', 14,
N'Kinmen''s villages are small, with narrow lanes and family homes that are still lived in. To keep visits respectful and relaxed, Sanpu has reduced the size of its Kinmen heritage groups.

Each departure now travels with fewer guests per guide, which means more time at each stop, easier conversations with the guide, and less crowding at the courtyard houses.

## Also new
- Bicycle time in the afternoon for those who want to explore on their own
- A slower schedule on the second day, with an early finish before the flight home

You can see dates, prices and seats left on the tour page and in the departure calendar.'),
('Blog', N'Three slow days in the East Rift Valley',
 N'Rice fields, hot springs and empty country roads: a simple plan for the valley between Hualien and Taitung.',
 N'Travel guides', N'Hualien,Taitung,itinerary', '/images/photos/hualien.jpg', N'Green valley and river in eastern Taiwan', 3,
N'The East Rift Valley is not a place to rush. It is a long, green corridor between two mountain ranges, made for cycling, long lunches and evenings in hot spring water. Here is how we like to spend three days there.

## Day 1: arrive and settle in
Take the morning train or coach from Taipei and check in to a valley inn. Spend the afternoon walking through the rice fields near your stay, then end the day with a soak in a hot spring.

## Day 2: cycle the paddies
Rent a bicycle and follow the flat farm roads at your own pace. Stop at a tea farm in the hills for a tasting, and keep an eye on the light in late afternoon, when the fields turn gold.

## Day 3: a slow way home
Visit a local market for breakfast, pick up rice or tea to take home, and travel back in the afternoon.

## Good to know
- October to April is the most comfortable time to go
- Bring cash for small shops and markets
- A deposit secures your seats; pay the rest closer to the date'),
('Blog', N'Sun Moon Lake on a sensible budget',
 N'How to enjoy Taiwan''s best-known lake without overspending, from where to stay to how to get around.',
 N'Travel guides', N'Sun Moon Lake,budget', '/images/photos/sunmoon.jpg', N'Sun Moon Lake with mountains behind', 6,
N'Sun Moon Lake is popular for good reason: calm water, forested hills and easy walking paths. It can also be pricey on weekends. A little planning keeps the trip relaxed and affordable.

## Choose the right day
Weekdays are quieter and room prices are usually lower. If you can only travel at the weekend, book early and consider a room facing the hills rather than the lake.

## Getting around
- The lakeside cycle path is one of the best ways to see the shore
- Boats connect the main piers, so you can combine a ride and a walk
- Express buses link the lake with Taichung, so you do not need a car

## Eat like the locals
Small restaurants away from the main pier offer simple, good meals at fair prices. Try local tea, which is grown in the hills around the lake.

Tip: compare our lake tours with a hotel-plus-bus plan on the Compare page to see which suits your trip.'),
('Blog', N'A weekend of food in Tainan',
 N'Taiwan''s oldest city is also one of its best for eating. A two-day plan for hungry travelers.',
 N'Food & culture', N'Tainan,food,weekend', '/images/photos/tainan.jpg', N'Historic temple in Tainan', 10,
N'Tainan was the island''s capital for more than two centuries, and its streets still mix temples, old shophouses and family-run food stalls. Two days is enough to taste the classics if you pace yourself.

## Saturday: old town and temples
Start early, because many favorite breakfast spots sell out by mid-morning. Spend the morning around the old temples, then try savoury rice cakes and milkfish soup for lunch. In the evening, walk the lanes near the old canal and graze from stall to stall.

## Sunday: markets and sweets
Visit a morning market, try a bowl of shaved ice in the afternoon heat, and pick up local pastries for the trip home.

## Getting there
Express buses and trains connect Taipei and Tainan in a few hours. A heritage guesthouse in the old town puts most of the food within walking distance.'),
('Blog', N'Planning an Alishan sunrise without the stress',
 N'Early starts, cold mornings and limited seats: what to know before you go up the mountain.',
 N'Travel guides', N'Alishan,mountains,sunrise', '/images/photos/alishan.jpg', N'Forest and mountain ridges at Alishan', 12,
N'Watching the sun rise over a sea of clouds at Alishan is one of Taiwan''s classic experiences. It also means a very early start and a cold wait, so preparation matters.

## Before you go
- Stay at least one night on the mountain; the first shuttle leaves well before dawn
- Pack warm layers, even in spring and autumn
- Check the weather the evening before; clouds below the viewpoint are good news

## On the morning
Arrive at the viewpoint early to find a good spot, bring a hot drink, and be patient. After sunrise, the forest trails are quiet and beautiful in the soft light.

## Make it easy
Our Alishan tour includes the mountain stay and the early transfer, so you only need to set an alarm.');

INSERT dbo.Articles(Kind, Slug, Title, Summary, Body, Category, Tags, ImageUrl, ImageAlt, Status, WrittenBy, ReadMinutes, PublishedAtUtc)
SELECT a.Kind, LEFT(dbo.fn_Slugify(a.Title), 150), a.Title, a.Summary, a.Body, a.Cat, a.Tags, a.Img, a.Alt, 'Published', 'Staff',
       CASE WHEN LEN(a.Body) / 1100 < 2 THEN 2 ELSE LEN(a.Body) / 1100 END, DATEADD(DAY, -a.Days, SYSUTCDATETIME())
FROM @A a WHERE NOT EXISTS (SELECT 1 FROM dbo.Articles x WHERE x.Slug = LEFT(dbo.fn_Slugify(a.Title), 150));
