// Switches the two Vercel sites between LIVE (real APIs on this computer through Cloudflare quick tunnels) and the
// offline PREVIEW (bundled snapshot, no server). Usage (from sanpu-workspace):
//   node tools/live.mjs on     start tunnels, point both sites at them, redeploy, wait until ready
//   node tools/live.mjs off    back to the offline preview (stops the tunnels)
//   node tools/live.mjs status
// The APIs must be running (scripts/go-live.ps1 starts them first). Uses the Vercel CLI login token.
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const mode = process.argv[2] ?? "status";
const cfg = JSON.parse(fs.readFileSync(".vercel-projects.local.json", "utf8"));
const token = JSON.parse(fs.readFileSync(`${process.env.APPDATA}/com.vercel.cli/Data/auth.json`, "utf8")).token;
const q = `teamId=${cfg.teamId}`;
const SITES = [
  { name: "sanpu-travel", port: 5101, url: "https://sanpu-travel.vercel.app" },
  { name: "sanpu-trip-copilot", port: 5102, url: "https://sanpu-trip-copilot.vercel.app" },
];
const api = async (method, p, body) => {
  const r = await fetch(`https://api.vercel.com${p}${p.includes("?") ? "&" : "?"}${q}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

async function setEnv(id, key, value) { await api("POST", `/v10/projects/${id}/env?upsert=true`, { key, value, type: "plain", target: ["production", "preview"] }); }

async function deploy(site) {
  const id = cfg.projects[site.name];
  const proj = await api("GET", `/v9/projects/${id}`);
  const d = await api("POST", `/v13/deployments?forceNew=1`, { name: site.name, project: id, target: "production", gitSource: { type: "github", repoId: proj.link.repoId, ref: "main" } });
  return d.id;
}

async function waitReady(ids) {
  for (let i = 0; i < 90; i++) {
    const states = await Promise.all(ids.map(async (id) => (await api("GET", `/v13/deployments/${id}`)).readyState));
    if (states.every((s) => s === "READY")) return;
    if (states.some((s) => s === "ERROR" || s === "CANCELED")) throw new Error("Vercel build failed: " + states.join(", "));
    await sleep(10000);
  }
  throw new Error("Vercel builds did not finish in 15 minutes");
}

const tunnelLog = (port) => path.join(os.tmpdir(), `tunnel-${port}.log`);
function stopTunnels() { try { execSync("taskkill /IM cloudflared.exe /F", { stdio: "ignore" }); } catch { /* none running */ } }

async function startTunnel(port) {
  const file = tunnelLog(port);
  fs.writeFileSync(file, "");
  const out = fs.openSync(file, "a");
  spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], { detached: true, stdio: ["ignore", out, out], windowsHide: true }).unref();
  for (let i = 0; i < 60; i++) {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(fs.readFileSync(file, "utf8"));
    if (m) {
      for (let j = 0; j < 30; j++) {   // the name needs a moment to resolve
        try { const r = await fetch(`${m[0]}/api/v1/public/settings`); if (r.ok) return m[0]; } catch { /* not yet */ }
        await sleep(2000);
      }
      throw new Error(`Tunnel for ${port} did not answer`);
    }
    await sleep(1000);
  }
  throw new Error(`Tunnel for ${port} did not start (see ${file})`);
}

if (mode === "on") {
  for (const s of SITES) {
    const r = await fetch(`http://localhost:${s.port}/api/v1/public/settings`).catch(() => null);
    if (!r?.ok) throw new Error(`API on ${s.port} is not running. Run scripts/go-live.ps1 (it starts the APIs first).`);
  }
  stopTunnels();
  const urls = {};
  for (const s of SITES) { urls[s.name] = await startTunnel(s.port); log(`tunnel ${s.port} -> ${urls[s.name]}`); }
  for (const s of SITES) { const id = cfg.projects[s.name]; await setEnv(id, "API_URL", urls[s.name]); await setEnv(id, "NEXT_PUBLIC_STANDALONE", "auto");   // live, with the preview as automatic fallback }
  log("redeploying both sites in LIVE mode…");
  await waitReady(await Promise.all(SITES.map(deploy)));
  for (const s of SITES) { const r = await fetch(`${s.url}/api/v1/public/settings`); log(`${s.url} live: ${r.status === 200 ? "OK" : r.status}`); }
  fs.writeFileSync(".live.local.json", JSON.stringify({ mode: "live", at: new Date().toISOString(), urls }, null, 2));
  log("LIVE. Keep this computer on and awake during the presentation. Run `node tools/live.mjs off` afterwards.");
} else if (mode === "off") {
  for (const s of SITES) await setEnv(cfg.projects[s.name], "NEXT_PUBLIC_STANDALONE", "1");
  log("redeploying both sites as the offline preview…");
  await waitReady(await Promise.all(SITES.map(deploy)));
  stopTunnels();
  fs.writeFileSync(".live.local.json", JSON.stringify({ mode: "preview", at: new Date().toISOString() }, null, 2));
  log("Offline preview is live; the computer can be turned off.");
} else {
  console.log(fs.existsSync(".live.local.json") ? fs.readFileSync(".live.local.json", "utf8") : "{ \"mode\": \"preview\" }");
}
