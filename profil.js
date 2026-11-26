// Facettes — écran Profil : avatar, pseudo, infos, stats, « Cette semaine » et « Tes matières ».
// Ouvert par la mini-avatar de l'en-tête (#btn-reglages) ; la roue mène aux Paramètres.
// Tout ce qui s'affiche vient de l'appareil (résultats, collection, record) sauf le profil, lu par compte.js.
"use strict";

const Profil = (() => {
  const ecran = document.getElementById("profil");
  const LETTRES = ["L", "M", "M", "J", "V", "S", "D"];
  const MATIERES_VISIBLES = 4;
  let toutVoir = false;
  let messageOk = false;   // « Profil mis à jour » au prochain affichage du profil

  const estOuvert = () => !ecran.classList.contains("cache");
  const profilCharge = () => {
    return typeof Compte !== "undefined" ? Compte.profilAffiche() : null;
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


  // Sans profil connu : un rond neutre avec l'initiale de l'e-mail (pas le motif par défaut, qui ressemble au logo)
  function initiale(taille) {
    const lettre = (Compte.utilisateur()?.email || "?").trim().charAt(0).toUpperCase() || "?";
    const a = el("span", { class: "f-avatar f-avatar-initiale", "aria-hidden": "true" }, lettre);
    a.style.setProperty("--taille-avatar", `${taille}px`);
    return a;
  }
  // Avatar encore celui mis par défaut en base : on invite à en choisir un
  function invitation() {
    const b = el("button", { class: "f-profil-invitation", type: "button" }, "Choisis ton avatar : celui-ci est celui par défaut.");
    b.addEventListener("click", () => empiler("modifier"));
    return b;
  }

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
    bouton?.addEventListener("click", () => { toutVoir = !toutVoir; rendre(); });
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

  function rendreProfil() {
    const p = profilCharge();
    const notions = notionsParEtat();
    const allumees = notions.filter((n) => n.etat === "maitrisee").length;
    const modifier = el("button", { class: "f-profil-modifier", type: "button" }, "Modifier mon profil");
    modifier.disabled = !p;
    modifier.addEventListener("click", () => empiler("modifier"));
    const ligne = [p?.prenom, p?.etablissement, p ? "BUT info 1" : null].filter(Boolean).join(" · ");
    const col = el("div", { class: "f-accueil-col f-profil-col" },
      el("div", { class: "f-profil-tete" },
        p ? Portail.avatar(p.avatar, 104) : initiale(104),
        el("h1", { class: "f-profil-pseudo" }, p?.pseudo || "…"),
        ligne ? el("p", { class: "f-profil-ligne" }, ligne) : null,
        modifier,
        p?.avatar === "violet-facette" ? invitation() : null),
      el("div", { class: "f-profil-stats" },
        stat("vinyles", lireCollection().vinyles, "vinyles"),
        stat("record", lireRecordSurvie(), "record"),
        stat("notions", allumees, "notions")),
      blocSemaine(),
      blocMatieres(matieres(notions)));
    if (messageOk) {
      messageOk = false;
      const ok = el("p", { class: "f-profil-ok", role: "status" }, "Profil mis à jour");
      col.querySelector(".f-profil-tete").append(ok);
      setTimeout(() => ok.remove(), 3000);
    }
    return col;
  }

  // ---------- Paramètres : une liste sobre, groupée ----------
  const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  function entete(titre) {
    const retour = el("button", { class: "f-param-retour", type: "button", "aria-label": "Retour" });
    retour.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    retour.addEventListener("click", depiler);
    return el("div", { class: "f-param-haut" }, retour, el("h1", { class: "f-param-titre" }, titre));
  }
  const groupe = (titre, ...lignes) => el("section", { class: "f-param-groupe" },
    titre ? el("h2", {}, titre) : null, el("div", { class: "f-param-carte" }, ...lignes));
  // Une ligne : bouton (action ou sous-page, avec chevron) ou simple texte
  function ligne(cle, libelle, valeur, action, { chevronne = false } = {}) {
    const val = el("span", { class: "f-param-valeur" }, valeur ?? "");
    if (chevronne) val.insertAdjacentHTML("beforeend", chevron);
    if (!action) return el("div", { class: "f-param-ligne", "data-ligne": cle }, el("span", {}, libelle), val);
    const b = el("button", { class: "f-param-ligne", type: "button", "data-ligne": cle }, el("span", {}, libelle), val);
    b.addEventListener("click", action);
    return b;
  }
  // Action sensible : un premier appui demande confirmation pendant 4 s
  function actionConfirmee(cle, libelle, confirmation, faire) {
    const b = el("button", { class: "f-param-ligne f-param-danger", type: "button", "data-action": cle }, libelle);
    let minuteur = null;
    b.addEventListener("click", async () => {
      if (!b.classList.contains("confirmer")) {
        b.classList.add("confirmer");
        b.textContent = confirmation;
        minuteur = setTimeout(() => { b.classList.remove("confirmer"); b.textContent = libelle; }, 4000);
        return;
      }
      clearTimeout(minuteur);
      b.classList.remove("confirmer");
      await faire(b);
    });
    return b;
  }

  const TEXTES_ETAT = { ok: "À jour", synchro: "Synchronisation…", "hors-ligne": "Hors ligne", erreur: "Erreur, touche pour réessayer", deconnecte: "—" };
  const texteEtat = () => TEXTES_ETAT[typeof Compte !== "undefined" ? Compte.etat() : "deconnecte"] || "—";
  const surTotal = (exclus, total) => `${total - exclus} sur ${total}`;

  // Sélecteur segmenté (3 boutons) : effet immédiat, réglage synchronisé comme les autres
  const CHOIX_APPARENCE = {
    theme: [["auto", "Auto"], ["sombre", "Sombre"], ["clair", "Clair"]],
    taille: [["normale", "Aa", "Normale"], ["grande", "Aa", "Grande"], ["tres-grande", "Aa", "Très grande"]],
  };
  function segment(cle, libelle) {
    const boutons = CHOIX_APPARENCE[cle].map(([valeur, texte, nom]) => {
      const b = el("button", { type: "button", "data-valeur": valeur, "aria-pressed": String(reglages.apparence[cle] === valeur),
        ...(nom ? { "aria-label": nom } : {}) }, texte);
      b.addEventListener("click", () => {
        reglages.apparence = { ...reglages.apparence, [cle]: valeur };
        reglages.maj = new Date().toISOString();
        ecrireReglages(reglages);
        Apparence.appliquer(reglages.apparence);
        boutons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      });
      return b;
    });
    return el("div", { class: "f-param-reglage" }, el("span", { class: "f-param-reglage-nom" }, libelle),
      el("div", { class: `f-segment f-segment-${cle}`, role: "group", "aria-label": libelle }, ...boutons));
  }

  // Confidentialité : seulement si le profil lu du serveur contient les deux réglages (base migrée)
  const REGLAGES_CONFIDENTIALITE = [
    ["visible_classement", "Apparaître dans le classement", "Tes amis te voient toujours."],
    ["demandes_amis", "Recevoir des demandes d'ami", "Sinon, personne ne peut te trouver par ton pseudo."],
  ];
  function rendreConfidentialite(message) {
    const p = Compte.profilAffiche();
    if (!p || REGLAGES_CONFIDENTIALITE.some(([cle]) => typeof p[cle] !== "boolean")) return null;
    const inters = REGLAGES_CONFIDENTIALITE.map(([cle, nom, note]) => {
      const b = el("button", { class: "f-param-ligne f-param-inter", type: "button", role: "switch", "data-id": cle,
        "aria-checked": String(p[cle]) },
        el("span", { class: "f-param-nom f-param-nom-note" }, nom, el("span", { class: "f-param-note" }, note)),
        el("span", { class: "f-param-curseur", "aria-hidden": "true" }));
      b.addEventListener("click", async () => {
        if (b.disabled) return;
        const avant = b.getAttribute("aria-checked") === "true";
        b.setAttribute("aria-checked", String(!avant));   // bascule tout de suite, annulée si l'envoi échoue
        b.disabled = true;
        message.textContent = "";
        try { await Compte.enregistrerConfidentialite({ [cle]: !avant }); }
        catch { b.setAttribute("aria-checked", String(avant)); message.textContent = "Pas enregistré : vérifie ta connexion."; }
        finally { b.disabled = false; }
      });
      return b;
    });
    return el("section", { class: "f-param-groupe f-param-confidentialite" }, el("h2", {}, "Confidentialité"),
      el("div", { class: "f-param-carte" }, ...inters));
  }

  function rendreParametres() {
    const message = el("p", { class: "f-param-message", role: "status" });
    const nbFormats = Object.keys(NOMS_FORMATS).length;
    const exclusMatieres = donnees.matieres.filter((m) => reglages.matieresExclues.includes(m.id)).length;
    const exclusFormats = Object.keys(NOMS_FORMATS).filter((f) => reglages.formatsExclus.includes(f)).length;
    const surErreur = (err) => { message.textContent = Compte.messageErreur(err); };
    const effacer = actionConfirmee("effacer", "Effacer ma progression", "Confirmer : tout effacer", (b) => {
      effacerProgression();
      b.textContent = "Progression effacée";
    });
    const supprimer = actionConfirmee("supprimer", "Supprimer mon compte", "Confirmer : supprimer le compte", async (b) => {
      b.disabled = true;
      try { await Compte.supprimer(); } catch (err) { b.disabled = false; b.textContent = "Supprimer mon compte"; surErreur(err); }
    });
    const deconnecter = el("button", { class: "f-param-ligne", type: "button", "data-action": "deconnecter" }, "Se déconnecter");
    deconnecter.addEventListener("click", () => Compte.deconnecter().catch(surErreur));
    navigator.serviceWorker?.controller?.postMessage("version");
    return el("div", { class: "f-accueil-col f-param-col" },
      entete("Paramètres"),
      el("section", { class: "f-param-groupe" }, el("h2", {}, "Apparence"),
        el("div", { class: "f-param-carte f-param-apparence" }, segment("theme", "Thème"), segment("taille", "Taille de l'affichage"))),
      groupe("Jeu",
        ligne("matieres", "Matières", surTotal(exclusMatieres, donnees.matieres.length), () => empiler("matieres"), { chevronne: true }),
        ligne("formats", "Types de jeux", exclusFormats ? surTotal(exclusFormats, nbFormats) : "Tous", () => empiler("formats"), { chevronne: true })),
      rendreConfidentialite(message),
      groupe("Compte",
        ligne("email", "E-mail", Compte.utilisateur()?.email || "—"),
        ligne("sync", "Synchronisation", texteEtat(), () => Compte.synchroniser()),
        ligne("donnees", "Tes données et export", null, () => Donnees.ouvrir(), { chevronne: true })),
      groupe(null, deconnecter),
      message,
      el("section", { class: "f-param-groupe f-param-sensible" }, el("h2", {}, "Zone sensible"),
        el("div", { class: "f-param-carte" }, effacer, supprimer),
        el("p", { class: "f-param-note" }, "Supprimer le compte efface ta progression, en ligne et sur cet appareil.")),
      el("p", { class: "f-param-version", id: "version" }, versionAppli ? `Version ${versionAppli}` : "Version inconnue (hors ligne ou premier lancement)"));
  }

  // Matières ou types de jeux : un interrupteur par élément ; le dernier actif ne se coupe pas (le fil serait vide)
  function rendreInterrupteurs(titre, intro, elements, exclus) {
    const inters = elements.map(({ id, nom, matiere }) => {
      const b = el("button", { class: "f-param-ligne f-param-inter", type: "button", role: "switch", "data-id": id,
        "aria-checked": String(!exclus.includes(id)) },
        matiere ? el("span", { class: "f-param-pastille", "data-matiere": id, "aria-hidden": "true" }) : null,
        el("span", { class: "f-param-nom" }, nom), el("span", { class: "f-param-curseur", "aria-hidden": "true" }));
      b.addEventListener("click", () => {
        const devient = b.getAttribute("aria-checked") !== "true";
        if (!devient && inters.filter((x) => x.getAttribute("aria-checked") === "true").length === 1) {
          b.classList.remove("secoue"); void b.offsetWidth; b.classList.add("secoue");
          return;
        }
        b.setAttribute("aria-checked", String(devient));
        basculerDans(exclus, id, devient);
        reglages.maj = new Date().toISOString();
        ecrireReglages(reglages);
        reglagesModifies = true;
      });
      return b;
    });
    return el("div", { class: "f-accueil-col f-param-col" },
      entete(titre), el("p", { class: "f-param-intro" }, intro), el("div", { class: "f-param-carte" }, ...inters));
  }

  // ---------- Pile d'écrans : profil → paramètres → matières | formats ; profil → modifier ----------
  let pile = ["profil"];
  const RENDUS = {
    profil: rendreProfil,
    parametres: rendreParametres,
    matieres: () => rendreInterrupteurs("Matières", "Les cartes des matières coupées ne sortent plus dans tes sessions.",
      donnees.matieres.map((m) => ({ id: m.id, nom: m.nom, matiere: true })), reglages.matieresExclues),
    formats: () => rendreInterrupteurs("Types de jeux", "Les jeux coupés ne sortent plus dans tes sessions.",
      Object.entries(NOMS_FORMATS).map(([id, nom]) => ({ id, nom })), reglages.formatsExclus),
    modifier: () => rendreModifier(),
  };
  function rendre() {
    if (!estOuvert()) return;   // ex. un enregistrement fini après qu'on est parti ailleurs : on ne reprend pas la main
    const haut = pile[pile.length - 1];
    ecran.dataset.vue = haut;
    document.body.classList.toggle("vue-profil", haut === "profil");   // roue des Paramètres de l'en-tête
    Nav.afficher(haut === "profil" ? "profil" : null);
    ecran.replaceChildren(RENDUS[haut]());
    ecran.scrollTo({ top: 0 });
  }
  function empiler(vue) { pile.push(vue); rendre(); }
  function depiler() { if (pile.length > 1) pile.pop(); rendre(); }

  // Une synchro ou un nouveau profil : on redessine, sauf le formulaire en cours de saisie
  function rafraichir() { if (estOuvert() && donnees && pile[pile.length - 1] !== "modifier") rendre(); }

  function ouvrir() {
    if (!donnees || fil.classList.contains("verrouille")) return;
    afficherAccueil();   // remet le fil et le fond dans l'état de l'accueil, cache les autres écrans
    if (typeof Portail !== "undefined" && Portail.estOuvert()) return;
    accueil.classList.add("cache");
    toutVoir = false;
    pile = ["profil"];
    ecran.classList.remove("cache");
    rendre();
  }
  function ouvrirParametres() {
    ouvrir();
    if (estOuvert()) empiler("parametres");
  }

  // « Modifier mon profil » : le formulaire du portail, prérempli ; le parcours ne se change pas (un seul)
  function rendreModifier() {
    const p = profilCharge() || {};
    const formulaire = Portail.formulaireProfil({ valeurs: p, prefixe: "profil", surValider: async (infos) => {
      await Compte.enregistrerProfil({ ...infos, parcours: p.parcours || "but-info-1" });
      messageOk = true;
      depiler();
    } });
    // Gros bouton sous le pouce, comme « C'est parti » du portail ; l'erreur s'affiche juste au-dessus
    const enregistrer = el("button", { class: "f-lancer-session f-modifier-enregistrer", type: "button" },
      el("span", { class: "f-lancer-texte" }, el("b", {}, "Enregistrer")));
    enregistrer.addEventListener("click", async () => {
      enregistrer.disabled = true;   // un double appui n'envoie qu'une fois
      try { await formulaire.valider(); } finally { enregistrer.disabled = false; }
    });
    return el("div", { class: "f-accueil-col f-param-col f-modifier-col" },
      entete("Modifier mon profil"),
      formulaire.element,
      el("p", { class: "f-param-note" }, "Parcours : BUT informatique · 1re année"),
      formulaire.message,
      enregistrer);
  }

  // La ligne « Synchronisation » suit l'état du compte sans redessiner l'écran (confirmations en cours gardées)
  addEventListener("facettes:etat", () => {
    const valeur = ecran.querySelector('[data-ligne="sync"] .f-param-valeur');
    if (valeur) valeur.textContent = texteEtat();
  });

  addEventListener("facettes:profil", rafraichir);
  document.getElementById("btn-parametres").addEventListener("click", () => { if (estOuvert()) empiler("parametres"); });

  return { ouvrir, rafraichir, estOuvert, ouvrirParametres, empiler, depiler, semaine, matieres };
})();
