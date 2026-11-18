using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Divakar.Sanpu.Core.Api;

/// <summary>Per-app technical configuration (non-secret). Secrets are read separately from the secret store.</summary>
public sealed class SanpuAppOptions
{
    public string AppTitle { get; set; } = "Sanpu";
    public string Issuer { get; set; } = "";
    public string Audience { get; set; } = "";
    public string CookiePrefix { get; set; } = "sanpu";
    public string PublicBaseUrl { get; set; } = "http://localhost:3000";
    public string[] CorsOrigins { get; set; } = [];
    public bool SecureCookies { get; set; } = true;
    public int AuthRequestsPerMinute { get; set; } = 10;
    public int RequestsPerMinute { get; set; } = 600;
    public bool SwaggerEnabled { get; set; }
    /// <summary>True only when the API is reached through known reverse proxies (Vercel rewrite + Cloudflare Tunnel): client IPs then come from X-Forwarded-For, so rate limits apply per visitor.</summary>
    public bool TrustForwardedHeaders { get; set; }
    public bool DevOutboxApi { get; set; }
}

public static class SanpuHosting
{
    public const string PermissionPolicyPrefix = "perm:";

    /// <summary>Registers the shared auth/admin platform: Dapper data access, JWT + refresh, permission policies, rate limits,
    /// ProblemDetails, OpenAPI. Fails fast if a required secret is missing.</summary>
    public static SanpuAppOptions AddSanpuCore(this WebApplicationBuilder builder)
    {
        var options = builder.Configuration.GetSection("Sanpu").Get<SanpuAppOptions>() ?? new SanpuAppOptions();
        var services = builder.Services;
        var secrets = new ConfigurationSecretStore(builder.Configuration);
        string Require(string name) => secrets.Get(name) is { Length: > 0 } v ? v
            : throw new InvalidOperationException($"Missing secret '{name}'. Run scripts/dev-secrets.ps1 (dev) or set the environment variable. See .env.example.");

        var connection = Require("ConnectionStrings:Sanpu");
        var jwtKey = Convert.FromBase64String(Require("SANPU_JWT_SIGNING_KEY"));
        var piiKey = Convert.FromBase64String(Require("SANPU_PII_KEY"));
        if (jwtKey.Length < 32) throw new InvalidOperationException("SANPU_JWT_SIGNING_KEY must be at least 32 bytes (base64).");
        if (piiKey.Length != 32) throw new InvalidOperationException("SANPU_PII_KEY must be exactly 32 bytes (base64).");

        services.AddSingleton(options);
        services.AddSingleton(new DbOptions(connection));
        services.AddSingleton<Db>();
        services.AddSingleton(new JwtOptions(options.Issuer, options.Audience, jwtKey));
        services.AddSingleton<IPiiProtector>(new AesGcmPiiProtector(piiKey));
        services.AddSingleton<ISecretStore>(secrets);
        services.AddSingleton<IClock, SystemClock>();
        services.AddSingleton<Application.IPasswordHasher, IdentityPasswordHasher>();
        services.AddSingleton<ITokenService, TokenService>();
        services.AddSingleton(new AppLinks(options.PublicBaseUrl.TrimEnd('/')));
        services.AddMemoryCache();
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, HttpCurrentUser>();
        services.AddScoped<IAuthRepository, AuthRepository>();
        services.AddScoped<IAdminRepository, AdminRepository>();
        services.AddScoped<ISettings, CachedSettings>();
        services.AddScoped<IEmailSender, SmtpOrOutboxEmailSender>();
        services.AddScoped<NotificationService>();
        services.AddScoped<Mailer>();
        services.AddScoped<AuthService>();
        services.AddScoped<IAccessRequestRepository, AccessRequestRepository>();
        services.AddScoped<AccessRequestService>();
        services.AddScoped<AdminService>();
        services.AddScoped<NavigationService>();
        services.AddScoped<AccountService>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
        {
            o.MapInboundClaims = false;
            o.TokenValidationParameters = new TokenValidationParameters
            {
                ValidIssuer = options.Issuer, ValidAudience = options.Audience, IssuerSigningKey = new SymmetricSecurityKey(jwtKey),
                ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true, ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.FromSeconds(30), NameClaimType = JwtRegisteredClaimNames.Sub, ValidAlgorithms = [SecurityAlgorithms.HmacSha256]
            };
            o.Events = new JwtBearerEvents
            {
                OnTokenValidated = ValidateSessionAsync,
                OnChallenge = async ctx =>
                {
                    ctx.HandleResponse();
                    var code = ctx.AuthenticateFailure?.Message == "session_revoked" ? "session_revoked" : ctx.AuthenticateFailure is SecurityTokenExpiredException ? "token_expired" : "unauthorized";
                    await Problems.WriteAsync(ctx.HttpContext, 401, code, "Sign in again.");
                }
            };
        });
        services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
        services.AddSingleton<IAuthorizationHandler, PermissionHandler>();
        services.AddSingleton<IAuthorizationMiddlewareResultHandler, ProblemAuthorizationResultHandler>();
        services.AddAuthorization(o => o.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());   // deny by default

        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = 429;
            o.OnRejected = async (ctx, _) => await Problems.WriteAsync(ctx.HttpContext, 429, "rate_limited", "Too many requests. Wait a minute and try again.");
            o.AddPolicy("auth", http => RateLimitPartition.GetFixedWindowLimiter(http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = options.AuthRequestsPerMinute, Window = TimeSpan.FromMinutes(1) }));
            // public reads/checks used while browsing (coupon preview, help feedback, banner tracking): generous but bounded
            o.AddPolicy("public", http => RateLimitPartition.GetFixedWindowLimiter(http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = Math.Max(60, options.AuthRequestsPerMinute), Window = TimeSpan.FromMinutes(1) }));
            o.AddPolicy("webhook", http => RateLimitPartition.GetFixedWindowLimiter(http.Request.Path.ToString(),
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1) }));
            o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http => RateLimitPartition.GetFixedWindowLimiter(
                http.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = options.RequestsPerMinute, Window = TimeSpan.FromMinutes(1) }));
        });

        services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(options.CorsOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
        services.AddControllers()
            .AddApplicationPart(typeof(SanpuHosting).Assembly)
            .AddJsonOptions(j =>
            {
                j.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter());
                j.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
            })
            .ConfigureApiBehaviorOptions(o => o.InvalidModelStateResponseFactory = ctx =>
            {
                var errors = ctx.ModelState.Where(kv => kv.Value?.Errors.Count > 0)
                    .ToDictionary(kv => string.IsNullOrEmpty(kv.Key) ? "body" : char.ToLowerInvariant(kv.Key.TrimStart('$', '.')[0]) + kv.Key.TrimStart('$', '.')[1..],
                                  kv => kv.Value!.Errors.Select(e => string.IsNullOrEmpty(e.ErrorMessage) ? "Invalid value." : e.ErrorMessage).ToArray());
                return Problems.Result(ctx.HttpContext, 400, "invalid_request", "The request body or parameters are malformed.", errors);
            });
        var openApi = new OpenApiSecurity(options.AppTitle);
        services.AddOpenApi("v1", o => { o.AddDocumentTransformer(openApi); o.AddOperationTransformer(openApi); });
        services.AddHealthChecks();
        return options;
    }

    /// <summary>Runs on every authenticated request: the account must still be active/unlocked and the security stamp must match.
    /// Permissions are loaded from SQL by (user, PermissionVersion), so role changes apply on the next request.</summary>
    private static async Task ValidateSessionAsync(TokenValidatedContext ctx)
    {
        var principal = ctx.Principal!;
        if (!Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId)) { ctx.Fail("session_revoked"); return; }
        var sp = ctx.HttpContext.RequestServices;
        var repo = sp.GetRequiredService<IAuthRepository>();
        var tokens = sp.GetRequiredService<ITokenService>();
        var state = await repo.GetSecurityStateAsync(userId, ctx.HttpContext.RequestAborted);
        if (state is null || !state.IsActive || state.IsLocked || state.LockoutEndUtc > DateTime.UtcNow
            || tokens.StampFingerprint(state.SecurityStamp) != principal.FindFirstValue(TokenService.StampClaim))
        {
            ctx.Fail("session_revoked");
            return;
        }
        var cache = sp.GetRequiredService<IMemoryCache>();
        var (perms, roles) = await cache.GetOrCreateAsync($"perm:{userId}:{state.PermissionVersion}", async e =>
        {
            e.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
            return await repo.GetPermissionsAsync(userId, ctx.HttpContext.RequestAborted);
        });
        var identity = (ClaimsIdentity)principal.Identity!;
        identity.AddClaims(perms.Select(p => new Claim("perm", p)));
        identity.AddClaims(roles.Select(r => new Claim("role", r)));
    }

    public static WebApplication UseSanpuCore(this WebApplication app)
    {
        var options = app.Services.GetRequiredService<SanpuAppOptions>();
        if (options.TrustForwardedHeaders)
        {
            var fwd = new Microsoft.AspNetCore.Builder.ForwardedHeadersOptions
            {
                ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto,
                ForwardLimit = 2   // Vercel + Cloudflare Tunnel
            };
            fwd.KnownIPNetworks.Clear(); fwd.KnownProxies.Clear();   // the API listens on localhost only; the tunnel is the sole way in
            app.UseForwardedHeaders(fwd);
        }
        app.UseMiddleware<CorrelationAndErrorMiddleware>();
        app.UseMiddleware<SecurityHeadersMiddleware>();
        if (!app.Environment.IsDevelopment()) app.UseHsts();
        var swagger = app.Environment.IsDevelopment() || options.SwaggerEnabled;
        // Swagger UI is static HTML/JS served before auth; the API calls it makes still need a Bearer token.
        if (swagger) app.UseSwaggerUI(o => { o.SwaggerEndpoint("/openapi/v1.json", options.AppTitle); o.RoutePrefix = "swagger"; o.DocumentTitle = options.AppTitle + " API"; });
        app.UseCors();
        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();
        if (swagger) app.MapOpenApi("/openapi/{documentName}.json").AllowAnonymous();
        app.MapHealthChecks("/health").AllowAnonymous();
        app.MapControllers();
        return app;
    }
}

/// <summary>[HasPermission("Booking.Approve")] → policy "perm:Booking.Approve" → claim check. Server is the authority.</summary>
public sealed class HasPermissionAttribute(string permission) : AuthorizeAttribute(SanpuHosting.PermissionPolicyPrefix + permission);

public sealed record PermissionRequirement(string Permission) : IAuthorizationRequirement;

public sealed class PermissionPolicyProvider(IOptions<AuthorizationOptions> options) : DefaultAuthorizationPolicyProvider(options)
{
    public override async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        if (!policyName.StartsWith(SanpuHosting.PermissionPolicyPrefix, StringComparison.Ordinal)) return await base.GetPolicyAsync(policyName);
        var anyOf = policyName[SanpuHosting.PermissionPolicyPrefix.Length..].Split('|');
        return new AuthorizationPolicyBuilder().RequireAuthenticatedUser().AddRequirements(anyOf.Select(p => new PermissionRequirement(p)).ToArray<IAuthorizationRequirement>()).Build();
    }
}

/// <summary>Multiple requirements from "A|B" are OR-ed: holding any one of them is enough.</summary>
public sealed class PermissionHandler : IAuthorizationHandler
{
    public Task HandleAsync(AuthorizationHandlerContext context)
    {
        var reqs = context.PendingRequirements.OfType<PermissionRequirement>().ToList();
        if (reqs.Count == 0) return Task.CompletedTask;
        if (reqs.Any(r => context.User.HasClaim("perm", r.Permission)))
            foreach (var r in reqs) context.Succeed(r);
        return Task.CompletedTask;
    }
}

public sealed class ProblemAuthorizationResultHandler : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler _default = new();
    public async Task HandleAsync(RequestDelegate next, HttpContext context, AuthorizationPolicy policy, PolicyAuthorizationResult result)
    {
        if (result.Forbidden)
        {
            await Problems.WriteAsync(context, 403, "forbidden", "You do not have permission for this action.");
            return;
        }
        await _default.HandleAsync(next, context, policy, result);
    }
}

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private HttpContext? Http => accessor.HttpContext;
    private ClaimsPrincipal? User => Http?.User;
    public Guid? UserId => Guid.TryParse(User?.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;
    public string? Email => User?.FindFirstValue(JwtRegisteredClaimNames.Email);
    public bool IsAuthenticated => User?.Identity?.IsAuthenticated == true;
    public IReadOnlySet<string> Permissions => User?.FindAll("perm").Select(c => c.Value).ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];
    public IReadOnlyList<string> Roles => User?.FindAll("role").Select(c => c.Value).ToList() ?? [];
    public string CorrelationId => Http?.Items[CorrelationAndErrorMiddleware.ItemKey] as string ?? "none";
    public string? IpAddress => Http?.Connection.RemoteIpAddress?.ToString();
    public string? UserAgent => Http?.Request.Headers.UserAgent.ToString();
}

public static class Problems
{
    public static ObjectResult Result(HttpContext http, int status, string code, string detail, IReadOnlyDictionary<string, string[]>? errors = null) =>
        new(Build(http, status, code, detail, errors)) { StatusCode = status, ContentTypes = { "application/problem+json" } };

    public static async Task WriteAsync(HttpContext http, int status, string code, string detail, IReadOnlyDictionary<string, string[]>? errors = null)
    {
        if (http.Response.HasStarted) return;
        http.Response.StatusCode = status;
        http.Response.ContentType = "application/problem+json";
        await JsonSerializer.SerializeAsync(http.Response.Body, Build(http, status, code, detail, errors), new JsonSerializerOptions(JsonSerializerDefaults.Web));
    }

    private static ProblemDetails Build(HttpContext http, int status, string code, string detail, IReadOnlyDictionary<string, string[]>? errors)
    {
        var p = new ProblemDetails
        {
            Type = $"https://docs.sanpu.demo/errors/{code}", Title = Titles.GetValueOrDefault(status, "Request failed"), Status = status, Detail = detail, Instance = http.Request.Path
        };
        p.Extensions["code"] = code;
        p.Extensions["correlationId"] = http.Items[CorrelationAndErrorMiddleware.ItemKey] as string;
        if (errors is { Count: > 0 }) p.Extensions["errors"] = errors;
        return p;
    }

    private static readonly Dictionary<int, string> Titles = new()
    {
        [400] = "Bad request", [401] = "Unauthorized", [403] = "Forbidden", [404] = "Not found", [409] = "Conflict", [422] = "Validation failed",
        [423] = "Locked", [429] = "Too many requests", [500] = "Unexpected error", [503] = "Service unavailable"
    };
}

/// <summary>Adds X-Correlation-Id and turns exceptions into RFC 7807 responses without leaking stack traces, SQL or PII.</summary>
public sealed class CorrelationAndErrorMiddleware(RequestDelegate next, ILogger<CorrelationAndErrorMiddleware> logger)
{
    public const string ItemKey = "CorrelationId";

    public async Task InvokeAsync(HttpContext http)
    {
        var incoming = http.Request.Headers["X-Correlation-Id"].ToString();
        var id = System.Text.RegularExpressions.Regex.IsMatch(incoming, "^[A-Za-z0-9\\-]{8,64}$") ? incoming : Guid.NewGuid().ToString("N");
        http.Items[ItemKey] = id;
        http.Response.Headers["X-Correlation-Id"] = id;
        using var scope = logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = id });
        try
        {
            await next(http);
        }
        catch (AppException ex)
        {
            if (ex.Status >= 500) logger.LogError(ex, "Application error {Code}", ex.Code);
            await Problems.WriteAsync(http, ex.Status, ex.Code, ex.Message, ex.Errors);
        }
        catch (Exception) when (http.RequestAborted.IsCancellationRequested)
        {
            // the client navigated away: the cancelled SQL command is expected, not a server error
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled error on {Path}", http.Request.Path);
            await Problems.WriteAsync(http, 500, "unexpected_error", "Something went wrong. Quote the correlation ID when reporting this.");
        }
    }
}

public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext http)
    {
        var h = http.Response.Headers;
        h["X-Content-Type-Options"] = "nosniff";
        h["X-Frame-Options"] = "DENY";
        h["Referrer-Policy"] = "no-referrer";
        h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        h["Cross-Origin-Opener-Policy"] = "same-origin";
        h["Content-Security-Policy"] = http.Request.Path.StartsWithSegments("/swagger")
            ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'"
            : "default-src 'none'; frame-ancestors 'none'";
        if (http.Request.Path.StartsWithSegments("/api")) h["Cache-Control"] = "no-store";
        return next(http);
    }
}

/// <summary>Serialises database datetime2 values (Kind=Unspecified, always UTC by convention) with a Z suffix.</summary>
public sealed class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var v = reader.GetDateTime();
        return v.Kind switch { DateTimeKind.Local => v.ToUniversalTime(), DateTimeKind.Unspecified => DateTime.SpecifyKind(v, DateTimeKind.Utc), _ => v };
    }
    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options) =>
        writer.WriteStringValue(DateTime.SpecifyKind(value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : value, DateTimeKind.Utc));
}
