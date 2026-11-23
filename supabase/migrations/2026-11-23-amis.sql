-- Amis (projet 2/3) — migration « amis » du 23/11/2026.
-- Spec : docs/superpowers/specs/2026-11-23-amis-design.md
-- La table amities n'a aucun droit direct : tout passe par les fonctions ci-dessous, qui ne renvoient
-- que des pseudos et des chiffres (jamais d'identifiant).

create table public.amities (
  demandeur    uuid not null references auth.users (id) on delete cascade,
  destinataire uuid not null references auth.users (id) on delete cascade,
  statut       text not null default 'attente' check (statut in ('attente', 'acceptee')),
  cree_le      timestamptz not null default now(),
  accepte_le   timestamptz,
  primary key (demandeur, destinataire),
  check (demandeur <> destinataire)
);
-- Une seule relation par paire, quel que soit le sens
create unique index amities_paire on public.amities (least(demandeur, destinataire), greatest(demandeur, destinataire));
create index amities_destinataire on public.amities (destinataire);
alter table public.amities enable row level security;
revoke all on table public.amities from anon, authenticated;

-- Nombre de notions allumées, publié par l'appli ; seuls les amis le voient (via mes_amis / classement_amis)
alter table public.profils add column notions_allumees smallint not null default 0
  check (notions_allumees between 0 and 2000);
grant update (notions_allumees) on table public.profils to authenticated;

-- Identifiant d'un profil par pseudo (sans casse), ou null
create function private.profil_par_pseudo(p_pseudo text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.profils where lower(pseudo) = lower(trim(p_pseudo));
$$;
revoke execute on function private.profil_par_pseudo(text) from public, anon, authenticated;

-- L'appelant doit être connecté et avoir un pseudo
create function private.moi_avec_pseudo()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'non connecté';
  end if;
  if not exists (select 1 from public.profils where user_id = auth.uid()) then
    raise exception 'choisis d''abord un pseudo';
  end if;
  return auth.uid();
end;
$$;
revoke execute on function private.moi_avec_pseudo() from public, anon, authenticated;

create function private.nb_amis(u uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.amities
  where statut = 'acceptee' and u in (demandeur, destinataire);
$$;
revoke execute on function private.nb_amis(uuid) from public, anon, authenticated;

-- Envoie une demande ; si l'autre m'avait déjà demandé, l'amitié est acceptée. Renvoie 'envoyee' ou 'acceptee'.
create function public.demander_ami(p_pseudo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  moi uuid := private.moi_avec_pseudo();
  autre uuid := private.profil_par_pseudo(p_pseudo);
  existant public.amities;
begin
  if autre is null then
    raise exception 'pseudo introuvable';
  end if;
  if autre = moi then
    raise exception 'c''est toi';
  end if;
  select * into existant from public.amities
  where (demandeur = moi and destinataire = autre) or (demandeur = autre and destinataire = moi);
  if found then
    if existant.statut = 'acceptee' then
      raise exception 'déjà amis';
    elsif existant.demandeur = moi then
      raise exception 'demande déjà envoyée';
    end if;
    -- L'autre m'avait demandé : on accepte
    if private.nb_amis(moi) >= 100 or private.nb_amis(autre) >= 100 then
      raise exception 'trop d''amis';
    end if;
    update public.amities set statut = 'acceptee', accepte_le = now()
    where demandeur = autre and destinataire = moi;
    return 'acceptee';
  end if;
  if (select count(*) from public.amities where demandeur = moi and statut = 'attente') >= 20 then
    raise exception 'trop de demandes en attente';
  end if;
  if private.nb_amis(moi) >= 100 or private.nb_amis(autre) >= 100 then
    raise exception 'trop d''amis';
  end if;
  begin
    insert into public.amities (demandeur, destinataire) values (moi, autre);
  exception when unique_violation then
    -- Demande croisée arrivée au même instant : on rejoue, elle devient une acceptation
    return public.demander_ami(p_pseudo);
  end;
  return 'envoyee';
end;
$$;

-- Accepte ou refuse une demande reçue de ce pseudo
create function public.repondre_ami(p_pseudo text, p_accepter boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  moi uuid := private.moi_avec_pseudo();
  autre uuid := private.profil_par_pseudo(p_pseudo);
begin
  if autre is null or not exists (select 1 from public.amities
      where demandeur = autre and destinataire = moi and statut = 'attente') then
    raise exception 'aucune demande de ce pseudo';
  end if;
  if p_accepter then
    if private.nb_amis(moi) >= 100 or private.nb_amis(autre) >= 100 then
      raise exception 'trop d''amis';
    end if;
    update public.amities set statut = 'acceptee', accepte_le = now()
    where demandeur = autre and destinataire = moi;
  else
    delete from public.amities where demandeur = autre and destinataire = moi;
  end if;
end;
$$;

-- Retire un ami, ou annule une demande que j'ai envoyée
create function public.retirer_ami(p_pseudo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  moi uuid := private.moi_avec_pseudo();
  autre uuid := private.profil_par_pseudo(p_pseudo);
begin
  delete from public.amities
  where autre is not null
    and ((statut = 'acceptee' and ((demandeur = moi and destinataire = autre) or (demandeur = autre and destinataire = moi)))
      or (statut = 'attente' and demandeur = moi and destinataire = autre));
  if not found then
    raise exception 'rien à retirer';
  end if;
end;
$$;

-- Mes relations : amis (avec notions et record), demandes reçues, demandes envoyées
create function public.mes_amis()
returns table (pseudo text, relation text, notions integer, record integer, record_le timestamptz)
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
  select pr.pseudo, r.rel,
         case when r.rel = 'ami' then pr.notions_allumees::integer end,
         case when r.rel = 'ami' then rc.score end,
         case when r.rel = 'ami' then rc.joue_le end
  from rel r
  join public.profils pr on pr.user_id = r.autre
  left join records rc on rc.user_id = r.autre
  order by pr.pseudo;
end;
$$;

-- Classement Survie entre moi et mes amis acceptés (même règle que public.classement)
create function public.classement_amis(periode text, p_parcours text default 'but-info-1')
returns table (rang integer, pseudo text, score integer, moi boolean, notions integer)
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
  select (row_number() over (order by m.score desc, m.joue_le asc))::integer, pr.pseudo, m.score,
         m.user_id = u, pr.notions_allumees::integer
  from meilleurs m
  join public.profils pr on pr.user_id = m.user_id
  order by 1;
end;
$$;

revoke execute on function public.demander_ami(text), public.repondre_ami(text, boolean), public.retirer_ami(text),
  public.mes_amis(), public.classement_amis(text, text) from public, anon;
grant execute on function public.demander_ami(text), public.repondre_ami(text, boolean), public.retirer_ami(text),
  public.mes_amis(), public.classement_amis(text, text) to authenticated;
