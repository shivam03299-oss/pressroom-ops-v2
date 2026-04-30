import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, Users, Printer, ClipboardList, Warehouse, TrendingUp,
  LogIn, LogOut, Plus, Trash2, Edit3, Check, X, AlertTriangle, Package,
  Clock, IndianRupee, ArrowUpRight, ArrowDownRight, Search, Shirt,
  Calendar, ChevronRight, Activity, MapPin, Wallet, Truck, BarChart3,
  Lock, Loader2, Sun, Moon, RefreshCw, ExternalLink, MapPinned, ChevronDown
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from "recharts";
import { supabase, fetchAll, insertRow, updateRow, deleteRow, subscribe, signIn, signOut, getSession, getProfile, fetchTenant, fetchShopifyOrders, syncShopifyOrders, updatePodStatus } from "./supabase.js";

// Storage layer moved to supabase.js

// ═══════════════════════════════════════════════════════════════════
// SEED DATA — used only on first load (when storage is empty)
// ═══════════════════════════════════════════════════════════════════
const EMPTY_DATA = {
  workers: [],
  attendance: [],
  production: [],
  orders: [],
  dispatches: [],
  warehouse: [],
  expenses: [],
  revenue: [],
  founderDraws: [],
  invoices: [],
  settings: { warehouseLat: null, warehouseLng: null, warehouseLabel: "", geofenceRadius: 100, geofenceEnabled: false, founder1Name: "Founder 1", founder2Name: "Founder 2", founder1Share: 50, founder2Share: 50 },
};

const EXPENSE_CATEGORIES = ["Salaries", "DTF Supplies", "Electricity", "Rent", "Packaging", "Courier", "Misc"];
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const CLIENTS = ["Hashway", "Culture Circle"];
const today = () => new Date().toISOString().slice(0, 10);

// ═══════════════════════════════════════════════════════════════════
// INVOICING — business details (from GST certificate) + helpers
// ═══════════════════════════════════════════════════════════════════
const BUSINESS = {
  tradeName: "AVIVA INTERNATIONAL",
  legalName: "Shivam Gupta",
  constitution: "Proprietorship",
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
  terms: "Payment due within 15 days from invoice date. Goods/services once sold will not be taken back. In case of any dispute, jurisdiction of courts shall be Delhi only. Interest @ 18% p.a. will be charged on overdue invoices. This is a computer-generated invoice and does not require a physical signature.",
};

// Indian states + UT codes (ordered: home state first)
const INDIAN_STATES = [
  { code: "07", name: "Delhi" },
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];
const STATE_BY_CODE = Object.fromEntries(INDIAN_STATES.map(s => [s.code, s.name]));

// Saved client billing profiles — quick-fill for recurring buyers.
// Key is the brand/display name shown in the dashboard; value is what goes on the invoice.
const CLIENT_PRESETS = {
  "Culture Circle": {
    legalName: "METACIRCLES TECHNOLOGIES PRIVATE LIMITED",
    gstin: "06AARCM2647M1ZV",
    address: "Ground Floor, K16/24, DLF Phase 2, DLF City Phase 2, Gurugram, Haryana – 122002",
    stateCode: "06", // Haryana
  },
};

// Fiscal-year-aware invoice-number sequencer: AI/YYYY-YY/NNNN
function nextInvoiceNumber(existingInvoices, issueDate) {
  const d = new Date(issueDate + "T00:00:00");
  const m = d.getMonth(); // 0-11
  const y = d.getFullYear();
  const fyStart = m >= 3 ? y : y - 1;
  const fyEnd = fyStart + 1;
  const fy = `${fyStart}-${String(fyEnd).slice(-2)}`;
  const prefix = `AI/${fy}/`;
  let maxSeq = 0;
  for (const inv of existingInvoices) {
    const n = inv.invoiceNumber || "";
    if (n.startsWith(prefix)) {
      const seq = parseInt(n.slice(prefix.length), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return prefix + String(maxSeq + 1).padStart(4, "0");
}

// Convert a number (paise-precision) to Indian currency words
function numberToWordsINR(num) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const twoDigit = (n) => n < 20 ? ones[n] : tens[Math.floor(n/10)] + (n%10 ? " " + ones[n%10] : "");
  const threeDigit = (n) => {
    const h = Math.floor(n/100);
    const r = n % 100;
    return (h ? ones[h] + " Hundred" + (r ? " " : "") : "") + (r ? twoDigit(r) : "");
  };
  const whole = Math.floor(num);
  const paise = Math.round((num - whole) * 100);
  if (whole === 0 && paise === 0) return "Zero";
  let n = whole, parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const rest = n;
  if (crore) parts.push(threeDigit(crore) + " Crore");
  if (lakh) parts.push(threeDigit(lakh) + " Lakh");
  if (thousand) parts.push(threeDigit(thousand) + " Thousand");
  if (rest) parts.push(threeDigit(rest));
  const rupees = parts.join(" ").trim() || "Zero";
  const paiseWords = paise ? " and " + twoDigit(paise) + " Paise" : "";
  return rupees + " Rupees" + paiseWords + " Only";
}

function fmtINR(n) {
  return (Math.round(n * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderInvoiceHTML(inv) {
  const meta = inv.meta || {};
  const lines = meta.lines || [];
  const taxMeta = meta.tax || {};
  const c = meta.client || { name: inv.client, legalName: "", address: "", gstin: "", stateCode: "", stateName: "" };
  const billToName = c.legalName || c.name || inv.client;
  const billToBrand = c.legalName && c.name && c.name !== c.legalName ? c.name : "";
  const sac = meta.sacCode || "998912";
  const stateLabel = c.stateCode ? `${c.stateCode} — ${c.stateName || STATE_BY_CODE[c.stateCode] || ""}` : (c.stateName || "—");
  const intra = !!taxMeta.intraState;
  const cgst = Number(taxMeta.cgst || 0);
  const sgst = Number(taxMeta.sgst || 0);
  const igst = Number(taxMeta.igst || 0);
  const roundOff = Number(meta.roundOff || 0);
  const amtWords = numberToWordsINR(Number(inv.total || 0));

  const lineRows = lines.map((l, i) => `
    <tr>
      <td class="sno">${i + 1}</td>
      <td class="desc">${esc(l.particulars)}</td>
      <td class="hsn">${esc(sac)}</td>
      <td class="qty right">${Number(l.qty)}</td>
      <td class="rate right">${fmtINR(Number(l.rate))}</td>
      <td class="amt right">${fmtINR(Number(l.amount))}</td>
    </tr>
  `).join("");

  const taxRows = intra
    ? `<tr><td>CGST @ 9%</td><td class="right">${fmtINR(cgst)}</td></tr>
       <tr><td>SGST @ 9%</td><td class="right">${fmtINR(sgst)}</td></tr>`
    : `<tr><td>IGST @ 18%</td><td class="right">${fmtINR(igst)}</td></tr>`;
  const roundOffRow = roundOff !== 0 ? `<tr><td>Round Off</td><td class="right">${fmtINR(roundOff)}</td></tr>` : "";

  return `
<div class="inv-sheet" style="max-width:800px;margin:0 auto;background:#fff;padding:36px 40px 28px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#111;font-size:12px;line-height:1.45;">
  <style>
    .inv-sheet * { box-sizing: border-box; }
    .inv-sheet .title-bar { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:14px; margin-bottom:18px; }
    .inv-sheet .brand-name { font-size:24px; font-weight:800; letter-spacing:0.02em; }
    .inv-sheet .brand-legal { font-size:10px; color:#555; margin-top:2px; text-transform:uppercase; letter-spacing:0.08em; }
    .inv-sheet .brand-addr { font-size:11px; color:#555; margin-top:8px; max-width:300px; line-height:1.4; }
    .inv-sheet .brand-gst { font-size:11px; margin-top:6px; font-weight:600; }
    .inv-sheet .invoice-tag { text-align:right; }
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
    .inv-sheet .party-sub { font-size:11px; color:#555; margin-top:2px; white-space:pre-line; }
    .inv-sheet .party-meta { font-size:11px; margin-top:6px; }
    .inv-sheet .party-meta span { color:#555; }
    .inv-sheet table.items { width:100%; border-collapse:collapse; font-size:11px; margin-bottom:12px; }
    .inv-sheet table.items thead th { background:#0d0e0f; color:#fff; text-align:left; padding:9px 8px; font-size:9px; letter-spacing:0.12em; text-transform:uppercase; font-weight:700; }
    .inv-sheet table.items thead th.right { text-align:right; }
    .inv-sheet table.items tbody td { padding:9px 8px; border-bottom:1px solid #d9d9d9; vertical-align:top; }
    .inv-sheet table.items tbody td.right { text-align:right; font-variant-numeric:tabular-nums; }
    .inv-sheet table.items .sno { width:32px; color:#555; }
    .inv-sheet table.items .hsn { width:70px; font-family:ui-monospace,monospace; font-size:10px; }
    .inv-sheet table.items .qty { width:60px; }
    .inv-sheet table.items .rate { width:90px; }
    .inv-sheet table.items .amt { width:110px; font-weight:600; }
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
    .inv-sheet .terms b { color:#111; }
  </style>

  <div class="title-bar">
    <div>
      <div class="brand-name">${esc(BUSINESS.tradeName)}</div>
      <div class="brand-addr">${BUSINESS.addressLines.map(esc).join("<br/>")}</div>
      <div class="brand-gst">GSTIN: ${esc(BUSINESS.gstin)} &nbsp;·&nbsp; State: ${esc(BUSINESS.stateCode)} — ${esc(BUSINESS.stateName)}</div>
    </div>
    <div class="invoice-tag">
      <div class="doc-type">TAX INVOICE</div>
      <div class="doc-orig">ORIGINAL FOR RECIPIENT</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-cell"><div class="meta-label">Invoice #</div><div class="meta-value">${esc(inv.invoiceNumber)}</div></div>
    <div class="meta-cell"><div class="meta-label">Invoice Date</div><div class="meta-value">${esc(fmtDate(inv.issueDate))}</div></div>
    <div class="meta-cell"><div class="meta-label">Place of Supply</div><div class="meta-value">${esc(stateLabel)}</div></div>
    <div class="meta-cell"><div class="meta-label">${inv.dueDate ? "Due Date" : "Reverse Charge"}</div><div class="meta-value">${inv.dueDate ? esc(fmtDate(inv.dueDate)) : "No"}</div></div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-head">Bill To</div>
      <div class="party-name">${esc(billToName)}</div>
      ${billToBrand ? `<div class="party-sub"><em>brand: ${esc(billToBrand)}</em></div>` : ""}
      <div class="party-sub">${esc(c.address || "")}</div>
      <div class="party-meta"><span>GSTIN:</span> ${esc(c.gstin || "—")}</div>
      <div class="party-meta"><span>State:</span> ${esc(stateLabel)}</div>
    </div>
    <div class="party">
      <div class="party-head">Ship To</div>
      <div class="party-name">Same as billing address</div>
      <div class="party-sub">&nbsp;</div>
      <div class="party-meta"><span>State Code:</span> ${esc(c.stateCode || BUSINESS.stateCode)}</div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th class="sno">#</th>
        <th>Description</th>
        <th class="hsn">HSN/SAC</th>
        <th class="qty right">Qty</th>
        <th class="rate right">Rate (₹)</th>
        <th class="amt right">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <div class="totals-wrap">
    <div class="amt-words">
      <div class="amt-words-label">Amount in Words</div>
      <div class="amt-words-val">Indian ${esc(amtWords)}</div>
    </div>
    <table class="totals">
      <tbody>
        <tr><td>Subtotal</td><td class="right">${fmtINR(inv.subtotal)}</td></tr>
        ${taxRows}
        ${roundOffRow}
        <tr class="grand"><td>Total (₹)</td><td class="right">${fmtINR(inv.total)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="foot">
    <div class="bank">
      <div class="bank-head">Payment Details</div>
      <div class="bank-row"><span>Account Name</span><b>${esc(BUSINESS.bank.accountName)}</b></div>
      <div class="bank-row"><span>Bank</span><b>${esc(BUSINESS.bank.name)}</b></div>
      <div class="bank-row"><span>A/C No.</span><b>${esc(BUSINESS.bank.accountNumber)}</b></div>
      <div class="bank-row"><span>IFSC</span><b>${esc(BUSINESS.bank.ifsc)}</b></div>
      <div class="bank-row"><span>A/C Type</span><b>${esc(BUSINESS.bank.type)}</b></div>
      <div class="bank-row"><span>GSTIN</span><b>${esc(BUSINESS.gstin)}</b></div>
    </div>
    <div class="sign">
      <div>
        <div class="sign-for">For</div>
        <div class="sign-name">${esc(BUSINESS.tradeName)}</div>
      </div>
      <div class="sign-line">Authorised Signatory</div>
    </div>
  </div>

  <div class="terms"><b>Terms &amp; Conditions:</b> ${esc(BUSINESS.terms)}</div>
</div>
  `;
}

async function generateInvoicePDF(inv) {
  const html2pdf = (await import("html2pdf.js")).default;
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "-99999px";
  container.style.left = "0";
  container.style.width = "800px";
  container.style.background = "#fff";
  container.innerHTML = renderInvoiceHTML(inv);
  document.body.appendChild(container);
  const filename = (inv.invoiceNumber || "invoice").replace(/\//g, "-") + ".pdf";
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
}

// Profit cycle: runs from the 10th of month M (inclusive) to the 10th of month M+1 (exclusive).
// Today's cycle is whichever window contains today. offset=-1 gives the previous cycle, etc.
function getCurrentCycle(reference = new Date()) {
  const d = reference.getDate();
  const m = reference.getMonth();
  const y = reference.getFullYear();
  const startMonth = d >= 10 ? m : m - 1;
  return { start: new Date(y, startMonth, 10), end: new Date(y, startMonth + 1, 10) };
}
function shiftCycle(cycle, offset) {
  const s = cycle.start;
  return getCurrentCycle(new Date(s.getFullYear(), s.getMonth() + offset, 11));
}
function cycleLabel(c) {
  const fmt = (d) => `${String(d.getDate()).padStart(2,"0")} ${d.toLocaleString("en", { month: "short" })}`;
  const endDisp = new Date(c.end.getFullYear(), c.end.getMonth(), c.end.getDate() - 1);
  return `${fmt(c.start)} → ${fmt(endDisp)}`;
}
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

// ═══════════════════════════════════════════════════════════════════
// PAYROLL RULES
// Shift: 10:00 – 19:00 · OT = ₹50/hr
// Weekdays: any minutes past 19:00 count as OT
// Sundays: every minute worked counts as OT
// ═══════════════════════════════════════════════════════════════════
const SHIFT_END_HOUR = 19; // 7 PM
const OT_RATE_PER_HOUR = 50;

// Returns OT minutes from a single attendance record (null if incomplete)
function otMinutesForRecord(rec) {
  if (!rec.punchIn || !rec.punchOut) return 0;
  const [h1, m1] = rec.punchIn.split(":").map(Number);
  const [h2, m2] = rec.punchOut.split(":").map(Number);
  const inMin = h1 * 60 + m1;
  let outMin = h2 * 60 + m2;
  if (outMin < inMin) outMin += 24 * 60; // crosses midnight
  const worked = outMin - inMin;
  if (worked <= 0) return 0;

  // Parse date (YYYY-MM-DD) as local, check day-of-week
  const [y, mo, d] = rec.date.split("-").map(Number);
  const dow = new Date(y, mo - 1, d).getDay(); // 0 = Sunday

  if (dow === 0) return worked; // entire Sunday = OT
  const shiftEndMin = SHIFT_END_HOUR * 60;
  return Math.max(0, outMin - shiftEndMin);
}

function formatHM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Month key helpers
const monthKey = (d) => d.slice(0, 7); // "2026-04"
const currentMonthKey = () => today().slice(0, 7);

// ═══════════════════════════════════════════════════════════════════
// GLOBAL DATE RANGE — presets + helpers + UI shared by every page
// ═══════════════════════════════════════════════════════════════════
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function startOfMonth(dateStr) { return dateStr.slice(0, 7) + "-01"; }
function endOfMonth(dateStr) {
  const [y, m] = dateStr.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m, 0); // day 0 of next month = last day of this month
  return d.toISOString().slice(0, 10);
}

// Cycle helpers — the company runs on a 10th-of-month → 10th-of-month profit cycle.
// "This month" / "month to date" presets are aligned to that cycle so revenue, expenses,
// and profit reflect the same window founders use to settle drawings.
function cycleStartEndIso(reference = new Date()) {
  const c = getCurrentCycle(reference);
  const lastInclusive = new Date(c.end.getFullYear(), c.end.getMonth(), c.end.getDate() - 1);
  return { start: isoDay(c.start), end: isoDay(lastInclusive) };
}

// Each preset returns a range = { preset, start, end }. start/end are YYYY-MM-DD (inclusive),
// or null for unbounded ("all").
const RANGE_PRESETS = {
  today:     () => { const t = today(); return { preset: "today",     start: t,                  end: t }; },
  yesterday: () => { const y = addDays(today(), -1); return { preset: "yesterday", start: y,     end: y }; },
  "7days":   () => { const t = today(); return { preset: "7days",     start: addDays(t, -6),     end: t }; },
  thisMonth: () => { const c = cycleStartEndIso(); return { preset: "thisMonth", start: c.start, end: c.end }; },
  mtd:       () => { const c = cycleStartEndIso(); return { preset: "mtd",       start: c.start, end: today() }; },
  all:       () => ({ preset: "all", start: null, end: null }),
};

function inRange(dateStr, range) {
  if (!range || range.preset === "all" || !range.start || !dateStr) return true;
  return dateStr >= range.start && dateStr <= range.end;
}

function formatRangeLabel(range) {
  if (!range || range.preset === "all") return "All time";
  if (range.start === range.end) return range.start;
  return `${range.start} → ${range.end}`;
}

function DateRangeBar({ range, setRange }) {
  const chips = [
    { id: "today",     label: "TODAY" },
    { id: "yesterday", label: "YESTERDAY" },
    { id: "7days",     label: "LAST 7 DAYS" },
    { id: "thisMonth", label: "THIS CYCLE" },
    { id: "mtd",       label: "CYCLE TO DATE" },
    { id: "all",       label: "ALL TIME" },
  ];
  const isCustom = range.preset === "custom";
  const onStart = (e) => {
    const v = e.target.value;
    if (!v) return;
    setRange({ preset: "custom", start: v, end: range.end && v <= range.end ? range.end : v });
  };
  const onEnd = (e) => {
    const v = e.target.value;
    if (!v) return;
    setRange({ preset: "custom", start: range.start && range.start <= v ? range.start : v, end: v });
  };
  return (
    <div className="date-range-bar">
      <div className="chip-group">
        {chips.map(c => (
          <button key={c.id}
            className={`chip ${range.preset === c.id ? "on" : ""}`}
            onClick={() => setRange(RANGE_PRESETS[c.id]())}>
            {c.label}
          </button>
        ))}
        <button className={`chip ${isCustom ? "on" : ""}`}
          onClick={() => { if (!isCustom) setRange({ preset: "custom", start: today(), end: today() }); }}>
          CUSTOM
        </button>
      </div>
      <div className="date-range-pickers">
        <Calendar size={12} className="date-range-icon" />
        <input type="date" className="date-range-input" aria-label="Start date"
          value={range.start || ""} onChange={onStart} />
        <span className="date-range-sep">→</span>
        <input type="date" className="date-range-input" aria-label="End date"
          value={range.end || ""} onChange={onEnd} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN APP — with Supabase auth + role-based access
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);

  const loadProfile = useCallback(async (userId) => {
    setProfileError(null);
    try {
      const p = await getProfile(userId);
      setProfile(p);
    } catch (e) {
      console.error("Profile load failed:", e);
      // Stale/expired session: clear it so the user lands on the login screen
      // instead of being stuck on "LOADING PROFILE…"
      const msg = e?.message || String(e);
      const isAuthError = e?.status === 401 || /JWT|jwt|refresh token|invalid token|not authenticated/i.test(msg);
      if (isAuthError) {
        try { await signOut(); } catch {}
        return;
      }
      setProfile(null);
      setProfileError(msg);
    }
  }, []);

  useEffect(() => {
    // IMPORTANT: never call supabase.from(...) from inside onAuthStateChange —
    // it runs while supabase-js holds its internal auth lock and any PostgREST
    // call made from there will deadlock. Defer with setTimeout(..., 0) so the
    // follow-up query runs after the lock is released.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => { loadProfile(s.user.id); }, 0);
      } else {
        setProfile(null);
        setProfileError(null);
      }
    });
    return () => subscription?.unsubscribe();
  }, [loadProfile]);

  if (session === undefined) {
    return <div className="boot"><style>{css}</style><div className="boot-inner"><div className="boot-mark"></div>LOADING</div></div>;
  }
  if (!session) {
    return <LoginPage />;
  }
  if (profileError) {
    return (
      <div className="boot"><style>{css}</style>
        <div className="boot-inner" style={{ gap: 16, textAlign: "center", padding: 24 }}>
          <div style={{ color: "#ff6b6b", fontWeight: 600 }}>COULD NOT LOAD PROFILE</div>
          <div style={{ opacity: 0.7, fontSize: 13, maxWidth: 360 }}>{profileError}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button className="btn-primary" onClick={() => loadProfile(session.user.id)}>Retry</button>
            <button className="btn-ghost" onClick={() => signOut()}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }
  if (!profile) {
    return <div className="boot"><style>{css}</style><div className="boot-inner"><div className="boot-mark"></div>LOADING PROFILE…</div></div>;
  }
  if (profile.role === "client") {
    return <ClientApp profile={profile} />;
  }
  return <AuthenticatedApp profile={profile} />;
}

// ═══════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════
function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message || "Login failed");
    }
    setLoading(false);
  };

  return (
    <div className="login-screen">
      <style>{css}</style>
      <div className="login-card">
        <div className="login-brand">
          <div className="logo-mark">
            <svg viewBox="0 0 40 40" width="26" height="26">
              <rect x="4" y="8" width="32" height="24" fill="none" stroke="currentColor" strokeWidth="2.5"/>
              <rect x="10" y="14" width="20" height="12" fill="currentColor"/>
              <circle cx="32" cy="12" r="1.5" fill="var(--ink-yellow)"/>
            </svg>
          </div>
          <div>
            <div className="logo-name">PRESSROOM<span className="dot">.</span>OPS</div>
            <div className="logo-sub">dtf unit · sign in</div>
          </div>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label>EMAIL
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus autoComplete="email"/>
          </label>
          <label>PASSWORD
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"/>
          </label>
          {error && <div className="login-error"><AlertTriangle size={12}/> {error}</div>}
          <button type="submit" className="btn-primary login-btn" disabled={loading || !email || !password}>
            {loading ? <><Loader2 size={13} className="spin"/> SIGNING IN…</> : <><LogIn size={13}/> SIGN IN</>}
          </button>
        </form>
        <div className="login-foot">
          Ask admin for your login if you don\'t have one
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AUTHENTICATED APP — only rendered after login + profile load
// ═══════════════════════════════════════════════════════════════════
function AuthenticatedApp({ profile }) {
  const isAdmin = profile.role === "admin";
  // Default page: admin lands on dashboard, worker lands on attendance
  const [page, setPage] = useState(isAdmin ? "dashboard" : "attendance");
  const [data, setData] = useState(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  // Global date range — used by every page that has date-scoped data
  const [range, setRange] = useState(() => RANGE_PRESETS.thisMonth());
  // Theme: dark (default) | light. Persisted to localStorage.
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem("pressroom-theme") || "dark";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("pressroom-theme", theme); } catch {}
  }, [theme]);

  // Unified fetcher — pulls everything the current user is allowed to see
  const loadAll = useCallback(async () => {
    try {
      const keys = ["workers", "attendance", "production", "orders", "warehouse", "settings"];
      if (isAdmin) keys.push("expenses", "revenue", "founderDraws", "invoices");
      const out = { ...EMPTY_DATA };
      const results = await Promise.all(keys.map(k => fetchAll(k).catch(err => { console.error(k, err); return EMPTY_DATA[k]; })));
      keys.forEach((k, i) => { out[k] = results[i]; });
      setData(out);
      setLoaded(true);
    } catch (e) {
      console.error("Load failed:", e);
      setError(e.message);
      setLoaded(true);
    }
  }, [isAdmin]);

  // Initial load
  useEffect(() => { loadAll(); }, [loadAll]);

  // Real-time subscriptions — subscribe ONCE, refetch on any change
  useEffect(() => {
    const keys = ["attendance", "production", "orders", "warehouse"];
    const unsubs = keys.map(k => subscribe(k, () => loadAll()));
    return () => unsubs.forEach(u => u && u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // subscribe once on mount; loadAll is stable via useCallback

  // update(key, newArray) — reload from server. For granular ops, pages call insert/update/deleteRow directly.
  const refresh = () => loadAll();

  // For backward-compatible `update(key, value)` calls from existing components,
  // we accept and re-compute. Most pages will be ported to call the DB helpers directly.
  const update = async (key, value) => {
    // Optimistic update
    setData(d => ({ ...d, [key]: value }));
    // Note: components that use update() are expected to have already written to DB
    // via the helpers. update() is only for state reconciliation + UI responsiveness.
  };

  if (!loaded) {
    return <div className="boot"><style>{css}</style><div className="boot-inner"><div className="boot-mark"></div>LOADING DATA…</div></div>;
  }

  const allPages = {
    dashboard:    <Dashboard    data={data} goto={setPage} isAdmin={isAdmin} range={range} />,
    attendance:   <Attendance   data={data} update={update} refresh={refresh} profile={profile} isAdmin={isAdmin} range={range} />,
    production:   <Production   data={data} update={update} refresh={refresh} profile={profile} isAdmin={isAdmin} range={range} />,
    orders:       <Orders       data={data} update={update} refresh={refresh} isAdmin={isAdmin} range={range} />,
    clientorders: <AdminClientOrders />,
    dailyorders:  <DailyOrders  data={data} refresh={refresh} profile={profile} />,
    warehouse:    <Warehouse_   data={data} update={update} refresh={refresh} isAdmin={isAdmin} />,
    payroll:      <Payroll      data={data} update={update} refresh={refresh} />,
    pnl:          <PnL          data={data} update={update} refresh={refresh} range={range} />,
    insights:     <Insights     data={data} range={range} />,
  };

  // The date bar only makes sense on pages that have date-scoped data.
  const pagesWithDateBar = new Set(["dashboard", "attendance", "production", "orders", "pnl", "insights"]);

  return (
    <div className="app">
      <style>{css}</style>
      <Sidebar page={page} setPage={setPage} isAdmin={isAdmin} profile={profile} />
      <div className="main">
        <TopBar data={data} profile={profile} theme={theme} setTheme={setTheme} />
        <div className="page">
          {error && <div className="geo-alert geo-alert-err"><AlertTriangle size={14}/> {error}</div>}
          {pagesWithDateBar.has(page) && <DateRangeBar range={range} setRange={setRange} />}
          {allPages[page] || <div className="empty panel">Access denied.</div>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LAYOUT: SIDEBAR + TOPBAR
// ═══════════════════════════════════════════════════════════════════
function Sidebar({ page, setPage, isAdmin, profile }) {
  const allNav = [
    { id: "dashboard",  label: "Dashboard",   icon: LayoutDashboard, admin: false },
    { id: "attendance", label: "Attendance",  icon: Users,           admin: false },
    { id: "production", label: "Production",  icon: Printer,         admin: false },
    { id: "orders",     label: "Orders",      icon: ClipboardList,   admin: false },
    { id: "dailyorders",  label: "Daily Print Job", icon: Truck,    admin: true  },
    { id: "clientorders", label: "Client Orders", icon: Package,     admin: true  },
    { id: "warehouse",  label: "Warehouse",   icon: Warehouse,       admin: false },
    { id: "payroll",    label: "Payroll",     icon: Wallet,          admin: true  },
    { id: "pnl",        label: "P&L",         icon: TrendingUp,      admin: true  },
    { id: "insights",   label: "Insights",    icon: BarChart3,       admin: true  },
  ];
  const nav = isAdmin ? allNav : allNav.filter(n => !n.admin);
  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-mark">
          <svg viewBox="0 0 40 40" width="22" height="22">
            <rect x="4" y="8" width="32" height="24" fill="none" stroke="currentColor" strokeWidth="2.5"/>
            <rect x="10" y="14" width="20" height="12" fill="currentColor"/>
            <circle cx="32" cy="12" r="1.5" fill="var(--ink-yellow)"/>
          </svg>
        </div>
        <div>
          <div className="logo-name">PRESSROOM<span className="dot">.</span>OPS</div>
          <div className="logo-sub">dtf unit · v2</div>
        </div>
      </div>
      <nav className="nav">
        {nav.map(n => {
          const Icon = n.icon;
          return (
            <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
              <Icon size={15} />
              <span>{n.label}</span>
              {page === n.id && <ChevronRight size={12} className="nav-chev" />}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <div className="foot-user">
          <div className="foot-avatar">{profile?.name?.slice(0,2).toUpperCase() || "?"}</div>
          <div>
            <div className="foot-name">{profile?.name || "—"}</div>
            <div className="foot-sub">{isAdmin ? "admin · full access" : "worker"}</div>
          </div>
        </div>
        <button className="btn-ghost foot-logout" onClick={() => signOut()}>
          <LogOut size={11}/> SIGN OUT
        </button>
      </div>
    </aside>
  );
}

function TopBar({ data, theme, setTheme }) {
  const presentToday = data.attendance.filter(a => a.date === today() && !a.punchOut).length;
  const toggleTheme = () => setTheme && setTheme(theme === "light" ? "dark" : "light");
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="date-chip">
          <Calendar size={12} />
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
        </div>
      </div>
      <div className="topbar-right">
        <div className="presence">
          <span className="pulse"></span>
          <span>{presentToday} on floor</span>
        </div>
        <div className="clock">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
        {setTheme && (
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme" title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>
            {theme === "light" ? <Moon size={14}/> : <Sun size={14}/>}
          </button>
        )}
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE 1 · DASHBOARD
// ═══════════════════════════════════════════════════════════════════
function Dashboard({ data, goto, isAdmin, range }) {
  const t = today();
  const metrics = useMemo(() => {
    const prodInRange = data.production.filter(p => inRange(p.date, range));
    const printed = prodInRange.reduce((s, p) => s + p.total, 0);
    // "On Floor" is a live snapshot regardless of the filter
    const present = data.attendance.filter(a => a.date === t && !a.punchOut).length;

    const pendingUnits = data.orders.reduce((s, o) => s + o.items.reduce((ss, it) => {
      const total = Object.values(it.sizes).reduce((a,b) => a+b, 0);
      const printed = Object.values(it.printed || {}).reduce((a,b) => a+b, 0);
      return ss + (total - printed);
    }, 0), 0);

    const warehouseUnits = data.warehouse.filter(w => (w.kind || "apparel") === "apparel").reduce((s, w) => s + Object.values(w.sizes).reduce((a,b) => a+b, 0), 0);

    const exp = (data.expenses || []).filter(e => inRange(e.date, range)).reduce((s, e) => s + e.amount, 0);
    // Revenue (top-line, net of GST) and cash received (net of GST) for invoices raised in range.
    // GST is excluded — it's owed to the government, not the business.
    const invs = (data.invoices || []).filter(inv => inRange(inv.issueDate, range));
    const rev = invs.reduce((s, inv) => s + (Number(inv.subtotal) || 0), 0);
    const cash = invs.reduce((s, inv) => {
      const paid = Number(inv.paid) || 0, total = Number(inv.total) || 0, sub = Number(inv.subtotal) || 0;
      return s + (total > 0 ? paid * sub / total : 0);
    }, 0);
    // Profit on cash basis, net of GST.
    return { printed, present, pendingUnits, warehouseUnits, exp, rev, cash, profit: cash - exp };
  }, [data, t, range]);
  const rangeSuffix = range?.preset === "today" ? "Today"
                    : range?.preset === "yesterday" ? "Yesterday"
                    : range?.preset === "7days" ? "7 Days"
                    : range?.preset === "thisMonth" ? "This Cycle"
                    : range?.preset === "mtd" ? "Cycle to Date"
                    : range?.preset === "all" ? "All Time"
                    : "Range";

  // last 7 days production chart
  const prodTrend = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const total = data.production.filter(p => p.date === key).reduce((s,p) => s + p.total, 0);
      days.push({ d: d.toLocaleDateString("en-IN", { weekday: "short" }), printed: total });
    }
    return days;
  }, [data.production]);

  const recentProd = [...data.production].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <div className="dash">
      <PageHeader title="Today's Floor" sub="live snapshot of unit operations" />

      <div className={`kpi-grid ${isAdmin ? "kpi-6" : "kpi-4"}`}>
        <KPICard label={`Printed · ${rangeSuffix}`}     value={metrics.printed}      unit="pcs"  icon={Printer}    accent="yellow" onClick={() => goto("production")} />
        <KPICard label="On Floor"                        value={metrics.present}      unit="workers" icon={Users}     accent="cyan"   onClick={() => goto("attendance")} />
        <KPICard label="Pending to Print"                value={metrics.pendingUnits} unit="pcs"  icon={ClipboardList} accent="amber"  onClick={() => goto("orders")} />
        <KPICard label="In Warehouse"                    value={metrics.warehouseUnits} unit="plain tees" icon={Warehouse} accent="slate" onClick={() => goto("warehouse")} />
        {isAdmin && <KPICard label={`Cash In · ${rangeSuffix}`}   value={`₹${(metrics.cash/1000).toFixed(1)}K`} icon={IndianRupee} accent="green" onClick={() => goto("pnl")} />}
        {isAdmin && <KPICard label={`${metrics.profit >= 0 ? "Profit" : "Loss"} · ${rangeSuffix}`} value={`₹${Math.abs(metrics.profit/1000).toFixed(1)}K`} icon={TrendingUp} accent={metrics.profit >= 0 ? "green" : "red"} onClick={() => goto("pnl")} />}
      </div>

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>PRODUCTION · 7 DAY</h2>
              <div className="panel-sub">tees printed per day</div>
            </div>
          </div>
          <div style={{ height: 240, padding: "12px 8px 8px" }}>
            <ResponsiveContainer>
              <LineChart data={prodTrend} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="var(--border-dim)" strokeDasharray="2 4" vertical={false}/>
                <XAxis dataKey="d" stroke="var(--text-dim)" fontSize={10} tickLine={false} axisLine={{stroke: "var(--border)"}}/>
                <YAxis stroke="var(--text-dim)" fontSize={10} tickLine={false} axisLine={false}/>
                <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", fontSize: 11, fontFamily: "var(--font-mono)" }}/>
                <Line type="monotone" dataKey="printed" stroke="var(--ink-yellow)" strokeWidth={2.5} dot={{ fill: "var(--ink-yellow)", r: 3 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>RECENT RUNS</h2>
              <div className="panel-sub">latest production entries</div>
            </div>
            <button className="btn-ghost" onClick={() => goto("production")}>VIEW ALL →</button>
          </div>
          <div className="recent-list">
            {recentProd.length === 0 && <div className="empty">No production logged yet. Go to Production to log today's runs.</div>}
            {recentProd.map(p => (
              <div key={p.id} className="recent-item">
                <div>
                  <div className="recent-prod">{p.product}</div>
                  <div className="recent-meta">{p.client} · {p.date}</div>
                </div>
                <div className="recent-qty">
                  <strong>{p.total}</strong>
                  <span>pcs</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE 2 · ATTENDANCE (with GEOFENCING)
// ═══════════════════════════════════════════════════════════════════

// Haversine distance in meters between two lat/lng points
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng/2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Get current position with a promise wrapper + reasonable timeout
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation not supported by this browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      (err) => {
        const msg = err.code === 1 ? "Location permission denied. Please enable location for this site in your browser."
                  : err.code === 2 ? "Location unavailable. Check that GPS is on."
                  : err.code === 3 ? "Location request timed out. Try again."
                  : "Could not get location";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function Attendance({ data, update, refresh, profile, isAdmin, range }) {
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [pending, setPending] = useState(null); // { workerId, action: "in" | "out", recId? }
  const [error, setError] = useState(null);
  const t = today();

  const settings = data.settings || { geofenceEnabled: false, geofenceRadius: 100 };
  const geoActive = settings.geofenceEnabled && settings.warehouseLat && settings.warehouseLng;

  const todayRecords = data.attendance.filter(a => a.date === t);
  const recordFor = (wid) => todayRecords.find(r => r.workerId === wid);

  const attemptPunch = async (workerId, action, recId = null) => {
    setPending({ workerId, action, recId, status: "locating" });
    setError(null);

    try {
      // If geofence not set up, punch through without location check
      if (!geoActive) {
        doPunch(workerId, action, recId, null);
        setPending(null);
        return;
      }

      // Request current location
      const loc = await getCurrentPosition();
      const dist = distanceMeters(loc.lat, loc.lng, settings.warehouseLat, settings.warehouseLng);

      if (dist > settings.geofenceRadius) {
        setPending({ workerId, action, recId, status: "denied", distance: dist, accuracy: loc.accuracy });
        return;
      }

      // Within geofence — punch through with location
      doPunch(workerId, action, recId, { ...loc, distance: dist });
      setPending({ workerId, action, recId, status: "success", distance: dist });
      setTimeout(() => setPending(null), 2000);
    } catch (e) {
      setPending(null);
      setError(e.message);
      setTimeout(() => setError(null), 5000);
    }
  };

  const doPunch = async (wid, action, recId, loc) => {
    const now = new Date().toTimeString().slice(0, 5);
    try {
      if (action === "in") {
        const rec = { id: `a${Date.now()}`, workerId: wid, date: t, punchIn: now, punchOut: null, inLoc: loc, outLoc: null };
        await insertRow("attendance", rec);
      } else {
        await updateRow("attendance", recId, { punchOut: now, outLoc: loc });
      }
      refresh();
    } catch (e) {
      alert("Failed to save: " + e.message);
    }
  };

  const addWorker = async (w) => {
    try {
      await insertRow("workers", { ...w, id: `w${Date.now()}`, active: true });
      refresh();
      setShowAddWorker(false);
    } catch (e) { alert("Failed to add worker: " + e.message); }
  };

  const saveSettings = async (s) => {
    try {
      await insertRow("settings", { ...settings, ...s });
      refresh();
      setShowSetup(false);
    } catch (e) { alert("Failed to save settings: " + e.message); }
  };

  const recent = [...data.attendance]
    .filter(a => inRange(a.date, range))
    .sort((a,b) => (b.date + b.punchIn).localeCompare(a.date + a.punchIn));
  const getWorker = (wid) => data.workers.find(w => w.id === wid);

  const hoursFor = (r) => {
    if (!r.punchOut) return null;
    const [h1,m1] = r.punchIn.split(":").map(Number);
    const [h2,m2] = r.punchOut.split(":").map(Number);
    const mins = (h2*60 + m2) - (h1*60 + m1);
    return (mins / 60).toFixed(1);
  };

  return (
    <div>
      <PageHeader title="Attendance" sub="punch in / out · daily log" action={
        <div style={{display:"flex", gap: 8}}>
          <button className="btn-ghost" onClick={() => setShowSetup(true)}>
            <MapPin size={13}/> LOCATION {geoActive ? "· ON" : ""}
          </button>
          <button className="btn-primary" onClick={() => setShowAddWorker(true)}><Plus size={13}/> ADD WORKER</button>
        </div>
      }/>

      {/* Geofence status bar */}
      <div className={`geo-status ${geoActive ? "geo-on" : "geo-off"}`}>
        <div className="geo-status-left">
          <MapPin size={14}/>
          {geoActive ? (
            <>
              <span><strong>GEOFENCE ACTIVE</strong></span>
              <span className="geo-sep">·</span>
              <span className="geo-detail">{settings.warehouseLabel || "warehouse set"} · {settings.geofenceRadius}m radius</span>
            </>
          ) : (
            <>
              <span><strong>GEOFENCE OFF</strong></span>
              <span className="geo-sep">·</span>
              <span className="geo-detail">workers can punch in from anywhere. Set location to enable.</span>
            </>
          )}
        </div>
        {!geoActive && <button className="btn-ghost sm" onClick={() => setShowSetup(true)}>SET UP →</button>}
      </div>

      {error && (
        <div className="geo-alert geo-alert-err">
          <AlertTriangle size={14}/>
          <span>{error}</span>
        </div>
      )}

      <section className="panel">
        <div className="panel-head">
          <div><h2>TODAY · {t}</h2><div className="panel-sub">{todayRecords.length} entries</div></div>
        </div>
        <div className="worker-grid">
          {data.workers.filter(w => w.active).map(w => {
            const rec = recordFor(w.id);
            const clockedIn = rec && !rec.punchOut;
            const done = rec && rec.punchOut;
            const busy = pending && pending.workerId === w.id;
            const denied = busy && pending.status === "denied";
            const locating = busy && pending.status === "locating";
            const success = busy && pending.status === "success";

            return (
              <div key={w.id} className={`worker-card ${clockedIn ? "active" : ""} ${done ? "done" : ""} ${denied ? "denied" : ""}`}>
                <div className="worker-top">
                  <div>
                    <div className="worker-name">{w.name}</div>
                    <div className="worker-role">{w.role} · ₹{(w.monthlySalary || 0).toLocaleString("en-IN")}/mo</div>
                  </div>
                  <div className={`worker-status ${clockedIn ? "s-in" : done ? "s-done" : "s-out"}`}>
                    {clockedIn ? "IN" : done ? "OUT" : "—"}
                  </div>
                </div>
                {rec && (
                  <div className="worker-times">
                    <span>IN: <strong>{rec.punchIn}</strong></span>
                    {rec.punchOut && <span>OUT: <strong>{rec.punchOut}</strong></span>}
                    {rec.punchOut && <span className="worker-hrs">{hoursFor(rec)}h</span>}
                    {rec.punchOut && otMinutesForRecord(rec) > 0 && (
                      <span className="worker-ot">+{formatHM(otMinutesForRecord(rec))} OT</span>
                    )}
                  </div>
                )}
                {rec?.inLoc && (
                  <div className="worker-loc">
                    <MapPin size={10}/>
                    <span>punched in {rec.inLoc.distance}m from warehouse</span>
                  </div>
                )}

                {/* Status banners during punch attempt */}
                {locating && (
                  <div className="punch-banner punch-locating">
                    <span className="spinner"></span>
                    GETTING YOUR LOCATION…
                  </div>
                )}
                {success && (
                  <div className="punch-banner punch-success">
                    <Check size={12}/> WITHIN {pending.distance}M — PUNCHED
                  </div>
                )}
                {denied && (
                  <div className="punch-banner punch-denied">
                    <X size={12}/>
                    <div>
                      <div><strong>OUTSIDE WAREHOUSE</strong></div>
                      <div className="punch-denied-sub">
                        {pending.distance}m away · accuracy ±{pending.accuracy}m · allowed: {settings.geofenceRadius}m
                      </div>
                    </div>
                  </div>
                )}

                <div className="worker-actions">
                  {!rec && !busy && (
                    <button className="btn-primary sm" onClick={() => attemptPunch(w.id, "in")}>
                      <LogIn size={12}/> PUNCH IN
                    </button>
                  )}
                  {clockedIn && !busy && (
                    <button className="btn-danger sm" onClick={() => attemptPunch(w.id, "out", rec.id)}>
                      <LogOut size={12}/> PUNCH OUT
                    </button>
                  )}
                  {denied && (
                    <button className="btn-ghost sm" onClick={() => setPending(null)}>DISMISS</button>
                  )}
                  {done && <span className="muted sm-text">Closed for today</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>ATTENDANCE LOG</h2><div className="panel-sub">{formatRangeLabel(range)} · {recent.length} entries</div></div></div>
        <div className="log-table">
          <div className="log-thead">
            <div>DATE</div><div>WORKER</div><div>IN → OUT</div><div>HOURS</div><div>OT</div><div>LOCATION</div>
          </div>
          {recent.map(r => {
            const w = getWorker(r.workerId);
            const otMin = otMinutesForRecord(r);
            return (
              <div key={r.id} className="log-row">
                <div className="mono log-date">{r.date}</div>
                <div className="log-worker">{w?.name || "—"}</div>
                <div className="mono log-times">
                  <span>{r.punchIn || "—"}</span>
                  <span className="log-sep"> → </span>
                  <span>{r.punchOut || <span className="live-tag">ACTIVE</span>}</span>
                </div>
                <div className="mono log-hours"><strong>{hoursFor(r) || "—"}</strong></div>
                <div className="mono log-ot">
                  {otMin > 0 ? <span className="ot-cell">+{formatHM(otMin)}</span> : <span className="muted">—</span>}
                </div>
                <div className="mono dim log-loc">
                  {r.inLoc ? `${r.inLoc.distance}m` : <span className="muted">—</span>}
                </div>
              </div>
            );
          })}
          {recent.length === 0 && <div className="empty">No attendance yet.</div>}
        </div>
      </section>

      {showAddWorker && <AddWorkerModal onClose={() => setShowAddWorker(false)} onSubmit={addWorker}/>}
      {showSetup && <GeofenceSetupModal settings={settings} onClose={() => setShowSetup(false)} onSubmit={saveSettings}/>}
    </div>
  );
}

function AddWorkerModal({ onClose, onSubmit }) {
  const [f, setF] = useState({ name: "", role: "Printer", monthlySalary: 15000 });
  return (
    <Modal onClose={onClose} title="ADD WORKER">
      <div className="form">
        <label>NAME<input value={f.name} onChange={e => setF({...f, name: e.target.value})}/></label>
        <label>ROLE
          <select value={f.role} onChange={e => setF({...f, role: e.target.value})}>
            <option>Printer</option><option>Press Op</option><option>Packer</option><option>QC / Pack</option><option>Other</option>
          </select>
        </label>
        <label>MONTHLY SALARY (₹)<input type="number" value={f.monthlySalary} onChange={e => setF({...f, monthlySalary: parseInt(e.target.value) || 0})}/></label>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={!f.name} onClick={() => onSubmit(f)}>ADD →</button>
      </div>
    </Modal>
  );
}

function GeofenceSetupModal({ settings, onClose, onSubmit }) {
  const [f, setF] = useState({
    warehouseLat: settings.warehouseLat ?? "",
    warehouseLng: settings.warehouseLng ?? "",
    warehouseLabel: settings.warehouseLabel ?? "",
    geofenceRadius: settings.geofenceRadius ?? 100,
    geofenceEnabled: settings.geofenceEnabled ?? false,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [captured, setCaptured] = useState(null); // { accuracy } — shown after capture

  const useCurrent = async () => {
    setLoading(true);
    setErr(null);
    try {
      const loc = await getCurrentPosition();
      setF({ ...f, warehouseLat: loc.lat.toFixed(6), warehouseLng: loc.lng.toFixed(6) });
      setCaptured({ accuracy: loc.accuracy });
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  const valid = f.warehouseLat !== "" && f.warehouseLng !== "" && !isNaN(parseFloat(f.warehouseLat)) && !isNaN(parseFloat(f.warehouseLng));

  const save = () => {
    onSubmit({
      warehouseLat: parseFloat(f.warehouseLat),
      warehouseLng: parseFloat(f.warehouseLng),
      warehouseLabel: f.warehouseLabel,
      geofenceRadius: parseInt(f.geofenceRadius) || 100,
      geofenceEnabled: f.geofenceEnabled,
    });
  };

  return (
    <Modal onClose={onClose} title="WAREHOUSE LOCATION">
      <div className="form">
        <div className="geo-hint">
          <MapPin size={12}/>
          <span>Set your unit's location. Best done <strong>while standing inside the unit</strong>. Workers must be within the radius to punch in/out.</span>
        </div>

        <label>LABEL (optional)
          <input value={f.warehouseLabel} onChange={e => setF({...f, warehouseLabel: e.target.value})} placeholder="e.g. Okhla Phase 2 Unit"/>
        </label>

        <div className="form-row">
          <label>LATITUDE
            <input value={f.warehouseLat} onChange={e => setF({...f, warehouseLat: e.target.value})} placeholder="28.5355"/>
          </label>
          <label>LONGITUDE
            <input value={f.warehouseLng} onChange={e => setF({...f, warehouseLng: e.target.value})} placeholder="77.2910"/>
          </label>
        </div>

        <button className="btn-ghost geo-use-btn" onClick={useCurrent} disabled={loading}>
          {loading ? <><span className="spinner"></span> GETTING LOCATION…</> : <><MapPin size={12}/> USE MY CURRENT LOCATION</>}
        </button>

        {captured && (
          <div className="geo-captured">
            <Check size={12}/> Location captured · accuracy ±{captured.accuracy}m
            {captured.accuracy > 50 && <div className="geo-captured-warn">Accuracy is poor — try stepping outside or near a window, then capture again.</div>}
          </div>
        )}

        {err && <div className="geo-alert geo-alert-err"><AlertTriangle size={12}/> {err}</div>}

        <label>ALLOWED RADIUS (meters)
          <input type="number" value={f.geofenceRadius} onChange={e => setF({...f, geofenceRadius: e.target.value})}/>
        </label>

        <label className="toggle-label">
          <input type="checkbox" checked={f.geofenceEnabled} onChange={e => setF({...f, geofenceEnabled: e.target.checked})}/>
          <span>ENABLE GEOFENCE</span>
          <span className="toggle-sub">{f.geofenceEnabled ? "workers must be on-site to punch" : "no location check (anyone can punch from anywhere)"}</span>
        </label>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={!valid} onClick={save}>SAVE →</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE 3 · PRODUCTION
// ═══════════════════════════════════════════════════════════════════
function Production({ data, update, refresh, profile, isAdmin, range }) {
  const [showLog, setShowLog] = useState(false);

  const log = async (entry) => {
    const total = Object.values(entry.sizes).reduce((a,b) => a+b, 0);
    const { orderId: pickedOrderId, ...persistable } = entry;
    const full = { ...persistable, id: `p${Date.now()}`, total };

    try {
      // 1. Insert production entry
      await insertRow("production", full);

      // 2. Deduct from apparel warehouse (per matching product) — DTF prints are reserved on order creation, not here
      for (const w of data.warehouse) {
        if ((w.kind || "apparel") !== "apparel") continue;
        if (w.client !== entry.client || w.product !== entry.product) continue;
        const newSizes = { ...w.sizes };
        for (const sz of SIZES) {
          if (entry.sizes[sz]) newSizes[sz] = Math.max(0, (newSizes[sz] || 0) - entry.sizes[sz]);
        }
        await updateRow("warehouse", w.id, { sizes: newSizes });
      }

      // 3. Update order PRINTED counts. If the user picked an order, route to it first;
      //    any leftover overflows to other in-progress orders (legacy FIFO behavior).
      let remaining = { ...entry.sizes };
      const orderedList = pickedOrderId
        ? [
            ...data.orders.filter(o => o.id === pickedOrderId),
            ...data.orders.filter(o => o.id !== pickedOrderId),
          ]
        : data.orders;
      for (const o of orderedList) {
        if (o.client !== entry.client || o.status !== "in_progress") continue;
        let changed = false;
        const newItems = o.items.map(it => {
          if (it.product !== entry.product) return it;
          const newPrinted = { ...(it.printed || {}) };
          for (const sz of SIZES) {
            if (!remaining[sz]) continue;
            const alreadyPrinted = newPrinted[sz] || 0;
            const maxPrintable = (it.sizes[sz] || 0) - alreadyPrinted;
            const add = Math.min(maxPrintable, remaining[sz]);
            if (add > 0) {
              newPrinted[sz] = alreadyPrinted + add;
              remaining[sz] -= add;
              changed = true;
            }
          }
          return { ...it, printed: newPrinted };
        });
        if (changed) await updateRow("orders", o.id, { items: newItems });
      }

      refresh();
      setShowLog(false);
    } catch (e) { alert("Failed to log production: " + e.message); }
  };

  const remove = async (id) => {
    if (!confirm("Delete this production entry? Note: it won't reverse warehouse/order deductions.")) return;
    try { await deleteRow("production", id); refresh(); }
    catch (e) { alert("Failed to delete: " + e.message); }
  };

  const entries = data.production.filter(p => inRange(p.date, range)).sort((a,b) => b.id.localeCompare(a.id));
  const totals = useMemo(() => {
    const t = { total: 0, byProduct: {} };
    for (const e of entries) {
      t.total += e.total;
      t.byProduct[e.product] = (t.byProduct[e.product] || 0) + e.total;
    }
    return t;
  }, [entries]);

  return (
    <div>
      <PageHeader title="Production" sub="log today's print runs · updates printed count on orders + deducts warehouse stock"
        action={<button className="btn-primary" onClick={() => setShowLog(true)}><Plus size={13}/> LOG PRODUCTION</button>}/>

      <div className="filter-bar">
        <div className="filter-summary">
          <span>{formatRangeLabel(range)}</span>
          <span className="dot-sep">·</span>
          <span>{entries.length} entries</span>
          <span className="dot-sep">·</span>
          <span><strong>{totals.total}</strong> tees</span>
        </div>
      </div>

      {Object.keys(totals.byProduct).length > 0 && (
        <section className="panel">
          <div className="panel-head"><div><h2>BREAKDOWN</h2><div className="panel-sub">for selected period</div></div></div>
          <div className="breakdown">
            {Object.entries(totals.byProduct).map(([prod, qty]) => (
              <div key={prod} className="bd-item">
                <Shirt size={13} />
                <span className="bd-prod">{prod}</span>
                <span className="bd-qty">{qty}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><div><h2>LOG</h2><div className="panel-sub">{entries.length} entries</div></div></div>
        <div className="prod-table">
          <div className="prod-thead">
            <div>DATE</div><div>PRODUCT</div><div>CLIENT</div><div>XS</div><div>S</div><div>M</div><div>L</div><div>XL</div><div>XXL</div><div>TOTAL</div><div></div>
          </div>
          {entries.map(p => (
            <div key={p.id} className="prod-row">
              <div className="mono dim">{p.date}</div>
              <div className="prod-name">{p.product}</div>
              <div><ClientChip client={p.client}/></div>
              {SIZES.map(sz => <div key={sz} className="mono size-cell" data-empty={!p.sizes[sz] ? "true" : undefined}>{p.sizes[sz] || "—"}</div>)}
              <div className="mono"><strong>{p.total}</strong></div>
              <div><button className="icon-btn" onClick={() => remove(p.id)}><Trash2 size={12}/></button></div>
            </div>
          ))}
          {entries.length === 0 && <div className="empty">No production in selected range.</div>}
        </div>
      </section>

      {showLog && <LogProductionModal data={data} onClose={() => setShowLog(false)} onSubmit={log}/>}
    </div>
  );
}

function LogProductionModal({ data, onClose, onSubmit }) {
  const [f, setF] = useState({
    date: today(),
    client: "Culture Circle",
    orderId: "",
    product: "",
    sizes: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 },
    platesUsed: 0,
  });

  // In-progress orders for the selected client (newest first)
  const openOrders = useMemo(() =>
    data.orders
      .filter(o => o.client === f.client && o.status === "in_progress")
      .sort((a,b) => (b.date || "").localeCompare(a.date || "")),
    [f.client, data.orders]
  );

  // Product suggestions: scoped to the selected order when picked, else client-wide
  const productOptions = useMemo(() => {
    if (f.orderId) {
      const ord = data.orders.find(o => o.id === f.orderId);
      return ord ? [...new Set(ord.items.map(it => it.product))] : [];
    }
    const s = new Set();
    data.orders.filter(o => o.client === f.client).forEach(o => o.items.forEach(it => s.add(it.product)));
    data.warehouse.filter(w => w.client === f.client).forEach(w => s.add(w.product));
    return [...s];
  }, [f.client, f.orderId, data]);

  const total = Object.values(f.sizes).reduce((a,b) => a+b, 0);

  return (
    <Modal onClose={onClose} title="LOG TODAY'S PRODUCTION" wide>
      <div className="form">
        <div className="form-row">
          <label>DATE<input type="date" value={f.date} onChange={e => setF({...f, date: e.target.value})}/></label>
          <label>CLIENT
            <select value={f.client} onChange={e => setF({...f, client: e.target.value, orderId: "", product: ""})}>
              {CLIENTS.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label>ORDER
          <select value={f.orderId} onChange={e => setF({...f, orderId: e.target.value, product: ""})}>
            <option value="">— Any open order —</option>
            {openOrders.map(o => {
              const t = o.items.reduce((s, it) => s + Object.values(it.sizes || {}).reduce((a,b) => a+b, 0), 0);
              const p = o.items.reduce((s, it) => s + Object.values(it.printed || {}).reduce((a,b) => a+b, 0), 0);
              return (
                <option key={o.id} value={o.id}>
                  {o.id} · {o.date} · {Math.max(0, t - p)}/{t} pending
                </option>
              );
            })}
          </select>
        </label>
        <label>PRODUCT
          <input list="prod-list" value={f.product} onChange={e => setF({...f, product: e.target.value})} placeholder="e.g. Off Supply Black CORE Tee"/>
          <datalist id="prod-list">
            {productOptions.map(p => <option key={p} value={p}/>)}
          </datalist>
        </label>
        <div>
          <div className="mono-label">SIZES PRINTED</div>
          <div className="size-grid">
            {SIZES.map(sz => (
              <label key={sz} className="size-input">
                <span>{sz}</span>
                <input type="number" min="0" value={f.sizes[sz]} onChange={e => setF({...f, sizes: {...f.sizes, [sz]: parseInt(e.target.value) || 0}})}/>
              </label>
            ))}
          </div>
          <div className="size-total">TOTAL: <strong>{total}</strong> pcs</div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={!f.product || total === 0} onClick={() => onSubmit(f)}>LOG → {total} PCS</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE 4 · ORDERS
// ═══════════════════════════════════════════════════════════════════
function Orders({ data, update, refresh, isAdmin, range }) {
  const [showNew, setShowNew] = useState(false);
  const [showBackdated, setShowBackdated] = useState(false);
  const [filterClient, setFilterClient] = useState("all");

  const orders = data.orders
    .filter(o => filterClient === "all" || o.client === filterClient)
    .filter(o => inRange(o.date, range));

  // Cycle-scoped stats:
  // ORDERED  = total tees billed via invoices issued in this cycle (sum of meta.lines[].qty)
  // PRINTED  = sum of order.items.printed across orders received in this cycle (matches the per-order numbers shown below)
  // PENDING  = ORDERED − PRINTED (clamped to 0)
  const cycleOrdered = (data.invoices || [])
    .filter(inv => inRange(inv.issueDate, range))
    .filter(inv => filterClient === "all" || inv.client === filterClient)
    .reduce((s, inv) => s + ((inv.meta?.lines || []).reduce((ss, l) => ss + (Number(l.qty) || 0), 0)), 0);
  const cyclePrinted = orders.reduce((s, o) => s + o.items.reduce((ss, it) => ss + Object.values(it.printed || {}).reduce((a,b) => a+b, 0), 0), 0);
  const cyclePending = Math.max(0, cycleOrdered - cyclePrinted);

  const add = async (order) => {
    const id = `ORD-${order.client.slice(0,2).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    try {
      await insertRow("orders", { ...order, id, status: "in_progress" });
      // Deduct matching DTF prints from warehouse (reserved to this order)
      for (const item of order.items) {
        const dtfRow = data.warehouse.find(w => w.kind === "dtf" && w.client === order.client && w.product === item.product);
        if (!dtfRow) continue;
        const newSizes = { ...dtfRow.sizes };
        let changed = false;
        for (const sz of SIZES) {
          const need = item.sizes[sz] || 0;
          const have = dtfRow.sizes[sz] || 0;
          const use = Math.min(need, have);
          if (use > 0) { newSizes[sz] = have - use; changed = true; }
        }
        if (changed) await updateRow("warehouse", dtfRow.id, { sizes: newSizes });
      }
      refresh();
      setShowNew(false);
    } catch (e) { alert("Failed to create order: " + e.message); }
  };

  const markDone = async (oid) => {
    try { await updateRow("orders", oid, { status: "completed" }); refresh(); }
    catch (e) { alert("Failed: " + e.message); }
  };

  const remove = async (oid) => {
    if (!confirm("Delete this order?")) return;
    try { await deleteRow("orders", oid); refresh(); }
    catch (e) { alert("Failed: " + e.message); }
  };

  // Backdated order: historical record, marked completed with printed[] = sizes[].
  // No warehouse deduction (stock was adjusted at the actual time of the work).
  const addBackdated = async (order) => {
    const id = `ORD-${order.client.slice(0,2).toUpperCase()}-BD-${Date.now().toString().slice(-4)}`;
    try {
      await insertRow("orders", { ...order, id, status: "completed" });
      refresh();
      setShowBackdated(false);
    } catch (e) { alert("Failed to backdate order: " + e.message); }
  };

  return (
    <div>
      <PageHeader title="Orders" sub="incoming orders · print progress"
        action={
          <div style={{display:"flex", gap:8}}>
            {isAdmin && <button className="btn-ghost" onClick={() => setShowBackdated(true)}>BACKDATE ORDER</button>}
            <button className="btn-primary" onClick={() => setShowNew(true)}><Plus size={13}/> NEW ORDER</button>
          </div>
        }/>

      <div className="orders-stats">
        <div className="os-card os-ord">
          <div className="os-label">TO BE PRINTED · CYCLE</div>
          <div className="os-val">{cycleOrdered.toLocaleString("en-IN")}<span>pcs</span></div>
          <div className="os-sub">from invoices raised in {formatRangeLabel(range)}</div>
        </div>
        <div className="os-card os-print">
          <div className="os-label">PRINTED · CYCLE</div>
          <div className="os-val">{cyclePrinted.toLocaleString("en-IN")}<span>pcs</span></div>
          <div className="os-sub">{cycleOrdered ? Math.round((cyclePrinted / cycleOrdered) * 100) : 0}% of cycle target done</div>
        </div>
        <div className="os-card os-pend">
          <div className="os-label">PENDING TO PRINT</div>
          <div className="os-val">{cyclePending.toLocaleString("en-IN")}<span>pcs</span></div>
          <div className="os-sub">target − printed</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="chip-group">
          <button className={`chip ${filterClient === "all" ? "on" : ""}`} onClick={() => setFilterClient("all")}>ALL</button>
          {CLIENTS.map(c => (
            <button key={c} className={`chip ${filterClient === c ? "on" : ""}`} onClick={() => setFilterClient(c)}>{c.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div className="order-list">
        {orders.map(o => <OrderCard key={o.id} order={o} onDone={() => markDone(o.id)} onDelete={() => remove(o.id)}/>)}
        {orders.length === 0 && <div className="empty panel">No orders. Add one to get started.</div>}
      </div>

      {showNew && <NewOrderModal onClose={() => setShowNew(false)} onSubmit={add} dtfStock={data.warehouse.filter(w => w.kind === "dtf")}/>}
      {showBackdated && <BackdatedOrderModal onClose={() => setShowBackdated(false)} onSubmit={addBackdated}/>}
    </div>
  );
}

function BackdatedOrderModal({ onClose, onSubmit }) {
  const [client, setClient] = useState(CLIENTS[0]);
  const [date, setDate] = useState(today());
  const [product, setProduct] = useState("");
  const [freeSize, setFreeSize] = useState(false);
  const [sizes, setSizes] = useState({ XS:0, S:0, M:0, L:0, XL:0, XXL:0 });
  const [freeQty, setFreeQty] = useState(0);

  const total = freeSize ? freeQty : Object.values(sizes).reduce((a,b) => a+b, 0);
  const valid = !!product.trim() && total > 0;

  const submit = () => {
    const finalSizes = freeSize
      ? { FREE: freeQty }
      : sizes;
    const zeroDispatched = freeSize
      ? { FREE: 0 }
      : { XS:0, S:0, M:0, L:0, XL:0, XXL:0 };
    onSubmit({
      client,
      date,
      items: [{
        product: product.trim(),
        sizes: finalSizes,
        printed: { ...finalSizes },
        dispatched: zeroDispatched,
      }],
    });
  };

  return (
    <Modal onClose={onClose} title="BACKDATE A COMPLETED ORDER" wide>
      <div className="form">
        <div className="form-row">
          <label>DATE
            <input type="date" value={date} onChange={e => setDate(e.target.value)}/>
          </label>
          <label>CLIENT
            <select value={client} onChange={e => setClient(e.target.value)}>
              {CLIENTS.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label>PRODUCT
          <input value={product} onChange={e => setProduct(e.target.value)} placeholder="e.g. Mix Tees"/>
        </label>
        <div>
          <div className="mono-label">QUANTITY MODE</div>
          <div className="chip-group" style={{marginTop:6}}>
            <button type="button" className={`chip ${!freeSize ? "on" : ""}`} onClick={() => setFreeSize(false)}>SIZED</button>
            <button type="button" className={`chip ${freeSize ? "on" : ""}`} onClick={() => setFreeSize(true)}>FREE SIZE</button>
          </div>
        </div>
        {freeSize ? (
          <label>QTY (free size — no breakdown)
            <input type="number" min="0" value={freeQty}
              onChange={e => setFreeQty(parseInt(e.target.value) || 0)}
              placeholder="e.g. 238"/>
          </label>
        ) : (
          <div>
            <div className="mono-label">SIZES (already printed)</div>
            <div className="size-grid">
              {SIZES.map(sz => (
                <label key={sz} className="size-input">
                  <span>{sz}</span>
                  <input type="number" min="0" value={sizes[sz]}
                    onChange={e => setSizes({...sizes, [sz]: parseInt(e.target.value) || 0})}/>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="size-total">TOTAL: <strong>{total}</strong> pcs · saves as completed, no warehouse deduction</div>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={!valid} onClick={submit}>SAVE → {total} PCS</button>
      </div>
    </Modal>
  );
}

function OrderCard({ order, onDone, onDelete }) {
  const totals = order.items.reduce((acc, it) => {
    const t = Object.values(it.sizes).reduce((a,b) => a+b, 0);
    const p = Object.values(it.printed || {}).reduce((a,b) => a+b, 0);
    acc.total += t; acc.printed += p;
    return acc;
  }, { total: 0, printed: 0 });
  const printPct = totals.total ? Math.round((totals.printed / totals.total) * 100) : 0;
  const done = printPct === 100;

  return (
    <section className="panel order-card">
      <div className="order-head">
        <div>
          <div className="order-id-row">
            <span className="order-id">{order.id}</span>
            <ClientChip client={order.client}/>
            <span className={`status-pill ${done || order.status === "completed" ? "done" : "active"}`}>
              {done || order.status === "completed" ? "COMPLETED" : "IN PROGRESS"}
            </span>
          </div>
          <div className="order-meta">Received {order.date} · {order.items.length} products · {totals.total} pcs total</div>
        </div>
        <div className="order-head-right">
          <div className="order-progress">
            <div className="op-two-bars">
              <div className="op-bar-row">
                <span className="op-bar-label">PRINTED</span>
                <div className="op-bar"><div className="op-bar-fill op-bar-print" style={{width: `${printPct}%`}}></div></div>
                <span className="op-bar-num"><strong>{totals.printed}</strong>/{totals.total}</span>
              </div>
            </div>
          </div>
          <div className="order-actions">
            {!done && order.status !== "completed" && <button className="btn-ghost sm" onClick={onDone}>MARK DONE</button>}
            <button className="icon-btn" onClick={onDelete}><Trash2 size={12}/></button>
          </div>
        </div>
      </div>

      <div className="order-items">
        {order.items.map((it, i) => {
          const total = Object.values(it.sizes).reduce((a,b) => a+b, 0);
          const printed = Object.values(it.printed || {}).reduce((a,b) => a+b, 0);
          const activeSizes = [...SIZES, "FREE"].filter(sz => it.sizes[sz]);
          return (
            <div key={i} className="order-item">
              <div className="oi-head">
                <div className="oi-prod">{it.product}</div>
                <div className="oi-progress">
                  <span className="oi-prog-print">Printed {printed}/{total}</span>
                </div>
              </div>
              <div className="oi-sizes">
                {activeSizes.map(sz => {
                  const ordered = it.sizes[sz];
                  const printedSz = it.printed?.[sz] || 0;
                  const pendingPrint = ordered - printedSz;
                  const fullyDone = printedSz >= ordered;
                  return (
                    <div key={sz} className={`oi-size ${fullyDone ? "oi-done" : ""}`}>
                      <div className="oi-size-sz">{sz}</div>
                      <div className="oi-size-stack">
                        <div className="oi-row-r">
                          <span className="oi-k">ORD</span>
                          <span className="oi-v">{ordered}</span>
                        </div>
                        <div className="oi-row-r">
                          <span className="oi-k oi-k-print">PRT</span>
                          <span className="oi-v oi-v-print">{printedSz}</span>
                        </div>
                      </div>
                      {fullyDone ? (
                        <div className="oi-pending oi-check"><Check size={10}/> done</div>
                      ) : (
                        <div className="oi-pending-stack">
                          {pendingPrint > 0 && <div className="oi-pending-line">{pendingPrint} to print</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NewOrderModal({ onClose, onSubmit, dtfStock = [] }) {
  const [client, setClient] = useState("Culture Circle");
  const [date, setDate] = useState(today());
  const [items, setItems] = useState([{ product: "", sizes: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 } }]);

  const setItem = (i, field, val) => setItems(items.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  const setItemSize = (i, sz, val) => setItems(items.map((it, idx) => idx === i ? { ...it, sizes: { ...it.sizes, [sz]: parseInt(val) || 0 } } : it));
  const addItem = () => setItems([...items, { product: "", sizes: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 } }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const valid = items.every(it => it.product && Object.values(it.sizes).some(v => v > 0));
  const grandTotal = items.reduce((s, it) => s + Object.values(it.sizes).reduce((a,b) => a+b, 0), 0);

  // For each line item, figure out how many DTF prints are already in stock
  // for the same (client, product) — broken down by size.
  const dtfMatch = (it) => {
    const row = dtfStock.find(w => w.client === client && w.product && it.product && w.product.trim().toLowerCase() === it.product.trim().toLowerCase());
    if (!row) return null;
    const breakdown = SIZES.map(sz => {
      const need = it.sizes[sz] || 0;
      const have = row.sizes[sz] || 0;
      const covered = Math.min(need, have);
      const short = Math.max(0, need - have);
      return { sz, need, have, covered, short };
    }).filter(b => b.need > 0 || b.have > 0);
    const totalNeed = breakdown.reduce((s,b) => s + b.need, 0);
    const totalCovered = breakdown.reduce((s,b) => s + b.covered, 0);
    const totalShort = breakdown.reduce((s,b) => s + b.short, 0);
    return { row, breakdown, totalNeed, totalCovered, totalShort };
  };

  const submit = () => {
    const finalItems = items.map(it => ({ ...it, printed: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 }, dispatched: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 } }));
    onSubmit({ client, date, items: finalItems });
  };

  return (
    <Modal onClose={onClose} title="NEW ORDER" wide>
      <div className="form">
        <div className="form-row">
          <label>CLIENT
            <select value={client} onChange={e => setClient(e.target.value)}>
              {CLIENTS.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>DATE RECEIVED<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label>
        </div>
        <div className="items-list">
          {items.map((it, i) => {
            const m = dtfMatch(it);
            return (
            <div key={i} className="item-block">
              <div className="item-block-head">
                <div className="mono-label">PRODUCT #{i+1}</div>
                {items.length > 1 && <button className="icon-btn" onClick={() => removeItem(i)}><Trash2 size={11}/></button>}
              </div>
              <input value={it.product} onChange={e => setItem(i, "product", e.target.value)} placeholder="Product name (e.g. Off Supply Black CORE Tee)"/>
              <div className="size-grid">
                {SIZES.map(sz => (
                  <label key={sz} className="size-input">
                    <span>{sz}</span>
                    <input type="number" min="0" value={it.sizes[sz]} onChange={e => setItemSize(i, sz, e.target.value)}/>
                  </label>
                ))}
              </div>
              {m && m.totalNeed > 0 && m.totalCovered > 0 && (
                <div className={`dtf-hint ${m.totalShort === 0 ? "dtf-full" : "dtf-partial"}`}>
                  <Check size={12}/>
                  <div>
                    <strong>{m.totalCovered} of {m.totalNeed} prints already in stock</strong>
                    {m.totalShort === 0
                      ? " — no need to order any from vendor."
                      : ` — still need to print ${m.totalShort}.`}
                    <div className="dtf-breakdown mono">
                      {m.breakdown.filter(b => b.need > 0).map(b =>
                        <span key={b.sz}>{b.sz}: {b.covered}/{b.need}{b.short ? ` (short ${b.short})` : " ✓"}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );})}
          <button className="btn-ghost" onClick={addItem}><Plus size={12}/> ADD ANOTHER PRODUCT</button>
        </div>
      </div>
      <div className="modal-foot">
        <div className="grand-total">TOTAL · <strong>{grandTotal}</strong> pcs</div>
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={!valid} onClick={submit}>CREATE →</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE · DISPATCHES
// Log what was actually shipped to client warehouses
// Auto-increments order.dispatched counts
// ═══════════════════════════════════════════════════════════════════
function Dispatches({ data, update, refresh, profile, isAdmin, range }) {
  const [showNew, setShowNew] = useState(false);
  const [filterOrder, setFilterOrder] = useState("all");

  const dispatches = (data.dispatches || []).filter(d => {
    if (!inRange(d.date, range)) return false;
    if (filterOrder !== "all" && d.orderId !== filterOrder) return false;
    return true;
  }).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  const logDispatch = async (entry) => {
    const total = Object.values(entry.sizes).reduce((a, b) => a + b, 0);
    const full = { ...entry, id: `d${Date.now()}`, total };

    try {
      await insertRow("dispatches", full);

      // Increment order dispatched counts
      for (const o of data.orders) {
        if (o.id !== entry.orderId) continue;
        const newItems = o.items.map(it => {
          if (it.product !== entry.product) return it;
          const newDisp = { ...(it.dispatched || {}) };
          for (const sz of SIZES) {
            if (entry.sizes[sz]) newDisp[sz] = (newDisp[sz] || 0) + entry.sizes[sz];
          }
          return { ...it, dispatched: newDisp };
        });
        await updateRow("orders", o.id, { items: newItems });
      }

      refresh();
      setShowNew(false);
    } catch (e) { alert("Failed to log dispatch: " + e.message); }
  };

  const remove = async (id) => {
    if (!confirm("Delete this dispatch entry? Note: it won't reverse the order's dispatched count.")) return;
    try { await deleteRow("dispatches", id); refresh(); }
    catch (e) { alert("Failed: " + e.message); }
  };

  // Today's stats
  const t = today();
  const todayDispatches = (data.dispatches || []).filter(d => d.date === t);
  const todayTotal = todayDispatches.reduce((s, d) => s + (d.total || 0), 0);
  const warehousesCount = new Set(todayDispatches.map(d => d.warehouse)).size;

  const getOrder = (oid) => data.orders.find(o => o.id === oid);
  const getWorker = (wid) => data.workers.find(w => w.id === wid);

  // Orders eligible for dispatching (have printed stock not yet dispatched)
  const eligibleOrders = data.orders.filter(o => {
    return o.items.some(it => {
      const printed = Object.values(it.printed || {}).reduce((a, b) => a + b, 0);
      const dispatched = Object.values(it.dispatched || {}).reduce((a, b) => a + b, 0);
      return printed > dispatched;
    });
  });

  return (
    <div>
      <PageHeader title="Dispatches" sub="log shipments · auto-deducts from order pending"
        action={<button className="btn-primary" onClick={() => setShowNew(true)}><Plus size={13}/> NEW DISPATCH</button>}/>

      <div className="disp-summary">
        <div className="ds-card">
          <div className="ds-label">DISPATCHED TODAY</div>
          <div className="ds-val">{todayTotal}<span>pcs</span></div>
          <div className="ds-sub">{todayDispatches.length} shipments</div>
        </div>
        <div className="ds-card">
          <div className="ds-label">WAREHOUSES HIT</div>
          <div className="ds-val">{warehousesCount}<span>today</span></div>
          <div className="ds-sub">distinct destinations</div>
        </div>
        <div className="ds-card">
          <div className="ds-label">READY TO SHIP</div>
          <div className="ds-val">{
            data.orders.reduce((s, o) => s + o.items.reduce((ss, it) => {
              const printed = Object.values(it.printed || {}).reduce((a, b) => a + b, 0);
              const disp = Object.values(it.dispatched || {}).reduce((a, b) => a + b, 0);
              return ss + (printed - disp);
            }, 0), 0)
          }<span>pcs</span></div>
          <div className="ds-sub">printed, not yet shipped</div>
        </div>
      </div>

      <div className="filter-bar">
        <label className="mono-label">ORDER
          <select value={filterOrder} onChange={e => setFilterOrder(e.target.value)}>
            <option value="all">ALL ORDERS</option>
            {data.orders.map(o => <option key={o.id} value={o.id}>{o.id} · {o.client}</option>)}
          </select>
        </label>
        <button className="btn-ghost" onClick={() => { setFilterDate(""); setFilterOrder("all"); }}>CLEAR</button>
        <div className="filter-summary">
          <span>{dispatches.length} entries</span>
          <span className="dot-sep">·</span>
          <span><strong>{dispatches.reduce((s, d) => s + (d.total || 0), 0)}</strong> pcs</span>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>DISPATCH LOG</h2><div className="panel-sub">newest first</div></div></div>
        <div className="disp-table">
          <div className="disp-thead">
            <div>DATE · TIME</div><div>ORDER</div><div>PRODUCT</div><div>SIZES</div><div>TOTAL</div><div>WAREHOUSE</div><div>BY</div><div></div>
          </div>
          {dispatches.map(d => {
            const order = getOrder(d.orderId);
            const worker = getWorker(d.workerId);
            const sizesStr = SIZES.filter(sz => d.sizes[sz]).map(sz => `${sz}:${d.sizes[sz]}`).join(" · ");
            return (
              <div key={d.id} className="disp-row">
                <div>
                  <div className="mono disp-date">{d.date}</div>
                  <div className="mono dim disp-time">{d.time}</div>
                </div>
                <div>
                  <div className="mono disp-oid">{d.orderId}</div>
                  {order && <ClientChip client={order.client}/>}
                </div>
                <div className="disp-prod">{d.product}</div>
                <div className="mono dim disp-sizes">{sizesStr || "—"}</div>
                <div className="mono"><strong>{d.total}</strong></div>
                <div className="disp-wh">
                  <MapPin size={11}/>
                  <span>{d.warehouse}</span>
                </div>
                <div className="dim">{worker?.name || "—"}</div>
                <div><button className="icon-btn" onClick={() => remove(d.id)}><Trash2 size={12}/></button></div>
              </div>
            );
          })}
          {dispatches.length === 0 && <div className="empty">No dispatches logged for this filter.</div>}
        </div>
      </section>

      {showNew && <NewDispatchModal data={data} eligibleOrders={eligibleOrders} onClose={() => setShowNew(false)} onSubmit={logDispatch}/>}
    </div>
  );
}

function NewDispatchModal({ data, eligibleOrders, onClose, onSubmit }) {
  const [f, setF] = useState({
    date: today(),
    time: new Date().toTimeString().slice(0, 5),
    orderId: "",
    product: "",
    sizes: { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
    warehouse: "",
    workerId: "",
    note: "",
  });

  const selectedOrder = data.orders.find(o => o.id === f.orderId);
  const selectedItem = selectedOrder?.items.find(it => it.product === f.product);

  // Products available for this order (that have printed stock waiting to ship)
  const availableProducts = useMemo(() => {
    if (!selectedOrder) return [];
    return selectedOrder.items.filter(it => {
      const printed = Object.values(it.printed || {}).reduce((a, b) => a + b, 0);
      const disp = Object.values(it.dispatched || {}).reduce((a, b) => a + b, 0);
      return printed > disp;
    });
  }, [selectedOrder]);

  // For each size, max shippable = printed - already dispatched
  const maxPerSize = useMemo(() => {
    if (!selectedItem) return {};
    const m = {};
    for (const sz of SIZES) {
      const printed = selectedItem.printed?.[sz] || 0;
      const disp = selectedItem.dispatched?.[sz] || 0;
      m[sz] = Math.max(0, printed - disp);
    }
    return m;
  }, [selectedItem]);

  const total = Object.values(f.sizes).reduce((a, b) => a + b, 0);
  const exceedsStock = SIZES.some(sz => (f.sizes[sz] || 0) > (maxPerSize[sz] || 0));

  const valid = f.orderId && f.product && f.warehouse.trim() && total > 0 && !exceedsStock;

  return (
    <Modal onClose={onClose} title="NEW DISPATCH" wide>
      <div className="form">
        <div className="form-row">
          <label>DATE<input type="date" value={f.date} onChange={e => setF({...f, date: e.target.value})}/></label>
          <label>TIME<input type="time" value={f.time} onChange={e => setF({...f, time: e.target.value})}/></label>
        </div>

        <label>ORDER
          <select value={f.orderId} onChange={e => setF({...f, orderId: e.target.value, product: "", sizes: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 }})}>
            <option value="">— Select order —</option>
            {eligibleOrders.map(o => (
              <option key={o.id} value={o.id}>{o.id} · {o.client} · {o.date}</option>
            ))}
            {eligibleOrders.length === 0 && <option disabled>No orders with printed stock to ship</option>}
          </select>
        </label>

        {selectedOrder && (
          <label>PRODUCT
            <select value={f.product} onChange={e => setF({...f, product: e.target.value, sizes: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 }})}>
              <option value="">— Select product —</option>
              {availableProducts.map(it => {
                const printed = Object.values(it.printed || {}).reduce((a, b) => a + b, 0);
                const disp = Object.values(it.dispatched || {}).reduce((a, b) => a + b, 0);
                return (
                  <option key={it.product} value={it.product}>
                    {it.product} · {printed - disp} ready
                  </option>
                );
              })}
            </select>
          </label>
        )}

        {selectedItem && (
          <div>
            <div className="mono-label">QTY PER SIZE · <span className="disp-avail">available: {SIZES.filter(sz => maxPerSize[sz]).map(sz => `${sz}:${maxPerSize[sz]}`).join(" ")}</span></div>
            <div className="size-grid">
              {SIZES.map(sz => {
                const max = maxPerSize[sz] || 0;
                const val = f.sizes[sz] || 0;
                const over = val > max;
                return (
                  <label key={sz} className={`size-input ${max === 0 ? "size-disabled" : ""} ${over ? "size-over" : ""}`}>
                    <span>{sz}<span className="size-max">/{max}</span></span>
                    <input
                      type="number" min="0" max={max}
                      value={val}
                      disabled={max === 0}
                      onChange={e => setF({...f, sizes: {...f.sizes, [sz]: parseInt(e.target.value) || 0}})}
                    />
                  </label>
                );
              })}
            </div>
            <div className="size-total">TOTAL: <strong>{total}</strong> pcs</div>
            {exceedsStock && <div className="disp-warning"><AlertTriangle size={11}/> Quantity exceeds available printed stock.</div>}
          </div>
        )}

        <label>DESTINATION WAREHOUSE
          <input
            list="wh-list"
            value={f.warehouse}
            onChange={e => setF({...f, warehouse: e.target.value})}
            placeholder="e.g. CC Gurgaon Warehouse"
          />
          <datalist id="wh-list">
            {[...new Set((data.dispatches || []).map(d => d.warehouse).filter(Boolean))].map(w => <option key={w} value={w}/>)}
          </datalist>
        </label>

        <label>DISPATCHED BY (optional)
          <select value={f.workerId} onChange={e => setF({...f, workerId: e.target.value})}>
            <option value="">— Not specified —</option>
            {data.workers.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>

        <label>NOTE (optional)
          <input value={f.note} onChange={e => setF({...f, note: e.target.value})} placeholder="AWB number, courier, etc."/>
        </label>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={!valid} onClick={() => onSubmit(f)}>LOG DISPATCH → {total} PCS</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE · DAILY PRINT JOB
// Daily POD workflow: paste Culture Circle's CSV → roll up by product →
// match design links → generate printer PDF.
// ═══════════════════════════════════════════════════════════════════
function normalizeProductKey(name) {
  return (name || "").toLowerCase().replace(/\s+/g, " ").trim();
}
function normalizeSize(sz) {
  const s = (sz || "").toUpperCase().trim();
  if (s === "2XL") return "XXL";
  if (s === "3XL") return "XXXL";
  return s;
}
function parseDailyOrdersCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], errors: ["Empty input"] };
  // Skip header if it looks like one — works for 3-col (Order ID, Product, Size) or 2-col (Product, Size)
  const looksLikeHeader = /\bsize\b/i.test(lines[0]) && /\b(order|product|name|item|sku)\b/i.test(lines[0]);
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  const rows = []; const errors = [];
  for (const [i, line] of dataLines.entries()) {
    // Simple CSV split — handles quoted commas defensively
    const cells = line.match(/("([^"]*)"|[^,]+)/g)?.map(c => c.replace(/^"|"$/g, "").trim()) || [];
    let orderId, productName, size;
    if (cells.length >= 3) {
      [orderId, productName, size] = cells;
    } else if (cells.length === 2) {
      orderId = "";
      [productName, size] = cells;
    } else {
      errors.push(`Line ${i+1}: expected 2 or 3 columns, got ${cells.length}`);
      continue;
    }
    if (!productName || !size) { errors.push(`Line ${i+1}: missing product or size`); continue; }
    rows.push({ orderId, productName, size: normalizeSize(size), key: normalizeProductKey(productName) });
  }
  return { rows, errors };
}
function rollupRows(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.key)) {
      map.set(r.key, { key: r.key, productName: r.productName, sizes: {}, qty: 0, orderIds: [] });
    }
    const agg = map.get(r.key);
    agg.sizes[r.size] = (agg.sizes[r.size] || 0) + 1;
    agg.qty += 1;
    agg.orderIds.push(r.orderId);
  }
  return [...map.values()].sort((a,b) => b.qty - a.qty);
}

// Master design sheet — Culture Circle's canonical product → OneDrive link map.
// Updates daily on their side; we re-fetch on demand.
// We pull the .xlsx export (not .csv) because Google strips rich-text hyperlinks
// from CSV/JSON exports — only the binary xlsx format preserves them.
const MASTER_SHEET_ID = "1BkKOcF5gEt69MnKbso0crmAUU85rgOgFxn0HL1q3NZA";
const MASTER_SHEET_XLSX = `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/export?format=xlsx&gid=0`;
const MASTER_SHEET_VIEW = `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/edit?gid=0`;

function parseCsvLine(line) {
  // Handles quoted cells with commas inside
  const cells = [];
  let cur = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cells.push(cur); cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

// Parse the master sheet's xlsx export.
// Cell A = product name, Cell E = "Drive Link" — usually a rich-text hyperlink
// where the displayed text is the product name and `cell.l.Target` is the OneDrive URL.
async function parseMasterSheetXLSX(arrayBuffer) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(arrayBuffer, { type: "array", cellHTML: false, sheetStubs: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const ref = sheet["!ref"];
  if (!ref) return { byKey: new Map(), total: 0, withLinks: 0 };
  const range = XLSX.utils.decode_range(ref);
  const byKey = new Map();
  let withLinks = 0; let total = 0;
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cellA = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!cellA || !cellA.v) continue;
    const productName = String(cellA.v).trim();
    if (!productName) continue;
    const cellB = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
    const cellC = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
    const cellE = sheet[XLSX.utils.encode_cell({ r, c: 4 })];
    // Hyperlink target lives on `cell.l.Target`. Fall back to plain URL in cell value.
    let designLink = null;
    let placeholderText = null;
    if (cellE) {
      const target = cellE.l?.Target || cellE.l?.target;
      if (target && /^https?:\/\//i.test(target)) {
        designLink = target;
      } else if (cellE.v && /^https?:\/\//i.test(String(cellE.v))) {
        designLink = String(cellE.v).trim();
      } else if (cellE.v) {
        placeholderText = String(cellE.v).trim();
      }
    }
    const key = normalizeProductKey(productName);
    byKey.set(key, {
      productName,
      skuCode: cellB?.v ? String(cellB.v).trim() : "",
      brand: cellC?.v ? String(cellC.v).trim() : "",
      designLink,
      placeholderText,
    });
    total++;
    if (designLink) withLinks++;
  }
  return { byKey, total, withLinks };
}

function DailyOrders({ data, refresh, profile }) {
  const [csvText, setCsvText] = useState("");
  const [parseResult, setParseResult] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [batchDate, setBatchDate] = useState(today());
  const [client, setClient] = useState("Culture Circle");
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Master design sheet (Google Sheet, fetched fresh on mount + refresh)
  const [masterSheet, setMasterSheet] = useState(null); // { byKey, total, withLinks }
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState(null);
  const [sheetSyncedAt, setSheetSyncedAt] = useState(null);

  const loadMasterSheet = useCallback(async () => {
    setSheetLoading(true); setSheetError(null);
    try {
      // Cache-bust so we always get the fresh sheet, not a CDN copy
      const r = await fetch(`${MASTER_SHEET_XLSX}&_=${Date.now()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = await r.arrayBuffer();
      const parsed = await parseMasterSheetXLSX(buf);
      setMasterSheet(parsed);
      setSheetSyncedAt(new Date());
    } catch (e) {
      console.error("Master sheet fetch failed:", e);
      setSheetError(e.message);
    } finally { setSheetLoading(false); }
  }, []);

  useEffect(() => { loadMasterSheet(); }, [loadMasterSheet]);

  // designByKey: lookup matching the daily orders against the master sheet
  const designByKey = useMemo(() => {
    const m = {};
    if (masterSheet) {
      for (const [key, val] of masterSheet.byKey) {
        m[key] = {
          product_key: key,
          product_name: val.productName,
          sku_code: val.skuCode,
          brand: val.brand,
          design_link: val.designLink,
          placeholderText: val.placeholderText,
        };
      }
    }
    return m;
  }, [masterSheet]);

  // DTF inventory by product_key (size-agnostic for matching, but we'll subtract per-size below)
  const dtfStock = useMemo(() => {
    const m = {};
    for (const w of (data.warehouse || [])) {
      if (w.kind !== "dtf") continue;
      const k = normalizeProductKey(w.product);
      if (!m[k]) m[k] = { sizes: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 }, total: 0, row: w };
      for (const sz of Object.keys(w.sizes || {})) {
        m[k].sizes[sz] = (m[k].sizes[sz] || 0) + (w.sizes[sz] || 0);
        m[k].total += (w.sizes[sz] || 0);
      }
    }
    return m;
  }, [data.warehouse]);

  const rollup = parseResult ? rollupRows(parseResult.rows) : [];
  // Compute net-to-print per product after subtracting DTF stock
  const enriched = rollup.map(r => {
    const stock = dtfStock[r.key];
    const netSizes = {};
    let netTotal = 0;
    for (const sz of Object.keys(r.sizes)) {
      const need = r.sizes[sz];
      const have = stock?.sizes?.[sz] || 0;
      const net = Math.max(0, need - have);
      netSizes[sz] = net;
      netTotal += net;
    }
    const design = designByKey[r.key];
    return { ...r, netSizes, netTotal, fromStock: r.qty - netTotal, design };
  });

  const totalGross = enriched.reduce((s, r) => s + r.qty, 0);
  const totalNet   = enriched.reduce((s, r) => s + r.netTotal, 0);
  const unmatched  = enriched.filter(r => !r.design || !r.design.design_link);
  const stockSaved = totalGross - totalNet;

  const handleParse = () => {
    const result = parseDailyOrdersCSV(csvText);
    setParseResult(result);
  };

  const generatePrintXLSX = async () => {
    if (!enriched.length) { alert("Parse a CSV first."); return; }
    if (unmatched.length) {
      if (!confirm(`${unmatched.length} product(s) have no design link. Continue anyway?`)) return;
    }
    setPdfBusy(true);
    try {
      // Excel hyperlinks via xlsx's cell `l.Target` — opens with a single
      // click in Excel, Numbers, Google Sheets, and any spreadsheet viewer.
      const XLSX = await import("xlsx");
      const printable = enriched.filter(r => r.netTotal > 0);

      // Layout (0-indexed rows): 0 title, 1 subtitle, 2 blank, 3 headers,
      // 4..(4+N-1) data, 4+N total, 4+N+1 blank, 4+N+2 footer 1, [4+N+3 footer 2].
      const aoa = [
        [`PRINT JOB · ${batchDate}`],
        [`Client: ${client} · ${printable.length} designs · ${totalNet} prints needed`],
        [],
        ["PRODUCT", "QTY", "DESIGN FILE"],
      ];
      for (const r of printable) {
        aoa.push([
          r.productName,
          r.netTotal,
          r.design?.design_link || "— missing —",
        ]);
      }
      aoa.push(["TOTAL", totalNet, ""]);
      aoa.push([]);
      aoa.push([`Generated ${new Date().toLocaleString("en-IN")}.`]);
      if (stockSaved > 0) {
        aoa.push([`${stockSaved} prints satisfied from existing DTF inventory and excluded from this job.`]);
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // Real spreadsheet hyperlinks on the design-file cells.
      const DATA_START_ROW = 4; // 0-indexed
      for (let i = 0; i < printable.length; i++) {
        const r = printable[i];
        if (r.design?.design_link) {
          const cellRef = XLSX.utils.encode_cell({ r: DATA_START_ROW + i, c: 2 });
          if (ws[cellRef]) {
            ws[cellRef].l = { Target: r.design.design_link, Tooltip: "Open design file" };
          }
        }
      }

      ws["!cols"] = [
        { wch: 50 }, // PRODUCT
        { wch: 8 },  // QTY
        { wch: 70 }, // DESIGN FILE
      ];
      // Merge title + subtitle + footer rows across the 3 columns.
      const lastFooterRow = 4 + printable.length + (stockSaved > 0 ? 3 : 2);
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
        { s: { r: 4 + printable.length + 2, c: 0 }, e: { r: 4 + printable.length + 2, c: 2 } },
        ...(stockSaved > 0 ? [{ s: { r: lastFooterRow, c: 0 }, e: { r: lastFooterRow, c: 2 } }] : []),
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Print Job");
      XLSX.writeFile(wb, `printjob-${client.toLowerCase().replace(/\s+/g, "-")}-${batchDate}.xlsx`);
    } catch (e) { alert("XLSX failed: " + (e?.message || e)); }
    finally { setPdfBusy(false); }
  };

  const saveBatch = async () => {
    if (!enriched.length) { alert("Parse a CSV first."); return; }
    setLoading(true);
    try {
      const batchId = `batch-${client.toLowerCase().replace(/\s+/g, "-")}-${batchDate}-${Date.now().toString().slice(-4)}`;
      const { error: bErr } = await supabase.from("daily_batches").insert({
        id: batchId, batch_date: batchDate, client, status: "intake", notes: `${parseResult.rows.length} line items, ${enriched.length} unique products`,
      });
      if (bErr) throw bErr;
      // One row per (product × size)
      const lines = [];
      for (const r of enriched) {
        for (const sz of Object.keys(r.sizes)) {
          const qty = r.sizes[sz];
          if (!qty) continue;
          lines.push({
            id: `bl-${batchId}-${crypto.randomUUID()}`,
            batch_id: batchId,
            product_name: r.productName,
            size: sz,
            qty_ordered: qty,
            qty_printed: 0,
            order_ids: parseResult.rows.filter(x => x.key === r.key && x.size === sz).map(x => x.orderId).filter(Boolean),
          });
        }
      }
      const { error: lErr } = await supabase.from("batch_lines").insert(lines);
      if (lErr) throw lErr;
      // Deduct from DTF inventory by netting
      for (const r of enriched) {
        const stock = dtfStock[r.key];
        if (!stock) continue;
        const newSizes = { ...stock.row.sizes };
        for (const sz of Object.keys(r.sizes)) {
          const need = r.sizes[sz];
          const have = stock.sizes[sz] || 0;
          const use = Math.min(need, have);
          newSizes[sz] = (newSizes[sz] || 0) - use;
        }
        await supabase.from("warehouse").update({ sizes: newSizes }).eq("id", stock.row.id);
      }

      // Mirror the batch into the Orders page as a single big order.
      // Workers log production against this order via the existing flow.
      // Sizes = total ordered; Printed = pre-filled with what we already pulled from DTF stock,
      // so worker only sees the real "to print" remainder.
      const ZERO_SIZES = { XS:0, S:0, M:0, L:0, XL:0, XXL:0, XXXL:0 };
      const items = enriched.map(r => {
        const sizes = { ...ZERO_SIZES, ...r.sizes };
        const printed = { ...ZERO_SIZES };
        for (const sz of Object.keys(sizes)) {
          const ordered = sizes[sz] || 0;
          const net = r.netSizes[sz] || 0;
          printed[sz] = Math.max(0, ordered - net); // covered-from-stock
        }
        return {
          product: r.productName,
          sizes,
          printed,
          dispatched: { ...ZERO_SIZES }, // schema-only, dispatches removed
        };
      });
      const orderId = `ORD-CC-BATCH-${batchDate}-${Date.now().toString().slice(-4)}`;
      const { error: oErr } = await supabase.from("orders").insert({
        id: orderId,
        client,
        date: batchDate,
        items,
        status: "in_progress",
      });
      if (oErr) throw oErr;

      alert(`Batch saved.\n\n• ${lines.length} batch lines\n• Order ${orderId} created on Orders page\n${stockSaved > 0 ? `• ${stockSaved} prints reserved from DTF stock` : ""}`);
      setCsvText("");
      setParseResult(null);
      setUploadedFile(null);
      refresh();
    } catch (e) { alert("Save failed: " + (e?.message || e)); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <PageHeader title="Daily Print Job" sub="POD workflow · paste orders → roll up → send to printer"
        action={
          <div style={{display:"flex", gap:8}}>
            <button className="btn-ghost" onClick={generatePrintXLSX} disabled={pdfBusy || !enriched.length}>
              <ClipboardList size={13}/> {pdfBusy ? "GENERATING…" : "DOWNLOAD PRINT XLSX"}
            </button>
            <button className="btn-primary" onClick={saveBatch} disabled={loading || !enriched.length}>
              <Check size={13}/> SAVE BATCH
            </button>
          </div>
        }/>

      <div className="master-sync">
        <div className="master-sync-info">
          <Activity size={13} className={sheetLoading ? "spinning" : ""} style={{ color: sheetError ? "var(--ink-red)" : (masterSheet ? "var(--ink-green)" : "var(--ink-amber)") }}/>
          <div>
            <div className="master-sync-title">
              MASTER DESIGN SHEET {sheetLoading ? "· syncing…" : sheetError ? "· sync failed" : ""}
            </div>
            <div className="master-sync-sub">
              {masterSheet ? (
                <>
                  <strong>{masterSheet.total}</strong> products · <strong>{masterSheet.withLinks}</strong> with valid OneDrive links
                  {sheetSyncedAt && <> · synced {sheetSyncedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</>}
                </>
              ) : sheetError ? <span style={{color: "var(--ink-red)"}}>{sheetError}</span> : "fetching from Google Sheet…"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <a className="btn-ghost sm" href={MASTER_SHEET_VIEW} target="_blank" rel="noreferrer">OPEN SHEET</a>
          <button className="btn-ghost sm" onClick={loadMasterSheet} disabled={sheetLoading}>
            {sheetLoading ? "…" : "REFRESH"}
          </button>
        </div>
      </div>

      <div className="filter-bar" style={{flexWrap: "wrap"}}>
        <label className="mono-label">CLIENT
          <select value={client} onChange={e => setClient(e.target.value)}>
            {CLIENTS.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="mono-label">BATCH DATE
          <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)}/>
        </label>
        <div className="filter-summary">
          {parseResult && <><span>{parseResult.rows.length} rows parsed</span><span className="dot-sep">·</span><span><strong>{enriched.length}</strong> unique</span></>}
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div><h2>STEP 1 · UPLOAD ORDERS CSV</h2><div className="panel-sub">columns: Order ID, Product Name, Size · or just Product Name, Size · header row OK · upload from desktop or phone</div></div>
        </div>
        <div style={{padding: 14}}>
          <label className="upload-drop" htmlFor="dop-file">
            <input
              id="dop-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              style={{ display: "none" }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploadedFile({ name: f.name, size: f.size });
                try {
                  const txt = await f.text();
                  setCsvText(txt);
                  // Auto-parse the moment file is uploaded
                  const result = parseDailyOrdersCSV(txt);
                  setParseResult(result);
                } catch (err) { alert("Could not read file: " + err.message); }
                finally { e.target.value = ""; } // allow re-uploading same file
              }}
            />
            <div className="upload-drop-inner">
              <Plus size={18}/>
              <div className="upload-title">{uploadedFile ? "REPLACE FILE" : "UPLOAD ORDERS CSV"}</div>
              <div className="upload-sub">{uploadedFile
                ? `${uploadedFile.name} · ${(uploadedFile.size / 1024).toFixed(1)} KB · click to replace`
                : "tap to choose a .csv file from your device"}</div>
            </div>
          </label>

          <details style={{ marginTop: 12 }}>
            <summary style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.15em", cursor: "pointer", userSelect: "none" }}>
              OR PASTE CSV TEXT
            </summary>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={"Order ID,Product Name,Size\n26031017430996,Cactus Jack Tshirt - White,S\n..."}
              style={{
                width: "100%", minHeight: 120, padding: 12, marginTop: 10,
                background: "var(--bg-input)", border: "1px solid var(--border)",
                color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12,
                outline: "none", resize: "vertical",
              }}
            />
            <div style={{display:"flex", gap: 8, marginTop: 10, flexWrap: "wrap"}}>
              <button className="btn-primary" onClick={handleParse} disabled={!csvText.trim()}>
                <Activity size={12}/> PARSE & ROLL UP
              </button>
              {csvText && (
                <button className="btn-ghost" onClick={() => { setCsvText(""); setParseResult(null); setUploadedFile(null); }}>
                  CLEAR
                </button>
              )}
            </div>
          </details>

          {parseResult && (
            <div style={{ marginTop: 12, fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
              <span style={{ color: "var(--ink-green)" }}>✓ Parsed {parseResult.rows.length} line{parseResult.rows.length === 1 ? "" : "s"}</span>
              {parseResult.errors?.length > 0 && (
                <span style={{ color: "var(--ink-amber)", marginLeft: 12 }}>
                  <AlertTriangle size={10}/> {parseResult.errors.length} skipped (see browser console)
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {enriched.length > 0 && (
        <>
          <section className="panel" style={{marginTop: 14}}>
            <div className="panel-head">
              <div>
                <h2>STEP 2 · PRINT JOB · ROLLED UP</h2>
                <div className="panel-sub">
                  {totalGross} pcs total · {stockSaved > 0 ? `${stockSaved} from DTF stock · ${totalNet} to print` : `${totalNet} to print`}
                  {unmatched.length > 0 && <span style={{color: "var(--ink-amber)"}}> · {unmatched.length} missing design link</span>}
                </div>
              </div>
            </div>
            <div style={{padding: 0, overflowX: "auto"}}>
              <table className="pod-table">
                <thead>
                  <tr>
                    <th>PRODUCT</th>
                    <th>SIZES (NEED)</th>
                    <th>FROM STOCK</th>
                    <th>TO PRINT</th>
                    <th>DESIGN LINK</th>
                  </tr>
                </thead>
                <tbody>
                  {enriched.map(r => (
                    <tr key={r.key}>
                      <td className="pod-prod">
                        <div>{r.productName}</div>
                        <div className="pod-orderids">{r.orderIds.length} order id{r.orderIds.length === 1 ? "" : "s"}</div>
                      </td>
                      <td className="mono pod-sizes">
                        {SIZES.filter(sz => r.sizes[sz]).map(sz => <span key={sz}>{sz}:{r.sizes[sz]}</span>)}
                      </td>
                      <td className="mono" style={{color: r.fromStock > 0 ? "var(--ink-green)" : "var(--text-dim)"}}>
                        {r.fromStock || "—"}
                      </td>
                      <td className="mono"><strong>{r.netTotal}</strong></td>
                      <td className="pod-link">
                        {r.design?.design_link ? (
                          <a href={r.design.design_link} target="_blank" rel="noreferrer" style={{color: "var(--ink-cyan)", fontSize: 11, wordBreak: "break-all"}}>
                            {r.design.design_link.length > 50 ? r.design.design_link.slice(0, 50) + "…" : r.design.design_link}
                          </a>
                        ) : r.design?.placeholderText ? (
                          <span style={{color: "var(--ink-amber)", fontSize: 11}} title={r.design.placeholderText}>
                            ⚠ no link in master sheet
                          </span>
                        ) : (
                          <a href={MASTER_SHEET_VIEW} target="_blank" rel="noreferrer" style={{color: "var(--ink-red)", fontSize: 11}}>
                            ✗ not in master sheet — add it
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE 5 · WAREHOUSE
// ═══════════════════════════════════════════════════════════════════
function Warehouse_({ data, update, refresh, isAdmin }) {
  const [showAdd, setShowAdd] = useState(null); // null | "apparel" | "dtf"
  const [editing, setEditing] = useState(null);
  const [filterClient, setFilterClient] = useState("all");
  const [viewKind, setViewKind] = useState("apparel"); // "apparel" | "dtf"

  const visibleRows = data.warehouse.filter(w =>
    (w.kind || "apparel") === viewKind &&
    (filterClient === "all" || w.client === filterClient)
  );

  const add = async (item) => {
    try {
      await insertRow("warehouse", { ...item, id: `inv${Date.now()}` });
      refresh(); setShowAdd(null);
    } catch (e) { alert("Failed: " + e.message); }
  };

  const saveEdit = async (updated) => {
    try {
      await updateRow("warehouse", updated.id, { client: updated.client, product: updated.product, sizes: updated.sizes, kind: updated.kind });
      refresh(); setEditing(null);
    } catch (e) { alert("Failed: " + e.message); }
  };

  const remove = async (id) => {
    if (!confirm("Remove this item from warehouse?")) return;
    try { await deleteRow("warehouse", id); refresh(); }
    catch (e) { alert("Failed: " + e.message); }
  };

  const totalByClientAndKind = (c, kind) =>
    data.warehouse.filter(w => w.client === c && (w.kind || "apparel") === kind)
      .reduce((s, w) => s + Object.values(w.sizes).reduce((a,b) => a+b, 0), 0);

  const sectionTitle = viewKind === "dtf" ? "DTF PRINTS INVENTORY" : "APPAREL INVENTORY";
  const sectionSub = viewKind === "dtf" ? "pre-printed DTF transfers ready to apply" : "plain tees received from brands";
  const emptyMsg = viewKind === "dtf" ? "No DTF prints in stock." : "No apparel in stock.";

  return (
    <div>
      <PageHeader title="Warehouse" sub="apparel stock · pre-printed DTF inventory"
        action={<button className="btn-primary" onClick={() => setShowAdd(viewKind)}><Plus size={13}/> ADD {viewKind === "dtf" ? "DTF PRINTS" : "APPAREL"}</button>}/>

      <div className="wh-summary">
        {CLIENTS.map(c => (
          <div key={c} className="wh-sum-card">
            <div className="wh-sum-label">{c.toUpperCase()}</div>
            <div className="wh-sum-split">
              <div><span className="wh-split-lbl">APPAREL</span><strong>{totalByClientAndKind(c, "apparel")}</strong></div>
              <div><span className="wh-split-lbl">DTF PRINTS</span><strong>{totalByClientAndKind(c, "dtf")}</strong></div>
            </div>
          </div>
        ))}
      </div>

      <div className="filter-bar wh-filter-bar">
        <div className="wh-kind-toggle">
          <button className={`wh-kind-btn ${viewKind === "apparel" ? "on" : ""}`} onClick={() => setViewKind("apparel")}>
            <Shirt size={12}/> APPAREL
          </button>
          <button className={`wh-kind-btn ${viewKind === "dtf" ? "on" : ""}`} onClick={() => setViewKind("dtf")}>
            <Printer size={12}/> DTF PRINTS
          </button>
        </div>
        <div className="chip-group">
          <button className={`chip ${filterClient === "all" ? "on" : ""}`} onClick={() => setFilterClient("all")}>ALL</button>
          {CLIENTS.map(c => (
            <button key={c} className={`chip ${filterClient === c ? "on" : ""}`} onClick={() => setFilterClient(c)}>{c.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <section className="panel wh-section">
        <div className="panel-head">
          <div>
            <h2>{sectionTitle}</h2>
            <div className="panel-sub">{sectionSub} · {visibleRows.length} lines</div>
          </div>
        </div>
        <div className="wh-table">
          <div className="wh-thead">
            <div>CLIENT</div><div>PRODUCT</div>
            {SIZES.map(sz => <div key={sz} className="wh-sz">{sz}</div>)}
            <div>TOTAL</div><div></div>
          </div>
          {visibleRows.map(w => {
            const total = Object.values(w.sizes).reduce((a,b) => a+b, 0);
            const low = total < 50;
            return (
              <div key={w.id} className={`wh-row ${low ? "wh-low" : ""}`}>
                <div><ClientChip client={w.client}/></div>
                <div className="wh-prod">{w.product}</div>
                {SIZES.map(sz => <div key={sz} className="mono size-cell">{w.sizes[sz] || "—"}</div>)}
                <div className="mono"><strong>{total}</strong></div>
                <div className="wh-actions">
                  <button className="icon-btn" onClick={() => setEditing(w)}><Edit3 size={12}/></button>
                  <button className="icon-btn" onClick={() => remove(w.id)}><Trash2 size={12}/></button>
                </div>
              </div>
            );
          })}
          {visibleRows.length === 0 && <div className="empty">{emptyMsg}</div>}
        </div>
      </section>

      {showAdd && <WarehouseModal kind={showAdd} onClose={() => setShowAdd(null)} onSubmit={add}/>}
      {editing && <WarehouseModal initial={editing} onClose={() => setEditing(null)} onSubmit={saveEdit}/>}
    </div>
  );
}

function WarehouseModal({ initial, kind: kindProp, onClose, onSubmit }) {
  const [f, setF] = useState(initial || { client: "Culture Circle", product: "", sizes: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 }, kind: kindProp || "apparel" });
  const total = Object.values(f.sizes).reduce((a,b) => a+b, 0);
  const isDtf = f.kind === "dtf";
  const unit = isDtf ? "prints" : "pcs";
  return (
    <Modal onClose={onClose} title={initial ? "EDIT STOCK" : (isDtf ? "ADD DTF PRINTS" : "ADD APPAREL STOCK")} wide>
      <div className="form">
        <div className="form-row">
          <label>TYPE
            <select value={f.kind} onChange={e => setF({...f, kind: e.target.value})}>
              <option value="apparel">Apparel (plain tees)</option>
              <option value="dtf">DTF Prints</option>
            </select>
          </label>
          <label>CLIENT
            <select value={f.client} onChange={e => setF({...f, client: e.target.value})}>{CLIENTS.map(c => <option key={c}>{c}</option>)}</select>
          </label>
        </div>
        <label>PRODUCT<input value={f.product} onChange={e => setF({...f, product: e.target.value})} placeholder={isDtf ? "e.g. Red Staple Tee — Chest Design A" : "e.g. Hashway Core Polo Black"}/></label>
        <div>
          <div className="mono-label">{isDtf ? "PRINTS IN STOCK" : "QUANTITIES IN STOCK"}</div>
          <div className="size-grid">
            {SIZES.map(sz => (
              <label key={sz} className="size-input">
                <span>{sz}</span>
                <input type="number" min="0" value={f.sizes[sz]} onChange={e => setF({...f, sizes: { ...f.sizes, [sz]: parseInt(e.target.value) || 0 }})}/>
              </label>
            ))}
          </div>
          <div className="size-total">TOTAL: <strong>{total}</strong> {unit}</div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={!f.product} onClick={() => onSubmit(f)}>{initial ? "SAVE →" : "ADD →"}</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE · PAYROLL
// Monthly salary + OT tracking for salary day on the 1st
// ═══════════════════════════════════════════════════════════════════
function Payroll({ data, update, refresh }) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [expandedWorker, setExpandedWorker] = useState(null);
  const [paidOpen, setPaidOpen] = useState(null); // workerId for which "mark paid" is open

  // Build per-worker payroll summary for selected month
  const payrollData = useMemo(() => {
    return data.workers.filter(w => w.active).map(w => {
      const monthRecords = data.attendance.filter(r =>
        r.workerId === w.id &&
        r.date.startsWith(selectedMonth) &&
        r.punchOut
      );

      let totalOtMin = 0;
      let daysPresent = new Set();
      let sundayMin = 0;
      let weekdayOtMin = 0;
      const dayLog = [];

      for (const r of monthRecords) {
        const otMin = otMinutesForRecord(r);
        totalOtMin += otMin;
        daysPresent.add(r.date);

        const [y, mo, d] = r.date.split("-").map(Number);
        const isSunday = new Date(y, mo - 1, d).getDay() === 0;
        if (isSunday) sundayMin += otMin;
        else weekdayOtMin += otMin;

        if (otMin > 0) {
          dayLog.push({
            date: r.date,
            punchIn: r.punchIn,
            punchOut: r.punchOut,
            otMin,
            isSunday,
            amount: Math.round((otMin / 60) * OT_RATE_PER_HOUR),
          });
        }
      }

      dayLog.sort((a, b) => b.date.localeCompare(a.date));

      const otAmount = Math.round((totalOtMin / 60) * OT_RATE_PER_HOUR);
      const base = w.monthlySalary || 0;

      return {
        worker: w,
        daysPresent: daysPresent.size,
        totalOtMin,
        sundayMin,
        weekdayOtMin,
        otAmount,
        base,
        payable: base + otAmount,
        dayLog,
      };
    });
  }, [data.workers, data.attendance, selectedMonth]);

  const totals = useMemo(() => {
    return payrollData.reduce((acc, p) => {
      acc.base += p.base;
      acc.ot += p.otAmount;
      acc.payable += p.payable;
      acc.otMin += p.totalOtMin;
      return acc;
    }, { base: 0, ot: 0, payable: 0, otMin: 0 });
  }, [payrollData]);

  // Generate month options — last 12 months + current
  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      opts.push({ key, label });
    }
    return opts;
  }, []);

  const markPaid = async (worker, payable) => {
    const entry = {
      id: `e${Date.now()}`,
      date: today(),
      category: "Salaries",
      label: `${worker.name} · ${selectedMonth} salary`,
      amount: payable,
      note: `Base ₹${worker.monthlySalary} + OT`,
    };
    try {
      await insertRow("expenses", entry);
      refresh();
      setPaidOpen(null);
    } catch (e) { alert("Failed to mark paid: " + e.message); }
  };

  const [y, m] = selectedMonth.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const isCurrentMonth = selectedMonth === currentMonthKey();

  return (
    <div>
      <PageHeader title="Payroll" sub={`salary + overtime · ₹${OT_RATE_PER_HOUR}/hr OT · shift ${10}:00–${SHIFT_END_HOUR}:00`}/>

      <div className="filter-bar">
        <label className="mono-label">MONTH
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
            {monthOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <div className="filter-summary">
          <span>{payrollData.length} workers</span>
          <span className="dot-sep">·</span>
          <span><strong>{formatHM(totals.otMin)}</strong> total OT</span>
        </div>
      </div>

      <div className="payroll-totals">
        <div className="pt-card">
          <div className="pt-label">BASE PAYABLE</div>
          <div className="pt-val">₹{totals.base.toLocaleString("en-IN")}</div>
          <div className="pt-sub">sum of monthly salaries</div>
        </div>
        <div className="pt-card">
          <div className="pt-label">OT PAYABLE</div>
          <div className="pt-val">₹{totals.ot.toLocaleString("en-IN")}</div>
          <div className="pt-sub">{formatHM(totals.otMin)} × ₹{OT_RATE_PER_HOUR}/hr</div>
        </div>
        <div className="pt-card pt-total">
          <div className="pt-label">TOTAL PAYABLE · {monthLabel.toUpperCase()}</div>
          <div className="pt-val">₹{totals.payable.toLocaleString("en-IN")}</div>
          <div className="pt-sub">{isCurrentMonth ? "month in progress" : "final"}</div>
        </div>
      </div>

      <div className="payroll-rules">
        <AlertTriangle size={12}/>
        <span>
          <strong>Rules:</strong> Weekdays — minutes past 19:00 count as OT. Sundays — every minute worked counts as OT. OT rate = ₹{OT_RATE_PER_HOUR}/hour, prorated to the minute.
          {" "}Absences are <strong>not</strong> auto-deducted — adjust base manually on salary day if needed.
        </span>
      </div>

      <div className="payroll-list">
        {payrollData.map(p => {
          const expanded = expandedWorker === p.worker.id;
          const paying = paidOpen === p.worker.id;
          return (
            <section key={p.worker.id} className="panel payroll-card">
              <div className="pc-head">
                <div className="pc-worker">
                  <div className="pc-avatar">{p.worker.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div className="pc-name">{p.worker.name}</div>
                    <div className="pc-role">{p.worker.role}</div>
                  </div>
                </div>

                <div className="pc-stats">
                  <div className="pc-stat">
                    <div className="pc-stat-label">DAYS PRESENT</div>
                    <div className="pc-stat-val">{p.daysPresent}</div>
                  </div>
                  <div className="pc-stat">
                    <div className="pc-stat-label">OT HOURS</div>
                    <div className="pc-stat-val">{formatHM(p.totalOtMin)}</div>
                    {p.sundayMin > 0 && <div className="pc-stat-sub">Sun: {formatHM(p.sundayMin)}</div>}
                  </div>
                  <div className="pc-stat">
                    <div className="pc-stat-label">BASE</div>
                    <div className="pc-stat-val">₹{p.base.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="pc-stat">
                    <div className="pc-stat-label">+ OT</div>
                    <div className="pc-stat-val pc-ot">₹{p.otAmount.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="pc-stat pc-payable">
                    <div className="pc-stat-label">PAYABLE</div>
                    <div className="pc-stat-val pc-payable-val">₹{p.payable.toLocaleString("en-IN")}</div>
                  </div>
                </div>

                <div className="pc-actions">
                  <button className="btn-ghost sm" onClick={() => setExpandedWorker(expanded ? null : p.worker.id)}>
                    {expanded ? "HIDE" : "OT LOG"} {expanded ? "↑" : "↓"}
                  </button>
                  <button className="btn-primary sm" onClick={() => setPaidOpen(p.worker.id)}>
                    <Check size={12}/> MARK PAID
                  </button>
                </div>
              </div>

              {paying && (
                <div className="pc-confirm">
                  <div>
                    Log <strong>₹{p.payable.toLocaleString("en-IN")}</strong> salary payment for {p.worker.name} ({monthLabel})? This adds it to P&L expenses.
                  </div>
                  <div className="pc-confirm-actions">
                    <button className="btn-ghost sm" onClick={() => setPaidOpen(null)}>CANCEL</button>
                    <button className="btn-primary sm" onClick={() => markPaid(p.worker, p.payable)}>CONFIRM →</button>
                  </div>
                </div>
              )}

              {expanded && (
                <div className="pc-log">
                  <div className="pc-log-head">OT BREAKDOWN · {monthLabel}</div>
                  {p.dayLog.length === 0 ? (
                    <div className="empty" style={{padding: "20px", fontSize: "10px"}}>No overtime this month.</div>
                  ) : (
                    <div className="pc-log-table">
                      <div className="pc-log-thead">
                        <div>DATE</div><div>DAY</div><div>IN</div><div>OUT</div><div>OT</div><div>AMOUNT</div>
                      </div>
                      {p.dayLog.map((d, i) => {
                        const [yy, mm, dd] = d.date.split("-").map(Number);
                        const dayName = new Date(yy, mm - 1, dd).toLocaleDateString("en-IN", { weekday: "short" });
                        return (
                          <div key={i} className="pc-log-row">
                            <div className="mono">{d.date}</div>
                            <div className={d.isSunday ? "sun-tag" : "mono dim"}>{dayName}{d.isSunday && " · ALL OT"}</div>
                            <div className="mono">{d.punchIn}</div>
                            <div className="mono">{d.punchOut}</div>
                            <div className="mono"><strong>+{formatHM(d.otMin)}</strong></div>
                            <div className="mono pc-log-amt">₹{d.amount.toLocaleString("en-IN")}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
        {payrollData.length === 0 && <div className="empty panel">No active workers.</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE 6 · P&L
// ═══════════════════════════════════════════════════════════════════
function PnL({ data, update, refresh, range }) {
  const [showExp, setShowExp] = useState(false);

  const exp = data.expenses.filter(e => inRange(e.date, range));
  // Revenue is derived from INVOICES RAISED, but counted NET OF GST.
  // GST is a pass-through liability — it's not income, it's owed to the government.
  // Each invoice contributes:
  //   netInvoiced  = subtotal           (revenue pre-tax)
  //   netReceived  = paid × subtotal/total   (cash received, GST stripped out)
  //   gstReceived  = paid × tax/total        (GST portion of cash received → liability)
  const rev = (data.invoices || [])
    .filter(inv => inRange(inv.issueDate, range))
    .map(inv => {
      const subtotal = Number(inv.subtotal) || 0;
      const tax = Number(inv.tax) || 0;
      const total = Number(inv.total) || 0;
      const paid = Number(inv.paid) || 0;
      const ratio = total > 0 ? paid / total : 0;
      return {
        id: inv.id,
        date: inv.issueDate,
        client: inv.client,
        label: inv.invoiceNumber ? `Invoice ${inv.invoiceNumber}` : (inv.label || "—"),
        amount: subtotal, // net revenue (used by ledger / by-client chart)
        gross: total,
        gst: tax,
        paid,
        netReceived: paid * (total > 0 ? subtotal / total : 1),
        gstReceived: paid * (total > 0 ? tax / total : 0),
        note: inv.note,
        invoiceNumber: inv.invoiceNumber,
      };
    });
  const totalExp = exp.reduce((s, e) => s + e.amount, 0);
  const totalRev = rev.reduce((s, r) => s + r.amount, 0);              // net invoiced (subtotal sum)
  const totalReceivedNet = rev.reduce((s, r) => s + r.netReceived, 0); // cash net of GST
  const totalGstCollected = rev.reduce((s, r) => s + r.gstReceived, 0);// GST portion of cash received
  const totalGrossInvoiced = rev.reduce((s, r) => s + r.gross, 0);
  const totalReceivedGross = rev.reduce((s, r) => s + r.paid, 0);
  const totalOutstanding = totalGrossInvoiced - totalReceivedGross;
  // Profit on cash basis, NET of GST. GST received is held aside as a liability.
  const profit = totalReceivedNet - totalExp;
  const margin = totalReceivedNet ? ((profit / totalReceivedNet) * 100).toFixed(1) : "0.0";

  const byCategory = useMemo(() => {
    const m = {};
    for (const e of exp) m[e.category] = (m[e.category] || 0) + e.amount;
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [exp]);

  const byClient = useMemo(() => {
    const m = {};
    for (const r of rev) m[r.client] = (m[r.client] || 0) + r.amount;
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [rev]);

  const addExp = async (e) => {
    try { await insertRow("expenses", { ...e, id: `e${Date.now()}` }); refresh(); setShowExp(false); }
    catch (err) { alert("Failed: " + err.message); }
  };
  const removeExp = async (id) => {
    try { await deleteRow("expenses", id); refresh(); } catch (e) { alert("Failed: " + e.message); }
  };

  const combined = [
    ...exp.map(e => ({ ...e, type: "exp" })),
    ...rev.map(r => ({ ...r, type: "rev" }))
  ].sort((a,b) => b.date.localeCompare(a.date));

  const CATEGORY_COLORS = ["var(--ink-yellow)", "var(--ink-cyan)", "var(--ink-amber)", "var(--ink-green)", "var(--ink-red)", "var(--ink-slate)", "#a855f7"];

  return (
    <div>
      <PageHeader title="Profit & Loss" sub="revenue (invoiced) · expenses · margins"
        action={
          <div style={{display:"flex", gap: 8}}>
            <button className="btn-primary" onClick={() => setShowExp(true)}><Plus size={13}/> EXPENSE</button>
          </div>
        }/>

      <div className="pnl-top pnl-top-5">
        <div className="pnl-big pnl-rev">
          <div className="pnl-label">REVENUE · NET</div>
          <div className="pnl-val">₹{totalRev.toLocaleString("en-IN")}</div>
          <div className="pnl-count">{rev.length} invoice{rev.length === 1 ? "" : "s"} · net of GST{totalOutstanding > 0 ? ` · pending ₹${Math.round(totalOutstanding).toLocaleString("en-IN")}` : ""}</div>
        </div>
        <div className="pnl-big pnl-cash">
          <div className="pnl-label">CASH INFLOW · NET</div>
          <div className="pnl-val">₹{Math.round(totalReceivedNet).toLocaleString("en-IN")}</div>
          <div className="pnl-count">{totalGrossInvoiced > 0 ? `${Math.round((totalReceivedGross / totalGrossInvoiced) * 100)}% of invoiced collected` : "no invoices"}</div>
        </div>
        <div className="pnl-big pnl-gst">
          <div className="pnl-label">GST COLLECTED</div>
          <div className="pnl-val">₹{Math.round(totalGstCollected).toLocaleString("en-IN")}</div>
          <div className="pnl-count">held aside — payable to government</div>
        </div>
        <div className="pnl-big pnl-exp">
          <div className="pnl-label">EXPENSES</div>
          <div className="pnl-val">₹{totalExp.toLocaleString("en-IN")}</div>
          <div className="pnl-count">{exp.length} entries</div>
        </div>
        <div className={`pnl-big pnl-${profit >= 0 ? "profit" : "loss"}`}>
          <div className="pnl-label">{profit >= 0 ? "PROFIT" : "LOSS"} · CASH</div>
          <div className="pnl-val">₹{Math.round(Math.abs(profit)).toLocaleString("en-IN")}</div>
          <div className="pnl-count">cash basis · margin {margin}%</div>
        </div>
      </div>

      <FoundersSection data={data} refresh={refresh} />
      <InvoicesSection data={data} refresh={refresh} />

      <div className="pnl-grid">
        <section className="panel">
          <div className="panel-head"><div><h2>EXPENSES · BY CATEGORY</h2></div></div>
          <div style={{ height: 260, padding: "12px 8px 0" }}>
            {byCategory.length === 0 ? <div className="empty">No expenses in this period.</div> :
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="var(--bg-panel)" strokeWidth={2}>
                    {byCategory.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", fontSize: 11, fontFamily: "var(--font-mono)" }} formatter={v => `₹${v.toLocaleString("en-IN")}`}/>
                </PieChart>
              </ResponsiveContainer>
            }
          </div>
          <div className="cat-list">
            {byCategory.map((c, i) => (
              <div key={c.name} className="cat-row">
                <span className="cat-dot" style={{background: CATEGORY_COLORS[i % CATEGORY_COLORS.length]}}></span>
                <span className="cat-name">{c.name}</span>
                <span className="cat-val mono">₹{c.value.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><div><h2>REVENUE · BY CLIENT</h2></div></div>
          <div style={{ height: 260, padding: "12px 8px 0" }}>
            {byClient.length === 0 ? <div className="empty">No revenue in this period.</div> :
              <ResponsiveContainer>
                <BarChart data={byClient} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="var(--border-dim)" strokeDasharray="2 4" vertical={false}/>
                  <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={10} tickLine={false} axisLine={{stroke: "var(--border)"}}/>
                  <YAxis stroke="var(--text-dim)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `₹${v/1000}K`}/>
                  <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", fontSize: 11, fontFamily: "var(--font-mono)" }} formatter={v => `₹${v.toLocaleString("en-IN")}`}/>
                  <Bar dataKey="value" radius={[4,4,0,0]}>
                    {byClient.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? "var(--ink-yellow)" : "var(--ink-cyan)"}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            }
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><div><h2>LEDGER</h2><div className="panel-sub">chronological log · newest first</div></div></div>
        <div className="ledger">
          <div className="ledger-thead">
            <div>DATE</div><div>TYPE</div><div>CATEGORY / CLIENT</div><div>DESCRIPTION</div><div>AMOUNT</div><div></div>
          </div>
          {combined.map(x => (
            <div key={x.id} className={`ledger-row ${x.type === "rev" ? "lr-rev" : "lr-exp"}`}>
              <div className="mono dim">{x.date}</div>
              <div><span className={`type-tag ${x.type === "rev" ? "tt-rev" : "tt-exp"}`}>{x.type === "rev" ? "REV" : "EXP"}</span></div>
              <div>{x.type === "rev" ? <ClientChip client={x.client}/> : <span className="cat-chip">{x.category}</span>}</div>
              <div className="lr-desc">
                <div>{x.label}</div>
                {x.note && <div className="lr-note">{x.note}</div>}
              </div>
              <div className={`mono lr-amt ${x.type === "rev" ? "amt-plus" : "amt-minus"}`}>
                {x.type === "rev" ? "+" : "−"}₹{x.amount.toLocaleString("en-IN")}
              </div>
              <div>
                {x.type === "exp"
                  ? <button className="icon-btn" onClick={() => removeExp(x.id)} title="Delete expense"><Trash2 size={12}/></button>
                  : <span className="icon-btn" style={{ opacity: 0.3, cursor: "default" }} title="Edit on the Invoices section"><Lock size={11}/></span>}
              </div>
            </div>
          ))}
          {combined.length === 0 && <div className="empty">No entries.</div>}
        </div>
      </section>

      {showExp && <ExpenseModal onClose={() => setShowExp(false)} onSubmit={addExp}/>}
    </div>
  );
}

function ExpenseModal({ onClose, onSubmit }) {
  const [f, setF] = useState({ date: today(), category: "DTF Supplies", label: "", amount: 0, note: "" });
  return (
    <Modal onClose={onClose} title="ADD EXPENSE">
      <div className="form">
        <div className="form-row">
          <label>DATE<input type="date" value={f.date} onChange={e => setF({...f, date: e.target.value})}/></label>
          <label>CATEGORY
            <select value={f.category} onChange={e => setF({...f, category: e.target.value})}>
              {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label>DESCRIPTION<input value={f.label} onChange={e => setF({...f, label: e.target.value})} placeholder="e.g. DTF film roll 50m"/></label>
        <label>AMOUNT (₹)<input type="number" value={f.amount} onChange={e => setF({...f, amount: parseInt(e.target.value) || 0})}/></label>
        <label>NOTE (optional)<input value={f.note} onChange={e => setF({...f, note: e.target.value})}/></label>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={!f.label || !f.amount} onClick={() => onSubmit(f)}>ADD EXPENSE →</button>
      </div>
    </Modal>
  );
}

function RevenueModal({ onClose, onSubmit }) {
  const [f, setF] = useState({ date: today(), client: "Culture Circle", label: "", amount: 0, note: "" });
  return (
    <Modal onClose={onClose} title="ADD REVENUE">
      <div className="form">
        <div className="form-row">
          <label>DATE<input type="date" value={f.date} onChange={e => setF({...f, date: e.target.value})}/></label>
          <label>CLIENT
            <select value={f.client} onChange={e => setF({...f, client: e.target.value})}>
              {CLIENTS.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label>DESCRIPTION<input value={f.label} onChange={e => setF({...f, label: e.target.value})} placeholder="e.g. 380 tees dispatched"/></label>
        <label>AMOUNT (₹)<input type="number" value={f.amount} onChange={e => setF({...f, amount: parseInt(e.target.value) || 0})}/></label>
        <label>NOTE (optional)<input value={f.note} onChange={e => setF({...f, note: e.target.value})}/></label>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={!f.label || !f.amount} onClick={() => onSubmit(f)}>ADD REVENUE →</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FOUNDERS & DRAWINGS — cycle-based profit split + owner drawings
// ═══════════════════════════════════════════════════════════════════
function FoundersSection({ data, refresh }) {
  const { settings, founderDraws, invoices, expenses } = data;
  const founders = [
    { key: "f1", name: settings.founder1Name || "Founder 1", share: Number(settings.founder1Share) || 0 },
    { key: "f2", name: settings.founder2Name || "Founder 2", share: Number(settings.founder2Share) || 0 },
  ];
  const [offset, setOffset] = useState(0); // 0 = current cycle, -1 = last, etc.
  const [showDraw, setShowDraw] = useState(null);
  const [editShares, setEditShares] = useState(false);

  const cycle = shiftCycle(getCurrentCycle(), offset);
  const startIso = isoDay(cycle.start);
  const endIso = isoDay(cycle.end);
  const inCycle = (d) => d >= startIso && d < endIso;

  // Cycle profit is on a CASH basis, NET of GST — only money received excluding GST counts.
  const rev = (invoices || []).filter(i => inCycle(i.issueDate));
  const exp = expenses.filter(e => inCycle(e.date));
  const sumRev = rev.reduce((s, x) => s + (Number(x.subtotal) || 0), 0); // net invoiced
  const sumCash = rev.reduce((s, x) => {
    const paid = Number(x.paid) || 0, total = Number(x.total) || 0, sub = Number(x.subtotal) || 0;
    return s + (total > 0 ? paid * sub / total : 0);
  }, 0); // cash net of GST
  const sumExp = exp.reduce((s, x) => s + x.amount, 0);
  const profit = sumCash - sumExp;

  const drawsInCycle = founderDraws.filter(d => inCycle(d.date));
  const drawnBy = (k) => drawsInCycle.filter(d => d.founderKey === k).reduce((s, d) => s + d.amount, 0);

  const addDraw = async (draw) => {
    try { await insertRow("founderDraws", { ...draw, id: `fd${Date.now()}` }); refresh(); setShowDraw(null); }
    catch (err) { alert("Failed: " + err.message); }
  };
  const removeDraw = async (id) => {
    if (!window.confirm("Delete this drawing entry?")) return;
    try { await deleteRow("founderDraws", id); refresh(); } catch (e) { alert(e.message); }
  };
  const saveShares = async (s) => {
    try { await insertRow("settings", { ...settings, ...s }); refresh(); setEditShares(false); }
    catch (e) { alert(e.message); }
  };

  const cycleLabelStr = cycleLabel(cycle);
  const isCurrent = offset === 0;

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h2>FOUNDERS &amp; DRAWINGS</h2>
          <div className="panel-sub">profit cycle · 10th → 10th · <strong>{cycleLabelStr}</strong>{isCurrent ? " (ongoing)" : ""}</div>
        </div>
        <div style={{display: "flex", gap: 6, flexWrap: "wrap"}}>
          <button className="btn-ghost sm" onClick={() => setOffset(offset - 1)}>← PREV</button>
          <button className="btn-ghost sm" onClick={() => setOffset(0)} disabled={isCurrent}>CURRENT</button>
          <button className="btn-ghost sm" onClick={() => setOffset(offset + 1)} disabled={offset >= 0}>NEXT →</button>
          <button className="btn-ghost sm" onClick={() => setEditShares(true)}><Edit3 size={11}/> SHARES</button>
        </div>
      </div>

      <div className="founder-grid">
        <div className="founder-card">
          <div className="panel-sub">CYCLE PROFIT</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: profit >= 0 ? "var(--ink-green)" : "var(--ink-red)" }}>
            {profit < 0 ? "−" : ""}₹{Math.abs(profit).toLocaleString("en-IN")}
          </div>
          <div className="panel-sub mono" style={{ marginTop: 4 }}>net cash ₹{Math.round(sumCash).toLocaleString("en-IN")} · exp ₹{Math.round(sumExp).toLocaleString("en-IN")} · net invoiced ₹{Math.round(sumRev).toLocaleString("en-IN")}</div>
        </div>
        {founders.map(f => {
          const due = Math.round(profit * f.share / 100);
          const drawn = drawnBy(f.key);
          const delta = drawn - due;
          const status = delta > 0 ? "OVER-DRAWN" : delta < 0 ? "LIABLE TO TAKE" : "BALANCED";
          const color = delta > 0 ? "var(--ink-red)" : delta < 0 ? "var(--ink-amber)" : "var(--ink-green)";
          return (
            <div key={f.key} className="founder-card">
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap"}}>
                <strong>{f.name}</strong>
                <span className="panel-sub mono">share {f.share}%</span>
              </div>
              <div className="founder-metrics">
                <div>
                  <div className="panel-sub">SHARE DUE</div>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>₹{due.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="panel-sub">DRAWN</div>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>₹{drawn.toLocaleString("en-IN")}</div>
                </div>
              </div>
              <div className="founder-flag" style={{ borderColor: color }}>
                <div className="panel-sub" style={{ color, fontWeight: 700, letterSpacing: 0.5 }}>{status}</div>
                <div className="mono" style={{ fontSize: 13, color }}>
                  {delta === 0 ? "—" : `${delta > 0 ? "+" : "−"}₹${Math.abs(delta).toLocaleString("en-IN")}`}
                </div>
              </div>
              <button className="btn-primary sm founder-log-btn" onClick={() => setShowDraw(f.key)}>
                <Plus size={11}/> LOG DRAWING
              </button>
            </div>
          );
        })}
      </div>

      {drawsInCycle.length > 0 && (
        <div className="founder-draws-list">
          <div className="panel-sub" style={{ marginBottom: 8 }}>DRAWINGS IN THIS CYCLE</div>
          <div style={{ display: "grid", gap: 4 }}>
            {drawsInCycle.slice().sort((a,b) => b.date.localeCompare(a.date)).map(d => {
              const f = founders.find(ff => ff.key === d.founderKey);
              return (
                <div key={d.id} className="draw-row">
                  <div className="mono dim draw-date">{d.date}</div>
                  <div className="draw-who"><strong>{f?.name || d.founderKey}</strong></div>
                  <div className="draw-note" style={{ color: "var(--text-dim)" }}>{d.note || "—"}</div>
                  <div className="mono draw-amt" style={{ color: "var(--ink-amber)" }}>−₹{d.amount.toLocaleString("en-IN")}</div>
                  <button className="icon-btn" onClick={() => removeDraw(d.id)}><Trash2 size={11}/></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showDraw && <FounderDrawModal founder={founders.find(f => f.key === showDraw)} onClose={() => setShowDraw(null)} onSubmit={addDraw}/>}
      {editShares && <FounderSharesModal settings={settings} onClose={() => setEditShares(false)} onSubmit={saveShares}/>}
    </section>
  );
}

function FounderDrawModal({ founder, onClose, onSubmit }) {
  const [f, setF] = useState({ founderKey: founder.key, date: today(), amount: 0, note: "" });
  return (
    <Modal onClose={onClose} title={`LOG DRAWING — ${founder.name.toUpperCase()}`}>
      <div className="form">
        <div className="form-row">
          <label>DATE<input type="date" value={f.date} onChange={e => setF({...f, date: e.target.value})}/></label>
          <label>AMOUNT (₹)<input type="number" value={f.amount} onChange={e => setF({...f, amount: parseFloat(e.target.value) || 0})}/></label>
        </div>
        <label>NOTE (optional)<input value={f.note} onChange={e => setF({...f, note: e.target.value})} placeholder="e.g. personal withdrawal"/></label>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={!f.amount || f.amount <= 0} onClick={() => onSubmit(f)}>LOG →</button>
      </div>
    </Modal>
  );
}

function FounderSharesModal({ settings, onClose, onSubmit }) {
  const [s, setS] = useState({
    founder1Name: settings.founder1Name || "Founder 1",
    founder2Name: settings.founder2Name || "Founder 2",
    founder1Share: Number(settings.founder1Share) || 50,
    founder2Share: Number(settings.founder2Share) || 50,
  });
  const total = (Number(s.founder1Share) || 0) + (Number(s.founder2Share) || 0);
  const valid = Math.abs(total - 100) < 0.01;
  return (
    <Modal onClose={onClose} title="FOUNDER NAMES & PROFIT SHARES">
      <div className="form">
        <div className="form-row">
          <label>FOUNDER 1 NAME<input value={s.founder1Name} onChange={e => setS({...s, founder1Name: e.target.value})}/></label>
          <label>SHARE (%)<input type="number" value={s.founder1Share} onChange={e => setS({...s, founder1Share: parseFloat(e.target.value) || 0})}/></label>
        </div>
        <div className="form-row">
          <label>FOUNDER 2 NAME<input value={s.founder2Name} onChange={e => setS({...s, founder2Name: e.target.value})}/></label>
          <label>SHARE (%)<input type="number" value={s.founder2Share} onChange={e => setS({...s, founder2Share: parseFloat(e.target.value) || 0})}/></label>
        </div>
        <div className="panel-sub mono">Total: {total}% {valid ? "✓" : "— must equal 100%"}</div>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={!valid} onClick={() => onSubmit(s)}>SAVE →</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INVOICES — client billing, tax payable, receivables
// ═══════════════════════════════════════════════════════════════════
function InvoicesSection({ data, refresh }) {
  const { invoices } = data;
  const [showNew, setShowNew] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [generating, setGenerating] = useState(false);

  const totalSub = invoices.reduce((s, i) => s + i.subtotal, 0);
  const totalTax = invoices.reduce((s, i) => s + i.tax, 0);
  const totalTotal = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paid, 0);
  const totalPending = totalTotal - totalPaid;

  const addInvoice = async (inv) => {
    setGenerating(true);
    try {
      const invoiceNumber = inv.invoiceNumber || nextInvoiceNumber(invoices, inv.issueDate);
      const total = Math.round((Number(inv.subtotal) + Number(inv.tax)) * 100) / 100;
      const payload = { ...inv, invoiceNumber, total, paid: 0, id: `inv${Date.now()}` };
      await insertRow("invoices", payload);
      await generateInvoicePDF({ ...payload }); // triggers browser download
      refresh(); setShowNew(false);
    } catch (e) { alert("Failed: " + (e?.message || e)); }
    finally { setGenerating(false); }
  };
  const downloadInvoice = async (inv) => {
    setGenerating(true);
    try { await generateInvoicePDF(inv); }
    catch (e) { alert("PDF failed: " + (e?.message || e)); }
    finally { setGenerating(false); }
  };
  const recordPayment = async (invoice, amount) => {
    try {
      const newPaid = Number(invoice.paid) + Number(amount);
      await updateRow("invoices", invoice.id, { paid: newPaid });
      refresh(); setPayFor(null);
    } catch (e) { alert("Failed: " + e.message); }
  };
  const removeInvoice = async (id) => {
    if (!window.confirm("Delete invoice?")) return;
    try { await deleteRow("invoices", id); refresh(); } catch (e) { alert(e.message); }
  };

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h2>INVOICES</h2>
          <div className="panel-sub">client billing · tax payable · pending receivables</div>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}><Plus size={12}/> NEW INVOICE</button>
      </div>

      <div className="inv-kpi-grid">
        <div className="inv-kpi">
          <div className="panel-sub">INVOICED (SUBTOTAL)</div>
          <div className="mono inv-kpi-val">₹{totalSub.toLocaleString("en-IN")}</div>
        </div>
        <div className="inv-kpi">
          <div className="panel-sub">TAX PAYABLE</div>
          <div className="mono inv-kpi-val" style={{ color: "var(--ink-amber)" }}>₹{totalTax.toLocaleString("en-IN")}</div>
        </div>
        <div className="inv-kpi">
          <div className="panel-sub">COLLECTED</div>
          <div className="mono inv-kpi-val" style={{ color: "var(--ink-green)" }}>₹{totalPaid.toLocaleString("en-IN")}</div>
        </div>
        <div className="inv-kpi">
          <div className="panel-sub">PENDING</div>
          <div className="mono inv-kpi-val" style={{ color: totalPending > 0 ? "var(--ink-red)" : "var(--text-dim)" }}>₹{totalPending.toLocaleString("en-IN")}</div>
        </div>
      </div>

      <div style={{ padding: "0 14px 14px" }}>
        {invoices.length === 0 ? (
          <div className="empty">No invoices yet. Click NEW INVOICE to add one.</div>
        ) : (
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>#</th><th>DATE</th><th>CLIENT</th><th>DESCRIPTION</th>
                  <th style={{textAlign:"right"}}>SUBTOTAL</th>
                  <th style={{textAlign:"right"}}>TAX</th>
                  <th style={{textAlign:"right"}}>TOTAL</th>
                  <th style={{textAlign:"right"}}>PAID</th>
                  <th style={{textAlign:"right"}}>PENDING</th>
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice().sort((a,b) => b.issueDate.localeCompare(a.issueDate)).map(inv => {
                  const pending = inv.total - inv.paid;
                  const status = pending <= 0.01 ? "PAID" : inv.paid > 0 ? "PARTIAL" : "UNPAID";
                  const color = pending <= 0.01 ? "var(--ink-green)" : inv.paid > 0 ? "var(--ink-amber)" : "var(--ink-red)";
                  return (
                    <tr key={inv.id}>
                      <td className="mono">{inv.invoiceNumber || "—"}</td>
                      <td className="mono dim">{inv.issueDate}</td>
                      <td>{inv.client}</td>
                      <td style={{ maxWidth: 220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{inv.label || "—"}</td>
                      <td className="mono" style={{textAlign:"right"}}>₹{inv.subtotal.toLocaleString("en-IN")}</td>
                      <td className="mono" style={{textAlign:"right"}}>₹{inv.tax.toLocaleString("en-IN")}</td>
                      <td className="mono" style={{textAlign:"right", fontWeight:600}}>₹{inv.total.toLocaleString("en-IN")}</td>
                      <td className="mono" style={{textAlign:"right", color:"var(--ink-green)"}}>₹{inv.paid.toLocaleString("en-IN")}</td>
                      <td className="mono" style={{textAlign:"right", color: pending > 0.01 ? "var(--ink-red)" : "var(--text-dim)"}}>₹{pending.toLocaleString("en-IN")}</td>
                      <td><span style={{ color, fontWeight: 700, fontSize: 10, letterSpacing: 0.5 }}>{status}</span></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn-ghost sm" onClick={() => downloadInvoice(inv)} style={{marginRight:4}} title="Download PDF" disabled={generating}>PDF</button>
                        {pending > 0.01 && <button className="btn-ghost sm" onClick={() => setPayFor(inv)} style={{marginRight:4}}>PAY</button>}
                        <button className="icon-btn" onClick={() => removeInvoice(inv.id)}><Trash2 size={11}/></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && <InvoiceModal onClose={() => setShowNew(false)} onSubmit={addInvoice}/>}
      {payFor && <PaymentModal invoice={payFor} onClose={() => setPayFor(null)} onSubmit={(amt) => recordPayment(payFor, amt)}/>}
    </section>
  );
}

function InvoiceModal({ onClose, onSubmit }) {
  const [client, setClient] = useState({ name: "", legalName: "", gstin: "", address: "", stateCode: "07" });
  const applyPreset = (brandName) => {
    const p = CLIENT_PRESETS[brandName];
    if (!p) return;
    setClient({ name: brandName, legalName: p.legalName || "", gstin: p.gstin || "", address: p.address || "", stateCode: p.stateCode || "07" });
  };
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [sacCode, setSacCode] = useState("998912");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([{ particulars: "", rate: 0, qty: 1 }]);
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const subtotal = lines.reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.qty) || 0), 0);
  const isIntraState = client.stateCode === "07"; // Delhi (your home state)
  const cgst = isIntraState ? +(subtotal * 0.09).toFixed(2) : 0;
  const sgst = isIntraState ? +(subtotal * 0.09).toFixed(2) : 0;
  const igst = isIntraState ? 0 : +(subtotal * 0.18).toFixed(2);
  const tax = +(cgst + sgst + igst).toFixed(2);
  const rawTotal = subtotal + tax;
  const total = Math.round(rawTotal);
  const roundOff = +(total - rawTotal).toFixed(2);

  const updateLine = (i, field, value) => {
    const next = [...lines];
    next[i] = { ...next[i], [field]: value };
    setLines(next);
  };
  const addLine = () => setLines([...lines, { particulars: "", rate: 0, qty: 1 }]);
  const removeLine = (i) => setLines(lines.filter((_, idx) => idx !== i));

  const canSubmit = client.name.trim() && lines.length > 0 && lines.every(l => l.particulars.trim() && (Number(l.rate) || 0) > 0 && (Number(l.qty) || 0) > 0);

  const handleSubmit = () => {
    const stateName = STATE_BY_CODE[client.stateCode] || "Delhi";
    onSubmit({
      invoiceNumber: invoiceNumber.trim(),
      client: client.name.trim(),
      issueDate,
      dueDate: dueDate || null,
      label: lines[0].particulars + (lines.length > 1 ? ` + ${lines.length - 1} more` : ""),
      subtotal: +subtotal.toFixed(2),
      tax,
      note,
      meta: {
        client: {
          name: client.name.trim(),
          legalName: client.legalName.trim(),
          gstin: client.gstin.trim().toUpperCase(),
          address: client.address.trim(),
          stateCode: client.stateCode,
          stateName,
        },
        lines: lines.map(l => ({
          particulars: l.particulars.trim(),
          rate: Number(l.rate) || 0,
          qty: Number(l.qty) || 0,
          amount: +((Number(l.rate) || 0) * (Number(l.qty) || 0)).toFixed(2),
        })),
        sacCode,
        tax: { cgst, sgst, igst, rate: 18, intraState: isIntraState },
        roundOff,
        placeOfSupply: `${client.stateCode} — ${stateName}`,
      },
    });
  };

  return (
    <Modal onClose={onClose} title="NEW INVOICE" wide>
      <div className="form">
        <div className="inv-section-head">CLIENT</div>
        {Object.keys(CLIENT_PRESETS).length > 0 && (
          <div className="inv-preset-row">
            <span className="inv-preset-label">QUICK FILL</span>
            {Object.keys(CLIENT_PRESETS).map(name => (
              <button key={name} type="button" className={`inv-preset-chip ${client.name === name ? "on" : ""}`} onClick={() => applyPreset(name)}>
                {name}
              </button>
            ))}
          </div>
        )}
        <div className="form-row">
          <label>CLIENT NAME<input value={client.name} onChange={e => setClient({...client, name: e.target.value})} placeholder="e.g. Culture Circle"/></label>
          <label>LEGAL NAME (for invoice)<input value={client.legalName} onChange={e => setClient({...client, legalName: e.target.value})} placeholder="e.g. METACIRCLES TECHNOLOGIES PRIVATE LIMITED"/></label>
        </div>
        <div className="form-row">
          <label>GSTIN (optional)<input value={client.gstin} onChange={e => setClient({...client, gstin: e.target.value.toUpperCase()})} placeholder="07ABCDE1234F1Z5" maxLength={15}/></label>
          <label>PLACE OF SUPPLY
            <select value={client.stateCode} onChange={e => setClient({...client, stateCode: e.target.value})}>
              {INDIAN_STATES.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
            </select>
          </label>
        </div>
        <label>BILLING ADDRESS<textarea rows={2} value={client.address} onChange={e => setClient({...client, address: e.target.value})} placeholder="Street, City, State – PIN"/></label>

        <div className="inv-section-head">INVOICE</div>
        <div className="form-row">
          <label>INVOICE # (leave blank to auto-generate)<input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="auto — AI/2026-27/0001"/></label>
          <label>SAC / HSN<input value={sacCode} onChange={e => setSacCode(e.target.value)} placeholder="998912"/></label>
        </div>
        <div className="form-row">
          <label>ISSUE DATE<input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}/></label>
          <label>DUE DATE (optional)<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label>
        </div>

        <div className="inv-section-head">LINE ITEMS</div>
        <div className="inv-lines">
          {lines.map((l, i) => {
            const amt = (Number(l.rate)||0) * (Number(l.qty)||0);
            return (
              <div key={i} className="inv-line-row">
                <label className="inv-particulars">PARTICULARS<input value={l.particulars} onChange={e => updateLine(i, "particulars", e.target.value)} placeholder="DTF Print — 250 tees, size M-XL"/></label>
                <label className="inv-rate">RATE (₹)<input type="number" min="0" value={l.rate} onChange={e => updateLine(i, "rate", e.target.value)}/></label>
                <label className="inv-qty">QTY<input type="number" min="0" value={l.qty} onChange={e => updateLine(i, "qty", e.target.value)}/></label>
                <div className="inv-amt-cell">
                  <div className="panel-sub">AMOUNT</div>
                  <div className="mono inv-amt-val">₹{amt.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
                </div>
                <button type="button" className="icon-btn inv-remove" onClick={() => removeLine(i)} disabled={lines.length === 1} title="Remove line"><Trash2 size={11}/></button>
              </div>
            );
          })}
          <button type="button" className="btn-ghost sm" onClick={addLine} style={{alignSelf:"flex-start"}}><Plus size={11}/> ADD LINE</button>
        </div>

        <div className="inv-totals-preview">
          <div className="inv-tl"><span>Subtotal</span><span className="mono">₹{subtotal.toLocaleString("en-IN", {maximumFractionDigits:2})}</span></div>
          {isIntraState ? (
            <>
              <div className="inv-tl"><span>CGST @ 9%</span><span className="mono">₹{cgst.toLocaleString("en-IN", {maximumFractionDigits:2})}</span></div>
              <div className="inv-tl"><span>SGST @ 9%</span><span className="mono">₹{sgst.toLocaleString("en-IN", {maximumFractionDigits:2})}</span></div>
            </>
          ) : (
            <div className="inv-tl"><span>IGST @ 18%</span><span className="mono">₹{igst.toLocaleString("en-IN", {maximumFractionDigits:2})}</span></div>
          )}
          {roundOff !== 0 && <div className="inv-tl"><span>Round Off</span><span className="mono">₹{roundOff.toFixed(2)}</span></div>}
          <div className="inv-tl inv-tl-total"><span>Total</span><span className="mono">₹{total.toLocaleString("en-IN")}</span></div>
        </div>

        <label>NOTE (optional)<input value={note} onChange={e => setNote(e.target.value)}/></label>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={!canSubmit} onClick={handleSubmit}>CREATE &amp; DOWNLOAD PDF →</button>
      </div>
    </Modal>
  );
}

function PaymentModal({ invoice, onClose, onSubmit }) {
  const pending = invoice.total - invoice.paid;
  const [amount, setAmount] = useState(pending);
  return (
    <Modal onClose={onClose} title={`RECORD PAYMENT — ${invoice.invoiceNumber || invoice.client}`}>
      <div className="form">
        <div className="panel-sub mono">Total ₹{invoice.total.toLocaleString("en-IN")} · Paid ₹{invoice.paid.toLocaleString("en-IN")} · Pending ₹{pending.toLocaleString("en-IN")}</div>
        <label>AMOUNT RECEIVED (₹)<input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)}/></label>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn-primary" disabled={amount <= 0 || amount > pending + 0.01} onClick={() => onSubmit(amount)}>RECORD →</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE · INSIGHTS
// Pre-built analytical reports — zero API cost, runs on local data
// ═══════════════════════════════════════════════════════════════════
function Insights({ data, range }) {
  const [activeReport, setActiveReport] = useState("overview");

  // Use the global date range (preset or custom). Accepts a date string, returns bool.
  const insideRange = (d) => inRange(d, range);
  const rangeStartLabel = range?.start || "—";
  const rangeEndLabel = range?.end || "—";
  // Number of days covered by the range — used for per-day averages + display labels.
  // For "all time" fall back to the span of all dated data.
  const rangeDays = (() => {
    if (range?.start && range?.end) {
      return Math.max(1, Math.round((Date.parse(range.end + "T00:00:00") - Date.parse(range.start + "T00:00:00")) / 86400000) + 1);
    }
    return 30;
  })();

  // ═════════ COMPUTED METRICS ═════════
  const metrics = useMemo(() => {
    const prod = data.production.filter(p => insideRange(p.date));
    const totalPrinted = prod.reduce((s, p) => s + p.total, 0);
    const rev = data.revenue.filter(r => insideRange(r.date));
    const exp = data.expenses.filter(e => insideRange(e.date));
    const totalRev = rev.reduce((s, r) => s + r.amount, 0);
    const totalExp = exp.reduce((s, e) => s + e.amount, 0);
    const profit = totalRev - totalExp;
    const attRange = data.attendance.filter(a => insideRange(a.date) && a.punchOut);
    return { prod, rev, exp, totalPrinted, totalRev, totalExp, profit, attRange };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, range]);

  // ═════════ REPORT 1 · WORKER PRODUCTIVITY ═════════
  const workerReport = useMemo(() => {
    return data.workers.filter(w => w.active).map(w => {
      const records = metrics.attRange.filter(r => r.workerId === w.id);
      const days = new Set(records.map(r => r.date)).size;
      let totalMinutes = 0;
      let otMinutes = 0;
      let sundaysWorked = 0;

      for (const r of records) {
        const [h1, m1] = r.punchIn.split(":").map(Number);
        const [h2, m2] = r.punchOut.split(":").map(Number);
        const inMin = h1 * 60 + m1;
        let outMin = h2 * 60 + m2;
        if (outMin < inMin) outMin += 24 * 60;
        totalMinutes += (outMin - inMin);
        otMinutes += otMinutesForRecord(r);

        const [y, mo, d] = r.date.split("-").map(Number);
        if (new Date(y, mo - 1, d).getDay() === 0) sundaysWorked++;
      }

      const totalHours = totalMinutes / 60;
      const avgHoursPerDay = days ? (totalHours / days).toFixed(1) : "0";
      const otHours = otMinutes / 60;
      const otEarnings = Math.round(otHours * OT_RATE_PER_HOUR);

      return {
        worker: w,
        daysPresent: days,
        totalHours: totalHours.toFixed(1),
        avgHoursPerDay,
        otHours: otHours.toFixed(1),
        otEarnings,
        sundaysWorked,
      };
    }).sort((a, b) => parseFloat(b.totalHours) - parseFloat(a.totalHours));
  }, [metrics.attRange, data.workers]);

  // ═════════ REPORT 2 · ORDER PROFITABILITY ═════════
  const orderProfitability = useMemo(() => {
    // Estimate per-tee DTF cost for the range
    const dtfExpenses = metrics.exp
      .filter(e => e.category === "DTF Supplies")
      .reduce((s, e) => s + e.amount, 0);
    const estCostPerTee = metrics.totalPrinted > 0 ? dtfExpenses / metrics.totalPrinted : 0;

    // Client-level: total dispatched to client in range × effective rev
    const byClient = {};
    for (const r of metrics.rev) {
      if (!byClient[r.client]) byClient[r.client] = { rev: 0, tees: 0 };
      byClient[r.client].rev += r.amount;
    }
    // Count printed tees per client in range
    const dispByClient = {};
    for (const p of metrics.prod) {
      if (!p.client) continue;
      dispByClient[p.client] = (dispByClient[p.client] || 0) + (p.total || 0);
    }

    const clientStats = Object.keys(byClient).concat(Object.keys(dispByClient))
      .filter((v, i, a) => a.indexOf(v) === i)
      .map(client => {
        const rev = byClient[client]?.rev || 0;
        const tees = dispByClient[client] || 0;
        const ratePerTee = tees ? Math.round(rev / tees) : 0;
        const costPerTee = Math.round(estCostPerTee);
        const marginPerTee = ratePerTee - costPerTee;
        const totalCost = Math.round(tees * estCostPerTee);
        const grossProfit = rev - totalCost;
        return { client, rev, tees, ratePerTee, costPerTee, marginPerTee, grossProfit, marginPct: rev ? ((grossProfit / rev) * 100).toFixed(1) : "0" };
      });

    return { clientStats, estCostPerTee, dtfExpenses };
  }, [metrics, data.orders]);

  // ═════════ REPORT 3 · DAILY OUTPUT TRENDS ═════════
  const outputTrend = useMemo(() => {
    const days = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const printed = data.production.filter(p => p.date === key).reduce((s, p) => s + p.total, 0);
      days.push({ date: key, label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), printed, isSunday: d.getDay() === 0 });
    }

    // Stats
    const nonZero = days.filter(d => d.printed > 0);
    const avg = nonZero.length ? nonZero.reduce((s, d) => s + d.printed, 0) / nonZero.length : 0;
    const best = days.reduce((m, d) => d.printed > m.printed ? d : m, { printed: 0 });
    const worst = nonZero.length ? nonZero.reduce((m, d) => d.printed < m.printed ? d : m) : null;

    // Anomalies: days with production >30% above/below average
    const anomalies = nonZero.filter(d => Math.abs(d.printed - avg) > avg * 0.3)
      .map(d => ({ ...d, deviation: Math.round(((d.printed - avg) / avg) * 100), avg: Math.round(avg) }));

    return { days, avg: Math.round(avg), best, worst, anomalies, workingDays: nonZero.length };
  }, [data.production, range]);

  // ═════════ REPORT 4 · COST BREAKDOWN ═════════
  const costBreakdown = useMemo(() => {
    const byCat = {};
    for (const e of metrics.exp) {
      byCat[e.category] = (byCat[e.category] || 0) + e.amount;
    }
    const entries = Object.entries(byCat).map(([cat, amt]) => ({
      cat,
      amt,
      pct: metrics.totalExp ? ((amt / metrics.totalExp) * 100).toFixed(1) : "0",
    })).sort((a, b) => b.amt - a.amt);

    // Cost per tee printed
    const costPerTee = metrics.totalPrinted ? Math.round(metrics.totalExp / metrics.totalPrinted) : 0;

    return { entries, costPerTee };
  }, [metrics]);

  // ═════════ REPORT 5 · STOCK TURNOVER ═════════
  const stockTurnover = useMemo(() => {
    // For each warehouse item, estimate: how fast has it moved in the range?
    // Movement = qty of that product printed (since print deducts from warehouse) in range
    const items = data.warehouse.map(w => {
      const currentStock = Object.values(w.sizes).reduce((a, b) => a + b, 0);
      const movedInRange = data.production
        .filter(p => insideRange(p.date) && p.client === w.client && p.product === w.product)
        .reduce((s, p) => s + p.total, 0);

      // Days of cover = current stock ÷ (movement per day). Use the number of days in the range.
      const movementPerDay = movedInRange / rangeDays;
      const daysOfCover = movementPerDay > 0 ? Math.round(currentStock / movementPerDay) : null;
      const turnoverRate = currentStock > 0 ? (movedInRange / currentStock).toFixed(2) : "0";

      return { ...w, currentStock, movedInRange, movementPerDay: movementPerDay.toFixed(1), daysOfCover, turnoverRate };
    }).sort((a, b) => b.movedInRange - a.movedInRange);

    const fast = items.filter(i => i.daysOfCover !== null && i.daysOfCover < 14);
    const slow = items.filter(i => i.movedInRange === 0 && i.currentStock > 0);

    return { items, fast, slow };
  }, [data.warehouse, data.production, range]);

  // ═════════ EXPORT REPORT AS TEXT ═════════
  const exportReport = () => {
    const report = `
PRESSROOM.OPS · INSIGHTS REPORT
Period: ${formatRangeLabel(range)}
Generated: ${new Date().toLocaleString("en-IN")}
═══════════════════════════════════════════════

OVERVIEW
─────────
Total printed: ${metrics.totalPrinted} tees
Total expenses: ₹${metrics.totalExp.toLocaleString("en-IN")}
Revenue: ₹${metrics.totalRev.toLocaleString("en-IN")}
Expenses: ₹${metrics.totalExp.toLocaleString("en-IN")}
Profit: ₹${metrics.profit.toLocaleString("en-IN")} (${metrics.totalRev ? ((metrics.profit / metrics.totalRev) * 100).toFixed(1) : 0}% margin)

WORKER PRODUCTIVITY
────────────────────
${workerReport.map(w => `${w.worker.name.padEnd(10)} · ${w.daysPresent} days · ${w.totalHours}h total · avg ${w.avgHoursPerDay}h/day · OT: ${w.otHours}h (₹${w.otEarnings})`).join("\n")}

DAILY OUTPUT
─────────────
Working days: ${outputTrend.workingDays}/${rangeDays}
Average output: ${outputTrend.avg} tees/day
Best day: ${outputTrend.best.label} · ${outputTrend.best.printed} tees
${outputTrend.worst ? `Slowest day: ${outputTrend.worst.label} · ${outputTrend.worst.printed} tees` : ""}

ORDER PROFITABILITY (by client)
────────────────────────────────
DTF supplies cost: ₹${orderProfitability.dtfExpenses.toLocaleString("en-IN")}
Est. cost per tee: ₹${Math.round(orderProfitability.estCostPerTee)}
${orderProfitability.clientStats.map(c => `${c.client.padEnd(18)} · ${c.tees} tees · rev ₹${c.rev.toLocaleString("en-IN")} · ₹${c.ratePerTee}/tee · margin ${c.marginPct}%`).join("\n")}

COST BREAKDOWN
───────────────
Cost per tee printed: ₹${costBreakdown.costPerTee}
${costBreakdown.entries.map(e => `${e.cat.padEnd(16)} · ₹${e.amt.toLocaleString("en-IN").padStart(10)} (${e.pct}%)`).join("\n")}

STOCK TURNOVER
───────────────
${stockTurnover.fast.length > 0 ? `⚠ LOW STOCK (under 14 days cover):\n${stockTurnover.fast.map(i => `  · ${i.product} (${i.client}): ${i.currentStock} left · ~${i.daysOfCover} days cover`).join("\n")}` : "All stock healthy."}
${stockTurnover.slow.length > 0 ? `\n○ DEAD STOCK (no movement in ${rangeDays} days):\n${stockTurnover.slow.map(i => `  · ${i.product} (${i.client}): ${i.currentStock} sitting idle`).join("\n")}` : ""}
`.trim();

    // Copy to clipboard
    navigator.clipboard.writeText(report).then(() => {
      alert("Report copied to clipboard. Paste it anywhere — including back into Claude for deeper analysis.");
    }).catch(() => {
      // Fallback: show in a new window
      const w = window.open("", "_blank");
      if (w) { w.document.write(`<pre style="font-family:monospace;padding:20px;">${report}</pre>`); }
    });
  };

  const REPORTS = [
    { id: "overview",       label: "Overview" },
    { id: "productivity",   label: "Worker Productivity" },
    { id: "profit",         label: "Order Profitability" },
    { id: "trends",         label: "Daily Output Trends" },
    { id: "costs",          label: "Cost Breakdown" },
    { id: "stock",          label: "Stock Turnover" },
  ];

  return (
    <div>
      <PageHeader title="Insights" sub="pre-built reports · runs on your data, zero AI cost"
        action={<button className="btn-primary" onClick={exportReport}><ClipboardList size={13}/> EXPORT REPORT</button>}/>

      <div className="filter-bar">
        <div className="filter-summary">
          <span>{rangeStartLabel}</span>
          <span className="dot-sep">→</span>
          <span>{rangeEndLabel}</span>
        </div>
      </div>

      {/* Report selector tabs */}
      <div className="report-tabs">
        {REPORTS.map(r => (
          <button key={r.id} className={`report-tab ${activeReport === r.id ? "on" : ""}`} onClick={() => setActiveReport(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      {/* ═══════ OVERVIEW ═══════ */}
      {activeReport === "overview" && (
        <div className="insight-body">
          <div className="kpi-grid kpi-4">
            <div className="kpi kpi-cyan">
              <div className="kpi-top"><span className="kpi-label">PRINTED</span><Printer size={14} className="kpi-icon"/></div>
              <div className="kpi-value">{metrics.totalPrinted}<span className="kpi-unit">tees</span></div>
            </div>
            <div className="kpi kpi-green">
              <div className="kpi-top"><span className="kpi-label">REVENUE</span><IndianRupee size={14} className="kpi-icon"/></div>
              <div className="kpi-value">₹{(metrics.totalRev/1000).toFixed(1)}<span className="kpi-unit">K</span></div>
            </div>
            <div className="kpi kpi-yellow">
              <div className="kpi-top"><span className="kpi-label">EXPENSES</span><Wallet size={14} className="kpi-icon"/></div>
              <div className="kpi-value">₹{(metrics.totalExp/1000).toFixed(1)}<span className="kpi-unit">K</span></div>
            </div>
            <div className={`kpi kpi-${metrics.profit >= 0 ? "green" : "red"}`}>
              <div className="kpi-top"><span className="kpi-label">PROFIT</span><TrendingUp size={14} className="kpi-icon"/></div>
              <div className="kpi-value">₹{(Math.abs(metrics.profit)/1000).toFixed(1)}<span className="kpi-unit">K</span></div>
            </div>
          </div>

          <section className="panel">
            <div className="panel-head"><div><h2>HEADLINE NUMBERS</h2><div className="panel-sub">{formatRangeLabel(range)}</div></div></div>
            <div className="headline-grid">
              <div className="hl-row"><span>Avg revenue per tee printed</span><strong>₹{metrics.totalPrinted ? Math.round(metrics.totalRev / metrics.totalPrinted) : 0}</strong></div>
              <div className="hl-row"><span>Avg cost per tee printed</span><strong>₹{costBreakdown.costPerTee}</strong></div>
              <div className="hl-row"><span>Profit margin</span><strong className={metrics.profit >= 0 ? "pos" : "neg"}>{metrics.totalRev ? ((metrics.profit / metrics.totalRev) * 100).toFixed(1) : 0}%</strong></div>
              <div className="hl-row"><span>Daily avg output</span><strong>{outputTrend.avg} tees/day</strong></div>
              <div className="hl-row"><span>Working days in period</span><strong>{outputTrend.workingDays}/{rangeDays}</strong></div>
            </div>
          </section>
        </div>
      )}

      {/* ═══════ WORKER PRODUCTIVITY ═══════ */}
      {activeReport === "productivity" && (
        <div className="insight-body">
          <section className="panel">
            <div className="panel-head"><div><h2>WORKER PRODUCTIVITY · {rangeDays}D</h2><div className="panel-sub">ranked by total hours worked</div></div></div>
            {workerReport.length === 0 || workerReport.every(w => w.daysPresent === 0) ? (
              <div className="empty">No attendance data in this period.</div>
            ) : (
              <div className="prod-report">
                {workerReport.map(w => (
                  <div key={w.worker.id} className="prod-row-report">
                    <div className="pr-name">
                      <div className="pr-avatar">{w.worker.name.slice(0, 2).toUpperCase()}</div>
                      <div>
                        <div className="pr-nm">{w.worker.name}</div>
                        <div className="pr-role">{w.worker.role}</div>
                      </div>
                    </div>
                    <div className="pr-stats">
                      <div className="pr-stat"><div className="pr-label">DAYS</div><div className="pr-val">{w.daysPresent}</div></div>
                      <div className="pr-stat"><div className="pr-label">TOTAL HRS</div><div className="pr-val">{w.totalHours}</div></div>
                      <div className="pr-stat"><div className="pr-label">AVG/DAY</div><div className="pr-val">{w.avgHoursPerDay}h</div></div>
                      <div className="pr-stat"><div className="pr-label">OT HRS</div><div className="pr-val pr-ot">{w.otHours}</div></div>
                      <div className="pr-stat"><div className="pr-label">OT EARNED</div><div className="pr-val pr-ot">₹{w.otEarnings.toLocaleString("en-IN")}</div></div>
                      <div className="pr-stat"><div className="pr-label">SUNDAYS</div><div className="pr-val">{w.sundaysWorked}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ═══════ ORDER PROFITABILITY ═══════ */}
      {activeReport === "profit" && (
        <div className="insight-body">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>PROFITABILITY BY CLIENT · {rangeDays}D</h2>
                <div className="panel-sub">revenue received vs estimated cost</div>
              </div>
            </div>

            <div className="profit-note">
              <AlertTriangle size={12}/>
              <div>
                <strong>How it's calculated:</strong> Cost per tee = DTF Supplies total (₹{orderProfitability.dtfExpenses.toLocaleString("en-IN")}) ÷ tees printed ({metrics.totalPrinted}) = <strong>₹{Math.round(orderProfitability.estCostPerTee)}/tee</strong>.
                This is a rough estimate; it doesn't include salaries, electricity, or other overheads. For the full picture, check the P&L page.
              </div>
            </div>

            {orderProfitability.clientStats.length === 0 ? (
              <div className="empty">No revenue logged in this period.</div>
            ) : (
              <div className="profit-table">
                <div className="pf-thead">
                  <div>CLIENT</div><div>TEES</div><div>REVENUE</div><div>RATE/TEE</div><div>COST/TEE</div><div>MARGIN/TEE</div><div>GROSS PROFIT</div><div>MARGIN %</div>
                </div>
                {orderProfitability.clientStats.map(c => (
                  <div key={c.client} className="pf-row">
                    <div><ClientChip client={c.client}/></div>
                    <div className="mono"><strong>{c.tees}</strong></div>
                    <div className="mono">₹{c.rev.toLocaleString("en-IN")}</div>
                    <div className="mono">₹{c.ratePerTee}</div>
                    <div className="mono dim">₹{c.costPerTee}</div>
                    <div className={`mono ${c.marginPerTee >= 0 ? "pos" : "neg"}`}><strong>₹{c.marginPerTee}</strong></div>
                    <div className={`mono ${c.grossProfit >= 0 ? "pos" : "neg"}`}><strong>₹{c.grossProfit.toLocaleString("en-IN")}</strong></div>
                    <div className={`mono ${parseFloat(c.marginPct) >= 0 ? "pos" : "neg"}`}><strong>{c.marginPct}%</strong></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ═══════ DAILY OUTPUT TRENDS ═══════ */}
      {activeReport === "trends" && (
        <div className="insight-body">
          <section className="panel">
            <div className="panel-head"><div><h2>DAILY OUTPUT · {rangeDays}D</h2><div className="panel-sub">tees printed per day</div></div></div>
            <div style={{ height: 280, padding: "16px 12px 4px" }}>
              <ResponsiveContainer>
                <LineChart data={outputTrend.days} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke="var(--border-dim)" strokeDasharray="2 4" vertical={false}/>
                  <XAxis dataKey="label" stroke="var(--text-dim)" fontSize={9} tickLine={false} axisLine={{stroke: "var(--border)"}} interval={Math.max(1, Math.floor(rangeDays/10))}/>
                  <YAxis stroke="var(--text-dim)" fontSize={10} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", fontSize: 11, fontFamily: "var(--font-mono)" }}/>
                  <Line type="monotone" dataKey="printed" stroke="var(--ink-cyan)" strokeWidth={2} dot={{ r: 2 }}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="trend-stats">
            <div className="ts-card">
              <div className="ts-label">AVERAGE OUTPUT</div>
              <div className="ts-val">{outputTrend.avg}<span>tees/day</span></div>
              <div className="ts-sub">across {outputTrend.workingDays} working days</div>
            </div>
            <div className="ts-card ts-good">
              <div className="ts-label">BEST DAY</div>
              <div className="ts-val">{outputTrend.best.printed}<span>tees</span></div>
              <div className="ts-sub">{outputTrend.best.label || "—"}</div>
            </div>
            <div className="ts-card ts-bad">
              <div className="ts-label">SLOWEST DAY</div>
              <div className="ts-val">{outputTrend.worst?.printed || 0}<span>tees</span></div>
              <div className="ts-sub">{outputTrend.worst?.label || "—"}</div>
            </div>
          </div>

          {outputTrend.anomalies.length > 0 && (
            <section className="panel">
              <div className="panel-head"><div><h2>ANOMALIES</h2><div className="panel-sub">days {">"}30% away from average</div></div></div>
              <div className="anomaly-list">
                {outputTrend.anomalies.map((a, i) => (
                  <div key={i} className={`anomaly-row ${a.deviation > 0 ? "anom-up" : "anom-down"}`}>
                    <div className="anom-date">{a.label} {a.isSunday && <span className="sun-tag">SUN</span>}</div>
                    <div className="anom-val">{a.printed} tees</div>
                    <div className="anom-vs">vs avg {a.avg}</div>
                    <div className="anom-dev">
                      {a.deviation > 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
                      {a.deviation > 0 ? "+" : ""}{a.deviation}%
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ═══════ COST BREAKDOWN ═══════ */}
      {activeReport === "costs" && (
        <div className="insight-body">
          <div className="cost-headline">
            <div className="ch-item">
              <div className="ch-label">TOTAL EXPENSES · {rangeDays}D</div>
              <div className="ch-val">₹{metrics.totalExp.toLocaleString("en-IN")}</div>
            </div>
            <div className="ch-item">
              <div className="ch-label">COST PER TEE PRINTED</div>
              <div className="ch-val ch-yellow">₹{costBreakdown.costPerTee}</div>
              <div className="ch-sub">all costs ÷ {metrics.totalPrinted} tees</div>
            </div>
          </div>

          <section className="panel">
            <div className="panel-head"><div><h2>WHAT'S EATING PROFIT</h2><div className="panel-sub">expense category breakdown</div></div></div>
            {costBreakdown.entries.length === 0 ? (
              <div className="empty">No expenses in this period.</div>
            ) : (
              <div className="cost-breakdown">
                {costBreakdown.entries.map((e, i) => (
                  <div key={e.cat} className="cb-row">
                    <div className="cb-rank">#{i + 1}</div>
                    <div className="cb-cat">{e.cat}</div>
                    <div className="cb-bar">
                      <div className="cb-bar-fill" style={{ width: `${e.pct}%` }}></div>
                    </div>
                    <div className="cb-pct mono">{e.pct}%</div>
                    <div className="cb-amt mono"><strong>₹{e.amt.toLocaleString("en-IN")}</strong></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ═══════ STOCK TURNOVER ═══════ */}
      {activeReport === "stock" && (
        <div className="insight-body">
          {stockTurnover.fast.length > 0 && (
            <section className="panel panel-alert">
              <div className="panel-head"><div><h2>⚠ LOW STOCK ALERTS</h2><div className="panel-sub">under 14 days cover at current pace</div></div></div>
              <div className="stock-alerts">
                {stockTurnover.fast.map(i => (
                  <div key={i.id} className="sa-row">
                    <ClientChip client={i.client}/>
                    <div className="sa-prod">{i.product}</div>
                    <div className="sa-stat"><strong>{i.currentStock}</strong><span>in stock</span></div>
                    <div className="sa-stat sa-danger"><strong>~{i.daysOfCover}</strong><span>days cover</span></div>
                    <div className="sa-rate">{i.movementPerDay}/day</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head"><div><h2>ALL STOCK · SORTED BY MOVEMENT</h2><div className="panel-sub">fastest movers first</div></div></div>
            <div className="turnover-table">
              <div className="tt-thead">
                <div>CLIENT</div><div>PRODUCT</div><div>IN STOCK</div><div>MOVED · {rangeDays}D</div><div>RATE</div><div>DAYS COVER</div>
              </div>
              {stockTurnover.items.map(i => (
                <div key={i.id} className="tt-row">
                  <div><ClientChip client={i.client}/></div>
                  <div className="tt-prod">{i.product}</div>
                  <div className="mono"><strong>{i.currentStock}</strong></div>
                  <div className="mono">{i.movedInRange > 0 ? i.movedInRange : <span className="muted">0</span>}</div>
                  <div className="mono dim">{i.movementPerDay}/day</div>
                  <div className="mono">
                    {i.daysOfCover === null ? <span className="muted">—</span>
                     : i.daysOfCover < 14 ? <span className="neg"><strong>{i.daysOfCover}d</strong></span>
                     : <span>{i.daysOfCover}d</span>}
                  </div>
                </div>
              ))}
              {stockTurnover.items.length === 0 && <div className="empty">No warehouse stock recorded.</div>}
            </div>
          </section>

          {stockTurnover.slow.length > 0 && (
            <section className="panel">
              <div className="panel-head"><div><h2>○ DEAD STOCK</h2><div className="panel-sub">zero movement in {rangeDays} days</div></div></div>
              <div className="dead-stock-list">
                {stockTurnover.slow.map(i => (
                  <div key={i.id} className="ds-row">
                    <ClientChip client={i.client}/>
                    <span className="ds-prod">{i.product}</span>
                    <span className="ds-qty">{i.currentStock} pcs sitting idle</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CLIENT APP — what tenants like Hashway see
// Scoped to a single tenant_id by RLS; admin can also impersonate.
// ═══════════════════════════════════════════════════════════════════
const POD_STATUSES = [
  { id: "new",              label: "New",              short: "NEW" },
  { id: "under_processing", label: "Under processing", short: "PROCESSING" },
  { id: "packing",          label: "Packing",          short: "PACKING" },
  { id: "dispatching",      label: "Dispatching",      short: "DISPATCHING" },
  { id: "in_transit",       label: "In transit",       short: "IN TRANSIT" },
  { id: "delivered",        label: "Delivered",        short: "DELIVERED" },
  { id: "on_hold",          label: "On hold",          short: "ON HOLD" },
  { id: "cancelled",        label: "Cancelled",        short: "CANCELLED" },
];
const POD_STATUS_LABEL = Object.fromEntries(POD_STATUSES.map(s => [s.id, s.label]));

function ClientApp({ profile }) {
  const [page, setPage] = useState("orders");
  const [tenant, setTenant] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [theme, setTheme] = useState(() => {
    if (typeof document !== "undefined" && document.documentElement.dataset.theme) return document.documentElement.dataset.theme;
    try { return localStorage.getItem("pressroom-theme") || "dark"; } catch { return "dark"; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("pressroom-theme", theme); } catch {}
  }, [theme]);

  const loadAll = useCallback(async () => {
    if (!profile.tenant_id) { setLoadError("Your account isn't linked to a brand yet. Ask admin."); setLoaded(true); return; }
    try {
      const [t, o] = await Promise.all([
        fetchTenant(profile.tenant_id),
        fetchShopifyOrders(profile.tenant_id),
      ]);
      setTenant(t);
      setOrders(o);
      setLoaded(true);
    } catch (e) {
      setLoadError(e.message); setLoaded(true);
    }
  }, [profile.tenant_id]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const unsub = subscribe("shopify_orders", () => loadAll());
    return () => unsub && unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded) {
    return <div className="boot"><style>{css}</style><div className="boot-inner"><div className="boot-mark"></div>LOADING DASHBOARD…</div></div>;
  }

  const pages = {
    overview: <ClientOverview tenant={tenant} orders={orders} goto={setPage} />,
    orders:   <ClientOrders tenant={tenant} orders={orders} refresh={loadAll} isAdmin={false} />,
    shipping: <ClientShipping orders={orders} />,
    wallet:   <ClientWallet tenant={tenant} />,
    settings: <ClientSettings tenant={tenant} profile={profile} />,
  };

  return (
    <div className="app">
      <style>{css}</style>
      <ClientSidebar page={page} setPage={setPage} tenant={tenant} profile={profile} />
      <div className="main">
        <ClientTopBar tenant={tenant} orders={orders} theme={theme} setTheme={setTheme} />
        <div className="page">
          {loadError && <div className="geo-alert geo-alert-err"><AlertTriangle size={14}/> {loadError}</div>}
          {pages[page]}
        </div>
      </div>
    </div>
  );
}

function ClientSidebar({ page, setPage, tenant, profile }) {
  const nav = [
    { id: "overview", label: "Overview",  icon: LayoutDashboard },
    { id: "orders",   label: "Orders",    icon: ClipboardList },
    { id: "shipping", label: "Shipping",  icon: Truck },
    { id: "wallet",   label: "Wallet",    icon: Wallet },
    { id: "settings", label: "Settings",  icon: Activity },
  ];
  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-mark">
          <svg viewBox="0 0 40 40" width="22" height="22">
            <rect x="4" y="8" width="32" height="24" fill="none" stroke="currentColor" strokeWidth="2.5"/>
            <rect x="10" y="14" width="20" height="12" fill="currentColor"/>
            <circle cx="32" cy="12" r="1.5" fill="var(--ink-yellow)"/>
          </svg>
        </div>
        <div>
          <div className="logo-name">{tenant?.name?.toUpperCase() || "BRAND"}<span className="dot">.</span>OPS</div>
          <div className="logo-sub">powered by pressroom</div>
        </div>
      </div>
      <nav className="nav">
        {nav.map(n => {
          const Icon = n.icon;
          return (
            <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
              <Icon size={15}/>
              <span>{n.label}</span>
              {page === n.id && <ChevronRight size={12} className="nav-chev"/>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <div className="foot-user">
          <div className="foot-avatar">{(profile?.name || tenant?.name || "?").slice(0,2).toUpperCase()}</div>
          <div>
            <div className="foot-name">{profile?.name || tenant?.name}</div>
            <div className="foot-sub">client · {tenant?.slug}</div>
          </div>
        </div>
        <button className="btn-ghost foot-logout" onClick={() => signOut()}>
          <LogOut size={11}/> SIGN OUT
        </button>
      </div>
    </aside>
  );
}

function ClientTopBar({ tenant, orders, theme, setTheme }) {
  const inProcess = orders.filter(o => ["under_processing","packing","dispatching"].includes(o.pod_status)).length;
  const inTransit = orders.filter(o => o.pod_status === "in_transit").length;
  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="date-chip"><Calendar size={12}/>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</div>
      </div>
      <div className="topbar-right">
        <div className="presence"><span className="pulse"></span><span>{inProcess} processing · {inTransit} in transit</span></div>
        <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "light" ? <Moon size={14}/> : <Sun size={14}/>}
        </button>
      </div>
    </header>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────
function ClientOverview({ tenant, orders, goto }) {
  const counts = useMemo(() => {
    const c = { new: 0, under_processing: 0, packing: 0, dispatching: 0, in_transit: 0, delivered: 0 };
    for (const o of orders) c[o.pod_status] = (c[o.pod_status] || 0) + 1;
    return c;
  }, [orders]);
  const totalValue = orders.reduce((s, o) => s + Number(o.total_price || 0), 0);

  return (
    <div className="dash">
      <PageHeader title={`${tenant?.name || "Brand"} · Overview`} sub="orders synced from your Shopify store" />
      <div className="kpi-grid kpi-4">
        <KPICard label="New / Awaiting"    value={counts.new}              unit="orders" icon={ClipboardList} accent="yellow" onClick={() => goto("orders")} />
        <KPICard label="In Production"     value={counts.under_processing + counts.packing} unit="orders" icon={Printer} accent="amber"  onClick={() => goto("orders")} />
        <KPICard label="In Transit"        value={counts.in_transit}       unit="orders" icon={Truck} accent="cyan"    onClick={() => goto("shipping")} />
        <KPICard label="Delivered"         value={counts.delivered}        unit="orders" icon={Check} accent="green"   onClick={() => goto("orders")} />
      </div>
      <section className="panel" style={{marginTop: 16}}>
        <div className="panel-head">
          <div><h2>RECENT ORDERS</h2><div className="panel-sub">latest 5 orders synced</div></div>
          <button className="btn-ghost" onClick={() => goto("orders")}>VIEW ALL →</button>
        </div>
        <div className="recent-list">
          {orders.slice(0, 5).map(o => (
            <div key={o.id} className="recent-item">
              <div>
                <div className="recent-prod">{o.shopify_order_name || "#—"} · {o.customer_name || "—"}</div>
                <div className="recent-meta">{o.shipping_address?.city || "—"} · {(o.line_items || []).length} items · {o.shopify_created_at?.slice(0,10)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <OrderStatusPill status={o.pod_status}/>
                <div className="recent-qty"><strong>₹{Number(o.total_price || 0).toLocaleString("en-IN")}</strong></div>
              </div>
            </div>
          ))}
          {orders.length === 0 && <div className="empty">No orders synced yet. Click <strong>SYNC ORDERS</strong> on the Orders page.</div>}
        </div>
      </section>
    </div>
  );
}

// ─── Orders (the main client page) ─────────────────────────────────────
function ClientOrders({ tenant, orders, refresh, isAdmin }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [updating, setUpdating] = useState(null); // orderId being updated

  const sync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await syncShopifyOrders(tenant?.id);
      setSyncMsg(`Synced ${r.fetched} orders · ${r.inserted} new · ${r.updated} updated`);
      refresh();
    } catch (e) {
      setSyncMsg(`Sync failed: ${e.message}`);
    }
    setSyncing(false);
  };

  const setStatus = async (orderId, podStatus) => {
    setUpdating(orderId);
    try {
      await updatePodStatus(orderId, podStatus);
      refresh();
    } catch (e) {
      alert("Could not update: " + e.message);
    }
    setUpdating(null);
  };

  const filtered = orders.filter(o => {
    if (filter !== "all" && o.pod_status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [o.shopify_order_name, o.customer_name, o.customer_email, o.shipping_address?.city].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = useMemo(() => {
    const c = { all: orders.length };
    for (const s of POD_STATUSES) c[s.id] = 0;
    for (const o of orders) c[o.pod_status] = (c[o.pod_status] || 0) + 1;
    return c;
  }, [orders]);

  return (
    <div>
      <PageHeader
        title="Orders"
        sub={tenant ? `synced from ${tenant.shopify_domain}` : "Shopify orders"}
        action={
          <button className="btn-primary sync-btn" onClick={sync} disabled={syncing}>
            <RefreshCw size={13} className={syncing ? "spin" : ""}/> {syncing ? "SYNCING…" : "SYNC ORDERS"}
          </button>
        }/>

      {syncMsg && <div className={`sync-banner ${syncMsg.startsWith("Sync failed") ? "err" : "ok"}`}>{syncMsg}</div>}

      <div className="orders-filter-bar">
        <div className="status-chip-row">
          <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>
            ALL <span className="chip-count">{counts.all}</span>
          </button>
          {POD_STATUSES.filter(s => s.id !== "cancelled").map(s => (
            <button key={s.id} className={`chip status-chip status-${s.id} ${filter === s.id ? "on" : ""}`} onClick={() => setFilter(s.id)}>
              {s.short} <span className="chip-count">{counts[s.id] || 0}</span>
            </button>
          ))}
        </div>
        <div className="orders-search">
          <Search size={12}/>
          <input placeholder="search order #, customer, city…" value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
      </div>

      <div className="so-list">
        {filtered.map(o => (
          <ClientOrderRow key={o.id} order={o} onSetStatus={setStatus} updating={updating === o.id} canEditStatus={isAdmin} />
        ))}
        {filtered.length === 0 && (
          <div className="empty panel">
            {orders.length === 0
              ? <>No Shopify orders yet. Click <strong>SYNC ORDERS</strong> to pull from {tenant?.shopify_domain || "your store"}.</>
              : <>No orders match this filter.</>}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientOrderRow({ order, onSetStatus, updating, canEditStatus }) {
  const [expanded, setExpanded] = useState(false);
  const items = order.line_items || [];
  const itemsCount = items.reduce((s, li) => s + (li.quantity || 0), 0);
  const addr = order.shipping_address || {};
  const city = addr.city || "—";
  const state = addr.province || addr.province_code || "";

  const shopifyAdminUrl = order.shopify_order_id
    ? `https://${order.tenant_id === "t-hashway" ? "cd042a-2" : order.tenant_id}.myshopify.com/admin/orders/${order.shopify_order_id}`
    : null;

  return (
    <section className={`panel so-card so-${order.pod_status}`}>
      <div className="so-head" onClick={() => setExpanded(!expanded)}>
        <div className="so-id">
          <div className="so-name">{order.shopify_order_name || `#${order.shopify_order_number || "—"}`}</div>
          <div className="so-meta mono">{order.shopify_created_at?.slice(0, 10)} · {order.financial_status || "—"}</div>
        </div>
        <div className="so-customer">
          <div className="so-cust-name">{order.customer_name || "—"}</div>
          <div className="so-cust-loc"><MapPinned size={10}/> {city}{state ? `, ${state}` : ""}</div>
        </div>
        <div className="so-items">
          <div className="so-items-count"><strong>{itemsCount}</strong> {itemsCount === 1 ? "item" : "items"}</div>
          <div className="so-items-line">{items[0]?.name || "—"}{items.length > 1 && ` +${items.length - 1}`}</div>
        </div>
        <div className="so-amount mono"><strong>₹{Number(order.total_price || 0).toLocaleString("en-IN")}</strong></div>
        <div className="so-status-cell">
          <OrderStatusPill status={order.pod_status}/>
        </div>
        <ChevronDown size={14} className={`so-chev ${expanded ? "open" : ""}`}/>
      </div>

      {expanded && (
        <div className="so-body">
          <div className="so-grid">
            <div className="so-block">
              <div className="so-label">SHIPPING ADDRESS</div>
              <div className="so-value">
                {addr.name || order.customer_name || "—"}<br/>
                {addr.address1}{addr.address2 ? `, ${addr.address2}` : ""}<br/>
                {city}{state ? `, ${state}` : ""} {addr.zip || ""}<br/>
                {addr.country || ""}
                {addr.phone && <><br/>📞 {addr.phone}</>}
              </div>
            </div>
            <div className="so-block">
              <div className="so-label">CONTACT</div>
              <div className="so-value">
                {order.customer_email || "—"}
                {order.customer_phone && <><br/>{order.customer_phone}</>}
              </div>
              {order.tracking_number && (
                <>
                  <div className="so-label" style={{marginTop: 10}}>TRACKING</div>
                  <div className="so-value">{order.tracking_company || "Courier"} · {order.tracking_number}</div>
                </>
              )}
            </div>
            <div className="so-block so-block-items">
              <div className="so-label">LINE ITEMS</div>
              <div className="so-line-items">
                {items.map((li, i) => (
                  <div key={i} className="so-li">
                    <div className="so-li-name">{li.name}</div>
                    <div className="so-li-meta mono">{li.sku || "no SKU"}{li.variant_title ? ` · ${li.variant_title}` : ""}</div>
                    <div className="so-li-qty mono">×{li.quantity}</div>
                    <div className="so-li-price mono">₹{Number(li.price || 0).toLocaleString("en-IN")}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {order.status_history && order.status_history.length > 0 && (
            <div className="so-history">
              <div className="so-label">STATUS HISTORY</div>
              <div className="so-history-list">
                {order.status_history.map((h, i) => (
                  <div key={i} className="so-history-row">
                    <span className="mono dim">{new Date(h.changed_at).toLocaleString("en-IN")}</span>
                    <OrderStatusPill status={h.status} small/>
                    <span className="dim">by {h.changed_by}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="so-actions">
            {canEditStatus ? (
              <>
                <span className="so-actions-label">SET STATUS:</span>
                {POD_STATUSES.filter(s => !["cancelled"].includes(s.id)).map(s => (
                  <button key={s.id}
                    className={`btn-status ${order.pod_status === s.id ? "on" : ""}`}
                    disabled={updating || order.pod_status === s.id}
                    onClick={() => onSetStatus(order.id, s.id)}>
                    {s.short}
                  </button>
                ))}
              </>
            ) : (
              <span className="dim" style={{fontSize: 11}}>Status updates by the press operator only.</span>
            )}
            {shopifyAdminUrl && (
              <a href={shopifyAdminUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{marginLeft: "auto"}}>
                <ExternalLink size={11}/> SHOPIFY
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function OrderStatusPill({ status, small }) {
  const lbl = (POD_STATUSES.find(s => s.id === status) || POD_STATUSES[0]).short;
  return <span className={`status-pill-pod status-${status} ${small ? "sp-sm" : ""}`}>{lbl}</span>;
}

// ─── Shipping (placeholder + real-ish view) ────────────────────────────
function ClientShipping({ orders }) {
  const inTransit = orders.filter(o => o.pod_status === "in_transit");
  const delivered = orders.filter(o => o.pod_status === "delivered");
  const dispatching = orders.filter(o => o.pod_status === "dispatching");
  return (
    <div>
      <PageHeader title="Shipping" sub="dispatch + transit + delivered" />
      <div className="kpi-grid kpi-4">
        <KPICard label="Dispatching" value={dispatching.length} unit="orders" icon={Package} accent="amber" />
        <KPICard label="In Transit"  value={inTransit.length}   unit="orders" icon={Truck}   accent="cyan" />
        <KPICard label="Delivered"   value={delivered.length}   unit="orders" icon={Check}   accent="green" />
        <KPICard label="Delivery rate" value={orders.length ? `${Math.round(delivered.length/orders.length*100)}%` : "—"} icon={TrendingUp} accent="yellow" />
      </div>
      <section className="panel" style={{marginTop: 16}}>
        <div className="panel-head"><div><h2>SHIPMENTS · IN TRANSIT</h2></div></div>
        <div className="recent-list">
          {inTransit.map(o => (
            <div key={o.id} className="recent-item">
              <div>
                <div className="recent-prod">{o.shopify_order_name} · {o.customer_name}</div>
                <div className="recent-meta">
                  {o.tracking_company || "Courier"} · {o.tracking_number || "AWB pending"} · to {o.shipping_address?.city || "—"}
                </div>
              </div>
              <OrderStatusPill status={o.pod_status}/>
            </div>
          ))}
          {inTransit.length === 0 && <div className="empty">No shipments in transit.</div>}
        </div>
      </section>
    </div>
  );
}

function ClientWallet({ tenant }) {
  return (
    <div>
      <PageHeader title="Wallet" sub="prepaid balance + transactions" />
      <section className="panel" style={{padding: 32, textAlign: "center"}}>
        <Wallet size={28} style={{ color: "var(--text-dim)", marginBottom: 12 }}/>
        <h2 style={{margin: 0}}>Wallet coming soon</h2>
        <p className="dim" style={{marginTop: 8}}>Top-up, auto-debit on order acceptance, and statement download will land here next.</p>
      </section>
    </div>
  );
}

// ─── Admin: see all clients' Shopify orders + edit pod_status ─────────
function AdminClientOrders() {
  const [orders, setOrders] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [activeTenant, setActiveTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tList, oList] = await Promise.all([
        supabase.from("tenants").select("*").then(r => r.data || []),
        fetchShopifyOrders(null),
      ]);
      setTenants(tList);
      setOrders(oList);
      if (!activeTenant && tList.length > 0) setActiveTenant(tList[0].id);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [activeTenant]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const u = subscribe("shopify_orders", () => load());
    return () => u && u();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tenant = tenants.find(t => t.id === activeTenant);
  const tenantOrders = orders.filter(o => o.tenant_id === activeTenant);

  if (loading && orders.length === 0) {
    return <div className="empty panel">Loading client orders…</div>;
  }

  return (
    <div>
      <div className="filter-bar wh-filter-bar" style={{ marginBottom: 14 }}>
        <div className="wh-kind-toggle">
          {tenants.map(t => (
            <button key={t.id} className={`wh-kind-btn ${activeTenant === t.id ? "on" : ""}`} onClick={() => setActiveTenant(t.id)}>
              {t.name.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="filter-summary">
          <span>{tenantOrders.length} orders · {tenant?.shopify_domain || "—"}</span>
        </div>
      </div>
      <ClientOrders tenant={tenant} orders={tenantOrders} refresh={load} isAdmin={true} />
    </div>
  );
}

function ClientSettings({ tenant, profile }) {
  return (
    <div>
      <PageHeader title="Settings" sub="brand, integrations, team" />
      <section className="panel" style={{padding: 24}}>
        <div className="set-row"><div className="set-label">Brand</div><div className="set-val">{tenant?.name}</div></div>
        <div className="set-row"><div className="set-label">Slug</div><div className="set-val mono">{tenant?.slug}</div></div>
        <div className="set-row"><div className="set-label">Shopify store</div><div className="set-val mono"><a href={`https://${tenant?.shopify_domain}`} target="_blank" rel="noopener noreferrer">{tenant?.shopify_domain} <ExternalLink size={11}/></a></div></div>
        <div className="set-row"><div className="set-label">Signed in as</div><div className="set-val">{profile.name}</div></div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════
function PageHeader({ title, sub, action }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <div className="page-sub">{sub}</div>
      </div>
      {action}
    </div>
  );
}

function KPICard({ label, value, unit, icon: Icon, accent, onClick }) {
  return (
    <button className={`kpi kpi-${accent}`} onClick={onClick}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <Icon size={14} className="kpi-icon"/>
      </div>
      <div className="kpi-value">
        {value}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
    </button>
  );
}

function ClientChip({ client }) {
  const cls = client === "Hashway" ? "cc-hw" : client === "Culture Circle" ? "cc-cc" : "cc-x";
  return <span className={`client-chip ${cls}`}>{client}</span>;
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={14}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════
const css = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Archivo+Black&family=Space+Grotesk:wght@400;500;600;700&display=swap');

:root, [data-theme="dark"] {
  --bg-main: #0a0a0a;
  --bg-panel: #131313;
  --bg-elevated: #1a1a1a;
  --bg-row: #161616;
  --bg-input: #0d0d0d;
  --border: #262626;
  --border-dim: #1c1c1c;
  --border-bright: #383838;
  --text: #efefef;
  --text-dim: #909090;
  --text-muted: #5a5a5a;

  /* Primary accent — name kept for backward compat. Pure monochrome:
     #efefef on dark, #1a1a1c on light. */
  --ink-yellow: #efefef;
  /* Status/category inks — preserved as functional signals */
  --ink-amber: #ff9500;
  --ink-cyan: #00d4ff;
  --ink-green: #4ade80;
  --ink-red: #ff4444;
  --ink-slate: #6b7280;

  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --font-display: 'Archivo Black', sans-serif;
  --font-sans: 'Space Grotesk', sans-serif;
}

[data-theme="light"] {
  --bg-main: #efefef;
  --bg-panel: #ffffff;
  --bg-elevated: #f7f7f7;
  --bg-row: #fafafa;
  --bg-input: #ececec;
  --border: #d4d4d4;
  --border-dim: #e6e6e6;
  --border-bright: #b8b8b8;
  --text: #0a0a0a;
  --text-dim: #555555;
  --text-muted: #8a8a8a;

  /* Primary accent — pure black on the light theme */
  --ink-yellow: #0a0a0a;
  --ink-amber: #c87000;
  --ink-cyan: #0099b8;
  --ink-green: #16a34a;
  --ink-red: #dc2626;
  --ink-slate: #64748b;
}
[data-theme="light"] .logo-mark { color: #fff; }
[data-theme="light"] .pc-avatar { color: #fff; }
[data-theme="light"] .chip.on, [data-theme="light"] .wh-kind-btn.on { color: #fff; }
[data-theme="light"] .btn-primary { color: #fff; }
[data-theme="light"] .doc-type, [data-theme="light"] table.items thead th, [data-theme="light"] table.totals tr.grand td { color: var(--text); }

* { box-sizing: border-box; }

body, .app {
  background: var(--bg-main);
  color: var(--text);
  font-family: var(--font-sans);
}

.boot {
  min-height: 100vh; background: var(--bg-main);
  display: grid; place-items: center;
  font-family: var(--font-mono); color: var(--text-dim);
  font-size: 11px; letter-spacing: 0.2em;
}
.boot-inner { display: flex; align-items: center; gap: 12px; }
.boot-mark { width: 8px; height: 8px; background: var(--ink-yellow); animation: pulse 1s infinite; }

.app {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
  background-image:
    linear-gradient(var(--border-dim) 1px, transparent 1px),
    linear-gradient(90deg, var(--border-dim) 1px, transparent 1px);
  background-size: 48px 48px;
}

/* ═══ SIDEBAR ═══ */
.sidebar {
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
}
.logo {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 18px 18px;
  border-bottom: 1px solid var(--border);
}
.logo-mark {
  width: 34px; height: 34px;
  background: var(--ink-yellow);
  color: var(--bg-main);
  display: grid; place-items: center;
  transform: rotate(-4deg);
}
.logo-name {
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 0.02em;
  line-height: 1;
}
.logo-name .dot { color: var(--ink-yellow); }
.logo-sub {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
  margin-top: 3px;
}

.nav { padding: 10px 8px; flex: 1; }
.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  color: var(--text-dim);
  padding: 10px 12px;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  margin-bottom: 2px;
  transition: all 0.12s;
  position: relative;
}
.nav-item:hover { color: var(--text); background: var(--bg-elevated); }
.nav-item.active {
  color: var(--bg-main);
  background: var(--ink-yellow);
  font-weight: 600;
}
.nav-chev { margin-left: auto; }

.sidebar-foot {
  padding: 14px 18px;
  border-top: 1px solid var(--border);
}
.foot-label {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.2em;
  color: var(--ink-green);
}
.foot-sub {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  margin-top: 3px;
  letter-spacing: 0.1em;
}

/* ═══ MAIN ═══ */
.main { min-width: 0; }
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
  position: sticky; top: 0; z-index: 20;
}
.date-chip {
  display: flex; align-items: center; gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  letter-spacing: 0.05em;
  padding: 5px 10px;
  border: 1px solid var(--border);
}
.topbar-right { display: flex; align-items: center; gap: 16px; }
.presence {
  display: flex; align-items: center; gap: 7px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  letter-spacing: 0.05em;
}
.pulse {
  width: 7px; height: 7px;
  background: var(--ink-green);
  border-radius: 50%;
  box-shadow: 0 0 6px var(--ink-green);
  animation: pulse 1.6s infinite;
}
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
.clock {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-yellow);
  letter-spacing: 0.08em;
  padding: 4px 10px;
  border: 1px solid var(--border-bright);
}

.theme-toggle {
  background: transparent;
  border: 1px solid var(--border-bright);
  color: var(--text-dim);
  width: 30px; height: 30px;
  display: inline-grid; place-items: center;
  cursor: pointer;
  transition: all 0.15s;
}
.theme-toggle:hover { color: var(--ink-yellow); border-color: var(--ink-yellow); }

.page { padding: 24px; }

/* ═══ PAGE HEADER ═══ */
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
  gap: 20px;
}
.page-head h1 {
  font-family: var(--font-display);
  font-size: 28px;
  margin: 0;
  letter-spacing: -0.01em;
}
.page-sub {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  margin-top: 6px;
}

/* ═══ PANEL ═══ */
.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  margin-bottom: 16px;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
  flex-wrap: wrap;
}
.panel-head h2 {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.04em;
  margin: 0;
}
.panel-sub {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 0.12em;
  margin-top: 3px;
  text-transform: uppercase;
}

/* ═══ BUTTONS ═══ */
.btn-primary {
  background: var(--ink-yellow); color: var(--bg-main);
  border: none; padding: 8px 14px;
  font-family: var(--font-mono); font-size: 11px;
  font-weight: 700; letter-spacing: 0.1em;
  cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
  transition: all 0.15s;
}
.btn-primary:hover:not(:disabled) { background: #fff14d; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary.sm { padding: 5px 10px; font-size: 10px; }

.btn-ghost {
  background: transparent; color: var(--text-dim);
  border: 1px solid var(--border-bright);
  padding: 6px 12px;
  font-family: var(--font-mono); font-size: 10px;
  font-weight: 600; letter-spacing: 0.08em;
  cursor: pointer; transition: all 0.15s;
  display: inline-flex; align-items: center; gap: 5px;
}
.btn-ghost:hover { color: var(--ink-yellow); border-color: var(--ink-yellow); }
.btn-ghost.sm { padding: 4px 8px; font-size: 9px; }

.btn-danger {
  background: var(--ink-red); color: #fff;
  border: none; padding: 6px 12px;
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  letter-spacing: 0.1em; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
}
.btn-danger.sm { padding: 5px 10px; font-size: 10px; }
.btn-danger:hover { background: #ff6b6b; }

.icon-btn {
  background: transparent; border: 1px solid var(--border);
  color: var(--text-dim); width: 26px; height: 26px;
  display: grid; place-items: center;
  cursor: pointer; transition: all 0.15s;
}
.icon-btn:hover { color: var(--ink-red); border-color: var(--ink-red); }

/* ═══ KPI CARDS ═══ */
.kpi-grid {
  display: grid;
  gap: 12px;
  margin-bottom: 20px;
}
.kpi-grid.kpi-6 { grid-template-columns: repeat(6, 1fr); }
.kpi-grid.kpi-4 { grid-template-columns: repeat(4, 1fr); }
.kpi {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  padding: 14px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: all 0.15s;
}
.kpi:hover { border-color: var(--border-bright); transform: translateY(-1px); }
.kpi::before {
  content: '';
  position: absolute; top: 0; left: 0;
  width: 3px; height: 100%;
  background: var(--accent);
}
.kpi-yellow { --accent: var(--ink-yellow); }
.kpi-cyan   { --accent: var(--ink-cyan); }
.kpi-green  { --accent: var(--ink-green); }
.kpi-red    { --accent: var(--ink-red); }
.kpi-amber  { --accent: var(--ink-amber); }
.kpi-slate  { --accent: var(--ink-slate); }

.kpi-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.kpi-label {
  font-family: var(--font-mono);
  font-size: 9px; letter-spacing: 0.15em;
  color: var(--text-dim); text-transform: uppercase;
}
.kpi-icon { color: var(--accent); }
.kpi-value {
  font-family: var(--font-display);
  font-size: 26px; line-height: 1;
  letter-spacing: -0.02em; color: var(--text);
}
.kpi-unit {
  font-family: var(--font-mono);
  font-size: 10px; font-weight: 500;
  color: var(--text-dim); margin-left: 5px; letter-spacing: 0;
}

/* ═══ DASH GRID ═══ */
.dash-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
}

.recent-list { padding: 6px 0; }
.recent-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-dim);
}
.recent-item:last-child { border-bottom: none; }
.recent-prod { font-weight: 600; font-size: 13px; }
.recent-meta { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); letter-spacing: 0.05em; margin-top: 3px; }
.recent-qty { font-family: var(--font-mono); font-size: 14px; font-weight: 700; }
.recent-qty span { font-size: 10px; color: var(--text-dim); margin-left: 3px; font-weight: 400; }

/* ═══ CLIENT CHIP ═══ */
.client-chip {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 3px 7px;
  border: 1px solid currentColor;
  white-space: nowrap;
}
.cc-hw { color: var(--ink-yellow); }
.cc-cc { color: var(--ink-cyan); }

/* ═══ ATTENDANCE ═══ */
.worker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  padding: 14px 18px 18px;
}
.worker-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  padding: 14px;
  transition: all 0.15s;
}
.worker-card.active { border-color: var(--ink-green); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink-green) 30%, transparent); }
.worker-card.done { opacity: 0.6; }
.worker-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.worker-name { font-weight: 600; font-size: 15px; }
.worker-role { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); letter-spacing: 0.05em; margin-top: 3px; }
.worker-status {
  font-family: var(--font-mono); font-size: 10px; font-weight: 700;
  letter-spacing: 0.15em; padding: 3px 7px;
}
.s-in { background: color-mix(in srgb, var(--ink-green) 20%, transparent); color: var(--ink-green); }
.s-done { background: var(--bg-row); color: var(--text-muted); }
.s-out { color: var(--text-muted); }

.worker-times {
  display: flex; gap: 12px; flex-wrap: wrap;
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-dim); letter-spacing: 0.05em;
  margin-bottom: 10px;
}
.worker-times strong { color: var(--text); }
.worker-hrs { color: var(--ink-yellow) !important; }

.worker-actions { display: flex; align-items: center; }
.sm-text { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; }

.log-table { padding: 6px 0; }
.log-thead, .log-row {
  display: grid;
  grid-template-columns: 100px 1fr 150px 70px 80px 90px;
  gap: 12px;
  padding: 10px 18px;
  align-items: center;
  font-size: 12px;
}
.log-times { display: flex; align-items: center; gap: 4px; }
.log-sep { color: var(--text-muted); font-size: 11px; }
.log-thead {
  font-family: var(--font-mono);
  font-size: 9px; color: var(--text-muted);
  letter-spacing: 0.15em;
  border-bottom: 1px solid var(--border-dim);
}
.log-row { border-bottom: 1px solid var(--border-dim); }
.log-row:hover { background: var(--bg-row); }
.mono { font-family: var(--font-mono); }
.dim { color: var(--text-dim); }
.muted { color: var(--text-muted); }
.live-tag {
  background: color-mix(in srgb, var(--ink-green) 20%, transparent);
  color: var(--ink-green); padding: 2px 6px;
  font-size: 9px; letter-spacing: 0.15em; font-weight: 700;
}

/* ═══ PRODUCTION ═══ */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.mono-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
  display: flex;
  align-items: center;
  gap: 8px;
}
.mono-label input, .mono-label select {
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 5px 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  outline: none;
}
.filter-summary {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  letter-spacing: 0.05em;
}
.filter-summary strong { color: var(--ink-yellow); font-size: 13px; }
.dot-sep { margin: 0 8px; color: var(--text-muted); }

.chip-group { display: flex; gap: 6px; }
.chip {
  background: transparent;
  border: 1px solid var(--border-bright);
  color: var(--text-dim);
  padding: 5px 12px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: all 0.15s;
}
.chip:hover { color: var(--text); border-color: var(--text); }
.chip.on { background: var(--ink-yellow); color: var(--bg-main); border-color: var(--ink-yellow); }

.date-range-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.date-range-bar .chip-group { flex-wrap: wrap; }
.date-range-pickers {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding: 4px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
}
.date-range-icon { color: var(--text-dim); }
.date-range-input {
  background: transparent;
  border: none;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 3px 2px;
  outline: none;
  color-scheme: dark;
  cursor: pointer;
  min-width: 118px;
}
.date-range-input::-webkit-calendar-picker-indicator {
  filter: invert(0.8);
  cursor: pointer;
}
.date-range-sep { color: var(--text-dim); font-size: 11px; }
@media (max-width: 640px) {
  .date-range-bar { padding: 10px; gap: 10px; }
  .date-range-pickers { margin-left: 0; width: 100%; justify-content: space-between; padding: 4px 6px; gap: 4px; }
  .date-range-icon { display: none; }
  .date-range-input { min-width: 0; flex: 1; font-size: 11px; padding: 4px 0; letter-spacing: -0.02em; }
  .date-range-bar .chip { padding: 6px 9px; font-size: 10px; }
}

.breakdown {
  padding: 14px 18px;
  display: flex; flex-wrap: wrap; gap: 10px;
}
.bd-item {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-elevated);
  padding: 8px 12px;
  border: 1px solid var(--border);
  font-size: 12px;
}
.bd-prod { font-weight: 500; }
.bd-qty {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--ink-yellow);
  padding-left: 10px;
  margin-left: 4px;
  border-left: 1px solid var(--border-bright);
}

.prod-table { padding: 6px 0; overflow-x: auto; }
.prod-thead, .prod-row {
  display: grid;
  grid-template-columns: 100px 1fr 130px repeat(6, 50px) 70px 40px;
  gap: 8px;
  padding: 10px 18px;
  align-items: center;
  font-size: 12px;
  min-width: 900px;
}
.prod-thead {
  font-family: var(--font-mono);
  font-size: 9px; color: var(--text-muted);
  letter-spacing: 0.15em;
  border-bottom: 1px solid var(--border-dim);
}
.prod-row { border-bottom: 1px solid var(--border-dim); }
.prod-row:hover { background: var(--bg-row); }
.prod-name { font-weight: 500; }
.size-cell { text-align: center; }

.empty {
  padding: 40px 18px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.12em;
}

/* ═══ ORDERS ═══ */
.order-list { display: flex; flex-direction: column; gap: 14px; }
.order-card { margin-bottom: 0; }
.order-head {
  display: flex;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  gap: 20px;
  flex-wrap: wrap;
}
.order-id-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.order-id {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.05em;
}
.status-pill {
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700;
  letter-spacing: 0.15em;
  padding: 3px 8px;
  border: 1px solid currentColor;
}
.status-pill.active { color: var(--ink-amber); }
.status-pill.done { color: var(--ink-green); }
.order-meta { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); margin-top: 6px; letter-spacing: 0.05em; }

.order-head-right { display: flex; align-items: center; gap: 16px; }
.order-progress { min-width: 280px; }
.op-top { font-family: var(--font-mono); font-size: 11px; margin-bottom: 4px; }
.op-bar { height: 4px; background: var(--bg-elevated); position: relative; }
.op-bar-fill { height: 100%; background: var(--ink-yellow); transition: width 0.3s; }
.op-pct { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); margin-top: 4px; letter-spacing: 0.1em; }
.order-actions { display: flex; gap: 6px; align-items: center; }

.order-items { padding: 8px 18px 18px; display: flex; flex-direction: column; gap: 10px; }
.order-item {
  background: var(--bg-elevated);
  border: 1px solid var(--border-dim);
  padding: 12px 14px;
}
.oi-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.oi-prod { font-weight: 600; font-size: 13px; }
.oi-progress { font-family: var(--font-mono); font-size: 11px; color: var(--ink-yellow); letter-spacing: 0.05em; }

.oi-sizes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
}
.oi-size {
  background: var(--bg-main);
  border: 1px solid var(--border);
  padding: 8px 10px;
}
.oi-size.oi-done { border-color: color-mix(in srgb, var(--ink-green) 40%, var(--border)); }
.oi-size-sz {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.15em;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-dim);
}
.oi-size-nums {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
}
.oi-disp { color: var(--ink-yellow); }
.oi-slash { color: var(--text-muted); margin: 0 3px; }
.oi-total { color: var(--text); }
.oi-pending {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 0.08em;
  margin-top: 3px;
}
.oi-check { color: var(--ink-green); display: inline-flex; align-items: center; gap: 3px; justify-content: center; }

/* ═══ DAILY POD ═══ */
.master-sync {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 16px;
  margin-bottom: 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-left: 3px solid var(--ink-cyan);
  flex-wrap: wrap;
}
.master-sync-info { display: flex; align-items: flex-start; gap: 10px; }
.master-sync-title { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); letter-spacing: 0.18em; }
.master-sync-sub { font-family: var(--font-mono); font-size: 12px; color: var(--text); margin-top: 3px; }
.master-sync-sub strong { color: var(--ink-yellow); }
.spinning { animation: spin 1.4s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.upload-drop {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 110px;
  padding: 22px 18px;
  background: var(--bg-input);
  border: 2px dashed var(--border-bright);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}
.upload-drop:hover { border-color: var(--ink-yellow); background: var(--bg-elevated); }
.upload-drop-inner { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.upload-drop-inner svg { color: var(--ink-yellow); margin-bottom: 4px; }
.upload-title { font-family: var(--font-mono); font-size: 12px; font-weight: 700; letter-spacing: 0.18em; color: var(--text); }
.upload-sub { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); letter-spacing: 0.05em; }

.pod-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pod-table thead th {
  background: var(--bg-elevated);
  padding: 10px 12px;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.15em;
  color: var(--text-dim);
  border-bottom: 1px solid var(--border);
}
.pod-table tbody td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-dim);
  vertical-align: top;
}
.pod-table tbody tr:hover { background: var(--bg-elevated); }
.pod-prod { font-weight: 600; }
.pod-orderids { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); margin-top: 3px; letter-spacing: 0.05em; }
.pod-sizes { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; }
.pod-sizes span { background: var(--bg-input); padding: 2px 6px; border: 1px solid var(--border); }
.pod-link { max-width: 280px; }
@media (max-width: 720px) {
  .pod-table thead { display: none; }
  .pod-table, .pod-table tbody, .pod-table tr, .pod-table td { display: block; width: 100%; }
  .pod-table tr {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }
  .pod-table td {
    padding: 4px 0;
    border: none;
    display: flex; justify-content: space-between; gap: 12px;
  }
  .pod-table td.pod-prod { display: block; font-size: 14px; }
  .pod-table td.pod-prod::before { display: none; }
  .pod-table td:not(.pod-prod)::before {
    content: attr(data-label);
    font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); letter-spacing: 0.15em;
  }
}

/* ═══ WAREHOUSE ═══ */
.wh-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.wh-sum-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  padding: 16px;
  border-left: 3px solid var(--ink-cyan);
}
.wh-sum-card:first-child { border-left-color: var(--ink-yellow); }
.wh-sum-label { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); letter-spacing: 0.15em; }
.wh-sum-val { font-family: var(--font-display); font-size: 26px; margin-top: 6px; letter-spacing: -0.02em; }
.wh-sum-val span { font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); font-weight: 500; margin-left: 4px; letter-spacing: 0; }
.wh-sum-split { display: flex; gap: 16px; margin-top: 6px; }
.wh-sum-split > div { display: flex; flex-direction: column; gap: 2px; }
.wh-sum-split strong { font-family: var(--font-display); font-size: 20px; letter-spacing: -0.02em; }
.wh-split-lbl { font-family: var(--font-mono); font-size: 9px; color: var(--text-dim); letter-spacing: 0.15em; }

.wh-section .panel-head { display: flex; align-items: center; justify-content: space-between; }
.btn-primary.sm { padding: 5px 10px; font-size: 10px; }

.wh-filter-bar { flex-wrap: wrap; gap: 10px; }
.wh-kind-toggle {
  display: inline-flex;
  border: 1px solid var(--border-bright);
  overflow: hidden;
}
.wh-kind-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: all 0.15s;
}
.wh-kind-btn:hover { color: var(--text); }
.wh-kind-btn.on { background: var(--ink-yellow); color: var(--bg-main); }
.wh-kind-btn + .wh-kind-btn { border-left: 1px solid var(--border-bright); }

/* Order modal — DTF-stock hint */
.dtf-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  font-size: 12px;
  line-height: 1.45;
}
.dtf-hint.dtf-full { border-color: var(--ink-green); background: rgba(38, 192, 118, 0.08); }
.dtf-hint.dtf-partial { border-color: var(--ink-amber); background: rgba(255, 186, 46, 0.06); }
.dtf-hint > svg { margin-top: 2px; flex-shrink: 0; }
.dtf-hint.dtf-full > svg { color: var(--ink-green); }
.dtf-hint.dtf-partial > svg { color: var(--ink-amber); }
.dtf-breakdown { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; font-size: 11px; color: var(--text-dim); }

.wh-table { padding: 6px 0; overflow-x: auto; }
.wh-thead, .wh-row {
  display: grid;
  grid-template-columns: 130px 1fr repeat(6, 50px) 70px 70px;
  gap: 8px;
  padding: 10px 18px;
  align-items: center;
  font-size: 12px;
  min-width: 900px;
}
.wh-thead {
  font-family: var(--font-mono);
  font-size: 9px; color: var(--text-muted);
  letter-spacing: 0.15em;
  border-bottom: 1px solid var(--border-dim);
}
.wh-row { border-bottom: 1px solid var(--border-dim); }
.wh-row:hover { background: var(--bg-row); }
.wh-row.wh-low { border-left: 2px solid var(--ink-amber); }
.wh-sz { text-align: center; }
.wh-prod { font-weight: 500; }
.wh-actions { display: flex; gap: 6px; justify-content: flex-end; }

/* ═══ P&L ═══ */
.pnl-top {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.pnl-top.pnl-top-4 { grid-template-columns: repeat(4, 1fr); }
.pnl-top.pnl-top-5 { grid-template-columns: repeat(5, 1fr); }
@media (max-width: 1280px) { .pnl-top.pnl-top-5 { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 1100px) {
  .pnl-top.pnl-top-4 { grid-template-columns: repeat(2, 1fr); }
  .pnl-top.pnl-top-5 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px)  {
  .pnl-top.pnl-top-4 { grid-template-columns: repeat(2, 1fr); }
  .pnl-top.pnl-top-5 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 420px)  {
  .pnl-top.pnl-top-4 { grid-template-columns: 1fr; }
  .pnl-top.pnl-top-5 { grid-template-columns: 1fr; }
}
.pnl-cash::before { background: var(--ink-cyan); }
.pnl-cash .pnl-val { color: var(--ink-cyan); }
.pnl-gst::before { background: var(--ink-amber); }
.pnl-gst .pnl-val { color: var(--ink-amber); }
.pnl-big {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  padding: 20px;
  position: relative;
  overflow: hidden;
}
.pnl-big::before {
  content: '';
  position: absolute; top: 0; left: 0; bottom: 0;
  width: 4px;
}
.pnl-rev::before { background: var(--ink-green); }
.pnl-exp::before { background: var(--ink-red); }
.pnl-profit::before { background: var(--ink-yellow); }
.pnl-loss::before { background: var(--ink-red); }
.pnl-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.2em;
}
.pnl-val {
  font-family: var(--font-display);
  font-size: 34px;
  margin-top: 8px;
  letter-spacing: -0.02em;
}
.pnl-rev .pnl-val { color: var(--ink-green); }
.pnl-exp .pnl-val { color: var(--ink-red); }
.pnl-profit .pnl-val { color: var(--ink-yellow); }
.pnl-loss .pnl-val { color: var(--ink-red); }
.pnl-count {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.1em;
  margin-top: 6px;
}

.pnl-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.cat-list {
  padding: 10px 18px 16px;
  border-top: 1px solid var(--border-dim);
}
.cat-row {
  display: grid;
  grid-template-columns: 14px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 5px 0;
  font-size: 12px;
}
.cat-dot { width: 10px; height: 10px; }
.cat-name { font-weight: 500; }
.cat-val { font-weight: 700; }

.ledger { padding: 6px 0; overflow-x: auto; }
.ledger-thead, .ledger-row {
  display: grid;
  grid-template-columns: 100px 60px 140px 1fr 130px 40px;
  gap: 12px;
  padding: 10px 18px;
  align-items: center;
  font-size: 12px;
  min-width: 700px;
}
.ledger-thead {
  font-family: var(--font-mono);
  font-size: 9px; color: var(--text-muted);
  letter-spacing: 0.15em;
  border-bottom: 1px solid var(--border-dim);
}
.ledger-row { border-bottom: 1px solid var(--border-dim); }
.ledger-row:hover { background: var(--bg-row); }

.type-tag {
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700;
  letter-spacing: 0.15em;
  padding: 2px 6px;
}

/* ═══ INVOICE MODAL ═══ */
.inv-preset-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  margin: -2px 0 4px;
}
.inv-preset-label {
  font-family: var(--font-mono); font-size: 9px;
  letter-spacing: 0.18em; color: var(--text-muted); text-transform: uppercase;
  margin-right: 4px;
}
.inv-preset-chip {
  background: transparent;
  border: 1px solid var(--border-bright);
  color: var(--text-dim);
  padding: 5px 11px;
  font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.12s;
  border-radius: 2px;
}
.inv-preset-chip:hover { color: var(--ink-yellow); border-color: var(--ink-yellow); }
.inv-preset-chip.on {
  background: var(--ink-yellow); color: var(--bg-main); border-color: var(--ink-yellow); font-weight: 600;
}
.inv-section-head {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--ink-yellow);
  padding: 6px 0 2px;
  border-bottom: 1px solid var(--border);
  text-transform: uppercase;
}
.inv-lines { display: flex; flex-direction: column; gap: 10px; padding: 4px 0 2px; }
.inv-line-row {
  display: grid;
  grid-template-columns: 1fr 110px 80px 120px 32px;
  gap: 10px;
  align-items: end;
  padding: 10px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-elevated) 40%, transparent);
}
.inv-line-row label { margin: 0; }
.inv-amt-cell { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
.inv-amt-val { font-size: 14px; font-weight: 600; color: var(--ink-yellow); }
.inv-remove { align-self: end; margin-bottom: 2px; }
.inv-totals-preview {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-elevated) 40%, transparent);
  font-family: var(--font-mono);
  font-size: 12px;
}
.inv-tl { display: flex; justify-content: space-between; }
.inv-tl span:first-child { color: var(--text-dim); letter-spacing: 0.05em; }
.inv-tl-total {
  margin-top: 4px; padding-top: 6px;
  border-top: 1px solid var(--border);
  font-size: 15px; font-weight: 700;
}
.inv-tl-total span:first-child { color: var(--text); }
.inv-tl-total span:last-child { color: var(--ink-yellow); }

.inv-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.inv-table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 820px; }
.inv-table th {
  text-align: left; padding: 8px 6px;
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700;
  color: var(--text-muted); letter-spacing: 0.15em;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.inv-table td { padding: 8px 6px; border-bottom: 1px solid var(--border-dim); vertical-align: middle; }
.inv-table tr:hover td { background: var(--bg-row); }

.inv-kpi-grid { padding: 14px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.inv-kpi { padding: 10px; border: 1px solid var(--border); border-radius: 6px; min-width: 0; }
.inv-kpi-val { font-size: 17px; font-weight: 700; }

.founder-grid { padding: 14px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.founder-card { padding: 12px; border: 1px solid var(--border); border-radius: 6px; min-width: 0; }
.founder-metrics { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.founder-flag {
  margin-top: 10px; padding: 8px; border: 1px solid var(--border); border-radius: 4px;
  background: color-mix(in srgb, var(--bg-panel) 80%, transparent);
}
.founder-log-btn { margin-top: 10px; width: 100%; justify-content: center; }

.founder-draws-list { padding: 0 14px 14px; }
.draw-row {
  display: grid;
  grid-template-columns: 100px 150px 1fr 130px 30px;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-dim);
}
.draw-amt { text-align: right; }
.tt-rev { background: color-mix(in srgb, var(--ink-green) 18%, transparent); color: var(--ink-green); }
.tt-exp { background: color-mix(in srgb, var(--ink-red) 18%, transparent); color: var(--ink-red); }

.cat-chip {
  font-family: var(--font-mono);
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.05em;
  padding: 3px 7px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}

.lr-desc { line-height: 1.3; }
.lr-note { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); margin-top: 2px; letter-spacing: 0.05em; }
.lr-amt { text-align: right; font-weight: 700; font-size: 13px; }
.amt-plus { color: var(--ink-green); }
.amt-minus { color: var(--ink-red); }

/* ═══ MODAL ═══ */
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(4px);
  display: grid; place-items: center;
  z-index: 100;
  padding: 20px;
}
.modal {
  background: var(--bg-panel);
  border: 1px solid var(--border-bright);
  border-left: 3px solid var(--ink-yellow);
  width: 440px;
  max-width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-wide { width: 640px; }
.modal-head {
  display: flex; justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--bg-panel); z-index: 1;
}
.modal-head h3 { font-family: var(--font-display); font-size: 14px; margin: 0; letter-spacing: 0.04em; }
.modal-foot {
  display: flex; justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  align-items: center;
  position: sticky; bottom: 0; background: var(--bg-panel);
}

.form { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.form label, .form > div > label {
  display: flex; flex-direction: column;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 10px; color: var(--text-dim);
  letter-spacing: 0.12em;
}
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form input, .form select {
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 10px;
  font-family: var(--font-mono);
  font-size: 12px;
  outline: none;
  width: 100%;
}
.form input:focus, .form select:focus { border-color: var(--ink-yellow); }

.size-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
  margin-top: 6px;
}
.size-input {
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  gap: 3px !important;
}
.size-input span {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
  text-align: center;
  padding: 2px 0;
  background: var(--bg-elevated);
  border-top: 2px solid var(--ink-yellow);
}
.size-input input { text-align: center; padding: 6px 4px; }
.size-total {
  font-family: var(--font-mono);
  font-size: 11px;
  margin-top: 8px;
  letter-spacing: 0.1em;
  color: var(--text-dim);
  text-align: right;
}
.size-total strong { color: var(--ink-yellow); font-size: 14px; }

.items-list { display: flex; flex-direction: column; gap: 10px; }
.item-block {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.item-block-head { display: flex; justify-content: space-between; align-items: center; }
.item-block input { width: 100%; }

.grand-total {
  margin-right: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.12em;
}
.grand-total strong {
  color: var(--ink-yellow);
  font-size: 14px;
  margin: 0 4px;
}

/* ═══ INSIGHTS ═══ */
.report-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}
.report-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-dim);
  padding: 10px 16px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  margin-bottom: -1px;
}
.report-tab:hover { color: var(--text); }
.report-tab.on {
  color: var(--ink-yellow);
  border-bottom-color: var(--ink-yellow);
}

.insight-body { display: flex; flex-direction: column; gap: 16px; }

.headline-grid {
  padding: 12px 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.hl-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-dim);
  font-size: 13px;
}
.hl-row:last-child { border-bottom: none; }
.hl-row span { color: var(--text-dim); }
.hl-row strong { font-family: var(--font-mono); font-size: 15px; letter-spacing: 0.02em; }
.pos { color: var(--ink-green); }
.neg { color: var(--ink-red); }

/* ── productivity report ── */
.prod-report { padding: 6px 0; }
.prod-row-report {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 20px;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-dim);
}
.prod-row-report:last-child { border-bottom: none; }
.pr-name { display: flex; align-items: center; gap: 12px; }
.pr-avatar {
  width: 38px; height: 38px;
  background: var(--ink-yellow);
  color: var(--bg-main);
  display: grid; place-items: center;
  font-family: var(--font-display);
  font-size: 13px;
}
.pr-nm { font-weight: 700; font-size: 14px; }
.pr-role {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 0.1em;
  margin-top: 2px;
}
.pr-stats {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}
.pr-stat { min-width: 0; }
.pr-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.15em;
}
.pr-val {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  margin-top: 4px;
}
.pr-ot { color: var(--ink-green); }

/* ── profitability report ── */
.profit-note {
  margin: 14px 18px;
  padding: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-left: 2px solid var(--ink-cyan);
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.5;
}
.profit-note strong { color: var(--text); }
.profit-note svg { flex-shrink: 0; margin-top: 2px; color: var(--ink-cyan); }

.profit-table { padding: 6px 0; overflow-x: auto; }
.pf-thead, .pf-row {
  display: grid;
  grid-template-columns: 140px 70px 120px 90px 90px 100px 130px 90px;
  gap: 10px;
  padding: 10px 18px;
  align-items: center;
  font-size: 12px;
  min-width: 900px;
}
.pf-thead {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.15em;
  border-bottom: 1px solid var(--border-dim);
}
.pf-row { border-bottom: 1px solid var(--border-dim); }
.pf-row:hover { background: var(--bg-row); }

/* ── trends ── */
.trend-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.ts-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  padding: 18px;
  border-left: 3px solid var(--ink-slate);
}
.ts-good { border-left-color: var(--ink-green); }
.ts-bad { border-left-color: var(--ink-red); }
.ts-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
}
.ts-val {
  font-family: var(--font-display);
  font-size: 30px;
  margin-top: 8px;
  letter-spacing: -0.02em;
}
.ts-val span {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  color: var(--text-dim);
  margin-left: 6px;
  letter-spacing: 0.05em;
}
.ts-sub {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  margin-top: 4px;
}

.anomaly-list { padding: 6px 0; }
.anomaly-row {
  display: grid;
  grid-template-columns: 140px 100px 100px 80px;
  gap: 12px;
  padding: 10px 18px;
  align-items: center;
  font-size: 12px;
  border-bottom: 1px solid var(--border-dim);
}
.anomaly-row:last-child { border-bottom: none; }
.anom-up { border-left: 2px solid var(--ink-green); }
.anom-down { border-left: 2px solid var(--ink-red); }
.anom-date { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); }
.anom-val { font-family: var(--font-mono); font-weight: 700; }
.anom-vs { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); letter-spacing: 0.05em; }
.anom-dev {
  display: flex; align-items: center; gap: 4px;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 13px;
}
.anom-up .anom-dev { color: var(--ink-green); }
.anom-down .anom-dev { color: var(--ink-red); }

/* ── costs ── */
.cost-headline {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.ch-item {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  padding: 18px;
}
.ch-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
}
.ch-val {
  font-family: var(--font-display);
  font-size: 32px;
  margin-top: 8px;
  letter-spacing: -0.02em;
}
.ch-yellow { color: var(--ink-yellow); }
.ch-sub {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  margin-top: 4px;
}

.cost-breakdown { padding: 6px 0; }
.cb-row {
  display: grid;
  grid-template-columns: 40px 140px 1fr 60px 130px;
  gap: 12px;
  padding: 12px 18px;
  align-items: center;
  font-size: 13px;
  border-bottom: 1px solid var(--border-dim);
}
.cb-row:last-child { border-bottom: none; }
.cb-rank {
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--text-muted);
}
.cb-cat { font-weight: 600; }
.cb-bar {
  height: 8px;
  background: var(--bg-elevated);
  overflow: hidden;
}
.cb-bar-fill {
  height: 100%;
  background: var(--ink-yellow);
  transition: width 0.3s;
}
.cb-row:first-child .cb-bar-fill { background: var(--ink-red); }
.cb-row:nth-child(2) .cb-bar-fill { background: var(--ink-amber); }
.cb-pct {
  text-align: right;
  color: var(--text-dim);
  font-size: 11px;
  letter-spacing: 0.05em;
}
.cb-amt { text-align: right; font-size: 14px; }

/* ── stock turnover ── */
.panel-alert { border: 1px solid var(--ink-amber); border-left: 3px solid var(--ink-amber); }
.stock-alerts { padding: 6px 0; }
.sa-row {
  display: grid;
  grid-template-columns: 140px 1fr 110px 120px 100px;
  gap: 12px;
  padding: 12px 18px;
  align-items: center;
  font-size: 12px;
  border-bottom: 1px solid var(--border-dim);
}
.sa-row:last-child { border-bottom: none; }
.sa-prod { font-weight: 500; }
.sa-stat { display: flex; flex-direction: column; font-family: var(--font-mono); }
.sa-stat strong { font-size: 15px; }
.sa-stat span { font-size: 9px; color: var(--text-muted); letter-spacing: 0.1em; margin-top: 2px; }
.sa-danger strong { color: var(--ink-amber); }
.sa-rate { font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); letter-spacing: 0.05em; }

.turnover-table { padding: 6px 0; overflow-x: auto; }
.tt-thead, .tt-row {
  display: grid;
  grid-template-columns: 140px 1fr 90px 110px 110px 100px;
  gap: 12px;
  padding: 10px 18px;
  align-items: center;
  font-size: 12px;
  min-width: 900px;
}
.tt-thead {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.15em;
  border-bottom: 1px solid var(--border-dim);
}
.tt-row { border-bottom: 1px solid var(--border-dim); }
.tt-row:hover { background: var(--bg-row); }
.tt-prod { font-weight: 500; }

.dead-stock-list { padding: 6px 0; }
.ds-row {
  display: grid;
  grid-template-columns: 140px 1fr auto;
  gap: 12px;
  padding: 12px 18px;
  align-items: center;
  font-size: 12px;
  border-bottom: 1px solid var(--border-dim);
  color: var(--text-dim);
}
.ds-row:last-child { border-bottom: none; }
.ds-prod { font-weight: 500; }
.ds-qty {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

/* ═══ DISPATCHES ═══ */
.disp-summary, .orders-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
@media (max-width: 720px) { .orders-stats { grid-template-columns: 1fr; } }
.os-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  padding: 16px 18px;
  position: relative;
  overflow: hidden;
}
.os-card::before {
  content: '';
  position: absolute; top: 0; left: 0; bottom: 0;
  width: 3px; background: var(--ink-slate);
}
.os-print::before { background: var(--ink-cyan); }
.os-ord::before   { background: var(--ink-yellow); }
.os-pend::before  { background: var(--ink-amber); }
.os-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
}
.os-val {
  font-family: var(--font-display);
  font-size: 26px;
  margin-top: 6px;
  letter-spacing: -0.02em;
}
.os-val span {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  font-weight: 500;
  margin-left: 4px;
  letter-spacing: 0;
}
.os-print .os-val { color: var(--ink-cyan); }
.os-ord .os-val   { color: var(--ink-yellow); }
.os-pend .os-val  { color: var(--ink-amber); }
.os-sub {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  margin-top: 6px;
}
.ds-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  padding: 18px;
  position: relative;
  overflow: hidden;
}
.ds-card::before {
  content: '';
  position: absolute; top: 0; left: 0; bottom: 0;
  width: 3px; background: var(--ink-cyan);
}
.ds-card:nth-child(1)::before { background: var(--ink-yellow); }
.ds-card:nth-child(3)::before { background: var(--ink-amber); }
.ds-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
}
.ds-val {
  font-family: var(--font-display);
  font-size: 28px;
  margin-top: 8px;
  letter-spacing: -0.02em;
}
.ds-val span {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  color: var(--text-dim);
  margin-left: 6px;
  letter-spacing: 0.05em;
}
.ds-sub {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  margin-top: 4px;
}

.disp-table { padding: 6px 0; overflow-x: auto; }
.disp-thead, .disp-row {
  display: grid;
  grid-template-columns: 110px 130px 1fr 180px 60px 180px 80px 40px;
  gap: 12px;
  padding: 12px 18px;
  align-items: center;
  font-size: 12px;
  min-width: 1000px;
}
.disp-thead {
  font-family: var(--font-mono);
  font-size: 9px; color: var(--text-muted);
  letter-spacing: 0.15em;
  border-bottom: 1px solid var(--border-dim);
}
.disp-row { border-bottom: 1px solid var(--border-dim); }
.disp-row:hover { background: var(--bg-row); }
.disp-date { font-weight: 600; }
.disp-time { font-size: 11px; margin-top: 2px; }
.disp-oid {
  font-weight: 700;
  font-size: 11px;
  margin-bottom: 4px;
}
.disp-prod { font-weight: 500; }
.disp-sizes { font-size: 10px; letter-spacing: 0.03em; }
.disp-wh {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--ink-cyan);
  font-family: var(--font-mono);
  letter-spacing: 0.03em;
}
.disp-wh svg { flex-shrink: 0; }

.disp-avail {
  color: var(--ink-green);
  font-size: 9px;
  letter-spacing: 0.05em;
}

.size-disabled {
  opacity: 0.4;
}
.size-disabled input { cursor: not-allowed; }
.size-over input {
  border-color: var(--ink-red) !important;
  color: var(--ink-red);
}
.size-max {
  color: var(--text-muted);
  margin-left: 2px;
  font-weight: 400;
}
.disp-warning {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-red);
  letter-spacing: 0.05em;
}

/* ═══ UPDATED ORDER PROGRESS (two bars) ═══ */
.op-two-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 280px;
}
.op-bar-row {
  display: grid;
  grid-template-columns: 75px 1fr 70px;
  gap: 10px;
  align-items: center;
}
.op-bar-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.12em;
}
.op-bar-num {
  font-family: var(--font-mono);
  font-size: 11px;
  text-align: right;
  color: var(--text-dim);
}
.op-bar-num strong { color: var(--text); }
.op-bar-print { background: var(--ink-cyan); }
.op-bar-disp { background: var(--ink-yellow); }

.oi-prog-print { color: var(--ink-cyan); }
.oi-prog-disp { color: var(--ink-yellow); }
.oi-prog-sep { color: var(--text-muted); margin: 0 6px; }

/* ═══ UPDATED SIZE BLOCK (3 rows: ORD / PRT / DSP) ═══ */
.oi-size-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}
.oi-row-r {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 0;
}
.oi-k {
  font-size: 8px;
  letter-spacing: 0.15em;
  color: var(--text-muted);
}
.oi-k-print { color: color-mix(in srgb, var(--ink-cyan) 80%, var(--text-muted)); }
.oi-k-disp { color: color-mix(in srgb, var(--ink-yellow) 80%, var(--text-muted)); }
.oi-v {
  font-weight: 700;
  font-size: 11px;
}
.oi-v-print { color: var(--ink-cyan); }
.oi-v-disp { color: var(--ink-yellow); }

.oi-pending-stack {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border-dim);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.oi-pending-line {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 0.05em;
}
.oi-pending-ship { color: var(--ink-amber); }

/* ═══ PAYROLL ═══ */
.worker-ot {
  background: color-mix(in srgb, var(--ink-green) 20%, transparent);
  color: var(--ink-green);
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  border: 1px solid color-mix(in srgb, var(--ink-green) 40%, var(--border));
}
.ot-cell {
  color: var(--ink-green);
  font-weight: 700;
}

.payroll-totals {
  display: grid;
  grid-template-columns: 1fr 1fr 1.5fr;
  gap: 12px;
  margin-bottom: 16px;
}
.pt-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  padding: 18px;
  position: relative;
  overflow: hidden;
}
.pt-card::before {
  content: '';
  position: absolute; top: 0; left: 0; bottom: 0;
  width: 3px;
  background: var(--ink-slate);
}
.pt-card:nth-child(2)::before { background: var(--ink-green); }
.pt-total { border: 1px solid var(--ink-yellow); background: color-mix(in srgb, var(--ink-yellow) 5%, var(--bg-panel)); }
.pt-total::before { background: var(--ink-yellow); width: 4px; }
.pt-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
}
.pt-val {
  font-family: var(--font-display);
  font-size: 28px;
  margin-top: 8px;
  letter-spacing: -0.02em;
}
.pt-total .pt-val { color: var(--ink-yellow); font-size: 34px; }
.pt-sub {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  margin-top: 6px;
}

.payroll-rules {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-left: 2px solid var(--ink-amber);
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.5;
}
.payroll-rules strong { color: var(--text); }
.payroll-rules svg { flex-shrink: 0; margin-top: 2px; color: var(--ink-amber); }

.payroll-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.payroll-card {
  margin-bottom: 0;
}
.pc-head {
  display: grid;
  grid-template-columns: minmax(160px, 1.3fr) 3fr auto;
  gap: 20px;
  align-items: center;
  padding: 16px 18px;
}
.pc-worker { display: flex; align-items: center; gap: 12px; }
.pc-avatar {
  width: 42px; height: 42px;
  background: var(--ink-yellow);
  color: var(--bg-main);
  display: grid; place-items: center;
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 0.02em;
}
.pc-name { font-weight: 700; font-size: 15px; }
.pc-role {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.08em;
  margin-top: 3px;
}

.pc-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
}
.pc-stat { min-width: 0; }
.pc-stat-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.15em;
}
.pc-stat-val {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  margin-top: 4px;
}
.pc-stat-sub {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ink-amber);
  letter-spacing: 0.05em;
  margin-top: 2px;
}
.pc-ot { color: var(--ink-green); }
.pc-payable .pc-stat-val {
  color: var(--ink-yellow);
  font-family: var(--font-display);
  font-size: 18px;
  letter-spacing: -0.01em;
}

.pc-actions { display: flex; flex-direction: column; gap: 6px; align-items: stretch; min-width: 120px; }

.pc-confirm {
  padding: 14px 18px;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
  font-size: 13px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.pc-confirm strong { color: var(--ink-yellow); font-family: var(--font-mono); }
.pc-confirm-actions { display: flex; gap: 8px; }

.pc-log {
  border-top: 1px solid var(--border);
  padding: 14px 18px;
  background: var(--bg-main);
}
.pc-log-head {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
  margin-bottom: 10px;
}
.pc-log-table {
  border: 1px solid var(--border);
}
.pc-log-thead, .pc-log-row {
  display: grid;
  grid-template-columns: 110px 100px 70px 70px 80px 1fr;
  gap: 12px;
  padding: 8px 12px;
  align-items: center;
  font-size: 11px;
}
.pc-log-thead {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.15em;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
}
.pc-log-row { border-bottom: 1px solid var(--border-dim); }
.pc-log-row:last-child { border-bottom: none; }
.pc-log-amt { text-align: right; color: var(--ink-green); font-weight: 700; }
.sun-tag {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-amber);
  font-weight: 700;
  letter-spacing: 0.05em;
}

/* ═══ GEOFENCE ═══ */
.geo-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 16px;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  gap: 12px;
  flex-wrap: wrap;
}
.geo-status-left {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  flex-wrap: wrap;
}
.geo-status strong { letter-spacing: 0.15em; }
.geo-on { border-left: 3px solid var(--ink-green); }
.geo-on .geo-status-left strong { color: var(--ink-green); }
.geo-off { border-left: 3px solid var(--ink-amber); }
.geo-off .geo-status-left strong { color: var(--ink-amber); }
.geo-sep { color: var(--text-muted); }
.geo-detail { color: var(--text-dim); }

.geo-alert {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  margin-bottom: 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
}
.geo-alert-err {
  background: color-mix(in srgb, var(--ink-red) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--ink-red) 40%, var(--border));
  color: var(--ink-red);
}

.geo-hint {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-left: 2px solid var(--ink-cyan);
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.5;
}
.geo-hint strong { color: var(--text); }
.geo-hint svg { flex-shrink: 0; margin-top: 2px; color: var(--ink-cyan); }

.geo-use-btn {
  justify-content: center;
  padding: 10px !important;
}

.geo-captured {
  padding: 8px 12px;
  background: color-mix(in srgb, var(--ink-green) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--ink-green) 30%, var(--border));
  color: var(--ink-green);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.geo-captured svg { margin-right: 4px; display: inline-block; vertical-align: middle; }
.geo-captured-warn {
  color: var(--ink-amber);
  font-size: 10px;
  margin-top: 3px;
}

.toggle-label {
  flex-direction: row !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  cursor: pointer;
}
.toggle-label input { width: auto !important; }
.toggle-label span:first-of-type {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--text);
}
.toggle-sub {
  margin-left: auto;
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  text-align: right;
}

.worker-card.denied { border-color: var(--ink-red); }
.worker-loc {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.punch-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 10px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.punch-locating {
  background: color-mix(in srgb, var(--ink-cyan) 15%, transparent);
  color: var(--ink-cyan);
  border: 1px solid color-mix(in srgb, var(--ink-cyan) 30%, var(--border));
}
.punch-success {
  background: color-mix(in srgb, var(--ink-green) 15%, transparent);
  color: var(--ink-green);
  border: 1px solid color-mix(in srgb, var(--ink-green) 30%, var(--border));
}
.punch-denied {
  background: color-mix(in srgb, var(--ink-red) 15%, transparent);
  color: var(--ink-red);
  border: 1px solid color-mix(in srgb, var(--ink-red) 40%, var(--border));
  align-items: flex-start;
}
.punch-denied-sub {
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: color-mix(in srgb, var(--ink-red) 80%, var(--text));
  margin-top: 3px;
}

.spinner {
  width: 10px; height: 10px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ═══ LOGIN ═══ */
.login-screen {
  min-height: 100vh;
  background: var(--bg-main);
  background-image:
    linear-gradient(var(--border-dim) 1px, transparent 1px),
    linear-gradient(90deg, var(--border-dim) 1px, transparent 1px);
  background-size: 48px 48px;
  display: grid;
  place-items: center;
  padding: 20px;
  color: var(--text);
  font-family: var(--font-sans);
}
.login-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-left: 4px solid var(--ink-yellow);
  width: 380px;
  max-width: 100%;
  padding: 28px 28px 20px;
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 22px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border);
}
.login-brand .logo-mark {
  width: 40px; height: 40px;
  background: var(--ink-yellow);
  color: var(--bg-main);
  display: grid; place-items: center;
  transform: rotate(-4deg);
}
.login-brand .logo-name {
  font-family: var(--font-display);
  font-size: 16px;
  line-height: 1;
}
.login-brand .dot { color: var(--ink-yellow); }
.login-brand .logo-sub {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
  margin-top: 4px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.login-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.15em;
}
.login-form input {
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  outline: none;
}
.login-form input:focus { border-color: var(--ink-yellow); }
.login-btn {
  justify-content: center;
  padding: 12px !important;
  margin-top: 6px;
}
.login-error {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--ink-red) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--ink-red) 40%, var(--border));
  color: var(--ink-red);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.03em;
}
.login-foot {
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
  letter-spacing: 0.05em;
}

.spin { animation: spin 0.8s linear infinite; }

/* ═══ SIDEBAR FOOTER (logged-in user) ═══ */
.foot-user {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.foot-avatar {
  width: 32px; height: 32px;
  background: var(--ink-yellow);
  color: var(--bg-main);
  display: grid; place-items: center;
  font-family: var(--font-display);
  font-size: 12px;
  flex-shrink: 0;
}
.foot-name {
  font-weight: 700;
  font-size: 13px;
  line-height: 1;
}
.foot-sub {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  margin-top: 3px;
  letter-spacing: 0.1em;
}
.foot-logout {
  width: 100%;
  justify-content: center;
  padding: 6px 10px !important;
}

/* ═══ CLIENT — SHOPIFY ORDERS ═══ */
.sync-btn { display: inline-flex; align-items: center; gap: 8px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

.sync-banner {
  padding: 10px 14px;
  font-family: var(--font-mono);
  font-size: 12px;
  border: 1px solid var(--border);
  margin-bottom: 14px;
  letter-spacing: 0.04em;
}
.sync-banner.ok { border-left: 3px solid var(--ink-green); color: var(--ink-green); }
.sync-banner.err { border-left: 3px solid var(--ink-red); color: var(--ink-red); }

.orders-filter-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.status-chip-row { display: flex; flex-wrap: wrap; gap: 6px; flex: 1 1 auto; min-width: 0; }
.status-chip-row .chip { display: inline-flex; align-items: center; gap: 6px; }
.chip-count {
  display: inline-grid; place-items: center;
  min-width: 18px; height: 16px;
  padding: 0 5px;
  background: var(--bg-input);
  font-size: 9px;
  border-radius: 8px;
  color: var(--text-dim);
}
.chip.on .chip-count { background: var(--bg-main); color: var(--bg-main); opacity: 0.6; }

.orders-search {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  min-width: 200px;
}
.orders-search input {
  background: transparent; border: none; outline: none;
  color: var(--text); font-family: var(--font-mono); font-size: 12px;
  width: 100%;
}
.orders-search svg { color: var(--text-dim); }

.so-list { display: flex; flex-direction: column; gap: 10px; }
.so-card { transition: border-color 0.15s; cursor: default; }
.so-head {
  display: grid;
  grid-template-columns: 130px 1.4fr 1.6fr 110px 130px 18px;
  gap: 16px;
  padding: 14px 18px;
  align-items: center;
  cursor: pointer;
}
.so-head:hover { background: var(--bg-elevated); }
.so-name { font-family: var(--font-display); font-size: 16px; letter-spacing: 0.01em; }
.so-meta { font-size: 10px; color: var(--text-dim); margin-top: 2px; letter-spacing: 0.05em; }
.so-cust-name { font-weight: 600; font-size: 13px; }
.so-cust-loc { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-dim); margin-top: 2px; font-family: var(--font-mono); }
.so-items-count { font-size: 13px; }
.so-items-line { font-size: 11px; color: var(--text-dim); margin-top: 2px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.so-amount { font-size: 16px; text-align: right; font-family: var(--font-mono); }
.so-amount strong { color: var(--text); }
.so-chev { color: var(--text-dim); transition: transform 0.15s; }
.so-chev.open { transform: rotate(180deg); }

.status-pill-pod {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 4px 9px;
  border: 1px solid currentColor;
  white-space: nowrap;
}
.status-pill-pod.sp-sm { font-size: 8px; padding: 2px 6px; }
.status-new              { color: var(--text-dim); }
.status-under_processing { color: var(--ink-amber); }
.status-packing          { color: var(--ink-cyan); }
.status-dispatching      { color: #a855f7; }
.status-in_transit       { color: var(--ink-yellow); }
.status-delivered        { color: var(--ink-green); }
.status-on_hold          { color: var(--ink-red); }
.status-cancelled        { color: var(--text-muted); opacity: 0.6; }

/* Card left-border by status */
.so-new              { border-left: 3px solid var(--text-dim); }
.so-under_processing { border-left: 3px solid var(--ink-amber); }
.so-packing          { border-left: 3px solid var(--ink-cyan); }
.so-dispatching      { border-left: 3px solid #a855f7; }
.so-in_transit       { border-left: 3px solid var(--ink-yellow); }
.so-delivered        { border-left: 3px solid var(--ink-green); }
.so-on_hold          { border-left: 3px solid var(--ink-red); }

.so-body {
  padding: 14px 18px;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
}
.so-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1.5fr;
  gap: 18px;
  margin-bottom: 14px;
}
.so-block-items { grid-column: 1 / -1; }
.so-label {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.so-value { font-size: 12px; line-height: 1.5; }
.so-line-items { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--border); }
.so-li {
  display: grid;
  grid-template-columns: 2fr 1.5fr 50px 80px;
  gap: 10px;
  padding: 8px 12px;
  align-items: center;
  font-size: 12px;
  border-bottom: 1px solid var(--border-dim);
}
.so-li:last-child { border-bottom: none; }
.so-li-name { font-weight: 500; }
.so-li-meta { color: var(--text-dim); font-size: 10px; }
.so-li-qty { color: var(--ink-yellow); }
.so-li-price { text-align: right; }

.so-history { padding: 10px 0; border-top: 1px dashed var(--border); margin-top: 8px; }
.so-history-list { display: flex; flex-direction: column; gap: 5px; }
.so-history-row { display: flex; gap: 10px; align-items: center; font-size: 11px; }

.so-actions {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding-top: 12px; margin-top: 10px;
  border-top: 1px dashed var(--border);
}
.so-actions-label { font-family: var(--font-mono); font-size: 9px; color: var(--text-muted); letter-spacing: 0.15em; margin-right: 4px; }
.btn-status {
  background: transparent;
  border: 1px solid var(--border-bright);
  color: var(--text-dim);
  padding: 5px 9px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-status:not(:disabled):hover { color: var(--text); border-color: var(--text); }
.btn-status.on { background: var(--ink-yellow); color: var(--bg-main); border-color: var(--ink-yellow); }
.btn-status:disabled { cursor: default; }

.set-row { display: flex; padding: 10px 0; border-bottom: 1px solid var(--border-dim); gap: 16px; }
.set-row:last-child { border-bottom: none; }
.set-label { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); letter-spacing: 0.12em; min-width: 150px; padding-top: 2px; }
.set-val { font-size: 13px; flex: 1; }
.set-val a { color: var(--ink-yellow); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }

/* ═══ RESPONSIVE ═══ */
html, body { -webkit-tap-highlight-color: transparent; }

@media (max-width: 1100px) {
  .app { grid-template-columns: 64px 1fr; }
  .sidebar .logo > div, .nav-item span, .logo-sub, .nav-chev, .foot-sub, .foot-name, .foot-logout span { display: none; }
  .sidebar-foot { padding: 10px 8px; }
  .foot-user { justify-content: center; margin-bottom: 6px; }
  .foot-logout { padding: 6px !important; }
  .nav-item { justify-content: center; padding: 12px 8px; }
  .nav-item svg { width: 22px; height: 22px; }
  .logo { justify-content: center; padding: 16px 8px; }
  .logo-mark svg { width: 26px; height: 26px; }
  .foot-avatar { width: 38px; height: 38px; font-size: 13px; }
  .kpi-grid.kpi-6, .kpi-grid.kpi-4 { grid-template-columns: repeat(3, 1fr); }
  .dash-grid, .pnl-grid { grid-template-columns: 1fr; }
  .pnl-top { grid-template-columns: 1fr; }
  .founder-grid { grid-template-columns: 1fr 1fr; }
  .inv-kpi-grid { grid-template-columns: repeat(4, 1fr); }
}
@media (max-width: 720px) {
  .founder-grid { grid-template-columns: 1fr; }
  .inv-kpi-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  /* layout */
  .app { grid-template-columns: 60px 1fr; }
  .nav-item svg { width: 22px; height: 22px; }
  .nav-item { padding: 12px 6px; }
  .logo-mark svg { width: 26px; height: 26px; }
  .page { padding: 14px; padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px)); }
  .topbar { padding: 10px 14px; gap: 8px; }
  .topbar-right { gap: 10px; }
  .date-chip { font-size: 10px; padding: 4px 8px; letter-spacing: 0; }
  .clock { font-size: 12px; padding: 3px 8px; }
  .presence { font-size: 10px; }
  .presence span { display: none; }
  .presence .pulse { margin: 0; }

  /* typography */
  .page-head { flex-wrap: wrap; align-items: flex-start; gap: 12px; }
  .page-head h1 { font-size: 20px; }
  .page-sub { font-size: 9px; }
  .panel-head { padding: 12px 14px; }
  .panel-head h2 { font-size: 12px; }

  /* buttons — touch targets */
  .btn-primary, .btn-ghost { min-height: 34px; padding: 7px 12px; }
  .btn-primary.sm, .btn-ghost.sm { min-height: 30px; padding: 5px 9px; }
  .icon-btn { min-width: 28px; min-height: 28px; display: inline-grid; place-items: center; }

  /* grids */
  .kpi-grid.kpi-6, .kpi-grid.kpi-4 { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .kpi-value { font-size: 22px; }
  .kpi { padding: 12px; }
  .size-grid { grid-template-columns: repeat(3, 1fr); }
  .form-row { grid-template-columns: 1fr; }
  .worker-grid { grid-template-columns: 1fr; }

  /* founders & invoices */
  .founder-grid { padding: 12px; gap: 10px; }
  .founder-card { padding: 10px; }
  .inv-kpi-grid { padding: 12px; gap: 8px; }
  .inv-kpi { padding: 8px; }
  .inv-kpi-val { font-size: 15px; }

  /* draw list stacks: date+name top, note middle, amount+del bottom */
  .founder-draws-list { padding: 0 12px 12px; }
  .draw-row {
    grid-template-columns: 1fr auto auto;
    grid-template-areas: "who who amt" "date note del";
    row-gap: 4px;
    padding: 8px 6px;
  }
  .draw-who { grid-area: who; }
  .draw-amt { grid-area: amt; text-align: right; }
  .draw-date { grid-area: date; }
  .draw-note { grid-area: note; font-size: 11px; }
  .draw-row > .icon-btn { grid-area: del; justify-self: end; }

  /* horizontal scroll containers */
  .ledger, .inv-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .inv-table { min-width: 720px; font-size: 11px; }
  .ledger-thead, .ledger-row { min-width: 640px; font-size: 11px; padding: 8px 12px; }

  /* attendance log: compact 3-line card per row */
  .log-thead { display: none; }
  .log-row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "worker hours"
      "times  ot"
      "date   loc";
    gap: 3px 10px;
    padding: 12px 14px;
    font-size: 12px;
  }
  .log-worker { grid-area: worker; font-weight: 600; font-size: 14px; }
  .log-hours { grid-area: hours; color: var(--ink-yellow); font-weight: 600; text-align: right; }
  .log-times { grid-area: times; font-size: 12px; }
  .log-ot { grid-area: ot; text-align: right; font-size: 11px; }
  .log-date { grid-area: date; font-size: 11px; color: var(--text-dim); }
  .log-loc { grid-area: loc; text-align: right; font-size: 10px; color: var(--text-dim); }

  /* dispatches: compact card layout */
  .disp-table { overflow: visible; padding: 0; }
  .disp-thead { display: none; }
  .disp-row {
    min-width: 0;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "product  total"
      "order    order"
      "sizes    sizes"
      "worker   warehouse"
      "date     del";
    gap: 4px 10px;
    padding: 12px 14px;
    font-size: 12px;
  }
  .disp-row > div:nth-child(1) { grid-area: date; font-size: 10px; color: var(--text-dim); display: flex; gap: 6px; align-items: baseline; }
  .disp-row > div:nth-child(1) .disp-date, .disp-row > div:nth-child(1) .disp-time { display: inline; font-size: 10px; margin: 0; }
  .disp-row > div:nth-child(2) { grid-area: order; font-size: 11px; display: flex; gap: 6px; align-items: center; }
  .disp-row > div:nth-child(3) { grid-area: product; font-weight: 600; font-size: 14px; }
  .disp-row > div:nth-child(4) { grid-area: sizes; font-size: 11px; }
  .disp-row > div:nth-child(5) { grid-area: total; text-align: right; color: var(--ink-yellow); font-weight: 700; font-size: 15px; }
  .disp-row > div:nth-child(6) { grid-area: warehouse; font-size: 11px; justify-self: end; }
  .disp-row > div:nth-child(7) { grid-area: worker; font-size: 11px; color: var(--text-dim); }
  .disp-row > div:nth-child(8) { grid-area: del; justify-self: end; }

  /* warehouse: shrink size cells so whole row fits */
  .wh-table { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .wh-thead, .wh-row { grid-template-columns: 90px 1fr repeat(6, 32px) 50px 28px; min-width: 540px; padding: 10px 12px; gap: 6px; font-size: 11px; }

  /* payroll log — overridden below with card layout */

  /* invoice modal: stack line items on mobile */
  .inv-line-row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "particulars particulars"
      "rate        qty"
      "amt         remove";
    gap: 8px;
    padding: 10px;
  }
  .inv-line-row > .inv-particulars { grid-area: particulars; }
  .inv-line-row > .inv-rate { grid-area: rate; }
  .inv-line-row > .inv-qty { grid-area: qty; }
  .inv-line-row > .inv-amt-cell { grid-area: amt; align-items: flex-start; }
  .inv-line-row > .inv-remove { grid-area: remove; justify-self: end; }

  /* modals */
  .modal-backdrop { padding: 8px; align-items: end; }
  .modal, .modal-wide { width: 100%; max-height: 92vh; border-left-width: 2px; }
  .modal-head, .modal-foot { padding: 12px 14px; }
  .form { padding: 14px; gap: 12px; }
  .form input, .form select { padding: 9px 10px; font-size: 16px; } /* >=16px prevents iOS auto-zoom on focus */
  input[type="date"], input[type="time"], input[type="number"], input[type="email"], input[type="text"], input[type="password"], textarea, select { font-size: 16px; }

  /* ledger: hide TYPE column on narrow (row is already colored by type) */
  .ledger-thead, .ledger-row { grid-template-columns: 80px 110px 1fr 100px 30px; gap: 8px; min-width: 0; }
  .ledger-thead > div:nth-child(2), .ledger-row > div:nth-child(2) { display: none; }

  /* sidebar/footer safe area */
  .sidebar-foot { padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px)); }

  /* ─── Shopify orders mobile ─── */
  .orders-filter-bar { padding: 10px; }
  .orders-search { width: 100%; min-width: 0; }
  .so-head {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "name    amount"
      "cust    cust"
      "items   status"
      "chev    chev";
    gap: 6px 10px;
    padding: 12px 14px;
  }
  .so-head > * { min-width: 0; }
  .so-id { grid-area: name; }
  .so-customer { grid-area: cust; }
  .so-items { grid-area: items; min-width: 0; overflow: hidden; }
  .so-items-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .so-amount { grid-area: amount; }
  .so-status-cell { grid-area: status; justify-self: end; }
  .so-chev { grid-area: chev; justify-self: center; }
  .so-grid { grid-template-columns: 1fr; gap: 14px; }
  .so-li { grid-template-columns: 1fr auto; grid-template-areas: "name qty" "meta price"; gap: 2px 10px; }
  .so-li-name { grid-area: name; }
  .so-li-meta { grid-area: meta; }
  .so-li-qty { grid-area: qty; text-align: right; }
  .so-li-price { grid-area: price; }
  .so-actions {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
  }
  .so-actions-label {
    grid-column: 1 / -1;
    margin-right: 0;
    margin-bottom: 2px;
  }
  .so-actions .btn-status {
    flex: none;
    width: 100%;
    padding: 7px 4px;
    font-size: 9px;
    letter-spacing: 0.06em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .so-actions .btn-ghost {
    grid-column: 1 / -1;
    margin-left: 0 !important;
    justify-content: center;
  }

  /* ─── PRODUCTION mobile (card layout, no horizontal scroll) ─── */
  .prod-table { overflow-x: visible; padding: 0; }
  .prod-thead { display: none; }
  .prod-row {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "product   total"
      "client    date"
      "del       del";
    gap: 4px 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border-dim);
    min-width: 0;
  }
  .prod-row > div:nth-child(1) { grid-area: date; font-size: 10px; color: var(--text-dim); justify-self: end; }
  .prod-row > div:nth-child(2) { grid-area: product; font-weight: 600; font-size: 14px; }
  .prod-row > div:nth-child(3) { grid-area: client; font-size: 11px; }
  /* per-size cells: hidden on mobile (total below tells the story; tap to see desktop view) */
  .prod-row > div:nth-child(n+4):nth-child(-n+9) { display: none; }
  .prod-row > div:nth-child(10) { grid-area: total; font-size: 16px; color: var(--ink-yellow); justify-self: end; }
  .prod-row > div:nth-child(11) { grid-area: del; justify-self: end; }

  /* ─── ORDERS mobile: stack head + tighter size cards ─── */
  .order-head { padding: 14px; gap: 10px; flex-direction: column; align-items: stretch; }
  .order-id-row { width: 100%; row-gap: 6px; }
  .order-id { font-size: 12px; }
  .order-meta { font-size: 11px; word-break: break-word; }
  .order-head-right { flex-direction: column; align-items: stretch; gap: 10px; width: 100%; }
  .order-progress { width: 100%; min-width: 0; gap: 6px; }
  .op-two-bars { min-width: 0; gap: 8px; }
  .op-bar-row { grid-template-columns: 70px 1fr 60px; gap: 8px; }
  .op-bar-label { font-size: 8px; }
  .op-bar-num { font-size: 10px; }
  .progress-row { font-size: 10px; }
  .progress-bar { flex: 1; min-width: 0; }
  .order-actions { display: flex; flex-wrap: wrap; gap: 6px; width: 100%; }
  .order-actions .btn-ghost, .order-actions .btn-primary { flex: 1; justify-content: center; }
  .oi-head { flex-direction: column; align-items: flex-start; gap: 4px; margin-bottom: 8px; }
  .oi-progress { font-size: 10px; word-break: break-word; }
  .oi-sizes { grid-template-columns: repeat(auto-fit, minmax(95px, 1fr)); gap: 6px; }
  .oi-size { padding: 6px 8px; }
  .order-items { padding: 8px 14px 14px; }

  /* ─── DISPATCHES mobile: filter bar wraps cleanly ─── */
  .disp-summary { grid-template-columns: 1fr 1fr; gap: 8px; }
  .disp-summary .ds-card:nth-child(3) { grid-column: 1 / -1; }
  .ds-val { font-size: 22px; }
  .filter-bar .mono-label { width: 100%; }
  .filter-bar .mono-label select, .filter-bar .mono-label input { width: 100%; min-width: 0; }

  /* ─── P&L ledger: switch to card layout to kill overflow ─── */
  .ledger { padding: 0; }
  .ledger-thead { display: none; }
  .ledger-row {
    grid-template-columns: 1fr auto !important;
    grid-template-areas:
      "desc   amt"
      "cat    date";
    gap: 4px 10px !important;
    padding: 12px 14px;
    min-width: 0 !important;
  }
  .ledger-row > div:nth-child(1) { grid-area: date; font-size: 10px; color: var(--text-dim); }
  .ledger-row > div:nth-child(2) { display: none; }                 /* hide TYPE col on mobile */
  .ledger-row > div:nth-child(3) { grid-area: cat; font-size: 11px; color: var(--text-dim); }
  .ledger-row > div:nth-child(4) { grid-area: desc; font-size: 13px; font-weight: 600; word-break: break-word; }
  .ledger-row > div:nth-child(5) { grid-area: amt; text-align: right; font-size: 13px; }
  .ledger-row > div:nth-child(6) { grid-area: date; justify-self: end; }

  /* ─── P&L charts: tighten ─── */
  .pnl-grid { grid-template-columns: 1fr; gap: 12px; }

  /* ─── Insights mobile: tabs scroll cleanly, charts shrink ─── */
  .report-tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    flex-wrap: nowrap;
    padding-bottom: 4px;
  }
  .report-tabs::-webkit-scrollbar { display: none; }
  .report-tab { white-space: nowrap; flex-shrink: 0; }
  .insight-body .kpi-grid.kpi-4 { grid-template-columns: 1fr 1fr; }

  /* ─── Invoice table on PnL: container itself can scroll ─── */
  .inv-table-wrap { max-width: 100%; }

  /* ─── PAYROLL mobile ─── */
  .payroll-totals { grid-template-columns: 1fr 1fr; gap: 10px; }
  .pt-card { padding: 12px; }
  .pt-val { font-size: 20px; }
  .pt-total { grid-column: 1 / -1; }
  .pt-total .pt-val { font-size: 26px; }
  .pt-label { font-size: 9px; letter-spacing: 0.1em; }
  .pt-sub { font-size: 9px; }

  .payroll-rules { font-size: 11px; padding: 10px 12px; }

  /* Payroll worker card: stack vertically */
  .pc-head {
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 14px;
  }
  .pc-worker { align-items: center; }
  .pc-avatar { width: 36px; height: 36px; font-size: 12px; }
  .pc-name { font-size: 14px; }

  /* Stats: 2-col grid on mobile with payable spanning full width */
  .pc-stats {
    grid-template-columns: 1fr 1fr;
    gap: 12px 16px;
    padding: 0;
  }
  .pc-stat { display: flex; justify-content: space-between; align-items: baseline; }
  .pc-stat-label { font-size: 10px; }
  .pc-stat-val { font-size: 14px; margin-top: 0; }
  .pc-stat-sub { font-size: 9px; margin-top: 0; margin-left: 6px; display: inline; }
  .pc-payable { grid-column: 1 / -1; border-top: 1px solid var(--border-dim); padding-top: 10px; }
  .pc-payable .pc-stat-val { font-size: 22px; }

  .pc-actions { flex-direction: row; min-width: 0; }
  .pc-actions .btn-primary, .pc-actions .btn-ghost { flex: 1; justify-content: center; }

  .pc-confirm { flex-direction: column; align-items: stretch; gap: 10px; padding: 12px 14px; font-size: 12px; }
  .pc-confirm-actions { justify-content: flex-end; }

  /* OT log → card layout instead of 6-column table */
  .pc-log { padding: 12px; }
  .pc-log-thead { display: none; }
  .pc-log-row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "date    amt"
      "times   ot";
    gap: 2px 10px;
    padding: 10px 12px;
    font-size: 12px;
  }
  .pc-log-row > div:nth-child(1) { grid-area: date; font-weight: 600; }
  .pc-log-row > div:nth-child(2) { grid-area: date; font-weight: 600; display: inline-flex; gap: 6px; align-items: baseline; }
  .pc-log-row > div:nth-child(3) { grid-area: times; font-size: 11px; color: var(--text-dim); }
  .pc-log-row > div:nth-child(4) { grid-area: times; font-size: 11px; color: var(--text-dim); }
  .pc-log-row > div:nth-child(5) { grid-area: ot; color: var(--ink-amber); font-size: 11px; justify-self: end; }
  .pc-log-row > div:nth-child(6) { grid-area: amt; text-align: right; color: var(--ink-green); font-weight: 700; }
}

@media (max-width: 420px) {
  .app { grid-template-columns: 56px 1fr; }
  .nav-item svg { width: 20px; height: 20px; }
  .nav-item { padding: 11px 4px; }
  .page { padding: 12px; }
  .kpi-grid { gap: 8px; }
  .kpi-value { font-size: 20px; }
  .kpi-label { font-size: 8px; }
  .page-head h1 { font-size: 18px; }
  .inv-kpi-val { font-size: 14px; }
  .inv-kpi { padding: 7px; }
  .inv-kpi-grid { gap: 6px; }
  /* iOS: prevent auto-zoom on focused input */
  .form input, .form select, .mono-label input, .mono-label select { font-size: 16px; }
}

/* iOS PWA safe area top */
@supports (padding: env(safe-area-inset-top)) {
  .topbar { padding-top: calc(10px + env(safe-area-inset-top, 0px)); }
}
`;
