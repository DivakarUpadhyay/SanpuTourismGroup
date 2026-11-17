using System.Text.RegularExpressions;

namespace Divakar.Sanpu.Core.Domain;

/// <summary>Business-rule violation with a stable machine-readable code.</summary>
public sealed class DomainRuleException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

public static class EmailAddress
{
    private static readonly Regex Pattern = new(@"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static string Normalize(string email) => email.Trim().ToLowerInvariant();

    public static bool IsValid(string? email) => !string.IsNullOrWhiteSpace(email) && email.Length <= 256 && Pattern.IsMatch(email.Trim());
}

/// <summary>Password policy: 12–128 chars, upper + lower + digit, must not contain the email's local part.</summary>
public static class PasswordPolicy
{
    public const int MinLength = 12;
    public const int MaxLength = 128;

    public static IReadOnlyList<string> Check(string? password, string? email = null)
    {
        var problems = new List<string>();
        if (string.IsNullOrEmpty(password)) { problems.Add("Password is required."); return problems; }
        if (password.Length < MinLength) problems.Add($"Use at least {MinLength} characters.");
        if (password.Length > MaxLength) problems.Add($"Use at most {MaxLength} characters.");
        if (!password.Any(char.IsUpper)) problems.Add("Add an upper-case letter.");
        if (!password.Any(char.IsLower)) problems.Add("Add a lower-case letter.");
        if (!password.Any(char.IsDigit)) problems.Add("Add a digit.");
        var local = email?.Split('@')[0];
        if (!string.IsNullOrEmpty(local) && local.Length >= 3 && password.Contains(local, StringComparison.OrdinalIgnoreCase))
            problems.Add("Do not use your email name in the password.");
        return problems;
    }
}

/// <summary>Masking for display. PII is masked unless the caller holds the reveal permission (and the reveal is audited).</summary>
public static class Mask
{
    public static string Email(string? email)
    {
        if (string.IsNullOrEmpty(email)) return "***";
        var at = email.IndexOf('@');
        return at < 1 ? "***" : email[0] + "***" + email[at..];
    }

    /// <summary>Keeps the country code and the last 3 digits: +886 9•• ••• 321.</summary>
    public static string Phone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return "";
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.Length < 6) return "•••";
        var international = phone.TrimStart().StartsWith('+') && digits.Length >= 10;
        return international ? $"+{digits[..3]} {digits[3]}•• ••• {digits[^3..]}" : $"{digits[0]}•• ••• {digits[^3..]}";
    }

    /// <summary>ID / passport: first 3 + last 2 characters.</summary>
    public static string Document(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var v = value.Trim();
        return v.Length <= 5 ? new string('•', v.Length) : v[..3] + new string('•', v.Length - 5) + v[^2..];
    }
}

/// <summary>E.164-ish phone check used by booking and profile validators.</summary>
public static class Phone
{
    private static readonly Regex Pattern = new(@"^\+?[0-9][0-9 \-]{6,18}$", RegexOptions.Compiled);
    public static bool IsValid(string? value) => !string.IsNullOrWhiteSpace(value) && Pattern.IsMatch(value.Trim());
}

/// <summary>Effective permissions = union of active role grants. Menu visibility uses ANY-of semantics.</summary>
public sealed class EffectivePermissions
{
    private readonly HashSet<string> _keys;

    public EffectivePermissions(IEnumerable<string> keys) => _keys = new HashSet<string>(keys, StringComparer.OrdinalIgnoreCase);

    public IReadOnlyCollection<string> Keys => _keys;
    public bool Has(string key) => _keys.Contains(key);
    public bool HasAny(IEnumerable<string> keys) => keys.Any(_keys.Contains);

    /// <summary>Anti-escalation: a caller may only grant permissions they hold themselves.</summary>
    public IReadOnlyList<string> NotHeld(IEnumerable<string> requested) => requested.Where(k => !_keys.Contains(k)).Distinct().ToList();
}
