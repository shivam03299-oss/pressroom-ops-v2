// Hashway 2-hour express — Razorpay payment plumbing.
//
// Two routes via ?action=:
//
//   POST /api/hashway-2hr-payments?action=verify
//     Called by the hashway.in checkout JS RIGHT after Razorpay
//     Checkout returns success. Body:
//       { razorpay_order_id, razorpay_payment_id, razorpay_signature }
//     We verify the HMAC, then flip the matching hashway_2hr_orders
//     row to status="paid" + record payment_id + paid_at. Idempotent.
//
//   POST /api/hashway-2hr-payments?action=webhook
//     Razorpay's webhook destination. Body is raw JSON, X-Razorpay-Signature
//     header carries an HMAC of the raw body using the webhook secret.
//     We verify, then on `payment.captured` / `payment.authorized` /
//     `payment.failed` events flip the matching order's status. Every
//     event is logged to hashway_2hr_webhook_log for audit.
//
// Both paths converge on the same DB mutation, so whichever fires
// first (front-end verify OR webhook) wins. Subsequent firings are
// no-ops because the order is already in the right state.
//
// Body-parser is OFF — we need RAW bytes for the webhook HMAC. The
// verify route re-parses the buffer as JSON itself.

import { createHmac, timingSafeEqual } from "crypto";

export const config = { api: { bodyParser: false } };

const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

// Razorpay keeps two distinct secrets:
//   RAZORPAY_KEY_SECRET    — used to verify checkout-flow signatures
//                            (returned alongside payment_id from the
//                            Razorpay Checkout JS modal).
//   RAZORPAY_WEBHOOK_SECRET — distinct secret you set when configuring
//                            the webhook endpoint in Razorpay dashboard.
//                            Used to verify X-Razorpay-Signature on
//                            inbound webhook POSTs.
// Set BOTH in Vercel env before this endpoint actually verifies
// anything — until they exist, signature checks fail closed.
const RZP_KEY_SECRET     = process.env.RAZORPAY_KEY_SECRET;
const RZP_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

async function sb(path, opts = {}) {
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

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Constant-time HMAC compare so a timing attack can't leak whether
// a signature is partially correct.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")); }
  catch { return false; }
}

// Flip a hashway_2hr_orders row to a new status. Idempotent — if the
// row is already at the desired status, no-op. Always carries a
// concurrent-safe WHERE clause so two callers (webhook + verify)
// racing can't double-write.
async function setOrderStatus({ razorpay_order_id, razorpay_payment_id, status, signature }) {
  const patch = { status, updated_at: new Date().toISOString() };
  if (razorpay_payment_id) patch.razorpay_payment_id = razorpay_payment_id;
  if (signature)           patch.razorpay_signature  = signature;
  if (status === "paid")   patch.paid_at = new Date().toISOString();

  const rows = await sb(
    `hashway_2hr_orders?razorpay_order_id=eq.${encodeURIComponent(razorpay_order_id)}&status=neq.${encodeURIComponent(status)}`,
    { method: "PATCH", body: JSON.stringify(patch), prefer: "return=representation" },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function logWebhook(payload) {
  try {
    await sb("hashway_2hr_webhook_log", {
      method: "POST",
      body: JSON.stringify({ kind: "razorpay", payload }),
      prefer: "return=minimal",
    });
  } catch (e) { console.error("[hashway-2hr-payments] log webhook", e); }
}

// ─── verify (called from hashway.in checkout JS) ─────────────────
async function handleVerify(rawBody, res) {
  let body;
  try { body = JSON.parse(rawBody.toString("utf8") || "{}"); }
  catch { return res.status(400).json({ error: "invalid JSON body" }); }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "missing razorpay_order_id / payment_id / signature" });
  }
  if (!RZP_KEY_SECRET) {
    return res.status(500).json({ error: "RAZORPAY_KEY_SECRET not configured on server" });
  }

  // Razorpay's published signing rule for Checkout success:
  //   HMAC_SHA256(`${order_id}|${payment_id}`, key_secret) == signature
  const expected = createHmac("sha256", RZP_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  if (!safeEqual(expected, razorpay_signature)) {
    return res.status(401).json({ error: "signature mismatch" });
  }

  await logWebhook({ source: "verify", razorpay_order_id, razorpay_payment_id });

  const row = await setOrderStatus({
    razorpay_order_id,
    razorpay_payment_id,
    signature: razorpay_signature,
    status: "paid",
  });
  return res.status(200).json({ ok: true, order: row });
}

// ─── webhook (Razorpay → us) ─────────────────────────────────────
// Events we care about:
//   payment.captured  — money is now ours, flip order to "paid"
//   payment.authorized — auth held but not yet captured (we use auto-capture
//                       so this rarely fires; treat like "paid" for safety)
//   payment.failed    — flip the matching order to "failed"
async function handleWebhook(rawBody, req, res) {
  const signature = req.headers["x-razorpay-signature"] || req.headers["X-Razorpay-Signature"];
  if (!signature) return res.status(401).json({ error: "missing signature" });
  if (!RZP_WEBHOOK_SECRET) {
    return res.status(500).json({ error: "RAZORPAY_WEBHOOK_SECRET not configured on server" });
  }
  const expected = createHmac("sha256", RZP_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  if (!safeEqual(expected, String(signature))) {
    return res.status(401).json({ error: "signature mismatch" });
  }

  let payload;
  try { payload = JSON.parse(rawBody.toString("utf8") || "{}"); }
  catch { return res.status(400).json({ error: "invalid JSON" }); }

  await logWebhook(payload);

  const event = payload.event;
  const ent   = payload?.payload?.payment?.entity || {};
  const rzpOrder = ent.order_id;
  const rzpPayment = ent.id;

  if (!rzpOrder) {
    // Order-only events (e.g. order.paid) don't carry payment entity;
    // try fetching from the order payload instead.
    const orderEnt = payload?.payload?.order?.entity || {};
    if (orderEnt.id) {
      // We don't have a payment_id from order.paid; record only what we have.
      // Most useful work happens on payment.captured below.
      return res.status(200).json({ ok: true, event, note: "order-only event acknowledged" });
    }
    return res.status(200).json({ ok: true, event, note: "no order id in payload" });
  }

  let newStatus = null;
  if (event === "payment.captured" || event === "payment.authorized") newStatus = "paid";
  else if (event === "payment.failed") newStatus = "failed";

  if (newStatus) {
    const row = await setOrderStatus({
      razorpay_order_id: rzpOrder,
      razorpay_payment_id: rzpPayment,
      status: newStatus,
    });
    return res.status(200).json({ ok: true, event, updated: !!row });
  }

  return res.status(200).json({ ok: true, event, note: "no status mapping" });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let rawBody;
  try { rawBody = await readRawBody(req); }
  catch { return res.status(400).json({ error: "couldn't read body" }); }

  const action = String((req.query && req.query.action) || "").toLowerCase();

  try {
    if (action === "verify")  return handleVerify(rawBody, res);
    if (action === "webhook") return handleWebhook(rawBody, req, res);
    return res.status(400).json({ error: `unknown action: ${action || "(none)"}`, valid: ["verify", "webhook"] });
  } catch (e) {
    console.error("[hashway-2hr-payments]", action, e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
