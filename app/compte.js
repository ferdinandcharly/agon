// Facettes — compte et synchro PC/iPhone (Supabase, projet « facettes », Paris).
// Connexion par code reçu par e-mail : un lien magique s'ouvrirait dans Safari, pas dans l'appli
// installée sur l'iPhone (elles ne partagent pas leurs données).
// Sans compte, rien ne change : tout reste dans localStorage. Avec un compte, la progression est fusionnée
// entre appareils : carte par carte la plus récente gagne ; collection et record, le plus grand gagne.
"use strict";

const SUPABASE_URL = "https://hiqymrmygjisqqypbfxp.supabase.co";
const SUPABASE_CLE = "sb_publishable_2HJGYwOQeUPh7BoNbMGQ5Q_jFNLOVJj";   // clé publique : c'est la RLS qui protège les données
const DELAI_ENVOI = 3000;   // ms : on regroupe les réponses rapprochées en un seul envoi

// Turnstile (Cloudflare) protège l'envoi des codes contre les robots ; Supabase vérifie le jeton côté serveur.
// Sur localhost seulement, ?turnstile=ok|ko prend les clés de test officielles de Cloudflare.
const TURNSTILE_CLE = (() => {
  const test = { ok: "1x00000000000000000000AA", ko: "2x00000000000000000000AB" }[new URLSearchParams(location.search).get("turnstile")];
  return location.hostname === "localhost" && test ? test : "0x4AAAAAAGKGu9RQ0EvSTWc5";
})();
const DELAI_TURNSTILE = 8000;   // ms : au-delà, on considère Turnstile injoignable

const Compte = (() => {
  // La bibliothèque peut manquer (fichier non chargé) : l'appli reste utilisable sans compte
  const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_CLE, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "agon.session" },
  }) ?? null;

  let utilisateur = null;
  let etat = "deconnecte";   // deconnecte | synchro | ok | hors-ligne | erreur
  let derniereSynchro = null;
  let minuteur = null;
  let enCours = null;
  let aRefaire = false;
  let conteneur = null;      // section « Compte » des réglages, redessinée à chaque changement
  let emailEnAttente = null; // adresse à qui on vient d'envoyer un code
  let profil;               // undefined = pas encore lu, null = pas de pseudo, { pseudo } ; sans pseudo, les parties attendent
  let recordAMoi = true;     // le record de cet appareil appartient-il au compte connecté (pas à un compte précédent) ?
  const CLE_COMPTE = "agon.compte";        // dernier compte connecté sur cet appareil
  const CLE_CLASSEMENT = "agon.classement"; // cache du classement (pseudos des autres) : propre à un compte
  const CLE_NOTIONS = "agon.notions.publiees";   // dernier nombre de notions allumées envoyé au profil

  // Publie le nombre de notions allumées (vu par les amis) s'il a changé ; silencieux en cas d'échec
  async function publierNotions(n) {
    if (!sb || !utilisateur || !profil || navigator.onLine === false) return;
    n = Math.max(0, Math.min(2000, Math.round(Number(n) || 0)));
    let deja = null;
    try { deja = JSON.parse(localStorage.getItem(CLE_NOTIONS)); } catch { /* tant pis */ }
    if (deja === n) return;
    try {
      const { error } = await sb.from("profils").update({ notions_allumees: n }).eq("user_id", utilisateur.id);
      if (!error) localStorage.setItem(CLE_NOTIONS, JSON.stringify(n));
    } catch { /* réessayé à la prochaine synchro */ }
  }

  // Caches propres à un compte (pseudos des autres, amis, dernière visite, notions publiées)
  function oublierCachesDuCompte() {
    for (const cle of [CLE_CLASSEMENT, "agon.amis", "agon.amis.vu", CLE_NOTIONS])
      try { localStorage.removeItem(cle); } catch { /* tant pis */ }
    if (typeof Amis !== "undefined") Amis.oublier();   // pastille de l'onglet Amis
  }

  // ---------- File des parties de Survie (agon.parties) ----------
  // Chaque partie a un id créé ici : renvoyée deux fois, elle n'est comptée qu'une fois.
  const CLE_PARTIES = "agon.parties";
  function lireFile() {
    try { const v = JSON.parse(localStorage.getItem(CLE_PARTIES)); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  function ecrireFile(file) {
    try { file.length ? localStorage.setItem(CLE_PARTIES, JSON.stringify(file)) : localStorage.removeItem(CLE_PARTIES); }
    catch { /* tant pis */ }
  }
  // Chaque partie porte son compte : sur un appareil partagé, on n'envoie jamais celles d'un autre
  const fileDe = (file, id) => file.filter((p) => p.user_id === id);
  function publierPartie(score, joueLe = new Date()) {
    if (!utilisateur) return;   // sans compte, seul le record local existe
    ecrireFile([...lireFile(), { id: crypto.randomUUID(), user_id: utilisateur.id, score, joue_le: joueLe.toISOString() }]);
    programmer();
  }

  // Envoie la file ; une partie quitte la file une fois reçue, ou refusée pour de bon (date, rafale, score)
  async function envoyerParties() {
    const file = fileDe(lireFile(), utilisateur.id);
    if (!profil || !file.length) return;
    const { error } = await sb.from("parties_survie").upsert(file, { onConflict: "id", ignoreDuplicates: true });
    if (!error) { ecrireFile(lireFile().filter((p) => !file.some((f) => f.id === p.id))); return; }
    if (error.code !== "P0001" && error.code !== "23514") throw error;   // réseau ou autre : on réessaiera
    // Refus définitif d'une partie : on les renvoie une par une pour ne perdre que la fautive
    for (const partie of file) {
      const { error: e } = await sb.from("parties_survie").upsert([partie], { onConflict: "id", ignoreDuplicates: true });
      if (e && e.code !== "P0001" && e.code !== "23514") throw e;
      if (e) console.warn("[Facettes] partie refusée :", e.message);
      ecrireFile(lireFile().filter((p) => p.id !== partie.id));
    }
  }

  // Profil : undefined = pas encore lu, null = pas de profil, sinon { pseudo, avatar, prenom, etablissement, parcours }.
  // Chaque changement est signalé (mini-avatar de l'en-tête, écran Profil).
  function changerProfil(p) {
    profil = p;
    dispatchEvent(new Event("facettes:profil"));
  }

  async function lireProfil() {
    const { data, error } = await sb.from("profils").select("pseudo, avatar, prenom, etablissement, parcours").maybeSingle();
    if (error) throw error;
    changerProfil(data);
  }

  // ---------- Fusion ----------
  function lireLocal() {
    return { resultats: lireResultats(), reglages: lireReglages(), collection: lireCollection(),
             survie: { record: lireRecordSurvie() } };
  }

  function fusionnerResultats(a, b, remise) {
    const tout = { ...a };
    for (const [id, r] of Object.entries(b && typeof b === "object" ? b : {})) {
      if (!r || typeof r !== "object") continue;
      if (!tout[id] || (r.dernier || "") > (tout[id].dernier || "")) tout[id] = r;
    }
    // Une remise à zéro faite sur un autre appareil efface aussi les résultats plus anciens d'ici
    if (remise) for (const id of Object.keys(tout)) if ((tout[id].dernier || "") <= remise) delete tout[id];
    return tout;
  }

  // Réglages : les derniers modifiés gagnent en bloc, cases des notions comprises (à égalité, ceux de cet appareil) ;
  // la remise à zéro la plus récente vaut partout
  function fusionReglages(local, rd) {
    const remise = [local.remise, rd.remise].filter(Boolean).sort().pop() || null;
    const distantPlusRecent = Array.isArray(rd.matieresExclues) && Array.isArray(rd.formatsExclus)
      && (rd.maj || "") > (local.maj || "");
    const fusion = distantPlusRecent
      ? { matieresExclues: rd.matieresExclues, formatsExclus: rd.formatsExclus, maj: rd.maj,
          // Un appareil resté sur une ancienne version n'envoie pas de cases : on garde celles d'ici
          notions: rd.notions === undefined ? (local.notions || {}) : lireCases(rd.notions) }
      : { ...local, notions: local.notions || {} };
    fusion.remise = remise;
    return fusion;
  }

  function fusionner(local, distant) {
    const reglagesFusion = fusionReglages(local.reglages, distant.reglages || {});
    const remise = reglagesFusion.remise;

    const cd = distant.collection || {};
    const total = (c) => (Number(c.disquesOr) || 0) * VINYLES_PAR_DISQUE + (Number(c.vinyles) || 0);
    const collection = total(cd) > total(local.collection)
      ? { vinyles: Number(cd.vinyles) || 0, disquesOr: Number(cd.disquesOr) || 0 }
      : { vinyles: local.collection.vinyles, disquesOr: local.collection.disquesOr };
    collection.dernierJour = [local.collection.dernierJour, cd.dernierJour]
      .filter((j) => typeof j === "string").sort().pop() || null;
    collection.jours = fusionnerJours(local.collection.jours, cd.jours);

    return {
      resultats: fusionnerResultats(local.resultats, distant.resultats, remise),
      reglages: reglagesFusion,
      collection,
      survie: { record: Math.max(local.survie.record, Number(distant.survie?.record) || 0) },
    };
  }

  // Écriture directe (sans repasser par les fonctions de app.js, qui reprogrammeraient un envoi)
  function viderProgressionLocale() {
    for (const cle of [CLE_RESULTATS, CLE_REGLAGES, CLE_COLLECTION, CLE_SURVIE])
      try { localStorage.removeItem(cle); } catch { /* tant pis */ }
    reglages = lireReglages();
    setTimeout(() => window.apresSynchro?.(), 0);   // l'écran affiché ne garde pas les chiffres de l'autre compte
  }

  function ecrireLocal(p) {
    try {
      localStorage.setItem(CLE_RESULTATS, JSON.stringify(p.resultats));
      localStorage.setItem(CLE_REGLAGES, JSON.stringify(p.reglages));
      localStorage.setItem(CLE_COLLECTION, JSON.stringify(p.collection));
      localStorage.setItem(CLE_SURVIE, JSON.stringify(p.survie));
    } catch { /* tant pis : la prochaine synchro réessaiera */ }
    reglages = lireReglages();
  }

  // ---------- Synchro ----------
  function changerEtat(nouveau) {
    etat = nouveau;
    dessiner();
  }

  // Lit la ligne du compte, fusionne avec cet appareil, écrit le résultat des deux côtés
  function synchroniser() {
    if (!sb || !utilisateur) return Promise.resolve();
    clearTimeout(minuteur);
    minuteur = null;
    if (enCours) { aRefaire = true; return enCours; }
    enCours = (async () => {
      changerEtat("synchro");
      try {
        // Le profil d'abord : un échec ailleurs ne doit pas laisser croire qu'il n'y a pas de pseudo
        try { await lireProfil(); } catch { /* on réessaiera à la prochaine synchro */ }
        const { data, error } = await sb.from("progression")
          .select("resultats, reglages, collection, survie").maybeSingle();
        if (error) throw error;
        const local = lireLocal();
        const fusion = data ? fusionner(local, data) : local;
        const change = JSON.stringify(fusion) !== JSON.stringify(local);
        if (change) ecrireLocal(fusion);
        const { error: e2 } = await sb.from("progression")
          .upsert({ user_id: utilisateur.id, ...fusion, maj: new Date().toISOString() });
        if (e2) throw e2;
        await envoyerParties();
        derniereSynchro = new Date();
        changerEtat("ok");
        dispatchEvent(new Event("facettes:synchro"));   // amis.js : pastille ; app.js : notions publiées
        if (change) window.apresSynchro?.();
      } catch (err) {
        console.warn("[Facettes] synchro :", err);
        changerEtat(navigator.onLine === false ? "hors-ligne" : "erreur");
      } finally {
        enCours = null;
        if (aRefaire) { aRefaire = false; synchroniser(); }
      }
    })();
    return enCours;
  }

  // Appelée par app.js après chaque écriture locale
  function programmer() {
    if (!utilisateur) return;
    clearTimeout(minuteur);
    minuteur = setTimeout(synchroniser, DELAI_ENVOI);
  }

  // Appli mise en arrière-plan : on envoie tout de suite ce qui attendait. Retour : on récupère
  // ce qui a été fait sur l'autre appareil entre-temps.
  document.addEventListener("visibilitychange", () => {
    if (!utilisateur) return;
    if (document.visibilityState === "hidden") { if (minuteur) synchroniser(); }
    else synchroniser();
  });
  addEventListener("online", () => { if (utilisateur) synchroniser(); });

  // Pas d'appel Supabase directement dans ce rappel (verrou interne de supabase-js) : on le décale
  sb?.auth.onAuthStateChange((evenement, session) => {
    const avant = utilisateur?.id;
    utilisateur = session?.user ?? null;
    if (!utilisateur) {
      changerProfil(undefined);
      oublierCachesDuCompte();
      changerEtat("deconnecte");
      // portail.js : retour au début (aussi pour une session gardée mais refusée au démarrage)
      dispatchEvent(new Event("facettes:deconnexion"));
      return;
    }
    if (utilisateur.id !== avant) {
      changerProfil(undefined);
      dispatchEvent(new Event("facettes:connexion"));   // portail.js : étape suivante
      // Un autre compte que le précédent sur cet appareil : ni ses parties ni son record ne passent à celui-ci
      let precedent = null;
      try { precedent = localStorage.getItem(CLE_COMPTE); } catch { /* tant pis */ }
      recordAMoi = !precedent || precedent === utilisateur.id;
      if (!recordAMoi) {
        // Un autre compte que le précédent : sa progression (déjà en ligne) ne doit pas se mêler à celle-ci.
        // On repart de zéro sur l'appareil ; la synchro rapporte la progression en ligne de ce compte.
        viderProgressionLocale();
        ecrireFile(fileDe(lireFile(), utilisateur.id));
        oublierCachesDuCompte();
      }
      try { localStorage.setItem(CLE_COMPTE, utilisateur.id); } catch { /* tant pis */ }
      setTimeout(synchroniser, 0);
    }
    else dessiner();
  });

  // ---------- Actions ----------
  // Mêmes règles que la base (profils.pseudo) : 3 à 20 caractères, lettres, chiffres, _ et -
  const FORMAT_PSEUDO = /^[A-Za-z0-9_-]{3,20}$/;
  function messagePseudo(pseudo, erreur) {
    if (!FORMAT_PSEUDO.test(pseudo)) return "3 à 20 caractères : lettres, chiffres, _ et -.";
    if (!erreur) return null;
    // 23505 sur la clé primaire = ce compte a déjà un profil (lu trop tôt), pas un pseudo pris
    if (erreur.code === "23505" && /profils_pkey/.test(`${erreur.message} ${erreur.details || ""}`))
      return "Tu as déjà un pseudo : il va s'afficher.";
    if (erreur.code === "23505") return "Déjà pris : essaie un autre pseudo.";
    return messageErreur(erreur);
  }

  // Crée le profil (et publie le record déjà fait sur cet appareil) ou change le pseudo
  async function enregistrerPseudo(pseudo) {
    const invalide = messagePseudo(pseudo);
    if (invalide) throw Object.assign(new Error(invalide), { messageAffiche: invalide });
    const requete = profil
      ? sb.from("profils").update({ pseudo }).eq("user_id", utilisateur.id)
      : sb.from("profils").insert({ pseudo });
    const { error } = await requete;
    if (error?.code === "23505" && /profils_pkey/.test(`${error.message} ${error.details || ""}`)) {
      await lireProfil();   // le profil existait déjà : on l'affiche au lieu de dire « Déjà pris »
      return;
    }
    if (error) throw Object.assign(error, { messageAffiche: messagePseudo(pseudo, error) });
    const premier = !profil;
    changerProfil({ ...profil, pseudo });
    // Le record de l'appareil n'est publié que s'il appartient à ce compte
    if (premier && recordAMoi && lireRecordSurvie() > 0) publierPartie(lireRecordSurvie());
    await synchroniser();
  }

  // Profil complet du portail : pseudo et avatar (publics), prénom et établissement (privés), parcours
  async function enregistrerProfil({ pseudo, avatar, prenom, etablissement, parcours }) {
    const invalide = messagePseudo(pseudo);
    if (invalide) throw Object.assign(new Error(invalide), { messageAffiche: invalide });
    const ligne = { pseudo, avatar, prenom: prenom || null, etablissement: etablissement || null, parcours: parcours || "but-info-1" };
    const mettreAJour = () => sb.from("profils").update(ligne).eq("user_id", utilisateur.id);
    let { error } = await (profil ? mettreAJour() : sb.from("profils").insert(ligne));
    if (error?.code === "23505" && /profils_pkey/.test(`${error.message} ${error.details || ""}`)) {
      await lireProfil();   // le profil existait déjà (lu trop tôt) : on le met à jour
      ({ error } = await mettreAJour());
    }
    if (error) throw Object.assign(error, { messageAffiche: messagePseudo(pseudo, error) });
    const premier = !profil;
    changerProfil({ ...ligne });
    if (premier && recordAMoi && lireRecordSurvie() > 0) publierPartie(lireRecordSurvie());
    await synchroniser();
  }

  function messageErreur(err) {
    const code = err?.code || "";
    if (navigator.onLine === false || err?.name === "AuthRetryableFetchError") return "Pas de connexion. Réessaie quand tu as du réseau.";
    if (err?.status === 429 || code.includes("rate_limit")) return "Trop de demandes d'un coup. Attends une minute avant de réessayer.";
    if (code === "captcha_failed") return "La vérification anti-robot a échoué. Réessaie.";
    if (code === "otp_expired"|| code === "invalid_credentials") return "Code faux ou expiré. Vérifie le dernier e-mail reçu, ou redemande un code.";
    if (code === "email_address_invalid" || code === "validation_failed") return "Cette adresse e-mail n'est pas valide.";
    return `Ça n'a pas marché (${err?.message || "erreur inconnue"}).`;
  }

  // Le script n'est chargé qu'à l'affichage du formulaire (l'appli hors ligne n'en dépend pas)
  let chargementTurnstile = null;
  function chargerTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (!chargementTurnstile) {
      chargementTurnstile = new Promise((ok, ko) => {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        const delai = setTimeout(() => ko(new Error("délai dépassé")), DELAI_TURNSTILE);
        script.onload = () => { clearTimeout(delai); window.turnstile ? ok() : ko(new Error("turnstile absent")); };
        script.onerror = () => { clearTimeout(delai); ko(new Error("chargement impossible")); };
        document.head.append(script);
      }).catch((err) => { chargementTurnstile = null; throw err; });   // on réessaiera au prochain affichage
    }
    return chargementTurnstile;
  }

  async function envoyerCode(email, jeton) {
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken: jeton } });
    if (error) throw error;
    emailEnAttente = email;
  }

  async function verifierCode(code) {
    const { error } = await sb.auth.verifyOtp({ email: emailEnAttente, token: code, type: "email" });
    if (error) throw error;
    emailEnAttente = null;
  }

  // Déconnexion de cet appareil seulement ; sa progression reste en local
  async function deconnecter() {
    if (minuteur) await synchroniser();
    await sb.auth.signOut({ scope: "local" });
  }

  // Supprime le compte et sa progression, en ligne (RGPD) et sur cet appareil : sinon le prochain compte
  // (même recréé avec la même adresse) la reprendrait, l'appareil paraissant jamais connecté
  async function supprimer() {
    clearTimeout(minuteur);
    minuteur = null;
    const { error } = await sb.rpc("supprimer_mon_compte");
    if (error) throw error;
    ecrireFile(lireFile().filter((p) => p.user_id !== utilisateur?.id));   // les parties du compte supprimé
    oublierCachesDuCompte();
    try { localStorage.removeItem(CLE_COMPTE); } catch { /* tant pis */ }
    viderProgressionLocale();
    changerProfil(undefined);
    await sb.auth.signOut({ scope: "local" }).catch(() => {});
  }

  // ---------- Section « Compte » des réglages ----------
  function texteEtat() {
    if (etat === "synchro") return "Synchronisation…";
    if (etat === "hors-ligne") return "Hors ligne : la synchro reprendra au retour du réseau.";
    if (etat === "erreur") return "Synchro impossible pour l'instant. Elle sera retentée.";
    if (derniereSynchro) return `Synchronisé à ${derniereSynchro.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`;
    return "Pas encore synchronisé.";
  }

  // Bouton qui désactive le formulaire pendant l'appel et affiche l'erreur éventuelle
  function surEnvoi(formulaire, message, action) {
    formulaire.addEventListener("submit", async (e) => {
      e.preventDefault();
      const boutons = formulaire.querySelectorAll("button, input");
      boutons.forEach((b) => { b.disabled = true; });
      message.textContent = "";
      try { await action(); dessiner(); }
      catch (err) {
        boutons.forEach((b) => { b.disabled = false; });
        message.textContent = err?.messageAffiche || messageErreur(err);
      }
    });
  }

  // Sans pseudo : le formulaire (obligatoire pour le classement). Avec : le pseudo et « Changer ».
  let changementPseudo = false;
  function blocPseudo(message) {
    if (profil === undefined) return el("p", { class: "f-discret f-pseudo" }, "Chargement de ton pseudo…");
    if (profil && !changementPseudo) {
      return el("p", { class: "f-pseudo" }, "Pseudo : ", el("b", {}, profil.pseudo), " ",
        el("button", { class: "f-lien", type: "button", onclick: () => { changementPseudo = true; dessiner(); } }, "Changer"));
    }
    const champ = el("input", { class: "f-champ", type: "text", autocomplete: "nickname", required: "", maxlength: "20",
      placeholder: "Ton pseudo", "aria-label": "Pseudo", value: profil?.pseudo || "" });
    const formulaire = el("form", { class: "f-compte-form" }, champ,
      el("button", { class: "f-option f-compte-valider", type: "submit" }, "Valider"));
    surEnvoi(formulaire, message, async () => { await enregistrerPseudo(champ.value.trim()); changementPseudo = false; });
    return el("div", { class: "f-pseudo" },
      el("p", { class: "f-discret" }, profil ? "Ton nouveau pseudo :" : "Choisis ton pseudo pour apparaître dans le classement. Il sera visible des autres joueurs."),
      formulaire);
  }

  // Un redessin (à chaque synchro) ne doit pas effacer ce qu'on est en train de taper
  function dessiner() {
    const champ = conteneur?.querySelector("input");
    const garde = champ && { label: champ.getAttribute("aria-label"), valeur: champ.value, focus: document.activeElement === champ };
    dessinerSection();
    if (!garde) return;
    const nouveau = [...conteneur.querySelectorAll("input")].find((c) => c.getAttribute("aria-label") === garde.label);
    if (!nouveau) return;
    if (garde.valeur && !nouveau.value) nouveau.value = garde.valeur;
    if (garde.focus) nouveau.focus();
  }

  function dessinerSection() {
    if (!conteneur) return;
    const message = el("p", { class: "f-compte-msg", role: "status" });
    if (!sb) {
      conteneur.replaceChildren(el("p", { class: "f-discret" }, "Compte indisponible : recharge l'appli quand tu as du réseau."));
      return;
    }

    if (utilisateur) {
      const supprimerBtn = el("button", { class: "f-option f-danger", type: "button" }, "Supprimer mon compte");
      let minuteurSuppr = null;
      supprimerBtn.addEventListener("click", async () => {
        if (!supprimerBtn.classList.contains("confirmer")) {
          supprimerBtn.classList.add("confirmer");
          supprimerBtn.textContent = "Confirmer : supprimer le compte";
          minuteurSuppr = setTimeout(() => {
            supprimerBtn.classList.remove("confirmer");
            supprimerBtn.textContent = "Supprimer mon compte";
          }, 4000);
          return;
        }
        clearTimeout(minuteurSuppr);
        supprimerBtn.disabled = true;
        try { await supprimer(); }
        catch (err) { supprimerBtn.disabled = false; message.textContent = messageErreur(err); }
      });
      conteneur.replaceChildren(
        el("p", {}, "Connecté avec ", el("b", {}, utilisateur.email || "ton adresse")),
        blocPseudo(message),
        el("p", { class: "f-discret" }, texteEtat()),
        el("div", { class: "f-choix deux f-compte-actions" },
          el("button", { class: "f-option", type: "button", onclick: () => synchroniser() }, "Synchroniser"),
          el("button", { class: "f-option", type: "button",
            onclick: () => deconnecter().catch((err) => { message.textContent = messageErreur(err); }) }, "Se déconnecter")),
        message,
        el("button", { class: "f-option f-donnees-ouvrir", type: "button",
          onclick: () => { if (typeof Donnees !== "undefined") Donnees.ouvrir(); } }, "Tes données et export"),
        el("p", { class: "f-discret f-compte-note" },
          "Supprimer le compte efface ta progression, en ligne et sur cet appareil."),
        supprimerBtn);
      return;
    }

    if (emailEnAttente) {
      const champ = el("input", { class: "f-champ", type: "text", inputmode: "numeric", autocomplete: "one-time-code",
        pattern: "[0-9]{6,8}", maxlength: "8", required: "", placeholder: "Code reçu", "aria-label": "Code reçu par e-mail" });
      const formulaire = el("form", { class: "f-compte-form" }, champ,
        el("button", { class: "f-option f-compte-valider", type: "submit" }, "Valider"));
      surEnvoi(formulaire, message, () => verifierCode(champ.value.trim()));
      conteneur.replaceChildren(
        el("p", { class: "f-discret" }, "Code envoyé à ", el("b", {}, emailEnAttente),
          ". Regarde tes e-mails, et les indésirables s'il n'arrive pas."),
        formulaire, message,
        el("button", { class: "f-lien", type: "button", onclick: () => { emailEnAttente = null; dessiner(); } },
          "Changer d'adresse"));
      champ.focus();
      return;
    }

    // Formulaire d'e-mail : le bouton n'est actif qu'avec un jeton Turnstile, et chaque jeton ne sert qu'une fois
    const champ = el("input", { class: "f-champ", type: "email", autocomplete: "email", required: "",
      placeholder: "ton@adresse.fr", "aria-label": "Adresse e-mail" });
    const valider = el("button", { class: "f-option f-compte-valider", type: "submit", disabled: "" }, "Recevoir un code");
    const zone = el("div", { class: "f-turnstile" });
    const formulaire = el("form", { class: "f-compte-form" }, champ, valider);
    let jeton = null;
    let widget = null;
    const renouveler = () => { try { if (widget !== null) window.turnstile.reset(widget); } catch { /* widget retiré */ } };
    formulaire.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!jeton) return;
      const utilise = jeton;
      jeton = null;
      valider.disabled = true;
      champ.disabled = true;
      message.textContent = "";
      try { await envoyerCode(champ.value.trim(), utilise); dessiner(); }
      catch (err) { champ.disabled = false; message.textContent = messageErreur(err); renouveler(); }
    });
    chargerTurnstile().then(() => {
      if (!zone.isConnected) return;
      widget = window.turnstile.render(zone, {
        sitekey: TURNSTILE_CLE, size: "flexible", theme: "light", language: "fr",
        callback: (j) => { jeton = j; valider.disabled = false; },
        "expired-callback": () => { jeton = null; valider.disabled = true; renouveler(); },
        "error-callback": () => { jeton = null; valider.disabled = true; message.textContent = "La vérification anti-robot a échoué. Réessaie."; },
      });
    }).catch(() => {
      message.textContent = "Vérification anti-robot indisponible : réessaie avec une autre connexion (sans bloqueur).";
    });
    conteneur.replaceChildren(
      el("p", { class: "f-discret" }, "Connecte-toi pour retrouver ta progression, ta collection et ton record sur PC et sur iPhone. Pas de mot de passe : un code par e-mail."),
      formulaire, zone, message,
      el("button", { class: "f-lien", type: "button", onclick: () => { if (typeof Donnees !== "undefined") Donnees.ouvrir(); } }, "Tes données"));
  }

  return {
    programmer,
    synchroniser,
    afficherDans(element) { conteneur = element; if (element) dessiner(); },   // null : ne plus rien dessiner
    publierPartie,
    publierNotions,
    enregistrerProfil,
    profil: () => profil,
    lireProfil,
    etat: () => etat,
    // Admin = posé en base dans app_metadata (que l'utilisateur ne peut pas modifier) ; à jour avec le jeton
    estAdmin: () => utilisateur?.app_metadata?.admin === true,
    messagePseudo,
    fileDe,
    fusionner,
    fusionReglages,
    client: () => sb,
    utilisateur: () => utilisateur,
  };
})();
