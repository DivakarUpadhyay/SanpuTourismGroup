"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/* Clean URLs: pages never keep query strings in the address bar. Values that arrive in the URL (sign-in return
   path, booking choices, filters, payment results, one-time tokens) are moved into this tab's sessionStorage and
   the address is cleaned at once. A refresh restores them from the tab; nothing is shared between tabs or users. */
const key = (path: string) => `sanpu.page:${path}`;

/** Saves page state for the current tab (instead of writing it into the URL). */
export function savePageParams(values: Record<string, string | number | boolean | null | undefined>, path?: string) {
  const q = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== "") q.set(k, String(v)); });
  try { sessionStorage.setItem(key(path ?? location.pathname), q.toString()); } catch { /* storage unavailable: state lives only in memory */ }
}

/**
 * Renders children with the page's parameters once they are known (one tick after mount).
 * persist=false: use the values once (for example a payment result banner) and do not restore them on refresh.
 */
export function CleanParams({ children, persist = true }: { children: (p: URLSearchParams) => ReactNode; persist?: boolean }) {
  const path = usePathname();
  const [params, setParams] = useState<URLSearchParams | null>(null);
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search);
    let use = fromUrl;
    if (fromUrl.toString()) {
      try { if (persist) sessionStorage.setItem(key(path), fromUrl.toString()); else sessionStorage.removeItem(key(path)); } catch { /* ignore */ }
      window.history.replaceState(window.history.state, "", path + window.location.hash);
    } else if (persist) {
      try { use = new URLSearchParams(sessionStorage.getItem(key(path)) ?? ""); } catch { /* ignore */ }
    }
    setParams(use);
  }, [path, persist]);
  return params ? <>{children(params)}</> : null;
}
