# Discothèque et cases « À venir » / « DS passé » — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer « Ton arbre » par un bac à disques (une matière = un album, une notion = une piste) et ajouter les cases « À venir » / « DS passé » qui agissent sur le fil.

**Architecture:** Les cases vivent dans les réglages locaux (`reglages.notions`), donc dans la synchro existante. `app.js` applique leurs effets (`contenusRetenus`, `ordonner`) et gagne deux modes de fil ciblés. Un nouveau `app/discotheque.js` dessine le bac, les pistes et les cases ; il remplace `remplirArbre`/`ouvrirArbre`.

**Tech Stack:** JavaScript sans framework, CSS (scroll-snap), Node 22 + Edge headless (`tests/navigateur.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-20-discotheque-design.md`

## Global Constraints

- Commentaires et textes en français ; espace insécable avant `?`, `!`, `:` ; jamais d'`innerHTML` ; aucun attribut `style` (CSP) : variables CSS par `element.style.setProperty`.
- Clé d'une notion : `` `${matiere}/${notion}` `` ; valeurs : `"a_venir"` ou `"ds_passe"` ; absente = normal ; les deux s'excluent.
- « À venir » sort la notion de `contenusRetenus()` (fil normal, Prise d'otage, Tube du jour). « DS passé » place ses cartes après toutes les autres dans `ordonner()`. La Survie et les fils ciblés ignorent les cases. Les fils ciblés gardent l'exclusion des formats.
- Libellés exacts : « Ta discothèque », « ▶ Réviser l'album », « À venir », « DS passé », « N à revoir », « N à venir ».
- Tests sans compte (CAPTCHA) ; la synchro des cases entre appareils est vérifiée à la main.
- Livraison : `VERSION` `facettes-v22`, `discotheque.js` dans `COQUILLE`.

## Review Focus

1. **Notion cochée « À venir » puis renommée ou supprimée du fichier de cartes** : la clé orpheline ne doit rien casser (ignorée au rendu, sans erreur) → test tâche 1 (clé inconnue dans `reglages.notions`).
2. **Toutes les notions d'une matière « À venir »** : le fil normal ne doit pas planter ni montrer « Aucune carte » si d'autres matières restent ; si plus rien ne reste, `carteVide` habituelle → test tâche 1.
3. **Glisser vite le bac sur iPhone** (élan) : l'album courant doit correspondre à la pochette centrée à l'arrêt, sans pistes d'un autre album → test tâche 3 (défilement programmatique de plusieurs pochettes puis vérification après stabilisation).
4. **Fil ciblé d'une notion sans jeux (fiches seulement) ou dont tous les formats sont exclus** : carte « Aucune carte » propre avec retour à la discothèque → test tâche 2.
5. **Réglages d'un autre appareil sans `notions`** (version plus ancienne) : la fusion ne doit pas effacer les cases locales si les réglages locaux sont plus récents, et ne pas planter s'ils sont plus anciens → test tâche 1 (`Compte.fusionReglages`).

---

## File Structure

| Fichier | Rôle |
|---|---|
| `app/app.js` (modifié) | `lireReglages` (+ `notions`), `etatCase(matiere, notion)`, `basculerCase`, `contenusRetenus`, `ordonner`, `montrerFil(mode, cible)`, fils ciblés ; retrait de l'arbre |
| `app/compte.js` (modifié) | `fusionReglages(local, distant)` pure (exposée) utilisée par `fusionner` |
| `app/discotheque.js` (créé) | `Discotheque.ouvrir(matiere?)`, `ordreAlbums`, `pastilleAlbum`, `fractionVinyle`, rendu bac + pistes + cases |
| `app/index.html` (modifié) | `#arbre` → `#discotheque` ; script `discotheque.js` |
| `app/fil.css` (modifié) | bac, pochettes, vinyle, pistes, pastilles |
| `app/sw.js`, `README.md` (modifiés) | v22, doc |
| `tests/discotheque.test.mjs` (créé) | tous les scénarios |

---

### Task 1: Cases dans les réglages et leurs effets

**Files:** Modify `app/app.js` (`lireReglages`, `contenusRetenus`, `ordonner`, nouvelles `etatCase`/`basculerCase`), `app/compte.js` (`fusionReglages`) ; Create `tests/discotheque.test.mjs` (scénarios 1-3)

**Interfaces:**
- Produces (`app.js`, globales) : `etatCase(matiere, notion) → "a_venir" | "ds_passe" | null` ; `basculerCase(matiere, notion, etat)` (même état → décoche ; met `reglages.maj`, appelle `ecrireReglages`).
- Produces (`compte.js`) : `Compte.fusionReglages(local, distant) → reglages` : le plus récent (`maj`) gagne en bloc, `notions` compris (absent → `{}`), `remise` = la plus récente des deux.

- [ ] **Step 1: Scénarios 1 à 3 de `tests/discotheque.test.mjs`** (sans compte, réglages préparés dans `localStorage`, puis rechargement) :
  1. `reglages.notions = { "reseau/DHCP": "a_venir", "inconnue/Rien": "a_venir" }` → aucune carte `reseau`/`DHCP` dans `contenusRetenus()` ; les autres notions de Réseaux y sont ; pas d'erreur (clé orpheline). Le texte de départ de la Survie annonce toujours le nombre de questions de toutes les matières.
  2. `{ "dev/Pointeurs en C": "ds_passe" }` → dans `ordonner(contenusRetenus())`, toutes les cartes de cette notion sont après toutes les autres.
  3. `basculerCase("reseau", "DHCP", "a_venir")` puis `basculerCase("reseau", "DHCP", "ds_passe")` → `etatCase` vaut `"ds_passe"` ; re-`basculerCase(… "ds_passe")` → `null` ; `JSON.parse(localStorage["agon.reglages"]).notions` reflète chaque étape. `Compte.fusionReglages({…, maj: "2026-11-21", notions: { "a/b": "a_venir" } }, { …, maj: "2026-11-20" })` garde `notions` local ; dans l'autre sens (distant plus récent, sans `notions`) → `notions` = `{}`. Toutes les matières sauf une « À venir » en entier → `contenusRetenus()` non vide.
- [ ] **Step 2: Lancer** `node tests/discotheque.test.mjs` — échec attendu (`etatCase is not defined`).
- [ ] **Step 3: Implémenter** : `lireReglages` lit `notions` (objet ; ne garder que les valeurs `a_venir`/`ds_passe`) ; `contenusRetenus` filtre `etatCase(c.matiere, c.notion) !== "a_venir"` ; dans `ordonner`, séparer les cartes `ds_passe` avant le tri, ordonner le reste comme aujourd'hui, puis ajouter les `ds_passe` ordonnées de la même façon à la fin ; `fusionReglages` dans `compte.js`, utilisée par `fusionner`.
- [ ] **Step 4: Relancer** `node tests/discotheque.test.mjs` et `node tests/classement.test.mjs` — OK.
- [ ] **Step 5: Commit** `git commit -m "Cases À venir / DS passé : réglages synchronisés, effets sur le fil"`

---

### Task 2: Fils ciblés (une notion, un album)

**Files:** Modify `app/app.js` (`montrerFil`, `construireFil`, cartes de fin) ; `tests/discotheque.test.mjs` (scénarios 4-5)

**Interfaces:**
- Produces : `montrerFil("notion", { matiere, notion })`, `montrerFil("album", { matiere })` ; cible gardée dans `cibleFil` ; la carte de fin ciblée a deux boutons « Retour à la discothèque » (`Discotheque.ouvrir(matiere)` si défini, sinon accueil) et « Retour au menu ».

- [ ] **Step 1: Scénarios** — 4. `montrerFil("notion", { matiere: "reseau", notion: "DHCP" })` avec DHCP « À venir » et la matière Réseaux exclue des réglages → tous les écrans de carte du fil ont `data-matiere="reseau"` et leur notion est DHCP (lire via un attribut `data-notion` ajouté par `creerCarte`), aucune Prise d'otage ; dernier écran = fin ciblée. `montrerFil("album", { matiere: "eco" })` → que de l'Économie. 5. Formats exclus = tous sauf `fiche`, notion sans fiche → écran « Aucune carte » avec « Retour à la discothèque ».
- [ ] **Step 2: Lancer — échec** (`data-notion` absent / mode inconnu).
- [ ] **Step 3: Implémenter** (`creerCarte` pose `data-notion` ; filtre ciblé = `contenuValide` + cible + formats non exclus ; `ordonner` sans `ajouterChronos`).
- [ ] **Step 4: Relancer** — OK, plus `node tests/csp.test.mjs`.
- [ ] **Step 5: Commit** `git commit -m "Fils ciblés : réviser une notion ou un album"`

---

### Task 3: Écran « Ta discothèque »

**Files:** Create `app/discotheque.js` ; Modify `app/index.html` (`<section class="f-accueil f-discotheque cache" id="discotheque" aria-label="Ta discothèque">` à la place de `#arbre`, script après `classement.js`), `app/app.js` (la boule ouvre `Discotheque.ouvrir()` ; `afficherAccueil`/`montrerFil`/fermeture des réglages utilisent `#discotheque` ; suppression de `ouvrirArbre`, `remplirArbre`, `ETATS_NOTION` si inutilisé, styles `.f-arbre*`/`.f-branche*`/`.f-feuille*`/`.f-legende` dans `fil.css`), `app/fil.css` ; `tests/discotheque.test.mjs` (scénarios 6-9)

**Interfaces:**
- Consumes : `etatNotion`, `etatCase`, `basculerCase`, `montrerFil`, `lireResultats`, `contenuValide`, `donnees`.
- Produces : `Discotheque.ouvrir(matiere?)` ; pures : `Discotheque.ordreAlbums(albums) → albums triés` où `album = { id, nom, notions: [{ nom, etat, cas }] }` (`cas` = état de la case) ; `Discotheque.pastilleAlbum(album) → string | null` ; `Discotheque.fractionVinyle(album) → nombre entre 0.15 et 1` (1 = toutes maîtrisées → classe `or`).
- Rendu : bac `.f-bac` (`scroll-snap-type: x mandatory`), pochettes `.f-pochette[data-matiere]` (bouton), vinyle `.f-vinyle-sort` (variable `--sortie`), pastille `.f-pochette-pastille`, points `.f-bac-points`, boutons `.f-bac-prec`/`.f-bac-suiv` ; pistes `.f-pistes` avec `.f-piste` (`data-notion`), `.f-piste-etat.<etat>`, bouton `.f-piste-jouer`, cases `.f-case[data-cas="a_venir"|"ds_passe"][aria-pressed]` ; bouton `.f-album-jouer`. Album courant = pochette la plus proche du centre après la fin du défilement (`scrollend`, repli : 120 ms sans `scroll`).

- [ ] **Step 1: Scénarios** — 6. Résultats préparés : Systèmes avec 2 notions ratées, Économie avec 1 ratée, Dév. tout réussi, Réseaux avec 2 cases « À venir » → `ordreAlbums` donne Systèmes, Économie, puis le reste ; pastilles « 2 à revoir », « 1 à revoir », Réseaux « 2 à venir » ; `fractionVinyle(Dév.) === 1` et sa pochette a la classe `or`. 7. Ouvrir la discothèque depuis la boule : l'album courant est Systèmes ; « › » → Économie ; flèche droite → l'album suivant ; défiler le bac de 3 pochettes d'un coup (`scrollTo`), attendre 400 ms → les pistes affichées sont celles de la pochette centrée. 8. Dans les pistes : toucher « À venir » d'une piste → `aria-pressed="true"`, piste grisée, `etatCase` à jour ; toucher « DS passé » → l'autre se décoche ; « ▶ » d'une piste → fil `notion` de cette notion ; « ▶ Réviser l'album » → fil `album`. 9. Zéro violation CSP ; captures `tests/captures/discotheque-iPhone.png` et `-PC.png`.
- [ ] **Step 2: Lancer — échec** (`Discotheque is not defined`).
- [ ] **Step 3: Implémenter** `discotheque.js`, l'HTML, les styles ; retirer l'arbre.
- [ ] **Step 4: Relancer** `node tests/discotheque.test.mjs`, `node tests/csp.test.mjs` (adapter son parcours : la boule ouvre la discothèque, retour par `.f-retour-menu`), `node tests/classement.test.mjs` — OK ; regarder les captures.
- [ ] **Step 5: Commit** `git commit -m "Ta discothèque : le bac à disques remplace l'arbre"`

---

### Task 4: Livraison

**Files:** Modify `app/sw.js` (`facettes-v22`, `discotheque.js` dans `COQUILLE`), `README.md` (section « Discothèque et cases »)

- [ ] **Step 1: Suite complète** — `node tests/csp.test.mjs && node tests/turnstile.test.mjs && node tests/donnees.test.mjs && node tests/classement.test.mjs && node tests/discotheque.test.mjs` : tout OK.
- [ ] **Step 2: Commit** `git commit -m "Discothèque : version v22, documentation"`
- [ ] **Step 3: Mise en ligne (Ferdinand)** puis vérification de `facettes-v22` en ligne.
- [ ] **Step 4: Vérification manuelle (Ferdinand, iPhone)** — glisser le bac (fluide, l'album suit), cocher « À venir » sur une notion puis lancer une session : la notion n'y est plus ; ouvrir l'appli sur le PC (connecté) : la case est là aussi (synchro).
