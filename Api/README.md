# Restaurant Management API

The API is an ASP.NET Core Web API targeting .NET 9.

Implemented backend changes are documented in
[Backend changes](../docs/BACKEND_CHANGES.md), with the receipt integration
reference in [Direct bank receipts](../docs/DIRECT_BANK_RECEIPTS.md).

## Run

From the repository root:

```powershell
dotnet run --project Api/Api/RestaurantManagement.Api.csproj
```

The HTTP launch profile listens at `http://localhost:5012`.

## Database migrations

Run EF Core commands from `Api/Api`. They use `ConnectionStrings:DefaultConnection`
from the appsettings files or environment variables and do not require API startup
settings such as `Jwt:Key`.

```powershell
dotnet ef database update
```

## Starter endpoints

- `GET /weatherforecast` returns sample data from the generated controller.
- `/openapi/v1.json` serves the OpenAPI document in the Development environment.

The sample weather endpoint is scaffolding and can be replaced as restaurant features are added.
