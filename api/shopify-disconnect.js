// Clears shopify_domain + shopify_access_token on the caller's tenant.
// Historical orders in shopify_orders are kept (the client may want to
// see their dispatched orders even after disconnecting).
//
// POST /api/shopify-disconnect
//   headers: Authorization: Bearer <supabase access token>

const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const auth = req.headers.authorization || req.headers.Authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Sign-in required" });
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: "Session expired" });
    const user = await userRes.json();
    const profiles = await sb(`profiles?id=eq.${user.id}&select=id,tenant_id`);
    const tenantId = profiles?.[0]?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: "No store linked" });

    await sb(`tenants?id=eq.${encodeURIComponent(tenantId)}`, {
      method: "PATCH",
      body: JSON.stringify({ shopify_domain: null, shopify_access_token: null }),
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[shopify-disconnect]", e);
    return res.status(400).json({ error: e.message || String(e) });
  }
}
