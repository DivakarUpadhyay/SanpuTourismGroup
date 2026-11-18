// Waits until both Vercel projects have a READY production deployment of the given commit. Usage: node tools/vercel-wait.mjs <sha>
import fs from "node:fs";
const sha = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(".vercel-projects.local.json", "utf8"));
const token = JSON.parse(fs.readFileSync(`${process.env.APPDATA}/com.vercel.cli/Data/auth.json`, "utf8")).token;
for (let i = 0; i < 80; i++) {
  const states = await Promise.all(Object.entries(cfg.projects).map(async ([name, id]) => {
    const r = await (await fetch(`https://api.vercel.com/v6/deployments?projectId=${id}&teamId=${cfg.teamId}&limit=5&target=production`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const d = r.deployments?.find((x) => x.meta?.githubCommitSha?.startsWith(sha));
    return `${name}: ${d?.state ?? "waiting"}`;
  }));
  if (states.every((s) => s.endsWith("READY"))) { console.log(states.join(" | ")); process.exit(0); }
  if (states.some((s) => s.endsWith("ERROR"))) { console.log(states.join(" | ")); process.exit(1); }
  await new Promise((r) => setTimeout(r, 15000));
}
console.log("timeout"); process.exit(1);
