# SchoolCore app: release

Everything the code can do is done. What is left needs your accounts or a
decision of yours. Do the steps in this order.

## 1. Decide

1. **One app or one per school.** The old app shipped one Play build per school
   (`com.centit.<school>.app`, see the superadmin's app listings). The new app
   is one app for every school: the school code picks the school. One listing
   is simpler to keep. Choose its package name, for example
   `com.centit.schoolcore.app`, and set it in `app.json` as
   `android.package` and `ios.bundleIdentifier`. It cannot change after the
   first upload.
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

1. Deploy, then `python manage.py migrate` (`main/0117`, `mobileapi/0001` and
   `0002`).
2. Settings, in the server's environment:

   | Name | What |
   |---|---|
   | `MOBILE_TOKEN_KEY` | A long random secret that signs the app's tokens. Changing it signs every phone out. |
   | `MOBILE_MIN_APP_VERSION` | Phones below it are asked to update (426). Leave `0.0.0` at first. |
   | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | The account that sends sign-in codes. Without `EMAIL_HOST` the codes only go to the server's log. |
   | `EXPO_ACCESS_TOKEN` | Only with enhanced push security (step 2). |

   Check the email with `python manage.py sendtestemail you@example.com`.
3. For each school that will use the app: give it an `app_code` and turn on
   `uses_mobile_app`. Then link its parents. Read the report first and apply
   only after it looks right:

   ```sh
   python manage.py link_guardians --school <id>          # report only
   python manage.py link_guardians --school <id> --apply
   ```

   Shared phone numbers are not linked on their own: the school confirms them
   in the app (Account → Parents to review).

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
- **Short description (80):** Attendance, fees, homework and results from your school, in one app.
- **Full description:**

  > SchoolCore brings your school to your phone.
  >
  > Parents see each child's attendance, fees to pay, receipts, homework,
  > results, timetable, notices and the school calendar. Sign in with the
  > school's code and your email: no password to remember.
  >
  > Students hand in homework with a photo, and check results and attendance.
  >
  > Teachers take a class's attendance in a few taps, even with no signal: it
  > is sent when the phone is back online. They set homework and check
  > hand-ins.
  >
  > School admins see the day at a glance: who is in, money received, fees
  > still to collect, and parents waiting for review.
  >
  > Your school must use SchoolCore. Ask the school office for its code.

- **Category:** Education
- **Contact email:** the one in the privacy policy
- **Privacy policy:** `https://nirsabi.com/privacy_policy` (updated for this
  app on 6 November 2026)
- **Account deletion:** in the app under Account → Close my account. For the
  web form Play also asks for, link the privacy policy's section 11 ("How
  can you review, update, or delete the data we collect from you?").
- **Screenshots** (phone, 1080×2400): a parent's home, attendance calendar,
  fees, a result, a teacher taking attendance, and the admin's day.

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
