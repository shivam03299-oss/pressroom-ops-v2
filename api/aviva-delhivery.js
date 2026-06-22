// POST /api/aviva-delhivery   (Aviva admin/staff only)
//
// Ships client packing-slip orders from Aviva's Badli warehouse via the
// direct Delhivery One API (production track.delhivery.com, Token auth),
// and pulls the exact 4x6 thermal label PDF Delhivery generates.
//
//   body: { action, ...fields }
//     ship   { batch_id, order_ref, weight_grams?, payment_mode?,
//              cod_amount?, declared_value? }   → create AWB for one order
//     label  { awb }                            → 4x6 packing-slip PDF link
//     track  { awbs?: [] | batch_id? }          → refresh Delhivery statuses
//     cancel { batch_id, order_ref }            → cancel an AWB
//
// The data source is label_batches.shipments[] — each packing-slip order
// carries its parsed { customer:{name,address,city,state,pin,phone}, items }
// (see parsePackingSlipFiles in src/supabase.js). The returned AWB is
// written back onto that shipment entry so it flows into the existing
// AWB / tracking column and the client's Orders view automatically.
//
// Secrets: the Delhivery token is read from env AVIVA_DELHIVERY_API_TOKEN
// (this repo is PUBLIC — never hardcode it). The registered pickup name
// is AVIVA_DELHIVERY_PICKUP, defaulting to "Aviva International" (must
// match the warehouse registered in Aviva's Delhivery panel exactly).

import { sb, authedCaller } from "./_velocity-track.js";

const BASE = "https://track.delhivery.com";
const PICKUP = process.env.AVIVA_DELHIVERY_PICKUP || "Aviva International";
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const cleanRef = (r) => String(r || "").replace(/^#/, "").trim();

function token() {
  const t = process.env.AVIVA_DELHIVERY_API_TOKEN;
  if (!t) throw new Error("AVIVA_DELHIVERY_API_TOKEN not set in Vercel env — add Aviva's Delhivery API token (Delhivery panel → Settings → API Setup) and redeploy.");
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

// Admin/staff gate — clients (who carry a tenant_id) may not ship.
async function authedAdmin(req) {
  const { user, profile } = await authedCaller(req);
  if (!profile || profile.role === "client") throw new Error("admin-only");
  return { user, profile };
}

async function getBatch(batchId) {
  const rows = await sb(`label_batches?id=eq.${encodeURIComponent(batchId)}&select=id,tenant_id,order_code,batch_date,shipments`);
  const b = rows?.[0];
  if (!b) throw new Error(`batch ${batchId} not found`);
  return b;
}

function findShip(batch, orderRef) {
  const ships = Array.isArray(batch.shipments) ? batch.shipments : [];
  const i = ships.findIndex((s) => s && s.order_ref === orderRef);
  if (i < 0) throw new Error(`order ${orderRef} not found on ${batch.order_code || batch.id}`);
  return { ships, i, ship: ships[i] };
}

// Persist a patched shipment entry back onto the batch's JSONB array.
async function patchShip(batch, ships, i, patch) {
  ships[i] = { ...ships[i], ...patch };
  await sb(`label_batches?id=eq.${encodeURIComponent(batch.id)}`, {
    method: "PATCH", prefer: "return=minimal",
    body: JSON.stringify({ shipments: ships, updated_at: new Date().toISOString() }),
  });
  return ships[i];
}

function itemsSummary(items) {
  const arr = Array.isArray(items) ? items : [];
  const units = arr.reduce((s, it) => s + num(it.qty), 0);
  const desc = arr
    .map((it) => `${it.productName || it.product_name || "Item"}${it.size ? ` (${it.size})` : ""} x${num(it.qty) || 1}`)
    .join(", ")
    .slice(0, 250);
  return { units: units || arr.length || 1, desc: desc || "Apparel" };
}

// ─── ship — create a Delhivery shipment for one packing-slip order ───
async function actionShip(b) {
  const { batch_id, order_ref } = b;
  if (!batch_id || !order_ref) throw new Error("batch_id and order_ref required");

  const batch = await getBatch(batch_id);
  const { ships, i, ship } = findShip(batch, order_ref);
  if (ship.awb) throw new Error(`${order_ref} already has AWB ${ship.awb}`);

  const c = ship.customer || {};
  const name = (c.name || "").trim();
  const add = (c.address || "").trim();
  const pin = String(c.pin || "").replace(/\D/g, "");
  const phone = String(c.phone || "").replace(/\s/g, "");
  if (!name || !add || !pin || !phone) {
    throw new Error(`${order_ref} is missing delivery details (need name, address, pin, phone). Re-upload the packing slip or fix the order.`);
  }

  const { units, desc } = itemsSummary(ship.items);
  const paymentMode = /cod/i.test(b.payment_mode || "") ? "COD" : "Prepaid";
  const declared = num(b.declared_value);
  const codAmount = paymentMode === "COD" ? (b.cod_amount != null ? num(b.cod_amount) : declared) : 0;
  const weight = parseInt(b.weight_grams, 10) || 500;

  // seller name = the client's brand
  let seller = "Aviva";
  try {
    const t = await sb(`tenants?id=eq.${encodeURIComponent(batch.tenant_id)}&select=name`);
    if (t?.[0]?.name) seller = t[0].name;
  } catch { /* non-fatal */ }

  const shipment = {
    name, add, pin, phone,
    city: c.city || "", state: c.state || "", country: c.country || "India",
    order: cleanRef(order_ref),
    payment_mode: paymentMode,
    products_desc: desc,
    cod_amount: codAmount ? String(codAmount) : "",
    order_date: (batch.batch_date || new Date().toISOString()).slice(0, 10),
    total_amount: String(declared || codAmount || 0),
    seller_name: seller,
    seller_inv: cleanRef(order_ref),
    quantity: String(units),
    weight: String(weight),
    shipment_width: "", shipment_height: "",
    waybill: "",
  };

  const payload = { shipments: [shipment], pickup_location: { name: PICKUP } };
  const resp = await dlForm("/api/cmu/create.json", payload);

  const pkg = (resp.packages || [])[0] || {};
  const ok = resp.success === true && pkg.status && /success/i.test(pkg.status);
  const awb = pkg.waybill || null;
  if (!ok || !awb) {
    const remark = (pkg.remarks && pkg.remarks.join("; ")) || resp.rmk || resp.error || JSON.stringify(resp).slice(0, 300);
    throw new Error(`Delhivery rejected the shipment: ${remark}`);
  }

  await patchShip(batch, ships, i, {
    awb, courier: "Delhivery", payment_mode: paymentMode,
    cod_amount: codAmount, weight_grams: weight,
    ship_status: "created", ship_status_label: "Manifested",
    shipped_at: new Date().toISOString(),
  });

  return { awb, order_ref, order_code: batch.order_code, payment_mode: paymentMode, cod_amount: codAmount, pickup: PICKUP };
}

// ─── label — Delhivery's exact 4x6 thermal label PDF ─────────────────
async function actionLabel(b) {
  const awb = b.awb;
  if (!awb) throw new Error("awb required");
  const j = await dlGet(`/api/p/packing_slip?wbns=${encodeURIComponent(awb)}&pdf=true&pdf_size=4R`);
  const pkg = (j.packages || [])[0] || {};
  const url = pkg.pdf_download_link || j.pdf_download_link || null;
  if (!url) throw new Error(`No label PDF returned for ${awb}. The shipment may still be processing — try again shortly.`);

  // best-effort: stamp label_url onto the matching shipment entry
  if (b.batch_id && b.order_ref) {
    try {
      const batch = await getBatch(b.batch_id);
      const { ships, i } = findShip(batch, b.order_ref);
      await patchShip(batch, ships, i, { label_url: url });
    } catch { /* non-fatal */ }
  }
  return { awb, label_url: url };
}

// ─── track — refresh Delhivery statuses ──────────────────────────────
function mapDl(statusType, status) {
  const s = (status || "").toLowerCase();
  const t = (statusType || "").toUpperCase();
  if (t === "DL" || /delivered/.test(s)) return { code: "delivered", label: "Delivered" };
  if (/rto/.test(s) || t === "RT") return { code: "rto", label: "RTO" };
  if (/out for delivery/.test(s)) return { code: "in_transit", label: "Out for delivery" };
  if (/manifest|pickup|created/.test(s)) return { code: "created", label: status || "Manifested" };
  if (/cancel/.test(s)) return { code: "cancelled", label: "Cancelled" };
  return { code: "in_transit", label: status || statusType || "In transit" };
}

async function actionTrack(b) {
  let list = Array.isArray(b.awbs) ? b.awbs.filter(Boolean) : [];
  if (!list.length && b.batch_id) {
    const batch = await getBatch(b.batch_id);
    list = (batch.shipments || []).map((s) => s?.awb).filter(Boolean);
  }
  if (!list.length) return { statuses: {} };
  const statuses = {};
  const chunk = list.slice(0, 50).join(",");
  const j = await dlGet(`/api/v1/packages/json/?waybill=${encodeURIComponent(chunk)}`);
  for (const d of j.ShipmentData || []) {
    const sh = d.Shipment || {};
    const awb = sh.AWB || sh.Waybill;
    const stt = sh.Status || {};
    if (!awb) continue;
    statuses[awb] = { ...mapDl(stt.StatusType, stt.Status), location: stt.StatusLocation || null, at: stt.StatusDateTime || null };
  }
  return { statuses };
}

// ─── cancel ──────────────────────────────────────────────────────────
async function actionCancel(b) {
  const { batch_id, order_ref } = b;
  if (!batch_id || !order_ref) throw new Error("batch_id and order_ref required");
  const batch = await getBatch(batch_id);
  const { ships, i, ship } = findShip(batch, order_ref);
  if (!ship.awb) throw new Error(`${order_ref} has no AWB to cancel`);
  const resp = await dlForm("/api/p/edit", { waybill: ship.awb, cancellation: "true" });
  if (resp.status === false || resp.error) throw new Error(`Delhivery cancel failed: ${resp.error || JSON.stringify(resp).slice(0, 200)}`);
  await patchShip(batch, ships, i, { awb: null, courier: null, ship_status: "cancelled", ship_status_label: "Cancelled", label_url: null });
  return { ok: true, order_ref };
}

const ACTIONS = {
  ship:   actionShip,
  label:  actionLabel,
  track:  actionTrack,
  cancel: actionCancel,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    await authedAdmin(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const fn = ACTIONS[body.action];
    if (!fn) return res.status(400).json({ error: `unknown action: ${body.action}`, valid: Object.keys(ACTIONS) });
    const data = await fn(body);
    return res.status(200).json({ data });
  } catch (e) {
    console.error("aviva-delhivery error", e);
    const code = /admin-only|invalid token|missing bearer|no profile/i.test(e.message || "") ? 401 : 500;
    return res.status(code).json({ error: e.message || String(e) });
  }
}
