// POST /api/hashway-ops-finance   (founder only)
//
// The founder business cockpit for Hashway — P&L, bank/cashbook, manual
// inventory, purchases + vendors, and AI-assisted reorder recommendations.
//
//   body: { action, ...fields }
//
//   Reads:
//     summary        { period }                 → the whole dashboard payload
//     ledger_list    { limit?, since? }
//     inv_list
//     purchase_list  { limit? }
//     vendor_list
//     settings_get
//     sales_list     { limit?, status? }
//     reorder        { ai?: boolean }            → buy recommendations
//   Writes:
//     settings_save  { ...settings fields }
//     ledger_add     { date, direction, amount, category, label, method, note }
//     ledger_delete  { id }
//     inv_upsert     { id?, sku, product, variant, category, on_hand,
//                      reorder_point, unit_cost, sell_price, vendor_id, note }
//     inv_adjust     { id, delta }               → +/- on_hand
//     inv_delete     { id }
//     purchase_add   { date, vendor_id?, vendor_name, item, inventory_id?,
//                      qty, unit_cost, paid?, note?,
//                      bump_inventory?, log_payment? }
//     purchase_delete{ id }
//     vendor_add     { id?, name, contact, phone, lead_time_days, note }
//     vendor_delete  { id }
//
// Sales come live from shopify_orders (tenant_id = t-hashway). Inventory
// is maintained manually by the founder — Shopify is NOT the source of
// truth for stock here. COGS is estimated from per-item unit_cost matched
// to Shopify line items by product id, then by normalised name.

import { sb, authedFounder, audit } from "./_hashway-ops-shared.js";

const TENANT = "t-hashway";
const MODEL  = "claude-opus-4-7";

// ─── helpers ─────────────────────────────────────────────────────────
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const id   = (p) => `${p}${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

function sinceForPeriod(period) {
  const now = new Date();
  if (period === "all")  return "1970-01-01";
  if (period === "7d")   { const d = new Date(now); d.setDate(d.getDate() - 7);  return d.toISOString().slice(0, 10); }
  if (period === "90d")  { const d = new Date(now); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); }
  if (period === "30d")  { const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); }
  // default: this calendar month
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

// Pull Hashway orders, optionally only those created since `sinceISO`.
async function getOrders(sinceISO) {
  const filter = sinceISO
    ? `&shopify_created_at=gte.${encodeURIComponent(sinceISO + "T00:00:00Z")}`
    : "";
  const rows = await sb(
    `shopify_orders?tenant_id=eq.${TENANT}${filter}` +
    `&select=shopify_order_name,total_price,financial_status,fulfillment_status,line_items,shopify_created_at` +
    `&order=shopify_created_at.desc&limit=2000`
  );
  return rows || [];
}

// Aggregate units sold per product from a set of orders.
// Returns { byPid: Map(pid→{units,name,revenue}), byName: Map(norm→units), totalUnits }
function tallySales(orders) {
  const byPid = new Map();
  const byName = new Map();
  let totalUnits = 0;
  for (const o of orders) {
    const items = Array.isArray(o.line_items) ? o.line_items : [];
    for (const li of items) {
      const q = num(li.quantity || li.current_quantity || 0);
      if (q <= 0) continue;
      totalUnits += q;
      const pid = li.product_id != null ? String(li.product_id) : null;
      const nm  = li.title || li.name || "";
      const rev = num(li.price) * q;
      if (pid) {
        const cur = byPid.get(pid) || { units: 0, revenue: 0, name: nm };
        cur.units += q; cur.revenue += rev; if (!cur.name) cur.name = nm;
        byPid.set(pid, cur);
      }
      const k = norm(nm);
      if (k) byName.set(k, (byName.get(k) || 0) + q);
    }
  }
  return { byPid, byName, totalUnits };
}

// Match an inventory row to units sold (by shopify_product_id, else name).
function soldForItem(inv, byPid, byName) {
  if (inv.shopify_product_id && byPid.has(String(inv.shopify_product_id))) {
    return byPid.get(String(inv.shopify_product_id)).units;
  }
  const k = norm(inv.product);
  if (!k) return 0;
  if (byName.has(k)) return byName.get(k);
  // loose contains match (inventory product name appears in a sold title)
  let total = 0;
  for (const [nk, u] of byName) {
    if (nk.includes(k) || k.includes(nk)) total += u;
  }
  return total;
}

// ─── summary — the whole dashboard in one round-trip ─────────────────
async function actionSummary({ period = "month" }) {
  const since = sinceForPeriod(period);
  const since30 = sinceForPeriod("30d");
  const [settingsRows, ledgerAll, inv, allOrders] = await Promise.all([
    sb(`hashway_finance_settings?id=eq.1&select=*`),
    sb(`hashway_ledger?select=*`),
    sb(`hashway_inventory?select=*&order=product.asc`),
    getOrders(null), // pull all Hashway orders once, slice windows in JS
  ]);
  const settings = settingsRows?.[0] || {};
  const onOrAfter = (o, d) => (String(o.shopify_created_at || "").slice(0, 10) >= d);
  const periodOrders = since === "1970-01-01" ? allOrders : allOrders.filter(o => onOrAfter(o, since));
  const orders30 = allOrders.filter(o => onOrAfter(o, since30));

  // ── Sales (Shopify) in the selected period ──
  const paid = (o) => ["paid", "partially_paid"].includes((o.financial_status || "").toLowerCase());
  const revenueBooked    = periodOrders.reduce((s, o) => s + num(o.total_price), 0);
  const revenueCollected = periodOrders.filter(paid).reduce((s, o) => s + num(o.total_price), 0);
  const ordersCount      = periodOrders.length;
  const sales = tallySales(periodOrders);

  // ── COGS estimate (units sold × matched unit_cost) ──
  const sales30 = tallySales(orders30);
  let cogs = 0, mappedUnits = 0;
  for (const it of inv) {
    const sold = soldForItem(it, sales.byPid, sales.byName);
    if (sold > 0 && num(it.unit_cost) > 0) { cogs += sold * num(it.unit_cost); mappedUnits += sold; }
  }
  const unmappedUnits = Math.max(0, sales.totalUnits - mappedUnits);

  // ── Ledger / bank-cashbook (actual money, all-time + period) ──
  const inPeriod = (r) => r.date >= since;
  let totIn = 0, totOut = 0, opexPeriod = 0, purchPeriod = 0, inPeriodIn = 0, inPeriodOut = 0;
  for (const r of ledgerAll) {
    const amt = num(r.amount);
    if (r.direction === "in")  totIn  += amt; else totOut += amt;
    if (inPeriod(r)) {
      if (r.direction === "in") inPeriodIn += amt; else {
        inPeriodOut += amt;
        if (r.source === "purchase") purchPeriod += amt; else opexPeriod += amt;
      }
    }
  }
  const opening = num(settings.bank_opening_balance) + num(settings.cash_opening_balance);
  const balance = opening + totIn - totOut;

  // ── P&L for the period ──
  const grossProfit = revenueBooked - cogs;
  const netProfit   = grossProfit - opexPeriod;
  const margin      = revenueBooked ? (netProfit / revenueBooked) * 100 : 0;

  // ── Inventory stats ──
  const lowThresh = num(settings.low_stock_default) || 5;
  let units = 0, valCost = 0, valSell = 0, lowCount = 0, outCount = 0;
  for (const it of inv) {
    const oh = num(it.on_hand);
    units += oh;
    valCost += oh * num(it.unit_cost);
    valSell += oh * num(it.sell_price);
    const rp = it.reorder_point != null ? num(it.reorder_point) : lowThresh;
    if (oh <= 0) outCount++;
    else if (oh <= rp) lowCount++;
  }

  // ── Top sellers (period) ──
  const topSellers = [...sales.byPid.values()]
    .sort((a, b) => b.units - a.units).slice(0, 12)
    .map((x) => ({ name: x.name, units: x.units, revenue: Math.round(x.revenue) }));

  // ── Reorder suggestions (rule-based, 30d velocity) ──
  const reorder = buildReorder(inv, sales30.byPid, sales30.byName, lowThresh).slice(0, 20);

  // ── Monthly sales series (last 6 months, all orders) ──
  const series = monthlySeries(allOrders, 6);

  return {
    period, since,
    settings,
    pnl: {
      revenue_booked: Math.round(revenueBooked),
      revenue_collected: Math.round(revenueCollected),
      orders: ordersCount,
      units_sold: sales.totalUnits,
      aov: ordersCount ? Math.round(revenueBooked / ordersCount) : 0,
      cogs: Math.round(cogs),
      cogs_mapped_units: mappedUnits,
      cogs_unmapped_units: unmappedUnits,
      gross_profit: Math.round(grossProfit),
      opex: Math.round(opexPeriod),
      purchases: Math.round(purchPeriod),
      net_profit: Math.round(netProfit),
      margin: Number(margin.toFixed(1)),
    },
    bank: {
      opening: Math.round(opening),
      total_in: Math.round(totIn),
      total_out: Math.round(totOut),
      balance: Math.round(balance),
      period_in: Math.round(inPeriodIn),
      period_out: Math.round(inPeriodOut),
      label: settings.bank_label || "Bank",
    },
    inventory: {
      items: inv.length,
      units,
      value_cost: Math.round(valCost),
      value_sell: Math.round(valSell),
      low_count: lowCount,
      out_count: outCount,
    },
    top_sellers: topSellers,
    reorder,
    series,
  };
}

function monthlySeries(orders, months) {
  const m = {};
  for (const o of orders) {
    const d = o.shopify_created_at ? String(o.shopify_created_at).slice(0, 7) : null;
    if (!d) continue;
    if (!m[d]) m[d] = { month: d, revenue: 0, orders: 0 };
    m[d].revenue += num(o.total_price); m[d].orders += 1;
  }
  return Object.values(m)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-months)
    .map((x) => ({ ...x, revenue: Math.round(x.revenue) }));
}

// Rule-based reorder: velocity from 30d sales, recommend qty to cover
// lead time + 14-day buffer. Flags items at/below reorder point or
// projected to stock out before replenishment lands.
function buildReorder(inv, byPid30, byName30, lowThresh) {
  const out = [];
  for (const it of inv) {
    const sold30 = soldForItem(it, byPid30, byName30);
    const velocity = sold30 / 30; // units/day
    const oh = num(it.on_hand);
    const rp = it.reorder_point != null ? num(it.reorder_point) : lowThresh;
    const lead = 7; // default; vendor lead time refined in AI pass
    const daysCover = velocity > 0 ? oh / velocity : (oh > 0 ? 999 : 0);
    const stockout = velocity > 0 && daysCover < lead + 3;
    const belowRp  = oh <= rp;
    if (!stockout && !belowRp) continue;
    const target = velocity > 0
      ? Math.ceil(velocity * (lead + 14))
      : Math.max(rp * 2, 10);
    const suggestQty = Math.max(target - oh, belowRp ? Math.max(rp - oh, 1) : 1);
    out.push({
      id: it.id,
      product: it.product,
      variant: it.variant || null,
      on_hand: oh,
      reorder_point: rp,
      sold_30d: sold30,
      velocity: Number(velocity.toFixed(2)),
      days_cover: velocity > 0 ? Math.round(daysCover) : null,
      suggest_qty: suggestQty,
      unit_cost: num(it.unit_cost),
      est_cost: Math.round(suggestQty * num(it.unit_cost)),
      vendor_id: it.vendor_id || null,
      reason: oh <= 0 ? "out of stock"
            : stockout ? `~${Math.round(daysCover)}d cover, selling ${velocity.toFixed(1)}/day`
            : "at/below reorder point",
      urgency: oh <= 0 ? 3 : stockout ? 2 : 1,
    });
  }
  return out.sort((a, b) => b.urgency - a.urgency || b.sold_30d - a.sold_30d);
}

// ─── reorder with optional AI narrative ──────────────────────────────
async function actionReorder({ ai }) {
  const [inv, orders30, vendors] = await Promise.all([
    sb(`hashway_inventory?select=*`),
    getOrders(sinceForPeriod("30d")),
    sb(`hashway_vendors?select=*`),
  ]);
  const s30 = tallySales(orders30);
  const rules = buildReorder(inv, s30.byPid, s30.byName, 5);
  if (!ai || !process.env.ANTHROPIC_API_KEY || rules.length === 0) {
    return { recommendations: rules, ai: null };
  }
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const vmap = Object.fromEntries((vendors || []).map((v) => [v.id, v]));
    const lines = rules.slice(0, 25).map((r) => {
      const v = r.vendor_id ? vmap[r.vendor_id] : null;
      return `- ${r.product}${r.variant ? " / " + r.variant : ""}: on-hand ${r.on_hand}, sold ${r.sold_30d}/30d (${r.velocity}/day), ${r.days_cover ?? "—"}d cover, suggest ${r.suggest_qty} @ ₹${r.unit_cost} = ₹${r.est_cost}${v ? `, vendor ${v.name} (lead ${v.lead_time_days}d)` : ""}`;
    }).join("\n");
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{
        role: "user",
        content:
`You are the inventory planner for Hashway Clothing (a D2C apparel brand on Shopify, ships across India, ~7 day vendor lead times). Below are items flagged for reorder, with 30-day sell-through and current stock. Give a tight, prioritised purchase plan a founder can act on today.

${lines}

Respond in this structure:
1. **Buy now** — the 3-6 most urgent SKUs with qty and a one-line why.
2. **Watch** — items to reorder within ~1-2 weeks.
3. **Cash needed** — rough total ₹ for the "buy now" list.
Keep it under 200 words. Use ₹. Be decisive.`,
      }],
    });
    const text = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return { recommendations: rules, ai: text, tokens: { input: resp.usage?.input_tokens, output: resp.usage?.output_tokens } };
  } catch (e) {
    return { recommendations: rules, ai: null, ai_error: e.message };
  }
}

// ─── ledger ──────────────────────────────────────────────────────────
async function actionLedgerList({ limit = 200, since }) {
  const f = since ? `&date=gte.${since}` : "";
  return await sb(`hashway_ledger?select=*${f}&order=date.desc,created_at.desc&limit=${Math.min(+limit || 200, 1000)}`) || [];
}
async function actionLedgerAdd(b, founder) {
  if (!b.amount || num(b.amount) <= 0) throw new Error("amount required");
  if (!["in", "out"].includes(b.direction)) throw new Error("direction must be in|out");
  const row = {
    id: id("led"), date: b.date || todayISO(), direction: b.direction,
    amount: num(b.amount), category: b.category || null, label: b.label || null,
    method: b.method || "bank", note: b.note || null, source: "manual",
  };
  const r = await sb(`hashway_ledger`, { method: "POST", body: JSON.stringify([row]) });
  await audit({ actorType: "founder", actorId: founder.id, action: "ledger_add", entityType: "hashway_ledger", entityId: row.id, payload: row });
  return r?.[0] || row;
}
async function actionLedgerDelete({ id: rid }, founder) {
  if (!rid) throw new Error("id required");
  await sb(`hashway_ledger?id=eq.${encodeURIComponent(rid)}`, { method: "DELETE", prefer: "return=minimal" });
  await audit({ actorType: "founder", actorId: founder.id, action: "ledger_delete", entityType: "hashway_ledger", entityId: rid });
  return { ok: true };
}

// ─── inventory ───────────────────────────────────────────────────────
async function actionInvList() {
  return await sb(`hashway_inventory?select=*&order=product.asc,variant.asc`) || [];
}
async function actionInvUpsert(b, founder) {
  if (!b.product) throw new Error("product required");
  const isNew = !b.id;
  const row = {
    id: b.id || id("inv"),
    sku: b.sku || null, product: b.product, variant: b.variant || null,
    category: b.category || null,
    on_hand: parseInt(b.on_hand, 10) || 0,
    reorder_point: b.reorder_point != null ? parseInt(b.reorder_point, 10) : 5,
    unit_cost: num(b.unit_cost), sell_price: num(b.sell_price),
    vendor_id: b.vendor_id || null, shopify_product_id: b.shopify_product_id || null,
    note: b.note || null, updated_at: new Date().toISOString(),
  };
  const r = await sb(`hashway_inventory?on_conflict=id`, {
    method: "POST", prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify([row]),
  });
  await audit({ actorType: "founder", actorId: founder.id, action: isNew ? "inv_add" : "inv_update", entityType: "hashway_inventory", entityId: row.id, payload: row });
  return r?.[0] || row;
}
async function actionInvAdjust({ id: rid, delta }, founder) {
  if (!rid) throw new Error("id required");
  const cur = await sb(`hashway_inventory?id=eq.${encodeURIComponent(rid)}&select=on_hand`);
  if (!cur?.[0]) throw new Error("item not found");
  const next = Math.max(0, num(cur[0].on_hand) + parseInt(delta, 10));
  const r = await sb(`hashway_inventory?id=eq.${encodeURIComponent(rid)}`, {
    method: "PATCH", body: JSON.stringify({ on_hand: next, updated_at: new Date().toISOString() }),
  });
  await audit({ actorType: "founder", actorId: founder.id, action: "inv_adjust", entityType: "hashway_inventory", entityId: rid, payload: { delta, next } });
  return r?.[0] || { id: rid, on_hand: next };
}
async function actionInvDelete({ id: rid }, founder) {
  if (!rid) throw new Error("id required");
  await sb(`hashway_inventory?id=eq.${encodeURIComponent(rid)}`, { method: "DELETE", prefer: "return=minimal" });
  await audit({ actorType: "founder", actorId: founder.id, action: "inv_delete", entityType: "hashway_inventory", entityId: rid });
  return { ok: true };
}

// ─── purchases ───────────────────────────────────────────────────────
async function actionPurchaseList({ limit = 200 }) {
  return await sb(`hashway_purchases?select=*&order=date.desc,created_at.desc&limit=${Math.min(+limit || 200, 1000)}`) || [];
}
async function actionPurchaseAdd(b, founder) {
  if (!b.item) throw new Error("item required");
  const qty = parseInt(b.qty, 10) || 0;
  const unit = num(b.unit_cost);
  const total = b.total != null ? num(b.total) : qty * unit;
  const row = {
    id: id("pur"), date: b.date || todayISO(),
    vendor_id: b.vendor_id || null, vendor_name: b.vendor_name || null,
    item: b.item, inventory_id: b.inventory_id || null,
    qty, unit_cost: unit, total, paid: !!b.paid, note: b.note || null,
  };
  const r = await sb(`hashway_purchases`, { method: "POST", body: JSON.stringify([row]) });

  // optional: bump linked inventory on-hand
  if (b.bump_inventory && b.inventory_id && qty > 0) {
    try { await actionInvAdjust({ id: b.inventory_id, delta: qty }, founder); } catch (e) { /* best-effort */ }
  }
  // optional: record the cash going out in the ledger (avoids double-count
  // against opex because source='purchase' is excluded from opex)
  if (b.log_payment && total > 0) {
    try {
      await sb(`hashway_ledger`, { method: "POST", prefer: "return=minimal", body: JSON.stringify([{
        id: id("led"), date: row.date, direction: "out", amount: total,
        category: "Purchases / Stock", label: `${b.item}${b.vendor_name ? " · " + b.vendor_name : ""}`,
        method: b.method || "bank", source: "purchase", source_ref: row.id,
      }]) });
    } catch (e) { /* best-effort */ }
  }
  await audit({ actorType: "founder", actorId: founder.id, action: "purchase_add", entityType: "hashway_purchases", entityId: row.id, payload: row });
  return r?.[0] || row;
}
async function actionPurchaseDelete({ id: rid }, founder) {
  if (!rid) throw new Error("id required");
  await sb(`hashway_purchases?id=eq.${encodeURIComponent(rid)}`, { method: "DELETE", prefer: "return=minimal" });
  await audit({ actorType: "founder", actorId: founder.id, action: "purchase_delete", entityType: "hashway_purchases", entityId: rid });
  return { ok: true };
}

// ─── vendors ─────────────────────────────────────────────────────────
async function actionVendorList() {
  return await sb(`hashway_vendors?select=*&order=name.asc`) || [];
}
async function actionVendorAdd(b, founder) {
  if (!b.name) throw new Error("name required");
  const row = {
    id: b.id || id("ven"), name: b.name, contact: b.contact || null,
    phone: b.phone || null, lead_time_days: parseInt(b.lead_time_days, 10) || 7, note: b.note || null,
  };
  const r = await sb(`hashway_vendors?on_conflict=id`, {
    method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: JSON.stringify([row]),
  });
  await audit({ actorType: "founder", actorId: founder.id, action: "vendor_upsert", entityType: "hashway_vendors", entityId: row.id, payload: row });
  return r?.[0] || row;
}
async function actionVendorDelete({ id: rid }, founder) {
  if (!rid) throw new Error("id required");
  await sb(`hashway_vendors?id=eq.${encodeURIComponent(rid)}`, { method: "DELETE", prefer: "return=minimal" });
  await audit({ actorType: "founder", actorId: founder.id, action: "vendor_delete", entityType: "hashway_vendors", entityId: rid });
  return { ok: true };
}

// ─── settings ────────────────────────────────────────────────────────
async function actionSettingsGet() {
  const rows = await sb(`hashway_finance_settings?id=eq.1&select=*`);
  return rows?.[0] || {};
}
async function actionSettingsSave(b, founder) {
  const patch = {};
  for (const k of ["bank_label", "currency"]) if (b[k] != null) patch[k] = b[k];
  for (const k of ["bank_opening_balance", "cash_opening_balance"]) if (b[k] != null) patch[k] = num(b[k]);
  if (b.low_stock_default != null) patch.low_stock_default = parseInt(b.low_stock_default, 10) || 5;
  if (b.bank_opening_date) patch.bank_opening_date = b.bank_opening_date;
  patch.updated_at = new Date().toISOString();
  const r = await sb(`hashway_finance_settings?id=eq.1`, { method: "PATCH", body: JSON.stringify(patch) });
  await audit({ actorType: "founder", actorId: founder.id, action: "settings_save", entityType: "hashway_finance_settings", entityId: "1", payload: patch });
  return r?.[0] || patch;
}

// ─── sales list (raw Shopify orders for the sales view) ──────────────
async function actionSalesList({ limit = 50, status }) {
  let f = `tenant_id=eq.${TENANT}`;
  if (status === "paid") f += `&financial_status=in.(paid,partially_paid)`;
  else if (status === "unpaid") f += `&financial_status=not.in.(paid,partially_paid)`;
  const rows = await sb(
    `shopify_orders?${f}&select=shopify_order_name,customer_name,total_price,financial_status,fulfillment_status,shopify_created_at&order=shopify_created_at.desc&limit=${Math.min(+limit || 50, 200)}`
  );
  return rows || [];
}

// ─── dispatch ────────────────────────────────────────────────────────
const ACTIONS = {
  summary:         (b) => actionSummary(b),
  reorder:         (b) => actionReorder(b),
  ledger_list:     (b) => actionLedgerList(b),
  ledger_add:      (b, f) => actionLedgerAdd(b, f),
  ledger_delete:   (b, f) => actionLedgerDelete(b, f),
  inv_list:        ()  => actionInvList(),
  inv_upsert:      (b, f) => actionInvUpsert(b, f),
  inv_adjust:      (b, f) => actionInvAdjust(b, f),
  inv_delete:      (b, f) => actionInvDelete(b, f),
  purchase_list:   (b) => actionPurchaseList(b),
  purchase_add:    (b, f) => actionPurchaseAdd(b, f),
  purchase_delete: (b, f) => actionPurchaseDelete(b, f),
  vendor_list:     ()  => actionVendorList(),
  vendor_add:      (b, f) => actionVendorAdd(b, f),
  vendor_delete:   (b, f) => actionVendorDelete(b, f),
  settings_get:    ()  => actionSettingsGet(),
  settings_save:   (b, f) => actionSettingsSave(b, f),
  sales_list:      (b) => actionSalesList(b),
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const founder = await authedFounder(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const action = body.action || "summary";
    const fn = ACTIONS[action];
    if (!fn) return res.status(400).json({ error: `unknown action: ${action}`, valid: Object.keys(ACTIONS) });
    const data = await fn(body, founder);
    return res.status(200).json({ data });
  } catch (e) {
    console.error("hashway-ops-finance error", e);
    const code = /founder-only|invalid token|missing bearer/i.test(e.message || "") ? 401 : 500;
    return res.status(code).json({ error: e.message || String(e) });
  }
}
