/* 009_EnglishAndImages.sql (Chinese is detected by Unicode range 19968-40959) — the apps are English-only. Converts rows created by older seeds (Chinese names/taglines/templates)
   and sets destination image paths. Only rows still holding the old seed values are touched, so administrator edits are kept. Idempotent. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;
UPDATE b SET Name = v.Name FROM dbo.BusinessUnits b JOIN (VALUES ('TRAVEL', N'Travel'), ('HOTEL', N'Hotels'), ('TRANS', N'Transport'), ('DINE', N'Dining'), ('RETAIL', N'Retail & tea')) v(Code, Name)
  ON v.Code = b.Code WHERE UNICODE(SUBSTRING(b.Name, 1, 1)) BETWEEN 19968 AND 40959;
UPDATE d SET Name = v.Name FROM dbo.Destinations d JOIN (VALUES ('HUALIEN', N'Hualien / Taitung'), ('ALISHAN', N'Alishan'), ('SUNMOON', N'Sun Moon Lake'), ('KINMEN', N'Kinmen'), ('TAINAN', N'Tainan'), ('TAIPEI', N'Taipei')) v(Code, Name)
  ON v.Code = d.Code WHERE d.Name <> v.Name AND d.Name LIKE v.Name + N' %';
UPDATE t SET Slogan = v.Slogan FROM dbo.Tours t JOIN (VALUES ('TW-ERV-3D', N'Rice fields & hot springs'), ('TW-ALI-2D', N'Sunrise above the clouds'), ('TW-SML-2D', N'Lakeside escape'),
  ('TW-KIN-3D', N'Island heritage'), ('TW-TNN-2D', N'Taste of the old capital'), ('TW-TPE-1D', N'City highlights in a day')) v(Code, Slogan) ON v.Code = t.Code WHERE t.Slogan LIKE N'DEMO%' OR UNICODE(SUBSTRING(t.Slogan, 9, 1)) BETWEEN 19968 AND 40959;
UPDATE dbo.AppSettings SET SettingValue = N'Vertically integrated, distinctly different' WHERE SettingKey = 'Ui.HeroTagline' AND UNICODE(SUBSTRING(SettingValue, 1, 1)) BETWEEN 19968 AND 40959;   -- old Chinese tagline
UPDATE dbo.AppSettings SET SettingValue = N'["en"]' WHERE SettingKey = 'Ui.Languages' AND SettingValue LIKE N'%zh-TW%';
DELETE dbo.ContentTemplates WHERE Locale <> 'en';
UPDATE dbo.Users SET PreferredLanguage = 'en' WHERE PreferredLanguage <> 'en';
UPDATE d SET ImageUrl = v.Img FROM dbo.Destinations d JOIN (VALUES ('HUALIEN', '/images/destinations/hualien.svg'), ('ALISHAN', '/images/destinations/alishan.svg'),
  ('SUNMOON', '/images/destinations/sunmoon.svg'), ('KINMEN', '/images/destinations/kinmen.svg'), ('TAINAN', '/images/destinations/tainan.svg'), ('TAIPEI', '/images/destinations/taipei.svg')) v(Code, Img)
  ON v.Code = d.Code WHERE d.ImageUrl IS NULL;
COMMIT;
PRINT '009_EnglishAndImages applied';
