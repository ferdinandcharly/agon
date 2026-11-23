// Page « Tes données » (RGPD) et export. Le CAPTCHA (actif) empêche de connecter un compte dans ces tests :
// on vérifie le texte, l'export sans compte (en ligne et hors ligne) et l'enregistrement du fichier
// (feuille de partage sur iPhone, sinon téléchargement). L'export connecté est vérifié à la main.
// Lancer depuis la racine du dépôt : node tests/donnees.test.mjs
import assert from "node:assert/strict";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const serveur = await demarrerServeur("app", 8765);
const edge = await lancerEdge();
const RESULTATS = { "bd-cle-primaire-vf": { vu: 1, ok: 1, ko: 0, derniereOk: true, boite: 2, dernier: "2026-11-20T08:00:00Z" } };

let echec = null;
try {
  const a = await edge.nouvelAppareil({ connecte: false });
  await a.aller(serveur.url);
  await a.evaluer(`localStorage.setItem("agon.resultats", ${JSON.stringify(JSON.stringify(RESULTATS))})`);
  await a.aller(serveur.url);
  await a.attendreQue("!document.getElementById('lancement')", 6000);

  // 1 : le dialogue, ouvert depuis le lien sous le formulaire de connexion
  await a.cliquer("#portail .f-portail-continuer");
  await a.cliquer("#portail .f-lien");
  assert.equal(await a.evaluer("document.getElementById('donnees').open"), true, "le dialogue « Tes données » ne s'ouvre pas");
  await attendre(400);
  await a.capture("tests/captures/donnees-iPhone.png");
  const texte = await a.evaluer("document.getElementById('donnees').innerText");
  for (const attendu of ["facettes.app@gmail.com", "Paris", "Ferdinand Charly", "pseudo", "parties de Survie", "visible", "Exporter mes données"])
    assert.ok(texte.includes(attendu), `le dialogue ne mentionne pas « ${attendu} »`);
  assert.match(texte, /2\s?ans/, "durée de conservation absente");
  assert.match(texte, /amis/, "les amis ne sont pas mentionnés");
  assert.match(texte, /prénom/, "le prénom n'est pas mentionné");
  assert.match(texte, /établissement/, "l'établissement n'est pas mentionné");
  assert.match(texte, /avatar/, "l'avatar n'est pas mentionné");
  assert.match(texte, /notions allumées/, "le nombre de notions publié n'est pas mentionné");
  assert.match(texte, /15\s?ans/, "mention des moins de 15 ans absente");
  console.log("1 : dialogue complet");

  // 2 : export sans compte
  const sansCompte = await a.evaluer("Donnees.exporter()");
  assert.equal(sansCompte.compte, null, "sans compte : compte devrait être null");
  assert.equal(sansCompte.progression_en_ligne, null, "sans compte : rien en ligne");
  assert.equal(sansCompte.profil, null, "sans compte : profil devrait être null");
  assert.equal(sansCompte.parties, null, "sans compte : parties devrait être null");
  assert.equal(sansCompte.amis, null, "sans compte : amis devrait être null");
  assert.deepEqual(sansCompte.appareil.resultats, RESULTATS, "données de l'appareil");
  assert.deepEqual(sansCompte.appareil.parties_en_attente, [], "parties en attente");
  console.log("2 : export sans compte");

  // 3 : enregistrement par la feuille de partage (iPhone), puis repli en téléchargement
  await a.evaluer(`(() => { navigator.canShare = () => true;
    navigator.share = (d) => { window.__partage = d.files[0].name + "|" + d.files[0].type; return Promise.resolve(); }; })()`);
  await a.cliquer("#donnees .f-donnees-export");
  await a.cliquer("#donnees .f-donnees-enregistrer");
  assert.equal(await a.evaluer("window.__partage"), "facettes-mes-donnees.json|application/json", "partage : fichier non transmis");
  await a.evaluer(`(() => { navigator.canShare = undefined; window.__telechargement = null;
    const clic = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { window.__telechargement = this.download; return clic.call(this); }; })()`);
  await a.cliquer("#donnees .f-donnees-export");
  await a.cliquer("#donnees .f-donnees-enregistrer");
  assert.equal(await a.evaluer("window.__telechargement"), "facettes-mes-donnees.json", "repli : pas de téléchargement");
  console.log("3 : partage (iPhone) puis repli téléchargement");

  // 4 : hors ligne, l'export reste immédiat
  await a.couperReseau(true);
  const debut = Date.now();
  const horsLigne = await a.evaluer("Donnees.exporter()");
  assert.ok(Date.now() - debut < 3000, `hors ligne : export trop lent (${Date.now() - debut} ms)`);
  assert.deepEqual(horsLigne.appareil.resultats, RESULTATS, "hors ligne : données de l'appareil");
  await a.couperReseau(false);
  console.log("4 : export hors ligne immédiat");

  assert.deepEqual(a.violationsCsp, [], "violations CSP");
  assert.deepEqual(a.erreurs.filter((e) => !/Failed to fetch|NetworkError|ERR_INTERNET_DISCONNECTED/.test(e)), [], "erreurs");
  console.log("OK — Tes données (4 scénarios)");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
