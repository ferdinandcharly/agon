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
  return env.SUPABASE_URL && env.SUPABASE_CLE_SECRETE ? env : null;
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

// Après une fusion : les documents d'un lot passent à « transformé en cartes »
export async function marquerTraites(env, ids, lot) {
  if (!ids.length) return;
  await requete(env, `/rest/v1/documents?id=in.(${ids.map(encodeURIComponent).join(",")})`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ statut: "traite", lot }),
  });
}
