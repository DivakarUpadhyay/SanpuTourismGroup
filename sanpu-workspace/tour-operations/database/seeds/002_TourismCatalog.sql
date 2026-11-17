/* 002_TourismCatalog.sql — fictional business units, destinations, suppliers, tours, departures, vehicles, costs.
   Dates are relative to the day the seed runs. Everything here is DEMO / FICTIONAL. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;
DECLARE @Today date = CAST(SYSUTCDATETIME() AS date);

MERGE dbo.BusinessUnits AS t USING (VALUES
 ('TRAVEL', N'Travel', 'Tours'), ('HOTEL', N'Hotels', 'Lodging'), ('TRANS', N'Transport', 'Coaches'),
 ('DINE', N'Dining', 'Meals'), ('RETAIL', N'Retail & tea', 'Retail')) AS s(Code, Name, Kind)
ON t.Code = s.Code WHEN NOT MATCHED THEN INSERT (Code, Name, Kind, IsDemo) VALUES (s.Code, s.Name, s.Kind, 1);

MERGE dbo.Destinations AS t USING (VALUES
 ('HUALIEN', N'Hualien / Taitung', N'East'), ('ALISHAN', N'Alishan', N'Central'), ('SUNMOON', N'Sun Moon Lake', N'Central'),
 ('KINMEN', N'Kinmen', N'Islands'), ('TAINAN', N'Tainan', N'South'), ('TAIPEI', N'Taipei', N'North')) AS s(Code, Name, Region)
ON t.Code = s.Code WHEN NOT MATCHED THEN INSERT (Code, Name, Region, IsDemo) VALUES (s.Code, s.Name, s.Region, 1);

MERGE dbo.Suppliers AS t USING (VALUES
 ('SUP-HTL-01', N'Lakeside Hotel', 'Hotel', 'HOTEL', 'reservations@lakeside.demo.sanpu.test', 'Webhook', 'SUPPLIER_HTL01_HMAC'),
 ('SUP-HTL-02', N'Rift Valley Inn', 'Hotel', 'HOTEL', 'desk@riftinn.demo.sanpu.test', 'LocalMock', NULL),
 ('SUP-BUS-01', N'Formosa Coaches', 'Coach', 'TRANS', 'ops@formosacoach.demo.sanpu.test', 'Webhook', 'SUPPLIER_BUS01_HMAC'),
 ('SUP-RST-01', N'Bamboo Kitchen', 'Restaurant', 'DINE', 'group@bamboo.demo.sanpu.test', 'LocalMock', NULL),
 ('SUP-GDE-01', N'Island Guides', 'Guide', 'TRAVEL', 'roster@islandguides.demo.sanpu.test', 'LocalMock', NULL),
 ('SUP-OTA-01', N'OTA Partner', 'OTA', 'TRAVEL', NULL, 'Live', 'SUPPLIER_OTA01_API_KEY')) AS s(Code, Name, Typ, Bu, Email, Adapter, SecretRef)
ON t.Code = s.Code
WHEN NOT MATCHED THEN INSERT (Code, Name, SupplierType, BusinessUnitId, ContactEmail, AdapterType, WebhookSecretRef, ConnectionStatus, IsDemo)
VALUES (s.Code, s.Name, s.Typ, (SELECT BusinessUnitId FROM dbo.BusinessUnits WHERE Code = s.Bu), s.Email, s.Adapter, s.SecretRef,
        CASE s.Adapter WHEN 'LocalMock' THEN 'LocalMock' WHEN 'Webhook' THEN 'WebhookReady' ELSE 'PendingCredentials' END, 1);

MERGE dbo.Tours AS t USING (VALUES
 ('TW-ERV-3D', N'East Rift Valley 3D2N', N'Rice fields & hot springs', 'HUALIEN', 'TRAVEL', 3, 12800,
  N'Coach from Taipei, two nights at a valley inn, rice-field cycling and a tea farm visit.'),
 ('TW-ALI-2D', N'Alishan Sunrise 2D1N', N'Sunrise above the clouds', 'ALISHAN', 'TRAVEL', 2, 8600,
  N'Forest railway, sunrise at the viewing deck and an oolong tea tasting.'),
 ('TW-SML-2D', N'Sun Moon Lake Lodge 2D1N', N'Lakeside escape', 'SUNMOON', 'HOTEL', 2, 9900,
  N'Lake-view lodge stay with boat pass and dinner at the group restaurant.'),
 ('TW-KIN-3D', N'Kinmen Heritage 3D2N', N'Island heritage', 'KINMEN', 'TRAVEL', 3, 15200,
  N'Flights, old village walks and a local food trail.'),
 ('TW-TNN-2D', N'Tainan Food Weekend 2D1N', N'Taste of the old capital', 'TAINAN', 'DINE', 2, 7400,
  N'Temple quarter walk and a night-market dinner led by the dining team.'),
 ('TW-TPE-1D', N'Taipei Day Coach Tour', N'City highlights in a day', 'TAIPEI', 'TRANS', 1, 2600,
  N'Full-day coach loop with lunch. Unpublished draft for the admin demo.')) AS s(Code, Title, Slogan, Dest, Bu, Days, Price, Summary)
ON t.Code = s.Code
WHEN NOT MATCHED THEN INSERT (Code, Title, Slogan, DestinationId, BusinessUnitId, Days, BasePrice, Summary, IsPublished, IsDemo)
VALUES (s.Code, s.Title, s.Slogan, (SELECT DestinationId FROM dbo.Destinations WHERE Code = s.Dest), (SELECT BusinessUnitId FROM dbo.BusinessUnits WHERE Code = s.Bu),
        s.Days, s.Price, s.Summary, CASE WHEN s.Code = 'TW-TPE-1D' THEN 0 ELSE 1 END, 1);

/* departures: (tour, days from today, capacity, price) */
DECLARE @D TABLE (Tour varchar(30), DayOffset int, Cap int, Price decimal(12,2));
INSERT @D VALUES
 ('TW-ERV-3D', 18, 40, 12800), ('TW-ERV-3D', 32, 40, 12800), ('TW-ERV-3D', 53, 40, 13400),
 ('TW-ALI-2D', 12, 30, 8600), ('TW-ALI-2D', 26, 30, 8600),
 ('TW-SML-2D', 9, 24, 9900), ('TW-SML-2D', 23, 24, 9900),
 ('TW-KIN-3D', 25, 30, 15200), ('TW-KIN-3D', 46, 30, 15200),
 ('TW-TNN-2D', 15, 20, 7400), ('TW-TNN-2D', 29, 3, 7400),   -- 3-seat departure for the final-seat demo
 ('TW-TPE-1D', 7, 40, 2600);
INSERT dbo.Departures(TourId, DepartureDate, Capacity, Price, IsDemo)
SELECT t.TourId, DATEADD(DAY, d.DayOffset, @Today), d.Cap, d.Price, 1
FROM @D d JOIN dbo.Tours t ON t.Code = d.Tour
WHERE NOT EXISTS (SELECT 1 FROM dbo.Departures x WHERE x.TourId = t.TourId AND x.DepartureDate = DATEADD(DAY, d.DayOffset, @Today));

MERGE dbo.VehicleTypes AS t USING (VALUES
 ('COACH-43', N'43-seat coach', 43, 18000, 'SUP-BUS-01'), ('COACH-33', N'33-seat coach', 33, 15000, 'SUP-BUS-01'),
 ('MINI-20', N'20-seat minibus', 20, 9500, 'SUP-BUS-01'), ('VAN-9', N'9-seat van', 9, 5200, 'SUP-BUS-01')) AS s(Code, Name, Seats, Cost, Sup)
ON t.Code = s.Code
WHEN NOT MATCHED THEN INSERT (Code, Name, Seats, CostPerDay, SupplierId, IsDemo) VALUES (s.Code, s.Name, s.Seats, s.Cost, (SELECT SupplierId FROM dbo.Suppliers WHERE Code = s.Sup), 1);

MERGE dbo.CostAssumptions AS t USING (VALUES
 ('GuideCostPerDay', 3500, 'TWD/day', N'One guide per vehicle per day'),
 ('MealCostPerPaxDay', 650, 'TWD/pax/day', N'Group meals'),
 ('HotelCostPerPaxNight', 1900, 'TWD/pax/night', N'Twin-share rate'),
 ('InsurancePerPax', 180, 'TWD/pax', N'Travel insurance'),
 ('OverheadPct', 6, 'percent', N'Sales and admin overhead on revenue')) AS s(K, V, U, D)
ON t.AssumptionKey = s.K WHEN NOT MATCHED THEN INSERT (AssumptionKey, Value, Unit, Description) VALUES (s.K, s.V, s.U, s.D);

COMMIT;
PRINT '002_TourismCatalog applied';
