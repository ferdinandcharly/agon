// Facettes — règles de validation des cartes, partagées entre l'appli (navigateur) et les outils (Node).
// Une carte = { id, matiere, notion, format, donnees }. erreursCarte() renvoie la liste des problèmes
// (vide si la carte est bonne), en français, pour que le générateur sache quoi corriger.
"use strict";
(function (racine) {
  const estTexte = (x) => typeof x === "string" && x.trim() !== "";
  const listeDeTextes = (x, min) => Array.isArray(x) && x.length >= min && x.every(estTexte);
  const sansDoublon = (liste) => new Set(liste).size === liste.length;
  // Tabulation et saut de ligne tolérés (code), les autres caractères de contrôle non
  const contientControle = (x) => typeof x === "string" ? /[\u0000-\u0008\u000b-\u001f\u007f]/.test(x)
    : x && typeof x === "object" ? Object.values(x).some(contientControle) : false;

  // Chaque règle : [condition à respecter, message si elle ne l'est pas]
  const REGLES = {
    fiche: (d) => [
      [estTexte(d.titre), "« titre » doit être un texte non vide"],
      [listeDeTextes(d.paragraphes, 1), "« paragraphes » doit être une liste d'au moins 1 texte"],
      [d.a_retenir === undefined || estTexte(d.a_retenir), "« a_retenir », s'il existe, doit être un texte"],
    ],
    vrai_faux: (d) => [
      [estTexte(d.affirmation), "« affirmation » doit être un texte non vide"],
      [typeof d.reponse === "boolean", "« reponse » doit valoir true ou false (sans guillemets)"],
    ],
    trous: (d) => [
      [estTexte(d.texte) && d.texte.split("___").length === 2, "« texte » doit contenir exactement un trou « ___ »"],
      [listeDeTextes(d.choix, 2), "« choix » doit être une liste d'au moins 2 textes"],
      [Array.isArray(d.choix) && d.choix.includes(d.reponse), "« reponse » doit figurer telle quelle dans « choix »"],
      [Array.isArray(d.choix) && sansDoublon(d.choix), "« choix » ne doit pas contenir de doublon"],
    ],
    associer: (d) => {
      const ok = Array.isArray(d.paires) && d.paires.every((p) => Array.isArray(p) && p.length === 2 && p.every(estTexte));
      return [
        [ok && d.paires.length >= 2, "« paires » doit être une liste d'au moins 2 paires [gauche, droite]"],
        [ok && sansDoublon(d.paires.map((p) => p[0])) && sansDoublon(d.paires.map((p) => p[1])),
          "deux paires ne doivent pas avoir le même élément à gauche ou à droite"],
      ];
    },
    ordre: (d) => [
      [listeDeTextes(d.etapes, 2), "« etapes » doit être une liste d'au moins 2 textes, dans le bon ordre"],
      [Array.isArray(d.etapes) && sansDoublon(d.etapes), "deux étapes ne doivent pas être identiques"],
    ],
    erreur: (d) => [
      [Array.isArray(d.lignes) && d.lignes.length >= 2 && d.lignes.every((l) => typeof l === "string"),
        "« lignes » doit être une liste d'au moins 2 lignes de code"],
      [Number.isInteger(d.ligne_fausse) && Array.isArray(d.lignes) && d.ligne_fausse >= 0 && d.ligne_fausse < d.lignes.length,
        "« ligne_fausse » doit être le numéro d'une ligne existante, en comptant à partir de 0"],
      [estTexte(d.correction), "« correction » doit être un texte non vide"],
    ],
  };

  function erreursCarte(c) {
    if (!c || typeof c !== "object") return ["la carte n'est pas un objet"];
    const erreurs = [];
    if (!estTexte(c.id)) erreurs.push("« id » doit être un texte non vide");
    if (!estTexte(c.matiere)) erreurs.push("« matiere » doit être un texte non vide");
    if (!REGLES[c.format]) erreurs.push(`format inconnu : « ${c.format} » (attendu : ${Object.keys(REGLES).join(", ")})`);
    if (!c.donnees || typeof c.donnees !== "object") erreurs.push("« donnees » doit être un objet");
    if (erreurs.length) return erreurs;
    for (const [respectee, message] of REGLES[c.format](c.donnees)) if (!respectee) erreurs.push(message);
    // Caractère de contrôle (ex. \u0001 à la place de « : » ou « ? ») : il s'afficherait comme un carré
    if (contientControle(c.donnees))
      erreurs.push("un texte contient un caractère de contrôle invisible (\\u0001…) : remets la ponctuation voulue, souvent « : » ou « ? »");
    return erreurs;
  }

  const api = { erreursCarte, FORMATS: Object.keys(REGLES) };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.FacettesValidation = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
