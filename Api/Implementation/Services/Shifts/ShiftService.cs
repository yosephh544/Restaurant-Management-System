using Microsoft.EntityFrameworkCore;
using RestaurantManagement.Implementation.Dtos.Shifts;
using RestaurantManagement.Implementation.Interfaces.Common;
using RestaurantManagement.Implementation.Interfaces.Shifts;
using RestaurantManagement.Infrustructure.Common.Constants;
using RestaurantManagement.Infrustructure.Common.Exceptions;
using RestaurantManagement.Infrustructure.Data;
using RestaurantManagement.Infrustructure.Enums.Identity;
using RestaurantManagement.Infrustructure.Models.Identity;

namespace RestaurantManagement.Implementation.Services.Shifts;

public class ShiftService : IShiftService
{
    private static readonly TimeSpan EatOffset = TimeSpan.FromHours(3);
    private static readonly TimeSpan EarlyGrace = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan LateGrace = TimeSpan.FromMinutes(60);

    private readonly RestaurantDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;

    public ShiftService(RestaurantDbContext dbContext, ICurrentUserService currentUserService)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
    }

    private sealed record ShiftAssignment(Shift Shift, bool IsExtra);

    private sealed record ShiftWindow(
        Shift Shift,
        DateOnly Date,
        bool IsExtra,
        DateTimeOffset StartsAt,
        DateTimeOffset EndsAt);

    private static DateTimeOffset EatNow() => DateTimeOffset.UtcNow.ToOffset(EatOffset);

    private static DateOnly EatToday() => DateOnly.FromDateTime(EatNow().DateTime);

    public async Task<List<ShiftResponse>> GetShiftsAsync(CancellationToken ct = default)
    {
        var shifts = await _dbContext.Shifts
            .AsNoTracking()
            .OrderBy(s => s.StartMinutes)
            .ThenBy(s => s.Name)
            .ToListAsync(ct);

        return shifts.Select(MapShift).ToList();
    }

    public async Task<ShiftResponse> CreateShiftAsync(CreateShiftRequest request, CancellationToken ct = default)
    {
        var name = request.Name.Trim();
        ValidateShiftTimes(request.StartMinutes, request.EndMinutes);
        await EnsureShiftNameAvailableAsync(name, null, ct);

        var shift = new Shift
        {
            Id = Guid.NewGuid(),
            Name = name,
            StartMinutes = request.StartMinutes,
            EndMinutes = request.EndMinutes,
            IsActive = request.IsActive,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Shifts.Add(shift);
        await _dbContext.SaveChangesAsync(ct);
        return MapShift(shift);
    }

    public async Task<ShiftResponse> UpdateShiftAsync(Guid shiftId, UpdateShiftRequest request, CancellationToken ct = default)
    {
        var shift = await _dbContext.Shifts.FirstOrDefaultAsync(s => s.Id == shiftId, ct)
            ?? throw new NotFoundException("Shift", shiftId);

        var name = request.Name.Trim();
        ValidateShiftTimes(request.StartMinutes, request.EndMinutes);
        await EnsureShiftNameAvailableAsync(name, shiftId, ct);

        if (shift.IsActive && !request.IsActive)
        {
            var assigned = await _dbContext.UserShifts
                .CountAsync(us => us.ShiftId == shiftId && us.User.IsActive, ct);

            if (assigned > 0)
                throw new ValidationException("Shift",
                    $"Reassign {assigned} active staff member(s) before deactivating this shift.");
        }

        shift.Name = name;
        shift.StartMinutes = request.StartMinutes;
        shift.EndMinutes = request.EndMinutes;
        shift.IsActive = request.IsActive;
        shift.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);
        return MapShift(shift);
    }

    public async Task DeleteShiftAsync(Guid shiftId, CancellationToken ct = default)
    {
        var shift = await _dbContext.Shifts.FirstOrDefaultAsync(s => s.Id == shiftId, ct)
            ?? throw new NotFoundException("Shift", shiftId);

        var inUse = await _dbContext.UserShifts.AnyAsync(us => us.ShiftId == shiftId, ct) ||
                    await _dbContext.ShiftExceptions.AnyAsync(e => e.ShiftId == shiftId, ct);

        if (inUse)
            throw new ConflictException("This shift is in use. Deactivate it instead of deleting it.");

        _dbContext.Shifts.Remove(shift);
        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task<List<ShiftScheduleDayResponse>> GetScheduleAsync(
        DateOnly from,
        DateOnly to,
        CancellationToken ct = default)
    {
        if (to < from)
            throw new ValidationException("Date", "The end date cannot be before the start date.");
        if (to.DayNumber - from.DayNumber > 31)
            throw new ValidationException("Date", "The schedule range cannot exceed 31 days.");

        var shifts = await _dbContext.Shifts
            .AsNoTracking()
            .Where(s => s.IsActive)
            .OrderBy(s => s.StartMinutes)
            .ThenBy(s => s.Name)
            .ToListAsync(ct);

        var users = await _dbContext.Users
            .AsNoTracking()
            .Include(u => u.RoleEntity)
            .Include(u => u.ShiftAssignments).ThenInclude(a => a.Shift)
            .Where(u => u.IsActive &&
                        (u.RoleEntity == null || u.RoleEntity.Name != Roles.Owner))
            .ToListAsync(ct);

        var exceptions = await _dbContext.ShiftExceptions
            .AsNoTracking()
            .Include(e => e.Shift)
            .Include(e => e.User)
            .Where(e => e.ShiftDate >= from && e.ShiftDate <= to)
            .ToListAsync(ct);

        var now = EatNow();
        var today = DateOnly.FromDateTime(now.DateTime);
        var days = new List<ShiftScheduleDayResponse>();

        for (var date = from; date <= to; date = date.AddDays(1))
        {
            var dayExceptions = exceptions.Where(e => e.ShiftDate == date).ToList();
            var off = dayExceptions
                .Where(e => e.Kind == ShiftExceptionKind.Off)
                .Select(e => (e.UserId, e.ShiftId))
                .ToHashSet();

            var columns = shifts.ToDictionary(shift => shift.Id, shift => new ShiftScheduleColumnResponse
            {
                ShiftId = shift.Id,
                Name = shift.Name,
                StartMinutes = shift.StartMinutes,
                EndMinutes = shift.EndMinutes,
                CrossesMidnight = shift.EndMinutes <= shift.StartMinutes
            });

            foreach (var user in users)
            {
                var assignments = new List<ShiftAssignment>();

                var defaults = user.ShiftAssignments
                    .Select(a => a.Shift)
                    .Where(shift => shift is { IsActive: true })
                    .OrderBy(shift => shift.StartMinutes)
                    .ThenBy(shift => shift.Name);

                foreach (var defaultShift in defaults)
                {
                    if (off.Contains((user.Id, defaultShift.Id)))
                        continue;

                    assignments.Add(new ShiftAssignment(defaultShift, false));
                }

                foreach (var extra in dayExceptions.Where(e =>
                             e.UserId == user.Id &&
                             e.Kind == ShiftExceptionKind.Extra &&
                             e.Shift.IsActive &&
                             !off.Contains((e.UserId, e.ShiftId))))
                {
                    if (assignments.All(a => a.Shift.Id != extra.ShiftId))
                        assignments.Add(new ShiftAssignment(extra.Shift, true));
                }

                foreach (var assignment in assignments)
                {
                    if (!columns.TryGetValue(assignment.Shift.Id, out var column))
                        continue;

                    var window = BuildWindow(assignment.Shift, date, assignment.IsExtra);
                    column.Staff.Add(new ShiftStaffResponse
                    {
                        UserId = user.Id,
                        FullName = user.FullName,
                        Username = user.Username,
                        Role = user.RoleEntity?.Name ?? user.Role.ToString(),
                        IsExtra = assignment.IsExtra,
                        CanSignInNow = date == today && Allows(window, now)
                    });
                }
            }

            foreach (var column in columns.Values)
            {
                column.Staff.Sort((a, b) => string.Compare(a.FullName, b.FullName, StringComparison.OrdinalIgnoreCase));
            }

            days.Add(new ShiftScheduleDayResponse
            {
                Date = date,
                Shifts = columns.Values
                    .OrderBy(c => c.StartMinutes)
                    .ThenBy(c => c.Name)
                    .ToList(),
                Exceptions = dayExceptions
                    .OrderBy(e => e.Kind)
                    .ThenBy(e => e.User.FullName)
                    .Select(MapException)
                    .ToList()
            });
        }

        return days;
    }

    public async Task<MyShiftResponse> GetMyShiftAsync(CancellationToken ct = default)
    {
        var userId = _currentUserService.UserId
            ?? throw new UnauthorizedException();

        var user = await _dbContext.Users
            .AsNoTracking()
            .Include(u => u.RoleEntity)
            .Include(u => u.ShiftAssignments).ThenInclude(a => a.Shift)
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException(ErrorMessages.UserNotFound);

        if (!user.IsActive)
            throw new ForbiddenException(ErrorMessages.UserDeactivated);

        var roleName = user.RoleEntity?.Name ?? user.Role.ToString();
        var hasAssignments = user.ShiftAssignments.Count > 0;

        if (string.Equals(roleName, Roles.Owner, StringComparison.OrdinalIgnoreCase))
        {
            return new MyShiftResponse
            {
                ShiftRequired = false,
                Unrestricted = true,
                CanSignInNow = true,
                Message = "Owners are not restricted by shift windows."
            };
        }

        if (string.Equals(roleName, Roles.Manager, StringComparison.OrdinalIgnoreCase) && !hasAssignments)
        {
            return new MyShiftResponse
            {
                ShiftRequired = false,
                Unrestricted = true,
                CanSignInNow = true,
                Message = "This manager has no assigned shift and can sign in at any time."
            };
        }

        if (!hasAssignments)
        {
            return new MyShiftResponse
            {
                ShiftRequired = true,
                CanSignInNow = false,
                Message = "No shift is assigned to your account. Ask your manager to assign your shift."
            };
        }

        var today = EatToday();
        var now = EatNow();
        var assignments = await LoadEffectiveAssignmentsAsync(user, new[] { today, today.AddDays(-1) }, ct);

        // Build windows per occurrence explicitly so overnight shifts from
        // yesterday are represented with their real start date.
        var windows = new List<ShiftWindow>();
        foreach (var date in new[] { today.AddDays(-1), today })
        {
            if (!assignments.TryGetValue(date, out var dayAssignments))
                continue;

            windows.AddRange(dayAssignments.Select(a => BuildWindow(a.Shift, date, a.IsExtra)));
        }

        var canSignIn = windows.Any(window => Allows(window, now));

        return new MyShiftResponse
        {
            ShiftRequired = true,
            CanSignInNow = canSignIn,
            Shifts = windows
                .OrderBy(window => window.StartsAt)
                .Select(window => new MyShiftWindowResponse
                {
                    ShiftId = window.Shift.Id,
                    Name = window.Shift.Name,
                    Date = window.Date,
                    StartMinutes = window.Shift.StartMinutes,
                    EndMinutes = window.Shift.EndMinutes,
                    CrossesMidnight = window.Shift.EndMinutes <= window.Shift.StartMinutes,
                    IsExtra = window.IsExtra,
                    StartsAt = window.StartsAt,
                    EndsAt = window.EndsAt
                })
                .ToList(),
            Message = canSignIn
                ? null
                : windows.Count == 0
                    ? "You have no active shift today. Ask your manager for cover."
                    : "You are outside today's shift window (EAT)."
        };
    }

    public async Task MarkOffAsync(MarkShiftOffRequest request, CancellationToken ct = default)
    {
        var user = await GetRosterUserAsync(request.UserId, ct);
        _ = await _dbContext.Shifts.FirstOrDefaultAsync(s => s.Id == request.ShiftId, ct)
            ?? throw new NotFoundException("Shift", request.ShiftId);

        var assignments = await GetEffectiveAssignmentsAsync(user, request.Date, ct);
        if (assignments.Count == 0 || assignments.All(a => a.Shift.Id != request.ShiftId))
            throw new ValidationException("Shift", "This staff member is not scheduled for that shift on the selected date.");

        await RemoveAssignmentAsync(user, request.Date, request.ShiftId, request.Note, ct);
        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task CoverAsync(CoverShiftRequest request, CancellationToken ct = default)
    {
        if (request.AbsentUserId == request.CoverUserId)
            throw new ValidationException("Shift", "Choose a different staff member to cover the shift.");

        var absent = await GetRosterUserAsync(request.AbsentUserId, ct);
        var cover = await GetRosterUserAsync(request.CoverUserId, ct);

        var absentAssignments = await GetEffectiveAssignmentsAsync(absent, request.Date, ct);
        if (absentAssignments.Count == 0)
            throw new ValidationException("Shift", "The selected staff member has no shift on that date.");

        ShiftAssignment? target;
        if (request.ShiftId is Guid shiftId)
        {
            target = absentAssignments.FirstOrDefault(a => a.Shift.Id == shiftId);
            if (target is null)
                throw new ValidationException("Shift", "The selected staff member is not scheduled for that shift on that date.");
        }
        else
        {
            if (absentAssignments.Count > 1)
                throw new ValidationException("Shift", "Choose which shift to cover.");

            target = absentAssignments[0];
        }

        if (!target.Shift.IsActive)
            throw new ValidationException("Shift", "This shift is inactive and cannot be covered.");

        var coverAssignments = await GetEffectiveAssignmentsAsync(cover, request.Date, ct);
        if (coverAssignments.Any(a => a.Shift.Id == target.Shift.Id))
            throw new ConflictException("This staff member is already scheduled for that shift.");

        await RemoveAssignmentAsync(absent, request.Date, target.Shift.Id, request.Note, ct);
        await AddAssignmentAsync(cover, request.Date, target.Shift.Id, request.Note, ct);
        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task AssignAsync(AddShiftAssignmentRequest request, CancellationToken ct = default)
    {
        var user = await GetRosterUserAsync(request.UserId, ct);
        var shift = await _dbContext.Shifts.FirstOrDefaultAsync(s => s.Id == request.ShiftId, ct)
            ?? throw new NotFoundException("Shift", request.ShiftId);

        if (!shift.IsActive)
            throw new ValidationException("Shift", "This shift is inactive and cannot be assigned.");

        var assignments = await GetEffectiveAssignmentsAsync(user, request.Date, ct);
        if (assignments.Any(a => a.Shift.Id == shift.Id))
            throw new ConflictException("This staff member is already scheduled for that shift on that date.");

        await AddAssignmentAsync(user, request.Date, shift.Id, request.Note, ct);
        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task SwapAsync(SwapShiftsRequest request, CancellationToken ct = default)
    {
        if (request.UserAId == request.UserBId)
            throw new ValidationException("Shift", "Choose two different staff members to swap.");

        var dates = request.Dates.Distinct().OrderBy(date => date).ToList();
        if (dates.Count == 0)
            throw new ValidationException("Dates", "Choose at least one date to swap.");
        if (dates.Count > 31)
            throw new ValidationException("Dates", "A swap cannot cover more than 31 days.");

        var userA = await GetRosterUserAsync(request.UserAId, ct);
        var userB = await GetRosterUserAsync(request.UserBId, ct);

        var plans = new List<(DateOnly Date, Shift ShiftA, Shift ShiftB)>();
        foreach (var date in dates)
        {
            var assignmentsA = await GetEffectiveAssignmentsAsync(userA, date, ct);
            var assignmentsB = await GetEffectiveAssignmentsAsync(userB, date, ct);

            if (assignmentsA.Count != 1 || assignmentsB.Count != 1)
                throw new ValidationException("Shift",
                    $"On {date:yyyy-MM-dd} each staff member must have exactly one shift to swap. Use Cover instead.");

            var shiftA = assignmentsA[0].Shift;
            var shiftB = assignmentsB[0].Shift;
            if (shiftA.Id == shiftB.Id)
                throw new ValidationException("Shift",
                    $"Both staff members are already on the same shift on {date:yyyy-MM-dd}.");

            plans.Add((date, shiftA, shiftB));
        }

        foreach (var plan in plans)
        {
            await RemoveAssignmentAsync(userA, plan.Date, plan.ShiftA.Id, request.Note, ct);
            await AddAssignmentAsync(userA, plan.Date, plan.ShiftB.Id, request.Note, ct);

            await RemoveAssignmentAsync(userB, plan.Date, plan.ShiftB.Id, request.Note, ct);
            await AddAssignmentAsync(userB, plan.Date, plan.ShiftA.Id, request.Note, ct);
        }

        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task ResetDayAsync(ResetShiftDayRequest request, CancellationToken ct = default)
    {
        var exceptions = await _dbContext.ShiftExceptions
            .Where(e => e.ShiftDate == request.Date)
            .ToListAsync(ct);

        if (exceptions.Count == 0)
            return;

        _dbContext.ShiftExceptions.RemoveRange(exceptions);
        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task DeleteExceptionAsync(Guid exceptionId, CancellationToken ct = default)
    {
        var exception = await _dbContext.ShiftExceptions.FirstOrDefaultAsync(e => e.Id == exceptionId, ct)
            ?? throw new NotFoundException("Shift exception", exceptionId);

        _dbContext.ShiftExceptions.Remove(exception);
        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task EnsureCanSignInAsync(User user, CancellationToken ct = default)
    {
        var roleName = user.RoleEntity?.Name ?? user.Role.ToString();

        if (string.Equals(roleName, Roles.Owner, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(roleName, Roles.SuperAdmin, StringComparison.OrdinalIgnoreCase))
            return;

        var hasAssignments = await _dbContext.UserShifts.AnyAsync(us => us.UserId == user.Id, ct);

        if (string.Equals(roleName, Roles.Manager, StringComparison.OrdinalIgnoreCase) && !hasAssignments)
            return;

        if (!hasAssignments)
            throw new ForbiddenException(
                "No shift is assigned to your account. Ask your manager to assign your shift.");

        var today = EatToday();
        var assignments = await LoadEffectiveAssignmentsAsync(user, new[] { today, today.AddDays(-1) }, ct);
        var now = EatNow();

        var windows = new List<ShiftWindow>();
        foreach (var date in new[] { today.AddDays(-1), today })
        {
            if (!assignments.TryGetValue(date, out var dayAssignments))
                continue;

            windows.AddRange(dayAssignments.Select(a => BuildWindow(a.Shift, date, a.IsExtra)));
        }

        if (windows.Any(window => Allows(window, now)))
            return;

        if (windows.Count == 0)
            throw new ForbiddenException(
                "You have no active shift today. Ask your manager for cover or to adjust your roster.");

        throw new ForbiddenException(
            "You are outside your shift window (EAT). Sign-in opens 15 minutes before your shift and closes 60 minutes after it ends.");
    }

    private async Task<Dictionary<DateOnly, List<ShiftAssignment>>> LoadEffectiveAssignmentsAsync(
        User user,
        IReadOnlyCollection<DateOnly> dates,
        CancellationToken ct)
    {
        var result = dates.Distinct().ToDictionary(date => date, _ => new List<ShiftAssignment>());
        if (result.Count == 0)
            return result;

        var defaultShifts = await _dbContext.UserShifts
            .AsNoTracking()
            .Include(us => us.Shift)
            .Where(us => us.UserId == user.Id)
            .Select(us => us.Shift)
            .ToListAsync(ct);

        var from = result.Keys.Min();
        var to = result.Keys.Max();

        var exceptions = await _dbContext.ShiftExceptions
            .AsNoTracking()
            .Include(e => e.Shift)
            .Where(e => e.UserId == user.Id && e.ShiftDate >= from && e.ShiftDate <= to)
            .ToListAsync(ct);

        foreach (var date in result.Keys)
        {
            var off = exceptions
                .Where(e => e.ShiftDate == date && e.Kind == ShiftExceptionKind.Off)
                .Select(e => e.ShiftId)
                .ToHashSet();

            var assignments = result[date];

            foreach (var defaultShift in defaultShifts.Where(s => s.IsActive && !off.Contains(s.Id)))
            {
                if (assignments.All(a => a.Shift.Id != defaultShift.Id))
                    assignments.Add(new ShiftAssignment(defaultShift, false));
            }

            foreach (var extra in exceptions.Where(e =>
                         e.ShiftDate == date &&
                         e.Kind == ShiftExceptionKind.Extra &&
                         e.Shift.IsActive &&
                         !off.Contains(e.ShiftId)))
            {
                if (assignments.All(a => a.Shift.Id != extra.ShiftId))
                    assignments.Add(new ShiftAssignment(extra.Shift, true));
            }
        }

        return result;
    }

    private async Task<List<ShiftAssignment>> GetEffectiveAssignmentsAsync(
        User user,
        DateOnly date,
        CancellationToken ct)
    {
        var assignments = await LoadEffectiveAssignmentsAsync(user, new[] { date }, ct);
        return assignments.TryGetValue(date, out var list) ? list : new List<ShiftAssignment>();
    }

    private static ShiftWindow BuildWindow(Shift shift, DateOnly date, bool isExtra)
    {
        var midnight = new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), EatOffset);
        var start = midnight.AddMinutes(shift.StartMinutes);
        var end = midnight
            .AddDays(shift.EndMinutes <= shift.StartMinutes ? 1 : 0)
            .AddMinutes(shift.EndMinutes);

        return new ShiftWindow(shift, date, isExtra, start, end);
    }

    private static bool Allows(ShiftWindow window, DateTimeOffset now) =>
        now >= window.StartsAt - EarlyGrace && now <= window.EndsAt + LateGrace;

    private async Task RemoveAssignmentAsync(
        User user,
        DateOnly date,
        Guid shiftId,
        string? note,
        CancellationToken ct)
    {
        var cleanedNote = NormalizeNote(note);
        var isDefault = await _dbContext.UserShifts
            .AnyAsync(us => us.UserId == user.Id && us.ShiftId == shiftId, ct);

        if (isDefault)
        {
            var extras = await _dbContext.ShiftExceptions
                .Where(e => e.UserId == user.Id && e.ShiftDate == date && e.ShiftId == shiftId &&
                            e.Kind == ShiftExceptionKind.Extra)
                .ToListAsync(ct);
            _dbContext.ShiftExceptions.RemoveRange(extras);

            var alreadyOff = await _dbContext.ShiftExceptions.AnyAsync(e =>
                e.UserId == user.Id && e.ShiftDate == date && e.ShiftId == shiftId &&
                e.Kind == ShiftExceptionKind.Off, ct);

            if (!alreadyOff)
            {
                _dbContext.ShiftExceptions.Add(new ShiftException
                {
                    Id = Guid.NewGuid(),
                    UserId = user.Id,
                    ShiftId = shiftId,
                    ShiftDate = date,
                    Kind = ShiftExceptionKind.Off,
                    Note = cleanedNote,
                    CreatedByUserId = _currentUserService.UserId,
                    CreatedAt = DateTime.UtcNow
                });
            }

            return;
        }

        var extraOnly = await _dbContext.ShiftExceptions
            .Where(e => e.UserId == user.Id && e.ShiftDate == date && e.ShiftId == shiftId &&
                        e.Kind == ShiftExceptionKind.Extra)
            .ToListAsync(ct);
        _dbContext.ShiftExceptions.RemoveRange(extraOnly);
    }

    private async Task AddAssignmentAsync(
        User user,
        DateOnly date,
        Guid shiftId,
        string? note,
        CancellationToken ct)
    {
        var cleanedNote = NormalizeNote(note);
        var isDefault = await _dbContext.UserShifts
            .AnyAsync(us => us.UserId == user.Id && us.ShiftId == shiftId, ct);

        var off = await _dbContext.ShiftExceptions
            .Where(e => e.UserId == user.Id && e.ShiftDate == date && e.ShiftId == shiftId &&
                        e.Kind == ShiftExceptionKind.Off)
            .ToListAsync(ct);
        _dbContext.ShiftExceptions.RemoveRange(off);

        if (isDefault)
        {
            var duplicateExtras = await _dbContext.ShiftExceptions
                .Where(e => e.UserId == user.Id && e.ShiftDate == date && e.ShiftId == shiftId &&
                            e.Kind == ShiftExceptionKind.Extra)
                .ToListAsync(ct);
            _dbContext.ShiftExceptions.RemoveRange(duplicateExtras);
            return;
        }

        var existing = await _dbContext.ShiftExceptions
            .Where(e => e.UserId == user.Id && e.ShiftDate == date && e.ShiftId == shiftId &&
                        e.Kind == ShiftExceptionKind.Extra)
            .ToListAsync(ct);

        if (existing.Count > 0)
            return;

        _dbContext.ShiftExceptions.Add(new ShiftException
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            ShiftId = shiftId,
            ShiftDate = date,
            Kind = ShiftExceptionKind.Extra,
            Note = cleanedNote,
            CreatedByUserId = _currentUserService.UserId,
            CreatedAt = DateTime.UtcNow
        });
    }

    private async Task<User> GetRosterUserAsync(Guid userId, CancellationToken ct)
    {
        var user = await _dbContext.Users
            .Include(u => u.RoleEntity)
            .Include(u => u.ShiftAssignments).ThenInclude(a => a.Shift)
            .FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException(ErrorMessages.UserNotFound);

        if (!user.IsActive)
            throw new ValidationException("User", "This staff account is inactive.");

        var roleName = user.RoleEntity?.Name ?? user.Role.ToString();
        if (string.Equals(roleName, Roles.Owner, StringComparison.OrdinalIgnoreCase))
            throw new ForbiddenException("The Owner is not scheduled for shifts.");

        return user;
    }

    private async Task EnsureShiftNameAvailableAsync(string name, Guid? excludeId, CancellationToken ct)
    {
        var normalized = name.ToLower();
        var exists = await _dbContext.Shifts
            .AnyAsync(s => s.Name.ToLower() == normalized && (excludeId == null || s.Id != excludeId), ct);

        if (exists)
            throw new ConflictException("Shift", "Name", name);
    }

    private static void ValidateShiftTimes(int startMinutes, int endMinutes)
    {
        if (startMinutes is < 0 or > 1439 || endMinutes is < 0 or > 1439)
            throw new ValidationException("Shift", "Shift times must be between 00:00 and 23:59.");

        if (startMinutes == endMinutes)
            throw new ValidationException("Shift", "Start and end times cannot be the same.");
    }

    private static string? NormalizeNote(string? note) =>
        string.IsNullOrWhiteSpace(note) ? null : note.Trim();

    private static ShiftResponse MapShift(Shift shift) => new()
    {
        Id = shift.Id,
        Name = shift.Name,
        StartMinutes = shift.StartMinutes,
        EndMinutes = shift.EndMinutes,
        IsActive = shift.IsActive
    };

    private static ShiftExceptionResponse MapException(ShiftException exception) => new()
    {
        Id = exception.Id,
        UserId = exception.UserId,
        FullName = exception.User.FullName,
        ShiftId = exception.ShiftId,
        ShiftName = exception.Shift.Name,
        Kind = exception.Kind.ToString().ToUpperInvariant(),
        Note = exception.Note
    };
}
