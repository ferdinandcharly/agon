# Discothèque (refonte de « Ton arbre ») et cases « À venir » / « DS passé » — design

Date : 20/11/2026 · Statut : validé à l'oral (maquettes du compagnon visuel, variante « bac à disques »), à relire
par Ferdinand · Règles générales : `2026-11-20-securite-rgpd-design.md` §3 (aucune table nouvelle ici).

## Contexte et objectif

« Ton arbre » est jugé trop long, pas assez visuel et pas assez utile. Ferdinand veut aussi, au sein d'une
matière, marquer des notions « pas encore vues en cours (bientôt) » et « DS déjà passé ». Il a choisi de faire
de chaque matière un **album** (cohérent avec les vinyles du Tube du jour) dans un **bac à disques**.

Critère de réussite : en un coup d'œil on voit la matière la plus urgente ; en deux touchers on révise une notion
précise ; les cases changent vraiment le fil de révision et suivent sur tous les appareils.

## Décisions

- « À venir » : la notion **sort** du fil normal, de la Prise d'otage et du Tube du jour.
- « DS passé » : la notion **reste**, mais ses cartes passent **après** tout le reste du fil (même dues).
- Les deux cases s'excluent ; aucune des deux = état normal.
- La Survie classée n'en tient pas compte (records comparables).
- Les fils ciblés (une notion, un album) ignorent les deux cases : c'est un choix explicite.
- Libellé « À venir » (et non « pas vue ») : « pas vue » désigne déjà une notion jamais jouée dans l'appli.

## 1. Écran « Ta discothèque »

Remplace `#arbre` (même accès : toucher la boule de l'accueil ; même bouton « ← Retour au menu »).

- Titre « Ta discothèque », sous-titre « N albums · M pistes maîtrisées sur T ».
- **Bac** : carrousel horizontal, une pochette par matière ayant des cartes valides, couleur de la matière
  (`--c` de `[data-matiere]`). Défilement natif avec `scroll-snap-type: x mandatory`, une pochette centrée à la fois ;
  boutons « ‹ » / « › » (visibles sur PC, utilisables au clavier), flèches gauche/droite du clavier.
- **Pochette du milieu** : agrandie, son vinyle sort à droite d'une fraction = notions maîtrisées / notions
  (minimum 15 % pour rester visible), **doré** quand toutes sont maîtrisées. Les autres pochettes sont réduites,
  inclinées, à moitié transparentes.
- **Pastille** sur chaque pochette, par priorité : « N à revoir » › « N à venir » › « DS passé » (au moins une
  notion DS passé) › rien.
- **Ordre** : nombre de notions à revoir (décroissant), puis notions en cours (décroissant), puis l'ordre de
  `donnees.matieres`. Le bac s'ouvre centré sur le premier album ; points de position sous le bac.
- La pochette centrée est l'album **courant** : changement d'album = mise à jour des pistes sous le bac.

## 2. Pistes de l'album courant

- Bouton « ▶ Réviser l'album » (fil de toute la matière).
- Liste numérotée des notions (ordre du fichier, comme l'arbre actuel). Chaque piste :
  pastille d'état (`maitrisee` vert, `en_cours` bleu, `a_revoir` rose, `pas_vue` blanc — fonction `etatNotion`
  existante), nom, détail court (« 3/5 cartes vues »), bouton « ▶ » (fil de cette notion), et deux pastilles
  à cocher « À venir » / « DS passé » (`aria-pressed`, s'excluent, re-toucher décoche).
- Une piste « À venir » est grisée.

## 3. Fils ciblés

- `montrerFil(mode, cible)` gagne les modes `"notion"` (`cible = { matiere, notion }`) et `"album"`
  (`cible = { matiere }`). Le fil contient les cartes valides de la cible, **sauf les formats exclus** dans les réglages
  (préférence de jeu) ; les matières exclues et les cases « À venir » / « DS passé » sont ignorées.
- Ordre : celui de la répétition espacée (`ordonner`), sans Prise d'otage ni Tube du jour.
- Fin de fil : carte « Retour à la discothèque » (revient sur le même album) et « Retour au menu ».

## 4. Données des cases

- Dans les réglages locaux (`agon.reglages`) : `notions: { "<matiere>/<notion>": "a_venir" | "ds_passe" }`
  (clé absente = normal). `lireReglages` le lit (objet, valeurs filtrées) ; chaque changement met à jour
  `reglages.maj` et appelle `ecrireReglages` (donc la synchro).
- Fusion entre appareils (`compte.js`) : les réglages les plus récents gagnent en bloc, `notions` compris.
- Export « Tes données » : déjà inclus (les réglages sont exportés tels quels).
- Effets : `contenusRetenus()` exclut les cartes des notions `a_venir` ; `ordonner()` place les cartes des
  notions `ds_passe` après toutes les autres (leur ordre interne inchangé) ; la Prise d'otage et le Tube du jour
  utilisent `contenusRetenus()` donc suivent ; la Survie n'utilise pas `contenusRetenus()` (inchangée).
- Accueil : compteur de cartes et boule à facettes inchangés dans leur logique (ils lisent `contenusRetenus` /
  les résultats).

## 5. Code

- `app/discotheque.js` (nouveau) : `Discotheque.ouvrir(matiere?)`, rendu du bac et des pistes, gestion des cases.
  Fonctions pures exportées pour les tests : `ordreAlbums(matieres, cartes, resultats, etats)`,
  `pastilleAlbum(notions)`, `fractionVinyle(notions)`.
- `app/app.js` : suppression de `remplirArbre`/`ouvrirArbre` (et `ETATS_NOTION` s'il n'est plus utilisé ailleurs ;
  la légende disparaît, les pastilles parlent d'elles-mêmes) ; `#arbre` devient `#discotheque` dans `index.html`
  et les endroits qui le cachent ; modes de fil ; `contenusRetenus` et `ordonner` ; `lireReglages`.
- `app/compte.js` : fusion des réglages avec `notions`.
- `app/fil.css` : styles du bac (sans style en ligne : variables CSS posées par `element.style.setProperty`).
- `app/sw.js` : nouvelle `VERSION`, `discotheque.js` dans `COQUILLE`.

## 6. Tests (navigateur, sans compte)

- Ordre des albums et pastilles avec des résultats préparés dans `localStorage` (deux matières à revoir, une
  avec des notions « À venir », une maîtrisée → vinyle doré).
- Glisser (défilement du bac) change l'album courant et ses pistes ; boutons « › » et flèches clavier aussi.
- « ▶ » d'une piste : le fil ne contient que des cartes de cette notion ; « Réviser l'album » : que cette matière.
- Cocher « À venir » : les cartes de la notion disparaissent de `contenusRetenus()` et du fil normal ; décocher
  les fait revenir ; la Survie annonce toujours toutes les questions. Cocher « DS passé » : ses cartes sont en fin
  d'`ordonner()`. Cocher l'une décoche l'autre. Les cases survivent au rechargement (`agon.reglages`).
- Zéro violation CSP, zéro erreur ; captures iPhone et PC du bac.
- Synchro des cases entre appareils : vérification manuelle (CAPTCHA).

## Hors périmètre

Pochettes illustrées (images), sons, tri manuel des albums, cases par carte, dates de DS.
