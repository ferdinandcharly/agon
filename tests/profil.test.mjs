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

  // 1b : Profil → Paramètres → Matières → retour → retour
  const titre = () => p.evaluer("document.querySelector('#profil .f-param-titre')?.textContent || ''");
  await p.cliquer("#profil .f-profil-roue");
  assert.equal(await titre(), "Paramètres", "scénario 1b : Paramètres non ouverts");
  assert.equal(await p.evaluer(visible("#nav")), false, "scénario 1b : barre du bas sur les Paramètres");
  assert.match(await p.evaluer("document.querySelector('#profil [data-ligne=sync]').textContent"), /À jour|Synchronisation…|Hors ligne|Erreur|—/, "scénario 1b : état de la synchro");
  assert.match(await p.evaluer("document.querySelector('#profil [data-ligne=matieres]').textContent"), /9 sur 9/, "scénario 1b : compte des matières");
  await p.cliquer("#profil [data-ligne=matieres]");
  assert.equal(await titre(), "Matières", "scénario 1b : Matières non ouvertes");
  assert.equal(await p.evaluer("document.querySelectorAll('#profil .f-param-inter[role=switch]').length"), 9, "scénario 1b : 9 interrupteurs");
  // 2 : couper une matière la retire du fil ; la dernière ne se coupe pas
  await p.cliquer("#profil .f-param-inter[data-id=maths]");
  assert.equal(await p.evaluer("reglages.matieresExclues.includes('maths') && !contenusRetenus().some((c) => c.matiere === 'maths')"), true, "scénario 2 : maths toujours dans le fil");
  await p.evaluer(`document.querySelectorAll('#profil .f-param-inter[aria-checked=true]').forEach((b) => b.click())`);
  assert.equal(await p.evaluer("document.querySelectorAll('#profil .f-param-inter[aria-checked=true]').length"), 1, "scénario 2 : dernière matière coupée");
  await p.cliquer("#profil .f-param-retour");
  assert.match(await p.evaluer("document.querySelector('#profil [data-ligne=matieres]').textContent"), /1 sur 9/, "scénario 2 : compte non mis à jour");
  await p.cliquer("#profil [data-ligne=formats]");
  assert.equal(await titre(), "Types de jeux", "scénario 2 : Types de jeux non ouverts");
  assert.equal(await p.evaluer("document.querySelectorAll('#profil .f-param-inter').length"), await p.evaluer("Object.keys(NOMS_FORMATS).length"), "scénario 2 : interrupteurs de jeux");
  await p.cliquer("#profil .f-param-inter[data-id=vrai_faux]");
  assert.equal(await p.evaluer("reglages.formatsExclus.includes('vrai_faux') && !contenusRetenus().some((c) => c.format === 'vrai_faux')"), true, "scénario 2 : vrai/faux toujours dans le fil");
  await p.evaluer("reglages.matieresExclues = []; reglages.formatsExclus = []; ecrireReglages(reglages)");
  await p.cliquer("#profil .f-param-retour");
  // 6 : effacer sa progression en deux appuis ; le Profil repart de zéro
  await p.cliquer("#profil [data-action=effacer]");
  assert.equal(await p.evaluer("document.querySelector('#profil [data-action=effacer]').textContent"), "Confirmer : tout effacer", "scénario 6 : pas de confirmation");
  assert.ok(await p.evaluer("Object.keys(lireResultats()).length") > 0, "scénario 6 : effacé dès le premier appui");
  await p.cliquer("#profil [data-action=effacer]");
  assert.equal(await p.evaluer("Object.keys(lireResultats()).length"), 0, "scénario 6 : progression non effacée");
  await p.cliquer("#profil .f-param-retour");
  assert.equal(await p.evaluer("document.querySelector('#profil [data-stat=notions] b').textContent"), "0", "scénario 6 : notions du profil pas remises à zéro");
  assert.equal(await p.evaluer(visible("#nav")), true, "scénario 1b : barre du bas absente au retour sur le Profil");
  assert.equal(await p.evaluer("document.getElementById('reglages')"), null, "scénario 1b : l'ancienne boîte Réglages existe encore");
  console.log("1b, 2 et 6 : Paramètres");

  // 5 : modifier son profil (profil lu simulé ; enregistrement simulé)
  await p.evaluer(`(async () => {
    Compte.client().from = () => ({ select: () => ({ maybeSingle: async () => ({ data: ${JSON.stringify(ZOE)}, error: null }) }) });
    await Compte.lireProfil();
    Profil.ouvrir();
  })()`);
  assert.equal(await p.evaluer("document.querySelector('#profil .f-profil-pseudo').textContent"), "Zoe_1", "scénario 5 : profil non affiché");
  assert.equal(await p.evaluer("document.querySelector('#profil .f-profil-ligne').textContent"), "Zoé · IUT · BUT info 1", "scénario 5 : ligne d'identité");
  await p.cliquer("#profil .f-profil-modifier");
  assert.equal(await p.evaluer("document.querySelector('#profil .f-param-titre').textContent"), "Modifier mon profil", "scénario 5 : écran non ouvert");
  const pre = await p.evaluer(`({ pseudo: document.getElementById("profil-pseudo").value, prenom: document.getElementById("profil-prenom").value,
    etab: document.getElementById("profil-etablissement").value,
    couleur: document.querySelector('#profil [data-couleur="rose"]').getAttribute("aria-pressed"),
    symbole: document.querySelector('#profil [data-symbole="coeur"]').getAttribute("aria-pressed") })`);
  assert.deepEqual(pre, { pseudo: "Zoe_1", prenom: "Zoé", etab: "IUT", couleur: "true", symbole: "true" }, "scénario 5 : champs non préremplis");
  // Format invalide : erreur sous le pseudo, on reste
  await p.evaluer(`document.getElementById("profil-pseudo").value = "a b"`);
  await p.cliquer("#profil .f-param-enregistrer");
  await attendre(200);
  assert.notEqual(await p.evaluer(`document.querySelector('#profil [data-champ="pseudo"]').textContent`), "", "scénario 5 : pas d'erreur de format");
  assert.equal(await p.evaluer("document.querySelector('#profil .f-param-titre').textContent"), "Modifier mon profil", "scénario 5 : écran quitté malgré l'erreur");
  // Pseudo déjà pris : message sous le champ, profil inchangé
  await p.evaluer(`Compte.enregistrerProfil = async () => { throw { code: "23505", message: "profils_pseudo_key", messageAffiche: "Déjà pris : essaie un autre pseudo." }; };
    document.getElementById("profil-pseudo").value = "Pris_1"`);
  await p.cliquer("#profil .f-param-enregistrer");
  await attendre(200);
  assert.match(await p.evaluer(`document.querySelector('#profil [data-champ="pseudo"]').textContent`), /Déjà pris/, "scénario 5 : pseudo pris non signalé");
  // Annuler : retour au profil, rien de changé
  await p.cliquer("#profil .f-param-annuler");
  assert.equal(await p.evaluer("document.querySelector('#profil .f-profil-pseudo').textContent"), "Zoe_1", "scénario 5 : Annuler a changé le profil");
  // Enregistrer réussi : retour au profil
  await p.cliquer("#profil .f-profil-modifier");
  await p.evaluer(`Compte.enregistrerProfil = async (infos) => { window.__enregistre = infos; };
    document.getElementById("profil-prenom").value = "Zoéa"`);
  await p.cliquer("#profil .f-param-enregistrer");
  await attendre(200);
  assert.equal(await p.evaluer("!!document.querySelector('#profil .f-profil-pseudo')"), true, "scénario 5 : pas de retour au profil");
  assert.deepEqual(await p.evaluer("window.__enregistre"), { pseudo: "Zoe_1", prenom: "Zoéa", etablissement: "IUT", avatar: "rose-coeur", parcours: "but-info-1" }, "scénario 5 : valeurs envoyées");
  console.log("5 : modifier mon profil");

  // 7 : captures iPhone (Profil, Paramètres) et PC (Profil)
  await p.evaluer("Profil.ouvrir()");
  await attendre(400);
  await p.capture("tests/captures/profil-iPhone.png");
  await p.evaluer("Profil.empiler('parametres')");
  await attendre(400);
  await p.capture("tests/captures/parametres-iPhone.png");
  const pc = await edge.nouvelAppareil({ largeur: 1280, hauteur: 800, mobile: false });
  await pc.aller(serveur.url);
  await pc.attendreQue(pret, 8000);
  await attendre(500);
  await pc.evaluer("Profil.ouvrir()");
  await attendre(400);
  await pc.capture("tests/captures/profil-PC.png");
  console.log("7 : captures");

  for (const x of [a, p, pc]) {
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
