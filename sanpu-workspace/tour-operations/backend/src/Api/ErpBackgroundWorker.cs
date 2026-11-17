using Divakar.Sanpu.Erp.Application;

namespace Divakar.Sanpu.Erp.Api;

/// <summary>Every minute: release expired seat holds and retry integration events whose backoff has passed.</summary>
public sealed class ErpBackgroundWorker(IServiceScopeFactory scopes, ILogger<ErpBackgroundWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var released = await scope.ServiceProvider.GetRequiredService<IErpRepository>().ReleaseExpiredHoldsAsync(stoppingToken);
                var retried = await scope.ServiceProvider.GetRequiredService<IntegrationService>().RetryDueAsync(stoppingToken);
                if (released + retried > 0) logger.LogInformation("Released {Holds} expired holds, retried {Events} integration events", released, retried);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Background maintenance failed; will try again next minute");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
