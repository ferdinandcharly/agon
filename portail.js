// Facettes — portail d'accueil obligatoire : 1. Parcours → 2. Compte (code par e-mail) → 3. Infos sur toi.
// Sans session gardée sur l'appareil, rien d'autre n'est atteignable (CSS body.portail-ouvert + gardes dans app.js).
// La progression locale n'est pas touchée : elle rejoint le compte à la première synchro.
"use strict";

const Portail = (() => {
  const ecran = document.getElementById("portail");
  const CLE_PARCOURS = "agon.parcours";
  const PARCOURS = [
    { id: "but-info-1", nom: "BUT informatique", detail: "1re année" },
    { id: null, nom: "BUT informatique", detail: "2e année · bientôt" },
    { id: null, nom: "Autres formations", detail: "bientôt" },
  ];
  let etape = null;

  const sessionGardee = () => { try { return !!localStorage.getItem("agon.session"); } catch { return false; } };
  const estOuvert = () => !ecran.classList.contains("cache");

  function montrer() {
    ecran.classList.remove("cache");
    document.body.classList.add("portail-ouvert");
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    Nav.afficher(null);
  }
  function fermer() {
    ecran.classList.add("cache");
    document.body.classList.remove("portail-ouvert");
    etape = null;
    afficherAccueil();
  }

  // Cadre commun : indicateur 1 · 2 · 3, titre, contenu
  function cadre(n, titre, ...contenu) {
    const indicateur = el("ol", { class: "f-portail-etapes", "aria-label": `Étape ${n} sur 3` },
      ...[1, 2, 3].map((i) => el("li", { class: i === n ? "actuelle" : i < n ? "faite" : "", "aria-hidden": "true" }, String(i))));
    return el("div", { class: "f-accueil-col f-portail-col", "data-etape": String(n) },
      indicateur, el("h1", { class: "f-accueil-titre" }, titre), ...contenu);
  }

  function etapeParcours() {
    const cartes = PARCOURS.map((p) => p.id
      ? el("button", { class: "f-portail-parcours", type: "button", "data-parcours": p.id, "aria-pressed": "true" },
          el("b", {}, p.nom), el("span", {}, p.detail))
      : el("button", { class: "f-portail-parcours", type: "button", "aria-disabled": "true", tabindex: "-1" },
          el("b", {}, p.nom), el("span", {}, p.detail)));
    const continuer = el("button", { class: "f-lancer-session f-portail-continuer", type: "button" },
      el("span", { class: "f-lancer-texte" }, el("b", {}, "Continuer")));
    continuer.addEventListener("click", () => {
      try { localStorage.setItem(CLE_PARCOURS, "but-info-1"); } catch { /* défaut au moment du profil */ }
      ouvrir(2);
    });
    return cadre(1, "Tu révises quoi ?", el("div", { class: "f-portail-cartes" }, ...cartes), continuer);
  }

  function etapeCompte() {
    const zone = el("div", { class: "f-compte f-portail-compte" });
    const retour = el("button", { class: "f-portail-retour", type: "button" }, "← Retour");
    retour.addEventListener("click", () => ouvrir(1));
    const contenu = cadre(2, "Crée ton compte",
      el("p", { class: "f-arbre-intro" }, "Pas de mot de passe : tu reçois un code par e-mail."), zone, retour);
    if (typeof Compte !== "undefined") Compte.afficherDans(zone);
    return contenu;
  }

  // Remplie par la tâche « Présente-toi »
  function etapeInfos() {
    return cadre(3, "Présente-toi", el("p", { class: "f-arbre-intro" }, "Chargement…"));
  }

  function ouvrir(n) {
    etape = n;
    montrer();
    ecran.replaceChildren(n === 1 ? etapeParcours() : n === 2 ? etapeCompte() : etapeInfos());
    ecran.scrollTo({ top: 0 });
  }

  function horsLigne() {
    etape = null;
    montrer();
    const reessayer = el("button", { class: "f-option f-portail-reessayer", type: "button" }, "Réessayer");
    reessayer.addEventListener("click", decider);
    ecran.replaceChildren(el("div", { class: "f-accueil-col f-portail-col" },
      el("h1", { class: "f-accueil-titre" }, "Bienvenue sur Facettes"),
      el("p", { class: "f-arbre-intro f-portail-horsligne" }, "Connecte-toi à Internet pour créer ton compte."), reessayer));
  }

  // Au démarrage (et sur « Réessayer ») : session gardée → l'appli ; sinon le portail
  function decider() {
    if (sessionGardee()) { if (estOuvert()) fermer(); else afficherAccueil(); return; }
    if (navigator.onLine === false) { horsLigne(); return; }
    ouvrir(1);
  }

  // Connexion réussie à l'étape 2 : on attend la lecture du profil (première synchro)
  addEventListener("facettes:connexion", () => {
    if (!estOuvert() || etape !== 2) return;
    const zone = ecran.querySelector(".f-portail-compte");
    zone?.replaceChildren(el("p", { class: "f-arbre-intro" }, "Connexion réussie, un instant…"));
    ecran.querySelector(".f-portail-retour")?.remove();
  });
  addEventListener("facettes:synchro", () => {
    if (typeof Compte === "undefined" || !Compte.utilisateur()) return;
    if (Compte.profil() === null) { if (etape !== 3) ouvrir(3); }
    else if (Compte.profil() && estOuvert() && etape !== 3) fermer();
  });
  // Déconnexion ou suppression du compte : retour au début
  addEventListener("facettes:deconnexion", () => ouvrir(1));

  return { decider, ouvrir, fermer, estOuvert };
})();
