// Cron-triggered Shopify order sync. Runs every minute (see vercel.json
// crons) to pull new/updated orders for every connected store into
// shopify_orders, so the confirmation-call queue stays live without
// anyone clicking "sync".
//
// Auth: Vercel attaches `Authorization: Bearer <CRON_SECRET>` to cron
// requests when CRON_SECRET is set in the project env. We verify it so
// the endpoint can't be hit anonymously. (Reuses the exact upsert logic
// from _shopify-sync.js — insert new as pod_status='new', update without
// clobbering pod_status.)

import { sb, syncOrdersForTenant } from "./_shopify-sync.js";

export default async function handler(req, res) {
  // Auth: accept the Vercel CRON_SECRET bearer, OR a secret stored in
  // app_config (key `shopify_autosync_secret`) so a Supabase pg_cron job can
  // drive this every minute without needing a Vercel env var. Either matches.
  const bearer = (req.headers.authorization || req.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  const envSecret = process.env.CRON_SECRET;
  let authed = !!envSecret && bearer === envSecret;
  if (!authed && bearer) {
    try {
      const rows = await sb(`app_config?key=eq.shopify_autosync_secret&select=value`);
      const cfg = rows?.[0]?.value;
      authed = !!cfg && bearer === cfg;
    } catch { /* fall through to 401 */ }
  }
  if (!authed) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    // Every tenant with a live Shopify token auto-syncs. (Today: Hashway.)
    const tenants = await sb(`tenants?shopify_access_token=not.is.null&shopify_domain=not.is.null&select=id,shopify_domain,shopify_access_token`);
    // Incremental: only orders changed in the last ~10 min (overlap covers a
    // missed tick), and skip the catalog re-pull so per-minute runs stay cheap.
    const updatedAtMin = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const out = [];
    for (const t of tenants || []) {
      try {
        const r = await syncOrdersForTenant(t, { updatedAtMin, skipProducts: true });
        out.push({ tenant: t.id, inserted: r.inserted, updated: r.updated, fetched: r.fetched });
      } catch (e) {
        out.push({ tenant: t.id, error: String(e.message || e).slice(0, 200) });
      }
    }
    return res.status(200).json({ ok: true, ran: out.length, results: out });
  } catch (e) {
    console.error("[shopify-autosync]", e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
