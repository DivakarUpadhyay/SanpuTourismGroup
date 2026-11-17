"use client";

import { useParams } from "next/navigation";
import { usePublicConfig, useContent } from "./shell";
import { Loading, PageHeader } from "./ui";

/** Public legal/content page (/legal/[key]) rendered from a public ContentTemplates row; staff edit it in Admin → Content. */
export function LegalPage() {
  const { key } = useParams<{ key: string }>();
  const { loaded } = usePublicConfig();
  const doc = useContent(key);
  if (!loaded) return <Loading lines={6} />;
  if (!doc) return <><PageHeader tagline="Legal" title="Page not found" lead="This page does not exist or is not public." /></>;
  return (
    <article className="legal-doc">
      <PageHeader tagline="Legal" title={doc.subject} />
      <div className="card legal-body">{doc.body.split(/\n+/).map((line, i) => <p key={i}>{line}</p>)}</div>
    </article>
  );
}
