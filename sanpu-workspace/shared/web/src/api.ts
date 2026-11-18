"use client";

import { STANDALONE_POSSIBLE, goOffline, isStandalone, standaloneApi, standaloneRefresh } from "./standalone";

/** Error shape of every API failure (RFC 7807 ProblemDetails + code + correlationId). */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public errors?: Record<string, string[]>, public correlationId?: string) {
    super(message);
  }
}

export type Query = Record<string, string | number | boolean | null | undefined>;

/** The admin panel (/admin/...) and the customer site are separate sessions: each has its own cookies on the server and
    its own token here, so a staff member and a customer can be signed in at the same time in one browser. */
export type Realm = "admin" | "site";
export const realmOf = (path: string): Realm => (path === "/admin" || path.startsWith("/admin/") ? "admin" : "site");
export const currentRealm = (): Realm => (typeof window === "undefined" ? "site" : realmOf(window.location.pathname));

// Access tokens live only in memory (never localStorage). On reload we get a new one from the realm's HttpOnly refresh cookie.
interface RealmState { token: string | null; refreshing: Promise<boolean> | null; failed: boolean }   // failed: cookie gone or revoked
const realms: Record<Realm, RealmState> = { admin: { token: null, refreshing: null, failed: false }, site: { token: null, refreshing: null, failed: false } };
const listeners = new Set<() => void>();

export const session = {
  get token() { return realms[currentRealm()].token; },
  set(token: string | null, realm: Realm = currentRealm()) { realms[realm].token = token; if (token) realms[realm].failed = false; },
  onExpired(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
};

const cookiePrefix = process.env.NEXT_PUBLIC_COOKIE_PREFIX ?? "sanpu";

function csrfToken(realm: Realm = currentRealm()): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.split("; ").find((c) => c.startsWith(`${cookiePrefix}_${realm}_csrf=`));
  return m ? decodeURIComponent(m.split("=")[1]) : "";
}

function url(path: string, query?: Query) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return `/api/v1${path}${s ? `?${s}` : ""}`;
}

async function parse(res: Response) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function toError(res: Response): Promise<ApiError> {
  const body = await parse(res);
  if (body && typeof body === "object") return new ApiError(res.status, body.code ?? "error", body.detail ?? body.title ?? "Request failed", body.errors, body.correlationId);
  return new ApiError(res.status, res.status >= 500 ? "server_error" : "error", res.status >= 500 ? "The server had a problem. Try again." : "Request failed");
}

/** Rotates the refresh cookie and stores a fresh access token. Concurrent callers share one request. */
export function refreshSession(realm: Realm = currentRealm()): Promise<boolean> {
  const r = realms[realm];
  if (isStandalone()) { r.token = standaloneRefresh(realm) ? "standalone" : null; return Promise.resolve(!!r.token); }
  if (!csrfToken(realm)) return Promise.resolve(false);   // never signed in here: nothing to refresh
  if (!r.refreshing) {
    r.refreshing = (async () => {
      try {
        const res = await fetch(url("/auth/refresh"), { method: "POST", headers: { "X-CSRF-Token": csrfToken(realm), "X-Session-Realm": realm }, credentials: "same-origin" });
        if (unreachable(res) && goOffline()) { r.token = standaloneRefresh(realm) ? "standalone" : null; return !!r.token; }
        if (!res.ok) { r.token = null; r.failed = true; return false; }
        const body = await res.json();
        r.token = body.accessToken; r.failed = false;
        return true;
      } catch { if (goOffline()) { r.token = standaloneRefresh(realm) ? "standalone" : null; return !!r.token; } r.token = null; return false; }
      finally { setTimeout(() => { r.refreshing = null; }, 0); }
    })();
  }
  return r.refreshing;
}

export interface RequestOptions { method?: string; body?: unknown; query?: Query; form?: FormData; signal?: AbortSignal; retry?: boolean }

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (isStandalone()) {   // no API server: answer from the bundled snapshot
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    return standaloneApi<T>(opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"), path, qs, opts.form ?? opts.body);
  }
  // After a reload, pages can ask for data before the session is restored (child effects run before the provider's).
  // Wait for the shared refresh instead of sending a request that is sure to get 401.
  const realm = currentRealm(), r = realms[realm];
  if (!r.token && !r.failed && !path.startsWith("/auth/") && csrfToken(realm)) await refreshSession(realm);
  const headers: Record<string, string> = { Accept: "application/json", "X-Session-Realm": realm };
  if (r.token) headers.Authorization = `Bearer ${r.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (path.startsWith("/auth/logout")) headers["X-CSRF-Token"] = csrfToken(realm);
  let res: Response;
  try {
    res = await fetch(url(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers, credentials: "same-origin", signal: opts.signal,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined)
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    if (opts.retry !== false && STANDALONE_POSSIBLE) { await pause(900); return api<T>(path, { ...opts, retry: false }); }   // one quiet retry first
    if (!(await liveHealthy()) && goOffline()) return api<T>(path, opts);   // live service really down: answer from the preview
    throw new ApiError(0, "network_error", "Cannot reach the server. Check your connection and try again.");
  }
  if (unreachable(res) && STANDALONE_POSSIBLE) {
    if (opts.retry !== false) { await pause(900); return api<T>(path, { ...opts, retry: false }); }
    if (!(await liveHealthy()) && goOffline()) return api<T>(path, opts);
  }
  if (res.status === 401 && opts.retry !== false && !path.startsWith("/auth/")) {
    if (await refreshSession(realm)) return api<T>(path, { ...opts, retry: false });
    listeners.forEach((l) => l());
  }
  if (!res.ok) throw await toError(res);
  return (await parse(res)) as T;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Two quick health checks; a single blip on the tunnel must not switch the site to the preview. */
async function liveHealthy() {
  for (let i = 0; i < 2; i++) {
    try { const r = await fetch(url("/public/settings"), { cache: "no-store" }); if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) return true; } catch { /* try again */ }
    await pause(1200);
  }
  return false;
}

/** The live service is down (tunnel closed, computer asleep): gateway errors or a non-API page instead of JSON. */
function unreachable(res: Response) {
  if ([502, 503, 504, 520, 521, 522, 523, 524, 530].includes(res.status)) return !(res.headers.get("content-type") ?? "").includes("problem+json");
  return res.status === 404 && !(res.headers.get("content-type") ?? "").includes("json");
}

export const get = <T>(path: string, query?: Query) => api<T>(path, { query });
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body ?? {} });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body: body ?? {} });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });

/** Random idempotency key for retry-safe writes (holds, payments). */
export const newKey = (prefix = "k") => `${prefix}-${crypto.randomUUID()}`;
