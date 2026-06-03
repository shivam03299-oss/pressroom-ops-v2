// One-click invoice download for a wallet recharge. Shared between
// the admin Clients → Wallet table (App.jsx) and the client portal
// Wallet page (Portal.jsx) so a brand can pull the same PDF the admin
// would. Self-contained on purpose — no React/UI imports — so either
// bundle can pull just this file without dragging the whole admin
// surface area along.
//
// Usage:
//   import { downloadRechargeInvoice } from "./walletInvoice.js";
//   await downloadRechargeInvoice({ recharge, tenant });
//
// `recharge` = a row from public.client_recharges (id, amount, status,
//              payment_method, cashfree_link_id, cashfree_payment_id,
//              paid_at, note, created_at).
// `tenant`   = { id, name, slug } from public.tenants.

// ── Seller (Aviva) — single source of truth for the invoice header.
// Mirrors BUSINESS in App.jsx; duplicated here intentionally so this
// module stays bundle-independent. Update both if Aviva's GSTIN moves.
const SELLER = {
  tradeName: "AVIVA INTERNATIONAL",
  legalName: "Shivam Gupta",
  gstin: "07DVSPG2365C2ZI",
  stateCode: "07",
  stateName: "Delhi",
  addressLines: [
    "Floor 2, A-57, Badli Ext near Laxmi Dharma,",
    "Badli Extension, New Delhi,",
    "North West Delhi, Delhi – 110042",
  ],
  bank: {
    name: "YES Bank",
    accountName: "AVIVA INTERNATIONAL",
    accountNumber: "038861900006420",
    ifsc: "YESB0000388",
    type: "Current",
  },
};

// ── Per-client billing profiles (legal name + GSTIN + state for the
// "Bill To" half of the invoice). Keyed by tenant.name. If a tenant
// isn't in here, we fall back to their display name with no GSTIN —
// still a valid receipt but won't pass an ITC claim.
const CLIENT_PRESETS = {
  "Balleti": {
    legalName: "MD TARIQ KHAN",
    tradeName: "IZZY INFRASTRUCTURE",
    gstin: "23KOPPK5855A1ZQ",
    address: "Ward No 01, Burhar Amarkantak Road, near Yogendra Medical Store, Dhanpuri Nargada Hari Dafai, Shahdol, Madhya Pradesh – 484114",
    stateCode: "23", stateName: "Madhya Pradesh",
    gstRate: 5,
    sacCode: "998821", // textile job-work — matches Aviva's existing Balleti invoices
  },
  "Culture Circle": {
    legalName: "METACIRCLES TECHNOLOGIES PRIVATE LIMITED",
    gstin: "06AARCM2647M1ZV",
    address: "Ground Floor, K16/24, DLF Phase 2, DLF City Phase 2, Gurugram, Haryana – 122002",
    stateCode: "06", stateName: "Haryana",
    gstRate: 18,
    sacCode: "998912", // printing services
  },
};

// Default split: most clients pay 18% GST inclusive on top-ups. Balleti
// is the textile-job-work exception (5%).
const DEFAULT_GST_RATE = 18;
const DEFAULT_SAC = "998912";

// Tiny formatter — keeps the PDF locale-consistent with the rest of
// the dashboard regardless of the browser's default.
const inr = (n) =>
  "₹" + (Math.round(Number(n) * 100) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])
  );

// Fiscal-year-aware invoice number derived from the recharge id, so
// re-downloading the PDF gives the same number every time. Format:
//   AI/YYYY-YY/<short-id>
// where short-id is the first 6 chars of the recharge UUID. Not a
// running sequence — but every recharge has its own stable, unique
// identifier and Tally accepts arbitrary alphanumerics in the invoice
// number column.
function invoiceNumberFor(recharge) {
  const issue = new Date(recharge.paid_at || recharge.created_at || Date.now());
  const m = issue.getMonth();
  const y = issue.getFullYear();
  const fyStart = m >= 3 ? y : y - 1;
  const fyEnd = fyStart + 1;
  const fy = `${fyStart}-${String(fyEnd).slice(-2)}`;
  const shortId = String(recharge.id || "").replace(/-/g, "").slice(0, 6).toUpperCase()
    || String(Date.now()).slice(-6);
  return `AI/${fy}/WL${shortId}`;
}

// Indian numbering → words (₹ amount → "Rupees Two Thousand Two
// Hundred Eighty Nine Only"). Compact implementation — covers up to
// 99 crore, which is far past any single recharge we'd ever see.
function numberToWordsINR(amount) {
  const n = Math.round(Number(amount) * 100);
  const rupees = Math.floor(n / 100);
  const paise = n % 100;
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const sub100 = (x) => x < 20 ? ones[x] : tens[Math.floor(x/10)] + (x % 10 ? " " + ones[x % 10] : "");
  const sub1000 = (x) => x >= 100 ? ones[Math.floor(x/100)] + " Hundred" + (x % 100 ? " " + sub100(x % 100) : "") : sub100(x);
  const parts = [];
  const cr = Math.floor(rupees / 10000000);
  const lk = Math.floor((rupees % 10000000) / 100000);
  const th = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  if (cr) parts.push(sub100(cr) + " Crore");
  if (lk) parts.push(sub100(lk) + " Lakh");
  if (th) parts.push(sub100(th) + " Thousand");
  if (rest) parts.push(sub1000(rest));
  let words = "Rupees " + (parts.join(" ") || "Zero");
  if (paise) words += " and " + sub100(paise) + " Paise";
  return words + " Only";
}

// ─────────────────────────────────────────────────────────────────
// HTML template — mirrors the existing renderInvoiceHTML in App.jsx
// visually so admin/finance can recognise the layout. Single page,
// A4, no JS dependencies.
// ─────────────────────────────────────────────────────────────────
function renderHTML({ recharge, tenant, client, gross, gstRate, gstAmount, base, intraState, invoiceNumber, issueDate }) {
  const billToName = client.legalName || client.name || tenant.name;
  const billToBrand = client.legalName && tenant.name && tenant.name !== client.legalName ? tenant.name : "";
  const cgst = intraState ? Math.round(gstAmount / 2 * 100) / 100 : 0;
  const sgst = intraState ? gstAmount - cgst                     : 0;
  const igst = intraState ? 0                                    : gstAmount;
  const taxRows = intraState
    ? `<tr><td>CGST @ ${gstRate / 2}%</td><td class="right">${inr(cgst)}</td></tr>
       <tr><td>SGST @ ${gstRate / 2}%</td><td class="right">${inr(sgst)}</td></tr>`
    : `<tr><td>IGST @ ${gstRate}%</td><td class="right">${inr(igst)}</td></tr>`;
  const stateLabel = client.stateCode ? `${client.stateCode} — ${client.stateName || ""}` : "—";
  const paymentRef = recharge.cashfree_payment_id || recharge.cashfree_link_id || recharge.id;
  const sacCode = client.sacCode || DEFAULT_SAC;

  return `
<div class="inv-sheet" style="max-width:800px;margin:0 auto;background:#fff;padding:36px 40px 28px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#111;font-size:12px;line-height:1.45;">
  <style>
    .inv-sheet * { box-sizing: border-box; }
    .inv-sheet .title-bar { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:14px; margin-bottom:18px; }
    .inv-sheet .brand-name { font-size:24px; font-weight:800; letter-spacing:0.02em; }
    .inv-sheet .brand-addr { font-size:11px; color:#555; margin-top:8px; max-width:300px; line-height:1.4; }
    .inv-sheet .brand-gst { font-size:11px; margin-top:6px; font-weight:600; }
    .inv-sheet .doc-type { font-size:22px; font-weight:800; letter-spacing:0.04em; border:2px solid #111; padding:6px 14px; display:inline-block; }
    .inv-sheet .doc-orig { font-size:9px; letter-spacing:0.25em; color:#555; margin-top:6px; }
    .inv-sheet .meta-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; border:1px solid #d9d9d9; margin-bottom:16px; }
    .inv-sheet .meta-cell { padding:8px 12px; border-right:1px solid #d9d9d9; }
    .inv-sheet .meta-cell:last-child { border-right:none; }
    .inv-sheet .meta-label { font-size:9px; text-transform:uppercase; color:#555; letter-spacing:0.12em; }
    .inv-sheet .meta-value { font-size:13px; font-weight:600; margin-top:2px; }
    .inv-sheet .parties { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
    .inv-sheet .party { border:1px solid #d9d9d9; padding:10px 12px; }
    .inv-sheet .party-head { font-size:9px; letter-spacing:0.15em; color:#555; text-transform:uppercase; margin-bottom:4px; }
    .inv-sheet .party-name { font-size:13px; font-weight:700; }
    .inv-sheet .party-sub { font-size:11px; color:#555; margin-top:2px; }
    .inv-sheet .party-meta { font-size:11px; margin-top:6px; }
    .inv-sheet .party-meta span { color:#555; }
    .inv-sheet table.items { width:100%; border-collapse:collapse; font-size:11px; margin-bottom:12px; }
    .inv-sheet table.items thead th { background:#0d0e0f; color:#fff; text-align:left; padding:9px 8px; font-size:9px; letter-spacing:0.12em; text-transform:uppercase; font-weight:700; }
    .inv-sheet table.items thead th.right { text-align:right; }
    .inv-sheet table.items tbody td { padding:9px 8px; border-bottom:1px solid #d9d9d9; vertical-align:top; }
    .inv-sheet table.items tbody td.right { text-align:right; font-variant-numeric:tabular-nums; }
    .inv-sheet table.items .desc { font-weight:500; }
    .inv-sheet .totals-wrap { display:grid; grid-template-columns:1.25fr 1fr; gap:16px; margin-bottom:16px; }
    .inv-sheet .amt-words { border:1px solid #d9d9d9; padding:10px 12px; }
    .inv-sheet .amt-words-label { font-size:9px; letter-spacing:0.15em; color:#555; text-transform:uppercase; }
    .inv-sheet .amt-words-val { font-size:12px; margin-top:3px; font-weight:600; line-height:1.45; }
    .inv-sheet table.totals { width:100%; border-collapse:collapse; font-size:12px; }
    .inv-sheet table.totals td { padding:6px 10px; border-bottom:1px solid #d9d9d9; }
    .inv-sheet table.totals td.right { text-align:right; font-variant-numeric:tabular-nums; }
    .inv-sheet table.totals tr.grand td { background:#0d0e0f; color:#fff; font-weight:700; font-size:14px; letter-spacing:0.02em; border:none; }
    .inv-sheet .foot { display:grid; grid-template-columns:1.3fr 1fr; gap:16px; margin-top:10px; }
    .inv-sheet .bank { border:1px solid #d9d9d9; padding:10px 12px; font-size:11px; }
    .inv-sheet .bank-head { font-size:9px; letter-spacing:0.15em; text-transform:uppercase; color:#555; margin-bottom:6px; }
    .inv-sheet .bank-row { display:flex; justify-content:space-between; padding:2px 0; }
    .inv-sheet .bank-row span:first-child { color:#555; }
    .inv-sheet .sign { border:1px solid #d9d9d9; padding:10px 12px; text-align:right; display:flex; flex-direction:column; justify-content:space-between; min-height:110px; }
    .inv-sheet .sign-for { font-size:10px; color:#555; text-transform:uppercase; letter-spacing:0.12em; }
    .inv-sheet .sign-name { font-size:12px; font-weight:700; }
    .inv-sheet .sign-line { border-top:1px solid #111; padding-top:4px; font-size:10px; color:#555; }
    .inv-sheet .terms { margin-top:14px; padding-top:10px; border-top:1px dashed #d9d9d9; font-size:10px; color:#555; line-height:1.5; }
  </style>

  <div class="title-bar">
    <div>
      <div class="brand-name">${esc(SELLER.tradeName)}</div>
      <div class="brand-addr">${SELLER.addressLines.map(esc).join("<br/>")}</div>
      <div class="brand-gst">GSTIN: ${esc(SELLER.gstin)} &nbsp;·&nbsp; State: ${esc(SELLER.stateCode)} — ${esc(SELLER.stateName)}</div>
    </div>
    <div style="text-align:right;">
      <div class="doc-type">TAX INVOICE</div>
      <div class="doc-orig">ORIGINAL FOR RECIPIENT</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-cell"><div class="meta-label">Invoice #</div><div class="meta-value">${esc(invoiceNumber)}</div></div>
    <div class="meta-cell"><div class="meta-label">Issue Date</div><div class="meta-value">${esc(issueDate)}</div></div>
    <div class="meta-cell"><div class="meta-label">Place of Supply</div><div class="meta-value">${esc(stateLabel)}</div></div>
    <div class="meta-cell"><div class="meta-label">Payment Ref</div><div class="meta-value" style="font-family:ui-monospace,monospace;font-size:11px;">${esc(paymentRef)}</div></div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-head">Bill To</div>
      <div class="party-name">${esc(billToName)}</div>
      ${billToBrand ? `<div class="party-sub"><em>brand: ${esc(billToBrand)}</em></div>` : ""}
      ${client.address ? `<div class="party-sub">${esc(client.address)}</div>` : ""}
      <div class="party-meta">
        ${client.gstin ? `<div><span>GSTIN:</span> ${esc(client.gstin)}</div>` : ""}
        <div><span>State:</span> ${esc(stateLabel)}</div>
      </div>
    </div>
    <div class="party">
      <div class="party-head">Seller</div>
      <div class="party-name">${esc(SELLER.tradeName)}</div>
      <div class="party-sub">${SELLER.addressLines.map(esc).join("<br/>")}</div>
      <div class="party-meta">
        <div><span>GSTIN:</span> ${esc(SELLER.gstin)}</div>
        <div><span>State:</span> ${esc(SELLER.stateCode)} — ${esc(SELLER.stateName)}</div>
      </div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>#</th>
        <th>Particulars</th>
        <th>SAC</th>
        <th class="right">Qty</th>
        <th class="right">Rate</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td class="desc">Wallet credit — production services prepayment${recharge.payment_method ? ` (via ${esc(recharge.payment_method)})` : ""}</td>
        <td style="font-family:ui-monospace,monospace;font-size:10px;">${esc(sacCode)}</td>
        <td class="right">1</td>
        <td class="right">${inr(base)}</td>
        <td class="right" style="font-weight:600;">${inr(base)}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals-wrap">
    <div class="amt-words">
      <div class="amt-words-label">Amount in Words</div>
      <div class="amt-words-val">${esc(numberToWordsINR(gross))}</div>
    </div>
    <table class="totals">
      <tr><td>Sub-total</td><td class="right">${inr(base)}</td></tr>
      ${taxRows}
      <tr class="grand"><td>Total</td><td class="right">${inr(gross)}</td></tr>
    </table>
  </div>

  <div class="foot">
    <div class="bank">
      <div class="bank-head">Bank Details</div>
      <div class="bank-row"><span>Account name</span><span>${esc(SELLER.bank.accountName)}</span></div>
      <div class="bank-row"><span>Account no.</span><span style="font-family:ui-monospace,monospace;">${esc(SELLER.bank.accountNumber)}</span></div>
      <div class="bank-row"><span>IFSC</span><span style="font-family:ui-monospace,monospace;">${esc(SELLER.bank.ifsc)}</span></div>
      <div class="bank-row"><span>Bank</span><span>${esc(SELLER.bank.name)} (${esc(SELLER.bank.type)})</span></div>
    </div>
    <div class="sign">
      <div>
        <div class="sign-for">For ${esc(SELLER.tradeName)}</div>
        <div class="sign-name">${esc(SELLER.legalName)}</div>
      </div>
      <div class="sign-line">Authorised Signatory</div>
    </div>
  </div>

  <div class="terms">
    <b>Note:</b> This is a tax invoice for a wallet top-up against
    production services already rendered or to be rendered. The
    underlying job-work / printing services are billed against this
    credit balance. Payment received via ${esc(recharge.payment_method || "online channel")}.
    This is a computer-generated invoice and does not require a physical signature.
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────────
// Public entry point: build the invoice for a single recharge row
// and trigger a browser download. Returns the invoice number used.
// ─────────────────────────────────────────────────────────────────
export async function downloadRechargeInvoice({ recharge, tenant }) {
  if (!recharge || !tenant) throw new Error("recharge + tenant required");
  if (recharge.status && recharge.status !== "paid") {
    throw new Error("Invoice is only available after the recharge is marked paid.");
  }
  const gross = Number(recharge.amount) || 0;
  if (gross <= 0) throw new Error("Invalid recharge amount");

  // Resolution order for billing identity, most-specific first:
  //   1. Fields stored on the tenants row (captured at signup)
  //   2. CLIENT_PRESETS[tenant.name] (hand-curated, used pre-signup-fields)
  //   3. Bare-minimum fallback derived from tenant.name
  // This lets new clients self-onboard their GST details, and keeps
  // existing Balleti / Culture Circle invoices working from presets.
  const preset = CLIENT_PRESETS[tenant.name] || {};
  const client = {
    name:      tenant.name,
    legalName: tenant.bill_to_legal_name || preset.legalName || tenant.name,
    address:   tenant.bill_to_address    || preset.address   || "",
    gstin:     tenant.bill_to_gstin      || preset.gstin     || "",
    stateCode: tenant.bill_to_state_code || preset.stateCode || "",
    stateName: tenant.bill_to_state_name || preset.stateName || "",
    sacCode:   preset.sacCode,
  };
  const gstRate = Number(
    tenant.bill_to_gst_rate ?? preset.gstRate ?? DEFAULT_GST_RATE
  );
  // Recharge amount is GST-inclusive (matches the existing
  // "Wallet top-up (incl X% GST)" pattern). Back-solve base + gst:
  //   gross = base × (1 + gstRate/100)
  //   base  = gross / (1 + gstRate/100)
  const base = Math.round((gross / (1 + gstRate / 100)) * 100) / 100;
  const gstAmount = Math.round((gross - base) * 100) / 100;

  // Intra-state when supplier state = recipient state (both Delhi / 07
  // would be intra). Aviva is in Delhi (07), so any client outside Delhi
  // (Balleti = 23 MP, Culture Circle = 06 HR, etc.) is IGST.
  const intraState = !!client.stateCode && client.stateCode === SELLER.stateCode;

  const issueDateObj = new Date(recharge.paid_at || recharge.created_at || Date.now());
  const issueDate = issueDateObj.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const invoiceNumber = invoiceNumberFor(recharge);

  const html = renderHTML({
    recharge, tenant, client,
    gross, gstRate, gstAmount, base,
    intraState, invoiceNumber, issueDate,
  });

  // Render off-screen + ask html2pdf to convert. The library handles
  // page breaks + image scaling for A4. We restore the DOM in finally
  // so a thrown render doesn't leave the offscreen node behind.
  const html2pdf = (await import("html2pdf.js")).default;
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "-99999px";
  container.style.left = "0";
  container.style.width = "800px";
  container.style.background = "#fff";
  container.innerHTML = html;
  document.body.appendChild(container);

  const filename = `${invoiceNumber.replace(/\//g, "-")}_${tenant.slug || tenant.name || "recharge"}.pdf`;
  try {
    await html2pdf().set({
      margin: [8, 8, 10, 8],
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    }).from(container.firstElementChild).save();
  } finally {
    document.body.removeChild(container);
  }
  return invoiceNumber;
}
