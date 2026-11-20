-- Purge des comptes inactifs (RGPD : conservation limitée à 2 ans sans connexion).
-- Migration « purge_inactifs » du 20/11/2026. La cascade sur auth.users efface toutes les données du compte.

create extension if not exists pg_cron;

-- Schéma interne, jamais exposé par l'API
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Un compte jamais connecté (code jamais saisi) compte à partir de sa création
create function private.purger_comptes_inactifs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from auth.users
  where coalesce(last_sign_in_at, created_at) < now() - interval '2 years';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function private.purger_comptes_inactifs() from public, anon, authenticated;

-- Chaque lundi à 03:00 UTC
select cron.schedule('purge-comptes-inactifs', '0 3 * * 1', 'select private.purger_comptes_inactifs()');
