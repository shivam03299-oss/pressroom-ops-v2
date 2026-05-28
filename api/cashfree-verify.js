// Vercel serverless function: confirm a Cashfree order is truly paid before
// the client portal credits the wallet. The client cannot be trusted to
// decide payment success — we hit Cashfree's GET /orders/{id} with our
// server-only secret and only return PAID when Cashfree says so.
//
// POST /api/cashfree-verify
//   headers: Authorization: Bearer <supabase access token>
//   body:    { order_id: string }
//   returns: { status: "PAID" | "ACTIVE" | "EXPIRED" | ..., amount, raw }

const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

const CASHFREE_BASE = "https://api.cashfree.com/pg";
const CASHFREE_APP_ID  = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET  = process.env.CASHFREE_SECRET;
const CASHFREE_VERSION = "2023-08-01";

async function authedUser(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("missing bearer token");
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error("invalid token");
  return await r.json();
}

function sb(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
}

// Credit the client's wallet for a confirmed-PAID Cashfree order. Idempotent
// on the Cashfree order id so replays / double verifies never double-credit.
// Until a Cashfree webhook lands, this verify call is what persists top-ups.
async function creditWallet(user, data) {
  const orderId = data.order_id;
  if (!orderId) return;

  const existing = await sb(`client_recharges?cashfree_link_id=eq.${encodeURIComponent(orderId)}&select=id`);
  const rows = await existing.json();
  if (Array.isArray(rows) && rows.length > 0) return; // already credited

  const pr = await sb(`profiles?id=eq.${encodeURIComponent(user.id)}&select=tenant_id`);
  const profs = await pr.json();
  const tenantId = Array.isArray(profs) && profs[0]?.tenant_id;
  if (!tenantId) throw new Error("no tenant linked to user " + user.id);

  const ins = await sb(`client_recharges`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      tenant_id: tenantId,
      amount: data.order_amount,
      status: "paid",
      payment_method: "cashfree",
      cashfree_link_id: orderId,
      note: "Wallet top-up",
      paid_at: new Date().toISOString(),
      created_by: user.id,
    }),
  });
  if (!ins.ok) throw new Error("recharge insert failed: " + (await ins.text()));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    if (!CASHFREE_APP_ID || !CASHFREE_SECRET) {
      return res.status(500).json({ error: "Cashfree credentials not configured (set CASHFREE_APP_ID and CASHFREE_SECRET in env)" });
    }
    const user = await authedUser(req);

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const orderId = String(body.order_id || "").trim();
    if (!orderId) return res.status(400).json({ error: "order_id required" });

    const cf = await fetch(`${CASHFREE_BASE}/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
      headers: {
        "x-api-version": CASHFREE_VERSION,
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET,
      },
    });
    const text = await cf.text();
    if (!cf.ok) {
      return res.status(cf.status).json({ error: "cashfree-verify failed", detail: text });
    }
    const data = JSON.parse(text);
    const paid = data.order_status === "PAID";

    // Persist the top-up so the wallet balance reflects it. Never let a
    // bookkeeping hiccup mask a genuine PAID result from the client.
    if (paid) {
      try { await creditWallet(user, data); }
      catch (e) { console.error("creditWallet failed:", e.message || e); }
    }

    return res.status(200).json({
      status: data.order_status,        // PAID | ACTIVE | EXPIRED | ...
      amount: data.order_amount,
      order_id: data.order_id,
      paid,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
