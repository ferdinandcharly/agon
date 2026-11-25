// Facettes (ex-Agon) — fil vertical de fiches et de jeux, contenus dans data/contenus.json.
// Résultats et réglages vivent dans ce navigateur (localStorage) ; avec un compte, compte.js les synchronise.
"use strict";

const NOMS_FORMATS = {
  fiche: "Fiche",
  vrai_faux: "Vrai ou faux",
  trous: "Texte à trous",
  associer: "Associer",
  ordre: "Remettre dans l'ordre",
  erreur: "Trouve l'erreur",
  chrono: "Prise d'otage",
  tube: "Tube du jour",
};
const JEUX_PAR_FICHE = 2;   // rythme du fil : une fiche, puis deux jeux, etc.
// Clés gardées depuis l'ancien nom Agon : la progression déjà enregistrée n'est pas perdue
const CLE_RESULTATS = "agon.resultats";
const CLE_REGLAGES = "agon.reglages";
const CLE_COLLECTION = "agon.collection";
// Répétition espacée : délai (en jours) avant qu'une carte de la boîte 1, 2, 3, 4, 5 redevienne prioritaire
const BOITES_JOURS = [0, 1, 3, 7, 14];
const VINYLES_PAR_DISQUE = 7;   // Tube du jour : 7 vinyles gagnés = 1 disque d'or

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

// Toute écriture locale prévient compte.js, qui l'enverra au compte (si connecté)
function changementLocal() { if (typeof Compte !== "undefined") Compte.programmer(); }

// localStorage peut être indisponible (navigation privée, données bloquées) : l'appli marche quand même
function lireResultats() {
  try {
    const valeur = JSON.parse(localStorage.getItem(CLE_RESULTATS));
    if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) return {};
    // Une entrée abîmée (null, nombre…) est ignorée : elle bloquerait la synchro
    return Object.fromEntries(Object.entries(valeur).filter(([, r]) => r && typeof r === "object" && !Array.isArray(r)));
  } catch { return {}; }
}
function enregistrerResultat(id, reussi) {
  const resultats = lireResultats();
  const r = resultats[id] || { vu: 0, ok: 0, ko: 0 };
  r.vu++;
  if (reussi === true) r.ok++;
  if (reussi === false) r.ko++;
  if (reussi !== null) {
    r.derniereOk = reussi;   // sert à la progression : réussie ou à revoir
    // Répétition espacée (boîtes de Leitner) : ratée → boîte 1, réussie → boîte suivante
    r.boite = reussi ? Math.min(BOITES_JOURS.length, (r.boite || 1) + 1) : 1;
  }
  r.dernier = new Date().toISOString();
  resultats[id] = r;
  try { localStorage.setItem(CLE_RESULTATS, JSON.stringify(resultats)); } catch { /* tant pis */ }
  // Une réponse de plus aujourd'hui (pour « Cette semaine » du profil) ; ecrireCollection programme la synchro
  const collection = lireCollection();
  const jour = jourLocal();
  collection.jours[jour] = Math.min(5000, (collection.jours[jour] || 0) + 1);
  ecrireCollection(collection);
}

// Réglages : on stocke ce qui est EXCLU, pour qu'une nouvelle matière ou un nouveau jeu soit actif par défaut.
// maj : date du dernier choix (le plus récent gagne entre appareils) ; remise : date de la dernière remise à zéro.
function lireReglages() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_REGLAGES));
    return {
      matieresExclues: Array.isArray(v?.matieresExclues) ? v.matieresExclues : [],
      formatsExclus: Array.isArray(v?.formatsExclus) ? v.formatsExclus : [],
      maj: typeof v?.maj === "string" ? v.maj : null,
      remise: typeof v?.remise === "string" ? v.remise : null,
      notions: lireCases(v?.notions),
      apparence: Apparence.normaliser(v?.apparence),
    };
  } catch { return { matieresExclues: [], formatsExclus: [], maj: null, remise: null, notions: {}, apparence: Apparence.normaliser() }; }
}

// Cases par notion : « À venir » (pas encore vue en cours) ou « DS passé ». Clé « matiere/notion ».
const ETATS_CASE = ["a_venir", "ds_passe"];
function lireCases(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([, etat]) => ETATS_CASE.includes(etat)));
}
function etatCase(matiere, notion) {
  return reglages.notions[`${matiere}/${notion}`] ?? null;
}
// Cocher une case ; recocher la même la décoche ; les deux s'excluent
function basculerCase(matiere, notion, etat) {
  const cle = `${matiere}/${notion}`;
  if (reglages.notions[cle] === etat) delete reglages.notions[cle];
  else reglages.notions[cle] = etat;
  reglages.maj = new Date().toISOString();
  ecrireReglages(reglages);
}
function ecrireReglages(r) {
  try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(r)); } catch { /* tant pis */ }
  changementLocal();
}
let reglages = lireReglages();

// ---------- Tube du jour et collection de vinyles ----------
// Chaque jour, une question en tête du fil ; une seule chance. Réussie = un vinyle ; 7 vinyles = un disque d'or.
// Rien ne se perd si on saute un jour : pas de série à casser, la collection ne fait que grandir.
// Date locale (pas UTC) au format AAAA-MM-JJ : la journée de la personne, pas celle de Greenwich
function jourLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function jourDuJour() { return jourLocal(); }

// Activité : nombre de réponses par jour, sur les 14 derniers jours (aujourd'hui compris).
// Vient aussi d'autres appareils : on ne garde que des dates strictes et des entiers raisonnables.
const JOURS_GARDES = 14;
function normaliserJours(j, aujourdhui = jourLocal()) {
  const propre = {};
  if (!j || typeof j !== "object" || Array.isArray(j)) return propre;
  const [a, m, d] = aujourdhui.split("-").map(Number);
  const limite = jourLocal(new Date(a, m - 1, d - (JOURS_GARDES - 1)));
  for (const [jour, n] of Object.entries(j)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || jour < limite || jour > aujourdhui) continue;
    if (Number.isInteger(n) && n >= 0 && n <= 5000) propre[jour] = n;
  }
  return propre;
}
// Deux appareils : pour chaque jour, le plus grand compte gagne (aucun ne voit les réponses de l'autre)
function fusionnerJours(a, b, aujourdhui = jourLocal()) {
  const fusion = { ...normaliserJours(a, aujourdhui) };
  for (const [jour, n] of Object.entries(normaliserJours(b, aujourdhui))) fusion[jour] = Math.max(fusion[jour] || 0, n);
  return fusion;
}

function lireCollection() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_COLLECTION));
    if (v && typeof v === "object") {
      return { vinyles: Number(v.vinyles) || 0, disquesOr: Number(v.disquesOr) || 0,
               dernierJour: typeof v.dernierJour === "string" ? v.dernierJour : null, jours: normaliserJours(v.jours) };
    }
  } catch { /* collection vide */ }
  return { vinyles: 0, disquesOr: 0, dernierJour: null, jours: {} };
}
function ecrireCollection(c) {
  try { localStorage.setItem(CLE_COLLECTION, JSON.stringify(c)); } catch { /* tant pis */ }
  changementLocal();
}

// Vitrine : 7 emplacements de vinyles + le compte de disques d'or. gagne = "vinyle" | "or" anime la dernière arrivée.
function vitrine(c, gagne = null) {
  const emplacements = el("div", { class: "f-vinyles", role: "img",
    "aria-label": `${c.vinyles} vinyle${c.vinyles > 1 ? "s" : ""} sur ${VINYLES_PAR_DISQUE}` });
  for (let i = 0; i < VINYLES_PAR_DISQUE; i++) {
    const v = el("span", { class: "f-vinyle" + (i < c.vinyles ? " plein" : "") });
    if (gagne === "vinyle" && i === c.vinyles - 1) v.classList.add("arrive");
    if (gagne === "or") v.classList.add("fondu");
    emplacements.append(v);
  }
  const legende = el("p", { class: "f-vitrine-legende" },
    `${c.vinyles}/${VINYLES_PAR_DISQUE} vers le prochain disque d'or`);
  const bloc = el("div", { class: "f-vitrine" }, emplacements, legende);
  if (c.disquesOr > 0) {
    const or = el("span", { class: "f-disque-or" + (gagne === "or" ? " arrive" : "") },
      `${c.disquesOr} disque${c.disquesOr > 1 ? "s" : ""} d'or`);
    bloc.insertBefore(or, legende);
  }
  return bloc;
}

// La question du jour : la même toute la journée, choisie parmi les jeux courts des matières cochées
function tubeDuJour() {
  const jour = jourDuJour();
  if (lireCollection().dernierJour === jour) return null;
  const choix = contenusRetenus().filter((c) => ["vrai_faux", "trous", "erreur"].includes(c.format));
  if (!choix.length) return null;
  let graine = 0;
  for (const ch of jour) graine = (graine * 31 + ch.charCodeAt(0)) % 100003;
  const q = choix[graine % choix.length];
  return { id: `tube-${jour}`, matiere: "tube", format: "tube", notion: q.notion, donnees: { question: q } };
}

// ---------- Question rapide (Prise d'otage, Survie) ----------
// Un vrai/faux (à tirer ou à toucher) ou un texte à trous à 4 choix ; repondre(juste) est appelée une fois.
function questionRapide(q, repondre) {
  let fait = false;
  const une = (ok) => { if (!fait) { fait = true; repondre(ok); } };
  if (q.format === "vrai_faux") {
    const carte = el("div", { class: "f-affirmation" }, q.donnees.affirmation);
    rendreGlissable(carte, (vrai) => une(vrai === q.donnees.reponse));
    return [carte, el("div", { class: "f-choix deux" },
      el("button", { class: "f-option", type: "button", onclick: () => une(q.donnees.reponse === false) }, "✗ Faux"),
      el("button", { class: "f-option", type: "button", onclick: () => une(q.donnees.reponse === true) }, "✓ Vrai"))];
  }
  const [avant, apres] = q.donnees.texte.split("___");
  return [el("p", { class: "f-phrase" }, avant, el("span", { class: "f-trou" }, " "), apres),
    el("div", { class: "f-choix deux" }, ...melanger(q.donnees.choix).map((mot) =>
      el("button", { class: "f-option", type: "button", onclick: () => une(mot === q.donnees.reponse) }, mot)))];
}

// Bonne réponse attendue, en clair (récap de fin de partie)
function reponseEnClair(q) {
  return q.format === "vrai_faux"
    ? `${q.donnees.affirmation} C'est ${q.donnees.reponse ? "vrai" : "faux"}.`
    : q.donnees.texte.replace("___", `« ${q.donnees.reponse} »`);
}

// ---------- Mode Survie ----------
// Questions à la chaîne : 15 s au départ, chaque bonne réponse rajoute du temps (de moins en moins),
// une erreur ou le chrono à zéro arrête tout. Score = bonnes réponses ; le record reste sur l'appareil.
const CLE_SURVIE = "agon.survie";
const SURVIE_DEPART = 15000;
const SURVIE_MAX = 30000;
const bonusSurvie = (score) => (score < 10 ? 4000 : score < 20 ? 3000 : 2000);

function lireRecordSurvie() {
  try { return Number(JSON.parse(localStorage.getItem(CLE_SURVIE))?.record) || 0; } catch { return 0; }
}
function ecrireRecordSurvie(record) {
  try { localStorage.setItem(CLE_SURVIE, JSON.stringify({ record })); } catch { /* tant pis */ }
  changementLocal();
}

function creerEcranSurvie() {
  const carte = el("div", { class: "f-carte f-jeu" });
  const pile = el("div", { class: "f-pile" },
    el("div", { class: "f-haut" },
      el("p", { class: "f-matiere" }, "Survie"),
      el("p", { class: "f-format" }, el("b", {}, "Une erreur et c'est fini."), " Chaque bonne réponse rajoute du temps.")),
    carte);
  const ecran = el("section", { class: "f-ecran", "data-matiere": "survie" }, pile);

  // Toutes les matières, quels que soient les réglages : les records doivent se comparer entre joueurs
  const pool = donnees.contenus.filter((c) => contenuValide(c) && (c.format === "vrai_faux" || c.format === "trous"));
  let ordre = melanger(pool);
  let indice = 0;
  const record = lireRecordSurvie();

  carte.append(
    el("p", { class: "f-consigne" }, `Tiens le plus longtemps possible. Toutes les matières, pour que les records se comparent : ${pool.length} questions.`),
    el("p", { class: "f-discret" }, `Tu pars avec ${SURVIE_DEPART / 1000} secondes. +${bonusSurvie(0) / 1000} s par bonne réponse au début, puis de moins en moins.`),
    el("p", { class: "f-survie-record" }, record ? `Ton record : ${record}` : "Pas encore de record."),
    el("button", { class: "f-option f-lancer", type: "button", onclick: lancer }, "C'est parti"));

  const temps = el("b", { class: "f-chrono-temps" });
  const score = el("b", { class: "f-survie-score", "aria-live": "polite" }, "0");
  const jauge = el("i");
  const question = el("div", { class: "f-chrono-question" });
  let restant = SURVIE_DEPART;
  let points = 0;
  let dernierInstant = null;
  let fini = false;
  let enPause = false;   // appli en arrière-plan (appel, notification…) : le temps ne file pas

  function afficher() {
    temps.textContent = `${Math.max(0, restant / 1000).toFixed(1).replace(".", ",")} s`;
    jauge.style.width = `${Math.max(0, restant / SURVIE_MAX) * 100}%`;
    temps.classList.toggle("urgent", !fini && restant < 5000);
  }

  function tic(instant) {
    if (fini || enPause) return;
    if (dernierInstant !== null) restant -= instant - dernierInstant;
    dernierInstant = instant;
    afficher();
    if (restant <= 0) return finir(null);
    requestAnimationFrame(tic);
  }

  function lancer() {
    if (!pool.length) return;
    fil.classList.add("verrouille");   // pas de fuite pendant la partie
    carte.replaceChildren(
      el("div", { class: "f-chrono-barre" }, temps, el("span", { class: "f-survie-points" }, score, " bonnes")),
      el("div", { class: "f-chrono-jauge" }, jauge),
      question);
    afficher();
    suivante();
    requestAnimationFrame(tic);
    window.abandonnerSurvie = () => finir(null);   // bouton ✕ de l'en-tête, après confirmation
    document.addEventListener("visibilitychange", surVisibilite);
  }

  // Page cachée : on arrête le chrono ; au retour, il repart d'où il était (rien n'est décompté)
  function surVisibilite() {
    if (fini) return;
    if (document.visibilityState === "hidden") { enPause = true; return; }
    if (!enPause) return;
    enPause = false;
    dernierInstant = null;
    requestAnimationFrame(tic);
  }

  function suivante() {
    if (indice >= ordre.length) { ordre = melanger(pool); indice = 0; }
    const q = ordre[indice++];
    question.replaceChildren(...questionRapide(q, (ok) => repondre(q, ok)));
    question.classList.remove("entre"); void question.offsetWidth; question.classList.add("entre");
  }

  function repondre(q, ok) {
    if (fini) return;
    enregistrerResultat(q.id, ok);   // compte aussi dans la progression et la répétition espacée
    if (!ok) return finir(q);
    const bonus = bonusSurvie(points);
    points++;
    score.textContent = String(points);
    restant = Math.min(SURVIE_MAX, restant + bonus);
    const plus = el("span", { class: "f-penalite f-bonus", "aria-hidden": "true" }, `+${bonus / 1000} s`);
    temps.parentElement.append(plus);
    setTimeout(() => plus.remove(), 900);
    question.classList.remove("eclair-ok", "eclair-ko"); void question.offsetWidth; question.classList.add("eclair-ok");
    suivante();
  }

  function finir(rate) {
    fini = true;
    window.abandonnerSurvie = null;
    document.removeEventListener("visibilitychange", surVisibilite);
    remettreQuitter();   // un « Abandonner ? » en attente ne doit pas survivre à la partie
    restant = Math.max(0, restant);
    afficher();
    const nouveauRecord = points > record;
    if (nouveauRecord) ecrireRecordSurvie(points);
    if (typeof Compte !== "undefined") Compte.publierPartie(points);   // chaque partie compte pour la semaine
    const tampon = el("div", { class: `f-tampon ${nouveauRecord ? "ok" : "ko"}` }, nouveauRecord ? "Record !" : "Perdu");
    carte.replaceChildren(
      el("div", { class: "f-survie-fin" },
        tampon,
        el("p", { class: "f-survie-total" }, el("b", {}, String(points)), ` bonne${points > 1 ? "s" : ""} réponse${points > 1 ? "s" : ""}`),
        el("p", { class: "f-discret" }, nouveauRecord
          ? (record ? `Ancien record : ${record}.` : "Premier record enregistré.")
          : `Ton record reste ${record}.`)),
      rate ? el("div", { class: "f-recap" }, el("b", {}, "La bonne réponse"), el("p", {}, reponseEnClair(rate)))
        : el("div", { class: "f-recap" }, el("b", {}, "Temps écoulé"), el("p", {}, "Le chrono est tombé à zéro.")),
      el("button", { class: "f-option f-lancer", type: "button", onclick: construireFil }, "Rejouer"),
      el("button", { class: "f-option f-retour-survie", type: "button", onclick: () => Classement.ouvrir("semaine") }, "Voir le classement"),
      el("button", { class: "f-option f-retour-survie", type: "button", onclick: afficherAccueil }, "Retour au menu"));
    // Connecté : une fois la partie envoyée, on annonce un top 10 de la semaine
    if (typeof Compte !== "undefined" && Compte.profil()) {
      Compte.synchroniser().then(() => Classement.rangCetteSemaine()).then((rang) => {
        if (rang && rang <= 10 && carte.isConnected)
          carte.querySelector(".f-survie-fin")?.append(el("p", { class: "f-survie-rang" }, `${Classement.rangTexte(rang)} cette semaine !`));
      }).catch(() => { /* hors ligne : rien à annoncer */ });
    }
    fil.classList.remove("verrouille");
  }

  return ecran;
}

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
// Les règles sont dans validation.js, partagé avec les outils de génération (outils/valider.mjs).
const cartesEcartees = new Set();
function contenuValide(c) {
  const erreurs = FacettesValidation.erreursCarte(c);
  if (erreurs.length && !cartesEcartees.has(c)) {
    cartesEcartees.add(c);   // un seul avertissement par carte
    console.warn("Carte écartée :", c?.id ?? c, erreurs);
  }
  return erreurs.length === 0;
}

// ---------- Ordre du fil ----------
// Une fiche puis quelques jeux (au moins JEUX_PAR_FICHE, plus s'il y a beaucoup de jeux, pour ne pas
// les entasser en fin de fil). On évite deux cartes de suite de la même matière ou du même format.
// Un jeu est « dû » s'il n'a jamais été joué, ou si son délai de boîte est passé (boîte 1 : tout de suite).
// Les jeux dus passent devant, les plus fragiles (boîte basse) d'abord ; le reste suit, mélangé.
function prioriteJeu(c, resultats, maintenant) {
  const r = resultats[c.id];
  if (!r || r.derniereOk === undefined) return 1;   // jamais joué : dû, après les ratés
  const boite = r.boite || (r.derniereOk ? 2 : 1);
  const echeance = new Date(r.dernier).getTime() + BOITES_JOURS[boite - 1] * 86400000;
  if (maintenant < echeance) return 10 + boite;     // pas encore dû : en fin de fil
  return boite === 1 ? 0 : boite;                   // dû : les ratés en tout premier
}

// Les notions « DS passé » restent, mais après tout le reste (on les entretient sans y passer son temps)
function ordonner(contenus) {
  const dsPasse = contenus.filter((c) => etatCase(c.matiere, c.notion) === "ds_passe");
  if (dsPasse.length && dsPasse.length < contenus.length)
    return [...ordonnerSans(contenus.filter((c) => !dsPasse.includes(c))), ...ordonnerSans(dsPasse)];
  return ordonnerSans(contenus);
}
function ordonnerSans(contenus) {
  const fiches = melanger(contenus.filter((c) => c.format === "fiche"));
  const resultats = lireResultats();
  const maintenant = Date.now();
  // Mélange puis tri stable : à priorité égale, l'ordre reste aléatoire
  const jeux = melanger(contenus.filter((c) => c.format !== "fiche"))
    .map((c) => ({ c, p: prioriteJeu(c, resultats, maintenant) }))
    .sort((a, b) => a.p - b.p)
    .map((x) => x.c);
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

  // Tube du jour : la question est jouée avec son format habituel ; le résultat remplit la collection
  tube(d, terminer) {
    const q = d.question;
    let zoneVitrine = vitrine(lireCollection());
    const blocs = formats[q.format](q.donnees, (reussi, titre, texte, enPlus) => {
      enregistrerResultat(q.id, reussi);   // la question compte aussi dans les stats et la répétition espacée
      const c = lireCollection();
      c.dernierJour = jourDuJour();
      let gagne = null;
      if (reussi) {
        c.vinyles++;
        gagne = "vinyle";
        if (c.vinyles >= VINYLES_PAR_DISQUE) { c.vinyles = 0; c.disquesOr++; gagne = "or"; }
      }
      ecrireCollection(c);
      const nouvelle = vitrine(c, gagne);
      zoneVitrine.replaceWith(nouvelle);
      zoneVitrine = nouvelle;
      terminer(reussi,
        gagne === "or" ? "Disque d'or ! 7 vinyles réunis." : reussi ? "Gagné : un vinyle de plus !" : "Raté pour aujourd'hui. Nouveau tube demain.",
        [titre, texte].filter(Boolean).join(" "), enPlus);
    });
    return [el("p", { class: "f-tube-regle" }, "Une seule chance aujourd'hui. Réussis-le pour gagner un vinyle."),
      ...blocs, zoneVitrine];
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
      question.replaceChildren(...questionRapide(d.questions[indice], repondre));
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
  const question = contenu.format === "tube" ? contenu.donnees.question : null;
  const haut = question
    ? [el("p", { class: "f-matiere" }, "Le tube du jour"),
       el("p", { class: "f-format" }, el("b", {}, NOMS_FORMATS[question.format]),
         ` sur ${question.notion}, ${donnees.matieres.find((m) => m.id === question.matiere)?.nom ?? question.matiere}`)]
    : contenu.format === "chrono"
    ? [lettreDeRancon("Prise d'otage"),
       el("p", { class: "f-format" }, el("b", {}, "Ton cerveau est retenu."),
         ` ${contenu.donnees.questions.length} bonnes réponses en ${DUREE_CHRONO / 1000} secondes pour le libérer.`)]
    : [el("p", { class: "f-matiere" }, matiere ? matiere.nom : contenu.matiere),
       el("p", { class: "f-format" }, el("b", {}, NOMS_FORMATS[contenu.format]), ` sur ${contenu.notion}`,
         lireResultats()[contenu.id]?.derniereOk === false ? el("span", { class: "f-a-revoir" }, "À revoir") : null)];
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
  if (contenu.notion) ecran.dataset.notion = contenu.notion;
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

// iOS, app installée : la zone d'affichage peut s'arrêter avant le bas de l'écran (la hauteur de la barre d'état
// en moins) alors que la page commence tout en haut. On mesure ce qui manque pour étendre les écrans et la barre
// d'onglets jusqu'en bas. Au-delà de 80 px, ce n'est pas ce défaut (paysage, clavier ouvert) : on ne touche à rien.
function mesurerBasManquant() {
  const installee = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const manque = installee ? Math.round(screen.height - document.documentElement.clientHeight) : 0;
  document.documentElement.style.setProperty("--manque-bas", `${manque > 0 && manque <= 80 ? manque : 0}px`);
}
mesurerBasManquant();
addEventListener("resize", mesurerBasManquant);

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
    && !reglages.matieresExclues.includes(c.matiere) && !reglages.formatsExclus.includes(c.format)
    && etatCase(c.matiere, c.notion) !== "a_venir");   // pas encore vue en cours : pas dans le fil
}

// Glisse une Prise d'otage toutes les CARTES_ENTRE_CHRONOS cartes, avec des questions rapides tirées au hasard
function ajouterChronos(liste) {
  if (reglages.formatsExclus.includes("chrono")) return liste;
  const rapides = donnees.contenus.filter((c) => (c.format === "vrai_faux" || c.format === "trous")
    && contenuValide(c) && !reglages.matieresExclues.includes(c.matiere)
    && etatCase(c.matiere, c.notion) !== "a_venir");   // pas de question sur ce qui n'est pas encore vu en cours
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

// Le fil a deux modes : « session » (toutes les cartes) ou « tube » (le tube du jour, seul)
let modeFil = "session";
let cibleFil = null;   // fils ciblés : { matiere } (album) ou { matiere, notion } (une piste)

function construireFil() {
  observateurEcrans.disconnect();
  fil.classList.remove("verrouille");
  const retenus = contenusRetenus();
  let ecrans;
  if (modeFil === "tube") {
    const tube = tubeDuJour();
    ecrans = [...(tube ? [creerCarte(tube)] : []), carteRetourMenu()];
  } else if (modeFil === "survie") {
    ecrans = [creerEcranSurvie()];
  } else if (modeFil === "notion" || modeFil === "album") {
    // Choix explicite : on ignore les matières exclues et les cases, mais pas les formats non cochés
    const cible = donnees.contenus.filter((c) => contenuValide(c) && c.matiere === cibleFil.matiere
      && (modeFil === "album" || c.notion === cibleFil.notion) && !reglages.formatsExclus.includes(c.format));
    ecrans = cible.length ? [...ordonnerSans(cible).map(creerCarte), carteFinCiblee()] : [carteVideCiblee()];
  } else {
    ecrans = retenus.length ? [...ajouterChronos(ordonner(retenus)).map(creerCarte), carteFin()] : [carteVide()];
  }
  fil.replaceChildren(...ecrans);
  for (const ecran of ecrans) observateurEcrans.observe(ecran);
  fil.scrollTo({ top: 0 });
}

function carteVide() {
  return el("section", { class: "f-ecran" }, el("div", { class: "f-carte f-fin" },
    el("h2", {}, "Aucune carte à afficher"),
    el("p", { class: "f-discret" }, "Les matières et les jeux cochés dans les paramètres ne donnent aucune carte."),
    el("button", { class: "btn btn-principal", type: "button", onclick: () => Profil.ouvrirParametres() }, "Ouvrir les paramètres")));
}

function carteFin() {
  return el("section", { class: "f-ecran" }, el("div", { class: "f-carte f-fin" },
    el("h2", {}, "Tu as fait le tour"),
    el("p", { class: "f-discret" }, "Toutes les cartes du moment sont passées."),
    el("button", { class: "btn btn-principal", type: "button", onclick: afficherAccueil }, "Retour au menu"),
    el("button", { class: "btn btn-secondaire", type: "button", onclick: construireFil }, "Remélanger et continuer")));
}

// Fin d'un fil ciblé : on revient sur le même album
function retourDiscotheque() {
  if (typeof Discotheque !== "undefined") Discotheque.ouvrir(cibleFil?.matiere);
  else afficherAccueil();
}
function carteFinCiblee() {
  return el("section", { class: "f-ecran" }, el("div", { class: "f-carte f-fin" },
    el("h2", {}, cibleFil?.notion ? "Piste terminée" : "Album terminé"),
    el("p", { class: "f-discret" }, cibleFil?.notion ?? donnees.matieres.find((m) => m.id === cibleFil?.matiere)?.nom ?? ""),
    el("button", { class: "btn btn-principal", type: "button", onclick: retourDiscotheque }, "Retour à la discothèque"),
    el("button", { class: "btn btn-secondaire", type: "button", onclick: afficherAccueil }, "Retour au menu")));
}
function carteVideCiblee() {
  return el("section", { class: "f-ecran" }, el("div", { class: "f-carte f-fin" },
    el("h2", {}, "Aucune carte à afficher"),
    el("p", { class: "f-discret" }, "Les jeux cochés dans les paramètres ne donnent aucune carte ici."),
    el("button", { class: "btn btn-principal", type: "button", onclick: retourDiscotheque }, "Retour à la discothèque"),
    el("button", { class: "btn btn-secondaire", type: "button", onclick: () => Profil.ouvrirParametres() }, "Ouvrir les paramètres")));
}

function carteRetourMenu() {
  return el("section", { class: "f-ecran" }, el("div", { class: "f-carte f-fin" },
    el("h2", {}, "À demain"),
    el("p", { class: "f-discret" }, "Un nouveau tube t'attendra demain dans le menu."),
    el("button", { class: "btn btn-principal", type: "button", onclick: afficherAccueil }, "Retour au menu")));
}

// ---------- Accueil (mosaïque) ----------
const accueil = document.getElementById("accueil");

const ecranDiscotheque = document.getElementById("discotheque");
const ecranClassement = document.getElementById("classement");
const ecranAmis = document.getElementById("amis");
const ecranProfil = document.getElementById("profil");
// Les écrans pleins (hors accueil et fil) : un seul visible à la fois
function cacherEcrans() {
  for (const e of [ecranDiscotheque, ecranClassement, ecranAmis, ecranProfil]) e.classList.add("cache");
  document.body.classList.remove("vue-profil");
}

function afficherAccueil() {
  if (fil.classList.contains("verrouille")) return;   // pas de fuite pendant une Prise d'otage
  if (typeof Portail !== "undefined" && Portail.estOuvert()) return;   // compte obligatoire : rien derrière le portail
  observateurEcrans.disconnect();
  fil.classList.add("cache");
  document.body.classList.remove("fil-ouvert");
  cacherEcrans();
  accueil.classList.remove("cache");
  Nav.afficher("accueil");
  zoneScore.classList.add("cache");
  metaTheme.setAttribute("content", Apparence.fondEcrans());
  document.documentElement.style.setProperty("--fond-actif", Apparence.fondEcrans());
  remplirAccueil();
  accueil.scrollTo({ top: 0 });
}

function montrerFil(mode, cible = null) {
  if (typeof Portail !== "undefined" && Portail.estOuvert()) return;
  modeFil = mode;
  cibleFil = cible;
  accueil.classList.add("cache");
  cacherEcrans();
  document.body.classList.add("fil-ouvert");   // pas de mini-avatar : elle ferait quitter la session
  Nav.afficher(null);
  fil.classList.remove("cache");
  construireFil();
  afficherScore();
}

// L'accueil tourne autour de la boule à facettes : une facette par notion, allumée quand elle est maîtrisée.
// Le titre dit quelque chose de vrai sur tes révisions ; un seul gros bouton, sous le pouce.
function notionsParEtat() {
  const resultats = lireResultats();
  const cartes = donnees.contenus.filter((c) => contenuValide(c));
  const notions = [];
  for (const m of donnees.matieres) {
    const cartesMatiere = cartes.filter((c) => c.matiere === m.id);
    for (const nom of new Set(cartesMatiere.map((c) => c.notion))) {
      notions.push({ matiere: m, nom, etat: etatNotion(cartesMatiere.filter((c) => c.notion === nom), resultats) });
    }
  }
  return notions;
}


// Cases d'une grille carrée dont le centre tombe dans le cercle, rangées par angle :
// chaque matière occupe ainsi un quartier de la boule, comme les reflets d'une vraie boule à facettes.
function casesDeLaBoule(nombre) {
  for (let n = 5; n < 40; n++) {
    const cases = [];
    const r = n / 2;
    for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) {
      const dx = c + 0.5 - r, dy = l + 0.5 - r;
      if (Math.hypot(dx, dy) <= r - 0.15) cases.push({ c, l, angle: Math.atan2(dy, dx) });
    }
    if (cases.length >= nombre) {
      cases.sort((a, b) => a.angle - b.angle);
      return { n, cases };   // toutes les cases : la boule reste ronde, les notions y sont réparties
    }
  }
  return { n: 1, cases: [] };
}

function dessinerBoule(notions) {
  const SVG = "http://www.w3.org/2000/svg";
  const { n, cases } = casesDeLaBoule(notions.length);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${n * 10} ${n * 10}`);
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("f-boule-svg");
  // Notion i sur la case n° i × (cases / notions) : réparties sur tout le tour, les autres cases restent décor
  const notionDeCase = new Map(notions.map((notion, i) => [Math.floor((i * cases.length) / notions.length), notion]));
  cases.forEach((cel, i) => {
    const notion = notionDeCase.get(i);
    const r = document.createElementNS(SVG, "rect");
    r.setAttribute("x", cel.c * 10 + 1);
    r.setAttribute("y", cel.l * 10 + 1);
    r.setAttribute("width", 8);
    r.setAttribute("height", 8);
    r.setAttribute("rx", 2);
    r.setAttribute("class", `f-facette-boule ${notion ? notion.etat : "decor"}`);
    if (notion) r.setAttribute("data-matiere", notion.matiere.id);
    r.style.setProperty("--i", i);
    svg.append(r);
  });
  return svg;
}

function remplirAccueil() {
  const retenus = contenusRetenus();
  const nbMatieres = new Set(retenus.map((c) => c.matiere)).size;
  const tube = tubeDuJour();
  const notions = notionsParEtat();
  const allumees = notions.filter((n) => n.etat === "maitrisee").length;
  if (typeof Compte !== "undefined") Compte.publierNotions(allumees);   // vu par les amis
  const collection = lireCollection();
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  const jour = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const boule = el("button", { class: "f-boule", type: "button", onclick: () => Discotheque.ouvrir(),
    "aria-label": `Ta boule : ${allumees} notions maîtrisées sur ${notions.length}. Ouvrir ta discothèque.` },
    dessinerBoule(notions));

  // Le tube du jour prend la place de la facette qui saute, sur le bord de la boule
  const bulle = el("button", { class: "f-bulle-tube" + (tube ? "" : " jouee"), type: "button",
    "aria-label": tube ? "Jouer le tube du jour" : "Tube du jour déjà joué, nouveau tube demain" },
    el("span", { class: "f-bulle-vinyle", "aria-hidden": "true" }),
    el("span", { class: "f-bulle-texte" }, tube ? "Tube du jour" : "Tube joué"));
  if (tube) bulle.addEventListener("click", () => montrerFil("tube"));
  else bulle.disabled = true;

  const vinyles = el("span", { class: "f-mini-vinyles", "aria-hidden": "true" },
    ...Array.from({ length: VINYLES_PAR_DISQUE }, (_, i) => el("i", { class: i < collection.vinyles ? "plein" : "" })));

  accueil.replaceChildren(el("div", { class: "f-accueil-col f-accueil-boule" },
    el("p", { class: "f-accueil-date" }, jour),
    el("div", { class: "f-scene-zone" }, el("div", { class: "f-scene" }, boule, bulle)),
    el("p", { class: "f-boule-legende" },
      el("b", {}, `${allumees} notion${allumees > 1 ? "s" : ""} allumée${allumees > 1 ? "s" : ""} sur ${notions.length}`),
      " Touche la boule pour ouvrir ta discothèque."),
    el("div", { class: "f-accueil-bas" },
      el("button", { class: "f-lancer-session", type: "button", onclick: () => montrerFil("session") },
        el("span", { class: "f-tuile-rond", "aria-hidden": "true" }, icone("M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z")),
        el("span", { class: "f-lancer-texte" },
          el("b", {}, "Lancer la session"),
          el("span", {}, `${pluriel(retenus.length, "carte")}, ${pluriel(nbMatieres, "matière")}`))),
      el("p", { class: "f-ligne-info" }, vinyles,
        `${collection.vinyles}/${VINYLES_PAR_DISQUE} vinyles` + (collection.disquesOr ? `, ${pluriel(collection.disquesOr, "disque")} d'or` : "")),
      el("div", { class: "f-accueil-duo" },
        el("button", { class: "f-bouton-survie", type: "button", onclick: () => montrerFil("survie") },
          el("b", {}, "Mode survie"),
          el("span", {}, lireRecordSurvie() ? `Record : ${lireRecordSurvie()}` : "Pas encore joué")),
        el("button", { class: "f-bouton-survie f-bouton-classement", type: "button", onclick: () => Classement.ouvrir() },
          el("b", {}, "Classement"), el("span", {}, "Semaine et record"))),
      Installer.carte())));
}

// ---------- État d'une notion (accueil, discothèque) ----------
// État d'une notion à partir de ses cartes : un jeu raté → à revoir ; tous les jeux réussis → maîtrisée
function etatNotion(cartes, resultats) {
  const jeux = cartes.filter((c) => c.format !== "fiche");
  if (jeux.some((c) => resultats[c.id]?.derniereOk === false)) return "a_revoir";
  if (jeux.length && jeux.every((c) => resultats[c.id]?.derniereOk === true)) return "maitrisee";
  if (cartes.some((c) => resultats[c.id]?.vu > 0)) return "en_cours";
  return "pas_vue";
}

// Petite icône pleine (un seul tracé), pour les tuiles
function icone(d) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  p.setAttribute("fill", "currentColor");
  svg.append(p);
  return svg;
}

document.getElementById("btn-accueil").addEventListener("click", afficherAccueil);

// ---------- Réglages et progression (écrans dans profil.js) ----------
let reglagesModifies = false;

function basculerDans(liste, valeur, actif) {
  const i = liste.indexOf(valeur);
  if (actif && i >= 0) liste.splice(i, 1);
  if (!actif && i < 0) liste.push(valeur);
}

// Après chaque synchro réussie : le nombre de notions allumées vu par les amis
addEventListener("facettes:synchro", () => {
  if (donnees) Compte.publierNotions(notionsParEtat().filter((n) => n.etat === "maitrisee").length);
});

// Une synchro a rapporté du nouveau (autre appareil) : on redessine ce qui est à l'écran.
// Le fil en cours n'est pas reconstruit, pour ne pas couper une partie.
window.apresSynchro = () => {
  Apparence.appliquer(lireReglages().apparence);   // thème ou taille changés sur un autre appareil
  if (!donnees) return;
  if (!accueil.classList.contains("cache")) remplirAccueil();
  else if (!ecranDiscotheque.classList.contains("cache")) Discotheque.rafraichir();
  else if (!ecranAmis.classList.contains("cache")) Amis.recharger();
  else if (Profil.estOuvert()) Profil.rafraichir();
};

// Effacer sa progression (Paramètres, après confirmation) : les résultats seulement, pas la collection ni le record.
// La date de remise voyage avec les réglages : les autres appareils effacent aussi leurs anciens résultats.
function effacerProgression() {
  try { localStorage.removeItem(CLE_RESULTATS); } catch { /* tant pis */ }
  reglages.remise = new Date().toISOString();
  ecrireReglages(reglages);
  session.joues = session.reussis = 0;
  afficherScore();
}

// ✕ de l'en-tête pendant le fil : retour à l'accueil. En Survie, un premier appui demande confirmation (4 s) ;
// pendant une Prise d'otage (quelques secondes), il ne fait rien.
const btnQuitter = document.getElementById("btn-quitter");
const ICONE_QUITTER = btnQuitter.innerHTML;
let minuteurQuitter = null;
function remettreQuitter() {
  clearTimeout(minuteurQuitter);
  btnQuitter.classList.remove("confirmer");
  btnQuitter.innerHTML = ICONE_QUITTER;
  btnQuitter.setAttribute("aria-label", "Quitter la session");
}
btnQuitter.addEventListener("click", () => {
  if (fil.classList.contains("verrouille")) {
    if (!window.abandonnerSurvie) return;
    if (!btnQuitter.classList.contains("confirmer")) {
      btnQuitter.classList.add("confirmer");
      btnQuitter.textContent = "Abandonner ?";
      btnQuitter.setAttribute("aria-label", "Abandonner la partie");
      minuteurQuitter = setTimeout(remettreQuitter, 4000);
      return;
    }
    window.abandonnerSurvie();
  }
  remettreQuitter();
  afficherAccueil();
});

// Version de l'appli (réponse du service worker), affichée en bas des Paramètres
let versionAppli = null;

// ---------- Navigation : une carte à la fois ----------
// Le défilement natif part trop loin avec l'élan (doigt, trackpad, molette). Le fil n'accepte donc
// aucun défilement libre (overflow: hidden) : chaque geste fait avancer ou reculer d'exactement une carte.

function indexCourant() { return Math.round(fil.scrollTop / fil.clientHeight); }

// indexCible retient la carte visée pendant l'animation, pour que deux flèches rapides fassent deux cartes
let indexCible = null;
let minuteurCible = null;
function allerDe(sens) {
  if (fil.classList.contains("verrouille") || fil.classList.contains("cache") || document.querySelector("dialog[open]")) return;
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
  if (e.ctrlKey || e.altKey || e.metaKey || document.querySelector("dialog[open]") || fil.classList.contains("verrouille")) return;
  if (e.target.closest("input, textarea, select, [contenteditable]")) return;   // on tape du texte
  if (typeof Portail !== "undefined" && Portail.estOuvert()) return;
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
    // portail.js est chargé après app.js : on attend la fin du chargement de la page
    if (document.readyState === "loading") await new Promise((ok) => addEventListener("DOMContentLoaded", ok, { once: true }));
    Portail.decider();   // sans session gardée : le portail ; sinon l'accueil
  } catch (err) {
    accueil.classList.add("cache");
    fil.classList.remove("cache");
    fil.replaceChildren(el("section", { class: "f-ecran" }, el("div", { class: "f-carte" },
      el("h2", {}, "Impossible de charger les cartes"),
      el("p", { class: "f-discret" }, navigator.onLine === false
        ? "Pas de connexion, et aucune carte n'est encore en mémoire. Reconnecte-toi puis recharge la page."
        : `Recharge la page. Si ça persiste, vérifie que l'appli est servie par un serveur (py -m http.server). Détail : ${err.message}`))));
  }
}

// Écran de lancement : un toucher le fait lever tout de suite
const lancement = document.getElementById("lancement");
lancement?.addEventListener("pointerdown", () => lancement.classList.add("passe"));
lancement?.addEventListener("animationend", (e) => { if (e.target === lancement) lancement.remove(); });

// ---------- Mises à jour ----------
// Quand une nouvelle version prend la main : rechargement direct au démarrage, sinon une étiquette
// « Nouvelle version » propose de recharger (pour ne pas couper une partie en cours).
const DEBUT = Date.now();
if ("serviceWorker" in navigator) {
  const avaitUneVersion = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register("sw.js").then((r) => r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!avaitUneVersion) return;   // première installation : rien à recharger
    if (Date.now() - DEBUT < 10000 && !fil.classList.contains("verrouille")) return location.reload();
    if (document.querySelector(".f-maj")) return;
    document.body.append(el("button", { class: "f-maj", type: "button", onclick: () => location.reload() },
      "Nouvelle version : toucher pour recharger"));
  });
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (!e.data?.version) return;
    versionAppli = e.data.version.replace(/^[a-z]+-/, "");
    const zone = document.getElementById("version");
    if (zone) zone.textContent = `Version ${versionAppli}`;
  });
}
demarrer();
