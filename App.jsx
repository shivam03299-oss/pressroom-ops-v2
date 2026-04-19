import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, Users, Printer, ClipboardList, Warehouse, TrendingUp,
  LogIn, LogOut, Plus, Trash2, Edit3, Check, X, AlertTriangle, Package,
  Clock, IndianRupee, ArrowUpRight, ArrowDownRight, Search, Shirt,
  Calendar, ChevronRight, Activity, MapPin, Wallet, Truck, BarChart3,
  Lock, Loader2
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from "recharts";
import { supabase, fetchAll, insertRow, updateRow, deleteRow, subscribe, signIn, signOut, getSession, getProfile } from "./supabase.js";

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
  settings: { warehouseLat: null, warehouseLng: null, warehouseLabel: "", geofenceRadius: 100, geofenceEnabled: false },
};

const EXPENSE_CATEGORIES = ["Salaries", "DTF Supplies", "Electricity", "Rent", "Packaging", "Courier", "Misc"];
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const CLIENTS = ["Hashway", "Culture Circle"];
const today = () => new Date().toISOString().slice(0, 10);

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
// MAIN APP — with Supabase auth + role-based access
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);

  useEffect(() => {
    let mounted = true;
    // Check current session on mount
    getSession().then(async (s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        try {
          const p = await getProfile(s.user.id);
          if (mounted) { setProfile(p); setProfileError(null); }
        } catch (e) {
          console.error("Profile load failed:", e);
          if (mounted) { setProfile(null); setProfileError(e.message || "Failed to load profile"); }
        }
      }
    }).catch(e => {
      console.error("Session check failed:", e);
      if (mounted) setSession(null);
    });
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      setSession(s);
      setProfileError(null);
      if (s?.user) {
        try {
          const p = await getProfile(s.user.id);
          if (mounted) setProfile(p);
        } catch (e) {
          console.error("Profile load failed:", e);
          if (mounted) { setProfile(null); setProfileError(e.message || "Failed to load profile"); }
        }
      } else {
        setProfile(null);
      }
    });
    return () => { mounted = false; subscription?.unsubscribe(); };
  }, []);

  const forceLogout = async () => {
    await signOut();
    window.location.reload();
  };

  if (session === undefined) {
    return <div className="boot"><style>{css}</style><div className="boot-inner"><div className="boot-mark"></div>LOADING</div></div>;
  }
  if (!session) {
    return <LoginPage />;
  }
  if (profileError) {
    return (
      <div className="boot">
        <style>{css}</style>
        <div className="boot-inner" style={{flexDirection: "column", gap: 16, maxWidth: 400, textAlign: "center"}}>
          <div style={{color: "var(--ink-red)", fontSize: 12}}>⚠ PROFILE LOAD FAILED</div>
          <div style={{color: "var(--text-dim)", fontSize: 11, lineHeight: 1.5}}>{profileError}</div>
          <button className="btn-primary" onClick={forceLogout}><LogOut size={13}/> SIGN OUT & RETRY</button>
        </div>
      </div>
    );
  }
  if (!profile) {
    return <div className="boot"><style>{css}</style><div className="boot-inner"><div className="boot-mark"></div>LOADING PROFILE…</div></div>;
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

  // Unified fetcher — pulls everything the current user is allowed to see
  const loadAll = useCallback(async () => {
    try {
      const keys = ["workers", "attendance", "production", "orders", "warehouse", "dispatches", "settings"];
      if (isAdmin) keys.push("expenses", "revenue");
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
    const keys = ["attendance", "production", "dispatches", "orders", "warehouse"];
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
    dashboard:  <Dashboard  data={data} goto={setPage} isAdmin={isAdmin} />,
    attendance: <Attendance data={data} update={update} refresh={refresh} profile={profile} isAdmin={isAdmin} />,
    production: <Production data={data} update={update} refresh={refresh} profile={profile} isAdmin={isAdmin} />,
    orders:     <Orders     data={data} update={update} refresh={refresh} isAdmin={isAdmin} />,
    dispatches: <Dispatches data={data} update={update} refresh={refresh} profile={profile} isAdmin={isAdmin} />,
    warehouse:  <Warehouse_ data={data} update={update} refresh={refresh} isAdmin={isAdmin} />,
    payroll:    <Payroll    data={data} update={update} refresh={refresh} />,
    pnl:        <PnL        data={data} update={update} refresh={refresh} />,
    insights:   <Insights   data={data} />,
  };

  return (
    <div className="app">
      <style>{css}</style>
      <Sidebar page={page} setPage={setPage} isAdmin={isAdmin} profile={profile} />
      <div className="main">
        <TopBar data={data} profile={profile} />
        <div className="page">
          {error && <div className="geo-alert geo-alert-err"><AlertTriangle size={14}/> {error}</div>}
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
    { id: "dispatches", label: "Dispatches",  icon: Truck,           admin: false },
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

function TopBar({ data }) {
  const presentToday = data.attendance.filter(a => a.date === today() && !a.punchOut).length;
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
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE 1 · DASHBOARD
// ═══════════════════════════════════════════════════════════════════
function Dashboard({ data, goto, isAdmin }) {
  const t = today();
  const metrics = useMemo(() => {
    const todayProd = data.production.filter(p => p.date === t);
    const printedToday = todayProd.reduce((s, p) => s + p.total, 0);
    const present = data.attendance.filter(a => a.date === t && !a.punchOut).length;

    const pendingUnits = data.orders.reduce((s, o) => s + o.items.reduce((ss, it) => {
      const total = Object.values(it.sizes).reduce((a,b) => a+b, 0);
      const disp = Object.values(it.dispatched).reduce((a,b) => a+b, 0);
      return ss + (total - disp);
    }, 0), 0);

    const warehouseUnits = data.warehouse.reduce((s, w) => s + Object.values(w.sizes).reduce((a,b) => a+b, 0), 0);

    const monthExp = data.expenses.filter(e => e.date.startsWith(t.slice(0,7))).reduce((s, e) => s + e.amount, 0);
    const monthRev = data.revenue.filter(r => r.date.startsWith(t.slice(0,7))).reduce((s, r) => s + r.amount, 0);

    return { printedToday, present, pendingUnits, warehouseUnits, monthExp, monthRev, profit: monthRev - monthExp };
  }, [data, t]);

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

      <div className="kpi-grid" style={{gridTemplateColumns: isAdmin ? "repeat(6, 1fr)" : "repeat(4, 1fr)"}}>
        <KPICard label="Printed Today"     value={metrics.printedToday} unit="pcs"  icon={Printer}    accent="yellow" onClick={() => goto("production")} />
        <KPICard label="On Floor"          value={metrics.present}       unit="workers" icon={Users}     accent="cyan"   onClick={() => goto("attendance")} />
        <KPICard label="Pending to Print"  value={metrics.pendingUnits}  unit="pcs"  icon={ClipboardList} accent="amber"  onClick={() => goto("orders")} />
        <KPICard label="In Warehouse"      value={metrics.warehouseUnits} unit="plain tees" icon={Warehouse} accent="slate" onClick={() => goto("warehouse")} />
        {isAdmin && <KPICard label="Revenue · Month"   value={`₹${(metrics.monthRev/1000).toFixed(1)}K`} icon={IndianRupee} accent="green" onClick={() => goto("pnl")} />}
        {isAdmin && <KPICard label={metrics.profit >= 0 ? "Profit · Month" : "Loss · Month"} value={`₹${Math.abs(metrics.profit/1000).toFixed(1)}K`} icon={TrendingUp} accent={metrics.profit >= 0 ? "green" : "red"} onClick={() => goto("pnl")} />}
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

function Attendance({ data, update, refresh, profile, isAdmin }) {
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

  const recent = [...data.attendance].sort((a,b) => (b.date + b.punchIn).localeCompare(a.date + a.punchIn)).slice(0, 20);
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
        <div className="panel-head"><div><h2>RECENT LOG</h2><div className="panel-sub">last 20 entries</div></div></div>
        <div className="log-table">
          <div className="log-thead">
            <div>DATE</div><div>WORKER</div><div>IN</div><div>OUT</div><div>HOURS</div><div>OT</div><div>LOCATION</div>
          </div>
          {recent.map(r => {
            const w = getWorker(r.workerId);
            const otMin = otMinutesForRecord(r);
            return (
              <div key={r.id} className="log-row">
                <div className="mono">{r.date}</div>
                <div>{w?.name || "—"}</div>
                <div className="mono">{r.punchIn}</div>
                <div className="mono">{r.punchOut || <span className="live-tag">ACTIVE</span>}</div>
                <div className="mono"><strong>{hoursFor(r) || "—"}</strong></div>
                <div className="mono">
                  {otMin > 0 ? <span className="ot-cell">+{formatHM(otMin)}</span> : <span className="muted">—</span>}
                </div>
                <div className="mono dim">
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
function Production({ data, update, refresh, profile, isAdmin }) {
  const [showLog, setShowLog] = useState(false);
  const [filterDate, setFilterDate] = useState(today());

  const log = async (entry) => {
    const total = Object.values(entry.sizes).reduce((a,b) => a+b, 0);
    const full = { ...entry, id: `p${Date.now()}`, total };

    try {
      // 1. Insert production entry
      await insertRow("production", full);

      // 2. Deduct from warehouse (per matching product)
      for (const w of data.warehouse) {
        if (w.client !== entry.client || w.product !== entry.product) continue;
        const newSizes = { ...w.sizes };
        for (const sz of SIZES) {
          if (entry.sizes[sz]) newSizes[sz] = Math.max(0, (newSizes[sz] || 0) - entry.sizes[sz]);
        }
        await updateRow("warehouse", w.id, { sizes: newSizes });
      }

      // 3. Update order PRINTED counts
      let remaining = { ...entry.sizes };
      for (const o of data.orders) {
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

  const entries = data.production.filter(p => !filterDate || p.date === filterDate).sort((a,b) => b.id.localeCompare(a.id));
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
        <label className="mono-label">DATE
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}/>
        </label>
        <button className="btn-ghost" onClick={() => setFilterDate("")}>SHOW ALL</button>
        <div className="filter-summary">
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
              {SIZES.map(sz => <div key={sz} className="mono size-cell">{p.sizes[sz] || "—"}</div>)}
              <div className="mono"><strong>{p.total}</strong></div>
              <div><button className="icon-btn" onClick={() => remove(p.id)}><Trash2 size={12}/></button></div>
            </div>
          ))}
          {entries.length === 0 && <div className="empty">No production for this date.</div>}
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
    product: "",
    sizes: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 },
    platesUsed: 0,
  });

  // suggest products from the selected client's active orders + warehouse
  const productOptions = useMemo(() => {
    const s = new Set();
    data.orders.filter(o => o.client === f.client).forEach(o => o.items.forEach(it => s.add(it.product)));
    data.warehouse.filter(w => w.client === f.client).forEach(w => s.add(w.product));
    return [...s];
  }, [f.client, data]);

  const total = Object.values(f.sizes).reduce((a,b) => a+b, 0);

  return (
    <Modal onClose={onClose} title="LOG TODAY'S PRODUCTION" wide>
      <div className="form">
        <div className="form-row">
          <label>DATE<input type="date" value={f.date} onChange={e => setF({...f, date: e.target.value})}/></label>
          <label>CLIENT
            <select value={f.client} onChange={e => setF({...f, client: e.target.value, product: ""})}>
              {CLIENTS.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
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
function Orders({ data, update, refresh, isAdmin }) {
  const [showNew, setShowNew] = useState(false);
  const [filterClient, setFilterClient] = useState("all");

  const orders = data.orders.filter(o => filterClient === "all" || o.client === filterClient);

  const add = async (order) => {
    const id = `ORD-${order.client.slice(0,2).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    try {
      await insertRow("orders", { ...order, id, status: "in_progress" });
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

  return (
    <div>
      <PageHeader title="Orders" sub="incoming orders · dispatch tracking"
        action={<button className="btn-primary" onClick={() => setShowNew(true)}><Plus size={13}/> NEW ORDER</button>}/>

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

      {showNew && <NewOrderModal onClose={() => setShowNew(false)} onSubmit={add}/>}
    </div>
  );
}

function OrderCard({ order, onDone, onDelete }) {
  const totals = order.items.reduce((acc, it) => {
    const t = Object.values(it.sizes).reduce((a,b) => a+b, 0);
    const p = Object.values(it.printed || {}).reduce((a,b) => a+b, 0);
    const d = Object.values(it.dispatched || {}).reduce((a,b) => a+b, 0);
    acc.total += t; acc.printed += p; acc.dispatched += d;
    return acc;
  }, { total: 0, printed: 0, dispatched: 0 });
  const dispatchPct = totals.total ? Math.round((totals.dispatched / totals.total) * 100) : 0;
  const printPct = totals.total ? Math.round((totals.printed / totals.total) * 100) : 0;
  const done = dispatchPct === 100;

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
              <div className="op-bar-row">
                <span className="op-bar-label">DISPATCHED</span>
                <div className="op-bar"><div className="op-bar-fill op-bar-disp" style={{width: `${dispatchPct}%`}}></div></div>
                <span className="op-bar-num"><strong>{totals.dispatched}</strong>/{totals.total}</span>
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
          const disp = Object.values(it.dispatched || {}).reduce((a,b) => a+b, 0);
          const activeSizes = SIZES.filter(sz => it.sizes[sz]);
          return (
            <div key={i} className="order-item">
              <div className="oi-head">
                <div className="oi-prod">{it.product}</div>
                <div className="oi-progress">
                  <span className="oi-prog-print">Printed {printed}/{total}</span>
                  <span className="oi-prog-sep">·</span>
                  <span className="oi-prog-disp">Dispatched {disp}/{total}</span>
                </div>
              </div>
              <div className="oi-sizes">
                {activeSizes.map(sz => {
                  const ordered = it.sizes[sz];
                  const printedSz = it.printed?.[sz] || 0;
                  const dispatchedSz = it.dispatched?.[sz] || 0;
                  const pendingPrint = ordered - printedSz;
                  const pendingDisp = printedSz - dispatchedSz; // printed but not yet shipped
                  const fullyDone = dispatchedSz === ordered;
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
                        <div className="oi-row-r">
                          <span className="oi-k oi-k-disp">DSP</span>
                          <span className="oi-v oi-v-disp">{dispatchedSz}</span>
                        </div>
                      </div>
                      {fullyDone ? (
                        <div className="oi-pending oi-check"><Check size={10}/> done</div>
                      ) : (
                        <div className="oi-pending-stack">
                          {pendingPrint > 0 && <div className="oi-pending-line">{pendingPrint} to print</div>}
                          {pendingDisp > 0 && <div className="oi-pending-line oi-pending-ship">{pendingDisp} to ship</div>}
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

function NewOrderModal({ onClose, onSubmit }) {
  const [client, setClient] = useState("Culture Circle");
  const [date, setDate] = useState(today());
  const [items, setItems] = useState([{ product: "", sizes: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 } }]);

  const setItem = (i, field, val) => setItems(items.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  const setItemSize = (i, sz, val) => setItems(items.map((it, idx) => idx === i ? { ...it, sizes: { ...it.sizes, [sz]: parseInt(val) || 0 } } : it));
  const addItem = () => setItems([...items, { product: "", sizes: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 } }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const valid = items.every(it => it.product && Object.values(it.sizes).some(v => v > 0));
  const grandTotal = items.reduce((s, it) => s + Object.values(it.sizes).reduce((a,b) => a+b, 0), 0);

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
          {items.map((it, i) => (
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
            </div>
          ))}
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
function Dispatches({ data, update, refresh, profile, isAdmin }) {
  const [showNew, setShowNew] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [filterOrder, setFilterOrder] = useState("all");

  const dispatches = (data.dispatches || []).filter(d => {
    if (filterDate && d.date !== filterDate) return false;
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
        <label className="mono-label">DATE
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}/>
        </label>
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
// PAGE 5 · WAREHOUSE
// ═══════════════════════════════════════════════════════════════════
function Warehouse_({ data, update, refresh, isAdmin }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterClient, setFilterClient] = useState("all");

  const items = data.warehouse.filter(w => filterClient === "all" || w.client === filterClient);

  const add = async (item) => {
    try {
      await insertRow("warehouse", { ...item, id: `inv${Date.now()}` });
      refresh(); setShowAdd(false);
    } catch (e) { alert("Failed: " + e.message); }
  };

  const saveEdit = async (updated) => {
    try {
      await updateRow("warehouse", updated.id, { client: updated.client, product: updated.product, sizes: updated.sizes });
      refresh(); setEditing(null);
    } catch (e) { alert("Failed: " + e.message); }
  };

  const remove = async (id) => {
    if (!confirm("Remove this item from warehouse?")) return;
    try { await deleteRow("warehouse", id); refresh(); }
    catch (e) { alert("Failed: " + e.message); }
  };

  const totalByClient = CLIENTS.map(c => ({
    client: c,
    total: data.warehouse.filter(w => w.client === c).reduce((s, w) => s + Object.values(w.sizes).reduce((a,b) => a+b, 0), 0)
  }));

  return (
    <div>
      <PageHeader title="Warehouse" sub="plain tees from brands · stock per product × size"
        action={<button className="btn-primary" onClick={() => setShowAdd(true)}><Plus size={13}/> ADD STOCK</button>}/>

      <div className="wh-summary">
        {totalByClient.map(t => (
          <div key={t.client} className="wh-sum-card">
            <div className="wh-sum-label">{t.client.toUpperCase()}</div>
            <div className="wh-sum-val">{t.total} <span>pcs</span></div>
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <div className="chip-group">
          <button className={`chip ${filterClient === "all" ? "on" : ""}`} onClick={() => setFilterClient("all")}>ALL</button>
          {CLIENTS.map(c => (
            <button key={c} className={`chip ${filterClient === c ? "on" : ""}`} onClick={() => setFilterClient(c)}>{c.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <section className="panel">
        <div className="wh-table">
          <div className="wh-thead">
            <div>CLIENT</div><div>PRODUCT</div>
            {SIZES.map(sz => <div key={sz} className="wh-sz">{sz}</div>)}
            <div>TOTAL</div><div></div>
          </div>
          {items.map(w => {
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
          {items.length === 0 && <div className="empty">No stock recorded.</div>}
        </div>
      </section>

      {showAdd && <WarehouseModal onClose={() => setShowAdd(false)} onSubmit={add}/>}
      {editing && <WarehouseModal initial={editing} onClose={() => setEditing(null)} onSubmit={saveEdit}/>}
    </div>
  );
}

function WarehouseModal({ initial, onClose, onSubmit }) {
  const [f, setF] = useState(initial || { client: "Culture Circle", product: "", sizes: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 } });
  const total = Object.values(f.sizes).reduce((a,b) => a+b, 0);
  return (
    <Modal onClose={onClose} title={initial ? "EDIT STOCK" : "ADD STOCK"} wide>
      <div className="form">
        <div className="form-row">
          <label>CLIENT
            <select value={f.client} onChange={e => setF({...f, client: e.target.value})}>{CLIENTS.map(c => <option key={c}>{c}</option>)}</select>
          </label>
        </div>
        <label>PRODUCT<input value={f.product} onChange={e => setF({...f, product: e.target.value})} placeholder="e.g. Hashway Core Polo Black"/></label>
        <div>
          <div className="mono-label">QUANTITIES IN STOCK</div>
          <div className="size-grid">
            {SIZES.map(sz => (
              <label key={sz} className="size-input">
                <span>{sz}</span>
                <input type="number" min="0" value={f.sizes[sz]} onChange={e => setF({...f, sizes: { ...f.sizes, [sz]: parseInt(e.target.value) || 0 }})}/>
              </label>
            ))}
          </div>
          <div className="size-total">TOTAL: <strong>{total}</strong> pcs</div>
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
function PnL({ data, update, refresh }) {
  const [showExp, setShowExp] = useState(false);
  const [showRev, setShowRev] = useState(false);
  const [period, setPeriod] = useState("month"); // month | week | all

  const filterByPeriod = (items) => {
    if (period === "all") return items;
    const now = new Date();
    const cutoff = new Date();
    if (period === "week") cutoff.setDate(now.getDate() - 7);
    if (period === "month") cutoff.setDate(1);
    const c = cutoff.toISOString().slice(0, 10);
    return items.filter(x => x.date >= c);
  };

  const exp = filterByPeriod(data.expenses);
  const rev = filterByPeriod(data.revenue);
  const totalExp = exp.reduce((s, e) => s + e.amount, 0);
  const totalRev = rev.reduce((s, r) => s + r.amount, 0);
  const profit = totalRev - totalExp;
  const margin = totalRev ? ((profit / totalRev) * 100).toFixed(1) : "0.0";

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
  const addRev = async (r) => {
    try { await insertRow("revenue", { ...r, id: `r${Date.now()}` }); refresh(); setShowRev(false); }
    catch (err) { alert("Failed: " + err.message); }
  };
  const removeExp = async (id) => {
    try { await deleteRow("expenses", id); refresh(); } catch (e) { alert("Failed: " + e.message); }
  };
  const removeRev = async (id) => {
    try { await deleteRow("revenue", id); refresh(); } catch (e) { alert("Failed: " + e.message); }
  };

  const combined = [
    ...exp.map(e => ({ ...e, type: "exp" })),
    ...rev.map(r => ({ ...r, type: "rev" }))
  ].sort((a,b) => b.date.localeCompare(a.date));

  const CATEGORY_COLORS = ["var(--ink-yellow)", "var(--ink-cyan)", "var(--ink-amber)", "var(--ink-green)", "var(--ink-red)", "var(--ink-slate)", "#a855f7"];

  return (
    <div>
      <PageHeader title="Profit & Loss" sub="revenue · expenses · margins"
        action={
          <div style={{display:"flex", gap: 8}}>
            <button className="btn-ghost" onClick={() => setShowRev(true)}><Plus size={13}/> REVENUE</button>
            <button className="btn-primary" onClick={() => setShowExp(true)}><Plus size={13}/> EXPENSE</button>
          </div>
        }/>

      <div className="filter-bar">
        <div className="chip-group">
          <button className={`chip ${period === "week" ? "on" : ""}`} onClick={() => setPeriod("week")}>LAST 7 DAYS</button>
          <button className={`chip ${period === "month" ? "on" : ""}`} onClick={() => setPeriod("month")}>THIS MONTH</button>
          <button className={`chip ${period === "all" ? "on" : ""}`} onClick={() => setPeriod("all")}>ALL TIME</button>
        </div>
      </div>

      <div className="pnl-top">
        <div className="pnl-big pnl-rev">
          <div className="pnl-label">REVENUE</div>
          <div className="pnl-val">₹{totalRev.toLocaleString("en-IN")}</div>
          <div className="pnl-count">{rev.length} entries</div>
        </div>
        <div className="pnl-big pnl-exp">
          <div className="pnl-label">EXPENSES</div>
          <div className="pnl-val">₹{totalExp.toLocaleString("en-IN")}</div>
          <div className="pnl-count">{exp.length} entries</div>
        </div>
        <div className={`pnl-big pnl-${profit >= 0 ? "profit" : "loss"}`}>
          <div className="pnl-label">{profit >= 0 ? "PROFIT" : "LOSS"}</div>
          <div className="pnl-val">₹{Math.abs(profit).toLocaleString("en-IN")}</div>
          <div className="pnl-count">margin: {margin}%</div>
        </div>
      </div>

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
                <button className="icon-btn" onClick={() => x.type === "rev" ? removeRev(x.id) : removeExp(x.id)}><Trash2 size={12}/></button>
              </div>
            </div>
          ))}
          {combined.length === 0 && <div className="empty">No entries.</div>}
        </div>
      </section>

      {showExp && <ExpenseModal onClose={() => setShowExp(false)} onSubmit={addExp}/>}
      {showRev && <RevenueModal onClose={() => setShowRev(false)} onSubmit={addRev}/>}
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
// PAGE · INSIGHTS
// Pre-built analytical reports — zero API cost, runs on local data
// ═══════════════════════════════════════════════════════════════════
function Insights({ data }) {
  const [range, setRange] = useState(30); // days
  const [activeReport, setActiveReport] = useState("overview");

  // Compute date window
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(now.getDate() - range);
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const inRange = (d) => d >= cutoffKey;

  // ═════════ COMPUTED METRICS ═════════
  const metrics = useMemo(() => {
    // Production in range
    const prod = data.production.filter(p => inRange(p.date));
    const totalPrinted = prod.reduce((s, p) => s + p.total, 0);

    // Dispatches in range
    const disp = (data.dispatches || []).filter(d => inRange(d.date));
    const totalDispatched = disp.reduce((s, d) => s + (d.total || 0), 0);

    // Revenue & expenses in range
    const rev = data.revenue.filter(r => inRange(r.date));
    const exp = data.expenses.filter(e => inRange(e.date));
    const totalRev = rev.reduce((s, r) => s + r.amount, 0);
    const totalExp = exp.reduce((s, e) => s + e.amount, 0);
    const profit = totalRev - totalExp;

    // Attendance in range
    const attRange = data.attendance.filter(a => inRange(a.date) && a.punchOut);

    return { prod, disp, rev, exp, totalPrinted, totalDispatched, totalRev, totalExp, profit, attRange };
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
    // Count dispatched tees per client in range
    const dispByClient = {};
    for (const d of metrics.disp) {
      const order = data.orders.find(o => o.id === d.orderId);
      if (!order) continue;
      dispByClient[order.client] = (dispByClient[order.client] || 0) + (d.total || 0);
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
      const dispatched = (data.dispatches || []).filter(dd => dd.date === key).reduce((s, dd) => s + (dd.total || 0), 0);
      days.push({ date: key, label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), printed, dispatched, isSunday: d.getDay() === 0 });
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
  }, [data.production, data.dispatches, range]);

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
        .filter(p => inRange(p.date) && p.client === w.client && p.product === w.product)
        .reduce((s, p) => s + p.total, 0);

      // Days of cover = current stock ÷ (movement per day)
      const movementPerDay = movedInRange / range;
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
Period: Last ${range} days (${cutoffKey} to ${today()})
Generated: ${new Date().toLocaleString("en-IN")}
═══════════════════════════════════════════════

OVERVIEW
─────────
Total printed: ${metrics.totalPrinted} tees
Total dispatched: ${metrics.totalDispatched} tees
Revenue: ₹${metrics.totalRev.toLocaleString("en-IN")}
Expenses: ₹${metrics.totalExp.toLocaleString("en-IN")}
Profit: ₹${metrics.profit.toLocaleString("en-IN")} (${metrics.totalRev ? ((metrics.profit / metrics.totalRev) * 100).toFixed(1) : 0}% margin)

WORKER PRODUCTIVITY
────────────────────
${workerReport.map(w => `${w.worker.name.padEnd(10)} · ${w.daysPresent} days · ${w.totalHours}h total · avg ${w.avgHoursPerDay}h/day · OT: ${w.otHours}h (₹${w.otEarnings})`).join("\n")}

DAILY OUTPUT
─────────────
Working days: ${outputTrend.workingDays}/${range}
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
${stockTurnover.slow.length > 0 ? `\n○ DEAD STOCK (no movement in ${range} days):\n${stockTurnover.slow.map(i => `  · ${i.product} (${i.client}): ${i.currentStock} sitting idle`).join("\n")}` : ""}
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
        <div className="chip-group">
          <span className="mono-label" style={{gap: 8}}>RANGE</span>
          {[7, 30, 60, 90].map(d => (
            <button key={d} className={`chip ${range === d ? "on" : ""}`} onClick={() => setRange(d)}>{d}D</button>
          ))}
        </div>
        <div className="filter-summary">
          <span>{cutoffKey}</span>
          <span className="dot-sep">→</span>
          <span>{today()}</span>
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
          <div className="kpi-grid" style={{gridTemplateColumns: "repeat(4, 1fr)"}}>
            <div className="kpi kpi-cyan">
              <div className="kpi-top"><span className="kpi-label">PRINTED</span><Printer size={14} className="kpi-icon"/></div>
              <div className="kpi-value">{metrics.totalPrinted}<span className="kpi-unit">tees</span></div>
            </div>
            <div className="kpi kpi-yellow">
              <div className="kpi-top"><span className="kpi-label">DISPATCHED</span><Truck size={14} className="kpi-icon"/></div>
              <div className="kpi-value">{metrics.totalDispatched}<span className="kpi-unit">tees</span></div>
            </div>
            <div className="kpi kpi-green">
              <div className="kpi-top"><span className="kpi-label">REVENUE</span><IndianRupee size={14} className="kpi-icon"/></div>
              <div className="kpi-value">₹{(metrics.totalRev/1000).toFixed(1)}<span className="kpi-unit">K</span></div>
            </div>
            <div className={`kpi kpi-${metrics.profit >= 0 ? "green" : "red"}`}>
              <div className="kpi-top"><span className="kpi-label">PROFIT</span><TrendingUp size={14} className="kpi-icon"/></div>
              <div className="kpi-value">₹{(Math.abs(metrics.profit)/1000).toFixed(1)}<span className="kpi-unit">K</span></div>
            </div>
          </div>

          <section className="panel">
            <div className="panel-head"><div><h2>HEADLINE NUMBERS</h2><div className="panel-sub">period: last {range} days</div></div></div>
            <div className="headline-grid">
              <div className="hl-row"><span>Print-to-dispatch ratio</span><strong>{metrics.totalPrinted ? ((metrics.totalDispatched / metrics.totalPrinted) * 100).toFixed(0) : 0}%</strong></div>
              <div className="hl-row"><span>Avg revenue per tee dispatched</span><strong>₹{metrics.totalDispatched ? Math.round(metrics.totalRev / metrics.totalDispatched) : 0}</strong></div>
              <div className="hl-row"><span>Avg cost per tee printed</span><strong>₹{costBreakdown.costPerTee}</strong></div>
              <div className="hl-row"><span>Profit margin</span><strong className={metrics.profit >= 0 ? "pos" : "neg"}>{metrics.totalRev ? ((metrics.profit / metrics.totalRev) * 100).toFixed(1) : 0}%</strong></div>
              <div className="hl-row"><span>Daily avg output</span><strong>{outputTrend.avg} tees/day</strong></div>
              <div className="hl-row"><span>Working days in period</span><strong>{outputTrend.workingDays}/{range}</strong></div>
            </div>
          </section>
        </div>
      )}

      {/* ═══════ WORKER PRODUCTIVITY ═══════ */}
      {activeReport === "productivity" && (
        <div className="insight-body">
          <section className="panel">
            <div className="panel-head"><div><h2>WORKER PRODUCTIVITY · {range}D</h2><div className="panel-sub">ranked by total hours worked</div></div></div>
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
                <h2>PROFITABILITY BY CLIENT · {range}D</h2>
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
            <div className="panel-head"><div><h2>DAILY OUTPUT · {range}D</h2><div className="panel-sub">printed (cyan) vs dispatched (yellow) per day</div></div></div>
            <div style={{ height: 280, padding: "16px 12px 4px" }}>
              <ResponsiveContainer>
                <LineChart data={outputTrend.days} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke="var(--border-dim)" strokeDasharray="2 4" vertical={false}/>
                  <XAxis dataKey="label" stroke="var(--text-dim)" fontSize={9} tickLine={false} axisLine={{stroke: "var(--border)"}} interval={Math.floor(range/10)}/>
                  <YAxis stroke="var(--text-dim)" fontSize={10} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", fontSize: 11, fontFamily: "var(--font-mono)" }}/>
                  <Line type="monotone" dataKey="printed" stroke="var(--ink-cyan)" strokeWidth={2} dot={{ r: 2 }}/>
                  <Line type="monotone" dataKey="dispatched" stroke="var(--ink-yellow)" strokeWidth={2} dot={{ r: 2 }}/>
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
              <div className="ch-label">TOTAL EXPENSES · {range}D</div>
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
                <div>CLIENT</div><div>PRODUCT</div><div>IN STOCK</div><div>MOVED · {range}D</div><div>RATE</div><div>DAYS COVER</div>
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
              <div className="panel-head"><div><h2>○ DEAD STOCK</h2><div className="panel-sub">zero movement in {range} days</div></div></div>
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

:root {
  --bg-main: #0d0e0f;
  --bg-panel: #141618;
  --bg-elevated: #1a1d20;
  --bg-row: #16181a;
  --bg-input: #0f1113;
  --border: #2a2d31;
  --border-dim: #1f2226;
  --border-bright: #3a3d42;
  --text: #e8e9ea;
  --text-dim: #8a8d93;
  --text-muted: #5a5d62;

  --ink-yellow: #ffe817;
  --ink-amber: #ff9500;
  --ink-cyan: #00d4ff;
  --ink-green: #4ade80;
  --ink-red: #ff4444;
  --ink-slate: #6b7280;

  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --font-display: 'Archivo Black', sans-serif;
  --font-sans: 'Space Grotesk', sans-serif;
}

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
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
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
  grid-template-columns: 100px 1fr 70px 70px 70px 80px 90px;
  gap: 12px;
  padding: 10px 18px;
  align-items: center;
  font-size: 12px;
}
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
.disp-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
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

/* ═══ RESPONSIVE ═══ */
@media (max-width: 1100px) {
  .app { grid-template-columns: 60px 1fr; }
  .sidebar .logo > div, .nav-item span, .logo-sub, .nav-chev, .foot-sub, .foot-name, .foot-logout span { display: none; }
  .sidebar-foot { padding: 10px 8px; }
  .foot-user { justify-content: center; margin-bottom: 6px; }
  .foot-logout { padding: 6px !important; }
  .nav-item { justify-content: center; }
  .logo { justify-content: center; padding: 16px 8px; }
  .kpi-grid { grid-template-columns: repeat(3, 1fr); }
  .dash-grid, .pnl-grid { grid-template-columns: 1fr; }
  .pnl-top { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .page { padding: 16px; }
  .page-head h1 { font-size: 22px; }
  .size-grid { grid-template-columns: repeat(3, 1fr); }
  .form-row { grid-template-columns: 1fr; }
  .worker-grid { grid-template-columns: 1fr; }
}
`;
