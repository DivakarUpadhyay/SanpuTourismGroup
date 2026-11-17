using Divakar.Sanpu.Core.Api;
using Divakar.Sanpu.Erp.Api;
using Divakar.Sanpu.Erp.Application;
using Divakar.Sanpu.Erp.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
builder.AddSanpuCore();
builder.Services.AddScoped<IErpRepository, ErpRepository>();
builder.Services.AddScoped<CatalogService>();
builder.Services.AddScoped<ICustomerRepository, CustomerRepository>();
builder.Services.AddScoped<HelpContactService>();
builder.Services.AddScoped<DiscoveryService>();
builder.Services.AddScoped<MarketingService>();
builder.Services.AddScoped<TravelServicesService>();
// payments: ECPay when its keys are configured (Payments:Provider=ECPay), otherwise the simulated provider
var paymentOptions = builder.Configuration.GetSection("Payments").Get<PaymentOptions>() ?? new PaymentOptions();
builder.Services.AddSingleton(paymentOptions);
if (paymentOptions.Provider.Equals("ECPay", StringComparison.OrdinalIgnoreCase) && paymentOptions.Ecpay.IsConfigured)
    builder.Services.AddHttpClient<IPaymentGateway, EcpayPaymentGateway>(c => c.Timeout = TimeSpan.FromSeconds(20));
else
    builder.Services.AddSingleton<IPaymentGateway, SimulatedPaymentGateway>();
builder.Services.AddScoped<PaymentService>();
// uploaded images: a local folder outside the web root (Media:Root), served by MediaController
builder.Services.AddSingleton<IMediaStore>(new LocalMediaStore(builder.Configuration["Media:Root"] ?? Path.Combine(builder.Environment.ContentRootPath, "..", "..", "..", "..", "storage", "media")));
builder.Services.AddScoped<MediaService>();
builder.Services.AddScoped<CustomerBookingService>();
builder.Services.AddScoped<BookingOpsService>();
builder.Services.AddScoped<ApprovalService>();
builder.Services.AddScoped<OpsService>();
builder.Services.AddScoped<IntegrationService>();
builder.Services.AddScoped<ReconciliationService>();
builder.Services.AddScoped<GroupSimService>();
if (args.Length == 0) builder.Services.AddHostedService<ErpBackgroundWorker>();

var app = builder.Build();
if (await SanpuCli.TryRunAsync(app, args)) return;
app.UseSanpuCore();
app.Run();

public partial class Program;
