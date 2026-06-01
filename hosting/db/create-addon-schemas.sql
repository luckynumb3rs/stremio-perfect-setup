-- Creates one schema and one login role per selected AIO addon.
--
-- Variables expected from db/create-addon-schemas.sh:
--   base_connection_string  Full Supabase connection string with password set.
--   addon_names_csv         Comma-separated addon names.
--   shared_password         Password assigned to every generated addon role.
--
-- Output:
--   addon_name, schema_name, role_name, connection_string
--
-- Connection string generation deliberately rewrites only the username portion
-- of base_connection_string. For Supabase pooler URLs this preserves the
-- project suffix, host, port, database, and query parameters.

\set ON_ERROR_STOP on

\if :{?base_connection_string}
\else
\echo 'base_connection_string is required'
\quit 1
\endif

\if :{?addon_names_csv}
\else
\echo 'addon_names_csv is required'
\quit 1
\endif

\if :{?shared_password}
\else
\echo 'shared_password is required'
\quit 1
\endif

begin;

create temp table if not exists addon_connection_strings (
  addon_name text,
  schema_name text,
  role_name text,
  connection_string text
);

truncate table addon_connection_strings;

do $$
declare
  addon_names text[] := regexp_split_to_array(:'addon_names_csv', '\s*,\s*');
  shared_password text := :'shared_password';
  base_connection_string text := :'base_connection_string';
  parsed_user text := substring(base_connection_string from '^[^:]+://([^:]+):');
  addon text;
  clean_name text;
  schema_name text;
  role_name text;
  replacement_user text;
  addon_connection_string text;
begin
  if parsed_user is null or parsed_user = '' then
    raise exception 'Could not extract the database user from the connection string';
  end if;

  foreach addon in array addon_names loop
    clean_name := lower(regexp_replace(addon, '[^a-zA-Z0-9_]', '_', 'g'));
    if clean_name ~ '^[0-9]' then
      clean_name := 'addon_' || clean_name;
    end if;

    schema_name := clean_name;
    role_name := clean_name || '_user';

    execute format('create schema if not exists %I', schema_name);

    if not exists (select 1 from pg_roles where rolname = role_name) then
      execute format('create role %I with login password %L', role_name, shared_password);
    else
      execute format('alter role %I with password %L', role_name, shared_password);
    end if;

    execute format('grant connect on database %I to %I', current_database(), role_name);
    execute format('alter role %I in database %I set search_path = %I', role_name, current_database(), schema_name);
    execute format('grant usage, create on schema %I to %I', schema_name, role_name);
    execute format('grant select, insert, update, delete, truncate, references, trigger on all tables in schema %I to %I', schema_name, role_name);
    execute format('grant usage, select, update on all sequences in schema %I to %I', schema_name, role_name);
    execute format('grant execute on all functions in schema %I to %I', schema_name, role_name);
    execute format('alter default privileges in schema %I grant select, insert, update, delete, truncate, references, trigger on tables to %I', schema_name, role_name);
    execute format('alter default privileges in schema %I grant usage, select, update on sequences to %I', schema_name, role_name);
    execute format('alter default privileges in schema %I grant execute on functions to %I', schema_name, role_name);

    execute format('revoke all on schema public from %I', role_name);
    execute format('revoke all on all tables in schema public from %I', role_name);
    execute format('revoke all on all sequences in schema public from %I', role_name);
    execute format('revoke all on all functions in schema public from %I', role_name);

    if strpos(parsed_user, '.') > 0 then
      replacement_user := role_name || substring(parsed_user from strpos(parsed_user, '.'));
    else
      replacement_user := role_name;
    end if;

    addon_connection_string := regexp_replace(
      base_connection_string,
      '^([^:]+://)[^:/@]+(:)',
      '\1' || replacement_user || '\2'
    );

    insert into addon_connection_strings (
      addon_name,
      schema_name,
      role_name,
      connection_string
    )
    values (
      addon,
      schema_name,
      role_name,
      addon_connection_string
    );
  end loop;

  if exists (
    select 1
    from addon_connection_strings acs
    where not exists (
      select 1
      from information_schema.schemata s
      where s.schema_name = acs.schema_name
    )
  ) then
    raise exception 'Schema creation verification failed';
  end if;
end $$;

select addon_name, schema_name, role_name, connection_string
from addon_connection_strings
order by addon_name;

commit;
