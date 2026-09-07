// Shared Delhivery One client for the founder's own Shopify stores
// (Yoraku, Nothing Studios).
//
// Production host is track.delhivery.com — the same host serves the
// cookie-auth dashboard, so anything that comes back as HTML means the
// path is a dashboard page, not an API endpoint. Auth is the literal
// word "Token", not "Bearer".
//
// Both brands currently sit on ONE Delhivery account, so a single token
// serves both. The per-brand keys below exist so either brand can be
// split onto its own account later without touching any call site.
//
// Secrets — env first, app_config table as fallback (so a rotated key is
// two SQL updates and no redeploy):
//   YORAKU_DELHIVERY_API_TOKEN     app_config: yoraku_delhivery_token
//   NOTHING_DELHIVERY_API_TOKEN    app_config: nothing_delhivery_token
//   YORAKU_DELHIVERY_PICKUP        app_config: yoraku_delhivery_pickup
//   NOTHING_DELHIVERY_PICKUP       app_config: nothing_delhivery_pickup
// The pickup name must match the warehouse registered in the Delhivery
// panel character for character or every manifest call is rejected.

import { sb } from "./_velocity-track.js";

export const BASE = "https://track.delhivery.com";

export const BRANDS = {
  yoraku:  { label: "Yoraku",          env: "YORAKU",  shop: "1tfust-us.myshopify.com" },
  nothing: { label: "Nothing Studios", env: "NOTHING", shop: "ekfmkg-5h.myshopify.com" },
};

const norm = (b) => (BRANDS[String(b || "").toLowerCase()] ? String(b).toLowerCase() : "yoraku");

// app_config is read once per cold start; a rotation lands on the next one.
let _cfgCache = null;
async function appConfig() {
  if (_cfgCache) return _cfgCache;
  try {
    const keys = "yoraku_delhivery_token,nothing_delhivery_token,yoraku_delhivery_pickup,nothing_delhivery_pickup";
    const rows = await sb(`app_config?key=in.(${keys})&select=key,value`);
    _cfgCache = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  } catch { _cfgCache = {}; }
  return _cfgCache;
}

export async function token(brand) {
  const b = norm(brand);
  const e = BRANDS[b].env;
  // Own key → shared-account key (yoraku holds the shared token today).
  const direct = process.env[`${e}_DELHIVERY_API_TOKEN`] || process.env.YORAKU_DELHIVERY_API_TOKEN;
  if (direct) return direct;
  const cfg = await appConfig();
  const t = cfg[`${b}_delhivery_token`] || cfg.yoraku_delhivery_token;
  if (!t) {
    throw new Error(
      `Delhivery token missing for ${BRANDS[b].label}. Set ${e}_DELHIVERY_API_TOKEN in Vercel env ` +
      `(Delhivery panel → Settings → API Setup), or add app_config.${b}_delhivery_token.`
    );
  }
  return t;
}

export async function pickupName(brand) {
  const b = norm(brand);
  const fromEnv = process.env[`${BRANDS[b].env}_DELHIVERY_PICKUP`];
  if (fromEnv) return fromEnv;
  const cfg = await appConfig();
  const t = cfg[`${b}_delhivery_pickup`];
  if (!t) throw new Error(`No Delhivery pickup location configured for ${BRANDS[b].label}. Set ${BRANDS[b].env}_DELHIVERY_PICKUP to the warehouse name exactly as it appears in the Delhivery panel.`);
  return t;
}

// ── transport ────────────────────────────────────────────────────────
function parse(text) {
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

export async function dlGet(brand, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Token ${await token(brand)}`, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Delhivery ${res.status}: ${text.slice(0, 300)}`);
  if (/^\s*</.test(text)) throw new Error("Delhivery returned the dashboard HTML — that path is not an API endpoint, or the token is not accepted there.");
  return parse(text);
}

// Delhivery's classic create/edit endpoints take format=json&data=<json>.
export async function dlForm(brand, path, dataObj) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${await token(brand)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: `format=json&data=${encodeURIComponent(JSON.stringify(dataObj))}`,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Delhivery ${res.status}: ${text.slice(0, 400)}`);
  return parse(text);
}

// ── operations ───────────────────────────────────────────────────────

// Is this pin serviceable, and for COD / prepaid / pickup?
export async function serviceability(brand, pin) {
  const j = await dlGet(brand, `/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(String(pin).replace(/\D/g, ""))}`);
  const p = ((j.delivery_codes || [])[0] || {}).postal_code;
  if (!p) return { pin, serviceable: false };
  return {
    pin: p.pin, serviceable: true, state: p.state_code, district: p.district,
    cod: p.cod === "Y", prepaid: p.pre_paid === "Y", pickup: p.pickup === "Y",
    oda: p.is_oda === "Y", sort_code: p.sort_code,
  };
}

// Freight estimate before you commit to a shipment.
// mode: "E" (express/surface) · payment: "Pre-paid" | "COD"
export async function rate(brand, { originPin, destPin, grams = 500, mode = "E", payment = "Pre-paid", status = "Delivered" }) {
  const q = new URLSearchParams({
    md: mode, ss: status, o_pin: String(originPin), d_pin: String(destPin),
    cgm: String(grams), pt: payment,
  });
  const j = await dlGet(brand, `/api/kinko/v1/invoice/charges/.json?${q}`);
  const r = Array.isArray(j) ? j[0] : j;
  return { zone: r?.zone, charged_weight: r?.charged_weight, gross: r?.gross_amount, total: r?.total_amount, raw: r };
}

// Waybills are drawn from the account's pool — each call consumes them.
export async function waybills(brand, count = 1) {
  const j = await dlGet(brand, `/waybill/api/bulk/json/?count=${count}`);
  const list = typeof j === "string" ? j.split(",") : (j._raw ? String(j._raw).replace(/"/g, "").split(",") : []);
  return list.map((w) => String(w).replace(/"/g, "").trim()).filter(Boolean);
}

// Manifest a shipment. `shipment` follows Delhivery's CMU schema
// (name, add, pin, phone, order, payment_mode, cod_amount, ...).
export async function createShipment(brand, shipment, pickup) {
  const name = pickup || (await pickupName(brand));
  const resp = await dlForm(brand, "/api/cmu/create.json", {
    shipments: [shipment],
    pickup_location: { name },
  });
  const pkg = (resp.packages || [])[0] || {};
  const ok = resp.success === true && pkg.status && /success/i.test(pkg.status);
  if (!ok || !pkg.waybill) {
    const why = (pkg.remarks && pkg.remarks.join("; ")) || resp.rmk || resp.error || JSON.stringify(resp).slice(0, 300);
    throw new Error(`Delhivery rejected the shipment: ${why}`);
  }
  return { awb: pkg.waybill, pickup: name, raw: resp };
}

export async function track(brand, awb) {
  const j = await dlGet(brand, `/api/v1/packages/json/?waybill=${encodeURIComponent(awb)}`);
  const s = (j.ShipmentData || [])[0]?.Shipment;
  if (!s) return { awb, found: false };
  return {
    awb, found: true, status: s.Status?.Status, instructions: s.Status?.Instructions,
    location: s.Status?.StatusLocation, updated: s.Status?.StatusDateTime,
    delivered: /delivered/i.test(s.Status?.Status || ""), scans: s.Scans || [], raw: s,
  };
}

// One combined 4x6 thermal PDF for any number of waybills.
export async function labelPdf(brand, awbs) {
  const list = (Array.isArray(awbs) ? awbs : [awbs]).filter(Boolean);
  if (!list.length) throw new Error("awb(s) required");
  const j = await dlGet(brand, `/api/p/packing_slip?wbns=${encodeURIComponent(list.join(","))}&pdf=true&pdf_size=4R`);
  const url = ((j.packages || [])[0] || {}).pdf_download_link || j.pdf_download_link || null;
  if (!url) throw new Error("No label PDF returned — the shipment may still be processing.");
  return { awbs: list, label_url: url };
}

export async function cancelShipment(brand, awb) {
  // Same success test the Aviva/Hashway routes use: Delhivery signals
  // failure with status:false or an error field, not with status:true.
  const j = await dlForm(brand, "/api/p/edit", { waybill: String(awb), cancellation: "true" });
  if (j.status === false || j.error) {
    throw new Error(`Delhivery would not cancel ${awb}: ${j.error || j.remark || JSON.stringify(j).slice(0, 200)}`);
  }
  return { awb, cancelled: true };
}
