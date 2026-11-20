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

## Discothèque et cases

« Ta discothèque » (toucher la boule de l'accueil) remplace l'arbre : un bac à disques où chaque matière est un
album et chaque notion une piste. Les albums les plus urgents viennent d'abord ; le vinyle sort selon la part de
notions maîtrisées (doré quand tout l'est). Chaque piste : « ▶ » (réviser cette notion seule) et deux cases,
« À venir » (pas encore vue en cours : sort du fil) et « DS passé » (reste, mais en fin de fil). « Réviser l'album »
lance toute la matière. Les cases sont dans les réglages (`notions`), donc synchronisées ; la Survie les ignore.
Spec et plan : `docs/superpowers/specs/2026-11-20-discotheque-design.md`, `docs/superpowers/plans/2026-11-20-discotheque.md`.

## Classement Survie

Pseudo (Réglages → Compte), parties de Survie publiées (file locale `agon.parties`, envoyée à la synchro),
écran « Classement » : « Cette semaine » (depuis lundi, heure de Paris) et « Record ». La Survie tire toujours dans
toutes les matières pour que les scores se comparent. Base : `profils`, `parties_survie` (lisibles par leur seul
auteur), `classement()` qui ne renvoie que rang, pseudo et score ; limites anti-abus par trigger.
Spec et plan : `docs/superpowers/specs/2026-11-20-classement-survie-design.md`, `docs/superpowers/plans/2026-11-20-classement-survie.md`.
Suite prévue : amis, puis arène par code ; plus tard un portail d'accueil (compte, pseudo, import de fiches).

## Sécurité et données

Règles et décisions : `docs/superpowers/specs/2026-11-20-securite-rgpd-design.md` (à suivre pour toute nouvelle
table ou fonctionnalité ; sa section 5 liste ce qui est obligatoire avant d'ouvrir au grand public).

- **CSP** stricte dans `index.html` : seuls nos fichiers, Supabase et Turnstile. Pas de style ni de script en ligne.
- **Turnstile** (Cloudflare) protège « Recevoir un code » ; la clé secrète est dans Supabase (Attack Protection),
  jamais dans le dépôt.
- **RGPD** : page « Tes données » (réglages) avec export JSON ; suppression de compte ; comptes sans connexion
  depuis 2 ans purgés chaque lundi (`pg_cron`, schéma `private`).
- **Tests** (racine du dépôt, Edge installé) :
  `node tests/csp.test.mjs`, `node tests/turnstile.test.mjs`,
  `node tests/donnees.test.mjs`, `node tests/classement.test.mjs`, `node tests/discotheque.test.mjs`,
  et les blocs SQL de `tests/sql/` (annulés, résultat dans le message d'erreur).
  Le CAPTCHA étant actif, aucun test ne connecte de compte : la logique serveur est testée en SQL (rôles simulés),
  le parcours connecté se vérifie à la main sur l'iPhone.

## Contenus

`app/data/contenus.json` : une carte = `id`, `matiere`, `notion`, `format`, `donnees`.
Les cartes mal formées sont écartées au chargement (règles dans `app/validation.js`, partagées avec `outils/`).
Les cours sources (`sources/`) ne sont jamais versionnés.
