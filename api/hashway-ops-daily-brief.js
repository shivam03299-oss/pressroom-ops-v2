// Daily founder brief — pushed to FOUNDER_WA_NUMBER at 9am IST.
//
// Two auth paths:
//   1. Cron — Vercel cron pings with Authorization: Bearer $CRON_SECRET
//   2. Manual — founder can hit it from the UI for a fresh brief any time
//
// Sends one templated WhatsApp message via the `hashway_internal_daily_brief`
// template (must be approved in AiSensy/Meta first). Until the template is
// approved AND AISENSY_API_KEY is set, this still runs end-to-end and
// records a dry-run message — useful for verifying the data + format
// before going live.

import { sb, authedFounder, FOUNDER_WA_NUMBER, audit } from "./_hashway-ops-shared.js";
import { sendTemplate } from "./hashway-wa-send.js";

const TEMPLATE_NAME = "hashway_internal_daily_brief";
const INBOX_URL     = "https://pressroom-ops-v2.vercel.app/admin";

function fmtDate() {
  const d = new Date();
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

async function gatherStats() {
  const startOfTodayIST = new Date();
  startOfTodayIST.setHours(0, 0, 0, 0);
  // crude: IST = UTC+5:30 — subtract that to align day boundary
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const sinceIso = new Date(startOfTodayIST.getTime() - istOffsetMs).toISOString();
  const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [pending, executedToday, failedToday, dmsToday, undispatched] = await Promise.all([
    sb(`hashway_ops_tasks?status=eq.pending&select=id`).then(r => r?.length || 0),
    sb(`hashway_ops_tasks?status=eq.executed&updated_at=gte.${encodeURIComponent(sinceIso)}&select=id`).then(r => r?.length || 0),
    sb(`hashway_ops_tasks?status=eq.failed&updated_at=gte.${encodeURIComponent(sinceIso)}&select=id`).then(r => r?.length || 0),
    sb(`hashway_ops_wa_messages?direction=eq.in&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`).then(r => r?.length || 0),
    sb(`shopify_orders?tenant_id=eq.t-hashway&financial_status=eq.paid&fulfillment_status=is.null&created_at=lte.${encodeURIComponent(dayAgoIso)}&select=id`).then(r => r?.length || 0),
  ]);
  return { pending, executedToday, failedToday, dmsToday, undispatched };
}

async function runBrief({ triggeredBy }) {
  const stats = await gatherStats();
  const params = [
    fmtDate(),
    String(stats.pending),
    String(stats.executedToday),
    String(stats.failedToday),
    String(stats.dmsToday),
    String(stats.undispatched),
    INBOX_URL,
  ];

  const result = await sendTemplate({
    to:           FOUNDER_WA_NUMBER,
    templateName: TEMPLATE_NAME,
    params,
    customerName: "Founder",
  });

  await audit({
    actorType: triggeredBy === "cron" ? "cron" : "founder",
    actorId:   triggeredBy === "cron" ? "daily_brief_cron" : "founder",
    action:    "daily_brief.sent",
    entityType: "wa_thread",
    entityId:  result.thread_id || null,
    payload:   { stats, params, dry_run: !!result.dry_run, error: result.error || null },
  });

  return { stats, params, send_result: result };
}

export default async function handler(req, res) {
  // Allow GET (Vercel cron) and POST (manual / debug).
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "GET or POST only" });
  }

  // Auth: Vercel cron OR founder.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  try {
    if (!isCron) {
      // Founder must be signed in for manual trigger.
      await authedFounder(req);
    }
    const result = await runBrief({ triggeredBy: isCron ? "cron" : "manual" });
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    const msg = e?.message || String(e);
    const status = /founder-only|missing bearer|invalid token/.test(msg) ? 401 : 500;
    return res.status(status).json({ error: msg });
  }
}
