// Agon — étape 1 : fil vertical + les 6 formats, contenus écrits à la main (data/contenus.json).
// Pas encore de compte ni de Supabase : les résultats restent dans ce navigateur (localStorage).
"use strict";

const NOMS_FORMATS = {
  fiche: "Fiche",
  vrai_faux: "Vrai ou faux",
  trous: "Texte à trous",
  associer: "Associer",
  ordre: "Remettre dans l'ordre",
  erreur: "Trouve l'erreur",
};
const JEUX_PAR_FICHE = 2;   // rythme du fil : une fiche, puis deux jeux, etc.
const CLE_RESULTATS = "agon.resultats";

const fil = document.getElementById("fil");
const zoneScore = document.getElementById("score");
let donnees = null;
const session = { joues: 0, reussis: 0 };

// ---------- Outils ----------

// Crée un élément : el("p", { class: "x" }, "texte", autreElement). Le texte passe toujours par textContent.
function el(balise, attributs = {}, ...enfants) {
  const noeud = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(attributs)) {
    if (cle === "onclick") noeud.addEventListener("click", valeur);
    else noeud.setAttribute(cle, valeur);
  }
  for (const enfant of enfants) {
    if (enfant == null) continue;
    noeud.append(typeof enfant === "string" ? document.createTextNode(enfant) : enfant);
  }
  return noeud;
}

function melanger(liste) {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

// Mélange en évitant de rendre la liste dans son ordre d'origine (sinon le jeu « ordre » est déjà résolu)
function melangerVraiment(liste) {
  // Éléments tous identiques : aucun mélange ne peut changer l'ordre (sinon boucle infinie)
  if (new Set(liste).size < 2) return [...liste];
  let resultat;
  let essais = 0;
  do { resultat = melanger(liste); } while (resultat.every((x, i) => x === liste[i]) && ++essais < 20);
  return resultat;
}

// localStorage peut être indisponible (navigation privée, données bloquées) : l'appli marche quand même
function lireResultats() {
  try {
    const valeur = JSON.parse(localStorage.getItem(CLE_RESULTATS));
    return valeur && typeof valeur === "object" && !Array.isArray(valeur) ? valeur : {};
  } catch { return {}; }
}
function enregistrerResultat(id, reussi) {
  const resultats = lireResultats();
  const r = resultats[id] || { vu: 0, ok: 0, ko: 0 };
  r.vu++;
  if (reussi === true) r.ok++;
  if (reussi === false) r.ko++;
  r.dernier = new Date().toISOString();
  resultats[id] = r;
  try { localStorage.setItem(CLE_RESULTATS, JSON.stringify(resultats)); } catch { /* tant pis */ }
}

function afficherScore() {
  zoneScore.textContent = `${session.reussis}/${session.joues}`;
  zoneScore.setAttribute("aria-label", `${session.reussis} réussis sur ${session.joues}`);
  zoneScore.classList.toggle("cache", !session.joues);
}

// ---------- Validation ----------
// Les contenus seront bientôt générés par une IA : une carte mal formée est écartée (avec un
// avertissement en console) au lieu de casser tout le fil ou de donner un jeu impossible à finir.
const estTexte = (x) => typeof x === "string" && x.trim() !== "";
const listeDeTextes = (x, min) => Array.isArray(x) && x.length >= min && x.every(estTexte);

const VALIDATEURS = {
  fiche: (d) => estTexte(d.titre) && listeDeTextes(d.paragraphes, 1),
  vrai_faux: (d) => estTexte(d.affirmation) && typeof d.reponse === "boolean",
  trous: (d) => estTexte(d.texte) && d.texte.split("___").length === 2
    && listeDeTextes(d.choix, 2) && d.choix.includes(d.reponse) && new Set(d.choix).size === d.choix.length,
  associer: (d) => Array.isArray(d.paires) && d.paires.length >= 2
    && d.paires.every((p) => Array.isArray(p) && p.length === 2 && p.every(estTexte))
    && new Set(d.paires.map((p) => p[0])).size === d.paires.length
    && new Set(d.paires.map((p) => p[1])).size === d.paires.length,
  ordre: (d) => listeDeTextes(d.etapes, 2) && new Set(d.etapes).size === d.etapes.length,
  erreur: (d) => Array.isArray(d.lignes) && d.lignes.length >= 2 && d.lignes.every((l) => typeof l === "string")
    && Number.isInteger(d.ligne_fausse) && d.ligne_fausse >= 0 && d.ligne_fausse < d.lignes.length,
};

function contenuValide(c) {
  const ok = c && estTexte(c.id) && c.donnees && typeof c.donnees === "object"
    && VALIDATEURS[c.format]?.(c.donnees);
  if (!ok) console.warn("Carte écartée (format ou données invalides) :", c?.id ?? c);
  return Boolean(ok);
}

// ---------- Ordre du fil ----------
// Une fiche puis quelques jeux (au moins JEUX_PAR_FICHE, plus s'il y a beaucoup de jeux, pour ne pas
// les entasser en fin de fil). On évite deux cartes de suite de la même matière ou du même format.
function ordonner(contenus) {
  const fiches = melanger(contenus.filter((c) => c.format === "fiche"));
  const jeux = melanger(contenus.filter((c) => c.format !== "fiche"));
  const rythme = Math.max(JEUX_PAR_FICHE, Math.ceil(jeux.length / Math.max(fiches.length, 1)));
  const fil = [];
  let jeuxDepuisFiche = rythme;
  while (fiches.length || jeux.length) {
    const veutFiche = (jeuxDepuisFiche >= rythme && fiches.length) || !jeux.length;
    const reserve = veutFiche ? fiches : jeux;
    const derniere = fil.at(-1);
    let i = reserve.findIndex((c) => c.matiere !== derniere?.matiere && c.format !== derniere?.format);
    if (i < 0) i = reserve.findIndex((c) => c.matiere !== derniere?.matiere);
    if (i < 0) i = 0;
    fil.push(reserve.splice(i, 1)[0]);
    jeuxDepuisFiche = veutFiche ? 0 : jeuxDepuisFiche + 1;
  }
  return fil;
}

// ---------- Les six formats ----------
// Chaque format reçoit (données, terminer) et renvoie les éléments à placer dans la carte.
// terminer(reussi, titre, texte) : reussi = true/false pour un jeu, null pour une fiche.

const formats = {

  fiche(d, terminer) {
    const blocs = [el("h2", {}, d.titre), ...d.paragraphes.map((p) => el("p", {}, p))];
    if (d.a_retenir) blocs.push(el("div", { class: "f-retenir" }, el("b", {}, "À retenir"), d.a_retenir));
    terminer(null);   // la lecture est enregistrée quand la fiche s'affiche à l'écran (voir observateur)
    return blocs;
  },

  vrai_faux(d, terminer) {
    const carte = el("div", { class: "f-affirmation" }, d.affirmation);
    const btnFaux = el("button", { class: "f-option", type: "button" }, "✗ Faux");
    const btnVrai = el("button", { class: "f-option", type: "button" }, "✓ Vrai");
    let fini = false;

    function repondre(dit) {
      if (fini) return;
      fini = true;
      depart = null;   // un glissé en cours (autre doigt) ne doit plus déplacer la carte
      const reussi = dit === d.reponse;
      carte.style.transform = "";
      carte.classList.remove("tire", "vers-vrai", "vers-faux");
      carte.classList.add(d.reponse ? "vers-vrai" : "vers-faux");
      (dit ? btnVrai : btnFaux).classList.add(reussi ? "bon" : "faux");
      btnVrai.disabled = btnFaux.disabled = true;
      terminer(reussi, `C'est ${d.reponse ? "vrai" : "faux"}.`, d.explication);
    }
    btnFaux.addEventListener("click", () => repondre(false));
    btnVrai.addEventListener("click", () => repondre(true));

    // Glissé horizontal : droite = vrai, gauche = faux. Le vertical reste au fil (touch-action: pan-y).
    let depart = null;
    carte.addEventListener("pointerdown", (e) => {
      // Seulement le bouton principal, et un seul doigt à la fois
      if (fini || e.button !== 0 || depart !== null) return;
      depart = e.clientX;
      carte.setPointerCapture(e.pointerId);
      carte.classList.add("tire");
    });
    carte.addEventListener("pointermove", (e) => {
      if (fini || depart === null) return;
      const dx = e.clientX - depart;
      carte.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)`;
      carte.classList.toggle("vers-vrai", dx > 40);
      carte.classList.toggle("vers-faux", dx < -40);
    });
    const lacher = (e) => {
      if (depart === null) return;
      const dx = e.type === "pointercancel" ? 0 : e.clientX - depart;
      depart = null;
      carte.classList.remove("tire");
      if (Math.abs(dx) > 80) return repondre(dx > 0);
      carte.style.transform = "";
      carte.classList.remove("vers-vrai", "vers-faux");
    };
    carte.addEventListener("pointerup", lacher);
    carte.addEventListener("pointercancel", lacher);

    return [
      carte,
      el("div", { class: "f-aide-swipe" }, el("span", {}, "← faux"), el("span", {}, "vrai →")),
      el("div", { class: "f-choix deux" }, btnFaux, btnVrai),
    ];
  },

  trous(d, terminer) {
    const [avant, apres] = d.texte.split("___");
    const trou = el("span", { class: "f-trou" }, " ");
    const choix = el("div", { class: "f-choix" });
    for (const mot of melanger(d.choix)) {
      choix.append(el("button", {
        class: "f-option", type: "button",
        onclick: (e) => {
          const reussi = mot === d.reponse;
          for (const b of choix.children) {
            b.disabled = true;
            if (b.textContent === String(d.reponse)) b.classList.add("bon");
          }
          if (!reussi) e.currentTarget.classList.add("faux");
          trou.textContent = d.reponse;
          trou.classList.add(reussi ? "bon" : "faux");
          terminer(reussi, reussi ? "Bien vu." : `La réponse était « ${d.reponse} ».`, d.explication);
        },
      }, mot));
    }
    return [el("p", { class: "f-phrase" }, avant, trou, apres), choix];
  },

  associer(d, terminer) {
    // On relie par position : la paire i est faite de gauche[i] et droite[i]
    const gauche = el("div", { class: "f-colonne" });
    const droite = el("div", { class: "f-colonne" });
    const faites = el("div", { class: "f-faites" });
    let selection = null;   // { cote, index, bouton }
    let restantes = d.paires.length;
    let erreurs = 0;

    function toucher(cote, index, bouton) {
      if (!selection || selection.cote === cote) {
        selection?.bouton.classList.remove("choisi");
        selection = { cote, index, bouton };
        bouton.classList.add("choisi");
        return;
      }
      const autre = selection;
      selection = null;
      autre.bouton.classList.remove("choisi");
      const [iGauche, iDroite] = cote === "g" ? [index, autre.index] : [autre.index, index];
      if (d.paires[iGauche][1] === d.paires[iDroite][1]) {
        // Paire trouvée : les deux boutons disparaissent et deviennent une bande « commande = rôle »
        const [g, dr] = d.paires[iGauche];
        faites.append(el("div", { class: "f-paire-faite" }, el("code", {}, g), el("span", {}, dr)));
        autre.bouton.remove();
        bouton.remove();
        if (--restantes === 0) {
          zonePaires.remove();
          terminer(erreurs === 0, erreurs === 0 ? "Sans faute !" : `Terminé, avec ${erreurs} erreur${erreurs > 1 ? "s" : ""}.`, d.explication);
        }
      } else {
        erreurs++;
        for (const b of [autre.bouton, bouton]) {
          b.classList.remove("secoue");
          void b.offsetWidth;   // relance l'animation même si elle vient de jouer
          b.classList.add("secoue");
        }
      }
    }

    const ajouter = (colonne, cote, classe) => (texte, index) => {
      const bouton = el("button", { class: `f-option ${classe}`, type: "button" }, texte);
      bouton.addEventListener("click", () => toucher(cote, index, bouton));
      colonne.append(bouton);
    };
    melanger(d.paires.map((p, i) => [p[0], i])).forEach(([t, i]) => ajouter(gauche, "g", "f-gauche")(t, i));
    melanger(d.paires.map((p, i) => [p[1], i])).forEach(([t, i]) => ajouter(droite, "d", "")(t, i));

    const zonePaires = el("div", { class: "f-paires" }, gauche, droite);
    return [el("p", { class: "f-consigne" }, d.consigne), faites, zonePaires];
  },

  ordre(d, terminer) {
    // On touche les étapes dans l'ordre ; chaque bonne étape remonte à sa place et reçoit son numéro.
    const liste = el("div", { class: "f-choix" });
    let prochaine = 0;
    let erreurs = 0;
    for (const etape of melangerVraiment(d.etapes)) {
      const bouton = el("button", { class: "f-option", type: "button" }, etape);
      bouton.addEventListener("click", () => {
        if (etape === d.etapes[prochaine]) {
          bouton.prepend(el("span", { class: "f-rang" }, String(prochaine + 1)));
          bouton.classList.remove("secoue");
          bouton.classList.add("bon");
          bouton.disabled = true;
          liste.insertBefore(bouton, liste.children[prochaine]);
          if (++prochaine === d.etapes.length) {
            terminer(erreurs === 0, erreurs === 0 ? "Dans l'ordre du premier coup !" : `Remis en ordre, avec ${erreurs} erreur${erreurs > 1 ? "s" : ""}.`, d.explication);
          }
        } else {
          erreurs++;
          bouton.classList.remove("secoue");
          void bouton.offsetWidth;
          bouton.classList.add("secoue");
        }
      });
      liste.append(bouton);
    }
    return [el("p", { class: "f-consigne" }, d.consigne), liste];
  },

  erreur(d, terminer) {
    const code = el("div", { class: "f-code", role: "group", "aria-label": "Code : touche la ligne fausse" });
    d.lignes.forEach((ligne, i) => {
      code.append(el("button", {
        class: "f-ligne", type: "button",
        onclick: (e) => {
          const reussi = i === d.ligne_fausse;
          for (const b of code.children) b.disabled = true;
          code.children[d.ligne_fausse].classList.add("bon");
          if (!reussi) e.currentTarget.classList.add("faux");
          terminer(reussi, reussi ? "Trouvée !" : `L'erreur était ligne ${d.ligne_fausse + 1}.`,
            d.explication, el("p", { class: "f-correction" }, "Correction : ", d.correction));
        },
      }, el("i", {}, String(i + 1)), ligne || " "));
    });
    return [el("p", { class: "f-consigne" }, d.consigne), code];
  },
};

// ---------- Construction du fil ----------

function creerCarte(contenu) {
  // Sur le fond de couleur de la matière : son nom en grand, le format, puis l'autocollant du contenu
  const carte = el("div", { class: `f-carte f-${contenu.format === "fiche" ? "fiche" : "jeu"}` });
  const matiere = donnees.matieres.find((m) => m.id === contenu.matiere);
  const pile = el("div", { class: "f-pile" },
    el("div", { class: "f-haut" },
      el("p", { class: "f-matiere" }, matiere ? matiere.nom : contenu.matiere),
      el("p", { class: "f-format" }, el("b", {}, NOMS_FORMATS[contenu.format]), ` sur ${contenu.notion}`)),
    carte);

  // Appelée une seule fois, quand la carte est lue ou le jeu terminé
  function terminer(reussi, titre, texte, enPlus) {
    if (reussi !== null) {
      enregistrerResultat(contenu.id, reussi);
      session.joues++;
      if (reussi) session.reussis++;
      afficherScore();
      carte.append(el("div", { class: `f-retour ${reussi ? "ok" : "ko"}` }, el("b", {}, titre), texte, enPlus));
      // Carte plus haute que l'écran : on descend jusqu'au retour pour qu'il soit lu
      requestAnimationFrame(() => carte.scrollTo({ top: carte.scrollHeight, behavior: "smooth" }));
    }
    pile.append(el("p", { class: "f-suite" }, "Glisse vers le haut pour continuer"));
  }

  const rendu = formats[contenu.format];
  if (!rendu) carte.append(el("p", { class: "f-discret" }, `Format inconnu : ${contenu.format}`));
  else {
    // Une fiche appelle terminer() pendant son rendu : on met l'appel en attente pour que
    // l'indice « Glisse pour la suite » arrive après le contenu. Les jeux l'appellent plus tard.
    let enRendu = true;
    const enAttente = [];
    try {
      const blocs = rendu(contenu.donnees, (...args) => (enRendu ? enAttente.push(args) : terminer(...args)));
      enRendu = false;
      carte.append(...blocs);
      for (const args of enAttente) terminer(...args);
    } catch (err) {
      console.error("Carte impossible à afficher :", contenu.id, err);
      carte.replaceChildren(el("p", { class: "f-discret" }, "Cette carte est abîmée, passe à la suivante."));
    }
  }
  const ecran = el("section", { class: "f-ecran", "data-matiere": contenu.matiere }, pile);
  if (contenu.format === "fiche") {
    ecran.dataset.id = contenu.id;
    observateurFiches.observe(ecran);
  }
  return ecran;
}

// Une fiche compte comme lue quand elle reste affichée à plus de moitié, une fois par fil
const observateurFiches = new IntersectionObserver((entrees) => {
  for (const e of entrees) {
    if (!e.isIntersecting) continue;
    enregistrerResultat(e.target.dataset.id, null);
    observateurFiches.unobserve(e.target);
  }
}, { root: fil, threshold: 0.6 });

function construireFil() {
  observateurFiches.disconnect();
  fil.replaceChildren(...ordonner(donnees.contenus.filter(contenuValide)).map(creerCarte), carteFin());
  fil.scrollTo({ top: 0 });
}

function carteFin() {
  return el("section", { class: "f-ecran" }, el("div", { class: "f-carte f-fin" },
    el("h2", {}, "Tu as fait le tour"),
    el("p", { class: "f-discret" }, "Toutes les cartes du moment sont passées. Un nouveau mélange ?"),
    el("button", { class: "btn btn-principal", type: "button", onclick: construireFil }, "Remélanger le fil")));
}

// Clavier sur ordinateur : flèches et espace passent d'une carte à l'autre.
// indexCible retient la carte visée pendant l'animation, pour que des appuis rapides s'additionnent.
let indexCible = null;
let minuteurCible = null;
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.target.closest("button") && e.key === " ") return;
  let sens = { ArrowDown: 1, PageDown: 1, " ": 1, ArrowUp: -1, PageUp: -1 }[e.key];
  if (!sens) return;
  if (e.key === " " && e.shiftKey) sens = -1;
  e.preventDefault();
  // Le focus resterait sur un bouton de la carte quittée : Espace l'activerait hors écran
  document.activeElement?.blur();
  const h = fil.clientHeight;
  const dernier = fil.children.length - 1;
  indexCible = Math.min(dernier, Math.max(0, (indexCible ?? Math.round(fil.scrollTop / h)) + sens));
  fil.scrollTo({ top: indexCible * h, behavior: "smooth" });
  clearTimeout(minuteurCible);
  minuteurCible = setTimeout(() => { indexCible = null; }, 700);
});

async function demarrer() {
  try {
    const reponse = await fetch("data/contenus.json");
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    donnees = await reponse.json();
    construireFil();
  } catch (err) {
    fil.replaceChildren(el("section", { class: "f-ecran" }, el("div", { class: "f-carte" },
      el("h2", {}, "Impossible de charger les cartes"),
      el("p", { class: "f-discret" }, navigator.onLine === false
        ? "Pas de connexion, et aucune carte n'est encore en mémoire. Reconnecte-toi puis recharge la page."
        : `Recharge la page. Si ça persiste, vérifie que l'appli est servie par un serveur (py -m http.server). Détail : ${err.message}`))));
  }
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
demarrer();
