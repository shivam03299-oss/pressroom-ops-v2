import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Package, ShoppingBag, Store, ClipboardList, Wallet,
  Settings as SettingsIcon, LogIn, LogOut, Plus, Search, Filter, X, Check,
  ChevronRight, ChevronLeft, ArrowRight, ArrowUpRight, Upload, Image as ImageIcon,
  Edit3, Trash2, Eye, EyeOff, Loader2, Sun, Moon, AlertTriangle, Sparkles,
  Shirt, ExternalLink, CheckCircle2, Circle, Calendar, IndianRupee, Truck,
  Tag, Palette, Ruler, FileImage, RefreshCw, RefreshCcw, Copy, MoreVertical,
  Link as LinkIcon, Layers, RotateCw, RotateCcw, FlipHorizontal, Crop, Move,
  LifeBuoy, MessageSquare, Send, CreditCard, Smartphone
} from "lucide-react";
import { supabase, signIn, signOut, getSession } from "./supabase.js";

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
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);
  const [info,  setInfo]  = useState(null);

  // Map raw Supabase errors to user-friendly copy.
  const friendly = (msg) => {
    if (!msg) return "Something went wrong. Try again.";
    const m = String(msg).toLowerCase();
    if (m.includes("invalid login credentials")) return "Wrong email or password. Try again, or use Forgot password.";
    if (m.includes("email not confirmed"))       return "Your email isn't confirmed yet. Ask admin (or WhatsApp us) to flip the switch.";
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
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { brand_name: brandName, full_name: fullName, phone },
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
          <span className="pt-brand-mark" aria-hidden>
            <svg width="26" height="26" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
              <rect width="64" height="64" rx="14" fill="var(--pt-accent)"/>
              <path d="M 32 13 L 12 51" stroke="var(--pt-bg)" strokeWidth="6.5" strokeLinecap="round" fill="none"/>
              <path d="M 32 13 L 52 51" stroke="var(--pt-bg)" strokeWidth="6.5" strokeLinecap="round" fill="none"/>
              <line x1="21" y1="37" x2="43" y2="37" stroke="var(--pt-bg)" strokeWidth="4.5" strokeLinecap="round"/>
              <circle cx="50" cy="14" r="3" fill="var(--pt-success)"/>
            </svg>
          </span>
          <span className="pt-brand-wm">
            <span className="pt-brand-name">AVIVA</span>
            <span className="pt-brand-sub">INTERNATIONAL · CLIENT PORTAL</span>
          </span>
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
                <button type="button" className="pt-link-btn" onClick={() => alert("Forgot password? WhatsApp +91 and we'll reset it for you.")}>
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
                  ? "No email verification — pick a password now and you're in. We'll WhatsApp you once your tenant is provisioned."
                  : "Use the password you set when you signed up. Forgot it? WhatsApp us and we'll reset it."}
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
function PortalApp({ session, theme, setTheme }) {
  const [page, setPage]   = useState("overview");
  const [addingFor, setAddingFor]     = useState(null);
  const [myProducts, setMyProducts]   = useState([]);
  const [stores, setStores]           = useState([]);
  const [brandProfile, setBrandProfile] = useState({
    brandName: session.user.user_metadata?.brand_name || "Your brand",
    fullName:  session.user.user_metadata?.full_name  || session.user.email,
    email:     session.user.email,
    phone:     session.user.user_metadata?.phone || "",
  });

  // Wallet — local state until we wire Razorpay / Stripe.
  const [balance, setBalance]           = useState(0);          // ₹
  const [transactions, setTransactions] = useState([]);         // {id, ts, type, amount, note}
  const [rechargeOpen, setRechargeOpen] = useState(false);

  // Support tickets — local state until we wire to a Supabase tickets table.
  const [tickets, setTickets]           = useState([]);         // {id, subject, body, status, createdAt, messages: []}
  const [ticketsOpen, setTicketsOpen]   = useState(false);

  // Mock orders so the Orders page isn't blank — replace with real Shopify sync.
  const mockOrders = useMemo(() => [], []);

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  // Wallet handlers
  const addBalance = (amount, note = "Top-up") => {
    if (!amount || amount <= 0) return;
    const txn = {
      id: `txn-${Date.now()}`,
      ts: new Date().toISOString(),
      type: "topup",
      amount,
      note,
    };
    setTransactions(prev => [txn, ...prev]);
    setBalance(b => b + amount);
  };
  const refreshBalance = () => {
    // Placeholder — will hit Supabase RPC once wallet table lands.
    // For now just flash the icon by toggling a class via React; no-op state.
  };

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

  // Bulk-save from the AddProducts table (prepends N rows).
  const saveProducts = (newProducts) => {
    setMyProducts(prev => [...newProducts, ...prev]);
    setAddingFor(null);
    setPage("products");
  };

  const deleteProduct = (localId) => setMyProducts(prev => prev.filter(p => p.localId !== localId));

  const publishProduct = (localId, storeId) => setMyProducts(prev => prev.map(p => p.localId === localId ? { ...p, status: "published", storeId, publishedAt: new Date().toISOString() } : p));

  return (
    <div className="pt-app">
      <style>{PORTAL_CSS}</style>
      <PortalSidebar
        page={page} setPage={setPage}
        brandProfile={brandProfile} myProducts={myProducts}
      />
      <div className="pt-main">
        <PortalTicker brandProfile={brandProfile} myProducts={myProducts} stores={stores}/>
        <PortalTopBar
          brandProfile={brandProfile}
          theme={theme} toggleTheme={toggleTheme}
          balance={balance}
          onRefreshBalance={refreshBalance}
          onRecharge={() => setRechargeOpen(true)}
          onOpenTickets={() => setTicketsOpen(true)}
          ticketCount={tickets.filter(t => t.status === "open").length}
        />
        <div className="pt-page">
          {page === "overview"  && <Overview brandProfile={brandProfile} myProducts={myProducts} stores={stores} orders={mockOrders} goto={setPage} onAdd={() => setAddingFor({})} />}
          {page === "catalog"   && <Catalog onPick={(id) => setAddingFor({ blankId: id })} />}
          {page === "products"  && <MyProducts items={myProducts} stores={stores} onDelete={deleteProduct} onPublish={publishProduct} goto={setPage} onAdd={() => setAddingFor({})} />}
          {page === "stores"    && <Stores stores={stores} setStores={setStores} />}
          {page === "orders"    && <Orders orders={mockOrders} stores={stores} goto={setPage} />}
          {page === "wallet"    && <WalletPage brandProfile={brandProfile} balance={balance} transactions={transactions} onRecharge={() => setRechargeOpen(true)} />}
          {page === "settings"  && <SettingsPage brandProfile={brandProfile} setBrandProfile={setBrandProfile} />}
        </div>
      </div>

      {addingFor && (
        <AddProducts
          catalogBlank={addingFor.blankId ? CATALOG_MOCK.find(p => p.id === addingFor.blankId) : null}
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
function PortalSidebar({ page, setPage, brandProfile, myProducts }) {
  const draftCount = myProducts.filter(p => p.status === "draft").length;
  const publishedCount = myProducts.filter(p => p.status === "published").length;

  const nav = [
    { id: "overview", label: "Overview",    icon: LayoutDashboard },
    { id: "catalog",  label: "Catalog",     icon: Package },
    { id: "products", label: "My Products", icon: ShoppingBag, badge: myProducts.length || null },
    { id: "stores",   label: "Stores",      icon: Store },
    { id: "orders",   label: "Orders",      icon: ClipboardList },
    { id: "wallet",   label: "Wallet",      icon: Wallet },
    { id: "settings", label: "Settings",    icon: SettingsIcon },
  ];

  return (
    <aside className="pt-sidebar">
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
}) {
  const [spin, setSpin] = useState(false);
  const refresh = () => {
    setSpin(true);
    onRefreshBalance?.();
    setTimeout(() => setSpin(false), 700);
  };
  return (
    <header className="pt-topbar">
      <div className="pt-topbar-left">
        <div className="pt-date-chip"><Calendar size={12}/>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</div>
      </div>
      <div className="pt-topbar-right">
        {/* Wallet pill — current balance + manual refresh */}
        <div className="pt-wallet-pill" title="Wallet balance">
          <span className="pt-wallet-pill-icon"><Wallet size={14}/></span>
          <span className="pt-wallet-pill-amt">₹{(balance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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

// ─── PortalTicker — slim live-data strip mirroring the public Landing
// and admin dashboard, so brand partners feel the whole stack is alive.
function PortalTicker({ brandProfile, myProducts, stores }) {
  const drafts    = myProducts.filter(p => p.status === "draft").length;
  const published = myProducts.filter(p => p.status === "published").length;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 2200);
    return () => clearInterval(t);
  }, []);
  const events = [
    { kind: "ok",   verb: "QC PASS",     detail: "Aviva floor · 0 defects" },
    { kind: "info", verb: "PIPELINE",    detail: "Same-day dispatch · 200+ pcs/hr" },
    { kind: "warn", verb: "PRINTING",    detail: "DTF · 24 SKUs across brands" },
    { kind: "ok",   verb: "DISPATCHED",  detail: "30+ courier partners · live track" },
    { kind: "info", verb: "READY",       detail: "Connect a store to start publishing" },
  ];
  const e = events[tick % events.length];
  return (
    <>
      <style>{`
        .pt-ticker {
          background: #0F172A; color: #F1F5F9;
          border-bottom: 1px solid #1E293B;
          height: 28px; position: relative;
          font-family: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
          font-size: 10.5px;
        }
        .pt-ticker::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(129,140,248,0.55), transparent); }
        .pt-ticker-inner { display: flex; align-items: center; gap: 12px; height: 100%;
          padding: 0 16px; white-space: nowrap; overflow-x: auto; scrollbar-width: none;
          overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
        .pt-ticker-inner::-webkit-scrollbar { display: none; }
        @media (max-width: 560px) {
          .pt-ticker-inner > *:nth-child(n+4):nth-child(-n+9) { display: none; }
          .pt-tk-event { flex-shrink: 1; min-width: 0; }
          .pt-tk-event .detail { overflow: hidden; text-overflow: ellipsis; max-width: 38vw; display: inline-block; }
        }
        .pt-tk-status { display: inline-flex; align-items: center; gap: 7px; color: #34D399; font-weight: 700; letter-spacing: 0.12em; }
        .pt-tk-pulse { width: 6px; height: 6px; border-radius: 999px; background: #34D399;
          box-shadow: 0 0 0 0 rgba(52,211,153,0.55); animation: pt-tk-pulse 1.6s infinite; }
        @keyframes pt-tk-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(52,211,153,0.55); }
          70%  { box-shadow: 0 0 0 8px rgba(52,211,153,0); }
          100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
        }
        .pt-tk-sep { color: #334155; }
        .pt-tk-stat { display: inline-flex; align-items: baseline; gap: 6px; }
        .pt-tk-stat .l { color: #64748B; font-weight: 600; letter-spacing: 0.10em; }
        .pt-tk-stat .v { color: #F1F5F9; font-weight: 700; }
        .pt-tk-spacer { flex: 1; min-width: 18px; }
        .pt-tk-event { display: inline-flex; align-items: center; gap: 7px;
          padding: 3px 9px; border-radius: 4px; border: 1px solid #1c1c1c;
          animation: pt-tk-pop 0.4s ease-out; }
        @keyframes pt-tk-pop {
          from { opacity: 0; transform: translateX(6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .pt-tk-event-ok   { border-color: rgba(52,211,153,0.35); color: #34D399; }
        .pt-tk-event-warn { border-color: rgba(251,146,60,0.35); color: #FB923C; }
        .pt-tk-event-info { border-color: rgba(165,180,252,0.30); color: #A5B4FC; }
        .pt-tk-event .verb { font-weight: 800; letter-spacing: 0.08em; }
        .pt-tk-event .detail { color: #94A3B8; }
        @media (max-width: 720px) { .pt-tk-stat .l { display: none; } .pt-ticker-inner { gap: 9px; padding: 0 12px; } }
      `}</style>
      <div className="pt-ticker">
        <div className="pt-ticker-inner">
          <span className="pt-tk-status">
            <span className="pt-tk-pulse"/>
            <span>LIVE · AVIVA × {(brandProfile?.brandName || "").toUpperCase()}</span>
          </span>
          <span className="pt-tk-sep">/</span>
          <span className="pt-tk-stat"><span className="l">DRAFTS</span><span className="v">{drafts}</span></span>
          <span className="pt-tk-sep">/</span>
          <span className="pt-tk-stat"><span className="l">PUBLISHED</span><span className="v">{published}</span></span>
          <span className="pt-tk-sep">/</span>
          <span className="pt-tk-stat"><span className="l">STORES</span><span className="v">{stores.length}</span></span>
          <span className="pt-tk-sep">/</span>
          <span className="pt-tk-stat"><span className="l">CLOCK</span><span className="v">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span></span>
          <span className="pt-tk-spacer"/>
          <span className={`pt-tk-event pt-tk-event-${e.kind}`} key={tick}>
            <span className="verb">{e.verb}</span>
            <span className="detail">{e.detail}</span>
          </span>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: OVERVIEW
// ═══════════════════════════════════════════════════════════════════
function Overview({ brandProfile, myProducts, stores, orders, goto, onAdd }) {
  const isLive = (p) => p.status === "live" || p.status === "published";
  const drafts = myProducts.filter(p => !isLive(p)).length;
  const live   = myProducts.filter(isLive).length;
  const checklist = [
    { id: "store",   label: "Connect your Shopify store",     done: stores.length > 0,        goto: "stores"   },
    { id: "design",  label: "Add your first product",         done: myProducts.length > 0,    action: onAdd    },
    { id: "publish", label: "Link a Shopify product URL",     done: live > 0,                 goto: "products" },
    { id: "order",   label: "Receive your first order",       done: orders.length > 0,        goto: "orders"   },
  ];

  return (
    <div className="pt-dash">
      <PageHeader title={`Welcome, ${brandProfile.fullName.split(" ")[0]}.`} sub={`${brandProfile.brandName} · Client portal`} />

      <div className="pt-kpi-grid">
        <KPICard label="My products"  value={myProducts.length}  unit="registered" icon={ShoppingBag}    accent="yellow" onClick={() => goto("products")} />
        <KPICard label="Live"         value={live}               unit="on Shopify" icon={CheckCircle2}   accent="green"  onClick={() => goto("products")} />
        <KPICard label="Stores"       value={stores.length}      unit="connected"  icon={Store}          accent="cyan"   onClick={() => goto("stores")}    />
        <KPICard label="Orders"       value={orders.length}      unit="total"      icon={ClipboardList}  accent="amber"  onClick={() => goto("orders")}    />
      </div>

      <section className="pt-panel pt-mt">
        <div className="pt-panel-head">
          <div><h2>GET STARTED</h2><div className="pt-panel-sub">Four steps to your first live drop</div></div>
        </div>
        <div className="pt-checklist">
          {checklist.map((c, i) => (
            <button key={c.id} className={`pt-check-row ${c.done ? "done" : ""}`} onClick={() => c.action ? c.action() : goto(c.goto)}>
              <div className="pt-check-icon">
                {c.done ? <CheckCircle2 size={20}/> : <Circle size={20}/>}
              </div>
              <div className="pt-check-text">
                <div className="pt-check-step">STEP {i + 1}</div>
                <div className="pt-check-label">{c.label}</div>
              </div>
              <ChevronRight size={16}/>
            </button>
          ))}
        </div>
      </section>

      <div className="pt-two-col pt-mt">
        <section className="pt-panel">
          <div className="pt-panel-head">
            <div><h2>QUICK ACTIONS</h2><div className="pt-panel-sub">Jump straight in</div></div>
          </div>
          <div className="pt-qa-grid">
            <button className="pt-qa" onClick={onAdd}>
              <Plus size={18}/>
              <div>
                <div className="pt-qa-h">Add Products</div>
                <div className="pt-qa-p">Register name, price, design link, sizes, Shopify URL</div>
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
            <button className="pt-qa" onClick={() => goto("stores")}>
              <Store size={18}/>
              <div>
                <div className="pt-qa-h">Connect Shopify</div>
                <div className="pt-qa-p">Link your store for order sync</div>
              </div>
              <ArrowUpRight size={14}/>
            </button>
            <button className="pt-qa" onClick={() => goto("products")}>
              <ShoppingBag size={18}/>
              <div>
                <div className="pt-qa-h">My products</div>
                <div className="pt-qa-p">{myProducts.length} registered · {drafts} draft</div>
              </div>
              <ArrowUpRight size={14}/>
            </button>
          </div>
        </section>

        <section className="pt-panel">
          <div className="pt-panel-head">
            <div><h2>WHAT'S NEXT</h2><div className="pt-panel-sub">Coming to the portal</div></div>
          </div>
          <ul className="pt-roadmap">
            <li><Sparkles size={13}/> <span>Mockup studio — auto-generate lifestyle photos</span></li>
            <li><Sparkles size={13}/> <span>Bulk publish — push 20 products at once</span></li>
            <li><Sparkles size={13}/> <span>Inventory sync — auto-pause SKUs on stockout</span></li>
            <li><Sparkles size={13}/> <span>Per-order GST invoicing for B2B sales</span></li>
          </ul>
        </section>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: CATALOG
// ═══════════════════════════════════════════════════════════════════
function Catalog({ onPick }) {
  const [cat, setCat]   = useState("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let r = CATALOG_MOCK;
    if (cat !== "All") r = r.filter(p => p.category === cat);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(p => p.name.toLowerCase().includes(q) || p.fabric.toLowerCase().includes(q));
    }
    return r;
  }, [cat, search]);

  return (
    <div className="pt-dash">
      <PageHeader title="Catalog" sub={`${CATALOG_MOCK.length} blanks · pick one to customise`} />

      <div className="pt-cat-toolbar">
        <div className="pt-search">
          <Search size={14}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tees, hoodies, fabrics…" />
        </div>
        <div className="pt-cat-pills">
          <button className={`pt-cat-pill ${cat === "All" ? "on" : ""}`} onClick={() => setCat("All")}>All</button>
          {CATEGORIES.map(c => (
            <button key={c} className={`pt-cat-pill ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </div>

      <div className="pt-cat-grid">
        {filtered.map(p => (
          <button key={p.id} className="pt-cat-card" onClick={() => onPick(p.id)}>
            <div className="pt-cat-img">
              <img src={p.photoThumb || p.photo} alt={p.name} className="pt-cat-photo" loading="lazy"/>
              <div className="pt-cat-chip">PRODUCT {p.productNo}</div>
              <div className="pt-cat-pricepill">
                <span className="pt-cat-pricepill-l">ALL-IN</span>
                <span className="pt-cat-pricepill-v">₹{p.allInPrice}</span>
              </div>
            </div>
            <div className="pt-cat-body">
              <div className="pt-cat-name">{p.name}</div>
              <div className="pt-cat-fabric">{p.tagline || p.fabric}</div>
              <div className="pt-cat-row">
                <div className="pt-cat-price">
                  <span className="pt-cat-from">PLAIN ₹{p.basePrice} · DTF +₹{p.printAddon}</span>
                  <strong>₹{p.allInPrice}<small> / pc</small></strong>
                  <span className="pt-cat-mrp">{p.weight} · {p.printMethod}</span>
                </div>
                <div className="pt-cat-swatches">
                  {p.colors.slice(0, 6).map(cId => (
                    <span key={cId} className="pt-swatch" style={{ background: COLORS[cId]?.hex }} title={COLORS[cId]?.name} />
                  ))}
                  {p.colors.length > 6 && <span className="pt-swatch-more">+{p.colors.length - 6}</span>}
                </div>
              </div>
              <div className="pt-cat-specs">
                <span><strong>{p.colors.length}</strong> colours</span>
                <span><strong>{p.sizes.length}</strong> sizes</span>
                <span><strong>MOQ {p.moq}</strong></span>
              </div>
            </div>
            <div className="pt-cat-cta">Use this blank <ChevronRight size={14}/></div>
          </button>
        ))}
        {filtered.length === 0 && <div className="pt-empty pt-panel">No products match your filters.</div>}
      </div>

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
  const blankPrice = catalogBlank?.allInPrice || "";
  const blankName  = catalogBlank?.name || "";
  const newRow = () => ({
    id: `row-${Math.random().toString(36).slice(2, 8)}`,
    name: blankName,
    blankId: catalogBlank?.id || null,
    price: blankPrice,
    designLink: "",
    sizes: new Set(SIZES),
    shopifyLink: "",
  });
  const [rows, setRows]  = useState([newRow()]);
  const [busy, setBusy]  = useState(false);

  const updateRow = (idx, patch) => setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  const addRow    = () => setRows(rs => [...rs, newRow()]);
  const removeRow = (idx) => setRows(rs => rs.length > 1 ? rs.filter((_, i) => i !== idx) : rs);
  const toggleSize = (idx, s) => {
    const next = new Set(rows[idx].sizes);
    if (next.has(s)) next.delete(s); else next.add(s);
    updateRow(idx, { sizes: next });
  };

  const validRows = rows.filter(r => r.name.trim() && Number(r.price) > 0 && r.sizes.size > 0);
  const canSave   = validRows.length > 0 && !busy;

  const save = () => {
    if (!canSave) return;
    setBusy(true);
    const products = validRows.map(r => ({
      localId: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productName: r.name.trim(),
      title: r.name.trim(),                       // legacy compat for MyProducts card
      blankId: r.blankId,
      productId: r.blankId,                       // legacy compat
      price: Number(r.price),
      retailPrice: Number(r.price),               // legacy compat
      designLink: r.designLink.trim() || null,
      sizes: Array.from(r.sizes),
      shopifyLink: r.shopifyLink.trim() || null,
      status: r.shopifyLink.trim() ? "live" : "draft",
      designs: {},                                // empty until image flow returns
      createdAt: new Date().toISOString(),
    }));
    onSaveAll(products);
  };

  return (
    <div className="pt-modal" onClick={onClose}>
      <div className="pt-modal-card pt-modal-card-xl pt-ap-modal" onClick={e => e.stopPropagation()}>
        <button className="pt-modal-close" onClick={onClose} aria-label="Close"><X size={18}/></button>

        <div className="pt-ap-head">
          <div className="pt-ap-eyebrow">ADD PRODUCTS</div>
          <h2 className="pt-ap-h">{catalogBlank ? `Add products · ${catalogBlank.name}` : "Add products"}</h2>
          <p className="pt-ap-sub">
            Punch in the rows you want to fulfil. We'll match incoming Shopify orders to your design link and produce them. Image upload + mockup studio are coming back later — keep this clean for now.
          </p>
        </div>

        <div className="pt-ap-table-wrap">
          <div className="pt-ap-table">
            <div className="pt-ap-table-head">
              <div>PRODUCT CATEGORY</div>
              <div>PRODUCT NAME</div>
              <div>SELLING PRICE</div>
              <div>DESIGN LINK</div>
              <div>DESIGN SIZES</div>
              <div>PRODUCT LINK (SHOPIFY)</div>
              <div className="pt-ap-table-head-x"/>
            </div>

            {rows.map((r, idx) => {
              // Pull the picked catalog blank so we can show Aviva's cost
              // as a tiny annotation under the selling-price input.
              const blank = r.blankId ? CATALOG_MOCK.find(p => p.id === r.blankId) : null;
              return (
              <div key={r.id} className="pt-ap-row">
                <div className="pt-ap-select-cell">
                  <Package size={11}/>
                  <select
                    className="pt-ap-input pt-ap-select"
                    value={r.blankId || ""}
                    onChange={e => updateRow(idx, { blankId: e.target.value || null })}
                  >
                    <option value="">Select category…</option>
                    {CATALOG_MOCK.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <input
                  className="pt-ap-input"
                  value={r.name}
                  onChange={e => updateRow(idx, { name: e.target.value })}
                  placeholder="e.g. Hashway boxy tee black"
                />
                <div className="pt-ap-price-stack">
                  <div className="pt-ap-price-cell">
                    <IndianRupee size={11}/>
                    <input
                      className="pt-ap-input pt-ap-input-num"
                      type="number" min="0" inputMode="numeric"
                      value={r.price}
                      onChange={e => updateRow(idx, { price: e.target.value })}
                      placeholder="999"
                    />
                  </div>
                  {blank && <div className="pt-ap-price-hint">Aviva cost ₹{blank.allInPrice}</div>}
                </div>
                <div className="pt-ap-link-cell">
                  <LinkIcon size={11}/>
                  <input
                    className="pt-ap-input"
                    type="url"
                    value={r.designLink}
                    onChange={e => updateRow(idx, { designLink: e.target.value })}
                    placeholder="drive.google.com / dropbox.com / …"
                  />
                </div>
                <div className="pt-ap-sizes">
                  {SIZES.map(s => (
                    <button
                      key={s}
                      type="button"
                      className={`pt-ap-size ${r.sizes.has(s) ? "on" : ""}`}
                      onClick={() => toggleSize(idx, s)}
                    >{s}</button>
                  ))}
                </div>
                <div className="pt-ap-link-cell">
                  <Store size={11}/>
                  <input
                    className="pt-ap-input"
                    type="url"
                    value={r.shopifyLink}
                    onChange={e => updateRow(idx, { shopifyLink: e.target.value })}
                    placeholder="yourstore.myshopify.com/products/…"
                  />
                </div>
                <button
                  type="button"
                  className="pt-ap-remove"
                  onClick={() => removeRow(idx)}
                  disabled={rows.length === 1}
                  title="Remove this row"
                ><X size={14}/></button>
              </div>
              );
            })}
          </div>

          <button type="button" className="pt-ap-addrow" onClick={addRow}>
            <Plus size={13}/> Add another product
          </button>
        </div>

        <div className="pt-ap-foot">
          <div className="pt-ap-foot-hint">
            {validRows.length > 0
              ? <><CheckCircle2 size={12}/> {validRows.length} of {rows.length} row{rows.length === 1 ? "" : "s"} ready to save</>
              : <><AlertTriangle size={12}/> Each row needs a name, a price, and at least one size.</>}
          </div>
          <div className="pt-ap-foot-actions">
            <button className="pt-btn-ghost" onClick={onClose}>Cancel</button>
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
  // Normalise status across legacy + new shapes so filter pills work.
  const statusOf = (i) => i.status === "live" || i.status === "published" ? "live" : "draft";
  const filtered = items.filter(i => filter === "all" || statusOf(i) === filter);

  if (items.length === 0) {
    return (
      <div className="pt-dash">
        <PageHeader title="My Products" sub="Products you've registered for Aviva fulfilment" />
        <div className="pt-empty-state pt-panel">
          <ShoppingBag size={32}/>
          <h3>No products yet.</h3>
          <p>Add a product — punch in the name, price, design link, sizes, and your Shopify product URL. We'll match incoming orders to your design.</p>
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

      <section className="pt-panel pt-mp-table-wrap" style={{ padding: 0, overflow: "auto" }}>
        <table className="pt-mp-table">
          <thead>
            <tr>
              <th>Product name</th>
              <th>Price</th>
              <th>Design link</th>
              <th>Sizes</th>
              <th>Product link (Shopify)</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const isLive = statusOf(item) === "live";
              const price  = item.price ?? item.retailPrice ?? 0;
              const sizes  = Array.isArray(item.sizes) ? item.sizes : [];
              const name   = item.productName || item.title || "Untitled";
              const designLink  = item.designLink;
              const shopifyLink = item.shopifyLink;
              return (
                <tr key={item.localId}>
                  <td><strong>{name}</strong></td>
                  <td>₹{price.toLocaleString("en-IN")}</td>
                  <td>
                    {designLink
                      ? <a className="pt-mp-link" href={designLink} target="_blank" rel="noopener noreferrer"><LinkIcon size={11}/> Open</a>
                      : <span className="pt-mp-empty">—</span>}
                  </td>
                  <td>
                    <div className="pt-mp-sizes">
                      {sizes.length === 0
                        ? <span className="pt-mp-empty">—</span>
                        : sizes.map(s => <span key={s} className="pt-mp-size-chip">{s}</span>)}
                    </div>
                  </td>
                  <td>
                    {shopifyLink
                      ? <a className="pt-mp-link" href={shopifyLink} target="_blank" rel="noopener noreferrer"><Store size={11}/> Open</a>
                      : <span className="pt-mp-empty">—</span>}
                  </td>
                  <td>
                    <span className={`pt-mp-status-chip pt-mp-status-chip-${isLive ? "live" : "draft"}`}>
                      {isLive ? <CheckCircle2 size={10}/> : <Circle size={10}/>}
                      {isLive ? "LIVE" : "DRAFT"}
                    </span>
                  </td>
                  <td>
                    <button className="pt-mp-row-x" onClick={() => { if (confirm(`Delete "${name}"?`)) onDelete(item.localId); }} title="Delete">
                      <Trash2 size={13}/>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
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
  const [adding, setAdding] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [busy, setBusy] = useState(false);

  const connect = (e) => {
    e.preventDefault();
    setBusy(true);
    // UI scaffold: real flow is Shopify OAuth redirect → callback writes store row in Supabase.
    // For now we just add it to local state with a "pending" status.
    const clean = shopDomain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    setTimeout(() => {
      setStores(prev => [...prev, {
        id: `store-${Date.now()}`,
        name: clean.split(".")[0] || clean,
        domain: clean,
        status: "connected",
        connectedAt: new Date().toISOString(),
      }]);
      setShopDomain("");
      setAdding(false);
      setBusy(false);
    }, 500);
  };

  return (
    <div className="pt-dash">
      <PageHeader title="Stores" sub="Shopify stores connected to your brand" />

      {stores.length === 0 && !adding && (
        <div className="pt-empty-state pt-panel">
          <Store size={32}/>
          <h3>Connect your Shopify store.</h3>
          <p>Once connected, you can push designs straight from your portal to your store as products — with inventory, mockups, and pricing already set.</p>
          <button className="pt-btn-primary" onClick={() => setAdding(true)}><Plus size={14}/> Connect a store</button>
        </div>
      )}

      {stores.length > 0 && (
        <>
          <div className="pt-cat-toolbar">
            <div className="pt-cat-pills"><button className="pt-cat-pill on">Shopify</button></div>
            <button className="pt-btn-primary pt-btn-sm" onClick={() => setAdding(true)}><Plus size={13}/> Add store</button>
          </div>
          <div className="pt-store-grid">
            {stores.map(s => (
              <div key={s.id} className="pt-store-card">
                <div className="pt-store-logo">
                  <svg width="36" height="36" viewBox="0 0 109 124" fill="#95BF47" xmlns="http://www.w3.org/2000/svg"><path d="M74.7 23.7s-1.4.4-3.6 1.1c-.4-1.2-1-2.7-1.7-4.1-2.5-4.7-6.1-7.2-10.4-7.2-.3 0-.6 0-.9.1-.1-.2-.3-.3-.4-.5-1.9-2.1-4.4-3.1-7.3-3-5.7.2-11.4 4.3-16 11.6-3.3 5.1-5.8 11.5-6.5 16.5-6.5 2-11.1 3.4-11.2 3.5-3.3 1-3.4 1.1-3.8 4.2C12.5 48.3 4 113.7 4 113.7l71.2 12.3 30.9-7.7s-31.3-94.4-31.4-94.6zm-12.1-3c-2 .6-4.3 1.3-6.7 2.1 0-3.4-.4-8.1-2-12.2 5 .9 7.5 6.6 8.7 10.1zm-10.8 3.3c-4.6 1.4-9.7 3-14.8 4.6 1.4-5.5 4.2-11 7.5-14.6 1.2-1.4 3-2.9 5-3.8 2 4.2 2.4 10.2 2.3 13.8zM43.6 9.4c1.7 0 3.1.4 4.3 1.1-1.9 1-3.8 2.4-5.5 4.3-4.5 4.8-7.9 12.2-9.3 19.4-4.3 1.3-8.5 2.6-12.3 3.8C23.1 26.5 32.6 9.6 43.6 9.4z"/></svg>
                </div>
                <div className="pt-store-body">
                  <div className="pt-store-name">{s.name}</div>
                  <div className="pt-store-domain">{s.domain}</div>
                  <div className="pt-store-status"><span className="pt-pulse"/> Connected · {new Date(s.connectedAt).toLocaleDateString("en-IN")}</div>
                </div>
                <button className="pt-btn-ghost pt-btn-sm" onClick={() => { if (confirm(`Disconnect ${s.domain}?`)) setStores(prev => prev.filter(x => x.id !== s.id)); }}>Disconnect</button>
              </div>
            ))}
          </div>
        </>
      )}

      {adding && (
        <div className="pt-modal" onClick={() => !busy && setAdding(false)}>
          <div className="pt-modal-card pt-modal-card-sm" onClick={e => e.stopPropagation()}>
            <button className="pt-modal-close" onClick={() => !busy && setAdding(false)} aria-label="Close"><X size={18}/></button>
            <h2 className="pt-pd-h">Connect Shopify store</h2>
            <p className="pt-pd-blurb">Enter your store's <code>.myshopify.com</code> domain. You'll be redirected to Shopify to authorise access.</p>
            <form onSubmit={connect} className="pt-auth-form" style={{ marginTop: 18 }}>
              <label className="pt-field">
                <span>Shop domain</span>
                <input value={shopDomain} onChange={e => setShopDomain(e.target.value)} placeholder="yourstore.myshopify.com" required pattern=".*myshopify\.com.*"/>
              </label>
              <div className="pt-pd-actions" style={{ marginTop: 18, paddingTop: 0, borderTop: "none" }}>
                <button type="button" className="pt-btn-ghost" onClick={() => setAdding(false)} disabled={busy}>Cancel</button>
                <button type="submit" className="pt-btn-primary" disabled={busy}>{busy ? <><Loader2 className="pt-spin" size={14}/> Connecting…</> : <>Authorise on Shopify <ExternalLink size={13}/></>}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: ORDERS
// ═══════════════════════════════════════════════════════════════════
function Orders({ orders, stores = [], goto }) {
  const hasStores = stores.length > 0;
  if (orders.length === 0) {
    return (
      <div className="pt-dash">
        <PageHeader title="Orders" sub="Orders synced from your connected stores" />

        {/* No-stores state: lead with the "Connect Shopify" CTA */}
        {!hasStores ? (
          <div className="pt-empty-state pt-panel pt-orders-empty">
            <div className="pt-orders-empty-icon"><Store size={28}/></div>
            <h3>Connect your Shopify store first.</h3>
            <p>Orders only flow into this page once a store is linked. Hit the button below — takes 30 seconds. After that, every sale on your Shopify automatically lands here with status new → in production → packed → in transit → delivered.</p>
            <div className="pt-orders-empty-actions">
              <button className="pt-btn-primary" onClick={() => goto?.("stores")}>
                <Store size={14}/> Connect Shopify
              </button>
              <a className="pt-btn-ghost pt-orders-empty-help" href="https://help.shopify.com/manual/intro-to-shopify/initial-setup/setup-business-settings" target="_blank" rel="noopener noreferrer">
                What's a Shopify URL? <ExternalLink size={11}/>
              </a>
            </div>
            <div className="pt-orders-empty-strip">
              <div><span className="pt-orders-empty-strip-l">SYNC</span><span>One-time OAuth</span></div>
              <div><span className="pt-orders-empty-strip-l">LATENCY</span><span>Real-time webhook</span></div>
              <div><span className="pt-orders-empty-strip-l">FULFILMENT</span><span>Same-day dispatch</span></div>
            </div>
          </div>
        ) : (
          /* Stores connected but no orders yet — wait-for-first-sale state */
          <div className="pt-empty-state pt-panel">
            <ClipboardList size={32}/>
            <h3>No orders yet.</h3>
            <p>{stores.length} store{stores.length === 1 ? "" : "s"} connected. The moment a sale comes in on Shopify, it'll show up here with status: new → in production → packed → in transit → delivered.</p>
            <div className="pt-orders-empty-actions">
              <button className="pt-btn-primary" onClick={() => goto?.("products")}>
                <ShoppingBag size={14}/> Review my products
              </button>
              <button className="pt-btn-ghost" onClick={() => goto?.("stores")}>
                <Store size={14}/> Manage stores
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="pt-dash">
      <PageHeader title="Orders" sub={`${orders.length} total`} />
      {/* Wire to fetchShopifyOrders() once stores ship orders */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: WALLET
// ═══════════════════════════════════════════════════════════════════
function WalletPage({ brandProfile, balance = 0, transactions = [], onRecharge }) {
  return (
    <div className="pt-dash">
      <PageHeader title="Wallet" sub="Top up before each batch · Per-order debit on dispatch" />
      <div className="pt-wallet-grid">
        <section className="pt-panel pt-wallet-bal">
          <div className="pt-wallet-label">CURRENT BALANCE</div>
          <div className="pt-wallet-amount">₹{balance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="pt-wallet-sub">{transactions.length === 0 ? "No top-ups yet" : `${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`}</div>
          <button className="pt-btn-primary" onClick={onRecharge}><Plus size={14}/> Top up wallet</button>
        </section>
        <section className="pt-panel">
          <div className="pt-panel-head"><div><h2>RECENT TRANSACTIONS</h2><div className="pt-panel-sub">Top-ups and per-order debits</div></div></div>
          {transactions.length === 0 ? (
            <div className="pt-empty">No transactions yet. Top up to start publishing.</div>
          ) : (
            <div className="pt-wallet-txn-list">
              {transactions.map(t => (
                <div key={t.id} className="pt-wallet-txn">
                  <div className={`pt-wallet-txn-icon pt-wallet-txn-icon-${t.type}`}>
                    {t.type === "topup" ? <Plus size={14}/> : <ArrowUpRight size={14}/>}
                  </div>
                  <div className="pt-wallet-txn-meta">
                    <div className="pt-wallet-txn-note">{t.note}</div>
                    <div className="pt-wallet-txn-ts">{new Date(t.ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
                  </div>
                  <div className={`pt-wallet-txn-amt pt-wallet-txn-amt-${t.type}`}>
                    {t.type === "topup" ? "+" : "−"}₹{t.amount.toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RECHARGE MODAL — preset amount tiles + custom + payment method
// ═══════════════════════════════════════════════════════════════════
const RECHARGE_PRESETS = [500, 1000, 2500, 5000, 10000];
function RechargeModal({ balance, onClose, onAdd }) {
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState("UPI");
  const [busy, setBusy] = useState(false);
  const effective = custom ? Number(custom) || 0 : amount;
  const canSubmit = effective >= 100 && !busy;
  const submit = () => {
    if (!canSubmit) return;
    setBusy(true);
    // Placeholder — real Razorpay integration plugs in here.
    setTimeout(() => { onAdd(effective, method); }, 600);
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
          </div>
        </div>

        <div className="pt-rc-foot">
          <div className="pt-rc-foot-amt">
            <span>Adding</span>
            <strong>₹{effective.toLocaleString("en-IN")}</strong>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="pt-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="pt-btn-primary" onClick={submit} disabled={!canSubmit}>
              {busy ? <><Loader2 className="pt-spin" size={14}/> Processing…</> : <>Pay ₹{effective.toLocaleString("en-IN")} <ArrowRight size={13}/></>}
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
                  No tickets yet. Got a question about an order, a design, or your wallet? Drop us a line.
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
    </div>
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
/* ─── Brand palette · Slate base + Indigo accent (Tailwind slate / indigo) */
:root {
  --pt-bg:           #0F172A;          /* slate-900 */
  --pt-bg-elev:      #1E293B;          /* slate-800 */
  --pt-bg-soft:      #162033;
  --pt-bg-card:      #1E293B;          /* slate-800 */
  --pt-text:         #CBD5E1;          /* slate-300 */
  --pt-text-strong:  #F1F5F9;          /* slate-100 */
  --pt-text-dim:     #94A3B8;          /* slate-400 */
  --pt-text-muted:   #64748B;          /* slate-500 */
  --pt-border:       #1E293B;          /* slate-800 */
  --pt-border-hover: #334155;          /* slate-700 */
  --pt-accent:       #818CF8;          /* indigo-400 */
  --pt-accent-ink:   #0F172A;          /* dark text on indigo button */
  --pt-accent-soft:  rgba(129, 140, 248, 0.10);
  --pt-accent-glow:  rgba(129, 140, 248, 0.28);
  --pt-success:      #34D399;          /* emerald-400 */
  --pt-success-glow: rgba(52, 211, 153, 0.20);
  --pt-err:          #FB7185;          /* rose-400 */
  --pt-err-glow:     rgba(251, 113, 133, 0.18);
  --pt-cyan:         #22D3EE;          /* cyan-400 */
  --pt-amber:        #FB923C;          /* orange-400 (replaces yellow amber) */
  color-scheme: dark;
}
:root[data-theme="light"] {
  --pt-bg:           #F8FAFC;          /* slate-50 */
  --pt-bg-elev:      #FFFFFF;
  --pt-bg-soft:      #F1F5F9;          /* slate-100 */
  --pt-bg-card:      #FFFFFF;
  --pt-text:         #334155;          /* slate-700 */
  --pt-text-strong:  #0F172A;          /* slate-900 */
  --pt-text-dim:     #64748B;          /* slate-500 */
  --pt-text-muted:   #94A3B8;          /* slate-400 */
  --pt-border:       #E2E8F0;          /* slate-200 */
  --pt-border-hover: #CBD5E1;          /* slate-300 */
  --pt-accent:       #4F46E5;          /* indigo-600 */
  --pt-accent-ink:   #FFFFFF;
  --pt-accent-soft:  rgba(79, 70, 229, 0.08);
  --pt-accent-glow:  rgba(79, 70, 229, 0.22);
  --pt-success:      #10B981;          /* emerald-500 */
  --pt-success-glow: rgba(16, 185, 129, 0.18);
  --pt-err:          #E11D48;          /* rose-600 */
  --pt-err-glow:     rgba(225, 29, 72, 0.14);
  --pt-cyan:         #0891B2;          /* cyan-600 */
  --pt-amber:        #EA580C;          /* orange-600 */
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
  color: var(--pt-text-dim); font-size: 13px; font-weight: 600;
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
.pt-foot-logout { width: 100%; justify-content: center; }

.pt-main { display: flex; flex-direction: column; min-width: 0; }
.pt-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 24px; border-bottom: 1px solid var(--pt-border);
  background: var(--pt-bg-elev);
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
.pt-wallet-txn-list { display: flex; flex-direction: column; gap: 4px; }
.pt-wallet-txn {
  display: grid; grid-template-columns: 36px 1fr auto; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 8px; transition: background 0.12s;
}
.pt-wallet-txn:hover { background: var(--pt-bg-soft); }
.pt-wallet-txn-icon {
  width: 30px; height: 30px; border-radius: 8px;
  display: grid; place-items: center;
}
.pt-wallet-txn-icon-topup { background: var(--pt-success-glow); color: var(--pt-success); }
.pt-wallet-txn-icon-debit { background: rgba(248, 113, 113, 0.16); color: var(--pt-err); }
.pt-wallet-txn-note { font-size: 13px; font-weight: 700; color: var(--pt-text-strong); }
.pt-wallet-txn-ts { font-size: 11px; color: var(--pt-text-muted); }
.pt-wallet-txn-amt {
  font-family: ui-monospace, monospace;
  font-size: 14px; font-weight: 800; letter-spacing: -0.01em;
}
.pt-wallet-txn-amt-topup { color: var(--pt-success); }
.pt-wallet-txn-amt-debit { color: var(--pt-err); }

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

.pt-ap-table-wrap {
  flex: 1; overflow: auto;
  padding: 20px 32px;
  display: flex; flex-direction: column; gap: 10px;
}
.pt-ap-table {
  background: var(--pt-bg-soft);
  border: 1px solid var(--pt-border);
  border-radius: 12px;
  overflow: visible;
  min-width: 1240px;
}
.pt-ap-table-head, .pt-ap-row {
  display: grid;
  grid-template-columns:
    minmax(170px, 1.05fr)  /* product category */
    minmax(180px, 1.3fr)   /* product name */
    minmax(130px, 0.8fr)   /* selling price */
    minmax(200px, 1.3fr)   /* design link */
    minmax(220px, 1.3fr)   /* design sizes */
    minmax(220px, 1.5fr)   /* shopify link */
    34px;                   /* remove */
  align-items: center;
  gap: 0;
}
.pt-ap-table-head {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10px; letter-spacing: 0.14em; font-weight: 800;
  color: var(--pt-text-muted); text-transform: uppercase;
  padding: 12px 14px;
  border-bottom: 1px solid var(--pt-border);
  background: var(--pt-bg-elev);
  border-radius: 12px 12px 0 0;
}
.pt-ap-table-head > div { padding: 0 8px; }
.pt-ap-table-head-x {}
.pt-ap-row {
  padding: 10px 14px;
  border-bottom: 1px solid var(--pt-border);
}
.pt-ap-row:last-child { border-bottom: 0; }
.pt-ap-row > * { padding: 0 8px; }

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
  background: color-mix(in srgb, #8b5cf6 14%, var(--pt-bg-elev));
  color: #a78bfa;
}
.pt-pd2-stage-btn-align:hover:not(:disabled) { background: color-mix(in srgb, #8b5cf6 22%, var(--pt-bg-elev)); }
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
  background: var(--pt-success); color: #0F172A;
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
.pt-pd-steps li.done .pt-pd-step-no { background: var(--pt-success); color: #0F172A; }
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
.pt-wallet-grid { display: grid; grid-template-columns: 320px 1fr; gap: 14px; }
.pt-wallet-bal { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.pt-wallet-label { font-size: 10.5px; letter-spacing: 0.16em; font-weight: 800; color: var(--pt-text-muted); text-transform: uppercase; }
.pt-wallet-amount { font-size: 38px; font-weight: 800; color: var(--pt-text-strong); letter-spacing: -0.02em; }
.pt-wallet-sub { font-size: 12px; color: var(--pt-text-muted); margin-bottom: 12px; }

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
  .pt-settings-grid { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .pt-app { grid-template-columns: 1fr; }
  .pt-sidebar {
    position: static; height: auto;
    flex-direction: row; overflow-x: auto;
    padding: 8px; gap: 4px;
  }
  .pt-logo { border-bottom: 0; padding: 12px 14px; flex-shrink: 0; }
  .pt-nav { flex-direction: row; padding: 12px 4px; }
  .pt-nav-item { flex-shrink: 0; }
  .pt-sidebar-foot { display: none; }
  .pt-page { padding: 18px; }
  .pt-kpi-grid { grid-template-columns: 1fr 1fr; }
  .pt-page-head h1 { font-size: 22px; }
  .pt-qa-grid { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .pt-kpi-grid { grid-template-columns: 1fr; }
  .pt-cat-toolbar { flex-direction: column; align-items: stretch; }
  .pt-search { min-width: 0; }
}
`;
