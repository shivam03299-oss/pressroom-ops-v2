// POST /api/hashway-ops-tasks
//   headers: Authorization: Bearer <supabase access token>  (founder only)
//   body:    { action: "list", status? }                 -- defaults to pending+approved
//          | { action: "approve", task_id, edited_payload?, note? }
//          | { action: "reject",  task_id, note? }
//          | { action: "get_executions", task_id }
//
// Approve flow: writes an approval row, sets task.status='approved',
// then asks /api/hashway-ops-execute to attempt the external action.
// Execution is best-effort — failures land in hashway_ops_executions
// with success=false and the task moves to status='failed' so the
// founder can re-try or escalate.

import { sb, authedFounder, audit } from "./_hashway-ops-shared.js";
import { executeTask } from "./_hashway-ops-execute.js";

async function actionList({ status }) {
  const filter = status
    ? `status=eq.${encodeURIComponent(status)}`
    : "status=in.(pending,approved,failed)";
  const rows = await sb(
    `hashway_ops_tasks?${filter}&select=*,hashway_ops_agents(name,dept)&order=priority.desc,created_at.desc&limit=200`
  );
  return rows || [];
}

async function actionApprove({ task_id, edited_payload, note }, founder) {
  if (!task_id) throw new Error("missing task_id");
  const tasks = await sb(`hashway_ops_tasks?id=eq.${encodeURIComponent(task_id)}&select=*`);
  const task = tasks?.[0];
  if (!task) throw new Error("task not found");
  if (task.status !== "pending" && task.status !== "failed") {
    throw new Error(`task is ${task.status}, cannot approve`);
  }

  await sb("hashway_ops_approvals", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      task_id,
      decision: "approved",
      edited_payload: edited_payload || null,
      note: note || null,
      decided_by: founder.id,
      decided_by_email: founder.email,
    }]),
  });

  await sb(`hashway_ops_tasks?id=eq.${encodeURIComponent(task_id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "approved",
      ...(edited_payload ? { payload: edited_payload } : {}),
    }),
  });

  await audit({
    actorType: "founder",
    actorId: founder.email,
    action: "task.approved",
    entityType: "task",
    entityId: task_id,
    payload: { note: note || null, edited: !!edited_payload },
  });

  // Best-effort execution. The execute module updates task.status itself.
  let execution = null;
  try {
    execution = await executeTask({
      task: { ...task, payload: edited_payload || task.payload },
      founder,
    });
  } catch (e) {
    execution = { success: false, error: e?.message || String(e) };
  }

  return { task_id, execution };
}

async function actionReject({ task_id, note }, founder) {
  if (!task_id) throw new Error("missing task_id");
  await sb("hashway_ops_approvals", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      task_id, decision: "rejected", note: note || null,
      decided_by: founder.id, decided_by_email: founder.email,
    }]),
  });
  const rows = await sb(`hashway_ops_tasks?id=eq.${encodeURIComponent(task_id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "rejected" }),
  });
  if (!rows?.[0]) throw new Error("task not found");
  await audit({
    actorType: "founder", actorId: founder.email,
    action: "task.rejected", entityType: "task", entityId: task_id,
    payload: { note: note || null },
  });
  return rows[0];
}

async function actionGetExecutions({ task_id }) {
  if (!task_id) throw new Error("missing task_id");
  const rows = await sb(
    `hashway_ops_executions?task_id=eq.${encodeURIComponent(task_id)}&order=executed_at.desc`
  );
  return rows || [];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const founder = await authedFounder(req);
    const action = req.body?.action || "list";
    let data;
    switch (action) {
      case "list":           data = await actionList(req.body);                   break;
      case "approve":        data = await actionApprove(req.body, founder);       break;
      case "reject":         data = await actionReject(req.body, founder);        break;
      case "get_executions": data = await actionGetExecutions(req.body);          break;
      default: return res.status(400).json({ error: `unknown action: ${action}` });
    }
    return res.status(200).json({ data });
  } catch (e) {
    const msg = e?.message || String(e);
    const status = /founder-only|missing bearer|invalid token/.test(msg) ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}
