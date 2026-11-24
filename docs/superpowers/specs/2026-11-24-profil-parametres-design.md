# Profil et Paramètres (refonte de la page Réglages) — design

Date : 24/11/2026 · Statut : validé à l'oral, à relire par Ferdinand · Maquettes :
https://claude.ai/artifact/PJ5pGQMJeeA3yA6BcHxhtC (écrans « Profil B — zone remplie », « Paramètres »,
« Paramètres › Matières », « Modifier mon profil ») · Prérequis : `2026-11-23-portail-design.md`.

## Contexte et objectif

La boîte de dialogue « Réglages » mélange réglages de jeu, compte et actions dangereuses, avec trop de boutons
et trop de décor. Le profil créé par le portail (avatar, prénom, établissement) n'y est ni visible ni modifiable.
Ferdinand veut un **Profil** façon appli sociale, et un bouton **Paramètres** qui mène à des réglages rangés.

Critère de réussite : depuis n'importe quel écran à barre du bas, un appui sur sa mini-avatar ouvre son profil
(identité, stats, semaine, matières) ; « Modifier mon profil » change pseudo, avatar, prénom, établissement ;
la roue ⚙ ouvre des Paramètres en liste sobre où chaque réglage existant se retrouve ; rien ne régresse.

### Ce qui a été décidé

- Refonte complète découpée en morceaux. **Ce projet = morceau A** : Profil + Paramètres rangés, avec les
  réglages **qui existent déjà**. Projets suivants, chacun avec sa spec : sons et vibrations, objectif du jour,
  apparence, confidentialité sociale, rappels par notification. Aucune rubrique « bientôt » affichée en attendant.
- Profil : maquette **B « zone remplie »** (sobre, sans ombres d'autocollant ; stats sur une ligne ; blocs
  « Cette semaine » et « Tes matières »).
- Le bouton ☰ en haut à droite devient la **mini-avatar** du compte.

### Hors périmètre

Nouveaux réglages (voir ci-dessus), changement de parcours (un seul disponible), photo de profil, profil des
autres joueurs, refonte de l'accueil.

## 1. Navigation

- `#btn-reglages` (en-tête) affiche l'avatar du compte (`Portail.avatar(code, 36)`), `aria-label="Ton profil"`.
  Tant que le profil n'est pas chargé : un rond neutre. Un appui ouvre l'écran **Profil**.
- **Profil** : nouvel écran plein `<section class="f-accueil f-profil cache" id="profil">`, comme Classement :
  barre du bas visible **sans onglet actif** (`Nav.afficher("classement")` → renommer la valeur en `"aucun"`,
  même comportement).
- **Paramètres**, **Matières**, **Types de jeux**, **Modifier mon profil** : écrans plein écran empilés au-dessus
  du profil, barre du bas cachée, flèche ‹ (ou Annuler) en haut à gauche qui revient à l'écran précédent.
  Le bouton retour du navigateur / geste retour iOS n'est pas géré (comme aujourd'hui).
- La `<dialog id="reglages">` et son code disparaissent. `#donnees` (Tes données) reste une dialog, ouverte
  depuis Paramètres.
- `window.apresSynchro` et la fermeture redessinent l'écran visible ; en quittant Matières / Types de jeux après
  un changement, le fil est reconstruit comme aujourd'hui (`reglagesModifies`).

## 2. Profil

De haut en bas (maquette « Profil B — zone remplie ») :

- Roue ⚙ (`aria-label="Paramètres"`) en haut à droite.
- Avatar 104 px, pseudo, ligne `prénom · établissement · BUT info 1` (éléments vides omis), bouton
  « Modifier mon profil ».
- Stats sur une ligne entre deux filets : **vinyles** (`lireCollection().vinyles`), **record**
  (`lireRecordSurvie()`), **notions** (notions à l'état `maitrisee` de `notionsParEtat()`).
- **Cette semaine** : 7 pastilles L→D de la semaine en cours (lundi = début). Pastille jaune avec le nombre de
  cartes répondues ce jour-là, vide sinon ; aujourd'hui cerclé de blanc ; jours futurs atténués. À droite :
  « N jours sur 7 » (jours joués de la semaine). Données : § 4.
- **Tes matières** : une barre par matière = notions maîtrisées / notions de la matière (`notionsParEtat()` groupé
  par matière, matières exclues comprises), dans la couleur de la matière. Les 4 plus avancées (en %, puis
  ordre de `donnees.matieres`) ; « Tout voir » déplie les autres sur place (« Moins » les replie).
- Si le profil n'est pas encore chargé (hors ligne au premier lancement) : pseudo « … », le reste local s'affiche.

## 3. Modifier mon profil

- Le formulaire de l'étape « Présente-toi » du portail, **factorisé** pour servir aux deux : `portail.js`
  expose `Portail.formulaireProfil({ valeurs, surValider })` qui construit avatar (couleurs + symboles), pseudo,
  prénom, établissement, erreurs par champ et message ; le portail l'utilise avec des valeurs au hasard, le
  profil avec les valeurs actuelles.
- En-tête : « Annuler » (revient au profil sans rien changer) · titre · « Enregistrer ». Ligne « Parcours :
  BUT informatique · 1re année » en lecture seule. Mention : pseudo et avatar visibles ; prénom et établissement
  privés.
- Enregistrer appelle `Compte.enregistrerProfil` (existant : update si le profil existe) ; succès → retour au
  profil mis à jour ; erreurs : mêmes messages que le portail (pseudo pris, format, hors ligne).
- `Compte.lireProfil` lit désormais `pseudo, avatar, prenom, etablissement, parcours` (aujourd'hui `pseudo`
  seul) ; `Compte.profil()` les renvoie ; après enregistrement, `profil` garde toutes les valeurs. Aucun
  changement de base : colonnes, droits et RLS existent depuis le portail.

## 4. Activité de la semaine (nouvelle donnée, sans changer la base)

- `collection.jours` : `{ "AAAA-MM-JJ": nombre }`, nombre de réponses données ce jour-là (date locale). Rangé
  dans `agon.collection` → synchronisé par la colonne `collection` existante.
- `enregistrerResultat` incrémente le jour courant. On ne garde que les **14 derniers jours** (purge à chaque
  écriture). Valeurs bornées : entier 0–5000 par jour, clés au format date strict (le reste est ignoré à la
  lecture, local comme distant).
- Fusion (`compte.js`) : union des jours, **maximum** par jour, puis purge à 14 jours. Le reste de la fusion de
  `collection` ne change pas.
- Pas d'historique avant la mise à jour : la semaine en cours démarre vide.
- « Tes données » : la ligne « Ce qu'on garde » mentionne le nombre de cartes jouées par jour (14 derniers
  jours) ; l'export le contient déjà via la collection.

## 5. Paramètres

Liste sobre en cartes blanches groupées (maquette « Paramètres ») :

- **Jeu** : « Matières » (à droite : « 9 sur 9 ») → écran Matières ; « Types de jeux » (« Tous » ou « 4 sur 5 »)
  → écran Types de jeux. Chaque écran : une ligne par élément avec pastille de couleur (matières) et un
  **interrupteur** (`<button role="switch" aria-checked>`). Règle actuelle gardée : impossible de couper le
  dernier actif (l'interrupteur secoue).
- **Compte** : « E-mail » (lecture seule) ; « Synchronisation » avec l'état (`À jour`, `Synchronisation…`,
  `Hors ligne`, `Erreur`), un appui lance `Compte.synchroniser()` ; « Tes données et export » → `Donnees.ouvrir()`.
- **Se déconnecter** (carte seule).
- **Zone sensible** (texte rouge) : « Effacer ma progression » et « Supprimer mon compte », chacun avec la
  double confirmation de 4 s actuelle ; note sous le bloc : « Supprimer le compte efface ta progression, en
  ligne et sur cet appareil. »
- Pied : version de l'appli (message `version` du service worker, comme aujourd'hui).
- L'ancienne section Compte dessinée par `Compte.afficherDans` (pseudo + « Changer », boutons) ne sert plus
  qu'au portail (formulaire e-mail / code) ; la partie « connecté » est retirée de `compte.js`.

## 6. Code

- Nouveau `app/profil.js` (module `Profil`) : écrans Profil, Paramètres, Matières, Types de jeux, Modifier mon
  profil ; ajouté à `index.html`, à la coquille du service worker et à la CSP si besoin (même origine).
- `app.js` : retire la dialog Réglages ; expose ce que `profil.js` lit (`notionsParEtat`, `NOMS_FORMATS`,
  `reglages`, bascule matières/formats, effacer la progression, `reglagesModifies`).
- `portail.js` : `formulaireProfil` factorisé, `avatar` déjà exposé.
- `compte.js` : profil complet, fusion de `collection.jours`, section « connecté » retirée, `Compte.etat()`
  exposé pour la ligne Synchronisation.
- `fil.css` : styles `f-profil`, `f-param-*` (listes, interrupteurs) ; suppression des styles `f-reglages`
  propres à l'ancienne page (ceux de `#donnees` restent).
- `sw.js` : `VERSION` → `facettes-v36`.

## 7. Tests (`tests/profil.test.mjs`, session simulée)

1. L'avatar d'en-tête ouvre le Profil ; barre du bas visible sans onglet actif ; ⚙ → Paramètres → Matières →
   ‹ → ‹ revient au profil.
2. Couper une matière dans Matières : elle n'apparaît plus dans un fil construit ensuite ; impossible de couper
   la dernière ; idem Types de jeux.
3. Stats et « Tes matières » reflètent des résultats posés en `localStorage` ; « Tout voir » / « Moins ».
4. Activité : répondre à des cartes incrémente le jour courant ; fusion de deux `jours` = maximum par jour ;
   purge au-delà de 14 jours ; valeurs invalides ignorées (fonctions pures exposées).
5. Modifier mon profil : champs préremplis ; erreurs de format par champ ; Annuler ne change rien.
6. Effacer ma progression et Supprimer mon compte : double confirmation conservée (suppression testée comme le
   scénario 15 du portail, qui passe par Paramètres au lieu de `Compte.afficherDans`).
7. Tests existants mis à jour (portail, donnees, amis, classement, csp, app) ; captures iPhone et PC du Profil
   et des Paramètres ; 0 violation CSP, 0 erreur.
