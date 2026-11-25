# Apparence — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Thème Auto/Sombre/Clair (papier) et taille de l'affichage, réglés dans Paramètres et synchronisés.
**Architecture:** `apparence.js` dans le `<head>` pose `data-theme`/`data-taille` ; `fil.css` passe ses couleurs nuit en variables redéfinies par le thème papier ; réglage stocké dans `reglages.apparence`.
**Tech Stack:** JS sans framework, CSS variables, tests Node + Edge (CDP).
**Spec:** `docs/superpowers/specs/2026-11-25-apparence-design.md`

## Global Constraints
- CSP `style-src 'self'` inchangée (pas d'attribut style ; `setProperty` permis).
- Sombre = rendu actuel au pixel près (les variables prennent les valeurs actuelles).
- Contraste ≥ 4,5:1 (≥ 3:1 pour ≥ 18 px gras) dans les deux thèmes ; cibles ≥ 44 px.
- `VERSION = "facettes-v38"` ; `apparence.js` dans `COQUILLE`.

## Review Focus
1. Premier lancement sans `agon.reglages` : Auto, pas d'erreur, pas de flash. → T1.
2. `agon.reglages.apparence` abîmé (`"x"`, `{theme: 3}`) : défauts. → T1.
3. Appareil v37 (sans `apparence`) qui synchronise : l'apparence locale est gardée. → T1.
4. Auto + changement du thème système pendant que l'appli est ouverte : bascule en direct, `theme-color` suit. → T3.
5. Très grande taille sur iPhone 375 px : rien ne déborde horizontalement (barre du bas, Paramètres). → T4.

---

### Tâche 1 : Réglage `apparence` (données, application précoce, Paramètres)
**Files:** create `app/apparence.js` ; modify `app/index.html` (head), `app/app.js` (lireReglages), `app/compte.js` (fusionReglages), `app/profil.js` (rubrique), `app/fil.css` (sélecteur segmenté), `app/sw.js` ; create `tests/apparence.test.mjs`.
**Interfaces:** `Apparence.normaliser(a) -> {theme, taille}` ; `Apparence.appliquer(a)` ; `Apparence.effectif() -> "sombre"|"clair"`.
- [ ] Tests : normalisation (défauts, valeurs abîmées) ; `lireReglages().apparence` ; `Compte.fusionner` garde la locale si distant sans `apparence`, prend la distante si plus récente ; page chargée avec réglage `clair` → `document.documentElement.dataset.theme === "clair"` dès `DOMContentLoaded` ; Paramètres : boutons Thème et Taille (`aria-pressed`, ≥ 44 px), clic → attributs et `reglages.apparence` mis à jour.
- [ ] Échec → implémenter → OK + suites existantes. Commit.

### Tâche 2 : Couleurs nuit en variables (aucun changement visuel)
**Files:** `app/fil.css`, `app/app.js` (`COULEUR_NUIT`).
- [ ] Test : capture de référence (accueil, profil, paramètres, discothèque, portail) AVANT, puis comparaison pixel à pixel APRÈS (script de capture ; même rendu attendu). Plus `grep` : aucune des couleurs nuit (`#16112B` hors encre des autocollants, `#3A3260`, `#2A2347`, `#CFC9E8`, `#B9B4D6`, `#8A84A6`, `#6F6896`, `#9A94BC`) en dur dans les règles d'écrans nuit.
- [ ] Remplacer, vérifier l'égalité des captures, suites OK. Commit.

### Tâche 3 : Thème papier
**Files:** `app/fil.css`, `app/apparence.js` (theme-color, écoute de `prefers-color-scheme`).
- [ ] Test : audit de contraste automatique (tous les nœuds texte visibles des écrans listés, couleur effective du texte vs fond effectif) en Clair ET Sombre → 0 échec ; Auto + `Emulation.setEmulatedMedia` light/dark → `Apparence.effectif()` et `theme-color` suivent.
- [ ] Valeurs papier, corrections au fil de l'audit, captures iPhone Clair regardées. Commit.

### Tâche 4 : Taille de l'affichage
**Files:** `app/fil.css`.
- [ ] Test : `data-taille="tres-grande"` → `zoom` 1,25 ; à 375 px, `document.documentElement.scrollWidth <= 375` sur accueil, profil, paramètres ; barre du bas entièrement visible.
- [ ] Implémenter, corriger les débordements. Suite complète 11/11. Commit.
