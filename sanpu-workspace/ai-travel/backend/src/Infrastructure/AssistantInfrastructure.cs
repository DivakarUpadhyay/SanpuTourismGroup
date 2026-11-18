using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Messages;
using Dapper;
using Divakar.Sanpu.AiOps.Application;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Infrastructure;

namespace Divakar.Sanpu.AiOps.Infrastructure;

/// <summary>Claude tool-use loop through the official Anthropic C# SDK: send the conversation and tools, run every requested tool,
/// return one result per tool_use, repeat until Claude answers (or the round limit is reached).</summary>
public sealed class AnthropicAssistantModel(ISecretStore secrets) : IAssistantModel
{
    private readonly string? _key = secrets.Get("ANTHROPIC_API_KEY");
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_key) && _key!.StartsWith("sk-", StringComparison.Ordinal);

    public async Task<AssistantRun> RunAsync(string model, string system, IReadOnlyList<ChatTurn> history, IReadOnlyList<AssistantToolDef> tools,
        Func<string, JsonElement, Task<string>> execute, int maxRounds, TimeSpan timeout, CancellationToken ct)
    {
        if (!IsConfigured) throw new AiUnavailableException("unavailable", "ANTHROPIC_API_KEY is not configured.");
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout);
        var client = new AnthropicClient { ApiKey = _key };
        List<ToolUnion> toolDefs = [.. tools.Select(t => (ToolUnion)new Tool
        {
            Name = t.Name,
            Description = t.Description,
            InputSchema = new()
            {
                Properties = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(t.PropertiesJson)!,
                Required = [.. t.Required],
            },
        })];
        List<MessageParam> messages = [.. history.Select(h => h.Role == "assistant" ? (MessageParam)new AssistantMessageParam { Content = h.Content } : new UserMessageParam { Content = h.Content })];
        int inTok = 0, outTok = 0, calls = 0;
        var text = new List<string>();
        try
        {
            for (var round = 0; round <= maxRounds; round++)
            {
                var last = round == maxRounds;   // last round: no tools, the model must answer with what it has
                var response = await client.Messages.Create(new MessageCreateParams
                {
                    Model = model,
                    MaxTokens = 4000,
                    System = system,
                    Messages = messages,
                    Tools = last ? null : toolDefs,
                    OutputConfig = new OutputConfig { Effort = Effort.Low },   // chat should feel instant; tools carry the facts
                }, cts.Token);
                inTok += (int)response.Usage.InputTokens; outTok += (int)response.Usage.OutputTokens;

                List<ContentBlockParam> assistantContent = [];
                List<ContentBlockParam> toolResults = [];
                text.Clear();
                foreach (var block in response.Content)
                {
                    if (block.TryPickText(out TextBlock? t)) { text.Add(t.Text); assistantContent.Add(new TextBlockParam { Text = t.Text }); }
                    else if (block.TryPickThinking(out ThinkingBlock? th)) assistantContent.Add(new ThinkingBlockParam { Thinking = th.Thinking, Signature = th.Signature });
                    else if (block.TryPickRedactedThinking(out RedactedThinkingBlock? rt)) assistantContent.Add(new RedactedThinkingBlockParam { Data = rt.Data });
                    else if (block.TryPickToolUse(out ToolUseBlock? use))
                    {
                        assistantContent.Add(new ToolUseBlockParam { ID = use.ID, Name = use.Name, Input = use.Input });
                        calls++;
                        var input = JsonSerializer.SerializeToElement(use.Input);
                        toolResults.Add(new ToolResultBlockParam { ToolUseID = use.ID, Content = await execute(use.Name, input) });
                    }
                }
                var stop = response.StopReason?.ToString() ?? "";
                if (toolResults.Count == 0)
                    return new AssistantRun(string.Join("\n\n", text), inTok, outTok, model, stop, calls);
                messages.Add(new AssistantMessageParam { Content = assistantContent });
                messages.Add(new UserMessageParam { Content = toolResults });
            }
            return new AssistantRun(string.Join("\n\n", text), inTok, outTok, model, "max_rounds", calls);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new TimeoutException("AI provider timeout"); }
        catch (AnthropicUnauthorizedException) { throw new AiUnavailableException("auth_failed", "The AI provider rejected the API key."); }
        catch (AnthropicRateLimitException) { throw new AiUnavailableException("rate_limited", "The AI provider is rate limiting; try again later."); }
        catch (AnthropicApiException ex) { throw new AiUnavailableException("provider_error", "The AI provider returned an error: " + ex.GetType().Name); }
        catch (HttpRequestException) { throw new AiUnavailableException("network_error", "The AI provider could not be reached."); }
    }
}

/// <summary>Sanpu Travel public API (anonymous, read-only endpoints only).</summary>
public sealed class HttpTravelCatalog(HttpClient http) : ITravelCatalog
{
    public async Task<JsonNode?> GetAsync(string path, IReadOnlyDictionary<string, string?>? query, CancellationToken ct)
    {
        var qs = query is null ? "" : "?" + string.Join('&', query.Where(kv => !string.IsNullOrWhiteSpace(kv.Value)).Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value!)}"));
        using var res = await http.GetAsync(path + (qs == "?" ? "" : qs), ct);
        if (res.StatusCode == System.Net.HttpStatusCode.NotFound) throw AppException.NotFound("Item");
        if ((int)res.StatusCode is >= 400 and < 500)
        {
            var problem = await res.Content.ReadFromJsonAsync<JsonObject>(ct);
            throw new AppException(422, "catalog_rejected", problem?["detail"]?.ToString() ?? "The travel catalog rejected that search.");
        }
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonNode>(ct);
    }
}

public sealed class ReservationRepository(Db db) : IReservationRepository
{
    public async Task<ReservationRow> PrepareAsync(Guid traveler, string kind, string code, string name, string? image, DateTime start, DateTime? end, int travelers, int units, int? departureId, decimal total, string currency, string? notes, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<ReservationRow>("dbo.usp_Reservation_Prepare", new
        {
            TravelerUserId = traveler, Kind = kind, ItemCode = code, ItemName = name, ImageUrl = image, StartDate = start, EndDate = end, Travelers = travelers,
            Units = units, DepartureId = departureId, Total = total, Currency = currency, Notes = notes, CorrelationId = correlationId
        }, ct))!;
    public Task<IReadOnlyList<ReservationRow>> MineAsync(Guid traveler, CancellationToken ct) => db.QueryAsync<ReservationRow>("dbo.usp_Reservation_ListForTraveler", new { TravelerUserId = traveler }, ct);
    public Task<IReadOnlyList<ReservationRow>> AllAsync(string? status, CancellationToken ct) => db.QueryAsync<ReservationRow>("dbo.usp_Reservation_ListAll", new { Status = status }, ct);
    public async Task<ReservationRow> PayAsync(int id, Guid traveler, decimal amount, string paymentRef, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<ReservationRow>("dbo.usp_Reservation_Pay", new { ReservationId = id, TravelerUserId = traveler, Amount = amount, PaymentRef = paymentRef, CorrelationId = correlationId }, ct))!;
    public async Task<ReservationRow> CancelAsync(int id, Guid traveler, string correlationId, CancellationToken ct) =>
        (await db.QuerySingleAsync<ReservationRow>("dbo.usp_Reservation_Cancel", new { ReservationId = id, TravelerUserId = traveler, CorrelationId = correlationId }, ct))!;
}
