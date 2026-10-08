// Paytm Payment Gateway for client wallet recharges (replaces Razorpay).
//
// Hosted-redirect flow:
//   1) POST /api/paytm {action:"initiate", amount, origin}
//        → insert a PENDING client_recharges row (maps orderId → tenant/user/
//          amount for the callback), call Paytm initiateTransaction, return
//          { txnToken, orderId, mid, host }.
//   2) The frontend auto-submits a form to Paytm's showPaymentPage → the
//        client pays on Paytm's own hosted page.
//   3) Paytm POSTs the result to callbackUrl (/api/paytm?action=callback).
//        We call transactionStatus (server-to-server, authoritative — never
//        trust the callback body), mark the recharge paid + credit the wallet
//        (idempotent), then 302 redirect to /portal/wallet?recharge=...
//
// Credentials live in app_config (paytm_mid / paytm_merchant_key /
// paytm_website / paytm_industry_type) — NOT in this repo. Checksum follows
// Paytm's AES-128-CBC + SHA256 scheme (verified against securegw.paytm.in).

import { createHash, createCipheriv, randomBytes } from "crypto";
import { sb, authedCaller } from "./_velocity-track.js";

const PAYTM_HOST = "https://securegw.paytm.in";
const PAYTM_IV = "@@@@&&&&####$$$$";
const enc = encodeURIComponent;

async function paytmCfg() {
  const rows = await sb("app_config?key=in.(paytm_mid,paytm_merchant_key,paytm_website,paytm_industry_type)&select=key,value");
  const m = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
  const mid = process.env.PAYTM_MID || m.paytm_mid;
  const key = process.env.PAYTM_MERCHANT_KEY || m.paytm_merchant_key;
  if (!mid || !key) throw new Error("Paytm not configured (app_config: paytm_mid / paytm_merchant_key).");
  return { mid, key, website: process.env.PAYTM_WEBSITE || m.paytm_website || "DEFAULT" };
}

// ─── Paytm checksum (AES-128-CBC + SHA256; matches the official lib) ───
function pEncrypt(input, key) {
  const c = createCipheriv("AES-128-CBC", key, PAYTM_IV);
  return c.update(input, "binary", "base64") + c.final("base64");
}
function pHash(params, salt) {
  return createHash("sha256").update(params + "|" + salt).digest("hex") + salt;
}
function genSignature(params, key) {
  const salt = randomBytes(3).toString("base64").slice(0, 4);
  return pEncrypt(pHash(params, salt), key);
}

async function paytmPost(url, bodyObj) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyObj) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = {}; }
  return { ok: r.ok, json: j, text: t };
}

// ─── initiate ──────────────────────────────────────────────────────────
async function actionInitiate(b, user, profile) {
  const rupees = Number(b.amount) || 0;
  if (rupees < 100) throw new Error("Minimum recharge is ₹100.");
  const tenantId = profile?.tenant_id;
  if (!tenantId) throw new Error("no tenant linked to this account");
  const { mid, key, website } = await paytmCfg();
  const orderId = `WAL${Date.now()}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const amountStr = rupees.toFixed(2);
  const origin = (b.origin && /^https?:\/\//.test(b.origin)) ? b.origin.replace(/\/+$/, "") : "https://avivainternational.co";
  const callbackUrl = `${origin}/api/paytm?action=callback`;

  // Pending recharge row — the ONLY place orderId is mapped to tenant/user/
  // amount, which the (unauthenticated) callback needs. Balance counts only
  // status='paid', so a pending row never inflates the wallet.
  await sb("client_recharges", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      tenant_id: tenantId, amount: rupees, status: "pending", payment_method: "paytm",
      cashfree_link_id: orderId, note: "Wallet top-up (Paytm, GST included)", created_by: user.id,
    }),
  });

  const body = {
    requestType: "Payment", mid, websiteName: website, orderId, callbackUrl,
    txnAmount: { value: amountStr, currency: "INR" },
    userInfo: { custId: String(user.id).replace(/-/g, "").slice(0, 30) },
  };
  const signature = genSignature(JSON.stringify(body), key);
  const { json } = await paytmPost(
    `${PAYTM_HOST}/theia/api/v1/initiateTransaction?mid=${enc(mid)}&orderId=${enc(orderId)}`,
    { body, head: { signature } }
  );
  const txnToken = json?.body?.txnToken;
  if (!txnToken || json?.body?.resultInfo?.resultStatus === "F") {
    throw new Error(`Paytm: ${json?.body?.resultInfo?.resultMsg || "couldn't start checkout"}`);
  }
  return { txnToken, orderId, mid, amount: amountStr, host: PAYTM_HOST };
}

// ─── authoritative status + idempotent credit ──────────────────────────
async function txnStatus(orderId) {
  const { mid, key } = await paytmCfg();
  const body = { mid, orderId };
  const signature = genSignature(JSON.stringify(body), key);
  const { json } = await paytmPost(`${PAYTM_HOST}/v3/order/status`, { body, head: { signature } });
  return json?.body || {};
}

async function markPaidAndCredit(orderId, paytmAmount) {
  const rows = await sb(`client_recharges?cashfree_link_id=eq.${enc(orderId)}&select=id,status,amount,tenant_id,created_by`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return { credited: false };
  if (row.status === "paid") return { credited: true, already: true, amount: row.amount };
  // Guard: the amount Paytm actually collected must match what we billed.
  if (paytmAmount != null && Math.abs(Number(paytmAmount) - Number(row.amount)) > 0.5) {
    return { credited: false, mismatch: true };
  }
  await sb(`client_recharges?id=eq.${enc(row.id)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() }),
  });
  try {
    const profs = await sb(`profiles?id=eq.${enc(row.created_by)}&select=name`);
    const clientName = (Array.isArray(profs) && profs[0]?.name) || "A client";
    await sb("notifications", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        type: "wallet_recharge", title: `${clientName} topped up ₹${Number(row.amount).toLocaleString("en-IN")}`,
        body: "Wallet recharge via Paytm", actor: clientName, actor_role: "client",
        tenant_id: row.tenant_id, meta: { amount: row.amount, order_id: orderId },
      }),
    });
  } catch (e) { console.error("recharge notification failed:", e.message || e); }
  return { credited: true, amount: row.amount };
}

// ─── callback (Paytm → us, form POST) ──────────────────────────────────
async function handleCallback(req, res) {
  const p = typeof req.body === "string" ? Object.fromEntries(new URLSearchParams(req.body)) : (req.body || {});
  const orderId = p.ORDERID || p.orderId || (req.query && req.query.order) || "";
  const go = (status) => {
    res.writeHead(302, { Location: `https://avivainternational.co/portal/wallet?recharge=${status}${orderId ? `&order=${enc(orderId)}` : ""}` });
    res.end();
  };
  try {
    if (!orderId) return go("failed");
    const st = await txnStatus(orderId);
    const ok = st?.resultInfo?.resultStatus === "TXN_SUCCESS" || st?.status === "TXN_SUCCESS";
    if (ok) { await markPaidAndCredit(orderId, st?.txnAmount); return go("success"); }
    return go("failed");
  } catch (e) {
    console.error("paytm callback error", e);
    return go("failed");
  }
}

export default async function handler(req, res) {
  if (req.query?.action === "callback") return handleCallback(req, res);

  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (body.action === "initiate") {
      const { user, profile } = await authedCaller(req);
      return res.status(200).json(await actionInitiate(body, user, profile));
    }
    if (body.action === "status") {
      await authedCaller(req);
      const orderId = String(body.orderId || "");
      const st = await txnStatus(orderId);
      const paid = st?.resultInfo?.resultStatus === "TXN_SUCCESS" || st?.status === "TXN_SUCCESS";
      if (paid) await markPaidAndCredit(orderId, st?.txnAmount);
      return res.status(200).json({ paid, status: st?.resultInfo?.resultStatus || st?.status || "unknown" });
    }
    return res.status(400).json({ error: `unknown action: ${body.action}` });
  } catch (e) {
    console.error("paytm error", e);
    const code = /invalid token|missing bearer|no profile/i.test(e.message || "") ? 401 : 500;
    return res.status(code).json({ error: e.message || String(e) });
  }
}
