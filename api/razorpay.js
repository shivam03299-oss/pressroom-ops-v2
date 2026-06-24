// Razorpay payment gateway for client wallet recharges (replaces Cashfree
// for the client portal top-up flow).
//
// POST /api/razorpay
//   headers: Authorization: Bearer <supabase access token>   (any client)
//   body:
//     { action: "order",  amount }                            → create RZP order
//     { action: "verify", razorpay_order_id, razorpay_payment_id, razorpay_signature }
//                                                             → verify + credit wallet
//
// Keys live in app_config (razorpay_key_id / razorpay_key_secret) — NOT in
// this public repo, and deliberately separate from the env RAZORPAY_KEY_SECRET
// the 2-hour-delivery flow uses, so the two gateways never collide. The
// frontend only ever gets the key_id (public); the secret stays server-side.

import { createHmac, timingSafeEqual } from "crypto";
import { sb, authedCaller } from "./_velocity-track.js";

const RZP_BASE = "https://api.razorpay.com/v1";
const enc = encodeURIComponent;

async function rzpKeys() {
  const rows = await sb("app_config?key=in.(razorpay_key_id,razorpay_key_secret)&select=key,value");
  const m = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
  const id = process.env.RAZORPAY_RECHARGE_KEY_ID || m.razorpay_key_id;
  const secret = process.env.RAZORPAY_RECHARGE_KEY_SECRET || m.razorpay_key_secret;
  if (!id || !secret) throw new Error("Razorpay keys not configured (app_config: razorpay_key_id / razorpay_key_secret).");
  return { id, secret };
}
const basic = (id, secret) => "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");

function safeEq(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// ─── order — create a Razorpay order for the entered (GST-inclusive) ₹ ─
async function actionOrder(b, user) {
  const rupees = Number(b.amount) || 0;
  if (rupees < 100) throw new Error("Minimum recharge is ₹100.");
  const amount = Math.round(rupees * 100); // paise
  const { id, secret } = await rzpKeys();
  const r = await fetch(`${RZP_BASE}/orders`, {
    method: "POST",
    headers: { Authorization: basic(id, secret), "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency: "INR", receipt: `wal_${user.id.slice(0, 8)}_${Date.now()}`, notes: { user_id: user.id, purpose: "wallet_recharge" } }),
  });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = {}; }
  if (!r.ok || !j.id) throw new Error(`Razorpay order failed: ${(text || "").slice(0, 200)}`);
  return { order_id: j.id, amount: j.amount, currency: j.currency, key_id: id };
}

// ─── verify — confirm the checkout signature, then credit the wallet ──
async function creditWallet(user, profile, orderId, amountRs) {
  // Idempotent on the Razorpay order id (stored in cashfree_link_id, the
  // existing per-recharge unique ref column) so replays never double-credit.
  const existing = await sb(`client_recharges?cashfree_link_id=eq.${enc(orderId)}&select=id`);
  if (Array.isArray(existing) && existing.length) return;
  const tenantId = profile?.tenant_id;
  if (!tenantId) throw new Error("no tenant linked to this account");
  await sb("client_recharges", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      tenant_id: tenantId, amount: amountRs, status: "paid", payment_method: "razorpay",
      cashfree_link_id: orderId, note: "Wallet top-up (GST included)",
      paid_at: new Date().toISOString(), created_by: user.id,
    }),
  });
  try {
    const profs = await sb(`profiles?id=eq.${enc(user.id)}&select=name`);
    const clientName = (Array.isArray(profs) && profs[0]?.name) || user.email;
    await sb("notifications", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        type: "wallet_recharge", title: `${clientName} topped up ₹${Number(amountRs).toLocaleString("en-IN")}`,
        body: "Wallet recharge via Razorpay", actor: clientName, actor_role: "client",
        tenant_id: tenantId, meta: { amount: amountRs, order_id: orderId },
      }),
    });
  } catch (e) { console.error("recharge notification failed:", e.message || e); }
}

async function actionVerify(b, user, profile) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = b;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) throw new Error("missing razorpay_order_id / payment_id / signature");
  const { id, secret } = await rzpKeys();
  // Razorpay checkout-success signature: HMAC_SHA256(`order_id|payment_id`, secret).
  const expected = createHmac("sha256", secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
  if (!safeEq(expected, razorpay_signature)) throw new Error("signature mismatch");

  // Re-fetch the order from Razorpay for the authoritative amount + paid
  // status — never trust an amount from the client.
  const r = await fetch(`${RZP_BASE}/orders/${enc(razorpay_order_id)}`, { headers: { Authorization: basic(id, secret) } });
  const order = await r.json().catch(() => ({}));
  const paid = order.status === "paid" || (Number(order.amount_paid) >= Number(order.amount) && Number(order.amount) > 0);
  if (!paid) return { paid: false, status: order.status || "unknown" };
  const amountRs = (Number(order.amount) || 0) / 100;
  await creditWallet(user, profile, razorpay_order_id, amountRs);
  return { paid: true, amount: amountRs };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { user, profile } = await authedCaller(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (body.action === "order")  return res.status(200).json(await actionOrder(body, user));
    if (body.action === "verify") return res.status(200).json(await actionVerify(body, user, profile));
    return res.status(400).json({ error: `unknown action: ${body.action}` });
  } catch (e) {
    console.error("razorpay error", e);
    const code = /invalid token|missing bearer|no profile/i.test(e.message || "") ? 401 : 500;
    return res.status(code).json({ error: e.message || String(e) });
  }
}
