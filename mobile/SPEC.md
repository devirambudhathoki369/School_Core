# SchoolCore mobile: specification

Status: signed off 2026-11-05. Phases 1 to 5 are built: the backend in
`backend/mobileapi/` (migrations `main/0117` and `mobileapi/0001`) and the
app in this folder, with every role's screens. The app's types are
generated from the API's OpenAPI schema (`src/api/README.md`). Phase 6
(push notifications and the store listings) waits on the Firebase, Play
Console and Apple accounts.

One app for Android and iPhone with four kinds of user: **parent**,
**student**, **staff** and **school admin**. Each signs in their own way and
sees their own screens. The app has its own versioned API,
`/api/mobile/v1/`, on the existing backend and database. The web portal and
its API are not changed by it.

## 1. What makes it work well

| Decision | Why |
|---|---|
| Parents get real accounts (`Guardian`), one per school and phone, linked to each of their children | One sign-in shows every child at that school, siblings included |
| Parents sign in with a code sent to their email; a parent whose email the school does not have uses a family code from the school once | Email costs nothing and works at every school; the school vouching for each new email also settles shared phone numbers |
| Everyone else signs in with their username and password | Students, staff and admins already have these accounts |
| Short access token (15 min) plus a 60-day refresh token that changes on every use | Stays signed in for months; a stolen token is caught the moment both copies are used |
| Staff and admins must unlock the app with a PIN or fingerprint | A lost phone does not open school records |
| One request per screen, sized for slow mobile data | Screens open fast on 3G; less data used |
| Money as whole paisa, dates in Bikram Sambat, sent by the server | No rounding errors; the app does no date conversion of its own |
| Every write carries an idempotency key; attendance can be taken offline and sent later | No duplicate records from double taps or retries; works in classrooms with no signal |
| The API publishes an OpenAPI schema and the app's types are generated from it | The app and the server cannot drift apart unnoticed |
| The server can tell an old app to update (HTTP 426) | Every phone can be moved off a broken version |
| Parent links follow the student record automatically | A phone number changed in the portal re-links the parent without anyone doing it by hand |

## 2. Sign-in

Every user first enters the **school code** (for example `DEMO01`). The app
shows the school's name and logo, then asks who they are.

| Role | Proves who they are with | Account |
|---|---|---|
| Parent | Email address + 6-digit code sent to that email | `main_guardian` (new) |
| Student | Username + password | `account_studentaccount` (existing) |
| Staff | Username + password | `account_staffaccount` (existing) |
| School admin | Username + password | `account_adminaccount` (existing) |

Rules:

- A school takes app sign-ins only when `uses_mobile_app` is on and it has a
  code. The admin's username is never the code.
- A password sign-in must belong to the code's school: the student's class,
  the staff record or the admin record is in that school. Otherwise the answer
  is the same "wrong username or password" as a bad password.
- Password sign-ins reuse the portal's password check and its lock-out after
  repeated failures.
- **Email code:** asking for a code always gets the same answer, so it never
  reveals whether an email is on record. An email goes out only when the
  address belongs to a parent at that school with at least one linked,
  active child. The code is 6 digits, lasts 10 minutes and allows 5 tries.
  Each email address gets at most 1 code a minute and 5 an hour, and each
  network address 30 requests an hour.
- **First sign-in when the school does not have the email:** the parent
  enters the family code from the school and their email. A code goes to
  that email, and once it is entered, the email is saved on that parent's
  record and they are signed in. From then on the email alone works. A code
  is sent to an unknown address only after a valid family code, so the form
  cannot be used to send email to strangers.
- **Family code:** a school admin, or staff who may update student records
  (permission 102), makes one for a
  parent in the admin screens of the app (later also in the portal). It is 8
  characters from an alphabet with no look-alike letters, single use, and
  valid for 7 days. It is shown once and stored only as a hash. Making a new
  one cancels the old one.
- **Sending email:** the backend sends no email today. In development the
  email is printed in the server's terminal. Production needs an email
  account, set with `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`,
  `EMAIL_HOST_PASSWORD` and `DEFAULT_FROM_EMAIL`.
- One account may be signed in on at most 5 phones. A sixth sign-in signs out
  the oldest.

## 3. Sessions and tokens

- **Access token:** `mv1.<session id>.<expiry>.<signature>`. The signature is
  HMAC-SHA256 with a key of its own (`MOBILE_TOKEN_KEY`), and the token lasts
  15 minutes. It is sent as `Authorization: Bearer …`. The mobile API never
  reads or sets the portal's cookie.
- **Refresh token:** 32 random bytes, stored as a SHA-256 hash, valid 60 days.
  Each refresh returns a new pair and marks the old token used. Presenting a
  used token again ends the session: one of the two copies was stolen. The
  app refreshes one request at a time, so it never races itself.
- **Each request** checks the signature and expiry, then loads the session by
  its key (one indexed read). It is refused when the session is signed out,
  when the person is no longer active in that school, or when the school has
  switched the app off. "Last seen" is written at most every 5 minutes.
- **Sessions end** when the user signs out, signs out everywhere, changes
  their password (in the app or the portal), or deletes their account. They
  also end when staff leave or a student's status ends, and when a parent's
  last child link is removed. Each ending is stored with its reason.
- **App lock (on the phone only):** a 4–6 digit PIN or biometrics, required
  for staff and admins and optional for parents and students. Five wrong PINs
  sign the phone out.

## 4. Database

New tables and one new column. Every rule below is enforced by PostgreSQL,
not only by the app.

### `main_schooladmin.app_code` (new column)

| Column | Type | Rules |
|---|---|---|
| `app_code` | `varchar(8)` null | unique; `CHECK (app_code ~ '^[A-Z0-9]{4,8}$')`; set by the superadmin |

### `main_guardian`

A parent or guardian of one school, known by their mobile number.

| Column | Type | Rules |
|---|---|---|
| `id` | `bigint` | primary key |
| `school_id` | `integer` | not null, references `main_schooladmin`, cascade |
| `phone` | `varchar(10)` | not null, `CHECK (phone ~ '^9[0-9]{9}$')`: exactly 10 digits, a Nepali mobile number |
| `email` | `varchar(254)` null | the sign-in email; `CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')` |
| `name` | `varchar(100)` | not null, default `''` |
| `is_active` | `boolean` | not null, default true |
| `created_at`, `updated_at` | `timestamptz` | not null |

`UNIQUE (school_id, phone)`, and a partial unique index on `(school_id,
email) WHERE email IS NOT NULL`, so an email signs in to one parent per
school. Multiplicity: school 1 — 0..* guardian.

### `main_studentguardian`

Which guardian belongs to which student.

| Column | Type | Rules |
|---|---|---|
| `id` | `bigint` | primary key |
| `student_id` | `integer` | not null, references `main_student`, cascade |
| `guardian_id` | `bigint` | not null, references `main_guardian`, cascade |
| `relation` | `smallint` | not null; 1 father, 2 mother, 3 guardian, 4 other |
| `state` | `smallint` | not null; 1 linked, 2 needs review, 3 rejected |
| `source` | `smallint` | not null; 1 from the student record, 2 added by the school |
| `is_primary` | `boolean` | not null, default false; `CHECK (NOT is_primary OR state = 1)` |
| `decided_at` | `timestamptz` | null; `CHECK (state = 2 OR decided_at IS NOT NULL)` |
| `created_at` | `timestamptz` | not null |

`UNIQUE (student_id, guardian_id)`, and a partial unique index on
`(student_id) WHERE is_primary` for one primary guardian per student. A
trigger refuses a link whose guardian is in another school than the
student's class. Multiplicity: student 1 — 0..* link 0..* — 1 guardian. A
parent sees a child only through a link in state 1.

### `mobileapi_session`

One signed-in phone.

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | primary key |
| `role` | `smallint` | not null; 1 parent, 2 student, 3 staff, 4 admin |
| `guardian_id` | `bigint` null | references `main_guardian`, cascade |
| `student_account_id` | `integer` null | references `account_studentaccount`, cascade |
| `staff_account_id` | `integer` null | references `account_staffaccount`, cascade |
| `admin_account_id` | `integer` null | references `account_adminaccount`, cascade |
| `school_id` | `integer` | not null, references `main_schooladmin`, cascade |
| `platform` | `smallint` | not null; 1 Android, 2 iOS |
| `device_label` | `varchar(80)` | not null, default `''` |
| `app_version` | `varchar(20)` | not null |
| `created_at`, `last_seen_at` | `timestamptz` | not null |
| `revoked_at` | `timestamptz` null | |
| `revoke_reason` | `smallint` null | 1 signed out, 2 everywhere, 3 password changed, 4 token reused, 5 replaced, 6 account closed, 7 access removed |
| `credential_stamp` | `varchar(64)` | a hash of the account's password hash at sign-in. A password changed anywhere (app, portal, Django admin) no longer matches and ends the session. Empty for parents. |

Checks:
- `num_nonnulls(guardian_id, student_account_id, staff_account_id, admin_account_id) = 1`.
- The role matches its column, for example `(role = 1) = (guardian_id IS NOT NULL)`, and the same for each role.
- `(revoked_at IS NULL) = (revoke_reason IS NULL)`. It is written with an
  explicit `revoke_reason IS NOT NULL`, because `NULL IN (…)` is unknown and a
  CHECK lets unknown through.

Indexes: the index of each account foreign key. It serves both the lookups
per account and the cascades.

### `mobileapi_refreshtoken`

| Column | Type | Rules |
|---|---|---|
| `id` | `bigint` | primary key |
| `session_id` | `uuid` | not null, references `mobileapi_session`, cascade |
| `token_hash` | `varchar(64)` | SHA-256 in hex; not null, unique, `CHECK (token_hash ~ '^[0-9a-f]{64}$')` |
| `created_at` | `timestamptz` | not null |
| `expires_at` | `timestamptz` | not null, `CHECK (expires_at > created_at)` |
| `used_at` | `timestamptz` null | |

A partial unique index on `(session_id) WHERE used_at IS NULL` allows one
live token per session.

### `mobileapi_emailcode`

| Column | Type | Rules |
|---|---|---|
| `id` | `bigint` | primary key |
| `guardian_id` | `bigint` | not null, references `main_guardian`, cascade |
| `email` | `varchar(254)` | not null, lower-case; the address the code went to |
| `purpose` | `smallint` | not null; 1 sign in, 2 add this email (after a family code) |
| `code_hash` | `varchar(64)` | HMAC-SHA256 in hex, keyed by the server, because a plain hash of 6 digits can be guessed; same format check |
| `created_at`, `expires_at` | `timestamptz` | not null, `CHECK (expires_at > created_at)` |
| `attempts` | `smallint` | not null, default 0, `CHECK (attempts BETWEEN 0 AND 5)` |
| `consumed_at` | `timestamptz` null | |

Index `(email, created_at DESC)`; the email limits count rows in it.

### `mobileapi_familycode`

| Column | Type | Rules |
|---|---|---|
| `id` | `bigint` | primary key |
| `guardian_id` | `bigint` | not null, references `main_guardian`, cascade |
| `code_hash` | `varchar(64)` | HMAC-SHA256 in hex; not null, unique |
| `issued_by_admin_id` / `issued_by_staff_id` | `integer` null | `CHECK (num_nonnulls(issued_by_admin_id, issued_by_staff_id) = 1)` |
| `created_at`, `expires_at` | `timestamptz` | not null, `CHECK (expires_at > created_at)` |
| `used_at`, `revoked_at` | `timestamptz` null | |

A partial unique index on `(guardian_id) WHERE used_at IS NULL AND
revoked_at IS NULL` allows one live code per guardian.

### Later (push notifications)

`mobileapi_pushdevice` holds a session, the platform and the push token.

### Filling `main_guardian` from student records

`manage.py link_guardians [--school ID] [--apply]` prints a report first and
writes only with `--apply`. Running it twice does no harm. Without
`--school` it covers the schools that use the app. `manage.py
issue_family_code --school ID --phone N` makes a family code until the admin
screens exist.

1. Read each active student's `guardian_contact`. Keep digits only and drop a
   leading `977`. Numbers that are not mobile numbers are listed in the
   report and skipped.
2. Make one guardian per school and number. The name comes from
   `guardian_name`, else the father's name, else the mother's. The email
   comes from `guardian_email` when the record has one, in lower case. An
   email found with several numbers stays on the guardian with the most
   students, and the others are listed.
3. If every student sharing the number has the same family name, link them
   (state 1, primary, relation "guardian"). If not, the links wait for review
   (state 2): the number may be the school's own or a relative's. The
   school confirms or rejects them in the admin screens.
4. After that, a change to a student's contact in the portal re-links the
   student by itself. A signal on `StudentGuardianInfo` drops the old link
   made from the record (source 1) and adds the new one by the same rule.
   Links the school made itself (source 2) are never touched.

## 5. API

Base `/api/mobile/v1/`. These conventions hold everywhere:

- JSON with snake_case names. Calendar dates are Bikram Sambat
  `YYYY-MM-DD`. Times are ISO 8601 with the offset. Money is an integer
  number of paisa (`amount_paisa`).
- Errors are `{"error": {"code": "otp_expired", "message": "…", "fields": {…}}}`
  with the HTTP status: 400, 401, 403, 404, 409, 422, 426 or 429.
- Lists come back as `{"items": [...], "next_cursor": "…"}` with pages of 30.
- The app sends `X-App-Version` and `X-Platform`. A version below
  `MOBILE_MIN_APP_VERSION` gets `426 update_required`.
- Every POST, PUT and PATCH takes an `Idempotency-Key`. A repeat within 24
  hours returns the first answer.
- Every `/students/{id}/…` path checks access first: a parent needs a state-1
  link, and a student may open only their own record.
- Every staff path checks the same permission ids the portal uses
  (`main/constants/staff_permissions.py`).
- Each response has its own serializer. The OpenAPI 3 schema at
  `/api/mobile/v1/schema` is generated from them, and the app's TypeScript
  types are generated from that schema.

| Method and path | Who | What |
|---|---|---|
| `GET /schools/{code}` | anyone | School name, logo, and which sign-ins it offers |
| `POST /auth/parent/code` | anyone | Email a sign-in code (same answer every time) |
| `POST /auth/parent/verify` | anyone | Email + code → tokens |
| `POST /auth/parent/family-code` | anyone | Family code + email → a code goes to that email; `verify` then saves the email and signs in |
| `POST /auth/signin` | anyone | Role + username + password → tokens |
| `POST /auth/refresh` | anyone | Refresh token → new pair |
| `POST /auth/signout` · `POST /auth/signout-all` | signed in | End this session / every session of the account |
| `GET /me` | signed in | Role, profile, school; children (parent); permissions (staff) |
| `GET /me/sessions` · `DELETE /me/sessions/{id}` | signed in | The phones signed in, and signing one out |
| `POST /me/close-account` | parent, student, staff | Close the account, as the portal does for students and staff |
| `GET /students/{id}/home` | parent, student | Today's attendance, fees due, open homework, next events, latest notice |
| `GET /students/{id}/attendance?month=` | parent, student | Days of a BS month, with totals and reader times |
| `GET /students/{id}/fees` | parent, student | Due now, by fee title |
| `GET /students/{id}/fees/history` | parent, student | Bills and payments, newest first |
| `GET /students/{id}/receipts/{receipt}` | parent, student | One receipt |
| `GET /students/{id}/homework?state=open\|past` | parent, student | Homework with this student's hand-in |
| `POST /students/{id}/homework/{hw}/hand-in` | parent, student | Hand in files (multipart; refused after the due date) |
| `GET /students/{id}/results` · `…/results/{exam}` | parent, student | Published exams; one exam's marks |
| `GET /students/{id}/timetable` | parent, student | The class's periods with subjects and teachers |
| `GET /notices` · `GET /calendar?from=&to=` | signed in | The school's notices and events |
| `GET /staff/today` | staff | Today's periods, attendance still to take, own check-in |
| `GET /staff/classes` | staff | The classes in the staff member's timetable |
| `GET /staff/classes/{id}/attendance?date=` | staff 1503/1504 | Roster with each student's mark for that day |
| `PUT /staff/classes/{id}/attendance?date=` | staff 1501 (new) / 1502 (change) | Save the day's marks; can be sent later from the offline queue |
| `GET /staff/homework` · `POST /staff/homework` | staff | Homework set by me; set new homework with files |
| `GET /staff/homework/{id}/hand-ins` · `PATCH …/hand-ins/{hid}` | staff | Hand-ins; mark one checked, with remarks |
| `GET /staff/me/attendance?month=` | staff | Own attendance |
| `POST /notices` | staff 1651, admin | Publish a notice |
| `GET /admin/dashboard?date=` | admin | Students present, staff present, fees collected today and this month, dues |
| `GET /admin/students?q=&class=` · `GET /admin/students/{id}` | admin | Search; a student with guardians, dues and attendance |
| `GET /admin/fees/dues?class=` · `GET /admin/fees/collections?from=&to=` | admin | Dues by class; money received |
| `GET /admin/staff` · `GET /admin/staff/attendance?date=` | admin | Staff, and who is in today |
| `GET /admin/guardian-links?state=2` · `POST …/{id}/decide` | admin | Review shared numbers: confirm or reject |
| `POST /admin/guardians/{id}/family-code` | admin, staff 102 | Make a family code (shown once). Staff who may update student records (102) can also search students and open one; they see dues only with 103 |

The admin's dashboard and student data reuse the portal's existing queries.
None of its business rules are written twice.

## 6. App

- Expo SDK 58, TypeScript, Expo Router. Route groups: `(welcome)` for the
  school code, role choice and sign-ins, then `(parent)`, `(student)`,
  `(staff)` and `(admin)`. A guard sends each session to its own group only.
- **Several accounts on one phone:** a parent who is also a teacher switches
  between them without signing out.
- **Offline:** the last answers are kept on the phone and shown with "Updated
  10:42". Attendance marks taken offline wait in a queue and go when the
  phone is back online.
- **Updates:** fixes ship over the air (EAS Update). The 426 answer forces a
  store update when one is needed.

| Role | Screens |
|---|---|
| Parent | Child switcher · Home · Attendance · Fees and receipts · Homework (hand in) · Results · Notices · Calendar · Child profile · Settings |
| Student | Home · Timetable · Attendance · Homework (hand in) · Results · Fees · Notices · Calendar · Profile · Settings |
| Staff | Today · My classes → take attendance · Homework (set, check hand-ins) · Notices (with permission) · My attendance · Settings |
| School admin | Dashboard · Students → student · Fees (dues, collections) · Staff (who is in) · Parents (review links, family codes) · Notices · Settings |

Settings has the app lock, the phones signed in, sign out, sign out
everywhere, and close account.

## 7. Look

One palette for the whole app, the same at every school: **Himalayan blue
and marigold**. A school is recognised by its name and logo, not by
recolouring the app.

| Role | Colour | Where |
|---|---|---|
| Page | `#F5F7FC` | About 60%: the ground under every screen |
| Card | `#FFFFFF`, edge `#E2E7F2` | Cards and lists |
| Text | `#0F1733`; secondary `#374163`; quiet `#5C6585` | |
| Header | `#142B6F`, a deep navy | The coloured top of each screen |
| Blue | `#1F44C2`; as text `#1A3699`; tint `#E8EDFF` | About 30%: buttons, the current tab, links |
| Marigold | `#F5A524`; as text `#8F5600`; tint `#FFF1D6` | About 10%: on the header (the date, the child's initials, the school mark), fees owed, the offline note |
| Present, paid | `#12805C` on `#E1F5EC` | |
| Absent | `#C8372D` on `#FDE9E6` | |

Why these colours:
- Blue reads as trust and calm, which suits a school holding children's
  records and money, and it helps students focus.
- Marigold is warm and optimistic, and it is the sayapatri of Tihar.
- Blue and orange are complementary, so the highlights stand out. The pair
  stays distinct for colour-blind users, where red and green would not.

Type is Plus Jakarta Sans. Cards have 18 px corners and controls 14 px. The
header is a navy panel with rounded lower corners. The tab bar is white,
with a soft blue pill behind the current tab. Dark mode uses the same hues
and is defined with the app foundation.

Rules every look keeps:

- **No decorative dots.** No dot next to the name, before labels, or under
  the current tab. A count badge appears only when there is a real count to
  show.
- **Colour has one meaning each.**
  - Green: present, paid, done.
  - Orange-red: absent or overdue, and it is never the brand colour, so a
    warning never looks like a button.
  - Amber: due soon, or offline.
  - The brand colour: actions and the current tab, nothing else.
- **Fees owed** are shown in the warm accent, not in red, so a parent reads
  "to pay" rather than "trouble".
- **Text contrast** is at least 4.5:1, including small grey labels.
- **Icons:** one outline set at 2 px, with a soft fill of the same colour on
  the main shape, set in a tinted tile. The current tab's icon fills in. No
  emoji.

## 8. How it is checked

- **Backend tests for every endpoint:**
  - Refuses no token, an expired token, and a revoked session.
  - Refuses another school's session.
  - Refuses another family's child (parent) and another student's record (student).
  - Refuses a staff token without the permission.
- **Token tests:** refresh rotation, reuse ending the session, the 5-phone
  limit, and the email-code limits.
- **Database tests:** each `CHECK`, unique index and the same-school trigger
  refuses bad rows.
- **Backfill:** the report is run on a copy of the real data before
  `--apply` runs anywhere.
- **App:** typecheck, lint and Expo's own checks pass. Every screen is driven
  in a browser at phone size against the demo school, in light and dark. You
  try each phase on real phones before the next one starts.
- **Releases:** commits go to `main` only with the suite green.

## 9. Phases

| Phase | Delivers | Done when |
|---|---|---|
| 1. Backend foundation | The tables, the school code, the four sign-ins, tokens, email and family codes, `link_guardians` and the sync signal, `/me`, sessions | The tests above pass; the backfill report is read on a copy of the data |
| 2. App foundation | The chosen look; school code, role choice and sign-ins for all four roles; app lock; account switching; offline cache | All four demo users sign in on a phone |
| 3. Parents and students | Their endpoints and screens, homework hand-in included | Every screen works on a phone with demo data |
| 4. Staff | Today, classes, attendance with the offline queue, homework, notices | A teacher takes a class's attendance offline and it syncs |
| 5. School admin | Dashboard, students, fees, staff, parents, notices | An admin confirms a shared number and issues a family code |
| 6. Notifications and stores | Push (gate tap-in, absence, fees due, notices, homework), store listings and builds | Needs your Firebase, Play Console and Apple accounts |

## 10. Decisions

Made on 2026-11-05:

- Parents sign in with a code sent to their email.
- Students, staff and admins sign in with their username and password.
- One palette for every school: Himalayan blue and marigold (section 7).
- No decorative dots.

Still open:

1. An email account for sending codes in production.
2. App lock required for staff and admins: built as required. Say if it
   should be optional instead.

