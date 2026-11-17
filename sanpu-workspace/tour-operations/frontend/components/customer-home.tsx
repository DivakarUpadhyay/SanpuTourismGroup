"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Async, DataTable, Demo, Icon, Pill, SelectInput, TextInput, fmtDate, get, money, post, useAsync, useAuth, useContent, useSetting } from "@sanpu/web";
import { PromoStrip, RecommendedSection } from "./explore";

export interface TourCard { imageUrl?: string | null; tourId: number; code: string; title: string; slogan?: string; days: number; currency: string; summary?: string; isDemo: boolean; destinationName: string; businessUnitName: string; fromPrice?: number; nextDeparture?: string; openDepartures: number }
interface Destination { code: string; name: string; region: string; imageUrl?: string | null; tourCount: number }

const bg = (url?: string | null) => (url ? { backgroundImage: `url(${url})` } : undefined);

/** Tour card used on the home page (whole card is one link). */
export function TourTile({ t }: { t: TourCard }) {
  return (
    <article className="lp-card" data-testid={`tour-${t.code}`}>
      <div className="media">
        <div className="bg" style={bg(t.imageUrl)} role="img" aria-label={`${t.destinationName} illustration`} />
        <span className="chip"><Icon name="map" size={14} />{t.destinationName}</span>
        <span className="chip right">{t.days} {t.days === 1 ? "day" : "days"}</span>
      </div>
      <div className="content">
        <span className="slogan">{t.slogan}<Demo show={t.isDemo} /></span>
        <h3><Link href={`/tours/${t.code}`}>{t.title}</Link></h3>
        <p>{t.summary}</p>
        <div className="facts">
          <span><Icon name="calendar" size={14} />{t.nextDeparture ? `Next: ${fmtDate(t.nextDeparture)}` : "No dates yet"}</span>
          <span><Icon name="building" size={14} />{t.businessUnitName}</span>
        </div>
        <div className="foot">
          <span className="price"><small>From</small><b>{t.fromPrice != null ? money(t.fromPrice, t.currency) : "—"}</b></span>
          <span className="go">View tour →</span>
        </div>
      </div>
    </article>
  );
}

export function ErpHome() {
  const tagline = useSetting("Ui.HeroTagline", "");
  const title = useSetting("Ui.HeroTitle", "Tours");
  const brand = useSetting("Ui.BrandName", "Sanpu");
  const hero = useContent("home.hero");
  const { status } = useAuth();
  const [q, setQ] = useState({ destination: "", month: "", pax: 1 });
  const [applied, setApplied] = useState(q);
  const destinations = useAsync(() => get<Destination[]>("/catalog/destinations"), []);
  const tours = useAsync(() => get<TourCard[]>("/catalog/tours", applied), [applied]);
  const toursRef = useRef<HTMLElement>(null);
  const heroImg = useSetting("Ui.HeroImage", "/images/photos/hualien.jpg");   // admin-editable
  const pick = (code: string) => {
    const next = { ...q, destination: q.destination === code ? "" : code };
    setQ(next); setApplied(next);
    toursRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const tourCount = destinations.data?.reduce((n, d) => n + d.tourCount, 0) ?? 0;
  return (
    <>
      <section className="lp-hero" style={heroImg ? ({ "--hero-img": `url(${heroImg})` } as React.CSSProperties) : undefined} data-testid="hero">
        <div className="lp-hero-in">
          <p className="lp-eyebrow">{tagline}</p>
          <h1>{title}</h1>
          <p className="lp-lead">{hero?.body}</p>
          <div className="lp-cta">
            <a className="btn lg gold" href="#tours">Explore tours</a>
            {status !== "authenticated" && <Link className="btn lg glass" href="/register">Create a free account</Link>}
          </div>
          <div className="lp-stats" aria-label="At a glance">
            <div><b>{destinations.data?.length ?? "–"}</b><span>Destinations</span></div>
            <div><b>{tourCount || "–"}</b><span>Guided tours</span></div>
            <div><b>15 min</b><span>Seat hold while you book</span></div>
          </div>
        </div>
      </section>

      <div className="wrap lp-search">
        <form onSubmit={(e) => { e.preventDefault(); setApplied(q); toursRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} aria-label="Search tours">
          <SelectInput label="Where to?" value={q.destination} onChange={(v) => setQ({ ...q, destination: v })} placeholder="Anywhere in Taiwan" options={(destinations.data ?? []).map((d) => ({ value: d.code, label: d.name }))} testId="search-destination" />
          <TextInput label="When?" type="month" value={q.month} onChange={(v) => setQ({ ...q, month: v })} data-testid="search-month" />
          <TextInput label="Travelers" type="number" min={1} max={20} value={q.pax} onChange={(v) => setQ({ ...q, pax: Math.max(1, Number(v) || 1) })} data-testid="search-pax" />
          <button className="btn primary lg" data-testid="search-submit"><Icon name="search" size={16} />Search tours</button>
        </form>
      </div>

      <section className="wrap lp-section" aria-label="Offers"><PromoStrip placement="HomeStrip" /></section>

      <section className="wrap lp-section" aria-labelledby="dest-h">
        <div className="lp-head"><div><p className="kicker">Destinations</p><h2 id="dest-h">Where will you go next?</h2><p>Pick a destination to see its tours. Every tour page has the place’s story and what is nearby.</p></div></div>
        <Async state={destinations} empty={(d) => d.length === 0}>{(list) => (
          <div className="lp-tiles">
            {list.map((d) => (
              <button key={d.code} type="button" className="lp-tile" aria-pressed={applied.destination === d.code} onClick={() => pick(d.code)} data-testid={`dest-${d.code}`}>
                <span className="bg" style={bg(d.imageUrl)} />
                <span className="meta"><b>{d.name}</b><span>{d.region} · {d.tourCount === 0 ? "tours coming soon" : `${d.tourCount} ${d.tourCount === 1 ? "tour" : "tours"}`}</span></span>
              </button>
            ))}
          </div>
        )}</Async>
      </section>

      <section className="wrap lp-section" id="tours" ref={toursRef} style={{ scrollMarginTop: 70 }} aria-labelledby="tours-h">
        <div className="lp-head">
          <div><p className="kicker">Tours</p><h2 id="tours-h">{applied.destination ? `Tours in ${destinations.data?.find((d) => d.code === applied.destination)?.name ?? "this destination"}` : "Handpicked tours"}</h2>
            <p>Live prices and seats, straight from our operations system.</p></div>
          {(applied.destination || applied.month || applied.pax > 1) && <button className="btn" onClick={() => { const r = { destination: "", month: "", pax: 1 }; setQ(r); setApplied(r); }}>Clear filters</button>}
        </div>
        <Async state={tours} empty={(t) => t.length === 0}>{(list) => (
          <div className="lp-cards" data-testid="tour-cards">{list.map((t) => <TourTile key={t.code} t={t} />)}</div>
        )}</Async>
      </section>

      <RecommendedSection />

      <section className="wrap lp-section" aria-labelledby="why-h">
        <div className="lp-head"><div><p className="kicker">Why {brand}</p><h2 id="why-h">One group, every part of your trip</h2></div></div>
        <div className="lp-features">
          <div className="lp-feature"><div className="ico"><Icon name="building" /></div><h3>Our own hotels and coaches</h3><p>Travel, hotels, transport and dining are run by one group, so plans fit together.</p></div>
          <div className="lp-feature"><div className="ico"><Icon name="calendar" /></div><h3>Live seats, fair holds</h3><p>See real seats left. Your seats are held for 15 minutes while you book.</p></div>
          <div className="lp-feature"><div className="ico"><Icon name="shield" /></div><h3>Your data protected</h3><p>Phone numbers are encrypted and only shown masked to staff who need them.</p></div>
          <div className="lp-feature"><div className="ico"><Icon name="globe" /></div><h3>Know the place</h3><p>Every tour comes with the place’s history, local tips and what is nearby.</p></div>
        </div>
        <div className="lp-band">
          <div><h2>Ready for your next journey?</h2><p>Create an account to hold seats, book in minutes and follow your booking.</p></div>
          <div className="lp-cta">
            {status === "authenticated" ? <Link className="btn lg gold" href="/my/bookings">My bookings</Link>
              : <><Link className="btn lg gold" href="/register">Create an account</Link><Link className="btn lg glass" href="/login">Sign in</Link></>}
          </div>
        </div>
      </section>
    </>
  );
}

interface Departure { departureId: number; departureDate: string; capacity: number; seatsLeft: number; price: number; status: string }
interface TourDetail {
  tour: TourCard & { region: string };
  departures: Departure[];
  guide?: { overview?: string | null; bestTime?: string | null; gettingThere?: string | null; localTip?: string | null } | null;
  history?: { era: string; title: string; detail: string }[];
  nearby?: { name: string; category: string; distanceKm: number; travelMinutes: number; detail: string }[];
}

const SECTIONS = [["overview", "Overview"], ["history", "History"], ["nearby", "Nearby"], ["departures", "Dates & prices"]] as const;

/** Highlights the section bar link for the section currently on screen. */
function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: "-130px 0px -55% 0px" });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  });
  return active;
}

export function TourDetailPage() {
  const { code } = useParams<{ code: string }>();
  const t = useAsync(() => get<TourDetail>(`/catalog/tours/${code}`), [code]);
  return <Async state={t}>{(d) => <TourDetailView d={d} />}</Async>;
}

function TourDetailView({ d }: { d: TourDetail }) {
  const { has, status } = useAuth();
  useEffect(() => { if (status !== "loading") post(`/discover/tours/${d.tour.code}/view`).catch(() => {}); }, [d.tour.code, status]);   // feeds recommendations
  const [cat, setCat] = useState("All");
  const nearby = d.nearby ?? [];
  const cats = useMemo(() => ["All", ...Array.from(new Set(nearby.map((n) => n.category)))], [nearby]);
  const shown = cat === "All" ? nearby : nearby.filter((n) => n.category === cat);
  const sections = SECTIONS.filter(([id]) => id === "departures" || id === "overview" || (id === "history" ? (d.history?.length ?? 0) > 0 : nearby.length > 0));
  const active = useActiveSection(sections.map(([id]) => id));
  const open = d.departures.filter((x) => x.status === "Open" && x.seatsLeft > 0);
  const from = open.length ? Math.min(...open.map((x) => x.price)) : null;
  const bookHref = (id: number) => (status === "authenticated" ? `/book/${id}` : `/login?next=/book/${id}`);
  const canBook = !(status === "authenticated" && !has("Booking.Create"));
  const g = d.guide;
  return (
    <>
      <section className="dt-hero" style={{ "--hero-img": `url(${d.tour.imageUrl ?? ""})` } as React.CSSProperties} role="img" aria-label={`${d.tour.destinationName} illustration`}>
        <div className="wrap">
          <div className="crumbs"><Link href="/">Home</Link> · <Link href="/#tours">Tours</Link> · {d.tour.destinationName}</div>
          <p className="lp-eyebrow" style={{ marginTop: 10 }}>{d.tour.slogan}</p>
          <h1>{d.tour.title}</h1>
          <div className="dt-badges">
            <span><Icon name="map" size={14} />{d.tour.destinationName} · {d.tour.region}</span>
            <span><Icon name="calendar" size={14} />{d.tour.days} {d.tour.days === 1 ? "day" : "days"}</span>
            <span><Icon name="building" size={14} />{d.tour.businessUnitName}</span>
          </div>
        </div>
      </section>

      <nav className="dt-tabs" aria-label="On this page">
        <div className="wrap">{sections.map(([id, label]) => <a key={id} href={`#${id}`} className={active === id ? "on" : undefined} aria-current={active === id ? "true" : undefined}>{label}</a>)}</div>
      </nav>

      <div className="wrap dt-layout">
        <div>
          <section id="overview" className="dt-section" aria-labelledby="ov-h">
            <h2 id="ov-h"><span className="ico"><Icon name="file" size={18} /></span>Overview</h2>
            {d.tour.summary && <p className="dt-overview">{d.tour.summary}</p>}
            {g?.overview && <p className="dt-overview">{g.overview}</p>}
            {g && (g.bestTime || g.gettingThere || g.localTip) && (
              <dl className="dt-glance" data-testid="guide-glance">
                {g.bestTime && <div><dt><Icon name="calendar" size={14} />Best time</dt><dd>{g.bestTime}</dd></div>}
                {g.gettingThere && <div><dt><Icon name="truck" size={14} />Getting there</dt><dd>{g.gettingThere}</dd></div>}
                {g.localTip && <div><dt><Icon name="sparkle" size={14} />Local tip</dt><dd>{g.localTip}</dd></div>}
              </dl>
            )}
          </section>

          {(d.history?.length ?? 0) > 0 && (
            <section id="history" className="dt-section" aria-labelledby="hi-h">
              <h2 id="hi-h"><span className="ico"><Icon name="history" size={18} /></span>History in brief</h2>
              <ol className="dt-timeline" data-testid="guide-history">
                {d.history!.map((h) => <li key={h.title}><span className="era">{h.era}</span><h3>{h.title}</h3><p>{h.detail}</p></li>)}
              </ol>
            </section>
          )}

          {nearby.length > 0 && (
            <section id="nearby" className="dt-section" aria-labelledby="nb-h">
              <h2 id="nb-h"><span className="ico"><Icon name="map" size={18} /></span>What’s nearby</h2>
              <div className="dt-filter" role="group" aria-label="Filter nearby places">
                {cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
              </div>
              <div className="dt-nearby" data-testid="guide-nearby">
                {shown.map((n) => (
                  <article key={n.name} className={`dt-place cat-${n.category}`}>
                    <div className="top"><span className="cat">{n.category}</span><span className="dist">{n.distanceKm} km · ~{n.travelMinutes} min</span></div>
                    <h3>{n.name}</h3>
                    <p>{n.detail}</p>
                  </article>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>Distances and times are approximate, from the tour’s base town.</p>
            </section>
          )}

          <section id="departures" className="dt-section" aria-labelledby="dp-h">
            <h2 id="dp-h"><span className="ico"><Icon name="calendar" size={18} /></span>Dates &amp; prices</h2>
            <div className="card" style={{ padding: 0 }}>
              <DataTable rows={d.departures} rowKey={(x) => x.departureId} testId="departures-table" columns={[
                { key: "departureDate", header: "Date", render: (x) => fmtDate(x.departureDate) },
                { key: "seatsLeft", header: "Seats left", render: (x) => x.status !== "Open" ? <Pill value={x.status} /> : x.seatsLeft === 0 ? <Pill value="Sold out" tone="bad" /> : x.seatsLeft <= 3 ? <Pill value={`${x.seatsLeft} left`} tone="warn" /> : x.seatsLeft },
                { key: "price", header: "Price", render: (x) => money(x.price, d.tour.currency) },
                { key: "book", header: "", render: (x) => x.status === "Open" && x.seatsLeft > 0 && (
                  !canBook ? <span className="small muted">Customer accounts only</span>
                    : <Link className="btn small primary" href={bookHref(x.departureId)} data-testid={`book-${x.departureId}`}>Book</Link>) }]} />
            </div>
          </section>
        </div>

        <aside className="dt-aside" aria-label="Book this tour">
          <div className="from"><small>From</small><b>{from != null ? money(from, d.tour.currency) : "—"}</b><span className="small muted"> per person</span></div>
          <ul>
            <li><Icon name="check" size={16} />{open.length} {open.length === 1 ? "date" : "dates"} open for booking</li>
            <li><Icon name="check" size={16} />Seats held for 15 minutes while you book</li>
            <li><Icon name="check" size={16} />Confirmed by our team after review</li>
          </ul>
          {open.length > 0 && canBook ? <Link className="btn primary lg" style={{ width: "100%", justifyContent: "center" }} href={bookHref(open[0].departureId)}>Book {fmtDate(open[0].departureDate)}</Link>
            : <a className="btn lg" style={{ width: "100%", justifyContent: "center" }} href="#departures">See all dates</a>}
          <p className="small muted" style={{ margin: "10px 0 0" }}>Other dates are listed under <a href="#departures">Dates &amp; prices</a>.</p>
        </aside>
      </div>
      <RecommendedSection title="You may also like" exclude={d.tour.code} max={3} />
    </>
  );
}
