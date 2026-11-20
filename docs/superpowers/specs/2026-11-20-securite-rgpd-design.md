# Socle sécurité et RGPD (avant le classement) — design

Date : 20/11/2026 · Statut : à relire par Ferdinand · À réaliser **avant** la spec
`2026-11-20-classement-survie-design.md`.

## Objectif

Facettes a des comptes depuis le 20/11 et quelques amis testent. Ferdinand veut un niveau de sécurité qui
tienne si l'appli est ouverte au grand public. Ce document fixe :

- ce qui se fait maintenant (code, base, réglages du tableau de bord) ;
- ce qui est **obligatoire avant d'ouvrir au grand public** (et qui coûte de l'argent ou demande une décision) ;
- les règles que chaque nouvelle fonctionnalité doit suivre.

Critère de réussite : conseillers Supabase sans avertissement non justifié ; tests d'accès SQL et navigateur
verts ; un utilisateur peut savoir ce qu'on garde sur lui, l'exporter et tout supprimer ; personne ne peut
se servir de l'appli pour envoyer des e-mails en masse.

## État actuel (vérifié le 20/11)

- RLS sur `progression`, rien pour `anon`, testé. RPC `supprimer_mon_compte` durcie (avertissement voulu).
- Clé publique seulement dans le dépôt ; aucune clé secrète.
- Aucun `innerHTML` / `eval` dans l'appli : pseudo ou carte piégée = du texte, pas du code.
- supabase-js auto-hébergé, version figée.
- Données à Paris ; seul identifiant : l'e-mail.
- Manques : pas de protection anti-robot sur l'envoi de codes, pas de CSP, pas de page d'information RGPD,
  pas d'export, pas de durée de conservation, pas de sauvegardes (offre gratuite), envoi des e-mails par
  un Gmail personnel.

## 1. Envoi des codes : empêcher les abus

Risque : n'importe qui peut demander un code pour n'importe quelle adresse ; chaque demande part du Gmail
de Ferdinand (spam vers des inconnus, blocage du compte Google, comptes fantômes).

- **Cloudflare Turnstile** (CAPTCHA invisible, gratuit, sans cookie publicitaire) sur le formulaire
  « Recevoir un code » : le widget donne un jeton, passé à `signInWithOtp({ email, options: { captchaToken } })`.
  Supabase vérifie le jeton côté serveur (Authentication → Attack Protection → CAPTCHA, fournisseur
  Turnstile, clé secrète saisie dans le tableau de bord, jamais dans le dépôt).
  - Le script Turnstile (`challenges.cloudflare.com`) n'est chargé qu'à l'affichage du formulaire (la
    connexion demande de toute façon le réseau) ; l'appli hors ligne n'en dépend pas.
  - Si le widget ne se charge pas : message « Vérification anti-robot indisponible, réessaie avec du
    réseau » ; pas de contournement.
- **Limites d'envoi** (Authentication → Rate Limits) : e-mails envoyés ≤ 10 / heure tant qu'on est sur
  Gmail ; vérifications de code limitées par Supabase (défaut conservé).
- **Durée de validité du code** : 10 minutes (au lieu d'une heure) ; le texte de l'e-mail est mis à jour.

## 2. Navigateur : défense en profondeur

La session (jeton) est dans `localStorage` : une faille XSS permettrait de la voler. On n'a pas de faille
connue, mais on ferme la porte :

- **Content-Security-Policy** en `<meta>` (GitHub Pages ne permet pas d'en-têtes) :
  `default-src 'self'; script-src 'self' https://challenges.cloudflare.com; connect-src 'self'
  https://hiqymrmygjisqqypbfxp.supabase.co; frame-src https://challenges.cloudflare.com;
  img-src 'self' data:; style-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none';
  object-src 'none'`.
  - `style-src 'self'` bloque aussi les attributs `style="…"` écrits dans le HTML : les 20 tuiles de
    l'écran de lancement (`style="--i:…;--dx:…;--dy:…"` dans `index.html`) passent dans `fil.css`
    (une règle `:nth-child` par tuile). Les styles posés par JavaScript via `element.style` restent permis.
  - Pendant l'implémentation : console vide de toute violation CSP, sur l'accueil, le fil, la Survie, les
    réglages et le formulaire de connexion.
- **Référent** : `<meta name="referrer" content="no-referrer">`.
- Règle pour la suite : jamais d'`innerHTML` avec une donnée venant d'un utilisateur ou de la base.

## 3. Base de données : règles générales

S'appliquent à toutes les tables actuelles et futures (classement, amis, arène) :

- RLS sur chaque table ; `revoke all` puis droits minimaux ; rien pour `anon` sauf besoin justifié.
- **Droits par colonne** quand une table a des colonnes que le client ne doit pas écrire
  (ex. `profils.suspendu`).
- Les données des autres ne se lisent **jamais en direct** : seulement à travers une fonction qui ne
  renvoie que le strict nécessaire (ex. rang, pseudo, meilleur score). Ces fonctions sont
  `security definer`, `search_path = ''`, `revoke` à `public`/`anon`, `grant` à `authenticated`, vérifient
  `auth.uid()` si besoin ; l'avertissement Supabase correspondant est noté comme voulu dans la spec.
- Fonctions internes (triggers, purge) dans un schéma `private` non exposé.
- **Limites anti-abus** par trigger sur les tables où un compte écrit souvent (ex. parties : au plus
  1 toutes les 10 s et 300 par jour) ; garde-fou de taille sur les jsonb (déjà fait pour `progression`).
- Après chaque migration : conseillers sécurité et performance, tests d'accès en bloc SQL annulé.

## 4. RGPD

Base légale : exécution du service demandé (compte et synchro) ; pas de publicité, pas de mesure
d'audience, pas de cookie tiers (Turnstile n'en dépose pas à des fins publicitaires).

- **Page « Tes données »** (dans les réglages, section Compte, et lien sous le formulaire de connexion) :
  - ce qu'on garde : e-mail, progression, collection, record, (bientôt) pseudo et parties ;
  - pourquoi : retrouver sa progression sur plusieurs appareils, (bientôt) les classements ;
  - où : Supabase, serveurs à Paris ; e-mails envoyés via le fournisseur d'envoi ;
  - combien de temps : tant que le compte existe ; compte supprimé automatiquement après **2 ans sans
    connexion** ;
  - droits : exporter, supprimer (boutons), et contact pour tout le reste ;
  - responsable : Ferdinand Charly, adresse de contact (à fournir par Ferdinand, voir « Décisions ») ;
  - sans compte : rien ne quitte l'appareil.
- **Exporter mes données** : bouton qui télécharge un JSON (`facettes-mes-donnees.json`) avec le compte
  (e-mail, date de création), la ligne `progression`, et plus tard profil et parties. Fait côté client avec
  les droits de l'utilisateur (aucune nouvelle fonction serveur).
- **Suppression** : existe ; elle devra couvrir chaque nouvelle table (cascade sur `auth.users`). La
  suppression de compte doit aussi vider la file locale de parties.
- **Purge des comptes inactifs** : tâche `pg_cron` hebdomadaire dans le schéma `private`, qui supprime les
  comptes dont `last_sign_in_at` date de plus de 2 ans (la cascade efface leurs données).
- **Mineurs** : l'appli vise des étudiants ; la page « Tes données » indique que l'appli ne doit pas être
  utilisée par des moins de 15 ans sans accord d'un parent. À revoir avec un public lycéen.

## 5. Obligatoire avant le grand public (pas maintenant)

Liste à cocher avant d'ouvrir au-delà des amis ; chaque point coûte ou demande une décision :

1. **Nom de domaine + fournisseur d'e-mails transactionnels** (Resend ou Brevo, serveurs UE) avec SPF,
   DKIM, DMARC : Gmail plafonne à ~500 e-mails/jour, interdit l'usage commercial, et expose l'adresse perso.
2. **Supabase Pro** (~25 $/mois) : sauvegardes quotidiennes, pas de mise en pause, limites plus hautes.
   D'ici là : export manuel de la base avant chaque migration importante.
3. **Domaine propre pour l'appli** (au lieu de `github.io`) pour la confiance et les cookies/stockage
   isolés.
4. **Modération des pseudos** : liste de mots interdits, signalement, colonne `suspendu` réservée à
   l'admin (droits par colonne) — à faire dans la spec du classement si le public s'élargit.
5. **Mentions légales** complètes (hébergeurs : GitHub, Supabase, Cloudflare) et registre des traitements
   simple.
6. **Anti-triche** des scores par fonction serveur si un classement public a de l'enjeu.

## Décisions demandées à Ferdinand

- Adresse de contact publiée dans « Tes données » : Gmail perso ou adresse dédiée (ex. un Gmail
  `facettes.app@…`) — recommandé : une adresse dédiée.
- Créer un compte Cloudflare (gratuit) et un widget Turnstile pour le domaine `ferdinandcharly.github.io`
  (et `localhost` pour les tests) ; donner la **clé de site** (publique) à Claude ; saisir la **clé
  secrète** dans Supabase.

## Tests

- SQL : purge (compte de test avec `last_sign_in_at` ancien supprimé, récent conservé) ; droits inchangés
  sur `progression`.
- Navigateur (Edge headless) : l'appli se charge sans erreur CSP (console vide) ; connexion refusée sans
  jeton CAPTCHA (Turnstile en mode test : clés de test officielles de Cloudflare qui passent ou échouent
  toujours) ; export téléchargé et contenu attendu ; page « Tes données » lisible sur iPhone et PC.
- Conseillers Supabase : seuls les avertissements voulus (`supprimer_mon_compte`, et ceux annoncés).
