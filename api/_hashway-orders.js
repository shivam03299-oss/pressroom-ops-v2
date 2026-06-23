// POST /api/hashway-orders   (admin + the confirmation-call workers)
//
// Powers Hardik Chopra's "Hashway" confirmation-call queue. Access is
// limited to role=admin (Shivam) and workers w6 (Hardik) / w9 (Hardik
// Chopra). Actions:
//   list    { sync? }                 → Hashway orders (optionally sync first)
//   confirm { id, confirmed }         → tick/untick → call_status
//   save    { id, shipping_address?, customer_name?, customer_phone?,
//             line_items?, total_price? }
//             → update our copy AND push the address back to Shopify
//
// Edits are always saved to our shopify_orders row (what the floor ships
// from). The customer/shipping ADDRESS is also written back to the live
// Shopify order (token has write_orders). Line-item/amount changes are
// recorded on our side + flagged on the Shopify order note; full
// line-item write-back to Shopify is a follow-up.

import { sb, authedCaller } from "./_velocity-track.js";
import { syncOrdersForTenant } from "./_shopify-sync.js";

const TENANT = "t-hashway";
const SHOP_API = "2025-01";
const ALLOWED_WORKERS = new Set(["w6", "w9"]);
const enc = encodeURIComponent;

async function gate(req) {
  const { user, profile } = await authedCaller(req);
  let workerId = profile.worker_id;
  if (workerId === undefined) {
    const rows = await sb(`profiles?id=eq.${user.id}&select=worker_id`);
    workerId = rows?.[0]?.worker_id || null;
  }
  if (profile.role !== "admin" && !ALLOWED_WORKERS.has(workerId)) {
    throw new Error("not-authorized");
  }
  return { user, profile, workerId };
}

async function hashwayTenant() {
  const rows = await sb(`tenants?id=eq.${TENANT}&select=shopify_domain,shopify_access_token`);
  const t = rows?.[0];
  if (!t?.shopify_domain || !t?.shopify_access_token) throw new Error("Hashway's Shopify isn't connected.");
  return t;
}

async function shopRest(t, path, method, body) {
  const res = await fetch(`https://${t.shopify_domain}/admin/api/${SHOP_API}/${path}`, {
    method,
    headers: { "X-Shopify-Access-Token": t.shopify_access_token, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${(text || "").slice(0, 300)}`);
  return json;
}

const SELECT = [
  "id", "shopify_order_id", "shopify_order_name", "customer_name", "customer_phone",
  "customer_email", "shipping_address", "line_items", "total_price", "currency",
  "financial_status", "fulfillment_status", "call_status", "confirmed_at", "confirmed_by",
  "edited_at", "edited_by", "shopify_created_at", "shopify_synced_at", "shopify_sync_error",
].join(",");

// ─── list (optionally sync first so the queue is live) ───────────────
async function actionList(b) {
  if (b.sync) {
    try { await syncOrdersForTenant(await hashwayTenant()); } catch (e) { /* non-fatal — still return what we have */ }
  }
  const orders = await sb(`shopify_orders?tenant_id=eq.${TENANT}&select=${SELECT}&order=shopify_created_at.desc&limit=500`);
  return { orders: orders || [] };
}

// ─── confirm / unconfirm ─────────────────────────────────────────────
async function actionConfirm(b, ctx) {
  if (!b.id) throw new Error("id required");
  const confirmed = b.confirmed !== false;
  const patch = confirmed
    ? { call_status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: ctx.profile.name || ctx.workerId || "staff" }
    : { call_status: "pending", confirmed_at: null, confirmed_by: null };
  const row = await sb(`shopify_orders?id=eq.${enc(b.id)}&tenant_id=eq.${TENANT}`, {
    method: "PATCH", body: JSON.stringify(patch),
  });
  return { ok: true, order: row?.[0] || null };
}

// ─── save edits (DB always; address → Shopify) ───────────────────────
async function actionSave(b, ctx) {
  if (!b.id) throw new Error("id required");
  const rows = await sb(`shopify_orders?id=eq.${enc(b.id)}&tenant_id=eq.${TENANT}&select=shopify_order_id,shipping_address,line_items,shopify_note`);
  const cur = rows?.[0];
  if (!cur) throw new Error("order not found");

  const patch = { edited_at: new Date().toISOString(), edited_by: ctx.profile.name || ctx.workerId || "staff" };
  if (b.shipping_address) patch.shipping_address = b.shipping_address;
  if (b.customer_name != null) patch.customer_name = b.customer_name;
  if (b.customer_phone != null) patch.customer_phone = b.customer_phone;
  if (Array.isArray(b.line_items)) patch.line_items = b.line_items;
  if (b.total_price != null) patch.total_price = b.total_price;

  // Push the address (and contact) back to the live Shopify order.
  let syncError = null;
  const addrChanged = !!b.shipping_address || b.customer_name != null || b.customer_phone != null;
  const itemsChanged = Array.isArray(b.line_items) || b.total_price != null;
  if (addrChanged || itemsChanged) {
    try {
      const t = await hashwayTenant();
      const orderUpdate = { id: Number(cur.shopify_order_id) };
      if (b.shipping_address) {
        const a = b.shipping_address;
        orderUpdate.shipping_address = {
          name: b.customer_name ?? a.name, address1: a.address1, address2: a.address2 || "",
          city: a.city, province: a.province, zip: a.zip, country: a.country || "India",
          phone: b.customer_phone ?? a.phone,
        };
      }
      if (b.customer_phone != null) orderUpdate.phone = b.customer_phone;
      // Line-item/amount edits are recorded on the Shopify order as a note
      // (full line-item write-back via the order-edit API is a follow-up).
      if (itemsChanged) {
        orderUpdate.note = `${cur.shopify_note ? cur.shopify_note + "\n" : ""}[Aviva confirmation edit by ${patch.edited_by} — items/amount adjusted]`;
      }
      await shopRest(t, `orders/${Number(cur.shopify_order_id)}.json`, "PUT", { order: orderUpdate });
      patch.shopify_synced_at = new Date().toISOString();
      patch.shopify_sync_error = null;
    } catch (e) {
      syncError = String(e.message || e).slice(0, 300);
      patch.shopify_sync_error = syncError;
    }
  }

  const row = await sb(`shopify_orders?id=eq.${enc(b.id)}&tenant_id=eq.${TENANT}`, {
    method: "PATCH", body: JSON.stringify(patch),
  });
  return { ok: true, order: row?.[0] || null, shopify_synced: !syncError, shopify_error: syncError };
}

// ─── enrich — backfill customer name/phone/address from a CSV export ──
// Shopify's API redacts customer PII on Basic-plan stores, but the
// merchant's own Orders→Export CSV carries it. The admin uploads that
// CSV (parsed in-browser); we match rows to synced orders by order # and
// fill in name/phone/full address in a single DB call.
async function actionEnrich(b) {
  const rows = Array.isArray(b.rows) ? b.rows : [];
  const pRows = [];
  for (const r of rows) {
    if (!r || !r.order_ref) continue;
    const c = r.customer || {};
    if (!c.name && !c.phone && !c.address) continue;
    pRows.push({
      ref: r.order_ref,
      name: c.name || "",
      phone: c.phone || "",
      address: {
        name: c.name || null, address1: c.address || null, city: c.city || null,
        province: c.state || null, zip: c.pin || null, country: c.country || "India", phone: c.phone || null,
      },
    });
  }
  if (!pRows.length) return { matched: 0, rows: 0 };
  const res = await sb("rpc/enrich_hashway_orders", { method: "POST", body: JSON.stringify({ p_rows: pRows }) });
  const matched = typeof res === "number" ? res : Number(Array.isArray(res) ? res[0] : res) || 0;
  return { matched, rows: pRows.length };
}

const ACTIONS = { list: actionList, confirm: actionConfirm, save: actionSave, enrich: actionEnrich };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const ctx = await gate(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const fn = ACTIONS[body.action];
    if (!fn) return res.status(400).json({ error: `unknown action: ${body.action}`, valid: Object.keys(ACTIONS) });
    const data = await fn(body, ctx);
    return res.status(200).json({ data });
  } catch (e) {
    console.error("hashway-orders error", e);
    const code = /not-authorized|invalid token|missing bearer|no profile/i.test(e.message || "") ? 401 : 500;
    return res.status(code).json({ error: e.message || String(e) });
  }
}
