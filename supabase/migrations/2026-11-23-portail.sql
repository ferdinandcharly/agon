-- Portail d'accueil — migration « portail » du 23/11/2026.
-- Spec : docs/superpowers/specs/2026-11-23-portail-design.md
-- Profil : parcours, avatar (publics via les fonctions : seulement l'avatar), prénom et établissement (privés).

alter table public.profils
  add column parcours text not null default 'but-info-1' check (parcours in ('but-info-1')),
  add column avatar text not null default 'violet-facette'
    check (avatar ~ '^(orange|jaune|vert|bleu|violet|rose|cyan)-(facette|etoile|note|eclair|coeur|vinyle)$'),
  add column prenom text check (prenom ~ '^[[:alpha:]][[:alpha:] ''-]{0,29}$'),
  add column etablissement text check (char_length(etablissement) between 2 and 60 and etablissement !~ '[[:cntrl:]<>]');
grant update (parcours, avatar, prenom, etablissement) on table public.profils to authenticated;

-- Les fonctions qui montrent les autres joueurs renvoient en plus l'avatar (jamais prénom, établissement, parcours)
drop function public.classement(text, text);
create function public.classement(periode text, p_parcours text default 'but-info-1')
returns table (rang integer, pseudo text, avatar text, score integer, moi boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  depuis timestamptz;
begin
  if auth.uid() is null then
    raise exception 'non connecté';
  end if;
  if periode = 'semaine' then
    depuis := date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  elsif periode = 'record' then
    depuis := '-infinity';
  else
    raise exception 'période inconnue : %', periode;
  end if;

  return query
  with meilleurs as (
    select distinct on (p.user_id) p.user_id, p.score, p.joue_le
    from public.parties_survie p
    where p.parcours = p_parcours and p.joue_le >= depuis
    order by p.user_id, p.score desc, p.joue_le asc
  ),
  classes as (
    select (row_number() over (order by m.score desc, m.joue_le asc))::integer as r,
           pr.pseudo as ps, pr.avatar as av, m.score as sc, m.user_id = auth.uid() as est_moi
    from meilleurs m
    join public.profils pr on pr.user_id = m.user_id
  )
  select c.r, c.ps, c.av, c.sc, c.est_moi from classes c
  where c.r <= 50 or c.est_moi
  order by c.r;
end;
$$;

drop function public.mes_amis();
create function public.mes_amis()
returns table (pseudo text, avatar text, relation text, notions integer, record integer, record_le timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  moi uuid := private.moi_avec_pseudo();
begin
  return query
  with rel as (
    select case when a.demandeur = moi then a.destinataire else a.demandeur end as autre,
           case when a.statut = 'acceptee' then 'ami'
                when a.destinataire = moi then 'recue'
                else 'envoyee' end as rel
    from public.amities a
    where moi in (a.demandeur, a.destinataire)
  ),
  records as (
    select distinct on (p.user_id) p.user_id, p.score, p.joue_le
    from public.parties_survie p
    where p.parcours = 'but-info-1' and p.user_id in (select r.autre from rel r where r.rel = 'ami')
    order by p.user_id, p.score desc, p.joue_le asc
  )
  select pr.pseudo, pr.avatar, r.rel,
         case when r.rel = 'ami' then pr.notions_allumees::integer end,
         case when r.rel = 'ami' then rc.score end,
         case when r.rel = 'ami' then rc.joue_le end
  from rel r
  join public.profils pr on pr.user_id = r.autre
  left join records rc on rc.user_id = r.autre
  order by pr.pseudo;
end;
$$;

drop function public.classement_amis(text, text);
create function public.classement_amis(periode text, p_parcours text default 'but-info-1')
returns table (rang integer, pseudo text, avatar text, score integer, moi boolean, notions integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  u uuid := private.moi_avec_pseudo();
  depuis timestamptz;
begin
  if periode = 'semaine' then
    depuis := date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  elsif periode = 'record' then
    depuis := '-infinity';
  else
    raise exception 'période inconnue';
  end if;
  return query
  with cercle as (
    select u as id
    union
    select case when a.demandeur = u then a.destinataire else a.demandeur end
    from public.amities a where a.statut = 'acceptee' and u in (a.demandeur, a.destinataire)
  ),
  meilleurs as (
    select distinct on (p.user_id) p.user_id, p.score, p.joue_le
    from public.parties_survie p
    where p.parcours = p_parcours and p.joue_le >= depuis and p.user_id in (select c.id from cercle c)
    order by p.user_id, p.score desc, p.joue_le asc
  )
  select (row_number() over (order by m.score desc, m.joue_le asc))::integer, pr.pseudo, pr.avatar, m.score,
         m.user_id = u, pr.notions_allumees::integer
  from meilleurs m
  join public.profils pr on pr.user_id = m.user_id
  order by 1;
end;
$$;

revoke execute on function public.classement(text, text), public.mes_amis(), public.classement_amis(text, text) from public, anon;
grant execute on function public.classement(text, text), public.mes_amis(), public.classement_amis(text, text) to authenticated;
