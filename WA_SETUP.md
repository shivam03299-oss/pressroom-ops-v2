# Hashway · WhatsApp setup guide

Step-by-step to take the Phase 1.1 WA integration live. Until you complete steps 1–6, the code runs in **dry-run mode** — every approved reply / order notification / daily brief is recorded in the DB but no actual WhatsApp message is sent.

Once steps 1–6 are done and Meta has approved your templates, just paste two env vars into Vercel and everything fires live.

---

## What you need

- ~30 min of active work (the rest is Meta approval wait time)
- A **dedicated phone number** that has never had WhatsApp on it (or that you're willing to wipe WA from). Once Meta links it to WA Business API, you can't use it with the normal WhatsApp app anymore.
- Your GST certificate (helps Facebook Business Manager verification go through faster)
- A debit/credit card for AiSensy subscription

---

## Step 1 — Sign up for AiSensy

1. Go to **https://www.aisensy.com**
2. Click **Sign Up** → use your founder email (`shivam03299@gmail.com`)
3. Pick the **Basic plan (₹999/mo)** to start. Upgrade later if you need broadcasts to >1k contacts.
4. After signup, AiSensy walks you through "Connect WhatsApp Business" — this is where it gets interesting (steps 2–4).

**Time: 5 min · Cost: ₹999/mo**

---

## Step 2 — Connect your number to WhatsApp Business API (via AiSensy)

AiSensy uses Facebook's embedded signup flow. From the dashboard:

1. Click **Connect WhatsApp Number**
2. Log in with your Facebook account (use one that has admin access to a Facebook Business Manager — create one at business.facebook.com if you don't have one)
3. Select / create your **Business Manager** (Hashway Clothing). Upload GST cert when prompted.
4. Click **Create new WhatsApp Business Account** if you don't already have one. Name it "Hashway Clothing".
5. Enter your dedicated phone number. Pick **SMS** for verification.
6. Enter the OTP. You're now provisioned on WhatsApp Business API. 🎉

**Time: 10 min active · 1–2 days for Meta's silent verification in the background**

---

## Step 3 — Display name approval

1. In AiSensy → **Settings** → **Profile** → set Display Name to `Hashway` (or `Hashway Clothing`)
2. Upload a brand logo (the green-tick WA verified badge is separate and harder to get — don't worry about it for now)
3. Submit for review. Meta usually approves in ~24h if your display name matches your brand.

**Time: 2 min submit · 1 day wait**

---

## Step 4 — Submit the 4 message templates for Meta approval

The 4 templates are already drafted in your database — you just need to copy each one into AiSensy and submit.

In AiSensy: **Templates** → **Create Template** → for each of the 4 below:

### Template 1 · `hashway_order_confirmed`
- **Name:** `hashway_order_confirmed` (must match exactly)
- **Category:** Utility
- **Language:** English
- **Body:**
  ```
  Hey {{1}}! 🔥

  Your Hashway order #{{2}} has been confirmed.
  Total: ₹{{3}}
  We'll ship it within 24h and message you the tracking link.

  Questions? Just reply to this message.

  — Hashway Clothing
  ```
- **Sample values** (Meta requires these):
  `{{1}}` = `Aarav`, `{{2}}` = `1234`, `{{3}}` = `1499`

### Template 2 · `hashway_order_shipped`
- **Name:** `hashway_order_shipped`
- **Category:** Utility
- **Body:**
  ```
  Hey {{1}}, your Hashway order #{{2}} just shipped! 📦

  Carrier: {{3}}
  AWB: {{4}}
  Expected delivery: {{5}}

  Track here: {{6}}
  ```
- **Sample values:** Aarav, 1234, Delhivery, DLV987654321, 15 May, https://hashway.in/track/DLV987654321

### Template 3 · `hashway_order_delivered`
- **Name:** `hashway_order_delivered`
- **Category:** Utility
- **Body:**
  ```
  Hey {{1}}, your Hashway order #{{2}} just landed! 🎉

  Hope you're vibing with it.

  Tag us @hashway on IG with your fit — every week we repost our favourites to the grid.

  Anything off? Reply here, we'll sort it.
  ```
- **Sample values:** Aarav, 1234

### Template 4 · `hashway_drop_announcement`
- **Name:** `hashway_drop_announcement`
- **Category:** **Marketing** (not Utility — this matters for opt-in rules)
- **Body:**
  ```
  Hey {{1}}, new Hashway drop just went live 🔥

  {{2}}

  Shop here: {{3}}

  First 50 orders ship free.
  ```
- **Sample values:** Aarav, SS26 · Volume 02, https://hashway.in/collections/ss26-v2

### Template 5 · `hashway_internal_daily_brief` (founder-only)
- **Name:** `hashway_internal_daily_brief`
- **Category:** Utility
- **Body:**
  ```
  ☀️ Hashway · Daily Brief · {{1}}

  Pending approvals: {{2}}
  Executed today: {{3}}
  Failed: {{4}}
  New customer DMs: {{5}}
  Undispatched paid orders >24h: {{6}}

  Open the inbox: {{7}}
  ```
- **Sample values:** 23 May, 4, 7, 0, 3, 2, https://pressroom-ops-v2.vercel.app/admin

**Time per template: 3 min submit · 1–2 days wait per template (they review in parallel)**

---

## Step 5 — Register the inbound webhook

This is how AiSensy tells our system "a customer just messaged you".

1. In AiSensy → **Settings** → **Webhooks** (or **Integrations** → **Webhooks** depending on UI version)
2. Set the URL to:
   ```
   https://pressroom-ops-v2.vercel.app/api/hashway-wa-webhook
   ```
3. Add a custom header:
   - Key: `x-hashway-webhook-secret`
   - Value: `<pick a long random string and remember it>` — e.g. run this in your terminal to generate one:
     ```
     openssl rand -hex 32
     ```
4. Enable events: **Message received**, **Message status update**
5. Save.

**Time: 3 min**

---

## Step 6 — Add 2 env vars to Vercel

Final step. In Vercel dashboard → your `pressroom-ops-v2` project → **Settings** → **Environment Variables**:

| Variable | Value | Where to get it |
|---|---|---|
| `AISENSY_API_KEY` | (your AiSensy API key) | AiSensy → Settings → API Key. Copy the long string. |
| `HASHWAY_WA_WEBHOOK_SECRET` | (the random string from step 5) | The same one you pasted into AiSensy in step 5 — must match byte-for-byte. |
| `CRON_SECRET` (optional) | (another random string) | For securing the Vercel cron. Generate with `openssl rand -hex 32`. |
| `ANTHROPIC_API_KEY` | (your Anthropic key) | console.anthropic.com → API Keys. Needed for the CX agent to run at all. |

After adding, **redeploy** (Vercel will prompt you).

---

## Step 7 — Verify it works

1. Open `/admin` → **Hashway's Office** → **Agents** tab → hit **Run now** on the CX agent
   - You should see a toast like "Proposed 2 tasks · 1.5K↑ / 600↓ tokens"
2. Go to **Founder Inbox** — you should see pending reply proposals if any customer DM'd Hashway recently
3. **Approve one** — check the customer's WhatsApp; they should receive the reply within seconds
4. Send a test DM to Hashway's WA number from your personal phone
5. Wait ~30 seconds, refresh **WA Threads** tab — your message should be there
6. Hit **Run now** on CX agent again — should propose a reply to your test message

**Daily brief test:** trigger manually by visiting `/api/hashway-ops-daily-brief` as the founder, OR wait until 9am IST tomorrow — Vercel cron will fire it automatically.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "AISENSY_API_KEY not set" toast on approve | env var missing | Add it in Vercel + redeploy |
| Webhook not firing (no messages in WA Threads) | URL or secret mismatch | Double-check both match Vercel env exactly |
| AiSensy rejects template | Body too promotional in Utility category | Submit as Marketing category instead |
| Customer reply not received | Outside 24h conversation window | Use a template message instead of session message |
| Daily brief 401 from cron | `CRON_SECRET` not set | Add it; Vercel includes the header automatically |

---

## What stays in dry-run for now (Phase 1.2)

Even after WA is fully live, these still record-but-don't-execute until you explicitly say go:

- Shopify refunds
- Delhivery NDR follow-ups
- Courier switches

Reason: those move real money or change real shipments. Tell Claude "go live on Phase 1.2 refunds" once you've validated a few approved-but-dry-run rows in `hashway_ops_executions` and they look right.
