// Service worker (brique PWA du wiki, reprise de Kairos).
// Coquille (HTML/CSS/JS/police) : cache d'abord. Données (data/*.json) : réseau d'abord avec un délai
// maximal, cache en secours, sinon les nouvelles cartes n'apparaîtraient jamais. Seules les réponses OK
// sont mises en cache. Changer VERSION à chaque livraison de la coquille pour invalider l'ancien cache.
const VERSION = "facettes-v37";
const COQUILLE = [".", "index.html", "theme.css", "fil.css", "validation.js", "app.js", "compte.js", "donnees.js", "classement.js", "discotheque.js", "livret.js", "vendor/supabase-2.119.2.js", "manifest.webmanifest",
  "favicon.svg", "icone-180.png", "icone-192.png", "icone-512.png", "icone-maskable-192.png", "icone-maskable-512.png", "installer.js", "nav.js", "amis.js", "portail.js", "profil.js", "polices/bricolage-grotesque.woff2", "data/contenus.json"];
const DELAI_RESEAU = 4000;   // ms : au-delà, on sert les cartes en cache

// cache: "reload" contourne le cache HTTP du navigateur, sinon une ancienne version d'app.js
// pourrait être figée dans le nouveau cache. skipWaiting : la nouvelle version prend la main tout de
// suite, et app.js recharge la page (ou propose de le faire) pour ne pas mélanger deux versions.
self.addEventListener("install", (evt) => {
  evt.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(COQUILLE.map((u) => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

// La page demande le numéro de version (affiché en bas des Paramètres)
self.addEventListener("message", (evt) => {
  if (evt.data === "version") evt.source?.postMessage({ version: VERSION });
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

function mettreEnCache(requete, reponse) {
  if (reponse.ok && new URL(requete.url).origin === location.origin) {
    const copie = reponse.clone();
    caches.open(VERSION).then((c) => c.put(requete, copie));
  }
  return reponse;
}

// Réseau d'abord, mais pas plus de DELAI_RESEAU ; sinon cache ; sinon erreur explicite
function reseauPuisCache(requete) {
  const reseau = fetch(requete).then((r) => mettreEnCache(requete, r));
  const delai = new Promise((_, rejeter) => setTimeout(() => rejeter(new Error("délai")), DELAI_RESEAU));
  return Promise.race([reseau, delai])
    .catch(() => caches.match(requete).then((enCache) => enCache || reseau))
    .catch(() => new Response("Hors ligne", { status: 503, statusText: "Hors ligne" }));
}

self.addEventListener("fetch", (evt) => {
  if (evt.request.method !== "GET") return;
  // Appels à Supabase (autre origine) : jamais de cache, le navigateur s'en occupe
  if (new URL(evt.request.url).origin !== location.origin) return;
  const estDonnee = new URL(evt.request.url).pathname.includes("/data/");
  evt.respondWith(
    estDonnee
      ? reseauPuisCache(evt.request)
      : caches.match(evt.request, { ignoreSearch: evt.request.mode === "navigate" }).then((trouve) => trouve || fetch(evt.request).then((r) => mettreEnCache(evt.request, r)))
  );
});
