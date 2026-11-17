/* 015_Photos.sql — real photographs (Wikimedia Commons, free licenses; credits at /credits) replace the illustrations.
   Only rows still pointing at the original illustration are changed, so staff-chosen images are kept. Idempotent. */
SET NOCOUNT ON;
UPDATE dbo.Destinations SET ImageUrl = REPLACE(REPLACE(ImageUrl, '/images/destinations/', '/images/photos/'), '.svg', '.jpg') WHERE ImageUrl LIKE '/images/destinations/%.svg';
UPDATE dbo.Tours SET ImageUrl = REPLACE(REPLACE(ImageUrl, '/images/destinations/', '/images/photos/'), '.svg', '.jpg') WHERE ImageUrl LIKE '/images/destinations/%.svg';
UPDATE dbo.Promotions SET ImageUrl = REPLACE(REPLACE(ImageUrl, '/images/destinations/', '/images/photos/'), '.svg', '.jpg') WHERE ImageUrl LIKE '/images/destinations/%.svg';
UPDATE dbo.TravelServices SET ImageUrl = CASE Kind WHEN 'Flight' THEN '/images/photos/flight.jpg' WHEN 'Bus' THEN '/images/photos/bus.jpg' WHEN 'Taxi' THEN '/images/photos/taxi.jpg'
    ELSE REPLACE(REPLACE(ImageUrl, '/images/destinations/', '/images/photos/'), '.svg', '.jpg') END
WHERE ImageUrl LIKE '/images/destinations/%.svg';
UPDATE dbo.TravelServices SET ImageUrl = '/images/photos/hotel-room.jpg' WHERE Code = 'H-TPE-SKY-FAM' AND ImageUrl = '/images/photos/taipei.jpg';
UPDATE dbo.AppSettings SET SettingValue = '/images/photos/sunmoon.jpg' WHERE SettingKey = 'Ui.AuthImage' AND SettingValue LIKE '/images/destinations/%';
PRINT '015_Photos applied';

INSERT dbo.AppSettings(SettingKey, SettingValue, ValueType, Category, Description, ValidationJson, IsPublic, IsEditable)
SELECT 'Ui.HeroImage', N'/images/photos/hualien.jpg', 'String', 'Content', N'Home page hero photo (site image path)', N'{"maxLength":300}', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM dbo.AppSettings WHERE SettingKey = 'Ui.HeroImage');
