using Dapper;
using Divakar.Sanpu.Core.Application;

namespace Divakar.Sanpu.Core.Infrastructure;

public sealed class AuthRepository(Db db) : IAuthRepository
{
    public Task<UserAuthRow?> GetUserByEmailAsync(string normalizedEmail, CancellationToken ct) =>
        db.QuerySingleAsync<UserAuthRow>("dbo.usp_Auth_GetUserByEmail", new { NormalizedEmail = normalizedEmail }, ct);

    public Task RecordLoginResultAsync(Guid userId, bool succeeded, int maxFailed, int lockoutMinutes, string? ip, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Auth_RecordLoginResult", new { UserId = userId, Succeeded = succeeded, MaxFailed = maxFailed, LockoutMinutes = lockoutMinutes, IpAddress = ip, CorrelationId = correlationId }, ct);

    public Task<SecurityStateRow?> GetSecurityStateAsync(Guid userId, CancellationToken ct) =>
        db.QuerySingleAsync<SecurityStateRow>("dbo.usp_Auth_GetUserSecurityState", new { UserId = userId }, ct);

    public Task<(IReadOnlyList<string> Permissions, IReadOnlyList<string> Roles)> GetPermissionsAsync(Guid userId, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Auth_GetUserPermissions", new { UserId = userId },
            async g => ((IReadOnlyList<string>)(await g.ReadAsync<string>()).AsList(), (IReadOnlyList<string>)(await g.ReadAsync<string>()).AsList()), ct);

    public Task CreateRefreshTokenAsync(Guid tokenId, Guid userId, Guid familyId, byte[] hash, DateTime expiresAtUtc, string? userAgent, string? ip, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Auth_CreateRefreshToken", new { TokenId = tokenId, UserId = userId, FamilyId = familyId, TokenHash = hash, ExpiresAtUtc = expiresAtUtc, UserAgent = userAgent, IpAddress = ip }, ct);

    public async Task<RotateResult> RotateRefreshTokenAsync(byte[] oldHash, Guid newTokenId, byte[] newHash, DateTime newExpiresAtUtc, string? userAgent, string? ip, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<RotateResult>("dbo.usp_Auth_RotateRefreshToken", new
        {
            OldTokenHash = oldHash, NewTokenId = newTokenId, NewTokenHash = newHash, NewExpiresAtUtc = newExpiresAtUtc, UserAgent = userAgent, IpAddress = ip, CorrelationId = correlationId
        }, ct) ?? new RotateResult { Outcome = "invalid" };

    public Task RevokeRefreshTokenAsync(byte[] hash, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Auth_RevokeRefreshToken", new { TokenHash = hash, CorrelationId = correlationId }, ct);

    public Task RevokeSessionsAsync(Guid userId, Guid? actorUserId, string reason, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Auth_RevokeSessions", new { UserId = userId, ActorUserId = actorUserId, Reason = reason, CorrelationId = correlationId }, ct);

    public Task<IReadOnlyList<SessionRow>> ListSessionsAsync(Guid userId, CancellationToken ct) =>
        db.QueryAsync<SessionRow>("dbo.usp_Auth_ListSessions", new { UserId = userId }, ct);

    public Task<UserIdentityRow?> CreatePasswordResetAsync(string normalizedEmail, byte[] hash, DateTime expiresAtUtc, string correlationId, CancellationToken ct) =>
        db.QuerySingleAsync<UserIdentityRow>("dbo.usp_Auth_CreatePasswordReset", new { NormalizedEmail = normalizedEmail, TokenHash = hash, ExpiresAtUtc = expiresAtUtc, CorrelationId = correlationId }, ct);

    public Task ConsumePasswordResetAsync(byte[] hash, string passwordHash, string algorithm, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Auth_ConsumePasswordReset", new { TokenHash = hash, PasswordHash = passwordHash, PasswordHashAlgorithm = algorithm, CorrelationId = correlationId }, ct);

    public Task<InvitationRow?> GetInvitationAsync(byte[] hash, CancellationToken ct) =>
        db.QuerySingleAsync<InvitationRow>("dbo.usp_Auth_GetInvitation", new { TokenHash = hash }, ct);

    public Task AcceptInvitationAsync(byte[] hash, string displayName, string passwordHash, string algorithm, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Auth_AcceptInvitation", new { TokenHash = hash, DisplayName = displayName, PasswordHash = passwordHash, PasswordHashAlgorithm = algorithm, CorrelationId = correlationId }, ct);

    public Task<string?> GetPasswordHashAsync(Guid userId, CancellationToken ct) =>
        db.QuerySingleAsync<string>("dbo.usp_Auth_GetPasswordHash", new { UserId = userId }, ct);

    public Task ChangePasswordAsync(Guid userId, string passwordHash, string algorithm, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Auth_ChangePassword", new { UserId = userId, PasswordHash = passwordHash, PasswordHashAlgorithm = algorithm, CorrelationId = correlationId }, ct);

    public async Task<Guid> RegisterCustomerAsync(string email, string normalizedEmail, string displayName, string passwordHash, string algorithm, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<Guid>("dbo.usp_Auth_RegisterCustomer", new { Email = email, NormalizedEmail = normalizedEmail, DisplayName = displayName, PasswordHash = passwordHash, PasswordHashAlgorithm = algorithm, CorrelationId = correlationId }, ct);

    public async Task<Guid> BootstrapAdminAsync(string email, string normalizedEmail, string displayName, string passwordHash, string algorithm, CancellationToken ct) =>
        await db.QuerySingleAsync<Guid>("dbo.usp_Admin_Bootstrap", new { Email = email, NormalizedEmail = normalizedEmail, DisplayName = displayName, PasswordHash = passwordHash, PasswordHashAlgorithm = algorithm }, ct);

    public Task<IReadOnlyList<DemoUserRow>> ListDemoUsersAsync(CancellationToken ct) => db.QueryAsync<DemoUserRow>("dbo.usp_Admin_ListDemoUsers", null, ct);

    public Task SetDemoPasswordAsync(Guid userId, string passwordHash, string algorithm, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Admin_SetDemoPassword", new { UserId = userId, PasswordHash = passwordHash, PasswordHashAlgorithm = algorithm }, ct);

    public Task UpdateProfileAsync(Guid userId, string displayName, byte[]? phoneEnc, string? phoneMasked, string language, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Account_UpdateProfile", new { UserId = userId, DisplayName = displayName, PhoneEnc = phoneEnc, PhoneMasked = phoneMasked, PreferredLanguage = language, CorrelationId = correlationId }, ct);

    public Task<(ExportRow? Profile, IReadOnlyList<string> Roles)> ExportAsync(Guid userId, string correlationId, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Account_Export", new { UserId = userId, CorrelationId = correlationId },
            async g => (await g.ReadFirstOrDefaultAsync<ExportRow>(), (IReadOnlyList<string>)(await g.ReadAsync<string>()).AsList()), ct);

    public Task<ContentRow?> GetContentAsync(string key, string locale, CancellationToken ct) =>
        db.QuerySingleAsync<ContentRow>("dbo.usp_Content_Get", new { TemplateKey = key, Locale = locale }, ct);

    public Task AddOutboxAsync(string to, string subject, string body, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Dev_Outbox_Add", new { ToAddress = to, Subject = subject, Body = body }, ct);

    public Task<IReadOnlyList<OutboxRow>> LatestOutboxAsync(string to, CancellationToken ct) =>
        db.QueryAsync<OutboxRow>("dbo.usp_Dev_Outbox_Latest", new { ToAddress = to }, ct);

    public Task<IReadOnlyList<NavRow>> NavigationForUserAsync(Guid userId, string area, CancellationToken ct) =>
        db.QueryAsync<NavRow>("dbo.usp_Navigation_ForUser", new { UserId = userId, Area = area }, ct);

    public Task<IReadOnlyList<NavRow>> NavigationPublicAsync(string area, CancellationToken ct) =>
        db.QueryAsync<NavRow>("dbo.usp_Navigation_Public", new { Area = area }, ct);
}

public sealed class AdminRepository(Db db) : IAdminRepository
{
    public Task SubscribeNewsletterAsync(string email, string source, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Newsletter_Subscribe", new { Email = email, Source = source }, ct);

    public Task<(AdminDashboardRow Kpis, IReadOnlyList<AuditRow> Recent)> DashboardAsync(CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Admin_Dashboard", null, async g => (await g.ReadFirstAsync<AdminDashboardRow>(), (IReadOnlyList<AuditRow>)(await g.ReadAsync<AuditRow>()).AsList()), ct);

    public Task<IReadOnlyList<UserListRow>> ListUsersAsync(string? search, string? status, string? userType, int page, int pageSize, CancellationToken ct) =>
        db.QueryAsync<UserListRow>("dbo.usp_Admin_Users_List", new { Search = search, Status = status, UserType = userType, Page = page, PageSize = pageSize }, ct);

    public Task<UserDetail?> GetUserAsync(Guid userId, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Admin_Users_Get", new { UserId = userId }, async g =>
        {
            var user = await g.ReadFirstOrDefaultAsync<UserDetailRow>();
            var roles = (await g.ReadAsync<int>()).AsList();
            var sessions = await g.ReadFirstAsync<int>();
            return user is null ? null : new UserDetail(user, roles, sessions);
        }, ct);

    public async Task<Guid> CreateUserAsync(string email, string normalizedEmail, string displayName, string userType, IReadOnlyList<int> roleIds, byte[] tokenHash, DateTime expiresAtUtc, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<Guid>("dbo.usp_Admin_Users_Create", new
        {
            Email = email, NormalizedEmail = normalizedEmail, DisplayName = displayName, UserType = userType, RoleIdsJson = Db.Ids(roleIds),
            TokenHash = tokenHash, ExpiresAtUtc = expiresAtUtc, ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<UserIdentityRow?> ResendInviteAsync(Guid userId, byte[] tokenHash, DateTime expiresAtUtc, Guid actor, string correlationId, CancellationToken ct) =>
        db.QuerySingleAsync<UserIdentityRow>("dbo.usp_Admin_Users_ResendInvite", new { UserId = userId, TokenHash = tokenHash, ExpiresAtUtc = expiresAtUtc, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task AssignRolesAsync(Guid userId, IReadOnlyList<int> roleIds, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Admin_Users_AssignRoles", new { UserId = userId, RoleIdsJson = Db.Ids(roleIds), ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task UpdateUserStatusAsync(Guid userId, string action, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Admin_Users_UpdateStatus", new { UserId = userId, Action = action, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<UserIdentityRow?> ForceResetAsync(Guid userId, byte[] tokenHash, DateTime expiresAtUtc, Guid actor, string correlationId, CancellationToken ct) =>
        db.QuerySingleAsync<UserIdentityRow>("dbo.usp_Admin_Users_ForceReset", new { UserId = userId, TokenHash = tokenHash, ExpiresAtUtc = expiresAtUtc, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<RolesWithGrants> ListRolesAsync(CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Admin_Roles_List", null, async g => new RolesWithGrants((await g.ReadAsync<RoleRow>()).AsList(), (await g.ReadAsync<RolePermissionRow>()).AsList()), ct);

    public async Task<int> UpsertRoleAsync(int? roleId, RoleUpsertRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Admin_Roles_Upsert", new
        {
            RoleId = roleId, r.RoleKey, r.RoleName, r.Description, r.IsActive, RowVersion = RowVersions.Parse(r.RowVersion), ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task SetRolePermissionsAsync(int roleId, IReadOnlyList<int> permissionIds, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Admin_Roles_SetPermissions", new { RoleId = roleId, PermissionIdsJson = Db.Ids(permissionIds), ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task DeleteRoleAsync(int roleId, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Admin_Roles_Delete", new { RoleId = roleId, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<IReadOnlyList<PermissionRow>> ListPermissionsAsync(string? search, CancellationToken ct) =>
        db.QueryAsync<PermissionRow>("dbo.usp_Admin_Permissions_List", new { Search = search }, ct);

    public Task UpdatePermissionAsync(int permissionId, string? description, bool isActive, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Admin_Permissions_Update", new { PermissionId = permissionId, Description = description, IsActive = isActive, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<IReadOnlyList<MenuAdminRow>> MenuTreeAsync(string? area, CancellationToken ct) =>
        db.QueryAsync<MenuAdminRow>("dbo.usp_Admin_Menus_GetTree", new { Area = area }, ct);

    public async Task<int> UpsertMenuAsync(int? menuId, MenuUpsertRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        await db.QuerySingleAsync<int>("dbo.usp_Admin_Menus_Upsert", new
        {
            MenuId = menuId, r.ParentMenuId, r.MenuKey, r.Title, RoutePath = string.IsNullOrWhiteSpace(r.RoutePath) ? null : r.RoutePath.Trim(), r.IconKey, r.SortOrder,
            r.IsVisible, r.IsActive, r.IsExternal, r.ApplicationArea, RowVersion = RowVersions.Parse(r.RowVersion), ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task SetMenuPermissionsAsync(int menuId, IReadOnlyList<int> permissionIds, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Admin_Menus_SetPermissions", new { MenuId = menuId, PermissionIdsJson = Db.Ids(permissionIds), ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task MoveMenuAsync(int menuId, string direction, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Admin_Menus_Move", new { MenuId = menuId, Direction = direction, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task DeleteMenuAsync(int menuId, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Admin_Menus_Delete", new { MenuId = menuId, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<IReadOnlyList<SettingRow>> GetSettingsAsync(string? category, bool publicOnly, CancellationToken ct) =>
        db.QueryAsync<SettingRow>("dbo.usp_Admin_Settings_Get", new { Category = category, PublicOnly = publicOnly }, ct);

    public Task UpsertSettingAsync(string key, SettingUpsertRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Admin_Settings_Upsert", new
        {
            SettingKey = key, SettingValue = r.Value, r.ValueType, r.Category, r.Description, r.IsPublic, r.IsActive, RowVersion = RowVersions.Parse(r.RowVersion),
            ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<IReadOnlyList<ContentRow>> ListContentAsync(bool publicOnly, string? locale, CancellationToken ct) =>
        db.QueryAsync<ContentRow>("dbo.usp_Admin_Content_List", new { PublicOnly = publicOnly, Locale = locale }, ct);

    public Task UpsertContentAsync(ContentUpsertRequest r, Guid actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Admin_Content_Upsert", new
        {
            r.TemplateKey, r.Locale, r.Kind, r.Subject, r.Body, r.IsPublic, RowVersion = RowVersions.Parse(r.RowVersion), ActorUserId = actor, CorrelationId = correlationId
        }, ct);

    public Task<PagedResult<AuditRow>> SearchAuditAsync(string? actor, string? entityType, string? entityId, string? action, DateTime? fromUtc, DateTime? toUtc, int page, int pageSize, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Audit_Search", new { Actor = actor, EntityType = entityType, EntityId = entityId, Action = action, FromUtc = fromUtc, ToUtc = toUtc, Page = page, PageSize = pageSize },
            async g =>
            {
                var total = await g.ReadFirstAsync<long>();
                return new PagedResult<AuditRow>((await g.ReadAsync<AuditRow>()).AsList(), (int)total, page, pageSize);
            }, ct);
}
