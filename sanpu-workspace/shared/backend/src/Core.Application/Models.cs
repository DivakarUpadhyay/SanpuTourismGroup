namespace Divakar.Sanpu.Core.Application;

// ---------- rows returned by stored procedures (property names = column names) ----------
public sealed record UserAuthRow
{
    public string? ApprovalStatus { get; init; }   // Pending / Rejected for staff sign-up requests
    public Guid UserId { get; init; }
    public string Email { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public string? PasswordHash { get; init; }
    public string UserType { get; init; } = "";
    public bool IsActive { get; init; }
    public bool IsLocked { get; init; }
    public int FailedLoginCount { get; init; }
    public DateTime? LockoutEndUtc { get; init; }
    public DateTime? EmailVerifiedAtUtc { get; init; }
    public bool MustChangePassword { get; init; }
    public Guid SecurityStamp { get; init; }
    public int PermissionVersion { get; init; }
}

public sealed record SecurityStateRow
{
    public Guid UserId { get; init; }
    public string Email { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public string UserType { get; init; } = "";
    public bool IsActive { get; init; }
    public bool IsLocked { get; init; }
    public DateTime? LockoutEndUtc { get; init; }
    public Guid SecurityStamp { get; init; }
    public int PermissionVersion { get; init; }
    public bool MustChangePassword { get; init; }
    public string? PhoneMasked { get; init; }
    public string PreferredLanguage { get; init; } = "en";
    public DateTime? LastLoginAtUtc { get; init; }
}

public sealed record UserIdentityRow { public Guid UserId { get; init; } public string Email { get; init; } = ""; public string DisplayName { get; init; } = ""; }
public sealed record InvitationRow { public string Email { get; init; } = ""; public string DisplayName { get; init; } = ""; public DateTime ExpiresAtUtc { get; init; } }
public sealed record RotateResult { public string Outcome { get; init; } = ""; public Guid? UserId { get; init; } }
public sealed record SessionRow { public Guid TokenId { get; init; } public DateTime CreatedAtUtc { get; init; } public DateTime ExpiresAtUtc { get; init; } public string? UserAgent { get; init; } public string? IpAddress { get; init; } }
public sealed record DemoUserRow { public Guid UserId { get; init; } public string Email { get; init; } = ""; public string DisplayName { get; init; } = ""; public string? Roles { get; init; } }
public sealed record ContentRow
{
    public int TemplateId { get; init; }
    public string TemplateKey { get; init; } = "";
    public string Locale { get; init; } = "";
    public string Kind { get; init; } = "";
    public string Subject { get; init; } = "";
    public string Body { get; init; } = "";
    public bool IsPublic { get; init; }
    public DateTime UpdatedAtUtc { get; init; }
    public byte[]? RowVersion { get; init; }
}
public sealed record OutboxRow { public long MessageId { get; init; } public string ToAddress { get; init; } = ""; public string Subject { get; init; } = ""; public string Body { get; init; } = ""; public DateTime CreatedAtUtc { get; init; } }
public sealed record ExportRow { public string Email { get; init; } = ""; public string DisplayName { get; init; } = ""; public string UserType { get; init; } = ""; public byte[]? PhoneEnc { get; init; } public string PreferredLanguage { get; init; } = ""; public DateTime CreatedAtUtc { get; init; } public DateTime? LastLoginAtUtc { get; init; } }

public sealed record AdminDashboardRow
{
    public int ActiveUsers { get; init; }
    public int PendingInvites { get; init; }
    public int LockedUsers { get; init; }
    public int AuditEvents24h { get; init; }
    public int ActiveRoles { get; init; }
    public int ActiveMenus { get; init; }
}

public sealed record AuditRow
{
    public long AuditId { get; init; }
    public DateTime OccurredAtUtc { get; init; }
    public string? ActorEmailMasked { get; init; }
    public string Action { get; init; } = "";
    public string EntityType { get; init; } = "";
    public string? EntityId { get; init; }
    public string? DetailsJson { get; init; }
    public string? CorrelationId { get; init; }
}

public sealed record UserListRow
{
    public Guid UserId { get; init; }
    public string Email { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public string UserType { get; init; } = "";
    public string Status { get; init; } = "";
    public bool IsActive { get; init; }
    public bool IsLocked { get; init; }
    public DateTime? LastLoginAtUtc { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public bool IsDemo { get; init; }
    public string? Roles { get; init; }
    public int Total { get; init; }
}

public sealed record UserDetailRow
{
    public Guid UserId { get; init; }
    public string Email { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public string UserType { get; init; } = "";
    public bool IsActive { get; init; }
    public bool IsLocked { get; init; }
    public DateTime? LockoutEndUtc { get; init; }
    public int FailedLoginCount { get; init; }
    public bool MustChangePassword { get; init; }
    public DateTime? EmailVerifiedAtUtc { get; init; }
    public string? PhoneMasked { get; init; }
    public DateTime? LastLoginAtUtc { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public bool IsDemo { get; init; }
    public bool IsInvited { get; init; }
    public byte[]? RowVersion { get; init; }
}

public sealed record UserDetail(UserDetailRow User, IReadOnlyList<int> RoleIds, int ActiveSessions);

public sealed record RoleRow
{
    public int RoleId { get; init; }
    public string RoleKey { get; init; } = "";
    public string RoleName { get; init; } = "";
    public string? Description { get; init; }
    public bool IsSystem { get; init; }
    public bool IsActive { get; init; }
    public byte[]? RowVersion { get; init; }
    public int MemberCount { get; init; }
    public int PermissionCount { get; init; }
}
public sealed record RolePermissionRow { public int RoleId { get; init; } public int PermissionId { get; init; } }
public sealed record RolesWithGrants(IReadOnlyList<RoleRow> Roles, IReadOnlyList<RolePermissionRow> Grants);

public sealed record PermissionRow
{
    public int PermissionId { get; init; }
    public string PermissionKey { get; init; } = "";
    public string ModuleKey { get; init; } = "";
    public string ActionKey { get; init; } = "";
    public string? Description { get; init; }
    public bool IsActive { get; init; }
    public int RoleCount { get; init; }
}

public sealed record MenuAdminRow
{
    public int MenuId { get; init; }
    public int? ParentMenuId { get; init; }
    public string MenuKey { get; init; } = "";
    public string Title { get; init; } = "";
    public string? RoutePath { get; init; }
    public string? IconKey { get; init; }
    public int SortOrder { get; init; }
    public bool IsVisible { get; init; }
    public bool IsActive { get; init; }
    public bool IsExternal { get; init; }
    public string ApplicationArea { get; init; } = "";
    public byte[]? RowVersion { get; init; }
    public string? PermissionKeys { get; init; }
}

public sealed record NavRow
{
    public int MenuId { get; init; }
    public int? ParentMenuId { get; init; }
    public string MenuKey { get; init; } = "";
    public string Title { get; init; } = "";
    public string? RoutePath { get; init; }
    public string? IconKey { get; init; }
    public int SortOrder { get; init; }
    public bool IsExternal { get; init; }
    public string? Description { get; init; }
}

public sealed record SettingRow
{
    public int SettingId { get; init; }
    public string SettingKey { get; init; } = "";
    public string SettingValue { get; init; } = "";
    public string ValueType { get; init; } = "";
    public string Category { get; init; } = "";
    public string? Description { get; init; }
    public string? ValidationJson { get; init; }
    public bool IsPublic { get; init; }
    public bool IsEditable { get; init; }
    public bool IsActive { get; init; }
    public DateTime UpdatedAtUtc { get; init; }
    public string? UpdatedByMasked { get; init; }
    public byte[]? RowVersion { get; init; }
}

// ---------- request contracts ----------
public sealed record LoginRequest(string Email, string Password);
public sealed record RegisterRequest(string Email, string DisplayName, string Password);
public sealed record ForgotPasswordRequest(string Email);
public sealed record ResetPasswordRequest(string Token, string Password);
public sealed record AcceptInvitationRequest(string Token, string DisplayName, string Password);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record UpdateProfileRequest(string DisplayName, string? Phone, string PreferredLanguage);
public sealed record InviteUserRequest(string Email, string DisplayName, string UserType, IReadOnlyList<int> RoleIds);
public sealed record AssignRolesRequest(IReadOnlyList<int> RoleIds);
public sealed record UserStatusRequest(string Action);
public sealed record RoleUpsertRequest(string RoleKey, string RoleName, string? Description, bool IsActive, string? RowVersion);
public sealed record IdListRequest(IReadOnlyList<int> Ids);
public sealed record PermissionUpdateRequest(string? Description, bool IsActive);
public sealed record MenuUpsertRequest(int? ParentMenuId, string MenuKey, string Title, string? RoutePath, string? IconKey, int SortOrder,
    bool IsVisible, bool IsActive, bool IsExternal, string ApplicationArea, string? RowVersion);
public sealed record MenuMoveRequest(string Direction);
public sealed record SettingUpsertRequest(string Value, string? ValueType, string? Category, string? Description, bool? IsPublic, bool? IsActive, string? RowVersion);
public sealed record ContentUpsertRequest(string TemplateKey, string Locale, string Kind, string Subject, string Body, bool IsPublic, string? RowVersion);

// ---------- responses ----------
public sealed record AuthUser(Guid Id, string Email, string DisplayName, string UserType, bool MustChangePassword);
public sealed record LoginResult(string AccessToken, DateTime ExpiresAtUtc, AuthUser User, string RefreshToken, DateTime RefreshExpiresAtUtc);
public sealed record MeResponse(AuthUser User, IReadOnlyCollection<string> Permissions, IReadOnlyList<string> Roles, string? PhoneMasked, string PreferredLanguage, DateTime? LastLoginAtUtc);
public sealed record InviteResult(Guid UserId, string? InviteLink, string Delivery);
