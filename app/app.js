// Agon — fil vertical de fiches et de jeux, contenus dans data/contenus.json.
// Pas encore de compte ni de Supabase : résultats et réglages restent dans ce navigateur (localStorage).
"use strict";

const NOMS_FORMATS = {
  fiche: "Fiche",
  vrai_faux: "Vrai ou faux",
  trous: "Texte à trous",
  associer: "Associer",
  ordre: "Remettre dans l'ordre",
  erreur: "Trouve l'erreur",
  chrono: "Prise d'otage",
};
const JEUX_PAR_FICHE = 2;   // rythme du fil : une fiche, puis deux jeux, etc.
const CLE_RESULTATS = "agon.resultats";
const CLE_REGLAGES = "agon.reglages";

// Prise d'otage : QUESTIONS_CHRONO questions (vrai/faux ou trous) en DUREE_CHRONO ms, une erreur coûte PENALITE_CHRONO
const QUESTIONS_CHRONO = 5;
const DUREE_CHRONO = 30000;
const PENALITE_CHRONO = 3000;
const CARTES_ENTRE_CHRONOS = 10;

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
  if (reussi !== null) r.derniereOk = reussi;   // sert à la progression : réussie ou à revoir
  r.dernier = new Date().toISOString();
  resultats[id] = r;
  try { localStorage.setItem(CLE_RESULTATS, JSON.stringify(resultats)); } catch { /* tant pis */ }
}

// Réglages : on stocke ce qui est EXCLU, pour qu'une nouvelle matière ou un nouveau jeu soit actif par défaut
function lireReglages() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_REGLAGES));
    return {
      matieresExclues: Array.isArray(v?.matieresExclues) ? v.matieresExclues : [],
      formatsExclus: Array.isArray(v?.formatsExclus) ? v.formatsExclus : [],
    };
  } catch { return { matieresExclues: [], formatsExclus: [] }; }
}
function ecrireReglages(r) {
  try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(r)); } catch { /* tant pis */ }
}
let reglages = lireReglages();

// ---------- Glisser à gauche ou à droite ----------
// Rend un élément « tirable » : droite = vrai, gauche = faux. Le vertical reste au fil (touch-action: pan-y).
// decider(vrai) est appelée quand on lâche au-delà du seuil ; arreter() fige l'élément après la réponse.
function rendreGlissable(element, decider) {
  let depart = null;
  let fini = false;
  element.classList.add("f-glissable");
  const remettre = () => {
    element.style.transform = "";
    element.classList.remove("tire", "vers-vrai", "vers-faux");
  };
  element.addEventListener("pointerdown", (e) => {
    // Seulement le bouton principal, et un seul doigt à la fois
    if (fini || e.button !== 0 || depart !== null) return;
    depart = e.clientX;
    element.setPointerCapture(e.pointerId);
    element.classList.add("tire");
  });
  element.addEventListener("pointermove", (e) => {
    if (fini || depart === null) return;
    const dx = e.clientX - depart;
    element.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)`;
    element.classList.toggle("vers-vrai", dx > 40);
    element.classList.toggle("vers-faux", dx < -40);
  });
  const lacher = (e) => {
    if (depart === null) return;
    const dx = e.type === "pointercancel" ? 0 : e.clientX - depart;
    depart = null;
    remettre();
    if (!fini && Math.abs(dx) > 80) decider(dx > 0);
  };
  element.addEventListener("pointerup", lacher);
  element.addEventListener("pointercancel", lacher);
  return { arreter() { fini = true; depart = null; remettre(); } };
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
      glisse.arreter();   // un glissé en cours (autre doigt) ne doit plus déplacer la carte
      const reussi = dit === d.reponse;
      carte.classList.add(d.reponse ? "vers-vrai" : "vers-faux");
      (dit ? btnVrai : btnFaux).classList.add(reussi ? "bon" : "faux");
      btnVrai.disabled = btnFaux.disabled = true;
      terminer(reussi, `C'est ${d.reponse ? "vrai" : "faux"}.`, d.explication);
    }
    btnFaux.addEventListener("click", () => repondre(false));
    btnVrai.addEventListener("click", () => repondre(true));
    const glisse = rendreGlissable(carte, repondre);

    return [
      carte,
      el("div", { class: "f-aide-swipe" }, el("span", {}, "← faux"), el("span", {}, "Glisse la carte"), el("span", {}, "vrai →")),
      el("div", { class: "f-choix deux" }, btnFaux, btnVrai),
    ];
  },

  // Prise d'otage : une série de questions rapides contre la montre. d.questions = contenus vrai_faux / trous.
  chrono(d, terminer) {
    const zone = el("div", { class: "f-chrono" });
    const intro = el("div", { class: "f-chrono-intro" },
      el("p", { class: "f-consigne" }, `Libère l'otage : réponds aux ${d.questions.length} questions avant la fin du chrono.`),
      el("p", { class: "f-discret" }, `Tu as ${DUREE_CHRONO / 1000} secondes. Chaque erreur en retire ${PENALITE_CHRONO / 1000}. Pas de fuite possible : le fil reste bloqué jusqu'à la fin.`),
      el("button", { class: "f-option f-lancer", type: "button", onclick: lancer }, "Lancer le chrono"));
    zone.append(intro);

    const jauge = el("i");
    const temps = el("b", { class: "f-chrono-temps" });
    // Une pastille par question : elle se remplit en vert ou en rouge à chaque réponse
    const pastilles = el("div", { class: "f-pips", role: "img" }, ...d.questions.map(() => el("i")));
    const question = el("div", { class: "f-chrono-question", "aria-live": "polite" });
    const reponses = [];   // { contenu, ok }
    let restant = DUREE_CHRONO;
    let dernierInstant = null;
    let indice = 0;
    let fini = false;

    function afficherTemps() {
      temps.textContent = `${Math.max(0, restant / 1000).toFixed(1).replace(".", ",")} s`;
      jauge.style.width = `${Math.max(0, restant / DUREE_CHRONO) * 100}%`;
      const urgent = !fini && restant < 8000;
      temps.classList.toggle("urgent", urgent);
      // Dernières secondes : tout l'écran rouge se met à battre
      zone.closest(".f-ecran")?.classList.toggle("alerte", urgent);
    }

    function majPastilles() {
      [...pastilles.children].forEach((p, i) => {
        p.className = i < reponses.length ? (reponses[i].ok ? "ok" : "ko") : i === indice && !fini ? "courant" : "";
      });
      pastilles.setAttribute("aria-label", `Question ${Math.min(indice + 1, d.questions.length)} sur ${d.questions.length}`);
    }

    // Le chrono ne tourne que si son écran est celui affiché (on peut faire défiler sans perdre de temps)
    function tic(instant) {
      if (fini) return;
      const visible = zone.closest(".f-ecran") === ecranActif;
      if (visible && dernierInstant !== null) restant -= instant - dernierInstant;
      dernierInstant = visible ? instant : null;
      afficherTemps();
      if (restant <= 0) return finir();
      requestAnimationFrame(tic);
    }

    // Lancement : compte à rebours 3, 2, 1, puis la première question et le chrono
    function lancer() {
      afficherTemps();
      majPastilles();
      const decompte = el("div", { class: "f-decompte", "aria-live": "assertive" });
      zone.replaceChildren(
        el("div", { class: "f-chrono-barre" }, temps, pastilles),
        el("div", { class: "f-chrono-jauge" }, jauge),
        question);
      question.replaceChildren(decompte);
      const etapes = ["3", "2", "1", "Go !"];
      etapes.forEach((t, i) => setTimeout(() => {
        decompte.textContent = t;
        decompte.classList.remove("tape"); void decompte.offsetWidth; decompte.classList.add("tape");
      }, i * 650));
      setTimeout(() => { poserQuestion(); requestAnimationFrame(tic); }, etapes.length * 650);
    }

    function repondre(ok) {
      if (fini) return;
      const contenu = d.questions[indice];
      reponses.push({ contenu, ok });
      enregistrerResultat(contenu.id, ok);
      if (!ok) {
        restant -= PENALITE_CHRONO;
        // « −3 s » qui s'envole depuis le chrono
        const penalite = el("span", { class: "f-penalite", "aria-hidden": "true" }, `−${PENALITE_CHRONO / 1000} s`);
        temps.parentElement.append(penalite);
        setTimeout(() => penalite.remove(), 900);
      }
      question.classList.remove("eclair-ok", "eclair-ko");
      void question.offsetWidth;   // relance l'éclair même s'il vient de jouer
      question.classList.add(ok ? "eclair-ok" : "eclair-ko");
      indice++;
      majPastilles();
      if (restant <= 0 || indice === d.questions.length) return finir();
      poserQuestion();
    }

    function poserQuestion() {
      majPastilles();
      const q = d.questions[indice];
      if (q.format === "vrai_faux") {
        const carte = el("div", { class: "f-affirmation" }, q.donnees.affirmation);
        rendreGlissable(carte, (vrai) => repondre(vrai === q.donnees.reponse));
        question.replaceChildren(carte, el("div", { class: "f-choix deux" },
          el("button", { class: "f-option", type: "button", onclick: () => repondre(q.donnees.reponse === false) }, "✗ Faux"),
          el("button", { class: "f-option", type: "button", onclick: () => repondre(q.donnees.reponse === true) }, "✓ Vrai")));
      } else {
        const [avant, apres] = q.donnees.texte.split("___");
        question.replaceChildren(
          el("p", { class: "f-phrase" }, avant, el("span", { class: "f-trou" }, " "), apres),
          el("div", { class: "f-choix deux" }, ...melanger(q.donnees.choix).map((mot) =>
            el("button", { class: "f-option", type: "button", onclick: () => repondre(mot === q.donnees.reponse) }, mot))));
      }
      question.classList.remove("entre"); void question.offsetWidth; question.classList.add("entre");
    }

    function finir() {
      fini = true;
      restant = Math.max(0, restant);
      afficherTemps();
      majPastilles();
      const bonnes = reponses.filter((r) => r.ok).length;
      const libere = reponses.length === d.questions.length && restant > 0;
      // Récap : ce qui a été raté ou pas atteint, avec la bonne réponse
      const aRevoir = d.questions.filter((q, i) => !reponses[i]?.ok).map((q) => el("li", {},
        q.format === "vrai_faux"
          ? `${q.donnees.affirmation} C'est ${q.donnees.reponse ? "vrai" : "faux"}.`
          : q.donnees.texte.replace("___", `« ${q.donnees.reponse} »`)));
      // Tampon de fin, avec des confettis si l'otage est libéré
      const tampon = el("div", { class: `f-tampon ${libere ? "ok" : "ko"}` }, libere ? "Libéré !" : "Trop tard");
      if (libere) {
        const couleurs = ["#3D5AFE", "#FF6B3D", "#00C08B", "#7B4DFF", "#FFC21A", "#FF5FA2"];
        const confettis = el("div", { class: "f-confettis", "aria-hidden": "true" });
        for (let k = 0; k < 18; k++) {
          const c = el("i");
          const angle = (k / 18) * Math.PI * 2 + Math.random() * 0.3;
          const distance = 90 + Math.random() * 70;
          c.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
          c.style.setProperty("--y", `${Math.sin(angle) * distance - 30}px`);
          c.style.setProperty("--r", `${Math.round(Math.random() * 540 - 270)}deg`);
          c.style.background = couleurs[k % couleurs.length];
          confettis.append(c);
        }
        tampon.append(confettis);
      }
      question.classList.remove("entre");
      zone.querySelector(".f-chrono-jauge")?.remove();
      const bilan = `${bonnes} bonne${bonnes > 1 ? "s" : ""} réponse${bonnes > 1 ? "s" : ""} sur ${d.questions.length}` +
        (libere ? `, ${(restant / 1000).toFixed(1).replace(".", ",")} s d'avance.` : ".");
      question.replaceChildren(tampon, el("p", { class: "f-bilan" }, bilan),
        aRevoir.length ? el("div", { class: "f-recap" }, el("b", {}, "À revoir"), el("ul", {}, ...aRevoir)) : "");
      liberer(zone.closest(".f-ecran"), libere);
      terminer(libere, null);
    }

    return [zone];
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

// Titre façon lettre de rançon : chaque lettre découpée dans un « journal » différent, posée de travers
function lettreDeRancon(texte) {
  const styles = ["papier", "encre", "jaune", "papier", "rose", "encre", "papier", "bleu"];
  const titre = el("p", { class: "f-matiere f-rancon", "aria-label": texte });
  let mot = null;   // les lettres d'un même mot restent ensemble à la coupure de ligne
  [...texte].forEach((lettre, i) => {
    if (lettre === " ") { mot = null; return; }
    if (!mot) { mot = el("span", { class: "f-mot" }); titre.append(mot); }
    const morceau = el("span", { class: `f-lettre ${styles[(i * 5) % styles.length]}`, "aria-hidden": "true" }, lettre);
    morceau.style.setProperty("--tourne", `${((i * 37) % 13) - 6}deg`);
    morceau.style.setProperty("--i", titre.querySelectorAll(".f-lettre").length);
    morceau.style.setProperty("--monte", `${((i * 23) % 9) - 4}px`);
    if (i % 3 === 1) morceau.classList.add("serre");
    mot.append(morceau);
  });
  return titre;
}

function creerCarte(contenu) {
  // Sur le fond de couleur de la matière : son nom en grand, le format, puis l'autocollant du contenu
  const carte = el("div", { class: `f-carte f-${contenu.format === "fiche" ? "fiche" : "jeu"}` });
  const matiere = donnees.matieres.find((m) => m.id === contenu.matiere);
  const haut = contenu.format === "chrono"
    ? [lettreDeRancon("Prise d'otage"),
       el("p", { class: "f-format" }, el("b", {}, "Ton cerveau est retenu."),
         ` ${contenu.donnees.questions.length} bonnes réponses en ${DUREE_CHRONO / 1000} secondes pour le libérer.`)]
    : [el("p", { class: "f-matiere" }, matiere ? matiere.nom : contenu.matiere),
       el("p", { class: "f-format" }, el("b", {}, NOMS_FORMATS[contenu.format]), ` sur ${contenu.notion}`)];
  const pile = el("div", { class: "f-pile" }, el("div", { class: "f-haut" }, ...haut), carte);

  // Appelée une seule fois, quand la carte est lue ou le jeu terminé
  function terminer(reussi, titre, texte, enPlus) {
    if (reussi !== null) {
      enregistrerResultat(contenu.id, reussi);
      session.joues++;
      if (reussi) session.reussis++;
      afficherScore();
      // titre null : le jeu affiche lui-même son résultat (Prise d'otage)
      if (titre !== null) carte.append(el("div", { class: `f-retour ${reussi ? "ok" : "ko"}` }, el("b", {}, titre), texte, enPlus));
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
  if (contenu.format === "chrono") {
    ecran.classList.add("f-otage");
    ecran.prepend(el("div", { class: "f-barreaux", "aria-hidden": "true" }));
  }
  if (contenu.format === "fiche") ecran.dataset.fiche = contenu.id;
  return ecran;
}

// ---------- Écran affiché ----------
// Un seul observateur suit l'écran visible : il colore la barre du navigateur, compte les fiches lues,
// fait tourner le chrono seulement à l'écran, et montre une fois comment tirer une carte vrai/faux.
let ecranActif = null;
let indiceGlisseMontre = false;
const metaTheme = document.querySelector('meta[name="theme-color"]');

const observateurEcrans = new IntersectionObserver((entrees) => {
  for (const e of entrees) {
    if (!e.isIntersecting) continue;
    const ecran = e.target;
    ecranActif = ecran;
    const couleur = getComputedStyle(ecran).backgroundColor;
    metaTheme.setAttribute("content", couleur);
    document.documentElement.style.setProperty("--fond-actif", couleur);
    if (ecran.dataset.fiche) {
      enregistrerResultat(ecran.dataset.fiche, null);
      delete ecran.dataset.fiche;   // une seule fois par fil
    }
    if (ecran.classList.contains("f-otage") && !ecran.classList.contains("termine")) quandArrete(ecran, () => capturer(ecran));
    const aTirer = ecran.querySelector(".f-affirmation:not(.vers-vrai):not(.vers-faux)");
    if (aTirer && !indiceGlisseMontre) {
      indiceGlisseMontre = true;
      aTirer.classList.add("indice-glisse");
    }
  }
}, { root: fil, threshold: 0.6 });

// Prise d'otage : impossible de faire défiler le fil tant que la partie n'est pas finie
function capturer(ecran) {
  if (fil.classList.contains("verrouille") || ecranActif !== ecran) return;
  if (Math.abs(fil.scrollTop - ecran.offsetTop) > 2) fil.scrollTo({ top: ecran.offsetTop, behavior: "instant" });
  fil.classList.add("verrouille");
  ecran.classList.add("capture");
}

// Appelle faire() quand le fil ne bouge plus depuis 150 ms (fin du calage sur l'écran)
function quandArrete(ecran, faire) {
  let minuteur = setTimeout(fin, 150);
  function bouge() { clearTimeout(minuteur); minuteur = setTimeout(fin, 150); }
  function fin() { fil.removeEventListener("scroll", bouge); faire(); }
  fil.addEventListener("scroll", bouge);
}
function liberer(ecran, libere) {
  ecran.classList.add("termine", libere ? "libere" : "perdu");
  // On laisse le tampon se poser avant de rendre la main
  setTimeout(() => fil.classList.remove("verrouille"), 1200);
}

// Contenus retenus par les réglages (matières et formats cochés)
function contenusRetenus() {
  return donnees.contenus.filter((c) => contenuValide(c)
    && !reglages.matieresExclues.includes(c.matiere) && !reglages.formatsExclus.includes(c.format));
}

// Glisse une Prise d'otage toutes les CARTES_ENTRE_CHRONOS cartes, avec des questions rapides tirées au hasard
function ajouterChronos(liste) {
  if (reglages.formatsExclus.includes("chrono")) return liste;
  const rapides = donnees.contenus.filter((c) => (c.format === "vrai_faux" || c.format === "trous")
    && contenuValide(c) && !reglages.matieresExclues.includes(c.matiere));
  if (rapides.length < QUESTIONS_CHRONO) return liste;
  const resultat = [];
  liste.forEach((c, i) => {
    resultat.push(c);
    if ((i + 1) % CARTES_ENTRE_CHRONOS === 0) {
      resultat.push({ id: `chrono-${i}`, matiere: "chrono", format: "chrono",
        donnees: { questions: melanger(rapides).slice(0, QUESTIONS_CHRONO) } });
    }
  });
  return resultat;
}

function construireFil() {
  observateurEcrans.disconnect();
  fil.classList.remove("verrouille");
  const retenus = contenusRetenus();
  const ecrans = retenus.length
    ? [...ajouterChronos(ordonner(retenus)).map(creerCarte), carteFin()]
    : [carteVide()];
  fil.replaceChildren(...ecrans);
  for (const ecran of ecrans) observateurEcrans.observe(ecran);
  fil.scrollTo({ top: 0 });
}

function carteVide() {
  return el("section", { class: "f-ecran" }, el("div", { class: "f-carte f-fin" },
    el("h2", {}, "Aucune carte à afficher"),
    el("p", { class: "f-discret" }, "Les matières et les jeux cochés dans les réglages ne donnent aucune carte."),
    el("button", { class: "btn btn-principal", type: "button", onclick: ouvrirReglages }, "Ouvrir les réglages")));
}

function carteFin() {
  return el("section", { class: "f-ecran" }, el("div", { class: "f-carte f-fin" },
    el("h2", {}, "Tu as fait le tour"),
    el("p", { class: "f-discret" }, "Toutes les cartes du moment sont passées. Un nouveau mélange ?"),
    el("button", { class: "btn btn-principal", type: "button", onclick: construireFil }, "Remélanger le fil")));
}

// ---------- Réglages et progression ----------
const dialogue = document.getElementById("reglages");
let reglagesModifies = false;

// Une pastille à cocher (aria-pressed). Interdit de décocher la dernière d'un groupe : le fil serait vide.
function pastille(texte, active, couleur, basculer) {
  const b = el("button", { class: "f-pastille", type: "button", "aria-pressed": String(active) }, texte);
  if (couleur) b.style.setProperty("--pastille", couleur);
  b.addEventListener("click", () => {
    const groupe = b.parentElement;
    const actives = groupe.querySelectorAll('[aria-pressed="true"]').length;
    const devient = b.getAttribute("aria-pressed") !== "true";
    if (!devient && actives === 1) {
      b.classList.remove("secoue"); void b.offsetWidth; b.classList.add("secoue");
      return;
    }
    b.setAttribute("aria-pressed", String(devient));
    basculer(devient);
    ecrireReglages(reglages);
    reglagesModifies = true;
    remplirProgression();
  });
  return b;
}

function basculerDans(liste, valeur, actif) {
  const i = liste.indexOf(valeur);
  if (actif && i >= 0) liste.splice(i, 1);
  if (!actif && i < 0) liste.push(valeur);
}

function remplirProgression() {
  const resultats = lireResultats();
  const lignes = donnees.matieres.map((m) => {
    // On compte les jeux (pas les fiches) : réussis au dernier essai, ratés à revoir, jamais joués
    const jeux = donnees.contenus.filter((c) => c.matiere === m.id && c.format !== "fiche" && contenuValide(c));
    const reussis = jeux.filter((c) => resultats[c.id]?.derniereOk === true).length;
    const aRevoir = jeux.filter((c) => resultats[c.id]?.derniereOk === false).length;
    const part = jeux.length ? reussis / jeux.length : 0;
    const detail = `${reussis} réussi${reussis > 1 ? "s" : ""} sur ${jeux.length}` + (aRevoir ? `, ${aRevoir} à revoir` : "");
    const ligne = el("div", { class: "f-prog-ligne", "data-matiere": m.id },
      el("div", { class: "f-prog-texte" }, el("b", {}, m.nom), el("span", {}, detail)),
      el("div", { class: "f-prog-barre", role: "img", "aria-label": `${Math.round(part * 100)} % réussi` }, el("i")));
    ligne.querySelector("i").style.width = `${part * 100}%`;
    return ligne;
  });
  document.getElementById("progression").replaceChildren(...lignes);
}

function remplirReglages() {
  const couleurDe = (id) => {
    const temoin = el("span", { "data-matiere": id });
    document.body.append(temoin);
    const c = getComputedStyle(temoin).getPropertyValue("--c").trim();
    temoin.remove();
    return c;
  };
  document.getElementById("choix-matieres").replaceChildren(...donnees.matieres.map((m) =>
    pastille(m.nom, !reglages.matieresExclues.includes(m.id), couleurDe(m.id),
      (actif) => basculerDans(reglages.matieresExclues, m.id, actif))));
  document.getElementById("choix-formats").replaceChildren(...Object.entries(NOMS_FORMATS).map(([id, nom]) =>
    pastille(nom, !reglages.formatsExclus.includes(id), null,
      (actif) => basculerDans(reglages.formatsExclus, id, actif))));
  remplirProgression();
}

function ouvrirReglages() {
  if (!donnees) return;
  reglagesModifies = false;
  btnZero.classList.remove("confirmer");
  btnZero.textContent = "Effacer ma progression";
  remplirReglages();
  dialogue.showModal();
}
dialogue.addEventListener("close", () => {
  if (reglagesModifies) construireFil();
});
document.getElementById("btn-reglages").addEventListener("click", ouvrirReglages);
document.getElementById("btn-fermer-reglages").addEventListener("click", () => dialogue.close());
// Toucher le fond grisé autour du panneau le ferme aussi
dialogue.addEventListener("click", (e) => { if (e.target === dialogue) dialogue.close(); });

// Effacer en deux temps : le premier appui demande confirmation pendant 4 s
const btnZero = document.getElementById("btn-zero");
let minuteurZero = null;
btnZero.addEventListener("click", () => {
  if (!btnZero.classList.contains("confirmer")) {
    btnZero.classList.add("confirmer");
    btnZero.textContent = "Confirmer : tout effacer";
    minuteurZero = setTimeout(() => {
      btnZero.classList.remove("confirmer");
      btnZero.textContent = "Effacer ma progression";
    }, 4000);
    return;
  }
  clearTimeout(minuteurZero);
  try { localStorage.removeItem(CLE_RESULTATS); } catch { /* tant pis */ }
  session.joues = session.reussis = 0;
  afficherScore();
  btnZero.classList.remove("confirmer");
  btnZero.textContent = "Progression effacée";
  remplirProgression();
});

// ---------- Navigation : une carte à la fois ----------
// Le défilement natif part trop loin avec l'élan (doigt, trackpad, molette). Le fil n'accepte donc
// aucun défilement libre (overflow: hidden) : chaque geste fait avancer ou reculer d'exactement une carte.

function indexCourant() { return Math.round(fil.scrollTop / fil.clientHeight); }

// indexCible retient la carte visée pendant l'animation, pour que deux flèches rapides fassent deux cartes
let indexCible = null;
let minuteurCible = null;
function allerDe(sens) {
  if (fil.classList.contains("verrouille") || dialogue.open) return;
  const dernier = fil.children.length - 1;
  const depart = indexCible ?? indexCourant();
  const cible = Math.min(dernier, Math.max(0, depart + sens));
  if (cible === depart) return;
  indexCible = cible;
  // Le focus resterait sur un bouton de la carte quittée : Espace l'activerait hors écran
  document.activeElement?.blur();
  fil.scrollTo({ top: cible * fil.clientHeight, behavior: "smooth" });
  clearTimeout(minuteurCible);
  minuteurCible = setTimeout(() => { indexCible = null; }, 650);
}

// Une carte trop haute défile d'abord à l'intérieur ; on ne change de carte qu'une fois au bout
function peutDefilerDedans(cible, sens) {
  const boite = cible.closest?.(".f-carte");
  if (!boite || boite.scrollHeight <= boite.clientHeight + 1) return false;
  return sens > 0 ? boite.scrollTop + boite.clientHeight < boite.scrollHeight - 1 : boite.scrollTop > 0;
}

// Doigt : un glissé vertical = une carte, quelle que soit sa vitesse
let toucher = null;
fil.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) { toucher = null; return; }
  const t = e.touches[0];
  const boite = e.target.closest(".f-carte");
  toucher = { x: t.clientX, y: t.clientY, cible: e.target, defilement: boite ? boite.scrollTop : 0, boite };
}, { passive: true });
fil.addEventListener("touchend", (e) => {
  if (!toucher) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - toucher.x;
  const dy = toucher.y - t.clientY;   // positif = le doigt monte = carte suivante
  const { cible, boite, defilement } = toucher;
  toucher = null;
  if (Math.abs(dy) < 40 || Math.abs(dx) > Math.abs(dy)) return;   // petit geste ou glissé horizontal (vrai/faux)
  const sens = Math.sign(dy);
  // La carte a défilé pendant le geste, ou peut encore défiler : le geste lui appartenait
  if (boite && Math.abs(boite.scrollTop - defilement) > 2) return;
  if (peutDefilerDedans(cible, sens)) return;
  allerDe(sens);
}, { passive: true });

// Molette et trackpad : un geste = une carte. L'élan qui suit est ignoré jusqu'à une pause de 200 ms.
let roulementCumule = 0;
let roulementBloque = false;
let minuteurRoulement = null;
fil.addEventListener("wheel", (e) => {
  if (e.ctrlKey) return;   // zoom au trackpad
  const sens = Math.sign(e.deltaY);
  if (!sens || peutDefilerDedans(e.target, sens)) return;
  e.preventDefault();
  clearTimeout(minuteurRoulement);
  minuteurRoulement = setTimeout(() => { roulementBloque = false; roulementCumule = 0; }, 200);
  if (roulementBloque) return;
  roulementCumule += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
  if (Math.abs(roulementCumule) < 30) return;
  roulementBloque = true;
  roulementCumule = 0;
  allerDe(sens);
}, { passive: false });

// Clavier sur ordinateur : flèches, Page suivante/précédente et espace
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || dialogue.open || fil.classList.contains("verrouille")) return;
  if (e.target.closest("button") && e.key === " ") return;
  let sens = { ArrowDown: 1, PageDown: 1, " ": 1, ArrowUp: -1, PageUp: -1 }[e.key];
  if (!sens) return;
  if (e.key === " " && e.shiftKey) sens = -1;
  e.preventDefault();
  allerDe(sens);
});

// Fenêtre redimensionnée (rotation du téléphone) : on reste calé sur la même carte
let indexAvantRedim = 0;
fil.addEventListener("scroll", () => { indexAvantRedim = indexCourant(); }, { passive: true });
addEventListener("resize", () => fil.scrollTo({ top: indexAvantRedim * fil.clientHeight, behavior: "instant" }));

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
