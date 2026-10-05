import React, { useEffect, useState } from "react";
import { call } from "../api.js";
import { useApi, useApp, useToast, useReason, Card, Btn, Field, Input, MoneyInput, Select, Modal, PageHead, Badge, inr, fdate, Skeleton, DataTable, Help } from "../ui.jsx";

export default function Settings() {
  const { can, book } = useApp();
  useEffect(() => { const h = window.location.hash.slice(1); if (h) setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth" }), 300); }, []);
  return (
    <>
      <PageHead title="Settings" sub={`Book: ${book === "demo" ? "DEMO (sample data)" : "LIVE"} — settings are per book.`} />
      <div style={{ display: "grid", gap: 14 }}>
        <General />
        <Accounts />
        <Recurring />
        <Alerts />
        <Parties />
        <Channels />
        <Categories />
        {can("admin") && <Users />}
        {can("admin") && <Demo />}
      </div>
    </>
  );
}

function General() {
  const { boot, can, reloadBoot } = useApp();
  const toast = useToast();
  const [ask, reasonEl] = useReason();
  const [s, setS] = useState(boot.settings);
  const save = async () => {
    const reason = await ask("Why are you changing these settings?");
    if (!reason) return;
    const patch = Object.fromEntries(Object.entries(s).filter(([k, v]) => boot.settings[k] !== v && !["book", "updated_at", "updated_by"].includes(k)));
    try { await call("settings_save", { patch, reason }); toast("Settings saved."); reloadBoot(); } catch (e) { toast(e.message, "bad"); }
  };
  const num = (k) => (v) => setS({ ...s, [k]: v });
  return (
    <Card title="Minimum cash & rules" actions={can("finance") && <Btn kind="primary" size="sm" onClick={save}>Save</Btn>}>
      {reasonEl}
      <fieldset disabled={!can("finance")} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="cf-form">
          <Field label="Minimum cash reserve (manual)" help="Cash you never want to go below. Projected cash under this triggers a HIGH alert."><MoneyInput value={s.min_cash_manual} onChange={num("min_cash_manual")} /></Field>
          <Field label="How to set the minimum" help="Computed = critical payments (salaries, rent, GST, EMI, critical suppliers, logistics) due in the next N days.">
            <Select value={s.min_cash_mode} onChange={num("min_cash_mode")} options={[{ value: "higher", label: "Higher of manual and computed" }, { value: "manual", label: "Manual amount only" }, { value: "computed", label: "Computed from critical payments" }]} /></Field>
          <Field label="Critical-payments window (days)"><Input type="number" value={s.min_cash_horizon_days} onChange={(e) => num("min_cash_horizon_days")(e.target.value)} /></Field>
          <Field label="GST rate on sales (%)"><Input type="number" step="0.1" value={s.gst_rate_pct} onChange={(e) => num("gst_rate_pct")(e.target.value)} /></Field>
          <Field label="Net GST payable (% of net sales)" help="What you actually pay on the 20th after input credit. Reserved automatically in the forecast."><Input type="number" step="0.1" value={s.gst_net_payable_pct} onChange={(e) => num("gst_net_payable_pct")(e.target.value)} /></Field>
          <Field label="Default COGS (% of sales ex-GST)" help="Used for the MIS when SKU cost isn't recorded."><Input type="number" step="0.5" value={s.default_cogs_pct} onChange={(e) => num("default_cogs_pct")(e.target.value)} /></Field>
          <Field label="Flag amounts above (× 30-day average)"><Input type="number" step="0.5" value={s.large_amount_multiple} onChange={(e) => num("large_amount_multiple")(e.target.value)} /></Field>
          <Field label="…and above (₹)"><MoneyInput value={s.large_amount_floor} onChange={num("large_amount_floor")} /></Field>
          <Field label="Bank reconciliation tolerance (₹)"><Input type="number" value={s.recon_tolerance} onChange={(e) => num("recon_tolerance")(e.target.value)} /></Field>
          <Field label="Slow-moving above (days of cover)"><Input type="number" value={s.slow_moving_days} onChange={(e) => num("slow_moving_days")(e.target.value)} /></Field>
          <Field label="Dead stock: no sale for (days)"><Input type="number" value={s.dead_stock_days} onChange={(e) => num("dead_stock_days")(e.target.value)} /></Field>
        </div>
        <label className="cf-check" style={{ marginTop: 12 }}><input type="checkbox" checked={!!s.receivables_from_sales} onChange={(e) => setS({ ...s, receivables_from_sales: e.target.checked })} />
          Create gateway/COD receivables from the daily sales numbers <Help tip="Turn OFF once you import payment-level gateway files or AWB-level courier COD reports, so the same money isn't expected twice." /></label>
      </fieldset>
    </Card>
  );
}

function Accounts() {
  const { boot, can, reloadBoot } = useApp();
  const [edit, setEdit] = useState(null);
  return (
    <Card title="Bank & cash accounts" sub="Opening balance + date is where the ledger starts for each account" actions={can("finance") && <Btn size="sm" onClick={() => setEdit({ kind: "bank", opening_date: boot.today, opening_balance: "", restricted_amount: 0 })}>+ Account</Btn>}>
      <DataTable rows={boot.accounts} onRow={can("finance") ? setEdit : undefined} empty="Add Hashway's bank accounts to start."
        columns={[{ key: "name", label: "Account", render: (a) => <>{a.name} {a.is_primary && <Badge tone="info">primary</Badge>} {!a.active && <Badge>inactive</Badge>}</> },
          { key: "kind", label: "Type" }, { key: "opening_balance", label: "Opening", num: true, render: (a) => inr(a.opening_balance) },
          { key: "opening_date", label: "From", render: (a) => fdate(a.opening_date) }, { key: "restricted_amount", label: "Restricted", num: true, render: (a) => inr(a.restricted_amount) }]} />
      {edit && <AccountModal a={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reloadBoot(); }} />}
    </Card>
  );
}
function AccountModal({ a, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(a);
  const [reason, setReason] = useState("");
  const save = async () => { try { await call("account_upsert", { ...f, reason }); toast("Account saved."); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal title={a.id ? `Edit ${a.name}` : "New account"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="cf-form">
        <Field label="Name"><Input value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="HDFC Current ••4521" /></Field>
        <Field label="Bank"><Input value={f.bank_name || ""} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></Field>
        <Field label="Last 4 digits"><Input value={f.account_last4 || ""} maxLength={4} onChange={(e) => setF({ ...f, account_last4: e.target.value })} /></Field>
        <Field label="Type"><Select options={[{ value: "bank", label: "Bank" }, { value: "cash", label: "Cash" }, { value: "wallet", label: "Wallet" }]} value={f.kind} onChange={(v) => setF({ ...f, kind: v })} /></Field>
        <Field label="Opening balance"><MoneyInput value={f.opening_balance} onChange={(v) => setF({ ...f, opening_balance: v })} /></Field>
        <Field label="As of (opening date)"><Input type="date" value={f.opening_date} onChange={(e) => setF({ ...f, opening_date: e.target.value })} /></Field>
        <Field label="Restricted / reserved" help="e.g. FD lien or OD margin — counted in cash but not available."><MoneyInput value={f.restricted_amount} onChange={(v) => setF({ ...f, restricted_amount: v })} /></Field>
      </div>
      <label className="cf-check"><input type="checkbox" checked={!!f.is_primary} onChange={(e) => setF({ ...f, is_primary: e.target.checked })} /> Primary account (default in forms)</label>
      {a.id && <label className="cf-check"><input type="checkbox" checked={f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>}
      {a.id && <Field label="Reason (needed if you change the opening balance)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
    </Modal>
  );
}

function Recurring() {
  const { boot, can, reloadBoot } = useApp();
  const [edit, setEdit] = useState(null);
  return (
    <Card title="Recurring commitments" sub="Salaries, rent, EMI, software… automatically projected into every future week (skipped once that period is booked)"
      actions={can("finance") && <Btn size="sm" onClick={() => setEdit({ frequency: "monthly", day_of_month: 1, start_date: boot.today, category_code: "ops_rent", amount: "" })}>+ Recurring</Btn>}>
      <DataTable rows={boot.recurring} onRow={can("finance") ? setEdit : undefined} empty="None yet."
        columns={[{ key: "name", label: "Name", render: (r) => <>{r.name} {r.is_critical && <Badge tone="warn">critical</Badge>} {!r.active && <Badge>paused</Badge>}</> },
          { key: "category_code", label: "Category", render: (r) => boot.categories.find((c) => c.code === r.category_code)?.name },
          { key: "amount", label: "Amount", num: true, render: (r) => inr(r.amount) },
          { key: "frequency", label: "Every", render: (r) => `${r.frequency}${r.day_of_month ? ` on day ${r.day_of_month}` : ""}` },
          { key: "end_date", label: "Until", render: (r) => (r.end_date ? fdate(r.end_date) : "ongoing") }]} />
      {edit && <RecurringModal r={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reloadBoot(); }} />}
    </Card>
  );
}
function RecurringModal({ r, onClose, onSaved }) {
  const { boot } = useApp();
  const toast = useToast();
  const [f, setF] = useState(r);
  const outCats = boot.categories.filter((c) => c.active && c.direction === "out");
  const save = async () => { try { await call("recurring_upsert", f); toast("Saved — forecast updated."); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal title={r.id ? `Edit ${r.name}` : "New recurring commitment"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="cf-form">
        <Field label="Name"><Input value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Category"><Select options={outCats.map((c) => ({ value: c.code, label: `${c.grp} · ${c.name}` }))} value={f.category_code} onChange={(v) => setF({ ...f, category_code: v })} /></Field>
        <Field label="Amount"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Frequency"><Select options={["weekly", "monthly", "quarterly", "yearly"]} value={f.frequency} onChange={(v) => setF({ ...f, frequency: v })} /></Field>
        {f.frequency === "weekly" ? <Field label="Weekday"><Select options={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => ({ value: String(i + 1), label: d }))} value={String(f.weekday || 1)} onChange={(v) => setF({ ...f, weekday: v })} /></Field>
          : <Field label="Day of month"><Input type="number" min={1} max={31} value={f.day_of_month || ""} onChange={(e) => setF({ ...f, day_of_month: e.target.value })} /></Field>}
        <Field label="Starts"><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label="Ends (optional)"><Input type="date" value={f.end_date || ""} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
      </div>
      <label className="cf-check"><input type="checkbox" checked={!!f.is_critical} onChange={(e) => setF({ ...f, is_critical: e.target.checked })} /> Critical — counts toward minimum cash</label>
      {r.id && <label className="cf-check"><input type="checkbox" checked={f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>}
    </Modal>
  );
}

function Alerts() {
  const { boot, can, reloadBoot } = useApp();
  const toast = useToast();
  const save = async (r, patch) => { try { await call("alert_rule_save", { ...r, ...patch }); toast("Alert updated."); reloadBoot(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Card id="alerts" title="Alerts" sub="Evaluated live on the dashboard and stored daily by the 10 AM job (also posted to Slack if configured)">
      <table className="cf-table"><thead><tr><th>Alert</th><th>Severity</th><th className="n">Threshold</th><th>On</th></tr></thead><tbody>
        {boot.rules.map((r) => (
          <tr key={r.code}><td>{r.name}</td>
            <td><Select disabled={!can("finance")} options={[{ value: "high", label: "🔴 High" }, { value: "medium", label: "🟡 Medium" }, { value: "info", label: "Info" }]} value={r.severity} onChange={(v) => save(r, { severity: v })} /></td>
            <td className="n" style={{ width: 160 }}>{r.threshold === null ? <span className="faint">—</span> : <Input type="number" disabled={!can("finance")} defaultValue={r.threshold} onBlur={(e) => Number(e.target.value) !== Number(r.threshold) && save(r, { threshold: e.target.value })} />}</td>
            <td><input type="checkbox" disabled={!can("finance")} checked={r.enabled} onChange={(e) => save(r, { enabled: e.target.checked })} aria-label={`Enable ${r.name}`} /></td></tr>))}
      </tbody></table>
    </Card>
  );
}

function Parties() {
  const { can } = useApp();
  const { data, reload } = useApi("parties_list");
  const [edit, setEdit] = useState(null);
  const toast = useToast();
  const save = async () => { try { await call("party_upsert", edit); toast("Saved."); setEdit(null); reload(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Card title="Suppliers, customers & platforms" actions={can("write") && <Btn size="sm" onClick={() => setEdit({ kind: "supplier", payment_terms_days: 0 })}>+ Party</Btn>}>
      {!data ? <Skeleton /> : <DataTable rows={data} onRow={can("write") ? setEdit : undefined} max={200}
        columns={[{ key: "name", label: "Name" }, { key: "kind", label: "Type" }, { key: "gstin", label: "GSTIN" }, { key: "payment_terms_days", label: "Credit days", num: true },
          { key: "owed", label: "We owe", num: true, render: (p) => (p.owed ? inr(p.owed) : "—") }]} />}
      {edit && <Modal title={edit.id ? edit.name : "New party"} onClose={() => setEdit(null)} footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
        <div className="cf-form">
          <Field label="Name"><Input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Type"><Select options={["supplier", "customer", "platform", "courier", "gateway", "employee", "landlord", "government", "lender", "other"]} value={edit.kind} onChange={(v) => setEdit({ ...edit, kind: v })} /></Field>
          <Field label="GSTIN"><Input value={edit.gstin || ""} onChange={(e) => setEdit({ ...edit, gstin: e.target.value })} /></Field>
          <Field label="Phone"><Input value={edit.phone || ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label="Credit days"><Input type="number" value={edit.payment_terms_days} onChange={(e) => setEdit({ ...edit, payment_terms_days: e.target.value })} /></Field>
        </div>
      </Modal>}
    </Card>
  );
}

function Channels() {
  const { boot, can, reloadBoot } = useApp();
  const toast = useToast();
  const save = async (c, patch) => { try { await call("channel_update", { ...c, ...patch }); toast("Updated."); reloadBoot(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Card title="Settlement terms" sub="Fees and days-to-cash for gateways, COD couriers and marketplaces — used for receivables and projections">
      <table className="cf-table"><thead><tr><th>Channel</th><th>Type</th><th className="n">Fee %</th><th className="n">Days to cash</th></tr></thead><tbody>
        {boot.channels.map((c) => (
          <tr key={c.code}><td>{c.name}</td><td>{c.kind}</td>
            <td className="n" style={{ width: 120 }}><Input type="number" step="0.1" disabled={!can("finance")} defaultValue={c.fee_pct} onBlur={(e) => Number(e.target.value) !== c.fee_pct && save(c, { fee_pct: e.target.value })} /></td>
            <td className="n" style={{ width: 120 }}><Input type="number" disabled={!can("finance")} defaultValue={c.settlement_lag_days} onBlur={(e) => Number(e.target.value) !== c.settlement_lag_days && save(c, { settlement_lag_days: e.target.value })} /></td></tr>))}
      </tbody></table>
    </Card>
  );
}

function Categories() {
  const { boot, can, reloadBoot } = useApp();
  const toast = useToast();
  const [f, setF] = useState(null);
  const toggle = async (c) => { try { await call("category_update", { code: c.code, patch: { is_critical: !c.is_critical } }); reloadBoot(); } catch (e) { toast(e.message, "bad"); } };
  const save = async () => { try { await call("category_create", f); toast("Category added."); setF(null); reloadBoot(); } catch (e) { toast(e.message, "bad"); } };
  const groups = [...new Set(boot.categories.map((c) => c.grp))];
  return (
    <Card title="Categories" sub="Critical categories count toward the minimum cash requirement" actions={can("finance") && <Btn size="sm" onClick={() => setF({ name: "", direction: "out", grp: "Other", pnl_class: "opex", is_critical: false })}>+ Custom category</Btn>}>
      <div className="cf-grid cf-g3">
        {groups.map((g) => (
          <div key={g}><h3 style={{ marginBottom: 6 }}>{g}</h3>
            {boot.categories.filter((c) => c.grp === g).map((c) => (
              <label key={c.code} className="cf-check small" style={{ display: "flex", padding: "2px 0" }}>
                <input type="checkbox" disabled={!can("finance") || c.direction === "in"} checked={c.is_critical} onChange={() => toggle(c)} />
                {c.name} <span className="faint">· {c.pnl_class}</span>{c.is_custom && <Badge>custom</Badge>}
              </label>))}
          </div>))}
      </div>
      {f && <Modal title="Custom category" onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn kind="primary" onClick={save}>Add</Btn></>}>
        <div className="cf-form">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Direction"><Select options={[{ value: "out", label: "Money out" }, { value: "in", label: "Money in" }]} value={f.direction} onChange={(v) => setF({ ...f, direction: v })} /></Field>
          <Field label="Group"><Select options={groups} value={f.grp} onChange={(v) => setF({ ...f, grp: v })} /></Field>
          <Field label="In the P&L it is…"><Select value={f.pnl_class} onChange={(v) => setF({ ...f, pnl_class: v })} options={[{ value: "opex", label: "Operating expense" }, { value: "marketing", label: "Marketing" }, { value: "shipping", label: "Shipping" }, { value: "salaries", label: "Salaries" }, { value: "finance_cost", label: "Finance cost" }, { value: "inventory", label: "Inventory (not an expense)" }, { value: "tax", label: "Tax (not an expense)" }, { value: "financing", label: "Loan / capital (not P&L)" }, { value: "revenue", label: "Revenue" }, { value: "none", label: "Not in P&L" }]} /></Field>
        </div>
        <label className="cf-check"><input type="checkbox" checked={f.is_critical} onChange={(e) => setF({ ...f, is_critical: e.target.checked })} /> Critical</label>
      </Modal>}
    </Card>
  );
}

function Users() {
  const { data, reload } = useApi("users_list");
  const toast = useToast();
  const [f, setF] = useState(null);
  const save = async () => {
    try { const r = await call("user_upsert", f); toast(r.invite?.invited ? "Saved and invite email sent." : r.invite?.skipped || r.invite?.error ? `Saved. ${r.invite.skipped || r.invite.error}` : "Saved."); setF(null); reload(); }
    catch (e) { toast(e.message, "bad"); }
  };
  return (
    <Card title="Users & roles" sub="Admin: everything · Finance: entries, corrections, imports, reconciliation, assumptions · Operations: daily update, POs, bills, stock · Viewer: read-only"
      actions={<Btn size="sm" onClick={() => setF({ email: "", role: "operations", invite: true })}>+ User</Btn>}>
      {!data ? <Skeleton /> : <DataTable rows={data.map((u) => ({ ...u, id: u.email }))} onRow={(u) => setF({ ...u, invite: false })}
        columns={[{ key: "email", label: "Email" }, { key: "name", label: "Name" }, { key: "role", label: "Role", render: (u) => <Badge tone={u.role === "admin" ? "info" : ""}>{u.role}</Badge> },
          { key: "active", label: "Status", render: (u) => (u.active ? <Badge tone="good">active</Badge> : <Badge>disabled</Badge>) }]} />}
      {f && <Modal title={f.created_at ? f.email : "Add user"} onClose={() => setF(null)} footer={<><Btn onClick={() => setF(null)}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
        <div className="cf-form">
          <Field label="Email"><Input type="email" value={f.email} disabled={!!f.created_at} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Name"><Input value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Role"><Select options={["admin", "finance", "operations", "viewer"]} value={f.role} onChange={(v) => setF({ ...f, role: v })} /></Field>
        </div>
        <label className="cf-check"><input type="checkbox" checked={f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
        {!f.created_at && <label className="cf-check"><input type="checkbox" checked={!!f.invite} onChange={(e) => setF({ ...f, invite: e.target.checked })} /> Send a sign-up invite email</label>}
      </Modal>}
    </Card>
  );
}

function Demo() {
  const { book, reloadBoot } = useApp();
  const toast = useToast();
  const [prog, setProg] = useState(null);
  const load = async () => {
    try {
      setProg("Clearing demo book…");
      const { days } = await call("demo_step", { step: "reset" });
      setProg("Creating accounts, suppliers, SKUs, POs…");
      await call("demo_step", { step: "master" });
      for (let i = 0; i < days; i += 5) { setProg(`Posting daily updates through the real pipeline… ${Math.min(days, i + 5)}/${days}`); await call("demo_step", { step: "days", from: i, count: 5 }); }
      setProg("Bank statement, snapshots, alerts…");
      await call("demo_step", { step: "finish" });
      setProg(null); toast("Demo data loaded."); reloadBoot();
    } catch (e) { setProg(null); toast(e.message, "bad"); }
  };
  return (
    <Card title="Demo data" sub="Realistic Hashway sample data — ~95 days of sales, COD, settlements, POs, payroll, GST, a bank statement and forecast history.">
      {book !== "demo" ? <p className="muted">Switch to the <b>Demo</b> book (top right) to load or reset sample data. The live book is never touched.</p> : (
        <div className="cf-row">
          <Btn kind="primary" onClick={load} loading={!!prog}>Load / reset demo data</Btn>
          {prog && <span className="small muted">{prog}</span>}
        </div>)}
    </Card>
  );
}
