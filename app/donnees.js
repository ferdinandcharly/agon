// Facettes — page « Tes données » (RGPD) : ce qu'on garde, pourquoi, où, combien de temps, et l'export.
// L'export se fait avec les droits de l'utilisateur ; hors ligne, il contient au moins ce qui est sur l'appareil.
"use strict";

const Donnees = (() => {
  const dialogue = document.getElementById("donnees");
  const NB = " ";   // espace insécable avant « : »

  // Un paragraphe « Titre : texte »
  const point = (titre, ...texte) => el("p", {}, el("b", {}, titre), `${NB}: `, ...texte);

  async function exporter() {
    const sb = typeof Compte !== "undefined" ? Compte.client() : null;
    let compte = null;
    let enLigne = null;
    if (sb) {
      // getSession lit la session locale : l'e-mail reste disponible hors ligne
      const { data } = await sb.auth.getSession();
      const utilisateur = data.session?.user;
      if (utilisateur) {
        compte = { email: utilisateur.email, cree_le: utilisateur.created_at };
        try {
          const { data: ligne, error } = await sb.from("progression")
            .select("resultats, reglages, collection, survie, maj").maybeSingle();
          if (!error) enLigne = ligne;
        } catch { /* hors ligne : on exporte ce qu'il y a sur l'appareil */ }
      }
    }
    const contenu = {
      exporte_le: new Date().toISOString(),
      compte,
      progression_en_ligne: enLigne,
      appareil: { resultats: lireResultats(), reglages: lireReglages(), collection: lireCollection(),
                  survie: { record: lireRecordSurvie() } },
    };
    const lien = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(contenu, null, 2)], { type: "application/json" })),
      download: "facettes-mes-donnees.json" });
    document.body.append(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
    return contenu;
  }

  function ouvrir() {
    const message = el("p", { class: "f-compte-msg", role: "status" });
    const boutonExport = el("button", { class: "f-option f-donnees-export", type: "button" }, "Exporter mes données");
    boutonExport.addEventListener("click", async () => {
      boutonExport.disabled = true;
      message.textContent = "";
      try { await exporter(); }
      catch (err) { message.textContent = `L'export a échoué (${err?.message || "erreur inconnue"}).`; }
      finally { boutonExport.disabled = false; }
    });
    const fermer = el("button", { class: "f-option f-fermer", type: "button", onclick: () => dialogue.close() }, "Fermer");
    dialogue.replaceChildren(
      el("div", { class: "f-reglages-haut" }, el("h2", { id: "titre-donnees", tabindex: "-1" }, "Tes données"), fermer),
      el("section", { class: "f-donnees" },
        point("Ce qu'on garde", "ton adresse e-mail, ta progression (réponses, réglages), ta collection de vinyles et ton record. Sans compte, rien ne quitte ton appareil."),
        point("Pourquoi", "retrouver ta progression sur tous tes appareils. Pas de publicité, pas de mesure d'audience, pas de revente."),
        point("Où", "chez Supabase, sur des serveurs à Paris. Les codes de connexion sont envoyés par e-mail ; une vérification anti-robot de Cloudflare protège leur envoi."),
        point("Combien de temps", `tant que ton compte existe. Un compte inutilisé pendant 2${NB}ans est supprimé automatiquement.`),
        point("Tes droits", "exporter tes données avec le bouton ci-dessous, ou tout supprimer avec « Supprimer mon compte » dans les réglages. Pour toute autre demande : ",
          el("a", { href: "mailto:facettes.app@gmail.com" }, "facettes.app@gmail.com"), " (responsable : Ferdinand Charly)."),
        el("p", { class: "f-discret" }, `Facettes s'adresse aux étudiants. Avant 15${NB}ans, demande l'accord d'un parent.`),
        boutonExport, message));
    dialogue.showModal();
  }

  dialogue.addEventListener("click", (e) => { if (e.target === dialogue) dialogue.close(); });

  return { ouvrir, exporter };
})();
