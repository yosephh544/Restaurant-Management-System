using RestaurantManagement.Implementation.Dtos.Authentication;

namespace RestaurantManagement.Implementation.Interfaces.Authentication;

public interface IPasswordResetService
{
    /// <summary>Records a forgotten-password request. Never reveals whether the username exists.</summary>
    Task RequestAsync(ForgotPasswordRequest request, CancellationToken ct = default);

    /// <summary>Manager queue of reset requests.</summary>
    Task<IReadOnlyList<PasswordResetRequestResponse>> ListAsync(string? status, CancellationToken ct = default);

    /// <summary>Approves a request and returns the one-time code the manager hands to the staff member.</summary>
    Task<ApprovePasswordResetResponse> ApproveAsync(Guid requestId, CancellationToken ct = default);

    Task DismissAsync(Guid requestId, CancellationToken ct = default);

    /// <summary>Staff redeems the one-time code and sets a new password.</summary>
    Task<PasswordResetRedeemedResponse> RedeemAsync(RedeemPasswordResetRequest request, CancellationToken ct = default);
}
