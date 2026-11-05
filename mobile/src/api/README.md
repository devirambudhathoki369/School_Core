# The mobile API's types

`schema.d.ts` is generated; don't edit it by hand. It comes from the server's
OpenAPI 3 schema (`/api/mobile/v1/schema`, built by `backend/mobileapi/schema.py`).
`types.ts` gives its shapes the names the screens use.

After changing an endpoint on the server:

```sh
# 1. write the schema (from backend/, with its virtual environment)
python manage.py mobile_schema ../mobile/src/api/openapi.json

# 2. generate the types (from mobile/)
npm run api-types
```

Then `npm run typecheck` shows every screen the change touches. Commit
`openapi.json` and `schema.d.ts` with the server change.
