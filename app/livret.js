// Facettes — livret de cours d'un album (compte admin seulement) : « + Ajouter un cours », liste, ouvrir, supprimer.
// Les fichiers vont dans l'espace privé « cours » de Supabase ; une ligne « documents » les décrit. Ferdinand les
// récupère ensuite sur son PC (outils/recuperer-cours.mjs) pour en faire des cartes avec /generer-cartes.
"use strict";

const Livret = (() => {
  const NB = " ";
  const TAILLE_MAX = 20 * 1024 * 1024;
  const TYPES = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
                  heic: "image/heic", heif: "image/heif", webp: "image/webp" };
  const extension = (nom) => (nom.match(/\.([A-Za-z0-9]+)$/)?.[1] || "").toLowerCase();
  // Safari donne parfois un type vide pour les photos HEIC : on se fie alors à l'extension
  const typeDe = (f) => (Object.values(TYPES).includes(f.type) ? f.type : TYPES[extension(f.name)] || null);

  // Contrôle avant envoi (Supabase refait le même contrôle de son côté)
  function verifierFichier(f) {
    if (!typeDe(f)) return `${f.name}${NB}: seuls les PDF et les photos (JPEG, PNG, HEIC, WebP) sont acceptés.`;
    if (f.size > TAILLE_MAX) return `${f.name}${NB}: trop lourd (20 Mo au plus).`;
    return null;
  }

  // Même règle que outils/recuperer-cours.mjs : ASCII, sans chemin, 80 caractères au plus
  function nettoyerNom(nom) {
    const ext = (nom.match(/\.[A-Za-z0-9]{1,6}$/) || [""])[0];
    const base = nom.slice(0, nom.length - ext.length).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80 - ext.length);
    return (base || "document") + ext;
  }

  const client = () => (typeof Compte !== "undefined" ? Compte.client() : null);
  const horsLigne = () => navigator.onLine === false;

  // Envoie les fichiers un par un ; sans ligne en base, le fichier envoyé est retiré (pas d'orphelin)
  async function ajouter(fichiers, matiere, message) {
    const sb = client();
    if (!sb) return;
    if (horsLigne()) { message.textContent = "Il faut du réseau pour ajouter un cours."; return; }
    const erreurs = [];
    let envoyes = 0;
    for (const f of fichiers) {
      const refus = verifierFichier(f);
      if (refus) { erreurs.push(refus); continue; }
      message.textContent = `Envoi de ${f.name}…`;
      const chemin = `${matiere}/${crypto.randomUUID()}-${nettoyerNom(f.name)}`;
      const envoi = await sb.storage.from("cours").upload(chemin, f, { contentType: typeDe(f), upsert: false });
      if (envoi.error) { erreurs.push(`${f.name}${NB}: ${envoi.error.message}`); continue; }
      const ligne = await sb.from("documents").insert({ matiere, nom: f.name, chemin, type: typeDe(f), taille: f.size });
      if (ligne.error) {
        await sb.storage.from("cours").remove([chemin]);
        erreurs.push(`${f.name}${NB}: ${ligne.error.message}`);
        continue;
      }
      envoyes++;
    }
    message.textContent = [envoyes ? `${envoyes} cours ajouté${envoyes > 1 ? "s" : ""}.` : "", ...erreurs].filter(Boolean).join(" ");
  }

  // Livret de l'album : bouton d'ajout (au cœur de l'album, sous « Réviser l'album ») + liste des documents (en bas)
  function dessiner(zone, matiere, zoneBouton = zone) {
    const sb = client();
    if (!sb || typeof Compte === "undefined" || !Compte.estAdmin()) { zone.replaceChildren(); zoneBouton.replaceChildren(); return; }
    const message = el("p", { class: "f-livret-msg", role: "status" });
    const choix = el("input", { type: "file", accept: ".pdf,image/*", multiple: "", class: "cache" });
    const liste = el("ul", { class: "f-livret-liste" });
    choix.addEventListener("change", async () => {
      const fichiers = [...choix.files];
      choix.value = "";
      if (!fichiers.length) return;
      await ajouter(fichiers, matiere, message);
      charger();
    });
    const ajouterBtn = el("button", { class: "f-option f-livret-ajouter", type: "button", onclick: () => choix.click() }, "+ Ajouter un cours");
    const titre = el("h3", {}, "Livret");
    zoneBouton.replaceChildren(ajouterBtn, choix, message);
    zone.replaceChildren(el("section", { class: "f-livret", "aria-label": "Livret de cours" }, titre, liste));

    async function charger() {
      if (horsLigne()) { liste.replaceChildren(el("li", { class: "f-discret" }, "Livret indisponible hors ligne.")); return; }
      const { data, error } = await sb.from("documents").select("id, nom, chemin, ajoute_le, statut")
        .eq("matiere", matiere).order("ajoute_le", { ascending: false });
      if (error) { liste.replaceChildren(el("li", { class: "f-discret" }, `Livret indisponible (${error.message}).`)); return; }
      titre.textContent = `Livret (${data.length})`;
      liste.replaceChildren(...(data.length ? data.map(ligne) : [el("li", { class: "f-discret" }, "Aucun cours pour l'instant.")]));
    }

    function ligne(doc) {
      const ouvrir = el("button", { class: "f-lien", type: "button" }, "Ouvrir");
      ouvrir.addEventListener("click", async () => {
        // L'onglet s'ouvre tout de suite (sinon Safari le bloque), puis reçoit le lien signé valable 1 h
        const onglet = window.open("", "_blank");
        const { data, error } = await sb.storage.from("cours").createSignedUrl(doc.chemin, 3600);
        if (error) { onglet?.close(); message.textContent = `Impossible d'ouvrir ${doc.nom} (${error.message}).`; return; }
        if (onglet) onglet.location.href = data.signedUrl; else window.location.href = data.signedUrl;
      });
      const supprimer = el("button", { class: "f-lien f-livret-suppr", type: "button" }, "Supprimer");
      let minuteur = null;
      supprimer.addEventListener("click", async () => {
        if (!supprimer.classList.contains("confirmer")) {
          supprimer.classList.add("confirmer");
          supprimer.textContent = "Confirmer";
          minuteur = setTimeout(() => { supprimer.classList.remove("confirmer"); supprimer.textContent = "Supprimer"; }, 4000);
          return;
        }
        clearTimeout(minuteur);
        const fichier = await sb.storage.from("cours").remove([doc.chemin]);
        const base = fichier.error ? fichier : await sb.from("documents").delete().eq("id", doc.id);
        if (base.error) message.textContent = `Suppression impossible (${base.error.message}).`;
        charger();
      });
      const date = new Date(doc.ajoute_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      return el("li", { class: "f-livret-doc" },
        el("span", { class: "f-livret-nom" }, doc.nom,
          el("small", {}, `${date} · ${doc.statut === "traite" ? "transformé en cartes" : "en attente"}`)),
        ouvrir, supprimer);
    }

    charger();
  }

  return { verifierFichier, dessiner, ajouter };
})();
