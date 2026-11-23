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
  assert.deepEqual(distantGagne.notions, { "a/b": "a_venir" }, "scénario 3 : une ancienne version (sans cases) efface les cases");
  const distantTableau = await a.evaluer(`Compte.fusionReglages(${JSON.stringify({ ...base, maj: "2026-11-20T10:00:00Z", notions: { "a/b": "a_venir" } })},
    ${JSON.stringify({ ...base, maj: "2026-11-21T10:00:00Z", notions: ["x"] })})`);
  assert.deepEqual(distantTableau.notions, {}, "scénario 3 : cases distantes invalides acceptées");
  const distantValide = await a.evaluer(`Compte.fusionReglages(${JSON.stringify({ ...base, maj: "2026-11-20T10:00:00Z", notions: { "a/b": "a_venir" } })},
    ${JSON.stringify({ ...base, maj: "2026-11-21T10:00:00Z", notions: { "c/d": "ds_passe", "e/f": "n_importe" } })})`);
  assert.deepEqual(distantValide.notions, { "c/d": "ds_passe" }, "scénario 3 : cases distantes plus récentes mal filtrées");
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

  // 6 : ordre des albums, pastilles, vinyle doré (résultats préparés)
  const prep = await a.evaluer(`(() => {
    const valides = donnees.contenus.filter((c) => contenuValide(c));
    const notionsDe = (m) => [...new Set(valides.filter((c) => c.matiere === m).map((c) => c.notion))];
    const res = {};
    const jouer = (m, notion, ok) => valides.filter((c) => c.matiere === m && c.notion === notion && c.format !== "fiche")
      .forEach((c) => { res[c.id] = { vu: 1, ok: ok ? 1 : 0, ko: ok ? 0 : 1, derniereOk: ok, boite: ok ? 2 : 1, dernier: "2026-11-20T08:00:00Z" }; });
    const sys = notionsDe("sys"), eco = notionsDe("eco"), dev = notionsDe("dev"), res2 = notionsDe("reseau");
    jouer("sys", sys[0], false); jouer("sys", sys[1], false);
    jouer("eco", eco[0], false);
    dev.forEach((n) => jouer("dev", n, true));
    return { res, notions: { ["reseau/" + res2[0]]: "a_venir", ["reseau/" + res2[1]]: "a_venir" } }; })()`);
  await a.evaluer(`localStorage.setItem("agon.resultats", ${JSON.stringify(JSON.stringify(prep.res))})`);
  await avecReglages(a, { notions: prep.notions });
  await a.cliquer(".f-boule");
  await a.attendreQue("!!document.querySelector('#discotheque .f-pochette')");
  const r6 = await a.evaluer(`(() => {
    const p = [...document.querySelectorAll("#discotheque .f-pochette")];
    const pastille = (m) => p.find((x) => x.dataset.matiere === m)?.querySelector(".f-pochette-pastille")?.innerText ?? "";
    return { ordre: p.map((x) => x.dataset.matiere).slice(0, 2), sys: pastille("sys"), eco: pastille("eco"), reseau: pastille("reseau"),
             devOr: p.find((x) => x.dataset.matiere === "dev")?.classList.contains("or"),
             courant: Discotheque.albumCourant() }; })()`);
  assert.deepEqual(r6.ordre, ["sys", "eco"], "scénario 6 : ordre des albums");
  assert.match(r6.sys, /2 à revoir/, "scénario 6 : pastille Systèmes");
  assert.match(r6.eco, /1 à revoir/, "scénario 6 : pastille Économie");
  assert.match(r6.reseau, /2 à venir/, "scénario 6 : pastille Réseaux");
  assert.equal(r6.devOr, true, "scénario 6 : vinyle doré pour un album maîtrisé");
  assert.equal(r6.courant, "sys", "scénario 6 : le bac ne s'ouvre pas sur l'album le plus urgent");
  await attendre(500);
  await a.capture("tests/captures/discotheque-iPhone.png");
  console.log("6 : ordre, pastilles, vinyle doré");

  // 7 : le bac se parcourt (bouton, clavier, glissement rapide)
  await a.cliquer("#discotheque .f-bac-suiv");
  await attendre(600);
  assert.equal(await a.evaluer("Discotheque.albumCourant()"), "eco", "scénario 7 : « › » ne passe pas à l'album suivant");
  await a.evaluer("document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))");
  await attendre(600);
  const apresFleche = await a.evaluer("Discotheque.albumCourant()");
  assert.notEqual(apresFleche, "eco", "scénario 7 : la flèche droite ne change pas d'album");
  const viseur = await a.evaluer(`(() => { const bac = document.querySelector("#discotheque .f-bac");
    const p = [...bac.querySelectorAll(".f-pochette")]; const cible = p[Math.min(5, p.length - 1)];
    bac.scrollTo({ left: cible.offsetLeft - (bac.clientWidth - cible.offsetWidth) / 2, behavior: "instant" });
    return cible.dataset.matiere; })()`);
  await attendre(700);
  assert.equal(await a.evaluer("Discotheque.albumCourant()"), viseur, "scénario 7 : l'album courant ne suit pas le glissement");
  assert.equal(await a.evaluer("document.querySelector('#discotheque .f-pistes').dataset.matiere"), viseur, "scénario 7 : pistes d'un autre album");
  console.log("7 : bouton, clavier et glissement");

  // 8 : cases d'une piste, « ▶ » et « Réviser l'album »
  await a.evaluer("Discotheque.ouvrir('reseau')");
  await attendre(500);
  const piste = await a.evaluer(`(() => { const p = document.querySelector("#discotheque .f-piste:not(.grise)"); return p.dataset.notion; })()`);
  const sel = (cas) => `#discotheque .f-piste[data-notion="${piste}"] .f-case[data-cas="${cas}"]`;
  await a.cliquer(sel("a_venir"));
  assert.equal(await a.evaluer(`document.querySelector('${sel("a_venir")}').getAttribute("aria-pressed")`), "true", "scénario 8 : case À venir non cochée");
  assert.equal(await a.evaluer(`document.querySelector('#discotheque .f-piste[data-notion="${piste}"]').classList.contains("grise")`), true, "scénario 8 : piste À venir non grisée");
  assert.equal(await a.evaluer(`etatCase("reseau", ${JSON.stringify(piste)})`), "a_venir", "scénario 8 : réglage non enregistré");
  await a.cliquer(sel("ds_passe"));
  assert.equal(await a.evaluer(`document.querySelector('${sel("a_venir")}').getAttribute("aria-pressed")`), "false", "scénario 8 : les cases ne s'excluent pas");
  assert.equal(await a.evaluer(`etatCase("reseau", ${JSON.stringify(piste)})`), "ds_passe", "scénario 8 : DS passé non enregistré");
  await a.cliquer(`#discotheque .f-piste[data-notion="${piste}"] .f-piste-jouer`);
  assert.equal(await a.evaluer(`modeFil + "|" + cibleFil?.notion + "|" + document.getElementById("fil").classList.contains("cache")`), `notion|${piste}|false`, "scénario 8 : « ▶ » ne lance pas la piste");
  await a.evaluer("Discotheque.ouvrir('reseau')");
  await attendre(400);
  await a.cliquer("#discotheque .f-album-jouer");
  assert.equal(await a.evaluer(`modeFil + "|" + cibleFil?.matiere`), "album|reseau", "scénario 8 : « Réviser l'album » ne lance pas l'album");
  console.log("8 : cases, piste et album");

  // 9 : PC
  const pc = await edge.nouvelAppareil({ largeur: 1280, hauteur: 800, mobile: false });
  await pc.aller(serveur.url);
  await pc.attendreQue("!document.getElementById('lancement')", 8000);
  await pc.cliquer(".f-boule");
  await attendre(700);
  await pc.capture("tests/captures/discotheque-PC.png");
  assert.deepEqual(pc.violationsCsp, [], "scénario 9 : violations CSP (PC)");
  assert.deepEqual(pc.erreurs, [], "scénario 9 : erreurs (PC)");
  console.log("9 : PC");

  // 10 (relecture) : la Prise d'otage ne pioche pas dans les notions « À venir »
  await avecReglages(a, {});
  const r10 = await a.evaluer(`(() => {
    for (const n of new Set(donnees.contenus.filter((c) => c.matiere === "reseau").map((c) => c.notion))) basculerCase("reseau", n, "a_venir");
    let fautives = 0, total = 0;
    for (let k = 0; k < 15; k++) for (const c of ajouterChronos(ordonner(contenusRetenus())))
      if (c.format === "chrono") for (const q of c.donnees.questions) { total++; if (q.matiere === "reseau") fautives++; }
    return { fautives, total }; })()`);
  assert.ok(r10.total > 0, "scénario 10 : aucune Prise d'otage générée");
  assert.equal(r10.fautives, 0, "scénario 10 : la Prise d'otage pose des questions de notions À venir");
  console.log("10 : Prise d'otage sans les notions À venir");

  // 11 (relecture) : les fils ciblés ignorent aussi « DS passé » (pas de mise en fin de fil)
  await avecReglages(a, {});
  const r11 = await a.evaluer(`(() => {
    const notions = [...new Set(donnees.contenus.filter((c) => c.matiere === "dev" && contenuValide(c)).map((c) => c.notion))];
    basculerCase("dev", notions[0], "ds_passe");
    let melange = false;
    for (let k = 0; k < 6 && !melange; k++) {
      montrerFil("album", { matiere: "dev" });
      const n = [...document.querySelectorAll("#fil > .f-ecran")].filter((e) => e.dataset.notion).map((e) => e.dataset.notion);
      const premierDs = n.indexOf(notions[0]), dernierAutre = n.map((x, i) => (x !== notions[0] ? i : -1)).reduce((m, i) => Math.max(m, i), -1);
      if (premierDs >= 0 && premierDs < dernierAutre) melange = true;
    }
    afficherAccueil();
    return melange; })()`);
  assert.equal(r11, true, "scénario 11 : « Réviser l'album » met encore les DS passé en fin de fil");
  console.log("11 : fil ciblé sans ordre DS passé");

  // 12 (relecture) : une notion « À venir » ne compte pas comme « à revoir »
  const r12 = await a.evaluer(`Discotheque.pastilleAlbum({ id: "x", nom: "X", rang: 0, notions: [
    { nom: "a", etat: "a_revoir", cas: "a_venir" }, { nom: "b", etat: "en_cours", cas: null }] })`);
  assert.equal(r12, "1 à venir", "scénario 12 : une notion À venir compte dans « à revoir »");
  const r12b = await a.evaluer(`Discotheque.ordreAlbums([
    { id: "x", nom: "X", rang: 0, notions: [{ nom: "a", etat: "a_revoir", cas: "a_venir" }] },
    { id: "y", nom: "Y", rang: 1, notions: [{ nom: "b", etat: "en_cours", cas: null }] }]).map((al) => al.id)`);
  assert.deepEqual(r12b, ["y", "x"], "scénario 12 : un album rendu urgent par une notion À venir");
  console.log("12 : À venir hors du compte à revoir");

  // 13 (relecture) : cocher une case garde le focus ; une synchro pendant un glissement ne ramène pas le bac en arrière
  await a.evaluer("Discotheque.ouvrir('reseau')");
  await attendre(500);
  const sel13 = await a.evaluer(`(() => { const p = document.querySelector("#discotheque .f-piste"); return p.dataset.notion; })()`);
  const case13 = `#discotheque .f-piste[data-notion="${sel13}"] .f-case[data-cas="ds_passe"]`;
  await a.evaluer(`document.querySelector('${case13}').focus(); document.querySelector('${case13}').click()`);
  await attendre(300);
  assert.equal(await a.evaluer(`document.activeElement === document.querySelector('${case13}')`), true, "scénario 13 : focus perdu après une case");
  const vise = await a.evaluer(`(() => { const bac = document.querySelector("#discotheque .f-bac");
    const p = [...bac.querySelectorAll(".f-pochette")]; const cible = p.at(-1);
    bac.scrollTo({ left: cible.offsetLeft - (bac.clientWidth - cible.offsetWidth) / 2, behavior: "instant" });
    Discotheque.rafraichir();   // une synchro arrive pendant le glissement
    return cible.dataset.matiere; })()`);
  await attendre(700);
  assert.equal(await a.evaluer("Discotheque.albumCourant()"), vise, "scénario 13 : la synchro ramène le bac en arrière");
  console.log("13 : focus gardé, synchro sans retour en arrière");

  // 14 (relecture) : accessibilité du bac
  const r14 = await a.evaluer(`(() => { const bac = document.querySelector("#discotheque .f-bac");
    const c = bac.querySelector(".f-pochette.courante");
    return { role: bac.getAttribute("role"), desc: bac.getAttribute("aria-roledescription"),
             courant: c?.getAttribute("aria-current"), autres: bac.querySelectorAll('[aria-current="true"]').length,
             label: [...bac.querySelectorAll(".f-pochette")].find((p) => p.querySelector(".f-pochette-pastille"))?.getAttribute("aria-label") || "",
             pastille: bac.querySelector(".f-pochette-pastille")?.innerText || "" }; })()`);
  assert.equal(r14.role, "group", "scénario 14 : rôle du bac");
  assert.equal(r14.desc, "carrousel", "scénario 14 : aria-roledescription");
  assert.equal(r14.courant, "true", "scénario 14 : album courant non signalé");
  assert.equal(r14.autres, 1, "scénario 14 : plusieurs albums courants");
  assert.ok(r14.label.includes(r14.pastille), "scénario 14 : la pastille n'est pas lue");
  console.log("14 : accessibilité du bac");

  // 15 (livret) : sans compte, ni « + » ni livret ; contrôle local des fichiers
  await a.evaluer("Discotheque.ouvrir('reseau')");
  await attendre(400);
  assert.equal(await a.evaluer("!!document.querySelector('#discotheque .f-livret-ajouter, #discotheque .f-livret')"), false, "scénario 15 : livret visible sans compte");
  const v = (f) => a.evaluer(`Livret.verifierFichier(${JSON.stringify(f)})`);
  assert.equal(await v({ name: "a.pdf", type: "application/pdf", size: 1000 }), null, "scénario 15 : PDF refusé");
  assert.match(await v({ name: "a.zip", type: "application/zip", size: 1000 }) || "", /PDF/, "scénario 15 : zip accepté");
  assert.match(await v({ name: "a.pdf", type: "application/pdf", size: 21 * 1024 * 1024 }) || "", /20 Mo/, "scénario 15 : fichier trop gros accepté");
  assert.equal(await v({ name: "IMG_1.HEIC", type: "", size: 2000 }), null, "scénario 15 : photo iPhone (type vide) refusée");
  console.log("15 : livret absent sans compte, contrôle des fichiers");

  // 16 (iPhone) : pendant le glissement, la pochette centrée s'anime tout de suite (pas d'attente de la fin),
  // et la face de la pochette a son propre calque (Safari dessine sinon le vinyle animé par-dessus)
  await a.evaluer("Discotheque.ouvrir('reseau')");
  await attendre(500);
  const r16 = await a.evaluer(`(async () => { const bac = document.querySelector("#discotheque .f-bac");
    bac.addEventListener("scrollend", (e) => e.stopImmediatePropagation(), { capture: true, once: true });
    const cible = [...bac.querySelectorAll(".f-pochette")].at(-1);
    bac.scrollTo({ left: cible.offsetLeft - (bac.clientWidth - cible.offsetWidth) / 2, behavior: "instant" });
    await new Promise((r) => setTimeout(r, 60));   // le doigt n'est pas encore levé (< 120 ms)
    return { anime: cible.classList.contains("courante"), seules: bac.querySelectorAll(".f-pochette.courante").length,
             calque: getComputedStyle(cible.querySelector(".f-pochette-face")).transform }; })()`);
  assert.equal(r16.anime, true, "scénario 16 : la pochette centrée attend la fin du glissement");
  assert.equal(r16.seules, 1, "scénario 16 : plusieurs pochettes courantes");
  assert.notEqual(r16.calque, "none", "scénario 16 : la face de pochette n'a pas son propre calque");
  await attendre(400);
  console.log("16 : pochette animée pendant le glissement, face sur son calque");

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
