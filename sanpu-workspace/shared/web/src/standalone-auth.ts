"use client";

/* Accounts for the online version (no API server). People sign up with their own email and password; the account is kept
   in this browser only, with the password stored as a salted PBKDF2 hash (never in plain text). Staff sign-ups wait for an
   administrator's approval, exactly like the real system. Accounts that came with the site (in the snapshot) carry a hash
   too, and a reset or change of their password is stored here as an override. */
import { ApiError } from "./api";
import { PASSWORD_MIN, passwordProblems } from "./password";

export interface SnapshotUser { email: string; displayName: string; userType: string; roles: string[]; salt?: string; hash?: string }
export interface LocalUser {
  email: string; displayName: string; userType: "Staff" | "Customer"; status: "Active" | "Pending" | "Rejected";
  roleKey?: string; requestedRoleKey?: string; note?: string; salt: string; hash: string; createdAtUtc: string;
}
interface ResetToken { email: string; expires: number }

const APP = process.env.NEXT_PUBLIC_COOKIE_PREFIX ?? "app";
const KEY = { users: `sanpu.sa.${APP}.users`, pw: `sanpu.sa.${APP}.pw`, resets: `sanpu.sa.${APP}.resets` };
const read = <T,>(k: string, fallback: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { throw new ApiError(507, "storage_full", "This browser does not allow saving accounts (private mode or storage turned off)."); } };

export const localUsers = () => read<LocalUser[]>(KEY.users, []);
const saveUsers = (u: LocalUser[]) => write(KEY.users, u);
const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 120000 }, key, 256));
}
const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)).buffer);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fields = (errors: Record<string, string[]>) => new ApiError(422, "validation_failed", "Some fields are not valid.", errors);
function validate(b: Record<string, unknown>, extra?: Record<string, string[]>) {
  const errors: Record<string, string[]> = { ...extra };
  const email = String(b.email ?? "").trim(), name = String(b.displayName ?? "").trim(), pw = String(b.password ?? "");
  if (!EMAIL_RE.test(email)) errors.email = ["Enter a valid email address, like name@example.com."];
  if (name.length < 2 || name.length > 100) errors.displayName = ["Enter your name (2 to 100 characters)."];
  const p = passwordProblems(pw, email); if (p.length) errors.password = p;
  if (Object.keys(errors).length) throw fields(errors);
}

/** Finds an account and checks the password. Returns the account that signed in. */
export async function verify(snapshotUsers: SnapshotUser[], emailIn: unknown, password: unknown): Promise<SnapshotUser | LocalUser> {
  const email = norm(emailIn), pw = String(password ?? "");
  if (!email || !pw) throw fields({ ...(email ? {} : { email: ["Enter your email."] }), ...(pw ? {} : { password: ["Enter your password."] }) });
  const local = localUsers().find((u) => norm(u.email) === email);
  const seeded = snapshotUsers.find((u) => norm(u.email) === email);
  const override = read<Record<string, { salt: string; hash: string }>>(KEY.pw, {})[email];
  const cred = local ?? override ?? seeded;
  const bad = () => new ApiError(401, "invalid_credentials", "Email or password is incorrect.");
  if (!cred?.salt || !cred.hash) { await hashPassword(pw, "timing-equaliser"); throw bad(); }
  if ((await hashPassword(pw, cred.salt)) !== cred.hash) throw bad();
  if (local?.status === "Pending") throw new ApiError(403, "pending_approval", "Your access request is waiting for an administrator. You can sign in once it is approved.");
  if (local?.status === "Rejected") throw new ApiError(403, "request_rejected", "Your access request was not approved. Contact an administrator if you think this is a mistake.");
  return (local ?? seeded)!;
}

const taken = (snapshotUsers: SnapshotUser[], email: string) =>
  localUsers().some((u) => norm(u.email) === norm(email)) || snapshotUsers.some((u) => norm(u.email) === norm(email));

export async function registerCustomer(snapshotUsers: SnapshotUser[], b: Record<string, unknown>) {
  validate(b);
  if (taken(snapshotUsers, String(b.email))) throw new ApiError(409, "duplicate_email", "An account with this email already exists. Sign in, or reset your password.");
  const salt = newSalt();
  const user: LocalUser = { email: String(b.email).trim(), displayName: String(b.displayName).trim(), userType: "Customer", status: "Active", salt, hash: await hashPassword(String(b.password), salt), createdAtUtc: new Date().toISOString() };
  saveUsers([...localUsers(), user]);
  return user;
}

export async function requestStaffAccess(snapshotUsers: SnapshotUser[], roleKeys: string[], b: Record<string, unknown>) {
  validate(b, roleKeys.includes(String(b.roleKey ?? "")) ? undefined : { roleKey: ["Choose the role you need."] });
  if (taken(snapshotUsers, String(b.email))) throw new ApiError(409, "duplicate_email", "An account with this email already exists. Sign in, or reset your password.");
  const salt = newSalt();
  saveUsers([...localUsers(), {
    email: String(b.email).trim(), displayName: String(b.displayName).trim(), userType: "Staff", status: "Pending", requestedRoleKey: String(b.roleKey),
    note: String(b.note ?? "").trim().slice(0, 300) || undefined, salt, hash: await hashPassword(String(b.password), salt), createdAtUtc: new Date().toISOString(),
  }]);
}

export function decideStaffRequest(emailOrId: string, approve: boolean, roleKey?: string | null) {
  const users = localUsers();
  const u = users.find((x) => x.status === "Pending" && (norm(x.email) === norm(emailOrId) || idOf(x) === emailOrId));
  if (!u) throw new ApiError(404, "not_found", "This request was already handled.");
  if (approve) { u.status = "Active"; u.roleKey = roleKey || u.requestedRoleKey; } else u.status = "Rejected";
  saveUsers(users);
}

/** Stable id for a local account (the admin page addresses requests by id). */
export const idOf = (u: { email: string }) => "local-" + [...norm(u.email)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7).toString(16).replace("-", "n");

/** Forgot password: there is no mail server online, so the link is returned to be shown on the page. */
export function createReset(snapshotUsers: SnapshotUser[], emailIn: unknown): string | null {
  const email = norm(emailIn);
  if (!EMAIL_RE.test(email)) throw fields({ email: ["Enter a valid email address, like name@example.com."] });
  if (!taken(snapshotUsers, email)) return null;   // same reply either way; no link for unknown emails
  const token = newSalt() + newSalt();
  write(KEY.resets, { ...read<Record<string, ResetToken>>(KEY.resets, {}), [token]: { email, expires: Date.now() + 30 * 60_000 } });
  return `/reset-password?token=${token}`;
}

export async function resetPassword(token: unknown, password: unknown) {
  const resets = read<Record<string, ResetToken>>(KEY.resets, {});
  const r = resets[String(token ?? "")];
  if (!r || r.expires < Date.now()) throw new ApiError(400, "invalid_token", "This reset link has expired or was already used. Ask for a new one.");
  await setPassword(r.email, String(password ?? ""));
  delete resets[String(token)]; write(KEY.resets, resets);
}

export async function setPassword(emailIn: string, password: string) {
  const email = norm(emailIn);
  const p = passwordProblems(password, email); if (p.length) throw fields({ password: p, newPassword: p });
  const salt = newSalt(), hash = await hashPassword(password, salt);
  const users = localUsers(), local = users.find((u) => norm(u.email) === email);
  if (local) { local.salt = salt; local.hash = hash; saveUsers(users); }
  else write(KEY.pw, { ...read<Record<string, { salt: string; hash: string }>>(KEY.pw, {}), [email]: { salt, hash } });
}

export { PASSWORD_MIN };
