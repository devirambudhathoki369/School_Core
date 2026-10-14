## Name: CentEducation [By: Cent It Solutions]

### Description:
> Schools management system which handles most of the schools manual tasks like enrollment, billing, discounts, transportations, results, accounting, library, sms, notifications, etc.

---

* Technology stack
    * Frontend: Next.js
        - UI: ReactJs, Material Tailwind, Tailwind css
        - States: React Context
        - Form validation: yup
        - Requests: Axios
        - Monitoring: sentry
        - Deployed on: vercel
    
    * Backend: Django (Django Rest Framework or DRF)
        * API: 
            - Implementation: djangorestframework
            - Cors: django-cors-headers
            - Documentation: drf-yasg 
            - Nepali Date: nepali-datetime - See `docs/nepali-date and customs/NepaliDateField.py`
            - Caching: django-redis
            - Images: pillow, django-cleanup
            - Production server: gunicorn
            - App notification: google-auth and requests
            - Monitoring: sentry-sdk
        * Database:
            - Postgre SQL (Django ORM + psycopg2)

---

* Server:
    - Provider: prabhuhost.com (portal.prabhuhost.com)
    - project path: /root/home/centit/projects/smsys.backend
    - names used: backend.nirsabi.com, smsys.backend

--- 

* How to go through codebase?
1. backend/urls.py \
2. \<app-name\>/urls/*.py


---

* Modules:
    - account
    - main
    - accounting
    - library
    - rfid

    > See `MAP.md`

