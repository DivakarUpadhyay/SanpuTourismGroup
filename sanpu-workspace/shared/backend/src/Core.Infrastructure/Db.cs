using System.Data;
using Dapper;
using Divakar.Sanpu.Core.Application;
using Microsoft.Data.SqlClient;

namespace Divakar.Sanpu.Core.Infrastructure;

public sealed record DbOptions(string ConnectionString, int CommandTimeoutSeconds = 30);

/// <summary>The only way the app talks to SQL Server: parameterized stored procedure calls through Dapper.
/// SQL business errors (THROW 50xxx) become AppExceptions with stable codes.</summary>
public sealed class Db(DbOptions options)
{
    private static readonly Dictionary<int, int> StatusByNumber = new()
    {
        [50001] = 404, [50009] = 409, [50010] = 422, [50011] = 409, [50012] = 409, [50013] = 422, [50020] = 409, [50021] = 409,
        [50022] = 409, [50030] = 409, [50031] = 409, [50032] = 403, [50033] = 409, [50034] = 403, [50035] = 422, [50036] = 409,
        [50037] = 409, [50038] = 409, [50039] = 429, [50040] = 400, [50041] = 422, [50090] = 409,
        [50060] = 422, [50061] = 422, [50062] = 422, [50063] = 409, [50064] = 422, [50065] = 422, [50066] = 409, [50067] = 409,
        [50070] = 422, [50071] = 409, [50072] = 409, [50073] = 422
    };

    private static readonly Dictionary<string, string> Messages = new()
    {
        ["not_found"] = "The record was not found.",
        ["past_date"] = "That date has already passed. Choose a future date.",
        ["quote_expired"] = "This price was held for 30 minutes and has expired. Ask the assistant for a fresh quote.",
        ["not_payable"] = "This booking cannot be paid or changed any more.",
        ["bad_amount"] = "That amount is more than what is left to pay.",
        ["coupon_not_found"] = "That coupon code is not valid.",
        ["coupon_expired"] = "That coupon code is not active on these dates.",
        ["coupon_min_amount"] = "Your total is below the minimum for this coupon.",
        ["coupon_limit_reached"] = "This coupon has reached its usage limit.",
        ["coupon_not_applicable"] = "This coupon cannot be used for this item.",
        ["invalid_dates"] = "Check the dates: the end must be after the start and both in the future.",
        ["amount_mismatch"] = "The paid amount does not match this checkout. Nothing was recorded; please contact us.",
        ["sold_out"] = "Sorry, that just sold out. Pick another option.",
        ["deposit_not_available"] = "A deposit is only possible before any payment and while the trip is far enough away. Please pay the full amount.",
        ["concurrency_conflict"] = "Someone else changed this record. Reload and try again.",
        ["menu_cycle"] = "A menu cannot be moved under itself or one of its children.",
        ["has_children"] = "Remove or move the child menus first.",
        ["has_members"] = "Remove the users from this role first.",
        ["duplicate_email"] = "A user with this email already exists.",
        ["duplicate_key"] = "That key is already used.",
        ["duplicate_route"] = "Another menu already uses this route.",
        ["duplicate_departure"] = "This tour already has a departure on that date.",
        ["invalid_reference"] = "A referenced record does not exist or is inactive.",
        ["invalid_parent"] = "The parent menu must exist in the same area.",
        ["last_admin"] = "At least one active system administrator with full admin rights must remain.",
        ["already_bootstrapped"] = "An administrator already exists. Use the admin portal to invite users.",
        ["system_protected"] = "This built-in item is protected.",
        ["cannot_modify_self"] = "You cannot lock or deactivate your own account.",
        ["insufficient_capacity"] = "Not enough seats are left on this departure.",
        ["invalid_state"] = "This action is not allowed in the current status.",
        ["self_approval"] = "You cannot approve your own request (separation of duties).",
        ["capacity_below_sold"] = "Capacity cannot be lower than seats already sold or held.",
        ["not_approver"] = "This approval step belongs to another role.",
        ["amount_exceeds_balance"] = "The amount is more than the remaining balance.",
        ["hold_expired"] = "Your seat hold has expired. Please hold seats again.",
        ["departure_closed"] = "This departure is not open for booking.",
        ["stale_version"] = "The itinerary changed after this proposal was made. Run the simulation again.",
        ["token_invalid"] = "This link is invalid or has expired.",
        ["comment_required"] = "A comment is required.",
        ["note_required"] = "A note is required.",
        ["trip_required"] = "Choose a trip.",
        ["already_active"] = "This user has already accepted the invitation.",
        ["start_in_past"] = "The start date cannot be in the past.",
        ["invalid_setting_value"] = "The value does not match the setting type.",
        ["invalid_delegate"] = "Delegate to an active user who holds the approver role.",
        ["steps_required"] = "Add at least one step.",
        ["items_required"] = "The itinerary needs at least one item.",
        ["invalid_category"] = "Unknown category.",
        ["audit_immutable"] = "Audit records cannot be changed.",
        ["history_immutable"] = "History records cannot be changed."
    };

    public async Task<SqlConnection> OpenAsync(CancellationToken ct)
    {
        var c = new SqlConnection(options.ConnectionString);
        await c.OpenAsync(ct);
        return c;
    }

    private CommandDefinition Cmd(string proc, object? param, CancellationToken ct) =>
        new(proc, param, commandType: CommandType.StoredProcedure, commandTimeout: options.CommandTimeoutSeconds, cancellationToken: ct);

    public Task<IReadOnlyList<T>> QueryAsync<T>(string proc, object? param, CancellationToken ct) => Run(async c => (IReadOnlyList<T>)(await c.QueryAsync<T>(Cmd(proc, param, ct))).AsList(), ct);
    public Task<T?> QuerySingleAsync<T>(string proc, object? param, CancellationToken ct) => Run(c => c.QueryFirstOrDefaultAsync<T>(Cmd(proc, param, ct)), ct);
    public Task ExecuteAsync(string proc, object? param, CancellationToken ct) => Run(c => c.ExecuteAsync(Cmd(proc, param, ct)), ct);
    public Task<TResult> MultipleAsync<TResult>(string proc, object? param, Func<SqlMapper.GridReader, Task<TResult>> read, CancellationToken ct) =>
        Run(async c => { using var grid = await c.QueryMultipleAsync(Cmd(proc, param, ct)); return await read(grid); }, ct);

    private async Task<T> Run<T>(Func<SqlConnection, Task<T>> work, CancellationToken ct)
    {
        try
        {
            await using var c = await OpenAsync(ct);
            return await work(c);
        }
        catch (SqlException ex) when (ex.Number is >= 50000 and < 51000)
        {
            var code = ex.Message.Trim();
            throw new AppException(StatusByNumber.GetValueOrDefault(ex.Number, 422), code, Messages.GetValueOrDefault(code, "The request could not be completed."));
        }
        catch (SqlException ex) when (ex.Number is 2627 or 2601)
        {
            throw new AppException(409, "duplicate", "A record with the same unique value already exists.");
        }
        catch (SqlException ex) when (ex.Number == 547)
        {
            throw new AppException(409, "constraint_violation", "The change breaks a data rule (reference or check constraint).");
        }
    }

    /// <summary>JSON array of ints for OPENJSON parameters.</summary>
    public static string Ids(IEnumerable<int> ids) => System.Text.Json.JsonSerializer.Serialize(ids.Distinct());
}
