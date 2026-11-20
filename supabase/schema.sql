-- Facettes — base Supabase (projet « facettes », eu-west-3 Paris).
-- Appliqué par migration « progression » ; ce fichier sert de référence, ne pas le rejouer tel quel.
--
-- Une ligne par compte : la progression telle que l'appli la garde dans localStorage.
-- La fusion entre appareils se fait côté client (carte par carte, la plus récente gagne ;
-- collection et record : le plus grand gagne).

create table public.progression (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  resultats  jsonb not null default '{}'::jsonb,   -- agon.resultats : { idCarte: { vu, ok, ko, boite, dernier, derniereOk } }
  reglages   jsonb not null default '{}'::jsonb,   -- agon.reglages : matières et jeux exclus
  collection jsonb not null default '{}'::jsonb,   -- agon.collection : vinyles, disques d'or, dernier jour
  survie     jsonb not null default '{}'::jsonb,   -- agon.survie : record
  maj        timestamptz not null default now(),
  -- garde-fou : une progression réaliste pèse quelques dizaines de Ko
  constraint progression_taille check (
    pg_column_size(resultats) + pg_column_size(reglages)
    + pg_column_size(collection) + pg_column_size(survie) < 512000
  )
);

alter table public.progression enable row level security;

-- Droits minimaux : rien pour anon, juste le nécessaire pour un compte connecté
revoke all on table public.progression from anon, authenticated;
grant select, insert, update on table public.progression to authenticated;

create policy "lire sa progression" on public.progression for select
  to authenticated using ((select auth.uid()) = user_id);
create policy "créer sa progression" on public.progression for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy "modifier sa progression" on public.progression for update
  to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Suppression de compte (RGPD) : efface l'utilisateur, la cascade efface sa progression.
-- security definer obligatoire (auth.users) ; durcie : search_path vide, n'agit que sur l'appelant,
-- exécution réservée aux comptes connectés.
create function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'non connecté';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;

-- Purge RGPD (migration « purge_inactifs », détail dans migrations/2026-11-20-purge-inactifs.sql) :
-- private.purger_comptes_inactifs() supprime les comptes sans utilisation depuis 2 ans
-- (la plus récente de : création, connexion, synchro, session rafraîchie ; migration purge_activite_reelle), lancée chaque lundi à 03:00 UTC par pg_cron
-- (tâche « purge-comptes-inactifs »). Schéma private non exposé, exécution révoquée pour tous les rôles API.

-- Classement Survie (migration « classement », détail dans migrations/2026-11-20-classement.sql) :
-- profils (pseudo unique sans casse, seule colonne modifiable) et parties_survie (id fourni par l'appli,
-- score 0-300, parcours), lisibles et modifiables par leur seul auteur ; trigger private.verifier_partie
-- (date plausible, 5 s entre deux parties, 300 par 24 h) ; public.classement(periode, p_parcours) en
-- security definer : top 50 + la ligne de l'appelant, sans aucune date ni identifiant.
