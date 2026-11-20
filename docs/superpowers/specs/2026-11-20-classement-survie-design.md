# Classement Survie (projet 1/3 : profil + classement général) — design

Date : 20/11/2026 · Statut : validé à l'oral, à relire par Ferdinand · Prérequis : `2026-11-20-securite-rgpd-design.md` (ses règles générales s'appliquent ici)

## Contexte et objectif

Facettes est testé par quelques amis et les retours sont bons. Ferdinand veut une dimension sociale,
découpée en trois projets successifs, chacun avec sa spec :

1. **Profil + classement général** (ce document) : un pseudo, les parties de Survie publiées, un classement
   « Cette semaine » et « Record ».
2. Amis : demandes par pseudo, onglet « Mes amis » dans le classement.
3. Arène par code : un groupe joue ensemble (direct ou différé, à décider).

But du projet 1 : donner envie de revenir et de se défier. Critère de réussite : Ferdinand et ses amis
se voient dans un même classement, l'onglet de la semaine repart à zéro chaque lundi, et rien ne casse
sans compte ou hors ligne.

### Ce qui a été décidé

- Score classé : le **mode Survie** (bonnes réponses d'affilée).
- Deux onglets : **Cette semaine** (meilleur score depuis lundi 0 h, heure de Paris) et **Record** (de tous
  les temps).
- La Survie tire **toujours dans toutes les matières** du parcours, quels que soient les réglages, pour que
  les scores soient comparables.
- Approche A : une ligne par partie + table de profils, garde-fous simples dans la base. Pas d'anti-triche
  serveur : le score est calculé sur l'appareil, donc falsifiable ; acceptable entre amis. Passage possible
  plus tard à une fonction serveur de contrôle (approche C) sans changer le reste.
- Préparation au grand public : chaque partie porte un **parcours** (`but-info-1` pour l'instant) ; les
  classements sont filtrés par parcours.

### Données personnelles

- Le pseudo et le meilleur score sont visibles des autres comptes connectés ; rien d'autre. La page
  « Tes données » et l'export (socle RGPD) incluent le profil et les parties ; la suppression de compte les
  efface et vide la file locale `agon.parties`.

### Hors périmètre

Amis, arène, classement des autres jeux, notifications, anti-triche serveur, cartes en base de données.

## 1. Base de données (Supabase, projet `facettes`)

### Tables

```sql
create table public.profils (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  pseudo  text not null check (pseudo ~ '^[A-Za-z0-9_-]{3,20}$'),
  cree_le timestamptz not null default now()
);
create unique index profils_pseudo_unique on public.profils (lower(pseudo));

create table public.parties_survie (
  id       uuid primary key,                 -- généré par l'appli : un renvoi ne crée pas de doublon
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  score    integer not null check (score between 0 and 300),
  parcours text not null default 'but-info-1',
  joue_le  timestamptz not null default now()
);
-- Date plausible vérifiée par un trigger « before insert » (un check ne doit pas dépendre de now()) :
-- joue_le entre now() - 30 jours et now() + 5 minutes, sinon exception.
create index parties_parcours_date on public.parties_survie (parcours, joue_le);
create index parties_user on public.parties_survie (user_id);
```

Le trigger de date est une fonction `security invoker`, `search_path = ''`, dans un schéma non exposé
(`private`), pour ne pas apparaître dans l'API.

### Droits et RLS

- RLS activée sur les deux tables ; `revoke all` à `anon` et `authenticated`, puis droits minimaux.
- `profils` : `select`, `insert` et `update` de **sa** ligne seulement (`using` + `with check` sur
  `auth.uid() = user_id`) ; `update` limité à la colonne `pseudo` (droit par colonne). Pas de `delete`
  (la suppression de compte cascade). Les pseudos des autres ne se lisent qu'à travers `classement`.
- `parties_survie` : `select` et `insert` de **ses** parties seulement. Ni `update` ni `delete`. Les dates
  de jeu des autres ne sont jamais exposées.
- Limite anti-abus (trigger `before insert`, schéma `private`, avec la vérification de date) : au plus une
  partie toutes les 10 secondes et 300 par jour et par compte.
- `anon` : aucun accès.

### Fonction de classement

`public.classement(periode text, p_parcours text default 'but-info-1')`, **`security definer`** (seul
moyen de calculer un classement sans donner accès aux parties des autres), `search_path = ''`, `revoke` à
`public` et `anon`, `grant` à `authenticated`, refuse un appel sans `auth.uid()`. Elle ne renvoie que
rang, pseudo, meilleur score et le drapeau `moi` ; `periode` hors de `semaine`/`record` → exception.
Avertissement Supabase « fonction security definer appelable » attendu et voulu.

- `periode = 'semaine'` : parties depuis `date_trunc('week', now() at time zone 'Europe/Paris')`
  (lundi 0 h, heure de Paris) ; `periode = 'record'` : toutes.
- Un joueur = une ligne : son meilleur score sur la période ; à égalité, la date la plus ancienne de ce
  meilleur score passe devant.
- Renvoie `rang, pseudo, score, moi` : le top 50, puis la ligne de l'appelant s'il n'y figure pas.
- Les joueurs sans profil n'apparaissent pas.

## 2. Appli

### Survie

- `creerEcranSurvie` utilise toutes les questions rapides (`vrai_faux`, `trous`) valides de toutes les
  matières, sans tenir compte de `reglages.matieresExclues`. L'écran de départ le dit (« Toutes les
  matières, pour que les records se comparent »).
- En fin de partie, `Compte.publierPartie(score)` est appelée à chaque fois (pas seulement sur record).

### File d'envoi (`compte.js`)

- Nouvelle clé locale `agon.parties` : liste de `{ id, score, joue_le }` (UUID par `crypto.randomUUID()`).
- `publierPartie(score)` n'ajoute à la file que si un compte est connecté (sans compte : rien, seul le
  record local existe, comme aujourd'hui), puis programme une synchro.
- La synchro existante envoie aussi la file : `upsert` avec `ignoreDuplicates` (`on conflict do nothing`) ; une partie quitte la file une fois
  confirmée, ou si la base la refuse pour une raison définitive (score ou date hors limites, ligne dans la
  console). Une partie déjà reçue (même `id`) est ignorée sans erreur, donc confirmée. Erreur réseau = elle reste pour la prochaine synchro.
- Pas d'envoi tant que le profil n'existe pas (pas de pseudo).

### Pseudo (`compte.js`, section Compte)

- Connecté sans profil : un formulaire « Choisis ton pseudo » (3 à 20 caractères, lettres, chiffres,
  `_` et `-`), avec message « Déjà pris » si l'index unique refuse. Connecté avec profil : le pseudo est
  affiché avec un bouton « Changer ».
- À la création du profil, si un record local existe (`agon.survie`), il est publié comme première partie,
  datée du moment de la création (il compte donc aussi dans la semaine en cours).

### Écran « Classement » (`app/classement.js`, nouveau)

- Accès : bouton « Classement » sur l'accueil, à côté de « Mode survie » ; bouton « Voir le classement » en
  fin de partie de Survie.
- Deux onglets « Cette semaine » / « Record » ; lignes rang · pseudo · score, podium aux couleurs disco
  (or, rose, bleu), ligne du joueur mise en avant, sa place ajoutée en bas s'il est hors du top 50.
- Sans compte : explication « Connecte-toi pour apparaître » et bouton qui ouvre les réglages sur la section
  Compte. Connecté sans pseudo : même idée, vers le formulaire de pseudo.
- Hors ligne : « Classement indisponible hors ligne », avec le dernier classement reçu (gardé en
  mémoire locale, avec sa date) s'il existe.
- Échec de chargement : message et bouton « Réessayer ».
- En fin de Survie, si le joueur est dans le top 10 de la semaine après envoi : une ligne « 3ᵉ cette
  semaine ! ».
- `app.js` ne fait qu'appeler `Classement.ouvrir()` et `Compte.publierPartie(score)` ; `index.html` charge
  `classement.js` ; le service worker l'ajoute à la coquille (nouvelle `VERSION`).

## 3. Tests

### SQL (bloc `do $$ … raise exception` annulé)

- Un compte ne peut pas créer une partie ou un profil pour un autre ; pas d'`update`/`delete` de parties ;
  un compte ne lit ni les parties ni les profils des autres en direct ; `update` d'une autre colonne que
  `pseudo` refusé.
- Limite anti-abus : deux parties à moins de 10 s d'écart → la seconde refusée.
- Pseudo en double refusé, y compris avec une autre casse ; pseudo hors format refusé.
- Score 301 refusé ; date dans le futur ou de plus de 30 jours refusée.
- `classement('semaine')` ignore les parties d'avant lundi ; `classement('record')` les compte ; un joueur
  n'apparaît qu'une fois ; égalité départagée par la date ; ligne de l'appelant ajoutée hors top 50.
- `anon` ne lit rien et ne peut pas appeler `classement` ; `classement` ne renvoie aucune date ni `user_id`.
- Conseillers Supabase (sécurité, performance) sans nouvel avertissement inattendu.

### Navigateur (Edge headless, CDP, deux contextes)

- Deux comptes de test créés en SQL, pseudos choisis dans l'appli.
- Parties de Survie jouées ; une partie jouée hors ligne (réseau coupé par CDP) est envoyée au retour.
- Onglets semaine et record cohérents ; ligne du joueur mise en avant ; pas de doublon après renvoi.
- Captures au format iPhone (390 px émulés) et PC.
- Comptes de test supprimés à la fin.
