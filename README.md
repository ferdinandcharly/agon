# Facettes

Anciennement Agon.

Fil de révision du BUT informatique, à la manière d'un fil TikTok : on glisse d'une carte à l'autre,
fiches de lecture et petits jeux alternent (vrai ou faux, texte à trous, associer, remettre dans l'ordre,
trouve l'erreur). Une couleur par matière.

PWA sans framework (HTML/CSS/JS), installable sur iPhone et PC.

## Lancer en local

```
cd app
py -m http.server 8765
```
puis ouvrir http://localhost:8765

## Mettre en ligne

L'appli est servie par GitHub Pages depuis la branche `gh-pages`, qui contient seulement le dossier `app/` :

```
git subtree push --prefix app origin gh-pages
```

Penser à changer `VERSION` dans `app/sw.js` à chaque livraison, sinon les téléphones gardent l'ancienne version.

## Générer des cartes depuis ses cours

1. Déposer le cours dans `sources/` (PDF, photos du cahier, Markdown). Le dossier n'est jamais versionné.
2. Dans Claude Code, à la racine du projet : `/generer-cartes sources/<fichier>` (ou le nom d'une page Notion).
   Claude écrit un lot dans `a-relire/` et le vérifie avec `node outils/valider.mjs <lot>`.
3. Relire : `node outils/valider.mjs a-relire/<lot>.json` affiche chaque carte en clair.
   Supprimer du fichier les cartes refusées.
4. Ajouter au fil : `node outils/fusionner.mjs a-relire/<lot>.json` (refuse tout le lot s'il reste une erreur).

## Répétition espacée

Chaque jeu a une boîte de 1 à 5 (raté → boîte 1, réussi → boîte suivante). Il redevient prioritaire après
0, 1, 3, 7 ou 14 jours selon sa boîte ; le fil commence par les jeux dus, les ratés en premier
(pastille « À revoir »).

## Compte et synchro (Supabase)

Projet Supabase `facettes` (Paris, offre gratuite). Une table `progression` (une ligne par compte, RLS),
une fonction `supprimer_mon_compte` ; schéma de référence dans `supabase/schema.sql`.
Connexion par code à 6 chiffres reçu par e-mail (un lien s'ouvrirait dans Safari, pas dans l'appli installée).
Sans compte, tout reste en local. Avec un compte, `app/compte.js` fusionne : carte par carte la réponse la plus
récente gagne, collection et record le plus grand gagne, une remise à zéro vaut pour tous les appareils.
`supabase-js` est auto-hébergé dans `app/vendor/` (version figée) pour marcher hors ligne.

## Contenus

`app/data/contenus.json` : une carte = `id`, `matiere`, `notion`, `format`, `donnees`.
Les cartes mal formées sont écartées au chargement (règles dans `app/validation.js`, partagées avec `outils/`).
Les cours sources (`sources/`) ne sont jamais versionnés.
