# SchoolCore

- [Docker setup and file-by-file guide](docker%20setup.md)
- [User manual: academics, fees, billing, payments and year closing](USER_MANUAL.md)
- [System review and prioritized improvement roadmap](SYSTEM_IMPROVEMENTS.md)
- [Backend setup](backend/README.md)
- [Frontend setup](frontend/README.md)

The portal uses paths such as `/admin/manage/sections` and `/admin/payment/student`.
Existing hash bookmarks are converted to their matching paths. Restart a running
Next.js development server after updating the route files, then reload the browser.
