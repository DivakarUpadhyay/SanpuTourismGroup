using Divakar.Sanpu.Core.Api;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Erp.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Divakar.Sanpu.Erp.Api;

[ApiController, Route("api/v1/content/articles"), Tags("News & blog"), AllowAnonymous]
public sealed class ArticlesController(ArticleService articles) : ControllerBase
{
    /// <summary>Published news (kind=News) or blog posts (kind=Blog), newest first, 9 per page, with categories.</summary>
    [HttpGet]
    public Task<ArticleList> List([FromQuery] string kind, [FromQuery] string? category, [FromQuery] int? page, CancellationToken ct) => articles.ListAsync(kind, category, page, ct);

    [HttpGet("{slug}")]
    public Task<ArticlePage> Get(string slug, CancellationToken ct) => articles.GetAsync(slug, ct);
}

[ApiController, Route("api/v1/ops/articles"), Tags("News & blog (staff)"), HasPermission("Content.Articles")]
public sealed class OpsArticlesController(ArticleService articles) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<ArticleAdminRow>> List([FromQuery] string? kind, [FromQuery] string? status, [FromQuery] string? search, CancellationToken ct) => articles.AdminAsync(kind, status, search, ct);

    [HttpPost]
    public Task<ArticleSavedRow> Create(ArticleSaveRequest r, CancellationToken ct) => articles.SaveAsync(null, r, ct);

    [HttpPut("{id:int}")]
    public Task<ArticleSavedRow> Update(int id, ArticleSaveRequest r, CancellationToken ct) => articles.SaveAsync(id, r, ct);

    [HttpPost("{id:int}/status")]
    public async Task<IActionResult> Status(int id, [FromBody] ArticleStatusRequest r, CancellationToken ct) { await articles.SetStatusAsync(id, r.Status, ct); return NoContent(); }

    /// <summary>Ask the AI writer for one original article (topic optional). It picks a real photo from the library.</summary>
    [HttpPost("write")]
    public Task<ArticleSavedRow> Write(ArticleWriteRequest r, CancellationToken ct) => articles.WriteWithAiAsync(r, ct);
}

public sealed record ArticleStatusRequest(string Status);

/// <summary>The writer bot: every hour it checks whether news or blog is due (ContentBot.IntervalHours) and publishes one
/// original article for Sanpu Travel (or keeps it as a draft when ContentBot.AutoPublish is false). Quietly skips when no AI is available.</summary>
public sealed class ContentBot(IServiceScopeFactory scopes, ILogger<ContentBot> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        await Task.Delay(TimeSpan.FromMinutes(2), stop);
        while (!stop.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var settings = scope.ServiceProvider.GetRequiredService<ISettings>();
                var repo = scope.ServiceProvider.GetRequiredService<IArticleRepository>();
                var writer = scope.ServiceProvider.GetRequiredService<IArticleWriter>();
                if (await settings.GetBoolAsync("ContentBot.Enabled", true, stop) && writer.IsConfigured)
                {
                    var hours = await settings.GetIntAsync("ContentBot.IntervalHours", 24, stop);
                    var publish = await settings.GetBoolAsync("ContentBot.AutoPublish", true, stop);
                    var (state, _) = await repo.BotStateAsync(stop);
                    foreach (var kind in ArticleService.Kinds)
                    {
                        var last = state.FirstOrDefault(s => s.Kind == kind)?.LastAtUtc;
                        if (last is not null && last > DateTime.UtcNow.AddHours(-hours)) continue;
                        var saved = await scope.ServiceProvider.GetRequiredService<ArticleService>().WriteAndSaveAsync(kind, null, publish, null, "content-bot", stop);
                        log.LogInformation("Content bot wrote {Kind} article {Slug} ({Status})", kind, saved.Slug, saved.Status);
                    }
                }
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
            catch (Exception ex) { log.LogWarning("Content bot skipped this round: {Message}", ex.Message); }
            await Task.Delay(TimeSpan.FromHours(1), stop);
        }
    }
}
