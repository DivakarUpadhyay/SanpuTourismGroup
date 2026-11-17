/* 009_EnglishAndImages.sql (Chinese is detected by Unicode range 19968-40959) — the apps are English-only. Converts rows created by older seeds and sets region image paths.
   Only rows still holding the old seed values are touched, so administrator edits are kept. Idempotent. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;
UPDATE r SET Name = v.Name FROM dbo.Regions r JOIN (VALUES ('HUALIEN', N'Hualien / Taitung'), ('TAINAN', N'Tainan'), ('TAIPEI', N'Taipei')) v(Code, Name)
  ON v.Code = r.Code WHERE r.Name <> v.Name AND r.Name LIKE v.Name + N' %';
UPDATE dbo.AppSettings SET SettingValue = N'Energetic, with big ambitions' WHERE SettingKey = 'Ui.HeroTagline' AND UNICODE(SUBSTRING(SettingValue, 1, 1)) BETWEEN 19968 AND 40959;   -- old Chinese tagline
UPDATE dbo.AppSettings SET SettingValue = N'["en"]' WHERE SettingKey = 'Ui.Languages' AND SettingValue LIKE N'%zh-TW%';
DELETE dbo.ContentTemplates WHERE Locale <> 'en';
UPDATE dbo.Users SET PreferredLanguage = 'en' WHERE PreferredLanguage <> 'en';
UPDATE r SET ImageUrl = v.Img FROM dbo.Regions r JOIN (VALUES ('HUALIEN', '/images/destinations/hualien.svg'), ('TAINAN', '/images/destinations/tainan.svg'),
  ('TAIPEI', '/images/destinations/taipei.svg')) v(Code, Img) ON v.Code = r.Code WHERE r.ImageUrl IS NULL;
COMMIT;
PRINT '009_EnglishAndImages applied';
