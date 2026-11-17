"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, get, post, refreshSession, session } from "./api";

export interface AuthUser { id: string; email: string; displayName: string; userType: "Staff" | "Customer"; mustChangePassword: boolean }
export interface Me { user: AuthUser; permissions: string[]; roles: string[]; phoneMasked?: string | null; preferredLanguage: string; lastLoginAtUtc?: string | null }
export interface MenuNode { id: number; key: string; title: string; route?: string | null; icon?: string | null; isExternal: boolean; description?: string | null; children: MenuNode[] }

interface AuthState {
  status: "loading" | "anonymous" | "authenticated";
  me: Me | null;
  has: (permission: string) => boolean;
  login: (email: string, password: string) => Promise<Me>;
  register: (email: string, displayName: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  reload: () => Promise<Me | null>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [me, setMe] = useState<Me | null>(null);

  const reload = useCallback(async () => {
    try {
      const m = await get<Me>("/auth/me");
      setMe(m); setStatus("authenticated");
      return m;
    } catch {
      session.set(null); setMe(null); setStatus("anonymous");
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (await refreshSession()) await reload();
      else setStatus("anonymous");
    })();
    return session.onExpired(() => { setMe(null); setStatus("anonymous"); });
  }, [reload]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await post<{ accessToken: string }>("/auth/login", { email, password });
    session.set(r.accessToken);
    return (await reload())!;
  }, [reload]);

  const register = useCallback(async (email: string, displayName: string, password: string) => {
    const r = await post<{ accessToken: string }>("/auth/register", { email, displayName, password });
    session.set(r.accessToken);
    return (await reload())!;
  }, [reload]);

  const logout = useCallback(async () => {
    try { await api("/auth/logout", { method: "POST", body: {} }); } catch { /* already signed out */ }
    session.set(null); setMe(null); setStatus("anonymous");
  }, []);

  const value = useMemo<AuthState>(() => ({
    status, me, login, register, logout, reload,
    has: (p) => !!me?.permissions.includes(p)
  }), [status, me, login, register, logout, reload]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Flattens the permitted menu tree into routes. A route allows its sub-paths, except the "/admin" root, which only allows itself. */
export function allowedRoutes(tree: MenuNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: MenuNode[]) => nodes.forEach((n) => { if (n.route && !n.isExternal) out.push(n.route); walk(n.children); });
  walk(tree);
  return out;
}

export function isRouteAllowed(path: string, routes: string[]) {
  return routes.some((r) => path === r || (r !== "/admin" && r !== "/" && path.startsWith(r + "/")));
}
