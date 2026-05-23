// Internal execution module + endpoint for manual re-execution.
//
// Called from hashway-ops-tasks.js immediately after approval, and
// exposed as POST /api/hashway-ops-execute for manual retry of failed
// executions.
//
// PHASE 1 SAFETY POSTURE: external API calls that move money or
// send customer-facing messages (Shopify refunds, WhatsApp replies)
// are recorded as `success=true, dry_run=true` rather than fired live.
// This lets the founder validate the whole loop end-to-end before
// we flip the switch in Phase 1.1.
//
// Internal-only actions (flag_escalation, flag_dispatch_delay) execute
// fully — they're just status changes in our own DB.

import { sb, authedFounder, audit, FOUNDER_EMAIL } from "./_hashway-ops-shared.js";
import { sendSessionMessage, sendTemplate } from "./hashway-wa-send.js";

// Exported so hashway-ops-tasks.js can call directly after approval.
export async function executeTask({ task, founder }) {
  const action = (task.proposed_action && task.proposed_action.action) || task.type;
  let result;
  try {
    switch (task.type) {
      // ─── WhatsApp — REAL execution (or dry-run if AISENSY_API_KEY absent) ───
      case "propose_reply_to_customer":
        result = await runWaReply({ task });
        break;
      case "wa_send_template":
        result = await runWaTemplate({ task });
        break;

      // ─── Phase 1.1 still dry-run for these (Shopify / Delhivery side effects) ───
      case "propose_refund":
      case "propose_replacement":
      case "propose_ndr_followup":
      case "propose_courier_switch":
      case "propose_pickup_followup":
        result = await runDryRun({ task, action });
        break;

      // ─── Internal flags execute fully ───
      case "flag_escalation":
      case "flag_dispatch_delay":
        result = await runInternalFlag({ task, action });
        break;

      default:
        result = { success: false, error: `no executor wired for task.type='${task.type}'` };
    }
  } catch (e) {
    result = { success: false, error: e?.message || String(e) };
  }

  // Persist execution row.
  await sb("hashway_ops_executions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      task_id:     task.id,
      action:      String(action || task.type),
      request:     task.proposed_action || {},
      result:      result.detail || {},
      success:     !!result.success,
      error:       result.success ? null : (result.error || "unknown"),
    }]),
  });

  // Update task status.
  await sb(`hashway_ops_tasks?id=eq.${encodeURIComponent(task.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: result.success ? "executed" : "failed" }),
  });

  await audit({
    actorType: "system",
    actorId:   founder?.email || "system",
    action:    result.success ? "task.executed" : "task.execution_failed",
    entityType:"task",
    entityId:  task.id,
    payload:   { dry_run: !!result.dry_run, error: result.error || null },
  });

  return result;
}

// ─── Executors ───────────────────────────────────────────────────

async function runDryRun({ task, action }) {
  // Phase 1: record what WOULD have been sent, without firing live API.
  return {
    success: true,
    dry_run: true,
    detail: {
      message: "Phase-1 dry run — no external API was called.",
      would_have_executed: action,
      payload: task.payload || {},
      proposed_action: task.proposed_action || {},
    },
  };
}

async function runWaReply({ task }) {
  const p = task.payload || {};
  const a = task.proposed_action?.params || {};
  const to   = a.to   || p.phone || task.external_ref;
  const body = a.body || p.reply_body;
  if (!to)   return { success: false, error: "no phone in task payload" };
  if (!body) return { success: false, error: "no reply_body in task payload" };
  const r = await sendSessionMessage({ to, body, customerName: p.customer_name, taskId: task.id });
  return {
    success: !!r.success,
    dry_run: !!r.dry_run,
    error:   r.error || null,
    detail:  { thread_id: r.thread_id, message_id: r.message_id, wa_message_id: r.wa_message_id, note: r.note },
  };
}

async function runWaTemplate({ task }) {
  const p = task.payload || {};
  const a = task.proposed_action?.params || {};
  const to   = a.to   || p.phone || task.external_ref;
  const templateName = a.templateName || p.templateName;
  const params       = a.params       || p.params || [];
  if (!to)           return { success: false, error: "no phone in task payload" };
  if (!templateName) return { success: false, error: "no templateName in task payload" };
  const r = await sendTemplate({ to, templateName, params, customerName: p.customer_name, taskId: task.id });
  return {
    success: !!r.success,
    dry_run: !!r.dry_run,
    error:   r.error || null,
    detail:  { thread_id: r.thread_id, message_id: r.message_id, wa_message_id: r.wa_message_id, note: r.note },
  };
}

async function runInternalFlag({ task, action }) {
  // Internal flag — just record it. The flag IS the action.
  return {
    success: true,
    dry_run: false,
    detail: {
      message: "Internal flag recorded.",
      flag: action,
      payload: task.payload || {},
    },
  };
}

// ─── HTTP handler for manual retry ───────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const founder = await authedFounder(req);
    const { task_id } = req.body || {};
    if (!task_id) return res.status(400).json({ error: "missing task_id" });
    const tasks = await sb(`hashway_ops_tasks?id=eq.${encodeURIComponent(task_id)}&select=*`);
    const task = tasks?.[0];
    if (!task) return res.status(404).json({ error: "task not found" });
    if (task.status !== "approved" && task.status !== "failed") {
      return res.status(400).json({ error: `task is ${task.status}, cannot execute` });
    }
    const result = await executeTask({ task, founder });
    return res.status(200).json({ result });
  } catch (e) {
    const msg = e?.message || String(e);
    const status = /founder-only|missing bearer|invalid token/.test(msg) ? 401 : 500;
    return res.status(status).json({ error: msg });
  }
}
