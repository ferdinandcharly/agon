# Classement Survie (profil + classement général) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque joueur connecté choisit un pseudo, ses parties de Survie sont publiées, et un écran « Classement » montre « Cette semaine » et « Record ».

**Architecture:** Deux tables privées (`profils`, `parties_survie`) et une fonction `public.classement` qui ne renvoie que rang/pseudo/score. Côté appli : `compte.js` gère le pseudo et une file d'envoi locale des parties (`agon.parties`) vidée à la synchro ; nouveau `classement.js` pour l'écran ; `app.js` ne fait qu'appeler `Compte.publierPartie(score)` et `Classement.ouvrir()`.

**Tech Stack:** JavaScript sans framework, supabase-js 2.119.2 auto-hébergé, Postgres 17 (RLS, triggers, `security definer`), Node 22 + Edge headless (CDP) via `tests/navigateur.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-20-classement-survie-design.md` (et ses règles générales : `docs/superpowers/specs/2026-11-20-securite-rgpd-design.md` §3)

## Global Constraints

- Commentaires et textes en français ; espace insécable (U+00A0) avant `?`, `!`, `:` dans les textes affichés ; jamais d'`innerHTML`, toujours `el()`.
- Pseudo : `^[A-Za-z0-9_-]{3,20}$`, unique sans tenir compte de la casse. Score : 0 à 300. Parcours par défaut : `but-info-1`.
- Semaine = depuis lundi 0 h, heure de Paris (`date_trunc('week', now() at time zone 'Europe/Paris')`). Top 50 + ligne du joueur.
- Les parties et profils des autres ne se lisent **jamais** en direct ; seulement par `public.classement`.
- CAPTCHA actif : aucun test navigateur ne peut connecter un compte. Logique serveur → tests SQL qui simulent les rôles (`set local role` + `request.jwt.claims`) ; écran → tests navigateur sans compte, hors ligne et avec cache ; parcours connecté → vérification manuelle de Ferdinand (tâche 5). Ne jamais créer de session en SQL.
- Toute livraison change `VERSION` dans `app/sw.js` (→ `facettes-v21`) et ajoute les nouveaux fichiers à `COQUILLE` ; la CSP de `index.html` ne change pas.
- **Écart à la spec (décidé)** : la limite anti-abus compare les `joue_le` (heure de fin de partie) et non l'heure d'insertion, avec un écart minimal de **5 s** (et 300 parties par jour) — sinon les parties jouées hors ligne, envoyées ensemble, seraient refusées.

## Review Focus

1. **Parties jouées hors ligne puis envoyées d'un coup** : on attend qu'elles soient toutes acceptées (écarts de `joue_le` réels) et comptées une seule fois même si l'envoi est rejoué → test SQL tâche 1 (trois parties à 30 s d'écart insérées dans la même transaction ; réinsertion du même `id` ignorée).
2. **Changement de semaine** : une partie de dimanche 23 h 30 (Paris) ne doit plus compter le lundi → test SQL tâche 1 (partie datée de `debut_semaine - 30 min` absente de `semaine`, présente dans `record`).
3. **Pseudo pris avec une autre casse** (« Ferdi » contre « ferdi ») : refus clair « Déjà pris », pas une erreur brute → test SQL tâche 1 (index) + test navigateur tâche 3 sur le message (fonction `messagePseudo` pure).
4. **Classement ouvert hors ligne sans cache** ou **cache d'une autre semaine** : message clair, et la date du cache affichée → test navigateur tâche 4.
5. **Ex-aequo et joueur hors du top 50** : rangs justes (le premier arrivé devant), ligne du joueur ajoutée en bas sans doublon → test SQL tâche 1 et rendu tâche 4.

---

## File Structure

| Fichier | Rôle |
|---|---|
| `supabase/migrations/2026-11-20-classement.sql` (créé) | tables, index, RLS, droits par colonne, trigger `private.verifier_partie`, fonction `public.classement` |
| `supabase/schema.sql` (modifié) | section « Classement » de référence |
| `tests/sql/classement.sql` (créé) | droits, limites, classement (rôles simulés, tout annulé) |
| `app/app.js` (modifié) | Survie sur toutes les matières ; `Compte.publierPartie` ; boutons « Classement » |
| `app/compte.js` (modifié) | pseudo, file `agon.parties`, envoi à la synchro, `Compte.profil()`, `messagePseudo` |
| `app/classement.js` (créé) | écran, onglets, cache `agon.classement`, rendu |
| `app/donnees.js` (modifié) | texte RGPD (pseudo, parties) ; export du profil et des parties |
| `app/index.html`, `app/fil.css`, `app/sw.js`, `README.md` (modifiés) | script, styles, version v21, doc |
| `tests/classement.test.mjs` (créé) | écran sans compte, hors ligne, rendu depuis le cache, Survie toutes matières |

---

### Task 1: Base de données du classement

**Files:**
- Create: `supabase/migrations/2026-11-20-classement.sql`, `tests/sql/classement.sql`
- Modify: `supabase/schema.sql` (section « Classement » en fin de fichier)

**Interfaces:**
- Produces (PostgREST) : table `profils(user_id, pseudo, cree_le)` ; table `parties_survie(id uuid, user_id, score int, parcours text, joue_le timestamptz)` ; RPC `classement(periode text, p_parcours text default 'but-info-1') returns table(rang int, pseudo text, score int, moi boolean)`.
- Erreurs utiles au client : doublon de pseudo → `23505` ; pseudo hors format → `23514` ; partie refusée par le trigger → `P0001` avec un message commençant par `partie refusée :`.

- [ ] **Step 1: Écrire `tests/sql/classement.sql`**

Un bloc `do $$ … raise exception 'RESULTAT: …' $$` (annulé) qui crée 3 utilisateurs (`u1`, `u2`, `u3`) dans `auth.users`, puis vérifie, en jouant chaque rôle avec `set local role authenticated` + `set_config('request.jwt.claims', json_build_object('sub', <id>, 'role','authenticated')::text, true)` (et `set local role anon`) :
- `profil_autre` : u1 ne peut pas insérer un profil pour u2 (attendu `refuse`) ;
- `casse` : u2 qui prend `FERDI` après u1 `Ferdi` → `refuse` (23505) ;
- `format` : pseudo `a b` → `refuse` ;
- `colonne` : u1 `update profils set user_id = …` → `refuse` (droit par colonne) ; `update … set pseudo` → `ok` ;
- `lecture` : u2 voit 0 profil et 0 partie de u1 en direct ;
- `score` : score 301 → `refuse` ; `futur` : `joue_le = now() + 1 hour` → `refuse` ; `ancien` : `now() - 31 days` → `refuse` ;
- `rafale` : deux parties de u1 à 2 s d'écart → la seconde `refuse` ; `horsligne` : trois parties de u2 à 30 s d'écart insérées d'affilée → 3 acceptées ;
- `doublon` : réinsertion du même `id` avec `on conflict do nothing` → toujours 1 ligne ;
- `semaine` : u3 a 40 (lundi courant 0 h − 30 min, donc semaine précédente) et 12 (cette semaine) → `classement('semaine')` donne 12 pour u3, `classement('record')` donne 40 ;
- `egalite` : u1 et u2 au même meilleur score, u1 plus tôt → u1 rang 1, u2 rang 2 ;
- `moi` : appelé en u2, une seule ligne `moi = true` ;
- `anon` : `select from classement('record')` sous `anon` → `refuse` ;
- `periode` : `classement('mois')` → `refuse`.
Sortie : `RESULTAT: profil_autre=refuse casse=refuse format=refuse colonne=refuse/ok lecture=0/0 score=refuse futur=refuse ancien=refuse rafale=refuse horsligne=3 doublon=1 semaine=12 record=40 egalite=1/2 moi=1 anon=refuse periode=refuse` (attendu exact).
Pour le cas « hors du top 50 », un second bloc crée 55 joueurs avec profils et parties (scores 100 à 46) et un joueur `dernier` à 1 : appelé en `dernier`, `classement('record')` renvoie 51 lignes, la dernière `rang=56, moi=true` → `RESULTAT: lignes=51 dernier_rang=56`.

- [ ] **Step 2: Lancer les deux blocs (MCP `execute_sql`) et vérifier l'échec**

Attendu : `relation "public.profils" does not exist`.

- [ ] **Step 3: Écrire et appliquer la migration (MCP `apply_migration`, nom `classement`)**

Tables et index exactement comme la spec §1 ; RLS sur les deux tables ; `revoke all … from anon, authenticated` ; `grant select, insert on profils to authenticated` + `grant update (pseudo) on profils to authenticated` ; `grant select, insert on parties_survie to authenticated` ; policies `select`/`insert`/`update` sur `(select auth.uid()) = user_id` (update avec `using` + `with check`).
Trigger `before insert on parties_survie` → `private.verifier_partie()` (`security invoker`, `search_path = ''`), messages préfixés `partie refusée :` : `joue_le` hors de [now() − 30 jours, now() + 5 min] ; une partie du même `user_id` à moins de 5 s de `new.joue_le` (en valeur absolue) ; 300 parties ou plus du même `user_id` dans les 24 h précédant `new.joue_le`. `revoke execute` sur la fonction de trigger pour `public`, `anon`, `authenticated`.
`public.classement` : `security definer`, `search_path = ''`, `language sql` ou `plpgsql`, `stable` ; exception si `auth.uid()` est nul ou si `periode not in ('semaine','record')` ; meilleur score par joueur via `distinct on (user_id) … order by user_id, score desc, joue_le asc`, puis **`row_number() over (order by score desc, joue_le asc)`** (rangs distincts : à égalité, le premier arrivé devant) ; jointure sur `profils` (sans profil = absent) ; renvoie les 50 premiers + la ligne `moi` si absente. `revoke execute … from public, anon` ; `grant execute … to authenticated`.

- [ ] **Step 4: Relancer les deux blocs**

Attendu : les deux lignes `RESULTAT` exactes du step 1.

- [ ] **Step 5: Conseillers et commit**

MCP `get_advisors` sécurité : seul nouvel avertissement accepté = `public.classement` (security definer appelable, voulu). Performance : aucun.
```bash
git add supabase/migrations/2026-11-20-classement.sql supabase/schema.sql tests/sql/classement.sql
git commit -m "Classement : profils, parties de Survie, limites anti-abus et fonction de classement (RLS testée)"
```

---

### Task 2: Survie sur toutes les matières et file d'envoi des parties

**Files:**
- Modify: `app/app.js` (`creerEcranSurvie` : pool et texte de départ ; `finir` : appel `Compte.publierPartie`), `app/compte.js` (file, envoi dans `synchroniser`)
- Create: `tests/classement.test.mjs` (premier scénario)

**Interfaces:**
- Produces (`compte.js`) : `Compte.publierPartie(score: number): void` ; clé locale `agon.parties` = `[{ id, score, joue_le }]` ; dans `synchroniser()`, après l'upsert de `progression` et seulement si `Compte.profil()` existe : `sb.from("parties_survie").upsert(file, { onConflict: "id", ignoreDuplicates: true })` ; retire les parties envoyées ; si l'erreur a le code `P0001` (trigger) ou `23514` (check), retire aussi ces parties et écrit un `console.warn` ; toute autre erreur les garde.
- Produces : `Compte.profil(): { pseudo } | null` (rempli à la synchro par `select pseudo from profils` sur soi).

- [ ] **Step 1: Scénario 1 de `tests/classement.test.mjs` — Survie toutes matières, sans compte**

Sans compte, exclure toutes les matières sauf `eco` dans `agon.reglages`, ouvrir le mode Survie : le texte de l'écran de départ contient `Toutes les matières` et annonce un nombre de questions égal au nombre de cartes `vrai_faux`/`trous` valides **toutes matières** (calculé dans le test depuis `data/contenus.json` + `FacettesValidation`) ; après une partie perdue, `localStorage.getItem("agon.parties")` est `null` (sans compte, rien n'est mis en file).

- [ ] **Step 2: Lancer — échec attendu**

Run: `node tests/classement.test.mjs`
Attendu : FAIL (le nombre annoncé ne compte que l'Économie).

- [ ] **Step 3: Implémenter** — pool de `creerEcranSurvie` sans filtre de matières (formats `vrai_faux`/`trous`, `contenuValide`) ; texte « Toutes les matières, pour que les records se comparent : N questions. » ; dans `finir`, `if (typeof Compte !== "undefined") Compte.publierPartie(points)` ; `publierPartie` ne fait rien sans utilisateur connecté, sinon ajoute `{ id: crypto.randomUUID(), score, joue_le: new Date().toISOString() }` à la file puis `programmer()`.

- [ ] **Step 4: Relancer** `node tests/classement.test.mjs` puis `node tests/csp.test.mjs` — Attendu : OK.

- [ ] **Step 5: Commit**
```bash
git add app/app.js app/compte.js tests/classement.test.mjs
git commit -m "Survie classée sur toutes les matières ; file d'envoi des parties (agon.parties)"
```

---

### Task 3: Pseudo dans la section Compte

**Files:**
- Modify: `app/compte.js` (`dessiner()` vue connectée ; création/changement de pseudo)
- Modify: `tests/classement.test.mjs` (scénario 2)

**Interfaces:**
- Produces : `Compte.messagePseudo(pseudo: string, erreur?: { code }) → string | null` (pure) : `null` si valide et sans erreur ; `"3 à 20 caractères : lettres, chiffres, _ et -."` si le format est faux ; `"Déjà pris : essaie un autre pseudo."` si `erreur.code === "23505"` ; sinon `messageErreur(erreur)`.
- Comportement : connecté sans profil → formulaire « Choisis ton pseudo » (champ + « Valider ») au-dessus des boutons existants ; création par `insert into profils (pseudo)` ; si un record local > 0 existe, l'ajouter à la file comme partie datée de maintenant, puis `synchroniser()`. Connecté avec profil → « Pseudo : <b>X</b> » + bouton « Changer » (même formulaire, `update profils set pseudo`).

- [ ] **Step 1: Scénario 2** — sur la page, `Compte.messagePseudo` : `"ab"` → message de format ; `"Ferdi"` → `null` ; `"a b"` → message de format ; `"Ferdi", { code: "23505" }` → `"Déjà pris : essaie un autre pseudo."` (avec l'insécable avant `:`).
- [ ] **Step 2: Lancer — échec** (`Compte.messagePseudo is not a function`).
- [ ] **Step 3: Implémenter** `messagePseudo`, le formulaire et `Compte.profil()` lu à chaque synchro.
- [ ] **Step 4: Relancer** `node tests/classement.test.mjs` et `node tests/turnstile.test.mjs` — Attendu : OK.
- [ ] **Step 5: Commit**
```bash
git add app/compte.js tests/classement.test.mjs
git commit -m "Pseudo : choix, changement, « Déjà pris », publication du record local à la création"
```

---

### Task 4: Écran « Classement »

**Files:**
- Create: `app/classement.js`
- Modify: `app/index.html` (`<section class="f-accueil f-classement cache" id="classement">` + script après `donnees.js`), `app/app.js` (bouton « Classement » à côté de « Mode survie » ; « Voir le classement » en fin de Survie ; masquer `#classement` comme `#arbre` dans `afficherAccueil`/`montrerFil`), `app/fil.css`
- Modify: `tests/classement.test.mjs` (scénarios 3 à 5)

**Interfaces:**
- Produces : `Classement.ouvrir(periode = "semaine")` ; `Classement.rendre(lignes, { periode, date, debut, horsLigne })` (pure, renvoie l'élément à afficher : bandeau + liste) ; cache local `agon.classement` = `{ semaine: { lignes, date, debut }, record: { lignes, date } }` où `debut` = date ISO du lundi de la semaine concernée ; `Classement.rangCetteSemaine() → Promise<number|null>` pour la fin de Survie (null sans compte ou hors ligne).
- Comportement : sans compte → « Connecte-toi pour apparaître dans le classement. » + bouton qui ouvre les réglages ; connecté sans pseudo → « Choisis un pseudo pour apparaître. » + même bouton ; en ligne → `sb.rpc("classement", { periode })`, rendu, mise en cache ; erreur réseau ou hors ligne → cache s'il existe (« Hors ligne : classement du <date> ») sinon « Classement indisponible hors ligne. » ; autre erreur → message + « Réessayer ». Onglet semaine : un cache dont `debut` n'est pas le lundi courant est affiché avec « (semaine dernière) ». Ligne `moi` : classe `moi` ; rangs 1 à 3 : classes `or`, `rose`, `bleu` ; si la ligne `moi` a un rang > 50, un séparateur « … » la précède.
- Fin de Survie : après l'envoi, si `rangCetteSemaine()` ≤ 10, une ligne « 3ᵉ cette semaine ! » (1 → « 1ʳᵉ », sinon « Nᵉ »).

- [ ] **Step 1: Scénarios 3 à 5**
3. Sans compte : bouton « Classement » de l'accueil → texte `Connecte-toi pour apparaître` ; son bouton ouvre `#reglages`.
4. Rendu hors ligne (sans compte, l'écran s'arrête au message : le rendu se teste donc directement) : `Classement.rendre(lignes, { periode: "semaine", date, debut: <lundi courant>, horsLigne: true })` avec 3 lignes + une ligne `moi` rang 63 → 4 lignes, la 1re a la classe `or`, la dernière la classe `moi` et le texte `63`, un séparateur `…` la précède, et le bandeau contient `Hors ligne`.
5. Cache d'une autre semaine : `rendre` avec `debut` du lundi précédent → le bandeau contient `semaine dernière`.
Captures `tests/captures/classement-iPhone.png` (rendu du scénario 4) pour contrôle visuel.
- [ ] **Step 2: Lancer — échec** (`.f-bouton-classement` introuvable).
- [ ] **Step 3: Implémenter** `classement.js`, les boutons et les styles (podium disco, ligne `moi` en surbrillance, onglets accessibles `role="tablist"`).
- [ ] **Step 4: Relancer** `node tests/classement.test.mjs`, `node tests/csp.test.mjs` — Attendu : OK, 0 violation CSP.
- [ ] **Step 5: Commit**
```bash
git add app/classement.js app/index.html app/app.js app/fil.css tests/classement.test.mjs
git commit -m "Écran Classement : semaine et record, podium, ta place, hors ligne avec le dernier classement"
```

---

### Task 5: Données personnelles, livraison et vérification connectée

**Files:**
- Modify: `app/donnees.js` (texte « Ce qu'on garde » : « …ton record, ton pseudo et tes parties de Survie (score et date). Ton pseudo et ton meilleur score sont visibles des autres joueurs connectés. » ; export : `profil` et `parties` lus en ligne comme `progression`, `null` hors ligne ; `appareil.parties_en_attente` = `agon.parties`), `app/compte.js` (suppression du compte : vider `agon.parties`), `app/sw.js` (`facettes-v21`, `classement.js` dans `COQUILLE`), `README.md`, `tests/donnees.test.mjs` (scénario sans compte : `appareil.parties_en_attente` vaut `[]`)

- [ ] **Step 1: Test** — dans `tests/donnees.test.mjs`, ne garder que les scénarios exécutables avec le CAPTCHA actif (sans compte, export local) et ajouter : `sansCompte.appareil.parties_en_attente` deep-equal `[]` et le dialogue contient `pseudo`. Lancer : échec attendu.
- [ ] **Step 2: Implémenter**, relancer `node tests/donnees.test.mjs` — OK.
- [ ] **Step 3: Suite complète** — `node tests/csp.test.mjs && node tests/turnstile.test.mjs && node tests/donnees.test.mjs && node tests/classement.test.mjs` + les deux blocs de `tests/sql/classement.sql` et `tests/sql/purge.sql` : tout OK.
- [ ] **Step 4: Commit**
```bash
git add app/donnees.js app/compte.js app/sw.js README.md tests/donnees.test.mjs
git commit -m "Classement : données personnelles (pseudo, parties) dans Tes données et l'export ; version v21"
```
- [ ] **Step 5: Mise en ligne (Ferdinand)** — `! git -C /c/Claude/agon push origin main` puis `! cd /c/Claude/agon && git subtree push --prefix app origin gh-pages` ; Claude vérifie `facettes-v21` en ligne.
- [ ] **Step 6: Vérification connectée (Ferdinand, iPhone, ~3 min)** — (a) Réglages → Compte : le formulaire « Choisis ton pseudo » apparaît ; « ferdi » si un ami a déjà « Ferdi » → « Déjà pris » ; valider un pseudo. (b) Accueil → Classement : ton record local apparaît, ta ligne en surbrillance. (c) Jouer une partie de Survie, « Voir le classement » : l'onglet semaine est à jour. (d) Mode avion, rouvrir Classement : « Hors ligne : classement du … ». (e) Réglages → Tes données → Exporter : le fichier contient `profil` et `parties`. Claude contrôle ensuite en SQL que les lignes existent et qu'aucune erreur n'apparaît dans les journaux Supabase.
