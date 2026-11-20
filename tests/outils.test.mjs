// Outils du PC pour le livret de cours (sans réseau). Lancer depuis la racine : node tests/outils.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { nettoyerNom, nomLibre, cheminValide, nomLocal, recuperer } from "../outils/recuperer-cours.mjs";
import { marquerTraites } from "../outils/supabase-secret.mjs";
import { verifierLot } from "../outils/valider.mjs";
import { readFileSync, existsSync } from "node:fs";

// Noms de fichiers sûrs pour le stockage et le disque
assert.equal(nettoyerNom("Cours réseau (TD 2).pdf"), "Cours-reseau-TD-2.pdf");
for (const piege of ["../../x.pdf", "..\\..\\x.pdf", "a/../b.pdf"]) {
  const n = nettoyerNom(piege);
  assert.ok(!n.includes("..") && !n.includes("/") && !n.includes("\\"), `nom dangereux : ${piege} → ${n}`);
}
assert.ok(nettoyerNom("🎵.png").length > 4, "nom vide après nettoyage");
assert.ok(nettoyerNom("x".repeat(200) + ".pdf").length <= 80, "nom trop long");
assert.ok(nettoyerNom("photo.HEIC").endsWith(".HEIC"), "extension perdue");
console.log("1 : nettoyerNom");

// Pas d'écrasement : a.pdf existe → a-2.pdf
const dossier = mkdtempSync(join(tmpdir(), "facettes-livret-"));
writeFileSync(join(dossier, "a.pdf"), "x");
assert.equal(nomLibre(dossier, "a.pdf"), "a-2.pdf");
writeFileSync(join(dossier, "a-2.pdf"), "x");
assert.equal(nomLibre(dossier, "a.pdf"), "a-3.pdf");
assert.equal(nomLibre(dossier, "b.pdf"), "b.pdf");
console.log("2 : nomLibre");

// Sans .env : message clair et code de sortie 2
const r = spawnSync(process.execPath, ["outils/recuperer-cours.mjs"],
  { encoding: "utf8", env: { ...process.env, FACETTES_ENV: join(dossier, "absent.env") } });
assert.equal(r.status, 2, "code de sortie sans .env");
assert.match(r.stderr, /SUPABASE_CLE_SECRETE/, "le message n'explique pas quoi mettre dans .env");
console.log("3 : sans .env");
// Relecture 1 : un chemin piégé ne doit jamais partir avec la clé secrète
const ID = "0b2c6f1e-8a4d-4c3b-9f2e-1a2b3c4d5e6f";
assert.equal(cheminValide(`reseau/${ID}-TD-2.pdf`, "reseau"), true, "chemin normal refusé");
for (const [chemin, matiere] of [["../../../auth/v1/admin/users", "reseau"], [`eco/${ID}-TD.pdf`, "reseau"],
  [`reseau/${ID}-../x.pdf`, "reseau"], [`reseau/x.pdf`, "reseau"], [`../${ID}-x.pdf`, ".."]])
  assert.equal(cheminValide(chemin, matiere), false, `chemin piégé accepté : ${chemin}`);
console.log("4 : chemins piégés refusés");

// Relecture 5 : noms réservés de Windows, extension tirée du type réel
assert.ok(!/^(con|nul|aux|prn|com\d|lpt\d)(\.|$)/i.test(nettoyerNom("con.pdf")), "nom réservé Windows gardé");
assert.ok(!/^(con|nul|aux|prn|com\d|lpt\d)$/i.test(nettoyerNom("NUL")), "dossier réservé Windows gardé");
assert.equal(nomLocal({ nom: "cours.exe", type: "application/pdf" }), "cours.pdf", "extension du nom au lieu du type");
assert.equal(nomLocal({ nom: "IMG_1.HEIC", type: "image/heic" }), "IMG_1.heic");
console.log("5 : noms Windows et extension");

// Relecture 2 : un document introuvable n'empêche pas les suivants
const racine = mkdtempSync(join(tmpdir(), "facettes-recup-"));
const docs = [
  { id: "11111111-1111-4111-8111-111111111111", matiere: "reseau", nom: "absent.pdf", type: "application/pdf", taille: 10, chemin: "reseau/11111111-1111-4111-8111-111111111111-absent.pdf" },
  { id: "22222222-2222-4222-8222-222222222222", matiere: "reseau", nom: "TD 3.pdf", type: "application/pdf", taille: 10, chemin: "reseau/22222222-2222-4222-8222-222222222222-TD-3.pdf" },
  { id: "33333333-3333-4333-8333-333333333333", matiere: "reseau", nom: "piege.pdf", type: "application/pdf", taille: 10, chemin: "../../../auth/v1/admin/users" },
];
const appels = [];
const fausseRequete = async (_env, chemin) => {
  appels.push(chemin);
  if (chemin.startsWith("/rest/v1/documents")) return { json: async () => docs };
  if (chemin.includes("absent")) throw new Error("HTTP 404");
  return { arrayBuffer: async () => new TextEncoder().encode("%PDF").buffer };
};
const bilan = await recuperer({}, { requete: fausseRequete, racine });
assert.equal(bilan.recus, 1, "le document suivant n'a pas été récupéré");
assert.equal(bilan.echecs, 2, "échecs mal comptés (absent + chemin piégé)");
assert.ok(existsSync(join(racine, "sources", "reseau", "TD-3.pdf")), "fichier non écrit");
assert.ok(!appels.some((c) => c.includes("auth")), "une requête est partie vers un chemin piégé");
console.log("6 : un échec n'arrête pas les autres, chemin piégé jamais demandé");

// Relecture 4 : le marquage vérifie le nombre de lignes mises à jour ; le lot vérifie ses ids
await assert.rejects(marquerTraites({}, [ID, "44444444-4444-4444-8444-444444444444"], "lot.json",
  async () => ({ json: async () => [{ id: ID }] })), /1 sur 2/, "marquage partiel annoncé comme réussi");
await marquerTraites({}, [ID], "lot.json", async () => ({ json: async () => [{ id: ID }] }));
const existant = { matieres: [{ id: "reseau", nom: "Réseaux" }], contenus: [] };
assert.ok(verifierLot({ documents: ["pas-un-uuid"], contenus: [] }, existant).problemes.some((p) => /documents/.test(p)), "ids de documents non vérifiés");
assert.deepEqual(verifierLot({ documents: [ID], contenus: [] }, existant).problemes, [], "ids valides refusés");
console.log("7 : marquage vérifié, ids du lot contrôlés");

// Relecture 3 : il existe une commande pour (re)marquer un lot déjà fusionné
const m = spawnSync(process.execPath, ["outils/marquer-cours.mjs", "a-relire/fusionnes/inexistant.json"],
  { encoding: "utf8", env: { ...process.env, FACETTES_ENV: join(dossier, "absent.env") } });
assert.equal(m.status, 2, "marquer-cours sans .env : code de sortie");
assert.match(m.stderr, /SUPABASE_CLE_SECRETE/, "marquer-cours sans .env : message");
console.log("8 : marquer-cours");
console.log("OK — outils du livret");
