# School bus tracking (web)

The new GET `/api/bus-tracking` endpoint is independent of the existing
`StudentBusAlert.py`, `bus_alert_settings`, and `TRACKON_*` configuration.
It performs only GET requests to the provider's `/positions`, `/devices`, `/groups` and `/server/geocode` endpoints. It does
not send commands, edit devices, or create subscriptions.

## Which buses are a school's

Three sources; the earlier one settles any disagreement.

1. **The operator's file** (optional): `creds/bus_tracking.json` (ignored by
   Git), or the path in `BUS_TRACKING_CONFIG_FILE`:

   ```json
   {
     "api_url": "https://itsochvts.com/api",
     "username": "TRACKON_ACCOUNT_EMAIL",
     "password": "TRACKON_ACCOUNT_PASSWORD",
     "schools": {
       "SCHOOL_ID": [{"id": 123, "name": "School bus 1"}]
     }
   }
   ```

   Trackon V1 documents HTTP Basic Auth (username/password) and session
   cookies: https://docs.trackongps.com/apiV1/index.html. This integration
   supports Basic Auth directly, so it does not need to save browser cookies.
   Use a provider account authorized for the buses being tracked.

   Without file credentials, the connection uses `TRACKON_API` plus
   `TRACKON_USERNAME` / `TRACKON_PASSWORD` from the server environment. If
   neither Basic Auth field is set, it uses the legacy `TRACKON_TOKEN` as a
   Bearer token. A file containing `token` also supports this legacy method.
   Both username and password are required when either is configured; no
   fallback to another credential happens on an incomplete or rejected login.
   File credentials override environment credentials as a complete set.
   Authentication failures do not prove that a token expired.

   Keep this file private (`chmod 600`) and out of Git. Do not put actual
   credentials in commands, logs, screenshots, or browser code. After entering
   credentials, verify both provider endpoints return HTTP 200 and valid lists,
   then verify the school's tracking page. Merely adding credentials is not
   proof that live tracking works. Changing this file takes effect on the next
   poll; environment changes require reloading the service.

   The existing student bus-alert job still uses its own legacy `TRACKON_TOKEN`;
   this web configuration does not change its authentication.

   A device
   may be linked to only one school; a duplicate link fails closed.

2. **The provider's own groups.** At the provider every vehicle is filed under
   a group named for its school and ending in our school id: `Jivanpremy_25`
   is school 25, `Midwest_66` is school 66. A vehicle in such a group is that
   school's bus from the day the tracker is fitted, whether or not anyone
   follows it in the app, so **a new bus needs nothing done here**: put it in
   the school's group at the provider and it is on the school's page - within
   about twenty seconds on a page that is already open, with no reload, and at
   once on a page opened afterwards. Only the number after the last `_` is read. A vehicle in no
   group, or in a group whose name does not end in `_<school id>`, is nobody's
   under this rule.

   The groups and the device list are read together once in ten seconds,
   however many pages are open, and only while a page is open. When
   the provider cannot be read, what it said last stands (for a week), so an
   outage does not take a school's buses or their names off its list.

3. **What the app has been told**, for a bus the provider has in no school's
   group. Each bus-alert setting names the bus a student or a member of staff
   follows, so a bus followed only by the people of ONE school is that school's
   bus. A bus followed from two schools is shown to neither until it is linked
   in the file. Who follows a bus says nothing once the provider files it
   under a school.

Every school has the tracking menu and the header link. A school with no bus
under any rule is shown, in place of the map, what bus tracking does in
plain words and how to start; a newly followed bus appears within two minutes
and the page becomes the live one. The sign-in profile still carries
`uses_bus_tracking` (true when the school has a bus), but the web app no longer
hides the menu on it.

## A tracker set to the wrong time zone

A tracker whose time zone was entered wrongly stamps every fix a whole number
of quarter hours out: 5 h 45 min behind for one told that Nepal is west of
Greenwich. The provider hears from it every few seconds and its own panel
draws it live, but by its times every fix is hours old. The live page compares
the tracker's clock (`deviceTime`) with the moment the provider received the
message (`serverTime`); a difference of a whole number of quarter hours, give
or take the seconds a message takes to arrive, is taken off, so the bus reads
Moving / Idling / Stopped with its speed like any other. A clock that is right
is left exactly as it was, and so is a fix the tracker kept and sent later
(`archive`).

This is a courtesy to the live page only. **A day's history keeps the
provider's own times**, so for such a tracker the route's times, trips and
stops are out by the same amount, there and in the provider's panel alike. The
real repair is the tracker's own time-zone setting; ask the provider to correct
it. To list the trackers concerned, look for positions whose `serverTime` minus
`deviceTime` is hours rather than seconds.

Never infer ownership from a vehicle NAME ("Jivanpremy Bus 2" and "Jeevanpremi
Bus: 1002" are one school's). Names are read from the provider's `/devices`
only to label a bus ("Bus 123" when the provider will not list them).

School admins see only their own buses. Staff also need the Bus Tracking
permission (511), ticked for them on their staff profile; Bus Stations (507),
which used to open the page, no longer does - migration 0103 gave 511 to
everyone who held 507 on that day. Other roles are refused. The backend derives
the school from the authenticated account and rejects mismatched school IDs.
Credentials, raw attributes and other schools' positions are never returned.

The page asks every 5 seconds while visible. Provider reads have a 5-second
server cache and bounded timeouts, so the provider is asked at most once in
that time however many schools are watching. Invalid fixes are not plotted.
A fix older than two minutes is not drawn as live: a bus parked with the engine
off stays "Stopped" (its tracker is asleep), one that went quiet while under way
is "No signal", and a device silent for a day is "Offline". A provider outage is displayed as an
error, never as fresh data. During a provider or dashboard connection failure,
bus statuses read `Tracking unavailable` and are counted separately from
`Offline`. Last known speed and ignition are not presented as current readings.
No schema migration is required.

The position format matches Traccar: `deviceId`, `latitude`, `longitude`,
`fixTime`, `valid`, `speed` (knots), `course`, `address`, and optional attributes
`ignition`, `totalDistance` (metres), `sat` (satellites) and `rssi` (GSM signal). Confirm this contract with the provider
before enabling a school. Reference: https://www.traccar.org/api-reference/

Addresses: `/positions` names the place for very few fixes, so the spot each
bus is at is put to the provider's `/server/geocode` — the text its own panel
shows ("Chaupari, Babai-06, Belaspur, Babai, Dang, Lumbini Province, Nepal").
One answer is kept for 30 days and serves every fix in the same square of about
55 metres, so a bus on its usual road costs the geocoder nothing. A geocoder
that fails is rested for a minute; the card shows the address the fix arrived
with, or the coordinates, and the positions are never held back for it.

A Google Maps key does not authenticate requests to the GPS provider. Keep
provider access tokens server-side; never put them in a NEXT_PUBLIC variable.

## Where a bus has been

`GET /api/bus-tracking/history?bus=<id>&from=<ISO time>&to=<ISO time>` answers
for ONE bus of the signed-in school, over one day at most. The same account
checks as the live endpoint apply first; a bus that is not the school's is a
403, and a range with no timezone, backwards, longer than 24 hours or wholly in
the future is a 400. A range ending later than now is read only up to now.

It reads the provider's `/positions?deviceId&from&to` for the route and
`/reports/summary`, `/reports/trips` and `/reports/stops` for the figures, all
GET. Nothing is stored: the route is read fresh for every search and never
cached (a day of fixes is megabytes), the three small reports are kept for a
minute. A report that fails costs only that report - the route is still
returned, with a warning - while a route that cannot be read is a 503.

Each point is judged at the time it was recorded. The line is broken
(`gap_before`) where the device was silent for more than five minutes, and
invalid fixes are counted (`discarded_points`), not drawn. A trip or stop that
crosses the edge of the period is clipped to it and marked `partial`. The
provider's average speed is 0 for a bus that plainly moved, so when it is, the
average is the distance over the time under way.

Verification:

```sh
python manage.py test main.test_bus_tracking
```

Frontend checks: `node src/tests/bus-tracking.cjs` and `npm run build`.
The map uses Leaflet with Google's map tiles - the satellite picture with
roads and places written on it, or the road map - read the way the GPS
provider's own panel reads them, without a Google Maps key. That is not one of
Google's documented services and may be withdrawn: when Google refuses the
page's first squares the map draws attributed Esri imagery instead, by itself.
Bus ownership and GPS access must be configured before considering the live
tracking feature enabled.
