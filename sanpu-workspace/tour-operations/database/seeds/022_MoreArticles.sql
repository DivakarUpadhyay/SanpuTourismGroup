/* 022_MoreArticles.sql — more original articles (written for Sanpu; photos from the site's own library). Idempotent. */
SET NOCOUNT ON;
DECLARE @A TABLE (Kind varchar(10), Title nvarchar(200), Summary nvarchar(400), Cat nvarchar(60), Tags nvarchar(200), Img varchar(300), Alt nvarchar(200), Days int, Body nvarchar(max));
INSERT @A VALUES
('News', N'Late-night arrivals: airport transfers now run around the clock',
 N'Travelers landing after midnight can now book a fixed-price transfer into the city, with a driver waiting at arrivals.',
 N'Sanpu news', N'taxis,airport,transfers', '/images/photos/taxi.jpg', N'Taxi waiting on a city street at night', 18,
N'Many flights into Taiwan land late in the evening, when public transport is winding down. To make the last part of the journey easy, Sanpu airport transfers can now be booked for any time of day or night.

## How it works
- Choose your pickup time when you book; the price is fixed in advance
- Your driver tracks the flight and waits at arrivals if you are delayed
- Child seats and accessible vans can be added on the booking page

## Paying
Transfers can be paid in full when you book, or added to a tour or hotel booking you already have. You will find every booking, payment and receipt under My bookings.'),
('News', N'How travelers are choosing between rail, coach and short flights',
 N'Shorter trips and flexible plans are changing how people move around Taiwan. A look at what matters most when choosing transport.',
 N'Industry', N'transport,flights,buses', '/images/photos/flight.jpg', N'Aircraft parked at a regional airport', 22,
N'Getting around Taiwan has never been easier, and travelers now mix transport more freely than before. A typical week might combine a high-speed train, an express coach and a short island flight.

## What travelers weigh up
- **Time door to door:** a flight is quick in the air, but airport time matters on short routes
- **Comfort and luggage:** coaches with reserved seats suit groups and families with bags
- **Flexibility:** free changes until shortly before departure are now an important part of the choice

## Planning tips
Island flights to Kinmen and the east coast fill early on holiday weekends, so book those first and fit the rest of the trip around them. Coaches are a good backup when weather affects flights.'),
('Blog', N'What to pack for Taiwan in every season',
 N'From summer rain to cold mountain mornings, a simple packing list that works all year round.',
 N'Travel guides', N'packing,seasons,tips', '/images/photos/hotel-room.jpg', N'Bright hotel room with a suitcase', 4,
N'Taiwan''s weather changes a lot between the coast and the mountains, and between seasons. Packing well means being ready for heat, rain and the occasional chilly evening.

## All year
- A light rain jacket or compact umbrella
- Comfortable walking shoes that cope with wet streets
- A small day bag for markets and temple visits

## Summer (June to September)
Light, breathable clothes, sun protection and a refillable water bottle. Afternoon showers are common, so plan indoor stops for the early afternoon.

## Winter (December to February)
Layers for the north, where days can be damp and cool, and a warm jacket for Alishan or other mountain stays, where mornings can be cold.

## Good to know
Hotels usually provide slippers and basic toiletries, and convenience stores are everywhere if you forget something.'),
('Blog', N'Behind the scenes: how we plan a new tour',
 N'From the first scouting trip to the first departure, here is how a Sanpu tour comes together.',
 N'Sanpu stories', N'tours,team,planning', '/images/photos/alishan.jpg', N'Forest trail in the mountains', 16,
N'Every Sanpu tour starts with a simple question: would we enjoy this trip ourselves? From there, a small team spends months turning an idea into a departure you can book.

## Scouting
Our planners travel the route in different seasons, test the timing between stops, and look for places where travelers can slow down rather than rush.

## Partners
We work with family-run inns, local guides and transport partners we know well. Each one agrees to our standards for comfort, safety and fair treatment of staff.

## Testing
Before a tour opens, colleagues travel it as guests and report what felt too long, too short or simply wonderful. The schedule changes based on what they say.

## After launch
Feedback from every departure goes back to the team, and small changes keep each tour fresh from season to season.');

INSERT dbo.Articles(Kind, Slug, Title, Summary, Body, Category, Tags, ImageUrl, ImageAlt, Status, WrittenBy, ReadMinutes, PublishedAtUtc)
SELECT a.Kind, LEFT(dbo.fn_Slugify(a.Title), 150), a.Title, a.Summary, a.Body, a.Cat, a.Tags, a.Img, a.Alt, 'Published', 'Staff',
       CASE WHEN LEN(a.Body) / 1100 < 2 THEN 2 ELSE LEN(a.Body) / 1100 END, DATEADD(DAY, -a.Days, SYSUTCDATETIME())
FROM @A a WHERE NOT EXISTS (SELECT 1 FROM dbo.Articles x WHERE x.Slug = LEFT(dbo.fn_Slugify(a.Title), 150));
