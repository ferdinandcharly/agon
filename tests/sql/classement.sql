-- Tests du classement (profils, parties de Survie, limites, fonction classement). Tout est annulé :
-- le résultat sort dans le message d'erreur. Lancer chaque bloc avec l'outil SQL de Supabase.
--
-- Bloc 1 — attendu :
-- RESULTAT: profil_autre=refuse casse=refuse format=refuse colonne=refuse/ok lecture=0/0 score=refuse
--   futur=refuse ancien=refuse rafale=refuse horsligne=3 doublon=1 semaine=12 record=40 egalite=1/2 moi=1
--   anon=refuse periode=refuse
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  p_doublon uuid := gen_random_uuid();
  debut_semaine timestamptz := date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  r_profil text := 'ok'; r_casse text := 'ok'; r_format text := 'ok'; r_col text := 'ok'; r_col2 text := 'ok';
  r_score text := 'ok'; r_futur text := 'ok'; r_ancien text := 'ok'; r_rafale text := 'ok';
  r_anon text := 'ok'; r_periode text := 'ok';
  n_prof int; n_part int; n_hors int; n_doub int; v_sem int; v_rec int; rg1 int; rg2 int; n_moi int;
begin
  insert into auth.users (id, email, aud, role) values
    (u1, 'cl-1@facettes.test', 'authenticated', 'authenticated'),
    (u2, 'cl-2@facettes.test', 'authenticated', 'authenticated'),
    (u3, 'cl-3@facettes.test', 'authenticated', 'authenticated');
  set local role authenticated;

  -- u1
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  insert into public.profils (pseudo) values ('Ferdi');
  begin insert into public.profils (user_id, pseudo) values (u2, 'Autre'); exception when others then r_profil := 'refuse'; end;
  begin update public.profils set user_id = u2 where user_id = u1; exception when others then r_col := 'refuse'; end;
  begin update public.profils set pseudo = 'Ferdi' where user_id = u1; exception when others then r_col2 := 'refuse'; end;
  insert into public.parties_survie (id, score, joue_le) values (gen_random_uuid(), 50, now() - interval '200 seconds');
  begin insert into public.parties_survie (id, score, joue_le) values (gen_random_uuid(), 30, now() - interval '198 seconds');
    exception when others then r_rafale := 'refuse'; end;
  begin insert into public.parties_survie (id, score) values (gen_random_uuid(), 301); exception when others then r_score := 'refuse'; end;
  begin insert into public.parties_survie (id, score, joue_le) values (gen_random_uuid(), 5, now() + interval '1 hour');
    exception when others then r_futur := 'refuse'; end;
  begin insert into public.parties_survie (id, score, joue_le) values (gen_random_uuid(), 5, now() - interval '31 days');
    exception when others then r_ancien := 'refuse'; end;

  -- u2 : même pseudo autrement écrit, puis trois parties jouées hors ligne envoyées d'un coup
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  begin insert into public.profils (pseudo) values ('FERDI'); exception when others then r_casse := 'refuse'; end;
  insert into public.profils (pseudo) values ('Bastien');
  select count(*) into n_prof from public.profils where user_id = u1;
  select count(*) into n_part from public.parties_survie where user_id = u1;
  insert into public.parties_survie (id, score, joue_le) values
    (p_doublon, 10, now() - interval '90 seconds'),
    (gen_random_uuid(), 50, now() - interval '60 seconds'),
    (gen_random_uuid(), 20, now() - interval '30 seconds');
  select count(*) into n_hors from public.parties_survie where user_id = u2;
  insert into public.parties_survie (id, score, joue_le) values (p_doublon, 10, now() - interval '90 seconds')
    on conflict (id) do nothing;
  select count(*) into n_doub from public.parties_survie where id = p_doublon;

  -- u3 : un 40 la semaine dernière (dimanche 23 h 30), un 12 cette semaine
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  begin insert into public.profils (pseudo) values ('a b'); exception when others then r_format := 'refuse'; end;
  insert into public.profils (pseudo) values ('Trois');
  insert into public.parties_survie (id, score, joue_le) values
    (gen_random_uuid(), 40, debut_semaine - interval '30 minutes'),
    (gen_random_uuid(), 12, now());
  select score into v_sem from public.classement('semaine') where pseudo = 'Trois';
  select score into v_rec from public.classement('record') where pseudo = 'Trois';

  -- Égalité à 50 entre u1 (plus tôt) et u2 ; appel en tant que u2
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  select rang into rg1 from public.classement('record') where pseudo = 'Ferdi';
  select rang into rg2 from public.classement('record') where pseudo = 'Bastien';
  select count(*) into n_moi from public.classement('record') where moi;
  begin perform * from public.classement('mois'); exception when others then r_periode := 'refuse'; end;

  set local role anon;
  begin perform * from public.classement('record'); exception when others then r_anon := 'refuse'; end;

  raise exception 'RESULTAT: profil_autre=% casse=% format=% colonne=%/% lecture=%/% score=% futur=% ancien=% rafale=% horsligne=% doublon=% semaine=% record=% egalite=%/% moi=% anon=% periode=%',
    r_profil, r_casse, r_format, r_col, r_col2, n_prof, n_part, r_score, r_futur, r_ancien, r_rafale,
    n_hors, n_doub, v_sem, v_rec, rg1, rg2, n_moi, r_anon, r_periode;
end $$;

-- Bloc 2 — joueur hors du top 50. Attendu : RESULTAT: lignes=51 dernier_rang=56 dernier_moi=t
do $$
declare
  dernier uuid := gen_random_uuid(); u uuid; n int; rg int; m boolean;
begin
  for i in 1..55 loop
    u := gen_random_uuid();
    insert into auth.users (id, email, aud, role) values (u, 'top-' || i || '@facettes.test', 'authenticated', 'authenticated');
    insert into public.profils (user_id, pseudo) values (u, 'joueur' || i);
    insert into public.parties_survie (id, user_id, score) values (gen_random_uuid(), u, 101 - i);
  end loop;
  insert into auth.users (id, email, aud, role) values (dernier, 'dernier@facettes.test', 'authenticated', 'authenticated');
  insert into public.profils (user_id, pseudo) values (dernier, 'dernier');
  insert into public.parties_survie (id, user_id, score) values (gen_random_uuid(), dernier, 1);

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', dernier, 'role', 'authenticated')::text, true);
  select count(*) into n from public.classement('record');
  select rang, moi into rg, m from public.classement('record') order by rang desc limit 1;
  raise exception 'RESULTAT: lignes=% dernier_rang=% dernier_moi=%', n, rg, m;
end $$;
