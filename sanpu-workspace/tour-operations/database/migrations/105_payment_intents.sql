/* 105_payment_intents.sql — one row per checkout attempt with an external gateway (ECPay) or the simulated provider.
   The amount is fixed when the intent is created; completion is idempotent and checks the paid amount. Idempotent. */
SET NOCOUNT ON;
IF OBJECT_ID('dbo.PaymentIntents') IS NULL
CREATE TABLE dbo.PaymentIntents (
    IntentId        int IDENTITY(1,1) CONSTRAINT PK_PaymentIntents PRIMARY KEY,
    MerchantTradeNo varchar(20)  NOT NULL CONSTRAINT UQ_PaymentIntents_TradeNo UNIQUE,   -- ECPay: max 20 letters/digits, unique per merchant
    OrderType       varchar(10)  NOT NULL CONSTRAINT CK_PaymentIntents_Type CHECK (OrderType IN ('Tour','Service')),
    OrderId         int          NOT NULL,
    OrderRef        varchar(20)  NOT NULL,
    CustomerUserId  uniqueidentifier NOT NULL CONSTRAINT FK_PaymentIntents_User REFERENCES dbo.Users(UserId),
    Mode            varchar(10)  NOT NULL CONSTRAINT CK_PaymentIntents_Mode CHECK (Mode IN ('Deposit','Balance','Full')),
    Amount          decimal(12,2) NOT NULL CONSTRAINT CK_PaymentIntents_Amount CHECK (Amount > 0),
    Currency        char(3)      NOT NULL CONSTRAINT DF_PaymentIntents_Cur DEFAULT 'TWD',
    Provider        varchar(20)  NOT NULL,
    Status          varchar(10)  NOT NULL CONSTRAINT DF_PaymentIntents_Status DEFAULT 'Pending' CONSTRAINT CK_PaymentIntents_Status CHECK (Status IN ('Pending','Paid','Failed','Expired')),
    ProviderTradeNo varchar(40)  NULL,
    ProviderMessage nvarchar(200) NULL,
    PaymentMethod   varchar(40)  NULL,
    CreatedAtUtc    datetime2(3) NOT NULL CONSTRAINT DF_PaymentIntents_Created DEFAULT SYSUTCDATETIME(),
    CompletedAtUtc  datetime2(3) NULL,
    RowVersion      rowversion NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PaymentIntents_Order')
    CREATE INDEX IX_PaymentIntents_Order ON dbo.PaymentIntents(OrderType, OrderId, Status);
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '105_payment_intents.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('105_payment_intents.sql');
