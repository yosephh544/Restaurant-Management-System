using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantManagement.Api.Authorization;
using RestaurantManagement.Api.Controllers.Common;
using RestaurantManagement.Implementation.Dtos.Shifts;
using RestaurantManagement.Implementation.Interfaces.Shifts;
using RestaurantManagement.Infrustructure.Common.Constants;

namespace RestaurantManagement.Api.Controllers.Shifts;

[ApiController]
[Authorize]
[Route("api/v1/shifts")]
public class ShiftsController : ApiControllerBase
{
    private readonly IShiftService _shiftService;

    public ShiftsController(IShiftService shiftService)
    {
        _shiftService = shiftService;
    }

    /// <summary>
    /// Lists the configurable shift definitions (Morning, Afternoon, Late Night, ...).
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<List<ShiftResponse>>), 200)]
    [Permission(Permissions.ShiftsView)]
    public async Task<IActionResult> GetShifts(CancellationToken ct)
    {
        var shifts = await _shiftService.GetShiftsAsync(ct);
        return OkResponse(shifts);
    }

    /// <summary>
    /// Creates a new shift definition. Owner-only configuration.
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<ShiftResponse>), 201)]
    [Permission(Permissions.ShiftsConfigure)]
    public async Task<IActionResult> CreateShift([FromBody] CreateShiftRequest request, CancellationToken ct)
    {
        var shift = await _shiftService.CreateShiftAsync(request, ct);
        return CreatedResponse(shift, "Shift created successfully.");
    }

    /// <summary>
    /// Updates a shift definition (name, hours, active status). Owner-only configuration.
    /// </summary>
    [HttpPut("{shiftId:guid}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<ShiftResponse>), 200)]
    [Permission(Permissions.ShiftsConfigure)]
    public async Task<IActionResult> UpdateShift([FromRoute] Guid shiftId, [FromBody] UpdateShiftRequest request, CancellationToken ct)
    {
        var shift = await _shiftService.UpdateShiftAsync(shiftId, request, ct);
        return OkResponse(shift, "Shift updated successfully.");
    }

    /// <summary>
    /// Deletes an unused shift definition. Owner-only configuration.
    /// </summary>
    [HttpDelete("{shiftId:guid}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    [Permission(Permissions.ShiftsConfigure)]
    public async Task<IActionResult> DeleteShift([FromRoute] Guid shiftId, CancellationToken ct)
    {
        await _shiftService.DeleteShiftAsync(shiftId, ct);
        return NoContentResponse("Shift deleted successfully.");
    }

    /// <summary>
    /// Returns the daily roster (default assignments plus Off/Extra exceptions) for a date range.
    /// </summary>
    [HttpGet("schedule")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<List<ShiftScheduleDayResponse>>), 200)]
    [Permission(Permissions.ShiftsView)]
    public async Task<IActionResult> GetSchedule(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken ct)
    {
        var schedule = await _shiftService.GetScheduleAsync(from, to, ct);
        return OkResponse(schedule);
    }

    /// <summary>
    /// Returns the calling staff member's shift windows and whether sign-in is currently allowed.
    /// </summary>
    [HttpGet("me")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<MyShiftResponse>), 200)]
    public async Task<IActionResult> GetMyShift(CancellationToken ct)
    {
        var shift = await _shiftService.GetMyShiftAsync(ct);
        return OkResponse(shift);
    }

    /// <summary>
    /// Marks a staff member off a shift for a single date.
    /// </summary>
    [HttpPatch("off")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    [Permission(Permissions.ShiftsManage)]
    public async Task<IActionResult> MarkOff([FromBody] MarkShiftOffRequest request, CancellationToken ct)
    {
        await _shiftService.MarkOffAsync(request, ct);
        return NoContentResponse("Staff marked off for that shift.");
    }

    /// <summary>
    /// Allocates a staff member to any shift for a single date, including shifts with no staff.
    /// </summary>
    [HttpPatch("assign")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    [Permission(Permissions.ShiftsManage)]
    public async Task<IActionResult> Assign([FromBody] AddShiftAssignmentRequest request, CancellationToken ct)
    {
        await _shiftService.AssignAsync(request, ct);
        return NoContentResponse("Staff allocated to the shift.");
    }

    /// <summary>
    /// Assigns a covering staff member to an absent staff member's shift for a single date.
    /// </summary>
    [HttpPatch("cover")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    [Permission(Permissions.ShiftsManage)]
    public async Task<IActionResult> Cover([FromBody] CoverShiftRequest request, CancellationToken ct)
    {
        await _shiftService.CoverAsync(request, ct);
        return NoContentResponse("Shift cover recorded.");
    }

    /// <summary>
    /// Swaps the shifts of two staff members for one or more dates.
    /// </summary>
    [HttpPatch("swap")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    [Permission(Permissions.ShiftsManage)]
    public async Task<IActionResult> Swap([FromBody] SwapShiftsRequest request, CancellationToken ct)
    {
        await _shiftService.SwapAsync(request, ct);
        return NoContentResponse("Shifts swapped.");
    }

    /// <summary>
    /// Clears every shift exception for a date, restoring the default roster.
    /// </summary>
    [HttpPatch("reset")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    [Permission(Permissions.ShiftsManage)]
    public async Task<IActionResult> ResetDay([FromBody] ResetShiftDayRequest request, CancellationToken ct)
    {
        await _shiftService.ResetDayAsync(request, ct);
        return NoContentResponse("Roster restored to default assignments.");
    }

    /// <summary>
    /// Deletes a single roster exception (Off or Extra).
    /// </summary>
    [HttpDelete("exceptions/{exceptionId:guid}")]
    [ProducesResponseType(typeof(Infrustructure.Common.Responses.ApiResponse<object>), 200)]
    [Permission(Permissions.ShiftsManage)]
    public async Task<IActionResult> DeleteException([FromRoute] Guid exceptionId, CancellationToken ct)
    {
        await _shiftService.DeleteExceptionAsync(exceptionId, ct);
        return NoContentResponse("Roster exception removed.");
    }
}
