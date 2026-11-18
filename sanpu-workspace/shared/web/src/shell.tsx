"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { get, post, realmOf, currentRealm } from "./api";
import { allowedRoutes, isRouteAllowed, useAuth, type MenuNode } from "./auth";
import { AuthProvider } from "./auth";
import { Icon } from "./icons";
import { BrandMark } from "./logo";
import { ErrorBox, Loading, ToastProvider, useAsync, AdminRoutesContext } from "./ui";

/** Public, non-secret settings (IsPublic) and content blocks from SQL. Changing them in admin updates the UI without a rebuild. */
interface PublicConfig { settings: Record<string, string>; content: { templateKey: string; locale: string; subject: string; body: string }[]; loaded?: boolean }
const ConfigContext = createContext<PublicConfig>({ settings: {}, content: [] });
export const usePublicConfig = () => useContext(ConfigContext);
export const useSetting = (key: string, fallback = "") => usePublicConfig().settings[key] ?? fallback;
export function useContent(key: string, locale = "en") {
  const { content } = usePublicConfig();
  return content.find((c) => c.templateKey === key && c.locale === locale) ?? content.find((c) => c.templateKey === key);
}

function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig>({ settings: {}, content: [] });
  useEffect(() => {
    Promise.all([get<Record<string, string>>("/public/settings"), get<PublicConfig["content"]>("/public/content")])
      .then(([settings, content]) => setConfig({ settings, content, loaded: true })).catch(() => setConfig((c) => ({ ...c, loaded: true })));   // page still renders with fallbacks
  }, []);
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  // admin and customer site keep separate sessions: crossing between them switches to that area's own sign-in
  const realm = realmOf(usePathname() ?? "/");
  return <ToastProvider><ConfigProvider><AuthProvider key={realm} realm={realm}>{children}</AuthProvider></ConfigProvider></ToastProvider>;
}

function useNavigation(area: "Admin" | "Customer") {
  const { status } = useAuth();
  return useAsync<MenuNode[]>(
    () => status === "authenticated" ? get<MenuNode[]>("/navigation/me", { area }) : status === "anonymous" && area === "Customer" ? get<MenuNode[]>("/navigation/public") : Promise.resolve([]),
    [status, area]);
}

function Brand({ href }: { href: string }) {
  const name = useSetting("Ui.BrandName", "Sanpu");
  return <Link href={href} className="brand" data-testid="brand"><BrandMark size={28} /><span className="brand-name">{name}</span></Link>;
}

const initials = (name?: string) => (name ?? "?").replace(/\(.*?\)/g, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

/** Sign-in page of the area the visitor is in. */
export const loginPath = () => (currentRealm() === "admin" ? "/admin/login" : "/login");

function UserMenu({ adminLink }: { adminLink?: boolean }) {
  const { status, me, logout } = useAuth();
  const router = useRouter();
  const admin = useNavigation("Admin");
  if (status === "loading") return null;
  if (status !== "authenticated") return <div className="user-menu"><Link className="btn small subtle hide-sm" href="/register" data-testid="nav-register">Create account</Link><Link className="btn small primary" href="/login" data-testid="nav-login">Sign in</Link></div>;
  return (
    <div className="user-menu">
      {adminLink && (admin.data?.length ?? 0) > 0 && <Link className="btn small subtle" href="/admin" data-testid="nav-admin"><Icon name="settings" size={16} /><span className="hide-sm">Admin</span></Link>}
      <span className="avatar" aria-hidden="true">{initials(me?.user.displayName)}</span>
      <Link className="user-chip" data-testid="user-name" title={`${me?.user.email} · My account`} href={currentRealm() === "admin" ? "/admin/account" : "/account"}>{me?.user.displayName}</Link>
      <button className="btn small subtle" data-testid="logout" aria-label="Sign out" onClick={async () => { await logout(); router.push(loginPath()); }}>
        <Icon name="signout" size={16} /><span className="hide-sm">Sign out</span>
      </button>
    </div>
  );
}

/** One top-level entry: a plain link, or a dropdown when the DB menu node has children (hover/focus on desktop, inline in the phone drawer). */
function NavEntry({ node, path }: { node: MenuNode; path: string }) {
  const [open, setOpen] = useState(false);
  const kids = node.children.filter((c) => c.route);
  useEffect(() => setOpen(false), [path]);
  if (!kids.length) return node.route ? <Link href={node.route} aria-current={path === node.route ? "page" : undefined} data-testid={`nav-${node.key}`}><Icon name={node.icon} size={16} />{node.title}</Link> : null;
  const current = kids.some((c) => path === c.route || (c.route !== "/" && path.startsWith(c.route + "/")));
  return (
    <div className={`nav-drop${open ? " open" : ""}`} onMouseLeave={() => setOpen(false)}>
      <button type="button" className={current ? "on" : undefined} aria-expanded={open} aria-haspopup="true" data-testid={`nav-${node.key}`}
        onClick={() => setOpen(!open)} onMouseEnter={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
        <Icon name={node.icon} size={16} />{node.title}<svg className="caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      <div className={`nav-panel${kids.length > 3 ? " wide" : ""}`} role="menu">
        <div className="nav-panel-head"><b>{node.title}</b></div>
        <div className="nav-panel-grid">
          {kids.map((c) => (
            <Link key={c.key} href={c.route!} role="menuitem" aria-current={path === c.route ? "page" : undefined} data-testid={`nav-${c.key}`}>
              <span className="ico"><Icon name={c.icon} size={20} /></span>
              <span className="txt"><b>{c.title}</b>{c.description && <small>{c.description}</small>}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Footer newsletter band (shown when Feature.Newsletter is on). */
function NewsletterBand() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ ok?: string; error?: string; busy?: boolean }>({});
  return (
    <div className="nl-band">
      <div className="wrap nl-in">
        <div><h3>Travel ideas and member-only deals</h3><p>One email a month. Unsubscribe any time.</p></div>
        <form className="nl-form" noValidate onSubmit={async (e) => {
          e.preventDefault(); setState({ busy: true });
          try { const r = await post<{ message: string }>("/public/newsletter", { email }); setState({ ok: r.message }); setEmail(""); }
          catch (err) { setState({ error: (err as Error).message }); }
        }}>
          <label className="sr-only" htmlFor="nl-email">Email address</label>
          <input id="nl-email" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="newsletter-email" />
          <button className="btn gold" disabled={state.busy} data-testid="newsletter-submit">Subscribe</button>
          {state.ok && <p className="nl-msg" role="status" data-testid="newsletter-ok">{state.ok}</p>}
          {state.error && <p className="nl-msg err" role="alert">{state.error}</p>}
        </form>
      </div>
    </div>
  );
}

/** Customer site: multi-level top navigation from the DB menu tree; collapses into a drawer on narrow screens. */
export function CustomerShell({ children, search }: { children: ReactNode; search?: ReactNode }) {
  const nav = useNavigation("Customer");
  const path = usePathname();
  const support = useSetting("Ui.SupportEmail");
  const hours = useSetting("Ui.SupportHours", "Mon to Fri, 09:00 to 18:00 (Taiwan time)");
  const brand = useSetting("Ui.BrandName", "Sanpu");
  const about = useSetting("Ui.FooterAbout", useSetting("Ui.HeroTagline", ""));
  const legalNotice = useSetting("Ui.LegalNotice", "");
  const newsletter = useSetting("Feature.Newsletter", "false") === "true";
  const { status } = useAuth();
  // landing and detail pages run edge to edge (full-width hero); every other page keeps the reading width
  const authPage = /^\/(login|register|assistant)$/.test(path);   // sign-in screens fill the window: no footer, no scrolling
  const bleed = path === "/" || /^\/(news|blog|login|register|assistant|tours|destinations|hotels|flights|buses|taxis|deals|help|services\/(?!book))(\/|$)?/.test(path);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  // on pages that start with a photo hero the header floats over it, then turns solid once the page scrolls
  const overHero = path === "/" || /^\/((news|blog)(\/[^/]+)?$|tours\/[^/]+|destinations|hotels|flights|buses|taxis|deals|help|services\/(?!book))/.test(path);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [path]);
  const tree = nav.data ?? [];
  const groups = tree.filter((n) => n.children.some((c) => c.route));
  const singles = tree.filter((n) => !n.children.some((c) => c.route) && n.route);
  const year = new Date().getFullYear();
  return (
    <div className="site">
      <a className="skip" href="#content">Skip to content</a>
      <header className={`topbar${overHero && !scrolled && !open ? " over" : ""}${overHero ? " floating" : ""}`}>
        <div className="topbar-in">
          <button className="btn small subtle icon-only nav-toggle" aria-label="Menu" aria-expanded={open} aria-controls="customer-nav" onClick={() => setOpen(!open)}><Icon name={open ? "close" : "menu"} /></button>
          <Brand href="/" />
          <nav id="customer-nav" className={`topnav${open ? " open" : ""}`} aria-label="Main" data-testid="customer-nav">
            {tree.map((n) => <NavEntry key={n.key} node={n} path={path} />)}
          </nav>
          <span className="spacer" />
          {search && <div className="header-search">{search}</div>}
          <UserMenu adminLink />
        </div>
      </header>
      <main id="content" className={`${bleed ? "page wide" : "page"}${overHero ? " under-header" : ""}${authPage ? " auth-main" : ""}`}>{children}</main>
      {!authPage && <footer className="site-footer">
        {newsletter && <NewsletterBand />}
        <div className="wrap cols">
          <div className="about">
            <div className="brandline"><BrandMark size={30} />{brand}</div>
            <p>{about}</p>
            <ul className="contact">
              {support && <li><Icon name="file" size={16} /><a href={`mailto:${support}`}>{support}</a></li>}
              <li><Icon name="calendar" size={16} /><span>{hours}</span></li>
            </ul>
          </div>
          {groups.map((g) => (
            <div key={g.key}><h4>{g.title}</h4><ul>{g.children.filter((c) => c.route).map((c) => <li key={c.key}><Link href={c.route!}>{c.title}</Link></li>)}</ul></div>
          ))}
          <div><h4>Account</h4><ul>
            {singles.map((n) => <li key={n.key}><Link href={n.route!}>{n.title}</Link></li>)}
            {status === "authenticated" ? <li><Link href="/account">My account</Link></li>
              : <><li><Link href="/login">Sign in</Link></li><li><Link href="/register">Create an account</Link></li></>}
          </ul></div>
        </div>
        <div className="legal">
          <div className="wrap legal-in" data-testid="footer-legal">
            <span>© {year} {brand}. All rights reserved.</span>
            <nav aria-label="Legal"><Link href="/legal/privacy.notice">Privacy</Link><Link href="/legal/terms">Terms of use</Link><Link href="/legal/cookies">Cookies</Link><Link href="/credits">Photo credits</Link></nav>
            {legalNotice && <span className="notice">{legalNotice}</span>}
          </div>
        </div>
      </footer>}
    </div>
  );
}

/** Admin portal: Windows-Settings-style navigation pane from the permitted menu tree. A route outside the tree shows 403 (the API enforces the same rule). */
export function AdminShell({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const nav = useNavigation("Admin");
  const [open, setOpen] = useState(false);
  const isLogin = path === "/admin/login" || path === "/admin/register";
  useEffect(() => { if (status === "anonymous" && !isLogin) router.replace(`/admin/login?next=${encodeURIComponent(path)}`); }, [status, router, path, isLogin]);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (isLogin) return <main id="content">{children}</main>;   // staff sign-in page: no admin chrome
  if (status !== "authenticated" || (nav.loading && !nav.data)) return <div className="page"><Loading lines={5} /></div>;
  if (nav.error) return <div className="page"><ErrorBox error={nav.error} retry={nav.reload} /></div>;
  const tree = nav.data ?? [];
  const routes = allowedRoutes(tree);
  const allowed = isRouteAllowed(path, routes) || (path === "/admin" && routes.length > 0) || path === "/admin/account";
  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <header className="topbar">
        <div className="topbar-in">
          <button className="btn small subtle icon-only menu-toggle" aria-label="Menu" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(!open)}><Icon name={open ? "close" : "menu"} /></button>
          <Brand href="/admin" />
          <span className="pill info hide-sm">Admin</span>
          <span className="spacer" />
          <Link className="btn small subtle" href="/" aria-label="Customer site"><Icon name="globe" size={16} /><span className="hide-sm">Customer site</span></Link>
          <UserMenu />
        </div>
      </header>
      <div className="admin">
        {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
        <nav id="sidebar" className={`sidebar${open ? " open" : ""}`} aria-label="Admin" data-testid="admin-nav">
          {tree.length === 0 && <p className="muted small">No admin menus for your roles.</p>}
          {tree.map((n) => n.children.length ? (
            <div key={n.key} className="nav-group">
              <h2>{n.title}</h2>
              {n.children.map((c) => <NavLink key={c.key} node={c} path={path} />)}
            </div>
          ) : <NavLink key={n.key} node={n} path={path} />)}
        </nav>
        <main id="content" className="main"><AdminRoutesContext.Provider value={routes}>{allowed ? children : <Forbidden />}</AdminRoutesContext.Provider></main>
      </div>
    </>
  );
}

function NavLink({ node, path }: { node: MenuNode; path: string }) {
  if (!node.route) return null;
  const active = path === node.route || (node.route !== "/admin" && path.startsWith(node.route + "/"));
  return node.isExternal
    ? <a href={node.route} target="_blank" rel="noopener noreferrer"><Icon name={node.icon} />{node.title}</a>
    : <Link href={node.route} aria-current={active ? "page" : undefined} data-testid={`menu-${node.key}`}><Icon name={node.icon} /><span>{node.title}</span></Link>;
}

export function Forbidden() {
  return (
    <div className="card" data-testid="forbidden" style={{ maxWidth: 560 }}>
      <p className="tagline">Access</p>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>403 · No access</h1>
      <p className="muted">Your roles do not include this page. If you need it, ask an administrator to add the permission to one of your roles.</p>
      <div className="form-actions"><Link className="btn primary" href="/">Go to my home</Link><Link className="btn" href={loginPath()}>Sign in as someone else</Link></div>
    </div>
  );
}
