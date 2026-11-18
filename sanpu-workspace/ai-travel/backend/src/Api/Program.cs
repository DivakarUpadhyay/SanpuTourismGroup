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
// AI assistant: Claude tool use over Sanpu Travel's public catalog API (Assistant:CatalogApiUrl)
// Gemini (free) first, then ChatGPT, then Claude (order: setting Assistant.ProviderOrder)
builder.Services.AddSingleton(sp => new AnthropicAssistantModel(sp.GetRequiredService<ISecretStore>()));
builder.Services.AddHttpClient<OpenAiAssistantModel>(c => c.Timeout = TimeSpan.FromSeconds(90));
builder.Services.AddHttpClient<GeminiAssistantModel>(c => c.Timeout = TimeSpan.FromSeconds(90));
builder.Services.AddScoped<IAssistantModel, FailoverAssistantModel>();
builder.Services.AddHttpClient<ITravelCatalog, HttpTravelCatalog>(c =>
{
    c.BaseAddress = new Uri((builder.Configuration["Assistant:CatalogApiUrl"] ?? "http://localhost:5101/api/v1").TrimEnd('/') + "/");
    c.Timeout = TimeSpan.FromSeconds(20);
});
builder.Services.AddScoped<IReservationRepository, ReservationRepository>();
builder.Services.AddScoped<AssistantService>();
// payments: ECPay when its keys are configured (Payments:Provider=ECPay), otherwise the simulated provider
var paymentOptions = builder.Configuration.GetSection("Payments").Get<PaymentOptions>() ?? new PaymentOptions();
builder.Services.AddSingleton(paymentOptions);
if (paymentOptions.Provider.Equals("ECPay", StringComparison.OrdinalIgnoreCase) && paymentOptions.Ecpay.IsConfigured)
    builder.Services.AddHttpClient<IPaymentGateway, EcpayPaymentGateway>(c => c.Timeout = TimeSpan.FromSeconds(20));
else
    builder.Services.AddSingleton<IPaymentGateway, SimulatedPaymentGateway>();
builder.Services.AddScoped<IReservationPaymentRepository, ReservationPaymentRepository>();
builder.Services.AddScoped<ReservationPaymentService>();

var app = builder.Build();
if (await SanpuCli.TryRunAsync(app, args)) return;
app.UseSanpuCore();
app.Run();

public partial class Program;
