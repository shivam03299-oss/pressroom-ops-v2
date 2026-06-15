// POST /api/hashway-ops-delhivery   (founder only)
//
// Phase 2 of the Hashway cockpit — ship Shopify orders via the direct
// Delhivery One API (production track.delhivery.com, Token auth).
//
//   body: { action, ...fields }
//     orders      { filter?: "to_ship"|"shipped"|"all" }   → shippable orders + status
//     ship        { order_name, payment_mode, weight_grams, packages,
//                   cod_amount?, decrement_inventory? }     → create AWB
//     label       { awb }                                   → packing-slip PDF link
//     track       { awbs?: [] }                             → refresh statuses
//     cancel      { awb }
//     settings_get / settings_save { delhivery_pickup_name, delhivery_pickup_pin,
//                   delhivery_return_name, default_weight_grams }
//     test                                                  → token + pickup sanity ping
//
// The Delhivery API token is read from env DELHIVERY_API_TOKEN (never
// stored in the DB). The registered pickup/warehouse name lives in
// hashway_finance_settings.delhivery_pickup_name and must match the
// warehouse name in the Delhivery panel exactly.

import { sb, authedFounder, audit } from "./_hashway-ops-shared.js";

const TENANT = "t-hashway";
const BASE = "https://track.delhivery.com";
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const id = (p) => `${p}${Date.now()}${Math.floor(Math.random() * 1e4)}`;

function token() {
  const t = process.env.DELHIVERY_API_TOKEN;
  if (!t) throw new Error("DELHIVERY_API_TOKEN not set in Vercel env — add your Delhivery API token (Settings → API Setup in the Delhivery panel) and redeploy.");
  return t;
}

async function dlGet(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Token ${token()}`, Accept: "application/json" },
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) throw new Error(`Delhivery ${res.status}: ${(text || "").slice(0, 300)}`);
  return json;
}

async function dlForm(path, dataObj) {
  // Delhivery's classic create/edit endpoints take format=json&data=<json>
  const body = `format=json&data=${encodeURIComponent(JSON.stringify(dataObj))}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) throw new Error(`Delhivery ${res.status}: ${(text || "").slice(0, 400)}`);
  return json;
}

const isPrepaid = (o) => ["paid", "partially_paid"].includes((o.financial_status || "").toLowerCase());

function lineSummary(items) {
  const arr = Array.isArray(items) ? items : [];
  const units = arr.reduce((s, li) => s + num(li.quantity || li.current_quantity), 0);
  const desc = arr.map((li) => `${li.title || li.name}${(li.variant_title && li.variant_title !== "Default Title") ? " (" + li.variant_title + ")" : ""} x${num(li.quantity || li.current_quantity)}`).join(", ");
  return { units, desc: desc.slice(0, 250) };
}

function addrOf(o) {
  const a = o.shipping_address || {};
  return {
    name: a.name || [a.first_name, a.last_name].filter(Boolean).join(" ") || o.customer_name || "",
    phone: a.phone || o.customer_phone || "",
    add: [a.address1, a.address2].filter(Boolean).join(", "),
    city: a.city || "",
    state: a.province || "",
    pin: String(a.zip || "").replace(/\s/g, ""),
    country: a.country || "India",
  };
}

// The synced shopify_orders mirror carries NO PII (no address1/zip/phone).
// To ship we fetch the live order from Shopify with the tenant's token.
// If the app's scopes don't include protected customer data, Shopify
// returns nulls and the founder fills the address in the Ship modal.
async function getTenant() {
  const rows = await sb(`tenants?id=eq.${TENANT}&select=shopify_domain,shopify_access_token`);
  return rows?.[0] || null;
}
async function shopifyOrderAddress(orderName) {
  const t = await getTenant();
  if (!t?.shopify_domain || !t?.shopify_access_token) return null;
  const q = `query($q: String!) {
    orders(first: 1, query: $q) {
      edges { node {
        name phone
        shippingAddress { name phone address1 address2 city province zip country }
        customer { phone defaultPhoneNumber { phoneNumber } }
      } }
    }
  }`;
  try {
    const res = await fetch(`https://${t.shopify_domain}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": t.shopify_access_token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, variables: { q: `name:${orderName}` } }),
    });
    const j = await res.json();
    const n = j?.data?.orders?.edges?.[0]?.node;
    if (!n) return null;
    const s = n.shippingAddress || {};
    return {
      name: s.name || "",
      phone: s.phone || n.phone || n.customer?.defaultPhoneNumber?.phoneNumber || n.customer?.phone || "",
      add: [s.address1, s.address2].filter(Boolean).join(", "),
      city: s.city || "", state: s.province || "",
      pin: String(s.zip || "").replace(/\s/g, ""), country: s.country || "India",
    };
  } catch (e) { return null; }
}

// ─── orders — Shopify orders joined with shipment status ─────────────
async function actionOrders({ filter = "to_ship" }) {
  const [orders, ships] = await Promise.all([
    sb(`shopify_orders?tenant_id=eq.${TENANT}&select=shopify_order_id,shopify_order_name,customer_name,customer_phone,shipping_address,line_items,total_price,financial_status,fulfillment_status,shopify_created_at&order=shopify_created_at.desc&limit=400`),
    sb(`hashway_shipments?select=*&order=created_at.desc`),
  ]);
  const byOrder = {};
  for (const s of ships || []) if (s.order_name) byOrder[s.order_name] = s;

  const rows = (orders || []).map((o) => {
    const ship = byOrder[o.shopify_order_name] || null;
    const a = addrOf(o);
    const ls = lineSummary(o.line_items);
    return {
      order_name: o.shopify_order_name,
      order_id: o.shopify_order_id,
      customer: a.name || o.customer_name,
      city: a.city, state: a.state, pin: a.pin, phone: a.phone,
      // mirror has no PII — address is resolved (live fetch / manual) in the Ship modal
      has_address: true,
      total: num(o.total_price),
      payment_mode: isPrepaid(o) ? "Prepaid" : "COD",
      financial_status: o.financial_status,
      units: ls.units, products_desc: ls.desc,
      created_at: o.shopify_created_at,
      shipment: ship && {
        awb: ship.awb, status: ship.status, status_label: ship.status_label,
        label_url: ship.label_url, payment_mode: ship.payment_mode,
        last_activity: ship.last_activity,
      },
    };
  });

  const shipped = rows.filter((r) => r.shipment);
  const toShip = rows.filter((r) => !r.shipment);
  let out = rows;
  if (filter === "to_ship") out = toShip;
  else if (filter === "shipped") out = shipped;
  return { orders: out, counts: { to_ship: toShip.length, shipped: shipped.length, all: rows.length }, has_token: !!process.env.DELHIVERY_API_TOKEN };
}

// ─── ship — create a Delhivery shipment for one order ────────────────
async function actionShip(b, founder) {
  const orderName = b.order_name;
  if (!orderName) throw new Error("order_name required");

  // already shipped?
  const existing = await sb(`hashway_shipments?order_name=eq.${encodeURIComponent(orderName)}&select=awb`);
  if (existing?.[0]) throw new Error(`Order ${orderName} already has AWB ${existing[0].awb}`);

  const ordRows = await sb(`shopify_orders?tenant_id=eq.${TENANT}&shopify_order_name=eq.${encodeURIComponent(orderName)}&select=*`);
  const o = ordRows?.[0];
  if (!o) throw new Error(`order ${orderName} not found`);

  const stRows = await sb(`hashway_finance_settings?id=eq.1&select=*`);
  const st = stRows?.[0] || {};
  const pickupName = (st.delhivery_pickup_name || "").trim();
  if (!pickupName) throw new Error("Set your Delhivery pickup/warehouse name in the Ship Orders settings first (must match the warehouse name registered in your Delhivery panel).");

  // Resolve the delivery address: explicit override from the modal wins,
  // else try a live Shopify fetch, else the (PII-less) mirror.
  let a = addrOf(o);
  const ov = b.address || {};
  if (ov.add || ov.pin || ov.phone) {
    a = { name: ov.name || a.name, phone: String(ov.phone || a.phone || "").trim(),
          add: ov.add || a.add, city: ov.city || a.city, state: ov.state || a.state,
          pin: String(ov.pin || a.pin || "").replace(/\s/g, ""), country: a.country || "India" };
  } else {
    const live = await shopifyOrderAddress(orderName);
    if (live && live.add) a = { ...a, ...live };
  }
  if (!a.add || !a.pin || !a.phone) {
    throw new Error(`order ${orderName} needs a delivery address, pin and phone — fill them in the Ship form (not present in the synced order data).`);
  }

  const ls = lineSummary(o.line_items);
  const paymentMode = b.payment_mode || (isPrepaid(o) ? "Prepaid" : "COD");
  const total = num(o.total_price);
  const codAmount = paymentMode === "COD" ? (b.cod_amount != null ? num(b.cod_amount) : total) : 0;
  const weight = parseInt(b.weight_grams, 10) || num(st.default_weight_grams) || 500;
  const pkgs = parseInt(b.packages, 10) || 1;

  const shipment = {
    name: a.name, add: a.add, pin: a.pin, city: a.city, state: a.state, country: a.country,
    phone: a.phone,
    order: orderName,
    payment_mode: paymentMode,
    products_desc: ls.desc || "Apparel",
    cod_amount: codAmount ? String(codAmount) : "",
    order_date: (o.shopify_created_at || new Date().toISOString()).slice(0, 10),
    total_amount: String(total),
    seller_name: "Hashway Clothing",
    seller_inv: orderName,
    quantity: String(ls.units || 1),
    weight: String(weight),
    shipment_width: "", shipment_height: "",
    waybill: "",
  };

  const payload = { shipments: [shipment], pickup_location: { name: pickupName } };
  const resp = await dlForm("/api/cmu/create.json", payload);

  const pkg = (resp.packages || [])[0] || {};
  const ok = resp.success === true && pkg.status && /success/i.test(pkg.status);
  const awb = pkg.waybill || null;
  if (!ok || !awb) {
    const remark = (pkg.remarks && pkg.remarks.join("; ")) || resp.rmk || resp.error || JSON.stringify(resp).slice(0, 300);
    throw new Error(`Delhivery rejected the shipment: ${remark}`);
  }

  const row = {
    id: id("shp"), shopify_order_id: o.shopify_order_id, order_name: orderName,
    awb, courier: "Delhivery", payment_mode: paymentMode, cod_amount: codAmount,
    declared_value: total, weight_grams: weight, packages: pkgs,
    status: "created", status_label: "Manifested",
    to_name: a.name, to_phone: a.phone, to_city: a.city, to_state: a.state, to_pin: a.pin,
    products_desc: ls.desc, items: o.line_items || [],
    last_activity: new Date().toISOString(),
  };
  await sb(`hashway_shipments`, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([row]) });

  // best-effort: decrement manual inventory for the shipped line items
  let decremented = 0;
  if (b.decrement_inventory !== false) {
    try { decremented = await decrementInventory(o.line_items); if (decremented) await sb(`hashway_shipments?id=eq.${row.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ inventory_decremented: true }) }); }
    catch (e) { /* non-fatal */ }
  }

  await audit({ actorType: "founder", actorId: founder.id, action: "delhivery_ship", entityType: "hashway_shipments", entityId: row.id, payload: { awb, order: orderName } });
  return { awb, order_name: orderName, payment_mode: paymentMode, cod_amount: codAmount, inventory_decremented: decremented };
}

// Match Shopify line items to manual inventory and reduce on_hand.
async function decrementInventory(lineItems) {
  const inv = await sb(`hashway_inventory?select=id,product,variant,on_hand,shopify_product_id`);
  if (!inv?.length) return 0;
  let count = 0;
  for (const li of (lineItems || [])) {
    const qty = num(li.quantity || li.current_quantity);
    if (qty <= 0) continue;
    const pid = li.product_id != null ? String(li.product_id) : null;
    const variant = (li.variant_title && li.variant_title !== "Default Title") ? norm(li.variant_title) : null;
    const nm = norm(li.title || li.name);
    // prefer product-id + size match, then name + size, then name only
    let match = inv.find((i) => i.shopify_product_id && String(i.shopify_product_id) === pid && (!variant || norm(i.variant) === variant));
    if (!match) match = inv.find((i) => norm(i.product) === nm && (!variant || norm(i.variant) === variant));
    if (!match) match = inv.find((i) => (norm(i.product).includes(nm) || nm.includes(norm(i.product))) && (!variant || norm(i.variant) === variant));
    if (!match) continue;
    const next = Math.max(0, num(match.on_hand) - qty);
    await sb(`hashway_inventory?id=eq.${encodeURIComponent(match.id)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ on_hand: next, updated_at: new Date().toISOString() }) });
    match.on_hand = next; // avoid double-decrement within this loop
    count++;
  }
  return count;
}

// ─── order_address — best-effort live address to prefill the modal ──
async function actionOrderAddress({ order_name }) {
  if (!order_name) throw new Error("order_name required");
  const live = await shopifyOrderAddress(order_name);
  return { order_name, address: live, source: live && live.add ? "shopify" : "none" };
}

// ─── label — packing slip PDF link ──────────────────────────────────
async function actionLabel({ awb }) {
  if (!awb) throw new Error("awb required");
  const j = await dlGet(`/api/p/packing_slip?wbns=${encodeURIComponent(awb)}&pdf=true&pdf_size=4R`);
  const pkg = (j.packages || [])[0] || {};
  const url = pkg.pdf_download_link || j.pdf_download_link || null;
  if (url) {
    await sb(`hashway_shipments?awb=eq.${encodeURIComponent(awb)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ label_url: url }) }).catch(() => {});
  }
  return { awb, label_url: url, raw: url ? undefined : j };
}

// ─── track — refresh statuses for shipments ─────────────────────────
function mapDl(statusType, status) {
  const s = (status || "").toLowerCase();
  const t = (statusType || "").toUpperCase();
  if (t === "DL" || /delivered/.test(s)) return { code: "delivered", label: "Delivered" };
  if (/rto/.test(s) || t === "RT") return { code: "rto", label: "RTO" };
  if (t === "UD" && /transit|dispatch/.test(s)) return { code: "in_transit", label: "In transit" };
  if (/out for delivery/.test(s)) return { code: "in_transit", label: "Out for delivery" };
  if (/manifest|pickup|created/.test(s)) return { code: "created", label: status || "Manifested" };
  if (/cancel/.test(s)) return { code: "cancelled", label: "Cancelled" };
  return { code: "in_transit", label: status || statusType || "In transit" };
}

async function actionTrack({ awbs }) {
  let list = awbs;
  if (!list || !list.length) {
    const rows = await sb(`hashway_shipments?status=not.in.(delivered,cancelled,rto)&select=awb`);
    list = (rows || []).map((r) => r.awb).filter(Boolean);
  }
  if (!list.length) return { updated: 0, statuses: {} };
  const statuses = {};
  let updated = 0;
  // Delhivery accepts comma-separated waybills (cap batch size)
  const chunk = list.slice(0, 50).join(",");
  const j = await dlGet(`/api/v1/packages/json/?waybill=${encodeURIComponent(chunk)}`);
  const data = j.ShipmentData || [];
  for (const d of data) {
    const sh = d.Shipment || {};
    const awb = sh.AWB || sh.Waybill;
    const stt = sh.Status || {};
    const m = mapDl(stt.StatusType, stt.Status);
    if (!awb) continue;
    statuses[awb] = { ...m, instructions: stt.Instructions || null, location: stt.StatusLocation || null, at: stt.StatusDateTime || null };
    await sb(`hashway_shipments?awb=eq.${encodeURIComponent(awb)}`, {
      method: "PATCH", prefer: "return=minimal",
      body: JSON.stringify({ status: m.code, status_label: m.label, last_activity: stt.StatusDateTime || new Date().toISOString(), updated_at: new Date().toISOString() }),
    }).catch(() => {});
    updated++;
  }
  return { updated, statuses };
}

// ─── cancel ──────────────────────────────────────────────────────────
async function actionCancel({ awb }, founder) {
  if (!awb) throw new Error("awb required");
  const resp = await dlForm("/api/p/edit", { waybill: awb, cancellation: "true" });
  if (resp.status === false || resp.error) throw new Error(`Delhivery cancel failed: ${resp.error || JSON.stringify(resp).slice(0, 200)}`);
  await sb(`hashway_shipments?awb=eq.${encodeURIComponent(awb)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ status: "cancelled", status_label: "Cancelled", updated_at: new Date().toISOString() }) });
  await audit({ actorType: "founder", actorId: founder.id, action: "delhivery_cancel", entityType: "hashway_shipments", entityId: awb });
  return { ok: true, awb };
}

// ─── settings ────────────────────────────────────────────────────────
async function actionSettingsGet() {
  const rows = await sb(`hashway_finance_settings?id=eq.1&select=delhivery_pickup_name,delhivery_pickup_pin,delhivery_return_name,default_weight_grams`);
  return { ...(rows?.[0] || {}), has_token: !!process.env.DELHIVERY_API_TOKEN };
}
async function actionSettingsSave(b, founder) {
  const patch = { updated_at: new Date().toISOString() };
  for (const k of ["delhivery_pickup_name", "delhivery_pickup_pin", "delhivery_return_name"]) if (b[k] != null) patch[k] = b[k];
  if (b.default_weight_grams != null) patch.default_weight_grams = parseInt(b.default_weight_grams, 10) || 500;
  const r = await sb(`hashway_finance_settings?id=eq.1`, { method: "PATCH", body: JSON.stringify(patch) });
  await audit({ actorType: "founder", actorId: founder.id, action: "delhivery_settings", entityType: "hashway_finance_settings", entityId: "1", payload: patch });
  return r?.[0] || patch;
}

// ─── test — validate token + pickup ─────────────────────────────────
async function actionTest() {
  if (!process.env.DELHIVERY_API_TOKEN) return { ok: false, message: "DELHIVERY_API_TOKEN not set in Vercel env." };
  try {
    // a cheap authenticated call — fetch one fresh waybill
    const j = await dlGet(`/waybill/api/bulk/json/?count=1`);
    const ok = !!(j && (Array.isArray(j) ? j.length : j));
    return { ok: true, message: "Delhivery token valid.", sample_waybill: Array.isArray(j) ? j[0] : (j.packages?.[0]?.waybill || null) };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ─── dispatch ────────────────────────────────────────────────────────
const ACTIONS = {
  orders:        (b) => actionOrders(b),
  order_address: (b) => actionOrderAddress(b),
  ship:          (b, f) => actionShip(b, f),
  label:         (b) => actionLabel(b),
  track:         (b) => actionTrack(b),
  cancel:        (b, f) => actionCancel(b, f),
  settings_get:  () => actionSettingsGet(),
  settings_save: (b, f) => actionSettingsSave(b, f),
  test:          () => actionTest(),
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const founder = await authedFounder(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const action = body.action || "orders";
    const fn = ACTIONS[action];
    if (!fn) return res.status(400).json({ error: `unknown action: ${action}`, valid: Object.keys(ACTIONS) });
    const data = await fn(body, founder);
    return res.status(200).json({ data });
  } catch (e) {
    console.error("hashway-ops-delhivery error", e);
    const code = /founder-only|invalid token|missing bearer/i.test(e.message || "") ? 401 : 500;
    return res.status(code).json({ error: e.message || String(e) });
  }
}
