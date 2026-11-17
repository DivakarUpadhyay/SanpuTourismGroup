using Divakar.Sanpu.Core.Api;
using Divakar.Sanpu.Erp.Application;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Divakar.Sanpu.Erp.Api;

[ApiController, Route("api/v1"), Tags("Media")]
public sealed class MediaController(MediaService media, IMediaStore store) : ControllerBase
{
    /// <summary>Upload a tour, service or banner image (JPG, PNG or WebP, up to 5 MB). The file type is checked from its bytes.</summary>
    [HttpPost("ops/media"), HasPermission("Catalog.Edit|Service.Manage|Marketing.Manage"), RequestSizeLimit(6 * 1024 * 1024), Consumes("multipart/form-data")]
    public async Task<IActionResult> Upload(IFormFile file, CancellationToken ct)
    {
        await using var s = file.OpenReadStream();
        return StatusCode(201, await media.UploadAsync(s, file.FileName, file.Length, ct));
    }

    [HttpGet("ops/media"), HasPermission("Catalog.Edit|Service.Manage|Marketing.Manage")]
    public Task<IReadOnlyList<MediaRow>> List(CancellationToken ct) => media.ListAsync(ct);

    /// <summary>Public image file. Names are random; responses are cacheable and can never be run as a page.</summary>
    [HttpGet("media/{name}"), AllowAnonymous, ApiExplorerSettings(IgnoreApi = true)]
    public IActionResult Get(string name)
    {
        var path = store.PathFor(name);
        if (path is null) return NotFound();
        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers["Content-Security-Policy"] = "default-src 'none'";
        return PhysicalFile(path, MediaService.ContentTypeFor(name));
    }
}
