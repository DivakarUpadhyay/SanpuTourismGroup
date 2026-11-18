using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Anthropic;
using Anthropic.Models.Messages;
using Dapper;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Infrastructure;
using Divakar.Sanpu.Erp.Application;

namespace Divakar.Sanpu.Erp.Infrastructure;

public sealed class ArticleRepository(Db db) : IArticleRepository
{
    public Task<ArticleList> PublicAsync(string kind, string? category, int page, int pageSize, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Articles_Public", new { Kind = kind, Category = category, Page = page, PageSize = pageSize }, async g =>
        {
            var items = (await g.ReadAsync<ArticleCard>()).AsList();
            var cats = (await g.ReadAsync<ArticleCategory>()).AsList();
            return new ArticleList(items, cats, items.FirstOrDefault()?.TotalCount ?? 0, page, pageSize);
        }, ct);

    public Task<ArticlePage> GetPublicAsync(string slug, CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Article_GetPublic", new { Slug = slug }, async g => new ArticlePage(await g.ReadFirstAsync<ArticleFull>(), (await g.ReadAsync<ArticleCard>()).AsList()), ct);

    public Task<IReadOnlyList<ArticleAdminRow>> AdminAsync(string? kind, string? status, string? search, CancellationToken ct) =>
        db.QueryAsync<ArticleAdminRow>("dbo.usp_Articles_Admin", new { Kind = kind, Status = status, Search = search }, ct);

    public async Task<ArticleSavedRow> SaveAsync(int? id, ArticleSaveRequest r, string writtenBy, string? aiModel, Guid? actor, byte[]? rowVersion, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<ArticleSavedRow>("dbo.usp_Article_Save", new
        {
            ArticleId = id, r.Kind, r.Title, r.Summary, r.Body, r.Category, r.Tags, r.ImageUrl, r.ImageAlt, r.Status, WrittenBy = writtenBy, AiModel = aiModel,
            ActorUserId = actor, RowVersion = rowVersion, CorrelationId = correlationId
        }, ct))!;

    public Task SetStatusAsync(int id, string status, Guid? actor, string correlationId, CancellationToken ct) =>
        db.ExecuteAsync("dbo.usp_Article_SetStatus", new { ArticleId = id, Status = status, ActorUserId = actor, CorrelationId = correlationId }, ct);

    public Task<(IReadOnlyList<BotKindState> State, IReadOnlyList<BotTitle> Recent)> BotStateAsync(CancellationToken ct) =>
        db.MultipleAsync("dbo.usp_Articles_BotState", null, async g => ((IReadOnlyList<BotKindState>)(await g.ReadAsync<BotKindState>()).AsList(), (IReadOnlyList<BotTitle>)(await g.ReadAsync<BotTitle>()).AsList()), ct);
}

/// <summary>AI article writer. Tries Gemini (free key), then ChatGPT, then Claude: whichever has a key and credit answers.
/// Keys come from the secret store: GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY.</summary>
public sealed class AiArticleWriter(HttpClient http, ISecretStore secrets) : IArticleWriter
{
    private (string Name, string Url, string? Key, string Model)[] OpenAiCompatible =>
    [
        ("Gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", secrets.Get("GEMINI_API_KEY"), secrets.Get("GEMINI_MODEL") ?? "gemini-2.5-flash"),
        ("ChatGPT", (secrets.Get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").TrimEnd('/') + "/chat/completions", secrets.Get("OPENAI_API_KEY"), secrets.Get("OPENAI_MODEL") ?? "gpt-4o-mini"),
    ];
    private string? AnthropicKey => secrets.Get("ANTHROPIC_API_KEY") is { } k && k.StartsWith("sk-", StringComparison.Ordinal) ? k : null;
    public bool IsConfigured => OpenAiCompatible.Any(p => p.Key is { Length: > 20 }) || AnthropicKey is not null;

    private static string System(string kind) => $"""
        You are the editorial writer for Sanpu Travel, a travel group that runs tours, hotels and transport in Taiwan. Write one {(kind == "News" ? "news article" : "blog post")} in English.
        Rules:
        - Write everything in your own words. Never copy or closely paraphrase any published text. No quotes attributed to real people.
        - Do not invent statistics, prices, dates of specific real-world events, or claims about named real companies. Use general, timeless facts about Taiwan travel.
        - News is about the Taiwan travel industry in general terms (seasons, travel habits, transport, practical changes) or about Sanpu's own services. Blog is practical guides, ideas and Sanpu stories.
        - Friendly, clear, helpful tone for travelers. 300 to 500 words. Use short paragraphs, "## " headings and "- " bullet lists. Bold with **text** sparingly.
        - Choose imageKey from: {string.Join(", ", ArticleService.Photos.Keys)} (the photo that best fits; it is a real photograph from our library).
        Reply with ONLY one JSON object: {"{"}"title": "...", "summary": "one or two sentences", "category": "{(kind == "News" ? "Industry or Sanpu news" : "Travel guides, Food & culture or Sanpu stories")}", "tags": "comma,separated", "imageKey": "...", "body": "..."{"}"}
        """;

    public async Task<AiArticleDraft> WriteAsync(string kind, string topic, IReadOnlyList<string> avoidTitles, CancellationToken ct)
    {
        var user = $"Topic: {topic}\nAvoid repeating these existing titles: {string.Join(" | ", avoidTitles.Take(25))}";
        var problems = new List<string>();
        foreach (var p in OpenAiCompatible.Where(p => p.Key is { Length: > 20 }))
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, p.Url)
                {
                    Content = JsonContent.Create(new JsonObject
                    {
                        ["model"] = p.Model, ["max_completion_tokens"] = 2500,
                        ["messages"] = new JsonArray(new JsonObject { ["role"] = "system", ["content"] = System(kind) }, new JsonObject { ["role"] = "user", ["content"] = user })
                    })
                };
                req.Headers.Authorization = new("Bearer", p.Key);
                using var res = await http.SendAsync(req, ct);
                if (!res.IsSuccessStatusCode) { problems.Add($"{p.Name}: {(res.StatusCode is HttpStatusCode.TooManyRequests ? "no credit or rate limited" : ((int)res.StatusCode).ToString())}"); continue; }
                var json = await res.Content.ReadFromJsonAsync<JsonObject>(ct);
                var text = json?["choices"]?[0]?["message"]?["content"]?.ToString() ?? "";
                if (ArticleService.ParseDraft(text, p.Model) is { } d) return d;
                problems.Add($"{p.Name}: incomplete article");
            }
            catch (HttpRequestException) { problems.Add($"{p.Name}: not reachable"); }
        }
        if (AnthropicKey is { } key)
        {
            try
            {
                var client = new AnthropicClient { ApiKey = key };
                var msg = await client.Messages.Create(new MessageCreateParams
                {
                    Model = secrets.Get("ANTHROPIC_MODEL") ?? "claude-opus-5-5", MaxTokens = 4000, System = System(kind),
                    Messages = [new UserMessageParam { Content = user }], OutputConfig = new OutputConfig { Effort = Effort.Low },
                }, ct);
                var text = string.Concat(msg.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
                if (ArticleService.ParseDraft(text, "claude-opus-5-5") is { } d) return d;
                problems.Add("Claude: incomplete article");
            }
            catch (Exception ex) when (ex is not OperationCanceledException) { problems.Add("Claude: " + ex.GetType().Name.Replace("Exception", "")); }
        }
        throw new AiWriterUnavailable("No AI service could write the article (" + string.Join("; ", problems.DefaultIfEmpty("no key configured")) + ").");
    }
}
