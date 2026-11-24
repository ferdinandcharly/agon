# Profil et Paramètres — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la boîte « Réglages » par un écran Profil (mini-avatar en en-tête) et des Paramètres rangés, avec « Modifier mon profil » et l'activité de la semaine.

**Architecture:** Nouveau module `app/profil.js` (écrans Profil, Paramètres, Matières, Types de jeux, Modifier mon profil), construit en DOM avec `el()` comme les autres modules. Les données de la semaine vivent dans `agon.collection.jours`, donc passent par la synchro existante. Le formulaire du portail est factorisé dans `portail.js` pour servir aux deux.

**Tech Stack:** JS sans framework (scripts classiques, globals), CSS `fil.css`, Supabase JS 2.119.2, tests Node + Edge via CDP (`tests/navigateur.mjs`, session simulée).

**Spec:** `docs/superpowers/specs/2026-11-24-profil-parametres-design.md` · maquettes : https://claude.ai/artifact/PJ5pGQMJeeA3yA6BcHxhtC

## Global Constraints

- Commentaires et textes en français ; noms de fonctions en français (convention du dépôt).
- CSP inchangée : `style-src 'self'` → aucun attribut `style="…"` dans le HTML ni `<style>` ; couleurs dynamiques via `element.style.setProperty("--x", …)` (autorisé), comme `pastille()`.
- Aucun changement de base Supabase (colonnes `profils.avatar/prenom/etablissement/parcours` et droits existent).
- Cibles tactiles ≥ 44 px ; interrupteurs = `<button role="switch" aria-checked>` ; boutons icône avec `aria-label`.
- `collection.jours` : clés `AAAA-MM-JJ` (date locale), entiers 0–5000, 14 derniers jours gardés.
- Service worker : `VERSION = "facettes-v36"` et `profil.js` dans `COQUILLE`.
- Lancer chaque test depuis la racine : `node tests/<nom>.test.mjs` ; dernière ligne attendue `OK — …`.

## Review Focus

1. Changement de jour pendant que l'appli est ouverte (minuit) : la réponse suivante compte pour le nouveau jour, l'ancien reste dans la semaine. → test « jourLocal minuit » (Tâche 1).
2. `collection.jours` distant corrompu (clé `"x"`, valeur `-3`, `"12"`, `1e9`, tableau) : ignoré sans planter, valeurs valides gardées. → Tâche 1.
3. Profil ouvert hors ligne avant tout chargement du profil (`Compte.profil()` undefined/null) : l'écran s'affiche avec « … » et les stats locales, sans erreur console. → Tâche 4.
4. Pseudo modifié vers un pseudo déjà pris / invalide : erreur sous le champ, on reste sur l'écran, le profil affiché ne change pas. → Tâche 6.
5. Effacer ma progression depuis Paramètres : la semaine et les matières du Profil se remettent à zéro au retour (et `jours` n'est pas touché — c'est l'activité, pas la progression : seule `resultats` est effacée, comme aujourd'hui). → Tâche 5.

---

### Tâche 1 : Activité de la semaine (données + synchro)

**Files:**
- Modify: `app/app.js` (lireCollection l.142, enregistrerResultat l.80)
- Modify: `app/compte.js` (fusionner l.132)
- Modify: `app/donnees.js:94`
- Create: `tests/profil.test.mjs`

**Interfaces:**
- Produces (globals de `app.js`) :
  - `jourLocal(date: Date = new Date()) -> "AAAA-MM-JJ"` (date locale, pas UTC)
  - `normaliserJours(j: any, aujourdhui: string = jourLocal()) -> {[jour]: entier}` : garde clés au format strict, valeurs entières 0–5000 (`Number.isInteger`), jours dans `]aujourdhui-14 j, aujourdhui]`
  - `fusionnerJours(a, b, aujourdhui = jourLocal()) -> objet` : union, max par jour, puis `normaliserJours`
  - `lireCollection()` renvoie en plus `jours` (normalisé)
- `enregistrerResultat` incrémente `jours[jourLocal()]` via `lireCollection`/`ecrireCollection` (un seul `changementLocal()` au total suffit, pas deux synchros programmées).

- [ ] **Step 1: Écrire `tests/profil.test.mjs`** (squelette comme `tests/portail.test.mjs` : `demarrerServeur("app", 8766)`, `lancerEdge()`, appareil `edge.nouvelAppareil()`, attente de `donnees`), scénario 4 en fonctions pures :

```js
const r4 = await a.evaluer(`(() => {
  const auj = "2026-11-24";
  return {
    norm: normaliserJours({ "2026-11-24": 3, "2026-11-10": 5, "2026-11-11": 2, x: 4, "2026-11-20": -3, "2026-11-21": "12", "2026-11-22": 1e9, "2026-11-23": 1.5 }, auj),
    fus: fusionnerJours({ "2026-11-24": 3, "2026-11-23": 9 }, { "2026-11-24": 7, "2026-11-22": 2 }, auj),
    pasTableau: normaliserJours([1, 2], auj),
    minuit: jourLocal(new Date(2026, 10, 24, 23, 59)) + "|" + jourLocal(new Date(2026, 10, 25, 0, 1)),
  };
})()`);
assert.deepEqual(r4.norm, { "2026-11-24": 3, "2026-11-11": 2 });
assert.deepEqual(r4.fus, { "2026-11-24": 7, "2026-11-23": 9, "2026-11-22": 2 });
assert.deepEqual(r4.pasTableau, {});
assert.equal(r4.minuit, "2026-11-24|2026-11-25");
// Répondre à une carte incrémente aujourd'hui
const avant = await a.evaluer("lireCollection().jours[jourLocal()] || 0");
await a.evaluer("enregistrerResultat(donnees.contenus[0].id, true); enregistrerResultat(donnees.contenus[1].id, false)");
assert.equal(await a.evaluer("lireCollection().jours[jourLocal()]"), avant + 2);
// Fusion distante : Compte garde le max par jour
```

  Pour la fusion côté `compte.js`, exposer `fusionner` dans le `return` de `Compte` (comme `fileDe`) et tester : `Compte.fusionner(local, { collection: { jours: { [aujourdhui]: 50 } } }).collection.jours[aujourdhui] === 50`.

- [ ] **Step 2: Lancer** `node tests/profil.test.mjs` → ÉCHEC (`normaliserJours is not defined`).
- [ ] **Step 3: Implémenter** les trois fonctions et `jours` dans `lireCollection` (valeur par défaut `{}`), l'incrément dans `enregistrerResultat`, `collection.jours = fusionnerJours(local.collection.jours, cd.jours)` dans `fusionner`, et `fusionner` exporté. « 14 derniers jours » = aujourd'hui et les 13 jours avant (2026-11-11 gardé, 2026-11-10 non, cf. test).
- [ ] **Step 4: `donnees.js:94`** : après « ta collection de vinyles », ajouter « le nombre de cartes jouées chaque jour (14 derniers jours) ». Mettre à jour l'assertion correspondante de `tests/donnees.test.mjs` si elle cite la phrase.
- [ ] **Step 5: Lancer** `node tests/profil.test.mjs`, `node tests/donnees.test.mjs`, `node tests/discotheque.test.mjs` → `OK`.
- [ ] **Step 6: Commit** `git commit -m "Activité de la semaine : cartes jouées par jour dans la collection, fusion au maximum"`

### Tâche 2 : Profil complet dans `Compte`

**Files:**
- Modify: `app/compte.js` (lireProfil l.94, enregistrerPseudo l.275, enregistrerProfil l.295, return l.521)
- Test: `tests/profil.test.mjs`

**Interfaces:**
- Produces : `Compte.profil()` → `undefined` (pas chargé) | `null` (pas de profil) | `{ pseudo, avatar, prenom, etablissement, parcours }` ; `Compte.etat()` → `"deconnecte" | "synchro" | "ok" | "hors-ligne" | "erreur"` ; événement `facettes:profil` dispatché sur `window` à chaque changement de `profil` (lu, enregistré, oublié).

- [ ] **Step 1: Test** (scénario 2b) : sur l'appareil à session simulée, simuler une lecture : `Compte.client().from = () => ({ select: () => ({ maybeSingle: async () => ({ data: { pseudo: "Zoe_1", avatar: "rose-coeur", prenom: "Zoé", etablissement: "IUT", parcours: "but-info-1" }, error: null }) }) })` puis déclencher la lecture (exposer `Compte.lireProfil`), et vérifier `Compte.profil()` deepEqual l'objet, et qu'un écouteur `facettes:profil` a été appelé. `Compte.etat()` est une des 5 valeurs.
- [ ] **Step 2: Lancer** → ÉCHEC.
- [ ] **Step 3: Implémenter** : `select("pseudo, avatar, prenom, etablissement, parcours")` ; après `enregistrerProfil`, `profil = { ...ligne }` (au lieu de `{ pseudo }`) ; après `enregistrerPseudo`, `profil = { ...profil, pseudo }` ; une fonction interne `changerProfil(p)` pose `profil` et dispatch `facettes:profil` — utilisée partout où `profil` change (dont `undefined` à la déconnexion et à la suppression). Exporter `etat: () => etat` et `lireProfil`.
- [ ] **Step 4: Lancer** profil, portail, amis, classement → `OK`.
- [ ] **Step 5: Commit** `"Compte : profil complet (avatar, prénom, établissement, parcours) et état exposé"`

### Tâche 3 : Formulaire de profil factorisé

**Files:**
- Modify: `app/portail.js` (etapeInfos l.101-158, return l.216)
- Test: `tests/portail.test.mjs` (doit rester vert, inchangé)

**Interfaces:**
- Produces : `Portail.formulaireProfil({ valeurs, surValider }) -> { element: HTMLElement, valider: () => Promise<void> }`
  - `valeurs` : `{ pseudo?, avatar?: "couleur-symbole", prenom?, etablissement? }` ; avatar absent ou invalide (`FORMAT_AVATAR`) → couleur et symbole au hasard.
  - `element` contient aperçu avatar, couleurs, symboles, 3 champs (ids `<prefixe>-pseudo` etc. ; paramètre `prefixe` défaut `"portail"`), erreurs par champ, message.
  - `valider()` : normalise, `verifierInfos`, affiche les erreurs ; si OK appelle `await surValider({ pseudo, prenom, etablissement, avatar })` ; en cas d'erreur, même aiguillage qu'aujourd'hui (pseudo → sous le champ, sinon message). Ne ferme rien lui-même.
- `etapeInfos()` utilise `formulaireProfil({ surValider: (infos) => Compte.enregistrerProfil({ ...infos, parcours }).then(fermer) })` avec le bouton « C'est parti » qui appelle `valider()`.

- [ ] **Step 1:** Ajouter au scénario 5 de `portail.test.mjs` : `Portail.formulaireProfil({ valeurs: { pseudo: "Zoe_1", avatar: "rose-coeur", prenom: "Zoé" }, prefixe: "t" })` → `#t-pseudo` vaut `"Zoe_1"`, le bouton `[data-couleur="rose"]` a `aria-pressed="true"`, `[data-symbole="coeur"]` aussi.
- [ ] **Step 2: Lancer** → ÉCHEC.
- [ ] **Step 3: Implémenter** la factorisation (déplacement du code existant, comportement identique).
- [ ] **Step 4: Lancer** `node tests/portail.test.mjs` → `OK — portail` (scénarios 1-15).
- [ ] **Step 5: Commit** `"Portail : formulaire de profil réutilisable"`

### Tâche 4 : Écran Profil et mini-avatar

**Files:**
- Create: `app/profil.js`
- Modify: `app/index.html` (l.39 bouton, ajout `<section class="f-accueil f-profil cache" id="profil" aria-label="Ton profil">`, `<script src="profil.js">` après `portail.js`)
- Modify: `app/nav.js` (valeur `"aucun"` au lieu de `"classement"` ; mettre à jour `classement.js` qui l'appelle)
- Modify: `app/app.js` (masquer `#profil` là où les autres écrans sont masqués ; `apresSynchro` redessine le profil s'il est visible)
- Modify: `app/fil.css` (`.f-profil …`), `app/sw.js` (v36 + `profil.js`)
- Test: `tests/profil.test.mjs`

**Interfaces:**
- Produces : `Profil.ouvrir()`, `Profil.rafraichir()`, `Profil.estOuvert() -> bool` ; pures exposées pour test : `Profil.semaine(jours, aujourdhui: Date) -> [{ lettre, jour, nb, aujourdhui, futur }] (7, lundi→dimanche)`, `Profil.matieres(notions) -> [{ id, nom, faites, total }]` triées par `faites/total` décroissant puis ordre d'origine.
- Consumes : `jourLocal`, `lireCollection().jours` (T1), `Compte.profil()` + `facettes:profil` (T2), `Portail.avatar`, `notionsParEtat`, `lireRecordSurvie`, `Nav.afficher("aucun")`.
- Mini-avatar : `#btn-reglages` garde son id, `aria-label="Ton profil"`, contenu = `Portail.avatar(profil.avatar, 36)` ou rond neutre `.f-avatar-vide` ; mis à jour sur `facettes:profil`. Un clic → `Profil.ouvrir()`.
- Ligne d'identité : `[prenom, etablissement, "BUT info 1"].filter(Boolean).join(" · ")` ; pseudo `"…"` si profil non chargé.
- « Tes matières » : 4 premières, bouton « Tout voir » / « Moins » (`aria-expanded`). Largeur de barre via `style.setProperty("--part", …)`, couleur via `--c` de la matière (même astuce que `couleurDe` dans app.js → déplacer `couleurDe` en global réutilisable).
- « Cette semaine » : texte `"N jours sur 7"` (N = jours de la semaine avec nb > 0 ; « 1 jour sur 7 » au singulier).

- [ ] **Step 1: Tests** (scénarios 1a et 3) :
  - clic `#btn-reglages` → `#profil` visible, `#accueil` caché, `#nav` visible et aucun bouton `[aria-current]`.
  - `Profil.semaine({ "2026-11-24": 11, "2026-11-23": 4 }, new Date(2026, 10, 24))` (mardi) → 7 éléments, `[0].lettre === "L"`, `[0].jour === "2026-11-23"`, `[0].nb === 4`, `[1].nb === 11 && [1].aujourdhui`, `[2].futur === true`.
  - `Profil.matieres([...])` avec 2 notions `maitrisee` sur 3 en `sys` et 1/1 en `bd` → `bd` d'abord (`faites:1,total:1`), puis `sys` (`2/3`).
  - Résultats posés pour toutes les cartes d'une notion → nombre « notions » du profil = 1 ; ≥ 5 matières → 4 lignes, « Tout voir » → toutes, « Moins » → 4.
  - Hors ligne, profil `undefined` : `Profil.ouvrir()` sans erreur, pseudo affiché `…` (Review Focus 3).
- [ ] **Step 2: Lancer** → ÉCHEC.
- [ ] **Step 3: Implémenter** `profil.js` (écran Profil seulement ; la roue ⚙ appelle `Profil.ouvrirParametres()` défini en T5 — d'ici là, bouton présent sans action), HTML, nav, CSS d'après la maquette « Profil B — zone remplie », sw v36.
- [ ] **Step 4: Lancer** profil, classement, amis, discotheque, csp, app → `OK`.
- [ ] **Step 5: Commit** `"Profil : écran avec stats, semaine et matières ; mini-avatar en en-tête ; v36"`

### Tâche 5 : Paramètres, Matières, Types de jeux (et fin de la dialog Réglages)

**Files:**
- Modify: `app/profil.js`, `app/index.html` (supprimer `<dialog id="reglages">`), `app/app.js` (supprimer l.1172-1278 dialog/pastille/ouvrirReglages ; garder `basculerDans`, `btnZero`→ logique « effacer » en fonction `effacerProgression()`), `app/compte.js` (retirer la branche `if (utilisateur)` de `dessinerSection` et `blocPseudo` ; exporter `deconnecter`, `supprimer`), `app/fil.css` (`.f-param-*`, retirer `.f-reglages` sauf ce qu'utilise `#donnees`, `.f-pastille*` si plus utilisé)
- Modify: `tests/portail.test.mjs` scénario 15 (passer par Paramètres), tests qui ouvraient la dialog (`grep -n "reglages\|btn-reglages" tests/`)
- Test: `tests/profil.test.mjs`

**Interfaces:**
- Produces : `Profil.ouvrirParametres()`, `effacerProgression()` (global app.js : efface `CLE_RESULTATS`, pose `reglages.remise`, remet le score de session à 0 — corps actuel du 2e appui de `btnZero`), `Compte.deconnecter()`, `Compte.supprimer()`.
- Écrans empilés : un seul conteneur `#profil` dont `profil.js` remplace le contenu (pile `["profil", "parametres", "matieres"|"formats"|"modifier"]`) ; la barre du bas est cachée (`Nav.afficher(null)`) hors de l'écran Profil ; ‹ dépile.
- Lignes « Matières » (`"N sur M"`) et « Types de jeux » (`"Tous"` si aucun exclu, sinon `"N sur M"`).
- Interrupteur : refuse de couper le dernier actif (classe `secoue`, comme `pastille`). Tout changement : `reglages.maj = new Date().toISOString(); ecrireReglages(reglages); reglagesModifies = true`. En revenant au Profil après un changement : `construireFil()` si le fil était l'écran d'origine (même règle que l'ancienne fermeture de dialog).
- Double confirmation 4 s pour « Effacer ma progression » (« Confirmer : tout effacer » → « Progression effacée ») et « Supprimer mon compte » (« Confirmer : supprimer le compte »).
- Synchronisation : libellé selon `Compte.etat()` : ok → « À jour », synchro → « Synchronisation… », hors-ligne → « Hors ligne », erreur → « Erreur, touche pour réessayer », deconnecte → « — » ; mis à jour sur l'événement que `changerEtat` émet déjà (sinon en ajouter un `facettes:etat`).

- [ ] **Step 1: Tests** (scénarios 1b, 2, 6) :
  - ⚙ → titre « Paramètres » ; « Matières » → 9 interrupteurs ; ‹ → Paramètres ; ‹ → Profil, barre du bas visible.
  - Couper « Maths » → `reglages.matieresExclues` contient `"maths"` ; `construireFil()` puis aucune carte `matiere === "maths"` dans `fileDeCartes` (ou le nom réel de la file du fil — vérifier dans app.js) ; couper toutes sauf une puis la dernière → reste `aria-checked="true"`. Idem Types de jeux.
  - Effacer : 1er appui → texte « Confirmer : tout effacer », 2e → `Object.keys(lireResultats()).length === 0` ; retour au Profil → « notions » = 0 (Review Focus 5).
  - Portail scénario 15 réécrit : Profil → ⚙ → « Supprimer mon compte » ×2 avec `rpc` simulé → progression vidée.
  - `document.getElementById("reglages") === null`.
- [ ] **Step 2: Lancer** → ÉCHEC.
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Lancer tous les tests** (`for f in tests/*.test.mjs; do node "$f" | tail -1; done`) → 10 × `OK`.
- [ ] **Step 5: Commit** `"Paramètres rangés (Jeu, Compte, Zone sensible) et sous-pages à interrupteurs ; fin de la boîte Réglages"`

### Tâche 6 : Modifier mon profil

**Files:**
- Modify: `app/profil.js`, `app/fil.css`
- Test: `tests/profil.test.mjs`

**Interfaces:**
- Consumes : `Portail.formulaireProfil` (T3), `Compte.enregistrerProfil`, `Compte.profil()` (T2).
- En-tête « Annuler » · « Modifier mon profil » · « Enregistrer » (Enregistrer appelle `valider()`, désactivé pendant l'appel). Ligne lecture seule « Parcours : BUT informatique · 1re année ». Mention « Pseudo et avatar sont visibles des autres joueurs. Prénom et établissement restent privés. »
- `surValider(infos)` → `Compte.enregistrerProfil({ ...infos, parcours: profil.parcours || "but-info-1" })` puis retour au Profil (qui se redessine via `facettes:profil`).
- Profil non chargé (`Compte.profil()` pas un objet) : le bouton « Modifier mon profil » est désactivé.

- [ ] **Step 1: Tests** (scénario 5) avec profil simulé `{ pseudo: "Zoe_1", avatar: "rose-coeur", prenom: "Zoé", etablissement: "IUT", parcours: "but-info-1" }` :
  - « Modifier mon profil » → champs préremplis, `rose` et `coeur` pressés.
  - Pseudo `"a b"` + Enregistrer → message sous le pseudo, toujours sur l'écran (Review Focus 4).
  - `enregistrerProfil` remplacé par une fonction qui rejette `{ code: "23505", message: "profils_pseudo_key", messageAffiche: "Déjà pris : essaie un autre pseudo." }` → « Déjà pris » sous le champ, le Profil affiche toujours `Zoe_1`.
  - Annuler → Profil, pseudo `Zoe_1`.
  - `enregistrerProfil` simulé qui réussit → retour au Profil.
- [ ] **Step 2: Lancer** → ÉCHEC.
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Lancer** profil et portail → `OK`.
- [ ] **Step 5: Commit** `"Profil : modifier pseudo, avatar, prénom et établissement"`

### Tâche 7 : Captures et vérification finale

**Files:**
- Modify: `tests/profil.test.mjs` (captures), `README.md` si la liste des fichiers / écrans y figure

- [ ] **Step 1:** Ajouter `await a.capture("tests/captures/profil-iPhone.png")` et `parametres-iPhone.png`, plus un appareil PC (`{ largeur: 1280, hauteur: 800, mobile: false }`) → `profil-PC.png` ; vérifier `violationsCsp` et `erreurs` vides pour chaque appareil.
- [ ] **Step 2:** Tous les tests → 10 × `OK` ; regarder les 3 captures (proches des maquettes, rien de coupé au-dessus de la barre du bas).
- [ ] **Step 3: Commit** `"Profil et Paramètres : captures et tests finaux"`
