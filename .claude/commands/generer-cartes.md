---
description: Génère des cartes Facettes à partir des cours déposés dans sources/ (ou d'une page Notion), dans un lot à relire
argument-hint: "[fichier ou dossier dans sources/, ou nom d'une page Notion] [nombre de cartes]"
---

Tu génères des cartes de révision pour **Facettes** (BUT informatique, 1re année) à partir d'un cours.
Cible : $ARGUMENTS (par défaut : tout ce qui est nouveau dans `sources/`, environ 15 cartes par cours).

## 0. Récupérer les cours du livret

- Lance `node outils/recuperer-cours.mjs` : les cours ajoutés depuis l'appli (bouton « + » d'un album) arrivent dans
  `sources/<matiere>/`. S'il manque la clé secrète, l'outil explique quoi mettre dans `.env` : transmets le message
  à Ferdinand, ne demande jamais la clé et ne la lis pas.
- `sources/<matiere>/.documents.json` relie chaque fichier récupéré à l'id de son document : note les ids des
  fichiers que tu utilises.

## 1. Lire avant d'écrire

- Lis `app/data/contenus.json` : les matières existantes (`matieres`), les notions déjà couvertes, le style des cartes. Ne refais pas une carte qui existe.
- Lis la source : PDF, photos (cahier, TD), Markdown, ou la page Notion demandée (outils Notion). Une photo floue ou illisible : dis-le, ne devine pas.
- Repère les notions du cours (une notion = une idée qu'on peut réviser seule).

## 2. Écrire les cartes

Mélange les formats : pour chaque notion importante, 1 fiche courte puis 1 à 3 jeux de formats différents.
Formats et forme exacte de `donnees` :

- `fiche` : `{"titre", "paragraphes": [2 à 3 phrases courtes], "a_retenir"}`
- `vrai_faux` : `{"affirmation", "reponse": true|false, "explication"}`
- `trous` : `{"texte" avec exactement un "___", "reponse", "choix": [4 propositions dont la réponse], "explication"}`
- `associer` : `{"consigne", "paires": [[gauche, droite], … 3 à 5], "explication"}`
- `ordre` : `{"consigne", "etapes": [dans le BON ordre, 3 à 7], "explication"}`
- `erreur` : `{"consigne", "lignes": [code, une ligne par élément], "ligne_fausse": index à partir de 0, "correction", "explication"}`

Chaque carte : `{"id", "matiere", "notion", "format", "donnees"}`.
`id` = `<matiere>-<notion-en-minuscules-avec-tirets>-<format>` (ajoute `-2`, `-3` si besoin). `matiere` = un id existant ; une matière nouvelle se déclare dans `matieres` du lot (`{"id", "nom"}`).

## 3. Règles de qualité (une carte fausse est pire que pas de carte)

- **Uniquement ce que dit la source**, ou un fait de cours certain. Dans le doute, pas de carte.
- Une seule idée par carte. Phrases courtes, français correct, espace insécable (U+00A0) avant `?`, `!` et `:`.
- `vrai_faux` : pas de double négation, pas de piège sur un détail de formulation ; environ moitié vrai, moitié faux.
- `trous` : une seule réponse possible ; les 3 autres choix sont plausibles et de la même catégorie (pas de choix absurde).
- `erreur` : exactement UNE ligne fausse, toutes les autres correctes ; garde le langage du cours (Python, SQL, C, HTML…) ; lignes de 34 caractères maximum (écran de téléphone).
- `ordre` : un seul ordre défendable.
- `explication` : dit pourquoi, en une ou deux phrases ; elle s'affiche après la réponse.

## 4. Enregistrer et vérifier

1. Écris le lot dans `a-relire/lot-AAAA-MM-JJ-HHMM.json` : `{"source": "<fichier ou page>", "documents": [<ids des cours du livret utilisés>], "matieres": [], "contenus": [ … ]}` (`documents` vide si aucun cours du livret). À la fusion, ces cours passent à « transformé en cartes ».
2. Lance `node outils/valider.mjs <ce fichier>` et corrige jusqu'à 0 problème.
3. Relis toi-même chaque carte affichée par le validateur contre la source ; retire celles dont tu n'es pas sûr.
4. Termine par : le chemin du lot, le nombre de cartes par format et par notion, et les cartes qui méritent un œil attentif.

**Ne fusionne jamais toi-même.** C'est Ferdinand qui relit puis lance `node outils/fusionner.mjs <lot>`.
