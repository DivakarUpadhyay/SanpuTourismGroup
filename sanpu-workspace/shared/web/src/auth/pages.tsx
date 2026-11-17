"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError, get, post, put } from "../api";
import { useAuth } from "../auth";
import { useSetting } from "../shell";
import { CleanParams } from "../params";
import { Icon } from "../icons";
import { BrandMark } from "../logo";
import { Card, ConfirmButton, DataTable, ErrorBox, FormError, PageHeader, SelectInput, TextInput, fmtDateTime, useAction, useAsync, useToast } from "../ui";

/** Split sign-in layout: brand panel with a scenic image (Ui.AuthImage) beside the form; the panel hides on phones. */
/** Plain, centered auth layout (no card): brand mark, title, form, footer link and a short trust line. */
function AuthBox({ tagline, title, children, footer }: { tagline: string; title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-form">
        <Link href="/" className="auth-brand" aria-label="Home"><BrandMark size={34} /></Link>
        <p className="tagline">{tagline}</p>
        <h1>{title}</h1>
        {children}
        {footer && <div className="auth-foot">{footer}</div>}
        <ul className="auth-trust" aria-label="Your security">
          <li><Icon name="lock" size={14} />Secure sign-in</li>
          <li><Icon name="shield" size={14} />Personal data encrypted</li>
          <li><Icon name="check" size={14} />No spam, ever</li>
        </ul>
      </div>
    </div>
  );
}

const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : null);

function LoginInner({ params }: { params: URLSearchParams }) {
  const { login } = useAuth();
  const router = useRouter();
  const signup = useSetting("Feature.CustomerSignup", "false") === "true";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const a = useAction();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const me = await a.run(() => login(email, password));
    if (me) router.push(safeNext(params.get("next")) ?? (me.user.userType === "Staff" ? "/admin" : "/"));
  };
  const err = a.error instanceof ApiError && !a.error.errors ? a.error : null;
  return (
    <AuthBox tagline="Welcome back" title="Sign in to your account" footer={signup && <>New here? <Link href="/register">Create an account</Link></>}>
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
export const LoginPage = () => <CleanParams>{(p) => <LoginInner params={p} />}</CleanParams>;

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
    <AuthBox tagline="New traveler" title="Create an account" footer={<>Already have an account? <Link href="/login">Sign in</Link></>}>
      <form className="form" onSubmit={submit} noValidate>
        <FormError error={a.error} />
        <TextInput label="Name" value={f.displayName} onChange={(v) => setF({ ...f, displayName: v })} error={a.fieldError("displayName")} data-testid="reg-name" />
        <TextInput label="Email" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} error={a.fieldError("email")} data-testid="reg-email" />
        <TextInput label="Password" type="password" autoComplete="new-password" value={f.password} onChange={(v) => setF({ ...f, password: v })} error={a.fieldError("password")} hint="At least 12 characters with upper, lower case and a digit." data-testid="reg-password" />
        <TextInput label="Confirm password" type="password" autoComplete="new-password" value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} error={mismatch ? "Passwords do not match." : undefined} data-testid="reg-confirm" />
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
  const [wait, setWait] = useState(0);
  const a = useAction();
  const local = touched ? emailProblem(email) : null;
  const error = local ?? a.fieldError("email");
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  const send = async () => {
    setTouched(true);
    if (emailProblem(email)) { (document.querySelector("[data-testid=forgot-email]") as HTMLInputElement | null)?.focus(); return; }
    if (await a.run(() => post("/auth/forgot-password", { email: email.trim() })) !== undefined) { setSentTo(email.trim()); setWait(60); }
  };
  return (
    <AuthBox tagline="Account help" title={sentTo ? "Check your email" : "Forgot your password?"} footer={<>Remembered it? <Link href="/login">Back to sign in</Link></>}>
      {sentTo ? (
        <div className="form">
          <div className="alert ok" data-testid="forgot-sent">If an account exists for <b>{sentTo}</b>, we have sent a link to reset your password. The link works for 30 minutes.</div>
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
  const router = useRouter();
  const [p, setP] = useState({ password: "", confirm: "" });
  const [mismatch, setMismatch] = useState(false);
  const a = useAction();
  const toast = useToast();
  return (
    <AuthBox tagline="Account help" title="Set a new password">
      {!token ? <div className="alert error">This link is missing its token.</div> : (
        <form className="form" noValidate onSubmit={async (e) => {
          e.preventDefault();
          if (p.password !== p.confirm) { setMismatch(true); return; }
          if (await a.run(() => post("/auth/reset-password", { token, password: p.password })) !== undefined) { toast("Password changed. Sign in with the new one.", "ok"); router.push("/login"); }
        }}>
          {a.error instanceof ApiError && !a.error.errors && <div className="alert error" role="alert">{a.error.message}</div>}
          <TextInput label="New password" type="password" autoComplete="new-password" value={p.password} onChange={(v) => setP({ ...p, password: v })} error={a.fieldError("password")} hint="At least 12 characters with upper, lower case and a digit." data-testid="reset-password" />
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
          if (await a.run(() => post("/auth/accept-invitation", { token, displayName: name, password: f.password })) !== undefined) { toast("Account activated. Please sign in.", "ok"); router.push("/login"); }
        }}>
          <p className="muted small">Invitation for <b>{invite.data.email}</b>, valid until {fmtDateTime(invite.data.expiresAtUtc)}.</p>
          {a.error instanceof ApiError && !a.error.errors && <div className="alert error" role="alert">{a.error.message}</div>}
          <TextInput label="Display name" value={name} onChange={(v) => setF({ ...f, name: v })} error={a.fieldError("displayName")} data-testid="invite-name" />
          <TextInput label="Password" type="password" autoComplete="new-password" value={f.password} onChange={(v) => setF({ ...f, password: v })} error={a.fieldError("password")} hint="At least 12 characters with upper, lower case and a digit." data-testid="invite-password" />
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
  useEffect(() => { if (status === "anonymous") router.replace("/login?next=/account"); }, [status, router]);   // redirect after render, never during it
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
            if (await change.run(() => post("/account/change-password", pw)) !== undefined) { await logout(); router.push("/login"); }
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
      <Card title="Active sessions" actions={<ConfirmButton confirm="Sign out on every device, including this one?" onConfirm={async () => { if (await other.run(() => post("/auth/logout-all")) !== undefined) { await logout(); router.push("/login"); } }} testId="logout-all">Sign out everywhere</ConfirmButton>}>
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
