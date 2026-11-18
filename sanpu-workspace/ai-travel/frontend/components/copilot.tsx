"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Async, Card, Checkbox, ConfirmButton, DataTable, Demo, EntityPage, ErrorBox, FormError, Kpi, Modal, PageHeader, Pill, SelectInput, TextArea, TextInput,
  api, fmtDate, fmtDateTime, get, money, post, put, useAction, useAsync, useAuth
} from "@sanpu/web";
import { Itinerary, SearchView, type TripDetail } from "./traveler";

function AiBanner({ ai }: { ai: { available: boolean; message: string; model: string } }) {
  return <div className={`alert ${ai.available ? "ok" : "warn"}`} data-testid="ai-status">{ai.available ? `AI available (${ai.model}). ` : ""}{ai.message}</div>;
}

export function CopilotDashboard() {
  const { has } = useAuth();
  const d = useAsync(() => (has("AiOps.Dashboard.View") ? get<any>("/aiops/dashboard") : Promise.resolve(null)), []);
  if (!has("AiOps.Dashboard.View")) return <><PageHeader tagline="Overview" title="Dashboard" /><p className="muted">Use the menu to open your pages.</p></>;
  return (
    <>
      <PageHeader tagline="Copilot" title="AI operations dashboard" lead="Trips, disruptions, proposals waiting for a human, documents to review, and what the model costs." />
      <Async state={d}>{(x) => (
        <>
          <AiBanner ai={x.ai} />
          <div style={{ height: 12 }} />
          <div className="kpis">
            <Kpi label="Active trips" value={x.kpis.activeTrips} href="/admin/trips" /><Kpi label="Disrupted trips" value={x.kpis.disruptedTrips} testId="kpi-disrupted" href="/admin/trips" />
            <Kpi label="Proposals awaiting review" value={x.kpis.pendingProposals} testId="kpi-proposals" href="/admin/proposals" /><Kpi label="Documents to review" value={x.kpis.documentsToReview} href="/admin/documents" />
          </div>
          <div className="grid two">
            <Card title="Recent proposals"><DataTable rows={x.recentProposals} rowKey={(p: any) => p.proposalId} columns={[
              { key: "proposalRef", header: "Proposal", render: (p: any) => <Link href={`/admin/proposals/${p.proposalId}`}>{p.proposalRef}</Link> }, { key: "tripRef", header: "Trip" },
              { key: "status", header: "Status", render: (p: any) => <Pill value={p.status} /> }, { key: "createdAtUtc", header: "When", render: (p: any) => fmtDateTime(p.createdAtUtc) }]} /></Card>
            <Card title="Trips by region"><DataTable rows={x.tripsByRegion} rowKey={(r: any) => r.regionName} columns={[{ key: "regionName", header: "Region" }, { key: "trips", header: "Trips" }]} /></Card>
          </div>
        </>
      )}</Async>
    </>
  );
}

export const StaffSearchPage = () => <SearchView staff />;

export function TripsPage() {
  const router = useRouter();
  const [f, setF] = useState({ search: "", status: "" });
  const trips = useAsync(() => get<any[]>("/aiops/trips", f), [f]);
  return (
    <>
      <PageHeader tagline="Trips" title="Trips & itinerary versions" lead="Traveler contact details are masked. Open a trip to simulate a disruption." />
      <div className="toolbar">
        <TextInput label="Search" value={f.search} onChange={(v) => setF({ ...f, search: v })} placeholder="ref, name or traveler" data-testid="trips-search" />
        <SelectInput label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="Any" options={["Draft", "Active", "Disrupted", "Completed"].map((s) => ({ value: s, label: s }))} />
      </div>
      <Async state={trips}>{(rows) => <DataTable rows={rows} rowKey={(t: any) => t.tripId} onRowClick={(t: any) => router.push(`/admin/trips/${t.tripId}`)} testId="trips-table" columns={[
        { key: "tripRef", header: "Trip", render: (t: any) => <>{t.tripRef}<Demo show={t.isDemo} /></> }, { key: "name", header: "Name" }, { key: "travelerEmailMasked", header: "Traveler" },
        { key: "regionName", header: "Region" }, { key: "startDate", header: "Starts", render: (t: any) => fmtDate(t.startDate) }, { key: "mobilityNeeds", header: "Mobility" },
        { key: "currentVersion", header: "Version", render: (t: any) => `v${t.currentVersion}` }, { key: "status", header: "Status", render: (t: any) => <Pill value={t.status} /> },
        { key: "pendingProposals", header: "Pending proposals" }]} />}</Async>
    </>
  );
}

export function StaffTripPage() {
  const { id } = useParams<{ id: string }>();
  const { has } = useAuth();
  const router = useRouter();
  const [version, setVersion] = useState<number | null>(null);
  const trip = useAsync(() => get<TripDetail>(`/aiops/trips/${id}`, { version }), [id, version]);
  const scenarios = useAsync(() => (has("Simulation.Run") ? get<any[]>("/aiops/scenarios") : Promise.resolve([])), []);
  const [scenarioId, setScenarioId] = useState("");
  const [sim, setSim] = useState<any>(null);
  const [useAi, setUseAi] = useState(true);
  const a = useAction();
  return (
    <Async state={trip}>{(d) => (
      <>
        <PageHeader tagline={`${d.trip.tripRef} · ${d.trip.status}`} title={d.trip.name}
          lead={<>{d.trip.travelerName} ({d.trip.travelerEmailMasked}) · {d.trip.regionName} · {fmtDate(d.trip.startDate)} · {d.trip.pax} pax · mobility {d.trip.mobilityNeeds} · budget {money(d.trip.budgetPerPax)} <Demo show={d.trip.isDemo} /></>}
          actions={<Link className="btn" href="/admin/trips">Back</Link>} />
        {a.error ? <ErrorBox error={a.error} /> : null}
        {has("Simulation.Run") && (
          <Card title="Simulate a disruption">
            <div className="row">
              <SelectInput label="Scenario" value={scenarioId} onChange={setScenarioId} placeholder="Choose a scenario" testId="sim-scenario" options={(scenarios.data ?? []).filter((s) => s.isActive && (!s.regionId || s.regionName === d.trip.regionName)).map((s) => ({ value: s.scenarioId, label: s.name }))} />
              <button className="btn primary" style={{ alignSelf: "end" }} disabled={!scenarioId || a.busy} data-testid="sim-run" onClick={async () => { const r = await a.run(() => post("/aiops/simulations", { tripId: Number(id), scenarioId: Number(scenarioId) })); if (r) { setSim(r); trip.reload(); } }}>Run simulation</button>
            </div>
            {sim && <div style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: 14 }}>Impact of {sim.scenario}: {sim.impacts.length} item(s)</h3>
              <DataTable rows={sim.impacts} rowKey={(i: any) => i.itemKey} testId="sim-impacts" columns={[
                { key: "itemKey", header: "Item", render: (i: any) => d.items.find((x) => x.itemKey === i.itemKey)?.title ?? i.itemKey },
                { key: "kind", header: "Impact", render: (i: any) => <Pill value={i.kind} tone={i.kind === "Delayed" ? "warn" : "bad"} /> }, { key: "reason", header: "Why" }]} />
              {sim.impacts.length > 0 && <div className="form-actions" style={{ marginTop: 10 }}>
                <Checkbox label="Ask AI to explain (only if a key is configured)" checked={useAi} onChange={setUseAi} />
                <button className="btn primary" disabled={a.busy} data-testid="sim-propose" onClick={async () => { const r = await a.run<any>(() => post(`/aiops/simulations/${sim.simulationId}/proposal`, { useAi }), "Proposal created for review"); if (r) router.push(`/admin/proposals/${r.proposal.proposalId}`); }}>Generate recovery proposal</button>
              </div>}
            </div>}
          </Card>
        )}
        <div style={{ height: 16 }} />
        <Card title={`Itinerary v${version ?? d.trip.currentVersion}`} actions={<SelectInput label="Version" value={version ?? d.trip.currentVersion} onChange={(v) => setVersion(Number(v))} options={d.versions.map((v) => ({ value: v.versionNo, label: `v${v.versionNo} ${v.source}` }))} testId="trip-version" />}>
          <p className="small muted">{d.versions.find((v) => v.versionNo === (version ?? d.trip.currentVersion))?.summary}</p>
          <Itinerary items={d.items} />
        </Card>
        <Card title="Proposals">
          <DataTable rows={d.proposals} rowKey={(p) => p.proposalId} columns={[
            { key: "proposalRef", header: "Proposal", render: (p) => <Link href={`/admin/proposals/${p.proposalId}`}>{p.proposalRef}</Link> }, { key: "status", header: "Status", render: (p) => <Pill value={p.status} /> },
            { key: "explanationSource", header: "Explanation" }, { key: "costImpactPerPax", header: "Cost Δ / pax", render: (p) => money(p.costImpactPerPax) }, { key: "createdAtUtc", header: "Created", render: (p) => fmtDateTime(p.createdAtUtc) }]} />
        </Card>
      </>
    )}</Async>
  );
}

export function ProposalsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("PendingReview");
  const list = useAsync(() => get<any[]>("/aiops/proposals", { status }), [status]);
  return (
    <>
      <PageHeader tagline="Human approval" title="Recovery proposals" lead="AI and rules suggest; a person with Ai.Proposal.Approve decides. The proposer cannot approve their own proposal." />
      <div className="toolbar"><SelectInput label="Status" value={status} onChange={setStatus} placeholder="Any" options={["PendingReview", "Approved", "Rejected", "Superseded"].map((s) => ({ value: s, label: s }))} testId="proposals-status" /></div>
      <Async state={list}>{(rows) => <DataTable rows={rows} rowKey={(p: any) => p.proposalId} onRowClick={(p: any) => router.push(`/admin/proposals/${p.proposalId}`)} testId="proposals-table" columns={[
        { key: "proposalRef", header: "Proposal" }, { key: "tripRef", header: "Trip" }, { key: "tripName", header: "Name" }, { key: "scenarioName", header: "Scenario" },
        { key: "explanationSource", header: "Explained by" }, { key: "costImpactPerPax", header: "Cost Δ / pax", render: (p: any) => money(p.costImpactPerPax) },
        { key: "proposedByMasked", header: "Proposed by" }, { key: "status", header: "Status", render: (p: any) => <Pill value={p.status} /> }]} />}</Async>
    </>
  );
}

export function ProposalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const p = useAsync(() => get<any>(`/aiops/proposals/${id}`), [id]);
  const [comment, setComment] = useState("");
  const a = useAction();
  return (
    <Async state={p}>{(d) => {
      const pr = d.proposal, changes = JSON.parse(pr.changesJson), checks = JSON.parse(pr.validationJson);
      const title = (k: string) => d.baseItems.find((i: any) => i.itemKey === k)?.title ?? k;
      return (
        <>
          <PageHeader tagline="Human approval" title={`${pr.proposalRef} · ${pr.tripName}`} lead={<>{pr.scenarioName} · based on v{pr.baseVersionNo} · proposed by {pr.proposedByMasked} · <Pill value={pr.status} /></>}
            actions={<Link className="btn" href={`/admin/trips/${pr.tripId}`}>Open trip</Link>} />
          {a.error ? <ErrorBox error={a.error} /> : null}
          <div className="grid two">
            <Card title={`Explanation (${pr.explanationSource === "AI" ? "AI-generated, check it" : "rule-based"})`}>
              <p style={{ whiteSpace: "pre-wrap" }} data-testid="proposal-explanation">{pr.explanation}</p>
            </Card>
            <Card title="Validation against database facts">
              <ul className="small" data-testid="proposal-checks">{checks.map((c: any) => <li key={c.name}>{c.passed ? "✓" : "✗"} <b>{c.name}</b>: {c.detail}</li>)}</ul>
            </Card>
          </div>
          <Card title="Changes">
            <DataTable rows={changes} rowKey={(c: any) => c.itemKey} testId="proposal-changes" columns={[
              { key: "action", header: "Change", render: (c: any) => <Pill value={c.action} tone={c.action === "Cancel" ? "bad" : c.action === "Flag" ? "warn" : "info"} /> },
              { key: "item", header: "Item", render: (c: any) => title(c.itemKey) }, { key: "newStartTime", header: "New time", render: (c: any) => c.newStartTime ?? "—" },
              { key: "reason", header: "Reason" }, { key: "costDeltaPerPax", header: "Cost Δ / pax", render: (c: any) => money(c.costDeltaPerPax) }]} />
            <p className="small" style={{ marginTop: 8 }}>Total cost change per traveler: <b>{money(pr.costImpactPerPax)}</b> × {pr.pax} traveler(s)</p>
          </Card>
          {pr.status === "PendingReview" && (d.canDecide ? (
            <Card title="Decision">
              <TextArea label="Comment (required to reject)" value={comment} onChange={setComment} data-testid="proposal-comment" />
              <div className="form-actions" style={{ marginTop: 8 }}>
                <ConfirmButton className="btn primary" testId="proposal-approve" confirm="Approve? A new itinerary version is saved and the traveler sees it." onConfirm={async () => { if (await a.run(() => post(`/aiops/proposals/${id}/decision`, { decision: "Approved", comment, rowVersion: pr.rowVersion }), "Approved: new itinerary version saved") !== undefined) p.reload(); }}>Approve & apply</ConfirmButton>
                <ConfirmButton className="btn danger" testId="proposal-reject" confirm="Reject this proposal?" onConfirm={async () => { if (await a.run(() => post(`/aiops/proposals/${id}/decision`, { decision: "Rejected", comment, rowVersion: pr.rowVersion }), "Rejected") !== undefined) p.reload(); }}>Reject</ConfirmButton>
              </div>
            </Card>
          ) : <div className="alert info" data-testid="proposal-no-decide">You cannot decide on this proposal: you either proposed it yourself (separation of duties) or lack Ai.Proposal.Approve.</div>)}
          {pr.decisionComment && <Card title="Decision note"><p>{pr.decisionComment} · {fmtDateTime(pr.decidedAtUtc)}</p></Card>}
        </>
      );
    }}</Async>
  );
}

export function DocumentsPage() {
  const { has } = useAuth();
  const docs = useAsync(() => get<any[]>("/aiops/documents"), []);
  const trips = useAsync(() => (has("Document.Review") ? get<any[]>("/aiops/trips").catch(() => []) : Promise.resolve([])), []);
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState<any>(null);
  const a = useAction();
  return (
    <>
      <PageHeader tagline="Documents" title="Document intake & review" lead="Files are checked by size, extension and content signature, stored privately under random names, and PII is redacted before extraction. Fields carry a confidence score and a source span. Nothing changes a trip until a reviewer accepts." />
      {has("Document.Upload") && <Card title="Upload">
        {a.error ? <ErrorBox error={a.error} /> : null}
        <div className="row">
          <input type="file" accept=".txt,.pdf,.png" aria-label="Choose file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="doc-file" style={{ maxWidth: 360 }} />
          <button className="btn primary" disabled={!file || a.busy} data-testid="doc-upload" onClick={async () => {
            const form = new FormData(); form.append("file", file!);
            const r = await a.run(() => api<any>("/aiops/documents", { method: "POST", form }), "Uploaded and extracted");
            if (r) { docs.reload(); setOpen(r); }
          }}>Upload</button>
        </div>
      </Card>}
      <div style={{ height: 16 }} />
      <Async state={docs}>{(rows) => <DataTable rows={rows} rowKey={(d: any) => d.documentId} testId="docs-table" onRowClick={async (d: any) => setOpen(await get(`/aiops/documents/${d.documentId}`))} columns={[
        { key: "documentRef", header: "Ref" }, { key: "originalName", header: "File" }, { key: "docType", header: "Type" }, { key: "fieldCount", header: "Fields" },
        { key: "avgConfidence", header: "Avg confidence", render: (d: any) => d.avgConfidence ? <Pill value={Number(d.avgConfidence).toFixed(2)} tone={d.avgConfidence >= 0.8 ? "ok" : "warn"} /> : "—" },
        { key: "redactionCount", header: "Redactions" }, { key: "tripRef", header: "Trip" }, { key: "status", header: "Status", render: (d: any) => <Pill value={d.status} /> }]} />}</Async>
      {open && <DocReview doc={open} trips={trips.data ?? []} canReview={has("Document.Review")} onClose={() => setOpen(null)} onDone={() => { setOpen(null); docs.reload(); }} />}
    </>
  );
}

function DocReview({ doc, trips, canReview, onClose, onDone }: { doc: any; trips: any[]; canReview: boolean; onClose: () => void; onDone: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(doc.fields.map((f: any) => [f.fieldName, f.reviewedValue ?? f.value ?? ""])));
  const [tripId, setTripId] = useState(doc.document.tripId ? String(doc.document.tripId) : "");
  const [comment, setComment] = useState("");
  const a = useAction();
  const decide = async (decision: string) => {
    if (await a.run(() => post(`/aiops/documents/${doc.document.documentId}/review`, { decision, tripId: tripId ? Number(tripId) : null, fields: Object.entries(vals).map(([fieldName, reviewedValue]) => ({ fieldName, reviewedValue })), comment: comment || null, rowVersion: doc.document.rowVersion }), `Document ${decision.toLowerCase()}`) !== undefined) onDone();
  };
  return (
    <Modal title={`${doc.document.documentRef} · ${doc.document.originalName}`} onClose={onClose} testId="doc-modal" actions={canReview && doc.document.status === "Extracted" && <>
      <button className="btn danger" disabled={a.busy} onClick={() => decide("Rejected")} data-testid="doc-reject">Reject</button>
      <button className="btn primary" disabled={a.busy} onClick={() => decide("Accepted")} data-testid="doc-accept">Accept fields</button></>}>
      <FormError error={a.error} />{a.error && !(a.error as any).errors ? <ErrorBox error={a.error} /> : null}
      <p className="small"><Pill value={doc.document.status} /> {doc.document.docType} · {doc.document.redactionCount} item(s) redacted · sha256 <span className="mono">{doc.document.sha256.slice(0, 16)}…</span></p>
      <pre className="json" data-testid="doc-text">{doc.document.redactedText}</pre>
      <div className="form cols">{doc.fields.map((f: any) => (
        <TextInput key={f.fieldName} label={`${f.fieldName} · ${f.method} ${Number(f.confidence).toFixed(2)}`} value={vals[f.fieldName] ?? ""} onChange={(v) => setVals({ ...vals, [f.fieldName]: v })} disabled={!canReview || doc.document.status !== "Extracted"} data-testid={`doc-field-${f.fieldName}`} />))}</div>
      {canReview && doc.document.status === "Extracted" && <div className="form cols" style={{ marginTop: 10 }}>
        <SelectInput label="Link to trip (required to accept)" value={tripId} onChange={setTripId} placeholder="Choose" options={trips.map((t) => ({ value: t.tripId, label: `${t.tripRef} ${t.name}` }))} error={a.fieldError("tripId")} testId="doc-trip" />
        <TextInput label="Comment (required to reject)" value={comment} onChange={setComment} error={a.fieldError("comment")} />
      </div>}
    </Modal>
  );
}

const CATS = ["Outdoor", "Indoor", "Rail", "Coach", "Hotel", "Meal"];
export function ScenariosPage() {
  const { has } = useAuth();
  const lk = useAsync(() => get<any>("/trip-options").catch(() => ({ regions: [] })), []);
  return <EntityPage<any> tagline="Planning rules" title="Disruption scenarios" testId="scenarios" canEdit={has("Scenario.Edit")} newLabel="New scenario" load={() => get("/aiops/scenarios")} rowKey={(s) => s.scenarioId}
    lead="Scenarios are data: which categories they hit, cancel or delay, which day and region."
    columns={[{ key: "code", header: "Code", render: (s) => <>{s.code}<Demo show={s.isDemo} /></> }, { key: "name", header: "Name" }, { key: "regionName", header: "Region", render: (s) => s.regionName ?? "All" },
      { key: "affectedCategories", header: "Affects" }, { key: "effect", header: "Effect", render: (s) => s.effect === "Delay" ? `Delay ${s.delayMinutes} min` : "Cancel" }, { key: "dayNo", header: "Day", render: (s) => s.dayNo ?? "all" },
      { key: "isActive", header: "Active", render: (s) => (s.isActive ? "✓" : <Pill value="Inactive" />) }]}
    fields={[{ name: "code", label: "Code", lockedOnEdit: true }, { name: "name", label: "Name" },
      { name: "regionId", label: "Region", type: "select", placeholder: "All regions", options: (lk.data?.regions ?? []).map((r: any) => ({ value: r.regionId, label: r.name })) },
      { name: "affectedCategories", label: "Affected categories", type: "multicheck", options: CATS.map((c) => ({ value: c, label: c })) },
      { name: "effect", label: "Effect", type: "select", options: [{ value: "Cancel", label: "Cancel" }, { value: "Delay", label: "Delay" }] },
      { name: "delayMinutes", label: "Delay minutes", type: "number" }, { name: "dayNo", label: "Day (empty = all)", type: "number" }, { name: "description", label: "Description", type: "textarea" }, { name: "isActive", label: "Active", type: "checkbox" }]}
    toForm={(s) => s ? { ...s, regionId: s.regionId ?? "", affectedCategories: s.affectedCategories.split(","), dayNo: s.dayNo ?? null } : { code: "", name: "", regionId: "", affectedCategories: [], effect: "Cancel", delayMinutes: 0, dayNo: null, description: "", isActive: true }}
    save={(f, s) => { const body = { ...f, regionId: f.regionId ? Number(f.regionId) : null, delayMinutes: Number(f.delayMinutes ?? 0), dayNo: f.dayNo ? Number(f.dayNo) : null, rowVersion: s?.rowVersion }; return s ? put(`/aiops/scenarios/${s.scenarioId}`, body) : post("/aiops/scenarios", body); }} />;
}

export function TemplatesPage() {
  const cat = useAsync(() => get<any>("/aiops/templates"), []);
  const lk = useAsync(() => get<any>("/trip-options"), []);
  const [view, setView] = useState<number | null>(null);
  return (
    <>
      <EntityPage<any> tagline="Planning rules" title="Itinerary templates" testId="templates" canEdit newLabel="New template" load={async () => (await get<any>("/aiops/templates")).templates} rowKey={(t) => t.templateId}
        columns={[{ key: "code", header: "Code", render: (t) => <>{t.code}<Demo show={t.isDemo} /></> }, { key: "name", header: "Name" }, { key: "regionName", header: "Region" }, { key: "days", header: "Days" }, { key: "pace", header: "Pace" },
          { key: "isActive", header: "Active", render: (t) => (t.isActive ? "✓" : <Pill value="Inactive" />) }]}
        rowActions={(t) => <button className="btn small" onClick={() => setView(t.templateId)}>Items</button>}
        fields={[{ name: "code", label: "Code" }, { name: "name", label: "Name" }, { name: "regionId", label: "Region", type: "select", options: (lk.data?.regions ?? []).map((r: any) => ({ value: r.regionId, label: r.name })) },
          { name: "days", label: "Days", type: "number" }, { name: "pace", label: "Pace", type: "select", options: ["Relaxed", "Balanced", "Packed"].map((x) => ({ value: x, label: x })) }, { name: "description", label: "Description", type: "textarea" }, { name: "isActive", label: "Active", type: "checkbox" }]}
        toForm={(t) => t ? { ...t } : { code: "", name: "", regionId: "", days: 2, pace: "Balanced", description: "", isActive: true }}
        save={(f, t) => { const body = { ...f, regionId: Number(f.regionId), days: Number(f.days), rowVersion: t?.rowVersion }; return t ? put(`/aiops/templates/${t.templateId}`, body) : post("/aiops/templates", body); }} />
      {view && cat.data && <Modal title="Template items" onClose={() => setView(null)}>
        <DataTable rows={cat.data.items.filter((i: any) => i.templateId === view)} rowKey={(i: any) => i.itemKey} columns={[{ key: "dayNo", header: "Day" }, { key: "startTime", header: "Time" }, { key: "placeName", header: "Place" }, { key: "category", header: "Type" }, { key: "durationMin", header: "Min" }, { key: "dependsOnItemKey", header: "After" }]} />
      </Modal>}
    </>
  );
}

export function ConstraintsPage() {
  return <EntityPage<any> tagline="Planning rules" title="Travel constraints" testId="constraints" canEdit newLabel="" load={() => get("/aiops/constraints")} rowKey={(c) => c.constraintId}
    lead="Rules the recovery validator checks before a human sees a proposal."
    columns={[{ key: "code", header: "Code", render: (c) => <span className="mono">{c.code}</span> }, { key: "name", header: "Rule" }, { key: "ruleType", header: "Type" }, { key: "value", header: "Value" }, { key: "isActive", header: "Active", render: (c) => (c.isActive ? "✓" : <Pill value="Inactive" />) }]}
    fields={[{ name: "value", label: "Value", hint: "HH:mm for times, a number for counts, empty for on/off rules" }, { name: "isActive", label: "Active", type: "checkbox" }]}
    toForm={(c) => ({ value: c?.value ?? "", isActive: c?.isActive ?? true })} save={(f, c) => put(`/aiops/constraints/${c!.constraintId}`, { value: f.value || null, isActive: f.isActive })} />;
}

export function AiConfigPage() {
  const { has } = useAuth();
  const cfg = useAsync(() => get<any>("/aiops/ai-config"), []);
  const [edit, setEdit] = useState<any>(null);
  const [prompt, setPrompt] = useState<any>(null);
  const a = useAction();
  return (
    <>
      <PageHeader tagline="Model" title="AI configuration & prompt templates" lead="The API key is a server secret (env var / secret store) and is never shown or stored in the database. Every call is logged with tokens, cost and outcome." />
      <Async state={cfg}>{(c) => (
        <>
          <AiBanner ai={c.status} />
          <div style={{ height: 12 }} />
          <Card title="Settings">
            <DataTable rows={c.settings} rowKey={(s: any) => s.settingKey} testId="ai-settings" columns={[
              { key: "settingKey", header: "Key", render: (s: any) => <span className="mono">{s.settingKey}</span> },
              { key: "settingValue", header: "Value", render: (s: any) => <span className="mono small">{s.valueType === "SecretRef" ? `env: ${s.settingValue} (${c.status.keyConfigured ? "set" : "not set"})` : s.settingValue}</span> },
              { key: "description", header: "Description", render: (s: any) => <span className="small">{s.description}</span> },
              { key: "e", header: "", render: (s: any) => has("Ai.Config.Edit") && s.isEditable && s.valueType !== "SecretRef" && <button className="btn small" data-testid={`ai-edit-${s.settingKey}`} onClick={() => setEdit({ ...s, value: s.settingValue })}>Edit</button> }]} />
          </Card>
          <Card title="Prompt templates (versioned)">
            <DataTable rows={c.prompts} rowKey={(p: any) => p.promptId} testId="prompts-table" columns={[
              { key: "promptKey", header: "Key", render: (p: any) => <span className="mono">{p.promptKey}</span> }, { key: "version", header: "Version", render: (p: any) => `v${p.version}` },
              { key: "isActive", header: "", render: (p: any) => p.isActive ? <Pill value="Active" /> : <Pill value="Old" /> }, { key: "createdAtUtc", header: "Created", render: (p: any) => fmtDateTime(p.createdAtUtc) },
              { key: "e", header: "", render: (p: any) => p.isActive && has("Ai.Config.Edit") && <button className="btn small" onClick={() => setPrompt({ key: p.promptKey, body: p.body })} data-testid={`prompt-edit-${p.promptKey}`}>New version</button> }]} />
          </Card>
        </>
      )}</Async>
      {edit && <Modal title={edit.settingKey} onClose={() => setEdit(null)} actions={<button className="btn primary" disabled={a.busy} data-testid="ai-save" onClick={async () => { if (await a.run(() => put(`/aiops/ai-config/${edit.settingKey}`, { value: edit.value, rowVersion: edit.rowVersion }), "Saved") !== undefined) { setEdit(null); cfg.reload(); } }}>Save</button>}>
        <FormError error={a.error} />{a.error && !(a.error as any).errors ? <ErrorBox error={a.error} /> : null}
        {edit.valueType === "Json" ? <TextArea label="Value (JSON)" value={edit.value} onChange={(v) => setEdit({ ...edit, value: v })} error={a.fieldError("value")} /> : <TextInput label="Value" value={edit.value} onChange={(v) => setEdit({ ...edit, value: v })} error={a.fieldError("value")} hint={edit.description} data-testid="ai-value" />}
      </Modal>}
      {prompt && <Modal title={`New version of ${prompt.key}`} onClose={() => setPrompt(null)} actions={<button className="btn primary" disabled={a.busy} data-testid="prompt-save" onClick={async () => { if (await a.run(() => post(`/aiops/prompts/${prompt.key}`, { body: prompt.body }), "New prompt version saved") !== undefined) { setPrompt(null); cfg.reload(); } }}>Save new version</button>}>
        <FormError error={a.error} /><TextArea label="Prompt body" rows={12} value={prompt.body} onChange={(v) => setPrompt({ ...prompt, body: v })} error={a.fieldError("body")} hint="Keep the same {{placeholders}}. Old versions stay for reproducibility." data-testid="prompt-body" />
      </Modal>}
    </>
  );
}

export function EvalsPage() {
  const rep = useAsync(() => get<any>("/aiops/evals"), []);
  const [fb, setFb] = useState<any>(null);
  const a = useAction();
  return (
    <>
      <PageHeader tagline="Quality" title="Evaluation suite" lead="Curated test cases: recovery accuracy, grounding (every place exists in the DB), prompt-injection blocking, permission leaks and output validation." actions={
        <button className="btn primary" disabled={a.busy} data-testid="eval-run" onClick={async () => { const r = await a.run(() => post("/aiops/evals/run"), "Evaluation complete"); if (r) rep.setData(r as any); }}>{a.busy ? "Running…" : "Run suite"}</button>} />
      {a.error ? <ErrorBox error={a.error} /> : null}
      <Async state={rep}>{(r) => (
        <>
          {r.runs[0] && <div className="kpis"><Kpi label="Passed" value={`${r.runs[0].passed}/${r.runs[0].total}`} testId="eval-passed" /><Kpi label="Grounding score" value={r.runs[0].groundingScore} /><Kpi label="Model" value={r.runs[0].usedModel ?? "—"} /><Kpi label="Run at" value={fmtDateTime(r.runs[0].runAtUtc)} /></div>}
          <Card title="Latest results"><DataTable rows={r.lastResults} rowKey={(x: any) => x.resultId} testId="eval-results" columns={[
            { key: "code", header: "Case" }, { key: "name", header: "Description" }, { key: "kind", header: "Kind" }, { key: "passed", header: "Result", render: (x: any) => <Pill value={x.passed ? "pass" : "fail"} tone={x.passed ? "ok" : "bad"} /> },
            { key: "detail", header: "Detail", render: (x: any) => <span className="small">{x.detail}</span> }, { key: "humanFeedback", header: "Human feedback", render: (x: any) => <span className="small">{x.humanFeedback}</span> },
            { key: "f", header: "", render: (x: any) => <button className="btn small" onClick={() => setFb({ id: x.resultId, text: x.humanFeedback ?? "" })}>Feedback</button> }]} /></Card>
          <Card title="Run history"><DataTable rows={r.runs} rowKey={(x: any) => x.runId} columns={[{ key: "runAtUtc", header: "When", render: (x: any) => fmtDateTime(x.runAtUtc) }, { key: "passed", header: "Passed", render: (x: any) => `${x.passed}/${x.total}` }, { key: "groundingScore", header: "Grounding" }, { key: "usedModel", header: "Model" }]} /></Card>
        </>
      )}</Async>
      {fb && <Modal title="Human feedback" onClose={() => setFb(null)} actions={<button className="btn primary" onClick={async () => { if (await a.run(() => post(`/aiops/evals/results/${fb.id}/feedback`, { feedback: fb.text }), "Feedback saved") !== undefined) { setFb(null); rep.reload(); } }}>Save</button>}>
        <TextArea label="Feedback" value={fb.text} onChange={(v) => setFb({ ...fb, text: v })} error={a.fieldError("feedback")} />
      </Modal>}
    </>
  );
}

export function UsagePage() {
  const u = useAsync(() => get<any>("/aiops/ai-usage"), []);
  return (
    <>
      <PageHeader tagline="Cost" title="AI usage & cost" lead="Every model call and every fallback is logged: tokens, estimated cost (prices from settings), latency, outcome." />
      <Async state={u}>{(r) => (
        <>
          <Card title="Summary"><DataTable rows={r.summary} rowKey={(x: any) => x.feature + x.outcome} testId="usage-summary" columns={[{ key: "feature", header: "Feature" }, { key: "outcome", header: "Outcome", render: (x: any) => <Pill value={x.outcome} tone={x.outcome === "ok" ? "ok" : "warn"} /> }, { key: "calls", header: "Calls" }, { key: "inputTokens", header: "Input tokens" }, { key: "outputTokens", header: "Output tokens" }, { key: "costUsd", header: "Cost (USD)", render: (x: any) => Number(x.costUsd).toFixed(6) }]} /></Card>
          <Card title="Recent calls"><DataTable rows={r.rows} rowKey={(x: any) => x.usageId} columns={[{ key: "occurredAtUtc", header: "When", render: (x: any) => fmtDateTime(x.occurredAtUtc) }, { key: "feature", header: "Feature" }, { key: "model", header: "Model" }, { key: "tokens", header: "Tokens in/out", render: (x: any) => `${x.inputTokens} / ${x.outputTokens}` }, { key: "costUsd", header: "USD", render: (x: any) => Number(x.costUsd).toFixed(6) }, { key: "latencyMs", header: "ms" }, { key: "outcome", header: "Outcome" }]} /></Card>
        </>
      )}</Async>
    </>
  );
}
