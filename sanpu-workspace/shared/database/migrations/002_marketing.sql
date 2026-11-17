/* 002_marketing.sql — newsletter subscribers (consent recorded). Shared by both apps. Idempotent. */
SET NOCOUNT ON;
IF OBJECT_ID('dbo.NewsletterSubscribers') IS NULL
CREATE TABLE dbo.NewsletterSubscribers (
    SubscriberId      int IDENTITY(1,1) CONSTRAINT PK_NewsletterSubscribers PRIMARY KEY,
    Email             nvarchar(256) NOT NULL,
    NormalizedEmail   nvarchar(256) NOT NULL CONSTRAINT UQ_NewsletterSubscribers_Email UNIQUE,
    Source            varchar(30)   NOT NULL CONSTRAINT DF_NewsletterSubscribers_Source DEFAULT 'footer',
    ConsentAtUtc      datetime2(3)  NOT NULL CONSTRAINT DF_NewsletterSubscribers_Consent DEFAULT SYSUTCDATETIME(),
    UnsubscribedAtUtc datetime2(3)  NULL,
    UnsubscribeToken  uniqueidentifier NOT NULL CONSTRAINT DF_NewsletterSubscribers_Token DEFAULT NEWID()
);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '002_marketing.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('002_marketing.sql');
