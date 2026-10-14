# Restoring the 3% Education Equity Fee (शिक्षा समता शुल्क)

The fee was introduced in the Nepal FY 2083/84 budget and **withdrawn by the
government on 2026-07-21** ("not enforced for the time being"). The whole
implementation was removed the same day. The wording was a suspension rather
than a repeal, so this file records how to bring it back without rebuilding it.

## Where the implementation lives

| | last commit WITH the fee |
|---|---|
| backend (this repo) | `d16f4e49` — *Bake the 3% equity fee into the posted bill* |
| frontend (`smsys`) | `b5adcad` — *Equity fee is inside the bill, not a surcharge at the counter* |

Both are tagged **`equity-fee-3pct`** in their repos. The removal commits are
backend `fa10cbe1` and frontend `8984ba3`.

**Restore = revert the removal commit, do not re-implement:**

```bash
# backend
git revert --no-commit fa10cbe1     # or: git checkout equity-fee-3pct -- <paths>
python manage.py makemigrations main # re-create the table + tax_invoice_id column
# frontend
git revert --no-commit 8984ba3
```

Migration `0074_remove_education_equality_fee` dropped
`StudentLedger.tax_invoice_id` and the `SchoolEducationEqualityFee` table, so a
restore needs a new forward migration re-adding both (the reverted model file
makes `makemigrations` generate it).

## How it worked (final design, so you can sanity-check a restore)

- **Targeting**: a row in `SchoolEducationEqualityFee (school, education_level)`
  = enabled. Superadmin-managed screen; fixed 3%, no per-school rate.
- **Levy point**: at ledger POSTING. `LedgerSerializer._apply_posting_equity_fee`
  baked each taxable title's 3% into that title's posted amount and the row
  total, kept a per-title snapshot in `StudentLedger.extra_info`, and minted a
  `tax_invoice_id` — a government Tax-Invoice series serial per
  (school, economic_year), restarting each Shrawan 1.
- **Taxable period**: a fee-month counted only if `(academic_year, month)` fell
  on/after Shrawan of `EQUITY_FEE_START_YEAR = 2083`; the period YEAR came from
  the posting DATE (many schools' academic year lags the fiscal year). A posting
  with no `months` fell back to its own date.
- **Never taxed**: old dues, opening balance, carry-forward-out, and the
  metadata keys (`__titles`, `discounts`).
- **At payment** the fee was NOT added again — it was already inside the bill;
  the receipt only recorded which part of the cash was the government's share.

## What was done to the data on removal (2026-07-21)

- **199 receipts** had collected **Rs 39,183.82** of fee across 23 schools. Each
  was credited into the fee that receipt paid: the fee split across its taxable
  titles by weight, `details[title].amt +=` share, `total_paid +=` fee,
  `total_due -=` fee, and the `education_service_fee` key dropped. Cash collected
  is unchanged; each student's dues fell by exactly what they had overpaid.
  (Invoice 219755 carried a NEGATIVE fee, −23.40, from a fee reversal and was
  corrected the same way in a follow-up pass.)
- **159 posting snapshots** (Rs 23,958.31, never collected) were voided and their
  Tax-Invoice numbers nulled.
- **471 enabled (school, level) rows** deleted; the dead legacy opt-in
  `SchoolAdmin.preferences["education_service_fee_percent"]` cleared from school 3.

**If the fee is reinstated, this data is NOT re-derivable from the DB** — the
pre-removal state is only in the backups:

```
prod_backups/pgdump-preESF-removal-20260721_113557.dump   # full DB
prod_backups/esf_invoices_before_2026-07-21.json          # the 199 receipts
prod_backups/esf_ledgers_before_2026-07-21.json           # the 159 postings
prod_backups/esf_enabled_levels_before_2026-07-21.json    # the 471 targeting rows
```

(also on the server at `/var/tmp/esfbak/`). The enabled-levels JSON is the one
you want to re-seed targeting from — it is the exact set of schools and
education levels that were live when the fee was withdrawn.

The removal, remainder-fix, verification and functional-test scripts are kept
next to those backups as `esf_removal_*_2026-07-21.py`.

## Also removed with it

The **OLD-2083 ledger split** (`calculateStudentLedgerWithOldSplit`) was gated on
the same flag and went too, on purpose — the Student's Ledger is back to the
plain per-title merge for every school. It only ever separated pre-fee dues for
taxed schools; nothing was stored against the `old_2083` pseudo-title, so
removing it changed no totals, only the per-line breakdown.

`LedgerPosting.fiscal_period` and `SHRAWAN_MONTH` were **kept** — the Ledger
Posting History Period column/filter is a separate, non-tax feature.
