using System.Security.Cryptography;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Domain;
using Divakar.Sanpu.Core.Infrastructure;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Divakar.Sanpu.Core.UnitTests;

public class PasswordAndEmailTests
{
    [Theory]
    [InlineData("Short1A", "Use at least 12 characters.")]
    [InlineData("alllowercase123", "Add an upper-case letter.")]
    [InlineData("ALLUPPERCASE123", "Add a lower-case letter.")]
    [InlineData("NoDigitsHereAtAll", "Add a digit.")]
    public void Password_policy_reports_each_missing_rule(string password, string expected) =>
        Assert.Contains(expected, PasswordPolicy.Check(password));

    [Fact]
    public void Password_policy_rejects_email_name_and_accepts_strong_password()
    {
        Assert.Contains("Do not use your email name in the password.", PasswordPolicy.Check("Chenyating2026X", "chenyating@demo.test"));
        Assert.Empty(PasswordPolicy.Check("Blue-Harbor-2026x", "someone@demo.test"));
    }

    [Theory]
    [InlineData("  Ops.Manager@Demo.Sanpu.Test ", "ops.manager@demo.sanpu.test")]
    public void Email_is_trimmed_and_lowercased(string input, string expected) => Assert.Equal(expected, EmailAddress.Normalize(input));

    [Theory]
    [InlineData("a@b.co", true)]
    [InlineData("not-an-email", false)]
    [InlineData("two@@at.com", false)]
    [InlineData("", false)]
    public void Email_validation(string email, bool valid) => Assert.Equal(valid, EmailAddress.IsValid(email));

    [Fact]
    public void Masking_hides_personal_data()
    {
        Assert.Equal("t***@demo.sanpu.test", Mask.Email("traveler@demo.sanpu.test"));
        Assert.Equal("+886 9•• ••• 321", Mask.Phone("+886912345321"));
        Assert.Equal("A12•••••89", Mask.Document("A123456789"));
    }
}

public class PermissionTests
{
    [Fact]
    public void NotHeld_lists_permissions_the_caller_cannot_grant()
    {
        var caller = new EffectivePermissions(["Booking.View", "Booking.Approve"]);
        Assert.Equal(["Admin.Users.Edit"], caller.NotHeld(["Booking.View", "Admin.Users.Edit"]));
        Assert.Empty(caller.NotHeld(["booking.view"]));   // case-insensitive
    }

    [Fact]
    public void Menu_visibility_uses_any_of_semantics()
    {
        var p = new EffectivePermissions(["Ops.Dashboard.View"]);
        Assert.True(p.HasAny(["Admin.Dashboard.View", "Ops.Dashboard.View"]));
        Assert.False(p.HasAny(["Admin.Dashboard.View"]));
    }
}

public class MenuTreeTests
{
    private static MenuRow Row(int id, int? parent, string? route, int sort = 0) => new(id, parent, "m" + id, "Menu " + id, route, null, sort, false);

    [Fact]
    public void Builds_nested_tree_in_sort_order()
    {
        var tree = MenuTreeBuilder.Build([Row(1, null, null, 20), Row(2, 1, "/b", 2), Row(3, 1, "/a", 1), Row(4, null, "/home", 10)]);
        Assert.Equal(["Menu 4", "Menu 1"], tree.Select(n => n.Title));
        Assert.Equal(["/a", "/b"], tree[1].Children.Select(c => c.Route));
    }

    [Fact]
    public void Prunes_empty_groups_and_orphans()
    {
        // group 1 has no visible child; menu 5's parent (9) is not visible to the user
        var tree = MenuTreeBuilder.Build([Row(1, null, null), Row(4, null, "/home"), Row(5, 9, "/orphan")]);
        Assert.Single(tree);
        Assert.Equal("/home", tree[0].Route);
    }

    [Fact]
    public void Ignores_cyclic_rows_instead_of_looping()
    {
        var tree = MenuTreeBuilder.Build([Row(1, 2, "/a"), Row(2, 1, "/b"), Row(3, null, "/ok")]);
        Assert.Equal(["/ok"], MenuTreeBuilder.Routes(tree));
    }

    [Fact]
    public void Detects_cycles_before_saving()
    {
        var parents = new Dictionary<int, int?> { [1] = null, [2] = 1, [3] = 2 };
        Assert.True(MenuTreeBuilder.WouldCreateCycle(1, 3, parents));   // 1 under its grandchild
        Assert.True(MenuTreeBuilder.WouldCreateCycle(2, 2, parents));   // itself
        Assert.False(MenuTreeBuilder.WouldCreateCycle(3, 1, parents));
    }
}

public class SettingRulesTests
{
    [Theory]
    [InlineData("Int", "15", "{\"min\":1,\"max\":60}", true)]
    [InlineData("Int", "0", "{\"min\":1,\"max\":60}", false)]
    [InlineData("Int", "abc", null, false)]
    [InlineData("Decimal", "2.5", "{\"min\":0}", true)]
    [InlineData("Bool", "true", null, true)]
    [InlineData("Bool", "yes", null, false)]
    [InlineData("Json", "[\"en\"]", "{\"type\":\"array\"}", true)]
    [InlineData("Json", "{\"a\":1}", "{\"type\":\"array\"}", false)]
    [InlineData("Json", "{broken", null, false)]
    [InlineData("String", "Smtp", "{\"allowed\":[\"DevOutbox\",\"Smtp\"]}", true)]
    [InlineData("String", "Sendgrid", "{\"allowed\":[\"DevOutbox\",\"Smtp\"]}", false)]
    [InlineData("SecretRef", "ANTHROPIC_API_KEY", null, true)]
    [InlineData("SecretRef", "sk-ant-real-secret-value", null, false)]
    public void Validates_typed_values(string type, string value, string? rule, bool ok) =>
        Assert.Equal(ok, SettingValueRules.Validate(type, value, rule) is null);
}

public class TokenAndCryptoTests
{
    private sealed class FixedClock : IClock { public DateTime UtcNow { get; } = DateTime.UtcNow; }

    [Fact]
    public void Access_token_has_minimal_claims_and_valid_signature()
    {
        var key = RandomNumberGenerator.GetBytes(48);
        var svc = new TokenService(new JwtOptions("iss", "aud", key), new FixedClock());
        var stamp = Guid.NewGuid();
        var (token, exp) = svc.CreateAccessToken(Guid.NewGuid(), "a@b.co", stamp, 7, 10);
        var jwt = new JsonWebToken(token);
        Assert.Equal("iss", jwt.Issuer);
        Assert.Equal("7", jwt.GetClaim(TokenService.PermissionVersionClaim).Value);
        Assert.Equal(svc.StampFingerprint(stamp), jwt.GetClaim(TokenService.StampClaim).Value);
        Assert.DoesNotContain(jwt.Claims, c => c.Type is "perm" or "password");
        Assert.True(exp > DateTime.UtcNow.AddMinutes(9));
        var result = new JsonWebTokenHandler().ValidateTokenAsync(token, new Microsoft.IdentityModel.Tokens.TokenValidationParameters
        {
            ValidIssuer = "iss", ValidAudience = "aud", IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(key)
        }).GetAwaiter().GetResult();
        Assert.True(result.IsValid);
        var forged = new JsonWebTokenHandler().ValidateTokenAsync(token, new Microsoft.IdentityModel.Tokens.TokenValidationParameters
        {
            ValidIssuer = "iss", ValidAudience = "aud", IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(RandomNumberGenerator.GetBytes(48))
        }).GetAwaiter().GetResult();
        Assert.False(forged.IsValid);
    }

    [Fact]
    public void Opaque_tokens_are_random_and_only_the_hash_is_stored()
    {
        var svc = new TokenService(new JwtOptions("i", "a", new byte[48]), new FixedClock());
        var (t1, h1) = svc.CreateOpaqueToken();
        var (t2, _) = svc.CreateOpaqueToken();
        Assert.NotEqual(t1, t2);
        Assert.Equal(32, h1.Length);
        Assert.Equal(h1, svc.HashOpaqueToken(t1));
    }

    [Fact]
    public void Pii_round_trips_and_detects_tampering()
    {
        var p = new AesGcmPiiProtector(RandomNumberGenerator.GetBytes(32));
        var c1 = p.Protect("+886912345321")!;
        var c2 = p.Protect("+886912345321")!;
        Assert.NotEqual(c1, c2);                       // random nonce
        Assert.Equal("+886912345321", p.Unprotect(c1));
        c1[^1] ^= 0xFF;
        Assert.ThrowsAny<CryptographicException>(() => p.Unprotect(c1));
        Assert.Null(p.Protect(null));
    }

    [Fact]
    public void Password_hasher_verifies_and_rejects()
    {
        var h = new IdentityPasswordHasher();
        var hash = h.Hash("Blue-Harbor-2026x");
        Assert.True(h.Verify(hash, "Blue-Harbor-2026x"));
        Assert.False(h.Verify(hash, "blue-harbor-2026x"));
        Assert.False(h.Verify("not-a-hash", "x"));
    }
}

public class ValidationTests
{
    [Fact]
    public void FieldErrors_collects_all_errors_into_one_422()
    {
        var ex = Assert.Throws<AppException>(() => new FieldErrors().Check(false, "a", "A bad").Check(false, "b", "B bad").Check(true, "c", "fine").ThrowIfAny());
        Assert.Equal(422, ex.Status);
        Assert.Equal(["a", "b"], ex.Errors!.Keys.Order());
    }

    [Fact]
    public void Invite_validator_requires_roles_and_valid_email()
    {
        var ex = Assert.Throws<AppException>(() => Validation.Ensure(new InviteUserValidator(), new InviteUserRequest("bad", "X", "Robot", [])));
        Assert.Contains("email", ex.Errors!.Keys);
        Assert.Contains("roleIds", ex.Errors.Keys);
        Assert.Contains("userType", ex.Errors.Keys);
        Assert.Contains("displayName", ex.Errors.Keys);
    }

    [Fact]
    public void Menu_validator_blocks_protocol_relative_and_insecure_routes()
    {
        var ok = new MenuUpsertRequest(null, "ops.reports", "Reports", "/admin/reports", null, 10, true, true, false, "Admin", null);
        Validation.Ensure(new MenuUpsertValidator(), ok);
        Assert.Throws<AppException>(() => Validation.Ensure(new MenuUpsertValidator(), ok with { RoutePath = "//evil.example" }));
        Assert.Throws<AppException>(() => Validation.Ensure(new MenuUpsertValidator(), ok with { RoutePath = "http://evil.example", IsExternal = true }));
    }
}
