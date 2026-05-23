// Webhook endpoint for incoming WhatsApp messages from AiSensy.
//
// AiSensy will POST every customer message + status update here.
// Config in AiSensy dashboard:
//   URL:    https://<your-vercel-domain>/api/hashway-wa-webhook
//   Header: x-hashway-webhook-secret: <HASHWAY_WA_WEBHOOK_SECRET>
//
// This is the ONE hashway-ops endpoint that does NOT use founder-email
// auth — it auths via the shared webhook secret in the header. AiSensy
// can't authenticate as a user.
//
// On a customer message we: upsert the thread, insert the message,
// link to a Shopify order if we recognize the phone. The CX agent's
// next "Run now" picks up unreplied threads and drafts replies.

import { sb, normalizePhone, audit } from "./_hashway-ops-shared.js";

// AiSensy's webhook payload has evolved across versions. Handle the
// common shapes defensively.
function parseInbound(body) {
  if (!body || typeof body !== "object") return null;

  // Shape A: { type: "message_received", data: { phoneNumber, userName, message: { type, text: {body}, id }, timestamp } }
  if (body.type === "message_received" && body.data) {
    const d = body.data;
    const m = d.message || {};
    return {
      kind: "message",
      phone: d.phoneNumber || d.from || d.waId || null,
      customerName: d.userName || d.profileName || null,
      messageType: m.type || "text",
      body: m.text?.body || m.body || m.caption || null,
      mediaUrl: m.image?.url || m.document?.url || null,
      waMessageId: m.id || d.messageId || null,
      raw: body,
    };
  }

  // Shape B: flat { from, type, text: {body}, id }
  if (body.from && (body.text || body.type)) {
    return {
      kind: "message",
      phone: body.from,
      customerName: body.profile_name || body.userName || null,
      messageType: body.type || "text",
      body: body.text?.body || body.message || body.caption || null,
      mediaUrl: body.image?.url || body.document?.url || null,
      waMessageId: body.id || body.messageId || null,
      raw: body,
    };
  }

  // Shape C: status update (sent → delivered → read) for one of our outgoing messages
  if (body.type === "message_status" || body.status || body.messageStatus) {
    return {
      kind: "status",
      waMessageId: body.messageId || body.id || body.data?.messageId || null,
      status: (body.status || body.messageStatus || body.data?.status || "").toLowerCase(),
      raw: body,
    };
  }

  return null;
}

async function handleMessage(parsed) {
  const phone = normalizePhone(parsed.phone);
  if (!phone) return { ok: false, error: "no phone in payload" };
  const body = parsed.body || (parsed.messageType !== "text" ? `[${parsed.messageType}]` : null);

  // Upsert thread
  const existing = await sb(`hashway_ops_wa_threads?phone=eq.${encodeURIComponent(phone)}&select=*`);
  const now = new Date().toISOString();
  let thread;
  if (existing?.[0]) {
    const t = existing[0];
    const patch = {
      last_message_at: now,
      last_message_dir: "in",
      last_message_body: (body || "").slice(0, 500),
      unread_count: (t.unread_count || 0) + 1,
    };
    if (parsed.customerName && !t.customer_name) patch.customer_name = parsed.customerName;
    const upd = await sb(`hashway_ops_wa_threads?id=eq.${t.id}`, {
      method: "PATCH", body: JSON.stringify(patch),
    });
    thread = upd[0];
  } else {
    // First message from this number — try to link to Shopify orders by phone
    let linkedIds = [];
    try {
      const orders = await sb(
        `shopify_orders?tenant_id=eq.t-hashway` +
        `&or=(customer_phone.eq.${encodeURIComponent(phone)},customer_phone.like.%${encodeURIComponent(phone.slice(-10))}%)` +
        `&select=id&order=created_at.desc&limit=5`
      );
      linkedIds = (orders || []).map(o => o.id);
    } catch { /* ignore */ }
    const ins = await sb("hashway_ops_wa_threads", {
      method: "POST",
      body: JSON.stringify([{
        phone,
        customer_name: parsed.customerName || null,
        linked_order_ids: linkedIds,
        last_message_at: now,
        last_message_dir: "in",
        last_message_body: (body || "").slice(0, 500),
        unread_count: 1,
      }]),
    });
    thread = ins[0];
  }

  await sb("hashway_ops_wa_messages", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      thread_id:    thread.id,
      direction:    "in",
      body,
      message_type: parsed.messageType || "text",
      media_url:    parsed.mediaUrl || null,
      wa_message_id: parsed.waMessageId || null,
      status:       "received",
      raw:          parsed.raw || {},
    }]),
  });

  await audit({
    actorType: "system", actorId: "wa_webhook",
    action: "wa.message_received", entityType: "wa_thread", entityId: thread.id,
    payload: { phone, preview: (body || "").slice(0, 80) },
  });

  return { ok: true, thread_id: thread.id };
}

async function handleStatus(parsed) {
  if (!parsed.waMessageId || !parsed.status) return { ok: false };
  const updates = await sb(
    `hashway_ops_wa_messages?wa_message_id=eq.${encodeURIComponent(parsed.waMessageId)}`,
    { method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: parsed.status }) }
  );
  return { ok: true, updated: !!updates };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Webhook secret check — case-insensitive on header name
  const expected = process.env.HASHWAY_WA_WEBHOOK_SECRET;
  if (expected) {
    const hdr = req.headers["x-hashway-webhook-secret"] || req.headers["X-Hashway-Webhook-Secret"];
    if (hdr !== expected) {
      return res.status(401).json({ error: "invalid webhook secret" });
    }
  }
  // If not set at all, accept any request (so the user can test the
  // wiring before setting the secret). We log a warning.
  else {
    console.warn("[wa-webhook] HASHWAY_WA_WEBHOOK_SECRET not set — accepting unauthenticated webhook. Set this env var ASAP.");
  }

  try {
    const parsed = parseInbound(req.body);
    if (!parsed) {
      console.warn("[wa-webhook] unparseable body:", JSON.stringify(req.body).slice(0, 500));
      return res.status(200).json({ ok: true, parsed: false });
    }
    const result = parsed.kind === "message"
      ? await handleMessage(parsed)
      : await handleStatus(parsed);
    return res.status(200).json(result);
  } catch (e) {
    console.error("[wa-webhook] failed:", e?.message || e);
    // Return 200 to AiSensy so they don't retry-storm. Error is logged.
    return res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
}
