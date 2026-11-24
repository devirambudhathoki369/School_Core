# Rate limits, lock-outs and security headers

Every API view has a rate limit. A test (`account/test_rate_limits.py`)
walks every route and fails when an API view has none, so a view added later
cannot be left without one. A limit that is reached answers `429` with
`Retry-After`; the mobile API's answer is `{"error": {"code": "rate_limited"}}`.

The counts live in the cache, which is Redis in production (`REDIS_URL`), so
every worker shares them. The caller's address is the one DRF finds with
`NUM_PROXIES` (Cloudflare and nginx in front: 2). See the comment by
`REST_FRAMEWORK` in `backend/settings.py` before changing the proxy chain.

## Portal API (`/auth/`, `/api/`, `/accounting/`, …)

| What | Limit | Counted by |
|---|---|---|
| Any view with no limit of its own (the default) | 300 a minute while nobody is signed in; 600 a minute when signed in | address; account |
| Every signed-in portal view (`SecuredAPIView`) | 600 a minute | account |
| Sign-in (every role), OTP send and verify | 120 a minute | address |
| Student sign-up | 10 an hour | address |
| Wrong passwords | 10, then the username is locked for 15 minutes | username |
| OTP SMS | 1 a minute | student |
| Public school profile | 120 an hour (`PUBLIC_PROFILE_RATE`) | address |
| Contact search | 60 an hour (`CONTACT_SEARCH_RATE`) | address |

## Django admin (`/admin/login/`)

Django's own admin sign-in counted nothing. `account/admin_login.py` puts the
portal's guard in front of it: 10 wrong passwords lock a username for 15
minutes, and 30 wrong ones lock an address, whatever usernames it tries. Its
counts are kept apart from the portal's, so failing there cannot lock a
school user out of the portal.

## Card readers

- `/rfid/scan` (UHF controllers): an address that sends 30 unknown readers or
  wrong keys in 10 minutes is refused (429) for the rest of the 10 minutes.
  Only failures count, so a busy gate is never slowed. The key is compared in
  constant time.
- `/iclock/*` (ZKTeco terminals) are plain Django views without a limit: many
  terminals of a school share one address and push in bursts, and a limit
  there would drop attendance. Their protection is the per-device push key
  (`ICLOCK_REQUIRE_PUSH_KEY`, see `docs/ZKTECO_AC_PUSH.md`). For a hard cap
  on floods, use nginx `limit_req` in front.

## Mobile API (`/api/mobile/v1/`)

| What | Limit | Counted by |
|---|---|---|
| Any signed-in request | 600 a minute | phone (session) |
| Any write (POST, PUT, PATCH, DELETE) | 120 a minute | phone |
| Homework messages | 10 a minute per phone, and 30 a day per side of a thread | phone; thread |
| School code lookup | 60 a minute | address |
| Password sign-in | 30 a minute, plus the portal's lock-out per username | address |
| Email code request | 30 an hour per address; 1 a minute and 5 an hour per email | address; email |
| Code entry | 30 a minute; 5 tries per code | address; code |
| Family code entry | 10 an hour | address |
| Token refresh | 60 a minute | address |
| Student inviting a parent | 10 a day | student |
| Change password | the portal's lock-out after wrong current passwords | account |

## Security headers

Added to every answer by `account/auth/middleware.py`:

- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`
- `X-Content-Type-Options: nosniff`
- on JSON answers, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
- on the API paths, `Cache-Control: no-store, private` (the mobile API's own
  answers are `no-store` too)

Django's `SecurityMiddleware` adds `Referrer-Policy`, `X-Frame-Options: DENY`
and `Cross-Origin-Opener-Policy` in production. HSTS is left to a deliberate
decision (see `backend/settings.py`).

## Bad input

A view that fails on what it was sent (a word where an id belongs, a key left
out, a date that does not exist) answers `400`, not `500`
(`main/views/errors.py`); a write the database refuses answers `409`. Two
checks sit in front of every view:

- A NUL character in the address or the query string is refused with `400`
  for every route (`account/auth/middleware.py`): PostgreSQL can neither
  store nor compare one. Card terminals' text has it removed before it is
  stored.
- Every write to the mobile API must be one object (JSON, or a form with
  files); a list, a string or a number is `400 invalid`.

On 2026-11-24 every route was sent malformed input on a copy of the demo
data, as a superadmin, a school admin, a student, nobody, and the four app
roles: junk and missing ids, 20-digit numbers, impossible dates, quotes and
angle brackets, 3000- and 5000-character strings, wrong types, and bodies
that are not objects. 46,572 API requests found 23 server errors in four
places, and 1,560 card-terminal requests found 11 in one more; all are
fixed, a second run found none, and each has a test (`main/test_input_validation.py`, `mobileapi/tests/test_access.py`):

| Where | Was | Now |
|---|---|---|
| `POST /api/fees` (and `/api/v2/fees`) | a fee that did not validate was a 500 | 400 with the reasons |
| `POST /api/fees/titles` | a title that did not validate was a 200 "failed" | 400 with the reasons |
| `GET /api/character_certificate` | no `school` returned nothing at all (500) | 400 |
| `POST /api/search/staffs` | `detailed` with `include_balance` failed (500) and would have sent whole staff rows | `detailed` no longer changes the answer: always the named fields |
| `POST /api/mobile/v1/staff/homework` | a body that was not an object was a 500 | 400 for every mobile write |
| `POST /iclock/registry` | a NUL in the device's report was a 500 | removed before it is stored |

No request took longer than 10 seconds.
