using Divakar.Sanpu.Core.Domain;
using FluentValidation;

namespace Divakar.Sanpu.Core.Application;

public sealed record StaffAccessRequest(string Email, string DisplayName, string Password, string RoleKey, string? Note);
public sealed record StaffRoleRow { public string RoleKey { get; init; } = ""; public string RoleName { get; init; } = ""; public string? Description { get; init; } }
public sealed record AccessRequestRow
{
    public Guid UserId { get; init; }
    public string Email { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public string ApprovalStatus { get; init; } = "";
    public string? RequestNote { get; init; }
    public DateTime? RequestedAtUtc { get; init; }
    public string? RequestedRoleKey { get; init; }
    public string? RequestedRoleName { get; init; }
}
public sealed record DecideAccessRequest(bool Approve, string? RoleKey);

public interface IAccessRequestRepository
{
    Task<IReadOnlyList<StaffRoleRow>> StaffRolesAsync(CancellationToken ct);
    Task<Guid> RequestStaffAccessAsync(string email, string normalizedEmail, string displayName, string passwordHash, string algorithm, string roleKey, string? note, string correlationId, CancellationToken ct);
    Task<IReadOnlyList<AccessRequestRow>> ListAsync(CancellationToken ct);
    Task DecideAsync(Guid userId, bool approve, string? roleKey, Guid actorId, string correlationId, CancellationToken ct);
}

public sealed class StaffAccessRequestValidator : AbstractValidator<StaffAccessRequest>
{
    public StaffAccessRequestValidator()
    {
        RuleFor(x => x.Email).ValidEmail();
        RuleFor(x => x.DisplayName).DisplayName();
        RuleFor(x => x.Password).Custom((p, ctx) => { foreach (var m in PasswordPolicy.Check(p, ctx.InstanceToValidate.Email)) ctx.AddFailure(m); });
        RuleFor(x => x.RoleKey).NotEmpty().WithMessage("Choose the role you need.").MaximumLength(50);
        RuleFor(x => x.Note).MaximumLength(300);
    }
}

/// <summary>Staff self sign-up: the person sets their own password, the account waits until an administrator approves it.</summary>
public sealed class AccessRequestService(IAccessRequestRepository repo, IPasswordHasher hasher, ISettings settings, ICurrentUser current, Mailer mail, AppLinks links)
{
    public Task<IReadOnlyList<StaffRoleRow>> StaffRolesAsync(CancellationToken ct) => repo.StaffRolesAsync(ct);

    public async Task RequestAsync(StaffAccessRequest request, CancellationToken ct)
    {
        if (!await settings.GetBoolAsync("Feature.StaffSignup", true, ct)) throw AppException.Forbidden("signup_disabled", "Staff sign-up is turned off. Ask an administrator for an invitation.");
        Validation.Ensure(new StaffAccessRequestValidator(), request);
        var email = request.Email.Trim();
        await repo.RequestStaffAccessAsync(email, EmailAddress.Normalize(email), request.DisplayName.Trim(), hasher.Hash(request.Password), hasher.Algorithm, request.RoleKey, request.Note, current.CorrelationId, ct);
        var role = (await repo.StaffRolesAsync(ct)).FirstOrDefault(r => r.RoleKey == request.RoleKey)?.RoleName ?? request.RoleKey;
        await mail.ToAsync(email, "email.staff_request_received", new() { ["displayName"] = request.DisplayName.Trim(), ["role"] = role }, ct);
    }

    public Task<IReadOnlyList<AccessRequestRow>> ListAsync(CancellationToken ct) => repo.ListAsync(ct);

    public async Task DecideAsync(Guid userId, DecideAccessRequest request, CancellationToken ct)
    {
        var who = (await repo.ListAsync(ct)).FirstOrDefault(r => r.UserId == userId);
        await repo.DecideAsync(userId, request.Approve, request.RoleKey, current.RequireUserId(), current.CorrelationId, ct);
        if (who is null) return;
        var role = request.RoleKey is { Length: > 0 } k ? (await repo.StaffRolesAsync(ct)).FirstOrDefault(r => r.RoleKey == k)?.RoleName ?? k : who.RequestedRoleName ?? "";
        await mail.ToAsync(who.Email, request.Approve ? "email.staff_approved" : "email.staff_rejected",
            new() { ["displayName"] = who.DisplayName, ["role"] = role, ["link"] = links.PublicBaseUrl + "/admin/login" }, ct);
    }
}
