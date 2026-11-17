/* 002_TravelCatalog.sql — fictional regions, places, templates and constraint rules. DEMO / FICTIONAL. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;

MERGE dbo.Regions AS t USING (VALUES ('HUALIEN', N'Hualien / Taitung'), ('TAINAN', N'Tainan'), ('TAIPEI', N'Taipei')) AS s(Code, Name)
ON t.Code = s.Code WHEN NOT MATCHED THEN INSERT (Code, Name, IsDemo) VALUES (s.Code, s.Name, 1);

MERGE dbo.Places AS t USING (VALUES
 ('RAIL-TPE-HUA', N'Express train Taipei ↔ Hualien', 'HUALIEN', 'Rail', N'Island Rail Express', '06:00', '23:00', 1, 440),
 ('OUT-GORGE', N'Marble Gorge trail walk', 'HUALIEN', 'Outdoor', NULL, '08:00', '17:00', 0, 0),
 ('OUT-COAST', N'Coastal cliff viewpoint', 'HUALIEN', 'Outdoor', NULL, '07:00', '18:00', 1, 0),
 ('OUT-HOTSPR', N'Ruisui hot spring', 'HUALIEN', 'Outdoor', N'Ruisui Springs', '09:00', '21:00', 0, 300),
 ('IND-STONE', N'Hualien Stone Museum', 'HUALIEN', 'Indoor', NULL, '09:00', '17:00', 1, 150),
 ('IND-CULT', N'Indigenous Culture Hall', 'HUALIEN', 'Indoor', NULL, '09:30', '17:30', 1, 200),
 ('IND-TEA', N'Tea workshop (indoor)', 'HUALIEN', 'Indoor', N'Valley Tea House', '10:00', '18:00', 0, 350),
 ('COACH-RUI', N'Coach Hualien → Ruisui', 'HUALIEN', 'Coach', N'Formosa Coaches', '07:00', '20:00', 1, 600),
 ('VAN-RUI', N'Private van Hualien → Ruisui', 'HUALIEN', 'Coach', N'Valley Vans', '07:00', '21:00', 1, 900),
 ('HTL-RIFT', N'Rift Valley Inn check-in', 'HUALIEN', 'Hotel', N'Rift Valley Inn', '15:00', '23:00', 1, 1900),
 ('MEAL-NIGHT', N'Night market dinner', 'HUALIEN', 'Meal', NULL, '17:00', '23:00', 1, 400),
 ('MEAL-BAMBOO', N'Bamboo Kitchen lunch', 'HUALIEN', 'Meal', N'Bamboo Kitchen', '11:00', '14:30', 1, 450),
 ('RAIL-TPE-TNN', N'High-speed rail Taipei ↔ Tainan', 'TAINAN', 'Rail', N'Island Rail Express', '06:00', '23:30', 1, 1350),
 ('OUT-TEMPLE', N'Temple quarter walk', 'TAINAN', 'Outdoor', NULL, '08:00', '18:00', 0, 0),
 ('IND-MUSEUM', N'Tainan History Museum', 'TAINAN', 'Indoor', NULL, '09:00', '17:00', 1, 100),
 ('IND-ARCADE', N'Old Arcade Market (covered)', 'TAINAN', 'Indoor', NULL, '10:00', '22:00', 1, 300),
 ('HTL-TNN', N'Canal Hotel check-in', 'TAINAN', 'Hotel', N'Canal Hotel', '15:00', '23:59', 1, 2200),
 ('MEAL-MARKET', N'Night market food trail', 'TAINAN', 'Meal', NULL, '17:00', '23:59', 0, 500),
 ('MEAL-BEEF', N'Beef soup breakfast', 'TAINAN', 'Meal', NULL, '05:00', '11:00', 1, 200)
) AS s(Code, Name, Region, Cat, Sup, OpenT, CloseT, Acc, Cost)
ON t.Code = s.Code
WHEN NOT MATCHED THEN INSERT (Code, Name, RegionId, Category, SupplierName, OpenTime, CloseTime, WheelchairAccessible, CostPerPax, IsDemo)
VALUES (s.Code, s.Name, (SELECT RegionId FROM dbo.Regions WHERE Code = s.Region), s.Cat, s.Sup, s.OpenT, s.CloseT, s.Acc, s.Cost, 1);

MERGE dbo.ItineraryTemplates AS t USING (VALUES
 ('HUALIEN-4D', N'East coast slow travel 4D3N', 'HUALIEN', 4, 'Relaxed', N'Gorge, coast, valley hot spring and tea. Fictional template.'),
 ('TAINAN-2D', N'Tainan food weekend 2D1N', 'TAINAN', 2, 'Balanced', N'Temples, museum and two food markets. Fictional template.')) AS s(Code, Name, Region, Days, Pace, Descr)
ON t.Code = s.Code
WHEN NOT MATCHED THEN INSERT (Code, Name, RegionId, Days, Pace, Description, IsDemo) VALUES (s.Code, s.Name, (SELECT RegionId FROM dbo.Regions WHERE Code = s.Region), s.Days, s.Pace, s.Descr, 1);

DECLARE @T TABLE (Tpl varchar(30), K varchar(30), D int, St char(5), Dur int, Place varchar(30), Dep varchar(30));
INSERT @T VALUES
 ('HUALIEN-4D','T01',1,'09:30',150,'RAIL-TPE-HUA',NULL),
 ('HUALIEN-4D','T02',1,'13:00',180,'OUT-GORGE','T01'),
 ('HUALIEN-4D','T03',1,'18:30', 90,'MEAL-NIGHT','T02'),
 ('HUALIEN-4D','T04',2,'09:00',120,'OUT-COAST',NULL),
 ('HUALIEN-4D','T05',2,'12:00', 60,'MEAL-BAMBOO',NULL),
 ('HUALIEN-4D','T06',2,'14:00',120,'COACH-RUI','T05'),
 ('HUALIEN-4D','T07',2,'16:30', 60,'HTL-RIFT','T06'),
 ('HUALIEN-4D','T08',3,'09:30',150,'OUT-HOTSPR',NULL),
 ('HUALIEN-4D','T09',3,'13:00',120,'IND-TEA',NULL),
 ('HUALIEN-4D','T10',4,'10:00', 90,'IND-CULT',NULL),
 ('HUALIEN-4D','T11',4,'14:00',150,'RAIL-TPE-HUA','T10'),
 ('TAINAN-2D','R01',1,'08:00',120,'RAIL-TPE-TNN',NULL),
 ('TAINAN-2D','R02',1,'10:30',150,'OUT-TEMPLE','R01'),
 ('TAINAN-2D','R03',1,'13:30', 90,'IND-MUSEUM',NULL),
 ('TAINAN-2D','R04',1,'15:30', 60,'HTL-TNN',NULL),
 ('TAINAN-2D','R05',1,'18:00',120,'MEAL-MARKET','R04'),
 ('TAINAN-2D','R06',2,'07:30', 60,'MEAL-BEEF',NULL),
 ('TAINAN-2D','R07',2,'09:30',120,'IND-ARCADE',NULL),
 ('TAINAN-2D','R08',2,'13:00',120,'RAIL-TPE-TNN','R07');
INSERT dbo.TemplateItems(TemplateId, ItemKey, DayNo, StartTime, DurationMin, PlaceId, DependsOnItemKey)
SELECT tp.TemplateId, t.K, t.D, t.St, t.Dur, p.PlaceId, t.Dep
FROM @T t JOIN dbo.ItineraryTemplates tp ON tp.Code = t.Tpl JOIN dbo.Places p ON p.Code = t.Place
WHERE NOT EXISTS (SELECT 1 FROM dbo.TemplateItems x WHERE x.TemplateId = tp.TemplateId AND x.ItemKey = t.K);

MERGE dbo.TravelConstraints AS t USING (VALUES
 ('MAX_ITEMS_DAY', N'At most N activities per day', 'MaxItemsPerDay', N'5'),
 ('NO_START_BEFORE', N'No activity starts before this time', 'NoStartBefore', N'07:00'),
 ('LATEST_CHECKIN', N'Hotel check-in no later than', 'LatestHotelCheckIn', N'22:00'),
 ('MOBILITY', N'Travelers with mobility needs only get accessible places', 'MobilityNeedsAccessible', NULL),
 ('OPENING_HOURS', N'Activities must fit inside opening hours', 'RespectOpeningHours', NULL)) AS s(Code, Name, RuleType, Value)
ON t.Code = s.Code WHEN NOT MATCHED THEN INSERT (Code, Name, RuleType, Value) VALUES (s.Code, s.Name, s.RuleType, s.Value);

COMMIT;
PRINT '002_TravelCatalog applied';
