-- Vérification de la migration « confidentialite » (spec : docs/superpowers/specs/2026-11-26-confidentialite-design.md).
-- À lancer sur le projet (éditeur SQL ou execute_sql) : tout se passe dans une transaction annulée à la fin,
-- rien ne reste en base. Chaque vérification lève « ÉCHEC : … » si elle ne tient pas.
-- A (masqué, demandes fermées), B (inconnu de A), C (ami de A).

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000c0a1', 'zz_conf_a@exemple.invalid'),
  ('00000000-0000-4000-8000-00000000c0b2', 'zz_conf_b@exemple.invalid'),
  ('00000000-0000-4000-8000-00000000c0c3', 'zz_conf_c@exemple.invalid');
insert into public.profils (user_id, pseudo) values
  ('00000000-0000-4000-8000-00000000c0a1', 'zz_conf_a'),
  ('00000000-0000-4000-8000-00000000c0b2', 'zz_conf_b'),
  ('00000000-0000-4000-8000-00000000c0c3', 'zz_conf_c');
update public.profils set visible_classement = false, demandes_amis = false
  where user_id = '00000000-0000-4000-8000-00000000c0a1';
insert into public.parties_survie (id, user_id, score) values
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000c0a1', 300),
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000c0b2', 299),
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000c0c3', 298);
insert into public.amities (demandeur, destinataire, statut, accepte_le) values
  ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-00000000c0c3', 'acceptee', now());

-- Vu par B : A absent, rangs 1..n sans trou
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0b2","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.classement('record') where pseudo = 'zz_conf_a') then
    raise exception 'ÉCHEC : A (masqué) visible dans le classement de B';
  end if;
  if exists (select 1 from (select rang, row_number() over (order by rang) as n from public.classement('record') where rang <= 50) t
             where t.rang <> t.n) then
    raise exception 'ÉCHEC : trou dans les rangs vus par B';
  end if;
  if not exists (select 1 from public.classement('record') where pseudo = 'zz_conf_b' and moi) then
    raise exception 'ÉCHEC : B ne se voit pas';
  end if;
end $$;

-- B demande A (demandes fermées) : même erreur qu'un pseudo inexistant
do $$
begin
  perform public.demander_ami('zz_conf_a');
  raise exception 'ÉCHEC : demande acceptée vers un joueur sur « Personne »';
exception when others then
  if sqlerrm <> 'pseudo introuvable' then raise; end if;
end $$;

-- Vu par A : sa ligne, avec un rang
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0a1","role":"authenticated"}', true);
do $$
begin
  if not exists (select 1 from public.classement('record') where pseudo = 'zz_conf_a' and moi and rang >= 1) then
    raise exception 'ÉCHEC : A masqué ne voit pas sa propre ligne';
  end if;
end $$;

-- Vu par C (ami de A) : A présent dans le classement entre amis
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0c3","role":"authenticated"}', true);
do $$
begin
  if not exists (select 1 from public.classement_amis('record') where pseudo = 'zz_conf_a') then
    raise exception 'ÉCHEC : A absent du classement entre amis de C';
  end if;
end $$;

-- A avait demandé B : B peut encore accepter, même si A est sur « Personne »
reset role;
insert into public.amities (demandeur, destinataire) values
  ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-00000000c0b2');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c0b2","role":"authenticated"}', true);
do $$
begin
  if public.demander_ami('zz_conf_a') <> 'acceptee' then
    raise exception 'ÉCHEC : la demande inverse en attente n''est plus acceptée';
  end if;
end $$;

reset role;
select 'OK — confidentialite' as resultat;
rollback;
