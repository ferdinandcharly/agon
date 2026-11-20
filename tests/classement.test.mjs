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
  // On répond jusqu'à la fin de la partie (une erreur ou le chrono à zéro)
  for (let i = 0; i < 80 && !(await a.evaluer("!!document.querySelector('.f-survie-fin')")); i++) {
    await a.evaluer(`document.querySelector(".f-ecran[data-matiere='survie'] .f-choix .f-option")?.click()`);
    await attendre(400);
  }
  assert.equal(await a.evaluer("!!document.querySelector('.f-survie-fin')"), true, "scénario 1 : la partie ne s'est pas terminée");
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

  // Scénario 3 : sans compte, l'écran invite à se connecter et ouvre les réglages
  await a.cliquer("#btn-accueil");
  await a.cliquer(".f-bouton-classement");
  assert.equal(await a.evaluer("document.getElementById('classement').classList.contains('cache')"), false, "scénario 3 : écran caché");
  assert.match(await a.evaluer("document.getElementById('classement').innerText"), /Connecte-toi pour apparaître/, "scénario 3 : invitation absente");
  await a.cliquer("#classement .f-classement-connexion");
  assert.equal(await a.evaluer("document.getElementById('reglages').open"), true, "scénario 3 : les réglages ne s'ouvrent pas");
  await a.cliquer("#btn-fermer-reglages");
  console.log("3 : sans compte → invitation et réglages");

  // Scénario 4 : rendu hors ligne (podium, ta place hors du top 50, bandeau)
  const lignes = [
    { rang: 1, pseudo: "Ferdi", score: 42, moi: false }, { rang: 2, pseudo: "Bastien", score: 40, moi: false },
    { rang: 3, pseudo: "Lou", score: 31, moi: false }, { rang: 63, pseudo: "Moi", score: 4, moi: true }];
  const rendu = await a.evaluer(`(() => {
    const n = Classement.rendre(${JSON.stringify(lignes)}, { periode: "semaine", date: new Date().toISOString(),
      debut: Classement.lundiCourant(), horsLigne: true });
    const z = document.getElementById("classement"); z.querySelector(".f-classement-zone").replaceChildren(n);
    const li = [...n.querySelectorAll(".f-classement-ligne")];
    return { n: li.length, premier: li[0].className, dernier: li.at(-1).className, texteDernier: li.at(-1).innerText,
      sep: !!n.querySelector(".f-classement-sep"), bandeau: n.querySelector(".f-classement-bandeau")?.innerText || "" };
  })()`);
  assert.equal(rendu.n, 4, "scénario 4 : 4 lignes attendues");
  assert.ok(rendu.premier.split(" ").includes("or"), "scénario 4 : le 1er n’a pas la classe or");
  assert.ok(rendu.dernier.split(" ").includes("moi"), "scénario 4 : ta ligne n’est pas mise en avant");
  assert.match(rendu.texteDernier, /63/, "scénario 4 : ton rang manque");
  assert.ok(rendu.sep, "scénario 4 : séparateur « … » absent");
  assert.match(rendu.bandeau, /Hors ligne/, "scénario 4 : bandeau hors ligne absent");
  await a.capture("tests/captures/classement-iPhone.png");
  console.log("4 : rendu hors ligne (podium, ta place, bandeau)");

  // Scénario 5 : cache d'une autre semaine
  const ancien = await a.evaluer(`(() => {
    const lundi = new Date(Classement.lundiCourant()); lundi.setDate(lundi.getDate() - 7);
    const n = Classement.rendre(${JSON.stringify(lignes)}, { periode: "semaine", date: lundi.toISOString(), debut: lundi.toISOString(), horsLigne: true });
    return n.querySelector(".f-classement-bandeau")?.innerText || ""; })()`);
  assert.match(ancien, /semaine dernière/, "scénario 5 : « semaine dernière » absent");
  console.log("5 : cache de la semaine précédente signalé");

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
