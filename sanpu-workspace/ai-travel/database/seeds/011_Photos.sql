/* 011_Photos.sql — real photographs (Wikimedia Commons, free licenses; credits at /credits) for regions. Idempotent. */
SET NOCOUNT ON;
UPDATE dbo.Regions SET ImageUrl = REPLACE(REPLACE(ImageUrl, '/images/destinations/', '/images/photos/'), '.svg', '.jpg') WHERE ImageUrl LIKE '/images/destinations/%.svg';
PRINT '011_Photos applied';
