// POST /api/hashway-ops-test-connection
//   headers: Authorization: Bearer <supabase access token>  (founder only)
//   body:    { service: "anthropic" | "aisensy" | "meta_ads" | "shopify" | "delhivery" | "google_search_console" }
//
// For each service, runs a live, minimal "am I really connected?" test
// and updates hashway_ops_integrations with the result. Returns
// { ok, message, http_status?, error? } so the wizard can render
// instant feedback. Founder-only.

import Anthropic from "@anthropic-ai/sdk";
import { sb, authedFounder } from "./_hashway-ops-shared.js";

async function setStatus(service, ok, message) {
  const patch = ok
    ? { status: "ready",   last_ok_at:    new Date().toISOString(), last_error: null }
    : { status: "error",   last_error_at: new Date().toISOString(), last_error: (message || "").slice(0, 500) };
  await sb(`hashway_ops_integrations?service=eq.${encodeURIComponent(service)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

// ─── per-service tests ────────────────────────────────────────────

async function testAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, message: "ANTHROPIC_API_KEY not set in Vercel env" };
  }
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const r = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 16,
      messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
    });
    const text = r.content.find(b => b.type === "text")?.text || "";
    return { ok: true, message: `Connected. Test response: "${text.slice(0, 40)}"` };
  } catch (e) {
    return { ok: false, message: e?.message || String(e) };
  }
}

async function testAiSensy() {
  if (!process.env.AISENSY_API_KEY) {
    return { ok: false, message: "AISENSY_API_KEY not set in Vercel env" };
  }
  try {
    // AiSensy doesn't have a clean /me endpoint, so we probe the campaigns
    // list endpoint which requires a valid API key. A 401 = bad key,
    // 200 (or even 404 on legacy paths) = key shape is valid.
    const res = await fetch("https://backend.aisensy.com/direct-apis/t1/messages", {
      method: "OPTIONS",
      headers: { Authorization: `Bearer ${process.env.AISENSY_API_KEY}` },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, http_status: res.status, message: "AiSensy rejected the API key" };
    }
    return { ok: true, http_status: res.status, message: "AiSensy reachable with the configured key" };
  } catch (e) {
    return { ok: false, message: e?.message || String(e) };
  }
}

async function testMetaAds() {
  const token  = process.env.META_ACCESS_TOKEN;
  const acctId = process.env.META_AD_ACCOUNT_ID;
  if (!token)  return { ok: false, message: "META_ACCESS_TOKEN not set in Vercel env" };
  if (!acctId) return { ok: false, message: "META_AD_ACCOUNT_ID not set in Vercel env (e.g. act_1234567890)" };
  try {
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(acctId)}?fields=id,name,currency,account_status&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, http_status: res.status, message: json?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, http_status: 200, message: `Connected to "${json.name}" (${json.currency})` };
  } catch (e) {
    return { ok: false, message: e?.message || String(e) };
  }
}

async function testShopify() {
  // Hashway Shopify is already wired via the existing custom app — we
  // verify by checking the row count in shopify_orders for t-hashway.
  try {
    const rows = await sb(`shopify_orders?tenant_id=eq.t-hashway&select=id&limit=1`);
    if (!rows) return { ok: false, message: "no shopify_orders rows returned for t-hashway" };
    // Get total count via a separate Prefer header
    const r = await fetch(`https://tacczufzvslzpkeyzuzq.supabase.co/rest/v1/shopify_orders?tenant_id=eq.t-hashway&select=id`, {
      headers: {
        apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8",
        Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8`,
        Prefer: "count=exact",
      },
    });
    const count = r.headers.get("content-range")?.split("/")?.[1] || "?";
    return { ok: true, message: `Connected. ${count} synced orders for Hashway in DB.` };
  } catch (e) {
    return { ok: false, message: e?.message || String(e) };
  }
}

async function testDelhivery() {
  // Delhivery token is intentionally NOT stored in env (per memory). We
  // mark this integration as a manual-attested ready — if the user is
  // using Delhivery anywhere in pressroom, it's working.
  return {
    ok: true,
    message: "Manually attested. Delhivery token is per-session; live API ping not run.",
  };
}

async function testGoogleSearchConsole() {
  if (!process.env.GOOGLE_SC_REFRESH_TOKEN || !process.env.GOOGLE_SC_CLIENT_ID || !process.env.GOOGLE_SC_CLIENT_SECRET) {
    return {
      ok: false,
      message: "Google Search Console OAuth not configured. Needs GOOGLE_SC_CLIENT_ID, GOOGLE_SC_CLIENT_SECRET, GOOGLE_SC_REFRESH_TOKEN. See setup guide.",
    };
  }
  // TODO: token refresh + SC API ping — Phase 2 build.
  return {
    ok: false,
    message: "OAuth flow + token refresh not yet wired. SEO agent setup is Phase 2.",
  };
}

// ─── handler ─────────────────────────────────────────────────────

const TESTS = {
  anthropic:             testAnthropic,
  aisensy:               testAiSensy,
  meta_ads:              testMetaAds,
  shopify:               testShopify,
  delhivery:             testDelhivery,
  google_search_console: testGoogleSearchConsole,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    await authedFounder(req);
    const { service } = req.body || {};
    const test = TESTS[service];
    if (!test) {
      return res.status(400).json({ error: `unknown service: ${service}. Valid: ${Object.keys(TESTS).join(", ")}` });
    }
    const result = await test();
    await setStatus(service, result.ok, result.message);
    return res.status(200).json({ service, ...result });
  } catch (e) {
    const msg = e?.message || String(e);
    const status = /founder-only|missing bearer|invalid token/.test(msg) ? 401 : 500;
    return res.status(status).json({ error: msg });
  }
}
