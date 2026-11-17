/* 103_customer_experience.sql — help center, contact requests, tour views (recommendations), promotions & coupons,
   and the travel-services engine (hotels, flights, buses, taxis). Idempotent. */
SET NOCOUNT ON;

/* ---------- help center ---------- */
IF OBJECT_ID('dbo.HelpArticles') IS NULL
CREATE TABLE dbo.HelpArticles (
    ArticleId   int IDENTITY(1,1) CONSTRAINT PK_HelpArticles PRIMARY KEY,
    Category    nvarchar(50)   NOT NULL,
    Question    nvarchar(200)  NOT NULL CONSTRAINT UQ_HelpArticles_Question UNIQUE,
    Answer      nvarchar(2000) NOT NULL,
    SortOrder   int NOT NULL CONSTRAINT DF_HelpArticles_Sort DEFAULT 0,
    IsPublished bit NOT NULL CONSTRAINT DF_HelpArticles_Published DEFAULT 1,
    HelpfulYes  int NOT NULL CONSTRAINT DF_HelpArticles_Yes DEFAULT 0,
    HelpfulNo   int NOT NULL CONSTRAINT DF_HelpArticles_No DEFAULT 0,
    UpdatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_HelpArticles_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion  rowversion NOT NULL
);

/* ---------- contact requests (each opens a staff task with an SLA) ---------- */
IF OBJECT_ID('dbo.ContactRequests') IS NULL
CREATE TABLE dbo.ContactRequests (
    ContactId    int IDENTITY(1,1) CONSTRAINT PK_ContactRequests PRIMARY KEY,
    ContactRef   AS ('CR-' + RIGHT('000000' + CAST(ContactId AS varchar(10)), 6)) PERSISTED,
    UserId       uniqueidentifier NULL CONSTRAINT FK_ContactRequests_User REFERENCES dbo.Users(UserId),
    Name         nvarchar(100)  NOT NULL,
    Email        nvarchar(256)  NOT NULL,
    Topic        varchar(20)    NOT NULL CONSTRAINT CK_ContactRequests_Topic CHECK (Topic IN ('Booking','Change','Payment','Feedback','Partnership','Other')),
    BookingRef   varchar(20)    NULL,
    Message      nvarchar(2000) NOT NULL,
    Status       varchar(20)    NOT NULL CONSTRAINT DF_ContactRequests_Status DEFAULT 'Open' CONSTRAINT CK_ContactRequests_Status CHECK (Status IN ('Open','Answered','Closed')),
    TaskId       int NULL CONSTRAINT FK_ContactRequests_Task REFERENCES dbo.StaffTasks(TaskId),
    CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_ContactRequests_Created DEFAULT SYSUTCDATETIME()
);

/* ---------- tour views: input for recommendations ---------- */
IF OBJECT_ID('dbo.TourViews') IS NULL
CREATE TABLE dbo.TourViews (
    ViewId     bigint IDENTITY(1,1) CONSTRAINT PK_TourViews PRIMARY KEY,
    TourId     int NOT NULL CONSTRAINT FK_TourViews_Tour REFERENCES dbo.Tours(TourId),
    UserId     uniqueidentifier NULL CONSTRAINT FK_TourViews_User REFERENCES dbo.Users(UserId),
    ViewedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_TourViews_At DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TourViews_User')
    CREATE INDEX IX_TourViews_User ON dbo.TourViews(UserId, ViewedAtUtc DESC) INCLUDE (TourId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TourViews_Tour')
    CREATE INDEX IX_TourViews_Tour ON dbo.TourViews(TourId, ViewedAtUtc DESC);
GO

/* ---------- promotions (ad banners) and coupons ---------- */
IF OBJECT_ID('dbo.Promotions') IS NULL
CREATE TABLE dbo.Promotions (
    PromotionId  int IDENTITY(1,1) CONSTRAINT PK_Promotions PRIMARY KEY,
    Title        nvarchar(120) NOT NULL,
    Subtitle     nvarchar(300) NULL,
    Placement    varchar(20)   NOT NULL CONSTRAINT CK_Promotions_Placement CHECK (Placement IN ('HomeHero','HomeStrip','Deals','Checkout')),
    ImageUrl     nvarchar(300) NULL,
    CtaText      nvarchar(40)  NULL,
    CtaUrl       nvarchar(300) NULL,
    CouponCode   varchar(30)   NULL,
    Badge        nvarchar(30)  NULL,
    StartsAtUtc  datetime2(3)  NOT NULL,
    EndsAtUtc    datetime2(3)  NOT NULL,
    Priority     int NOT NULL CONSTRAINT DF_Promotions_Priority DEFAULT 0,
    IsActive     bit NOT NULL CONSTRAINT DF_Promotions_Active DEFAULT 1,
    Impressions  int NOT NULL CONSTRAINT DF_Promotions_Impr DEFAULT 0,
    Clicks       int NOT NULL CONSTRAINT DF_Promotions_Clicks DEFAULT 0,
    UpdatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_Promotions_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion   rowversion NOT NULL,
    CONSTRAINT CK_Promotions_Dates CHECK (EndsAtUtc > StartsAtUtc),
    CONSTRAINT CK_Promotions_Cta CHECK (CtaUrl IS NULL OR CtaUrl LIKE '/%')
);
IF OBJECT_ID('dbo.Coupons') IS NULL
CREATE TABLE dbo.Coupons (
    CouponId       int IDENTITY(1,1) CONSTRAINT PK_Coupons PRIMARY KEY,
    Code           varchar(30)   NOT NULL CONSTRAINT UQ_Coupons_Code UNIQUE,
    Description    nvarchar(200) NOT NULL,
    DiscountType   varchar(10)   NOT NULL CONSTRAINT CK_Coupons_Type CHECK (DiscountType IN ('Percent','Fixed')),
    DiscountValue  decimal(12,2) NOT NULL CONSTRAINT CK_Coupons_Value CHECK (DiscountValue > 0),
    MaxDiscount    decimal(12,2) NULL,
    MinAmount      decimal(12,2) NOT NULL CONSTRAINT DF_Coupons_Min DEFAULT 0,
    AppliesTo      varchar(10)   NOT NULL CONSTRAINT DF_Coupons_Applies DEFAULT 'All' CONSTRAINT CK_Coupons_Applies CHECK (AppliesTo IN ('All','Tour','Hotel','Flight','Bus','Taxi')),
    StartsAtUtc    datetime2(3)  NOT NULL,
    EndsAtUtc      datetime2(3)  NOT NULL,
    UsageLimit     int NULL,
    PerCustomerLimit int NOT NULL CONSTRAINT DF_Coupons_PerCustomer DEFAULT 1,
    TimesUsed      int NOT NULL CONSTRAINT DF_Coupons_Used DEFAULT 0,
    IsPublic       bit NOT NULL CONSTRAINT DF_Coupons_Public DEFAULT 1,
    IsActive       bit NOT NULL CONSTRAINT DF_Coupons_Active DEFAULT 1,
    UpdatedAtUtc   datetime2(3) NOT NULL CONSTRAINT DF_Coupons_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion     rowversion NOT NULL,
    CONSTRAINT CK_Coupons_Dates CHECK (EndsAtUtc > StartsAtUtc),
    CONSTRAINT CK_Coupons_Percent CHECK (DiscountType <> 'Percent' OR DiscountValue <= 90),
    CONSTRAINT CK_Coupons_Code CHECK (Code NOT LIKE '%[^A-Z0-9-]%')
);
IF OBJECT_ID('dbo.CouponRedemptions') IS NULL
CREATE TABLE dbo.CouponRedemptions (
    RedemptionId   int IDENTITY(1,1) CONSTRAINT PK_CouponRedemptions PRIMARY KEY,
    CouponId       int NOT NULL CONSTRAINT FK_CouponRedemptions_Coupon REFERENCES dbo.Coupons(CouponId),
    CustomerUserId uniqueidentifier NOT NULL CONSTRAINT FK_CouponRedemptions_User REFERENCES dbo.Users(UserId),
    OrderType      varchar(10) NOT NULL CONSTRAINT CK_CouponRedemptions_Type CHECK (OrderType IN ('Tour','Service')),
    OrderRef       varchar(20) NOT NULL,
    DiscountAmount decimal(12,2) NOT NULL,
    RedeemedAtUtc  datetime2(3) NOT NULL CONSTRAINT DF_CouponRedemptions_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_CouponRedemptions_Order UNIQUE (OrderType, OrderRef)
);
IF COL_LENGTH('dbo.Bookings', 'CouponCode') IS NULL ALTER TABLE dbo.Bookings ADD CouponCode varchar(30) NULL;
IF COL_LENGTH('dbo.Bookings', 'DiscountAmount') IS NULL ALTER TABLE dbo.Bookings ADD DiscountAmount decimal(12,2) NOT NULL CONSTRAINT DF_Bookings_Discount DEFAULT 0;
GO

/* ---------- travel services engine: hotels, flights, buses, taxis ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Suppliers_Type' AND definition LIKE '%Airline%')
BEGIN
    ALTER TABLE dbo.Suppliers DROP CONSTRAINT CK_Suppliers_Type;
    ALTER TABLE dbo.Suppliers ADD CONSTRAINT CK_Suppliers_Type CHECK (SupplierType IN ('Hotel','Coach','Restaurant','Guide','OTA','Airline','Taxi'));
END
GO
IF OBJECT_ID('dbo.Places') IS NULL
CREATE TABLE dbo.Places (        -- cities, airports, bus stations and taxi zones used by search
    PlaceId   int IDENTITY(1,1) CONSTRAINT PK_Places PRIMARY KEY,
    Code      varchar(10)   NOT NULL CONSTRAINT UQ_Places_Code UNIQUE,
    Name      nvarchar(100) NOT NULL,
    Kind      varchar(10)   NOT NULL CONSTRAINT CK_Places_Kind CHECK (Kind IN ('City','Airport','Station','Zone')),
    City      nvarchar(60)  NOT NULL,
    IsActive  bit NOT NULL CONSTRAINT DF_Places_Active DEFAULT 1
);
IF OBJECT_ID('dbo.TravelServices') IS NULL
CREATE TABLE dbo.TravelServices (
    ServiceId     int IDENTITY(1,1) CONSTRAINT PK_TravelServices PRIMARY KEY,
    Code          varchar(30)   NOT NULL CONSTRAINT UQ_TravelServices_Code UNIQUE,
    Kind          varchar(10)   NOT NULL CONSTRAINT CK_TravelServices_Kind CHECK (Kind IN ('Hotel','Flight','Bus','Taxi')),
    Name          nvarchar(150) NOT NULL,          -- hotel + room type, flight number, bus line, taxi car class
    SupplierId    int NULL CONSTRAINT FK_TravelServices_Supplier REFERENCES dbo.Suppliers(SupplierId),
    FromPlaceId   int NOT NULL CONSTRAINT FK_TravelServices_From REFERENCES dbo.Places(PlaceId),   -- hotel location for hotels
    ToPlaceId     int NULL CONSTRAINT FK_TravelServices_To REFERENCES dbo.Places(PlaceId),
    DepartTime    time(0) NULL,
    DurationMin   int NULL CONSTRAINT CK_TravelServices_Duration CHECK (DurationMin IS NULL OR DurationMin > 0),
    Capacity      int NOT NULL CONSTRAINT CK_TravelServices_Capacity CHECK (Capacity > 0),   -- rooms / seats / cars per date
    MaxPerBooking int NOT NULL CONSTRAINT DF_TravelServices_Max DEFAULT 9,
    PeoplePerUnit int NOT NULL CONSTRAINT DF_TravelServices_PPU DEFAULT 1,                    -- guests per room, passengers per car
    BasePrice     decimal(12,2) NOT NULL CONSTRAINT CK_TravelServices_Price CHECK (BasePrice > 0),
    Currency      char(3) NOT NULL CONSTRAINT DF_TravelServices_Cur DEFAULT 'TWD',
    Rating        decimal(2,1) NULL CONSTRAINT CK_TravelServices_Rating CHECK (Rating IS NULL OR Rating BETWEEN 1 AND 5),
    Features      nvarchar(400) NULL,              -- comma-separated amenities / baggage / car features
    CancellationPolicy nvarchar(300) NULL,
    ImageUrl      nvarchar(300) NULL,
    IsActive      bit NOT NULL CONSTRAINT DF_TravelServices_Active DEFAULT 1,
    IsDemo        bit NOT NULL CONSTRAINT DF_TravelServices_Demo DEFAULT 0,
    UpdatedAtUtc  datetime2(3) NOT NULL CONSTRAINT DF_TravelServices_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion    rowversion NOT NULL,
    CONSTRAINT CK_TravelServices_Route CHECK (Kind = 'Hotel' OR ToPlaceId IS NOT NULL)
);
IF OBJECT_ID('dbo.ServiceInventory') IS NULL
CREATE TABLE dbo.ServiceInventory (
    InventoryId  int IDENTITY(1,1) CONSTRAINT PK_ServiceInventory PRIMARY KEY,
    ServiceId    int NOT NULL CONSTRAINT FK_ServiceInventory_Service REFERENCES dbo.TravelServices(ServiceId),
    ServiceDate  date NOT NULL,
    Capacity     int NOT NULL CONSTRAINT CK_ServiceInventory_Cap CHECK (Capacity >= 0),
    Sold         int NOT NULL CONSTRAINT DF_ServiceInventory_Sold DEFAULT 0,
    Held         int NOT NULL CONSTRAINT DF_ServiceInventory_Held DEFAULT 0,
    Price        decimal(12,2) NOT NULL CONSTRAINT CK_ServiceInventory_Price CHECK (Price > 0),
    Status       varchar(10) NOT NULL CONSTRAINT DF_ServiceInventory_Status DEFAULT 'Open' CONSTRAINT CK_ServiceInventory_Status CHECK (Status IN ('Open','Closed')),
    RowVersion   rowversion NOT NULL,
    CONSTRAINT UQ_ServiceInventory UNIQUE (ServiceId, ServiceDate),
    CONSTRAINT CK_ServiceInventory_Units CHECK (Sold >= 0 AND Held >= 0 AND Sold + Held <= Capacity)
);
IF OBJECT_ID('dbo.ServiceBookings') IS NULL
CREATE TABLE dbo.ServiceBookings (
    ServiceBookingId int IDENTITY(1,1) CONSTRAINT PK_ServiceBookings PRIMARY KEY,
    BookingRef     AS ('SB-' + RIGHT('000000' + CAST(ServiceBookingId AS varchar(10)), 6)) PERSISTED,
    CustomerUserId uniqueidentifier NOT NULL CONSTRAINT FK_ServiceBookings_Customer REFERENCES dbo.Users(UserId),
    ServiceId      int NOT NULL CONSTRAINT FK_ServiceBookings_Service REFERENCES dbo.TravelServices(ServiceId),
    StartDate      date NOT NULL,
    EndDate        date NOT NULL,           -- check-out for hotels; = StartDate for transport
    Units          int NOT NULL CONSTRAINT CK_ServiceBookings_Units CHECK (Units BETWEEN 1 AND 20),
    Travelers      int NOT NULL CONSTRAINT CK_ServiceBookings_Travelers CHECK (Travelers BETWEEN 1 AND 60),
    Subtotal       decimal(12,2) NOT NULL,
    DiscountAmount decimal(12,2) NOT NULL CONSTRAINT DF_ServiceBookings_Discount DEFAULT 0,
    TotalAmount    decimal(12,2) NOT NULL,
    Currency       char(3) NOT NULL CONSTRAINT DF_ServiceBookings_Cur DEFAULT 'TWD',
    CouponCode     varchar(30) NULL,
    Status         varchar(20) NOT NULL CONSTRAINT DF_ServiceBookings_Status DEFAULT 'Confirmed' CONSTRAINT CK_ServiceBookings_Status CHECK (Status IN ('Confirmed','Cancelled','Completed')),
    PaymentStatus  varchar(20) NOT NULL CONSTRAINT DF_ServiceBookings_Pay DEFAULT 'Unpaid' CONSTRAINT CK_ServiceBookings_Pay CHECK (PaymentStatus IN ('Unpaid','Paid','Refunded')),
    LeadName       nvarchar(100) NOT NULL,
    LeadPhoneEnc   varbinary(512) NULL,
    LeadPhoneMasked nvarchar(30) NULL,
    PickupAddress  nvarchar(200) NULL,      -- taxis
    PickupTime     time(0) NULL,            -- taxis
    Notes          nvarchar(500) NULL,
    IdempotencyKey varchar(64) NOT NULL,
    CreatedAtUtc   datetime2(3) NOT NULL CONSTRAINT DF_ServiceBookings_Created DEFAULT SYSUTCDATETIME(),
    CancelledAtUtc datetime2(3) NULL,
    RowVersion     rowversion NOT NULL,
    CONSTRAINT UQ_ServiceBookings_Idem UNIQUE (CustomerUserId, IdempotencyKey),
    CONSTRAINT CK_ServiceBookings_Dates CHECK (EndDate >= StartDate),
    CONSTRAINT CK_ServiceBookings_Money CHECK (DiscountAmount >= 0 AND TotalAmount >= 0 AND TotalAmount = Subtotal - DiscountAmount)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TravelServices_Search')
    CREATE INDEX IX_TravelServices_Search ON dbo.TravelServices(Kind, FromPlaceId, ToPlaceId) INCLUDE (Name, BasePrice, IsActive);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServiceBookings_Customer')
    CREATE INDEX IX_ServiceBookings_Customer ON dbo.ServiceBookings(CustomerUserId, CreatedAtUtc DESC);
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '103_customer_experience.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('103_customer_experience.sql');
