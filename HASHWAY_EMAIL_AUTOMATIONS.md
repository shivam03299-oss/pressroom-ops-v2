# Hashway Clothing — Shopify Email Automations Playbook

Store: cd042a-2.myshopify.com (hashway.in) · INR · Delhi-based streetwear
Built for: Shopify Admin → Messaging → Automations → Templates

**How to use:** Open each template in Shopify, paste the Subject + Preheader + Body in the email editor, set the Segment + Delay, save, send yourself a test, then activate.

**Global rules:**
- Send window: Mon–Sat, 10:00 – 21:00 IST (skip 1–6 AM)
- From name: `Hashway` · Reply-to: `support@hashway.in`
- Hero image: use the product image Shopify auto-injects; do NOT upload a custom banner unless updating seasonally
- Footer must include: physical address, unsubscribe, "You're getting this because you shopped/subscribed at hashway.in"
- Single CTA per email (don't dilute the click)
- Mobile preview every single one — 80%+ of opens will be phones
- Track UTM: `utm_source=shopify_email&utm_medium=automation&utm_campaign=<template_slug>`

---

## SECTION 1 — RECOVER SITE VISITORS (Pre-purchase)

### 1.1 Recover Abandoned Checkout
**When:** 10 hours after checkout abandonment, no purchase
**Segment:** Default (Shopify auto-handles "started checkout, did not complete")
**Discount:** 5% off code `COMEBACK5`, min ₹999, single-use per customer, 7-day expiry

**Subject (45 chars):** `{{first_name}}, your cart's still warm — 5% off inside`
**Preheader (80 chars):** `We saved your size and tucked a small discount in. Both expire — don't wait.`

**Email body:**
```
Hey {{first_name|default:'there'}},

You were *this* close.

We held your cart exactly the way you left it — same size, same fit. And because you got this far, here's 5% off to close the loop:

   ╔══════════════════════════╗
   ║   CODE: COMEBACK5         ║
   ║   Min ₹999 · 7 days       ║
   ╚══════════════════════════╝

Our drops move fast — and so do the sizes in your cart.
```

**CTA button:** `Resume checkout →`

**Below CTA (small):**
```
Free shipping on orders over ₹1,499 · COD available · Easy 7-day returns

Questions? Reply to this email — a real human will get back to you.
```

---

### 1.2 Convert Abandoned Product Browse
**When:** 24 hours after browsing a product, no add-to-cart
**Segment:** Default (viewed product, no cart action, opted-in to marketing)
**Discount:** 5% off code `COMEBACK5`, min ₹999, single-use per customer, 7-day expiry (same code reused across the recovery flow)

**Subject (40 chars):** `Still eyeing {{product.title}}? Here's 5% off.`
**Preheader (84 chars):** `A small nudge — and a small discount — to help you stop scrolling and start wearing.`

**Email body:**
```
You spent a minute on {{product.title}}. We noticed.

Here's the thing — the fit, the fabric, the way it sits — that's not something a product page does justice. Real people wear these every day in Delhi heat and Delhi nights.

If it's been on your mind, that's usually a sign. Here's 5% off to make the decision easier:

   ╔══════════════════════════╗
   ║   CODE: COMEBACK5         ║
   ║   Min ₹999 · 7 days       ║
   ╚══════════════════════════╝
```

**CTA button:** `Take another look →`

**Below CTA — Social proof block:**
```
★★★★★ "Fit is exactly what I wanted. Material feels premium for the price."
— Verified buyer

★★★★★ "Ordered M, fit me perfectly. Will buy again."
— Verified buyer
```

---

### 1.3 Recover Abandoned Cart
**When:** 6 hours after add-to-cart, no checkout started
**Segment:** Default (items in cart, no checkout, opted-in)
**Discount:** 5% off code `COMEBACK5`, min ₹999, single-use per customer, 7-day expiry

**Subject (44 chars):** `{{first_name}}, you left this in your cart 👀`
**Preheader (82 chars):** `Sizes go fast — especially this one. Code inside to seal the deal.`

**Email body:**
```
Hey {{first_name|default:'there'}},

You added something good to your cart and walked away. Happens.

We saved everything — your sizes, your picks. And to make coming back easier, here's 5% off:

   ╔══════════════════════════╗
   ║   CODE: COMEBACK5         ║
   ║   Min ₹999 · 7 days       ║
   ╚══════════════════════════╝

But we can't hold inventory forever — {{cart.item_count}} item(s) sitting in your cart aren't sitting in anyone else's. Takes 30 seconds.
```

**CTA button:** `Go to checkout →`

**Below CTA:**
```
COD available · Free shipping over ₹1,499 · Ships from Delhi in 24 hours

Need a different size? Reply to this email and we'll sort it.
```

> **Note:** Same `COMEBACK5` code is reused across all three recovery emails (1.1, 1.2, 1.3) so a customer who triggers multiple flows isn't getting conflicting codes. Single-use-per-customer ensures they can only redeem once regardless of how many recovery emails they see.

---

## SECTION 2 — WELCOME NEW SUBSCRIBERS

### 2.1 Welcome New Subscribers — Discount Email (single-send)
**When:** Immediately on subscribe (within 5 min)
**Segment:** New marketing subscribers (form/popup)
**Discount:** 10% off code `WELCOME10`, valid 30 days, min order ₹999, one-time use per customer
**Setup before activating:** Create the code in Discounts → Discount codes → fixed 10%, single-use per customer, min ₹999, 30-day expiry

**Subject (37 chars):** `Welcome to Hashway. Here's 10% off.`
**Preheader (74 chars):** `Your code is below. No catches. Just street-ready fits, straight from Delhi.`

**Email body:**
```
Welcome in.

You signed up, so here's the deal — 10% off your first order, on us.

   ╔══════════════════════════╗
   ║   CODE: WELCOME10         ║
   ║   Valid 30 days · Min ₹999 ║
   ╚══════════════════════════╝

What Hashway is about:
→ Heavyweight cotton, oversized fits
→ Designed and shipped from Delhi
→ Small drops, no overstock, no clearance bins
→ COD across India · Free shipping over ₹1,499

Start with what's new ↓
```

**CTA button:** `Shop the new drop →`

---

### 2.2 Welcome New Subscribers — Discount Series (3 emails)
**When:** Email 1 immediately, Email 2 at Day 2, Email 3 at Day 5
**Segment:** New marketing subscribers (form/popup), excludes anyone who placed an order in between
**Discount:** Same `WELCOME10` code, referenced across all three

**EMAIL 1 of 3 — Immediate (The Welcome)**

Subject: `Welcome to Hashway. Here's 10% off.`
Preheader: `Your code is inside. Plus a quick tour of who we are.`

```
Welcome in.

You signed up, so here's 10% off your first order — code WELCOME10, min ₹999, good for 30 days.

We're Hashway — a small streetwear label out of Delhi making heavyweight tees, oversized fits, and pieces that don't fall apart after three washes.

Small drops. No clearance bins. Designed and shipped from our own studio in 110089.

Take a look around ↓
```

CTA: `Browse the latest →`

---

**EMAIL 2 of 3 — Day 2 (The Bestsellers)**

Subject: `The fits people keep coming back for`
Preheader: `Three pieces. Hundreds of repeat orders. Code WELCOME10 still valid.`

```
Hey {{first_name|default:'there'}},

If you're not sure where to start, start here. These are the three pieces our customers buy, then buy again in another color.

→ Heavyweight Oversized Tee — the one that started it all
→ Boxy Fit Hoodie — winter wardrobe staple
→ Cargo Pants — the ones that actually fit

Your 10% code is still good: WELCOME10 (min ₹999)
```

CTA: `Shop bestsellers →`

---

**EMAIL 3 of 3 — Day 5 (Last Call)**

Subject: `Your 10% off expires in {{days_until_expiry}} days`
Preheader: `One last reminder — and then it's gone.`

```
Quick reminder: your welcome discount is about to expire.

   ╔══════════════════════════╗
   ║   CODE: WELCOME10         ║
   ║   Min ₹999 · Ends soon    ║
   ╚══════════════════════════╝

We get it — life's busy. But if there's a fit you've been eyeing, this is the cleanest time to grab it.

Free shipping over ₹1,499 · COD available · Ships from Delhi in 24 hours.
```

CTA: `Use my code →`

---

## SECTION 3 — POST-PURCHASE

### 3.1 Thank Customers After They Purchase (2-email flow)
**When:** Email 1 at 1 day after order paid · Email 2 at 2nd order
**Segment:** Customers with 1 order (Email 1) and customers with 2 orders (Email 2)
**Discount:** None — these are relationship, not revenue, emails

**EMAIL 1 — 1 day after first paid order**

Subject: `{{first_name}}, you're officially in.`
Preheader: `A quick thank-you from the Hashway team — and what happens next.`

```
Hey {{first_name|default:'there'}},

Your first Hashway order is on the way — thank you. Genuinely.

We're a small team. Every order matters, and we noticed yours.

Here's what happens next:
→ Packed and shipped from our Delhi studio within 24h
→ You'll get a tracking link the moment it leaves
→ Delivery in 2–5 days across India (Delhi-NCR usually next-day)

A quick favour — once it lands, we'd love a photo. Tag @hashway.in on Instagram and we'll repost the best ones.

If anything's not perfect when it arrives, just reply to this email. We'll make it right.

— Team Hashway
```

CTA: `Track my order →`

---

**EMAIL 2 — 2nd order placed (different copy, deeper relationship)**

Subject: `Twice in a row. That means something.`
Preheader: `A real thank-you for coming back. No discount inside — just respect.`

```
{{first_name|default:'There'}}.

You came back. That's not a small thing.

A second order says the fit was right, the fabric held up, and we didn't waste your money. That's the only review that matters to us.

We're working on the next drop right now. As a 2x customer, you'll see it before it goes public — keep an eye on your inbox.

— Team Hashway
```

CTA: `See what's coming next →`

---

### 3.2 Upsell Customers After Their First Purchase
**When:** 14 days after first order paid
**Segment:** Customers with exactly 1 completed order, order paid 14+ days ago
**Discount:** 10% off code `LOYAL10`, min ₹1,499, single-use per customer, 14-day expiry
**Setup:** Create LOYAL10 in Discounts before activating

**Subject (42 chars):** `Loved the first one? Try these next.`
**Preheader (76 chars):** `A small thank-you discount + the three pieces that pair with your last order.`

**Email body:**
```
Hey {{first_name|default:'there'}},

Hope the {{last_order.line_item.title|default:'order'}} is treating you well.

If you're back for round two, here's 10% off to make it easier:

   ╔══════════════════════════╗
   ║   CODE: LOYAL10           ║
   ║   Min ₹1,499 · 14 days    ║
   ╚══════════════════════════╝

These three pair beautifully with what you already own:

→ [Featured product 1 — pick one that complements common first orders]
→ [Featured product 2]
→ [Featured product 3]
```

CTA: `Use my code →`

> **Manual step:** Each quarter, swap the three featured products to match seasonal stock. Use Shopify's product picker block instead of plain text.

---

### 3.3 Win Back Customers (Lapsed)
**When:** Customer hasn't ordered in 60 days
**Segment:** Required — create one called `Winback - 60 day lapsed`:
```
customers_with_orders >= 1
AND last_order_date < 60_days_ago
AND email_subscription_status = SUBSCRIBED
```
**Discount:** 15% off code `MISSEDYOU15`, min ₹1,499, 14-day expiry, single-use per customer
**Setup:** Create segment + discount code before activating

**Subject (38 chars):** `{{first_name}}, we miss you. Plain and simple.`
**Preheader (72 chars):** `It's been a while. Here's 15% off to make coming back worth your while.`

**Email body:**
```
Hey {{first_name|default:'there'}},

It's been a minute since your last order — and honestly, we noticed.

We've dropped new fits, new colorways, and a couple of pieces we genuinely think you'd love. So here's 15% off to make the trip back worth it:

   ╔══════════════════════════╗
   ║   CODE: MISSEDYOU15       ║
   ║   Min ₹1,499 · 14 days    ║
   ╚══════════════════════════╝

No pressure. Just an open door.

— Team Hashway
```

CTA: `See what's new →`

---

### 3.4 Drive Online Customers to Nearby Retail Locations
**Status:** SKIP — Hashway is online-only (no physical retail per current setup)

If you ever open a Delhi studio/store, activate this with:
- Trigger: First online order paid, customer address within 25km of pickup pin 110089
- Body: invite to visit the studio, try fits in person, exclusive in-store drops
- Don't bother until you have a real address to send people to

---

## SECTION 4 — CUSTOMER APPRECIATION

### 4.1 Celebrate Customer Birthday
**When:** On customer's birthday at 9:00 AM IST
**Segment:** Required — create `Birthday - has DOB`:
```
customer_birthday IS NOT NULL
AND email_subscription_status = SUBSCRIBED
```
**Discount:** 15% off code `HBD15`, min ₹999, valid 7 days, single-use per customer
**Setup:** You need to be collecting birthdays. Options:
  - Add a "Birthday" field to your account-creation form (Online Store → Customer accounts)
  - Send a one-time campaign asking opted-in customers to share DOB for a birthday gift

**Subject (32 chars):** `Happy birthday, {{first_name}} 🎂`
**Preheader (76 chars):** `From the entire Hashway team — here's a little something to make the day yours.`

**Email body:**
```
Happy birthday, {{first_name|default:'there'}}.

We hope today's mostly cake, mostly chill, and mostly people you actually like.

Since it's your day, here's something on us — 15% off, valid for the next 7 days:

   ╔══════════════════════════╗
   ║   CODE: HBD15             ║
   ║   Min ₹999 · 7 days       ║
   ╚══════════════════════════╝

Pick something good for yourself. You've earned it.

— Team Hashway
```

CTA: `Treat yourself →`

---

### 4.2 Welcome VIP Customers
**When:** Triggered when customer enters the VIP segment
**Segment:** Required — create `VIP Customers`:
```
total_spent >= 5000
OR orders_count >= 3
AND email_subscription_status = SUBSCRIBED
```
> Tune the thresholds based on your AOV. ₹5,000 lifetime or 3 orders is a reasonable starting cut for a streetwear brand at Hashway's price point.

**Discount:** 15% off code `VIP15` (permanent, single-use per VIP), min ₹1,499 — plus the perks framing below

**Subject (35 chars):** `You just became a Hashway VIP.`
**Preheader (78 chars):** `Early access to drops, 15% off forever, and a few other things you'll like.`

**Email body:**
```
Hey {{first_name|default:'there'}},

You crossed the line — you're officially a Hashway VIP.

Here's what that gets you, starting today:

→ **Early access** to every new drop, 48 hours before it goes public
→ **15% off** — code VIP15, use it whenever, min ₹1,499
→ **Priority replies** when you message us — your emails skip the queue
→ **First dibs** on collab pieces and limited runs we never restock

   ╔══════════════════════════╗
   ║   CODE: VIP15             ║
   ║   Min ₹1,499 · Yours      ║
   ╚══════════════════════════╝

Thank you for trusting us with your wardrobe. We don't take it lightly.

— Team Hashway
```

CTA: `Shop early access →`

> **Manual step:** When you drop a new collection, send VIP segment a 48-hour-early manual campaign with a private link or password-protected page. This automation onboards them; the ongoing relationship needs a recurring habit.

---

## CONFIGURATION CHECKLIST — DO THIS BEFORE ACTIVATING ANY OF IT

**Discount codes to create (Discounts → Discount codes):**
- [ ] `WELCOME10` — 10% off, min ₹999, single-use per customer, 30-day expiry from generation (or no expiry if Shopify Email handles it)
- [ ] `COMEBACK5` — 5% off, min ₹999, single-use per customer, 7-day expiry — shared across all three recovery flows (1.1 Checkout, 1.2 Browse, 1.3 Cart)
- [ ] `LOYAL10` — 10% off, min ₹1,499, single-use per customer, 14-day expiry
- [ ] `MISSEDYOU15` — 15% off, min ₹1,499, single-use, 14-day expiry
- [ ] `HBD15` — 15% off, min ₹999, single-use, 7-day expiry
- [ ] `VIP15` — 15% off, min ₹1,499, single-use per VIP (regenerate annually)

**Segments to create (Customers → Segments):**
- [ ] `Winback - 60 day lapsed`
- [ ] `Birthday - has DOB`
- [ ] `VIP Customers`

**Sender setup (Settings → Notifications):**
- [ ] From name: `Hashway`
- [ ] Reply-to: `support@hashway.in` (verify it's actually monitored)
- [ ] SPF/DKIM verified for hashway.in (Shopify will warn if not)

**Per-email pre-flight (every single template):**
- [ ] Subject + preheader pasted
- [ ] Body pasted with merge tags rendering correctly in preview
- [ ] Mobile preview looks right
- [ ] CTA button links to correct URL with UTM params
- [ ] Sent yourself a test email
- [ ] Send window set to Mon–Sat, 10:00–21:00 IST
- [ ] **Activated** (this is the step that goes live to customers — do it last, deliberately)

**Order to activate in (lowest risk → highest):**
1. Thank You (1 day after first order) — non-promotional, hard to misfire
2. Welcome Email — single touch, easy to test
3. Abandoned Checkout — high ROI, no discount
4. Abandoned Cart — high ROI, no discount
5. Abandoned Browse
6. Welcome Series (3 emails)
7. Upsell after first purchase
8. VIP Welcome
9. Birthday
10. Win Back

**Audit cadence:** Open this file every quarter. Refresh featured products in the Upsell email, retire codes that have leaked, re-segment VIP thresholds against your current AOV.
