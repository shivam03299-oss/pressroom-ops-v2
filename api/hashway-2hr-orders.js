// Vercel serverless function for the Hashway 2-hour Orders dashboard.
//
// Acts as a service-role proxy so we don't have to add RLS policies for
// every Hashway team member. Anyone whose pressroom profile is either
// `role = 'admin'` OR `tenant_id = 't-hashway'` can read + update
// hashway_2hr_orders rows through this endpoint.
//
// POST /api/hashway-2hr-orders
//   headers: Authorization: Bearer <supabase access token>
//   body:    { action: "list" }
//          | { action: "update_status", orderId, status }

const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

const HASHWAY_TENANT_ID = "t-hashway";
const ALLOWED_STATUSES = [
  "pending",
  "paid",
  "packed",
  "out_for_delivery",
  "delivered",
  "failed",
  "refunded",
];

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

async function authedHashwayUser(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("missing bearer token");
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) throw new Error("invalid token");
  const user = await userRes.json();
  const rows = await sb(`profiles?id=eq.${user.id}&select=id,role,tenant_id,name`);
  const profile = rows?.[0];
  if (!profile) throw new Error("no profile");
  const ok = profile.role === "admin" || profile.tenant_id === HASHWAY_TENANT_ID;
  if (!ok) throw new Error("not authorized for Hashway");
  return profile;
}

async function actionList() {
  const rows = await sb(
    `hashway_2hr_orders?select=*&order=created_at.desc&limit=200`
  );
  return rows || [];
}

async function actionUpdateStatus({ orderId, status }) {
  if (!orderId) throw new Error("missing orderId");
  if (!ALLOWED_STATUSES.includes(status)) throw new Error(`invalid status: ${status}`);
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === "paid") patch.paid_at = new Date().toISOString();
  const rows = await sb(`hashway_2hr_orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!rows || rows.length === 0) throw new Error("order not found");
  return rows[0];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const profile = await authedHashwayUser(req);
    const action = (req.body && req.body.action) || "list";
    let data;
    switch (action) {
      case "list":
        data = await actionList();
        break;
      case "update_status":
        data = await actionUpdateStatus(req.body);
        break;
      default:
        return res.status(400).json({ error: `unknown action: ${action}` });
    }
    return res.status(200).json({ ok: true, actor: profile.name, data });
  } catch (e) {
    console.error("hashway-2hr-orders error", e);
    const code = /token|invalid|authorized/i.test(e.message || "") ? 401 : 500;
    return res.status(code).json({ error: e.message || String(e) });
  }
}
