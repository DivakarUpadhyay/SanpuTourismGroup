using System.Security.Cryptography;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;

namespace Divakar.Sanpu.Core.Api;

/// <summary>Refresh token lives in an HttpOnly, Secure, SameSite=Strict cookie scoped to /api/v1/auth.
/// Cookie-authenticated calls (refresh, logout) need the double-submit CSRF header X-CSRF-Token.</summary>
public sealed class AuthCookies(SanpuAppOptions options)
{
    private string RefreshName => options.CookiePrefix + "_rt";
    public string CsrfName => options.CookiePrefix + "_csrf";

    public void Set(HttpResponse response, LoginResult result)
    {
        response.Cookies.Append(RefreshName, result.RefreshToken, new CookieOptions
        {
            HttpOnly = true, Secure = options.SecureCookies, SameSite = SameSiteMode.Strict, Path = "/api/v1/auth", Expires = result.RefreshExpiresAtUtc, IsEssential = true
        });
        response.Cookies.Append(CsrfName, Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(18)), new CookieOptions
        {
            HttpOnly = false, Secure = options.SecureCookies, SameSite = SameSiteMode.Strict, Path = "/", Expires = result.RefreshExpiresAtUtc, IsEssential = true
        });
    }

    public void Clear(HttpResponse response)
    {
        response.Cookies.Delete(RefreshName, new CookieOptions { Path = "/api/v1/auth", Secure = options.SecureCookies, SameSite = SameSiteMode.Strict });
        response.Cookies.Delete(CsrfName, new CookieOptions { Path = "/", Secure = options.SecureCookies, SameSite = SameSiteMode.Strict });
    }

    public string? Refresh(HttpRequest request) => request.Cookies[RefreshName];

    public void RequireCsrf(HttpRequest request)
    {
        var cookie = request.Cookies[CsrfName];
        var header = request.Headers["X-CSRF-Token"].ToString();
        if (string.IsNullOrEmpty(cookie) || !CryptographicOperations.FixedTimeEquals(System.Text.Encoding.UTF8.GetBytes(cookie), System.Text.Encoding.UTF8.GetBytes(header)))
            throw new AppException(403, "csrf_failed", "Missing or invalid CSRF token.");
    }
}

public sealed record TokenResponse(string AccessToken, DateTime ExpiresAtUtc, AuthUser User);

[ApiController, Route("api/v1/auth"), Tags("Auth")]
public sealed class AuthController(AuthService auth, SanpuAppOptions options) : ControllerBase
{
    private AuthCookies Cookies => new(options);

    /// <summary>Verify email + password and issue a short-lived JWT; the rotating refresh token is set as an HttpOnly cookie.</summary>
    [HttpPost("login"), AllowAnonymous, EnableRateLimiting("auth")]
    [ProducesResponseType<TokenResponse>(200)]
    public async Task<TokenResponse> Login(LoginRequest request, CancellationToken ct)
    {
        var result = await auth.LoginAsync(request, ct);
        Cookies.Set(Response, result);
        return new TokenResponse(result.AccessToken, result.ExpiresAtUtc, result.User);
    }

    /// <summary>Customer self sign-up (only if Feature.CustomerSignup is true).</summary>
    [HttpPost("register"), AllowAnonymous, EnableRateLimiting("auth")]
    public async Task<TokenResponse> Register(RegisterRequest request, CancellationToken ct)
    {
        var result = await auth.RegisterAsync(request, ct);
        Cookies.Set(Response, result);
        return new TokenResponse(result.AccessToken, result.ExpiresAtUtc, result.User);
    }

    /// <summary>Rotate the refresh cookie and get a new access token. Reusing an old refresh token revokes the whole family.</summary>
    [HttpPost("refresh"), AllowAnonymous]
    public async Task<TokenResponse> Refresh(CancellationToken ct)
    {
        Cookies.RequireCsrf(Request);
        try
        {
            var result = await auth.RefreshAsync(Cookies.Refresh(Request), ct);
            Cookies.Set(Response, result);
            return new TokenResponse(result.AccessToken, result.ExpiresAtUtc, result.User);
        }
        catch (AppException ex) when (ex.Status == 401)
        {
            Cookies.Clear(Response);
            throw;
        }
    }

    [HttpPost("logout"), AllowAnonymous]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        Cookies.RequireCsrf(Request);
        await auth.LogoutAsync(Cookies.Refresh(Request), ct);
        Cookies.Clear(Response);
        return NoContent();
    }

    /// <summary>Sign out of every device: revokes all refresh tokens and rotates the security stamp (open access tokens stop working).</summary>
    [HttpPost("logout-all"), HasPermission("Account.Self")]
    public async Task<IActionResult> LogoutAll(CancellationToken ct)
    {
        await auth.LogoutAllAsync(ct);
        Cookies.Clear(Response);
        return NoContent();
    }

    /// <summary>Always 202, whether or not the email exists (no user enumeration).</summary>
    [HttpPost("forgot-password"), AllowAnonymous, EnableRateLimiting("auth")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request, CancellationToken ct)
    {
        await auth.ForgotPasswordAsync(request, ct);
        return Accepted();
    }

    [HttpPost("reset-password"), AllowAnonymous, EnableRateLimiting("auth")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request, CancellationToken ct)
    {
        await auth.ResetPasswordAsync(request, ct);
        return NoContent();
    }

    [HttpGet("invitation"), AllowAnonymous, EnableRateLimiting("auth")]
    public async Task<object> Invitation([FromQuery] string token, CancellationToken ct)
    {
        var invite = await auth.GetInvitationAsync(token, ct);
        return new { email = Mask.Email(invite.Email), invite.DisplayName, invite.ExpiresAtUtc };
    }

    [HttpPost("accept-invitation"), AllowAnonymous, EnableRateLimiting("auth")]
    public async Task<IActionResult> AcceptInvitation(AcceptInvitationRequest request, CancellationToken ct)
    {
        await auth.AcceptInvitationAsync(request, ct);
        return NoContent();
    }

    /// <summary>The signed-in user with effective permissions (resolved from SQL on this request).</summary>
    [HttpGet("me")]
    public Task<MeResponse> Me(CancellationToken ct) => auth.MeAsync(ct);
}

[ApiController, Route("api/v1/navigation"), Tags("Navigation")]
public sealed class NavigationController(NavigationService navigation) : ControllerBase
{
    /// <summary>Menu tree for the caller: active menus where ANY mapped permission is held. UX only; APIs enforce access themselves.</summary>
    [HttpGet("me")]
    public Task<IReadOnlyList<MenuNode>> Me([FromQuery] string area = "Admin", CancellationToken ct = default) =>
        area is "Admin" or "Customer" ? navigation.ForCurrentUserAsync(area, ct) : throw AppException.Validation("area", "Use Admin or Customer.");

    /// <summary>Menus that need no permission (anonymous visitors of the customer site).</summary>
    [HttpGet("public"), AllowAnonymous]
    public Task<IReadOnlyList<MenuNode>> Public(CancellationToken ct) => navigation.ForCurrentUserAsync("Customer", ct);
}

[ApiController, Route("api/v1/account"), Tags("Account"), HasPermission("Account.Self")]
public sealed class AccountController(AccountService account) : ControllerBase
{
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile(UpdateProfileRequest request, CancellationToken ct) { await account.UpdateProfileAsync(request, ct); return NoContent(); }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, [FromServices] AuthService auth, CancellationToken ct)
    {
        await auth.ChangePasswordAsync(request, ct);
        return NoContent();
    }

    /// <summary>Download my personal data (JSON). Audited.</summary>
    [HttpGet("export")]
    public Task<object> Export(CancellationToken ct) => account.ExportAsync(ct);

    [HttpGet("sessions")]
    public Task<IReadOnlyList<SessionRow>> Sessions(CancellationToken ct) => account.SessionsAsync(ct);
}

/// <summary>Public, non-secret configuration and content (IsPublic only). Changes appear without rebuilding the frontend.</summary>
[ApiController, Route("api/v1/public"), Tags("Public"), AllowAnonymous]
public sealed class PublicController(IAdminRepository repo) : ControllerBase
{
    [HttpGet("settings")]
    public async Task<Dictionary<string, string>> Settings(CancellationToken ct) =>
        (await repo.GetSettingsAsync(null, true, ct)).ToDictionary(s => s.SettingKey, s => s.SettingValue);

    [HttpGet("content")]
    public async Task<IEnumerable<object>> Content([FromQuery] string? locale, CancellationToken ct) =>
        (await repo.ListContentAsync(true, locale, ct)).Select(c => new { c.TemplateKey, c.Locale, c.Subject, c.Body });

    /// <summary>Newsletter sign-up with recorded consent. The reply is identical for new and existing addresses.</summary>
    [HttpPost("newsletter"), EnableRateLimiting("auth")]
    public async Task<object> Newsletter(NewsletterRequest r, CancellationToken ct)
    {
        Validation.Ensure(new NewsletterValidator(), r);
        await repo.SubscribeNewsletterAsync(r.Email, "footer", ct);
        return new { message = "Thanks for subscribing. Watch your inbox for travel ideas and member deals." };
    }
}

/// <summary>Local test inbox for invitation/reset emails. Only mapped in Development with Sanpu:DevOutboxApi=true; never in production.</summary>
[ApiController, Route("api/v1/dev"), Tags("Dev (local only)"), AllowAnonymous, ApiExplorerSettings(IgnoreApi = true)]
public sealed class DevController(IAuthRepository repo, SanpuAppOptions options, IWebHostEnvironment env) : ControllerBase
{
    [HttpGet("outbox")]
    public async Task<IActionResult> Outbox([FromQuery] string to, CancellationToken ct)
    {
        if (!env.IsDevelopment() || !options.DevOutboxApi) return NotFound();
        return Ok(await repo.LatestOutboxAsync(to, ct));
    }
}
