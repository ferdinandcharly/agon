// Amis (projet 2/3) et barre d'onglets. Sans compte (CAPTCHA) : les échanges d'amis sont vérifiés à la main
// sur deux comptes ; ici, la barre, l'écran Amis hors compte, les fonctions pures et le rendu sur données simulées.
// Lancer depuis la racine du dépôt : node tests/amis.test.mjs
import assert from "node:assert/strict";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const serveur = await demarrerServeur("app", 8765);
const edge = await lancerEdge();
let echec = null;
try {
  const a = await edge.nouvelAppareil();
  await a.aller(serveur.url);
  await a.attendreQue("!document.getElementById('lancement') && typeof donnees !== 'undefined' && !!donnees", 8000);
  const etatNav = () => a.evaluer(`(() => { const n = document.getElementById("nav");
    return { visible: !!n && !n.classList.contains("cache") && getComputedStyle(n).display !== "none",
             actif: n?.querySelector('[aria-current="page"]')?.dataset.onglet ?? null }; })()`);

  // 1 : barre présente sur les écrans principaux, cachée dans le fil
  assert.deepEqual(await etatNav(), { visible: true, actif: "accueil" }, "scénario 1 : barre de l'accueil");
  await a.cliquer('#nav [data-onglet="disco"]');
  await attendre(300);
  assert.equal(await a.evaluer("!document.getElementById('discotheque').classList.contains('cache')"), true, "scénario 1 : Disco n'ouvre pas la discothèque");
  assert.deepEqual(await etatNav(), { visible: true, actif: "disco" }, "scénario 1 : barre de la discothèque");
  await a.evaluer("Classement.ouvrir()");
  await attendre(300);
  assert.deepEqual(await etatNav(), { visible: true, actif: null }, "scénario 1 : barre du classement");
  await a.evaluer("montrerFil('session')");
  await attendre(300);
  assert.equal((await etatNav()).visible, false, "scénario 1 : barre visible dans le fil");
  await a.evaluer("afficherAccueil()");
  await attendre(300);
  assert.deepEqual(await etatNav(), { visible: true, actif: "accueil" }, "scénario 1 : barre au retour à l'accueil");
  assert.equal(await a.evaluer("document.querySelectorAll('.f-retour-menu').length"), 0, "scénario 1 : boutons « Retour au menu » restants");
  assert.equal(await a.evaluer("document.body.innerText.includes('Bientôt')"), false, "scénario 1 : « Bientôt » encore affiché");
  console.log("1 : barre d'onglets");

  // 2 : pastille de l'onglet Amis
  const pastille = async (n) => a.evaluer(`(() => { Nav.pastille(${n}); const p = document.querySelector("#nav .f-nav-pastille");
    return p.classList.contains("cache") ? "" : p.textContent; })()`);
  assert.equal(await pastille(3), "3", "scénario 2 : pastille 3");
  assert.equal(await pastille(12), "9+", "scénario 2 : pastille 12");
  assert.equal(await pastille(0), "", "scénario 2 : pastille 0");
  console.log("2 : pastille");

  // 3 : l'accueil et la barre tiennent sur un écran (app installée, marges réelles)
  for (const [largeur, hauteur, haut, bas] of [[375, 667, 20, 0], [390, 844, 47, 34], [430, 932, 59, 34]]) {
    const k = await edge.nouvelAppareil({ largeur, hauteur });
    await k.encoche(haut, bas);
    await k.avantPage("Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true })");
    await k.aller(serveur.url);
    await k.attendreQue("!document.getElementById('lancement')", 8000);
    const r = await k.evaluer(`(() => { const acc = document.getElementById("accueil");
      return { defile: acc.scrollHeight, client: acc.clientHeight,
               bas: Math.round(acc.querySelector(".f-accueil-bas").getBoundingClientRect().bottom),
               nav: Math.round(document.getElementById("nav").getBoundingClientRect().top),
               navBas: Math.round(document.getElementById("nav").getBoundingClientRect().bottom) }; })()`);
    assert.ok(r.defile <= r.client, `scénario 3 : l'accueil défile en ${largeur}×${hauteur} (${r.defile} > ${r.client})`);
    assert.ok(r.bas <= r.nav, `scénario 3 : la barre recouvre les boutons en ${largeur}×${hauteur} (${r.bas} > ${r.nav})`);
    assert.ok(r.navBas <= hauteur, `scénario 3 : barre hors de l'écran en ${largeur}×${hauteur}`);
    assert.deepEqual(k.erreurs, [], "scénario 3 : erreurs");
  }
  console.log("3 : accueil et barre sur un écran");

  assert.deepEqual(a.violationsCsp, [], "violations CSP");
  assert.deepEqual(a.erreurs, [], "erreurs");
  console.log("OK — amis");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
