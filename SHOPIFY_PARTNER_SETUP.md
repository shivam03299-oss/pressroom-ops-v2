# Aviva · Shopify Partner App Setup

One-time setup. ~10 min of your time. After this, every new client connects to Aviva in **one click** — no more `shpat_` token pasting.

Why this matters: Shopify deprecated the per-store custom-app token flow on 2026-01-01. You can't ask new clients to paste a `shpat_` anymore. The only modern path is OAuth via an app you (Aviva) own in Shopify Partners.

The OAuth code is already built and live. You just need to (a) create the app, (b) drop 2 env vars in Vercel.

---

## Step 1 — Create Shopify Partner account (skip if you already have one)

1. Go to **https://partners.shopify.com**
2. Sign up — free, no card required.
3. Use a business email (the one you use for Aviva).

## Step 2 — Create the Aviva app

In Partners dashboard:

1. **Apps** (left rail) → **Create app**
2. Pick **Create app manually** (not "from a template")
3. App name: `Aviva` (or `Aviva International`)
4. App URL: `https://avivainternational.co`
5. **Allowed redirection URL(s)**: add this exact value (it must match byte-for-byte):
   ```
   https://avivainternational.co/api/shopify-oauth-callback
   ```
   *(If your production domain is different from `avivainternational.co`, use that instead — and set `SHOPIFY_OAUTH_REDIRECT_URL` to match in Step 4.)*
6. Click **Create**

## Step 3 — Configure scopes

In the app's **Configuration** tab, under **Admin API access scopes** tick:
- `read_orders`
- `read_customers`
- `read_products`
- `read_fulfillments`

*(Optional, add later if you build features that need them: `write_fulfillments`, `read_inventory`, `read_shipping`.)*

Click **Save**.

## Step 4 — Grab credentials

In the app's **Client credentials** section, you'll see:
- **Client ID** (this is the `SHOPIFY_API_KEY`)
- **Client secret** (this is the `SHOPIFY_API_SECRET`) — click **Show** to reveal

Copy both.

## Step 5 — Paste into Vercel

Go to your Vercel dashboard → `pressroom-ops-v2` project → **Settings** → **Environment Variables**. Add:

| Variable | Value | Apply to |
|---|---|---|
| `SHOPIFY_API_KEY` | Client ID from Step 4 | Production + Preview |
| `SHOPIFY_API_SECRET` | Client secret from Step 4 | Production + Preview |
| `SHOPIFY_OAUTH_SCOPES` *(optional)* | `read_orders,read_customers,read_products,read_fulfillments` | Production + Preview — only set if you want different from default |
| `SHOPIFY_OAUTH_REDIRECT_URL` *(optional)* | Only set if your domain is NOT `avivainternational.co` | Production + Preview |

After adding, click **Deployments** → top deployment → **⋯** → **Redeploy** (so the new env vars actually load).

## Step 6 — Connect your first client

In the Aviva admin dashboard:

1. Open **Clients** → pick the client (e.g. Balleti)
2. You'll see a new **"No Shopify store connected"** panel below the header
3. Enter their `.myshopify.com` URL (e.g. `balleti-store.myshopify.com`)
4. Click **Generate install link** → URL appears with copy + WhatsApp share buttons
5. Send the link to the client via WhatsApp / email
6. Client clicks → lands on Shopify's "Install Aviva" page → clicks **Install app** → ~30 seconds later their store is connected. The last 200 orders **and the full product catalog** (up to 1000 items) are auto-backfilled. The portal's Stores tab shows a "Your Store Products" grid once sync completes.

You can also have clients self-onboard via the `/portal` Connect Shopify button — same OAuth flow, they just kick it off themselves.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "SHOPIFY_API_KEY not set in Vercel env" | Step 5 not done, or redeploy missing |
| "We couldn't verify Shopify's signature" | `SHOPIFY_API_SECRET` in Vercel doesn't match the secret in Partners (typo, or you regenerated it) |
| Shopify shows "redirect_uri parameter is not valid" | The redirect URL in Partners doesn't match what we send. Check Step 2.5. |
| "Missing OAuth parameters" on callback | Install link expired (10 min lifetime) — generate a fresh one |
| Client clicks link, gets installed, but lands on a generic Shopify page instead of returning to portal | `SHOPIFY_OAUTH_REDIRECT_URL` env var has a typo, or doesn't match the Partners app |

---

## What this replaces

The legacy "Create a custom app in Shopify Admin → copy the shpat_ token" flow is still functional for existing connections (hashway, beautyst, forfksake all still use it). Don't migrate them — they work. Only use OAuth for **new** clients.

To migrate an existing client to OAuth later: send them the install link from their detail page. The callback overwrites the `shopify_access_token` column with the new OAuth-issued token. No data loss.
