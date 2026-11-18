using System.ComponentModel.DataAnnotations;
using RestaurantManagement.Infrustructure.Common.Requests;

namespace RestaurantManagement.Infrustructure.Common.Requests;

/// <summary>
/// Base class for requests that include a date range filter.
/// Used by report and analytics endpoints (e.g. billing summaries, tip reports).
/// </summary>
public class DateRangeRequest : PagedRequest
{
    /// <summary>Start of the date range (UTC). Inclusive.</summary>
    public DateTime? From { get; set; }

    /// <summary>End of the date range (UTC). Inclusive.</summary>
    public DateTime? To { get; set; }

    /// <summary>Validates that From is not after To when both are provided.</summary>
    public bool IsDateRangeValid()
        => From is null || To is null || From <= To;
}
