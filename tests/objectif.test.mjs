// Objectif du jour : réglage (normalisé, synchronisé), jauge de l'accueil, message au franchissement,
// réglage dans Paramètres et repère dans la semaine du Profil.
// Lancer depuis la racine du dépôt : node tests/objectif.test.mjs
import assert from "node:assert/strict";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const serveur = await demarrerServeur("app", 8767);
const edge = await lancerEdge();
const pret = "!document.getElementById('lancement') && typeof donnees !== 'undefined' && !!donnees";
// Pose l'objectif et le compteur du jour, sans toucher au reste
const poser = (objectif, faites) => `(() => {
  const r = lireReglages(); r.objectif = ${objectif}; ecrireReglages(r); reglages = lireReglages();
  const c = lireCollection(); c.jours = { [jourLocal()]: ${faites} }; ecrireCollection(c);
})()`;
let echec = null;
const appareils = [];
try {
  const a = await edge.nouvelAppareil();
  appareils.push(a);
  await a.aller(serveur.url);
  await a.attendreQue(pret, 8000);
  await attendre(500);

  // 1 : normalisation et lecture du compteur
  const r1 = await a.evaluer(`(() => {
    const bons = [10, 20, 40, 0].map(normaliserObjectif);
    const mauvais = [15, "20", null, -1, undefined].map(normaliserObjectif);
    const sauve = localStorage.getItem("agon.reglages");
    localStorage.setItem("agon.reglages", "{abîmé");
    const abime = lireReglages().objectif;
    localStorage.setItem("agon.reglages", sauve);
    ${poser(20, 12)};
    const en20 = objectifDuJour();
    ${poser(0, 12)};
    const aucun = objectifDuJour();
    return { bons, mauvais, abime, en20, aucun };
  })()`);
  assert.deepEqual(r1.bons, [10, 20, 40, 0], "scénario 1 : valeurs permises");
  assert.deepEqual(r1.mauvais, [20, 20, 20, 20, 20], "scénario 1 : valeurs abîmées");
  assert.equal(r1.abime, 20, "scénario 1 : réglages abîmés");
  assert.deepEqual(r1.en20, { objectif: 20, faites: 12, atteint: false }, "scénario 1 : objectifDuJour");
  assert.equal(r1.aucun, null, "scénario 1 : objectif « Aucun »");
  console.log("1 : réglage et compteur");

  // 2 : fusion des réglages (synchro)
  const r2 = await a.evaluer(`(() => {
    const base = { resultats: {}, collection: lireCollection(), survie: { record: 0 } };
    const local = { ...lireReglages(), objectif: 10, maj: "2026-11-01T00:00:00Z" };
    const distant = (o) => ({ reglages: { matieresExclues: [], formatsExclus: [], maj: "2026-11-02T00:00:00Z", ...o } });
    return {
      quarante: Compte.fusionner({ ...base, reglages: local }, distant({ objectif: 40 })).reglages.objectif,
      absent: Compte.fusionner({ ...base, reglages: local }, distant({})).reglages.objectif,
      abime: Compte.fusionner({ ...base, reglages: local }, distant({ objectif: 999 })).reglages.objectif,
    };
  })()`);
  assert.deepEqual(r2, { quarante: 40, absent: 10, abime: 20 }, "scénario 2 : fusion");
  console.log("2 : fusion");

  for (const x of appareils) {
    assert.deepEqual(x.violationsCsp, [], "violations CSP");
    assert.deepEqual(x.erreurs, [], "erreurs");
  }
  console.log("OK — objectif");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
