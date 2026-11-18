"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ApiError, currentRealm, pageCache } from "./api";
import { DatePickerInput } from "./datepicker";

// ---------------- data loading ----------------
const CACHE_MS = 5 * 60_000;
/** One entry per page, query and signed-in area. Nothing is cached on the server. */
function cacheKey(fn: () => unknown, deps: unknown[]) {
  if (typeof window === "undefined") return null;
  try { return `${currentRealm()}|${window.location.pathname}|${fn}|${JSON.stringify(deps)}`; } catch { return null; }
}
function cached<T>(key: string | null) {
  const hit = key ? pageCache.get(key) : undefined;
  return hit && Date.now() - hit.at < CACHE_MS ? (hit.data as T) : null;
}

/** Loads page data. A page opened before appears at once from memory while fresh data loads quietly behind it. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(() => cached<T>(cacheKey(fn, deps)));
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(() => cached<T>(cacheKey(fn, deps)) === null);
  const seq = useRef(0);
  const run = useCallback(async () => {
    const id = ++seq.current;
    const key = cacheKey(fn, deps), hit = cached<T>(key);
    if (hit !== null) setData(hit);
    setLoading(true); setError(null);
    try {
      const d = await fn();
      if (key) pageCache.set(key, { data: d, at: Date.now() });
      if (id === seq.current && (hit === null || JSON.stringify(hit) !== JSON.stringify(d))) setData(d);   // unchanged data causes no repaint
    }
    catch (e) { if (id === seq.current && hit === null) setError(e); }
    finally { if (id === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

/** Runs a write once at a time (blocks double submit) and maps ApiError field errors for the form. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const toast = useToast();
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(true); setError(null);
    try { const r = await fn(); if (success) toast(success, "ok"); return r; }
    catch (e) { setError(e); if (!(e instanceof ApiError && e.errors)) toast(errorText(e), "error"); return undefined; }
    finally { setBusy(false); }
  }, [busy, toast]);
  const fieldError = (name: string) => (error instanceof ApiError ? error.errors?.[name]?.[0] : undefined);
  return { busy, error, run, fieldError, clear: () => setError(null) };
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong.");

// ---------------- toasts ----------------
type Toast = { id: number; text: string; kind: "ok" | "error" | "info" };
const ToastContext = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast ${t.kind}`} data-testid="toast">{t.text}</div>)}</div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

// ---------------- layout pieces ----------------
export function PageHeader({ tagline, title, lead, actions }: { tagline?: string; title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {tagline && <p className="tagline">{tagline}</p>}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && <div className="row" style={{ marginBottom: 10 }}>{title && <h2 style={{ margin: 0 }}>{title}</h2>}<span className="spacer" />{actions}</div>}
      {children}
    </section>
  );
}

/** Admin routes the signed-in staff member may open (filled by AdminShell from their menu). */
export const AdminRoutesContext = createContext<string[] | null>(null);

/** A dashboard number. With href it opens the page behind the number (only if the viewer may open that page). */
export function Kpi({ label, value, testId, href, hint }: { label: string; value: ReactNode; testId?: string; href?: string; hint?: string }) {
  const routes = useContext(AdminRoutesContext);
  const allowed = href && (!routes || routes.some((r) => href === r || href.split("?")[0] === r || (r !== "/admin" && href.startsWith(r + "/"))));
  if (allowed) return <Link className="kpi link" href={href!} data-testid={testId} title={hint ?? `Open ${label.toLowerCase()}`}><b>{value}</b><span>{label}</span><i aria-hidden="true">→</i></Link>;
  return <div className="kpi" data-testid={testId}><b>{value}</b><span>{label}</span></div>;
}

const tones: Record<string, string> = {
  AwaitingPayment: "warn",
  Confirmed: "ok", Approved: "ok", Active: "ok", Processed: "ok", Matched: "ok", Settled: "ok", Paid: "ok", Accepted: "ok", Done: "ok", Planned: "ok", Open: "info",
  Pending: "warn", PendingReview: "warn", Invited: "warn", CancelRequested: "warn", Submitted: "warn", Draft: "info", InProgress: "info", Extracted: "warn", Disrupted: "bad",
  Rejected: "bad", Cancelled: "bad", Locked: "bad", Inactive: "bad", Failed: "bad", DeadLetter: "bad", Mismatch: "bad", MissingStatement: "warn", Replaced: "info",
  PartiallyRefunded: "warn", Refunded: "info", Unpaid: "warn", Closed: "bad", Superseded: "info", PendingApproval: "warn", PendingCredentials: "warn", LocalMock: "info", WebhookReady: "ok"
};
export function Pill({ value, tone }: { value: string; tone?: string }) {
  return <span className={`pill ${tone ?? tones[value] ?? ""}`}>{value === "AwaitingPayment" ? "Awaiting payment" : value === "PartiallyPaid" ? "Deposit paid" : value}</span>;
}
/** Seed-data flag. Records keep IsDemo in the database for clean-up, but nothing is shown to users. */
export const Demo = (_: { show?: boolean }) => null;

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  // the online preview (no booking service) explains calmly instead of showing an error
  if (error instanceof ApiError && error.code === "offline_only") return (
    <div className="alert info offline-note" role="status" data-testid="offline-note">
      <b>Opens when our booking service is live</b>
      <span>{error.message}</span>
      <div className="form-actions"><button className="btn small" onClick={() => history.back()}>Go back</button><a className="btn small subtle" href="/">Home</a></div>
    </div>
  );
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <div className="alert error" role="alert" data-testid="error-box">
      {forbidden ? "You do not have permission to see this." : errorText(error)}
      {retry && !forbidden && <div style={{ marginTop: 6 }}><button className="btn small" onClick={retry}>Try again</button></div>}
    </div>
  );
}

export function Loading({ lines = 3 }: { lines?: number }) {
  return <div className="wait" aria-busy="true" aria-label="Loading">{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 12}%` }} />)}</div>;
}

export function Empty({ children = "Nothing here yet." }: { children?: ReactNode }) {
  return <div className="empty" data-testid="empty">{children}</div>;
}

/** Standard loading / error / empty wrapper used on every list. */
export function Async<T>({ state, children, empty }: { state: { data: T | null; error: unknown; loading: boolean; reload: () => void }; children: (d: T) => ReactNode; empty?: (d: T) => boolean }) {
  if (state.error) return <ErrorBox error={state.error} retry={state.reload} />;
  if (state.loading && state.data === null) return <Loading />;
  if (state.data === null) return null;
  if (empty?.(state.data)) return <Empty />;
  return <>{children(state.data)}</>;
}

// ---------------- form controls ----------------
/** Password field with a show/hide toggle. */
function PasswordInput({ value, onChange, type: _type, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string | number; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input {...rest} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>{show ? "Hide" : "Show"}</button>
    </div>
  );
}
interface FieldProps { label: string; error?: string; hint?: string; children: (id: string, describedBy?: string) => ReactNode }
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const desc = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field${error ? " invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children(id, desc)}
      {error ? <div className="error" id={`${id}-err`}>{error}</div> : hint ? <div className="hint" id={`${id}-hint`}>{hint}</div> : null}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { label: string; value: string | number; onChange: (v: string) => void; error?: string; hint?: string };
export function TextInput({ label, value, onChange, error, hint, ...rest }: InputProps) {
  if (rest.type === "password") return <Field label={label} error={error} hint={hint}>{(id, d) => <PasswordInput id={id} aria-describedby={d} aria-invalid={!!error} value={value} onChange={onChange} {...rest} />}</Field>;
  if (rest.type === "date" || rest.type === "month") {
    const { type, ...other } = rest;
    return <Field label={label} error={error} hint={hint}>{(id, d) => <DatePickerInput id={id} aria-describedby={d} aria-invalid={!!error} value={value} onChange={onChange} mode={type as "date" | "month"} {...other} />}</Field>;
  }
  return <Field label={label} error={error} hint={hint}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!error} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />}</Field>;
}

export function TextArea({ label, value, onChange, error, hint, ...rest }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string }) {
  return <Field label={label} error={error} hint={hint}>{(id, d) => <textarea id={id} aria-describedby={d} aria-invalid={!!error} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />}</Field>;
}

export function SelectInput({ label, value, onChange, options, error, hint, placeholder, testId, disabled }: {
  label: string; value: string | number; onChange: (v: string) => void; options: { value: string | number; label: string }[]; error?: string; hint?: string; placeholder?: string; testId?: string; disabled?: boolean
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(id, d) => (
        <select id={id} aria-describedby={d} aria-invalid={!!error} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} disabled={disabled}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} /> {label}</label>;
}

export function FormError({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || !error.errors) return null;
  return <div className="alert error" role="alert">{error.message}<span className="cid">Fix the highlighted fields.</span></div>;
}

// ---------------- modal & confirm ----------------
export function Modal({ title, onClose, children, actions, testId }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} data-testid={testId}>
        <h2>{title}</h2>
        {children}
        <div className="modal-actions">{actions}<button className="btn" onClick={onClose} data-testid="modal-close">Close</button></div>
      </div>
    </div>
  );
}

/** Destructive or consequential actions ask first. */
export function ConfirmButton({ children, confirm, onConfirm, className = "btn", disabled, testId }: { children: ReactNode; confirm: string; onConfirm: () => void; className?: string; disabled?: boolean; testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} disabled={disabled} onClick={() => setOpen(true)} data-testid={testId}>{children}</button>
      {open && (
        <Modal title="Please confirm" onClose={() => setOpen(false)} actions={<button className="btn primary" data-testid="confirm-yes" onClick={() => { setOpen(false); onConfirm(); }}>Yes, continue</button>}>
          <p>{confirm}</p>
        </Modal>
      )}
    </>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)} data-testid={`tab-${t.key}`}>{t.label}</button>)}
    </div>
  );
}

// ---------------- table ----------------
export interface Column<T> { key: string; header: string; render?: (row: T) => ReactNode; className?: string }
/** Excel / PDF download for a table (admin area only; uses the page title as the report name). */
function ReportButtons({ table }: { table: React.RefObject<HTMLTableElement | null> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (kind: "xlsx" | "pdf") => {
    if (!table.current) return;
    setBusy(kind);
    try {
      const { readTable, downloadExcel, downloadPdf } = await import("./reports");
      const title = (document.querySelector("main h1")?.textContent ?? "Report").trim();
      const brand = (document.querySelector(".brand-name")?.textContent ?? "Sanpu").trim();
      const data = { title, brand, ...readTable(table.current) };
      await (kind === "xlsx" ? downloadExcel(data) : downloadPdf(data));
    } finally { setBusy(null); }
  };
  return (
    <div className="report-bar" role="group" aria-label="Download this table">
      <button type="button" className="btn small subtle" onClick={() => run("xlsx")} disabled={!!busy} data-testid="export-xlsx">{busy === "xlsx" ? "Preparing…" : "Excel"}</button>
      <button type="button" className="btn small subtle" onClick={() => run("pdf")} disabled={!!busy} data-testid="export-pdf">{busy === "pdf" ? "Preparing…" : "PDF"}</button>
    </div>
  );
}

export function DataTable<T>({ rows, columns, rowKey, onRowClick, caption, testId, exportable }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string | number; onRowClick?: (r: T) => void; caption?: string; testId?: string; exportable?: boolean }) {
  const ref = useRef<HTMLTableElement>(null);
  const inAdmin = useContext(AdminRoutesContext) !== null;
  if (rows.length === 0) return <Empty />;
  return (
    <div className="table-wrap">
      {(exportable ?? inAdmin) && rows.length > 0 && <ReportButtons table={ref} />}
      <table className="data" data-testid={testId} ref={ref}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col">{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={onRowClick ? "clickable" : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}
                tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}>
              {columns.map((c) => <td key={c.key} className={c.className}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager" aria-label="Pagination">
      <span>{total} total · page {page} of {pages}</span>
      <button className="btn small" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="page-prev">Previous</button>
      <button className="btn small" disabled={page >= pages} onClick={() => onPage(page + 1)} data-testid="page-next">Next</button>
    </div>
  );
}

// ---------------- formatting ----------------
export const fmtDate = (v?: string | null) => (v ? v.slice(0, 10) : "—");
export const fmtDateTime = (v?: string | null) => (v ? new Date(v).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const money = (v?: number | null, cur = "TWD") => (v === null || v === undefined ? "—" : `${cur} ${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
