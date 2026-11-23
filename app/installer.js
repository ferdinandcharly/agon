// Facettes — invitation à installer l'app (carte sur l'accueil).
// Android / PC : on retient l'invitation du navigateur (beforeinstallprompt) et on l'ouvre au clic.
// iPhone : aucune invitation possible, on donne le mode d'emploi (Partager → Sur l'écran d'accueil).
// Rien quand l'app est déjà installée ; « Plus tard » la ferme pour de bon (agon.installer).
// Chargé avant app.js pour ne pas manquer l'invitation, qui peut arriver très tôt.
"use strict";

const Installer = (() => {
  const CLE = "agon.installer";
  let invitation = null;
  const zone = document.createElement("div");   // réutilisée à chaque dessin de l'accueil

  const installee = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const iphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // iPad récent, qui se dit Mac
  function fermee() { try { return localStorage.getItem(CLE) === "fermee"; } catch { return false; } }
  function fermer() {
    try { localStorage.setItem(CLE, "fermee"); } catch { /* tant pis : elle reviendra */ }
    dessiner();
  }

  function dessiner() {
    if (typeof el !== "function") return;   // app.js pas encore chargé : l'accueil redessinera
    let contenu = null;
    if (!installee() && !fermee()) {
      if (invitation) {
        contenu = [el("p", {}, el("b", {}, "Installe Facettes"), " : en plein écran, sur ton écran d'accueil, même hors ligne."),
          el("button", { class: "f-installer-oui", type: "button", onclick: installer }, "Installer l'app")];
      } else if (iphone()) {
        contenu = [el("p", {}, el("b", {}, "Installe Facettes"), " : touche ", el("b", {}, "Partager"),
          " (le carré avec une flèche), puis ", el("b", {}, "Sur l'écran d'accueil"), ".")];
      }
    }
    if (!contenu) { zone.className = ""; zone.replaceChildren(); return; }
    zone.className = "f-installer";
    zone.replaceChildren(...contenu,
      el("button", { class: "f-installer-non", type: "button", "aria-label": "Plus tard, ne plus proposer" }, "Plus tard"));
    zone.querySelector(".f-installer-non").addEventListener("click", fermer);
  }

  async function installer() {
    const i = invitation;
    if (!i) return;
    invitation = null;   // une invitation ne sert qu'une fois
    dessiner();
    try { await i.prompt(); } catch { /* fenêtre refusée par le navigateur */ }
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();   // pas de mini-barre du navigateur : c'est la carte qui invite
    invitation = e;
    dessiner();
  });
  window.addEventListener("appinstalled", () => { invitation = null; dessiner(); });

  // Carte à placer sur l'accueil (vide quand il n'y a rien à proposer)
  function carte() { dessiner(); return zone; }

  return { carte };
})();
