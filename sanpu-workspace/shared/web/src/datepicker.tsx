"use client";

import { useEffect, useRef, useState } from "react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (v?: string | number | null) => {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(v ?? ""));
  return m ? new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1) : null;
};

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> & { value: string | number; onChange: (v: string) => void; mode: "date" | "month" };

/** Text input + popover calendar. Typing YYYY-MM-DD (or YYYY-MM) still works; min/max are respected; Esc or an outside click closes it. */
export function DatePickerInput({ value, onChange, mode, min, max, id, disabled, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  const selected = parse(value);
  const [view, setView] = useState(() => selected ?? new Date());
  const box = useRef<HTMLDivElement>(null);
  const lo = parse(min as string), hi = parse(max as string);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const openPicker = () => { if (selected) setView(selected); setOpen(true); };
  const today = iso(new Date());
  const blocked = (d: Date) => !!((lo && d < lo) || (hi && d > hi));
  const pick = (v: string) => { onChange(v); setOpen(false); };
  const step = (n: number) => setView(mode === "month" ? new Date(view.getFullYear() + n, 0, 1) : new Date(view.getFullYear(), view.getMonth() + n, 1));

  let body;
  if (mode === "month") {
    const y = view.getFullYear();
    body = (
      <div className="dp-months">
        {MONTHS.map((m, i) => {
          const v = `${y}-${pad(i + 1)}`;
          const off = !!((lo && new Date(y, i + 1, 0) < lo) || (hi && new Date(y, i, 1) > hi));
          return <button type="button" key={m} disabled={off} aria-pressed={String(value) === v} onClick={() => pick(v)}>{m.slice(0, 3)}</button>;
        })}
      </div>
    );
  } else {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    body = (
      <div className="dp-grid" role="grid">
        {DAYS.map((d) => <span key={d} className="dp-dow">{d}</span>)}
        {cells.map((d) => {
          const v = iso(d);
          return (
            <button type="button" key={v} disabled={blocked(d)} className={`${d.getMonth() !== view.getMonth() ? "out" : ""}${v === today ? " today" : ""}`}
                    aria-pressed={String(value) === v} aria-label={d.toDateString()} onClick={() => pick(v)}>{d.getDate()}</button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="dp" ref={box}>
      <input id={id} type="text" inputMode="numeric" autoComplete="off" placeholder={mode === "month" ? "YYYY-MM" : "YYYY-MM-DD"} value={value}
             disabled={disabled} onChange={(e) => onChange(e.target.value)} onFocus={openPicker} {...rest} />
      <button type="button" className="dp-btn" aria-label="Open calendar" tabIndex={-1} disabled={disabled} onClick={() => (open ? setOpen(false) : openPicker())}>
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14v12H3zM3 9h14M7 3v4M13 3v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      {open && !disabled && (
        <div className="dp-pop" role="dialog" aria-label={mode === "month" ? "Choose a month" : "Choose a date"}>
          <div className="dp-head">
            <button type="button" aria-label="Previous" onClick={() => step(-1)}>‹</button>
            <b>{mode === "month" ? view.getFullYear() : `${MONTHS[view.getMonth()]} ${view.getFullYear()}`}</b>
            <button type="button" aria-label="Next" onClick={() => step(1)}>›</button>
          </div>
          {body}
          <div className="dp-foot">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}>Clear</button>
            {mode === "date" && !blocked(new Date()) && <button type="button" onClick={() => pick(today)}>Today</button>}
          </div>
        </div>
      )}
    </div>
  );
}
