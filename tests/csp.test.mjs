// La CSP ne bloque rien : on parcourt chaque écran (accueil, arbre, fil, Prise d'otage, Survie, réglages)
// en taille iPhone et PC, et on exige zéro violation CSP et zéro erreur.
// Lancer depuis la racine du dépôt : node tests/csp.test.mjs
import assert from "node:assert/strict";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const serveur = await demarrerServeur("app", 8765);
const edge = await lancerEdge();
let echec = null;
try {
  for (const [nom, taille] of [["iPhone", { largeur: 390, hauteur: 844, mobile: true }], ["PC", { largeur: 1280, hauteur: 800, mobile: false }]]) {
    const a = await edge.nouvelAppareil(taille);
    await a.aller(serveur.url);
    // Le lancement : capture au milieu de l'animation, pour vérifier les tuiles à l'œil
    await a.evaluer("location.reload()");
    await attendre(300);
    await a.capture(`tests/captures/lancement-${nom}.png`);
    await a.attendreQue("!document.getElementById('lancement')", 6000);

    // Arbre puis retour
    await a.cliquer(".f-boule");
    await a.cliquer(".f-retour-menu");
    // Session : on fait défiler une douzaine de cartes (une Prise d'otage peut verrouiller : sans gravité)
    await a.cliquer(".f-lancer-session");
    for (let i = 0; i < 12; i++) {
      await a.evaluer("document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))");
      await attendre(450);
    }
    await a.cliquer("#btn-accueil");
    // Survie : lancer et répondre une fois
    await a.cliquer(".f-bouton-survie");
    await a.cliquer(".f-ecran[data-matiere='survie'] .f-lancer");
    await a.cliquer(".f-ecran[data-matiere='survie'] .f-choix .f-option");
    await attendre(800);
    await a.cliquer("#btn-accueil");
    // Réglages
    await a.cliquer("#btn-reglages");
    await attendre(500);
    await a.cliquer("#btn-fermer-reglages");

    const sansStyleEnLigne = await a.evaluer(`fetch("index.html").then((r) => r.text()).then((t) => !/class="tuile"[^>]*style=/.test(t))`);
    assert.equal(sansStyleEnLigne, true, `${nom} : des tuiles du lancement ont encore un attribut style`);
    assert.deepEqual(a.violationsCsp, [], `${nom} : violations CSP`);
    assert.deepEqual(a.erreurs, [], `${nom} : erreurs`);
    console.log(`${nom} : 0 violation CSP, 0 erreur`);
  }
  console.log("OK — 0 violation CSP, 0 erreur (iPhone, PC)");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
