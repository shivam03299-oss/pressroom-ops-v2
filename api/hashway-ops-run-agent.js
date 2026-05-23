// POST /api/hashway-ops-run-agent
//   headers: Authorization: Bearer <supabase access token>  (founder only)
//   body:    { agent_id }
//
// Loads the agent config, gathers relevant context from existing
// pressroom tables (shopify_orders), calls the Claude API, parses the
// proposed task array, and inserts tasks into hashway_ops_tasks.
// Returns { run_id, tasks_created, summary }.

import Anthropic from "@anthropic-ai/sdk";
import { sb, authedFounder, audit } from "./_hashway-ops-shared.js";

const HASHWAY_TENANT_ID = "t-hashway";
const MODEL = "claude-opus-4-7";

// ─── Context gatherers (one per dept) ─────────────────────────────
async function gatherContext(dept) {
  switch (dept) {
    case "cx":  return gatherCxContext();
    case "ops": return gatherOpsContext();
    default:    return { note: "no context gatherer wired for this dept yet" };
  }
}

async function gatherCxContext() {
  // Last 30 days of Hashway shopify orders + recent WA conversations.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [orders, threads] = await Promise.all([
    sb(
      `shopify_orders?tenant_id=eq.${HASHWAY_TENANT_ID}` +
      `&created_at=gte.${encodeURIComponent(thirtyDaysAgo)}` +
      `&select=id,shopify_order_number,shopify_order_name,customer_name,customer_email,customer_phone,total_price,currency,financial_status,fulfillment_status,shopify_note,shopify_created_at,line_items,tracking_number` +
      `&order=created_at.desc&limit=60`
    ),
    sb(
      `hashway_ops_wa_threads?last_message_at=gte.${encodeURIComponent(thirtyDaysAgo)}` +
      `&select=id,phone,customer_name,linked_order_ids,last_message_at,last_message_dir,unread_count,status` +
      `&order=last_message_at.desc&limit=20`
    ),
  ]);

  // For each thread, pull its last 5 messages so the agent can see context.
  const threadsWithMessages = await Promise.all(
    (threads || []).map(async (t) => {
      const messages = await sb(
        `hashway_ops_wa_messages?thread_id=eq.${t.id}` +
        `&select=direction,body,message_type,template_name,status,created_at` +
        `&order=created_at.desc&limit=5`
      );
      return { ...t, recent_messages: (messages || []).reverse() }; // chronological
    })
  );

  return {
    today_iso:            new Date().toISOString().slice(0, 10),
    brand:                "Hashway Clothing (Indian streetwear)",
    orders_last_30_days:  orders || [],
    wa_threads_last_30_days: threadsWithMessages,
    notes:                "Delhivery RTO/NDR live feed not wired yet. For WA threads where last message direction='in' and there's no later 'out', the customer is awaiting a reply — these are highest priority.",
  };
}

async function gatherOpsContext() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const undispatched = await sb(
    `shopify_orders?tenant_id=eq.${HASHWAY_TENANT_ID}` +
    `&financial_status=eq.paid` +
    `&fulfillment_status=is.null` +
    `&created_at=lte.${encodeURIComponent(twentyFourHoursAgo)}` +
    `&select=id,order_number,customer_name,total_price,created_at,line_items` +
    `&order=created_at.asc&limit=80`
  );
  return {
    today_iso:                 new Date().toISOString().slice(0, 10),
    brand:                     "Hashway Clothing (Indian streetwear)",
    undispatched_paid_orders:  undispatched || [],
    notes:                     "Delhivery live shipment + NDR feed not wired yet (Phase 1.1). Flag dispatch delays from Shopify data only.",
  };
}

// ─── Response parsing ─────────────────────────────────────────────
function extractTasks(rawText) {
  if (!rawText) return [];
  // Strip ```json fences if present, then locate the first JSON array.
  let s = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("[");
  const end   = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  const json = s.slice(start, end + 1);
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function normalizePriority(p) {
  const v = String(p || "normal").toLowerCase();
  return ["low", "normal", "high", "urgent"].includes(v) ? v : "normal";
}

// ─── Main ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const founder = await authedFounder(req);
    const { agent_id } = req.body || {};
    if (!agent_id) return res.status(400).json({ error: "missing agent_id" });

    const agents = await sb(`hashway_ops_agents?id=eq.${encodeURIComponent(agent_id)}&select=*`);
    const agent = agents?.[0];
    if (!agent) return res.status(404).json({ error: "agent not found" });
    if (!agent.enabled) return res.status(400).json({ error: `agent ${agent.dept} is disabled` });

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error: "ANTHROPIC_API_KEY not set in environment. Add it to Vercel env to enable agent runs.",
      });
    }

    // Open the run row up-front so a crash doesn't lose the audit trail.
    const runRows = await sb("hashway_ops_agent_runs", {
      method: "POST",
      body: JSON.stringify([{
        agent_id, status: "running", triggered_by: "manual",
      }]),
    });
    const run = runRows[0];

    let tasksCreated = 0;
    let summary = "";
    let tokens = { input: 0, output: 0, cached: 0 };

    try {
      const context = await gatherContext(agent.dept);
      const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const response = await client.messages.create({
        model:       agent.model || MODEL,
        max_tokens:  16000,
        thinking:    { type: "adaptive" },
        system:      agent.system_prompt,
        messages: [{
          role: "user",
          content:
            `Here is the data for your scan. Today is ${context.today_iso}.\n\n` +
            "```json\n" + JSON.stringify(context, null, 2) + "\n```\n\n" +
            "Now output the JSON array of proposed task objects per the schema. Output only the JSON array, no prose.",
        }],
      });

      tokens = {
        input:  response.usage?.input_tokens || 0,
        output: response.usage?.output_tokens || 0,
        cached: response.usage?.cache_read_input_tokens || 0,
      };

      // Extract the text from content blocks (skip thinking blocks).
      const textBlock = response.content.find(b => b.type === "text");
      const proposed = extractTasks(textBlock?.text || "");

      if (proposed.length > 0) {
        const rows = proposed.map(t => ({
          run_id:           run.id,
          agent_id,
          dept:             agent.dept,
          type:             String(t.type || "unknown"),
          title:            String(t.title || "Untitled proposal").slice(0, 200),
          reasoning:        t.reasoning ? String(t.reasoning) : null,
          priority:         normalizePriority(t.priority),
          external_ref:     t.external_ref ? String(t.external_ref) : null,
          payload:          t.payload || {},
          proposed_action:  t.proposed_action || {},
          status:           "pending",
        }));
        const inserted = await sb("hashway_ops_tasks", {
          method: "POST",
          body: JSON.stringify(rows),
        });
        tasksCreated = inserted?.length || 0;
      }

      summary = `Proposed ${tasksCreated} task${tasksCreated === 1 ? "" : "s"}.`;

      await sb(`hashway_ops_agent_runs?id=eq.${run.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status:        "succeeded",
          finished_at:   new Date().toISOString(),
          summary,
          tasks_created: tasksCreated,
          tokens_input:  tokens.input,
          tokens_output: tokens.output,
          tokens_cached: tokens.cached,
        }),
      });
      await sb(`hashway_ops_agents?id=eq.${agent_id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          last_run_at: new Date().toISOString(),
          last_run_status: "succeeded",
        }),
      });
      await audit({
        actorType: "founder", actorId: founder.email,
        action: "agent.run_succeeded", entityType: "agent_run", entityId: run.id,
        payload: { dept: agent.dept, tasks_created: tasksCreated, tokens },
      });

      return res.status(200).json({ run_id: run.id, tasks_created: tasksCreated, summary, tokens });

    } catch (e) {
      const msg = e?.message || String(e);
      await sb(`hashway_ops_agent_runs?id=eq.${run.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "failed", finished_at: new Date().toISOString(), error: msg.slice(0, 1000),
        }),
      });
      await sb(`hashway_ops_agents?id=eq.${agent_id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          last_run_at: new Date().toISOString(), last_run_status: "failed",
        }),
      });
      throw e;
    }
  } catch (e) {
    const msg = e?.message || String(e);
    const status = /founder-only|missing bearer|invalid token/.test(msg) ? 401 : 500;
    return res.status(status).json({ error: msg });
  }
}
