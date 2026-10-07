// Yoraku storefront AI support bot.
//
// POST /api/yoraku-chat
//   body: { messages: [{ role: "user"|"assistant", content: "..." }, ...] }
//   returns: { reply: "<assistant text>" }
//
// Claude-powered, running the same stack as the rest of pressroom-ops
// (Vercel serverless + @anthropic-ai/sdk). It can:
//   • answer FAQ / policy questions   (knowledge embedded in the system prompt)
//   • look up a live order + tracking (Shopify Admin API, GATED behind
//     email + order-number match so it never leaks another customer's order)
//   • recommend products / sizes      (live Shopify catalog)
// Anything it can't safely resolve (damaged item, payment failure, refund
// disputes) it escalates to storeyoraku@gmail.com with the conversation.
//
// Secrets — set in Vercel env (or the Supabase app_config table as fallback):
//   ANTHROPIC_API_KEY        already present for the other agents
//   YORAKU_SHOP_DOMAIN       e.g. 1tfust-us.myshopify.com   (app_config: yoraku_shop_domain)
//   YORAKU_ADMIN_TOKEN       shpat_… with read_orders, read_products
//                                                           (app_config: yoraku_admin_token)
//   YORAKU_FREE_SHIP_MIN     optional, default 999
//   YORAKU_CHAT_MODEL        optional, default claude-haiku-4-5-20251001

import Anthropic from "@anthropic-ai/sdk";
import { sb } from "./_velocity-track.js";

const API_VERSION = "2025-04";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TURNS = 6;          // safety cap on the tool-use loop
const MAX_MESSAGES = 24;      // trim very long histories

const ALLOWED_ORIGINS = [
  "https://yoraku.com",
  "https://www.yoraku.com",
  "https://1tfust-us.myshopify.com",
];

// ── config resolution (env first, app_config fallback) ───────────────
async function config() {
  let dom = process.env.YORAKU_SHOP_DOMAIN;
  let tok = process.env.YORAKU_ADMIN_TOKEN;
  if (!dom || !tok) {
    try {
      const rows = await sb("app_config?key=in.(yoraku_shop_domain,yoraku_admin_token)&select=key,value");
      const m = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
      dom = dom || m.yoraku_shop_domain;
      tok = tok || m.yoraku_admin_token;
    } catch { /* app_config optional */ }
  }
  return {
    domain: dom || "1tfust-us.myshopify.com",
    token: tok,
    freeShip: Number(process.env.YORAKU_FREE_SHIP_MIN) || 999,
    model: process.env.YORAKU_CHAT_MODEL || DEFAULT_MODEL,
  };
}

// ── Shopify Admin GraphQL ────────────────────────────────────────────
async function shopify(cfg, query, variables) {
  if (!cfg.token) throw new Error("Yoraku Shopify token not configured");
  const r = await fetch(`https://${cfg.domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": cfg.token },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error("Shopify: " + JSON.stringify(j.errors).slice(0, 300));
  return j.data;
}

const money = (n) => "₹" + Math.round(Number(n)).toLocaleString("en-IN");

// ── tool: product search ─────────────────────────────────────────────
async function searchProducts(cfg, args) {
  const q = String(args.query || "").slice(0, 120);
  const data = await shopify(
    cfg,
    `query($q:String!){ products(first:5, query:$q, sortKey:BEST_SELLING){ nodes {
        title handle onlineStoreUrl productType status
        priceRangeV2 { minVariantPrice { amount } }
        variants(first:10){ nodes { title availableForSale } }
      } } }`,
    { q: q || "status:active" }
  );
  const items = (data.products?.nodes || [])
    .filter((p) => p.status === "ACTIVE")
    .map((p) => ({
      name: p.title,
      price: money(p.priceRangeV2?.minVariantPrice?.amount || 0),
      url: p.onlineStoreUrl || `https://yoraku.com/products/${p.handle}`,
      sizes_in_stock: (p.variants?.nodes || []).filter((v) => v.availableForSale).map((v) => v.title),
    }));
  return { count: items.length, products: items };
}

// ── tool: order status (privacy-gated) ───────────────────────────────
async function orderStatus(cfg, args) {
  const email = String(args.email || "").trim().toLowerCase();
  let num = String(args.order_number || "").trim().replace(/^#/, "");
  if (!email || !num) return { error: "Both email and order number are required to look up an order." };
  const data = await shopify(
    cfg,
    `query($q:String!){ orders(first:5, query:$q){ nodes {
        name email createdAt displayFulfillmentStatus displayFinancialStatus
        fulfillments(first:5){ trackingInfo { number url company } }
        lineItems(first:25){ nodes { title quantity } }
      } } }`,
    { q: `name:#${num}` }
  );
  const order = (data.orders?.nodes || []).find((o) => (o.email || "").toLowerCase() === email);
  if (!order) {
    // Do not reveal whether the order exists — just say it didn't match.
    return { matched: false, message: "No order matches that email and order number. Please double-check both, or contact storeyoraku@gmail.com." };
  }
  const tracking = (order.fulfillments || []).flatMap((f) => f.trackingInfo || []).filter((t) => t && (t.number || t.url));
  return {
    matched: true,
    order_number: order.name,
    placed_on: (order.createdAt || "").slice(0, 10),
    payment_status: order.displayFinancialStatus,
    fulfillment_status: order.displayFulfillmentStatus,
    items: (order.lineItems?.nodes || []).map((l) => `${l.quantity}× ${l.title}`),
    tracking: tracking.map((t) => ({ courier: t.company || null, number: t.number || null, url: t.url || null })),
  };
}

const TOOLS = [
  {
    name: "search_products",
    description: "Search the live Yoraku catalog for tees by keyword (character, theme, colour, name). Use for product discovery and size/availability questions. Returns names, prices, in-stock sizes and product URLs.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Search keywords, e.g. 'blood moon', 'blaze', 'waffle', or a size/theme." } },
      required: ["query"],
    },
  },
  {
    name: "get_order_status",
    description: "Look up a customer's order status and tracking. REQUIRES both the customer's email and their order number. Only returns data when the email matches the order on file. Never call without both values — ask the customer for them first.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Customer email used at checkout." },
        order_number: { type: "string", description: "Order number, e.g. 1023 or #1023." },
      },
      required: ["email", "order_number"],
    },
  },
];

function systemPrompt(cfg) {
  return `You are the support assistant for YORAKU (夜楽) — an India-born anime / Japanese-streetwear label. Tone: concise, confident, a little after-dark cool, but genuinely helpful and never cheesy. Reply in short, skimmable messages. Currency is INR (₹). Customers are in India.

WHAT YOU KNOW (state only these facts; never invent policy):
- Products: heavyweight 240 GSM oversized cotton tees, hand-drawn anime artwork, limited drops that don't restock. Sizes XS, S, M, L, XL, XXL. Most tees are ${money(999)}; the Crimson Mist Waffle is ₹1,299.
- Sizing: oversized fit. Size guide (inches): S 44" chest, M 46", L 48", XL 46", XXL 50" — shoulder 23–27", body length 27–31". If unsure between sizes, size down for a regular fit. Full chart is on every product page ("Size Guide").
- Shipping: dispatched from New Delhi within 24–48h (excl. Sundays/holidays); pan-India delivery 3–7 business days after dispatch. Free shipping on prepaid orders over ${money(cfg.freeShip)}. COD available on most pincodes. Tracking link is emailed/SMSed when the order ships.
- Returns/exchanges: within 7 days of delivery, items unworn/unwashed with tags. Start a return by emailing storeyoraku@gmail.com with the order number. Damaged/wrong item: email within 48h with photos for a free replacement or refund.
- Care: machine wash cold inside out, no bleach, lay flat to dry, iron on reverse low heat.
- Care/returns/payment problems, damaged items, refunds, or anything you're unsure about → do NOT guess. Give storeyoraku@gmail.com and offer to summarise the issue for them.

TOOLS:
- Use search_products for any product / availability / "what do you have" / size-in-stock question. Share the product name, price, in-stock sizes and link.
- Use get_order_status ONLY after the customer gives BOTH their email and order number. If they ask about an order, first ask for both. Never reveal order details unless the tool confirms a match. If it doesn't match, tell them to re-check or email support — never confirm whether an order exists.

Keep answers to a few sentences. Don't claim to have done anything you haven't (you cannot cancel orders, issue refunds, or edit orders — route those to email).`;
}

// ── Claude tool loop ─────────────────────────────────────────────────
async function runChat(cfg, messages) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const convo = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));
  if (!convo.length || convo[convo.length - 1].role !== "user") {
    return "Ask me anything about your order, sizing, shipping or the drops.";
  }

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const resp = await client.messages.create({
      model: cfg.model,
      max_tokens: 700,
      system: systemPrompt(cfg),
      tools: TOOLS,
      messages: convo,
    });

    if (resp.stop_reason === "tool_use") {
      const toolUses = resp.content.filter((c) => c.type === "tool_use");
      convo.push({ role: "assistant", content: resp.content });
      const results = [];
      for (const tu of toolUses) {
        let out;
        try {
          if (tu.name === "search_products") out = await searchProducts(cfg, tu.input || {});
          else if (tu.name === "get_order_status") out = await orderStatus(cfg, tu.input || {});
          else out = { error: "unknown tool" };
        } catch (e) {
          out = { error: "lookup failed", detail: String(e.message || e).slice(0, 160) };
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
      }
      convo.push({ role: "user", content: results });
      continue;
    }

    return resp.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim()
      || "Sorry, I didn't catch that — could you rephrase?";
  }
  return "This one's better handled by a human — email storeyoraku@gmail.com and the team will sort it out.";
}

// ── handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return res.status(400).json({ error: "messages required" });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });

    const cfg = await config();
    const reply = await runChat(cfg, messages);
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: "chat failed", detail: String(e.message || e).slice(0, 200) });
  }
}
