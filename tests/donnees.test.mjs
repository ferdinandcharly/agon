// Page « Tes données » (RGPD) et export : connecté en ligne, connecté hors ligne, sans compte.
// Prérequis : un compte de test avec mot de passe, créé en SQL (voir tests/README) et supprimé après :
//   TEST_EMAIL=test-donnees@facettes.test TEST_MDP=… node tests/donnees.test.mjs
import assert from "node:assert/strict";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const { TEST_EMAIL, TEST_MDP } = process.env;
if (!TEST_EMAIL || !TEST_MDP) { console.error("TEST_EMAIL et TEST_MDP sont requis"); process.exit(2); }

const serveur = await demarrerServeur("app", 8765);
const edge = await lancerEdge();
const RESULTATS = { "bd-cle-primaire-vf": { vu: 1, ok: 1, ko: 0, derniereOk: true, boite: 2, dernier: "2026-11-20T08:00:00Z" } };
const texteDialogue = "document.getElementById('donnees').innerText";

let echec = null;
try {
  // Connecté, en ligne
  const a = await edge.nouvelAppareil();
  await a.aller(serveur.url);
  await a.evaluer(`localStorage.setItem("agon.resultats", ${JSON.stringify(JSON.stringify(RESULTATS))})`);
  const connexion = await a.evaluer(`(async () => {
    const c = supabase.createClient(SUPABASE_URL, SUPABASE_CLE, { auth: { storageKey: "agon.session" } });
    const { error } = await c.auth.signInWithPassword({ email: ${JSON.stringify(TEST_EMAIL)}, password: ${JSON.stringify(TEST_MDP)} });
    return error ? error.message : "ok"; })()`);
  assert.equal(connexion, "ok", "connexion du compte de test");
  await a.aller(serveur.url);
  await attendre(3000);   // première synchro
  await a.cliquer("#btn-reglages");
  await a.cliquer("#compte .f-donnees-ouvrir");
  assert.equal(await a.evaluer("document.getElementById('donnees').open"), true, "le dialogue « Tes données » ne s'ouvre pas");
  await attendre(400);
  await a.capture("tests/captures/donnees-iPhone.png");
  const texte = await a.evaluer(texteDialogue);
  for (const attendu of ["facettes.app@gmail.com", "2 ans", "Paris", "15 ans", "Ferdinand Charly", "Exporter mes données"])
    assert.ok(texte.includes(attendu), `le dialogue ne mentionne pas « ${attendu} »`);
  const enLigne = await a.evaluer("Donnees.exporter()");
  assert.equal(enLigne.compte?.email, TEST_EMAIL, "export : e-mail du compte");
  assert.ok(enLigne.compte.cree_le, "export : date de création du compte");
  assert.deepEqual(enLigne.progression_en_ligne?.resultats, RESULTATS, "export : progression en ligne");
  assert.deepEqual(enLigne.appareil.resultats, RESULTATS, "export : données de l'appareil");
  console.log("1, 2 : dialogue complet, export en ligne correct");

  // Enregistrement : feuille de partage si l'appareil sait partager un fichier (iPhone), sinon téléchargement
  await a.evaluer(`(() => { navigator.canShare = () => true;
    navigator.share = (d) => { window.__partage = d.files[0].name + "|" + d.files[0].type; return Promise.resolve(); }; })()`);
  await a.cliquer("#donnees .f-donnees-export");
  await a.cliquer("#donnees .f-donnees-enregistrer");
  assert.equal(await a.evaluer("window.__partage"), "facettes-mes-donnees.json|application/json", "partage : fichier non transmis à la feuille de partage");
  await a.evaluer(`(() => { navigator.canShare = undefined; window.__telechargement = null;
    const clic = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { window.__telechargement = this.download; return clic.call(this); }; })()`);
  await a.cliquer("#donnees .f-donnees-export");
  await a.cliquer("#donnees .f-donnees-enregistrer");
  assert.equal(await a.evaluer("window.__telechargement"), "facettes-mes-donnees.json", "repli : pas de téléchargement");
  console.log("2b : partage (iPhone) puis repli téléchargement");

  // Connecté, hors ligne, jeton expiré (plus d'une heure) : pas d'attente du réseau, e-mail quand même
  await a.couperReseau(true);
  await a.evaluer(`(() => { const s = JSON.parse(localStorage.getItem("agon.session"));
    s.expires_at = Math.floor(Date.now() / 1000) - 60; localStorage.setItem("agon.session", JSON.stringify(s)); })()`);
  const debut = Date.now();
  const horsLigne = await a.evaluer("Donnees.exporter()");
  assert.ok(Date.now() - debut < 3000, `hors ligne : export trop lent (${Date.now() - debut} ms)`);
  assert.equal(horsLigne.progression_en_ligne, null, "hors ligne : progression_en_ligne devrait être null");
  assert.equal(horsLigne.compte?.email, TEST_EMAIL, "hors ligne : l'e-mail vient de la session locale");
  assert.deepEqual(horsLigne.appareil.resultats, RESULTATS, "hors ligne : données de l'appareil");
  await a.couperReseau(false);
  console.log("3 : export hors ligne sans erreur");

  // Sans compte : le lien sous le formulaire de connexion
  const b = await edge.nouvelAppareil();
  await b.aller(serveur.url);
  await b.attendreQue("!document.getElementById('lancement')", 6000);
  await b.cliquer("#btn-reglages");
  await b.cliquer("#compte .f-lien");   // « Tes données » sous le formulaire
  assert.equal(await b.evaluer("document.getElementById('donnees').open"), true, "sans compte : dialogue fermé");
  const sansCompte = await b.evaluer("Donnees.exporter()");
  assert.equal(sansCompte.compte, null, "sans compte : compte devrait être null");
  assert.equal(sansCompte.progression_en_ligne, null, "sans compte : rien en ligne");
  console.log("4 : sans compte, dialogue et export locaux");

  assert.deepEqual([...a.violationsCsp, ...b.violationsCsp], [], "violations CSP");
  assert.deepEqual([...a.erreurs, ...b.erreurs].filter((e) => !/Failed to fetch|NetworkError|ERR_INTERNET_DISCONNECTED/.test(e)), [], "erreurs");
  console.log("OK — Tes données (5 scénarios)");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
