using Divakar.Sanpu.Erp.Application;

namespace Divakar.Sanpu.Erp.Infrastructure;

/// <summary>Stores uploaded images in a local folder (outside the web root; served only through the media endpoint).</summary>
public sealed class LocalMediaStore(string root) : IMediaStore
{
    private readonly string _root = Directory.CreateDirectory(Path.GetFullPath(root)).FullName;

    public async Task SaveAsync(string fileName, byte[] data, CancellationToken ct)
    {
        if (!MediaService.NamePattern.IsMatch(fileName)) throw new ArgumentException("Invalid media name", nameof(fileName));
        await File.WriteAllBytesAsync(Path.Combine(_root, fileName), data, ct);
    }

    public void Delete(string fileName) { if (PathFor(fileName) is { } p) File.Delete(p); }

    public string? PathFor(string fileName)
    {
        if (!MediaService.NamePattern.IsMatch(fileName)) return null;   // also blocks path traversal
        var p = Path.Combine(_root, fileName);
        return File.Exists(p) ? p : null;
    }
}
