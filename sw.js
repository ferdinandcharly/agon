// Service worker (brique PWA du wiki, reprise de Kairos).
// Coquille (HTML/CSS/JS/police) : cache d'abord. Données (data/*.json) : réseau d'abord avec un délai
// maximal, cache en secours, sinon les nouvelles cartes n'apparaîtraient jamais. Seules les réponses OK
// sont mises en cache. Changer VERSION à chaque livraison de la coquille pour invalider l'ancien cache.
const VERSION = "agon-v5";
const COQUILLE = [".", "index.html", "theme.css", "fil.css", "app.js", "manifest.webmanifest",
  "icone.svg", "icone-180.png", "polices/bricolage-grotesque.woff2", "data/contenus.json"];
const DELAI_RESEAU = 4000;   // ms : au-delà, on sert les cartes en cache

// cache: "reload" contourne le cache HTTP du navigateur, sinon une ancienne version d'app.js
// pourrait être figée dans le nouveau cache. Pas de skipWaiting : la nouvelle version s'installe
// au prochain lancement, pour ne jamais mélanger deux versions dans un onglet ouvert.
self.addEventListener("install", (evt) => {
  evt.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUILLE.map((u) => new Request(u, { cache: "reload" })))));
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
  const estDonnee = new URL(evt.request.url).pathname.includes("/data/");
  evt.respondWith(
    estDonnee
      ? reseauPuisCache(evt.request)
      : caches.match(evt.request, { ignoreSearch: evt.request.mode === "navigate" }).then((trouve) => trouve || fetch(evt.request).then((r) => mettreEnCache(evt.request, r)))
  );
});
