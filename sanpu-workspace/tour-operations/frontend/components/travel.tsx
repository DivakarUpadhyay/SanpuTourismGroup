"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  ApiError, Async, Card, Checkbox, ConfirmButton, ErrorBox, FormError, Icon, PageHeader, Pill, SelectInput, TextArea, TextInput,
  fmtDate, fmtDateTime, get, money, newKey, post, useAction, useAsync, useAuth, useContent
} from "@sanpu/web";
import { PromoStrip } from "./explore";

type Kind = "Hotel" | "Flight" | "Bus" | "Taxi";
interface Place { placeId: number; code: string; name: string; kind: string; city: string }
interface Result {
  serviceId: number; code: string; kind: Kind; name: string; features?: string; cancellationPolicy?: string; imageUrl?: string; rating?: number; departTime?: string; durationMin?: number;
  peoplePerUnit: number; maxPerBooking: number; currency: string; providerName?: string; fromCode: string; fromName: string; fromCity: string; toCode?: string; toName?: string; toCity?: string;
  available: number; totalPrice: number; nightlyPrice: number; nights: number;
}

const META: Record<Kind, { title: string; tagline: string; lead: string; image: string; icon: string; unit: string; units: string; fromLabel: string; toLabel?: string; fromKinds: string[]; toKinds?: string[] }> = {
  Hotel: { title: "Hotels", tagline: "Stay", lead: "Rooms in our own and partner hotels across Taiwan. Prices are totals for your whole stay.", image: "/images/photos/sunmoon.jpg", icon: "building", unit: "room", units: "rooms", fromLabel: "City", fromKinds: ["City"] },
  Flight: { title: "Domestic flights", tagline: "Fly", lead: "Island and east-coast flights with checked bags included.", image: "/images/photos/kinmen.jpg", icon: "plane", unit: "seat", units: "seats", fromLabel: "From", toLabel: "To", fromKinds: ["Airport"], toKinds: ["Airport"] },
  Bus: { title: "Express buses", tagline: "Ride", lead: "Comfortable intercity and mountain buses with reserved seats.", image: "/images/photos/alishan.jpg", icon: "bus", unit: "seat", units: "seats", fromLabel: "From", toLabel: "To", fromKinds: ["Station"], toKinds: ["Station"] },
  Taxi: { title: "Airport & city taxis", tagline: "Transfer", lead: "Fixed prices, meet and greet, flight tracking. Choose your pickup time.", image: "/images/photos/taipei.jpg", icon: "car", unit: "car", units: "cars", fromLabel: "Pickup", toLabel: "Drop-off", fromKinds: ["Airport", "Zone"], toKinds: ["Zone", "Airport"] },
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return iso(d); };
const hhmm = (t?: string) => (t ? t.slice(0, 5) : "");
const dur = (m?: number) => (m ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)} h ` : ""}${m % 60 ? `${m % 60} min` : ""}`.trim() : "");
const arrive = (t?: string, m?: number) => { if (!t || !m) return ""; const [h, mi] = t.split(":").map(Number); const x = h * 60 + mi + m; return `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}${x >= 1440 ? " +1" : ""}`; };

/* ---------------- search ---------------- */
function SearchInner({ kind }: { kind: Kind }) {
  const meta = META[kind];
  const params = useSearchParams();
  const router = useRouter();
  const places = useAsync(() => get<Place[]>("/travel/places", { kind }), [kind]);
  const [q, setQ] = useState({
    from: params.get("from") ?? "", to: params.get("to") ?? "", date: params.get("date") ?? plus(14), endDate: params.get("endDate") ?? plus(16),
    units: Number(params.get("units") ?? 1), travelers: Number(params.get("travelers") ?? (kind === "Hotel" ? 2 : 1)), sort: params.get("sort") ?? "price",
  });
  const [applied, setApplied] = useState(q);
  const results = useAsync(() => get<Result[]>("/travel/search", { kind, from: applied.from, to: applied.to, date: applied.date, endDate: kind === "Hotel" ? applied.endDate : undefined,
    units: applied.units, travelers: applied.travelers, sort: applied.sort }), [JSON.stringify(applied)]);
  const opts = (kinds?: string[]) => (places.data ?? []).filter((p) => !kinds || kinds.includes(p.kind)).map((p) => ({ value: p.code, label: kind === "Hotel" ? p.city : `${p.name}${p.kind === "Zone" ? ` (${p.city})` : ""}` }));
  const submit = (next = q) => { setApplied(next); router.replace(`?${new URLSearchParams(Object.entries(next).map(([k, v]) => [k, String(v)]))}`, { scroll: false }); };
  return (
    <>
      <section className="dt-hero" style={{ "--hero-img": `url(${meta.image})` } as React.CSSProperties}>
        <div className="wrap"><p className="lp-eyebrow">{meta.tagline}</p><h1>{meta.title}</h1><p className="lp-lead" style={{ marginBottom: 0 }}>{meta.lead}</p></div>
      </section>
      <div className="wrap lp-search">
        <form className="svc-form" onSubmit={(e) => { e.preventDefault(); submit(); }} aria-label={`Search ${meta.title}`}>
          <SelectInput label={meta.fromLabel} value={q.from} onChange={(v) => setQ({ ...q, from: v })} placeholder={kind === "Hotel" ? "Any city" : "Anywhere"} options={opts(meta.fromKinds)} testId="svc-from" />
          {meta.toLabel && <SelectInput label={meta.toLabel} value={q.to} onChange={(v) => setQ({ ...q, to: v })} placeholder="Anywhere" options={opts(meta.toKinds)} testId="svc-to" />}
          <TextInput label={kind === "Hotel" ? "Check-in" : "Date"} type="date" min={plus(1)} value={q.date} onChange={(v) => setQ({ ...q, date: v, endDate: kind === "Hotel" && v >= q.endDate ? iso(new Date(new Date(v).getTime() + 2 * 864e5)) : q.endDate })} data-testid="svc-date" />
          {kind === "Hotel" && <TextInput label="Check-out" type="date" min={q.date} value={q.endDate} onChange={(v) => setQ({ ...q, endDate: v })} data-testid="svc-end" />}
          <TextInput label={kind === "Hotel" ? "Guests" : kind === "Taxi" ? "Passengers" : "Travelers"} type="number" min={1} max={20} value={q.travelers} onChange={(v) => setQ({ ...q, travelers: Math.max(1, Number(v) || 1) })} />
          {(kind === "Hotel" || kind === "Taxi") && <TextInput label={kind === "Hotel" ? "Rooms" : "Cars"} type="number" min={1} max={9} value={q.units} onChange={(v) => setQ({ ...q, units: Math.max(1, Number(v) || 1) })} />}
          <button className="btn primary lg" data-testid="svc-search"><Icon name="search" size={16} />Search</button>
        </form>
      </div>
      <section className="wrap lp-section" aria-live="polite">
        <div className="lp-head">
          <div><p className="kicker">Results</p><h2>{results.data ? `${results.data.length} ${results.data.length === 1 ? "option" : "options"}` : "Searching…"}</h2></div>
          <SelectInput label="Sort by" value={applied.sort} onChange={(v) => submit({ ...q, sort: v })} options={[{ value: "price", label: "Lowest price" }, { value: "rating", label: "Top rated" }, ...(kind === "Flight" || kind === "Bus" ? [{ value: "time", label: "Departure time" }] : [])]} />
        </div>
        <div className={results.loading && results.data ? "refreshing" : undefined}>
          <Async state={results} empty={(r) => r.length === 0}>{(list) => (
            <div className="svc-list" data-testid="svc-results">
              {list.map((r) => <ResultCard key={r.code} r={r} applied={applied} />)}
            </div>
          )}</Async>
        </div>
      </section>
      <section className="wrap lp-section"><PromoStrip placement="Deals" /></section>
    </>
  );
}

function ResultCard({ r, applied }: { r: Result; applied: { date: string; endDate: string; units: number; travelers: number } }) {
  const units = r.kind === "Flight" || r.kind === "Bus" ? applied.travelers : applied.units;
  const href = `/services/book?${new URLSearchParams({ code: r.code, date: applied.date, ...(r.kind === "Hotel" ? { endDate: applied.endDate } : {}), units: String(units), travelers: String(applied.travelers) })}`;
  const total = r.totalPrice * units;
  return (
    <article className="svc-card" data-testid={`svc-${r.code}`}>
      <div className="svc-img" style={{ backgroundImage: `url(${r.imageUrl ?? ""})` }} aria-hidden="true" />
      <div className="svc-body">
        <div className="svc-top"><span className="slogan">{r.providerName}</span>{r.rating && <span className="rating"><Icon name="star" size={14} />{r.rating.toFixed(1)}</span>}</div>
        <h3>{r.name}</h3>
        {r.kind === "Hotel" ? <p className="small muted"><Icon name="map" size={14} /> {r.fromCity} · {r.nights} {r.nights === 1 ? "night" : "nights"}</p> : (
          <div className="svc-route">
            <div><b>{hhmm(r.departTime) || "Your time"}</b><span>{r.fromName}</span></div>
            <div className="line"><span>{dur(r.durationMin)}</span></div>
            <div><b>{arrive(r.departTime, r.durationMin) || "~" + dur(r.durationMin)}</b><span>{r.toName}</span></div>
          </div>
        )}
        <ul className="svc-feat">{(r.features ?? "").split(",").filter(Boolean).slice(0, 4).map((f) => <li key={f}><Icon name="check" size={13} />{f}</li>)}</ul>
        {r.cancellationPolicy && <p className="small" style={{ color: "var(--success)", margin: 0 }}>{r.cancellationPolicy}</p>}
      </div>
      <div className="svc-price">
        {r.available <= 5 && <span className="pill warn">Only {r.available} left</span>}
        <small>{r.kind === "Hotel" ? `${money(r.nightlyPrice, r.currency)} / night` : `${money(r.totalPrice, r.currency)} each`}</small>
        <b>{money(total, r.currency)}</b>
        <small>total for {units} {units === 1 ? META[r.kind].unit : META[r.kind].units}</small>
        <Link className="btn primary" href={href} data-testid={`svc-book-${r.code}`}>Select</Link>
      </div>
    </article>
  );
}

export const ServiceSearchPage = ({ kind }: { kind: Kind }) => <Suspense><SearchInner kind={kind} /></Suspense>;

/* ---------------- coupon field (shared by tour and service checkout) ---------------- */
export function CouponField({ kind, amount, value, onApplied }: { kind: string; amount: number; value: string; onApplied: (code: string, discount: number) => void }) {
  const [code, setCode] = useState(value);
  const [state, setState] = useState<{ ok?: string; error?: string; busy?: boolean }>({});
  const check = async () => {
    if (!code.trim()) { onApplied("", 0); setState({}); return; }
    setState({ busy: true });
    try {
      const r = await post<{ code: string; description: string; discountAmount: number }>("/marketing/coupons/check", { code, kind, amount });
      onApplied(r.code, r.discountAmount); setState({ ok: `${r.description}: −${money(r.discountAmount)}` });
    } catch (e) { onApplied("", 0); setState({ error: e instanceof ApiError ? e.message : "Could not check the code." }); }
  };
  useEffect(() => { if (value && amount > 0) check(); }, [amount]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="coupon-field">
      <label htmlFor="coupon">Coupon code</label>
      <div className="row"><input id="coupon" value={code} placeholder="e.g. WELCOME10" onChange={(e) => setCode(e.target.value.toUpperCase())} data-testid="coupon-code" />
        <button type="button" className="btn" disabled={state.busy} onClick={check} data-testid="coupon-apply">{state.busy ? "Checking…" : "Apply"}</button></div>
      {state.ok && <p className="ok small" data-testid="coupon-ok">{state.ok}</p>}
      {state.error && <p className="error small" role="alert" data-testid="coupon-error">{state.error}</p>}
    </div>
  );
}

/* ---------------- service checkout ---------------- */
function BookInner() {
  const p = useSearchParams();
  const router = useRouter();
  const { status } = useAuth();
  const privacy = useContent("privacy.notice");
  const code = p.get("code") ?? "", date = p.get("date") ?? "", endDate = p.get("endDate") ?? "";
  const units = Number(p.get("units") ?? 1), travelers = Number(p.get("travelers") ?? 1);
  const [kind, setKind] = useState<Kind | null>(null);
  const svc = useAsync(async () => {
    for (const k of ["Hotel", "Flight", "Bus", "Taxi"] as Kind[]) {
      if (!code.startsWith(k[0])) continue;
      const list = await get<Result[]>("/travel/search", { kind: k, date, endDate: k === "Hotel" ? endDate : undefined, units: k === "Flight" || k === "Bus" ? units : units, travelers });
      const hit = list.find((x) => x.code === code);
      if (hit) { setKind(k); return hit; }
    }
    throw new ApiError(409, "sold_out", "This option is no longer available for these dates. Please search again.");
  }, [code, date, endDate, units, travelers]);
  const [f, setF] = useState({ leadName: "", leadPhone: "", pickupAddress: "", pickupTime: "10:00", notes: "", acceptTerms: false });
  const [coupon, setCoupon] = useState({ code: "", discount: 0 });
  const [key] = useState(() => newKey("svc"));
  const a = useAction();
  useEffect(() => { if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(`/services/book?${p.toString()}`)}`); }, [status, router, p]);
  return (
    <Async state={svc}>{(s) => {
      const subtotal = s.totalPrice * units;
      return (
        <>
          <PageHeader tagline="Checkout" title={s.name} lead={`${s.kind === "Hotel" ? `${fmtDate(date)} to ${fmtDate(endDate)} · ${s.nights} nights` : `${fmtDate(date)}${s.departTime ? ` · ${hhmm(s.departTime)}` : ""} · ${s.fromName} → ${s.toName}`}`} />
          <div className="checkout">
            <Card title="Traveler details">
              <FormError error={a.error} />
              {a.error && !(a.error instanceof ApiError && a.error.errors) ? <ErrorBox error={a.error} /> : null}
              <form className="form" noValidate onSubmit={async (e) => {
                e.preventDefault();
                const r = await a.run(() => post<{ serviceBookingId: number; bookingRef: string }>("/travel/bookings", {
                  serviceCode: code, date, endDate: s.kind === "Hotel" ? endDate : null, units, travelers, ...f, pickupAddress: s.kind === "Taxi" ? f.pickupAddress : null,
                  pickupTime: s.kind === "Taxi" ? f.pickupTime : null, couponCode: coupon.code || null, idempotencyKey: key }), "Booking confirmed");
                if (r) router.push(`/my/bookings?booked=${r.bookingRef}&pay=Service:${r.serviceBookingId}`);
              }}>
                <div className="form cols">
                  <TextInput label="Lead traveler name" value={f.leadName} onChange={(v) => setF({ ...f, leadName: v })} error={a.fieldError("leadName")} autoComplete="name" data-testid="svc-name" />
                  <TextInput label="Mobile phone" type="tel" value={f.leadPhone} onChange={(v) => setF({ ...f, leadPhone: v })} error={a.fieldError("leadPhone")} hint="Stored encrypted." autoComplete="tel" data-testid="svc-phone" />
                </div>
                {s.kind === "Taxi" && <div className="form cols">
                  <TextInput label={s.fromName.includes("Airport") ? "Flight number or pickup point" : "Pickup address"} value={f.pickupAddress} onChange={(v) => setF({ ...f, pickupAddress: v })} error={a.fieldError("pickupAddress")} data-testid="svc-pickup" />
                  <TextInput label="Pickup time" type="time" value={f.pickupTime} onChange={(v) => setF({ ...f, pickupTime: v })} error={a.fieldError("pickupTime")} />
                </div>}
                <TextArea label="Notes for the provider (optional)" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} maxLength={500} />
                <details className="small"><summary>{privacy?.subject ?? "Privacy notice"}</summary><p>{privacy?.body}</p></details>
                <Checkbox label="I accept the terms of use and the privacy notice" checked={f.acceptTerms} onChange={(v) => setF({ ...f, acceptTerms: v })} testId="svc-terms" />
                {a.fieldError("acceptTerms") && <div className="error small">{a.fieldError("acceptTerms")}</div>}
                <div className="form-actions"><button className="btn primary lg" disabled={a.busy} data-testid="svc-confirm">{a.busy ? "Confirming…" : `Confirm and book · ${money(subtotal - coupon.discount, s.currency)}`}</button></div>
              </form>
            </Card>
            <aside className="dt-aside" aria-label="Price summary">
              <div className="sum-img" style={{ backgroundImage: `url(${s.imageUrl ?? ""})` }} />
              <ul className="sum">
                <li><span>{s.kind === "Hotel" ? `${units} room(s) × ${s.nights} night(s)` : `${units} × ${money(s.totalPrice, s.currency)}`}</span><b>{money(subtotal, s.currency)}</b></li>
                {coupon.discount > 0 && <li className="ok"><span>Coupon {coupon.code}</span><b>−{money(coupon.discount, s.currency)}</b></li>}
                <li className="total"><span>Total</span><b>{money(subtotal - coupon.discount, s.currency)}</b></li>
              </ul>
              {kind && <CouponField kind={kind} amount={subtotal} value={coupon.code} onApplied={(c, d) => setCoupon({ code: c, discount: d })} />}
              <p className="small muted" style={{ marginBottom: 0 }}>Confirmed instantly. Pay now in full, or pay a deposit and the rest later, from My bookings.</p>
            </aside>
          </div>
          <PromoStrip placement="Checkout" />
        </>
      );
    }}</Async>
  );
}
export const ServiceBookPage = () => <Suspense><BookInner /></Suspense>;

/* ---------------- payments ---------------- */
interface PaySummary { summary: { orderRef: string; status: string; paymentStatus: string; totalAmount: number; amountPaid: number; balance: number; startDate: string; balanceDueDate?: string;
  canPay: boolean; canPayDeposit: boolean; depositAmount: number; depositPercent: number }; history: { merchantTradeNo: string; mode: string; amount: number; provider: string; status: string; paymentMethod?: string; createdAtUtc: string }[] }

/** Pay in full, pay a deposit, or pay the remaining balance. ECPay redirects to its hosted page; the simulated provider completes at once. */
export function PaymentPanel({ orderType, orderId, onPaid }: { orderType: "Tour" | "Service"; orderId: number; onPaid?: () => void }) {
  const s = useAsync(() => get<PaySummary>("/payments/summary", { orderType, orderId }), [orderType, orderId]);
  const a = useAction();
  const pay = async (mode: "Deposit" | "Balance" | "Full") => {
    const r = await a.run(() => post<{ completed: boolean; action?: string; fields?: Record<string, string> }>("/payments/checkout", { orderType, orderId, mode }));
    if (!r) return;
    if (r.completed) { s.reload(); onPaid?.(); return; }
    if (r.action && r.fields) {   // hand over to the gateway's hosted checkout page
      const form = document.createElement("form");
      form.method = "POST"; form.action = r.action;
      Object.entries(r.fields).forEach(([k, v]) => { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; form.appendChild(i); });
      document.body.appendChild(form); form.submit();
    }
  };
  return (
    <Async state={s}>{({ summary: x, history }) => (
      <div className="pay-panel" data-testid={`pay-${orderType}-${orderId}`}>
        <div className="pay-bar"><span style={{ width: `${Math.min(100, (x.amountPaid / Math.max(1, x.totalAmount)) * 100)}%` }} /></div>
        <div className="pay-figs">
          <div><small>Total</small><b>{money(x.totalAmount)}</b></div>
          <div><small>Paid</small><b>{money(x.amountPaid)}</b></div>
          <div><small>Balance</small><b>{money(x.balance)}</b>{x.balanceDueDate && x.balance > 0 && x.amountPaid > 0 ? <small>due {fmtDate(x.balanceDueDate)}</small> : null}</div>
        </div>
        {x.canPay ? (
          <div className="row" style={{ marginTop: 10 }}>
            {x.amountPaid > 0 ? <button className="btn primary" disabled={a.busy} onClick={() => pay("Balance")} data-testid="pay-balance">Pay balance {money(x.balance)}</button> : <>
              <button className="btn primary" disabled={a.busy} onClick={() => pay("Full")} data-testid="pay-full">Pay in full {money(x.balance)}</button>
              {x.canPayDeposit && <button className="btn" disabled={a.busy} onClick={() => pay("Deposit")} data-testid="pay-deposit">Pay {x.depositPercent}% deposit {money(x.depositAmount)}</button>}
            </>}
          </div>
        ) : x.status === "Confirmed" ? <p className="ok small">Fully paid. Thank you.</p> : x.status === "Pending" ? <p className="small muted">You can pay once our team confirms this booking.</p> : null}
        {history.length > 0 && <ul className="pay-hist">{history.map((h) => <li key={h.merchantTradeNo}><Pill value={h.status} /> {h.mode} {money(h.amount)} · {h.provider}{h.paymentMethod ? ` (${h.paymentMethod})` : ""} · {fmtDateTime(h.createdAtUtc)}</li>)}</ul>}
      </div>
    )}</Async>
  );
}

/* ---------------- my service bookings ---------------- */
interface MyService { serviceBookingId: number; bookingRef: string; kind: Kind; serviceName: string; fromName: string; toName?: string; startDate: string; endDate: string; units: number; travelers: number;
  totalAmount: number; discountAmount: number; currency: string; status: string; paymentStatus: string; departTime?: string; imageUrl?: string }

export function MyServiceBookings({ highlight }: { highlight?: string }) {
  const list = useAsync(() => get<MyService[]>("/travel/my/bookings"), []);
  const [open, setOpen] = useState<number | null>(null);
  const a = useAction();
  useEffect(() => { const hit = list.data?.find((b) => `Service:${b.serviceBookingId}` === highlight); if (hit) setOpen(hit.serviceBookingId); }, [list.data, highlight]);
  return (
    <Async state={list} empty={(r) => r.length === 0}>{(rows) => (
      <div className="svc-mine" data-testid="my-service-bookings">
        {rows.map((b) => (
          <article key={b.serviceBookingId} className={`svc-card mine${open === b.serviceBookingId ? " open" : ""}`}>
            <div className="svc-img" style={{ backgroundImage: `url(${b.imageUrl ?? ""})` }} aria-hidden="true" />
            <div className="svc-body">
              <div className="svc-top"><span className="slogan">{b.bookingRef} · {b.kind}</span><span className="row"><Pill value={b.status} /><Pill value={b.paymentStatus} /></span></div>
              <h3>{b.serviceName}</h3>
              <p className="small muted">{b.kind === "Hotel" ? `${fmtDate(b.startDate)} to ${fmtDate(b.endDate)}` : `${fmtDate(b.startDate)}${b.departTime ? ` · ${hhmm(b.departTime)}` : ""} · ${b.fromName} → ${b.toName}`} · {b.travelers} traveler(s)</p>
              <p className="small">Total {money(b.totalAmount, b.currency)}{b.discountAmount > 0 ? ` (saved ${money(b.discountAmount, b.currency)})` : ""}</p>
              {open === b.serviceBookingId && b.status === "Confirmed" && <PaymentPanel orderType="Service" orderId={b.serviceBookingId} onPaid={list.reload} />}
              <div className="row" style={{ marginTop: 8 }}>
                {b.status === "Confirmed" && <button className="btn small" onClick={() => setOpen(open === b.serviceBookingId ? null : b.serviceBookingId)} data-testid={`svc-pay-${b.bookingRef}`}>{open === b.serviceBookingId ? "Hide payments" : b.paymentStatus === "Paid" ? "Payments" : "Pay"}</button>}
                {b.status === "Confirmed" && <ConfirmButton className="btn small subtle" confirm="Cancel this booking? It is free until 24 hours before the start; any payment is refunded." testId={`svc-cancel-${b.bookingRef}`}
                  onConfirm={async () => { if (await a.run(() => post(`/travel/my/bookings/${b.serviceBookingId}/cancel`), "Booking cancelled") !== undefined) list.reload(); }}>Cancel</ConfirmButton>}
              </div>
            </div>
          </article>
        ))}
      </div>
    )}</Async>
  );
}

/** Banner after returning from the payment gateway (?payment=paid|failed|pending|invalid&ref=...). */
export function PaymentResultBanner() {
  const p = useSearchParams();
  const outcome = p.get("payment"), ref = p.get("ref"), booked = p.get("booked");
  const msg = useMemo(() => {
    if (booked) return { tone: "ok", text: `Booking ${booked} is confirmed. You can pay now or pay a deposit below.` };
    if (outcome === "paid") return { tone: "ok", text: `Payment received for ${ref}. Thank you!` };
    if (outcome === "failed") return { tone: "error", text: `The payment for ${ref} did not go through. You have not been charged; please try again.` };
    if (outcome === "pending") return { tone: "info", text: `We are waiting for the payment for ${ref} to be confirmed (for example an ATM transfer).` };
    if (outcome === "invalid") return { tone: "error", text: "We could not verify that payment response. Nothing was recorded. Please contact us if you were charged." };
    return null;
  }, [outcome, ref, booked]);
  if (!msg) return null;
  return <div className={`alert ${msg.tone}`} role="status" data-testid="payment-result">{msg.text}</div>;
}

