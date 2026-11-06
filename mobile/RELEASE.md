# SchoolCore app: release

Everything the code can do is done. What is left needs your accounts or a
decision of yours. Do the steps in this order.

**The app is for students.** It is one app, on one store listing, that the
students of every school install and open with their school's code. It is
not the school's app, and there is no build per school as the old app had
(`com.centit.<school>.app`). Parents use it to follow their children. Staff
and the school office use it to serve their students.

## 1. Decide

1. **The package name** of the one app, for example
   `com.centit.schoolcore.app`. Set it in `app.json` as `android.package` and
   `ios.bundleIdentifier`. It cannot change after the first upload.
2. **The email account** that sends parents their sign-in codes (step 3).

## 2. Accounts (once)

```sh
cd mobile
npx eas-cli@latest login            # your Expo account
npx eas-cli@latest init             # adds the project id to app.json
npx eas-cli@latest update:configure # over-the-air fixes (SPEC §6)
npx eas-cli@latest credentials      # Android: upload the Firebase FCM V1 service-account key
                                    # iOS: let EAS make the push key and certificates
```

Push notifications go through Expo's push service, which needs the Firebase
key for Android and the Apple push key for iPhone. Both are kept by EAS. If
you turn on "enhanced push security" at expo.dev, put its access token in
the server's `EXPO_ACCESS_TOKEN`.

## 3. Server

1. **Back up the database**, then deploy this repo's code.
2. **Reconcile the migration history, then migrate.** Production's history
   differs from this repo's at `main` 0105. Production recorded
   `0105_schooladmin_uses_canteen` (a `uses_canteen` column) with canteen
   0001 to 0004 after it. This repo has `0105_school_module` (the module
   grants) there instead. A plain `migrate` stops with
   `InconsistentMigrationHistory`. Rehearsed on a copy of the real data on
   6 November 2026, this works:

   ```sql
   BEGIN;
   DELETE FROM django_migrations WHERE app = 'main' AND name = '0105_schooladmin_uses_canteen';
   DELETE FROM django_migrations WHERE app = 'canteen' AND name IN
     ('0001_initial', '0002_use_types_and_canteen_billing', '0003_account_last_reminded', '0004_canteen_users');
   COMMIT;
   ```

   ```sh
   python manage.py migrate main 0105_school_module   # the module tables and grants
   ```

   ```sql
   -- each school's canteen switch becomes its canteen grant; the old column gets a default
   BEGIN;
   INSERT INTO main_module (code, name) VALUES ('canteen', 'Canteen') ON CONFLICT DO NOTHING;
   INSERT INTO main_schoolmodule (created_at, updated_at, is_active, module_id, school_id)
     SELECT current_date, now(), true, 'canteen', id FROM main_schooladmin WHERE uses_canteen
     ON CONFLICT DO NOTHING;
   ALTER TABLE main_schooladmin ALTER COLUMN uses_canteen SET DEFAULT false;
   COMMIT;
   ```

   ```sh
   python manage.py migrate canteen 0004_canteen_users --fake   # the tables exist and match
   python manage.py migrate                                     # the rest, to mobileapi 0002
   ```

   On the copy the canteen tables matched this repo's column for column, and
   the final `migrate` took about two minutes. Where old data holds
   duplicates, the migrations skip the unique rule. Where old rows cross
   schools, they add the school-ownership keys unvalidated. They print each
   one; that is expected. Drop `uses_canteen` in a later release, once
   rolling back past this one is no longer needed.
3. Settings, in the server's environment:

   | Name | What |
   |---|---|
   | `MOBILE_TOKEN_KEY` | A long random secret that signs the app's tokens. Changing it signs every phone out. |
   | `MOBILE_MIN_APP_VERSION` | Phones below it are asked to update (426). Leave `0.0.0` at first. |
   | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | The account that sends sign-in codes. Without `EMAIL_HOST` the codes only go to the server's log. |
   | `EXPO_ACCESS_TOKEN` | Only with enhanced push security (step 2). |

   Check the email with `python manage.py sendtestemail you@example.com`.
4. For each school that will use the app: give it an `app_code` and turn on
   `uses_mobile_app`. Then link its parents. Read the report first and apply
   only after it looks right:

   ```sh
   python manage.py link_guardians --school <id>          # report only
   python manage.py link_guardians --school <id> --apply
   ```

   Shared phone numbers are not linked on their own. The school decides them
   in the app (Account → Parents to review), a whole number at a time.
   Surnames written differently ("K.C." and "KC") count as one family.
   Expect very few parents to have an email on record, so most parents get
   in with a family code from the school the first time.

## 4. Builds

```sh
npx eas-cli@latest build --profile preview --platform android   # an APK to try on phones
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --profile production --platform android
```

`preview` and `production` talk to `https://backend.nirsabi.com`, as set in
`eas.json`. A development build (`--profile development`) is needed to try
push notifications, because Expo Go cannot receive them.

## 5. Store listing

- **Name:** SchoolCore
- **Short description (80):** Your homework, results, attendance and fees, in one app for students.
- **Full description:**

  > SchoolCore is the app for students.
  >
  > See today's homework and hand it in with a photo of your work. Check your
  > results with every subject's marks and grade, your attendance for the
  > month, your timetable, your fees, and your school's notices and calendar.
  > Sign in with your school's code and the username your school gives you.
  >
  > Parents follow their children in the same app: attendance, fees and
  > receipts, homework, results and notices for each child. They sign in with
  > the school's code and their email, with no password to remember.
  >
  > Teachers and the school office sign in too, to take attendance (even with
  > no signal), set homework and check it, and publish notices.
  >
  > Your school must use SchoolCore. Ask the school office for its code.

- **Category:** Education
- **Contact email:** the one in the privacy policy
- **Privacy policy:** `https://nirsabi.com/privacy_policy` (updated for this
  app on 6 November 2026)
- **Account deletion:** in the app under Account → Close my account. For the
  web form Play also asks for, link the privacy policy's section 11 ("How
  can you review, update, or delete the data we collect from you?").
- **Screenshots** (phone, 1080×2400), students first: a student's home,
  homework with a hand-in, a result, the attendance calendar, then a
  parent's view of a child, and a teacher taking attendance.

### Data safety answers

| Data | Collected | Why | Shared |
|---|---|---|---|
| Name, email (parents), phone number (from the school) | Yes | Account, app functionality | No |
| Student records: attendance, fees, results, homework | Yes | App functionality | No |
| Photos (homework hand-ins) | Yes, when the user chooses | App functionality | No |
| Device ID (push token), device model, app version | Yes | Notifications; the phones list | No |
| Location, contacts, ads ID | No | | |

All data is encrypted in transit (HTTPS). Users can close their account in
the app. The app lock's PIN and fingerprint or face unlock stay on the phone.
