# Confidentialité sociale — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** deux réglages appliqués par le serveur — apparaître dans le classement général, recevoir des demandes d'ami — et leur rubrique « Confidentialité » dans Paramètres.

**Architecture :** deux colonnes booléennes dans `profils` (défaut `true`), filtrage dans `public.classement` et refus dans `public.demander_ami` (fonctions `security definer` existantes, recréées). Côté appli : `Compte` lit/écrit les colonnes, `Profil` affiche deux interrupteurs ; la rubrique n'existe que si le profil lu du serveur contient les deux champs.

**Tech Stack :** Supabase (Postgres, PostgREST), JS vanilla à scripts classiques, tests Edge/CDP (`node tests/<nom>.test.mjs`).

**Spec :** `docs/superpowers/specs/2026-11-26-confidentialite-design.md`

## Global Constraints

- Colonnes : `visible_classement boolean not null default true`, `demandes_amis boolean not null default true` ; `grant update (visible_classement, demandes_amis) on table public.profils to authenticated`.
- Erreur pour un joueur sur « Personne » : exactement `pseudo introuvable` (même texte que pour un pseudo inexistant).
- Les deux colonnes ne sont jamais renvoyées par une fonction qui montre d'autres joueurs.
- Libellés : groupe « Confidentialité » ; « Apparaître dans le classement » + note « Tes amis te voient toujours. » ; « Recevoir des demandes d'ami » + note « Sinon, personne ne peut te trouver par ton pseudo. » ; échec : « Pas enregistré : vérifie ta connexion. »
- Ordre des groupes avec profil : Apparence, Jeu, Confidentialité, Compte, Zone sensible.
- CSP stricte : pas d'attribut `style`. Commentaires en français. `VERSION` du SW → `facettes-v40`.
- Toute action sur le projet Supabase réel (migration, script de test) : demander à Ferdinand avant.

## Review Focus

1. `enregistrerProfil` (Modifier mon profil) réécrit le cache avec `{...ligne}` seul → les deux réglages disparaîtraient et la rubrique avec : il doit fusionner avec le profil courant (test Tâche 2).
2. Deux clics rapides sur le même interrupteur pendant l'enregistrement : l'état final affiché doit correspondre au dernier enregistrement réussi (interrupteur désactivé pendant l'envoi — test Tâche 3).
3. Base pas encore migrée (colonne inconnue, code PostgREST `42703` ou message contenant `visible_classement`) : `lireProfil` retente sans les colonnes, le profil reste chargé, la rubrique est absente (test Tâche 2).
4. Joueur masqué qui consulte le classement : sa ligne `moi` est présente avec un rang calculé parmi visibles + lui (test SQL Tâche 1).
5. Demande inverse en attente vers quelqu'un sur « Personne » : `demander_ami` accepte toujours (test SQL Tâche 1).

---

### Tâche 1 : migration SQL et script de vérification

**Files :**
- Create : `supabase/migrations/2026-11-26-confidentialite.sql`
- Modify : `supabase/schema.sql` (ajout à la fin, même contenu, sous un bandeau `-- ===` comme les blocs précédents)
- Create : `supabase/tests/confidentialite.sql`

**Interfaces :**
- Produces : colonnes `profils.visible_classement`, `profils.demandes_amis` ; `public.classement(periode text, p_parcours text default 'but-info-1')` et `public.demander_ami(p_pseudo text)` avec mêmes signatures et mêmes colonnes de retour qu'aujourd'hui (dernières versions dans `schema.sql`).

- [ ] **Étape 1 : écrire `supabase/tests/confidentialite.sql`**
  `begin; … rollback;`. Crée trois utilisateurs dans `auth.users` (uuid fixes A, B, C), leurs `profils` (pseudos `zz_conf_a/b/c`), des `parties_survie` (A : 30, B : 20, C : 10, parcours `but-info-1`), une amitié acceptée A–C. A : `visible_classement = false, demandes_amis = false`. Bascule l'identité par `set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', <uuid>)::text, true);` (revenir `reset role` entre deux). Chaque vérification dans un bloc `do $$ … $$` qui fait `raise exception 'ÉCHEC : …'` si faux :
  - vu par B : aucune ligne `pseudo = 'zz_conf_a'` dans `classement('record')` ; les rangs renvoyés sont `1..n` consécutifs ;
  - vu par A : une ligne `moi = true`, pseudo `zz_conf_a` ;
  - vu par C : `classement_amis('record')` contient `zz_conf_a` ;
  - B : `demander_ami('zz_conf_a')` lève `pseudo introuvable` ;
  - insérer une demande en attente A → B, puis B : `demander_ami('zz_conf_a')` renvoie `acceptee`.
  Dernière ligne avant `rollback` : `select 'OK — confidentialite';`.
  (Lire la signature exacte de `classement_amis` dans `schema.sql` avant d'écrire l'appel.)

- [ ] **Étape 2 : écrire la migration** (en-tête de commentaires comme `2026-11-23-portail.sql`) : les deux colonnes + grant (Global Constraints) ; `drop` + `create` de `public.classement` en reprenant la dernière version de `schema.sql`, avec le filtre `pr.visible_classement or p.user_id = auth.uid()` appliqué dans `meilleurs` (jointure `profils` déplacée dans `meilleurs`) avant `row_number()` ; `create or replace` de `public.demander_ami` en reprenant la dernière version, avec `raise exception 'pseudo introuvable'` si `autre` a `demandes_amis = false`, **placé après** le cas « l'autre m'a déjà demandé → acceptée ». Reposer revoke/grant d'exécution comme dans `schema.sql`. Recopier dans `schema.sql`.

- [ ] **Étape 3 : relecture sécurité** — vérifier dans le diff : `security definer` + `set search_path = ''` conservés, aucune colonne nouvelle dans un `returns table`, droits `anon` révoqués.

- [ ] **Étape 4 : commit**
```bash
git add supabase && git commit -m "Confidentialité : colonnes, classement et demandes d'ami filtrés côté serveur, script de vérification"
```
(Application sur le projet réel : Tâche 5.)

### Tâche 2 : `Compte` — lecture, enregistrement, cache

**Files :**
- Modify : `app/compte.js` (`lireProfil` l. ~118, `enregistrerProfil` l. ~310, objet exporté l. ~491)
- Test : `tests/profil.test.mjs` (nouveaux scénarios 19–21, même style que 18 : `Compte.client().from` simulé)

**Interfaces :**
- Produces : `Compte.enregistrerConfidentialite(champs: { visible_classement?: boolean, demandes_amis?: boolean }) -> Promise<void>` (lève l'erreur Supabase, avec `messageAffiche` = `Compte.messageErreur(err)`) ; `Compte.profil()` contient `visible_classement` et `demandes_amis` (booléens) quand la base est migrée, sinon ne les contient pas.

- [ ] **Étape 1 : tests (rouges)**
  - 19 : `from().select(cols)` simulé qui enregistre `cols` et renvoie `{ pseudo: "Zoé", …, visible_classement: false, demandes_amis: true }` → `cols` contient `visible_classement` et `demandes_amis` ; `Compte.profil().visible_classement === false` ; le cache `agon.profil` contient les deux champs.
  - 20 : premier `select` renvoie `{ error: { code: "42703", message: "column profils.visible_classement does not exist" } }`, le second (sans ces colonnes) renvoie un profil → `Compte.profil().pseudo === "Zoé"` et `"visible_classement" in Compte.profil() === false`.
  - 21 : profil courant avec `visible_classement: false` ; `Compte.enregistrerProfil` (update simulé OK, `synchroniser` neutralisé) → `Compte.profil().visible_classement === false` (fusion, pas écrasement). `enregistrerConfidentialite({ demandes_amis: false })` avec update simulé qui enregistre la ligne envoyée → ligne envoyée `=== { demandes_amis: false }` exactement, `Compte.profil().demandes_amis === false` ; avec update en erreur → la promesse est rejetée et le profil inchangé.
- [ ] **Étape 2 :** `node tests/profil.test.mjs` → échec sur le scénario 19.
- [ ] **Étape 3 : implémenter** — `lireProfil` : colonnes `"pseudo, avatar, prenom, etablissement, parcours, visible_classement, demandes_amis"` ; si erreur dont `code === "42703"` ou message contenant `visible_classement`/`demandes_amis`, refaire le select sans les deux colonnes. `enregistrerProfil` : `changerProfil({ ...profil, ...ligne })`. `enregistrerConfidentialite` : ne garde que les deux clés booléennes reçues, `update(...).eq("user_id", utilisateur.id)`, garde `idAvant` comme `enregistrerProfil`, succès → `changerProfil({ ...profil, ...champs })`. Ajouter à l'objet exporté.
- [ ] **Étape 4 :** `node tests/profil.test.mjs` → `OK — profil`.
- [ ] **Étape 5 : commit** `git commit -am "Compte : lecture et enregistrement des réglages de confidentialité (repli si base non migrée)"`

### Tâche 3 : rubrique « Confidentialité » dans Paramètres

**Files :**
- Modify : `app/profil.js` (`rendreParametres` l. ~188)
- Modify : `app/fil.css` seulement si la note sous un interrupteur n'a pas de style correct avec `.f-param-note` ; `app/clair.css` si un nouveau sélecteur de texte secondaire apparaît
- Test : `tests/profil.test.mjs` (scénarios 22–24)

**Interfaces :**
- Consumes : `Compte.profil()`, `Compte.enregistrerConfidentialite` (Tâche 2).

- [ ] **Étape 1 : tests (rouges)**
  - 22 : cache profil avec `visible_classement: false, demandes_amis: true` (via `avantPage` sur `agon.profil`, comme le scénario 226) → Paramètres : titres `h2` `["Apparence", "Jeu", "Confidentialité", "Compte", "Zone sensible"]` ; `[data-id=visible_classement]` `aria-checked="false"`, `[data-id=demandes_amis]` `"true"` ; les deux notes présentes (textes exacts des Global Constraints). Cache sans ces champs → pas de groupe « Confidentialité ».
  - 23 : `Compte.enregistrerConfidentialite` remplacé par une promesse qui se résout après 150 ms → clic : `aria-checked` bascule tout de suite et le bouton est `disabled` pendant l'envoi ; deuxième clic pendant l'envoi sans effet ; après : réactivé ; appelé une fois avec `{ visible_classement: true }`.
  - 24 : `enregistrerConfidentialite` rejeté → `aria-checked` revient à la valeur d'avant et `.f-param-message` contient « Pas enregistré : vérifie ta connexion. »
- [ ] **Étape 2 :** `node tests/profil.test.mjs` → échec scénario 22.
- [ ] **Étape 3 : implémenter** — fonction `rendreConfidentialite(message)` dans `profil.js`, renvoie `null` si `Compte.profil()` n'a pas les deux booléens, sinon `groupe("Confidentialité", …)` avec deux boutons `f-param-ligne f-param-inter`, `role="switch"`, `data-id` = nom de colonne (même balisage que `rendreInterrupteurs`), chaque bouton suivi de sa note `.f-param-note`. Insérée entre « Jeu » et « Compte ». Lire `groupe()`/`ligne()` pour placer les notes dans la carte ou juste sous elle de façon cohérente avec la Zone sensible.
- [ ] **Étape 4 :** `node tests/profil.test.mjs`, puis `node tests/apparence.test.mjs` (audit de contraste ; ajouter au besoin un écran Paramètres avec profil dans la liste de l'audit si elle n'en a pas).
- [ ] **Étape 5 : commit** `git commit -am "Paramètres : rubrique Confidentialité (classement, demandes d'ami)"`

### Tâche 4 : Tes données, version, suite complète

**Files :**
- Modify : `app/donnees.js` (select l. 36 ; texte l. 94)
- Modify : `app/sw.js` (`VERSION = "facettes-v40"`)
- Test : `tests/donnees.test.mjs` (si un test vérifie les colonnes exportées, y ajouter les deux)

- [ ] **Étape 1 :** test rouge dans `donnees.test.mjs` sur la présence des deux colonnes dans le select exporté (ou dans l'export simulé, selon le style du fichier).
- [ ] **Étape 2 : implémenter** — ajouter `visible_classement, demandes_amis` au select ; texte « Ce qu'on garde » : ajouter « tes réglages de confidentialité (apparaître dans le classement, recevoir des demandes d'ami) » et préciser « Ton pseudo, ton avatar et ton meilleur score sont visibles des autres joueurs connectés, sauf si tu te retires du classement ». SW v40.
- [ ] **Étape 3 : suite complète** — les 11 suites : `for t in amis app apparence classement csp discotheque donnees outils portail profil turnstile; do node tests/$t.test.mjs; done` → 11 `OK`.
- [ ] **Étape 4 : commit** `git commit -am "Tes données : réglages de confidentialité dans l'export et le texte ; v40"`

### Tâche 5 : base réelle (avec l'accord de Ferdinand)

- [ ] **Étape 1 :** demander à Ferdinand l'autorisation d'appliquer la migration au projet Supabase (outil `apply_migration` du plugin Supabase, nom `confidentialite`), ou lui donner le fichier à coller dans l'éditeur SQL.
- [ ] **Étape 2 :** une fois appliquée, lancer `supabase/tests/confidentialite.sql` (`execute_sql`, ou éditeur SQL) → dernière ligne `OK — confidentialite`, aucune donnée laissée (`rollback`).
- [ ] **Étape 3 :** `get_advisors` (sécurité) → aucune nouvelle alerte liée à `profils`, `classement`, `demander_ami`.
- [ ] **Étape 4 :** ledger : résultat du script et des advisors. Publication de l'appli (push + subtree) seulement après, par Ferdinand.
