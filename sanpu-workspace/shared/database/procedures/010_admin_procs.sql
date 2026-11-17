SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;   -- required by persisted computed columns and filtered indexes, even when run outside db-setup
GO
/* 010_admin_procs.sql — auth + admin stored procedures (shared by both apps).
   Error contract: THROW <number>, '<stable_code>', 1. The API maps the number to an HTTP status.
     50001 not_found · 50009 concurrency_conflict · 50010 menu_cycle · 50011 has_children
     50012 duplicate · 50013 invalid_reference · 50020 last_admin · 50021 already_bootstrapped
     50022 system_protected · 50040 token_invalid · 50041 validation_failed */
SET NOCOUNT ON;
GO
CREATE OR ALTER FUNCTION dbo.fn_MaskEmail(@Email nvarchar(256)) RETURNS nvarchar(256) AS
BEGIN
    DECLARE @at int = CHARINDEX('@', @Email);
    IF @Email IS NULL OR @at < 2 RETURN N'***';
    RETURN LEFT(@Email, 1) + N'***' + SUBSTRING(@Email, @at, 256);
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Audit_Write
    @ActorUserId uniqueidentifier, @Action varchar(100), @EntityType varchar(50), @EntityId nvarchar(100),
    @DetailsJson nvarchar(max) = NULL, @CorrelationId varchar(64) = NULL, @IpAddress varchar(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT dbo.AuditLogs(ActorUserId, ActorEmailMasked, Action, EntityType, EntityId, DetailsJson, CorrelationId, IpAddress)
    SELECT @ActorUserId,
           CASE WHEN @ActorUserId IS NULL THEN N'system' ELSE (SELECT dbo.fn_MaskEmail(Email) FROM dbo.Users WHERE UserId = @ActorUserId) END,
           @Action, @EntityType, @EntityId, @DetailsJson, @CorrelationId, @IpAddress;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Audit_Search
    @Actor nvarchar(256) = NULL, @EntityType varchar(50) = NULL, @EntityId nvarchar(100) = NULL, @Action varchar(100) = NULL,
    @FromUtc datetime2(3) = NULL, @ToUtc datetime2(3) = NULL, @Page int = 1, @PageSize int = 50
AS
BEGIN
    SET NOCOUNT ON;
    SELECT COUNT_BIG(*) AS Total FROM dbo.AuditLogs a
    WHERE (@Actor IS NULL OR a.ActorEmailMasked LIKE '%' + @Actor + '%')
      AND (@EntityType IS NULL OR a.EntityType = @EntityType) AND (@EntityId IS NULL OR a.EntityId = @EntityId)
      AND (@Action IS NULL OR a.Action LIKE @Action + '%')
      AND (@FromUtc IS NULL OR a.OccurredAtUtc >= @FromUtc) AND (@ToUtc IS NULL OR a.OccurredAtUtc < @ToUtc);
    SELECT a.AuditId, a.OccurredAtUtc, a.ActorEmailMasked, a.Action, a.EntityType, a.EntityId, a.DetailsJson, a.CorrelationId
    FROM dbo.AuditLogs a
    WHERE (@Actor IS NULL OR a.ActorEmailMasked LIKE '%' + @Actor + '%')
      AND (@EntityType IS NULL OR a.EntityType = @EntityType) AND (@EntityId IS NULL OR a.EntityId = @EntityId)
      AND (@Action IS NULL OR a.Action LIKE @Action + '%')
      AND (@FromUtc IS NULL OR a.OccurredAtUtc >= @FromUtc) AND (@ToUtc IS NULL OR a.OccurredAtUtc < @ToUtc)
    ORDER BY a.AuditId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
/* ---------------- AUTH ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetUserByEmail @NormalizedEmail nvarchar(256) AS
BEGIN
    SET NOCOUNT ON;
    SELECT UserId, Email, DisplayName, PasswordHash, PasswordHashAlgorithm, UserType, IsActive, IsLocked, FailedLoginCount,
           LockoutEndUtc, EmailVerifiedAtUtc, MustChangePassword, SecurityStamp, PermissionVersion
    FROM dbo.Users WHERE NormalizedEmail = @NormalizedEmail;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Auth_RecordLoginResult
    @UserId uniqueidentifier, @Succeeded bit, @MaxFailed int, @LockoutMinutes int,
    @IpAddress varchar(45) = NULL, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    IF @Succeeded = 1
    BEGIN
        UPDATE dbo.Users SET FailedLoginCount = 0, LockoutEndUtc = NULL, LastLoginAtUtc = SYSUTCDATETIME() WHERE UserId = @UserId;
        EXEC dbo.usp_Audit_Write @UserId, 'Auth.LoginSucceeded', 'User', @UserId, NULL, @CorrelationId, @IpAddress;
    END
    ELSE
    BEGIN
        UPDATE dbo.Users
           SET FailedLoginCount = FailedLoginCount + 1,
               LockoutEndUtc = CASE WHEN FailedLoginCount + 1 >= @MaxFailed THEN DATEADD(MINUTE, @LockoutMinutes, SYSUTCDATETIME()) ELSE LockoutEndUtc END
         WHERE UserId = @UserId;
        DECLARE @d nvarchar(200) = (SELECT FailedLoginCount AS failedCount, CASE WHEN LockoutEndUtc > SYSUTCDATETIME() THEN 1 ELSE 0 END AS lockedOut
                                    FROM dbo.Users WHERE UserId = @UserId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC dbo.usp_Audit_Write NULL, 'Auth.LoginFailed', 'User', @UserId, @d, @CorrelationId, @IpAddress;
    END
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetUserSecurityState @UserId uniqueidentifier AS
BEGIN
    SET NOCOUNT ON;
    SELECT UserId, Email, DisplayName, UserType, IsActive, IsLocked, LockoutEndUtc, SecurityStamp, PermissionVersion, MustChangePassword,
           PhoneMasked, PreferredLanguage, LastLoginAtUtc
    FROM dbo.Users WHERE UserId = @UserId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetUserPermissions @UserId uniqueidentifier AS
BEGIN
    SET NOCOUNT ON;
    SELECT DISTINCT p.PermissionKey
    FROM dbo.UserRoles ur
    JOIN dbo.Roles r ON r.RoleId = ur.RoleId AND r.IsActive = 1
    JOIN dbo.RolePermissions rp ON rp.RoleId = r.RoleId
    JOIN dbo.Permissions p ON p.PermissionId = rp.PermissionId AND p.IsActive = 1
    WHERE ur.UserId = @UserId;
    SELECT r.RoleKey FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId AND r.IsActive = 1 WHERE ur.UserId = @UserId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Auth_CreateRefreshToken
    @TokenId uniqueidentifier, @UserId uniqueidentifier, @FamilyId uniqueidentifier, @TokenHash varbinary(32),
    @ExpiresAtUtc datetime2(3), @UserAgent nvarchar(200) = NULL, @IpAddress varchar(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT dbo.RefreshTokens(TokenId, UserId, FamilyId, TokenHash, ExpiresAtUtc, UserAgent, IpAddress)
    VALUES (@TokenId, @UserId, @FamilyId, @TokenHash, @ExpiresAtUtc, LEFT(@UserAgent, 200), @IpAddress);
END;
GO
/* Rotation with reuse detection. Outcome: ok | invalid | expired | reuse | inactive */
CREATE OR ALTER PROCEDURE dbo.usp_Auth_RotateRefreshToken
    @OldTokenHash varbinary(32), @NewTokenId uniqueidentifier, @NewTokenHash varbinary(32), @NewExpiresAtUtc datetime2(3),
    @UserAgent nvarchar(200) = NULL, @IpAddress varchar(45) = NULL, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @TokenId uniqueidentifier, @UserId uniqueidentifier, @FamilyId uniqueidentifier, @Revoked datetime2(3), @Expires datetime2(3), @Outcome varchar(10);
    BEGIN TRAN;
    SELECT @TokenId = TokenId, @UserId = UserId, @FamilyId = FamilyId, @Revoked = RevokedAtUtc, @Expires = ExpiresAtUtc
    FROM dbo.RefreshTokens WITH (UPDLOCK, ROWLOCK) WHERE TokenHash = @OldTokenHash;

    IF @TokenId IS NULL SET @Outcome = 'invalid';
    ELSE IF @Revoked IS NOT NULL
    BEGIN
        SET @Outcome = 'reuse';
        UPDATE dbo.RefreshTokens SET RevokedAtUtc = SYSUTCDATETIME(), RevokeReason = 'reuse_detected' WHERE FamilyId = @FamilyId AND RevokedAtUtc IS NULL;
        EXEC dbo.usp_Audit_Write NULL, 'Auth.RefreshReuseDetected', 'User', @UserId, N'{"familyRevoked":true}', @CorrelationId, @IpAddress;
    END
    ELSE IF @Expires <= SYSUTCDATETIME() SET @Outcome = 'expired';
    ELSE IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId AND IsActive = 1 AND IsLocked = 0)
    BEGIN
        SET @Outcome = 'inactive';
        UPDATE dbo.RefreshTokens SET RevokedAtUtc = SYSUTCDATETIME(), RevokeReason = 'user_inactive' WHERE FamilyId = @FamilyId AND RevokedAtUtc IS NULL;
    END
    ELSE
    BEGIN
        SET @Outcome = 'ok';
        UPDATE dbo.RefreshTokens SET RevokedAtUtc = SYSUTCDATETIME(), RevokeReason = 'rotated', ReplacedByTokenId = @NewTokenId WHERE TokenId = @TokenId;
        INSERT dbo.RefreshTokens(TokenId, UserId, FamilyId, TokenHash, ExpiresAtUtc, UserAgent, IpAddress)
        VALUES (@NewTokenId, @UserId, @FamilyId, @NewTokenHash, @NewExpiresAtUtc, LEFT(@UserAgent, 200), @IpAddress);
    END
    COMMIT;
    SELECT @Outcome AS Outcome, @UserId AS UserId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Auth_RevokeRefreshToken @TokenHash varbinary(32), @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @FamilyId uniqueidentifier, @UserId uniqueidentifier;
    SELECT @FamilyId = FamilyId, @UserId = UserId FROM dbo.RefreshTokens WHERE TokenHash = @TokenHash;
    IF @FamilyId IS NULL RETURN;
    UPDATE dbo.RefreshTokens SET RevokedAtUtc = SYSUTCDATETIME(), RevokeReason = 'logout' WHERE FamilyId = @FamilyId AND RevokedAtUtc IS NULL;
    EXEC dbo.usp_Audit_Write @UserId, 'Auth.Logout', 'User', @UserId, NULL, @CorrelationId, NULL;
END;
GO
/* Revokes every refresh token and rotates SecurityStamp, so access tokens already issued stop working at once. */
CREATE OR ALTER PROCEDURE dbo.usp_Auth_RevokeSessions
    @UserId uniqueidentifier, @ActorUserId uniqueidentifier = NULL, @Reason varchar(50) = 'admin_revoke', @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId) THROW 50001, 'not_found', 1;
    BEGIN TRAN;
    UPDATE dbo.RefreshTokens SET RevokedAtUtc = SYSUTCDATETIME(), RevokeReason = @Reason WHERE UserId = @UserId AND RevokedAtUtc IS NULL;
    UPDATE dbo.Users SET SecurityStamp = NEWID(), UpdatedAtUtc = SYSUTCDATETIME() WHERE UserId = @UserId;
    DECLARE @d nvarchar(100) = N'{"reason":"' + @Reason + N'"}';
    EXEC dbo.usp_Audit_Write @ActorUserId, 'User.SessionsRevoked', 'User', @UserId, @d, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Auth_ListSessions @UserId uniqueidentifier AS
BEGIN
    SET NOCOUNT ON;
    SELECT TokenId, FamilyId, CreatedAtUtc, ExpiresAtUtc, UserAgent, IpAddress
    FROM dbo.RefreshTokens WHERE UserId = @UserId AND RevokedAtUtc IS NULL AND ExpiresAtUtc > SYSUTCDATETIME()
    ORDER BY CreatedAtUtc DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Auth_CreatePasswordReset
    @NormalizedEmail nvarchar(256), @TokenHash varbinary(32), @ExpiresAtUtc datetime2(3), @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @UserId uniqueidentifier;
    SELECT @UserId = UserId FROM dbo.Users WHERE NormalizedEmail = @NormalizedEmail AND IsActive = 1 AND PasswordHash IS NOT NULL;
    IF @UserId IS NULL RETURN;   -- caller always answers 202, so no enumeration
    UPDATE dbo.PasswordResetTokens SET UsedAtUtc = SYSUTCDATETIME() WHERE UserId = @UserId AND UsedAtUtc IS NULL;
    INSERT dbo.PasswordResetTokens(UserId, TokenHash, ExpiresAtUtc) VALUES (@UserId, @TokenHash, @ExpiresAtUtc);
    EXEC dbo.usp_Audit_Write NULL, 'Auth.PasswordResetRequested', 'User', @UserId, NULL, @CorrelationId, NULL;
    SELECT UserId, Email, DisplayName FROM dbo.Users WHERE UserId = @UserId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Auth_ConsumePasswordReset
    @TokenHash varbinary(32), @PasswordHash nvarchar(500), @PasswordHashAlgorithm varchar(30), @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @ResetId uniqueidentifier, @UserId uniqueidentifier;
    BEGIN TRAN;
    SELECT @ResetId = ResetId, @UserId = UserId FROM dbo.PasswordResetTokens WITH (UPDLOCK)
    WHERE TokenHash = @TokenHash AND UsedAtUtc IS NULL AND ExpiresAtUtc > SYSUTCDATETIME();
    IF @ResetId IS NULL THROW 50040, 'token_invalid', 1;
    UPDATE dbo.PasswordResetTokens SET UsedAtUtc = SYSUTCDATETIME() WHERE ResetId = @ResetId;
    UPDATE dbo.Users SET PasswordHash = @PasswordHash, PasswordHashAlgorithm = @PasswordHashAlgorithm, FailedLoginCount = 0, LockoutEndUtc = NULL,
           MustChangePassword = 0, SecurityStamp = NEWID(), UpdatedAtUtc = SYSUTCDATETIME() WHERE UserId = @UserId;
    UPDATE dbo.RefreshTokens SET RevokedAtUtc = SYSUTCDATETIME(), RevokeReason = 'password_reset' WHERE UserId = @UserId AND RevokedAtUtc IS NULL;
    EXEC dbo.usp_Audit_Write @UserId, 'Auth.PasswordReset', 'User', @UserId, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetInvitation @TokenHash varbinary(32) AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.Email, u.DisplayName, i.ExpiresAtUtc
    FROM dbo.UserInvitations i JOIN dbo.Users u ON u.UserId = i.UserId
    WHERE i.TokenHash = @TokenHash AND i.AcceptedAtUtc IS NULL AND i.RevokedAtUtc IS NULL AND i.ExpiresAtUtc > SYSUTCDATETIME();
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Auth_AcceptInvitation
    @TokenHash varbinary(32), @DisplayName nvarchar(100), @PasswordHash nvarchar(500), @PasswordHashAlgorithm varchar(30), @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @InvId uniqueidentifier, @UserId uniqueidentifier;
    BEGIN TRAN;
    SELECT @InvId = InvitationId, @UserId = UserId FROM dbo.UserInvitations WITH (UPDLOCK)
    WHERE TokenHash = @TokenHash AND AcceptedAtUtc IS NULL AND RevokedAtUtc IS NULL AND ExpiresAtUtc > SYSUTCDATETIME();
    IF @InvId IS NULL THROW 50040, 'token_invalid', 1;
    UPDATE dbo.UserInvitations SET AcceptedAtUtc = SYSUTCDATETIME() WHERE InvitationId = @InvId;
    UPDATE dbo.Users SET DisplayName = @DisplayName, PasswordHash = @PasswordHash, PasswordHashAlgorithm = @PasswordHashAlgorithm,
           EmailVerifiedAtUtc = SYSUTCDATETIME(), SecurityStamp = NEWID(), UpdatedAtUtc = SYSUTCDATETIME() WHERE UserId = @UserId;
    EXEC dbo.usp_Audit_Write @UserId, 'User.InvitationAccepted', 'User', @UserId, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetPasswordHash @UserId uniqueidentifier AS
BEGIN
    SET NOCOUNT ON;
    SELECT PasswordHash FROM dbo.Users WHERE UserId = @UserId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Auth_ChangePassword
    @UserId uniqueidentifier, @PasswordHash nvarchar(500), @PasswordHashAlgorithm varchar(30), @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    UPDATE dbo.Users SET PasswordHash = @PasswordHash, PasswordHashAlgorithm = @PasswordHashAlgorithm, MustChangePassword = 0,
           SecurityStamp = NEWID(), UpdatedAtUtc = SYSUTCDATETIME() WHERE UserId = @UserId;
    UPDATE dbo.RefreshTokens SET RevokedAtUtc = SYSUTCDATETIME(), RevokeReason = 'password_changed' WHERE UserId = @UserId AND RevokedAtUtc IS NULL;
    EXEC dbo.usp_Audit_Write @UserId, 'Auth.PasswordChanged', 'User', @UserId, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
/* Customer self sign-up; the role key comes from AppSettings Auth.DefaultCustomerRole. */
CREATE OR ALTER PROCEDURE dbo.usp_Auth_RegisterCustomer
    @Email nvarchar(256), @NormalizedEmail nvarchar(256), @DisplayName nvarchar(100), @PasswordHash nvarchar(500),
    @PasswordHashAlgorithm varchar(30), @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @RoleKey varchar(50) = (SELECT SettingValue FROM dbo.AppSettings WHERE SettingKey = 'Auth.DefaultCustomerRole' AND IsActive = 1);
    DECLARE @RoleId int = (SELECT RoleId FROM dbo.Roles WHERE RoleKey = @RoleKey AND IsActive = 1);
    IF @RoleId IS NULL THROW 50013, 'invalid_reference', 1;
    IF EXISTS (SELECT 1 FROM dbo.Users WHERE NormalizedEmail = @NormalizedEmail) THROW 50012, 'duplicate_email', 1;
    DECLARE @Id TABLE (UserId uniqueidentifier);
    BEGIN TRAN;
    INSERT dbo.Users(Email, NormalizedEmail, DisplayName, PasswordHash, PasswordHashAlgorithm, UserType)
    OUTPUT inserted.UserId INTO @Id VALUES (@Email, @NormalizedEmail, @DisplayName, @PasswordHash, @PasswordHashAlgorithm, 'Customer');
    DECLARE @UserId uniqueidentifier = (SELECT UserId FROM @Id);
    INSERT dbo.UserRoles(UserId, RoleId) VALUES (@UserId, @RoleId);
    EXEC dbo.usp_Audit_Write @UserId, 'User.Registered', 'User', @UserId, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT @UserId AS UserId;
END;
GO
/* One-time first admin. Refuses once any active system_admin exists. */
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Bootstrap
    @Email nvarchar(256), @NormalizedEmail nvarchar(256), @DisplayName nvarchar(100), @PasswordHash nvarchar(500), @PasswordHashAlgorithm varchar(30)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @RoleId int = (SELECT RoleId FROM dbo.Roles WHERE RoleKey = 'system_admin');
    IF @RoleId IS NULL THROW 50013, 'invalid_reference', 1;
    IF EXISTS (SELECT 1 FROM dbo.UserRoles ur JOIN dbo.Users u ON u.UserId = ur.UserId WHERE ur.RoleId = @RoleId AND u.IsActive = 1 AND u.PasswordHash IS NOT NULL)
        THROW 50021, 'already_bootstrapped', 1;
    DECLARE @Id TABLE (UserId uniqueidentifier);
    BEGIN TRAN;
    IF EXISTS (SELECT 1 FROM dbo.Users WHERE NormalizedEmail = @NormalizedEmail)
        UPDATE dbo.Users SET PasswordHash = @PasswordHash, PasswordHashAlgorithm = @PasswordHashAlgorithm, IsActive = 1, IsLocked = 0,
               EmailVerifiedAtUtc = SYSUTCDATETIME(), SecurityStamp = NEWID() OUTPUT inserted.UserId INTO @Id WHERE NormalizedEmail = @NormalizedEmail;
    ELSE
        INSERT dbo.Users(Email, NormalizedEmail, DisplayName, PasswordHash, PasswordHashAlgorithm, UserType, EmailVerifiedAtUtc)
        OUTPUT inserted.UserId INTO @Id VALUES (@Email, @NormalizedEmail, @DisplayName, @PasswordHash, @PasswordHashAlgorithm, 'Staff', SYSUTCDATETIME());
    DECLARE @UserId uniqueidentifier = (SELECT UserId FROM @Id);
    IF NOT EXISTS (SELECT 1 FROM dbo.UserRoles WHERE UserId = @UserId AND RoleId = @RoleId) INSERT dbo.UserRoles(UserId, RoleId) VALUES (@UserId, @RoleId);
    EXEC dbo.usp_Audit_Write NULL, 'Admin.Bootstrapped', 'User', @UserId, NULL, NULL, NULL;
    COMMIT;
    SELECT @UserId AS UserId;
END;
GO
/* Dev/demo only: set a password for one seeded demo user (used by the CLI provision-demo-users). */
CREATE OR ALTER PROCEDURE dbo.usp_Admin_SetDemoPassword @UserId uniqueidentifier, @PasswordHash nvarchar(500), @PasswordHashAlgorithm varchar(30) AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users SET PasswordHash = @PasswordHash, PasswordHashAlgorithm = @PasswordHashAlgorithm, EmailVerifiedAtUtc = ISNULL(EmailVerifiedAtUtc, SYSUTCDATETIME()),
           IsActive = 1, IsLocked = 0, FailedLoginCount = 0, LockoutEndUtc = NULL, SecurityStamp = NEWID()
    WHERE UserId = @UserId AND IsDemo = 1;
    IF @@ROWCOUNT = 0 THROW 50001, 'not_found', 1;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_ListDemoUsers AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.UserId, u.Email, u.DisplayName, STRING_AGG(r.RoleKey, ',') AS Roles
    FROM dbo.Users u LEFT JOIN dbo.UserRoles ur ON ur.UserId = u.UserId LEFT JOIN dbo.Roles r ON r.RoleId = ur.RoleId
    WHERE u.IsDemo = 1 GROUP BY u.UserId, u.Email, u.DisplayName ORDER BY u.Email;
END;
GO
/* ---------------- ADMIN: dashboard, users ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Dashboard AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        (SELECT COUNT(*) FROM dbo.Users WHERE IsActive = 1 AND PasswordHash IS NOT NULL) AS ActiveUsers,
        (SELECT COUNT(*) FROM dbo.UserInvitations WHERE AcceptedAtUtc IS NULL AND RevokedAtUtc IS NULL AND ExpiresAtUtc > SYSUTCDATETIME()) AS PendingInvites,
        (SELECT COUNT(*) FROM dbo.Users WHERE IsLocked = 1 OR LockoutEndUtc > SYSUTCDATETIME()) AS LockedUsers,
        (SELECT COUNT(*) FROM dbo.AuditLogs WHERE OccurredAtUtc > DATEADD(HOUR, -24, SYSUTCDATETIME())) AS AuditEvents24h,
        (SELECT COUNT(*) FROM dbo.Roles WHERE IsActive = 1) AS ActiveRoles,
        (SELECT COUNT(*) FROM dbo.Menus WHERE IsActive = 1) AS ActiveMenus;
    SELECT TOP (8) AuditId, OccurredAtUtc, ActorEmailMasked, Action, EntityType, EntityId FROM dbo.AuditLogs ORDER BY AuditId DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Users_List
    @Search nvarchar(100) = NULL, @Status varchar(20) = NULL, @UserType varchar(10) = NULL, @Page int = 1, @PageSize int = 25
AS
BEGIN
    SET NOCOUNT ON;
    WITH u AS (
        SELECT x.*, CASE WHEN x.IsActive = 0 THEN 'Inactive'
                         WHEN x.IsLocked = 1 OR x.LockoutEndUtc > SYSUTCDATETIME() THEN 'Locked'
                         WHEN x.PasswordHash IS NULL THEN 'Invited' ELSE 'Active' END AS Status
        FROM dbo.Users x
        WHERE (@Search IS NULL OR x.Email LIKE '%' + @Search + '%' OR x.DisplayName LIKE '%' + @Search + '%')
          AND (@UserType IS NULL OR x.UserType = @UserType))
    SELECT UserId, Email, DisplayName, UserType, Status, IsActive, IsLocked, LastLoginAtUtc, CreatedAtUtc, IsDemo,
           (SELECT STRING_AGG(r.RoleName, ', ') FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId WHERE ur.UserId = u.UserId) AS Roles,
           COUNT(*) OVER () AS Total
    FROM u WHERE (@Status IS NULL OR Status = @Status)
    ORDER BY DisplayName OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Users_Get @UserId uniqueidentifier AS
BEGIN
    SET NOCOUNT ON;
    SELECT UserId, Email, DisplayName, UserType, IsActive, IsLocked, LockoutEndUtc, FailedLoginCount, MustChangePassword, EmailVerifiedAtUtc,
           PhoneMasked, LastLoginAtUtc, CreatedAtUtc, IsDemo, CASE WHEN PasswordHash IS NULL THEN 1 ELSE 0 END AS IsInvited, RowVersion
    FROM dbo.Users WHERE UserId = @UserId;
    SELECT RoleId FROM dbo.UserRoles WHERE UserId = @UserId;
    SELECT COUNT(*) AS ActiveSessions FROM dbo.RefreshTokens WHERE UserId = @UserId AND RevokedAtUtc IS NULL AND ExpiresAtUtc > SYSUTCDATETIME();
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Users_Create
    @Email nvarchar(256), @NormalizedEmail nvarchar(256), @DisplayName nvarchar(100), @UserType varchar(10), @RoleIdsJson nvarchar(max),
    @TokenHash varbinary(32), @ExpiresAtUtc datetime2(3), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF EXISTS (SELECT 1 FROM dbo.Users WHERE NormalizedEmail = @NormalizedEmail) THROW 50012, 'duplicate_email', 1;
    DECLARE @Roles TABLE (RoleId int PRIMARY KEY);
    INSERT @Roles SELECT DISTINCT CAST(value AS int) FROM OPENJSON(@RoleIdsJson);
    IF NOT EXISTS (SELECT 1 FROM @Roles) OR EXISTS (SELECT 1 FROM @Roles x WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles r WHERE r.RoleId = x.RoleId AND r.IsActive = 1))
        THROW 50013, 'invalid_reference', 1;
    DECLARE @Id TABLE (UserId uniqueidentifier);
    BEGIN TRAN;
    INSERT dbo.Users(Email, NormalizedEmail, DisplayName, UserType, CreatedBy, UpdatedBy)
    OUTPUT inserted.UserId INTO @Id VALUES (@Email, @NormalizedEmail, @DisplayName, @UserType, @ActorUserId, @ActorUserId);
    DECLARE @UserId uniqueidentifier = (SELECT UserId FROM @Id);
    INSERT dbo.UserRoles(UserId, RoleId, AssignedBy) SELECT @UserId, RoleId, @ActorUserId FROM @Roles;
    INSERT dbo.UserInvitations(UserId, TokenHash, ExpiresAtUtc, InvitedBy) VALUES (@UserId, @TokenHash, @ExpiresAtUtc, @ActorUserId);
    DECLARE @d nvarchar(max) = (SELECT dbo.fn_MaskEmail(@Email) AS email, JSON_QUERY(@RoleIdsJson) AS roleIds FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'User.Invited', 'User', @UserId, @d, @CorrelationId, NULL;
    COMMIT;
    SELECT @UserId AS UserId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Users_ResendInvite
    @UserId uniqueidentifier, @TokenHash varbinary(32), @ExpiresAtUtc datetime2(3), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId AND PasswordHash IS NULL) THROW 50041, 'already_active', 1;
    BEGIN TRAN;
    UPDATE dbo.UserInvitations SET RevokedAtUtc = SYSUTCDATETIME() WHERE UserId = @UserId AND AcceptedAtUtc IS NULL AND RevokedAtUtc IS NULL;
    INSERT dbo.UserInvitations(UserId, TokenHash, ExpiresAtUtc, InvitedBy) VALUES (@UserId, @TokenHash, @ExpiresAtUtc, @ActorUserId);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'User.InviteResent', 'User', @UserId, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT Email, DisplayName FROM dbo.Users WHERE UserId = @UserId;
END;
GO
/* Shared guard: would the change leave zero active, password-holding system admins? */
CREATE OR ALTER FUNCTION dbo.fn_ActiveSystemAdminCount(@ExcludeUserId uniqueidentifier) RETURNS int AS
BEGIN
    RETURN (SELECT COUNT(DISTINCT u.UserId) FROM dbo.Users u
            JOIN dbo.UserRoles ur ON ur.UserId = u.UserId JOIN dbo.Roles r ON r.RoleId = ur.RoleId AND r.RoleKey = 'system_admin' AND r.IsActive = 1
            WHERE u.IsActive = 1 AND u.IsLocked = 0 AND u.PasswordHash IS NOT NULL AND (@ExcludeUserId IS NULL OR u.UserId <> @ExcludeUserId));
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Users_AssignRoles
    @UserId uniqueidentifier, @RoleIdsJson nvarchar(max), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId) THROW 50001, 'not_found', 1;
    DECLARE @Roles TABLE (RoleId int PRIMARY KEY);
    INSERT @Roles SELECT DISTINCT CAST(value AS int) FROM OPENJSON(@RoleIdsJson);
    IF EXISTS (SELECT 1 FROM @Roles x WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles r WHERE r.RoleId = x.RoleId)) THROW 50013, 'invalid_reference', 1;
    DECLARE @AdminRole int = (SELECT RoleId FROM dbo.Roles WHERE RoleKey = 'system_admin');
    BEGIN TRAN;
    IF EXISTS (SELECT 1 FROM dbo.UserRoles WHERE UserId = @UserId AND RoleId = @AdminRole)
       AND NOT EXISTS (SELECT 1 FROM @Roles WHERE RoleId = @AdminRole)
       AND dbo.fn_ActiveSystemAdminCount(@UserId) = 0
        THROW 50020, 'last_admin', 1;
    DELETE dbo.UserRoles WHERE UserId = @UserId AND RoleId NOT IN (SELECT RoleId FROM @Roles);
    INSERT dbo.UserRoles(UserId, RoleId, AssignedBy) SELECT @UserId, x.RoleId, @ActorUserId FROM @Roles x
    WHERE NOT EXISTS (SELECT 1 FROM dbo.UserRoles ur WHERE ur.UserId = @UserId AND ur.RoleId = x.RoleId);
    UPDATE dbo.Users SET PermissionVersion = PermissionVersion + 1, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId WHERE UserId = @UserId;
    DECLARE @d nvarchar(max) = (SELECT JSON_QUERY(@RoleIdsJson) AS roleIds FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'User.RolesChanged', 'User', @UserId, @d, @CorrelationId, NULL;
    COMMIT;
END;
GO
/* @Action: activate | deactivate | lock | unlock */
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Users_UpdateStatus
    @UserId uniqueidentifier, @Action varchar(20), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId) THROW 50001, 'not_found', 1;
    IF @Action NOT IN ('activate','deactivate','lock','unlock') THROW 50041, 'validation_failed', 1;
    IF @UserId = @ActorUserId AND @Action IN ('deactivate','lock') THROW 50022, 'cannot_modify_self', 1;
    BEGIN TRAN;
    IF @Action IN ('deactivate','lock')
       AND EXISTS (SELECT 1 FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId WHERE ur.UserId = @UserId AND r.RoleKey = 'system_admin')
       AND dbo.fn_ActiveSystemAdminCount(@UserId) = 0
        THROW 50020, 'last_admin', 1;
    UPDATE dbo.Users SET
        IsActive = CASE @Action WHEN 'activate' THEN 1 WHEN 'deactivate' THEN 0 ELSE IsActive END,
        IsLocked = CASE @Action WHEN 'lock' THEN 1 WHEN 'unlock' THEN 0 ELSE IsLocked END,
        FailedLoginCount = CASE WHEN @Action = 'unlock' THEN 0 ELSE FailedLoginCount END,
        LockoutEndUtc = CASE WHEN @Action = 'unlock' THEN NULL ELSE LockoutEndUtc END,
        SecurityStamp = CASE WHEN @Action IN ('deactivate','lock') THEN NEWID() ELSE SecurityStamp END,
        UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE UserId = @UserId;
    IF @Action IN ('deactivate','lock')
        UPDATE dbo.RefreshTokens SET RevokedAtUtc = SYSUTCDATETIME(), RevokeReason = 'user_' + @Action WHERE UserId = @UserId AND RevokedAtUtc IS NULL;
    DECLARE @a varchar(100) = 'User.' + UPPER(LEFT(@Action, 1)) + SUBSTRING(@Action, 2, 20) + 'd';
    IF @Action = 'lock' SET @a = 'User.Locked'; IF @Action = 'unlock' SET @a = 'User.Unlocked';
    EXEC dbo.usp_Audit_Write @ActorUserId, @a, 'User', @UserId, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Users_ForceReset
    @UserId uniqueidentifier, @TokenHash varbinary(32), @ExpiresAtUtc datetime2(3), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId AND PasswordHash IS NOT NULL) THROW 50001, 'not_found', 1;
    BEGIN TRAN;
    UPDATE dbo.Users SET MustChangePassword = 1, SecurityStamp = NEWID(), UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId WHERE UserId = @UserId;
    UPDATE dbo.RefreshTokens SET RevokedAtUtc = SYSUTCDATETIME(), RevokeReason = 'force_reset' WHERE UserId = @UserId AND RevokedAtUtc IS NULL;
    UPDATE dbo.PasswordResetTokens SET UsedAtUtc = SYSUTCDATETIME() WHERE UserId = @UserId AND UsedAtUtc IS NULL;
    INSERT dbo.PasswordResetTokens(UserId, TokenHash, ExpiresAtUtc) VALUES (@UserId, @TokenHash, @ExpiresAtUtc);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'User.PasswordResetForced', 'User', @UserId, NULL, @CorrelationId, NULL;
    COMMIT;
    SELECT Email, DisplayName FROM dbo.Users WHERE UserId = @UserId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Account_UpdateProfile
    @UserId uniqueidentifier, @DisplayName nvarchar(100), @PhoneEnc varbinary(512) = NULL, @PhoneMasked nvarchar(30) = NULL,
    @PreferredLanguage varchar(10), @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users SET DisplayName = @DisplayName, PhoneEnc = @PhoneEnc, PhoneMasked = @PhoneMasked, PreferredLanguage = @PreferredLanguage,
           UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @UserId WHERE UserId = @UserId;
    EXEC dbo.usp_Audit_Write @UserId, 'Account.ProfileUpdated', 'User', @UserId, NULL, @CorrelationId, NULL;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Account_Export @UserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_Audit_Write @UserId, 'Account.DataExported', 'User', @UserId, NULL, @CorrelationId, NULL;
    SELECT Email, DisplayName, UserType, PhoneEnc, PreferredLanguage, CreatedAtUtc, LastLoginAtUtc FROM dbo.Users WHERE UserId = @UserId;
    SELECT r.RoleName FROM dbo.UserRoles ur JOIN dbo.Roles r ON r.RoleId = ur.RoleId WHERE ur.UserId = @UserId;
END;
GO
/* ---------------- ROLES & PERMISSIONS ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Roles_List AS
BEGIN
    SET NOCOUNT ON;
    SELECT r.RoleId, r.RoleKey, r.RoleName, r.Description, r.IsSystem, r.IsActive, r.RowVersion,
           (SELECT COUNT(*) FROM dbo.UserRoles ur WHERE ur.RoleId = r.RoleId) AS MemberCount,
           (SELECT COUNT(*) FROM dbo.RolePermissions rp WHERE rp.RoleId = r.RoleId) AS PermissionCount
    FROM dbo.Roles r ORDER BY r.IsSystem DESC, r.RoleName;
    SELECT RoleId, PermissionId FROM dbo.RolePermissions;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Roles_Upsert
    @RoleId int = NULL, @RoleKey varchar(50), @RoleName nvarchar(100), @Description nvarchar(500) = NULL, @IsActive bit = 1,
    @RowVersion binary(8) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    IF @RoleId IS NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleKey = @RoleKey) THROW 50012, 'duplicate_key', 1;
        INSERT dbo.Roles(RoleKey, RoleName, Description, IsActive) VALUES (@RoleKey, @RoleName, @Description, @IsActive);
        SET @RoleId = SCOPE_IDENTITY();
        EXEC dbo.usp_Audit_Write @ActorUserId, 'Role.Created', 'Role', @RoleId, NULL, @CorrelationId, NULL;
    END
    ELSE
    BEGIN
        DECLARE @IsSystem bit, @OldKey varchar(50), @Rv binary(8);
        SELECT @IsSystem = IsSystem, @OldKey = RoleKey, @Rv = RowVersion FROM dbo.Roles WITH (UPDLOCK) WHERE RoleId = @RoleId;
        IF @OldKey IS NULL THROW 50001, 'not_found', 1;
        IF @RowVersion IS NOT NULL AND @Rv <> @RowVersion THROW 50009, 'concurrency_conflict', 1;
        IF @IsSystem = 1 AND (@RoleKey <> @OldKey OR @IsActive = 0) THROW 50022, 'system_protected', 1;
        IF @RoleKey <> @OldKey AND EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleKey = @RoleKey) THROW 50012, 'duplicate_key', 1;
        UPDATE dbo.Roles SET RoleKey = @RoleKey, RoleName = @RoleName, Description = @Description, IsActive = @IsActive, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE RoleId = @RoleId;
        UPDATE u SET PermissionVersion = PermissionVersion + 1 FROM dbo.Users u JOIN dbo.UserRoles ur ON ur.UserId = u.UserId WHERE ur.RoleId = @RoleId;
        EXEC dbo.usp_Audit_Write @ActorUserId, 'Role.Updated', 'Role', @RoleId, NULL, @CorrelationId, NULL;
    END
    COMMIT;
    SELECT @RoleId AS RoleId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Roles_SetPermissions
    @RoleId int, @PermissionIdsJson nvarchar(max), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @RoleKey varchar(50) = (SELECT RoleKey FROM dbo.Roles WHERE RoleId = @RoleId);
    IF @RoleKey IS NULL THROW 50001, 'not_found', 1;
    DECLARE @P TABLE (PermissionId int PRIMARY KEY);
    INSERT @P SELECT DISTINCT CAST(value AS int) FROM OPENJSON(@PermissionIdsJson);
    IF EXISTS (SELECT 1 FROM @P x WHERE NOT EXISTS (SELECT 1 FROM dbo.Permissions p WHERE p.PermissionId = x.PermissionId)) THROW 50013, 'invalid_reference', 1;
    -- the system admin role must keep every Admin.* permission
    IF @RoleKey = 'system_admin' AND EXISTS (SELECT 1 FROM dbo.Permissions p WHERE p.ModuleKey = 'Admin' AND p.PermissionId NOT IN (SELECT PermissionId FROM @P))
        THROW 50020, 'last_admin', 1;
    DECLARE @Before nvarchar(max) = (SELECT p.PermissionKey AS k FROM dbo.RolePermissions rp JOIN dbo.Permissions p ON p.PermissionId = rp.PermissionId WHERE rp.RoleId = @RoleId FOR JSON PATH);
    BEGIN TRAN;
    DELETE dbo.RolePermissions WHERE RoleId = @RoleId AND PermissionId NOT IN (SELECT PermissionId FROM @P);
    INSERT dbo.RolePermissions(RoleId, PermissionId, GrantedBy) SELECT @RoleId, x.PermissionId, @ActorUserId FROM @P x
    WHERE NOT EXISTS (SELECT 1 FROM dbo.RolePermissions rp WHERE rp.RoleId = @RoleId AND rp.PermissionId = x.PermissionId);
    UPDATE u SET PermissionVersion = PermissionVersion + 1 FROM dbo.Users u JOIN dbo.UserRoles ur ON ur.UserId = u.UserId WHERE ur.RoleId = @RoleId;
    DECLARE @After nvarchar(max) = (SELECT p.PermissionKey AS k FROM dbo.RolePermissions rp JOIN dbo.Permissions p ON p.PermissionId = rp.PermissionId WHERE rp.RoleId = @RoleId FOR JSON PATH);
    DECLARE @d nvarchar(max) = (SELECT JSON_QUERY(ISNULL(@Before, '[]')) AS [before], JSON_QUERY(ISNULL(@After, '[]')) AS [after] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Role.PermissionsChanged', 'Role', @RoleId, @d, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Roles_Delete @RoleId int, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @IsSystem bit = (SELECT IsSystem FROM dbo.Roles WHERE RoleId = @RoleId);
    IF @IsSystem IS NULL THROW 50001, 'not_found', 1;
    IF @IsSystem = 1 THROW 50022, 'system_protected', 1;
    IF EXISTS (SELECT 1 FROM dbo.UserRoles WHERE RoleId = @RoleId) THROW 50011, 'has_members', 1;
    BEGIN TRAN;
    DELETE dbo.Roles WHERE RoleId = @RoleId;
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Role.Deleted', 'Role', @RoleId, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Permissions_List @Search nvarchar(100) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT p.PermissionId, p.PermissionKey, p.ModuleKey, p.ActionKey, p.Description, p.IsActive,
           (SELECT COUNT(*) FROM dbo.RolePermissions rp WHERE rp.PermissionId = p.PermissionId) AS RoleCount
    FROM dbo.Permissions p
    WHERE @Search IS NULL OR p.PermissionKey LIKE '%' + @Search + '%' OR p.ModuleKey LIKE '%' + @Search + '%'
    ORDER BY p.ModuleKey, p.PermissionKey;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Permissions_Update
    @PermissionId int, @Description nvarchar(500), @IsActive bit, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Module varchar(50) = (SELECT ModuleKey FROM dbo.Permissions WHERE PermissionId = @PermissionId);
    IF @Module IS NULL THROW 50001, 'not_found', 1;
    IF @Module = 'Admin' AND @IsActive = 0 THROW 50022, 'system_protected', 1;
    BEGIN TRAN;
    UPDATE dbo.Permissions SET Description = @Description, IsActive = @IsActive WHERE PermissionId = @PermissionId;
    UPDATE u SET PermissionVersion = PermissionVersion + 1 FROM dbo.Users u
    WHERE EXISTS (SELECT 1 FROM dbo.UserRoles ur JOIN dbo.RolePermissions rp ON rp.RoleId = ur.RoleId WHERE ur.UserId = u.UserId AND rp.PermissionId = @PermissionId);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Permission.Updated', 'Permission', @PermissionId, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
/* ---------------- MENUS & NAVIGATION ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Menus_GetTree @Area varchar(10) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT m.MenuId, m.ParentMenuId, m.MenuKey, m.Title, m.RoutePath, m.IconKey, m.SortOrder, m.IsVisible, m.IsActive, m.IsExternal,
           m.ApplicationArea, m.RowVersion,
           (SELECT STRING_AGG(p.PermissionKey, ',') FROM dbo.MenuPermissions mp JOIN dbo.Permissions p ON p.PermissionId = mp.PermissionId WHERE mp.MenuId = m.MenuId) AS PermissionKeys
    FROM dbo.Menus m WHERE @Area IS NULL OR m.ApplicationArea = @Area
    ORDER BY m.ApplicationArea, m.SortOrder, m.MenuId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Menus_Upsert
    @MenuId int = NULL, @ParentMenuId int = NULL, @MenuKey varchar(100), @Title nvarchar(100), @RoutePath nvarchar(200) = NULL,
    @IconKey varchar(50) = NULL, @SortOrder int = 0, @IsVisible bit = 1, @IsActive bit = 1, @IsExternal bit = 0, @ApplicationArea varchar(10),
    @RowVersion binary(8) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @ParentMenuId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Menus WHERE MenuId = @ParentMenuId AND ApplicationArea = @ApplicationArea)
        THROW 50013, 'invalid_parent', 1;
    IF @RoutePath IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Menus WHERE ApplicationArea = @ApplicationArea AND RoutePath = @RoutePath AND MenuId <> ISNULL(@MenuId, -1))
        THROW 50012, 'duplicate_route', 1;
    IF EXISTS (SELECT 1 FROM dbo.Menus WHERE MenuKey = @MenuKey AND MenuId <> ISNULL(@MenuId, -1)) THROW 50012, 'duplicate_key', 1;
    BEGIN TRAN;
    IF @MenuId IS NULL
    BEGIN
        INSERT dbo.Menus(ParentMenuId, MenuKey, Title, RoutePath, IconKey, SortOrder, IsVisible, IsActive, IsExternal, ApplicationArea)
        VALUES (@ParentMenuId, @MenuKey, @Title, @RoutePath, @IconKey, @SortOrder, @IsVisible, @IsActive, @IsExternal, @ApplicationArea);
        SET @MenuId = SCOPE_IDENTITY();
        EXEC dbo.usp_Audit_Write @ActorUserId, 'Menu.Created', 'Menu', @MenuId, NULL, @CorrelationId, NULL;
    END
    ELSE
    BEGIN
        DECLARE @Rv binary(8) = (SELECT RowVersion FROM dbo.Menus WITH (UPDLOCK) WHERE MenuId = @MenuId);
        IF @Rv IS NULL THROW 50001, 'not_found', 1;
        IF @RowVersion IS NOT NULL AND @Rv <> @RowVersion THROW 50009, 'concurrency_conflict', 1;
        -- cycle check: the new parent must not be this menu or any of its descendants
        IF @ParentMenuId IS NOT NULL
        BEGIN
            WITH d AS (SELECT MenuId FROM dbo.Menus WHERE MenuId = @MenuId
                       UNION ALL SELECT m.MenuId FROM dbo.Menus m JOIN d ON m.ParentMenuId = d.MenuId)
            SELECT 1 AS x INTO #hit FROM d WHERE d.MenuId = @ParentMenuId OPTION (MAXRECURSION 100);
            IF EXISTS (SELECT 1 FROM #hit) THROW 50010, 'menu_cycle', 1;
        END
        UPDATE dbo.Menus SET ParentMenuId = @ParentMenuId, MenuKey = @MenuKey, Title = @Title, RoutePath = @RoutePath, IconKey = @IconKey,
               SortOrder = @SortOrder, IsVisible = @IsVisible, IsActive = @IsActive, IsExternal = @IsExternal, ApplicationArea = @ApplicationArea,
               UpdatedAtUtc = SYSUTCDATETIME()
        WHERE MenuId = @MenuId;
        EXEC dbo.usp_Audit_Write @ActorUserId, 'Menu.Updated', 'Menu', @MenuId, NULL, @CorrelationId, NULL;
    END
    COMMIT;
    SELECT @MenuId AS MenuId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Menus_SetPermissions
    @MenuId int, @PermissionIdsJson nvarchar(max), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Menus WHERE MenuId = @MenuId) THROW 50001, 'not_found', 1;
    DECLARE @P TABLE (PermissionId int PRIMARY KEY);
    INSERT @P SELECT DISTINCT CAST(value AS int) FROM OPENJSON(@PermissionIdsJson);
    IF EXISTS (SELECT 1 FROM @P x WHERE NOT EXISTS (SELECT 1 FROM dbo.Permissions p WHERE p.PermissionId = x.PermissionId)) THROW 50013, 'invalid_reference', 1;
    BEGIN TRAN;
    DELETE dbo.MenuPermissions WHERE MenuId = @MenuId;
    INSERT dbo.MenuPermissions(MenuId, PermissionId) SELECT @MenuId, PermissionId FROM @P;
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Menu.PermissionsChanged', 'Menu', @MenuId, @PermissionIdsJson, @CorrelationId, NULL;
    COMMIT;
END;
GO
/* Swap SortOrder with the neighbouring sibling. @Direction: up | down */
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Menus_Move @MenuId int, @Direction varchar(4), @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Parent int, @Sort int, @Area varchar(10), @OtherId int, @OtherSort int;
    BEGIN TRAN;
    SELECT @Parent = ParentMenuId, @Sort = SortOrder, @Area = ApplicationArea FROM dbo.Menus WITH (UPDLOCK) WHERE MenuId = @MenuId;
    IF @Area IS NULL THROW 50001, 'not_found', 1;
    IF @Direction = 'up'
        SELECT TOP (1) @OtherId = MenuId, @OtherSort = SortOrder FROM dbo.Menus WITH (UPDLOCK)
        WHERE ApplicationArea = @Area AND ISNULL(ParentMenuId, -1) = ISNULL(@Parent, -1) AND MenuId <> @MenuId
          AND (SortOrder < @Sort OR (SortOrder = @Sort AND MenuId < @MenuId)) ORDER BY SortOrder DESC, MenuId DESC;
    ELSE
        SELECT TOP (1) @OtherId = MenuId, @OtherSort = SortOrder FROM dbo.Menus WITH (UPDLOCK)
        WHERE ApplicationArea = @Area AND ISNULL(ParentMenuId, -1) = ISNULL(@Parent, -1) AND MenuId <> @MenuId
          AND (SortOrder > @Sort OR (SortOrder = @Sort AND MenuId > @MenuId)) ORDER BY SortOrder, MenuId;
    IF @OtherId IS NOT NULL
    BEGIN
        IF @OtherSort = @Sort SET @OtherSort = @Sort + CASE WHEN @Direction = 'up' THEN -1 ELSE 1 END;
        UPDATE dbo.Menus SET SortOrder = @OtherSort, UpdatedAtUtc = SYSUTCDATETIME() WHERE MenuId = @MenuId;
        UPDATE dbo.Menus SET SortOrder = @Sort, UpdatedAtUtc = SYSUTCDATETIME() WHERE MenuId = @OtherId;
        EXEC dbo.usp_Audit_Write @ActorUserId, 'Menu.Moved', 'Menu', @MenuId, NULL, @CorrelationId, NULL;
    END
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Menus_Delete @MenuId int, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Menus WHERE MenuId = @MenuId) THROW 50001, 'not_found', 1;
    IF EXISTS (SELECT 1 FROM dbo.Menus WHERE ParentMenuId = @MenuId) THROW 50011, 'has_children', 1;
    BEGIN TRAN;
    DELETE dbo.Menus WHERE MenuId = @MenuId;
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Menu.Deleted', 'Menu', @MenuId, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
/* Menus the user may see: active + visible, and either no permission mapping or ANY mapped permission held.
   Group nodes (no route) are returned too; the API prunes groups that end up empty. */
CREATE OR ALTER PROCEDURE dbo.usp_Navigation_ForUser @UserId uniqueidentifier, @Area varchar(10) AS
BEGIN
    SET NOCOUNT ON;
    WITH perms AS (
        SELECT DISTINCT rp.PermissionId FROM dbo.UserRoles ur
        JOIN dbo.Roles r ON r.RoleId = ur.RoleId AND r.IsActive = 1
        JOIN dbo.RolePermissions rp ON rp.RoleId = r.RoleId
        JOIN dbo.Permissions p ON p.PermissionId = rp.PermissionId AND p.IsActive = 1
        WHERE ur.UserId = @UserId)
    SELECT m.MenuId, m.ParentMenuId, m.MenuKey, m.Title, m.RoutePath, m.IconKey, m.SortOrder, m.IsExternal, m.Description
    FROM dbo.Menus m
    WHERE m.ApplicationArea = @Area AND m.IsActive = 1 AND m.IsVisible = 1
      AND (NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions mp WHERE mp.MenuId = m.MenuId)
           OR EXISTS (SELECT 1 FROM dbo.MenuPermissions mp JOIN perms ON perms.PermissionId = mp.PermissionId WHERE mp.MenuId = m.MenuId))
    ORDER BY m.SortOrder, m.MenuId;
END;
GO
/* Public (anonymous) customer menu: only menus that need no permission. */
CREATE OR ALTER PROCEDURE dbo.usp_Navigation_Public @Area varchar(10) AS
BEGIN
    SET NOCOUNT ON;
    SELECT m.MenuId, m.ParentMenuId, m.MenuKey, m.Title, m.RoutePath, m.IconKey, m.SortOrder, m.IsExternal, m.Description
    FROM dbo.Menus m
    WHERE m.ApplicationArea = @Area AND m.IsActive = 1 AND m.IsVisible = 1
      AND NOT EXISTS (SELECT 1 FROM dbo.MenuPermissions mp WHERE mp.MenuId = m.MenuId)
    ORDER BY m.SortOrder, m.MenuId;
END;
GO
/* ---------------- SETTINGS & CONTENT ---------------- */
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Settings_Get @Category varchar(50) = NULL, @PublicOnly bit = 0 AS
BEGIN
    SET NOCOUNT ON;
    SELECT SettingId, SettingKey, SettingValue, ValueType, Category, Description, ValidationJson, IsPublic, IsEditable, IsActive, UpdatedAtUtc,
           (SELECT dbo.fn_MaskEmail(Email) FROM dbo.Users WHERE UserId = s.UpdatedBy) AS UpdatedByMasked, RowVersion
    FROM dbo.AppSettings s
    WHERE (@Category IS NULL OR Category = @Category) AND (@PublicOnly = 0 OR (IsPublic = 1 AND IsActive = 1))
    ORDER BY Category, SettingKey;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Settings_Upsert
    @SettingKey varchar(150), @SettingValue nvarchar(max), @ValueType varchar(20) = NULL, @Category varchar(50) = NULL,
    @Description nvarchar(500) = NULL, @IsPublic bit = NULL, @IsActive bit = NULL, @RowVersion binary(8) = NULL,
    @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Old nvarchar(max), @Type varchar(20), @Editable bit, @Rv binary(8), @Id int;
    BEGIN TRAN;
    SELECT @Id = SettingId, @Old = SettingValue, @Type = ValueType, @Editable = IsEditable, @Rv = RowVersion
    FROM dbo.AppSettings WITH (UPDLOCK) WHERE SettingKey = @SettingKey;
    IF @Id IS NULL
    BEGIN
        IF @ValueType IS NULL OR @Category IS NULL THROW 50041, 'validation_failed', 1;
        SET @Type = @ValueType;
    END
    ELSE
    BEGIN
        IF @Editable = 0 THROW 50022, 'system_protected', 1;
        IF @RowVersion IS NOT NULL AND @Rv <> @RowVersion THROW 50009, 'concurrency_conflict', 1;
    END
    -- final type guard (the API validates first; this protects direct DB callers)
    IF (@Type = 'Int' AND TRY_CAST(@SettingValue AS bigint) IS NULL)
       OR (@Type = 'Decimal' AND TRY_CAST(@SettingValue AS decimal(18,4)) IS NULL)
       OR (@Type = 'Bool' AND @SettingValue NOT IN ('true','false'))
       OR (@Type = 'Json' AND ISJSON(@SettingValue) = 0)
        THROW 50041, 'invalid_setting_value', 1;
    IF @Id IS NULL
        INSERT dbo.AppSettings(SettingKey, SettingValue, ValueType, Category, Description, IsPublic, IsActive, UpdatedBy)
        VALUES (@SettingKey, @SettingValue, @Type, @Category, @Description, ISNULL(@IsPublic, 0), ISNULL(@IsActive, 1), @ActorUserId);
    ELSE
        UPDATE dbo.AppSettings SET SettingValue = @SettingValue, Description = ISNULL(@Description, Description),
               IsPublic = ISNULL(@IsPublic, IsPublic), IsActive = ISNULL(@IsActive, IsActive), UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE SettingId = @Id;
    DECLARE @d nvarchar(max) = (SELECT CASE WHEN @Type = 'SecretRef' THEN '***' ELSE LEFT(@Old, 200) END AS [before],
                                       CASE WHEN @Type = 'SecretRef' THEN '***' ELSE LEFT(@SettingValue, 200) END AS [after] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Setting.Changed', 'Setting', @SettingKey, @d, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Content_List @PublicOnly bit = 0, @Locale varchar(10) = NULL AS
BEGIN
    SET NOCOUNT ON;
    SELECT TemplateId, TemplateKey, Locale, Kind, Subject, Body, IsPublic, UpdatedAtUtc, RowVersion FROM dbo.ContentTemplates
    WHERE (@PublicOnly = 0 OR IsPublic = 1) AND (@Locale IS NULL OR Locale = @Locale) ORDER BY TemplateKey, Locale;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Admin_Content_Upsert
    @TemplateKey varchar(100), @Locale varchar(10), @Kind varchar(20), @Subject nvarchar(200), @Body nvarchar(max), @IsPublic bit,
    @RowVersion binary(8) = NULL, @ActorUserId uniqueidentifier, @CorrelationId varchar(64) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRAN;
    DECLARE @Rv binary(8) = (SELECT RowVersion FROM dbo.ContentTemplates WITH (UPDLOCK) WHERE TemplateKey = @TemplateKey AND Locale = @Locale);
    IF @Rv IS NULL
        INSERT dbo.ContentTemplates(TemplateKey, Locale, Kind, Subject, Body, IsPublic, UpdatedBy) VALUES (@TemplateKey, @Locale, @Kind, @Subject, @Body, @IsPublic, @ActorUserId);
    ELSE
    BEGIN
        IF @RowVersion IS NOT NULL AND @Rv <> @RowVersion THROW 50009, 'concurrency_conflict', 1;
        UPDATE dbo.ContentTemplates SET Kind = @Kind, Subject = @Subject, Body = @Body, IsPublic = @IsPublic, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE TemplateKey = @TemplateKey AND Locale = @Locale;
    END
    DECLARE @k nvarchar(100) = @TemplateKey + N'/' + @Locale;
    EXEC dbo.usp_Audit_Write @ActorUserId, 'Content.Changed', 'Content', @k, NULL, @CorrelationId, NULL;
    COMMIT;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Content_Get @TemplateKey varchar(100), @Locale varchar(10) AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (1) TemplateKey, Locale, Kind, Subject, Body FROM dbo.ContentTemplates
    WHERE TemplateKey = @TemplateKey AND Locale IN (@Locale, 'en') ORDER BY CASE WHEN Locale = @Locale THEN 0 ELSE 1 END;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Dev_Outbox_Add @ToAddress nvarchar(256), @Subject nvarchar(200), @Body nvarchar(max) AS
BEGIN
    SET NOCOUNT ON;
    INSERT dbo.DevOutbox(ToAddress, Subject, Body) VALUES (@ToAddress, @Subject, @Body);
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Dev_Outbox_Latest @ToAddress nvarchar(256) AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (5) MessageId, ToAddress, Subject, Body, CreatedAtUtc FROM dbo.DevOutbox WHERE ToAddress = @ToAddress ORDER BY MessageId DESC;
END;
GO
GO
/* Newsletter sign-up. Same outcome for new and existing addresses (no account enumeration); re-subscribing clears an unsubscribe. */
CREATE OR ALTER PROCEDURE dbo.usp_Newsletter_Subscribe @Email nvarchar(256), @Source varchar(30) = 'footer' AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @n nvarchar(256) = UPPER(LTRIM(RTRIM(@Email)));
    MERGE dbo.NewsletterSubscribers WITH (HOLDLOCK) AS t
    USING (SELECT @n AS NormalizedEmail) s ON t.NormalizedEmail = s.NormalizedEmail
    WHEN MATCHED AND t.UnsubscribedAtUtc IS NOT NULL THEN UPDATE SET UnsubscribedAtUtc = NULL, ConsentAtUtc = SYSUTCDATETIME(), Source = @Source
    WHEN NOT MATCHED THEN INSERT (Email, NormalizedEmail, Source) VALUES (LTRIM(RTRIM(@Email)), @n, @Source);
END;
GO
