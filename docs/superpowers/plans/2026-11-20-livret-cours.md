# Livret de cours — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'admin ajoute des documents de cours à un album ; ils sont rangés en ligne (privé), consultables dans un livret, puis récupérés sur le PC pour `/generer-cartes`.

**Architecture:** Bucket privé `cours` + table `documents`, réservés à l'admin (`app_metadata.admin`). Côté appli, `app/livret.js` (bouton « + », livret) branché dans l'album de la discothèque. Côté PC, deux outils Node sans dépendance utilisent la clé secrète de `.env` (en-tête `apikey` seul, jamais `Authorization`).

**Tech Stack:** Supabase Storage + Postgres RLS, supabase-js 2.119.2 (appli), Node 22 `fetch` (outils), Edge headless.

**Spec:** `docs/superpowers/specs/2026-11-20-livret-cours-design.md`

## Global Constraints

- Admin = `auth.jwt() -> 'app_metadata' ->> 'admin' = 'true'` ; aucune autre règle n'accorde l'accès.
- Bucket `cours` privé, 20 Mo, types `application/pdf`, `image/jpeg`, `image/png`, `image/heic`, `image/heif`, `image/webp`.
- Clé secrète : seulement dans `.env` (racine, ignoré par git), variables `SUPABASE_URL`, `SUPABASE_CLE_SECRETE` ; envoyée dans l'en-tête `apikey` uniquement. Jamais dans le dépôt, jamais dans l'appli.
- Textes en français, insécables, pas d'`innerHTML`, pas de style en ligne. `VERSION` → `facettes-v23`, `livret.js` dans `COQUILLE`.
- CAPTCHA : aucun test navigateur connecté ; logique serveur testée en SQL, parcours admin vérifié à la main.

## Review Focus

1. **Envoi interrompu** (réseau coupé après le fichier, avant la ligne) : pas de fichier orphelin → l'appli supprime le fichier si l'insertion échoue ; testé par un test SQL/Storage ? non : par revue de code et vérification manuelle (mode avion pendant un envoi).
2. **Deux fichiers du même nom** dans `sources/<matiere>/` : pas d'écrasement → test Node de `nomLibre`.
3. **Nom de fichier exotique** (accents, espaces, emoji, « ../ ») : chemin de stockage sûr → test Node/navigateur de `nettoyerNom`.
4. **Jeton pas encore à jour après la pose du rôle admin** : le « + » n'apparaît pas tant que le jeton n'est pas renouvelé → message dans le README et la vérification manuelle.
5. **Compte non admin qui appelle directement l'API Storage** : refus → test SQL sur `storage.objects`.

---

### Task 1: Base et stockage

**Files:** Create `supabase/migrations/2026-11-20-livret.sql`, `tests/sql/livret.sql` ; Modify `supabase/schema.sql`

- [ ] **Step 1: Test SQL** (annulé, rôles simulés) — un compte `authenticated` sans admin : `select`/`insert`/`delete` sur `documents` et `insert` dans `storage.objects` (`bucket_id = 'cours'`) refusés ou invisibles ; avec claims `{"sub": …, "role": "authenticated", "app_metadata": {"admin": true}}` : `insert` d'une ligne `documents`, `update (statut, lot)`, `select` OK ; `update` d'une autre colonne refusé ; `anon` rien. Configuration du bucket : `public = false`, limite 20971520, types exacts. Sortie `RESULTAT: …` attendue exacte écrite dans le fichier.
- [ ] **Step 2: Lancer — échec** (`relation "public.documents" does not exist`).
- [ ] **Step 3: Migration `livret`** — `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('cours', 'cours', false, 20971520, array[…])` ; table `documents` (spec §1), RLS, `revoke all` puis `grant select, insert, delete` + `grant update (statut, lot)` à `authenticated`, policies admin ; policies `storage.objects` `select`/`insert`/`delete` pour `bucket_id = 'cours'` et admin. Fonction `private.est_admin()` (`stable`, `search_path = ''`) si elle simplifie les policies.
- [ ] **Step 4: Relancer** — `RESULTAT` attendu ; conseillers sans nouvel avertissement inattendu.
- [ ] **Step 5: Commit** `Livret : bucket privé cours et table documents réservés à l'admin`

### Task 2: Outils du PC

**Files:** Create `outils/supabase-secret.mjs` (lecture `.env`, `requete(chemin, options)` avec `apikey`), `outils/recuperer-cours.mjs`, `tests/outils.test.mjs` ; Modify `outils/fusionner.mjs`, `.claude/commands/generer-cartes.md`, `.gitignore` (vérifier `.env`, ajouter `sources/**/.documents.json` si besoin)

**Interfaces:** `nettoyerNom(nom) → string` (lettres/chiffres ASCII, `.`, `-`, `_`, accents translittérés, longueur ≤ 80, jamais vide, pas de `..`) et `nomLibre(dossier, nom) → string` (suffixe `-2`, `-3`… avant l'extension) exportés par `recuperer-cours.mjs` ; `marquerTraites(ids, lot)` dans `supabase-secret.mjs`.

- [ ] **Step 1: Test Node** `tests/outils.test.mjs` — `nettoyerNom("Cours réseau (TD 2).pdf") === "Cours-reseau-TD-2.pdf"` ; `nettoyerNom("../../x.pdf")` ne contient pas `..` ni `/` ; `nettoyerNom("🎵.png")` non vide ; `nomLibre` dans un dossier temporaire avec `a.pdf` existant → `a-2.pdf` ; `node outils/recuperer-cours.mjs` sans `.env` (dossier de travail temporaire) → code de sortie 2 et message contenant `SUPABASE_CLE_SECRETE`.
- [ ] **Step 2: Lancer — échec.**
- [ ] **Step 3: Implémenter** — `recuperer-cours.mjs` : `GET /rest/v1/documents?statut=eq.a_traiter&select=*` puis `GET /storage/v1/object/cours/<chemin>` ; écrit dans `sources/<matiere>/` et met à jour `sources/<matiere>/.documents.json` (`{ fichierLocal: idDocument }`) ; résumé. `fusionner.mjs` : si `lot.source.documents` (tableau d'ids) et `.env` présent → `PATCH /rest/v1/documents?id=in.(…)` `{ statut: "traite", lot }` ; sinon rappel. `generer-cartes.md` : étape 0 « lancer `node outils/recuperer-cours.mjs` », puis consigner les ids dans `source.documents` du lot.
- [ ] **Step 4: Relancer** `node tests/outils.test.mjs` — OK.
- [ ] **Step 5: Commit** `Livret : récupération des cours sur le PC et marquage après fusion`

### Task 3: Appli — bouton « + » et livret

**Files:** Create `app/livret.js` ; Modify `app/discotheque.js` (zone `.f-livret-zone` après les pistes + bouton sous « Réviser l'album » si admin), `app/compte.js` (`estAdmin()`), `app/index.html` (script), `app/fil.css`, `app/sw.js` (v23), `README.md` ; Modify `tests/discotheque.test.mjs` (scénario 15)

**Interfaces:** `Livret.verifierFichier({ name, type, size }) → string | null` (pure) ; `Livret.dessiner(zone, matiere)` ; `Livret.ajouter(fichiers, matiere)` ; `Compte.estAdmin() → boolean`.

- [ ] **Step 1: Scénario 15** — sans compte : aucun `.f-livret-ajouter` ni `.f-livret` dans l'album ; `Livret.verifierFichier({ name: "a.pdf", type: "application/pdf", size: 1000 }) === null` ; `{ type: "application/zip" }` → message contenant « PDF » ; `size: 21 * 1024 * 1024` → message contenant « 20 Mo » ; `{ name: "IMG_1.HEIC", type: "" }` (Safari donne parfois un type vide) → accepté par l'extension.
- [ ] **Step 2: Lancer — échec.**
- [ ] **Step 3: Implémenter** — envoi `sb.storage.from("cours").upload(chemin, fichier, { contentType })` puis `insert` dans `documents` ; en cas d'échec de l'insertion, `remove([chemin])` ; livret : `select` des documents de la matière triés par date, « Ouvrir » via `createSignedUrl(chemin, 3600)` puis `window.open`, « Supprimer » en deux temps (`remove` puis `delete`). Messages hors ligne.
- [ ] **Step 4: Relancer** toute la suite navigateur — OK, 0 violation CSP.
- [ ] **Step 5: Commit** `Livret : ajouter un cours dans un album (admin), consulter et supprimer ; v23`

### Task 4: Activation et vérification (Ferdinand + Claude)

- [ ] Claude pose `admin = true` dans `raw_app_meta_data` du compte de Ferdinand (SQL, après accord).
- [ ] Ferdinand : copier la clé secrète (Supabase → Project Settings → API Keys → Secret keys) dans `.env` à la racine : `SUPABASE_URL=https://hiqymrmygjisqqypbfxp.supabase.co` et `SUPABASE_CLE_SECRETE=sb_secret_…` — sans jamais la coller dans le chat.
- [ ] Mise en ligne (push + subtree) ; se déconnecter/reconnecter sur l'iPhone ; ajouter un PDF et une photo ; ouvrir ; supprimer un essai.
- [ ] Sur le PC : `node outils/recuperer-cours.mjs` → fichiers dans `sources/<matiere>/` ; `/generer-cartes` puis fusion → documents « transformé en cartes ».
