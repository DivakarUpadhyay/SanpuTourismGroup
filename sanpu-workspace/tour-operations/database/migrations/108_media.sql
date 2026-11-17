/* 108_media.sql — uploaded images (tour, service and banner photos). Files live in the media folder; this table records
   who uploaded what, so files can be audited and de-duplicated by hash. Idempotent. */
SET NOCOUNT ON;
IF OBJECT_ID('dbo.MediaFiles') IS NULL
CREATE TABLE dbo.MediaFiles (
    MediaId       int IDENTITY(1,1) CONSTRAINT PK_MediaFiles PRIMARY KEY,
    FileName      varchar(60)   NOT NULL CONSTRAINT UQ_MediaFiles_Name UNIQUE,   -- random 32-hex name + extension
    OriginalName  nvarchar(200) NOT NULL,
    ContentType   varchar(20)   NOT NULL CONSTRAINT CK_MediaFiles_Type CHECK (ContentType IN ('image/jpeg','image/png','image/webp')),
    SizeBytes     int           NOT NULL CONSTRAINT CK_MediaFiles_Size CHECK (SizeBytes BETWEEN 1 AND 5242880),
    Sha256        char(64)      NOT NULL,
    UploadedBy    uniqueidentifier NOT NULL CONSTRAINT FK_MediaFiles_User REFERENCES dbo.Users(UserId),
    CreatedAtUtc  datetime2(3)  NOT NULL CONSTRAINT DF_MediaFiles_Created DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MediaFiles_Sha') CREATE INDEX IX_MediaFiles_Sha ON dbo.MediaFiles(Sha256);
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '108_media.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('108_media.sql');
