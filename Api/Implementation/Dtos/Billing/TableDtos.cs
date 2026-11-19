using System.ComponentModel.DataAnnotations;

namespace RestaurantManagement.Implementation.Dtos.Billing;

public class CreateTableRequest
{
    [Required, MaxLength(20)] public string Number { get; set; } = default!;
    [MaxLength(100)] public string? Name { get; set; }
    [Range(1, 100)] public int Capacity { get; set; } = 1;
}

public class TableResponse
{
    public Guid Id { get; init; }
    public string Number { get; init; } = default!;
    public string? Name { get; init; }
    public int Capacity { get; init; }
    public string Status { get; init; } = default!;
    public bool IsActive { get; init; }
}
