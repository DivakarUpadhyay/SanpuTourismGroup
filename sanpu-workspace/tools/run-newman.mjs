// Runs the Postman "Smoke" folders against running APIs. Passwords are read from the git-ignored demo login files
// produced by `provision-demo-users` and passed as environment overrides (never written into the collections).
// Usage: node tools/run-newman.mjs [--erp http://localhost:5201] [--ai http://localhost:5202] [--logins tests/e2e/.auth]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]]] : acc), []));
const root = process.cwd();
const loginsDir = args.logins ?? "tests/e2e/.auth";
const pw = (app, email) => fs.readFileSync(path.join(loginsDir, `${app}.logins.txt`), "utf8").split(/\r?\n/).find((l) => l.startsWith(email + ","))?.split(",")[1] ?? "";

const runs = [
  { app: "erp", collection: "postman/Project-A.postman_collection.json", env: "postman/Project-A.local.postman_environment.json", base: args.erp ?? "http://localhost:5201", user: "traveler.chen@demo.sanpu.test", staff: "ops.manager@demo.sanpu.test" },
  { app: "ai", collection: "postman/Project-B.postman_collection.json", env: "postman/Project-B.local.postman_environment.json", base: args.ai ?? "http://localhost:5202", user: "traveler.lee@demo.sanpu.test", staff: "ops.agent@demo.sanpu.test" }
];
let failed = 0;
for (const r of runs) {
  const report = path.join("artifacts", "newman", `${r.app}.json`);
  fs.mkdirSync(path.dirname(report), { recursive: true });
  try {
    execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["newman", "run", r.collection, "-e", r.env, "--folder", "Smoke",
      "--env-var", `baseUrl=${r.base}`, "--env-var", `testUserPassword=${pw(r.app, r.user)}`, "--env-var", `staffPassword=${pw(r.app, r.staff)}`,
      "-r", "cli,json", "--reporter-json-export", report], { stdio: "inherit", cwd: root, shell: process.platform === "win32" });
  } catch { failed++; }
}
process.exit(failed ? 1 : 0);
