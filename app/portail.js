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

  // --- Avatar : une couleur Facettes et un symbole blanc (public, comme le pseudo)
  const COULEURS = { orange: "#FF6B3D", jaune: "#FFC21A", vert: "#00C08B", bleu: "#3D5AFE", violet: "#7B4DFF", rose: "#FF5FA2", cyan: "#2FD3E0" };
  const SYMBOLES = {
    facette: '<rect x="7" y="7" width="10" height="10" rx="2.2" transform="rotate(15 12 12)"/>',
    etoile: '<polygon points="12,3 14.6,9 21,9.3 16,13.4 17.8,20 12,16.3 6.2,20 8,13.4 3,9.3 9.4,9"/>',
    note: '<circle cx="8.5" cy="17" r="3"/><rect x="10" y="4" width="2.2" height="13"/><path d="M12.2 4l6.8 2.2v3.2l-6.8-2.2z"/>',
    eclair: '<polygon points="13.5,2 5,13.5 11,13.5 10,22 19,10 13,10"/>',
    coeur: '<path d="M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z"/>',
    vinyle: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="12" cy="12" r="2.6"/>',
  };
  const FORMAT_AVATAR = /^(orange|jaune|vert|bleu|violet|rose|cyan)-(facette|etoile|note|eclair|coeur|vinyle)$/;
  function avatar(code, taille = 40) {
    if (!FORMAT_AVATAR.test(code || "")) code = "violet-facette";
    const [couleur, symbole] = code.split("-");
    const a = el("span", { class: "f-avatar", "data-avatar": code, "aria-hidden": "true" });
    a.style.setProperty("--avatar", COULEURS[couleur]);
    a.style.setProperty("--taille-avatar", `${taille}px`);
    a.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">${SYMBOLES[symbole]}</svg>`;
    return a;
  }

  // --- Vérification locale des infos (mêmes formats qu'en base) ; {} = tout est bon
  const FORMAT_PRENOM = /^\p{L}[\p{L} '-]{0,29}$/u;
  // iOS remplace ' par ’ et peut décomposer les accents : on ramène tout à la forme attendue par la base
  const normaliser = (s) => String(s || "").normalize("NFC").replace(/[\u2018\u2019\u02bc]/g, "'").trim();
  function verifierInfos({ pseudo = "", prenom = "", etablissement = "" }) {
    const erreurs = {};
    pseudo = normaliser(pseudo); prenom = normaliser(prenom); etablissement = normaliser(etablissement);
    const p = typeof Compte !== "undefined" ? Compte.messagePseudo(pseudo.trim()) : null;
    if (p) erreurs.pseudo = p;
    if (prenom.trim() && !FORMAT_PRENOM.test(prenom.trim())) erreurs.prenom = "Lettres, espaces, ' et - : 30 caractères au plus.";
    const e = etablissement.trim();
    if (e && (e.length < 2 || e.length > 60 || /[\u0000-\u001f\u007f<>]/.test(e))) erreurs.etablissement = "2 à 60 caractères, sans < ni >.";
    return erreurs;
  }

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

  // Formulaire de profil (avatar, pseudo, prénom, établissement) : étape 3 du portail et « Modifier mon profil ».
  // valeurs : préremplissage (avatar absent ou invalide → couleur et symbole au hasard).
  // valider() vérifie, affiche les erreurs et appelle surValider(infos) ; le message d'erreur général est à placer.
  function formulaireProfil({ valeurs = {}, prefixe = "portail", surValider }) {
    const hasard = (liste) => liste[Math.floor(Math.random() * liste.length)];
    let [couleur, symbole] = FORMAT_AVATAR.test(valeurs.avatar || "") ? valeurs.avatar.split("-")
      : [hasard(Object.keys(COULEURS)), hasard(Object.keys(SYMBOLES))];
    const apercu = el("div", { class: "f-portail-apercu" });
    const majApercu = () => {
      apercu.replaceChildren(avatar(`${couleur}-${symbole}`, 64));
      couleurs.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.couleur === couleur)));
      symboles.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.symbole === symbole)));
    };
    const couleurs = Object.entries(COULEURS).map(([id]) => {
      const b = el("button", { class: "f-portail-couleur", type: "button", "data-couleur": id, "aria-label": `Couleur ${id}` });
      b.style.setProperty("--avatar", COULEURS[id]);
      b.addEventListener("click", () => { couleur = id; majApercu(); });
      return b;
    });
    const symboles = Object.keys(SYMBOLES).map((id) => {
      const b = el("button", { class: "f-portail-symbole", type: "button", "data-symbole": id, "aria-label": `Symbole ${id}` });
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${SYMBOLES[id]}</svg>`;
      b.addEventListener("click", () => { symbole = id; majApercu(); });
      return b;
    });
    const champ = (nom, libelle, attrs = {}) => {
      const entree = el("input", { id: `${prefixe}-${nom}`, type: "text", autocomplete: "off", spellcheck: "false", ...attrs });
      entree.value = valeurs[nom] || "";
      return el("label", { class: "f-portail-champ", for: `${prefixe}-${nom}` }, el("span", {}, libelle),
        entree, el("small", { class: "f-portail-erreur", "data-champ": nom }));
    };
    const message = el("p", { class: "f-portail-message", "aria-live": "polite" });
    const element = el("div", { class: "f-profil-form" },
      champ("pseudo", "Pseudo (visible des autres joueurs)", { maxlength: "20", autocapitalize: "off" }),
      el("div", { class: "f-portail-avatar" }, apercu,
        el("div", { class: "f-portail-choix" }, el("div", { class: "f-portail-couleurs" }, ...couleurs), el("div", { class: "f-portail-symboles" }, ...symboles))),
      champ("prenom", "Prénom (facultatif)", { maxlength: "30", autocomplete: "given-name" }),
      champ("etablissement", "Établissement ou ville (facultatif)", { maxlength: "60" }),
      el("p", { class: "f-discret f-portail-prive" }, "Privé : prénom et établissement ne sont jamais montrés aux autres."));
    majApercu();

    async function valider() {
      const val = (nom) => normaliser(element.querySelector(`#${prefixe}-${nom}`).value);
      const infos = { pseudo: val("pseudo"), prenom: val("prenom"), etablissement: val("etablissement") };
      const erreurs = verifierInfos(infos);
      element.querySelectorAll(".f-portail-erreur").forEach((s) => { s.textContent = erreurs[s.dataset.champ] || ""; });
      message.textContent = "";
      if (Object.keys(erreurs).length) return;
      try {
        await surValider({ ...infos, avatar: `${couleur}-${symbole}` });
      } catch (err) {
        if (err?.messageAffiche && /pseudo|Déjà pris|caractères/i.test(err.messageAffiche)) element.querySelector('[data-champ="pseudo"]').textContent = err.messageAffiche;
        else message.textContent = navigator.onLine === false || /fetch|network|load failed/i.test(err?.message || "")
          ? "Pas de connexion, réessaie." : (err?.messageAffiche || `Ça n'a pas marché (${err?.message || "erreur inconnue"}).`);
      }
    }
    return { element, message, valider };
  }

  function etapeInfos() {
    const formulaire = formulaireProfil({ surValider: async (infos) => {
      let parcours = "but-info-1";
      try { parcours = localStorage.getItem(CLE_PARCOURS) || parcours; } catch { /* défaut */ }
      await Compte.enregistrerProfil({ ...infos, parcours });
      fermer();
    } });
    const valider = el("button", { class: "f-lancer-session f-portail-valider", type: "button" },
      el("span", { class: "f-lancer-texte" }, el("b", {}, "C'est parti")));
    valider.addEventListener("click", async () => {
      valider.disabled = true;
      try { await formulaire.valider(); } finally { valider.disabled = false; }
    });
    return cadre(3, "Présente-toi", formulaire.element, valider, formulaire.message);
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
    if (sessionGardee()) {
      if (etape === 3) return;   // compte sans profil : on reste sur « Présente-toi »
      if (estOuvert()) fermer(); else afficherAccueil();
      return;
    }
    if (navigator.onLine === false) { horsLigne(); return; }
    ouvrir(1);
  }

  // Connexion réussie à l'étape 2 : on attend la lecture du profil (première synchro)
  // Profil connu après la synchro : étape 3 s'il n'existe pas, sinon l'appli ; inconnu : rien (on réessaiera)
  function suiteSelonProfil() {
    if (typeof Compte === "undefined" || !Compte.utilisateur()) return false;
    if (Compte.profil() === null) { if (etape !== 3) ouvrir(3); return true; }
    if (Compte.profil() && estOuvert() && etape !== 3) { fermer(); return true; }
    return false;
  }
  addEventListener("facettes:connexion", () => {
    if (!estOuvert() || etape !== 2) return;
    if (typeof Compte !== "undefined") Compte.afficherDans(null);   // le panneau du compte ne s'affiche pas ici
    const message = el("p", { class: "f-arbre-intro" }, "Connexion réussie, un instant…");
    const relancer = el("button", { class: "f-option f-portail-relancer cache", type: "button" }, "Réessayer");
    relancer.addEventListener("click", async () => {
      relancer.disabled = true;
      message.textContent = "Un instant…";
      await Compte.synchroniser();
      relancer.disabled = false;
      if (!suiteSelonProfil()) message.textContent = "Le serveur ne répond pas. Vérifie ta connexion puis réessaie.";
    });
    ecran.querySelector(".f-portail-compte")?.replaceChildren(message, relancer);
    ecran.querySelector(".f-portail-retour")?.remove();
    setTimeout(() => { if (estOuvert() && etape === 2) relancer.classList.remove("cache"); }, 8000);
  });
  addEventListener("facettes:synchro", suiteSelonProfil);
  // Déconnexion ou suppression du compte : retour au début
  addEventListener("facettes:deconnexion", () => ouvrir(1));

  return { decider, ouvrir, fermer, estOuvert, avatar, verifierInfos, formulaireProfil };
})();
