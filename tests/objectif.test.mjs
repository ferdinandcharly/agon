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

  // 3 : jauge de l'accueil (version C)
  const jauge = (objectif, jours) => a.evaluer(`(() => {
    const r = lireReglages(); r.objectif = ${objectif}; ecrireReglages(r); reglages = lireReglages();
    const c = lireCollection(); c.jours = ${jours}; ecrireCollection(c);
    afficherAccueil();
    const p = document.querySelector("#accueil .f-objectif");
    if (!p) return null;
    const barre = p.querySelector(".f-objectif-barre");
    return { texte: p.textContent, atteint: p.classList.contains("atteint"), label: p.getAttribute("aria-label"),
             part: getComputedStyle(barre).getPropertyValue("--part").trim(),
             apresLancer: p.previousElementSibling?.classList.contains("f-lancer-session") };
  })()`);
  const enCours = await jauge(20, "{ [jourLocal()]: 12 }");
  assert.match(enCours.texte, /12\/20 cartes aujourd'hui/, "scénario 3 : texte en cours");
  assert.equal(enCours.part, "0.6", "scénario 3 : part");
  assert.equal(enCours.label, "Objectif du jour : 12 cartes sur 20", "scénario 3 : aria-label");
  assert.equal(enCours.atteint, false, "scénario 3 : pas encore atteint");
  assert.equal(enCours.apresLancer, true, "scénario 3 : jauge juste sous le bouton Lancer");
  const fini = await jauge(20, "{ [jourLocal()]: 25 }");
  assert.match(fini.texte, /Objectif atteint ✓/, "scénario 3 : texte atteint");
  assert.equal(fini.atteint, true, "scénario 3 : classe atteint");
  assert.equal(fini.part, "1", "scénario 3 : barre pleine");
  assert.equal(fini.label, "Objectif du jour atteint", "scénario 3 : aria-label atteint");
  assert.equal(await jauge(0, "{ [jourLocal()]: 12 }"), null, "scénario 3 : jauge sans objectif");
  const lendemain = await jauge(20, `{ "2026-01-01": 30 }`);
  assert.match(lendemain.texte, /0\/20 cartes aujourd'hui/, "scénario 3 : compteur d'un autre jour");
  console.log("3 : jauge de l'accueil");

  // 4 : message au franchissement (une seule fois, sans gêner le jeu)
  const toasts = () => a.evaluer(`[...document.querySelectorAll(".f-objectif-toast")].map((t) => ({
    texte: t.textContent, role: t.getAttribute("role"), clics: getComputedStyle(t).pointerEvents }))`);
  await a.evaluer(`${poser(20, 19)}; enregistrerResultat("x", true)`);
  assert.deepEqual(await toasts(), [{ texte: "Objectif du jour atteint ✓", role: "status", clics: "none" }], "scénario 4 : message au franchissement");
  await a.evaluer(`enregistrerResultat("x", true)`);
  assert.equal((await toasts()).length, 1, "scénario 4 : second message");
  await attendre(3500);
  assert.equal((await toasts()).length, 0, "scénario 4 : message resté affiché");
  await a.evaluer(`${poser(20, 5)}; enregistrerResultat("x", true)`);
  assert.equal((await toasts()).length, 0, "scénario 4 : message sans franchissement");
  await a.evaluer(`${poser(40, 25)}; ${poser(20, 25)}; enregistrerResultat("x", true)`);
  assert.equal((await toasts()).length, 0, "scénario 4 : message après un objectif baissé");
  await a.evaluer(`${poser(0, 19)}; enregistrerResultat("x", true)`);
  assert.equal((await toasts()).length, 0, "scénario 4 : message sans objectif");
  console.log("4 : message au franchissement");

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
