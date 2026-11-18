using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Domain;
using Microsoft.AspNetCore.Mvc;

namespace Divakar.Sanpu.Core.Api;

[ApiController, Route("api/v1/admin"), Tags("Admin: dashboard & audit")]
public sealed class AdminDashboardController(AdminService admin) : ControllerBase
{
    /// <summary>Real SQL aggregates: users, invites, lockouts, audit volume.</summary>
    [HttpGet("dashboard"), HasPermission("Admin.Dashboard.View")]
    public async Task<object> Dashboard(CancellationToken ct)
    {
        var (kpis, recent) = await admin.DashboardAsync(ct);
        return new { kpis, recent };
    }

    [HttpGet("audit"), HasPermission("Admin.Audit.View")]
    public Task<PagedResult<AuditRow>> Audit([FromQuery] string? actor, [FromQuery] string? entityType, [FromQuery] string? entityId, [FromQuery] string? action,
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken ct) =>
        admin.SearchAuditAsync(actor, entityType, entityId, action, from, to, page, pageSize, ct);
}

[ApiController, Route("api/v1/admin/users"), Tags("Admin: users & onboarding")]
public sealed class AdminUsersController(AdminService admin) : ControllerBase
{
    [HttpGet, HasPermission("Admin.Users.View")]
    public Task<PagedResult<UserListRow>> List([FromQuery] string? search, [FromQuery] string? status, [FromQuery] string? userType, [FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken ct) =>
        admin.ListUsersAsync(search, status, userType, page, pageSize, ct);

    /// <summary>Staff sign-up requests (pending first).</summary>
    [HttpGet("access-requests"), HasPermission("Admin.Users.View")]
    public Task<IReadOnlyList<AccessRequestRow>> AccessRequests([FromServices] AccessRequestService requests, CancellationToken ct) => requests.ListAsync(ct);

    /// <summary>Approve (activate + grant a role, the requested one by default) or reject a staff sign-up request.</summary>
    [HttpPost("access-requests/{id:guid}"), HasPermission("Admin.Users.Edit")]
    public async Task<IActionResult> DecideAccessRequest(Guid id, DecideAccessRequest request, [FromServices] AccessRequestService requests, CancellationToken ct)
    {
        await requests.DecideAsync(id, request, ct);
        return NoContent();
    }

    [HttpGet("{id:guid}"), HasPermission("Admin.Users.View")]
    public Task<UserDetail> Get(Guid id, CancellationToken ct) => admin.GetUserAsync(id, ct);

    /// <summary>Create the user + roles + one-time invitation in one transaction. The admin never sets or sees the password.</summary>
    [HttpPost("invite"), HasPermission("Admin.Users.Edit")]
    public async Task<IActionResult> Invite(InviteUserRequest request, CancellationToken ct)
    {
        var result = await admin.InviteAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = result.UserId }, result);
    }

    [HttpPost("{id:guid}/resend-invite"), HasPermission("Admin.Users.Edit")]
    public Task<InviteResult> ResendInvite(Guid id, CancellationToken ct) => admin.ResendInviteAsync(id, ct);

    /// <summary>Replace the user's roles. Bumps PermissionVersion so the change applies on the user's next request.</summary>
    [HttpPut("{id:guid}/roles"), HasPermission("Admin.Users.Edit")]
    public async Task<IActionResult> Roles(Guid id, AssignRolesRequest request, CancellationToken ct) { await admin.AssignRolesAsync(id, request, ct); return NoContent(); }

    /// <summary>activate | deactivate | lock | unlock. Deactivate/lock also revoke sessions.</summary>
    [HttpPut("{id:guid}/status"), HasPermission("Admin.Users.Edit")]
    public async Task<IActionResult> Status(Guid id, UserStatusRequest request, CancellationToken ct) { await admin.UpdateStatusAsync(id, request, ct); return NoContent(); }

    [HttpPost("{id:guid}/revoke-sessions"), HasPermission("Admin.Users.Edit")]
    public async Task<IActionResult> RevokeSessions(Guid id, [FromServices] IAuthRepository auth, CancellationToken ct) { await admin.RevokeSessionsAsync(id, auth, ct); return NoContent(); }

    [HttpPost("{id:guid}/force-reset"), HasPermission("Admin.Users.Edit")]
    public async Task<object> ForceReset(Guid id, CancellationToken ct) => new { resetLink = await admin.ForceResetAsync(id, ct) };
}

[ApiController, Route("api/v1/admin"), Tags("Admin: roles & permissions")]
public sealed class AdminRolesController(AdminService admin) : ControllerBase
{
    [HttpGet("roles"), HasPermission("Admin.Roles.View|Admin.Users.View")]
    public Task<RolesWithGrants> Roles(CancellationToken ct) => admin.ListRolesAsync(ct);

    [HttpPost("roles"), HasPermission("Admin.Roles.Edit")]
    public async Task<object> Create(RoleUpsertRequest request, CancellationToken ct) => new { roleId = await admin.UpsertRoleAsync(null, request, ct) };

    [HttpPut("roles/{id:int}"), HasPermission("Admin.Roles.Edit")]
    public async Task<object> Update(int id, RoleUpsertRequest request, CancellationToken ct) => new { roleId = await admin.UpsertRoleAsync(id, request, ct) };

    /// <summary>Replace the role's grants. You can only grant permissions you hold (anti-escalation).</summary>
    [HttpPut("roles/{id:int}/permissions"), HasPermission("Admin.Roles.Edit")]
    public async Task<IActionResult> SetPermissions(int id, IdListRequest request, CancellationToken ct) { await admin.SetRolePermissionsAsync(id, request, ct); return NoContent(); }

    [HttpDelete("roles/{id:int}"), HasPermission("Admin.Roles.Edit")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct) { await admin.DeleteRoleAsync(id, ct); return NoContent(); }

    [HttpGet("permissions"), HasPermission("Admin.Permissions.View|Admin.Roles.View|Admin.Menus.View")]
    public Task<IReadOnlyList<PermissionRow>> Permissions([FromQuery] string? search, CancellationToken ct) => admin.ListPermissionsAsync(search, ct);

    /// <summary>Description and active flag only; keys change only through migrations.</summary>
    [HttpPut("permissions/{id:int}"), HasPermission("Admin.Permissions.Edit")]
    public async Task<IActionResult> UpdatePermission(int id, PermissionUpdateRequest request, CancellationToken ct) { await admin.UpdatePermissionAsync(id, request, ct); return NoContent(); }
}

[ApiController, Route("api/v1/admin/menus"), Tags("Admin: menus")]
public sealed class AdminMenusController(AdminService admin) : ControllerBase
{
    [HttpGet, HasPermission("Admin.Menus.View")]
    public Task<IReadOnlyList<MenuAdminRow>> Tree([FromQuery] string? area, CancellationToken ct) => admin.MenuTreeAsync(area, ct);

    [HttpPost, HasPermission("Admin.Menus.Edit")]
    public async Task<object> Create(MenuUpsertRequest request, CancellationToken ct) => new { menuId = await admin.UpsertMenuAsync(null, request, ct) };

    /// <summary>Update a menu. Parent changes are cycle-checked in the application and again in the stored procedure.</summary>
    [HttpPut("{id:int}"), HasPermission("Admin.Menus.Edit")]
    public async Task<object> Update(int id, MenuUpsertRequest request, CancellationToken ct) => new { menuId = await admin.UpsertMenuAsync(id, request, ct) };

    [HttpPut("{id:int}/permissions"), HasPermission("Admin.Menus.Edit")]
    public async Task<IActionResult> SetPermissions(int id, IdListRequest request, CancellationToken ct) { await admin.SetMenuPermissionsAsync(id, request, ct); return NoContent(); }

    [HttpPost("{id:int}/move"), HasPermission("Admin.Menus.Edit")]
    public async Task<IActionResult> Move(int id, MenuMoveRequest request, CancellationToken ct) { await admin.MoveMenuAsync(id, request, ct); return NoContent(); }

    /// <summary>409 has_children if the menu still has child menus.</summary>
    [HttpDelete("{id:int}"), HasPermission("Admin.Menus.Edit")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct) { await admin.DeleteMenuAsync(id, ct); return NoContent(); }

    [HttpGet("preview"), HasPermission("Admin.Menus.View")]
    public Task<IReadOnlyList<MenuNode>> Preview([FromQuery] int roleId, [FromQuery] string area = "Admin", CancellationToken ct = default) => admin.PreviewMenuAsync(roleId, area, ct);
}

[ApiController, Route("api/v1/admin"), Tags("Admin: settings & content")]
public sealed class AdminSettingsController(AdminService admin) : ControllerBase
{
    [HttpGet("settings"), HasPermission("Admin.Settings.View")]
    public Task<IReadOnlyList<SettingRow>> Settings([FromQuery] string? category, CancellationToken ct) => admin.GetSettingsAsync(category, ct);

    /// <summary>Create or update a setting with typed validation. Secrets are refused: SecretRef stores only an env var name.</summary>
    [HttpPut("settings/{key}"), HasPermission("Admin.Settings.Edit")]
    public async Task<IActionResult> Upsert(string key, SettingUpsertRequest request, CancellationToken ct) { await admin.UpsertSettingAsync(key, request, ct); return NoContent(); }

    [HttpGet("content"), HasPermission("Admin.Content.Edit")]
    public Task<IReadOnlyList<ContentRow>> Content(CancellationToken ct) => admin.ListContentAsync(ct);

    [HttpPut("content"), HasPermission("Admin.Content.Edit")]
    public async Task<IActionResult> UpsertContent(ContentUpsertRequest request, CancellationToken ct) { await admin.UpsertContentAsync(request, ct); return NoContent(); }
}
