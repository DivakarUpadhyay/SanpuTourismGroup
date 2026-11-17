namespace Divakar.Sanpu.Core.Application;

/// <summary>Error that maps to an RFC 7807 response. Code is stable and machine readable.</summary>
public sealed class AppException(int status, string code, string message, IReadOnlyDictionary<string, string[]>? errors = null) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public IReadOnlyDictionary<string, string[]>? Errors { get; } = errors;

    public static AppException NotFound(string what = "Resource") => new(404, "not_found", $"{what} was not found.");
    public static AppException Forbidden(string code = "forbidden", string message = "You do not have permission for this action.") => new(403, code, message);
    public static AppException Conflict(string code, string message) => new(409, code, message);
    public static AppException Unauthorized(string code = "unauthorized", string message = "Sign in again.") => new(401, code, message);
    public static AppException Validation(string field, string message) => new(422, "validation_failed", "Some fields are not valid.", new Dictionary<string, string[]> { [field] = [message] });
}

public interface IClock { DateTime UtcNow { get; } }

/// <summary>The authenticated caller, resolved by the API layer from the validated JWT.</summary>
public interface ICurrentUser
{
    Guid? UserId { get; }
    string? Email { get; }
    bool IsAuthenticated { get; }
    IReadOnlySet<string> Permissions { get; }
    IReadOnlyList<string> Roles { get; }
    string CorrelationId { get; }
    string? IpAddress { get; }
    string? UserAgent { get; }
    bool Has(string permission) => Permissions.Contains(permission);
    Guid RequireUserId() => UserId ?? throw AppException.Unauthorized();
}

public interface IPasswordHasher
{
    string Algorithm { get; }
    string Hash(string password);
    bool Verify(string hash, string password);
}

/// <summary>Reversible encryption for classified PII (phone, ID numbers). Not used for passwords.</summary>
public interface IPiiProtector
{
    byte[]? Protect(string? plaintext);
    string? Unprotect(byte[]? ciphertext);
}

public interface ITokenService
{
    (string Token, DateTime ExpiresAtUtc) CreateAccessToken(Guid userId, string email, Guid securityStamp, int permissionVersion, int minutes);
    /// <summary>Opaque random token for refresh/invite/reset links, plus its SHA-256 hash for storage.</summary>
    (string Token, byte[] Hash) CreateOpaqueToken();
    byte[] HashOpaqueToken(string token);
    string StampFingerprint(Guid securityStamp);
}

public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body, CancellationToken ct);
}

/// <summary>Typed, cached read of AppSettings. Cache is cleared whenever a setting is saved.</summary>
public interface ISettings
{
    Task<string?> GetAsync(string key, CancellationToken ct);
    Task<int> GetIntAsync(string key, int fallback, CancellationToken ct);
    Task<decimal> GetDecimalAsync(string key, decimal fallback, CancellationToken ct);
    Task<bool> GetBoolAsync(string key, bool fallback, CancellationToken ct);
    Task<IReadOnlyList<string>> GetListAsync(string key, CancellationToken ct);
    void Invalidate();
}

/// <summary>Server-side secrets come from configuration (env vars / user-secrets / vault), never from the database.</summary>
public interface ISecretStore
{
    string? Get(string name);
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

public static class Paging
{
    public static (int Page, int Size) Clamp(int? page, int? size, int max = 100) => (Math.Max(1, page ?? 1), Math.Clamp(size ?? 25, 1, max));
}
