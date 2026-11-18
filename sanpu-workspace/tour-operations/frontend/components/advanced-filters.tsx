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

function Chips<T extends string | number>({ options, value, onChange, testId }: { options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; testId: string }) {
  return (
    <div className="af-chips">
      {options.map((o) => {
        const on = value.includes(o.value);
        return <button type="button" key={String(o.value)} aria-pressed={on} className={on ? "on" : ""} data-testid={`${testId}-${o.value}`}
          onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}>{o.label}</button>;
      })}
    </div>
  );
}

function PriceRange({ min, max, value, onChange, currency = "TWD" }: { min: number; max: number; value: number; onChange: (v: number) => void; currency?: string }) {
  const step = Math.max(10, Math.round((max - min) / 40 / 10) * 10);
  return (
    <div className="af-price">
      <input type="range" min={min} max={max} step={step} value={Math.min(value, max)} onChange={(e) => onChange(Number(e.target.value))} aria-label="Highest price" data-testid="af-price" />
      <div><span>{money(min, currency)}</span><b>up to {money(Math.min(value, max), currency)}</b></div>
    </div>
  );
}

function Panel({ count, total, active, onClear, children }: { count: number; total: number; active: boolean; onClear: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <aside className={`af-panel${open ? " open" : ""}`} aria-label="Filters">
      <button type="button" className="af-toggle" onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="sliders" size={16} /> Filters{active ? " (on)" : ""}</button>
      <div className="af-body">
        <div className="af-head"><b>Filters</b>{active && <button type="button" className="link" onClick={onClear} data-testid="af-clear">Clear all</button>}</div>
        <p className="af-count" data-testid="af-count">{count} of {total} shown</p>
        {children}
      </div>
    </aside>
  );
}

function Empty({ onClear }: { onClear: () => void }) {
  return <div className="af-empty" data-testid="af-empty"><Icon name="search" size={22} /><b>Nothing matches these filters</b><span>Try a higher price or fewer options.</span><button type="button" className="btn small" onClick={onClear}>Clear filters</button></div>;
}

function More({ more, onMore }: { more: number; onMore: () => void }) {
  return more > 0 ? <div className="af-more"><button type="button" className="btn" onClick={onMore} data-testid="af-more">Load {Math.min(more, PAGE)} more</button><small className="muted">{more} more available</small></div> : null;
}

// ---------------- hotels, flights, buses, taxis ----------------
export interface ServiceRow { code: string; kind: string; totalPrice: number; rating?: number | null; features?: string | null; departTime?: string | null; durationMin?: number | null; providerName?: string | null; peoplePerUnit?: number }
const SLOTS = [{ value: "morning", label: "Morning", from: 5, to: 12 }, { value: "afternoon", label: "Afternoon", from: 12, to: 17 }, { value: "evening", label: "Evening", from: 17, to: 24 }];
const featuresOf = (r: ServiceRow) => (r.features ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export function ServiceResults<T extends ServiceRow>({ list, kind, render }: { list: T[]; kind: string; render: (r: T) => ReactNode }) {
  const prices = list.map((r) => r.totalPrice);
  const lo = Math.floor(Math.min(...prices)), hi = Math.ceil(Math.max(...prices));
  const [price, setPrice] = useState<number | null>(null);
  const [rating, setRating] = useState(0);
  const [slots, setSlots] = useState<string[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const timed = kind === "Flight" || kind === "Bus";
  const allProviders = useMemo(() => [...new Set(list.map((r) => r.providerName).filter(Boolean) as string[])].sort(), [list]);
  const allFeatures = useMemo(() => {
    const n = new Map<string, number>(); list.forEach((r) => featuresOf(r).forEach((f) => n.set(f, (n.get(f) ?? 0) + 1)));
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([f]) => f);
  }, [list]);
  const cap = price ?? hi;
  const rows = list.filter((r) => r.totalPrice <= cap && (!rating || (r.rating ?? 0) >= rating)
    && (!slots.length || SLOTS.some((s) => { const h = Number((r.departTime ?? "").slice(0, 2)); return slots.includes(s.value) && r.departTime && h >= s.from && h < s.to; }))
    && (!providers.length || providers.includes(r.providerName ?? "")) && features.every((f) => featuresOf(r).includes(f)));
  const active = price !== null || rating > 0 || slots.length > 0 || providers.length > 0 || features.length > 0;
  const clear = () => { setPrice(null); setRating(0); setSlots([]); setProviders([]); setFeatures([]); };
  const page = usePaged(rows, JSON.stringify([cap, rating, slots, providers, features, list.length]));
  return (
    <div className="af-layout">
      <Panel count={rows.length} total={list.length} active={active} onClear={clear}>
        {hi > lo && <Group title="Total price"><PriceRange min={lo} max={hi} value={cap} onChange={setPrice} /></Group>}
        <Group title="Guest rating"><div className="af-chips">{[[0, "Any"], [4, "4.0+"], [4.5, "4.5+"]].map(([v, l]) => <button type="button" key={v} className={rating === v ? "on" : ""} aria-pressed={rating === v} onClick={() => setRating(v as number)} data-testid={`af-rating-${v}`}>{l}</button>)}</div></Group>
        {timed && <Group title="Departure time"><Chips options={SLOTS} value={slots} onChange={setSlots} testId="af-slot" /></Group>}
        {allProviders.length > 1 && <Group title={kind === "Flight" ? "Airline" : kind === "Bus" ? "Operator" : "Provider"}><Chips options={allProviders.slice(0, 8).map((p) => ({ value: p, label: p }))} value={providers} onChange={setProviders} testId="af-provider" /></Group>}
        {allFeatures.length > 0 && <Group title="Features"><Chips options={allFeatures.map((f) => ({ value: f, label: f }))} value={features} onChange={setFeatures} testId="af-feature" /></Group>}
      </Panel>
      <div className="af-results">
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

export function TourResults<T extends TourRow>({ list, render }: { list: T[]; render: (t: T) => ReactNode }) {
  const prices = list.map((t) => t.fromPrice ?? 0).filter(Boolean);
  const lo = prices.length ? Math.floor(Math.min(...prices)) : 0, hi = prices.length ? Math.ceil(Math.max(...prices)) : 0;
  const [price, setPrice] = useState<number | null>(null);
  const [lengths, setLengths] = useState<string[]>([]);
  const [themes, setThemes] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const allRegions = useMemo(() => [...new Set(list.map((t) => t.region).filter(Boolean) as string[])].sort(), [list]);
  const cap = price ?? hi;
  const rows = list.filter((t) => (t.fromPrice ?? 0) <= cap
    && (!lengths.length || lengths.includes(t.days >= 4 ? "4" : String(t.days)))
    && (!regions.length || regions.includes(t.region ?? ""))
    && (!themes.length || THEMES.some((x) => themes.includes(x.value) && x.words.test(`${t.title} ${t.slogan ?? ""} ${t.summary ?? ""}`))));
  const active = price !== null || lengths.length > 0 || themes.length > 0 || regions.length > 0;
  const clear = () => { setPrice(null); setLengths([]); setThemes([]); setRegions([]); };
  const page = usePaged(rows, JSON.stringify([cap, lengths, themes, regions, list.length]));
  return (
    <div className="af-layout">
      <Panel count={rows.length} total={list.length} active={active} onClear={clear}>
        {hi > lo && <Group title="Price per person"><PriceRange min={lo} max={hi} value={cap} onChange={setPrice} /></Group>}
        <Group title="Length"><Chips options={LENGTHS} value={lengths} onChange={setLengths} testId="af-length" /></Group>
        <Group title="Interests"><Chips options={THEMES.map((t) => ({ value: t.value, label: t.label }))} value={themes} onChange={setThemes} testId="af-theme" /></Group>
        {allRegions.length > 1 && <Group title="Region"><Chips options={allRegions.map((r) => ({ value: r, label: r }))} value={regions} onChange={setRegions} testId="af-region" /></Group>}
      </Panel>
      <div className="af-results">
        {rows.length === 0 ? <Empty onClear={clear} /> : <div className="lp-cards af-cards" data-testid="tour-list">{page.visible.map(render)}</div>}
        <More more={page.more} onMore={page.loadMore} />
      </div>
    </div>
  );
}
