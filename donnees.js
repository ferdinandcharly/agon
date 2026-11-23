// Facettes — page « Tes données » (RGPD) : ce qu'on garde, pourquoi, où, combien de temps, et l'export.
// L'export se fait avec les droits de l'utilisateur ; hors ligne, il contient au moins ce qui est sur l'appareil.
"use strict";

const Donnees = (() => {
  const dialogue = document.getElementById("donnees");
  const NB = " ";   // espace insécable avant « : »

  // Un paragraphe « Titre : texte »
  const point = (titre, ...texte) => el("p", {}, el("b", {}, titre), `${NB}: `, ...texte);

  function partiesEnAttente() {
    try { const v = JSON.parse(localStorage.getItem("agon.parties")); return Array.isArray(v) ? v : []; } catch { return []; }
  }

  function sessionGardee() {
    try { return JSON.parse(localStorage.getItem("agon.session")); } catch { return null; }
  }

  async function exporter() {
    const sb = typeof Compte !== "undefined" ? Compte.client() : null;
    let compte = null;
    let enLigne = null;
    let profil = null;
    let parties = null;
    let amis = null;
    // L'utilisateur vient de la mémoire ou de la session gardée sur l'appareil : jamais d'appel réseau ici
    // (getSession essaierait de rafraîchir un jeton expiré et bloquerait jusqu'à 30 s hors ligne)
    const utilisateur = typeof Compte !== "undefined" ? Compte.utilisateur() || sessionGardee()?.user : null;
    if (utilisateur) compte = { email: utilisateur.email, cree_le: utilisateur.created_at };
    if (sb && utilisateur && navigator.onLine !== false) {
      try {
        const { data: ligne, error } = await sb.from("progression")
          .select("resultats, reglages, collection, survie, maj").maybeSingle();
        if (!error) enLigne = ligne;
        const p = await sb.from("profils").select("pseudo, notions_allumees, cree_le").maybeSingle();
        if (!p.error) profil = p.data;
        const q = await sb.from("parties_survie").select("score, parcours, joue_le").order("joue_le");
        if (!q.error) parties = q.data;
        if (profil) { const r = await sb.rpc("mes_amis"); if (!r.error) amis = r.data; }
      } catch { /* réseau perdu en route : on exporte ce qu'il y a sur l'appareil */ }
    }
    const contenu = {
      exporte_le: new Date().toISOString(),
      compte,
      progression_en_ligne: enLigne,
      profil,
      parties,
      amis,
      appareil: { resultats: lireResultats(), reglages: lireReglages(), collection: lireCollection(),
                  survie: { record: lireRecordSurvie() }, parties_en_attente: partiesEnAttente() },
    };
    return contenu;
  }

  // Appelée directement au toucher (sans attente avant) : l'iPhone n'ouvre la feuille de partage que pendant un geste.
  // Une appli installée sur l'écran d'accueil d'iPhone télécharge mal : on partage le fichier quand c'est possible.
  function enregistrer(contenu) {
    const fichier = new File([JSON.stringify(contenu, null, 2)], "facettes-mes-donnees.json", { type: "application/json" });
    if (navigator.canShare?.({ files: [fichier] })) {
      return navigator.share({ files: [fichier], title: "Mes données Facettes" })
        .catch((err) => { if (err?.name !== "AbortError") throw err; });   // partage annulé : pas une erreur
    }
    const lien = el("a", { href: URL.createObjectURL(fichier), download: fichier.name });
    document.body.append(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 60000);   // laisser au navigateur le temps de lire le fichier
    return Promise.resolve();
  }

  function ouvrir() {
    const message = el("p", { class: "f-compte-msg", role: "status" });
    const echec = (err) => { message.textContent = `L'export a échoué (${err?.message || "erreur inconnue"}).`; };
    // En deux temps : préparer (lecture en ligne possible), puis enregistrer au toucher suivant
    const boutonEnregistrer = el("button", { class: "f-option f-donnees-enregistrer cache", type: "button" }, "Enregistrer le fichier");
    let pret = null;
    boutonEnregistrer.addEventListener("click", () => { if (pret) enregistrer(pret).catch(echec); });
    const boutonExport = el("button", { class: "f-option f-donnees-export", type: "button" }, "Exporter mes données");
    boutonExport.addEventListener("click", async () => {
      boutonExport.disabled = true;
      message.textContent = "";
      try {
        pret = await exporter();
        boutonEnregistrer.classList.remove("cache");
        message.textContent = "Fichier prêt.";
      } catch (err) { echec(err); }
      finally { boutonExport.disabled = false; }
    });
    const fermer = el("button", { class: "f-option f-fermer", type: "button", onclick: () => dialogue.close() }, "Fermer");
    dialogue.replaceChildren(
      el("div", { class: "f-reglages-haut" }, el("h2", { id: "titre-donnees", tabindex: "-1" }, "Tes données"), fermer),
      el("section", { class: "f-donnees" },
        point("Ce qu'on garde", "ton adresse e-mail, ta progression (réponses, réglages), ta collection de vinyles, ton record, ton pseudo, tes parties de Survie (score et date), tes amis et tes demandes d'amis, et ton nombre de notions allumées. Ton pseudo et ton meilleur score sont visibles des autres joueurs connectés ; tes amis voient en plus ton record et ton nombre de notions allumées, rien d'autre. Sans compte, rien ne quitte ton appareil."),
        point("Pourquoi", "retrouver ta progression sur tous tes appareils et te classer en mode Survie. Pas de publicité, pas de mesure d'audience, pas de revente."),
        point("Où", "chez Supabase, sur des serveurs à Paris. Les codes de connexion sont envoyés par e-mail ; une vérification anti-robot de Cloudflare protège leur envoi."),
        point("Combien de temps", `tant que ton compte existe. Un compte inutilisé pendant 2${NB}ans est supprimé automatiquement.`),
        point("Tes droits", "exporter tes données avec le bouton ci-dessous, ou tout supprimer avec « Supprimer mon compte » dans les réglages. Pour toute autre demande : ",
          el("a", { href: "mailto:facettes.app@gmail.com" }, "facettes.app@gmail.com"), " (responsable : Ferdinand Charly)."),
        el("p", { class: "f-discret" }, `Facettes s'adresse aux étudiants. Avant 15${NB}ans, demande l'accord d'un parent.`),
        boutonExport, boutonEnregistrer, message));
    dialogue.showModal();
  }

  dialogue.addEventListener("click", (e) => { if (e.target === dialogue) dialogue.close(); });

  return { ouvrir, exporter, enregistrer };
})();
