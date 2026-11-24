# Corrections issues du bilan (visuel, ergonomie, code) — v37 — design

Date : 24/11/2026 · Statut : validé à l'oral (« go ») · Prérequis : `2026-11-24-profil-parametres-design.md`.

## Contexte

Trois bilans (visuel, ergonomique, code) sur la v36. Rien de bloquant ; Ferdinand trouve l'accès au compte « pas beau
ni pratique » (rond sans sa « pdp ») et l'en-tête de « Modifier mon profil » mal fichu. Décisions :

- Le Profil devient le **4e onglet de la barre du bas**, avec une **icône dessinée** (buste) comme les autres onglets,
  **pas l'avatar**. Le bouton rond en haut à droite disparaît.
- Pas de photo de profil : l'avatar reste couleur + symbole.

## A. Navigation et profil

- Barre du bas : Disco · Accueil · Amis · **Profil** (`data-onglet="profil"`, icône buste en trait, libellé « Profil »).
  `Nav.afficher("profil")` sur le Profil (onglet actif) ; Paramètres, Matières, Types de jeux, Modifier : barre cachée
  (inchangé). `#btn-reglages` est supprimé de l'en-tête ainsi que `majEntete`, `.f-avatar-vide` et
  `body.profil-ouvert .f-menu`.
- Roue ⚙ du Profil : 44 px, en haut à droite de la colonne, alignée sur l'axe de la pilule « Facettes »
  (plus de `margin-top: -60px` approximatif : position calculée sur `--haut`).
- **Profil gardé sur l'appareil** : `compte.js` écrit `agon.profil` = `{ user_id, pseudo, avatar, prenom,
  etablissement, parcours }` à chaque profil lu ou enregistré ; effacé par `oublierCachesDuCompte` (déconnexion,
  changement de compte, suppression). `Compte.profilAffiche()` = profil lu, sinon le cache du même `user_id`, sinon
  `null`. `Compte.profil()` garde son sens (`undefined` = pas encore lu) pour le portail, le classement et les amis.
  `profil.js` n'utilise plus que `profilAffiche()`. Au démarrage avec cache, `facettes:profil` est émis.
- Profil sans rien d'affichable : rond neutre avec l'**initiale de l'e-mail** (classe `f-avatar-initiale`), plus le
  motif `violet-facette` qui ressemble au logo.
- Avatar `violet-facette` (valeur par défaut en base) : sous « Modifier mon profil », une ligne « Choisis ton avatar :
  celui-ci est celui par défaut. » qui ouvre « Modifier mon profil ».

## B. Modifier mon profil

- En-tête comme Paramètres : flèche ‹ (`.f-param-retour`) + titre `.f-param-titre` 30 px. Plus de « Annuler ».
- Formulaire, puis note Parcours, puis **message d'erreur juste au-dessus** d'un **gros bouton jaune « Enregistrer »**
  en bas (même composant que « C'est parti » du portail : `.f-lancer-session`), désactivé pendant l'appel.
- Pastilles de couleur et symboles à **44 × 44 px** (portail et Modifier) ; l'aperçu de l'avatar passe au-dessus,
  centré.
- Retour au Profil après succès avec un message « Profil mis à jour » (`.f-profil-ok`, `role="status"`, 3 s).

## C. Bugs

1. **Synchro et suppression / changement de compte** : `synchroniser()` note `const id = utilisateur.id` au départ ;
   après chaque `await`, s'arrête sans rien écrire si `utilisateur?.id !== id` ou si une suppression a commencé.
   `supprimer()` pose `suppression = true`, attend la synchro en cours, puis vide le local.
2. **Entrée non-objet dans `agon.resultats`** (ex. `null`) : ignorée par `lireResultats` et par
   `fusionnerResultats` (côté local comme distant) ; la synchro ne reste plus bloquée en « erreur ».
3. **Portail étape 3** : `suiteSelonProfil` écoute aussi `facettes:profil` (le profil `null` suffit à ouvrir
   « Présente-toi » même si la suite de la synchro échoue).
4. `lireProfil` en échec pendant la synchro : `console.warn` au lieu d'un `catch` muet.

## D. Sessions

- Pendant le fil, un bouton **« ✕ »** (`#btn-quitter`, `aria-label="Quitter la session"`, 44 px, autocollant blanc)
  en haut à droite, à la place de l'ancien bouton ; il ramène à l'accueil.
- Pendant une **Survie** en cours : premier appui → libellé « Abandonner ? » pendant 4 s ; second appui → la partie
  se termine comme un temps écoulé (score compté, record éventuel) puis retour à l'accueil. Pendant une Prise d'otage
  (quelques secondes) le bouton est désactivé.
- Survie et changement d'appli : quand la page redevient visible, le temps passé en arrière-plan **n'est pas décompté**
  (pause). La question reste la même.

## E. Finitions

- En-tête : fond nuit sous la pilule hors du fil (`body:not(.fil-ouvert) .f-entete`), pour que le contenu ne passe plus
  dessous en défilant.
- PC (≥ 700 px) : en-tête et barre du bas centrés, largeur max 560 px.
- Cibles ≥ 44 px : ▶ de piste, cases « À venir / DS passé » (zone tactile agrandie), flèches du bac, lien « Tes
  données » et « ← Retour » du portail, onglets Classement/Amis, « Fermer » de Tes données, options Associer.
- Contraste : « bientôt » du portail en `#9A94BC`.
- Portail étape 2 : titre « Connecte-toi ou crée ton compte » ; champ e-mail pleine largeur, bouton dessous
  (sous 420 px) ; la phrase « Pas de mot de passe » n'apparaît qu'une fois.
- Textes : « réglages » → « paramètres » (donnees.js) ; commentaire de `supabase/schema.sql` sur les colonnes
  modifiables de `profils`.

## Hors périmètre

Photo de profil ; confirmation avant d'abandonner des modifications ; renvoi du code ; historique de navigation ;
focus déplacé sur le titre à chaque écran (bilan ergonomique, à reprendre dans un lot accessibilité).

## Tests

`tests/profil.test.mjs` étendu (onglet Profil, cache du profil hors ligne, initiale, invitation avatar par défaut,
Modifier refait, message de succès) ; nouveaux scénarios : synchro pendant suppression (le local reste vide), entrée
`null` dans les résultats, étape 3 sur `facettes:profil`, bouton ✕ et abandon de Survie, pause en arrière-plan
(`visibilitychange` simulé), cibles ≥ 44 px mesurées sur les écrans cités. Tests existants adaptés (`#btn-reglages`
disparaît). Version `facettes-v37`.
