// Facettes — écran « Amis » : records battus, classement Survie entre amis (avec les notions allumées),
// demandes reçues, ajout par pseudo exact, liste des amis et des demandes envoyées.
// Tout passe par les fonctions Supabase mes_amis, classement_amis, demander_ami, repondre_ami, retirer_ami.
// Le dernier état reçu est gardé (agon.amis) pour l'affichage hors ligne ; agon.amis.vu = dernière visite.
"use strict";

const Amis = (() => {
  const ecran = document.getElementById("amis");
  const CLE = "agon.amis";
  const CLE_VU = "agon.amis.vu";
  const NB = " ";
  const FORMAT_PSEUDO = /^[A-Za-z0-9_-]{3,20}$/;
  const PERIODES = { semaine: "Cette semaine", record: "Record" };
  let periode = "semaine";
  let vuOuverture = null;      // date de la visite précédente : l'activité affichée pendant cette visite
  let visiteEnregistree = false;   // la visite ne compte qu'une fois des données fraîches affichées
  let message = "";            // résultat du dernier « Ajouter un ami »
  let derniereRequetePastille = 0;

  function lire(cle) { try { return JSON.parse(localStorage.getItem(cle)); } catch { return null; } }
  function ecrire(cle, v) { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* tant pis */ } }
  const lireCache = () => { const c = lire(CLE); return c && typeof c === "object" ? c : {}; };
  const lireVu = () => { const v = lire(CLE_VU); return typeof v === "string" ? v : null; };
  const monRecord = () => (typeof lireRecordSurvie === "function" ? lireRecordSurvie() || 0 : 0);
  const dateCourte = (iso) => new Date(iso).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" });

  // --- Fonctions pures
  // Amis dont le record dépasse le mien (égalité exclue) et a été atteint depuis vuLe
  function recordsBattus(amis, record, vuLe) {
    const moi = record ?? 0;
    const depuis = vuLe ? Date.parse(vuLe) : -Infinity;
    return (amis || [])
      .filter((a) => a.relation === "ami" && a.record != null && a.record > moi && a.record_le && Date.parse(a.record_le) > depuis)
      .map((a) => ({ pseudo: a.pseudo, record: a.record, moi }));
  }
  function compterPastille(amis, record, vuLe) {
    return (amis || []).filter((a) => a.relation === "recue").length + recordsBattus(amis, record, vuLe).length;
  }

  // --- Actions (rpc), message d'erreur de la base repris tel quel
  function texteErreur(erreur) {
    if (Classement.estErreurReseau(erreur)) return "Pas de connexion, réessaie.";
    const m = String(erreur?.message || "Erreur inconnue").trim();
    return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? "" : ".");
  }
  async function agir(fonction, args) {
    const { data, error } = await Compte.client().rpc(fonction, args);
    if (error) throw error;
    return data;
  }
  async function envoyer(pseudo) {
    pseudo = pseudo.trim();
    if (!FORMAT_PSEUDO.test(pseudo)) {
      message = `3 à 20 caractères${NB}: lettres, chiffres, _ et -.`;
      afficherMessage();
      return;
    }
    try {
      const r = await agir("demander_ami", { p_pseudo: pseudo });
      message = r === "acceptee" ? `Vous êtes amis, ${pseudo} et toi${NB}!` : `Demande envoyée à ${pseudo}.`;
    } catch (err) { message = texteErreur(err); }
    charger();
  }
  async function action(bouton, fonction, args) {
    bouton.disabled = true;
    try { await agir(fonction, args); }
    catch (err) { message = texteErreur(err); }
    charger();
  }
  // Retirer / Annuler en deux temps
  function boutonConfirme(libelle, fonction, args) {
    const b = el("button", { class: "f-option f-amis-action", type: "button" }, libelle);
    let minuteur = null;
    b.addEventListener("click", () => {
      if (!b.classList.contains("confirmer")) {
        b.classList.add("confirmer");
        b.textContent = `Confirmer${NB}?`;
        minuteur = setTimeout(() => { b.classList.remove("confirmer"); b.textContent = libelle; }, 4000);
        return;
      }
      clearTimeout(minuteur);
      action(b, fonction, args);
    });
    return b;
  }
  function afficherMessage() {
    const p = ecran.querySelector(".f-amis-message");
    if (p) p.textContent = message;
  }

  // Avatar + pseudo d'une relation
  const qui = (a) => el("span", { class: "f-amis-qui" }, Portail.avatar(a.avatar, 30), el("b", {}, a.pseudo));

  // --- Rendu pur (testable) : etat = { amis, classement, periode, monRecord, vuLe }
  function rendre(etat, { horsLigne = false, date = null } = {}) {
    const amis = etat.amis || [];
    const parties = [];
    if (horsLigne) parties.push(el("p", { class: "f-classement-bandeau" }, `Hors ligne${NB}: ` + (date ? `amis du ${dateCourte(date)}` : "rien en mémoire")));

    // Activité
    for (const r of recordsBattus(amis, etat.monRecord, etat.vuLe))
      parties.push(el("p", { class: "f-amis-activite" }, `${r.pseudo} a battu ton record${NB}: ${r.record} (toi${NB}: ${r.moi})`));

    // Classement des amis
    const onglets = el("div", { class: "f-classement-onglets", role: "tablist" },
      ...Object.entries(PERIODES).map(([id, nom]) => {
        const b = el("button", { class: "f-classement-onglet", type: "button", role: "tab", "aria-selected": String(id === etat.periode) }, nom);
        b.addEventListener("click", () => { periode = id; charger(); });
        return b;
      }));
    const lignes = etat.classement || [];
    const vide = (t) => el("p", { class: "f-classement-vide" }, t);
    const contenu = !amis.some((a) => a.relation === "ami") ? vide("Ajoute un ami pour vous comparer.")
      : !lignes.length ? vide(etat.periode === "semaine" ? "Personne n'a encore joué cette semaine." : "Pas encore de record.")
      : el("ol", { class: "f-classement-liste" }, ...lignes.map((l) => el("li", { class: "f-classement-ligne" + (l.moi ? " moi" : "") },
          el("span", { class: "f-classement-rang" }, String(l.rang)),
          el("span", { class: "f-classement-pseudo" }, Portail.avatar(l.avatar, 30),
            el("span", { class: "f-classement-nom" }, l.pseudo, l.moi ? el("small", {}, " (toi)") : null,
              el("small", { class: "f-amis-notions" }, `${l.notions ?? 0} notion${(l.notions ?? 0) > 1 ? "s" : ""}`))),
          el("span", { class: "f-classement-score" }, String(l.score)))));
    parties.push(el("section", { class: "f-amis-bloc" }, el("h2", { class: "f-amis-titre" }, "Classement des amis"), onglets, contenu));

    // Demandes reçues
    const recues = amis.filter((a) => a.relation === "recue");
    if (recues.length) parties.push(el("section", { class: "f-amis-bloc" }, el("h2", { class: "f-amis-titre" }, "Demandes reçues"),
      ...recues.map((a) => {
        const oui = el("button", { class: "f-option f-amis-action f-amis-accepter", type: "button" }, "Accepter");
        const non = el("button", { class: "f-option f-amis-action", type: "button" }, "Refuser");
        oui.addEventListener("click", () => action(oui, "repondre_ami", { p_pseudo: a.pseudo, p_accepter: true }));
        non.addEventListener("click", () => action(non, "repondre_ami", { p_pseudo: a.pseudo, p_accepter: false }));
        return el("div", { class: "f-amis-ligne" }, qui(a), el("span", { class: "f-amis-boutons" }, oui, non));
      })));

    // Ajouter un ami
    const champ = el("input", { class: "f-amis-pseudo", id: "amis-pseudo", type: "text", autocomplete: "off", autocapitalize: "off",
      spellcheck: "false", maxlength: "20", placeholder: "Pseudo exact", "aria-label": "Pseudo de ton ami" });
    const bouton = el("button", { class: "f-option f-amis-envoyer", type: "submit" }, "Envoyer");
    const formulaire = el("form", { class: "f-amis-ajout" }, champ, bouton);
    formulaire.addEventListener("submit", (e) => { e.preventDefault(); envoyer(champ.value); });
    parties.push(el("section", { class: "f-amis-bloc" }, el("h2", { class: "f-amis-titre" }, "Ajouter un ami"), formulaire,
      el("p", { class: "f-amis-message", "aria-live": "polite" }, message)));

    // Tes amis, puis demandes envoyées
    const ligne = (a, libelle) => el("div", { class: "f-amis-ligne" }, qui(a),
      boutonConfirme(libelle, "retirer_ami", { p_pseudo: a.pseudo }));
    const mesAmis = amis.filter((a) => a.relation === "ami");
    const envoyees = amis.filter((a) => a.relation === "envoyee");
    if (mesAmis.length) parties.push(el("section", { class: "f-amis-bloc" }, el("h2", { class: "f-amis-titre" }, "Tes amis"), ...mesAmis.map((a) => ligne(a, "Retirer"))));
    if (envoyees.length) parties.push(el("section", { class: "f-amis-bloc" }, el("h2", { class: "f-amis-titre" }, "Demandes envoyées"), ...envoyees.map((a) => ligne(a, "Annuler"))));

    const rendu = el("div", { class: "f-amis-rendu" }, ...parties);
    if (horsLigne) rendu.querySelectorAll(".f-amis-action, .f-amis-pseudo, .f-amis-envoyer").forEach((x) => { x.disabled = true; });
    return rendu;
  }

  const zone = () => ecran.querySelector(".f-amis-zone");
  function invitation(texte) {
    return el("div", { class: "f-classement-invitation" }, el("p", {}, texte),
      el("button", { class: "f-option f-classement-connexion", type: "button", onclick: () => Profil.ouvrir() }, "Ouvrir mon compte"));
  }

  async function charger() {
    if (!zone()) return;
    const sb = typeof Compte !== "undefined" ? Compte.client() : null;
    const utilisateur = typeof Compte !== "undefined" ? Compte.utilisateur() : null;
    if (!sb || !utilisateur) { zone().replaceChildren(invitation("Connecte-toi pour ajouter des amis.")); return; }
    const depuisCache = () => {
      const c = lireCache();
      zone().replaceChildren(rendre({ amis: c.amis || [], classement: c.classement?.[periode] || [], periode, monRecord: monRecord(), vuLe: vuOuverture },
        { horsLigne: true, date: c.date || null }));
    };
    if (navigator.onLine === false) { depuisCache(); return; }
    if (Compte.profil() === undefined) {
      zone().replaceChildren(el("p", { class: "f-classement-vide" }, "Chargement…"));
      await Compte.synchroniser();
      if (Compte.profil() === undefined) { depuisCache(); return; }
    }
    if (!Compte.profil()) { zone().replaceChildren(invitation("Choisis un pseudo pour ajouter des amis.")); return; }
    if (!zone().childElementCount) zone().replaceChildren(el("p", { class: "f-classement-vide" }, "Chargement…"));
    const demande = periode;
    const [rel, cl] = await Promise.all([sb.rpc("mes_amis"), sb.rpc("classement_amis", { periode: demande })]);
    if (demande !== periode || ecran.classList.contains("cache")) return;
    const erreur = rel.error || cl.error;
    if (erreur) {
      if (Classement.estErreurReseau(erreur)) { depuisCache(); return; }
      zone().replaceChildren(el("div", { class: "f-classement-invitation" },
        el("p", {}, `Tes amis n'ont pas pu être chargés (${erreur.message}).`),
        el("button", { class: "f-option", type: "button", onclick: charger }, "Réessayer")));
      return;
    }
    // Données fraîches affichées : la visite compte (l'activité vue disparaîtra à la suivante). Première visite
    // (nouvel appareil, reconnexion) : rien n'est « battu », on part de maintenant.
    if (!visiteEnregistree) {
      const maintenant = new Date().toISOString();
      if (vuOuverture === null) vuOuverture = maintenant;
      ecrire(CLE_VU, maintenant);
      visiteEnregistree = true;
    }
    const c = lireCache();
    ecrire(CLE, { amis: rel.data, classement: { ...(c.classement || {}), [demande]: cl.data }, date: new Date().toISOString() });
    zone().replaceChildren(rendre({ amis: rel.data, classement: cl.data, periode: demande, monRecord: monRecord(), vuLe: vuOuverture }));
    Nav.pastille(compterPastille(rel.data, monRecord(), lireVu()));
  }

  function ouvrir() {
    if (fil.classList.contains("verrouille")) return;
    afficherAccueil();
    accueil.classList.add("cache");
    message = "";
    vuOuverture = lireVu();
    visiteEnregistree = false;
    ecran.replaceChildren(el("div", { class: "f-accueil-col" },
      el("h1", { class: "f-accueil-titre" }, "Amis"),
      el("div", { class: "f-amis-zone", "aria-live": "polite" })));
    ecran.classList.remove("cache");
    Nav.afficher("amis");
    ecran.scrollTo({ top: 0 });
    charger();
  }

  function recharger() { if (!ecran.classList.contains("cache")) charger(); }

  // Pastille de l'onglet : au plus une requête par minute (sauf force)
  async function rafraichirPastille(force = false) {
    const sb = typeof Compte !== "undefined" ? Compte.client() : null;
    if (!sb || !Compte.utilisateur() || !Compte.profil() || navigator.onLine === false) return;
    if (!force && Date.now() - derniereRequetePastille < 60000) return;
    derniereRequetePastille = Date.now();
    const { data, error } = await sb.rpc("mes_amis");
    if (error || !data) return;
    const c = lireCache();
    ecrire(CLE, { ...c, amis: data, date: new Date().toISOString() });
    Nav.pastille(compterPastille(data, monRecord(), lireVu()));
  }
  // Après chaque synchro réussie (ouverture de l'appli, retour au premier plan, retour du réseau)
  addEventListener("facettes:synchro", () => rafraichirPastille());

  // Déconnexion ou changement de compte : rien de l'ancien compte ne reste affiché
  function oublier() {
    Nav.pastille(0);
    derniereRequetePastille = 0;
  }

  return { ouvrir, recharger, rendre, recordsBattus, compterPastille, rafraichirPastille, oublier };
})();
