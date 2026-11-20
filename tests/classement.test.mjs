// Classement Survie, côté appli. Le CAPTCHA empêche de connecter un compte dans ces tests :
// on vérifie ici tout ce qui marche sans compte (Survie, pseudo, écran, rendu, hors ligne) ;
// le parcours connecté est vérifié à la main (plan, tâche 5) et la base par tests/sql/classement.sql.
// Lancer depuis la racine du dépôt : node tests/classement.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const { erreursCarte } = createRequire(import.meta.url)("../app/validation.js");
const cartes = JSON.parse(readFileSync("app/data/contenus.json", "utf8")).contenus;
const rapides = cartes.filter((c) => (c.format === "vrai_faux" || c.format === "trous") && erreursCarte(c).length === 0);

const serveur = await demarrerServeur("app", 8765);
const edge = await lancerEdge();
let echec = null;
try {
  const a = await edge.nouvelAppareil();
  await a.aller(serveur.url);
  // Scénario 1 : réglages réduits à l'Économie, la Survie tire quand même dans toutes les matières
  const matieres = [...new Set(cartes.map((c) => c.matiere))].filter((m) => m !== "eco");
  await a.evaluer(`localStorage.setItem("agon.reglages", JSON.stringify({ matieresExclues: ${JSON.stringify(matieres)}, formatsExclus: [] }))`);
  await a.aller(serveur.url);
  await a.attendreQue("!document.getElementById('lancement')", 6000);
  await a.cliquer(".f-bouton-survie");
  const depart = await a.evaluer("document.querySelector(\".f-ecran[data-matiere='survie']\").innerText");
  assert.match(depart, /Toutes les matières/, "scénario 1 : le départ ne dit pas « Toutes les matières »");
  assert.match(depart, new RegExp(`\\b${rapides.length} questions`), `scénario 1 : ${rapides.length} questions attendues`);
  await a.cliquer(".f-ecran[data-matiere='survie'] .f-lancer");
  await a.cliquer(".f-ecran[data-matiere='survie'] .f-choix .f-option");
  await attendre(800);
  assert.equal(await a.evaluer(`localStorage.getItem("agon.parties")`), null, "scénario 1 : sans compte, aucune partie en file");
  console.log(`1 : Survie sur toutes les matières (${rapides.length} questions), rien en file sans compte`);

  // Scénario 2 : messages du pseudo (règles identiques à celles de la base)
  const FORMAT = "3 à 20 caractères : lettres, chiffres, _ et -.";
  assert.equal(await a.evaluer(`Compte.messagePseudo("ab")`), FORMAT, "pseudo trop court");
  assert.equal(await a.evaluer(`Compte.messagePseudo("a b")`), FORMAT, "pseudo avec espace");
  assert.equal(await a.evaluer(`Compte.messagePseudo("x".repeat(21))`), FORMAT, "pseudo trop long");
  assert.equal(await a.evaluer(`Compte.messagePseudo("Ferdi")`), null, "pseudo valide");
  assert.equal(await a.evaluer(`Compte.messagePseudo("Ferdi", { code: "23505" })`), "Déjà pris : essaie un autre pseudo.", "pseudo pris");
  console.log("2 : messages du pseudo");

  assert.deepEqual(a.violationsCsp, [], "violations CSP");
  assert.deepEqual(a.erreurs, [], "erreurs");
  console.log("OK — classement (appli)");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
