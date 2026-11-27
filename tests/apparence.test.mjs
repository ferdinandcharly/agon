// Apparence : thème Auto / Sombre / Clair (papier) et taille de l'affichage, réglés dans Paramètres et synchronisés.
// Lancer depuis la racine du dépôt : node tests/apparence.test.mjs
import assert from "node:assert/strict";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const serveur = await demarrerServeur("app", 8767);
const edge = await lancerEdge();
const pret = "!document.getElementById('lancement') && typeof donnees !== 'undefined' && !!donnees";
const appareils = [];
async function ouvrir(reglages = null, options = {}) {
  const d = await edge.nouvelAppareil(options);
  appareils.push(d);
  // Ce que vaut data-theme au tout premier DOMContentLoaded (avant que app.js ait tourné) : pas de flash
  await d.avantPage(`${reglages ? `localStorage.setItem("agon.reglages", ${JSON.stringify(JSON.stringify(reglages))});` : ""}
    document.addEventListener("DOMContentLoaded", () => { window.__themeInitial = document.documentElement.dataset.theme || null;
      window.__tailleInitiale = document.documentElement.dataset.taille || null; }, { once: true });`);
  await d.aller(serveur.url);
  await d.attendreQue(pret, 8000);
  await attendre(400);
  return d;
}
async function ouvrirPortail(reglages) {
  const d = await edge.nouvelAppareil({ connecte: false });
  appareils.push(d);
  await d.avantPage(`localStorage.setItem("agon.reglages", ${JSON.stringify(JSON.stringify(reglages))});`);
  await d.aller(serveur.url);
  await d.attendreQue("!document.getElementById('lancement') && !!document.querySelector('#portail .f-portail-continuer')", 8000);
  await attendre(400);
  return d;
}
let echec = null;
try {
  // 1 : réglage lu, normalisé, appliqué avant le rendu
  const a = await ouvrir();
  const r1 = await a.evaluer(`({
    defaut: Apparence.normaliser(undefined), abime: Apparence.normaliser("x"), partiel: Apparence.normaliser({ theme: 3, taille: "grande" }),
    lu: lireReglages().apparence, initial: window.__themeInitial, taille: window.__tailleInitiale })`);
  assert.deepEqual(r1.defaut, { theme: "auto", taille: "normale" }, "scénario 1 : défauts");
  assert.deepEqual(r1.abime, { theme: "auto", taille: "normale" }, "scénario 1 : valeur abîmée");
  assert.deepEqual(r1.partiel, { theme: "auto", taille: "grande" }, "scénario 1 : valeur partielle");
  assert.deepEqual(r1.lu, { theme: "auto", taille: "normale" }, "scénario 1 : lireReglages sans apparence");
  assert.deepEqual([r1.initial, r1.taille], ["auto", "normale"], "scénario 1 : attributs absents au premier rendu");
  const b = await ouvrir({ matieresExclues: [], formatsExclus: [], maj: "2026-11-25T08:00:00Z", apparence: { theme: "clair", taille: "grande" } });
  assert.deepEqual(await b.evaluer("[window.__themeInitial, window.__tailleInitiale]"), ["clair", "grande"], "scénario 1 : thème clair pas appliqué avant le rendu");
  console.log("1 : réglage lu et appliqué avant le rendu");

  // 2 : fusion entre appareils
  const r2 = await b.evaluer(`(() => {
    const local = { resultats: {}, reglages: lireReglages(), collection: lireCollection(), survie: { record: 0 } };
    const ancien = Compte.fusionner(local, { reglages: { matieresExclues: [], formatsExclus: [], maj: "2026-11-26T00:00:00Z" } }).reglages.apparence;
    const recent = Compte.fusionner(local, { reglages: { matieresExclues: [], formatsExclus: [], maj: "2026-11-26T00:00:00Z",
      apparence: { theme: "sombre", taille: "tres-grande" } } }).reglages.apparence;
    return { ancien, recent };
  })()`);
  assert.deepEqual(r2.ancien, { theme: "clair", taille: "grande" }, "scénario 2 : appareil sans apparence écrase la locale");
  assert.deepEqual(r2.recent, { theme: "sombre", taille: "tres-grande" }, "scénario 2 : apparence distante plus récente ignorée");
  console.log("2 : fusion entre appareils");

  // 3 : rubrique Apparence des Paramètres
  await a.evaluer("Profil.ouvrirParametres()");
  await attendre(300);
  const r3 = await a.evaluer(`(() => {
    const groupes = [...document.querySelectorAll("#profil .f-param-groupe h2")].map((h) => h.textContent);
    const boutons = [...document.querySelectorAll("#profil .f-segment button")];
    return { premier: groupes[0], n: boutons.length, petit: Math.min(...boutons.map((x) => x.getBoundingClientRect().height)),
      presses: boutons.filter((x) => x.getAttribute("aria-pressed") === "true").map((x) => x.dataset.valeur) };
  })()`);
  assert.equal(r3.premier, "Apparence", "scénario 3 : Apparence pas en tête");
  assert.equal(r3.n, 6, "scénario 3 : 6 boutons attendus");
  assert.ok(r3.petit >= 44, `scénario 3 : boutons trop petits (${r3.petit})`);
  assert.deepEqual(r3.presses, ["auto", "normale"], "scénario 3 : valeurs actives");
  await a.cliquer('#profil .f-segment button[data-valeur="clair"]');
  await a.cliquer('#profil .f-segment button[data-valeur="tres-grande"]');
  const r3b = await a.evaluer(`({ theme: document.documentElement.dataset.theme, taille: document.documentElement.dataset.taille,
    reglage: lireReglages().apparence, maj: !!lireReglages().maj })`);
  assert.deepEqual(r3b, { theme: "clair", taille: "tres-grande", reglage: { theme: "clair", taille: "tres-grande" }, maj: true }, "scénario 3 : choix non appliqué");
  console.log("3 : rubrique Apparence");

  // 4 : thème effectif (Auto suit le système) et audit de contraste automatique dans les deux thèmes
  const AUDIT = `(() => {
    const lum = (c) => { const [r, g, b] = c.match(/[\\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
      return .2126 * r + .7152 * g + .0722 * b; };
    const alpha = (c) => { const p = c.match(/[\\d.]+/g); return p.length > 3 ? Number(p[3]) : 1; };
    const fond = (e) => { for (let x = e; x; x = x.parentElement) { const s = getComputedStyle(x);
      if (s.backgroundImage !== "none") return null; if (alpha(s.backgroundColor) > .5) return s.backgroundColor; }
      return getComputedStyle(document.body).backgroundColor; };
    const echecs = [];
    for (const e of document.querySelectorAll("body *")) {
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (!/[\\p{L}\\p{N}]/u.test(e.textContent)) continue;   // symbole seul (▶, ✕…) : une icône, pas du texte
      if (e.closest("[aria-hidden=true], .cache, #fil, #lancement, svg") || !e.getClientRects().length) continue;
      const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || r.width < 1) continue;
      const s = getComputedStyle(e); if (s.visibility === "hidden" || Number(s.opacity) < .9) continue;
      const f = fond(e); if (!f) continue;
      const [a, b] = [lum(s.color), lum(f)].sort((x, y) => y - x);
      const ratio = (a + .05) / (b + .05);
      const grand = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.6 && Number(s.fontWeight) >= 700);
      if (ratio < (grand ? 3 : 4.5)) echecs.push(\`\${e.tagName.toLowerCase()}.\${[...e.classList].join(".")} « \${e.textContent.trim().slice(0, 25)} » \${ratio.toFixed(2)}\`);
    }
    return echecs;
  })()`;
  const ECRANS = { accueil: "afficherAccueil()",
    // Jauge de l'objectif du jour, en cours puis atteinte
    objectifEnCours: `(() => { const c = lireCollection(); c.jours = { [jourLocal()]: 12 }; ecrireCollection(c); afficherAccueil(); })()`,
    objectifAtteint: `(() => { const c = lireCollection(); c.jours = { [jourLocal()]: 25 }; ecrireCollection(c); afficherAccueil(); })()`,
    profil: "Profil.ouvrir()", parametres: "Profil.ouvrirParametres()",
    matieres: "Profil.ouvrirParametres(); Profil.empiler('matieres')", modifier: "Profil.ouvrir(); Profil.empiler('modifier')",
    discotheque: "Discotheque.ouvrir()", classement: "Classement.ouvrir()", amis: "Amis.ouvrir()",
    // États remplis (données simulées, comme dans amis.test et classement.test)
    amisRemplis: `Amis.ouvrir(); document.querySelector("#amis .f-amis-zone").replaceChildren(Amis.rendre({ amis: [
      { pseudo: "Lucas", avatar: "vert-coeur", relation: "ami", notions: 26, record: 42, record_le: "2026-11-23T10:00:00Z" },
      { pseudo: "Max", relation: "recue", notions: null, record: null, record_le: null },
      { pseudo: "Léa", relation: "envoyee", notions: null, record: null, record_le: null }],
      classement: [{ rang: 1, pseudo: "Lucas", score: 42, moi: false, notions: 26 }, { rang: 2, pseudo: "Ferdi", score: 38, moi: true, notions: 30 }],
      periode: "record", monRecord: 38, vuLe: "2026-11-22T00:00:00Z" }))`,
    classementRempli: `Classement.ouvrir(); document.querySelector("#classement .f-classement-zone").replaceChildren(Classement.rendre([
      { rang: 1, pseudo: "Ferdi", score: 42, moi: false }, { rang: 2, pseudo: "Bastien", score: 40, moi: false },
      { rang: 3, pseudo: "Lou", score: 31, moi: false }, { rang: 63, pseudo: "Moi", score: 4, moi: true }],
      { periode: "semaine", date: new Date().toISOString(), debut: Classement.lundiCourant(), horsLigne: true }))` };
  for (const theme of ["sombre", "clair"]) {
    const d = await ouvrir({ matieresExclues: [], formatsExclus: [], maj: "2026-11-25T08:00:00Z", apparence: { theme, taille: "normale" } });
    assert.equal(await d.evaluer("Apparence.effectif()"), theme, `scénario 4 : thème effectif ${theme}`);
    const tous = [];
    for (const [nom, js] of Object.entries(ECRANS)) {
      await d.evaluer(js);
      await attendre(700);
      for (const x of await d.evaluer(AUDIT)) tous.push(`${nom} : ${x}`);
    }
    // Portail (sans session) : étapes 1, 2 et 3
    const sansCompte = await ouvrirPortail({ matieresExclues: [], formatsExclus: [], maj: "2026-11-25T08:00:00Z", apparence: { theme, taille: "normale" } });
    for (const etape of [1, 2, 3]) {
      await sansCompte.evaluer(`Portail.ouvrir(${etape})`);
      await attendre(500);
      for (const x of await sansCompte.evaluer(AUDIT)) tous.push(`portail ${etape} : ${x}`);
    }
    assert.deepEqual(tous, [], `scénario 4 : contraste insuffisant en ${theme}`);
  }
  // Appli installée (encoche) en clair : bande encre sous la barre d'état, dont le texte reste blanc
  const enc = await ouvrir({ matieresExclues: [], formatsExclus: [], maj: "2026-11-25T08:00:00Z", apparence: { theme: "clair", taille: "normale" } });
  await enc.encoche(47, 34);
  await attendre(300);
  const bande = await enc.evaluer(`(() => { const e = document.querySelector(".f-entete"); const r = e.getBoundingClientRect();
    return r.top <= 0 ? getComputedStyle(e).backgroundImage : "en-tête pas collé en haut"; })()`);
  assert.match(bande, /linear-gradient\(rgb\(22, 17, 43\)/, `scénario 4 : pas de bande encre sous la barre d'état (${bande})`);
  // Auto : suit le thème du système, en direct
  const auto = await ouvrir();
  await auto.media("dark");
  await attendre(200);
  const sombreAuto = await auto.evaluer(`[Apparence.effectif(), document.documentElement.dataset.effectif, document.querySelector('meta[name="theme-color"]').content]`);
  await auto.media("light");
  await attendre(200);
  const clairAuto = await auto.evaluer(`[Apparence.effectif(), document.documentElement.dataset.effectif, document.querySelector('meta[name="theme-color"]').content]`);
  assert.deepEqual(sombreAuto, ["sombre", "sombre", "#16112B"], "scénario 4 : Auto en système sombre");
  assert.deepEqual(clairAuto, ["clair", "clair", "#FAF8F4"], "scénario 4 : Auto en système clair");
  console.log("4 : thème effectif et contraste");

  // 5 : taille de l'affichage — zoom appliqué, rien ne déborde à 375 px en « Très grande »
  const z = await ouvrir({ matieresExclues: [], formatsExclus: [], maj: "2026-11-25T08:00:00Z", apparence: { theme: "sombre", taille: "tres-grande" } },
    { largeur: 375, hauteur: 667 });
  assert.equal(await z.evaluer("getComputedStyle(document.body).zoom"), "1.25", "scénario 5 : zoom non appliqué");
  for (const [nom, js] of Object.entries({ accueil: "afficherAccueil()", profil: "Profil.ouvrir()", parametres: "Profil.ouvrirParametres()",
    discotheque: "Discotheque.ouvrir()", session: "montrerFil('session')" })) {
    await z.evaluer(js);
    await attendre(500);
    const r = await z.evaluer(`(() => { const ecran = [...document.querySelectorAll(".f-accueil:not(.cache), #fil:not(.cache)")][0];
      const nav = document.getElementById("nav").getBoundingClientRect();
      return { deborde: Math.max(document.documentElement.scrollWidth, ecran ? ecran.scrollWidth * 1.25 : 0) > innerWidth + 1,
        nav: getComputedStyle(document.getElementById("nav")).display === "none" || (nav.right <= innerWidth + 1 && nav.bottom <= innerHeight + 1) }; })()`);
    assert.deepEqual(r, { deborde: false, nav: true }, `scénario 5 : ${nom} déborde en très grande taille`);
  }
  await z.evaluer("Profil.ouvrirParametres()");
  await z.cliquer('#profil .f-segment button[data-valeur="normale"]');
  assert.equal(await z.evaluer("getComputedStyle(document.body).zoom"), "1", "scénario 5 : retour à la taille normale");
  console.log("5 : taille de l'affichage");

  for (const x of appareils) {
    assert.deepEqual(x.violationsCsp, [], "violations CSP");
    assert.deepEqual(x.erreurs, [], "erreurs");
  }
  console.log("OK — apparence");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
