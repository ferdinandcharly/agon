# Livret de cours : « + » dans les albums et file de génération — design

Date : 20/11/2026 · Statut : validé à l'oral, à relire par Ferdinand · Règles générales :
`2026-11-20-securite-rgpd-design.md` §3.

## Objectif

Depuis la discothèque, Ferdinand ajoute ses documents de cours (PDF, photos du cahier) à une matière, depuis
l'iPhone ou le PC. Les documents sont rangés en ligne, consultables dans l'album, puis transformés en cartes par
la chaîne existante (`/generer-cartes` dans Claude Code sur son PC). Plus tard (hors périmètre) : génération
automatique par une clé d'API, par personne.

Critère de réussite : un document ajouté depuis l'iPhone arrive dans `sources/<matière>/` sur le PC en une
commande, et passe à « transformé en cartes » quand le lot généré est fusionné. Aucun autre compte ne voit ni le
bouton, ni les documents.

## Décisions

- **Toi seul** : le « + » et le livret n'existent que pour le compte admin (Ferdinand).
- **Admin** = `raw_app_meta_data.admin = true` sur son utilisateur, posé en SQL (non modifiable par l'utilisateur,
  contrairement à `user_metadata`). Les règles lisent `auth.jwt() -> 'app_metadata' ->> 'admin'`. Le jeton n'est
  à jour qu'après son renouvellement (≤ 1 h) : après la pose, se déconnecter/reconnecter ou attendre.
- **Accès depuis le PC** : clé secrète Supabase dans `.env` à la racine du dépôt (déjà ignoré par git), lue par
  un outil Node sans dépendance. Jamais ailleurs que dans ce fichier.

## 1. Stockage et base

- Espace de fichiers (bucket) **`cours`**, **privé**, `file_size_limit` = 20 Mo, `allowed_mime_types` =
  `application/pdf`, `image/jpeg`, `image/png`, `image/heic`, `image/heif`, `image/webp`.
- Chemin d'un fichier : `<matiere>/<uuid>-<nom-nettoyé>` (nom nettoyé : lettres, chiffres, `.`, `-`, `_`).
- Policies sur `storage.objects` pour `bucket_id = 'cours'` : `select`, `insert`, `delete` réservés à l'admin.
- Table **`public.documents`** : `id uuid` (défaut), `matiere text`, `nom text` (nom d'origine), `chemin text unique`,
  `type text`, `taille integer`, `ajoute_le timestamptz` (défaut now()), `statut text` (`a_traiter` | `traite`,
  défaut `a_traiter`), `lot text null` (fichier du lot qui l'a transformé). RLS : tout réservé à l'admin
  (`select`, `insert`, `update (statut, lot)`, `delete`) ; rien pour `anon` ni pour les autres comptes.
- La clé secrète contourne la RLS : c'est voulu pour l'outil du PC, et seulement là.

## 2. Appli (compte admin seulement)

- `Compte.estAdmin()` : lu dans `utilisateur.app_metadata.admin`.
- Dans l'album courant de la discothèque, sous « Réviser l'album » : bouton « + Ajouter un cours »
  (`<input type="file" accept=".pdf,image/*" multiple>` caché, déclenché par le bouton).
- Pour chaque fichier : contrôle local (type, 20 Mo) avec message clair ; envoi dans `cours` puis ligne dans
  `documents` ; si l'insertion de la ligne échoue, le fichier envoyé est supprimé (pas d'orphelin).
- **Livret** sous les pistes : « Livret (N) », une ligne par document de la matière : nom, date, état
  (« en attente » / « transformé en cartes »), bouton « Ouvrir » (lien signé valable 1 h, ouvert dans un nouvel
  onglet), bouton « Supprimer » en deux temps (fichier puis ligne).
- Hors ligne ou erreur réseau : message « Il faut du réseau pour ajouter un cours. » ; le livret affiche
  « Livret indisponible hors ligne ».
- La CSP autorise déjà `connect-src` vers Supabase ; l'ouverture du lien signé est une navigation (non soumise à
  la CSP). Aucun style en ligne.

## 3. PC : file de génération

- **`outils/recuperer-cours.mjs`** : lit `SUPABASE_URL` et `SUPABASE_CLE_SECRETE` dans `.env`, liste
  `documents` en `a_traiter`, télécharge chaque fichier dans `sources/<matiere>/<nom d'origine>` (sans écraser :
  suffixe `-2`, `-3`… si le nom existe), écrit `sources/<matiere>/.documents.json` (correspondance fichier local →
  id du document) et affiche le résumé. Sans `.env` : message qui explique quoi y mettre.
- **`/generer-cartes`** : commence par lancer `recuperer-cours.mjs`, puis travaille sur les nouveaux fichiers ;
  le lot produit garde dans son champ `source` les ids des documents utilisés (`documents: [id…]`).
- **`outils/fusionner.mjs`** : après une fusion réussie, si le lot liste des `documents`, les passe à `traite`
  avec `lot = <nom du lot>` (même `.env`) ; sans `.env`, la fusion marche et un message rappelle de le faire.

## 4. Tests

- SQL (rôles simulés, annulé) : un compte connecté non admin ne lit, n'écrit ni ne supprime rien dans
  `documents` ni dans `storage.objects` du bucket `cours` ; l'admin (claims avec `app_metadata.admin = true`) peut
  tout ; `anon` rien ; le bucket refuse un type non autorisé (vérification de sa configuration).
- Navigateur : sans compte, ni « + » ni livret dans la discothèque ; contrôle local des fichiers (fonction pure
  `Livret.verifierFichier({ name, type, size })` → message ou null).
- Outils Node : `recuperer-cours.mjs` sans `.env` → message clair, code de sortie non nul ; nettoyage des noms
  (fonction pure testée).
- Vérification manuelle (CAPTCHA) : ajout depuis l'iPhone (PDF et photo), ouverture, suppression ; récupération
  sur le PC ; passage à « transformé en cartes » après fusion.

## Hors périmètre

Génération automatique par API, dépôt par d'autres comptes, OCR dans l'appli, aperçus des documents.
