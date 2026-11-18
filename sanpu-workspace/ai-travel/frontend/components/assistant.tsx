"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, Fragment, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, Async, DataTable, ErrorBox, Icon, PageHeader, SelectInput, get, money, post, useAction, useAsync, useAuth, useSetting, useToast } from "@sanpu/web";

/* ============================================================================================================
   Sanpu AI Travel: an AI travel assistant. Travelers plan, compare and book in one conversation; every price
   comes live from Sanpu Travel; the assistant prepares a booking and the traveler confirms and pays with a button.
   ============================================================================================================ */

type Role = "user" | "assistant";
interface Card { type: "tours" | "tour" | "services" | "compare" | "booking" | "bookings" | "signin"; data: any }
interface Msg { role: Role; content: string; cards?: Card[]; notice?: string | null; ai?: boolean }
/** Book a specific option straight from a card (no AI needed). */
type BookFn = (label: string, input: Record<string, unknown>) => void;
const BookCtx = createContext<BookFn | null>(null);
export interface Reservation {
  reservationId: number; ref: string; kind: string; itemCode: string; itemName: string; imageUrl?: string | null; startDate: string; endDate?: string | null;
  travelers: number; units: number; total: number; currency: string; status: string; paidAmount: number; balance: number; paymentRef?: string | null;
  notes?: string | null; expiresAtUtc: string; createdAtUtc: string; depositPercent?: number; travelerName?: string; travelerEmail?: string;
}

const CHAT_KEY = "copilot.chat.v1";
const PROMPT_KEY = "copilot.prompt";
/** Server times are UTC; a value without a zone must not be read as local time. */
const utc = (iso: string) => Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z");
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "");
const KIND_ICON: Record<string, string> = { Tour: "map", Hotel: "building", Flight: "plane", Bus: "bus", Taxi: "car" };
const STATUS_LABEL: Record<string, string> = { AwaitingConfirmation: "Waiting for you", PartiallyPaid: "Deposit paid", Confirmed: "Confirmed", Cancelled: "Cancelled", Expired: "Expired" };
const statusTone = (s: string) => (s === "Confirmed" ? "ok" : s === "PartiallyPaid" ? "info" : s === "AwaitingConfirmation" ? "warn" : "muted");

export const SUGGESTIONS = [
  { icon: "map", text: "Plan 3 relaxed days in Hualien for 2 people under TWD 25,000" },
  { icon: "scale", text: "Compare the East Rift Valley and Kinmen heritage tours" },
  { icon: "building", text: "Find a hotel in Tainan for 2 nights from next Friday" },
  { icon: "plane", text: "Flights from Taipei to Kinmen next weekend for 2" },
  { icon: "car", text: "Book a taxi from Taoyuan airport to Taipei tomorrow morning" },
  { icon: "ticket", text: "Show my bookings" },
];

/** Tiny, safe formatter for the assistant's replies: paragraphs, bullet/numbered lists, **bold**, ### headings. No HTML is injected. */
function RichText({ text }: { text: string }) {
  const inline = (s: string, k: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={k + i}>{p.slice(2, -2)}</b> : <Fragment key={k + i}>{p}</Fragment>));
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => { if (list) { const L = list.ordered ? "ol" : "ul"; blocks.push(<L key={"l" + blocks.length}>{list.items.map((x, i) => <li key={i}>{inline(x, "i" + i)}</li>)}</L>); list = null; } };
  text.split(/\n/).forEach((raw, n) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line), num = /^\s*\d+[.)]\s+(.*)$/.exec(line), head = /^#{1,4}\s+(.*)$/.exec(line);
    if (bullet || num) { const ordered = !!num; if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; } list.items.push((bullet ?? num)![1]); return; }
    flush();
    if (head) blocks.push(<h4 key={"h" + n}>{inline(head[1].replace(/\*\*/g, ""), "h" + n)}</h4>);
    else if (line.trim()) blocks.push(<p key={"p" + n}>{inline(line, "p" + n)}</p>);
  });
  flush();
  return <div className="as-text">{blocks}</div>;
}

// ------------------------------------------------------------------ cards
function TourCards({ items, ask }: { items: any[]; ask: (t: string) => void }) {
  return (
    <div className="as-grid">
      {items.slice(0, 6).map((t) => (
        <article key={t.code} className="as-tile">
          <div className="img" style={t.imageUrl ? { backgroundImage: `url(${t.imageUrl})` } : undefined}><span>{t.days} days</span></div>
          <div className="body">
            <small>{t.destinationName}</small>
            <b>{t.title}</b>
            <span className="muted">{t.slogan}</span>
            <div className="row-end"><span className="price">from {money(t.fromPrice ?? t.basePrice ?? t.price)}</span>
              <button className="btn small" onClick={() => ask(`Show me dates and details for ${t.title} (${t.code})`)}>Dates & details</button></div>
          </div>
        </article>))}
    </div>
  );
}

function TourCard({ d, ask }: { d: any; ask: (t: string) => void }) {
  const t = d.tour ?? {};
  const book = useContext(BookCtx);
  return (
    <div className="as-tour">
      <div className="img" style={t.imageUrl ? { backgroundImage: `url(${t.imageUrl})` } : undefined} />
      <div className="body">
        <small>{t.destinationName} · {t.days} days</small>
        <b>{t.title}</b>
        <p className="muted">{t.summary}</p>
        <div className="as-deps">
          {(d.departures ?? []).slice(0, 6).map((x: any) => (
            <button key={x.departureId} disabled={x.seatsLeft < 1} onClick={() => book ? book(`Book ${t.title}, ${day(x.departureDate)}, 2 travelers`, { kind: "Tour", code: t.code, departure_id: x.departureId, travelers: 2 }) : ask(`Book ${t.title} (${t.code}) departure ${x.departureId} for 2 travelers`)}>
              <span>{day(x.departureDate)}</span><b>{money(x.price)}</b><small>{x.seatsLeft > 0 ? `${x.seatsLeft} seats` : "Full"}</small>
            </button>))}
        </div>
      </div>
    </div>
  );
}

function ServiceCards({ d, ask }: { d: any; ask: (t: string) => void }) {
  const kind: string = d.kind;
  const book = useContext(BookCtx);
  return (
    <div className="as-list">
      {(d.items ?? []).slice(0, 6).map((s: any) => (
        <article key={s.code} className="as-row">
          <div className="img" style={s.imageUrl ? { backgroundImage: `url(${s.imageUrl})` } : undefined} />
          <div className="mid">
            <b>{s.name}</b>
            <small>
              {kind === "Hotel" ? `${s.fromCity ?? ""} · ${day(d.date)} – ${day(d.endDate)}` : `${s.fromName ?? s.fromCity ?? ""} → ${s.toName ?? s.toCity ?? ""}${s.departTime ? ` · ${String(s.departTime).slice(0, 5)}` : ""}${s.durationMin ? ` · ${Math.round(s.durationMin / 6) / 10} h` : ""}`}
              {s.rating ? ` · ★ ${s.rating}` : ""}
            </small>
            {s.features && <span className="chips">{String(s.features).split(",").slice(0, 3).map((f: string) => <i key={f}>{f}</i>)}</span>}
          </div>
          <div className="end">
            <span className="price">{money(s.totalPrice)}</span>
            <small>{s.available > 0 ? `${s.available} left` : "Sold out"}</small>
            <button className="btn primary small" disabled={!s.available} onClick={() => book ? book(`Book ${s.name}, ${day(d.date)}${kind === "Hotel" ? ` – ${day(d.endDate)}` : ""}, ${d.travelers} travelers`, { kind, code: s.code, date: d.date, end_date: d.endDate, travelers: Number(d.travelers) || 1 }) : ask(`Book ${s.name} (${s.code}) on ${d.date}`)}>Book this</button>
          </div>
        </article>))}
    </div>
  );
}

function CompareCard({ rows }: { rows: any[] }) {
  const keys: [string, string, (r: any) => ReactNode][] = [
    ["Destination", "destinationName", (r) => r.destinationName], ["Days", "days", (r) => r.days],
    ["From", "price", (r) => money(r.fromPrice ?? r.minPrice ?? r.basePrice)], ["Next departure", "next", (r) => day(r.nextDeparture ?? r.nextDepartureDate)],
    ["Seats left", "seats", (r) => r.seatsLeft ?? r.totalSeatsLeft ?? "—"], ["Rating", "rating", (r) => (r.rating ? `★ ${r.rating}` : "—")],
  ];
  return (
    <div className="as-compare"><table>
      <thead><tr><th />{rows.map((r) => <th key={r.code}>{r.title}</th>)}</tr></thead>
      <tbody>{keys.map(([label, k, f]) => <tr key={k}><th>{label}</th>{rows.map((r) => <td key={r.code}>{(f(r) as ReactNode) ?? "—"}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

/** A booking the assistant prepared. Only the traveler can pay or cancel. */
export function BookingCard({ initial, onChange }: { initial: Reservation; onChange?: (r: Reservation) => void }) {
  const [r, setR] = useState(initial);
  const a = useAction();
  const toast = useToast();
  const pct = r.depositPercent ?? 30;
  const deposit = Math.round((r.total * pct) / 100);
  const [left, setLeft] = useState(() => Math.max(0, utc(r.expiresAtUtc) - Date.now()));
  useEffect(() => { if (r.status !== "AwaitingConfirmation") return; const t = setInterval(() => setLeft(Math.max(0, utc(r.expiresAtUtc) - Date.now())), 1000); return () => clearInterval(t); }, [r.status, r.expiresAtUtc]);
  const act = async (fn: () => Promise<Reservation>, msg: string) => { const x = await a.run(fn, msg); if (x) { const next = { ...x, depositPercent: pct }; setR(next); onChange?.(next); } };
  const pay = (mode: string) => act(() => post<Reservation>(`/my/bookings/${r.reservationId}/pay`, { mode }), mode === "Deposit" ? "Deposit paid" : "Paid in full");
  const expired = r.status === "AwaitingConfirmation" && left <= 0;
  return (
    <div className={`as-booking s-${r.status}`} data-testid={`booking-${r.ref}`}>
      <div className="img" style={r.imageUrl ? { backgroundImage: `url(${r.imageUrl})` } : undefined}><span className={`pill ${statusTone(r.status)}`}>{expired ? "Expired" : STATUS_LABEL[r.status] ?? r.status}</span></div>
      <div className="body">
        <small><Icon name={KIND_ICON[r.kind] ?? "ticket"} size={14} /> {r.kind} · {r.ref}</small>
        <b>{r.itemName}</b>
        <dl>
          <div><dt>{r.kind === "Hotel" ? "Stay" : "Date"}</dt><dd>{day(r.startDate)}{r.endDate ? ` – ${day(r.endDate)}` : ""}</dd></div>
          <div><dt>Travelers</dt><dd>{r.travelers}{r.units > 1 ? ` · ${r.units} ${r.kind === "Hotel" ? "rooms" : "units"}` : ""}</dd></div>
          <div><dt>Total</dt><dd className="price">{money(r.total, r.currency)}</dd></div>
          {r.paidAmount > 0 && <div><dt>Paid</dt><dd>{money(r.paidAmount, r.currency)}{r.balance > 0 ? ` · ${money(r.balance, r.currency)} due` : ""}</dd></div>}
        </dl>
        {a.error ? <div className="alert error" role="alert">{a.error instanceof ApiError ? (Object.values(a.error.errors ?? {})[0]?.[0] ?? a.error.message) : "Something went wrong. Try again."}</div> : null}
        {r.status === "AwaitingConfirmation" && !expired && (
          <>
            <div className="as-pay">
              <button className="btn primary" disabled={a.busy} onClick={() => pay("Full")} data-testid="pay-full">Pay {money(r.total, r.currency)} now</button>
              <button className="btn" disabled={a.busy} onClick={() => pay("Deposit")} data-testid="pay-deposit">Pay {pct}% deposit · {money(deposit, r.currency)}</button>
              <button className="btn subtle" disabled={a.busy} onClick={() => act(() => post<Reservation>(`/my/bookings/${r.reservationId}/cancel`), "Booking released")}>Not now</button>
            </div>
            <small className="muted"><Icon name="lock" size={12} /> Price held for {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")} · test payment, no real charge</small>
          </>
        )}
        {expired && <small className="muted">The held price expired. Ask the assistant for a fresh quote.</small>}
        {r.status === "PartiallyPaid" && <div className="as-pay"><button className="btn primary" disabled={a.busy} onClick={() => pay("Balance")} data-testid="pay-balance">Pay balance {money(r.balance, r.currency)}</button>
          <button className="btn subtle" disabled={a.busy} onClick={() => { if (confirm("Cancel this booking?")) act(() => post<Reservation>(`/my/bookings/${r.reservationId}/cancel`), "Booking cancelled"); }}>Cancel booking</button></div>}
        {r.status === "Confirmed" && <div className="alert ok as-ok"><Icon name="check" size={16} /> Booked and paid. Reference <b>{r.ref}</b>{r.paymentRef ? ` · payment ${r.paymentRef}` : ""}. <button className="link" onClick={() => toast("A confirmation was added to My bookings.", "ok")}>Details in My bookings</button></div>}
      </div>
    </div>
  );
}

function BookingsCard({ rows }: { rows: Reservation[] }) {
  if (!rows.length) return <div className="as-empty"><Icon name="ticket" /> No bookings yet. Ask me to find something and I will prepare it for you.</div>;
  return (
    <div className="as-mini">
      {rows.slice(0, 5).map((r) => <div key={r.ref}><Icon name={KIND_ICON[r.kind] ?? "ticket"} size={16} /><span><b>{r.itemName}</b><small>{r.ref} · {day(r.startDate)}</small></span><span className={`pill ${statusTone(r.status)}`}>{STATUS_LABEL[r.status] ?? r.status}</span></div>)}
      <Link href="/my/bookings" className="more">Open My bookings →</Link>
    </div>
  );
}

/** Shown when a visitor asks to book or see bookings: sign in and come straight back to this conversation. */
function SignInCard() {
  return (
    <div className="as-signin-card">
      <Icon name="lock" size={18} />
      <span><b>Sign in to book and see your bookings</b><small>Free account. Your conversation stays here.</small></span>
      <div><Link className="btn primary small" href="/login?next=/assistant">Sign in</Link><Link className="btn small" href="/register">Create account</Link></div>
    </div>
  );
}

function CardView({ card, ask }: { card: Card; ask: (t: string) => void }) {
  switch (card.type) {
    case "tours": return <TourCards items={card.data ?? []} ask={ask} />;
    case "tour": return <TourCard d={card.data} ask={ask} />;
    case "services": return <ServiceCards d={card.data} ask={ask} />;
    case "compare": return <CompareCard rows={card.data ?? []} />;
    case "booking": return <BookingCard initial={card.data} />;
    case "bookings": return <BookingsCard rows={card.data ?? []} />;
    case "signin": return <SignInCard />;
    default: return null;
  }
}

// ------------------------------------------------------------------ chat page
function loadChat(): Msg[] { try { return JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? "[]"); } catch { return []; } }
function saveChat(m: Msg[]) { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(m.slice(-30))); } catch { /* full */ } }

export function AssistantPage() {
  const { status, me, has } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);
  const signedIn = status === "authenticated" && has("Assistant.Use");
  const canUse = status !== "loading";   // visitors can chat too; booking asks them to sign in
  const router = useRouter();

  useEffect(() => { setMsgs(loadChat()); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setError(null); setInput("");
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next); saveChat(next); setBusy(true);
    try {
      const r = await post<{ reply: string; cards: Card[]; aiAvailable: boolean; notice?: string | null }>("/assistant/chat", { messages: next.map((m) => ({ role: m.role, content: m.content })) });
      const done: Msg[] = [...next, { role: "assistant", content: r.reply, cards: r.cards, notice: r.notice, ai: r.aiAvailable }];
      setMsgs(done); saveChat(done);
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 0 ? "You seem to be offline. Check your connection and try again." : e.message) : "The assistant could not answer. Try again.");
      setMsgs(msgs); setInput(t); saveChat(msgs);
    } finally { setBusy(false); setTimeout(() => box.current?.focus(), 0); }
  };

  const book: BookFn = async (label, input) => {
    if (busy) return;
    if (!signedIn) { router.push("/login?next=/assistant"); return; }
    setError(null);
    const next: Msg[] = [...msgs, { role: "user", content: label }];
    setMsgs(next); saveChat(next); setBusy(true);
    try {
      const r = await post<{ reply: string; cards: Card[] }>("/assistant/prepare", input);
      const done: Msg[] = [...next, { role: "assistant", content: r.reply, cards: r.cards, ai: true }];
      setMsgs(done); saveChat(done);
    } catch (e) {
      const msg = e instanceof ApiError ? (Object.values(e.errors ?? {})[0]?.[0] ?? e.message) : "That option could not be prepared. Try again.";
      const done: Msg[] = [...next, { role: "assistant", content: msg, ai: true }];
      setMsgs(done); saveChat(done);
    } finally { setBusy(false); }
  };

  // a question typed on the home page starts the conversation
  useEffect(() => {
    if (!canUse || started.current) return;
    started.current = true;
    try { const p = sessionStorage.getItem(PROMPT_KEY); if (p) { sessionStorage.removeItem(PROMPT_KEY); send(p); } } catch { /* ignore */ }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const first = me?.user.displayName.split(" ")[0];
  return (
    <div className="as-page">
      <aside className="as-side">
        <div className="as-side-in">
          <p className="as-kicker"><Icon name="sparkle" size={14} /> AI Travel</p>
          <h2>Your AI travel assistant</h2>
          <p className="muted">Plans, live prices and bookings across tours, hotels, flights, buses and taxis in Taiwan.</p>
          <ul className="as-can">
            <li><Icon name="map" size={16} /> Plan day-by-day trips</li>
            <li><Icon name="scale" size={16} /> Compare options side by side</li>
            <li><Icon name="ticket" size={16} /> Prepare bookings you confirm</li>
            <li><Icon name="shield" size={16} /> You approve every payment</li>
          </ul>
          {signedIn && <div className="as-side-links"><Link href="/my/bookings"><Icon name="ticket" size={16} /> My bookings</Link><Link href="/my/trips"><Icon name="calendar" size={16} /> Trip plans</Link></div>}
          {msgs.length > 0 && <button className="btn subtle small" onClick={() => { setMsgs([]); saveChat([]); setError(null); }} data-testid="chat-new"><Icon name="plus" size={14} /> New conversation</button>}
        </div>
      </aside>
      <section className="as-main" aria-label="Conversation">
        <BookCtx.Provider value={book}>
        <div className="as-thread" data-testid="chat-thread">
          {msgs.length === 0 && (
            <div className="as-welcome">
              <div className="orb" aria-hidden="true"><Icon name="sparkle" size={30} /></div>
              <h1>{first ? `Hi ${first}, where to next?` : "Where do you want to go?"}</h1>
              <p className="muted">Ask in your own words. I search live tours, hotels, flights, buses and taxis, compare them, and prepare a booking for you to confirm.</p>
              <div className="as-suggest">{SUGGESTIONS.map((s) => <button key={s.text} onClick={() => (canUse ? send(s.text) : undefined)} disabled={!canUse}><Icon name={s.icon} size={16} />{s.text}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`as-msg ${m.role}`}>
              {m.role === "assistant" && <span className="as-ava" aria-hidden="true"><Icon name="sparkle" size={16} /></span>}
              <div className="as-bubble">
                {m.role === "user" ? <p>{m.content}</p> : <RichText text={m.content} />}
                {m.notice && <p className="as-note" data-testid="chat-note"><Icon name="info" size={14} /> Showing live search results. Add a city, dates and number of travelers to narrow them down.</p>}
                {m.cards?.map((c, j) => <CardView key={j} card={c} ask={send} />)}
              </div>
            </div>
          ))}
          {busy && <div className="as-msg assistant"><span className="as-ava"><Icon name="sparkle" size={16} /></span><div className="as-bubble as-typing"><i /><i /><i /><span>Searching live options…</span></div></div>}
          {error && <div className="alert error" role="alert" data-testid="chat-error">{error} <button className="link" onClick={() => send(input)}>Try again</button></div>}
          <div ref={end} />
        </div>
        </BookCtx.Provider>
        {!signedIn && status === "anonymous" && <p className="as-guest"><Icon name="info" size={14} /> You are chatting as a guest. <Link href="/login?next=/assistant">Sign in</Link> to book and keep your trips.</p>}
        {status === "loading" ? null : canUse ? (
          <form className="as-compose" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <textarea ref={box} value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={2000} placeholder="Ask about a trip, a hotel, a flight… or say “show my bookings”"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} aria-label="Message" data-testid="chat-input" />
            <button className="btn primary" disabled={busy || !input.trim()} aria-label="Send" data-testid="chat-send"><Icon name="send" size={18} /></button>
          </form>
        ) : (
          <div className="as-signin">
            <b>Sign in to chat with your assistant</b>
            <span className="muted">It is free. Your conversations and bookings stay private to your account.</span>
            <div><Link className="btn primary" href="/login?next=/assistant">Sign in</Link><Link className="btn" href="/register">Create an account</Link></div>
          </div>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ my bookings
export function MyBookingsPage() {
  const list = useAsync(() => get<Reservation[]>("/my/bookings"), []);
  const pct = Number(useSetting("Assistant.DepositPercent", "30")) || 30;
  const [tab, setTab] = useState<"open" | "all">("open");
  return (
    <>
      <PageHeader tagline="Your travel" title="My bookings" lead="Everything you booked with the assistant. Pay a balance, see references, or release a booking you no longer need."
        actions={<Link className="btn primary" href="/assistant"><Icon name="sparkle" size={16} /> Ask the assistant</Link>} />
      <div className="seg" role="tablist">{(["open", "all"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "open" ? "Upcoming" : "All bookings"}</button>)}</div>
      <Async state={list}>{(rows) => {
        const shown = rows.filter((r) => tab === "all" || (r.status !== "Cancelled" && new Date(r.startDate) >= new Date(new Date().toDateString())));
        return shown.length === 0
          ? <div className="as-empty big"><Icon name="ticket" size={28} /><b>No bookings here yet</b><span className="muted">Tell the assistant what you need, for example “a hotel in Tainan next weekend”.</span><Link className="btn primary" href="/assistant">Start planning</Link></div>
          : <div className="as-bookings">{shown.map((r) => <BookingCard key={r.ref + r.status + r.paidAmount} initial={{ ...r, depositPercent: pct }} onChange={() => list.reload()} />)}</div>;
      }}</Async>
    </>
  );
}

// ------------------------------------------------------------------ admin: assistant bookings
export function AdminReservationsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const list = useAsync(() => get<Reservation[]>("/aiops/reservations", { status: statusFilter }), [statusFilter]);
  return (
    <>
      <PageHeader tagline="Copilot" title="Assistant bookings" lead="Bookings travelers prepared with the AI assistant and confirmed themselves. Deposits, balances and cancellations update here as they happen." />
      <div className="toolbar"><SelectInput label="Status" value={statusFilter} onChange={setStatusFilter} placeholder="Any"
        options={["AwaitingConfirmation", "PartiallyPaid", "Confirmed", "Cancelled"].map((s) => ({ value: s, label: STATUS_LABEL[s] }))} testId="res-status" /></div>
      <Async state={list}>{(rows) => (
        rows.length === 0 ? <div className="as-empty big"><Icon name="ticket" size={28} /><b>No assistant bookings yet</b><span className="muted">Bookings appear here as soon as a traveler confirms one.</span></div> : <DataTable rows={rows} rowKey={(r) => r.ref} testId="reservations"
          columns={[
            { key: "ref", header: "Reference", render: (r) => <b>{r.ref}</b> },
            { key: "who", header: "Traveler", render: (r) => <span>{r.travelerName}<br /><small className="muted">{r.travelerEmail}</small></span> },
            { key: "item", header: "Booking", render: (r) => <span><Icon name={KIND_ICON[r.kind] ?? "ticket"} size={14} /> {r.itemName}<br /><small className="muted">{day(r.startDate)}{r.endDate ? ` – ${day(r.endDate)}` : ""} · {r.travelers} pax</small></span> },
            { key: "total", header: "Total", render: (r) => money(r.total, r.currency) },
            { key: "paid", header: "Paid", render: (r) => money(r.paidAmount, r.currency) },
            { key: "status", header: "Status", render: (r) => <span className={`pill ${statusTone(r.status)}`}>{STATUS_LABEL[r.status] ?? r.status}</span> },
          ]} />
      )}</Async>
    </>
  );
}

// ------------------------------------------------------------------ home
interface Showcase { regions: { regionId: number; code: string; name: string; imageUrl?: string | null; placeCount: number; templateCount: number }[] }

export function CopilotHome() {
  const router = useRouter();
  const { status, has } = useAuth();
  const [q, setQ] = useState("");
  const show = useAsync(() => get<Showcase>("/public/showcase"), []);
  const brand = useSetting("Ui.BrandName", "Sanpu AI Travel");
  const start = (text: string) => {
    const t = text.trim();
    try { if (t) sessionStorage.setItem(PROMPT_KEY, t); } catch { /* ignore */ }
    router.push("/assistant");
  };
  return (
    <div className="cp-home">
      <section className="cp-hero" data-testid="hero">
        <div className="cp-aurora" aria-hidden="true"><i /><i /><i /></div>
        <div className="cp-hero-in">
          <div className="cp-copy">
            <p className="cp-kicker"><Icon name="sparkle" size={14} /> AI travel assistant for Taiwan</p>
            <h1>Tell it the trip.<br /><span>It plans, compares and books.</span></h1>
            <p className="cp-lead">{brand} searches live tours, hotels, flights, buses and taxis, builds a day-by-day plan around your budget, and prepares the booking. You just confirm.</p>
            <form className="cp-ask" onSubmit={(e) => { e.preventDefault(); start(q); }}>
              <Icon name="sparkle" size={18} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 3 days in Hualien for 2, under TWD 25,000" aria-label="Describe your trip" data-testid="home-ask" />
              <button className="btn gold" data-testid="home-ask-go">Plan it</button>
            </form>
            <div className="cp-chips">{SUGGESTIONS.slice(0, 4).map((s) => <button key={s.text} onClick={() => start(s.text)}>{s.text}</button>)}</div>
          </div>
          <div className="cp-demo" aria-hidden="true">
            <div className="cp-chat">
              <div className="u">Find a hotel in Tainan for 2 nights from Friday, and a bus there from Taipei</div>
              <div className="a"><b>2 good matches</b> for Fri–Sun. The Old Town Inn is closest to the food streets.</div>
              <div className="opt"><span className="ph" style={{ backgroundImage: "url(/images/photos/tainan.jpg)" }} /><span><b>Old Town Inn · Twin</b><small>★ 4.7 · breakfast</small></span><em>TWD 5,980</em></div>
              <div className="opt"><span className="ph" style={{ backgroundImage: "url(/images/photos/bus.jpg)" }} /><span><b>Express bus 08:10</b><small>Taipei → Tainan · 4 h 20</small></span><em>TWD 1,140</em></div>
              <div className="ok"><Icon name="check" size={14} /> Booking ready · Pay deposit or in full</div>
            </div>
          </div>
        </div>
      </section>

      <section className="cp-band">
        <div className="cp-wrap">
          <p className="cp-eyebrow">What you can do</p>
          <h2>One assistant for the whole trip</h2>
          <div className="cp-caps">
            {[
              ["map", "Plan", "A day-by-day outline from real tours and transport, sized to your days, pace and budget."],
              ["scale", "Compare", "Two or three tours side by side: price, days, seats left and next departures."],
              ["building", "Find stays & rides", "Live hotel rooms, domestic flights, express buses and airport taxis with total prices."],
              ["ticket", "Book & pay", "The assistant prepares the booking at the live price; you pay a deposit or in full."],
              ["search", "Check bookings", "Ask “what did I book for December?” and get every reference, payment and balance."],
              ["shield", "Disruption recovery", "When weather or a supplier changes plans, the copilot drafts a fix and a person approves it."],
            ].map(([icon, title, text]) => <div key={title} className="cp-cap"><span><Icon name={icon} size={20} /></span><b>{title}</b><p>{text}</p></div>)}
          </div>
        </div>
      </section>

      <section className="cp-band alt">
        <div className="cp-wrap cp-how">
          <div>
            <p className="cp-eyebrow">How it works</p>
            <h2>AI does the legwork. You stay in control.</h2>
            <p className="muted">Every price and seat comes from our live booking system at the moment you ask. Nothing is paid until you press the button.</p>
          </div>
          <ol>
            <li><b>Ask</b><span>Describe the trip in your own words.</span></li>
            <li><b>Compare</b><span>See options with real prices and availability.</span></li>
            <li><b>Confirm</b><span>Review the prepared booking and pay a deposit or in full.</span></li>
            <li><b>Relax</b><span>Automation watches your trip and proposes fixes if plans change.</span></li>
          </ol>
        </div>
      </section>

      <section className="cp-band">
        <div className="cp-wrap">
          <p className="cp-eyebrow">Where it plans</p>
          <h2>Start with a region</h2>
          <Async state={show}>{(d) => (
            <div className="cp-regions">{d.regions.map((r) => (
              <button key={r.code} className="cp-region" style={r.imageUrl ? { backgroundImage: `url(${r.imageUrl})` } : undefined} onClick={() => start(`Plan a trip to ${r.name} for 2 people`)}>
                <span><b>{r.name}</b><small>{r.placeCount > 0 ? `${r.placeCount} places · ` : ""}Plan with AI →</small></span>
              </button>))}</div>
          )}</Async>
        </div>
      </section>

      <section className="cp-cta">
        <div className="cp-wrap">
          <h2>Your next trip is one message away</h2>
          <div>{status === "authenticated" ? <Link className="btn gold lg" href="/assistant">Open the assistant</Link>
            : <><Link className="btn gold lg" href="/register">Create a free account</Link><Link className="btn glass lg" href="/login?next=/assistant">Sign in</Link></>}</div>
        </div>
      </section>
    </div>
  );
}

