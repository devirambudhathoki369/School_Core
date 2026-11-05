# SchoolCore mobile

The SchoolCore app for students and parents, for Android and iPhone. It is
built with Expo (React Native, TypeScript) and talks to the same API as the
web portal (`../backend`). It does not need any backend change.

## What it does

- **Sign in** with the student's account, and **create an account** with the
  student ID and the phone number on the school's record (confirmed by an SMS
  code).
- **Home**: today's attendance, fees due, open homework, the latest notice and
  what's coming up.
- **Attendance**: a Nepali-calendar month view with present and absent days,
  and the card reader's in and out times.
- **Fees**: what is due and what for, every bill and payment, and each receipt.
- **Homework**, **exam results**, **notices**, the **school calendar** and the
  student's **profile**.

Dates are shown in Bikram Sambat, as the school records them. The app follows
the phone's light or dark setting.

## Run it on your phone

1. Start the backend so the phone can reach it, from `backend/`:

   ```bash
   python manage.py runserver 0.0.0.0:8000
   ```

   Name your computer's Wi-Fi address in `backend/.env`, for example
   `ALLOWED_HOSTS=192.168.1.10`. Without it, the development server answers only
   `127.0.0.1` and `localhost`, and refuses the phone.

2. Point the app at it. Copy `.env.example` to `.env` and put your computer's
   address on the same Wi-Fi in `EXPO_PUBLIC_API_URL`. `127.0.0.1` means the
   phone itself, so it will not work there.

3. Install and start:

   ```bash
   npm install
   npx expo start
   ```

4. Install **Expo Go** from the Play Store or the App Store, and scan the QR
   code that `npx expo start` prints.

## Checks

```bash
npm run typecheck
npm run lint
npx expo-doctor
```

## How it talks to the API

- The token from `POST /auth/student/signin` is kept in the phone's secure
  storage (Keychain or Keystore) and sent as `Authorization: IGNITE <token>`.
- Every request is sent with `credentials: 'omit'`. Sign-in also sets the web
  portal's cookie, and the backend reads that cookie before the header. A write
  carried by the cookie without an `Origin` header is refused as cross-site,
  and an app sends no `Origin`. Omitting credentials keeps the cookie out of
  the app.
- A `401` signs the user out and says why.
- Signing out calls `POST /auth/logout`, so the token stops working on the
  server too.

## Layout

```
src/app/            screens (Expo Router: every file is a route)
  sign-in, register, verify
  (app)/(tabs)/     Home, Attendance, Fees, Homework, More
  (app)/            results, notices, calendar, profile, receipt/[id]
src/api/            client, response types, data hooks (TanStack Query)
src/auth/           session and secure token storage
src/lib/format.ts   Bikram Sambat dates and Nepali money formatting
src/ui/             theme (the portal's Ocean colours) and shared components
```
