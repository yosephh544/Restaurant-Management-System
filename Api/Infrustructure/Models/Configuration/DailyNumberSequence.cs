namespace RestaurantManagement.Infrustructure.Models.Configuration;

/// <summary>
/// Per-day counter backing readable order/bill numbers (e.g. O-261122-007).
/// One row per kind and local calendar day; increments atomically via MERGE.
/// </summary>
public class DailyNumberSequence
{
    /// <summary>"ORDER" or "BILL".</summary>
    public string Kind { get; set; } = default!;

    /// <summary>Local date key in yyMMdd form, e.g. "261122".</summary>
    public string DayKey { get; set; } = default!;

    public int LastValue { get; set; }
}
