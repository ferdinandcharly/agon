# Socle sécurité et RGPD — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protéger l'envoi des codes (Turnstile), durcir le navigateur (CSP), et donner à chaque utilisateur l'information, l'export et la conservation limitée de ses données.

**Architecture:** PWA sans framework (HTML/CSS/JS) servie par GitHub Pages ; Supabase (projet `facettes`, ref `hiqymrmygjisqqypbfxp`) pour Auth et Postgres. Le code client reste dans `app/compte.js` (compte) et un nouveau `app/donnees.js` (page « Tes données » + export). La purge est une fonction SQL dans un schéma `private` appelée par `pg_cron`. Les tests sont des scripts Node (Edge headless via CDP) et des blocs SQL annulés, rangés dans `tests/`.

**Tech Stack:** JavaScript sans framework, supabase-js 2.119.2 (auto-hébergé), Cloudflare Turnstile, Postgres 17 + pg_cron 1.6.4, Node 22, Edge headless (CDP).

**Spec:** `docs/superpowers/specs/2026-11-20-securite-rgpd-design.md`

## Global Constraints

- Commentaires et textes en français ; espace insécable (U+00A0) avant `?`, `!`, `:` dans les textes affichés.
- Aucune clé secrète dans le dépôt (public). Clé de site Turnstile publique : `0x4AAAAAAGKGu9RQ0EvSTWc5`.
- Contact RGPD affiché : `facettes.app@gmail.com` ; responsable : Ferdinand Charly.
- Conservation : comptes supprimés après **2 ans sans connexion** (`last_sign_in_at`).
- Jamais d'`innerHTML` / `insertAdjacentHTML` avec une donnée ; toujours le helper `el()` d'`app.js`.
- Fonctions internes dans le schéma `private` (non exposé), `search_path = ''`, `revoke` à `public`, `anon`, `authenticated`.
- L'appli doit rester utilisable hors ligne et sans compte ; Turnstile n'est chargé qu'à l'affichage du formulaire d'e-mail.
- **Ne pas activer** le CAPTCHA dans Supabase avant la mise en ligne de la tâche 3 (sinon plus de connexion possible) : c'est Ferdinand qui l'active à la tâche 5.
- Chaque livraison de la coquille change `VERSION` dans `app/sw.js` et ajoute les nouveaux fichiers à `COQUILLE`.

## Review Focus

1. **Turnstile qui ne charge pas** (réseau d'école filtré, bloqueur de pubs) : on attend un message clair « Vérification anti-robot indisponible… » et un bouton « Recevoir un code » désactivé, pas un envoi sans jeton ni un formulaire figé → test dans la tâche 3 (script Turnstile bloqué par CDP).
2. **Jeton Turnstile expiré ou déjà utilisé** (on renvoie un code après 5 minutes, ou après une erreur) : on attend un nouveau jeton à chaque demande (`turnstile.reset`) → test dans la tâche 3 (deux envois successifs, deux jetons distincts).
3. **Une violation CSP sur un écran peu visité** (Survie, Prise d'otage, arbre, réglages) qui casse silencieusement un style : on attend zéro violation partout → test dans la tâche 2 qui parcourt chaque écran.
4. **Export demandé hors ligne ou avant la première synchro** (pas de ligne `progression` en base) : on attend un fichier avec les données locales et `progression_en_ligne: null`, pas une erreur → test dans la tâche 4.
5. **Purge qui toucherait un compte jamais connecté** (`last_sign_in_at` nul, compte créé mais code jamais saisi) : on attend la suppression seulement si `created_at` a aussi plus de 2 ans → test dans la tâche 1.

---

## File Structure

| Fichier | Rôle |
|---|---|
| `supabase/migrations/2026-11-20-purge-inactifs.sql` (créé) | schéma `private`, fonction `private.purger_comptes_inactifs()`, tâche `pg_cron` |
| `supabase/schema.sql` (modifié) | ajoute la référence de la purge |
| `tests/sql/purge.sql` (créé) | test SQL annulé de la purge |
| `tests/navigateur.mjs` (créé) | lancement Edge headless, CDP, contexte, collecte console/CSP, serveur statique |
| `tests/csp.test.mjs` (créé) | parcours de tous les écrans, zéro violation CSP |
| `tests/turnstile.test.mjs` (créé) | jeton passé à Supabase, renouvelé, panne de chargement |
| `tests/donnees.test.mjs` (créé) | page « Tes données », export en ligne et hors ligne |
| `app/index.html` (modifié) | CSP, referrer, tuiles sans `style=` |
| `app/fil.css` (modifié) | variables des 20 tuiles du lancement ; styles de la page « Tes données » et du widget |
| `app/compte.js` (modifié) | Turnstile sur le formulaire d'e-mail ; lien vers « Tes données » |
| `app/donnees.js` (créé) | `Donnees.ouvrir()` et `Donnees.exporter()` |
| `app/sw.js` (modifié) | `VERSION` `facettes-v20`, `donnees.js` dans `COQUILLE` |
| `supabase/email-code.html` | déjà « Valable 10 minutes » (fait) |

---

### Task 1: Purge des comptes inactifs (2 ans)

**Files:**
- Create: `supabase/migrations/2026-11-20-purge-inactifs.sql`, `tests/sql/purge.sql`
- Modify: `supabase/schema.sql` (ajouter la section « Purge » en fin de fichier)

**Interfaces:**
- Produces: `private.purger_comptes_inactifs() returns integer` (nombre de comptes supprimés) ; tâche cron nommée `purge-comptes-inactifs`, chaque lundi à 03:00 UTC (`0 3 * * 1`).

- [ ] **Step 1: Écrire le test SQL `tests/sql/purge.sql`**

Bloc `do $$ … raise exception 'RESULTAT: …' $$` (annulé) qui crée quatre utilisateurs de test dans `auth.users` (+ une ligne `progression` pour le premier) :
`a` : `last_sign_in_at` = now() − 3 ans → supprimé ;
`b` : `last_sign_in_at` = now() − 1 an → gardé ;
`c` : `last_sign_in_at` nul, `created_at` = now() − 3 ans → supprimé ;
`d` : `last_sign_in_at` nul, `created_at` = now() − 1 jour → gardé.
Appelle `private.purger_comptes_inactifs()` et sort `RESULTAT: supprimes=<n> a=<0|1> b=<0|1> c=<0|1> d=<0|1> progression_a=<0|1>`.
Attendu après implémentation : `supprimes=2 a=0 b=1 c=0 d=1 progression_a=0`.

- [ ] **Step 2: Lancer le test (MCP `execute_sql`, projet `hiqymrmygjisqqypbfxp`) et vérifier qu'il échoue**

Attendu : erreur `function private.purger_comptes_inactifs() does not exist`.

- [ ] **Step 3: Écrire la migration `supabase/migrations/2026-11-20-purge-inactifs.sql` et l'appliquer (MCP `apply_migration`, nom `purge_inactifs`)**

Contenu : `create extension if not exists pg_cron;` ; `create schema if not exists private;` + `revoke all on schema private from public, anon, authenticated;` ; fonction `private.purger_comptes_inactifs()` `security definer`, `set search_path = ''`, qui supprime de `auth.users` les comptes où `coalesce(last_sign_in_at, created_at) < now() - interval '2 years'` et renvoie le nombre ; `revoke execute … from public, anon, authenticated` ; `select cron.schedule('purge-comptes-inactifs', '0 3 * * 1', 'select private.purger_comptes_inactifs()');`.

- [ ] **Step 4: Relancer le test SQL**

Attendu : `RESULTAT: supprimes=2 a=0 b=1 c=0 d=1 progression_a=0`.

- [ ] **Step 5: Vérifier la tâche cron et les conseillers**

`select jobname, schedule, active from cron.job;` → une ligne `purge-comptes-inactifs | 0 3 * * 1 | true`.
MCP `get_advisors` sécurité → pas de nouvel avertissement sur `private.*` (seul `supprimer_mon_compte` reste, voulu).

- [ ] **Step 6: Reporter la section dans `supabase/schema.sql` et commiter**

```bash
git add supabase/migrations supabase/schema.sql tests/sql/purge.sql
git commit -m "Purge hebdomadaire des comptes inactifs depuis 2 ans (pg_cron, schéma private)"
```

---

### Task 2: CSP et lancement sans styles en ligne

**Files:**
- Create: `tests/navigateur.mjs`, `tests/csp.test.mjs`
- Modify: `app/index.html:5-20` (balises `<meta>`), `app/index.html:27` (SVG du lancement), `app/fil.css:456-460` (règle `.f-lancement-logo .tuile`)

**Interfaces:**
- Produces (`tests/navigateur.mjs`) :
  - `async demarrerServeur(racine = "app", port = 8765) → { url, arreter() }` (serveur statique Node, pas Python, pour pouvoir l'arrêter proprement) ;
  - `async lancerEdge() → { nouvelAppareil({ largeur, hauteur, mobile }) → Appareil, fermer() }` ;
  - `Appareil` : `aller(url)`, `evaluer(expr)` (attend les promesses, renvoie la valeur), `cliquer(selecteur)`, `couperReseau(bool)`, `bloquerUrls(motifs[])`, `requetes` (liste `{ url, methode, corps }` des requêtes sortantes), `violationsCsp` (liste des messages console contenant « Content Security Policy »), `erreurs` (exceptions + console.error), `capture(chemin)`.
  - Chemin d'Edge : `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` ; viewport par `Emulation.setDeviceMetricsOverride` (Edge headless ne descend pas sous ~500 px sinon).

- [ ] **Step 1: Écrire `tests/navigateur.mjs` puis `tests/csp.test.mjs`**

`csp.test.mjs` : sert `app/`, ouvre un appareil iPhone (390×844, mobile) et un PC (1280×800) ; sur chacun : accueil (attendre la fin du lancement), toucher la boule → arbre, retour, « Lancer la session » → faire défiler 12 cartes (dont une Prise d'otage), retour, « Mode survie » → « C'est parti » → répondre faux, ouvrir les réglages. Assertions finales :
```js
assert.deepEqual(appareil.violationsCsp, []);
assert.deepEqual(appareil.erreurs, []);
assert.equal(await appareil.evaluer(`document.querySelectorAll("[style]").length === document.querySelectorAll("[style]:not(.tuile)").length`), true);
```
Plus une capture du lancement à 300 ms (`tests/captures/lancement.png`, dossier ignoré par git) pour contrôle visuel.

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `node tests/csp.test.mjs`
Attendu : avant la CSP, le test passe sur les violations (aucune CSP) ; ajouter d'abord la balise CSP (step 3) puis relancer : FAIL avec des violations `style-src` sur les 20 `.tuile`.

- [ ] **Step 3: Ajouter dans `<head>` de `app/index.html`**

`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://hiqymrmygjisqqypbfxp.supabase.co; frame-src https://challenges.cloudflare.com; img-src 'self' data:; style-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'">` et `<meta name="referrer" content="no-referrer">`.

- [ ] **Step 4: Déplacer `--i`, `--dx`, `--dy` des 20 `<rect class="tuile" style=…>` vers `app/fil.css`**

Une règle par tuile : `.f-lancement-logo .tuile:nth-of-type(N) { --i: …; --dx: …; --dy: …; }` avec exactement les valeurs actuelles de `index.html` (N = 1 à 20 dans l'ordre du SVG) ; retirer les attributs `style` du SVG.

- [ ] **Step 5: Relancer le test**

Run: `node tests/csp.test.mjs`
Attendu : `OK — 0 violation CSP, 0 erreur (iPhone, PC)` ; la capture montre les tuiles dispersées comme avant.

- [ ] **Step 6: Commit**

```bash
git add app/index.html app/fil.css tests/navigateur.mjs tests/csp.test.mjs .gitignore
git commit -m "CSP stricte et referrer ; tuiles du lancement sans style en ligne ; outil de test navigateur"
```
(`.gitignore` : ajouter `tests/captures/`.)

---

### Task 3: Turnstile sur l'envoi du code

**Files:**
- Create: `tests/turnstile.test.mjs`
- Modify: `app/compte.js` (formulaire d'e-mail dans `dessiner()`, `envoyerCode`), `app/fil.css` (zone du widget)

**Interfaces:**
- Consumes: `tests/navigateur.mjs` (tâche 2).
- Produces (dans `compte.js`) :
  - `const TURNSTILE_CLE = "0x4AAAAAAGKGu9RQ0EvSTWc5"` ; sur `localhost` uniquement, le paramètre d'URL `?turnstile=ok` ou `?turnstile=ko` remplace la clé par la clé de test Cloudflare `1x00000000000000000000AA` (passe toujours) ou `2x00000000000000000000AB` (échoue toujours) ;
  - `chargerTurnstile() → Promise<void>` : ajoute une seule fois `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit">`, rejette après 8 s ou sur `error` ;
  - `envoyerCode(email, jeton)` : `signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken: jeton } })`.

- [ ] **Step 1: Écrire `tests/turnstile.test.mjs`**

Trois scénarios sur `http://localhost:8765/?turnstile=ok` (un appareil iPhone) :
1. **jeton transmis** : ouvrir Réglages → Compte, saisir `test@facettes.test`, attendre que le bouton « Recevoir un code » soit actif, cliquer ; dans `appareil.requetes`, la requête `POST …/auth/v1/otp` a un corps dont `gotrue_meta_security.captcha_token` est une chaîne non vide.
2. **jeton renouvelé** : cliquer « Changer d'adresse », renvoyer un code ; les deux `captcha_token` sont différents.
3. **Turnstile indisponible** : nouvel appareil avec `bloquerUrls(["*challenges.cloudflare.com*"])` ; après 9 s, le texte `Vérification anti-robot indisponible` est présent dans `#compte`, le bouton « Recevoir un code » est `disabled`, et aucune requête `/auth/v1/otp` n'est partie.
(Le CAPTCHA n'est pas encore activé côté Supabase : la réponse du serveur au scénario 1 peut être un succès ou une limite d'envoi ; le test ne juge que la requête envoyée. Utiliser une adresse `@facettes.test` qui n'existe pas — Supabase n'envoie pas d'e-mail à un domaine sans MX ; si l'envoi échoue, c'est sans effet sur le test.)

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `node tests/turnstile.test.mjs`
Attendu : FAIL scénario 1 (`captcha_token` absent).

- [ ] **Step 3: Implémenter dans `compte.js`**

Dans le formulaire d'e-mail : une zone `div.f-turnstile` sous le champ ; le bouton « Recevoir un code » est désactivé tant qu'aucun jeton n'est reçu ; `chargerTurnstile()` puis `turnstile.render(zone, { sitekey, size: "flexible", theme: "light", callback: (jeton) => …, "expired-callback": …, "error-callback": … })` ; à l'envoi, passer le jeton puis `turnstile.reset(widgetId)` dans tous les cas (succès ou échec) ; si le chargement échoue : message « Vérification anti-robot indisponible : réessaie avec une autre connexion (sans bloqueur) ». Ajouter à `messageErreur` le cas `code === "captcha_failed"` → « La vérification anti-robot a échoué. Réessaie. »
Ajouter aussi, sous le formulaire, le lien « Tes données » (bouton `f-lien`) qui appelle `Donnees.ouvrir()` s'il existe (tâche 4).

- [ ] **Step 4: Relancer**

Run: `node tests/turnstile.test.mjs` puis `node tests/csp.test.mjs`
Attendu : `OK` aux trois scénarios ; CSP toujours sans violation (le widget est autorisé par `script-src` et `frame-src`).

- [ ] **Step 5: Commit**

```bash
git add app/compte.js app/fil.css tests/turnstile.test.mjs
git commit -m "Turnstile sur l'envoi du code de connexion (jeton renouvelé à chaque envoi, message si indisponible)"
```

---

### Task 4: Page « Tes données » et export

**Files:**
- Create: `app/donnees.js`, `tests/donnees.test.mjs`
- Modify: `app/index.html` (script `donnees.js` après `compte.js` ; `<dialog id="donnees">` vide), `app/compte.js` (bouton « Tes données » et « Exporter mes données » dans la vue connecté), `app/fil.css` (dialogue réutilisant `.f-reglages`)

**Interfaces:**
- Consumes: `Compte` (`compte.js`) — ajouter `Compte.client()` → le client supabase-js ou `null`, et `Compte.utilisateur()` → l'utilisateur connecté ou `null` ; `lireResultats`, `lireReglages`, `lireCollection`, `lireRecordSurvie`, `el` (`app.js`).
- Produces: `Donnees.ouvrir()` (affiche le dialogue) ; `Donnees.exporter() → Promise<object>` qui télécharge `facettes-mes-donnees.json` et renvoie l'objet exporté :
  `{ exporte_le, compte: { email, cree_le } | null, progression_en_ligne: { resultats, reglages, collection, survie, maj } | null, appareil: { resultats, reglages, collection, survie } }`.

- [ ] **Step 1: Écrire `tests/donnees.test.mjs`**

Avec un compte de test créé en SQL (mot de passe `crypt`, comme le test de synchro du 20/11 ; connexion par `signInWithPassword` dans un second client, puis rechargement) :
1. Réglages → « Tes données » : le dialogue contient `facettes.app@gmail.com`, `2 ans`, `Paris`, `15 ans`, et les boutons « Exporter mes données » et « Supprimer mon compte ».
2. En ligne : `await Donnees.exporter()` renvoie `compte.email === "test-donnees@facettes.test"` et `progression_en_ligne.resultats` égal aux résultats locaux après synchro.
3. Hors ligne (`couperReseau(true)`) : `exporter()` renvoie `progression_en_ligne === null` et `appareil.resultats` non vide, sans exception.
4. Sans compte (nouvel appareil) : le dialogue s'ouvre depuis le lien du formulaire de connexion ; `exporter()` renvoie `compte === null`.
Fin : suppression du compte de test en SQL.

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `node tests/donnees.test.mjs`
Attendu : FAIL (`Donnees is not defined`).

- [ ] **Step 3: Implémenter `app/donnees.js`**

Texte exact du dialogue (titre « Tes données ») :
- « **Ce qu'on garde** : ton adresse e-mail, ta progression (réponses, réglages), ta collection de vinyles et ton record. Sans compte, rien ne quitte ton appareil. »
- « **Pourquoi** : retrouver ta progression sur tous tes appareils. Pas de publicité, pas de mesure d'audience, pas de revente. »
- « **Où** : chez Supabase, sur des serveurs à Paris. Les codes de connexion sont envoyés par e-mail ; une vérification anti-robot de Cloudflare protège leur envoi. »
- « **Combien de temps** : tant que ton compte existe. Un compte sans connexion pendant 2 ans est supprimé automatiquement. »
- « **Tes droits** : exporter ou supprimer tes données avec les boutons ci-dessous. Pour toute autre demande : facettes.app@gmail.com (responsable : Ferdinand Charly). »
- « Facettes s'adresse aux étudiants. Avant 15 ans, demande l'accord d'un parent. »
Boutons : « Exporter mes données » (`exporter()`, désactivé pendant l'export, message d'erreur sous le bouton), « Fermer ». L'export lit `progression` avec `maybeSingle()` ; toute erreur réseau donne `progression_en_ligne: null` ; téléchargement par `Blob` + lien temporaire `download`.

- [ ] **Step 4: Relancer les tests**

Run: `node tests/donnees.test.mjs` puis `node tests/csp.test.mjs`
Attendu : `OK` partout.

- [ ] **Step 5: Commit**

```bash
git add app/donnees.js app/index.html app/compte.js app/fil.css tests/donnees.test.mjs
git commit -m "Page « Tes données » (RGPD) et export JSON de ses données"
```

---

### Task 5: Livraison et activation du CAPTCHA

**Files:**
- Modify: `app/sw.js` (`VERSION = "facettes-v20"`, ajouter `"donnees.js"` à `COQUILLE`), `README.md` (section « Sécurité et données » : CSP, Turnstile, purge, export, liste « avant le grand public » renvoyant à la spec)

- [ ] **Step 1: Tous les tests**

Run: `node tests/csp.test.mjs && node tests/turnstile.test.mjs && node tests/donnees.test.mjs` + `tests/sql/purge.sql` via MCP.
Attendu : tout `OK` ; conseillers Supabase sécurité et performance sans nouvel avertissement.

- [ ] **Step 2: Version, README, commit**

```bash
git add app/sw.js README.md
git commit -m "Socle sécurité et RGPD : version v20, documentation"
```

- [ ] **Step 3: Mise en ligne (Ferdinand)**

`! git -C /c/Claude/agon push origin main` puis `! cd /c/Claude/agon && git subtree push --prefix app origin gh-pages` ; vérifier que `https://ferdinandcharly.github.io/agon/sw.js` contient `facettes-v20`.

- [ ] **Step 4: Activation du CAPTCHA (Ferdinand, seulement après le step 3)**

Supabase → Authentication → Attack Protection → Enable CAPTCHA protection → Turnstile → clé secrète → Save.

- [ ] **Step 5: Vérification réelle (Ferdinand, sur iPhone)**

Se déconnecter, se reconnecter : le widget apparaît, le code arrive, la connexion réussit. En cas d'échec : désactiver le CAPTCHA dans Supabase (retour immédiat à l'état d'avant) et transmettre le message affiché.
