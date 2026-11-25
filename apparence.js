// Facettes — apparence : thème (auto | sombre | clair « papier ») et taille de l'affichage.
// Chargé dans le <head>, avant les styles : le bon thème est posé sur <html> avant le premier rendu (pas de flash).
// Le réglage vit dans agon.reglages.apparence (synchronisé avec les autres réglages).
"use strict";

const Apparence = (() => {
  const THEMES = ["auto", "sombre", "clair"];
  const TAILLES = ["normale", "grande", "tres-grande"];
  const racine = document.documentElement;
  const systemeClair = matchMedia("(prefers-color-scheme: light)");

  // Valeurs inconnues ou abîmées (autre appareil, ancienne version) → défauts
  function normaliser(a) {
    const o = a && typeof a === "object" && !Array.isArray(a) ? a : {};
    return { theme: THEMES.includes(o.theme) ? o.theme : "auto", taille: TAILLES.includes(o.taille) ? o.taille : "normale" };
  }

  // Thème vraiment affiché : en Auto, celui du système (qui peut changer pendant que l'appli est ouverte)
  const effectif = () => (racine.dataset.theme === "clair" || (racine.dataset.theme === "auto" && systemeClair.matches) ? "clair" : "sombre");

  function appliquer(a) {
    const n = normaliser(a);
    racine.dataset.theme = n.theme;
    racine.dataset.taille = n.taille;
    dispatchEvent(new Event("facettes:apparence"));
  }

  let lu = null;
  try { lu = JSON.parse(localStorage.getItem("agon.reglages"))?.apparence; } catch { /* défauts */ }
  appliquer(lu);
  systemeClair.addEventListener("change", () => dispatchEvent(new Event("facettes:apparence")));

  return { normaliser, appliquer, effectif };
})();
