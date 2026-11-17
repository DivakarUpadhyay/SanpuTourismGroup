namespace Divakar.Sanpu.Core.Application;

/// <summary>Auth / account data access. Implemented with Dapper + stored procedures in Infrastructure.</summary>
public interface IAuthRepository
{
    Task<UserAuthRow?> GetUserByEmailAsync(string normalizedEmail, CancellationToken ct);
    Task RecordLoginResultAsync(Guid userId, bool succeeded, int maxFailed, int lockoutMinutes, string? ip, string correlationId, CancellationToken ct);
    Task<SecurityStateRow?> GetSecurityStateAsync(Guid userId, CancellationToken ct);
    Task<(IReadOnlyList<string> Permissions, IReadOnlyList<string> Roles)> GetPermissionsAsync(Guid userId, CancellationToken ct);
    Task CreateRefreshTokenAsync(Guid tokenId, Guid userId, Guid familyId, byte[] hash, DateTime expiresAtUtc, string? userAgent, string? ip, CancellationToken ct);
    Task<RotateResult> RotateRefreshTokenAsync(byte[] oldHash, Guid newTokenId, byte[] newHash, DateTime newExpiresAtUtc, string? userAgent, string? ip, string correlationId, CancellationToken ct);
    Task RevokeRefreshTokenAsync(byte[] hash, string correlationId, CancellationToken ct);
    Task RevokeSessionsAsync(Guid userId, Guid? actorUserId, string reason, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<SessionRow>> ListSessionsAsync(Guid userId, CancellationToken ct);
    Task<UserIdentityRow?> CreatePasswordResetAsync(string normalizedEmail, byte[] hash, DateTime expiresAtUtc, string correlationId, CancellationToken ct);
    Task ConsumePasswordResetAsync(byte[] hash, string passwordHash, string algorithm, string correlationId, CancellationToken ct);
    Task<InvitationRow?> GetInvitationAsync(byte[] hash, CancellationToken ct);
    Task AcceptInvitationAsync(byte[] hash, string displayName, string passwordHash, string algorithm, string correlationId, CancellationToken ct);
    Task<string?> GetPasswordHashAsync(Guid userId, CancellationToken ct);
    Task ChangePasswordAsync(Guid userId, string passwordHash, string algorithm, string correlationId, CancellationToken ct);
    Task<Guid> RegisterCustomerAsync(string email, string normalizedEmail, string displayName, string passwordHash, string algorithm, string correlationId, CancellationToken ct);
    Task<Guid> BootstrapAdminAsync(string email, string normalizedEmail, string displayName, string passwordHash, string algorithm, CancellationToken ct);
    Task<IReadOnlyList<DemoUserRow>> ListDemoUsersAsync(CancellationToken ct);
    Task SetDemoPasswordAsync(Guid userId, string passwordHash, string algorithm, CancellationToken ct);
    Task UpdateProfileAsync(Guid userId, string displayName, byte[]? phoneEnc, string? phoneMasked, string language, string correlationId, CancellationToken ct);
    Task<(ExportRow? Profile, IReadOnlyList<string> Roles)> ExportAsync(Guid userId, string correlationId, CancellationToken ct);
    Task<ContentRow?> GetContentAsync(string key, string locale, CancellationToken ct);
    Task AddOutboxAsync(string to, string subject, string body, CancellationToken ct);
    Task<IReadOnlyList<OutboxRow>> LatestOutboxAsync(string to, CancellationToken ct);
    Task<IReadOnlyList<NavRow>> NavigationForUserAsync(Guid userId, string area, CancellationToken ct);
    Task<IReadOnlyList<NavRow>> NavigationPublicAsync(string area, CancellationToken ct);
}

public interface IAdminRepository
{
    Task SubscribeNewsletterAsync(string email, string source, CancellationToken ct);
    Task<(AdminDashboardRow Kpis, IReadOnlyList<AuditRow> Recent)> DashboardAsync(CancellationToken ct);
    Task<IReadOnlyList<UserListRow>> ListUsersAsync(string? search, string? status, string? userType, int page, int pageSize, CancellationToken ct);
    Task<UserDetail?> GetUserAsync(Guid userId, CancellationToken ct);
    Task<Guid> CreateUserAsync(string email, string normalizedEmail, string displayName, string userType, IReadOnlyList<int> roleIds, byte[] tokenHash, DateTime expiresAtUtc, Guid actor, string correlationId, CancellationToken ct);
    Task<UserIdentityRow?> ResendInviteAsync(Guid userId, byte[] tokenHash, DateTime expiresAtUtc, Guid actor, string correlationId, CancellationToken ct);
    Task AssignRolesAsync(Guid userId, IReadOnlyList<int> roleIds, Guid actor, string correlationId, CancellationToken ct);
    Task UpdateUserStatusAsync(Guid userId, string action, Guid actor, string correlationId, CancellationToken ct);
    Task<UserIdentityRow?> ForceResetAsync(Guid userId, byte[] tokenHash, DateTime expiresAtUtc, Guid actor, string correlationId, CancellationToken ct);
    Task<RolesWithGrants> ListRolesAsync(CancellationToken ct);
    Task<int> UpsertRoleAsync(int? roleId, RoleUpsertRequest request, Guid actor, string correlationId, CancellationToken ct);
    Task SetRolePermissionsAsync(int roleId, IReadOnlyList<int> permissionIds, Guid actor, string correlationId, CancellationToken ct);
    Task DeleteRoleAsync(int roleId, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<PermissionRow>> ListPermissionsAsync(string? search, CancellationToken ct);
    Task UpdatePermissionAsync(int permissionId, string? description, bool isActive, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<MenuAdminRow>> MenuTreeAsync(string? area, CancellationToken ct);
    Task<int> UpsertMenuAsync(int? menuId, MenuUpsertRequest request, Guid actor, string correlationId, CancellationToken ct);
    Task SetMenuPermissionsAsync(int menuId, IReadOnlyList<int> permissionIds, Guid actor, string correlationId, CancellationToken ct);
    Task MoveMenuAsync(int menuId, string direction, Guid actor, string correlationId, CancellationToken ct);
    Task DeleteMenuAsync(int menuId, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<SettingRow>> GetSettingsAsync(string? category, bool publicOnly, CancellationToken ct);
    Task UpsertSettingAsync(string key, SettingUpsertRequest request, Guid actor, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<ContentRow>> ListContentAsync(bool publicOnly, string? locale, CancellationToken ct);
    Task UpsertContentAsync(ContentUpsertRequest request, Guid actor, string correlationId, CancellationToken ct);
    Task<PagedResult<AuditRow>> SearchAuditAsync(string? actor, string? entityType, string? entityId, string? action, DateTime? fromUtc, DateTime? toUtc, int page, int pageSize, CancellationToken ct);
}
