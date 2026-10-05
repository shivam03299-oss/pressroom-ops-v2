// Realistic Hashway demo data — loaded ONLY into the 'demo' book.
//
// Deterministic for a given asOf (seeded PRNG) so tests are repeatable.
// The generator does NOT write rows directly for daily activity: it emits
// the same 10 AM payloads a person would type, and the loader posts them
// through the real daily-update pipeline (validation → ledger → receivables
// → allocations → bank balances). Demo data therefore exercises the
// production code paths end-to-end.
//
// Built-in story (so every screen has something to show):
//   • Profitable but cash-poor: ~₹18L/month sales, heavy production spend.
//   • ₹14.4L winter PO on 30/40/30 terms, last 30% due in ~10 days.
//   • Summer restock PO: advance only part-paid (partial payment, overdue).
//   • Fabric PO balance part-paid and overdue.
//   • COD remitted twice a week, ~24% RTO; B2B invoice overdue.
//   • A day where the bank closed ₹2,350 lower than the entries (bank
//     charges) — flagged, explained, and visible in reconciliation.
//   • Two late submissions, one partial day, and yesterday MISSING (RED).

import { addDays, isoWeekday, r2, hashString, monthKey, emptyDailyPayload } from "./_cash-engine.js";

function rng(seedStr) {
  let a = parseInt(hashString(seedStr).slice(-8), 16) >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PRODUCTS = [
  { code: "TEE", name: "Oversized Tee", cat: "T-shirts", cost: 290, price: 899, w: 9, colors: ["Black", "Off-White"] },
  { code: "HVY", name: "Heavyweight Tee", cat: "T-shirts", cost: 380, price: 1199, w: 7, colors: ["Washed Black", "Olive"] },
  { code: "HOOD", name: "Boxy Hoodie", cat: "Hoodies", cost: 760, price: 2199, w: 4, colors: ["Charcoal", "Forest"] },
  { code: "SWT", name: "Crew Sweatshirt", cat: "Sweatshirts", cost: 590, price: 1699, w: 3, colors: ["Grey Melange"] },
  { code: "CRG", name: "Parachute Cargo", cat: "Bottoms", cost: 640, price: 1899, w: 4, colors: ["Black", "Khaki"] },
  { code: "SHRT", name: "Relaxed Shorts", cat: "Bottoms", cost: 330, price: 999, w: 3, colors: ["Black"] },
  { code: "JOG", name: "Fleece Jogger", cat: "Bottoms", cost: 520, price: 1499, w: 0.25, colors: ["Navy"] },
  { code: "JKT", name: "Corduroy Jacket", cat: "Outerwear", cost: 1250, price: 3499, w: 0, colors: ["Rust"] },
];
const SIZES = ["S", "M", "L", "XL"];

export function generateDemo(asOf) {
  const rand = rng("hashway-demo-" + asOf);
  const between = (a, b) => a + (b - a) * rand();
  const HIST = 95;
  const start = addDays(asOf, -HIST);
  const yesterday = addDays(asOf, -1);
  const A = (k) => "acct:" + k;

  // ─── master data ──────────────────────────────────────────────────────
  const accounts = [
    { key: "hdfc", name: "HDFC Current ••4521", bank_name: "HDFC Bank", account_last4: "4521", kind: "bank", opening_balance: 2450000, opening_date: start, restricted_amount: 200000, is_primary: true },
    { key: "icici", name: "ICICI Current ••0917", bank_name: "ICICI Bank", account_last4: "0917", kind: "bank", opening_balance: 320000, opening_date: start, restricted_amount: 0, is_primary: false },
    { key: "cash", name: "Petty cash (office)", bank_name: null, account_last4: null, kind: "cash", opening_balance: 40000, opening_date: start, restricted_amount: 0, is_primary: false },
  ];
  const parties = [
    { name: "Kanha Knits (Tiruppur)", kind: "supplier", payment_terms_days: 0, gstin: "33AAKFK1234F1Z5" },
    { name: "Shree Fabrics", kind: "supplier", payment_terms_days: 15 },
    { name: "Sharma Embroidery Works", kind: "supplier", payment_terms_days: 0 },
    { name: "PackRight Packaging", kind: "supplier", payment_terms_days: 30 },
    { name: "Laxmi Labels & Trims", kind: "supplier", payment_terms_days: 15 },
    { name: "Studio Nine Productions", kind: "supplier", payment_terms_days: 15 },
    { name: "Delhivery", kind: "courier", payment_terms_days: 7 },
    { name: "Meta Platforms", kind: "other" },
    { name: "Rohini Landlord", kind: "landlord" },
    { name: "Urban Threads Wholesale", kind: "customer", payment_terms_days: 30 },
    { name: "Myntra", kind: "platform", payment_terms_days: 30 },
    { name: "Income Tax Dept (TDS)", kind: "government" },
    { name: "Arora & Co, CA", kind: "supplier", payment_terms_days: 15 },
  ];
  const recurring = [
    { name: "Salaries", category_code: "ops_salaries", amount: 340000, frequency: "monthly", day_of_month: 1, start_date: start, is_critical: true },
    { name: "Office & warehouse rent", category_code: "ops_rent", amount: 85000, frequency: "monthly", day_of_month: 5, start_date: start, is_critical: true, party: "Rohini Landlord" },
    { name: "Business loan EMI", category_code: "fin_emi", amount: 62000, frequency: "monthly", day_of_month: 10, start_date: start, is_critical: true },
    { name: "Shopify + apps", category_code: "ops_software", amount: 18500, frequency: "monthly", day_of_month: 3, start_date: start },
    { name: "Accountant retainer", category_code: "ops_accounting", amount: 15000, frequency: "monthly", day_of_month: 7, start_date: start, party: "Arora & Co, CA" },
    { name: "Electricity", category_code: "ops_utilities", amount: 9500, frequency: "monthly", day_of_month: 12, start_date: start, is_critical: true },
  ];

  const skus = [];
  for (const p of PRODUCTS) for (const c of p.colors) for (const s of SIZES) {
    skus.push({ sku: `${p.code}-${c.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()}-${s}`, product: `${p.name} — ${c}`, category: p.cat,
      cost_per_unit: p.cost, selling_price: p.price, units_wip: 0, units_incoming: 0, launched_on: addDays(start, -120), w: p.w * (s === "M" || s === "L" ? 1.4 : 0.8), code: p.code });
  }
  // winter drop in production
  skus.filter((k) => k.code === "HOOD" || k.code === "SWT").forEach((k) => (k.units_wip = 120));
  const movements = [];
  for (const k of skus) movements.push({ sku: k.sku, date: addDays(start, -15), kind: "opening", qty: k.code === "JKT" ? 55 : k.code === "JOG" ? 160 : Math.round(between(110, 190)), unit_cost: k.cost_per_unit, ref: "Opening stock count" });
  const receive = (code, units, date, ref) => skus.filter((k) => k.code === code).forEach((k) => movements.push({ sku: k.sku, date, kind: "receipt", qty: Math.round(units / skus.filter((x) => x.code === code).length), unit_cost: k.cost_per_unit, ref }));
  receive("TEE", 1200, addDays(asOf, -58), "PO-0006");
  receive("SHRT", 500, addDays(asOf, -58), "PO-0006");
  receive("HVY", 1420, addDays(asOf, -22), "PO-0007");

  // ─── purchase orders ──────────────────────────────────────────────────
  const D = (n) => addDays(asOf, n);
  const pos = [
    { po_number: "PO-0006", supplier: "Kanha Knits (Tiruppur)", item_desc: "Core tees & shorts restock (1,700 pcs)", category_code: "prod_manufacturing", total_value: 513000,
      order_date: D(-78), expected_delivery_date: D(-58), payment_terms: "50_50", receive: { value: 513000, status: "received" } },
    { po_number: "PO-0007", supplier: "Kanha Knits (Tiruppur)", item_desc: "Autumn heavyweight tees (1,420 pcs)", category_code: "prod_manufacturing", total_value: 539600,
      order_date: D(-50), expected_delivery_date: D(-22), payment_terms: "50_50", sku: "HVY-WAS-M", receive: { value: 539600, status: "received" } },
    { po_number: "PO-0001", supplier: "Kanha Knits (Tiruppur)", item_desc: "Winter drop — hoodies & sweatshirts (1,800 pcs)", category_code: "prod_manufacturing", total_value: 1440000,
      order_date: D(-70), expected_delivery_date: D(10), payment_terms: "30_40_30" },
    { po_number: "PO-0002", supplier: "Shree Fabrics", item_desc: "French terry fabric 2,400 m", category_code: "prod_fabric", total_value: 320000,
      order_date: D(-50), expected_delivery_date: D(-20), payment_terms: "50_50", receive: { value: 320000, status: "received" } },
    { po_number: "PO-0003", supplier: "Sharma Embroidery Works", item_desc: "Chest embroidery for winter drop", category_code: "prod_embroidery", total_value: 185000,
      order_date: D(-15), expected_delivery_date: D(12), payment_terms: "100_advance" },
    { po_number: "PO-0004", supplier: "Kanha Knits (Tiruppur)", item_desc: "Summer core basics restock (2,600 pcs)", category_code: "prod_manufacturing", total_value: 960000,
      order_date: D(-6), expected_delivery_date: D(24), payment_terms: "50_50" },
    { po_number: "PO-0005", supplier: "PackRight Packaging", item_desc: "Mailer bags & boxes — Q4", category_code: "prod_packaging", total_value: 120000,
      order_date: D(-20), expected_delivery_date: D(-18), payment_terms: "custom",
      installments: [{ label: "1st", amount: 40000, due_date: D(-20) }, { label: "2nd", amount: 40000, due_date: D(10) }, { label: "3rd", amount: 40000, due_date: D(40) }],
      receive: { value: 120000, status: "received" } },
  ];
  // planned installment payments (po_number, seq, date offset, amount)
  const poPays = [
    ["PO-0006", 1, -78, 256500], ["PO-0006", 2, -57, 256500], ["PO-0001", 1, -70, 432000], ["PO-0007", 1, -50, 269800],
    ["PO-0002", 1, -50, 160000], ["PO-0001", 2, -31, 576000], ["PO-0007", 2, -22, 269800], ["PO-0005", 1, -20, 40000],
    ["PO-0002", 2, -17, 60000], ["PO-0003", 1, -15, 185000], ["PO-0004", 1, -5, 200000],
  ];

  // ─── open documents created up-front ──────────────────────────────────
  const payables = [
    { party: "Studio Nine Productions", category_code: "mkt_shoots", reference: "SN/24-25/118", description: "Winter campaign shoot", bill_date: D(-8), amount: 120000, due_date: D(12), priority: "normal" },
    { party: "Studio Nine Productions", category_code: "mkt_influencer", reference: "INF-OCT", description: "Influencer batch — October", bill_date: D(-3), amount: 75000, due_date: D(5), priority: "high" },
    { party: "Arora & Co, CA", category_code: "ops_accounting", reference: "AC/AUDIT/26", description: "Annual audit fee", bill_date: D(-12), amount: 45000, due_date: D(20), priority: "normal" },
    { party: "Laxmi Labels & Trims", category_code: "prod_labels", reference: "LLT-2291", description: "Woven labels & hang tags", bill_date: D(-25), amount: 38000, due_date: D(-4), priority: "high" },
    { party: "Income Tax Dept (TDS)", category_code: "tax_tds", reference: "TDS-SEP", description: "TDS for September", bill_date: D(-4), amount: 28000, due_date: D(3), priority: "critical" },
  ];
  const receivables = [
    { kind: "b2b", channel_code: "b2b", party: "Urban Threads Wholesale", reference: "INV-2026-031", origin_date: D(-40), gross_amount: 240000, net_amount: 240000, expected_date: D(-10), confidence: "confirmed", note: "Followed up twice" },
    { kind: "b2b", channel_code: "b2b", party: "Urban Threads Wholesale", reference: "INV-2026-036", origin_date: D(-12), gross_amount: 110000, net_amount: 110000, expected_date: D(18), confidence: "confirmed" },
    { kind: "marketplace", channel_code: "myntra", party: "Myntra", reference: "Myntra settlement — Aug W4", origin_date: D(-44), gross_amount: 198000, fees: 55440, net_amount: 142560, expected_date: D(-9), confidence: "probable" },
    { kind: "marketplace", channel_code: "myntra", party: "Myntra", reference: "Myntra settlement — Sep W2", origin_date: D(-25), gross_amount: 176000, fees: 49280, net_amount: 126720, expected_date: D(5), confidence: "probable" },
    { kind: "marketplace", channel_code: "myntra", party: "Myntra", reference: "Myntra settlement — Sep W4", origin_date: D(-11), gross_amount: 214000, fees: 59920, net_amount: 154080, expected_date: D(19), confidence: "probable" },
  ];
  const expected = [
    { direction: "in", amount: 150000, txn_date: D(21), category_code: "collect_b2b", confidence: "possible", description: "Diwali bulk order advance — Urban Threads (verbal)" },
    { direction: "in", amount: 60000, txn_date: D(45), category_code: "income_other", confidence: "possible", description: "GST refund claim (inverted duty)" },
    { direction: "out", amount: 25000, txn_date: D(30), category_code: "ops_legal", confidence: "confirmed", description: "Trademark registration — class 25" },
  ];

  // ─── simulate the days ────────────────────────────────────────────────
  const bal = { hdfc: 2450000, icici: 320000, cash: 40000 };
  const reported = { ...bal };       // what the bank says (diverges after the charge)
  const codQueue = [];               // [{date, amount}] COD order value awaiting remittance
  const gwQueue = [];                // [{date, amount}] prepaid awaiting settlement
  const salesByMonth = {};
  const days = [];
  const skuW = skus.map((k) => k.w);
  const wSum = skuW.reduce((a, b) => a + b, 0);
  let lastWeekSales = 0, weekSales = 0;
  const chargeDay = D(-9);

  for (let d = start; d <= addDays(asOf, -2); d = addDays(d, 1)) {
    const wd = isoWeekday(d);
    const p = emptyDailyPayload(d, accounts.map((a) => ({ id: A(a.key), is_primary: a.is_primary, active: true })));
    const opening = { ...reported };
    const flow = { hdfc: 0, icici: 0, cash: 0 };
    const pay = (key, amount, acct = "hdfc", extra = {}) => {
      const row = p.payments.find((x) => x.key === key);
      if (row.amount !== "") { // second payment under the same key that day → add a line
        p.payments.push({ ...row, amount: r2(amount), account_id: A(acct), ...extra });
      } else Object.assign(row, { amount: r2(amount), account_id: A(acct), ...extra });
      flow[acct] -= amount;
    };
    const collect = (key, amount, acct = "hdfc") => { const row = p.collections.find((x) => x.key === key); row.amount = r2(num(row.amount) + amount); row.account_id = A(acct); flow[acct] += amount; };

    // sales
    const dayIdx = HIST + (d < asOf ? -Math.round((Date.parse(asOf) - Date.parse(d)) / 86400000) : 0);
    const season = (wd >= 6 ? 1.22 : wd === 1 ? 0.92 : 1) * (1 + 0.0015 * dayIdx);
    const orderValue = Math.round(58000 * season * between(0.75, 1.28));
    const orders = Math.max(1, Math.round(orderValue / between(1350, 1550)));
    const prepaid = Math.round(orderValue * between(0.5, 0.6));
    const cod = orderValue - prepaid;
    const cancellations = Math.round(cod * between(0.01, 0.05));
    const refunds = Math.round(prepaid * between(0.0, 0.05));
    const codOld = codQueue.filter((x) => x.date === addDays(d, -12)).reduce((s, x) => s + x.amount, 0);
    const rto = Math.round(codOld * between(0.18, 0.3));
    Object.assign(p.sales, { order_value: orderValue, orders, prepaid_sales: prepaid, cod_sales: cod, discounts: Math.round(orderValue * between(0.06, 0.1)),
      cancellations, refunds, rto_value: rto, units_sold: Math.round(orders * 1.3) });
    codQueue.push({ date: d, amount: (cod - cancellations), rtoRate: codOld ? rto / codOld : 0.24 });
    gwQueue.push({ date: d, amount: prepaid });
    salesByMonth[monthKey(d)] = (salesByMonth[monthKey(d)] || 0) + (orderValue - cancellations - refunds - rto);
    weekSales += orderValue;
    if (wd === 7) { lastWeekSales = weekSales; weekSales = 0; }

    // inventory sale movements
    const units = Math.round(orders * 1.3);
    const inventorySales = [];
    let cogs = 0;
    for (let u = 0; u < units; u++) {
      let x = rand() * wSum, i = 0;
      while (x > skuW[i]) { x -= skuW[i]; i++; }
      const k = skus[Math.min(i, skus.length - 1)];
      const cur = inventorySales.find((m) => m.sku === k.sku);
      if (cur) cur.qty++; else inventorySales.push({ sku: k.sku, qty: 1 });
      cogs += k.cost_per_unit;
    }

    // collections — Razorpay settles weekdays (T+2, weekend batched to Monday)
    if (wd <= 5) {
      const due = gwQueue.filter((x) => !x.done && x.date <= addDays(d, -2));
      const amt = due.reduce((s, x) => s + x.amount, 0) * 0.98;
      due.forEach((x) => (x.done = true));
      if (amt > 0) collect("razorpay", Math.round(amt));
    }
    // Delhivery remits Tue & Fri for COD older than 9 days, net of RTO and 1.5%
    if (wd === 2 || wd === 5) {
      const due = codQueue.filter((x) => !x.done && x.date <= addDays(d, -9));
      const amt = due.reduce((s, x) => s + x.amount * (1 - 0.24), 0) * 0.985;
      due.forEach((x) => (x.done = true));
      if (amt > 0) collect("delhivery_cod", Math.round(amt));
    }
    // Myntra pays on the 10th; B2B part-payment once
    if (d.slice(8) === "10") collect("marketplace", Math.round(between(120000, 165000)), "icici");
    if (d === D(-26)) collect("b2b", 100000, "icici");

    // payments
    pay("advertising", Math.round(orderValue * between(0.22, 0.3)), "hdfc", { party_name: "Meta Platforms" });
    if (refunds > 0) pay("refunds", refunds);
    if (wd === 1 && lastWeekSales) pay("logistics", Math.round(lastWeekSales * 0.075), "hdfc", { party_name: "Delhivery" });
    if (d.slice(8) === "01") pay("salaries", 340000);
    if (d.slice(8) === "03") pay("software", 18500);
    if (d.slice(8) === "05") pay("rent", 85000, "hdfc", { party_name: "Rohini Landlord" });
    if (d.slice(8) === "07") pay("other_out", 15000, "hdfc", { category_code: "ops_accounting", party_name: "Arora & Co, CA" });
    if (d.slice(8) === "10") pay("emi", 62000);
    if (d.slice(8) === "12") pay("other_out", 9500, "icici", { category_code: "ops_utilities" });
    if (d.slice(8) === "20") {
      const prev = salesByMonth[monthKey(addDays(d.slice(0, 8) + "01", -1))] || 0;
      if (prev > 0) pay("gst", Math.round(prev * 0.035));
    }
    if ((dayIdx % 14) === 3) pay("packaging", Math.round(between(22000, 30000)), "hdfc", { party_name: "PackRight Packaging" });
    if (wd === 6) pay("other_out", 3000, "cash", { category_code: "ops_office", note: "Office supplies, tea, courier" });
    for (const [po, seq, off, amt] of poPays) if (D(off) === d) {
      const cat = pos.find((x) => x.po_number === po).category_code;
      pay(cat === "prod_fabric" ? "fabric" : cat === "prod_packaging" ? "packaging" : "manufacturing", amt, "hdfc",
        { category_code: cat, party_name: pos.find((x) => x.po_number === po).supplier, link: { po_number: po, seq } });
    }
    // monthly top-up of petty cash
    if (d.slice(8) === "02") { p.bank.movements.push({ account_id: A("hdfc"), to_account_id: A("cash"), category_code: "transfer", direction: "out", amount: 15000, note: "Petty cash top-up" }); flow.hdfc -= 15000; flow.cash += 15000; }

    // bank balances
    for (const k of Object.keys(bal)) { bal[k] = r2(bal[k] + flow[k]); reported[k] = r2(reported[k] + flow[k]); }
    let recon_note = null;
    if (d === chargeDay) { reported.hdfc = r2(reported.hdfc - 2350); recon_note = "Bank shows ₹2,350 less — probably bank charges; will check the statement."; }
    p.bank.accounts = accounts.map((a) => ({ account_id: A(a.key), opening: opening[a.key], closing: reported[a.key] }));
    // drop empty lines to keep payloads small
    p.payments = p.payments.filter((x) => x.amount !== "" || PAYMENT_KEYS_KEEP.has(x.key));
    p.sections = { sales: true, collections: true, payments: true, bank: true, commitments: true };
    p.commitments = { none: true, pos: [], expenses: [] };
    if (d === D(-3)) delete p.sections.commitments; // a PARTIAL day
    days.push({ payload: p, inventorySales, cogs, recon_note, late: d === D(-20) || d === D(-33) });
  }

  return {
    asOf, start, days, accounts, parties, recurring, skus: skus.map(({ w, code, ...k }) => k), movements,
    pos: pos.map((p) => ({ ...p, sku: p.sku || null })), payables, receivables, expected,
    settings: { min_cash_manual: 1000000 },
    /** Bank statement lines for the primary account, given its ledger + opening. */
    bankStatement(ledger, opening = null) {
      const desc = (t) => {
        const c = t.category_code;
        if (c === "collect_gateway") return "NEFT CR-RAZORPAY SOFTWARE PVT LTD-SETTLEMENT";
        if (c === "collect_cod") return "IMPS CR-DELHIVERY LIMITED-COD REMITTANCE";
        if (c === "mkt_meta") return "POS 4521XXXX FACEBK *ADS";
        if (c === "ops_salaries") return "BULK NEFT DR-SALARY OCT";
        if (c === "fin_emi") return "ACH DR-HDFC BL EMI";
        if (c === "tax_gst") return "GST PMT CHALLAN CPIN";
        if (c === "transfer") return "SELF TRANSFER-PETTY CASH";
        if (c === "log_delhivery") return "NEFT DR-DELHIVERY LIMITED";
        if (c === "refund_paid") return "UPI DR-RAZORPAY REFUNDS";
        if (c.startsWith("prod_")) return `NEFT DR-${(t.party_name || "SUPPLIER").toUpperCase()}`;
        return `${t.direction === "in" ? "NEFT CR" : "NEFT DR"}-${(t.description || "").toUpperCase().slice(0, 30)}`;
      };
      const lastPack = [...ledger].reverse().find((t) => t.category_code === "prod_packaging");
      const lines = ledger.filter((t) => t !== lastPack).map((t, i) => ({
        txn_date: t.category_code === "collect_cod" && i % 3 === 0 ? addDays(t.txn_date, 1) : t.txn_date,
        description: desc(t), reference: `${t.direction === "in" ? "CR" : "DR"}${String(100000 + i)}`, direction: t.direction, amount: Number(t.amount),
        dedupe_key: `demo-stmt-${t.id}`, match_status: "unmatched",
      }));
      lines.push({ txn_date: chargeDay, description: "CHRG: NEFT/IMPS CHARGES + GST Q3", reference: "CHG99812", direction: "out", amount: 2350, dedupe_key: "demo-stmt-charges", match_status: "unmatched" });
      if (D(-5) >= (ledger[0]?.txn_date || D(-30))) lines.push({ txn_date: D(-5), description: "NEFT CR-UNKNOWN REMITTER-REF 88231", reference: "CR88231", direction: "in", amount: 18400, dedupe_key: "demo-stmt-unknown", match_status: "unmatched" });
      lines.sort((a, b) => (a.txn_date < b.txn_date ? -1 : a.txn_date > b.txn_date ? 1 : 0));
      let run = opening;
      return lines.map((l) => { if (run !== null) run = r2(run + (l.direction === "in" ? 1 : -1) * l.amount); return { ...l, running_balance: run }; });
    },
  };
}
const PAYMENT_KEYS_KEEP = new Set();
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
