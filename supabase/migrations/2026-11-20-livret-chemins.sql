-- Migration « livret_chemins » (20/11/2026), après relecture : le chemin d'un document guide une requête faite
-- avec la clé secrète sur le PC. Il doit donc avoir exactement le format produit par l'appli
-- (<matiere>/<uuid>-<nom nettoyé>), correspondre à sa matière et ne jamais contenir « .. ».
alter table public.documents
  add constraint documents_matiere_format check (matiere ~ '^[a-z0-9_-]{1,40}$'),
  add constraint documents_chemin_format check (
    chemin ~ '^[a-z0-9_-]{1,40}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,90}$'
    and split_part(chemin, '/', 1) = matiere
    and position('..' in chemin) = 0
  );
