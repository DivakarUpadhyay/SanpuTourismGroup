"use client";

import { useEffect, useState } from "react";
import { Async, DataTable, PageHeader, SelectInput, get, money, post, useAsync } from "@sanpu/web";

/* Card payments on assistant bookings: hand-over to the gateway's hosted page, the banner after returning, and the staff list. */

export interface Checkout { provider: string; merchantTradeNo: string; amount: number; completed: boolean; action?: string | null; fields?: Record<string, string> | null }
interface Payment {
  merchantTradeNo: string; mode: string; amount: number; currency: string; provider: string; status: string; providerTradeNo?: string | null; paymentMethod?: string | null;
  providerMessage?: string | null; createdAtUtc: string; orderRef: string; itemName: string; travelerName?: string; travelerEmail?: string;
}

/** Posts the signed form to the gateway's hosted checkout page. */
export function openGateway(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST"; form.action = action;
  Object.entries(fields).forEach(([k, v]) => { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; form.appendChild(i); });
  document.body.appendChild(form); form.submit();
}

/** Banner after returning from the gateway (?payment=paid|failed|pending|invalid&ref=...&trade=...). A pending result is re-checked once. */
export function PaymentResultBanner({ onChange }: { onChange: () => void }) {
  const [result, setResult] = useState<{ outcome: string; ref: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const outcome = p.get("payment"), ref = p.get("ref") ?? "", trade = p.get("trade");
    if (!outcome) return;
    setResult({ outcome, ref });
    window.history.replaceState(null, "", window.location.pathname);
    if (outcome === "pending" && trade) post<Payment>(`/payments/${trade}/refresh`).then((x) => { setResult({ outcome: x.status.toLowerCase(), ref }); onChange(); }).catch(() => undefined);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!result) return null;
  const { outcome, ref } = result;
  const msg = outcome === "paid" ? { tone: "ok", text: `Payment received for ${ref}. Thank you!` }
    : outcome === "failed" ? { tone: "error", text: `The payment for ${ref} did not go through, so your booking is not confirmed. You can try again below.` }
    : outcome === "pending" ? { tone: "info", text: `We are waiting for ECPay to confirm the payment for ${ref}. Your booking is confirmed only after that.` }
    : { tone: "error", text: "We could not verify that payment response. Nothing was recorded. Please contact us if you were charged." };
  return <div className={`alert ${msg.tone}`} role="status" data-testid="payment-result">{msg.text}</div>;
}

const TONE: Record<string, string> = { Paid: "ok", Pending: "warn", Failed: "bad" };

export function AdminPaymentsPage() {
  const [status, setStatus] = useState("");
  const list = useAsync(() => get<Payment[]>("/aiops/payments", { status }), [status]);
  return (
    <>
      <PageHeader tagline="Copilot" title="Payments" lead="Every card payment travelers attempted on assistant bookings. A booking is confirmed only after ECPay reports the payment as paid." />
      <div className="toolbar"><SelectInput label="Status" value={status} onChange={setStatus} placeholder="Any" options={["Paid", "Pending", "Failed"].map((s) => ({ value: s, label: s }))} testId="payment-status" /></div>
      <Async state={list}>{(rows) => (
        rows.length === 0 ? <div className="as-empty big"><b>No payments yet</b><span className="muted">Payments appear here as soon as a traveler starts a checkout.</span></div> : <DataTable rows={rows} rowKey={(r) => r.merchantTradeNo} testId="payments"
          columns={[
            { key: "when", header: "Date", render: (r) => new Date(/[zZ]$/.test(r.createdAtUtc) ? r.createdAtUtc : r.createdAtUtc + "Z").toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
            { key: "ref", header: "Booking", render: (r) => <span><b>{r.orderRef}</b><br /><small className="muted">{r.itemName}</small></span> },
            { key: "who", header: "Traveler", render: (r) => <span>{r.travelerName}<br /><small className="muted">{r.travelerEmail}</small></span> },
            { key: "mode", header: "Type", render: (r) => r.mode },
            { key: "amount", header: "Amount", render: (r) => money(r.amount, r.currency) },
            { key: "trade", header: "Payment reference", render: (r) => <span>{r.providerTradeNo ?? r.merchantTradeNo}<br /><small className="muted">{r.provider}{r.paymentMethod ? ` · ${r.paymentMethod}` : ""}</small></span> },
            { key: "status", header: "Status", render: (r) => <span><span className={`pill ${TONE[r.status] ?? ""}`}>{r.status}</span>{r.providerMessage && r.status !== "Paid" ? <><br /><small className="muted">{r.providerMessage}</small></> : null}</span> },
          ]} />
      )}</Async>
    </>
  );
}
