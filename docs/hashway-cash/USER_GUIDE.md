# Hashway Cash Command Center — user guide

Open **/cash** and sign in. The coloured dot next to "10 AM update" tells you if yesterday's
numbers are in: green = done, yellow = partial, red = missing.

## The five rules this app follows

1. **Sales are not cash.** A ₹1,000 COD order becomes cash only when Delhivery remits it, minus
   RTOs and charges.
2. **Profit is not cash.** Profit that went into stock, unpaid invoices or supplier advances is
   not in the bank. The MIS page shows exactly where it went.
3. **Uncertain money is discounted.** Every expected receipt is *confirmed*, *probable* or
   *possible*; the forecast only counts part of the uncertain ones.
4. **Commitments always count.** POs, bills, salaries, rent, EMI and GST are counted in full.
5. **Nothing is changed silently.** Corrections need a reason and are kept in the audit log.
   Bank differences stay visible until explained.

## Every morning at 10 AM (5–10 minutes)

**10 AM update** → the date defaults to yesterday.

1. **Sales** — copy from Shopify: total sales, orders, prepaid, COD, discounts, cancellations,
   refunds, RTOs. (Not cash.)
2. **Cash collected** — only money that *landed* in a bank: Razorpay/PayU/Cashfree settlements,
   Delhivery COD remittance, marketplace payouts, B2B, other. Blank = nothing.
3. **Cash paid** — money that *left*: manufacturing, fabric, packaging, shipping, ads, salaries,
   rent, GST, EMI, software, suppliers, refunds, other. If a payment clears a PO installment or a
   bill, pick it in "settles" so the forecast stops expecting it.
4. **Bank balances** — closing balance of each account from the bank app. The app shows the
   expected closing (opening + in − out). If it doesn't match you'll see, for example:
   *"Bank balance does not reconcile. Expected ₹12L based on entered transactions. Please
   review."* Fix the entries or write a short explanation.
5. **New commitments** — any new PO, manufacturing commitment, supplier bill or big upcoming
   expense. Or tick "No new commitments".

**Review** shows Sales vs Cash collected and Expenses vs Cash paid side by side, then any
warnings (unusually large amounts, possible duplicates, opening balance not matching last
closing). Tick "I've reviewed these" and submit. Missed a day? Pick that date — late submissions
are allowed and marked late. Made a mistake? Finance can **Correct this day** (needs a reason).

## Reading the dashboard

- **Current cash** — what the banks say (rolled forward by entries since). If the ledger differs,
  it's shown in red.
- **Expected next 7 / 30 days** — confidence-weighted receipts, with payments beside them.
- **Lowest cash · 13 weeks** — the lowest week-end balance in the base case.
- **Minimum required** — higher of your reserve and the next 30 days of critical payments.
- **Surplus / gap** — now, and at the lowest point.
- **The answers** — plain answers to: cash now, in 13 weeks, when it runs out, locked in
  inventory, owed to suppliers, waiting to collect, production you can afford, what to change.

## Other pages

- **13-week forecast** — base / optimistic / worst. Click a week to see every receipt and
  payment. Edit assumptions (sales level, RTO %, collection delays, confidence weights, ad %,
  shipping %) and see the effect immediately. "Can commit today" = how much more production you
  could pay for now without breaking the reserve in any week.
- **Working capital** — inventory + receivables + supplier advances = cash locked; sliders show
  cash released by cutting stock, collecting faster, or getting more supplier credit. CCC trend.
- **Profit vs cash (MIS)** — monthly P&L and the bridge from profit to cash, line by line.
- **Receivables / Payables / Purchase orders** — record collections and payments, reschedule,
  write off (with reason), track installment schedules and supplier advances.
- **Inventory** — at cost; coverage days, slow and dead stock, top cash-consuming SKUs.
- **Ledger** — every transaction; click one to correct (with reason) or void; history shown.
- **Bank reconciliation** — import the statement, Auto-match, then deal with what's left: match
  by hand, post a bank line the books missed (e.g. bank charges), or ignore with a reason.
- **Imports** — CSV/Excel for bank, Shopify, Delhivery COD, gateways, marketplaces, suppliers,
  inventory, paid expenses, bills, B2B invoices. Map columns once (remembered). The same file
  can't be imported twice; duplicate rows are skipped and listed.
- **Reports** — daily, weekly, 13-week, working capital, supplier payables, receivables,
  inventory, forecast vs actual, monthly MIS, CCC — view, CSV, Excel or PDF.
- **Settings** — minimum reserve, accounts, recurring commitments, alert thresholds, suppliers,
  settlement fees/lags, categories, users & roles, demo data.

## Roles

| | Admin | Finance | Operations | Viewer |
|---|---|---|---|---|
| View everything | ✓ | ✓ | ✓ | ✓ |
| Daily update, POs, bills, stock, imports (non-bank) | ✓ | ✓ | ✓ | |
| Record payments/collections, corrections, voids, reopen days | ✓ | ✓ | | |
| Bank statements, reconciliation, settings, assumptions | ✓ | ✓ | | |
| Users, demo data | ✓ | | | |
