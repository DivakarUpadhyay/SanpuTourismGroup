"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { useContent, usePublicConfig, useSetting } from "./shell";
import { Loading } from "./ui";

interface Section { id: string; title: string; blocks: ReactNode[] }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Turns the plain-text content format into blocks: "## " section, "### " sub-heading, "- " bullet, anything else a paragraph. */
function parse(body: string, fill: (s: string) => string) {
  const lines = body.split(/\r?\n/).map((l) => fill(l.trim())).filter(Boolean);
  const intro: string[] = [], glance: string[] = [];
  const sections: Section[] = [];
  let list: string[] = [];
  const flush = (into: ReactNode[]) => { if (list.length) { into.push(<ul key={`u${into.length}`}>{list.map((x) => <li key={x}>{x}</li>)}</ul>); list = []; } };
  for (const line of lines) {
    const cur = sections[sections.length - 1];
    if (line.startsWith("## ")) { if (cur) flush(cur.blocks); const t = line.slice(3); sections.push({ id: slug(t), title: t, blocks: [] }); }
    else if (!cur) (line.startsWith("- ") ? glance : intro).push(line.replace(/^- /, ""));
    else if (line.startsWith("### ")) { flush(cur.blocks); cur.blocks.push(<h3 key={`h${cur.blocks.length}`}>{line.slice(4)}</h3>); }
    else if (line.startsWith("- ")) list.push(line.slice(2));
    else { flush(cur.blocks); cur.blocks.push(<p key={`p${cur.blocks.length}`}>{line}</p>); }
  }
  if (sections.length) flush(sections[sections.length - 1].blocks);
  return { intro, glance, sections };
}

const OTHER: Record<string, [string, string]> = { "privacy.notice": ["Privacy notice", "lock"], terms: ["Terms of use", "file"], cookies: ["Cookie policy", "shield"] };

/** Public legal page (/legal/[key]) from a ContentTemplates row: summary, sticky contents, numbered sections, print and contact. */
export function LegalPage() {
  const { key } = useParams<{ key: string }>();
  const { loaded } = usePublicConfig();
  const doc = useContent(key) as ({ subject: string; body: string; updatedAtUtc?: string } | undefined);
  const brand = useSetting("Ui.BrandName", "Sanpu");
  const support = useSetting("Ui.SupportEmail", "our support team");
  const fill = (s: string) => s.replaceAll("{brand}", brand).replaceAll("{support}", support);
  const parsed = useMemo(() => (doc ? parse(doc.body, fill) : null), [doc?.body, brand, support]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [active, setActive] = useState("");
  useEffect(() => {
    if (!parsed) return;
    const obs = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive(v.target.id); },
      { rootMargin: "-110px 0px -65% 0px" });
    parsed.sections.forEach((s) => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [parsed]);
  // a link straight to a section (#your-rights) lands there once the content has loaded
  useEffect(() => { if (parsed && location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); }, [parsed]);
  if (!loaded) return <Loading lines={8} />;
  if (!doc || !parsed) return (
    <div className="lg-missing"><h1>Page not found</h1><p>This page does not exist or is not public.</p><Link className="btn primary" href="/">Back to home</Link></div>
  );
  const updated = doc.updatedAtUtc ? new Date(doc.updatedAtUtc).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
  const minutes = Math.max(1, Math.round(doc.body.split(/\s+/).length / 220));
  return (
    <article className="legal-page">
      <header className="lg-head">
        <p className="kicker">Legal</p>
        <h1>{doc.subject}</h1>
        <p className="lg-meta">{updated && <span><Icon name="calendar" size={14} />Last updated {updated}</span>}<span><Icon name="file" size={14} />{minutes} min read</span>
          <button type="button" className="link-btn" onClick={() => window.print()}><Icon name="list" size={14} />Print or save as PDF</button></p>
        {parsed.intro.map((p) => <p key={p} className="lg-lead">{p}</p>)}
        {parsed.glance.length > 0 && (
          <div className="lg-glance"><b>At a glance</b><ul>{parsed.glance.map((g) => <li key={g}><Icon name="check" size={16} />{g}</li>)}</ul></div>
        )}
      </header>
      <div className="lg-body">
        <nav className="lg-toc" aria-label="Contents">
          <b>Contents</b>
          <ol>{parsed.sections.map((s, i) => <li key={s.id}><a href={`#${s.id}`} className={active === s.id ? "on" : undefined}><span>{String(i + 1).padStart(2, "0")}</span>{s.title}</a></li>)}</ol>
        </nav>
        <div className="lg-content">
          {parsed.sections.map((s, i) => (
            <section key={s.id} id={s.id} className="lg-sec"><h2><span>{String(i + 1).padStart(2, "0")}</span>{s.title}</h2>{s.blocks}</section>
          ))}
          <aside className="lg-help">
            <span className="ico"><Icon name="help" size={20} /></span>
            <div><b>Questions about this page?</b><span>Write to {support} or use the contact form. We reply within one working day.</span></div>
            <Link className="btn primary" href="/contact">Contact us</Link>
          </aside>
          <nav className="lg-other" aria-label="Other legal pages">
            {Object.entries(OTHER).filter(([k]) => k !== key).map(([k, [t, icon]]) => <Link key={k} href={`/legal/${k}`}><Icon name={icon} size={18} /><span>{t}</span><Icon name="arrow" size={16} /></Link>)}
          </nav>
        </div>
      </div>
    </article>
  );
}
