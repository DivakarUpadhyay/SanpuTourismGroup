/* 102_destination_guide.sql — destination guide content shown on the tour page: at-a-glance facts, a history timeline
   and nearby places. Content is data, so staff can change it without a release. Idempotent. */
SET NOCOUNT ON;
IF COL_LENGTH('dbo.Destinations', 'Overview') IS NULL     ALTER TABLE dbo.Destinations ADD Overview nvarchar(1200) NULL;
IF COL_LENGTH('dbo.Destinations', 'BestTime') IS NULL     ALTER TABLE dbo.Destinations ADD BestTime nvarchar(200) NULL;
IF COL_LENGTH('dbo.Destinations', 'GettingThere') IS NULL ALTER TABLE dbo.Destinations ADD GettingThere nvarchar(300) NULL;
IF COL_LENGTH('dbo.Destinations', 'LocalTip') IS NULL     ALTER TABLE dbo.Destinations ADD LocalTip nvarchar(300) NULL;
GO
IF OBJECT_ID('dbo.DestinationHistory') IS NULL
CREATE TABLE dbo.DestinationHistory (
    HistoryId     int IDENTITY(1,1) CONSTRAINT PK_DestinationHistory PRIMARY KEY,
    DestinationId int NOT NULL CONSTRAINT FK_DestinationHistory_Destination REFERENCES dbo.Destinations(DestinationId),
    Era           nvarchar(30)  NOT NULL,     -- "1912", "17th century", "Today"
    Title         nvarchar(120) NOT NULL,
    Detail        nvarchar(500) NOT NULL,
    SortOrder     int NOT NULL CONSTRAINT DF_DestinationHistory_Sort DEFAULT 0,
    CONSTRAINT UQ_DestinationHistory UNIQUE (DestinationId, Title)
);
IF OBJECT_ID('dbo.NearbyPlaces') IS NULL
CREATE TABLE dbo.NearbyPlaces (
    NearbyPlaceId int IDENTITY(1,1) CONSTRAINT PK_NearbyPlaces PRIMARY KEY,
    DestinationId int NOT NULL CONSTRAINT FK_NearbyPlaces_Destination REFERENCES dbo.Destinations(DestinationId),
    Name          nvarchar(120) NOT NULL,
    Category      varchar(20)   NOT NULL CONSTRAINT CK_NearbyPlaces_Category CHECK (Category IN ('Nature','Culture','Food','Heritage','Experience','Viewpoint')),
    DistanceKm    decimal(6,1)  NOT NULL CONSTRAINT CK_NearbyPlaces_Distance CHECK (DistanceKm >= 0),
    TravelMinutes int           NOT NULL CONSTRAINT CK_NearbyPlaces_Minutes CHECK (TravelMinutes >= 0),
    Detail        nvarchar(400) NOT NULL,
    SortOrder     int NOT NULL CONSTRAINT DF_NearbyPlaces_Sort DEFAULT 0,
    IsActive      bit NOT NULL CONSTRAINT DF_NearbyPlaces_Active DEFAULT 1,
    CONSTRAINT UQ_NearbyPlaces UNIQUE (DestinationId, Name)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_NearbyPlaces_Destination')
    CREATE INDEX IX_NearbyPlaces_Destination ON dbo.NearbyPlaces(DestinationId, SortOrder) INCLUDE (Name, Category, DistanceKm, TravelMinutes);
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '102_destination_guide.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('102_destination_guide.sql');
