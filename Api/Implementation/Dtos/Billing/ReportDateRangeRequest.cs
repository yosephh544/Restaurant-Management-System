using RestaurantManagement.Infrustructure.Common.Requests;

namespace RestaurantManagement.Implementation.Dtos.Billing;

public class ReportDateRangeRequest : DateRangeRequest
{
    /// <summary>
    /// Optional client timezone offset in minutes (JavaScript Date#getTimezoneOffset).
    /// Used to bucket daily points into the restaurant's local calendar day.
    /// </summary>
    public int TimezoneOffsetMinutes { get; set; }

    // Inherits From, To, Page, PageSize, Search, SortBy, SortDesc
}
