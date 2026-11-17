"use client";

/* Standalone mode (NEXT_PUBLIC_STANDALONE=1): the site runs with no API server. Every GET is answered from a snapshot
   captured from the real API (public/snapshot/<app>.json, made by tools/snapshot.mjs), per signed-in account.
   Dates in the snapshot are shifted forward by the days since capture, so calendars and departures stay current.
   A few harmless actions are simulated (coupon check, contact, newsletter, feedback); anything that would change
   shared data returns a clear "not saved" message. */
import { ApiError } from "./api";

export const STANDALONE = process.env.NEXT_PUBLIC_STANDALONE === "1";
const APP = process.env.NEXT_PUBLIC_COOKIE_PREFIX ?? "app";
const ROLE_KEY = `sanpu.sa.${APP}.account`;

interface Snapshot {
  capturedAt: string;
  users: { email: string; displayName: string; userType: string; roles: string[] }[];
  responses: Record<string, Record<string, unknown>>;   // account ("anon" or email) -> key -> body
}
let snap: Snapshot | null = null;
let loading: Promise<Snapshot> | null = null;
const load = () => (loading ??= fetch(`/snapshot/${APP}.json`, { cache: "force-cache" }).then((r) => r.json() as Promise<Snapshot>).then((s) => (snap = s)));

export const standaloneAccount = () => { try { return localStorage.getItem(ROLE_KEY); } catch { return null; } };
const setAccount = (email: string | null) => { try { if (email) localStorage.setItem(ROLE_KEY, email); else localStorage.removeItem(ROLE_KEY); } catch { /* ignore */ } };
export async function standaloneUsers() { return (await load()).users; }

// ---- dates: shift every ISO date by the days since capture ----
const DAY = 864e5;
const offsetDays = (s: Snapshot) => Math.max(0, Math.floor((Date.now() - Date.parse(s.capturedAt)) / DAY));
const ISO = /^(\d{4})-(\d{2})-(\d{2})(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;
function shift(v: unknown, days: number): unknown {
  if (!days) return v;
  if (typeof v === "string" && ISO.test(v)) {
    const d = new Date(v.length === 10 ? v + "T00:00:00Z" : v);
    d.setTime(d.getTime() + days * DAY);
    return v.length === 10 ? d.toISOString().slice(0, 10) : d.toISOString();
  }
  if (Array.isArray(v)) return v.map((x) => shift(x, days));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shift(x, days)]));
  return v;
}

// ---- keys: path + sorted query; lookups fall back to the same path with dates ignored, then any query ----
export const snapshotKey = (path: string, qs: URLSearchParams) => { const q = [...qs.entries()].sort(([a], [b]) => a.localeCompare(b)); return path + (q.length ? "?" + new URLSearchParams(q).toString() : ""); };
const DATE_PARAMS = new Set(["date", "endDate", "month", "from", "start", "end"]);
function lookup(s: Snapshot, account: string, path: string, qs: URLSearchParams) {
  const pools = [s.responses[account] ?? {}, s.responses.anon ?? {}];
  const days = offsetDays(s);
  // move requested dates back to the capture timeline before matching
  const back = new URLSearchParams([...qs.entries()].map(([k, v]) => [k, DATE_PARAMS.has(k) && /^\d{4}-\d{2}(-\d{2})?$/.test(v) ? (shift(v.length === 7 ? v + "-01" : v, -days) as string).slice(0, v.length) : v]));
  const noDates = new URLSearchParams([...qs.entries()].filter(([k]) => !DATE_PARAMS.has(k)));
  for (const pool of pools) {
    for (const key of [snapshotKey(path, back), snapshotKey(path, qs)]) if (key in pool) return pool[key];
    const loose = Object.keys(pool).find((k) => k.split("?")[0] === path && [...noDates.entries()].every(([a, b]) => new URLSearchParams(k.split("?")[1] ?? "").get(a) === b));
    if (loose) return pool[loose];
  }
  // a filter combination that was never recorded: show the same list unfiltered rather than an error
  for (const pool of pools) { const any = Object.keys(pool).find((k) => k.split("?")[0] === path); if (any) return pool[any]; }
  return undefined;
}

const notSaved = () => new ApiError(409, "not_saved", "This online version shows real content but does not save changes, so bookings, payments and edits are not kept. Browsing, sign-in and dashboards work as usual.");

/** Answers an API call from the snapshot (or a small simulation). */
export async function standaloneApi<T>(method: string, path: string, qs: URLSearchParams, body: unknown): Promise<T> {
  const s = await load();
  const account = standaloneAccount() ?? "anon";
  const days = offsetDays(s);
  const b = (body instanceof FormData ? {} : body ?? {}) as Record<string, unknown>;
  if (method === "GET") {
    if (path === "/ops/media") return [] as T;
    if (path === "/auth/me" && account === "anon") throw new ApiError(401, "unauthorized", "Please sign in.");
    const hit = lookup(s, account, path, qs);
    if (hit === undefined) throw new ApiError(404, "not_found", "This page has no saved content in the online version.");
    return shift(hit, days) as T;
  }
  // ---- simulated actions ----
  if (path === "/auth/login" || path === "/auth/register") {
    const email = String(b.email ?? "").toLowerCase();
    const user = s.users.find((u) => u.email.toLowerCase() === email) ?? (path === "/auth/register" ? s.users.find((u) => u.userType === "Customer") : undefined);
    if (!user) throw new ApiError(401, "invalid_credentials", "Use one of the accounts listed below to sign in to the online version.");
    setAccount(user.email);
    return { accessToken: "standalone" } as T;
  }
  if (path === "/auth/logout" || path === "/auth/logout-all") { setAccount(null); return null as T; }
  if (path === "/marketing/coupons/check") {
    const list = (lookup(s, "anon", "/marketing/coupons", new URLSearchParams()) ?? []) as { code: string; description: string; discountType: string; discountValue: number; maxDiscount?: number; minAmount: number; appliesTo: string }[];
    const code = String(b.code ?? "").trim().toUpperCase(), amount = Number(b.amount ?? 0), kind = String(b.kind ?? "");
    const c = list.find((x) => x.code === code);
    if (!c) throw new ApiError(422, "coupon_not_found", "That coupon code is not valid.");
    if (c.appliesTo !== "All" && c.appliesTo !== kind) throw new ApiError(422, "coupon_not_applicable", "This coupon cannot be used for this item.");
    if (amount < c.minAmount) throw new ApiError(422, "coupon_min_amount", "Your total is below the minimum for this coupon.");
    const d = Math.min(amount, c.discountType === "Percent" ? Math.min(Math.round(amount * c.discountValue / 100), c.maxDiscount ?? Infinity) : c.discountValue);
    return { code: c.code, description: c.description, discountAmount: d, totalAfter: amount - d } as T;
  }
  if (path === "/ops/media" && body instanceof FormData) {   // keep the picture in this browser so the form can show it
    const file = body.get("file") as File;
    const url = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(file); });
    return { url, fileName: file.name, duplicate: false } as T;
  }
  if (path === "/contact") return { contactRef: `CR-${String(Math.floor(Math.random() * 900000) + 100000)}`, createdAtUtc: new Date().toISOString() } as T;
  if (path === "/public/newsletter") return { message: "Thanks for subscribing. Watch your inbox for travel ideas and member deals." } as T;
  if (/^\/help\/\d+\/feedback$/.test(path) || /^\/marketing\/promotions\/\d+\/track$/.test(path) || /^\/discover\/tours\/[^/]+\/view$/.test(path)) return null as T;
  throw notSaved();
}

/** Standalone sessions: signed in whenever an account is remembered in this browser. */
export const standaloneRefresh = () => !!standaloneAccount();
