-- Tests du portail (colonnes du profil, avatar dans les classements et les amis). Tout est annulé : le résultat
-- sort dans le message d'erreur. Lancer le bloc avec l'outil SQL de Supabase.
--
-- Attendu :
-- RESULTAT: avatar_ko=refuse prenom_chiffre=refuse prenom_accent=ok etab_court=refuse etab_chevron=refuse
--   parcours_ko=refuse defaut=violet-facette autre_lit=0 classement_avatar=rose-etoile classement_prive=aucun
--   amis_avatar=rose-etoile amis_prive=aucun
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  r_avatar text := 'ok'; r_chiffre text := 'ok'; r_accent text := 'ok'; r_court text := 'ok'; r_chevron text := 'ok';
  r_parcours text := 'ok'; r_defaut text; r_autre int; r_cl_av text; r_cl_prive text; r_am_av text; r_am_prive text;
  signatures text;
begin
  insert into auth.users (id, email, aud, role) values
    (u1, 'po-1@facettes.test', 'authenticated', 'authenticated'),
    (u2, 'po-2@facettes.test', 'authenticated', 'authenticated');
  insert into public.profils (user_id, pseudo) values (u1, 'TstPa'), (u2, 'TstPb');
  insert into public.parties_survie (id, user_id, score, joue_le) values (gen_random_uuid(), u1, 25, now() - interval '1 hour');
  insert into public.amities (demandeur, destinataire, statut, accepte_le) values (u1, u2, 'acceptee', now());
  select avatar into r_defaut from public.profils where user_id = u1;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  begin update public.profils set avatar = 'noir-x' where user_id = u1; exception when others then r_avatar := 'refuse'; end;
  begin update public.profils set prenom = 'Zo3' where user_id = u1; exception when others then r_chiffre := 'refuse'; end;
  begin update public.profils set prenom = 'Zoé N''Golo' where user_id = u1; exception when others then r_accent := 'refuse'; end;
  begin update public.profils set etablissement = 'a' where user_id = u1; exception when others then r_court := 'refuse'; end;
  begin update public.profils set etablissement = '<b>IUT' where user_id = u1; exception when others then r_chevron := 'refuse'; end;
  begin update public.profils set parcours = 'autre' where user_id = u1; exception when others then r_parcours := 'refuse'; end;
  update public.profils set avatar = 'rose-etoile', etablissement = 'IUT de Lannion' where user_id = u1;
  select c.avatar into r_cl_av from public.classement('record') c where c.moi;

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  select count(*) into r_autre from public.profils where user_id = u1;
  select m.avatar into r_am_av from public.mes_amis() m where m.pseudo = 'TstPa';

  reset role;
  select string_agg(pg_get_function_result(p.oid), ' ') into signatures
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('classement', 'classement_amis');
  r_cl_prive := case when signatures ~ '(prenom|etablissement|parcours )' then 'fuite' else 'aucun' end;
  select pg_get_function_result(p.oid) into signatures
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'mes_amis';
  r_am_prive := case when signatures ~ '(prenom|etablissement|parcours )' then 'fuite' else 'aucun' end;

  raise exception 'RESULTAT: avatar_ko=% prenom_chiffre=% prenom_accent=% etab_court=% etab_chevron=% parcours_ko=% defaut=% autre_lit=% classement_avatar=% classement_prive=% amis_avatar=% amis_prive=%',
    r_avatar, r_chiffre, r_accent, r_court, r_chevron, r_parcours, r_defaut, r_autre, r_cl_av, r_cl_prive, r_am_av, r_am_prive;
end $$;
