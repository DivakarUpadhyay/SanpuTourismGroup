"use client";

import { useState, type ReactNode } from "react";
import { ImagePicker } from "./image-picker";
import { Async, Checkbox, DataTable, FormError, Modal, PageHeader, SelectInput, TextArea, TextInput, useAction, useAsync, type Column } from "./ui";

export interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select" | "checkbox" | "date" | "multicheck" | "image";
  options?: { value: string | number; label: string }[];
  hint?: string;
  lockedOnEdit?: boolean;
  placeholder?: string;
}

export type FormValues = Record<string, unknown>;

/** Generic list + create/edit modal for database-owned master data. Every save goes to the API (and a stored procedure); nothing is kept in the page. */
export function EntityPage<T>({ tagline, title, lead, load, columns, rowKey, fields, toForm, save, canEdit, newLabel = "New", testId, extraActions, rowActions }: {
  tagline: string; title: string; lead?: ReactNode; load: () => Promise<T[]>; columns: Column<T>[]; rowKey: (r: T) => string | number;
  fields: FieldDef[] | ((editing: T | null) => FieldDef[]); toForm: (row: T | null) => FormValues; save: (form: FormValues, row: T | null) => Promise<unknown>;
  canEdit: boolean; newLabel?: string; testId: string; extraActions?: ReactNode; rowActions?: (row: T, reload: () => void) => ReactNode;
}) {
  const state = useAsync(load, []);
  const [editing, setEditing] = useState<{ row: T | null; form: FormValues } | null>(null);
  const action = useAction();
  const defs = editing ? (typeof fields === "function" ? fields(editing.row) : fields) : [];
  const set = (k: string, v: unknown) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  const cols: Column<T>[] = [...columns];
  if (canEdit || rowActions) cols.push({
    key: "_actions", header: "", render: (r) => (
      <div className="row">
        {canEdit && <button className="btn small" data-testid={`${testId}-edit`} onClick={(e) => { e.stopPropagation(); action.clear(); setEditing({ row: r, form: toForm(r) }); }}>Edit</button>}
        {rowActions?.(r, state.reload)}
      </div>
    )
  });

  const submit = async () => {
    const ok = await action.run(() => save(editing!.form, editing!.row), "Saved");
    if (ok !== undefined) { setEditing(null); state.reload(); }
  };

  return (
    <>
      <PageHeader tagline={tagline} title={title} lead={lead} actions={<>{extraActions}{canEdit && newLabel && <button className="btn primary" data-testid={`${testId}-new`} onClick={() => { action.clear(); setEditing({ row: null, form: toForm(null) }); }}>{newLabel}</button>}</>} />
      <Async state={state}>{(rows) => <DataTable rows={rows} columns={cols} rowKey={rowKey} testId={`${testId}-table`} />}</Async>
      {editing && (
        <Modal title={editing.row ? `Edit ${title.toLowerCase()}` : newLabel} onClose={() => setEditing(null)} testId={`${testId}-modal`}
               actions={<button className="btn primary" disabled={action.busy} onClick={submit} data-testid={`${testId}-save`}>{action.busy ? "Saving…" : "Save"}</button>}>
          <FormError error={action.error} />
          <div className="form cols">
            {defs.map((f) => <FieldControl key={f.name} def={f} value={editing.form[f.name]} onChange={(v) => set(f.name, v)} error={action.fieldError(f.name)} locked={!!editing.row && !!f.lockedOnEdit} />)}
          </div>
        </Modal>
      )}
    </>
  );
}

export function FieldControl({ def, value, onChange, error, locked }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string; locked?: boolean }) {
  const t = def.type ?? "text";
  if (t === "checkbox") return <div className="field"><Checkbox label={def.label} checked={!!value} onChange={onChange} testId={`f-${def.name}`} />{error && <div className="error">{error}</div>}</div>;
  if (t === "select") return <SelectInput label={def.label} value={String(value ?? "")} onChange={onChange} options={def.options ?? []} error={error} hint={def.hint} placeholder={def.placeholder} testId={`f-${def.name}`} disabled={locked} />;
  if (t === "textarea") return <TextArea label={def.label} value={String(value ?? "")} onChange={onChange} error={error} hint={def.hint} data-testid={`f-${def.name}`} />;
  if (t === "image") return <ImagePicker label={def.label} value={String(value ?? "")} onChange={onChange} hint={def.hint} error={error} testId={`f-${def.name}`} />;
  if (t === "multicheck") {
    const list = (value as string[]) ?? [];
    return (
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{def.label}</legend>
        <div className="row">{(def.options ?? []).map((o) => <Checkbox key={o.value} label={o.label} checked={list.includes(String(o.value))}
          onChange={(c) => onChange(c ? [...list, String(o.value)] : list.filter((x) => x !== String(o.value)))} testId={`f-${def.name}-${o.value}`} />)}</div>
        {error && <div className="error">{error}</div>}
      </fieldset>
    );
  }
  return <TextInput label={def.label} type={t === "number" ? "number" : t === "date" ? "date" : "text"} value={value === null || value === undefined ? "" : String(value)}
                    onChange={(v) => onChange(t === "number" ? (v === "" ? null : Number(v)) : v)} error={error} hint={def.hint} disabled={locked} placeholder={def.placeholder} data-testid={`f-${def.name}`} />;
}
