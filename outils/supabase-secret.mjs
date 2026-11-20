// Accès « administrateur » à Supabase depuis le PC de Ferdinand, pour le livret de cours.
// La clé secrète contourne toutes les règles d'accès : elle vit SEULEMENT dans .env (jamais versionné),
// et part dans l'en-tête « apikey » (jamais dans Authorization : ce n'est pas un jeton JWT).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const FICHIER_ENV = process.env.FACETTES_ENV || join(RACINE, ".env");

export const AIDE_ENV = `Il manque la clé secrète Supabase dans ${FICHIER_ENV}. Crée ce fichier avec deux lignes :
  SUPABASE_URL=https://hiqymrmygjisqqypbfxp.supabase.co
  SUPABASE_CLE_SECRETE=sb_secret_...
(Supabase → Project Settings → API Keys → Secret keys). Ne la colle jamais ailleurs, ni dans un chat.`;

// Lit .env (lignes CLE=valeur) ; null s'il manque ou s'il est incomplet
export function lireEnv() {
  if (!existsSync(FICHIER_ENV)) return null;
  const env = {};
  for (const ligne of readFileSync(FICHIER_ENV, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_CLE_SECRETE) return null;
  env.SUPABASE_URL = env.SUPABASE_URL.replace(/\/+$/, "");
  // Jamais en clair : la clé ne part que vers une adresse https
  if (!/^https:\/\//.test(env.SUPABASE_URL)) return null;
  return env;
}

// Requête vers Supabase avec la clé secrète ; lève une erreur lisible si la réponse n'est pas OK
export async function requete(env, chemin, options = {}) {
  const reponse = await fetch(`${env.SUPABASE_URL}${chemin}`, {
    ...options,
    headers: { apikey: env.SUPABASE_CLE_SECRETE, ...(options.headers || {}) },
  });
  if (!reponse.ok) throw new Error(`${options.method || "GET"} ${chemin} : HTTP ${reponse.status} ${await reponse.text()}`);
  return reponse;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Après une fusion : les documents d'un lot passent à « transformé en cartes ».
// On vérifie le nombre de lignes réellement mises à jour (un id inconnu ne doit pas passer pour un succès).
export async function marquerTraites(env, ids, lot, envoyer = requete) {
  if (!ids.length) return 0;
  if (!ids.every((id) => UUID.test(id))) throw new Error("ids de documents invalides");
  const reponse = await envoyer(env, `/rest/v1/documents?id=in.(${ids.join(",")})&select=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ statut: "traite", lot }),
  });
  const lignes = await reponse.json();
  if (lignes.length !== ids.length) throw new Error(`${lignes.length} sur ${ids.length} cours marqués (ids inconnus ?)`);
  return lignes.length;
}
