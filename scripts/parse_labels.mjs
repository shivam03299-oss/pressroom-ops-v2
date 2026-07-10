#!/usr/bin/env node
// One-off parser: extract shipments from a label PDF.
// Mirrors the parsing in src/supabase.js (parseLabelPage). Usage:
//   node scripts/parse_labels.mjs <pdf-path>...
import fs from "node:fs";
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const MONEY_RE = /(₹|\bINR\b|\bRs\.?\s*\d|\d+[.,]\d{2})/i;

const SIZES = ["XXXL","XXL","XL","L","M","S","XS","FREE"];
const SIZE_ALIASES = { "2XL":"XXL", "3XL":"XXXL", "FREE SIZE":"FREE" };
function splitNameAndSize(raw) {
  let name = (raw || "").replace(/\s*\(\s*\)\s*$/, "").replace(/\s+/g, " ").trim();
  // size token preceded by " - " at end
  for (const sz of SIZES.concat(Object.keys(SIZE_ALIASES))) {
    const re = new RegExp(`\\s-\\s*${sz}\\s*$`, "i");
    if (re.test(name)) {
      const base = name.replace(re, "").trim();
      const normalized = SIZE_ALIASES[sz.toUpperCase()] || sz.toUpperCase();
      return { base, size: normalized };
    }
  }
  return { base: name, size: null };
}

function detectCourier(text) {
  const t = (text || "").toUpperCase();
  if (t.includes("DELHIVERY")) return "Delhivery";
  if (t.includes("BLUEDART") || t.includes("BLUE DART")) return "Bluedart";
  if (t.includes("DTDC")) return "DTDC";
  if (t.includes("XPRESSBEES")) return "Xpressbees";
  if (t.includes("ECOMEXPRESS") || t.includes("ECOM EXPRESS")) return "Ecom Express";
  if (t.includes("SHIPROCKET")) return "Shiprocket";
  return null;
}

function parseProductRow(cells) {
  const texts = cells.map(c => c.str).filter(Boolean);
  if (!texts.length) return null;
  const nonMoney = texts.filter(t => !MONEY_RE.test(t));
  let qtyIdx = -1;
  for (let i = nonMoney.length - 1; i >= 0; i--) {
    if (/^\d{1,4}$/.test(nonMoney[i])) { qtyIdx = i; break; }
  }
  if (qtyIdx < 0) return null;
  const qty = parseInt(nonMoney[qtyIdx], 10);
  const name = nonMoney.slice(0, qtyIdx).join(" ").replace(/\s+/g, " ").trim();
  if (!name) return null;
  return { name, qty: qty > 0 ? qty : 1 };
}

function parseLabelPage(lines) {
  const flat = lines.map(cells => cells.map(c => c.str).join(" "));
  let awb = null, orderRef = null;
  for (const t of flat) {
    if (!awb) { const m = t.match(/\bAWB\b\s*[#:\-]?\s*([A-Za-z0-9]{8,})/i); if (m) awb = m[1]; }
    if (!orderRef) {
      let m = t.match(/^#\s*([A-Za-z0-9][A-Za-z0-9_\-\/]*)$/);
      if (m) { orderRef = "#" + m[1]; continue; }
      m = t.match(/order\s*id\s*[:\-]?\s*#?([A-Za-z0-9][A-Za-z0-9_\-\/]{5,})/i);
      if (m) orderRef = "#" + m[1];
    }
  }
  const courier = detectCourier(flat.join(" "));
  const headerIdx = lines.findIndex(cells => {
    const t = cells.map(c => c.str).join(" ").toLowerCase();
    return t.includes("product name") && /qty/.test(t);
  });
  const items = [];
  if (headerIdx >= 0) {
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const joined = lines[i].map(c => c.str).join(" ");
      if (/return address|^\s*-\s*\d{5,6}\s*$/i.test(joined)) break;
      const row = parseProductRow(lines[i]);
      if (row) {
        const { base, size } = splitNameAndSize(row.name);
        items.push({ productName: base, size, qty: row.qty });
      }
    }
  }
  // "Item Description | Qty | Amount" tabular labels (BlueDart/Balleti):
  // bare-integer amounts break the "last integer = qty" heuristic, so use
  // the Qty header cell's x-position as a column anchor.
  if (!items.length) {
    const hdrIdx = lines.findIndex(cells => {
      const t = cells.map(c => c.str).join(" ").toLowerCase();
      return t.includes("item description") && /\bqty\b/.test(t);
    });
    if (hdrIdx >= 0) {
      const hdr = lines[hdrIdx];
      const qtyHdr = hdr.find(c => /^qty\b/i.test(c.str));
      const qtyX = qtyHdr ? qtyHdr.x : null;
      for (let i = hdrIdx + 1; i < lines.length; i++) {
        const cells = lines[i];
        const joined = cells.map(c => c.str).join(" ").trim();
        if (!joined) continue;
        if (/^(shipping charges|sub\s*total|grand\s*total|total)\b/i.test(joined)) break;
        let qtyCell = null;
        for (const c of cells) {
          if (!/^\d{1,4}$/.test(c.str)) continue;
          if (qtyX == null) { qtyCell = c; break; }
          if (!qtyCell || Math.abs(c.x - qtyX) < Math.abs(qtyCell.x - qtyX)) qtyCell = c;
        }
        const cut = qtyCell ? qtyCell.x : Infinity;
        const rawName = cells.filter(c => c.x < cut).map(c => c.str)
          .join(" ").replace(/\s+/g, " ").trim();
        if (rawName && qtyCell) {
          const qty = parseInt(qtyCell.str, 10);
          const { base, size } = splitNameAndSize(rawName);
          items.push({ productName: base, size, qty: qty > 0 ? qty : 1 });
        } else if (items.length && rawName && !MONEY_RE.test(rawName)) {
          const prev = items[items.length - 1];
          const merged = splitNameAndSize(`${prev.productName} ${rawName}`);
          prev.productName = merged.base;
          if (!prev.size && merged.size) prev.size = merged.size;
        }
      }
    }
  }
  return { awb, orderRef, courier, items };
}

async function pdfToPages(path) {
  const data = new Uint8Array(fs.readFileSync(path));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const linesByY = new Map();
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      if (!linesByY.has(y)) linesByY.set(y, []);
      linesByY.get(y).push({ x: it.transform[4], str: it.str.trim() });
    }
    const lines = [...linesByY.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, cells]) => cells.sort((a, b) => a.x - b.x));
    pages.push(lines);
  }
  return pages;
}

async function main() {
  const out = [];
  for (const f of process.argv.slice(2)) {
    const pages = await pdfToPages(f);
    for (let i = 0; i < pages.length; i++) {
      const s = parseLabelPage(pages[i]);
      out.push({ file: f.split("/").pop(), page: i + 1, ...s });
    }
  }
  console.log(JSON.stringify(out, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
