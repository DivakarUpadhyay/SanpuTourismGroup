"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Async, Card, Checkbox, ConfirmButton, DataTable, Demo, EntityPage, ErrorBox, FormError, Kpi, Modal, PageHeader, Pager, Pill, SelectInput, TextArea, TextInput,
  fmtDate, fmtDateTime, get, money, newKey, post, put, useAction, useAsync, useAuth, type Column
} from "@sanpu/web";

interface Lookups { destinations: L[]; businessUnits: L[]; vehicles: (L & { seats: number; costPerDay: number })[]; roles: L[]; staff: { userId: string; displayName: string; emailMasked?: string }[]; suppliers: L[] }
interface L { id: number; code: string; name: string }
const useLookups = () => useAsync(() => get<Lookups>("/ops/lookups"), []);
const pct = (v: number) => `${Number(v).toFixed(1)}%`;

// ---------------- dashboard ----------------
export function OpsDashboard() {
  const { has } = useAuth();
  const d = useAsync(() => (has("Ops.Dashboard.View") ? get<any>("/ops/dashboard") : Promise.resolve(null)), []);
  if (!has("Ops.Dashboard.View")) return <><PageHeader tagline="Overview" title="Dashboard" /><p className="muted">Your roles have no operations dashboard. Use the menu to open your pages, or the System overview.</p></>;
  return (
    <>
      <PageHeader tagline="Operations" title="Operations dashboard" lead="Real SQL aggregates across bookings, approvals, inventory, tasks, reconciliation and integrations." />
      <Async state={d}>{(x) => (
        <>
          <div className="kpis">
            <Kpi label="Bookings today" value={x.kpis.bookingsToday} testId="kpi-bookings-today" />
            <Kpi label="Pending approvals" value={x.kpis.pendingApprovals} testId="kpi-pending" />
            <Kpi label="Seats on hold" value={x.kpis.seatsOnHold} />
            <Kpi label="Load factor (60 days)" value={pct(x.kpis.loadFactorPct)} />
            <Kpi label="Open tasks / overdue" value={`${x.kpis.openTasks} / ${x.kpis.overdueTasks}`} />
            <Kpi label="Unreconciled" value={money(x.kpis.unreconciledAmount)} />
            <Kpi label="Failed integrations" value={x.kpis.failedIntegrations} />
            <Kpi label="Confirmed revenue" value={money(x.kpis.confirmedRevenue)} />
          </div>
          <div className="grid two">
            <Card title="Upcoming departures">
              <DataTable rows={x.upcoming} rowKey={(r: any) => r.departureId} columns={[
                { key: "departureDate", header: "Date", render: (r: any) => fmtDate(r.departureDate) }, { key: "tourTitle", header: "Tour" },
                { key: "load", header: "Sold / held / cap", render: (r: any) => `${r.seatsSold} / ${r.seatsHeld} / ${r.capacity}` },
                { key: "fill", header: "", render: (r: any) => r.seatsSold + r.seatsHeld >= r.capacity * 0.9 ? <Pill value="Near full" tone="warn" /> : <Pill value="Open" /> }]} />
            </Card>
            <Card title="Revenue by business unit (confirmed)">
              <DataTable rows={x.byBusinessUnit} rowKey={(r: any) => r.code} columns={[{ key: "name", header: "Unit" }, { key: "bookings", header: "Bookings" }, { key: "revenue", header: "Revenue", render: (r: any) => money(r.revenue) }]} />
            </Card>
          </div>
        </>
      )}</Async>
    </>
  );
}

// ---------------- bookings ----------------
interface BookingRow { bookingId: number; bookingRef: string; leadName: string; pax: number; totalAmount: number; currency: string; status: string; paymentStatus: string; departureDate: string; tourTitle: string; isDemo: boolean }

export function BookingsPage() {
  const router = useRouter();
  const [f, setF] = useState({ search: "", status: "", from: "", sort: "newest", page: 1 });
  const list = useAsync(() => get<{ items: BookingRow[]; total: number; page: number; pageSize: number }>("/ops/bookings", { ...f, pageSize: 20 }), [f]);
  return (
    <>
      <PageHeader tagline="Reservations" title="Bookings" lead="Phone and passport numbers are masked; revealing them needs Pii.Reveal and is audited." />
      <div className="toolbar">
        <TextInput label="Search" value={f.search} onChange={(v) => setF({ ...f, search: v, page: 1 })} placeholder="ref, name or tour" data-testid="bookings-search" />
        <SelectInput label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v, page: 1 })} placeholder="Any" options={["Pending", "Confirmed", "Rejected", "CancelRequested", "Cancelled"].map((s) => ({ value: s, label: s }))} testId="bookings-status" />
        <TextInput label="Departure from" type="date" value={f.from} onChange={(v) => setF({ ...f, from: v, page: 1 })} />
        <SelectInput label="Sort" value={f.sort} onChange={(v) => setF({ ...f, sort: v })} options={[{ value: "newest", label: "Newest" }, { value: "departure", label: "Departure date" }, { value: "amount", label: "Amount" }]} testId="bookings-sort" />
      </div>
      <Async state={list}>{(d) => (
        <>
          <DataTable rows={d.items} rowKey={(b) => b.bookingId} onRowClick={(b) => router.push(`/admin/bookings/${b.bookingId}`)} testId="bookings-table" columns={[
            { key: "bookingRef", header: "Ref", render: (b) => <>{b.bookingRef}<Demo show={b.isDemo} /></> }, { key: "leadName", header: "Lead traveler" },
            { key: "tourTitle", header: "Tour" }, { key: "departureDate", header: "Departure", render: (b) => fmtDate(b.departureDate) }, { key: "pax", header: "Pax" },
            { key: "totalAmount", header: "Amount", render: (b) => money(b.totalAmount, b.currency) },
            { key: "status", header: "Status", render: (b) => <Pill value={b.status} /> }, { key: "paymentStatus", header: "Payment", render: (b) => <Pill value={b.paymentStatus} /> }]} />
          <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => setF({ ...f, page: p })} />
        </>
      )}</Async>
    </>
  );
}

export function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { has } = useAuth();
  const d = useAsync(() => get<any>(`/ops/bookings/${id}`), [id]);
  const [comment, setComment] = useState("");
  const [pii, setPii] = useState<{ phone?: string; passport?: string } | null>(null);
  const [pay, setPay] = useState<{ amount: number; method: string; key: string } | null>(null);
  const [refund, setRefund] = useState<{ amount: number; reason: string } | null>(null);
  const [cancel, setCancel] = useState<string | null>(null);
  const a = useAction();
  const done = async (fn: () => Promise<unknown>, msg: string) => { if (await a.run(fn, msg) !== undefined) { d.reload(); return true; } return false; };
  return (
    <Async state={d}>{(x) => {
      const b = x.booking, can = (s: string) => x.allowedActions.includes(s);
      return (
        <>
          <PageHeader tagline="Reservation" title={`${b.bookingRef} · ${b.tourTitle}`} lead={<>Departure {fmtDate(b.departureDate)} · {b.pax} pax · customer {b.customerEmailMasked} <Demo show={b.isDemo} /></>} actions={<Link className="btn" href="/admin/bookings">Back</Link>} />
          {a.error ? <ErrorBox error={a.error} /> : null}
          <div className="grid two">
            <Card title="Booking">
              <p className="row"><Pill value={b.status} /><Pill value={b.paymentStatus} /></p>
              <p>{money(b.totalAmount, b.currency)} ({money(b.unitPrice, b.currency)} × {b.pax}) · paid {money(b.amountPaid, b.currency)} · refunded {money(b.amountRefunded, b.currency)}</p>
              <p className="small">Lead: {b.leadName} · phone <span data-testid="phone-value">{pii?.phone ?? b.leadPhoneMasked ?? "—"}</span> · ID {pii?.passport ?? b.passportMasked ?? "—"}
                {has("Pii.Reveal") && !pii && <> · <button className="btn link small" data-testid="reveal-pii" onClick={async () => { const r = await a.run(() => post<any>(`/ops/bookings/${id}/reveal-pii`)); if (r) setPii(r); }}>Reveal (audited)</button></>}</p>
              {b.specialRequests && <p className="small">Requests: {b.specialRequests}</p>}
              {b.cancelReason && <p className="small">Cancel reason: {b.cancelReason}</p>}
              <div className="form-actions">
                {can("approve") && has("Booking.Approve") && <ConfirmButton className="btn primary" confirm="Approve this booking? Held seats become sold." testId="approve" onConfirm={() => done(() => post(`/ops/bookings/${id}/decision`, { decision: "Approved", comment }), "Booking approved")}>Approve</ConfirmButton>}
                {can("reject") && has("Booking.Approve") && <ConfirmButton className="btn danger" confirm="Reject this booking? The seats are released." testId="reject" onConfirm={() => done(() => post(`/ops/bookings/${id}/decision`, { decision: "Rejected", comment }), "Booking rejected")}>Reject</ConfirmButton>}
                {can("payment") && has("Finance.Payment") && <button className="btn" data-testid="pay-open" onClick={() => setPay({ amount: b.totalAmount - b.amountPaid, method: "BankTransfer", key: newKey("pay") })}>Record payment (SIMULATED)</button>}
                {can("refund") && has("Finance.Refund") && b.amountPaid > b.amountRefunded && <button className="btn" data-testid="refund-open" onClick={() => setRefund({ amount: b.amountPaid - b.amountRefunded, reason: "Customer request" })}>Issue refund</button>}
                {can("cancel") && has("Booking.Cancel") && <button className="btn danger" data-testid="cancel-open" onClick={() => setCancel("")}>Cancel booking</button>}
              </div>
              {(can("approve") || can("reject")) && has("Booking.Approve") && <TextArea label="Decision comment (required to reject)" value={comment} onChange={setComment} data-testid="decision-comment" />}
            </Card>
            <Card title="Approval history (immutable)">
              {x.approvals.requests.map((r: any) => <p key={r.approvalRequestId} className="small">{r.workflowName} v{r.version}: <Pill value={r.status} /> step {r.currentStepNo}{r.status === "Pending" && <> · due {fmtDateTime(r.stepDueAtUtc)}</>}</p>)}
              <ul className="timeline" data-testid="approval-history">{x.approvals.actions.map((ac: any, i: number) => <li key={i}><b>{ac.decision}</b> step {ac.stepNo} by {ac.actorMasked} <span className="small muted">{fmtDateTime(ac.actedAtUtc)}</span>{ac.comment && <div className="small">{ac.comment}</div>}</li>)}</ul>
              <h3 style={{ fontSize: 14, margin: "10px 0 4px" }}>Status history</h3>
              <ul className="timeline">{x.history.map((h: any, i: number) => <li key={i}>{h.fromStatus ?? "new"} → <b>{h.toStatus}</b> <span className="small muted">{fmtDateTime(h.occurredAtUtc)} {h.actorMasked}</span></li>)}</ul>
            </Card>
          </div>
          <Card title="Payments & refunds">
            <DataTable rows={[...x.payments.map((p: any) => ({ ...p, kind: "Payment", key: `p${p.paymentId}` })), ...x.refunds.map((r: any) => ({ ...r, kind: "Refund", key: `r${r.refundId}` }))]} rowKey={(r: any) => r.key} columns={[
              { key: "kind", header: "Type" }, { key: "amount", header: "Amount", render: (r: any) => money(r.amount) },
              { key: "detail", header: "Detail", render: (r: any) => r.kind === "Payment" ? `${r.provider} ${r.method} ${r.providerRef}` : `${r.refundRef} · ${r.reason}` },
              { key: "status", header: "Status", render: (r: any) => r.status ? <Pill value={r.status} /> : <Pill value="Recorded" tone="ok" /> },
              { key: "createdAtUtc", header: "When", render: (r: any) => fmtDateTime(r.createdAtUtc) }]} />
          </Card>
          {pay && <Modal title="Record payment (SIMULATED provider)" onClose={() => setPay(null)} actions={<button className="btn primary" disabled={a.busy} data-testid="pay-submit" onClick={async () => { if (await done(() => post(`/ops/bookings/${id}/payments`, { amount: pay.amount, method: pay.method, idempotencyKey: pay.key }), "Payment recorded")) setPay(null); }}>Record</button>}>
            <p className="small muted">No real money moves. A real payment provider is PENDING approval. Card numbers are never stored.</p>
            <div className="form cols"><TextInput label="Amount" type="number" value={pay.amount} onChange={(v) => setPay({ ...pay, amount: Number(v) })} error={a.fieldError("amount")} data-testid="pay-amount" />
              <SelectInput label="Method" value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={["BankTransfer", "Cash", "CardSimulated"].map((m) => ({ value: m, label: m }))} /></div>
          </Modal>}
          {refund && <Modal title="Issue refund" onClose={() => setRefund(null)} actions={<button className="btn primary" disabled={a.busy} data-testid="refund-submit" onClick={async () => { if (await done(() => post(`/ops/bookings/${id}/refunds`, refund), "Refund requested; the refund workflow decides")) setRefund(null); }}>Request refund</button>}>
            <p className="small muted">Refunds go through the refund workflow (large amounts need a second approver).</p>
            <div className="form cols"><TextInput label="Amount" type="number" value={refund.amount} onChange={(v) => setRefund({ ...refund, amount: Number(v) })} error={a.fieldError("amount")} data-testid="refund-amount" />
              <SelectInput label="Reason" value={refund.reason} onChange={(v) => setRefund({ ...refund, reason: v })} options={["Customer request", "Supplier cancelled", "Weather", "Service issue"].map((m) => ({ value: m, label: m }))} /></div>
          </Modal>}
          {cancel !== null && <Modal title="Cancel booking" onClose={() => setCancel(null)} actions={<button className="btn danger" disabled={a.busy} data-testid="cancel-submit" onClick={async () => { if (await done(() => post(`/ops/bookings/${id}/cancel`, { reason: cancel }), "Booking cancelled")) setCancel(null); }}>Cancel booking</button>}>
            <TextInput label="Reason" value={cancel} onChange={setCancel} error={a.fieldError("reason")} data-testid="cancel-reason" />
          </Modal>}
        </>
      );
    }}</Async>
  );
}

// ---------------- approvals ----------------
export function ApprovalsPage() {
  const inbox = useAsync(() => get<any[]>("/ops/approvals/inbox"), []);
  const lk = useLookups();
  const [act, setAct] = useState<{ row: any; decision: string; comment: string; delegateTo: string } | null>(null);
  const a = useAction();
  return (
    <>
      <PageHeader tagline="Workflow" title="Approval inbox" lead="Items waiting for a role you hold. Routing, SLAs and escalation come from the workflow definitions table. You cannot approve your own request." />
      <Async state={inbox} empty={(r) => r.length === 0}>{(rows) => <DataTable rows={rows} rowKey={(r: any) => r.approvalRequestId} testId="inbox-table" columns={[
        { key: "entityRef", header: "Item", render: (r: any) => r.entityType === "Booking" ? <Link href={`/admin/bookings/${r.entityId}`}>{r.entityRef}</Link> : r.entityRef },
        { key: "workflowName", header: "Workflow" }, { key: "step", header: "Step", render: (r: any) => `${r.currentStepNo}/${r.stepCount} ${r.stepName}` },
        { key: "amount", header: "Amount", render: (r: any) => money(r.amount) }, { key: "requestedByMasked", header: "Requested by" },
        { key: "due", header: "Due (SLA)", render: (r: any) => <Pill value={r.isOverdue ? "Overdue" : fmtDateTime(r.stepDueAtUtc)} tone={r.isOverdue ? "bad" : "info"} /> },
        { key: "act", header: "", render: (r: any) => r.isOwnRequest ? <span className="small muted">your request</span> : <div className="row">
          <button className="btn small primary" data-testid={`approve-${r.entityRef}`} onClick={() => setAct({ row: r, decision: "Approved", comment: "", delegateTo: "" })}>Approve</button>
          <button className="btn small danger" data-testid={`reject-${r.entityRef}`} onClick={() => setAct({ row: r, decision: "Rejected", comment: "", delegateTo: "" })}>Reject</button>
          <button className="btn small" onClick={() => setAct({ row: r, decision: "Delegated", comment: "", delegateTo: "" })}>Delegate</button></div> }]} />}</Async>
      {act && <Modal title={`${act.decision === "Delegated" ? "Delegate" : act.decision === "Approved" ? "Approve" : "Reject"} ${act.row.entityRef}`} onClose={() => setAct(null)} actions={
        <button className="btn primary" disabled={a.busy} data-testid="act-submit" onClick={async () => {
          if (await a.run(() => post(`/ops/approvals/${act.row.approvalRequestId}/act`, { decision: act.decision, comment: act.comment || null, delegateToUserId: act.delegateTo || null, rowVersion: act.row.rowVersion }), "Done") !== undefined) { setAct(null); inbox.reload(); }
        }}>Confirm</button>}>
        <FormError error={a.error} />{a.error && !(a.error as any).errors ? <ErrorBox error={a.error} /> : null}
        <div className="form">
          {act.decision === "Delegated" && <SelectInput label="Delegate to" value={act.delegateTo} onChange={(v) => setAct({ ...act, delegateTo: v })} placeholder="Choose" options={(lk.data?.staff ?? []).map((s) => ({ value: s.userId, label: `${s.displayName} (${s.emailMasked})` }))} error={a.fieldError("delegateToUserId")} />}
          <TextArea label={act.decision === "Rejected" ? "Reason (required)" : "Comment"} value={act.comment} onChange={(v) => setAct({ ...act, comment: v })} error={a.fieldError("comment")} data-testid="act-comment" />
        </div>
      </Modal>}
    </>
  );
}

// ---------------- master data (generic entity pages) ----------------
export function ToursPage() {
  const { has } = useAuth(); const lk = useLookups();
  return <EntityPage<any> tagline="Catalog" title="Tours" testId="tours" canEdit={has("Catalog.Edit")} newLabel="New tour" load={() => get("/ops/tours")} rowKey={(t) => t.tourId}
    columns={[{ key: "img", header: "", render: (t) => (t.imageUrl ?? t.destinationImageUrl) ? <span className="thumb" style={{ backgroundImage: `url(${t.imageUrl ?? t.destinationImageUrl})` }} aria-hidden="true" /> : null },
      { key: "code", header: "Code", render: (t) => <>{t.code}<Demo show={t.isDemo} /></> }, { key: "title", header: "Title" }, { key: "destinationName", header: "Destination" }, { key: "businessUnitCode", header: "Unit" },
      { key: "days", header: "Days" }, { key: "basePrice", header: "Base price", render: (t) => money(t.basePrice) }, { key: "isPublished", header: "Published", render: (t) => t.isPublished ? <Pill value="Published" tone="ok" /> : <Pill value="Draft" /> }, { key: "upcomingDepartures", header: "Upcoming" }]}
    fields={[{ name: "code", label: "Tour code", lockedOnEdit: true, hint: "e.g. TW-ERV-3D" }, { name: "title", label: "Title" }, { name: "slogan", label: "Slogan (tagline)" },
      { name: "destinationId", label: "Destination", type: "select", options: (lk.data?.destinations ?? []).map((d) => ({ value: d.id, label: d.name })), placeholder: "Choose" },
      { name: "businessUnitId", label: "Business unit", type: "select", options: (lk.data?.businessUnits ?? []).map((d) => ({ value: d.id, label: d.name })), placeholder: "Choose" },
      { name: "days", label: "Days", type: "number" }, { name: "basePrice", label: "Base price (TWD)", type: "number" },
      { name: "imageUrl", label: "Tour photo", type: "image", hint: "Leave empty to use the destination photo." },
      { name: "summary", label: "Summary", type: "textarea" }, { name: "isPublished", label: "Published", type: "checkbox" }]}
    toForm={(t) => t ? { ...t, imageUrl: t.imageUrl ?? "" } : { code: "", title: "", slogan: "", destinationId: "", businessUnitId: "", days: 2, basePrice: 5000, imageUrl: "", summary: "", isPublished: false }}
    save={(f, t) => { const body = { ...f, destinationId: Number(f.destinationId), businessUnitId: Number(f.businessUnitId) }; return t ? put(`/ops/tours/${t.tourId}`, body) : post("/ops/tours", body); }} />;
}

export function DeparturesPage() {
  const { has } = useAuth(); const lk = useAsync(() => get<any[]>("/ops/tours"), []);
  return <EntityPage<any> tagline="Inventory" title="Departures & capacity" testId="departures" canEdit={has("Departure.Edit")} newLabel="New departure" load={() => get("/ops/departures")} rowKey={(d) => d.departureId}
    lead="Capacity can never drop below seats already sold plus seats on hold (checked in the stored procedure)."
    columns={[{ key: "departureDate", header: "Date", render: (d) => <>{fmtDate(d.departureDate)}<Demo show={d.isDemo} /></> }, { key: "tourCode", header: "Tour" }, { key: "capacity", header: "Capacity" }, { key: "seatsSold", header: "Sold" },
      { key: "seatsHeld", header: "Held" }, { key: "seatsLeft", header: "Left", render: (d) => d.seatsLeft === 0 ? <Pill value="Full" tone="bad" /> : d.seatsLeft }, { key: "price", header: "Price", render: (d) => money(d.price) }, { key: "status", header: "Status", render: (d) => <Pill value={d.status} /> }]}
    fields={[{ name: "tourId", label: "Tour", type: "select", options: (lk.data ?? []).map((t) => ({ value: t.tourId, label: `${t.code} ${t.title}` })), placeholder: "Choose" },
      { name: "departureDate", label: "Date", type: "date" }, { name: "capacity", label: "Capacity", type: "number" }, { name: "price", label: "Price (TWD)", type: "number" },
      { name: "status", label: "Status", type: "select", options: ["Open", "Closed", "Cancelled"].map((s) => ({ value: s, label: s })) }]}
    toForm={(d) => d ? { ...d, departureDate: fmtDate(d.departureDate) } : { tourId: "", departureDate: "", capacity: 30, price: 5000, status: "Open" }}
    save={(f, d) => { const body = { ...f, tourId: Number(f.tourId) || 0, departureDate: f.departureDate || null }; return d ? put(`/ops/departures/${d.departureId}`, body) : post("/ops/departures", body); }} />;
}

export function SuppliersPage() {
  const { has } = useAuth(); const lk = useLookups();
  return <EntityPage<any> tagline="Partners" title="Suppliers & connections" testId="suppliers" canEdit={has("Supplier.Edit")} newLabel="New supplier" load={() => get("/ops/suppliers")} rowKey={(s) => s.supplierId}
    lead="Supplier partners and how we connect to them. A Live adapter stays PENDING until partner credentials are approved. The webhook secret field holds only the NAME of an environment variable."
    columns={[{ key: "code", header: "Code", render: (s) => <>{s.code}<Demo show={s.isDemo} /></> }, { key: "name", header: "Supplier" }, { key: "supplierType", header: "Type" },
      { key: "contactEmailMasked", header: "Contact" }, { key: "connectionStatus", header: "Connection", render: (s) => <Pill value={s.connectionStatus} /> },
      { key: "lastSyncAtUtc", header: "Last sync", render: (s) => fmtDateTime(s.lastSyncAtUtc) }, { key: "failedEvents", header: "Failed events", render: (s) => s.failedEvents ? <Pill value={String(s.failedEvents)} tone="bad" /> : 0 }]}
    fields={[{ name: "code", label: "Code", lockedOnEdit: true }, { name: "name", label: "Name" },
      { name: "supplierType", label: "Type", type: "select", options: ["Hotel", "Coach", "Restaurant", "Guide", "OTA"].map((s) => ({ value: s, label: s })) },
      { name: "businessUnitId", label: "Business unit", type: "select", placeholder: "None", options: (lk.data?.businessUnits ?? []).map((d) => ({ value: d.id, label: d.name })) },
      { name: "contactEmail", label: "Contact email" }, { name: "adapterType", label: "Adapter", type: "select", options: ["LocalMock", "Webhook", "Live"].map((s) => ({ value: s, label: s })) },
      { name: "webhookSecretRef", label: "Webhook secret env var name", hint: "e.g. SUPPLIER_HTL01_HMAC (never the secret)" }, { name: "rateLimitPerMin", label: "Rate limit / min", type: "number" }, { name: "isActive", label: "Active", type: "checkbox" }]}
    toForm={(s) => s ? { ...s, businessUnitId: s.businessUnitId ?? "" } : { code: "", name: "", supplierType: "Hotel", businessUnitId: "", contactEmail: "", adapterType: "LocalMock", webhookSecretRef: "", rateLimitPerMin: 60, isActive: true }}
    save={(f, s) => { const body = { ...f, businessUnitId: f.businessUnitId ? Number(f.businessUnitId) : null, rowVersion: s?.rowVersion }; return s ? put(`/ops/suppliers/${s.supplierId}`, body) : post("/ops/suppliers", body); }} />;
}

export function BusinessUnitsPage() {
  const { has } = useAuth();
  return <EntityPage<any> tagline="Group" title="Business units" testId="units" canEdit={has("Catalog.Edit")} newLabel="New unit" load={() => get("/ops/business-units")} rowKey={(u) => u.businessUnitId}
    lead="The group's business lines (travel, hotels, transport, dining…), used to report bookings and costs by unit."
    columns={[{ key: "code", header: "Code", render: (u) => <>{u.code}<Demo show={u.isDemo} /></> }, { key: "name", header: "Name" }, { key: "kind", header: "Kind" }, { key: "tourCount", header: "Tours" }, { key: "isActive", header: "Active", render: (u) => u.isActive ? "✓" : <Pill value="Inactive" /> }]}
    fields={[{ name: "code", label: "Code", hint: "Capital letters, e.g. TRAVEL" }, { name: "name", label: "Name" }, { name: "kind", label: "Kind", type: "select", options: ["Tours", "Lodging", "Coaches", "Meals", "Retail", "Other"].map((s) => ({ value: s, label: s })) }, { name: "isActive", label: "Active", type: "checkbox" }]}
    toForm={(u) => u ? { ...u } : { code: "", name: "", kind: "Tours", isActive: true }}
    save={(f, u) => (u ? put(`/ops/business-units/${u.businessUnitId}`, f) : post("/ops/business-units", f))} />;
}

export function CostAssumptionsPage() {
  return <EntityPage<any> tagline="Finance" title="Cost assumptions" testId="costs" canEdit newLabel="" load={() => get("/ops/cost-assumptions")} rowKey={(c) => c.assumptionKey}
    lead="Inputs to the group simulation. Changing one affects only new simulation runs; saved plans keep the values they used."
    columns={[{ key: "assumptionKey", header: "Key", render: (c) => <span className="mono">{c.assumptionKey}</span> }, { key: "value", header: "Value" }, { key: "unit", header: "Unit" }, { key: "description", header: "Description" }, { key: "updatedAtUtc", header: "Updated", render: (c) => fmtDateTime(c.updatedAtUtc) }]}
    fields={[{ name: "value", label: "Value", type: "number" }]} toForm={(c) => ({ value: c?.value ?? 0 })} save={(f, c) => put(`/ops/cost-assumptions/${c!.assumptionKey}`, { value: Number(f.value) })} />;
}

// ---------------- tasks ----------------
export function TasksPage() {
  const { has, me } = useAuth();
  const [f, setF] = useState({ mine: false, status: "", overdue: false });
  const tasks = useAsync(() => get<any[]>("/ops/tasks", f), [f]);
  const lk = useLookups();
  const a = useAction();
  const update = async (id: number, body: object, msg: string) => { if (await a.run(() => post(`/ops/tasks/${id}`, body), msg) !== undefined) tasks.reload(); };
  return (
    <>
      <PageHeader tagline="Employees" title="Task queue & SLAs" lead="Exceptions and follow-ups created by the system (cancellation requests, supplier problems, reconciliation mismatches) or by staff." />
      <div className="toolbar">
        <Checkbox label="Only my tasks" checked={f.mine} onChange={(v) => setF({ ...f, mine: v })} testId="tasks-mine" />
        <Checkbox label="Only overdue" checked={f.overdue} onChange={(v) => setF({ ...f, overdue: v })} />
        <SelectInput label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="Any" options={["Open", "InProgress", "Done"].map((s) => ({ value: s, label: s }))} />
      </div>
      {a.error ? <ErrorBox error={a.error} /> : null}
      <Async state={tasks} empty={(r) => r.length === 0}>{(rows) => <DataTable rows={rows} rowKey={(t: any) => t.taskId} testId="tasks-table" columns={[
        { key: "title", header: "Task", render: (t: any) => <>{t.title}<Demo show={t.isDemo} /></> }, { key: "taskType", header: "Type" }, { key: "priority", header: "Priority", render: (t: any) => <Pill value={t.priority} tone={t.priority === "High" ? "warn" : undefined} /> },
        { key: "assignedTo", header: "Owner", render: (t: any) => t.assignedTo ?? <span className="muted">unassigned</span> },
        { key: "dueAtUtc", header: "Due", render: (t: any) => <Pill value={t.isOverdue ? "Overdue" : fmtDateTime(t.dueAtUtc)} tone={t.isOverdue ? "bad" : "info"} /> },
        { key: "status", header: "Status", render: (t: any) => <Pill value={t.status} /> },
        { key: "act", header: "", render: (t: any) => has("Task.Work") && t.status !== "Done" && <div className="row">
          {t.assignedUserId !== me?.user.id && <button className="btn small" data-testid={`task-take-${t.taskId}`} onClick={() => update(t.taskId, { action: "take" }, "Task taken")}>Take</button>}
          <select aria-label="Assign to" className="small" style={{ width: 140, minHeight: 30 }} value="" onChange={(e) => e.target.value && update(t.taskId, { action: "assign", assignToUserId: e.target.value }, "Assigned")}>
            <option value="">Assign…</option>{(lk.data?.staff ?? []).map((s) => <option key={s.userId} value={s.userId}>{s.displayName}</option>)}</select>
          <button className="btn small primary" data-testid={`task-done-${t.taskId}`} onClick={() => update(t.taskId, { action: "done" }, "Task completed")}>Done</button></div> }]} />}</Async>
    </>
  );
}

// ---------------- group simulation ----------------
export function GroupSimPage() {
  const { has } = useAuth();
  const deps = useAsync(() => get<any[]>("/ops/departures"), []);
  const lk = useLookups();
  const plans = useAsync(() => get<any[]>("/ops/group-sim"), []);
  const [f, setF] = useState<{ departureId: string; vehicleCodes: string[]; targetMarginPct: number }>({ departureId: "", vehicleCodes: [], targetMarginPct: 15 });
  const [result, setResult] = useState<any>(null);
  const a = useAction();
  return (
    <>
      <PageHeader tagline="Optimise" title="Group assembly & profitability" lead="Deterministic simulation: which vehicle mix seats everyone at the best margin, using the cost assumptions table. Plans are saved with their inputs and need approval from someone else." />
      <Card title="Run a simulation">
        <FormError error={a.error} />{a.error && !(a.error as any).errors ? <ErrorBox error={a.error} /> : null}
        <div className="form cols">
          <SelectInput label="Departure" value={f.departureId} onChange={(v) => setF({ ...f, departureId: v })} placeholder="Choose" testId="sim-departure"
            options={(deps.data ?? []).filter((d) => d.seatsSold + d.seatsHeld > 0).map((d) => ({ value: d.departureId, label: `${fmtDate(d.departureDate)} ${d.tourCode} (${d.seatsSold + d.seatsHeld} pax)` }))} />
          <TextInput label="Target margin %" type="number" value={f.targetMarginPct} onChange={(v) => setF({ ...f, targetMarginPct: Number(v) })} error={a.fieldError("targetMarginPct")} />
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: "10px 0" }}><legend className="small">Vehicle types (none = all)</legend>
          <div className="row">{(lk.data?.vehicles ?? []).map((v) => <Checkbox key={v.code} label={`${v.name} (${money(v.costPerDay)}/day)`} checked={f.vehicleCodes.includes(v.code)} onChange={(c) => setF({ ...f, vehicleCodes: c ? [...f.vehicleCodes, v.code] : f.vehicleCodes.filter((x) => x !== v.code) })} />)}</div>
        </fieldset>
        <button className="btn primary" disabled={!f.departureId || a.busy} data-testid="sim-run" onClick={async () => { const r = await a.run(() => post("/ops/group-sim/run", { ...f, departureId: Number(f.departureId) }), "Simulation saved as draft"); if (r) { setResult(r); plans.reload(); } }}>Run simulation</button>
      </Card>
      {result && <Card title={`Result ${result.plan.planRef} (draft)`} actions={has("GroupPlan.Submit") && <button className="btn primary small" data-testid="sim-submit" onClick={async () => { if (await a.run(() => post(`/ops/group-sim/${result.plan.groupPlanId}/submit`), "Submitted for approval") !== undefined) { setResult(null); plans.reload(); } }}>Submit best plan for approval</button>}>
        <DataTable rows={result.options} rowKey={(o: any) => o.optionKey} testId="sim-options" columns={[
          { key: "description", header: "Plan" }, { key: "seats", header: "Seats" }, { key: "vehicleCost", header: "Vehicles", render: (o: any) => money(o.vehicleCost) },
          { key: "guideCost", header: "Guides", render: (o: any) => money(o.guideCost) }, { key: "totalCost", header: "Total cost", render: (o: any) => money(o.totalCost) },
          { key: "revenue", header: "Revenue", render: (o: any) => money(o.revenue) }, { key: "marginPct", header: "Margin", render: (o: any) => <Pill value={pct(o.marginPct)} tone={o.meetsTarget ? "ok" : "warn"} /> }]} />
      </Card>}
      <Card title="Saved plans">
        <Async state={plans}>{(rows) => <DataTable rows={rows} rowKey={(p: any) => p.groupPlanId} testId="plans-table" columns={[
          { key: "planRef", header: "Plan" }, { key: "tourCode", header: "Tour" }, { key: "departureDate", header: "Departure", render: (p: any) => fmtDate(p.departureDate) },
          { key: "chosenOption", header: "Best option" }, { key: "projectedMarginPct", header: "Margin", render: (p: any) => pct(p.projectedMarginPct) },
          { key: "status", header: "Status", render: (p: any) => <Pill value={p.status} /> }, { key: "createdByMasked", header: "By" },
          { key: "s", header: "", render: (p: any) => p.status === "Draft" && has("GroupPlan.Submit") && <button className="btn small" onClick={async () => { if (await a.run(() => post(`/ops/group-sim/${p.groupPlanId}/submit`), "Submitted") !== undefined) plans.reload(); }}>Submit</button> }]} />}</Async>
      </Card>
    </>
  );
}

// ---------------- integrations ----------------
export function IntegrationsPage() {
  const { has } = useAuth();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const ev = useAsync(() => get<any>("/ops/integrations/events", { status, page, pageSize: 20 }), [status, page]);
  const suppliers = useAsync(() => get<any[]>("/ops/suppliers"), []);
  const [mock, setMock] = useState({ supplierCode: "SUP-HTL-01", eventType: "statement.issued", idempotencyKey: newKey("evt"), payload: '{\n  "period": "2026-12",\n  "amount": 86400\n}' });
  const [payload, setPayload] = useState<string | null>(null);
  const [mockResult, setMockResult] = useState<string | null>(null);
  const a = useAction();
  const examples: Record<string, string> = {
    "statement.issued": '{\n  "period": "2026-12",\n  "amount": 86400\n}',
    "allotment.updated": '{\n  "tourCode": "TW-ERV-3D",\n  "departureDate": "2026-12-05",\n  "capacity": 42\n}',
    "vehicle.cancelled": '{\n  "tourCode": "TW-ALI-2D",\n  "departureDate": "2026-11-29",\n  "note": "DEMO breakdown"\n}'
  };
  return (
    <>
      <PageHeader tagline="Integration" title="Integration jobs & webhooks" lead="Signed supplier webhooks (HMAC-SHA256, timestamp check, idempotency key). Duplicates are counted, not re-applied; failures retry with backoff 1, 2, 4, 8 min, then go to dead letter." />
      {has("Integration.Retry") && <Card title="Send a test event (LOCAL MOCK supplier, not a live connection)">
        {a.error ? <ErrorBox error={a.error} /> : null}
        <div className="form cols">
          <SelectInput label="Supplier" value={mock.supplierCode} onChange={(v) => setMock({ ...mock, supplierCode: v })} options={(suppliers.data ?? []).map((s) => ({ value: s.code, label: `${s.code} (${s.adapterType})` }))} testId="mock-supplier" />
          <SelectInput label="Event type" value={mock.eventType} onChange={(v) => setMock({ ...mock, eventType: v, payload: examples[v] })} options={Object.keys(examples).map((k) => ({ value: k, label: k }))} testId="mock-type" />
          <TextInput label="Idempotency key" value={mock.idempotencyKey} onChange={(v) => setMock({ ...mock, idempotencyKey: v })} hint="Send the same key twice to see duplicate detection." data-testid="mock-key" />
        </div>
        <TextArea label="data (JSON)" value={mock.payload} onChange={(v) => setMock({ ...mock, payload: v })} rows={5} data-testid="mock-payload" />
        <div className="form-actions" style={{ marginTop: 8 }}>
          <button className="btn primary" disabled={a.busy} data-testid="mock-send" onClick={async () => {
            let data: Record<string, unknown>; try { data = JSON.parse(mock.payload); } catch { a.run(() => Promise.reject(new Error("The data field is not valid JSON."))); return; }
            const r = await a.run(() => post<any>("/ops/integrations/mock-send", { ...mock, payload: data }));
            if (r) { ev.reload(); suppliers.reload(); setMockResult(`${r.outcome}: event ${r.eventId} is ${r.status}${r.error ? ` (${r.error})` : ""}`); }
          }}>Send signed event</button>
          <button className="btn" onClick={() => setMock({ ...mock, idempotencyKey: newKey("evt") })}>New key</button>
        </div>
        {mockResult && <div className="alert info small" style={{ marginTop: 8 }} data-testid="mock-result">{mockResult}</div>}
      </Card>}
      <div className="toolbar"><SelectInput label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="Any" options={["Received", "Processed", "Failed", "DeadLetter"].map((s) => ({ value: s, label: s }))} testId="events-status" /></div>
      <Async state={ev}>{(d) => <>
        <DataTable rows={d.items} rowKey={(e: any) => e.eventId} testId="events-table" columns={[
          { key: "receivedAtUtc", header: "Received", render: (e: any) => <>{fmtDateTime(e.receivedAtUtc)}<Demo show={e.isDemo} /></> }, { key: "supplierCode", header: "Supplier" }, { key: "eventType", header: "Event", render: (e: any) => <span className="mono">{e.eventType}</span> },
          { key: "idempotencyKey", header: "Idempotency key", render: (e: any) => <span className="mono small">{e.idempotencyKey}</span> },
          { key: "status", header: "Status", render: (e: any) => <><Pill value={e.status} />{e.duplicateCount > 0 && <span className="small muted"> +{e.duplicateCount} duplicate(s) ignored</span>}</> },
          { key: "attempts", header: "Attempts" }, { key: "lastError", header: "Last error", render: (e: any) => <span className="small">{e.lastError}{e.nextAttemptAtUtc && <> · retry {fmtDateTime(e.nextAttemptAtUtc)}</>}</span> },
          { key: "x", header: "", render: (e: any) => <div className="row"><button className="btn small" onClick={() => setPayload(e.payloadJson)}>Payload</button>
            {has("Integration.Retry") && ["Failed", "DeadLetter"].includes(e.status) && <button className="btn small" data-testid={`retry-${e.eventId}`} onClick={async () => { if (await a.run(() => post(`/ops/integrations/events/${e.eventId}/retry`), "Retried") !== undefined) ev.reload(); }}>Retry now</button>}</div> }]} />
        <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
      </>}</Async>
      {payload && <Modal title="Stored payload (PII redacted)" onClose={() => setPayload(null)}><pre className="json">{JSON.stringify(JSON.parse(payload), null, 2)}</pre></Modal>}
    </>
  );
}

// ---------------- reconciliation ----------------
export function ReconciliationPage() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2).padStart(2, "0")}`);
  const list = useAsync(() => get<any[]>("/ops/reconciliation"), []);
  const [resolve, setResolve] = useState<{ row: any; action: string; note: string } | null>(null);
  const a = useAction();
  return (
    <>
      <PageHeader tagline="Finance" title="Reconciliation & settlement" lead="Compares our supplier cost lines with each supplier's statement for a month. Mismatches open one exception task; accepting a difference needs a note." />
      <Card title="Run reconciliation">
        {a.error ? <ErrorBox error={a.error} /> : null}
        <div className="row"><TextInput label="Period" type="month" value={period} onChange={setPeriod} error={a.fieldError("period")} data-testid="recon-period" />
          <button className="btn primary" style={{ alignSelf: "end" }} disabled={a.busy} data-testid="recon-run" onClick={async () => { if (await a.run(() => post("/ops/reconciliation/run", { period }), "Reconciliation complete") !== undefined) list.reload(); }}>Run</button></div>
      </Card>
      <div style={{ height: 16 }} />
      <Async state={list} empty={(r) => r.length === 0}>{(rows) => <DataTable rows={rows} rowKey={(r: any) => r.reconId} testId="recon-table" columns={[
        { key: "period", header: "Period" }, { key: "supplierName", header: "Supplier" }, { key: "ourAmount", header: "Our cost", render: (r: any) => money(r.ourAmount) },
        { key: "supplierAmount", header: "Statement", render: (r: any) => money(r.supplierAmount) }, { key: "difference", header: "Difference", render: (r: any) => <span className={r.difference ? "pill bad" : ""}>{money(r.difference)}</span> },
        { key: "status", header: "Status", render: (r: any) => <Pill value={r.status} /> }, { key: "resolutionNote", header: "Note" },
        { key: "x", header: "", render: (r: any) => <div className="row">
          {["Mismatch", "MissingStatement"].includes(r.status) && <button className="btn small" data-testid={`recon-accept-${r.supplierCode}`} onClick={() => setResolve({ row: r, action: "accept", note: "" })}>Accept difference</button>}
          {["Matched", "Accepted"].includes(r.status) && <button className="btn small primary" data-testid={`recon-settle-${r.supplierCode}`} onClick={() => setResolve({ row: r, action: "settle", note: "" })}>Mark settled</button>}</div> }]} />}</Async>
      {resolve && <Modal title={`${resolve.action === "accept" ? "Accept difference" : "Mark settled"}: ${resolve.row.supplierName}`} onClose={() => setResolve(null)} actions={<button className="btn primary" disabled={a.busy} data-testid="recon-confirm" onClick={async () => {
        if (await a.run(() => post(`/ops/reconciliation/${resolve.row.reconId}/resolve`, { action: resolve.action, note: resolve.note || null }), "Saved") !== undefined) { setResolve(null); list.reload(); }
      }}>Confirm</button>}>
        <FormError error={a.error} /><TextArea label={resolve.action === "accept" ? "Why is the difference acceptable? (required)" : "Note (optional)"} value={resolve.note} onChange={(v) => setResolve({ ...resolve, note: v })} error={a.fieldError("note")} data-testid="recon-note" />
      </Modal>}
    </>
  );
}

// ---------------- workflows ----------------
export function WorkflowsPage() {
  const { has } = useAuth();
  const wf = useAsync(() => get<any>("/ops/workflows"), []);
  const lk = useLookups();
  const [edit, setEdit] = useState<any>(null);
  const a = useAction();
  const active = (wf.data?.workflows ?? []).filter((w: any) => w.isActive);
  const stepsOf = (id: number) => (wf.data?.steps ?? []).filter((s: any) => s.workflowId === id);
  const roleOptions = (lk.data?.roles ?? []).map((r) => ({ value: r.id, label: r.name }));
  return (
    <>
      <PageHeader tagline="Workflow" title="Workflow designer" lead="Approval routing is data: each step names an approver role, a condition, an SLA and an escalation role. Saving creates a new version; requests already running keep their version." />
      <Async state={wf}>{() => active.map((w: any) => (
        <Card key={w.workflowId} title={`${w.name} · v${w.version}`} actions={has("Workflow.Edit") && <button className="btn small" data-testid={`wf-edit-${w.workflowKey}`} onClick={() => setEdit({ workflowKey: w.workflowKey, entityType: w.entityType, name: w.name, steps: stepsOf(w.workflowId).map((s: any) => ({ name: s.name, approverRoleId: s.approverRoleId, conditionType: s.conditionType, conditionValue: s.conditionValue, slaHours: s.slaHours, escalateRoleId: s.escalateRoleId })) })}>New version</button>}>
          <p className="small muted mono">{w.workflowKey} · entity {w.entityType}</p>
          <DataTable rows={stepsOf(w.workflowId)} rowKey={(s: any) => s.stepNo} columns={[
            { key: "stepNo", header: "#" }, { key: "name", header: "Step" }, { key: "approverRole", header: "Approver role" },
            { key: "cond", header: "Condition", render: (s: any) => s.conditionType === "Always" ? "always" : `${s.conditionType === "AmountGreaterThan" ? "amount" : "pax"} > ${s.conditionValue}` },
            { key: "slaHours", header: "SLA (h)" }, { key: "escalateRole", header: "Escalate to" }]} />
        </Card>))}</Async>
      {edit && <Modal title={`New version: ${edit.name}`} onClose={() => setEdit(null)} testId="wf-modal" actions={<button className="btn primary" disabled={a.busy} data-testid="wf-save" onClick={async () => {
        const body = { ...edit, steps: edit.steps.map((s: any) => ({ ...s, approverRoleId: Number(s.approverRoleId), escalateRoleId: s.escalateRoleId ? Number(s.escalateRoleId) : null, conditionValue: s.conditionType === "Always" ? null : Number(s.conditionValue), slaHours: Number(s.slaHours) })) };
        if (await a.run(() => post("/ops/workflows", body), "New workflow version saved") !== undefined) { setEdit(null); wf.reload(); }
      }}>Save new version</button>}>
        <FormError error={a.error} />{a.error && !(a.error as any).errors ? <ErrorBox error={a.error} /> : null}
        <TextInput label="Name" value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} error={a.fieldError("name")} />
        {edit.steps.map((s: any, i: number) => (
          <div key={i} className="card" style={{ marginTop: 10 }}>
            <div className="row"><b>Step {i + 1}</b><span className="spacer" /><button className="btn small danger" onClick={() => setEdit({ ...edit, steps: edit.steps.filter((_: any, j: number) => j !== i) })}>Remove</button></div>
            <div className="form cols">
              <TextInput label="Name" value={s.name} onChange={(v) => upd(i, { name: v })} error={a.fieldError(`steps[${i}].name`)} />
              <SelectInput label="Approver role" value={s.approverRoleId} onChange={(v) => upd(i, { approverRoleId: v })} options={roleOptions} />
              <SelectInput label="Condition" value={s.conditionType} onChange={(v) => upd(i, { conditionType: v })} options={[{ value: "Always", label: "Always" }, { value: "AmountGreaterThan", label: "Amount greater than" }, { value: "PaxGreaterThan", label: "Pax greater than" }]} />
              {s.conditionType !== "Always" && <TextInput label="Threshold" type="number" value={s.conditionValue ?? ""} onChange={(v) => upd(i, { conditionValue: v })} error={a.fieldError(`steps[${i}].conditionValue`)} />}
              <TextInput label="SLA hours" type="number" value={s.slaHours} onChange={(v) => upd(i, { slaHours: v })} error={a.fieldError(`steps[${i}].slaHours`)} />
              <SelectInput label="Escalate to" value={s.escalateRoleId ?? ""} onChange={(v) => upd(i, { escalateRoleId: v || null })} placeholder="None" options={roleOptions} />
            </div>
          </div>))}
        <button className="btn small" style={{ marginTop: 10 }} onClick={() => setEdit({ ...edit, steps: [...edit.steps, { name: "", approverRoleId: roleOptions[0]?.value, conditionType: "Always", conditionValue: null, slaHours: 8, escalateRoleId: null }] })}>Add step</button>
      </Modal>}
    </>
  );
  function upd(i: number, patch: object) { setEdit((e: any) => ({ ...e, steps: e.steps.map((s: any, j: number) => (j === i ? { ...s, ...patch } : s)) })); }
}

// ---------------- privacy ----------------
export function PrivacyPage() {
  const run = useAction();
  const [last, setLast] = useState<any>(null);
  const cols: Column<any>[] = [{ key: "dataClass", header: "Data class" }, { key: "fields", header: "Fields" }, { key: "keepDays", header: "Keep (days)" }, { key: "action", header: "Action" },
    { key: "isActive", header: "Active", render: (p) => (p.isActive ? "✓" : "—") }, { key: "lastRunAtUtc", header: "Last run", render: (p) => fmtDateTime(p.lastRunAtUtc) }];
  return (
    <>
      <EntityPage<any> tagline="Privacy" title="Data retention & privacy" testId="privacy" canEdit newLabel="" load={() => get("/ops/privacy/policies")} rowKey={(p) => p.policyId}
        lead="Retention rules for personal data. Set under Taiwan's Personal Data Protection Act; review with the legal team before changing."
        columns={cols} fields={[{ name: "keepDays", label: "Keep (days)", type: "number" }, { name: "action", label: "Action", type: "select", options: ["Anonymise", "Delete", "Keep"].map((s) => ({ value: s, label: s })) }, { name: "isActive", label: "Active", type: "checkbox" }]}
        toForm={(p) => ({ keepDays: p?.keepDays ?? 730, action: p?.action ?? "Anonymise", isActive: p?.isActive ?? true })} save={(f, p) => put(`/ops/privacy/policies/${p!.policyId}`, { ...f, keepDays: Number(f.keepDays) })} />
      <Card title="Run traveler PII anonymisation">
        {run.error ? <ErrorBox error={run.error} /> : null}
        <div className="form-actions">
          <button className="btn" data-testid="privacy-dry" onClick={async () => setLast(await run.run(() => post("/ops/privacy/run?dryRun=true")))}>Dry run (count only)</button>
          <ConfirmButton className="btn danger" confirm="Anonymise traveler PII on bookings older than the retention period? This cannot be undone." onConfirm={async () => setLast(await run.run(() => post("/ops/privacy/run?dryRun=false"), "Anonymisation complete"))}>Run now</ConfirmButton>
        </div>
        {last && <p className="small" data-testid="privacy-result">{last.dryRun ? "Would anonymise" : "Anonymised"} {last.affected} booking(s).</p>}
      </Card>
    </>
  );
}
