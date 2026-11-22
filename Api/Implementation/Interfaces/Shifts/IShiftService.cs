using RestaurantManagement.Implementation.Dtos.Shifts;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Implementation.Interfaces.Shifts;

public interface IShiftService
{
    Task<List<ShiftResponse>> GetShiftsAsync(CancellationToken ct = default);
    Task<ShiftResponse> CreateShiftAsync(CreateShiftRequest request, CancellationToken ct = default);
    Task<ShiftResponse> UpdateShiftAsync(Guid shiftId, UpdateShiftRequest request, CancellationToken ct = default);
    Task DeleteShiftAsync(Guid shiftId, CancellationToken ct = default);

    Task<List<ShiftScheduleDayResponse>> GetScheduleAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
    Task<MyShiftResponse> GetMyShiftAsync(CancellationToken ct = default);

    Task MarkOffAsync(MarkShiftOffRequest request, CancellationToken ct = default);
    Task AssignAsync(AddShiftAssignmentRequest request, CancellationToken ct = default);
    Task CoverAsync(CoverShiftRequest request, CancellationToken ct = default);
    Task SwapAsync(SwapShiftsRequest request, CancellationToken ct = default);
    Task ResetDayAsync(ResetShiftDayRequest request, CancellationToken ct = default);
    Task DeleteExceptionAsync(Guid exceptionId, CancellationToken ct = default);

    /// <summary>Throws when the supplied user may not sign in at the current EAT time.</summary>
    Task EnsureCanSignInAsync(User user, CancellationToken ct = default);
}
