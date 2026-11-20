-- Livret de cours — migration « livret » du 20/11/2026.
-- Spec : docs/superpowers/specs/2026-11-20-livret-cours-design.md
-- Documents de cours (PDF, photos) ajoutés par l'admin dans un album, puis transformés en cartes sur son PC.
-- Tout est réservé à l'admin : raw_app_meta_data.admin = true (non modifiable par l'utilisateur lui-même).

-- L'appelant est-il l'admin ? (lu dans le jeton : à jour après son renouvellement)
create function private.est_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'admin')::boolean, false);
$$;
revoke execute on function private.est_admin() from public, anon;
grant execute on function private.est_admin() to authenticated;

-- Fichiers : espace privé, 20 Mo au plus, PDF et photos seulement (contrôlé par Supabase lui-même)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cours', 'cours', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']);

create policy "admin lit les cours" on storage.objects for select
  to authenticated using (bucket_id = 'cours' and private.est_admin());
create policy "admin ajoute des cours" on storage.objects for insert
  to authenticated with check (bucket_id = 'cours' and private.est_admin());
create policy "admin supprime des cours" on storage.objects for delete
  to authenticated using (bucket_id = 'cours' and private.est_admin());

create table public.documents (
  id        uuid primary key default gen_random_uuid(),
  matiere   text not null,
  nom       text not null,                 -- nom d'origine du fichier
  chemin    text not null unique,          -- chemin dans le bucket « cours »
  type      text not null,
  taille    integer not null check (taille between 0 and 20971520),
  ajoute_le timestamptz not null default now(),
  statut    text not null default 'a_traiter' check (statut in ('a_traiter', 'traite')),
  lot       text                           -- lot de cartes qui l'a transformé
);
create index documents_matiere on public.documents (matiere, ajoute_le);

alter table public.documents enable row level security;
revoke all on table public.documents from anon, authenticated;
grant select, insert, delete on table public.documents to authenticated;
grant update (statut, lot) on table public.documents to authenticated;

create policy "admin lit les documents" on public.documents for select
  to authenticated using (private.est_admin());
create policy "admin ajoute des documents" on public.documents for insert
  to authenticated with check (private.est_admin());
create policy "admin met à jour les documents" on public.documents for update
  to authenticated using (private.est_admin()) with check (private.est_admin());
create policy "admin supprime des documents" on public.documents for delete
  to authenticated using (private.est_admin());
