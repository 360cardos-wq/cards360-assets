/*************************************************
 * SW.JS — Service Worker de Campirme
 *
 * Per publicar una versió nova de l'aplicació:
 * canvia VERSIO (qualsevol canvi a aquest fitxer
 * fa que el navegador instal·li el SW nou).
 *
 * - install : descarrega TOTA l'aplicació a la memòria cau
 *             (tot o res: si un fitxer falla, no s'instal·la
 *             i continua la versió anterior).
 * - activate: esborra només els caches vells de l'aplicació.
 *             Els "campirme-mapa-*" es conserven sempre.
 * - fetch   : primer la memòria cau (offline-first). Les
 *             navegacions ignoren ?codi=... i serveixen index.html.
 *************************************************/

const VERSIO = "2026-10-08.1";

const PREFIX_SHELL = "campirme-shell-";
const PREFIX_MAPA = "campirme-mapa-";          // reservat pel mapa offline (no es toca en actualitzar)
const CACHE_SHELL = PREFIX_SHELL + VERSIO;

const SHELL = [
    "./",
    "index.html",
    "styles.css",
    "config.js",
    "gs-shim.js",
    "app.js",
    "campirme-offline.js",
    "campirme-joc.js",
    "boot.js",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png"
];

// Recursos externs "millor esforç" (si fallen, no bloqueja la instal·lació)
const EXTERNS = [
    "https://raw.githubusercontent.com/360cardos-wq/cards360-assets/main/assets/header.jpeg"
];

// Hosts de tessel·les del mapa offline (buit fins que s'implementi el mapa)
const MAPA_HOSTS = [];

self.addEventListener("install", function (event) {

    event.waitUntil((async function () {

        const cache = await caches.open(CACHE_SHELL);

        await cache.addAll(
            SHELL.map(function (u) { return new Request(u, { cache: "reload" }); })
        );

        await Promise.all(EXTERNS.map(async function (u) {
            try { await cache.put(u, await fetch(u, { mode: "no-cors" })); }
            catch (e) { /* millor esforç */ }
        }));

        await self.skipWaiting();

    })());

});

self.addEventListener("activate", function (event) {

    event.waitUntil((async function () {

        const noms = await caches.keys();

        await Promise.all(noms.map(function (n) {

            if (n.indexOf(PREFIX_SHELL) === 0 && n !== CACHE_SHELL) {
                return caches.delete(n);
            }

        }));

        await self.clients.claim();

    })());

});

async function serveixAplicacio(req) {

    const cache = await caches.open(CACHE_SHELL);

    let resposta = await cache.match(req, { ignoreSearch: true });

    if (!resposta && req.mode === "navigate") {
        resposta = await cache.match("index.html");
    }

    if (resposta) { return resposta; }

    try { return await fetch(req); }
    catch (e) { return new Response("Sense connexió", { status: 503, statusText: "Offline" }); }

}

async function serveixMapa(req) {

    const noms = (await caches.keys()).filter(function (n) { return n.indexOf(PREFIX_MAPA) === 0; });

    for (const n of noms) {
        const r = await (await caches.open(n)).match(req);
        if (r) { return r; }
    }

    return fetch(req);

}

self.addEventListener("fetch", function (event) {

    const req = event.request;

    if (req.method !== "GET") { return; }

    const url = new URL(req.url);

    if (url.origin === self.location.origin) {
        event.respondWith(serveixAplicacio(req));
        return;
    }

    if (EXTERNS.indexOf(req.url) !== -1) {
        event.respondWith(
            caches.match(req.url).then(function (r) { return r || fetch(req); })
        );
        return;
    }

    if (MAPA_HOSTS.indexOf(url.hostname) !== -1) {
        event.respondWith(serveixMapa(req));
    }

    // La resta (Apps Script, etc.): xarxa normal.

});
