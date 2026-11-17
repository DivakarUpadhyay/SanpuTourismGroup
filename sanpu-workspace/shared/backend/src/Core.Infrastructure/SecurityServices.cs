using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Divakar.Sanpu.Core.Application;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Divakar.Sanpu.Core.Infrastructure;

public sealed class SystemClock : IClock { public DateTime UtcNow => DateTime.UtcNow; }

/// <summary>Secrets come from configuration: environment variables, dotnet user-secrets (dev) or a vault provider (prod).</summary>
public sealed class ConfigurationSecretStore(IConfiguration configuration) : ISecretStore
{
    public string? Get(string name) => string.IsNullOrWhiteSpace(name) ? null : configuration[name];
}

/// <summary>ASP.NET Core Identity PasswordHasher (PBKDF2-HMAC-SHA512, 100k iterations, v3 format).</summary>
public sealed class IdentityPasswordHasher : Application.IPasswordHasher
{
    private readonly PasswordHasher<object> _inner = new();
    private static readonly object Subject = new();
    public string Algorithm => "aspnet-identity-v3";
    public string Hash(string password) => _inner.HashPassword(Subject, password);
    public bool Verify(string hash, string password)
    {
        try { return _inner.VerifyHashedPassword(Subject, hash, password) != PasswordVerificationResult.Failed; }
        catch (FormatException) { return false; }
    }
}

public sealed record JwtOptions(string Issuer, string Audience, byte[] SigningKey);

public sealed class TokenService(JwtOptions options, IClock clock) : ITokenService
{
    public const string StampClaim = "ss";
    public const string PermissionVersionClaim = "pv";

    public (string Token, DateTime ExpiresAtUtc) CreateAccessToken(Guid userId, string email, Guid securityStamp, int permissionVersion, int minutes)
    {
        var expires = clock.UtcNow.AddMinutes(minutes);
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = options.Issuer,
            Audience = options.Audience,
            Expires = expires,
            NotBefore = clock.UtcNow.AddSeconds(-5),
            Subject = new ClaimsIdentity([
                new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, email),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
                new Claim(StampClaim, StampFingerprint(securityStamp)),
                new Claim(PermissionVersionClaim, permissionVersion.ToString())
            ]),
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(options.SigningKey), SecurityAlgorithms.HmacSha256)
        };
        return (new JsonWebTokenHandler().CreateToken(descriptor), expires);
    }

    public (string Token, byte[] Hash) CreateOpaqueToken()
    {
        var token = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        return (token, HashOpaqueToken(token));
    }

    public byte[] HashOpaqueToken(string token) => SHA256.HashData(Encoding.UTF8.GetBytes(token));

    public string StampFingerprint(Guid securityStamp) => Convert.ToHexString(SHA256.HashData(securityStamp.ToByteArray()))[..16];
}

/// <summary>AES-256-GCM application-layer encryption for PII. Layout: [1 byte key version][12 nonce][16 tag][ciphertext].
/// The key comes from the secret store (SANPU_PII_KEY, base64 32 bytes). In production this is a KMS/Key Vault-wrapped data key.</summary>
public sealed class AesGcmPiiProtector(byte[] key) : IPiiProtector
{
    private const byte KeyVersion = 1;

    public byte[]? Protect(string? plaintext)
    {
        if (string.IsNullOrEmpty(plaintext)) return null;
        var data = Encoding.UTF8.GetBytes(plaintext);
        var nonce = RandomNumberGenerator.GetBytes(12);
        var tag = new byte[16];
        var cipher = new byte[data.Length];
        using (var aes = new AesGcm(key, 16)) aes.Encrypt(nonce, data, cipher, tag);
        return [KeyVersion, .. nonce, .. tag, .. cipher];
    }

    public string? Unprotect(byte[]? ciphertext)
    {
        if (ciphertext is null || ciphertext.Length < 30) return null;
        if (ciphertext[0] != KeyVersion) throw new CryptographicException("Unknown PII key version.");
        var nonce = ciphertext.AsSpan(1, 12);
        var tag = ciphertext.AsSpan(13, 16);
        var cipher = ciphertext.AsSpan(29);
        var plain = new byte[cipher.Length];
        using var aes = new AesGcm(key, 16);
        aes.Decrypt(nonce, cipher, tag, plain);
        return Encoding.UTF8.GetString(plain);
    }
}

/// <summary>AppSettings cache (60 s) with explicit invalidation on save. Only non-secret values live here.</summary>
public sealed class CachedSettings(IAdminRepository repo, IMemoryCache cache) : ISettings
{
    private const string CacheKey = "sanpu:settings";

    private async Task<Dictionary<string, string>> AllAsync(CancellationToken ct) =>
        (await cache.GetOrCreateAsync(CacheKey, async e =>
        {
            e.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(60);
            var rows = await repo.GetSettingsAsync(null, false, ct);
            return rows.Where(r => r.IsActive).ToDictionary(r => r.SettingKey, r => r.SettingValue);
        }))!;

    public async Task<string?> GetAsync(string key, CancellationToken ct) => (await AllAsync(ct)).GetValueOrDefault(key);
    public async Task<int> GetIntAsync(string key, int fallback, CancellationToken ct) => int.TryParse(await GetAsync(key, ct), out var v) ? v : fallback;
    public async Task<decimal> GetDecimalAsync(string key, decimal fallback, CancellationToken ct) =>
        decimal.TryParse(await GetAsync(key, ct), System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : fallback;
    public async Task<bool> GetBoolAsync(string key, bool fallback, CancellationToken ct) => (await GetAsync(key, ct)) switch { "true" => true, "false" => false, _ => fallback };
    public async Task<IReadOnlyList<string>> GetListAsync(string key, CancellationToken ct)
    {
        var raw = await GetAsync(key, ct);
        if (string.IsNullOrWhiteSpace(raw)) return [];
        try { return JsonSerializer.Deserialize<List<string>>(raw) ?? []; } catch (JsonException) { return []; }
    }
    public void Invalidate() => cache.Remove(CacheKey);
}

/// <summary>Local test inbox: stores messages in dbo.DevOutbox. No email leaves the machine.
/// A real SMTP/transactional provider is PENDING until the user approves one and configures SMTP_* secrets.</summary>
public sealed class DevOutboxEmailSender(IAuthRepository repo) : IEmailSender
{
    public Task SendAsync(string to, string subject, string body, CancellationToken ct) => repo.AddOutboxAsync(to, subject, body, ct);
}
