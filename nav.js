// Facettes — barre d'onglets du bas : Disco · Accueil · Amis (comme une app).
// Visible sur l'accueil, la discothèque, l'écran Amis et le classement ; cachée dans le fil de cartes.
// Chargé avant app.js : les écrans qu'elle ouvre (afficherAccueil, Discotheque, Amis) sont lus au clic.
"use strict";

const Nav = (() => {
  const barre = document.getElementById("nav");
  const pastilleAmis = barre.querySelector(".f-nav-pastille");

  const ouvrir = {
    disco: () => Discotheque.ouvrir(),
    accueil: () => afficherAccueil(),
    amis: () => { if (typeof Amis !== "undefined") Amis.ouvrir(); },
  };
  barre.querySelectorAll("button[data-onglet]").forEach((b) => b.addEventListener("click", () => ouvrir[b.dataset.onglet]()));

  // onglet : "disco" | "accueil" | "amis" | "classement" (barre sans onglet actif) | null (barre cachée)
  function afficher(onglet) {
    barre.classList.toggle("cache", onglet === null);
    document.body.classList.toggle("avec-nav", onglet !== null);
    barre.querySelectorAll("button[data-onglet]").forEach((b) => {
      if (b.dataset.onglet === onglet) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
  }

  // Demandes reçues + records battus non vus ; 0 cache la pastille
  function pastille(n) {
    pastilleAmis.classList.toggle("cache", !(n > 0));
    pastilleAmis.textContent = n > 9 ? "9+" : n > 0 ? String(n) : "";
    barre.querySelector('[data-onglet="amis"]').setAttribute("aria-label", n > 0 ? `Amis, ${n} nouveauté${n > 1 ? "s" : ""}` : "Amis");
  }

  return { afficher, pastille };
})();
