// Vercel serverless function: create a Cashfree Payment Link and send
// it to a client over SMS + email. Used by the admin dashboard to
// pre-fund a brand's wallet without making them log in to the portal.
//
// POST /api/cashfree-link
//   headers: Authorization: Bearer <supabase access token of an admin>
//   body: {
//     tenant_id:       string,         // 't-balleti' etc.
//     amount_base:     number,         // pre-tax amount in INR (e.g. 5000)
//     gst_rate:        number,         // optional, default 5
//     purpose:         string,         // optional, shown on the Cashfree page
//     send_sms:        boolean,        // default true
//     send_email:      boolean,        // default true
//     override_phone:  string,         // optional, 10-digit IN — overrides profile phone
//     override_email:  string,         // optional — overrides profile email
//   }
//   returns: { link_id, link_url, link_amount, link_amount_base, link_gst,
//              link_expiry, recharge_id, sent_to: { sms, email } }
//
// Only profiles with role in ('admin', 'founder') may call this. We insert
// a 'pending' row into client_recharges with the cashfree_link_id so the
// admin can see the outstanding link, and the existing cashfree-verify
// flow (or a future webhook) will flip it to 'paid' when the client pays.

const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

const CASHFREE_BASE    = "https://api.cashfree.com/pg";
const CASHFREE_APP_ID  = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET  = process.env.CASHFREE_SECRET;
const CASHFREE_VERSION = "2023-08-01";

async function svc(path, init = {}) {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`supabase ${path} ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function requireAdmin(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("missing bearer token");
  // Resolve the caller via auth API.
  const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${token}` },
  });
  if (!ur.ok) throw new Error("invalid token");
  const user = await ur.json();
  // Check role on profiles.
  const profiles = await svc(`/rest/v1/profiles?id=eq.${user.id}&select=id,role,name`);
  const profile = profiles && profiles[0];
  if (!profile) throw new Error("no profile for caller");
  if (!["admin", "founder"].includes(profile.role)) {
    throw new Error("admin/founder role required");
  }
  return { user, profile };
}

// Pick the best contact for the tenant: prefer client-role profile,
// otherwise the most recent profile attached to that tenant. Phone is
// pulled from auth.users.raw_user_meta_data because that's where the
// signup form stashes it.
async function tenantContact(tenantId) {
  const profiles = await svc(
    `/rest/v1/profiles?tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,name,email,role,created_at&order=role.asc,created_at.desc`
  );
  if (!profiles?.length) return null;
  const primary = profiles.find(p => p.role === "client") || profiles[0];
  let phone = null;
  try {
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${primary.id}`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}` },
    });
    if (ur.ok) {
      const u = await ur.json();
      phone = (u.user_metadata?.phone || u.phone || "").replace(/\D/g, "");
    }
  } catch {/* swallow */}
  return {
    id: primary.id,
    name: primary.name || "Aviva customer",
    email: primary.email || null,
    phone: phone && phone.length >= 10 ? phone.slice(-10) : null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    if (!CASHFREE_APP_ID || !CASHFREE_SECRET) {
      return res.status(500).json({ error: "Cashfree credentials not configured (set CASHFREE_APP_ID and CASHFREE_SECRET in env)" });
    }
    await requireAdmin(req);

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const tenantId   = String(body.tenant_id || "").trim();
    const amountBase = Number(body.amount_base);
    const gstRate    = body.gst_rate != null ? Number(body.gst_rate) : 5;
    const purpose    = (body.purpose || "Aviva wallet top-up").toString().slice(0, 240);
    const sendSms    = body.send_sms !== false;
    const sendEmail  = body.send_email !== false;

    if (!tenantId) return res.status(400).json({ error: "tenant_id is required" });
    if (!Number.isFinite(amountBase) || amountBase < 100) {
      return res.status(400).json({ error: "amount_base must be ≥ 100 INR" });
    }
    if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 28) {
      return res.status(400).json({ error: "gst_rate must be between 0 and 28" });
    }

    // Tenant lookup.
    const tenants = await svc(`/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=id,name,slug`);
    const tenant = tenants && tenants[0];
    if (!tenant) return res.status(404).json({ error: "tenant not found" });

    // Resolve contact for SMS/email notifications.
    let contact = await tenantContact(tenantId);
    const overridePhone = (body.override_phone || "").replace(/\D/g, "");
    const overrideEmail = (body.override_email || "").trim();
    if (overridePhone) contact = { ...(contact || {}), phone: overridePhone.slice(-10) };
    if (overrideEmail) contact = { ...(contact || {}), email: overrideEmail };

    if (sendSms && !contact?.phone) {
      return res.status(400).json({ error: "no phone on file for this client — pass override_phone or disable send_sms" });
    }
    if (sendEmail && !contact?.email) {
      return res.status(400).json({ error: "no email on file for this client — pass override_email or disable send_email" });
    }

    // Compute amounts. amount_base × (1 + gst_rate/100), rounded to paise.
    const gstAmount   = Math.round(amountBase * (gstRate / 100) * 100) / 100;
    const linkAmount  = Math.round((amountBase + gstAmount) * 100) / 100;
    const linkId      = `avlink_${tenant.slug || tenant.id}_${Date.now()}`.slice(0, 50);
    const origin      = req.headers.origin || `https://${req.headers.host || "aviva.local"}`;
    const expiryIso   = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split(".")[0] + "+05:30";

    const customerName =
      contact?.name || tenant.name || "Aviva customer";

    const payload = {
      link_id: linkId,
      link_amount: linkAmount,
      link_currency: "INR",
      link_purpose: purpose,
      customer_details: {
        customer_name: customerName,
        customer_phone: contact?.phone || "9999999999",
        ...(contact?.email ? { customer_email: contact.email } : {}),
      },
      link_notify: {
        send_sms: !!(sendSms && contact?.phone),
        send_email: !!(sendEmail && contact?.email),
      },
      link_meta: {
        return_url: `${origin}/portal?cf_link_id={link_id}`,
        notify_url: `${origin}/api/cashfree-webhook`,
      },
      link_expiry_time: expiryIso,
      link_auto_reminders: true,
      link_partial_payments: false,
    };

    const cf = await fetch(`${CASHFREE_BASE}/links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": CASHFREE_VERSION,
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET,
      },
      body: JSON.stringify(payload),
    });
    const cfText = await cf.text();
    if (!cf.ok) {
      return res.status(cf.status).json({ error: "cashfree-link failed", detail: cfText });
    }
    const cfData = JSON.parse(cfText);
    const linkUrl = cfData.link_url;
    if (!linkUrl) {
      return res.status(502).json({ error: "no link_url from cashfree", detail: cfData });
    }

    // Log a pending recharge row so the admin sees the outstanding link
    // immediately. cashfree-verify (or a webhook) will flip it to paid.
    const noteParts = [
      `Wallet top-up (incl ${gstRate}% GST)`,
      `link sent to ${[contact?.phone && `+91 ${contact.phone}`, contact?.email].filter(Boolean).join(" + ")}`,
    ];
    const recharge = await svc(`/rest/v1/client_recharges`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{
        tenant_id: tenantId,
        amount: linkAmount,
        status: "pending",
        payment_method: "cashfree-link",
        cashfree_link_id: linkId,
        note: noteParts.join(" · "),
      }]),
    });

    return res.status(200).json({
      link_id: linkId,
      link_url: linkUrl,
      link_amount: linkAmount,
      link_amount_base: amountBase,
      link_gst: gstAmount,
      link_expiry: expiryIso,
      recharge_id: recharge?.[0]?.id || null,
      sent_to: {
        sms: payload.link_notify.send_sms ? `+91 ${contact.phone}` : null,
        email: payload.link_notify.send_email ? contact.email : null,
      },
    });
  } catch (e) {
    const msg = e.message || String(e);
    const status = /token|admin|role/.test(msg) ? 401 : 500;
    return res.status(status).json({ error: msg });
  }
}
