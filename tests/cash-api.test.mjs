// End-to-end tests of the API service against a real Postgres (PGlite),
// using the production migration and the production service code.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createCashService } from "../api/_hashway-cash.js";
import { pgliteDb, PGLITE_PARSERS } from "../api/_cash-db.js";
import * as E from "../api/_cash-engine.js";

const NOW = new Date("2026-10-05T05:00:00Z"); // 10:30 IST, Monday 5 Oct 2026
const TODAY = "2026-10-05";
const admin = { email: "shivam03299@gmail.com", role: "admin", name: "Shivam" };
const finance = { email: "accounts@hashway.in", role: "finance" };
const ops = { email: "ops@hashway.in", role: "operations" };
const viewer = { email: "investor@hashway.in", role: "viewer" };

let pg, svc;
const run = (action, body = {}, user = admin) => svc.run(action, { book: "live", ...body }, user);
const rejects = async (p, status, re) => {
  try { await p; } catch (e) {
    if (status) assert.equal(e.status, status, `expected HTTP ${status}, got ${e.status}: ${e.message}`);
    if (re) assert.match(e.message, re);
    return e;
  }
  assert.fail("expected rejection");
};

test.before(async () => {
  pg = new PGlite({ parsers: PGLITE_PARSERS });
  await pg.exec(fs.readFileSync(new URL("../supabase/migrations/20261004000000_hashway_cashflow.sql", import.meta.url), "utf8"));
  svc = createCashService(pgliteDb(pg), { now: () => NOW });
});
test.after(async () => { await pg.close(); });

let hdfc, icici;
test("set up accounts", async () => {
  hdfc = await run("account_upsert", { name: "HDFC Current", opening_balance: 1000000, opening_date: "2026-09-01", is_primary: true, restricted_amount: 100000 });
  icici = await run("account_upsert", { name: "ICICI Current", opening_balance: 0, opening_date: "2026-09-01" });
  const b = await run("bootstrap", {}, viewer);
  assert.equal(b.accounts.length, 2);
  assert.equal(b.today, TODAY);
});

test("daily update: bank mismatch (10L + 5L − 3L reported as 8L) is never accepted silently", async () => {
  const p = E.emptyDailyPayload("2026-10-03", [{ ...hdfc }, { ...icici }]);
  Object.assign(p.sales, { order_value: 600000, orders: 400, prepaid_sales: 330000, cod_sales: 270000, discounts: 40000, cancellations: 10000, refunds: 5000, rto_value: 0 });
  p.collections.find((c) => c.key === "razorpay").amount = 500000;
  p.payments.find((x) => x.key === "manufacturing").amount = 300000;
  p.bank.accounts = [{ account_id: hdfc.id, opening: 1000000, closing: 800000 }];
  p.sections = { sales: true, collections: true, payments: true, bank: true, commitments: true };
  const e1 = await rejects(run("daily_submit", { payload: p }, ops), 409);
  assert.ok(e1.extra.validation.warnings.some((w) => w.code === "recon" && /Expected ₹12,00,000/.test(w.msg)));
  const e2 = await rejects(run("daily_submit", { payload: p, acknowledged: true }, ops), 409, /explain the difference/);
  assert.ok(e2);
  const ok = await run("daily_submit", { payload: p, acknowledged: true, recon_note: "Checking with bank" }, ops);
  assert.equal(ok.status, "submitted");
  // sales ≠ cash: revenue accrual + receivables, cash only for what moved
  const ledger = await run("ledger_list", { from: "2026-10-03", to: "2026-10-03" }, viewer);
  const cash = ledger.rows.filter((r) => r.nature === "cash");
  assert.equal(cash.length, 2);
  const accr = ledger.rows.find((r) => r.nature === "accrual");
  assert.equal(accr.amount, 585000); // 600000 − 10000 − 5000
  const rec = await run("receivables_list", {}, viewer);
  assert.equal(rec.rows.length, 2);
  assert.equal(rec.rows.find((r) => r.kind === "gateway").net_amount, 323400); // 330000 less 2% fee
  assert.equal(rec.rows.find((r) => r.kind === "cod").confidence, "probable");
  // the dashboard shows the BANK figure and exposes the difference
  const d = await run("dashboard", {}, viewer);
  assert.equal(d.position.accounts.find((a) => a.id === hdfc.id).bank, 800000);
  assert.equal(d.tiles.systemCash, 1200000);
  assert.equal(d.tiles.unreconciled, -400000);
  assert.ok(d.alerts.some((a) => a.code === "bank_recon_difference"));
});

test("duplicate daily update for the same date is refused; correction needs reopen + reason, and is audited", async () => {
  const got = await run("daily_get", { date: "2026-10-03" }, ops);
  await rejects(run("daily_submit", { payload: got.payload, acknowledged: true, recon_note: "x" }, ops), 422, /fix the errors/);
  await rejects(run("daily_reopen", { date: "2026-10-03" }), 400, /reason is required/);
  await rejects(run("daily_reopen", { date: "2026-10-03", reason: "wrong closing" }, ops), 403);
  const r = await run("daily_reopen", { date: "2026-10-03", reason: "Closing balance typo — was ₹12L" }, finance);
  assert.equal(r.voided, 3); // 2 cash + 1 accrual
  const rec = await run("receivables_list", {}, viewer);
  assert.equal(rec.rows.length, 0);
  const p = got.payload;
  p.bank.accounts[0].closing = 1200000;
  const ok = await run("daily_submit", { payload: p, acknowledged: true, mode: "correct", reason: "Closing balance typo" }, ops);
  assert.equal(ok.validation.reconOk, true);
  const d = await run("dashboard", {}, viewer);
  assert.equal(d.tiles.unreconciled, 0);
  assert.equal(d.tiles.currentCash, 1200000);
  const audit = await run("audit_list", { table: "cf_transactions", only_changes: true }, finance);
  assert.ok(audit.some((a) => a.reason === "Closing balance typo — was ₹12L" && a.changed_by === finance.email && a.new_values.status === "void"
    && /^Reopened 2026-10-03/.test(a.new_values.void_reason)));
});

test("editing a posted transaction requires a reason; original and new values are kept", async () => {
  const t = await run("txn_create", { direction: "out", amount: 18500, txn_date: "2026-10-04", category_code: "ops_software", bank_account_id: hdfc.id, description: "Shopify" }, finance);
  await rejects(run("txn_update", { id: t.id, patch: { amount: 19500 } }, finance), 400, /reason/);
  await run("txn_update", { id: t.id, patch: { amount: 19500 }, reason: "Included GST" }, finance);
  const log = await run("audit_list", { row_id: t.id }, finance);
  const upd = log.find((l) => l.action === "update");
  assert.equal(upd.old_values.amount, 18500);
  assert.equal(upd.new_values.amount, 19500);
  assert.equal(upd.reason, "Included GST");
  assert.equal(upd.changed_by, finance.email);
  // hard delete is impossible in the live book
  await assert.rejects(pg.query("delete from cf_transactions where id = $1", [t.id]), /Hard delete is not allowed/);
  await run("txn_void", { id: t.id, reason: "Duplicate of bank import" }, finance);
});

test("negative values and future dates are rejected; viewer can't write", async () => {
  const p = E.emptyDailyPayload("2026-10-04", [hdfc]);
  p.sales.order_value = -5;
  p.sections = { sales: true };
  const e = await rejects(run("daily_submit", { payload: p, acknowledged: true }, ops), 422);
  assert.ok(e.extra.validation.errors.some((x) => /negative/.test(x.msg)));
  await rejects(run("txn_create", { direction: "in", amount: 1, txn_date: "2026-10-04", category_code: "income_other", bank_account_id: hdfc.id }, viewer), 403);
  await rejects(run("txn_create", { direction: "in", amount: 1000, txn_date: "2026-10-09", category_code: "income_other", bank_account_id: hdfc.id }, finance), 400, /future/);
});

test("PO ₹5L with ₹2L paid → ₹3L outstanding lands in the forecast week of 15 Oct; partial payments reduce it", async () => {
  const po = await run("po_create", { supplier: "Kanha Knits", item_desc: "Winter hoodies", total_value: 500000, order_date: "2026-09-20",
    expected_delivery_date: "2026-10-15", payment_terms: "custom", installments: [{ label: "Advance", amount: 200000, due_date: "2026-09-20" }, { label: "Balance", amount: 300000, due_date: "2026-10-15" }] }, ops);
  await run("payable_pay", { type: "po_installment", id: po.installments[0].id, amount: 200000, date: "2026-10-04", bank_account_id: hdfc.id }, finance);
  let f = await run("forecast", {}, viewer);
  const wk = f.scenarios.base.weeks.find((w) => w.start === "2026-10-12");
  const poFlows = f.scenarios.base.flows.filter((x) => x.source === "po");
  assert.equal(poFlows.length, 1);
  assert.equal(poFlows[0].amount, 300000);
  assert.equal(poFlows[0].date, "2026-10-15");
  assert.ok(wk.outflow >= 300000);
  await run("payable_pay", { type: "po_installment", id: po.installments[1].id, amount: 100000, date: "2026-10-05", bank_account_id: hdfc.id }, finance);
  f = await run("forecast", {}, viewer);
  assert.equal(f.scenarios.base.flows.filter((x) => x.source === "po")[0].amount, 200000);
  const list = await run("po_list", {}, viewer);
  assert.equal(list[0].paid, 300000);
  assert.equal(list[0].balance, 200000);
  assert.equal(list[0].advance, 300000); // nothing received yet → all paid money is a supplier advance
  await rejects(run("payable_pay", { type: "po_installment", id: po.installments[1].id, amount: 250000, date: "2026-10-05", bank_account_id: hdfc.id }, finance), 400, /outstanding/);
});

test("late COD settlement: an overdue COD receivable is flagged and moved into the forecast", async () => {
  await run("receivable_create", { kind: "cod", channel_code: "delhivery_cod", reference: "COD batch 12 Sep", origin_date: "2026-09-12", net_amount: 350000, expected_date: "2026-09-21" }, finance);
  const d = await run("dashboard", {}, viewer);
  assert.equal(d.codOverdue, 350000);
  assert.ok(d.alerts.some((a) => a.code === "cod_overdue" && /₹3,50,000 COD settlements are overdue/.test(a.message)));
});

test("bank statement import: duplicate file refused, overlapping rows de-duplicated, auto-match + post-from-bank", async () => {
  const rows = [
    { Date: "04/10/2026", Narration: "NEFT DR-KANHA KNITS", "Withdrawal Amt.": "2,00,000.00", "Deposit Amt.": "", "Closing Balance": "10,00,000.00" },
    { Date: "04/10/2026", Narration: "CHRG NEFT", "Withdrawal Amt.": "118.00", "Deposit Amt.": "", "Closing Balance": "9,99,882.00" },
    { Date: "31/09/2026", Narration: "bad date", "Withdrawal Amt.": "1", "Deposit Amt.": "", "Closing Balance": "" },
  ];
  const mapping = { date: "Date", description: "Narration", debit: "Withdrawal Amt.", credit: "Deposit Amt.", balance: "Closing Balance" };
  const r1 = await run("import_commit", { import_type: "bank_statement", file_name: "hdfc.csv", file_hash: "h1", mapping, rows, bank_account_id: hdfc.id }, finance);
  assert.equal(r1.success, 2);
  assert.equal(r1.failed, 1);
  assert.match(r1.errors[0].error, /not a date/);
  await rejects(run("import_commit", { import_type: "bank_statement", file_name: "hdfc.csv", file_hash: "h1", mapping, rows, bank_account_id: hdfc.id }, finance), 409, /already imported/);
  const r2 = await run("import_commit", { import_type: "bank_statement", file_name: "hdfc-2.csv", file_hash: "h2", mapping, rows: rows.slice(0, 2), bank_account_id: hdfc.id }, finance);
  assert.equal(r2.duplicates, 2);
  assert.equal(r2.success, 0);
  await rejects(run("import_commit", { import_type: "bank_statement", file_hash: "h3", mapping, rows, bank_account_id: hdfc.id }, ops), 403);
  const m = await run("bank_automatch", { account_id: hdfc.id }, finance);
  assert.equal(m.matched, 1);
  const v = await run("bank_view", { account_id: hdfc.id, from: "2026-10-01", to: "2026-10-05" }, viewer);
  const charge = v.lines.find((l) => l.match_status === "unmatched");
  assert.equal(charge.amount, 118);
  await run("bank_post", { bank_id: charge.id, category_code: "fin_bank_charges" }, finance);
  const v2 = await run("bank_view", { account_id: hdfc.id, from: "2026-10-01", to: "2026-10-05" }, viewer);
  assert.equal(v2.summary.unmatched, 0);
  assert.ok(v2.statement);
});

test("shopify import aggregates orders into daily sales and skips dates already entered", async () => {
  const rows = [
    { Name: "#1001", "Created at": "2026-10-02 10:00:00 +0530", Total: "1499", "Payment Method": "Razorpay", "Lineitem quantity": "1" },
    { Name: "#1001", "Created at": "2026-10-02 10:00:00 +0530", Total: "", "Payment Method": "Razorpay", "Lineitem quantity": "1" },
    { Name: "#1002", "Created at": "2026-10-02 12:00:00 +0530", Total: "2199", "Payment Method": "Cash on Delivery (COD)", "Lineitem quantity": "1" },
    { Name: "#0999", "Created at": "2026-10-03 09:00:00 +0530", Total: "999", "Payment Method": "Razorpay", "Lineitem quantity": "1" },
  ];
  const mapping = { order: "Name", created_at: "Created at", total: "Total", gateway: "Payment Method", quantity: "Lineitem quantity" };
  const r = await run("import_commit", { import_type: "shopify_orders", file_hash: "s1", file_name: "orders.csv", mapping, rows }, ops);
  assert.equal(r.failed, 1); // second line item row has no total → flagged, not guessed
  assert.equal(r.duplicates, 1); // 3 Oct already came from the daily update
  const rec = await run("receivables_list", { kind: "cod" }, viewer);
  assert.ok(rec.rows.some((x) => x.reference === "COD sales 2026-10-02" && x.gross_amount === 2199));
});

test("demo book loads through the real pipeline and tells the whole story", { timeout: 300000 }, async () => {
  const demo = (step, extra = {}) => svc.run("demo_step", { book: "demo", step, ...extra }, admin);
  await rejects(svc.run("demo_step", { book: "live", step: "reset" }, admin), 400, /demo book/);
  const { days } = await demo("reset");
  await demo("master");
  for (let i = 0; i < days; i += 20) await demo("days", { from: i, count: 20 });
  const fin = await demo("finish");
  assert.ok(fin.statementLines > 20);
  const d = await svc.run("dashboard", { book: "demo" }, viewer);
  // live book untouched by demo
  const live = await run("dashboard", {}, viewer);
  assert.ok(live.tiles.currentCash < 2000000);
  console.log("[demo] cash", d.tiles.currentCash, "lowest", d.tiles.lowest13, "min", d.tiles.minRequired, "alerts", d.alerts.map((a) => a.code).join(","));
  assert.equal(d.updateStatus.status, "red");
  assert.ok(d.alerts.some((a) => a.code === "daily_update_missing"));
  assert.ok(d.tiles.currentCash > 0);
  // the day the bank closed ₹2,350 short is stored, explained, and the statement
  // (uncleared cheque + unknown credit + charges) still disagrees with the ledger
  const reconDays = await pg.query("select recon_difference, recon_note from cf_daily_updates where book = 'demo' and recon_difference <> 0");
  assert.equal(reconDays.rows.length, 1);
  assert.equal(reconDays.rows[0].recon_difference, -2350);
  assert.match(reconDays.rows[0].recon_note, /bank charges/);
  // …and the cumulative bank-vs-ledger gap keeps showing on every later day until it's posted
  const gap = await pg.query("select distinct difference from cf_bank_balances where book = 'demo' and source = 'daily_update' and difference <> 0");
  assert.deepEqual(gap.rows.map((r) => r.difference), [-2350]);
  assert.notEqual(d.tiles.unreconciled, 0);
  assert.ok(d.receivables.overdue > 0);
  assert.ok(d.supplierDue14 > 0);
  assert.ok(d.accuracy.rows.length >= 3, "forecast accuracy history exists");
  assert.ok(d.cccTrend.length >= 3);
  assert.ok(d.inventory.totals.value > 500000);
  assert.ok(d.scenarios.worst.endingCash < d.scenarios.base.endingCash && d.scenarios.base.endingCash < d.scenarios.optimistic.endingCash);
  for (const w of d.scenarios.base.weeks) assert.equal(E.r2(w.opening + w.inflow - w.outflow), w.closing);
  const mis = await svc.run("mis", { book: "demo" }, viewer);
  assert.ok(mis.pnl.some((m) => m.revenue > 1000000));
  assert.ok(mis.bridges.some((b) => b.lines.length >= 5));
  for (const t of ["daily_cash", "weekly_cash", "forecast_13w", "working_capital", "supplier_payables", "receivables", "inventory", "forecast_vs_actual", "monthly_mis", "ccc"]) {
    const rep = await svc.run("report", { book: "demo", type: t }, viewer);
    assert.ok(rep.title && Array.isArray(rep.rows), t);
  }
  const v = await svc.run("bank_view", { book: "demo", account_id: d.position.accounts[0].id }, viewer);
  assert.ok(v.lines.length > 20);
  const auto = await svc.run("bank_automatch", { book: "demo", account_id: d.position.accounts[0].id }, admin);
  assert.ok(auto.matched > 15);
  assert.ok(auto.remaining >= 2); // bank charges + unknown credit stay unmatched
});
