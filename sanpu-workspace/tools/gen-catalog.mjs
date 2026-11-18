// Generates tour-operations/database/seeds/024_MoreCatalog.sql: 50+ tours (with weekly departures) and 50+ hotels,
// flights, buses and taxis (with 150 days of inventory). Names and texts are original; photos are the site's own.
// Idempotent (inserts by code). Usage: node tools/gen-catalog.mjs
import fs from "node:fs";

const q = (s) => (s === null || s === undefined ? "NULL" : `N'${String(s).replace(/'/g, "''")}'`);
const rnd = (() => { let x = 20261118; return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); })();   // deterministic
const pick = (a) => a[Math.floor(rnd() * a.length)];
const DEST = {
  TAIPEI: { photo: "taipei", city: "Taipei" }, HUALIEN: { photo: "hualien", city: "Hualien" }, SUNMOON: { photo: "sunmoon", city: "Sun Moon Lake" },
  ALISHAN: { photo: "alishan", city: "Alishan" }, TAINAN: { photo: "tainan", city: "Tainan" }, KINMEN: { photo: "kinmen", city: "Kinmen" },
};

// ---------------- tours: destination, title, days, base price, slogan, summary ----------------
const tours = [
  ["TAIPEI", "Taipei Night Markets & Temples", 2, 6200, "Street food after dark", "Two evenings in Taipei's best-loved night markets, with a guided walk through Longshan and Bao'an temples."],
  ["TAIPEI", "Taipei City & Beitou Hot Springs", 2, 7400, "City sights, warm water", "Classic city sights on day one and a slow afternoon in Beitou's hot spring valley on day two."],
  ["TAIPEI", "Jiufen & Northeast Coast Day Trip", 1, 2900, "Lanterns and sea views", "Old mining town lanes, tea houses with a view and the rocky northeast coast in one day."],
  ["TAIPEI", "Yangmingshan Hiking Weekend", 2, 5600, "Volcano trails above the city", "Easy-to-moderate trails through grassland and fumaroles, with a night in a mountain inn."],
  ["TAIPEI", "Taipei Food Lovers 3D2N", 3, 11800, "Cook, taste, repeat", "A market tour, a cooking class and the city's classic dishes, with two nights in central Taipei."],
  ["TAIPEI", "Pingxi Sky Lantern Line", 1, 2600, "Old rail line, paper lanterns", "Ride the Pingxi branch line, release a sky lantern and visit the Shifen waterfall."],
  ["TAIPEI", "Tamsui Sunset & Fishermen's Wharf", 1, 2200, "Riverside evening", "Historic streets, a ferry ride and the sunset over the river mouth at Tamsui."],
  ["TAIPEI", "Northern Taiwan Highlights 4D3N", 4, 16800, "The north at an easy pace", "Taipei, Jiufen, Yehliu and Yangmingshan with comfortable hotels and a small group."],
  ["HUALIEN", "Taroko Gorge Classic 2D1N", 2, 8900, "Marble cliffs and river trails", "Walk the best gorge trails with a guide and stay overnight near the park entrance."],
  ["HUALIEN", "East Coast Cycling 4D3N", 4, 15600, "Pedal the Pacific coast", "Daily rides along quiet coastal roads with luggage transfer and seaside stays."],
  ["HUALIEN", "Hualien Whale Watching & Coast", 2, 7900, "Out on the Pacific", "A morning boat trip to look for dolphins and whales, then the coastal scenic road."],
  ["HUALIEN", "Taitung Hot Air Balloon Festival Trip", 3, 12900, "Sunrise balloons over the valley", "Watch the balloons rise at dawn, with valley stays and a hot spring evening."],
  ["HUALIEN", "Indigenous Culture of the East 3D2N", 3, 11200, "Meet the valley's communities", "Visit Amis and Bunun villages, share a home-cooked meal and learn traditional crafts."],
  ["HUALIEN", "Chishang Rice Fields by Bike", 2, 6800, "Golden fields, empty roads", "Cycle the famous paddy roads of Chishang and stay in a farmstead guesthouse."],
  ["HUALIEN", "Green Island Snorkel Escape 3D2N", 3, 13400, "Coral and sea hot springs", "Ferry to Green Island for snorkelling, scooter rides and an oceanside hot spring."],
  ["HUALIEN", "Hualien & Taitung Grand Tour 5D4N", 5, 21800, "The whole east in one trip", "Taroko, the rift valley, the coast road and Taitung's beaches with four comfortable nights."],
  ["SUNMOON", "Sun Moon Lake Cycling & Boat", 2, 6900, "Lakeside path and pier hopping", "Cycle the lakeside path, ride the boat between piers and stay by the water."],
  ["SUNMOON", "Sun Moon Lake Tea Country", 2, 7600, "Black tea and forest views", "Visit black tea farms around the lake and learn how the famous local tea is made."],
  ["SUNMOON", "Sun Moon Lake Sunrise Paddle", 1, 3200, "Calm water at dawn", "An early guided paddle on the lake followed by breakfast at a lakeside cafe."],
  ["SUNMOON", "Central Taiwan Lakes & Mountains 4D3N", 4, 16200, "Lake, tea and high mountains", "Sun Moon Lake, Puli's paper and wine heritage and the Cingjing highlands."],
  ["SUNMOON", "Cingjing Farm & Hehuan Mountain", 3, 11900, "Sheep, pastures and high peaks", "Mountain farm stays and an easy high-altitude walk on Hehuan Mountain."],
  ["SUNMOON", "Puli Paper & Wine Heritage", 1, 2800, "Crafts of the old town", "Handmade paper workshops, a winery museum and Puli's famous local snacks."],
  ["SUNMOON", "Sun Moon Lake Family Weekend", 2, 8400, "Easy fun for all ages", "Gondola rides, a lakeside cycle, a boat trip and a family-friendly hotel."],
  ["ALISHAN", "Alishan Forest Railway & Trails", 2, 8200, "Giant trees and old rails", "Ride the forest railway and walk among ancient cypress trees."],
  ["ALISHAN", "Alishan Tea Farm Stay", 2, 7300, "High-mountain oolong", "Stay on a tea farm, join a tasting and walk through terraces above the clouds."],
  ["ALISHAN", "Alishan & Fenqihu Old Street", 2, 6900, "Mountain town flavours", "The historic railway town of Fenqihu, its bento lunch and quiet bamboo forests."],
  ["ALISHAN", "Yushan Foothills Hiking 3D2N", 3, 12600, "Taiwan's highest range", "Guided hikes below Taiwan's highest peak with two nights in mountain lodges."],
  ["ALISHAN", "Chiayi City & Alishan Sunrise", 3, 10900, "City food, mountain dawn", "Chiayi's turkey rice and old town, then up the mountain for the sunrise."],
  ["ALISHAN", "Alishan Photography Weekend", 2, 8800, "Light, mist and forest", "Small-group photo walks at sunrise, sunset and in the misty forest."],
  ["ALISHAN", "Firefly Season in the Mountains", 2, 7100, "Evening lights in the forest", "Seasonal evening walks to see fireflies, with a cosy mountain inn."],
  ["TAINAN", "Tainan Temples & Old Town Walk", 1, 2400, "History on every corner", "A guided walk through Taiwan's oldest city, its temples and old merchant streets."],
  ["TAINAN", "Tainan & Kaohsiung Southern Food Trail", 3, 11400, "Southern flavours", "Two of Taiwan's best food cities, with a night market in each."],
  ["TAINAN", "Anping Fort & Canal Cruise", 1, 2600, "Forts, canals and oysters", "Historic Anping, the old fort, a canal cruise and the oyster-shell lanes."],
  ["TAINAN", "Cigu Salt Fields & Wetlands", 1, 2500, "Salt mountains and birds", "The salt fields, mangrove tunnels and birdlife of the southwest coast."],
  ["TAINAN", "Kenting Beach Escape 3D2N", 3, 12800, "Taiwan's tropical south", "Beaches, coral coast walks and sunset at the island's southern tip."],
  ["TAINAN", "Southern Taiwan Culture 4D3N", 4, 15900, "Temples, crafts and coast", "Tainan, Lukang-style crafts, Kaohsiung's harbour and a coastal day."],
  ["TAINAN", "Tainan Cooking Class Weekend", 2, 7900, "Learn the classics", "A market visit and two cooking classes with a local chef in the old city."],
  ["KINMEN", "Kinmen Villages by Bicycle", 2, 7200, "Quiet lanes and old houses", "Cycle between restored villages and coastal lookouts at a gentle pace."],
  ["KINMEN", "Kinmen Food & Kaoliang Heritage", 2, 7800, "Island flavours", "Local noodles, oyster omelettes, knife-making and the island's famous distillery story."],
  ["KINMEN", "Little Kinmen & Coastal Walks", 2, 6900, "The smaller island", "Ferry to Lieyu for coastal paths, fortifications and quiet beaches."],
  ["KINMEN", "Kinmen Birdwatching Weekend", 2, 7400, "Wetlands and migrants", "Guided walks to the island's lakes and wetlands in migration season."],
  ["KINMEN", "Kinmen Architecture Photo Tour", 2, 7600, "Swallowtail roofs and courtyards", "A small-group photo tour of traditional and Western-style houses."],
  ["TAIPEI", "Keelung Harbour & Night Market", 1, 2300, "Seafood by the port", "Keelung's harbour, a coastal walk and its famous temple night market."],
  ["HUALIEN", "Qingshui Cliffs Sunrise Drive", 1, 3400, "Cliffs above the ocean", "An early drive to the Qingshui cliffs for sunrise, with breakfast in Hualien."],
  ["SUNMOON", "Formosan Aboriginal Culture Park Day", 1, 3600, "Culture and cable car", "The cable car from the lake and a day of culture and rides at the park."],
];

// ---------------- hotels ----------------
const hotelBrands = {
  Taipei: ["Riverside Garden Hotel", "Da'an Boutique Rooms", "Songshan Urban Inn", "Ximen Corner Hotel", "Zhongshan Heritage Hotel", "Taipei Park View", "Beitou Spring Retreat", "Shilin Lantern Inn"],
  Hualien: ["Pacific Breeze Hotel", "Taroko Gateway Lodge", "Hualien Harbour Inn", "Seaside Cliff Resort", "Rift Valley Farmstay", "Chishang Paddy House", "Taitung Coast Hotel"],
  "Sun Moon Lake": ["Lalu Shore Inn", "Ita Thao Lakeside", "Shuishe Pier Hotel", "Lake Mist Lodge", "Tea Hills Guesthouse", "Cingjing Pasture Lodge", "Puli Garden Inn"],
  Alishan: ["Mountain Mist Lodge", "Cypress Forest Inn", "Fenqihu Rail Hotel", "Tea Terrace Homestay", "Summit Sunrise Lodge", "Chiayi City Hotel"],
  Tainan: ["Anping Canal Hotel", "Confucius Lane Inn", "Old Capital Garden", "Shennong Street Rooms", "Tainan Station Hotel", "Salt Field Retreat", "Kenting Bay Resort"],
  Kinmen: ["Shanhou Folk Village Inn", "Kinmen Harbour Hotel", "Lieyu Island Stay", "Juguang Tower Hotel", "Shuitou Mansion Rooms", "Jincheng Old Street Inn", "Guningtou Coast Hotel", "Taiwu Mountain Lodge"],
};
const roomTypes = [["Standard Double", 2, 0.85], ["Deluxe Twin", 2, 1], ["Family Room", 4, 1.55], ["Superior King", 2, 1.15], ["Suite", 3, 1.9]];
const hotelFeatures = ["Breakfast included", "Free Wi-Fi", "Hot spring bath", "City view", "Lake view", "Sea view", "Bicycle rental", "Parking", "Airport shuttle", "Family friendly", "Garden", "Rooftop terrace"];
const cityPlace = { Taipei: "CITY-TPE", Hualien: "CITY-HUN", "Sun Moon Lake": "CITY-SML", Alishan: "CITY-ALI", Tainan: "CITY-TNN", Kinmen: "CITY-KNH" };
const cityPhoto = { Taipei: "taipei", Hualien: "hualien", "Sun Moon Lake": "sunmoon", Alishan: "alishan", Tainan: "tainan", Kinmen: "kinmen" };
const hotels = [];
for (const [city, brands] of Object.entries(hotelBrands)) brands.forEach((b, i) => {
  const [type, ppu, mult] = roomTypes[(i + hotels.length) % roomTypes.length];
  const base = Math.round((2600 + rnd() * 3800) * mult / 10) * 10;
  const feats = [hotelFeatures[0], pick(hotelFeatures.slice(1)), pick(hotelFeatures.slice(1))].filter((v, k, a) => a.indexOf(v) === k).join(",");
  hotels.push({ code: `H-G${String(hotels.length + 1).padStart(2, "0")}`, name: `${b} · ${type}`, place: cityPlace[city], ppu, base, rating: (3.9 + rnd() * 1).toFixed(1), feats,
    photo: rnd() < 0.5 ? "hotel-room" : cityPhoto[city], cap: 6 + Math.floor(rnd() * 14), city });
});

// ---------------- flights ----------------
const airports = { TSA: "Taipei", TPE: "Taoyuan", KHH: "Kaohsiung", RMQ: "Taichung", HUN: "Hualien", TTT: "Taitung", KNH: "Kinmen", TNN: "Tainan" };
const routes = [["TSA", "HUN", 40], ["HUN", "TSA", 40], ["TSA", "TTT", 55], ["TTT", "TSA", 55], ["TSA", "KNH", 60], ["KNH", "TSA", 60], ["KHH", "KNH", 50], ["KNH", "KHH", 50],
  ["RMQ", "KNH", 55], ["KNH", "RMQ", 55], ["TNN", "KNH", 50], ["KNH", "TNN", 50], ["RMQ", "HUN", 50], ["HUN", "RMQ", 50], ["KHH", "HUN", 55], ["HUN", "KHH", 55], ["TSA", "TNN", 55], ["TNN", "TSA", 55], ["KHH", "TTT", 45], ["TTT", "KHH", 45]];
const flights = [];
let fn = 401;
for (let i = 0; flights.length < 42; i++) {
  const [from, to, dur] = routes[i % routes.length];
  const air = i % 3 === 0 ? ["SUP-AIR-02", "Island Hopper Air", "IH"] : ["SUP-AIR-01", "Formosa Sky", "FS"];
  const hour = 7 + ((i * 3) % 13);
  flights.push({ code: `F-${air[2]}${fn}`, name: `${air[1]} ${air[2]}${fn++} · ${airports[from]} → ${airports[to]}`, sup: air[0], from, to, time: `${String(hour).padStart(2, "0")}:${i % 2 ? "35" : "05"}`, dur,
    base: Math.round((1500 + dur * 22 + rnd() * 600) / 10) * 10, cap: 60 + Math.floor(rnd() * 60), rating: (4 + rnd() * 0.8).toFixed(1), photo: "flight",
    feats: ["Checked bag 20 kg", pick(["Snack on board", "Window seats", "Free changes until 24 h", "Online check-in"])].join(",") });
}

// ---------------- buses ----------------
const stations = { "BUS-TPE": "Taipei", "BUS-TCH": "Taichung", "BUS-TNN": "Tainan", "BUS-CYI": "Chiayi", "BUS-ALI": "Alishan", "BUS-SML": "Sun Moon Lake" };
const busRoutes = [["BUS-TPE", "BUS-TCH", 150], ["BUS-TCH", "BUS-TPE", 150], ["BUS-TPE", "BUS-TNN", 260], ["BUS-TNN", "BUS-TPE", 260], ["BUS-TCH", "BUS-SML", 95], ["BUS-SML", "BUS-TCH", 95],
  ["BUS-CYI", "BUS-ALI", 150], ["BUS-ALI", "BUS-CYI", 150], ["BUS-TCH", "BUS-TNN", 140], ["BUS-TNN", "BUS-TCH", 140], ["BUS-TPE", "BUS-CYI", 210], ["BUS-CYI", "BUS-TPE", 210], ["BUS-TPE", "BUS-SML", 240], ["BUS-SML", "BUS-TPE", 240]];
const buses = [];
for (let i = 0; buses.length < 46; i++) {
  const [from, to, dur] = busRoutes[i % busRoutes.length];
  const op = i % 2 ? ["SUP-BUS-02", "Central Line", "CL"] : ["SUP-BUS-01", "Formosa Coaches", "FC"];
  const hour = 6 + ((i * 2) % 16);
  buses.push({ code: `B-${op[2]}${300 + i}`, name: `${op[1]} ${op[2]}${300 + i} · ${stations[from]} → ${stations[to]}`, sup: op[0], from, to, time: `${String(hour).padStart(2, "0")}:${i % 3 === 0 ? "00" : i % 3 === 1 ? "20" : "45"}`, dur,
    base: Math.round((140 + dur * 1.9 + rnd() * 80) / 5) * 5, cap: 28 + Math.floor(rnd() * 16), rating: (4 + rnd() * 0.8).toFixed(1), photo: "bus",
    feats: [pick(["Reserved seats", "USB charging", "Reclining seats"]), pick(["Free Wi-Fi", "Restroom on board", "Luggage hold"])].join(",") });
}

// ---------------- taxis ----------------
const taxiFrom = [["TPE", "Taoyuan Airport"], ["TSA", "Songshan Airport"], ["KHH", "Kaohsiung Airport"], ["HUN", "Hualien Airport"], ["RMQ", "Taichung Airport"], ["TNN", "Tainan Airport"], ["KNH", "Kinmen Airport"], ["ZN-TPE-XY", "Xinyi"], ["ZN-TPE-ZS", "Zhongshan"], ["ZN-TNN-OC", "Tainan Old City"]];
const taxiTo = { TPE: ["ZN-TPE-XY", "ZN-TPE-ZS", "CITY-TPE"], TSA: ["ZN-TPE-XY", "ZN-TPE-ZS", "CITY-TPE"], KHH: ["CITY-TNN", "ZN-TNN-OC"], HUN: ["CITY-HUN"], RMQ: ["CITY-SML", "CITY-TPE"], TNN: ["ZN-TNN-OC", "CITY-TNN"], KNH: ["CITY-KNH"],
  "ZN-TPE-XY": ["TPE", "TSA"], "ZN-TPE-ZS": ["TPE", "TSA"], "ZN-TNN-OC": ["TNN", "KHH"] };
const placeName = { ...airports, "ZN-TPE-XY": "Xinyi", "ZN-TPE-ZS": "Zhongshan", "ZN-TNN-OC": "Tainan Old City", "CITY-TPE": "Taipei city", "CITY-TNN": "Tainan", "CITY-HUN": "Hualien city", "CITY-SML": "Sun Moon Lake", "CITY-KNH": "Kinmen town", TPE: "Taoyuan Airport", TSA: "Songshan Airport" };
const vehicles = [["Sedan", 4, 1], ["Executive Sedan", 3, 1.35], ["Family Van", 6, 1.4], ["Accessible Van", 4, 1.45], ["Minibus", 9, 2.2]];
const taxis = [];
for (let i = 0; taxis.length < 44; i++) {
  const [from, fromName] = taxiFrom[i % taxiFrom.length];
  const to = taxiTo[from][Math.floor(i / taxiFrom.length) % taxiTo[from].length];
  const [veh, ppu, mult] = vehicles[(i * 7) % vehicles.length];
  taxis.push({ code: `T-G${String(i + 1).padStart(2, "0")}`, name: `Sanpu Limo ${veh} · ${fromName} → ${placeName[to] ?? to}`, sup: "SUP-TAX-01", from, to, ppu, dur: 25 + Math.floor(rnd() * 70),
    base: Math.round((700 + rnd() * 1300) * mult / 10) * 10, cap: 4 + Math.floor(rnd() * 6), rating: (4.3 + rnd() * 0.6).toFixed(1), photo: "taxi",
    feats: ["Meet and greet", pick(["Flight tracking", "Child seat on request", "Free waiting 60 min", "English-speaking driver"])].join(",") });
}

// ---------------- SQL ----------------
let sql = `/* 024_MoreCatalog.sql — generated by tools/gen-catalog.mjs: ${tours.length} tours with weekly departures, ${hotels.length} hotels,
   ${flights.length} flights, ${buses.length} buses and ${taxis.length} taxis with 150 days of inventory. Original names and texts. Idempotent. */
SET NOCOUNT ON;
DECLARE @BU int = (SELECT TOP 1 BusinessUnitId FROM dbo.Tours ORDER BY TourId);
DECLARE @N TABLE (n int PRIMARY KEY);
INSERT @N SELECT TOP 150 ROW_NUMBER() OVER (ORDER BY (SELECT 1)) FROM sys.all_objects;
`;
tours.forEach((t, i) => {
  const [dest, title, days, price, slogan, summary] = t;
  const code = `TW-G${String(i + 1).padStart(2, "0")}`;
  sql += `IF NOT EXISTS (SELECT 1 FROM dbo.Tours WHERE Code = '${code}')
  INSERT dbo.Tours(Code, Title, Slogan, DestinationId, BusinessUnitId, Days, BasePrice, Currency, Summary, IsPublished, IsDemo, ImageUrl)
  SELECT '${code}', ${q(`${title}${/\dD\dN$/.test(title) ? "" : days > 1 ? ` ${days}D${days - 1}N` : ""}`)}, ${q(slogan)}, DestinationId, @BU, ${days}, ${price}, 'TWD', ${q(summary)}, 1, 0, '/images/photos/${DEST[dest].photo}.jpg' FROM dbo.Destinations WHERE Code = '${dest}';
`;
});
sql += `
-- weekly departures for the new tours (about 17 each), first one 3-9 days from today
INSERT dbo.Departures(TourId, DepartureDate, Capacity, SeatsSold, SeatsHeld, Price, Status, IsDemo)
SELECT t.TourId, DATEADD(DAY, 3 + (t.TourId % 7) + 7 * w.n, CAST(SYSUTCDATETIME() AS date)), 30 + (t.TourId % 3) * 5, (t.TourId * w.n) % 9, 0,
       t.BasePrice + CASE WHEN w.n % 4 = 3 THEN 600 ELSE 0 END, 'Open', 0
FROM dbo.Tours t CROSS JOIN (SELECT n - 1 AS n FROM @N WHERE n <= 17) w
WHERE t.Code LIKE 'TW-G%' AND NOT EXISTS (SELECT 1 FROM dbo.Departures d WHERE d.TourId = t.TourId);
`;
const svc = (s, kind) => `IF NOT EXISTS (SELECT 1 FROM dbo.TravelServices WHERE Code = '${s.code}')
  INSERT dbo.TravelServices(Code, Kind, Name, SupplierId, FromPlaceId, ToPlaceId, DepartTime, DurationMin, Capacity, MaxPerBooking, PeoplePerUnit, BasePrice, Currency, Rating, Features, CancellationPolicy, ImageUrl, IsActive, IsDemo, Description)
  VALUES ('${s.code}', '${kind}', ${q(s.name)}, ${s.sup ? `(SELECT SupplierId FROM dbo.Suppliers WHERE Code = '${s.sup}')` : "NULL"}, (SELECT PlaceId FROM dbo.Places WHERE Code = '${s.place ?? s.from}'),
          ${s.to ? `(SELECT PlaceId FROM dbo.Places WHERE Code = '${s.to}')` : "NULL"}, ${s.time ? `'${s.time}'` : "NULL"}, ${s.dur ?? "NULL"}, ${s.cap}, ${kind === "Hotel" ? 4 : kind === "Taxi" ? 3 : 9}, ${s.ppu ?? 1}, ${s.base}, 'TWD', ${s.rating}, ${q(s.feats)},
          ${q(kind === "Hotel" ? "Free cancellation until 48 hours before check-in." : kind === "Taxi" ? "Free cancellation until 24 hours before pickup." : "Free changes until 24 hours before departure.")}, '/images/photos/${s.photo}.jpg', 1, 0,
          ${q(kind === "Hotel" ? `A comfortable stay in ${s.city} with friendly service and easy access to the main sights.` : kind === "Taxi" ? "Private transfer with a professional driver, fixed price agreed in advance." : `Scheduled service with reserved seats and a ${s.dur}-minute journey.`)});
`;
hotels.forEach((s) => (sql += svc(s, "Hotel")));
flights.forEach((s) => (sql += svc(s, "Flight")));
buses.forEach((s) => (sql += svc(s, "Bus")));
taxis.forEach((s) => (sql += svc(s, "Taxi")));
sql += `
-- 150 days of inventory for the new services (weekends cost a little more)
INSERT dbo.ServiceInventory(ServiceId, ServiceDate, Capacity, Sold, Held, Price, Status)
SELECT s.ServiceId, d.D, s.Capacity, 0, 0, CAST(s.BasePrice * CASE WHEN DATEPART(WEEKDAY, d.D) IN (1, 7) THEN 1.15 ELSE 1 END AS decimal(12,0)), 'Open'
FROM dbo.TravelServices s
CROSS APPLY (SELECT DATEADD(DAY, n, CAST(SYSUTCDATETIME() AS date)) AS D FROM @N) d
WHERE (s.Code LIKE 'H-G%' OR s.Code LIKE 'F-FS4%' OR s.Code LIKE 'F-IH4%' OR s.Code LIKE 'B-FC3%' OR s.Code LIKE 'B-CL3%' OR s.Code LIKE 'T-G%')
  AND NOT EXISTS (SELECT 1 FROM dbo.ServiceInventory i WHERE i.ServiceId = s.ServiceId);
`;
fs.writeFileSync("tour-operations/database/seeds/024_MoreCatalog.sql", "FEFF" + sql);   // BOM: sqlcmd must read the file as UTF-8
console.log(`tours ${tours.length}, hotels ${hotels.length}, flights ${flights.length}, buses ${buses.length}, taxis ${taxis.length}`);
