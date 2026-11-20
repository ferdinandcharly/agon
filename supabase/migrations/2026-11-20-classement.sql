-- Classement Survie (projet 1/3) — migration « classement » du 20/11/2026.
-- Spec : docs/superpowers/specs/2026-11-20-classement-survie-design.md
-- Les profils et parties des autres ne se lisent jamais en direct : seulement via public.classement().

create table public.profils (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  pseudo  text not null check (pseudo ~ '^[A-Za-z0-9_-]{3,20}$'),
  cree_le timestamptz not null default now()
);
create unique index profils_pseudo_unique on public.profils (lower(pseudo));

create table public.parties_survie (
  id       uuid primary key,                 -- généré par l'appli : un renvoi ne crée pas de doublon
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  score    integer not null check (score between 0 and 300),
  parcours text not null default 'but-info-1',
  joue_le  timestamptz not null default now()
);
create index parties_parcours_date on public.parties_survie (parcours, joue_le);
create index parties_user on public.parties_survie (user_id, joue_le);

-- Droits minimaux
alter table public.profils enable row level security;
alter table public.parties_survie enable row level security;
revoke all on table public.profils, public.parties_survie from anon, authenticated;
grant select, insert on table public.profils to authenticated;
grant update (pseudo) on table public.profils to authenticated;   -- seule colonne modifiable
grant select, insert on table public.parties_survie to authenticated;

create policy "lire son profil" on public.profils for select
  to authenticated using ((select auth.uid()) = user_id);
create policy "créer son profil" on public.profils for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy "modifier son profil" on public.profils for update
  to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "lire ses parties" on public.parties_survie for select
  to authenticated using ((select auth.uid()) = user_id);
create policy "ajouter ses parties" on public.parties_survie for insert
  to authenticated with check ((select auth.uid()) = user_id);

-- Garde-fous à l'insertion : date plausible, pas de rafale, pas plus de 300 parties par jour.
-- On compare les heures de fin de partie (joue_le) : des parties jouées hors ligne arrivent ensemble.
create function private.verifier_partie()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Renvoi d'une partie déjà reçue : on laisse « on conflict do nothing » l'ignorer
  if exists (select 1 from public.parties_survie where id = new.id) then
    return new;
  end if;
  if new.joue_le > now() + interval '5 minutes' or new.joue_le < now() - interval '30 days' then
    raise exception 'partie refusée : date invalide';
  end if;
  if exists (select 1 from public.parties_survie
             where user_id = new.user_id and joue_le between new.joue_le - interval '5 seconds' and new.joue_le + interval '5 seconds') then
    raise exception 'partie refusée : trop rapprochée de la précédente';
  end if;
  if (select count(*) from public.parties_survie
      where user_id = new.user_id and joue_le > new.joue_le - interval '24 hours' and joue_le <= new.joue_le) >= 300 then
    raise exception 'partie refusée : trop de parties en 24 h';
  end if;
  return new;
end;
$$;
revoke execute on function private.verifier_partie() from public, anon, authenticated;
grant usage on schema private to authenticated;   -- le trigger s'exécute avec les droits de l'appelant
grant execute on function private.verifier_partie() to authenticated;

create trigger verifier_partie before insert on public.parties_survie
  for each row execute function private.verifier_partie();

-- Classement : meilleur score par joueur sur la période ; à égalité, le premier arrivé devant.
-- security definer : seul moyen de classer sans exposer les parties des autres. Ne renvoie que
-- rang, pseudo, score et « moi ». Top 50 + la ligne de l'appelant s'il n'y est pas.
create function public.classement(periode text, p_parcours text default 'but-info-1')
returns table (rang integer, pseudo text, score integer, moi boolean)
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
           pr.pseudo as ps, m.score as sc, m.user_id = auth.uid() as est_moi
    from meilleurs m
    join public.profils pr on pr.user_id = m.user_id
  )
  select c.r, c.ps, c.sc, c.est_moi from classes c
  where c.r <= 50 or c.est_moi
  order by c.r;
end;
$$;
revoke execute on function public.classement(text, text) from public, anon;
grant execute on function public.classement(text, text) to authenticated;
