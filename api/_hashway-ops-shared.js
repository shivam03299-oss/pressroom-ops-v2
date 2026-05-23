// Shared helpers for the hashway-ops command center endpoints.
// Vercel serverless functions can import from each other within /api.
//
// Kept tight and dependency-free so each endpoint stays cold-startable.

export const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
export const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

export const FOUNDER_EMAIL = "shivam03299@gmail.com";

// E.164 without leading '+'. Used as the destination for the daily brief.
export const FOUNDER_WA_NUMBER = "919999041779";

// Normalize any incoming phone string to E.164-without-plus.
// Strips +, spaces, dashes, parens. Adds India country code if a
// 10-digit national number arrives without it.
export function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[^\d]/g, "");
  if (!s) return null;
  if (s.length === 10) s = "91" + s;       // bare 9999041779 → 919999041779
  if (s.startsWith("0") && s.length === 11) s = "91" + s.slice(1); // 09999041779 → 919999041779
  return s;
}

// Service-role REST helper — bypasses RLS. Every endpoint here gates
// founder-email first, then uses this for actual DB work.
export async function sb(path, opts = {}) {
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

// Verify the bearer token belongs to the founder. Returns { id, email }.
export async function authedFounder(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("missing bearer token");
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) throw new Error("invalid token");
  const user = await userRes.json();
  if (!user?.email || user.email.toLowerCase() !== FOUNDER_EMAIL.toLowerCase()) {
    throw new Error("founder-only endpoint");
  }
  return { id: user.id, email: user.email };
}

// Append-only audit log helper.
export async function audit({ actorType, actorId, action, entityType, entityId, payload }) {
  try {
    await sb("hashway_ops_audit_log", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{
        actor_type:  actorType,
        actor_id:    actorId,
        action,
        entity_type: entityType,
        entity_id:   entityId,
        payload:     payload || {},
      }]),
    });
  } catch (e) {
    // Audit failures should never break the calling action.
    console.error("[audit] failed:", e?.message || e);
  }
}
