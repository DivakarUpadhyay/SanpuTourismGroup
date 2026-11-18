"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Async, CleanParams, DatePickerInput, Icon, get, money, savePageParams, useAsync } from "@sanpu/web";

type Kind = "Hotel" | "Flight" | "Bus" | "Taxi";
interface Service {
  code: string; kind: Kind; name: string; description?: string; address?: string; highlights?: string; factsJson?: string; gallery?: string; latitude?: number; longitude?: number;
  features?: string; cancellationPolicy?: string; imageUrl?: string; rating?: number; departTime?: string; durationMin?: number; peoplePerUnit: number; maxPerBooking: number;
  basePrice: number; currency: string; providerName?: string; fromCode: string; fromName: string; fromCity: string; toCode?: string; toName?: string; toCity?: string;
}
interface Day { serviceDate: string; price: number; available: number; status: string }
interface Similar { code: string; slug?: string | null; kind: Kind; name: string; imageUrl?: string; rating?: number; departTime?: string; durationMin?: number; basePrice: number; currency: string; fromName: string; toName?: string; fromCity: string }
interface Detail { service: Service; calendar: Day[]; similar: Similar[] }

const LIST: Record<Kind, { href: string; label: string; unit: string; units: string; icon: string }> = {
  Hotel: { href: "/hotels", label: "Hotels", unit: "room", units: "rooms", icon: "building" },
  Flight: { href: "/flights", label: "Flights", unit: "seat", units: "seats", icon: "plane" },
  Bus: { href: "/buses", label: "Buses", unit: "seat", units: "seats", icon: "bus" },
  Taxi: { href: "/taxis", label: "Taxis", unit: "car", units: "cars", icon: "car" },
};
const d10 = (v: string) => v.slice(0, 10);
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const hhmm = (t?: string) => (t ? t.slice(0, 5) : "");
const dur = (m?: number) => (m ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)} h ` : ""}${m % 60 ? `${m % 60} min` : ""}`.trim() : "");
const arrive = (t?: string, m?: number) => { if (!t || !m) return ""; const [h, mi] = t.split(":").map(Number); const x = h * 60 + mi + m; return `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
const nice = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
// an icon per fact, picked from the label
const factIcon = (label: string) => /check|time|journey|closes|waiting/i.test(label) ? "calendar" : /bag|luggage|carry/i.test(label) ? "briefcase" : /bed|room|suite|seat|sleeps/i.test(label) ? "building"
  : /aircraft|vehicle|cabin/i.test(label) ? "plane" : /stop|airport|boarding|altitude/i.test(label) ? "map" : /breakfast|wi-fi|parking/i.test(label) ? "check" : /child|passengers|assist/i.test(label) ? "users" : "file";

function DetailInner({ p }: { p: URLSearchParams }) {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1);
  const [date, setDate] = useState(p.get("date") ?? addDays(tomorrow, 13));
  const [endDate, setEndDate] = useState(p.get("endDate") ?? addDays(p.get("date") ?? addDays(tomorrow, 13), 2));
  const [travelers, setTravelers] = useState(Number(p.get("travelers") ?? 2) || 1);
  const [units, setUnits] = useState(Number(p.get("units") ?? 1) || 1);
  const [photo, setPhoto] = useState(0);
  const from = useMemo(() => addDays(date, -7) > tomorrow ? addDays(date, -7) : tomorrow, [date, tomorrow]);
  const d = useAsync(() => get<Detail>(`/travel/services/${code}`, { from }), [code, from]);
  const [active, setActive] = useState("overview");
  useEffect(() => {
    const obs = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive(v.target.id); }, { rootMargin: "-140px 0px -55% 0px" });
    ["overview", "details", "policies", "dates", "similar"].forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  });
  return (
    <Async state={d}>{({ service: s, calendar, similar }) => {
      const meta = LIST[s.kind];
      const isHotel = s.kind === "Hotel";
      const perUnitTravel = s.kind === "Flight" || s.kind === "Bus";
      const qty = perUnitTravel ? travelers : units;
      const photos = Array.from(new Set([s.imageUrl, ...(s.gallery ?? "").split(",")].filter(Boolean))) as string[];
      const facts: { label: string; value: string }[] = (() => { try { return JSON.parse(s.factsJson ?? "[]"); } catch { return []; } })();
      const highlights = (s.highlights ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
      const byDate = new Map(calendar.map((c) => [d10(c.serviceDate), c]));
      const nights = isHotel ? Math.max(1, Math.round((+new Date(endDate) - +new Date(date)) / 864e5)) : 1;
      const stayDays = Array.from({ length: nights }, (_, i) => byDate.get(addDays(date, i)));
      const known = stayDays.every(Boolean);
      const open = known && stayDays.every((x) => x!.status === "Open");
      const minLeft = known ? Math.min(...stayDays.map((x) => x!.available)) : 0;
      const perUnit = known ? stayDays.reduce((a, x) => a + x!.price, 0) : 0;
      const total = perUnit * qty;
      const enough = open && minLeft >= (perUnit ? (isHotel || s.kind === "Taxi" ? units : travelers) : 1) && travelers <= s.peoplePerUnit * (perUnitTravel ? travelers : units);
      const cheapest = calendar.filter((c) => c.status === "Open" && c.available > 0).reduce<Day | null>((m, c) => (!m || c.price < m.price ? c : m), null);
      const bookHref = `/services/book?${new URLSearchParams({ code: s.code, date, ...(isHotel ? { endDate } : {}), units: String(qty), travelers: String(travelers) })}`;
      const mapHref = s.latitude && s.longitude ? `https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=15/${s.latitude}/${s.longitude}` : null;
      const pick = (iso: string) => { setDate(iso); if (isHotel && endDate <= iso) setEndDate(addDays(iso, Math.max(1, nights))); else if (isHotel) setEndDate(addDays(iso, nights)); };
      return (
        <>
          <section className="sd-hero" style={{ "--hero-img": `url(${photos[photo] ?? ""})` } as React.CSSProperties}>
            <div className="wrap">
              <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link> · <Link href={meta.href}>{meta.label}</Link> · <span>{s.name}</span></nav>
              <p className="lp-eyebrow"><Icon name={meta.icon} size={14} />{s.providerName}</p>
              <h1>{s.name}</h1>
              <div className="dt-badges">
                {s.rating && <span className="rate"><Icon name="star" size={14} />{s.rating.toFixed(1)} rating</span>}
                <span><Icon name="map" size={14} />{isHotel ? s.fromCity : `${s.fromCity} → ${s.toCity}`}</span>
                {s.durationMin && !isHotel && <span><Icon name="calendar" size={14} />{dur(s.durationMin)}</span>}
                {s.cancellationPolicy?.startsWith("Free") && <span className="ok-badge"><Icon name="check" size={14} />Free cancellation</span>}
              </div>
              {photos.length > 1 && <div className="sd-thumbs" role="tablist" aria-label="Photos">
                {photos.map((src, i) => <button type="button" key={src} role="tab" aria-selected={i === photo} aria-label={`Photo ${i + 1}`} style={{ backgroundImage: `url(${src})` }} onClick={() => setPhoto(i)} />)}
              </div>}
            </div>
          </section>

          <nav className="dt-tabs" aria-label="On this page"><div className="wrap">
            {[["overview", "Overview"], ["details", "What's included"], ["policies", "Policies"], ["dates", "Dates & prices"], ["similar", "Similar"]].map(([id, l]) =>
              <a key={id} href={`#${id}`} className={active === id ? "on" : undefined}>{l}</a>)}
          </div></nav>

          <div className="wrap dt-layout">
            <div>
              {!isHotel && (
                <section className="sd-journey" aria-label="Journey">
                  <div className="end"><b>{hhmm(s.departTime) || "Your time"}</b><span>{s.fromName}</span><small>{s.fromCity}</small></div>
                  <div className="line"><span className="ico"><Icon name={meta.icon} size={18} /></span><small>{dur(s.durationMin)}{s.kind === "Flight" || s.kind === "Bus" ? " · direct" : ""}</small></div>
                  <div className="end right"><b>{arrive(s.departTime, s.durationMin) || `~${dur(s.durationMin)}`}</b><span>{s.toName}</span><small>{s.toCity}</small></div>
                </section>
              )}

              <section id="overview" className="dt-section">
                <h2><span className="ico"><Icon name="file" size={18} /></span>Overview</h2>
                {s.description && <p className="dt-overview">{s.description}</p>}
                {highlights.length > 0 && <ul className="sd-high">{highlights.map((h) => <li key={h}><Icon name="check" size={16} />{h}</li>)}</ul>}
                {s.address && (
                  <div className="sd-loc">
                    <span className="ico"><Icon name="map" size={18} /></span>
                    <div><b>{isHotel ? "Location" : "Where to meet"}</b><span>{s.address}</span></div>
                    {mapHref && <a className="go-link" href={mapHref} target="_blank" rel="noopener noreferrer">Open in map <Icon name="arrow" size={14} /></a>}
                  </div>
                )}
              </section>

              <section id="details" className="dt-section">
                <h2><span className="ico"><Icon name="list" size={18} /></span>What&apos;s included</h2>
                <dl className="sd-facts">{facts.map((f) => <div key={f.label}><dt><Icon name={factIcon(f.label)} size={16} />{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
                {s.features && <div className="sd-tags">{s.features.split(",").map((f) => <span key={f}>{f.trim()}</span>)}</div>}
              </section>

              <section id="policies" className="dt-section">
                <h2><span className="ico"><Icon name="shield" size={18} /></span>Policies</h2>
                <ul className="sd-policy">
                  <li><b>Cancellation</b><span>{s.cancellationPolicy ?? "See booking terms."}</span></li>
                  <li><b>Payment</b><span>Pay in full or a deposit after booking; the balance is due before your trip. Prices are in TWD and include tax.</span></li>
                  {isHotel ? <><li><b>Guests</b><span>Up to {s.peoplePerUnit} guests per room. Please bring the ID or passport used for the booking.</span></li>
                    <li><b>Check-in</b><span>Times are shown under What&apos;s included. Early check-in depends on availability.</span></li></>
                    : s.kind === "Taxi" ? <li><b>Pickup</b><span>Up to {s.peoplePerUnit} passengers per car. Your driver waits at the meeting point with your name.</span></li>
                    : <li><b>Travel documents</b><span>Bring a valid photo ID. Boarding closes at the time shown under What&apos;s included.</span></li>}
                </ul>
              </section>

              <section id="dates" className="dt-section">
                <h2><span className="ico"><Icon name="calendar" size={18} /></span>Dates &amp; prices</h2>
                <p className="small muted" style={{ marginTop: -6 }}>Price per {isHotel ? "night" : meta.unit}. Pick a day to {isHotel ? "check in" : "travel"}.</p>
                <div className="sd-days" role="listbox" aria-label="Choose a date">
                  {calendar.map((c) => {
                    const iso = d10(c.serviceDate), off = c.status !== "Open" || c.available <= 0;
                    const sel = iso === date || (isHotel && iso > date && iso < endDate);
                    return (
                      <button type="button" key={iso} role="option" aria-selected={iso === date} disabled={off} className={`${sel ? "sel" : ""}${cheapest && iso === d10(cheapest.serviceDate) ? " low" : ""}`} onClick={() => pick(iso)}>
                        <small>{nice(iso).split(" ")[0]}</small><b>{nice(iso).split(" ").slice(1).join(" ")}</b>
                        <span>{off ? "Sold out" : money(c.price, s.currency).replace("TWD ", "")}</span>
                        {!off && c.available <= 3 && <em>{c.available} left</em>}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <aside className="dt-aside sd-book" aria-label="Reserve">
              <div className="from"><small>{isHotel ? "Per night from" : "Per " + meta.unit + " from"}</small><b>{money(cheapest?.price ?? s.basePrice, s.currency)}</b></div>
              <div className="sd-fields">
                <label><span>{isHotel ? "Check-in" : "Date"}</span><DatePickerInput mode="date" min={tomorrow} value={date} onChange={(v) => v && pick(v)} aria-label="Date" /></label>
                {isHotel && <label><span>Check-out</span><DatePickerInput mode="date" min={addDays(date, 1)} value={endDate} onChange={(v) => v && setEndDate(v)} aria-label="Check-out" /></label>}
                <div className="sd-step"><span>{isHotel ? "Guests" : s.kind === "Taxi" ? "Passengers" : "Travelers"}</span>
                  <div className="stepper"><button type="button" aria-label="Fewer" disabled={travelers <= 1} onClick={() => setTravelers(travelers - 1)}>−</button><output>{travelers}</output>
                    <button type="button" aria-label="More" disabled={travelers >= (perUnitTravel ? s.maxPerBooking : s.peoplePerUnit * units)} onClick={() => setTravelers(travelers + 1)}>+</button></div></div>
                {!perUnitTravel && <div className="sd-step"><span>{isHotel ? "Rooms" : "Cars"}</span>
                  <div className="stepper"><button type="button" aria-label="Fewer" disabled={units <= 1} onClick={() => setUnits(units - 1)}>−</button><output>{units}</output>
                    <button type="button" aria-label="More" disabled={units >= s.maxPerBooking} onClick={() => setUnits(units + 1)}>+</button></div></div>}
              </div>
              {known ? (
                <ul className="sum">
                  <li><span>{isHotel ? `${money(perUnit / nights, s.currency)} avg × ${nights} night${nights > 1 ? "s" : ""}` : `${money(perUnit, s.currency)} each`} × {qty} {qty === 1 ? meta.unit : meta.units}</span><b>{money(total, s.currency)}</b></li>
                  <li className="total"><span>Total</span><b>{money(total, s.currency)}</b></li>
                </ul>
              ) : <p className="small muted">Choose dates within the calendar to see the price.</p>}
              {known && !open && <p className="error small">Not available on these dates. Pick another day.</p>}
              {known && open && minLeft <= 3 && <p className="warn-note small">Only {minLeft} {minLeft === 1 ? meta.unit : meta.units} left at this price.</p>}
              {travelers > s.peoplePerUnit * (perUnitTravel ? travelers : units) && <p className="error small">Add another {meta.unit} for {travelers} people.</p>}
              <button className="btn primary lg block" disabled={!known || !enough} onClick={() => router.push(bookHref)} data-testid="sd-reserve">Reserve</button>
              <ul className="sd-assure">
                <li><Icon name="check" size={14} />Confirmed once payment succeeds</li>
                <li><Icon name="check" size={14} />Pay now or pay a deposit</li>
                <li><Icon name="tag" size={14} />Have a coupon? Add it at checkout</li>
              </ul>
            </aside>
          </div>

          {similar.length > 0 && (
            <section id="similar" className="wrap lp-section dt-section" aria-labelledby="sim-h">
              <div className="lp-head"><div><p className="kicker">You might also like</p><h2 id="sim-h">Similar {meta.label.toLowerCase()}</h2></div></div>
              <div className="lp-cards">
                {similar.map((x) => (
                  <article key={x.code} className="lp-card">
                    <div className="media"><div className="bg" style={{ backgroundImage: `url(${x.imageUrl ?? ""})` }} role="img" aria-label={x.name} />
                      {x.rating && <span className="chip"><Icon name="star" size={14} />{x.rating.toFixed(1)}</span>}</div>
                    <div className="content">
                      <span className="slogan">{x.kind === "Hotel" ? x.fromCity : `${x.fromName} → ${x.toName}`}</span>
                      <h3><Link href={`/services/${x.slug ?? x.code}`} onClick={() => savePageParams({ date, endDate: isHotel ? endDate : undefined, travelers, units }, `/services/${x.slug ?? x.code}`)}>{x.name}</Link></h3>
                      <div className="foot"><span className="price"><small>From</small><b>{money(x.basePrice, x.currency)}</b></span>
                        <Link className="go-btn" href={`/services/${x.slug ?? x.code}`} onClick={() => savePageParams({ date, endDate: isHotel ? endDate : undefined, travelers, units }, `/services/${x.slug ?? x.code}`)}>View details<Icon name="arrow" size={15} /></Link></div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      );
    }}</Async>
  );
}

export const ServiceDetailPage = () => <CleanParams>{(p) => <DetailInner p={p} />}</CleanParams>;
