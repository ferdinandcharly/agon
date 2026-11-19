// Vérifie un lot de cartes générées avant relecture.
// Usage : node outils/valider.mjs a-relire/lot-2026-11-20-1830.json
// Lot = { "source": "d'où viennent les cartes", "matieres": [nouvelles matières, facultatif], "contenus": [cartes] }
// Affiche chaque carte en clair (pour la relire) et sort avec le code 1 s'il reste une erreur.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const { erreursCarte } = require(join(RACINE, "app", "validation.js"));

export function verifierLot(lot, existant) {
  const problemes = [];
  if (!lot || !Array.isArray(lot.contenus)) return { problemes: ["le lot doit contenir une liste « contenus »"], cartes: [] };
  const matieres = new Set([...existant.matieres, ...(lot.matieres ?? [])].map((m) => m.id));
  const idsExistants = new Set(existant.contenus.map((c) => c.id));
  const vus = new Set();
  const cartes = lot.contenus.map((c, i) => {
    const erreurs = erreursCarte(c);
    if (c?.matiere && !matieres.has(c.matiere)) erreurs.push(`matière inconnue « ${c.matiere} » (à déclarer dans « matieres » du lot)`);
    if (typeof c?.notion !== "string" || !c.notion.trim()) erreurs.push("« notion » doit être un texte non vide");
    if (idsExistants.has(c?.id)) erreurs.push(`l'id « ${c.id} » existe déjà dans le fil`);
    if (vus.has(c?.id)) erreurs.push(`l'id « ${c.id} » est en double dans le lot`);
    if (c?.format !== "fiche" && !(typeof c?.donnees?.explication === "string" && c.donnees.explication.trim())) {
      erreurs.push("un jeu doit avoir une « explication » (affichée après la réponse)");
    }
    vus.add(c?.id);
    for (const e of erreurs) problemes.push(`carte ${i + 1} (${c?.id ?? "sans id"}) : ${e}`);
    return { c, erreurs };
  });
  return { problemes, cartes };
}

// Résumé lisible d'une carte, pour la relecture
function resume(c) {
  const d = c.donnees ?? {};
  switch (c.format) {
    case "fiche": return `${d.titre} — ${d.paragraphes?.join(" ")}${d.a_retenir ? ` [À retenir : ${d.a_retenir}]` : ""}`;
    case "vrai_faux": return `${d.affirmation} → ${d.reponse ? "VRAI" : "FAUX"}`;
    case "trous": return `${d.texte} → « ${d.reponse} » parmi ${JSON.stringify(d.choix)}`;
    case "associer": return d.paires?.map((p) => `${p[0]} = ${p[1]}`).join(" ; ");
    case "ordre": return d.etapes?.map((e, i) => `${i + 1}. ${e}`).join("  ");
    case "erreur": return `${d.consigne ?? ""} Ligne fausse ${d.ligne_fausse + 1} : « ${d.lignes?.[d.ligne_fausse]} » → ${d.correction}`;
    default: return JSON.stringify(d);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const chemin = process.argv[2];
  if (!chemin) { console.error("Usage : node outils/valider.mjs <lot.json>"); process.exit(2); }
  let lot;
  try { lot = JSON.parse(readFileSync(chemin, "utf8")); }
  catch (e) { console.error(`JSON illisible : ${e.message}`); process.exit(1); }
  const existant = JSON.parse(readFileSync(join(RACINE, "app", "data", "contenus.json"), "utf8"));
  const { problemes, cartes } = verifierLot(lot, existant);
  console.log(`Lot : ${chemin}${lot?.source ? `  (source : ${lot.source})` : ""}\n`);
  for (const { c, erreurs } of cartes) {
    console.log(`${erreurs.length ? "✗" : "✓"} [${c?.matiere} / ${c?.format}] ${c?.id}`);
    console.log(`    ${c?.notion ?? "?"} : ${resume(c ?? {})}`);
    for (const e of erreurs) console.log(`    ! ${e}`);
  }
  console.log(`\n${cartes.length} carte(s), ${problemes.length} problème(s).`);
  process.exit(problemes.length ? 1 : 0);
}
