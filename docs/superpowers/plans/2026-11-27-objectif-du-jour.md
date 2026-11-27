# Objectif du jour — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** un objectif de cartes par jour (10/20/40/Aucun) avec jauge sur l'accueil (version C), message au franchissement et repère dans la semaine du Profil.

**Architecture :** réglage `reglages.objectif` normalisé et synchronisé comme `apparence` ; le compteur existant `collection.jours` sert de mesure ; trois affichages (accueil, toast, Profil) lisent `objectifDuJour()`.

**Tech Stack :** JS vanilla à scripts classiques (globals d'`app/app.js`), CSS `fil.css`/`clair.css`, tests Edge/CDP (`node tests/<nom>.test.mjs`).

**Spec :** `docs/superpowers/specs/2026-11-27-objectif-du-jour-design.md`

## Global Constraints

- Valeurs : `{0, 10, 20, 40}`, défaut `20`, `0` = « Aucun » (jauge, phrase du Profil et toast absents).
- Textes exacts : « 12/20 cartes aujourd'hui » · « Objectif atteint ✓ » · « Objectif du jour atteint ✓ » · « Objectif atteint 3 jours sur 7 » (« 1 jour », « 0 jour ») · segment `10` `20` `40` `Aucun` · libellé « Objectif du jour ».
- Couleurs : barre `#7B4DFF` en cours, `#00C08B` atteinte, piste `#2A2347` ; clair : piste `#E4DED3`, texte atteint `#1D6A3A`.
- CSP stricte : pas d'attribut `style` (utiliser `style.setProperty`). Commentaires en français.
- Pas de série. `VERSION` du SW → `facettes-v41`.

## Review Focus

1. Accueil resté ouvert après minuit : la jauge doit repartir de 0 au prochain `afficherAccueil()` (lecture de `jourLocal()` à chaque rendu, pas mise en cache) — test Task 2.
2. Objectif baissé sous le compteur du jour (ex. 25 cartes, objectif passé de 40 à 20) : jauge « atteint », aucun toast — test Task 3.
3. Toast pendant la Survie : ne doit pas intercepter les touches (`pointer-events: none`) ni masquer le score — vérifié par `elementFromPoint` au centre du toast — test Task 3.
4. Thème clair : texte de la jauge et toast lisibles (audit de contraste) — Task 2/3 via `tests/apparence.test.mjs`.
5. Réglage abîmé venant d'un autre appareil (`objectif: "20"`, `999`) : ramené à 20, pas d'affichage cassé — test Task 1.

---

### Task 1 : réglage, fusion, `objectifDuJour`

**Files :**
- Modify : `app/app.js` (`lireReglages` l. ~105, nouvelles fonctions près de `jourLocal`)
- Modify : `app/compte.js` (`fusionReglages` l. ~152)
- Create : `tests/objectif.test.mjs` (même squelette que `tests/profil.test.mjs` : serveur port 8767, `edge.nouvelAppareil()`, `pret`, bloc try/finally)

**Interfaces :**
- Produces : `normaliserObjectif(v: any) -> 0|10|20|40` ; `lireReglages().objectif` ; `objectifDuJour() -> { objectif, faites, atteint } | null` (`faites = lireCollection().jours[jourLocal()] || 0`, `atteint = faites >= objectif`, `null` si objectif 0).

- [ ] **Step 1 : tests 1-2** — scénario 1 : `[10,20,40,0].map(normaliserObjectif)` → `[10,20,40,0]` ; `[15,"20",null,-1,undefined].map(normaliserObjectif)` → tous `20` ; `localStorage` `agon.reglages` = `"{abîmé"` → `lireReglages().objectif === 20` ; objectif 20 + `jours[jourLocal()] = 12` → `objectifDuJour()` `{ objectif: 20, faites: 12, atteint: false }` ; objectif 0 → `null`. Scénario 2 : `Compte.fusionner(local maj "2026-11-01", distant maj "2026-11-02" objectif 40)` → `reglages.objectif === 40` ; distant plus récent sans `objectif` → valeur locale (10) ; distant `objectif: 999` → 20.
- [ ] **Step 2 :** `node tests/objectif.test.mjs` → ÉCHEC « normaliserObjectif is not defined ».
- [ ] **Step 3 : implémenter** dans `app/app.js` et `app/compte.js` (spec §2, §3).
- [ ] **Step 4 :** `node tests/objectif.test.mjs` → `OK — objectif`.
- [ ] **Step 5 : commit** `git add app tests/objectif.test.mjs && git commit -m "Objectif du jour : réglage normalisé et synchronisé"`

### Task 2 : jauge de l'accueil (version C)

**Files :**
- Modify : `app/app.js` (`remplirAccueil` l. ~1150 : entre le bouton Lancer et la ligne des vinyles)
- Modify : `app/fil.css`, `app/clair.css`
- Test : `tests/objectif.test.mjs` (scénario 3), `tests/apparence.test.mjs` (accueil avec jauge en cours et atteinte dans l'audit)

**Interfaces :**
- Consumes : `objectifDuJour()` (Task 1).
- Produces : `p.f-objectif` (classe `atteint` si atteint), `span.f-objectif-barre > i`, propriété CSS `--part` (0 à 1) posée sur `.f-objectif-barre`.

- [ ] **Step 1 : test 3** — objectif 20, `jours[auj] = 12`, `afficherAccueil()` → `.f-objectif` texte contient « 12/20 cartes aujourd'hui », `getComputedStyle(barre).getPropertyValue("--part").trim() === "0.6"`, `aria-label` « Objectif du jour : 12 cartes sur 20 » ; `= 25` → texte « Objectif atteint ✓ », classe `atteint`, `--part` `1`, `aria-label` « Objectif du jour atteint » ; objectif 0 → pas de `.f-objectif`. Minuit : `jours = { "2026-01-01": 30 }` (hier fictif) → « 0/20 cartes aujourd'hui ».
- [ ] **Step 2 :** lancer → ÉCHEC scénario 3.
- [ ] **Step 3 : implémenter** (spec §4) ; CSS : `.f-objectif` comme `.f-ligne-info` ; barre 54 × 7 px, arrondie, `i { width: calc(var(--part) * 100%) }`.
- [ ] **Step 4 :** `node tests/objectif.test.mjs` puis `node tests/apparence.test.mjs` (ajouter deux écrans à l'audit : accueil avec 12/20 et avec 25/20) → `OK`.
- [ ] **Step 5 : commit** `git commit -am "Objectif du jour : jauge sous le bouton Lancer"`

### Task 3 : message au franchissement

**Files :**
- Modify : `app/app.js` (`enregistrerResultat` l. ~82 ; nouvelle `annoncerObjectif()`)
- Modify : `app/fil.css`, `app/clair.css` (si besoin de contraste)
- Test : `tests/objectif.test.mjs` (scénario 4)

**Interfaces :**
- Consumes : `objectifDuJour()`.
- Produces : `annoncerObjectif() -> void` ; élément `div.f-objectif-toast[role=status]`.

- [ ] **Step 1 : test 4** — objectif 20, compteur 19 : `enregistrerResultat("x", true)` → exactement un `.f-objectif-toast`, texte « Objectif du jour atteint ✓ », `getComputedStyle(t).pointerEvents === "none"` ; nouvel appel (21) → toujours un seul ; après 3,5 s → aucun. Compteur 5, appel → aucun toast. Compteur 25 et objectif passé de 40 à 20 via `ecrireReglages` → appel (26) → aucun toast. Objectif 0, compteur 19 → aucun.
- [ ] **Step 2 :** lancer → ÉCHEC scénario 4.
- [ ] **Step 3 : implémenter** (spec §5) : franchissement exact `avant < objectif && apres >= objectif` ; un seul toast (retirer l'éventuel précédent) ; `position: fixed`, sous l'en-tête (`top: calc(env(safe-area-inset-top, 0px) + 64px)`), centré, fond `#00C08B`, texte encre, trait encre, `z-index` au-dessus du fil, animation d'entrée respectant `prefers-reduced-motion`.
- [ ] **Step 4 :** `node tests/objectif.test.mjs` → `OK`.
- [ ] **Step 5 : commit** `git commit -am "Objectif du jour : message quand il est atteint"`

### Task 4 : Paramètres, Profil, version, suite

**Files :**
- Modify : `app/profil.js` (`CHOIX_APPARENCE`/`segment` réutilisés pour une clé hors `apparence` ; `blocSemaine` l. ~61 ; groupe « Jeu » de `rendreParametres`)
- Modify : `app/fil.css`, `app/clair.css` (pastille `.objectif`, `.f-profil-objectif`)
- Modify : `app/sw.js` (`facettes-v41`)
- Test : `tests/objectif.test.mjs` (scénarios 5-7), `tests/app.test.mjs` / `tests/profil.test.mjs` seulement si une assertion existante change

**Interfaces :**
- Consumes : `normaliserObjectif`, `lireReglages().objectif`, `ecrireReglages`.

- [ ] **Step 1 : tests 5-7** — 5 : Paramètres → dans le groupe « Jeu », `.f-segment-objectif` avec 4 boutons `["10","20","40","Aucun"]`, `aria-pressed="true"` sur `20` ; clic « Aucun » → `lireReglages().objectif === 0`, `reglages.maj` mis à jour, puis `afficherAccueil()` → pas de `.f-objectif`. 6 : objectif 20, jours de la semaine courante = un jour à 25, un à 5 → un seul `.f-profil-jour.objectif`, sa pastille affiche « ✓ », son `aria-label` se termine par « objectif atteint » ; `.f-profil-objectif` « Objectif atteint 1 jour sur 7 » ; objectif 0 → pas de `.f-profil-objectif` ni `.objectif`. 7 : `violationsCsp` et `erreurs` vides sur tous les appareils du fichier.
- [ ] **Step 2 :** lancer → ÉCHEC scénario 5.
- [ ] **Step 3 : implémenter** (spec §2 Paramètres, §6) ; le segment générique accepte une clé et une fonction d'écriture (apparence → `reglages.apparence[cle]` + `Apparence.appliquer` ; objectif → `reglages.objectif`).
- [ ] **Step 4 :** `node tests/objectif.test.mjs`, puis la suite complète en deux lots (mémoire) : `amis app apparence classement csp discotheque` puis `donnees objectif outils portail profil turnstile` → 12 `OK`.
- [ ] **Step 5 : commit** `git commit -am "Objectif du jour : réglage dans Paramètres, repère dans la semaine du Profil ; v41"`
