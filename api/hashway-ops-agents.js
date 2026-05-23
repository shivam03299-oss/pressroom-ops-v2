// POST /api/hashway-ops-agents
//   headers: Authorization: Bearer <supabase access token>  (founder only)
//   body:    { action: "list" }
//          | { action: "toggle", agent_id, enabled }
//          | { action: "update_prompt", agent_id, system_prompt }

import { sb, authedFounder, audit } from "./_hashway-ops-shared.js";

async function actionList() {
  const rows = await sb(
    "hashway_ops_agents?select=*&order=phase.asc,dept.asc"
  );
  return rows || [];
}

async function actionToggle({ agent_id, enabled }, founder) {
  if (!agent_id) throw new Error("missing agent_id");
  const rows = await sb(
    `hashway_ops_agents?id=eq.${encodeURIComponent(agent_id)}`,
    { method: "PATCH", body: JSON.stringify({ enabled: !!enabled }) }
  );
  if (!rows?.[0]) throw new Error("agent not found");
  await audit({
    actorType: "founder",
    actorId: founder.email,
    action: enabled ? "agent.enabled" : "agent.disabled",
    entityType: "agent",
    entityId: agent_id,
  });
  return rows[0];
}

async function actionUpdatePrompt({ agent_id, system_prompt }, founder) {
  if (!agent_id) throw new Error("missing agent_id");
  if (!system_prompt || typeof system_prompt !== "string") throw new Error("missing system_prompt");
  const rows = await sb(
    `hashway_ops_agents?id=eq.${encodeURIComponent(agent_id)}`,
    { method: "PATCH", body: JSON.stringify({ system_prompt }) }
  );
  if (!rows?.[0]) throw new Error("agent not found");
  await audit({
    actorType: "founder",
    actorId: founder.email,
    action: "agent.prompt_updated",
    entityType: "agent",
    entityId: agent_id,
  });
  return rows[0];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const founder = await authedFounder(req);
    const action = req.body?.action || "list";
    let data;
    switch (action) {
      case "list":          data = await actionList();                        break;
      case "toggle":        data = await actionToggle(req.body, founder);     break;
      case "update_prompt": data = await actionUpdatePrompt(req.body, founder); break;
      default: return res.status(400).json({ error: `unknown action: ${action}` });
    }
    return res.status(200).json({ data });
  } catch (e) {
    const msg = e?.message || String(e);
    const status = /founder-only|missing bearer|invalid token/.test(msg) ? 401 : 400;
    return res.status(status).json({ error: msg });
  }
}
