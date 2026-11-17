"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Async, Card, DatePickerInput, Empty, Icon, PageHeader, Pill, SelectInput, TextArea, TextInput, fmtDate, get, money, post, useAction, useAsync, useAuth, useSetting } from "@sanpu/web";
import { TourTile, type TourCard } from "./customer-home";

const bg = (url?: string | null) => (url ? { backgroundImage: `url(${url})` } : undefined);
interface Destination { code: string; name: string; region: string; imageUrl?: string | null; tourCount: number }

/* ---------------- recommendations ---------------- */
export interface Recommendation { code: string; title: string; slogan?: string; days: number; currency: string; summary?: string; destinationName: string; region: string;
  imageUrl?: string | null; businessUnitName: string; fromPrice?: number; nextDeparture?: string; reason: string }

export function RecommendationCards({ list }: { list: Recommendation[] }) {
  return (
    <div className="lp-cards" data-testid="recommendations">
      {list.map((r) => (
        <article key={r.code} className="lp-card">
          <div className="media">
            <div className="bg" style={bg(r.imageUrl)} role="img" aria-label={`${r.destinationName} illustration`} />
            <span className="chip"><Icon name="sparkle" size={14} />{r.reason}</span>
            <span className="chip right">{r.days} {r.days === 1 ? "day" : "days"}</span>
          </div>
          <div className="content">
            <span className="slogan">{r.slogan}</span>
            <h3><Link href={`/tours/${r.code}`}>{r.title}</Link></h3>
            <p>{r.summary}</p>
            <div className="foot"><span className="price"><small>From · next {fmtDate(r.nextDeparture)}</small><b>{money(r.fromPrice, r.currency)}</b></span><Link className="go-btn" href={`/tours/${r.code}`} aria-label={`View tour: ${r.title}`}>View tour<Icon name="arrow" size={15} /></Link></div>
          </div>
        </article>
      ))}
    </div>
  );
}

/** "Recommended for you" block: personal when signed in, popular otherwise. */
export function RecommendedSection({ title = "Recommended for you", exclude, max }: { title?: string; exclude?: string; max?: number }) {
  const { status } = useAuth();
  const recs = useAsync(() => (status === "loading" ? Promise.resolve(null as unknown as Recommendation[]) : get<Recommendation[]>("/discover/recommendations", { exclude, max })), [status, exclude, max]);
  if (!recs.data?.length) return null;
  return (
    <section className="wrap lp-section" aria-labelledby="rec-h">
      <div className="lp-head"><div><p className="kicker">{status === "authenticated" ? "Picked for you" : "Trending now"}</p><h2 id="rec-h">{title}</h2>
        <p>{status === "authenticated" ? "Based on the tours you looked at and booked." : "Popular with travelers this week."}</p></div></div>
      <RecommendationCards list={recs.data} />
    </section>
  );
}

export function ForYouPage() {
  const recs = useAsync(() => get<Recommendation[]>("/discover/recommendations", { max: 9 }), []);
  return (
    <>
      <PageHeader tagline="Recommended" title="Picked for you" lead="Each suggestion says why it is here: tours you looked at, regions you like, and what other travelers book." />
      <Async state={recs} empty={(r) => r.length === 0}>{(list) => <RecommendationCards list={list} />}</Async>
    </>
  );
}

/* ---------------- promotions ---------------- */
interface Promotion { promotionId: number; title: string; subtitle?: string; imageUrl?: string; ctaText?: string; ctaUrl?: string; couponCode?: string; badge?: string; endsAtUtc: string }

export function PromoStrip({ placement = "HomeStrip" }: { placement?: string }) {
  const promos = useAsync(() => get<Promotion[]>("/marketing/promotions", { placement }), [placement]);
  useEffect(() => { promos.data?.forEach((p) => post(`/marketing/promotions/${p.promotionId}/track`, { kind: "impression" }).catch(() => {})); }, [promos.data]);
  if (!promos.data?.length) return null;
  return (
    <div className="promo-strip" data-testid={`promos-${placement}`}>
      {promos.data.map((p) => (
        <Link key={p.promotionId} href={p.ctaUrl ?? "/deals"} className="promo" onClick={() => post(`/marketing/promotions/${p.promotionId}/track`, { kind: "click" }).catch(() => {})}>
          <span className="bg" style={bg(p.imageUrl)} />
          <span className="in">
            {p.badge && <span className="badge">{p.badge}</span>}
            <b>{p.title}</b>
            <span className="sub">{p.subtitle}</span>
            <span className="row">{p.couponCode && <code className="code">{p.couponCode}</code>}<span className="cta">{p.ctaText ?? "See offer"} →</span></span>
          </span>
        </Link>
      ))}
    </div>
  );
}

interface PublicCoupon { code: string; description: string; discountType: string; discountValue: number; maxDiscount?: number; minAmount: number; appliesTo: string; endsAtUtc: string }

export function DealsPage() {
  const coupons = useAsync(() => get<PublicCoupon[]>("/marketing/coupons"), []);
  const [copied, setCopied] = useState("");
  return (
    <>
      <section className="dt-hero" style={{ "--hero-img": "url(/images/photos/sunmoon.jpg)" } as React.CSSProperties}>
        <div className="wrap"><p className="lp-eyebrow">Deals</p><h1>Offers and coupon codes</h1><p className="lp-lead" style={{ marginBottom: 0 }}>Use a code at checkout. Every code shows its dates, minimum spend and what it applies to.</p></div>
      </section>
      <section className="wrap lp-section"><PromoStrip placement="Deals" /></section>
      <section className="wrap lp-section" aria-labelledby="cp-h">
        <div className="lp-head"><div><p className="kicker">Coupon codes</p><h2 id="cp-h">Copy a code, save at checkout</h2></div></div>
        <Async state={coupons} empty={(c) => c.length === 0}>{(list) => (
          <div className="coupon-grid" data-testid="coupons">
            {list.map((c) => (
              <article key={c.code} className="coupon">
                <div className="amt">{c.discountType === "Percent" ? `${c.discountValue}%` : money(c.discountValue)}<small>off</small></div>
                <div className="info">
                  <b>{c.description}</b>
                  <span className="small muted">{c.appliesTo === "All" ? "Any booking" : `${c.appliesTo} bookings`}{c.minAmount > 0 ? ` · min ${money(c.minAmount)}` : ""}{c.maxDiscount ? ` · up to ${money(c.maxDiscount)}` : ""} · until {fmtDate(c.endsAtUtc)}</span>
                  <span className="row"><code className="code">{c.code}</code>
                    <button className="btn small" onClick={() => { navigator.clipboard?.writeText(c.code).catch(() => {}); setCopied(c.code); }}>{copied === c.code ? "Copied" : "Copy code"}</button></span>
                </div>
              </article>
            ))}
          </div>
        )}</Async>
      </section>
    </>
  );
}

/* ---------------- tours list ---------------- */
function ToursInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState({ destination: params.get("destination") ?? "", month: params.get("month") ?? "", pax: Number(params.get("pax") ?? 1) || 1 });
  const [sort, setSort] = useState(params.get("sort") ?? "date");
  const destinations = useAsync(() => get<Destination[]>("/catalog/destinations"), []);
  const tours = useAsync(() => get<TourCard[]>("/catalog/tours", q), [q.destination, q.month, q.pax]);
  const sorted = useMemo(() => [...(tours.data ?? [])].sort((a, b) =>
    sort === "price" ? (a.fromPrice ?? 9e9) - (b.fromPrice ?? 9e9) : sort === "days" ? a.days - b.days : String(a.nextDeparture).localeCompare(String(b.nextDeparture))), [tours.data, sort]);
  const sync = (next: typeof q, nextSort = sort) => router.replace(`/tours?${new URLSearchParams({ destination: next.destination, month: next.month, pax: String(next.pax), sort: nextSort })}`, { scroll: false });
  const set = (next: typeof q) => { setQ(next); sync(next); };
  const dest = destinations.data?.find((d) => d.code === q.destination);
  const now = new Date(), minMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const filtered = !!(q.destination || q.month || q.pax > 1);
  return (
    <div className="wrap tours-page">
      <header className="tours-head">
        <p className="kicker">Guided tours</p>
        <h1>{dest ? `Tours in ${dest.name}` : "Find your next journey"}</h1>
        <p>Live prices and seats on every departure. Small groups, our own coaches and local guides.</p>
      </header>

      <form className="find-bar" role="search" aria-label="Find tours" onSubmit={(e) => { e.preventDefault(); document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }); }}>
        <label className="seg">
          <span className="seg-label"><Icon name="map" size={14} />Where</span>
          <select value={q.destination} onChange={(e) => set({ ...q, destination: e.target.value })} data-testid="tours-destination">
            <option value="">Anywhere in Taiwan</option>
            {(destinations.data ?? []).map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
          </select>
        </label>
        <div className="seg">
          <span className="seg-label"><Icon name="calendar" size={14} />When</span>
          <DatePickerInput mode="month" min={minMonth} value={q.month} onChange={(v) => set({ ...q, month: v })} placeholder="Any month" aria-label="Month" data-testid="tours-month" />
        </div>
        <div className="seg">
          <span className="seg-label"><Icon name="users" size={14} />Travelers</span>
          <div className="stepper" role="group" aria-label="Travelers">
            <button type="button" aria-label="Fewer travelers" disabled={q.pax <= 1} onClick={() => set({ ...q, pax: q.pax - 1 })}>−</button>
            <output aria-live="polite">{q.pax} {q.pax === 1 ? "traveler" : "travelers"}</output>
            <button type="button" aria-label="More travelers" disabled={q.pax >= 20} onClick={() => set({ ...q, pax: q.pax + 1 })}>+</button>
          </div>
        </div>
        <button className="find-go" aria-label="Show tours"><Icon name="search" size={20} /><span>Search</span></button>
      </form>

      <div className="dest-chips" role="group" aria-label="Destinations">
        <button type="button" aria-pressed={!q.destination} onClick={() => set({ ...q, destination: "" })}><span className="dot all"><Icon name="globe" size={14} /></span>All</button>
        {(destinations.data ?? []).map((d) => (
          <button type="button" key={d.code} aria-pressed={q.destination === d.code} onClick={() => set({ ...q, destination: q.destination === d.code ? "" : d.code })}>
            <span className="dot" style={d.imageUrl ? { backgroundImage: `url(${d.imageUrl})` } : undefined} />{d.name}
          </button>
        ))}
      </div>

      <div className="results-bar" id="results">
        <p aria-live="polite"><b>{tours.data ? tours.data.length : "…"}</b> {tours.data?.length === 1 ? "tour" : "tours"}{q.month ? ` in ${new Date(q.month + "-01").toLocaleString("en-GB", { month: "long", year: "numeric" })}` : ""}{q.pax > 1 ? ` with room for ${q.pax}` : ""}
          {filtered && <button type="button" className="link-btn" onClick={() => set({ destination: "", month: "", pax: 1 })}>Clear all</button>}</p>
        <div className="seg-sort" role="group" aria-label="Sort tours">
          {[["date", "Soonest"], ["price", "Lowest price"], ["days", "Shortest"]].map(([k, l]) => (
            <button type="button" key={k} aria-pressed={sort === k} onClick={() => { setSort(k); sync(q, k); }}>{l}</button>
          ))}
        </div>
      </div>

      <div className={tours.loading && tours.data ? "refreshing" : undefined}>
        <Async state={tours} empty={(t) => t.length === 0}>{() => <div className="lp-cards" data-testid="tour-list">{sorted.map((t) => <TourTile key={t.code} t={t} />)}</div>}</Async>
      </div>
      <p className="small muted" style={{ marginTop: 18 }}>Can&apos;t decide? <Link href="/compare">Compare tours side by side</Link> or see the <Link href="/calendar">departure calendar</Link>.</p>
    </div>
  );
}
export const ToursPage = () => <Suspense><ToursInner /></Suspense>;

/* ---------------- destinations ---------------- */
export function DestinationsPage() {
  const destinations = useAsync(() => get<Destination[]>("/catalog/destinations"), []);
  return (
    <>
      <section className="dt-hero" style={{ "--hero-img": "url(/images/photos/alishan.jpg)" } as React.CSSProperties}>
        <div className="wrap"><p className="lp-eyebrow">Destination guides</p><h1>Know the place before you go</h1><p className="lp-lead" style={{ marginBottom: 0 }}>History in brief, the best time to visit, how to get there and what is nearby.</p></div>
      </section>
      <section className="wrap lp-section">
        <Async state={destinations} empty={(d) => d.length === 0}>{(list) => (
          <div className="lp-tiles" data-testid="destination-tiles">
            {list.map((d) => (
              <Link key={d.code} href={`/destinations/${d.code}`} className="lp-tile">
                <span className="bg" style={bg(d.imageUrl)} />
                <span className="meta"><b>{d.name}</b><span>{d.region} · read the guide</span></span>
              </Link>
            ))}
          </div>
        )}</Async>
      </section>
    </>
  );
}

interface Guide {
  destination: { code: string; name: string; region: string; imageUrl?: string; overview?: string; bestTime?: string; gettingThere?: string; localTip?: string };
  history: { era: string; title: string; detail: string }[];
  nearby: { name: string; category: string; distanceKm: number; travelMinutes: number; detail: string }[];
  tours: TourCard[];
}

export function DestinationGuidePage() {
  const { code } = useParams<{ code: string }>();
  const g = useAsync(() => get<Guide>(`/discover/destinations/${code}`), [code]);
  const [cat, setCat] = useState("All");
  return (
    <Async state={g}>{(d) => {
      const cats = ["All", ...Array.from(new Set(d.nearby.map((n) => n.category)))];
      const shown = cat === "All" ? d.nearby : d.nearby.filter((n) => n.category === cat);
      return (
        <>
          <section className="dt-hero" style={{ "--hero-img": `url(${d.destination.imageUrl ?? ""})` } as React.CSSProperties}>
            <div className="wrap"><div className="crumbs"><Link href="/destinations">Destination guides</Link> · {d.destination.name}</div>
              <h1>{d.destination.name}</h1><div className="dt-badges"><span><Icon name="map" size={14} />{d.destination.region}</span><span><Icon name="ticket" size={14} />{d.tours.length} {d.tours.length === 1 ? "tour" : "tours"}</span></div></div>
          </section>
          <div className="wrap" style={{ paddingTop: 28 }}>
            <section className="dt-section"><h2><span className="ico"><Icon name="file" size={18} /></span>Overview</h2>
              <p className="dt-overview">{d.destination.overview}</p>
              <dl className="dt-glance">
                {d.destination.bestTime && <div><dt><Icon name="calendar" size={14} />Best time</dt><dd>{d.destination.bestTime}</dd></div>}
                {d.destination.gettingThere && <div><dt><Icon name="truck" size={14} />Getting there</dt><dd>{d.destination.gettingThere}</dd></div>}
                {d.destination.localTip && <div><dt><Icon name="sparkle" size={14} />Local tip</dt><dd>{d.destination.localTip}</dd></div>}
              </dl>
            </section>
            {d.history.length > 0 && <section className="dt-section"><h2><span className="ico"><Icon name="history" size={18} /></span>History in brief</h2>
              <ol className="dt-timeline">{d.history.map((h) => <li key={h.title}><span className="era">{h.era}</span><h3>{h.title}</h3><p>{h.detail}</p></li>)}</ol></section>}
            {d.nearby.length > 0 && <section className="dt-section"><h2><span className="ico"><Icon name="map" size={18} /></span>Things to see and do</h2>
              <div className="dt-filter" role="group" aria-label="Filter places">{cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div>
              <div className="dt-nearby">{shown.map((n) => (
                <article key={n.name} className={`dt-place cat-${n.category}`}><div className="top"><span className="cat">{n.category}</span><span className="dist">{n.distanceKm} km · ~{n.travelMinutes} min</span></div><h3>{n.name}</h3><p>{n.detail}</p></article>))}
              </div></section>}
            <section className="dt-section"><h2><span className="ico"><Icon name="ticket" size={18} /></span>Tours here</h2>
              {d.tours.length ? <div className="lp-cards">{d.tours.map((t) => <TourTile key={t.code} t={t} />)}</div> : <Empty>No tours here yet. Check back soon.</Empty>}</section>
          </div>
        </>
      );
    }}</Async>
  );
}

/* ---------------- departure calendar ---------------- */
interface CalRow { departureId: number; departureDate: string; price: number; seatsLeft: number; status: string; tourCode: string; tourTitle: string; days: number; currency: string; destinationName: string }

export function CalendarPage() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const cal = useAsync(() => get<CalRow[]>("/discover/calendar", { month }), [month]);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1), lead = (first.getDay() + 6) % 7, days = new Date(y, m, 0).getDate();
  const byDay = useMemo(() => { const map: Record<number, CalRow[]> = {}; (cal.data ?? []).forEach((r) => { const d = Number(r.departureDate.slice(8, 10)); (map[d] ??= []).push(r); }); return map; }, [cal.data]);
  const shift = (n: number) => { const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
  return (
    <>
      <PageHeader tagline="Plan" title="Departure calendar" lead="Every open departure this month. Pick a date to book." actions={<div className="row">
        <button className="btn" onClick={() => shift(-1)} aria-label="Previous month">‹</button><b style={{ minWidth: 150, textAlign: "center" }}>{first.toLocaleString("en-GB", { month: "long", year: "numeric" })}</b>
        <button className="btn" onClick={() => shift(1)} aria-label="Next month">›</button></div>} />
      <div className={`cal ${cal.loading && cal.data ? "refreshing" : ""}`} data-testid="departure-calendar">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} className="cal-day empty" />)}
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
          <div key={d} className={`cal-day${byDay[d] ? " has" : ""}`}>
            <span className="n">{d}</span>
            {(byDay[d] ?? []).map((r) => (
              <Link key={r.departureId} href={`/tours/${r.tourCode}#departures`} className={`cal-ev${r.seatsLeft <= 3 ? " low" : ""}`} title={`${r.tourTitle} · ${r.seatsLeft} seats`}>
                <b>{r.tourTitle}</b><span>{money(r.price, r.currency)} · {r.seatsLeft <= 0 ? "full" : `${r.seatsLeft} left`}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
      {cal.data?.length === 0 && <Empty>No departures this month. Try the next month.</Empty>}
    </>
  );
}

/* ---------------- compare ---------------- */
interface CompareRow { code: string; title: string; slogan?: string; days: number; currency: string; summary?: string; destinationName: string; region: string; businessUnitName: string; imageUrl?: string;
  bestTime?: string; gettingThere?: string; fromPrice?: number; nextDeparture?: string; openDepartures: number; seatsLeft?: number; nearbyCount: number; nearbyNames?: string }

function CompareInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tours = useAsync(() => get<TourCard[]>("/catalog/tours"), []);
  const [picked, setPicked] = useState<string[]>((params.get("codes") ?? "").split(",").filter(Boolean).slice(0, 3));
  const cmp = useAsync(() => (picked.length >= 2 ? get<CompareRow[]>("/discover/compare", { codes: picked.join(",") }) : Promise.resolve([] as CompareRow[])), [picked.join(",")]);
  const toggle = (c: string) => {
    const next = picked.includes(c) ? picked.filter((x) => x !== c) : picked.length < 3 ? [...picked, c] : picked;
    setPicked(next); router.replace(`/compare?codes=${next.join(",")}`, { scroll: false });
  };
  const rows: [string, (r: CompareRow) => React.ReactNode][] = [
    ["Destination", (r) => `${r.destinationName} · ${r.region}`], ["Length", (r) => `${r.days} days`], ["From", (r) => <b>{money(r.fromPrice, r.currency)}</b>],
    ["Next departure", (r) => fmtDate(r.nextDeparture)], ["Open dates", (r) => r.openDepartures], ["Seats left", (r) => r.seatsLeft ?? 0], ["Run by", (r) => r.businessUnitName],
    ["Best time", (r) => r.bestTime], ["Getting there", (r) => r.gettingThere], ["Nearby highlights", (r) => r.nearbyNames]];
  return (
    <>
      <PageHeader tagline="Plan" title="Compare tours" lead="Pick two or three tours to see them side by side." />
      <div className="chip-pick" role="group" aria-label="Tours to compare">
        {(tours.data ?? []).map((t) => <button key={t.code} type="button" aria-pressed={picked.includes(t.code)} onClick={() => toggle(t.code)} disabled={!picked.includes(t.code) && picked.length >= 3}>{t.title}</button>)}
      </div>
      {picked.length < 2 ? <Empty>Choose at least two tours above.</Empty> : (
        <Async state={cmp}>{(list) => (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table className="compare" data-testid="compare-table">
              <thead><tr><th />{list.map((r) => <th key={r.code}><div className="cmp-img" style={bg(r.imageUrl)} /><Link href={`/tours/${r.code}`}>{r.title}</Link></th>)}</tr></thead>
              <tbody>{rows.map(([label, f]) => <tr key={label}><th scope="row">{label}</th>{list.map((r) => <td key={r.code}>{f(r)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}</Async>
      )}
    </>
  );
}
export const ComparePage = () => <Suspense><CompareInner /></Suspense>;

/* ---------------- help center & contact ---------------- */
interface Article { articleId: number; category: string; question: string; answer: string }

export function HelpPage() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const list = useAsync(() => get<Article[]>("/help", { search: term }), [term]);
  const [open, setOpen] = useState<number | null>(null);
  const [voted, setVoted] = useState<Record<number, boolean>>({});
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 250); return () => clearTimeout(t); }, [search]);
  const groups = useMemo(() => { const g: Record<string, Article[]> = {}; (list.data ?? []).forEach((a) => (g[a.category] ??= []).push(a)); return g; }, [list.data]);
  return (
    <>
      <PageHeader tagline="Help center" title="How can we help?" lead={<>Quick answers to common questions. Still stuck? <Link href="/contact">Contact us</Link>.</>} />
      <div className="help-search"><Icon name="search" /><input aria-label="Search help" placeholder="Search: refund, coupon, taxi…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="help-search" /></div>
      <div className={list.loading && list.data ? "refreshing" : undefined}>
        <Async state={list} empty={(a) => a.length === 0}>{() => (
          <div className="help-groups" data-testid="help-articles">
            {Object.entries(groups).map(([cat, items]) => (
              <section key={cat} className="help-group"><h2>{cat}</h2>
                {items.map((a) => (
                  <div key={a.articleId} className={`faq${open === a.articleId ? " open" : ""}`}>
                    <button type="button" aria-expanded={open === a.articleId} onClick={() => setOpen(open === a.articleId ? null : a.articleId)}>{a.question}<span aria-hidden="true">{open === a.articleId ? "−" : "+"}</span></button>
                    {open === a.articleId && <div className="faq-a"><p>{a.answer}</p>
                      {voted[a.articleId] === undefined ? <span className="small muted">Was this helpful? <button className="btn small subtle" onClick={() => { setVoted({ ...voted, [a.articleId]: true }); post(`/help/${a.articleId}/feedback`, { helpful: true }).catch(() => {}); }}>Yes</button>
                        <button className="btn small subtle" onClick={() => { setVoted({ ...voted, [a.articleId]: false }); post(`/help/${a.articleId}/feedback`, { helpful: false }).catch(() => {}); }}>No</button></span>
                        : <span className="small muted">Thanks for the feedback.</span>}</div>}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}</Async>
      </div>
    </>
  );
}

export function ContactPage() {
  const { me } = useAuth();
  const support = useSetting("Ui.SupportEmail", "");
  const hours = useSetting("Ui.SupportHours", "Mon to Fri, 09:00 to 18:00 (Taiwan time)");
  const [f, setF] = useState({ name: "", email: "", topic: "Booking", bookingRef: "", message: "" });
  const [done, setDone] = useState<string | null>(null);
  const a = useAction();
  const popular = useAsync(() => get<Article[]>("/help"), []);
  useEffect(() => { if (me) setF((x) => ({ ...x, name: x.name || me.user.displayName, email: x.email || me.user.email })); }, [me]);
  const TOPICS: [string, string, string][] = [["Booking", "ticket", "A booking"], ["Change", "calendar", "Change a trip"], ["Payment", "tag", "Payment or refund"],
    ["Feedback", "star", "Feedback"], ["Partnership", "handshake", "Partnership"], ["Other", "help", "Something else"]];
  const needsRef = ["Booking", "Change", "Payment"].includes(f.topic);
  const send = async () => {
    const r = await a.run(() => post<{ contactRef: string }>("/contact", { ...f, bookingRef: needsRef && f.bookingRef ? f.bookingRef : null }));
    if (r) { setDone(r.contactRef); window.scrollTo({ top: 0, behavior: "smooth" }); }
  };
  if (done) return (
    <div className="ct-done" data-testid="contact-done">
      <span className="ct-done-ico"><Icon name="check" size={30} /></span>
      <p className="kicker">Message sent</p>
      <h1>Thanks, {f.name.split(" ")[0] || "traveler"}. We are on it.</h1>
      <p>Your reference is <b>{done}</b>; mention it if you write to us again. Our team replies to <b>{f.email}</b> within one working day.</p>
      <div className="row" style={{ justifyContent: "center" }}><Link className="btn primary lg" href="/help">Browse the help center</Link><Link className="btn lg" href="/">Back to home</Link></div>
    </div>
  );
  return (
    <div className="ct">
      <aside className="ct-side">
        <p className="kicker">Contact us</p>
        <h1>We&apos;re here to help</h1>
        <p className="ct-lead">Questions about a booking, a change to your plans or a partnership. Real people, based in Taiwan, reply within one working day.</p>
        <ul className="ct-ways">
          {support && <li><span className="ico"><Icon name="file" size={18} /></span><div><b>Email</b><a href={`mailto:${support}`}>{support}</a></div></li>}
          <li><span className="ico"><Icon name="calendar" size={18} /></span><div><b>Office hours</b><span>{hours}</span></div></li>
          <li><span className="ico"><Icon name="check" size={18} /></span><div><b>Reply time</b><span>Within one working day; booking and payment questions first</span></div></li>
        </ul>
        {(popular.data?.length ?? 0) > 0 && <div className="ct-faq">
          <b>Quick answers</b>
          {popular.data!.slice(0, 4).map((q) => <Link key={q.articleId} href="/help">{q.question}<Icon name="arrow" size={14} /></Link>)}
        </div>}
      </aside>

      <form className="ct-form" noValidate onSubmit={(e) => { e.preventDefault(); send(); }}>
        <fieldset className="ct-topics">
          <legend>What is it about?</legend>
          <div role="radiogroup" aria-label="Topic">
            {TOPICS.map(([v, icon, label]) => (
              <button type="button" key={v} role="radio" aria-checked={f.topic === v} onClick={() => setF({ ...f, topic: v })} data-testid={`topic-${v}`}>
                <Icon name={icon} size={18} /><span>{label}</span>
              </button>
            ))}
          </div>
          {a.fieldError("topic") && <p className="error small">{a.fieldError("topic")}</p>}
        </fieldset>
        <div className="ct-row">
          <TextInput label="Your name" autoComplete="name" value={f.name} onChange={(v) => setF({ ...f, name: v })} error={a.fieldError("name")} data-testid="contact-name" />
          <TextInput label="Email" type="email" autoComplete="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} error={a.fieldError("email")} data-testid="contact-email" />
        </div>
        {needsRef && <TextInput label="Booking reference (optional)" placeholder="BK-000123 or SB-000045" value={f.bookingRef} onChange={(v) => setF({ ...f, bookingRef: v.toUpperCase() })}
          error={a.fieldError("bookingRef")} hint="Find it in My bookings. It helps us answer faster." />}
        <div className="ct-msg">
          <TextArea label="Message" rows={6} maxLength={2000} placeholder="Tell us what happened and how we can help." value={f.message} onChange={(v) => setF({ ...f, message: v })} error={a.fieldError("message")} data-testid="contact-message" />
          <span className={`ct-count${f.message.length > 1900 ? " warn" : ""}`}>{f.message.length} / 2000</span>
        </div>
        <button className="btn primary lg block" disabled={a.busy} data-testid="contact-submit">{a.busy ? "Sending…" : "Send message"}</button>
        <p className="small muted ct-note"><Icon name="lock" size={13} /> We only use your details to answer this message. See our <Link href="/legal/privacy.notice">privacy notice</Link>.</p>
      </form>
    </div>
  );
}

export { Pill };
