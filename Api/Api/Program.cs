using RestaurantManagement.Api.Extensions;

var builder = WebApplication.CreateBuilder(args);

// ── Application Services ──────────────────────────────────────────────────────
builder.Services.AddDatabase(builder.Configuration);
builder.Services.AddCorsPolicy(builder.Configuration);
builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddApplicationServices();
builder.Services.AddAuthorizationPolicies();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerWithJwt();

// ─────────────────────────────────────────────────────────────────────────────

var app = builder.Build();

await DatabaseSeeder.SeedOwnerAsync(app.Services);

// ── Middleware pipeline ───────────────────────────────────────────────────────
// Must be first to catch unhandled exceptions across all subsequent middleware
app.UseGlobalExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "RMS API v1.0");
        c.RoutePrefix = "swagger";
    });
}

app.UseHttpsRedirection();

app.UseCors("RmsPolicy");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
