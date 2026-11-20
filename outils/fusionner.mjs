// Ajoute au fil un lot de cartes RELU (supprimer d'abord du fichier les cartes refusées).
// Usage : node outils/fusionner.mjs a-relire/lot-2026-11-20-1830.json
// Refuse tout le lot s'il reste une erreur ; sinon l'ajoute à app/data/contenus.json
// et range le lot dans a-relire/fusionnes/.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifierLot } from "./valider.mjs";
import { lireEnv, marquerTraites } from "./supabase-secret.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const FICHIER = join(RACINE, "app", "data", "contenus.json");

// Même mise en forme que le fichier écrit à la main : une carte par bloc, « donnees » indentées
export function formater(donnees) {
  const tete = (c) => JSON.stringify({ id: c.id, matiere: c.matiere, notion: c.notion, format: c.format }).slice(1, -1).replaceAll('","', '", "').replaceAll('":"', '": "');
  const blocs = donnees.contenus.map((c) =>
    `    {\n      ${tete(c)},\n      "donnees": ${JSON.stringify(c.donnees, null, 2).replaceAll("\n", "\n      ")}\n    }`);
  return [
    "{",
    `  "version": ${donnees.version ?? 1},`,
    '  "matieres": [',
    donnees.matieres.map((m) => `    ${JSON.stringify(m).replaceAll('","', '", "').replaceAll('":"', '": "')}`).join(",\n"),
    "  ],",
    '  "contenus": [',
    blocs.join(",\n"),
    "  ]",
    "}",
    "",
  ].join("\n");
}

const chemin = process.argv[2];
if (!chemin) { console.error("Usage : node outils/fusionner.mjs <lot.json>"); process.exit(2); }
const lot = JSON.parse(readFileSync(chemin, "utf8"));
const existant = JSON.parse(readFileSync(FICHIER, "utf8"));
const { problemes } = verifierLot(lot, existant);
if (problemes.length) {
  console.error("Lot refusé, rien n'a été ajouté :");
  for (const p of problemes) console.error(`  - ${p}`);
  process.exit(1);
}
const nouvellesMatieres = (lot.matieres ?? []).filter((m) => !existant.matieres.some((e) => e.id === m.id));
existant.matieres.push(...nouvellesMatieres);
existant.contenus.push(...lot.contenus);
writeFileSync(FICHIER, formater(existant));
const range = join(dirname(chemin), "fusionnes");
mkdirSync(range, { recursive: true });
renameSync(chemin, join(range, basename(chemin)));
console.log(`${lot.contenus.length} carte(s) ajoutée(s)` +
  (nouvellesMatieres.length ? `, ${nouvellesMatieres.length} nouvelle(s) matière(s)` : "") +
  `. Lot rangé dans ${join(range, basename(chemin))}.`);
console.log("Pense à changer VERSION dans app/sw.js si tu publies la coquille ; les cartes, elles, sont prises au prochain chargement.");

// Cours du livret utilisés par ce lot : ils passent à « transformé en cartes » dans l'appli
const documents = Array.isArray(lot.documents) ? lot.documents : [];
if (documents.length) {
  const env = lireEnv();
  if (!env) console.log(`${documents.length} cours du livret à marquer « transformés » : ajoute la clé secrète dans .env puis relance le marquage.`);
  else {
    try { await marquerTraites(env, documents, basename(chemin)); console.log(`${documents.length} cours du livret marqués « transformés en cartes ».`); }
    catch (err) { console.error(`Cartes ajoutées, mais le marquage des cours a échoué : ${err.message}`); }
  }
}
