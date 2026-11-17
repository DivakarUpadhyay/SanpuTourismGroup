/* 001_admin_core.sql — shared admin schema. Idempotent; run against each app database. */
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF OBJECT_ID('dbo.SchemaVersions') IS NULL
CREATE TABLE dbo.SchemaVersions (
    ScriptName  varchar(200) NOT NULL CONSTRAINT PK_SchemaVersions PRIMARY KEY,
    AppliedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_SchemaVersions_At DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.Users') IS NULL
CREATE TABLE dbo.Users (
    UserId               uniqueidentifier NOT NULL CONSTRAINT PK_Users PRIMARY KEY CONSTRAINT DF_Users_Id DEFAULT NEWSEQUENTIALID(),
    Email                nvarchar(256)  NOT NULL,
    NormalizedEmail      nvarchar(256)  NOT NULL CONSTRAINT UQ_Users_NormalizedEmail UNIQUE,
    DisplayName          nvarchar(100)  NOT NULL,
    PasswordHash         nvarchar(500)  NULL,
    PasswordHashAlgorithm varchar(30)   NULL,
    UserType             varchar(10)    NOT NULL CONSTRAINT DF_Users_Type DEFAULT 'Staff' CONSTRAINT CK_Users_Type CHECK (UserType IN ('Staff','Customer')),
    IsActive             bit            NOT NULL CONSTRAINT DF_Users_Active DEFAULT 1,
    IsLocked             bit            NOT NULL CONSTRAINT DF_Users_Locked DEFAULT 0,
    FailedLoginCount     int            NOT NULL CONSTRAINT DF_Users_Failed DEFAULT 0,
    LockoutEndUtc        datetime2(3)   NULL,
    EmailVerifiedAtUtc   datetime2(3)   NULL,
    MustChangePassword   bit            NOT NULL CONSTRAINT DF_Users_MustChange DEFAULT 0,
    SecurityStamp        uniqueidentifier NOT NULL CONSTRAINT DF_Users_Stamp DEFAULT NEWID(),
    PermissionVersion    int            NOT NULL CONSTRAINT DF_Users_PermVer DEFAULT 1,
    PhoneEnc             varbinary(512) NULL,
    PhoneMasked          nvarchar(30)   NULL,
    PreferredLanguage    varchar(10)    NOT NULL CONSTRAINT DF_Users_Lang DEFAULT 'en',
    IsDemo               bit            NOT NULL CONSTRAINT DF_Users_Demo DEFAULT 0,
    CreatedAtUtc         datetime2(3)   NOT NULL CONSTRAINT DF_Users_Created DEFAULT SYSUTCDATETIME(),
    CreatedBy            uniqueidentifier NULL,
    UpdatedAtUtc         datetime2(3)   NOT NULL CONSTRAINT DF_Users_Updated DEFAULT SYSUTCDATETIME(),
    UpdatedBy            uniqueidentifier NULL,
    LastLoginAtUtc       datetime2(3)   NULL,
    RowVersion           rowversion     NOT NULL
);

IF OBJECT_ID('dbo.Roles') IS NULL
CREATE TABLE dbo.Roles (
    RoleId       int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
    RoleKey      varchar(50)   NOT NULL CONSTRAINT UQ_Roles_Key UNIQUE,
    RoleName     nvarchar(100) NOT NULL,
    Description  nvarchar(500) NULL,
    IsSystem     bit NOT NULL CONSTRAINT DF_Roles_System DEFAULT 0,
    IsActive     bit NOT NULL CONSTRAINT DF_Roles_Active DEFAULT 1,
    CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_Roles_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_Roles_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion   rowversion NOT NULL
);

IF OBJECT_ID('dbo.Permissions') IS NULL
CREATE TABLE dbo.Permissions (
    PermissionId  int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Permissions PRIMARY KEY,
    PermissionKey varchar(100) NOT NULL CONSTRAINT UQ_Permissions_Key UNIQUE,
    ModuleKey     varchar(50)  NOT NULL,
    ActionKey     varchar(50)  NOT NULL,
    Description   nvarchar(500) NULL,
    IsActive      bit NOT NULL CONSTRAINT DF_Permissions_Active DEFAULT 1,
    CreatedAtUtc  datetime2(3) NOT NULL CONSTRAINT DF_Permissions_Created DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.UserRoles') IS NULL
CREATE TABLE dbo.UserRoles (
    UserId        uniqueidentifier NOT NULL CONSTRAINT FK_UserRoles_User REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    RoleId        int NOT NULL CONSTRAINT FK_UserRoles_Role REFERENCES dbo.Roles(RoleId),
    AssignedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_UserRoles_At DEFAULT SYSUTCDATETIME(),
    AssignedBy    uniqueidentifier NULL,
    CONSTRAINT PK_UserRoles PRIMARY KEY (UserId, RoleId)
);

IF OBJECT_ID('dbo.RolePermissions') IS NULL
CREATE TABLE dbo.RolePermissions (
    RoleId       int NOT NULL CONSTRAINT FK_RolePermissions_Role REFERENCES dbo.Roles(RoleId) ON DELETE CASCADE,
    PermissionId int NOT NULL CONSTRAINT FK_RolePermissions_Perm REFERENCES dbo.Permissions(PermissionId),
    GrantedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_RolePermissions_At DEFAULT SYSUTCDATETIME(),
    GrantedBy    uniqueidentifier NULL,
    CONSTRAINT PK_RolePermissions PRIMARY KEY (RoleId, PermissionId)
);

IF OBJECT_ID('dbo.Menus') IS NULL
CREATE TABLE dbo.Menus (
    MenuId          int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Menus PRIMARY KEY,
    ParentMenuId    int NULL CONSTRAINT FK_Menus_Parent REFERENCES dbo.Menus(MenuId),
    MenuKey         varchar(100)  NOT NULL CONSTRAINT UQ_Menus_Key UNIQUE,
    Title           nvarchar(100) NOT NULL,
    RoutePath       nvarchar(200) NULL,
    IconKey         varchar(50)   NULL,
    SortOrder       int NOT NULL CONSTRAINT DF_Menus_Sort DEFAULT 0,
    IsVisible       bit NOT NULL CONSTRAINT DF_Menus_Visible DEFAULT 1,
    IsActive        bit NOT NULL CONSTRAINT DF_Menus_Active DEFAULT 1,
    IsExternal      bit NOT NULL CONSTRAINT DF_Menus_External DEFAULT 0,
    ApplicationArea varchar(10) NOT NULL CONSTRAINT CK_Menus_Area CHECK (ApplicationArea IN ('Admin','Customer')),
    CreatedAtUtc    datetime2(3) NOT NULL CONSTRAINT DF_Menus_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc    datetime2(3) NOT NULL CONSTRAINT DF_Menus_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion      rowversion NOT NULL,
    CONSTRAINT CK_Menus_NotSelf CHECK (ParentMenuId IS NULL OR ParentMenuId <> MenuId)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Menus_AreaRoute')
    CREATE UNIQUE INDEX UX_Menus_AreaRoute ON dbo.Menus(ApplicationArea, RoutePath) WHERE RoutePath IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Menus_Parent')
    CREATE INDEX IX_Menus_Parent ON dbo.Menus(ParentMenuId, SortOrder);

IF OBJECT_ID('dbo.MenuPermissions') IS NULL
CREATE TABLE dbo.MenuPermissions (
    MenuId       int NOT NULL CONSTRAINT FK_MenuPermissions_Menu REFERENCES dbo.Menus(MenuId) ON DELETE CASCADE,
    PermissionId int NOT NULL CONSTRAINT FK_MenuPermissions_Perm REFERENCES dbo.Permissions(PermissionId),
    CONSTRAINT PK_MenuPermissions PRIMARY KEY (MenuId, PermissionId)
);

IF OBJECT_ID('dbo.AppSettings') IS NULL
CREATE TABLE dbo.AppSettings (
    SettingId      int IDENTITY(1,1) NOT NULL CONSTRAINT PK_AppSettings PRIMARY KEY,
    SettingKey     varchar(150) NOT NULL CONSTRAINT UQ_AppSettings_Key UNIQUE,
    SettingValue   nvarchar(max) NOT NULL,
    ValueType      varchar(20) NOT NULL CONSTRAINT CK_AppSettings_Type CHECK (ValueType IN ('String','Int','Decimal','Bool','Json','SecretRef')),
    Category       varchar(50) NOT NULL,
    Description    nvarchar(500) NULL,
    ValidationJson nvarchar(1000) NULL,
    IsPublic       bit NOT NULL CONSTRAINT DF_AppSettings_Public DEFAULT 0,
    IsEditable     bit NOT NULL CONSTRAINT DF_AppSettings_Editable DEFAULT 1,
    IsActive       bit NOT NULL CONSTRAINT DF_AppSettings_Active DEFAULT 1,
    UpdatedAtUtc   datetime2(3) NOT NULL CONSTRAINT DF_AppSettings_Updated DEFAULT SYSUTCDATETIME(),
    UpdatedBy      uniqueidentifier NULL,
    RowVersion     rowversion NOT NULL
);

IF OBJECT_ID('dbo.RefreshTokens') IS NULL
CREATE TABLE dbo.RefreshTokens (
    TokenId           uniqueidentifier NOT NULL CONSTRAINT PK_RefreshTokens PRIMARY KEY,
    UserId            uniqueidentifier NOT NULL CONSTRAINT FK_RefreshTokens_User REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    FamilyId          uniqueidentifier NOT NULL,
    TokenHash         varbinary(32) NOT NULL CONSTRAINT UQ_RefreshTokens_Hash UNIQUE,
    CreatedAtUtc      datetime2(3) NOT NULL CONSTRAINT DF_RefreshTokens_Created DEFAULT SYSUTCDATETIME(),
    ExpiresAtUtc      datetime2(3) NOT NULL,
    RevokedAtUtc      datetime2(3) NULL,
    RevokeReason      varchar(50) NULL,
    ReplacedByTokenId uniqueidentifier NULL,
    UserAgent         nvarchar(200) NULL,
    IpAddress         varchar(45) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RefreshTokens_User')
    CREATE INDEX IX_RefreshTokens_User ON dbo.RefreshTokens(UserId, RevokedAtUtc);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RefreshTokens_Family')
    CREATE INDEX IX_RefreshTokens_Family ON dbo.RefreshTokens(FamilyId);

IF OBJECT_ID('dbo.UserInvitations') IS NULL
CREATE TABLE dbo.UserInvitations (
    InvitationId  uniqueidentifier NOT NULL CONSTRAINT PK_UserInvitations PRIMARY KEY CONSTRAINT DF_UserInvitations_Id DEFAULT NEWID(),
    UserId        uniqueidentifier NOT NULL CONSTRAINT FK_UserInvitations_User REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    TokenHash     varbinary(32) NOT NULL CONSTRAINT UQ_UserInvitations_Hash UNIQUE,
    ExpiresAtUtc  datetime2(3) NOT NULL,
    AcceptedAtUtc datetime2(3) NULL,
    RevokedAtUtc  datetime2(3) NULL,
    InvitedBy     uniqueidentifier NULL,
    CreatedAtUtc  datetime2(3) NOT NULL CONSTRAINT DF_UserInvitations_Created DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.PasswordResetTokens') IS NULL
CREATE TABLE dbo.PasswordResetTokens (
    ResetId      uniqueidentifier NOT NULL CONSTRAINT PK_PasswordResetTokens PRIMARY KEY CONSTRAINT DF_PasswordResetTokens_Id DEFAULT NEWID(),
    UserId       uniqueidentifier NOT NULL CONSTRAINT FK_PasswordResetTokens_User REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    TokenHash    varbinary(32) NOT NULL CONSTRAINT UQ_PasswordResetTokens_Hash UNIQUE,
    ExpiresAtUtc datetime2(3) NOT NULL,
    UsedAtUtc    datetime2(3) NULL,
    CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_PasswordResetTokens_Created DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.AuditLogs') IS NULL
CREATE TABLE dbo.AuditLogs (
    AuditId          bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLogs PRIMARY KEY,
    OccurredAtUtc    datetime2(3) NOT NULL CONSTRAINT DF_AuditLogs_At DEFAULT SYSUTCDATETIME(),
    ActorUserId      uniqueidentifier NULL,
    ActorEmailMasked nvarchar(256) NULL,
    Action           varchar(100) NOT NULL,
    EntityType       varchar(50) NOT NULL,
    EntityId         nvarchar(100) NULL,
    DetailsJson      nvarchar(max) NULL,
    CorrelationId    varchar(64) NULL,
    IpAddress        varchar(45) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_At')
    CREATE INDEX IX_AuditLogs_At ON dbo.AuditLogs(OccurredAtUtc DESC) INCLUDE (Action, EntityType);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLogs_Entity')
    CREATE INDEX IX_AuditLogs_Entity ON dbo.AuditLogs(EntityType, EntityId);
GO
CREATE OR ALTER TRIGGER dbo.TR_AuditLogs_Immutable ON dbo.AuditLogs INSTEAD OF UPDATE, DELETE AS
BEGIN
    THROW 50090, 'audit_immutable', 1;
END;
GO

IF OBJECT_ID('dbo.ContentTemplates') IS NULL
CREATE TABLE dbo.ContentTemplates (
    TemplateId   int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ContentTemplates PRIMARY KEY,
    TemplateKey  varchar(100) NOT NULL,
    Locale       varchar(10)  NOT NULL,
    Kind         varchar(20)  NOT NULL CONSTRAINT CK_ContentTemplates_Kind CHECK (Kind IN ('Content','Notification')),
    Subject      nvarchar(200) NOT NULL,
    Body         nvarchar(max) NOT NULL,
    IsPublic     bit NOT NULL CONSTRAINT DF_ContentTemplates_Public DEFAULT 0,
    UpdatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_ContentTemplates_Updated DEFAULT SYSUTCDATETIME(),
    UpdatedBy    uniqueidentifier NULL,
    RowVersion   rowversion NOT NULL,
    CONSTRAINT UQ_ContentTemplates UNIQUE (TemplateKey, Locale)
);

IF OBJECT_ID('dbo.DevOutbox') IS NULL
CREATE TABLE dbo.DevOutbox (
    MessageId    bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_DevOutbox PRIMARY KEY,
    ToAddress    nvarchar(256) NOT NULL,
    Subject      nvarchar(200) NOT NULL,
    Body         nvarchar(max) NOT NULL,
    CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_DevOutbox_At DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '001_admin_core.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('001_admin_core.sql');
