// Vercel serverless function — fetches live shipment statuses from
// Velocity Shipping for one tenant's AWBs.
//
// POST /api/velocity?action=track
//   headers: Authorization: Bearer <supabase access token>      (admin only)
//   body:    { tenant_id: "t-balleti", awbs: ["...", "..."] }
//   returns: {
//     statuses: {
//       "<awb>": {
//         status_raw: "rto_initiated",     // Velocity's raw status
//         status_label: "RTO in transit",  // Friendly label for the UI
//         variant: "rto",                  // Pill color class
//         last_activity: "2026-05-12T...", // Latest activity timestamp
//         last_activity_text: "...",       // Latest activity description
//         track_url: "https://shipfastt.in/track/...",
//       }
//     },
//     not_found: ["<awb>", ...]          // AWBs Velocity didn't recognise
//   }
//
// Token caching: tenants.velocity_token + .velocity_token_expires_at.
// We only re-auth when the cached token is missing or stale.

const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

const VELOCITY_BASE = "https://shazam.velocity.in";

export async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// Auth gate — returns the resolved profile so the handler can enforce
// per-tenant scope. Admins/workers see everything; clients can only
// query tracking for their own tenant_id. The handler call site is
// responsible for comparing requested tenant_id against profile.tenant_id
// when the caller is a client.
async function authedCaller(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("missing bearer token");
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error("invalid token");
  const user = await r.json();
  const profileRows = await sb(`profiles?id=eq.${user.id}&select=id,role,tenant_id`);
  const profile = profileRows?.[0];
  if (!profile) throw new Error("no profile");
  return { user, profile };
}

// Friendly label + variant for the admin UI pill. Mapping is opinionated
// — collapses ~30 raw statuses into ~7 user-facing buckets.
function mapStatus(raw) {
  const s = (raw || "").toLowerCase();
  if (s === "delivered" || s === "return_delivered") {
    return { label: "Delivered", variant: "ok" };
  }
  if (s === "rto_delivered") {
    return { label: "RTO delivered", variant: "rto" };
  }
  if (s.startsWith("rto_") || s === "rto_initiated") {
    return { label: s === "rto_initiated" ? "RTO initiated" :
                   s === "rto_in_transit" ? "RTO in transit" :
                   s === "rto_cancelled" ? "RTO cancelled" :
                   s === "rto_need_attention" ? "RTO needs attention" : "RTO",
             variant: "rto" };
  }
  if (s === "out_for_delivery") return { label: "Out for delivery", variant: "ofd" };
  if (s === "in_transit" || s === "return_in_transit") return { label: "In transit", variant: "transit" };
  if (s === "ndr_raised" || s === "return_ndr_raised" || s === "need_attention" || s === "return_need_attention") {
    return { label: "Needs attention", variant: "warn" };
  }
  if (s === "reattempt_delivery") return { label: "Re-attempt scheduled", variant: "warn" };
  if (s === "pickup_scheduled" || s === "return_pickup_scheduled") {
    return { label: "Pickup scheduled", variant: "waiting" };
  }
  if (s === "ready_for_pickup") return { label: "Waiting for pickup", variant: "waiting" };
  if (s === "pending") return { label: "Pending", variant: "waiting" };
  if (s === "processing") return { label: "Processing", variant: "waiting" };
  if (s === "not_picked" || s === "return_not_picked") {
    return { label: "Pickup failed", variant: "warn" };
  }
  if (s === "rejected" || s === "return_rejected") {
    return { label: "Rejected", variant: "muted" };
  }
  if (s === "cancelled" || s === "return_cancelled") {
    return { label: "Cancelled", variant: "muted" };
  }
  if (s === "lost") return { label: "Lost", variant: "danger" };
  if (s === "return_qc_failed") return { label: "Return QC failed", variant: "danger" };
  if (s === "externally_fulfilled") return { label: "Externally fulfilled", variant: "muted" };
  if (!s) return { label: "—", variant: "muted" };
  // Fallback — title-case the raw status so we always show something
  return { label: raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), variant: "muted" };
}

// Pull a fresh token from Velocity using the tenant's stored credentials.
// Caches token + expiry back on the tenant row so we don't re-auth every
// request — token is good for 24h.
async function ensureVelocityToken(tenant) {
  const now = new Date();
  if (tenant.velocity_token && tenant.velocity_token_expires_at) {
    const exp = new Date(tenant.velocity_token_expires_at);
    // 60s safety buffer before expiry
    if (exp.getTime() - now.getTime() > 60_000) return tenant.velocity_token;
  }
  if (!tenant.velocity_username || !tenant.velocity_password) {
    throw new Error("Velocity credentials not configured for this tenant");
  }
  const r = await fetch(`${VELOCITY_BASE}/custom/api/v1/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: tenant.velocity_username,
      password: tenant.velocity_password,
    }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`Velocity auth failed (${r.status}): ${body.slice(0, 200)}`);
  let parsed;
  try { parsed = JSON.parse(body); } catch { throw new Error("Velocity auth returned non-JSON"); }
  if (!parsed.token) throw new Error("Velocity auth returned no token");

  // Velocity returns expires_at as ISO without timezone — assume IST (UTC+5:30)
  // is the safest fallback, but to be conservative we just cache for 23h
  // from now rather than trusting their string.
  const expiresAt = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  await sb(`tenants?id=eq.${encodeURIComponent(tenant.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      velocity_token: parsed.token,
      velocity_token_expires_at: expiresAt.toISOString(),
    }),
    prefer: "return=minimal",
  });
  return parsed.token;
}

// Core: fetch live statuses for one tenant's AWBs AND persist any RTO
// transition onto the owning batch. Shared by the on-demand track handler
// and the every-minute sync sweep (_velocity-sync.js). Throws on hard
// errors; RTO persistence is best-effort.
export async function trackAndPersist(tenantId, awbs) {
  if (!awbs || awbs.length === 0) return { statuses: {}, not_found: [] };

  const tenantRows = await sb(
    `tenants?id=eq.${encodeURIComponent(tenantId)}&select=id,velocity_username,velocity_password,velocity_token,velocity_token_expires_at`,
  );
  const tenant = tenantRows?.[0];
  if (!tenant) return { statuses: {}, not_found: awbs, warning: "tenant not found" };
  if (!tenant.velocity_username || !tenant.velocity_password) {
    return { statuses: {}, not_found: awbs, warning: "Velocity credentials not configured for this tenant" };
  }

  const token = await ensureVelocityToken(tenant);

  const trackRes = await fetch(`${VELOCITY_BASE}/custom/api/v1/order-tracking`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ awbs }),
  });
  const trackText = await trackRes.text();
  if (!trackRes.ok) {
    if (trackRes.status === 401) {
      await sb(`tenants?id=eq.${encodeURIComponent(tenantId)}`, {
        method: "PATCH",
        body: JSON.stringify({ velocity_token: null, velocity_token_expires_at: null }),
        prefer: "return=minimal",
      });
    }
    const err = new Error(`velocity-track failed (${trackRes.status}): ${trackText.slice(0, 400)}`);
    err.status = trackRes.status;
    throw err;
  }
  let trackJson;
  try { trackJson = JSON.parse(trackText); } catch { throw new Error("Velocity returned non-JSON"); }

  const statuses = {};
  const result = (trackJson && trackJson.result) || {};
  const notFound = [];
  for (const awb of awbs) {
    const entry = result[awb];
    const td = entry && entry.tracking_data;
    if (!td) { notFound.push(awb); continue; }
    const raw = td.shipment_status || (td.shipment_track && td.shipment_track[0] && td.shipment_track[0].current_status) || "";
    const { label, variant } = mapStatus(raw);
    const acts = Array.isArray(td.shipment_track_activities) ? td.shipment_track_activities : [];
    const latest = acts[0];
    statuses[awb] = {
      status_raw: raw || null,
      status_label: label,
      variant,
      last_activity: latest?.date || null,
      last_activity_text: latest?.activity || null,
      track_url: td.track_url || null,
    };
  }

  // ── Auto-capture RTO onto the batch ──────────────────────────────
  // Forward-only (never downgrade); best-effort so a write failure can't
  // break the tracking payload.
  let rtoApplied = 0;
  try {
    const RANK = { uploaded: 0, in_production: 1, ready_to_dispatch: 2, dispatched: 3, delivered: 4, rto_in_transit: 5, rto: 6 };
    const wanted = [];
    for (const awb of awbs) {
      const st = statuses[awb];
      if (!st || st.variant !== "rto") continue;
      wanted.push({ awb, target: st.status_raw === "rto_delivered" ? "rto" : "rto_in_transit" });
    }
    if (wanted.length) {
      const batches = await sb(`label_batches?tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,status,shipments`);
      for (const w of wanted) {
        const batch = (batches || []).find(b => Array.isArray(b.shipments) && b.shipments.some(s => s && s.awb === w.awb));
        if (!batch) continue;
        if ((RANK[w.target] ?? -1) > (RANK[batch.status] ?? -1)) {
          await sb(`label_batches?id=eq.${encodeURIComponent(batch.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ status: w.target, updated_at: new Date().toISOString() }),
            prefer: "return=minimal",
          });
          rtoApplied++;
        }
      }
    }
  } catch (e) {
    console.error("rto auto-capture", e?.message || e);
  }

  return { statuses, not_found: notFound, rto_applied: rtoApplied };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { profile } = await authedCaller(req);

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const tenantId = String(body.tenant_id || "").trim();
    const awbs = Array.isArray(body.awbs)
      ? Array.from(new Set(body.awbs.map(a => String(a || "").trim()).filter(Boolean)))
      : [];

    if (!tenantId) return res.status(400).json({ error: "tenant_id is required" });

    // Scope enforcement: admins/workers can query any tenant; client-role
    // callers can only query their own tenant_id.
    const isStaff = profile.role === "admin" || profile.role === "founder" || profile.role === "worker";
    if (!isStaff && profile.tenant_id !== tenantId) {
      return res.status(403).json({ error: "not authorised to track this tenant's shipments" });
    }
    if (awbs.length === 0) return res.status(200).json({ statuses: {}, not_found: [] });

    const out = await trackAndPersist(tenantId, awbs);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(e?.status || 500).json({ error: e.message || String(e) });
  }
}
