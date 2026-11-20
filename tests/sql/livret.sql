-- Test du livret de cours : table documents et fichiers du bucket « cours » réservés à l'admin.
-- Tout est annulé ; le résultat sort dans le message d'erreur. Attendu :
-- RESULTAT: autre=0/refuse/refuse/0 admin=ok/ok/refuse/1/ok/1 anon=refuse/refuse bucket=f/20971520/6
do $$
declare
  admin uuid := gen_random_uuid(); autre uuid := gen_random_uuid(); doc uuid;
  a_lire int; a_ins text := 'ok'; a_sto text := 'ok'; a_sto_lire int;
  d_ins text := 'ok'; d_maj text := 'ok'; d_col text := 'ok'; d_lire int; d_sto text := 'ok'; d_sto_lire int;
  n_ins text := 'ok'; n_lire text := 'ok';
  b_public boolean; b_taille bigint; b_types int;
  claims_admin text; claims_autre text;
begin
  insert into auth.users (id, email, aud, role, raw_app_meta_data) values
    (admin, 'livret-admin@facettes.test', 'authenticated', 'authenticated', '{"admin": true}'),
    (autre, 'livret-autre@facettes.test', 'authenticated', 'authenticated', '{}');
  claims_admin := json_build_object('sub', admin, 'role', 'authenticated', 'app_metadata', json_build_object('admin', true))::text;
  claims_autre := json_build_object('sub', autre, 'role', 'authenticated', 'app_metadata', json_build_object())::text;
  set local role authenticated;

  -- L'admin ajoute un document, le fichier, met à jour statut/lot, ne peut pas toucher aux autres colonnes
  perform set_config('request.jwt.claims', claims_admin, true);
  begin insert into public.documents (matiere, nom, chemin, type, taille) values ('reseau', 'TD 2.pdf', 'reseau/x-TD-2.pdf', 'application/pdf', 1000)
    returning id into doc; exception when others then d_ins := 'refuse'; end;
  begin update public.documents set statut = 'traite', lot = 'lot-test.json' where id = doc; exception when others then d_maj := 'refuse'; end;
  begin update public.documents set matiere = 'eco' where id = doc; exception when others then d_col := 'refuse'; end;
  select count(*) into d_lire from public.documents;
  begin insert into storage.objects (bucket_id, name, owner) values ('cours', 'reseau/x-TD-2.pdf', admin);
    exception when others then d_sto := 'refuse'; end;
  select count(*) into d_sto_lire from storage.objects where bucket_id = 'cours';

  -- Un autre compte ne voit rien et ne peut rien ajouter
  perform set_config('request.jwt.claims', claims_autre, true);
  select count(*) into a_lire from public.documents;
  begin insert into public.documents (matiere, nom, chemin, type, taille) values ('reseau', 'pirate.pdf', 'reseau/pirate.pdf', 'application/pdf', 1);
    exception when others then a_ins := 'refuse'; end;
  begin insert into storage.objects (bucket_id, name, owner) values ('cours', 'reseau/pirate.pdf', autre);
    exception when others then a_sto := 'refuse'; end;
  select count(*) into a_sto_lire from storage.objects where bucket_id = 'cours';

  -- Visiteur sans compte
  set local role anon;
  begin perform 1 from public.documents; exception when others then n_lire := 'refuse'; end;
  begin insert into public.documents (matiere, nom, chemin, type, taille) values ('reseau', 'x', 'y', 'z', 1);
    exception when others then n_ins := 'refuse'; end;

  reset role;
  select public, file_size_limit, coalesce(array_length(allowed_mime_types, 1), 0) into b_public, b_taille, b_types
    from storage.buckets where id = 'cours';

  raise exception 'RESULTAT: autre=%/%/%/% admin=%/%/%/%/%/% anon=%/% bucket=%/%/%',
    a_lire, a_ins, a_sto, a_sto_lire, d_ins, d_maj, d_col, d_lire, d_sto, d_sto_lire, n_lire, n_ins,
    case when b_public then 't' else 'f' end, b_taille, b_types;
end $$;
