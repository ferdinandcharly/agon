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
    const lu = [...p.querySelectorAll("span")].filter((x) => !x.closest("[aria-hidden=true]")).map((x) => x.textContent).join("");
    return { texte: p.textContent, atteint: p.classList.contains("atteint"), label: p.getAttribute("aria-label"), lu,
             part: getComputedStyle(barre).getPropertyValue("--part").trim(),
             apresLancer: p.previousElementSibling?.classList.contains("f-lancer-session") };
  })()`);
  const enCours = await jauge(20, "{ [jourLocal()]: 12 }");
  assert.match(enCours.texte, /12\/20 cartes aujourd'hui/, "scénario 3 : texte en cours");
  assert.equal(enCours.part, "0.6", "scénario 3 : part");
  assert.equal(enCours.label, null, "scénario 3 : aria-label sur un paragraphe (ignoré des lecteurs d'écran)");
  assert.equal(enCours.lu, "12/20 cartes aujourd'hui", "scénario 3 : texte lu par le lecteur d'écran");
  assert.equal(enCours.atteint, false, "scénario 3 : pas encore atteint");
  assert.equal(enCours.apresLancer, true, "scénario 3 : jauge juste sous le bouton Lancer");
  const fini = await jauge(20, "{ [jourLocal()]: 25 }");
  assert.match(fini.texte, /Objectif atteint ✓/, "scénario 3 : texte atteint");
  assert.equal(fini.atteint, true, "scénario 3 : classe atteint");
  assert.equal(fini.part, "1", "scénario 3 : barre pleine");
  assert.equal(fini.lu, "Objectif atteint ✓", "scénario 3 : texte atteint lu");
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
  const enc = await edge.nouvelAppareil({ largeur: 390, hauteur: 844, mobile: true });
  appareils.push(enc);
  await enc.aller(serveur.url);
  await enc.attendreQue(pret, 8000);
  await enc.encoche(59, 34);
  await enc.evaluer(`montrerFil("session")`);
  await attendre(400);
  const r4 = await enc.evaluer(`(() => { ${poser(20, 19).slice(0, -2)}(); enregistrerResultat("x", true);
    const t = document.querySelector(".f-objectif-toast").getBoundingClientRect();
    const bas = Math.max(...[...document.querySelectorAll(".f-entete > *")].filter((e) => e.offsetParent)
      .map((e) => e.getBoundingClientRect().bottom));
    return { haut: Math.round(t.top), basEntete: Math.round(bas) };
  })()`);
  assert.ok(r4.haut >= r4.basEntete, `scénario 4 : message sur l'en-tête (haut ${r4.haut} < bas de l'en-tête ${r4.basEntete})`);
  console.log("4 : message au franchissement");

  // 5 : réglage dans Paramètres › Jeu
  await a.evaluer(`(() => { const r = lireReglages(); delete r.objectif; ecrireReglages(r); reglages = lireReglages(); })()`);
  await a.evaluer("Profil.ouvrir(); Profil.empiler('parametres')");
  await attendre(300);
  const r5 = await a.evaluer(`(() => {
    const seg = document.querySelector("#profil .f-segment-objectif");
    const groupe = seg?.closest(".f-param-groupe")?.querySelector("h2")?.textContent;
    const boutons = [...(seg?.querySelectorAll("button") || [])];
    return { groupe, textes: boutons.map((b) => b.textContent),
             presse: boutons.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent) };
  })()`);
  assert.deepEqual(r5, { groupe: "Jeu", textes: ["10", "20", "40", "Aucun"], presse: ["20"] }, "scénario 5 : segment");
  const r5b = await a.evaluer(`(() => {
    const maj = lireReglages().maj;
    [...document.querySelectorAll("#profil .f-segment-objectif button")].find((b) => b.textContent === "Aucun").click();
    const apres = lireReglages();
    afficherAccueil();
    return { objectif: apres.objectif, majChangee: apres.maj !== maj, jauge: !!document.querySelector("#accueil .f-objectif") };
  })()`);
  assert.deepEqual(r5b, { objectif: 0, majChangee: true, jauge: false }, "scénario 5 : « Aucun »");
  console.log("5 : réglage dans Paramètres");

  // 6 : semaine du Profil (jours où l'objectif est atteint)
  const semaine = (objectif) => a.evaluer(`(() => {
    const r = lireReglages(); r.objectif = ${objectif}; ecrireReglages(r); reglages = lireReglages();
    const lundi = new Date(); lundi.setDate(lundi.getDate() - (lundi.getDay() + 6) % 7);
    const mardi = new Date(lundi); mardi.setDate(lundi.getDate() + 1);
    const c = lireCollection(); c.jours = { [jourLocal(lundi)]: 25, [jourLocal(mardi)]: 5 }; ecrireCollection(c);
    Profil.ouvrir();
    const ok = [...document.querySelectorAll("#profil .f-profil-jour.objectif")];
    return { nb: ok.length, pastille: ok[0]?.querySelector(".f-profil-pastille").textContent || null,
             label: ok[0]?.getAttribute("aria-label") || null,
             phrase: document.querySelector("#profil .f-profil-objectif")?.textContent || null };
  })()`);
  const s20 = await semaine(20);
  assert.equal(s20.nb, 1, "scénario 6 : jours atteints");
  assert.equal(s20.pastille, "✓", "scénario 6 : pastille");
  assert.match(s20.label, /objectif atteint$/, "scénario 6 : aria-label");
  assert.equal(s20.phrase, "Objectif atteint 1 jour sur 7", "scénario 6 : phrase");
  assert.deepEqual(await semaine(0), { nb: 0, pastille: null, label: null, phrase: null }, "scénario 6 : sans objectif");
  console.log("6 : semaine du Profil");

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
