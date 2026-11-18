using System.Globalization;
using System.Text.RegularExpressions;

namespace Divakar.Sanpu.AiOps.Application;

/// <summary>What a traveler asked for, read from plain English without a model: used when no AI service can answer.</summary>
public sealed record TripQuery
{
    public string Intent { get; init; } = "unknown";   // hotel, flight, bus, taxi, tours, plan, compare, mybookings, greeting, unknown
    public string? From { get; init; }
    public string? To { get; init; }
    public DateTime? Date { get; init; }
    public DateTime? End { get; init; }
    public int? Nights { get; init; }
    public int? Travelers { get; init; }
    public decimal? Budget { get; init; }
    public int? Days { get; init; }
    public IReadOnlyList<string> Interests { get; init; } = [];
    public string? UnknownPlace { get; init; }
    public bool PastDate { get; init; }
    public IReadOnlyList<string> CompareParts { get; init; } = [];
}

public static partial class TripQueryParser
{
    private static readonly (string Alias, string City)[] Places =
    [
        ("sun moon lake", "Sun Moon Lake"), ("sunmoon", "Sun Moon Lake"), ("taipei", "Taipei"), ("songshan", "Taipei"), ("xinyi", "Taipei"), ("zhongshan", "Taipei"),
        ("taoyuan", "Taoyuan"), ("kaohsiung", "Kaohsiung"), ("taichung", "Taichung"), ("hualien", "Hualien"), ("taroko", "Hualien"), ("taitung", "Taitung"),
        ("kinmen", "Kinmen"), ("tainan", "Tainan"), ("anping", "Tainan"), ("chiayi", "Chiayi"), ("alishan", "Alishan"),
    ];
    public static readonly IReadOnlyDictionary<string, Regex> InterestWords = new Dictionary<string, Regex>
    {
        ["food"] = new(@"food|cook|flavou?r|market", RegexOptions.IgnoreCase),
        ["nature"] = new(@"hik|trail|forest|gorge|mountain|cliff|wetland|bird", RegexOptions.IgnoreCase),
        ["culture"] = new(@"temple|heritage|culture|histor|old town|craft|village|architecture", RegexOptions.IgnoreCase),
        ["cycling"] = new(@"cycl|bicycle|\bbike", RegexOptions.IgnoreCase),
        ["water"] = new(@"\blake|\bsea\b|coast|beach|snorkel|whale|paddle|island", RegexOptions.IgnoreCase),
        ["wellness"] = new(@"hot spring|\btea\b", RegexOptions.IgnoreCase),
    };
    private static readonly string[] Months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    private static readonly string[] WeekDays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    private static readonly HashSet<string> NotPlaces = new(StringComparer.OrdinalIgnoreCase)
    {
        "taiwan", "the", "my", "a", "an", "our", "your", "total", "town", "city", "advance", "budget", "twd", "ntd", "north", "south", "east", "west", "central", "morning", "afternoon",
        "evening", "night", "tomorrow", "today", "next", "this", "days", "day", "weekend", "week", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
        "november", "december", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "book", "find", "plan", "see", "go", "get", "visit", "airport", "hotel", "under", "from", "and",
    };

    public static TripQuery Parse(string message, DateTime today)
    {
        var text = message.Trim();
        var m = text.ToLowerInvariant();
        var (from, to) = ReadPlaces(m);
        var (date, end, past) = ReadDates(m, today);
        var nights = Num(NightsRx().Match(m));
        if (date is not null && end is null && nights is > 0) end = date.Value.AddDays(nights.Value);
        var q = new TripQuery
        {
            Intent = ReadIntent(m, from is not null), From = from, To = to, Date = date, End = end, Nights = nights, PastDate = past,
            Travelers = ReadTravelers(m), Budget = ReadBudget(m), Days = Num(DaysRx().Match(m)) ?? Num(DayNightRx().Match(m)),
            Interests = [.. InterestWords.Where(kv => kv.Value.IsMatch(m)).Select(kv => kv.Key)],
        };
        if (from is null && q.Intent is "hotel" or "flight" or "bus" or "taxi" or "tours" or "plan" or "unknown")
            foreach (Match x in PlaceWordRx().Matches(text))
                if (from is null && !NotPlaces.Contains(x.Groups[1].Value)) return q with { UnknownPlace = Title(x.Groups[1].Value) };
        if (q.Intent == "compare") q = q with { CompareParts = [.. CompareSplitRx().Split(CompareLeadRx().Replace(m, " ")).Select(p => p.Trim()).Where(p => p.Length > 2)] };
        return q;
    }

    private static string Title(string s) => CultureInfo.InvariantCulture.TextInfo.ToTitleCase(s.ToLowerInvariant());
    private static int? Num(Match x) => x.Success && int.TryParse(x.Groups[1].Value, out var n) ? n : null;

    private static string ReadIntent(string m, bool hasPlace)
    {
        if (MyBookingsRx().IsMatch(m)) return "mybookings";
        if (CompareRx().IsMatch(m)) return "compare";
        if (GreetingRx().IsMatch(m)) return "greeting";
        if (TaxiRx().IsMatch(m)) return "taxi";
        if (FlightRx().IsMatch(m)) return "flight";
        if (BusRx().IsMatch(m)) return "bus";
        if (HotelRx().IsMatch(m)) return "hotel";
        if (PlanRx().IsMatch(m)) return "plan";
        if (TourRx().IsMatch(m) || hasPlace) return "tours";
        return "unknown";
    }

    /// <summary>"from A to B" first; otherwise the places in the order they were mentioned.</summary>
    private static (string? From, string? To) ReadPlaces(string m)
    {
        string? At(string pattern) { foreach (var (a, c) in Places) if (Regex.IsMatch(m, $@"\b{pattern}\s+(the\s+)?{a}\b")) return c; return null; }
        string? from = At("from"), to = At("to");
        var seen = Places.Select(p => (Pos: Regex.Match(m, $@"\b{p.Alias}\b"), p.City)).Where(x => x.Pos.Success).OrderBy(x => x.Pos.Index).Select(x => x.City).Distinct().ToList();
        from ??= seen.FirstOrDefault(c => c != to);
        to ??= seen.FirstOrDefault(c => c != from);
        return (from, to);
    }

    private static (DateTime? Date, DateTime? End, bool Past) ReadDates(string m, DateTime today)
    {
        var found = new List<DateTime>();
        foreach (Match x in IsoRx().Matches(m))
            if (DateTime.TryParseExact(x.Value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) found.Add(d);
        foreach (Match x in MonthDayRx().Matches(m)) found.Add(NextOccurrence(Array.IndexOf(Months, x.Groups[1].Value[..3]) + 1, int.Parse(x.Groups[2].Value), today));
        foreach (Match x in DayMonthRx().Matches(m)) found.Add(NextOccurrence(Array.IndexOf(Months, x.Groups[2].Value[..3]) + 1, int.Parse(x.Groups[1].Value), today));
        if (found.Count > 0) return (found[0], found.Count > 1 ? found[1] : null, found[0].Date <= today.Date.AddDays(-1));
        if (m.Contains("day after tomorrow")) return (today.AddDays(2), null, false);
        if (m.Contains("tomorrow") || TodayRx().IsMatch(m)) return (today.AddDays(1), null, false);
        if (m.Contains("weekend")) return (Next(DayOfWeek.Saturday, today), null, false);
        if (m.Contains("next week")) return (today.AddDays(7), null, false);
        for (var i = 0; i < 7; i++) if (Regex.IsMatch(m, $@"\b{WeekDays[i]}\b")) return (Next((DayOfWeek)i, today), null, false);
        return (null, null, false);
    }

    private static DateTime Next(DayOfWeek d, DateTime today) { var gap = ((int)d - (int)today.DayOfWeek + 7) % 7; return today.AddDays(gap == 0 ? 7 : gap); }
    private static DateTime NextOccurrence(int month, int day, DateTime today)
    {
        day = Math.Clamp(day, 1, DateTime.DaysInMonth(today.Year, month));
        var d = new DateTime(today.Year, month, day);
        return d < today.Date ? new DateTime(today.Year + 1, month, Math.Min(day, DateTime.DaysInMonth(today.Year + 1, month))) : d;
    }

    private static int? ReadTravelers(string m)
    {
        var n = Num(PeopleRx().Match(m)) ?? Num(FamilyRx().Match(m)) ?? Num(ForNRx().Match(m));
        if (n is > 0 and <= 20) return n;
        if (CoupleRx().IsMatch(m)) return 2;
        return SoloRx().IsMatch(m) ? 1 : null;
    }

    private static decimal? ReadBudget(string m)
    {
        var x = BudgetRx().Match(m);
        if (!x.Success || !decimal.TryParse(x.Groups[1].Value.Replace(",", ""), NumberStyles.Number, CultureInfo.InvariantCulture, out var v)) return null;
        return x.Groups[2].Success ? v * 1000 : v;
    }

    [GeneratedRegex(@"\b(\d+)\s*-?\s*nights?\b")] private static partial Regex NightsRx();
    [GeneratedRegex(@"\b(\d+)\s*-?\s*days?\b")] private static partial Regex DaysRx();
    [GeneratedRegex(@"\b(\d+)d\d+n\b")] private static partial Regex DayNightRx();
    [GeneratedRegex(@"\b(?:in|to|at|near|visit)\s+([A-Za-z]{3,})\b", RegexOptions.IgnoreCase)] private static partial Regex PlaceWordRx();
    [GeneratedRegex(@"\s+(?:and|vs\.?|versus|with|or)\s+|,")] private static partial Regex CompareSplitRx();
    [GeneratedRegex(@"\b(compare|the|tours?|please|between|difference)\b")] private static partial Regex CompareLeadRx();
    [GeneratedRegex(@"\bmy (bookings?|reservations?|trips?)\b")] private static partial Regex MyBookingsRx();
    [GeneratedRegex(@"\bcompare\b|\bvs\.?\b|\bversus\b|difference between")] private static partial Regex CompareRx();
    [GeneratedRegex(@"^\s*(hi|hello|hey|hiya|good (morning|afternoon|evening)|thanks|thank you|ok|okay)\b[\s!.,]*(there)?[\s!.]*$")] private static partial Regex GreetingRx();
    [GeneratedRegex(@"\b(taxis?|cabs?|transfers?|pick-?up|limo)\b")] private static partial Regex TaxiRx();
    [GeneratedRegex(@"\b(flights?|fly|flying|plane)\b")] private static partial Regex FlightRx();
    [GeneratedRegex(@"\b(bus|buses|coach|coaches)\b")] private static partial Regex BusRx();
    [GeneratedRegex(@"\b(hotels?|stays?|rooms?|accommodation|guesthouse|inn|lodge|resort)\b")] private static partial Regex HotelRx();
    [GeneratedRegex(@"\b(plan|itinerary|schedule)\b")] private static partial Regex PlanRx();
    [GeneratedRegex(@"\b(tours?|trips?|packages?|holiday|vacation|things to do|sightseeing)\b")] private static partial Regex TourRx();
    [GeneratedRegex(@"\b\d{4}-\d{2}-\d{2}\b")] private static partial Regex IsoRx();
    [GeneratedRegex(@"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b")] private static partial Regex MonthDayRx();
    [GeneratedRegex(@"\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b")] private static partial Regex DayMonthRx();
    [GeneratedRegex(@"\b(today|tonight)\b")] private static partial Regex TodayRx();
    [GeneratedRegex(@"\b(\d+)\s*(?:people|persons?|guests?|adults?|travell?ers?|pax|passengers?)\b")] private static partial Regex PeopleRx();
    [GeneratedRegex(@"\bfamily of (\d+)\b")] private static partial Regex FamilyRx();
    [GeneratedRegex(@"\bfor (\d+)\b(?!\s*-?\s*(?:nights?|days?|twd|ntd))(?![,\d])")] private static partial Regex ForNRx();
    [GeneratedRegex(@"\b(couple|two of us)\b")] private static partial Regex CoupleRx();
    [GeneratedRegex(@"\b(solo|alone|just me|by myself)\b")] private static partial Regex SoloRx();
    [GeneratedRegex(@"\b(?:under|below|less than|cheaper than|max(?:imum)?|budget(?: of| is)?|up to|within)\s*(?:twd|ntd|nt\$?|\$)?\s*(\d[\d,]*)\s*(k\b)?")] private static partial Regex BudgetRx();
}
