# Batch-Aware Academic-Year Closing — Design

Status: **design / not built.** Extends the manual 2082→2083 rollover we ran for
Nawa Nepal (school 56) on 2026-07-12 into a repeatable, batch-aware year-end.

Related: `main/management/commands/rollover_academic_year.py` (the financial close
we already run), `AcademicYearCloseView`, `main/methods/academicYear.py`
(`gen_class_key`), `main/models/Batch.py`, `DEPLOYMENT_BATCH.md`.

---

## 1. The problem, precisely

Higher-ed programs are a **shared clock**: every level of a course maps to *one*
academic year. For Nawa Nepal after the roll:

```
el4c10y1 ─┐
el4c10y2 ─┼─► EDUCATION 2083 (id 256, OPEN)      # one AY, all four levels
el4c10y3 ─┤
el4c10y4 ─┘
```

Because the levels share the pointer, **closing the year touches every cohort at
once.** You cannot close the graduating batch's year and leave the juniors alone —
the close sweeps the juniors' *live* fees into the new year (rendered as "old
dues") and the continuing-cohort guard blocks it unless forced. That is why the
year-end is currently a four-step manual dance: graduate the terminal batch →
force/carry juniors forward per-title → promote → new intake.

## 2. Two requirements that pull in opposite directions

1. **"One running academic year."** The whole consolidation existed to kill the
   old "one AY per intake" mess. The owner wants a single running session.
2. **"Close a year even though some batches are still running."** i.e. advance /
   graduate one cohort without disturbing the others.

A naive per-cohort clock (one AcademicYear record per batch) satisfies (2) but
re-creates exactly the "many running years" mess (1) was meant to remove. The
design below reconciles them: **keep one running session for display, make the
batch the unit of *progression*, and never fragment the AY just to close a
cohort.**

---

## 3. Recommended design — single running AY + batch-tracked rollover

Keep **one AcademicYear per session** (as today). Add the batch as the dimension
the system uses to *know each level's cohort* and to drive promotion. The year-end
becomes one gated command instead of four manual steps.

### 3.1 Data
- **`ClassInfo.batch` gets stamped** on every higher-ed class row (it exists,
  nullable, already in `unique_together`; today it is NULL for school 56).
  Nawa Nepal mapping: Y1→batch2082, Y2→batch2081, Y3→batch2080, Y4→batch2079.
- **`Batch.current_year` / `current_semester`** is the cohort's live position; it
  advances on promotion, not on close.
- Fees/exams unaffected: `batch` is intentionally **out of `CLASS_DETAILS_FIELDS`**,
  so `feeq` still resolves amounts by course+level only → billing byte-identical.

> ⚠️ **The stamping hazard.** `gen_class_key` appends `b<batch>` as soon as a class
> is stamped, so `el4c10y1` becomes `el4c10b5y1`. The existing mapping is keyed
> `el4c10y1` → AY resolution would return None → billing breaks. Stamping MUST be
> paired with **mirroring the mapping to the new key** (keep the old key too, so
> nothing that still reads the bare key breaks). This is the `backfill_batches` /
> `mirror_mapping_to_batch_key` path from `DEPLOYMENT_BATCH.md`, run dry-run first.

### 3.2 The annual roll (one command, dry-run first)

Extend `rollover_academic_year` from "financial close only" to the full cycle,
each phase idempotent and reversible via the snapshot:

| Phase | What it does | Batch effect |
|------|--------------|--------------|
| 1. Graduate terminal | Set the final-level cohort to `status=2` (passed out) | `Batch.graduated=True` |
| 2. Carry running | Move each running junior's net forward **per-title** into the new AY (reconcile-or-lump, as built) | none (identity immutable) |
| 3. Close + open | Close old AY, create new AY, repoint every level's mapping to it | none |
| 4. Promote | Move each junior cohort up one level (same-AY move ⇒ dues carry is a **no-op**, can't double-count) | `Batch.current_year += 1` |
| 5. New intake | Create next `Batch`, open its Year-1 class under the new AY | new batch row |

Phase 2 is exactly what the deployed command already does. Phases 1, 4, 5 are the
additions; because after phase 3 everything is in ONE academic year, phase 4's
promotion is a same-year move and its `carryForwardDuesOnPromotion` is a proven
no-op — the reason we deliberately close *before* promoting.

### 3.3 How batches are managed through a close (the answer)

- **Identity** — never edited by a close. 2082-batch stays 2082-batch forever.
- **Still-running batches** — carried forward as *current* per-title dues and kept
  `status=running`; they simply now sit under the new AY, unchanged in every other
  way, until phase-4 promotion advances their level.
- **Graduating batch** — `status=passed out` + `Batch.graduated`; its history stays
  stamped to the (now closed) year.
- **New intake** — a fresh `Batch` under the new AY's Year 1.

---

## 4. Alternative — true per-cohort clocks (only if off-cycle closing is needed)

If a cohort must finish **off** the shared calendar (e.g. a batch that started
mid-year and graduates out of step), give each `(course, batch, level)` its own
mapping key (`el4c10b5y1`, already produced by `gen_class_key`) pointing at its
**own** AcademicYear record. Then closing one batch's year marks only that record
closed; the other batches' keys/years are literally not in the query.

Cost, and why it is the fallback not the default:
- Re-introduces multiple concurrent "running" AcademicYear rows — the thing the
  consolidation removed. Acceptable only when cohorts genuinely diverge in time.
- More records, more mappings, and the AY-alignment guardrail
  (`academic_years_aligned`) must treat same-calendar per-batch years as distinct.
- Reporting that assumes "one running AY" needs a batch filter.

Recommendation: build §3 first; reach for §4 only when a real off-cycle cohort
appears (none today — 56 and 62 are clean one-batch-per-level).

---

## 5. Edge cases to design for

- **Repeat / back students** (e.g. the flagged Y3 students with a 2079 stamp): a
  batch is then **not** monolithic at one level. `(batch, level)` keys handle this;
  a batch-only key would not. Phase-4 promotion must move only the students who
  actually passed, leaving repeats at their level.
- **Overlapping intakes** (two live batches in the same course+level): the whole
  reason `ClassInfo.batch` is in `unique_together` — two rows can coexist. Only
  matters once §4 or genuine overlap exists.
- **Staggered exams** (some students of a level done, others pending): do not close
  until the level's cohort is settled; the guardrail already blocks a promote whose
  target sits in a disjoint year.
- **Mid-cycle billing**: carrying per-title (not lump `ob`) keeps continuing fees
  visible under their real titles — the owner's hard requirement.

---

## 6. Rollout (gated, non-destructive, dry-run first)

1. `analyze_batches` / `close_impact` read-only preview per school (done for 56/62).
2. **Phase A — stamp + mirror**: `backfill_batches` stamps `ClassInfo.batch` and
   mirrors mappings to the batch key (keeps old key). Dry-run → pg_dump → apply,
   one school at a time. Verify billing unchanged + `check_ay_alignment`.
3. **Phase B — full roll**: extend `rollover_academic_year` with phases 1/4/5,
   dry-run showing every promotion + balance, then `--apply` (snapshot + `--revert`).
4. Never run Phase A/B on prod without the read-only preview matching expectations
   and a fresh `pg_dump`.

Hard constraints (unchanged): additive-only schema, NULL-batch key ≡ today's key,
dry-run-first, idempotent, reversible, per-school gated, pg_dump before any apply.
