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

  // 5 : vérification locale des infos (mêmes formats qu'en base)
  assert.deepEqual(Object.keys(await b.evaluer(`Portail.verifierInfos({ pseudo: "a b", prenom: "Zo3", etablissement: "<b>" })`)).sort(),
    ["etablissement", "prenom", "pseudo"], "scénario 5 : erreurs attendues sur les trois champs");
  assert.deepEqual(await b.evaluer(`Portail.verifierInfos({ pseudo: "Ferdi", prenom: "Zoé N'Golo", etablissement: "" })`), {}, "scénario 5 : prénom accentué refusé");
  assert.deepEqual(await b.evaluer(`Portail.verifierInfos({ pseudo: "Ferdi", prenom: "", etablissement: "IUT de Lannion" })`), {}, "scénario 5 : établissement refusé");
  assert.ok((await b.evaluer(`Portail.verifierInfos({ pseudo: "Ferdi", prenom: "", etablissement: "a" })`)).etablissement, "scénario 5 : établissement d'un caractère accepté");
  console.log("5 : vérification des infos");

  // 6 : composant avatar
  const couleur = (code) => b.evaluer(`(() => { const a = Portail.avatar(${JSON.stringify(code)}); document.body.append(a);
    const r = [a.classList.contains("f-avatar"), getComputedStyle(a).getPropertyValue("--avatar").trim(), !!a.querySelector("svg")]; a.remove(); return r; })()`);
  assert.deepEqual(await couleur("rose-etoile"), [true, "#FF5FA2", true], "scénario 6 : avatar rose-etoile");
  assert.deepEqual(await couleur("nimporte"), [true, "#7B4DFF", true], "scénario 6 : avatar par défaut");
  console.log("6 : avatar");

  // 7 : étape 3 (compte simulé) — champs, choix d'avatar, refus local sans requête
  await b.evaluer("Portail.ouvrir(3)");
  await attendre(300);
  const r7 = await b.evaluer(`(() => { const p = document.getElementById("portail");
    return { pseudo: !!p.querySelector("#portail-pseudo"), prenom: !!p.querySelector("#portail-prenom"), etab: !!p.querySelector("#portail-etablissement"),
             couleurs: p.querySelectorAll(".f-portail-couleur").length, symboles: p.querySelectorAll(".f-portail-symbole").length, texte: p.innerText }; })()`);
  assert.deepEqual([r7.pseudo, r7.prenom, r7.etab, r7.couleurs, r7.symboles], [true, true, true, 7, 6], "scénario 7 : champs de l'étape 3");
  assert.match(r7.texte, /Privé/, "scénario 7 : mention « Privé » absente");
  await b.cliquer('#portail .f-portail-couleur[data-couleur="vert"]');
  await b.cliquer('#portail .f-portail-symbole[data-symbole="coeur"]');
  assert.equal(await b.evaluer(`document.querySelector("#portail .f-portail-apercu .f-avatar").dataset.avatar`), "vert-coeur", "scénario 7 : aperçu de l'avatar");
  const avant7 = b.requetes.length;
  await b.evaluer(`(() => { document.getElementById("portail-pseudo").value = "a b"; document.querySelector("#portail .f-portail-valider").click(); })()`);
  await attendre(300);
  assert.match(await b.evaluer(`document.getElementById("portail").innerText`), /3 à 20 caractères/, "scénario 7 : message du pseudo absent");
  assert.equal(b.requetes.slice(avant7).filter((q) => q.url.includes("/rest/v1/profils")).length, 0, "scénario 7 : profil envoyé malgré l'erreur");
  console.log("7 : étape « Présente-toi »");

  // 8 : profil inconnu (hors ligne) → pas d'étape 3 ; déconnexion → portail, étape 1
  await b.evaluer("Portail.fermer()");
  await attendre(300);
  assert.equal(await b.evaluer(visible("#accueil")), true, "scénario 8 : accueil non rétabli");
  await b.evaluer(`dispatchEvent(new Event("facettes:synchro"))`);
  await attendre(200);
  assert.equal(await b.evaluer(visible("#portail")), false, "scénario 8 : étape 3 ouverte sans savoir s'il y a un profil");
  await b.evaluer(`dispatchEvent(new Event("facettes:deconnexion"))`);
  await attendre(200);
  assert.equal(await b.evaluer("document.querySelector('#portail [data-etape]')?.dataset.etape"), "1", "scénario 8 : la déconnexion ne ramène pas au portail");
  assert.equal(await b.evaluer(visible("#accueil")), false, "scénario 8 : accueil atteignable après la déconnexion");
  console.log("8 : profil inconnu et déconnexion");

  // 9 (relecture) : session refusée au démarrage (jeton invalide supprimé par supabase-js avant toute connexion)
  // → l'événement de déconnexion part quand même et le portail s'ouvre
  const c = await edge.nouvelAppareil({ connecte: false });
  await c.avantPage(`window.__deconnexions = 0; addEventListener("facettes:deconnexion", () => window.__deconnexions++);
    if (!sessionStorage.getItem("posee")) { sessionStorage.setItem("posee", "1"); localStorage.setItem("agon.session", JSON.stringify({ access_token: "invalide" })); }`);
  await c.aller(serveur.url);
  await c.attendreQue("!document.getElementById('lancement') && typeof donnees !== 'undefined' && !!donnees", 8000);
  await attendre(800);
  assert.ok(await c.evaluer("window.__deconnexions") >= 1, "scénario 9 : pas d'événement de déconnexion pour une session refusée");
  assert.equal(await c.evaluer(visible("#portail")), true, "scénario 9 : pas de portail après une session refusée");
  console.log("9 : session refusée au démarrage");

  // 10 (relecture) : on peut taper une espace dans les champs de l'étape 3
  await b.evaluer("Portail.ouvrir(3)");
  await attendre(200);
  assert.equal(await b.evaluer(`(() => { const e = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    document.getElementById("portail-prenom").dispatchEvent(e); return e.defaultPrevented; })()`), false, "scénario 10 : espace bloquée dans un champ");
  // 11 (relecture) : un nouvel appel à decider() ne referme pas l'étape 3
  await b.evaluer("Portail.decider()");
  await attendre(200);
  assert.equal(await b.evaluer("document.querySelector('#portail [data-etape]')?.dataset.etape"), "3", "scénario 11 : l'étape 3 a été refermée");
  // 12 (relecture) : apostrophe typographique d'iPhone et accent décomposé acceptés
  assert.deepEqual(await b.evaluer(`Portail.verifierInfos({ pseudo: "Ferdi", prenom: "N’Golo", etablissement: "" })`), {}, "scénario 12 : apostrophe ’ refusée");
  assert.deepEqual(await b.evaluer(`Portail.verifierInfos({ pseudo: "Ferdi", prenom: "Zoé", etablissement: "" })`), {}, "scénario 12 : accent décomposé refusé");
  console.log("10-12 : espace, decider, apostrophe");

  // 13 (relecture) : après la connexion, une attente qui ne finit pas propose de réessayer
  await a.evaluer("Portail.ouvrir(2)");
  await a.evaluer(`dispatchEvent(new Event("facettes:connexion"))`);
  await attendre(300);
  assert.match(await a.evaluer("document.getElementById('portail').innerText"), /Connexion réussie/, "scénario 13 : pas de message d'attente");
  await attendre(8500);
  assert.equal(await a.evaluer(visible("#portail .f-portail-relancer")), true, "scénario 13 : pas de bouton pour réessayer");
  console.log("13 : attente après connexion");

  for (const x of [a, b, c]) {
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
