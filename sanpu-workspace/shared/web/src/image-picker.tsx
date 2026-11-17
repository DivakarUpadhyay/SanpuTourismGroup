"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "./api";
import { Icon } from "./icons";

interface LibraryItem { url: string; label: string }

/** Image field for admin forms: upload a photo from the computer (JPG, PNG or WebP up to 5 MB), pick one from the
    photo library, or clear it. Uploaded files are stored by the API in its media folder and referenced by URL. */
export function ImagePicker({ label, value, onChange, hint, error, testId }: {
  label: string; value: string; onChange: (url: string) => void; hint?: string; error?: string; testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[] | null>(null);

  useEffect(() => {
    if (!libOpen || library) return;
    Promise.all([
      fetch("/images/photos/credits.json").then((r) => r.json() as Promise<{ file: string; key: string }[]>).catch(() => []),
      api<{ url: string; originalName: string }[]>("/ops/media").catch(() => []),
    ]).then(([photos, uploads]) => setLibrary([
      ...uploads.map((u) => ({ url: u.url, label: u.originalName })),
      ...photos.map((p) => ({ url: p.file, label: p.key.replace(/-/g, " ") })),
    ]));
  }, [libOpen, library]);

  async function upload(file: File) {
    setProblem(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setProblem("Use a JPG, PNG or WebP image."); return; }
    if (file.size > 5 * 1024 * 1024) { setProblem("The image is larger than 5 MB. Please use a smaller photo."); return; }
    const form = new FormData(); form.append("file", file);
    setBusy(true);
    try {
      const res = await api<{ url: string }>("/ops/media", { method: "POST", form });
      onChange(res.url); setLibrary(null);
    } catch (e) {
      setProblem(e instanceof ApiError ? (Object.values(e.errors ?? {})[0]?.[0] ?? e.message) : "The upload did not finish. Please try again.");
    } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return (
    <div className={`field img-pick${error || problem ? " has-error" : ""}`} data-testid={testId}>
      <span className="label">{label}</span>
      <div className={`ip-box${drag ? " drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}>
        <div className="ip-preview" style={value ? { backgroundImage: `url(${value})` } : undefined}>
          {!value && <span><Icon name="image" />No image</span>}
          {busy && <span className="ip-busy">Uploading…</span>}
        </div>
        <div className="ip-actions">
          <button type="button" className="btn primary small" onClick={() => input.current?.click()} disabled={busy} data-testid={testId ? `${testId}-upload` : undefined}>
            <Icon name="upload" /> {value ? "Replace image" : "Upload image"}
          </button>
          <button type="button" className="btn small" onClick={() => setLibOpen((o) => !o)} aria-expanded={libOpen}>Photo library</button>
          {value && <button type="button" className="btn small subtle" onClick={() => onChange("")}>Remove</button>}
          <small>Drag a photo here, or upload JPG, PNG or WebP up to 5 MB.</small>
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} data-testid={testId ? `${testId}-file` : undefined} />
      </div>
      {libOpen && (
        <div className="ip-lib" role="listbox" aria-label="Photo library">
          {!library ? <p className="muted">Loading photos…</p> : library.map((x) => (
            <button type="button" key={x.url} role="option" aria-selected={x.url === value} className={x.url === value ? "on" : ""}
              onClick={() => { onChange(x.url); setLibOpen(false); }} title={x.label}>
              <span style={{ backgroundImage: `url(${x.url})` }} /><small>{x.label}</small>
            </button>))}
        </div>
      )}
      {(problem || error) && <div className="error">{problem ?? error}</div>}
      {hint && !problem && !error && <div className="hint">{hint}</div>}
    </div>
  );
}
