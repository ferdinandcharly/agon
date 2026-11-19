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

## Contenus

`app/data/contenus.json` : une carte = `id`, `matiere`, `notion`, `format`, `donnees`.
Les cartes mal formées sont écartées au chargement (voir `VALIDATEURS` dans `app/app.js`).
Les cours sources (`sources/`) ne sont jamais versionnés.
