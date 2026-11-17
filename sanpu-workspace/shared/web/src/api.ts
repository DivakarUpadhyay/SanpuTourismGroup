"use client";

/** Error shape of every API failure (RFC 7807 ProblemDetails + code + correlationId). */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public errors?: Record<string, string[]>, public correlationId?: string) {
    super(message);
  }
}

export type Query = Record<string, string | number | boolean | null | undefined>;

// The access token lives only in memory (never localStorage). On reload we get a new one from the HttpOnly refresh cookie.
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let refreshFailed = false;   // set when the refresh cookie is gone or revoked; cleared when a new token arrives
const listeners = new Set<() => void>();

export const session = {
  get token() { return accessToken; },
  set(token: string | null) { accessToken = token; if (token) refreshFailed = false; },
  onExpired(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
};

const cookiePrefix = process.env.NEXT_PUBLIC_COOKIE_PREFIX ?? "sanpu";

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.split("; ").find((c) => c.startsWith(`${cookiePrefix}_csrf=`));
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
export function refreshSession(): Promise<boolean> {
  if (!csrfToken()) return Promise.resolve(false);   // never signed in on this browser: nothing to refresh
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(url("/auth/refresh"), { method: "POST", headers: { "X-CSRF-Token": csrfToken() }, credentials: "same-origin" });
        if (!res.ok) { accessToken = null; refreshFailed = true; return false; }
        const body = await res.json();
        accessToken = body.accessToken; refreshFailed = false;
        return true;
      } catch { accessToken = null; return false; }
      finally { setTimeout(() => { refreshing = null; }, 0); }
    })();
  }
  return refreshing;
}

export interface RequestOptions { method?: string; body?: unknown; query?: Query; form?: FormData; signal?: AbortSignal; retry?: boolean }

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  // After a reload, pages can ask for data before the session is restored (child effects run before the provider's).
  // Wait for the shared refresh instead of sending a request that is sure to get 401.
  if (!accessToken && !refreshFailed && !path.startsWith("/auth/") && csrfToken()) await refreshSession();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (path.startsWith("/auth/logout")) headers["X-CSRF-Token"] = csrfToken();
  let res: Response;
  try {
    res = await fetch(url(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers, credentials: "same-origin", signal: opts.signal,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined)
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network_error", "Cannot reach the server. Check your connection and try again.");
  }
  if (res.status === 401 && opts.retry !== false && !path.startsWith("/auth/")) {
    if (await refreshSession()) return api<T>(path, { ...opts, retry: false });
    listeners.forEach((l) => l());
  }
  if (!res.ok) throw await toError(res);
  return (await parse(res)) as T;
}

export const get = <T>(path: string, query?: Query) => api<T>(path, { query });
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body ?? {} });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body: body ?? {} });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });

/** Random idempotency key for retry-safe writes (holds, payments). */
export const newKey = (prefix = "k") => `${prefix}-${crypto.randomUUID()}`;
