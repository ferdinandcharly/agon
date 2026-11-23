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
  await a.attendreQue("/Hors ligne/.test(document.getElementById('amis').innerText)", 8000);
  console.log("4 : Amis, compte sans réseau → hors ligne");

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

  // Portail : avatars dans le classement des amis et la liste des amis
  const av = await a.evaluer(`(() => { const n = Amis.rendre({ amis: [{ pseudo: "Lucas", avatar: "vert-coeur", relation: "ami", notions: 2, record: 1, record_le: null }],
    classement: [{ rang: 1, pseudo: "Lucas", avatar: "vert-coeur", score: 1, moi: false, notions: 2 }], periode: "record", monRecord: 0, vuLe: null });
    return [...n.querySelectorAll(".f-avatar")].map((x) => x.dataset.avatar); })()`);
  assert.deepEqual(av, ["vert-coeur", "vert-coeur"], "avatars de l'écran Amis");
  console.log("avatars de l'écran Amis");

  // 7 : sans compte, publierNotions ne contacte pas la base
  const avant7 = a.requetes.length;
  await a.evaluer("Compte.publierNotions(5)");
  await attendre(300);
  assert.equal(a.requetes.slice(avant7).filter((q) => q.url.includes("/rest/v1/profils")).length, 0, "scénario 7 : profil modifié sans compte");
  console.log("7 : notions non publiées sans compte");

  // 8 (relecture) : ouvrir Amis sans données fraîches n'enregistre pas de visite ; la pastille s'oublie avec le compte
  await a.evaluer("localStorage.removeItem('agon.amis.vu'); Amis.ouvrir()");
  await attendre(300);
  assert.equal(await a.evaluer("localStorage.getItem('agon.amis.vu')"), null, "scénario 8 : visite enregistrée sans données fraîches");
  await a.evaluer("Nav.pastille(3); Amis.oublier()");
  assert.equal(await a.evaluer("document.querySelector('#nav .f-nav-pastille').classList.contains('cache')"), true, "scénario 8 : pastille gardée après l'oubli du compte");
  // Le bouton « Nouvelle version » ne recouvre pas la barre d'onglets
  await a.evaluer("afficherAccueil()");
  const maj = await a.evaluer(`(() => { const b = el("button", { class: "f-maj", type: "button" }, "Nouvelle version"); document.body.append(b);
    const r = [Math.round(b.getBoundingClientRect().bottom), Math.round(document.getElementById("nav").getBoundingClientRect().top)]; b.remove(); return r; })()`);
  assert.ok(maj[0] <= maj[1], `scénario 8 : « Nouvelle version » sur la barre (${maj[0]} > ${maj[1]})`);
  console.log("8 : relecture (visite, pastille, nouvelle version)");

  // 9 : iOS installé qui raccourcit la zone d'affichage de la barre d'état (797 px sur un écran de 844) et ne
  // dessine rien en dessous : la barre reste dans la zone visible et ne réserve plus la barre d'accueil de l'iPhone
  // (qui tombe dans la bande non dessinée) ; sans ce défaut, elle la réserve toujours.
  const ios = await edge.nouvelAppareil({ largeur: 390, hauteur: 797, ecran: 844 });
  await ios.encoche(47, 34);
  await ios.avantPage("Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true })");
  await ios.aller(serveur.url);
  await ios.attendreQue("!document.getElementById('lancement')", 8000);
  const barreIos = `(() => { const n = document.getElementById("nav"); return [Math.round(n.getBoundingClientRect().bottom), getComputedStyle(n).paddingBottom]; })()`;
  assert.deepEqual(await ios.evaluer(barreIos), [797, "6px"], "scénario 9 : barre hors de la zone visible ou trop haute");
  const r9 = await ios.evaluer(`(() => { const acc = document.getElementById("accueil"); return [acc.scrollHeight, acc.clientHeight]; })()`);
  assert.ok(r9[0] <= r9[1], `scénario 9 : l'accueil défile (${r9})`);
  const sansDefaut = await edge.nouvelAppareil({ largeur: 390, hauteur: 844, ecran: 844 });
  await sansDefaut.encoche(47, 34);
  await sansDefaut.avantPage("Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true })");
  await sansDefaut.aller(serveur.url);
  await sansDefaut.attendreQue("!document.getElementById('lancement')", 8000);
  assert.deepEqual(await sansDefaut.evaluer(barreIos), [844, "34px"], "scénario 9 : barre d'accueil de l'iPhone non réservée sans le défaut");
  assert.deepEqual([...ios.erreurs, ...sansDefaut.erreurs], [], "scénario 9 : erreurs");
  console.log("9 : bas de l'écran iOS (app installée)");

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
