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

  // 4 : écran Amis sans compte = invitation à se connecter
  await a.cliquer('#nav [data-onglet="amis"]');
  await attendre(400);
  assert.equal(await a.evaluer("!document.getElementById('amis').classList.contains('cache')"), true, "scénario 4 : écran Amis fermé");
  assert.equal((await etatNav()).actif, "amis", "scénario 4 : onglet Amis non actif");
  assert.match(await a.evaluer("document.getElementById('amis').innerText"), /Connecte-toi pour ajouter des amis/, "scénario 4 : invitation absente");
  await a.cliquer("#amis .f-classement-connexion");
  await attendre(400);
  assert.equal(await a.evaluer("document.getElementById('reglages').open"), true, "scénario 4 : le bouton n'ouvre pas le compte");
  await a.evaluer("document.getElementById('reglages').close()");
  console.log("4 : Amis sans compte");

  // 5 : records battus et pastille (fonctions pures)
  const amisExemple = [
    { pseudo: "Lucas", relation: "ami", notions: 26, record: 42, record_le: "2026-11-23T10:00:00Z" },
    { pseudo: "Zoé", relation: "ami", notions: 3, record: 38, record_le: "2026-11-23T10:00:00Z" },
    { pseudo: "Max", relation: "recue", notions: null, record: null, record_le: null },
    { pseudo: "Léa", relation: "envoyee", notions: null, record: null, record_le: null },
  ];
  const A = JSON.stringify(amisExemple);
  assert.deepEqual(await a.evaluer(`Amis.recordsBattus(${A}, 38, "2026-11-22T00:00:00Z")`), [{ pseudo: "Lucas", record: 42, moi: 38 }], "scénario 5 : records battus");
  assert.deepEqual(await a.evaluer(`Amis.recordsBattus(${A}, 38, "2026-11-24T00:00:00Z")`), [], "scénario 5 : record déjà vu");
  assert.deepEqual(await a.evaluer(`Amis.recordsBattus(${A}, null, null).map((r) => r.pseudo)`), ["Lucas", "Zoé"], "scénario 5 : sans record à moi");
  assert.equal(await a.evaluer(`Amis.compterPastille(${A}, 38, "2026-11-22T00:00:00Z")`), 2, "scénario 5 : pastille");
  console.log("5 : records battus et pastille");

  // 6 : rendu sur données simulées, en ligne puis hors ligne ; pseudo invalide refusé sans appel
  const etat = `{ amis: ${A}, classement: [{ rang: 1, pseudo: "Lucas", score: 42, moi: false, notions: 26 }, { rang: 2, pseudo: "Ferdi", score: 38, moi: true, notions: 30 }],
    periode: "record", monRecord: 38, vuLe: "2026-11-22T00:00:00Z" }`;
  const r6 = await a.evaluer(`(() => { const n = Amis.rendre(${etat}); document.getElementById("amis").replaceChildren(n);
    return { texte: n.innerText, accepter: !!n.querySelector(".f-amis-accepter"), champ: !!n.querySelector("input.f-amis-pseudo") }; })()`);
  assert.match(r6.texte, /Lucas a battu ton record : 42 \(toi : 38\)/, "scénario 6 : carte record battu");
  assert.match(r6.texte, /26 notions/, "scénario 6 : notions des amis");
  assert.equal(r6.accepter, true, "scénario 6 : pas de bouton Accepter");
  assert.equal(r6.champ, true, "scénario 6 : pas de champ pour ajouter");
  const avant = a.requetes.length;
  await a.evaluer(`(() => { const z = document.getElementById("amis"); z.querySelector("input.f-amis-pseudo").value = "a b";
    z.querySelector(".f-amis-envoyer").click(); })()`);
  await attendre(300);
  assert.match(await a.evaluer("document.querySelector('#amis .f-amis-message').innerText"), /3 à 20 caractères/, "scénario 6 : format du pseudo non vérifié");
  assert.equal(a.requetes.slice(avant).filter((q) => q.url.includes("demander_ami")).length, 0, "scénario 6 : appel avec un pseudo invalide");
  const r6b = await a.evaluer(`(() => { const n = Amis.rendre(${etat}, { horsLigne: true, date: "2026-11-23T09:00:00Z" });
    const actions = [...n.querySelectorAll("button.f-amis-action, input.f-amis-pseudo, .f-amis-envoyer")];
    return { n: actions.length, toutes: actions.every((x) => x.disabled), texte: n.innerText }; })()`);
  assert.ok(r6b.n >= 4 && r6b.toutes, `scénario 6 : actions possibles hors ligne (${r6b.n})`);
  assert.match(r6b.texte, /Hors ligne/, "scénario 6 : pas de mention hors ligne");
  console.log("6 : rendu de l'écran Amis");

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
