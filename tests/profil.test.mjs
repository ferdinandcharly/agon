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

  // 2b : le profil lu contient avatar, prénom, établissement et parcours ; un événement signale chaque changement
  const ZOE = { pseudo: "Zoe_1", avatar: "rose-coeur", prenom: "Zoé", etablissement: "IUT", parcours: "but-info-1" };
  const r2 = await a.evaluer(`(async () => {
    let vus = 0;
    addEventListener("facettes:profil", () => { vus++; });
    Compte.client().from = () => ({ select: (cols) => { window.__colonnes = cols;
      return { maybeSingle: async () => ({ data: ${JSON.stringify(ZOE)}, error: null }) }; } });
    await Compte.lireProfil();
    return { profil: Compte.profil(), vus, colonnes: window.__colonnes, etat: Compte.etat() };
  })()`);
  assert.deepEqual(r2.profil, ZOE, "scénario 2b : profil incomplet");
  assert.ok(r2.vus >= 1, "scénario 2b : pas d'événement facettes:profil");
  assert.match(r2.colonnes, /avatar/, "scénario 2b : colonnes lues");
  assert.ok(["deconnecte", "synchro", "ok", "hors-ligne", "erreur"].includes(r2.etat), `scénario 2b : état ${r2.etat}`);
  console.log("2b : profil complet");

  // 1a et 3 : écran Profil (session simulée hors ligne : profil jamais lu → pseudo « … »)
  const p = await edge.nouvelAppareil();
  await p.aller(serveur.url);
  await p.attendreQue(pret, 8000);
  await attendre(500);
  const visible = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)});
    return !!e && !e.classList.contains("cache") && getComputedStyle(e).display !== "none"; })()`;
  // Une notion entière réussie → 1 notion allumée
  await p.evaluer(`(() => {
    const cartes = donnees.contenus.filter((c) => contenuValide(c));
    const premiere = cartes.find((c) => c.format !== "fiche");
    const r = {};
    for (const c of cartes.filter((c) => c.matiere === premiere.matiere && c.notion === premiere.notion && c.format !== "fiche"))
      r[c.id] = { vu: 1, ok: 1, ko: 0, derniereOk: true, boite: 2, dernier: new Date().toISOString() };
    localStorage.setItem("agon.resultats", JSON.stringify(r));
  })()`);
  await p.cliquer("#btn-reglages");
  await attendre(300);
  assert.equal(await p.evaluer(visible("#profil")), true, "scénario 1a : profil caché");
  assert.equal(await p.evaluer(visible("#accueil")), false, "scénario 1a : accueil visible");
  assert.equal(await p.evaluer(visible("#nav")), true, "scénario 1a : barre du bas cachée");
  assert.equal(await p.evaluer("document.querySelectorAll('#nav [aria-current]').length"), 0, "scénario 1a : un onglet actif");
  assert.equal(await p.evaluer("document.querySelector('#profil .f-profil-pseudo').textContent"), "…", "scénario 1a : pseudo hors ligne");
  assert.equal(await p.evaluer("document.querySelector('#profil [data-stat=notions] b').textContent"), "1", "scénario 3 : notions allumées");
  assert.equal(await p.evaluer("document.querySelectorAll('#profil .f-profil-matiere').length"), 4, "scénario 3 : 4 matières");
  await p.cliquer("#profil .f-profil-tout");
  assert.equal(await p.evaluer("document.querySelectorAll('#profil .f-profil-matiere').length"), await p.evaluer("donnees.matieres.length"), "scénario 3 : Tout voir");
  await p.cliquer("#profil .f-profil-tout");
  assert.equal(await p.evaluer("document.querySelectorAll('#profil .f-profil-matiere').length"), 4, "scénario 3 : Moins");
  assert.equal(await p.evaluer("document.querySelectorAll('#profil .f-profil-jour').length"), 7, "scénario 3 : 7 jours");
  const r3 = await p.evaluer(`(() => {
    const s = Profil.semaine({ "2026-11-24": 11, "2026-11-23": 4 }, new Date(2026, 10, 24));
    const m = Profil.matieres([
      { matiere: { id: "sys", nom: "Systèmes" }, etat: "maitrisee" }, { matiere: { id: "sys", nom: "Systèmes" }, etat: "maitrisee" },
      { matiere: { id: "sys", nom: "Systèmes" }, etat: "en_cours" }, { matiere: { id: "bd", nom: "BD" }, etat: "maitrisee" }]);
    return { s, m };
  })()`);
  assert.equal(r3.s.length, 7, "scénario 3 : semaine de 7 jours");
  assert.deepEqual([r3.s[0].lettre, r3.s[0].jour, r3.s[0].nb], ["L", "2026-11-23", 4], "scénario 3 : lundi");
  assert.deepEqual([r3.s[1].nb, r3.s[1].aujourdhui, r3.s[2].futur], [11, true, true], "scénario 3 : mardi / mercredi");
  assert.deepEqual(r3.m.map((x) => [x.id, x.faites, x.total]), [["bd", 1, 1], ["sys", 2, 3]], "scénario 3 : matières triées");
  console.log("1a et 3 : écran Profil");

  for (const x of [a, p]) {
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
