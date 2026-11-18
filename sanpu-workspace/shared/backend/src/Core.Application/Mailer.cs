using System.Net;
using System.Text.RegularExpressions;

namespace Divakar.Sanpu.Core.Application;

/// <summary>Customer and staff notifications. Best effort by design: an email problem is never allowed to fail the booking,
/// payment or sign-up that triggered it (the message is still kept in the outbox table for support).</summary>
public sealed class Mailer(NotificationService notifications, IAuthRepository users, ICurrentUser current, AppLinks links, ISettings settings)
{
    /// <summary>To the signed-in user.</summary>
    public async Task ToMeAsync(string templateKey, Dictionary<string, string> values, CancellationToken ct)
    {
        if (current.UserId is { } id) await ToUserAsync(id, templateKey, values, ct);
    }

    /// <summary>To any user by id (used by payment callbacks, which have no signed-in user).</summary>
    public async Task ToUserAsync(Guid userId, string templateKey, Dictionary<string, string> values, CancellationToken ct)
    {
        try
        {
            var user = await users.GetSecurityStateAsync(userId, ct);
            if (user is null) return;
            values.TryAdd("displayName", user.DisplayName);
            await ToAsync(user.Email, templateKey, values, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException) { /* never block the business action */ }
    }

    public async Task ToAsync(string email, string templateKey, Dictionary<string, string> values, CancellationToken ct)
    {
        try
        {
            values.TryAdd("site", links.PublicBaseUrl);
            values.TryAdd("brand", await settings.GetAsync("Ui.BrandName", ct) ?? "Sanpu");
            await notifications.SendAsync(templateKey, email, values, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException) { /* never block the business action */ }
    }

    public static string Money(decimal amount, string currency = "TWD") => $"{currency} {amount:#,0}";

    /// <summary>Plain-text template rendered into a simple branded HTML email (links become buttons; text is HTML-escaped).</summary>
    public static string Html(string brand, string subject, string text, string site)
    {
        var lines = text.Replace("\r", "").Split('\n');
        var body = new System.Text.StringBuilder();
        foreach (var raw in lines)
        {
            var line = raw.Trim();
            if (line.Length == 0) { body.Append("<div style=\"height:10px\"></div>"); continue; }
            var m = Regex.Match(line, @"^\[(?<label>[^\]]+)\]\((?<url>https?://[^)\s]+)\)$");   // [Button text](https://...)
            if (m.Success)
            {
                body.Append($"<p style=\"margin:18px 0\"><a href=\"{WebUtility.HtmlEncode(m.Groups["url"].Value)}\" style=\"display:inline-block;background:#0B5CAD;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px\">{WebUtility.HtmlEncode(m.Groups["label"].Value)}</a></p>");
                continue;
            }
            var kv = Regex.Match(line, @"^(?<k>[A-Z][A-Za-z ]{1,24}):\s+(?<v>.+)$");   // "Total: TWD 12,000" rows
            if (kv.Success && !line.Contains("http"))
            {
                body.Append($"<div style=\"display:flex;justify-content:space-between;gap:16px;padding:6px 0;border-bottom:1px solid #EEF1F5\"><span style=\"color:#64748B\">{WebUtility.HtmlEncode(kv.Groups["k"].Value)}</span><b style=\"color:#0F172A\">{WebUtility.HtmlEncode(kv.Groups["v"].Value)}</b></div>");
                continue;
            }
            var escaped = WebUtility.HtmlEncode(line);
            escaped = Regex.Replace(escaped, @"https?://[^\s&]+", u => $"<a href=\"{u.Value}\" style=\"color:#0B5CAD\">{u.Value}</a>");
            body.Append($"<p style=\"margin:0 0 8px;line-height:1.6\">{escaped}</p>");
        }
        var b = WebUtility.HtmlEncode(brand);
        return $"""
            <!doctype html><html><body style="margin:0;background:#F5F7FA;font-family:Segoe UI,Arial,sans-serif;color:#0F172A">
            <div style="max-width:560px;margin:0 auto;padding:28px 16px">
              <div style="font-size:18px;font-weight:700;color:#0B1F3A;margin-bottom:16px">{b}</div>
              <div style="background:#ffffff;border-radius:12px;padding:26px 24px;border:1px solid #E5E9F0">
                <h1 style="font-size:20px;margin:0 0 14px">{WebUtility.HtmlEncode(subject)}</h1>
                {body}
              </div>
              <p style="font-size:12px;color:#64748B;margin:16px 4px">You receive this email because of activity on your {b} account. <a href="{WebUtility.HtmlEncode(site)}" style="color:#64748B">{WebUtility.HtmlEncode(site)}</a></p>
            </div></body></html>
            """;
    }
}
