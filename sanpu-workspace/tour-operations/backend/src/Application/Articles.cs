using System.Text.Json;
using Divakar.Sanpu.Core.Application;

namespace Divakar.Sanpu.Erp.Application;

public sealed record ArticleCard
{
    public int ArticleId { get; init; } public string Kind { get; init; } = ""; public string Slug { get; init; } = ""; public string Title { get; init; } = "";
    public string Summary { get; init; } = ""; public string Category { get; init; } = ""; public string? Tags { get; init; } public string? ImageUrl { get; init; }
    public string? ImageAlt { get; init; } public string AuthorName { get; init; } = ""; public int ReadMinutes { get; init; } public DateTime? PublishedAtUtc { get; init; }
    public string WrittenBy { get; init; } = ""; public int TotalCount { get; init; }
}
public sealed record ArticleCategory { public string Category { get; init; } = ""; public int Articles { get; init; } }
public sealed record ArticleList(IReadOnlyList<ArticleCard> Items, IReadOnlyList<ArticleCategory> Categories, int Total, int Page, int PageSize);
public sealed record ArticleFull
{
    public int ArticleId { get; init; } public string Kind { get; init; } = ""; public string Slug { get; init; } = ""; public string Title { get; init; } = "";
    public string Summary { get; init; } = ""; public string Body { get; init; } = ""; public string Category { get; init; } = ""; public string? Tags { get; init; }
    public string? ImageUrl { get; init; } public string? ImageAlt { get; init; } public string AuthorName { get; init; } = ""; public int ReadMinutes { get; init; }
    public DateTime? PublishedAtUtc { get; init; } public string WrittenBy { get; init; } = "";
}
public sealed record ArticlePage(ArticleFull Article, IReadOnlyList<ArticleCard> Related);
public sealed record ArticleAdminRow
{
    public int ArticleId { get; init; } public string Kind { get; init; } = ""; public string Slug { get; init; } = ""; public string Title { get; init; } = "";
    public string Summary { get; init; } = ""; public string Body { get; init; } = ""; public string Category { get; init; } = ""; public string? Tags { get; init; }
    public string? ImageUrl { get; init; } public string? ImageAlt { get; init; } public string AuthorName { get; init; } = ""; public string Status { get; init; } = "";
    public string WrittenBy { get; init; } = ""; public string? AiModel { get; init; } public int ReadMinutes { get; init; } public DateTime? PublishedAtUtc { get; init; }
    public DateTime CreatedAtUtc { get; init; } public DateTime? UpdatedAtUtc { get; init; } public byte[]? RowVersion { get; init; }
}
public sealed record ArticleSaveRequest(string Kind, string Title, string Summary, string Body, string Category, string? Tags, string? ImageUrl, string? ImageAlt, string Status, string? RowVersion);
public sealed record ArticleSavedRow { public int ArticleId { get; init; } public string Slug { get; init; } = ""; public string Status { get; init; } = ""; }
public sealed record ArticleWriteRequest(string Kind, string? Topic, bool Publish);
public sealed record BotKindState { public string Kind { get; init; } = ""; public DateTime LastAtUtc { get; init; } public int Articles { get; init; } }
public sealed record BotTitle { public string Kind { get; init; } = ""; public string Title { get; init; } = ""; }

public interface IArticleRepository
{
    Task<ArticleList> PublicAsync(string kind, string? category, int page, int pageSize, CancellationToken ct);
    Task<ArticlePage> GetPublicAsync(string slug, CancellationToken ct);
    Task<IReadOnlyList<ArticleAdminRow>> AdminAsync(string? kind, string? status, string? search, CancellationToken ct);
    Task<ArticleSavedRow> SaveAsync(int? id, ArticleSaveRequest r, string writtenBy, string? aiModel, Guid? actor, byte[]? rowVersion, string correlationId, CancellationToken ct);
    Task SetStatusAsync(int id, string status, Guid? actor, string correlationId, CancellationToken ct);
    Task<(IReadOnlyList<BotKindState> State, IReadOnlyList<BotTitle> Recent)> BotStateAsync(CancellationToken ct);
}

/// <summary>Draft written by the AI: original wording, one photo chosen from the site's own library.</summary>
public sealed record AiArticleDraft(string Title, string Summary, string Body, string Category, string? Tags, string ImageKey, string Model);

/// <summary>Writes an article with an AI model (Gemini, ChatGPT or Claude, first available). Throws AiWriterUnavailable when none can answer.</summary>
public interface IArticleWriter
{
    bool IsConfigured { get; }
    Task<AiArticleDraft> WriteAsync(string kind, string topic, IReadOnlyList<string> avoidTitles, CancellationToken ct);
}
public sealed class AiWriterUnavailable(string message) : Exception(message);

public sealed class ArticleService(IArticleRepository repo, IArticleWriter writer, ICurrentUser current)
{
    public static readonly string[] Kinds = ["News", "Blog"];
    public static readonly string[] Statuses = ["Draft", "Published", "Archived"];

    /// <summary>Real photographs from the site's library (CC licensed, credited on /credits). The AI picks one by key; it never generates images.</summary>
    public static readonly IReadOnlyDictionary<string, (string Url, string Alt)> Photos = new Dictionary<string, (string, string)>
    {
        ["hualien"] = ("/images/photos/hualien.jpg", "Gorge and river near Hualien"), ["sunmoon"] = ("/images/photos/sunmoon.jpg", "Sun Moon Lake with mountains behind"),
        ["tainan"] = ("/images/photos/tainan.jpg", "Historic temple in Tainan"), ["alishan"] = ("/images/photos/alishan.jpg", "Forest and mountain ridges at Alishan"),
        ["kinmen"] = ("/images/photos/kinmen.jpg", "Traditional houses in a Kinmen village"), ["taipei"] = ("/images/photos/taipei.jpg", "Taipei skyline"),
        ["bus"] = ("/images/photos/bus.jpg", "Intercity coach on the road"), ["flight"] = ("/images/photos/flight.jpg", "Aircraft at a Taiwan airport"),
        ["taxi"] = ("/images/photos/taxi.jpg", "Taxi on a city street"), ["hotel"] = ("/images/photos/hotel-room.jpg", "Bright hotel room"),
    };

    /// <summary>What the writer bot covers. News: Taiwan travel industry and Sanpu company updates. Blog: guides, ideas and Sanpu stories.</summary>
    public static readonly IReadOnlyDictionary<string, string[]> Topics = new Dictionary<string, string[]>
    {
        ["News"] =
        [
            "How seasonal weather shapes Taiwan's travel demand this time of year", "What travelers should know about booking around Taiwan's public holidays",
            "Trends in how travelers plan trips in Taiwan: shorter breaks and slower travel", "Sanpu's operations team: how we keep departures on schedule in typhoon season",
            "Sanpu adds more flexible deposit options for tours and hotels", "Why domestic island flights fill early and how to plan around them",
            "Sanpu's guides share what has changed in group travel", "Accessible travel in Taiwan: how operators are adapting tours and transfers",
            "Sanpu expands airport transfer options for late-night arrivals", "Rail, coach or flight: how travelers are choosing transport across Taiwan",
        ],
        ["Blog"] =
        [
            "A first-timer's week in Taiwan: north to south", "Taipei in 48 hours without rushing", "Hot springs in Taiwan: how to choose and what to expect",
            "Travelling Taiwan with children: practical tips", "Night markets: how to eat well and pace yourself", "Cycling Taiwan's east coast for beginners",
            "What to pack for Taiwan in each season", "Kinmen beyond the war history: villages, food and craft", "Tea country: visiting farms around Alishan and Sun Moon Lake",
            "Rainy-day ideas around Taiwan", "Behind the scenes: how Sanpu plans a new tour", "Slow travel in Tainan's old neighbourhoods",
        ],
    };

    public Task<ArticleList> ListAsync(string kind, string? category, int? page, CancellationToken ct) =>
        Kinds.Contains(kind) ? repo.PublicAsync(kind, string.IsNullOrWhiteSpace(category) ? null : category.Trim(), Math.Max(1, page ?? 1), 9, ct) : throw AppException.NotFound("Section");
    public Task<ArticlePage> GetAsync(string slug, CancellationToken ct) => repo.GetPublicAsync(slug, ct);
    public Task<IReadOnlyList<ArticleAdminRow>> AdminAsync(string? kind, string? status, string? search, CancellationToken ct) =>
        repo.AdminAsync(Kinds.Contains(kind) ? kind : null, Statuses.Contains(status) ? status : null, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), ct);

    public Task<ArticleSavedRow> SaveAsync(int? id, ArticleSaveRequest r, CancellationToken ct)
    {
        new FieldErrors()
            .Check(Kinds.Contains(r.Kind), "kind", "Choose News or Blog.")
            .Check(!string.IsNullOrWhiteSpace(r.Title) && r.Title.Trim().Length is >= 8 and <= 200, "title", "Use 8–200 characters.")
            .Check(!string.IsNullOrWhiteSpace(r.Summary) && r.Summary.Trim().Length is >= 20 and <= 400, "summary", "Use 20–400 characters.")
            .Check(!string.IsNullOrWhiteSpace(r.Body) && r.Body.Trim().Length >= 200, "body", "Write at least 200 characters.")
            .Check(!string.IsNullOrWhiteSpace(r.Category) && r.Category.Trim().Length <= 60, "category", "Enter a category (up to 60 characters).")
            .Check((r.Tags?.Length ?? 0) <= 200, "tags", "Use at most 200 characters.")
            .Check(CustomerRules.IsImagePath(r.ImageUrl), "imageUrl", "Upload a photo or choose one from the library.")
            .Check(Statuses.Contains(r.Status), "status", "Choose Draft, Published or Archived.")
            .ThrowIfAny();
        byte[]? rv = null;
        if (!string.IsNullOrWhiteSpace(r.RowVersion)) { try { rv = Convert.FromBase64String(r.RowVersion); } catch (FormatException) { throw AppException.Validation("rowVersion", "Reload and try again."); } }
        return repo.SaveAsync(id, r with { Title = r.Title.Trim(), Summary = r.Summary.Trim(), Category = r.Category.Trim() }, "Staff", null, current.UserId, rv, current.CorrelationId, ct);
    }

    public Task SetStatusAsync(int id, string status, CancellationToken ct) =>
        Statuses.Contains(status) ? repo.SetStatusAsync(id, status, current.UserId, current.CorrelationId, ct) : throw AppException.Validation("status", "Choose Draft, Published or Archived.");

    /// <summary>Staff asks the AI writer for one article (topic optional: the bot picks the next unused one).</summary>
    public async Task<ArticleSavedRow> WriteWithAiAsync(ArticleWriteRequest r, CancellationToken ct)
    {
        if (!Kinds.Contains(r.Kind)) throw AppException.Validation("kind", "Choose News or Blog.");
        if ((r.Topic?.Length ?? 0) > 200) throw AppException.Validation("topic", "Use at most 200 characters.");
        return await WriteAndSaveAsync(r.Kind, string.IsNullOrWhiteSpace(r.Topic) ? null : r.Topic.Trim(), r.Publish, current.UserId, current.CorrelationId, ct);
    }

    /// <summary>Shared by staff requests and the scheduled bot.</summary>
    public async Task<ArticleSavedRow> WriteAndSaveAsync(string kind, string? topic, bool publish, Guid? actor, string correlationId, CancellationToken ct)
    {
        if (!writer.IsConfigured) throw new AppException(503, "ai_unavailable", "The AI writer has no active AI service. Add credit or a key for Gemini, ChatGPT or Claude.");
        var (_, recent) = await repo.BotStateAsync(ct);
        var used = recent.Where(x => x.Kind == kind).Select(x => x.Title).ToList();
        topic ??= Topics[kind].OrderBy(t => used.Count(u => Overlap(u, t))).ThenBy(_ => Random.Shared.Next()).First();
        AiArticleDraft d;
        try { d = await writer.WriteAsync(kind, topic, used, ct); }
        catch (AiWriterUnavailable ex) { throw new AppException(503, "ai_unavailable", ex.Message); }
        var photo = Photos.TryGetValue(d.ImageKey, out var p) ? p : Photos[kind == "News" ? "taipei" : "hualien"];
        var req = new ArticleSaveRequest(kind, d.Title, d.Summary, d.Body, d.Category, d.Tags, photo.Url, photo.Alt, publish ? "Published" : "Draft", null);
        return await repo.SaveAsync(null, req, "AI", d.Model, actor, null, correlationId, ct);
    }

    private static bool Overlap(string a, string b)
    {
        var wa = a.ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(w => w.Length > 4).ToHashSet();
        return b.ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries).Count(wa.Contains) >= 2;
    }

    /// <summary>Parses the model's JSON answer; anything incomplete is rejected (never half-published).</summary>
    public static AiArticleDraft? ParseDraft(string text, string model)
    {
        var start = text.IndexOf('{'); var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try
        {
            using var doc = JsonDocument.Parse(text[start..(end + 1)]);
            var e = doc.RootElement;
            string? S(string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()?.Trim() : null;
            var (title, summary, body, cat) = (S("title"), S("summary"), S("body"), S("category"));
            if (title is not { Length: >= 8 and <= 200 } || summary is not { Length: >= 20 } || body is not { Length: >= 400 } || string.IsNullOrWhiteSpace(cat)) return null;
            return new AiArticleDraft(title, summary.Length > 400 ? summary[..397] + "..." : summary, body, cat.Length > 60 ? cat[..60] : cat,
                S("tags") is { } t ? (t.Length > 200 ? t[..200] : t) : null, (S("imageKey") ?? "").ToLowerInvariant(), model);
        }
        catch (JsonException) { return null; }
    }
}
