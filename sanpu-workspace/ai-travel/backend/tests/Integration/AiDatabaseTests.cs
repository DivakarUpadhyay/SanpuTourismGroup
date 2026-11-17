using System.Diagnostics;
using System.Text.Json;
using Dapper;
using Divakar.Sanpu.AiOps.Application;
using Divakar.Sanpu.AiOps.Domain;
using Divakar.Sanpu.AiOps.Infrastructure;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Infrastructure;
using Microsoft.Data.SqlClient;

namespace Divakar.Sanpu.AiOps.IntegrationTests;

/// <summary>Disposable SanpuAiOps_Test database built from the real scripts. Requires SANPU_SQL_SERVER.</summary>
public sealed class AiDbFixture
{
    public const string Database = "SanpuAiOps_Test";
    public string Server { get; } = Environment.GetEnvironmentVariable("SANPU_SQL_SERVER") ?? throw new InvalidOperationException("Set SANPU_SQL_SERVER to run integration tests.");
    public string ConnectionString => $"Server={Server};Database={Database};Integrated Security=True;TrustServerCertificate=True;Encrypt=True";
    public AiOpsRepository Repo { get; }

    public AiDbFixture()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "..", ".."));
        var psi = new ProcessStartInfo("powershell", $"-NoProfile -ExecutionPolicy Bypass -File \"{Path.Combine(root, "scripts", "db-setup.ps1")}\" -App ai -Database {Database} -Server \"{Server}\" -Reset")
        { RedirectStandardOutput = true, RedirectStandardError = true };
        using var p = Process.Start(psi)!;
        var output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
        p.WaitForExit();
        if (p.ExitCode != 0) throw new InvalidOperationException("db-setup failed:\n" + output);
        Repo = new AiOpsRepository(new Db(new DbOptions(ConnectionString)));
    }

    public async Task<T> Scalar<T>(string sql, object? args = null)
    {
        await using var c = new SqlConnection(ConnectionString);
        return await c.ExecuteScalarAsync<T>(sql, args) ?? default!;
    }

    public Task<Guid> UserId(string email) => Scalar<Guid>("SELECT UserId FROM dbo.Users WHERE NormalizedEmail = @e", new { e = email });
}

[CollectionDefinition("ai-db")] public sealed class AiDbCollection : ICollectionFixture<AiDbFixture>;

[Collection("ai-db")]
public sealed class AiDatabaseTests(AiDbFixture fx)
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    /// <summary>Runs simulate → plan → validate → save, exactly like RecoveryService (without the model).</summary>
    private async Task<(int ProposalId, string NewItemsJson)> ProposeAsync(string tripName, string scenarioCode, Guid agent)
    {
        var tripId = await fx.Scalar<int>("SELECT TripId FROM dbo.Trips WHERE Name = @n", new { n = tripName });
        var scenarioId = await fx.Scalar<int>("SELECT ScenarioId FROM dbo.DisruptionScenarios WHERE Code = @c", new { c = scenarioCode });
        var inputs = await fx.Repo.SimInputsAsync(tripId, scenarioId, default);
        var items = inputs.Items.Select(i => new PlanItem(i.ItemKey, i.DayNo, TimeOnly.Parse(i.StartTime), i.DurationMin, i.PlaceId, i.Title, i.Category, i.DependsOnItemKey, i.Status, i.CostPerPax)).ToList();
        var places = inputs.Places.Select(p => new PlaceInfo(p.PlaceId, p.PlaceCode, p.PlaceName, p.Category, TimeOnly.Parse(p.OpenTime), TimeOnly.Parse(p.CloseTime), p.WheelchairAccessible, p.CostPerPax, p.SupplierName)).ToDictionary(p => p.PlaceId);
        var scenario = new Scenario(inputs.Scenario!.Code, inputs.Scenario.Name, inputs.Scenario.AffectedCategories.Split(',').ToHashSet(), inputs.Scenario.Effect, inputs.Scenario.DelayMinutes, inputs.Scenario.DayNo);
        var trip = new TripProfile(inputs.Trip!.Pax, inputs.Trip.Pace, inputs.Trip.MobilityNeeds, inputs.Trip.BudgetPerPax);
        var impacts = DisruptionSimulator.Simulate(items, scenario, places);
        var simId = await fx.Repo.SaveSimulationAsync(tripId, inputs.Trip.VersionId!.Value, scenarioId, JsonSerializer.Serialize(impacts, Web), impacts.Count, agent, "it", default);
        var changes = RecoveryPlanner.Plan(items, impacts, scenario, places.Values.ToList(), trip);
        var checks = ProposalValidator.Validate(items, changes, places, trip, [], scenario);
        var saved = await fx.Repo.SaveProposalAsync(simId, tripId, inputs.Trip.VersionId.Value, JsonSerializer.Serialize(changes, Web), "it", "Deterministic", JsonSerializer.Serialize(checks, Web), 0, null, agent, "it", default);
        var newItems = JsonSerializer.Serialize(RecoveryPlanner.Apply(items, changes, places).Select(i => new
        {
            itemKey = i.ItemKey, dayNo = i.DayNo, startTime = i.StartTime.ToString("HH:mm"), durationMin = i.DurationMin, placeId = i.PlaceId, title = i.Title,
            category = i.Category, dependsOnItemKey = i.DependsOnItemKey, status = i.Status, costPerPax = i.CostPerPax
        }));
        return (saved.ProposalId, newItems);
    }

    [Fact]
    public async Task Approval_creates_a_new_version_and_the_proposer_cannot_approve()
    {
        var agent = await fx.UserId("ops.agent@demo.sanpu.test");
        var sup = await fx.UserId("supervisor@demo.sanpu.test");
        var (id, items) = await ProposeAsync("Tainan food weekend", "RAIN-TNN", agent);
        var self = await Assert.ThrowsAsync<AppException>(() => fx.Repo.DecideProposalAsync(id, "Approved", null, items, null, agent, "it", default));
        Assert.Equal("self_approval", self.Code);
        var result = await fx.Repo.DecideProposalAsync(id, "Approved", "ok", items, null, sup, "it", default);
        Assert.Equal("Approved", result!.Status);
        Assert.Equal(2, result.CurrentVersion);
        Assert.Equal("Recovery", await fx.Scalar<string>("SELECT v.Source FROM dbo.ItineraryVersions v JOIN dbo.Trips t ON t.TripId = v.TripId WHERE t.Name = 'Tainan food weekend' AND v.VersionNo = 2"));
        Assert.Equal(0, await fx.Scalar<int>("""
            SELECT COUNT(*) FROM dbo.ItineraryItems i JOIN dbo.ItineraryVersions v ON v.VersionId = i.VersionId JOIN dbo.Trips t ON t.TripId = v.TripId
            WHERE t.Name = 'Tainan food weekend' AND v.VersionNo = 2 AND i.Category = 'Outdoor' AND i.Status <> 'Cancelled'
            """));
    }

    [Fact]
    public async Task Proposal_on_an_old_version_is_rejected_as_stale()
    {
        var agent = await fx.UserId("ops.agent@demo.sanpu.test");
        var sup = await fx.UserId("supervisor@demo.sanpu.test");
        var (first, items1) = await ProposeAsync("Wheelchair-friendly Hualien", "TYPHOON-E", agent);
        var tripId = await fx.Scalar<int>("SELECT TripId FROM dbo.Trips WHERE Name = 'Wheelchair-friendly Hualien'");
        // someone saves a new version meanwhile
        await fx.Repo.SaveVersionAsync(tripId, "Template", "manual change", items1, null, sup, "it", default);
        var ex = await Assert.ThrowsAsync<AppException>(() => fx.Repo.DecideProposalAsync(first, "Approved", null, items1, null, sup, "it", default));
        Assert.Equal("stale_version", ex.Code);
    }

    [Fact]
    public async Task Rejection_requires_a_comment()
    {
        var agent = await fx.UserId("ops.agent@demo.sanpu.test");
        var sup = await fx.UserId("supervisor@demo.sanpu.test");
        var (id, _) = await ProposeAsync("Hualien with parents", "COACH-BREAKDOWN", agent);
        var ex = await Assert.ThrowsAsync<AppException>(() => fx.Repo.DecideProposalAsync(id, "Rejected", " ", null, null, sup, "it", default));
        Assert.Equal("comment_required", ex.Code);
    }

    [Fact]
    public async Task Search_is_scoped_to_the_callers_own_trips()
    {
        var lee = await fx.UserId("traveler.lee@demo.sanpu.test");
        var chen = await fx.UserId("traveler.chen@demo.sanpu.test");
        var all = new SearchFilter(null, null, null, null, null, null);
        var leeRows = await fx.Repo.SearchTripsAsync(lee, false, all, null, default);
        Assert.NotEmpty(leeRows);
        Assert.All(leeRows, r => Assert.NotEqual("Hualien with parents", r.Name));   // Chen's trip
        Assert.Null(await fx.Repo.GetTripAsync(leeRows[0].TripId, chen, null, default));     // and Chen cannot open Lee's
        var staffRows = await fx.Repo.SearchTripsAsync(lee, true, all, null, default);
        Assert.True(staffRows.Count > leeRows.Count);
    }

    [Fact]
    public async Task Document_accept_needs_a_trip_and_stores_reviewed_values()
    {
        var agent = await fx.UserId("ops.agent@demo.sanpu.test");
        var sup = await fx.UserId("supervisor@demo.sanpu.test");
        var doc = await fx.Repo.CreateDocumentAsync("it.txt", Guid.NewGuid().ToString("N") + ".txt", "text/plain", 10, new string('a', 64), "HotelConfirmation", "Hotel: X", 0,
            """[{"fieldName":"hotelName","value":"X","confidence":0.9,"method":"Rule","spanStart":7,"spanLength":1}]""", agent, "it", default);
        var ex = await Assert.ThrowsAsync<AppException>(() => fx.Repo.ReviewDocumentAsync(doc.DocumentId, "Accepted", null, null, null, null, sup, "it", default));
        Assert.Equal("trip_required", ex.Code);
        var trip = await fx.Scalar<int>("SELECT TOP 1 TripId FROM dbo.Trips");
        await fx.Repo.ReviewDocumentAsync(doc.DocumentId, "Accepted", trip, """[{"fieldName":"hotelName","reviewedValue":"X Hotel"}]""", null, null, sup, "it", default);
        Assert.Equal("X Hotel", await fx.Scalar<string>("SELECT ReviewedValue FROM dbo.DocumentFields WHERE DocumentId = @d", new { d = doc.DocumentId }));
    }

    [Fact]
    public async Task Prompt_versions_are_append_only()
    {
        var eng = await fx.UserId("ai.engineer@demo.sanpu.test");
        var before = await fx.Scalar<int>("SELECT MAX(Version) FROM dbo.PromptTemplates WHERE PromptKey = 'search.parse'");
        await fx.Repo.SavePromptAsync("search.parse", "v-next {{regions}} {{question}}", eng, "it", default);
        Assert.Equal(before + 1, (await fx.Repo.ActivePromptAsync("search.parse", default))!.Version);
        Assert.Equal(before + 1, await fx.Scalar<int>("SELECT COUNT(*) FROM dbo.PromptTemplates WHERE PromptKey = 'search.parse'"));
    }
}
