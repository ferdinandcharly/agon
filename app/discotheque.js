// Facettes — « Ta discothèque » : chaque matière est un album, chaque notion une piste.
// Le bac à disques se parcourt au doigt (défilement aimanté), aux boutons ‹ › ou aux flèches du clavier.
// La pochette centrée sort son vinyle (selon la part de notions maîtrisées, doré quand tout l'est) et ses pistes
// s'affichent dessous : ▶ réviser une piste, « Réviser l'album », cases « À venir » / « DS passé ».
"use strict";

const Discotheque = (() => {
  const ecran = document.getElementById("discotheque");
  const NB = " ";
  let albums = [];
  let courant = null;
  let attenteFin = null;

  // ---------- Données (fonctions pures) ----------
  // album = { id, nom, rang (ordre des matières), notions: [{ nom, etat, cas, vues, total }] }
  const compte = (album, test) => album.notions.filter(test).length;

  // Les plus urgents d'abord : notions à revoir, puis en cours, puis l'ordre habituel des matières
  function ordreAlbums(liste) {
    return [...liste].sort((a, b) =>
      compte(b, (n) => n.etat === "a_revoir") - compte(a, (n) => n.etat === "a_revoir")
      || compte(b, (n) => n.etat === "en_cours") - compte(a, (n) => n.etat === "en_cours")
      || a.rang - b.rang);
  }

  function pastilleAlbum(album) {
    const aRevoir = compte(album, (n) => n.etat === "a_revoir");
    if (aRevoir) return `${aRevoir} à revoir`;
    const aVenir = compte(album, (n) => n.cas === "a_venir");
    if (aVenir) return `${aVenir} à venir`;
    if (album.notions.some((n) => n.cas === "ds_passe")) return "DS passé";
    return null;
  }

  // Part du vinyle qui sort de la pochette : notions maîtrisées / notions, au moins 15 % pour rester visible
  function fractionVinyle(album) {
    const total = album.notions.length;
    const maitrisees = compte(album, (n) => n.etat === "maitrisee");
    return total && maitrisees === total ? 1 : Math.max(0.15, total ? maitrisees / total : 0);
  }

  function construireAlbums() {
    const resultats = lireResultats();
    const cartes = donnees.contenus.filter((c) => contenuValide(c));
    return donnees.matieres.map((m, rang) => {
      const cartesMatiere = cartes.filter((c) => c.matiere === m.id);
      const notions = [...new Set(cartesMatiere.map((c) => c.notion))].map((nom) => {
        const cartesNotion = cartesMatiere.filter((c) => c.notion === nom);
        return { nom, etat: etatNotion(cartesNotion, resultats), cas: etatCase(m.id, nom),
                 vues: cartesNotion.filter((c) => resultats[c.id]?.vu > 0).length, total: cartesNotion.length };
      });
      return { id: m.id, nom: m.nom, rang, notions };
    }).filter((a) => a.notions.length);
  }

  // ---------- Rendu ----------
  const bac = () => ecran.querySelector(".f-bac");

  function pochette(album) {
    const pastille = pastilleAlbum(album);
    const maitrisees = compte(album, (n) => n.etat === "maitrisee");
    const b = el("button", { class: "f-pochette" + (fractionVinyle(album) === 1 ? " or" : ""), type: "button",
      "data-matiere": album.id, "aria-label": `${album.nom}, ${maitrisees} pistes maîtrisées sur ${album.notions.length}` },
      el("span", { class: "f-vinyle-sort", "aria-hidden": "true" }),
      el("span", { class: "f-pochette-face" },
        pastille ? el("span", { class: "f-pochette-pastille" }, pastille) : el("span"),
        el("span", { class: "f-pochette-titre" }, el("b", {}, album.nom),
          el("small", {}, `${maitrisees}/${album.notions.length} pistes`))));
    b.style.setProperty("--sortie", String(fractionVinyle(album)));
    b.addEventListener("click", () => centrer(album.id, "smooth"));
    return b;
  }

  function piste(album, notion, i) {
    const cases = ["a_venir", "ds_passe"].map((cas) => {
      const c = el("button", { class: "f-case", type: "button", "data-cas": cas, "aria-pressed": String(notion.cas === cas) },
        cas === "a_venir" ? "À venir" : "DS passé");
      c.addEventListener("click", () => {
        basculerCase(album.id, notion.nom, cas);
        rafraichir();
      });
      return c;
    });
    const detail = notion.cas === "a_venir" ? "pas encore vue en cours"
      : `${notion.vues} carte${notion.vues > 1 ? "s" : ""} vue${notion.vues > 1 ? "s" : ""} sur ${notion.total}`;
    return el("li", { class: "f-piste" + (notion.cas === "a_venir" ? " grise" : ""), "data-notion": notion.nom },
      el("span", { class: "f-piste-num" }, String(i + 1)),
      el("span", { class: `f-piste-etat ${notion.etat}`, "aria-hidden": "true" }),
      el("span", { class: "f-piste-nom" }, notion.nom, el("small", {}, detail)),
      el("button", { class: "f-piste-jouer", type: "button", "aria-label": `Réviser ${notion.nom}`,
        onclick: () => montrerFil("notion", { matiere: album.id, notion: notion.nom }) }, "▶"),
      el("span", { class: "f-cases" }, ...cases));
  }

  function dessinerPistes() {
    const album = albums.find((a) => a.id === courant);
    const zone = ecran.querySelector(".f-pistes-zone");
    if (!album || !zone) return;
    const maitrisees = compte(album, (n) => n.etat === "maitrisee");
    const aVenir = compte(album, (n) => n.cas === "a_venir");
    zone.replaceChildren(el("div", { class: "f-album", "data-matiere": album.id },
      el("div", { class: "f-album-haut" },
        el("h2", {}, album.nom),
        el("p", {}, `${album.notions.length} pistes · ${maitrisees} maîtrisée${maitrisees > 1 ? "s" : ""}`
          + (aVenir ? ` · ${aVenir} à venir` : ""))),
      el("button", { class: "f-option f-album-jouer", type: "button",
        onclick: () => montrerFil("album", { matiere: album.id }) }, `▶${NB}Réviser l'album`),
      el("ol", { class: "f-pistes", "data-matiere": album.id }, ...album.notions.map((n, i) => piste(album, n, i)))));
    ecran.querySelectorAll(".f-pochette").forEach((p) => p.classList.toggle("courante", p.dataset.matiere === courant));
    ecran.querySelectorAll(".f-bac-points i").forEach((p, i) => p.classList.toggle("actif", albums[i]?.id === courant));
  }

  // Album le plus proche du centre du bac (après un glissement)
  function albumAuCentre() {
    const b = bac();
    const milieu = b.scrollLeft + b.clientWidth / 2;
    let meilleur = null;
    let ecart = Infinity;
    for (const p of b.querySelectorAll(".f-pochette")) {
      const d = Math.abs(p.offsetLeft + p.offsetWidth / 2 - milieu);
      if (d < ecart) { ecart = d; meilleur = p.dataset.matiere; }
    }
    return meilleur;
  }

  function choisir(id) {
    if (!id || id === courant) return;
    courant = id;
    dessinerPistes();
  }

  function centrer(id, comportement = "instant") {
    const p = ecran.querySelector(`.f-pochette[data-matiere="${id}"]`);
    if (!p) return;
    const b = bac();
    b.scrollTo({ left: p.offsetLeft - (b.clientWidth - p.offsetWidth) / 2, behavior: comportement });
    choisir(id);
  }

  function decaler(sens) {
    const i = albums.findIndex((a) => a.id === courant);
    const suivant = albums[Math.min(albums.length - 1, Math.max(0, i + sens))];
    if (suivant) centrer(suivant.id, "smooth");
  }

  function dessiner(cible) {
    albums = ordreAlbums(construireAlbums());
    const maitrisees = albums.reduce((s, a) => s + compte(a, (n) => n.etat === "maitrisee"), 0);
    const total = albums.reduce((s, a) => s + a.notions.length, 0);
    const leBac = el("div", { class: "f-bac", role: "listbox", "aria-label": "Albums" }, ...albums.map(pochette));
    // Fin de glissement : l'album centré devient l'album courant (scrollend, sinon 120 ms sans défilement)
    const fin = () => choisir(albumAuCentre());
    leBac.addEventListener("scroll", () => { clearTimeout(attenteFin); attenteFin = setTimeout(fin, 120); }, { passive: true });
    leBac.addEventListener("scrollend", fin);
    ecran.replaceChildren(el("div", { class: "f-accueil-col" },
      el("button", { class: "f-retour-menu", type: "button", onclick: afficherAccueil }, "← Retour au menu"),
      el("h1", { class: "f-accueil-titre" }, "Ta discothèque"),
      el("p", { class: "f-arbre-intro" }, `${albums.length} albums · ${maitrisees} pistes maîtrisées sur ${total}`),
      el("div", { class: "f-bac-cadre" },
        el("button", { class: "f-bac-prec", type: "button", "aria-label": "Album précédent", onclick: () => decaler(-1) }, "‹"),
        leBac,
        el("button", { class: "f-bac-suiv", type: "button", "aria-label": "Album suivant", onclick: () => decaler(1) }, "›")),
      el("div", { class: "f-bac-points", "aria-hidden": "true" }, ...albums.map(() => el("i"))),
      el("div", { class: "f-pistes-zone" })));
    courant = null;
    const id = albums.some((a) => a.id === cible) ? cible : albums[0]?.id;
    requestAnimationFrame(() => centrer(id));
    choisir(id);
  }

  // Après une case cochée ou une synchro : on redessine en restant sur le même album
  function rafraichir() {
    if (!ecran.classList.contains("cache")) dessiner(courant);
  }

  function ouvrir(matiere) {
    if (fil.classList.contains("verrouille")) return;
    afficherAccueil();
    accueil.classList.add("cache");
    ecran.classList.remove("cache");
    ecran.scrollTo({ top: 0 });
    dessiner(matiere);
  }

  // Clavier sur ordinateur : flèches gauche / droite dans le bac
  document.addEventListener("keydown", (e) => {
    if (ecran.classList.contains("cache") || e.ctrlKey || e.altKey || e.metaKey) return;
    if (document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); decaler(e.key === "ArrowRight" ? 1 : -1); }
  });

  return { ouvrir, rafraichir, albumCourant: () => courant, ordreAlbums, pastilleAlbum, fractionVinyle };
})();
