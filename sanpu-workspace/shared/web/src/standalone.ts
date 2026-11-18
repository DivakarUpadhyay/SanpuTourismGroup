"use client";

/* Standalone mode (NEXT_PUBLIC_STANDALONE=1): the site runs with no API server. Every GET is answered from a snapshot
   captured from the real API (public/snapshot/<app>.json, made by tools/snapshot.mjs), per signed-in account.
   Dates in the snapshot are shifted forward by the days since capture, so calendars and departures stay current.
   A few harmless actions are simulated (coupon check, contact, newsletter, feedback); anything that would change
   shared data returns a clear "not saved" message. */
import { ApiError, currentRealm, type Realm } from "./api";
import { createReset, decideStaffRequest, idOf, localUsers, registerCustomer, requestStaffAccess, resetPassword, setPassword, verify, type LocalUser, type SnapshotUser } from "./standalone-auth";

/* NEXT_PUBLIC_STANDALONE: "1" = always the preview; "auto" = live API, falling back to the preview while the API is unreachable;
   anything else = live only (local development). */
const MODE = process.env.NEXT_PUBLIC_STANDALONE ?? "";
let offline = MODE === "1";
const OFFLINE_KEY = "sanpu.offline.until";
if (MODE === "auto" && typeof window !== "undefined") { try { offline = Number(sessionStorage.getItem(OFFLINE_KEY) ?? 0) > Date.now(); } catch { /* ignore */ } }
/** True while answers come from the bundled preview. */
export const isStandalone = () => offline;
export const STANDALONE_POSSIBLE = MODE === "1" || MODE === "auto";
/** Called when the live API cannot be reached: switch this tab to the preview for 30 seconds, then try live again. */
export function goOffline() {
  if (MODE !== "auto") return false;
  offline = true;
  try { sessionStorage.setItem(OFFLINE_KEY, String(Date.now() + 30_000)); } catch { /* ignore */ }
  setTimeout(() => { offline = false; }, 30_000);
  return true;
}
const APP = process.env.NEXT_PUBLIC_COOKIE_PREFIX ?? "app";
const roleKey = (realm: Realm) => `sanpu.sa.${APP}.${realm}.account`;

interface Snapshot {
  capturedAt: string;
  users: SnapshotUser[];
  responses: Record<string, Record<string, unknown>>;   // account ("anon" or email) -> key -> body
}
let snap: Snapshot | null = null;
let loading: Promise<Snapshot> | null = null;
const load = () => (loading ??= fetch(`/snapshot/${APP}.json`, { cache: "force-cache" }).then((r) => r.json() as Promise<Snapshot>).then((s) => (snap = s)));

export const standaloneAccount = (realm: Realm = currentRealm()) => { try { return localStorage.getItem(roleKey(realm)); } catch { return null; } };
const setAccount = (email: string | null, realm: Realm = currentRealm()) => { try { if (email) localStorage.setItem(roleKey(realm), email); else localStorage.removeItem(roleKey(realm)); } catch { /* ignore */ } };
export async function standaloneUsers() { return (await load()).users; }

// ---- accounts made in this browser borrow the screens of a similar account in the snapshot (same role), minus personal data ----
const norm = (e: string) => e.trim().toLowerCase();
function personaOf(s: Snapshot, account: string): { pool: string; local?: LocalUser } {
  if (account === "anon" || s.users.some((u) => norm(u.email) === norm(account))) return { pool: account };
  const local = localUsers().find((u) => norm(u.email) === norm(account) && u.status === "Active");
  if (!local) return { pool: "anon" };
  const like = local.userType === "Customer"
    ? s.users.find((u) => u.userType === "Customer")
    : s.users.find((u) => u.userType === "Staff" && u.roles.includes(local.roleKey ?? "")) ?? s.users.find((u) => u.userType === "Staff" && !u.roles.includes("system_admin"));
  return { pool: like?.email ?? "anon", local };
}
const PERSONAL = /^\/(my|account)\//;

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

const notSaved = () => new ApiError(503, "offline_only", "This online preview does not save changes. Booking, paying and editing open during live sessions; everything else works as usual.");

/** Answers an API call from the snapshot (or a small simulation). */
export async function standaloneApi<T>(method: string, path: string, qs: URLSearchParams, body: unknown): Promise<T> {
  const s = await load();
  const signedIn = standaloneAccount() ?? "anon";
  const { pool: account, local } = personaOf(s, signedIn);
  const days = offsetDays(s);
  const b = (body instanceof FormData ? {} : body ?? {}) as Record<string, unknown>;
  if (method === "GET") {
    if (path === "/ops/media") return [] as T;
    if (path === "/auth/me" && account === "anon") { setAccount(null); throw new ApiError(401, "unauthorized", "Please sign in."); }
    if (path === "/auth/staff-roles") { const r = lookup(s, "anon", path, qs); if (r) return r as T; }
    if (path === "/admin/users/access-requests") return localUsers().filter((u) => u.userType === "Staff" && u.status !== "Active").map((u) => ({
      userId: idOf(u), email: u.email, displayName: u.displayName, approvalStatus: u.status, requestNote: u.note ?? null, requestedAtUtc: u.createdAtUtc, requestedRoleKey: u.requestedRoleKey,
      requestedRoleName: (lookup(s, "anon", "/auth/staff-roles", new URLSearchParams()) as { roleKey: string; roleName: string }[] | undefined)?.find((r) => r.roleKey === u.requestedRoleKey)?.roleName ?? u.requestedRoleKey })) as T;
    if (local) {   // an account made in this browser: own identity, no borrowed personal data
      if (path === "/auth/me") {
        const base = lookup(s, account, path, qs) as Record<string, unknown>;
        return { ...base, user: { id: idOf(local), email: local.email, displayName: local.displayName, userType: local.userType, mustChangePassword: false }, phoneMasked: null, lastLoginAtUtc: null } as T;
      }
      if (PERSONAL.test(path)) { if (/\/\d+$/.test(path)) throw new ApiError(404, "not_found", "Not found."); return [] as T; }
    }
    const hit = lookup(s, account, path, qs);
    if (hit === undefined) throw new ApiError(503, "offline_only", "This online preview shows our tours, travel options and dashboards. Booking, paying and saving open during live sessions.");
    return shift(hit, days) as T;
  }
  // ---- simulated actions ----
  if (path === "/auth/login" || path === "/auth/register") {
    if (path === "/auth/register" && currentRealm() !== "site") throw new ApiError(403, "wrong_portal", "Staff ask for access on the staff sign-up page.");
    const user = path === "/auth/register" ? await registerCustomer(s.users, b) : await verify(s.users, b.email, b.password);
    if (user.userType !== (currentRealm() === "admin" ? "Staff" : "Customer"))
      throw new ApiError(403, "wrong_portal", currentRealm() === "admin" ? "This sign-in is for staff. Customers sign in on the customer site." : "This sign-in is for customers. Staff sign in at /admin/login.");
    setAccount(user.email);
    return { accessToken: "standalone" } as T;
  }
  if (path === "/auth/logout" || path === "/auth/logout-all") { setAccount(null); return null as T; }
  if (path === "/auth/staff-request") {
    const roles = ((lookup(s, "anon", "/auth/staff-roles", new URLSearchParams()) ?? []) as { roleKey: string }[]).map((r) => r.roleKey);
    await requestStaffAccess(s.users, roles, b); return null as T;
  }
  if (/^\/admin\/users\/access-requests\/[^/]+$/.test(path)) { decideStaffRequest(path.split("/").pop()!, !!b.approve, b.roleKey as string | null); return null as T; }
  if (path === "/auth/forgot-password") return { previewLink: createReset(s.users, b.email) } as T;
  if (path === "/auth/reset-password") { await resetPassword(b.token, b.password); return null as T; }
  if (path === "/account/change-password" && signedIn !== "anon") {
    await verify(s.users, signedIn, b.currentPassword).catch(() => { throw new ApiError(422, "validation_failed", "Some fields are not valid.", { currentPassword: ["Current password is incorrect."] }); });
    await setPassword(signedIn, String(b.newPassword ?? "")); return null as T;
  }
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
export const standaloneRefresh = (realm: Realm = currentRealm()) => !!standaloneAccount(realm);
