// Hashway Cash Command Center — app shell (auth, roles, book, navigation).
import React, { useCallback, useEffect, useState } from "react";
import "./cash.css";
import { auth, call, configured, DEV, getBook, setBook, getDevRole, setDevRole } from "./api.js";
import { AppCtx, Btn, Field, Input, Link, ToastProvider, ROLE_CAN, Skeleton, ErrorBox, Badge } from "./ui.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import DailyUpdate from "./pages/DailyUpdate.jsx";
import Forecast from "./pages/Forecast.jsx";
import { Receivables, Payables, PurchaseOrders } from "./pages/Money.jsx";
import Inventory from "./pages/Inventory.jsx";
import WorkingCapital from "./pages/WorkingCapital.jsx";
import Mis from "./pages/Mis.jsx";
import { Ledger, Audit } from "./pages/Ledger.jsx";
import BankRecon from "./pages/BankRecon.jsx";
import Imports from "./pages/Imports.jsx";
import Reports from "./pages/Reports.jsx";
import Settings from "./pages/Settings.jsx";

const NAV = [
  { group: "Today" },
  { path: "/cash", label: "Dashboard", el: Dashboard },
  { path: "/cash/daily", label: "10 AM update", el: DailyUpdate, dot: true },
  { group: "Cash planning" },
  { path: "/cash/forecast", label: "13-week forecast", el: Forecast },
  { path: "/cash/working-capital", label: "Working capital", el: WorkingCapital },
  { path: "/cash/mis", label: "Profit vs cash (MIS)", el: Mis },
  { group: "Money in & out" },
  { path: "/cash/receivables", label: "Receivables", el: Receivables },
  { path: "/cash/payables", label: "Payables", el: Payables },
  { path: "/cash/pos", label: "Purchase orders", el: PurchaseOrders },
  { path: "/cash/inventory", label: "Inventory", el: Inventory },
  { group: "Books" },
  { path: "/cash/ledger", label: "Ledger", el: Ledger },
  { path: "/cash/bank", label: "Bank reconciliation", el: BankRecon },
  { path: "/cash/imports", label: "Imports", el: Imports },
  { path: "/cash/reports", label: "Reports", el: Reports },
  { path: "/cash/audit", label: "Audit log", el: Audit, role: "finance" },
  { path: "/cash/settings", label: "Settings", el: Settings },
];

function usePath() {
  const [p, setP] = useState(() => window.location.pathname.replace(/\/+$/, "") || "/cash");
  useEffect(() => {
    const f = () => setP(window.location.pathname.replace(/\/+$/, "") || "/cash");
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, []);
  return p;
}

export default function CashApp() {
  useEffect(() => { document.title = "Hashway · Cash"; }, []);
  return <div className="cf"><ToastProvider><Gate /></ToastProvider></div>;
}

function Gate() {
  const [session, setSession] = useState(DEV ? { dev: true } : undefined);
  useEffect(() => {
    if (DEV || !auth) return;
    auth.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = auth.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (!configured) return <NotConfigured />;
  if (session === undefined) return <div className="cf-login"><Skeleton h={120} /></div>;
  if (!session) return <Login />;
  return <Shell />;
}

function NotConfigured() {
  return (
    <div className="cf-login"><div className="cf-card"><div className="bd" style={{ display: "grid", gap: 10 }}>
      <h1>Cash Command Center</h1>
      <p className="muted">This deployment is missing <code>VITE_CASH_SUPABASE_URL</code> and <code>VITE_CASH_SUPABASE_ANON_KEY</code> (the dedicated Hashway finance Supabase project). See <code>docs/hashway-cash/SETUP.md</code>.</p>
    </div></div></div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await auth.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg({ bad: true, t: error.message });
  };
  const reset = async () => {
    if (!email) return setMsg({ bad: true, t: "Enter your email first." });
    const { error } = await auth.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/cash` });
    setMsg(error ? { bad: true, t: error.message } : { t: "Check your email for a reset link." });
  };
  return (
    <div className="cf-login">
      <form className="cf-card" onSubmit={submit}><div className="bd" style={{ display: "grid", gap: 14 }}>
        <div className="cf-brand" style={{ padding: 0 }}><div className="cf-brand-mark">H</div><div><b>Hashway</b><span>Cash Command Center</span></div></div>
        <Field label="Email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {msg && <div className={`cf-banner ${msg.bad ? "bad" : "good"}`} style={{ margin: 0 }}>{msg.t}</div>}
        <Btn kind="primary" type="submit" loading={busy} onClick={submit}>Sign in</Btn>
        <button type="button" className="cf-btn ghost sm" onClick={reset}>Forgot password?</button>
      </div></form>
    </div>
  );
}

function Shell() {
  const path = usePath();
  const [boot, setBoot] = useState(null);
  const [err, setErr] = useState(null);
  const [book, setBk] = useState(getBook());
  const [menu, setMenu] = useState(false);
  const [devRole, setDR] = useState(getDevRole());
  const loadBoot = useCallback(async () => {
    try { setErr(null); setBoot(await call("bootstrap")); } catch (e) { setErr(e); }
  }, []);
  useEffect(() => { loadBoot(); }, [loadBoot, book, devRole]);
  useEffect(() => { setMenu(false); }, [path]);

  const me = boot?.me;
  const can = (what) => !!me && (ROLE_CAN[what] || []).includes(me.role);
  const route = NAV.find((n) => n.path === path) || NAV[1];
  const Page = route.el;
  const st = boot?.updateStatus;
  const dotColor = st ? { green: "var(--good)", yellow: "var(--warn)", red: "var(--bad)" }[st.status] : "transparent";
  const switchBook = (b) => { setBook(b); setBk(b); setBoot(null); };

  if (err?.status === 403 || err?.status === 401) {
    return (
      <div className="cf-login"><div className="cf-card"><div className="bd" style={{ display: "grid", gap: 12 }}>
        <h1>No access</h1><p className="muted">{err.message}</p>
        {!DEV && <Btn onClick={() => auth.auth.signOut()}>Sign out</Btn>}
      </div></div></div>
    );
  }

  return (
    <AppCtx.Provider value={{ me, boot, can, reloadBoot: loadBoot, book }}>
      <div className="cf-shell">
        <aside className={`cf-side ${menu ? "open" : ""}`} onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
          <div className="cf-brand"><div className="cf-brand-mark">H</div><div><b>Hashway</b><span>Cash Command Center</span></div></div>
          <nav className="cf-nav" aria-label="Main">
            {NAV.map((n, i) => n.group
              ? <div key={i} className="cf-nav-group">{n.group}</div>
              : (!n.role || can(n.role)) && (
                <Link key={n.path} to={n.path} className={path === n.path || (n.path === "/cash" && !NAV.some((x) => x.path === path)) ? "on" : ""}>
                  {n.label}{n.dot && st && <span className="dot" style={{ background: dotColor }} title={st.message} />}
                </Link>
              ))}
          </nav>
        </aside>
        <main className="cf-main">
          <header className="cf-top">
            <Btn kind="ghost" size="sm" className="cf-btn ghost sm cf-burger" onClick={() => setMenu(true)} aria-label="Menu">☰</Btn>
            <div className="grow">
              {book === "demo" && <span className="cf-badge cf-chip-demo">DEMO BOOK — sample data, not Hashway's real books</span>}
            </div>
            <div className="cf-seg" title="Live = Hashway's real books. Demo = sample data to explore safely.">
              <button className={book === "live" ? "on" : ""} onClick={() => switchBook("live")}>Live</button>
              <button className={book === "demo" ? "on" : ""} onClick={() => switchBook("demo")}>Demo</button>
            </div>
            {DEV && (
              <select className="cf-select" style={{ width: 130 }} value={devRole} onChange={(e) => { setDevRole(e.target.value); setDR(e.target.value); }} title="Local dev: act as role">
                {["admin", "finance", "operations", "viewer"].map((r) => <option key={r} value={r}>as {r}</option>)}
              </select>
            )}
            {me && <span className="small muted" title={me.email}>{me.name || me.email} · <Badge>{me.role}</Badge></span>}
            {!DEV && <Btn size="sm" kind="ghost" onClick={() => auth.auth.signOut()}>Sign out</Btn>}
          </header>
          <div className="cf-page">
            {err && <ErrorBox error={err} retry={loadBoot} />}
            {!boot ? <Skeleton h={300} /> : <Page key={book + path} />}
          </div>
        </main>
      </div>
    </AppCtx.Provider>
  );
}
