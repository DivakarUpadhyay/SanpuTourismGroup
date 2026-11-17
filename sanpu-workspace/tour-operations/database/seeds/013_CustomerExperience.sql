/* 013_CustomerExperience.sql — help center, places, travel-service partners and inventory, coupons and promotions.
   Insert-if-missing everywhere, so staff changes are kept. Inventory is generated for the next 150 days. Idempotent. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;

/* ---- settings ---- */
INSERT dbo.AppSettings(SettingKey, SettingValue, ValueType, Category, Description, ValidationJson, IsPublic, IsEditable)
SELECT k, v, t, c, d, j, p, 1 FROM (VALUES
 ('Contact.SlaHours', N'24', 'Int', 'Operations', N'Hours staff have to answer a contact request', N'{"min":1,"max":168}', 0),
 ('Newsletter.WelcomeCoupon', N'WELCOME10', 'String', 'Marketing', N'Coupon code shown after newsletter sign-up (empty = none)', N'{"maxLength":30}', 1),
 ('Recommend.Max', N'6', 'Int', 'Marketing', N'How many recommendations to show', N'{"min":1,"max":12}', 1)
) s(k, v, t, c, d, j, p) WHERE NOT EXISTS (SELECT 1 FROM dbo.AppSettings a WHERE a.SettingKey = s.k);

/* ---- help center ---- */
INSERT dbo.HelpArticles(Category, Question, Answer, SortOrder)
SELECT c, q, a, s FROM (VALUES
 (N'Booking', N'How do I book a tour?', N'Open a tour, choose a date under Dates & prices and press Book. Your seats are held for 15 minutes while you enter traveler details. Our team reviews the booking and confirms it, usually within one working day.', 1),
 (N'Booking', N'Why is my tour booking "Pending"?', N'Every tour booking is checked by our operations team before it is confirmed, so we can make sure hotels, coaches and guides are ready. You will see the status change to Confirmed in My bookings.', 2),
 (N'Booking', N'Are hotel, flight, bus and taxi bookings confirmed straight away?', N'Yes. These bookings are confirmed instantly when you complete them, because the room or seat is reserved for you at that moment.', 3),
 (N'Payments', N'When do I pay?', N'Tour bookings are paid after our team confirms them. Hotel, flight, bus and taxi bookings can be paid right after booking from My bookings.', 1),
 (N'Payments', N'Which currency are prices in?', N'All prices are in New Taiwan dollars (TWD) and include tax unless stated otherwise.', 2),
 (N'Changes & cancellations', N'How do I cancel a booking?', N'Go to My bookings, open the booking and choose Cancel. Hotel, flight, bus and taxi bookings can be cancelled free of charge up to 24 hours before the start date. Tour cancellations are reviewed by our team.', 1),
 (N'Changes & cancellations', N'How long do refunds take?', N'Approved refunds are sent back to the original payment method. Banks usually show them within 5 to 10 working days.', 2),
 (N'Changes & cancellations', N'What happens if a typhoon affects my trip?', N'If weather or transport problems affect a departure, our team contacts you with options: a new date, a changed itinerary or a refund.', 3),
 (N'Coupons & deals', N'How do I use a coupon code?', N'Enter the code in the Coupon field when you book. The discount is checked and shown before you confirm. Each code has its own dates, minimum amount and usage limit.', 1),
 (N'Coupons & deals', N'Why was my coupon not accepted?', N'A code may have expired, may not apply to that type of booking, may need a higher order total, or may already have been used the maximum number of times.', 2),
 (N'Hotels & transport', N'Can I choose my taxi pickup time?', N'Yes. Airport and city transfers are booked for the time and address you enter. Your driver waits up to 60 minutes after a flight lands.', 1),
 (N'Hotels & transport', N'How much luggage can I bring on domestic flights?', N'Each passenger may bring one carry-on bag. Checked baggage allowances are shown on each flight result.', 2),
 (N'Account & privacy', N'How is my personal data protected?', N'Phone and passport numbers are encrypted and only shown masked to staff who need them. We keep data only as long as the retention rules in our privacy notice allow.', 1),
 (N'Account & privacy', N'I forgot my password. What should I do?', N'Choose Forgot password on the sign-in page and enter your email. If an account exists, we send a link to set a new password.', 2)
) x(c, q, a, s) WHERE NOT EXISTS (SELECT 1 FROM dbo.HelpArticles h WHERE h.Question = x.q);

/* ---- places used by search ---- */
MERGE dbo.Places AS t USING (VALUES
 ('CITY-TPE', N'Taipei', 'City', N'Taipei'), ('CITY-HUN', N'Hualien', 'City', N'Hualien'), ('CITY-SML', N'Sun Moon Lake', 'City', N'Sun Moon Lake'),
 ('CITY-ALI', N'Alishan', 'City', N'Alishan'), ('CITY-TNN', N'Tainan', 'City', N'Tainan'), ('CITY-KNH', N'Kinmen', 'City', N'Kinmen'),
 ('TSA', N'Taipei Songshan Airport', 'Airport', N'Taipei'), ('TPE', N'Taoyuan International Airport', 'Airport', N'Taoyuan'),
 ('KHH', N'Kaohsiung International Airport', 'Airport', N'Kaohsiung'), ('RMQ', N'Taichung Airport', 'Airport', N'Taichung'),
 ('HUN', N'Hualien Airport', 'Airport', N'Hualien'), ('TTT', N'Taitung Airport', 'Airport', N'Taitung'), ('KNH', N'Kinmen Airport', 'Airport', N'Kinmen'),
 ('TNN', N'Tainan Airport', 'Airport', N'Tainan'),
 ('BUS-TPE', N'Taipei Bus Station', 'Station', N'Taipei'), ('BUS-TCH', N'Taichung Bus Station', 'Station', N'Taichung'),
 ('BUS-TNN', N'Tainan Bus Station', 'Station', N'Tainan'), ('BUS-CYI', N'Chiayi Bus Station', 'Station', N'Chiayi'),
 ('BUS-ALI', N'Alishan Bus Stop', 'Station', N'Alishan'), ('BUS-SML', N'Sun Moon Lake Visitor Center', 'Station', N'Sun Moon Lake'),
 ('ZN-TPE-XY', N'Xinyi District', 'Zone', N'Taipei'), ('ZN-TPE-ZS', N'Zhongshan District', 'Zone', N'Taipei'),
 ('ZN-TNN-OC', N'Tainan Old City', 'Zone', N'Tainan')
) s(Code, Name, Kind, City) ON t.Code = s.Code
WHEN NOT MATCHED THEN INSERT (Code, Name, Kind, City) VALUES (s.Code, s.Name, s.Kind, s.City);

/* ---- partners ---- */
MERGE dbo.Suppliers AS t USING (VALUES
 ('SUP-HTL-03', N'Old Capital House', 'Hotel', 'HOTEL', 'stay@oldcapital.sanpu.test'),
 ('SUP-HTL-04', N'Xinyi Skyline Hotel', 'Hotel', 'HOTEL', 'rooms@xinyiskyline.sanpu.test'),
 ('SUP-HTL-05', N'Cypress Lodge', 'Hotel', 'HOTEL', 'lodge@cypress.sanpu.test'),
 ('SUP-HTL-06', N'Kinmen Courtyard Inn', 'Hotel', 'HOTEL', 'hello@courtyardinn.sanpu.test'),
 ('SUP-AIR-01', N'Formosa Sky', 'Airline', 'TRANS', 'groups@formosasky.sanpu.test'),
 ('SUP-AIR-02', N'Island Hopper Air', 'Airline', 'TRANS', 'sales@islandhopper.sanpu.test'),
 ('SUP-BUS-02', N'Central Line Bus', 'Coach', 'TRANS', 'tickets@centralline.sanpu.test'),
 ('SUP-TAX-01', N'Sanpu Limo', 'Taxi', 'TRANS', 'dispatch@sanpulimo.sanpu.test')
) s(Code, Name, Typ, Bu, Email) ON t.Code = s.Code
WHEN NOT MATCHED THEN INSERT (Code, Name, SupplierType, BusinessUnitId, ContactEmail, AdapterType, ConnectionStatus, IsDemo)
VALUES (s.Code, s.Name, s.Typ, (SELECT BusinessUnitId FROM dbo.BusinessUnits WHERE Code = s.Bu), s.Email, 'LocalMock', 'LocalMock', 1);

/* ---- services ---- */
DECLARE @S TABLE (Code varchar(30), Kind varchar(10), Name nvarchar(150), Sup varchar(20), Fr varchar(10), Tt varchar(10), Dep time(0), Dur int,
                  Cap int, MaxPer int, PPU int, Price decimal(12,2), Rating decimal(2,1), Feat nvarchar(400), Pol nvarchar(300), Img nvarchar(300));
INSERT @S VALUES
 ('H-TPE-SKY-DLX', 'Hotel', N'Xinyi Skyline Hotel · Deluxe King', 'SUP-HTL-04', 'CITY-TPE', NULL, NULL, NULL, 20, 4, 2, 5200, 4.6, N'Free Wi-Fi,City view,Breakfast included,Gym,MRT 3 min', N'Free cancellation until 24 hours before check-in.', '/images/destinations/taipei.svg'),
 ('H-TPE-SKY-FAM', 'Hotel', N'Xinyi Skyline Hotel · Family Suite', 'SUP-HTL-04', 'CITY-TPE', NULL, NULL, NULL, 6, 2, 4, 8800, 4.6, N'Two bedrooms,Breakfast included,Kids stay free,Free Wi-Fi', N'Free cancellation until 24 hours before check-in.', '/images/destinations/taipei.svg'),
 ('H-SML-LAKE-TWN', 'Hotel', N'Lakeside Hotel · Lake View Twin', 'SUP-HTL-01', 'CITY-SML', NULL, NULL, NULL, 18, 4, 2, 4800, 4.7, N'Lake view,Breakfast included,Hot spring bath,Boat pier 5 min', N'Free cancellation until 24 hours before check-in.', '/images/destinations/sunmoon.svg'),
 ('H-HUN-RIFT-DBL', 'Hotel', N'Rift Valley Inn · Garden Double', 'SUP-HTL-02', 'CITY-HUN', NULL, NULL, NULL, 14, 3, 2, 3600, 4.4, N'Garden view,Bicycle rental,Breakfast included,Free parking', N'Free cancellation until 24 hours before check-in.', '/images/destinations/hualien.svg'),
 ('H-ALI-CYP-TWN', 'Hotel', N'Cypress Lodge · Mountain Twin', 'SUP-HTL-05', 'CITY-ALI', NULL, NULL, NULL, 12, 3, 2, 4200, 4.5, N'Sunrise shuttle,Heating,Breakfast included,Forest trail access', N'Free cancellation until 24 hours before check-in.', '/images/destinations/alishan.svg'),
 ('H-TNN-OLD-DBL', 'Hotel', N'Old Capital House · Heritage Double', 'SUP-HTL-03', 'CITY-TNN', NULL, NULL, NULL, 10, 3, 2, 3900, 4.8, N'Restored shophouse,Breakfast included,Walk to temples,Free Wi-Fi', N'Free cancellation until 24 hours before check-in.', '/images/destinations/tainan.svg'),
 ('H-KNH-CRT-DBL', 'Hotel', N'Kinmen Courtyard Inn · Courtyard Room', 'SUP-HTL-06', 'CITY-KNH', NULL, NULL, NULL, 8, 3, 2, 3400, 4.6, N'Traditional house,Bicycle rental,Breakfast included', N'Free cancellation until 24 hours before check-in.', '/images/destinations/kinmen.svg'),
 ('F-FS101', 'Flight', N'Formosa Sky FS101', 'SUP-AIR-01', 'TSA', 'HUN', '07:30', 35, 70, 9, 1, 1890, NULL, N'Economy,1 carry-on 7 kg,Checked bag 20 kg', N'Free changes until 24 hours before departure.', '/images/destinations/hualien.svg'),
 ('F-FS102', 'Flight', N'Formosa Sky FS102', 'SUP-AIR-01', 'HUN', 'TSA', '18:10', 35, 70, 9, 1, 1890, NULL, N'Economy,1 carry-on 7 kg,Checked bag 20 kg', N'Free changes until 24 hours before departure.', '/images/destinations/taipei.svg'),
 ('F-FS201', 'Flight', N'Formosa Sky FS201', 'SUP-AIR-01', 'TSA', 'TTT', '08:20', 55, 70, 9, 1, 2290, NULL, N'Economy,1 carry-on 7 kg,Checked bag 20 kg', N'Free changes until 24 hours before departure.', '/images/destinations/hualien.svg'),
 ('F-FS301', 'Flight', N'Formosa Sky FS301', 'SUP-AIR-01', 'TSA', 'KNH', '09:00', 65, 70, 9, 1, 2380, NULL, N'Economy,1 carry-on 7 kg,Checked bag 20 kg', N'Free changes until 24 hours before departure.', '/images/destinations/kinmen.svg'),
 ('F-FS302', 'Flight', N'Formosa Sky FS302', 'SUP-AIR-01', 'KNH', 'TSA', '16:40', 65, 70, 9, 1, 2380, NULL, N'Economy,1 carry-on 7 kg,Checked bag 20 kg', N'Free changes until 24 hours before departure.', '/images/destinations/taipei.svg'),
 ('F-IH501', 'Flight', N'Island Hopper IH501', 'SUP-AIR-02', 'KHH', 'KNH', '10:15', 50, 56, 9, 1, 2050, NULL, N'Economy,1 carry-on 7 kg,Checked bag 15 kg', N'Changes allowed with a fee.', '/images/destinations/kinmen.svg'),
 ('F-IH601', 'Flight', N'Island Hopper IH601', 'SUP-AIR-02', 'RMQ', 'KNH', '12:30', 55, 56, 9, 1, 2190, NULL, N'Economy,1 carry-on 7 kg,Checked bag 15 kg', N'Changes allowed with a fee.', '/images/destinations/kinmen.svg'),
 ('F-IH701', 'Flight', N'Island Hopper IH701', 'SUP-AIR-02', 'TNN', 'KNH', '14:00', 50, 56, 9, 1, 2100, NULL, N'Economy,1 carry-on 7 kg,Checked bag 15 kg', N'Changes allowed with a fee.', '/images/destinations/kinmen.svg'),
 ('B-C1-TPE-TNN', 'Bus', N'Central Line C1 Express', 'SUP-BUS-02', 'BUS-TPE', 'BUS-TNN', '08:00', 270, 40, 9, 1, 590, 4.3, N'Reclining seats,USB charging,Restroom,Free Wi-Fi', N'Free cancellation until 24 hours before departure.', '/images/destinations/tainan.svg'),
 ('B-C1-TNN-TPE', 'Bus', N'Central Line C1 Express', 'SUP-BUS-02', 'BUS-TNN', 'BUS-TPE', '15:00', 270, 40, 9, 1, 590, 4.3, N'Reclining seats,USB charging,Restroom,Free Wi-Fi', N'Free cancellation until 24 hours before departure.', '/images/destinations/taipei.svg'),
 ('B-L2-TCH-SML', 'Bus', N'Lake Line L2', 'SUP-BUS-02', 'BUS-TCH', 'BUS-SML', '09:30', 105, 40, 9, 1, 195, 4.2, N'Luggage hold,USB charging', N'Free cancellation until 24 hours before departure.', '/images/destinations/sunmoon.svg'),
 ('B-M1-CYI-ALI', 'Bus', N'Mountain Line M1', 'SUP-BUS-02', 'BUS-CYI', 'BUS-ALI', '07:10', 150, 30, 9, 1, 278, 4.4, N'Luggage hold,Mountain views', N'Free cancellation until 24 hours before departure.', '/images/destinations/alishan.svg'),
 ('T-TPE-XY-SED', 'Taxi', N'Airport transfer · Sedan (up to 4)', 'SUP-TAX-01', 'TPE', 'ZN-TPE-XY', NULL, 60, 15, 3, 4, 1400, 4.8, N'Meet and greet,Flight tracking,2 large bags', N'Free cancellation until 24 hours before pickup.', '/images/destinations/taipei.svg'),
 ('T-TPE-XY-VAN', 'Taxi', N'Airport transfer · Van (up to 7)', 'SUP-TAX-01', 'TPE', 'ZN-TPE-XY', NULL, 60, 8, 2, 7, 1900, 4.8, N'Meet and greet,Flight tracking,5 large bags', N'Free cancellation until 24 hours before pickup.', '/images/destinations/taipei.svg'),
 ('T-TPE-XY-ACC', 'Taxi', N'Airport transfer · Accessible van', 'SUP-TAX-01', 'TPE', 'ZN-TPE-XY', NULL, 70, 3, 1, 4, 2100, 4.9, N'Wheelchair ramp,Meet and greet,Flight tracking', N'Free cancellation until 24 hours before pickup.', '/images/destinations/taipei.svg'),
 ('T-TPE-ZS-SED', 'Taxi', N'Airport transfer · Sedan (up to 4)', 'SUP-TAX-01', 'TPE', 'ZN-TPE-ZS', NULL, 55, 15, 3, 4, 1300, 4.8, N'Meet and greet,Flight tracking,2 large bags', N'Free cancellation until 24 hours before pickup.', '/images/destinations/taipei.svg'),
 ('T-TSA-XY-SED', 'Taxi', N'City transfer · Sedan (up to 4)', 'SUP-TAX-01', 'TSA', 'ZN-TPE-XY', NULL, 20, 20, 3, 4, 450, 4.7, N'Meet and greet,2 large bags', N'Free cancellation until 24 hours before pickup.', '/images/destinations/taipei.svg'),
 ('T-KHH-TNN-SED', 'Taxi', N'Airport transfer · Sedan (up to 4)', 'SUP-TAX-01', 'KHH', 'ZN-TNN-OC', NULL, 60, 10, 3, 4, 1500, 4.7, N'Meet and greet,Flight tracking,2 large bags', N'Free cancellation until 24 hours before pickup.', '/images/destinations/tainan.svg');

INSERT dbo.TravelServices(Code, Kind, Name, SupplierId, FromPlaceId, ToPlaceId, DepartTime, DurationMin, Capacity, MaxPerBooking, PeoplePerUnit, BasePrice, Rating, Features, CancellationPolicy, ImageUrl, IsDemo)
SELECT s.Code, s.Kind, s.Name, sp.SupplierId, f.PlaceId, tp.PlaceId, s.Dep, s.Dur, s.Cap, s.MaxPer, s.PPU, s.Price, s.Rating, s.Feat, s.Pol, s.Img, 1
FROM @S s JOIN dbo.Places f ON f.Code = s.Fr LEFT JOIN dbo.Places tp ON tp.Code = s.Tt LEFT JOIN dbo.Suppliers sp ON sp.Code = s.Sup
WHERE NOT EXISTS (SELECT 1 FROM dbo.TravelServices x WHERE x.Code = s.Code);

/* ---- inventory: next 150 days. Weekend nights cost more for hotels; flights rise slightly closer to departure.
   Some units are already sold through other channels (deterministic, so re-runs give the same picture). ---- */
DECLARE @Today date = CAST(SYSUTCDATETIME() AS date);
WITH d AS (SELECT TOP 150 DATEADD(DAY, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)), @Today) AS D FROM sys.all_objects)
INSERT dbo.ServiceInventory(ServiceId, ServiceDate, Capacity, Sold, Price)
SELECT s.ServiceId, d.D, s.Capacity,
       s.Capacity * (ABS(CHECKSUM(s.ServiceId, DATEDIFF(DAY, '2026-01-01', d.D))) % 45) / 100,
       ROUND(s.BasePrice * CASE
            WHEN s.Kind = 'Hotel' AND DATEPART(WEEKDAY, d.D) IN (6, 7) THEN 1.18
            WHEN s.Kind = 'Flight' AND DATEDIFF(DAY, @Today, d.D) <= 14 THEN 1.12
            WHEN s.Kind = 'Flight' AND DATEPART(WEEKDAY, d.D) IN (1, 6) THEN 1.06
            ELSE 1 END, 0)
FROM dbo.TravelServices s CROSS JOIN d
WHERE s.IsActive = 1 AND NOT EXISTS (SELECT 1 FROM dbo.ServiceInventory i WHERE i.ServiceId = s.ServiceId AND i.ServiceDate = d.D);

/* ---- coupons ---- */
DECLARE @Now datetime2(3) = SYSUTCDATETIME();
INSERT dbo.Coupons(Code, Description, DiscountType, DiscountValue, MaxDiscount, MinAmount, AppliesTo, StartsAtUtc, EndsAtUtc, UsageLimit, PerCustomerLimit, IsPublic)
SELECT c, d, t, v, mx, mn, ap, DATEADD(DAY, -1, @Now), DATEADD(DAY, days, @Now), lim, per, pub FROM (VALUES
 ('WELCOME10', N'10% off your first booking (up to TWD 1,000)', 'Percent', 10, 1000, 2000, 'All', 120, NULL, 1, 1),
 ('HOTEL15', N'15% off hotel stays of TWD 4,000 or more', 'Percent', 15, 2000, 4000, 'Hotel', 60, 500, 2, 1),
 ('FLY300', N'TWD 300 off domestic flights', 'Fixed', 300, NULL, 1500, 'Flight', 45, 300, 2, 1),
 ('TOUR500', N'TWD 500 off guided tours of TWD 6,000 or more', 'Fixed', 500, NULL, 6000, 'Tour', 90, 200, 1, 1),
 ('RIDE20', N'20% off airport and city transfers', 'Percent', 20, 400, 400, 'Taxi', 60, NULL, 3, 1),
 ('PARTNER2026', N'Corporate partner rate: 8% off any booking', 'Percent', 8, 3000, 0, 'All', 365, NULL, 20, 0)
) x(c, d, t, v, mx, mn, ap, days, lim, per, pub) WHERE NOT EXISTS (SELECT 1 FROM dbo.Coupons k WHERE k.Code = x.c);

/* ---- promotions (ad banners) ---- */
INSERT dbo.Promotions(Title, Subtitle, Placement, ImageUrl, CtaText, CtaUrl, CouponCode, Badge, StartsAtUtc, EndsAtUtc, Priority)
SELECT t, s, p, i, ct, cu, cc, b, DATEADD(DAY, -1, @Now), DATEADD(DAY, 60, @Now), pr FROM (VALUES
 (N'Lakeside weekends, 15% off', N'Stay at Sun Moon Lake or anywhere in Taiwan and save on stays of TWD 4,000 or more.', 'HomeStrip', '/images/destinations/sunmoon.svg', N'Find a hotel', '/hotels', 'HOTEL15', N'Hotels', 30),
 (N'Fly to Kinmen from TWD 2,050', N'Daily flights from Taipei, Taichung, Tainan and Kaohsiung. Use FLY300 for TWD 300 off.', 'HomeStrip', '/images/destinations/kinmen.svg', N'Search flights', '/flights', 'FLY300', N'Flights', 20),
 (N'New here? 10% off your first booking', N'Create an account and use WELCOME10 on any tour, stay or ride.', 'HomeStrip', '/images/destinations/taipei.svg', N'Create an account', '/register', 'WELCOME10', N'Welcome', 10),
 (N'Tours with TWD 500 off', N'Guided tours with our own coaches, hotels and local guides.', 'Deals', '/images/destinations/hualien.svg', N'Browse tours', '/tours', 'TOUR500', N'Tours', 30),
 (N'Airport pickup, 20% off', N'Meet and greet at Taoyuan or Songshan, with flight tracking.', 'Deals', '/images/destinations/taipei.svg', N'Book a transfer', '/taxis', 'RIDE20', N'Transfers', 20),
 (N'Need a ride from the airport?', N'Add a fixed-price transfer with meet and greet.', 'Checkout', '/images/destinations/taipei.svg', N'Book a transfer', '/taxis', 'RIDE20', N'Tip', 10)
) x(t, s, p, i, ct, cu, cc, b, pr) WHERE NOT EXISTS (SELECT 1 FROM dbo.Promotions k WHERE k.Title = x.t);
COMMIT;
PRINT '013_CustomerExperience applied';
