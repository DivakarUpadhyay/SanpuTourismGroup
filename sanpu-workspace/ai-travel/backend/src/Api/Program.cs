using Divakar.Sanpu.AiOps.Application;
using Divakar.Sanpu.AiOps.Infrastructure;
using Divakar.Sanpu.Core.Api;
using Divakar.Sanpu.Core.Application;

var builder = WebApplication.CreateBuilder(args);
builder.AddSanpuCore();
builder.Services.AddScoped<IAiOpsRepository, AiOpsRepository>();
builder.Services.AddSingleton<IAiProvider>(sp => new AnthropicProvider(sp.GetRequiredService<ISecretStore>()));
builder.Services.AddSingleton<IDocumentStore>(new LocalDocumentStore(builder.Configuration["Sanpu:DocumentRoot"]
    ?? Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "..", "..", "storage", "documents"))));
builder.Services.AddScoped<AiGateway>();
builder.Services.AddScoped<TripService>();
builder.Services.AddScoped<RecoveryService>();
builder.Services.AddScoped<SearchService>();
builder.Services.AddScoped<DocumentService>();
builder.Services.AddScoped<EvalService>();
builder.Services.AddScoped<CopilotAdminService>();

var app = builder.Build();
if (await SanpuCli.TryRunAsync(app, args)) return;
app.UseSanpuCore();
app.Run();

public partial class Program;
