-- Drops schemas and login roles created by create-addon-schemas.sql.
--
-- Variables expected from db/delete-addon-schemas.sh:
--   addon_names_csv  Comma-separated addon names to remove.
--
-- This script is intentionally destructive and should only be run manually when
-- the user wants to remove addon database state from Supabase.

\set ON_ERROR_STOP on

\if :{?addon_names_csv}
\else
\echo 'addon_names_csv is required'
\quit 1
\endif

begin;

do $$
declare
  addon_names text[] := regexp_split_to_array(:'addon_names_csv', '\s*,\s*');
  addon text;
  clean_name text;
  schema_name text;
  role_name text;
begin
  foreach addon in array addon_names loop
    clean_name := lower(regexp_replace(addon, '[^a-zA-Z0-9_]', '_', 'g'));
    if clean_name ~ '^[0-9]' then
      clean_name := 'addon_' || clean_name;
    end if;

    schema_name := clean_name;
    role_name := clean_name || '_user';

    execute format('drop schema if exists %I cascade', schema_name);

    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('alter role %I in database %I reset all', role_name, current_database());
      execute format('revoke connect on database %I from %I', current_database(), role_name);
      execute format('revoke all on schema public from %I', role_name);
      execute format('revoke all on all tables in schema public from %I', role_name);
      execute format('revoke all on all sequences in schema public from %I', role_name);
      execute format('revoke all on all functions in schema public from %I', role_name);
      execute format('drop role %I', role_name);
    end if;
  end loop;
end $$;

commit;
