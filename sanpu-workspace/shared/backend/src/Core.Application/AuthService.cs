using Divakar.Sanpu.Core.Domain;

namespace Divakar.Sanpu.Core.Application;

public sealed record AppLinks(string PublicBaseUrl);

/// <summary>Login, refresh rotation, logout, password reset, invitations, self sign-up and the "me" view.</summary>
public sealed class AuthService(
    IAuthRepository repo, IPasswordHasher hasher, ITokenService tokens, ISettings settings, IClock clock,
    ICurrentUser current, NotificationService notifications, AppLinks links)
{
    private static string? _dummyHash;   // real hash of a random value: unknown-user logins cost the same as real ones

    // Same message for unknown email, wrong password and inactive account: no user enumeration.
    private static AppException InvalidCredentials() => new(401, "invalid_credentials", "Email or password is incorrect.");

    public async Task<LoginResult> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        Validation.Ensure(new LoginValidator(), request);
        var user = await repo.GetUserByEmailAsync(EmailAddress.Normalize(request.Email), ct);
        if (user is null || user.PasswordHash is null)
        {
            hasher.Verify(_dummyHash ??= hasher.Hash(Guid.NewGuid().ToString("N")), request.Password);    // equalise timing for unknown users
            throw InvalidCredentials();
        }
        if (user.LockoutEndUtc > clock.UtcNow || user.IsLocked)
            throw new AppException(423, "account_locked", "This account is locked. Try again later or contact an administrator.");

        var maxFailed = await settings.GetIntAsync("Auth.MaxFailedLogins", 5, ct);
        var lockout = await settings.GetIntAsync("Auth.LockoutMinutes", 15, ct);
        if (!hasher.Verify(user.PasswordHash, request.Password))
        {
            await repo.RecordLoginResultAsync(user.UserId, false, maxFailed, lockout, current.IpAddress, current.CorrelationId, ct);
            throw InvalidCredentials();
        }
        if (!user.IsActive) throw InvalidCredentials();

        await repo.RecordLoginResultAsync(user.UserId, true, maxFailed, lockout, current.IpAddress, current.CorrelationId, ct);
        return await IssueAsync(user.UserId, user.Email, user.DisplayName, user.UserType, user.MustChangePassword, user.SecurityStamp, user.PermissionVersion, Guid.NewGuid(), ct);
    }

    public async Task<LoginResult> RefreshAsync(string? refreshToken, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(refreshToken)) throw AppException.Unauthorized("refresh_missing");
        var days = await settings.GetIntAsync("Auth.RefreshTokenDays", 14, ct);
        var (newToken, newHash) = tokens.CreateOpaqueToken();
        var newExpires = clock.UtcNow.AddDays(days);
        var result = await repo.RotateRefreshTokenAsync(tokens.HashOpaqueToken(refreshToken), Guid.NewGuid(), newHash, newExpires,
            current.UserAgent, current.IpAddress, current.CorrelationId, ct);
        if (result.Outcome != "ok" || result.UserId is null)
            throw AppException.Unauthorized(result.Outcome == "reuse" ? "refresh_reuse_detected" : "refresh_invalid");

        var state = await repo.GetSecurityStateAsync(result.UserId.Value, ct) ?? throw AppException.Unauthorized();
        var minutes = await settings.GetIntAsync("Auth.AccessTokenMinutes", 10, ct);
        var (access, exp) = tokens.CreateAccessToken(state.UserId, state.Email, state.SecurityStamp, state.PermissionVersion, minutes);
        return new LoginResult(access, exp, ToUser(state), newToken, newExpires);
    }

    public Task LogoutAsync(string? refreshToken, CancellationToken ct) =>
        string.IsNullOrWhiteSpace(refreshToken) ? Task.CompletedTask : repo.RevokeRefreshTokenAsync(tokens.HashOpaqueToken(refreshToken), current.CorrelationId, ct);

    public Task LogoutAllAsync(CancellationToken ct) =>
        repo.RevokeSessionsAsync(current.RequireUserId(), current.UserId, "logout_all", current.CorrelationId, ct);

    public async Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken ct)
    {
        // a malformed address is a form error (422); for a well-formed one the reply never reveals whether the account exists
        Validation.Ensure(new ForgotPasswordValidator(), request);
        var minutes = await settings.GetIntAsync("Auth.ResetTokenMinutes", 30, ct);
        var (token, hash) = tokens.CreateOpaqueToken();
        var user = await repo.CreatePasswordResetAsync(EmailAddress.Normalize(request.Email), hash, clock.UtcNow.AddMinutes(minutes), current.CorrelationId, ct);
        if (user is null) return;
        await notifications.SendAsync("email.password_reset", user.Email, new()
        {
            ["displayName"] = user.DisplayName, ["minutes"] = minutes.ToString(), ["link"] = $"{links.PublicBaseUrl}/reset-password?token={token}"
        }, ct);
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct)
    {
        Validation.Ensure(new ResetPasswordValidator(), request);
        await repo.ConsumePasswordResetAsync(tokens.HashOpaqueToken(request.Token), hasher.Hash(request.Password), hasher.Algorithm, current.CorrelationId, ct);
    }

    public async Task<InvitationRow> GetInvitationAsync(string token, CancellationToken ct) =>
        await repo.GetInvitationAsync(tokens.HashOpaqueToken(token), ct) ?? throw new AppException(400, "token_invalid", "This link is invalid or has expired.");

    public async Task AcceptInvitationAsync(AcceptInvitationRequest request, CancellationToken ct)
    {
        Validation.Ensure(new AcceptInvitationValidator(), request);
        var hash = tokens.HashOpaqueToken(request.Token);
        var invite = await repo.GetInvitationAsync(hash, ct) ?? throw new AppException(400, "token_invalid", "This link is invalid or has expired.");
        var policy = PasswordPolicy.Check(request.Password, invite.Email);
        if (policy.Count > 0) throw new AppException(422, "validation_failed", "Some fields are not valid.", new Dictionary<string, string[]> { ["password"] = [.. policy] });
        await repo.AcceptInvitationAsync(hash, request.DisplayName.Trim(), hasher.Hash(request.Password), hasher.Algorithm, current.CorrelationId, ct);
    }

    public async Task<LoginResult> RegisterAsync(RegisterRequest request, CancellationToken ct)
    {
        if (!await settings.GetBoolAsync("Feature.CustomerSignup", false, ct)) throw AppException.Forbidden("signup_disabled", "Sign-up is turned off.");
        Validation.Ensure(new RegisterValidator(), request);
        var email = request.Email.Trim();
        var id = await repo.RegisterCustomerAsync(email, EmailAddress.Normalize(email), request.DisplayName.Trim(), hasher.Hash(request.Password), hasher.Algorithm, current.CorrelationId, ct);
        var state = await repo.GetSecurityStateAsync(id, ct) ?? throw AppException.NotFound("User");
        return await IssueAsync(id, state.Email, state.DisplayName, state.UserType, false, state.SecurityStamp, state.PermissionVersion, Guid.NewGuid(), ct);
    }

    public async Task<MeResponse> MeAsync(CancellationToken ct)
    {
        var state = await repo.GetSecurityStateAsync(current.RequireUserId(), ct) ?? throw AppException.Unauthorized();
        return new MeResponse(ToUser(state), current.Permissions, current.Roles, state.PhoneMasked, state.PreferredLanguage, state.LastLoginAtUtc);
    }

    public async Task ChangePasswordAsync(ChangePasswordRequest request, CancellationToken ct)
    {
        Validation.Ensure(new ChangePasswordValidator(), request);
        var userId = current.RequireUserId();
        var hash = await repo.GetPasswordHashAsync(userId, ct);
        if (hash is null || !hasher.Verify(hash, request.CurrentPassword)) throw AppException.Validation("currentPassword", "Current password is incorrect.");
        var policy = PasswordPolicy.Check(request.NewPassword, current.Email);
        if (policy.Count > 0) throw new AppException(422, "validation_failed", "Some fields are not valid.", new Dictionary<string, string[]> { ["newPassword"] = [.. policy] });
        await repo.ChangePasswordAsync(userId, hasher.Hash(request.NewPassword), hasher.Algorithm, current.CorrelationId, ct);
    }

    private async Task<LoginResult> IssueAsync(Guid userId, string email, string name, string type, bool mustChange, Guid stamp, int pv, Guid familyId, CancellationToken ct)
    {
        var minutes = await settings.GetIntAsync("Auth.AccessTokenMinutes", 10, ct);
        var days = await settings.GetIntAsync("Auth.RefreshTokenDays", 14, ct);
        var (access, exp) = tokens.CreateAccessToken(userId, email, stamp, pv, minutes);
        var (refresh, hash) = tokens.CreateOpaqueToken();
        var refreshExp = clock.UtcNow.AddDays(days);
        await repo.CreateRefreshTokenAsync(Guid.NewGuid(), userId, familyId, hash, refreshExp, current.UserAgent, current.IpAddress, ct);
        return new LoginResult(access, exp, new AuthUser(userId, email, name, type, mustChange), refresh, refreshExp);
    }

    private static AuthUser ToUser(SecurityStateRow s) => new(s.UserId, s.Email, s.DisplayName, s.UserType, s.MustChangePassword);

}

/// <summary>Renders a ContentTemplates notification and hands it to the configured sender.</summary>
public sealed class NotificationService(IAuthRepository repo, IEmailSender sender)
{
    public async Task SendAsync(string templateKey, string to, Dictionary<string, string> values, CancellationToken ct, string locale = "en")
    {
        var template = await repo.GetContentAsync(templateKey, locale, ct) ?? throw new AppException(500, "template_missing", $"Notification template {templateKey} is missing.");
        string Render(string text) => values.Aggregate(text, (acc, kv) => acc.Replace("{{" + kv.Key + "}}", kv.Value));
        await sender.SendAsync(to, Render(template.Subject), Render(template.Body), ct);
    }
}
