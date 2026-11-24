# Corrections du bilan (v37) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Appliquer les corrections A–E de la spec (onglet Profil, profil gardé en local, Modifier refait, bugs de synchro, bouton Quitter, finitions).

**Architecture:** Changements locaux dans les modules existants (`compte.js`, `profil.js`, `portail.js`, `nav.js`, `app.js`, `fil.css`, `index.html`) ; aucune modification de base.

**Tech Stack:** JS sans framework, tests Node + Edge (`tests/navigateur.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-24-corrections-bilan-design.md`

## Global Constraints

- Commentaires/textes en français ; CSP `style-src 'self'` (pas d'attribut style, `style.setProperty` permis).
- Cibles ≥ 44 px ; `sw.js` `VERSION = "facettes-v37"`.
- Chaque test : `node tests/<nom>.test.mjs` depuis la racine → dernière ligne `OK — …`.

## Review Focus

1. Démarrage hors ligne avec un cache `agon.profil` d'un AUTRE compte : il ne doit jamais s'afficher. → T1.
2. Déconnexion puis reconnexion d'un autre compte : l'onglet Profil n'affiche pas l'ancien pseudo. → T1.
3. Abandon de Survie à 0 bonne réponse : pas de record, pas d'erreur, retour accueil. → T4.
4. Retour au premier plan pendant une Prise d'otage ou hors Survie : aucun effet. → T4.
5. Modifier : double appui rapide sur Enregistrer → un seul envoi. → T2.

---

### Tâche 1 : Onglet Profil et profil gardé sur l'appareil
**Files:** `app/index.html` (nav + en-tête), `app/nav.js`, `app/profil.js`, `app/compte.js`, `app/fil.css`, `tests/profil.test.mjs` (+ adapter classement, csp, app, portail qui utilisent `#btn-reglages`)
**Interfaces:** Produces `Compte.profilAffiche() -> objet|null` ; clé `agon.profil` ; `Nav.afficher("profil")`.
- [ ] Tests : onglet `[data-onglet=profil]` ouvre le Profil et devient `aria-current` ; `#btn-reglages` absent ; cache posé pour le même `user_id` → au rechargement hors ligne pseudo et avatar affichés ; cache d'un autre `user_id` ignoré (initiale de l'e-mail affichée, `.f-avatar-initiale`) ; `violet-facette` → ligne d'invitation qui ouvre Modifier.
- [ ] Lancer → échec. Implémenter. Lancer profil + suites adaptées → OK. Commit.

### Tâche 2 : Modifier mon profil refait
**Files:** `app/profil.js`, `app/portail.js` (ordre aperçu/choix), `app/fil.css`, `tests/profil.test.mjs`, `tests/portail.test.mjs`
- [ ] Tests : `.f-param-retour` présent, pas de `.f-param-annuler` ; bouton `.f-lancer-session` « Enregistrer » en bas ; message d'erreur placé avant le bouton ; pastilles `.f-portail-couleur` et `.f-portail-symbole` ≥ 44 px (getBoundingClientRect) ; succès → `.f-profil-ok` « Profil mis à jour » ; double clic → un seul appel à `enregistrerProfil`.
- [ ] Échec → implémenter → OK (profil, portail). Commit.

### Tâche 3 : Bugs de synchro
**Files:** `app/compte.js`, `app/app.js` (`lireResultats`), `app/portail.js`, `tests/profil.test.mjs`
- [ ] Tests : (a) synchro simulée lente (`from` renvoyant une promesse qu'on résout à la main) en vol pendant `Compte.supprimer()` (rpc simulé) → après résolution, `agon.resultats` et `agon.survie` restent vides ; (b) `agon.resultats` = `{"x": null, ...}` → `lireResultats()` sans `x` et `Compte.fusionner` ne lève pas ; (c) profil `null` lu → `Portail` ouvre l'étape 3 sans attendre `facettes:synchro`.
- [ ] Échec → implémenter (id capturé, drapeau `suppression`, attente de `enCours`, filtres, écouteur `facettes:profil`, `console.warn`) → OK. Commit.

### Tâche 4 : Bouton Quitter et Survie en arrière-plan
**Files:** `app/index.html` (`#btn-quitter` dans l'en-tête), `app/app.js`, `app/fil.css`, `tests/profil.test.mjs` (ou `tests/app.test.mjs`)
**Interfaces:** `window.abandonnerSurvie` posé par la Survie en cours (null sinon).
- [ ] Tests : `#btn-quitter` visible seulement dans le fil, 44 px, ramène à l'accueil ; Survie lancée → 1er appui « Abandonner ? », 2e → écran de fin puis accueil, record inchangé à 0 point ; Survie : `restant` lu, puis `document.dispatchEvent(new Event("visibilitychange"))` après avoir simulé une longue pause (exposer un crochet de test `window.__survie` avec `restant`/`decaler(ms)`) → le temps n'a pas chuté.
- [ ] Échec → implémenter → OK. Commit.

### Tâche 5 : Finitions
**Files:** `app/fil.css`, `app/portail.js`, `app/compte.js`, `app/donnees.js`, `supabase/schema.sql`, `app/sw.js`, tests concernés
- [ ] Test : mesure des cibles (▶ piste, cases DS, lien Tes données et Retour du portail, onglets Classement, Fermer de Tes données) ≥ 44 px ; titre portail 2 « Connecte-toi ou crée ton compte » ; une seule occurrence de « Pas de mot de passe » à l'étape 2 ; champ e-mail ≥ 300 px de large sur iPhone ; `getComputedStyle(.f-entete).backgroundColor` non transparent sur l'accueil ; nav ≤ 560 px de large sur PC.
- [ ] Échec → implémenter (y compris contraste « bientôt », textes « paramètres », v37) → suite complète 10/10 → captures iPhone/PC vérifiées. Commit.
