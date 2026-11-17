using Divakar.Sanpu.Core.Domain;

namespace Divakar.Sanpu.Core.Application;

public static class RowVersions
{
    public static byte[]? Parse(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        try { return Convert.FromBase64String(value); }
        catch (FormatException) { throw AppException.Validation("rowVersion", "Row version is not valid."); }
    }
}

/// <summary>Admin use cases shared by both apps. Endpoint permissions are checked by the API policy;
/// this layer adds object-level rules: no self-lockout and no granting what you do not hold.</summary>
public sealed class AdminService(IAdminRepository repo, ITokenService tokens, ISettings settings, IClock clock, ICurrentUser current,
    NotificationService notifications, AppLinks links)
{
    public Task<(AdminDashboardRow Kpis, IReadOnlyList<AuditRow> Recent)> DashboardAsync(CancellationToken ct) => repo.DashboardAsync(ct);

    // ---------------- users ----------------
    public async Task<PagedResult<UserListRow>> ListUsersAsync(string? search, string? status, string? userType, int? page, int? size, CancellationToken ct)
    {
        var (p, s) = Paging.Clamp(page, size);
        var rows = await repo.ListUsersAsync(Trim(search), Trim(status), Trim(userType), p, s, ct);
        return new PagedResult<UserListRow>(rows, rows.FirstOrDefault()?.Total ?? 0, p, s);
    }

    public async Task<UserDetail> GetUserAsync(Guid id, CancellationToken ct) => await repo.GetUserAsync(id, ct) ?? throw AppException.NotFound("User");

    public async Task<InviteResult> InviteAsync(InviteUserRequest request, CancellationToken ct)
    {
        Validation.Ensure(new InviteUserValidator(), request);
        await EnsureCanGrantRolesAsync(request.RoleIds, ct);
        var hours = await settings.GetIntAsync("Auth.InvitationHours", 72, ct);
        var (token, hash) = tokens.CreateOpaqueToken();
        var email = request.Email.Trim();
        var id = await repo.CreateUserAsync(email, EmailAddress.Normalize(email), request.DisplayName.Trim(), request.UserType, request.RoleIds,
            hash, clock.UtcNow.AddHours(hours), current.RequireUserId(), current.CorrelationId, ct);
        return await DeliverInviteAsync(id, email, request.DisplayName, token, hours, ct);
    }

    public async Task<InviteResult> ResendInviteAsync(Guid userId, CancellationToken ct)
    {
        var hours = await settings.GetIntAsync("Auth.InvitationHours", 72, ct);
        var (token, hash) = tokens.CreateOpaqueToken();
        var user = await repo.ResendInviteAsync(userId, hash, clock.UtcNow.AddHours(hours), current.RequireUserId(), current.CorrelationId, ct)
                   ?? throw AppException.NotFound("User");
        return await DeliverInviteAsync(userId, user.Email, user.DisplayName, token, hours, ct);
    }

    private async Task<InviteResult> DeliverInviteAsync(Guid id, string email, string name, string token, int hours, CancellationToken ct)
    {
        var link = $"{links.PublicBaseUrl}/accept-invitation?token={token}";
        await notifications.SendAsync("email.invitation", email, new() { ["displayName"] = name, ["hours"] = hours.ToString(), ["link"] = link }, ct);
        // While no real mail provider is configured the link is shown once to the inviting admin (and kept in the local test inbox).
        var devOutbox = (await settings.GetAsync("Email.Mode", ct)) != "Smtp";
        return new InviteResult(id, devOutbox ? link : null, devOutbox ? "DevOutbox" : "Email");
    }

    public async Task AssignRolesAsync(Guid userId, AssignRolesRequest request, CancellationToken ct)
    {
        await EnsureCanGrantRolesAsync(request.RoleIds ?? [], ct);
        await repo.AssignRolesAsync(userId, request.RoleIds ?? [], current.RequireUserId(), current.CorrelationId, ct);
    }

    public async Task UpdateStatusAsync(Guid userId, UserStatusRequest request, CancellationToken ct)
    {
        if (request.Action is not ("activate" or "deactivate" or "lock" or "unlock")) throw AppException.Validation("action", "Use activate, deactivate, lock or unlock.");
        if (userId == current.RequireUserId() && request.Action is "deactivate" or "lock")
            throw AppException.Conflict("cannot_modify_self", "You cannot lock or deactivate your own account.");
        await repo.UpdateUserStatusAsync(userId, request.Action, current.RequireUserId(), current.CorrelationId, ct);
    }

    public async Task<string?> ForceResetAsync(Guid userId, CancellationToken ct)
    {
        var minutes = await settings.GetIntAsync("Auth.ResetTokenMinutes", 30, ct);
        var (token, hash) = tokens.CreateOpaqueToken();
        var user = await repo.ForceResetAsync(userId, hash, clock.UtcNow.AddMinutes(minutes), current.RequireUserId(), current.CorrelationId, ct)
                   ?? throw AppException.NotFound("User");
        var link = $"{links.PublicBaseUrl}/reset-password?token={token}";
        await notifications.SendAsync("email.password_reset", user.Email, new() { ["displayName"] = user.DisplayName, ["minutes"] = minutes.ToString(), ["link"] = link }, ct);
        return (await settings.GetAsync("Email.Mode", ct)) != "Smtp" ? link : null;
    }

    public Task RevokeSessionsAsync(Guid userId, IAuthRepository auth, CancellationToken ct) =>
        auth.RevokeSessionsAsync(userId, current.RequireUserId(), "admin_revoke", current.CorrelationId, ct);

    // ---------------- roles & permissions ----------------
    public Task<RolesWithGrants> ListRolesAsync(CancellationToken ct) => repo.ListRolesAsync(ct);

    public async Task<int> UpsertRoleAsync(int? roleId, RoleUpsertRequest request, CancellationToken ct)
    {
        Validation.Ensure(new RoleUpsertValidator(), request);
        return await repo.UpsertRoleAsync(roleId, request, current.RequireUserId(), current.CorrelationId, ct);
    }

    public async Task SetRolePermissionsAsync(int roleId, IdListRequest request, CancellationToken ct)
    {
        var all = await repo.ListPermissionsAsync(null, ct);
        var requested = all.Where(p => request.Ids.Contains(p.PermissionId)).Select(p => p.PermissionKey).ToList();
        if (requested.Count != request.Ids.Distinct().Count()) throw AppException.Validation("ids", "Unknown permission id.");
        var notHeld = new EffectivePermissions(current.Permissions).NotHeld(requested);
        if (notHeld.Count > 0) throw AppException.Forbidden("privilege_escalation", $"You cannot grant permissions you do not hold: {string.Join(", ", notHeld)}.");
        await repo.SetRolePermissionsAsync(roleId, request.Ids, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task DeleteRoleAsync(int roleId, CancellationToken ct) => repo.DeleteRoleAsync(roleId, current.RequireUserId(), current.CorrelationId, ct);

    public Task<IReadOnlyList<PermissionRow>> ListPermissionsAsync(string? search, CancellationToken ct) => repo.ListPermissionsAsync(Trim(search), ct);

    public async Task UpdatePermissionAsync(int id, PermissionUpdateRequest request, CancellationToken ct)
    {
        if (request.Description?.Length > 500) throw AppException.Validation("description", "Use at most 500 characters.");
        await repo.UpdatePermissionAsync(id, request.Description, request.IsActive, current.RequireUserId(), current.CorrelationId, ct);
    }

    /// <summary>Roles whose grants are not a subset of the caller's permissions cannot be assigned by the caller.</summary>
    private async Task EnsureCanGrantRolesAsync(IReadOnlyList<int> roleIds, CancellationToken ct)
    {
        var roles = await repo.ListRolesAsync(ct);
        var perms = (await repo.ListPermissionsAsync(null, ct)).ToDictionary(p => p.PermissionId, p => p.PermissionKey);
        var unknown = roleIds.Except(roles.Roles.Select(r => r.RoleId)).ToList();
        if (unknown.Count > 0) throw AppException.Validation("roleIds", "Unknown role.");
        var requested = roles.Grants.Where(g => roleIds.Contains(g.RoleId)).Select(g => perms[g.PermissionId]);
        var notHeld = new EffectivePermissions(current.Permissions).NotHeld(requested);
        if (notHeld.Count > 0) throw AppException.Forbidden("privilege_escalation", "You cannot assign a role that has more access than you.");
    }

    // ---------------- menus ----------------
    public Task<IReadOnlyList<MenuAdminRow>> MenuTreeAsync(string? area, CancellationToken ct) => repo.MenuTreeAsync(Trim(area), ct);

    public async Task<int> UpsertMenuAsync(int? menuId, MenuUpsertRequest request, CancellationToken ct)
    {
        Validation.Ensure(new MenuUpsertValidator(), request);
        if (menuId is int id && request.ParentMenuId is not null)
        {
            var parentOf = (await repo.MenuTreeAsync(null, ct)).ToDictionary(m => m.MenuId, m => m.ParentMenuId);
            if (MenuTreeBuilder.WouldCreateCycle(id, request.ParentMenuId, parentOf))
                throw new AppException(422, "menu_cycle", "A menu cannot be moved under itself or one of its children.",
                    new Dictionary<string, string[]> { ["parentMenuId"] = ["This parent would create a loop."] });
        }
        return await repo.UpsertMenuAsync(menuId, request, current.RequireUserId(), current.CorrelationId, ct);
    }

    public Task SetMenuPermissionsAsync(int menuId, IdListRequest request, CancellationToken ct) =>
        repo.SetMenuPermissionsAsync(menuId, request.Ids, current.RequireUserId(), current.CorrelationId, ct);

    public Task MoveMenuAsync(int menuId, MenuMoveRequest request, CancellationToken ct) =>
        request.Direction is "up" or "down"
            ? repo.MoveMenuAsync(menuId, request.Direction, current.RequireUserId(), current.CorrelationId, ct)
            : throw AppException.Validation("direction", "Use up or down.");

    public Task DeleteMenuAsync(int menuId, CancellationToken ct) => repo.DeleteMenuAsync(menuId, current.RequireUserId(), current.CorrelationId, ct);

    /// <summary>Menu tree as a given role would see it (used by "Preview as role").</summary>
    public async Task<IReadOnlyList<MenuNode>> PreviewMenuAsync(int roleId, string area, CancellationToken ct)
    {
        var roles = await repo.ListRolesAsync(ct);
        var perms = (await repo.ListPermissionsAsync(null, ct)).Where(p => p.IsActive).ToDictionary(p => p.PermissionId, p => p.PermissionKey);
        var held = new EffectivePermissions(roles.Grants.Where(g => g.RoleId == roleId && perms.ContainsKey(g.PermissionId)).Select(g => perms[g.PermissionId]));
        var rows = (await repo.MenuTreeAsync(area, ct))
            .Where(m => m.IsActive && m.IsVisible)
            .Where(m => string.IsNullOrEmpty(m.PermissionKeys) || held.HasAny(m.PermissionKeys.Split(',')))
            .Select(m => new MenuRow(m.MenuId, m.ParentMenuId, m.MenuKey, m.Title, m.RoutePath, m.IconKey, m.SortOrder, m.IsExternal));
        return MenuTreeBuilder.Build(rows);
    }

    // ---------------- settings & content ----------------
    public Task<IReadOnlyList<SettingRow>> GetSettingsAsync(string? category, CancellationToken ct) => repo.GetSettingsAsync(Trim(category), false, ct);

    public async Task UpsertSettingAsync(string key, SettingUpsertRequest request, CancellationToken ct)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(key, @"^[A-Z][A-Za-z0-9]+(\.[A-Z][A-Za-z0-9]+)+$"))
            throw AppException.Validation("key", "Use keys like Category.Name.");
        var existing = (await repo.GetSettingsAsync(null, false, ct)).FirstOrDefault(s => s.SettingKey == key);
        var type = existing?.ValueType ?? request.ValueType ?? throw AppException.Validation("valueType", "Choose a value type for a new setting.");
        if (existing is null && string.IsNullOrWhiteSpace(request.Category)) throw AppException.Validation("category", "Choose a category for a new setting.");
        if (existing is { IsEditable: false }) throw AppException.Conflict("system_protected", "This setting can only be changed by a migration.");
        var problem = SettingValueRules.Validate(type, request.Value, existing?.ValidationJson);
        if (problem is not null) throw AppException.Validation("value", problem);
        await repo.UpsertSettingAsync(key, request with { ValueType = type }, current.RequireUserId(), current.CorrelationId, ct);
        settings.Invalidate();
    }

    public Task<IReadOnlyList<ContentRow>> ListContentAsync(CancellationToken ct) => repo.ListContentAsync(false, null, ct);

    public async Task UpsertContentAsync(ContentUpsertRequest request, CancellationToken ct)
    {
        Validation.Ensure(new ContentUpsertValidator(), request);
        await repo.UpsertContentAsync(request, current.RequireUserId(), current.CorrelationId, ct);
    }

    // ---------------- audit ----------------
    public Task<PagedResult<AuditRow>> SearchAuditAsync(string? actor, string? entityType, string? entityId, string? action, DateTime? fromUtc, DateTime? toUtc, int? page, int? size, CancellationToken ct)
    {
        if (fromUtc is not null && toUtc is not null && fromUtc > toUtc) throw AppException.Validation("from", "From must be before To.");
        var (p, s) = Paging.Clamp(page, size, 200);
        return repo.SearchAuditAsync(Trim(actor), Trim(entityType), Trim(entityId), Trim(action), fromUtc, toUtc, p, s, ct);
    }

    private static string? Trim(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
}

public sealed class NavigationService(IAuthRepository repo, ICurrentUser current)
{
    public async Task<IReadOnlyList<MenuNode>> ForCurrentUserAsync(string area, CancellationToken ct)
    {
        var rows = current.IsAuthenticated ? await repo.NavigationForUserAsync(current.RequireUserId(), area, ct) : await repo.NavigationPublicAsync(area, ct);
        return MenuTreeBuilder.Build(rows.Select(r => new MenuRow(r.MenuId, r.ParentMenuId, r.MenuKey, r.Title, r.RoutePath, r.IconKey, r.SortOrder, r.IsExternal, r.Description)));
    }
}

public sealed class AccountService(IAuthRepository repo, IPiiProtector pii, ICurrentUser current, ISettings settings)
{
    public async Task UpdateProfileAsync(UpdateProfileRequest request, CancellationToken ct)
    {
        Validation.Ensure(new UpdateProfileValidator(), request);
        var languages = await settings.GetListAsync("Ui.Languages", ct);
        if (languages.Count > 0 && !languages.Contains(request.PreferredLanguage)) throw AppException.Validation("preferredLanguage", "Choose a listed language.");
        var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        await repo.UpdateProfileAsync(current.RequireUserId(), request.DisplayName.Trim(), pii.Protect(phone), phone is null ? null : Mask.Phone(phone),
            request.PreferredLanguage, current.CorrelationId, ct);
    }

    /// <summary>Personal-data export for the signed-in user (audited in the proc).</summary>
    public async Task<object> ExportAsync(CancellationToken ct)
    {
        var (profile, roles) = await repo.ExportAsync(current.RequireUserId(), current.CorrelationId, ct);
        if (profile is null) throw AppException.NotFound("User");
        return new
        {
            exportedAtUtc = DateTime.UtcNow, profile.Email, profile.DisplayName, profile.UserType, phone = pii.Unprotect(profile.PhoneEnc),
            profile.PreferredLanguage, profile.CreatedAtUtc, profile.LastLoginAtUtc, roles
        };
    }

    public Task<IReadOnlyList<SessionRow>> SessionsAsync(CancellationToken ct) => repo.ListSessionsAsync(current.RequireUserId(), ct);
}
