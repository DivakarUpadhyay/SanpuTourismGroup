/* 010_DestinationGuide.sql — general-reference travel guide content for the demo destinations (overview, history, nearby places).
   Distances and travel times are approximate, measured from the tour's base town. Only empty guide fields are filled and
   only missing rows are inserted, so staff edits are kept. Idempotent. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;

UPDATE d SET Overview = COALESCE(d.Overview, v.Overview), BestTime = COALESCE(d.BestTime, v.BestTime),
             GettingThere = COALESCE(d.GettingThere, v.GettingThere), LocalTip = COALESCE(d.LocalTip, v.LocalTip)
FROM dbo.Destinations d JOIN (VALUES
 ('HUALIEN', N'The East Rift Valley runs for about 180 km between the Central and Coastal mountain ranges, linking Hualien and Taitung. It is a slow-travel landscape of rice paddies, hot springs, indigenous villages and wide, quiet roads that are ideal for cycling.',
   N'October to April: dry, mild and clear. Summer is hot and typhoon season runs July to September.',
   N'Train from Taipei to Hualien (about 2 to 3 hours), then the coastal or valley line south toward Taitung.',
   N'Rent a bicycle in Chishang to ride the paddy-field roads at sunrise, before the tour buses arrive.'),
 ('ALISHAN', N'Alishan is a mountain area in Chiayi County known for cypress forest, a historic forest railway, tea plantations and sunrises over a sea of clouds. Nights are cold even in summer.',
   N'March to April for cherry blossom; October to December for the clearest sunrise and sea-of-clouds views.',
   N'High-speed rail or train to Chiayi, then the Alishan Forest Railway or a mountain bus (about 2.5 hours).',
   N'Bring a warm jacket: the sunrise train leaves before dawn and the summit is often near freezing.'),
 ('SUNMOON', N'Sun Moon Lake in Nantou County is the largest body of water in Taiwan, surrounded by forested hills. It is the ancestral home of the Thao people and a favourite for boat rides, lakeside cycling and temple visits.',
   N'All year. Spring and autumn are the most comfortable; early mornings bring mist over the water.',
   N'High-speed rail to Taichung, then a direct bus to the lake (about 1.5 hours).',
   N'The lakeside cycling path is busiest after 10:00, so ride early and take a boat back across the lake.'),
 ('KINMEN', N'Kinmen is a group of islands just off the coast of mainland China. Its old villages of curved-roof stone houses, military tunnels and quiet beaches tell the story of its time on the Cold War front line.',
   N'October to April. Spring brings sea fog, which can delay flights.',
   N'A one-hour flight from Taipei Songshan, Taichung or Kaohsiung.',
   N'Rent a scooter or bicycle: the main sights are spread out but the roads are calm and flat.'),
 ('TAINAN', N'Tainan is the oldest city in Taiwan and was its capital for over two centuries. It is packed with temples, Dutch-era forts, old lanes and some of the most famous street food on the island.',
   N'November to March: warm, dry and sunny. Summer is very hot and humid.',
   N'High-speed rail to Tainan (under 2 hours from Taipei), then a shuttle or taxi into the old city.',
   N'Eat early: many famous breakfast and snack shops sell out by late morning.'),
 ('TAIPEI', N'Taipei is the capital of Taiwan: a safe, walkable city of night markets, museums, temples and green mountains reachable by metro. Hot springs and hiking trails are less than an hour from downtown.',
   N'October to December and March to May. Summer afternoons often bring short, heavy rain.',
   N'Taoyuan International Airport, then the airport MRT to Taipei Main Station (about 40 minutes).',
   N'Get an EasyCard: it works on the metro, buses, the YouBike bicycles and in convenience stores.')
) v(Code, Overview, BestTime, GettingThere, LocalTip) ON v.Code = d.Code;

INSERT dbo.DestinationHistory(DestinationId, Era, Title, Detail, SortOrder)
SELECT d.DestinationId, v.Era, v.Title, v.Detail, v.SortOrder
FROM (VALUES
 ('HUALIEN', N'Long before 1600', N'Indigenous homeland', N'The valley has long been home to the Amis, the largest indigenous group in Taiwan, along with the Bunun and Truku peoples. Harvest festivals are still held every summer.', 1),
 ('HUALIEN', N'Early 1900s', N'Railway and settlers', N'A railway along the valley floor opened the east to farming. Settlers planted the rice that made towns like Chishang famous.', 2),
 ('HUALIEN', N'1986', N'Taroko National Park', N'The marble gorge north of Hualien became a national park, protecting its cliffs, rivers and indigenous trails.', 3),
 ('HUALIEN', N'Today', N'Slow-travel valley', N'Organic farms, hot-air balloon festivals in Luye and long cycling routes have made the valley a favourite for unhurried trips.', 4),
 ('ALISHAN', N'Before 1900', N'Tsou homeland', N'The Alishan mountains are the traditional land of the Tsou people, whose villages such as Dabang still hold the Mayasvi ceremony.', 1),
 ('ALISHAN', N'1912', N'Forest railway opens', N'A narrow-gauge railway was built to carry giant cypress logs down the mountain. Its switchbacks and spiral loops are famous among railway fans.', 2),
 ('ALISHAN', N'1970s', N'From timber to tourism', N'Logging ended and the forest became a recreation area, with walking trails among ancient trees that survived the felling.', 3),
 ('ALISHAN', N'Today', N'Tea and sunrises', N'High-mountain oolong tea gardens cover the slopes, and the sunrise at Chushan draws visitors all year.', 4),
 ('SUNMOON', N'Long before 1900', N'Thao homeland', N'The Thao people have lived around the lake for centuries. Their village Ita Thao sits on the eastern shore.', 1),
 ('SUNMOON', N'1930s', N'Lake raised by a dam', N'A hydroelectric project raised the water level and joined two lakes, one round like the sun and one curved like the moon, which gave the lake its name.', 2),
 ('SUNMOON', N'1971', N'Ci''en Pagoda built', N'The nine-storey pagoda on the hilltop opened and became one of the best viewpoints over the lake.', 3),
 ('SUNMOON', N'Today', N'Lakeside escape', N'Boat routes, a cable car and a lakeside cycle path make it one of the most visited places in central Taiwan.', 4),
 ('KINMEN', N'Ming and Qing eras', N'Minnan villages', N'Families from southern Fujian built villages of red-brick houses with swallowtail roofs, many still lived in today.', 1),
 ('KINMEN', N'1949', N'Battle of Guningtou', N'A landing on the island''s north-west coast was repelled, and Kinmen became a fortified front line.', 2),
 ('KINMEN', N'1958', N'Artillery bombardment', N'The islands were shelled for weeks during the Second Taiwan Strait Crisis. Local smiths later turned shell casings into famous kitchen knives.', 3),
 ('KINMEN', N'1992', N'Military rule ends', N'Martial law on the islands ended, tunnels and bunkers opened to visitors, and Kinmen National Park was created to protect them.', 4),
 ('TAINAN', N'1624', N'Dutch Fort Zeelandia', N'The Dutch East India Company built a fort at Anping, the start of Tainan as a trading port.', 1),
 ('TAINAN', N'1662', N'Koxinga takes the city', N'Ming loyalist Zheng Chenggong (Koxinga) drove out the Dutch and made Tainan the centre of his kingdom.', 2),
 ('TAINAN', N'1665', N'First Confucius Temple', N'Taiwan''s first Confucius Temple and school opened here; the city remained the island''s capital until the late 1800s.', 3),
 ('TAINAN', N'Today', N'City of temples and food', N'Hundreds of temples, restored old lanes and family-run snack shops make Tainan the island''s heritage capital.', 4),
 ('TAIPEI', N'1738', N'Longshan Temple founded', N'Settlers from Fujian built Longshan Temple in Wanhua, the old riverside district where Taipei began.', 1),
 ('TAIPEI', N'1880s', N'Walled city and capital', N'A walled city was built and Taipei became the provincial capital. Some of the old city gates still stand.', 2),
 ('TAIPEI', N'1965', N'National Palace Museum', N'The museum opened in Shilin and now holds one of the world''s largest collections of Chinese art.', 3),
 ('TAIPEI', N'2004', N'Taipei 101 opens', N'The 508-metre tower was the tallest building in the world until 2010 and is the city''s best-known landmark.', 4)
) v(Code, Era, Title, Detail, SortOrder)
JOIN dbo.Destinations d ON d.Code = v.Code
WHERE NOT EXISTS (SELECT 1 FROM dbo.DestinationHistory h WHERE h.DestinationId = d.DestinationId AND h.Title = v.Title);

INSERT dbo.NearbyPlaces(DestinationId, Name, Category, DistanceKm, TravelMinutes, Detail, SortOrder)
SELECT d.DestinationId, v.Name, v.Category, v.Km, v.Mins, v.Detail, v.SortOrder
FROM (VALUES
 ('HUALIEN', N'Brown Boulevard, Chishang', 'Nature', 2.0, 10, N'A straight country road through open rice paddies with no power lines, best by bicycle.', 1),
 ('HUALIEN', N'Luye Highland', 'Experience', 35.0, 40, N'Grassy plateau that hosts the summer hot-air balloon festival, with wide views over the valley.', 2),
 ('HUALIEN', N'Taroko Gorge', 'Nature', 130.0, 150, N'Marble canyon with river trails and cliffs. Check which trails are open before you go.', 3),
 ('HUALIEN', N'Ruisui hot springs', 'Experience', 60.0, 60, N'Iron-rich hot springs in a quiet valley town, ideal after a day of cycling.', 4),
 ('HUALIEN', N'Chishang rice lunchbox', 'Food', 1.0, 5, N'The local speciality: a wooden box of Chishang rice with simple home-style sides.', 5),
 ('ALISHAN', N'Chushan sunrise viewpoint', 'Viewpoint', 6.0, 25, N'Ride the early train or walk up to watch the sun rise over Jade Mountain and the cloud sea.', 1),
 ('ALISHAN', N'Giant Trees Trail', 'Nature', 1.0, 10, N'Boardwalk loop past cypress trees more than a thousand years old.', 2),
 ('ALISHAN', N'Fenqihu old street', 'Food', 25.0, 45, N'Railway village famous for bento boxes, wasabi snacks and lantern-lit lanes.', 3),
 ('ALISHAN', N'Tea plantations of Shizhuo', 'Culture', 15.0, 30, N'High-mountain oolong tea farms on terraced slopes; many offer tastings.', 4),
 ('ALISHAN', N'Dabang Tsou village', 'Culture', 30.0, 60, N'Tsou community with a traditional men''s meeting house (kuba).', 5),
 ('SUNMOON', N'Ci''en Pagoda', 'Viewpoint', 6.0, 15, N'Short forest climb to a nine-storey pagoda with the best panorama of the lake.', 1),
 ('SUNMOON', N'Wenwu Temple', 'Heritage', 3.0, 8, N'Large lakeside temple with red stone lions and a viewing terrace over the water.', 2),
 ('SUNMOON', N'Ita Thao village', 'Culture', 7.0, 20, N'Thao village with craft shops, street food and the pier for boat rides.', 3),
 ('SUNMOON', N'Lakeside cycle path', 'Experience', 0.5, 5, N'Shaded path along the north-west shore, one of the most scenic bike rides in Taiwan.', 4),
 ('SUNMOON', N'Sun Moon Lake ropeway', 'Experience', 8.0, 20, N'Cable car over the hills with views back across the lake.', 5),
 ('KINMEN', N'Zhaishan Tunnel', 'Heritage', 12.0, 20, N'Granite tunnel blasted for supply boats, now open to walk along its waterway.', 1),
 ('KINMEN', N'Shuitou village', 'Heritage', 8.0, 15, N'Old village of red-brick Minnan houses and Western-style mansions built by overseas merchants.', 2),
 ('KINMEN', N'Guningtou Battle Museum', 'Heritage', 10.0, 20, N'Museum on the site of the 1949 battle, with tanks and murals.', 3),
 ('KINMEN', N'Maestro Wu knife workshop', 'Culture', 3.0, 10, N'Watch kitchen knives being forged from old artillery shell casings.', 4),
 ('KINMEN', N'Kinmen beef noodles', 'Food', 1.0, 5, N'Hearty local noodle soup, often paired with a small glass of kaoliang.', 5),
 ('TAINAN', N'Anping Fort', 'Heritage', 6.0, 15, N'Remains of the 1624 Dutch fort and an observation tower over the old harbour.', 1),
 ('TAINAN', N'Anping Tree House', 'Heritage', 6.5, 15, N'A former warehouse taken over by banyan roots, with walkways through the branches.', 2),
 ('TAINAN', N'Chihkan Tower', 'Heritage', 1.0, 5, N'Built on the site of the Dutch Fort Provintia, with classical pavilions and gardens.', 3),
 ('TAINAN', N'Shennong Street', 'Culture', 1.5, 8, N'Lantern-lit lane of old shophouses, cafes and small galleries.', 4),
 ('TAINAN', N'Danzai noodles', 'Food', 1.0, 5, N'Small bowls of noodles in shrimp broth with minced pork, a Tainan classic.', 5),
 ('TAIPEI', N'Taipei 101 observatory', 'Viewpoint', 4.0, 15, N'Fast lifts to the 89th floor and a giant tuned mass damper you can see.', 1),
 ('TAIPEI', N'Elephant Mountain', 'Nature', 5.0, 20, N'Twenty-minute stair climb to the classic view of Taipei 101, best at sunset.', 2),
 ('TAIPEI', N'National Palace Museum', 'Culture', 9.0, 30, N'Treasures of Chinese art; allow at least half a day.', 3),
 ('TAIPEI', N'Longshan Temple', 'Heritage', 3.0, 12, N'Busy, beautiful temple in the old Wanhua district, lit up at night.', 4),
 ('TAIPEI', N'Raohe night market', 'Food', 7.0, 25, N'Long food street famous for black-pepper buns baked in clay ovens.', 5),
 ('TAIPEI', N'Beitou hot springs', 'Experience', 14.0, 35, N'Hot-spring valley reachable by metro, with public baths and a thermal lake.', 6)
) v(Code, Name, Category, Km, Mins, Detail, SortOrder)
JOIN dbo.Destinations d ON d.Code = v.Code
WHERE NOT EXISTS (SELECT 1 FROM dbo.NearbyPlaces n WHERE n.DestinationId = d.DestinationId AND n.Name = v.Name);

COMMIT;
PRINT '010_DestinationGuide applied';
