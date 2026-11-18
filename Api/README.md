# Restaurant Management API

The API is an ASP.NET Core Web API targeting .NET 9.

## Run

From the repository root:

```powershell
dotnet run --project Api/Api/RestaurantManagement.Api.csproj
```

The HTTP launch profile listens at `http://localhost:5012`.

## Starter endpoints

- `GET /weatherforecast` returns sample data from the generated controller.
- `/openapi/v1.json` serves the OpenAPI document in the Development environment.

The sample weather endpoint is scaffolding and can be replaced as restaurant features are added.
