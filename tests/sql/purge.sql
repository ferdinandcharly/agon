-- Test de la purge des comptes inactifs (2 ans). Tout est annulé : le résultat sort dans l'erreur.
-- Lancer avec l'outil SQL de Supabase (projet facettes). Attendu :
-- RESULTAT: supprimes=2 a=0 b=1 c=0 d=1 progression_a=0
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  n int; ra int; rb int; rc int; rd int; pa int;
begin
  insert into auth.users (id, email, aud, role, created_at, last_sign_in_at) values
    (a, 'purge-a@facettes.test', 'authenticated', 'authenticated', now() - interval '4 years', now() - interval '3 years'),
    (b, 'purge-b@facettes.test', 'authenticated', 'authenticated', now() - interval '4 years', now() - interval '1 year'),
    (c, 'purge-c@facettes.test', 'authenticated', 'authenticated', now() - interval '3 years', null),
    (d, 'purge-d@facettes.test', 'authenticated', 'authenticated', now() - interval '1 day', null);
  insert into public.progression (user_id) values (a);

  n := private.purger_comptes_inactifs();

  select count(*) into ra from auth.users where id = a;
  select count(*) into rb from auth.users where id = b;
  select count(*) into rc from auth.users where id = c;
  select count(*) into rd from auth.users where id = d;
  select count(*) into pa from public.progression where user_id = a;
  raise exception 'RESULTAT: supprimes=% a=% b=% c=% d=% progression_a=%', n, ra, rb, rc, rd, pa;
end $$;
