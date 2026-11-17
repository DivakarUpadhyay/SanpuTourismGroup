/* 016_ServiceDetails.sql — detail-page content for hotels, flights, buses and taxis. Only empty descriptions are filled, so staff edits are kept. Idempotent. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;
DECLARE @D TABLE (Code varchar(30), Descr nvarchar(1500), Addr nvarchar(250), High nvarchar(800), Facts nvarchar(2000), Gal nvarchar(800), Lat decimal(9,6), Lng decimal(9,6));
INSERT @D VALUES
-- hotels
('H-TPE-SKY-DLX', N'A calm, light-filled king room on a high floor of a modern tower in the Xinyi district, minutes from Taipei 101, the Elephant Mountain trail and the MRT. Floor-to-ceiling windows look over the city, and breakfast is served in the sky lounge.',
 N'Songshou Road, Xinyi District, Taipei', N'High-floor city views
3 minutes to the MRT
Breakfast in the sky lounge
24-hour gym and lounge',
 N'[{"label":"Check-in","value":"from 15:00"},{"label":"Check-out","value":"until 11:00"},{"label":"Room size","value":"32 m²"},{"label":"Bed","value":"1 king bed"},{"label":"Breakfast","value":"Included"},{"label":"Wi-Fi","value":"Free, high speed"}]',
 '/images/photos/taipei.jpg,/images/photos/hotel-room.jpg', 25.035900, 121.565000),
('H-TPE-SKY-FAM', N'A two-bedroom suite for families: a king room, a twin room for the kids and a lounge with a dining table. Children under 12 stay free with breakfast, and the location makes Taipei''s museums and night markets an easy ride away.',
 N'Songshou Road, Xinyi District, Taipei', N'Two bedrooms and a lounge
Kids under 12 stay free
Breakfast for the whole family
Baby cot on request',
 N'[{"label":"Check-in","value":"from 15:00"},{"label":"Check-out","value":"until 11:00"},{"label":"Suite size","value":"64 m²"},{"label":"Beds","value":"1 king + 2 single"},{"label":"Sleeps","value":"up to 4"},{"label":"Breakfast","value":"Included"}]',
 '/images/photos/hotel-room.jpg,/images/photos/taipei.jpg', 25.035900, 121.565000),
('H-SML-LAKE-TWN', N'Wake up to mist on the water. Every twin room faces Sun Moon Lake, the hotel has its own hot-spring baths, and the boat pier is a five-minute walk for crossings to Ita Thao and Xuanguang Temple.',
 N'Zhongshan Road, Yuchi Township, Nantou County', N'Every room faces the lake
Hot-spring baths on site
5 minutes to the boat pier
Bicycle path at the door',
 N'[{"label":"Check-in","value":"from 15:00"},{"label":"Check-out","value":"until 11:00"},{"label":"Room size","value":"30 m²"},{"label":"Beds","value":"2 single beds"},{"label":"Breakfast","value":"Included"},{"label":"Parking","value":"Free"}]',
 '/images/photos/sunmoon.jpg,/images/photos/hotel-room.jpg', 23.865300, 120.912000),
('H-HUN-RIFT-DBL', N'A family-run inn among the rice fields of the East Rift Valley. Rooms open onto a quiet garden, bicycles are free for guests, and the owners serve breakfast made with rice from their own fields.',
 N'Chishang Township, Taitung County', N'Garden rooms among rice fields
Free bicycles for guests
Home-made breakfast
Starry skies, no city light',
 N'[{"label":"Check-in","value":"from 15:00"},{"label":"Check-out","value":"until 10:30"},{"label":"Room size","value":"26 m²"},{"label":"Bed","value":"1 double bed"},{"label":"Breakfast","value":"Included"},{"label":"Parking","value":"Free"}]',
 '/images/photos/hualien.jpg,/images/photos/hotel-room.jpg', 23.122000, 121.219000),
('H-ALI-CYP-TWN', N'A timber lodge inside the forest recreation area, close to the giant-tree trails. The early sunrise shuttle takes you to the viewpoint before dawn, and rooms are heated for the cool mountain nights.',
 N'Alishan Forest Recreation Area, Chiayi County', N'Sunrise shuttle every morning
Walk to the giant-tree trails
Heated rooms
Mountain tea in the lounge',
 N'[{"label":"Check-in","value":"from 15:00"},{"label":"Check-out","value":"until 10:00"},{"label":"Room size","value":"24 m²"},{"label":"Beds","value":"2 single beds"},{"label":"Altitude","value":"2,200 m"},{"label":"Breakfast","value":"Included"}]',
 '/images/photos/alishan.jpg,/images/photos/hotel-room.jpg', 23.510600, 120.802000),
('H-TNN-OLD-DBL', N'A restored shophouse in the heart of Tainan''s old city, with original beams, a small courtyard and the city''s best snack streets on the doorstep. Temples and the Confucius Temple are all within a 10-minute walk.',
 N'Zhongyi Road, West Central District, Tainan', N'Restored heritage building
Walk to temples and snack streets
Courtyard breakfast
Bicycles to borrow',
 N'[{"label":"Check-in","value":"from 15:00"},{"label":"Check-out","value":"until 11:00"},{"label":"Room size","value":"22 m²"},{"label":"Bed","value":"1 double bed"},{"label":"Breakfast","value":"Included"},{"label":"Wi-Fi","value":"Free"}]',
 '/images/photos/tainan.jpg,/images/photos/hotel-room.jpg', 22.993500, 120.202000),
('H-KNH-CRT-DBL', N'Sleep in a traditional Minnan house with a swallowtail roof and a quiet inner courtyard, in one of Kinmen''s best-kept villages. Bicycles are ready for the flat island roads.',
 N'Shuitou Village, Jincheng Township, Kinmen County', N'Traditional Minnan courtyard house
In a heritage village
Free bicycles
Local breakfast',
 N'[{"label":"Check-in","value":"from 15:00"},{"label":"Check-out","value":"until 11:00"},{"label":"Room size","value":"20 m²"},{"label":"Bed","value":"1 double bed"},{"label":"Breakfast","value":"Included"},{"label":"Airport","value":"15 minutes by taxi"}]',
 '/images/photos/kinmen.jpg,/images/photos/hotel-room.jpg', 24.414000, 118.296000),
-- flights
('F-FS101', N'Morning flight down the east coast from Taipei Songshan to Hualien. The 35-minute hop saves the long drive, and the right-side windows show the Pacific and the coastal mountains on approach.',
 N'Taipei Songshan Airport, Domestic Terminal', N'35-minute direct flight
Checked bag included
Pacific views on approach
Free changes until 24 hours before',
 N'[{"label":"Aircraft","value":"ATR 72-600 turboprop"},{"label":"Cabin","value":"Economy, 2-2 seating"},{"label":"Seat pitch","value":"30 in"},{"label":"Carry-on","value":"1 bag, 7 kg"},{"label":"Checked bag","value":"20 kg"},{"label":"Check-in closes","value":"40 min before departure"}]',
 '/images/photos/flight.jpg,/images/photos/hualien.jpg', 25.069000, 121.552000),
('F-FS102', N'Evening return from Hualien to Taipei Songshan, timed for the end of a day in Taroko or the rift valley. Songshan is inside the city, a short MRT ride from your hotel.',
 N'Hualien Airport', N'35-minute direct flight
Checked bag included
Lands in central Taipei
Free changes until 24 hours before',
 N'[{"label":"Aircraft","value":"ATR 72-600 turboprop"},{"label":"Cabin","value":"Economy, 2-2 seating"},{"label":"Seat pitch","value":"30 in"},{"label":"Carry-on","value":"1 bag, 7 kg"},{"label":"Checked bag","value":"20 kg"},{"label":"Check-in closes","value":"40 min before departure"}]',
 '/images/photos/flight.jpg,/images/photos/taipei.jpg', 24.023000, 121.617000),
('F-FS201', N'Direct morning flight to Taitung, the gateway to the southern rift valley, Green Island ferries and the Chishang rice fields.',
 N'Taipei Songshan Airport, Domestic Terminal', N'55-minute direct flight
Checked bag included
Connect to the rift valley
Free changes until 24 hours before',
 N'[{"label":"Aircraft","value":"ATR 72-600 turboprop"},{"label":"Cabin","value":"Economy, 2-2 seating"},{"label":"Seat pitch","value":"30 in"},{"label":"Carry-on","value":"1 bag, 7 kg"},{"label":"Checked bag","value":"20 kg"},{"label":"Check-in closes","value":"40 min before departure"}]',
 '/images/photos/flight.jpg,/images/photos/hualien.jpg', 25.069000, 121.552000),
('F-FS301', N'The quickest way to Kinmen: a direct morning flight from Taipei Songshan, arriving in time for a full day of village walks and war-history sites.',
 N'Taipei Songshan Airport, Domestic Terminal', N'65-minute direct flight
Checked bag included
Arrive before lunch
Free changes until 24 hours before',
 N'[{"label":"Aircraft","value":"ATR 72-600 turboprop"},{"label":"Cabin","value":"Economy, 2-2 seating"},{"label":"Seat pitch","value":"30 in"},{"label":"Carry-on","value":"1 bag, 7 kg"},{"label":"Checked bag","value":"20 kg"},{"label":"Check-in closes","value":"40 min before departure"}]',
 '/images/photos/flight.jpg,/images/photos/kinmen.jpg', 25.069000, 121.552000),
('F-FS302', N'Afternoon return from Kinmen to Taipei Songshan. Kinmen''s small airport is 15 minutes from most villages, so you can enjoy the morning before you fly.',
 N'Kinmen Airport', N'65-minute direct flight
Checked bag included
Lands in central Taipei
Free changes until 24 hours before',
 N'[{"label":"Aircraft","value":"ATR 72-600 turboprop"},{"label":"Cabin","value":"Economy, 2-2 seating"},{"label":"Seat pitch","value":"30 in"},{"label":"Carry-on","value":"1 bag, 7 kg"},{"label":"Checked bag","value":"20 kg"},{"label":"Check-in closes","value":"40 min before departure"}]',
 '/images/photos/flight.jpg,/images/photos/taipei.jpg', 24.428000, 118.359000),
('F-IH501', N'Direct island flight from Kaohsiung to Kinmen, ideal when you are travelling from the south of Taiwan.',
 N'Kaohsiung International Airport, Domestic Terminal', N'50-minute direct flight
Checked bag included
From southern Taiwan
Changes allowed with a fee',
 N'[{"label":"Aircraft","value":"ATR 72-600 turboprop"},{"label":"Cabin","value":"Economy, 2-2 seating"},{"label":"Seat pitch","value":"29 in"},{"label":"Carry-on","value":"1 bag, 7 kg"},{"label":"Checked bag","value":"15 kg"},{"label":"Check-in closes","value":"40 min before departure"}]',
 '/images/photos/flight.jpg,/images/photos/kinmen.jpg', 22.577000, 120.350000),
('F-IH601', N'Midday direct flight from Taichung to Kinmen, convenient after a stay at Sun Moon Lake.',
 N'Taichung Airport', N'55-minute direct flight
Checked bag included
Good link from Sun Moon Lake
Changes allowed with a fee',
 N'[{"label":"Aircraft","value":"ATR 72-600 turboprop"},{"label":"Cabin","value":"Economy, 2-2 seating"},{"label":"Seat pitch","value":"29 in"},{"label":"Carry-on","value":"1 bag, 7 kg"},{"label":"Checked bag","value":"15 kg"},{"label":"Check-in closes","value":"40 min before departure"}]',
 '/images/photos/flight.jpg,/images/photos/kinmen.jpg', 24.264000, 120.621000),
('F-IH701', N'Afternoon direct flight from Tainan to Kinmen, pairing two of Taiwan''s great heritage destinations in one trip.',
 N'Tainan Airport', N'50-minute direct flight
Checked bag included
Pair Tainan with Kinmen
Changes allowed with a fee',
 N'[{"label":"Aircraft","value":"ATR 72-600 turboprop"},{"label":"Cabin","value":"Economy, 2-2 seating"},{"label":"Seat pitch","value":"29 in"},{"label":"Carry-on","value":"1 bag, 7 kg"},{"label":"Checked bag","value":"15 kg"},{"label":"Check-in closes","value":"40 min before departure"}]',
 '/images/photos/flight.jpg,/images/photos/tainan.jpg', 22.950000, 120.206000),
-- buses
('B-C1-TPE-TNN', N'Express coach down the western highway from Taipei Bus Station to Tainan, with wide reclining seats, a restroom and USB charging at every seat.',
 N'Taipei Bus Station, Gate 5 (beside Taipei Main Station)', N'Wide 2+1 reclining seats
Restroom and Wi-Fi on board
One rest stop on the way
Reserved seat',
 N'[{"label":"Seats","value":"2+1 reclining, 28 seats"},{"label":"Stops","value":"Taipei → Taichung Chaoma → Tainan"},{"label":"Rest stop","value":"Xihu service area, 15 min"},{"label":"Luggage","value":"2 bags in the hold"},{"label":"Boarding","value":"Gate 5, 15 min before"},{"label":"Ticket","value":"Show the QR code on your phone"}]',
 '/images/photos/bus.jpg,/images/photos/tainan.jpg', 25.049000, 121.517000),
('B-C1-TNN-TPE', N'Afternoon express coach from Tainan back to Taipei, arriving in the evening at Taipei Bus Station next to the MRT and high-speed rail.',
 N'Tainan Bus Station, Bay 3', N'Wide 2+1 reclining seats
Restroom and Wi-Fi on board
Arrives next to Taipei Main Station
Reserved seat',
 N'[{"label":"Seats","value":"2+1 reclining, 28 seats"},{"label":"Stops","value":"Tainan → Taichung Chaoma → Taipei"},{"label":"Rest stop","value":"Xihu service area, 15 min"},{"label":"Luggage","value":"2 bags in the hold"},{"label":"Boarding","value":"Bay 3, 15 min before"},{"label":"Ticket","value":"Show the QR code on your phone"}]',
 '/images/photos/bus.jpg,/images/photos/taipei.jpg', 22.997000, 120.212000),
('B-L2-TCH-SML', N'Direct bus from Taichung up into the hills to the Sun Moon Lake visitor center, with space for luggage and views of the Puli basin on the way.',
 N'Taichung Bus Station, Platform 2', N'Direct to the lake
Luggage space
Mountain views
Reserved seat',
 N'[{"label":"Seats","value":"2+2, 40 seats"},{"label":"Stops","value":"Taichung → Puli → Sun Moon Lake"},{"label":"Journey","value":"About 1 h 45 min"},{"label":"Luggage","value":"1 bag in the hold"},{"label":"Boarding","value":"Platform 2, 10 min before"},{"label":"Ticket","value":"Show the QR code on your phone"}]',
 '/images/photos/bus.jpg,/images/photos/sunmoon.jpg', 24.137000, 120.686000),
('B-M1-CYI-ALI', N'The mountain bus from Chiayi up the winding road to Alishan, climbing through tea gardens and cypress forest. Sit on the right for the best views.',
 N'Chiayi Bus Station, beside Chiayi Railway Station', N'Climbs through tea gardens
Best views on the right side
Luggage space
Reserved seat',
 N'[{"label":"Seats","value":"2+2, 30 seats"},{"label":"Stops","value":"Chiayi → Shizhuo → Alishan"},{"label":"Journey","value":"About 2 h 30 min"},{"label":"Luggage","value":"1 bag in the hold"},{"label":"Tip","value":"Bring motion-sickness tablets"},{"label":"Ticket","value":"Show the QR code on your phone"}]',
 '/images/photos/bus.jpg,/images/photos/alishan.jpg', 23.479000, 120.441000),
-- taxis
('T-TPE-XY-SED', N'Fixed-price private transfer from Taoyuan International Airport to your hotel in the Xinyi district. Your driver tracks your flight and meets you in arrivals with a name sign.',
 N'Taoyuan International Airport, Arrivals Hall (Terminal 1 or 2)', N'Meet and greet in arrivals
Flight tracking, no extra charge for delays
Fixed price, tolls included
Free cancellation until 24 hours before',
 N'[{"label":"Vehicle","value":"Sedan, Toyota Camry or similar"},{"label":"Passengers","value":"up to 4"},{"label":"Luggage","value":"2 large + 2 small bags"},{"label":"Free waiting","value":"60 min after landing"},{"label":"Journey","value":"About 60 min"},{"label":"Child seat","value":"On request, free"}]',
 '/images/photos/taxi.jpg,/images/photos/taipei.jpg', 25.079700, 121.234200),
('T-TPE-XY-VAN', N'Fixed-price airport transfer in a spacious van for families and small groups, from Taoyuan International Airport to the Xinyi district.',
 N'Taoyuan International Airport, Arrivals Hall (Terminal 1 or 2)', N'Room for 7 and their bags
Meet and greet in arrivals
Flight tracking
Fixed price, tolls included',
 N'[{"label":"Vehicle","value":"Van, Toyota Granvia or similar"},{"label":"Passengers","value":"up to 7"},{"label":"Luggage","value":"5 large bags"},{"label":"Free waiting","value":"60 min after landing"},{"label":"Journey","value":"About 60 min"},{"label":"Child seat","value":"On request, free"}]',
 '/images/photos/taxi.jpg,/images/photos/taipei.jpg', 25.079700, 121.234200),
('T-TPE-XY-ACC', N'Wheelchair-accessible van with a rear ramp and secure tie-downs, from Taoyuan International Airport to the Xinyi district. Drivers are trained to assist.',
 N'Taoyuan International Airport, Arrivals Hall (Terminal 1 or 2)', N'Rear ramp and wheelchair tie-downs
Trained driver assistance
Meet and greet in arrivals
Fixed price, tolls included',
 N'[{"label":"Vehicle","value":"Accessible van with ramp"},{"label":"Passengers","value":"up to 4, incl. 1 wheelchair"},{"label":"Luggage","value":"2 large bags"},{"label":"Free waiting","value":"60 min after landing"},{"label":"Journey","value":"About 70 min"},{"label":"Assistance","value":"Door to door"}]',
 '/images/photos/taxi.jpg,/images/photos/taipei.jpg', 25.079700, 121.234200),
('T-TPE-ZS-SED', N'Fixed-price private transfer from Taoyuan International Airport to hotels in Zhongshan district, near the night markets and the riverside.',
 N'Taoyuan International Airport, Arrivals Hall (Terminal 1 or 2)', N'Meet and greet in arrivals
Flight tracking
Fixed price, tolls included
Free cancellation until 24 hours before',
 N'[{"label":"Vehicle","value":"Sedan, Toyota Camry or similar"},{"label":"Passengers","value":"up to 4"},{"label":"Luggage","value":"2 large + 2 small bags"},{"label":"Free waiting","value":"60 min after landing"},{"label":"Journey","value":"About 55 min"},{"label":"Child seat","value":"On request, free"}]',
 '/images/photos/taxi.jpg,/images/photos/taipei.jpg', 25.079700, 121.234200),
('T-TSA-XY-SED', N'Short fixed-price ride from Taipei Songshan Airport to the Xinyi district, with your driver waiting at the arrivals exit.',
 N'Taipei Songshan Airport, Arrivals Exit', N'Meet and greet at arrivals
Fixed price
About 20 minutes to Xinyi
Free cancellation until 24 hours before',
 N'[{"label":"Vehicle","value":"Sedan, Toyota Camry or similar"},{"label":"Passengers","value":"up to 4"},{"label":"Luggage","value":"2 large + 2 small bags"},{"label":"Free waiting","value":"45 min after landing"},{"label":"Journey","value":"About 20 min"},{"label":"Child seat","value":"On request, free"}]',
 '/images/photos/taxi.jpg,/images/photos/taipei.jpg', 25.069000, 121.552000),
('T-KHH-TNN-SED', N'Fixed-price transfer from Kaohsiung International Airport to Tainan''s old city, the easiest way to start a food weekend in Tainan.',
 N'Kaohsiung International Airport, Arrivals Hall', N'Meet and greet in arrivals
Flight tracking
Fixed price, tolls included
Free cancellation until 24 hours before',
 N'[{"label":"Vehicle","value":"Sedan, Toyota Camry or similar"},{"label":"Passengers","value":"up to 4"},{"label":"Luggage","value":"2 large + 2 small bags"},{"label":"Free waiting","value":"60 min after landing"},{"label":"Journey","value":"About 60 min"},{"label":"Child seat","value":"On request, free"}]',
 '/images/photos/taxi.jpg,/images/photos/tainan.jpg', 22.577000, 120.350000);
UPDATE s SET Description = d.Descr, Address = d.Addr, Highlights = REPLACE(d.High, CHAR(13), ''), FactsJson = d.Facts, Gallery = d.Gal, Latitude = d.Lat, Longitude = d.Lng
FROM dbo.TravelServices s JOIN @D d ON d.Code = s.Code WHERE s.Description IS NULL;
COMMIT;
PRINT '016_ServiceDetails applied';
