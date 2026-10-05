// Runs the service through the PRODUCTION driver (postgres.js, as on Vercel)
// against PGlite served over a real TCP socket.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createCashService } from "../api/_hashway-cash.js";
import { prodDb } from "../api/_cash-db.js";
import * as E from "../api/_cash-engine.js";

let pg, server, db;
test.before(async () => {
  pg = await PGlite.create();
  await pg.exec(fs.readFileSync(new URL("../supabase/migrations/20261004000000_hashway_cashflow.sql", import.meta.url), "utf8"));
  server = new PGLiteSocketServer({ db: pg, port: 55432, host: "127.0.0.1" });
  await server.start();
  process.env.CASH_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:55432/postgres";
  process.env.CASH_DB_POOL_MAX = "1"; // PGlite serves one connection
  db = prodDb();
});
test.after(async () => { await db.end(); await server.stop(); await pg.close(); });

test("postgres.js adapter: dates stay strings, numerics are numbers, arrays + transactions + audit work", async () => {
  const svc = createCashService(db, { now: () => new Date("2026-10-05T05:00:00Z") });
  const u = { email: "fin@hashway.in", role: "finance" };
  const acct = await svc.run("account_upsert", { book: "live", name: "HDFC", opening_balance: 500000, opening_date: "2026-09-01", is_primary: true }, u);
  assert.equal(acct.opening_date, "2026-09-01");
  assert.equal(typeof acct.opening_balance, "number");
  const p = E.emptyDailyPayload("2026-10-04", [acct]);
  Object.assign(p.sales, { order_value: 50000, prepaid_sales: 30000, cod_sales: 20000 });
  p.collections[0].amount = 25000;
  p.bank.accounts = [{ account_id: acct.id, opening: 500000, closing: 525000 }];
  p.sections = { sales: true, collections: true, payments: true, bank: true, commitments: true };
  const r = await svc.run("daily_submit", { book: "live", payload: p, acknowledged: true }, u);
  assert.equal(r.status, "submitted");
  const d = await svc.run("dashboard", { book: "live" }, u);
  assert.equal(d.tiles.currentCash, 525000);
  assert.equal(d.updateStatus.status, "green");
  const imp = await svc.run("import_commit", { book: "live", import_type: "bank_statement", file_hash: "x", mapping: { date: "d", amount: "a", description: "n" },
    rows: [{ d: "2026-10-04", a: "25000", n: "RAZORPAY" }], bank_account_id: acct.id }, u);
  assert.equal(imp.success, 1);
  assert.equal((await svc.run("bank_automatch", { book: "live", account_id: acct.id }, u)).matched, 1);
  await assert.rejects(svc.run("txn_update", { book: "live", id: (await svc.run("ledger_list", { book: "live", nature: "cash" }, u)).rows[0].id, patch: { amount: 1 } }, u), /reason/);
  const audit = await svc.run("audit_list", { book: "live", limit: 5 }, u);
  assert.ok(audit.every((a) => typeof a.changed_at !== "undefined"));
});
