// Every-minute sweep — the hands-off counterpart to /api/velocity-track.
// Polls Velocity for every velocity-enabled tenant's active (shipped,
// non-terminal) AWBs and auto-captures RTO transitions onto their batches
// (rto_in_transit / rto), which in turn feeds the RTOs section + RTO
// inventory. Invoked once a minute by a Supabase pg_cron job (pg_net POST)
// — or by Vercel cron. Gated by a shared secret so only the scheduler runs it.

import { sb, trackAndPersist } from "./_velocity-track.js";

// Value the pg_cron job sends. Inlined to mirror this codebase's existing
// pattern (the Supabase service-role key is also inlined in _velocity-track).
const SYNC_SECRET = "aviva-rto-sync-7Yt2Qe9KpXm4";

// Batch statuses whose AWBs are worth polling: shipped but not yet terminal.
// 'rto' (already received) and pre-dispatch states are skipped to save quota.
const ACTIVE_FILTER = "(dispatched,delivered,rto_in_transit)";

export default async function handler(req, res) {
  // Accept the inline secret (pg_cron) or Vercel's injected CRON_SECRET.
  const bearer = (req.headers.authorization || req.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  const given = bearer || req.headers["x-sync-secret"] || "";
  const ok = given === SYNC_SECRET || (process.env.CRON_SECRET && given === process.env.CRON_SECRET);
  if (!ok) return res.status(401).json({ error: "unauthorised" });

  try {
    const tenants = await sb(`tenants?velocity_username=not.is.null&select=id`);
    const summary = [];
    for (const t of tenants || []) {
      try {
        const batches = await sb(
          `label_batches?tenant_id=eq.${encodeURIComponent(t.id)}&status=in.${ACTIVE_FILTER}&select=shipments`,
        );
        const awbs = Array.from(new Set(
          (batches || []).flatMap(b => Array.isArray(b.shipments) ? b.shipments.map(s => s && s.awb).filter(Boolean) : []),
        ));
        if (!awbs.length) { summary.push({ tenant: t.id, awbs: 0, rto_applied: 0 }); continue; }
        const out = await trackAndPersist(t.id, awbs);
        summary.push({ tenant: t.id, awbs: awbs.length, rto_applied: out.rto_applied || 0 });
      } catch (e) {
        summary.push({ tenant: t.id, error: e.message || String(e) });
      }
    }
    return res.status(200).json({ ok: true, ran_at: new Date().toISOString(), tenants: summary });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
