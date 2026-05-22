// Vercel serverless function: create a Cashfree PG order so the client portal
// can launch a hosted checkout for wallet recharges. Auth via Supabase JWT.
//
// POST /api/cashfree-order
//   headers: Authorization: Bearer <supabase access token>
//   body:    { amount: number }       // INR, min 100
//   returns: { order_id, payment_session_id, amount }
//
// The secret_key NEVER leaves this file. The frontend only receives the
// short-lived payment_session_id which is required to render the SDK widget.

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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    if (!CASHFREE_APP_ID || !CASHFREE_SECRET) {
      return res.status(500).json({ error: "Cashfree credentials not configured (set CASHFREE_APP_ID and CASHFREE_SECRET in env)" });
    }
    const user = await authedUser(req);

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 100) {
      return res.status(400).json({ error: "amount must be a number ≥ 100" });
    }

    const customerId =
      String(user.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50) || `u${Date.now()}`;
    const customerEmail = user.email || "noreply@aviva.local";
    const customerName  = user.user_metadata?.full_name || user.email || "Aviva customer";
    // Cashfree requires a 10-digit Indian phone; fall back to a placeholder
    // when the profile doesn't have one. Customer can edit it in the widget.
    const rawPhone = (user.user_metadata?.phone || "").replace(/\D/g, "");
    const customerPhone = rawPhone.length >= 10 ? rawPhone.slice(-10) : "9999999999";

    const orderId = `aviva_wallet_${Date.now()}_${customerId.slice(0, 6)}`;
    const origin = req.headers.origin || `https://${req.headers.host || "aviva.local"}`;

    const payload = {
      order_id: orderId,
      order_amount: Math.round(amount * 100) / 100,
      order_currency: "INR",
      customer_details: {
        customer_id: customerId,
        customer_email: customerEmail,
        customer_name: customerName,
        customer_phone: customerPhone,
      },
      order_meta: {
        return_url: `${origin}/portal?cf_order_id={order_id}`,
        notify_url: `${origin}/api/cashfree-webhook`,
      },
      order_note: "Aviva wallet recharge",
    };

    const cf = await fetch(`${CASHFREE_BASE}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": CASHFREE_VERSION,
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET,
      },
      body: JSON.stringify(payload),
    });
    const text = await cf.text();
    if (!cf.ok) {
      return res.status(cf.status).json({ error: "cashfree-order failed", detail: text });
    }
    const data = JSON.parse(text);
    if (!data.payment_session_id) {
      return res.status(502).json({ error: "no payment_session_id from cashfree", detail: data });
    }

    return res.status(200).json({
      order_id: data.order_id || orderId,
      payment_session_id: data.payment_session_id,
      amount: payload.order_amount,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
