-- Least privilege for the database. Run once, as the postgres superuser:
--
--   psql -d <database> -v app_password=... -v migrate_password=... -f tools/database/db_roles.sql
--
-- Then in .env:
--   POSTGRES_USER=schoolcore_app            POSTGRES_PASSWORD=<app_password>
--   POSTGRES_MIGRATE_USER=schoolcore_migrate POSTGRES_MIGRATE_PASSWORD=<migrate_password>
--
-- schoolcore_app reads and writes rows and nothing else: it cannot change a table,
-- run COPY ... PROGRAM, or skip row-level security. `manage.py migrate` alone signs
-- in as schoolcore_migrate, which owns the tables. `manage.py check --deploy` warns
-- while the app still signs in as a superuser.

CREATE ROLE schoolcore_migrate LOGIN PASSWORD :'migrate_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE schoolcore_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

GRANT CREATE, USAGE ON SCHEMA public TO schoolcore_migrate;

-- Every table, view, sequence and function passes to the migration role.
DO $$
DECLARE
    item record;
BEGIN
    FOR item IN
        SELECT c.relkind, c.oid::regclass AS name FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'i')
    LOOP
        EXECUTE format(
            'ALTER %s %s OWNER TO schoolcore_migrate',
            CASE item.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,
            item.name
        );
    END LOOP;
    FOR item IN
        SELECT 'f' AS relkind, p.oid::regprocedure AS name FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO schoolcore_migrate', item.name);
    END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO schoolcore_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO schoolcore_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO schoolcore_app;

ALTER DEFAULT PRIVILEGES FOR ROLE schoolcore_migrate IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO schoolcore_app;
ALTER DEFAULT PRIVILEGES FOR ROLE schoolcore_migrate IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO schoolcore_app;
