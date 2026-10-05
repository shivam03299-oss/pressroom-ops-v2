// POST /api/hashway-cash   — Hashway Cash Command Center API
// GET  /api/hashway-cash?action=cron_daily   — 10:00 IST job (Vercel cron)
//
// Every call: { action, book: 'live' | 'demo', ...fields }
// Auth: Supabase access token of the DEDICATED finance project
// (Authorization: Bearer <jwt>), role from cf_users.
//
// Env (never hard-coded):
//   CASH_DATABASE_URL            Postgres connection string (pooler, port 6543)
//   CASH_SUPABASE_URL            https://<ref>.supabase.co of the finance project
//   CASH_SUPABASE_ANON_KEY       to verify user tokens
//   CASH_SUPABASE_SERVICE_ROLE_KEY  optional — only for inviting users
//   CRON_SECRET                  Vercel cron bearer
//   CASH_SLACK_WEBHOOK_URL       optional — 10 AM reminder + alerts
//   CASH_APP_URL                 optional — link used in reminders
//
// Architecture: the service is created with an injected db (see
// _cash-db.js) so the exact same code runs against PGlite in tests.

import * as E from "./_cash-engine.js";
import { IMPORT_TYPES, normaliseRow, importRowKey, aggregateShopify } from "./_cash-imports.js";
import { prodDb, insert, insertMany, updateById, setActor } from "./_cash-db.js";
import { generateDemo } from "./_cash-demo.js";

const { r2, num, isBlank, addDays, diffDays, mondayOf, monthKey } = E;

export class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const bad = (msg, extra) => new HttpError(400, msg, extra);

const ALL = ["admin", "finance", "operations", "viewer"];
const OPS = ["admin", "finance", "operations"];
const FIN = ["admin", "finance"];
const ADMIN = ["admin"];
const PNL_EXPENSE = new Set(["marketing", "shipping", "salaries", "opex", "finance_cost", "cogs"]);

// ═════════════════════════════════════════════════════════════════════════
export function createCashService(db, opts = {}) {
  const now = opts.now || (() => new Date());
  const today = () => E.istToday(now());

  /** Run fn inside a transaction with the audit actor/reason set. */
  const wtx = (ctx, reason, fn) => db.tx(async (t) => { await setActor(t, ctx.user.email, reason); return fn(t); });

  // ─── shared lookups ────────────────────────────────────────────────────
  async function settingsOf(q, book) { return (await q.query("select * from cf_settings where book = $1", [book]))[0]; }
  async function categoriesMap(q) { return Object.fromEntries((await q.query("select * from cf_categories")).map((c) => [c.code, c])); }
  async function channelsMap(q) { return Object.fromEntries((await q.query("select * from cf_channels")).map((c) => [c.code, c])); }

  async function partyId(t, book, name, kind = "supplier") {
    if (isBlank(name)) return null;
    const n = String(name).trim();
    const hit = await t.query("select id from cf_parties where book = $1 and lower(name) = lower($2) and kind = $3", [book, n, kind]);
    if (hit.length) return hit[0].id;
    return (await insert(t, "cf_parties", { book, name: n, kind }))[0].id;
  }
  async function assertAccount(t, book, id) {
    if (!id) throw bad("Choose a bank / cash account.");
    const a = await t.query("select id from cf_bank_accounts where id = $1 and book = $2", [id, book]);
    if (!a.length) throw bad("Unknown bank account.");
  }
  async function assertCategory(t, code, direction) {
    const c = (await t.query("select * from cf_categories where code = $1 and active", [code]))[0];
    if (!c) throw bad(`Unknown category "${code}".`);
    if (direction && c.direction !== "both" && c.direction !== direction) throw bad(`"${c.name}" is an ${c.direction === "in" ? "inflow" : "outflow"} category.`);
    return c;
  }

  // ─── STATE: load everything for a book, then view it "as of" a date ─────
  async function loadState(q, book) {
    const [settings, categories, channels, accounts, parties, recurring, assumptionRows, rules,
      receivables, payables, pos, installments, txns, allocations, dailySales, updates, balances,
      skus, movements, wcSnaps, fSnaps, storedAlerts] = await Promise.all([
      settingsOf(q, book),
      q.query("select * from cf_categories order by sort, name"),
      q.query("select * from cf_channels order by kind, name"),
      q.query("select * from cf_bank_accounts where book = $1 order by is_primary desc, name", [book]),
      q.query("select * from cf_parties where book = $1 order by name", [book]),
      q.query("select r.*, p.name as party_name from cf_recurring_expenses r left join cf_parties p on p.id = r.party_id where r.book = $1 order by r.name", [book]),
      q.query("select * from cf_forecast_assumptions where book = $1", [book]),
      q.query("select * from cf_alert_rules where book = $1 order by code", [book]),
      q.query("select r.*, p.name as party_name from cf_receivables r left join cf_parties p on p.id = r.party_id where r.book = $1 and r.status <> 'cancelled'", [book]),
      q.query("select x.*, p.name as party_name, p.kind as party_kind from cf_payables x left join cf_parties p on p.id = x.party_id where x.book = $1 and x.status <> 'cancelled'", [book]),
      q.query("select o.*, p.name as party_name from cf_purchase_orders o left join cf_parties p on p.id = o.party_id where o.book = $1", [book]),
      q.query(`select i.*, o.po_number, o.category_code, o.status as po_status, o.order_date, p.name as party_name
               from cf_po_installments i join cf_purchase_orders o on o.id = i.po_id left join cf_parties p on p.id = o.party_id
               where i.book = $1`, [book]),
      q.query(`select t.*, p.name as party_name from cf_transactions t left join cf_parties p on p.id = t.party_id
               where t.book = $1 and t.status = 'posted'`, [book]),
      q.query("select id, kind, txn_id, receivable_id, payable_id, po_installment_id, amount, alloc_date from cf_allocations where book = $1", [book]),
      q.query("select * from cf_daily_sales where book = $1 and status = 'posted' order by sale_date", [book]),
      q.query("select id, update_date, status, submitted_at, submitted_by, is_late, recon_difference from cf_daily_updates where book = $1 order by update_date", [book]),
      q.query("select * from cf_bank_balances where book = $1", [book]),
      q.query("select * from cf_skus where book = $1", [book]),
      q.query("select sku_id, mv_date, kind, qty from cf_inventory_movements where book = $1", [book]),
      q.query("select * from cf_wc_snapshots where book = $1 order by snap_date", [book]),
      q.query("select * from cf_forecast_snapshots where book = $1 order by as_of", [book]),
      q.query("select * from cf_alerts where book = $1 order by fired_on desc, created_at desc limit 200", [book]),
    ]);
    return { book, settings, categories, cats: Object.fromEntries(categories.map((c) => [c.code, c])), channels, accounts, parties,
      recurring, assumptions: E.mergeAssumptions(assumptionRows), assumptionRows, rules, receivables, payables, pos, installments,
      txns, allocations, dailySales, updates, balances, skus, movements, wcSnaps, fSnaps, storedAlerts };
  }

  /** Reconstruct balances as they stood at the START of `cut` (exclusive). */
  function viewAsOf(S, cut) {
    const allocs = S.allocations.filter((a) => a.alloc_date < cut);
    const byRec = new Map(), byPay = new Map(), byPoi = new Map();
    for (const a of allocs) {
      if (a.receivable_id) { const x = byRec.get(a.receivable_id) || { c: 0, w: 0, d: null }; if (a.kind === "writeoff") x.w += num(a.amount); else { x.c += num(a.amount); x.d = E.maxDate(x.d, a.alloc_date); } byRec.set(a.receivable_id, x); }
      if (a.payable_id) byPay.set(a.payable_id, (byPay.get(a.payable_id) || 0) + num(a.amount));
      if (a.po_installment_id) byPoi.set(a.po_installment_id, (byPoi.get(a.po_installment_id) || 0) + num(a.amount));
    }
    const recStatus = (r, c, w) => r.status === "disputed" ? "disputed" : c + w >= num(r.net_amount) - 0.5 ? (c > 0 ? "collected" : "written_off") : c + w > 0 ? "partial" : "open";
    const payStatus = (amt, paid) => paid >= amt - 0.5 ? "paid" : paid > 0 ? "partial" : "open";
    const receivables = S.receivables.filter((r) => r.origin_date < cut).map((r) => {
      const x = byRec.get(r.id) || { c: 0, w: 0, d: null };
      return { ...r, collected_amount: r2(x.c), written_off_amount: r2(x.w), actual_date: x.d, status: recStatus(r, x.c, x.w) };
    });
    const payables = S.payables.filter((p) => p.bill_date < cut).map((p) => {
      const paid = r2(byPay.get(p.id) || 0); return { ...p, paid_amount: paid, status: payStatus(num(p.amount), paid) };
    });
    const installments = S.installments.filter((i) => i.order_date < cut && i.status !== "cancelled" && i.po_status !== "cancelled").map((i) => {
      const paid = r2(byPoi.get(i.id) || 0);
      return { ...i, paid_amount: paid, status: payStatus(num(i.amount), paid), critical: false };
    });
    const onHand = new Map();
    for (const m of S.movements) if (m.mv_date < cut) onHand.set(m.sku_id, (onHand.get(m.sku_id) || 0) + num(m.qty));
    const lastSale = new Map();
    for (const m of S.movements) if (m.kind === "sale" && m.mv_date < cut) lastSale.set(m.sku_id, E.maxDate(lastSale.get(m.sku_id), m.mv_date));
    return {
      cut,
      cashTxns: S.txns.filter((t) => t.nature === "cash" && t.txn_date < cut),
      accruals: S.txns.filter((t) => t.nature === "accrual" && t.txn_date < cut),
      expected: S.txns.filter((t) => t.nature === "expected" && String(t.created_at).slice(0, 10) < cut),
      receivables, payables, installments,
      pos: S.pos.filter((p) => p.order_date < cut),
      dailySales: S.dailySales.filter((s) => s.sale_date < cut),
      balances: S.balances.filter((b) => b.bal_date < cut),
      skus: S.skus.map((k) => ({ ...k, units_on_hand: r2(onHand.get(k.id) || 0), last_sale_date: lastSale.get(k.id) || null })),
      movements: S.movements.filter((m) => m.mv_date < cut),
      allocations: allocs,
    };
  }

  /** Has a recurring commitment already been booked for this period? */
  function recurringCovered(S, V, asOf, horizonEnd) {
    const set = new Set();
    const cands = [
      ...V.cashTxns.map((t) => ({ rid: t.recurring_id, cat: t.category_code, amt: num(t.amount), date: t.txn_date })),
      ...S.txns.filter((t) => t.nature === "expected").map((t) => ({ rid: t.recurring_id, cat: t.category_code, amt: num(t.amount), date: t.txn_date })),
      ...V.payables.map((p) => ({ rid: p.recurring_id, cat: p.category_code, amt: num(p.amount), date: p.expected_pay_date || p.due_date })),
    ];
    for (const rec of S.recurring) {
      const periods = new Set(E.recurringDates(rec, E.addMonths(asOf, -1), horizonEnd).map((d) => E.recurringPeriodKey(rec, d)));
      for (const c of cands) {
        const pk = E.recurringPeriodKey(rec, c.date);
        if (!periods.has(pk)) continue;
        if (c.rid === rec.id || (c.cat === rec.category_code && c.amt >= num(rec.amount) * 0.85 && c.amt <= num(rec.amount) * 1.15)) set.add(`${rec.id}|${pk}`);
      }
    }
    return set;
  }

  function forecastInput(S, V, asOf) {
    const horizonEnd = addDays(mondayOf(asOf), 13 * 7 - 1);
    const pos = E.cashPosition(S.accounts, V.cashTxns, V.balances);
    const bookedNetSalesByMonth = {};
    for (const s of V.dailySales) { const m = monthKey(s.sale_date); bookedNetSalesByMonth[m] = (bookedNetSalesByMonth[m] || 0) + num(s.net_sales); }
    const gstCoveredMonths = new Set([
      ...V.cashTxns.filter((t) => t.category_code === "tax_gst").map((t) => monthKey(t.txn_date)),
      ...S.txns.filter((t) => t.nature === "expected" && t.category_code === "tax_gst").map((t) => monthKey(t.txn_date)),
      ...V.payables.filter((p) => p.category_code === "tax_gst").map((p) => monthKey(p.expected_pay_date || p.due_date)),
    ]);
    return {
      asOf, weeks: 13, openingCash: pos.total, position: pos,
      receivables: V.receivables, payables: V.payables, installments: V.installments,
      recurring: S.recurring, recurringCovered: recurringCovered(S, V, asOf, horizonEnd),
      expected: V.expected.filter((t) => t.status === "posted"),
      dailySales: V.dailySales, bookedNetSalesByMonth, gstCoveredMonths,
      categories: S.cats, settings: S.settings, assumptions: S.assumptions,
    };
  }

  // ─── the dashboard payload (also feeds alerts, cron and reports) ───────
  function computeDashboard(S, asOf) {
    const V = viewAsOf(S, addDays(asOf, 1));
    const input = forecastInput(S, V, asOf);
    const scen = E.buildAllScenarios(input);
    const base = scen.base;
    const pos = input.position;
    const settings = S.settings;
    const exp7 = E.expectedWithin(base, 7), exp30 = E.expectedWithin(base, 30);
    const recAge = E.receivableAgeing(V.receivables, asOf);
    const payItems = [...V.payables, ...V.installments.map((i) => ({ ...i, category_code: i.category_code || "prod_manufacturing" }))];
    const payAge = E.payableAgeing(payItems, asOf);
    const isSupplier = (p) => p.po_number || p.party_kind === "supplier" || ["Production"].includes(S.cats[p.category_code]?.grp);
    const due14 = addDays(asOf, 14);
    const supplierDueList = payItems.filter((p) => E.OPEN_PAY.has(p.status) && isSupplier(p) && (p.expected_pay_date || p.due_date) <= due14)
      .map((p) => ({ id: p.id, type: p.po_number ? "po" : "bill", label: p.po_number ? `${p.po_number} · ${p.label}` : (p.description || p.reference || "Bill"),
        party: p.party_name, due_date: p.due_date, pay_date: p.expected_pay_date || p.due_date, remaining: E.payRemaining(p), overdue: p.due_date < asOf }))
      .sort((a, b) => (a.pay_date < b.pay_date ? -1 : 1));
    const supplierDue14 = r2(supplierDueList.reduce((s, x) => s + x.remaining, 0));
    const codOverdue = r2(V.receivables.filter((r) => r.kind === "cod" && E.OPEN_REC.has(r.status) && r.expected_date < asOf).reduce((s, r) => s + E.recRemaining(r), 0));

    // sales windows
    const gst = 1 + num(settings.gst_rate_pct) / 100;
    const cogsOf = (s) => (s.cogs !== null && s.cogs !== undefined ? num(s.cogs) : (num(s.net_sales) / gst) * num(settings.default_cogs_pct) / 100);
    const win = (from, to) => V.dailySales.filter((s) => s.sale_date >= from && s.sale_date < to);
    const last30 = win(addDays(asOf, -30), addDays(asOf, 1)), prev30 = win(addDays(asOf, -60), addDays(asOf, -30));
    const netSales30 = r2(last30.reduce((s, x) => s + num(x.net_sales), 0));
    const netSalesPrev30 = r2(prev30.reduce((s, x) => s + num(x.net_sales), 0));
    const cogs30 = r2(last30.reduce((s, x) => s + cogsOf(x), 0));
    const purchases30 = r2(V.cashTxns.filter((t) => t.direction === "out" && t.txn_date > addDays(asOf, -30) && S.cats[t.category_code]?.pnl_class === "inventory").reduce((s, t) => s + num(t.amount), 0));

    // inventory
    const sold = {};
    for (const m of V.movements) if (m.kind === "sale") {
      const age = diffDays(asOf, m.mv_date);
      const x = sold[m.sku_id] || (sold[m.sku_id] = { d30: 0, d90: 0 });
      if (age < 30) x.d30 += -num(m.qty);
      if (age < 90) x.d90 += -num(m.qty);
    }
    const inv = E.inventoryAnalytics(V.skus, sold, asOf, settings, cogs30);
    const costOf = Object.fromEntries(S.skus.map((k) => [k.id, num(k.cost_per_unit)]));
    const inv30ago = r2(S.skus.reduce((s, k) => s + Math.max(0, V.movements.filter((m) => m.sku_id === k.id && m.mv_date < addDays(asOf, -29)).reduce((a, m) => a + num(m.qty), 0)) * costOf[k.id], 0));
    const invGrowthPct = inv30ago > 0 ? r2((inv.totals.value / inv30ago - 1) * 100) : null;
    const salesGrowthPct = netSalesPrev30 > 0 ? r2((netSales30 / netSalesPrev30 - 1) * 100) : null;

    // working capital
    const supplierAdvances = r2(V.pos.reduce((s, po) => s + E.poAdvance(po, V.installments), 0));
    const receivedPo = new Set(V.pos.filter((p) => ["received", "partially_received", "closed"].includes(p.status)).map((p) => p.id));
    const supplierPayables = r2(V.payables.filter((p) => isSupplier(p) && E.OPEN_PAY.has(p.status)).reduce((s, p) => s + E.payRemaining(p), 0)
      + V.installments.filter((i) => receivedPo.has(i.po_id) && E.OPEN_PAY.has(i.status)).reduce((s, i) => s + E.payRemaining(i), 0));
    const wc = E.workingCapital({ inventory: inv.totals.value, receivables: recAge.total, supplierAdvances, payables: payAge.total, netSales30, cogs30, purchases30 });
    const ccc = E.cashConversionCycle({ inventory: inv.totals.value, receivables: recAge.total, payables: supplierPayables, netSales30, cogs30 });
    const cccTrend = monthlyLast(S.wcSnaps).map((w) => ({ month: w.snap_date.slice(0, 7), dio: w.dio, dso: w.dso, dpo: w.dpo, ccc: w.ccc, inventory: w.inventory_value }));
    if (!cccTrend.length || cccTrend[cccTrend.length - 1].month !== asOf.slice(0, 7)) cccTrend.push({ month: asOf.slice(0, 7), ...ccc, inventory: inv.totals.value });
    else Object.assign(cccTrend[cccTrend.length - 1], ccc, { inventory: inv.totals.value });

    // actuals vs the forecast frozen at the time
    const histFrom = addDays(mondayOf(asOf), -7 * 8);
    const actual = E.actualWeeks(V.cashTxns, histFrom, asOf, S.cats).map((w) => {
      const endCut = addDays(w.end, 1) < V.cut ? addDays(w.end, 1) : V.cut;
      const p = E.cashPosition(S.accounts, V.cashTxns.filter((t) => t.txn_date < endCut), V.balances.filter((b) => b.bal_date < endCut));
      return { ...w, closing: p.total };
    });
    const accuracy = E.forecastAccuracy(S.fSnaps, actual, { scenario: "base", horizon: 1 });
    const accuracy4 = E.forecastAccuracy(S.fSnaps, actual, { scenario: "base", horizon: 4 });
    const lastMon = addDays(mondayOf(asOf), -7);
    const lastWeek = actual.find((w) => w.start === lastMon);
    const snapLast = S.fSnaps.find((s) => s.as_of === lastMon && s.scenario === "base" && Number(s.week_index) === 1);
    const mktCats = new Set(S.categories.filter((c) => c.pnl_class === "marketing").map((c) => c.code));
    const sumCats = (obj, set) => Object.entries(obj || {}).reduce((s, [k, v]) => s + (set.has(k) ? num(v) : 0), 0);
    const collCats = new Set(S.categories.filter((c) => c.pnl_class === "collection").map((c) => c.code));
    const marketingActual = lastWeek ? sumCats(lastWeek.byCatOut, mktCats) : 0;
    const marketingForecast = snapLast ? sumCats(snapLast.detail?.out, mktCats) : 0;
    const collectionsActual = lastWeek ? r2(V.cashTxns.filter((t) => t.direction === "in" && t.txn_date >= lastMon && t.txn_date <= addDays(lastMon, 6) && collCats.has(t.category_code)).reduce((s, t) => s + num(t.amount), 0)) : 0;
    const collectionsForecast = snapLast ? sumCats(snapLast.detail?.in, collCats) : 0;

    const status = E.updateStatus(S.updates, asOf);
    const alerts = E.evaluateAlerts({
      base, worst: scen.worst, supplierDue14, codOverdue, receivablesOverdue: recAge.overdue, payablesOverdue: payAge.overdue,
      inventoryGrowthPct: invGrowthPct, salesGrowthPct, coverageDays: inv.totals.coverage_days,
      marketingActual, marketingForecast, collectionsActual, collectionsForecast, updateStatus: status, reconDifference: pos.unreconciled,
    }, S.rules);

    const minNow = base.weeks[0].minRequired;
    const lowestAll = Object.fromEntries(Object.entries(scen).map(([k, f]) => [k, { ...f.lowest, firstBelowMinWeek: f.firstBelowMinWeek, runOutWeek: f.runOutWeek,
      endingCash: f.endingCash, affordableNow: f.affordableNow, fundingGap: f.fundingGap, surplusAtLowest: r2(f.lowest.closing - f.weeks[f.lowest.week - 1].minRequired) }]));
    const flowList = (dir, days) => base.flows.filter((f) => f.direction === dir && f.date <= addDays(asOf, days - 1) && f.source !== "projection")
      .map((f) => ({ ...f, weighted: dir === "in" ? r2(f.amount * E.confidenceWeight(f.confidence, base.assumptionsUsed)) : f.amount }));
    const lastDailySale = V.dailySales[V.dailySales.length - 1] || null;

    return {
      asOf, book: S.book, generatedAt: now().toISOString(),
      tiles: {
        currentCash: pos.total, systemCash: pos.system, availableCash: pos.available, restrictedCash: pos.restricted, unreconciled: pos.unreconciled,
        expected7: exp7, expected30: exp30,
        lowest13: base.lowest, minRequired: minNow, surplusNow: r2(pos.total - minNow),
        surplusAtLowest: lowestAll.base.surplusAtLowest,
      },
      position: pos, scenarios: Object.fromEntries(Object.entries(scen).map(([k, f]) => [k, { weeks: f.weeks, lowest: f.lowest, firstBelowMinWeek: f.firstBelowMinWeek,
        runOutWeek: f.runOutWeek, endingCash: f.endingCash, affordableNow: f.affordableNow, fundingGap: f.fundingGap, totalInflow: f.totalInflow, totalOutflow: f.totalOutflow, assumptionsUsed: f.assumptionsUsed }])),
      lowestAll, upcomingInflows: flowList("in", 14), upcomingOutflows: flowList("out", 14),
      supplierDue: supplierDueList, supplierDue14, codOverdue,
      receivables: recAge, payables: payAge,
      inventory: { totals: inv.totals, top: inv.topCashConsumers.slice(0, 8), invGrowthPct, inv30ago },
      sales: { netSales30, netSalesPrev30, salesGrowthPct, cogs30, purchases30, lastDailySale },
      workingCapital: { ...wc, supplierPayables }, ccc, cccTrend,
      actual, accuracy, accuracy4,
      suggestions: E.suggestAssumptions({ accuracy, receivables: V.receivables, dailySales: V.dailySales, assumptions: S.assumptions, asOf }),
      alerts, storedAlerts: S.storedAlerts.slice(0, 50), updateStatus: status,
      minCash: E.minCashRequired(base.flows, asOf, settings, S.cats),
      counts: { accounts: S.accounts.length, txns: S.txns.length, updates: S.updates.length, skus: S.skus.length },
    };
  }
  function monthlyLast(snaps) {
    const m = new Map();
    for (const s of snaps) m.set(s.snap_date.slice(0, 7), s);
    return [...m.values()].slice(-12);
  }

  // ─── posting helpers (always inside a tx) ──────────────────────────────
  async function cashTxn(t, ctx, f) {
    await assertAccount(t, ctx.book, f.bank_account_id);
    await assertCategory(t, f.category_code, f.category_code === "transfer" || f.category_code === "bank_adjustment" ? null : f.direction);
    if (!(num(f.amount) > 0)) throw bad("Amount must be greater than zero.");
    if (!f.txn_date) throw bad("Date is required.");
    if (f.txn_date > addDays(today(), 0) && f.nature !== "expected") throw bad("Cash can't move on a future date — record it as an expected transaction.");
    return (await insert(t, "cf_transactions", { book: ctx.book, nature: "cash", confidence: "actual", created_by: ctx.user.email, ...f, amount: r2(f.amount) }))[0];
  }

  async function allocate(t, ctx, { kind, txn_id, target, id, amount, date, reason, daily_update_id }) {
    if (!(amount > 0)) return null;
    const col = target === "receivable" ? "receivable_id" : target === "payable" ? "payable_id" : "po_installment_id";
    return (await insert(t, "cf_allocations", { book: ctx.book, kind, txn_id: txn_id || null, [col]: id, amount: r2(amount), alloc_date: date, reason: reason || null, daily_update_id: daily_update_id || null, created_by: ctx.user.email }))[0];
  }

  async function openReceivables(t, book, kind, upTo) {
    // strictly earlier sales: a settlement can never pay for same-day orders
    return (await t.query(`select * from cf_receivables where book = $1 and kind = $2 and status in ('open','partial') and origin_date < $3
                           order by expected_date, origin_date, created_at`, [book, kind, upTo]))
      .map((r) => ({ ...r, remaining: E.recRemaining(r), date: r.expected_date }));
  }

  /** Apply a collection to the oldest open receivables of its kind; tidy fee residue. */
  async function applyCollection(t, ctx, txn, kind, date, duId) {
    const open = await openReceivables(t, ctx.book, kind, date);
    const { allocations, unapplied } = E.allocateFIFO(open, num(txn.amount));
    for (const a of allocations) await allocate(t, ctx, { kind: "collection", txn_id: txn.id, target: "receivable", id: a.id, amount: a.amount, date, daily_update_id: duId });
    // Settlements arrive net of actual fees; clear tiny residues on items already due.
    const after = await openReceivables(t, ctx.book, kind, date);
    for (const r of after) {
      if (r.expected_date <= date && r.remaining > 0 && r.remaining <= Math.max(50, num(r.net_amount) * 0.025) && num(r.collected_amount) > 0) {
        await allocate(t, ctx, { kind: "writeoff", target: "receivable", id: r.id, amount: r.remaining, date, reason: "Settlement variance (fees / rounding)", daily_update_id: duId });
      }
    }
    return { applied: r2(num(txn.amount) - unapplied), unapplied };
  }

  async function createReceivable(t, ctx, b) {
    if (!(num(b.net_amount) >= 0)) throw bad("Amount is required.");
    return (await insert(t, "cf_receivables", {
      book: ctx.book, kind: b.kind, channel_code: b.channel_code || null, party_id: b.party_id || null, reference: b.reference || null,
      origin_date: b.origin_date, gross_amount: r2(b.gross_amount ?? b.net_amount), fees: r2(b.fees || 0), returns_amount: r2(b.returns_amount || 0),
      net_amount: r2(b.net_amount), expected_date: b.expected_date, confidence: b.confidence || "confirmed", note: b.note || null,
      source: b.source || "manual", daily_update_id: b.daily_update_id || null, import_id: b.import_id || null, dedupe_key: b.dedupe_key || null, created_by: ctx.user.email,
    }))[0];
  }

  async function createPayable(t, ctx, b) {
    const cat = await assertCategory(t, b.category_code, "out");
    if (!(num(b.amount) > 0)) throw bad("Bill amount must be greater than zero.");
    if (!b.due_date) throw bad("Due date is required.");
    const party_id = b.party_id || (await partyId(t, ctx.book, b.party_name, b.party_kind || (cat.grp === "Production" ? "supplier" : "other")));
    const bill = (await insert(t, "cf_payables", {
      book: ctx.book, party_id, category_code: b.category_code, reference: b.reference || null, description: b.description || null,
      bill_date: b.bill_date || today(), amount: r2(b.amount), due_date: b.due_date, expected_pay_date: b.expected_pay_date || b.due_date,
      priority: b.priority || (cat.is_critical ? "critical" : "normal"), recurring_id: b.recurring_id || null, source: b.source || "manual",
      daily_update_id: b.daily_update_id || null, import_id: b.import_id || null, dedupe_key: b.dedupe_key || null, created_by: ctx.user.email,
    }))[0];
    if (PNL_EXPENSE.has(cat.pnl_class)) {
      await insert(t, "cf_transactions", { book: ctx.book, nature: "accrual", direction: "out", amount: r2(b.amount), txn_date: bill.bill_date,
        category_code: b.category_code, party_id, confidence: "confirmed", source: b.source === "import" ? "import" : b.source === "daily_update" ? "daily_update" : "manual",
        description: `Bill: ${b.description || b.reference || cat.name}`, payable_id: bill.id, daily_update_id: b.daily_update_id || null, import_id: b.import_id || null, created_by: ctx.user.email });
    }
    return bill;
  }

  async function createPO(t, ctx, b) {
    if (isBlank(b.po_number)) {
      const n = (await t.query("select count(*)::int as n from cf_purchase_orders where book = $1", [ctx.book]))[0].n + 1;
      b.po_number = `PO-${String(n).padStart(4, "0")}`;
    }
    if (isBlank(b.item_desc)) throw bad("Describe what the PO is for.");
    const dup = await t.query("select 1 from cf_purchase_orders where book = $1 and po_number = $2", [ctx.book, b.po_number]);
    if (dup.length) throw bad(`PO number ${b.po_number} already exists.`);
    await assertCategory(t, b.category_code || "prod_manufacturing", "out");
    let plan;
    try { plan = E.buildInstallments(b.payment_terms || "custom", num(b.total_value), b.order_date, b.expected_delivery_date, b.installments || []); }
    catch (e) { throw bad(e.message); }
    const party_id = b.party_id || (await partyId(t, ctx.book, b.supplier, "supplier"));
    if (!party_id) throw bad("Supplier is required.");
    const po = (await insert(t, "cf_purchase_orders", {
      book: ctx.book, po_number: b.po_number, party_id, item_desc: b.item_desc, category_code: b.category_code || "prod_manufacturing",
      sku_id: b.sku_id || null, qty: b.qty ? num(b.qty) : null, total_value: r2(b.total_value), order_date: b.order_date,
      expected_delivery_date: b.expected_delivery_date || null, payment_terms: b.payment_terms || "custom", status: b.status || "open",
      note: b.note || null, daily_update_id: b.daily_update_id || null, created_by: ctx.user.email,
    }))[0];
    const inst = await insert(t, "cf_po_installments", plan.map((p) => ({ book: ctx.book, po_id: po.id, ...p })));
    return { ...po, installments: inst };
  }

  async function voidTxn(t, ctx, id, reason) {
    if (isBlank(reason)) throw bad("A reason is required.");
    const [tx] = await t.query("select * from cf_transactions where id = $1 and book = $2", [id, ctx.book]);
    if (!tx) throw bad("Transaction not found.");
    if (tx.status === "void") throw bad("Already void.");
    await t.query("update cf_transactions set status = 'void', void_reason = $1, voided_by = $2, voided_at = now() where id = $3", [reason, ctx.user.email, id]);
    await t.query("update cf_bank_transactions set match_status = 'unmatched', matched_txn_id = null, matched_by = null, matched_at = null where matched_txn_id = $1", [id]);
    if (tx.transfer_group) {
      await t.query("update cf_transactions set status = 'void', void_reason = $1, voided_by = $2, voided_at = now() where transfer_group = $3 and id <> $4 and status = 'posted'", [reason, ctx.user.email, tx.transfer_group, id]);
    }
    return tx;
  }

  async function systemBalanceOn(t, book, accountId, date) {
    const [a] = await t.query("select opening_balance, opening_date from cf_bank_accounts where id = $1 and book = $2", [accountId, book]);
    const [s] = await t.query(`select coalesce(sum(case when direction='in' then amount else -amount end),0) as s from cf_transactions
       where book = $1 and bank_account_id = $2 and nature = 'cash' and status = 'posted' and txn_date >= $3 and txn_date <= $4`, [book, accountId, a.opening_date, date]);
    return r2(num(a.opening_balance) + num(s.s));
  }

  // ─── daily 10 AM update ────────────────────────────────────────────────
  async function dailyContext(q, book, date) {
    const [accounts, existing, settings] = await Promise.all([
      q.query("select * from cf_bank_accounts where book = $1 and active order by is_primary desc, name", [book]),
      q.query("select * from cf_daily_updates where book = $1 and update_date = $2", [book, date]),
      settingsOf(q, book),
    ]);
    const prevClosing = {};
    for (const a of accounts) {
      const [b] = await q.query("select closing_reported from cf_bank_balances where book = $1 and bank_account_id = $2 and bal_date < $3 order by bal_date desc, source limit 1", [book, a.id, date]);
      prevClosing[a.id] = b ? num(b.closing_reported) : (date > a.opening_date ? await systemBalanceOn(q, book, a.id, addDays(date, -1)) : num(a.opening_balance));
    }
    const recent = await q.query("select payload from cf_daily_updates where book = $1 and status in ('submitted','partial') and update_date < $2 and update_date >= $3", [book, date, addDays(date, -30)]);
    const totals = {}, n = Math.max(1, recent.length);
    for (const r of recent) {
      for (const l of E.dailyLines(r.payload)) if (l.key) totals[l.key] = (totals[l.key] || 0) + l.amount;
      totals.order_value = (totals.order_value || 0) + num(r.payload?.sales?.order_value);
    }
    const averages = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, r2(v / n)]));
    const ledgerSameDay = await q.query(`select direction, amount, category_code, source from cf_transactions where book = $1 and nature = 'cash' and status = 'posted'
       and txn_date = $2 and (daily_update_id is null or daily_update_id <> coalesce($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid))`, [book, date, existing[0]?.id || null]);
    const openPayables = await q.query(`select x.id, x.reference, x.description, x.amount, x.paid_amount, x.due_date, x.category_code, p.name as party_name
       from cf_payables x left join cf_parties p on p.id = x.party_id where x.book = $1 and x.status in ('open','partial') order by x.due_date`, [book]);
    const openInstallments = await q.query(`select i.id, i.label, i.amount, i.paid_amount, i.due_date, o.po_number, o.category_code, p.name as party_name
       from cf_po_installments i join cf_purchase_orders o on o.id = i.po_id left join cf_parties p on p.id = o.party_id
       where i.book = $1 and i.status in ('open','partial') and o.status <> 'cancelled' order by i.due_date`, [book]);
    return { accounts, existing: existing[0] || null, settings, prevClosing, averages, ledgerSameDay, openPayables, openInstallments };
  }

  async function postDaily(t, ctx, p, v, { recon_note, mode }) {
    const { book } = ctx;
    const date = p.date;
    const settings = await settingsOf(t, book);
    const ch = await channelsMap(t);
    let [du] = await t.query("select * from cf_daily_updates where book = $1 and update_date = $2 for update", [book, date]);
    if (du && (du.status === "submitted" || du.status === "partial")) {
      throw bad(mode === "correct" ? `Reopen ${date} first (Correct → give a reason), then resubmit.` : `An update for ${date} was already submitted. Use "Correct" to change it.`);
    }
    const row = {
      payload: p, validation: { warnings: v.warnings, recon: v.recon }, sections_complete: v.completeness, status: v.status,
      recon_difference: v.totalDifference, recon_note: recon_note || null, submitted_by: ctx.user.email,
      submitted_at: now().toISOString(), is_late: today() > addDays(date, 1), updated_at: now().toISOString(),
    };
    du = du ? await updateById(t, "cf_daily_updates", du.id, book, row) : (await insert(t, "cf_daily_updates", { book, update_date: date, ...row }))[0];
    const duId = du.id;
    const notes = [];
    const s = p.sales || {};

    // SALES ≠ CASH: book revenue (accrual) + the receivables it creates
    if (!isBlank(s.order_value)) {
      const ov = num(s.order_value), canc = num(s.cancellations), refunds = num(s.refunds), rto = num(s.rto_value);
      await insert(t, "cf_daily_sales", { book, sale_date: date, channel: "shopify", orders: Math.round(num(s.orders)), order_value: r2(ov),
        prepaid_sales: r2(num(s.prepaid_sales)), cod_sales: r2(num(s.cod_sales)), discounts: r2(num(s.discounts)), cancellations: r2(canc),
        refunds: r2(refunds), rto_value: r2(rto), units_sold: isBlank(s.units_sold) ? null : num(s.units_sold), source: "daily_update", daily_update_id: duId });
      const net = r2(ov - canc - refunds - rto);
      if (net !== 0) {
        await insert(t, "cf_transactions", { book, nature: "accrual", direction: net > 0 ? "in" : "out", amount: Math.abs(net), txn_date: date,
          category_code: "sales_d2c", confidence: "confirmed", source: "daily_update", daily_update_id: duId,
          description: net > 0 ? `Net D2C sales ${date}` : `Net sales reversal ${date} (returns exceeded sales)`, dedupe_key: `du:${book}:${date}:sales`, created_by: ctx.user.email });
      }
      if (settings.receivables_from_sales) {
        const gw = ch.razorpay, cod = ch.delhivery_cod;
        const prepaid = num(s.prepaid_sales);
        if (prepaid > 0) {
          const fee = r2(prepaid * num(gw.fee_pct) / 100);
          await createReceivable(t, ctx, { kind: "gateway", channel_code: "razorpay", reference: `Prepaid sales ${date}`, origin_date: date, gross_amount: prepaid, fees: fee,
            net_amount: r2(prepaid - fee), expected_date: addDays(date, num(gw.settlement_lag_days)), confidence: "confirmed", source: "daily_update", daily_update_id: duId });
        }
        const codGross = Math.max(0, num(s.cod_sales) - canc);
        if (codGross > 0) {
          const fee = r2(codGross * num(cod.fee_pct) / 100);
          await createReceivable(t, ctx, { kind: "cod", channel_code: "delhivery_cod", reference: `COD sales ${date}`, origin_date: date, gross_amount: codGross, fees: fee,
            net_amount: r2(codGross - fee), expected_date: addDays(date, num(cod.settlement_lag_days)), confidence: "probable", source: "daily_update", daily_update_id: duId });
        }
        // RTO: that COD will never be paid → write off the oldest open COD receivables
        if (rto > 0) {
          const open = (await openReceivables(t, book, "cod", date)).filter((r) => r.daily_update_id !== duId);
          const { allocations, unapplied } = E.allocateFIFO(open, r2(rto * (1 - num(cod.fee_pct) / 100)));
          for (const a of allocations) await allocate(t, ctx, { kind: "writeoff", target: "receivable", id: a.id, amount: a.amount, date, reason: "RTO", daily_update_id: duId });
          if (unapplied > 1) notes.push(`RTO of ${E.formatINR(unapplied)} had no open COD receivable to reduce.`);
        }
      }
    }

    // CASH lines: collections, payments, other movements
    let pendingTransfer = null; // dailyLines emits each transfer as out-leg then in-leg
    for (const l of E.dailyLines(p)) {
      let transfer_group = null;
      if (l.transfer && l.direction === "out") transfer_group = pendingTransfer = cryptoId();
      else if (l.transfer) { transfer_group = pendingTransfer || cryptoId(); pendingTransfer = null; }
      const party_id = l.party_name ? await partyId(t, book, l.party_name, l.kind === "collection" ? "customer" : "supplier") : null;
      const txn = await cashTxn(t, ctx, { direction: l.direction, amount: l.amount, txn_date: date, category_code: l.category, bank_account_id: l.account_id,
        channel_code: l.channel && ch[l.channel] ? l.channel : null, party_id, source: "daily_update", daily_update_id: duId, transfer_group,
        description: [l.label, l.note].filter(Boolean).join(" — ") });
      if (l.kind === "collection" && l.recKind) {
        const r = await applyCollection(t, ctx, txn, l.recKind, date, duId);
        if (r.unapplied > 1) notes.push(`${E.formatINR(r.unapplied)} of "${l.label}" didn't match any open ${l.recKind} receivable (kept as cash received).`);
      }
      if (l.kind === "payment" && l.link?.id) {
        const target = l.link.type === "payable" ? "payable" : "po_installment";
        const [doc] = target === "payable"
          ? await t.query("select * from cf_payables where id = $1 and book = $2", [l.link.id, book])
          : await t.query("select * from cf_po_installments where id = $1 and book = $2", [l.link.id, book]);
        if (!doc) throw bad(`Linked bill for "${l.label}" not found.`);
        const amt = Math.min(l.amount, E.payRemaining(doc));
        await allocate(t, ctx, { kind: "payment", txn_id: txn.id, target, id: doc.id, amount: amt, date, daily_update_id: duId });
        if (l.amount - amt > 1) notes.push(`${E.formatINR(l.amount - amt)} of "${l.label}" was more than the linked bill's balance.`);
      }
    }

    // Bank balances: reported vs system — differences are stored, never hidden
    for (const b of p.bank?.accounts || []) {
      if (isBlank(b.closing)) continue;
      const system = await systemBalanceOn(t, book, b.account_id, date);
      await t.query("delete from cf_bank_balances where book = $1 and bank_account_id = $2 and bal_date = $3 and source = 'daily_update'", [book, b.account_id, date]);
      await insert(t, "cf_bank_balances", { book, bank_account_id: b.account_id, bal_date: date, opening_reported: isBlank(b.opening) ? null : num(b.opening),
        closing_reported: num(b.closing), system_closing: system, difference: r2(num(b.closing) - system), source: "daily_update", daily_update_id: duId,
        note: recon_note || null, created_by: ctx.user.email });
    }

    // New commitments → forecast
    for (const po of p.commitments?.pos || []) {
      await createPO(t, ctx, { ...po, order_date: po.order_date || date, daily_update_id: duId });
    }
    for (const e of p.commitments?.expenses || []) {
      await createPayable(t, ctx, { party_name: e.party_name, category_code: e.category_code, amount: e.amount, due_date: e.due_date, bill_date: date,
        description: e.description, priority: e.priority, source: "daily_update", daily_update_id: duId });
    }
    return { daily_update_id: duId, status: v.status, notes };
  }

  async function reopenDaily(t, ctx, date, reason) {
    const [du] = await t.query("select * from cf_daily_updates where book = $1 and update_date = $2 for update", [ctx.book, date]);
    if (!du) throw bad("No update for that date.");
    if (!["submitted", "partial"].includes(du.status)) throw bad("This day is not submitted.");
    const blocking = await t.query(`
      select 'receivable' as k from cf_receivables r join cf_allocations a on a.receivable_id = r.id
        where r.daily_update_id = $1 and a.daily_update_id is distinct from $1 and a.kind <> 'writeoff'
      union all select 'payable' from cf_payables x join cf_allocations a on a.payable_id = x.id where x.daily_update_id = $1 and a.daily_update_id is distinct from $1
      union all select 'po' from cf_purchase_orders o join cf_po_installments i on i.po_id = o.id join cf_allocations a on a.po_installment_id = i.id
        where o.daily_update_id = $1 and a.daily_update_id is distinct from $1 limit 1`, [du.id]);
    if (blocking.length) throw bad(`Later days have already settled ${blocking[0].k}s created on ${date}. Correct individual transactions from the Ledger instead.`);
    const txns = await t.query("select id from cf_transactions where daily_update_id = $1 and status = 'posted'", [du.id]);
    for (const x of txns) {
      await t.query("update cf_transactions set status = 'void', void_reason = $1, voided_by = $2, voided_at = now() where id = $3", [`Reopened ${date}: ${reason}`, ctx.user.email, x.id]);
      await t.query("update cf_bank_transactions set match_status = 'unmatched', matched_txn_id = null where matched_txn_id = $1", [x.id]);
    }
    await t.query("delete from cf_allocations where daily_update_id = $1", [du.id]);
    await t.query("update cf_receivables set status = 'cancelled' where daily_update_id = $1", [du.id]);
    await t.query("update cf_payables set status = 'cancelled' where daily_update_id = $1", [du.id]);
    await t.query("update cf_purchase_orders set status = 'cancelled' where daily_update_id = $1", [du.id]);
    await t.query("update cf_daily_sales set status = 'void' where daily_update_id = $1", [du.id]);
    await t.query("delete from cf_bank_balances where daily_update_id = $1", [du.id]);
    await t.query("update cf_daily_updates set status = 'reopened', updated_at = now() where id = $1", [du.id]);
    return { reopened: date, voided: txns.length };
  }

  // ─── imports ───────────────────────────────────────────────────────────
  async function commitImport(t, ctx, b) {
    const def = IMPORT_TYPES[b.import_type];
    if (!def) throw bad("Unknown import type.");
    if (!Array.isArray(b.rows) || !b.rows.length) throw bad("The file has no rows.");
    if (b.rows.length > 20000) throw bad("Split files over 20,000 rows.");
    if (isBlank(b.file_hash)) throw bad("Missing file fingerprint.");
    const settings = await settingsOf(t, ctx.book);
    if (def.needsAggregateOff && settings.receivables_from_sales) {
      throw bad("Turn OFF “Create receivables from daily sales” in Settings before importing this file — otherwise the same COD/gateway money would be expected twice.");
    }
    if (def.needsAccount) await assertAccount(t, ctx.book, b.bank_account_id);
    const prev = await t.query("select created_at, imported_by from cf_imports where book = $1 and import_type = $2 and file_hash = $3", [ctx.book, b.import_type, b.file_hash]);
    if (prev.length) throw new HttpError(409, `This exact file was already imported on ${String(prev[0].created_at).slice(0, 16)} by ${prev[0].imported_by}.`);
    const categories = await t.query("select code, name from cf_categories where active");
    const imp = (await insert(t, "cf_imports", { book: ctx.book, import_type: b.import_type, file_name: b.file_name || null, file_hash: b.file_hash,
      bank_account_id: b.bank_account_id || null, mapping: b.mapping || {}, total_rows: b.rows.length, imported_by: ctx.user.email }))[0];
    const errors = [], good = [];
    b.rows.forEach((raw, i) => {
      const { row, errors: errs } = normaliseRow(b.import_type, raw, b.mapping || {}, { categories, today: today() });
      if (errs.length) errors.push({ import_id: imp.id, row_number: i + 2, kind: "error", error: errs.join("; "), raw });
      else good.push({ row, n: i + 2, raw });
    });
    const dupes = [];
    const markDup = (g, why) => dupes.push({ import_id: imp.id, row_number: g.n, kind: "duplicate", error: why, raw: g.raw });
    let success = 0;
    const handler = IMPORTERS[b.import_type];
    success = await handler(t, ctx, imp, good, markDup, b, settings);
    await insertMany(t, "cf_import_errors", [...errors, ...dupes], { returning: "id" });
    const status = errors.length && !success ? "failed" : errors.length ? "completed_with_errors" : "completed";
    await t.query("update cf_imports set success_rows = $1, failed_rows = $2, duplicate_rows = $3, status = $4 where id = $5", [success, errors.length, dupes.length, status, imp.id]);
    return { import_id: imp.id, total: b.rows.length, success, failed: errors.length, duplicates: dupes.length, status,
      errors: [...errors, ...dupes].slice(0, 200).map((e) => ({ row: e.row_number, kind: e.kind, error: e.error })) };
  }

  async function existingKeys(t, table, book, keys) {
    if (!keys.length) return new Set();
    const rows = await t.query(`select dedupe_key from ${table} where book = $1 and dedupe_key = any($2)`, [book, keys]);
    return new Set(rows.map((r) => r.dedupe_key));
  }
  function withKeys(type, good, markDup, extra) {
    const seen = new Set(), out = [];
    for (const g of good) {
      const k = importRowKey(type, g.row, extra);
      if (seen.has(k)) { markDup(g, "Same row appears earlier in this file"); continue; }
      seen.add(k); out.push({ ...g, key: k });
    }
    return out;
  }

  const IMPORTERS = {
    async bank_statement(t, ctx, imp, good, markDup, b) {
      const rows = withKeys("bank_statement", good, markDup, b.bank_account_id);
      const have = await existingKeys(t, "cf_bank_transactions", ctx.book, rows.map((r) => r.key));
      const fresh = rows.filter((r) => { if (have.has(r.key)) { markDup(r, "Already imported from an earlier statement"); return false; } return true; });
      await insertMany(t, "cf_bank_transactions", fresh.map((r) => ({ book: ctx.book, bank_account_id: b.bank_account_id, txn_date: r.row.date,
        description: r.row.description, reference: r.row.reference, direction: r.row.direction, amount: r2(r.row.value),
        running_balance: r.row.balance, import_id: imp.id, dedupe_key: r.key })), { returning: "id" });
      // statement closing balance per day (last line of the day that has a running balance)
      const lastByDay = new Map();
      for (const r of fresh) if (r.row.balance !== null && r.row.balance !== undefined) lastByDay.set(r.row.date, r.row.balance);
      for (const [d, bal] of lastByDay) {
        await t.query("delete from cf_bank_balances where book = $1 and bank_account_id = $2 and bal_date = $3 and source = 'statement'", [ctx.book, b.bank_account_id, d]);
        const system = await systemBalanceOn(t, ctx.book, b.bank_account_id, d);
        await insert(t, "cf_bank_balances", { book: ctx.book, bank_account_id: b.bank_account_id, bal_date: d, closing_reported: bal, system_closing: system,
          difference: r2(bal - system), source: "statement", note: `From statement import ${b.file_name || ""}`.trim(), created_by: ctx.user.email });
      }
      return fresh.length;
    },
    async shopify_orders(t, ctx, imp, good, markDup, b, settings) {
      const days = aggregateShopify(good.map((g) => g.row));
      const existing = new Set((await t.query("select sale_date from cf_daily_sales where book = $1 and channel = 'shopify' and status = 'posted' and sale_date = any($2)",
        [ctx.book, days.map((d) => d.sale_date)])).map((r) => r.sale_date));
      let n = 0;
      const ch = await channelsMap(t);
      for (const d of days) {
        const rowsOfDay = good.filter((g) => g.row.created_at === d.sale_date);
        if (existing.has(d.sale_date)) { rowsOfDay.forEach((g) => markDup(g, `Sales for ${d.sale_date} already recorded (daily update or earlier import)`)); continue; }
        await insert(t, "cf_daily_sales", { book: ctx.book, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v])),
          channel: "shopify", source: "import", import_id: imp.id });
        const net = r2(d.order_value - d.cancellations - d.refunds);
        if (net > 0) await insert(t, "cf_transactions", { book: ctx.book, nature: "accrual", direction: "in", amount: net, txn_date: d.sale_date, category_code: "sales_d2c",
          confidence: "confirmed", source: "import", import_id: imp.id, description: `Net D2C sales ${d.sale_date} (Shopify import)`, dedupe_key: `du:${ctx.book}:${d.sale_date}:sales`, created_by: ctx.user.email });
        if (settings.receivables_from_sales) {
          if (d.prepaid_sales > 0) { const fee = r2(d.prepaid_sales * num(ch.razorpay.fee_pct) / 100);
            await createReceivable(t, ctx, { kind: "gateway", channel_code: "razorpay", reference: `Prepaid sales ${d.sale_date}`, origin_date: d.sale_date, gross_amount: d.prepaid_sales, fees: fee,
              net_amount: r2(d.prepaid_sales - fee), expected_date: addDays(d.sale_date, num(ch.razorpay.settlement_lag_days)), source: "import", import_id: imp.id }); }
          const codGross = Math.max(0, d.cod_sales - d.cancellations);
          if (codGross > 0) { const fee = r2(codGross * num(ch.delhivery_cod.fee_pct) / 100);
            await createReceivable(t, ctx, { kind: "cod", channel_code: "delhivery_cod", reference: `COD sales ${d.sale_date}`, origin_date: d.sale_date, gross_amount: codGross, fees: fee,
              net_amount: r2(codGross - fee), expected_date: addDays(d.sale_date, num(ch.delhivery_cod.settlement_lag_days)), confidence: "probable", source: "import", import_id: imp.id }); }
        }
        n += rowsOfDay.length;
      }
      return n;
    },
    async cod_remittance(t, ctx, imp, good, markDup) {
      const rows = withKeys("cod_remittance", good, markDup);
      const have = await existingKeys(t, "cf_receivables", ctx.book, rows.map((r) => r.key));
      const ch = await channelsMap(t);
      let n = 0;
      for (const r of rows) {
        if (have.has(r.key)) { markDup(r, `AWB ${r.row.awb} already imported`); continue; }
        const st = String(r.row.status || "").toLowerCase();
        if (/rto|return/.test(st)) { markDup(r, "RTO — no cash expected"); continue; }
        if (r.row.remitted_date) { markDup(r, "Already remitted — record the cash via the daily update/bank"); continue; }
        const code = /delhivery/i.test(r.row.courier || "delhivery") ? "delhivery_cod" : "cod_other";
        const origin = r.row.origin_date || r.row.delivered_date || today();
        const expected = r.row.expected_remit_date || addDays(r.row.delivered_date || origin, num(ch[code].settlement_lag_days));
        const gross = num(r.row.cod_amount), fee = num(r.row.deductions) || r2(gross * num(ch[code].fee_pct) / 100);
        await createReceivable(t, ctx, { kind: "cod", channel_code: code, reference: `AWB ${r.row.awb}${r.row.order ? " · " + r.row.order : ""}`, origin_date: origin,
          gross_amount: gross, fees: fee, net_amount: Math.max(0, r2(gross - fee)), expected_date: expected,
          confidence: /deliver/.test(st) ? "confirmed" : "probable", source: "import", import_id: imp.id, dedupe_key: r.key });
        n++;
      }
      return n;
    },
    async gateway_settlements(t, ctx, imp, good, markDup) {
      const rows = withKeys("gateway_settlements", good, markDup);
      const have = await existingKeys(t, "cf_receivables", ctx.book, rows.map((r) => r.key));
      const ch = await channelsMap(t);
      let n = 0;
      for (const r of rows) {
        if (have.has(r.key)) { markDup(r, "Payment already imported"); continue; }
        if (r.row.settled_on) { markDup(r, "Already settled — the cash comes in via the daily update/bank"); continue; }
        const g = String(r.row.gateway || "razorpay").toLowerCase();
        const code = ch[g] ? g : /payu/.test(g) ? "payu" : /cashfree/.test(g) ? "cashfree" : /razor/.test(g) ? "razorpay" : "gateway_other";
        const fee = r2(num(r.row.fee) + num(r.row.tax));
        await createReceivable(t, ctx, { kind: "gateway", channel_code: code, reference: r.row.reference, origin_date: r.row.date, gross_amount: num(r.row.gross), fees: fee,
          net_amount: Math.max(0, r2(num(r.row.gross) - fee)), expected_date: r.row.expected_date || addDays(r.row.date, num(ch[code].settlement_lag_days)),
          source: "import", import_id: imp.id, dedupe_key: r.key });
        n++;
      }
      return n;
    },
    async marketplace_settlements(t, ctx, imp, good, markDup) {
      const rows = withKeys("marketplace_settlements", good, markDup);
      const have = await existingKeys(t, "cf_receivables", ctx.book, rows.map((r) => r.key));
      const ch = await channelsMap(t);
      let n = 0;
      for (const r of rows) {
        if (have.has(r.key)) { markDup(r, "Already imported"); continue; }
        const pl = String(r.row.platform).toLowerCase();
        const code = ["myntra", "ajio", "amazon", "flipkart"].find((x) => pl.includes(x)) || "marketplace_other";
        const party_id = await partyId(t, ctx.book, r.row.platform, "platform");
        const salesNet = r2(num(r.row.sales) - num(r.row.returns));
        if (salesNet > 0) await insert(t, "cf_transactions", { book: ctx.book, nature: "accrual", direction: "in", amount: salesNet, txn_date: r.row.order_date,
          category_code: "sales_marketplace", party_id, channel_code: code, confidence: "confirmed", source: "import", import_id: imp.id,
          description: `${r.row.platform} sales ${r.row.reference}`, dedupe_key: `acc:${r.key}`, created_by: ctx.user.email });
        // commission & fees are a P&L cost, recognised now
        const fees = r2(num(r.row.commission) + num(r.row.fees));
        if (fees > 0) await insert(t, "cf_transactions", { book: ctx.book, nature: "accrual", direction: "out", amount: fees, txn_date: r.row.order_date,
          category_code: "mkt_other", party_id, channel_code: code, confidence: "confirmed", source: "import", import_id: imp.id,
          description: `${r.row.platform} commission & fees ${r.row.reference}`, dedupe_key: `fee:${r.key}`, created_by: ctx.user.email });
        if (!r.row.settled_on && num(r.row.net) > 0) {
          await createReceivable(t, ctx, { kind: "marketplace", channel_code: code, party_id, reference: `${r.row.platform} ${r.row.reference}`, origin_date: r.row.order_date,
            gross_amount: num(r.row.sales), fees, returns_amount: num(r.row.returns), net_amount: num(r.row.net),
            expected_date: r.row.expected_date || addDays(r.row.order_date, num(ch[code].settlement_lag_days)), source: "import", import_id: imp.id, dedupe_key: r.key });
        }
        n++;
      }
      return n;
    },
    async suppliers(t, ctx, imp, good, markDup) {
      let n = 0;
      for (const g of good) {
        const hit = await t.query("select id from cf_parties where book = $1 and lower(name) = lower($2) and kind = 'supplier'", [ctx.book, g.row.name]);
        if (hit.length) {
          await t.query("update cf_parties set gstin = coalesce($1, gstin), phone = coalesce($2, phone), payment_terms_days = coalesce($3, payment_terms_days), note = coalesce($4, note) where id = $5",
            [g.row.gstin, g.row.phone, g.row.payment_terms_days === null ? null : Math.round(g.row.payment_terms_days), g.row.note, hit[0].id]);
        } else await insert(t, "cf_parties", { book: ctx.book, name: g.row.name, kind: "supplier", gstin: g.row.gstin, phone: g.row.phone,
          payment_terms_days: Math.round(num(g.row.payment_terms_days)), note: g.row.note });
        n++;
      }
      return n;
    },
    async inventory(t, ctx, imp, good, markDup) {
      const seen = new Set(); let n = 0;
      for (const g of good) {
        const key = g.row.sku.toLowerCase();
        if (seen.has(key)) { markDup(g, "SKU repeated in this file"); continue; }
        seen.add(key);
        let [sku] = await t.query("select * from cf_skus where book = $1 and lower(sku) = $2", [ctx.book, key]);
        const patch = { product: g.row.product, category: g.row.category, cost_per_unit: r2(g.row.cost_per_unit),
          selling_price: g.row.selling_price === null ? undefined : r2(g.row.selling_price),
          units_wip: g.row.units_wip === null ? undefined : g.row.units_wip, units_incoming: g.row.units_incoming === null ? undefined : g.row.units_incoming };
        if (sku) sku = await updateById(t, "cf_skus", sku.id, ctx.book, patch);
        else sku = (await insert(t, "cf_skus", { book: ctx.book, sku: g.row.sku, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) }))[0];
        const delta = r2(num(g.row.units_on_hand) - num(sku.units_on_hand));
        if (delta !== 0) await insert(t, "cf_inventory_movements", { book: ctx.book, sku_id: sku.id, mv_date: today(), kind: num(sku.units_on_hand) === 0 && !sku.last_sale_date ? "opening" : "adjust",
          qty: delta, unit_cost: r2(g.row.cost_per_unit), reference: `Stock import ${b_name(imp)}`, source: "import", import_id: imp.id, created_by: ctx.user.email });
        n++;
      }
      return n;
    },
    async expenses(t, ctx, imp, good, markDup, b) {
      const rows = withKeys("expenses", good, markDup);
      const have = await existingKeys(t, "cf_transactions", ctx.book, rows.map((r) => r.key));
      let n = 0;
      for (const r of rows) {
        if (have.has(r.key)) { markDup(r, "Expense already in the ledger"); continue; }
        const party_id = r.row.vendor ? await partyId(t, ctx.book, r.row.vendor, "supplier") : null;
        await cashTxn(t, ctx, { direction: "out", amount: r.row.amount, txn_date: r.row.date, category_code: r.row.category, bank_account_id: b.bank_account_id, party_id,
          source: "import", import_id: imp.id, source_ref: r.row.reference, description: r.row.description || r.row.vendor, dedupe_key: r.key });
        n++;
      }
      return n;
    },
    async payables(t, ctx, imp, good, markDup) {
      const rows = withKeys("payables", good, markDup);
      const have = await existingKeys(t, "cf_payables", ctx.book, rows.map((r) => r.key));
      let n = 0;
      for (const r of rows) {
        if (have.has(r.key)) { markDup(r, "Bill already imported"); continue; }
        const pr = ["critical", "high", "normal", "low"].includes(String(r.row.priority || "").toLowerCase()) ? String(r.row.priority).toLowerCase() : undefined;
        await createPayable(t, ctx, { party_name: r.row.vendor, category_code: r.row.category, amount: r.row.amount, bill_date: r.row.bill_date, due_date: r.row.due_date,
          reference: r.row.reference, priority: pr, source: "import", import_id: imp.id, dedupe_key: r.key });
        n++;
      }
      return n;
    },
    async receivables(t, ctx, imp, good, markDup) {
      const rows = withKeys("receivables", good, markDup);
      const have = await existingKeys(t, "cf_receivables", ctx.book, rows.map((r) => r.key));
      let n = 0;
      for (const r of rows) {
        if (have.has(r.key)) { markDup(r, "Invoice already imported"); continue; }
        const party_id = await partyId(t, ctx.book, r.row.customer, "customer");
        const conf = ["confirmed", "probable", "possible"].includes(String(r.row.confidence || "").toLowerCase()) ? String(r.row.confidence).toLowerCase() : "confirmed";
        await createReceivable(t, ctx, { kind: "b2b", channel_code: "b2b", party_id, reference: r.row.reference, origin_date: r.row.invoice_date, gross_amount: r.row.amount,
          net_amount: r.row.amount, expected_date: r.row.expected_date, confidence: conf, source: "import", import_id: imp.id, dedupe_key: r.key });
        await insert(t, "cf_transactions", { book: ctx.book, nature: "accrual", direction: "in", amount: r2(r.row.amount), txn_date: r.row.invoice_date, category_code: "sales_b2b",
          party_id, confidence: "confirmed", source: "import", import_id: imp.id, description: `B2B invoice ${r.row.reference}`, dedupe_key: `acc:${r.key}`, created_by: ctx.user.email });
        n++;
      }
      return n;
    },
  };
  const b_name = (imp) => imp.file_name || imp.id.slice(0, 8);

  // ─── snapshots, alerts, cron ───────────────────────────────────────────
  async function snapshotWc(t, book, S, asOf) {
    const d = computeDashboard(S, asOf);
    const w = d.workingCapital;
    await t.query("delete from cf_wc_snapshots where book = $1 and snap_date = $2", [book, asOf]);
    await insert(t, "cf_wc_snapshots", { book, snap_date: asOf, cash: d.tiles.currentCash, inventory_value: w.inventory, receivables: w.receivables, payables: w.payables,
      supplier_advances: w.supplierAdvances, net_sales_30d: d.sales.netSales30, cogs_30d: d.sales.cogs30, dio: d.ccc.dio, dso: d.ccc.dso, dpo: d.ccc.dpo, ccc: d.ccc.ccc }, { returning: "" });
    return d;
  }
  /** Freeze this week's forecast (as of Monday) so it can later be compared with actuals. */
  async function snapshotForecast(t, book, S, monday) {
    const V = viewAsOf(S, monday);
    const input = forecastInput(S, V, monday);
    await t.query("delete from cf_forecast_snapshots where book = $1 and as_of = $2", [book, monday]);
    const rows = [];
    for (const sc of E.SCENARIOS) {
      const f = E.buildForecast(input, sc);
      for (const w of f.weeks) rows.push({ book, as_of: monday, scenario: sc, week_index: w.index, week_start: w.start, opening: w.opening, inflow: w.inflow,
        outflow: w.outflow, closing: w.closing, inflow_confirmed: w.inflowConfirmed, inflow_probable: w.inflowProbable, inflow_possible: w.inflowPossible,
        detail: { in: w.byCatIn, out: w.byCatOut } });
    }
    await insertMany(t, "cf_forecast_snapshots", rows, { returning: "" });
    return rows.length;
  }
  async function persistAlerts(t, book, alerts, day) {
    for (const a of alerts) {
      await t.query(`insert into cf_alerts(book, code, severity, message, amount, fired_on) values ($1,$2,$3,$4,$5,$6)
                     on conflict (book, code, fired_on) do update set message = excluded.message, amount = excluded.amount, severity = excluded.severity`,
        [book, a.code, a.severity, a.message, a.amount, day]);
    }
  }
  async function runDaily(book) {
    const asOf = today();
    return db.tx(async (t) => {
      await setActor(t, "cron", "10 AM daily run");
      let S = await loadState(t, book);
      const monday = mondayOf(asOf);
      if (!S.fSnaps.some((s) => s.as_of === monday)) { await snapshotForecast(t, book, S, monday); S = await loadState(t, book); }
      const d = await snapshotWc(t, book, S, asOf);
      await persistAlerts(t, book, d.alerts, asOf);
      return d;
    });
  }

  // ─── reports (tabular, exported client-side to CSV/XLSX/PDF) ───────────
  function report(S, type, b) {
    const asOf = b.as_of || today();
    const d = computeDashboard(S, asOf);
    const V = viewAsOf(S, addDays(asOf, 1));
    const cat = (c) => S.cats[c]?.name || c;
    const acct = (id) => S.accounts.find((a) => a.id === id)?.name || "";
    switch (type) {
      case "daily_cash": {
        const day = b.date || addDays(asOf, -1);
        const rows = V.cashTxns.filter((t) => t.txn_date === day).map((t) => ({ Date: t.txn_date, Account: acct(t.bank_account_id), Direction: t.direction === "in" ? "In" : "Out",
          Category: cat(t.category_code), Party: t.party_name || "", Description: t.description || "", Amount: num(t.amount), Source: t.source }));
        const bal = d.position.accounts.map((a) => ({ Account: a.name, "Bank balance": a.bank, "Per ledger": a.system, Difference: a.difference }));
        return { title: `Daily cash report — ${day}`, columns: Object.keys(rows[0] || { Date: 0, Account: 0, Direction: 0, Category: 0, Party: 0, Description: 0, Amount: 0, Source: 0 }), rows,
          extra: [{ title: "Balances", rows: bal }], summary: { "Cash in": r2(rows.filter((r) => r.Direction === "In").reduce((s, r) => s + r.Amount, 0)),
            "Cash out": r2(rows.filter((r) => r.Direction === "Out").reduce((s, r) => s + r.Amount, 0)), "Current cash": d.tiles.currentCash } };
      }
      case "weekly_cash": {
        const rows = d.actual.map((w) => ({ "Week from": w.start, "Cash in": w.inflow, "Cash out": w.outflow, Net: w.net, "Closing cash": w.closing }));
        return { title: "Weekly cash report (last 8 weeks, actual)", columns: Object.keys(rows[0] || {}), rows, summary: {} };
      }
      case "forecast_13w": {
        const sc = b.scenario || "base";
        const rows = d.scenarios[sc].weeks.map((w) => ({ Week: w.index, "Week from": w.start, Opening: w.opening, "Inflow (confirmed)": w.inflowConfirmed,
          "Inflow (probable)": w.inflowProbable, "Inflow (possible)": w.inflowPossible, "Inflow counted": w.inflow, Outflow: w.outflow, Net: w.net, Closing: w.closing,
          "Minimum required": w.minRequired, "Surplus / (shortfall)": w.surplus }));
        return { title: `13-week cash-flow forecast — ${sc} case (as of ${asOf})`, columns: Object.keys(rows[0]), rows,
          summary: { "Lowest cash": d.scenarios[sc].lowest.closing, "Lowest in week": d.scenarios[sc].lowest.week, "Can still commit today": d.scenarios[sc].affordableNow, "Funding gap": d.scenarios[sc].fundingGap } };
      }
      case "working_capital": {
        const w = d.workingCapital;
        const rows = [{ Item: "Inventory (at cost)", Amount: w.inventory }, { Item: "Receivables", Amount: w.receivables }, { Item: "Supplier advances", Amount: w.supplierAdvances },
          { Item: "Total cash locked", Amount: w.locked }, { Item: "Less: payables", Amount: -w.payables }, { Item: "Net working capital", Amount: w.netWorkingCapital },
          ...w.levers.map((l) => ({ Item: `Cash released: ${l.label}`, Amount: l.release }))];
        return { title: `Working-capital report (as of ${asOf})`, columns: ["Item", "Amount"], rows, summary: { DIO: d.ccc.dio, DSO: d.ccc.dso, DPO: d.ccc.dpo, CCC: d.ccc.ccc } };
      }
      case "supplier_payables": {
        const rows = [...V.payables.filter((p) => E.OPEN_PAY.has(p.status)).map((p) => ({ Supplier: p.party_name || "", Item: p.description || p.reference || cat(p.category_code),
          Category: cat(p.category_code), Amount: num(p.amount), Paid: num(p.paid_amount), Balance: E.payRemaining(p), "Due date": p.due_date, "Pay date": p.expected_pay_date || p.due_date,
          Priority: p.priority, "Days overdue": Math.max(0, diffDays(asOf, p.due_date)) })),
          ...V.installments.filter((i) => E.OPEN_PAY.has(i.status)).map((i) => ({ Supplier: i.party_name || "", Item: `${i.po_number} · ${i.label}`, Category: cat(i.category_code),
            Amount: num(i.amount), Paid: num(i.paid_amount), Balance: E.payRemaining(i), "Due date": i.due_date, "Pay date": i.expected_pay_date || i.due_date, Priority: "po",
            "Days overdue": Math.max(0, diffDays(asOf, i.due_date)) }))].sort((a, b2) => (a["Pay date"] < b2["Pay date"] ? -1 : 1));
        return { title: `Supplier payables (as of ${asOf})`, columns: Object.keys(rows[0] || { Supplier: 0 }), rows, summary: { Total: d.payables.total, Overdue: d.payables.overdue, "Due in 14 days": d.supplierDue14 } };
      }
      case "receivables": {
        const rows = V.receivables.filter((r) => E.OPEN_REC.has(r.status)).map((r) => ({ Type: r.kind, Channel: r.channel_code || "", Customer: r.party_name || "", Reference: r.reference || "",
          "Sale date": r.origin_date, Expected: r.expected_date, Net: num(r.net_amount), Collected: num(r.collected_amount), "Written off": num(r.written_off_amount),
          Outstanding: E.recRemaining(r), Confidence: r.confidence, "Age (days)": diffDays(asOf, r.origin_date), Overdue: r.expected_date < asOf ? "Yes" : "" }));
        return { title: `Receivables (as of ${asOf})`, columns: Object.keys(rows[0] || { Type: 0 }), rows,
          summary: { Total: d.receivables.total, Overdue: d.receivables.overdue, ...Object.fromEntries(d.receivables.buckets.map((x) => [x.label, x.amount])) } };
      }
      case "inventory": {
        const sold = {};
        for (const m of V.movements) if (m.kind === "sale") { const a = diffDays(asOf, m.mv_date); const x = sold[m.sku_id] || (sold[m.sku_id] = { d30: 0, d90: 0 }); if (a < 30) x.d30 -= num(m.qty); if (a < 90) x.d90 -= num(m.qty); }
        const inv = E.inventoryAnalytics(V.skus, sold, asOf, S.settings, d.sales.cogs30);
        const rows = inv.rows.map((r) => ({ SKU: r.sku, Product: r.product, Category: r.category || "", Units: r.units_on_hand, "Cost/unit": num(r.cost_per_unit), "Value at cost": r.value,
          "Sold 30d": r.sold30, "Cover (days)": r.cover_days ?? "∞", Status: r.status, "In production": num(r.units_wip), Incoming: num(r.units_incoming) }));
        return { title: `Inventory at cost (as of ${asOf})`, columns: Object.keys(rows[0] || { SKU: 0 }), rows, summary: { "Inventory value": inv.totals.value, "Coverage days": inv.totals.coverage_days, "Slow-moving": inv.totals.slow_value, Dead: inv.totals.dead_value } };
      }
      case "forecast_vs_actual": {
        const rows = d.accuracy.rows.map((r) => ({ "Week from": r.week_start, "Forecast in": r.forecastIn, "Actual in": r.actualIn, "Variance in": r.varianceIn, "Accuracy in %": r.accuracyIn,
          "Forecast out": r.forecastOut, "Actual out": r.actualOut, "Variance out": r.varianceOut, "Accuracy out %": r.accuracyOut }));
        return { title: "Forecast vs actual (1-week-ahead forecast)", columns: Object.keys(rows[0] || { "Week from": 0 }), rows, summary: { "Avg inflow accuracy %": d.accuracy.avgAccuracyIn, "Avg outflow accuracy %": d.accuracy.avgAccuracyOut } };
      }
      case "monthly_mis": {
        const m = b.month || asOf.slice(0, 7);
        const pnl = misFor(S, m);
        const rows = [["Revenue (ex-GST)", pnl.revenue], ["COGS", -pnl.cogs], ["Gross profit", pnl.grossProfit], ["Gross margin %", pnl.grossMargin], ["Marketing", -pnl.marketing],
          ["Shipping", -pnl.shipping], ["Salaries", -pnl.salaries], ["Operating expenses", -pnl.opex], ["Finance costs", -pnl.finance_cost], ["Other income", pnl.other], ["Net profit", pnl.netProfit]]
          .map(([Line, Amount]) => ({ Line, Amount }));
        return { title: `Monthly MIS — ${m}`, columns: ["Line", "Amount"], rows, summary: { "COGS estimated": pnl.cogsEstimated ? "Yes (default COGS %)" : "No" } };
      }
      case "ccc": {
        const rows = d.cccTrend.map((x) => ({ Month: x.month, "Inventory days (DIO)": x.dio, "Receivable days (DSO)": x.dso, "Payable days (DPO)": x.dpo, "Cash conversion cycle": x.ccc }));
        return { title: "Cash conversion cycle", columns: Object.keys(rows[0] || { Month: 0 }), rows, summary: {} };
      }
      default: throw bad("Unknown report.");
    }
  }

  function misFor(S, month) {
    const V = viewAsOf(S, "9999-12-31");
    const settled = new Set(V.allocations.filter((a) => (a.payable_id || a.po_installment_id) && a.txn_id).map((a) => a.txn_id));
    return E.computePnl({ month, accruals: V.accruals, cashOut: V.cashTxns, settledTxnIds: settled, dailySales: V.dailySales, categories: S.cats,
      adjustments: S.misAdjustments || [], settings: S.settings });
  }

  async function misPayload(q, book, months = 6) {
    const S = await loadState(q, book);
    S.misAdjustments = await q.query("select * from cf_mis_adjustments where book = $1", [book]);
    const asOf = today();
    const list = [];
    for (let i = months - 1; i >= 0; i--) list.push(E.addMonths(E.monthStart(asOf), -i).slice(0, 7));
    const pnl = list.map((m) => misFor(S, m));
    // profit → cash bridge per month
    const snapAt = (d) => S.wcSnaps.filter((w) => w.snap_date <= d).slice(-1)[0] || null;
    const bridges = list.map((m, i) => {
      const start = `${m}-01`, end = addDays(E.addMonths(start, 1), -1);
      const o = snapAt(addDays(start, -1)), c = snapAt(end > asOf ? asOf : end);
      const cash = S.txns.filter((t) => t.nature === "cash" && t.txn_date >= start && t.txn_date <= end && S.cats[t.category_code]?.pnl_class !== "transfer");
      const signed = (t) => (t.direction === "in" ? 1 : -1) * num(t.amount);
      const fin = cash.filter((t) => S.cats[t.category_code]?.pnl_class === "financing").reduce((s, t) => s + signed(t), 0);
      const taxPaid = cash.filter((t) => S.cats[t.category_code]?.pnl_class === "tax").reduce((s, t) => s + num(t.amount), 0);
      const gstAccrued = (pnl[i].revenue) * num(S.settings.gst_rate_pct) / 100;
      return { month: m, ...E.profitToCashBridge({ netProfit: pnl[i].netProfit,
        invOpen: o ? num(o.inventory_value) : null, invClose: c ? num(c.inventory_value) : null,
        recOpen: o ? num(o.receivables) : null, recClose: c ? num(c.receivables) : null,
        advOpen: o ? num(o.supplier_advances) : null, advClose: c ? num(c.supplier_advances) : null,
        payOpen: o ? num(o.payables) : null, payClose: c ? num(c.payables) : null,
        gstAccrued, taxPaid, financingNet: fin, actualNetCash: cash.reduce((s, t) => s + signed(t), 0) }) };
    });
    return { months: list, pnl, bridges, adjustments: S.misAdjustments };
  }

  // ─── ACTIONS ───────────────────────────────────────────────────────────
  const A = {};
  const def = (name, roles, fn) => (A[name] = { roles, fn });

  def("bootstrap", ALL, async (ctx) => {
    const [settings, categories, channels, accounts, parties, recurring, rules, assumptions] = await Promise.all([
      settingsOf(db, ctx.book), db.query("select * from cf_categories order by sort, name"), db.query("select * from cf_channels order by kind, name"),
      db.query("select * from cf_bank_accounts where book = $1 order by is_primary desc, name", [ctx.book]),
      db.query("select * from cf_parties where book = $1 and active order by name", [ctx.book]),
      db.query("select * from cf_recurring_expenses where book = $1 order by name", [ctx.book]),
      db.query("select * from cf_alert_rules where book = $1 order by severity, code", [ctx.book]),
      db.query("select * from cf_forecast_assumptions where book = $1", [ctx.book]),
    ]);
    const updates = await db.query("select update_date, status from cf_daily_updates where book = $1 and update_date >= $2", [ctx.book, addDays(today(), -30)]);
    return { me: ctx.user, book: ctx.book, today: today(), settings, categories, channels, accounts, parties, recurring, rules,
      assumptions: E.mergeAssumptions(assumptions), assumptionMeta: E.ASSUMPTION_META, updateStatus: E.updateStatus(updates, today()) };
  });

  def("dashboard", ALL, async (ctx, b) => computeDashboard(await loadState(db, ctx.book), b.as_of || today()));

  def("forecast", ALL, async (ctx, b) => {
    const S = await loadState(db, ctx.book);
    const asOf = b.as_of || today();
    const V = viewAsOf(S, addDays(asOf, 1));
    const input = forecastInput(S, V, asOf);
    const all = E.buildAllScenarios(input);
    const sc = b.scenario || "base";
    return { asOf, scenarios: Object.fromEntries(Object.entries(all).map(([k, f]) => [k, { ...f, flows: k === sc ? f.flows : undefined }])), selected: sc,
      openingCash: input.openingCash, position: input.position, assumptions: S.assumptions };
  });

  def("ledger_list", ALL, async (ctx, b) => {
    const where = ["t.book = $1"], p = [ctx.book];
    const add = (sql, v) => { p.push(v); where.push(sql.replace("?", `$${p.length}`)); };
    if (b.nature) add("t.nature = ?", b.nature);
    if (b.status) add("t.status = ?", b.status); else where.push("t.status = 'posted'");
    if (b.from) add("t.txn_date >= ?", b.from);
    if (b.to) add("t.txn_date <= ?", b.to);
    if (b.category) add("t.category_code = ?", b.category);
    if (b.account) add("t.bank_account_id = ?", b.account);
    if (b.source) add("t.source = ?", b.source);
    if (b.direction) add("t.direction = ?", b.direction);
    if (b.q) { p.push(`%${b.q}%`); const n = p.length; where.push(`(t.description ilike $${n} or p.name ilike $${n} or t.source_ref ilike $${n})`); }
    const limit = Math.min(1000, num(b.limit) || 300), offset = num(b.offset) || 0;
    const rows = await db.query(`select t.*, p.name as party_name, c.name as category_name, a.name as account_name,
        exists(select 1 from cf_bank_transactions bt where bt.matched_txn_id = t.id) as bank_matched
      from cf_transactions t left join cf_parties p on p.id = t.party_id join cf_categories c on c.code = t.category_code
      left join cf_bank_accounts a on a.id = t.bank_account_id where ${where.join(" and ")}
      order by t.txn_date desc, t.created_at desc limit ${limit} offset ${offset}`, p);
    const [tot] = await db.query(`select count(*)::int as n, coalesce(sum(case when t.direction='in' then t.amount else 0 end),0) as inflow,
        coalesce(sum(case when t.direction='out' then t.amount else 0 end),0) as outflow
      from cf_transactions t left join cf_parties p on p.id = t.party_id where ${where.join(" and ")}`, p);
    return { rows, total: tot.n, inflow: num(tot.inflow), outflow: num(tot.outflow) };
  });

  def("txn_create", FIN, async (ctx, b) => wtx(ctx, b.reason || "Manual entry", async (t) => {
    const nature = b.nature || "cash";
    if (!["cash", "expected", "accrual"].includes(nature)) throw bad("Bad type.");
    await assertCategory(t, b.category_code, ["transfer", "bank_adjustment"].includes(b.category_code) ? null : b.direction);
    const party_id = b.party_id || (b.party_name ? await partyId(t, ctx.book, b.party_name, b.direction === "in" ? "customer" : "supplier") : null);
    if (nature === "cash") {
      const txn = await cashTxn(t, ctx, { direction: b.direction, amount: b.amount, txn_date: b.txn_date, category_code: b.category_code, bank_account_id: b.bank_account_id,
        party_id, channel_code: b.channel_code || null, description: b.description, source_ref: b.source_ref, source: "manual" });
      if (b.link?.type === "receivable") { const [r] = await t.query("select * from cf_receivables where id = $1 and book = $2", [b.link.id, ctx.book]); if (!r) throw bad("Receivable not found.");
        await allocate(t, ctx, { kind: "collection", txn_id: txn.id, target: "receivable", id: r.id, amount: Math.min(num(b.amount), E.recRemaining(r)), date: b.txn_date }); }
      if (b.link?.type === "payable" || b.link?.type === "po_installment") {
        const tbl = b.link.type === "payable" ? "cf_payables" : "cf_po_installments";
        const [x] = await t.query(`select * from ${tbl} where id = $1 and book = $2`, [b.link.id, ctx.book]); if (!x) throw bad("Bill not found.");
        await allocate(t, ctx, { kind: "payment", txn_id: txn.id, target: b.link.type === "payable" ? "payable" : "po_installment", id: x.id, amount: Math.min(num(b.amount), E.payRemaining(x)), date: b.txn_date });
      }
      return txn;
    }
    if (!(num(b.amount) > 0) || !b.txn_date) throw bad("Amount and date are required.");
    if (nature === "expected" && b.txn_date < addDays(today(), -1)) throw bad("Expected cash must be dated today or later.");
    return (await insert(t, "cf_transactions", { book: ctx.book, nature, direction: b.direction, amount: r2(b.amount), txn_date: b.txn_date, category_code: b.category_code,
      party_id, confidence: nature === "expected" ? (b.confidence || "probable") : "confirmed", description: b.description, source: "manual", created_by: ctx.user.email }))[0];
  }));

  def("transfer", FIN, async (ctx, b) => wtx(ctx, b.reason || "Transfer", async (t) => {
    if (b.from_account === b.to_account) throw bad("Choose two different accounts.");
    const g = cryptoId();
    const o = await cashTxn(t, ctx, { direction: "out", amount: b.amount, txn_date: b.txn_date, category_code: "transfer", bank_account_id: b.from_account, transfer_group: g, description: b.description || "Transfer out" });
    const i = await cashTxn(t, ctx, { direction: "in", amount: b.amount, txn_date: b.txn_date, category_code: "transfer", bank_account_id: b.to_account, transfer_group: g, description: b.description || "Transfer in" });
    return { out: o, in: i };
  }));

  def("txn_update", FIN, async (ctx, b) => {
    if (isBlank(b.reason)) throw bad("Give a reason for the correction — financial history is never changed silently.");
    return wtx(ctx, b.reason, async (t) => {
      const [tx] = await t.query("select * from cf_transactions where id = $1 and book = $2", [b.id, ctx.book]);
      if (!tx) throw bad("Transaction not found.");
      if (tx.status === "void") throw bad("A void transaction can't be edited.");
      const patch = {};
      for (const k of ["amount", "txn_date", "category_code", "bank_account_id", "description", "confidence", "party_id", "source_ref"]) if (b.patch?.[k] !== undefined) patch[k] = b.patch[k];
      if (patch.amount !== undefined && !(num(patch.amount) > 0)) throw bad("Amount must be greater than zero.");
      if (patch.category_code) await assertCategory(t, patch.category_code, ["transfer", "bank_adjustment"].includes(patch.category_code) ? null : tx.direction);
      if (tx.nature === "cash" && patch.confidence) delete patch.confidence;
      const allocs = await t.query("select coalesce(sum(amount),0) as s from cf_allocations where txn_id = $1", [tx.id]);
      if (patch.amount !== undefined && num(patch.amount) < num(allocs[0].s) - 0.5) throw bad(`This payment settles ${E.formatINR(allocs[0].s)} of bills/receivables — void it and re-enter instead.`);
      return updateById(t, "cf_transactions", tx.id, ctx.book, patch);
    });
  });

  def("txn_void", FIN, async (ctx, b) => wtx(ctx, b.reason, (t) => voidTxn(t, ctx, b.id, b.reason)));

  def("audit_list", FIN, async (ctx, b) => {
    const p = [ctx.book]; let w = "(book = $1 or book is null)";
    if (b.table) { p.push(b.table); w += ` and table_name = $${p.length}`; }
    if (b.row_id) { p.push(b.row_id); w += ` and row_id = $${p.length}`; }
    if (b.action) { p.push(b.action); w += ` and action = $${p.length}`; }
    if (b.only_changes) w += " and action <> 'insert'";
    return db.query(`select * from cf_audit_log where ${w} order by changed_at desc, id desc limit ${Math.min(500, num(b.limit) || 200)}`, p);
  });

  // daily update
  def("daily_get", ALL, async (ctx, b) => {
    const date = b.date || addDays(today(), -1);
    const c = await dailyContext(db, ctx.book, date);
    const recent = await db.query("select update_date, status, is_late, submitted_by, submitted_at, recon_difference from cf_daily_updates where book = $1 order by update_date desc limit 45", [ctx.book]);
    const updates = await db.query("select update_date, status from cf_daily_updates where book = $1", [ctx.book]);
    return { date, ...c, payload: c.existing?.payload || E.emptyDailyPayload(date, c.accounts), recent, status: E.updateStatus(updates, today()), today: today() };
  });

  def("daily_save_draft", OPS, async (ctx, b) => wtx(ctx, "Draft saved", async (t) => {
    const date = b.payload?.date;
    if (!date) throw bad("Date is required.");
    if (date > today()) throw bad("Can't save an update for a future date.");
    const [du] = await t.query("select * from cf_daily_updates where book = $1 and update_date = $2", [ctx.book, date]);
    if (du && (du.status === "submitted" || du.status === "partial")) throw bad("This day is already submitted.");
    const row = { payload: b.payload, sections_complete: b.payload.sections || {}, updated_at: now().toISOString() };
    if (du) return updateById(t, "cf_daily_updates", du.id, ctx.book, { ...row, status: du.status === "reopened" ? "reopened" : "draft" });
    return (await insert(t, "cf_daily_updates", { book: ctx.book, update_date: date, status: "draft", ...row }))[0];
  }));

  def("daily_validate", OPS, async (ctx, b) => {
    const c = await dailyContext(db, ctx.book, b.payload?.date);
    return E.validateDailyUpdate(b.payload, { today: today(), existingStatus: c.existing?.status, mode: b.mode, accounts: c.accounts, prevClosing: c.prevClosing,
      averages: c.averages, ledgerSameDay: c.ledgerSameDay, settings: c.settings });
  });

  def("daily_submit", OPS, async (ctx, b) => {
    const p = b.payload;
    const c = await dailyContext(db, ctx.book, p?.date);
    const v = E.validateDailyUpdate(p, { today: today(), existingStatus: c.existing?.status, mode: b.mode, accounts: c.accounts, prevClosing: c.prevClosing,
      averages: c.averages, ledgerSameDay: c.ledgerSameDay, settings: c.settings });
    if (v.errors.length) throw new HttpError(422, "Please fix the errors before submitting.", { validation: v });
    if (v.warnings.length && !b.acknowledged) throw new HttpError(409, "Please review the warnings and confirm.", { validation: v });
    if (!v.reconOk && isBlank(b.recon_note)) throw new HttpError(409, "The bank balance does not reconcile — explain the difference before submitting.", { validation: v });
    const reason = b.mode === "correct" ? `Corrected daily update ${p.date}${b.reason ? ": " + b.reason : ""}` : `Daily update ${p.date}`;
    const res = await wtx(ctx, reason, (t) => postDaily(t, ctx, p, v, { recon_note: b.recon_note, mode: b.mode }));
    return { ...res, validation: v };
  });

  def("daily_reopen", FIN, async (ctx, b) => {
    if (isBlank(b.reason)) throw bad("A reason is required to reopen a submitted day.");
    return wtx(ctx, b.reason, (t) => reopenDaily(t, ctx, b.date, b.reason));
  });

  // receivables
  def("receivables_list", ALL, async (ctx, b) => {
    const st = b.status === "all" ? "" : "and r.status in ('open','partial','disputed')";
    const rows = await db.query(`select r.*, p.name as party_name from cf_receivables r left join cf_parties p on p.id = r.party_id
      where r.book = $1 and r.status <> 'cancelled' ${st} ${b.kind ? "and r.kind = $2" : ""} order by r.expected_date limit 2000`, b.kind ? [ctx.book, b.kind] : [ctx.book]);
    return { rows: rows.map((r) => ({ ...r, remaining: E.recRemaining(r) })), ageing: E.receivableAgeing(rows, today()) };
  });
  def("receivable_create", FIN, async (ctx, b) => wtx(ctx, "Receivable created", async (t) => {
    if (!b.origin_date || !b.expected_date || !(num(b.net_amount) > 0)) throw bad("Amount, invoice/sale date and expected date are required.");
    const party_id = b.party_id || (b.party_name ? await partyId(t, ctx.book, b.party_name, b.kind === "marketplace" ? "platform" : "customer") : null);
    const r = await createReceivable(t, ctx, { ...b, party_id });
    if (b.book_revenue && ["b2b", "marketplace", "other"].includes(b.kind)) {
      await insert(t, "cf_transactions", { book: ctx.book, nature: "accrual", direction: "in", amount: r2(num(b.gross_amount || b.net_amount)), txn_date: b.origin_date,
        category_code: b.kind === "b2b" ? "sales_b2b" : b.kind === "marketplace" ? "sales_marketplace" : "income_other", party_id, confidence: "confirmed", source: "manual",
        description: `Revenue: ${b.reference || b.kind}`, created_by: ctx.user.email });
    }
    return r;
  }));
  def("receivable_update", FIN, async (ctx, b) => {
    if (isBlank(b.reason)) throw bad("A reason is required.");
    return wtx(ctx, b.reason, async (t) => {
      const patch = {};
      for (const k of ["expected_date", "confidence", "status", "note", "reference", "net_amount"]) if (b.patch?.[k] !== undefined) patch[k] = b.patch[k];
      if (patch.status && !["open", "disputed", "cancelled"].includes(patch.status)) throw bad("Status can only be set to open, disputed or cancelled.");
      return updateById(t, "cf_receivables", b.id, ctx.book, patch);
    });
  });
  def("receivable_collect", FIN, async (ctx, b) => wtx(ctx, "Receivable collected", async (t) => {
    const [r] = await t.query("select * from cf_receivables where id = $1 and book = $2 for update", [b.id, ctx.book]);
    if (!r) throw bad("Receivable not found.");
    const amt = num(b.amount);
    if (amt > E.recRemaining(r) + 0.5) throw bad(`Only ${E.formatINR(E.recRemaining(r))} is outstanding.`);
    const cat = { gateway: "collect_gateway", cod: "collect_cod", marketplace: "collect_marketplace", b2b: "collect_b2b" }[r.kind] || "income_other";
    const txn = await cashTxn(t, ctx, { direction: "in", amount: amt, txn_date: b.date, category_code: cat, bank_account_id: b.bank_account_id, party_id: r.party_id,
      channel_code: r.channel_code, description: `Collected: ${r.reference || r.kind}`, source_ref: b.reference });
    await allocate(t, ctx, { kind: "collection", txn_id: txn.id, target: "receivable", id: r.id, amount: amt, date: b.date });
    return txn;
  }));
  def("receivable_writeoff", FIN, async (ctx, b) => {
    if (isBlank(b.reason)) throw bad("A reason is required to write off a receivable.");
    return wtx(ctx, b.reason, async (t) => {
      const [r] = await t.query("select * from cf_receivables where id = $1 and book = $2 for update", [b.id, ctx.book]);
      if (!r) throw bad("Receivable not found.");
      const amt = Math.min(num(b.amount) || E.recRemaining(r), E.recRemaining(r));
      return allocate(t, ctx, { kind: "writeoff", target: "receivable", id: r.id, amount: amt, date: b.date || today(), reason: b.reason });
    });
  });

  // payables + POs
  def("payables_list", ALL, async (ctx, b) => {
    const st = b.status === "all" ? "" : "and x.status in ('open','partial')";
    const bills = await db.query(`select x.*, p.name as party_name, c.name as category_name from cf_payables x left join cf_parties p on p.id = x.party_id
      join cf_categories c on c.code = x.category_code where x.book = $1 and x.status <> 'cancelled' ${st} order by coalesce(x.expected_pay_date, x.due_date)`, [ctx.book]);
    const inst = await db.query(`select i.*, o.po_number, o.item_desc, o.category_code, o.status as po_status, p.name as party_name from cf_po_installments i
      join cf_purchase_orders o on o.id = i.po_id left join cf_parties p on p.id = o.party_id
      where i.book = $1 and o.status <> 'cancelled' and i.status <> 'cancelled' ${b.status === "all" ? "" : "and i.status in ('open','partial')"} order by coalesce(i.expected_pay_date, i.due_date)`, [ctx.book]);
    return { bills: bills.map((x) => ({ ...x, remaining: E.payRemaining(x) })), installments: inst.map((x) => ({ ...x, remaining: E.payRemaining(x) })),
      ageing: E.payableAgeing([...bills, ...inst], today()) };
  });
  def("payable_create", OPS, async (ctx, b) => wtx(ctx, "Bill created", (t) => createPayable(t, ctx, b)));
  def("payable_update", FIN, async (ctx, b) => {
    if (isBlank(b.reason)) throw bad("A reason is required.");
    return wtx(ctx, b.reason, async (t) => {
      const patch = {};
      for (const k of ["due_date", "expected_pay_date", "priority", "description", "reference"]) if (b.patch?.[k] !== undefined) patch[k] = b.patch[k];
      if (b.patch?.status === "cancelled") {
        const [x] = await t.query("select paid_amount from cf_payables where id = $1 and book = $2", [b.id, ctx.book]);
        if (num(x?.paid_amount) > 0) throw bad("This bill is partly paid — it can't be cancelled.");
        patch.status = "cancelled";
        const acc = await t.query("select id from cf_transactions where payable_id = $1 and status = 'posted'", [b.id]);
        for (const a of acc) await t.query("update cf_transactions set status = 'void', void_reason = $1, voided_by = $2, voided_at = now() where id = $3", [`Bill cancelled: ${b.reason}`, ctx.user.email, a.id]);
      }
      return updateById(t, "cf_payables", b.id, ctx.book, patch);
    });
  });
  def("payable_pay", FIN, async (ctx, b) => wtx(ctx, "Bill paid", async (t) => {
    const tbl = b.type === "po_installment" ? "cf_po_installments" : "cf_payables";
    const [x] = await t.query(`select * from ${tbl} where id = $1 and book = $2 for update`, [b.id, ctx.book]);
    if (!x) throw bad("Bill not found.");
    const amt = num(b.amount);
    if (!(amt > 0)) throw bad("Amount must be greater than zero.");
    if (amt > E.payRemaining(x) + 0.5) throw bad(`Only ${E.formatINR(E.payRemaining(x))} is outstanding.`);
    let category = x.category_code, party_id = x.party_id, label = x.description || x.reference;
    if (b.type === "po_installment") {
      const [po] = await t.query("select * from cf_purchase_orders where id = $1", [x.po_id]);
      category = po.category_code; party_id = po.party_id; label = `${po.po_number} · ${x.label}`;
      if (po.status === "open") await t.query("update cf_purchase_orders set status = 'in_production' where id = $1", [po.id]);
    }
    const txn = await cashTxn(t, ctx, { direction: "out", amount: amt, txn_date: b.date, category_code: category, bank_account_id: b.bank_account_id, party_id,
      description: `Paid: ${label || ""}`.trim(), source_ref: b.reference });
    await allocate(t, ctx, { kind: "payment", txn_id: txn.id, target: b.type === "po_installment" ? "po_installment" : "payable", id: x.id, amount: amt, date: b.date });
    return txn;
  }));
  def("po_list", ALL, async (ctx) => {
    const pos = await db.query(`select o.*, p.name as party_name, s.sku as sku_code from cf_purchase_orders o left join cf_parties p on p.id = o.party_id
      left join cf_skus s on s.id = o.sku_id where o.book = $1 order by o.order_date desc`, [ctx.book]);
    const inst = await db.query("select * from cf_po_installments where book = $1 order by seq", [ctx.book]);
    const pays = await db.query(`select a.po_installment_id, a.amount, a.alloc_date, t.bank_account_id, t.id as txn_id from cf_allocations a
      join cf_transactions t on t.id = a.txn_id where a.book = $1 and a.po_installment_id is not null`, [ctx.book]);
    return pos.map((po) => {
      const i = inst.filter((x) => x.po_id === po.id).map((x) => ({ ...x, remaining: E.payRemaining(x), payments: pays.filter((p) => p.po_installment_id === x.id) }));
      const paid = r2(i.reduce((s, x) => s + num(x.paid_amount), 0));
      return { ...po, installments: i, paid, balance: po.status === "cancelled" ? 0 : r2(i.filter((x) => x.status !== "cancelled").reduce((s, x) => s + E.payRemaining(x), 0)),
        advance: E.poAdvance(po, i.map((x) => ({ ...x, po_id: po.id }))) };
    });
  });
  def("po_create", OPS, async (ctx, b) => wtx(ctx, "PO created", (t) => createPO(t, ctx, b)));
  def("po_update", FIN, async (ctx, b) => {
    if (isBlank(b.reason)) throw bad("A reason is required.");
    return wtx(ctx, b.reason, async (t) => {
      const patch = {};
      for (const k of ["status", "expected_delivery_date", "note", "item_desc"]) if (b.patch?.[k] !== undefined) patch[k] = b.patch[k];
      if (patch.status === "cancelled") {
        const [x] = await t.query("select coalesce(sum(paid_amount),0) as s from cf_po_installments where po_id = $1", [b.id]);
        if (num(x.s) > 0) throw bad(`₹${num(x.s)} has already been paid on this PO. Close it (or mark received) instead of cancelling.`);
      }
      return updateById(t, "cf_purchase_orders", b.id, ctx.book, patch);
    });
  });
  def("po_installment_update", FIN, async (ctx, b) => {
    if (isBlank(b.reason)) throw bad("A reason is required.");
    return wtx(ctx, b.reason, async (t) => {
      const patch = {};
      for (const k of ["due_date", "expected_pay_date", "label"]) if (b.patch?.[k] !== undefined) patch[k] = b.patch[k];
      return updateById(t, "cf_po_installments", b.id, ctx.book, patch);
    });
  });
  def("po_receive", OPS, async (ctx, b) => wtx(ctx, "Goods received", async (t) => {
    const [po] = await t.query("select * from cf_purchase_orders where id = $1 and book = $2 for update", [b.id, ctx.book]);
    if (!po) throw bad("PO not found.");
    const value = num(b.value);
    if (!(value > 0)) throw bad("Enter the value of goods received.");
    const received = r2(num(po.received_value) + value);
    if (received > num(po.total_value) * 1.05) throw bad("That's more than the PO value.");
    const status = received >= num(po.total_value) - 0.5 ? "received" : "partially_received";
    if (b.sku_id && num(b.units) > 0) {
      await insert(t, "cf_inventory_movements", { book: ctx.book, sku_id: b.sku_id, mv_date: b.date || today(), kind: "receipt", qty: num(b.units),
        unit_cost: r2(value / num(b.units)), reference: po.po_number, source: "manual", created_by: ctx.user.email });
      await t.query("update cf_skus set units_wip = greatest(0, units_wip - $1) where id = $2", [num(b.units), b.sku_id]);
    }
    return updateById(t, "cf_purchase_orders", po.id, ctx.book, { received_value: received, status });
  }));

  // inventory
  def("inventory_list", ALL, async (ctx) => {
    const S = await loadState(db, ctx.book);
    const d = computeDashboard(S, today());
    const V = viewAsOf(S, addDays(today(), 1));
    const sold = {};
    for (const m of V.movements) if (m.kind === "sale") { const a = diffDays(today(), m.mv_date); const x = sold[m.sku_id] || (sold[m.sku_id] = { d30: 0, d90: 0 }); if (a < 30) x.d30 -= num(m.qty); if (a < 90) x.d90 -= num(m.qty); }
    const inv = E.inventoryAnalytics(V.skus, sold, today(), S.settings, d.sales.cogs30);
    const trend = S.wcSnaps.filter((w) => w.snap_date >= addDays(today(), -90)).map((w) => ({ date: w.snap_date, value: num(w.inventory_value) }));
    return { ...inv, trend, invGrowthPct: d.inventory.invGrowthPct, salesGrowthPct: d.sales.salesGrowthPct, cogs30: d.sales.cogs30 };
  });
  def("sku_upsert", OPS, async (ctx, b) => wtx(ctx, b.id ? (b.reason || "SKU updated") : "SKU created", async (t) => {
    if (isBlank(b.sku) || isBlank(b.product)) throw bad("SKU and product name are required.");
    if (num(b.cost_per_unit) < 0) throw bad("Cost can't be negative.");
    const f = { sku: b.sku.trim(), product: b.product, category: b.category || null, cost_per_unit: r2(b.cost_per_unit), selling_price: r2(b.selling_price),
      units_wip: num(b.units_wip), units_incoming: num(b.units_incoming), launched_on: b.launched_on || null, active: b.active !== false };
    let sku;
    if (b.id) sku = await updateById(t, "cf_skus", b.id, ctx.book, f);
    else {
      const dup = await t.query("select 1 from cf_skus where book = $1 and lower(sku) = lower($2)", [ctx.book, f.sku]);
      if (dup.length) throw bad("That SKU already exists.");
      sku = (await insert(t, "cf_skus", { book: ctx.book, ...f }))[0];
      if (num(b.units_on_hand) > 0) await insert(t, "cf_inventory_movements", { book: ctx.book, sku_id: sku.id, mv_date: today(), kind: "opening", qty: num(b.units_on_hand),
        unit_cost: f.cost_per_unit, source: "manual", created_by: ctx.user.email });
    }
    return sku;
  }));
  def("sku_movement", OPS, async (ctx, b) => wtx(ctx, b.note || "Stock movement", async (t) => {
    const kinds = { receipt: 1, return: 1, sale: -1, writeoff: -1, adjust: 0 };
    if (!(b.kind in kinds)) throw bad("Bad movement type.");
    let qty = num(b.qty);
    if (kinds[b.kind] !== 0) qty = Math.abs(qty) * kinds[b.kind];
    if (qty === 0) throw bad("Quantity can't be zero.");
    const [s] = await t.query("select * from cf_skus where id = $1 and book = $2", [b.sku_id, ctx.book]);
    if (!s) throw bad("SKU not found.");
    if (num(s.units_on_hand) + qty < 0) throw bad(`Only ${num(s.units_on_hand)} units on hand.`);
    return (await insert(t, "cf_inventory_movements", { book: ctx.book, sku_id: s.id, mv_date: b.date || today(), kind: b.kind, qty, unit_cost: s.cost_per_unit,
      reference: b.note || null, source: "manual", created_by: ctx.user.email }))[0];
  }));

  // working capital / MIS
  def("mis", ALL, async (ctx, b) => misPayload(db, ctx.book, Math.min(12, num(b.months) || 6)));
  def("mis_adjust", FIN, async (ctx, b) => wtx(ctx, b.note || "MIS adjustment", async (t) => {
    if (isBlank(b.note)) throw bad("Explain the adjustment.");
    return (await insert(t, "cf_mis_adjustments", { book: ctx.book, month: `${String(b.month).slice(0, 7)}-01`, line: b.line, amount: r2(b.amount), note: b.note, created_by: ctx.user.email }))[0];
  }));
  def("working_capital", ALL, async (ctx, b) => {
    const d = computeDashboard(await loadState(db, ctx.book), today());
    const w = E.workingCapital({ inventory: d.workingCapital.inventory, receivables: d.workingCapital.receivables, supplierAdvances: d.workingCapital.supplierAdvances,
      payables: d.workingCapital.payables, netSales30: d.sales.netSales30, cogs30: d.sales.cogs30, purchases30: d.sales.purchases30 }, b.levers || {});
    return { ...w, ccc: d.ccc, cccTrend: d.cccTrend, inventory: d.inventory, receivablesDetail: d.receivables, payablesDetail: d.payables, sales: d.sales,
      wcTrend: (await db.query("select snap_date, cash, inventory_value, receivables, payables, supplier_advances from cf_wc_snapshots where book = $1 and snap_date >= $2 order by snap_date",
        [ctx.book, addDays(today(), -120)])) };
  });

  // bank reconciliation
  def("bank_view", ALL, async (ctx, b) => {
    const acct = b.account_id;
    const from = b.from || addDays(today(), -30), to = b.to || today();
    const lines = await db.query(`select bt.*, t.description as matched_desc, t.txn_date as matched_date, t.category_code as matched_category
      from cf_bank_transactions bt left join cf_transactions t on t.id = bt.matched_txn_id
      where bt.book = $1 and bt.bank_account_id = $2 and bt.txn_date between $3 and $4 order by bt.txn_date, bt.created_at`, [ctx.book, acct, from, to]);
    const ledger = await db.query(`select t.*, c.name as category_name, p.name as party_name, bt.id as bank_line_id from cf_transactions t
      join cf_categories c on c.code = t.category_code left join cf_parties p on p.id = t.party_id
      left join cf_bank_transactions bt on bt.matched_txn_id = t.id
      where t.book = $1 and t.bank_account_id = $2 and t.nature = 'cash' and t.status = 'posted' and t.txn_date between $3 and $4 order by t.txn_date`, [ctx.book, acct, addDays(from, -3), addDays(to, 3)]);
    const [stmt] = await db.query("select * from cf_bank_balances where book = $1 and bank_account_id = $2 and source = 'statement' and bal_date <= $3 order by bal_date desc limit 1", [ctx.book, acct, to]);
    const balDate = stmt?.bal_date || to;
    const systemAt = await systemBalanceOn(db, ctx.book, acct, balDate);
    const [reported] = await db.query("select * from cf_bank_balances where book = $1 and bank_account_id = $2 and bal_date <= $3 order by bal_date desc, source desc limit 1", [ctx.book, acct, to]);
    const sumBy = (arr, st) => r2(arr.filter((x) => st.includes(x.match_status)).reduce((s, x) => s + (x.direction === "in" ? 1 : -1) * num(x.amount), 0));
    return {
      lines, ledger, from, to,
      statement: stmt ? { date: stmt.bal_date, closing: num(stmt.closing_reported), system: systemAt, difference: r2(num(stmt.closing_reported) - systemAt) } : null,
      latestReported: reported ? { date: reported.bal_date, closing: num(reported.closing_reported), source: reported.source, system: num(reported.system_closing), difference: num(reported.difference) } : null,
      summary: {
        matched: lines.filter((l) => ["auto", "manual", "posted"].includes(l.match_status)).length, unmatched: lines.filter((l) => l.match_status === "unmatched").length,
        ignored: lines.filter((l) => l.match_status === "ignored").length, unmatchedNet: sumBy(lines, ["unmatched"]),
        ledgerUnmatched: ledger.filter((t) => !t.bank_line_id && t.txn_date >= from && t.txn_date <= to).length,
        ledgerUnmatchedNet: r2(ledger.filter((t) => !t.bank_line_id && t.txn_date >= from && t.txn_date <= to).reduce((s, t) => s + (t.direction === "in" ? 1 : -1) * num(t.amount), 0)),
      },
    };
  });
  def("bank_automatch", FIN, async (ctx, b) => wtx(ctx, "Bank auto-match", async (t) => {
    const lines = await t.query("select * from cf_bank_transactions where book = $1 and bank_account_id = $2 and match_status = 'unmatched'", [ctx.book, b.account_id]);
    const txns = await t.query(`select t.*, p.name as party_name from cf_transactions t left join cf_parties p on p.id = t.party_id
      where t.book = $1 and t.bank_account_id = $2 and t.nature = 'cash' and t.status = 'posted'
      and not exists (select 1 from cf_bank_transactions bt where bt.matched_txn_id = t.id)`, [ctx.book, b.account_id]);
    const m = E.matchBankLines(lines, txns, { window: num(b.window) || 3 });
    for (const x of m) await t.query("update cf_bank_transactions set match_status = 'auto', matched_txn_id = $1, matched_by = $2, matched_at = now() where id = $3", [x.txn_id, ctx.user.email, x.bank_id]);
    return { matched: m.length, remaining: lines.length - m.length };
  }));
  def("bank_match", FIN, async (ctx, b) => wtx(ctx, "Bank manual match", async (t) => {
    const [l] = await t.query("select * from cf_bank_transactions where id = $1 and book = $2", [b.bank_id, ctx.book]);
    const [x] = await t.query("select * from cf_transactions where id = $1 and book = $2 and status = 'posted' and nature = 'cash'", [b.txn_id, ctx.book]);
    if (!l || !x) throw bad("Line or transaction not found.");
    if (l.bank_account_id !== x.bank_account_id) throw bad("They are on different accounts.");
    if (l.direction !== x.direction) throw bad("One is money in and the other money out.");
    if (Math.abs(num(l.amount) - num(x.amount)) > 0.5 && isBlank(b.reason)) throw bad(`Amounts differ by ${E.formatINR(num(l.amount) - num(x.amount))} — add a reason to match anyway.`);
    const used = await t.query("select 1 from cf_bank_transactions where matched_txn_id = $1", [x.id]);
    if (used.length) throw bad("That ledger transaction is already matched to another bank line.");
    await t.query("update cf_bank_transactions set match_status = 'manual', matched_txn_id = $1, matched_by = $2, matched_at = now() where id = $3", [x.id, ctx.user.email, l.id]);
    return { ok: true };
  }));
  def("bank_unmatch", FIN, async (ctx, b) => wtx(ctx, b.reason || "Unmatched", async (t) => {
    await t.query("update cf_bank_transactions set match_status = 'unmatched', matched_txn_id = null, matched_by = null, matched_at = null where id = $1 and book = $2", [b.bank_id, ctx.book]);
    return { ok: true };
  }));
  def("bank_ignore", FIN, async (ctx, b) => {
    if (isBlank(b.reason)) throw bad("Say why this line can be ignored.");
    return wtx(ctx, b.reason, async (t) => { await t.query("update cf_bank_transactions set match_status = 'ignored', matched_by = $1, matched_at = now() where id = $2 and book = $3", [ctx.user.email, b.bank_id, ctx.book]); return { ok: true }; });
  });
  def("bank_post", FIN, async (ctx, b) => wtx(ctx, "Posted from bank statement", async (t) => {
    const [l] = await t.query("select * from cf_bank_transactions where id = $1 and book = $2 and match_status = 'unmatched'", [b.bank_id, ctx.book]);
    if (!l) throw bad("Bank line not found or already matched.");
    const txn = await cashTxn(t, ctx, { direction: l.direction, amount: l.amount, txn_date: l.txn_date, category_code: b.category_code, bank_account_id: l.bank_account_id,
      party_id: b.party_name ? await partyId(t, ctx.book, b.party_name, l.direction === "in" ? "customer" : "supplier") : null,
      description: b.description || l.description, source_ref: l.reference, source: "bank_recon" });
    if (l.direction === "in" && ["collect_gateway", "collect_cod", "collect_marketplace", "collect_b2b"].includes(b.category_code)) {
      await applyCollection(t, ctx, txn, { collect_gateway: "gateway", collect_cod: "cod", collect_marketplace: "marketplace", collect_b2b: "b2b" }[b.category_code], l.txn_date, null);
    }
    await t.query("update cf_bank_transactions set match_status = 'posted', matched_txn_id = $1, matched_by = $2, matched_at = now() where id = $3", [txn.id, ctx.user.email, l.id]);
    return txn;
  }));
  def("bank_balance_add", FIN, async (ctx, b) => wtx(ctx, b.note || "Statement balance", async (t) => {
    await assertAccount(t, ctx.book, b.account_id);
    const system = await systemBalanceOn(t, ctx.book, b.account_id, b.date);
    await t.query("delete from cf_bank_balances where book = $1 and bank_account_id = $2 and bal_date = $3 and source = 'statement'", [ctx.book, b.account_id, b.date]);
    return (await insert(t, "cf_bank_balances", { book: ctx.book, bank_account_id: b.account_id, bal_date: b.date, closing_reported: num(b.closing), system_closing: system,
      difference: r2(num(b.closing) - system), source: "statement", note: b.note || null, created_by: ctx.user.email }))[0];
  }));

  // imports
  def("import_commit", OPS, async (ctx, b) => {
    if (["bank_statement", "expenses"].includes(b.import_type) && !FIN.includes(ctx.user.role)) throw new HttpError(403, "Only Finance can import bank statements and paid expenses.");
    return wtx(ctx, `Import ${b.import_type}: ${b.file_name || ""}`, (t) => commitImport(t, ctx, b));
  });
  def("imports_list", ALL, async (ctx) => db.query(`select i.*, a.name as account_name from cf_imports i left join cf_bank_accounts a on a.id = i.bank_account_id
    where i.book = $1 order by i.created_at desc limit 100`, [ctx.book]));
  def("import_errors", ALL, async (ctx, b) => db.query(`select e.* from cf_import_errors e join cf_imports i on i.id = e.import_id where i.book = $1 and e.import_id = $2 order by e.row_number`, [ctx.book, b.id]));
  def("mapping_save", OPS, async (ctx, b) => {
    await db.query(`insert into cf_import_mappings(book, import_type, name, mapping) values ($1,$2,$3,$4)
      on conflict (book, import_type, name) do update set mapping = excluded.mapping, updated_at = now()`, [ctx.book, b.import_type, b.name || "default", JSON.stringify(b.mapping)]);
    return { ok: true };
  });
  def("mappings", ALL, async (ctx, b) => db.query("select * from cf_import_mappings where book = $1 and import_type = $2 order by updated_at desc", [ctx.book, b.import_type]));

  // reports
  def("report", ALL, async (ctx, b) => {
    const S = await loadState(db, ctx.book);
    S.misAdjustments = await db.query("select * from cf_mis_adjustments where book = $1", [ctx.book]);
    return report(S, b.type, b);
  });

  // master data / settings
  def("account_upsert", FIN, async (ctx, b) => wtx(ctx, b.reason || "Account saved", async (t) => {
    if (isBlank(b.name) || !b.opening_date) throw bad("Name and opening date are required.");
    const f = { name: b.name, bank_name: b.bank_name || null, account_last4: b.account_last4 || null, kind: b.kind || "bank", opening_balance: r2(b.opening_balance),
      opening_date: b.opening_date, restricted_amount: r2(b.restricted_amount), is_primary: !!b.is_primary, active: b.active !== false };
    if (f.is_primary) await t.query("update cf_bank_accounts set is_primary = false where book = $1 and id <> coalesce($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)", [ctx.book, b.id || null]);
    if (b.id) {
      const [cur] = await t.query("select * from cf_bank_accounts where id = $1 and book = $2", [b.id, ctx.book]);
      const used = await t.query("select 1 from cf_transactions where bank_account_id = $1 and nature = 'cash' limit 1", [b.id]);
      if (used.length && (num(cur.opening_balance) !== f.opening_balance || cur.opening_date !== f.opening_date) && isBlank(b.reason)) throw bad("Changing the opening balance of an account with transactions needs a reason.");
      return updateById(t, "cf_bank_accounts", b.id, ctx.book, f);
    }
    return (await insert(t, "cf_bank_accounts", { book: ctx.book, ...f }))[0];
  }));
  def("party_upsert", OPS, async (ctx, b) => wtx(ctx, "Party saved", async (t) => {
    if (isBlank(b.name)) throw bad("Name is required.");
    const f = { name: b.name.trim(), kind: b.kind || "supplier", gstin: b.gstin || null, phone: b.phone || null, payment_terms_days: Math.round(num(b.payment_terms_days)), note: b.note || null, active: b.active !== false };
    if (b.id) return updateById(t, "cf_parties", b.id, ctx.book, f);
    return (await insert(t, "cf_parties", { book: ctx.book, ...f }))[0];
  }));
  def("parties_list", ALL, async (ctx) => {
    const rows = await db.query("select * from cf_parties where book = $1 order by kind, name", [ctx.book]);
    const owed = await db.query(`select party_id, sum(amount - paid_amount) as owed from cf_payables where book = $1 and status in ('open','partial') group by party_id`, [ctx.book]);
    const poOwed = await db.query(`select o.party_id, sum(i.amount - i.paid_amount) as owed from cf_po_installments i join cf_purchase_orders o on o.id = i.po_id
      where i.book = $1 and i.status in ('open','partial') and o.status <> 'cancelled' group by o.party_id`, [ctx.book]);
    const m = new Map();
    for (const r of [...owed, ...poOwed]) m.set(r.party_id, (m.get(r.party_id) || 0) + num(r.owed));
    return rows.map((r) => ({ ...r, owed: r2(m.get(r.id) || 0) }));
  });
  def("category_create", FIN, async (ctx, b) => wtx(ctx, "Custom category", async (t) => {
    if (isBlank(b.name)) throw bad("Name is required.");
    const code = "custom_" + String(b.name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
    const allowed = ["marketing", "shipping", "salaries", "opex", "finance_cost", "inventory", "tax", "financing", "none", "revenue"];
    if (!allowed.includes(b.pnl_class)) throw bad("Choose how this category affects the P&L.");
    const dup = await t.query("select 1 from cf_categories where code = $1", [code]);
    if (dup.length) throw bad("A category with that name exists.");
    return (await insert(t, "cf_categories", { code, name: b.name, direction: b.direction || "out", grp: b.grp || "Other", pnl_class: b.pnl_class, is_critical: !!b.is_critical, is_custom: true, sort: 95 }))[0];
  }));
  def("category_update", FIN, async (ctx, b) => wtx(ctx, b.reason || "Category updated", async (t) => {
    const patch = {};
    for (const k of ["name", "is_critical", "active"]) if (b.patch?.[k] !== undefined) patch[k] = b.patch[k];
    const cols = Object.keys(patch);
    if (!cols.length) return null;
    const rows = await t.query(`update cf_categories set ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")} where code = $${cols.length + 1} returning *`, [...cols.map((c) => patch[c]), b.code]);
    return rows[0];
  }));
  def("channel_update", FIN, async (ctx, b) => wtx(ctx, "Channel terms updated", async (t) => {
    const rows = await t.query("update cf_channels set fee_pct = $1, settlement_lag_days = $2, active = $3 where code = $4 returning *", [num(b.fee_pct), Math.round(num(b.settlement_lag_days)), b.active !== false, b.code]);
    if (!rows.length) throw bad("Channel not found.");
    return rows[0];
  }));
  def("recurring_upsert", FIN, async (ctx, b) => wtx(ctx, b.id ? "Recurring updated" : "Recurring created", async (t) => {
    await assertCategory(t, b.category_code, "out");
    if (!(num(b.amount) > 0) || !b.start_date || !b.frequency) throw bad("Amount, frequency and start date are required.");
    const f = { name: b.name, category_code: b.category_code, party_id: b.party_name ? await partyId(t, ctx.book, b.party_name, "other") : b.party_id || null, amount: r2(b.amount),
      frequency: b.frequency, day_of_month: b.day_of_month ? Math.round(num(b.day_of_month)) : null, weekday: b.weekday ? Math.round(num(b.weekday)) : null,
      start_date: b.start_date, end_date: b.end_date || null, is_critical: !!b.is_critical, active: b.active !== false };
    if (b.id) return updateById(t, "cf_recurring_expenses", b.id, ctx.book, f);
    return (await insert(t, "cf_recurring_expenses", { book: ctx.book, ...f }))[0];
  }));
  def("settings_save", FIN, async (ctx, b) => wtx(ctx, b.reason || "Settings changed", async (t) => {
    const allowed = ["min_cash_manual", "min_cash_mode", "min_cash_horizon_days", "gst_rate_pct", "gst_net_payable_pct", "default_cogs_pct", "receivables_from_sales",
      "large_amount_multiple", "large_amount_floor", "recon_tolerance", "slow_moving_days", "dead_stock_days"];
    const patch = Object.fromEntries(Object.entries(b.patch || {}).filter(([k]) => allowed.includes(k)));
    if (!Object.keys(patch).length) throw bad("Nothing to save.");
    const cols = Object.keys(patch);
    const rows = await t.query(`update cf_settings set ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")}, updated_at = now(), updated_by = $${cols.length + 1} where book = $${cols.length + 2} returning *`,
      [...cols.map((c) => patch[c]), ctx.user.email, ctx.book]);
    return rows[0];
  }));
  def("assumptions_save", FIN, async (ctx, b) => wtx(ctx, b.reason || "Forecast assumptions changed", async (t) => {
    if (!E.SCENARIOS.includes(b.scenario)) throw bad("Unknown scenario.");
    for (const [key, value] of Object.entries(b.values || {})) {
      if (!(key in E.ASSUMPTION_META)) continue;
      await t.query(`insert into cf_forecast_assumptions(book, scenario, key, value, updated_by) values ($1,$2,$3,$4,$5)
        on conflict (book, scenario, key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`, [ctx.book, b.scenario, key, num(value), ctx.user.email]);
    }
    return E.mergeAssumptions(await t.query("select * from cf_forecast_assumptions where book = $1", [ctx.book]));
  }));
  def("alert_rule_save", FIN, async (ctx, b) => wtx(ctx, "Alert rule changed", async (t) => (await t.query(
    "update cf_alert_rules set enabled = $1, threshold = $2, severity = coalesce($3, severity), updated_at = now() where book = $4 and code = $5 returning *",
    [b.enabled !== false, b.threshold === "" || b.threshold === null || b.threshold === undefined ? null : num(b.threshold), b.severity || null, ctx.book, b.code]))[0]));
  def("alert_ack", ALL, async (ctx, b) => wtx(ctx, "Alert acknowledged", async (t) => (await t.query(
    "update cf_alerts set acknowledged_by = $1, acknowledged_at = now() where id = $2 and book = $3 returning *", [ctx.user.email, b.id, ctx.book]))[0]));
  def("snapshot_now", FIN, async (ctx) => {
    return wtx(ctx, "Manual snapshot", async (t) => {
      let S = await loadState(t, ctx.book);
      const n = await snapshotForecast(t, ctx.book, S, mondayOf(today()));
      S = await loadState(t, ctx.book);
      const d = await snapshotWc(t, ctx.book, S, today());
      await persistAlerts(t, ctx.book, d.alerts, today());
      return { forecastRows: n, alerts: d.alerts.length };
    });
  });

  // users (admin)
  def("users_list", ADMIN, async () => db.query("select * from cf_users order by role, email"));
  def("user_upsert", ADMIN, async (ctx, b) => wtx(ctx, "User access changed", async (t) => {
    const email = String(b.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad("Enter a valid email.");
    if (!ALL.includes(b.role)) throw bad("Pick a role.");
    if (email === ctx.user.email && (b.role !== "admin" || b.active === false)) throw bad("You can't remove your own admin access.");
    const rows = await t.query(`insert into cf_users(email, name, role, active, created_by) values ($1,$2,$3,$4,$5)
      on conflict (email) do update set name = coalesce(excluded.name, cf_users.name), role = excluded.role, active = excluded.active returning *`,
      [email, b.name || null, b.role, b.active !== false, ctx.user.email]);
    const admins = await t.query("select count(*)::int as n from cf_users where role = 'admin' and active");
    if (admins[0].n < 1) throw bad("There must be at least one active admin.");
    let invite = null;
    if (b.invite && opts.inviteUser) invite = await opts.inviteUser(email).catch((e) => ({ error: e.message }));
    return { user: rows[0], invite };
  }));

  // demo book (admin only; never touches live)
  def("demo_step", ADMIN, async (ctx, b) => {
    if (ctx.book !== "demo") throw bad("Demo data can only be loaded into the demo book.");
    return demoStep(ctx, b.step, b);
  });

  async function demoStep(ctx, step, b) {
    const asOf = today();
    const demo = generateDemo(asOf);
    if (step === "reset") {
      return wtx(ctx, "Demo reset", async (t) => {
        for (const tbl of ["cf_import_errors"]) await t.query(`delete from ${tbl} where import_id in (select id from cf_imports where book = 'demo')`);
        await t.query("update cf_bank_transactions set matched_txn_id = null where book = 'demo'");
        for (const tbl of ["cf_bank_transactions", "cf_allocations", "cf_bank_balances", "cf_transactions", "cf_daily_sales", "cf_receivables", "cf_payables",
          "cf_po_installments", "cf_purchase_orders", "cf_inventory_movements", "cf_skus", "cf_recurring_expenses", "cf_daily_updates", "cf_imports",
          "cf_forecast_snapshots", "cf_wc_snapshots", "cf_alerts", "cf_mis_adjustments", "cf_forecast_assumptions", "cf_import_mappings", "cf_bank_accounts", "cf_parties"]) {
          await t.query(`delete from ${tbl} where book = 'demo'`);
        }
        await t.query("delete from cf_audit_log where book = 'demo'");
        await t.query("update cf_settings set min_cash_manual = 1000000, min_cash_mode = 'higher', receivables_from_sales = true where book = 'demo'");
        return { ok: true, days: demo.days.length };
      });
    }
    if (step === "master") {
      return wtx(ctx, "Demo master data", async (t) => {
        const ids = {};
        for (const a of demo.accounts) ids["acct:" + a.key] = (await insert(t, "cf_bank_accounts", { book: "demo", ...omit(a, ["key"]) }))[0].id;
        for (const p of demo.parties) ids["party:" + p.name] = (await insert(t, "cf_parties", { book: "demo", ...p }))[0].id;
        for (const r of demo.recurring) await insert(t, "cf_recurring_expenses", { book: "demo", ...omit(r, ["party"]), party_id: ids["party:" + r.party] || null });
        const skuRows = await insertMany(t, "cf_skus", demo.skus.map((s) => ({ book: "demo", ...omit(s, ["key"]) })));
        const skuId = Object.fromEntries(skuRows.map((s) => [s.sku, s.id]));
        await insertMany(t, "cf_inventory_movements", demo.movements.map((m) => ({ book: "demo", sku_id: skuId[m.sku], mv_date: m.date, kind: m.kind, qty: m.qty, unit_cost: m.unit_cost, source: "demo", reference: m.ref || null })), { returning: "" });
        // recalc on-hand once (bulk insert triggers already did, but keep it exact)
        for (const po of demo.pos) {
          await createPO(t, ctx, { ...omit(po, ["supplier", "receive", "sku"]), party_id: ids["party:" + po.supplier], sku_id: po.sku ? skuId[po.sku] : null });
          if (po.receive) await t.query("update cf_purchase_orders set received_value = $1, status = $2 where book = 'demo' and po_number = $3", [po.receive.value, po.receive.status, po.po_number]);
        }
        for (const p of demo.payables) await createPayable(t, ctx, { ...omit(p, ["party"]), party_id: ids["party:" + p.party] });
        for (const r of demo.receivables) await createReceivable(t, ctx, { ...omit(r, ["party"]), party_id: ids["party:" + r.party] || null });
        for (const e of demo.expected) await insert(t, "cf_transactions", { book: "demo", nature: "expected", source: "demo", created_by: ctx.user.email, ...e, created_at: addDays(asOf, -70) });
        await t.query("update cf_settings set min_cash_manual = $1 where book = 'demo'", [demo.settings.min_cash_manual]);
        return { ok: true };
      });
    }
    if (step === "days") {
      const from = num(b.from) || 0, to = Math.min(demo.days.length, from + (num(b.count) || 15));
      const accts = await db.query("select id, name from cf_bank_accounts where book = 'demo'", []);
      const acctId = (k) => accts.find((a) => a.name === demo.accounts.find((x) => x.key === k)?.name)?.id;
      for (let i = from; i < to; i++) {
        const d = demo.days[i];
        const p = await resolveDemoPayload(d.payload, acctId);
        const c = await dailyContext(db, "demo", p.date);
        const v = E.validateDailyUpdate(p, { today: today(), existingStatus: c.existing?.status, accounts: c.accounts, prevClosing: c.prevClosing, averages: c.averages, ledgerSameDay: c.ledgerSameDay, settings: c.settings });
        if (v.errors.length) throw bad(`Demo day ${p.date}: ${v.errors.map((e) => e.msg).join("; ")}`);
        await wtx(ctx, `Demo daily update ${p.date}`, async (t) => {
          await postDaily(t, ctx, p, v, { recon_note: d.recon_note || (v.reconOk ? null : "Demo: unexplained difference"), mode: "new" });
          // backdate the submission timestamp for realism
          await t.query("update cf_daily_updates set submitted_at = $1, is_late = $2 where book = 'demo' and update_date = $3", [`${addDays(p.date, d.late ? 3 : 1)}T04:${String(20 + (i % 30)).padStart(2, "0")}:00Z`, !!d.late, p.date]);
          for (const m of d.inventorySales || []) {
            const [s] = await t.query("select id, cost_per_unit from cf_skus where book = 'demo' and sku = $1", [m.sku]);
            if (s) await insert(t, "cf_inventory_movements", { book: "demo", sku_id: s.id, mv_date: p.date, kind: "sale", qty: -Math.abs(m.qty), unit_cost: s.cost_per_unit, source: "demo" }, { returning: "" });
          }
          if (d.cogs) await t.query("update cf_daily_sales set cogs = $1 where book = 'demo' and sale_date = $2 and status = 'posted'", [d.cogs, p.date]);
        });
      }
      return { done: to, total: demo.days.length };
    }
    if (step === "finish") {
      return wtx(ctx, "Demo finish", async (t) => {
        // bank statement for the primary account (last ~30 days) → reconciliation demo
        const [hdfc] = await t.query("select id from cf_bank_accounts where book = 'demo' and is_primary");
        const ledger = await t.query("select * from cf_transactions where book = 'demo' and bank_account_id = $1 and nature = 'cash' and status = 'posted' and txn_date >= $2 order by txn_date, created_at", [hdfc.id, addDays(asOf, -30)]);
        const opening = await systemBalanceOn(t, "demo", hdfc.id, addDays(asOf, -31));
        const stmt = demo.bankStatement(ledger, opening);
        const imp = (await insert(t, "cf_imports", { book: "demo", import_type: "bank_statement", file_name: "HDFC_statement_demo.xlsx", file_hash: "demo-" + asOf,
          bank_account_id: hdfc.id, total_rows: stmt.length, success_rows: stmt.length, imported_by: ctx.user.email }))[0];
        await insertMany(t, "cf_bank_transactions", stmt.map((s) => ({ book: "demo", bank_account_id: hdfc.id, import_id: imp.id, ...s })), { returning: "" });
        const last = stmt.filter((s) => s.running_balance !== null).slice(-1)[0];
        if (last) {
          const system = await systemBalanceOn(t, "demo", hdfc.id, last.txn_date);
          await insert(t, "cf_bank_balances", { book: "demo", bank_account_id: hdfc.id, bal_date: last.txn_date, closing_reported: last.running_balance, system_closing: system,
            difference: r2(last.running_balance - system), source: "statement", note: "Demo statement", created_by: ctx.user.email });
        }
        // backfill weekly forecast snapshots (for accuracy) and WC snapshots (for trends/CCC)
        const S = await loadState(t, "demo");
        for (let w = 9; w >= 0; w--) await snapshotForecast(t, "demo", S, addDays(mondayOf(asOf), -7 * w));
        const S2 = await loadState(t, "demo");
        const wcRows = [];
        for (let k = 100; k >= 0; k -= (k > 35 ? 7 : 1)) {
          const d = addDays(asOf, -k);
          const D = computeDashboard(S2, d);
          wcRows.push({ book: "demo", snap_date: d, cash: D.tiles.currentCash, inventory_value: D.workingCapital.inventory, receivables: D.workingCapital.receivables,
            payables: D.workingCapital.payables, supplier_advances: D.workingCapital.supplierAdvances, net_sales_30d: D.sales.netSales30, cogs_30d: D.sales.cogs30,
            dio: D.ccc.dio, dso: D.ccc.dso, dpo: D.ccc.dpo, ccc: D.ccc.ccc });
        }
        await t.query("delete from cf_wc_snapshots where book = 'demo'");
        await insertMany(t, "cf_wc_snapshots", wcRows, { returning: "" });
        const S3 = await loadState(t, "demo");
        const D = computeDashboard(S3, asOf);
        await persistAlerts(t, "demo", D.alerts, asOf);
        return { ok: true, statementLines: stmt.length, alerts: D.alerts.length };
      });
    }
    throw bad("Unknown demo step.");
  }
  async function resolveDemoPayload(p, acctId) {
    const fix = (id) => (id && id.startsWith("acct:") ? acctId(id.slice(5)) : id);
    const out = JSON.parse(JSON.stringify(p));
    out.collections.forEach((c) => (c.account_id = fix(c.account_id)));
    for (const x of out.payments) {
      x.account_id = fix(x.account_id);
      if (x.link?.po_number) {
        const [i] = await db.query(`select i.id from cf_po_installments i join cf_purchase_orders o on o.id = i.po_id where o.book = 'demo' and o.po_number = $1 and i.seq = $2`, [x.link.po_number, x.link.seq]);
        x.link = i ? { type: "po_installment", id: i.id } : null;
      } else if (x.link?.payable_ref) {
        const [i] = await db.query("select id from cf_payables where book = 'demo' and reference = $1", [x.link.payable_ref]);
        x.link = i ? { type: "payable", id: i.id } : null;
      }
    }
    out.bank.accounts.forEach((a) => (a.account_id = fix(a.account_id)));
    out.bank.movements.forEach((m) => { m.account_id = fix(m.account_id); m.to_account_id = fix(m.to_account_id); });
    return out;
  }

  // ─── dispatcher ────────────────────────────────────────────────────────
  async function run(action, body = {}, user) {
    const a = A[action];
    if (!a) throw bad(`Unknown action: ${action}`);
    if (!user) throw new HttpError(401, "Sign in first.");
    if (!a.roles.includes(user.role)) throw new HttpError(403, `Your role (${user.role}) can't do this.`);
    const book = body.book === "demo" ? "demo" : "live";
    return a.fn({ user, book }, body);
  }

  return { run, actions: A, runDaily, loadState, computeDashboard, today };
}

// ─── utilities ───────────────────────────────────────────────────────────
function omit(o, keys) { const c = { ...o }; for (const k of keys) delete c[k]; return c; }
function cryptoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
}

// ═════════════════════════════════════════════════════════════════════════
// HTTP handler (Vercel)
// ═════════════════════════════════════════════════════════════════════════
const tokenCache = new Map();
async function authUser(req, db) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sign in first.");
  const hit = tokenCache.get(token);
  let email;
  if (hit && hit.exp > Date.now()) email = hit.email;
  else {
    const url = process.env.CASH_SUPABASE_URL, key = process.env.CASH_SUPABASE_ANON_KEY;
    if (!url || !key) throw new HttpError(500, "CASH_SUPABASE_URL / CASH_SUPABASE_ANON_KEY are not configured.");
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new HttpError(401, "Your session has expired — sign in again.");
    email = String((await r.json()).email || "").toLowerCase();
    tokenCache.set(token, { email, exp: Date.now() + 60000 });
    if (tokenCache.size > 500) tokenCache.clear();
  }
  const [u] = await db.query("select * from cf_users where email = $1 and active", [email]);
  if (!u) throw new HttpError(403, `${email} doesn't have access. Ask an admin to add you.`);
  return { email: u.email, role: u.role, name: u.name };
}

async function inviteUser(email) {
  const url = process.env.CASH_SUPABASE_URL, key = process.env.CASH_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { skipped: "CASH_SUPABASE_SERVICE_ROLE_KEY not set — create the login in Supabase Auth manually." };
  const redirectTo = process.env.CASH_APP_URL || undefined;
  const r = await fetch(`${url}/auth/v1/invite`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, ...(redirectTo ? { data: {}, redirect_to: redirectTo } : {}) }) });
  return r.ok ? { invited: true } : { error: (await r.text()).slice(0, 200) };
}

async function notifySlack(d) {
  const hook = process.env.CASH_SLACK_WEBHOOK_URL;
  if (!hook) return null;
  const f = (n) => E.formatINR(n, { compact: true });
  const st = d.updateStatus;
  const lines = [
    `*Hashway cash — ${d.asOf} 10:00 AM*`,
    st.status === "green" ? `✅ ${st.message}` : `${st.status === "red" ? "🔴" : "🟡"} ${st.message} Please submit the 10 AM finance update: ${process.env.CASH_APP_URL || ""}/cash/daily`,
    `Cash today *${f(d.tiles.currentCash)}* · next 7 days in ${f(d.tiles.expected7.inflow)} / out ${f(d.tiles.expected7.outflow)} · lowest in 13 weeks *${f(d.tiles.lowest13.closing)}* (week ${d.tiles.lowest13.week}) vs minimum ${f(d.tiles.minRequired)}`,
    ...d.alerts.slice(0, 6).map((a) => `${a.severity === "high" ? "🔴" : "🟡"} ${a.message}`),
  ];
  const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) });
  return r.ok;
}

let service = null;
export default async function handler(req, res) {
  try {
    const db = prodDb();
    service = service || createCashService(db, { inviteUser });
    const action = req.query?.action || req.body?.action;
    if (action === "cron_daily") {
      const secret = process.env.CRON_SECRET;
      const auth = req.headers.authorization || "";
      if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: "unauthorized" });
      const d = await service.runDaily("live");
      const slack = await notifySlack(d).catch((e) => `slack failed: ${e.message}`);
      return res.status(200).json({ ok: true, asOf: d.asOf, alerts: d.alerts.length, status: d.updateStatus.status, slack });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const user = await authUser(req, db);
    const out = await service.run(body.action, body, user);
    return res.status(200).json(out ?? { ok: true });
  } catch (e) {
    const status = e.status || (/violates|invalid input|not-null|check constraint/i.test(e.message) ? 400 : 500);
    if (status >= 500) console.error("[hashway-cash]", e);
    return res.status(status).json({ error: e.message, ...(e.extra || {}) });
  }
}
