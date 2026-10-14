# Attendance API (CentIT)

Notes for wiring up the mobile app so a logged-in staff member or student can see
their own attendance. There's really one endpoint you care about; the rest is
just logging in to get a token.

Base URL is `https://backend.nirsabi.com`. That's the backend — `nirsabi.com` on
its own is the website and will 404 any `/api/...` call, so make sure you're
hitting the `backend.` host.

All dates in and out are **Bikram Sambat** (`YYYY-MM-DD`), not Gregorian. The
login response hands you today's BS date so you don't have to compute it.

## Logging in

Token based. Pick the endpoint for whoever's signing in:

- staff: `POST /auth/staff/signin`
- student: `POST /auth/student/signin`

Body is just the credentials:

```json
{ "username": "...", "password": "..." }
```

and you get back something like:

```json
{
  "message": "Login successful!",
  "user": {
    "username": "...",
    "role": "staff",
    "today": "2082-02-16",
    "token": "f3a9c1e84b7d42a0b6e5c2179d8043ef..."
  }
}
```

Keep `user.token`. Every request after this needs it in the `Authorization`
header, and the scheme word is `IGNITE` (not `Bearer`):

```
Authorization: IGNITE <token>
```

Tokens can rotate, so if calls suddenly start coming back 401, just log in again
and use the new one.

## Getting the attendance

```
POST /api/attendance/me
```

One endpoint, same for staff and students. It returns the attendance of whoever's
token you send — you don't pass a school id, student id, anything. It works that
out from the token.

Send a date range:

```json
{ "start_date": "2082-01-01", "end_date": "2082-02-16" }
```

Response:

```json
{
  "role": "staff",
  "data": [
    {
      "date": "2082-02-14",
      "status": true,
      "checked_in_at": "2026-06-02T01:12:40Z",
      "checked_out_at": "2026-06-02T10:25:00Z"
    },
    {
      "date": "2082-02-15",
      "status": true,
      "checked_in_at": "2026-06-02T01:05:11Z",
      "checked_out_at": null
    },
    {
      "date": "2082-02-16",
      "status": false,
      "checked_in_at": null,
      "checked_out_at": null
    }
  ]
}
```

`data` is one entry per day that actually has a record — days with nothing get
left out, so don't assume every date in your range comes back.

For each entry:

- `status` is the present/absent boolean (`true` = present). That's the
  date → present/absent you're after.
- `checked_in_at` and `checked_out_at` are the first and last punch of the day.
  They're **UTC** — note the trailing `Z` — so convert to Asia/Kathmandu (+5:45)
  before you show them, otherwise the times will look ~6 hours off.
- Either time can be `null`: absent days have neither, and a present day shows a
  `null` check-out until/unless there's a qualifying out punch.

On check-out specifically: it only fills in if the school has check-out enabled,
and only once the person's last punch is at least an hour after the first one.
That's deliberate — without it, someone tapping twice on the way in would look
like they'd already left.

## Errors you'll hit

- `400 {"message": "Invalid request!"}` — missing `start_date` or `end_date`.
- `401` — token missing/wrong/expired. Check the header is exactly
  `IGNITE <token>` with a single space. If it expired, log in again.
- `404 {"message": "Not Found!"}` — the token's account has no staff/student
  record attached. (On the login call, a 404 instead means the username doesn't
  exist.)
- `405` — you sent a GET; it has to be POST.

## Quick test with curl

```bash
TOKEN=$(curl -s -X POST https://backend.nirsabi.com/auth/staff/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"USERNAME","password":"PASSWORD"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['token'])")

curl -s -X POST https://backend.nirsabi.com/api/attendance/me \
  -H "Authorization: IGNITE $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2082-01-01","end_date":"2082-02-16"}'
```

In Postman it's the same thing: POST, the `IGNITE <token>` header, and the JSON
body under Body → raw → JSON.

## CORS

Native Android/iOS apps don't have to care about this. If you're calling from a
browser or PWA, your origin needs to be in the backend's `CORS_ALLOWED_ORIGINS` —
ask whoever runs the backend to add it.
