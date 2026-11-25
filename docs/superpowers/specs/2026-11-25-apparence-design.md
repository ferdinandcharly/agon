# Apparence : thème clair « papier » et taille de l'affichage — design

Date : 25/11/2026 · Statut : validé à l'oral · Maquettes : https://claude.ai/artifact/PJ5pGQMJeeA3yA6BcHxhtC
(rangée « Thème clair », écrans « Clair papier — Profil » et « Clair papier — Paramètres »).

## Objectif

Une rubrique **Apparence** en haut des Paramètres, avec deux réglages synchronisés entre appareils :
**Thème** (Auto · Sombre · Clair) et **Taille de l'affichage** (Normale · Grande · Très grande).
Réussite : en Clair, tous les écrans « nuit » (accueil, discothèque, classement, amis, profil, paramètres, portail,
barre du bas, en-tête) passent sur fond papier avec un contraste ≥ 4,5:1 partout ; le fil de cartes (couleurs des
matières) ne change pas ; aucun flash de thème au démarrage ; la taille agrandit toute l'interface.

## Décisions

- Thème clair **papier** : fond `#FAF8F4`, texte encre `#16112B`, texte secondaire `#5E5A52`, texte faible
  `#8C877E` (uniquement pour du texte ≥ 18 px ou décoratif), filets `#E4DED3`, surface secondaire `#EFEAE0`.
  Autocollants inchangés (cartes blanches, contour encre) ; leurs **ombres et contours blancs** (pensés pour la nuit)
  deviennent **encre**. Accent de texte : violet `#6A3DF0` à la place du jaune (illisible sur papier) ; le jaune
  reste pour les fonds (pastilles, boutons). Barre du bas blanche, onglet actif violet sur `#EFEAE0`.
- **Auto** (défaut) suit `prefers-color-scheme` du système, en direct.
- **Taille** : `zoom` sur la page — 1 (Normale), 1,12 (Grande), 1,25 (Très grande). Les tailles du CSS sont en px :
  c'est la seule façon d'agrandir texte et cibles ensemble.
- Pas d'autres palettes (YAGNI).

## Données

- `reglages.apparence = { theme: "auto" | "sombre" | "clair", taille: "normale" | "grande" | "tres-grande" }` dans
  `agon.reglages`, lu/normalisé par `lireReglages` (valeurs inconnues → défauts). Changer l'apparence met à jour
  `reglages.maj` comme les autres réglages ; `fusionReglages` (compte.js) emporte `apparence` avec le bloc le plus
  récent (absente côté distant, ancienne version : on garde la locale).

## Application

- Nouveau `app/apparence.js`, chargé **dans le `<head>`** avant les feuilles de style (même origine, CSP inchangée) :
  lit `agon.reglages`, pose `data-theme` (`auto|sombre|clair`) et `data-taille` sur `<html>` avant le premier rendu ;
  expose `Apparence.appliquer(apparence)` et met à jour `<meta name="theme-color">` (nuit ou papier selon le thème
  effectif, y compris en Auto quand le système change).
- CSS : les couleurs de « chrome » nuit de `fil.css` passent par des variables (`--nuit`, `--sur-nuit`,
  `--sur-nuit-doux`, `--sur-nuit-faible`, `--filet-nuit`, `--nuit-2`, `--accent-texte-nuit`, `--ombre-sur-nuit`,
  `--nav-fond`…). Valeurs sombres = valeurs actuelles (aucun changement visuel en Sombre). Le thème papier les
  redéfinit sous `:root[data-theme="clair"]` et sous `@media (prefers-color-scheme: light) { :root[data-theme="auto"] }`.
  `COULEUR_NUIT` (app.js) lit la variable `--nuit` au lieu d'une constante.
- Les couleurs propres aux matières (`--c`, fil, Survie, Prise d'otage, tube) ne changent pas.

## Paramètres

- Rubrique **Apparence** en tête : deux sélecteurs segmentés (3 boutons `aria-pressed`, ≥ 44 px), comme la maquette.
  « Thème » : Auto · Sombre · Clair. « Taille de l'affichage » : trois « Aa » de tailles croissantes
  (`aria-label` Normale / Grande / Très grande). Effet immédiat.

## Hors périmètre

Thème des cartes du fil ; réglage par matière ; mode contraste élevé ; taille de police indépendante du zoom.

## Tests

Nouveau `tests/apparence.test.mjs` : réglage lu/normalisé/fusionné ; `data-theme`/`data-taille` posés avant le rendu
(page chargée avec `agon.reglages` prérempli → attribut présent au premier `DOMContentLoaded`) ; Auto suit
`prefers-color-scheme` (émulation CDP `Emulation.setEmulatedMedia`) ; boutons des Paramètres ; **audit de contraste
automatique** en Clair et en Sombre sur accueil, discothèque, classement, amis, profil, paramètres, portail (texte
visible : ratio ≥ 4,5:1, ou ≥ 3:1 au-dessus de 18 px gras) ; zoom appliqué ; captures iPhone des écrans en Clair.
Version `facettes-v38`.
