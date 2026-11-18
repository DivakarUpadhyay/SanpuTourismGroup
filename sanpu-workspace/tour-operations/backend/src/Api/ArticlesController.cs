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

    /// <summary>The writer bot schedule per section (News, Blog): days, time (Taiwan time), auto-publish, topics, last run.</summary>
    [HttpGet("bot")]
    public Task<IReadOnlyList<BotSchedule>> Schedules(CancellationToken ct) => articles.SchedulesAsync(ct);

    [HttpPut("bot/{kind}")]
    public async Task<IActionResult> SaveSchedule(string kind, BotScheduleSave s, CancellationToken ct) { await articles.SaveScheduleAsync(kind, s, ct); return NoContent(); }

    /// <summary>Run the bot for one section now (uses the next topic from its list).</summary>
    [HttpPost("bot/{kind}/run")]
    public Task<ArticleSavedRow> RunNow(string kind, CancellationToken ct) => articles.RunNowAsync(kind, ct);

    /// <summary>Ask the AI writer for one original article (topic optional). It picks a real photo from the library.</summary>
    [HttpPost("write")]
    public Task<ArticleSavedRow> Write(ArticleWriteRequest r, CancellationToken ct) => articles.WriteWithAiAsync(r, ct);
}

public sealed record ArticleStatusRequest(string Status);

/// <summary>The writer bot. Every 5 minutes it checks each section schedule (days + time in Taiwan time, set by an admin on
/// News & blog) and writes one original article per section per scheduled day, published at once or kept as a draft.</summary>
public sealed class ContentBot(IServiceScopeFactory scopes, ILogger<ContentBot> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        await Task.Delay(TimeSpan.FromMinutes(1), stop);
        while (!stop.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var repo = scope.ServiceProvider.GetRequiredService<IArticleRepository>();
                var writer = scope.ServiceProvider.GetRequiredService<IArticleWriter>();
                var now = ArticleService.TaiwanNow(DateTime.UtcNow);
                var today = ArticleService.WeekDays[((int)now.DayOfWeek + 6) % 7];
                foreach (var s in await repo.SchedulesAsync(stop))
                {
                    if (!s.IsEnabled || !s.Days.Split(',').Contains(today) || string.CompareOrdinal(now.ToString("HH:mm"), s.TimeLocal) < 0) continue;
                    if (s.LastRunUtc is { } last && ArticleService.TaiwanNow(last).Date == now.Date) continue;   // already ran today
                    if (!writer.IsConfigured) { await repo.MarkRunAsync(s.Kind, "Skipped: no AI service has a key.", stop); continue; }
                    try
                    {
                        var saved = await scope.ServiceProvider.GetRequiredService<ArticleService>().WriteAndSaveAsync(s.Kind, ArticleService.NextTopic(s), s.AutoPublish, null, "content-bot", stop);
                        await repo.MarkRunAsync(s.Kind, $"Wrote {saved.Slug} ({saved.Status})", stop);
                        log.LogInformation("Content bot wrote {Kind} article {Slug}", s.Kind, saved.Slug);
                    }
                    catch (AppException ex) { await repo.MarkRunAsync(s.Kind, ex.Message, stop); }
                }
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
            catch (Exception ex) { log.LogWarning("Content bot skipped this round: {Message}", ex.Message); }
            await Task.Delay(TimeSpan.FromMinutes(5), stop);
        }
    }
}
