// Hashway Cash Command Center — financial engine.
//
// PURE functions only: no I/O, no Node or browser APIs. The same module is
// imported by the API (api/_hashway-cash.js), the UI (src/cash/*) for live
// previews, and the test-suite (tests/cash-engine.test.mjs), so every
// number the dashboard shows comes from exactly one implementation.
//
// Conventions
//   • Dates are 'YYYY-MM-DD' strings in IST business days.
//   • Amounts are rupees (numbers). Everything is rounded to paise at the
//     edges with r2(); intermediate maths stays in floats.
//   • Inflow/outflow amounts are always positive; `direction` says which.
//   • Confidence ladder: actual > confirmed > probable > possible.
//     Forecast INFLOWS are weighted by scenario confidence weights so that
//     uncertain revenue is never treated as guaranteed cash. Committed
//     OUTFLOWS (bills, POs, recurring, fixed budgets) are never discounted;
//     only variable costs that exist solely because of projected sales
//     (ad %, shipping, packaging, refunds, re-buys) share those sales'
//     confidence — otherwise doubting revenue would invent losses.

// ─── numbers & dates ─────────────────────────────────────────────────────
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const num = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
export const isBlank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

const toUTC = (d) => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
const fromUTC = (t) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d, n) => fromUTC(toUTC(d) + n * 86400000);
export const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000); // a − b
export const isoWeekday = (d) => { const w = new Date(toUTC(d)).getUTCDay(); return w === 0 ? 7 : w; };
export const mondayOf = (d) => addDays(d, 1 - isoWeekday(d));
export const monthKey = (d) => d.slice(0, 7);
export const monthStart = (d) => d.slice(0, 7) + "-01";
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
export const addMonths = (d, n) => {
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const ny = t.getUTCFullYear(), nm = t.getUTCMonth() + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(dd, daysInMonth(ny, nm))).padStart(2, "0")}`;
};
export const maxDate = (a, b) => (!a ? b : !b ? a : a > b ? a : b);
export const minDate = (a, b) => (!a ? b : !b ? a : a < b ? a : b);

/** Today's date in India (UTC+5:30). */
export function istToday(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
}
/** Current hour (0-23) in India. */
export function istHour(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000).getUTCHours();
}

export function weekStarts(asOf, n = 13) {
  const first = mondayOf(asOf);
  return Array.from({ length: n }, (_, i) => addDays(first, i * 7));
}

/** Deterministic 53-bit string hash (cyrb53) → hex. Used for dedupe keys. */
export function hashString(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}
/** Stable hash of a row — key order and whitespace/case of strings don't matter. */
export function rowHash(obj) {
  const norm = (v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, " ") : typeof v === "number" ? r2(v) : v ?? null);
  const keys = Object.keys(obj).sort();
  return hashString(JSON.stringify(keys.map((k) => [k, norm(obj[k])])));
}

// ─── document balances ───────────────────────────────────────────────────
export const OPEN_REC = new Set(["open", "partial", "disputed"]);
export const OPEN_PAY = new Set(["open", "partial"]);

export function recRemaining(r) {
  return Math.max(0, r2(num(r.net_amount) - num(r.collected_amount) - num(r.written_off_amount)));
}
export function payRemaining(p) {
  return Math.max(0, r2(num(p.amount) - num(p.paid_amount)));
}

/**
 * Apply `amount` to open documents oldest-first.
 * docs: [{ id, remaining, date }]. Returns { allocations: [{id, amount}], unapplied }.
 */
export function allocateFIFO(docs, amount) {
  let left = r2(amount);
  const allocations = [];
  const sorted = [...docs].filter((d) => d.remaining > 0.004)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id).localeCompare(String(b.id))));
  for (const d of sorted) {
    if (left <= 0.004) break;
    const take = r2(Math.min(left, d.remaining));
    if (take > 0) { allocations.push({ id: d.id, amount: take }); left = r2(left - take); }
  }
  return { allocations, unapplied: Math.max(0, left) };
}

// ─── ageing ──────────────────────────────────────────────────────────────
export const REC_BUCKETS = [
  { key: "0-7", label: "0–7 days", min: 0, max: 7 },
  { key: "8-15", label: "8–15 days", min: 8, max: 15 },
  { key: "16-30", label: "16–30 days", min: 16, max: 30 },
  { key: "31-60", label: "31–60 days", min: 31, max: 60 },
  { key: "60+", label: "60+ days", min: 61, max: Infinity },
];
/** Receivable ageing by days since origin (sale/invoice) date. */
export function receivableAgeing(recs, asOf) {
  const buckets = REC_BUCKETS.map((b) => ({ ...b, amount: 0, count: 0 }));
  let total = 0, overdue = 0, overdueCount = 0, dueNext7 = 0, dueNext30 = 0;
  for (const r of recs) {
    if (!OPEN_REC.has(r.status)) continue;
    const rem = recRemaining(r);
    if (rem <= 0) continue;
    total += rem;
    const age = Math.max(0, diffDays(asOf, r.origin_date));
    const b = buckets.find((x) => age >= x.min && age <= x.max);
    b.amount += rem; b.count++;
    if (r.expected_date < asOf) { overdue += rem; overdueCount++; }
    else {
      if (diffDays(r.expected_date, asOf) <= 7) dueNext7 += rem;
      if (diffDays(r.expected_date, asOf) <= 30) dueNext30 += rem;
    }
  }
  buckets.forEach((b) => (b.amount = r2(b.amount)));
  return { buckets, total: r2(total), overdue: r2(overdue), overdueCount, dueNext7: r2(dueNext7), dueNext30: r2(dueNext30) };
}

export const PAY_BUCKETS = [
  { key: "current", label: "Current (not yet due)", min: -Infinity, max: 0 },
  { key: "1-7", label: "1–7 days overdue", min: 1, max: 7 },
  { key: "8-15", label: "8–15 days overdue", min: 8, max: 15 },
  { key: "16-30", label: "16–30 days overdue", min: 16, max: 30 },
  { key: "30+", label: "30+ days overdue", min: 31, max: Infinity },
];
/** Payable ageing by days past due date. Accepts payables and PO installments. */
export function payableAgeing(items, asOf) {
  const buckets = PAY_BUCKETS.map((b) => ({ ...b, amount: 0, count: 0 }));
  let total = 0, overdue = 0, due7 = 0, due14 = 0, due30 = 0;
  for (const p of items) {
    if (!OPEN_PAY.has(p.status)) continue;
    const rem = payRemaining(p);
    if (rem <= 0) continue;
    total += rem;
    const late = diffDays(asOf, p.due_date);
    const b = buckets.find((x) => late >= x.min && late <= x.max);
    b.amount += rem; b.count++;
    if (late > 0) overdue += rem;
    const until = diffDays(p.expected_pay_date || p.due_date, asOf);
    if (until <= 7) due7 += rem;
    if (until <= 14) due14 += rem;
    if (until <= 30) due30 += rem;
  }
  buckets.forEach((b) => (b.amount = r2(b.amount)));
  return { buckets, total: r2(total), overdue: r2(overdue), dueNext7: r2(due7), dueNext14: r2(due14), dueNext30: r2(due30) };
}

// ─── purchase-order payment schedules ────────────────────────────────────
export const PAYMENT_TERMS = {
  "100_advance": "100% advance",
  "50_50": "50% advance / 50% on delivery",
  "30_40_30": "30% advance / 40% mid-production / 30% on delivery",
  "on_delivery": "100% on delivery",
  "custom": "Custom installments",
};

/**
 * Build the installment schedule for a PO.
 * custom: [{ label, pct?, amount?, due_date }]. Rounding residue goes to
 * the last installment so the schedule always sums to the PO value.
 */
export function buildInstallments(terms, totalValue, orderDate, deliveryDate, custom = []) {
  const total = r2(totalValue);
  if (!(total > 0)) throw new Error("PO value must be greater than zero");
  if (!orderDate) throw new Error("Order date is required");
  const delivery = deliveryDate || addDays(orderDate, 30);
  if (delivery < orderDate) throw new Error("Delivery date cannot be before order date");
  const mid = addDays(orderDate, Math.round(diffDays(delivery, orderDate) / 2));
  let plan;
  switch (terms) {
    case "100_advance": plan = [{ label: "Advance", pct: 100, due_date: orderDate }]; break;
    case "50_50": plan = [{ label: "Advance", pct: 50, due_date: orderDate }, { label: "Balance on delivery", pct: 50, due_date: delivery }]; break;
    case "30_40_30": plan = [
      { label: "Advance", pct: 30, due_date: orderDate },
      { label: "Mid-production", pct: 40, due_date: mid },
      { label: "Balance on delivery", pct: 30, due_date: delivery }]; break;
    case "on_delivery": plan = [{ label: "On delivery", pct: 100, due_date: delivery }]; break;
    case "custom": {
      if (!custom.length) throw new Error("Custom terms need at least one installment");
      const hasAmt = custom.every((c) => !isBlank(c.amount));
      const hasPct = custom.every((c) => !isBlank(c.pct));
      if (!hasAmt && !hasPct) throw new Error("Give every installment either an amount or a percentage");
      const tot = hasAmt ? sum(custom, (c) => num(c.amount)) : sum(custom, (c) => num(c.pct));
      const target = hasAmt ? total : 100;
      if (Math.abs(tot - target) > (hasAmt ? 1 : 0.01)) {
        throw new Error(hasAmt ? `Installments add up to ₹${r2(tot)} but PO value is ₹${total}` : `Installment percentages add up to ${r2(tot)}%, not 100%`);
      }
      custom.forEach((c, i) => { if (!c.due_date) throw new Error(`Installment ${i + 1} needs a due date`); });
      plan = custom.map((c) => ({
        label: c.label || "Installment",
        pct: hasPct ? num(c.pct) : r2((num(c.amount) / total) * 100),
        amount: hasAmt ? r2(num(c.amount)) : undefined,
        due_date: c.due_date,
      }));
      break;
    }
    default: throw new Error(`Unknown payment terms: ${terms}`);
  }
  let allocated = 0;
  return plan.map((p, i) => {
    const amt = i === plan.length - 1 ? r2(total - allocated) : r2(p.amount ?? (total * p.pct) / 100);
    allocated = r2(allocated + amt);
    return { seq: i + 1, label: p.label, pct: r2(p.pct), amount: amt, due_date: p.due_date, expected_pay_date: p.due_date };
  });
}

/** Supplier advance locked in a PO = paid − value of goods received (never < 0). */
export function poAdvance(po, installments) {
  if (po.status === "cancelled") return 0;
  const paid = sum(installments.filter((i) => i.po_id === po.id), (i) => num(i.paid_amount));
  return Math.max(0, r2(paid - num(po.received_value)));
}

// ─── recurring expenses ──────────────────────────────────────────────────
/** Occurrence dates of a recurring expense within [from, to]. */
export function recurringDates(rec, from, to) {
  if (rec.active === false) return [];
  const start = maxDate(rec.start_date, from);
  const end = minDate(rec.end_date || to, to);
  if (start > end) return [];
  const out = [];
  if (rec.frequency === "weekly") {
    const wd = rec.weekday || isoWeekday(rec.start_date);
    let d = addDays(start, (wd - isoWeekday(start) + 7) % 7);
    for (; d <= end; d = addDays(d, 7)) out.push(d);
    return out;
  }
  const step = rec.frequency === "monthly" ? 1 : rec.frequency === "quarterly" ? 3 : 12;
  const dom = rec.day_of_month || Number(rec.start_date.slice(8, 10));
  // walk months from the series start so quarterly/yearly stay in phase
  let m = monthStart(rec.start_date);
  for (let guard = 0; guard < 600 && m <= end; guard++, m = addMonths(m, step)) {
    const [y, mo] = m.split("-").map(Number);
    const d = `${m.slice(0, 8)}${String(Math.min(dom, daysInMonth(y, mo))).padStart(2, "0")}`;
    if (d >= start && d <= end) out.push(d);
  }
  return out;
}
/** Period key used to tell whether a recurring occurrence is already booked. */
export function recurringPeriodKey(rec, date) {
  if (rec.frequency === "weekly") return mondayOf(date);
  if (rec.frequency === "monthly") return monthKey(date);
  if (rec.frequency === "quarterly") { const [y, m] = date.split("-").map(Number); return `${y}-Q${Math.ceil(m / 3)}`; }
  return date.slice(0, 4);
}

// ─── scenarios & assumptions ─────────────────────────────────────────────
export const SCENARIOS = ["base", "optimistic", "worst"];
export const ASSUMPTION_META = {
  sales_multiplier:          { label: "Sales vs recent run-rate (×)", step: 0.05, help: "1.00 = same daily sales as the last 4 weeks." },
  weekly_growth_pct:         { label: "Weekly sales growth (%)", step: 0.5, help: "Compounds week on week across the 13 weeks." },
  prepaid_share_pct:         { label: "Prepaid share of orders (%)", step: 1, help: "Blank/−1 = use the observed last-4-weeks split." },
  rto_rate_pct:              { label: "COD RTO rate (%)", step: 1, help: "Share of COD order value that comes back and is never paid. −1 = observed." },
  refund_rate_pct:           { label: "Refunds (% of sales)", step: 0.5, help: "Paid out ~5 days after the sale." },
  collection_delay_days:     { label: "Extra collection delay (days)", step: 1, help: "Pushes every expected collection later." },
  overdue_delay_days:        { label: "Overdue items: expect in (days)", step: 1, help: "When an already-overdue receivable is assumed to arrive." },
  probable_weight_pct:       { label: "Probable inflows counted (%)", step: 5, help: "How much of 'probable' cash to count." },
  possible_weight_pct:       { label: "Possible inflows counted (%)", step: 5, help: "How much of 'possible' cash to count." },
  marketing_pct_of_sales:    { label: "Ad spend (% of projected sales)", step: 1, help: "Meta/Google spend that scales with sales." },
  marketing_fixed_weekly:    { label: "Fixed ad budget per week (₹)", step: 5000, help: "Spend that happens regardless of sales." },
  shipping_pct_of_sales:     { label: "Shipping & COD charges (% of sales)", step: 0.5, help: "Courier invoices, paid ~7 days later." },
  packaging_pct_of_sales:    { label: "Packaging (% of sales)", step: 0.5, help: "" },
  replenish_pct_of_cogs:     { label: "Re-buy stock (% of COGS sold)", step: 5, help: "0 = only count POs you have actually raised." },
  gateway_fee_pct:           { label: "Gateway fee (%)", step: 0.1, help: "" },
  gateway_lag_days:          { label: "Gateway settlement (days)", step: 1, help: "" },
  cod_fee_pct:               { label: "COD remittance deduction (%)", step: 0.1, help: "" },
  cod_lag_days:              { label: "COD remittance lag (days)", step: 1, help: "Days from sale to cash for delivered COD." },
  probable_horizon_weeks:    { label: "Projected sales: probable for first N weeks", step: 1, help: "After this, projected sales are 'possible'." },
};
export function defaultAssumptions() {
  const common = {
    prepaid_share_pct: -1, marketing_fixed_weekly: 0, shipping_pct_of_sales: 8, packaging_pct_of_sales: 2,
    replenish_pct_of_cogs: 0, gateway_fee_pct: 2, gateway_lag_days: 2, cod_fee_pct: 1.5, cod_lag_days: 9,
    probable_horizon_weeks: 8, marketing_pct_of_sales: 25,
  };
  return {
    base: { ...common, sales_multiplier: 1, weekly_growth_pct: 0, rto_rate_pct: -1, refund_rate_pct: 3,
      collection_delay_days: 0, overdue_delay_days: 3, probable_weight_pct: 90, possible_weight_pct: 60 },
    optimistic: { ...common, sales_multiplier: 1.15, weekly_growth_pct: 1, rto_rate_pct: -1, refund_rate_pct: 2,
      collection_delay_days: 0, overdue_delay_days: 2, probable_weight_pct: 100, possible_weight_pct: 85 },
    worst: { ...common, sales_multiplier: 0.75, weekly_growth_pct: -1, rto_rate_pct: -1, refund_rate_pct: 5,
      collection_delay_days: 7, overdue_delay_days: 14, probable_weight_pct: 70, possible_weight_pct: 20, cod_lag_days: 12 },
  };
}
/** Merge stored overrides [{scenario,key,value}] over the defaults. */
export function mergeAssumptions(rows = []) {
  const a = defaultAssumptions();
  for (const r of rows) if (a[r.scenario] && r.key in a[r.scenario]) a[r.scenario][r.key] = num(r.value);
  return a;
}

/** Observed sales mix from recent daily sales. */
export function salesBaseline(dailySales, asOf, lookback = 28) {
  const from = addDays(asOf, -lookback);
  const rows = dailySales.filter((s) => s.sale_date >= from && s.sale_date < asOf && s.status !== "void");
  const days = rows.length ? Math.max(1, diffDays(asOf, rows.reduce((m, r) => minDate(m, r.sale_date), asOf))) : 0;
  const ov = sum(rows, (r) => num(r.order_value));
  const prepaid = sum(rows, (r) => num(r.prepaid_sales));
  const cod = sum(rows, (r) => num(r.cod_sales));
  const rto = sum(rows, (r) => num(r.rto_value));
  const refunds = sum(rows, (r) => num(r.refunds));
  // RTO is reported when parcels come back (~2 weeks after the order), so
  // use a longer window for the observed rate to avoid timing noise.
  const from60 = addDays(asOf, -60);
  const r60 = dailySales.filter((s) => s.sale_date >= from60 && s.sale_date < asOf && s.status !== "void");
  const cod60 = sum(r60, (r) => num(r.cod_sales));
  const rto60 = sum(r60, (r) => num(r.rto_value));
  return {
    days,
    avgDailyOrderValue: days ? ov / days : 0,
    avgDailyNetSales: days ? sum(rows, (r) => num(r.order_value) - num(r.cancellations) - num(r.refunds) - num(r.rto_value)) / days : 0,
    prepaidShare: prepaid + cod > 0 ? prepaid / (prepaid + cod) : 0.55,
    rtoRate: cod60 > 0 ? Math.min(0.9, rto60 / cod60) : 0.25,
    refundRate: ov > 0 ? refunds / ov : 0.03,
    bookedThrough: dailySales.filter((s) => s.status !== "void").reduce((m, r) => maxDate(m, r.sale_date), null),
    rto, cod,
  };
}

// ─── the 13-week forecast ────────────────────────────────────────────────
/**
 * Build every expected cash movement for one scenario.
 *
 * input = {
 *   asOf, weeks=13, openingCash,
 *   receivables[], payables[], installments[], recurring[], expected[],
 *   recurringCovered: Set<"recId|periodKey">, gstCoveredMonths: Set<"YYYY-MM"> (payment month),
 *   dailySales[], bookedNetSalesByMonth: {YYYY-MM: netSales},
 *   categories: {code: {is_critical, pnl_class, name}}, settings, assumptions (merged)
 * }
 */
export function buildFlows(input, scenario = "base") {
  const A = input.assumptions?.[scenario] || defaultAssumptions()[scenario];
  const asOf = input.asOf;
  const nWeeks = input.weeks || 13;
  const horizonEnd = addDays(mondayOf(asOf), nWeeks * 7 - 1);
  const settings = input.settings || {};
  const flows = [];
  const push = (f) => { if (f.amount > 0.004 && f.date <= horizonEnd) flows.push({ ...f, amount: r2(f.amount) }); };
  const clampFuture = (d) => (d < asOf ? asOf : d);

  // 1. Open receivables → inflows (confirmed / probable / possible)
  for (const r of input.receivables || []) {
    if (!OPEN_REC.has(r.status)) continue;
    const rem = recRemaining(r);
    if (rem <= 0) continue;
    let conf = r.confidence || "confirmed";
    let date;
    if (r.expected_date < asOf) {
      const late = diffDays(asOf, r.expected_date);
      // the longer it is overdue, the less certain it is
      if (late > 30) conf = "possible"; else if (late > 15 && conf === "confirmed") conf = "probable";
      date = addDays(asOf, num(A.overdue_delay_days));
    } else date = r.expected_date;
    if (r.status === "disputed") conf = "possible";
    date = addDays(date, num(A.collection_delay_days));
    push({ date, direction: "in", amount: rem, confidence: conf, source: "receivable", ref: r.id,
      category: r.kind === "cod" ? "collect_cod" : r.kind === "gateway" ? "collect_gateway" : r.kind === "marketplace" ? "collect_marketplace" : r.kind === "b2b" ? "collect_b2b" : "income_other",
      label: r.reference || `${r.kind} receivable`, overdue: r.expected_date < asOf });
  }

  // 2. Open payables → outflows (overdue = assume paid now)
  for (const p of input.payables || []) {
    if (!OPEN_PAY.has(p.status)) continue;
    const rem = payRemaining(p);
    if (rem <= 0) continue;
    push({ date: clampFuture(p.expected_pay_date || p.due_date), direction: "out", amount: rem, confidence: "confirmed",
      source: "payable", ref: p.id, category: p.category_code, label: p.description || p.reference || p.party_name || "Bill",
      critical: p.priority === "critical", overdue: p.due_date < asOf });
  }

  // 3. PO installments → outflows
  for (const i of input.installments || []) {
    if (!OPEN_PAY.has(i.status)) continue;
    const rem = payRemaining(i);
    if (rem <= 0) continue;
    push({ date: clampFuture(i.expected_pay_date || i.due_date), direction: "out", amount: rem, confidence: "confirmed",
      source: "po", ref: i.id, category: i.category_code || "prod_manufacturing",
      label: `${i.po_number || "PO"} · ${i.label}${i.party_name ? " · " + i.party_name : ""}`, critical: !!i.critical, overdue: i.due_date < asOf });
  }

  // 4. Recurring commitments (skip periods already booked as a bill/payment)
  const covered = input.recurringCovered || new Set();
  for (const rec of input.recurring || []) {
    for (const d of recurringDates(rec, asOf, horizonEnd)) {
      if (covered.has(`${rec.id}|${recurringPeriodKey(rec, d)}`)) continue;
      push({ date: d, direction: "out", amount: num(rec.amount), confidence: "confirmed", source: "recurring", ref: rec.id,
        category: rec.category_code, label: rec.name, critical: !!rec.is_critical });
    }
  }

  // 5. Manual expected one-offs
  for (const e of input.expected || []) {
    if (e.status === "void") continue;
    push({ date: clampFuture(e.txn_date), direction: e.direction, amount: num(e.amount), confidence: e.confidence || "probable",
      source: "expected", ref: e.id, category: e.category_code, label: e.description || "Expected", overdue: e.txn_date < asOf });
  }

  // 6. Projected D2C sales that have not happened yet
  const base = salesBaseline(input.dailySales || [], asOf);
  const prepaidShare = num(A.prepaid_share_pct) >= 0 ? num(A.prepaid_share_pct) / 100 : base.prepaidShare;
  const rtoRate = num(A.rto_rate_pct) >= 0 ? num(A.rto_rate_pct) / 100 : Math.min(0.9, base.rtoRate + (scenario === "worst" ? 0.08 : scenario === "optimistic" ? -0.04 : 0));
  const refundRate = num(A.refund_rate_pct) / 100;
  const gstRate = num(settings.gst_rate_pct ?? 5) / 100;
  const cogsPct = num(settings.default_cogs_pct ?? 38) / 100;
  const projStart = base.bookedThrough ? maxDate(addDays(base.bookedThrough, 1), addDays(asOf, -7)) : asOf;
  const projectedNetByMonth = {};
  if (base.avgDailyOrderValue > 0) {
    const probableUntil = addDays(mondayOf(asOf), num(A.probable_horizon_weeks || 4) * 7 - 1);
    for (let d = projStart; d <= horizonEnd; d = addDays(d, 1)) {
      const wk = Math.floor(diffDays(d, mondayOf(asOf)) / 7);
      const S = base.avgDailyOrderValue * num(A.sales_multiplier || 1) * Math.pow(1 + num(A.weekly_growth_pct) / 100, Math.max(0, wk));
      const conf = d <= probableUntil ? "probable" : "possible";
      const prepaid = S * prepaidShare, cod = S - prepaid;
      push({ date: addDays(d, num(A.gateway_lag_days) + num(A.collection_delay_days)), direction: "in", confidence: conf, source: "projection",
        category: "collect_gateway", label: "Projected prepaid settlements", amount: prepaid * (1 - num(A.gateway_fee_pct) / 100) });
      push({ date: addDays(d, num(A.cod_lag_days) + num(A.collection_delay_days)), direction: "in", confidence: conf, source: "projection",
        category: "collect_cod", label: "Projected COD remittances", amount: cod * (1 - rtoRate) * (1 - num(A.cod_fee_pct) / 100) });
      push({ date: addDays(d, 5), direction: "out", confidence: conf, source: "projection", linked: true, category: "refund_paid",
        label: "Projected refunds", amount: S * refundRate });
      push({ date: d, direction: "out", confidence: conf, source: "projection", linked: true, category: "mkt_meta",
        label: "Projected ad spend", amount: S * num(A.marketing_pct_of_sales) / 100 });
      push({ date: addDays(d, 7), direction: "out", confidence: conf, source: "projection", linked: true, category: "log_delhivery",
        label: "Projected shipping", amount: S * num(A.shipping_pct_of_sales) / 100, critical: true });
      push({ date: d, direction: "out", confidence: conf, source: "projection", linked: true, category: "prod_packaging",
        label: "Projected packaging", amount: S * num(A.packaging_pct_of_sales) / 100 });
      const net = S * (1 - refundRate) - cod * rtoRate;
      if (num(A.replenish_pct_of_cogs) > 0) {
        push({ date: addDays(d, 14), direction: "out", confidence: conf, source: "projection", linked: true, category: "prod_manufacturing",
          label: "Projected stock re-buy", amount: (net / (1 + gstRate)) * cogsPct * num(A.replenish_pct_of_cogs) / 100 });
      }
      projectedNetByMonth[monthKey(d)] = (projectedNetByMonth[monthKey(d)] || 0) + net;
    }
  }
  if (num(A.marketing_fixed_weekly) > 0) {
    for (const ws of weekStarts(asOf, nWeeks)) {
      push({ date: maxDate(ws, asOf), direction: "out", confidence: "confirmed", source: "projection", category: "mkt_meta",
        label: "Fixed ad budget", amount: num(A.marketing_fixed_weekly) });
    }
  }

  // 7. GST reserve: net GST on month M sales is paid on the 20th of M+1,
  //    unless a GST bill / payment already covers that month.
  const gstCovered = input.gstCoveredMonths || new Set();
  const gstPct = num(settings.gst_net_payable_pct ?? 3.5) / 100;
  if (gstPct > 0) {
    const months = new Set([...Object.keys(input.bookedNetSalesByMonth || {}), ...Object.keys(projectedNetByMonth)]);
    for (const m of months) {
      const payDate = addMonths(m + "-20", 1);
      if (payDate < asOf || payDate > horizonEnd) continue;
      if (gstCovered.has(monthKey(payDate))) continue;
      const booked = num(input.bookedNetSalesByMonth?.[m]);
      const projected = num(projectedNetByMonth[m]);
      if (booked > 0) push({ date: payDate, direction: "out", confidence: "confirmed", source: "gst", category: "tax_gst",
        label: `GST for ${m} (booked sales)`, amount: booked * gstPct, critical: true });
      if (projected > 0) push({ date: payDate, direction: "out", confidence: "probable", source: "gst", category: "tax_gst",
        label: `GST for ${m} (projected sales)`, amount: projected * gstPct, critical: true });
    }
  }

  return { flows: flows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)), baseline: base, rtoRate, prepaidShare, horizonEnd };
}

export function confidenceWeight(conf, A) {
  if (conf === "actual" || conf === "confirmed") return 1;
  if (conf === "probable") return num(A.probable_weight_pct) / 100;
  if (conf === "possible") return num(A.possible_weight_pct) / 100;
  return 1;
}

/** Minimum cash required at a point = critical outflows over the horizon, vs the manual floor. */
export function minCashRequired(flows, fromDate, settings, categories = {}) {
  const horizon = num(settings.min_cash_horizon_days ?? 30);
  const to = addDays(fromDate, horizon - 1);
  const computed = sum(flows.filter((f) => f.direction === "out" && f.date >= fromDate && f.date <= to &&
    (f.critical || categories[f.category]?.is_critical)), (f) => f.amount);
  const manual = num(settings.min_cash_manual);
  const mode = settings.min_cash_mode || "higher";
  const value = mode === "manual" ? manual : mode === "computed" ? computed : Math.max(manual, computed);
  return { value: r2(value), computed: r2(computed), manual: r2(manual), mode };
}

/** Run one scenario: weekly buckets, closing balances, lowest point. */
export function buildForecast(input, scenario = "base") {
  const A = input.assumptions?.[scenario] || defaultAssumptions()[scenario];
  const { flows, baseline, rtoRate, prepaidShare } = buildFlows(input, scenario);
  const starts = weekStarts(input.asOf, input.weeks || 13);
  const settings = input.settings || {};
  const cats = input.categories || {};
  let opening = r2(input.openingCash);
  const weeks = starts.map((start, idx) => {
    const end = addDays(start, 6);
    const wf = flows.filter((f) => f.date >= start && f.date <= end);
    const inflow = { confirmed: 0, probable: 0, possible: 0, weighted: 0, unweighted: 0 };
    const byCatIn = {}, byCatOut = {};
    let outflow = 0;
    for (const f of wf) {
      if (f.direction === "in") {
        const w = confidenceWeight(f.confidence, A);
        inflow[f.confidence] = (inflow[f.confidence] || 0) + f.amount;
        inflow.unweighted += f.amount;
        inflow.weighted += f.amount * w;
        byCatIn[f.category] = (byCatIn[f.category] || 0) + f.amount * w;
      } else {
        // Committed outflows always count 100%. Variable costs that only
        // happen if the projected sales happen carry those sales' confidence.
        const amt = f.linked ? f.amount * confidenceWeight(f.confidence, A) : f.amount;
        outflow += amt;
        byCatOut[f.category] = (byCatOut[f.category] || 0) + amt;
      }
    }
    // closing is built from the DISPLAYED (paise-rounded) figures so every
    // row satisfies closing = opening + inflow − outflow exactly
    const inW = r2(inflow.weighted), outR = r2(outflow);
    const closing = r2(opening + inW - outR);
    const minReq = minCashRequired(flows, start < input.asOf ? input.asOf : start, settings, cats);
    const w = {
      index: idx + 1, start, end, opening: r2(opening),
      inflow: inW, inflowUnweighted: r2(inflow.unweighted),
      inflowConfirmed: r2(inflow.confirmed), inflowProbable: r2(inflow.probable), inflowPossible: r2(inflow.possible),
      outflow: outR, net: r2(inW - outR), closing,
      minRequired: minReq.value, surplus: r2(closing - minReq.value),
      belowMin: closing < minReq.value, negative: closing < 0,
      byCatIn: Object.fromEntries(Object.entries(byCatIn).map(([k, v]) => [k, r2(v)])),
      byCatOut: Object.fromEntries(Object.entries(byCatOut).map(([k, v]) => [k, r2(v)])),
    };
    opening = closing;
    return w;
  });
  const lowest = weeks.reduce((m, w) => (w.closing < m.closing ? w : m), weeks[0]);
  const firstBelowMin = weeks.find((w) => w.belowMin) || null;
  const runOut = weeks.find((w) => w.negative) || null;
  const headroom = weeks.reduce((m, w) => Math.min(m, w.surplus), Infinity);
  return {
    scenario, asOf: input.asOf, openingCash: r2(input.openingCash), weeks, flows,
    lowest: { closing: lowest.closing, week: lowest.index, start: lowest.start },
    firstBelowMinWeek: firstBelowMin?.index ?? null,
    runOutWeek: runOut?.index ?? null,
    endingCash: weeks[weeks.length - 1].closing,
    totalInflow: r2(sum(weeks, (w) => w.inflow)),
    totalOutflow: r2(sum(weeks, (w) => w.outflow)),
    // How much extra could be spent TODAY (e.g. a new production run)
    // without breaching the minimum reserve in any of the 13 weeks.
    affordableNow: r2(Math.max(0, headroom)),
    fundingGap: r2(Math.max(0, -headroom)),
    assumptionsUsed: { ...A, observed_prepaid_share: r2(baseline.prepaidShare * 100), observed_rto_rate: r2(baseline.rtoRate * 100),
      applied_prepaid_share: r2(prepaidShare * 100), applied_rto_rate: r2(rtoRate * 100), avg_daily_sales: r2(baseline.avgDailyOrderValue) },
  };
}

export function buildAllScenarios(input) {
  return Object.fromEntries(SCENARIOS.map((s) => [s, buildForecast(input, s)]));
}

/** Sum of weighted inflows (and outflows) within N days — dashboard tiles. */
export function expectedWithin(forecast, days) {
  const A = forecast.assumptionsUsed;
  const to = addDays(forecast.asOf, days - 1);
  const f = forecast.flows.filter((x) => x.date >= forecast.asOf && x.date <= to);
  return {
    inflow: r2(sum(f.filter((x) => x.direction === "in"), (x) => x.amount * confidenceWeight(x.confidence, A))),
    inflowConfirmed: r2(sum(f.filter((x) => x.direction === "in" && x.confidence === "confirmed"), (x) => x.amount)),
    outflow: r2(sum(f.filter((x) => x.direction === "out"), (x) => x.amount * (x.linked ? confidenceWeight(x.confidence, A) : 1))),
  };
}

// ─── cash position ───────────────────────────────────────────────────────
/**
 * Per-account balances.
 *  system   = opening_balance + Σ posted cash txns since opening_date
 *  bank     = latest reported closing + Σ cash txns dated after it
 *             (falls back to system when nothing reported)
 */
export function cashPosition(accounts, cashTxns, balances = []) {
  const rows = accounts.filter((a) => a.active !== false).map((a) => {
    const txns = cashTxns.filter((t) => t.bank_account_id === a.id && t.status !== "void" && t.nature === "cash" && t.txn_date >= a.opening_date);
    const signed = (t) => (t.direction === "in" ? 1 : -1) * num(t.amount);
    const system = r2(num(a.opening_balance) + sum(txns, signed));
    const rep = balances.filter((b) => b.bank_account_id === a.id).sort((x, y) => (x.bal_date < y.bal_date ? 1 : x.bal_date > y.bal_date ? -1 : (x.source === "statement" ? -1 : 1)))[0];
    let bank = system, reportedDate = null, reported = null, systemAtReport = null;
    if (rep) {
      reported = num(rep.closing_reported); reportedDate = rep.bal_date;
      bank = r2(reported + sum(txns.filter((t) => t.txn_date > rep.bal_date), signed));
      systemAtReport = r2(num(a.opening_balance) + sum(txns.filter((t) => t.txn_date <= rep.bal_date), signed));
    }
    const restricted = num(a.restricted_amount);
    return { id: a.id, name: a.name, kind: a.kind, system, bank, reported, reportedDate, systemAtReport,
      difference: reported === null ? 0 : r2(reported - systemAtReport), restricted, available: r2(bank - restricted) };
  });
  return {
    accounts: rows,
    total: r2(sum(rows, (r) => r.bank)),
    system: r2(sum(rows, (r) => r.system)),
    restricted: r2(sum(rows, (r) => r.restricted)),
    available: r2(sum(rows, (r) => r.available)),
    unreconciled: r2(sum(rows, (r) => r.difference)),
  };
}

/** Actual weekly cash in/out from posted cash txns (own-account transfers excluded). */
export function actualWeeks(cashTxns, fromMonday, toDate, categories = {}) {
  const out = [];
  for (let s = fromMonday; s <= toDate; s = addDays(s, 7)) {
    const e = addDays(s, 6);
    const t = cashTxns.filter((x) => x.nature === "cash" && x.status !== "void" && x.txn_date >= s && x.txn_date <= e &&
      categories[x.category_code]?.pnl_class !== "transfer");
    const inflow = sum(t.filter((x) => x.direction === "in"), (x) => num(x.amount));
    const outflow = sum(t.filter((x) => x.direction === "out"), (x) => num(x.amount));
    const byCatOut = {};
    t.filter((x) => x.direction === "out").forEach((x) => (byCatOut[x.category_code] = r2((byCatOut[x.category_code] || 0) + num(x.amount))));
    out.push({ start: s, end: e, inflow: r2(inflow), outflow: r2(outflow), net: r2(inflow - outflow), byCatOut, partial: e > toDate });
  }
  return out;
}

// ─── forecast accuracy ───────────────────────────────────────────────────
const accuracyOf = (forecast, actual) => {
  if (forecast <= 0 && actual <= 0) return 1;
  if (forecast <= 0) return 0;
  return Math.max(0, 1 - Math.abs(actual - forecast) / forecast);
};
/**
 * snapshots: [{as_of, scenario, week_index, week_start, inflow, outflow}],
 * actuals: actualWeeks() output. Compares the forecast frozen at the start
 * of each week (week_index = horizon) with what actually happened.
 */
export function forecastAccuracy(snapshots, actuals, { scenario = "base", horizon = 1 } = {}) {
  const act = new Map(actuals.filter((a) => !a.partial).map((a) => [a.start, a]));
  const rows = snapshots.filter((s) => s.scenario === scenario && Number(s.week_index) === horizon && act.has(s.week_start))
    .sort((a, b) => (a.week_start < b.week_start ? -1 : 1))
    .map((s) => {
      const a = act.get(s.week_start);
      return {
        week_start: s.week_start,
        forecastIn: r2(s.inflow), actualIn: a.inflow, varianceIn: r2(a.inflow - num(s.inflow)), accuracyIn: r2(accuracyOf(num(s.inflow), a.inflow) * 100),
        forecastOut: r2(s.outflow), actualOut: a.outflow, varianceOut: r2(a.outflow - num(s.outflow)), accuracyOut: r2(accuracyOf(num(s.outflow), a.outflow) * 100),
      };
    });
  const avg = (k) => (rows.length ? r2(sum(rows, (r) => r[k]) / rows.length) : null);
  const totF = sum(rows, (r) => r.forecastIn), totA = sum(rows, (r) => r.actualIn);
  return { rows, avgAccuracyIn: avg("accuracyIn"), avgAccuracyOut: avg("accuracyOut"),
    collectionRatio: totF > 0 ? r2(totA / totF) : null, bias: rows.length ? r2(sum(rows, (r) => r.varianceIn) / rows.length) : null };
}

/** Use history to propose better assumptions (never applied automatically). */
export function suggestAssumptions({ accuracy, receivables = [], dailySales = [], assumptions, asOf }) {
  const out = [];
  const base = assumptions.base;
  if (accuracy?.rows?.length >= 3 && accuracy.collectionRatio !== null) {
    const ratio = accuracy.collectionRatio;
    if (Math.abs(1 - ratio) > 0.05) {
      const suggested = Math.max(30, Math.min(100, Math.round(num(base.probable_weight_pct) * ratio / 5) * 5));
      if (suggested !== num(base.probable_weight_pct)) out.push({ scenario: "base", key: "probable_weight_pct", current: num(base.probable_weight_pct), suggested,
        why: `Over the last ${accuracy.rows.length} weeks actual collections were ${Math.round(ratio * 100)}% of forecast.` });
    }
  }
  const codDone = receivables.filter((r) => r.kind === "cod" && r.actual_date && num(r.collected_amount) > 0 && r.actual_date >= addDays(asOf, -60));
  if (codDone.length >= 5) {
    const lateness = sum(codDone, (r) => diffDays(r.actual_date, r.expected_date)) / codDone.length;
    if (lateness > 1.5) out.push({ scenario: "base", key: "collection_delay_days", current: num(base.collection_delay_days), suggested: Math.round(lateness),
      why: `COD remittances have arrived on average ${lateness.toFixed(1)} days after the expected date.` });
  }
  const bl = salesBaseline(dailySales, asOf);
  if (bl.cod > 0 && num(base.rto_rate_pct) >= 0) {
    const obs = Math.round(bl.rtoRate * 100);
    if (Math.abs(obs - num(base.rto_rate_pct)) >= 3) out.push({ scenario: "base", key: "rto_rate_pct", current: num(base.rto_rate_pct), suggested: obs,
      why: `Observed COD RTO over the last 60 days is ${obs}%.` });
  }
  return out;
}

// ─── daily 10 AM update: payload helpers + validation ────────────────────
export const COLLECTION_LINES = [
  { key: "razorpay", label: "Razorpay settlement", category: "collect_gateway", channel: "razorpay", kind: "gateway" },
  { key: "payu", label: "PayU settlement", category: "collect_gateway", channel: "payu", kind: "gateway" },
  { key: "cashfree", label: "Cashfree settlement", category: "collect_gateway", channel: "cashfree", kind: "gateway" },
  { key: "gateway_other", label: "Other payment gateway", category: "collect_gateway", channel: "gateway_other", kind: "gateway" },
  { key: "delhivery_cod", label: "Delhivery COD remittance", category: "collect_cod", channel: "delhivery_cod", kind: "cod" },
  { key: "cod_other", label: "Other courier COD remittance", category: "collect_cod", channel: "cod_other", kind: "cod" },
  { key: "marketplace", label: "Marketplace settlements", category: "collect_marketplace", channel: "marketplace_other", kind: "marketplace" },
  { key: "b2b", label: "B2B / wholesale collections", category: "collect_b2b", channel: "b2b", kind: "b2b" },
  { key: "other_in", label: "Other cash received", category: "income_other", channel: null, kind: null },
];
export const PAYMENT_LINES = [
  { key: "manufacturing", label: "Manufacturing", category: "prod_manufacturing" },
  { key: "fabric", label: "Fabric / raw material", category: "prod_fabric" },
  { key: "packaging", label: "Packaging", category: "prod_packaging" },
  { key: "logistics", label: "Shipping / logistics", category: "log_delhivery" },
  { key: "advertising", label: "Advertising", category: "mkt_meta" },
  { key: "salaries", label: "Salaries", category: "ops_salaries" },
  { key: "rent", label: "Rent", category: "ops_rent" },
  { key: "gst", label: "GST / taxes", category: "tax_gst" },
  { key: "emi", label: "EMI / loans", category: "fin_emi" },
  { key: "software", label: "Software", category: "ops_software" },
  { key: "supplier", label: "Other supplier payments", category: "supplier_payment" },
  { key: "refunds", label: "Refunds paid to customers", category: "refund_paid" },
  { key: "other_out", label: "Other expenses", category: "expense_other" },
];
export const SALES_FIELDS = [
  { key: "order_value", label: "Total Shopify sales", help: "Value of orders placed (after discounts) — Shopify 'Total sales'. This is NOT cash.", required: true },
  { key: "orders", label: "Number of orders", help: "", integer: true },
  { key: "prepaid_sales", label: "Prepaid sales", help: "Orders paid online (Razorpay/PayU/Cashfree)." },
  { key: "cod_sales", label: "COD sales", help: "Cash-on-delivery orders — not cash until the courier remits it." },
  { key: "discounts", label: "Discounts given", help: "For the MIS only; already deducted from total sales." },
  { key: "cancellations", label: "Cancellations", help: "Order value cancelled before dispatch." },
  { key: "refunds", label: "Refunds issued", help: "Value refunded to customers (the cash out goes under Payments)." },
  { key: "rto_value", label: "RTOs received", help: "Value of COD parcels returned to origin — this COD will never be paid." },
];
export const SECTIONS = ["sales", "collections", "payments", "bank", "commitments"];

export function emptyDailyPayload(date, accounts = []) {
  const primary = accounts.find((a) => a.is_primary) || accounts[0];
  return {
    date,
    sales: Object.fromEntries(SALES_FIELDS.map((f) => [f.key, ""])),
    collections: COLLECTION_LINES.map((l) => ({ key: l.key, amount: "", account_id: primary?.id || null, channel_code: l.channel, note: "" })),
    payments: PAYMENT_LINES.map((l) => ({ key: l.key, category_code: l.category, amount: "", account_id: primary?.id || null, party_name: "", link: null, note: "" })),
    bank: { accounts: accounts.filter((a) => a.active !== false).map((a) => ({ account_id: a.id, opening: "", closing: "" })), movements: [] },
    commitments: { none: false, pos: [], expenses: [] },
    sections: {},
  };
}

/** All money lines in a payload, normalised, with the account they hit. */
export function dailyLines(p) {
  const lines = [];
  for (const c of p.collections || []) if (!isBlank(c.amount) && num(c.amount) !== 0) {
    const meta = COLLECTION_LINES.find((l) => l.key === c.key) || {};
    lines.push({ kind: "collection", key: c.key, label: c.label || meta.label || c.key, direction: "in", amount: num(c.amount),
      account_id: c.account_id, category: c.category_code || meta.category, channel: c.channel_code || meta.channel, recKind: meta.kind, note: c.note });
  }
  for (const x of p.payments || []) if (!isBlank(x.amount) && num(x.amount) !== 0) {
    const meta = PAYMENT_LINES.find((l) => l.key === x.key) || {};
    lines.push({ kind: "payment", key: x.key, label: x.label || meta.label || x.key, direction: "out", amount: num(x.amount),
      account_id: x.account_id, category: x.category_code || meta.category, party_name: x.party_name, link: x.link, note: x.note });
  }
  for (const m of p.bank?.movements || []) if (!isBlank(m.amount) && num(m.amount) !== 0) {
    if (m.category_code === "transfer" && m.to_account_id) {
      lines.push({ kind: "movement", label: m.note || "Transfer out", direction: "out", amount: num(m.amount), account_id: m.account_id, category: "transfer", transfer: true });
      lines.push({ kind: "movement", label: m.note || "Transfer in", direction: "in", amount: num(m.amount), account_id: m.to_account_id, category: "transfer", transfer: true });
    } else {
      lines.push({ kind: "movement", label: m.note || "Other movement", direction: m.direction === "out" ? "out" : "in", amount: num(m.amount),
        account_id: m.account_id, category: m.category_code || (m.direction === "out" ? "expense_other" : "income_other"), note: m.note });
    }
  }
  return lines;
}

/**
 * Validate a daily update. Never silently accepts inconsistencies:
 *   errors   → block submission
 *   warnings → must be acknowledged (recon differences also need a note)
 *
 * ctx = { today, existingStatus, mode:'new'|'correct', accounts[], prevClosing{acct:amt},
 *         averages{lineKey: avgDaily}, ledgerSameDay[{direction,amount,category_code,source}], settings }
 */
export function validateDailyUpdate(p, ctx = {}) {
  const errors = [], warnings = [];
  const settings = ctx.settings || {};
  const tol = num(settings.recon_tolerance ?? 1);
  const accounts = ctx.accounts || [];
  const acctName = (id) => accounts.find((a) => a.id === id)?.name || "account";
  const fmt = (n) => formatINR(n);

  if (!p.date) errors.push({ field: "date", msg: "Pick the date this update is for." });
  else if (ctx.today && p.date > ctx.today) errors.push({ field: "date", msg: "You can't submit an update for a future date." });
  else if (ctx.today && p.date === ctx.today) warnings.push({ field: "date", code: "today", msg: "This update is for today — the day isn't over yet. Normally you report yesterday." });
  if (ctx.existingStatus === "submitted" && ctx.mode !== "correct") {
    errors.push({ field: "date", code: "duplicate_date", msg: `An update for ${p.date} was already submitted. Open it and use "Correct" instead of entering it twice.` });
  }

  // negatives + blanks
  const s = p.sales || {};
  for (const f of SALES_FIELDS) {
    const v = s[f.key];
    if (!isBlank(v) && num(v) < 0) errors.push({ field: `sales.${f.key}`, msg: `${f.label} can't be negative.` });
    if (!isBlank(v) && isNaN(Number(String(v).replace(/[,₹\s]/g, "")))) errors.push({ field: `sales.${f.key}`, msg: `${f.label} must be a number.` });
    if (f.integer && !isBlank(v) && !Number.isInteger(num(v))) errors.push({ field: `sales.${f.key}`, msg: `${f.label} must be a whole number.` });
  }
  if (isBlank(s.order_value) && p.sections?.sales) errors.push({ field: "sales.order_value", msg: "Enter total Shopify sales (0 if there were none)." });
  for (const c of p.collections || []) if (!isBlank(c.amount) && num(c.amount) < 0) errors.push({ field: `collections.${c.key}`, msg: "Collections can't be negative — record money going out under Payments." });
  for (const x of p.payments || []) if (!isBlank(x.amount) && num(x.amount) < 0) errors.push({ field: `payments.${x.key}`, msg: "Payments can't be negative — record money coming in under Collections." });
  for (const m of p.bank?.movements || []) if (!isBlank(m.amount) && num(m.amount) < 0) errors.push({ field: "bank.movements", msg: "Enter movement amounts as positive numbers and choose in/out." });

  // sales internal consistency
  const ov = num(s.order_value), pre = num(s.prepaid_sales), cod = num(s.cod_sales);
  if (!isBlank(s.order_value) && (pre > 0 || cod > 0) && Math.abs(pre + cod - ov) > Math.max(10, ov * 0.01)) {
    warnings.push({ field: "sales.prepaid_sales", code: "split", msg: `Prepaid (${fmt(pre)}) + COD (${fmt(cod)}) = ${fmt(pre + cod)}, but total sales is ${fmt(ov)}.` });
  }
  if (ov > 0 && num(s.cancellations) + num(s.rto_value) > ov * 1.5) warnings.push({ field: "sales.rto_value", code: "returns_high", msg: "Cancellations + RTOs are much larger than today's sales. Double-check these are values, not counts." });
  if (num(s.orders) > 0 && ov > 0) {
    const aov = ov / num(s.orders);
    if (aov < 200 || aov > 20000) warnings.push({ field: "sales.orders", code: "aov", msg: `Average order value works out to ${fmt(aov)} — check orders vs sales.` });
  }

  // lines
  const lines = dailyLines(p);
  for (const l of lines) {
    if (!l.account_id) errors.push({ field: `${l.kind}.${l.key || ""}`, msg: `Choose which account "${l.label}" went through.` });
  }
  const avgs = ctx.averages || {};
  const mult = num(settings.large_amount_multiple ?? 3), floor = num(settings.large_amount_floor ?? 100000);
  for (const l of lines) {
    if (l.transfer) continue;
    const avg = num(avgs[l.key]);
    if (l.amount >= floor && (avg <= 0 || l.amount > avg * mult)) {
      warnings.push({ field: `${l.kind}.${l.key}`, code: "large", msg: avg > 0
        ? `${l.label}: ${fmt(l.amount)} is ${(l.amount / avg).toFixed(1)}× the 30-day daily average (${fmt(avg)}).`
        : `${l.label}: ${fmt(l.amount)} is unusually large.` });
    }
  }
  if (ov >= floor && num(avgs.order_value) > 0 && ov > num(avgs.order_value) * mult) {
    warnings.push({ field: "sales.order_value", code: "large", msg: `Sales of ${fmt(ov)} are ${(ov / num(avgs.order_value)).toFixed(1)}× the 30-day average.` });
  }
  // duplicates inside the form
  const seen = new Map();
  for (const l of lines.filter((x) => !x.transfer)) {
    const k = `${l.direction}|${l.category}|${r2(l.amount)}`;
    if (seen.has(k)) warnings.push({ field: `${l.kind}.${l.key}`, code: "dup_line", msg: `"${l.label}" and "${seen.get(k)}" have the same amount (${fmt(l.amount)}). Is one a duplicate?` });
    else seen.set(k, l.label);
  }
  // duplicates against the ledger (e.g. already imported or entered manually)
  for (const l of lines.filter((x) => !x.transfer)) {
    const hit = (ctx.ledgerSameDay || []).find((t) => t.direction === l.direction && Math.abs(num(t.amount) - l.amount) <= 1 && t.source !== "daily_update");
    if (hit) warnings.push({ field: `${l.kind}.${l.key}`, code: "dup_ledger", msg: `${l.label} ${fmt(l.amount)} matches a ${hit.source} transaction already in the ledger for this date.` });
  }

  // bank reconciliation per account
  const recon = [];
  const bankRows = p.bank?.accounts || [];
  for (const b of bankRows) {
    const acctLines = lines.filter((l) => l.account_id === b.account_id);
    const touched = acctLines.length > 0 || !isBlank(b.opening) || !isBlank(b.closing);
    if (!touched) continue;
    const prev = ctx.prevClosing?.[b.account_id];
    const opening = !isBlank(b.opening) ? num(b.opening) : prev ?? null;
    if (!isBlank(b.opening) && num(b.opening) < 0) warnings.push({ field: "bank", code: "overdraft", msg: `${acctName(b.account_id)} opening balance is negative (overdraft).` });
    if (isBlank(b.closing)) {
      if (p.sections?.bank || acctLines.length) errors.push({ field: `bank.${b.account_id}`, msg: `Enter the closing balance for ${acctName(b.account_id)}.` });
      continue;
    }
    if (opening === null) { errors.push({ field: `bank.${b.account_id}`, msg: `Enter the opening balance for ${acctName(b.account_id)} (no previous closing on record).` }); continue; }
    if (!isBlank(b.opening) && prev !== null && prev !== undefined && Math.abs(num(b.opening) - prev) > tol) {
      warnings.push({ field: `bank.${b.account_id}`, code: "opening_mismatch", msg: `${acctName(b.account_id)}: opening ${fmt(num(b.opening))} doesn't match the previous closing ${fmt(prev)}. Money moved that was never recorded?` });
    }
    const inflow = sum(acctLines.filter((l) => l.direction === "in"), (l) => l.amount);
    const outflow = sum(acctLines.filter((l) => l.direction === "out"), (l) => l.amount);
    const expected = r2(opening + inflow - outflow);
    const reported = num(b.closing);
    const difference = r2(reported - expected);
    recon.push({ account_id: b.account_id, name: acctName(b.account_id), opening: r2(opening), inflow: r2(inflow), outflow: r2(outflow), expected, reported, difference });
    if (Math.abs(difference) > tol) {
      warnings.push({ field: `bank.${b.account_id}`, code: "recon", amount: difference,
        msg: `${acctName(b.account_id)}: bank balance does not reconcile. Expected ${fmt(expected)} based on entered transactions, but closing is ${fmt(reported)} (${difference > 0 ? "+" : ""}${fmt(difference)}). Please review.` });
    }
  }
  for (const l of lines) {
    if (l.account_id && !bankRows.some((b) => b.account_id === l.account_id && !isBlank(b.closing))) {
      if (!errors.some((e) => e.field === `bank.${l.account_id}`)) {
        warnings.push({ field: `bank.${l.account_id}`, code: "no_balance", msg: `${acctName(l.account_id)} has transactions but no closing balance — it can't be reconciled.` });
      }
    }
  }

  // commitments
  for (const [i, po] of (p.commitments?.pos || []).entries()) {
    if (!po.supplier || !(num(po.total_value) > 0)) errors.push({ field: `commitments.pos.${i}`, msg: `New PO ${i + 1}: supplier and value are required.` });
    if (po.payment_terms === "custom") errors.push({ field: `commitments.pos.${i}`, msg: `New PO ${i + 1}: set custom installments from the Purchase Orders page instead.` });
  }
  for (const [i, e] of (p.commitments?.expenses || []).entries()) {
    if (!(num(e.amount) > 0) || !e.due_date || !e.category_code) errors.push({ field: `commitments.expenses.${i}`, msg: `Upcoming expense ${i + 1}: amount, category and due date are required.` });
  }

  // completeness
  const completeness = Object.fromEntries(SECTIONS.map((k) => [k, !!p.sections?.[k]]));
  const missing = SECTIONS.filter((k) => !completeness[k]);
  if (missing.length) warnings.push({ field: "sections", code: "incomplete", msg: `Not confirmed yet: ${missing.join(", ")}. The update will be marked PARTIAL.` });

  const totalDifference = r2(sum(recon, (r) => r.difference));
  return {
    errors, warnings, recon, totalDifference,
    reconOk: recon.every((r) => Math.abs(r.difference) <= tol),
    totals: {
      collections: r2(sum(lines.filter((l) => l.kind === "collection"), (l) => l.amount)),
      payments: r2(sum(lines.filter((l) => l.kind === "payment"), (l) => l.amount)),
      movementsIn: r2(sum(lines.filter((l) => l.kind === "movement" && l.direction === "in" && !l.transfer), (l) => l.amount)),
      movementsOut: r2(sum(lines.filter((l) => l.kind === "movement" && l.direction === "out" && !l.transfer), (l) => l.amount)),
      sales: r2(ov),
      netSales: r2(ov - num(s.cancellations) - num(s.refunds) - num(s.rto_value)),
    },
    completeness,
    status: missing.length ? "partial" : "submitted",
  };
}

/** GREEN / YELLOW / RED status of the daily update discipline. */
export function updateStatus(updates, today) {
  const yesterday = addDays(today, -1);
  const submitted = updates.filter((u) => u.status === "submitted" || u.status === "partial");
  const lastCompleted = submitted.filter((u) => u.status === "submitted").reduce((m, u) => maxDate(m, u.update_date), null);
  const lastAny = submitted.reduce((m, u) => maxDate(m, u.update_date), null);
  const y = updates.find((u) => u.update_date === yesterday);
  let status, message;
  if (y?.status === "submitted") { status = "green"; message = "Yesterday's finance update is complete."; }
  else if (y && (y.status === "partial" || y.status === "draft" || y.status === "reopened")) { status = "yellow"; message = "Yesterday's update is only partially complete."; }
  else { status = "red"; message = "Yesterday's financial data has not been updated."; }
  const first = updates.reduce((m, u) => minDate(m, u.update_date), null);
  const missing = [];
  if (first) for (let d = maxDate(first, addDays(today, -14)); d <= yesterday; d = addDays(d, 1)) {
    const u = updates.find((x) => x.update_date === d);
    if (!u || !["submitted", "partial"].includes(u.status)) missing.push(d);
  }
  return { status, message, yesterday, lastCompleted, lastAny, missing };
}

// ─── bank reconciliation matching ────────────────────────────────────────
const tokens = (s) => new Set(String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
/**
 * Greedy one-to-one matching of bank statement lines to ledger cash txns:
 * same account + direction, amount within ₹0.50, date within ±window days.
 */
export function matchBankLines(bankLines, ledgerTxns, { window = 3 } = {}) {
  const cand = [];
  for (const b of bankLines) {
    for (const t of ledgerTxns) {
      if (t.bank_account_id !== b.bank_account_id || t.direction !== b.direction) continue;
      if (Math.abs(num(t.amount) - num(b.amount)) > 0.5) continue;
      const dd = Math.abs(diffDays(t.txn_date, b.txn_date));
      if (dd > window) continue;
      const bt = tokens(b.description + " " + (b.reference || ""));
      const tt = tokens((t.description || "") + " " + (t.source_ref || "") + " " + (t.party_name || ""));
      let overlap = 0; for (const w of bt) if (tt.has(w)) overlap++;
      cand.push({ bank_id: b.id, txn_id: t.id, score: 100 - dd * 15 + Math.min(20, overlap * 5), dayDiff: dd });
    }
  }
  cand.sort((a, b) => b.score - a.score);
  const usedB = new Set(), usedT = new Set(), matches = [];
  for (const c of cand) {
    if (usedB.has(c.bank_id) || usedT.has(c.txn_id)) continue;
    usedB.add(c.bank_id); usedT.add(c.txn_id); matches.push(c);
  }
  return matches;
}

// ─── inventory working capital ───────────────────────────────────────────
/**
 * skus: [{id, sku, product, category, cost_per_unit, selling_price, units_on_hand, units_wip, units_incoming, last_sale_date, launched_on}]
 * unitsSold: {sku_id: {d30, d90}}
 */
export function inventoryAnalytics(skus, unitsSold, asOf, settings = {}, cogs30 = 0) {
  const slowDays = num(settings.slow_moving_days ?? 90), deadDays = num(settings.dead_stock_days ?? 90);
  const rows = skus.filter((s) => s.active !== false).map((s) => {
    const oh = num(s.units_on_hand), cost = num(s.cost_per_unit);
    const sold30 = num(unitsSold[s.id]?.d30), sold90 = num(unitsSold[s.id]?.d90);
    const rate = sold90 > 0 ? (sold30 > 0 ? sold30 / 30 : sold90 / 90) : 0;
    const cover = rate > 0 ? oh / rate : oh > 0 ? Infinity : 0;
    const lastSale = s.last_sale_date;
    const ageRef = lastSale || s.launched_on;
    let status;
    if (oh <= 0) status = "out";
    else if ((!lastSale || diffDays(asOf, lastSale) > deadDays) && (!ageRef || diffDays(asOf, ageRef) > deadDays)) status = "dead";
    else if (cover > slowDays) status = "slow";
    else status = "healthy";
    return { ...s, units_on_hand: oh, value: r2(oh * cost), retail_value: r2(oh * num(s.selling_price)),
      wip_value: r2(num(s.units_wip) * cost), incoming_value: r2(num(s.units_incoming) * cost),
      sold30, sold90, daily_rate: r2(rate), cover_days: Number.isFinite(cover) ? Math.round(cover) : null, status };
  });
  const value = sum(rows, (r) => r.value);
  const dailyCogs = num(cogs30) / 30;
  const byStatus = (st) => rows.filter((r) => r.status === st);
  return {
    rows: rows.sort((a, b) => b.value - a.value),
    totals: {
      units: sum(rows, (r) => r.units_on_hand), value: r2(value), retail_value: r2(sum(rows, (r) => r.retail_value)),
      wip_value: r2(sum(rows, (r) => r.wip_value)), incoming_value: r2(sum(rows, (r) => r.incoming_value)),
      slow_value: r2(sum(byStatus("slow"), (r) => r.value)), slow_count: byStatus("slow").length,
      dead_value: r2(sum(byStatus("dead"), (r) => r.value)), dead_count: byStatus("dead").length,
      out_count: byStatus("out").length,
      coverage_days: dailyCogs > 0 ? Math.round(value / dailyCogs) : null,
    },
    topCashConsumers: rows.filter((r) => r.value > 0).slice(0, 10),
  };
}

// ─── working capital, CCC, profit vs cash ────────────────────────────────
export function cashConversionCycle({ inventory, receivables, payables, netSales30, cogs30 }) {
  const dailyCogs = num(cogs30) / 30, dailySales = num(netSales30) / 30;
  const dio = dailyCogs > 0 ? num(inventory) / dailyCogs : null;
  const dso = dailySales > 0 ? num(receivables) / dailySales : null;
  const dpo = dailyCogs > 0 ? num(payables) / dailyCogs : null;
  const ccc = dio !== null && dso !== null && dpo !== null ? dio + dso - dpo : null;
  const f = (x) => (x === null ? null : Math.round(x * 10) / 10);
  return { dio: f(dio), dso: f(dso), dpo: f(dpo), ccc: f(ccc) };
}

/**
 * Where cash is locked + what-if levers.
 * levers = { inventoryReductionPct, collectFasterDays, supplierCreditDays }
 */
export function workingCapital(x, levers = {}) {
  const inventory = num(x.inventory), receivables = num(x.receivables), advances = num(x.supplierAdvances), payables = num(x.payables);
  const locked = inventory + receivables + advances;
  const invPct = num(levers.inventoryReductionPct ?? 15), fasterDays = num(levers.collectFasterDays ?? 7), creditDays = num(levers.supplierCreditDays ?? 15);
  const dailySales = num(x.netSales30) / 30;
  const dailyPurchases = (num(x.purchases30) > 0 ? num(x.purchases30) : num(x.cogs30)) / 30;
  const releaseInv = inventory * invPct / 100;
  const releaseRec = Math.min(receivables, dailySales * fasterDays);
  const releasePay = dailyPurchases * creditDays;
  return {
    inventory: r2(inventory), receivables: r2(receivables), supplierAdvances: r2(advances), payables: r2(payables),
    locked: r2(locked), netWorkingCapital: r2(locked - payables),
    levers: [
      { key: "inventory", label: `Reduce inventory by ${invPct}%`, release: r2(releaseInv) },
      { key: "receivables", label: `Collect receivables ${fasterDays} days faster`, release: r2(releaseRec) },
      { key: "payables", label: `Get ${creditDays} more days of supplier credit`, release: r2(releasePay) },
    ],
    totalRelease: r2(releaseInv + releaseRec + releasePay),
  };
}

/**
 * Indirect cash-flow bridge: why profit ≠ cash.
 * Every line is explicit; any residual vs the bank is shown, never hidden.
 */
export function profitToCashBridge(b) {
  const lines = [];
  const add = (key, label, amount, help) => lines.push({ key, label, amount: r2(amount), help });
  add("net_profit", "Net profit (MIS)", num(b.netProfit), "From the P&L for the period.");
  if (b.invOpen !== null && b.invClose !== null) add("inventory", "Change in inventory", -(num(b.invClose) - num(b.invOpen)), "More stock = cash turned into goods.");
  if (b.recOpen !== null && b.recClose !== null) add("receivables", "Change in receivables", -(num(b.recClose) - num(b.recOpen)), "Sales not yet collected.");
  if (b.advOpen !== null && b.advClose !== null) add("advances", "Change in supplier advances", -(num(b.advClose) - num(b.advOpen)), "Paid to suppliers before goods arrived.");
  if (b.payOpen !== null && b.payClose !== null) add("payables", "Change in payables", num(b.payClose) - num(b.payOpen), "Bills not yet paid keep cash in the bank.");
  add("gst", "GST collected vs paid", num(b.gstAccrued) - num(b.taxPaid), "GST in sales belongs to the government until paid.");
  const ocf = sum(lines, (l) => l.amount);
  add("financing", "Loans, EMI, capital & drawings", num(b.financingNet), "Non-operating cash movements.");
  const derived = ocf + num(b.financingNet);
  const actual = num(b.actualNetCash);
  return {
    lines, operatingCashFlow: r2(ocf), derivedNetCash: r2(derived), actualNetCash: r2(actual),
    unexplained: r2(actual - derived),
    missing: [b.invOpen === null || b.invClose === null ? "inventory snapshot" : null, b.recOpen === null ? "receivables snapshot" : null].filter(Boolean),
  };
}

/**
 * Monthly MIS / P&L. Revenue accruals are GST-inclusive and stripped here.
 * Expenses = accrual rows (bills) + cash paid that did not settle a bill.
 */
export function computePnl({ month, accruals = [], cashOut = [], settledTxnIds = new Set(), dailySales = [], categories = {}, adjustments = [], settings = {} }) {
  const inMonth = (d) => d && d.slice(0, 7) === month;
  const gst = 1 + num(settings.gst_rate_pct ?? 5) / 100;
  const cls = (code) => categories[code]?.pnl_class || "opex";
  const lines = { revenue: 0, cogs: 0, marketing: 0, shipping: 0, salaries: 0, opex: 0, finance_cost: 0, other: 0 };
  const detail = {};
  const addD = (line, code, amt) => { detail[line] = detail[line] || {}; detail[line][code] = r2((detail[line][code] || 0) + amt); };
  for (const t of accruals) {
    if (t.status === "void" || !inMonth(t.txn_date)) continue;
    const c = cls(t.category_code);
    const sign = t.direction === "in" ? 1 : -1;
    if (c === "revenue") { const v = (sign * num(t.amount)) / gst; lines.revenue += v; addD("revenue", t.category_code, v); }
    else if (c in lines && t.direction === "out") { lines[c] += num(t.amount); addD(c, t.category_code, num(t.amount)); }
  }
  for (const t of cashOut) {
    if (t.status === "void" || t.direction !== "out" || !inMonth(t.txn_date) || settledTxnIds.has(t.id)) continue;
    const c = cls(t.category_code);
    if (["marketing", "shipping", "salaries", "opex", "finance_cost", "cogs"].includes(c)) { lines[c] += num(t.amount); addD(c, t.category_code, num(t.amount)); }
  }
  for (const t of cashOut) { // other income received in cash
    if (t.status === "void" || t.direction !== "in" || !inMonth(t.txn_date)) continue;
    if (t.category_code === "income_other") { lines.other += num(t.amount); addD("other", t.category_code, num(t.amount)); }
  }
  const cogsPct = num(settings.default_cogs_pct ?? 38) / 100;
  let cogsEstimated = false;
  for (const s of dailySales) {
    if (s.status === "void" || !inMonth(s.sale_date)) continue;
    if (s.cogs !== null && s.cogs !== undefined && s.cogs !== "") lines.cogs += num(s.cogs);
    else { lines.cogs += (num(s.net_sales ?? (num(s.order_value) - num(s.cancellations) - num(s.refunds) - num(s.rto_value))) / gst) * cogsPct; cogsEstimated = true; }
  }
  for (const a of adjustments) if (inMonth(a.month)) { lines[a.line] = (lines[a.line] || 0) + num(a.amount); addD(a.line, "adjustment", num(a.amount)); }
  const gross = lines.revenue - lines.cogs;
  const opexTotal = lines.marketing + lines.shipping + lines.salaries + lines.opex + lines.finance_cost;
  const net = gross - opexTotal + lines.other;
  const o = Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, r2(v)]));
  return { month, ...o, grossProfit: r2(gross), grossMargin: lines.revenue ? r2((gross / lines.revenue) * 100) : null,
    operatingExpenses: r2(opexTotal), netProfit: r2(net), netMargin: lines.revenue ? r2((net / lines.revenue) * 100) : null,
    cogsEstimated, detail };
}

// ─── alerts ──────────────────────────────────────────────────────────────
/**
 * ctx = { base (forecast), worst, supplierDue14, codOverdue, receivablesOverdue, payablesOverdue,
 *         inventoryGrowthPct, salesGrowthPct, coverageDays, marketingActual, marketingForecast,
 *         collectionsActual, collectionsForecast, updateStatus, reconDifference }
 * rules = [{code, enabled, threshold, severity}]
 */
export function evaluateAlerts(ctx, rules) {
  const R = Object.fromEntries((rules || []).map((r) => [r.code, r]));
  const on = (c) => R[c] && R[c].enabled !== false;
  const th = (c, d) => (R[c]?.threshold === null || R[c]?.threshold === undefined ? d : num(R[c].threshold));
  const sev = (c, d) => R[c]?.severity || d;
  const out = [];
  const add = (code, severity, message, amount) => out.push({ code, severity: sev(code, severity), message, amount: amount === undefined ? null : r2(amount) });
  const b = ctx.base;
  if (b && on("cash_negative") && b.runOutWeek) add("cash_negative", "high", `Cash runs out in Week ${b.runOutWeek} (${b.weeks[b.runOutWeek - 1].start}) if nothing changes.`, b.weeks[b.runOutWeek - 1].closing);
  if (b && on("below_min_reserve") && b.firstBelowMinWeek) {
    const w = b.weeks[b.firstBelowMinWeek - 1];
    add("below_min_reserve", "high", `Projected cash falls below minimum reserve in Week ${w.index} (${formatINR(w.closing)} vs ${formatINR(w.minRequired)} required).`, w.surplus);
  } else if (ctx.worst && on("below_min_reserve") && ctx.worst.firstBelowMinWeek) {
    const w = ctx.worst.weeks[ctx.worst.firstBelowMinWeek - 1];
    add("below_min_reserve", "medium", `In the WORST case, cash falls below the minimum reserve in Week ${w.index}.`, w.surplus);
  }
  if (on("supplier_due_14d") && num(ctx.supplierDue14) > th("supplier_due_14d", 500000)) add("supplier_due_14d", "high", `${formatINR(ctx.supplierDue14)} supplier payments due within the next 14 days.`, ctx.supplierDue14);
  if (on("cod_overdue") && num(ctx.codOverdue) > th("cod_overdue", 100000)) add("cod_overdue", "high", `${formatINR(ctx.codOverdue)} COD settlements are overdue.`, ctx.codOverdue);
  if (on("receivables_overdue") && num(ctx.receivablesOverdue) > th("receivables_overdue", 200000)) add("receivables_overdue", "medium", `${formatINR(ctx.receivablesOverdue)} of receivables are past their expected date.`, ctx.receivablesOverdue);
  if (on("payables_overdue") && num(ctx.payablesOverdue) > th("payables_overdue", 100000)) add("payables_overdue", "medium", `${formatINR(ctx.payablesOverdue)} of bills are overdue.`, ctx.payablesOverdue);
  if (on("inventory_vs_sales") && ctx.inventoryGrowthPct !== null && ctx.inventoryGrowthPct !== undefined && ctx.salesGrowthPct !== null && ctx.salesGrowthPct !== undefined &&
      ctx.inventoryGrowthPct - ctx.salesGrowthPct >= th("inventory_vs_sales", 20)) {
    add("inventory_vs_sales", "high", `Inventory has increased ${Math.round(ctx.inventoryGrowthPct)}% while sales changed ${Math.round(ctx.salesGrowthPct)}% (30 days).`);
  }
  if (on("inventory_coverage") && ctx.coverageDays && ctx.coverageDays > th("inventory_coverage", 75)) add("inventory_coverage", "high", `Inventory coverage has crossed ${th("inventory_coverage", 75)} days (now ${ctx.coverageDays} days).`, ctx.coverageDays);
  if (on("marketing_over_forecast") && num(ctx.marketingForecast) > 0) {
    const over = (num(ctx.marketingActual) / num(ctx.marketingForecast) - 1) * 100;
    if (over >= th("marketing_over_forecast", 20) - 1e-9) add("marketing_over_forecast", "medium", `Marketing cash outflow is ${Math.round(over)}% above forecast last week.`, num(ctx.marketingActual) - num(ctx.marketingForecast));
  }
  if (on("collections_below_forecast") && num(ctx.collectionsForecast) > 0) {
    const under = (1 - num(ctx.collectionsActual) / num(ctx.collectionsForecast)) * 100;
    if (under >= th("collections_below_forecast", 15) - 1e-9) add("collections_below_forecast", "medium", `Actual cash collections were ${Math.round(under)}% below forecast last week.`, num(ctx.collectionsActual) - num(ctx.collectionsForecast));
  }
  if (on("daily_update_missing") && ctx.updateStatus?.status === "red") add("daily_update_missing", "high", "Yesterday's financial data has not been updated.");
  if (on("bank_recon_difference") && Math.abs(num(ctx.reconDifference)) > th("bank_recon_difference", 1)) add("bank_recon_difference", "high", `Bank balances differ from the ledger by ${formatINR(ctx.reconDifference)}. Reconcile before relying on the numbers.`, ctx.reconDifference);
  const order = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b2) => order[a.severity] - order[b2.severity]);
}

// ─── formatting (shared by UI + messages) ────────────────────────────────
/** ₹ in Indian grouping, with L / Cr compaction when `compact`. */
export function formatINR(n, { compact = false, decimals } = {}) {
  const v = Number(n) || 0;
  const neg = v < 0, a = Math.abs(v);
  let s;
  if (compact && a >= 1e7) s = `₹${(a / 1e7).toFixed(decimals ?? 2)}Cr`;
  else if (compact && a >= 1e5) s = `₹${(a / 1e5).toFixed(decimals ?? 2)}L`;
  else if (compact && a >= 1e3) s = `₹${(a / 1e3).toFixed(decimals ?? 1)}K`;
  else s = "₹" + a.toLocaleString("en-IN", { maximumFractionDigits: decimals ?? 0, minimumFractionDigits: decimals ?? 0 });
  return (neg ? "−" : "") + s;
}
