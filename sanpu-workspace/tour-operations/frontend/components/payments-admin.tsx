"use client";

import Link from "next/link";
import { useState } from "react";
import { Async, DataTable, Kpi, PageHeader, Pill, SelectInput, TextInput, fmtDateTime, get, money, useAsync } from "@sanpu/web";

interface Tx {
  intentId: number; merchantTradeNo: string; orderType: "Tour" | "Service"; orderId: number; orderRef: string; mode: string; amount: number; currency: string;
  provider: string; status: "Paid" | "Pending" | "Failed"; providerTradeNo?: string | null; providerMessage?: string | null; paymentMethod?: string | null;
  createdAtUtc: string; completedAtUtc?: string | null; customerName: string; customerEmail: string; itemName?: string | null;
  totalCount: number; paidTotal: number; pendingCount: number; failedCount: number;
}
const MODE: Record<string, string> = { Deposit: "Deposit", Balance: "Balance", Full: "Full payment" };

/** Every payment transaction: deposits, balances and full payments from the payment gateway, with their result. */
export function PaymentsAdminPage() {
  const [f, setF] = useState({ status: "", orderType: "", search: "" });
  const list = useAsync(() => get<Tx[]>("/ops/payments", f), [f.status, f.orderType, f.search]);
  return (
    <>
      <PageHeader tagline="Partners & finance" title="Payments & transactions"
        lead="Every deposit, balance and full payment for tours, hotels, flights, buses and taxis, with the payment gateway's result and reference." />
      <div className="toolbar">
        <TextInput label="Search" value={f.search} onChange={(v) => setF({ ...f, search: v })} placeholder="Booking ref, trade no. or customer" data-testid="pay-search" />
        <SelectInput label="Result" value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="Any" options={["Paid", "Pending", "Failed"].map((x) => ({ value: x, label: x }))} testId="pay-status" />
        <SelectInput label="Booking type" value={f.orderType} onChange={(v) => setF({ ...f, orderType: v })} placeholder="Any" options={[{ value: "Tour", label: "Tours" }, { value: "Service", label: "Hotels, flights, buses & taxis" }]} testId="pay-type" />
      </div>
      <Async state={list}>{(rows) => (
        <>
          <div className="kpis">
            <Kpi label="Received" value={money(rows[0]?.paidTotal ?? 0)} />
            <Kpi label="Transactions" value={rows[0]?.totalCount ?? 0} />
            <Kpi label="Waiting for the gateway" value={rows[0]?.pendingCount ?? 0} />
            <Kpi label="Failed" value={rows[0]?.failedCount ?? 0} />
          </div>
          <DataTable rows={rows} rowKey={(r) => r.intentId} testId="payments"
            columns={[
              { key: "when", header: "Started", render: (r) => fmtDateTime(r.createdAtUtc) },
              { key: "ref", header: "Booking", render: (r) => <Link href={r.orderType === "Tour" ? `/admin/bookings/${r.orderId}` : "/admin/service-bookings"}>{r.orderRef}</Link> },
              { key: "item", header: "Item", render: (r) => r.itemName ?? "—" },
              { key: "customer", header: "Customer", render: (r) => <span>{r.customerName}<br /><small className="muted">{r.customerEmail}</small></span> },
              { key: "mode", header: "Type", render: (r) => MODE[r.mode] ?? r.mode },
              { key: "amount", header: "Amount", render: (r) => money(r.amount, r.currency) },
              { key: "status", header: "Result", render: (r) => <Pill value={r.status} /> },
              { key: "gw", header: "Gateway", render: (r) => <span>{r.provider}{r.paymentMethod ? ` · ${r.paymentMethod}` : ""}<br /><small className="muted">{r.providerTradeNo ?? r.merchantTradeNo}</small></span> },
              { key: "done", header: "Completed", render: (r) => (r.completedAtUtc ? fmtDateTime(r.completedAtUtc) : "—") },
            ]} />
        </>
      )}</Async>
    </>
  );
}
