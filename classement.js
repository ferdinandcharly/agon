// Facettes — écran « Classement » du mode Survie : « Cette semaine » (depuis lundi) et « Record ».
// Les données viennent de la fonction public.classement (rang, pseudo, score, moi : rien d'autre).
// Le dernier classement reçu est gardé (agon.classement) pour l'afficher hors ligne.
"use strict";

const Classement = (() => {
  const ecran = document.getElementById("classement");
  const CLE = "agon.classement";
  const NB = " ";
  const PERIODES = { semaine: "Cette semaine", record: "Record" };
  let periode = "semaine";

  // Lundi 0 h de la semaine en cours (heure de l'appareil), en ISO : sert à reconnaître un cache périmé
  function lundiCourant() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString();
  }

  function lireCache() {
    try { const v = JSON.parse(localStorage.getItem(CLE)); return v && typeof v === "object" ? v : {}; } catch { return {}; }
  }
  function ecrireCache(p, lignes) {
    const cache = lireCache();
    cache[p] = { lignes, date: new Date().toISOString(), ...(p === "semaine" ? { debut: lundiCourant() } : {}) };
    try { localStorage.setItem(CLE, JSON.stringify(cache)); } catch { /* tant pis */ }
  }

  const dateCourte = (iso) => new Date(iso).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" });
  const rangTexte = (r) => (r === 1 ? "1re" : `${r}e`);

  // Rendu pur : bandeau éventuel + liste. Rangs 1 à 3 : podium ; ta ligne mise en avant, précédée de « … » si hors du top 50.
  function rendre(lignes, { periode: p = "semaine", date = null, debut = null, horsLigne = false } = {}) {
    const morceaux = [];
    const notes = [];
    if (horsLigne && date) notes.push(`Hors ligne${NB}: classement du ${dateCourte(date)}`);
    if (p === "semaine" && debut && debut !== lundiCourant()) notes.push("(semaine dernière)");
    if (notes.length) morceaux.push(el("p", { class: "f-classement-bandeau" }, notes.join(" ")));
    if (!lignes.length) {
      morceaux.push(el("p", { class: "f-classement-vide" },
        p === "semaine" ? `Personne n'a encore joué cette semaine. À toi${NB}!` : `Pas encore de record. À toi${NB}!`));
      return el("div", { class: "f-classement-rendu" }, ...morceaux);
    }
    const liste = el("ol", { class: "f-classement-liste" });
    for (const l of lignes) {
      if (l.moi && l.rang > 50) liste.append(el("li", { class: "f-classement-sep", "aria-hidden": "true" }, "…"));
      const podium = ["or", "rose", "bleu"][l.rang - 1];
      liste.append(el("li", { class: ["f-classement-ligne", podium, l.moi ? "moi" : ""].filter(Boolean).join(" ") },
        el("span", { class: "f-classement-rang" }, String(l.rang)),
        el("span", { class: "f-classement-pseudo" }, Portail.avatar(l.avatar, 30),
          el("span", { class: "f-classement-nom" }, l.pseudo, l.moi ? el("small", {}, " (toi)") : null)),
        el("span", { class: "f-classement-score" }, String(l.score))));
    }
    morceaux.push(liste);
    return el("div", { class: "f-classement-rendu" }, ...morceaux);
  }

  const zone = () => ecran.querySelector(".f-classement-zone");

  function invitation(texte) {
    return el("div", { class: "f-classement-invitation" },
      el("p", {}, texte),
      el("button", { class: "f-option f-classement-connexion", type: "button", onclick: ouvrirReglages }, "Ouvrir mon compte"));
  }

  // Charge l'onglet courant : en ligne → la base (et le cache) ; sinon → le cache s'il existe
  async function charger() {
    const sb = typeof Compte !== "undefined" ? Compte.client() : null;
    const utilisateur = typeof Compte !== "undefined" ? Compte.utilisateur() : null;
    if (!sb || !utilisateur) { zone().replaceChildren(invitation("Connecte-toi pour apparaître dans le classement.")); return; }
    const depuisCache = () => {
      const c = lireCache()[periode];
      zone().replaceChildren(c ? rendre(c.lignes, { periode, date: c.date, debut: c.debut, horsLigne: true })
        : el("p", { class: "f-classement-vide" }, "Classement indisponible hors ligne."));
    };
    if (navigator.onLine === false) { depuisCache(); return; }
    if (Compte.profil() === undefined) {   // pas encore lu : on attend la synchro au lieu de demander un pseudo
      zone().replaceChildren(el("p", { class: "f-classement-vide" }, "Chargement…"));
      await Compte.synchroniser();
      if (Compte.profil() === undefined) { depuisCache(); return; }
    }
    if (!Compte.profil()) { zone().replaceChildren(invitation("Choisis un pseudo pour apparaître dans le classement.")); return; }
    zone().replaceChildren(el("p", { class: "f-classement-vide" }, "Chargement…"));
    const demande = periode;
    const { data, error } = await sb.rpc("classement", { periode: demande });
    if (demande !== periode) return;   // l'onglet a changé entre-temps
    if (!error) { ecrireCache(demande, data); zone().replaceChildren(rendre(data, { periode: demande })); return; }
    if (estErreurReseau(error)) { depuisCache(); return; }
    zone().replaceChildren(el("div", { class: "f-classement-invitation" },
      el("p", {}, `Le classement n'a pas pu être chargé (${error.message}).`),
      el("button", { class: "f-option", type: "button", onclick: charger }, "Réessayer")));
  }

  // Erreur de connexion (Chrome : « Failed to fetch », Safari : « Load failed ») plutôt qu'un refus du serveur
  function estErreurReseau(erreur) {
    return navigator.onLine === false || /fetch|network|load failed/i.test(erreur?.message || "");
  }

  // Après un passage dans les réglages (connexion, pseudo) : l'écran reflète le nouvel état
  function recharger() { if (!ecran.classList.contains("cache")) charger(); }

  function ouvrir(p = "semaine") {
    if (fil.classList.contains("verrouille")) return;   // pas pendant une partie en cours
    periode = p;
    afficherAccueil();   // remet le fil et la couleur de fond dans l'état de l'accueil
    accueil.classList.add("cache");
    const onglets = el("div", { class: "f-classement-onglets", role: "tablist" },
      ...Object.entries(PERIODES).map(([id, nom]) => {
        const b = el("button", { class: "f-classement-onglet", type: "button", role: "tab", "aria-selected": String(id === periode) }, nom);
        b.addEventListener("click", () => {
          periode = id;
          onglets.querySelectorAll("[role=tab]").forEach((o) => o.setAttribute("aria-selected", String(o === b)));
          charger();
        });
        return b;
      }));
    ecran.replaceChildren(el("div", { class: "f-accueil-col" },
      el("h1", { class: "f-accueil-titre" }, "Classement"),
      el("p", { class: "f-arbre-intro" }, "Mode survie, toutes les matières. Ton meilleur score compte."),
      onglets,
      el("div", { class: "f-classement-zone", role: "tabpanel", "aria-live": "polite" })));
    ecran.classList.remove("cache");
    Nav.afficher("aucun");
    ecran.scrollTo({ top: 0 });
    charger();
  }

  // Pour la fin de Survie : ta place cette semaine, ou null (sans compte, sans pseudo, hors ligne)
  async function rangCetteSemaine() {
    const sb = typeof Compte !== "undefined" ? Compte.client() : null;
    if (!sb || !Compte.utilisateur() || !Compte.profil() || navigator.onLine === false) return null;
    const { data, error } = await sb.rpc("classement", { periode: "semaine" });
    if (error) return null;
    ecrireCache("semaine", data);
    return data.find((l) => l.moi)?.rang ?? null;
  }

  return { ouvrir, recharger, rendre, lundiCourant, rangCetteSemaine, rangTexte, estErreurReseau };
})();
