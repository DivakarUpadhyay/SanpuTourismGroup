// Creates (or updates) the two Vercel projects for the Next.js apps and sets API_URL.
// Uses the Vercel CLI login token. Usage: node tools/vercel-setup.mjs <team-slug> <erp-api-url> <ai-api-url>
import fs from "node:fs";

const [team, erpApi, aiApi] = process.argv.slice(2);
const token = JSON.parse(fs.readFileSync(`${process.env.APPDATA}/com.vercel.cli/Data/auth.json`, "utf8")).token;
const call = async (method, path, body) => {
  const res = await fetch(`https://api.vercel.com${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return { status: res.status, json };
};

const teams = (await call("GET", "/v2/teams")).json.teams ?? [];
const t = teams.find((x) => x.slug === team);
if (!t) throw new Error(`team ${team} not found; you have: ${teams.map((x) => x.slug).join(", ")}`);
const q = `?teamId=${t.id}`;
const out = { teamId: t.id, projects: {} };
for (const [name, root, api] of [["sanpu-travel", "tour-operations/frontend", erpApi], ["sanpu-trip-copilot", "ai-travel/frontend", aiApi]]) {
  let p = (await call("GET", `/v9/projects/${name}${q}`).catch(() => ({ json: null }))).json;
  if (!p?.id) p = (await call("POST", `/v10/projects${q}`, { name, framework: "nextjs", rootDirectory: root })).json;
  else await call("PATCH", `/v9/projects/${p.id}${q}`, { framework: "nextjs", rootDirectory: root });
  await call("POST", `/v10/projects/${p.id}/env${q}&upsert=true`, { key: "API_URL", value: api, type: "plain", target: ["production", "preview"] });
  out.projects[name] = p.id;
  console.log(`${name}: project ${p.id}, root ${root}, API_URL=${api}`);
}
fs.writeFileSync(".vercel-projects.local.json", JSON.stringify(out, null, 2));
