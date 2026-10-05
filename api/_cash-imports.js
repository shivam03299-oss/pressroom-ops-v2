// CSV / Excel import definitions — shared by the UI (column mapping) and
// the API (validation + normalisation). Pure; no I/O.
//
// Golden rule: imports create EXPECTED cash (receivables), P&L accruals,
// master data, or bank statement lines for reconciliation. The only import
// that writes actual cash is "expenses" (money already paid), and every
// row carries a dedupe key so the same file/row can't be loaded twice.

import { num, isBlank, rowHash, addDays } from "./_cash-engine.js";

export const IMPORT_TYPES = {
  bank_statement: {
    label: "Bank statement",
    help: "Lines from your bank's CSV/Excel export. Used for reconciliation — they do NOT post cash on their own.",
    needsAccount: true,
    fields: [
      { key: "date", label: "Date", required: true, type: "date", syn: ["txn date", "transaction date", "value date", "date", "tran date", "posting date"] },
      { key: "description", label: "Description / narration", type: "text", syn: ["narration", "description", "particulars", "remarks", "details"] },
      { key: "reference", label: "Reference / cheque no", type: "text", syn: ["ref", "reference", "chq", "cheque", "utr", "ref no", "chq./ref.no."] },
      { key: "debit", label: "Debit (withdrawal)", type: "money", syn: ["debit", "withdrawal", "withdrawal amt", "dr", "debit amount", "withdrawal amt."] },
      { key: "credit", label: "Credit (deposit)", type: "money", syn: ["credit", "deposit", "deposit amt", "cr", "credit amount", "deposit amt."] },
      { key: "amount", label: "Signed amount (if single column)", type: "money", syn: ["amount", "amt", "transaction amount"] },
      { key: "balance", label: "Running balance", type: "money", syn: ["balance", "closing balance", "running balance", "bal"] },
    ],
  },
  shopify_orders: {
    label: "Shopify orders export",
    help: "Orders → Export. Aggregated into daily sales (sales ≠ cash) and the gateway/COD receivables they create. Dates already entered via the daily update are skipped.",
    fields: [
      { key: "order", label: "Order name", required: true, type: "text", syn: ["name", "order", "order name", "order number"] },
      { key: "created_at", label: "Created at", required: true, type: "date", syn: ["created at", "created_at", "order date", "date"] },
      { key: "total", label: "Total", required: true, type: "money", syn: ["total", "total price", "order total"] },
      { key: "discount", label: "Discount amount", type: "money", syn: ["discount amount", "discount", "total discounts"] },
      { key: "refunded", label: "Refunded amount", type: "money", syn: ["refunded amount", "refunded", "total refunded"] },
      { key: "financial_status", label: "Financial status", type: "text", syn: ["financial status", "payment status"] },
      { key: "gateway", label: "Payment method / gateway", type: "text", syn: ["payment method", "gateway", "payment gateway", "payment gateway names"] },
      { key: "cancelled_at", label: "Cancelled at", type: "text", syn: ["cancelled at", "cancelled_at"] },
      { key: "quantity", label: "Lineitem quantity", type: "number", syn: ["lineitem quantity", "quantity", "qty"] },
    ],
  },
  cod_remittance: {
    label: "Courier COD (Delhivery etc.)",
    help: "AWB-level COD report. Undelivered/unremitted COD becomes expected cash. Requires 'create receivables from daily sales' to be OFF, otherwise COD would be counted twice.",
    needsAggregateOff: true,
    fields: [
      { key: "awb", label: "AWB / waybill", required: true, type: "text", syn: ["awb", "waybill", "awb number", "waybill no"] },
      { key: "order", label: "Order ref", type: "text", syn: ["order", "order id", "reference", "order no"] },
      { key: "cod_amount", label: "COD amount", required: true, type: "money", syn: ["cod amount", "cod", "collectable amount", "cod value"] },
      { key: "deductions", label: "Courier deductions", type: "money", syn: ["deductions", "charges", "freight", "cod charges"] },
      { key: "status", label: "Shipment status", type: "text", syn: ["status", "shipment status", "current status"] },
      { key: "origin_date", label: "Pickup / order date", type: "date", syn: ["pickup date", "order date", "manifest date", "date"] },
      { key: "delivered_date", label: "Delivered date", type: "date", syn: ["delivered date", "delivery date"] },
      { key: "expected_remit_date", label: "Expected remittance date", type: "date", syn: ["expected remittance", "remittance due", "expected date"] },
      { key: "remitted_date", label: "Remitted on", type: "date", syn: ["remitted date", "remittance date", "remitted on", "paid on"] },
      { key: "courier", label: "Courier (delhivery / other)", type: "text", syn: ["courier", "carrier"] },
    ],
  },
  gateway_settlements: {
    label: "Payment gateway (Razorpay / PayU / Cashfree)",
    help: "Payments not yet settled become expected cash at their settlement date. Requires 'create receivables from daily sales' to be OFF.",
    needsAggregateOff: true,
    fields: [
      { key: "reference", label: "Payment / settlement id", required: true, type: "text", syn: ["id", "payment id", "settlement id", "entity id", "transaction id"] },
      { key: "date", label: "Payment date", required: true, type: "date", syn: ["created at", "date", "payment date", "captured at"] },
      { key: "gross", label: "Gross amount", required: true, type: "money", syn: ["amount", "gross", "gross amount", "credit"] },
      { key: "fee", label: "Fee", type: "money", syn: ["fee", "fees", "mdr"] },
      { key: "tax", label: "Tax on fee", type: "money", syn: ["tax", "gst", "service tax"] },
      { key: "expected_date", label: "Expected settlement date", type: "date", syn: ["settlement date", "expected settlement", "settled by"] },
      { key: "settled_on", label: "Settled on", type: "date", syn: ["settled at", "settled on", "settlement utr date"] },
      { key: "gateway", label: "Gateway", type: "text", syn: ["gateway", "provider"] },
    ],
  },
  marketplace_settlements: {
    label: "Marketplace (Myntra / AJIO / Amazon / Flipkart)",
    help: "Each row = one order or settlement line. Books marketplace revenue and the net amount still to be paid out.",
    fields: [
      { key: "platform", label: "Platform", required: true, type: "text", syn: ["platform", "marketplace", "channel"] },
      { key: "reference", label: "Order / settlement ref", required: true, type: "text", syn: ["order id", "reference", "settlement id", "order no"] },
      { key: "order_date", label: "Order date", required: true, type: "date", syn: ["order date", "date", "invoice date"] },
      { key: "sales", label: "Sales value", required: true, type: "money", syn: ["sales", "sale amount", "gross", "invoice amount", "order value"] },
      { key: "commission", label: "Commission", type: "money", syn: ["commission"] },
      { key: "fees", label: "Other fees", type: "money", syn: ["fees", "fixed fee", "shipping fee", "other charges"] },
      { key: "returns", label: "Returns", type: "money", syn: ["returns", "return amount", "refund"] },
      { key: "net", label: "Net payable to you", type: "money", syn: ["net", "net payout", "net amount", "settlement amount"] },
      { key: "expected_date", label: "Expected settlement date", type: "date", syn: ["expected settlement", "settlement date", "payout date"] },
      { key: "settled_on", label: "Settled on", type: "date", syn: ["settled on", "paid on"] },
    ],
  },
  suppliers: {
    label: "Suppliers",
    help: "Supplier master: name, GSTIN, phone and credit days.",
    fields: [
      { key: "name", label: "Supplier name", required: true, type: "text", syn: ["name", "supplier", "vendor", "party"] },
      { key: "gstin", label: "GSTIN", type: "text", syn: ["gstin", "gst", "gst no"] },
      { key: "phone", label: "Phone", type: "text", syn: ["phone", "mobile", "contact"] },
      { key: "payment_terms_days", label: "Credit days", type: "number", syn: ["credit days", "payment terms", "terms"] },
      { key: "note", label: "Note", type: "text", syn: ["note", "remarks"] },
    ],
  },
  inventory: {
    label: "Inventory (SKUs at cost)",
    help: "Stock count at COST. Existing SKUs are updated; quantity changes are recorded as stock adjustments.",
    fields: [
      { key: "sku", label: "SKU", required: true, type: "text", syn: ["sku", "variant sku", "code"] },
      { key: "product", label: "Product", required: true, type: "text", syn: ["product", "title", "name", "product name"] },
      { key: "category", label: "Category", type: "text", syn: ["category", "type", "product type"] },
      { key: "cost_per_unit", label: "Cost per unit", required: true, type: "money", syn: ["cost", "cost per unit", "unit cost", "cost per item"] },
      { key: "selling_price", label: "Selling price", type: "money", syn: ["price", "selling price", "mrp", "variant price"] },
      { key: "units_on_hand", label: "Units available", required: true, type: "number", syn: ["units", "on hand", "available", "quantity", "stock", "inventory"] },
      { key: "units_wip", label: "Units in production", type: "number", syn: ["wip", "in production", "production"] },
      { key: "units_incoming", label: "Units incoming", type: "number", syn: ["incoming", "in transit"] },
    ],
  },
  expenses: {
    label: "Expenses already paid",
    help: "Money that has ALREADY left the bank. Each row becomes a cash outflow in the ledger.",
    needsAccount: true,
    fields: [
      { key: "date", label: "Payment date", required: true, type: "date", syn: ["date", "payment date", "paid on"] },
      { key: "amount", label: "Amount", required: true, type: "money", syn: ["amount", "paid", "debit", "value"] },
      { key: "category", label: "Category", required: true, type: "category", syn: ["category", "head", "expense head", "type"] },
      { key: "vendor", label: "Vendor", type: "text", syn: ["vendor", "supplier", "party", "paid to"] },
      { key: "description", label: "Description", type: "text", syn: ["description", "narration", "note"] },
      { key: "reference", label: "Reference", type: "text", syn: ["reference", "utr", "invoice", "bill no"] },
    ],
  },
  payables: {
    label: "Bills to pay (payables)",
    help: "Unpaid bills. They are recognised as expenses (if P&L) and appear as future cash outflows on their payment date.",
    fields: [
      { key: "vendor", label: "Vendor", required: true, type: "text", syn: ["vendor", "supplier", "party"] },
      { key: "bill_date", label: "Bill date", required: true, type: "date", syn: ["bill date", "invoice date", "date"] },
      { key: "due_date", label: "Due date", required: true, type: "date", syn: ["due date", "due"] },
      { key: "amount", label: "Amount", required: true, type: "money", syn: ["amount", "bill amount", "total"] },
      { key: "category", label: "Category", required: true, type: "category", syn: ["category", "head", "type"] },
      { key: "reference", label: "Bill number", type: "text", syn: ["bill no", "invoice no", "reference", "invoice"] },
      { key: "priority", label: "Priority (critical/high/normal/low)", type: "text", syn: ["priority"] },
    ],
  },
  receivables: {
    label: "B2B / other receivables",
    help: "Invoices raised to B2B customers that are not yet collected.",
    fields: [
      { key: "customer", label: "Customer", required: true, type: "text", syn: ["customer", "party", "buyer", "client"] },
      { key: "reference", label: "Invoice number", required: true, type: "text", syn: ["invoice", "invoice no", "reference", "bill no"] },
      { key: "invoice_date", label: "Invoice date", required: true, type: "date", syn: ["invoice date", "date"] },
      { key: "amount", label: "Amount", required: true, type: "money", syn: ["amount", "invoice amount", "total"] },
      { key: "expected_date", label: "Expected collection date", required: true, type: "date", syn: ["due date", "expected date", "collection date"] },
      { key: "confidence", label: "Confidence (confirmed/probable/possible)", type: "text", syn: ["confidence"] },
    ],
  },
};

/** Guess a mapping {fieldKey: headerName} from a header row. */
export function guessMapping(type, headers) {
  const def = IMPORT_TYPES[type];
  const normH = headers.map((h) => [h, String(h).toLowerCase().replace(/[_\s]+/g, " ").trim()]);
  const used = new Set();
  const map = {};
  for (const f of def.fields) {
    const cands = [f.key.replace(/_/g, " "), f.label.toLowerCase(), ...f.syn];
    let hit = normH.find(([h, n]) => !used.has(h) && cands.includes(n));
    if (!hit) hit = normH.find(([h, n]) => !used.has(h) && cands.some((c) => c.length > 3 && n.includes(c)));
    if (hit) { map[f.key] = hit[0]; used.add(hit[0]); }
  }
  return map;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/**
 * Parse the date formats Indian banks/platforms actually export:
 * 2026-10-04, 04/10/2026, 04-10-26, 04 Oct 2026, 4-Oct-26, Excel serials,
 * ISO timestamps. Day-first is assumed for ambiguous dd/mm.
 */
export function parseDate(v) {
  if (isBlank(v)) return null;
  if (typeof v === "number" && v > 20000 && v < 80000) { // Excel serial
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return fmt(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return fmt(yr(+m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s/-]([A-Za-z]{3})[A-Za-z]*[\s/,-]+(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return fmt(yr(+m[3]), MONTHS[m[2].toLowerCase()], +m[1]);
  m = s.match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) return fmt(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  return null;
  function yr(y) { return y < 100 ? 2000 + y : y; }
  function fmt(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCMonth() !== mo - 1) return null;
    return t.toISOString().slice(0, 10);
  }
}
export function parseMoney(v) {
  if (isBlank(v)) return null;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  const neg = /^\(.*\)$/.test(s) || /-\s*$/.test(s) || /^-/.test(s) || /\bDr\b/i.test(s);
  s = s.replace(/[()₹,\s]|INR|Rs\.?|Cr|Dr/gi, "").replace(/-$/, "").replace(/^-/, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

/** Map a raw sheet row through the mapping into typed values + per-row errors. */
export function normaliseRow(type, raw, mapping, ctx = {}) {
  const def = IMPORT_TYPES[type];
  const out = {}, errors = [];
  for (const f of def.fields) {
    const col = mapping[f.key];
    const v = col ? raw[col] : undefined;
    if (isBlank(v)) { out[f.key] = null; if (f.required) errors.push(`${f.label} is missing`); continue; }
    if (f.type === "date") { const d = parseDate(v); if (!d) errors.push(`${f.label} "${v}" is not a date`); out[f.key] = d; }
    else if (f.type === "money" || f.type === "number") { const n = parseMoney(v); if (Number.isNaN(n)) errors.push(`${f.label} "${v}" is not a number`); out[f.key] = Number.isNaN(n) ? null : n; }
    else if (f.type === "category") {
      const c = matchCategory(String(v), ctx.categories || []);
      if (!c) errors.push(`Unknown category "${v}"`); out[f.key] = c;
    } else out[f.key] = String(v).trim();
  }
  // type-specific checks
  if (type === "bank_statement") {
    const dr = num(out.debit), cr = num(out.credit);
    if (out.debit === null && out.credit === null && out.amount === null) errors.push("Needs a debit, credit or amount");
    if (dr < 0 || cr < 0) errors.push("Debit/credit can't be negative");
    if (dr > 0 && cr > 0) errors.push("Row has both a debit and a credit");
    const signed = out.amount !== null && out.debit === null && out.credit === null ? num(out.amount) : cr - dr;
    if (signed === 0 && !errors.length) errors.push("Zero-amount line");
    out.direction = signed >= 0 ? "in" : "out";
    out.value = Math.abs(signed);
  }
  if (["expenses", "payables", "receivables"].includes(type) && out.amount !== null && num(out.amount) <= 0) errors.push("Amount must be greater than zero");
  if (type === "payables" && out.due_date && out.bill_date && out.due_date < out.bill_date) errors.push("Due date is before the bill date");
  if (type === "inventory") {
    if (num(out.cost_per_unit) < 0) errors.push("Cost can't be negative");
    if (num(out.units_on_hand) < 0) errors.push("Units can't be negative");
  }
  if (type === "marketplace_settlements" && out.net === null && out.sales !== null) {
    out.net = num(out.sales) - num(out.commission) - num(out.fees) - num(out.returns);
  }
  if (type === "marketplace_settlements" && out.net !== null && out.net < 0) errors.push("Net payout is negative");
  if (ctx.today && ["date", "bill_date", "invoice_date", "order_date"].some((k) => out[k] && out[k] > addDays(ctx.today, 1)) && type !== "payables") {
    errors.push("Date is in the future");
  }
  return { row: out, errors };
}

export function matchCategory(text, categories) {
  const t = text.trim().toLowerCase();
  return (categories.find((c) => c.code === t) ||
    categories.find((c) => c.name.toLowerCase() === t) ||
    categories.find((c) => c.name.toLowerCase().includes(t) || t.includes(c.name.toLowerCase())) || {}).code || null;
}

/** Stable per-row dedupe key (namespaced by type). */
export function importRowKey(type, row, extra = "") {
  switch (type) {
    case "bank_statement": return `bank:${extra}:${rowHash({ d: row.date, a: row.value, dir: row.direction, desc: row.description || "", ref: row.reference || "", bal: row.balance ?? "" })}`;
    case "cod_remittance": return `cod:${String(row.awb).toLowerCase()}`;
    case "gateway_settlements": return `gw:${String(row.reference).toLowerCase()}`;
    case "marketplace_settlements": return `mp:${String(row.platform).toLowerCase()}:${String(row.reference).toLowerCase()}`;
    case "expenses": return `exp:${rowHash({ d: row.date, a: row.amount, c: row.category, v: row.vendor || "", r: row.reference || "" })}`;
    case "payables": return `bill:${rowHash({ v: row.vendor, r: row.reference || "", d: row.bill_date, a: row.amount })}`;
    case "receivables": return `b2b:${rowHash({ c: row.customer, r: row.reference })}`;
    default: return `${type}:${rowHash(row)}`;
  }
}

/** Aggregate Shopify order rows (one per line item) into per-day sales. */
export function aggregateShopify(rows) {
  const orders = new Map();
  for (const r of rows) {
    const k = r.order;
    const cur = orders.get(k) || { order: k, date: r.created_at, total: 0, discount: 0, refunded: 0, cod: false, cancelled: false, qty: 0 };
    cur.total = Math.max(cur.total, num(r.total));
    cur.discount = Math.max(cur.discount, num(r.discount));
    cur.refunded = Math.max(cur.refunded, num(r.refunded));
    const g = String(r.gateway || "").toLowerCase();
    if (/cod|cash on delivery|cash_on_delivery|manual/.test(g)) cur.cod = true;
    if (!isBlank(r.cancelled_at) || /voided/.test(String(r.financial_status || "").toLowerCase())) cur.cancelled = true;
    cur.qty += num(r.quantity);
    if (r.created_at) cur.date = cur.date || r.created_at;
    orders.set(k, cur);
  }
  const days = new Map();
  for (const o of orders.values()) {
    const d = days.get(o.date) || { sale_date: o.date, orders: 0, order_value: 0, prepaid_sales: 0, cod_sales: 0, discounts: 0, cancellations: 0, refunds: 0, units_sold: 0 };
    d.orders++; d.order_value += o.total; d.discounts += o.discount; d.units_sold += o.qty;
    if (o.cod) d.cod_sales += o.total; else d.prepaid_sales += o.total;
    if (o.cancelled) d.cancellations += o.total;
    else d.refunds += o.refunded;
    days.set(o.date, d);
  }
  return [...days.values()].sort((a, b) => (a.sale_date < b.sale_date ? -1 : 1));
}
