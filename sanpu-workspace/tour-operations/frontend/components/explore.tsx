"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Async, Card, CleanParams, DatePickerInput, Empty, Icon, PageHeader, Pill, SelectInput, TextArea, TextInput, fmtDate, get, money, post, savePageParams, useAction, useAsync, useAuth, useSetting } from "@sanpu/web";
import { TourTile, type TourCard } from "./customer-home";

const bg = (url?: string | null) => (url ? { backgroundImage: `url(${url})` } : undefined);
interface Destination { code: string; slug?: string | null; name: string; region: string; imageUrl?: string | null; tourCount: number }

/* ---------------- recommendations ---------------- */
export interface Recommendation { code: string; slug?: string | null; title: string; slogan?: string; days: number; currency: string; summary?: string; destinationName: string; region: string;
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
            <h3><Link href={`/tours/${r.slug ?? r.code}`}>{r.title}</Link></h3>
            <p>{r.summary}</p>
            <div className="foot"><span className="price"><small>From · next {fmtDate(r.nextDeparture)}</small><b>{money(r.fromPrice, r.currency)}</b></span><Link className="go-btn" href={`/tours/${r.slug ?? r.code}`} aria-label={`View tour: ${r.title}`}>View tour<Icon name="arrow" size={15} /></Link></div>
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

interface PublicCoupon { code: string; description: string; discountType: "Percent" | "Fixed"; discountValue: number; maxDiscount?: number; minAmount: number; appliesTo: string;
  startsAtUtc: string; endsAtUtc: string; usageLimit?: number; timesUsed: number; perCustomerLimit: number }

const KIND_ROUTE: Record<string, [string, string, string]> = {
  All: ["/tours", "Any booking", "sparkle"], Tour: ["/tours", "Guided tours", "map"], Hotel: ["/hotels", "Hotels", "building"],
  Flight: ["/flights", "Flights", "plane"], Bus: ["/buses", "Buses", "bus"], Taxi: ["/taxis", "Airport taxis", "car"] };
const SAVED_COUPON = "sanpu.coupon";
/** Remembers a coupon picked on the Deals page so checkout can apply it automatically (per browser, best effort). */
export const saveCoupon = (code: string, appliesTo: string) => { try { localStorage.setItem(SAVED_COUPON, JSON.stringify({ code, appliesTo })); } catch { /* storage unavailable */ } };
const saving = (c: PublicCoupon, amount: number) => amount < c.minAmount ? 0 : Math.min(amount, c.discountType === "Percent" ? Math.min(Math.round(amount * c.discountValue / 100), c.maxDiscount ?? Infinity) : c.discountValue);

function useNow(ms = 1000) { const [now, setNow] = useState(() => Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]); return now; }
function left(end: string, now: number) {
  const s = Math.max(0, Math.floor((new Date(end).getTime() - now) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return { d, h, m, sec, total: s };
}

export function DealsPage() {
  const router = useRouter();
  const coupons = useAsync(() => get<PublicCoupon[]>("/marketing/coupons"), []);
  const now = useNow();
  const [kind, setKind] = useState("All");
  const [sort, setSort] = useState("ending");
  const [copied, setCopied] = useState("");
  const [calc, setCalc] = useState({ kind: "Hotel", amount: 8000 });
  const list = useMemo(() => {
    const all = (coupons.data ?? []).filter((c) => kind === "All" || c.appliesTo === kind || c.appliesTo === "All");
    return [...all].sort((a, b) => sort === "saving" ? saving(b, 10000) - saving(a, 10000) : +new Date(a.endsAtUtc) - +new Date(b.endsAtUtc));
  }, [coupons.data, kind, sort]);
  const soonest = useMemo(() => [...(coupons.data ?? [])].sort((a, b) => +new Date(a.endsAtUtc) - +new Date(b.endsAtUtc))[0], [coupons.data]);
  const best = useMemo(() => (coupons.data ?? []).filter((c) => c.appliesTo === "All" || c.appliesTo === calc.kind)
    .map((c) => ({ c, s: saving(c, calc.amount) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0], [coupons.data, calc]);
  const use = (c: PublicCoupon) => { saveCoupon(c.code, c.appliesTo); router.push(KIND_ROUTE[c.appliesTo]?.[0] ?? "/tours"); };
  const copy = (code: string) => { navigator.clipboard?.writeText(code).catch(() => {}); setCopied(code); setTimeout(() => setCopied(""), 1800); };
  const t = soonest ? left(soonest.endsAtUtc, now) : null;
  return (
    <>
      <section className="dl-hero">
        <div className="wrap dl-hero-in">
          <div>
            <p className="lp-eyebrow"><Icon name="tag" size={14} />Deals</p>
            <h1>Save on tours, stays and rides</h1>
            <p className="lp-lead">Live coupon codes from our team. Pick one and we apply it for you at checkout.</p>
            <div className="lp-cta"><a className="btn lg gold" href="#codes">See all codes</a><a className="btn lg glass" href="#calculator">Find my best code</a></div>
          </div>
          {soonest && t && (
            <div className="dl-timer" aria-live="off">
              <span className="dl-timer-label">Ending soonest</span>
              <b className="dl-timer-code">{soonest.code}</b>
              <span className="dl-timer-desc">{soonest.description}</span>
              <div className="dl-clock">{([["d", t.d], ["h", t.h], ["m", t.m], ["s", t.sec]] as [string, number][]).map(([l, v]) => <span key={l}><b>{String(v).padStart(2, "0")}</b><small>{l === "d" ? "days" : l === "h" ? "hours" : l === "m" ? "min" : "sec"}</small></span>)}</div>
              <button type="button" className="btn gold block" onClick={() => use(soonest)}>Use {soonest.code} now</button>
            </div>
          )}
        </div>
      </section>

      <section className="wrap lp-section" aria-label="Featured offers"><PromoStrip placement="Deals" /></section>

      <section className="wrap lp-section" id="codes" aria-labelledby="codes-h" style={{ scrollMarginTop: 80 }}>
        <div className="lp-head">
          <div><p className="kicker">Coupon codes</p><h2 id="codes-h">{list.length} {list.length === 1 ? "code" : "codes"} you can use today</h2></div>
          <div className="seg-sort" role="group" aria-label="Sort">{[["ending", "Ending soon"], ["saving", "Biggest saving"]].map(([k, l]) =>
            <button type="button" key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}</div>
        </div>
        <div className="dest-chips" style={{ justifyContent: "flex-start", margin: "0 0 22px" }} role="group" aria-label="Booking type">
          {Object.entries(KIND_ROUTE).map(([k, [, label, icon]]) => (
            <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}><span className="dot all"><Icon name={icon} size={14} /></span>{k === "All" ? "All deals" : label}</button>
          ))}
        </div>
        <Async state={coupons} empty={(c) => c.length === 0}>{() => (
          <div className="dl-grid" data-testid="coupons">
            {list.map((c) => {
              const l = left(c.endsAtUtc, now);
              const pct = c.usageLimit ? Math.min(100, Math.round(c.timesUsed * 100 / c.usageLimit)) : null;
              const urgent = l.total < 3 * 86400;
              return (
                <article key={c.code} className={`dl-card${urgent ? " urgent" : ""}`} data-testid={`deal-${c.code}`}>
                  <div className="dl-amt">
                    <b className={c.discountType === "Percent" ? undefined : "sm"}>{c.discountType === "Percent" ? `${c.discountValue}%` : `NT$${c.discountValue.toLocaleString()}`}</b><small>off</small>
                    <span className="dl-kind"><Icon name={KIND_ROUTE[c.appliesTo]?.[2] ?? "tag"} size={14} />{KIND_ROUTE[c.appliesTo]?.[1] ?? c.appliesTo}</span>
                  </div>
                  <div className="dl-body">
                    <h3>{c.description}</h3>
                    <ul className="dl-terms">
                      {c.minAmount > 0 && <li>Min. order {money(c.minAmount)}</li>}
                      {c.maxDiscount && <li>Save up to {money(c.maxDiscount)}</li>}
                      <li>{c.perCustomerLimit === 1 ? "Once per customer" : `Up to ${c.perCustomerLimit} uses per customer`}</li>
                    </ul>
                    {pct !== null && <div className="dl-claim"><span style={{ width: `${Math.max(4, pct)}%` }} /><small>{pct}% claimed · {c.usageLimit! - c.timesUsed} left</small></div>}
                    <div className="dl-foot">
                      <span className={`dl-ends${urgent ? " hot" : ""}`}><Icon name="calendar" size={13} />{l.d > 0 ? `Ends in ${l.d}d ${l.h}h` : `Ends in ${l.h}h ${l.m}m`}</span>
                      <span className="dl-actions">
                        <button type="button" className={`dl-code${copied === c.code ? " done" : ""}`} onClick={() => copy(c.code)} aria-label={`Copy code ${c.code}`}>
                          <code>{c.code}</code><span>{copied === c.code ? "Copied" : "Copy"}</span></button>
                        <button type="button" className="btn primary small" onClick={() => use(c)} data-testid={`use-${c.code}`}>Use now</button>
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}</Async>
      </section>

      <section className="wrap lp-section" id="calculator" style={{ scrollMarginTop: 80 }} aria-labelledby="calc-h">
        <div className="dl-calc">
          <div>
            <p className="kicker">Savings calculator</p>
            <h2 id="calc-h">Which code saves you the most?</h2>
            <p className="muted">Choose what you are booking and roughly how much it costs. We check every live code for you.</p>
            <div className="dl-calc-in">
              <div className="seg-sort" role="group" aria-label="What are you booking?">{["Tour", "Hotel", "Flight", "Bus", "Taxi"].map((k) =>
                <button type="button" key={k} aria-pressed={calc.kind === k} onClick={() => setCalc({ ...calc, kind: k })}>{KIND_ROUTE[k][1]}</button>)}</div>
              <label className="dl-range"><span>Booking total <b>{money(calc.amount)}</b></span>
                <input type="range" min={500} max={40000} step={100} value={calc.amount} onChange={(e) => setCalc({ ...calc, amount: Number(e.target.value) })} aria-label="Booking total" /></label>
            </div>
          </div>
          <div className="dl-best" aria-live="polite">
            {best ? <>
              <span className="dl-best-label">Best code</span>
              <b className="dl-best-code">{best.c.code}</b>
              <span className="dl-best-save">You save <b>{money(best.s)}</b></span>
              <span className="small">You pay {money(calc.amount - best.s)} instead of {money(calc.amount)}</span>
              <button type="button" className="btn gold block" onClick={() => use(best.c)}>Use {best.c.code}</button>
            </> : <><span className="dl-best-label">No code fits yet</span><span className="small">Try a higher total or another booking type. Most codes have a minimum order.</span></>}
          </div>
        </div>
      </section>

      <section className="wrap lp-section" aria-labelledby="how-h">
        <div className="lp-head"><div><p className="kicker">How it works</p><h2 id="how-h">Three steps to save</h2></div></div>
        <div className="lp-steps">
          <div className="lp-step"><h3>Pick a code</h3><p>Press Use now on any code. We remember it for you.</p></div>
          <div className="lp-step"><h3>Book as usual</h3><p>Choose your tour, room, seat or ride. The code is applied at checkout automatically.</p></div>
          <div className="lp-step"><h3>See your saving</h3><p>The discount is checked live and shown before you confirm. Cancel and the code is yours again.</p></div>
        </div>
        <div className="lp-band"><div><h2>Want member-only codes?</h2><p>Subscribe at the bottom of the page. One email a month with codes you will not find anywhere else.</p></div>
          <div className="lp-cta"><a className="btn lg gold" href="#nl-email" onClick={() => setTimeout(() => document.getElementById("nl-email")?.focus(), 400)}>Subscribe</a><Link className="btn lg glass" href="/legal/terms#coupon-codes">Coupon terms</Link></div></div>
      </section>
    </>
  );
}

/* ---------------- tours list ---------------- */
function ToursInner({ params }: { params: URLSearchParams }) {
  const [q, setQ] = useState({ destination: params.get("destination") ?? "", month: params.get("month") ?? "", pax: Number(params.get("pax") ?? 1) || 1 });
  const [sort, setSort] = useState(params.get("sort") ?? "date");
  const destinations = useAsync(() => get<Destination[]>("/catalog/destinations"), []);
  const tours = useAsync(() => get<TourCard[]>("/catalog/tours", q), [q.destination, q.month, q.pax]);
  const sorted = useMemo(() => [...(tours.data ?? [])].sort((a, b) =>
    sort === "price" ? (a.fromPrice ?? 9e9) - (b.fromPrice ?? 9e9) : sort === "days" ? a.days - b.days : String(a.nextDeparture).localeCompare(String(b.nextDeparture))), [tours.data, sort]);
  const sync = (next: typeof q, nextSort = sort) => savePageParams({ ...next, sort: nextSort });   // kept for this tab, never in the URL
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
export const ToursPage = () => <CleanParams>{(p) => <ToursInner params={p} />}</CleanParams>;

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
              <Link key={d.code} href={`/destinations/${d.slug ?? d.code}`} className="lp-tile">
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
interface CalRow { departureId: number; departureDate: string; price: number; seatsLeft: number; status: string; tourCode: string; tourSlug?: string | null; tourTitle: string; days: number; currency: string; destinationName: string }

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
              <Link key={r.departureId} href={`/tours/${r.tourSlug ?? r.tourCode}#departures`} className={`cal-ev${r.seatsLeft <= 3 ? " low" : ""}`} title={`${r.tourTitle} · ${r.seatsLeft} seats`}>
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
interface CompareRow { code: string; slug?: string | null; title: string; slogan?: string; days: number; currency: string; summary?: string; destinationName: string; region: string; businessUnitName: string; imageUrl?: string;
  bestTime?: string; gettingThere?: string; fromPrice?: number; nextDeparture?: string; openDepartures: number; seatsLeft?: number; nearbyCount: number; nearbyNames?: string }

function CompareInner({ params }: { params: URLSearchParams }) {
  const tours = useAsync(() => get<TourCard[]>("/catalog/tours"), []);
  const [picked, setPicked] = useState<string[]>((params.get("codes") ?? "").split(",").filter(Boolean).slice(0, 3));
  const cmp = useAsync(() => (picked.length >= 2 ? get<CompareRow[]>("/discover/compare", { codes: picked.join(",") }) : Promise.resolve([] as CompareRow[])), [picked.join(",")]);
  const toggle = (c: string) => {
    const next = picked.includes(c) ? picked.filter((x) => x !== c) : picked.length < 3 ? [...picked, c] : picked;
    setPicked(next); savePageParams({ codes: next.join(",") });
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
              <thead><tr><th />{list.map((r) => <th key={r.code}><div className="cmp-img" style={bg(r.imageUrl)} /><Link href={`/tours/${r.slug ?? r.code}`}>{r.title}</Link></th>)}</tr></thead>
              <tbody>{rows.map(([label, f]) => <tr key={label}><th scope="row">{label}</th>{list.map((r) => <td key={r.code}>{f(r)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}</Async>
      )}
    </>
  );
}
export const ComparePage = () => <CleanParams>{(p) => <CompareInner params={p} />}</CleanParams>;

/* ---------------- help center ---------------- */
interface Article { articleId: number; category: string; question: string; answer: string; helpfulYes?: number; helpfulNo?: number }
const TOPIC_ICON: Record<string, string> = { "Booking": "ticket", "Payments": "tag", "Changes & cancellations": "calendar", "Coupons & deals": "sparkle", "Hotels & transport": "building", "Account & privacy": "lock" };
const TOPIC_TEXT: Record<string, string> = { "Booking": "How booking works and when it is confirmed", "Payments": "When and how to pay, deposits and currency",
  "Changes & cancellations": "Cancelling, refunds and weather changes", "Coupons & deals": "Using codes and why one may not work",
  "Hotels & transport": "Rooms, flights, buses and airport taxis", "Account & privacy": "Passwords, your data and your rights" };
const topicId = (c: string) => "topic-" + c.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Wraps search matches in <mark>. */
function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return <>{parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i}>{p}</mark> : p))}</>;
}

export function HelpPage() {
  const all = useAsync(() => get<Article[]>("/help"), []);
  const support = useSetting("Ui.SupportEmail", "");
  const hours = useSetting("Ui.SupportHours", "Mon to Fri, 09:00 to 18:00 (Taiwan time)");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [voted, setVoted] = useState<Record<number, boolean>>({});
  const [active, setActive] = useState("");
  const term = q.trim();
  const list = useMemo(() => (all.data ?? []).filter((a) => !term || `${a.question} ${a.answer} ${a.category}`.toLowerCase().includes(term.toLowerCase())), [all.data, term]);
  const groups = useMemo(() => { const g: [string, Article[]][] = []; list.forEach((a) => { const x = g.find(([c]) => c === a.category); if (x) x[1].push(a); else g.push([a.category, [a]]); }); return g; }, [list]);
  const counts = useMemo(() => { const m: Record<string, number> = {}; (all.data ?? []).forEach((a) => (m[a.category] = (m[a.category] ?? 0) + 1)); return m; }, [all.data]);
  const popular = useMemo(() => [...(all.data ?? [])].sort((a, b) => (b.helpfulYes ?? 0) - (a.helpfulYes ?? 0)).slice(0, 4), [all.data]);
  // open a question from the address (#q-12) once the list has loaded
  useEffect(() => { const m = /^#q-(\d+)$/.exec(location.hash); if (all.data && m) { setOpen(Number(m[1])); setTimeout(() => document.getElementById(`q-${m[1]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100); } }, [all.data]);
  useEffect(() => {
    const obs = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive(v.target.id); }, { rootMargin: "-120px 0px -60% 0px" });
    groups.forEach(([c]) => { const el = document.getElementById(topicId(c)); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [groups]);
  const toggle = (id: number) => { const next = open === id ? null : id; setOpen(next); history.replaceState(null, "", next ? `#q-${id}` : location.pathname); };
  const vote = (id: number, helpful: boolean) => { setVoted({ ...voted, [id]: helpful }); post(`/help/${id}/feedback`, { helpful }).catch(() => {}); };
  const goTopic = (c: string) => { setQ(""); setTimeout(() => document.getElementById(topicId(c))?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  return (
    <div className="hc">
      <section className="hc-hero">
        <div className="wrap hc-hero-in">
          <p className="lp-eyebrow"><Icon name="help" size={14} />Help center</p>
          <h1>How can we help?</h1>
          <p className="lp-lead">Answers about booking, payments, changes and your account.</p>
          <div className="hc-search" role="search">
            <Icon name="search" size={20} />
            <input type="search" aria-label="Search help" placeholder="Search: refund, deposit, coupon, taxi…" value={q} onChange={(e) => { setQ(e.target.value); setOpen(null); }} data-testid="help-search" autoComplete="off" />
            {q && <button type="button" className="hc-clear" onClick={() => setQ("")} aria-label="Clear search">✕</button>}
          </div>
          <div className="hc-suggest">Popular: {["refund", "deposit", "coupon", "cancel", "password"].map((w) => <button type="button" key={w} onClick={() => setQ(w)}>{w}</button>)}</div>
        </div>
      </section>

      <div className="wrap">
        {!term && (
          <>
            <section className="hc-topics" aria-label="Topics">
              {Object.keys(counts).map((c) => (
                <button type="button" key={c} className="hc-topic" onClick={() => goTopic(c)}>
                  <span className="ico"><Icon name={TOPIC_ICON[c] ?? "help"} size={22} /></span>
                  <b>{c}</b><span>{TOPIC_TEXT[c] ?? "Questions and answers"}</span>
                  <small>{counts[c]} {counts[c] === 1 ? "article" : "articles"} <Icon name="arrow" size={13} /></small>
                </button>
              ))}
            </section>
            {popular.length > 0 && (
              <section className="hc-popular" aria-labelledby="pop-h">
                <h2 id="pop-h">Popular answers</h2>
                <div>{popular.map((a, i) => <button type="button" key={a.articleId} onClick={() => { setOpen(a.articleId); setTimeout(() => document.getElementById(`q-${a.articleId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span><span>{a.question}</span><Icon name="arrow" size={15} /></button>)}</div>
              </section>
            )}
          </>
        )}

        <div className="hc-body">
          <nav className="hc-nav" aria-label="Topics">
            <b>Topics</b>
            {groups.map(([c, items]) => <a key={c} href={`#${topicId(c)}`} className={active === topicId(c) ? "on" : undefined}><Icon name={TOPIC_ICON[c] ?? "help"} size={16} /><span>{c}</span><small>{items.length}</small></a>)}
          </nav>
          <div className="hc-list" aria-live="polite">
            {term && <p className="hc-result">{list.length} {list.length === 1 ? "answer" : "answers"} for “{term}”</p>}
            <Async state={all}>{() => groups.length === 0 ? (
              <div className="hc-empty"><Icon name="search" size={28} /><b>No answers for “{term}”</b><span>Try another word, or ask our team directly.</span><Link className="btn primary" href="/contact">Contact us</Link></div>
            ) : (
              <div data-testid="help-articles">
                {groups.map(([c, items]) => (
                  <section key={c} id={topicId(c)} className="hc-group">
                    <h2><span className="ico"><Icon name={TOPIC_ICON[c] ?? "help"} size={18} /></span>{c}</h2>
                    {items.map((a) => {
                      const isOpen = open === a.articleId || (!!term && list.length <= 3);
                      return (
                        <div key={a.articleId} id={`q-${a.articleId}`} className={`hc-q${isOpen ? " open" : ""}`}>
                          <button type="button" aria-expanded={isOpen} onClick={() => toggle(a.articleId)}><span><Hl text={a.question} q={term} /></span><span className="chev" aria-hidden="true" /></button>
                          <div className="hc-a" hidden={!isOpen}>
                            <p><Hl text={a.answer} q={term} /></p>
                            <div className="hc-vote">{voted[a.articleId] === undefined ? <>
                              <span>Was this helpful?</span>
                              <button type="button" onClick={() => vote(a.articleId, true)}><Icon name="check" size={14} />Yes</button>
                              <button type="button" onClick={() => vote(a.articleId, false)}>No</button></>
                              : voted[a.articleId] ? <span className="ok">Thanks for letting us know.</span>
                              : <span>Sorry about that. <Link href="/contact">Ask our team</Link> and we will help.</span>}</div>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}</Async>
          </div>
        </div>

        <section className="hc-still">
          <div><p className="kicker">Still need help?</p><h2>Talk to our team</h2><p>Real people in Taiwan, replying within one working day.</p></div>
          <ul>
            <li><Icon name="phone" size={18} /><div><b>Send a message</b><Link href="/contact">Open the contact form</Link></div></li>
            {support && <li><Icon name="file" size={18} /><div><b>Email</b><a href={`mailto:${support}`}>{support}</a></div></li>}
            <li><Icon name="calendar" size={18} /><div><b>Office hours</b><span>{hours}</span></div></li>
          </ul>
        </section>
      </div>
    </div>
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
