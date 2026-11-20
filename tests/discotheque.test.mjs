// Discothèque et cases « À venir » / « DS passé ». Sans compte (CAPTCHA) : la synchro des cases entre
// appareils est vérifiée à la main ; ici, les effets sur le fil, les fils ciblés et l'écran.
// Lancer depuis la racine du dépôt : node tests/discotheque.test.mjs
import assert from "node:assert/strict";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const serveur = await demarrerServeur("app", 8765);
const edge = await lancerEdge();

// Prépare des réglages puis recharge l'appli
async function avecReglages(a, reglages) {
  await a.evaluer(`localStorage.setItem("agon.reglages", ${JSON.stringify(JSON.stringify({ matieresExclues: [], formatsExclus: [], ...reglages }))})`);
  await a.aller(serveur.url);
  await a.attendreQue("!document.getElementById('lancement') && typeof donnees !== 'undefined' && !!donnees", 8000);
}

let echec = null;
try {
  const a = await edge.nouvelAppareil();
  await a.aller(serveur.url);

  // 1 : « À venir » sort la notion du fil (clé orpheline ignorée), la Survie garde tout
  await avecReglages(a, { notions: { "reseau/DHCP": "a_venir", "inconnue/Rien": "a_venir" } });
  const r1 = await a.evaluer(`(() => { const r = contenusRetenus();
    return { dhcp: r.filter((c) => c.matiere === "reseau" && c.notion === "DHCP").length,
             autresReseau: r.filter((c) => c.matiere === "reseau" && c.notion !== "DHCP").length }; })()`);
  assert.equal(r1.dhcp, 0, "scénario 1 : des cartes DHCP restent dans le fil");
  assert.ok(r1.autresReseau > 0, "scénario 1 : les autres notions de Réseaux ont disparu");
  const totalRapides = await a.evaluer(`donnees.contenus.filter((c) => contenuValide(c) && (c.format === "vrai_faux" || c.format === "trous")).length`);
  await a.cliquer(".f-bouton-survie");
  const depart = await a.evaluer("document.querySelector(\".f-ecran[data-matiere='survie']\").innerText");
  assert.match(depart, new RegExp(`${totalRapides} questions`), "scénario 1 : la Survie ne garde pas toutes les questions");
  console.log("1 : À venir sort la notion du fil, la Survie garde tout");

  // 2 : « DS passé » met la notion en fin de fil
  await avecReglages(a, { notions: { "dev/Pointeurs en C": "ds_passe" } });
  const r2 = await a.evaluer(`(() => { const f = ordonner(contenusRetenus());
    const ds = f.map((c, i) => (c.matiere === "dev" && c.notion === "Pointeurs en C" ? i : -1)).filter((i) => i >= 0);
    const autres = f.map((c, i) => (c.matiere === "dev" && c.notion === "Pointeurs en C" ? -1 : i)).filter((i) => i >= 0);
    return { n: ds.length, premierDs: Math.min(...ds), dernierAutre: Math.max(...autres) }; })()`);
  assert.ok(r2.n > 0, "scénario 2 : aucune carte de la notion");
  assert.ok(r2.premierDs > r2.dernierAutre, "scénario 2 : les cartes DS passé ne sont pas en fin de fil");
  console.log("2 : DS passé en fin de fil");

  // 3 : bascule exclusive, persistance, fusion entre appareils, matière entière « À venir »
  await avecReglages(a, {});
  const r3 = await a.evaluer(`(() => {
    const lu = () => JSON.parse(localStorage.getItem("agon.reglages")).notions?.["reseau/DHCP"] ?? null;
    const etapes = [];
    basculerCase("reseau", "DHCP", "a_venir"); etapes.push(etatCase("reseau", "DHCP"), lu());
    basculerCase("reseau", "DHCP", "ds_passe"); etapes.push(etatCase("reseau", "DHCP"), lu());
    basculerCase("reseau", "DHCP", "ds_passe"); etapes.push(etatCase("reseau", "DHCP"), lu());
    return etapes; })()`);
  assert.deepEqual(r3, ["a_venir", "a_venir", "ds_passe", "ds_passe", null, null], "scénario 3 : bascule des cases");
  const base = { matieresExclues: [], formatsExclus: [], remise: null };
  const localGagne = await a.evaluer(`Compte.fusionReglages(${JSON.stringify({ ...base, maj: "2026-11-21T10:00:00Z", notions: { "a/b": "a_venir" } })},
    ${JSON.stringify({ ...base, maj: "2026-11-20T10:00:00Z" })})`);
  assert.deepEqual(localGagne.notions, { "a/b": "a_venir" }, "scénario 3 : la fusion perd les cases locales plus récentes");
  const distantGagne = await a.evaluer(`Compte.fusionReglages(${JSON.stringify({ ...base, maj: "2026-11-20T10:00:00Z", notions: { "a/b": "a_venir" } })},
    ${JSON.stringify({ ...base, maj: "2026-11-21T10:00:00Z" })})`);
  assert.deepEqual(distantGagne.notions, {}, "scénario 3 : réglages distants plus récents sans cases");
  const toutReseau = await a.evaluer(`(() => { for (const n of new Set(donnees.contenus.filter((c) => c.matiere === "reseau").map((c) => c.notion)))
    basculerCase("reseau", n, "a_venir"); const r = contenusRetenus();
    return { reseau: r.filter((c) => c.matiere === "reseau").length, total: r.length }; })()`);
  assert.equal(toutReseau.reseau, 0, "scénario 3 : des cartes de Réseaux restent");
  assert.ok(toutReseau.total > 0, "scénario 3 : le fil est vide alors que d'autres matières restent");
  console.log("3 : bascule exclusive, persistance, fusion, matière entière à venir");

  // 4 : fils ciblés — ils ignorent les cases et les matières exclues, mais pas les formats exclus
  await avecReglages(a, { matieresExclues: ["reseau"], notions: { "reseau/DHCP": "a_venir" } });
  const r4 = await a.evaluer(`(() => { montrerFil("notion", { matiere: "reseau", notion: "DHCP" });
    const ecrans = [...document.querySelectorAll("#fil > .f-ecran")];
    const cartes = ecrans.filter((e) => e.dataset.notion);
    return { n: cartes.length, bons: cartes.every((e) => e.dataset.matiere === "reseau" && e.dataset.notion === "DHCP"),
             chrono: ecrans.some((e) => e.dataset.matiere === "chrono"),
             fin: ecrans.at(-1).innerText }; })()`);
  assert.ok(r4.n > 0, "scénario 4 : fil de notion vide");
  assert.ok(r4.bons, "scénario 4 : des cartes d'une autre notion");
  assert.equal(r4.chrono, false, "scénario 4 : Prise d'otage dans un fil ciblé");
  assert.match(r4.fin, /Retour à la discothèque/, "scénario 4 : pas de retour à la discothèque");
  const r4b = await a.evaluer(`(() => { montrerFil("album", { matiere: "eco" });
    const cartes = [...document.querySelectorAll("#fil > .f-ecran")].filter((e) => e.dataset.notion);
    return { n: cartes.length, bons: cartes.every((e) => e.dataset.matiere === "eco") }; })()`);
  assert.ok(r4b.n > 0 && r4b.bons, "scénario 4 : le fil d'album contient autre chose que l'Économie");
  console.log("4 : fils ciblés (notion, album)");

  // 5 : notion sans carte jouable avec les formats cochés → écran vide propre, retour à la discothèque
  await avecReglages(a, { formatsExclus: ["vrai_faux", "trous", "associer", "ordre", "erreur", "fiche"] });
  const r5 = await a.evaluer(`(() => { montrerFil("notion", { matiere: "reseau", notion: "DHCP" });
    return document.getElementById("fil").innerText; })()`);
  assert.match(r5, /Aucune carte/, "scénario 5 : pas d'écran vide");
  assert.match(r5, /Retour à la discothèque/, "scénario 5 : pas de retour à la discothèque");
  await a.evaluer("afficherAccueil()");
  console.log("5 : fil ciblé vide propre");

  assert.deepEqual(a.violationsCsp, [], "violations CSP");
  assert.deepEqual(a.erreurs, [], "erreurs");
  console.log("OK — discothèque");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
