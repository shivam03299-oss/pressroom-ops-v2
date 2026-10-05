# Database schema

Source of truth: `supabase/migrations/20261004000000_hashway_cashflow.sql`.
Every business table has `book in ('live','demo')`. RLS is enabled on all `cf_*` tables with no
policies — only the API (direct Postgres connection) can read or write.

## The one ledger

`cf_transactions` — every financial event, whatever its origin (daily update, import, API,
manual, bank reconciliation). Key columns:

| column | meaning |
|---|---|
| `nature` | `cash` = money moved in/out of an account · `accrual` = recognised in the P&L, no cash (sales booked, bills) · `expected` = manual future cash for the forecast |
| `direction`, `amount` | `in`/`out`, always a positive amount |
| `txn_date` | cash: date moved · accrual: recognition date · expected: expected date |
| `category_code` → `cf_categories` | chart of accounts; `pnl_class` decides MIS treatment |
| `bank_account_id` | required when `nature = 'cash'` |
| `confidence` | `actual` (cash only) / `confirmed` / `probable` / `possible` |
| `source`, `source_ref`, `dedupe_key` | provenance + duplicate protection (unique per book while posted) |
| `daily_update_id`, `import_id`, `recurring_id`, `payable_id`, `transfer_group` | links |
| `status` | `posted` or `void` (+ `void_reason`, `voided_by`, `voided_at`) — rows are never deleted in live |

## Documents that hold expected cash

| table | purpose |
|---|---|
| `cf_receivables` | gateway / COD / marketplace / B2B money owed to Hashway: gross, fees, returns, `net_amount` (cash expected), `expected_date`, `confidence`, trigger-maintained `collected_amount` / `written_off_amount` / `status` |
| `cf_payables` | bills: amount, due date, expected pay date, priority; trigger-maintained `paid_amount` / `status`. P&L categories also create an accrual row |
| `cf_purchase_orders` | PO header: supplier, value, terms, delivery, `received_value` (for supplier-advance maths) |
| `cf_po_installments` | payment schedule (100% advance, 50/50, 30/40/30, on delivery, custom); trigger-maintained `paid_amount` |
| `cf_allocations` | settles a receivable / payable / installment with a cash txn (`collection`, `payment`) or a `writeoff` (RTO, short-pay). Totals on the documents = Σ allocations (recalculated by trigger) |
| `cf_recurring_expenses` | salaries, rent, EMI… expanded into future weeks unless that period is already booked |

## Sales, inventory, bank

| table | purpose |
|---|---|
| `cf_daily_sales` | per-day channel sales: order value, prepaid, COD, discounts, cancellations, refunds, RTO, units, COGS; generated `net_sales` |
| `cf_skus` | SKU master at cost; `units_on_hand` = Σ movements (trigger) |
| `cf_inventory_movements` | opening / receipt / sale / return / adjust / write-off |
| `cf_bank_accounts` | accounts with opening balance + date, restricted amount |
| `cf_bank_balances` | reported closing (daily update or statement) vs system closing, `difference` |
| `cf_bank_transactions` | statement lines, `match_status` (unmatched / auto / manual / posted / ignored), `matched_txn_id` |

## Workflow, forecasting, control

| table | purpose |
|---|---|
| `cf_daily_updates` | one per business day: payload, validation result, status (draft / partial / submitted / reopened), recon difference + note, late flag |
| `cf_forecast_assumptions` | per-scenario overrides of engine defaults |
| `cf_forecast_snapshots` | forecast frozen each Monday, per scenario/week — basis of accuracy |
| `cf_wc_snapshots` | daily inventory / receivables / payables / advances / CCC — trends |
| `cf_settings` | min cash (manual / computed / higher), GST, COGS %, validation thresholds |
| `cf_alert_rules`, `cf_alerts` | configurable rules; fired alerts history with acknowledgement |
| `cf_imports`, `cf_import_errors`, `cf_import_mappings` | file fingerprint (no duplicate files), per-row errors/duplicates, saved column mappings |
| `cf_users` | email → role (admin / finance / operations / viewer) |
| `cf_parties`, `cf_channels`, `cf_categories` | suppliers/customers/platforms; gateway/COD/marketplace fee & lag; chart of accounts |
| `cf_mis_adjustments` | accountant P&L-only entries with mandatory note |
| `cf_audit_log` | every insert/update/delete on 22 tables: old & new values (changed fields only), actor, reason, time |

Spec-named views: `cf_suppliers`, `cf_collections`, `cf_expenses`, `cf_payment_gateways`,
`cf_cod_settlements`, `cf_gateway_settlements`, `cf_marketplace_settlements`, `cf_po_payments`.

## Integrity rules enforced in the database

- cash rows must have an account and `confidence = 'actual'`; void rows need a reason;
- changing amount/date/direction/category/account/status of a posted transaction **requires a
  reason** (`cf.reason` set by the API) — otherwise the update is rejected;
- hard deletes of transactions and daily updates are rejected in the live book;
- a voided transaction can't be revived; voiding releases what it settled;
- document totals are recomputed from allocations, never incremented;
- dedupe keys are unique per book (posted rows) for transactions, receivables, payables,
  movements and bank lines.
