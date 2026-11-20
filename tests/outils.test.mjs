// Outils du PC pour le livret de cours (sans réseau). Lancer depuis la racine : node tests/outils.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { nettoyerNom, nomLibre } from "../outils/recuperer-cours.mjs";

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
console.log("OK — outils du livret");
