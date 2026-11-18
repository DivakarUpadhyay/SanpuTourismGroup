"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError, currentRealm, get, post, put } from "../api";
import { useAuth } from "../auth";
import { useSetting } from "../shell";
import { CleanParams } from "../params";
import { PASSWORD_HINT } from "../password";
import { Icon } from "../icons";
import { BrandMark } from "../logo";
import { Card, ConfirmButton, DataTable, ErrorBox, FormError, PageHeader, SelectInput, TextInput, fmtDateTime, useAction, useAsync, useToast } from "../ui";

const APP = process.env.NEXT_PUBLIC_COOKIE_PREFIX ?? "erp";
/** What each sign-in side says: travelers see trips, staff see the operations console. */
const VISUAL = {
  customer: APP === "ai"
    ? { title: "Your AI travel assistant is waiting", text: "Plan, compare and book trips across Taiwan in one conversation. Live prices, and nothing is paid until you confirm.",
        points: [["sparkle", "Plans built around your budget"], ["scale", "Side-by-side comparisons"], ["ticket", "Bookings you confirm and pay"]] }
    : { title: "Your next trip starts here", text: "Guided tours, hotels, domestic flights, express buses and airport taxis across Taiwan, in one account.",
        points: [["map", "Handpicked tours with local guides"], ["ticket", "Pay a deposit now, the rest later"], ["shield", "Free cancellation on most bookings"]] },
  staff: APP === "ai"
    ? { title: "AI Travel operations", text: "Watch live trips, review AI recovery proposals and follow every booking the assistant prepared.",
        stats: [["24/7", "Trip watch"], ["100%", "Human approved"], ["Live", "Bookings"]] }
    : { title: "Sanpu operations console", text: "Bookings, departures, suppliers, payments and marketing for the whole group, in one place.",
        stats: [["Live", "Seat inventory"], ["Daily", "Reconciliation"], ["SLA", "Task queue"]] },
} as const;

/** Sign-in screens. "customer": the site's look, a destination photo beside the form. "staff": a full-screen console look.
    "plain": centered form for account help pages. No cards. */
function AuthBox({ tagline, title, children, footer, variant = "plain" }: { tagline: string; title: string; children: ReactNode; footer?: ReactNode; variant?: "plain" | "customer" | "staff" }) {
  const photo = useSetting("Ui.AuthImage", "") || useSetting("Ui.HeroImage", "") || (APP === "ai" ? "/images/photos/sunmoon.jpg" : "/images/photos/hualien.jpg");
  const form = (
    <div className="auth-form">
      <Link href={variant === "staff" ? "/admin/login" : "/"} className="auth-brand" aria-label="Home"><BrandMark size={34} /></Link>
      <p className="tagline">{tagline}</p>
      <h1>{title}</h1>
      {children}
      {footer && <div className="auth-foot">{footer}</div>}
      <ul className="auth-trust" aria-label="Your security">
        <li><Icon name="lock" size={14} />Secure sign-in</li>
        <li><Icon name="shield" size={14} />{variant === "staff" ? "Role-based access" : "Personal data encrypted"}</li>
        <li><Icon name="check" size={14} />{variant === "staff" ? "Every action audited" : "No spam, ever"}</li>
      </ul>
    </div>
  );
  if (variant === "plain") return <div className="auth-wrap">{form}</div>;
  if (variant === "staff") {
    const v = VISUAL.staff;
    return (
      <div className="auth-screen staff" data-testid="auth-staff">
        <div className="auth-visual"><div>
          <span className="auth-badge"><Icon name="shield" size={14} /> Staff only</span>
          <h2>{v.title}</h2><p>{v.text}</p>
          <div className="stat-row">{v.stats.map(([b, t]) => <div key={t}><b>{b}</b><small>{t}</small></div>)}</div>
        </div></div>
        <div className="auth-form-side">{form}</div>
      </div>
    );
  }
  const v = VISUAL.customer;
  return (
    <div className="auth-screen customer" data-testid="auth-customer">
      <div className="auth-form-side">{form}</div>
      <div className="auth-visual" style={{ backgroundImage: `url(${photo})` }}><div>
        <h2>{v.title}</h2><p>{v.text}</p>
        <ul>{v.points.map(([icon, t]) => <li key={t}><Icon name={icon} size={16} />{t}</li>)}</ul>
      </div></div>
    </div>
  );
}

const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : null);

function LoginInner({ params, staff }: { params: URLSearchParams; staff: boolean }) {
  const { login } = useAuth();
  const router = useRouter();
  const signup = useSetting("Feature.CustomerSignup", "false") === "true";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const a = useAction();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const me = await a.run(() => login(email, password));
    if (me) router.push(safeNext(params.get("next")) ?? (staff ? "/admin" : "/"));
  };
  const err = a.error instanceof ApiError && !a.error.errors ? a.error : null;
  return (
    <AuthBox variant={staff ? "staff" : "customer"} tagline={staff ? "Staff portal" : "Welcome back"} title={staff ? "Sign in to the admin panel" : "Sign in to your account"}
      footer={staff ? <>New staff member? <Link href="/admin/register" data-testid="staff-request-link">Request access</Link> · <Link href="/login">Customer sign-in</Link></> : <>{signup && <>New here? <Link href="/register">Create an account</Link> · </>}Staff? <Link href="/admin/login">Admin sign-in</Link></>}>
      <form className="form" onSubmit={submit} noValidate data-testid="login-form">
        {err && <div className="alert error" role="alert" data-testid="login-error">{err.message}</div>}
        <TextInput label="Email" type="email" autoComplete="username" value={email} onChange={setEmail} error={a.fieldError("email")} data-testid="login-email" required />
        <TextInput label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} error={a.fieldError("password")} data-testid="login-password" required />
        <div className="auth-row"><span /><Link href="/forgot-password">Forgot password?</Link></div>
        <button className="btn primary lg block" type="submit" disabled={a.busy} data-testid="login-submit">{a.busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </AuthBox>
  );
}
export const LoginPage = () => <CleanParams>{(p) => <LoginInner params={p} staff={false} />}</CleanParams>;
/** Staff sign-in for the admin panel (its own session, separate from the customer site). */
export const AdminLoginPage = () => <CleanParams>{(p) => <LoginInner params={p} staff />}</CleanParams>;

export function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ email: "", displayName: "", password: "", confirm: "" });
  const [mismatch, setMismatch] = useState(false);
  const a = useAction();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.confirm) { setMismatch(true); return; }
    setMismatch(false);
    if (await a.run(() => register(f.email, f.displayName, f.password), "Account created")) router.push("/");
  };
  return (
    <AuthBox variant="customer" tagline="New traveler" title="Create an account" footer={<>Already have an account? <Link href="/login">Sign in</Link></>}>
      <form className="form" onSubmit={submit} noValidate>
        <FormError error={a.error} />
        <TextInput label="Name" value={f.displayName} onChange={(v) => setF({ ...f, displayName: v })} error={a.fieldError("displayName")} data-testid="reg-name" />
        <TextInput label="Email" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} error={a.fieldError("email")} data-testid="reg-email" />
        <div className="pair">
          <TextInput label="Password" type="password" autoComplete="new-password" value={f.password} onChange={(v) => setF({ ...f, password: v })} error={a.fieldError("password")} data-testid="reg-password" />
          <TextInput label="Confirm password" type="password" autoComplete="new-password" value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} error={mismatch ? "Passwords do not match." : undefined} data-testid="reg-confirm" />
        </div>
        <small className="muted pw-hint">{PASSWORD_HINT}</small>
        <button className="btn primary lg block" disabled={a.busy} data-testid="reg-submit">{a.busy ? "Creating account…" : "Create account"}</button>
      </form>
    </AuthBox>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Client-side email check (the API validates again). */
export const emailProblem = (v: string) => (!v.trim() ? "Enter your email address." : v.length > 256 ? "Use at most 256 characters." : !EMAIL_RE.test(v.trim()) ? "Enter a valid email address, like name@example.com." : null);

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const a = useAction();
  const local = touched ? emailProblem(email) : null;
  const error = local ?? a.fieldError("email");
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  const send = async () => {
    setTouched(true);
    if (emailProblem(email)) { (document.querySelector("[data-testid=forgot-email]") as HTMLInputElement | null)?.focus(); return; }
    const r = await a.run(() => post<{ previewLink?: string | null } | null>("/auth/forgot-password", { email: email.trim() }));
    if (r !== undefined) { setSentTo(email.trim()); setPreview(r?.previewLink ?? null); setWait(60); }
  };
  return (
    <AuthBox tagline="Account help" title={sentTo ? "Check your email" : "Forgot your password?"} footer={<>Remembered it? <Link href="/login">Back to sign in</Link></>}>
      {sentTo ? (
        <div className="form">
          <div className="alert ok" data-testid="forgot-sent">If an account exists for <b>{sentTo}</b>, we have sent a link to reset your password. The link works for 30 minutes.</div>
          {preview && <div className="alert info" data-testid="forgot-preview">This online version cannot send email, so here is the message we would send: <Link href={preview} data-testid="forgot-preview-link"><b>Open your password reset link</b></Link>. It works for 30 minutes.</div>}
          <p className="small muted" style={{ textAlign: "center", margin: 0 }}>Not in your inbox? Check spam, or send it again.</p>
          <button type="button" className="btn lg block" disabled={wait > 0 || a.busy} onClick={send} data-testid="forgot-resend">{wait > 0 ? `Send again in ${wait}s` : a.busy ? "Sending…" : "Send the link again"}</button>
          <button type="button" className="btn subtle" onClick={() => { setSentTo(null); setTouched(false); }}>Use a different email</button>
        </div>
      ) : (
        <form className="form" noValidate onSubmit={(e) => { e.preventDefault(); send(); }}>
          <p className="muted" style={{ textAlign: "center", margin: "-12px 0 4px" }}>Enter the email you use to sign in and we will send you a reset link.</p>
          <TextInput label="Email" type="email" autoComplete="email" inputMode="email" value={email} required aria-required="true"
            onChange={(v) => { setEmail(v); a.clear(); }} onBlur={() => setTouched(true)} error={error ?? undefined} data-testid="forgot-email" />
          <button className="btn primary lg block" disabled={a.busy} data-testid="forgot-submit">{a.busy ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
    </AuthBox>
  );
}

function ResetInner({ params }: { params: URLSearchParams }) {
  const token = params.get("token") ?? "";
  const [p, setP] = useState({ password: "", confirm: "" });
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState(false);
  const a = useAction();
  return (
    <AuthBox tagline="Account help" title={done ? "Password changed" : "Set a new password"}>
      {done ? (
        <div className="form" data-testid="reset-done">
          <div className="alert ok">Your new password is saved. Sign in with it now.</div>
          <Link className="btn primary lg block" href="/login">Customer sign-in</Link>
          <Link className="btn lg block" href="/admin/login">Staff sign-in</Link>
        </div>
      ) : !token ? <div className="alert error">This link is missing its token. Ask for a new one on the <Link href="/forgot-password">forgot password</Link> page.</div> : (
        <form className="form" noValidate onSubmit={async (e) => {
          e.preventDefault();
          if (p.password !== p.confirm) { setMismatch(true); return; }
          setMismatch(false);
          if (await a.run(() => post("/auth/reset-password", { token, password: p.password })) !== undefined) setDone(true);
        }}>
          {a.error instanceof ApiError && !a.error.errors && <div className="alert error" role="alert">{a.error.message}</div>}
          <TextInput label="New password" type="password" autoComplete="new-password" value={p.password} onChange={(v) => setP({ ...p, password: v })} error={a.fieldError("password")} hint={PASSWORD_HINT} data-testid="reset-password" />
          <TextInput label="Confirm password" type="password" autoComplete="new-password" value={p.confirm} onChange={(v) => setP({ ...p, confirm: v })} error={mismatch ? "Passwords do not match." : undefined} data-testid="reset-confirm" />
          <button className="btn primary" disabled={a.busy} data-testid="reset-submit">Set new password</button>
        </form>
      )}
    </AuthBox>
  );
}
export const ResetPasswordPage = () => <CleanParams>{(p) => <ResetInner params={p} />}</CleanParams>;

function AcceptInner({ params }: { params: URLSearchParams }) {
  const token = params.get("token") ?? "";
  const router = useRouter();
  const invite = useAsync(() => (token ? get<{ email: string; displayName: string; expiresAtUtc: string }>("/auth/invitation", { token }) : Promise.reject(new ApiError(400, "token_invalid", "This link is missing its token."))), [token]);
  const [f, setF] = useState<{ name: string | null; password: string; confirm: string }>({ name: null, password: "", confirm: "" });
  const [mismatch, setMismatch] = useState(false);
  const a = useAction();
  const toast = useToast();
  const name = f.name ?? invite.data?.displayName ?? "";
  return (
    <AuthBox tagline="Join the team" title="Accept invitation">
      {invite.error ? <ErrorBox error={invite.error} /> : !invite.data ? <p className="muted">Checking your invitation…</p> : (
        <form className="form" noValidate onSubmit={async (e) => {
          e.preventDefault();
          if (f.password !== f.confirm) { setMismatch(true); return; }
          if (await a.run(() => post("/auth/accept-invitation", { token, displayName: name, password: f.password })) !== undefined) { toast("Account activated. Please sign in.", "ok"); router.push("/admin/login"); }
        }}>
          <p className="muted small">Invitation for <b>{invite.data.email}</b>, valid until {fmtDateTime(invite.data.expiresAtUtc)}.</p>
          {a.error instanceof ApiError && !a.error.errors && <div className="alert error" role="alert">{a.error.message}</div>}
          <TextInput label="Display name" value={name} onChange={(v) => setF({ ...f, name: v })} error={a.fieldError("displayName")} data-testid="invite-name" />
          <TextInput label="Password" type="password" autoComplete="new-password" value={f.password} onChange={(v) => setF({ ...f, password: v })} error={a.fieldError("password")} hint={PASSWORD_HINT} data-testid="invite-password" />
          <TextInput label="Confirm password" type="password" autoComplete="new-password" value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} error={mismatch ? "Passwords do not match." : undefined} data-testid="invite-confirm" />
          <button className="btn primary" disabled={a.busy} data-testid="invite-submit">Activate account</button>
        </form>
      )}
    </AuthBox>
  );
}
export const AcceptInvitationPage = () => <CleanParams>{(p) => <AcceptInner params={p} />}</CleanParams>;

interface Session { tokenId: string; createdAtUtc: string; expiresAtUtc: string; userAgent?: string; ipAddress?: string }

export function AccountPage() {
  const { me, status, reload, logout } = useAuth();
  const router = useRouter();
  const languages = useSetting("Ui.Languages", '["en"]');
  const sessions = useAsync(() => (status === "authenticated" ? get<Session[]>("/account/sessions") : Promise.resolve([])), [status]);
  const [profile, setProfile] = useState<{ displayName: string; phone: string; preferredLanguage: string } | null>(null);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const save = useAction();
  const change = useAction();
  const other = useAction();
  const exp = useAction();
  useEffect(() => { if (status === "anonymous") router.replace(currentRealm() === "admin" ? "/admin/login?next=/admin/account" : "/login?next=/account"); }, [status, router]);   // redirect after render, never during it
  if (status === "loading" || !me) return null;
  const p = profile ?? { displayName: me.user.displayName, phone: "", preferredLanguage: me.preferredLanguage };
  const langs: string[] = (() => { try { return JSON.parse(languages); } catch { return ["en"]; } })();
  return (
    <>
      <PageHeader tagline="My account" title="Profile & security" lead={`${me.user.email} · roles: ${me.roles.join(", ") || "none"}`} />
      <div className="grid two">
        <Card title="Profile">
          <form className="form" noValidate onSubmit={async (e) => { e.preventDefault(); if (await save.run(() => put("/account/profile", { ...p, phone: p.phone || null }), "Profile saved") !== undefined) { setProfile(null); reload(); } }}>
            <TextInput label="Display name" value={p.displayName} onChange={(v) => setProfile({ ...p, displayName: v })} error={save.fieldError("displayName")} data-testid="acc-name" />
            <TextInput label="Phone (stored encrypted)" value={p.phone} placeholder={me.phoneMasked ?? "+886912345678"} onChange={(v) => setProfile({ ...p, phone: v })} error={save.fieldError("phone")} hint={me.phoneMasked ? `Saved as ${me.phoneMasked}. Leave empty to remove.` : "Optional."} data-testid="acc-phone" />
            <SelectInput label="Preferred language" value={p.preferredLanguage} onChange={(v) => setProfile({ ...p, preferredLanguage: v })} options={langs.map((l) => ({ value: l, label: l === "en" ? "English" : l }))} error={save.fieldError("preferredLanguage")} />
            <div className="form-actions"><button className="btn primary" disabled={save.busy} data-testid="acc-save">Save profile</button></div>
          </form>
        </Card>
        <Card title="Change password">
          <form className="form" noValidate onSubmit={async (e) => {
            e.preventDefault();
            if (await change.run(() => post("/account/change-password", pw)) !== undefined) { await logout(); router.push(currentRealm() === "admin" ? "/admin/login" : "/login"); }
          }}>
            <TextInput label="Current password" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(v) => setPw({ ...pw, currentPassword: v })} error={change.fieldError("currentPassword")} />
            <TextInput label="New password" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(v) => setPw({ ...pw, newPassword: v })} error={change.fieldError("newPassword")} hint="Changing it signs you out on every device." />
            <div className="form-actions"><button className="btn primary" disabled={change.busy}>Change password</button></div>
          </form>
        </Card>
      </div>
      <Card title="Your data" actions={<button className="btn" data-testid="export-data" disabled={exp.busy} onClick={async () => {
        const data = await exp.run(() => get<unknown>("/account/export"), "Your data is ready");
        if (data === undefined) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        const link = Object.assign(document.createElement("a"), { href: url, download: `my-data-${new Date().toISOString().slice(0, 10)}.json` });
        link.click(); URL.revokeObjectURL(url);
      }}>{exp.busy ? "Preparing…" : "Download my data"}</button>}>
        <p className="small muted" style={{ margin: 0 }}>Download a copy of the personal data we hold about you (JSON). To correct or delete it, contact us; see the <a href="/legal/privacy.notice#your-rights">privacy notice</a>.</p>
      </Card>
      <Card title="Active sessions" actions={<ConfirmButton confirm="Sign out on every device, including this one?" onConfirm={async () => { if (await other.run(() => post("/auth/logout-all")) !== undefined) { await logout(); router.push(currentRealm() === "admin" ? "/admin/login" : "/login"); } }} testId="logout-all">Sign out everywhere</ConfirmButton>}>
        <DataTable rows={sessions.data ?? []} rowKey={(s) => s.tokenId} columns={[
          { key: "createdAtUtc", header: "Signed in", render: (s) => fmtDateTime(s.createdAtUtc) },
          { key: "expiresAtUtc", header: "Expires", render: (s) => fmtDateTime(s.expiresAtUtc) },
          { key: "userAgent", header: "Device", render: (s) => <span className="small">{s.userAgent?.slice(0, 80)}</span> },
          { key: "ipAddress", header: "IP" }]} />
      </Card>
      <Card title="My data">
        <p className="muted small">Download everything we store about your account (JSON). The download is recorded in the audit log.</p>
        <button className="btn" data-testid="acc-export" onClick={() => other.run(async () => {
          const data = await get<unknown>("/account/export");
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-data.json"; a.click(); URL.revokeObjectURL(a.href);
        }, "Export ready")}>Download my data</button>
      </Card>
    </>
  );
}


interface StaffRole { roleKey: string; roleName: string; description?: string | null }
/** Staff sign-up: the person picks their own password and the role they need; an administrator approves before first sign-in. */
export function StaffRegisterPage() {
  const roles = useAsync(() => get<StaffRole[]>("/auth/staff-roles"), []);
  const [f, setF] = useState({ displayName: "", email: "", roleKey: "", note: "", password: "", confirm: "" });
  const [mismatch, setMismatch] = useState(false);
  const [sent, setSent] = useState(false);
  const a = useAction();
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.confirm) { setMismatch(true); return; }
    setMismatch(false);
    const { confirm: _c, ...body } = f;
    if (await a.run(() => post("/auth/staff-request", body)) !== undefined) setSent(true);
  };
  const role = roles.data?.find((r) => r.roleKey === f.roleKey);
  return (
    <AuthBox variant="staff" tagline="Staff portal" title={sent ? "Request sent" : "Request staff access"} footer={<>Already approved? <Link href="/admin/login">Staff sign-in</Link></>}>
      {sent ? (
        <div className="form" data-testid="staff-request-sent">
          <div className="alert ok">Thanks, {f.displayName.split(" ")[0]}. An administrator will review your request for <b>{role?.roleName ?? f.roleKey}</b>. Once it is approved, sign in with <b>{f.email}</b> and the password you just chose.</div>
          <Link className="btn primary lg block" href="/admin/login">Go to staff sign-in</Link>
        </div>
      ) : (
        <form className="form" onSubmit={submit} noValidate data-testid="staff-request-form">
          <FormError error={a.error} />
          <div className="pair">
            <TextInput label="Full name" autoComplete="name" value={f.displayName} onChange={set("displayName")} error={a.fieldError("displayName")} data-testid="sr-name" />
            <TextInput label="Work email" type="email" autoComplete="email" value={f.email} onChange={set("email")} error={a.fieldError("email")} data-testid="sr-email" />
          </div>
          <SelectInput label="Role you need" value={f.roleKey} onChange={set("roleKey")} placeholder={roles.loading ? "Loading roles…" : "Choose a role"}
            options={(roles.data ?? []).map((r) => ({ value: r.roleKey, label: r.roleName }))} error={a.fieldError("roleKey")} testId="sr-role" />
          <TextInput label="Note for the administrator (optional)" value={f.note} onChange={set("note")} placeholder="Team, manager or reason" error={a.fieldError("note")} data-testid="sr-note" />
          <div className="pair">
            <TextInput label="Password" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} error={a.fieldError("password")} data-testid="sr-password" />
            <TextInput label="Confirm password" type="password" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} error={mismatch ? "Passwords do not match." : undefined} data-testid="sr-confirm" />
          </div>
          <small className="muted pw-hint">{PASSWORD_HINT}</small>
          <button className="btn primary lg block" disabled={a.busy} data-testid="sr-submit">{a.busy ? "Sending…" : "Send request"}</button>
        </form>
      )}
    </AuthBox>
  );
}
