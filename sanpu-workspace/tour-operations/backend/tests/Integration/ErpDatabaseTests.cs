using System.Diagnostics;
using Dapper;
using Divakar.Sanpu.Core.Application;
using Divakar.Sanpu.Core.Infrastructure;
using Divakar.Sanpu.Erp.Application;
using Divakar.Sanpu.Erp.Infrastructure;
using Microsoft.Data.SqlClient;

namespace Divakar.Sanpu.Erp.IntegrationTests;

/// <summary>Builds a disposable SanpuErp_Test database from the real migration, procedure and seed scripts (SQL Server must be reachable;
/// set SANPU_SQL_SERVER, e.g. ".\SQLEXPRESS"). Nothing here is mocked.</summary>
public sealed class ErpDbFixture : IDisposable
{
    public const string Database = "SanpuErp_Test";
    public string Server { get; } = Environment.GetEnvironmentVariable("SANPU_SQL_SERVER") ?? throw new InvalidOperationException("Set SANPU_SQL_SERVER to run integration tests.");
    public string ConnectionString => $"Server={Server};Database={Database};Integrated Security=True;TrustServerCertificate=True;Encrypt=True";
    public Db Db { get; }
    public ErpRepository Repo { get; }

    public ErpDbFixture()
    {
        RunSetup(reset: true);
        Db = new Db(new DbOptions(ConnectionString));
        Repo = new ErpRepository(Db);
    }

    public void RunSetup(bool reset)
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "..", ".."));
        var script = Path.Combine(root, "scripts", "db-setup.ps1");
        var psi = new ProcessStartInfo("powershell", $"-NoProfile -ExecutionPolicy Bypass -File \"{script}\" -App erp -Database {Database} -Server \"{Server}\"{(reset ? " -Reset" : "")}")
        { RedirectStandardOutput = true, RedirectStandardError = true };
        using var p = Process.Start(psi)!;
        var output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
        p.WaitForExit();
        if (p.ExitCode != 0) throw new InvalidOperationException("db-setup failed:\n" + output);
    }

    public async Task<T> Scalar<T>(string sql, object? args = null)
    {
        await using var c = new SqlConnection(ConnectionString);
        return await c.ExecuteScalarAsync<T>(sql, args) ?? default!;
    }

    public async Task<Guid> UserId(string email) => await Scalar<Guid>("SELECT UserId FROM dbo.Users WHERE NormalizedEmail = @e", new { e = email });

    public void Dispose() { }
}

[CollectionDefinition("erp-db")] public sealed class ErpDbCollection : ICollectionFixture<ErpDbFixture>;

[Collection("erp-db")]
public sealed class ErpDatabaseTests(ErpDbFixture fx)
{
    private async Task<int> NewDepartureAsync(int capacity)
    {
        var tour = await fx.Scalar<int>("SELECT TourId FROM dbo.Tours WHERE Code = 'TW-TNN-2D'");
        var actor = await fx.UserId("admin@demo.sanpu.test");
        return await fx.Repo.UpsertDepartureAsync(null, new DepartureRequest(tour, DateTime.UtcNow.Date.AddDays(100 + Random.Shared.Next(1, 600)), capacity, 7400, "Open", null), actor, "it", default);
    }

    [Fact]
    public async Task Seeds_are_idempotent()
    {
        string counts = "SELECT CONCAT((SELECT COUNT(*) FROM dbo.Bookings),'|',(SELECT COUNT(*) FROM dbo.Menus),'|',(SELECT COUNT(*) FROM dbo.RolePermissions),'|',(SELECT COUNT(*) FROM dbo.AppSettings),'|',(SELECT COUNT(*) FROM dbo.Tours),'|',(SELECT COUNT(*) FROM dbo.WorkflowDefinitions))";
        var before = await fx.Scalar<string>(counts);
        fx.RunSetup(reset: false);
        Assert.Equal(before, await fx.Scalar<string>(counts));
    }

    [Fact]
    public async Task Final_seat_goes_to_exactly_one_of_many_concurrent_buyers()
    {
        var dep = await NewDepartureAsync(capacity: 1);
        var buyers = new[] { await fx.UserId("traveler.chen@demo.sanpu.test"), await fx.UserId("traveler.lee@demo.sanpu.test") };
        var attempts = Enumerable.Range(0, 12).Select(async i =>
        {
            try { await fx.Repo.CreateHoldAsync(dep, buyers[i % 2], 1, $"race-{dep}-{i}", 15, "it", default); return "ok"; }
            catch (AppException ex) { return ex.Code; }
        });
        var results = await Task.WhenAll(attempts);
        Assert.Equal(1, results.Count(r => r == "ok"));
        Assert.All(results.Where(r => r != "ok"), r => Assert.Equal("insufficient_capacity", r));
        Assert.Equal(1, await fx.Scalar<int>("SELECT SeatsHeld FROM dbo.Departures WHERE DepartureId = @dep", new { dep }));
    }

    [Fact]
    public async Task Same_idempotency_key_returns_the_same_hold()
    {
        var dep = await NewDepartureAsync(5);
        var user = await fx.UserId("traveler.chen@demo.sanpu.test");
        var a = await fx.Repo.CreateHoldAsync(dep, user, 2, $"idem-{dep}", 15, "it", default);
        var b = await fx.Repo.CreateHoldAsync(dep, user, 2, $"idem-{dep}", 15, "it", default);
        Assert.Equal(a.HoldId, b.HoldId);
        Assert.Equal(2, await fx.Scalar<int>("SELECT SeatsHeld FROM dbo.Departures WHERE DepartureId = @dep", new { dep }));
    }

    [Fact]
    public async Task Booking_lifecycle_moves_seats_and_writes_history_and_audit()
    {
        var dep = await NewDepartureAsync(4);
        var chen = await fx.UserId("traveler.chen@demo.sanpu.test");
        var ops = await fx.UserId("ops.manager@demo.sanpu.test");
        var hold = await fx.Repo.CreateHoldAsync(dep, chen, 2, $"life-{dep}", 15, "it", default);
        var booking = await fx.Repo.CreateBookingFromHoldAsync(hold.HoldId, chen, "IT Lead", null, null, null, null, null, "it", default);
        Assert.Equal("Pending", booking.Status);
        // the customer is not the approver role, and cannot approve
        var notApprover = await Assert.ThrowsAsync<AppException>(() => fx.Repo.DecideBookingAsync(booking.BookingId, "Approved", null, chen, "it", default));
        Assert.Equal("self_approval", notApprover.Code);
        await fx.Repo.DecideBookingAsync(booking.BookingId, "Approved", "ok", ops, "it", default);
        Assert.Equal("2|0", await fx.Scalar<string>("SELECT CONCAT(SeatsSold,'|',SeatsHeld) FROM dbo.Departures WHERE DepartureId = @dep", new { dep }));
        await fx.Repo.CancelBookingAsync(booking.BookingId, "IT cancel", ops, "it", default);
        Assert.Equal("0|0", await fx.Scalar<string>("SELECT CONCAT(SeatsSold,'|',SeatsHeld) FROM dbo.Departures WHERE DepartureId = @dep", new { dep }));
        Assert.Equal(3, await fx.Scalar<int>("SELECT COUNT(*) FROM dbo.BookingStatusHistory WHERE BookingId = @b", new { b = booking.BookingId }));
        Assert.True(await fx.Scalar<int>("SELECT COUNT(*) FROM dbo.AuditLogs WHERE EntityType = 'Booking' AND EntityId = @r", new { r = booking.BookingRef }) >= 3);
    }

    [Fact]
    public async Task Expired_hold_cannot_become_a_booking_and_nothing_is_written()
    {
        var dep = await NewDepartureAsync(3);
        var chen = await fx.UserId("traveler.chen@demo.sanpu.test");
        var hold = await fx.Repo.CreateHoldAsync(dep, chen, 1, $"exp-{dep}", 15, "it", default);
        await using (var c = new SqlConnection(fx.ConnectionString))
            await c.ExecuteAsync("UPDATE dbo.InventoryHolds SET ExpiresAtUtc = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE HoldId = @h", new { h = hold.HoldId });
        var ex = await Assert.ThrowsAsync<AppException>(() => fx.Repo.CreateBookingFromHoldAsync(hold.HoldId, chen, "Late", null, null, null, null, null, "it", default));
        Assert.Equal("hold_expired", ex.Code);
        Assert.Equal(0, await fx.Scalar<int>("SELECT COUNT(*) FROM dbo.Bookings WHERE HoldId = @h", new { h = hold.HoldId }));
        Assert.Equal(1, await fx.Repo.ReleaseExpiredHoldsAsync(default));
        Assert.Equal(0, await fx.Scalar<int>("SELECT SeatsHeld FROM dbo.Departures WHERE DepartureId = @dep", new { dep }));
    }

    [Fact]
    public async Task Capacity_cannot_drop_below_sold_and_held()
    {
        var dep = await NewDepartureAsync(5);
        var chen = await fx.UserId("traveler.chen@demo.sanpu.test");
        var admin = await fx.UserId("admin@demo.sanpu.test");
        await fx.Repo.CreateHoldAsync(dep, chen, 3, $"cap-{dep}", 15, "it", default);
        var tour = await fx.Scalar<int>("SELECT TourId FROM dbo.Departures WHERE DepartureId = @dep", new { dep });
        var date = await fx.Scalar<DateTime>("SELECT DepartureDate FROM dbo.Departures WHERE DepartureId = @dep", new { dep });
        var ex = await Assert.ThrowsAsync<AppException>(() => fx.Repo.UpsertDepartureAsync(dep, new DepartureRequest(tour, date, 2, 7400, "Open", null), admin, "it", default));
        Assert.Equal("capacity_below_sold", ex.Code);
    }

    [Fact]
    public async Task Group_plan_cannot_be_approved_by_its_submitter()
    {
        var ops = await fx.UserId("ops.manager@demo.sanpu.test");
        var dep = await fx.Scalar<int>("SELECT TOP 1 DepartureId FROM dbo.Departures WHERE SeatsSold > 0");
        var plan = await fx.Repo.SaveGroupPlanAsync(dep, "{}", "[]", "1xCOACH-43", 1000, 2000, 50, ops, "it", default);
        var submitted = await fx.Repo.SubmitGroupPlanAsync(plan.GroupPlanId, ops, "it", default);
        var ex = await Assert.ThrowsAsync<AppException>(() => fx.Repo.ActAsync(submitted!.ApprovalRequestId!.Value, "Approved", null, null, null, ops, "it", default));
        Assert.Equal("self_approval", ex.Code);
        Assert.Equal(403, ex.Status);
    }

    [Fact]
    public async Task Duplicate_webhook_is_counted_not_reapplied()
    {
        var sup = await fx.Scalar<int>("SELECT SupplierId FROM dbo.Suppliers WHERE Code = 'SUP-HTL-01'");
        var first = await fx.Repo.IngestEventAsync(sup, "statement.issued", "it-dup-1", "corr-it", "{\"eventType\":\"statement.issued\",\"data\":{}}", default);
        var second = await fx.Repo.IngestEventAsync(sup, "statement.issued", "it-dup-1", "corr-it", "{\"eventType\":\"statement.issued\",\"data\":{}}", default);
        Assert.Equal("new", first.Outcome);
        Assert.Equal("duplicate", second.Outcome);
        Assert.Equal(first.EventId, second.EventId);
        Assert.Equal(1, await fx.Scalar<int>("SELECT DuplicateCount FROM dbo.IntegrationEvents WHERE EventId = @id", new { id = first.EventId }));
    }

    [Fact]
    public async Task Failed_event_backs_off_then_dead_letters()
    {
        var sup = await fx.Scalar<int>("SELECT SupplierId FROM dbo.Suppliers WHERE Code = 'SUP-BUS-01'");
        var e = await fx.Repo.IngestEventAsync(sup, "allotment.updated", "it-fail-1", "corr-it", "{}", default);
        var r1 = await fx.Repo.MarkEventAsync(e.EventId, false, "boom", 3, default);
        Assert.Equal("Failed", r1!.Status);
        Assert.NotNull(r1.NextAttemptAtUtc);
        await fx.Repo.MarkEventAsync(e.EventId, false, "boom", 3, default);
        var r3 = await fx.Repo.MarkEventAsync(e.EventId, false, "boom", 3, default);
        Assert.Equal("DeadLetter", r3!.Status);
    }

    [Fact]
    public async Task Reconciliation_finds_the_seeded_mismatch_and_opens_one_task()
    {
        var fin = await fx.UserId("finance@demo.sanpu.test");
        var period = await fx.Scalar<string>("SELECT TOP 1 Period FROM dbo.SupplierStatements ORDER BY Period");
        var rows = await fx.Repo.RunReconciliationAsync(period, fin, "it", default);
        var bus = rows.Single(r => r.SupplierCode == "SUP-BUS-01");
        Assert.Equal("Mismatch", bus.Status);
        Assert.Equal(2500, bus.Difference);
        await fx.Repo.RunReconciliationAsync(period, fin, "it", default);   // rerun: still one task
        Assert.Equal(1, await fx.Scalar<int>("SELECT COUNT(*) FROM dbo.StaffTasks WHERE EntityType = 'Reconciliation' AND EntityRef = @r", new { r = "RC-" + bus.ReconId }));
        var noNote = await Assert.ThrowsAsync<AppException>(() => fx.Repo.ResolveReconciliationAsync(bus.ReconId, "accept", null, fin, "it", default));
        Assert.Equal("note_required", noNote.Code);
    }
}

[Collection("erp-db")]
public sealed class AdminSchemaTests(ErpDbFixture fx)
{
    private AdminRepository Admin => new(fx.Db);
    private AuthRepository Auth => new(fx.Db);

    [Fact]
    public async Task Menu_cycle_is_rejected_by_the_procedure()
    {
        var parent = await fx.Scalar<int>("SELECT MenuId FROM dbo.Menus WHERE MenuKey = 'grp.ops'");
        var child = await fx.Scalar<int>("SELECT MenuId FROM dbo.Menus WHERE MenuKey = 'ops.bookings'");
        var admin = await fx.UserId("admin@demo.sanpu.test");
        var ex = await Assert.ThrowsAsync<AppException>(() => Admin.UpsertMenuAsync(parent,
            new MenuUpsertRequest(child, "grp.ops", "Operations", null, "briefcase", 20, true, true, false, "Admin", null), admin, "it", default));
        Assert.Equal("menu_cycle", ex.Code);
    }

    [Fact]
    public async Task Menu_with_children_cannot_be_deleted()
    {
        var parent = await fx.Scalar<int>("SELECT MenuId FROM dbo.Menus WHERE MenuKey = 'grp.admin'");
        var admin = await fx.UserId("admin@demo.sanpu.test");
        var ex = await Assert.ThrowsAsync<AppException>(() => Admin.DeleteMenuAsync(parent, admin, "it", default));
        Assert.Equal("has_children", ex.Code);
    }

    [Fact]
    public async Task Last_system_admin_cannot_be_deactivated_or_stripped()
    {
        var admin = await fx.UserId("admin@demo.sanpu.test");
        var ops = await fx.UserId("ops.manager@demo.sanpu.test");
        // give the demo admin a password so it counts as an active admin, then try to remove it
        await using (var c = new SqlConnection(fx.ConnectionString)) await c.ExecuteAsync("UPDATE dbo.Users SET PasswordHash = 'x' WHERE UserId = @admin", new { admin });
        var ex = await Assert.ThrowsAsync<AppException>(() => Admin.UpdateUserStatusAsync(admin, "deactivate", ops, "it", default));
        Assert.Equal("last_admin", ex.Code);
        var roleId = await fx.Scalar<int>("SELECT RoleId FROM dbo.Roles WHERE RoleKey = 'system_admin'");
        var keep = (await Admin.ListRolesAsync(default)).Grants.Where(g => g.RoleId == roleId).Select(g => g.PermissionId).Skip(1).ToList();
        var ex2 = await Assert.ThrowsAsync<AppException>(() => Admin.SetRolePermissionsAsync(roleId, keep, ops, "it", default));
        Assert.Equal("last_admin", ex2.Code);
    }

    [Fact]
    public async Task Duplicate_email_is_rejected_and_rolls_back()
    {
        var admin = await fx.UserId("admin@demo.sanpu.test");
        var before = await fx.Scalar<int>("SELECT COUNT(*) FROM dbo.UserInvitations");
        var ex = await Assert.ThrowsAsync<AppException>(() => Admin.CreateUserAsync("Agent@demo.sanpu.test", "agent@demo.sanpu.test", "Dup", "Staff", [1], new byte[32], DateTime.UtcNow.AddDays(1), admin, "it", default));
        Assert.Equal("duplicate_email", ex.Code);
        Assert.Equal(before, await fx.Scalar<int>("SELECT COUNT(*) FROM dbo.UserInvitations"));
    }

    [Fact]
    public async Task Role_change_bumps_permission_version_of_members()
    {
        var agent = await fx.UserId("agent@demo.sanpu.test");
        var admin = await fx.UserId("admin@demo.sanpu.test");
        var before = await fx.Scalar<int>("SELECT PermissionVersion FROM dbo.Users WHERE UserId = @agent", new { agent });
        var roleId = await fx.Scalar<int>("SELECT RoleId FROM dbo.Roles WHERE RoleKey = 'reservations_agent'");
        var grants = (await Admin.ListRolesAsync(default)).Grants.Where(g => g.RoleId == roleId).Select(g => g.PermissionId).ToList();
        await Admin.SetRolePermissionsAsync(roleId, grants, admin, "it", default);
        Assert.Equal(before + 1, await fx.Scalar<int>("SELECT PermissionVersion FROM dbo.Users WHERE UserId = @agent", new { agent }));
    }

    [Fact]
    public async Task Refresh_token_reuse_revokes_the_whole_family()
    {
        var user = await fx.UserId("agent@demo.sanpu.test");
        var family = Guid.NewGuid();
        var h0 = Guid.NewGuid().ToByteArray().Concat(Guid.NewGuid().ToByteArray()).ToArray();
        var h1 = Guid.NewGuid().ToByteArray().Concat(Guid.NewGuid().ToByteArray()).ToArray();
        var h2 = Guid.NewGuid().ToByteArray().Concat(Guid.NewGuid().ToByteArray()).ToArray();
        await Auth.CreateRefreshTokenAsync(Guid.NewGuid(), user, family, h0, DateTime.UtcNow.AddDays(1), "it", null, default);
        Assert.Equal("ok", (await Auth.RotateRefreshTokenAsync(h0, Guid.NewGuid(), h1, DateTime.UtcNow.AddDays(1), "it", null, "it", default)).Outcome);
        Assert.Equal("reuse", (await Auth.RotateRefreshTokenAsync(h0, Guid.NewGuid(), h2, DateTime.UtcNow.AddDays(1), "it", null, "it", default)).Outcome);
        Assert.Equal(0, await fx.Scalar<int>("SELECT COUNT(*) FROM dbo.RefreshTokens WHERE FamilyId = @family AND RevokedAtUtc IS NULL", new { family }));
        Assert.Equal("invalid", (await Auth.RotateRefreshTokenAsync(new byte[32], Guid.NewGuid(), new byte[32].Select(_ => (byte)1).ToArray(), DateTime.UtcNow.AddDays(1), "it", null, "it", default)).Outcome);
    }

    [Fact]
    public async Task Audit_log_is_insert_only()
    {
        await using var c = new SqlConnection(fx.ConnectionString);
        var ex = await Assert.ThrowsAsync<SqlException>(() => c.ExecuteAsync("UPDATE dbo.AuditLogs SET Action = 'tampered'"));
        Assert.Contains("audit_immutable", ex.Message);
        await Assert.ThrowsAsync<SqlException>(() => c.ExecuteAsync("DELETE FROM dbo.AuditLogs"));
    }

    [Fact]
    public async Task Navigation_returns_only_menus_the_user_may_see()
    {
        var agent = await fx.UserId("agent@demo.sanpu.test");
        var keys = (await Auth.NavigationForUserAsync(agent, "Admin", default)).Select(m => m.MenuKey).ToList();
        Assert.Contains("ops.bookings", keys);
        Assert.DoesNotContain("admin.users", keys);
        Assert.DoesNotContain("ops.reconciliation", keys);
    }

    [Fact]
    public async Task Sql_injection_text_is_treated_as_data()
    {
        var rows = await Admin.ListUsersAsync("'; DROP TABLE dbo.Users; --", null, null, 1, 10, default);
        Assert.Empty(rows);
        Assert.True(await fx.Scalar<int>("SELECT COUNT(*) FROM dbo.Users") > 0);
    }
}
