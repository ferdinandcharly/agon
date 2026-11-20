// Récupère sur le PC les documents de cours ajoutés depuis l'appli (livret des albums) et pas encore traités.
// Usage : node outils/recuperer-cours.mjs
// Chaque document arrive dans sources/<matiere>/ (sans écraser un fichier existant) ; la correspondance
// fichier → id du document est notée dans sources/<matiere>/.documents.json pour /generer-cartes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { AIDE_ENV, RACINE, lireEnv, requete } from "./supabase-secret.mjs";

// Nom de fichier sûr : ASCII, sans accents ni chemins, 80 caractères au plus, jamais vide
export function nettoyerNom(nom) {
  const ext = (extname(nom).match(/^\.[A-Za-z0-9]{1,6}$/) || [""])[0];
  const base = nom.slice(0, nom.length - ext.length)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 80 - ext.length);
  return (base || "document") + ext;
}

// Premier nom libre dans le dossier : a.pdf, puis a-2.pdf, a-3.pdf…
export function nomLibre(dossier, nom) {
  const ext = extname(nom);
  const base = nom.slice(0, nom.length - ext.length);
  let candidat = nom;
  for (let i = 2; existsSync(join(dossier, candidat)); i++) candidat = `${base}-${i}${ext}`;
  return candidat;
}

async function principal() {
  const env = lireEnv();
  if (!env) { console.error(AIDE_ENV); process.exit(2); }
  const documents = await (await requete(env, "/rest/v1/documents?statut=eq.a_traiter&select=*&order=ajoute_le")).json();
  if (!documents.length) { console.log("Aucun cours en attente."); return; }
  for (const doc of documents) {
    const dossier = join(RACINE, "sources", nettoyerNom(doc.matiere));
    mkdirSync(dossier, { recursive: true });
    const index = join(dossier, ".documents.json");
    const connus = existsSync(index) ? JSON.parse(readFileSync(index, "utf8")) : {};
    if (Object.values(connus).includes(doc.id)) { console.log(`  déjà là : ${doc.nom}`); continue; }
    const contenu = Buffer.from(await (await requete(env, `/storage/v1/object/cours/${doc.chemin.split("/").map(encodeURIComponent).join("/")}`)).arrayBuffer());
    const fichier = nomLibre(dossier, nettoyerNom(doc.nom));
    writeFileSync(join(dossier, fichier), contenu);
    connus[fichier] = doc.id;
    writeFileSync(index, JSON.stringify(connus, null, 2) + "\n");
    console.log(`  ${doc.matiere} : ${fichier} (${Math.round(doc.taille / 1024)} Ko)`);
  }
  console.log(`${documents.length} cours en attente. Lance /generer-cartes dans Claude Code pour en faire des cartes.`);
}

// Lancé directement (et pas importé par les tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((err) => { console.error("Échec :", err.message); process.exit(1); });
}
