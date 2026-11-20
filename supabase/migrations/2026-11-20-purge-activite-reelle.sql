-- Migration « purge_activite_reelle » (20/11/2026), après relecture : last_sign_in_at ne bouge qu'à la saisie
-- d'un code, or l'appli garde la session ouverte. L'activité réelle = la plus récente de : création, connexion,
-- dernière synchro (progression.maj), dernier rafraîchissement de session. greatest() ignore les valeurs nulles.
create or replace function private.purger_comptes_inactifs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from auth.users u
  where greatest(
          u.created_at,
          u.last_sign_in_at,
          (select p.maj from public.progression p where p.user_id = u.id),
          (select max(greatest(s.updated_at, s.refreshed_at::timestamptz)) from auth.sessions s where s.user_id = u.id)
        ) < now() - interval '2 years';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function private.purger_comptes_inactifs() from public, anon, authenticated;
