// Profil et Paramètres : écran Profil (stats, semaine, matières), Paramètres rangés, modifier son profil,
// et l'activité de la semaine (cartes jouées par jour, synchronisées dans la collection).
// Lancer depuis la racine du dépôt : node tests/profil.test.mjs
import assert from "node:assert/strict";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const serveur = await demarrerServeur("app", 8766);
const edge = await lancerEdge();
const visibleDans = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)});
  return !!e && !e.classList.contains("cache") && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden"; })()`;
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
  await p.cliquer("#nav [data-onglet=profil]");
  await attendre(300);
  assert.equal(await p.evaluer(visible("#profil")), true, "scénario 1a : profil caché");
  assert.equal(await p.evaluer(visible("#accueil")), false, "scénario 1a : accueil visible");
  assert.equal(await p.evaluer(visible("#nav")), true, "scénario 1a : barre du bas cachée");
  assert.equal(await p.evaluer("document.querySelector('#nav [aria-current]')?.dataset.onglet"), "profil", "scénario 1a : onglet Profil non actif");
  assert.equal(await p.evaluer("document.getElementById('btn-reglages')"), null, "scénario 1a : bouton rond encore dans l'en-tête");
  assert.equal(await p.evaluer("document.querySelector('#profil .f-profil-tete .f-avatar-initiale')?.textContent"), "T", "scénario 1a : pas d'initiale sans profil");
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
  const forme = await p.evaluer(`(() => {
    const b = document.querySelector("#profil .f-modifier-enregistrer");
    const tailles = [...document.querySelectorAll("#profil .f-portail-couleur, #profil .f-portail-symbole")]
      .map((x) => Math.min(x.getBoundingClientRect().width, x.getBoundingClientRect().height));
    return { annuler: !!document.querySelector("#profil .f-param-annuler"), retour: !!document.querySelector("#profil .f-param-retour"),
      gros: b?.classList.contains("f-lancer-session"), texte: b?.textContent, messageAvant: b?.previousElementSibling?.classList.contains("f-portail-message"),
      plusPetit: Math.min(...tailles) };
  })()`);
  assert.deepEqual({ ...forme, plusPetit: forme.plusPetit >= 44 }, { annuler: false, retour: true, gros: true, texte: "Enregistrer", messageAvant: true, plusPetit: true },
    `scénario 5 : forme de l'écran Modifier (${JSON.stringify(forme)})`);
  // Format invalide : erreur sous le pseudo, on reste
  await p.evaluer(`document.getElementById("profil-pseudo").value = "a b"`);
  await p.cliquer("#profil .f-modifier-enregistrer");
  await attendre(200);
  assert.notEqual(await p.evaluer(`document.querySelector('#profil [data-champ="pseudo"]').textContent`), "", "scénario 5 : pas d'erreur de format");
  assert.equal(await p.evaluer("document.querySelector('#profil .f-param-titre').textContent"), "Modifier mon profil", "scénario 5 : écran quitté malgré l'erreur");
  // Pseudo déjà pris : message sous le champ, profil inchangé
  await p.evaluer(`Compte.enregistrerProfil = async () => { throw { code: "23505", message: "profils_pseudo_key", messageAffiche: "Déjà pris : essaie un autre pseudo." }; };
    document.getElementById("profil-pseudo").value = "Pris_1"`);
  await p.cliquer("#profil .f-modifier-enregistrer");
  await attendre(200);
  assert.match(await p.evaluer(`document.querySelector('#profil [data-champ="pseudo"]').textContent`), /Déjà pris/, "scénario 5 : pseudo pris non signalé");
  // Annuler : retour au profil, rien de changé
  await p.cliquer("#profil .f-param-retour");
  assert.equal(await p.evaluer("document.querySelector('#profil .f-profil-pseudo').textContent"), "Zoe_1", "scénario 5 : Annuler a changé le profil");
  // Enregistrer réussi : retour au profil
  await p.cliquer("#profil .f-profil-modifier");
  await p.evaluer(`window.__appels = 0;
    Compte.enregistrerProfil = async (infos) => { window.__appels++; window.__enregistre = infos; await new Promise((ok) => setTimeout(ok, 100)); };
    document.getElementById("profil-prenom").value = "Zoéa"`);
  await p.evaluer(`(() => { const b = document.querySelector("#profil .f-modifier-enregistrer"); b.click(); b.click(); })()`);
  await attendre(300);
  assert.equal(await p.evaluer("window.__appels"), 1, "scénario 5 : double appui → deux envois");
  assert.equal(await p.evaluer("document.querySelector('#profil .f-profil-ok')?.textContent"), "Profil mis à jour", "scénario 5 : pas de message de réussite");
  await attendre(200);
  assert.equal(await p.evaluer("!!document.querySelector('#profil .f-profil-pseudo')"), true, "scénario 5 : pas de retour au profil");
  assert.deepEqual(await p.evaluer("window.__enregistre"), { pseudo: "Zoe_1", prenom: "Zoéa", etablissement: "IUT", avatar: "rose-coeur", parcours: "but-info-1" }, "scénario 5 : valeurs envoyées");
  console.log("5 : modifier mon profil");

  // 8 (relecture) : une synchro sans changement de profil ne redessine pas les Paramètres (confirmation gardée)
  await p.evaluer("Profil.ouvrirParametres()");
  await p.cliquer("#profil [data-action=supprimer]");
  await p.evaluer("Compte.lireProfil()");
  await attendre(200);
  assert.equal(await p.evaluer("document.querySelector('#profil [data-action=supprimer]').textContent"), "Confirmer : supprimer le compte", "scénario 8 : confirmation annulée par une synchro");
  await p.evaluer("Profil.ouvrir()");
  // 9 (relecture) : un enregistrement qui finit après avoir quitté le profil ne touche pas à l'écran affiché
  await p.cliquer("#profil .f-profil-modifier");
  await p.evaluer(`Compte.enregistrerProfil = () => new Promise((ok) => { window.__finir = ok; })`);
  await p.cliquer("#profil .f-modifier-enregistrer");
  await p.evaluer("afficherAccueil()");
  await p.evaluer("window.__finir()");
  await attendre(200);
  assert.deepEqual(await p.evaluer(`[document.querySelector("#nav [aria-current]")?.dataset.onglet, Profil.estOuvert()]`), ["accueil", false], "scénario 9 : le profil a repris la main");
  console.log("8-9 : corrections de la relecture");

  // 11 : profil gardé sur l'appareil (affiché hors ligne au démarrage) ; celui d'un autre compte est ignoré
  const MOI = "00000000-0000-4000-8000-000000000001";
  const avecCache = async (cache) => {
    const d = await edge.nouvelAppareil();
    await d.avantPage(`localStorage.setItem("agon.compte", "${MOI}"); localStorage.setItem("agon.profil", ${JSON.stringify(JSON.stringify(cache))});`);
    await d.aller(serveur.url);
    await d.attendreQue(pret, 8000);
    await attendre(500);
    await d.cliquer("#nav [data-onglet=profil]");
    const r = await d.evaluer(`({ pseudo: document.querySelector("#profil .f-profil-pseudo").textContent,
      avatar: document.querySelector("#profil .f-profil-tete .f-avatar")?.dataset.avatar || null,
      invitation: !!document.querySelector("#profil .f-profil-invitation") })`);
    assert.deepEqual(d.erreurs, [], "scénario 11 : erreurs");
    return { d, r };
  };
  const mien = await avecCache({ user_id: MOI, ...ZOE });
  assert.deepEqual(mien.r, { pseudo: "Zoe_1", avatar: "rose-coeur", invitation: false }, "scénario 11 : profil en cache non affiché");
  const autre = await avecCache({ user_id: "11111111-1111-4111-8111-111111111111", ...ZOE });
  assert.equal(autre.r.pseudo, "…", "scénario 11 : profil d'un autre compte affiché");
  const defaut = await avecCache({ user_id: MOI, ...ZOE, avatar: "violet-facette" });
  assert.equal(defaut.r.invitation, true, "scénario 11 : pas d'invitation pour l'avatar par défaut");
  await defaut.d.cliquer("#profil .f-profil-invitation");
  assert.equal(await defaut.d.evaluer("document.querySelector('#profil .f-param-titre')?.textContent"), "Modifier mon profil", "scénario 11 : l'invitation n'ouvre pas Modifier");
  console.log("11 : profil gardé sur l'appareil");

  // 12 (bilan) : une synchro en vol pendant la suppression du compte ne remet pas la progression sur l'appareil
  const s12 = await edge.nouvelAppareil();
  await s12.aller(serveur.url);
  await s12.attendreQue(pret, 8000);
  await attendre(500);
  const r12 = await s12.evaluer(`(async () => {
    localStorage.setItem("agon.survie", JSON.stringify({ record: 42 }));
    let liberer;
    const lente = new Promise((ok) => { liberer = ok; });
    const sb = Compte.client();
    sb.from = (table) => ({
      select: () => ({ maybeSingle: () => table === "profils" ? Promise.resolve({ data: ${JSON.stringify(ZOE)}, error: null })
        : lente.then(() => ({ data: { resultats: { "bd-cle-primaire-vf": { vu: 1, ok: 1, ko: 0, derniereOk: true, dernier: "2026-11-20T08:00:00Z" } },
            reglages: {}, collection: {}, survie: { record: 42 } }, error: null })) }),
      upsert: async () => ({ error: null }), insert: async () => ({ error: null }), update: () => ({ eq: async () => ({ error: null }) }),
    });
    sb.rpc = async () => ({ error: null });
    const synchro = Compte.synchroniser();
    await new Promise((ok) => setTimeout(ok, 50));
    const suppression = Compte.supprimer();
    await new Promise((ok) => setTimeout(ok, 50));
    liberer();
    await synchro; await suppression;
    await new Promise((ok) => setTimeout(ok, 200));
    return { survie: localStorage.getItem("agon.survie"), resultats: Object.keys(lireResultats()).length };
  })()`);
  assert.deepEqual(r12, { survie: null, resultats: 0 }, `scénario 12 : progression revenue après suppression (${JSON.stringify(r12)})`);
  // 13 (bilan) : une entrée non-objet dans les résultats est ignorée et ne bloque pas la fusion
  const r13 = await s12.evaluer(`(() => {
    localStorage.setItem("agon.resultats", JSON.stringify({ x: null, y: 3, "bd-cle-primaire-vf": { vu: 1, ok: 1, ko: 0, dernier: "2026-11-20T08:00:00Z" } }));
    const cles = Object.keys(lireResultats());
    let erreur = null;
    try { Compte.fusionner({ resultats: { z: null, ...lireResultats() }, reglages: { ...lireReglages(), remise: "2026-11-21T00:00:00Z" }, collection: lireCollection(), survie: { record: 0 } },
      { resultats: { w: null }, reglages: { remise: "2026-11-21T00:00:00Z", maj: "2026-11-21T00:00:00Z" } }); } catch (e) { erreur = e.message; }
    return { cles, erreur };
  })()`);
  assert.deepEqual(r13, { cles: ["bd-cle-primaire-vf"], erreur: null }, `scénario 13 : entrée invalide (${JSON.stringify(r13)})`);
  // 14 (bilan) : profil lu vide → « Présente-toi » s'ouvre sans attendre la fin de la synchro
  const s14 = await edge.nouvelAppareil();
  await s14.aller(serveur.url);
  await s14.attendreQue(pret, 8000);
  await attendre(500);
  const r14 = await s14.evaluer(`(async () => {
    Compte.client().from = () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) });
    await Compte.lireProfil();
    await new Promise((ok) => setTimeout(ok, 100));
    return [Portail.estOuvert(), document.querySelector("#portail [data-etape]")?.dataset.etape];
  })()`);
  assert.deepEqual(r14, [true, "3"], "scénario 14 : « Présente-toi » non ouvert");
  console.log("12-14 : synchro et suppression, entrées invalides, étape 3");

  // 15 (bilan) : bouton ✕ pendant une session, abandon de Survie, pause en arrière-plan
  const q = await edge.nouvelAppareil();
  await q.aller(serveur.url);
  await q.attendreQue(pret, 8000);
  await attendre(500);
  const taille = (sel) => q.evaluer(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return Math.min(r.width, r.height); })()`);
  assert.equal(await q.evaluer(visibleDans("#btn-quitter")), false, "scénario 15 : ✕ visible sur l'accueil");
  await q.evaluer("montrerFil('session')");
  await attendre(300);
  assert.equal(await q.evaluer(visibleDans("#btn-quitter")), true, "scénario 15 : ✕ absent dans le fil");
  assert.ok(await taille("#btn-quitter") >= 44, "scénario 15 : ✕ trop petit");
  await q.cliquer("#btn-quitter");
  assert.equal(await q.evaluer(visibleDans("#accueil")), true, "scénario 15 : ✕ ne ramène pas à l'accueil");
  // Survie : pause quand la page est cachée
  await q.cliquer(".f-bouton-survie");
  await q.cliquer(".f-ecran[data-matiere='survie'] .f-lancer");
  await attendre(300);
  const chrono = () => q.evaluer(`parseFloat(document.querySelector(".f-chrono-temps").textContent.replace(",", "."))`);
  await q.evaluer(`Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange"))`);
  const avantPause = await chrono();
  await attendre(1500);
  assert.equal(await chrono(), avantPause, "scénario 15 : le chrono tourne pendant que l'appli est cachée");
  await q.evaluer(`Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange"))`);
  await attendre(600);
  const apresPause = await chrono();
  assert.ok(apresPause < avantPause && apresPause > avantPause - 1.2, `scénario 15 : reprise anormale (${avantPause} → ${apresPause})`);
  // Abandon en deux appuis
  await q.cliquer("#btn-quitter");
  assert.match(await q.evaluer("document.getElementById('btn-quitter').textContent"), /Abandonner/, "scénario 15 : pas de confirmation d'abandon");
  assert.equal(await q.evaluer(visibleDans("#fil")), true, "scénario 15 : partie quittée dès le premier appui");
  await q.cliquer("#btn-quitter");
  await attendre(300);
  assert.deepEqual(await q.evaluer(`[${visibleDans("#accueil")}, fil.classList.contains("verrouille"), lireRecordSurvie()]`), [true, false, 0], "scénario 15 : abandon de Survie");
  assert.deepEqual(q.erreurs, [], "scénario 15 : erreurs");
  console.log("15 : bouton ✕, abandon et pause de la Survie");

  // 16 (bilan) : finitions — cibles de 44 px, en-tête opaque hors du fil, portail étape 2
  const mesure = (d, sel) => d.evaluer(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
    const r = e.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); })()`);
  const fond = () => q.evaluer("getComputedStyle(document.querySelector('.f-entete')).backgroundColor");
  assert.notEqual(await fond(), "rgba(0, 0, 0, 0)", "scénario 16 : en-tête transparent sur l'accueil");
  await q.evaluer("montrerFil('session')");
  assert.equal(await fond(), "rgba(0, 0, 0, 0)", "scénario 16 : en-tête opaque dans le fil (cache les cartes)");
  await q.evaluer("afficherAccueil(); Discotheque.ouvrir()");
  await attendre(400);
  const petits = {};
  for (const sel of ["#discotheque .f-piste-jouer", "#discotheque .f-case"]) petits[sel] = await mesure(q, sel);
  await q.evaluer("Classement.ouvrir()");
  await attendre(300);
  petits.onglet = await mesure(q, "#classement .f-classement-onglet");
  await q.evaluer("Donnees.ouvrir()");
  await attendre(600);   // la boîte s'ouvre avec une animation (léger zoom)
  petits.fermer = await mesure(q, "#donnees .f-fermer");
  await q.evaluer("document.getElementById('donnees').close()");
  const sansCompte = await edge.nouvelAppareil({ connecte: false });
  await sansCompte.aller(serveur.url);
  await sansCompte.attendreQue("!document.getElementById('lancement') && !!document.querySelector('#portail .f-portail-continuer')", 8000);
  await sansCompte.cliquer("#portail .f-portail-continuer");
  await sansCompte.attendreQue("!!document.querySelector('#portail input[type=email]')", 5000);
  petits.retour = await mesure(sansCompte, "#portail .f-portail-retour");
  petits.tesDonnees = await mesure(sansCompte, "#portail .f-compte .f-lien");
  for (const [cle, v] of Object.entries(petits)) assert.ok(v !== null && v >= 44, `scénario 16 : cible ${cle} = ${v} px`);
  const etape2 = await sansCompte.evaluer(`({ titre: document.querySelector("#portail h1").textContent,
    motDePasse: (document.getElementById("portail").innerText.match(/Pas de mot de passe/g) || []).length,
    champ: Math.round(document.querySelector("#portail input[type=email]").getBoundingClientRect().width) })`);
  assert.equal(etape2.titre, "Connecte-toi ou crée ton compte", "scénario 16 : titre de l'étape 2");
  assert.equal(etape2.motDePasse, 1, "scénario 16 : « Pas de mot de passe » répété");
  assert.ok(etape2.champ >= 300, `scénario 16 : champ e-mail écrasé (${etape2.champ} px)`);
  console.log("16 : finitions");

  // 17 (relecture) : une partie finie remet le ✕ dans son état normal
  await q.evaluer("afficherAccueil()");
  await q.cliquer(".f-bouton-survie");
  await q.cliquer(".f-ecran[data-matiere='survie'] .f-lancer");
  await q.cliquer("#btn-quitter");
  await q.evaluer("window.abandonnerSurvie()");   // fin de partie venue d'ailleurs (erreur, chrono à zéro)
  assert.doesNotMatch(await q.evaluer("document.getElementById('btn-quitter').textContent"), /Abandonner/, "scénario 17 : ✕ resté en confirmation");
  // 18 (relecture) : un profil lu vide efface le profil gardé ; une suppression refusée ne laisse pas « Synchronisation… »
  const t = await edge.nouvelAppareil();
  await t.aller(serveur.url);
  await t.attendreQue(pret, 8000);
  await attendre(500);
  const r18 = await t.evaluer(`(async () => {
    localStorage.setItem("agon.profil", JSON.stringify({ user_id: Compte.utilisateur().id, pseudo: "Ancien" }));
    const sb = Compte.client();
    sb.from = () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) });
    await Compte.lireProfil();
    const cache = localStorage.getItem("agon.profil");
    // La synchro du démarrage est encore en vol (Supabase bloqué en test) : la suppression refusée ne doit pas la laisser afficher
    sb.rpc = async () => ({ error: { message: "refusé" } });
    let refus = null;
    try { await Compte.supprimer(); } catch (e) { refus = e.message; }
    return { cache, refus, etat: Compte.etat() };
  })()`);
  assert.equal(r18.cache, null, "scénario 18 : profil gardé malgré un profil lu vide");
  assert.equal(r18.refus, "refusé", "scénario 18 : refus non remonté");
  assert.notEqual(r18.etat, "synchro", "scénario 18 : écran bloqué sur « Synchronisation… »");
  console.log("17-18 : corrections de la relecture");

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
  assert.ok(await pc.evaluer("document.getElementById('nav').getBoundingClientRect().width") <= 560, "scénario 16 : barre du bas étalée sur PC");
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
