using System.Security.Cryptography;
using System.Text;

namespace Divakar.Sanpu.Erp.Domain;

public static class BookingStatus
{
    public const string Pending = "Pending", Confirmed = "Confirmed", Rejected = "Rejected", CancelRequested = "CancelRequested", Cancelled = "Cancelled";

    /// <summary>Allowed staff/customer actions per status. The stored procedures enforce the same rules (defence in depth).</summary>
    public static IReadOnlyList<string> AllowedActions(string status, string paymentStatus) => status switch
    {
        Pending => ["approve", "reject", "cancel"],
        Confirmed => paymentStatus == "Paid" ? ["cancel", "refund"] : ["cancel", "payment", "refund"],
        CancelRequested => ["cancel", "refund"],
        Cancelled => paymentStatus is "Paid" or "PartiallyPaid" or "PartiallyRefunded" ? ["refund"] : [],
        _ => []
    };

    public static bool CanCustomerCancel(string status) => status is Pending or Confirmed;
}

public sealed record VehicleOption(string Code, string Name, int Seats, decimal CostPerDay);

public sealed record CostAssumptions(decimal GuideCostPerDay, decimal MealCostPerPaxDay, decimal HotelCostPerPaxNight, decimal InsurancePerPax, decimal OverheadPct);

public sealed record GroupPlanOption(string OptionKey, string Description, IReadOnlyDictionary<string, int> Vehicles, int Seats, int VehicleCount,
    decimal VehicleCost, decimal GuideCost, decimal MealCost, decimal HotelCost, decimal InsuranceCost, decimal Overhead, decimal TotalCost,
    decimal Revenue, decimal Margin, decimal MarginPct, bool MeetsTarget);

/// <summary>Group assembly: finds vehicle combinations that seat everyone and prices each one with the cost assumptions.
/// Pure and deterministic, so the saved result can be reproduced from the saved inputs.</summary>
public static class GroupPlanner
{
    public static IReadOnlyList<GroupPlanOption> Plan(int pax, int days, decimal revenue, IReadOnlyList<VehicleOption> vehicles, CostAssumptions costs, decimal targetMarginPct, int maxOptions = 5)
    {
        if (pax <= 0) throw new ArgumentException("There are no passengers on this departure yet.", nameof(pax));
        if (days <= 0) throw new ArgumentException("Days must be positive.", nameof(days));
        var usable = vehicles.Where(v => v.Seats > 0).ToList();
        if (usable.Count == 0) throw new ArgumentException("No vehicle types are configured.", nameof(vehicles));

        var combos = new Dictionary<string, Dictionary<string, int>>();
        void Add(Dictionary<string, int> c)
        {
            var clean = c.Where(kv => kv.Value > 0).OrderBy(kv => kv.Key).ToDictionary(kv => kv.Key, kv => kv.Value);
            if (clean.Count == 0 || clean.Sum(kv => usable.First(v => v.Code == kv.Key).Seats * kv.Value) < pax) return;
            combos.TryAdd(string.Join("+", clean.Select(kv => $"{kv.Value}x{kv.Key}")), clean);
        }
        foreach (var a in usable) Add(new() { [a.Code] = Ceil(pax, a.Seats) });
        foreach (var a in usable)
            foreach (var b in usable.Where(b => b.Code != a.Code))
                for (var na = 1; na * a.Seats < pax; na++)
                    Add(new() { [a.Code] = na, [b.Code] = Ceil(pax - na * a.Seats, b.Seats) });

        var nights = Math.Max(0, days - 1);
        return combos.Select(kv =>
        {
            var vehicleCount = kv.Value.Values.Sum();
            var seats = kv.Value.Sum(x => usable.First(v => v.Code == x.Key).Seats * x.Value);
            var vehicleCost = kv.Value.Sum(x => usable.First(v => v.Code == x.Key).CostPerDay * x.Value) * days;
            var guide = costs.GuideCostPerDay * vehicleCount * days;
            var meals = costs.MealCostPerPaxDay * pax * days;
            var hotel = costs.HotelCostPerPaxNight * pax * nights;
            var insurance = costs.InsurancePerPax * pax;
            var overhead = Math.Round(revenue * costs.OverheadPct / 100m, 2);
            var total = vehicleCost + guide + meals + hotel + insurance + overhead;
            var margin = revenue - total;
            var pct = revenue == 0 ? 0 : Math.Round(margin / revenue * 100m, 2);
            var desc = string.Join(" + ", kv.Value.Select(x => $"{x.Value} × {usable.First(v => v.Code == x.Key).Name}"));
            return new GroupPlanOption(kv.Key, desc, kv.Value, seats, vehicleCount, vehicleCost, guide, meals, hotel, insurance, overhead, total, revenue, margin, pct, pct >= targetMarginPct);
        })
        .OrderByDescending(o => o.Margin).ThenBy(o => o.VehicleCount).ThenBy(o => o.OptionKey, StringComparer.Ordinal)
        .Take(maxOptions).ToList();
    }

    private static int Ceil(int a, int b) => (a + b - 1) / b;
}

/// <summary>Supplier webhook signature: hex HMAC-SHA256 over "{unixTimestamp}.{rawBody}" with the supplier's shared secret.</summary>
public static class WebhookSignature
{
    public static string Compute(string secret, long timestamp, string body) =>
        Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{timestamp}.{body}"))).ToLowerInvariant();

    public static bool Verify(string secret, long timestamp, string body, string? signature, DateTimeOffset now, int toleranceSeconds)
    {
        if (string.IsNullOrWhiteSpace(signature) || Math.Abs(now.ToUnixTimeSeconds() - timestamp) > toleranceSeconds) return false;
        var expected = Encoding.ASCII.GetBytes(Compute(secret, timestamp, body));
        var given = Encoding.ASCII.GetBytes(signature.Trim().ToLowerInvariant());
        return CryptographicOperations.FixedTimeEquals(expected, given);
    }
}

/// <summary>Supported supplier events. Payloads are validated before anything touches the database.</summary>
public static class SupplierEvents
{
    public const string StatementIssued = "statement.issued", AllotmentUpdated = "allotment.updated", VehicleCancelled = "vehicle.cancelled";
    public static readonly IReadOnlySet<string> Known = new HashSet<string> { StatementIssued, AllotmentUpdated, VehicleCancelled };
}
