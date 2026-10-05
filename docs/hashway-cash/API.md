# API

`POST /api/hashway-cash` with JSON `{ "action": "...", "book": "live" | "demo", ...fields }`
and `Authorization: Bearer <Supabase access token of the finance project>`.

Errors: `{ "error": "message", ...extra }` with status 400 (bad input), 401 (not signed in),
403 (role), 409 (needs confirmation / duplicate file), 422 (validation errors — `validation`
object included), 500.

Roles: **A**dmin, **F**inance, **O**perations, **V**iewer.

## Reads (all roles)

| action | body | returns |
|---|---|---|
| `bootstrap` | — | me, today, settings, categories, channels, accounts, parties, recurring, alert rules, merged assumptions, update status |
| `dashboard` | `as_of?` | tiles, position, 3 scenarios (13 weeks), lowest points, upcoming flows, supplier dues, receivable/payable ageing, inventory, WC, CCC + trend, actual weeks, accuracy, suggestions, alerts, update status |
| `forecast` | `scenario?`, `as_of?` | all scenarios (flows for the selected one), opening cash, assumptions |
| `ledger_list` | `nature, status, from, to, category, account, source, direction, q, limit, offset` | rows, total, inflow, outflow |
| `daily_get` | `date?` (default yesterday) | payload (saved or blank), existing row, prev closings, 30-day averages, same-day ledger, open bills/installments, recent days, status |
| `receivables_list` | `kind?`, `status?` (`open`/`all`) | rows (+remaining), ageing |
| `payables_list` | `status?` | bills, PO installments, ageing |
| `po_list` | — | POs with installments, payments, paid, balance, advance |
| `inventory_list` | — | SKU analytics, totals, top cash consumers, trend |
| `working_capital` | `levers?` | locked, levers, CCC, trends |
| `mis` | `months?` | P&L by month, profit→cash bridges, adjustments |
| `bank_view` | `account_id, from?, to?` | statement lines, ledger cash, statement vs system, summary |
| `imports_list`, `import_errors {id}`, `mappings {import_type}`, `parties_list` | | |
| `report` | `type`, `date?`, `scenario?`, `month?` | `{title, columns, rows, summary, extra?}` — types: daily_cash, weekly_cash, forecast_13w, working_capital, supplier_payables, receivables, inventory, forecast_vs_actual, monthly_mis, ccc |

## Writes

| action | roles | body |
|---|---|---|
| `daily_save_draft` | AFO | `payload` |
| `daily_validate` | AFO | `payload, mode?` |
| `daily_submit` | AFO | `payload, acknowledged, recon_note?, mode? ('new'/'correct'), reason?` — 422 on errors, 409 until warnings acknowledged and recon difference explained |
| `daily_reopen` | AF | `date, reason` — voids everything the day posted (audited) |
| `txn_create` | AF | `nature (cash/expected/accrual), direction, amount, txn_date, category_code, bank_account_id?, party_name?, confidence?, description?, link? {type: receivable/payable/po_installment, id}` |
| `transfer` | AF | `from_account, to_account, amount, txn_date` |
| `txn_update` | AF | `id, patch, reason` (reason required) |
| `txn_void` | AF | `id, reason` |
| `receivable_create` | AF | `kind, channel_code, party_name, reference, origin_date, gross_amount, fees, net_amount, expected_date, confidence, book_revenue?` |
| `receivable_update` | AF | `id, patch {expected_date, confidence, status (open/disputed/cancelled), note}, reason` |
| `receivable_collect` | AF | `id, amount, date, bank_account_id` |
| `receivable_writeoff` | AF | `id, amount?, reason` |
| `payable_create` | AFO | `party_name, category_code, amount, bill_date, due_date, expected_pay_date?, priority?, reference?, description?` |
| `payable_update` | AF | `id, patch {due_date, expected_pay_date, priority, status:'cancelled'}, reason` |
| `payable_pay` | AF | `type ('payable'/'po_installment'), id, amount, date, bank_account_id` |
| `po_create` | AFO | `supplier, item_desc, category_code, total_value, order_date, expected_delivery_date, payment_terms, installments? (custom)` |
| `po_update` | AF | `id, patch {status, expected_delivery_date, note}, reason` |
| `po_installment_update` | AF | `id, patch {due_date, expected_pay_date}, reason` |
| `po_receive` | AFO | `id, value, sku_id?, units?, date?` |
| `sku_upsert`, `sku_movement` | AFO | SKU fields / `sku_id, kind, qty, date, note` |
| `import_commit` | AFO (bank & expenses: AF) | `import_type, file_name, file_hash, mapping, rows[], bank_account_id?` |
| `mapping_save` | AFO | `import_type, name, mapping` |
| `bank_automatch` | AF | `account_id, window?` |
| `bank_match` / `bank_unmatch` / `bank_ignore` / `bank_post` / `bank_balance_add` | AF | see `api/_hashway-cash.js` |
| `account_upsert`, `recurring_upsert`, `settings_save`, `assumptions_save`, `alert_rule_save`, `category_create`, `category_update`, `channel_update`, `mis_adjust`, `snapshot_now` | AF | |
| `party_upsert` | AFO | |
| `alert_ack` | all | `id` |
| `users_list`, `user_upsert` | A | `email, role, active, name, invite?` |
| `demo_step` | A, demo book only | `step: reset / master / days {from,count} / finish` |

`GET /api/hashway-ops?endpoint=cash&action=cron_daily` with `Authorization: Bearer $CRON_SECRET`
— the 10:00 IST job.
