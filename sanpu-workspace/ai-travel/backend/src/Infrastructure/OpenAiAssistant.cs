using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Divakar.Sanpu.AiOps.Application;
using Divakar.Sanpu.Core.Application;

namespace Divakar.Sanpu.AiOps.Infrastructure;

/// <summary>OpenAI (ChatGPT) chat completions with function calling, the same tools and rules as the Claude assistant.
/// Works with any OpenAI-compatible service: OPENAI_BASE_URL (default OpenAI; e.g. Google Gemini
/// https://generativelanguage.googleapis.com/v1beta/openai or Groq https://api.groq.com/openai/v1), OPENAI_API_KEY, OPENAI_MODEL.</summary>
public record OpenAiCompatibleProfile(string Name, string SecretPrefix, string DefaultBaseUrl, string DefaultModel, string FallbackModels = "")
{
    public static readonly OpenAiCompatibleProfile OpenAI = new("OpenAI", "OPENAI", "https://api.openai.com/v1", "gpt-4o-mini");
    public static readonly OpenAiCompatibleProfile Gemini = new("Gemini", "GEMINI", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-flash-lite-latest", "gemini-3.1-flash-lite,gemini-3-flash-preview,gemini-flash-latest");
}

/// <summary>ChatGPT (OpenAI). One constructor so the typed HttpClient factory can create it.</summary>
public sealed class OpenAiAssistantModel(HttpClient http, ISecretStore secrets) : OpenAiCompatibleModel(http, secrets, OpenAiCompatibleProfile.OpenAI);

public abstract class OpenAiCompatibleModel(HttpClient http, ISecretStore secrets, OpenAiCompatibleProfile profile) : IAssistantModel
{
    private readonly string? _key = secrets.Get(profile.SecretPrefix + "_API_KEY");
    private readonly string _model = secrets.Get(profile.SecretPrefix + "_MODEL") is { Length: > 0 } m ? m : profile.DefaultModel;
    private readonly string _base = (secrets.Get(profile.SecretPrefix + "_BASE_URL") is { Length: > 0 } b ? b : profile.DefaultBaseUrl).TrimEnd('/');
    public string Name => profile.Name;
    /// <summary>The chosen model first, then the other free models (GEMINI_FALLBACK_MODELS, comma separated).</summary>
    private string[] Candidates() => [.. new[] { _model }.Concat((secrets.Get(profile.SecretPrefix + "_FALLBACK_MODELS") ?? profile.FallbackModels).Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)).Distinct()];
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_key) && _key!.Length > 20;

    public async Task<AssistantRun> RunAsync(string model, string system, IReadOnlyList<ChatTurn> history, IReadOnlyList<AssistantToolDef> tools,
        Func<string, JsonElement, Task<string>> execute, int maxRounds, TimeSpan timeout, CancellationToken ct)
    {
        if (!IsConfigured) throw new AiUnavailableException("unavailable", $"{profile.SecretPrefix}_API_KEY is not configured.");
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout);
        var messages = new JsonArray { new JsonObject { ["role"] = "system", ["content"] = system } };
        foreach (var h in history) messages.Add(new JsonObject { ["role"] = h.Role == "assistant" ? "assistant" : "user", ["content"] = h.Content });
        var toolDefs = new JsonArray([.. tools.Select(t => (JsonNode)new JsonObject
        {
            ["type"] = "function",
            ["function"] = new JsonObject
            {
                ["name"] = t.Name, ["description"] = t.Description,
                ["parameters"] = new JsonObject { ["type"] = "object", ["properties"] = JsonNode.Parse(t.PropertiesJson), ["required"] = new JsonArray([.. t.Required.Select(r => (JsonNode)r)]) }
            }
        })]);
        int inTok = 0, outTok = 0, calls = 0;
        var active = _model;
        try
        {
            for (var round = 0; round <= maxRounds; round++)
            {
                HttpResponseMessage? sent = null;
                // before any tool has run, a busy model can hand over to the next one; afterwards the same model must finish
                var tries = round == 0 ? Candidates() : [active];
                foreach (var candidate in tries)
                {
                    for (var attempt = 0; attempt < 2; attempt++)
                    {
                        var body = new JsonObject { ["model"] = candidate, ["messages"] = messages.DeepClone(), ["max_completion_tokens"] = 3000 };
                        if (round < maxRounds) body["tools"] = toolDefs.DeepClone();
                        using var req = new HttpRequestMessage(HttpMethod.Post, _base + "/chat/completions") { Content = JsonContent.Create(body) };
                        req.Headers.Authorization = new("Bearer", _key);
                        sent?.Dispose();
                        sent = await http.SendAsync(req, cts.Token);
                        active = candidate;
                        if ((int)sent.StatusCode is not (429 or 500 or 503)) break;
                        if (attempt == 0) await Task.Delay(700, cts.Token);
                    }
                    if ((int)sent!.StatusCode is not (404 or 429 or 500 or 503)) break;
                }
                using var res = sent!;
                if (res.StatusCode == HttpStatusCode.Unauthorized) throw new AiUnavailableException("auth_failed", $"{profile.Name} rejected the API key.");
                if (res.StatusCode == HttpStatusCode.TooManyRequests) throw new AiUnavailableException("rate_limited", $"{profile.Name} is rate limiting or out of credit.");
                if (!res.IsSuccessStatusCode) throw new AiUnavailableException("provider_error", $"{profile.Name} returned {(int)res.StatusCode}.");
                var json = (await res.Content.ReadFromJsonAsync<JsonObject>(cts.Token))!;
                inTok += json["usage"]?["prompt_tokens"]?.GetValue<int>() ?? 0;
                outTok += json["usage"]?["completion_tokens"]?.GetValue<int>() ?? 0;
                var choice = json["choices"]![0]!;
                var msg = choice["message"]!.AsObject();
                var toolCalls = msg["tool_calls"]?.AsArray();
                if (toolCalls is null || toolCalls.Count == 0)
                    return new AssistantRun(msg["content"]?.ToString() ?? "", inTok, outTok, active, choice["finish_reason"]?.ToString() ?? "", calls);
                messages.Add(msg.DeepClone());
                foreach (var call in toolCalls)
                {
                    calls++;
                    var name = call!["function"]!["name"]!.ToString();
                    JsonElement input;
                    try { input = JsonDocument.Parse(call["function"]!["arguments"]?.ToString() is { Length: > 0 } a ? a : "{}").RootElement.Clone(); }
                    catch (JsonException) { input = JsonDocument.Parse("{}").RootElement.Clone(); }
                    messages.Add(new JsonObject { ["role"] = "tool", ["tool_call_id"] = call["id"]!.ToString(), ["content"] = await execute(name, input) });
                }
            }
            return new AssistantRun("", inTok, outTok, _model, "max_rounds", calls);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new TimeoutException("AI provider timeout"); }
        catch (HttpRequestException) { throw new AiUnavailableException("network_error", $"{profile.Name} could not be reached."); }
    }
}

/// <summary>Google Gemini through its OpenAI-compatible endpoint (free key from aistudio.google.com): GEMINI_API_KEY, GEMINI_MODEL.</summary>
public sealed class GeminiAssistantModel(HttpClient http, ISecretStore secrets) : OpenAiCompatibleModel(http, secrets, OpenAiCompatibleProfile.Gemini);

/// <summary>Tries the providers in order (setting Assistant.ProviderOrder, default "Gemini,OpenAI,Anthropic"): when one is not configured,
/// out of credit, rate limited or down, the next one answers. Tool results are never repeated: a provider that already ran tools
/// and then failed is not retried with another provider for the same message.</summary>
public sealed class FailoverAssistantModel(GeminiAssistantModel gemini, OpenAiAssistantModel openAi, AnthropicAssistantModel anthropic, ISettings settings) : IAssistantModel
{
    public bool IsConfigured => gemini.IsConfigured || openAi.IsConfigured || anthropic.IsConfigured;

    public async Task<AssistantRun> RunAsync(string model, string system, IReadOnlyList<ChatTurn> history, IReadOnlyList<AssistantToolDef> tools,
        Func<string, JsonElement, Task<string>> execute, int maxRounds, TimeSpan timeout, CancellationToken ct)
    {
        var order = (await settings.GetAsync("Assistant.ProviderOrder", ct) ?? "Gemini,OpenAI,Anthropic").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        AiUnavailableException? last = null;
        foreach (var name in order)
        {
            IAssistantModel? p = name switch { "Gemini" => gemini, "OpenAI" => openAi, "Anthropic" => anthropic, _ => null };
            if (p is null || !p.IsConfigured) continue;
            var toolsRun = 0;
            Task<string> Counted(string tool, JsonElement input) { toolsRun++; return execute(tool, input); }
            try { return await p.RunAsync(model, system, history, tools, Counted, maxRounds, timeout, ct); }
            catch (AiUnavailableException ex) when (toolsRun == 0) { last = ex; }
        }
        throw last ?? new AiUnavailableException("unavailable", "No AI provider is configured.");
    }
}
