// Shopify mandatory privacy-compliance webhooks.
//
// Every Shopify app — App Store, Custom Distribution, or otherwise —
// must respond to three GDPR-style topics. Without these, the app
// stays stuck in Shopify's automated review queue indefinitely and
// merchants see "This app is under review" on every install attempt.
//
// ONE URL handles all three topics. Shopify sets the `X-Shopify-Topic`
// header on every webhook, so we route internally instead of needing
// three separate URLs. The merchant configures the same URL three
// times in Shopify Partners → Configuration → Privacy webhooks.
//
//   POST https://avivainternational.co/api/shopify-compliance
//   headers:
//     X-Shopify-Topic:          customers/data_request | customers/redact | shop/redact
//     X-Shopify-Hmac-Sha256:    base64(hmac_sha256(rawBody, SHOPIFY_API_SECRET))
//     X-Shopify-Shop-Domain:    <shop>.myshopify.com
//
// Response must be 200 OK with empty body for ack; anything else and
// Shopify retries with exponential backoff for 48 hours, eventually
// flagging the app as broken (more review delays).
//
// Body-parser is OFF on purpose. We need the RAW bytes to verify
// HMAC — Shopify signs the exact buffer it sent, not a re-serialised
// version. JSON.parse happens after verification.

import { createHmac, timingSafeEqual } from "crypto";

export const config = { api: { bodyParser: false } };

const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=minimal",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function verifyHmac(rawBody, hmacHeader) {
  if (!hmacHeader || !SHOPIFY_API_SECRET) return false;
  const computed = createHmac("sha256", SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest("base64");
  // Lengths must match BEFORE timingSafeEqual or it throws.
  if (computed.length !== hmacHeader.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(computed, "utf8"),
      Buffer.from(hmacHeader, "utf8"),
    );
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  // 1) Read RAW body before parsing. HMAC is over the exact bytes.
  let rawBody;
  try { rawBody = await readRawBody(req); }
  catch (e) {
    return res.status(400).json({ error: "couldn't read body" });
  }

  // 2) Verify Shopify's HMAC signature. Reject if it doesn't match
  //    SHOPIFY_API_SECRET — proves Shopify (and only Shopify, with
  //    our secret) sent this. Without this, an attacker could spam
  //    fake redact requests to wipe legitimate tenants.
  const hmacHeader = req.headers["x-shopify-hmac-sha256"];
  if (!verifyHmac(rawBody, hmacHeader)) {
    return res.status(401).json({ error: "invalid hmac" });
  }

  const topic = String(req.headers["x-shopify-topic"] || "").toLowerCase();
  const shop  = String(req.headers["x-shopify-shop-domain"] || "").toLowerCase();

  // 3) Parse the JSON body now that we trust the source.
  let data = {};
  try { data = JSON.parse(rawBody.toString("utf8") || "{}"); }
  catch { /* tolerate empty / malformed body — still ack 200 */ }

  // Always log every compliance event. These are audited by Shopify
  // and we may need to show the trail.
  console.log("[shopify-compliance]", JSON.stringify({
    topic, shop,
    customer_email: data.customer?.email || null,
    customer_id:    data.customer?.id    || null,
    orders_requested: Array.isArray(data.orders_requested) ? data.orders_requested.length : 0,
    received_at: new Date().toISOString(),
  }));

  try {
    switch (topic) {
      // ─── customers/data_request ───────────────────────────────────
      // Merchant (or one of their customers) asked for the customer's
      // data export. Aviva doesn't store independent customer profiles
      // — every customer-shaped field we have lives inside a
      // shopify_orders row, which is the merchant's own data being
      // mirrored. There's nothing for us to export. ACK and let the
      // merchant pull their data from Shopify directly.
      case "customers/data_request":
        return res.status(200).json({
          ok: true,
          note: "Aviva does not store customer data independently of the merchant's own Shopify records.",
        });

      // ─── customers/redact ─────────────────────────────────────────
      // Customer asked the merchant to delete their data. We have to
      // null out PII (email, name, phone, address) on every
      // shopify_orders row that references this customer. Order IDs
      // and totals stay — those are business records the merchant
      // keeps for accounting; only the personal fields get wiped.
      case "customers/redact": {
        const email = (data.customer?.email || "").toLowerCase();
        const phone = data.customer?.phone || null;

        // Resolve the tenant from the shop domain so we don't
        // accidentally wipe another tenant's data with a matching
        // email. shopify_domain is unique-ish per tenant (we
        // enforce shop mismatch elsewhere).
        const tenants = await sb(
          `tenants?shopify_domain=eq.${encodeURIComponent(shop)}&select=id`,
        ).catch(() => null);
        const tenantId = tenants?.[0]?.id;
        if (tenantId && (email || phone)) {
          const filters = [];
          if (email) filters.push(`customer_email=eq.${encodeURIComponent(email)}`);
          if (phone) filters.push(`customer_phone=eq.${encodeURIComponent(phone)}`);
          // OR the filters — null any row matching email OR phone.
          const orFilter = filters.length > 1 ? `or=(${filters.join(",")})` : filters[0];
          await sb(
            `shopify_orders?tenant_id=eq.${encodeURIComponent(tenantId)}&${orFilter}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                customer_email: null,
                customer_name:  null,
                customer_phone: null,
                shipping_address: null,
              }),
            },
          ).catch(err => console.error("[shopify-compliance] redact patch", err));
        }
        return res.status(200).json({ ok: true });
      }

      // ─── shop/redact ──────────────────────────────────────────────
      // The merchant uninstalled the app. Shopify gives us 48h to
      // wind down. We:
      //   1. Clear the tenant's Shopify connection (token + state)
      //   2. Leave historical shopify_orders rows intact — those are
      //      Aviva's accounting record of work the floor already did
      //      (printed, packed, shipped). The merchant uninstalling
      //      doesn't erase that we billed them for it.
      // Shop's data privacy (customer PII) is handled separately by
      // customers/redact webhooks fired per-customer.
      case "shop/redact":
        await sb(
          `tenants?shopify_domain=eq.${encodeURIComponent(shop)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              shopify_access_token: null,
              shopify_install_state: null,
              shopify_install_state_expires_at: null,
            }),
          },
        ).catch(err => console.error("[shopify-compliance] shop/redact", err));
        return res.status(200).json({ ok: true });

      default:
        // Unknown topic — ack so Shopify doesn't retry, but log it.
        console.warn("[shopify-compliance] unknown topic:", topic);
        return res.status(200).json({ ok: true, note: "topic ignored" });
    }
  } catch (e) {
    console.error("[shopify-compliance] handler error", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
