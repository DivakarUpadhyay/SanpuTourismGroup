"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, get } from "@sanpu/web";

interface Hit { kind: "Destination" | "Tour" | "Travel"; title: string; sub: string; href: string; img?: string | null }
interface Dest { code: string; name: string; region: string; imageUrl?: string | null }
interface Tour { code: string; title: string; destinationName: string; days: number; imageUrl?: string | null }

const TRAVEL: Hit[] = [
  { kind: "Travel", title: "Hotels", sub: "Rooms across Taiwan", href: "/hotels" },
  { kind: "Travel", title: "Flights", sub: "Island and east-coast flights", href: "/flights" },
  { kind: "Travel", title: "Buses", sub: "Express and mountain buses", href: "/buses" },
  { kind: "Travel", title: "Airport taxis", sub: "Fixed-price transfers", href: "/taxis" },
  { kind: "Travel", title: "Deals", sub: "Coupon codes and offers", href: "/deals" },
];

/** Header quick search: destinations, tours and travel services. Loads the (small, public) catalog once on first focus. */
export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [data, setData] = useState<{ dest: Dest[]; tours: Tour[] } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const load = () => { if (!data) Promise.all([get<Dest[]>("/catalog/destinations"), get<Tour[]>("/catalog/tours")]).then(([dest, tours]) => setData({ dest, tours })).catch(() => setData({ dest: [], tours: [] })); };
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const hits = useMemo<Hit[]>(() => {
    const t = q.trim().toLowerCase();
    const all: Hit[] = [
      ...(data?.dest ?? []).map((d) => ({ kind: "Destination" as const, title: d.name, sub: `${d.region} · destination guide`, href: `/destinations/${d.code}`, img: d.imageUrl })),
      ...(data?.tours ?? []).map((x) => ({ kind: "Tour" as const, title: x.title, sub: `${x.destinationName} · ${x.days} days`, href: `/tours/${x.code}`, img: x.imageUrl })),
      ...TRAVEL];
    return (t ? all.filter((h) => `${h.title} ${h.sub}`.toLowerCase().includes(t)) : all.filter((h) => h.kind !== "Tour")).slice(0, 8);
  }, [q, data]);
  const go = (h?: Hit) => { if (!h) return; setOpen(false); setQ(""); router.push(h.href); };
  return (
    <div className="hs" ref={box}>
      <Icon name="search" size={16} />
      <input type="search" aria-label="Search tours, destinations and travel" placeholder="Search tours, places, hotels…" value={q} data-testid="header-search"
        onFocus={() => { load(); setOpen(true); }} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); go(hits[active]); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && (
        <div className="hs-pop" role="listbox">
          {!data ? <div className="hs-empty">Loading…</div> : hits.length === 0 ? <div className="hs-empty">No matches. Try a city like Taipei or Kinmen.</div> : hits.map((h, i) => (
            <button type="button" key={h.href} role="option" aria-selected={i === active} className={i === active ? "on" : undefined} onMouseEnter={() => setActive(i)} onClick={() => go(h)}>
              <span className="hs-img" style={h.img ? { backgroundImage: `url(${h.img})` } : undefined}>{!h.img && <Icon name={h.kind === "Travel" ? "truck" : "map"} size={16} />}</span>
              <span className="hs-txt"><b>{h.title}</b><small>{h.sub}</small></span>
              <span className="hs-kind">{h.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
