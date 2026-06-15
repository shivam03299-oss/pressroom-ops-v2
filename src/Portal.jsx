import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Package, ShoppingBag, Store, ClipboardList, Wallet,
  Settings as SettingsIcon, LogIn, LogOut, Plus, Search, Filter, X, Check,
  ChevronRight, ChevronDown, ArrowRight, ArrowUpRight, ArrowDownLeft, Upload, Image as ImageIcon,
  Edit3, Trash2, Eye, EyeOff, Loader2, Sun, Moon, AlertTriangle, Sparkles,
  Shirt, ExternalLink, CheckCircle2, Circle, Calendar, IndianRupee, Printer, Truck,
  Tag, Palette, Ruler, FileImage, RefreshCw, RefreshCcw, Copy, MoreVertical,
  Link as LinkIcon, Layers, RotateCw, RotateCcw, FlipHorizontal, Crop, Move,
  LifeBuoy, MessageSquare, Send, CreditCard, Smartphone, Lock, FileText, Download,
  Menu, MapPin, Clock
} from "lucide-react";
import { useSmartHeader } from "./useSmartHeader.js";
import SiteFooter from "./SiteFooter.jsx";
import {
  supabase, signIn, signOut, getSession,
  syncShopifyOrders, getShopifyStatus, connectShopify, disconnectShopify,
  startShopifyOAuth,
  subscribe,
  uploadDesignFile, saveClientProducts, listMyClientProducts, deleteClientProduct,
  parseLabelFiles, rollupLabelLines, saveLabelBatch, listLabelBatches, listLabelLines,
  estimateLabelBatchCost,
  signLabelFileUrl, trackingUrl, LABEL_STATUS, listWalletTxns, GST_RATE,
  myTenantId, fetchTenant, updateTenantBilling,
  listCatalogProducts, CATALOG_FAMILIES,
  listShopifyProducts,
} from "./supabase.js";

// Indian GST state codes — used to populate the state dropdown on the
// signup form. Kept in sync with INDIAN_STATES in App.jsx; mirror any
// updates there to here. Code is the 2-digit GST prefix.
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

// Re-run `fn` every minute. Polling safety net on top of realtime so the
// portal stays fresh even if a subscription drops or a change comes from
// outside Postgres replication. Skips when the tab is hidden.
function useMinutePoll(fn) {
  useEffect(() => {
    if (typeof fn !== "function") return;
    const id = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") fn();
    }, 60000);
    return () => clearInterval(id);
  }, [fn]);
}

// ═══════════════════════════════════════════════════════════════════
// CLIENT PORTAL — what brand partners see at /portal
//
// This is a UI scaffold. Real catalog, designs, stores, and orders will
// land in Supabase next; for now we keep an in-memory state that mirrors
// the shape we'll wire up. Mock catalog lives in CATALOG_MOCK and is
// trivial to swap when the real PDF + product list arrives.
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// REAL AVIVA CATALOG — Volume 01 · 2026 · Edition 01
// Imported from the PDF brand-partner catalog. Three products, one
// price card, one mockup photo each. Add new products by appending to
// CATALOG_MOCK + adding their photo to /public/catalog/.
// ═══════════════════════════════════════════════════════════════════
const COLORS = {
  // Product 01 · Oversized boxy tee — 6 colors
  "jet-black":  { name: "Jet black",   hex: "#0a0a0a", ink: "#ffffff" },
  "white":      { name: "White",       hex: "#f5f3ec", ink: "#1a1a1a" },
  "royal-blue": { name: "Royal blue",  hex: "#2540a8", ink: "#ffffff" },
  "pink":       { name: "Pink",        hex: "#e8b3c2", ink: "#1a1a1a" },
  "beige":      { name: "Beige",       hex: "#d4c294", ink: "#1a1a1a" },
  "red":        { name: "Red",         hex: "#c0282d", ink: "#ffffff" },

  // Product 02 · Oversized acid wash tee — single variant
  "acid-black": { name: "Acid black",  hex: "#3a3a3a", ink: "#ffffff", mottled: true },

  // Product 03 · Waffle full-sleeve tee — 2 colors
  "black":      { name: "Black",       hex: "#0a0a0a", ink: "#ffffff" },
  "off-white":  { name: "Off-white",   hex: "#ece6d6", ink: "#1a1a1a" },
};

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

// Each product carries its actual catalog hero photo (back-view mockup),
// the full price card from the PDF (plain garment + DTF add-on + all-in),
// and the real spec sheet. Photo URL is served from /public/catalog/.
const CATALOG_MOCK = [
  {
    id: "tee-boxy",
    productNo: "01",
    category: "Tees",
    name: "Oversized boxy tee",
    tagline: "Drop shoulder · ribbed crew neck · heavyweight 100% cotton",
    photo:       "/catalog/tee-boxy.png",
    photoThumb:  "/catalog/tee-boxy-thumb.png",
    photoNote:   "shown in jet black · clean cotton finish",
    fabric: "240 GSM heavyweight 100% cotton · drop shoulder · ribbed crew neck",
    weight: "240 GSM",
    printMethod: "DTF only",
    embroidery: "coming soon",
    basePrice: 295,        // plain garment per piece
    printAddon: 150,       // DTF print add-on per piece
    allInPrice: 445,       // garment + print
    mrpHint: 1199,
    colors: ["jet-black", "white", "royal-blue", "pink", "beige", "red"],
    sizes: SIZES,
    moq: 1,
    print: "DTF · Front · Back · Sleeves",
    shape: "tee-photo",    // marker for the photo-based mockup renderer
    blurb: "The heavyweight boxy fit. Drop-shoulder cut, ribbed crew neck, 240 GSM 100% cotton. Six core colours, DTF print on front, back, or sleeves.",
  },
  {
    id: "tee-acidwash",
    productNo: "02",
    category: "Tees",
    name: "Oversized acid wash tee",
    tagline: "Drop shoulder · ribbed crew · garment-dyed acid wash finish",
    photo:       "/catalog/tee-acidwash.png",
    photoThumb:  "/catalog/tee-acidwash-thumb.png",
    photoNote:   "signature mottled acid wash · each piece unique",
    fabric: "240 GSM 100% cotton · garment-dyed acid wash · drop shoulder · ribbed crew",
    weight: "240 GSM",
    printMethod: "DTF only",
    embroidery: "coming soon",
    basePrice: 395,
    printAddon: 150,
    allInPrice: 545,
    mrpHint: 1499,
    colors: ["acid-black"],
    sizes: SIZES,
    moq: 1,
    print: "DTF · Front · Back · Sleeves",
    shape: "tee-photo",
    blurb: "Garment-dyed acid wash on heavyweight 240 GSM cotton. Mottled finish, drop shoulder, ribbed crew — every piece unique.",
    warning: "Wash shade and pattern vary across pieces. Each garment is unique — no two are identical.",
  },
  {
    id: "tee-waffle",
    productNo: "03",
    category: "Tees",
    name: "Waffle full-sleeve tee",
    tagline: "Round neck · full sleeve · waffle-knit cotton · relaxed fit",
    photo:       "/catalog/tee-waffle.png",
    photoThumb:  "/catalog/tee-waffle-thumb.png",
    photoNote:   "textured waffle weave · soft hand-feel",
    fabric: "240 GSM waffle-knit cotton · round neck · full sleeve · relaxed fit",
    weight: "240 GSM",
    printMethod: "DTF only",
    embroidery: "coming soon",
    basePrice: 395,
    printAddon: 150,
    allInPrice: 545,
    mrpHint: 1599,
    colors: ["black", "off-white"],
    sizes: SIZES,
    moq: 1,
    print: "DTF · Front · Back · Sleeves",
    shape: "tee-photo",
    blurb: "Textured waffle-knit weave with soft hand-feel. Round neck full-sleeve, relaxed fit, 240 GSM cotton.",
  },
];

const CATEGORIES = Array.from(new Set(CATALOG_MOCK.map(p => p.category)));

// Order-terms displayed at the catalog footer (from the PDF "Order terms" page).
const CATALOG_TERMS = [
  { k: "Pricing",         v: "Negotiable above 50 pieces/day on a consistent basis." },
  { k: "Packaging",       v: "Standard packaging included. Custom mailers / polybags — supply your own materials and we'll pack." },
  { k: "Tags & labels",   v: "Brand tags attached free of charge. Send tags ahead of production." },
];

// Size grid (inches, body-flat) from the catalog reference page.
const SIZE_GRID = [
  { size: "XS",  chest: 42, length: 26,   shoulder: 20   },
  { size: "S",   chest: 44, length: 27,   shoulder: 20.5 },
  { size: "M",   chest: 46, length: 28,   shoulder: 21   },
  { size: "L",   chest: 48, length: 29,   shoulder: 21.5 },
  { size: "XL",  chest: 50, length: 30,   shoulder: 22   },
  { size: "XXL", chest: 52, length: 31,   shoulder: 22.5 },
];

// ─── Print zones calibrated against the real catalog photos ───────────
// All three catalog products share the same back-view photo orientation
// (1080×1350, 4:5 portrait, tee centered with black void background).
// Photos render inside a 200×250 viewBox; zones are positioned to land
// on the actual fabric in the photo so a dragged design sits on the
// garment, not the void.
//
// Photos are back views — the FRONT and SLEEVE zones still appear on
// the same photo (positioned at the spatial location where a chest/
// sleeve print would naturally fall), since DTF prints apply the same
// either way. The user picks where their design goes; we render the
// preview on the only photo we have. A subtle "BACK VIEW SHOWN" label
// on the mockup keeps it honest.
// Each zone declares its real-world max print size in inches (the
// physical area on the garment a print can occupy at scale=1.0).
// The UI multiplies by the user's chosen scale to derive the actual
// print dimensions shown on the Print Details cards.
const VIEWS_BY_SHAPE = {
  "tee-photo": {
    front: { label: "Front", zones: [
      { id: "front-chest",  label: "Front chest",   x:  82, y: 100, w:  36, h:  36, maxIn: { w: 12, h: 14 } },
      { id: "left-sleeve",  label: "Left sleeve",   x:  35, y:  78, w:  28, h:  30, maxIn: { w: 3.5, h: 4 } },
      { id: "right-sleeve", label: "Right sleeve",  x: 137, y:  78, w:  28, h:  30, maxIn: { w: 3.5, h: 4 } },
    ]},
    back: { label: "Back", zones: [
      { id: "back-center",  label: "Full back",     x:  62, y:  90, w:  76, h: 100, maxIn: { w: 14, h: 16 } },
      { id: "back-neck",    label: "Neck label",    x:  88, y:  62, w:  24, h:  10, maxIn: { w: 3, h: 1 } },
    ]},
  },
};

// Print Details panel groups zones by their canonical display order
// — Front / Back / L Sleeve / R Sleeve. Each entry maps to a zone id
// inside VIEWS_BY_SHAPE so the panel can pull live size/cost from the
// user's current design state.
const PRINT_DETAILS_SLOTS = [
  { id: "front-chest",  label: "Front",    view: "front" },
  { id: "back-center",  label: "Back",     view: "back"  },
  { id: "left-sleeve",  label: "L Sleeve", view: "front" },
  { id: "right-sleeve", label: "R Sleeve", view: "front" },
];

// ─── Top-level Portal: auth gate ───────────────────────────────────────
export default function Portal() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = logged out, {} = logged in
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("pressroom-theme") || "dark"; } catch { return "dark"; }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("pressroom-theme", theme); } catch {}
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    getSession().then(s => { if (mounted) setSession(s); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (mounted) setSession(s); });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  if (session === undefined) {
    return <div className="pt-boot"><style>{PORTAL_CSS}</style><div className="pt-boot-inner"><Loader2 className="pt-spin" size={18}/> LOADING PORTAL…</div></div>;
  }

  if (!session) {
    // Default to signup if URL is /portal/signup, otherwise login
    const initialMode = window.location.pathname.startsWith("/portal/signup") ? "signup" : "signin";
    return <PortalAuth theme={theme} setTheme={setTheme} initialMode={initialMode} />;
  }

  return <PortalApp session={session} theme={theme} setTheme={setTheme} />;
}

// ═══════════════════════════════════════════════════════════════════
// AUTH SCREENS
// ═══════════════════════════════════════════════════════════════════
// ─── AUTH: email + password, no email verification ─────────────────────
// Sign-up creates the user with `supabase.auth.signUp` carrying brand
// metadata in `user_metadata`; if "Confirm email" is OFF in the Supabase
// dashboard auth settings, the call returns a live session and the
// user is dropped straight into the portal. Sign-in uses the password
// helper exported from supabase.js.
//
// Custom SMTP isn't wired up yet, so no OTP / magic-link / confirmation
// email is sent. When SMTP lands we can layer in optional verification.
function PortalAuth({ theme, setTheme, initialMode = "signin" }) {
  const [mode, setMode] = useState(initialMode); // "signin" | "signup"
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [brandName, setBrandName] = useState("");
  const [fullName,  setFullName]  = useState("");
  const [phone,     setPhone]     = useState("");
  const [showPw,    setShowPw]    = useState(false);
  // Billing identity for tax invoices. Captured at signup so the
  // invoice helper has everything it needs the moment the first
  // recharge lands — admin doesn't have to chase the client later
  // for GSTIN / legal name / state.
  const [billLegalName, setBillLegalName] = useState("");
  const [billGstin,     setBillGstin]     = useState("");
  const [billAddress,   setBillAddress]   = useState("");
  const [billStateCode, setBillStateCode] = useState("");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);
  const [info,  setInfo]  = useState(null);

  // Map raw Supabase errors to user-friendly copy.
  const friendly = (msg) => {
    if (!msg) return "Something went wrong. Try again.";
    const m = String(msg).toLowerCase();
    if (m.includes("invalid login credentials")) return "Wrong email or password. Try again, or use Forgot password.";
    if (m.includes("email not confirmed"))       return "Your email isn't confirmed yet. Ask admin (or WhatsApp us on +91 92177 65507) to flip the switch.";
    if (m.includes("user already registered"))   return "An account with this email already exists. Sign in instead.";
    if (m.includes("rate limit"))                return "Too many attempts. Wait a minute and try again.";
    return msg;
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === "signin") {
        await signIn(email, password);
        // onAuthStateChange in <Portal/> swaps to <PortalApp/>.
      } else {
        // Strong-ish minimum for new accounts. UI also enforces minLength=8.
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        // GSTIN format check (15 chars: 2-digit state code + 10-char PAN
        // + entity number + Z + checksum). Empty allowed — many small
        // brands don't have one yet.
        const gstinClean = billGstin.trim().toUpperCase();
        if (gstinClean && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(gstinClean)) {
          throw new Error("That GSTIN doesn't look right. Format: 22AAAAA0000A1Z5 (15 characters).");
        }
        // If GSTIN is present, the state-code prefix must match the
        // selected state — catches typos that would land in the wrong
        // state's GST return otherwise.
        if (gstinClean && billStateCode && gstinClean.slice(0, 2) !== billStateCode) {
          throw new Error(`Your GSTIN starts with ${gstinClean.slice(0, 2)} but you picked state ${billStateCode}. Pick the matching state or check the GSTIN.`);
        }
        const stateName = billStateCode
          ? (INDIAN_STATES.find(s => s.code === billStateCode)?.name || "")
          : "";
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              brand_name: brandName,
              full_name: fullName,
              phone,
              // Billing identity for tax invoices. The signup trigger
              // (auto_create_profile_on_signup) reads these off
              // raw_user_meta_data and stamps them onto tenants.
              bill_to_legal_name: billLegalName.trim() || null,
              bill_to_gstin:      gstinClean || null,
              bill_to_address:    billAddress.trim() || null,
              bill_to_state_code: billStateCode || null,
              bill_to_state_name: stateName || null,
            },
          },
        });
        if (err) throw err;

        // Supabase quirk: when an email is already registered AND
        // "Confirm email" is on, signUp returns "success" with a stubbed
        // user (no identities, no session) instead of erroring — that's
        // to prevent email-enumeration attacks. Detect that case and
        // tell the client to sign in instead of attempting auto-login
        // with the wrong password (which would 401).
        const looksAlreadyRegistered =
          !data?.session &&
          Array.isArray(data?.user?.identities) &&
          data.user.identities.length === 0;

        if (looksAlreadyRegistered) {
          // Switch the user back to the sign-in form with the email pre-filled.
          setMode("signin");
          setPassword("");
          throw new Error("User already registered");
        }

        if (data?.session) {
          // Live session — onAuthStateChange will flip us to <PortalApp/>.
          setInfo("Account created — taking you to your portal…");
        } else {
          // No session means email confirmation is on at the platform
          // level. The auto_confirm_email_on_signup trigger has already
          // set email_confirmed_at = now() on the new row, so signIn
          // with the password the user just chose should succeed.
          setInfo("Account created — signing you in…");
          try {
            await signIn(email, password);
          } catch (signInErr) {
            // Clear the optimistic "signing you in" copy before we surface the real reason.
            setInfo(null);
            throw signInErr;
          }
        }
      }
    } catch (e2) {
      // Drop any prior info so we never show "success" + "error" together.
      setInfo(null);
      setError(friendly(e2.message || String(e2)));
    } finally {
      setBusy(false);
    }
  };

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  return (
    <div className="pt-auth">
      <style>{PORTAL_CSS}</style>
      <div className="pt-auth-bg" />

      <header className="pt-auth-nav">
        <a href="/" className="pt-auth-brand" aria-label="Aviva International">
          <img
            className="pt-brand-logo"
            src={theme === "light" ? "/aviva-wordmark-black.png" : "/aviva-wordmark-white.png"}
            alt="Aviva International"
            width="180" height="60"
          />
          <span className="pt-brand-sub-line">CLIENT PORTAL</span>
        </a>
        <div className="pt-auth-nav-right">
          <button className="pt-theme-btn" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={14}/> : <Moon size={14}/>}
          </button>
          <a href="/" className="pt-auth-back">← Back to site</a>
        </div>
      </header>

      <div className="pt-auth-grid">
        {/* Marketing-side panel */}
        <div className="pt-auth-side">
          <div className="pt-auth-side-inner">
            <div className="pt-auth-eyebrow">FOR BRANDS</div>
            <h1 className="pt-auth-h1">Launch a clothing label without buying inventory.</h1>
            <p className="pt-auth-sub">Upload your artwork, pick from 50+ blanks, push the finished products straight to your Shopify store. We print, pack, and ship on every sale — no MOQ, no setup fee.</p>
            <ul className="pt-auth-bullets">
              <li><CheckCircle2 size={14}/> Connect Shopify in one click</li>
              <li><CheckCircle2 size={14}/> Designs + mockups generated automatically</li>
              <li><CheckCircle2 size={14}/> Orders auto-route to our floor — you keep the margin</li>
              <li><CheckCircle2 size={14}/> Wallet, payouts, GST invoices included</li>
            </ul>
            <div className="pt-auth-trust">
              <div className="pt-auth-trust-item"><strong>0</strong><span>MOQ</span></div>
              <div className="pt-auth-trust-item"><strong>Same-day</strong><span>dispatch</span></div>
              <div className="pt-auth-trust-item"><strong>30+</strong><span>courier partners</span></div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="pt-auth-form-wrap">
          <div className="pt-auth-form-card">
            <div className="pt-auth-tabs">
              <button className={`pt-auth-tab ${mode === "signin" ? "on" : ""}`} onClick={() => { setMode("signin"); setError(null); setInfo(null); }}>Sign in</button>
              <button className={`pt-auth-tab ${mode === "signup" ? "on" : ""}`} onClick={() => { setMode("signup"); setError(null); setInfo(null); }}>Sign up</button>
              <div className={`pt-auth-tab-slider ${mode === "signup" ? "right" : ""}`} />
            </div>

            <h2 className="pt-auth-form-h">
              {mode === "signin" ? "Welcome back." : "Apply to onboard."}
            </h2>
            <p className="pt-auth-form-sub">
              {mode === "signin"
                ? "Sign in with your email and password."
                : "Tell us about your brand and pick a password. Instant access — no email verification."}
            </p>

            <form onSubmit={submit} className="pt-auth-form">
              {mode === "signup" && (
                <>
                  <label className="pt-field">
                    <span>Brand name</span>
                    <input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="e.g. Hashway Clothing" required autoComplete="organization" />
                  </label>
                  <label className="pt-field">
                    <span>Your full name</span>
                    <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Arav Jain" required autoComplete="name" />
                  </label>
                  <label className="pt-field">
                    <span>WhatsApp</span>
                    <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91" required autoComplete="tel" />
                  </label>

                  {/* ── Billing identity for tax invoices ─────────────
                      Captured up-front so the first wallet recharge
                      generates a valid tax invoice automatically. */}
                  <div className="pt-auth-section">
                    <div className="pt-auth-section-h">Billing details <span className="pt-auth-section-sub">(for your tax invoices)</span></div>
                  </div>
                  <label className="pt-field">
                    <span>Legal name / registered business name</span>
                    <input
                      value={billLegalName}
                      onChange={e => setBillLegalName(e.target.value)}
                      placeholder="e.g. METACIRCLES TECHNOLOGIES PVT LTD"
                      autoComplete="organization"
                    />
                  </label>
                  <label className="pt-field">
                    <span>GSTIN <em className="pt-field-opt">(optional — leave blank if not registered)</em></span>
                    <input
                      value={billGstin}
                      onChange={e => setBillGstin(e.target.value.toUpperCase())}
                      placeholder="22AAAAA0000A1Z5"
                      maxLength={15}
                      style={{ textTransform: "uppercase", fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em" }}
                    />
                  </label>
                  <label className="pt-field">
                    <span>Billing address</span>
                    <textarea
                      value={billAddress}
                      onChange={e => setBillAddress(e.target.value)}
                      placeholder="Full address with city, state, PIN"
                      rows={2}
                      style={{ resize: "vertical", minHeight: 60, lineHeight: 1.4 }}
                    />
                  </label>
                  <label className="pt-field">
                    <span>State (place of supply)</span>
                    <select
                      value={billStateCode}
                      onChange={e => setBillStateCode(e.target.value)}
                    >
                      <option value="">Select your state…</option>
                      {INDIAN_STATES.map(s => (
                        <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label className="pt-field">
                <span>Email</span>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@brand.com" required autoComplete="email" />
              </label>
              <label className="pt-field">
                <span>{mode === "signin" ? "Password" : "Create a password"}</span>
                <div className="pt-password-input">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={mode === "signin" ? "Your password" : "Min 8 characters"}
                    required
                    minLength={mode === "signup" ? 8 : 1}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  />
                  <button type="button" className="pt-password-toggle" onClick={() => setShowPw(s => !s)} aria-label={showPw ? "Hide password" : "Show password"}>
                    {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              </label>

              {error && <div className="pt-alert pt-alert-err"><AlertTriangle size={13}/> {error}</div>}
              {info  && <div className="pt-alert pt-alert-ok"><CheckCircle2 size={13}/> {info}</div>}

              <button type="submit" className="pt-btn-primary" disabled={busy}>
                {busy
                  ? <><Loader2 size={14} className="pt-spin"/> Working…</>
                  : (mode === "signin" ? <>Sign in <ArrowRight size={14}/></> : <>Create account <ArrowRight size={14}/></>)}
              </button>

              {mode === "signin" && (
                <button type="button" className="pt-link-btn" onClick={() => alert("Forgot password? WhatsApp +91 92177 65507 or email avivainternational05@gmail.com and we'll reset it for you.")}>
                  Forgot password?
                </button>
              )}

              <div className="pt-auth-switch">
                {mode === "signin"
                  ? <>New here? <button type="button" onClick={() => { setMode("signup"); setError(null); setInfo(null); }}>Apply to onboard →</button></>
                  : <>Already a partner? <button type="button" onClick={() => { setMode("signin"); setError(null); setInfo(null); }}>Sign in →</button></>}
              </div>

              <div className="pt-auth-helper">
                {mode === "signup"
                  ? "No email verification — pick a password now and you're in. We'll WhatsApp you on +91 92177 65507 once your tenant is provisioned."
                  : "Use the password you set when you signed up. Forgot it? WhatsApp +91 92177 65507 or email avivainternational05@gmail.com and we'll reset it."}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// APP SHELL
// ═══════════════════════════════════════════════════════════════════
// "Wrong door" screen shown when a staff member (admin / founder /
// worker) opens /portal. Renders a self-contained card with a one-tap
// jump to /admin. No data fetch happens before this — protects against
// the cross-tenant leak that bit us when Shivam's admin account opened
// /portal and saw Balleti's batches.
function PortalWrongDoor({ role, email }) {
  return (
    <div className="pt-shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--pt-bg, #efefef)" }}>
      <style>{`
        .pt-wrongdoor {
          max-width: 460px; width: 100%;
          padding: 36px 32px;
          background: var(--pt-bg-elev, #fff);
          border: 1px solid var(--pt-border, rgba(10,10,10,0.10));
          border-left: 4px solid var(--pt-err, #ef4444);
          border-radius: 16px;
          box-shadow: 0 18px 40px rgba(0,0,0,0.08);
          font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
        }
        .pt-wrongdoor-eyebrow {
          font-size: 11px; letter-spacing: 0.18em; font-weight: 800;
          color: var(--pt-err, #ef4444); margin-bottom: 8px;
        }
        .pt-wrongdoor-h {
          font-size: 24px; font-weight: 800; letter-spacing: -0.01em;
          color: var(--pt-text-strong, #0a0a0a); margin: 0 0 12px;
        }
        .pt-wrongdoor-p {
          font-size: 14px; line-height: 1.55;
          color: var(--pt-text, #1a1a1a); margin: 0 0 20px;
        }
        .pt-wrongdoor-p code {
          background: rgba(10,10,10,0.06);
          padding: 2px 6px; border-radius: 4px; font-size: 12.5px;
        }
        .pt-wrongdoor-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .pt-wrongdoor-cta {
          flex: 1; min-width: 140px;
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          padding: 12px 18px; border-radius: 999px;
          background: var(--pt-text-strong, #0a0a0a);
          color: var(--pt-bg, #efefef);
          font-size: 13px; font-weight: 800; letter-spacing: 0.10em;
          text-transform: uppercase; text-decoration: none;
          transition: transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 6px 18px rgba(0,0,0,0.18);
        }
        .pt-wrongdoor-cta:hover { transform: translateY(-1px); }
        .pt-wrongdoor-secondary {
          flex: 1; min-width: 140px;
          display: inline-flex; align-items: center; justify-content: center;
          padding: 12px 18px; border-radius: 999px;
          background: transparent;
          border: 1px solid var(--pt-border, rgba(10,10,10,0.18));
          color: var(--pt-text, #1a1a1a);
          font-size: 13px; font-weight: 700; letter-spacing: 0.10em;
          text-transform: uppercase; text-decoration: none; cursor: pointer;
        }
        .pt-wrongdoor-fine {
          margin-top: 18px;
          font-size: 11.5px; color: var(--pt-text-dim, #555);
        }
      `}</style>
      <div className="pt-wrongdoor" role="alert">
        <div className="pt-wrongdoor-eyebrow">WRONG DOOR · STAFF ACCOUNT</div>
        <h1 className="pt-wrongdoor-h">This is the client portal.</h1>
        <p className="pt-wrongdoor-p">
          You're signed in as <b>{email}</b> with the <code>{role}</code> role.
          The client portal only shows a single brand's data — your dashboard
          for managing every brand lives at <code>/admin</code>.
        </p>
        <div className="pt-wrongdoor-row">
          <a href="/admin" className="pt-wrongdoor-cta">Go to /admin →</a>
          <button
            type="button"
            className="pt-wrongdoor-secondary"
            onClick={async () => { await supabase.auth.signOut(); window.location.href = "/portal"; }}
          >
            Sign out
          </button>
        </div>
        <div className="pt-wrongdoor-fine">
          If you actually meant to onboard yourself as a brand, sign out and
          sign up again with a fresh email.
        </div>
      </div>
    </div>
  );
}

function PortalApp({ session, theme, setTheme }) {
  // ── Role gate ──────────────────────────────────────────────────────
  // The portal is a CLIENT-only surface. Admin / founder / worker
  // accounts share Supabase auth cookies with /admin, so if a staffer
  // happens to type /portal in the URL bar they land here. RLS on
  // wallet_debits / label_batches / client_recharges has a deliberate
  // admin-bypass (so /admin can see every tenant's orders), which
  // means the Portal's unfiltered queries leak ALL tenants' data when
  // an admin opens this page. Hard-gate it here BEFORE any data fetch
  // runs so nothing renders cross-tenant.
  const [profileChecked, setProfileChecked] = useState(false);
  const [staffRole, setStaffRole] = useState(null); // 'admin'|'founder'|'worker'|null
  useEffect(() => {
    let alive = true;
    supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const role = data?.role || null;
        setStaffRole(["admin", "founder", "worker"].includes(role) ? role : null);
        setProfileChecked(true);
      })
      .catch(() => { if (alive) setProfileChecked(true); });
    return () => { alive = false; };
  }, [session.user.id]);

  if (!profileChecked) {
    return <div className="pt-shell"><div className="pt-state">Loading…</div></div>;
  }
  if (staffRole) {
    // Staff opened the wrong door — bounce them to /admin.
    return <PortalWrongDoor role={staffRole} email={session.user.email} />;
  }

  return <PortalAppClient session={session} theme={theme} setTheme={setTheme} />;
}

// Original Portal body — only renders for confirmed client-role users.
function PortalAppClient({ session, theme, setTheme }) {
  const [page, setPage]   = useState("overview");
  const [addingFor, setAddingFor]     = useState(null);
  const [myProducts, setMyProducts]   = useState([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [stores, setStores]           = useState([]);

  // Pull the client's saved products from Supabase on mount and on
  // every realtime change to client_products. RLS scopes to the
  // caller's rows automatically.
  const refreshProducts = useCallback(async () => {
    try {
      const rows = await listMyClientProducts();
      setMyProducts(rows);
    } catch (e) {
      console.error("[PortalApp] listMyClientProducts", e);
    } finally {
      setProductsLoaded(true);
    }
  }, []);
  useEffect(() => { refreshProducts(); }, [refreshProducts]);
  useMinutePoll(refreshProducts);
  useEffect(() => {
    const u = subscribe("client_products", () => refreshProducts());
    return () => u && u();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [brandProfile, setBrandProfile] = useState({
    brandName: session.user.user_metadata?.brand_name || "Your brand",
    fullName:  session.user.user_metadata?.full_name  || session.user.email,
    email:     session.user.email,
    phone:     session.user.user_metadata?.phone || "",
  });

  // Wallet — real balance = paid top-ups (client_recharges) − production
  // debits (wallet_debits). RLS scopes both tables to this client's tenant.
  const [balance, setBalance]           = useState(0);          // ₹
  const [transactions, setTransactions] = useState([]);         // {id, ts, type, amount, note}
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  // Mobile drawer state — sidebar slides in below 880 px when opened
  // via the topbar hamburger. Auto-closes on every page change and on
  // Escape so the user never has to manually dismiss it.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const refreshWallet = useCallback(async () => {
    try {
      const { txns, balance } = await listWalletTxns();
      setTransactions(txns);
      setBalance(balance);
    } catch (e) { console.error("[PortalApp] listWalletTxns", e); }
    finally { setWalletLoaded(true); }
  }, []);
  useEffect(() => { refreshWallet(); }, [refreshWallet]);
  useMinutePoll(refreshWallet);
  useEffect(() => {
    const u = subscribe("wallet_debits", () => refreshWallet());
    return () => u && u();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Label-upload orders — lifted here so the Overview can show real status
  // counts and a recent-orders list without the Orders page being mounted.
  const [labelBatches, setLabelBatches] = useState([]);
  const [batchesLoaded, setBatchesLoaded] = useState(false);
  const refreshBatches = useCallback(async () => {
    try {
      const rows = await listLabelBatches();
      setLabelBatches(rows || []);
    } catch (e) { console.error("[PortalApp] listLabelBatches", e); }
    finally { setBatchesLoaded(true); }
  }, []);
  useEffect(() => { refreshBatches(); }, [refreshBatches]);
  useMinutePoll(refreshBatches);
  useEffect(() => {
    const u = subscribe("label_batches", () => refreshBatches());
    return () => u && u();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Support tickets — local state until we wire to a Supabase tickets table.
  const [tickets, setTickets]           = useState([]);         // {id, subject, body, status, createdAt, messages: []}
  const [ticketsOpen, setTicketsOpen]   = useState(false);

  // Mock orders so the Orders page isn't blank — replace with real Shopify sync.
  const mockOrders = useMemo(() => [], []);

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  // Wallet handlers — both just re-pull the real balance/feed from the DB.
  const addBalance = () => { refreshWallet(); };
  const refreshBalance = () => { refreshWallet(); };

  // Ticket handlers
  const submitTicket = ({ subject, body }) => {
    const t = {
      id: `tkt-${Date.now()}`,
      subject: subject.trim(),
      body: body.trim(),
      status: "open",
      createdAt: new Date().toISOString(),
      messages: [{ from: "client", body: body.trim(), at: new Date().toISOString() }],
    };
    setTickets(prev => [t, ...prev]);
    return t;
  };
  const replyToTicket = (ticketId, body) => {
    setTickets(prev => prev.map(t => t.id === ticketId
      ? { ...t, messages: [...t.messages, { from: "client", body, at: new Date().toISOString() }] }
      : t));
  };
  const closeTicket = (ticketId) => {
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: "resolved" } : t));
  };

  const saveProduct = (productConfig) => {
    setMyProducts(prev => {
      const idx = prev.findIndex(p => p.localId === productConfig.localId);
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = productConfig;
        return copy;
      }
      return [productConfig, ...prev];
    });
  };

  // AddProducts has already persisted via Supabase by the time it
  // invokes onSaveAll — we just need to refresh local state, close the
  // modal, and route to My Products.
  const saveProducts = (newRows) => {
    setMyProducts(prev => [...(newRows || []), ...prev]);
    setAddingFor(null);
    setPage("products");
    refreshProducts();   // re-read so realtime + insert returns reconcile
  };

  const deleteProduct = async (id) => {
    try {
      await deleteClientProduct(id);
      setMyProducts(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      alert(e.message || "Couldn't delete this product");
    }
  };

  const publishProduct = async (id, storeId) => {
    try {
      const { error } = await supabase
        .from("client_products")
        .update({ status: "live", shopify_link: storeId || undefined })
        .eq("id", id);
      if (error) throw error;
      refreshProducts();
    } catch (e) {
      alert(e.message || "Couldn't publish this product");
    }
  };

  // Close the mobile drawer + lock body scroll while it's open.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);
  // Auto-close on every page switch so the user lands on the new
  // page with the drawer dismissed.
  useEffect(() => { setSidebarOpen(false); }, [page]);

  return (
    <div className={`pt-app ${sidebarOpen ? "pt-app--drawer-open" : ""}`}>
      <style>{PORTAL_CSS}</style>
      {/* Backdrop shown only on mobile when drawer is open. */}
      <div
        className={`pt-sidebar-backdrop ${sidebarOpen ? "is-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden={!sidebarOpen}
      />
      <PortalSidebar
        page={page} setPage={setPage}
        brandProfile={brandProfile} myProducts={myProducts}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="pt-main">
        <PortalTopBar
          brandProfile={brandProfile}
          theme={theme} toggleTheme={toggleTheme}
          balance={balance}
          onRefreshBalance={refreshBalance}
          onRecharge={() => setRechargeOpen(true)}
          onOpenTickets={() => setTicketsOpen(true)}
          onOpenMenu={() => setSidebarOpen(true)}
          ticketCount={tickets.filter(t => t.status === "open").length}
        />
        {/* Wallet status banner: three-state trigger that shows on every
            page when the wallet needs attention.
              • balance < 0     → red, "overdrawn, recharge ASAP"
              • balance < 500   → amber, "running low, top up soon"
              • else            → not rendered
            One tap opens the existing RechargeModal. */}
        {walletLoaded && balance != null && (balance < 500) && (
          <div
            className={`pt-wallet-alert ${balance < 0 ? "pt-wallet-alert-danger" : "pt-wallet-alert-warn"}`}
            role="alert"
          >
            <div className="pt-wallet-alert-l">
              <span className="pt-wallet-alert-icon"><AlertTriangle size={18}/></span>
              <div>
                {balance < 0 ? (
                  <>
                    <div className="pt-wallet-alert-h">Wallet is in the negative — recharge ASAP</div>
                    <div className="pt-wallet-alert-p">
                      You are overdrawn by <b>₹{Math.abs(balance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>.
                      Production is charged as labels are uploaded — please top up before your next upload.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pt-wallet-alert-h">Wallet running low — recharge soon</div>
                    <div className="pt-wallet-alert-p">
                      Only <b>₹{Number(balance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> left.
                      That's barely a single order — top up now to avoid the next upload being blocked.
                    </div>
                  </>
                )}
              </div>
            </div>
            <button className="pt-wallet-alert-cta" onClick={() => setRechargeOpen(true)}>
              Recharge now →
            </button>
          </div>
        )}
        <div className="pt-page">
          {page === "overview"  && <Overview brandProfile={brandProfile} myProducts={myProducts} stores={stores} labelBatches={labelBatches} batchesLoaded={batchesLoaded} balance={balance} walletLoaded={walletLoaded} goto={setPage} onAdd={() => setAddingFor({})} onTopUp={() => setRechargeOpen(true)} />}
          {page === "catalog"   && <Catalog onPick={(blank) => setAddingFor({ blank, blankId: blank?.id })} />}
          {page === "products"  && <MyProducts items={myProducts} stores={stores} onDelete={deleteProduct} onPublish={publishProduct} goto={setPage} onAdd={() => setAddingFor({})} />}
          {page === "stores"    && <Stores stores={stores} setStores={setStores} />}
          {page === "orders"    && <Orders myProducts={myProducts} goto={setPage} batches={labelBatches} batchesLoaded={batchesLoaded} refreshBatches={refreshBatches} />}
          {page === "rtos"      && <RTOsPage />}
          {page === "wallet"    && <WalletPage brandProfile={brandProfile} balance={balance} transactions={transactions} loading={!walletLoaded} onRecharge={() => setRechargeOpen(true)} />}
          {page === "settings"  && <SettingsPage brandProfile={brandProfile} setBrandProfile={setBrandProfile} />}
        </div>
        <SiteFooter theme={theme} />
      </div>

      {addingFor && (
        <AddProducts
          /* Prefer the full product object the new Catalog passes through;
             fall back to the legacy CATALOG_MOCK lookup so any older code
             path that only set blankId still pre-fills correctly. */
          catalogBlank={
            addingFor.blank
              || (addingFor.blankId ? CATALOG_MOCK.find(p => p.id === addingFor.blankId) : null)
          }
          onClose={() => setAddingFor(null)}
          onSaveAll={saveProducts}
        />
      )}

      {rechargeOpen && (
        <RechargeModal
          balance={balance}
          onClose={() => setRechargeOpen(false)}
          onAdd={(amount, method) => { addBalance(amount, `Top-up · ${method}`); setRechargeOpen(false); }}
        />
      )}

      {ticketsOpen && (
        <TicketsModal
          brandProfile={brandProfile}
          tickets={tickets}
          onClose={() => setTicketsOpen(false)}
          onSubmit={submitTicket}
          onReply={replyToTicket}
          onResolve={closeTicket}
        />
      )}
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────
function PortalSidebar({ page, setPage, brandProfile, myProducts, isOpen = false, onClose }) {
  const draftCount = myProducts.filter(p => p.status === "draft").length;
  const publishedCount = myProducts.filter(p => p.status === "published").length;

  const nav = [
    { id: "overview", label: "Overview",    icon: LayoutDashboard },
    { id: "catalog",  label: "Catalog",     icon: Package },
    { id: "products", label: "My Products", icon: ShoppingBag, badge: myProducts.length || null },
    { id: "stores",   label: "Stores",      icon: Store },
    { id: "orders",   label: "Orders",      icon: ClipboardList },
    { id: "rtos",     label: "RTOs",        icon: RotateCcw },
    { id: "wallet",   label: "Wallet",      icon: Wallet },
    { id: "settings", label: "Settings",    icon: SettingsIcon },
  ];

  return (
    <aside className={`pt-sidebar ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen && typeof window !== "undefined" && window.innerWidth <= 880}>
      <div className="pt-logo">
        <div className="pt-logo-mark">
          <svg viewBox="0 0 64 64" width="28" height="28">
            <rect width="64" height="64" rx="14" fill="var(--pt-accent)"/>
            <path d="M 32 13 L 12 51" stroke="var(--pt-bg)" strokeWidth="6.5" strokeLinecap="round" fill="none"/>
            <path d="M 32 13 L 52 51" stroke="var(--pt-bg)" strokeWidth="6.5" strokeLinecap="round" fill="none"/>
            <line x1="21" y1="37" x2="43" y2="37" stroke="var(--pt-bg)" strokeWidth="4.5" strokeLinecap="round"/>
            <circle cx="50" cy="14" r="3" fill="var(--pt-success)"/>
          </svg>
        </div>
        <div>
          <div className="pt-logo-name">{(brandProfile?.brandName || "BRAND").toUpperCase()}<span className="pt-dot">.</span>STUDIO</div>
          <div className="pt-logo-sub">powered by AVIVA</div>
        </div>
        {/* Close button only renders inside the mobile drawer (CSS-hidden on desktop). */}
        <button
          type="button"
          className="pt-sidebar-close"
          aria-label="Close menu"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      <nav className="pt-nav">
        {nav.map(n => {
          const Icon = n.icon;
          return (
            <button key={n.id} className={`pt-nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
              <Icon size={15}/>
              <span>{n.label}</span>
              {n.badge != null && <span className="pt-nav-badge">{n.badge}</span>}
              {page === n.id && <ChevronRight size={12} className="pt-nav-chev"/>}
            </button>
          );
        })}
      </nav>

      <div className="pt-sidebar-foot">
        <div className="pt-foot-stats">
          <div><strong>{draftCount}</strong><span>drafts</span></div>
          <div><strong>{publishedCount}</strong><span>live</span></div>
        </div>
        <div className="pt-foot-user">
          <div className="pt-foot-avatar">{(brandProfile?.fullName || "?").slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="pt-foot-name">{brandProfile?.fullName || "—"}</div>
            <div className="pt-foot-sub">{brandProfile?.brandName || ""}</div>
          </div>
        </div>
        <div className="pt-foot-contact">
          <a href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer">+91 92177 65507</a>
          <a href="mailto:avivainternational05@gmail.com">avivainternational05@gmail.com</a>
        </div>
        <button className="pt-btn-ghost pt-foot-logout" onClick={() => signOut()}>
          <LogOut size={11}/> SIGN OUT
        </button>
      </div>
    </aside>
  );
}

function PortalTopBar({
  brandProfile, theme, toggleTheme,
  balance, onRefreshBalance, onRecharge, onOpenTickets, ticketCount,
  onOpenMenu,
}) {
  const [spin, setSpin] = useState(false);
  const { hidden, scrolled } = useSmartHeader();
  const refresh = () => {
    setSpin(true);
    onRefreshBalance?.();
    setTimeout(() => setSpin(false), 700);
  };
  return (
    <header className={`pt-topbar${hidden ? " is-hidden" : ""}${scrolled ? " is-scrolled" : ""}`}>
      <div className="pt-topbar-left">
        {/* Hamburger only renders on mobile (CSS-hidden ≥881 px). */}
        <button
          type="button"
          className="pt-burger"
          aria-label="Open menu"
          onClick={onOpenMenu}
        >
          <Menu size={18} />
        </button>
        <a href="/" className="pt-topbar-logo" aria-label="Aviva International" title="Aviva International home">
          <img src={theme === "light" ? "/aviva-wordmark-black.png" : "/aviva-wordmark-white.png"} alt="Aviva International" height="22" />
        </a>
        <div className="pt-date-chip"><Calendar size={12}/>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</div>
      </div>
      <div className="pt-topbar-right">
        {/* Wallet pill — current balance + manual refresh */}
        <div className="pt-wallet-pill" title="Wallet balance">
          <span className="pt-wallet-pill-icon"><Wallet size={14}/></span>
          <span className={`pt-wallet-pill-amt ${balance != null && balance < 0 ? "is-negative" : balance != null && balance < 500 ? "is-low" : ""}`}>₹{(balance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <button className={`pt-wallet-pill-refresh ${spin ? "spinning" : ""}`} onClick={refresh} aria-label="Refresh balance" title="Refresh">
            <RefreshCw size={11}/>
          </button>
        </div>

        {/* Recharge */}
        <button className="pt-topbar-btn pt-topbar-btn-recharge" onClick={onRecharge}>
          <Plus size={13}/> <span>Recharge</span>
        </button>

        {/* Tickets — with notification dot when any are open */}
        <button className="pt-topbar-btn pt-topbar-btn-tickets" onClick={onOpenTickets}>
          <LifeBuoy size={13}/> <span>Tickets</span>
          {ticketCount > 0 && <span className="pt-topbar-btn-badge">{ticketCount}</span>}
        </button>

        <button className="pt-theme-btn" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "light" ? <Moon size={14}/> : <Sun size={14}/>}
        </button>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: OVERVIEW
// ═══════════════════════════════════════════════════════════════════
// Compact color-coded status chip used on the client overview/orders.
const PT_STATUS_COLOR = {
  uploaded:          "var(--pt-text-muted)",
  in_production:     "var(--pt-amber)",
  ready_to_dispatch: "var(--pt-cyan)",
  dispatched:        "var(--pt-accent)",
  delivered:         "var(--pt-success)",
  rto_in_transit:    "var(--pt-amber)",
  rto:               "var(--pt-err)",
  cancelled:         "var(--pt-err)",
};
function PortalStatusChip({ status }) {
  const c = PT_STATUS_COLOR[status] || "var(--pt-text-muted)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", border: `1px solid ${c}`, color: c, whiteSpace: "nowrap" }}>
      {LABEL_STATUS[status] || status?.toUpperCase()}
    </span>
  );
}

function Overview({ brandProfile, myProducts, stores, labelBatches = [], batchesLoaded = false, balance = 0, walletLoaded = false, goto, onAdd, onTopUp }) {
  // Velocity-aware tracking — Balleti and any future tenant with
  // velocity_username gets per-AWB courier truth pulled here so the
  // KPI strip can render real "Out for delivery" / "Needs attention"
  // counts. Non-Velocity tenants fall through to batch-status
  // bucketing in shipmentStats below.
  const [velocityTenantId, setVelocityTenantId] = useState(null);  // null while loading, false if not a velocity tenant, string id otherwise
  const [trackingByAwb, setTrackingByAwb]       = useState({});
  const [rtoShipCount, setRtoShipCount]         = useState(0);

  // Resolve tenant once and check Velocity wiring + RTO shipment total.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { tenantId } = await myTenantId();
        if (!alive) return;
        const tenant = await fetchTenant(tenantId);
        if (!alive) return;
        setVelocityTenantId(tenant?.velocity_username ? tenantId : false);
        // RTO total = rto_shipments.length (bundles rto_in_transit + rto_delivered)
        const { count } = await supabase
          .from("rto_shipments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId);
        if (alive) setRtoShipCount(count || 0);
      } catch { if (alive) { setVelocityTenantId(false); setRtoShipCount(0); } }
    })();
    return () => { alive = false; };
  }, []);

  // Pre-fetch Velocity status for every AWB across every batch so the
  // KPI cards populate immediately — no need for the user to expand a
  // batch first. Server-side endpoint caches behind the scenes.
  useEffect(() => {
    if (!velocityTenantId || !labelBatches.length) return;
    const awbs = labelBatches
      .flatMap(b => Array.isArray(b.shipments) ? b.shipments : [])
      .map(s => s && s.awb)
      .filter(Boolean);
    const pending = awbs.filter(a => !trackingByAwb[a]);
    if (!pending.length) return;
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch("/api/velocity-track", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ tenant_id: velocityTenantId, awbs: pending }),
        });
        const body = await res.json().catch(() => ({}));
        if (!alive || !res.ok) return;
        setTrackingByAwb(prev => {
          const next = { ...prev };
          for (const a of pending) {
            const hit = body.statuses && body.statuses[a];
            next[a] = hit ? hit : { status_label: "Not on Velocity", variant: "muted" };
          }
          return next;
        });
      } catch { /* silent — KPI cards just stay at 0 */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [velocityTenantId, labelBatches]);

  // Same bucketing as /admin → Clients → [client]. For Velocity
  // tenants we count per-AWB courier truth; for everyone else the
  // batch-status fallback fills the basic three buckets.
  const shipmentStats = useMemo(() => {
    const PACKED_STATUSES = new Set(["ready_to_dispatch", "dispatched", "delivered", "rto", "rto_in_transit"]);
    // Flat shipment rows so we can both COUNT and DRILL DOWN per bucket
    // when the client clicks a KPI card. byBucket below indexes these
    // rows by bucket name for the drill-down panel.
    const rows = [];
    for (const b of labelBatches) {
      const ships = Array.isArray(b.shipments) ? b.shipments : [];
      for (const s of ships) {
        if (!s || !s.order_ref) continue;
        const tr = s.awb ? trackingByAwb[s.awb] : null;
        let bucket = "other", statusLabel = "—";
        if (velocityTenantId && tr && !tr.loading && !tr.error) {
          const variant = tr.variant;
          const raw     = String(tr.status_raw || "").toLowerCase();
          statusLabel   = tr.status_label || raw;
          if (variant === "rto")                                                                          bucket = "rto";
          else if (raw === "delivered" || raw === "return_delivered")                                     bucket = "delivered";
          else if (raw === "out_for_delivery")                                                            bucket = "outForDelivery";
          else if (raw === "in_transit" || raw === "return_in_transit")                                   bucket = "inTransit";
          else if (raw === "not_picked" || raw === "return_not_picked")                                   bucket = "pickupFailed";
          else if (
            raw === "ndr_raised" || raw === "return_ndr_raised" ||
            raw === "need_attention" || raw === "return_need_attention" ||
            raw === "reattempt_delivery"
          )                                                                                                bucket = "needsAttention";
          else if (variant === "waiting")                                                                  bucket = "waitingPickup";
        } else {
          if (b.status === "delivered")              { bucket = "delivered";     statusLabel = "Delivered"; }
          else if (b.status === "dispatched")        { bucket = "inTransit";     statusLabel = "In transit"; }
          else if (b.status === "ready_to_dispatch") { bucket = "waitingPickup"; statusLabel = "Awaiting pickup"; }
        }
        rows.push({
          order_ref:    s.order_ref,
          awb:          s.awb,
          courier:      s.courier,
          batch_code:   b.order_code,
          batch_status: b.status,
          bucket,
          status_label: statusLabel,
        });
      }
    }

    let received = 0, packed = 0;
    for (const b of labelBatches) {
      const n = Number(b.label_count) || 0;
      received += n;
      if (PACKED_STATUSES.has(b.status)) packed += n;
    }
    const v = { delivered: 0, outForDelivery: 0, inTransit: 0, waitingPickup: 0, pickupFailed: 0, needsAttention: 0, other: 0 };
    const byBucket = { received: rows, packed: rows.filter(r => PACKED_STATUSES.has(r.batch_status)) };
    for (const r of rows) {
      if (r.bucket in v) v[r.bucket]++;
      if (!byBucket[r.bucket]) byBucket[r.bucket] = [];
      byBucket[r.bucket].push(r);
    }
    if (velocityTenantId) {
      // counts above match the per-row bucketing
    } else {
      // Non-Velocity bucketing happened above via batch.status
      for (const b of labelBatches) {
        const n = Number(b.label_count) || 0;
        if (b.status === "delivered")         v.delivered     += n;
        if (b.status === "dispatched")        v.inTransit     += n;
        if (b.status === "ready_to_dispatch") v.waitingPickup += n;
      }
    }
    return { received, packed, ...v, rto: rtoShipCount, byBucket };
  }, [labelBatches, velocityTenantId, trackingByAwb, rtoShipCount]);

  // When the client clicks a KPI card, store its bucket here so the
  // drill-down panel below renders the matching flat list of order_refs.
  const [statusFilter, setStatusFilter] = useState(null);

  const recent = labelBatches.slice(0, 5);
  const hasOrders = labelBatches.length > 0;
  const showOnboarding = batchesLoaded && !hasOrders;
  const fmtINR = (n) => "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="pt-dash">
      <PageHeader title={`Welcome, ${brandProfile.fullName.split(" ")[0]}.`} sub={`${brandProfile.brandName} · ${hasOrders ? `${labelBatches.length} order${labelBatches.length === 1 ? "" : "s"} on file` : "Client portal"}`} />

      {/* Pickup follow-up alert — only renders if Velocity flagged
          either "not picked up" or stuck-at-waiting shipments. Both
          buckets indicate the courier needs re-scheduling or an
          escalation from the client's side, since Balleti books
          shipments through their own Velocity dashboard. */}
      {(() => {
        const failed  = shipmentStats.byBucket?.pickupFailed  || [];
        const waiting = shipmentStats.byBucket?.waitingPickup || [];
        const total   = failed.length + waiting.length;
        if (!velocityTenantId || total === 0) return null;
        const allRefs = [...failed, ...waiting];
        return (
          <section className="pt-pickup-alert pt-mt">
            <div className="pt-pickup-alert-l">
              <div className="pt-pickup-alert-icon"><AlertTriangle size={18}/></div>
              <div className="pt-pickup-alert-body">
                <div className="pt-pickup-alert-h">
                  {total} order{total === 1 ? "" : "s"} need pickup re-scheduling
                </div>
                <div className="pt-pickup-alert-sub">
                  {failed.length > 0 && <span><strong>{failed.length}</strong> {failed.length === 1 ? "has" : "have"} a failed pickup attempt</span>}
                  {failed.length > 0 && waiting.length > 0 && <span>, </span>}
                  {waiting.length > 0 && <span><strong>{waiting.length}</strong> stuck waiting for pickup</span>}
                  . Re-schedule the pickup or raise an escalation from your Velocity dashboard.
                </div>
                <div className="pt-pickup-alert-tags">
                  {allRefs.slice(0, 6).map((r, i) => (
                    <span key={`${r.order_ref}_${i}`} className="pt-pickup-alert-tag">{r.order_ref}</span>
                  ))}
                  {allRefs.length > 6 && (
                    <span className="pt-pickup-alert-tag pt-pickup-alert-tag-more">+ {allRefs.length - 6} more</span>
                  )}
                </div>
              </div>
            </div>
            <div className="pt-pickup-alert-cta">
              <a
                href="https://shazam.velocity.in"
                target="_blank"
                rel="noopener noreferrer"
                className="pt-btn-primary pt-btn-sm"
              >
                Open Velocity <ExternalLink size={12}/>
              </a>
              <button
                className="pt-btn-ghost pt-btn-sm"
                onClick={() => setStatusFilter(failed.length >= waiting.length ? "pickupFailed" : "waitingPickup")}
              >
                View affected
              </button>
            </div>
          </section>
        );
      })()}

      {/* Wallet stays alone — it's the financial CTA and the user
          clicks here often. The shipment analytics row below mirrors
          the same status breakdown shown on /admin → Clients → me. */}
      <div className="pt-kpi-grid" style={{ gridTemplateColumns: "1fr" }}>
        <KPICard label="Wallet balance" value={walletLoaded ? fmtINR(balance) : "…"} unit={balance < 0 ? "top up" : "available"} icon={Wallet} accent={balance < 0 ? "amber" : "green"} onClick={() => goto("wallet")} />
      </div>

      <div className="pt-kpi-grid pt-kpi-grid-wide pt-mt">
        <KPICard label="Orders Received"  value={batchesLoaded ? shipmentStats.received        : "…"} unit="labels"             icon={ClipboardList} accent="yellow" onClick={() => setStatusFilter("received")} />
        <KPICard label="Packed"           value={batchesLoaded ? shipmentStats.packed          : "…"} unit="ready to ship"      icon={Package}       accent="cyan"   onClick={() => setStatusFilter("packed")} />
        <KPICard label="Waiting Pickup"   value={batchesLoaded ? shipmentStats.waitingPickup   : "…"} unit="courier en route"   icon={Clock}         accent="amber"  onClick={() => setStatusFilter("waitingPickup")} />
        <KPICard label="Pickup Failed"    value={batchesLoaded ? shipmentStats.pickupFailed    : "…"} unit="not picked up"      icon={AlertTriangle} accent="amber"  onClick={() => setStatusFilter("pickupFailed")} />
        <KPICard label="In Transit"       value={batchesLoaded ? shipmentStats.inTransit       : "…"} unit="between hubs"       icon={Truck}         accent="cyan"   onClick={() => setStatusFilter("inTransit")} />
        <KPICard label="Out for Delivery" value={batchesLoaded ? shipmentStats.outForDelivery  : "…"} unit="at customer hub"    icon={MapPin}        accent="cyan"   onClick={() => setStatusFilter("outForDelivery")} />
        <KPICard label="Delivered"        value={batchesLoaded ? shipmentStats.delivered       : "…"} unit="completed"          icon={CheckCircle2}  accent="green"  onClick={() => setStatusFilter("delivered")} />
        <KPICard label="Needs Attention"  value={batchesLoaded ? shipmentStats.needsAttention  : "…"} unit="NDR / re-attempt"   icon={AlertTriangle} accent="amber"  onClick={() => setStatusFilter("needsAttention")} />
        <KPICard label="RTO"              value={shipmentStats.rto}                                  unit="in transit + delivered" icon={ArrowUpRight}  accent="amber"  onClick={() => setStatusFilter("rto")} />
      </div>

      {/* Status drill-down — when the client clicks a KPI card, flat
          list of order_refs matching that status renders here inline.
          Click ✕ to clear and return to the recent-orders view below. */}
      {statusFilter && (() => {
        const BUCKET_LABELS = {
          received: "Orders Received", packed: "Packed",
          waitingPickup: "Waiting Pickup", pickupFailed: "Pickup Failed",
          inTransit: "In Transit", outForDelivery: "Out for Delivery",
          delivered: "Delivered", needsAttention: "Needs Attention", rto: "RTO",
        };
        const drillRows = (shipmentStats.byBucket && shipmentStats.byBucket[statusFilter]) || [];
        return (
          <section className="pt-panel pt-mt">
            <div className="pt-panel-head">
              <div>
                <h2>{(BUCKET_LABELS[statusFilter] || statusFilter).toUpperCase()}</h2>
                <div className="pt-panel-sub">{drillRows.length} order{drillRows.length === 1 ? "" : "s"} matching</div>
              </div>
              <button className="pt-btn-ghost pt-btn-sm" onClick={() => setStatusFilter(null)}>
                <X size={12}/> Clear filter
              </button>
            </div>
            {drillRows.length === 0 ? (
              <div className="pt-empty" style={{ padding: 22 }}>No orders in this status yet.</div>
            ) : (
              <div className="pt-ord-list">
                {drillRows.map((r, i) => (
                  <div key={`${r.order_ref}_${i}`} className="pt-ord">
                    <div className="pt-ord-icon"><Package size={15}/></div>
                    <div className="pt-ord-body">
                      <div className="pt-ord-row1">
                        <span className="pt-ord-code">{r.order_ref}</span>
                        <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: 6, background: "color-mix(in srgb, var(--pt-accent, #5b9bff) 14%, transparent)", fontSize: 11, fontWeight: 600 }}>
                          {r.status_label}
                        </span>
                      </div>
                      <div className="pt-ord-meta">
                        <span>{r.courier || "—"}</span>
                        {r.awb && <>
                          <span className="pt-ord-dot">·</span>
                          <a href={trackingUrl(r.courier, r.awb)} target="_blank" rel="noreferrer" style={{ color: "var(--pt-text)" }}>{r.awb}</a>
                        </>}
                        {r.batch_code && <>
                          <span className="pt-ord-dot">·</span>
                          <span>Batch {r.batch_code}</span>
                        </>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })()}

      {showOnboarding && (
        <section className="pt-panel pt-mt pt-rise">
          <div className="pt-panel-head">
            <div><h2>GET STARTED</h2><div className="pt-panel-sub">Two steps to your first print run</div></div>
          </div>
          <div className="pt-checklist">
            <button className="pt-check-row" onClick={onTopUp}>
              <div className="pt-check-icon"><Circle size={20}/></div>
              <div className="pt-check-text">
                <div className="pt-check-step">STEP 1</div>
                <div className="pt-check-label">Top up your wallet — covers production + GST</div>
              </div>
              <ChevronRight size={16}/>
            </button>
            <button className="pt-check-row" onClick={() => goto("orders")}>
              <div className="pt-check-icon"><Circle size={20}/></div>
              <div className="pt-check-text">
                <div className="pt-check-step">STEP 2</div>
                <div className="pt-check-label">Upload your courier shipping labels for the day</div>
              </div>
              <ChevronRight size={16}/>
            </button>
          </div>
        </section>
      )}

      <div className="pt-two-col pt-mt">
        <section className="pt-panel pt-rise">
          <div className="pt-panel-head">
            <div><h2>RECENT ORDERS</h2><div className="pt-panel-sub">{hasOrders ? "Latest activity · click an order to view shipments" : "No orders yet"}</div></div>
            <button className="pt-btn-ghost pt-btn-sm" onClick={() => goto("orders")}>View all <ChevronRight size={12}/></button>
          </div>
          {!batchesLoaded ? (
            <div className="pt-ord-list">
              {[0,1,2].map(i => (
                <div key={i} className="pt-ord">
                  <span className="pt-skel" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }}/>
                  <div className="pt-ord-body">
                    <span className="pt-skel pt-skel-line" style={{ width: "42%" }}/>
                    <span className="pt-skel pt-skel-line" style={{ width: "68%", height: 9, marginTop: 8 }}/>
                  </div>
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="pt-empty" style={{ padding: 18 }}>Upload your first shipping labels from the Orders tab to start a print run.</div>
          ) : (
            <div className="pt-ord-list">
              {recent.map((b, i) => (
                <button key={b.id} className="pt-ord pt-rise" style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }} onClick={() => goto("orders")}>
                  <div className="pt-ord-icon"><Package size={15}/></div>
                  <div className="pt-ord-body">
                    <div className="pt-ord-row1">
                      <span className="pt-ord-code">{b.order_code || "Order"}</span>
                      <PortalStatusChip status={b.status} />
                    </div>
                    <div className="pt-ord-meta">
                      <span>{b.label_count} label{b.label_count === 1 ? "" : "s"}</span>
                      <span className="pt-ord-dot">·</span>
                      <span>{b.unit_count} piece{b.unit_count === 1 ? "" : "s"}</span>
                      <span className="pt-ord-dot">·</span>
                      <span>{new Date(b.created_at || b.batch_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                  </div>
                  <ChevronRight size={15} className="pt-ord-chev"/>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="pt-panel pt-rise" style={{ animationDelay: "60ms" }}>
          <div className="pt-panel-head">
            <div><h2>QUICK ACTIONS</h2><div className="pt-panel-sub">Jump straight in</div></div>
          </div>
          <div className="pt-qa-grid">
            <button className="pt-qa" onClick={() => goto("orders")}>
              <Upload size={18}/>
              <div>
                <div className="pt-qa-h">Upload shipping labels</div>
                <div className="pt-qa-p">Drop courier label PDFs · we build the production summary</div>
              </div>
              <ArrowUpRight size={14}/>
            </button>
            <button className="pt-qa" onClick={onTopUp}>
              <Wallet size={18}/>
              <div>
                <div className="pt-qa-h">Top up wallet</div>
                <div className="pt-qa-p">Current balance: {walletLoaded ? fmtINR(balance) : "…"}</div>
              </div>
              <ArrowUpRight size={14}/>
            </button>
            <button className="pt-qa" onClick={() => goto("wallet")}>
              <ClipboardList size={18}/>
              <div>
                <div className="pt-qa-h">Wallet history</div>
                <div className="pt-qa-p">Top-ups + per-order debits</div>
              </div>
              <ArrowUpRight size={14}/>
            </button>
            <button className="pt-qa" onClick={() => goto("catalog")}>
              <Package size={18}/>
              <div>
                <div className="pt-qa-h">Browse catalog</div>
                <div className="pt-qa-p">{CATALOG_MOCK.length} blanks ready to print on</div>
              </div>
              <ArrowUpRight size={14}/>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: CATALOG
// ═══════════════════════════════════════════════════════════════════
function Catalog({ onPick }) {
  const [cat, setCat]       = useState("All");
  const [search, setSearch] = useState("");
  // Live products from the admin-managed catalog_products table —
  // same data source as the public /catalog page. Loads once on mount,
  // then any admin add/delete reflects on the next reload.
  const [products, setProducts] = useState(null);  // null = loading
  const [loadErr, setLoadErr]   = useState(null);

  useEffect(() => {
    let alive = true;
    listCatalogProducts()
      .then(rows => { if (alive) setProducts(rows || []); })
      .catch(e => { if (alive) { setProducts([]); setLoadErr(e.message || String(e)); } });
    return () => { alive = false; };
  }, []);

  // Build the family chips from CATALOG_FAMILIES, but only show ones
  // that have ≥1 published product. "All" is always present.
  const familyCounts = useMemo(() => {
    const counts = {};
    for (const f of CATALOG_FAMILIES) counts[f.id] = 0;
    for (const p of (products || [])) {
      if (counts[p.family] != null) counts[p.family]++;
    }
    return counts;
  }, [products]);

  const filtered = useMemo(() => {
    let r = products || [];
    if (cat !== "All") r = r.filter(p => p.family === cat);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(p =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.fabric || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
      );
    }
    return r;
  }, [products, cat, search]);

  const loading = products === null;
  const familyLabel = (id) =>
    (CATALOG_FAMILIES.find(f => f.id === id) || {}).label || id;

  return (
    <div className="pt-dash">
      <PageHeader
        title="Catalog"
        sub={loading
          ? "Loading blanks…"
          : `${(products || []).length} blank${(products || []).length === 1 ? "" : "s"} · pick one to customise`}
      />

      <div className="pt-cat-toolbar">
        <div className="pt-search">
          <Search size={14}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tees, hoodies, fabrics…" />
        </div>
        <div className="pt-cat-pills">
          <button className={`pt-cat-pill ${cat === "All" ? "on" : ""}`} onClick={() => setCat("All")}>All</button>
          {CATALOG_FAMILIES.filter(f => (familyCounts[f.id] || 0) > 0).map(f => (
            <button key={f.id} className={`pt-cat-pill ${cat === f.id ? "on" : ""}`} onClick={() => setCat(f.id)}>{f.label}</button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="pt-empty pt-panel" style={{ padding: 32, textAlign: "center" }}>
          <Loader2 className="pt-spin" size={16}/> Loading catalog…
        </div>
      )}
      {loadErr && (
        <div className="pt-alert pt-alert-err" style={{ marginBottom: 16 }}>
          <AlertTriangle size={13}/> Couldn't load catalog: {loadErr}
        </div>
      )}

      {!loading && (
        <div className="pt-cat-grid">
          {filtered.map(p => {
            const colors = Array.isArray(p.colors) ? p.colors : [];
            const sizes  = Array.isArray(p.sizes) ? p.sizes : [];
            const price  = p.starting_price;
            // Coerce the admin product into the shape AddProducts expects
            // for catalogBlank: { id, name, sizes }. id = slug so it's stable.
            const blank = {
              id:    p.slug,
              name:  p.name,
              sizes,
              hero_image: p.hero_image,
              family: p.family,
              gsm: p.gsm,
            };
            return (
              <button key={p.slug} className="pt-cat-card" onClick={() => onPick(blank)}>
                <div className="pt-cat-img">
                  {p.hero_image ? (
                    <img src={p.hero_image} alt={p.name} className="pt-cat-photo" loading="lazy"/>
                  ) : (
                    <div className="pt-cat-photo" style={{ display: "grid", placeItems: "center", background: "var(--pt-bg-soft)", color: "var(--pt-text-dim)", fontSize: 11, letterSpacing: "0.12em" }}>
                      PHOTO COMING SOON
                    </div>
                  )}
                  <div className="pt-cat-chip">{familyLabel(p.family).toUpperCase()}</div>
                  {price != null && (
                    <div className="pt-cat-pricepill">
                      <span className="pt-cat-pricepill-l">FROM</span>
                      <span className="pt-cat-pricepill-v">₹{Number(price).toLocaleString("en-IN")}</span>
                    </div>
                  )}
                </div>
                <div className="pt-cat-body">
                  <div className="pt-cat-name">{p.name}</div>
                  <div className="pt-cat-fabric">{p.fabric || p.description || `${familyLabel(p.family)}${p.gsm ? ` · ${p.gsm} GSM` : ""}`}</div>
                  <div className="pt-cat-row">
                    <div className="pt-cat-price">
                      {price != null ? (
                        <>
                          <span className="pt-cat-from">STARTING PRICE</span>
                          <strong>₹{Number(price).toLocaleString("en-IN")}<small> / pc</small></strong>
                          {p.gsm && <span className="pt-cat-mrp">{p.gsm} GSM</span>}
                        </>
                      ) : (
                        <>
                          <span className="pt-cat-from">PRICING</span>
                          <strong style={{ fontSize: 14 }}>On request</strong>
                          {p.gsm && <span className="pt-cat-mrp">{p.gsm} GSM</span>}
                        </>
                      )}
                    </div>
                    {colors.length > 0 && (
                      <div className="pt-cat-swatches">
                        {colors.slice(0, 6).map((c, i) => (
                          <span key={i} className="pt-swatch" style={{ background: c.hex || "#000" }} title={c.name || ""} />
                        ))}
                        {colors.length > 6 && <span className="pt-swatch-more">+{colors.length - 6}</span>}
                      </div>
                    )}
                  </div>
                  <div className="pt-cat-specs">
                    {colors.length > 0 && <span><strong>{colors.length}</strong> colour{colors.length === 1 ? "" : "s"}</span>}
                    {sizes.length > 0 && <span><strong>{sizes.length}</strong> sizes</span>}
                    <span><strong>MOQ 1</strong></span>
                  </div>
                </div>
                <div className="pt-cat-cta">Use this blank <ChevronRight size={14}/></div>
              </button>
            );
          })}
          {filtered.length === 0 && !loadErr && (
            <div className="pt-empty pt-panel">
              {(products || []).length === 0
                ? "No blanks in the catalog yet — the Aviva team is adding products. Check back soon."
                : "No products match your filters."}
            </div>
          )}
        </div>
      )}

      {/* Order terms callout — mirrors the catalog PDF "Order terms" page */}
      <section className="pt-panel pt-cat-terms">
        <div className="pt-cat-terms-head">
          <span className="pt-cat-terms-tag">REFERENCE · ORDER TERMS</span>
          <span className="pt-cat-terms-sub">From the Aviva brand-partner catalog · Vol 01 · 2026</span>
        </div>
        <div className="pt-cat-terms-grid">
          {CATALOG_TERMS.map((t, i) => (
            <div key={t.k} className="pt-cat-terms-row">
              <div className="pt-cat-terms-no">0{i + 1}</div>
              <div>
                <div className="pt-cat-terms-k">{t.k}</div>
                <div className="pt-cat-terms-v">{t.v}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ADD PRODUCTS — simple table flow (current default)
//
// Five columns per row: Product name · Price · Design link · Design
// sizes · Product link (Shopify). Clients punch in one or more rows
// and hit Save — each row becomes an item in My Products. Status is
// "live" if a Shopify link is provided, "draft" otherwise.
//
// The richer mockup-based ProductDetail editor stays below in the
// file for later — wired off the main flow until we bring images back.
// ═══════════════════════════════════════════════════════════════════
function AddProducts({ catalogBlank, onClose, onSaveAll }) {
  // Each product card carries:
  //   id (local)
  //   blankId, name, sellingPrice, sizes (Set), shopifyLink
  //   designs: [{ id, file (File), preview (objectURL), widthIn, heightIn }]
  const newRow = () => ({
    id: `row-${Math.random().toString(36).slice(2, 8)}`,
    name: catalogBlank?.name || "",
    blankId: catalogBlank?.id || null,
    sellingPrice: "",
    sizes: new Set(SIZES),
    shopifyLink: "",
    designs: [],
  });
  const [rows, setRows] = useState([newRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null); // { current, total, label }

  const updateRow = (idx, patch) =>
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, newRow()]);
  const removeRow = (idx) => setRows(rs => rs.length > 1 ? rs.filter((_, i) => i !== idx) : rs);
  const toggleSize = (idx, s) => {
    const next = new Set(rows[idx].sizes);
    if (next.has(s)) next.delete(s); else next.add(s);
    updateRow(idx, { sizes: next });
  };

  // ── Design ops (per-row) ─────────────────────────────────────────
  const addDesignToRow = (rowIdx, file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      setError(`"${file.name}" isn't a PNG or JPEG.`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`"${file.name}" is over 10 MB. Compress it and try again.`);
      return;
    }
    setError(null);
    const next = {
      id: `d-${Math.random().toString(36).slice(2, 8)}`,
      file,
      preview: URL.createObjectURL(file),
      widthIn: "",
      heightIn: "",
    };
    setRows(rs => rs.map((r, i) => i === rowIdx
      ? { ...r, designs: [...r.designs, next] }
      : r
    ));
  };
  const updateDesign = (rowIdx, designId, patch) => {
    setRows(rs => rs.map((r, i) => i === rowIdx
      ? { ...r, designs: r.designs.map(d => d.id === designId ? { ...d, ...patch } : d) }
      : r
    ));
  };
  const removeDesign = (rowIdx, designId) => {
    setRows(rs => rs.map((r, i) => {
      if (i !== rowIdx) return r;
      const dropped = r.designs.find(d => d.id === designId);
      if (dropped?.preview) URL.revokeObjectURL(dropped.preview);
      return { ...r, designs: r.designs.filter(d => d.id !== designId) };
    }));
  };

  // ── Validation ────────────────────────────────────────────────────
  const rowIsValid = (r) =>
    r.name.trim() &&
    Number(r.sellingPrice) > 0 &&
    r.sizes.size > 0 &&
    r.designs.length > 0 &&
    r.designs.every(d => d.file && Number(d.widthIn) > 0 && Number(d.heightIn) > 0);

  const validRows = rows.filter(rowIsValid);
  const canSave   = validRows.length > 0 && !busy;

  // ── Save: upload designs to Storage, insert client_products rows ─
  const save = async () => {
    if (!canSave) return;
    setBusy(true); setError(null);
    try {
      // Count total designs across all valid rows for the progress bar.
      const totalDesigns = validRows.reduce((s, r) => s + r.designs.length, 0);
      let uploaded = 0;
      setProgress({ current: 0, total: totalDesigns, label: "Uploading designs…" });

      // For each row, upload its designs in sequence (parallel uploads
      // are nice but Storage rate-limits — sequential is safer).
      const productsToSave = [];
      for (const r of validRows) {
        const designs = [];
        for (const d of r.designs) {
          const uploadedFile = await uploadDesignFile(d.file);
          designs.push({
            url: uploadedFile.url,
            name: uploadedFile.name,
            contentType: uploadedFile.contentType,
            sizeBytes: uploadedFile.sizeBytes,
            widthIn: Number(d.widthIn),
            heightIn: Number(d.heightIn),
          });
          uploaded += 1;
          setProgress({ current: uploaded, total: totalDesigns, label: "Uploading designs…" });
        }
        productsToSave.push({
          name: r.name.trim(),
          blankId: r.blankId,
          sellingPrice: Number(r.sellingPrice),
          sizes: Array.from(r.sizes),
          shopifyLink: r.shopifyLink.trim() || null,
          designs,
        });
      }

      setProgress({ current: totalDesigns, total: totalDesigns, label: "Saving to your portal…" });
      const inserted = await saveClientProducts(productsToSave);

      // Hand the inserted rows back to the parent so MyProducts can refresh
      // without a round-trip.
      onSaveAll(inserted);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="pt-modal" onClick={busy ? undefined : onClose}>
      <div className="pt-modal-card pt-modal-card-xl pt-ap-modal" onClick={e => e.stopPropagation()}>
        <button className="pt-modal-close" onClick={onClose} aria-label="Close" disabled={busy}><X size={18}/></button>

        <div className="pt-ap-head">
          <div className="pt-ap-eyebrow">ADD PRODUCTS</div>
          <h2 className="pt-ap-h">{catalogBlank ? `Add products · ${catalogBlank.name}` : "Add products"}</h2>
          <p className="pt-ap-sub">
            Fill in each product, then upload its design files. PNG or JPEG, up to 10 MB each. Tell us the exact <strong>width × height</strong> in inches you want the design printed at — we use that as the truth for production. Add as many designs per product as you want.
          </p>
        </div>

        <div className="pt-ap-cards">
          {rows.map((r, idx) => {
            const blank = r.blankId ? CATALOG_MOCK.find(p => p.id === r.blankId) : null;
            const valid = rowIsValid(r);
            return (
              <div key={r.id} className={`pt-ap-card ${valid ? "ok" : ""}`}>
                <div className="pt-ap-card-head">
                  <span className="pt-ap-card-no">PRODUCT {idx + 1}</span>
                  {valid && <span className="pt-ap-card-ok"><CheckCircle2 size={11}/> Ready</span>}
                  <button
                    type="button"
                    className="pt-ap-card-x"
                    onClick={() => removeRow(idx)}
                    disabled={rows.length === 1 || busy}
                    title="Remove this product"
                  ><X size={14}/></button>
                </div>

                <div className="pt-ap-card-grid">
                  <label className="pt-ap-cell">
                    <span className="pt-ap-cell-l">Product category</span>
                    <div className="pt-ap-select-cell">
                      <Package size={11}/>
                      <select
                        className="pt-ap-input pt-ap-select"
                        value={r.blankId || ""}
                        onChange={e => updateRow(idx, { blankId: e.target.value || null })}
                        disabled={busy}
                      >
                        <option value="">Select category…</option>
                        {CATALOG_MOCK.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <label className="pt-ap-cell pt-ap-cell-wide">
                    <span className="pt-ap-cell-l">Product name</span>
                    <input
                      className="pt-ap-input"
                      value={r.name}
                      onChange={e => updateRow(idx, { name: e.target.value })}
                      placeholder="e.g. Hashway boxy tee black"
                      disabled={busy}
                    />
                  </label>

                  <label className="pt-ap-cell">
                    <span className="pt-ap-cell-l">Selling price</span>
                    <div className="pt-ap-price-cell">
                      <IndianRupee size={11}/>
                      <input
                        className="pt-ap-input pt-ap-input-num"
                        type="number" min="0" inputMode="numeric"
                        value={r.sellingPrice}
                        onChange={e => updateRow(idx, { sellingPrice: e.target.value })}
                        placeholder="999"
                        disabled={busy}
                      />
                    </div>
                    {blank && <div className="pt-ap-price-hint">Aviva cost ₹{blank.allInPrice}</div>}
                  </label>

                  <div className="pt-ap-cell pt-ap-cell-wide">
                    <span className="pt-ap-cell-l">Design sizes (XS – XXL)</span>
                    <div className="pt-ap-sizes">
                      {SIZES.map(s => (
                        <button
                          key={s}
                          type="button"
                          className={`pt-ap-size ${r.sizes.has(s) ? "on" : ""}`}
                          onClick={() => toggleSize(idx, s)}
                          disabled={busy}
                        >{s}</button>
                      ))}
                    </div>
                  </div>

                  <label className="pt-ap-cell pt-ap-cell-full">
                    <span className="pt-ap-cell-l">Product link (Shopify) — optional, but required to go live</span>
                    <div className="pt-ap-link-cell">
                      <Store size={11}/>
                      <input
                        className="pt-ap-input"
                        type="url"
                        value={r.shopifyLink}
                        onChange={e => updateRow(idx, { shopifyLink: e.target.value })}
                        placeholder="yourstore.myshopify.com/products/…"
                        disabled={busy}
                      />
                    </div>
                  </label>
                </div>

                {/* Designs section */}
                <div className="pt-ap-designs">
                  <div className="pt-ap-designs-h">
                    <span className="pt-ap-cell-l">DESIGNS · {r.designs.length} uploaded</span>
                    <span className="pt-ap-designs-hint">PNG or JPEG · 10 MB max · enter print width &amp; height in inches</span>
                  </div>

                  {r.designs.length > 0 && (
                    <div className="pt-ap-design-list">
                      {r.designs.map(d => (
                        <div key={d.id} className="pt-ap-design-row">
                          <div className="pt-ap-design-thumb">
                            <img src={d.preview} alt={d.file?.name}/>
                          </div>
                          <div className="pt-ap-design-meta">
                            <div className="pt-ap-design-name">{d.file?.name}</div>
                            <div className="pt-ap-design-size">{(d.file?.size / 1024).toFixed(0)} KB · {d.file?.type}</div>
                          </div>
                          <label className="pt-ap-dim">
                            <span>W (in)</span>
                            <input
                              type="number" min="0.1" step="0.1" inputMode="decimal"
                              value={d.widthIn}
                              onChange={e => updateDesign(idx, d.id, { widthIn: e.target.value })}
                              placeholder="12"
                              disabled={busy}
                            />
                          </label>
                          <span className="pt-ap-dim-x">×</span>
                          <label className="pt-ap-dim">
                            <span>H (in)</span>
                            <input
                              type="number" min="0.1" step="0.1" inputMode="decimal"
                              value={d.heightIn}
                              onChange={e => updateDesign(idx, d.id, { heightIn: e.target.value })}
                              placeholder="14"
                              disabled={busy}
                            />
                          </label>
                          <button
                            type="button"
                            className="pt-ap-remove"
                            onClick={() => removeDesign(idx, d.id)}
                            disabled={busy}
                            title="Remove this design"
                          ><Trash2 size={13}/></button>
                        </div>
                      ))}
                    </div>
                  )}

                  <AddDesignButton
                    rowId={r.id}
                    hasDesigns={r.designs.length > 0}
                    onPick={(file) => addDesignToRow(idx, file)}
                    disabled={busy}
                  />
                </div>
              </div>
            );
          })}

          <button type="button" className="pt-ap-addrow" onClick={addRow} disabled={busy}>
            <Plus size={13}/> Add another product
          </button>
        </div>

        <div className="pt-ap-foot">
          <div className="pt-ap-foot-hint">
            {error
              ? <><AlertTriangle size={12} style={{ color: "var(--pt-err)" }}/> <span style={{ color: "var(--pt-err)" }}>{error}</span></>
              : progress
                ? <><Loader2 size={12} className="pt-spin"/> {progress.label} ({progress.current}/{progress.total})</>
                : validRows.length > 0
                  ? <><CheckCircle2 size={12}/> {validRows.length} of {rows.length} product{rows.length === 1 ? "" : "s"} ready</>
                  : <><AlertTriangle size={12}/> Each product needs a name, price, sizes, and at least one design with W × H.</>}
          </div>
          <div className="pt-ap-foot-actions">
            <button className="pt-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className="pt-btn-primary pt-ap-save"
              onClick={save}
              disabled={!canSave}
            >
              {busy
                ? <><Loader2 size={14} className="pt-spin"/> Saving…</>
                : <>Save {validRows.length} product{validRows.length === 1 ? "" : "s"} <ArrowRight size={14}/></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// "Add design" pill — uses a hidden file input so the styling stays
// in our control. Shows different copy on first design vs subsequent.
function AddDesignButton({ rowId, hasDesigns, onPick, disabled }) {
  const ref = useRef(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";   // allow re-uploading the same filename
        }}
      />
      <button
        type="button"
        className="pt-ap-add-design"
        onClick={() => ref.current?.click()}
        disabled={disabled}
        data-row={rowId}
      >
        <Plus size={13}/>
        {hasDesigns ? "Add design" : "Upload first design"}
      </button>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: PRODUCT DETAIL (modal) — advanced mockup editor, paused
// ═══════════════════════════════════════════════════════════════════
function ProductDetail({ productId, stores, onClose, onSave }) {
  const product = CATALOG_MOCK.find(p => p.id === productId);
  const viewsConfig = VIEWS_BY_SHAPE[product?.shape] || VIEWS_BY_SHAPE["tee-photo"];
  const viewIds = Object.keys(viewsConfig);

  const [view, setView]               = useState(viewIds[0]);
  const [colorId, setColorId]         = useState(product?.colors?.[0] || "jet-black");
  const [chosenSizes, setChosenSizes] = useState(new Set(product?.sizes || []));
  const [retailPrice, setRetailPrice] = useState(0);
  const [productTitle, setProductTitle] = useState(product?.name || "");
  const [productDesc,  setProductDesc]  = useState(product?.blurb || "");
  const [designs, setDesigns]   = useState({});
  const [activeZoneId, setActiveZoneId] = useState(viewsConfig[viewIds[0]].zones[0]?.id || null);
  const [cropping, setCropping] = useState(null);
  const [blankProduct, setBlankProduct] = useState(false);
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [publishOpen, setPublishOpen]     = useState(false);
  const fileRef = useRef(null);

  if (!product) return null;

  const currentView   = viewsConfig[view];
  const zonesInView   = currentView?.zones || [];
  const activeZone    = zonesInView.find(z => z.id === activeZoneId);
  const activeDesign  = !blankProduct && activeZoneId ? designs[activeZoneId] : null;
  const designedCount = blankProduct ? 0 : Object.keys(designs).length;
  const printCost     = designedCount * product.printAddon;
  const totalCost     = product.basePrice + printCost;
  const margin        = Math.max(0, retailPrice - totalCost);
  const marginPct     = totalCost > 0 ? (margin / totalCost * 100).toFixed(0) : 0;
  const hasStores     = stores.length > 0;
  const canSubmit     = chosenSizes.size > 0 && (blankProduct || designedCount > 0);

  // Helpers to compute live size + cost per slot card
  const allZonesById = Object.values(viewsConfig).flatMap(v => v.zones)
    .reduce((m, z) => { m[z.id] = z; return m; }, {});
  const printSummary = (zoneId) => {
    const z = allZonesById[zoneId];
    if (!z) return { type: "-", w: 0, h: 0, cost: 0 };
    const d = !blankProduct && designs[zoneId];
    if (!d) return { type: "-", w: 0, h: 0, cost: 0 };
    const scale = d.scale ?? 0.9;
    return {
      type: "DTF",
      w: (z.maxIn?.w ?? 12) * scale,
      h: (z.maxIn?.h ?? 14) * scale,
      cost: product.printAddon,
    };
  };

  // Handlers
  const switchView = (v) => {
    setView(v);
    setActiveZoneId(viewsConfig[v].zones[0]?.id || null);
  };
  const toggleSize = (s) => setChosenSizes(prev => {
    const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n;
  });
  const selectZoneAcrossViews = (zoneId) => {
    const ownerView = Object.entries(viewsConfig)
      .find(([_, vd]) => vd.zones.some(z => z.id === zoneId))?.[0];
    if (ownerView && ownerView !== view) setView(ownerView);
    setActiveZoneId(zoneId);
  };
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f || !activeZoneId) return;
    const reader = new FileReader();
    reader.onload = () => setDesigns(prev => ({
      ...prev,
      [activeZoneId]: { url: reader.result, name: f.name, scale: 0.9, offsetX: 0, offsetY: 0, rotation: 0, flipH: false },
    }));
    reader.readAsDataURL(f);
    e.target.value = "";
  };
  const updateDesign = (zoneId, patch) =>
    setDesigns(prev => prev[zoneId] ? { ...prev, [zoneId]: { ...prev[zoneId], ...patch } } : prev);
  const removeDesign = (zoneId) =>
    setDesigns(prev => { const c = { ...prev }; delete c[zoneId]; return c; });
  const onDragDesign = (zoneId, dx, dy) => setDesigns(prev => {
    if (!prev[zoneId]) return prev;
    const z = allZonesById[zoneId];
    const maxX = z ? z.w * 0.55 : 30;
    const maxY = z ? z.h * 0.55 : 30;
    return {
      ...prev,
      [zoneId]: {
        ...prev[zoneId],
        offsetX: Math.max(-maxX, Math.min(maxX, (prev[zoneId].offsetX || 0) + dx)),
        offsetY: Math.max(-maxY, Math.min(maxY, (prev[zoneId].offsetY || 0) + dy)),
      },
    };
  });
  const save = (status, storeId = null) => onSave({
    localId: `${product.id}-${Date.now()}`,
    productId: product.id,
    title: productTitle, description: productDesc,
    colorId, sizes: Array.from(chosenSizes), retailPrice,
    designs: blankProduct ? {} : designs,
    blankProduct,
    status, storeId,
    publishedAt: status === "published" ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
  });
  const handleMakeLive = () => {
    if (!hasStores || !canSubmit) return;
    if (stores.length === 1) { save("published", stores[0].id); return; }
    setPublishOpen(true);
  };

  return (
    <div className="pt-modal" onClick={onClose}>
      <div className="pt-modal-card pt-modal-card-xl" onClick={e => e.stopPropagation()}>
        <button className="pt-modal-close" onClick={onClose} aria-label="Close"><X size={18}/></button>

        <div className="pt-pd2-header">
          <div className="pt-pd2-eyebrow">PRODUCT {product.productNo} · {product.category.toUpperCase()}</div>
          <h2 className="pt-pd2-h">{product.name}</h2>
        </div>

        {product.warning && (
          <div className="pt-pd-warning pt-pd2-warning"><AlertTriangle size={12}/> {product.warning}</div>
        )}

        <div className="pt-pd2-grid">
          {/* ─── LEFT · CREATE DESIGN FORM ─── */}
          <div className="pt-pd2-form">
            <div className="pt-pd2-section-title">CREATE DESIGN</div>

            <label className="pt-pd2-toggle">
              <span>Blank Product</span>
              <input type="checkbox" checked={blankProduct} onChange={e => setBlankProduct(e.target.checked)}/>
              <span className="pt-pd2-toggle-track"><span className="pt-pd2-toggle-thumb"/></span>
            </label>

            {!blankProduct && (
              <>
                <div className="pt-pd2-block">
                  <div className="pt-pd2-block-h">PRINT METHOD</div>
                  <div className="pt-pd2-pm-row">
                    <button className="pt-pd2-pm-btn" disabled title="Coming soon">DTG</button>
                    <button className="pt-pd2-pm-btn on">DTF</button>
                  </div>
                </div>

                <div className="pt-pd2-block">
                  <div className="pt-pd2-block-h">UPLOAD DESIGN IMAGE</div>
                  <div className="pt-pd2-zone-pill">
                    For <strong>{currentView.label}</strong> · {activeZone?.label || "—"}
                  </div>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onFile} hidden/>
                  {!activeDesign ? (
                    <button className="pt-pd2-add-image" onClick={() => fileRef.current?.click()}>
                      <Plus size={14}/> Add Image
                    </button>
                  ) : (
                    <div className="pt-pd2-uploaded">
                      <div className="pt-pd2-uploaded-thumb" style={{ backgroundImage: `url(${activeDesign.url})` }}/>
                      <div className="pt-pd2-uploaded-meta">
                        <div className="pt-pd2-uploaded-name">{activeDesign.name}</div>
                        <div className="pt-pd2-uploaded-actions">
                          <button onClick={() => fileRef.current?.click()}><Upload size={11}/> Replace</button>
                          <button onClick={() => setCropping({ zoneId: activeZoneId })}><Crop size={11}/> Crop</button>
                          <button onClick={() => removeDesign(activeZoneId)}><Trash2 size={11}/> Remove</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="pt-pd2-block">
              <div className="pt-pd2-block-h">PRODUCT NAME</div>
              <input className="pt-pd2-input" value={productTitle} onChange={e => setProductTitle(e.target.value)} placeholder="Enter product name"/>
            </div>

            <div className="pt-pd2-block">
              <div className="pt-pd2-block-h">DESCRIPTION</div>
              <textarea className="pt-pd2-input" rows={3} value={productDesc} onChange={e => setProductDesc(e.target.value)} placeholder="Enter description"/>
            </div>

            <div className="pt-pd2-block">
              <div className="pt-pd2-block-h">COLOR · {COLORS[colorId]?.name}</div>
              <div className="pt-pd-swatches">
                {product.colors.map(cId => (
                  <button key={cId} className={`pt-pd-swatch ${cId === colorId ? "on" : ""}`} style={{ background: COLORS[cId]?.hex }} onClick={() => setColorId(cId)} title={COLORS[cId]?.name}>
                    {cId === colorId && <Check size={12} color={COLORS[cId]?.ink}/>}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-pd2-block">
              <div className="pt-pd2-block-h">SIZES · {chosenSizes.size}/{product.sizes.length} selected</div>
              <div className="pt-pd-sizes">
                {product.sizes.map(s => (
                  <button key={s} className={`pt-pd-size ${chosenSizes.has(s) ? "on" : ""}`} onClick={() => toggleSize(s)}>{s}</button>
                ))}
              </div>
            </div>

            <button className="pt-pd2-sizechart-btn" onClick={() => setSizeChartOpen(true)}>
              <Ruler size={13}/> <span>Size Chart</span> <ChevronRight size={13}/>
            </button>

            <div className="pt-pd2-footer">
              <span>{product.weight}</span><span className="dot">·</span>
              <span>{product.printMethod}</span><span className="dot">·</span>
              <span>MOQ {product.moq}</span>
            </div>
          </div>

          {/* ─── CENTER · MOCKUP STAGE ─── */}
          <div className="pt-pd2-stage">
            <div className="pt-pd2-stage-top">
              {viewIds.length > 1 ? (
                <select className="pt-pd2-view-select" value={view} onChange={e => switchView(e.target.value)}>
                  {viewIds.map(v => (<option key={v} value={v}>{viewsConfig[v].label}</option>))}
                </select>
              ) : (
                <div className="pt-pd2-view-static">{viewsConfig[viewIds[0]].label}</div>
              )}
            </div>

            {!blankProduct && (
              <div className="pt-pd2-stage-actions">
                <button
                  className="pt-pd2-stage-btn pt-pd2-stage-btn-align"
                  onClick={() => activeZoneId && activeDesign && updateDesign(activeZoneId, { offsetX: 0, offsetY: 0, rotation: 0, flipH: false })}
                  disabled={!activeDesign}
                  title="Re-center & reset"
                ><Move size={14}/></button>
                <button
                  className="pt-pd2-stage-btn pt-pd2-stage-btn-trash"
                  onClick={() => activeZoneId && removeDesign(activeZoneId)}
                  disabled={!activeDesign}
                  title="Remove design"
                ><Trash2 size={14}/></button>
              </div>
            )}

            <div className="pt-pd2-mockup">
              <ProductMockup
                photo={product.photo}
                thumbPhoto={product.photoThumb}
                view={view}
                designs={blankProduct ? {} : designs}
                zones={zonesInView}
                activeZoneId={blankProduct ? null : activeZoneId}
                onZoneClick={selectZoneAcrossViews}
                onDragDesign={blankProduct ? null : onDragDesign}
                showZones={!blankProduct}
              />
            </div>

            {!blankProduct && activeDesign && (
              <div className="pt-pd2-stage-scale">
                <div className="pt-pd2-stage-scale-row">
                  <span className="pt-pd2-stage-scale-l">Size</span>
                  <input type="range" min={0.3} max={1.2} step={0.01}
                    value={activeDesign.scale ?? 0.9}
                    onChange={e => updateDesign(activeZoneId, { scale: Number(e.target.value) })}
                    className="pt-pd-slider"/>
                  <span className="pt-pd-mini-val">{Math.round((activeDesign.scale || 0.9) * 100)}%</span>
                </div>
                <div className="pt-pd2-stage-scale-row">
                  <button className="pt-pd-mini-btn" onClick={() => updateDesign(activeZoneId, { rotation: (activeDesign.rotation || 0) - 15 })} title="Rotate left"><RotateCcw size={11}/></button>
                  <button className="pt-pd-mini-btn" onClick={() => updateDesign(activeZoneId, { rotation: (activeDesign.rotation || 0) + 15 })} title="Rotate right"><RotateCw size={11}/></button>
                  <button className={`pt-pd-mini-btn ${activeDesign.flipH ? "on" : ""}`} onClick={() => updateDesign(activeZoneId, { flipH: !activeDesign.flipH })} title="Flip"><FlipHorizontal size={11}/></button>
                  <button className="pt-pd-mini-btn" onClick={() => setCropping({ zoneId: activeZoneId })} title="Crop"><Crop size={11}/></button>
                </div>
              </div>
            )}
          </div>

          {/* ─── RIGHT · PRINT DETAILS + CTA ─── */}
          <div className="pt-pd2-summary">
            <div className="pt-pd2-summary-title">Print Details</div>

            <div className="pt-pd2-zone-grid">
              {PRINT_DETAILS_SLOTS.map(slot => {
                const s = printSummary(slot.id);
                const active = activeZoneId === slot.id;
                const filled = s.type === "DTF";
                return (
                  <button
                    key={slot.id}
                    className={`pt-pd2-zone-card ${active ? "on" : ""} ${filled ? "has-design" : ""}`}
                    onClick={() => !blankProduct && selectZoneAcrossViews(slot.id)}
                    disabled={blankProduct}
                  >
                    <div className="pt-pd2-zone-label">{slot.label}</div>
                    <div className="pt-pd2-zone-row"><span>Type:</span><strong>{s.type}</strong></div>
                    <div className="pt-pd2-zone-row"><span>Size:</span><strong>{s.w.toFixed(2)}×{s.h.toFixed(2)}"</strong></div>
                    <div className="pt-pd2-zone-row"><span>Cost:</span><strong>₹{s.cost}</strong></div>
                  </button>
                );
              })}
            </div>

            <div className="pt-pd2-maxprint">
              The maximum print size is <strong>16×20 inches</strong>.
            </div>

            <div className="pt-pd2-totals">
              <div className="pt-pd2-totals-row">
                <span>Plain garment</span>
                <strong>₹{product.basePrice}</strong>
              </div>
              {!blankProduct && (
                <div className="pt-pd2-totals-row">
                  <span>DTF print {designedCount > 0 ? `× ${designedCount}` : ""}</span>
                  <strong>+₹{printCost}</strong>
                </div>
              )}
              <div className="pt-pd2-totals-row pt-pd2-totals-total">
                <span>Total Cost:</span>
                <strong>₹{totalCost} <small>+ tax + shipping</small></strong>
              </div>
            </div>

            <div className="pt-pd2-selling">
              <label>Selling Price</label>
              <div className="pt-price-input">
                <IndianRupee size={12}/>
                <input type="number" value={retailPrice || ""} onChange={e => setRetailPrice(Number(e.target.value) || 0)} placeholder="Enter selling price"/>
              </div>
              {retailPrice > totalCost && (
                <div className="pt-pd2-margin-hint">Your margin: <strong>₹{margin} · {marginPct}%</strong></div>
              )}
            </div>

            <button
              className="pt-pd2-cta pt-pd2-cta-live"
              onClick={handleMakeLive}
              disabled={!canSubmit || !hasStores}
              title={!hasStores ? "Connect a Shopify store first" : (!canSubmit ? "Pick sizes" + (blankProduct ? "" : " + add a design") + " first" : "")}
            >
              <Store size={14}/> <span>Make It Live</span> <ArrowUpRight size={13}/>
            </button>
            <button
              className="pt-pd2-cta pt-pd2-cta-draft"
              onClick={() => save("draft")}
              disabled={!canSubmit}
            >
              <ShoppingBag size={14}/> <span>Save to Aviva Pressroom</span>
            </button>
            {!hasStores && (
              <div className="pt-pd2-cta-note">
                <AlertTriangle size={11}/> Connect a Shopify store in the Stores tab to make products live.
              </div>
            )}
            {!canSubmit && (
              <div className="pt-pd2-cta-note">
                <AlertTriangle size={11}/>
                {chosenSizes.size === 0
                  ? "Pick at least one size to continue."
                  : "Upload artwork to at least one print zone, or toggle Blank Product."}
              </div>
            )}
          </div>
        </div>

        {/* Multi-store publish picker */}
        {publishOpen && (
          <div className="pt-publish-overlay" onClick={() => setPublishOpen(false)}>
            <div className="pt-publish-sheet" onClick={e => e.stopPropagation()}>
              <div className="pt-publish-sheet-head">
                <div>
                  <div className="pt-publish-sheet-eyebrow">PUBLISH TO</div>
                  <div className="pt-publish-sheet-title">Which store?</div>
                </div>
                <button className="pt-btn-ghost pt-btn-sm" onClick={() => setPublishOpen(false)}>Cancel</button>
              </div>
              <div className="pt-publish-sheet-list">
                {stores.map(s => (
                  <button key={s.id} className="pt-publish-sheet-row" onClick={() => { setPublishOpen(false); save("published", s.id); }}>
                    <Store size={14}/>
                    <div>
                      <div className="pt-publish-sheet-name">{s.name}</div>
                      <div className="pt-publish-sheet-domain">{s.domain}</div>
                    </div>
                    <ArrowRight size={14}/>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Size chart popover */}
        {sizeChartOpen && (
          <div className="pt-publish-overlay" onClick={() => setSizeChartOpen(false)}>
            <div className="pt-publish-sheet pt-sizechart" onClick={e => e.stopPropagation()}>
              <div className="pt-publish-sheet-head">
                <div>
                  <div className="pt-publish-sheet-eyebrow">REFERENCE</div>
                  <div className="pt-publish-sheet-title">Size Chart · {product.name}</div>
                </div>
                <button className="pt-btn-ghost pt-btn-sm" onClick={() => setSizeChartOpen(false)}>Close</button>
              </div>
              <p className="pt-sizechart-note">Body-flat measurements in inches. Manufacturing tolerance ± 0.5".</p>
              <table className="pt-sizechart-table">
                <thead><tr><th>Size</th><th>Chest</th><th>Length</th><th>Shoulder</th></tr></thead>
                <tbody>
                  {SIZE_GRID.map(r => (
                    <tr key={r.size}>
                      <td><strong>{r.size}</strong></td>
                      <td>{r.chest}"</td>
                      <td>{r.length}"</td>
                      <td>{r.shoulder}"</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Crop modal */}
      {cropping && designs[cropping.zoneId] && (
        <CropModal
          imageUrl={designs[cropping.zoneId].url}
          imageName={designs[cropping.zoneId].name}
          onCancel={() => setCropping(null)}
          onApply={(newUrl) => { updateDesign(cropping.zoneId, { url: newUrl }); setCropping(null); }}
        />
      )}
    </div>
  );
}

// ─── Crop modal — pick a sub-rectangle of the uploaded image ──────────
// Two-corner draggable selection. The cropped pixels get drawn onto a
// canvas and exported as a fresh dataURL that replaces the original
// design's url. Aspect-free for max flexibility.
function CropModal({ imageUrl, imageName, onCancel, onApply }) {
  const [crop, setCrop] = useState({ x: 0.08, y: 0.08, w: 0.84, h: 0.84 }); // normalized 0–1
  const [drag, setDrag] = useState(null);
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const dx = (e.clientX - drag.startX) / drag.rect.width;
      const dy = (e.clientY - drag.startY) / drag.rect.height;
      const c0 = drag.startCrop;
      let next = { ...c0 };
      if (drag.handle === "tl") {
        next.x = Math.max(0, Math.min(c0.x + c0.w - 0.05, c0.x + dx));
        next.y = Math.max(0, Math.min(c0.y + c0.h - 0.05, c0.y + dy));
        next.w = c0.x + c0.w - next.x;
        next.h = c0.y + c0.h - next.y;
      } else if (drag.handle === "br") {
        next.w = Math.max(0.05, Math.min(1 - c0.x, c0.w + dx));
        next.h = Math.max(0.05, Math.min(1 - c0.y, c0.h + dy));
      } else if (drag.handle === "move") {
        next.x = Math.max(0, Math.min(1 - c0.w, c0.x + dx));
        next.y = Math.max(0, Math.min(1 - c0.h, c0.y + dy));
      }
      setCrop(next);
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag]);

  const onPointerDown = (handle, e) => {
    e.preventDefault(); e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    setDrag({ handle, startX: e.clientX, startY: e.clientY, startCrop: crop, rect });
  };

  const apply = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    const sx = crop.x * img.naturalWidth;
    const sy = crop.y * img.naturalHeight;
    const sw = crop.w * img.naturalWidth;
    const sh = crop.h * img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw); canvas.height = Math.round(sh);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    onApply(canvas.toDataURL("image/png"));
  };

  return (
    <div className="pt-modal pt-modal-stacked" onClick={onCancel}>
      <div className="pt-modal-card pt-modal-card-sm" onClick={e => e.stopPropagation()}>
        <button className="pt-modal-close" onClick={onCancel} aria-label="Close"><X size={18}/></button>
        <div style={{ padding: 28, paddingBottom: 0 }}>
          <h2 className="pt-pd-h">Crop image</h2>
          <p className="pt-pd-blurb">{imageName} · drag corner handles or the box itself</p>
        </div>
        <div ref={containerRef} className="pt-crop-canvas">
          <img ref={imgRef} src={imageUrl} alt={imageName}/>
          <div
            onPointerDown={(e) => onPointerDown("move", e)}
            className="pt-crop-box"
            style={{
              left: `${crop.x * 100}%`, top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`, height: `${crop.h * 100}%`,
            }}
          >
            <div onPointerDown={(e) => onPointerDown("tl", e)} className="pt-crop-handle pt-crop-handle-tl"/>
            <div onPointerDown={(e) => onPointerDown("br", e)} className="pt-crop-handle pt-crop-handle-br"/>
          </div>
        </div>
        <div className="pt-pd-actions" style={{ padding: "0 28px 28px" }}>
          <button className="pt-btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="pt-btn-primary" onClick={apply}><Check size={13}/> Apply crop</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: MY PRODUCTS
// ═══════════════════════════════════════════════════════════════════
function MyProducts({ items, stores, onDelete, onPublish, goto, onAdd }) {
  const [filter, setFilter] = useState("all");
  const statusOf = (i) => i.status === "live" || i.status === "published" ? "live" : "draft";
  const filtered = items.filter(i => filter === "all" || statusOf(i) === filter);

  if (items.length === 0) {
    return (
      <div className="pt-dash">
        <PageHeader title="My Products" sub="Products you've registered for Aviva fulfilment" />
        <div className="pt-empty-state pt-panel">
          <ShoppingBag size={32}/>
          <h3>No products yet.</h3>
          <p>Add a product — pick a category, set the selling price, upload your design files with width &amp; height in inches, drop the Shopify URL.</p>
          <button className="pt-btn-primary" onClick={onAdd}><Plus size={14}/> Add Products</button>
        </div>
      </div>
    );
  }

  const liveCount  = items.filter(i => statusOf(i) === "live").length;
  const draftCount = items.filter(i => statusOf(i) === "draft").length;

  return (
    <div className="pt-dash">
      <PageHeader title="My Products" sub={`${items.length} registered · ${liveCount} live · ${draftCount} draft`} />

      <div className="pt-cat-toolbar">
        <div className="pt-cat-pills">
          <button className={`pt-cat-pill ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All ({items.length})</button>
          <button className={`pt-cat-pill ${filter === "draft" ? "on" : ""}`} onClick={() => setFilter("draft")}>Drafts ({draftCount})</button>
          <button className={`pt-cat-pill ${filter === "live"  ? "on" : ""}`} onClick={() => setFilter("live")}>Live ({liveCount})</button>
        </div>
        <button className="pt-btn-primary pt-btn-sm" onClick={onAdd}><Plus size={13}/> Add Products</button>
      </div>

      <div className="pt-mp-cards">
        {filtered.map(item => {
          const isLive = statusOf(item) === "live";
          const price  = item.selling_price ?? item.price ?? item.retailPrice ?? 0;
          const sizes  = Array.isArray(item.sizes) ? item.sizes : [];
          const name   = item.name || item.productName || item.title || "Untitled";
          const shopifyLink = item.shopify_link || item.shopifyLink;
          const designs = Array.isArray(item.designs) ? item.designs : [];
          const blank = (item.blank_id || item.blankId) ? CATALOG_MOCK.find(p => p.id === (item.blank_id || item.blankId)) : null;
          return (
            <div key={item.id || item.localId} className="pt-mp-card-v2">
              <div className="pt-mp-card-head">
                <div className="pt-mp-card-title">
                  <strong>{name}</strong>
                  {blank && <span className="pt-mp-card-blank">on {blank.name}</span>}
                </div>
                <span className={`pt-mp-status-chip pt-mp-status-chip-${isLive ? "live" : "draft"}`}>
                  {isLive ? <CheckCircle2 size={10}/> : <Circle size={10}/>}
                  {isLive ? "LIVE" : "DRAFT"}
                </span>
              </div>

              <div className="pt-mp-card-meta">
                <span><strong>₹{Number(price).toLocaleString("en-IN")}</strong> selling price</span>
                <span className="pt-mp-card-dot">·</span>
                <span>{sizes.length || 0} size{sizes.length === 1 ? "" : "s"}</span>
                {sizes.length > 0 && (
                  <span className="pt-mp-card-sizes">{sizes.join(" · ")}</span>
                )}
                <span className="pt-mp-card-dot">·</span>
                <span>{designs.length} design{designs.length === 1 ? "" : "s"}</span>
              </div>

              {/* Designs gallery */}
              {designs.length > 0 ? (
                <div className="pt-mp-designs">
                  {designs.map((d, i) => (
                    <a
                      key={i}
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pt-mp-design"
                      title={`${d.name} — ${d.widthIn}" × ${d.heightIn}"`}
                    >
                      <div className="pt-mp-design-thumb">
                        <img src={d.url} alt={d.name} loading="lazy"/>
                      </div>
                      <div className="pt-mp-design-info">
                        <div className="pt-mp-design-name">{d.name}</div>
                        <div className="pt-mp-design-dims">
                          <Ruler size={9}/> {d.widthIn}" × {d.heightIn}"
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="pt-mp-card-empty">No designs uploaded</div>
              )}

              <div className="pt-mp-card-foot">
                {shopifyLink
                  ? <a className="pt-mp-link" href={shopifyLink} target="_blank" rel="noopener noreferrer"><Store size={11}/> View on Shopify ↗</a>
                  : <span className="pt-mp-empty">No Shopify link yet</span>}
                <button className="pt-mp-row-x" onClick={() => { if (confirm(`Delete "${name}"?`)) onDelete(item.id || item.localId); }} title="Delete">
                  <Trash2 size={13}/>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PublishMenu({ stores, onPublish, onConnectStore }) {
  const [open, setOpen] = useState(false);
  if (stores.length === 0) {
    return <button className="pt-btn-primary pt-btn-sm" onClick={onConnectStore}><LinkIcon size={12}/> Connect store first</button>;
  }
  if (stores.length === 1) {
    return <button className="pt-btn-primary pt-btn-sm" onClick={() => onPublish(stores[0].id)}><ArrowUpRight size={12}/> Publish</button>;
  }
  return (
    <div className="pt-publish-menu">
      <button className="pt-btn-primary pt-btn-sm" onClick={() => setOpen(!open)}><ArrowUpRight size={12}/> Publish</button>
      {open && (
        <div className="pt-publish-dropdown">
          {stores.map(s => (
            <button key={s.id} onClick={() => { setOpen(false); onPublish(s.id); }}>
              <Store size={12}/> {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: STORES
// ═══════════════════════════════════════════════════════════════════
function Stores({ stores, setStores }) {
  const [status, setStatus] = useState(null);  // { connected, shop, tenant } or null while loading
  const [error,  setError]  = useState(null);
  // Populated when the user lands on this page right after Shopify
  // bounced them back from an OAuth approval. Shown as a one-shot
  // banner above the inline "Connect Another Store" section.
  const [oauthSuccess, setOauthSuccess] = useState(null);
  // Inline domain input — replaces the old modal. Same OAuth mechanism,
  // just no modal interstitial — matches Unitee's UX exactly.
  const [domain, setDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Pull live connection state from the server (the access token never
  // leaves the API; only domain + counts come back to the browser).
  const refresh = useCallback(async () => {
    try {
      const s = await getShopifyStatus();
      setStatus(s);
      // Mirror to the in-memory `stores` array so other pages (Publish menu,
      // MyProducts, Orders) can keep using their existing prop shape.
      if (s.connected && s.shop) {
        setStores([{
          id: s.tenant?.id || "store-1",
          name: s.tenant?.name || s.shop.domain.split(".")[0],
          domain: s.shop.domain,
          status: "connected",
          last_synced_at: s.shop.last_synced_at,
          orders_count: s.shop.orders_count,
          connectedAt: s.shop.last_synced_at || new Date().toISOString(),
        }]);
      } else {
        setStores([]);
      }
    } catch (e) {
      setError(e.message || String(e));
      setStatus({ connected: false });
    }
  }, [setStores]);

  useEffect(() => { refresh(); }, [refresh]);

  // Catch the post-OAuth redirect from /api/shopify-oauth-callback. The
  // callback lands the merchant on /portal?shopify_connected=1&shop=…&synced=N.
  // We grab those, surface a banner, refresh status, then scrub the URL
  // so a page reload doesn't show the banner again.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("shopify_connected") !== "1") return;
    setOauthSuccess({
      shop:     qs.get("shop") || null,
      synced:   Number(qs.get("synced") || 0),
      products: Number(qs.get("products") || 0),
      scopes:   qs.get("scopes") || null,
    });
    refresh();
    qs.delete("shopify_connected");
    qs.delete("shop");
    qs.delete("synced");
    qs.delete("products");
    qs.delete("scopes");
    const clean = `${window.location.pathname}${qs.toString() ? `?${qs}` : ""}`;
    window.history.replaceState({}, "", clean);
  }, [refresh]);

  const disconnect = async (domain) => {
    if (!confirm(`Disconnect ${domain}? Historical orders stay; we'll just stop syncing new ones.`)) return;
    try { await disconnectShopify(); } catch (e) { alert(e.message); }
    await refresh();
  };

  // Same OAuth machinery as the old modal — just inline now. Build the
  // authorize URL via /api/shopify-oauth-install, then redirect the
  // browser to Shopify. The merchant approves, Shopify bounces back to
  // our callback, which writes the token + lands them on
  // /portal?shopify_connected=1.
  const cleanedDomain = useMemo(() => {
    let d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (d && !d.includes(".") && !d.endsWith(".myshopify.com")) d = `${d}.myshopify.com`;
    return d;
  }, [domain]);
  const isValidDomain = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleanedDomain);

  const submit = async (e) => {
    e.preventDefault();
    if (!isValidDomain || submitting) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const { url } = await startShopifyOAuth({ shop: cleanedDomain });
      window.location.href = url;   // Shopify approval screen
    } catch (e2) {
      setSubmitError(e2.message || String(e2));
      setSubmitting(false);
    }
  };

  const loading = status === null;
  const connected = status?.connected;

  return (
    <div className="pt-dash pt-stores">
      <style>{STORES_CSS}</style>
      <PageHeader title="My Store" sub="Connect your Shopify store to start selling your custom designs" />

      {loading && <div className="pt-empty" style={{ padding: 40 }}><Loader2 className="pt-spin" size={16}/> Checking connection…</div>}

      {/* Persistent post-OAuth success card — green panel that matches
          Unitee's "Store Connected Successfully" treatment. */}
      {!loading && connected && (
        <div className="pt-store-success">
          <div className="pt-store-success-icon">
            <Check size={28} />
          </div>
          <div className="pt-store-success-body">
            <div className="pt-store-success-h">Store Connected Successfully</div>
            <div className="pt-store-success-sub">
              Connected to: <strong className="mono">{status.shop.domain}</strong>
            </div>
            <div className="pt-store-success-meta">
              <span className="pt-pulse" /> Live · {status.shop.orders_count} order{status.shop.orders_count === 1 ? "" : "s"} synced
              {status.shop.last_synced_at ? " · " + new Date(status.shop.last_synced_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : ""}
            </div>
          </div>
          <button className="pt-store-success-disc" onClick={() => disconnect(status.shop.domain)}>
            Disconnect
          </button>
        </div>
      )}

      {/* One-shot toast surfacing the "synced N orders" detail right
          after the merchant returns from Shopify. Auto-clears via the
          "Dismiss" link or on next refresh. */}
      {oauthSuccess && (
        <div className="pt-alert pt-alert-ok" style={{ marginBottom: 16 }}>
          <CheckCircle2 size={14}/>
          <span>
            Connected to <strong>{oauthSuccess.shop}</strong> · synced{" "}
            <strong>{oauthSuccess.synced || 0}</strong> orders and{" "}
            <strong>{oauthSuccess.products || 0}</strong> products. New activity will flow in automatically.
          </span>
          <button className="pt-link-btn" onClick={() => setOauthSuccess(null)} style={{ marginLeft: "auto" }}>Dismiss</button>
        </div>
      )}

      {/* Inline connect form — always visible. Header copy changes
          based on whether the merchant already has a store wired up. */}
      {!loading && (
        <div className="pt-store-connect">
          <div className="pt-store-connect-icon" aria-hidden>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21V8l9-5 9 5v13" />
              <path d="M9 21V13h6v8" />
              <line x1="3" y1="21" x2="21" y2="21" />
            </svg>
          </div>
          <h2 className="pt-store-connect-h">
            {connected ? "Connect Another Store" : "Connect Your Shopify Store"}
          </h2>
          <p className="pt-store-connect-sub">
            {connected
              ? "Enter your Shopify store URL to start selling your custom designs"
              : "Type your .myshopify.com domain. We'll send you to Shopify to approve the Aviva app — no tokens to copy, no scopes to configure."}
          </p>

          <form className="pt-store-connect-form" onSubmit={submit}>
            <label className="pt-field pt-store-connect-field">
              <span>Shopify Store URL</span>
              <div className="pt-store-input-wrap">
                <span className="pt-store-input-icon" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                </span>
                <input
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  placeholder="yourstore.myshopify.com"
                  required
                  disabled={submitting}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              {domain && !isValidDomain && (
                <div className="pt-store-hint pt-store-hint-warn">Use the full <code>name.myshopify.com</code> URL.</div>
              )}
            </label>

            {submitError && (
              <div className="pt-alert pt-alert-err" style={{ marginTop: 4 }}>
                <AlertTriangle size={13}/> {submitError}
              </div>
            )}

            <button
              type="submit"
              className="pt-store-connect-cta"
              disabled={!isValidDomain || submitting}
            >
              {submitting ? (
                <><Loader2 size={14} className="pt-spin"/> Redirecting to Shopify…</>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="13 17 18 12 13 7"/>
                    <polyline points="6 17 11 12 6 7"/>
                  </svg>
                  Connect Store
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {error && (
        <div className="pt-alert pt-alert-err" style={{ marginTop: 14 }}>
          <AlertTriangle size={13}/> {error}
        </div>
      )}

      {connected && <ShopifyProductsGrid />}
    </div>
  );
}

// Read-only grid of the merchant's synced Shopify catalog. Hydrates
// from shopify_products, which is filled by the OAuth-callback backfill
// and the periodic /api/shopify?action=sync. Image, title, status, stock
// — just enough to confirm "yes my catalog is in Aviva."
function ShopifyProductsGrid() {
  const [products, setProducts] = useState(null); // null = loading
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await listShopifyProducts();
        if (alive) setProducts(rows);
      } catch {
        if (alive) setProducts([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (products === null) {
    return (
      <div className="pt-empty" style={{ padding: 32, marginTop: 18 }}>
        <Loader2 className="pt-spin" size={14}/> Loading your store catalog…
      </div>
    );
  }
  if (products.length === 0) {
    return (
      <div className="pt-panel" style={{ marginTop: 18, padding: 22 }}>
        <div className="pt-panel-head">
          <div>
            <h2>YOUR STORE PRODUCTS</h2>
            <div className="pt-panel-sub">Pulled from your connected Shopify store</div>
          </div>
        </div>
        <div className="pt-panel-empty">No products yet. New products on your store will appear here automatically.</div>
      </div>
    );
  }
  return (
    <div className="pt-panel" style={{ marginTop: 18, padding: 22 }}>
      <div className="pt-panel-head">
        <div>
          <h2>YOUR STORE PRODUCTS</h2>
          <div className="pt-panel-sub">{products.length} product{products.length === 1 ? "" : "s"} synced from your Shopify catalog</div>
        </div>
      </div>
      <div className="pt-shopify-prod-grid">
        {products.map(p => (
          <div key={p.id} className="pt-shopify-prod-card">
            <div className="pt-shopify-prod-img">
              {p.image_url
                ? <img src={p.image_url} alt={p.title || ""} loading="lazy"/>
                : <div className="pt-shopify-prod-noimg"><Shirt size={20}/></div>}
              {p.status && p.status !== "active" && (
                <span className={`pt-shopify-prod-status pt-shopify-prod-status-${p.status}`}>{p.status}</span>
              )}
            </div>
            <div className="pt-shopify-prod-body">
              <div className="pt-shopify-prod-title">{p.title || "—"}</div>
              <div className="pt-shopify-prod-meta">
                {Array.isArray(p.variants) ? `${p.variants.length} variant${p.variants.length === 1 ? "" : "s"}` : ""}
                {Number.isFinite(p.total_inventory) ? ` · ${p.total_inventory} in stock` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const STORES_CSS = `
.pt-stores { max-width: 920px; }

/* ── Persistent success card ──
   Mirrors Unitee's "Store Connected Successfully" — green border, big
   check icon, domain in mono, live-sync meta. */
.pt-store-success {
  display: flex; align-items: center; gap: 18px;
  padding: 22px 24px;
  margin-bottom: 22px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--pt-success, #10b981) 8%, transparent);
  border: 2px solid color-mix(in srgb, var(--pt-success, #10b981) 50%, transparent);
}
.pt-store-success-icon {
  flex-shrink: 0;
  width: 54px; height: 54px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--pt-success, #10b981) 18%, transparent);
  color: var(--pt-success, #10b981);
  display: inline-flex; align-items: center; justify-content: center;
}
.pt-store-success-body { flex: 1; min-width: 0; }
.pt-store-success-h {
  font-size: 18px; font-weight: 800; letter-spacing: -0.01em;
  color: var(--pt-success, #10b981);
  margin-bottom: 4px;
}
.pt-store-success-sub {
  font-size: 14px;
  color: var(--pt-success, #10b981);
}
.pt-store-success-sub strong { font-weight: 800; }
.pt-store-success-meta {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--pt-text-dim);
  display: inline-flex; align-items: center; gap: 8px;
}
.pt-store-success-disc {
  flex-shrink: 0;
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid var(--pt-border);
  background: transparent;
  color: var(--pt-text-dim);
  font: inherit; font-size: 11px; font-weight: 700;
  letter-spacing: 0.10em; text-transform: uppercase;
  cursor: pointer;
}
.pt-store-success-disc:hover { color: var(--pt-err); border-color: var(--pt-err); }

/* ── Connect (Another) Store card ──
   Centered card with building icon → headline → input → button. Always
   visible: shows as the first connect for new merchants, and below the
   success card as "Connect Another Store" for already-connected ones. */
.pt-store-connect {
  background: var(--pt-bg-elev);
  border: 1px solid var(--pt-border);
  border-radius: 16px;
  padding: 36px 32px 32px;
  text-align: center;
  max-width: 560px;
  margin: 0 auto;
}
.pt-store-connect-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 72px; height: 72px;
  border-radius: 999px;
  background: var(--pt-bg-soft);
  color: var(--pt-text-dim);
  margin-bottom: 18px;
}
.pt-store-connect-h {
  font-size: 22px; font-weight: 800; letter-spacing: -0.01em;
  color: var(--pt-text-strong);
  margin: 0 0 8px;
}
.pt-store-connect-sub {
  font-size: 13.5px; line-height: 1.55;
  color: var(--pt-text-dim);
  margin: 0 0 22px;
  max-width: 44ch;
  margin-left: auto; margin-right: auto;
}
.pt-store-connect-form {
  display: flex; flex-direction: column; gap: 14px;
  text-align: left;
}
.pt-store-connect-field > span {
  display: block;
  font-size: 11px; letter-spacing: 0.10em; font-weight: 700;
  color: var(--pt-text-strong);
  text-transform: uppercase;
  margin-bottom: 8px;
}
.pt-store-input-wrap {
  position: relative;
  display: flex; align-items: center;
}
.pt-store-input-icon {
  position: absolute; left: 14px;
  color: var(--pt-text-dim);
  pointer-events: none;
  display: inline-flex;
}
.pt-store-connect-form input {
  width: 100%;
  padding: 13px 14px 13px 38px;
  border-radius: 12px;
  border: 1.5px solid var(--pt-border);
  background: var(--pt-bg);
  color: var(--pt-text-strong);
  font: inherit;
  font-size: 14px;
  letter-spacing: 0.01em;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.pt-store-connect-form input:focus {
  outline: none;
  border-color: var(--pt-text-strong);
  box-shadow: 0 0 0 3px var(--pt-accent-glow);
}
.pt-store-hint {
  margin-top: 6px;
  font-size: 11px; line-height: 1.45;
}
.pt-store-hint code {
  background: var(--pt-bg-soft);
  padding: 1px 5px; border-radius: 4px;
  font-size: 11px;
}
.pt-store-hint-warn { color: var(--pt-amber, #FB923C); }
.pt-store-connect-cta {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 6px;
  width: 100%;
  padding: 15px 18px;
  border-radius: 12px;
  background: var(--pt-text-strong);
  color: var(--pt-bg);
  border: 0;
  font: inherit;
  font-size: 14px; font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.15s, opacity 0.15s;
}
.pt-store-connect-cta:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(0,0,0,0.18);
}
.pt-store-connect-cta:disabled {
  opacity: 0.55; cursor: not-allowed;
}

@media (max-width: 640px) {
  .pt-store-success { flex-direction: column; align-items: flex-start; padding: 18px; }
  .pt-store-success-disc { align-self: stretch; }
  .pt-store-connect { padding: 24px 18px 22px; }
  .pt-store-connect-h { font-size: 19px; }
  .pt-store-connect-icon { width: 60px; height: 60px; }
}

/* ── Synced Shopify products grid ── */
.pt-shopify-prod-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
  margin-top: 6px;
}
.pt-shopify-prod-card {
  background: var(--pt-bg-elev);
  border: 1px solid var(--pt-border);
  border-radius: 12px;
  overflow: hidden;
  display: flex; flex-direction: column;
}
.pt-shopify-prod-img {
  position: relative;
  aspect-ratio: 1 / 1;
  background: var(--pt-bg);
  display: grid; place-items: center;
}
.pt-shopify-prod-img img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.pt-shopify-prod-noimg { color: var(--pt-text-dim); opacity: 0.5; }
.pt-shopify-prod-status {
  position: absolute; top: 8px; right: 8px;
  font-size: 9.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 3px 8px; border-radius: 999px;
  background: rgba(0,0,0,0.7); color: #fff;
}
.pt-shopify-prod-status-draft    { background: rgba(245,158,11,0.85); }
.pt-shopify-prod-status-archived { background: rgba(120,120,120,0.85); }
.pt-shopify-prod-body { padding: 10px 12px 12px; }
.pt-shopify-prod-title {
  font-size: 13px; font-weight: 700; line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.pt-shopify-prod-meta {
  margin-top: 4px;
  font-size: 11px; color: var(--pt-text-dim);
}
`;

// ─── Connect Shopify modal ────────────────────────────────────────────
// Post-2026-01-01 Shopify killed per-merchant custom-app creation, so we
// run our own Aviva app in Shopify Partners and merchants install via
// OAuth. The client types their .myshopify.com domain, we hit
// /api/shopify-oauth-install which mints a state nonce + returns the
// Shopify authorize URL, then we redirect the browser to it. After the
// merchant approves the install, Shopify bounces them to
// /api/shopify-oauth-callback which stores the token, runs the backfill,
// and lands them on /portal?shopify_connected=1.
function ConnectShopifyModal({ onClose }) {
  const [domain, setDomain] = useState("");
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);

  const cleanedDomain = useMemo(() => {
    let d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (d && !d.includes(".") && !d.endsWith(".myshopify.com")) d = `${d}.myshopify.com`;
    return d;
  }, [domain]);
  const isValidDomain = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleanedDomain);

  const submit = async (e) => {
    e.preventDefault();
    if (!isValidDomain || busy) return;
    setBusy(true); setError(null);
    try {
      const { url } = await startShopifyOAuth({ shop: cleanedDomain });
      // Hand the browser over to Shopify. The merchant approves the
      // install there; Shopify redirects back to our callback, which
      // saves the token and lands them on /portal?shopify_connected=1.
      window.location.href = url;
    } catch (e2) {
      setError(e2.message || String(e2));
      setBusy(false);
    }
  };

  return (
    <div className="pt-modal" onClick={() => !busy && onClose()}>
      <div className="pt-modal-card pt-modal-card-sm pt-connect-modal" onClick={e => e.stopPropagation()}>
        <button className="pt-modal-close" onClick={onClose} aria-label="Close" disabled={busy}><X size={18}/></button>

        <div className="pt-connect-head">
          <div className="pt-connect-eyebrow"><Store size={11}/> CONNECT SHOPIFY</div>
          <h2 className="pt-connect-h">Connect your store in two clicks</h2>
        </div>

        <form className="pt-connect-body" onSubmit={submit}>
          <p className="pt-connect-intro" style={{ marginTop: 0 }}>
            Enter your store's <strong>.myshopify.com</strong> URL. We'll send you to Shopify to approve the Aviva app — no tokens to copy, no scopes to configure. The whole thing takes under a minute.
          </p>

          <label className="pt-field">
            <span>Store domain</span>
            <input
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="yourstore.myshopify.com"
              required
              autoFocus
              disabled={busy}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            {domain && !isValidDomain && (
              <span className="pt-field-hint" style={{ color: "#dc2626", fontSize: 11 }}>
                Use the full .myshopify.com URL (e.g. icdpg4-mp.myshopify.com)
              </span>
            )}
          </label>

          <ol className="pt-connect-steps" style={{ marginTop: 12 }}>
            <li>
              <div className="pt-connect-step-no">1</div>
              <div className="pt-connect-step-body">
                You'll land on a Shopify page that says <strong>"Install Aviva"</strong>.
              </div>
            </li>
            <li>
              <div className="pt-connect-step-no">2</div>
              <div className="pt-connect-step-body">
                Click <code>Install app</code> — Shopify lists the scopes we'll read (orders, customers, products, fulfillments).
              </div>
            </li>
            <li>
              <div className="pt-connect-step-no">3</div>
              <div className="pt-connect-step-body">
                Shopify sends you back here, we pull your last 200 orders, and you're done.
              </div>
            </li>
          </ol>

          {error && <div className="pt-alert pt-alert-err"><AlertTriangle size={13}/> {error}</div>}

          <div className="pt-connect-secure">
            <Lock size={11}/> Aviva never sees your password. Tokens are stored encrypted server-side and can be revoked from your Shopify admin at any time.
          </div>

          <div className="pt-pd-actions" style={{ paddingTop: 0, marginTop: 0, borderTop: "none" }}>
            <button type="button" className="pt-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="pt-btn-primary" disabled={busy || !isValidDomain}>
              {busy
                ? <><Loader2 className="pt-spin" size={14}/> Redirecting to Shopify…</>
                : <>Continue to Shopify <ArrowRight size={13}/></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: ORDERS — shipping-label print jobs
// Client uploads courier shipping-label PDFs; we read off product / size
// / qty, roll up the production summary, store the labels, and the DTG
// vendor prints + dispatches against them.
// ═══════════════════════════════════════════════════════════════════
const LABEL_CHIP_KIND = { dispatched: "live", delivered: "live", ready_to_dispatch: "live", cancelled: "draft" };

// Compact live-shipment pill rendered next to each AWB on the client
// portal. Variant comes straight from /api/velocity-track which has
// already collapsed Velocity's ~30 raw statuses into 7 buckets
// (ok / ofd / transit / waiting / warn / rto / danger / muted).
function PortalVelocityChip({ tr }) {
  if (!tr) return null;
  if (tr.error) return <span title={tr.error} className="pt-mp-status-chip" style={{ color: "var(--pt-err)", border: "1px solid var(--pt-err)" }}>error</span>;
  if (tr.loading) return <span className="pt-mp-empty" style={{ fontSize: 11, fontStyle: "italic" }}>fetching…</span>;
  const variant = (tr.variant || "muted").toLowerCase();
  const color =
    variant === "ok"      ? "var(--pt-success, #10b981)" :
    variant === "ofd"     ? "var(--pt-amber, #FB923C)"  :
    variant === "transit" ? "var(--pt-text-strong, #0a0a0a)" :
    variant === "waiting" ? "var(--pt-text-dim, #555)"   :
    variant === "warn"    ? "var(--pt-amber, #FB923C)"  :
    variant === "rto"     ? "var(--pt-err, #ef4444)"    :
    variant === "danger"  ? "var(--pt-err, #ef4444)"    :
                            "var(--pt-text-dim, #555)";
  return (
    <span
      title={tr.last_activity || tr.status_raw || ""}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 9px", borderRadius: 999,
        fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em",
        textTransform: "uppercase",
        border: `1px solid ${color}`, color, whiteSpace: "nowrap",
      }}
    >
      {tr.status_label || "—"}
    </span>
  );
}

function Orders({ myProducts = [], goto, batches = [], batchesLoaded = false, refreshBatches }) {
  const [mode, setMode] = useState("list"); // "list" | "upload"
  const [expanded, setExpanded] = useState(null); // { id, lines, shipments }
  const loaded = batchesLoaded;
  const loadBatches = useCallback(() => { refreshBatches && refreshBatches(); }, [refreshBatches]);

  // Live Velocity tracking — only fetched if THIS client's own tenant
  // has velocity_username set. Right now that's just Balleti; any
  // future tenant that gets Velocity creds added picks this up
  // automatically (no client-side code change needed).
  const [velocityTenant, setVelocityTenant] = useState(null); // null = unknown, false = no creds, "t-xxx" = enabled
  const [trackingByAwb, setTrackingByAwb] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { tenantId } = await myTenantId();
        const tenant = await fetchTenant(tenantId);
        if (!alive) return;
        setVelocityTenant(tenant?.velocity_username ? tenantId : false);
      } catch { if (alive) setVelocityTenant(false); }
    })();
    return () => { alive = false; };
  }, []);

  const fetchTrackingFor = useCallback(async (awbs) => {
    if (!velocityTenant) return;
    const pending = (awbs || []).filter(a => a && !trackingByAwb[a]);
    if (!pending.length) return;
    setTrackingByAwb(prev => {
      const next = { ...prev };
      for (const a of pending) next[a] = { loading: true };
      return next;
    });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("session expired");
      const res = await fetch("/api/velocity-track", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: velocityTenant, awbs: pending }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `velocity-track ${res.status}`);
      setTrackingByAwb(prev => {
        const next = { ...prev };
        for (const a of pending) {
          const hit = body.statuses && body.statuses[a];
          next[a] = hit ? hit : { status_label: "Not on Velocity", variant: "muted" };
        }
        return next;
      });
    } catch (e) {
      setTrackingByAwb(prev => {
        const next = { ...prev };
        for (const a of pending) next[a] = { error: e.message || String(e) };
        return next;
      });
    }
  }, [velocityTenant, trackingByAwb]);

  const toggleExpand = async (b) => {
    if (expanded?.id === b.id) { setExpanded(null); return; }
    try {
      const lines = await listLabelLines(b.id);
      setExpanded({ id: b.id, lines, shipments: b.shipments || [] });
      // Kick off live tracking fetch for this batch's AWBs.
      if (velocityTenant) {
        const awbs = (b.shipments || []).map(s => s?.awb).filter(Boolean);
        if (awbs.length) fetchTrackingFor(awbs);
      }
    } catch (e) {
      alert("Couldn't load summary: " + (e.message || e));
    }
  };

  if (mode === "upload") {
    return <UploadLabels myProducts={myProducts} goto={goto}
      onCancel={() => setMode("list")}
      onSaved={() => { setMode("list"); loadBatches(); }} />;
  }

  if (!loaded) {
    return (
      <div className="pt-dash">
        <PageHeader title="Orders" sub="Upload your courier shipping labels — we build the production summary and send it to print." />
        <div className="pt-cat-toolbar">
          <div className="pt-cat-pills"><span className="pt-skel" style={{ width: 92, height: 28, borderRadius: 999 }}/></div>
          <div style={{ marginLeft: "auto" }}><span className="pt-skel" style={{ width: 168, height: 34, borderRadius: 10 }}/></div>
        </div>
        <div className="pt-ordc-list pt-fade-in">
          {[0, 1, 2, 3].map(i => (
            <div className="pt-ordc" key={i}>
              <div className="pt-ordc-head" style={{ cursor: "default" }}>
                <div className="pt-ordc-main">
                  <span className="pt-skel pt-skel-line" style={{ width: 110, height: 14 }}/>
                  <span className="pt-skel pt-skel-line" style={{ width: "60%", height: 9, marginTop: 8 }}/>
                </div>
                <span className="pt-skel" style={{ width: 96, height: 24, borderRadius: 999, flexShrink: 0 }}/>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // RTOs are tracked per order ID in the RTOs section; the batch itself
  // stays a normal order here.
  const orders = batches;

  return (
    <div className="pt-dash">
      <PageHeader title="Orders"
        sub="Upload your courier shipping labels — we build the production summary and send it to print." />

      <div className="pt-cat-toolbar">
        <div className="pt-cat-pills"><span className="pt-cat-pill on">{orders.length} batch{orders.length === 1 ? "" : "es"}</span></div>
        <div style={{ marginLeft: "auto" }}>
          <button className="pt-btn-primary pt-btn-sm" onClick={() => setMode("upload")}>
            <Upload size={13}/> Upload shipping labels
          </button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="pt-empty-state pt-panel pt-orders-empty pt-rise">
          <div className="pt-orders-empty-icon"><FileText size={28}/></div>
          <h3>Upload your shipping labels to start a print job.</h3>
          <p>Drop in the courier shipping-label PDFs for the day's orders. We read off each product, size, and quantity, build the production summary, and send it to the print floor. The DTG team packs and dispatches using your labels.</p>
          <div className="pt-orders-empty-actions">
            <button className="pt-btn-primary" onClick={() => setMode("upload")}>
              <Upload size={14}/> Upload shipping labels
            </button>
            <button className="pt-btn-ghost" onClick={() => goto?.("products")}>
              <ShoppingBag size={14}/> Check my products
            </button>
          </div>
          <div className="pt-orders-empty-strip">
            <div><span className="pt-orders-empty-strip-l">READS</span><span>Product · Size · Qty</span></div>
            <div><span className="pt-orders-empty-strip-l">OUTPUT</span><span>Production summary</span></div>
            <div><span className="pt-orders-empty-strip-l">FULFILMENT</span><span>DTG packs & ships</span></div>
          </div>
        </div>
      ) : (
        <div className="pt-ordc-list pt-rise">
          {orders.map((b, bi) => {
            const isOpen = expanded?.id === b.id;
            const files = b.files?.length || 0;
            return (
              <div className={`pt-ordc${isOpen ? " is-open" : ""}`} key={b.id}>
                <button className="pt-ordc-head" onClick={() => toggleExpand(b)} aria-expanded={isOpen}>
                  <div className="pt-ordc-main">
                    <div className="pt-ordc-code">{b.order_code || "Order"}</div>
                    <div className="pt-ordc-meta">
                      <span>{new Date(b.batch_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                      <span className="pt-ordc-dot">·</span>
                      <span>{b.label_count} label{b.label_count === 1 ? "" : "s"}</span>
                      <span className="pt-ordc-dot">·</span>
                      <span>{b.unit_count} pc{b.unit_count === 1 ? "" : "s"}</span>
                      <span className="pt-ordc-dot">·</span>
                      <span>{files} file{files === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  <div className="pt-ordc-aside">
                    <PortalStatusChip status={b.status} />
                    <ChevronDown size={16} className="pt-ordc-chev"/>
                  </div>
                </button>
                {isOpen && (() => {
                  const shipments = expanded.shipments || [];
                  const linesByRef = {};
                  expanded.lines.forEach(l => (l.order_refs || []).forEach(ref => {
                    if (!linesByRef[ref]) linesByRef[ref] = [];
                    linesByRef[ref].push(l);
                  }));
                  const piecePrice = (l) => Math.round((/acid\s*wash/i.test(l.product_name || "") ? 545 : 445) * 1.05 * 100) / 100;
                  const grandTotal = shipments.reduce((s, sh) => s + (linesByRef[sh.order_ref] || []).reduce((ss, l) => ss + piecePrice(l), 0), 0);
                  const fmt = (n) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  return (
                    <div className="pt-ordc-body">
                      <div className="pt-ordc-body-head">
                        {shipments.length} SHIPMENT{shipments.length === 1 ? "" : "S"} <span className="lc">· charge incl 5% GST</span>
                      </div>
                      {shipments.length === 0 ? (
                        <div className="pt-empty" style={{ padding: 14 }}>No shipments recorded for this order.</div>
                      ) : (
                        <div className="pt-ship-list">
                          {shipments.map((sh, i) => {
                            const items = linesByRef[sh.order_ref] || [];
                            const shipTotal = items.reduce((s, l) => s + piecePrice(l), 0);
                            const allPacked = items.length > 0 && items.every(l => l.packed_at);
                            const statusEl = (() => {
                              if (items.length === 0) return <span className="pt-mp-empty" style={{ fontSize: 11 }}>—</span>;
                              const tr = sh?.awb ? trackingByAwb[sh.awb] : null;
                              if (velocityTenant && tr && !tr.error && tr.status_label && tr.status_label !== "Not on Velocity") return <PortalVelocityChip tr={tr} />;
                              if (velocityTenant && tr && tr.loading) return <span className="pt-mp-empty" style={{ fontSize: 11, fontStyle: "italic" }}>fetching…</span>;
                              return allPacked
                                ? <span className="pt-mp-status-chip pt-mp-status-chip-live">Packed</span>
                                : <span className="pt-mp-status-chip pt-mp-status-chip-draft">Pending</span>;
                            })();
                            return (
                              <div className="pt-ship" key={sh.awb || i}>
                                <div className="pt-ship-top">
                                  <span className="pt-ship-ref">{sh.order_ref || "—"}</span>
                                  {statusEl}
                                </div>
                                <div className="pt-ship-rows">
                                  <div className="pt-ship-row">
                                    <span className="pt-ship-k">Courier</span>
                                    <span className="pt-ship-v">{sh.courier || "—"}</span>
                                  </div>
                                  <div className="pt-ship-row">
                                    <span className="pt-ship-k">AWB</span>
                                    <span className="pt-ship-v">
                                      {sh.awb
                                        ? <a href={trackingUrl(sh.courier, sh.awb)} target="_blank" rel="noreferrer">{sh.awb} <ExternalLink size={10} style={{ verticalAlign: "middle" }}/></a>
                                        : "—"}
                                    </span>
                                  </div>
                                  <div className="pt-ship-row">
                                    <span className="pt-ship-k">Items</span>
                                    <span className="pt-ship-v">
                                      {items.length === 0 ? "—" : items.map((l, j) => (
                                        <div key={j}>{l.product_name} <span className="pt-mp-empty">· {l.size || "—"}</span></div>
                                      ))}
                                    </span>
                                  </div>
                                  <div className="pt-ship-row">
                                    <span className="pt-ship-k">Charge</span>
                                    <span className="pt-ship-v pt-ship-amt">{items.length ? fmt(shipTotal) : "—"}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          <div className="pt-ship-total">
                            <span>Total</span>
                            <span className="pt-ship-amt">{fmt(grandTotal)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: RTOs — returned orders + the inventory they put back in stock.
// An order shows here once it's flagged rto_in_transit / rto (received).
// Received returns top up RTO inventory, which is auto-applied — without
// a re-charge — to the next matching upload (see the charge trigger).
// ═══════════════════════════════════════════════════════════════════
function RTOsPage() {
  const [ships, setShips] = useState(null); // null = loading
  const [inv, setInv] = useState(null);
  const load = useCallback(async () => {
    try {
      const { tenantId } = await myTenantId();
      const [shipsRes, invRes] = await Promise.all([
        supabase.from("rto_shipments")
          .select("order_ref, awb, courier, status, status_label, product_summary, last_activity")
          .eq("tenant_id", tenantId),
        supabase.from("rto_inventory")
          .select("product_key, product_name, size, qty")
          .eq("tenant_id", tenantId),
      ]);
      const ss = (shipsRes.data || []).slice().sort((a, b) =>
        (b.last_activity || "").localeCompare(a.last_activity || "") || (a.order_ref || "").localeCompare(b.order_ref || ""));
      setShips(ss);
      const m = new Map();
      for (const r of invRes.data || []) {
        const k = `${r.product_key}|${r.size || ""}`;
        if (!m.has(k)) m.set(k, { product_key: r.product_key, product_name: r.product_name, size: r.size, qty: 0 });
        m.get(k).qty += Number(r.qty) || 0;
      }
      setInv([...m.values()].filter(x => x.qty > 0).sort((a, b) => (a.product_name || "").localeCompare(b.product_name || "")));
    } catch { setShips([]); setInv([]); }
  }, []);
  useEffect(() => {
    load();
    const u1 = subscribe("rto_shipments", load);
    const u2 = subscribe("rto_inventory", load);
    return () => { u1 && u1(); u2 && u2(); };
  }, [load]);

  const totalStock = (inv || []).reduce((s, x) => s + x.qty, 0);
  const loading = ships == null;

  return (
    <div className="pt-dash">
      <PageHeader title="RTOs" sub="Returned order IDs and the stock they put back into your inventory" />
      <div className="pt-wallet-grid">
        <section className="pt-panel pt-wallet-card pt-rise">
          <div className="pt-wallet-card-glow" aria-hidden="true" />
          <div className="pt-wallet-card-top">
            <div className="pt-wallet-label"><RotateCcw size={12}/> RTO INVENTORY</div>
          </div>
          <div className="pt-wallet-amount">{inv == null ? "…" : totalStock}</div>
          <div className="pt-wallet-sub">{inv == null ? "Loading stock…" : `${totalStock} piece${totalStock === 1 ? "" : "s"} ready to reuse`}</div>
          <div className="pt-rto-note">Auto-applied to your next matching upload — that piece won't be charged for production again.</div>
          <div className="pt-wallet-stats" style={{ marginTop: 14 }}>
            {inv == null ? (
              [0, 1].map(i => <span key={i} className="pt-skel pt-skel-line" style={{ width: "100%", height: 14 }}/>)
            ) : inv.length === 0 ? (
              <div className="pt-empty" style={{ padding: "8px 0", textAlign: "left" }}>No stock yet — RTO-delivered items land here.</div>
            ) : inv.map(x => (
              <div className="pt-rto-stock" key={`${x.product_key}|${x.size || ""}`}>
                <span className="pt-rto-stock-name">{x.product_name}{x.size ? <span className="pt-rto-stock-size"> · {x.size}</span> : null}</span>
                <span className="pt-rto-stock-qty">×{x.qty}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-panel pt-rise" style={{ animationDelay: "60ms" }}>
          <div className="pt-panel-head">
            <div><h2>RETURNED ORDER IDS</h2><div className="pt-panel-sub">Individual orders the courier flagged RTO · in-transit and received</div></div>
          </div>
          {loading ? (
            <div className="pt-ord-list">{[0, 1].map(i => (
              <div key={i} className="pt-ord">
                <span className="pt-skel" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }}/>
                <div className="pt-ord-body">
                  <span className="pt-skel pt-skel-line" style={{ width: "30%" }}/>
                  <span className="pt-skel pt-skel-line" style={{ width: "70%", height: 9, marginTop: 8 }}/>
                </div>
              </div>
            ))}</div>
          ) : ships.length === 0 ? (
            <div className="pt-empty">No RTO orders yet. Returns show up here per order ID, automatically.</div>
          ) : (
            <div className="pt-ord-list">
              {ships.map((s, i) => {
                const received = s.status === "rto_delivered";
                return (
                  <div key={s.awb} className="pt-ord pt-rise" style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}>
                    <div className="pt-ord-icon" style={{ background: received ? "var(--pt-err-glow)" : "rgba(251,146,60,0.14)", color: received ? "var(--pt-err)" : "var(--pt-amber)" }}>
                      {received ? <CheckCircle2 size={15}/> : <Truck size={15}/>}
                    </div>
                    <div className="pt-ord-body">
                      <div className="pt-ord-row1">
                        <span className="pt-ord-code">{s.order_ref}</span>
                        <PortalStatusChip status={received ? "rto" : "rto_in_transit"} />
                      </div>
                      <div className="pt-ord-meta">
                        <span>{s.product_summary || "—"}</span>
                        {s.courier ? (<><span className="pt-ord-dot">·</span><span>{s.courier}</span></>) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// Upload + parse + confirm flow for a new label batch.
function UploadLabels({ myProducts = [], onCancel, onSaved, goto }) {
  const [files, setFiles] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null); // { lines, shipments, fileErrors, pageCount }
  const [batchDate, setBatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Live wallet balance for the upload-time low-balance warning. Loaded
  // once on mount + refreshed via the wallet_debits realtime channel so
  // an admin top-up posted while the client is mid-upload reflects
  // immediately. Falls back to 0 on error rather than blocking the flow.
  const [walletBalance, setWalletBalance] = useState(null); // null = loading

  useEffect(() => {
    let alive = true;
    const refresh = () => listWalletTxns()
      .then(({ balance }) => { if (alive) setWalletBalance(Number(balance) || 0); })
      .catch(() => { if (alive) setWalletBalance(0); });
    refresh();
    // Production is charged the instant labels are uploaded (DB trigger),
    // so the live wallet balance already nets out every uploaded piece —
    // just keep it in sync with recharges + debits.
    const u1 = subscribe("client_recharges", refresh);
    const u2 = subscribe("wallet_debits", refresh);
    return () => { alive = false; u1 && u1(); u2 && u2(); };
  }, []);

  // Charge-on-upload: the confirmed balance already reflects every
  // previously-uploaded piece, so it IS what's available for a new batch.
  const availableForNewBatch =
    walletBalance == null ? null : Math.max(0, walletBalance);

  const onPick = async (fileList) => {
    const picked = [...fileList].filter(f => /pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!picked.length) { setError("Please choose PDF shipping labels."); return; }
    setFiles(picked); setError(null); setParsing(true); setParsed(null);
    try {
      const { shipments, pageCount, fileErrors } = await parseLabelFiles(picked);
      const lines = rollupLabelLines(shipments, myProducts);
      setParsed({ lines, shipments, fileErrors, pageCount });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setParsing(false);
    }
  };

  const totals = useMemo(() => {
    if (!parsed) return null;
    const pieces = parsed.lines.reduce((s, l) => s + l.qty, 0);
    const labels = parsed.shipments.length;
    const missing = parsed.lines.filter(l => !l.design_link).length;
    // Shared with the saveLabelBatch enforcement — same answer at both
    // call sites, so the UI never disagrees with what the server allows.
    const estimatedCost = estimateLabelBatchCost(parsed.lines);
    return { pieces, labels, products: parsed.lines.length, missing, estimatedCost };
  }, [parsed]);

  // Trigger the warning only after the wallet has loaded AND we know the
  // batch cost. Avoids flashing the alert during the first paint while
  // the balance is still null.
  const insufficient =
    availableForNewBatch !== null && totals && totals.estimatedCost > availableForNewBatch;
  const shortfall = insufficient ? Math.max(0, totals.estimatedCost - availableForNewBatch) : 0;

  const save = async () => {
    if (!parsed?.lines.length) return;
    if (insufficient) return; // UI guard; saveLabelBatch is the real gate.
    setSaving(true); setError(null);
    try {
      await saveLabelBatch({ batchDate, files, shipments: parsed.shipments, products: myProducts });
      onSaved?.();
    } catch (e) {
      // Wallet-insufficient errors thrown by saveLabelBatch refresh the
      // balance state so the warning panel reflects the latest numbers
      // (e.g. an admin debited the wallet in another window between
      // parse-time and submit). For other errors, fall back to the
      // existing inline message.
      if (e?.code === "wallet_insufficient") {
        setWalletBalance(Number(e.balance) || 0);
        setError(e.message);
      } else {
        setError(e.message || String(e));
      }
      setSaving(false);
    }
  };

  return (
    <div className="pt-dash">
      <PageHeader title="Upload shipping labels"
        sub="Add the courier label PDFs — we read product, size, and quantity off each one." />

      <section className="pt-panel" style={{ padding: 18 }}>
        <label className="pt-upload-drop" htmlFor="lbl-files" style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 8, padding: 28, border: "1.5px dashed var(--pt-border)", borderRadius: 12,
          cursor: "pointer", textAlign: "center",
        }}>
          <input id="lbl-files" type="file" accept="application/pdf,.pdf" multiple style={{ display: "none" }}
            onChange={e => { if (e.target.files?.length) onPick(e.target.files); e.target.value = ""; }} />
          <Upload size={22}/>
          <div style={{ fontWeight: 600 }}>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected — tap to replace` : "Choose label PDFs"}</div>
          <div style={{ fontSize: 12, color: "var(--pt-text-muted)" }}>One or more PDFs · multi-page label sheets are fine</div>
        </label>

        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "var(--pt-text-muted)", display: "flex", flexDirection: "column", gap: 4 }}>
            BATCH DATE
            <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)}
              style={{ padding: "8px 10px", border: "1px solid var(--pt-border)", borderRadius: 8, background: "var(--pt-bg)", color: "var(--pt-text-strong)" }} />
          </label>
        </div>

        {parsing && <div className="pt-empty" style={{ padding: 18 }}><Loader2 className="pt-spin" size={15}/> Reading your labels…</div>}
        {error && <div style={{ marginTop: 12, color: "var(--pt-danger, #c0392b)", fontSize: 13 }}><AlertTriangle size={13}/> {error}</div>}

        {parsed?.fileErrors?.length > 0 && (
          <div style={{ marginTop: 12, color: "var(--pt-warn, #b8860b)", fontSize: 12 }}>
            <AlertTriangle size={12}/> {parsed.fileErrors.length} page(s) couldn't be read fully. Check those labels are standard courier PDFs.
          </div>
        )}
      </section>

      {/* Wallet low-balance warning — shows the moment we know the cost of
          the parsed batch and the wallet doesn't cover it. Non-blocking:
          the user can still save, but the message makes the shortfall
          obvious AND offers a one-click path to recharge. */}
      {insufficient && (
        <section
          className="pt-panel"
          style={{
            marginTop: 14,
            padding: "16px 20px",
            border: "1px solid var(--pt-amber, #FB923C)",
            background: "color-mix(in srgb, var(--pt-amber, #FB923C) 12%, var(--pt-bg-elev))",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div
              style={{
                width: 38, height: 38, borderRadius: 999,
                background: "color-mix(in srgb, var(--pt-amber, #FB923C) 22%, transparent)",
                color: "var(--pt-amber, #FB923C)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={18}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, letterSpacing: "0.16em", fontWeight: 800,
                color: "var(--pt-amber, #FB923C)", marginBottom: 4,
              }}>
                UPLOAD BLOCKED · RECHARGE REQUIRED
              </div>
              <div style={{ fontSize: 14, color: "var(--pt-text-strong)", fontWeight: 600, marginBottom: 8 }}>
                Your wallet doesn't cover this batch. Top up to continue.
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(120px, 1fr))",
                gap: 10,
                margin: "10px 0 14px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--pt-text-muted)", fontWeight: 700 }}>
                    THIS BATCH
                  </div>
                  <div style={{ fontSize: 18, color: "var(--pt-text-strong)", fontWeight: 700, marginTop: 2 }}>
                    ₹{totals.estimatedCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--pt-text-muted)", fontWeight: 700 }}>
                    AVAILABLE NOW
                  </div>
                  <div style={{ fontSize: 18, color: "var(--pt-text-strong)", fontWeight: 700, marginTop: 2 }}>
                    ₹{Number(availableForNewBatch ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--pt-amber, #FB923C)", fontWeight: 700 }}>
                    SHORTFALL
                  </div>
                  <div style={{ fontSize: 18, color: "var(--pt-amber, #FB923C)", fontWeight: 800, marginTop: 2 }}>
                    ₹{shortfall.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: "var(--pt-text-dim)", lineHeight: 1.55, marginBottom: 12 }}>
                The <strong style={{ color: "var(--pt-text-strong)" }}>Save batch</strong> button is locked until your wallet has at least{" "}
                <strong style={{ color: "var(--pt-text-strong)" }}>
                  ₹{totals.estimatedCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>. Recharge by{" "}
                <strong style={{ color: "var(--pt-text-strong)" }}>
                  ₹{shortfall.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>{" "}
                or more to unlock the upload.
              </div>

              <button
                type="button"
                onClick={() => goto && goto("wallet")}
                style={{
                  padding: "9px 16px", borderRadius: 999,
                  background: "var(--pt-amber, #FB923C)",
                  color: "var(--pt-bg, #0a0a0a)",
                  border: 0,
                  fontWeight: 800, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase",
                  cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 8,
                }}
              >
                <Plus size={14}/> Recharge wallet
              </button>
            </div>
          </div>
        </section>
      )}

      {parsed && totals && (
        <section className="pt-panel" style={{ marginTop: 14, padding: 0, overflow: "auto" }}>
          <div style={{ padding: "14px 16px", display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
            <span><strong>{totals.labels}</strong> labels</span>
            <span><strong>{totals.pieces}</strong> pieces to print</span>
            <span><strong>{totals.products}</strong> product lines</span>
            {totals.missing > 0 && <span style={{ color: "var(--pt-warn, #b8860b)" }}><AlertTriangle size={12}/> {totals.missing} without a linked design</span>}
          </div>
          <table className="pt-mp-table">
            <thead><tr><th>Product</th><th>Size</th><th>Qty</th><th>Design</th></tr></thead>
            <tbody>
              {parsed.lines.length === 0 ? (
                <tr><td colSpan={4} className="pt-mp-empty" style={{ padding: 18 }}>No product lines found in these labels.</td></tr>
              ) : parsed.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.product_name}</td>
                  <td>{l.size || "—"}</td>
                  <td>{l.qty}</td>
                  <td>{l.design_link
                    ? <span style={{ color: "var(--pt-success, #1e7e34)", fontSize: 12 }}><Check size={12}/> Linked</span>
                    : <span style={{ color: "var(--pt-warn, #b8860b)", fontSize: 12 }}>No design</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totals.missing > 0 && (
            <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--pt-text-muted)" }}>
              Products without a linked design still get sent to print — add the artwork under{" "}
              <button className="pt-link" onClick={() => goto?.("products")} style={{ background: "none", border: "none", color: "var(--pt-accent)", cursor: "pointer", padding: 0 }}>My Products</button> so it ships correctly.
            </div>
          )}
        </section>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end", alignItems: "center" }}>
        {insufficient && (
          <span style={{ fontSize: 11, color: "var(--pt-amber, #FB923C)", letterSpacing: "0.06em", marginRight: 6 }}>
            <AlertTriangle size={11} style={{ verticalAlign: "-1px", marginRight: 4 }}/>
            Recharge to unlock
          </span>
        )}
        <button className="pt-btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button
          className="pt-btn-primary"
          onClick={save}
          disabled={saving || parsing || !parsed?.lines.length || insufficient}
          title={insufficient ? `Wallet short by ₹${shortfall.toFixed(2)} — recharge to unlock` : undefined}
        >
          {saving
            ? <><Loader2 className="pt-spin" size={14}/> Saving…</>
            : insufficient
              ? <><Lock size={14}/> Locked · Recharge needed</>
              : <><Check size={14}/> Add to {batchDate === new Date().toISOString().slice(0,10) ? "today's" : "that day's"} order</>}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: WALLET
// ═══════════════════════════════════════════════════════════════════
// Build the tenant shape the shared invoice helper expects from the
// brand profile we already have in scope. Helper only needs `.name`
// for the CLIENT_PRESETS lookup; slug just goes into the filename.
function brandToTenant(brandProfile) {
  const name = brandProfile?.brandName || "Client";
  return {
    id: brandProfile?.tenant_id || null,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  };
}

function WalletInvoiceButton({ txn, tenant }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Only paid top-up rows have an invoice — debits (production charges)
  // are billed against the wallet, not separately invoiced.
  if (txn.type !== "topup" || !txn.raw) return null;
  const onClick = async (e) => {
    e.stopPropagation?.();
    e.preventDefault?.();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const { downloadRechargeInvoice } = await import("./walletInvoice.js");
      await downloadRechargeInvoice({ recharge: txn.raw, tenant });
    } catch (ex) {
      setError(ex.message || String(ex));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      <button
        type="button"
        className="pt-wallet-invoice-btn"
        onClick={onClick}
        disabled={busy}
        title="Download tax invoice"
        aria-label="Download invoice"
      >
        <Download size={11} />
        <span>{busy ? "…" : "Invoice"}</span>
      </button>
      {error && <span style={{ fontSize: 10, color: "var(--pt-err, #ef4444)" }}>{error}</span>}
    </div>
  );
}

function WalletPage({ brandProfile, balance = 0, transactions = [], onRecharge, loading = false }) {
  // Pull the full tenant row so the invoice helper has the
  // bill_to_* columns the client filled in at signup. Falls back to
  // the brandProfile-derived stub if the fetch fails (so the button
  // still works but the invoice will be missing GSTIN).
  const [tenantRow, setTenantRow] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { tenantId } = await myTenantId();
        const row = await fetchTenant(tenantId);
        if (alive) setTenantRow(row);
      } catch { /* swallow — fallback handles it */ }
    })();
    return () => { alive = false; };
  }, []);
  const tenantForInvoice = useMemo(
    () => tenantRow || brandToTenant(brandProfile),
    [tenantRow, brandProfile]
  );

  // Derived ledger stats — total topped up vs total spent, and a simple
  // health read on the running balance so the client knows when to recharge.
  const stats = useMemo(() => {
    let added = 0, spent = 0;
    for (const t of transactions) {
      if (t.type === "topup") added += t.amount; else spent += t.amount;
    }
    return { added, spent };
  }, [transactions]);
  const health = balance <= 0 ? "empty" : balance < 600 ? "low" : "ok";

  // Segmented filter + group rows under day headers so a long ledger
  // stays scannable instead of a flat wall of rows.
  const [filter, setFilter] = useState("all");
  const filtered = useMemo(
    () => filter === "all" ? transactions : transactions.filter(t => t.type === filter),
    [filter, transactions]
  );
  const groups = useMemo(() => groupTxnsByDay(filtered), [filtered]);

  return (
    <div className="pt-dash">
      <PageHeader title="Wallet" sub="Top up before each batch · Production charge debited when you upload labels" />
      <div className="pt-wallet-grid">
        <section className="pt-panel pt-wallet-card pt-rise">
          <div className="pt-wallet-card-glow" aria-hidden="true" />
          <div className="pt-wallet-card-top">
            <div className="pt-wallet-label"><Wallet size={12} /> CURRENT BALANCE</div>
            {!loading && (
              <span className={`pt-wallet-health pt-wallet-health-${health}`}>
                <span className="pt-wallet-health-dot" />
                {health === "ok" ? "Healthy" : health === "low" ? "Low" : "Empty"}
              </span>
            )}
          </div>
          {loading
            ? <span className="pt-skel" style={{ width: 190, height: 44, borderRadius: 12, margin: "6px 0" }}/>
            : <div className="pt-wallet-amount">{fmtWalletAmt(balance)}</div>}
          <div className="pt-wallet-sub">{loading ? "Fetching your balance…" : (transactions.length === 0 ? "No top-ups yet" : `${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`)}</div>
          <button className="pt-btn-primary pt-wallet-topup" onClick={onRecharge} disabled={loading}><Plus size={15}/> Top up wallet</button>
          <div className="pt-wallet-stats">
            <div className="pt-wallet-stat">
              <span className="pt-wallet-stat-ico pt-wallet-stat-ico-in"><ArrowDownLeft size={13}/></span>
              <span className="pt-wallet-stat-k">Total added</span>
              {loading ? <span className="pt-skel pt-skel-line" style={{ width: 70, marginLeft: "auto" }}/> : <span className="pt-wallet-stat-v">{fmtWalletAmt(stats.added)}</span>}
            </div>
            <div className="pt-wallet-stat">
              <span className="pt-wallet-stat-ico pt-wallet-stat-ico-out"><ArrowUpRight size={13}/></span>
              <span className="pt-wallet-stat-k">Total spent</span>
              {loading ? <span className="pt-skel pt-skel-line" style={{ width: 70, marginLeft: "auto" }}/> : <span className="pt-wallet-stat-v">{fmtWalletAmt(stats.spent)}</span>}
            </div>
          </div>
        </section>
        <section className="pt-panel pt-rise" style={{ animationDelay: "60ms" }}>
          <div className="pt-panel-head">
            <div><h2>RECENT TRANSACTIONS</h2><div className="pt-panel-sub">Top-ups and per-order debits</div></div>
            {!loading && transactions.length > 0 && (
              <div className="pt-wallet-seg" role="tablist">
                {[["all", "All"], ["topup", "Added"], ["debit", "Spent"]].map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={filter === k} className={`pt-wallet-seg-btn${filter === k ? " is-on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
                ))}
              </div>
            )}
          </div>
          {loading ? (
            <div className="pt-wallet-txn-list">
              {[0, 1, 2].map(i => (
                <div key={i} className="pt-wallet-txn">
                  <span className="pt-skel" style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0 }}/>
                  <div className="pt-wallet-txn-meta" style={{ flex: 1 }}>
                    <span className="pt-skel pt-skel-line" style={{ width: "55%" }}/>
                    <span className="pt-skel pt-skel-line" style={{ width: "32%", height: 9, marginTop: 7 }}/>
                  </div>
                  <span className="pt-skel pt-skel-line" style={{ width: 68 }}/>
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="pt-empty">No transactions yet. Top up to start publishing.</div>
          ) : filtered.length === 0 ? (
            <div className="pt-empty">No {filter === "topup" ? "top-ups" : "debits"} in this ledger yet.</div>
          ) : (
            <div className="pt-wallet-txn-list">
              {groups.map((g, gi) => (
                <div className="pt-wallet-day-group" key={g.key}>
                  <div className="pt-wallet-day">
                    <span>{g.label}</span>
                    <span className="pt-wallet-day-net">{g.net >= 0 ? "+" : "−"}{fmtWalletAmt(Math.abs(g.net))}</span>
                  </div>
                  {g.items.map((t, i) => (
                    <div key={t.id} className="pt-wallet-txn pt-rise" style={{ animationDelay: `${Math.min(gi * 2 + i, 10) * 40}ms` }}>
                      <div className={`pt-wallet-txn-icon pt-wallet-txn-icon-${t.type}`}>
                        {t.type === "topup" ? <ArrowDownLeft size={14}/> : <ArrowUpRight size={14}/>}
                      </div>
                      <div className="pt-wallet-txn-meta">
                        <div className="pt-wallet-txn-note">{t.note}</div>
                        <div className="pt-wallet-txn-ts">{new Date(t.ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</div>
                      </div>
                      <div className="pt-wallet-txn-right">
                        <div className={`pt-wallet-txn-amt pt-wallet-txn-amt-${t.type}`}>
                          {t.type === "topup" ? "+" : "−"}{fmtWalletAmt(t.amount)}
                        </div>
                        <WalletInvoiceButton txn={t} tenant={tenantForInvoice} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ₹ with grouped paise — used across the wallet ledger.
function fmtWalletAmt(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Buckets the (newest-first) transaction list into day groups with a
// human label (Today / Yesterday / 7 Jun 2026) and the net flow for the day.
function groupTxnsByDay(txns) {
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const now = new Date();
  const todayKey = dayKey(now);
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const yestKey = dayKey(yest);
  const out = [];
  const index = new Map();
  for (const t of txns) {
    const d = new Date(t.ts);
    const k = dayKey(d);
    let g = index.get(k);
    if (!g) {
      const label = k === todayKey ? "Today" : k === yestKey ? "Yesterday"
        : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      g = { key: k, label, items: [], net: 0 };
      index.set(k, g);
      out.push(g);
    }
    g.items.push(t);
    g.net += t.type === "topup" ? t.amount : -t.amount;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// RECHARGE MODAL — preset tiles + custom amount, Cashfree PG checkout
// ═══════════════════════════════════════════════════════════════════
const RECHARGE_PRESETS = [500, 1000, 2500, 5000, 10000];

// Loads Cashfree's v3 drop-in SDK from their CDN once per session and
// returns an initialised checkout factory. Production mode — these are
// live credentials.
let _cashfreeSDKPromise = null;
function loadCashfreeSDK() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Cashfree) return Promise.resolve(window.Cashfree);
  if (_cashfreeSDKPromise) return _cashfreeSDKPromise;
  _cashfreeSDKPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.async = true;
    s.onload = () => window.Cashfree ? resolve(window.Cashfree) : reject(new Error("Cashfree SDK loaded but global missing"));
    s.onerror = () => reject(new Error("Failed to load Cashfree SDK"));
    document.head.appendChild(s);
  });
  return _cashfreeSDKPromise;
}

function RechargeModal({ balance, onClose, onAdd }) {
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState("UPI");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const effective = custom ? Number(custom) || 0 : amount;
  const gst = Math.round(effective * GST_RATE * 100) / 100;
  const payable = Math.round((effective + gst) * 100) / 100; // GST-inclusive — what's charged + credited
  const canSubmit = effective >= 100 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setErr("");
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("You're signed out — please log in again.");

      // 1) Create order on our server (secret-key call lives there)
      const orderRes = await fetch("/api/cashfree-order", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: payable }),
      });
      const orderJson = await orderRes.json();
      if (!orderRes.ok || !orderJson.payment_session_id) {
        throw new Error(orderJson.error || "Couldn't start Cashfree checkout");
      }

      // 2) Launch Cashfree's drop-in checkout in a modal
      const CashfreeFactory = await loadCashfreeSDK();
      const cashfree = CashfreeFactory({ mode: "production" });
      const result = await cashfree.checkout({
        paymentSessionId: orderJson.payment_session_id,
        redirectTarget: "_modal",
      });
      if (result?.error) throw new Error(result.error.message || "Payment cancelled");

      // 3) Verify with Cashfree (never trust the client) before crediting
      const verifyRes = await fetch("/api/cashfree-verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order_id: orderJson.order_id }),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyJson.error || "Couldn't verify payment");
      if (!verifyJson.paid) {
        throw new Error(`Payment not completed (status: ${verifyJson.status || "unknown"})`);
      }

      onAdd(Number(verifyJson.amount) || effective, `Cashfree · ${method}`);
    } catch (e) {
      setErr(e.message || "Recharge failed");
      setBusy(false);
    }
  };

  return (
    <div className="pt-modal" onClick={onClose}>
      <div className="pt-modal-card pt-modal-card-sm" onClick={e => e.stopPropagation()}>
        <button className="pt-modal-close" onClick={onClose}><X size={18}/></button>
        <div style={{ padding: "28px 28px 0" }}>
          <div className="pt-pd2-eyebrow">RECHARGE WALLET</div>
          <h2 className="pt-pd2-h" style={{ fontSize: 22 }}>Add money to your wallet</h2>
          <p className="pt-pd2-sub" style={{ marginTop: 6 }}>
            Current balance: <strong style={{ color: "var(--pt-text-strong)" }}>₹{balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>. Wallet covers Aviva cost + GST on every order — top up to keep production flowing.
          </p>
        </div>

        <div style={{ padding: "20px 28px 0" }}>
          <div className="pt-pd2-block-h">PICK AN AMOUNT</div>
          <div className="pt-rc-grid">
            {RECHARGE_PRESETS.map(v => (
              <button
                key={v}
                className={`pt-rc-tile ${amount === v && !custom ? "on" : ""}`}
                onClick={() => { setAmount(v); setCustom(""); }}
              >₹{v.toLocaleString("en-IN")}</button>
            ))}
          </div>

          <div className="pt-rc-custom">
            <div className="pt-pd2-block-h" style={{ marginBottom: 6 }}>OR ENTER A CUSTOM AMOUNT</div>
            <div className="pt-price-input">
              <IndianRupee size={12}/>
              <input
                type="number" min="100"
                value={custom}
                onChange={e => setCustom(e.target.value)}
                placeholder="Min ₹100"
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="pt-pd2-block-h" style={{ marginBottom: 6 }}>PAYMENT METHOD</div>
            <div className="pt-rc-methods">
              <button className={`pt-rc-method ${method === "UPI" ? "on" : ""}`} onClick={() => setMethod("UPI")}>
                <Smartphone size={14}/> UPI
              </button>
              <button className={`pt-rc-method ${method === "Card" ? "on" : ""}`} onClick={() => setMethod("Card")}>
                <CreditCard size={14}/> Card
              </button>
              <button className={`pt-rc-method ${method === "Bank" ? "on" : ""}`} onClick={() => setMethod("Bank")}>
                <Wallet size={14}/> Bank
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--pt-text-dim)" }}>
              <Lock size={10} style={{ verticalAlign: "-1px", marginRight: 4 }}/>
              Secured by Cashfree Payments · UPI · Cards · Netbanking · Wallets
            </div>
          </div>

          {effective >= 100 && (
            <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "var(--pt-surface-2, rgba(0,0,0,0.04))", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ color: "var(--pt-text-dim)" }}>Recharge amount</span>
                <span>₹{effective.toLocaleString("en-IN")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ color: "var(--pt-text-dim)" }}>GST (5%)</span>
                <span>₹{gst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid var(--pt-border, rgba(0,0,0,0.12))", paddingTop: 6, marginTop: 6 }}>
                <span>Total payable · credited to wallet</span>
                <span>₹{payable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}

          {err && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(220,38,38,0.08)", color: "#dc2626", fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }}/>
              <span>{err}</span>
            </div>
          )}
        </div>

        <div className="pt-rc-foot">
          <div className="pt-rc-foot-amt">
            <span>You pay</span>
            <strong>₹{payable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="pt-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="pt-btn-primary" onClick={submit} disabled={!canSubmit}>
              {busy ? <><Loader2 className="pt-spin" size={14}/> Processing…</> : <>Pay ₹{payable.toLocaleString("en-IN", { minimumFractionDigits: 2 })} <ArrowRight size={13}/></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TICKETS MODAL — list, thread, new-ticket form
// ═══════════════════════════════════════════════════════════════════
function TicketsModal({ brandProfile, tickets, onClose, onSubmit, onReply, onResolve }) {
  const [view, setView] = useState(tickets.length > 0 ? "list" : "new"); // "list" | "new" | "detail"
  const [activeId, setActiveId] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");

  const active = tickets.find(t => t.id === activeId);

  const submit = () => {
    if (!subject.trim() || !body.trim()) return;
    const t = onSubmit({ subject, body });
    setSubject(""); setBody("");
    setActiveId(t.id); setView("detail");
  };
  const sendReply = () => {
    if (!reply.trim() || !active) return;
    onReply(active.id, reply.trim());
    setReply("");
  };

  return (
    <div className="pt-modal" onClick={onClose}>
      <div className="pt-modal-card pt-modal-card-sm pt-tk-modal" onClick={e => e.stopPropagation()}>
        <button className="pt-modal-close" onClick={onClose}><X size={18}/></button>

        <div className="pt-tk-head">
          <div className="pt-pd2-eyebrow"><LifeBuoy size={11}/> SUPPORT TICKETS</div>
          <h2 className="pt-pd2-h" style={{ fontSize: 22 }}>
            {view === "new" ? "Raise a ticket" : view === "detail" ? (active?.subject || "Ticket") : `${tickets.length} ticket${tickets.length === 1 ? "" : "s"}`}
          </h2>
        </div>

        {view === "list" && (
          <>
            <div className="pt-tk-list">
              {tickets.length === 0 ? (
                <div className="pt-empty" style={{ padding: 28 }}>
                  No tickets yet. Got a question about an order, a design, or your wallet? Drop us a line — or reach us directly:
                  <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                    <a href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer" style={{ color: "var(--pt-accent)" }}>WhatsApp · +91 92177 65507</a>
                    <a href="mailto:avivainternational05@gmail.com" style={{ color: "var(--pt-accent)" }}>Email · avivainternational05@gmail.com</a>
                  </div>
                </div>
              ) : tickets.map(t => (
                <button key={t.id} className="pt-tk-row" onClick={() => { setActiveId(t.id); setView("detail"); }}>
                  <div className="pt-tk-row-meta">
                    <div className="pt-tk-row-subj">{t.subject}</div>
                    <div className="pt-tk-row-ts">
                      {t.messages.length} message{t.messages.length === 1 ? "" : "s"} · {new Date(t.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  <span className={`pt-mp-status-chip pt-mp-status-chip-${t.status === "open" ? "draft" : "live"}`}>
                    {t.status === "open" ? <Circle size={9}/> : <CheckCircle2 size={9}/>}
                    {t.status === "open" ? "OPEN" : "RESOLVED"}
                  </span>
                </button>
              ))}
            </div>
            <div className="pt-tk-foot">
              <button className="pt-btn-primary" onClick={() => setView("new")}>
                <Plus size={13}/> New ticket
              </button>
            </div>
          </>
        )}

        {view === "new" && (
          <>
            <div className="pt-tk-form">
              <label className="pt-field">
                <span>Subject</span>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Order ORD-2849 status"/>
              </label>
              <label className="pt-field">
                <span>What's up?</span>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="Tell us what's going on. We usually reply within an hour during business hours."/>
              </label>
            </div>
            <div className="pt-tk-foot">
              {tickets.length > 0 && <button className="pt-btn-ghost" onClick={() => setView("list")}>← Back</button>}
              <button className="pt-btn-primary" onClick={submit} disabled={!subject.trim() || !body.trim()}>
                <Send size={13}/> Send ticket
              </button>
            </div>
          </>
        )}

        {view === "detail" && active && (
          <>
            <div className="pt-tk-detail">
              <div className="pt-tk-detail-head">
                <span className={`pt-mp-status-chip pt-mp-status-chip-${active.status === "open" ? "draft" : "live"}`}>
                  {active.status === "open" ? <Circle size={9}/> : <CheckCircle2 size={9}/>}
                  {active.status === "open" ? "OPEN" : "RESOLVED"}
                </span>
                <span className="pt-tk-detail-ts">Opened {new Date(active.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <div className="pt-tk-thread">
                {active.messages.map((m, i) => (
                  <div key={i} className={`pt-tk-msg pt-tk-msg-${m.from}`}>
                    <div className="pt-tk-msg-who">{m.from === "client" ? (brandProfile?.fullName?.split(" ")[0] || "You") : "Aviva support"}</div>
                    <div className="pt-tk-msg-body">{m.body}</div>
                    <div className="pt-tk-msg-ts">{new Date(m.at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</div>
                  </div>
                ))}
              </div>
              {active.status === "open" && (
                <div className="pt-tk-reply">
                  <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2} placeholder="Type a reply…"/>
                  <button className="pt-btn-primary pt-btn-sm" onClick={sendReply} disabled={!reply.trim()}>
                    <Send size={11}/> Reply
                  </button>
                </div>
              )}
            </div>
            <div className="pt-tk-foot">
              <button className="pt-btn-ghost" onClick={() => setView("list")}>← All tickets</button>
              {active.status === "open" && (
                <button className="pt-btn-ghost" onClick={() => { onResolve(active.id); }}>
                  <CheckCircle2 size={13}/> Mark resolved
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: SETTINGS
// ═══════════════════════════════════════════════════════════════════
function SettingsPage({ brandProfile, setBrandProfile }) {
  const [draft, setDraft] = useState(brandProfile);
  const [saved, setSaved] = useState(false);
  const save = (e) => {
    e.preventDefault();
    setBrandProfile(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
  };
  return (
    <div className="pt-dash">
      <PageHeader title="Settings" sub="Brand profile, billing, notifications" />
      <form onSubmit={save} className="pt-panel pt-settings">
        <div className="pt-panel-head"><div><h2>BRAND PROFILE</h2><div className="pt-panel-sub">Shown on invoices and store handover</div></div></div>
        <div className="pt-settings-grid">
          <label className="pt-field">
            <span>Brand name</span>
            <input value={draft.brandName} onChange={e => setDraft(d => ({ ...d, brandName: e.target.value }))} />
          </label>
          <label className="pt-field">
            <span>Your full name</span>
            <input value={draft.fullName} onChange={e => setDraft(d => ({ ...d, fullName: e.target.value }))} />
          </label>
          <label className="pt-field">
            <span>Email</span>
            <input value={draft.email} disabled />
          </label>
          <label className="pt-field">
            <span>WhatsApp</span>
            <input value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} />
          </label>
        </div>
        <div className="pt-pd-actions">
          {saved && <div className="pt-alert pt-alert-ok"><CheckCircle2 size={13}/> Saved.</div>}
          <button type="submit" className="pt-btn-primary">Save changes</button>
        </div>
      </form>

      <BillingDetailsPanel />
    </div>
  );
}

// ─── Billing details (GST identity) ────────────────────────────────────
// Reads the bill_to_* columns off the client's tenant row, lets them
// edit, writes back via the update_tenant_billing RPC (which is the only
// path a client has to mutate the tenants table). Lives under Settings
// alongside Brand profile.
//
// Why this exists: the same fields are captured at signup, but clients
// who signed up before that flow shipped (Balleti, NURVEE, Karna,
// Hashway) have empty bill_to_* values and we need an in-portal way for
// them to fill them in — admin shouldn't have to chase each one over
// WhatsApp before the first recharge invoice can render correctly.
function BillingDetailsPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);
  const [saved, setSaved]     = useState(false);
  const [draft, setDraft]     = useState({
    legalName: "",
    gstin:     "",
    address:   "",
    stateCode: "",
    pan:       "",
  });

  // Hydrate from the tenant row on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { tenantId } = await myTenantId();
        const tenant = await fetchTenant(tenantId);
        if (!alive) return;
        setDraft({
          legalName: tenant?.bill_to_legal_name || "",
          gstin:     tenant?.bill_to_gstin     || "",
          address:   tenant?.bill_to_address   || "",
          stateCode: tenant?.bill_to_state_code|| "",
          pan:       tenant?.bill_to_pan       || "",
        });
      } catch (e) {
        if (alive) setError(e.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    try {
      const gstinClean = draft.gstin.trim().toUpperCase();
      if (gstinClean && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(gstinClean)) {
        throw new Error("That GSTIN doesn't look right. Format: 22AAAAA0000A1Z5 (15 characters).");
      }
      if (gstinClean && draft.stateCode && gstinClean.slice(0, 2) !== draft.stateCode) {
        throw new Error(`Your GSTIN starts with ${gstinClean.slice(0, 2)} but you picked state ${draft.stateCode}. Pick the matching state or check the GSTIN.`);
      }
      const stateName = draft.stateCode
        ? (INDIAN_STATES.find(s => s.code === draft.stateCode)?.name || "")
        : "";
      const panClean = draft.pan.trim().toUpperCase();
      if (panClean && !/^[A-Z]{5}\d{4}[A-Z]$/.test(panClean)) {
        throw new Error("PAN doesn't look right. Format: AAAAA0000A (10 characters).");
      }
      await updateTenantBilling({
        legalName: draft.legalName.trim(),
        gstin:     gstinClean,
        address:   draft.address.trim(),
        stateCode: draft.stateCode,
        stateName,
        pan:       panClean,
      });
      // Echo the normalised values back into the form so the user sees
      // exactly what was persisted (e.g. uppercased GSTIN/PAN).
      setDraft(d => ({ ...d, gstin: gstinClean, pan: panClean }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (e2) {
      setError(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="pt-panel pt-settings" style={{ marginTop: 16 }}>
      <div className="pt-panel-head">
        <div>
          <h2>BILLING DETAILS</h2>
          <div className="pt-panel-sub">For tax invoices — GSTIN, legal name and place of supply</div>
        </div>
      </div>
      {loading ? (
        <div className="pt-panel-empty"><Loader2 size={14} className="pt-spin"/> Loading current details…</div>
      ) : (
        <>
          <div className="pt-settings-grid">
            <label className="pt-field" style={{ gridColumn: "1 / -1" }}>
              <span>Legal name / registered business name</span>
              <input
                value={draft.legalName}
                onChange={e => setDraft(d => ({ ...d, legalName: e.target.value }))}
                placeholder="e.g. METACIRCLES TECHNOLOGIES PVT LTD"
                autoComplete="organization"
              />
            </label>
            <label className="pt-field">
              <span>GSTIN <em className="pt-field-opt">(optional — leave blank if not registered)</em></span>
              <input
                value={draft.gstin}
                onChange={e => setDraft(d => ({ ...d, gstin: e.target.value.toUpperCase() }))}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                style={{ textTransform: "uppercase", fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em" }}
              />
            </label>
            <label className="pt-field">
              <span>PAN <em className="pt-field-opt">(optional)</em></span>
              <input
                value={draft.pan}
                onChange={e => setDraft(d => ({ ...d, pan: e.target.value.toUpperCase() }))}
                placeholder="AAAAA0000A"
                maxLength={10}
                style={{ textTransform: "uppercase", fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em" }}
              />
            </label>
            <label className="pt-field" style={{ gridColumn: "1 / -1" }}>
              <span>Billing address</span>
              <textarea
                value={draft.address}
                onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
                placeholder="Full address with city, state, PIN"
                rows={2}
                style={{ resize: "vertical", minHeight: 60, lineHeight: 1.4 }}
              />
            </label>
            <label className="pt-field" style={{ gridColumn: "1 / -1" }}>
              <span>State (place of supply)</span>
              <select
                value={draft.stateCode}
                onChange={e => setDraft(d => ({ ...d, stateCode: e.target.value }))}
              >
                <option value="">Select your state…</option>
                {INDIAN_STATES.map(s => (
                  <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="pt-pd-actions">
            {error && <div className="pt-alert pt-alert-err"><AlertTriangle size={13}/> {error}</div>}
            {saved && <div className="pt-alert pt-alert-ok"><CheckCircle2 size={13}/> Billing details saved.</div>}
            <button type="submit" className="pt-btn-primary" disabled={busy}>
              {busy ? <><Loader2 size={14} className="pt-spin"/> Saving…</> : "Save billing details"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SHARED UI BITS
// ═══════════════════════════════════════════════════════════════════
function PageHeader({ title, sub }) {
  return (
    <div className="pt-page-head">
      <div>
        <h1>{title}</h1>
        <div className="pt-page-sub">{sub}</div>
      </div>
    </div>
  );
}

function KPICard({ label, value, unit, icon: Icon, accent, onClick }) {
  return (
    <button className={`pt-kpi pt-kpi-${accent || ""}`} onClick={onClick}>
      <div className="pt-kpi-icon"><Icon size={16}/></div>
      <div className="pt-kpi-body">
        <div className="pt-kpi-label">{label}</div>
        <div className="pt-kpi-value"><strong>{value}</strong> <span>{unit}</span></div>
      </div>
      <ChevronRight size={14} className="pt-kpi-chev"/>
    </button>
  );
}

// ─── Inline product mockup SVGs ────────────────────────────────────────
// Simple flat illustrations — color comes from prop, optional artwork is
// overlaid on the chest/centre as a translucent rect with the image.
// ─── Garment silhouettes per (shape, view) ─────────────────────────────
// Same body shapes as before; the difference between front and back is
// drawn subtly (no neckline V / no placket / hood reversed). When real
// product photos arrive these get swapped one-for-one.
// ─── ProductMockup — renders the real catalog photo with print zones ──
// Each product carries one back-view product photo (1080×1350) plus a
// thumbnail. The mockup uses a 200×250 viewBox (4:5 to match the photo),
// renders the photo edge-to-edge as the SVG background, then overlays:
//   1. Zone outlines (dashed) — interactive print regions
//   2. User design overlays at each zone, draggable with drag handler
//   3. A faint "BACK VIEW" badge so the visitor knows which side they see
// Catalog cards pass `photo` for static thumbnails (no zones, no overlays).
function ProductMockup({
  photo,                 // /catalog/*.jpg (real product hero photo)
  thumbPhoto,            // optional small variant for thumbnails
  view = "back",         // photos are back views; we honor a `front` toggle by overlaying chest zone position
  designs = null,
  zones = null,
  activeZoneId = null,
  onZoneClick,
  onDragDesign,
  designUrl,             // legacy single-design API (used by some cards)
  small,
  showZones = false,
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  // Legacy single-design path → wrap into the new model.
  const usingLegacy = !designs && designUrl;
  const effectiveDesigns = usingLegacy
    ? { _legacy: { url: designUrl, scale: 0.9, offsetX: 0, offsetY: 0, rotation: 0, flipH: false } }
    : (designs || {});
  const effectiveZones = usingLegacy
    ? [{ id: "_legacy", x: 78, y: 90, w: 44, h: 60 }]
    : (zones || []);

  // Drag positioning — viewBox is 200×250, ratio = 200/css-width.
  useEffect(() => {
    if (!onDragDesign) return;
    const onMove = (e) => {
      if (!dragRef.current || !svgRef.current) return;
      const d = dragRef.current;
      const dx = (e.clientX - d.lastX) * d.ratio;
      const dy = (e.clientY - d.lastY) * d.ratio;
      d.lastX = e.clientX; d.lastY = e.clientY;
      onDragDesign(d.zoneId, dx, dy);
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onDragDesign]);

  const startDrag = (zoneId, e) => {
    if (!onDragDesign || !svgRef.current) return;
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = 200 / rect.width;
    dragRef.current = { zoneId, lastX: e.clientX, lastY: e.clientY, ratio };
  };

  const photoUrl = small ? (thumbPhoto || photo) : photo;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 200 250"
      className="pt-mockup-svg"
      preserveAspectRatio="xMidYMid meet"
      style={{ touchAction: "none", width: "100%", height: "100%", display: "block" }}
    >
      {/* Photo background — fills the viewBox edge-to-edge */}
      {photoUrl && (
        <image
          href={photoUrl}
          x="0" y="0" width="200" height="250"
          preserveAspectRatio="xMidYMid slice"
        />
      )}

      {/* Print zone outline — show ONLY the active zone, in red dashed
          (Unitee-style). Idle / decorated-but-not-active zones stay
          invisible so the mockup feels cleaner. */}
      {!small && showZones && activeZoneId && (() => {
        const z = effectiveZones.find(zz => zz.id === activeZoneId);
        if (!z) return null;
        return (
          <rect
            key={"zr-" + z.id}
            x={z.x} y={z.y} width={z.w} height={z.h}
            fill="transparent"
            stroke="#e53935"
            strokeWidth={1.1}
            strokeDasharray="2 1.5"
            style={{ cursor: "pointer", pointerEvents: "none" }}
          />
        );
      })()}

      {/* Invisible clickable zones for the OTHER (non-active) zones, so
          tapping anywhere on a print area selects it. */}
      {!small && showZones && effectiveZones.map(z => {
        if (activeZoneId === z.id) return null;
        return (
          <rect
            key={"zh-" + z.id}
            x={z.x} y={z.y} width={z.w} height={z.h}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => onZoneClick?.(z.id)}
          />
        );
      })}

      {/* Designs overlaid on the photo */}
      {effectiveZones.map(z => {
        const d = effectiveDesigns[z.id];
        if (!d) return null;
        const scale = d.scale ?? 0.9;
        const w = z.w * scale;
        const h = z.h * scale;
        const x = z.x + (z.w - w) / 2 + (d.offsetX || 0);
        const y = z.y + (z.h - h) / 2 + (d.offsetY || 0);
        const cx = x + w / 2, cy = y + h / 2;
        const transform = `rotate(${d.rotation || 0} ${cx} ${cy})${d.flipH ? ` translate(${2 * cx} 0) scale(-1 1)` : ""}`;
        return (
          <g key={"di-" + z.id} transform={transform}>
            <image
              href={d.url} x={x} y={y} width={w} height={h}
              preserveAspectRatio="xMidYMid meet"
              style={{ cursor: !small && activeZoneId === z.id && onDragDesign ? "move" : "pointer", mixBlendMode: "multiply", opacity: 0.95 }}
              onPointerDown={(e) => { onZoneClick?.(z.id); startDrag(z.id, e); }}
            />
          </g>
        );
      })}

      {/* View badge */}
      {!small && (
        <g transform="translate(8 8)" style={{ pointerEvents: "none" }}>
          <rect x="0" y="0" width="58" height="13" rx="2" fill="rgba(0,0,0,0.65)"/>
          <text x="29" y="9" textAnchor="middle"
            style={{ fontSize: 6.5, fontWeight: 800, letterSpacing: 0.8, fill: "#fff" }}>
            {view === "front" ? "FRONT · APPROX" : "BACK VIEW"}
          </text>
        </g>
      )}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════
const PORTAL_CSS = `
/* ─── Brand palette · Pure monochrome inversion (matches Landing + Catalog)
   Dark mode (default): bg #0a0a0a, text #efefef, accent #efefef (inverse)
   Light mode:          bg #efefef, text #0a0a0a, accent #0a0a0a (inverse)
   No chromatic accent — CTAs are inverted blocks. Semantic colors kept
   for status pills (uploaded/in-production/dispatched/delivered etc). */
:root {
  --pt-bg:           #0a0a0a;          /* page background */
  --pt-bg-elev:      #141414;          /* cards / panels */
  --pt-bg-soft:      #141414;          /* sidebar / nested panels */
  --pt-bg-card:      #161616;          /* cards lifted from background */
  --pt-bg-subtle:    rgba(255,255,255,0.03);
  --pt-text:         #efefef;          /* primary body */
  --pt-text-strong:  #ffffff;          /* headings */
  --pt-text-dim:     #b3b3b3;          /* secondary */
  --pt-text-muted:   #8a8a8a;          /* hints */
  --pt-border:       #262626;
  --pt-border-hover: #3a3a3a;
  --pt-accent:       #4f7bff;          /* electric blue (Unitee palette) */
  --pt-accent-ink:   #ffffff;          /* white text on blue CTA */
  --pt-accent-soft:  rgba(79, 123, 255, 0.14);
  --pt-accent-glow:  rgba(79, 123, 255, 0.32);
  --pt-accent-strong: rgba(79, 123, 255, 0.48);
  --pt-success:      #34D399;          /* emerald-400 (kept for status legibility) */
  --pt-success-glow: rgba(52, 211, 153, 0.20);
  --pt-err:          #FB7185;          /* rose-400 */
  --pt-err-glow:     rgba(251, 113, 133, 0.18);
  --pt-cyan:         #22D3EE;          /* cyan-400 (info) */
  --pt-amber:        #FB923C;          /* orange-400 (warnings) */
  color-scheme: dark;
}
:root[data-theme="light"] {
  --pt-bg:           #efefef;
  --pt-bg-elev:      #ffffff;
  --pt-bg-soft:      #ebebeb;
  --pt-bg-card:      #ffffff;
  --pt-bg-subtle:    rgba(0, 0, 0, 0.03);
  --pt-text:         #2a2a2a;
  --pt-text-strong:  #0a0a0a;
  --pt-text-dim:     #555555;
  --pt-text-muted:   #8a8a8a;
  --pt-border:       #d9d9d9;
  --pt-border-hover: #c4c4c4;
  --pt-accent:       #2c5cff;          /* electric blue (Unitee palette) */
  --pt-accent-ink:   #ffffff;          /* white text on blue CTA */
  --pt-accent-soft:  rgba(44, 92, 255, 0.08);
  --pt-accent-glow:  rgba(44, 92, 255, 0.20);
  --pt-accent-strong: rgba(44, 92, 255, 0.36);
  --pt-success:      #10B981;
  --pt-success-glow: rgba(16, 185, 129, 0.18);
  --pt-err:          #E11D48;
  --pt-err-glow:     rgba(225, 29, 72, 0.14);
  --pt-cyan:         #0891B2;
  --pt-amber:        #EA580C;
  color-scheme: light;
}

html, body {
  overflow-x: clip;
  max-width: 100%;
  -webkit-text-size-adjust: 100%;
}
body { margin: 0; }
.pt-app, .pt-auth, .pt-boot {
  background: var(--pt-bg); color: var(--pt-text);
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}
.pt-app *, .pt-auth *, .pt-boot * { box-sizing: border-box; }
.pt-app a, .pt-auth a { color: inherit; text-decoration: none; }
.pt-spin { animation: pt-spin 0.9s linear infinite; }
@keyframes pt-spin { to { transform: rotate(360deg); } }

/* ─── Boot ─── */
.pt-boot {
  display: grid; place-items: center;
}
.pt-boot-inner {
  display: flex; align-items: center; gap: 10px;
  font-size: 12px; letter-spacing: 0.18em; color: var(--pt-text-dim);
}

/* ─── Auth ─── */
.pt-auth { position: relative; min-height: 100vh; overflow: hidden; }
.pt-auth-bg {
  position: absolute; inset: 0;
  background:
    radial-gradient(circle at 20% 30%, var(--pt-accent-soft), transparent 50%),
    radial-gradient(circle at 80% 70%, var(--pt-accent-soft), transparent 50%);
  pointer-events: none;
}
.pt-auth-nav {
  position: relative; z-index: 2;
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 36px; border-bottom: 1px solid var(--pt-border);
}
.pt-auth-brand {
  display: inline-flex; align-items: center; gap: 10px;
  color: var(--pt-text-strong);
  transition: transform 0.18s ease-out;
}
.pt-auth-brand:hover { transform: translateY(-1px); }
.pt-brand-mark { display: inline-flex; flex-shrink: 0; line-height: 0; }
.pt-brand-mark svg { display: block; filter: drop-shadow(0 4px 10px var(--pt-accent-glow)); }
.pt-brand-wm {
  display: inline-flex; flex-direction: column; line-height: 1; gap: 3px;
}
.pt-brand-name {
  font-weight: 900; letter-spacing: 0.18em; font-size: 13px;
  color: var(--pt-text-strong);
}
.pt-brand-sub {
  font-weight: 600; letter-spacing: 0.18em; font-size: 9px;
  color: var(--pt-text-muted);
}
.pt-auth-nav-right { display: flex; gap: 12px; align-items: center; }
.pt-auth-back { font-size: 11px; letter-spacing: 0.06em; color: var(--pt-text-dim); }
.pt-auth-back:hover { color: var(--pt-text-strong); }

.pt-auth-grid {
  position: relative; z-index: 1;
  display: grid; grid-template-columns: 1fr 1fr;
  min-height: calc(100vh - 73px);
}
.pt-auth-side {
  display: flex; align-items: center; padding: 60px 60px 60px 80px;
  background: linear-gradient(180deg, transparent, var(--pt-accent-soft));
  border-right: 1px solid var(--pt-border);
}
.pt-auth-side-inner { max-width: 480px; }
.pt-auth-eyebrow { font-size: 11px; letter-spacing: 0.22em; font-weight: 700; color: var(--pt-accent); margin-bottom: 18px; }
.pt-auth-h1 { font-size: 38px; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; margin: 0 0 20px 0; color: var(--pt-text-strong); }
.pt-auth-sub { font-size: 16px; color: var(--pt-text-dim); line-height: 1.6; margin: 0 0 28px 0; }
.pt-auth-bullets { list-style: none; padding: 0; margin: 0 0 36px 0; }
.pt-auth-bullets li { display: flex; align-items: center; gap: 10px; font-size: 14px; padding: 8px 0; color: var(--pt-text); }
.pt-auth-bullets li svg { color: var(--pt-success); flex-shrink: 0; }
.pt-auth-trust { display: flex; gap: 32px; padding-top: 24px; border-top: 1px solid var(--pt-border); }
.pt-auth-trust-item strong { display: block; font-size: 22px; font-weight: 800; color: var(--pt-text-strong); }
.pt-auth-trust-item span { font-size: 11px; letter-spacing: 0.08em; color: var(--pt-text-muted); text-transform: uppercase; }

.pt-auth-form-wrap { display: flex; align-items: center; justify-content: center; padding: 40px; }
.pt-auth-form-card {
  width: 100%; max-width: 440px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 18px; padding: 36px;
}
.pt-auth-tabs {
  position: relative;
  display: grid; grid-template-columns: 1fr 1fr; gap: 0;
  background: var(--pt-bg-soft); border-radius: 999px; padding: 4px;
  margin-bottom: 28px;
}
.pt-auth-tab {
  position: relative; z-index: 2;
  background: transparent; border: 0; padding: 10px;
  font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--pt-text-dim); cursor: pointer; transition: color 0.2s;
}
.pt-auth-tab.on { color: var(--pt-text-strong); }
.pt-auth-tab-slider {
  position: absolute; z-index: 1; top: 4px; left: 4px;
  width: calc(50% - 4px); height: calc(100% - 8px);
  background: var(--pt-bg-card); border-radius: 999px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.16);
  transition: transform 0.25s cubic-bezier(.4,0,.2,1);
}
.pt-auth-tab-slider.right { transform: translateX(100%); }
.pt-auth-form-h { font-size: 22px; font-weight: 800; color: var(--pt-text-strong); margin: 0 0 6px 0; letter-spacing: -0.01em; }
.pt-auth-form-sub { font-size: 13px; color: var(--pt-text-dim); margin: 0 0 24px 0; }
.pt-auth-form { display: flex; flex-direction: column; gap: 14px; }
.pt-field { display: flex; flex-direction: column; gap: 6px; }
.pt-field > span { font-size: 11px; letter-spacing: 0.12em; font-weight: 700; color: var(--pt-text-muted); text-transform: uppercase; }
.pt-field-opt {
  font-size: 9px; font-weight: 600; font-style: normal;
  text-transform: none; letter-spacing: 0.02em;
  color: var(--pt-text-dim); margin-left: 4px;
}

/* Signup-only section divider above the billing-details group. */
.pt-auth-section {
  display: flex; align-items: center;
  margin: 8px 0 -2px;
  padding-top: 4px;
  border-top: 1px dashed var(--pt-border);
}
.pt-auth-section-h {
  font-size: 11px; letter-spacing: 0.14em; font-weight: 800;
  color: var(--pt-text-strong);
  text-transform: uppercase;
  padding-top: 8px;
}
.pt-auth-section-sub {
  font-size: 10.5px; font-weight: 500;
  text-transform: none; letter-spacing: 0.02em;
  color: var(--pt-text-dim); margin-left: 4px;
}
.pt-field select {
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  color: var(--pt-text-strong);
  font: inherit; font-size: 13.5px;
  padding: 10px 12px; border-radius: 8px;
  appearance: none;
  -webkit-appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--pt-text-dim) 50%),
                    linear-gradient(135deg, var(--pt-text-dim) 50%, transparent 50%);
  background-position: calc(100% - 16px) center, calc(100% - 11px) center;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  padding-right: 32px;
  cursor: pointer;
}
.pt-field select:focus { outline: none; border-color: var(--pt-text-strong); }
.pt-field input, .pt-field textarea {
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  color: var(--pt-text); padding: 11px 13px;
  border-radius: 10px; font-size: 14px; font-family: inherit;
  transition: border-color 0.15s, background 0.15s;
}
.pt-field input:focus, .pt-field textarea:focus {
  outline: none; border-color: var(--pt-accent); background: var(--pt-bg-elev);
}
.pt-field input:disabled { opacity: 0.5; cursor: not-allowed; }
.pt-field textarea { resize: vertical; min-height: 70px; }
.pt-field-inline > span { margin-bottom: 4px; }

/* Password input with show/hide eye toggle */
.pt-password-input {
  position: relative;
  display: flex; align-items: center;
}
.pt-password-input input {
  flex: 1; padding-right: 38px !important;
}
.pt-password-toggle {
  position: absolute; right: 8px;
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: 0; border-radius: 6px;
  color: var(--pt-text-muted); cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.pt-password-toggle:hover { color: var(--pt-text-strong); background: var(--pt-bg-card); }

.pt-btn-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--pt-accent); color: var(--pt-accent-ink);
  border: 1px solid var(--pt-accent);
  padding: 12px 18px; border-radius: 10px;
  font-size: 13px; font-weight: 700; letter-spacing: 0.04em;
  cursor: pointer; transition: all 0.15s;
}
.pt-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 24px var(--pt-accent-glow); }
.pt-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.pt-btn-secondary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--pt-bg-soft); color: var(--pt-text);
  border: 1px solid var(--pt-border);
  padding: 12px 18px; border-radius: 10px;
  font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s;
}
.pt-btn-secondary:hover:not(:disabled) { border-color: var(--pt-border-hover); background: var(--pt-bg-elev); }
.pt-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.pt-btn-ghost {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; color: var(--pt-text-dim);
  border: 1px solid var(--pt-border);
  padding: 8px 12px; border-radius: 8px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  cursor: pointer; transition: all 0.15s;
}
.pt-btn-ghost:hover:not(:disabled) { color: var(--pt-text-strong); border-color: var(--pt-border-hover); }
.pt-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.pt-btn-sm { padding: 7px 11px; font-size: 11px; }
.pt-link-btn {
  background: transparent; border: 0; color: var(--pt-accent);
  font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px;
}
.pt-link-btn:hover { text-decoration: underline; }
.pt-auth-switch {
  text-align: center; padding-top: 16px;
  font-size: 13px; color: var(--pt-text-dim);
}
.pt-auth-switch button {
  background: transparent; border: 0; color: var(--pt-accent);
  font-weight: 700; cursor: pointer; padding: 0 4px;
}
.pt-auth-switch button:hover { text-decoration: underline; }
.pt-auth-helper {
  margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--pt-border);
  font-size: 11.5px; color: var(--pt-text-muted); line-height: 1.55;
  text-align: center;
}
.pt-auth-helper strong { color: var(--pt-text-dim); font-weight: 600; }

/* ─── OTP entry ─── */
.pt-otp-back {
  display: inline-flex; align-items: center; gap: 4px;
  background: transparent; border: 0; padding: 4px 2px;
  color: var(--pt-text-muted); font-size: 12px; cursor: pointer;
  transition: color 0.15s;
}
.pt-otp-back:hover:not(:disabled) { color: var(--pt-text-strong); }
.pt-otp-back:disabled { opacity: 0.5; cursor: not-allowed; }
.pt-otp-row {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px;
  margin-top: 24px;
}
.pt-otp-box {
  width: 100%; aspect-ratio: 1; min-height: 0;
  background: var(--pt-bg-soft); border: 1.5px solid var(--pt-border);
  border-radius: 10px; color: var(--pt-text-strong);
  font-size: 22px; font-weight: 700; font-family: ui-monospace, "SF Mono", Consolas, monospace;
  text-align: center; outline: none;
  transition: border-color 0.15s, background 0.15s, transform 0.1s;
}
.pt-otp-box:focus { border-color: var(--pt-accent); background: var(--pt-bg-elev); transform: scale(1.03); }
.pt-otp-box:disabled { opacity: 0.6; cursor: not-allowed; }
.pt-otp-submit { width: 100%; margin-top: 18px; }
.pt-otp-resend {
  margin-top: 14px; text-align: center;
  font-size: 12.5px; color: var(--pt-text-dim);
}
.pt-otp-resend button {
  background: transparent; border: 0; color: var(--pt-accent);
  font-weight: 700; cursor: pointer; padding: 0 2px;
}
.pt-otp-resend button:hover:not(:disabled) { text-decoration: underline; }
.pt-otp-resend button:disabled { opacity: 0.5; cursor: not-allowed; }
.pt-otp-cooldown { color: var(--pt-text-muted); font-weight: 600; }
@media (max-width: 420px) {
  .pt-otp-row { gap: 6px; }
  .pt-otp-box { font-size: 18px; }
}

.pt-alert {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 8px;
  font-size: 12.5px; line-height: 1.5;
}
.pt-alert-err { background: var(--pt-err-glow); color: var(--pt-err); border: 1px solid var(--pt-err); }
.pt-alert-ok  { background: var(--pt-success-glow); color: var(--pt-success); border: 1px solid var(--pt-success); }

@media (max-width: 980px) {
  .pt-auth-grid { grid-template-columns: 1fr; }
  .pt-auth-side { display: none; }
  .pt-auth-form-wrap { padding: 24px 16px; }
}

/* ─── App shell ─── */
.pt-app { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; overflow-x: clip; max-width: 100vw; }
.pt-auth, .pt-boot { overflow-x: clip; max-width: 100vw; }
.pt-sidebar {
  background: var(--pt-bg-elev); border-right: 1px solid var(--pt-border);
  display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh;
}
/* ── Mobile drawer plumbing ──────────────────────────────────────
   Below 880 px the sidebar becomes a slide-in drawer. The hamburger
   in the topbar opens it; the backdrop + Escape + page change closes
   it. The desktop layout (grid-template-columns: 240px 1fr) collapses
   to a single column so the main content takes the full viewport. */
.pt-sidebar-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  opacity: 0; pointer-events: none;
  z-index: 90;
  transition: opacity 0.22s ease-out;
}
.pt-sidebar-close {
  display: none;          /* CSS-hidden on desktop */
  margin-left: auto;
  width: 32px; height: 32px;
  border-radius: 8px;
  border: 1px solid var(--pt-border);
  background: transparent;
  color: var(--pt-text-dim);
  align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.pt-sidebar-close:hover { color: var(--pt-text-strong); border-color: var(--pt-text-strong); }
.pt-burger {
  display: none;          /* CSS-hidden on desktop */
  width: 38px; height: 38px;
  border-radius: 8px;
  border: 1px solid var(--pt-border);
  background: transparent;
  color: var(--pt-text-strong);
  align-items: center; justify-content: center;
  cursor: pointer;
}
.pt-burger:hover { border-color: var(--pt-text-strong); }
.pt-logo {
  display: flex; align-items: center; gap: 12px;
  padding: 20px 18px; border-bottom: 1px solid var(--pt-border);
}
.pt-logo-mark {
  width: 32px; height: 32px;
  display: grid; place-items: center;
  filter: drop-shadow(0 4px 10px var(--pt-accent-glow));
}
.pt-logo-mark svg { display: block; }
.pt-logo-name { font-weight: 800; font-size: 13px; letter-spacing: 0.08em; color: var(--pt-text-strong); }
.pt-logo-name .pt-dot { color: var(--pt-accent); }
.pt-logo-sub { font-size: 10px; letter-spacing: 0.12em; color: var(--pt-text-muted); margin-top: 2px; }

.pt-nav { flex: 1; overflow-y: auto; padding: 12px 10px; display: flex; flex-direction: column; gap: 2px; }
.pt-nav-item {
  display: flex; align-items: center; gap: 11px;
  padding: 9px 12px; border-radius: 8px;
  background: transparent; border: 0;
  color: var(--pt-text-dim); font-size: 12.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em;
  cursor: pointer; transition: all 0.12s;
  text-align: left;
}
.pt-nav-item:hover { background: var(--pt-bg-soft); color: var(--pt-text); }
.pt-nav-item.active { background: var(--pt-accent-soft); color: var(--pt-text-strong); }
.pt-nav-item.active svg { color: var(--pt-accent); }
.pt-nav-item > span { flex: 1; }
.pt-nav-badge {
  background: var(--pt-bg-soft); color: var(--pt-text-dim);
  font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px;
}
.pt-nav-item.active .pt-nav-badge { background: var(--pt-accent); color: var(--pt-accent-ink); }
.pt-nav-chev { color: var(--pt-accent); }

.pt-sidebar-foot {
  border-top: 1px solid var(--pt-border);
  padding: 14px;
}
.pt-foot-stats {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  padding-bottom: 12px; margin-bottom: 12px;
  border-bottom: 1px solid var(--pt-border);
}
.pt-foot-stats > div { text-align: center; }
.pt-foot-stats strong { display: block; font-size: 16px; font-weight: 800; color: var(--pt-text-strong); }
.pt-foot-stats span { font-size: 10px; letter-spacing: 0.08em; color: var(--pt-text-muted); text-transform: uppercase; }
.pt-foot-user { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.pt-foot-avatar {
  width: 30px; height: 30px; border-radius: 8px;
  background: var(--pt-accent); color: var(--pt-accent-ink);
  display: grid; place-items: center;
  font-size: 11px; font-weight: 800; letter-spacing: 0.04em;
  flex-shrink: 0;
}
.pt-foot-name { font-size: 12px; font-weight: 700; color: var(--pt-text-strong); }
.pt-foot-sub { font-size: 10px; color: var(--pt-text-muted); letter-spacing: 0.04em; }
.pt-foot-contact { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; padding-top: 8px; border-top: 1px dashed var(--pt-border); }
.pt-foot-contact a { font-size: 10.5px; color: var(--pt-text-muted); text-decoration: none; letter-spacing: 0.02em; transition: color 0.15s ease; }
.pt-foot-contact a:hover { color: var(--pt-accent); }
.pt-foot-logout { width: 100%; justify-content: center; }

.pt-main { display: flex; flex-direction: column; min-width: 0; }
.pt-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 24px; border-bottom: 1px solid var(--pt-border);
  background: var(--pt-bg-elev);
  position: sticky; top: 0; z-index: 40;
  transition: transform 0.34s cubic-bezier(.4,0,.2,1), box-shadow 0.2s ease;
  will-change: transform;
}
.pt-topbar.is-scrolled { box-shadow: 0 6px 22px rgba(0,0,0,0.22); }
.pt-topbar.is-hidden { transform: translateY(-100%); }
.pt-topbar-logo { display: inline-flex; align-items: center; line-height: 0; flex-shrink: 0; }
.pt-topbar-logo img { height: 22px; width: auto; display: block; }
.pt-topbar-logo:hover { opacity: 0.82; }
.pt-topbar-left {
  display: flex; align-items: center; gap: 14px;
}
.pt-date-chip {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 11px; letter-spacing: 0.06em; color: var(--pt-text-dim);
  padding: 6px 10px; border: 1px solid var(--pt-border); border-radius: 999px;
}
.pt-topbar-right { display: flex; align-items: center; gap: 12px; }
.pt-presence { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--pt-text-dim); }
.pt-pulse {
  width: 7px; height: 7px; border-radius: 999px;
  background: var(--pt-success);
  box-shadow: 0 0 0 0 var(--pt-success-glow);
  animation: pt-pulse 1.8s infinite;
}
@keyframes pt-pulse {
  0%   { box-shadow: 0 0 0 0 var(--pt-success-glow); }
  70%  { box-shadow: 0 0 0 8px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.pt-theme-btn {
  width: 32px; height: 32px; border-radius: 8px;
  background: transparent; border: 1px solid var(--pt-border); color: var(--pt-text-dim);
  display: grid; place-items: center; cursor: pointer; transition: all 0.15s;
}
.pt-theme-btn:hover { color: var(--pt-text-strong); border-color: var(--pt-border-hover); }

/* ─── Wallet balance pill in the top bar ─── */
.pt-wallet-pill {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  padding: 5px 6px 5px 10px; border-radius: 999px;
  font-family: ui-monospace, "JetBrains Mono", monospace;
}
.pt-wallet-pill-icon { display: inline-flex; color: var(--pt-text-dim); }
.pt-wallet-pill-amt {
  font-size: 13px; font-weight: 800; color: var(--pt-text-strong);
  letter-spacing: -0.01em;
}
/* Pill colour swings amber under ₹500, red when overdrawn. */
.pt-wallet-pill-amt.is-low      { color: var(--pt-amber, #FB923C); }
.pt-wallet-pill-amt.is-negative { color: var(--pt-err,   #ef4444); }

/* ── Wallet-state banner ── shows on every Portal page below ₹500. The
   .pt-wallet-alert-danger / .pt-wallet-alert-warn modifiers flip the
   palette between red (overdrawn) and amber (low). */
.pt-wallet-alert {
  margin: 14px 22px 0;
  padding: 14px 18px;
  border-radius: 12px;
  display: flex; align-items: center; gap: 18px;
  justify-content: space-between;
  flex-wrap: wrap;
  animation: pt-wallet-alert-in 220ms ease-out;
}
.pt-wallet-alert-danger {
  background: var(--pt-err-glow, rgba(239,68,68,0.10));
  border: 1px solid var(--pt-err, #ef4444);
  border-left: 4px solid var(--pt-err, #ef4444);
}
.pt-wallet-alert-warn {
  background: color-mix(in srgb, var(--pt-amber, #FB923C) 12%, transparent);
  border: 1px solid var(--pt-amber, #FB923C);
  border-left: 4px solid var(--pt-amber, #FB923C);
}
@keyframes pt-wallet-alert-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.pt-wallet-alert-l {
  display: flex; align-items: flex-start; gap: 12px;
  min-width: 0;
}
.pt-wallet-alert-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  border-radius: 999px;
  color: #fff;
  flex-shrink: 0;
}
.pt-wallet-alert-danger .pt-wallet-alert-icon {
  background: var(--pt-err, #ef4444);
  animation: pt-wallet-alert-pulse-danger 1.8s ease-in-out infinite;
}
.pt-wallet-alert-warn .pt-wallet-alert-icon {
  background: var(--pt-amber, #FB923C);
  animation: pt-wallet-alert-pulse-warn 2.4s ease-in-out infinite;
}
@keyframes pt-wallet-alert-pulse-danger {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
  50%      { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
}
@keyframes pt-wallet-alert-pulse-warn {
  0%, 100% { box-shadow: 0 0 0 0 rgba(251,146,60,0.45); }
  50%      { box-shadow: 0 0 0 7px rgba(251,146,60,0); }
}
.pt-wallet-alert-h {
  font-size: 14px; font-weight: 800;
  letter-spacing: -0.01em;
  margin-bottom: 2px;
}
.pt-wallet-alert-danger .pt-wallet-alert-h { color: var(--pt-err, #ef4444); }
.pt-wallet-alert-warn   .pt-wallet-alert-h { color: var(--pt-amber, #FB923C); }
.pt-wallet-alert-p {
  font-size: 12.5px; line-height: 1.45;
  color: var(--pt-text);
}
.pt-wallet-alert-p b { color: var(--pt-text-strong); font-weight: 800; }
.pt-wallet-alert-cta {
  display: inline-flex; align-items: center; gap: 6px;
  color: #fff;
  border: 0;
  padding: 10px 18px;
  border-radius: 999px;
  font: inherit;
  font-size: 12.5px; font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
  flex-shrink: 0;
}
.pt-wallet-alert-danger .pt-wallet-alert-cta {
  background: var(--pt-err, #ef4444);
  box-shadow: 0 6px 18px rgba(239,68,68,0.30);
}
.pt-wallet-alert-warn .pt-wallet-alert-cta {
  background: var(--pt-amber, #FB923C);
  color: var(--pt-bg, #0a0a0a);
  box-shadow: 0 6px 18px rgba(251,146,60,0.30);
}
.pt-wallet-alert-cta:hover {
  transform: translateY(-1px);
  filter: brightness(1.06);
}
.pt-wallet-alert-danger .pt-wallet-alert-cta:hover { box-shadow: 0 10px 24px rgba(239,68,68,0.40); }
.pt-wallet-alert-warn   .pt-wallet-alert-cta:hover { box-shadow: 0 10px 24px rgba(251,146,60,0.40); }
@media (max-width: 720px) {
  .pt-wallet-alert { margin: 12px 14px 0; padding: 12px 14px; gap: 12px; }
  .pt-wallet-alert-cta { width: 100%; justify-content: center; }
}
.pt-wallet-pill-refresh {
  width: 22px; height: 22px; border-radius: 999px;
  background: transparent; border: 0; color: var(--pt-text-muted);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.18s;
}
.pt-wallet-pill-refresh:hover { color: var(--pt-text-strong); background: var(--pt-bg-card); }
.pt-wallet-pill-refresh.spinning svg { animation: pt-spin 0.7s ease-in-out; }

/* ─── Recharge / Tickets buttons in the top bar ─── */
.pt-topbar-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--pt-accent); color: var(--pt-accent-ink);
  border: 1px solid var(--pt-accent); border-radius: 999px;
  padding: 7px 14px; font-size: 12px; font-weight: 800; letter-spacing: 0.02em;
  cursor: pointer; transition: all 0.15s; font-family: inherit;
  position: relative;
}
.pt-topbar-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 18px var(--pt-accent-glow); }
.pt-topbar-btn-recharge { /* primary tone */ }
.pt-topbar-btn-tickets {
  background: var(--pt-bg-card); color: var(--pt-text); border-color: var(--pt-border);
}
.pt-topbar-btn-tickets:hover {
  background: var(--pt-bg-elev); border-color: var(--pt-border-hover);
  box-shadow: none; transform: translateY(-1px);
}
.pt-topbar-btn-badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 16px; height: 16px; padding: 0 4px;
  background: var(--pt-err); color: #fff;
  border: 2px solid var(--pt-bg-elev);
  border-radius: 999px;
  font-size: 9px; font-weight: 800; letter-spacing: 0;
  display: inline-flex; align-items: center; justify-content: center;
}

/* ── Mobile shell ── below 880 px: drawer sidebar, single column, tighter paddings */
@media (max-width: 880px) {
  .pt-app { grid-template-columns: 1fr; }
  .pt-sidebar {
    position: fixed; top: 0; left: 0; bottom: 0;
    width: min(82vw, 300px);
    z-index: 100;
    transform: translateX(-102%);
    transition: transform 0.26s cubic-bezier(.4,0,.2,1);
    box-shadow: 18px 0 50px rgba(0,0,0,0.35);
  }
  .pt-sidebar.is-open { transform: translateX(0); }
  .pt-sidebar-backdrop.is-open { opacity: 1; pointer-events: auto; }
  .pt-sidebar-close { display: inline-flex; }
  .pt-burger { display: inline-flex; }
  /* Hide the long date chip on mobile — burger + the wallet pill on
     the right are enough chrome for a phone width. */
  .pt-date-chip { display: none; }
  /* Tighter page padding on phones — the current 28px 32px eats
     half the viewport on a 360 px device. */
  .pt-page { padding: 16px 14px; }
  .pt-topbar { padding: 10px 14px; }
  .pt-topbar-left { gap: 10px; }
  .pt-topbar-right { gap: 8px; }
}

@media (max-width: 720px) {
  .pt-wallet-pill-amt { font-size: 11.5px; }
  .pt-topbar-btn span { display: none; }   /* show only icon on narrow screens */
  .pt-topbar-btn { padding: 7px 9px; }
}

/* ─── Recharge modal ─── */
.pt-rc-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
  margin-top: 10px;
}
.pt-rc-tile {
  background: var(--pt-bg-soft); border: 1.5px solid var(--pt-border);
  color: var(--pt-text-strong); border-radius: 10px;
  padding: 12px 8px;
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 14px; font-weight: 800;
  cursor: pointer; transition: all 0.15s;
}
.pt-rc-tile:hover { border-color: var(--pt-border-hover); }
.pt-rc-tile.on { border-color: var(--pt-accent); background: var(--pt-accent-soft); color: var(--pt-accent); }
.pt-rc-custom { margin-top: 16px; }
.pt-rc-methods { display: flex; gap: 8px; flex-wrap: wrap; }
.pt-rc-method {
  flex: 1; min-width: 100px;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--pt-bg-soft); border: 1.5px solid var(--pt-border);
  color: var(--pt-text); border-radius: 10px;
  padding: 10px 12px; cursor: pointer; transition: all 0.15s;
  font-family: inherit; font-size: 12.5px; font-weight: 700;
}
.pt-rc-method:hover { border-color: var(--pt-border-hover); }
.pt-rc-method.on { border-color: var(--pt-accent); background: var(--pt-accent-soft); color: var(--pt-accent); }
.pt-rc-foot {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 22px; padding: 18px 28px;
  background: var(--pt-bg-soft); border-top: 1px solid var(--pt-border);
  border-radius: 0 0 18px 18px;
}
.pt-rc-foot-amt {
  display: flex; flex-direction: column;
}
.pt-rc-foot-amt span {
  font-family: ui-monospace, monospace;
  font-size: 9.5px; letter-spacing: 0.16em; font-weight: 800;
  color: var(--pt-text-muted); text-transform: uppercase;
}
.pt-rc-foot-amt strong {
  font-size: 22px; font-weight: 800; color: var(--pt-text-strong);
  letter-spacing: -0.02em;
}

/* ─── Tickets modal ─── */
.pt-tk-modal { max-width: 540px; max-height: 80vh; display: flex; flex-direction: column; padding: 0; }
.pt-tk-head { padding: 28px 28px 14px; border-bottom: 1px solid var(--pt-border); }
.pt-tk-head .pt-pd2-eyebrow { display: inline-flex; align-items: center; gap: 6px; }
.pt-tk-list { flex: 1; overflow-y: auto; padding: 14px 14px 0; display: flex; flex-direction: column; gap: 6px; }
.pt-tk-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  border-radius: 10px; padding: 12px 14px;
  cursor: pointer; transition: all 0.15s;
  color: var(--pt-text); font-family: inherit; text-align: left;
}
.pt-tk-row:hover { border-color: var(--pt-border-hover); background: var(--pt-bg-card); }
.pt-tk-row-meta { flex: 1; min-width: 0; }
.pt-tk-row-subj { font-size: 13px; font-weight: 700; color: var(--pt-text-strong); margin-bottom: 3px; }
.pt-tk-row-ts { font-size: 11px; color: var(--pt-text-muted); }

.pt-tk-form { padding: 20px 28px; display: flex; flex-direction: column; gap: 14px; }
.pt-tk-foot {
  display: flex; gap: 10px; justify-content: space-between; align-items: center;
  padding: 16px 28px;
  background: var(--pt-bg-soft); border-top: 1px solid var(--pt-border);
  border-radius: 0 0 18px 18px;
}
.pt-tk-foot > button:only-child { margin-left: auto; }

.pt-tk-detail { flex: 1; overflow-y: auto; padding: 18px 28px; display: flex; flex-direction: column; gap: 12px; }
.pt-tk-detail-head { display: flex; align-items: center; justify-content: space-between; }
.pt-tk-detail-ts { font-size: 11px; color: var(--pt-text-muted); }
.pt-tk-thread { display: flex; flex-direction: column; gap: 10px; }
.pt-tk-msg {
  padding: 10px 14px; border-radius: 12px; max-width: 86%;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
}
.pt-tk-msg-client { align-self: flex-end; background: var(--pt-accent-soft); border-color: color-mix(in srgb, var(--pt-accent) 30%, transparent); }
.pt-tk-msg-who { font-size: 10.5px; letter-spacing: 0.08em; font-weight: 800; color: var(--pt-text-muted); text-transform: uppercase; margin-bottom: 4px; }
.pt-tk-msg-body { font-size: 13px; color: var(--pt-text); line-height: 1.5; white-space: pre-wrap; }
.pt-tk-msg-ts { font-size: 10px; color: var(--pt-text-muted); margin-top: 4px; }
.pt-tk-reply {
  display: flex; gap: 8px; padding-top: 8px; border-top: 1px dashed var(--pt-border);
}
.pt-tk-reply textarea {
  flex: 1; resize: vertical; min-height: 50px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  color: var(--pt-text); padding: 8px 12px;
  border-radius: 8px; font-size: 13px; font-family: inherit;
}

/* ─── Wallet page transactions list ─── */
.pt-wallet-txn-list { display: flex; flex-direction: column; gap: 2px; }
.pt-wallet-txn {
  display: grid; grid-template-columns: 32px 1fr auto; align-items: center; gap: 12px;
  padding: 9px 14px; border-radius: 10px;
  transition: background 0.12s, box-shadow 0.12s;
  position: relative;
}
.pt-wallet-txn:hover { background: var(--pt-bg-soft); }
.pt-wallet-txn-icon {
  width: 32px; height: 32px; border-radius: 9px;
  display: grid; place-items: center;
}
.pt-wallet-txn-icon-topup { background: var(--pt-success-glow); color: var(--pt-success); }
.pt-wallet-txn-icon-debit { background: var(--pt-err-glow); color: var(--pt-err); }
.pt-wallet-txn-meta { min-width: 0; }
.pt-wallet-txn-note {
  font-size: 13px; font-weight: 700; color: var(--pt-text-strong);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pt-wallet-txn-ts { font-size: 11px; color: var(--pt-text-muted); margin-top: 1px; }
.pt-wallet-txn-right {
  display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
  flex-shrink: 0;
}
.pt-wallet-txn-amt {
  font-size: 14px; font-weight: 800; letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums; font-feature-settings: "tnum";
  white-space: nowrap;
}
.pt-wallet-txn-amt-topup { color: var(--pt-success); }
.pt-wallet-txn-amt-debit { color: var(--pt-err); }

/* Inline invoice download button — sits to the right of each topup row. */
.pt-wallet-invoice-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid var(--pt-border);
  background: transparent;
  color: var(--pt-text);
  font: inherit;
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  flex-shrink: 0;
}
.pt-wallet-invoice-btn:hover:not(:disabled) {
  border-color: var(--pt-text-strong);
  color: var(--pt-text-strong);
  background: var(--pt-bg-soft);
}
.pt-wallet-invoice-btn:disabled { opacity: 0.55; cursor: not-allowed; }

/* ─── Recent orders list (overview) ───
   Code + status chip share the top line, meta sits below — keeps long
   "N labels · N pieces · date" strings from squeezing the chip and
   wrapping into a 3-line mess on narrow screens. */
.pt-ord-list { display: flex; flex-direction: column; gap: 2px; }
.pt-ord {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 11px 12px; border-radius: 12px;
  background: transparent; border: 1px solid transparent;
  text-align: left; cursor: pointer; color: var(--pt-text);
  transition: background 0.14s, border-color 0.14s;
}
.pt-ord:hover { background: var(--pt-bg-soft); border-color: var(--pt-border); }
.pt-ord-icon {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: grid; place-items: center;
  background: var(--pt-accent-soft); color: var(--pt-accent);
}
.pt-ord-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.pt-ord-row1 { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; row-gap: 5px; }
.pt-ord-code {
  font-size: 13.5px; font-weight: 800; color: var(--pt-text-strong); letter-spacing: -0.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.pt-ord-row1 > span:last-child { margin-left: auto; flex-shrink: 0; }
.pt-ord-meta {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  font-size: 11.5px; color: var(--pt-text-muted);
  font-variant-numeric: tabular-nums; font-feature-settings: "tnum";
}
.pt-ord-dot { opacity: 0.5; }
.pt-ord-chev { color: var(--pt-text-muted); flex-shrink: 0; transition: color 0.14s, transform 0.14s; }
.pt-ord:hover .pt-ord-chev { color: var(--pt-text); transform: translateX(2px); }

/* ─── Orders — accordion cards (replaces the wide table; tap a card to
   open its shipments + tracking. Fully fluid so nothing overflows a
   phone screen). ─── */
.pt-ordc-list { display: flex; flex-direction: column; gap: 10px; }
.pt-ordc {
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 14px; overflow: hidden; transition: border-color 0.15s;
}
.pt-ordc.is-open { border-color: var(--pt-border-hover); }
.pt-ordc-head {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 14px 16px; background: transparent; border: 0; cursor: pointer;
  text-align: left; color: var(--pt-text); transition: background 0.14s;
}
.pt-ordc-head:hover { background: var(--pt-bg-soft); }
.pt-ordc-main { flex: 1; min-width: 0; }
.pt-ordc-code {
  font-size: 15px; font-weight: 800; color: var(--pt-text-strong); letter-spacing: -0.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pt-ordc-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
  margin-top: 3px; font-size: 11.5px; color: var(--pt-text-muted);
  font-variant-numeric: tabular-nums; font-feature-settings: "tnum";
}
.pt-ordc-dot { opacity: 0.5; }
.pt-ordc-aside { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.pt-ordc-chev { color: var(--pt-text-muted); transition: transform 0.22s ease; }
.pt-ordc.is-open .pt-ordc-chev { transform: rotate(180deg); color: var(--pt-text); }

.pt-ordc-body {
  border-top: 1px solid var(--pt-border);
  padding: 14px 16px; background: var(--pt-bg-subtle);
  animation: pt-ordc-open 0.22s ease-out;
}
@keyframes pt-ordc-open { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.pt-ordc-body-head {
  font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--pt-text-muted); font-weight: 800; margin-bottom: 10px;
}
.pt-ordc-body-head .lc { text-transform: none; letter-spacing: 0; font-weight: 500; }

.pt-ship-list { display: flex; flex-direction: column; gap: 8px; }
.pt-ship {
  border: 1px solid var(--pt-border); border-radius: 11px;
  padding: 11px 12px; background: var(--pt-bg-elev);
}
.pt-ship-top {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; margin-bottom: 9px;
}
.pt-ship-ref {
  font-family: ui-monospace, monospace; font-size: 12.5px; font-weight: 700;
  color: var(--pt-text-strong); min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pt-ship-rows { display: flex; flex-direction: column; gap: 7px; }
.pt-ship-row { display: flex; gap: 12px; align-items: baseline; font-size: 12.5px; }
.pt-ship-k {
  flex-shrink: 0; width: 60px;
  color: var(--pt-text-muted); font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase; padding-top: 1px;
}
.pt-ship-v { flex: 1; min-width: 0; color: var(--pt-text); overflow-wrap: anywhere; }
.pt-ship-v a { color: var(--pt-accent); text-decoration: none; font-family: ui-monospace, monospace; }
.pt-ship-v a:hover { text-decoration: underline; }
.pt-ship-amt { font-family: ui-monospace, monospace; font-weight: 700; color: var(--pt-text-strong); }
.pt-ship-total {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 2px; padding: 11px 12px 2px;
  border-top: 1px dashed var(--pt-border);
  font-size: 13px; font-weight: 800; color: var(--pt-text-strong);
}

.pt-page { flex: 1; padding: 28px 32px; overflow-y: auto; }

/* ─── Page header ─── */
.pt-dash { max-width: 1280px; margin: 0 auto; }
.pt-page-head { margin-bottom: 22px; }
.pt-page-head h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.01em; margin: 0 0 4px 0; color: var(--pt-text-strong); }
.pt-page-sub { font-size: 13px; color: var(--pt-text-dim); }
.pt-mt { margin-top: 18px; }
.pt-two-col { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; }

/* ─── Panels ─── */
.pt-panel { background: var(--pt-bg-elev); border: 1px solid var(--pt-border); border-radius: 14px; padding: 22px; }
.pt-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.pt-panel-head h2 { font-size: 12px; font-weight: 800; letter-spacing: 0.18em; color: var(--pt-text-strong); margin: 0 0 4px 0; }
.pt-panel-sub { font-size: 11px; color: var(--pt-text-muted); letter-spacing: 0.04em; }
.pt-empty { font-size: 13px; color: var(--pt-text-muted); padding: 18px; text-align: center; }

/* ─── KPI ─── */
.pt-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.pt-kpi-grid.pt-kpi-grid-wide { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }

/* ── Pickup follow-up alert (amber-toned card) ─────────────────── */
.pt-pickup-alert {
  display: flex; align-items: center; justify-content: space-between; gap: 18px;
  padding: 16px 18px;
  background: color-mix(in srgb, #f59e0b 12%, var(--pt-bg-elev, var(--pt-bg)));
  border: 1px solid color-mix(in srgb, #f59e0b 40%, transparent);
  border-radius: 14px;
  flex-wrap: wrap;
}
.pt-pickup-alert-l {
  display: flex; gap: 14px; align-items: flex-start; min-width: 0; flex: 1 1 380px;
}
.pt-pickup-alert-icon {
  flex-shrink: 0;
  width: 36px; height: 36px; border-radius: 999px;
  background: color-mix(in srgb, #f59e0b 22%, transparent);
  color: #f59e0b;
  display: inline-flex; align-items: center; justify-content: center;
}
.pt-pickup-alert-body { min-width: 0; }
.pt-pickup-alert-h {
  font-size: 14.5px; font-weight: 800; color: var(--pt-text-strong);
  margin-bottom: 3px;
}
.pt-pickup-alert-sub {
  font-size: 12.5px; color: var(--pt-text-dim); line-height: 1.5;
}
.pt-pickup-alert-sub strong { color: var(--pt-text-strong); font-weight: 700; }
.pt-pickup-alert-tags {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px;
}
.pt-pickup-alert-tag {
  font-family: ui-monospace, "SF Mono", monospace;
  font-size: 11px; font-weight: 700;
  padding: 3px 8px; border-radius: 6px;
  background: color-mix(in srgb, #f59e0b 14%, transparent);
  color: var(--pt-text-strong);
  border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
}
.pt-pickup-alert-tag-more {
  background: transparent;
  color: var(--pt-text-dim);
  border-color: color-mix(in srgb, var(--pt-text) 14%, transparent);
}
.pt-pickup-alert-cta {
  display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap;
}
.pt-pickup-alert-cta .pt-btn-primary {
  display: inline-flex; align-items: center; gap: 6px;
  background: #f59e0b; color: #000;
  border: none; padding: 8px 14px; border-radius: 8px;
  font-size: 12px; font-weight: 700; letter-spacing: 0.04em;
  text-decoration: none; cursor: pointer;
}
.pt-pickup-alert-cta .pt-btn-primary:hover { filter: brightness(1.08); }
.pt-pickup-alert-cta .pt-btn-ghost {
  background: transparent;
  border: 1px solid color-mix(in srgb, #f59e0b 35%, transparent);
  color: var(--pt-text);
  padding: 8px 14px; border-radius: 8px;
  font-size: 12px; font-weight: 600; cursor: pointer;
}
.pt-pickup-alert-cta .pt-btn-ghost:hover {
  background: color-mix(in srgb, #f59e0b 10%, transparent);
}
@media (max-width: 600px) {
  .pt-pickup-alert { flex-direction: column; align-items: stretch; }
  .pt-pickup-alert-cta { width: 100%; }
  .pt-pickup-alert-cta a, .pt-pickup-alert-cta button { flex: 1; justify-content: center; }
}
.pt-kpi {
  display: flex; align-items: center; gap: 14px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 14px; padding: 18px;
  cursor: pointer; transition: all 0.15s;
  text-align: left;
}
.pt-kpi:hover { border-color: var(--pt-border-hover); transform: translateY(-1px); }
.pt-kpi-icon {
  width: 38px; height: 38px; border-radius: 10px;
  display: grid; place-items: center;
  background: var(--pt-accent-soft); color: var(--pt-accent);
  flex-shrink: 0;
}
.pt-kpi-yellow .pt-kpi-icon { background: var(--pt-accent-soft); color: var(--pt-accent); }
.pt-kpi-green  .pt-kpi-icon { background: var(--pt-success-glow); color: var(--pt-success); }
.pt-kpi-cyan   .pt-kpi-icon { background: rgba(56, 189, 248, 0.12); color: var(--pt-cyan); }
.pt-kpi-amber  .pt-kpi-icon { background: rgba(251, 191, 36, 0.10); color: var(--pt-amber); }
.pt-kpi-body { flex: 1; min-width: 0; }
.pt-kpi-label { font-size: 11px; letter-spacing: 0.08em; color: var(--pt-text-muted); text-transform: uppercase; margin-bottom: 4px; }
.pt-kpi-value strong { font-size: 22px; font-weight: 800; color: var(--pt-text-strong); }
.pt-kpi-value span   { font-size: 11px; letter-spacing: 0.04em; color: var(--pt-text-muted); margin-left: 6px; }
.pt-kpi-chev { color: var(--pt-text-muted); }

/* ─── Checklist ─── */
.pt-checklist { display: flex; flex-direction: column; gap: 4px; }
.pt-check-row {
  display: flex; align-items: center; gap: 14px;
  background: transparent; border: 1px solid var(--pt-border);
  border-radius: 10px; padding: 14px 16px;
  cursor: pointer; transition: all 0.15s; text-align: left;
  color: var(--pt-text);
}
.pt-check-row:hover { background: var(--pt-bg-soft); border-color: var(--pt-border-hover); }
.pt-check-icon { color: var(--pt-text-muted); flex-shrink: 0; }
.pt-check-row.done .pt-check-icon { color: var(--pt-success); }
.pt-check-row.done .pt-check-label { color: var(--pt-text-muted); text-decoration: line-through; }
.pt-check-text { flex: 1; }
.pt-check-step { font-size: 10px; letter-spacing: 0.16em; color: var(--pt-text-muted); margin-bottom: 2px; }
.pt-check-label { font-size: 14px; font-weight: 600; color: var(--pt-text-strong); }

/* ─── Quick actions ─── */
.pt-qa-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pt-qa {
  display: flex; align-items: center; gap: 12px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  border-radius: 10px; padding: 14px;
  cursor: pointer; transition: all 0.15s; text-align: left;
  color: var(--pt-text);
}
.pt-qa:hover { background: var(--pt-bg-card); border-color: var(--pt-accent); }
.pt-qa > svg { color: var(--pt-accent); flex-shrink: 0; }
.pt-qa > div { flex: 1; min-width: 0; }
.pt-qa-h { font-size: 13px; font-weight: 700; color: var(--pt-text-strong); }
.pt-qa-p { font-size: 11px; color: var(--pt-text-muted); margin-top: 2px; }

.pt-roadmap { list-style: none; padding: 0; margin: 0; }
.pt-roadmap li {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0; border-bottom: 1px solid var(--pt-border);
  font-size: 13px; color: var(--pt-text);
}
.pt-roadmap li:last-child { border-bottom: 0; }
.pt-roadmap li svg { color: var(--pt-accent); flex-shrink: 0; }

/* ─── Catalog ─── */
.pt-cat-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
}
.pt-search {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 999px; padding: 8px 14px;
  min-width: 280px;
}
.pt-search:focus-within { border-color: var(--pt-accent); }
.pt-search svg { color: var(--pt-text-muted); }
.pt-search input {
  background: transparent; border: 0; outline: none;
  color: var(--pt-text); font-size: 13px; font-family: inherit; width: 100%;
}
.pt-cat-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.pt-cat-pill {
  background: transparent; border: 1px solid var(--pt-border);
  color: var(--pt-text-dim); border-radius: 999px;
  padding: 7px 13px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  cursor: pointer; transition: all 0.15s;
}
.pt-cat-pill:hover { border-color: var(--pt-border-hover); color: var(--pt-text); }
.pt-cat-pill.on { background: var(--pt-accent); color: var(--pt-accent-ink); border-color: var(--pt-accent); }

.pt-cat-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;
}
.pt-cat-card {
  display: flex; flex-direction: column; gap: 0;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 14px; overflow: hidden;
  cursor: pointer; transition: all 0.15s; text-align: left;
  color: var(--pt-text);
}
.pt-cat-card:hover { border-color: var(--pt-accent); transform: translateY(-2px); box-shadow: 0 14px 32px rgba(0,0,0,0.12); }
.pt-cat-img {
  position: relative; aspect-ratio: 4/5;
  /* Soft theme-aware studio backdrop — subtle radial vignette so the
     transparent cutout has presence without competing with the card. */
  background:
    radial-gradient(60% 50% at 50% 40%, var(--pt-bg-card), var(--pt-bg-soft) 75%, var(--pt-bg-elev));
  display: block;
  border-bottom: 1px solid var(--pt-border);
  overflow: hidden;
}
:root[data-theme="light"] .pt-cat-img {
  background:
    radial-gradient(60% 50% at 50% 40%, #fafaf7, #f1efe8 70%, #e7e5dd);
}
.pt-cat-photo {
  width: 100%; height: 100%; display: block;
  object-fit: contain; object-position: center;
  padding: 14px;
  transition: transform 0.45s cubic-bezier(.21,.61,.35,1);
  filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.35));
}
:root[data-theme="light"] .pt-cat-photo {
  filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.12));
}
.pt-cat-card:hover .pt-cat-photo { transform: scale(1.05) translateY(-2px); }
.pt-cat-chip {
  position: absolute; top: 10px; left: 10px;
  font-size: 9.5px; letter-spacing: 0.14em; font-weight: 800;
  padding: 4px 9px; border-radius: 4px;
  background: rgba(0,0,0,0.65); border: 1px solid rgba(255,255,255,0.10);
  color: var(--pt-accent); text-transform: uppercase;
  font-family: ui-monospace, "JetBrains Mono", monospace;
}
.pt-cat-pricepill {
  position: absolute; top: 10px; right: 10px;
  display: inline-flex; align-items: baseline; gap: 6px;
  padding: 5px 10px; border-radius: 4px;
  background: rgba(0,0,0,0.75); border: 1px solid rgba(251,146,60,0.45);
  font-family: ui-monospace, "JetBrains Mono", monospace;
}
.pt-cat-pricepill-l { font-size: 9px; letter-spacing: 0.14em; color: var(--pt-text-dim); font-weight: 700; }
.pt-cat-pricepill-v { font-size: 14px; color: var(--pt-accent); font-weight: 800; letter-spacing: -0.01em; }

.pt-cat-body { padding: 16px 16px 12px; }
.pt-cat-name { font-size: 15px; font-weight: 700; color: var(--pt-text-strong); margin-bottom: 4px; letter-spacing: -0.01em; }
.pt-cat-fabric { font-size: 11.5px; color: var(--pt-text-muted); margin-bottom: 14px; line-height: 1.5; }
.pt-cat-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.pt-cat-price { display: flex; flex-direction: column; gap: 2px; }
.pt-cat-from {
  font-family: ui-monospace, monospace;
  font-size: 9.5px; letter-spacing: 0.06em; color: var(--pt-text-muted);
}
.pt-cat-price strong { font-size: 19px; font-weight: 800; color: var(--pt-text-strong); letter-spacing: -0.02em; }
.pt-cat-price strong small { font-size: 11px; color: var(--pt-text-muted); margin-left: 2px; font-weight: 600; }
.pt-cat-mrp {
  font-family: ui-monospace, monospace;
  font-size: 9.5px; letter-spacing: 0.04em; color: var(--pt-text-muted);
}
.pt-cat-meta { display: flex; flex-direction: column; gap: 4px; }
.pt-cat-meta-line {
  font-family: ui-monospace, monospace;
  font-size: 10.5px; letter-spacing: 0.04em; color: var(--pt-text-dim); font-weight: 600;
}
.pt-cat-meta-quote {
  display: inline-block; align-self: flex-start;
  font-family: ui-monospace, monospace;
  font-size: 9.5px; letter-spacing: 0.12em; font-weight: 800;
  color: var(--pt-accent);
  padding: 3px 8px; border-radius: 999px;
  background: var(--pt-accent-soft);
  border: 1px solid color-mix(in srgb, var(--pt-accent) 22%, transparent);
  text-transform: uppercase;
}
.pt-pd-margin-quote .pt-pd-margin-row strong { color: var(--pt-text-dim) !important; font-weight: 600; }
.pt-pd-margin-note {
  font-size: 11px; color: var(--pt-text-muted); line-height: 1.45;
  margin-top: 8px; padding-top: 8px;
  border-top: 1px dashed var(--pt-border);
}
.pt-cat-swatches { display: flex; gap: 5px; align-items: center; }
.pt-swatch {
  width: 16px; height: 16px; border-radius: 999px;
  border: 1px solid var(--pt-border);
}
.pt-swatch-more { font-size: 10px; color: var(--pt-text-muted); align-self: center; }
.pt-cat-specs {
  display: flex; gap: 14px;
  padding-top: 10px; border-top: 1px dashed var(--pt-border);
  font-size: 11px; color: var(--pt-text-muted);
}
.pt-cat-specs strong { color: var(--pt-text); font-weight: 700; }
.pt-cat-cta {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--pt-border);
  font-size: 11px; font-weight: 800; letter-spacing: 0.10em; color: var(--pt-accent);
  text-transform: uppercase;
  transition: background 0.15s;
}
.pt-cat-card:hover .pt-cat-cta { background: var(--pt-accent-soft); }

/* Order terms callout */
.pt-cat-terms {
  margin-top: 28px;
  background: var(--pt-bg-soft);
}
.pt-cat-terms-head {
  display: flex; align-items: baseline; justify-content: space-between;
  flex-wrap: wrap; gap: 8px; margin-bottom: 18px;
}
.pt-cat-terms-tag {
  font-family: ui-monospace, monospace;
  font-size: 10.5px; letter-spacing: 0.16em; font-weight: 800;
  color: var(--pt-accent); text-transform: uppercase;
}
.pt-cat-terms-sub { font-size: 11px; color: var(--pt-text-muted); }
.pt-cat-terms-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.pt-cat-terms-row {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 14px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 10px;
}
.pt-cat-terms-no {
  font-family: ui-monospace, monospace;
  font-size: 12px; font-weight: 800; color: var(--pt-accent);
  letter-spacing: 0.06em;
}
.pt-cat-terms-k { font-size: 12px; font-weight: 700; color: var(--pt-text-strong); margin-bottom: 4px; }
.pt-cat-terms-v { font-size: 12px; color: var(--pt-text-dim); line-height: 1.5; }
@media (max-width: 760px) {
  .pt-cat-terms-grid { grid-template-columns: 1fr; }
}

/* Product detail — photo mockup, spec strip, warning banner */
.pt-pd-mockup-photo {
  aspect-ratio: 4/5;
  background:
    radial-gradient(55% 45% at 50% 38%, var(--pt-bg-card), var(--pt-bg-soft) 70%, var(--pt-bg-elev));
  padding: 0; overflow: hidden;
  position: relative;
}
:root[data-theme="light"] .pt-pd-mockup-photo {
  background: radial-gradient(55% 45% at 50% 38%, #fafaf7, #f1efe8 70%, #e7e5dd);
}
.pt-pd-mockup-photo::after {
  /* Soft ellipse "shadow on the floor" for the floating tee */
  content: "";
  position: absolute; left: 18%; right: 18%; bottom: 8%;
  height: 22px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(0,0,0,0.45), transparent);
  filter: blur(6px);
  pointer-events: none;
}
:root[data-theme="light"] .pt-pd-mockup-photo::after {
  background: radial-gradient(closest-side, rgba(0,0,0,0.18), transparent);
}
.pt-pd-mockup-photo .pt-mockup-svg { width: 100%; height: 100%; }
.pt-pd-spec-strip {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
  background: var(--pt-border);
  border: 1px solid var(--pt-border);
  border-radius: 10px; overflow: hidden;
  margin-bottom: 18px;
}
.pt-pd-spec {
  background: var(--pt-bg-soft);
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 2px;
}
.pt-pd-spec span {
  font-family: ui-monospace, monospace;
  font-size: 9px; letter-spacing: 0.14em; font-weight: 700;
  color: var(--pt-text-muted); text-transform: uppercase;
}
.pt-pd-spec strong { font-size: 12px; color: var(--pt-text-strong); font-weight: 700; }
.pt-pd-warning {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 12px; border-radius: 8px;
  background: rgba(251,146,60,0.08);
  border: 1px solid rgba(251,146,60,0.30);
  font-size: 12px; color: var(--pt-text);
  margin-bottom: 18px;
}
.pt-pd-warning svg { color: var(--pt-accent); margin-top: 2px; flex-shrink: 0; }

/* Color thumb buttons (swatches instead of mini-mockups) */
.pt-pd-thumb-swatch {
  flex-direction: row !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 6px 10px 6px 6px !important;
}
.pt-pd-thumb-color {
  width: 28px; height: 28px; border-radius: 6px;
  border: 1px solid var(--pt-border);
  flex-shrink: 0;
}
.pt-pd-thumb-swatch span { font-size: 11px !important; color: var(--pt-text) !important; }
.pt-pd-thumb-swatch.on { border-color: var(--pt-accent); }
.pt-pd-thumb-swatch.on .pt-pd-thumb-color { box-shadow: 0 0 0 2px var(--pt-accent); }

/* ─── Product detail modal ─── */
.pt-modal {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
  display: grid; place-items: center; padding: 24px;
  animation: pt-fade 0.18s ease-out;
}
@keyframes pt-fade { from { opacity: 0; } to { opacity: 1; } }
.pt-modal-card {
  position: relative;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 18px; max-width: 1100px; width: 100%;
  max-height: calc(100vh - 48px); overflow-y: auto;
  animation: pt-pop 0.22s cubic-bezier(.4,0,.2,1);
}
@keyframes pt-pop { from { transform: translateY(20px) scale(0.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
.pt-modal-card-sm { max-width: 480px; padding: 36px; }
.pt-modal-close {
  position: absolute; top: 16px; right: 16px; z-index: 2;
  width: 36px; height: 36px; border-radius: 999px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border); color: var(--pt-text-dim);
  display: grid; place-items: center; cursor: pointer; transition: all 0.15s;
}
.pt-modal-close:hover { color: var(--pt-text-strong); border-color: var(--pt-border-hover); }
.pt-pd-grid { display: grid; grid-template-columns: 1.05fr 1fr; min-height: 540px; }
.pt-modal-card-wide { max-width: 1240px; }
.pt-modal-card-xl { max-width: 1480px; }

/* ═══════════════════════════════════════════════════════════════════
   ADD PRODUCTS — multi-row table modal
   ═══════════════════════════════════════════════════════════════════ */
.pt-ap-modal {
  display: flex; flex-direction: column;
  max-width: 1320px;
  max-height: calc(100vh - 48px);
  overflow: hidden;
}
.pt-ap-head {
  padding: 28px 32px 18px;
  border-bottom: 1px solid var(--pt-border);
}
.pt-ap-eyebrow {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10.5px; letter-spacing: 0.18em; font-weight: 800;
  color: var(--pt-accent); margin-bottom: 6px;
}
.pt-ap-h {
  font-size: 24px; font-weight: 800; color: var(--pt-text-strong);
  margin: 0 0 8px 0; letter-spacing: -0.02em;
}
.pt-ap-sub {
  font-size: 13px; color: var(--pt-text-dim); line-height: 1.55;
  margin: 0; max-width: 720px;
}

/* Card-based add-products layout — each product is its own panel so
   we can fit a variable-length designs list inside without forcing a
   wide horizontal table. */
.pt-ap-cards {
  flex: 1; overflow: auto;
  padding: 20px 28px;
  display: flex; flex-direction: column; gap: 16px;
}
.pt-ap-card {
  background: var(--pt-bg-soft);
  border: 1.5px solid var(--pt-border);
  border-radius: 14px;
  padding: 18px 20px;
  display: flex; flex-direction: column; gap: 18px;
  transition: border-color 0.15s;
}
.pt-ap-card.ok { border-color: color-mix(in srgb, var(--pt-success) 30%, var(--pt-border)); }
.pt-ap-card-head {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 4px;
  border-bottom: 1px dashed var(--pt-border);
}
.pt-ap-card-no {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.18em; font-weight: 800;
  color: var(--pt-accent); text-transform: uppercase;
}
.pt-ap-card-ok {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: ui-monospace, monospace;
  font-size: 9.5px; letter-spacing: 0.14em; font-weight: 800;
  padding: 3px 8px; border-radius: 4px;
  background: var(--pt-success-glow); color: var(--pt-success);
  border: 1px solid color-mix(in srgb, var(--pt-success) 36%, transparent);
}
.pt-ap-card-x {
  margin-left: auto;
  width: 28px; height: 28px; border-radius: 6px;
  background: transparent; border: 1px solid var(--pt-border);
  color: var(--pt-text-muted); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.pt-ap-card-x:hover:not(:disabled) {
  background: color-mix(in srgb, var(--pt-err) 14%, transparent);
  color: var(--pt-err); border-color: var(--pt-err);
}
.pt-ap-card-x:disabled { opacity: 0.4; cursor: not-allowed; }

.pt-ap-card-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr 0.8fr;
  gap: 14px;
}
.pt-ap-cell {
  display: flex; flex-direction: column; gap: 6px;
  min-width: 0;
}
.pt-ap-cell-wide { grid-column: span 2; }
.pt-ap-cell-full { grid-column: 1 / -1; }
.pt-ap-cell-l {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.14em; font-weight: 800;
  color: var(--pt-text-muted); text-transform: uppercase;
}
@media (max-width: 880px) {
  .pt-ap-card-grid { grid-template-columns: 1fr; }
  .pt-ap-cell-wide, .pt-ap-cell-full { grid-column: span 1; }
}

/* Designs section inside a product card */
.pt-ap-designs {
  display: flex; flex-direction: column; gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--pt-border);
}
.pt-ap-designs-h {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}
.pt-ap-designs-hint {
  font-size: 11px; color: var(--pt-text-muted);
}
.pt-ap-design-list { display: flex; flex-direction: column; gap: 6px; }
.pt-ap-design-row {
  display: grid;
  grid-template-columns: 48px 1fr 86px 14px 86px 32px;
  gap: 10px; align-items: center;
  padding: 8px 12px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 10px;
}
.pt-ap-design-thumb {
  width: 48px; height: 48px; border-radius: 6px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  overflow: hidden;
}
.pt-ap-design-thumb img { width: 100%; height: 100%; object-fit: contain; }
.pt-ap-design-meta { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pt-ap-design-name {
  font-size: 12.5px; font-weight: 700; color: var(--pt-text-strong);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pt-ap-design-size { font-size: 11px; color: var(--pt-text-muted); }

.pt-ap-dim { display: flex; flex-direction: column; gap: 3px; }
.pt-ap-dim > span {
  font-family: ui-monospace, monospace;
  font-size: 9.5px; letter-spacing: 0.10em; font-weight: 700;
  color: var(--pt-text-muted); text-transform: uppercase;
}
.pt-ap-dim > input {
  width: 100%;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  color: var(--pt-text); padding: 6px 8px;
  border-radius: 6px; font-size: 12px; font-family: inherit;
  font-variant-numeric: tabular-nums;
  box-sizing: border-box;
}
.pt-ap-dim > input:focus { outline: none; border-color: var(--pt-accent); }
.pt-ap-dim-x { color: var(--pt-text-muted); text-align: center; font-size: 13px; }

.pt-ap-add-design {
  display: inline-flex; align-self: flex-start;
  align-items: center; gap: 6px;
  background: var(--pt-bg-elev); border: 1.5px dashed var(--pt-border);
  color: var(--pt-text); border-radius: 8px;
  padding: 8px 14px; cursor: pointer; transition: all 0.15s;
  font-family: inherit; font-size: 12px; font-weight: 700;
}
.pt-ap-add-design:hover:not(:disabled) {
  border-color: var(--pt-accent); color: var(--pt-accent);
  background: var(--pt-accent-soft);
}
.pt-ap-add-design:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 720px) {
  .pt-ap-design-row {
    grid-template-columns: 40px 1fr 1fr;
    grid-template-rows: auto auto;
    gap: 8px;
  }
  .pt-ap-design-thumb { width: 40px; height: 40px; }
  .pt-ap-design-meta { grid-column: 2 / 4; }
  .pt-ap-dim-x { display: none; }
  .pt-ap-remove { grid-column: 3; justify-self: end; }
}

.pt-ap-input {
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  color: var(--pt-text); padding: 9px 11px;
  border-radius: 8px; font-size: 13px; font-family: inherit;
  width: 100%; box-sizing: border-box;
}
.pt-ap-input:focus { outline: none; border-color: var(--pt-accent); }
.pt-ap-input::placeholder { color: var(--pt-text-muted); }
.pt-ap-input-num { font-variant-numeric: tabular-nums; }

.pt-ap-price-cell, .pt-ap-link-cell, .pt-ap-select-cell {
  position: relative;
}
.pt-ap-price-cell svg, .pt-ap-link-cell svg, .pt-ap-select-cell svg {
  position: absolute; left: 18px; top: 50%; transform: translateY(-50%);
  color: var(--pt-text-muted); pointer-events: none;
  z-index: 1;
}
.pt-ap-price-cell .pt-ap-input, .pt-ap-link-cell .pt-ap-input, .pt-ap-select-cell .pt-ap-input {
  padding-left: 30px;
}

/* Native select styled to match other inputs */
.pt-ap-select {
  appearance: none; -webkit-appearance: none;
  background: var(--pt-bg-elev) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2.5' stroke-linecap='round'><path d='M6 9l6 6 6-6'/></svg>") no-repeat right 10px center;
  background-size: 12px;
  padding-right: 28px;
  cursor: pointer;
}
.pt-ap-select:focus { outline: none; border-color: var(--pt-accent); }

/* Selling-price column gets a tiny "Aviva cost" annotation below */
.pt-ap-price-stack {
  display: flex; flex-direction: column; gap: 4px;
}
.pt-ap-price-hint {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 9.5px; letter-spacing: 0.08em; color: var(--pt-text-muted);
  padding-left: 2px;
}

.pt-ap-sizes {
  display: flex; flex-wrap: wrap; gap: 3px;
}
.pt-ap-size {
  min-width: 30px; padding: 5px 7px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  color: var(--pt-text); border-radius: 6px;
  font-size: 10.5px; font-weight: 700; cursor: pointer; transition: all 0.12s;
  font-family: inherit;
}
.pt-ap-size:hover { border-color: var(--pt-border-hover); }
.pt-ap-size.on {
  background: var(--pt-accent); color: var(--pt-accent-ink); border-color: var(--pt-accent);
}

.pt-ap-remove {
  width: 26px; height: 26px;
  background: transparent; border: 1px solid transparent;
  color: var(--pt-text-muted); border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s;
}
.pt-ap-remove:hover:not(:disabled) {
  background: color-mix(in srgb, var(--pt-err) 14%, transparent);
  color: var(--pt-err); border-color: var(--pt-err);
}
.pt-ap-remove:disabled { opacity: 0.3; cursor: not-allowed; }

.pt-ap-addrow {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 1.5px dashed var(--pt-border);
  color: var(--pt-text-dim); border-radius: 8px;
  padding: 10px 14px; cursor: pointer; transition: all 0.15s;
  font-family: inherit; font-size: 12.5px; font-weight: 700;
  align-self: flex-start;
}
.pt-ap-addrow:hover { border-color: var(--pt-accent); color: var(--pt-accent); background: var(--pt-accent-soft); }

.pt-ap-foot {
  display: flex; align-items: center; justify-content: space-between;
  gap: 14px; flex-wrap: wrap;
  padding: 18px 32px;
  border-top: 1px solid var(--pt-border);
  background: var(--pt-bg-elev);
}
.pt-ap-foot-hint {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--pt-text-muted);
}
.pt-ap-foot-hint svg { color: var(--pt-accent); flex-shrink: 0; }
.pt-ap-foot-actions { display: inline-flex; gap: 10px; align-items: center; }
.pt-ap-save { min-width: 200px; }

@media (max-width: 980px) {
  .pt-ap-head { padding: 20px 18px 14px; }
  .pt-ap-table-wrap { padding: 14px; }
  .pt-ap-foot { padding: 14px 18px; }
}

/* ═══════════════════════════════════════════════════════════════════
   MY PRODUCTS table view (replaces the old card grid)
   ═══════════════════════════════════════════════════════════════════ */
.pt-mp-table-wrap { padding: 0; }
.pt-mp-table {
  width: 100%; border-collapse: collapse;
  font-size: 13px;
}
.pt-mp-table thead th {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.14em; font-weight: 800;
  color: var(--pt-text-muted); text-transform: uppercase;
  text-align: left; padding: 14px 18px;
  background: var(--pt-bg-elev);
  border-bottom: 1px solid var(--pt-border);
  white-space: nowrap;
}
.pt-mp-table tbody td {
  padding: 14px 18px;
  border-bottom: 1px solid var(--pt-border);
  vertical-align: middle;
}
.pt-mp-table tbody tr:last-child td { border-bottom: 0; }
.pt-mp-table tbody tr:hover td { background: var(--pt-bg-soft); }
.pt-mp-link {
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--pt-accent); font-weight: 700;
  border-bottom: 1px solid transparent;
}
.pt-mp-link:hover { border-bottom-color: var(--pt-accent); }
.pt-mp-empty { color: var(--pt-text-muted); }
.pt-mp-sizes { display: flex; gap: 4px; flex-wrap: wrap; }
.pt-mp-size-chip {
  font-family: ui-monospace, monospace;
  font-size: 10px; letter-spacing: 0.04em; font-weight: 700;
  padding: 2px 7px; border-radius: 4px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  color: var(--pt-text);
}
.pt-mp-status-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10px; font-weight: 800; letter-spacing: 0.12em;
  padding: 4px 10px; border-radius: 999px;
}
.pt-mp-status-chip-live  { background: var(--pt-success-glow); color: var(--pt-success); border: 1px solid var(--pt-success); }
.pt-mp-status-chip-draft { background: var(--pt-bg-elev); color: var(--pt-text-muted); border: 1px solid var(--pt-border); }
.pt-mp-row-x {
  width: 28px; height: 28px; border-radius: 6px;
  background: transparent; border: 1px solid transparent;
  color: var(--pt-text-muted); cursor: pointer; transition: all 0.15s;
  display: inline-flex; align-items: center; justify-content: center;
}
.pt-mp-row-x:hover {
  background: color-mix(in srgb, var(--pt-err) 14%, transparent);
  color: var(--pt-err); border-color: var(--pt-err);
}

/* ═══════════════════════════════════════════════════════════════════
   MY PRODUCTS — card grid (with multi-design gallery)
   ═══════════════════════════════════════════════════════════════════ */
.pt-mp-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
}
.pt-mp-card-v2 {
  background: var(--pt-bg-elev);
  border: 1px solid var(--pt-border);
  border-radius: 12px;
  padding: 18px;
  display: flex; flex-direction: column; gap: 12px;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.pt-mp-card-v2:hover {
  border-color: color-mix(in srgb, var(--pt-accent) 50%, var(--pt-border));
  box-shadow: 0 6px 24px -12px color-mix(in srgb, var(--pt-accent) 35%, transparent);
}
.pt-mp-card-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 10px;
}
.pt-mp-card-title {
  display: flex; flex-direction: column; gap: 2px;
  min-width: 0;
}
.pt-mp-card-title strong {
  font-size: 15px; font-weight: 700;
  color: var(--pt-text-strong);
  line-height: 1.3;
  word-break: break-word;
}
.pt-mp-card-blank {
  font-size: 11px; color: var(--pt-text-muted);
  font-family: ui-monospace, "JetBrains Mono", monospace;
  letter-spacing: 0.02em;
}
.pt-mp-card-meta {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 6px;
  font-size: 12px; color: var(--pt-text-muted);
}
.pt-mp-card-meta strong {
  color: var(--pt-text); font-weight: 700;
}
.pt-mp-card-dot {
  color: var(--pt-text-faint);
  font-weight: 700;
}
.pt-mp-card-sizes {
  font-family: ui-monospace, monospace;
  font-size: 10.5px; letter-spacing: 0.04em;
  color: var(--pt-text);
  padding: 2px 8px; border-radius: 4px;
  background: var(--pt-bg-soft);
  border: 1px solid var(--pt-border);
}

.pt-mp-designs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  gap: 8px;
  padding-top: 4px;
  border-top: 1px dashed var(--pt-border);
}
.pt-mp-design {
  display: flex; flex-direction: column; gap: 4px;
  text-decoration: none;
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.15s;
}
.pt-mp-design:hover { transform: translateY(-2px); }
.pt-mp-design-thumb {
  width: 100%; aspect-ratio: 1;
  background: var(--pt-bg-soft);
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.pt-mp-design-thumb img {
  width: 100%; height: 100%;
  object-fit: contain;
  background: repeating-conic-gradient(var(--pt-bg-soft) 0% 25%, var(--pt-bg-elev) 0% 50%) 50% / 12px 12px;
}
.pt-mp-design-info {
  display: flex; flex-direction: column; gap: 2px;
  padding: 0 2px;
}
.pt-mp-design-name {
  font-size: 10.5px; font-weight: 600;
  color: var(--pt-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pt-mp-design-dims {
  font-family: ui-monospace, monospace;
  font-size: 10px; letter-spacing: 0.02em;
  color: var(--pt-text-muted);
  display: inline-flex; align-items: center; gap: 3px;
}
.pt-mp-design-dims svg { color: var(--pt-accent); }

.pt-mp-card-empty {
  padding: 12px;
  border: 1px dashed var(--pt-border);
  border-radius: 8px;
  text-align: center;
  font-size: 12px; color: var(--pt-text-muted);
  background: var(--pt-bg-soft);
}
.pt-mp-card-foot {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--pt-border);
}

/* ═══════════════════════════════════════════════════════════════════
   PRODUCT DETAIL — Unitee-style 3-column layout
   ═══════════════════════════════════════════════════════════════════ */
.pt-pd2-header {
  padding: 28px 32px 18px;
  border-bottom: 1px solid var(--pt-border);
}
.pt-pd2-eyebrow {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10.5px; letter-spacing: 0.18em; font-weight: 800;
  color: var(--pt-accent); margin-bottom: 6px;
}
.pt-pd2-h {
  font-size: 26px; font-weight: 800; color: var(--pt-text-strong);
  margin: 0; letter-spacing: -0.02em;
}
.pt-pd2-warning { margin: 14px 32px 0; }

.pt-pd2-grid {
  display: grid;
  grid-template-columns: 340px 1fr 340px;
  gap: 0;
  min-height: 660px;
}

/* ─── LEFT column · CREATE DESIGN form ─── */
.pt-pd2-form {
  padding: 24px 24px 28px;
  background: var(--pt-bg-soft);
  border-right: 1px solid var(--pt-border);
  display: flex; flex-direction: column; gap: 18px;
  overflow-y: auto;
}
.pt-pd2-section-title {
  font-size: 18px; font-weight: 800; color: var(--pt-text-strong);
  letter-spacing: -0.01em;
}
.pt-pd2-toggle {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-radius: 12px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  cursor: pointer; user-select: none;
}
.pt-pd2-toggle > span:first-of-type {
  font-size: 13px; font-weight: 700; color: var(--pt-text-strong);
}
.pt-pd2-toggle input { display: none; }
.pt-pd2-toggle-track {
  position: relative; width: 36px; height: 20px;
  background: var(--pt-border); border-radius: 999px;
  transition: background 0.15s;
}
.pt-pd2-toggle-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 999px;
  background: #fff; transition: transform 0.18s cubic-bezier(.4,0,.2,1);
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.pt-pd2-toggle input:checked + .pt-pd2-toggle-track { background: var(--pt-accent); }
.pt-pd2-toggle input:checked + .pt-pd2-toggle-track .pt-pd2-toggle-thumb {
  transform: translateX(16px);
}

.pt-pd2-block { display: flex; flex-direction: column; gap: 8px; }
.pt-pd2-block-h {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.16em; font-weight: 800;
  color: var(--pt-text-muted); text-transform: uppercase;
}

.pt-pd2-pm-row { display: flex; gap: 8px; }
.pt-pd2-pm-btn {
  flex: 1; padding: 10px 14px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border); color: var(--pt-text);
  border-radius: 999px; cursor: pointer; transition: all 0.15s;
  font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
  font-family: inherit;
}
.pt-pd2-pm-btn:hover:not(:disabled) { border-color: var(--pt-border-hover); }
.pt-pd2-pm-btn.on {
  background: var(--pt-text-strong); color: var(--pt-bg);
  border-color: var(--pt-text-strong);
}
.pt-pd2-pm-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.pt-pd2-zone-pill {
  display: inline-flex; align-self: flex-start;
  font-size: 11px; color: var(--pt-text-dim);
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  padding: 4px 10px; border-radius: 999px;
}
.pt-pd2-zone-pill strong { color: var(--pt-text-strong); margin: 0 4px; }

.pt-pd2-add-image {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: transparent; border: 1.5px dashed var(--pt-border);
  color: var(--pt-text-strong); font-weight: 700;
  border-radius: 10px; padding: 18px 14px;
  cursor: pointer; transition: all 0.15s; font-family: inherit;
}
.pt-pd2-add-image:hover { border-color: var(--pt-accent); color: var(--pt-accent); background: var(--pt-accent-soft); }

.pt-pd2-uploaded {
  display: grid; grid-template-columns: 56px 1fr; gap: 12px; align-items: center;
  padding: 10px; border: 1px solid var(--pt-border); border-radius: 10px;
  background: var(--pt-bg-elev);
}
.pt-pd2-uploaded-thumb {
  width: 56px; height: 56px; border-radius: 8px;
  background: #fff center/contain no-repeat;
  border: 1px solid var(--pt-border);
}
.pt-pd2-uploaded-name {
  font-size: 12px; font-weight: 700; color: var(--pt-text-strong);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pt-pd2-uploaded-actions {
  display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap;
}
.pt-pd2-uploaded-actions button {
  display: inline-flex; align-items: center; gap: 3px;
  background: transparent; border: 1px solid var(--pt-border);
  color: var(--pt-text-dim); border-radius: 6px;
  padding: 4px 8px; font-size: 10.5px; font-weight: 600;
  cursor: pointer; transition: all 0.12s; font-family: inherit;
}
.pt-pd2-uploaded-actions button:hover { color: var(--pt-text-strong); border-color: var(--pt-border-hover); }

.pt-pd2-input {
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  color: var(--pt-text); padding: 10px 12px;
  border-radius: 8px; font-size: 13px; font-family: inherit;
  width: 100%; resize: vertical;
}
.pt-pd2-input:focus { outline: none; border-color: var(--pt-accent); }
.pt-pd2-input::placeholder { color: var(--pt-text-muted); }

.pt-pd2-sizechart-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  color: var(--pt-text); border-radius: 8px;
  padding: 10px 12px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all 0.15s; font-family: inherit;
}
.pt-pd2-sizechart-btn > span { flex: 1; text-align: left; }
.pt-pd2-sizechart-btn:hover { border-color: var(--pt-border-hover); color: var(--pt-text-strong); }

.pt-pd2-footer {
  display: flex; gap: 6px; flex-wrap: wrap;
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10.5px; color: var(--pt-text-muted);
  letter-spacing: 0.04em;
  padding-top: 12px; border-top: 1px dashed var(--pt-border);
  margin-top: auto;
}
.pt-pd2-footer .dot { color: var(--pt-border); }

/* ─── CENTER column · Mockup stage ─── */
.pt-pd2-stage {
  padding: 24px;
  background:
    radial-gradient(55% 45% at 50% 38%, var(--pt-bg-card), var(--pt-bg-soft) 70%, var(--pt-bg-elev));
  position: relative;
  display: flex; flex-direction: column; gap: 14px;
}
:root[data-theme="light"] .pt-pd2-stage {
  background: radial-gradient(55% 45% at 50% 38%, #fafaf7, #f1efe8 70%, #e7e5dd);
}
.pt-pd2-stage-top {
  display: flex; justify-content: center;
}
.pt-pd2-view-select {
  appearance: none; -webkit-appearance: none;
  background: var(--pt-bg-elev) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round'><path d='M6 9l6 6 6-6'/></svg>") no-repeat right 12px center;
  background-size: 14px;
  border: 1px solid var(--pt-border); color: var(--pt-text);
  border-radius: 10px; padding: 9px 36px 9px 14px;
  font-size: 13px; font-weight: 600; font-family: inherit;
  cursor: pointer; min-width: 200px;
  text-align: center;
}
.pt-pd2-view-select:focus { outline: none; border-color: var(--pt-accent); }
.pt-pd2-view-static {
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  color: var(--pt-text); padding: 9px 18px; border-radius: 10px;
  font-size: 13px; font-weight: 600;
}
.pt-pd2-stage-actions {
  display: flex; justify-content: center; gap: 8px;
}
.pt-pd2-stage-btn {
  width: 36px; height: 36px; border-radius: 10px;
  border: 0; cursor: pointer; transition: all 0.15s;
  display: grid; place-items: center;
}
.pt-pd2-stage-btn-align {
  background: var(--pt-accent-soft);
  color: var(--pt-text-strong);
}
.pt-pd2-stage-btn-align:hover:not(:disabled) { background: var(--pt-accent-glow); }
.pt-pd2-stage-btn-trash {
  background: color-mix(in srgb, #ef4444 14%, var(--pt-bg-elev));
  color: #f87171;
}
.pt-pd2-stage-btn-trash:hover:not(:disabled) { background: color-mix(in srgb, #ef4444 22%, var(--pt-bg-elev)); }
.pt-pd2-stage-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.pt-pd2-mockup {
  flex: 1; min-height: 0;
  position: relative;
  display: grid; place-items: center;
}
.pt-pd2-mockup::after {
  content: ""; position: absolute; left: 22%; right: 22%; bottom: 4%;
  height: 20px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(0,0,0,0.4), transparent);
  filter: blur(6px); pointer-events: none;
}
:root[data-theme="light"] .pt-pd2-mockup::after {
  background: radial-gradient(closest-side, rgba(0,0,0,0.16), transparent);
}
.pt-pd2-mockup .pt-mockup-svg {
  width: 100%; max-width: 380px; height: auto; max-height: 540px;
}

.pt-pd2-stage-scale {
  display: flex; flex-direction: column; gap: 6px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 10px; padding: 10px 14px;
}
.pt-pd2-stage-scale-row {
  display: flex; align-items: center; gap: 10px;
}
.pt-pd2-stage-scale-l {
  font-family: ui-monospace, monospace;
  font-size: 10.5px; letter-spacing: 0.10em; font-weight: 700;
  color: var(--pt-text-muted); text-transform: uppercase;
  min-width: 30px;
}
.pt-pd2-stage-scale .pt-pd-slider { flex: 1; }

/* ─── RIGHT column · Print Details + CTAs ─── */
.pt-pd2-summary {
  padding: 24px 24px 28px;
  background: var(--pt-bg-soft);
  border-left: 1px solid var(--pt-border);
  display: flex; flex-direction: column; gap: 16px;
  overflow-y: auto;
}
.pt-pd2-summary-title {
  font-size: 18px; font-weight: 800; color: var(--pt-text-strong);
  text-align: center; letter-spacing: -0.01em;
}
.pt-pd2-zone-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.pt-pd2-zone-card {
  background: var(--pt-bg-elev); border: 1.5px solid var(--pt-border);
  border-radius: 10px; padding: 12px;
  cursor: pointer; transition: all 0.15s; text-align: left;
  color: var(--pt-text); font-family: inherit;
}
.pt-pd2-zone-card:hover:not(:disabled) { border-color: var(--pt-border-hover); }
.pt-pd2-zone-card.has-design {
  border-color: color-mix(in srgb, var(--pt-success) 50%, var(--pt-border));
  background: color-mix(in srgb, var(--pt-success) 4%, var(--pt-bg-elev));
}
.pt-pd2-zone-card.on { border-color: var(--pt-accent); background: var(--pt-accent-soft); }
.pt-pd2-zone-card:disabled { opacity: 0.6; cursor: default; }
.pt-pd2-zone-label {
  font-size: 13px; font-weight: 800; color: var(--pt-text-strong);
  text-align: center; margin-bottom: 8px; padding-bottom: 8px;
  border-bottom: 1px solid var(--pt-border);
}
.pt-pd2-zone-row {
  display: flex; justify-content: space-between;
  font-size: 11px; padding: 2px 0;
}
.pt-pd2-zone-row > span { color: var(--pt-text-muted); }
.pt-pd2-zone-row > strong { color: var(--pt-text-strong); font-weight: 700; }

.pt-pd2-maxprint {
  font-size: 11.5px; color: var(--pt-text-dim);
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 8px; padding: 10px 12px; text-align: center;
}
.pt-pd2-maxprint strong { color: var(--pt-text-strong); }

.pt-pd2-totals {
  display: flex; flex-direction: column; gap: 6px;
  padding-top: 8px;
}
.pt-pd2-totals-row {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 12.5px;
}
.pt-pd2-totals-row > span { color: var(--pt-text-muted); }
.pt-pd2-totals-row > strong { color: var(--pt-text); font-weight: 700; }
.pt-pd2-totals-total {
  padding-top: 8px; border-top: 1px solid var(--pt-border); margin-top: 4px;
}
.pt-pd2-totals-total > span { font-size: 13px; font-weight: 700; color: var(--pt-text-strong); }
.pt-pd2-totals-total > strong { font-size: 17px; color: var(--pt-text-strong); font-weight: 800; letter-spacing: -0.01em; }
.pt-pd2-totals-total > strong small { font-size: 10px; color: var(--pt-text-muted); margin-left: 4px; font-weight: 600; }

.pt-pd2-selling { display: flex; flex-direction: column; gap: 6px; }
.pt-pd2-selling > label {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.16em; font-weight: 800;
  color: var(--pt-text-muted); text-transform: uppercase;
}
.pt-pd2-margin-hint {
  font-size: 11px; color: var(--pt-success); margin-top: 2px;
}
.pt-pd2-margin-hint strong { font-weight: 700; }

.pt-pd2-cta {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 13px 18px; border-radius: 10px;
  font-size: 13px; font-weight: 800; letter-spacing: 0.04em;
  cursor: pointer; transition: all 0.15s; font-family: inherit;
  border: 1px solid transparent;
}
.pt-pd2-cta > span { flex: 1; }
.pt-pd2-cta-live {
  background: color-mix(in srgb, var(--pt-success) 14%, var(--pt-bg-elev));
  color: var(--pt-success);
  border-color: color-mix(in srgb, var(--pt-success) 40%, transparent);
}
.pt-pd2-cta-live:hover:not(:disabled) {
  background: var(--pt-success); color: var(--pt-bg);
  border-color: var(--pt-success);
}
.pt-pd2-cta-draft {
  background: var(--pt-bg-elev); color: var(--pt-text);
  border-color: var(--pt-border);
}
.pt-pd2-cta-draft:hover:not(:disabled) { border-color: var(--pt-border-hover); background: var(--pt-bg-card); }
.pt-pd2-cta:disabled { opacity: 0.45; cursor: not-allowed; }

.pt-pd2-cta-note {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; color: var(--pt-text-muted);
  padding: 2px 4px;
}
.pt-pd2-cta-note svg { color: var(--pt-accent); flex-shrink: 0; }

/* ─── Size chart popover ─── */
.pt-sizechart { max-width: 520px; padding: 28px; }
.pt-sizechart-note { font-size: 12px; color: var(--pt-text-muted); margin: 0 0 14px 0; }
.pt-sizechart-table {
  width: 100%; border-collapse: collapse;
  background: var(--pt-bg-soft); border-radius: 8px; overflow: hidden;
}
.pt-sizechart-table th, .pt-sizechart-table td {
  padding: 10px 14px; text-align: left;
  font-size: 12.5px; border-bottom: 1px solid var(--pt-border);
}
.pt-sizechart-table th {
  font-family: ui-monospace, monospace;
  font-size: 10px; letter-spacing: 0.14em; font-weight: 800;
  color: var(--pt-text-muted); text-transform: uppercase;
  background: var(--pt-bg-elev);
}
.pt-sizechart-table tr:last-child td { border-bottom: 0; }
.pt-sizechart-table td strong { color: var(--pt-accent); font-weight: 800; }

/* ─── Responsive ─── */
@media (max-width: 1180px) {
  .pt-pd2-grid { grid-template-columns: 320px 1fr 320px; }
}
@media (max-width: 980px) {
  .pt-pd2-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
  }
  .pt-pd2-form { border-right: 0; border-bottom: 1px solid var(--pt-border); }
  .pt-pd2-summary { border-left: 0; border-top: 1px solid var(--pt-border); }
}
.pt-pd-preview {
  padding: 28px;
  background: var(--pt-bg-soft); border-right: 1px solid var(--pt-border);
  display: flex; flex-direction: column; gap: 14px;
}
.pt-pd-views {
  display: inline-flex; align-self: center; gap: 4px;
  background: var(--pt-bg-card); border: 1px solid var(--pt-border);
  border-radius: 999px; padding: 4px;
}
.pt-pd-view {
  position: relative;
  background: transparent; border: 0; padding: 7px 16px;
  border-radius: 999px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--pt-text-dim); cursor: pointer; transition: all 0.15s;
}
.pt-pd-view:hover { color: var(--pt-text); }
.pt-pd-view.on { background: var(--pt-accent); color: var(--pt-accent-ink); }
.pt-pd-view-dot {
  position: absolute; top: 6px; right: 9px;
  width: 6px; height: 6px; border-radius: 999px;
  background: var(--pt-success); box-shadow: 0 0 0 2px var(--pt-bg-card);
}
.pt-pd-view.on .pt-pd-view-dot { box-shadow: 0 0 0 2px var(--pt-accent); }
.pt-pd-mockup {
  background: var(--pt-bg-card); border: 1px solid var(--pt-border);
  border-radius: 12px; aspect-ratio: 1; display: grid; place-items: center;
  position: relative; overflow: hidden;
}
.pt-pd-mockup-hint {
  display: inline-flex; align-items: center; gap: 6px; justify-content: center;
  font-size: 11px; color: var(--pt-text-muted); letter-spacing: 0.02em;
}
.pt-pd-thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; }
.pt-pd-thumb {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  background: var(--pt-bg-card); border: 1px solid var(--pt-border);
  border-radius: 8px; padding: 6px;
  cursor: pointer; transition: all 0.15s;
}
.pt-pd-thumb.on { border-color: var(--pt-accent); }
.pt-pd-thumb span { font-size: 9px; color: var(--pt-text-muted); letter-spacing: 0.02em; }

.pt-pd-config { padding: 32px; overflow-y: auto; }
.pt-pd-cat { font-size: 11px; letter-spacing: 0.12em; color: var(--pt-text-muted); text-transform: uppercase; margin-bottom: 6px; }
.pt-pd-h { font-size: 22px; font-weight: 800; color: var(--pt-text-strong); margin: 0 0 6px 0; letter-spacing: -0.01em; }
.pt-pd-blurb { font-size: 13px; color: var(--pt-text-dim); line-height: 1.55; margin: 0 0 18px 0; }
.pt-pd-steps {
  list-style: none; padding: 0; margin: 0 0 18px 0;
  display: flex; flex-direction: column; gap: 4px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  border-radius: 10px; padding: 12px 14px;
}
.pt-pd-steps li {
  display: flex; align-items: center; gap: 10px;
  font-size: 12px; color: var(--pt-text-dim); padding: 3px 0;
}
.pt-pd-steps li em { color: var(--pt-text-muted); font-style: normal; padding: 0 4px; }
.pt-pd-steps li.done { color: var(--pt-text); }
.pt-pd-steps li.done .pt-pd-step-no { background: var(--pt-success); color: var(--pt-bg); }
.pt-pd-steps li.done > svg { color: var(--pt-success); margin-left: auto; }
.pt-pd-step-no {
  display: inline-grid; place-items: center;
  width: 20px; height: 20px; border-radius: 5px;
  background: var(--pt-bg-card); border: 1px solid var(--pt-border);
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10px; font-weight: 800; color: var(--pt-text-muted);
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.pt-pd-section { padding: 18px 0; border-top: 1px solid var(--pt-border); }
.pt-pd-label {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 10.5px; letter-spacing: 0.16em; font-weight: 800; color: var(--pt-text-muted);
  text-transform: uppercase; margin-bottom: 12px;
}
.pt-pd-swatches { display: flex; gap: 6px; flex-wrap: wrap; }
.pt-pd-swatch {
  width: 32px; height: 32px; border-radius: 999px;
  border: 2px solid var(--pt-border); cursor: pointer;
  display: grid; place-items: center; transition: all 0.15s;
}
.pt-pd-swatch.on { border-color: var(--pt-accent); transform: scale(1.08); }
.pt-pd-sizes { display: flex; gap: 6px; flex-wrap: wrap; }
.pt-pd-size {
  min-width: 44px; padding: 8px 12px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  color: var(--pt-text); border-radius: 8px;
  font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s;
}
.pt-pd-size:hover { border-color: var(--pt-border-hover); }
.pt-pd-size.on { background: var(--pt-accent); color: var(--pt-accent-ink); border-color: var(--pt-accent); }
.pt-pd-upload {}
.pt-upload-btn {
  display: flex; align-items: center; gap: 12px;
  width: 100%; background: var(--pt-bg-soft);
  border: 1.5px dashed var(--pt-border); border-radius: 10px;
  padding: 16px; cursor: pointer; transition: all 0.15s;
  text-align: left;
}
.pt-upload-btn:hover { border-color: var(--pt-accent); background: var(--pt-bg-card); }
.pt-upload-btn > svg { color: var(--pt-accent); }
.pt-upload-h { font-size: 13px; font-weight: 700; color: var(--pt-text-strong); }
.pt-upload-p { font-size: 11px; color: var(--pt-text-muted); margin-top: 2px; }
.pt-upload-done {
  display: flex; align-items: center; gap: 12px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  border-radius: 10px; padding: 12px 14px;
}
.pt-upload-pic {
  width: 36px; height: 36px; border-radius: 8px;
  background: var(--pt-accent-soft); color: var(--pt-accent);
  display: grid; place-items: center;
}
.pt-upload-meta { flex: 1; min-width: 0; }
.pt-upload-name { font-size: 13px; font-weight: 600; color: var(--pt-text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.pt-pd-price-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: end; }
.pt-price-input {
  display: flex; align-items: center; gap: 6px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  border-radius: 10px; padding: 10px 12px;
}
.pt-price-input svg { color: var(--pt-text-muted); }
.pt-price-input input {
  flex: 1; background: transparent; border: 0; outline: none;
  color: var(--pt-text-strong); font-size: 14px; font-weight: 700; font-family: inherit;
}
.pt-pd-margin { background: var(--pt-bg-soft); border: 1px solid var(--pt-border); border-radius: 10px; padding: 10px 12px; }
.pt-pd-margin-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
.pt-pd-margin-row span { color: var(--pt-text-muted); letter-spacing: 0.04em; }
.pt-pd-margin-row strong { color: var(--pt-text-strong); }
.pt-pd-margin-v { color: var(--pt-success) !important; }

.pt-pd-actions {
  display: flex; gap: 10px; justify-content: flex-end;
  padding-top: 20px; border-top: 1px solid var(--pt-border); margin-top: 12px;
  flex-wrap: wrap;
}

/* ─── Final step: choose Save to pressroom vs Make live on Shopify ─── */
.pt-pd-final {
  margin-top: 18px; padding-top: 20px;
  border-top: 1px solid var(--pt-border);
}
.pt-pd-final-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.pt-pd-final-title {
  font-size: 13px; font-weight: 700; color: var(--pt-text-strong); letter-spacing: -0.01em;
}
.pt-pd-final-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}
.pt-pd-action {
  display: grid; grid-template-columns: 44px 1fr 16px; align-items: center; gap: 14px;
  background: var(--pt-bg-soft); border: 1.5px solid var(--pt-border);
  border-radius: 12px; padding: 14px 16px;
  cursor: pointer; transition: all 0.18s; text-align: left;
  color: var(--pt-text); font-family: inherit;
}
.pt-pd-action:hover:not(:disabled):not(.is-disabled) {
  border-color: var(--pt-text-muted);
  background: var(--pt-bg-card);
  transform: translateY(-1px);
}
.pt-pd-action:disabled, .pt-pd-action.is-disabled {
  opacity: 0.5; cursor: not-allowed;
}
.pt-pd-action-icon {
  width: 44px; height: 44px; border-radius: 10px;
  display: grid; place-items: center;
  border: 1px solid var(--pt-border);
}
.pt-pd-action-icon-draft { background: var(--pt-bg-elev); color: var(--pt-text); }
.pt-pd-action-icon-live  { background: var(--pt-accent-soft); color: var(--pt-accent); border-color: color-mix(in srgb, var(--pt-accent) 30%, transparent); }
.pt-pd-action-publish:hover:not(:disabled):not(.is-disabled) {
  border-color: var(--pt-accent);
  background: color-mix(in srgb, var(--pt-accent) 6%, var(--pt-bg-card));
}
.pt-pd-action-publish:hover:not(:disabled):not(.is-disabled) .pt-pd-action-icon-live {
  background: var(--pt-accent); color: var(--pt-accent-ink);
}
.pt-pd-action-h {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 13.5px; font-weight: 700; color: var(--pt-text-strong);
  margin-bottom: 3px; letter-spacing: -0.01em;
}
.pt-pd-action-badge {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 9px; letter-spacing: 0.14em; font-weight: 700;
  padding: 2px 6px; border-radius: 4px;
  background: var(--pt-bg-card); color: var(--pt-text-dim);
  border: 1px solid var(--pt-border);
}
.pt-pd-action-p {
  font-size: 11.5px; color: var(--pt-text-muted); line-height: 1.45;
}
.pt-pd-action-arrow { color: var(--pt-text-muted); }
.pt-pd-action:hover:not(:disabled):not(.is-disabled) .pt-pd-action-arrow { color: var(--pt-text); }
.pt-pd-action-publish:hover:not(:disabled):not(.is-disabled) .pt-pd-action-arrow { color: var(--pt-accent); }
.pt-pd-final-hint {
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: 10px;
  font-size: 11px; color: var(--pt-text-muted);
}
.pt-pd-final-hint svg { color: var(--pt-accent); }

/* Multi-store publish sheet (when client has >1 connected store) */
.pt-publish-overlay {
  position: fixed; inset: 0; z-index: 120;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(6px);
  display: grid; place-items: center; padding: 24px;
}
.pt-publish-sheet {
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 16px; max-width: 420px; width: 100%;
  padding: 22px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.45);
}
.pt-publish-sheet-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
.pt-publish-sheet-eyebrow {
  font-family: ui-monospace, monospace;
  font-size: 9.5px; letter-spacing: 0.16em; font-weight: 800;
  color: var(--pt-accent); text-transform: uppercase; margin-bottom: 2px;
}
.pt-publish-sheet-title { font-size: 18px; font-weight: 800; color: var(--pt-text-strong); letter-spacing: -0.01em; }
.pt-publish-sheet-list { display: flex; flex-direction: column; gap: 6px; }
.pt-publish-sheet-row {
  display: grid; grid-template-columns: 18px 1fr 14px; align-items: center; gap: 12px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  border-radius: 10px; padding: 10px 14px;
  cursor: pointer; transition: all 0.15s; text-align: left;
  color: var(--pt-text);
}
.pt-publish-sheet-row:hover { border-color: var(--pt-accent); background: var(--pt-accent-soft); }
.pt-publish-sheet-name { font-size: 13px; font-weight: 700; color: var(--pt-text-strong); }
.pt-publish-sheet-domain { font-size: 11px; color: var(--pt-text-muted); }

@media (max-width: 720px) {
  .pt-pd-final-grid { grid-template-columns: 1fr; }
}

/* ─── Zones list + chips ─── */
.pt-zones-list { display: flex; flex-direction: column; gap: 12px; }
.pt-zones-view-block { display: flex; flex-direction: column; gap: 6px; }
.pt-zones-view-label {
  font-size: 9.5px; letter-spacing: 0.16em; font-weight: 800;
  color: var(--pt-text-muted); text-transform: uppercase;
}
.pt-zones-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pt-zone-chip {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  color: var(--pt-text-dim); border-radius: 999px;
  padding: 6px 11px; font-size: 11.5px; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
}
.pt-zone-chip:hover { border-color: var(--pt-border-hover); color: var(--pt-text); }
.pt-zone-chip svg { color: var(--pt-text-muted); }
.pt-zone-chip.has-design { color: var(--pt-text); }
.pt-zone-chip.has-design svg { color: var(--pt-success); }
.pt-zone-chip.on {
  background: var(--pt-accent-soft); border-color: var(--pt-accent);
  color: var(--pt-text-strong);
}
.pt-zone-chip.on svg { color: var(--pt-accent); }

/* ─── Zone editor (active zone controls) ─── */
.pt-zone-editor {
  background: var(--pt-bg-soft);
  border-radius: 10px; padding: 14px;
  margin-top: 4px;
}
.pt-zone-editor.pt-pd-section { border-top: 0; padding-top: 14px; padding-bottom: 14px; }
.pt-pd-row {
  display: flex; align-items: center; gap: 12px; justify-content: space-between;
}
.pt-pd-row-actions { justify-content: flex-start; gap: 8px; }
.pt-mt-12 { margin-top: 12px; }
.pt-pd-mini-label {
  font-size: 9.5px; letter-spacing: 0.16em; font-weight: 800;
  color: var(--pt-text-muted); text-transform: uppercase;
}
.pt-pd-mini-actions { display: inline-flex; align-items: center; gap: 4px; }
.pt-pd-mini-btn {
  min-width: 30px; height: 28px; padding: 0 8px;
  background: var(--pt-bg-card); border: 1px solid var(--pt-border);
  color: var(--pt-text); border-radius: 7px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.15s;
}
.pt-pd-mini-btn:hover { border-color: var(--pt-border-hover); }
.pt-pd-mini-btn.on { background: var(--pt-accent); color: var(--pt-accent-ink); border-color: var(--pt-accent); }
.pt-pd-mini-val { font-size: 11px; color: var(--pt-text-muted); margin-left: 6px; min-width: 36px; text-align: right; }
.pt-pd-slider {
  width: 100%; margin-top: 8px;
  -webkit-appearance: none; appearance: none;
  background: transparent; cursor: pointer; height: 22px;
}
.pt-pd-slider::-webkit-slider-runnable-track {
  height: 4px; border-radius: 999px;
  background: linear-gradient(to right, var(--pt-accent) 0%, var(--pt-accent) var(--pt-fill, 50%), var(--pt-border) var(--pt-fill, 50%), var(--pt-border) 100%);
}
.pt-pd-slider::-moz-range-track {
  height: 4px; border-radius: 999px; background: var(--pt-border);
}
.pt-pd-slider::-moz-range-progress {
  height: 4px; border-radius: 999px; background: var(--pt-accent);
}
.pt-pd-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 16px; height: 16px; border-radius: 999px;
  background: var(--pt-accent); border: 2px solid var(--pt-bg-elev);
  margin-top: -6px; cursor: pointer;
  box-shadow: 0 0 0 1px var(--pt-accent);
}
.pt-pd-slider::-moz-range-thumb {
  width: 16px; height: 16px; border-radius: 999px;
  background: var(--pt-accent); border: 2px solid var(--pt-bg-elev);
  box-shadow: 0 0 0 1px var(--pt-accent); cursor: pointer;
}

/* ─── Crop modal ─── */
.pt-modal-stacked { z-index: 110; }
.pt-crop-canvas {
  position: relative; user-select: none;
  margin: 18px 28px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  border-radius: 8px; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  min-height: 200px; max-height: 480px;
}
.pt-crop-canvas img {
  display: block; max-width: 100%; max-height: 480px;
  height: auto; pointer-events: none;
}
.pt-crop-box {
  position: absolute;
  border: 2px solid var(--pt-accent);
  box-shadow: 0 0 0 9999px rgba(0,0,0,0.55);
  cursor: move;
}
.pt-crop-handle {
  position: absolute; width: 16px; height: 16px;
  background: var(--pt-accent); border-radius: 2px;
  border: 2px solid #0a0a0a;
}
.pt-crop-handle-tl { left: -8px; top: -8px; cursor: nwse-resize; }
.pt-crop-handle-br { right: -8px; bottom: -8px; cursor: nwse-resize; }

/* ─── My Products ─── */
.pt-mp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.pt-mp-card {
  display: flex; flex-direction: column;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 14px; overflow: hidden; transition: all 0.15s;
}
.pt-mp-card:hover { border-color: var(--pt-border-hover); }
.pt-mp-img {
  position: relative; aspect-ratio: 4/5;
  background:
    radial-gradient(60% 50% at 50% 40%, var(--pt-bg-card), var(--pt-bg-soft) 75%, var(--pt-bg-elev));
  display: grid; place-items: center;
  border-bottom: 1px solid var(--pt-border);
  overflow: hidden;
}
:root[data-theme="light"] .pt-mp-img {
  background: radial-gradient(60% 50% at 50% 40%, #fafaf7, #f1efe8 70%, #e7e5dd);
}
.pt-mp-img .pt-mockup-svg { padding: 8px; }
.pt-mp-status {
  position: absolute; top: 10px; right: 10px;
  font-size: 9px; letter-spacing: 0.16em; font-weight: 800;
  padding: 4px 8px; border-radius: 999px;
}
.pt-mp-status-draft     { background: var(--pt-bg-elev); border: 1px solid var(--pt-border); color: var(--pt-text-muted); }
.pt-mp-status-published { background: var(--pt-success-glow); color: var(--pt-success); border: 1px solid var(--pt-success); }
.pt-mp-zones-badge {
  position: absolute; bottom: 10px; left: 10px;
  font-size: 9px; letter-spacing: 0.12em; font-weight: 700;
  padding: 3px 7px; border-radius: 999px;
  background: var(--pt-accent-soft); color: var(--pt-accent);
  border: 1px solid color-mix(in srgb, var(--pt-accent) 30%, transparent);
}
.pt-mp-body { padding: 12px 14px 0; flex: 1; }
.pt-mp-name { font-size: 13px; font-weight: 700; color: var(--pt-text-strong); }
.pt-mp-meta { font-size: 11px; color: var(--pt-text-muted); margin-top: 4px; }
.pt-mp-store { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--pt-text-dim); margin-top: 6px; }
.pt-mp-actions {
  display: flex; gap: 6px; justify-content: space-between; align-items: center;
  padding: 12px 14px; border-top: 1px solid var(--pt-border);
}
.pt-mp-delete { padding: 7px 9px; }
.pt-publish-menu { position: relative; }
.pt-publish-dropdown {
  position: absolute; bottom: 100%; left: 0; margin-bottom: 4px; z-index: 5;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border-hover);
  border-radius: 8px; padding: 4px; min-width: 180px;
  box-shadow: 0 10px 24px rgba(0,0,0,0.16);
}
.pt-publish-dropdown button {
  display: flex; align-items: center; gap: 8px;
  width: 100%; background: transparent; border: 0;
  color: var(--pt-text); padding: 8px 10px; border-radius: 6px;
  font-size: 12px; font-weight: 600; cursor: pointer;
  text-align: left;
}
.pt-publish-dropdown button:hover { background: var(--pt-bg-soft); }

/* ─── Stores ─── */
.pt-store-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.pt-store-card {
  display: flex; align-items: center; gap: 14px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 14px; padding: 18px;
}
.pt-store-logo {
  width: 52px; height: 52px; border-radius: 12px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  display: grid; place-items: center; flex-shrink: 0;
}
.pt-store-body { flex: 1; min-width: 0; }
.pt-store-name { font-size: 14px; font-weight: 700; color: var(--pt-text-strong); }
.pt-store-domain { font-size: 11.5px; color: var(--pt-text-muted); margin-top: 2px; }
.pt-store-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--pt-success); margin-top: 6px; }

/* ─── Empty states ─── */
.pt-empty-state {
  text-align: center; padding: 60px 20px; max-width: 480px; margin: 24px auto;
}
.pt-empty-state svg { color: var(--pt-accent); margin: 0 auto 16px; }
.pt-empty-state h3 { font-size: 18px; font-weight: 700; color: var(--pt-text-strong); margin: 0 0 8px 0; }
.pt-empty-state p { font-size: 13px; color: var(--pt-text-dim); line-height: 1.6; margin: 0 0 22px 0; }

/* ─── Connect Shopify modal ─── */
.pt-connect-modal { padding: 0; max-width: 580px; overflow: hidden; }
.pt-connect-head { padding: 28px 28px 12px; border-bottom: 1px solid var(--pt-border); }
.pt-connect-eyebrow {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10.5px; letter-spacing: 0.18em; font-weight: 800;
  color: var(--pt-accent); margin-bottom: 8px;
}
.pt-connect-h { font-size: 22px; font-weight: 800; color: var(--pt-text-strong); letter-spacing: -0.01em; margin: 0 0 14px; }
.pt-connect-tabs { display: flex; gap: 18px; }
.pt-connect-tab {
  background: transparent; border: 0; border-bottom: 2px solid transparent;
  color: var(--pt-text-muted); padding: 6px 0;
  font-family: inherit; font-size: 12px; font-weight: 700;
  letter-spacing: 0.06em; cursor: pointer; transition: all 0.15s;
}
.pt-connect-tab:hover { color: var(--pt-text); }
.pt-connect-tab.on { color: var(--pt-text-strong); border-bottom-color: var(--pt-accent); }

.pt-connect-body { padding: 22px 28px 24px; display: flex; flex-direction: column; gap: 14px; }
.pt-connect-intro { font-size: 13px; color: var(--pt-text-dim); line-height: 1.55; margin: 0; }
.pt-connect-intro .pt-link-btn { background: transparent; border: 0; color: var(--pt-accent); font-weight: 700; cursor: pointer; padding: 0; font-family: inherit; }

.pt-connect-steps { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.pt-connect-steps li { display: grid; grid-template-columns: 28px 1fr; gap: 12px; align-items: flex-start; }
.pt-connect-step-no {
  width: 24px; height: 24px; border-radius: 6px;
  background: var(--pt-accent-soft); color: var(--pt-accent);
  display: grid; place-items: center;
  font-family: ui-monospace, monospace; font-size: 12px; font-weight: 800;
}
.pt-connect-step-body { font-size: 13px; line-height: 1.55; color: var(--pt-text); }
.pt-connect-step-body strong { color: var(--pt-text-strong); }
.pt-connect-step-body code {
  display: inline-block; padding: 1px 6px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
  border-radius: 4px;
  font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 11.5px;
  color: var(--pt-text-strong);
}
.pt-connect-scopes {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;
}
.pt-connect-scopes span {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: ui-monospace, monospace; font-size: 10.5px;
  padding: 3px 8px; border-radius: 4px;
  background: var(--pt-success-glow); color: var(--pt-success);
  border: 1px solid color-mix(in srgb, var(--pt-success) 36%, transparent);
}
.pt-connect-cta-row {
  display: flex; gap: 10px; justify-content: space-between; align-items: center;
  padding-top: 6px;
  flex-wrap: wrap;
}
.pt-connect-secure {
  display: inline-flex; align-items: flex-start; gap: 8px;
  font-size: 11.5px; color: var(--pt-text-muted); line-height: 1.5;
  padding: 10px 12px; border-radius: 8px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border);
}
.pt-connect-secure svg { color: var(--pt-success); flex-shrink: 0; margin-top: 2px; }

/* ─── Orders page "connect Shopify" empty state ─── */
.pt-orders-empty { max-width: 540px; }
.pt-orders-empty-icon {
  width: 56px; height: 56px; border-radius: 14px;
  display: inline-grid; place-items: center;
  background: var(--pt-accent-soft);
  border: 1px solid color-mix(in srgb, var(--pt-accent) 30%, transparent);
  color: var(--pt-accent);
  margin: 0 auto 16px;
}
.pt-orders-empty-icon svg { margin: 0; }
.pt-orders-empty-actions {
  display: inline-flex; gap: 10px; align-items: center; flex-wrap: wrap;
  justify-content: center;
}
.pt-orders-empty-help {
  display: inline-flex; align-items: center; gap: 6px;
  text-decoration: none;
}
.pt-orders-empty-strip {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
  margin-top: 28px; padding-top: 24px;
  border-top: 1px dashed var(--pt-border);
  text-align: left;
}
.pt-orders-empty-strip > div {
  display: flex; flex-direction: column; gap: 3px;
  font-size: 11px; color: var(--pt-text);
  padding: 0 10px;
  border-left: 1px solid var(--pt-border);
}
.pt-orders-empty-strip > div:first-child { border-left: 0; padding-left: 0; }
.pt-orders-empty-strip-l {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 9px; letter-spacing: 0.14em; font-weight: 800;
  color: var(--pt-text-muted); text-transform: uppercase;
}
@media (max-width: 560px) {
  .pt-orders-empty-strip { grid-template-columns: 1fr; gap: 10px; }
  .pt-orders-empty-strip > div { border-left: 0; padding-left: 0; }
}

/* ─── Wallet ─── */
.pt-wallet-grid { display: grid; grid-template-columns: 340px 1fr; gap: 14px; align-items: start; }

/* Balance hero card — sticky on scroll, with a soft accent glow bleed. */
.pt-wallet-card {
  position: relative; overflow: hidden;
  display: flex; flex-direction: column; align-items: stretch; gap: 9px;
  position: sticky; top: 8px;
}
.pt-wallet-card-glow {
  position: absolute; top: -60px; right: -60px; width: 200px; height: 200px;
  background: radial-gradient(circle, var(--pt-accent-glow), transparent 70%);
  pointer-events: none; opacity: 0.7;
}
.pt-wallet-card-top { display: flex; align-items: center; justify-content: space-between; }
.pt-wallet-label {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 10.5px; letter-spacing: 0.16em; font-weight: 800;
  color: var(--pt-text-muted); text-transform: uppercase;
}
.pt-wallet-label svg { opacity: 0.7; }
.pt-wallet-amount {
  font-size: 42px; font-weight: 800; color: var(--pt-text-strong);
  letter-spacing: -0.025em; line-height: 1.05;
  font-variant-numeric: tabular-nums; font-feature-settings: "tnum";
}
.pt-wallet-sub { font-size: 12px; color: var(--pt-text-muted); margin-bottom: 6px; }
.pt-wallet-topup { width: 100%; padding: 12px 18px; }

/* Health chip — quick read on whether a recharge is due. */
.pt-wallet-health {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 4px 9px 4px 8px; border-radius: 999px; border: 1px solid transparent;
}
.pt-wallet-health-dot { width: 6px; height: 6px; border-radius: 50%; box-shadow: 0 0 0 3px transparent; }
.pt-wallet-health-ok { color: var(--pt-success); background: var(--pt-success-glow); border-color: color-mix(in srgb, var(--pt-success) 35%, transparent); }
.pt-wallet-health-ok .pt-wallet-health-dot { background: var(--pt-success); box-shadow: 0 0 8px var(--pt-success); }
.pt-wallet-health-low { color: var(--pt-amber); background: rgba(251, 146, 60, 0.14); border-color: color-mix(in srgb, var(--pt-amber) 35%, transparent); }
.pt-wallet-health-low .pt-wallet-health-dot { background: var(--pt-amber); box-shadow: 0 0 8px var(--pt-amber); }
.pt-wallet-health-empty { color: var(--pt-err); background: var(--pt-err-glow); border-color: color-mix(in srgb, var(--pt-err) 35%, transparent); }
.pt-wallet-health-empty .pt-wallet-health-dot { background: var(--pt-err); box-shadow: 0 0 8px var(--pt-err); }

/* Added / Spent mini-ledger under the CTA. */
.pt-wallet-stats {
  margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--pt-border);
  display: flex; flex-direction: column; gap: 11px;
}
.pt-wallet-stat { display: flex; align-items: center; gap: 10px; }
.pt-wallet-stat-ico {
  width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0;
  display: grid; place-items: center;
}
.pt-wallet-stat-ico-in { background: var(--pt-success-glow); color: var(--pt-success); }
.pt-wallet-stat-ico-out { background: var(--pt-err-glow); color: var(--pt-err); }
.pt-wallet-stat-k { font-size: 12px; color: var(--pt-text-dim); }
.pt-wallet-stat-v {
  margin-left: auto; font-size: 13px; font-weight: 800; color: var(--pt-text-strong);
  font-variant-numeric: tabular-nums; font-feature-settings: "tnum";
}

/* Segmented filter in the transactions header. */
.pt-wallet-seg {
  display: inline-flex; gap: 2px; padding: 3px;
  background: var(--pt-bg-soft); border: 1px solid var(--pt-border); border-radius: 9px;
}
.pt-wallet-seg-btn {
  padding: 5px 12px; border: 0; background: transparent; cursor: pointer;
  color: var(--pt-text-muted); font: inherit; font-size: 11.5px; font-weight: 700;
  border-radius: 6px; transition: color 0.15s, background 0.15s;
}
.pt-wallet-seg-btn:hover { color: var(--pt-text); }
.pt-wallet-seg-btn.is-on { background: var(--pt-accent); color: var(--pt-accent-ink); }

/* Day group header inside the ledger. */
.pt-wallet-day-group + .pt-wallet-day-group { margin-top: 6px; }
.pt-wallet-day {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px 6px; margin-top: 2px;
}
.pt-wallet-day > span:first-child {
  font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--pt-text-muted);
}
.pt-wallet-day-net {
  font-size: 11px; font-weight: 700; color: var(--pt-text-dim);
  font-variant-numeric: tabular-nums; font-feature-settings: "tnum";
}

/* ─── RTOs page ─── */
.pt-rto-note {
  font-size: 11.5px; line-height: 1.5; color: var(--pt-text-dim);
  background: var(--pt-success-glow); border: 1px solid color-mix(in srgb, var(--pt-success) 30%, transparent);
  border-radius: 9px; padding: 9px 11px; margin-top: 4px;
}
.pt-rto-stock { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.pt-rto-stock-name { font-size: 12.5px; color: var(--pt-text); min-width: 0; }
.pt-rto-stock-size { color: var(--pt-text-muted); }
.pt-rto-stock-qty {
  margin-left: auto; flex-shrink: 0;
  font-size: 13px; font-weight: 800; color: var(--pt-success);
  font-variant-numeric: tabular-nums; font-feature-settings: "tnum";
}

/* ─── Settings ─── */
.pt-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

/* ─── Mockup SVGs ─── */
.pt-mockup-svg { display: block; }

/* ─── Responsive ─── */
@media (max-width: 1100px) {
  .pt-two-col { grid-template-columns: 1fr; }
  .pt-kpi-grid { grid-template-columns: 1fr 1fr; }
  .pt-pd-grid { grid-template-columns: 1fr; }
  .pt-pd-preview { border-right: 0; border-bottom: 1px solid var(--pt-border); }
  .pt-wallet-grid { grid-template-columns: 1fr; }
  .pt-wallet-card { position: static; }
  .pt-settings-grid { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  /* NOTE: sidebar layout on mobile is owned by the drawer block at
     @media (max-width: 880px) — do NOT re-style .pt-sidebar here, or the
     fixed slide-in drawer collapses back into an inline static bar. */
  .pt-kpi-grid { grid-template-columns: 1fr 1fr; }
  .pt-page-head h1 { font-size: 22px; }
  .pt-qa-grid { grid-template-columns: 1fr; }
  /* The base .pt-page rule sits later in the source than the drawer
     block's mobile override, so it wins — re-assert tighter padding here
     (after the base rule) so phones don't keep the 32px desktop gutter. */
  .pt-page { padding: 18px 16px; }
  .pt-panel { padding: 18px 16px; }
}
@media (max-width: 560px) {
  /* KPI becomes a 2×2 grid of vertical stat tiles — icon up top, label,
     then the value — instead of one tall single-column stack. */
  .pt-kpi-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  .pt-kpi { flex-direction: column; align-items: flex-start; gap: 12px; padding: 14px; position: relative; }
  .pt-kpi-body { width: 100%; }
  .pt-kpi-value strong { font-size: 20px; }
  .pt-kpi-chev { position: absolute; top: 12px; right: 12px; opacity: 0.6; }
  .pt-cat-toolbar { flex-direction: column; align-items: stretch; }
  .pt-search { min-width: 0; }
  .pt-page { padding: 14px 12px; }
  /* Let any panel header wrap its action button below the title instead of
     clipping it off the right edge on a phone. */
  .pt-panel-head { flex-wrap: wrap; gap: 10px 12px; }
  /* Wallet: stack the transactions header so the title + segmented filter
     don't collide, and let the filter span full width. */
  .pt-wallet-grid .pt-panel-head { flex-direction: column; align-items: stretch; gap: 12px; }
  .pt-wallet-seg { width: 100%; }
  .pt-wallet-seg-btn { flex: 1; text-align: center; }
  /* Reclaim row width on narrow screens so notes truncate less. */
  .pt-wallet-grid .pt-panel { padding: 18px 16px; }
  .pt-wallet-txn { padding: 9px 6px; gap: 10px; }
  .pt-wallet-day { padding: 8px 6px 6px; }
  .pt-wallet-amount { font-size: 36px; }
}

/* ═══════════════════════════════════════════════════════════════════
   UI POLISH — press feedback, skeleton loaders, entrance animations
   ═══════════════════════════════════════════════════════════════════ */
/* Tactile press feedback on every button / interactive tile */
.pt-btn-primary:active:not(:disabled),
.pt-btn-secondary:active:not(:disabled),
.pt-btn-ghost:active:not(:disabled),
.pt-cat-pill:active,
.pt-kpi:active { transform: scale(0.96); }
.pt-btn-primary, .pt-btn-secondary, .pt-btn-ghost, .pt-cat-pill { will-change: transform; }

/* Skeleton shimmer shown while data loads from the DB */
@keyframes pt-shimmer { 0% { background-position: -520px 0; } 100% { background-position: 520px 0; } }
.pt-skel {
  background: linear-gradient(90deg, var(--pt-bg-soft) 8%, var(--pt-bg-card) 24%, var(--pt-bg-soft) 40%);
  background-size: 900px 100%;
  animation: pt-shimmer 1.25s linear infinite;
  border-radius: 8px; display: block;
}
.pt-skel-line { height: 12px; }
.pt-skel-row {
  display: grid; grid-template-columns: 2.2fr 1fr 1fr 1.2fr 1fr; gap: 18px;
  align-items: center; padding: 18px 16px; border-bottom: 1px solid var(--pt-border);
}
.pt-skel-row:last-child { border-bottom: 0; }

/* Entrance animations — reuse pt-pop / pt-fade keyframes defined above */
.pt-rise { animation: pt-pop 0.4s cubic-bezier(.21,.61,.35,1) both; }
.pt-fade-in { animation: pt-fade 0.4s ease both; }

/* Detail-row reveal */
@keyframes pt-reveal { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
.pt-expand-row > td > * { animation: pt-reveal 0.28s cubic-bezier(.21,.61,.35,1) both; }

@media (prefers-reduced-motion: reduce) {
  .pt-skel { animation: none; }
  .pt-rise, .pt-fade-in, .pt-expand-row > td > * { animation: none; }
  .pt-btn-primary:active, .pt-btn-secondary:active, .pt-btn-ghost:active,
  .pt-cat-pill:active, .pt-kpi:active { transform: none; }
}

/* ─── Defensive specificity bumps ─────────────────────────────────────
   The .pt-app a / .pt-auth a rule at the top sets color:inherit with
   specificity (0,1,1). After flipping to pure-inversion (--pt-accent ==
   --pt-text in dark mode), any filled CTA rendered as an <a> would
   inherit white text on a now-white background and disappear. Anchoring
   these selectors via .pt-app/.pt-auth gives them (0,2,1) — wins the
   cascade regardless of source order. Mirrors the Landing fix. */
.pt-app a.pt-btn-primary,
.pt-auth a.pt-btn-primary,
.pt-app a.pt-cat-pill.on,
.pt-app a.pt-pd-view.on,
.pt-app a.pt-pd-size.on,
.pt-app a.pt-pd-mini-btn.on,
.pt-app a.pt-topbar-btn-recharge,
.pt-app a.pt-nav-item.active .pt-nav-badge {
  color: var(--pt-accent-ink);
}

/* Brand wordmark image (auth screen). Replaces the old SVG "A" + AVIVA
   text stack. Variant swap happens in JSX via the theme state. */
.pt-brand-logo {
  height: 36px; width: auto; display: block; object-fit: contain;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.35));
}
:root[data-theme="light"] .pt-brand-logo {
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.12));
}
.pt-brand-sub-line {
  font-size: 9px; letter-spacing: 0.20em; font-weight: 700;
  color: var(--pt-text-muted);
  margin-top: 4px;
  align-self: flex-end;
}
.pt-auth-brand {
  display: inline-flex; align-items: center; gap: 12px;
}
`;
