using System.Security.Cryptography;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Domain;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Divakar.Sanpu.Core.Api;

/// <summary>One-time operations run from the command line instead of public endpoints:
///   dotnet Api.dll bootstrap-admin            (reads SANPU_BOOTSTRAP_EMAIL / _PASSWORD / _NAME from the environment)
///   dotnet Api.dll provision-demo-users --out LOGINS.local.txt   (Development only: random passwords for seeded DEMO users)</summary>
public static class SanpuCli
{
    public static async Task<bool> TryRunAsync(WebApplication app, string[] args)
    {
        if (args.Length == 0 || args[0] is not ("bootstrap-admin" or "provision-demo-users")) return false;
        using var scope = app.Services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<IAuthRepository>();
        var hasher = scope.ServiceProvider.GetRequiredService<Application.IPasswordHasher>();

        if (args[0] == "bootstrap-admin")
        {
            var email = Environment.GetEnvironmentVariable("SANPU_BOOTSTRAP_EMAIL");
            var password = Environment.GetEnvironmentVariable("SANPU_BOOTSTRAP_PASSWORD");
            var name = Environment.GetEnvironmentVariable("SANPU_BOOTSTRAP_NAME") ?? "Administrator";
            if (!EmailAddress.IsValid(email)) throw new InvalidOperationException("Set SANPU_BOOTSTRAP_EMAIL to a valid email.");
            var problems = PasswordPolicy.Check(password, email);
            if (problems.Count > 0) throw new InvalidOperationException("SANPU_BOOTSTRAP_PASSWORD: " + string.Join(" ", problems));
            var id = await repo.BootstrapAdminAsync(email!.Trim(), EmailAddress.Normalize(email), name, hasher.Hash(password!), hasher.Algorithm, CancellationToken.None);
            Console.WriteLine($"Bootstrap admin ready: {Mask.Email(email)} ({id}). Clear SANPU_BOOTSTRAP_PASSWORD from your environment now.");
            return true;
        }

        if (!app.Environment.IsDevelopment()) throw new InvalidOperationException("provision-demo-users only runs in Development.");
        var outIndex = Array.IndexOf(args, "--out");
        var outFile = outIndex >= 0 && outIndex + 1 < args.Length ? args[outIndex + 1] : "LOGINS.local.txt";
        var lines = new List<string> { "# Local demo logins (fictional accounts). Generated " + DateTime.UtcNow.ToString("u") + ". Never commit this file.", "email,password,roles" };
        foreach (var user in await repo.ListDemoUsersAsync(CancellationToken.None))
        {
            var password = GeneratePassword();
            await repo.SetDemoPasswordAsync(user.UserId, hasher.Hash(password), hasher.Algorithm, CancellationToken.None);
            lines.Add($"{user.Email},{password},{user.Roles}");
        }
        await File.WriteAllLinesAsync(outFile, lines);
        Console.WriteLine($"Provisioned {lines.Count - 2} demo users; passwords written to {Path.GetFullPath(outFile)}");
        return true;
    }

    /// <summary>16 random characters that always satisfy the password policy.</summary>
    public static string GeneratePassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", lower = "abcdefghijkmnopqrstuvwxyz", digits = "23456789", all = upper + lower + digits;
        var chars = new List<char> { upper[RandomNumberGenerator.GetInt32(upper.Length)], lower[RandomNumberGenerator.GetInt32(lower.Length)], digits[RandomNumberGenerator.GetInt32(digits.Length)] };
        while (chars.Count < 16) chars.Add(all[RandomNumberGenerator.GetInt32(all.Length)]);
        return new string([.. chars.OrderBy(_ => RandomNumberGenerator.GetInt32(1000))]);
    }
}
