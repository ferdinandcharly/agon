// Portail d'accueil obligatoire : parcours → compte → infos sur toi. Sans vrai compte (CAPTCHA) : le portail est
// testé sans session, et l'appli derrière lui avec la session simulée (compte connecté sans réseau vers Supabase).
// Lancer depuis la racine du dépôt : node tests/portail.test.mjs
import assert from "node:assert/strict";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const serveur = await demarrerServeur("app", 8765);
const edge = await lancerEdge();
const visible = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)});
  return !!e && !e.classList.contains("cache") && getComputedStyle(e).display !== "none"; })()`;
let echec = null;
try {
  // 1 : sans session, le portail est au premier plan et rien d'autre n'est atteignable
  const a = await edge.nouvelAppareil({ connecte: false });
  await a.aller(serveur.url);
  await a.attendreQue("!document.getElementById('lancement') && typeof donnees !== 'undefined' && !!donnees", 8000);
  assert.equal(await a.evaluer(visible("#portail")), true, "scénario 1 : portail absent");
  assert.equal(await a.evaluer("document.querySelector('#portail [data-etape]')?.dataset.etape"), "1", "scénario 1 : pas à l'étape 1");
  for (const sel of ["#accueil", "#nav", ".f-entete"])
    assert.equal(await a.evaluer(visible(sel)), false, `scénario 1 : ${sel} visible derrière le portail`);
  await a.evaluer("montrerFil('session'); afficherAccueil(); Discotheque.ouvrir(); Classement.ouvrir(); Amis.ouvrir()");
  await attendre(300);
  for (const sel of ["#fil", "#accueil", "#discotheque", "#classement", "#amis"])
    assert.equal(await a.evaluer(visible(sel)), false, `scénario 1 : ${sel} atteint sans compte`);
  assert.equal(await a.evaluer(visible("#portail")), true, "scénario 1 : le portail a disparu");
  console.log("1 : portail obligatoire");

  // 2 : étape 1 (parcours) → étape 2 (compte) → retour
  const r2 = await a.evaluer(`(() => { const p = [...document.querySelectorAll("#portail .f-portail-parcours")];
    return p.map((c) => [c.dataset.parcours || "", c.getAttribute("aria-pressed"), c.getAttribute("aria-disabled")]); })()`);
  assert.deepEqual(r2, [["but-info-1", "true", null], ["", null, "true"], ["", null, "true"]], "scénario 2 : cartes de parcours");
  await a.cliquer("#portail .f-portail-continuer");
  assert.equal(await a.evaluer("document.querySelector('#portail [data-etape]').dataset.etape"), "2", "scénario 2 : pas à l'étape 2");
  await a.attendreQue("!!document.querySelector('#portail input[type=email]')", 5000);
  assert.equal(await a.evaluer("localStorage.getItem('agon.parcours')"), "but-info-1", "scénario 2 : parcours non gardé");
  await a.cliquer("#portail .f-portail-retour");
  assert.equal(await a.evaluer("document.querySelector('#portail [data-etape]').dataset.etape"), "1", "scénario 2 : Retour ne revient pas à l'étape 1");
  console.log("2 : étapes parcours et compte");

  // 3 : hors ligne sans session → message et Réessayer
  await a.couperReseau(true);
  await a.evaluer("Portail.decider()");
  assert.match(await a.evaluer("document.getElementById('portail').innerText"), /Connecte-toi à Internet pour créer ton compte/, "scénario 3 : pas de message hors ligne");
  await a.couperReseau(false);
  await a.cliquer("#portail .f-portail-reessayer");
  assert.equal(await a.evaluer("document.querySelector('#portail [data-etape]')?.dataset.etape"), "1", "scénario 3 : Réessayer ne ramène pas à l'étape 1");
  console.log("3 : hors ligne sans session");

  // 4 : session gardée (simulée) → pas de portail
  const b = await edge.nouvelAppareil();
  await b.aller(serveur.url);
  await b.attendreQue("!document.getElementById('lancement') && typeof donnees !== 'undefined' && !!donnees", 8000);
  await attendre(500);
  assert.equal(await b.evaluer(visible("#portail")), false, "scénario 4 : portail avec une session");
  assert.equal(await b.evaluer(visible("#accueil")), true, "scénario 4 : accueil caché");
  assert.equal(await b.evaluer(visible("#nav")), true, "scénario 4 : barre cachée");
  console.log("4 : session gardée, pas de portail");

  for (const x of [a, b]) {
    assert.deepEqual(x.violationsCsp, [], "violations CSP");
    assert.deepEqual(x.erreurs, [], "erreurs");
  }
  console.log("OK — portail");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
