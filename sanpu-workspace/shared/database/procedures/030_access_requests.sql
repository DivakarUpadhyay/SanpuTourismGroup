SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
GO
/* Roles a person may ask for when signing up as staff (every active role except the customer role). */
CREATE OR ALTER PROCEDURE dbo.usp_Auth_StaffRoles AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Customer varchar(50) = (SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = 'Auth.DefaultCustomerRole' AND IsActive = 1);
    SELECT RoleKey, RoleName, Description FROM dbo.Roles WHERE IsActive = 1 AND RoleKey <> ISNULL(@Customer, '') ORDER BY RoleName;
END;
GO
/* Staff sign-up: the account is created inactive and waits for an administrator. */
CREATE OR ALTER PROCEDURE dbo.usp_Auth_RequestStaffAccess
    @Email nvarchar(256), @NormalizedEmail nvarchar(256), @DisplayName nvarchar(100), @PasswordHash nvarchar(500),
    @PasswordHashAlgorithm varchar(30), @RoleKey varchar(50), @Note nvarchar(300) = NULL, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Customer varchar(50) = (SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = 'Auth.DefaultCustomerRole' AND IsActive = 1);
    DECLARE @RoleId int = (SELECT RoleId FROM dbo.Roles WHERE RoleKey = @RoleKey AND IsActive = 1 AND RoleKey <> ISNULL(@Customer, ''));
    IF @RoleId IS NULL THROW 50013, 'invalid_reference', 1;
    IF EXISTS (SELECT 1 FROM dbo.Users WHERE NormalizedEmail = @NormalizedEmail) THROW 50012, 'duplicate_email', 1;
    DECLARE @Id TABLE (UserId uniqueidentifier);
    BEGIN TRAN;
    INSERT dbo.Users(Email, NormalizedEmail, DisplayName, PasswordHash, PasswordHashAlgorithm, UserType, IsActive, ApprovalStatus, RequestedRoleId, RequestNote, RequestedAtUtc)
    OUTPUT inserted.UserId INTO @Id
    VALUES (@Email, @NormalizedEmail, @DisplayName, @PasswordHash, @PasswordHashAlgorithm, 'Staff', 0, 'Pending', @RoleId, NULLIF(LTRIM(RTRIM(@Note)), N''), SYSUTCDATETIME());
    DECLARE @UserId uniqueidentifier = (SELECT UserId FROM @Id);
    EXEC dbo.usp_Audit_Write @UserId, 'User.AccessRequested', 'User', @UserId, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT @UserId AS UserId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_ListAccessRequests AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.UserId, u.Email, u.DisplayName, u.ApprovalStatus, u.RequestNote, u.RequestedAtUtc, r.RoleKey AS RequestedRoleKey, r.RoleName AS RequestedRoleName
    FROM dbo.Users u LEFT JOIN dbo.Roles r ON r.RoleId = u.RequestedRoleId
    WHERE u.ApprovalStatus IS NOT NULL
    ORDER BY CASE u.ApprovalStatus WHEN 'Pending' THEN 0 ELSE 1 END, u.RequestedAtUtc DESC;
END;
GO
/* Approve: activate + grant the chosen role. Reject: keep the account inactive and marked Rejected. */
CREATE OR ALTER PROCEDURE dbo.usp_Admin_DecideAccessRequest
    @UserId uniqueidentifier, @Approve bit, @RoleKey varchar(50) = NULL, @ActorId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE UserId = @UserId AND ApprovalStatus = 'Pending') THROW 50001, 'not_found', 1;
    BEGIN TRAN;
    IF @Approve = 1
    BEGIN
        DECLARE @RoleId int = (SELECT RoleId FROM dbo.Roles WHERE RoleKey = ISNULL(@RoleKey, (SELECT r.RoleKey FROM dbo.Users u JOIN dbo.Roles r ON r.RoleId = u.RequestedRoleId WHERE u.UserId = @UserId)) AND IsActive = 1);
        IF @RoleId IS NULL THROW 50013, 'invalid_reference', 1;
        UPDATE dbo.Users SET IsActive = 1, ApprovalStatus = NULL, EmailVerifiedAtUtc = ISNULL(EmailVerifiedAtUtc, SYSUTCDATETIME()),
               PermissionVersion = PermissionVersion + 1, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorId WHERE UserId = @UserId;
        IF NOT EXISTS (SELECT 1 FROM dbo.UserRoles WHERE UserId = @UserId AND RoleId = @RoleId) INSERT dbo.UserRoles(UserId, RoleId) VALUES (@UserId, @RoleId);
        EXEC dbo.usp_Audit_Write @ActorId, 'User.AccessApproved', 'User', @UserId, NULL, @CorrelationId, NULL;
    END
    ELSE
    BEGIN
        UPDATE dbo.Users SET ApprovalStatus = 'Rejected', UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorId WHERE UserId = @UserId;
        EXEC dbo.usp_Audit_Write @ActorId, 'User.AccessRejected', 'User', @UserId, NULL, @CorrelationId, NULL;
    END
    COMMIT;
END;
GO
/* sign-in needs to tell a pending request apart from a disabled account */
CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetUserByEmail @NormalizedEmail nvarchar(256) AS
BEGIN
    SET NOCOUNT ON;
    SELECT UserId, Email, DisplayName, PasswordHash, PasswordHashAlgorithm, UserType, IsActive, IsLocked, FailedLoginCount,
           LockoutEndUtc, EmailVerifiedAtUtc, MustChangePassword, SecurityStamp, PermissionVersion, ApprovalStatus
    FROM dbo.Users WHERE NormalizedEmail = @NormalizedEmail;
END;
GO
