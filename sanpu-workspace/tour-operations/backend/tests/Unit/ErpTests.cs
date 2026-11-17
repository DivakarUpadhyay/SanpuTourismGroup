using System.Text.Json.Nodes;
using Divakar.Sanpu.Erp.Application;
using Divakar.Sanpu.Erp.Domain;

namespace Divakar.Sanpu.Erp.UnitTests;

public class GroupPlannerTests
{
    private static readonly VehicleOption[] Vehicles =
    [
        new("COACH-43", "43-seat coach", 43, 18000), new("COACH-33", "33-seat coach", 33, 15000),
        new("MINI-20", "20-seat minibus", 20, 9500), new("VAN-9", "9-seat van", 9, 5200)
    ];
    private static readonly CostAssumptions Costs = new(3500, 650, 1900, 180, 6);

    [Fact]
    public void Every_option_seats_everyone_and_options_are_sorted_by_margin()
    {
        var options = GroupPlanner.Plan(36, 3, 460_800, Vehicles, Costs, 15);
        Assert.NotEmpty(options);
        Assert.All(options, o => Assert.True(o.Seats >= 36));
        Assert.Equal(options.OrderByDescending(o => o.Margin).Select(o => o.OptionKey), options.Select(o => o.OptionKey));
        Assert.Equal("1xCOACH-43", options[0].OptionKey);
    }

    [Fact]
    public void Cost_breakdown_adds_up()
    {
        var o = GroupPlanner.Plan(36, 3, 460_800, Vehicles, Costs, 15)[0];
        Assert.Equal(18000 * 3, o.VehicleCost);
        Assert.Equal(3500 * 1 * 3, o.GuideCost);
        Assert.Equal(650m * 36 * 3, o.MealCost);
        Assert.Equal(1900m * 36 * 2, o.HotelCost);
        Assert.Equal(o.VehicleCost + o.GuideCost + o.MealCost + o.HotelCost + o.InsuranceCost + o.Overhead, o.TotalCost);
        Assert.Equal(Math.Round((o.Revenue - o.TotalCost) / o.Revenue * 100, 2), o.MarginPct);
    }

    [Fact]
    public void Is_deterministic() =>
        Assert.Equal(GroupPlanner.Plan(25, 2, 200_000, Vehicles, Costs, 10), GroupPlanner.Plan(25, 2, 200_000, Vehicles, Costs, 10), new OptionComparer());

    [Fact]
    public void Rejects_empty_departures() => Assert.Throws<ArgumentException>(() => GroupPlanner.Plan(0, 2, 0, Vehicles, Costs, 10));

    private sealed class OptionComparer : IEqualityComparer<GroupPlanOption>
    {
        public bool Equals(GroupPlanOption? x, GroupPlanOption? y) => x!.OptionKey == y!.OptionKey && x.TotalCost == y.TotalCost && x.MarginPct == y.MarginPct;
        public int GetHashCode(GroupPlanOption o) => o.OptionKey.GetHashCode();
    }
}

public class WebhookSignatureTests
{
    private const string Secret = "test-secret-value-32-bytes-long!!";

    [Fact]
    public void Accepts_a_correctly_signed_fresh_request()
    {
        var now = DateTimeOffset.UtcNow;
        var ts = now.ToUnixTimeSeconds();
        var body = "{\"eventType\":\"statement.issued\"}";
        Assert.True(WebhookSignature.Verify(Secret, ts, body, WebhookSignature.Compute(Secret, ts, body), now, 300));
    }

    [Fact]
    public void Rejects_tampered_body_wrong_secret_and_old_timestamp()
    {
        var now = DateTimeOffset.UtcNow;
        var ts = now.ToUnixTimeSeconds();
        var sig = WebhookSignature.Compute(Secret, ts, "{\"amount\":1}");
        Assert.False(WebhookSignature.Verify(Secret, ts, "{\"amount\":999}", sig, now, 300));
        Assert.False(WebhookSignature.Verify("other-secret", ts, "{\"amount\":1}", sig, now, 300));
        Assert.False(WebhookSignature.Verify(Secret, ts, "{\"amount\":1}", sig, now.AddMinutes(10), 300));   // replay window passed
        Assert.False(WebhookSignature.Verify(Secret, ts, "{\"amount\":1}", null, now, 300));
    }
}

public class BookingRulesTests
{
    [Theory]
    [InlineData("Pending", "Unpaid", new[] { "approve", "reject", "cancel" })]
    [InlineData("Confirmed", "Unpaid", new[] { "cancel", "payment", "refund" })]
    [InlineData("Confirmed", "Paid", new[] { "cancel", "refund" })]
    [InlineData("Rejected", "Unpaid", new string[0])]
    [InlineData("Cancelled", "Paid", new[] { "refund" })]
    public void Allowed_actions_follow_the_state_machine(string status, string payment, string[] expected) =>
        Assert.Equal(expected, BookingStatus.AllowedActions(status, payment));

    [Fact]
    public void Customers_can_cancel_only_pending_or_confirmed()
    {
        Assert.True(BookingStatus.CanCustomerCancel("Pending"));
        Assert.True(BookingStatus.CanCustomerCancel("Confirmed"));
        Assert.False(BookingStatus.CanCustomerCancel("CancelRequested"));
        Assert.False(BookingStatus.CanCustomerCancel("Rejected"));
    }
}

public class PayloadRedactionTests
{
    [Fact]
    public void Removes_personal_fields_at_any_depth()
    {
        var node = JsonNode.Parse("""{"eventType":"x","data":{"guestName":"Chen","phone":"+886912345678","rooms":[{"passportNo":"A1"}],"amount":5}}""");
        var count = IntegrationService.Redact(node);
        Assert.Equal(3, count);
        var json = node!.ToJsonString();
        Assert.DoesNotContain("+886912345678", json);
        Assert.DoesNotContain("Chen", json);
        Assert.Contains("\"amount\":5", json);
    }
}
