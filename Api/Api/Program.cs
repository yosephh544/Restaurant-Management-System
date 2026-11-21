using RestaurantManagement.Api.Extensions;
using RestaurantManagement.Api.Json;

var builder = WebApplication.CreateBuilder(args);

// ── Application Services ──────────────────────────────────────────────────────
builder.Services.AddDatabase(builder.Configuration);

builder.Services.AddCors(options =>
{
    options.AddPolicy("RmsPolicy", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:4309",
                "https://localhost:4309",
                "http://196.190.251.194:4309")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddApplicationServices();
builder.Services.AddAuthorizationPolicies();

builder.Services.AddControllers()
    .AddJsonOptions(options => options.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter()));
builder.Services.AddEndpointsApiExplorer();

// Swagger is a development-only tool; it is never registered or served in production.
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddSwaggerWithJwt();
}

// ─────────────────────────────────────────────────────────────────────────────

var app = builder.Build();

await DatabaseSeeder.SeedOwnerAsync(app.Services);

// ── Middleware pipeline ───────────────────────────────────────────────────────
// Must be first to catch unhandled exceptions across all subsequent middleware
app.UseGlobalExceptionHandler();

// Menu photos are written to wwwroot/uploads/menu at runtime.
app.UseStaticFiles();

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
