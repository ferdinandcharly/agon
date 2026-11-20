// Turnstile sur « Recevoir un code » : le jeton part avec la demande, il est renouvelé à chaque envoi,
// et si Turnstile ne charge pas, rien ne part et un message le dit.
// L'appel /auth/v1/otp est bloqué dans le navigateur : la requête est vue (avec son corps) mais aucun
// e-mail n'est envoyé. Clés de test Cloudflare via ?turnstile=ok (localhost seulement).
// Lancer depuis la racine du dépôt : node tests/turnstile.test.mjs
import assert from "node:assert/strict";
import { demarrerServeur, lancerEdge, attendre } from "./navigateur.mjs";

const serveur = await demarrerServeur("app", 8765);
const edge = await lancerEdge();
const demandes = (a) => a.requetes.filter((r) => r.url.includes("/auth/v1/otp") && r.methode === "POST");
const jeton = (r) => JSON.parse(r.corps || "{}").gotrue_meta_security?.captcha_token;

async function ouvrirCompte(a) {
  await a.aller(`${serveur.url}?turnstile=ok`);
  await a.attendreQue("!document.getElementById('lancement')", 6000);
  await a.cliquer("#btn-reglages");
  await a.attendreQue("!!document.querySelector('#compte input[type=email]')");
  await a.evaluer(`(() => { const c = document.querySelector('#compte input[type=email]');
    c.value = 'test@facettes.test'; c.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}
const bouton = "document.querySelector('#compte .f-compte-valider')";

let echec = null;
try {
  // 1 et 2 : jeton transmis, puis un nouveau jeton pour la demande suivante
  const a = await edge.nouvelAppareil();
  await a.bloquerUrls(["*/auth/v1/otp*"]);
  await ouvrirCompte(a);
  await a.attendreQue(`!${bouton}.disabled`, 15000);
  // Espion sur turnstile.reset : les clés de test renvoient toujours le même jeton factice, donc on vérifie
  // le renouvellement (reset + bouton bloqué jusqu'au nouveau jeton) plutôt que la valeur du jeton
  await a.evaluer(`(() => { window.__resets = 0; const r = turnstile.reset;
    turnstile.reset = (...x) => { window.__resets++; return r.apply(turnstile, x); }; })()`);
  await a.evaluer(`${bouton}.click()`);
  assert.equal(await a.evaluer(`${bouton}.disabled`), true, "scénario 2 : bouton encore actif juste après l'envoi");
  await a.attendreQue(`!${bouton}.disabled`, 15000);
  assert.ok(await a.evaluer("window.__resets") >= 1, "scénario 2 : le widget n'a pas été relancé après l'envoi");
  await attendre(500);
  await a.evaluer(`${bouton}.click()`);
  await attendre(1500);
  const envois = demandes(a);
  assert.equal(envois.length, 2, "deux demandes de code attendues");
  assert.ok(jeton(envois[0]), "scénario 1 : captcha_token absent de la première demande");
  assert.ok(jeton(envois[1]), "scénario 2 : captcha_token absent de la seconde demande");
  assert.deepEqual(a.violationsCsp, [], "violations CSP avec le widget");
  console.log("1, 2 : jeton transmis puis renouvelé");

  // 3 : Turnstile injoignable
  const b = await edge.nouvelAppareil();
  await b.bloquerUrls(["*challenges.cloudflare.com*", "*/auth/v1/otp*"]);
  await ouvrirCompte(b);
  await attendre(9000);
  const texte = await b.evaluer("document.getElementById('compte').innerText");
  assert.match(texte, /Vérification anti-robot indisponible/, "scénario 3 : message absent");
  assert.equal(await b.evaluer(`${bouton}.disabled`), true, "scénario 3 : le bouton devrait être désactivé");
  await b.evaluer(`document.querySelector('#compte form').requestSubmit()`);
  await attendre(800);
  assert.equal(demandes(b).length, 0, "scénario 3 : une demande est partie sans jeton");
  console.log("3 : Turnstile indisponible → message, bouton désactivé, rien d'envoyé");
  console.log("OK — Turnstile (3 scénarios)");
} catch (err) {
  echec = err;
} finally {
  await edge.fermer();
  await serveur.arreter();
}
if (echec) { console.error("ÉCHEC :", echec.message); process.exit(1); }
