// Facettes — écran Profil : avatar, pseudo, infos, stats, « Cette semaine » et « Tes matières ».
// Ouvert par la mini-avatar de l'en-tête (#btn-reglages) ; la roue mène aux Paramètres.
// Tout ce qui s'affiche vient de l'appareil (résultats, collection, record) sauf le profil, lu par compte.js.
"use strict";

const Profil = (() => {
  const ecran = document.getElementById("profil");
  const boutonEntete = document.getElementById("btn-reglages");
  const LETTRES = ["L", "M", "M", "J", "V", "S", "D"];
  const MATIERES_VISIBLES = 4;
  let toutVoir = false;

  const estOuvert = () => !ecran.classList.contains("cache");
  const profilCharge = () => {
    const p = typeof Compte !== "undefined" ? Compte.profil() : undefined;
    return p && typeof p === "object" ? p : null;
  };

  // Semaine en cours, lundi → dimanche : nombre de réponses par jour (jours = collection.jours)
  function semaine(jours, maintenant = new Date()) {
    const auj = jourLocal(maintenant);
    const decalage = (maintenant.getDay() + 6) % 7;   // lundi = 0
    return LETTRES.map((lettre, i) => {
      const jour = jourLocal(new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - decalage + i));
      return { lettre, jour, nb: jours[jour] || 0, aujourdhui: jour === auj, futur: jour > auj };
    });
  }

  // Notions maîtrisées / notions de chaque matière, les plus avancées d'abord (ordre d'origine à égalité)
  function matieres(notions) {
    const parId = new Map();
    for (const n of notions) {
      const m = parId.get(n.matiere.id) || { id: n.matiere.id, nom: n.matiere.nom, faites: 0, total: 0 };
      m.total++;
      if (n.etat === "maitrisee") m.faites++;
      parId.set(m.id, m);
    }
    return [...parId.values()].map((m, ordre) => ({ ...m, ordre }))
      .sort((a, b) => b.faites / b.total - a.faites / a.total || a.ordre - b.ordre)
      .map(({ ordre, ...m }) => m);
  }

  const roue = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

  function stat(cle, valeur, libelle) {
    return el("div", { class: "f-profil-stat", "data-stat": cle }, el("b", {}, String(valeur)), el("span", {}, libelle));
  }

  function blocSemaine() {
    const jours = semaine(lireCollection().jours);
    const joues = jours.filter((j) => j.nb > 0).length;
    return el("section", { class: "f-profil-bloc", "aria-label": "Cette semaine" },
      el("div", { class: "f-profil-bloc-tete" }, el("h2", {}, "Cette semaine"),
        el("span", { class: "f-profil-resume" }, `${joues} jour${joues > 1 ? "s" : ""} sur 7`)),
      el("ol", { class: "f-profil-semaine" }, ...jours.map((j) => {
        const pastille = el("span", { class: "f-profil-pastille" }, j.nb ? String(j.nb) : "");
        const li = el("li", { class: "f-profil-jour", "aria-label": `${j.lettre} : ${j.nb} carte${j.nb > 1 ? "s" : ""}` },
          pastille, el("span", { "aria-hidden": "true" }, j.lettre));
        li.classList.toggle("joue", j.nb > 0);
        li.classList.toggle("aujourdhui", j.aujourdhui);
        li.classList.toggle("futur", j.futur);
        return li;
      })));
  }

  function blocMatieres(liste) {
    const visibles = toutVoir ? liste : liste.slice(0, MATIERES_VISIBLES);
    const bouton = liste.length > MATIERES_VISIBLES
      ? el("button", { class: "f-profil-tout", type: "button", "aria-expanded": String(toutVoir) }, toutVoir ? "Moins" : "Tout voir")
      : null;
    bouton?.addEventListener("click", () => { toutVoir = !toutVoir; rafraichir(); });
    return el("section", { class: "f-profil-bloc", "aria-label": "Tes matières" },
      el("div", { class: "f-profil-bloc-tete" }, el("h2", {}, "Tes matières"), bouton),
      el("ul", { class: "f-profil-matieres" }, ...visibles.map((m) => {
        const rempli = el("span", { class: "f-profil-rempli", "data-matiere": m.id });
        rempli.style.setProperty("--part", `${Math.round((m.faites / m.total) * 100)}%`);
        return el("li", { class: "f-profil-matiere" }, el("span", { class: "f-profil-matiere-nom" }, m.nom),
          el("span", { class: "f-profil-barre", "aria-hidden": "true" }, rempli),
          el("span", { class: "f-profil-matiere-part" }, `${m.faites}/${m.total}`));
      })));
  }

  function rendre() {
    const p = profilCharge();
    const notions = notionsParEtat();
    const allumees = notions.filter((n) => n.etat === "maitrisee").length;
    const roueBtn = el("button", { class: "f-profil-roue", type: "button", "aria-label": "Paramètres" });
    roueBtn.innerHTML = roue;
    roueBtn.addEventListener("click", () => ouvrirParametres());
    const modifier = el("button", { class: "f-profil-modifier", type: "button" }, "Modifier mon profil");
    modifier.disabled = !p;
    modifier.addEventListener("click", () => Profil.ouvrirModifier?.());
    const ligne = [p?.prenom, p?.etablissement, p ? "BUT info 1" : null].filter(Boolean).join(" · ");
    ecran.replaceChildren(el("div", { class: "f-accueil-col f-profil-col" },
      roueBtn,
      el("div", { class: "f-profil-tete" },
        Portail.avatar(p?.avatar, 104),
        el("h1", { class: "f-profil-pseudo" }, p?.pseudo || "…"),
        ligne ? el("p", { class: "f-profil-ligne" }, ligne) : null,
        modifier),
      el("div", { class: "f-profil-stats" },
        stat("vinyles", lireCollection().vinyles, "vinyles"),
        stat("record", lireRecordSurvie(), "record"),
        stat("notions", allumees, "notions")),
      blocSemaine(),
      blocMatieres(matieres(notions))));
  }

  // Paramètres : en attendant leur écran, l'ancienne boîte de réglages
  function ouvrirParametres() { ouvrirReglages(); }

  function rafraichir() { if (estOuvert() && donnees) rendre(); }

  function ouvrir() {
    if (!donnees || fil.classList.contains("verrouille")) return;
    afficherAccueil();   // remet le fil et le fond dans l'état de l'accueil, cache les autres écrans
    if (typeof Portail !== "undefined" && Portail.estOuvert()) return;
    accueil.classList.add("cache");
    toutVoir = false;
    ecran.classList.remove("cache");
    document.body.classList.add("profil-ouvert");
    Nav.afficher("aucun");
    rendre();
    ecran.scrollTo({ top: 0 });
  }

  // Mini-avatar de l'en-tête : celui du compte, ou un rond neutre tant que le profil n'est pas lu
  function majEntete() {
    const p = profilCharge();
    boutonEntete.replaceChildren(p ? Portail.avatar(p.avatar, 36) : el("span", { class: "f-avatar-vide", "aria-hidden": "true" }));
  }
  addEventListener("facettes:profil", () => { majEntete(); rafraichir(); });
  majEntete();

  return { ouvrir, rafraichir, estOuvert, ouvrirParametres, semaine, matieres };
})();
