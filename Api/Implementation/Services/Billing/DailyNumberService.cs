using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using RestaurantManagement.Infrustructure.Data;

namespace RestaurantManagement.Implementation.Services.Billing;

public interface IDailyNumberService
{
    Task<string> NextOrderNumberAsync(CancellationToken ct = default);
    Task<string> NextBillNumberAsync(CancellationToken ct = default);
}

/// <summary>
/// Allocates readable, per-day ticket numbers such as O-261122-017 and B-261122-004.
/// The counter row is incremented with a single atomic MERGE so concurrent
/// requests can never receive the same value.
/// </summary>
public class DailyNumberService : IDailyNumberService
{
    private const string OrderKind = "ORDER";
    private const string BillKind = "BILL";

    private readonly RestaurantDbContext _db;

    public DailyNumberService(RestaurantDbContext db)
    {
        _db = db;
    }

    public Task<string> NextOrderNumberAsync(CancellationToken ct = default)
        => NextAsync(OrderKind, "O", ct);

    public Task<string> NextBillNumberAsync(CancellationToken ct = default)
        => NextAsync(BillKind, "B", ct);

    private async Task<string> NextAsync(string kind, string prefix, CancellationToken ct)
    {
        var day = DateTime.Now.ToString("yyMMdd");

        // MERGE ... OUTPUT is not composable SQL, so run it directly on the
        // context connection instead of through EF's query pipeline.
        var connection = _db.Database.GetDbConnection();
        var shouldClose = connection.State != ConnectionState.Open;
        if (shouldClose)
        {
            await connection.OpenAsync(ct);
        }

        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = """
                MERGE [daily_number_sequences] AS target
                USING (SELECT @kind AS Kind, @day AS DayKey) AS source
                ON target.Kind = source.Kind AND target.DayKey = source.DayKey
                WHEN MATCHED THEN UPDATE SET target.LastValue = target.LastValue + 1
                WHEN NOT MATCHED THEN INSERT (Kind, DayKey, LastValue) VALUES (source.Kind, source.DayKey, 1)
                OUTPUT inserted.LastValue;
                """;
            command.Transaction = _db.Database.CurrentTransaction?.GetDbTransaction();

            var kindParam = command.CreateParameter();
            kindParam.ParameterName = "@kind";
            kindParam.Value = kind;
            command.Parameters.Add(kindParam);

            var dayParam = command.CreateParameter();
            dayParam.ParameterName = "@day";
            dayParam.Value = day;
            command.Parameters.Add(dayParam);

            var result = await command.ExecuteScalarAsync(ct);
            var sequence = Convert.ToInt32(result);
            return $"{prefix}-{day}-{sequence:000}";
        }
        finally
        {
            if (shouldClose)
            {
                await connection.CloseAsync();
            }
        }
    }
}
