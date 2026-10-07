// Pincode lookup for the client Create-Order form. Returns as much detail as
// we can for a 6-digit Indian pincode:
//   • India Post (public)      → state, district, areas / post-offices, circle
//   • Delhivery serviceability → serviceable? COD? prepaid? pickup? ODA? zone
// Public, read-only, heavily cached (pincode data is static). The Delhivery
// token stays server-side (env AVIVA_DELHIVERY_API_TOKEN or app_config).

import { sb } from "./_velocity-track.js";

const DL_BASE = "https://track.delhivery.com";

async function delhiveryToken() {
  if (process.env.AVIVA_DELHIVERY_API_TOKEN) return process.env.AVIVA_DELHIVERY_API_TOKEN;
  try {
    const rows = await sb("app_config?key=eq.aviva_delhivery_token&select=value");
    const v = rows?.[0]?.value;
    if (v) process.env.AVIVA_DELHIVERY_API_TOKEN = v;
    return v || null;
  } catch { return null; }
}

async function indiaPost(pin) {
  try {
    const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { headers: { Accept: "application/json" } });
    const j = await r.json().catch(() => null);
    const rec = Array.isArray(j) ? j[0] : null;
    const pos = rec && rec.Status === "Success" && Array.isArray(rec.PostOffice) ? rec.PostOffice : [];
    if (!pos.length) return null;
    const first = pos[0];
    return {
      state: first.State || null,
      district: first.District || null,
      division: first.Division || null,
      region: first.Region || null,
      circle: first.Circle || null,
      country: first.Country || "India",
      areas: [...new Set(pos.map(p => p.Name).filter(Boolean))],
      post_offices: pos.map(p => ({ name: p.Name, type: p.BranchType, delivery: p.DeliveryStatus })),
    };
  } catch { return null; }
}

async function delhiveryServiceability(pin) {
  const token = await delhiveryToken();
  if (!token) return null;
  try {
    const r = await fetch(`${DL_BASE}/c/api/pin-codes/json/?filter_codes=${pin}`, {
      headers: { Authorization: `Token ${token}`, Accept: "application/json" },
    });
    const j = await r.json().catch(() => ({}));
    const pc = ((j.delivery_codes || [])[0] || {}).postal_code;
    if (!pc) return { serviceable: false };
    const yn = (v) => String(v == null ? "" : v).toUpperCase() === "Y";
    return {
      serviceable: true,
      cod: yn(pc.cod != null ? pc.cod : pc.cash),
      prepaid: yn(pc.pre_paid),
      pickup: yn(pc.pickup),
      oda: yn(pc.is_oda),
      district: pc.district || null,
      state_code: pc.state_code || null,
      sort_code: pc.sort_code || null,
      max_amount: pc.max_amount || null,
      remarks: Array.isArray(pc.remarks) ? pc.remarks.filter(Boolean) : (pc.remarks ? [pc.remarks] : []),
    };
  } catch { return null; }
}

export default async function handler(req, res) {
  try {
    const raw = (req.query && req.query.pin) ||
      (typeof req.body === "string" ? (JSON.parse(req.body || "{}").pin) : (req.body && req.body.pin)) || "";
    const pin = String(raw).replace(/\D/g, "");
    if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: "6-digit pincode required" });

    const [ip, dl] = await Promise.all([indiaPost(pin), delhiveryServiceability(pin)]);
    if (!ip && !dl) return res.status(404).json({ pin, found: false });

    res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=86400, stale-while-revalidate=604800");
    return res.status(200).json({
      pin,
      found: true,
      city: ip?.district || dl?.district || null,
      district: ip?.district || dl?.district || null,
      state: ip?.state || null,
      state_code: dl?.state_code || null,
      areas: ip?.areas || [],
      post_offices: ip?.post_offices || [],
      division: ip?.division || null,
      region: ip?.region || null,
      circle: ip?.circle || null,
      country: ip?.country || "India",
      serviceability: dl || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
