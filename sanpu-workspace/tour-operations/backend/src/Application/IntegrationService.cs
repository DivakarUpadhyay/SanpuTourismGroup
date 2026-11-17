using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Erp.Domain;

namespace Divakar.Sanpu.Erp.Application;

public sealed record WebhookEnvelope(string? Timestamp, string? Signature, string? IdempotencyKey, string? CorrelationId, string RawBody);
public sealed record WebhookResult(long EventId, string Outcome, string Status, string? Error);

/// <summary>Supplier / OTA integration: signed webhooks with idempotency, payload validation, PII redaction, retry with backoff and dead-lettering.
/// No live supplier is connected; LocalMock and Webhook suppliers are fictional and clearly labeled.</summary>
public sealed class IntegrationService(IErpRepository repo, ISecretStore secrets, ISettings settings, IClock clock, ICurrentUser current)
{
    private static readonly string[] SensitiveKeys = ["phone", "passport", "email", "idNumber", "cardNumber", "name"];

    public async Task<WebhookResult> ReceiveAsync(string supplierCode, WebhookEnvelope env, CancellationToken ct)
    {
        var supplier = await repo.SupplierByCodeAsync(supplierCode, ct);
        if (supplier is null || !supplier.IsActive) throw AppException.NotFound("Supplier");
        if (supplier.AdapterType != "Webhook") throw AppException.Conflict("adapter_not_webhook", "This supplier is not configured for webhooks.");
        var secret = secrets.Get(supplier.WebhookSecretRef ?? "") ?? throw new AppException(503, "supplier_not_configured", "The webhook secret is not configured on the server.");
        var tolerance = await settings.GetIntAsync("Integration.SignatureToleranceSeconds", 300, ct);
        if (!long.TryParse(env.Timestamp, out var ts) || !WebhookSignature.Verify(secret, ts, env.RawBody, env.Signature, new DateTimeOffset(clock.UtcNow), tolerance))
            throw new AppException(401, "invalid_signature", "Signature or timestamp is not valid.");
        return await IngestAndProcessAsync(supplier.SupplierId, env, ct);
    }

    /// <summary>LOCAL MOCK supplier: builds and signs an event exactly like a partner would, then runs the same pipeline. For demos and contract tests only.</summary>
    public async Task<WebhookResult> MockSendAsync(MockSupplierEventRequest r, CancellationToken ct)
    {
        var supplier = await repo.SupplierByCodeAsync(r.SupplierCode, ct) ?? throw AppException.NotFound("Supplier");
        var body = JsonSerializer.Serialize(new { eventType = r.EventType, data = r.Payload, source = "LOCAL MOCK" });
        var env = new WebhookEnvelope(null, null, r.IdempotencyKey, "mock-" + Guid.NewGuid().ToString("N")[..12], body);
        if (supplier.AdapterType == "Webhook")
        {
            var secret = secrets.Get(supplier.WebhookSecretRef ?? "") ?? throw new AppException(503, "supplier_not_configured", "The webhook secret is not configured on the server.");
            var ts = new DateTimeOffset(clock.UtcNow).ToUnixTimeSeconds();
            return await ReceiveAsync(r.SupplierCode, env with { Timestamp = ts.ToString(), Signature = WebhookSignature.Compute(secret, ts, body) }, ct);
        }
        if (supplier.AdapterType != "LocalMock") throw AppException.Conflict("adapter_live_pending", "Live adapters are PENDING credentials; the mock cannot impersonate them.");
        return await IngestAndProcessAsync(supplier.SupplierId, env, ct);
    }

    private async Task<WebhookResult> IngestAndProcessAsync(int supplierId, WebhookEnvelope env, CancellationToken ct)
    {
        if (!Regex.IsMatch(env.IdempotencyKey ?? "", "^[A-Za-z0-9\\-_.]{6,100}$")) throw AppException.Validation("idempotencyKey", "Send X-Idempotency-Key (6–100 characters).");
        JsonObject root;
        try { root = JsonNode.Parse(env.RawBody) as JsonObject ?? throw new JsonException(); }
        catch (JsonException) { throw new AppException(422, "malformed_payload", "The body must be a JSON object."); }
        var eventType = root["eventType"]?.GetValue<string>();
        if (eventType is null || !SupplierEvents.Known.Contains(eventType)) throw new AppException(422, "unknown_event_type", "Unknown or missing eventType.");
        Redact(root);
        var correlation = Regex.IsMatch(env.CorrelationId ?? "", "^[A-Za-z0-9\\-]{6,64}$") ? env.CorrelationId! : current.CorrelationId;
        var ingest = await repo.IngestEventAsync(supplierId, eventType, env.IdempotencyKey!, correlation, root.ToJsonString(), ct);
        if (ingest.Outcome == "duplicate") return new WebhookResult(ingest.EventId, "duplicate", ingest.Status, null);
        var marked = await ProcessAsync(ingest.EventId, ct);
        return new WebhookResult(ingest.EventId, "accepted", marked.Status, marked.Status == "Processed" ? null : "processing failed; will retry");
    }

    public async Task<MarkResultRow> ProcessAsync(long eventId, CancellationToken ct)
    {
        var e = await repo.GetEventAsync(eventId, ct) ?? throw AppException.NotFound("Integration event");
        var max = await settings.GetIntAsync("Integration.MaxAttempts", 5, ct);
        string? error = null;
        try
        {
            var data = (JsonNode.Parse(e.PayloadJson) as JsonObject)?["data"] as JsonObject ?? throw new AppException(422, "malformed_payload", "data object missing");
            switch (e.EventType)
            {
                case SupplierEvents.StatementIssued:
                    var period = data["period"]?.GetValue<string>();
                    var amount = data["amount"]?.GetValue<decimal>();
                    if (period is null || !Regex.IsMatch(period, "^20[0-9]{2}-(0[1-9]|1[0-2])$") || amount is null or < 0) throw new AppException(422, "malformed_payload", "period (YYYY-MM) and amount >= 0 are required");
                    await repo.ApplyStatementAsync(e.SupplierId, period, amount.Value, ct);
                    break;
                case SupplierEvents.AllotmentUpdated:
                    var (tour, date) = TourDate(data);
                    var capacity = data["capacity"]?.GetValue<int>() ?? throw new AppException(422, "malformed_payload", "capacity is required");
                    await repo.ApplyAllotmentAsync(tour, date, capacity, ct);
                    break;
                case SupplierEvents.VehicleCancelled:
                    var (t2, d2) = TourDate(data);
                    await repo.CreateTaskAsync($"Supplier {e.SupplierCode} cancelled a vehicle for {t2} on {d2:yyyy-MM-dd}", "Exception", "Departure", t2, "High", 2, ct);
                    break;
            }
        }
        catch (AppException ex) { error = $"{ex.Code}: {ex.Message}"; }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException or FormatException) { error = "malformed_payload: " + ex.Message; }
        return await repo.MarkEventAsync(eventId, error is null, error, max, ct) ?? throw AppException.NotFound("Integration event");
    }

    public async Task<MarkResultRow> RetryAsync(long eventId, CancellationToken ct)
    {
        var e = await repo.GetEventAsync(eventId, ct) ?? throw AppException.NotFound("Integration event");
        if (e.Status is not ("Failed" or "DeadLetter")) throw AppException.Conflict("invalid_state", "Only failed events can be retried.");
        return await ProcessAsync(eventId, ct);
    }

    public async Task<int> RetryDueAsync(CancellationToken ct)
    {
        var due = await repo.DueRetriesAsync(20, ct);
        foreach (var id in due) await ProcessAsync(id, ct);
        return due.Count;
    }

    public async Task<PagedResult<IntegrationEventRow>> ListAsync(string? status, int? supplierId, int? page, int? size, CancellationToken ct)
    {
        var (p, s) = Paging.Clamp(page, size);
        var rows = await repo.EventsAsync(status, supplierId, p, s, ct);
        return new PagedResult<IntegrationEventRow>(rows, rows.FirstOrDefault()?.Total ?? 0, p, s);
    }

    private static (string Tour, DateTime Date) TourDate(JsonObject data)
    {
        var tour = data["tourCode"]?.GetValue<string>();
        var date = data["departureDate"]?.GetValue<string>();
        if (tour is null || !Regex.IsMatch(tour, "^[A-Z0-9\\-]{3,30}$") || !DateTime.TryParseExact(date, "yyyy-MM-dd", null, System.Globalization.DateTimeStyles.None, out var d))
            throw new AppException(422, "malformed_payload", "tourCode and departureDate (YYYY-MM-DD) are required");
        return (tour, d);
    }

    /// <summary>Removes personal fields before the payload is stored (partners sometimes send more than we need).</summary>
    public static int Redact(JsonNode? node)
    {
        var count = 0;
        if (node is JsonObject obj)
        {
            foreach (var key in obj.Select(kv => kv.Key).ToList())
            {
                if (SensitiveKeys.Any(k => key.Contains(k, StringComparison.OrdinalIgnoreCase))) { obj[key] = "[redacted]"; count++; }
                else count += Redact(obj[key]);
            }
        }
        else if (node is JsonArray arr) foreach (var item in arr) count += Redact(item);
        return count;
    }
}
