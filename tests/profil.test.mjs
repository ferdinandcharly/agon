// Profil et Paramètres : écran Profil (stats, semaine, matières), Paramètres rangés, modifier son profil,
// et l'activité de la semaine (cartes jouées par jour, synchronisées dans la collection).
// Lancer depuis la racine du dépôt : node tests/profil.test.mjs
import assert from "node:assert/strict";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const serveur = await demarrerServeur("app", 8766);
const edge = await lancerEdge();
const pret = "!document.getElementById('lancement') && typeof donnees !== 'undefined' && !!donnees";
let echec = null;
try {
  const a = await edge.nouvelAppareil();
  await a.aller(serveur.url);
  await a.attendreQue(pret, 8000);
  await attendre(500);

  // 4 : activité de la semaine (fonctions pures, incrément, fusion)
  const r4 = await a.evaluer(`(() => {
    const auj = "2026-11-24";
    return {
      norm: normaliserJours({ "2026-11-24": 3, "2026-11-10": 5, "2026-11-11": 2, x: 4, "2026-11-20": -3, "2026-11-21": "12", "2026-11-22": 1e9, "2026-11-23": 1.5 }, auj),
      fus: fusionnerJours({ "2026-11-24": 3, "2026-11-23": 9 }, { "2026-11-24": 7, "2026-11-22": 2 }, auj),
      pasTableau: normaliserJours([1, 2], auj),
      nul: normaliserJours(null, auj),
      minuit: jourLocal(new Date(2026, 10, 24, 23, 59)) + "|" + jourLocal(new Date(2026, 10, 25, 0, 1)),
    };
  })()`);
  assert.deepEqual(r4.norm, { "2026-11-24": 3, "2026-11-11": 2 }, "scénario 4 : normalisation");
  assert.deepEqual(r4.fus, { "2026-11-24": 7, "2026-11-23": 9, "2026-11-22": 2 }, "scénario 4 : fusion au maximum");
  assert.deepEqual(r4.pasTableau, {}, "scénario 4 : tableau accepté");
  assert.deepEqual(r4.nul, {}, "scénario 4 : null accepté");
  assert.equal(r4.minuit, "2026-11-24|2026-11-25", "scénario 4 : jour local autour de minuit");
  const avant = await a.evaluer("lireCollection().jours[jourLocal()] || 0");
  await a.evaluer("enregistrerResultat(donnees.contenus[0].id, true); enregistrerResultat(donnees.contenus[1].id, false)");
  assert.equal(await a.evaluer("lireCollection().jours[jourLocal()]"), avant + 2, "scénario 4 : réponses non comptées");
  const fusion = await a.evaluer(`(() => {
    const local = { resultats: {}, reglages: lireReglages(), collection: lireCollection(), survie: { record: 0 } };
    return Compte.fusionner(local, { collection: { jours: { [jourLocal()]: 50, "x": 3 } } }).collection.jours;
  })()`);
  assert.equal(fusion[await a.evaluer("jourLocal()")], 50, "scénario 4 : fusion distante");
  assert.equal(fusion.x, undefined, "scénario 4 : clé distante invalide gardée");
  console.log("4 : activité de la semaine");

  for (const x of [a]) {
    assert.deepEqual(x.violationsCsp, [], "violations CSP");
    assert.deepEqual(x.erreurs, [], "erreurs");
  }
  console.log("OK — profil");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
