"use client";

import { useMemo, useState } from "react";
import { get, post, put, del } from "../api";
import { useAuth, type MenuNode } from "../auth";
import {
  Async, Card, Checkbox, ConfirmButton, DataTable, Demo, ErrorBox, FormError, Kpi, Modal, PageHeader, Pager, Pill, SelectInput, TextArea, TextInput,
  fmtDateTime, useAction, useAsync, useToast
} from "../ui";

// ---------------- types ----------------
interface Audit { auditId: number; occurredAtUtc: string; actorEmailMasked?: string; action: string; entityType: string; entityId?: string; detailsJson?: string; correlationId?: string }
interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }
interface UserRow { userId: string; email: string; displayName: string; userType: string; status: string; lastLoginAtUtc?: string; roles?: string; isDemo: boolean }
interface UserDetail { user: { userId: string; email: string; displayName: string; userType: string; isActive: boolean; isLocked: boolean; mustChangePassword: boolean; isInvited: boolean; lastLoginAtUtc?: string; failedLoginCount: number; phoneMasked?: string }; roleIds: number[]; activeSessions: number }
interface Role { roleId: number; roleKey: string; roleName: string; description?: string; isSystem: boolean; isActive: boolean; rowVersion?: string; memberCount: number; permissionCount: number }
interface Grant { roleId: number; permissionId: number }
interface Permission { permissionId: number; permissionKey: string; moduleKey: string; actionKey: string; description?: string; isActive: boolean; roleCount: number }
interface MenuRow { menuId: number; parentMenuId?: number | null; menuKey: string; title: string; routePath?: string | null; iconKey?: string | null; sortOrder: number; isVisible: boolean; isActive: boolean; isExternal: boolean; applicationArea: string; rowVersion?: string; permissionKeys?: string | null }
interface Setting { settingKey: string; settingValue: string; valueType: string; category: string; description?: string; validationJson?: string; isPublic: boolean; isEditable: boolean; isActive: boolean; updatedAtUtc: string; updatedByMasked?: string; rowVersion?: string }
interface Content { templateKey: string; locale: string; kind: string; subject: string; body: string; isPublic: boolean; updatedAtUtc: string; rowVersion?: string }

// ---------------- system overview ----------------
export function SystemOverviewPage() {
  const s = useAsync(() => get<{ kpis: Record<string, number>; recent: Audit[] }>("/admin/dashboard"), []);
  return (
    <>
      <PageHeader tagline="Overview" title="System administration" lead="Live counts from SQL Server: users, invitations, lockouts and audit activity." />
      <Async state={s}>{(d) => (
        <>
          <div className="kpis">
            <Kpi label="Active users" value={d.kpis.activeUsers} testId="kpi-active-users" />
            <Kpi label="Pending invites" value={d.kpis.pendingInvites} />
            <Kpi label="Locked accounts" value={d.kpis.lockedUsers} />
            <Kpi label="Audit events (24 h)" value={d.kpis.auditEvents24h} />
            <Kpi label="Active roles" value={d.kpis.activeRoles} />
            <Kpi label="Active menus" value={d.kpis.activeMenus} />
          </div>
          <Card title="Recent audit events"><AuditTable rows={d.recent} /></Card>
        </>
      )}</Async>
    </>
  );
}

function AuditTable({ rows }: { rows: Audit[] }) {
  return <DataTable rows={rows} rowKey={(r) => r.auditId} testId="audit-table" columns={[
    { key: "occurredAtUtc", header: "When", render: (r) => fmtDateTime(r.occurredAtUtc) },
    { key: "actorEmailMasked", header: "Actor" },
    { key: "action", header: "Action", render: (r) => <span className="mono">{r.action}</span> },
    { key: "entity", header: "Entity", render: (r) => `${r.entityType} ${r.entityId ?? ""}` },
    { key: "detailsJson", header: "Details", render: (r) => <span className="mono">{r.detailsJson?.slice(0, 120)}</span> }]} />;
}

// ---------------- users & onboarding ----------------
export function UsersPage() {
  const { has, me } = useAuth();
  const canEdit = has("Admin.Users.Edit");
  const [filter, setFilter] = useState({ search: "", status: "", userType: "", page: 1 });
  const users = useAsync(() => get<Paged<UserRow>>("/admin/users", { ...filter, pageSize: 20 }), [filter]);
  const roles = useAsync(() => get<{ roles: Role[]; grants: Grant[] }>("/admin/roles"), []);
  const [inviting, setInviting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <PageHeader tagline="People" title="Users & onboarding" lead="Invite people, give them roles, and control their access. Admins never set or see passwords: invitees choose their own through a one-time link."
        actions={canEdit && <button className="btn primary" onClick={() => setInviting(true)} data-testid="invite-open">Invite user</button>} />
      <div className="toolbar">
        <TextInput label="Search" value={filter.search} onChange={(v) => setFilter({ ...filter, search: v, page: 1 })} placeholder="name or email" data-testid="users-search" />
        <SelectInput label="Status" value={filter.status} onChange={(v) => setFilter({ ...filter, status: v, page: 1 })} placeholder="Any" options={["Active", "Invited", "Locked", "Inactive"].map((x) => ({ value: x, label: x }))} />
        <SelectInput label="Type" value={filter.userType} onChange={(v) => setFilter({ ...filter, userType: v, page: 1 })} placeholder="Any" options={[{ value: "Staff", label: "Staff" }, { value: "Customer", label: "Customer" }]} />
      </div>
      <Async state={users}>{(d) => (
        <>
          <DataTable rows={d.items} rowKey={(u) => u.userId} onRowClick={(u) => setSelected(u.userId)} testId="users-table" columns={[
            { key: "displayName", header: "Name", render: (u) => <>{u.displayName}<Demo show={u.isDemo} /></> },
            { key: "email", header: "Email" },
            { key: "roles", header: "Roles" },
            { key: "status", header: "Status", render: (u) => <Pill value={u.status} /> },
            { key: "lastLoginAtUtc", header: "Last sign-in", render: (u) => fmtDateTime(u.lastLoginAtUtc) }]} />
          <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => setFilter({ ...filter, page: p })} />
        </>
      )}</Async>
      {inviting && <InviteModal roles={roles.data?.roles ?? []} onClose={() => setInviting(false)} onDone={users.reload} />}
      {selected && <UserDrawer id={selected} roles={roles.data?.roles ?? []} canEdit={canEdit} self={me?.user.id === selected} onClose={() => setSelected(null)} onChanged={users.reload} />}
    </>
  );
}

function InviteModal({ roles, onClose, onDone }: { roles: Role[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ email: "", displayName: "", userType: "Staff", roleIds: [] as number[] });
  const [link, setLink] = useState<string | null>(null);
  const a = useAction();
  return (
    <Modal title="Invite user" onClose={onClose} testId="invite-modal" actions={!link && (
      <button className="btn primary" disabled={a.busy} data-testid="invite-send" onClick={async () => {
        const r = await a.run(() => post<{ userId: string; inviteLink?: string; delivery: string }>("/admin/users/invite", f), "Invitation created");
        if (r) { setLink(r.inviteLink ?? null); onDone(); if (!r.inviteLink) onClose(); }
      }}>{a.busy ? "Sending…" : "Send invitation"}</button>)}>
      {link ? (
        <div className="alert info" data-testid="invite-result">
          No mail provider is configured, so the one-time link is shown here once (also kept in the local test inbox). Send it to the person securely:
          <div className="mono" style={{ wordBreak: "break-all", marginTop: 6 }} data-testid="invite-link">{link}</div>
        </div>
      ) : (
        <div className="form">
          <FormError error={a.error} />
          <TextInput label="Email" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} error={a.fieldError("email")} data-testid="invite-email" />
          <TextInput label="Display name" value={f.displayName} onChange={(v) => setF({ ...f, displayName: v })} error={a.fieldError("displayName")} data-testid="invite-display" />
          <SelectInput label="User type" value={f.userType} onChange={(v) => setF({ ...f, userType: v })} options={[{ value: "Staff", label: "Staff" }, { value: "Customer", label: "Customer" }]} error={a.fieldError("userType")} />
          <fieldset className="field" style={{ border: 0, padding: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 500 }}>Roles</legend>
            <div className="row">{roles.filter((r) => r.isActive).map((r) => (
              <Checkbox key={r.roleId} label={r.roleName} checked={f.roleIds.includes(r.roleId)} testId={`invite-role-${r.roleKey}`}
                onChange={(c) => setF({ ...f, roleIds: c ? [...f.roleIds, r.roleId] : f.roleIds.filter((x) => x !== r.roleId) })} />))}</div>
            {a.fieldError("roleIds") && <div className="error">{a.fieldError("roleIds")}</div>}
          </fieldset>
        </div>
      )}
    </Modal>
  );
}

function UserDrawer({ id, roles, canEdit, self, onClose, onChanged }: { id: string; roles: Role[]; canEdit: boolean; self: boolean; onClose: () => void; onChanged: () => void }) {
  const d = useAsync(() => get<UserDetail>(`/admin/users/${id}`), [id]);
  const audit = useAsync(() => get<Paged<Audit>>("/admin/audit", { entityType: "User", entityId: id, pageSize: 10 }).catch(() => null), [id]);
  const [roleIds, setRoleIds] = useState<number[] | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const a = useAction();
  const act = async (fn: () => Promise<unknown>, msg: string) => { if (await a.run(fn, msg) !== undefined) { d.reload(); onChanged(); } };
  const u = d.data?.user;
  const current = roleIds ?? d.data?.roleIds ?? [];
  return (
    <Modal title={u ? u.displayName : "User"} onClose={onClose} testId="user-drawer">
      <Async state={d}>{(x) => (
        <>
          <p className="small muted">{x.user.email} · {x.user.userType} · last sign-in {fmtDateTime(x.user.lastLoginAtUtc)} · {x.activeSessions} active session(s) · failed logins {x.user.failedLoginCount}</p>
          <div className="row" style={{ marginBottom: 10 }}>
            <Pill value={!x.user.isActive ? "Inactive" : x.user.isLocked ? "Locked" : x.user.isInvited ? "Invited" : "Active"} />
            {x.user.mustChangePassword && <Pill value="Must reset password" tone="warn" />}
          </div>
          {a.error ? <ErrorBox error={a.error} /> : null}
          {link && <div className="alert info small">Reset link (shown once while mail is off): <span className="mono" style={{ wordBreak: "break-all" }}>{link}</span></div>}
          <h3 style={{ fontSize: 14, margin: "12px 0 6px" }}>Roles</h3>
          <div className="row">{roles.map((r) => (
            <Checkbox key={r.roleId} label={r.roleName} checked={current.includes(r.roleId)} testId={`user-role-${r.roleKey}`}
              onChange={(c) => setRoleIds(c ? [...current, r.roleId] : current.filter((v) => v !== r.roleId))} />))}</div>
          {canEdit && (
            <div className="form-actions" style={{ marginTop: 10 }}>
              <button className="btn primary small" disabled={a.busy || roleIds === null} data-testid="user-save-roles" onClick={() => act(() => put(`/admin/users/${id}/roles`, { roleIds: current }), "Roles saved")}>Save roles</button>
              {x.user.isInvited && <button className="btn small" onClick={async () => { const r = await a.run(() => post<{ inviteLink?: string }>(`/admin/users/${id}/resend-invite`), "Invitation re-sent"); if (r?.inviteLink) setLink(r.inviteLink); }}>Resend invite</button>}
              {!self && (x.user.isActive
                ? <ConfirmButton className="btn small danger" confirm="Deactivate this user? They are signed out everywhere." onConfirm={() => act(() => put(`/admin/users/${id}/status`, { action: "deactivate" }), "User deactivated")} testId="user-deactivate">Deactivate</ConfirmButton>
                : <button className="btn small" onClick={() => act(() => put(`/admin/users/${id}/status`, { action: "activate" }), "User activated")} data-testid="user-activate">Activate</button>)}
              {!self && (x.user.isLocked
                ? <button className="btn small" onClick={() => act(() => put(`/admin/users/${id}/status`, { action: "unlock" }), "Unlocked")}>Unlock</button>
                : <ConfirmButton className="btn small danger" confirm="Lock this account?" onConfirm={() => act(() => put(`/admin/users/${id}/status`, { action: "lock" }), "Locked")} testId="user-lock">Lock</ConfirmButton>)}
              {!x.user.isInvited && <ConfirmButton className="btn small" confirm="Force a password reset? Current sessions end and a reset link is issued." onConfirm={async () => { const r = await a.run(() => post<{ resetLink?: string }>(`/admin/users/${id}/force-reset`), "Reset issued"); if (r?.resetLink) setLink(r.resetLink); d.reload(); }}>Force password reset</ConfirmButton>}
              <ConfirmButton className="btn small" confirm="Sign this user out of every device now?" onConfirm={() => act(() => post(`/admin/users/${id}/revoke-sessions`), "Sessions revoked")} testId="user-revoke">Revoke sessions</ConfirmButton>
            </div>
          )}
          {audit.data && <><h3 style={{ fontSize: 14, margin: "14px 0 6px" }}>Recent activity</h3><AuditTable rows={audit.data.items} /></>}
        </>
      )}</Async>
    </Modal>
  );
}

// ---------------- roles & permissions ----------------
export function RolesPage() {
  const { has, me } = useAuth();
  const canEdit = has("Admin.Roles.Edit");
  const data = useAsync(() => Promise.all([get<{ roles: Role[]; grants: Grant[] }>("/admin/roles"), get<Permission[]>("/admin/permissions")]), []);
  const [selected, setSelected] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<Partial<Role> | null>(null);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [preview, setPreview] = useState<MenuNode[] | null>(null);
  const a = useAction();
  const role = data.data?.[0].roles.find((r) => r.roleId === selected);
  const granted = draft ?? (data.data?.[0].grants.filter((g) => g.roleId === selected).map((g) => g.permissionId) ?? []);
  // Matrix rows are resources ("Admin.Users", "Booking"); columns are the last key segment ("View", "Edit", "Approve" …).
  const resource = (k: string) => k.slice(0, k.lastIndexOf("."));
  const action = (k: string) => k.slice(k.lastIndexOf(".") + 1);
  const modules = useMemo(() => {
    const m = new Map<string, Permission[]>();
    (data.data?.[1] ?? []).forEach((p) => m.set(resource(p.permissionKey), [...(m.get(resource(p.permissionKey)) ?? []), p]));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data.data]);
  const actions = useMemo(() => [...new Set((data.data?.[1] ?? []).map((p) => action(p.permissionKey)))], [data.data]);
  const held = new Set(me?.permissions ?? []);
  return (
    <>
      <PageHeader tagline="Access control" title="Roles & permission matrix" lead="Grants are data. Saving bumps every member's permission version, so the change applies on their next request. You can only grant permissions you hold yourself."
        actions={canEdit && <button className="btn primary" data-testid="role-new" onClick={() => setEditRole({ roleKey: "", roleName: "", description: "", isActive: true })}>New role</button>} />
      <Async state={data}>{([r]) => (
        <div className="grid two">
          <Card title="Roles">
            <DataTable rows={r.roles} rowKey={(x) => x.roleId} onRowClick={(x) => { setSelected(x.roleId); setDraft(null); setPreview(null); }} testId="roles-table" columns={[
              { key: "roleName", header: "Role", render: (x) => <><b>{x.roleName}</b> <span className="mono muted">{x.roleKey}</span></> },
              { key: "flags", header: "", render: (x) => <>{x.isSystem && <Pill value="System" tone="info" />} {!x.isActive && <Pill value="Inactive" />}</> },
              { key: "memberCount", header: "Members" }, { key: "permissionCount", header: "Grants" },
              ...(canEdit ? [{ key: "edit", header: "", render: (x: Role) => <button className="btn small" onClick={(e) => { e.stopPropagation(); setEditRole(x); }}>Edit</button> }] : [])]} />
          </Card>
          <Card title={role ? `Permissions: ${role.roleName}` : "Choose a role"} actions={role && (
            <div className="row">
              <button className="btn small" data-testid="role-preview" onClick={async () => setPreview(await get<MenuNode[]>("/admin/menus/preview", { roleId: role.roleId, area: "Admin" }))}>Preview menu</button>
              {canEdit && <button className="btn small primary" disabled={draft === null || a.busy} data-testid="role-save-perms" onClick={async () => {
                if (await a.run(() => put(`/admin/roles/${role.roleId}/permissions`, { ids: granted }), "Permissions saved") !== undefined) { setDraft(null); data.reload(); }
              }}>Save permissions</button>}
            </div>)}>
            {a.error ? <ErrorBox error={a.error} /> : null}
            {!role ? <p className="muted">Select a role on the left to see its module × action matrix.</p> : (
              <div className="table-wrap">
                <table className="data matrix" data-testid="perm-matrix">
                  <thead><tr><th>Resource</th>{actions.map((x) => <th key={x}>{x}</th>)}</tr></thead>
                  <tbody>{modules.map(([mod, perms]) => (
                    <tr key={mod}><td>{mod}</td>{actions.map((act) => {
                      const p = perms.find((x) => action(x.permissionKey) === act);
                      if (!p) return <td key={act} className="muted">·</td>;
                      const on = granted.includes(p.permissionId);
                      const locked = !canEdit || (!held.has(p.permissionKey) && !on);
                      return <td key={act}><input type="checkbox" aria-label={p.permissionKey} title={p.permissionKey + (locked && canEdit ? " (you do not hold this)" : "")} checked={on} disabled={locked}
                        data-testid={`perm-${p.permissionKey}`} onChange={(e) => setDraft(e.target.checked ? [...granted, p.permissionId] : granted.filter((v) => v !== p.permissionId))} /></td>;
                    })}</tr>))}</tbody>
                </table>
              </div>
            )}
            {preview && <div style={{ marginTop: 12 }}><h3 style={{ fontSize: 14 }}>Admin menu this role would see</h3><MenuPreview tree={preview} /></div>}
          </Card>
        </div>
      )}</Async>
      {editRole && <RoleModal role={editRole} onClose={() => setEditRole(null)} onSaved={() => { setEditRole(null); data.reload(); }} />}
    </>
  );
}

function RoleModal({ role, onClose, onSaved }: { role: Partial<Role>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ roleKey: role.roleKey ?? "", roleName: role.roleName ?? "", description: role.description ?? "", isActive: role.isActive ?? true });
  const a = useAction();
  return (
    <Modal title={role.roleId ? "Edit role" : "New role"} onClose={onClose} testId="role-modal" actions={<>
      {role.roleId && !role.isSystem && <ConfirmButton className="btn danger" confirm="Delete this role? It must have no members." onConfirm={async () => { if (await a.run(() => del(`/admin/roles/${role.roleId}`), "Role deleted") !== undefined) onSaved(); }}>Delete</ConfirmButton>}
      <button className="btn primary" disabled={a.busy} data-testid="role-save" onClick={async () => {
        const body = { ...f, rowVersion: role.rowVersion };
        if (await a.run(() => (role.roleId ? put(`/admin/roles/${role.roleId}`, body) : post("/admin/roles", body)), "Role saved") !== undefined) onSaved();
      }}>Save</button></>}>
      <div className="form">
        <FormError error={a.error} />
        <TextInput label="Role key" value={f.roleKey} disabled={role.isSystem} onChange={(v) => setF({ ...f, roleKey: v })} error={a.fieldError("roleKey")} hint="lower_case_with_underscores" data-testid="role-key" />
        <TextInput label="Role name" value={f.roleName} onChange={(v) => setF({ ...f, roleName: v })} error={a.fieldError("roleName")} data-testid="role-name" />
        <TextArea label="Description" value={f.description} onChange={(v) => setF({ ...f, description: v })} error={a.fieldError("description")} />
        {!role.isSystem && <Checkbox label="Active" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />}
      </div>
    </Modal>
  );
}

function MenuPreview({ tree }: { tree: MenuNode[] }) {
  if (tree.length === 0) return <p className="muted small">No menus.</p>;
  return <ul className="small">{tree.map((n) => <li key={n.key}>{n.title}{n.route ? <span className="mono muted"> {n.route}</span> : null}{n.children.length > 0 && <MenuPreview tree={n.children} />}</li>)}</ul>;
}

export function PermissionsPage() {
  const { has } = useAuth();
  const [search, setSearch] = useState("");
  const perms = useAsync(() => get<Permission[]>("/admin/permissions", { search }), [search]);
  const [edit, setEdit] = useState<Permission | null>(null);
  const [desc, setDesc] = useState("");
  const [active, setActive] = useState(true);
  const a = useAction();
  return (
    <>
      <PageHeader tagline="Access control" title="Permission catalog" lead="Permissions are API capabilities (checked on every request), not just menu switches. Keys change only through migrations; here you can edit the description or switch a non-admin permission off." />
      <div className="toolbar"><TextInput label="Search" value={search} onChange={setSearch} placeholder="key or module" data-testid="perm-search" /></div>
      <Async state={perms}>{(rows) => <DataTable rows={rows} rowKey={(p) => p.permissionId} testId="perms-table" columns={[
        { key: "permissionKey", header: "Key", render: (p) => <span className="mono">{p.permissionKey}</span> },
        { key: "moduleKey", header: "Module" }, { key: "actionKey", header: "Action" }, { key: "description", header: "Description" },
        { key: "roleCount", header: "Roles" }, { key: "isActive", header: "Active", render: (p) => (p.isActive ? "✓" : <Pill value="Inactive" />) },
        ...(has("Admin.Permissions.Edit") ? [{ key: "e", header: "", render: (p: Permission) => <button className="btn small" onClick={() => { setEdit(p); setDesc(p.description ?? ""); setActive(p.isActive); }}>Edit</button> }] : [])]} />}</Async>
      {edit && <Modal title={edit.permissionKey} onClose={() => setEdit(null)} actions={<button className="btn primary" disabled={a.busy} onClick={async () => {
        if (await a.run(() => put(`/admin/permissions/${edit.permissionId}`, { description: desc, isActive: active }), "Saved") !== undefined) { setEdit(null); perms.reload(); }
      }}>Save</button>}>
        {a.error ? <ErrorBox error={a.error} /> : null}
        <div className="form"><TextArea label="Description" value={desc} onChange={setDesc} /><Checkbox label="Active" checked={active} onChange={setActive} /></div>
      </Modal>}
    </>
  );
}

// ---------------- menus ----------------
export function MenusPage() {
  const { has } = useAuth();
  const canEdit = has("Admin.Menus.Edit");
  const [area, setArea] = useState<"Admin" | "Customer">("Admin");
  const menus = useAsync(() => get<MenuRow[]>("/admin/menus", { area }), [area]);
  const perms = useAsync(() => get<Permission[]>("/admin/permissions"), []);
  const [edit, setEdit] = useState<Partial<MenuRow> | null>(null);
  const a = useAction();
  const rows = menus.data ?? [];
  const children = (pid: number | null) => rows.filter((m) => (m.parentMenuId ?? null) === pid).sort((x, y) => x.sortOrder - y.sortOrder || x.menuId - y.menuId);
  const move = async (m: MenuRow, direction: "up" | "down") => { if (await a.run(() => post(`/admin/menus/${m.menuId}/move`, { direction })) !== undefined) menus.reload(); };
  const Tree = ({ pid }: { pid: number | null }) => (
    <ul>{children(pid).map((m) => (
      <li key={m.menuId}>
        <div className="node" data-testid={`menu-node-${m.menuKey}`}>
          <b>{m.title}</b>{m.routePath && <span className="mono muted">{m.routePath}</span>}
          {!m.isActive && <Pill value="Inactive" />}{!m.isVisible && <Pill value="Hidden" tone="warn" />}
          {m.permissionKeys && <span className="small muted">needs: {m.permissionKeys.split(",").join(" or ")}</span>}
          {canEdit && <span className="row" style={{ marginLeft: "auto" }}>
            <button className="btn small" aria-label={`Move ${m.title} up`} onClick={() => move(m, "up")} data-testid={`menu-up-${m.menuKey}`}>↑</button>
            <button className="btn small" aria-label={`Move ${m.title} down`} onClick={() => move(m, "down")} data-testid={`menu-down-${m.menuKey}`}>↓</button>
            <button className="btn small" onClick={() => setEdit(m)} data-testid={`menu-edit-${m.menuKey}`}>Edit</button>
          </span>}
        </div>
        {children(m.menuId).length > 0 && <Tree pid={m.menuId} />}
      </li>))}</ul>
  );
  return (
    <>
      <PageHeader tagline="Navigation" title="Menu tree" lead="Menus, their order and the permissions that reveal them all live in SQL. Changes show up in every user's navigation on their next page load, with no frontend rebuild. Parent changes are checked for loops."
        actions={canEdit && <button className="btn primary" data-testid="menu-new" onClick={() => setEdit({ applicationArea: area, isActive: true, isVisible: true, isExternal: false, sortOrder: 100, menuKey: "", title: "" })}>New menu</button>} />
      <div className="toolbar"><SelectInput label="Area" value={area} onChange={(v) => setArea(v as "Admin" | "Customer")} options={[{ value: "Admin", label: "Admin portal" }, { value: "Customer", label: "Customer site" }]} testId="menu-area" /></div>
      {a.error ? <ErrorBox error={a.error} /> : null}
      <Async state={menus}>{() => <div className="card tree" data-testid="menu-tree"><Tree pid={null} /></div>}</Async>
      {edit && <MenuModal menu={edit} all={rows} perms={perms.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); menus.reload(); }} />}
    </>
  );
}

function MenuModal({ menu, all, perms, onClose, onSaved }: { menu: Partial<MenuRow>; all: MenuRow[]; perms: Permission[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    parentMenuId: menu.parentMenuId ?? null as number | null, menuKey: menu.menuKey ?? "", title: menu.title ?? "", routePath: menu.routePath ?? "", iconKey: menu.iconKey ?? "",
    sortOrder: menu.sortOrder ?? 100, isVisible: menu.isVisible ?? true, isActive: menu.isActive ?? true, isExternal: menu.isExternal ?? false, applicationArea: menu.applicationArea ?? "Admin"
  });
  const initialPerms = perms.filter((p) => (menu.permissionKeys ?? "").split(",").includes(p.permissionKey)).map((p) => p.permissionId);
  const [permIds, setPermIds] = useState<number[]>(initialPerms);
  const [permFilter, setPermFilter] = useState("");
  const a = useAction();
  const save = async () => {
    const body = { ...f, routePath: f.routePath || null, iconKey: f.iconKey || null, rowVersion: menu.rowVersion };
    const r = await a.run(async () => {
      const saved = await (menu.menuId ? put<{ menuId: number }>(`/admin/menus/${menu.menuId}`, body) : post<{ menuId: number }>("/admin/menus", body));
      await put(`/admin/menus/${saved.menuId}/permissions`, { ids: permIds });
      return saved;
    }, "Menu saved");
    if (r) onSaved();
  };
  return (
    <Modal title={menu.menuId ? `Edit menu: ${menu.title}` : "New menu"} onClose={onClose} testId="menu-modal" actions={<>
      {menu.menuId && <ConfirmButton className="btn danger" confirm="Delete this menu? Menus that still have children cannot be deleted." onConfirm={async () => { if (await a.run(() => del(`/admin/menus/${menu.menuId}`), "Menu deleted") !== undefined) onSaved(); }} testId="menu-delete">Delete</ConfirmButton>}
      <button className="btn primary" disabled={a.busy} onClick={save} data-testid="menu-save">Save</button></>}>
      <FormError error={a.error} />
      {a.error && !(a.error as { errors?: unknown }).errors ? <ErrorBox error={a.error} /> : null}
      <div className="form cols">
        <TextInput label="Menu key" value={f.menuKey} onChange={(v) => setF({ ...f, menuKey: v })} error={a.fieldError("menuKey")} hint="e.g. ops.reports" data-testid="menu-key" />
        <TextInput label="Title" value={f.title} onChange={(v) => setF({ ...f, title: v })} error={a.fieldError("title")} data-testid="menu-title" />
        <SelectInput label="Parent" value={f.parentMenuId ?? ""} onChange={(v) => setF({ ...f, parentMenuId: v ? Number(v) : null })} placeholder="(top level)" error={a.fieldError("parentMenuId")}
          options={all.filter((m) => m.menuId !== menu.menuId).map((m) => ({ value: m.menuId, label: m.title + (m.routePath ? ` (${m.routePath})` : "") }))} testId="menu-parent" />
        <TextInput label="Route" value={f.routePath} onChange={(v) => setF({ ...f, routePath: v })} error={a.fieldError("routePath")} hint="Leave empty for a group heading" data-testid="menu-route" />
        <TextInput label="Icon key" value={f.iconKey} onChange={(v) => setF({ ...f, iconKey: v })} />
        <TextInput label="Sort order" type="number" value={f.sortOrder} onChange={(v) => setF({ ...f, sortOrder: Number(v) })} error={a.fieldError("sortOrder")} />
        <Checkbox label="Visible" checked={f.isVisible} onChange={(v) => setF({ ...f, isVisible: v })} />
        <Checkbox label="Active" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} testId="menu-active" />
        <Checkbox label="External link (https)" checked={f.isExternal} onChange={(v) => setF({ ...f, isExternal: v })} />
      </div>
      <h3 style={{ fontSize: 14, margin: "12px 0 4px" }}>Shown to users holding ANY of these permissions</h3>
      <TextInput label="Filter permissions" value={permFilter} onChange={setPermFilter} />
      <div style={{ maxHeight: 180, overflow: "auto", marginTop: 6 }} className="row">
        {perms.filter((p) => p.permissionKey.toLowerCase().includes(permFilter.toLowerCase())).map((p) => (
          <Checkbox key={p.permissionId} label={p.permissionKey} checked={permIds.includes(p.permissionId)} testId={`menu-perm-${p.permissionKey}`}
            onChange={(c) => setPermIds(c ? [...permIds, p.permissionId] : permIds.filter((x) => x !== p.permissionId))} />))}
      </div>
      {permIds.length === 0 && <p className="small muted">No permission: everyone who can open this area sees it (and anonymous visitors on the customer site).</p>}
    </Modal>
  );
}

// ---------------- settings ----------------
export function SettingsPage() {
  const { has } = useAuth();
  const canEdit = has("Admin.Settings.Edit");
  const settings = useAsync(() => get<Setting[]>("/admin/settings"), []);
  const [edit, setEdit] = useState<Setting | null>(null);
  const [creating, setCreating] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, Setting[]>();
    (settings.data ?? []).forEach((s) => m.set(s.category, [...(m.get(s.category) ?? []), s]));
    return [...m.entries()];
  }, [settings.data]);
  return (
    <>
      <PageHeader tagline="Configuration" title="Settings" lead="Non-secret configuration with typed validation. Secrets never live here: a SecretRef setting only names the environment variable. Public settings reach the browser through /public/settings without a rebuild."
        actions={canEdit && <button className="btn primary" onClick={() => setCreating(true)} data-testid="setting-new">New setting</button>} />
      <Async state={settings}>{() => groups.map(([cat, rows]) => (
        <Card key={cat} title={cat}>
          <DataTable rows={rows} rowKey={(s) => s.settingKey} testId={`settings-${cat}`} columns={[
            { key: "settingKey", header: "Key", render: (s) => <span className="mono">{s.settingKey}</span> },
            { key: "settingValue", header: "Value", render: (s) => <span className="mono" data-testid={`setting-value-${s.settingKey}`}>{s.valueType === "SecretRef" ? `env: ${s.settingValue}` : s.settingValue}</span> },
            { key: "valueType", header: "Type" },
            { key: "flags", header: "", render: (s) => <>{s.isPublic && <Pill value="Public" tone="info" />} {!s.isEditable && <Pill value="Migration only" />} {!s.isActive && <Pill value="Inactive" />}</> },
            { key: "updated", header: "Updated", render: (s) => <span className="small">{fmtDateTime(s.updatedAtUtc)} {s.updatedByMasked}</span> },
            ...(canEdit ? [{ key: "e", header: "", render: (s: Setting) => s.isEditable && <button className="btn small" onClick={() => setEdit(s)} data-testid={`setting-edit-${s.settingKey}`}>Edit</button> }] : [])]} />
        </Card>))}</Async>
      {(edit || creating) && <SettingModal setting={edit} onClose={() => { setEdit(null); setCreating(false); }} onSaved={() => { setEdit(null); setCreating(false); settings.reload(); }} />}
    </>
  );
}

function SettingModal({ setting, onClose, onSaved }: { setting: Setting | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ key: setting?.settingKey ?? "", value: setting?.settingValue ?? "", valueType: setting?.valueType ?? "String", category: setting?.category ?? "", description: setting?.description ?? "", isPublic: setting?.isPublic ?? false, isActive: setting?.isActive ?? true });
  const a = useAction();
  const rule = (() => { try { return setting?.validationJson ? JSON.parse(setting.validationJson) : null; } catch { return null; } })();
  const hint = [rule?.min !== undefined && `min ${rule.min}`, rule?.max !== undefined && `max ${rule.max}`, rule?.maxLength && `max ${rule.maxLength} chars`, rule?.allowed && `one of ${rule.allowed.join(", ")}`].filter(Boolean).join(" · ");
  return (
    <Modal title={setting ? setting.settingKey : "New setting"} onClose={onClose} testId="setting-modal" actions={<button className="btn primary" disabled={a.busy} data-testid="setting-save" onClick={async () => {
      const body = { value: f.value, valueType: setting ? null : f.valueType, category: setting ? null : f.category, description: f.description, isPublic: f.isPublic, isActive: f.isActive, rowVersion: setting?.rowVersion };
      if (await a.run(() => put(`/admin/settings/${encodeURIComponent(f.key)}`, body), "Setting saved") !== undefined) onSaved();
    }}>Save</button>}>
      <FormError error={a.error} />
      {a.error && !(a.error as { errors?: unknown }).errors ? <ErrorBox error={a.error} /> : null}
      <div className="form">
        {!setting && <TextInput label="Key" value={f.key} onChange={(v) => setF({ ...f, key: v })} error={a.fieldError("key")} hint="Category.Name, e.g. Ui.Banner" data-testid="setting-key" />}
        {!setting && <SelectInput label="Type" value={f.valueType} onChange={(v) => setF({ ...f, valueType: v })} options={["String", "Int", "Decimal", "Bool", "Json", "SecretRef"].map((x) => ({ value: x, label: x }))} />}
        {!setting && <TextInput label="Category" value={f.category} onChange={(v) => setF({ ...f, category: v })} error={a.fieldError("category")} />}
        {f.valueType === "Bool"
          ? <SelectInput label="Value" value={f.value} onChange={(v) => setF({ ...f, value: v })} options={[{ value: "true", label: "true" }, { value: "false", label: "false" }]} error={a.fieldError("value")} testId="setting-value" />
          : f.valueType === "Json"
            ? <TextArea label="Value (JSON)" value={f.value} onChange={(v) => setF({ ...f, value: v })} error={a.fieldError("value")} hint={hint} data-testid="setting-value" />
            : <TextInput label={f.valueType === "SecretRef" ? "Environment variable name" : "Value"} value={f.value} onChange={(v) => setF({ ...f, value: v })} error={a.fieldError("value")} hint={hint || setting?.description} data-testid="setting-value" />}
        <TextInput label="Description" value={f.description} onChange={(v) => setF({ ...f, description: v })} />
        <Checkbox label="Public (visible to the browser without sign-in)" checked={f.isPublic} onChange={(v) => setF({ ...f, isPublic: v })} />
        <Checkbox label="Active" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
      </div>
    </Modal>
  );
}

// ---------------- content ----------------
export function ContentPage() {
  const rows = useAsync(() => get<Content[]>("/admin/content"), []);
  const [edit, setEdit] = useState<Partial<Content> | null>(null);
  const a = useAction();
  return (
    <>
      <PageHeader tagline="Content" title="Content & notification templates" lead="Home page copy, privacy notice and email templates per language. {{placeholders}} are filled by the server."
        actions={<button className="btn primary" onClick={() => setEdit({ templateKey: "", locale: "en", kind: "Content", subject: "", body: "", isPublic: true })} data-testid="content-new">New template</button>} />
      <Async state={rows}>{(r) => <DataTable rows={r} rowKey={(c) => c.templateKey + c.locale} testId="content-table" columns={[
        { key: "templateKey", header: "Key", render: (c) => <span className="mono">{c.templateKey}</span> }, { key: "locale", header: "Locale" }, { key: "kind", header: "Kind" },
        { key: "subject", header: "Subject / title" }, { key: "updatedAtUtc", header: "Updated", render: (c) => fmtDateTime(c.updatedAtUtc) },
        { key: "e", header: "", render: (c) => <button className="btn small" onClick={() => setEdit(c)} data-testid={`content-edit-${c.templateKey}-${c.locale}`}>Edit</button> }]} />}</Async>
      {edit && <Modal title={edit.templateKey ? `${edit.templateKey} (${edit.locale})` : "New template"} onClose={() => setEdit(null)} testId="content-modal" actions={<button className="btn primary" disabled={a.busy} data-testid="content-save" onClick={async () => {
        if (await a.run(() => put("/admin/content", edit), "Template saved") !== undefined) { setEdit(null); rows.reload(); }
      }}>Save</button>}>
        <FormError error={a.error} />
        <div className="form">
          <div className="form cols">
            <TextInput label="Key" value={edit.templateKey ?? ""} onChange={(v) => setEdit({ ...edit, templateKey: v })} error={a.fieldError("templateKey")} />
            <SelectInput label="Locale" value={edit.locale ?? "en"} onChange={(v) => setEdit({ ...edit, locale: v })} options={[{ value: "en", label: "English" }]} />
            <SelectInput label="Kind" value={edit.kind ?? "Content"} onChange={(v) => setEdit({ ...edit, kind: v })} options={[{ value: "Content", label: "Content" }, { value: "Notification", label: "Notification" }]} />
          </div>
          <TextInput label="Subject / title" value={edit.subject ?? ""} onChange={(v) => setEdit({ ...edit, subject: v })} error={a.fieldError("subject")} data-testid="content-subject" />
          <TextArea label="Body" rows={8} value={edit.body ?? ""} onChange={(v) => setEdit({ ...edit, body: v })} error={a.fieldError("body")} data-testid="content-body" />
          <Checkbox label="Public (shown on the website)" checked={!!edit.isPublic} onChange={(v) => setEdit({ ...edit, isPublic: v })} />
        </div>
      </Modal>}
    </>
  );
}

// ---------------- audit ----------------
export function AuditPage() {
  const [f, setF] = useState({ actor: "", entityType: "", action: "", from: "", to: "", page: 1 });
  const [applied, setApplied] = useState(f);
  const toast = useToast();
  const audit = useAsync(() => get<Paged<Audit>>("/admin/audit", { ...applied, from: applied.from || undefined, to: applied.to ? `${applied.to}T23:59:59Z` : undefined, pageSize: 25 }), [applied]);
  const exportCsv = () => {
    const rows = audit.data?.items ?? [];
    const csv = ["when,actor,action,entity,entityId,correlationId", ...rows.map((r) => [r.occurredAtUtc, r.actorEmailMasked, r.action, r.entityType, r.entityId, r.correlationId].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "audit.csv"; a.click(); toast("CSV exported (this page)", "ok");
  };
  return (
    <>
      <PageHeader tagline="Compliance" title="Audit log" lead="Insert-only (a trigger blocks edits and deletes). Emails are masked and payloads redacted." actions={<button className="btn" onClick={exportCsv} data-testid="audit-export">Export CSV</button>} />
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setApplied({ ...f, page: 1 }); }}>
        <TextInput label="Actor" value={f.actor} onChange={(v) => setF({ ...f, actor: v })} data-testid="audit-actor" />
        <SelectInput label="Entity" value={f.entityType} onChange={(v) => setF({ ...f, entityType: v })} placeholder="Any" options={["User", "Role", "Menu", "Setting", "Content", "Booking", "ApprovalRequest", "Trip", "RecoveryProposal", "Document", "Supplier", "Workflow"].map((x) => ({ value: x, label: x }))} testId="audit-entity" />
        <TextInput label="Action starts with" value={f.action} onChange={(v) => setF({ ...f, action: v })} placeholder="e.g. Booking." data-testid="audit-action" />
        <TextInput label="From" type="date" value={f.from} onChange={(v) => setF({ ...f, from: v })} />
        <TextInput label="To" type="date" value={f.to} onChange={(v) => setF({ ...f, to: v })} />
        <button className="btn primary" data-testid="audit-search">Search</button>
      </form>
      <Async state={audit}>{(d) => <><AuditTable rows={d.items} /><Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => setApplied({ ...applied, page: p })} /></>}</Async>
    </>
  );
}
