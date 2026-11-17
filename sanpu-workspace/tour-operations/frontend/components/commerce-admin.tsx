"use client";

import { useState } from "react";
import {
  Async, Card, DataTable, EntityPage, Modal, PageHeader, Pill, SelectInput, TextInput, Tabs, fmtDate, fmtDateTime, get, money, post, useAction, useAsync, useAuth, type FormValues
} from "@sanpu/web";

const d10 = (v?: string | null) => (v ? v.slice(0, 10) : "");
const num = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
const statusTone = (on: boolean, end?: string) => (!on ? "muted" : end && new Date(end) < new Date() ? "warn" : "ok");

/* ---------------- promotions ---------------- */
interface Promo { promotionId: number; title: string; subtitle?: string; placement: string; imageUrl?: string; ctaText?: string; ctaUrl?: string; couponCode?: string; badge?: string;
  startsAtUtc: string; endsAtUtc: string; priority: number; isActive: boolean; impressions: number; clicks: number; clickRate: number; rowVersion?: string }

export function PromotionsAdminPage() {
  const { has } = useAuth();
  return (
    <EntityPage<Promo> tagline="Sales & marketing" title="Promotions & banners" testId="promos" canEdit={has("Marketing.Manage")} newLabel="New promotion"
      lead="Banners shown on the home page, deals page and checkout. Impressions and clicks are counted, so you can see what works."
      load={() => get<Promo[]>("/ops/marketing/promotions")} rowKey={(p) => p.promotionId}
      columns={[
        { key: "img", header: "", render: (p) => p.imageUrl ? <span className="thumb" style={{ backgroundImage: `url(${p.imageUrl})` }} aria-hidden="true" /> : null },
        { key: "title", header: "Promotion", render: (p) => <><b>{p.title}</b><div className="small muted">{p.badge} · {p.ctaUrl}</div></> },
        { key: "placement", header: "Where" }, { key: "couponCode", header: "Coupon", render: (p) => p.couponCode ? <code className="code">{p.couponCode}</code> : "—" },
        { key: "dates", header: "Runs", render: (p) => `${fmtDate(p.startsAtUtc)} → ${fmtDate(p.endsAtUtc)}` },
        { key: "perf", header: "Views / clicks", render: (p) => <>{p.impressions.toLocaleString()} / {p.clicks.toLocaleString()} <span className="small muted">({p.clickRate}%)</span></> },
        { key: "isActive", header: "Status", render: (p) => <Pill value={!p.isActive ? "Off" : new Date(p.endsAtUtc) < new Date() ? "Ended" : "Live"} tone={statusTone(p.isActive, p.endsAtUtc)} /> }]}
      fields={[
        { name: "title", label: "Title" }, { name: "subtitle", label: "Subtitle", type: "textarea" },
        { name: "placement", label: "Placement", type: "select", options: ["HomeStrip", "HomeHero", "Deals", "Checkout"].map((v) => ({ value: v, label: v })) },
        { name: "badge", label: "Badge (short label)" }, { name: "imageUrl", label: "Image path", placeholder: "/images/photos/kinmen.jpg" },
        { name: "ctaText", label: "Button text" }, { name: "ctaUrl", label: "Button link", placeholder: "/hotels" }, { name: "couponCode", label: "Coupon code (optional)" },
        { name: "startsAtUtc", label: "Starts", type: "date" }, { name: "endsAtUtc", label: "Ends", type: "date" }, { name: "priority", label: "Priority (0–100)", type: "number" },
        { name: "isActive", label: "Active", type: "checkbox" }]}
      toForm={(p) => p ? { ...p, startsAtUtc: d10(p.startsAtUtc), endsAtUtc: d10(p.endsAtUtc) }
        : { title: "", subtitle: "", placement: "HomeStrip", badge: "", imageUrl: "/images/photos/taipei.jpg", ctaText: "", ctaUrl: "/deals", couponCode: "", startsAtUtc: d10(new Date().toISOString()), endsAtUtc: "", priority: 10, isActive: true }}
      save={(f, row) => post("/ops/marketing/promotions", { ...f, promotionId: row?.promotionId ?? null, priority: num(f.priority) ?? 0, startsAtUtc: f.startsAtUtc || null, endsAtUtc: f.endsAtUtc || null })} />
  );
}

/* ---------------- coupons ---------------- */
interface Coupon { couponId: number; code: string; description: string; discountType: string; discountValue: number; maxDiscount?: number; minAmount: number; appliesTo: string; startsAtUtc: string; endsAtUtc: string;
  usageLimit?: number; perCustomerLimit: number; timesUsed: number; isPublic: boolean; isActive: boolean; totalDiscount: number; rowVersion?: string }
interface Redemption { redemptionId: number; orderType: string; orderRef: string; discountAmount: number; redeemedAtUtc: string; customerName: string }

export function CouponsAdminPage() {
  const { has } = useAuth();
  const [show, setShow] = useState<Coupon | null>(null);
  const red = useAsync(() => (show ? get<Redemption[]>(`/ops/marketing/coupons/${show.couponId}/redemptions`) : Promise.resolve([])), [show?.couponId]);
  return (
    <>
      <EntityPage<Coupon> tagline="Sales & marketing" title="Coupon codes" testId="coupons" canEdit={has("Marketing.Manage")} newLabel="New coupon"
        lead="Codes are checked inside the booking transaction: dates, minimum spend, booking type, total and per-customer limits. A cancelled or rejected booking gives its use back."
        load={() => get<Coupon[]>("/ops/marketing/coupons")} rowKey={(c) => c.couponId}
        columns={[
          { key: "code", header: "Code", render: (c) => <code className="code">{c.code}</code> },
          { key: "description", header: "Offer", render: (c) => <><b>{c.discountType === "Percent" ? `${c.discountValue}%` : money(c.discountValue)}</b> <span className="small muted">{c.description}</span></> },
          { key: "appliesTo", header: "Applies to" },
          { key: "use", header: "Used", render: (c) => `${c.timesUsed}${c.usageLimit ? ` / ${c.usageLimit}` : ""}` },
          { key: "totalDiscount", header: "Given", render: (c) => money(c.totalDiscount) },
          { key: "endsAtUtc", header: "Until", render: (c) => fmtDate(c.endsAtUtc) },
          { key: "isActive", header: "Status", render: (c) => <><Pill value={!c.isActive ? "Off" : new Date(c.endsAtUtc) < new Date() ? "Expired" : "Active"} tone={statusTone(c.isActive, c.endsAtUtc)} />{!c.isPublic && <span className="small muted"> private</span>}</> }]}
        rowActions={(c) => <button className="btn small subtle" onClick={(e) => { e.stopPropagation(); setShow(c); }}>Redemptions</button>}
        fields={[
          { name: "code", label: "Code", lockedOnEdit: true, hint: "Letters, digits and dashes" }, { name: "description", label: "Description" },
          { name: "discountType", label: "Type", type: "select", options: [{ value: "Percent", label: "Percent off" }, { value: "Fixed", label: "Fixed amount off (TWD)" }] },
          { name: "discountValue", label: "Value", type: "number" }, { name: "maxDiscount", label: "Maximum discount (optional)", type: "number" },
          { name: "minAmount", label: "Minimum order (TWD)", type: "number" },
          { name: "appliesTo", label: "Applies to", type: "select", options: ["All", "Tour", "Hotel", "Flight", "Bus", "Taxi"].map((v) => ({ value: v, label: v })) },
          { name: "startsAtUtc", label: "Starts", type: "date" }, { name: "endsAtUtc", label: "Ends", type: "date" },
          { name: "usageLimit", label: "Total uses (empty = unlimited)", type: "number" }, { name: "perCustomerLimit", label: "Uses per customer", type: "number" },
          { name: "isPublic", label: "Show on the Deals page", type: "checkbox" }, { name: "isActive", label: "Active", type: "checkbox" }]}
        toForm={(c) => c ? { ...c, startsAtUtc: d10(c.startsAtUtc), endsAtUtc: d10(c.endsAtUtc), maxDiscount: c.maxDiscount ?? "", usageLimit: c.usageLimit ?? "" }
          : { code: "", description: "", discountType: "Percent", discountValue: 10, maxDiscount: "", minAmount: 0, appliesTo: "All", startsAtUtc: d10(new Date().toISOString()), endsAtUtc: "", usageLimit: "", perCustomerLimit: 1, isPublic: true, isActive: true }}
        save={(f, row) => post("/ops/marketing/coupons", { ...f, couponId: row?.couponId ?? null, discountValue: num(f.discountValue), maxDiscount: num(f.maxDiscount), minAmount: num(f.minAmount) ?? 0,
          usageLimit: num(f.usageLimit), perCustomerLimit: num(f.perCustomerLimit) ?? 1, startsAtUtc: f.startsAtUtc || null, endsAtUtc: f.endsAtUtc || null })} />
      {show && <Modal title={`Redemptions · ${show.code}`} onClose={() => setShow(null)}>
        <Async state={red} empty={(r) => r.length === 0}>{(rows) => <DataTable rows={rows} rowKey={(r) => r.redemptionId} columns={[
          { key: "orderRef", header: "Order" }, { key: "customerName", header: "Customer" }, { key: "discountAmount", header: "Discount", render: (r) => money(r.discountAmount) },
          { key: "redeemedAtUtc", header: "When", render: (r) => fmtDateTime(r.redeemedAtUtc) }]} />}</Async>
      </Modal>}
    </>
  );
}

/* ---------------- travel services + inventory ---------------- */
interface Svc { serviceId: number; code: string; kind: string; name: string; supplierId?: number; providerName?: string; fromPlaceId: number; fromName: string; toPlaceId?: number; toName?: string;
  departTime?: string; durationMin?: number; capacity: number; maxPerBooking: number; peoplePerUnit: number; basePrice: number; currency: string; rating?: number; features?: string;
  cancellationPolicy?: string; imageUrl?: string; isActive: boolean; rowVersion?: string; openDates: number; upcomingSold: number }
interface Place { placeId: number; code: string; name: string; kind: string; city: string }
interface Inv { inventoryId: number; serviceDate: string; capacity: number; sold: number; held: number; available: number; price: number; status: string }

function InventoryModal({ svc, onClose }: { svc: Svc; onClose: () => void }) {
  const { has } = useAuth();
  const inv = useAsync(() => get<Inv[]>(`/ops/services/${svc.serviceId}/inventory`), [svc.serviceId]);
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState({ from: tomorrow, to: tomorrow, capacity: svc.capacity, price: svc.basePrice, status: "Open" });
  const a = useAction();
  return (
    <Modal title={`Inventory · ${svc.name}`} onClose={onClose}>
      {has("Service.Manage") && <Card title="Open, re-price or close dates">
        <div className="form cols">
          <TextInput label="From" type="date" min={tomorrow} value={f.from} onChange={(v) => setF({ ...f, from: v })} error={a.fieldError("from")} />
          <TextInput label="To" type="date" min={f.from} value={f.to} onChange={(v) => setF({ ...f, to: v })} error={a.fieldError("to")} />
          <TextInput label="Capacity per date" type="number" value={f.capacity} onChange={(v) => setF({ ...f, capacity: Number(v) })} error={a.fieldError("capacity")} />
          <TextInput label="Price (TWD)" type="number" value={f.price} onChange={(v) => setF({ ...f, price: Number(v) })} error={a.fieldError("price")} />
          <SelectInput label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: "Open", label: "Open" }, { value: "Closed", label: "Closed" }]} />
        </div>
        <div className="form-actions" style={{ marginTop: 10 }}><button className="btn primary" disabled={a.busy} data-testid="inv-save"
          onClick={async () => { if (await a.run(() => post(`/ops/services/${svc.serviceId}/inventory`, f), "Inventory updated") !== undefined) inv.reload(); }}>Apply to dates</button></div>
      </Card>}
      <Async state={inv} empty={(r) => r.length === 0}>{(rows) => <DataTable rows={rows} rowKey={(r) => r.inventoryId} testId="inv-table" columns={[
        { key: "serviceDate", header: "Date", render: (r) => fmtDate(r.serviceDate) }, { key: "capacity", header: "Capacity" }, { key: "sold", header: "Sold" },
        { key: "available", header: "Left", render: (r) => r.available <= 2 ? <Pill value={String(r.available)} tone="warn" /> : r.available },
        { key: "price", header: "Price", render: (r) => money(r.price) }, { key: "status", header: "Status", render: (r) => <Pill value={r.status} /> }]} />}</Async>
    </Modal>
  );
}

export function ServicesAdminPage() {
  const { has } = useAuth();
  const places = useAsync(() => get<Place[]>("/ops/services/places"), []);
  const [kind, setKind] = useState("");
  const [inv, setInv] = useState<Svc | null>(null);
  const placeOpts = (places.data ?? []).map((p) => ({ value: p.placeId, label: `${p.name} (${p.kind})` }));
  return (
    <>
      <Tabs tabs={[{ key: "", label: "All" }, { key: "Hotel", label: "Hotels" }, { key: "Flight", label: "Flights" }, { key: "Bus", label: "Buses" }, { key: "Taxi", label: "Taxis" }]} value={kind} onChange={setKind} />
      <EntityPage<Svc> key={kind} tagline="Travel services" title="Hotels, flights, buses & taxis" testId="services" canEdit={has("Service.Manage")} newLabel="New service"
        lead="Each service has daily inventory (rooms, seats or cars) with its own price. Bookings lock the inventory rows they use, so nothing is oversold."
        load={() => get<Svc[]>("/ops/services", { kind })} rowKey={(s) => s.serviceId}
        columns={[
          { key: "img", header: "", render: (s) => s.imageUrl ? <span className="thumb" style={{ backgroundImage: `url(${s.imageUrl})` }} aria-hidden="true" /> : null },
          { key: "name", header: "Service", render: (s) => <><b>{s.name}</b><div className="small muted">{s.code} · {s.providerName}</div></> },
          { key: "kind", header: "Type" }, { key: "route", header: "Where", render: (s) => s.toName ? `${s.fromName} → ${s.toName}` : s.fromName },
          { key: "basePrice", header: "Base price", render: (s) => money(s.basePrice, s.currency) }, { key: "openDates", header: "Open dates" }, { key: "upcomingSold", header: "Sold (upcoming)" },
          { key: "isActive", header: "Status", render: (s) => <Pill value={s.isActive ? "Active" : "Off"} tone={s.isActive ? "ok" : "muted"} /> }]}
        rowActions={(s) => <button className="btn small subtle" onClick={(e) => { e.stopPropagation(); setInv(s); }} data-testid={`inv-${s.code}`}>Inventory</button>}
        fields={[
          { name: "code", label: "Code", lockedOnEdit: true }, { name: "kind", label: "Type", type: "select", lockedOnEdit: true, options: ["Hotel", "Flight", "Bus", "Taxi"].map((v) => ({ value: v, label: v })) },
          { name: "name", label: "Name" }, { name: "fromPlaceId", label: "From / location", type: "select", options: placeOpts }, { name: "toPlaceId", label: "To (not for hotels)", type: "select", options: placeOpts },
          { name: "departTime", label: "Departure time (HH:mm)" }, { name: "durationMin", label: "Duration (minutes)", type: "number" },
          { name: "capacity", label: "Default capacity per date", type: "number" }, { name: "maxPerBooking", label: "Max units per booking", type: "number" }, { name: "peoplePerUnit", label: "People per unit", type: "number" },
          { name: "basePrice", label: "Base price (TWD)", type: "number" }, { name: "rating", label: "Rating (1–5)", type: "number" }, { name: "features", label: "Features (comma separated)", type: "textarea" },
          { name: "cancellationPolicy", label: "Cancellation policy" }, { name: "imageUrl", label: "Image path" }, { name: "isActive", label: "Active", type: "checkbox" }]}
        toForm={(s) => s ? { ...s, departTime: s.departTime?.slice(0, 5) ?? "", toPlaceId: s.toPlaceId ?? "", rating: s.rating ?? "", durationMin: s.durationMin ?? "" }
          : { code: "", kind: kind || "Hotel", name: "", fromPlaceId: "", toPlaceId: "", departTime: "", durationMin: "", capacity: 10, maxPerBooking: 4, peoplePerUnit: 2, basePrice: 3000, rating: "", features: "", cancellationPolicy: "Free cancellation until 24 hours before the start.", imageUrl: "/images/photos/taipei.jpg", isActive: true }}
        save={(f, row) => post("/ops/services", { ...f, serviceId: row?.serviceId ?? null, fromPlaceId: num(f.fromPlaceId), toPlaceId: num(f.toPlaceId), durationMin: num(f.durationMin),
          capacity: num(f.capacity), maxPerBooking: num(f.maxPerBooking), peoplePerUnit: num(f.peoplePerUnit), basePrice: num(f.basePrice), rating: num(f.rating), departTime: f.departTime || null, supplierId: row?.supplierId ?? null })} />
      {inv && <InventoryModal svc={inv} onClose={() => setInv(null)} />}
    </>
  );
}

interface SvcBooking { serviceBookingId: number; bookingRef: string; kind: string; serviceName: string; startDate: string; endDate: string; units: number; travelers: number; totalAmount: number;
  discountAmount: number; couponCode?: string; currency: string; status: string; paymentStatus: string; leadName: string; leadPhoneMasked?: string; pickupAddress?: string; pickupTime?: string; createdAtUtc: string }

export function ServiceBookingsAdminPage() {
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const list = useAsync(() => get<SvcBooking[]>("/ops/services/bookings", { kind, search }), [kind, search]);
  return (
    <>
      <PageHeader tagline="Travel services" title="Service bookings" lead="Hotel, flight, bus and taxi bookings. Phone numbers are masked." />
      <div className="row" style={{ marginBottom: 12, alignItems: "end" }}>
        <SelectInput label="Type" value={kind} onChange={setKind} placeholder="All" options={["Hotel", "Flight", "Bus", "Taxi"].map((v) => ({ value: v, label: v }))} />
        <TextInput label="Reference or name" value={search} onChange={setSearch} placeholder="SB-000001" />
      </div>
      <div className={list.loading && list.data ? "refreshing" : undefined}>
        <Async state={list} empty={(r) => r.length === 0}>{(rows) => <DataTable rows={rows} rowKey={(b) => b.serviceBookingId} testId="svc-bookings" columns={[
          { key: "bookingRef", header: "Ref" }, { key: "serviceName", header: "Service", render: (b) => <>{b.serviceName}<div className="small muted">{b.kind}</div></> },
          { key: "dates", header: "Dates", render: (b) => b.kind === "Hotel" ? `${fmtDate(b.startDate)} → ${fmtDate(b.endDate)}` : `${fmtDate(b.startDate)}${b.pickupTime ? ` ${b.pickupTime.slice(0, 5)}` : ""}` },
          { key: "leadName", header: "Lead", render: (b) => <>{b.leadName}<div className="small muted">{b.leadPhoneMasked}{b.pickupAddress ? ` · ${b.pickupAddress}` : ""}</div></> },
          { key: "totalAmount", header: "Total", render: (b) => <>{money(b.totalAmount, b.currency)}{b.couponCode && <div className="small muted">{b.couponCode} −{money(b.discountAmount)}</div>}</> },
          { key: "status", header: "Status", render: (b) => <><Pill value={b.status} /> <Pill value={b.paymentStatus} /></> }]} />}</Async>
      </div>
    </>
  );
}

/* ---------------- customer care ---------------- */
interface Contact { contactId: number; contactRef: string; name: string; email: string; topic: string; bookingRef?: string; message: string; status: string; createdAtUtc: string; taskId?: number; taskStatus?: string; dueAtUtc?: string }

export function ContactsAdminPage() {
  const [status, setStatus] = useState("Open");
  const list = useAsync(() => get<Contact[]>("/ops/help/contacts", { status }), [status]);
  const [open, setOpen] = useState<Contact | null>(null);
  const a = useAction();
  const setTo = async (s: string) => { if (open && await a.run(() => post(`/ops/help/contacts/${open.contactId}/status`, { status: s }), `Marked ${s}`) !== undefined) { setOpen(null); list.reload(); } };
  return (
    <>
      <PageHeader tagline="Customer care" title="Contact requests" lead="Every message opens a task in the task queue with a reply deadline. Booking and payment topics are high priority." />
      <Tabs tabs={[{ key: "Open", label: "Open" }, { key: "Answered", label: "Answered" }, { key: "Closed", label: "Closed" }, { key: "", label: "All" }]} value={status} onChange={setStatus} />
      <Async state={list} empty={(r) => r.length === 0}>{(rows) => <DataTable rows={rows} rowKey={(c) => c.contactId} onRowClick={setOpen} testId="contacts" columns={[
        { key: "contactRef", header: "Ref" }, { key: "name", header: "From", render: (c) => <>{c.name}<div className="small muted">{c.email}</div></> },
        { key: "topic", header: "Topic", render: (c) => <>{c.topic}{c.bookingRef && <div className="small muted">{c.bookingRef}</div>}</> },
        { key: "message", header: "Message", render: (c) => <span className="small">{c.message.slice(0, 90)}{c.message.length > 90 ? "…" : ""}</span> },
        { key: "dueAtUtc", header: "Reply by", render: (c) => c.status === "Open" && c.dueAtUtc ? <Pill value={fmtDateTime(c.dueAtUtc)} tone={new Date(c.dueAtUtc) < new Date() ? "bad" : "warn"} /> : "—" },
        { key: "status", header: "Status", render: (c) => <Pill value={c.status} /> }]} />}</Async>
      {open && <Modal title={`${open.contactRef} · ${open.topic}`} onClose={() => setOpen(null)} actions={<>
        <a className="btn" href={`mailto:${open.email}?subject=${encodeURIComponent(`Re: ${open.contactRef}`)}`}>Reply by email</a>
        {open.status !== "Answered" && <button className="btn primary" disabled={a.busy} onClick={() => setTo("Answered")} data-testid="contact-answered">Mark answered</button>}
        {open.status !== "Closed" && <button className="btn" disabled={a.busy} onClick={() => setTo("Closed")}>Close</button>}</>}>
        <p className="small muted">{open.name} · {open.email} · {fmtDateTime(open.createdAtUtc)}{open.bookingRef ? ` · ${open.bookingRef}` : ""}</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{open.message}</p>
        {open.taskId && <p className="small muted">Task #{open.taskId} · {open.taskStatus}</p>}
      </Modal>}
    </>
  );
}

interface HelpRow { articleId: number; category: string; question: string; answer: string; sortOrder: number; isPublished: boolean; helpfulYes: number; helpfulNo: number; rowVersion?: string }

export function HelpAdminPage() {
  const { has } = useAuth();
  return (
    <EntityPage<HelpRow> tagline="Customer care" title="Help center" testId="help-admin" canEdit={has("Help.Manage")} newLabel="New article"
      lead="Answers shown on the public help center. Customers rate each answer, so you can see which ones need work."
      load={() => get<HelpRow[]>("/ops/help/articles")} rowKey={(h) => h.articleId}
      columns={[{ key: "category", header: "Category" }, { key: "question", header: "Question", render: (h) => <b>{h.question}</b> },
        { key: "rating", header: "Helpful", render: (h) => `${h.helpfulYes} 👍 / ${h.helpfulNo} 👎` },
        { key: "isPublished", header: "Status", render: (h) => <Pill value={h.isPublished ? "Published" : "Draft"} tone={h.isPublished ? "ok" : "muted"} /> }]}
      fields={[{ name: "category", label: "Category" }, { name: "question", label: "Question" }, { name: "answer", label: "Answer", type: "textarea" },
        { name: "sortOrder", label: "Order", type: "number" }, { name: "isPublished", label: "Published", type: "checkbox" }]}
      toForm={(h) => h ? { ...h } : { category: "Booking", question: "", answer: "", sortOrder: 10, isPublished: true }}
      save={(f, row) => post("/ops/help/articles", { ...f, articleId: row?.articleId ?? null, sortOrder: num(f.sortOrder) ?? 0 })} />
  );
}

export type { FormValues };
