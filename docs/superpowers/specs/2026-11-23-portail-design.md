# Portail d'accueil (création de compte guidée) — design

Date : 23/11/2026 · Statut : validé à l'oral, à relire par Ferdinand · Prérequis : `2026-11-20-securite-rgpd-design.md`,
`2026-11-20-classement-survie-design.md`, `2026-11-23-amis-design.md`.

## Contexte et objectif

Aujourd'hui l'appli marche sans compte, et le compte se crée caché dans Réglages → Compte. Avec le classement et
les amis, Facettes devient sociale : Ferdinand veut un **compte obligatoire**, créé par un **portail** au premier
lancement, qui fixe aussi le **parcours** (préparation de l'ouverture à d'autres formations) et le **profil** de la
personne.

Critère de réussite : une personne qui ouvre Facettes pour la première fois choisit son parcours, crée son compte
(code par e-mail), renseigne son pseudo et son avatar, puis arrive sur l'accueil ; personne n'accède aux cartes sans
compte ; les potes qui jouaient sans compte gardent leur progression.

### Ce qui a été décidé

- Compte **obligatoire** (pas de « Plus tard »).
- Trois étapes : **Parcours** → **Compte** → **Infos sur toi**.
- Parcours : un seul disponible, « BUT informatique, 1re année » (`but-info-1`) ; « 2e année » et « Autres
  formations » affichés grisés « bientôt ».
- Infos : **pseudo** (obligatoire, public), **avatar** couleur + symbole (obligatoire, public : classement et
  amis), **prénom** (facultatif, privé), **établissement ou ville** (facultatif, privé pour l'instant).

### Hors périmètre

Import de ses propres cours par les utilisateurs (projet à part, demande une génération automatique), autres
parcours que `but-info-1`, classements par établissement, photo de profil, refonte de l'accueil.

## 1. Base de données (Supabase, projet `facettes`)

### Colonnes de `profils`

```sql
alter table public.profils
  add column parcours text not null default 'but-info-1' check (parcours in ('but-info-1')),
  add column avatar text not null default 'violet-facette'
    check (avatar ~ '^(orange|jaune|vert|bleu|violet|rose|cyan)-(facette|etoile|note|eclair|coeur|vinyle)$'),
  add column prenom text check (prenom ~ '^[[:alpha:]][[:alpha:] ''-]{0,29}$'),
  add column etablissement text check (char_length(etablissement) between 2 and 60 and etablissement !~ '[[:cntrl:]<>]');
grant update (parcours, avatar, prenom, etablissement) on table public.profils to authenticated;
```

- Le profil reste lisible et modifiable par son seul propriétaire (policies existantes).
- **Public** (vu des autres via fonctions) : pseudo, avatar. **Privé** : prénom, établissement, parcours.

### Fonctions modifiées (même sécurité qu'avant : `security definer`, `search_path = ''`, `authenticated` seulement)

Le type de retour change : `drop function` puis `create function` dans la même migration.

- `classement(periode, p_parcours)` → ajoute la colonne `avatar text` (après `pseudo`).
- `classement_amis(periode, p_parcours)` → ajoute `avatar text`.
- `mes_amis()` → ajoute `avatar text` pour toutes les relations (l'avatar est public comme le pseudo).
- Aucune ne renvoie `prenom`, `etablissement` ni `parcours`.

### Données personnelles

« Tes données » : ajouter prénom et établissement (facultatifs, jamais montrés aux autres) et l'avatar (visible
comme le pseudo). L'export lit ces colonnes. La suppression de compte les efface (cascade existante).

## 2. Appli

### Quand le portail s'affiche (`app/portail.js`, section `#portail` plein écran)

Décision prise au démarrage, après le chargement des cartes, sans attendre le réseau :

| Situation | Affichage |
|---|---|
| Aucune session gardée sur l'appareil | Portail, étape 1 (Parcours) |
| Session gardée | Accueil ; si la première lecture du profil renvoie « pas de profil » (`Compte.profil() === null`), le portail s'ouvre à l'étape 3 |
| Pas de session et hors ligne | Portail avec le message « Connecte-toi à Internet pour créer ton compte » et « Réessayer » |
| Déconnexion depuis les réglages, ou suppression du compte | Retour au portail, étape 1 |

- Tant que le portail est affiché : barre d'onglets, en-tête (logo et menu) et accueil cachés ; aucun moyen
  d'atteindre le fil.
- La progression locale existante n'est pas touchée : elle est fusionnée avec le compte à la première synchro
  (mécanisme existant).

### Les étapes

Un indicateur « 1 · 2 · 3 » en haut, un bouton « Retour » (sauf à l'étape 1 et une fois connecté).

1. **Parcours** : titre « Tu révises quoi ? » ; une carte sélectionnable « BUT informatique — 1re année »
   (choisie d'office) ; deux cartes grisées non cliquables « BUT informatique — 2e année · bientôt » et « Autres
   formations · bientôt » ; bouton « Continuer ».
2. **Compte** : titre « Crée ton compte » ; le formulaire existant de `compte.js` (e-mail, Turnstile, code à 6
   chiffres), affiché dans le portail. Dès la connexion réussie : étape 3 (ou l'accueil si le compte a déjà un
   profil complet).
3. **Infos sur toi** : titre « Présente-toi » ;
   - Pseudo (obligatoire, mêmes règles et messages que `Compte.messagePseudo`, pseudo pris → message) ;
   - Avatar : 7 couleurs (`orange #FF6B3D`, `jaune #FFC21A`, `vert #00C08B`, `bleu #3D5AFE`, `violet #7B4DFF`,
     `rose #FF5FA2`, `cyan #2FD3E0`) × 6 symboles dessinés en SVG (facette, étoile, note, éclair, cœur, vinyle),
     aperçu en direct ; par défaut une combinaison tirée au hasard ;
   - Prénom (facultatif) ; Établissement ou ville (facultatif) ; mention « Privé : jamais montré aux autres. » ;
   - « C'est parti » : crée ou met à jour le profil (parcours compris), puis accueil.

### Après le portail

- Réglages → Compte : avatar + pseudo (+ prénom s'il existe) et « Modifier mon profil », qui rouvre l'étape 3
  pré-remplie (bouton « Annuler » qui revient aux réglages).
- L'avatar s'affiche devant le pseudo dans le classement général, le classement des amis et la liste des amis.
- La carte « Installe Facettes » reste sur l'accueil.

### Composant avatar (`Portail.avatar(code, taille) → Element`)

Rond de la couleur, symbole blanc au centre, contour `var(--encre)`. Code invalide ou absent → `violet-facette`.

## 3. Erreurs et cas limites

- Pseudo pris, format invalide, prénom ou établissement invalides : message sous le champ, rien n'est envoyé tant
  que la vérification locale échoue (mêmes formats qu'en base).
- Perte de réseau à l'étape 3 : « Pas de connexion, réessaie », les saisies restent.
- Session expirée au démarrage (jeton refusé) : `compte.js` déconnecte → retour au portail étape 1.
- Un ancien compte sans avatar, prénom ni parcours : valeurs par défaut en base, pas de portail (le pseudo suffit).

## 4. Tests

- **SQL** (`tests/sql/portail.sql`) : formats refusés (avatar, prénom avec chiffre, établissement trop court ou
  avec `<`, parcours inconnu) ; un autre compte ne lit pas prénom/établissement ; `classement`, `classement_amis`
  et `mes_amis` renvoient l'avatar et jamais prénom/établissement.
- **Navigateur** (`tests/portail.test.mjs`) : sans session → portail étape 1, ni barre ni accueil, le fil
  inatteignable ; navigation 1 → 2 → Retour ; hors ligne sans session → message et Réessayer ; étape 3 :
  vérifications locales (pseudo, prénom, établissement) sans requête, aperçu de l'avatar ; composant avatar
  (code invalide → défaut) ; 0 violation CSP.
- **Tests existants** : ils supposent une appli utilisable sans compte. Ils passent désormais par une **session
  simulée** (session factice déposée dans le stockage avant le chargement + domaine Supabase bloqué, ce qui
  revient à un compte connecté hors ligne) ; les scénarios « sans compte » des écrans (classement, amis, livret)
  deviennent des scénarios du portail.
- **À la main (Ferdinand)** : création d'un compte neuf de bout en bout sur iPhone, puis « Modifier mon profil »,
  déconnexion → portail.
