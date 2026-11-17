using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Divakar.Sanpu.Core.Domain;

public sealed record MenuRow(int MenuId, int? ParentMenuId, string MenuKey, string Title, string? RoutePath, string? IconKey, int SortOrder, bool IsExternal, string? Description = null);

public sealed class MenuNode
{
    public required int Id { get; init; }
    public required string Key { get; init; }
    public required string Title { get; init; }
    public string? Route { get; init; }
    public string? Icon { get; init; }
    public bool IsExternal { get; init; }
    /// <summary>Short line shown under the title in customer mega-menus.</summary>
    public string? Description { get; init; }
    public List<MenuNode> Children { get; } = [];
}

/// <summary>Builds the nested navigation tree. Rows whose ancestor chain is broken or cyclic are dropped,
/// and group nodes (no route) without any visible descendant are pruned.</summary>
public static class MenuTreeBuilder
{
    public static IReadOnlyList<MenuNode> Build(IEnumerable<MenuRow> rows)
    {
        var list = rows.ToList();
        var byId = list.ToDictionary(r => r.MenuId);
        var nodes = list.ToDictionary(r => r.MenuId, r => new MenuNode
        {
            Id = r.MenuId, Key = r.MenuKey, Title = r.Title, Route = r.RoutePath, Icon = r.IconKey, IsExternal = r.IsExternal, Description = r.Description
        });
        var roots = new List<MenuNode>();
        foreach (var r in list.OrderBy(r => r.SortOrder).ThenBy(r => r.MenuId))
        {
            if (!ReachesRoot(r, byId)) continue;            // parent not visible to this user, or a cycle
            if (r.ParentMenuId is null) roots.Add(nodes[r.MenuId]);
            else nodes[r.ParentMenuId.Value].Children.Add(nodes[r.MenuId]);
        }
        return Prune(roots);
    }

    private static bool ReachesRoot(MenuRow row, IReadOnlyDictionary<int, MenuRow> byId)
    {
        var seen = new HashSet<int>();
        var current = row;
        while (current.ParentMenuId is int parent)
        {
            if (!seen.Add(current.MenuId) || !byId.TryGetValue(parent, out var next)) return false;
            current = next;
        }
        return true;
    }

    private static List<MenuNode> Prune(IEnumerable<MenuNode> nodes)
    {
        var kept = new List<MenuNode>();
        foreach (var n in nodes)
        {
            var children = Prune(n.Children);
            n.Children.Clear();
            n.Children.AddRange(children);
            if (n.Route is not null || n.Children.Count > 0) kept.Add(n);
        }
        return kept;
    }

    /// <summary>True if setting <paramref name="newParentId"/> as parent of <paramref name="menuId"/> would create a cycle.</summary>
    public static bool WouldCreateCycle(int menuId, int? newParentId, IReadOnlyDictionary<int, int?> parentOf)
    {
        var seen = new HashSet<int>();
        for (var p = newParentId; p is not null; p = parentOf.TryGetValue(p.Value, out var next) ? next : null)
        {
            if (p == menuId || !seen.Add(p.Value)) return true;
        }
        return false;
    }

    public static IEnumerable<string> Routes(IEnumerable<MenuNode> tree) =>
        tree.SelectMany(n => (n.Route is null ? [] : new[] { n.Route }).Concat(Routes(n.Children)));
}

/// <summary>Typed validation of AppSettings values against ValueType + ValidationJson (min/max/maxLength/allowed/type).</summary>
public static class SettingValueRules
{
    public static string? Validate(string valueType, string? value, string? validationJson)
    {
        if (value is null) return "A value is required.";
        Rule? rule = null;
        if (!string.IsNullOrWhiteSpace(validationJson))
            rule = JsonSerializer.Deserialize<Rule>(validationJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        switch (valueType)
        {
            case "Int":
                if (!long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i)) return "Enter a whole number.";
                return CheckRange(i, rule);
            case "Decimal":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var d)) return "Enter a number.";
                return CheckRange(d, rule);
            case "Bool":
                return value is "true" or "false" ? null : "Use true or false.";
            case "Json":
                try
                {
                    using var doc = JsonDocument.Parse(value);
                    if (rule?.Type == "array" && doc.RootElement.ValueKind != JsonValueKind.Array) return "Enter a JSON array.";
                    if (rule?.Type == "object" && doc.RootElement.ValueKind != JsonValueKind.Object) return "Enter a JSON object.";
                    return null;
                }
                catch (JsonException) { return "Enter valid JSON."; }
            case "SecretRef":
                return Regex.IsMatch(value, "^[A-Z][A-Z0-9_]{2,99}$") ? null : "Enter the NAME of an environment variable (A-Z, 0-9, _), never the secret itself.";
            case "String":
                if (rule?.MaxLength is int max && value.Length > max) return $"Use at most {max} characters.";
                if (rule?.Allowed is { Length: > 0 } allowed && !allowed.Contains(value)) return $"Use one of: {string.Join(", ", allowed)}.";
                return null;
            default:
                return "Unknown value type.";
        }
    }

    private static string? CheckRange(decimal v, Rule? rule)
    {
        if (rule?.Min is decimal min && v < min) return $"Must be at least {min}.";
        if (rule?.Max is decimal max && v > max) return $"Must be at most {max}.";
        return null;
    }

    private sealed record Rule(decimal? Min, decimal? Max, int? MaxLength, string[]? Allowed, string? Type);
}
