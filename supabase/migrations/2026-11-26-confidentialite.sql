-- Confidentialité sociale — migration « confidentialite » du 26/11/2026.
-- Spec : docs/superpowers/specs/2026-11-26-confidentialite-design.md
-- Deux réglages par joueur, appliqués ici (pas seulement dans l'appli) :
-- - visible_classement : absent du classement général pour les autres (ses amis le voient toujours) ;
-- - demandes_amis : sur « Personne », une demande répond « pseudo introuvable », comme un pseudo inexistant.
-- Ces colonnes ne sont renvoyées par aucune fonction qui montre d'autres joueurs.

alter table public.profils
  add column visible_classement boolean not null default true,
  add column demandes_amis boolean not null default true;
grant update (visible_classement, demandes_amis) on table public.profils to authenticated;

-- Classement général : les joueurs masqués sont retirés avant le calcul des rangs ; l'appelant garde sa ligne
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
    select distinct on (p.user_id) p.user_id, p.score, p.joue_le, pr.pseudo, pr.avatar
    from public.parties_survie p
    join public.profils pr on pr.user_id = p.user_id
    where p.parcours = p_parcours and p.joue_le >= depuis
      and (pr.visible_classement or p.user_id = auth.uid())
    order by p.user_id, p.score desc, p.joue_le asc
  ),
  classes as (
    select (row_number() over (order by m.score desc, m.joue_le asc))::integer as r,
           m.pseudo as ps, m.avatar as av, m.score as sc, m.user_id = auth.uid() as est_moi
    from meilleurs m
  )
  select c.r, c.ps, c.av, c.sc, c.est_moi from classes c
  where c.r <= 50 or c.est_moi
  order by c.r;
end;
$$;

-- Demande d'ami : refusée (« pseudo introuvable ») si l'autre est sur « Personne »,
-- sauf s'il m'avait déjà demandé (j'accepte alors sa demande)
create or replace function public.demander_ami(p_pseudo text)
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
  -- Demandes fermées : même réponse qu'un pseudo inexistant (on ne révèle pas que le compte existe)
  if not (select pr.demandes_amis from public.profils pr where pr.user_id = autre) then
    raise exception 'pseudo introuvable';
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

revoke execute on function public.classement(text, text), public.demander_ami(text) from public, anon;
grant execute on function public.classement(text, text), public.demander_ami(text) to authenticated;
