// Passage « site → app » : manifest complet (comme Korrel), icônes maskable, carte d'installation sur l'accueil
// (Android/PC : vraie fenêtre d'installation ; iPhone : mode d'emploi), absente quand l'app est installée.
// Lancer depuis la racine du dépôt : node tests/app.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

// Dimensions d'un PNG (en-tête IHDR)
function taillePng(chemin) {
  const b = readFileSync(chemin);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const serveur = await demarrerServeur("app", 8765);
const edge = await lancerEdge();
let echec = null;
try {
  // 1 : manifest complet, icônes maskable présentes, à la bonne taille et en cache hors ligne
  const m = JSON.parse(readFileSync("app/manifest.webmanifest", "utf8"));
  assert.ok(m.id, "scénario 1 : pas d'id");
  assert.equal(m.scope, "./", "scénario 1 : scope");
  assert.equal(m.orientation, "portrait", "scénario 1 : orientation");
  assert.deepEqual(m.display_override, ["standalone"], "scénario 1 : display_override");
  const maskables = m.icons.filter((i) => i.purpose === "maskable");
  assert.deepEqual(maskables.map((i) => i.sizes).sort(), ["192x192", "512x512"], "scénario 1 : icônes maskable");
  const sw = readFileSync("app/sw.js", "utf8");
  for (const i of maskables) {
    assert.deepEqual(taillePng(`app/${i.src}`), i.sizes.split("x").map(Number), `scénario 1 : taille de ${i.src}`);
    assert.ok(sw.includes(`"${i.src}"`), `scénario 1 : ${i.src} absente du cache hors ligne`);
  }
  console.log("1 : manifest et icônes maskable");

  // 2 : Android / PC — la carte n'apparaît qu'avec l'invitation du navigateur, et le bouton l'ouvre
  const a = await edge.nouvelAppareil();
  await a.aller(serveur.url);
  await a.attendreQue("!document.getElementById('lancement')", 8000);
  assert.equal(await a.evaluer("!!document.querySelector('#accueil .f-installer')"), false, "scénario 2 : carte sans invitation du navigateur");
  await a.evaluer(`(() => { const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = () => { window.__invite = (window.__invite || 0) + 1; return Promise.resolve(); };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e); window.__annulee = e.defaultPrevented; })()`);
  await attendre(200);
  assert.equal(await a.evaluer("window.__annulee"), true, "scénario 2 : la mini-barre de Chrome n'est pas retenue");
  assert.equal(await a.evaluer("!!document.querySelector('#accueil .f-installer button.f-installer-oui')"), true, "scénario 2 : pas de bouton Installer");
  await a.cliquer("#accueil .f-installer-oui");
  await attendre(300);
  assert.equal(await a.evaluer("window.__invite"), 1, "scénario 2 : la fenêtre d'installation ne s'ouvre pas");
  assert.equal(await a.evaluer("!!document.querySelector('#accueil .f-installer')"), false, "scénario 2 : la carte reste après l'installation");
  console.log("2 : Android/PC, bouton Installer");

  // 3 : iPhone Safari — mode d'emploi ; « Plus tard » la ferme pour de bon (même après rechargement)
  const i = await edge.nouvelAppareil({ ua: IPHONE });
  await i.aller(serveur.url);
  await i.attendreQue("!document.getElementById('lancement')", 8000);
  const texte = await i.evaluer("document.querySelector('#accueil .f-installer')?.innerText || ''");
  assert.match(texte, /Partager/, "scénario 3 : pas de mode d'emploi iPhone");
  assert.match(texte, /écran d.accueil/i, "scénario 3 : mode d'emploi incomplet");
  await i.cliquer("#accueil .f-installer-non");
  await attendre(200);
  assert.equal(await i.evaluer("!!document.querySelector('#accueil .f-installer')"), false, "scénario 3 : « Plus tard » ne ferme pas");
  await i.aller(serveur.url);
  await i.attendreQue("!document.getElementById('lancement')", 8000);
  assert.equal(await i.evaluer("!!document.querySelector('#accueil .f-installer')"), false, "scénario 3 : la carte revient après « Plus tard »");
  console.log("3 : iPhone, mode d'emploi et Plus tard");

  // 4 : déjà installée (iPhone, lancée depuis l'écran d'accueil) — aucune carte
  const j = await edge.nouvelAppareil({ ua: IPHONE });
  await j.avantPage("Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true })");
  await j.aller(serveur.url);
  await j.attendreQue("!document.getElementById('lancement')", 8000);
  assert.equal(await j.evaluer("navigator.standalone"), true, "scénario 4 : simulation de l'app installée");
  assert.equal(await j.evaluer("!!document.querySelector('#accueil .f-installer')"), false, "scénario 4 : carte dans l'app installée");
  console.log("4 : app installée, pas de carte");

  // 5 : réglages tactiles d'app (pas de zoom au double tap, pas de rebond, pas de flash au toucher)
  const css = await a.evaluer(`(() => { const h = getComputedStyle(document.documentElement);
    return { toucher: h.touchAction, rebond: h.overscrollBehaviorY, flash: h.webkitTapHighlightColor,
             selection: getComputedStyle(document.querySelector(".f-lancer-session")).userSelect }; })()`);
  assert.equal(css.toucher, "manipulation", "scénario 5 : zoom au double tap");
  assert.equal(css.rebond, "none", "scénario 5 : rebond de la page");
  assert.equal(css.flash, "rgba(0, 0, 0, 0)", "scénario 5 : flash au toucher");
  assert.equal(css.selection, "none", "scénario 5 : texte des boutons sélectionnable");
  console.log("5 : réglages tactiles");

  // 6 : l'accueil tient sur un écran, sans défiler (app installée : iPhone SE, standard, Pro Max)
  // (marges réelles : encoche en haut, barre d'accueil en bas ; l'iPhone SE n'en a qu'en haut)
  for (const [largeur, hauteur, haut, bas] of [[375, 667, 20, 0], [390, 844, 47, 34], [393, 852, 59, 34], [430, 932, 59, 34]]) {
    const k = await edge.nouvelAppareil({ largeur, hauteur });
    await k.encoche(haut, bas);
    await k.avantPage("Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true })");
    await k.aller(serveur.url);
    await k.attendreQue("!document.getElementById('lancement')", 8000);
    const d = await k.evaluer(`(() => { const acc = document.getElementById("accueil"); return [acc.scrollHeight, acc.clientHeight]; })()`);
    assert.ok(d[0] <= d[1], `scénario 6 : l'accueil défile en ${largeur}×${hauteur} (${d[0]} > ${d[1]})`);
    // Pas de place perdue en bas : le dernier élément arrive à moins de 40 px de la barre d'onglets
    const vide = await k.evaluer(`(() => { const acc = document.getElementById("accueil");
      const fin = acc.querySelector(".f-accueil-bas").getBoundingClientRect().bottom;
      return Math.round(document.getElementById("nav").getBoundingClientRect().top - fin); })()`);
    assert.ok(vide <= 40, `scénario 6 : ${vide} px vides en bas en ${largeur}×${hauteur}`);
    // La boule reste ronde (carrée)
    const b = await k.evaluer(`(() => { const r = document.querySelector("#accueil .f-scene").getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`);
    assert.ok(Math.abs(b[0] - b[1]) <= 1 && b[0] >= 150, `scénario 6 : boule ${b[0]}×${b[1]} en ${largeur}×${hauteur}`);
    // L'en-tête descend sous le flou d'iOS (environ l'encoche en plus sous la barre d'état)
    if (haut >= 40) {
      const marque = await k.evaluer(`Math.round(document.querySelector(".f-marque").getBoundingClientRect().top)`);
      assert.ok(marque >= haut * 1.85, `scénario 6 : en-tête dans le flou (${marque} px pour une encoche de ${haut})`);
    }
    assert.deepEqual(k.erreurs, [], "scénario 6 : erreurs");
  }
  console.log("6 : accueil sur un seul écran");

  // 7 : épuration — pas de phrase perso sur l'accueil, réglages réduits, panneaux sous le flou, pas de zoom au double tap
  const e = await edge.nouvelAppareil({ largeur: 390, hauteur: 844 });
  await e.encoche(47, 34);
  await e.avantPage("Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true })");
  await e.aller(serveur.url);
  await e.attendreQue("!document.getElementById('lancement')", 8000);
  assert.equal(await e.evaluer("!!document.querySelector('#accueil .f-accueil-titre')"), false, "scénario 7 : phrase perso sur l'accueil");
  assert.match(await e.evaluer("document.querySelector('meta[name=viewport]').content"), /maximum-scale=1/, "scénario 7 : zoom encore permis");
  const toucher = await e.evaluer(`[".f-lancer-session", ".f-bouton-survie", ".f-menu", ".f-accueil-date"].map((s) => getComputedStyle(document.querySelector(s)).touchAction)`);
  assert.ok(toucher.every((v) => v === "manipulation"), `scénario 7 : double tap encore actif (${toucher})`);
  await e.evaluer("Profil.ouvrirParametres()");
  await attendre(500);
  const r7 = await e.evaluer(`(() => { const t = document.querySelector("#profil .f-param-titre");
    return { haut: Math.round(t.getBoundingClientRect().top), groupes: [...document.querySelectorAll("#profil .f-param-groupe h2")].map((h) => h.textContent) }; })()`);
  assert.ok(r7.haut >= 89, `scénario 7 : paramètres dans le flou (${r7.haut} px)`);
  assert.deepEqual(r7.groupes, ["Jeu", "Compte", "Zone sensible"], "scénario 7 : groupes des paramètres");
  assert.equal(await e.evaluer("!!document.querySelector('#profil [data-action=effacer]')"), true, "scénario 7 : plus de bouton pour effacer");
  assert.deepEqual(e.erreurs, [], "scénario 7 : erreurs");
  console.log("7 : accueil et réglages épurés, sous le flou, sans zoom");

  for (const x of [a, i, j]) {
    assert.deepEqual(x.violationsCsp, [], "violations CSP");
    assert.deepEqual(x.erreurs, [], "erreurs");
  }
  console.log("OK — app installable");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
