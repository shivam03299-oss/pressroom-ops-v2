import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Package, ShoppingBag, Store, ClipboardList, Wallet,
  Settings as SettingsIcon, LogIn, LogOut, Plus, Search, Filter, X, Check,
  ChevronRight, ChevronLeft, ArrowRight, ArrowUpRight, Upload, Image as ImageIcon,
  Edit3, Trash2, Eye, EyeOff, Loader2, Sun, Moon, AlertTriangle, Sparkles,
  Shirt, ExternalLink, CheckCircle2, Circle, Calendar, IndianRupee, Truck,
  Tag, Palette, Ruler, FileImage, RefreshCw, Copy, MoreVertical, Link as LinkIcon
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

// ─── Mock catalog (replace when real data arrives) ─────────────────────
const COLORS = {
  black:    { name: "Jet black",    hex: "#0a0a0a", ink: "#ffffff" },
  white:    { name: "Off white",    hex: "#f3f3ee", ink: "#1a1a1a" },
  charcoal: { name: "Charcoal",     hex: "#2b2b2b", ink: "#ffffff" },
  olive:    { name: "Olive",        hex: "#5d5a3a", ink: "#ffffff" },
  sand:     { name: "Sand",         hex: "#d6c8aa", ink: "#1a1a1a" },
  navy:     { name: "Navy",         hex: "#1a2438", ink: "#ffffff" },
  maroon:   { name: "Maroon",       hex: "#5b1f24", ink: "#ffffff" },
  forest:   { name: "Forest green", hex: "#1f4232", ink: "#ffffff" },
  mustard:  { name: "Mustard",      hex: "#c79f2a", ink: "#1a1a1a" },
  baby:     { name: "Baby blue",    hex: "#bcd3e0", ink: "#1a1a1a" },
  blush:    { name: "Blush pink",   hex: "#e7c0bd", ink: "#1a1a1a" },
  lilac:    { name: "Lilac",        hex: "#c5b6d8", ink: "#1a1a1a" },
};

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

const CATALOG_MOCK = [
  { id: "tee-classic-180",  category: "T-Shirts",  name: "Classic round-neck tee",   fabric: "180 GSM ring-spun cotton",  basePrice: 199, mrpHint: 599, colors: ["black","white","olive","navy","maroon","baby","blush"], sizes: SIZES, shape: "tee",      print: "Front · Back · Sleeves",  blurb: "The everyday tee. Pre-shrunk, bio-washed, soft hand-feel." },
  { id: "tee-oversize-240", category: "T-Shirts",  name: "Oversized drop-shoulder",  fabric: "240 GSM combed cotton",     basePrice: 279, mrpHint: 899, colors: ["black","white","sand","charcoal","forest","mustard"],     sizes: SIZES, shape: "tee-over", print: "Front · Back · Sleeves",  blurb: "Streetwear staple. Heavier weight, longer body, dropped shoulder." },
  { id: "tee-acid-220",     category: "T-Shirts",  name: "Acid-wash boxy tee",       fabric: "220 GSM acid-washed cotton",basePrice: 329, mrpHint: 999, colors: ["black","navy","olive","maroon"],                          sizes: SIZES, shape: "tee-over", print: "Front · Back",            blurb: "Each piece washes slightly different — unique vintage feel." },
  { id: "hood-classic-340", category: "Hoodies",   name: "Pullover hoodie",          fabric: "340 GSM brushed fleece",    basePrice: 599, mrpHint: 1499, colors: ["black","navy","maroon","forest","charcoal"],            sizes: SIZES, shape: "hoodie",   print: "Front · Back · Hood",     blurb: "Heavyweight pullover. Kangaroo pocket, ribbed cuffs, drawstring hood." },
  { id: "hood-zip-340",     category: "Hoodies",   name: "Full-zip hoodie",          fabric: "340 GSM brushed fleece",    basePrice: 699, mrpHint: 1699, colors: ["black","navy","olive","sand"],                          sizes: SIZES, shape: "hoodie",   print: "Front · Back · Hood",     blurb: "Premium zip hoodie. YKK zip, metal eyelets, lined hood." },
  { id: "crew-classic-300", category: "Sweatshirts", name: "Crewneck sweatshirt",    fabric: "300 GSM brushed fleece",    basePrice: 499, mrpHint: 1299, colors: ["black","white","navy","mustard","forest","lilac"],     sizes: SIZES, shape: "crew",     print: "Front · Back · Sleeves",  blurb: "Soft inside, structured outside. Pairs with everything." },
  { id: "tank-classic-180", category: "T-Shirts",  name: "Athletic tank top",        fabric: "180 GSM cotton-spandex",    basePrice: 229, mrpHint: 649, colors: ["black","white","charcoal","navy","maroon"],              sizes: SIZES, shape: "tank",     print: "Front · Back",            blurb: "Breathable cotton-spandex blend with 4-way stretch." },
  { id: "polo-classic-220", category: "Polos",     name: "Pique polo",               fabric: "220 GSM pique cotton",      basePrice: 349, mrpHint: 999, colors: ["black","white","navy","sand","maroon"],                  sizes: SIZES, shape: "polo",     print: "Front (chest) · Back",    blurb: "Classic 3-button placket. Tipped collar, side vents." },
  { id: "long-classic-200", category: "T-Shirts",  name: "Long-sleeve tee",          fabric: "200 GSM combed cotton",     basePrice: 299, mrpHint: 799, colors: ["black","white","olive","navy","charcoal"],               sizes: SIZES, shape: "long",     print: "Front · Back · Sleeves",  blurb: "Ribbed cuffs, slim athletic fit." },
  { id: "joggers-300",      category: "Bottoms",   name: "Tapered joggers",          fabric: "300 GSM brushed fleece",    basePrice: 549, mrpHint: 1399, colors: ["black","charcoal","navy","olive"],                     sizes: SIZES, shape: "joggers",  print: "Left leg",                blurb: "Drop-crotch fit, elastic waist, ribbed cuffs, side pockets." },
  { id: "shorts-220",       category: "Bottoms",   name: "Cotton lounge shorts",     fabric: "220 GSM cotton",            basePrice: 349, mrpHint: 899, colors: ["black","navy","olive","sand","maroon"],                  sizes: SIZES, shape: "shorts",   print: "Left leg",                blurb: "Mid-thigh length, drawstring waist, side pockets." },
  { id: "cap-cotton",       category: "Headwear",  name: "6-panel dad cap",          fabric: "100% washed cotton",        basePrice: 249, mrpHint: 699, colors: ["black","white","navy","olive","maroon"],                 sizes: ["OS"],shape: "cap",      print: "Front · Back",            blurb: "Curved brim, brass buckle, unstructured crown." },
  { id: "beanie-knit",      category: "Headwear",  name: "Knit beanie",              fabric: "Acrylic-wool blend",        basePrice: 199, mrpHint: 549, colors: ["black","charcoal","navy","olive","maroon"],              sizes: ["OS"],shape: "beanie",   print: "Cuff (woven label)",      blurb: "Soft knit, ribbed cuff, one-size fits all." },
  { id: "tote-canvas",      category: "Accessories", name: "Canvas tote bag",        fabric: "12 oz heavy canvas",        basePrice: 199, mrpHint: 549, colors: ["white","black","sand"],                                 sizes: ["OS"],shape: "tote",     print: "Front · Back",            blurb: "Reinforced straps, gusseted base, internal pocket." },
  { id: "mug-ceramic",      category: "Accessories", name: "Ceramic mug 11oz",       fabric: "Glossy ceramic",            basePrice: 149, mrpHint: 399, colors: ["white"],                                                 sizes: ["OS"],shape: "mug",      print: "Wrap-around",             blurb: "Dishwasher-safe sublimation print. 11oz capacity." },
];

const CATEGORIES = Array.from(new Set(CATALOG_MOCK.map(p => p.category)));

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
// ─── AUTH: passwordless email OTP with magic-link backup ───────────────
// The email Supabase sends includes BOTH a 6-digit code AND a magic link
// (we customise the template in the Supabase dashboard to include both).
// Users on phones tap the link; users on desktop type the code. Same flow
// for sign-in and sign-up; the only difference is sign-up also collects
// brand metadata which we stash in the auth user's user_metadata.
function PortalAuth({ theme, setTheme, initialMode = "signin" }) {
  const [mode, setMode] = useState(initialMode); // "signin" | "signup"
  const [step, setStep] = useState("form");      // "form" | "code"
  const [email,     setEmail]     = useState("");
  const [brandName, setBrandName] = useState("");
  const [fullName,  setFullName]  = useState("");
  const [phone,     setPhone]     = useState("");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);
  const [info,  setInfo]  = useState(null);

  // Resend cooldown — 30s after every send, including the initial one.
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendCode = async (e) => {
    if (e) e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try {
      // signInWithOtp does double-duty: creates a user if absent, signs in
      // if present (gated by shouldCreateUser below). The same email then
      // contains both the 6-digit code and a magic link URL.
      const opts = {
        // emailRedirectTo controls where the magic link sends them. In dev
        // (localhost) and production this resolves to the right host
        // automatically. The hash fragment is consumed by detectSessionInUrl
        // and onAuthStateChange fires → parent flips to <PortalApp/>.
        emailRedirectTo: `${window.location.origin}/portal`,
        shouldCreateUser: mode === "signup",
        ...(mode === "signup" && {
          data: { brand_name: brandName, full_name: fullName, phone },
        }),
      };
      const { error: err } = await supabase.auth.signInWithOtp({ email, options: opts });
      if (err) throw err;
      setStep("code");
      setCooldown(30);
      setInfo("Code sent. It usually arrives in under a minute — check spam if not.");
    } catch (e2) {
      setError(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (token) => {
    setBusy(true); setError(null);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (err) throw err;
      // onAuthStateChange in <Portal/> picks up the new session and flips
      // the tree to <PortalApp/>. Nothing else to do here.
    } catch (e2) {
      setError(e2.message || String(e2));
      setBusy(false);
    }
  };

  const resend = () => { if (cooldown === 0 && !busy) sendCode(); };

  const goBackToForm = () => {
    setStep("form"); setError(null); setInfo(null);
  };

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  return (
    <div className="pt-auth">
      <style>{PORTAL_CSS}</style>
      <div className="pt-auth-bg" />

      <header className="pt-auth-nav">
        <a href="/" className="pt-auth-brand">AVIVA INTERNATIONAL <span>· CLIENT PORTAL</span></a>
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
            {step === "form" ? (
              <>
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
                    ? "Enter your email — we'll send a 6-digit code."
                    : "Tell us about your brand. We'll send a code to verify your email."}
                </p>

                <form onSubmit={sendCode} className="pt-auth-form">
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

                  {error && <div className="pt-alert pt-alert-err"><AlertTriangle size={13}/> {error}</div>}

                  <button type="submit" className="pt-btn-primary" disabled={busy}>
                    {busy ? <><Loader2 size={14} className="pt-spin"/> Sending…</> : <>Send code <ArrowRight size={14}/></>}
                  </button>

                  <div className="pt-auth-switch">
                    {mode === "signin"
                      ? <>New here? <button type="button" onClick={() => { setMode("signup"); setError(null); }}>Apply to onboard →</button></>
                      : <>Already a partner? <button type="button" onClick={() => { setMode("signin"); setError(null); }}>Sign in →</button></>}
                  </div>

                  <div className="pt-auth-helper">
                    No password. We'll send a one-time code to your email. You can either type the code into this page, or just tap the magic link we include in the same email.
                  </div>
                </form>
              </>
            ) : (
              <OtpEntry
                email={email}
                busy={busy}
                error={error}
                info={info}
                cooldown={cooldown}
                onVerify={verifyCode}
                onResend={resend}
                onBack={goBackToForm}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 6-box OTP entry ───────────────────────────────────────────────────
// Auto-advances on keypress, accepts a 6-digit paste, retreats on
// backspace, and auto-submits once all six boxes are filled. The same
// email contains a magic link — if the user clicks it instead, Supabase
// handles the hash fragment, onAuthStateChange fires in <Portal/>, and
// this component is unmounted on its own. No additional code needed.
function OtpEntry({ email, busy, error, info, cooldown, onVerify, onResend, onBack }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const refs = useRef([]);

  useEffect(() => { refs.current[0]?.focus(); }, []);

  const setDigit = (i, v) => {
    // Pasted code lands here too — split into 6 cells.
    if (v.length > 1) {
      const cleaned = v.replace(/\D/g, "").slice(0, 6).padEnd(6, "");
      const next = cleaned.split("").map(c => c || "");
      setDigits(next);
      const lastIdx = Math.min(cleaned.length, 5);
      refs.current[lastIdx]?.focus();
      if (cleaned.length === 6) onVerify(cleaned);
      return;
    }
    const clean = v.replace(/\D/g, "");
    const next = digits.slice(); next[i] = clean; setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (clean && i === 5) {
      const code = next.join("");
      if (code.length === 6) onVerify(code);
    }
  };

  const onKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft"  && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  };

  const fullCode = digits.join("");

  return (
    <>
      <button type="button" className="pt-otp-back" onClick={onBack} disabled={busy}>
        <ChevronLeft size={13}/> Use a different email
      </button>

      <h2 className="pt-auth-form-h" style={{ marginTop: 10 }}>Check your email.</h2>
      <p className="pt-auth-form-sub">
        We sent a 6-digit code to <strong>{email}</strong>. Type it in below — or just tap the link in the same email.
      </p>

      <div className="pt-otp-row">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => refs.current[i] = el}
            value={d}
            onChange={e => setDigit(i, e.target.value)}
            onKeyDown={e => onKeyDown(i, e)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={i === 0 ? 6 : 1}
            disabled={busy}
            className="pt-otp-box"
            aria-label={`Digit ${i + 1}`}
          />
        ))}
      </div>

      {error && <div className="pt-alert pt-alert-err" style={{ marginTop: 14 }}><AlertTriangle size={13}/> {error}</div>}
      {info && !error && <div className="pt-alert pt-alert-ok" style={{ marginTop: 14 }}><CheckCircle2 size={13}/> {info}</div>}

      <button
        type="button"
        className="pt-btn-primary pt-otp-submit"
        disabled={busy || fullCode.length !== 6}
        onClick={() => onVerify(fullCode)}
      >
        {busy ? <><Loader2 size={14} className="pt-spin"/> Verifying…</> : <>Verify & sign in <ArrowRight size={14}/></>}
      </button>

      <div className="pt-otp-resend">
        Didn't get the code?{" "}
        {cooldown > 0
          ? <span className="pt-otp-cooldown">Resend in {cooldown}s</span>
          : <button type="button" onClick={onResend} disabled={busy}>Resend now</button>}
      </div>

      <div className="pt-auth-helper">
        Sent from <strong>AVIVA INTERNATIONAL &lt;hello@avivainternational.co&gt;</strong>. If it's in spam, mark it as Not Spam so future emails land in your inbox.
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// APP SHELL
// ═══════════════════════════════════════════════════════════════════
function PortalApp({ session, theme, setTheme }) {
  const [page, setPage]   = useState("overview");
  const [openProduct, setOpenProduct] = useState(null); // id of catalog product currently being configured
  const [myProducts, setMyProducts]   = useState([]);   // configured-but-not-published OR published items
  const [stores, setStores]           = useState([]);
  const [brandProfile, setBrandProfile] = useState({
    brandName: session.user.user_metadata?.brand_name || "Your brand",
    fullName:  session.user.user_metadata?.full_name  || session.user.email,
    email:     session.user.email,
    phone:     session.user.user_metadata?.phone || "",
  });

  // Mock orders so the Orders page isn't blank — replace with real Shopify sync.
  const mockOrders = useMemo(() => [], []);

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

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
        <PortalTopBar brandProfile={brandProfile} theme={theme} toggleTheme={toggleTheme} />
        <div className="pt-page">
          {page === "overview"  && <Overview brandProfile={brandProfile} myProducts={myProducts} stores={stores} orders={mockOrders} goto={setPage} />}
          {page === "catalog"   && <Catalog onPick={(id) => setOpenProduct(id)} />}
          {page === "products"  && <MyProducts items={myProducts} stores={stores} onDelete={deleteProduct} onPublish={publishProduct} goto={setPage} />}
          {page === "stores"    && <Stores stores={stores} setStores={setStores} />}
          {page === "orders"    && <Orders orders={mockOrders} />}
          {page === "wallet"    && <WalletPage brandProfile={brandProfile} />}
          {page === "settings"  && <SettingsPage brandProfile={brandProfile} setBrandProfile={setBrandProfile} />}
        </div>
      </div>

      {openProduct && (
        <ProductDetail
          productId={openProduct}
          stores={stores}
          onClose={() => setOpenProduct(null)}
          onSave={(cfg) => { saveProduct(cfg); setOpenProduct(null); setPage("products"); }}
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
          <svg viewBox="0 0 40 40" width="22" height="22">
            <rect x="4" y="8" width="32" height="24" fill="none" stroke="currentColor" strokeWidth="2.5"/>
            <rect x="10" y="14" width="20" height="12" fill="currentColor"/>
            <circle cx="32" cy="12" r="1.5" fill="var(--pt-accent)"/>
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

function PortalTopBar({ brandProfile, theme, toggleTheme }) {
  return (
    <header className="pt-topbar">
      <div className="pt-topbar-left">
        <div className="pt-date-chip"><Calendar size={12}/>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</div>
      </div>
      <div className="pt-topbar-right">
        <div className="pt-presence"><span className="pt-pulse"/><span>Account active</span></div>
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
function Overview({ brandProfile, myProducts, stores, orders, goto }) {
  const drafts    = myProducts.filter(p => p.status === "draft").length;
  const published = myProducts.filter(p => p.status === "published").length;
  const checklist = [
    { id: "store",   label: "Connect your Shopify store",     done: stores.length > 0,        goto: "stores"   },
    { id: "design",  label: "Save your first product design", done: myProducts.length > 0,    goto: "catalog"  },
    { id: "publish", label: "Publish to your store",          done: published > 0,            goto: "products" },
    { id: "order",   label: "Receive your first order",       done: orders.length > 0,        goto: "orders"   },
  ];

  return (
    <div className="pt-dash">
      <PageHeader title={`Welcome, ${brandProfile.fullName.split(" ")[0]}.`} sub={`${brandProfile.brandName} · Client portal`} />

      <div className="pt-kpi-grid">
        <KPICard label="My products"  value={myProducts.length}  unit="saved"     icon={ShoppingBag}    accent="yellow" onClick={() => goto("products")} />
        <KPICard label="Published"    value={published}          unit="live"      icon={CheckCircle2}   accent="green"  onClick={() => goto("products")} />
        <KPICard label="Stores"       value={stores.length}      unit="connected" icon={Store}          accent="cyan"   onClick={() => goto("stores")}    />
        <KPICard label="Orders"       value={orders.length}      unit="total"     icon={ClipboardList}  accent="amber"  onClick={() => goto("orders")}    />
      </div>

      <section className="pt-panel pt-mt">
        <div className="pt-panel-head">
          <div><h2>GET STARTED</h2><div className="pt-panel-sub">Four steps to your first live drop</div></div>
        </div>
        <div className="pt-checklist">
          {checklist.map((c, i) => (
            <button key={c.id} className={`pt-check-row ${c.done ? "done" : ""}`} onClick={() => goto(c.goto)}>
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
                <div className="pt-qa-p">Publish products to your store</div>
              </div>
              <ArrowUpRight size={14}/>
            </button>
            <button className="pt-qa" onClick={() => goto("products")}>
              <ShoppingBag size={18}/>
              <div>
                <div className="pt-qa-h">My products</div>
                <div className="pt-qa-p">{myProducts.length} saved · {drafts} draft</div>
              </div>
              <ArrowUpRight size={14}/>
            </button>
            <button className="pt-qa" onClick={() => goto("wallet")}>
              <Wallet size={18}/>
              <div>
                <div className="pt-qa-h">Wallet</div>
                <div className="pt-qa-p">Top up before publishing</div>
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
              <ProductMockup shape={p.shape} colorHex={COLORS[p.colors[0]]?.hex || "#222"} />
              <div className="pt-cat-chip">{p.category}</div>
            </div>
            <div className="pt-cat-body">
              <div className="pt-cat-name">{p.name}</div>
              <div className="pt-cat-fabric">{p.fabric}</div>
              <div className="pt-cat-row">
                <div className="pt-cat-price">
                  <span className="pt-cat-from">From</span>
                  <strong>₹{p.basePrice}</strong>
                  <span className="pt-cat-mrp">MRP up to ₹{p.mrpHint}</span>
                </div>
                <div className="pt-cat-swatches">
                  {p.colors.slice(0, 5).map(cId => (
                    <span key={cId} className="pt-swatch" style={{ background: COLORS[cId].hex }} title={COLORS[cId].name} />
                  ))}
                  {p.colors.length > 5 && <span className="pt-swatch-more">+{p.colors.length - 5}</span>}
                </div>
              </div>
            </div>
            <div className="pt-cat-cta">Customise <ChevronRight size={14}/></div>
          </button>
        ))}
        {filtered.length === 0 && <div className="pt-empty pt-panel">No products match your filters.</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: PRODUCT DETAIL (modal)
// ═══════════════════════════════════════════════════════════════════
function ProductDetail({ productId, stores, onClose, onSave }) {
  const product = CATALOG_MOCK.find(p => p.id === productId);
  const [colorId, setColorId] = useState(product?.colors[0] || "black");
  const [chosenSizes, setChosenSizes] = useState(new Set(product?.sizes || []));
  const [retailPrice, setRetailPrice] = useState(product ? product.basePrice * 2 : 0);
  const [productTitle, setProductTitle] = useState(product?.name || "");
  const [productDesc,  setProductDesc]  = useState(product?.blurb || "");
  const [designUrl, setDesignUrl] = useState(null);
  const [designName, setDesignName] = useState(null);
  const fileRef = useRef(null);

  if (!product) return null;

  const toggleSize = (s) => {
    setChosenSizes(prev => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s); else n.add(s);
      return n;
    });
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setDesignName(f.name);
    const reader = new FileReader();
    reader.onload = () => setDesignUrl(reader.result);
    reader.readAsDataURL(f);
  };

  const margin = Math.max(0, retailPrice - product.basePrice);
  const marginPct = product.basePrice > 0 ? (margin / product.basePrice * 100).toFixed(0) : 0;

  const save = (status) => {
    onSave({
      localId: `${product.id}-${Date.now()}`,
      productId: product.id,
      title: productTitle,
      description: productDesc,
      colorId,
      sizes: Array.from(chosenSizes),
      retailPrice,
      designUrl,
      designName,
      status, // "draft" | "published" (publish happens on My Products page)
      storeId: null,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div className="pt-modal" onClick={onClose}>
      <div className="pt-modal-card" onClick={e => e.stopPropagation()}>
        <button className="pt-modal-close" onClick={onClose} aria-label="Close"><X size={18}/></button>

        <div className="pt-pd-grid">
          {/* Mockup preview */}
          <div className="pt-pd-preview">
            <div className="pt-pd-mockup">
              <ProductMockup shape={product.shape} colorHex={COLORS[colorId].hex} designUrl={designUrl} />
            </div>
            <div className="pt-pd-thumbs">
              {product.colors.map(cId => (
                <button key={cId} className={`pt-pd-thumb ${cId === colorId ? "on" : ""}`} onClick={() => setColorId(cId)}>
                  <ProductMockup shape={product.shape} colorHex={COLORS[cId].hex} small />
                  <span>{COLORS[cId].name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Configuration */}
          <div className="pt-pd-config">
            <div className="pt-pd-cat">{product.category} · {product.fabric}</div>
            <h2 className="pt-pd-h">{product.name}</h2>
            <p className="pt-pd-blurb">{product.blurb}</p>

            <div className="pt-pd-section">
              <div className="pt-pd-label"><Palette size={12}/> COLOR</div>
              <div className="pt-pd-swatches">
                {product.colors.map(cId => (
                  <button key={cId} className={`pt-pd-swatch ${cId === colorId ? "on" : ""}`} style={{ background: COLORS[cId].hex }} onClick={() => setColorId(cId)} title={COLORS[cId].name}>
                    {cId === colorId && <Check size={12} color={COLORS[cId].ink}/>}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-pd-section">
              <div className="pt-pd-label"><Ruler size={12}/> SIZES</div>
              <div className="pt-pd-sizes">
                {product.sizes.map(s => (
                  <button key={s} className={`pt-pd-size ${chosenSizes.has(s) ? "on" : ""}`} onClick={() => toggleSize(s)}>{s}</button>
                ))}
              </div>
            </div>

            <div className="pt-pd-section">
              <div className="pt-pd-label"><FileImage size={12}/> ARTWORK</div>
              <div className="pt-pd-upload">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onFile} hidden />
                {!designUrl ? (
                  <button className="pt-upload-btn" onClick={() => fileRef.current?.click()}>
                    <Upload size={16}/>
                    <div>
                      <div className="pt-upload-h">Drop artwork or click to upload</div>
                      <div className="pt-upload-p">PNG · JPG · SVG · 300 DPI · transparent background recommended</div>
                    </div>
                  </button>
                ) : (
                  <div className="pt-upload-done">
                    <div className="pt-upload-pic"><ImageIcon size={14}/></div>
                    <div className="pt-upload-meta">
                      <div className="pt-upload-name">{designName}</div>
                      <div className="pt-upload-p">Centred on print area · {product.print}</div>
                    </div>
                    <button className="pt-btn-ghost" onClick={() => { setDesignUrl(null); setDesignName(null); fileRef.current.value = ""; }}>
                      <Trash2 size={12}/> Remove
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-pd-section">
              <div className="pt-pd-label"><Tag size={12}/> PRODUCT LISTING</div>
              <label className="pt-field pt-field-inline">
                <span>Title</span>
                <input value={productTitle} onChange={e => setProductTitle(e.target.value)} placeholder="Shown on your Shopify store"/>
              </label>
              <label className="pt-field pt-field-inline">
                <span>Description</span>
                <textarea value={productDesc} onChange={e => setProductDesc(e.target.value)} rows={3}/>
              </label>
              <div className="pt-pd-price-row">
                <label className="pt-field pt-field-inline">
                  <span>Retail price</span>
                  <div className="pt-price-input"><IndianRupee size={12}/><input type="number" value={retailPrice} onChange={e => setRetailPrice(Number(e.target.value) || 0)} /></div>
                </label>
                <div className="pt-pd-margin">
                  <div className="pt-pd-margin-row"><span>Your cost</span><strong>₹{product.basePrice}</strong></div>
                  <div className="pt-pd-margin-row"><span>Margin</span><strong className="pt-pd-margin-v">₹{margin} · {marginPct}%</strong></div>
                </div>
              </div>
            </div>

            <div className="pt-pd-actions">
              <button className="pt-btn-ghost" onClick={onClose}>Cancel</button>
              <button className="pt-btn-secondary" onClick={() => save("draft")} disabled={chosenSizes.size === 0}>
                Save as draft
              </button>
              <button className="pt-btn-primary" onClick={() => save("draft")} disabled={chosenSizes.size === 0 || !designUrl}>
                Save & continue <ArrowRight size={14}/>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE: MY PRODUCTS
// ═══════════════════════════════════════════════════════════════════
function MyProducts({ items, stores, onDelete, onPublish, goto }) {
  const [filter, setFilter] = useState("all");
  const filtered = items.filter(i => filter === "all" || i.status === filter);

  if (items.length === 0) {
    return (
      <div className="pt-dash">
        <PageHeader title="My Products" sub="Saved drafts and published items" />
        <div className="pt-empty-state pt-panel">
          <ShoppingBag size={32}/>
          <h3>No products saved yet.</h3>
          <p>Pick a blank from the catalog, drop in your artwork, save it here, then publish to your Shopify store.</p>
          <button className="pt-btn-primary" onClick={() => goto("catalog")}><Plus size={14}/> Browse catalog</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-dash">
      <PageHeader title="My Products" sub={`${items.length} saved`} />

      <div className="pt-cat-toolbar">
        <div className="pt-cat-pills">
          <button className={`pt-cat-pill ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All ({items.length})</button>
          <button className={`pt-cat-pill ${filter === "draft" ? "on" : ""}`} onClick={() => setFilter("draft")}>Drafts ({items.filter(i => i.status === "draft").length})</button>
          <button className={`pt-cat-pill ${filter === "published" ? "on" : ""}`} onClick={() => setFilter("published")}>Published ({items.filter(i => i.status === "published").length})</button>
        </div>
        <button className="pt-btn-primary pt-btn-sm" onClick={() => goto("catalog")}><Plus size={13}/> Add product</button>
      </div>

      <div className="pt-mp-grid">
        {filtered.map(item => {
          const blank = CATALOG_MOCK.find(p => p.id === item.productId);
          return (
            <div key={item.localId} className="pt-mp-card">
              <div className="pt-mp-img">
                <ProductMockup shape={blank?.shape || "tee"} colorHex={COLORS[item.colorId]?.hex || "#111"} designUrl={item.designUrl} />
                <div className={`pt-mp-status pt-mp-status-${item.status}`}>{item.status === "published" ? "LIVE" : "DRAFT"}</div>
              </div>
              <div className="pt-mp-body">
                <div className="pt-mp-name">{item.title || blank?.name}</div>
                <div className="pt-mp-meta">
                  {COLORS[item.colorId]?.name} · {item.sizes.length} sizes · ₹{item.retailPrice}
                </div>
                {item.status === "published" && (
                  <div className="pt-mp-store">
                    <Store size={11}/> {stores.find(s => s.id === item.storeId)?.name || "your store"}
                  </div>
                )}
              </div>
              <div className="pt-mp-actions">
                {item.status === "draft" ? (
                  <PublishMenu stores={stores} onPublish={(storeId) => onPublish(item.localId, storeId)} onConnectStore={() => goto("stores")} />
                ) : (
                  <button className="pt-btn-ghost pt-btn-sm" disabled><CheckCircle2 size={12}/> Published</button>
                )}
                <button className="pt-btn-ghost pt-btn-sm pt-mp-delete" onClick={() => { if (confirm(`Delete "${item.title || blank?.name}"?`)) onDelete(item.localId); }}>
                  <Trash2 size={12}/>
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
function Orders({ orders }) {
  if (orders.length === 0) {
    return (
      <div className="pt-dash">
        <PageHeader title="Orders" sub="Orders synced from your connected stores" />
        <div className="pt-empty-state pt-panel">
          <ClipboardList size={32}/>
          <h3>No orders yet.</h3>
          <p>Once you publish products and start receiving sales, orders will flow into this page automatically. Each order shows status: new → in production → packed → in transit → delivered.</p>
        </div>
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
function WalletPage({ brandProfile }) {
  return (
    <div className="pt-dash">
      <PageHeader title="Wallet" sub="Top up before each batch · Per-order debit on dispatch" />
      <div className="pt-wallet-grid">
        <section className="pt-panel pt-wallet-bal">
          <div className="pt-wallet-label">CURRENT BALANCE</div>
          <div className="pt-wallet-amount">₹0</div>
          <div className="pt-wallet-sub">No top-ups yet</div>
          <button className="pt-btn-primary"><Plus size={14}/> Top up wallet</button>
        </section>
        <section className="pt-panel">
          <div className="pt-panel-head"><div><h2>RECENT TRANSACTIONS</h2><div className="pt-panel-sub">Top-ups and per-order debits</div></div></div>
          <div className="pt-empty">No transactions yet. Top up to start publishing.</div>
        </section>
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
function ProductMockup({ shape, colorHex, designUrl, small }) {
  const size = small ? 60 : 240;
  const ink  = "rgba(0,0,0,0.18)";

  let body = null;
  let designBox = { x: 70, y: 80, w: 60, h: 60 };

  if (shape === "tee" || shape === "tee-over") {
    const oversize = shape === "tee-over";
    body = (
      <>
        <path d={oversize
          ? "M40 30 L 70 12 L 100 24 L 130 12 L 160 30 L 178 70 L 152 80 L 152 188 L 48 188 L 48 80 L 22 70 Z"
          : "M48 32 L 74 16 L 100 26 L 126 16 L 152 32 L 168 64 L 148 74 L 148 188 L 52 188 L 52 74 L 32 64 Z"
        } fill={colorHex} stroke={ink} strokeWidth="1.5"/>
        <path d="M88 24 Q 100 36 112 24" fill="none" stroke={ink} strokeWidth="1.5"/>
      </>
    );
    designBox = { x: 75, y: 72, w: 50, h: 50 };
  } else if (shape === "hoodie") {
    body = (
      <>
        <path d="M40 50 Q 60 28 100 28 Q 140 28 160 50 L 175 90 L 152 100 L 152 188 L 48 188 L 48 100 L 25 90 Z" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
        <path d="M76 30 Q 100 50 124 30 Q 124 56 100 60 Q 76 56 76 30" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
        <rect x="80" y="125" width="40" height="32" fill="none" stroke={ink} strokeWidth="1.5" rx="3"/>
        <line x1="100" y1="60" x2="100" y2="190" stroke={ink} strokeWidth="0.8"/>
      </>
    );
    designBox = { x: 75, y: 82, w: 50, h: 38 };
  } else if (shape === "crew") {
    body = (
      <>
        <path d="M42 36 L 70 18 L 100 28 L 130 18 L 158 36 L 174 72 L 152 82 L 152 188 L 48 188 L 48 82 L 26 72 Z" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
        <path d="M82 26 Q 100 40 118 26" fill="none" stroke={ink} strokeWidth="1.5"/>
        <path d="M48 178 L 152 178" stroke={ink} strokeWidth="2"/>
      </>
    );
    designBox = { x: 75, y: 76, w: 50, h: 50 };
  } else if (shape === "tank") {
    body = (
      <>
        <path d="M62 30 L 80 28 Q 100 50 120 28 L 138 30 L 148 70 L 148 188 L 52 188 L 52 70 Z" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
      </>
    );
    designBox = { x: 75, y: 80, w: 50, h: 50 };
  } else if (shape === "polo") {
    body = (
      <>
        <path d="M48 30 L 76 16 L 100 30 L 124 16 L 152 30 L 168 64 L 148 74 L 148 188 L 52 188 L 52 74 L 32 64 Z" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
        <path d="M86 22 L 100 38 L 114 22 L 116 46 L 100 60 L 84 46 Z" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
        <line x1="100" y1="38" x2="100" y2="74" stroke={ink} strokeWidth="1"/>
      </>
    );
    designBox = { x: 110, y: 50, w: 24, h: 24 }; // chest patch position
  } else if (shape === "long") {
    body = (
      <>
        <path d="M48 32 L 74 16 L 100 26 L 126 16 L 152 32 L 178 130 L 158 138 L 152 100 L 152 188 L 48 188 L 48 100 L 42 138 L 22 130 Z" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
        <path d="M88 24 Q 100 36 112 24" fill="none" stroke={ink} strokeWidth="1.5"/>
      </>
    );
    designBox = { x: 75, y: 72, w: 50, h: 50 };
  } else if (shape === "joggers" || shape === "shorts") {
    const short = shape === "shorts";
    body = (
      <>
        <path d={short
          ? "M58 28 L 142 28 L 144 120 L 110 120 L 100 60 L 90 120 L 56 120 Z"
          : "M58 28 L 142 28 L 148 188 L 108 188 L 102 80 L 100 60 L 98 80 L 92 188 L 52 188 Z"
        } fill={colorHex} stroke={ink} strokeWidth="1.5"/>
        <line x1="58" y1="38" x2="142" y2="38" stroke={ink} strokeWidth="1.2"/>
      </>
    );
    designBox = { x: 60, y: short ? 70 : 110, w: 22, h: 22 };
  } else if (shape === "cap") {
    body = (
      <>
        <path d="M40 110 Q 100 40 160 110 L 160 130 L 40 130 Z" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
        <path d="M40 130 Q 100 160 160 130" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
      </>
    );
    designBox = { x: 85, y: 92, w: 30, h: 22 };
  } else if (shape === "beanie") {
    body = (
      <>
        <path d="M50 130 Q 50 50 100 50 Q 150 50 150 130 Z" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
        <rect x="50" y="125" width="100" height="22" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
      </>
    );
    designBox = { x: 85, y: 128, w: 30, h: 16 };
  } else if (shape === "tote") {
    body = (
      <>
        <rect x="50" y="60" width="100" height="120" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
        <path d="M70 60 Q 70 26 100 26 Q 130 26 130 60" fill="none" stroke={ink} strokeWidth="1.5"/>
      </>
    );
    designBox = { x: 70, y: 90, w: 60, h: 60 };
  } else if (shape === "mug") {
    body = (
      <>
        <rect x="50" y="60" width="90" height="100" rx="6" fill={colorHex} stroke={ink} strokeWidth="1.5"/>
        <path d="M140 80 Q 170 80 170 110 Q 170 140 140 140" fill="none" stroke={ink} strokeWidth="2.5"/>
      </>
    );
    designBox = { x: 60, y: 90, w: 70, h: 50 };
  } else {
    // Fallback box
    body = <rect x="40" y="40" width="120" height="150" rx="8" fill={colorHex} stroke={ink} strokeWidth="1.5"/>;
  }

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className="pt-mockup-svg">
      {body}
      {designUrl && (
        <image href={designUrl} x={designBox.x} y={designBox.y} width={designBox.w} height={designBox.h} preserveAspectRatio="xMidYMid meet" />
      )}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════
const PORTAL_CSS = `
:root {
  --pt-bg:           #0a0a0a;
  --pt-bg-elev:      #111;
  --pt-bg-soft:      #0d0d0d;
  --pt-bg-card:      #131313;
  --pt-text:         #e8e8e8;
  --pt-text-strong:  #ffffff;
  --pt-text-dim:     #9a9a9a;
  --pt-text-muted:   #6a6a6a;
  --pt-border:       #1c1c1c;
  --pt-border-hover: #2a2a2a;
  --pt-accent:       #f3c41a;
  --pt-accent-soft:  rgba(243, 196, 26, 0.08);
  --pt-accent-glow:  rgba(243, 196, 26, 0.18);
  --pt-success:      #4ade80;
  --pt-success-glow: rgba(74, 222, 128, 0.18);
  --pt-err:          #f87171;
  --pt-err-glow:     rgba(248, 113, 113, 0.16);
  --pt-cyan:         #38bdf8;
  --pt-amber:        #fbbf24;
  color-scheme: dark;
}
:root[data-theme="light"] {
  --pt-bg:           #fafafa;
  --pt-bg-elev:      #ffffff;
  --pt-bg-soft:      #f3f3f3;
  --pt-bg-card:      #ffffff;
  --pt-text:         #1a1a1a;
  --pt-text-strong:  #000000;
  --pt-text-dim:     #555555;
  --pt-text-muted:   #888888;
  --pt-border:       #e2e2e2;
  --pt-border-hover: #c8c8c8;
  --pt-accent:       #b78c00;
  --pt-accent-soft:  rgba(183, 140, 0, 0.06);
  --pt-accent-glow:  rgba(183, 140, 0, 0.16);
  --pt-success:      #16a34a;
  --pt-success-glow: rgba(22, 163, 74, 0.18);
  --pt-err:          #dc2626;
  --pt-err-glow:     rgba(220, 38, 38, 0.14);
  --pt-cyan:         #0284c7;
  --pt-amber:        #d97706;
  color-scheme: light;
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
.pt-auth-brand { font-weight: 800; letter-spacing: 0.22em; font-size: 12px; color: var(--pt-text-strong); }
.pt-auth-brand span { color: var(--pt-text-muted); margin-left: 6px; font-weight: 600; }
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

.pt-btn-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--pt-accent); color: #0a0a0a;
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
.pt-app { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
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
  width: 36px; height: 36px; border-radius: 8px;
  background: var(--pt-accent-soft); color: var(--pt-text-strong);
  display: grid; place-items: center;
}
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
.pt-nav-item.active .pt-nav-badge { background: var(--pt-accent); color: #0a0a0a; }
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
  background: var(--pt-accent); color: #0a0a0a;
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
.pt-cat-pill.on { background: var(--pt-accent); color: #0a0a0a; border-color: var(--pt-accent); }

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
  position: relative; aspect-ratio: 1;
  background: var(--pt-bg-soft);
  display: grid; place-items: center;
  border-bottom: 1px solid var(--pt-border);
}
.pt-cat-chip {
  position: absolute; top: 10px; left: 10px;
  font-size: 9.5px; letter-spacing: 0.14em; font-weight: 700;
  padding: 4px 8px; border-radius: 999px;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  color: var(--pt-text-dim); text-transform: uppercase;
}
.pt-cat-body { padding: 14px 14px 10px; }
.pt-cat-name { font-size: 14px; font-weight: 700; color: var(--pt-text-strong); margin-bottom: 4px; }
.pt-cat-fabric { font-size: 11.5px; color: var(--pt-text-muted); margin-bottom: 12px; }
.pt-cat-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
.pt-cat-price { display: flex; flex-direction: column; gap: 1px; }
.pt-cat-from { font-size: 9.5px; letter-spacing: 0.1em; color: var(--pt-text-muted); text-transform: uppercase; }
.pt-cat-price strong { font-size: 17px; font-weight: 800; color: var(--pt-text-strong); }
.pt-cat-mrp { font-size: 10px; color: var(--pt-text-muted); }
.pt-cat-swatches { display: flex; gap: 4px; }
.pt-swatch {
  width: 16px; height: 16px; border-radius: 999px;
  border: 1px solid var(--pt-border);
}
.pt-swatch-more { font-size: 10px; color: var(--pt-text-muted); align-self: center; }
.pt-cat-cta {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  border-top: 1px solid var(--pt-border);
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: var(--pt-accent);
  text-transform: uppercase;
}

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
.pt-pd-grid { display: grid; grid-template-columns: 1fr 1fr; min-height: 540px; }
.pt-pd-preview {
  padding: 32px;
  background: var(--pt-bg-soft); border-right: 1px solid var(--pt-border);
  display: flex; flex-direction: column; gap: 18px;
}
.pt-pd-mockup {
  background: var(--pt-bg-card); border: 1px solid var(--pt-border);
  border-radius: 12px; aspect-ratio: 1; display: grid; place-items: center;
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
.pt-pd-blurb { font-size: 13px; color: var(--pt-text-dim); line-height: 1.55; margin: 0 0 24px 0; }
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
.pt-pd-size.on { background: var(--pt-accent); color: #0a0a0a; border-color: var(--pt-accent); }
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

/* ─── My Products ─── */
.pt-mp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.pt-mp-card {
  display: flex; flex-direction: column;
  background: var(--pt-bg-elev); border: 1px solid var(--pt-border);
  border-radius: 14px; overflow: hidden; transition: all 0.15s;
}
.pt-mp-card:hover { border-color: var(--pt-border-hover); }
.pt-mp-img {
  position: relative; aspect-ratio: 1;
  background: var(--pt-bg-soft);
  display: grid; place-items: center;
  border-bottom: 1px solid var(--pt-border);
}
.pt-mp-status {
  position: absolute; top: 10px; right: 10px;
  font-size: 9px; letter-spacing: 0.16em; font-weight: 800;
  padding: 4px 8px; border-radius: 999px;
}
.pt-mp-status-draft     { background: var(--pt-bg-elev); border: 1px solid var(--pt-border); color: var(--pt-text-muted); }
.pt-mp-status-published { background: var(--pt-success-glow); color: var(--pt-success); border: 1px solid var(--pt-success); }
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
