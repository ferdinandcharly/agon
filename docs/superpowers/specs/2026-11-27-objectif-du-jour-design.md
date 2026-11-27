# Objectif du jour — design

Date : 27/11/2026 · Statut : validé à l'oral (maquette : version C), à relire

## 1. Objectif

Un nombre de cartes à jouer par jour, réglable, avec une jauge sur l'accueil, un message quand il est atteint et un repère dans la semaine du Profil. Prépare les futurs rappels. **Pas de série** : un jour raté ne casse rien (principe de l'appli, `app/app.js` « pas de série à casser »).

## 2. Réglage

- `reglages.objectif` ∈ `{0, 10, 20, 40}` (nombre de cartes ; `0` = « Aucun », jauge cachée partout). Défaut **20**.
- `normaliserObjectif(v) -> number` (dans `app/app.js`) : renvoie `v` s'il est l'une des quatre valeurs, sinon `20`. `lireReglages()` l'applique (y compris dans son `catch`).
- Synchronisé avec les autres réglages : dans `fusionReglages` (`app/compte.js`), branche « distant plus récent », `objectif: rd.objectif === undefined ? local.objectif : normaliserObjectif(rd.objectif)` (un appareil resté sur une ancienne version n'efface pas le réglage). Rien côté Supabase (le jsonb `reglages` existe).
- Paramètres › Jeu : nouvelle ligne de réglage « Objectif du jour » en tête du groupe, segment (composant `.f-segment` comme Thème et Taille) : `10` · `20` · `40` · `Aucun`, `aria-pressed`. Au clic : `reglages.objectif`, `reglages.maj`, `ecrireReglages`, puis l'accueil est redessiné à son prochain affichage.

## 3. Compteur

- Le compteur existant : `lireCollection().jours[jourLocal()]` (incrémenté par `enregistrerResultat`, chaque réponse compte, Survie et Prise d'otage comprises ; synchronisé ; remis à zéro de fait à minuit puisque la clé change).
- `objectifDuJour() -> { objectif: number, faites: number, atteint: boolean } | null` (dans `app/app.js`) : `null` si `objectif === 0`.

## 4. Accueil (version C)

- Sous le bouton « Lancer la session », avant la ligne des vinyles : `p.f-objectif` contenant une mini-barre `span.f-objectif-barre > i` (largeur = `min(faites/objectif, 1)` via `style.setProperty("--part", …)`, CSP : pas d'attribut style) et un texte :
  - en cours : « 12/20 cartes aujourd'hui » ;
  - atteint : « Objectif atteint ✓ » (classe `atteint` : barre et texte verts).
- Absente si `objectifDuJour()` est `null`.
- `aria-label` du paragraphe : « Objectif du jour : 12 cartes sur 20 » / « Objectif du jour atteint ».
- Couleurs : barre violette `#7B4DFF` en cours, verte `#00C08B` atteinte, piste `#2A2347` ; thème clair : piste `#E4DED3`, texte vert `#1D6A3A` (contraste ≥ 4,5:1, audit de `tests/apparence.test.mjs`).

## 5. Message « atteint »

- Dans `enregistrerResultat`, après l'incrément : si l'objectif est actif et que le compteur passe de `objectif - 1` à `objectif` (franchissement exact), appeler `annoncerObjectif()`.
- `annoncerObjectif()` : ajoute à `body` un `div.f-objectif-toast` `role="status"` « Objectif du jour atteint ✓ », retiré après 3 s ; un seul à la fois. Ne bloque pas le jeu (`pointer-events: none`), placé en haut, sous l'en-tête, au-dessus du fil.
- Un seul par jour naturellement (le franchissement n'a lieu qu'une fois) ; changer l'objectif en cours de journée ne déclenche rien (pas de franchissement).

## 6. Profil

- Semaine : un jour avec `nb >= objectif` (objectif actif) prend la classe `objectif` : pastille verte `#00C08B`, chiffre remplacé par « ✓ », `aria-label` « L : 24 cartes, objectif atteint ». Les jours joués sans l'atteindre restent jaunes.
- Sous la semaine : `p.f-profil-objectif` « Objectif atteint 3 jours sur 7 » (« 1 jour », « 0 jour ») ; absent si objectif « Aucun ».

## 7. Tests (`tests/objectif.test.mjs`, nouveau)

1. `normaliserObjectif` : 10/20/40/0 gardés ; `15`, `"20"`, `null`, `-1`, absent → 20 ; `lireReglages()` avec JSON abîmé → 20.
2. Fusion : distant plus récent avec `objectif: 40` → 40 ; distant sans `objectif` → valeur locale ; distant `objectif: 999` → 20.
3. Accueil : `jours[aujourd'hui] = 12`, objectif 20 → texte « 12/20 cartes aujourd'hui », `--part` 0.6 ; `= 25` → « Objectif atteint ✓ » et classe `atteint` ; objectif 0 → pas de `.f-objectif`.
4. Message : compteur à 19, objectif 20, `enregistrerResultat("x", true)` → un `.f-objectif-toast` « Objectif du jour atteint ✓ » ; nouvel appel (21) → pas de second ; disparu après 3,5 s. Compteur 5 → 6 : rien.
5. Paramètres : segment présent dans « Jeu », `aria-pressed` sur 20 par défaut ; clic sur « Aucun » → `lireReglages().objectif === 0` et accueil sans jauge.
6. Profil : jours à 25 et 5 avec objectif 20 → un `.f-profil-jour.objectif` affichant « ✓ » ; phrase « Objectif atteint 1 jour sur 7 ».
7. CSP et erreurs : aucune violation, aucune erreur.
- `tests/apparence.test.mjs` : l'audit de contraste passe en sombre et clair avec la jauge (en cours et atteinte) sur l'accueil.
- `tests/app.test.mjs` : inchangé sauf si une assertion porte sur le contenu exact de l'accueil.

## 8. Version

`app/sw.js` : `VERSION` → `facettes-v41`. Texte de « Tes données » : l'objectif fait partie des réglages déjà mentionnés (rien à ajouter).
