"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon, money } from "@sanpu/web";

const PAGE = 12;

/** Shows results a page at a time; the page resets whenever the filters change. */
function usePaged<T>(rows: T[], key: string) {
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [key]);
  return { visible: rows.slice(0, shown), more: rows.length - shown, loadMore: () => setShown((n) => n + PAGE) };
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="af-group"><legend>{title}</legend>{children}</fieldset>;
}

interface Option<T> { value: T; label: string; hint?: string; count?: number }

/** Choices with the number of results each would give; a choice that would give nothing is switched off. */
function Chips<T extends string | number>({ options, value, onChange, testId, limit = 8 }: { options: Option<T>[]; value: T[]; onChange: (v: T[]) => void; testId: string; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? options : options.filter((o, i) => i < limit || value.includes(o.value));
  return (
    <div className="af-chips">
      {shown.map((o) => {
        const on = value.includes(o.value);
        return <button type="button" key={String(o.value)} aria-pressed={on} className={on ? "on" : ""} disabled={!on && o.count === 0} data-testid={`${testId}-${o.value}`}
          onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}>{o.label}{o.hint && <small>{o.hint}</small>}{o.count !== undefined && <span className="n">{o.count}</span>}</button>;
      })}
      {options.length > limit && <button type="button" className="af-all" onClick={() => setAll(!all)}>{all ? "Show less" : `Show all ${options.length}`}</button>}
    </div>
  );
}

/** Slider for a highest value. The far right always includes the highest result. */
function Range({ min, max, step, value, onChange, format, label, testId }: { min: number; max: number; step: number; value: number; onChange: (v: number | null) => void; format: (v: number) => string; label: string; testId: string }) {
  const top = min + Math.ceil((max - min) / step) * step;
  return (
    <div className="af-price">
      <input type="range" min={min} max={top} step={step} value={value >= max ? top : value} onChange={(e) => { const v = Number(e.target.value); onChange(v >= max ? null : v); }} aria-label={label} data-testid={testId} />
      <div><span>{format(min)}</span><b>up to {format(Math.min(value, max))}</b></div>
    </div>
  );
}
const priceStep = (lo: number, hi: number) => Math.max(10, Math.round((hi - lo) / 40 / 10) * 10);

function Panel({ count, total, active, onClear, children }: { count: number; total: number; active: number; onClear: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <aside className={`af-panel${open ? " open" : ""}`} aria-label="Filters">
      <button type="button" className="af-toggle" onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="sliders" size={16} /> Filters{active ? ` (${active})` : ""}</button>
      <div className="af-body">
        <div className="af-head"><b>Filters</b>{active > 0 && <button type="button" className="link" onClick={onClear} data-testid="af-clear">Clear all</button>}</div>
        <p className="af-count" data-testid="af-count">{count} of {total} shown</p>
        {children}
      </div>
    </aside>
  );
}

interface Tag { key: string; label: string; remove: () => void }

/** The filters in use, above the results. Each one can be removed on its own. */
function Tags({ tags, count, total, noun, onClear }: { tags: Tag[]; count: number; total: number; noun: string; onClear: () => void }) {
  return (
    <div className="af-tags" data-testid="af-tags" aria-live="polite">
      <span className="af-tags-count">{tags.length ? <><b>{count}</b> of {total} {noun}</> : <>All <b>{total}</b> {noun}</>}</span>
      {tags.map((t) => <button type="button" key={t.key} className="af-tag" onClick={t.remove} aria-label={`Remove filter: ${t.label}`} data-testid="af-tag">{t.label}<span aria-hidden="true">×</span></button>)}
      {tags.length > 1 && <button type="button" className="af-tags-clear" onClick={onClear}>Clear all</button>}
    </div>
  );
}

function Empty({ onClear }: { onClear: () => void }) {
  return <div className="af-empty" data-testid="af-empty"><Icon name="search" size={22} /><b>Nothing matches these filters</b><span>Try a higher price or fewer options.</span><button type="button" className="btn small" onClick={onClear}>Clear filters</button></div>;
}

function More({ more, onMore }: { more: number; onMore: () => void }) {
  return more > 0 ? <div className="af-more"><button type="button" className="btn" onClick={onMore} data-testid="af-more">Load {Math.min(more, PAGE)} more</button><small className="muted">{more} more available</small></div> : null;
}

const without = <T,>(list: T[], item: T) => list.filter((x) => x !== item);
const uniqueSorted = (values: (string | null | undefined)[]) => [...new Set(values.filter(Boolean) as string[])].sort();

// ---------------- hotels, flights, buses, taxis ----------------
export interface ServiceRow { code: string; kind: string; totalPrice: number; rating?: number | null; features?: string | null; departTime?: string | null; durationMin?: number | null; providerName?: string | null; peoplePerUnit?: number; fromCity?: string | null; toCity?: string | null }
const SLOTS = [{ value: "night", label: "Night", hint: "00-05", from: 0, to: 5 }, { value: "morning", label: "Morning", hint: "05-12", from: 5, to: 12 }, { value: "afternoon", label: "Afternoon", hint: "12-17", from: 12, to: 17 }, { value: "evening", label: "Evening", hint: "17-24", from: 17, to: 24 }];
const RATINGS = [4, 4.5, 4.8];
const NOUNS: Record<string, string> = { Hotel: "hotels", Flight: "flights", Bus: "buses", Taxi: "taxis" };
const TIME_TITLE: Record<string, string> = { Flight: "Flight time", Bus: "Journey time", Taxi: "Ride time" };
const featuresOf = (r: ServiceRow) => (r.features ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const slotOf = (r: ServiceRow) => { if (!r.departTime) return null; const h = Number(r.departTime.slice(0, 2)); return SLOTS.find((s) => h >= s.from && h < s.to)?.value ?? null; };
const minutes = (m: number) => `${Math.floor(m / 60) ? `${Math.floor(m / 60)} h ` : ""}${m % 60 || !Math.floor(m / 60) ? `${m % 60} min` : ""}`.trim();

export function ServiceResults<T extends ServiceRow>({ list, kind, render }: { list: T[]; kind: string; render: (r: T) => ReactNode }) {
  const prices = list.map((r) => r.totalPrice);
  const lo = Math.floor(Math.min(...prices)), hi = Math.ceil(Math.max(...prices));
  const times = list.map((r) => r.durationMin ?? 0).filter(Boolean);
  const tLo = times.length ? Math.floor(Math.min(...times) / 5) * 5 : 0, tHi = times.length ? Math.ceil(Math.max(...times) / 5) * 5 : 0;
  const [price, setPrice] = useState<number | null>(null);
  const [time, setTime] = useState<number | null>(null);
  const [rating, setRating] = useState(0);
  const [slots, setSlots] = useState<string[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const timed = kind === "Flight" || kind === "Bus";
  const allProviders = useMemo(() => uniqueSorted(list.map((r) => r.providerName)), [list]);
  const allOrigins = useMemo(() => uniqueSorted(list.map((r) => r.fromCity)), [list]);
  const allTargets = useMemo(() => uniqueSorted(list.map((r) => r.toCity)), [list]);
  const allFeatures = useMemo(() => {
    const n = new Map<string, number>(); list.forEach((r) => featuresOf(r).forEach((f) => n.set(f, (n.get(f) ?? 0) + 1)));
    return [...n.entries()].filter(([, c]) => c < list.length).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([f]) => f);   // a feature every result has filters nothing
  }, [list]);
  const cap = price ?? hi, longest = time ?? tHi;
  const tests: Record<string, (r: T) => boolean> = {
    price: (r) => r.totalPrice <= cap, time: (r) => r.durationMin == null || r.durationMin <= longest, rating: (r) => !rating || (r.rating ?? 0) >= rating,
    slot: (r) => !slots.length || slots.includes(slotOf(r) ?? ""), provider: (r) => !providers.length || providers.includes(r.providerName ?? ""),
    from: (r) => !origins.length || origins.includes(r.fromCity ?? ""), to: (r) => !targets.length || targets.includes(r.toCity ?? ""),
    feature: (r) => features.every((f) => featuresOf(r).includes(f)),
  };
  /** How many results a choice gives together with the filters of the other groups. */
  const countFor = (group: string, match: (r: T) => boolean) => list.filter((r) => Object.entries(tests).every(([k, t]) => k === group || t(r)) && match(r)).length;
  const rows = list.filter((r) => Object.values(tests).every((t) => t(r)));
  const clear = () => { setPrice(null); setTime(null); setRating(0); setSlots([]); setProviders([]); setOrigins([]); setTargets([]); setFeatures([]); };
  const tags: Tag[] = [
    ...(price !== null ? [{ key: "price", label: `Up to ${money(price, "TWD")}`, remove: () => setPrice(null) }] : []),
    ...(time !== null ? [{ key: "time", label: `Up to ${minutes(time)}`, remove: () => setTime(null) }] : []),
    ...(rating ? [{ key: "rating", label: `Rated ${rating.toFixed(1)}+`, remove: () => setRating(0) }] : []),
    ...slots.map((s) => ({ key: `slot-${s}`, label: SLOTS.find((x) => x.value === s)?.label ?? s, remove: () => setSlots(without(slots, s)) })),
    ...providers.map((p) => ({ key: `provider-${p}`, label: p, remove: () => setProviders(without(providers, p)) })),
    ...origins.map((c) => ({ key: `from-${c}`, label: `From ${c}`, remove: () => setOrigins(without(origins, c)) })),
    ...targets.map((c) => ({ key: `to-${c}`, label: `To ${c}`, remove: () => setTargets(without(targets, c)) })),
    ...features.map((f) => ({ key: `feature-${f}`, label: f, remove: () => setFeatures(without(features, f)) })),
  ];
  const page = usePaged(rows, JSON.stringify([cap, longest, rating, slots, providers, origins, targets, features, list.length]));
  const usedSlots = SLOTS.filter((s) => list.some((r) => slotOf(r) === s.value));
  const cityOptions = (cities: string[], group: string, field: "fromCity" | "toCity") => cities.map((c) => ({ value: c, label: c, count: countFor(group, (r) => r[field] === c) }));
  return (
    <div className="af-layout">
      <Panel count={rows.length} total={list.length} active={tags.length} onClear={clear}>
        {hi > lo && <Group title="Total price"><Range min={lo} max={hi} step={priceStep(lo, hi)} value={cap} onChange={setPrice} format={(v) => money(v, "TWD")} label="Highest price" testId="af-price" /></Group>}
        {timed && usedSlots.length > 1 && <Group title="Departure time"><Chips options={usedSlots.map((s) => ({ value: s.value, label: s.label, hint: s.hint, count: countFor("slot", (r) => slotOf(r) === s.value) }))} value={slots} onChange={setSlots} testId="af-slot" /></Group>}
        {kind !== "Hotel" && tHi > tLo && <Group title={TIME_TITLE[kind] ?? "Trip time"}><Range min={tLo} max={tHi} step={5} value={longest} onChange={setTime} format={minutes} label="Longest trip" testId="af-time" /></Group>}
        {kind !== "Hotel" && allProviders.length > 1 && <Group title={kind === "Flight" ? "Airline" : kind === "Bus" ? "Operator" : "Provider"}><Chips options={allProviders.map((p) => ({ value: p, label: p, count: countFor("provider", (r) => r.providerName === p) }))} value={providers} onChange={setProviders} testId="af-provider" /></Group>}
        {allOrigins.length > 1 && <Group title={kind === "Hotel" ? "City" : kind === "Taxi" ? "Pickup" : "From"}><Chips options={cityOptions(allOrigins, "from", "fromCity")} value={origins} onChange={setOrigins} testId="af-from" limit={6} /></Group>}
        {allTargets.length > 1 && <Group title={kind === "Taxi" ? "Drop-off" : "To"}><Chips options={cityOptions(allTargets, "to", "toCity")} value={targets} onChange={setTargets} testId="af-to" limit={6} /></Group>}
        <Group title="Guest rating"><div className="af-chips">
          <button type="button" className={rating === 0 ? "on" : ""} aria-pressed={rating === 0} onClick={() => setRating(0)} data-testid="af-rating-0">Any</button>
          {RATINGS.map((v) => { const n = countFor("rating", (r) => (r.rating ?? 0) >= v); return <button type="button" key={v} className={rating === v ? "on" : ""} aria-pressed={rating === v} disabled={n === 0 && rating !== v} onClick={() => setRating(v)} data-testid={`af-rating-${v}`}>{v.toFixed(1)}+<span className="n">{n}</span></button>; })}
        </div></Group>
        {allFeatures.length > 0 && <Group title="Features"><Chips options={allFeatures.map((f) => ({ value: f, label: f, count: countFor("none", (r) => featuresOf(r).includes(f)) }))} value={features} onChange={setFeatures} testId="af-feature" /></Group>}
      </Panel>
      <div className="af-results">
        <Tags tags={tags} count={rows.length} total={list.length} noun={NOUNS[kind] ?? "options"} onClear={clear} />
        {rows.length === 0 ? <Empty onClear={clear} /> : <div className="svc-list" data-testid="svc-results">{page.visible.map(render)}</div>}
        <More more={page.more} onMore={page.loadMore} />
      </div>
    </div>
  );
}

// ---------------- tours ----------------
export interface TourRow { code: string; title: string; days: number; fromPrice?: number | null; destinationName?: string | null; region?: string | null; slogan?: string | null; summary?: string | null }
const LENGTHS = [{ value: "1", label: "1 day" }, { value: "2", label: "2 days" }, { value: "3", label: "3 days" }, { value: "4", label: "4+ days" }];
const THEMES: { value: string; label: string; words: RegExp }[] = [
  { value: "food", label: "Food", words: /food|market|cook|taste|flavou?r|oyster/i }, { value: "nature", label: "Nature & hiking", words: /hik|trail|forest|gorge|mountain|cliff|wetland|bird/i },
  { value: "culture", label: "Culture & history", words: /temple|heritage|culture|histor|old town|craft|village|architecture/i }, { value: "cycling", label: "Cycling", words: /cycl|bicycle|\bbike\b/i },
  { value: "water", label: "Lakes & sea", words: /lake|sea|coast|beach|snorkel|whale|paddle|island/i }, { value: "wellness", label: "Hot springs & tea", words: /hot spring|tea/i },
];
const lengthOf = (t: TourRow) => (t.days >= 4 ? "4" : String(t.days));
const hasTheme = (t: TourRow, theme: { words: RegExp }) => theme.words.test(`${t.title} ${t.slogan ?? ""} ${t.summary ?? ""}`);

export function TourResults<T extends TourRow>({ list, render }: { list: T[]; render: (t: T) => ReactNode }) {
  const prices = list.map((t) => t.fromPrice ?? 0).filter(Boolean);
  const lo = prices.length ? Math.floor(Math.min(...prices)) : 0, hi = prices.length ? Math.ceil(Math.max(...prices)) : 0;
  const [price, setPrice] = useState<number | null>(null);
  const [lengths, setLengths] = useState<string[]>([]);
  const [themes, setThemes] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const allRegions = useMemo(() => uniqueSorted(list.map((t) => t.region)), [list]);
  const cap = price ?? hi;
  const tests: Record<string, (t: T) => boolean> = {
    price: (t) => (t.fromPrice ?? 0) <= cap, length: (t) => !lengths.length || lengths.includes(lengthOf(t)), region: (t) => !regions.length || regions.includes(t.region ?? ""),
    theme: (t) => !themes.length || THEMES.some((x) => themes.includes(x.value) && hasTheme(t, x)),
  };
  const countFor = (group: string, match: (t: T) => boolean) => list.filter((t) => Object.entries(tests).every(([k, f]) => k === group || f(t)) && match(t)).length;
  const rows = list.filter((t) => Object.values(tests).every((f) => f(t)));
  const clear = () => { setPrice(null); setLengths([]); setThemes([]); setRegions([]); };
  const tags: Tag[] = [
    ...(price !== null ? [{ key: "price", label: `Up to ${money(price, "TWD")}`, remove: () => setPrice(null) }] : []),
    ...lengths.map((l) => ({ key: `length-${l}`, label: LENGTHS.find((x) => x.value === l)?.label ?? l, remove: () => setLengths(without(lengths, l)) })),
    ...themes.map((v) => ({ key: `theme-${v}`, label: THEMES.find((x) => x.value === v)?.label ?? v, remove: () => setThemes(without(themes, v)) })),
    ...regions.map((r) => ({ key: `region-${r}`, label: r, remove: () => setRegions(without(regions, r)) })),
  ];
  const page = usePaged(rows, JSON.stringify([cap, lengths, themes, regions, list.length]));
  return (
    <div className="af-layout">
      <Panel count={rows.length} total={list.length} active={tags.length} onClear={clear}>
        {hi > lo && <Group title="Price per person"><Range min={lo} max={hi} step={priceStep(lo, hi)} value={cap} onChange={setPrice} format={(v) => money(v, "TWD")} label="Highest price" testId="af-price" /></Group>}
        <Group title="Length"><Chips options={LENGTHS.map((l) => ({ ...l, count: countFor("length", (t) => lengthOf(t) === l.value) }))} value={lengths} onChange={setLengths} testId="af-length" /></Group>
        <Group title="Interests"><Chips options={THEMES.map((x) => ({ value: x.value, label: x.label, count: countFor("theme", (t) => hasTheme(t, x)) }))} value={themes} onChange={setThemes} testId="af-theme" /></Group>
        {allRegions.length > 1 && <Group title="Region"><Chips options={allRegions.map((r) => ({ value: r, label: r, count: countFor("region", (t) => t.region === r) }))} value={regions} onChange={setRegions} testId="af-region" /></Group>}
      </Panel>
      <div className="af-results">
        <Tags tags={tags} count={rows.length} total={list.length} noun="tours" onClear={clear} />
        {rows.length === 0 ? <Empty onClear={clear} /> : <div className="lp-cards af-cards" data-testid="tour-list">{page.visible.map(render)}</div>}
        <More more={page.more} onMore={page.loadMore} />
      </div>
    </div>
  );
}
