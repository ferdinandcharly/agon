-- Tests des amis (table amities, notions allumées, fonctions). Tout est annulé : le résultat sort dans
-- le message d'erreur. Lancer le bloc avec l'outil SQL de Supabase.
--
-- Attendu :
-- RESULTAT: direct=refuse sanspseudo=refuse soi=refuse introuvable=refuse envoyee=envoyee doublon=refuse
--   casse=acceptee croisee=acceptee mesamis_u1=ami:30:2/envoyee:-:-/ami:-:0 recue_u4=1 inconnu_notions=cache
--   refus=0 retrait=0 classement=2 sansmax=1 anon=refuse limite20=refuse cascade=0
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  u4 uuid := gen_random_uuid(); u5 uuid := gen_random_uuid();
  jetables uuid[] := array[]::uuid[]; j uuid; k int;
  r_direct text := 'ok'; r_sans text := 'ok'; r_soi text := 'ok'; r_introuvable text := 'ok';
  r_envoyee text; r_doublon text := 'ok'; r_casse text; r_croisee text; r_mes text; r_recue int;
  r_inconnu text; r_refus int; r_retrait int; r_classement int; r_sansmax int; r_anon text := 'ok';
  r_limite text := 'ok'; r_cascade int;
begin
  insert into auth.users (id, email, aud, role) values
    (u1, 'am-1@facettes.test', 'authenticated', 'authenticated'),
    (u2, 'am-2@facettes.test', 'authenticated', 'authenticated'),
    (u3, 'am-3@facettes.test', 'authenticated', 'authenticated'),
    (u4, 'am-4@facettes.test', 'authenticated', 'authenticated'),
    (u5, 'am-5@facettes.test', 'authenticated', 'authenticated');
  insert into public.profils (user_id, pseudo, notions_allumees) values
    (u1, 'TstAma', 5), (u2, 'TstLuc', 2), (u3, 'TstZoe', 0), (u4, 'TstMax', 7);
  insert into public.parties_survie (id, user_id, score, joue_le) values
    (gen_random_uuid(), u1, 20, now() - interval '1 hour'),
    (gen_random_uuid(), u2, 30, now() - interval '2 hours'),
    (gen_random_uuid(), u4, 99, now() - interval '3 hours');
  for k in 1..21 loop
    j := gen_random_uuid(); jetables := jetables || j;
    insert into auth.users (id, email, aud, role) values (j, 'am-j' || k || '@facettes.test', 'authenticated', 'authenticated');
    insert into public.profils (user_id, pseudo) values (j, 'TstJet' || k);
  end loop;

  set local role authenticated;

  -- u1 : accès direct refusé, puis demandes
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  begin perform count(*) from public.amities; exception when others then r_direct := 'refuse'; end;
  begin perform public.demander_ami('tstama'); exception when others then r_soi := 'refuse'; end;
  begin perform public.demander_ami('TstPersonne'); exception when others then r_introuvable := 'refuse'; end;
  r_envoyee := public.demander_ami('TstLuc');
  begin perform public.demander_ami('TstLuc'); exception when others then r_doublon := 'refuse'; end;

  -- u5 sans pseudo
  perform set_config('request.jwt.claims', json_build_object('sub', u5, 'role', 'authenticated')::text, true);
  begin perform public.demander_ami('TstAma'); exception when others then r_sans := 'refuse'; end;

  -- u2 demande « ferdi » (autre casse) alors que Ferdi lui avait demandé : acceptation
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  r_casse := public.demander_ami('tstama');

  -- u3 demande Ferdi, puis Ferdi demande « ZOE » : acceptation croisée
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform public.demander_ami('TstAma');
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  r_croisee := public.demander_ami('TSTZOE');
  perform public.demander_ami('TstMax');
  select string_agg(m.relation || ':' || coalesce(m.record::text, '-') || ':' || coalesce(m.notions::text, '-'), '/' order by m.pseudo)
    into r_mes from public.mes_amis() m;

  -- u4 voit une demande reçue, sans les notions ni le record de Ferdi ; il refuse
  perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  select count(*) into r_recue from public.mes_amis() m where m.relation = 'recue';
  select case when bool_and(m.notions is null and m.record is null) then 'cache' else 'visible' end into r_inconnu
    from public.mes_amis() m where m.pseudo = 'TstAma';
  perform public.repondre_ami('TstAma', false);
  select count(*) into r_refus from public.mes_amis();

  -- Ferdi retire Zoe ; classement des amis = Ferdi + Lucas (Max, 99, n'est pas un ami)
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform public.retirer_ami('TstZoe');
  select count(*) into r_classement from public.classement_amis('record');
  select count(*) into r_sansmax from public.classement_amis('record') c where c.pseudo <> 'TstMax' and c.moi;
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  select count(*) into r_retrait from public.mes_amis();

  -- u4 : 20 demandes en attente au plus
  perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  for k in 1..20 loop perform public.demander_ami('TstJet' || k); end loop;
  begin perform public.demander_ami('TstJet21'); exception when others then r_limite := 'refuse'; end;

  -- anon : rien
  reset role;
  set local role anon;
  begin perform public.demander_ami('TstAma'); exception when others then r_anon := 'refuse'; end;

  -- Suppression d'un compte : ses relations disparaissent
  reset role;
  delete from auth.users where id = u2;
  select count(*) into r_cascade from public.amities where u2 in (demandeur, destinataire);

  raise exception 'RESULTAT: direct=% sanspseudo=% soi=% introuvable=% envoyee=% doublon=% casse=% croisee=% mesamis_u1=% recue_u4=% inconnu_notions=% refus=% retrait=% classement=% sansmax=% anon=% limite20=% cascade=%',
    r_direct, r_sans, r_soi, r_introuvable, r_envoyee, r_doublon, r_casse, r_croisee, r_mes, r_recue, r_inconnu,
    r_refus, r_retrait, r_classement, r_sansmax, r_anon, r_limite, r_cascade;
end $$;
