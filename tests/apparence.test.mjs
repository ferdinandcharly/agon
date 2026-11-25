// Apparence : thème Auto / Sombre / Clair (papier) et taille de l'affichage, réglés dans Paramètres et synchronisés.
// Lancer depuis la racine du dépôt : node tests/apparence.test.mjs
import assert from "node:assert/strict";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const serveur = await demarrerServeur("app", 8767);
const edge = await lancerEdge();
const pret = "!document.getElementById('lancement') && typeof donnees !== 'undefined' && !!donnees";
const appareils = [];
async function ouvrir(reglages = null, options = {}) {
  const d = await edge.nouvelAppareil(options);
  appareils.push(d);
  // Ce que vaut data-theme au tout premier DOMContentLoaded (avant que app.js ait tourné) : pas de flash
  await d.avantPage(`${reglages ? `localStorage.setItem("agon.reglages", ${JSON.stringify(JSON.stringify(reglages))});` : ""}
    document.addEventListener("DOMContentLoaded", () => { window.__themeInitial = document.documentElement.dataset.theme || null;
      window.__tailleInitiale = document.documentElement.dataset.taille || null; }, { once: true });`);
  await d.aller(serveur.url);
  await d.attendreQue(pret, 8000);
  await attendre(400);
  return d;
}
let echec = null;
try {
  // 1 : réglage lu, normalisé, appliqué avant le rendu
  const a = await ouvrir();
  const r1 = await a.evaluer(`({
    defaut: Apparence.normaliser(undefined), abime: Apparence.normaliser("x"), partiel: Apparence.normaliser({ theme: 3, taille: "grande" }),
    lu: lireReglages().apparence, initial: window.__themeInitial, taille: window.__tailleInitiale })`);
  assert.deepEqual(r1.defaut, { theme: "auto", taille: "normale" }, "scénario 1 : défauts");
  assert.deepEqual(r1.abime, { theme: "auto", taille: "normale" }, "scénario 1 : valeur abîmée");
  assert.deepEqual(r1.partiel, { theme: "auto", taille: "grande" }, "scénario 1 : valeur partielle");
  assert.deepEqual(r1.lu, { theme: "auto", taille: "normale" }, "scénario 1 : lireReglages sans apparence");
  assert.deepEqual([r1.initial, r1.taille], ["auto", "normale"], "scénario 1 : attributs absents au premier rendu");
  const b = await ouvrir({ matieresExclues: [], formatsExclus: [], maj: "2026-11-25T08:00:00Z", apparence: { theme: "clair", taille: "grande" } });
  assert.deepEqual(await b.evaluer("[window.__themeInitial, window.__tailleInitiale]"), ["clair", "grande"], "scénario 1 : thème clair pas appliqué avant le rendu");
  console.log("1 : réglage lu et appliqué avant le rendu");

  // 2 : fusion entre appareils
  const r2 = await b.evaluer(`(() => {
    const local = { resultats: {}, reglages: lireReglages(), collection: lireCollection(), survie: { record: 0 } };
    const ancien = Compte.fusionner(local, { reglages: { matieresExclues: [], formatsExclus: [], maj: "2026-11-26T00:00:00Z" } }).reglages.apparence;
    const recent = Compte.fusionner(local, { reglages: { matieresExclues: [], formatsExclus: [], maj: "2026-11-26T00:00:00Z",
      apparence: { theme: "sombre", taille: "tres-grande" } } }).reglages.apparence;
    return { ancien, recent };
  })()`);
  assert.deepEqual(r2.ancien, { theme: "clair", taille: "grande" }, "scénario 2 : appareil sans apparence écrase la locale");
  assert.deepEqual(r2.recent, { theme: "sombre", taille: "tres-grande" }, "scénario 2 : apparence distante plus récente ignorée");
  console.log("2 : fusion entre appareils");

  // 3 : rubrique Apparence des Paramètres
  await a.evaluer("Profil.ouvrirParametres()");
  await attendre(300);
  const r3 = await a.evaluer(`(() => {
    const groupes = [...document.querySelectorAll("#profil .f-param-groupe h2")].map((h) => h.textContent);
    const boutons = [...document.querySelectorAll("#profil .f-segment button")];
    return { premier: groupes[0], n: boutons.length, petit: Math.min(...boutons.map((x) => x.getBoundingClientRect().height)),
      presses: boutons.filter((x) => x.getAttribute("aria-pressed") === "true").map((x) => x.dataset.valeur) };
  })()`);
  assert.equal(r3.premier, "Apparence", "scénario 3 : Apparence pas en tête");
  assert.equal(r3.n, 6, "scénario 3 : 6 boutons attendus");
  assert.ok(r3.petit >= 44, `scénario 3 : boutons trop petits (${r3.petit})`);
  assert.deepEqual(r3.presses, ["auto", "normale"], "scénario 3 : valeurs actives");
  await a.cliquer('#profil .f-segment button[data-valeur="clair"]');
  await a.cliquer('#profil .f-segment button[data-valeur="tres-grande"]');
  const r3b = await a.evaluer(`({ theme: document.documentElement.dataset.theme, taille: document.documentElement.dataset.taille,
    reglage: lireReglages().apparence, maj: !!lireReglages().maj })`);
  assert.deepEqual(r3b, { theme: "clair", taille: "tres-grande", reglage: { theme: "clair", taille: "tres-grande" }, maj: true }, "scénario 3 : choix non appliqué");
  console.log("3 : rubrique Apparence");

  for (const x of appareils) {
    assert.deepEqual(x.violationsCsp, [], "violations CSP");
    assert.deepEqual(x.erreurs, [], "erreurs");
  }
  console.log("OK — apparence");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
