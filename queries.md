# CentIT — Queries & Conceptual Logic Notes

This document captures investigated conceptual questions about the CentIT system, answered directly from the **source code** (not from `DOCUMENTATION.md`). Each section preserves: the original question, what was inspected in code, and the logic conclusion.

> Companion to `DOCUMENTATION.md`. Where the main doc explains _how to run_ the system, this doc explains _how the system actually thinks_.

---

## Table of contents

1. [Academic Year — the real concept](#1-academic-year--the-real-concept)
2. [Class Promotion & Historical Data Preservation](#2-class-promotion--historical-data-preservation)
3. [Reports filtering by Academic Year + Class](#3-reports-filtering-by-academic-year--class)
4. [Enrollment History report — adding an Academic Year filter](#4-enrollment-history-report--adding-an-academic-year-filter)
5. [Student Payment History — precision across academic years](#5-student-payment-history--precision-across-academic-years)

---

## 1. Academic Year — the real concept

**Question:** Do I (assistant) completely understand the concept of _academic year_ in this system?

**Source files inspected:**

- `smsys.backend/main/models/FiscalYears.py`
- `smsys.backend/main/views/FiscalYearViews.py`
- `smsys.backend/main/views/closing/AcademicYearCloseView.py`
- `smsys.backend/main/views/closing/UndoAcademicYearClosingView.py`

### 1.1 Model layer (`main/models/FiscalYears.py`)

```python
class FiscalYear(BaseModel):              # abstract
    name        = CustomCharField(min_length=4, max_length=20)
    start_date  = NepaliDateField()       # Nepali Bikram Sambat calendar
    end_date    = NepaliDateField()
    closed      = BooleanField(default=False)
    remarks     = CustomCharField(...)

class EconomicYear(FiscalYear):           # NO school FK — global / system-wide
    pass

class AcademicYear(FiscalYear):           # per-school
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)

class AcademicYearMapping(BaseModel):     # "currently running" pointer
    school                  = FK(SchoolAdmin)
    key                     = CharField(min_length=1, max_length=10)
    academic_year           = FK(AcademicYear, related_name="running_academic_year")
    previous_academic_year  = FK(AcademicYear, related_name="previous_academic_year", null/blank)
```

Key insight: **there is no single "current academic year" for a school**. The "current" AY is resolved **per class category** through `AcademicYearMapping.key`.

### 1.2 The `key` system (`FiscalYearViews.py:genKeyFromClassInfo`)

The key encodes the class category so different faculties/levels can sit on **different academic years simultaneously**:

| Education level (EL)                                   | Key form                                                     | Example              |
| ------------------------------------------------------ | ------------------------------------------------------------ | -------------------- |
| 1, 2, 10 (primary/secondary/etc.)                      | `el{EL}`                                                     | `el1`, `el2`, `el10` |
| 3 (high-school)                                        | `g{grade}`                                                   | `g11`, `g12`         |
| 4, 5, 8, 9 (bachelor / master / pre-diploma / diploma) | `el{EL}c{course}y{year}` **or** `el{EL}c{course}s{semester}` | `el4c2y2`, `el5c1s3` |

So in one school: Grade 10 may be on AY 2081, Bachelor Year 2 may be on AY 2082 — independent timelines, all tracked by `AcademicYearMapping` rows with distinct `key`s.

### 1.3 Closing an academic year (`AcademicYearCloseView.handleCloseOperations`)

Auth: **admin-only** (`AdminTokenAuthentication`).

Pre-checks (refuse to close if any of these fail):

1. **Invoice mismatch check** — `getInvoicesQuery` finds `StudentInvoice` rows for the targeted classes whose `academic_year != academic_year_id` and whose AY is not already closed. If any exist → `400 "Incorrect academic year found in invoices!"`.
2. **Ledger mismatch check** — `getLedgersQuery` does the same against `StudentLedger`.

Balance computation (`calculateBalances`):

```
balance[class][student] = Σ StudentLedger.total            # credits
                        − Σ StudentInvoice.total_paid      # debits
                        − Σ StudentInvoice.total_discount  # discounts
```

(`isCashReceipt=False` invoices only, both sides filtered by `is_active=True` and `student__is_active=True`.)

Atomic close (single `transaction.atomic()`):

1. Create a **new `AcademicYear`** row (from the supplied `new_academic_year` payload, scoped to the school).
2. For each class with balances:
   - Create a new `LedgerPosting` (class-level) with `academic_year=new_acay`, `economic_year_id`, `class_info_id`, `date=today`, `months=[]`.
   - For each student in that class, append a `StudentLedger` row with `details = {OPENING_BALANCE: float(balance)}` (balance rounded to 2 dp, `ROUND_HALF_UP`).
3. `StudentLedger.objects.bulk_create(...)` — opening balances carried forward in one shot.
4. `AcademicYear.objects.filter(school=..., id=old_id).update(closed=True)` — old AY is frozen.
5. `AcademicYearMapping.objects.filter(mapping_query).update(academic_year=new_acay, previous_academic_year=old_id)` — the "running" pointer for those keys flips to the new AY, and the old AY is remembered as `previous_academic_year` (used by Undo).
6. `ClassInfo.bulk_update(..., ["academic_year"])` — each affected class's current AY pointer is updated.

### 1.4 Undo close (`UndoAcademicYearClosingView`)

Auth: **superadmin-only** (`SuperAdminTokenAuthentication`).

`GET` lists candidates — `AcademicYearMapping` rows whose `previous_academic_year.closed=True` (i.e. close-and-rollover already happened). Joined to give human-readable names.

`POST` reverts in one `transaction.atomic()`:

1. Verify a mapping exists tying `current_academic_year_id` → `previous_academic_year_id` for that school.
2. `StudentLedger.objects.filter(academic_year=current).delete()` — wipe carry-forward ledgers.
3. `LedgerPosting.objects.filter(academic_year=current).delete()` — wipe class postings.
4. `mapping.update(academic_year=previous, previous_academic_year=None)` — flip the pointer back.
5. Revert each `ClassInfo.academic_year` to the previous AY.
6. `AcademicYear.objects.filter(id=current).delete()` — delete the new AY row.
7. `AcademicYear.objects.filter(id=previous).update(closed=False)` — reopen the old AY.

### 1.5 Tagging (the audit hooks)

Every financial row carries an explicit `academic_year` FK at creation, and is never re-tagged later:

- `StudentInvoice.academic_year` — `main/models/Invoice.py:36`
- `StudentLedger.academic_year`, `LedgerPosting.academic_year` — `main/models/Ledger.py:14`
- Exam/result models follow the same pattern (used by the close flow's validity checks).

That's how the "Invoices/Ledgers academic year mismatch" search views work — they look for rows whose stored `academic_year` doesn't match the AY currently mapped to the row's class.

### 1.6 Authentication scope summary

| Action                             | Allowed roles                                       |
| ---------------------------------- | --------------------------------------------------- |
| Read / list academic years         | admin, staff, student, superadmin                   |
| Create academic year (POST)        | admin, staff, student, superadmin (per view config) |
| Close academic year                | **admin only**                                      |
| Undo close                         | **superadmin only**                                 |
| `AcademicYearMapping` get/post/put | admin, staff, superadmin (user-token also accepted) |

### 1.7 TL;DR

Academic Year = a Nepali-calendar bounded session, **per-school**, **per-faculty-category** (via `AcademicYearMapping.key`), with a strict close lifecycle that carries student balances forward as opening balances into a freshly-created next year, while every financial record (invoice/ledger/result) carries its own `academic_year` tag to enable mismatch detection and historical querying.

---

## 2. Class Promotion & Historical Data Preservation

**Question (paraphrased):** After class promotion, do students' previous-class records (bills, ledger, results) remain accessible? E.g., Ram is in Class 2; after AY close he's promoted to Class 3. Can the user still view all his Class-2 invoices, ledgers, marks? And does new entry for Class 3 just work?

**Source files inspected:**

- `smsys.backend/main/models/Student.py`
- `smsys.backend/main/views/StudentViews.py` (lines 384–428, `promoteClass`)
- `smsys.backend/main/models/Invoice.py`
- `smsys.backend/main/models/Ledger.py`
- `smsys.backend/main/views/closing/AcademicYearCloseView.py`

### 2.1 What promotion actually does

`Student` (`Student.py:42-77`) has:

```python
class_info     = ForeignKey("main.ClassInfo", on_delete=CASCADE)   # MUTABLE
academic_year  = ForeignKey("main.AcademicYear", on_delete=CASCADE) # MUTABLE
status         = IntegerField(choices=[(1,"running"),(2,"passed out"),(3,"dropped out")])
```

`StudentViews.py:384-428` — `promoteClass`:

```python
def promoteClass(self, data):
    current_class  = data.pop("from")
    target_class   = data.pop("to")
    students       = data.pop("students")          # list of student ids
    current_status = data.pop("from_status", 1)    # RUNNING by default
    target_status  = data.pop("to_status", 1)
    ...
    with transaction.atomic():
        students = Student.objects.filter(
            id__in=students,
            class_info=current_class,
            status=current_status,
        ).select_for_update()
        for std in students:
            std.class_info_id = target_class       # OVERWRITES
            std.status        = target_status
            std.updated_at    = updated_at
        Student.objects.bulk_update(
            students, ('class_info_id', 'status', 'updated_at')
        )
```

So:

- The `Student` row's `class_info` is **overwritten in place** (2 → 3).
- `Student.academic_year` is **set at enrollment and NOT auto-updated** by either `promoteClass` or `AcademicYearCloseView` (the close flow only updates `ClassInfo.academic_year` via `bulk_update`, never `Student.academic_year`). So it effectively records the student's **initial enrollment AY** — useful for the "new admissions" report, but **not** a reliable "what year was Ram in at the time" pointer.
- **There is NO `previous_class` column** and **NO class-membership history table.**

If you only consulted the `Student` table after promotion, Ram's `class_info` would say Class 3 (he was last promoted there) and his `academic_year` would still say his original enrollment year. Neither gives you the right answer to "what class was Ram in during AY 2081" — that has to be reconstructed from the historical financial / result tags (see §2.2).

### 2.2 Where the history actually lives

History is preserved by a different mechanism: **every transactional row self-tags its academic year (and ledger postings self-tag their class) at creation time, and those rows are never rewritten by promotion**.

| Model                                     | Self-tags carried                                                          | Why this preserves history                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `StudentInvoice` (`Invoice.py:36, 44-50`) | `student`, `academic_year` (FK), `economic_year` (FK), `details` JSON      | Ram's Class-2 bills stay tied to AY 2081 forever                                                     |
| `StudentLedger` (`Ledger.py:27-34`)       | `student`, `academic_year`, `ledger_posting` (FK), `details` JSON, `total` | Ram's Class-2 ledger lines stay attached to their original `ledger_posting`                          |
| `LedgerPosting` (`Ledger.py:22-24`)       | `class_info` (FK), `academic_year` (FK)                                    | **Critical**: each posting is bolted to the class+AY it was made under — class is _snapshotted_ here |
| `StudentResult` / exam tables             | `academic_year` (used by close-view validity checks)                       | Class-2 marksheets stay queryable by AY                                                              |

Promotion (`promoteClass`) does not touch any of these rows. AY close (`AcademicYearCloseView`) creates _new_ parallel rows for the new AY but leaves the old AY rows intact.

### 2.3 Why the close flow reinforces the archive

From `AcademicYearCloseView.handleCloseOperations`:

- Old AY is marked `closed=True` — frozen, not deleted.
- A _new_ `AcademicYear` row is created.
- A _new_ `LedgerPosting` is created per class for the new AY, with `details={OPENING_BALANCE: balance}` per student carrying forward.
- Old `LedgerPosting` / `StudentLedger` / `StudentInvoice` rows stay where they are, still referencing the (now-closed) old AY.

So the closed AY becomes an **immutable archive layer** addressable by `academic_year_id`.

### 2.4 "View Ram's Class-2 records after promotion" — how

Even after `Ram.class_info_id = 3`:

```python
# Class-2 bills
StudentInvoice.objects.filter(
    student=Ram, academic_year=<old_AY_id>, is_active=True
)

# Class-2 ledger lines (ledger_posting.class_info will still resolve to class 2)
StudentLedger.objects.filter(
    student=Ram, academic_year=<old_AY_id>
).select_related('ledger_posting')

# Class-2 results
StudentResult.objects.filter(student=Ram, academic_year=<old_AY_id>)
```

Ram's _current_ `class_info` says 3, but every historical row carries its own AY — filtering by AY reconstructs the past view exactly.

### 2.5 "New entry of Class 3" — works automatically

After promotion + AY close:

- `Ram.class_info_id = 3`, `Ram.academic_year_id = <new_AY_id>`.
- The new `LedgerPosting` (created by the close flow) for Class 3 in the new AY already has Ram's `StudentLedger` row whose `details = {OPENING_BALANCE: <carry_forward>}`.
- Any new `StudentInvoice` posted will be tagged `academic_year=<new_AY>` and `student=Ram`. The invoice doesn't carry a class FK directly — it's discovered "for Class 3" because Ram's _current_ class is 3. That's fine for the live class-3 view; the past is preserved on the past rows.

### 2.6 Logic TL;DR

1. **Promotion = overwrite `Student.class_info`** — no history kept on the Student row itself.
2. **History is preserved** because every financial/result row carries its own `academic_year` (and ledger postings additionally carry `class_info`) at creation time, and is never rewritten by promotion.
3. **AY close** marks the old AY `closed=True` and creates a parallel new-AY world; old rows remain queryable forever.
4. **Querying a past student record** → filter the historical model by `student=X, academic_year=<old AY>`. Straightforward.
5. **Critical rule for any new report**: never use `Student.class_info` to determine _historical_ class membership — it's "now", not "then". Use `LedgerPosting.class_info` (or an exam-side class snapshot if applicable).

---

## 3. Reports filtering by Academic Year + Class

**Question:** Through reports, the user should be able to select an academic year and view all students of a certain class within that academic year. Is it possible and how?

### 3.1 The pitfall

The naive query "students of Class 2 in AY 2080":

```python
# WRONG — gives current class, not historical
Student.objects.filter(class_info=class_2, academic_year=<AY 2080>)
```

This is wrong because `Student.class_info` is overwritten on every promotion. Ram, who was in Class 2 during AY 2080 but is now in Class 3, **will not appear** in this filter — even though we're asking about AY 2080. And `Student.academic_year` won't save you either: it's set at enrollment and never updated by promotion or close, so it records the **initial enrollment AY** (a fixed point in the past), not "what year was Ram in this class" — which is what the report actually wants.

### 3.2 The correct pattern — derive roster from historical tags

Two production-quality options:

**Option A — via `StudentLedger ⋈ LedgerPosting` (recommended):**

```python
roster_student_ids = StudentLedger.objects.filter(
    academic_year=<AY 2080>,
    ledger_posting__class_info=<class_2>,
    is_active=True,
    ledger_posting__is_active=True,
).values_list('student', flat=True).distinct()
```

Why this works:

- The AY close flow creates a `LedgerPosting` per (class, AY) and a `StudentLedger` row per (student, that posting) — including the OPENING_BALANCE row at close time and every subsequent posting during the year.
- That makes `StudentLedger` the authoritative ledger of "who was in which class during which AY".
- Both `academic_year` and `class_info` here are immutable historical snapshots, not live pointers.

**Option B — via `StudentInvoice`:**

```python
billed_in_period = StudentInvoice.objects.filter(
    academic_year=<AY 2080>,
    isCashReceipt=False,
    is_active=True,
    # NOTE: do NOT join through student__class_info — that's the CURRENT class.
).values_list('student', flat=True).distinct()
```

Caveat: `StudentInvoice` carries `student` and `academic_year` but **not `class_info`** directly. So to get "Class 2 students in AY 2080" via invoices alone, you can't filter on class — you'd cross-reference student IDs against the LedgerPosting derived set anyway. Option A is the cleaner primary key.

### 3.3 Existing reference implementations in the codebase

Two search views already follow this exact join pattern — copy/adapt them for new reports:

- `main/views/search/InvoicesAcademicYearMismatchSearchView.py`
- `main/views/search/LedgersAcademicYearMismatchSearchView.py`

Both filter by `academic_year` + class context using the immutable historical tags rather than `Student.class_info`.

### 3.4 Logic TL;DR

| Goal                        | Right query                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Past student → past records | `StudentInvoice` / `StudentLedger` / `StudentResult`.filter(`student=X, academic_year=oldAY`)                 |
| Past roster of a class      | `StudentLedger.filter(academic_year=oldAY, ledger_posting__class_info=oldClass).values('student').distinct()` |
| Current roster of a class   | `Student.filter(class_info=class_X, status=1)` (Student row reflects "now")                                   |

The schema already supports every flavour of this report cleanly. No schema change required.

---

## 4. Enrollment History report — adding an Academic Year filter

**Question (paraphrased):** At the Reports → Enrollment History menu, can we add an academic-year filter alongside the existing education-level / class / section pickers? After selecting EL + class + section, the user should additionally be able to pick an academic year and view that historical view for clarity.

**Source files inspected:**

- `smsys/src/components/views/reports/enrollments/students/enrollments_history/index.jsx`
- `smsys/src/components/searchbars/StudentSearch.jsx`
- `smsys/src/components/searchbars/StudentSearchForm.jsx`
- `smsys/src/contexts/SearchContext.jsx`
- `smsys.backend/main/views/search/StudentSearchView.py`

**Short answer:** Yes — possible, and the backend is already ~70% set up for it. The trap is the same `Student.academic_year`-is-mutable problem from §2/§3. Below is the logic.

### 4.1 What the Enrollment History report does today

**Frontend chain:**

- `enrollments_history/index.jsx` renders `<StudentSearch>` with `searchListViewOption={searchListViewOptions.HISTORY}` and `detailed={true}`.
- `<StudentSearch>` wraps `<StudentSearchForm>`.
- `<StudentSearchForm>` shows: name fields + `<ClassPicker>` (education_level / grade / course / year / semester / section). **No academic-year input is rendered.**
- On submit, the form posts to `POST /api/search/students`.

**Backend (`StudentSearchView.post`):**

- The serializer **already declares** `academic_year = IntegerField(required=False)` (`StudentSearchView.py:191`).
- The view **already extracts** it: `academic_year = request.data.pop("academic_year", None)` (`StudentSearchView.py:291`).
- But the only branch that uses it as a real filter is the "new admissions report" branch (lines 350-356):
  ```python
  elif school_id and academic_year and not includes_education_level and not result:
      students_query &= Q(academic_year=academic_year)
  ```
  This fires **only when `education_level` is NOT in the payload** — i.e. you can't combine class + section + AY today.
- In the `searchByClassInfo=True` branch (the normal Enrollment History path), `academic_year` is explicitly nulled when name-string filters are present (line 369: `academic_year = None`), and otherwise only feeds the `_includeBalance` annotation (line 440) — **never the WHERE filter**.

So today: pick EL + class + section → returns the **current** roster, AY ignored.

### 4.2 The correctness trap

If we naively bolt `Q(academic_year=<AY>)` onto the class-info branch, we'd be filtering on **`Student.academic_year`** — which is overwritten during AY close (see §1.3 / §2.1). The result:

- **Current AY** → filter works, gives the live roster. Fine.
- **Past AY** → returns **empty** for every student who was carried into a newer AY. Only dropped-out / passed-out remnants would survive. Users would think the report is broken.

This is the same root cause as §2.1 / §3.1: the Student row reflects "now", not "then".

### 4.3 Approach A — naive (simple, but wrong for past AYs)

- **Frontend**: add an AY `<SelectInput>` to `StudentSearchForm`, populated from `/api/academic-years?school=<id>`. Wire into `studentSearch.academic_year` via the form's `onChange`.
- **Backend**: in the `searchByClassInfo` branch of `StudentSearchView.post`, append `students_query &= Q(academic_year=academic_year)` when `academic_year` is set.

Works only for the currently-mapped AY. Past AYs return blank → not acceptable.

### 4.4 Approach B — correct (handles historical AYs)

Branch on AY status before applying the class filter.

**Backend logic** (new branch added inside `StudentSearchView.post`):

```python
if academic_year and includes_education_level:
    ay = (
        AcademicYear.objects
        .filter(id=academic_year, school=school_id)
        .only('closed')
        .first()
    )
    if ay and ay.closed:
        # ----- PAST AY: derive historical roster from immutable ledger snapshots.
        class_ids = (
            ClassInfo.objects
            .filter(self.byClassInfoQuery(school_id, request.data))
            .values_list('id', flat=True)
        )
        roster_ids = (
            StudentLedger.objects
            .filter(
                academic_year=academic_year,
                ledger_posting__class_info__in=class_ids,
                is_active=True,
                ledger_posting__is_active=True,
            )
            .values_list('student', flat=True)
            .distinct()
        )
        students_query &= Q(id__in=set(roster_ids))
        # Do NOT also filter by Student.class_info — that's "now", not "then".
    else:
        # ----- CURRENT AY: Student row already reflects the right state.
        students_query &= Q(academic_year=academic_year)
        # class_info filter from byClassInfoQuery applies normally.
```

**Why this works:**

- `StudentLedger.academic_year` and `LedgerPosting.class_info` are **immutable historical tags** set at posting time and never rewritten by promotion or close.
- For a closed AY, every student who had ledger activity in that class+AY shows up — including students now promoted, passed out, or dropped out.
- Section is part of `ClassInfo`, so the section filter from `<ClassPicker>` already encodes itself into `class_ids` — `ledger_posting__class_info__in=class_ids` honours section automatically.
- Below this point, all the downstream `_includeBalance` / `_includeClassInfo` / `formatEnrollments` plumbing is unchanged — it just receives the historically-correct queryset.

**Frontend** is identical to Approach A — only the backend logic differs.

### 4.5 UX recommendation

- AY dropdown defaults to the **currently mapped AY** for the chosen class category — resolvable via the existing `/api/academic-years?class_info=<id>` endpoint (`AcademicYearView.getAcademicYearByClassId`) or via `AcademicYearMapping.key`.
- When the user picks a closed AY, surface a small badge (e.g. _"Historical view — derived from posted ledgers"_) so they know it's an archived roster, not live.
- Rest of the form (class / section / name filters) stays as-is.

### 4.6 Caveats worth knowing before building

1. **Students with zero ledger activity in a past AY won't appear via Approach B.** In practice rare — every enrolled student gets at least an OPENING_BALANCE `StudentLedger` row created by the close flow — but if a student was enrolled mid-year with no posting at all, they'd be invisible historically. Edge case; flag if it ever bites.
2. **Section changes mid-year**: if a student's section was changed mid-year (via the `isSectionChange` branch in `promoteClass`), they'll have ledger postings under multiple `class_info_id`s for the same AY. The view picks **the latest posting** (largest `id`) as the historical class — i.e. the class they were in at the end of the period. Document this rule if you ever change it.
3. **Date / `created_at` sorting**: Enrollment History orders by enrollment date (`created_at` of the Student row). That stays stable across promotions — no concern.
4. **`detailed=true` payload**: the existing `formatEnrollments` returns rich enrollment-history fields. Approach B's roster IDs feed cleanly into the same downstream code — no changes needed below the branching point.
5. **CLASSNAME column override (UX precision)**: in historical view, the `class_info` field on each returned student is **overridden** with their class _at the time of the selected AY_ — not their current class. Without this, a student who was Grade 9 in AY 2080 and is now Grade 10 would appear under "Grade 10" in the report, which contradicts the filter the user picked. The override happens after `.values(...)` materialisation, using a `{student_id: historical_class_info_id}` map built from the same `StudentLedger ⋈ LedgerPosting.class_info` query that produced the roster.

### 4.7 Logic TL;DR

| Aspect                   | Before                                                                       | After (Approach B — implemented)                                               |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Form has AY input?       | No                                                                           | Yes — `<ClosedAcademicYearSelectInput showRunning>` in `StudentSearchForm`     |
| AY accepted by API?      | Yes (serializer/extraction already in place)                                 | Yes — already wired                                                            |
| AY used as filter?       | Only in the "new admissions" branch (no EL in payload)                       | Used in the class-info branch too, with AY-status branching                    |
| Past AYs return correct? | n/a                                                                          | Yes — roster derived from `StudentLedger ⋈ LedgerPosting.class_info`           |
| Schema change?           | —                                                                            | None                                                                           |
| Status filter (past AY)? | Always defaulted to `RUNNING` → would hide passed-out / dropped-out students | Skipped unless user explicitly picks a status → full historical roster appears |

### 4.8 Implementation (now live)

**Frontend (3 edits, opt-in via prop):**

- `smsys/src/components/views/reports/enrollments/students/enrollments_history/index.jsx` — passes `useAcademicYear={true}` to `<StudentSearch>`.
- `smsys/src/components/searchbars/StudentSearch.jsx` — accepts `useAcademicYear` prop, forwards to `<StudentSearchForm>`. `studentSearchFormState.academic_year` was already present and flows into the API payload via `...cleanClassInfo(studentSearch)`.
- `smsys/src/components/searchbars/StudentSearchForm.jsx` — when `useAcademicYear={true}`, renders a new "Academic Year" `<FilterSection>` containing the existing `<ClosedAcademicYearSelectInput showRunning={true}>`. A name-remapping `onChange` adapter routes the value into `studentSearch.academic_year` (matches the form-state field and the backend's `academic_year` param).

**Backend (`smsys.backend/main/views/search/StudentSearchView.py`):**

1. New imports: `ClassInfo`, `AcademicYear`.
2. New helper `classInfoOwnQuery(school_id, data)` — same matching logic as `byClassInfoQuery` but applied directly on `ClassInfo` (no `class_info__` prefix). Used to resolve the historical class-IDs that match the user-picked EL / grade / section / etc.
3. In `StudentSearchView.post`, inside the `searchByClassInfo` branch:
   - When `academic_year` is supplied AND `education_level` is in the payload, look up `AcademicYear.closed`.
   - If `closed=True` (historical view): build `class_ids` via `classInfoOwnQuery`, then derive `roster_ids` from `StudentLedger.filter(academic_year=AY, ledger_posting__class_info__in=class_ids, is_active=True, ledger_posting__is_active=True).values_list('student').distinct()`. Apply `Q(id__in=roster_ids)` to the student query. The current-class `byClassInfoQuery` filter is intentionally **skipped** in this path — using it would over-constrain to current class membership, hiding students who've since been promoted.
   - If `closed=False` (current view): existing class-info filter runs unchanged; no extra AY constraint applied (the live class roster IS the current-AY roster).
4. The default `Q(status=RUNNING)` filter is suppressed when `is_historical_view=True` AND the user did not explicitly pick a status, so passed-out / dropped-out students from that period still appear. If the user picks a specific status from the form's status dropdown, that selection is honoured.
5. **Historical class-name override**: alongside `roster_ids`, the view also builds `historical_class_map = {student_id: latest_class_info_id_in_AY}` (from `StudentLedger.order_by("student", "-id").distinct("student")`). After `.values(...)` materialisation, each student's `class_info` is overridden with the historical class. This keeps the CLASSNAME column consistent with the AY filter — students who were Grade 9 in the selected AY render as Grade 9 even if they've since been promoted to Grade 10.

**Bottom line**: AY select dropped into `StudentSearchForm`. In `StudentSearchView.post`, branching on `AcademicYear.closed` — closed AYs derive the roster from `StudentLedger ⋈ LedgerPosting.class_info` (and skip the default RUNNING-status filter); open AYs use the existing class-info filter unchanged.

---

## 5. Student Payment History — precision across academic years

**Question (paraphrased):** Looking at a student's payment history (Ram paid Rs. 200/month when he was in nursery), the user should be able to see Ram's full lifetime ledger / payment trail — across every academic year, in order, with the correct historical labels. Everything should be sortable. Do we need DB changes for it?

**Source files inspected:**

- `smsys.backend/main/models/Invoice.py` → `StudentInvoice`
- `smsys.backend/main/models/Ledger.py` → `StudentLedger`, `LedgerPosting`
- `smsys.backend/main/models/Fee.py` → `FeeTitle`, `Fee`
- `smsys.backend/main/methods/getStudentInvoiceDetails.py` + `getStudentLedgerDetails.py`
- `smsys.backend/main/views/InvoiceViews.py` → `getTrialBalance`
- `smsys.backend/main/views/LedgerViews.py` → `calculateStudentLedger`, `mergeLedgers`, `calculateTotalPaid`
- `smsys.backend/main/constants/payment.py`
- `smsys.backend/main/serializers/InvoiceSerializer.py`
- `smsys.backend/main/serializers/LedgerSerializer.py`

### 5.1 What the schema already preserves (data side is solid)

For every payment Ram ever made, the following is **immutable** once written and survives every AY close / promotion / fee-rate change:

| Fact about the payment       | Where it lives                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Amount paid                  | `StudentInvoice.details[title_id].amt`, `StudentLedger.details[title_id]`            |
| Discount given               | `StudentInvoice.details[title_id].dis`, `StudentInvoice.total_discount`              |
| Date of payment              | `StudentInvoice.date` (Nepali) / `StudentLedger.date`                                |
| Academic year                | `StudentInvoice.academic_year` FK, `StudentLedger.academic_year` FK                  |
| Economic year                | `economic_year` FK on both                                                           |
| Payment mode                 | `StudentInvoice.mode` (cash / bank / cheque / wallet)                                |
| Months covered               | `StudentInvoice.payment_month` / `LedgerPosting.months`                              |
| **Class snapshot (ledgers)** | `LedgerPosting.class_info` FK — the class is bolted to each posting at creation time |
| Receipt vs invoice           | `StudentInvoice.isCashReceipt`                                                       |
| Cashier identity             | `HistoryLog` audit trail (see `Invoice.py:cashier_sq`)                               |

So the **core data** for "Ram paid Rs. 200 while in nursery" — the amount, the date, the AY, the class on the ledger side — is **already preserved** in the existing schema. Sorting cross-AY is just `order_by('academic_year__start_date', 'date')`. No DDL needed for any of this.

### 5.2 What was lossy (the label-drift gap — now fixed)

The one real precision problem was **FeeTitle name drift**. Both `StudentInvoice.details` and `StudentLedger.details` referenced fee titles by integer `title_id`. The displayed label was resolved live against the current `FeeTitle.title` field — which an admin can rename any time. Consequences:

1. **Rename**: admin renames "Monthly Fee" → "Tuition Fee" three years later → every historical receipt now reads "Tuition Fee Rs. 200" even though Ram's original receipt said "Monthly Fee Rs. 200". Amounts correct; labels drift.
2. **Delete**: hard-delete of FeeTitle → orphaned `title_id`, displays blank / `None`.
3. **Soft-delete**: `is_active=False` → recoverable only if the lookup query doesn't filter on `is_active`.

This is **label-drift, not data-loss** — the math is still right, but the receipt looks different over time. For "precise" reporting (which the user explicitly asked for), that's not acceptable.

### 5.3 Why no DDL migration is needed for the fix

`StudentInvoice.details` and `StudentLedger.details` are both **`JSONField`**. We can add new keys inside the JSON without an `ALTER TABLE` migration. So the fix is purely:

- **At write time**: stamp a parallel `{title_id_str: FeeTitle.title}` map into `details[TITLE_NAMES_KEY]` (constant `"__titles"`).
- **At read time**: prefer the snapshot map; fall back to live `FeeTitle.title` lookup for old rows that don't have it.

Backward compatible by construction. Zero DDL.

### 5.4 What was actually implemented

**New constant** (`main/constants/payment.py`):

```python
TITLE_NAMES_KEY = "__titles"
```

**New helper** (`main/methods/enrichDetailsWithTitleNames.py`):

- `enrich_details_with_title_names(details, school_id)` — mutates a single details dict in place, stamps the snapshot map.
- `enrich_many_details(details_list, school_id)` — batched variant for bulk_create paths (single FeeTitle query for many rows).
- Both skip exception keys (`TRANSPORTATION`, `OPENING_BALANCE`, etc.) and the `TITLE_NAMES_KEY` itself, so they're idempotent.

**Writers wired**:

- `StudentInvoiceSerializer.create` — enriches `details` before `StudentInvoice.objects.create`.
- `LedgerPostingSerializer.create` — enriches every student-ledger's `details` (batched via `enrich_many_details`) before `bulk_create`; single-instance fallback uses the unbatched helper.
- `LedgerViews.handleStudentLedgerPosting` goes through `LedgerPostingSerializer`, so it's covered transitively.
- `AcademicYearCloseView.handleCloseOperations` only writes `{OPENING_BALANCE: balance}` — that's an EXCEPTION_TITLE with a static label, so no FeeTitle snapshot needed. No change there.

**Readers updated to prefer the snapshot**:

- `getStudentInvoiceDetails.formatStudentInvoiceDetails` — looks up `details[TITLE_NAMES_KEY][str(title_id)]` first, then falls back to the live `titles.get(int(title))`.
- `getStudentLedgerDetails.formatStudentLedgerDetails` — same pattern.

**Iteration sites guarded so `__titles` isn't treated as a real title**:

- `LedgerViews.calculateStudentLedger` (ledger and invoice iterations) — skips `TITLE_NAMES_KEY`.
- `LedgerViews.mergeLedgers` — skips it.
- `LedgerViews.calculateTotalPaid` — skips it (and now checks `isinstance(details, dict)` defensively).
- `extractTitleIds.extractTitleIdsFromInvoice` / `extractTitleIdsFromLedgers` / `extractTitleIdsFromInvoices` — extended `EXCEPTION_TITLES` to a private `_NON_TITLE_KEYS` set that includes `TITLE_NAMES_KEY`.

### 5.5 What was NOT changed (and why)

- **No `class_info` FK on `StudentInvoice`**: the class snapshot for any ledger period is already on `LedgerPosting.class_info`, recoverable via `StudentLedger.filter(student=X, academic_year=Y).values('ledger_posting__class_info').distinct()`. Adding the FK would duplicate that and require a fragile backfill. Pass.
- **No `FeeHistory` versioning table**: the actually-paid amount is already snapshotted in `details.amt`. Versioning the fee table separately would solve a problem we don't have.
- **No `StudentClassHistory` table**: `LedgerPosting.class_info` already snapshots class membership per (student, AY). The §2 / §3 query patterns already work.
- **No StaffInvoice / StaffLedger enrichment**: staff payroll doesn't reference `FeeTitle`; the analogous concern would be about staff salary heads, which is a separate domain.

### 5.6 Caveats / known limits of this fix

1. **Existing historical rows have no `__titles` snapshot** — the reader falls back to the live name, which will reflect any rename that already happened before deployment. A one-shot backfill script (`for each StudentInvoice/StudentLedger row: enrich_details_with_title_names(row.details); row.save()`) would stamp the **current** title onto historical rows. Imperfect (renames already lost) but better than nothing.
2. **If an admin renames a title AND the new name is also wrong historically**, only the snapshot stamped at write-time is authoritative going forward. Old rows backfilled later will carry whatever name was current at backfill time.
3. **Soft-deleted `FeeTitle` rows** (`is_active=False`) are filtered out by the enrichment helper's `is_active=True` clause. If you need to backfill names from inactive titles, drop that filter in the helper temporarily for the backfill run.
4. **Per-month amount variation**: `StudentLedger.details[title_id]` stores the **total** for the posting (across all `LedgerPosting.months`). If a fee changed mid-period within a single posting, the per-month split isn't recoverable from the row. This is an existing pre-condition of the schema, not introduced by this change. For Ram-in-nursery, you can compute "Rs. 200/month" as `total / len(LedgerPosting.months)` — good enough for almost all reports.

### 5.7 Recommended query pattern for "Ram's full payment history"

```python
ledgers = (
    StudentLedger.objects
    .filter(student=ram, is_active=True, ledger_posting__is_active=True)
    .select_related('ledger_posting', 'ledger_posting__class_info', 'academic_year')
    .annotate(
        class_info_id=F('ledger_posting__class_info'),
        months=F('ledger_posting__months'),
        ay_name=F('academic_year__name'),
        ay_start=F('academic_year__start_date'),
    )
    .order_by('ay_start', 'date')
)

invoices = (
    StudentInvoice.objects
    .filter(student=ram, is_active=True)
    .select_related('academic_year')
    .annotate(
        ay_name=F('academic_year__name'),
        ay_start=F('academic_year__start_date'),
        # derive the class from Ram's earliest ledger row for that AY
        class_info_id=Subquery(
            StudentLedger.objects
            .filter(student=OuterRef('student'), academic_year=OuterRef('academic_year'))
            .values('ledger_posting__class_info')[:1]
        ),
    )
    .order_by('ay_start', 'date')
)
```

Format each row through `formatStudentInvoiceDetails` / `formatStudentLedgerDetails` with `detailed_titles=True` — labels are now historically accurate.

### 5.8 Logic TL;DR

| Concern                                     | Status                | Mechanism                                                             |
| ------------------------------------------- | --------------------- | --------------------------------------------------------------------- |
| Cross-AY payment history                    | already works         | filter by `student=X` across `StudentInvoice` + `StudentLedger`, sort |
| Per-payment amount preserved                | already works         | written to `details.amt`, never rewritten                             |
| Per-payment class context                   | already works         | `LedgerPosting.class_info` (ledger side)                              |
| AY tagging                                  | already works         | `academic_year` FK on every row                                       |
| Sorting / ordering                          | already works         | `(academic_year__start_date, date)` ordering                          |
| **Historical fee-title label fidelity**     | **NOW IMPLEMENTED**   | new `__titles` snapshot inside the existing `details` JSONField       |
| Class snapshot directly on `StudentInvoice` | not done — not needed | derivable via `StudentLedger ⋈ LedgerPosting.class_info`              |
| Fee-amount versioning table                 | not done — not needed | actually-paid amount is already snapshotted on the invoice/ledger row |

**Bottom line**: One JSON-shape change (no DDL) closes the historical-label drift gap. Everything else the user wanted — sorted cross-AY history with correct amounts, classes, and labels — was already supported by the existing schema. The Enrollment-History pattern from §4 (filtering by AY + class) plus the §5 snapshot together give "precise" reporting end-to-end.

### 5.9 Trial-balance view — Class + Academic Year columns (UI surface)

The data was already preserved (§5.1) but the _Student's Trial Balance_ table on **Payment → Student → Student Ledger** only showed `S.N | Invoice no. | Date | Particular | Dr. | Cr. | Balance | Months`. Two new columns surface the historical context:

- **Class** — for ledger rows comes directly from `LedgerPosting.class_info` (immutable snapshot); for invoice rows derived from the matching ledger in the same AY via a `{academic_year_id: latest_class_info_id}` map built inside `InvoiceViews.getTrialBalance`. Resolved to human-readable name via the existing `cacheClassname` helper.
- **Academic Year** — straight from each row's `academic_year__name`, populated for both ledgers and invoices.

Frontend grid widened from `grid-cols-12` → `grid-cols-14` (already in the project's Tailwind safelist). The discount-line helper (`particularDiscount`) propagates parent invoice's class / AY so discount rows render with the same labels.

This is a **display-layer change only** — no schema migration, no JSON-shape changes, no backfill. See `codechanges.md` Feature C for the diffs.

---

_Last updated: 2026-05-23._
_Authored from direct source-code inspection of the `Cent-New` checkout._
