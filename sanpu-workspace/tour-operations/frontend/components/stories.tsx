"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  ApiError, Async, DataTable, FormError, Icon, ImagePicker, Modal, PageHeader, Pill, SelectInput, TextArea, TextInput, Checkbox,
  fmtDateTime, get, post, put, useAction, useAsync, useToast,
} from "@sanpu/web";

type Kind = "News" | "Blog";
interface Card { articleId: number; kind: Kind; slug: string; title: string; summary: string; category: string; imageUrl?: string | null; imageAlt?: string | null; authorName?: string; readMinutes: number; publishedAtUtc?: string | null; writtenBy?: string }
interface List { items: Card[]; categories: { category: string; articles: number }[]; total: number; page: number; pageSize: number }
interface Full extends Card { body: string; tags?: string | null }
const META: Record<Kind, { base: string; title: string; tagline: string; lead: string }> = {
  News: { base: "/news", title: "News", tagline: "Sanpu Travel", lead: "Updates on travel in Taiwan and what is new at Sanpu: routes, seasons, services and the way people travel." },
  Blog: { base: "/blog", title: "Travel blog", tagline: "Ideas & guides", lead: "Practical guides, food and culture, and stories from the people who plan our trips." },
};
const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

/** Safe article formatter: paragraphs, ## headings, bullet lists, **bold**. No HTML is injected. */
function Body({ text }: { text: string }) {
  const inline = (s: string, k: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={k + i}>{p.slice(2, -2)}</b> : <Fragment key={k + i}>{p}</Fragment>));
  const out: ReactNode[] = []; let list: string[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={"u" + out.length}>{list.map((x, i) => <li key={i}>{inline(x, "l" + i)}</li>)}</ul>); list = []; } };
  text.replace(/\r/g, "").split("\n").forEach((raw, n) => {
    const line = raw.trim();
    const b = /^[-*•]\s+(.*)$/.exec(line);
    if (b) { list.push(b[1]); return; }
    flush();
    if (/^#{2,4}\s+/.test(line)) out.push(<h2 key={n}>{line.replace(/^#+\s+/, "")}</h2>);
    else if (line) out.push(<p key={n}>{inline(line, "p" + n)}</p>);
  });
  flush();
  return <div className="st-body">{out}</div>;
}

function StoryCard({ a, big }: { a: Card; big?: boolean }) {
  const href = `${META[a.kind].base}/${a.slug}`;
  return (
    <article className={`st-card${big ? " big" : ""}`}>
      <Link href={href} className="st-img" style={a.imageUrl ? { backgroundImage: `url(${a.imageUrl})` } : undefined} aria-label={a.title} />
      <div className="st-meta"><span className="st-cat">{a.category}</span><span>{date(a.publishedAtUtc)} · {a.readMinutes} min read</span></div>
      <h3><Link href={href}>{a.title}</Link></h3>
      <p>{a.summary}</p>
      <Link href={href} className="st-more">Read more →</Link>
    </article>
  );
}

/** /news and /blog: featured story, category filter, grid, load more. */
export function StoriesPage({ kind }: { kind: Kind }) {
  const m = META[kind];
  const [cat, setCat] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Card[]>([]);
  const list = useAsync(() => get<List>("/content/articles", { kind, category: cat, page }), [kind, cat, page]);
  useEffect(() => { if (list.data) setItems((prev) => (page === 1 ? list.data!.items : [...prev, ...list.data!.items.filter((x) => !prev.some((p) => p.articleId === x.articleId))])); }, [list.data, page]);
  const more = list.data ? items.length < list.data.total : false;
  return (
    <div className="st-page">
      <section className="st-hero"><div className="st-wrap">
        <p className="tagline">{m.tagline}</p><h1>{m.title}</h1><p className="lead">{m.lead}</p>
        <div className="st-cats" role="tablist">
          <button role="tab" aria-selected={!cat} className={!cat ? "on" : ""} onClick={() => { setCat(""); setPage(1); }}>All</button>
          {(list.data?.categories ?? []).map((c) => <button key={c.category} role="tab" aria-selected={cat === c.category} className={cat === c.category ? "on" : ""} onClick={() => { setCat(c.category); setPage(1); }}>{c.category} <i>{c.articles}</i></button>)}
        </div>
      </div></section>
      <div className="st-wrap">
        {page === 1 ? (
          <Async state={list}>{() => items.length === 0 ? <p className="muted">No articles yet.</p> : (
            <>
              <StoryCard a={items[0]} big />
              <div className="st-grid">{items.slice(1).map((a) => <StoryCard key={a.articleId} a={a} />)}</div>
            </>
          )}</Async>
        ) : (
          <>
            <StoryCard a={items[0]} big />
            <div className="st-grid">{items.slice(1).map((a) => <StoryCard key={a.articleId} a={a} />)}</div>
          </>
        )}
        {more && <div className="st-load"><button className="btn" disabled={list.loading} onClick={() => setPage(page + 1)} data-testid="stories-more">{list.loading ? "Loading…" : "Load more"}</button><small className="muted">Showing {items.length} of {list.data?.total}</small></div>}
      </div>
    </div>
  );
}

/** /news/[slug] and /blog/[slug]. */
export function ArticlePage({ kind }: { kind: Kind }) {
  const { slug } = useParams<{ slug: string }>();
  const page = useAsync(() => get<{ article: Full; related: Card[] }>(`/content/articles/${slug}`), [slug]);
  const [copied, setCopied] = useState(false);
  return (
    <Async state={page}>{({ article: a, related }) => (
      <article className="st-article">
        <header className="st-ahero" style={a.imageUrl ? { backgroundImage: `url(${a.imageUrl})` } : undefined} role="img" aria-label={a.imageAlt ?? a.title}>
          <div className="st-wrap">
            <Link href={META[kind].base} className="st-back">← {META[kind].title}</Link>
            <span className="st-cat">{a.category}</span>
            <h1>{a.title}</h1>
            <p>{a.summary}</p>
            <div className="st-by"><Icon name="user" size={14} /> {a.authorName} · {date(a.publishedAtUtc)} · {a.readMinutes} min read</div>
          </div>
        </header>
        <div className="st-wrap st-layout">
          <div>
            <Body text={a.body} />
            {a.tags && <div className="st-tags">{a.tags.split(",").map((t) => <span key={t}>#{t.trim()}</span>)}</div>}
            <p className="st-credit muted">Photo: {a.imageAlt ?? "Sanpu photo library"} · <Link href="/credits">photo credits</Link></p>
          </div>
          <aside className="st-side">
            <b>Share</b>
            <button className="btn small" onClick={async () => { try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } }}>{copied ? "Link copied" : "Copy link"}</button>
            <b>Plan your trip</b>
            <Link className="btn small primary" href="/tours">Browse tours</Link>
            <Link className="btn small" href="/deals">See deals</Link>
          </aside>
        </div>
        {related.length > 0 && <section className="st-wrap st-related"><h2>More from {META[kind].title.toLowerCase()}</h2><div className="st-grid">{related.map((r) => <StoryCard key={r.articleId} a={{ ...r, kind }} />)}</div></section>}
      </article>
    )}</Async>
  );
}

// ------------------------------------------------------------------ admin
interface AdminRow extends Full { status: string; aiModel?: string | null; createdAtUtc: string; rowVersion?: string }
const empty = { kind: "Blog", title: "", summary: "", body: "", category: "", tags: "", imageUrl: "/images/photos/hualien.jpg", imageAlt: "", status: "Draft" };

export function ArticlesAdminPage() {
  const [f, setF] = useState({ kind: "", status: "", search: "" });
  const list = useAsync(() => get<AdminRow[]>("/ops/articles", f), [f.kind, f.status, f.search]);
  const [edit, setEdit] = useState<{ id: number | null; form: typeof empty; rowVersion?: string } | null>(null);
  const [ai, setAi] = useState<{ kind: Kind; topic: string; publish: boolean } | null>(null);
  const save = useAction(); const write = useAction(); const status = useAction();
  const toast = useToast();
  const setForm = (k: keyof typeof empty, v: string) => setEdit((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));
  return (
    <>
      <PageHeader tagline="Sales & marketing" title="News & blog"
        lead="Articles for the News and Travel blog pages. The AI writer publishes original articles on its own schedule using real photos from our library; you can edit, unpublish or ask it for a topic."
        actions={<><button className="btn" onClick={() => { write.clear(); setAi({ kind: "News", topic: "", publish: true }); }} data-testid="ai-write-open"><Icon name="sparkle" size={16} /> Write with AI</button>
          <button className="btn primary" onClick={() => { save.clear(); setEdit({ id: null, form: { ...empty } }); }} data-testid="article-new">New article</button></>} />
      <div className="toolbar">
        <TextInput label="Search" value={f.search} onChange={(v) => setF({ ...f, search: v })} placeholder="Title or category" />
        <SelectInput label="Section" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} placeholder="Any" options={[{ value: "News", label: "News" }, { value: "Blog", label: "Blog" }]} />
        <SelectInput label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="Any" options={["Published", "Draft", "Archived"].map((x) => ({ value: x, label: x }))} />
      </div>
      <Async state={list}>{(rows) => (
        <DataTable rows={rows} rowKey={(r) => r.articleId} testId="articles"
          columns={[
            { key: "img", header: "", render: (r) => r.imageUrl ? <span className="thumb" style={{ backgroundImage: `url(${r.imageUrl})` }} aria-hidden="true" /> : null },
            { key: "title", header: "Title", render: (r) => <span><b>{r.title}</b><br /><small className="muted">{r.kind} · {r.category}</small></span> },
            { key: "by", header: "Written by", render: (r) => (r.writtenBy === "AI" ? <span><Icon name="sparkle" size={13} /> AI writer</span> : "Staff") },
            { key: "status", header: "Status", render: (r) => <Pill value={r.status} /> },
            { key: "pub", header: "Published", render: (r) => (r.publishedAtUtc ? fmtDateTime(r.publishedAtUtc) : "—") },
            { key: "act", header: "", render: (r) => (
              <span className="row-actions">
                {r.status === "Published" && <Link className="btn small subtle" href={`/${r.kind === "News" ? "news" : "blog"}/${r.slug}`} target="_blank">View</Link>}
                <button className="btn small" onClick={() => { save.clear(); setEdit({ id: r.articleId, rowVersion: r.rowVersion, form: { kind: r.kind, title: r.title, summary: r.summary, body: r.body, category: r.category, tags: r.tags ?? "", imageUrl: r.imageUrl ?? "", imageAlt: r.imageAlt ?? "", status: r.status } }); }}>Edit</button>
                <button className="btn small" disabled={status.busy} onClick={async () => { if (await status.run(() => post(`/ops/articles/${r.articleId}/status`, { status: r.status === "Published" ? "Draft" : "Published" }), r.status === "Published" ? "Unpublished" : "Published") !== undefined) list.reload(); }}>{r.status === "Published" ? "Unpublish" : "Publish"}</button>
              </span>) },
          ]} />
      )}</Async>

      {edit && (
        <Modal title={edit.id ? "Edit article" : "New article"} onClose={() => setEdit(null)} testId="article-modal"
          actions={<><button className="btn primary" disabled={save.busy} data-testid="article-save" onClick={async () => {
            const body = { ...edit.form, rowVersion: edit.rowVersion };
            if (await save.run(() => (edit.id ? put(`/ops/articles/${edit.id}`, body) : post("/ops/articles", body)), "Article saved") !== undefined) { setEdit(null); list.reload(); }
          }}>Save</button><button className="btn" onClick={() => setEdit(null)}>Close</button></>}>
          <FormError error={save.error} />
          <div className="form-grid">
            <SelectInput label="Section" value={edit.form.kind} onChange={(v) => setForm("kind", v)} options={[{ value: "News", label: "News" }, { value: "Blog", label: "Blog" }]} />
            <SelectInput label="Status" value={edit.form.status} onChange={(v) => setForm("status", v)} options={["Draft", "Published", "Archived"].map((x) => ({ value: x, label: x }))} />
            <TextInput label="Title" value={edit.form.title} onChange={(v) => setForm("title", v)} error={save.fieldError("title")} />
            <TextInput label="Category" value={edit.form.category} onChange={(v) => setForm("category", v)} error={save.fieldError("category")} placeholder="Industry, Sanpu news, Travel guides…" />
          </div>
          <TextArea label="Summary" value={edit.form.summary} onChange={(v) => setForm("summary", v)} error={save.fieldError("summary")} />
          <TextArea label="Article (## for headings, - for lists, **bold**)" value={edit.form.body} onChange={(v) => setForm("body", v)} error={save.fieldError("body")} rows={12} />
          <TextInput label="Tags (comma separated)" value={edit.form.tags} onChange={(v) => setForm("tags", v)} error={save.fieldError("tags")} />
          <ImagePicker label="Photo" value={edit.form.imageUrl} onChange={(v) => setForm("imageUrl", v)} error={save.fieldError("imageUrl")} hint="Use a real photograph: upload one or pick from the library." />
          <TextInput label="Photo description" value={edit.form.imageAlt} onChange={(v) => setForm("imageAlt", v)} />
        </Modal>
      )}

      {ai && (
        <Modal title="Write with AI" onClose={() => setAi(null)} testId="ai-write-modal"
          actions={<><button className="btn primary" disabled={write.busy} data-testid="ai-write-go" onClick={async () => {
            const r = await write.run(() => post<{ slug: string; status: string }>("/ops/articles/write", ai));
            if (r) { toast(r.status === "Published" ? "Article written and published" : "Draft written", "ok"); setAi(null); list.reload(); }
          }}>{write.busy ? "Writing… (about 30 seconds)" : "Write article"}</button><button className="btn" onClick={() => setAi(null)}>Close</button></>}>
          {write.error ? <div className="alert error" role="alert">{write.error instanceof ApiError ? write.error.message : "The writer could not finish. Try again."}</div> : null}
          <p className="muted">The writer uses original wording only, no quotes from real people and no invented figures, and picks a real photo from our library. It writes for Sanpu Travel Editorial.</p>
          <SelectInput label="Section" value={ai.kind} onChange={(v) => setAi({ ...ai, kind: v as Kind })} options={[{ value: "News", label: "News: Taiwan travel industry and Sanpu" }, { value: "Blog", label: "Blog: guides, ideas and Sanpu stories" }]} />
          <TextInput label="Topic (optional)" value={ai.topic} onChange={(v) => setAi({ ...ai, topic: v })} placeholder="Leave empty to let the writer choose the next topic" />
          <Checkbox label="Publish at once (otherwise save as a draft)" checked={ai.publish} onChange={(v) => setAi({ ...ai, publish: v })} />
        </Modal>
      )}
    </>
  );
}
