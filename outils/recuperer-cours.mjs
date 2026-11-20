// Récupère sur le PC les documents de cours ajoutés depuis l'appli (livret des albums) et pas encore traités.
// Usage : node outils/recuperer-cours.mjs
// Chaque document arrive dans sources/<matiere>/ (sans écraser un fichier existant) ; la correspondance
// fichier → id du document est notée dans sources/<matiere>/.documents.json pour /generer-cartes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { AIDE_ENV, RACINE, lireEnv, requete as requeteSecrete } from "./supabase-secret.mjs";

const RESERVES_WINDOWS = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const EXTENSIONS = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png",
                     "image/heic": ".heic", "image/heif": ".heif", "image/webp": ".webp" };

// Nom de fichier sûr : ASCII, sans accents ni chemins, 80 caractères au plus, jamais vide ni réservé par Windows
export function nettoyerNom(nom) {
  const ext = (extname(nom).match(/^\.[A-Za-z0-9]{1,6}$/) || [""])[0];
  let base = nom.slice(0, nom.length - ext.length)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 80 - ext.length);
  if (!base) base = "document";
  if (RESERVES_WINDOWS.test(base)) base = `_${base}`;
  return base + ext;
}

// Nom local d'un document : son nom d'origine nettoyé, mais l'extension vient de son type réel (jamais .exe, .lnk…)
export function nomLocal(doc) {
  const base = nettoyerNom(doc.nom).replace(/\.[A-Za-z0-9]{1,6}$/, "");
  return base + (EXTENSIONS[doc.type] || ".bin");
}

// Chemin attendu dans le bucket : <matiere>/<uuid>-<nom nettoyé>, et la matière doit correspondre.
// Un chemin hors de ce format ne part jamais avec la clé secrète (il pourrait viser une autre adresse de Supabase).
export function cheminValide(chemin, matiere) {
  const m = /^([a-z0-9_-]{1,40})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,90}$/.exec(chemin || "");
  return Boolean(m) && m[1] === matiere && !chemin.includes("..");
}

// Premier nom libre dans le dossier : a.pdf, puis a-2.pdf, a-3.pdf…
export function nomLibre(dossier, nom) {
  const ext = extname(nom);
  const base = nom.slice(0, nom.length - ext.length);
  let candidat = nom;
  for (let i = 2; existsSync(join(dossier, candidat)); i++) candidat = `${base}-${i}${ext}`;
  return candidat;
}

function lireIndex(fichier) {
  try { const v = JSON.parse(readFileSync(fichier, "utf8")); return v && typeof v === "object" ? v : {}; }
  catch { return {}; }   // absent ou abîmé : on repart d'un index vide (au pire, un document est récupéré deux fois)
}

// Récupère chaque document à part : un échec (fichier introuvable, chemin invalide…) n'arrête pas les suivants
export async function recuperer(env, { requete = requeteSecrete, racine = RACINE } = {}) {
  const documents = await (await requete(env, "/rest/v1/documents?statut=eq.a_traiter&select=*&order=ajoute_le")).json();
  let recus = 0;
  let echecs = 0;
  for (const doc of documents) {
    try {
      if (!cheminValide(doc.chemin, doc.matiere)) throw new Error("chemin de fichier invalide, ignoré");
      const dossier = join(racine, "sources", nettoyerNom(doc.matiere));
      mkdirSync(dossier, { recursive: true });
      const index = join(dossier, ".documents.json");
      const connus = lireIndex(index);
      if (Object.values(connus).includes(doc.id)) { console.log(`  déjà là : ${doc.nom}`); continue; }
      const reponse = await requete(env, `/storage/v1/object/cours/${doc.chemin.split("/").map(encodeURIComponent).join("/")}`);
      const fichier = nomLibre(dossier, nomLocal(doc));
      writeFileSync(join(dossier, fichier), Buffer.from(await reponse.arrayBuffer()));
      connus[fichier] = doc.id;
      writeFileSync(index, JSON.stringify(connus, null, 2) + "\n");
      recus++;
      console.log(`  ${doc.matiere} : ${fichier} (${Math.round(doc.taille / 1024)} Ko)`);
    } catch (err) {
      echecs++;
      console.error(`  échec pour « ${doc.nom} » (${doc.id}) : ${err.message}`);
    }
  }
  return { total: documents.length, recus, echecs };
}

async function principal() {
  const env = lireEnv();
  if (!env) { console.error(AIDE_ENV); process.exit(2); }
  const { total, recus, echecs } = await recuperer(env);
  if (!total) { console.log("Aucun cours en attente."); return; }
  console.log(`${recus} cours récupéré(s) sur ${total} en attente. Lance /generer-cartes dans Claude Code pour en faire des cartes.`);
  if (echecs) { console.error(`${echecs} échec(s) : voir ci-dessus.`); process.exit(1); }
}

// Lancé directement (et pas importé par les tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((err) => { console.error("Échec :", err.message); process.exit(1); });
}
