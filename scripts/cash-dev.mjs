// Local development for the Hashway Cash Command Center — no cloud needed.
//
//   node scripts/cash-dev.mjs            → API on :8787 + Vite on :5180
//   open http://localhost:5180/cash
//
// The API runs the real service (api/_hashway-cash.js) on PGlite —
// an in-process Postgres persisted to ./.cash-dev/ — with the real
// migration applied. Auth is bypassed with a LOCAL-ONLY header
// (x-cash-dev-role) so you can try each role; this file is never deployed.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createCashService } from "../api/_hashway-cash.js";
import { pgliteDb, PGLITE_PARSERS } from "../api/_cash-db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".cash-dev");
const fresh = !fs.existsSync(dataDir);
const pg = new PGlite(dataDir, { parsers: PGLITE_PARSERS, relaxedDurability: true });
if (fresh) {
  await pg.exec(fs.readFileSync(path.join(root, "supabase/migrations/20261004000000_hashway_cashflow.sql"), "utf8"));
  console.log("[cash-dev] created local database in .cash-dev/ (delete the folder to start over)");
}
const svc = createCashService(pgliteDb(pg));
const PORT = Number(process.env.CASH_DEV_API_PORT || 8787);

http.createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (!req.url.startsWith("/api/hashway-cash")) return send(404, { error: "not found" });
  let raw = "";
  for await (const c of req) raw += c;
  try {
    const body = raw ? JSON.parse(raw) : {};
    const role = String(req.headers["x-cash-dev-role"] || "admin");
    const user = { email: `${role}@local.dev`, role, name: `Local ${role}` };
    const t0 = Date.now();
    const out = await svc.run(body.action, body, user);
    console.log(`[cash-dev] ${role} ${body.action} ${Date.now() - t0}ms`);
    send(200, out ?? { ok: true });
  } catch (e) {
    if (!e.status) console.error(e);
    send(e.status || 500, { error: e.message, ...(e.extra || {}) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`[cash-dev] API on http://127.0.0.1:${PORT}`));

const vitePort = process.env.CASH_DEV_PORT || "5180";
const vite = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--port", vitePort, "--strictPort"], {
  cwd: root, stdio: "inherit", env: { ...process.env, VITE_CASH_DEV: "1", CASH_DEV_API: `http://127.0.0.1:${PORT}` },
});
const stop = () => { vite.kill(); pg.close().finally(() => process.exit(0)); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
