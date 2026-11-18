/* 004_access_requests.sql — staff self sign-up with administrator approval. A staff request is an inactive Staff user with
   ApprovalStatus 'Pending' and the role they asked for; an administrator approves (activates + grants a role) or rejects. Idempotent. */
SET NOCOUNT ON;
IF COL_LENGTH('dbo.Users', 'ApprovalStatus') IS NULL
    ALTER TABLE dbo.Users ADD ApprovalStatus varchar(10) NULL CONSTRAINT CK_Users_ApprovalStatus CHECK (ApprovalStatus IN ('Pending','Rejected')),
                              RequestedRoleId int NULL CONSTRAINT FK_Users_RequestedRole REFERENCES dbo.Roles(RoleId),
                              RequestNote nvarchar(300) NULL,
                              RequestedAtUtc datetime2(3) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_ApprovalStatus')
    CREATE INDEX IX_Users_ApprovalStatus ON dbo.Users(ApprovalStatus) WHERE ApprovalStatus IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE ScriptName = '004_access_requests.sql')
    INSERT dbo.SchemaVersions(ScriptName) VALUES ('004_access_requests.sql');
