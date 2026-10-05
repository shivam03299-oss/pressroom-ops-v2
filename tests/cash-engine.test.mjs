// Run: npm test   (node --test tests/)
import test from "node:test";
import assert from "node:assert/strict";
import * as E from "../api/_cash-engine.js";

const ASOF = "2026-10-05"; // a Monday
const cats = {
  ops_salaries: { is_critical: true, pnl_class: "salaries" },
  ops_rent: { is_critical: true, pnl_class: "opex" },
  tax_gst: { is_critical: true, pnl_class: "tax" },
  prod_manufacturing: { is_critical: false, pnl_class: "inventory" },
  mkt_meta: { is_critical: false, pnl_class: "marketing" },
  sales_d2c: { pnl_class: "revenue" },
  transfer: { pnl_class: "transfer" },
};
const baseInput = (over = {}) => ({
  asOf: ASOF, weeks: 13, openingCash: 1000000,
  receivables: [], payables: [], installments: [], recurring: [], expected: [], dailySales: [],
  recurringCovered: new Set(), gstCoveredMonths: new Set(), bookedNetSalesByMonth: {},
  categories: cats, settings: { min_cash_manual: 500000, min_cash_mode: "manual", min_cash_horizon_days: 30, gst_net_payable_pct: 0, gst_rate_pct: 5, default_cogs_pct: 38 },
  assumptions: E.defaultAssumptions(), ...over,
});

test("dates: week starts are Mondays and roll with asOf", () => {
  assert.equal(E.mondayOf("2026-10-08"), "2026-10-05");
  assert.equal(E.mondayOf("2026-10-11"), "2026-10-05"); // Sunday
  const w = E.weekStarts("2026-10-08", 13);
  assert.equal(w.length, 13);
  assert.equal(w[0], "2026-10-05");
  assert.equal(w[12], "2026-12-28");
  assert.equal(E.weekStarts("2026-10-12", 1)[0], "2026-10-12"); // next week rolls forward
  assert.equal(E.addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(E.istToday(new Date("2026-10-04T20:00:00Z")), "2026-10-05"); // 01:30 IST next day
});

test("closing = opening + inflows − outflows, and next opening = previous closing", () => {
  const f = E.buildForecast(baseInput({
    receivables: [{ id: "r1", kind: "gateway", status: "open", net_amount: 200000, collected_amount: 0, written_off_amount: 0, expected_date: "2026-10-07", confidence: "confirmed", origin_date: "2026-10-04" }],
    payables: [{ id: "p1", category_code: "ops_rent", status: "open", amount: 80000, paid_amount: 0, due_date: "2026-10-14" }],
  }), "base");
  const [w1, w2, w3] = f.weeks;
  assert.equal(w1.opening, 1000000);
  assert.equal(w1.inflow, 200000);
  assert.equal(w1.closing, 1200000);
  assert.equal(w2.opening, w1.closing);
  assert.equal(w2.outflow, 80000);
  assert.equal(w2.closing, 1120000);
  assert.equal(w3.opening, w2.closing);
  for (const w of f.weeks) assert.equal(E.r2(w.opening + w.inflow - w.outflow), w.closing);
});

test("PO outstanding balance lands in the right forecast week (₹5L PO, ₹2L paid, ₹3L due 15 Oct)", () => {
  const inst = E.buildInstallments("custom", 500000, "2026-09-01", "2026-10-15", [
    { label: "Advance", amount: 200000, due_date: "2026-09-01" },
    { label: "Balance", amount: 300000, due_date: "2026-10-15" },
  ]);
  assert.equal(E.r2(inst.reduce((s, i) => s + i.amount, 0)), 500000);
  const installments = inst.map((i, k) => ({ ...i, id: "i" + k, po_number: "PO-1", status: k === 0 ? "paid" : "open", paid_amount: k === 0 ? 200000 : 0 }));
  const f = E.buildForecast(baseInput({ installments }), "base");
  const wk = f.weeks.find((w) => w.start <= "2026-10-15" && w.end >= "2026-10-15");
  assert.equal(wk.index, 2);
  assert.equal(wk.outflow, 300000);
  assert.equal(f.totalOutflow, 300000);
});

test("payment structures: 100% advance, 50/50, 30/40/30, custom; rounding residue on last", () => {
  assert.deepEqual(E.buildInstallments("100_advance", 100000, "2026-10-01").map((i) => i.amount), [100000]);
  assert.deepEqual(E.buildInstallments("50_50", 100001, "2026-10-01", "2026-11-01").map((i) => i.amount), [50000.5, 50000.5]);
  const t = E.buildInstallments("30_40_30", 333333, "2026-10-01", "2026-10-31");
  assert.deepEqual(t.map((i) => i.amount), [99999.9, 133333.2, 99999.9]);
  assert.equal(t[1].due_date, "2026-10-16");
  assert.equal(E.r2(t.reduce((s, i) => s + i.amount, 0)), 333333);
  const odd = E.buildInstallments("custom", 1000, "2026-10-01", null, [
    { label: "a", pct: 33.33, due_date: "2026-10-01" }, { label: "b", pct: 33.33, due_date: "2026-10-10" }, { label: "c", pct: 33.34, due_date: "2026-10-20" }]);
  assert.equal(E.r2(odd.reduce((s, i) => s + i.amount, 0)), 1000);
  assert.throws(() => E.buildInstallments("custom", 1000, "2026-10-01", null, [{ label: "a", pct: 50, due_date: "2026-10-01" }]), /100%/);
  assert.throws(() => E.buildInstallments("50_50", 0, "2026-10-01"), /greater than zero/);
  assert.throws(() => E.buildInstallments("50_50", 100, "2026-10-10", "2026-10-01"), /before order/);
});

test("partial supplier payments: only the unpaid balance is forecast; advance = paid − received", () => {
  const installments = [{ id: "a", po_id: "po", amount: 150000, paid_amount: 100000, status: "partial", due_date: "2026-10-06", label: "Advance" }];
  const f = E.buildForecast(baseInput({ installments }), "base");
  assert.equal(f.totalOutflow, 50000);
  assert.equal(E.poAdvance({ id: "po", status: "open", received_value: 0 }, installments), 100000);
  assert.equal(E.poAdvance({ id: "po", status: "partially_received", received_value: 120000 }, installments), 0);
  assert.equal(E.poAdvance({ id: "po", status: "cancelled", received_value: 0 }, installments), 0);
});

test("uncertain revenue is weighted, never treated as guaranteed", () => {
  const recv = (conf) => ({ id: conf, kind: "cod", status: "open", net_amount: 100000, collected_amount: 0, written_off_amount: 0, expected_date: "2026-10-08", confidence: conf, origin_date: "2026-10-01" });
  const f = E.buildForecast(baseInput({ receivables: [recv("confirmed"), recv("probable"), recv("possible")] }), "base");
  const A = E.defaultAssumptions().base;
  assert.equal(f.weeks[0].inflowUnweighted, 300000);
  assert.equal(f.weeks[0].inflow, E.r2(100000 + 100000 * A.probable_weight_pct / 100 + 100000 * A.possible_weight_pct / 100));
  const worst = E.buildForecast(baseInput({ receivables: [recv("possible")] }), "worst");
  assert.equal(worst.totalInflow, 100000 * E.defaultAssumptions().worst.possible_weight_pct / 100);
});

test("late COD settlements: overdue receivables move to asOf+delay and lose confidence", () => {
  const r = { id: "r", kind: "cod", status: "open", net_amount: 100000, collected_amount: 0, written_off_amount: 0, expected_date: "2026-09-01", confidence: "confirmed", origin_date: "2026-08-20" };
  const { flows } = E.buildFlows(baseInput({ receivables: [r] }), "base");
  assert.equal(flows[0].date, E.addDays(ASOF, 3));
  assert.equal(flows[0].confidence, "possible"); // > 30 days late
  assert.equal(flows[0].overdue, true);
  const worst = E.buildFlows(baseInput({ receivables: [{ ...r, expected_date: "2026-09-25" }] }), "worst").flows[0];
  assert.equal(worst.date, E.addDays(ASOF, 14 + 7)); // overdue delay + collection delay
  assert.equal(worst.confidence, "confirmed"); // 10 days late keeps its confidence
  const ag = E.receivableAgeing([r], ASOF);
  assert.equal(ag.overdue, 100000);
  assert.equal(ag.buckets.find((b) => b.key === "31-60").amount, 100000);
});

test("refunds & RTOs reduce projected cash; worst case has lower sales and slower collections", () => {
  const dailySales = [];
  for (let i = 1; i <= 60; i++) dailySales.push({ sale_date: E.addDays(ASOF, -i), order_value: 100000, prepaid_sales: 50000, cod_sales: 50000, refunds: 3000, rto_value: 12500, cancellations: 0 });
  const inp = baseInput({ dailySales });
  const base = E.buildForecast(inp, "base"), worst = E.buildForecast(inp, "worst"), opt = E.buildForecast(inp, "optimistic");
  assert.equal(base.assumptionsUsed.observed_rto_rate, 25);
  assert.ok(base.flows.some((f) => f.category === "refund_paid" && f.direction === "out"));
  const codIn = base.flows.filter((f) => f.source === "projection" && f.category === "collect_cod").reduce((s, f) => s + f.amount, 0);
  const prepaidIn = base.flows.filter((f) => f.source === "projection" && f.category === "collect_gateway").reduce((s, f) => s + f.amount, 0);
  assert.ok(codIn < prepaidIn * 0.8, "COD cash is reduced by RTO");
  assert.ok(worst.endingCash < base.endingCash && base.endingCash < opt.endingCash);
  assert.ok(worst.totalInflow < base.totalInflow);
  // committed expenses unchanged across scenarios
  const inp2 = baseInput({ payables: [{ id: "p", category_code: "ops_rent", status: "open", amount: 90000, paid_amount: 0, due_date: "2026-10-20" }] });
  assert.equal(E.buildForecast(inp2, "worst").totalOutflow, E.buildForecast(inp2, "base").totalOutflow);
});

test("large one-time production payment triggers cash shortage + alerts", () => {
  const f = E.buildForecast(baseInput({
    openingCash: 1200000,
    installments: [{ id: "big", amount: 900000, paid_amount: 0, status: "open", due_date: "2026-10-28", label: "Balance", po_number: "PO-9" }],
    payables: [{ id: "sal", category_code: "ops_salaries", status: "open", amount: 400000, paid_amount: 0, due_date: "2026-11-03", priority: "critical" }],
  }), "base");
  assert.equal(f.firstBelowMinWeek, 4);
  assert.equal(f.runOutWeek, 5);
  assert.equal(f.lowest.closing, -100000);
  assert.equal(f.affordableNow, 0);
  assert.equal(f.fundingGap, 600000);
  const alerts = E.evaluateAlerts({ base: f }, [{ code: "below_min_reserve", enabled: true }, { code: "cash_negative", enabled: true }]);
  assert.match(alerts.find((a) => a.code === "below_min_reserve").message, /Week 4/);
  assert.match(alerts.find((a) => a.code === "cash_negative").message, /Week 5/);
});

test("minimum cash: manual vs computed critical obligations vs higher-of", () => {
  const flows = [
    { date: "2026-10-07", direction: "out", amount: 300000, category: "ops_salaries" },
    { date: "2026-10-10", direction: "out", amount: 50000, category: "ops_rent" },
    { date: "2026-10-10", direction: "out", amount: 999999, category: "mkt_meta" },
    { date: "2026-12-01", direction: "out", amount: 300000, category: "ops_salaries" },
  ];
  const s = { min_cash_manual: 200000, min_cash_horizon_days: 30 };
  assert.equal(E.minCashRequired(flows, ASOF, { ...s, min_cash_mode: "computed" }, cats).value, 350000);
  assert.equal(E.minCashRequired(flows, ASOF, { ...s, min_cash_mode: "manual" }, cats).value, 200000);
  assert.equal(E.minCashRequired(flows, ASOF, { ...s, min_cash_mode: "higher" }, cats).value, 350000);
});

test("recurring expenses expand into weeks and skip periods already booked", () => {
  const rec = { id: "rent", name: "Rent", category_code: "ops_rent", amount: 85000, frequency: "monthly", day_of_month: 5, start_date: "2026-01-05", active: true };
  assert.deepEqual(E.recurringDates(rec, ASOF, "2026-12-31"), ["2026-10-05", "2026-11-05", "2026-12-05"]);
  const f = E.buildForecast(baseInput({ recurring: [rec], recurringCovered: new Set(["rent|2026-10"]) }), "base");
  assert.equal(f.totalOutflow, 170000);
  const q = E.recurringDates({ ...rec, frequency: "quarterly", start_date: "2026-01-31", day_of_month: 31 }, "2026-01-01", "2026-12-31");
  assert.deepEqual(q, ["2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31"]);
  assert.deepEqual(E.recurringDates({ ...rec, frequency: "weekly", weekday: 1, start_date: "2026-10-01" }, ASOF, "2026-10-19"), ["2026-10-05", "2026-10-12", "2026-10-19"]);
});

test("GST is reserved on the 20th of the next month unless already covered", () => {
  const inp = baseInput({ settings: { ...baseInput().settings, gst_net_payable_pct: 4 }, bookedNetSalesByMonth: { "2026-09": 1000000 } });
  const g = E.buildFlows(inp, "base").flows.filter((f) => f.category === "tax_gst");
  assert.equal(g.length, 1);
  assert.equal(g[0].date, "2026-10-20");
  assert.equal(g[0].amount, 40000);
  const covered = E.buildFlows({ ...inp, gstCoveredMonths: new Set(["2026-10"]) }, "base").flows.filter((f) => f.category === "tax_gst");
  assert.equal(covered.length, 0);
});

test("FIFO allocation applies to oldest documents and reports unapplied cash", () => {
  const r = E.allocateFIFO([{ id: "b", remaining: 500, date: "2026-10-02" }, { id: "a", remaining: 300, date: "2026-10-01" }], 600);
  assert.deepEqual(r.allocations, [{ id: "a", amount: 300 }, { id: "b", amount: 300 }]);
  assert.equal(r.unapplied, 0);
  assert.equal(E.allocateFIFO([{ id: "a", remaining: 100, date: "2026-10-01" }], 250).unapplied, 150);
  assert.equal(E.allocateFIFO([], 0).allocations.length, 0);
});

test("daily validation: the spec's bank example (10L + 5L − 3L ≠ 8L) is flagged, never accepted silently", () => {
  const accounts = [{ id: "hdfc", name: "HDFC Current" }];
  const p = E.emptyDailyPayload("2026-10-04", accounts);
  p.sales.order_value = 500000; p.sales.prepaid_sales = 300000; p.sales.cod_sales = 200000;
  p.collections[0].amount = 500000;
  p.payments[0].amount = 300000;
  p.bank.accounts[0] = { account_id: "hdfc", opening: 1000000, closing: 800000 };
  p.sections = { sales: true, collections: true, payments: true, bank: true, commitments: true };
  const v = E.validateDailyUpdate(p, { today: "2026-10-05", accounts, prevClosing: { hdfc: 1000000 }, settings: { large_amount_floor: 1e9 } });
  assert.equal(v.errors.length, 0);
  const rw = v.warnings.find((w) => w.code === "recon");
  assert.ok(rw, "recon warning raised");
  assert.match(rw.msg, /does not reconcile\. Expected ₹12,00,000/);
  assert.equal(v.recon[0].expected, 1200000);
  assert.equal(v.recon[0].difference, -400000);
  assert.equal(v.reconOk, false);
  p.bank.accounts[0].closing = 1200000;
  assert.equal(E.validateDailyUpdate(p, { today: "2026-10-05", accounts, settings: { large_amount_floor: 1e9 } }).reconOk, true);
});

test("daily validation: missing values, negatives, duplicates, future/duplicate dates, large amounts", () => {
  const accounts = [{ id: "a1", name: "HDFC" }];
  const p = E.emptyDailyPayload("2026-10-06", accounts);
  p.sections = { sales: true };
  p.sales.discounts = -5;
  p.payments[1].amount = 25000; p.payments[2].amount = 25000; // same amount, different category → fine
  p.payments[4].amount = 900000;
  p.payments[5].amount = 900000; p.payments[5].category_code = "mkt_meta"; // same category+amount as advertising → dup
  const v = E.validateDailyUpdate(p, { today: "2026-10-05", accounts, existingStatus: "submitted", averages: { advertising: 15000 }, settings: { large_amount_floor: 100000, large_amount_multiple: 3 } });
  const msgs = v.errors.map((e) => e.msg).join("\n");
  assert.match(msgs, /future date/);
  assert.match(msgs, /already submitted/);
  assert.match(msgs, /Discounts given can't be negative/);
  assert.match(msgs, /Enter total Shopify sales/);
  assert.match(msgs, /closing balance for HDFC/);
  const w = v.warnings.map((x) => x.code);
  assert.ok(w.includes("large"));
  assert.ok(w.includes("dup_line"));
  assert.ok(w.includes("incomplete"));
  assert.equal(v.status, "partial");
  // correcting an already-submitted day is allowed
  const v2 = E.validateDailyUpdate({ ...p, date: "2026-10-04" }, { today: "2026-10-05", accounts, existingStatus: "submitted", mode: "correct" });
  assert.ok(!v2.errors.some((e) => /already submitted/.test(e.msg)));
});

test("daily validation: duplicate of an imported ledger txn and opening ≠ previous closing", () => {
  const accounts = [{ id: "a1", name: "HDFC" }];
  const p = E.emptyDailyPayload("2026-10-04", accounts);
  p.sales.order_value = 0;
  p.collections[4].amount = 64000;
  p.bank.accounts[0] = { account_id: "a1", opening: 500000, closing: 564000 };
  p.sections = { sales: true, collections: true, payments: true, bank: true, commitments: true };
  const v = E.validateDailyUpdate(p, { today: "2026-10-05", accounts, prevClosing: { a1: 490000 },
    ledgerSameDay: [{ direction: "in", amount: 64000, source: "import" }], settings: { large_amount_floor: 1e9 } });
  assert.ok(v.warnings.some((w) => w.code === "dup_ledger"));
  assert.ok(v.warnings.some((w) => w.code === "opening_mismatch"));
  assert.equal(v.reconOk, true);
  assert.equal(v.status, "submitted");
});

test("daily update status: green / yellow / red with late submission allowed", () => {
  assert.equal(E.updateStatus([{ update_date: "2026-10-04", status: "submitted" }], "2026-10-05").status, "green");
  assert.equal(E.updateStatus([{ update_date: "2026-10-04", status: "partial" }], "2026-10-05").status, "yellow");
  const red = E.updateStatus([{ update_date: "2026-10-02", status: "submitted" }], "2026-10-05");
  assert.equal(red.status, "red");
  assert.equal(red.message, "Yesterday's financial data has not been updated.");
  assert.equal(red.lastCompleted, "2026-10-02");
  assert.deepEqual(red.missing, ["2026-10-03", "2026-10-04"]);
});

test("bank matching: one-to-one, amount exact, date window, prefers closer dates", () => {
  const bank = [
    { id: "b1", bank_account_id: "A", direction: "in", amount: 64000, txn_date: "2026-10-03", description: "DELHIVERY COD REMIT" },
    { id: "b2", bank_account_id: "A", direction: "in", amount: 64000, txn_date: "2026-10-10", description: "DELHIVERY" },
    { id: "b3", bank_account_id: "A", direction: "out", amount: 999, txn_date: "2026-10-03", description: "charges" },
  ];
  const ledger = [
    { id: "t1", bank_account_id: "A", direction: "in", amount: 64000, txn_date: "2026-10-04", description: "Delhivery COD remittance" },
    { id: "t2", bank_account_id: "A", direction: "in", amount: 64000, txn_date: "2026-10-02" },
    { id: "t3", bank_account_id: "B", direction: "out", amount: 999, txn_date: "2026-10-03" },
  ];
  const m = E.matchBankLines(bank, ledger);
  assert.equal(m.length, 1); // b2 is 6+ days away from both, b3 is on another account
  assert.equal(m[0].bank_id, "b1");
  assert.equal(m[0].txn_id, "t1"); // description overlap wins the tie
});

test("cash position: bank figure rolls forward from the last reported balance and exposes differences", () => {
  const accounts = [{ id: "A", name: "HDFC", opening_balance: 100000, opening_date: "2026-09-01", restricted_amount: 20000 }];
  const txns = [
    { bank_account_id: "A", nature: "cash", direction: "in", amount: 50000, txn_date: "2026-09-10", status: "posted" },
    { bank_account_id: "A", nature: "cash", direction: "out", amount: 10000, txn_date: "2026-09-20", status: "posted" },
    { bank_account_id: "A", nature: "cash", direction: "out", amount: 5000, txn_date: "2026-09-20", status: "void" },
  ];
  const pos = E.cashPosition(accounts, txns, [{ bank_account_id: "A", bal_date: "2026-09-15", closing_reported: 149000, source: "daily_update" }]);
  assert.equal(pos.system, 140000);
  assert.equal(pos.accounts[0].systemAtReport, 150000);
  assert.equal(pos.accounts[0].difference, -1000);
  assert.equal(pos.total, 139000);
  assert.equal(pos.available, 119000);
});

test("inventory at cost, coverage days, slow and dead stock", () => {
  const skus = [
    { id: "a", sku: "TEE-BLK-M", cost_per_unit: 300, selling_price: 1299, units_on_hand: 100, last_sale_date: "2026-10-04" },
    { id: "b", sku: "HOOD-GRN-XL", cost_per_unit: 800, selling_price: 2999, units_on_hand: 200, last_sale_date: "2026-09-30" },
    { id: "c", sku: "CARGO-OLD", cost_per_unit: 500, selling_price: 1999, units_on_hand: 40, last_sale_date: "2026-04-01" },
    { id: "d", sku: "CAP", cost_per_unit: 100, selling_price: 499, units_on_hand: 0, last_sale_date: "2026-10-01" },
  ];
  const inv = E.inventoryAnalytics(skus, { a: { d30: 60, d90: 150 }, b: { d30: 3, d90: 10 }, c: { d30: 0, d90: 0 }, d: { d30: 9, d90: 9 } }, ASOF, {}, 300000);
  assert.equal(inv.totals.value, 30000 + 160000 + 20000);
  assert.equal(inv.rows.find((r) => r.id === "a").status, "healthy");
  assert.equal(inv.rows.find((r) => r.id === "b").status, "slow"); // 200 / 0.1 per day = 2000 days
  assert.equal(inv.rows.find((r) => r.id === "c").status, "dead");
  assert.equal(inv.rows.find((r) => r.id === "d").status, "out");
  assert.equal(inv.totals.coverage_days, 21); // 210000 / (300000/30)
  assert.equal(inv.topCashConsumers[0].id, "b");
});

test("working capital levers and cash conversion cycle", () => {
  const wc = E.workingCapital({ inventory: 2000000, receivables: 500000, supplierAdvances: 400000, payables: 600000, netSales30: 1500000, cogs30: 600000 },
    { inventoryReductionPct: 15, collectFasterDays: 7, supplierCreditDays: 15 });
  assert.equal(wc.locked, 2900000);
  assert.equal(wc.netWorkingCapital, 2300000);
  assert.deepEqual(wc.levers.map((l) => l.release), [300000, 350000, 300000]);
  const ccc = E.cashConversionCycle({ inventory: 2000000, receivables: 500000, payables: 600000, netSales30: 1500000, cogs30: 600000 });
  assert.deepEqual(ccc, { dio: 100, dso: 10, dpo: 30, ccc: 80 });
  assert.equal(E.cashConversionCycle({ inventory: 1, receivables: 1, payables: 1, netSales30: 0, cogs30: 0 }).ccc, null);
});

test("profit vs cash bridge matches the spec example and exposes unexplained differences", () => {
  const b = E.profitToCashBridge({ netProfit: 500000, invOpen: 1400000, invClose: 2000000, recOpen: 300000, recClose: 500000,
    advOpen: 0, advClose: 0, payOpen: 500000, payClose: 600000, gstAccrued: 0, taxPaid: 0, financingNet: 0, actualNetCash: -250000 });
  assert.equal(b.operatingCashFlow, -200000);
  assert.equal(b.lines.find((l) => l.key === "inventory").amount, -600000);
  assert.equal(b.lines.find((l) => l.key === "receivables").amount, -200000);
  assert.equal(b.lines.find((l) => l.key === "payables").amount, 100000);
  assert.equal(b.unexplained, -50000);
});

test("P&L: GST stripped from revenue, bills recognised once, inventory spend not expensed", () => {
  const categories = { sales_d2c: { pnl_class: "revenue" }, mkt_meta: { pnl_class: "marketing" }, prod_fabric: { pnl_class: "inventory" }, ops_rent: { pnl_class: "opex" }, tax_gst: { pnl_class: "tax" } };
  const p = E.computePnl({
    month: "2026-09", categories, settings: { gst_rate_pct: 5, default_cogs_pct: 40 },
    accruals: [{ txn_date: "2026-09-10", direction: "in", amount: 1050000, category_code: "sales_d2c" },
      { txn_date: "2026-09-05", direction: "out", amount: 85000, category_code: "ops_rent" }],
    cashOut: [
      { id: "c1", txn_date: "2026-09-12", direction: "out", amount: 200000, category_code: "mkt_meta" },
      { id: "c2", txn_date: "2026-09-12", direction: "out", amount: 85000, category_code: "ops_rent" }, // settles the bill
      { id: "c3", txn_date: "2026-09-12", direction: "out", amount: 400000, category_code: "prod_fabric" },
      { id: "c4", txn_date: "2026-09-20", direction: "out", amount: 30000, category_code: "tax_gst" }],
    settledTxnIds: new Set(["c2"]),
    dailySales: [{ sale_date: "2026-09-10", order_value: 1050000, cancellations: 0, refunds: 0, rto_value: 0, cogs: 380000 }],
  });
  assert.equal(p.revenue, 1000000);
  assert.equal(p.cogs, 380000);
  assert.equal(p.marketing, 200000);
  assert.equal(p.opex, 85000);
  assert.equal(p.grossProfit, 620000);
  assert.equal(p.netProfit, 335000);
});

test("forecast accuracy and assumption suggestions", () => {
  const snaps = [
    { scenario: "base", week_index: 1, week_start: "2026-09-07", inflow: 1000000, outflow: 800000 },
    { scenario: "base", week_index: 1, week_start: "2026-09-14", inflow: 1000000, outflow: 800000 },
    { scenario: "base", week_index: 1, week_start: "2026-09-21", inflow: 1000000, outflow: 800000 },
  ];
  const actuals = [{ start: "2026-09-07", inflow: 920000, outflow: 800000 }, { start: "2026-09-14", inflow: 800000, outflow: 880000 }, { start: "2026-09-21", inflow: 900000, outflow: 800000 }];
  const acc = E.forecastAccuracy(snaps, actuals);
  assert.equal(acc.rows[0].accuracyIn, 92);
  assert.equal(acc.rows[0].varianceIn, -80000);
  assert.equal(acc.collectionRatio, 0.87);
  const sug = E.suggestAssumptions({ accuracy: acc, assumptions: E.defaultAssumptions(), asOf: ASOF });
  assert.equal(sug[0].key, "probable_weight_pct");
  assert.equal(sug[0].suggested, 80); // 90% × 0.87 → rounded to the nearest 5
});

test("alerts honour configuration (disabled rules and custom thresholds)", () => {
  const ctx = { supplierDue14: 850000, codOverdue: 320000, inventoryGrowthPct: 25, salesGrowthPct: 5, coverageDays: 80,
    marketingActual: 120000, marketingForecast: 100000, collectionsActual: 850000, collectionsForecast: 1000000, updateStatus: { status: "red" }, reconDifference: 0 };
  const all = E.evaluateAlerts(ctx, ["supplier_due_14d", "cod_overdue", "inventory_vs_sales", "inventory_coverage", "marketing_over_forecast", "collections_below_forecast", "daily_update_missing"].map((code) => ({ code, enabled: true })));
  const codes = all.map((a) => a.code);
  assert.ok(codes.includes("supplier_due_14d") && codes.includes("cod_overdue") && codes.includes("inventory_vs_sales") && codes.includes("inventory_coverage"));
  assert.ok(codes.includes("marketing_over_forecast")); // thresholds are inclusive: 20% over fires at 20
  assert.ok(codes.includes("collections_below_forecast"));
  assert.match(all.find((a) => a.code === "supplier_due_14d").message, /₹8,50,000 supplier payments due within the next 14 days/);
  const none = E.evaluateAlerts(ctx, [{ code: "cod_overdue", enabled: false }, { code: "supplier_due_14d", enabled: true, threshold: 1000000 }]);
  assert.equal(none.length, 0);
  assert.equal(all[0].severity, "high");
});

test("row hashing is stable for dedupe (case/whitespace/key order insensitive)", () => {
  assert.equal(E.rowHash({ a: "Delhivery  COD", b: 100 }), E.rowHash({ b: 100.001, a: "delhivery cod" }));
  assert.notEqual(E.rowHash({ a: 1 }), E.rowHash({ a: 2 }));
});

test("formatINR uses Indian grouping and compaction", () => {
  assert.equal(E.formatINR(1234567), "₹12,34,567");
  assert.equal(E.formatINR(-850000, { compact: true }), "−₹8.50L");
  assert.equal(E.formatINR(32000000, { compact: true }), "₹3.20Cr");
});
