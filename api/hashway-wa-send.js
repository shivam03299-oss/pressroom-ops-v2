// WhatsApp send module — wraps AiSensy's REST API.
//
// Two paths:
//   sendSessionMessage({to, body, threadId, taskId})
//     For freeform replies inside the 24h conversation window
//     (i.e. customer messaged us recently). Used by CX approve flow.
//
//   sendTemplate({to, templateName, params, userName, threadId, taskId})
//     For proactive outreach (order_confirmed, drop announcements, etc.)
//     where we're outside the 24h window or starting a new conversation.
//
// Both return { success, wa_message_id?, error?, dry_run? }.
// Both insert a hashway_ops_wa_messages row regardless of outcome so the
// inbox always reflects what we attempted.
//
// Dormant until AISENSY_API_KEY is set in Vercel env — until then both
// functions return { success: true, dry_run: true } and record the
// would-be message with status='queued'.
//
// Also exposed as POST /api/hashway-wa-send for manual / debug send by
// the founder (auth-gated).

import { sb, authedFounder, audit, normalizePhone } from "./_hashway-ops-shared.js";

const AISENSY_BASE = "https://backend.aisensy.com";

// ─── Upsert thread by phone, fold in last_message_* fields ───────
async function upsertThread({ phone, customerName, direction, body }) {
  const norm = normalizePhone(phone);
  if (!norm) throw new Error("invalid phone");

  // Try to find linked Shopify order(s) by phone (Hashway only)
  let linkedIds = [];
  try {
    const orders = await sb(
      `shopify_orders?tenant_id=eq.t-hashway` +
      `&or=(customer_phone.eq.${encodeURIComponent(norm)},customer_phone.eq.${encodeURIComponent("+" + norm)},customer_phone.like.%${encodeURIComponent(norm.slice(-10))}%)` +
      `&select=id&order=created_at.desc&limit=5`
    );
    linkedIds = (orders || []).map(o => o.id);
  } catch { /* ignore lookup failures */ }

  // Try to insert; on conflict update existing thread.
  // Postgrest doesn't support ON CONFLICT directly via REST, so we
  // do a select-then-upsert.
  const existing = await sb(`hashway_ops_wa_threads?phone=eq.${encodeURIComponent(norm)}&select=*`);
  const now = new Date().toISOString();
  if (existing?.[0]) {
    const t = existing[0];
    const patch = {
      last_message_at:   now,
      last_message_dir:  direction,
      last_message_body: (body || "").slice(0, 500),
    };
    if (direction === "in") patch.unread_count = (t.unread_count || 0) + 1;
    if (customerName && !t.customer_name) patch.customer_name = customerName;
    if (linkedIds.length) {
      const merged = Array.from(new Set([...(t.linked_order_ids || []), ...linkedIds]));
      patch.linked_order_ids = merged;
    }
    const upd = await sb(`hashway_ops_wa_threads?id=eq.${t.id}`, {
      method: "PATCH", body: JSON.stringify(patch),
    });
    return upd[0];
  } else {
    const ins = await sb("hashway_ops_wa_threads", {
      method: "POST",
      body: JSON.stringify([{
        phone:             norm,
        customer_name:     customerName || null,
        linked_order_ids:  linkedIds,
        last_message_at:   now,
        last_message_dir:  direction,
        last_message_body: (body || "").slice(0, 500),
        unread_count:      direction === "in" ? 1 : 0,
      }]),
    });
    return ins[0];
  }
}

async function insertMessage({ thread_id, direction, body, message_type, template_name, template_params, wa_message_id, status, error, sent_by_task, raw }) {
  const rows = await sb("hashway_ops_wa_messages", {
    method: "POST",
    body: JSON.stringify([{
      thread_id, direction,
      body: body ?? null,
      message_type: message_type || "text",
      template_name: template_name ?? null,
      template_params: template_params ?? null,
      wa_message_id: wa_message_id ?? null,
      status: status || (direction === "in" ? "received" : "queued"),
      error: error ?? null,
      sent_by_task: sent_by_task ?? null,
      raw: raw || {},
    }]),
  });
  return rows?.[0];
}

// ─── Outbound senders ─────────────────────────────────────────────

export async function sendSessionMessage({ to, body, customerName, taskId }) {
  const phone = normalizePhone(to);
  if (!phone) return { success: false, error: "invalid phone" };
  if (!body)  return { success: false, error: "empty body" };

  const thread = await upsertThread({ phone, customerName, direction: "out", body });
  const apiKey = process.env.AISENSY_API_KEY;

  if (!apiKey) {
    // Dormant — log it but don't fire.
    const msg = await insertMessage({
      thread_id: thread.id, direction: "out", body,
      status: "queued", sent_by_task: taskId,
      raw: { dry_run: true, reason: "AISENSY_API_KEY not set" },
    });
    return { success: true, dry_run: true, thread_id: thread.id, message_id: msg.id,
             note: "Dry run — AISENSY_API_KEY not set. Message recorded but not sent." };
  }

  try {
    const res = await fetch(`${AISENSY_BASE}/direct-apis/t1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        to: phone, type: "text", recipient_type: "individual",
        text: { body },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || JSON.stringify(json) || `HTTP ${res.status}`);
    const waId = json?.messages?.[0]?.id || json?.id || null;
    const msg = await insertMessage({
      thread_id: thread.id, direction: "out", body,
      wa_message_id: waId, status: "sent", sent_by_task: taskId,
      raw: json,
    });
    return { success: true, thread_id: thread.id, message_id: msg.id, wa_message_id: waId };
  } catch (e) {
    const errMsg = e?.message || String(e);
    await insertMessage({
      thread_id: thread.id, direction: "out", body,
      status: "failed", error: errMsg, sent_by_task: taskId,
    });
    return { success: false, error: errMsg };
  }
}

export async function sendTemplate({ to, templateName, params, customerName, taskId }) {
  const phone = normalizePhone(to);
  if (!phone)        return { success: false, error: "invalid phone" };
  if (!templateName) return { success: false, error: "missing templateName" };
  const apiKey = process.env.AISENSY_API_KEY;
  const userName = customerName || "Customer";

  // Render a preview body from our template registry so the inbox
  // shows what the customer actually sees (not just "template sent").
  let previewBody = `[template: ${templateName}]`;
  try {
    const tmpl = await sb(`hashway_ops_wa_templates?name=eq.${encodeURIComponent(templateName)}&select=body`);
    if (tmpl?.[0]) {
      previewBody = (tmpl[0].body || previewBody).replace(/\{\{(\d+)\}\}/g, (_, i) => {
        const idx = parseInt(i, 10) - 1;
        return (Array.isArray(params) && params[idx] != null) ? String(params[idx]) : `{{${i}}}`;
      });
    }
  } catch { /* preview is nice-to-have */ }

  const thread = await upsertThread({ phone, customerName, direction: "out", body: previewBody });

  if (!apiKey) {
    const msg = await insertMessage({
      thread_id: thread.id, direction: "out", body: previewBody,
      message_type: "template", template_name: templateName, template_params: params || [],
      status: "queued", sent_by_task: taskId,
      raw: { dry_run: true, reason: "AISENSY_API_KEY not set" },
    });
    return { success: true, dry_run: true, thread_id: thread.id, message_id: msg.id,
             note: "Dry run — AISENSY_API_KEY not set. Template recorded but not sent." };
  }

  try {
    const res = await fetch(`${AISENSY_BASE}/campaign/t1/api/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        campaignName: templateName,
        destination:  phone,
        userName,
        templateParams: (params || []).map(String),
        source: "Hashway Ops · Founder Inbox",
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || JSON.stringify(json) || `HTTP ${res.status}`);
    const waId = json?.messageId || json?.id || null;
    const msg = await insertMessage({
      thread_id: thread.id, direction: "out", body: previewBody,
      message_type: "template", template_name: templateName, template_params: params || [],
      wa_message_id: waId, status: "sent", sent_by_task: taskId,
      raw: json,
    });
    return { success: true, thread_id: thread.id, message_id: msg.id, wa_message_id: waId };
  } catch (e) {
    const errMsg = e?.message || String(e);
    await insertMessage({
      thread_id: thread.id, direction: "out", body: previewBody,
      message_type: "template", template_name: templateName, template_params: params || [],
      status: "failed", error: errMsg, sent_by_task: taskId,
    });
    return { success: false, error: errMsg };
  }
}

// ─── HTTP handler (founder-only manual send) ──────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const founder = await authedFounder(req);
    const body = req.body || {};
    let result;
    if (body.templateName) {
      result = await sendTemplate({ to: body.to, templateName: body.templateName, params: body.params, customerName: body.customerName });
    } else if (body.body) {
      result = await sendSessionMessage({ to: body.to, body: body.body, customerName: body.customerName });
    } else {
      return res.status(400).json({ error: "provide either {to, body} or {to, templateName, params}" });
    }
    await audit({
      actorType: "founder", actorId: founder.email,
      action: "wa.manual_send", entityType: "wa_thread", entityId: result.thread_id,
      payload: { dry_run: !!result.dry_run, success: !!result.success },
    });
    return res.status(200).json({ result });
  } catch (e) {
    const msg = e?.message || String(e);
    const status = /founder-only|missing bearer|invalid token/.test(msg) ? 401 : 500;
    return res.status(status).json({ error: msg });
  }
}
