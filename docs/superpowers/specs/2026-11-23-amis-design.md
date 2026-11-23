# Amis (projet 2/3) et barre d'onglets — design

Date : 23/11/2026 · Statut : validé à l'oral, à relire par Ferdinand · Prérequis : `2026-11-20-securite-rgpd-design.md`
(règles générales) et `2026-11-20-classement-survie-design.md` (profils, parties, fonction `classement`).

## Contexte et objectif

Le classement Survie général existe (projet 1). Les amis qui testent Facettes veulent se comparer entre eux.
Projet 2 : des **demandes d'amis par pseudo exact**, un **écran Amis** (classement entre amis, notions
allumées, records battus) et une **barre d'onglets en bas** (comme Korrel) qui remplace la ligne
« Bientôt : amis, arène » de l'accueil.

Critère de réussite : Ferdinand ajoute un ami par son pseudo, l'ami accepte, chacun voit l'autre dans le
classement des amis avec ses notions allumées, et « X a battu ton record » apparaît quand c'est le cas.
Sans compte, sans pseudo ou hors ligne, rien ne casse.

### Ce qui a été décidé

- Ajout par **pseudo exact** uniquement : pas d'annuaire, pas de recherche partielle, pas de lien d'invitation
  (sur iPhone, un lien s'ouvre dans Safari, pas dans l'app installée).
- Les amis voient : le **classement Survie** entre amis (Cette semaine / Record), les **notions allumées**
  de chacun, et l'activité **« record battu »**. Rien d'autre (pas de dernière connexion, pas de série).
- Barre d'onglets : **Disco** (gauche) · **Accueil** (centre) · **Amis** (droite). L'arène (projet 3)
  trouvera sa place plus tard (dans Amis ou en 4e onglet), décision reportée.

### Hors périmètre

Arène, défis, notifications push, recherche de joueurs, blocage/signalement (à prévoir avant le grand public,
voir la spec socle), série de jours, dernière activité.

## 1. Base de données (Supabase, projet `facettes`)

### Table `amities`

```sql
create table public.amities (
  demandeur    uuid not null references auth.users (id) on delete cascade,
  destinataire uuid not null references auth.users (id) on delete cascade,
  statut       text not null default 'attente' check (statut in ('attente', 'acceptee')),
  cree_le      timestamptz not null default now(),
  accepte_le   timestamptz,
  primary key (demandeur, destinataire),
  check (demandeur <> destinataire)
);
-- Une seule relation par paire, quel que soit le sens
create unique index amities_paire on public.amities (least(demandeur, destinataire), greatest(demandeur, destinataire));
create index amities_destinataire on public.amities (destinataire);
```

- RLS activée, **aucun droit direct** pour `anon` ni `authenticated` (pas de select/insert/update/delete) :
  tout passe par les fonctions ci-dessous. Les identifiants des autres ne sortent jamais de la base.

### Colonne `profils.notions_allumees`

```sql
alter table public.profils add column notions_allumees smallint not null default 0
  check (notions_allumees between 0 and 2000);
grant update (notions_allumees) on table public.profils to authenticated;
```

- Mise à jour par l'appli de son propre profil (policy « modifier son profil » existante). Falsifiable :
  acceptable entre amis, comme le score.

### Fonctions (toutes `security definer`, `set search_path = ''`, réservées à `authenticated`, refus si `auth.uid()` est nul)

Le pseudo est comparé sans casse (`lower(pseudo)`), comme l'index unique des profils. Il faut **avoir soi-même
un profil** pour utiliser les fonctions d'amis (sinon : exception « choisis d'abord un pseudo »).

| Fonction | Rôle | Refus (exception, message en français) |
|---|---|---|
| `demander_ami(p_pseudo text) returns text` | Crée une demande. Si l'autre m'avait déjà demandé : accepte directement. Renvoie `'envoyee'` ou `'acceptee'`. | pseudo introuvable ; soi-même ; déjà amis ; demande déjà envoyée ; 20 demandes envoyées en attente ; 100 amis (pour l'un ou l'autre) |
| `repondre_ami(p_pseudo text, p_accepter boolean) returns void` | Accepte (statut `acceptee`, `accepte_le = now()`) ou refuse (supprime la ligne) une demande **reçue** de ce pseudo. | aucune demande reçue de ce pseudo |
| `retirer_ami(p_pseudo text) returns void` | Supprime l'amitié, ou annule une demande que j'ai envoyée. | rien à retirer |
| `mes_amis() returns table (pseudo text, relation text, notions integer, record integer, record_le timestamptz)` | Une ligne par relation. `relation` ∈ `ami`, `recue`, `envoyee`. `notions`, `record` et `record_le` ne sont remplis **que pour `ami`** (nuls sinon). Record = meilleur score Survie de tous les temps, parcours `but-info-1`, et sa date (la première atteinte). | — |
| `classement_amis(periode text, p_parcours text default 'but-info-1') returns table (rang integer, pseudo text, score integer, moi boolean, notions integer)` | Même règle que `classement` (meilleur score de la période, à égalité le premier arrivé), restreint à moi + mes amis acceptés. | période inconnue |

Le message « pseudo introuvable » révèle qu'un pseudo n'existe pas : accepté, les pseudos sont déjà visibles
dans le classement général.

### Données personnelles

- Ce qu'un ami voit de plus qu'un inconnu : notions allumées et record avec sa date. Un inconnu ne voit rien
  de nouveau. La relation s'efface avec l'un des deux comptes (cascade).
- « Tes données » : ajouter les amis (pseudos), les demandes et le nombre de notions publié ; l'export
  inclut `mes_amis()`.

## 2. Appli

### Barre d'onglets (`app/nav.js` + styles dans `fil.css`)

- Fixée en bas, au-dessus de la barre d'accueil de l'iPhone (`env(safe-area-inset-bottom)`), trois boutons
  icône + nom : **Disco**, **Accueil**, **Amis** ; l'onglet actif est mis en valeur (`aria-current="page"`).
- Visible sur l'accueil, la discothèque, l'écran Amis et le classement ; **cachée** pendant le fil de cartes
  (et la Prise d'otage), et sous les panneaux (Réglages, Tes données).
- Pastille sur **Amis** : demandes reçues + records battus non vus (nombre, plafonné à « 9+ »).
- L'accueil remplace la ligne « Bientôt : amis, arène » par la barre et **tient toujours sur un écran**
  (test existant, marges iPhone comprises). La discothèque perd son bouton « ← Retour au menu ».
- Les écrans qui défilent (discothèque, Amis, classement) réservent en bas la hauteur de la barre.

### Écran Amis (`app/amis.js`, section `#amis` dans `index.html`)

Ordre : titre « Amis », puis selon l'état :

1. **Pas connecté** : « Connecte-toi pour ajouter des amis » + bouton qui ouvre Réglages → Compte.
2. **Connecté sans pseudo** : formulaire de pseudo (même composant que le classement).
3. **Sinon** :
   - **Activité** : une carte par ami dont le record dépasse le mien et a été atteint depuis ma dernière
     visite de l'écran Amis : « Lucas a battu ton record : 42 (toi : 38) ». Vue = date de visite
     enregistrée (`agon.amis.vu`), donc elle disparaît à la visite suivante.
   - **Classement des amis** : interrupteur Cette semaine / Record ; lignes rang, pseudo, score,
     « 26 notions » ; ma ligne en valeur. Moi seul : « Ajoute un ami pour vous comparer ».
   - **Demandes reçues** : pseudo + Accepter / Refuser.
   - **Ajouter un ami** : champ pseudo (mêmes règles de format que les profils, vérifiées avant l'envoi) +
     Envoyer ; message de résultat en français (envoyée, vous êtes amis, ou la raison du refus).
   - **Tes amis** puis **demandes envoyées** : Retirer / Annuler, en deux temps (« Confirmer ? »).
- **Hors ligne** : dernier `mes_amis()` et dernier classement des amis gardés en cache (`agon.amis`,
  propre au compte, vidé à la déconnexion et à la suppression du compte), avec la date « mis à jour … ».
  Les actions (envoyer, accepter…) sont désactivées hors ligne avec un message.

### Notions allumées

- Calculées comme sur l'accueil (`notionsParEtat`, état `maitrisee`). Après chaque synchro réussie et à
  l'affichage de l'accueil, si connecté avec un pseudo et si la valeur diffère de la dernière publiée
  (`agon.notions.publiees`), l'appli met à jour `profils.notions_allumees`.

### Pastille et rafraîchissement

- `mes_amis()` est appelé à l'ouverture de l'appli, au retour au premier plan (au plus une fois par minute)
  et à l'ouverture de l'écran Amis. La pastille se calcule sur ce résultat.

## 3. Erreurs et cas limites

- Pseudo saisi invalide : message local, pas d'appel.
- Deux demandes croisées en même temps : l'index de paire refuse la seconde ; la fonction la transforme en
  acceptation (l'autre m'avait demandé) ou en « demande déjà en cours ».
- Ami qui supprime son compte : la relation disparaît (cascade) ; au prochain rafraîchissement il n'apparaît plus.
- Changement de pseudo : les amis voient le nouveau pseudo (les relations portent sur les identifiants).
- Réponse lente ou erreur réseau : message « Pas de connexion, réessaie », l'état affiché ne change pas.

## 4. Tests

- **SQL** (`tests/sql/amis.sql`, bloc annulé, rôles simulés par `request.jwt.claims`) : un inconnu n'a aucun
  accès direct à `amities` ; demande / acceptation automatique croisée / refus / retrait ; refus
  soi-même, doublon, introuvable, sans profil, limites 20 et 100 ; `mes_amis` ne donne notions et record
  qu'aux amis acceptés ; `classement_amis` ne contient que moi + amis ; cascade à la suppression d'un compte.
- **Navigateur** (`tests/amis.test.mjs`) : barre présente sur accueil, disco, Amis, classement et absente
  dans le fil ; onglet actif ; accueil toujours sans défilement (iPhone SE, standard, Pro Max, marges
  réelles) ; écran Amis sans compte = invitation à se connecter ; calcul « record battu » et pastille sur
  des données simulées (fonction pure exposée) ; 0 violation CSP.
- **À la main (Ferdinand, deux comptes)** : demande, acceptation, classement des amis, notions, record
  battu, retrait, hors ligne.
