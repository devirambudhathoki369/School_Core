# SchoolCore app

The app for students, for Android and iPhone. Students open it with their
school's code; their parents follow them in it; teachers and the school
office use it to serve them. It is built with Expo (React Native,
TypeScript, Expo Router) and has its own API on the backend,
`/api/mobile/v1/` (`../backend/mobileapi`).

- `SPEC.md`: what the app does and why, the API, the rules.
- `RELEASE.md`: what is left before the stores, and how to release.
- `src/api/README.md`: the generated API types.

## Run it on your computer

1. The backend, from `../backend` with its virtual environment, on the
   demo database:

   ```sh
   python manage.py migrate
   python manage.py runserver 0.0.0.0:8000
   ```

   The demo school's code is `DEMO01`. Its logins (student, teacher,
   demoschool) use the demo password. Parents' sign-in codes are printed in
   the backend's terminal while no email account is set.

2. The app:

   ```sh
   cp .env.example .env    # then set your computer's address
   npm install
   npx expo start
   ```

   On a phone on the same Wi-Fi, `EXPO_PUBLIC_API_URL` must be your
   computer's address (not 127.0.0.1), and that address must be in the
   backend's `ALLOWED_HOSTS`. Push notifications need a development build
   (`npx eas-cli@latest build --profile development`), because Expo Go
   cannot receive them.

## Where things are

| Folder | What |
|---|---|
| `src/app/` | The routes: `welcome/`, then one folder per role (`student/`, `parent/`, `staff/`, `admin/`), each with its tabs in `(tabs)/` |
| `src/screens/` | The screens, shared by the roles that use them |
| `src/api/` | The client (tokens, refresh, idempotency keys), the hooks, and the generated types |
| `src/accounts/` | The accounts signed in on the phone and switching between them |
| `src/lock/` | The app lock (PIN, fingerprint or face) |
| `src/offline/` | The queue that sends attendance taken with no signal |
| `src/push/` | Notifications |
| `src/ui/`, `src/theme/` | The parts every screen uses, and the colours (SPEC §7) |

## Checks

```sh
npm run typecheck
npm run lint
npx expo install --check
npx expo-doctor
```

After an API change on the server, regenerate the types (`src/api/README.md`).
