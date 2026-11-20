-- Test de la purge des comptes inactifs (2 ans). Tout est annulé : le résultat sort dans l'erreur.
-- Lancer avec l'outil SQL de Supabase (projet facettes). Attendu :
-- RESULTAT: supprimes=2 a=0 b=1 c=0 d=1 e=1 f=1 progression_a=0
-- « Inactif » = ni connexion, ni synchro (progression.maj), ni session rafraîchie depuis 2 ans :
-- l'appli garde la session ouverte, donc last_sign_in_at seul ne bouge plus après le premier code.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  d uuid := gen_random_uuid(); e uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  n int; ra int; rb int; rc int; rd int; re int; rf int; pa int;
begin
  insert into auth.users (id, email, aud, role, created_at, last_sign_in_at) values
    (a, 'purge-a@facettes.test', 'authenticated', 'authenticated', now() - interval '4 years', now() - interval '3 years'),
    (b, 'purge-b@facettes.test', 'authenticated', 'authenticated', now() - interval '4 years', now() - interval '1 year'),
    (c, 'purge-c@facettes.test', 'authenticated', 'authenticated', now() - interval '3 years', null),
    (d, 'purge-d@facettes.test', 'authenticated', 'authenticated', now() - interval '1 day', null),
    -- e : code saisi il y a 3 ans, mais l'appli synchronise encore hier
    (e, 'purge-e@facettes.test', 'authenticated', 'authenticated', now() - interval '4 years', now() - interval '3 years'),
    -- f : code saisi il y a 3 ans, session rafraîchie hier (pas de synchro)
    (f, 'purge-f@facettes.test', 'authenticated', 'authenticated', now() - interval '4 years', now() - interval '3 years');
  insert into public.progression (user_id, maj) values (a, now() - interval '3 years'), (e, now() - interval '1 day');
  insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at)
    values (gen_random_uuid(), f, now() - interval '3 years', now() - interval '1 day', (now() - interval '1 day')::timestamp);

  n := private.purger_comptes_inactifs();

  select count(*) into ra from auth.users where id = a;
  select count(*) into rb from auth.users where id = b;
  select count(*) into rc from auth.users where id = c;
  select count(*) into rd from auth.users where id = d;
  select count(*) into re from auth.users where id = e;
  select count(*) into rf from auth.users where id = f;
  select count(*) into pa from public.progression where user_id = a;
  raise exception 'RESULTAT: supprimes=% a=% b=% c=% d=% e=% f=% progression_a=%', n, ra, rb, rc, rd, re, rf, pa;
end $$;
