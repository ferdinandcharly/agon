// Outil de test navigateur de Facettes : serveur statique + Edge headless piloté par CDP (sans dépendance).
// Chaque « appareil » est un contexte séparé (stockage et service worker à part), en taille iPhone ou PC.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, resolve, dirname } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".woff2": "font/woff2" };

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// Serveur statique minimal (l'appli doit être servie en http pour le service worker)
export async function demarrerServeur(racine = "app", port = 8765) {
  const base = resolve(racine);
  const serveur = createServer(async (req, res) => {
    const chemin = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const fichier = resolve(base, "." + (chemin.endsWith("/") ? chemin + "index.html" : chemin));
    if (!fichier.startsWith(base)) { res.writeHead(403).end(); return; }
    try {
      const contenu = await readFile(fichier);
      res.writeHead(200, { "Content-Type": TYPES[extname(fichier)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(contenu);
    } catch { res.writeHead(404).end("introuvable"); }
  });
  await new Promise((ok) => serveur.listen(port, "127.0.0.1", ok));
  return { url: `http://localhost:${port}/`, arreter: () => new Promise((ok) => serveur.close(ok)) };
}

export async function lancerEdge() {
  const profil = mkdtempSync(join(tmpdir(), "facettes-edge-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${port}`, "--no-first-run",
    "--no-default-browser-check", `--user-data-dir=${profil}`, "about:blank"], { stdio: "ignore" });
  let version = null;
  for (let i = 0; i < 40 && !version; i++) {
    await attendre(250);
    version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
  }
  if (!version) throw new Error("Edge headless ne répond pas");
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((ok) => ws.addEventListener("open", ok));

  let n = 0;
  const attente = new Map();
  const ecouteurs = new Map();   // sessionId → fonction(message)
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && attente.has(m.id)) { attente.get(m.id)(m); attente.delete(m.id); return; }
    if (m.sessionId && ecouteurs.has(m.sessionId)) ecouteurs.get(m.sessionId)(m);
  });
  const cdp = (method, params = {}, sessionId) => new Promise((ok, ko) => {
    const id = ++n;
    attente.set(id, (m) => (m.error ? ko(new Error(`${method} : ${m.error.message}`)) : ok(m.result)));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

  async function nouvelAppareil({ largeur = 390, hauteur = 844, mobile = true, ua = null } = {}) {
    const { browserContextId } = await cdp("Target.createBrowserContext");
    const { targetId } = await cdp("Target.createTarget", { url: "about:blank", browserContextId });
    const { sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true });
    const appareil = { violationsCsp: [], erreurs: [], requetes: [] };
    ecouteurs.set(sessionId, (m) => {
      const p = m.params;
      if (m.method === "Runtime.exceptionThrown") appareil.erreurs.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
      if (m.method === "Runtime.consoleAPICalled" && p.type === "error")
        appareil.erreurs.push(p.args.map((a) => a.value ?? a.description).join(" "));
      if (m.method === "Log.entryAdded") {
        const texte = p.entry.text || "";
        if (/Content Security Policy/i.test(texte)) appareil.violationsCsp.push(texte);
        else if (p.entry.level === "error" && p.entry.source !== "network") appareil.erreurs.push(texte);
      }
      if (m.method === "Network.requestWillBeSent")
        appareil.requetes.push({ url: p.request.url, methode: p.request.method, corps: p.request.postData ?? null });
    });
    for (const domaine of ["Runtime", "Log", "Network", "Page"]) await cdp(`${domaine}.enable`, {}, sessionId);
    await cdp("Emulation.setDeviceMetricsOverride", { width: largeur, height: hauteur, deviceScaleFactor: mobile ? 3 : 1, mobile }, sessionId);
    if (mobile) await cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
    if (ua) await cdp("Emulation.setUserAgentOverride", { userAgent: ua }, sessionId);   // se faire passer pour un iPhone

    async function evaluer(expression) {
      const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
      if (r.exceptionDetails) throw new Error(`evaluer(${expression.slice(0, 80)}) : ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    }
    Object.assign(appareil, {
      evaluer,
      async aller(url) { await cdp("Page.navigate", { url }, sessionId); await attendre(1500); },
      async attendreQue(expression, delai = 8000) {
        const fin = Date.now() + delai;
        while (Date.now() < fin) { if (await evaluer(expression).catch(() => false)) return; await attendre(150); }
        throw new Error(`attendu en ${delai} ms : ${expression}`);
      },
      async cliquer(selecteur) {
        await appareil.attendreQue(`!!document.querySelector(${JSON.stringify(selecteur)})`);
        await evaluer(`document.querySelector(${JSON.stringify(selecteur)}).click()`);
        await attendre(300);
      },
      async couperReseau(coupe) {
        await cdp("Network.emulateNetworkConditions", { offline: coupe, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
      },
      async encoche(haut, bas) { await cdp("Emulation.setSafeAreaInsetsOverride", { insets: { top: haut, bottom: bas, left: 0, right: 0 } }, sessionId); },   // marges d'un vrai iPhone
      async avantPage(source) { await cdp("Page.addScriptToEvaluateOnNewDocument", { source }, sessionId); },   // avant les scripts de la page
      async bloquerUrls(motifs) { await cdp("Network.setBlockedURLs", { urls: motifs }, sessionId); },
      async capture(chemin) {
        const { data } = await cdp("Page.captureScreenshot", { format: "png" }, sessionId);
        mkdirSync(dirname(chemin), { recursive: true });
        writeFileSync(chemin, Buffer.from(data, "base64"));
      },
    });
    return appareil;
  }

  return {
    nouvelAppareil,
    async fermer() { ws.close(); edge.kill(); await attendre(500); try { rmSync(profil, { recursive: true, force: true }); } catch { /* Edge garde parfois un verrou */ } },
  };
}
