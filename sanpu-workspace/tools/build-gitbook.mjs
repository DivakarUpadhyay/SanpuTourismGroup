// Generates GitBook-ready screen pages from docs/gitbook/catalog.json + the form specs in ../design/screens.html
// + the real screenshots captured by tests/e2e/screens.spec.ts. Also writes tests/interaction-matrix.csv.
// Usage: node tools/build-gitbook.mjs
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const gb = path.join(root, "docs", "gitbook");
const catalog = JSON.parse(fs.readFileSync(path.join(gb, "catalog.json"), "utf8")).screens;
const html = fs.readFileSync(path.join(root, "..", "design", "screens.html"), "utf8");
const specSrc = html.slice(html.indexOf("const S=[") + 8, html.search(/\];\s*const appName/) + 1);   // tolerant of CRLF
const design = Object.fromEntries(new Function(`return ${specSrc}`)().map((s) => [s.id, s]));
const strip = (s) => String(s ?? "").replace(/<[^>]+>/g, "").trim();

// ---- which data-testids exist in which component, and which spec files use them ----
const srcFiles = ["shared/web/src", "tour-operations/frontend/components", "ai-travel/frontend/components"].flatMap((d) =>
  fs.readdirSync(path.join(root, d), { recursive: true }).filter((f) => f.endsWith(".tsx")).map((f) => path.join(d, f)));
const specs = ["tests/e2e/erp.spec.ts", "tests/e2e/ai.spec.ts"].map((f) => ({ f, text: fs.readFileSync(path.join(root, f), "utf8") }));
const testIndex = new Map();      // test id (A01…) -> title
for (const { text } of specs) for (const m of text.matchAll(/test\("([A-H]\d\d) ([^"]+)"/g)) testIndex.set(m[1], m[2]);

const pageFor = (s) => s.section === "common" ? "common" : s.section === "erp" ? "erp" : "ai-operations";
const slug = (s) => s.id;

function screenPage(s) {
  const d = design[s.design] ?? {};
  const title = s.title ?? d.title ?? s.id;
  const fields = (d.f ?? []).map(([l, t, r]) => `| ${l} | ${t} | ${strip(r)} |`).join("\n");
  const actions = (d.act ?? []).map((a) => `- **${a}**`).join("\n");
  const api = (s.api ?? d.api ?? []).map((a) => `- \`${strip(a)}\``).join("\n");
  const procs = (s.procs ?? d.sp ?? []).map((p) => `- \`${strip(p)}\``).join("\n");
  const notes = (d.notes ?? []).map((n) => `- ${strip(n)}`).join("\n");
  const tests = (s.tests ?? []).map((t) => `- \`${t}\` ${testIndex.get(t) ?? ""}`).join("\n") || "- Covered by the screenshot run (`tests/e2e/screens.spec.ts`) and manual checklist; no dedicated functional test yet.";
  const purpose = s.purpose ?? (d.notes?.length ? strip(d.notes[0]) : "");
  const role = s.role ? `\`${s.role}\` (fictional demo account)` : "anonymous visitor";
  return `# ${title}

${s.app === "erp" ? "App A · Sanpu Travel" : "App B · Sanpu AI Travel"}${s.section === "common" ? " (the same screen exists in both apps)" : ""}

![${title}](../assets/${s.id}.png)

| | |
|---|---|
| **Route** | \`${s.url.replace("{erpOpenDeparture}", "[departureId]")}\` |
| **Permission** | ${strip(s.permission ?? d.perm ?? "")} |
| **Shown as** | ${role} |
| **Area** | ${d.area ?? (s.url.startsWith("/admin") ? "Admin" : "Customer")} |

## Purpose
${purpose || strip(d.tag ?? "")}

${fields ? `## Fields and validation\n| Field | Type | Rules (client hint + server validation + SQL constraint) |\n|---|---|---|\n${fields}\n` : ""}
${actions ? `## Actions\n${actions}\n` : ""}
## API (Swagger: \`/swagger\`, tag in the OpenAPI document)
${api}

## Stored procedures
${procs || "- (read through shared navigation/settings procedures)"}

${notes ? `## Rules, audit and security effects\n${notes}\n` : ""}
## States
Loading skeleton while data loads · empty state ("Nothing here yet.") · error box with the server's message, a **Retry** button and the **correlation ID** · 403 page when the role lacks the permission (the API refuses the same call).

## Automated tests
${tests}

## Presenter script (30 seconds)
${presenter(s, title, d)}
`;
}

function presenter(s, title, d) {
  const who = s.role ? `Signed in as ${s.role.split("@")[0]}` : "As an anonymous visitor";
  const firstAction = d.act?.[0] ? ` Click **${d.act[0]}**` : "";
  const api = (s.api ?? d.api ?? [])[0];
  return `${who}, open **${title}**.${firstAction} and point out that everything on screen comes from SQL Server through \`${strip(api ?? "the API").split(" ")[0]} ${strip(api ?? "").split(" ")[1] ?? ""}\`. ` +
    `Mention the permission (${strip(s.permission ?? d.perm ?? "")}) is checked by the API, not only by hiding the menu, and that changes are written to the audit log.`;
}

// ---- write screen pages + SUMMARY ----
const groups = { common: "Shared admin & account screens", erp: "App A · Sanpu Travel", "ai-operations": "App B · Sanpu AI Travel" };
for (const g of Object.keys(groups)) fs.mkdirSync(path.join(gb, g), { recursive: true });
for (const s of catalog) fs.writeFileSync(path.join(gb, pageFor(s), `${slug(s)}.md`), screenPage(s));

const fixed = [
  ["Introduction", "README.md"], ["Getting started", "getting-started.md"], ["Architecture", "architecture.md"], ["Security & roles", "security-and-roles.md"],
  ["Database & stored procedures", "database-and-stored-procedures.md"], ["API: Swagger & Postman", "api-swagger-postman.md"], ["Cross-screen workflows", "workflows.md"],
  ["What's new", "whats-new.md"], ["Accounts, sessions & sign-up", "accounts-and-sessions.md"], ["Emails & notifications", "emails.md"],
  ["Bookings & payments end to end", "bookings-and-payments.md"], ["AI Travel assistant", "ai-assistant.md"], ["News, blog & the AI writer", "news-and-blog.md"], ["Reports: Excel & PDF", "reports.md"],
  ["Going live for a presentation", "going-live.md"], ["Testing & evidence", "testing-and-evidence.md"], ["Troubleshooting", "troubleshooting.md"], ["Interview · 20 minutes", "interview-20-minute.md"], ["Interview · 60 minutes", "interview-60-minute.md"]
];
let summary = "# Summary\n\n" + fixed.map(([t, f]) => `* [${t}](${f})`).join("\n") + "\n";
for (const [g, label] of Object.entries(groups)) {
  summary += `\n## ${label}\n\n` + catalog.filter((s) => pageFor(s) === g).map((s) => `* [${s.title ?? design[s.design]?.title ?? s.id}](${g}/${slug(s)}.md)`).join("\n") + "\n";
}
fs.writeFileSync(path.join(gb, "SUMMARY.md"), summary);

// ---- interaction matrix: every data-testid control, the event, which spec exercises it ----
const rows = [["project", "component file", "control (data-testid)", "event", "expected UI result", "expected API / DB side effect", "Playwright test", "last verified"]];
const lastRun = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, "tests/e2e/results/results.json"), "utf8")).stats.startTime.slice(0, 10); } catch { return "not run"; } })();
for (const f of srcFiles) {
  const text = fs.readFileSync(path.join(root, f), "utf8");
  const ids = new Set([...text.matchAll(/(?:data-testid|testId)=\{?["`]([^"`{}$]+)["`]/g)].map((m) => m[1]));
  for (const id of [...ids].sort()) {
    const usedBy = specs.filter((s) => s.text.includes(`"${id}"`)).map((s) => path.basename(s.f));
    const event = /submit|save|send|approve|reject|run|upload|accept|confirm|create|book|hold|pay|refund|cancel|logout|retry|propose|delete|new|open|edit|take|done|reveal|up|down/.test(id) ? "click" : /search|email|password|name|value|phone|key|period|question|comment|note|payload|body|start|budget|notes|pax|requests|month/.test(id) ? "input/change" : /status|area|sort|template|pace|mobility|scenario|trip|entity|departure|supplier|type|version|reason/.test(id) ? "select" : "view";
    const project = f.startsWith("shared") ? "both" : f.startsWith("tour") ? "A (ERP)" : "B (AI)";
    rows.push([project, f.replace(/\\/g, "/"), id, event, "see GitBook screen page", event === "view" ? "read via API" : "API call → stored procedure → audit where consequential",
      usedBy.join(" ") || "not directly asserted (covered by screenshot run / manual check)", usedBy.length ? lastRun : "manual"]);
  }
}
fs.writeFileSync(path.join(root, "tests", "interaction-matrix.csv"), rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"));
console.log(`GitBook: ${catalog.length} screen pages; interaction matrix: ${rows.length - 1} controls`);
