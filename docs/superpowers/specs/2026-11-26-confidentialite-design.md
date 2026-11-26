# Confidentialité sociale — design

Date : 26/11/2026 · Statut : validé à l'oral, à relire
Règles générales : `docs/superpowers/specs/2026-11-20-securite-rgpd-design.md` §3 (RLS, droits minimaux, données des autres seulement par des fonctions étroites).

## 1. Objectif

Deux réglages dans Paramètres, rubrique « Confidentialité » :

| Réglage | Valeurs | Défaut |
|---|---|---|
| Apparaître dans le classement | oui / non | oui |
| Recevoir des demandes d'ami | Tout le monde (oui) / Personne (non) | oui |

Les réglages sont **appliqués par le serveur** (fonctions Supabase), pas seulement par l'appli. Les défauts gardent le comportement actuel : aucun compte existant ne change.

## 2. Comportement attendu

### Classement
- Un joueur masqué n'apparaît pas dans `classement()` (semaine et record) vu par un autre joueur.
- Les rangs sont calculés **sans** les joueurs masqués (pas de trou dans la numérotation pour les autres).
- Le joueur masqué voit sa propre ligne et son rang, calculé parmi les joueurs visibles plus lui-même.
- `classement_amis()` et `mes_amis()` sont inchangés : ses amis le voient toujours (« Masqué partout sauf amis »).

### Demandes d'ami
- `demander_ami(pseudo)` vers un joueur sur « Personne » lève **exactement** l'erreur `pseudo introuvable`, comme un pseudo inexistant (on ne révèle pas l'existence du compte).
- Exception : si ce joueur m'a déjà envoyé une demande en attente, `demander_ami` l'accepte comme aujourd'hui (je réponds à une demande qu'il a faite).
- Les demandes déjà reçues avant le passage sur « Personne » restent ; `repondre_ami` et `retirer_ami` sont inchangés.
- `private.profil_par_pseudo` est inchangée (utilisée aussi par répondre/retirer).

## 3. Base de données

Migration `supabase/migrations/2026-11-26-confidentialite.sql`, recopiée à la fin de `supabase/schema.sql` :

```sql
alter table public.profils
  add column visible_classement boolean not null default true,
  add column demandes_amis boolean not null default true;
grant update (visible_classement, demandes_amis) on table public.profils to authenticated;
```

- La politique RLS existante de `profils` (chacun ne modifie que sa ligne) couvre les deux colonnes.
- `public.classement(text, text)` : recréée (même signature, mêmes colonnes de retour), avec dans `meilleurs` le filtre `join public.profils pr … where pr.visible_classement or p.user_id = auth.uid()` avant le `row_number()`.
- `public.demander_ami(text)` : recréée ; après la recherche de `autre` et le cas « demande inverse en attente », si `autre` a `demandes_amis = false` → `raise exception 'pseudo introuvable'`. Les droits d'exécution (revoke public/anon, grant authenticated) sont reposés.
- Ces colonnes ne sont jamais renvoyées par les fonctions qui montrent les autres joueurs.

## 4. Appli

### Paramètres (`app/profil.js`)
- Rubrique **Confidentialité** entre « Jeu » et « Compte », titre `h2` comme les autres groupes.
- Deux interrupteurs (`role="switch"`, `aria-checked`, même composant que Matières / Types de jeux) :
  - « Apparaître dans le classement » — note : « Tes amis te voient toujours. »
  - « Recevoir des demandes d'ami » — note : « Sinon, personne ne peut te trouver par ton pseudo. »
- Affichée seulement si connecté avec un profil (pseudo). Sinon absente.
- Au clic : l'interrupteur bascule tout de suite, puis `Compte.enregistrerConfidentialite({ visible_classement, demandes_amis })`. En cas d'échec (hors ligne, erreur serveur) : l'interrupteur revient à sa position et un message `.f-param-message` s'affiche : « Pas enregistré : vérifie ta connexion. »

### Compte (`app/compte.js`)
- `lireProfil` lit aussi `visible_classement, demandes_amis` ; le cache `agon.profil` les garde.
- Nouvelle fonction exportée `enregistrerConfidentialite(champs)` : `update` de ces seules colonnes sur sa ligne ; en cas de succès, `changerProfil({...profil, ...champs})` ; en cas d'erreur, lève une erreur (message via `messageErreur`). Garde de compte comme `enregistrerProfil` (ignore le résultat si le compte a changé).
- Valeurs absentes (vieux cache, colonnes pas encore migrées) → rubrique masquée jusqu'à la prochaine lecture réussie du profil.

### Tes données (`app/donnees.js`)
- L'export du profil inclut `visible_classement, demandes_amis` ; le texte d'explication mentionne ces deux réglages.

### Service worker
- `VERSION` → `facettes-v40`.

## 5. Tests

### Appli (`tests/profil.test.mjs`, session simulée)
- La rubrique « Confidentialité » est présente avec un profil, absente sans compte ; ordre des groupes : Apparence, Jeu, Confidentialité, Compte, Zone sensible (mettre à jour `tests/app.test.mjs` scénario 7).
- Les interrupteurs reflètent le profil (`false` → `aria-checked="false"`) ; profil sans ces champs → rubrique absente.
- Échec d'enregistrement (réseau Supabase bloqué) → l'interrupteur revient et le message s'affiche.
- Audit de contraste (`tests/apparence.test.mjs`) : passe toujours en sombre et en clair.

### Serveur (`supabase/tests/confidentialite.sql`)
Script à lancer sur le projet (transaction annulée à la fin, `rollback`) qui, avec trois utilisateurs de test simulés par `set local request.jwt.claims` :
- A masqué, B non ami de A : `classement('record')` vu par B ne contient pas A, et les rangs sont 1..n sans trou.
- A voit sa ligne avec `moi = true`.
- C ami de A : `classement_amis` vu par C contient A.
- A sur « Personne » : `demander_ami('A')` par B → erreur `pseudo introuvable` ; si A avait demandé B, `demander_ami('A')` par B → `acceptee`.

### Mise en ligne
- Appliquer la migration sur le projet Supabase est une action sur la base réelle : **demander à Ferdinand avant**.
- Ordre : migration d'abord, puis publication de l'appli v40.
- Robustesse si l'ordre est inversé : `lireProfil` qui échoue (colonnes inconnues) retente sans les deux colonnes ; la rubrique Confidentialité est alors masquée (valeurs `undefined` dans le profil = « pas disponible », distinct du défaut `true` d'un vieux cache : la rubrique s'affiche seulement si le profil lu du serveur contient les deux champs).

## 6. Avant le grand public (§5 de la spec sécurité)
- Pas de liste/recherche de joueurs : le réglage « Personne » repose sur l'absence d'annuaire. Si une recherche par préfixe arrive un jour, elle devra respecter `demandes_amis`.
- Message d'erreur identique pour « Personne » et « inexistant » : ne jamais le différencier (énumération de comptes).
