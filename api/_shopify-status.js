// Vercel serverless function — returns the connection status of the
// caller's tenant (whether a Shopify store is wired, when it last
// synced, and basic shop facts). The access token is NEVER returned.
//
// GET /api/shopify-status
//   headers: Authorization: Bearer <supabase access token>
//   returns: { connected, shop?: {domain, currency, last_synced_at, orders_count}, tenant?: {id,name} }

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

async function authedUser(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign-in required");
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) throw new Error("Session expired");
  const user = await userRes.json();
  const rows = await sb(`profiles?id=eq.${user.id}&select=id,role,tenant_id,name`);
  return { user, profile: rows?.[0] };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const { profile } = await authedUser(req);
    if (!profile?.tenant_id) {
      return res.status(200).json({ connected: false });
    }
    const tenants = await sb(`tenants?id=eq.${encodeURIComponent(profile.tenant_id)}&select=id,name,slug,shopify_domain,shopify_access_token`);
    const tenant = tenants?.[0];
    if (!tenant || !tenant.shopify_domain || !tenant.shopify_access_token) {
      return res.status(200).json({
        connected: false,
        tenant: tenant ? { id: tenant.id, name: tenant.name } : null,
      });
    }

    // Count synced orders for this tenant + find latest sync timestamp.
    const counts = await sb(`shopify_orders?tenant_id=eq.${encodeURIComponent(tenant.id)}&select=synced_at&order=synced_at.desc&limit=1`);
    const lastSyncedAt = counts?.[0]?.synced_at || null;
    const totalRes = await fetch(`${SUPABASE_URL}/rest/v1/shopify_orders?tenant_id=eq.${encodeURIComponent(tenant.id)}&select=id`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`, Prefer: "count=exact" },
    });
    const range = totalRes.headers.get("content-range") || "";
    const ordersCount = Number((range.split("/")[1] || "0")) || 0;

    return res.status(200).json({
      connected: true,
      tenant: { id: tenant.id, name: tenant.name },
      shop: {
        domain: tenant.shopify_domain,
        last_synced_at: lastSyncedAt,
        orders_count: ordersCount,
      },
    });
  } catch (e) {
    console.error("[shopify-status]", e);
    return res.status(400).json({ error: e.message || String(e) });
  }
}
