// Facettes — apparence : thème (auto | sombre | clair « papier ») et taille de l'affichage.
// Chargé dans le <head>, avant les styles : le bon thème est posé sur <html> avant le premier rendu (pas de flash).
// Le réglage vit dans agon.reglages.apparence (synchronisé avec les autres réglages).
"use strict";

const Apparence = (() => {
  const THEMES = ["auto", "sombre", "clair"];
  const TAILLES = ["normale", "grande", "tres-grande"];
  const racine = document.documentElement;
  const systemeClair = matchMedia("(prefers-color-scheme: light)");
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const NUIT = "#16112B";
  const PAPIER = "#FAF8F4";

  // Valeurs inconnues ou abîmées (autre appareil, ancienne version) → défauts
  function normaliser(a) {
    const o = a && typeof a === "object" && !Array.isArray(a) ? a : {};
    return { theme: THEMES.includes(o.theme) ? o.theme : "auto", taille: TAILLES.includes(o.taille) ? o.taille : "normale" };
  }

  // Thème vraiment affiché : en Auto, celui du système (qui peut changer pendant que l'appli est ouverte)
  const effectif = () => (racine.dataset.theme === "clair" || (racine.dataset.theme === "auto" && systemeClair.matches) ? "clair" : "sombre");

  // Fond des écrans hors fil (accueil, profil…) : nuit ou papier
  const fondEcrans = () => (effectif() === "clair" ? PAPIER : NUIT);

  // data-effectif sert au CSS (clair.css) ; la barre d'état de l'iPhone suit le fond, sauf dans le fil (couleur de la matière)
  function majEffectif() {
    racine.dataset.effectif = effectif();
    if (document.body?.classList.contains("fil-ouvert")) return;
    metaTheme?.setAttribute("content", fondEcrans());
    racine.style.setProperty("--fond-actif", fondEcrans());
  }

  function appliquer(a) {
    const n = normaliser(a);
    racine.dataset.theme = n.theme;
    racine.dataset.taille = n.taille;
    majEffectif();
    dispatchEvent(new Event("facettes:apparence"));
  }

  let lu = null;
  try { lu = JSON.parse(localStorage.getItem("agon.reglages"))?.apparence; } catch { /* défauts */ }
  appliquer(lu);
  systemeClair.addEventListener("change", () => { majEffectif(); dispatchEvent(new Event("facettes:apparence")); });

  return { normaliser, appliquer, effectif, fondEcrans };
})();
