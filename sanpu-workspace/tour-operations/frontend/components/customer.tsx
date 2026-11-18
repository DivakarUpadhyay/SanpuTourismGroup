"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CouponField, MyServiceBookings, PaymentPanel, PaymentResultBanner, clearSavedCoupon } from "./travel";
import {
  ApiError, Async, CleanParams, Card, Checkbox, ConfirmButton, DataTable, Demo, ErrorBox, FormError, PageHeader, Pill, SelectInput, TextArea, TextInput,
  fmtDate, fmtDateTime, get, money, newKey, post, useAction, useAsync, useAuth, useContent, useSetting
, Icon } from "@sanpu/web";

interface TourCard { imageUrl?: string | null; tourId: number; code: string; title: string; slogan?: string; days: number; currency: string; summary?: string; isDemo: boolean; destinationName: string; businessUnitName: string; fromPrice?: number; nextDeparture?: string; openDepartures: number }

export { ErpHome, TourDetailPage } from "./customer-home";

interface Departure { departureId: number; departureDate: string; price: number; seatsLeft: number; tourCode: string; tourTitle: string; days: number; currency: string; status: string; isDemo: boolean }
interface Hold { holdId: string; pax: number; expiresAtUtc: string; unitPrice: number; totalAmount: number }

export function BookPage() {
  const { departureId } = useParams<{ departureId: string }>();
  const router = useRouter();
  const maxPax = Number(useSetting("Booking.MaxPaxPerBooking", "10"));
  const privacy = useContent("privacy.notice");
  const dep = useAsync(() => get<Departure>(`/catalog/departures/${departureId}`), [departureId]);
  const [pax, setPax] = useState(1);
  const [key] = useState(() => newKey("hold"));   // same key on retry: a double click never makes two holds
  const [hold, setHold] = useState<Hold | null>(null);
  const [left, setLeft] = useState(0);
  const [f, setF] = useState({ leadName: "", leadPhone: "", passportNo: "", specialRequests: "", acceptTerms: false });
  const [coupon, setCoupon] = useState({ code: "", discount: 0 });
  const holdAction = useAction();
  const book = useAction();
  useEffect(() => {
    if (!hold) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(hold.expiresAtUtc).getTime() - Date.now()) / 1000)));
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [hold]);
  return (
    <Async state={dep}>{(d) => (
      <>
        <PageHeader tagline="Reserve" title={`${d.tourTitle}, ${fmtDate(d.departureDate)}`} lead={<>{money(d.price, d.currency)} per traveler · {d.seatsLeft} seat(s) left <Demo show={d.isDemo} /></>} />
        {!hold ? (
          <Card title="1. Hold seats">
            <p className="small muted">Seats are held for a few minutes while you fill in details. The final seat can only be held by one person at a time.</p>
            {holdAction.error && !(holdAction.error instanceof ApiError && holdAction.error.errors) ? <ErrorBox error={holdAction.error} /> : null}
            <div className="form cols">
              <TextInput label="Travelers" type="number" min={1} max={Math.min(maxPax, d.seatsLeft)} value={pax} onChange={(v) => setPax(Number(v) || 1)} error={holdAction.fieldError("pax")} data-testid="hold-pax" />
            </div>
            <div className="form-actions" style={{ marginTop: 12 }}>
              <button className="btn primary" disabled={holdAction.busy} data-testid="hold-submit" onClick={async () => {
                const h = await holdAction.run(() => post<Hold>("/bookings/holds", { departureId: Number(departureId), pax, idempotencyKey: key }));
                if (h) setHold(h);
              }}>{holdAction.busy ? "Holding…" : `Hold ${pax} seat(s)`}</button>
            </div>
          </Card>
        ) : (
          <Card title="2. Traveler details">
            <div className={`alert ${left > 60 ? "info" : "warn"}`} data-testid="hold-timer">Holding {hold.pax} seat(s) · total {money(hold.totalAmount, d.currency)} · {left > 0 ? `expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "hold expired, please start again"}</div>
            <FormError error={book.error} />
            {book.error && !(book.error instanceof ApiError && book.error.errors) ? <ErrorBox error={book.error} /> : null}
            <form className="form" noValidate onSubmit={async (e) => {
              e.preventDefault();
              const r = await book.run(() => post<{ bookingId: number; bookingRef: string }>("/bookings", { holdId: hold.holdId, ...f, passportNo: f.passportNo || null, couponCode: coupon.code || null }), "Booking received");
              if (r) { if (coupon.code) clearSavedCoupon(); router.push(`/my/bookings/${r.bookingId}`); }
            }}>
              <div className="form cols">
                <TextInput label="Lead traveler name" value={f.leadName} onChange={(v) => setF({ ...f, leadName: v })} error={book.fieldError("leadName")} data-testid="book-name" autoComplete="name" />
                <TextInput label="Lead traveler phone" type="tel" value={f.leadPhone} onChange={(v) => setF({ ...f, leadPhone: v })} error={book.fieldError("leadPhone")} hint="Stored encrypted; staff see it masked." data-testid="book-phone" autoComplete="tel" />
                <TextInput label="Passport / ID no. (optional)" value={f.passportNo} onChange={(v) => setF({ ...f, passportNo: v })} error={book.fieldError("passportNo")} hint="Encrypted at rest." data-testid="book-passport" />
              </div>
              <TextArea label="Special requests" value={f.specialRequests} onChange={(v) => setF({ ...f, specialRequests: v })} error={book.fieldError("specialRequests")} maxLength={1000} data-testid="book-requests" />
              <CouponField kind="Tour" amount={hold.totalAmount} value={coupon.code} onApplied={(c, d) => setCoupon({ code: c, discount: d })} />
              {coupon.discount > 0 && <p className="ok small">New total {money(hold.totalAmount - coupon.discount, d.currency)}</p>}
              <details className="small"><summary>{privacy?.subject ?? "Privacy notice"}</summary><p>{privacy?.body}</p></details>
              <Checkbox label="I accept the booking terms and the privacy notice" checked={f.acceptTerms} onChange={(v) => setF({ ...f, acceptTerms: v })} testId="book-terms" />
              {book.fieldError("acceptTerms") && <div className="error small">{book.fieldError("acceptTerms")}</div>}
              <div className="form-actions"><button className="btn primary" disabled={book.busy || left === 0} data-testid="book-submit">{book.busy ? "Booking…" : "Confirm booking"}</button></div>
            </form>
          </Card>
        )}
      </>
    )}</Async>
  );
}

interface MyBooking { bookingId: number; bookingRef: string; pax: number; totalAmount: number; currency: string; status: string; paymentStatus: string; departureDate: string; tourTitle: string; isDemo: boolean }

export function MyBookingsPage() {
  const router = useRouter();
  const list = useAsync(() => get<MyBooking[]>("/my/bookings"), []);
  return (
    <>
      <PageHeader tagline="My trips" title="My bookings" lead="Tours wait for our team to confirm them. Hotels, flights, buses and taxis are confirmed instantly." />
      <CleanParams persist={false}>{(p) => <><PaymentResultBanner p={p} /><MyServiceBookingsSection highlight={p.get("pay") ?? undefined} /></>}</CleanParams>
      <h2 className="sec-title">Guided tours</h2>
      <Async state={list} empty={(r) => r.length === 0}>{(rows) => <DataTable rows={rows} rowKey={(b) => b.bookingId} onRowClick={(b) => router.push(`/my/bookings/${b.bookingId}`)} testId="my-bookings" columns={[
        { key: "bookingRef", header: "Ref", render: (b) => <>{b.bookingRef}<Demo show={b.isDemo} /></> }, { key: "tourTitle", header: "Tour" },
        { key: "departureDate", header: "Date", render: (b) => fmtDate(b.departureDate) }, { key: "pax", header: "Pax" },
        { key: "totalAmount", header: "Amount", render: (b) => money(b.totalAmount, b.currency) },
        { key: "status", header: "Status", render: (b) => <Pill value={b.status} /> }, { key: "paymentStatus", header: "Payment", render: (b) => <Pill value={b.paymentStatus} /> }]} />}</Async>

    </>
  );
}

interface MyBookingDetail { booking: MyBooking & { unitPrice: number; amountPaid: number; amountRefunded: number; leadName: string; leadPhoneMasked?: string; passportMasked?: string; specialRequests?: string; cancelReason?: string; createdAtUtc: string }; history: { fromStatus?: string; toStatus: string; comment?: string; occurredAtUtc: string }[]; allowedActions: string[] }

/** Where the booking stands: booked → approved → paid → travel. */
function BookingProgress({ status, payment }: { status: string; payment: string }) {
  if (status === "Cancelled" || status === "Rejected" || status === "CancelRequested") return <div className="alert info" style={{ marginBottom: 16 }}>This booking is <b>{status === "CancelRequested" ? "waiting for cancellation" : status.toLowerCase()}</b>.</div>;
  const steps = [
    { label: "Booked", done: true },
    { label: "Approved by our team", done: status === "Confirmed" || status === "Completed" },
    { label: payment === "PartiallyPaid" ? "Deposit paid" : "Paid", done: payment === "Paid" || payment === "PartiallyPaid", partial: payment === "PartiallyPaid" },
    { label: "Travel", done: status === "Completed" },
  ];
  return <ol className="bk-steps" aria-label="Booking progress">{steps.map((st, i) => <li key={i} className={st.done ? (st.partial ? "part" : "done") : ""}><span>{st.done ? "✓" : i + 1}</span>{st.label}</li>)}</ol>;
}

export function MyBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const d = useAsync(() => get<MyBookingDetail>(`/my/bookings/${id}`), [id]);
  const [reason, setReason] = useState("Schedule change");
  const [other, setOther] = useState("");
  const a = useAction();
  return (
    <Async state={d}>{(x) => (
      <>
        <PageHeader tagline="Booking" title={`${x.booking.bookingRef} · ${x.booking.tourTitle}`} lead={<>Departure {fmtDate(x.booking.departureDate)} · {x.booking.pax} traveler(s) <Demo show={x.booking.isDemo} /></>} actions={<Link className="btn" href="/my/bookings">Back</Link>} />
        <BookingProgress status={x.booking.status} payment={x.booking.paymentStatus} />
        <div className="bk-layout">
          <div className="bk-main">
            {(x.booking.status === "Pending" || x.booking.status === "Confirmed") && x.booking.paymentStatus !== "Paid" && (
              <section className="bk-pay" data-testid="payment-summary">
                <h2><Icon name="ticket" size={18} /> Payment</h2>
                <PaymentPanel orderType="Tour" orderId={Number(id)} onPaid={d.reload} />
              </section>
            )}
            <section className="bk-box">
              <h2>Trip details</h2>
              <dl className="bk-dl">
                <div><dt>Tour</dt><dd>{x.booking.tourTitle}</dd></div>
                <div><dt>Departure</dt><dd>{fmtDate(x.booking.departureDate)}</dd></div>
                <div><dt>Travelers</dt><dd>{x.booking.pax} × {money(x.booking.unitPrice, x.booking.currency)}</dd></div>
                <div><dt>Total</dt><dd><b>{money(x.booking.totalAmount, x.booking.currency)}</b></dd></div>
                <div><dt>Paid</dt><dd>{money(x.booking.amountPaid, x.booking.currency)}{x.booking.amountRefunded > 0 ? ` · refunded ${money(x.booking.amountRefunded, x.booking.currency)}` : ""}</dd></div>
                <div><dt>Lead traveler</dt><dd>{x.booking.leadName} · {x.booking.leadPhoneMasked ?? "—"}</dd></div>
                {x.booking.passportMasked && <div><dt>ID</dt><dd>{x.booking.passportMasked}</dd></div>}
                {x.booking.specialRequests && <div><dt>Requests</dt><dd>{x.booking.specialRequests}</dd></div>}
                {x.booking.cancelReason && <div><dt>Cancellation reason</dt><dd>{x.booking.cancelReason}</dd></div>}
              </dl>
            </section>
          </div>
          <aside className="bk-box">
            <h2>History</h2>
            <ul className="timeline" data-testid="booking-history">{x.history.map((h, i) => <li key={i}><b>{h.toStatus}</b> <span className="small muted">{fmtDateTime(h.occurredAtUtc)}</span>{h.comment && <div className="small">{h.comment}</div>}</li>)}</ul>
          </aside>
        </div>
        {x.allowedActions.includes("cancel") && (
          <Card title={x.booking.status === "Pending" ? "Withdraw this booking" : "Request cancellation"}>
            {a.error ? <ErrorBox error={a.error} /> : null}
            <div className="form cols">
              <SelectInput label="Reason" value={reason} onChange={setReason} options={["Schedule change", "Health", "Found another tour", "Other"].map((r) => ({ value: r, label: r }))} testId="cancel-reason" />
              {reason === "Other" && <TextInput label="Tell us more" value={other} onChange={setOther} error={a.fieldError("reason")} />}
            </div>
            <div className="form-actions" style={{ marginTop: 10 }}>
              <ConfirmButton className="btn danger" testId="cancel-submit" confirm={x.booking.status === "Pending" ? "Withdraw this booking? The seats are released." : "Send a cancellation request? Our team will confirm and handle any refund."}
                onConfirm={async () => { if (await a.run(() => post(`/my/bookings/${id}/cancel`, { reason: reason === "Other" ? other : reason }), "Request sent") !== undefined) d.reload(); }}>
                {x.booking.status === "Pending" ? "Withdraw booking" : "Request cancellation"}</ConfirmButton>
            </div>
          </Card>
        )}
      </>
    )}</Async>
  );
}

function MyServiceBookingsSection({ highlight }: { highlight?: string }) { return <><h2 className="sec-title">Hotels, flights, buses &amp; taxis</h2><MyServiceBookings highlight={highlight} /></>; }
