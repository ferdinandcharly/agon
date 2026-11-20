// Marque « transformés en cartes » les cours du livret d'un lot déjà fusionné (rattrapage si le marquage a échoué
// ou si la clé secrète manquait au moment de la fusion).
// Usage : node outils/marquer-cours.mjs a-relire/fusionnes/lot-2026-11-21-0930.json
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { AIDE_ENV, lireEnv, marquerTraites } from "./supabase-secret.mjs";

const env = lireEnv();
if (!env) { console.error(AIDE_ENV); process.exit(2); }
const chemin = process.argv[2];
if (!chemin) { console.error("Usage : node outils/marquer-cours.mjs <lot fusionné>"); process.exit(2); }
try {
  const lot = JSON.parse(readFileSync(chemin, "utf8"));
  const documents = Array.isArray(lot.documents) ? lot.documents : [];
  if (!documents.length) { console.log("Ce lot n'utilise aucun cours du livret."); process.exit(0); }
  const n = await marquerTraites(env, documents, basename(chemin));
  console.log(`${n} cours du livret marqués « transformés en cartes ».`);
} catch (err) {
  console.error(`Échec : ${err.message}`);
  process.exit(1);
}
