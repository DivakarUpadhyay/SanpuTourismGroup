using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Divakar.Sanpu.Core.Application;

namespace Divakar.Sanpu.Erp.Application;

public sealed record MediaUploaded(string Url, string FileName, bool Duplicate);
public sealed record MediaRow { public string FileName { get; init; } = ""; public string OriginalName { get; init; } = ""; public string ContentType { get; init; } = ""; public int SizeBytes { get; init; } public DateTime CreatedAtUtc { get; init; } public string UploadedByName { get; init; } = ""; public string Url => MediaService.UrlFor(FileName); }
public sealed record MediaInsertRow { public string FileName { get; init; } = ""; public bool Duplicate { get; init; } }

/// <summary>Where uploaded files are kept (local folder today; a blob store later without touching callers).</summary>
public interface IMediaStore
{
    Task SaveAsync(string fileName, byte[] data, CancellationToken ct);
    void Delete(string fileName);
    /// <summary>Full path of a stored file, or null when the name is invalid or the file does not exist.</summary>
    string? PathFor(string fileName);
}

/// <summary>Image uploads for tours, services and banners. The file type is decided from the bytes, never from the name or header.</summary>
public sealed class MediaService(ICustomerRepository repo, IMediaStore store, ICurrentUser current)
{
    public const int MaxBytes = 5 * 1024 * 1024;
    public static readonly Regex NamePattern = new("^[a-f0-9]{32}\\.(jpg|png|webp)$", RegexOptions.Compiled);
    public static string UrlFor(string fileName) => $"/api/v1/media/{fileName}";
    public static string ContentTypeFor(string fileName) => Path.GetExtension(fileName) switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };

    /// <summary>JPEG, PNG or WebP by signature; null for anything else.</summary>
    public static (string Ext, string Type)? Sniff(ReadOnlySpan<byte> b) =>
        b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF ? (".jpg", "image/jpeg")
        : b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47 && b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A ? (".png", "image/png")
        : b.Length >= 12 && b[0] == (byte)'R' && b[1] == (byte)'I' && b[2] == (byte)'F' && b[3] == (byte)'F' && b[8] == (byte)'W' && b[9] == (byte)'E' && b[10] == (byte)'B' && b[11] == (byte)'P' ? (".webp", "image/webp")
        : null;

    public async Task<MediaUploaded> UploadAsync(Stream data, string? originalName, long length, CancellationToken ct)
    {
        if (length <= 0) throw AppException.Validation("file", "Choose an image to upload.");
        if (length > MaxBytes) throw AppException.Validation("file", "The image is larger than 5 MB. Please use a smaller photo.");
        using var ms = new MemoryStream();
        await data.CopyToAsync(ms, ct);
        var bytes = ms.ToArray();
        if (bytes.Length > MaxBytes) throw AppException.Validation("file", "The image is larger than 5 MB. Please use a smaller photo.");
        var kind = Sniff(bytes) ?? throw AppException.Validation("file", "Use a JPG, PNG or WebP image.");
        var sha = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        var name = Guid.NewGuid().ToString("N") + kind.Ext;
        await store.SaveAsync(name, bytes, ct);
        var safeOriginal = Path.GetFileName(originalName ?? "image");
        var row = await repo.InsertMediaAsync(name, safeOriginal.Length > 200 ? safeOriginal[..200] : safeOriginal, kind.Type, bytes.Length, sha, current.RequireUserId(), current.CorrelationId, ct);
        if (row.Duplicate) store.Delete(name);   // same picture already uploaded: reuse it
        return new MediaUploaded(UrlFor(row.FileName), row.FileName, row.Duplicate);
    }

    public Task<IReadOnlyList<MediaRow>> ListAsync(CancellationToken ct) => repo.ListMediaAsync(ct);
}
