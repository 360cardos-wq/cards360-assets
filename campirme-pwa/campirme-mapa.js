/*************************************************
 * CAMPIRME-MAPA.JS — mapa cartogràfic offline
 *
 * Motor de mapa propi (Canvas 2D, SENSE llibreries ni
 * serveis externs): dibuixa tessel·les raster XYZ
 * (Web Mercator) guardades al mòbil i hi sobreposa el
 * track del tram, els waypoints i la posició del jugador.
 *
 *  - Arrossegar = moure · pessic = zoom · dos dits girant
 *    = orientar el mapa · roda/doble toc = zoom.
 *  - Les tessel·les viuen a mapa/{z}/{x}/{y}.{format} i es
 *    descarreguen a la memòria cau "campirme-mapa-<versio>"
 *    des del gate (vegeu boot.js); el Service Worker les
 *    serveix sense xarxa.
 *  - mapa/manifest.json descriu el paquet (versió, zooms,
 *    format, llista de tessel·les, atribució).
 *  - mapa/ruta.json té el track simplificat de cada tram
 *    (clau "origen>destí", p. ex. "5>6", "8>8.5").
 *************************************************/

const MAPA_PREFIX_CACHE = "campirme-mapa-";
const MAPA_CLAU_OK = "campirme_mapa_ok";   // versió descarregada del tot (localStorage)

/*************************************************
 * DESCÀRREGA (gate)
 *
 * onProgres(fet, total) · retorna una promesa amb
 * { estat: "ok" | "absent" | "error", missatge }
 *************************************************/
function mapaDescarregat() {

    try { return localStorage.getItem(MAPA_CLAU_OK) || ""; }
    catch (e) { return ""; }

}

async function descarregarMapaCampirme(onProgres) {

    let manifest;

    try {

        const r = await fetch("mapa/manifest.json", { cache: "no-store" });

        if (r.status === 404) {
            return { estat: "absent", missatge: "Cartografia no instal·lada" };
        }

        if (!r.ok) { throw new Error("HTTP " + r.status); }

        manifest = await r.json();

    }
    catch (err) {

        // Sense xarxa: si ja la teníem completa, perfecte
        if (mapaDescarregat()) {
            return { estat: "ok", missatge: "Mapa ja guardat" };
        }

        return { estat: "error", missatge: "No s'ha pogut descarregar el mapa. Torna-ho a provar amb cobertura." };

    }

    const nomCache = MAPA_PREFIX_CACHE + manifest.versio;
    const cache = await caches.open(nomCache);
    const tessel = manifest.tiles || [];
    const ext = manifest.format || "webp";

    const urlTessel = function (t) { return new URL("mapa/" + t + "." + ext, location.href).href; };

    // Quines falten?
    const falten = [];

    for (const t of tessel) {

        const u = urlTessel(t);

        if (!(await cache.match(u))) { falten.push(u); }

    }

    let fet = tessel.length - falten.length;

    if (onProgres) { onProgres(fet, tessel.length); }

    let cursor = 0;
    let errors = 0;

    async function treballador() {

        while (cursor < falten.length) {

            const u = falten[cursor++];
            let ok = false;

            for (let intent = 0; intent < 3 && !ok; intent++) {

                try {

                    const r = await fetch(u, { cache: "no-store" });

                    if (r.ok) { await cache.put(u, r); ok = true; }

                }
                catch (e) { /* reintent */ }

            }

            if (ok) { fet++; } else { errors++; }

            if (onProgres) { onProgres(fet, tessel.length); }

        }

    }

    await Promise.all([1, 2, 3, 4, 5, 6].map(treballador));

    if (errors > 0) {
        return { estat: "error", missatge: "Falten " + errors + " tessel·les. Torna-ho a provar amb cobertura." };
    }

    // Manifest guardat també a la memòria cau (el mapa el llegeix sense xarxa)
    await cache.put(
        new URL("mapa/manifest.json", location.href).href,
        new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json" } })
    );

    try { localStorage.setItem(MAPA_CLAU_OK, String(manifest.versio)); } catch (e) { }

    // Esborra versions antigues del mapa
    for (const n of await caches.keys()) {
        if (n.indexOf(MAPA_PREFIX_CACHE) === 0 && n !== nomCache) { await caches.delete(n); }
    }

    return { estat: "ok", missatge: tessel.length + " tessel·les guardades" };

}

/*************************************************
 * MOTOR DEL MAPA
 *************************************************/
const MAPA_TILE = 256;
let mapaEstat = null;
let mapaRutaCache = null;

function mapaCarregarRuta() {

    if (mapaRutaCache) { return Promise.resolve(mapaRutaCache); }

    return fetch("mapa/ruta.json")
        .then(function (r) { return r.json(); })
        .then(function (j) { mapaRutaCache = j; return j; });

}

/* lon/lat → coordenades normalitzades [0,1] Web Mercator */
function mapaProjecta(lon, lat) {

    const s = Math.sin(lat * Math.PI / 180);

    return {
        u: (lon + 180) / 360,
        v: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
    };

}

function mapaRota(x, y, graus) {

    const a = graus * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a);

    return { x: x * c - y * s, y: x * s + y * c };

}

function mapaNorm360(a) { return ((a % 360) + 360) % 360; }

function mapaDeltaAngle(a, b) { return ((a - b + 540) % 360 + 360) % 360 - 180; }

/*************************************************
 * OBRIR / TANCAR
 *
 * tramClau: "origen>destí" · origen/desti: punts del paquet
 *************************************************/
function iniciarMapaCampirme(tramClau, origen, desti) {

    const visor = document.getElementById("campirmeMapaVisor");

    visor.style.display = "block";

    if (!mapaEstat) {
        mapaCrear();
    }

    const m = mapaEstat;

    m.origen = origen;
    m.desti = desti;
    m.track = null;
    m.obert = true;
    m.avis = "";
    m.seguir = false;
    m.rumbAmunt = false;
    m.bearing = 0;

    mapaActualitzaBotons();
    mapaRedimensiona();

    Promise.all([
        mapaCarregarRuta(),
        mapaCarregarManifest()
    ]).then(function (res) {

        const ruta = res[0];

        m.track = (ruta.trams && ruta.trams[tramClau]) || null;

        if (!m.track) {
            m.avis = "Aquest tram no té track al mapa.";
        }
        else if (!m.manifest) {
            m.avis = "Cartografia no disponible en aquest dispositiu.";
        }

        mapaAjusta(false);
        mapaActualitzaJugador();
        mapaPinta();

    }).catch(function () {

        m.avis = "No s'ha pogut carregar el mapa.";
        mapaPinta();

    });

}

function tancarMapaCampirme() {

    const visor = document.getElementById("campirmeMapaVisor");

    if (visor) { visor.style.display = "none"; visor.classList.remove("campirme-mapa-full"); }

    document.body.classList.remove("campirme-mapa-bloc");

    if (mapaEstat) { mapaEstat.obert = false; }

}

function mapaCarregarManifest() {

    return fetch("mapa/manifest.json")
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (man) {

            mapaEstat.manifest = man;

            if (man) {
                mapaEstat.minZoom = man.minzoom;
                mapaEstat.maxZoom = man.maxzoom;
                mapaEstat.ext = man.format || "webp";
            }

            document.getElementById("cmAtribucio").innerText =
                (man && man.attribution) || "";

            return man;

        });

}

/*************************************************
 * CREACIÓ (una sola vegada)
 *************************************************/
function mapaCrear() {

    const canvas = document.getElementById("campirmeMapaCanvas");

    const m = mapaEstat = {

        canvas: canvas,
        ctx: canvas.getContext("2d"),

        w: 300, h: 300, dpr: 1,

        // Centre en coordenades normalitzades, zoom fraccionari i rumb (graus)
        cu: 0.5, cv: 0.5, zoom: 13, bearing: 0,

        minZoom: 11, maxZoom: 16, ext: "webp",

        manifest: null, track: null, origen: null, desti: null,

        tessel: {},         // url → { img, ok }
        tesselOrdre: [],

        punters: {},

        jugador: null,      // {lat,lng,acc}
        rumb: null,

        seguir: false,
        rumbAmunt: false,

        avis: "",
        brut: true,
        obert: true

    };

    window.addEventListener("resize", mapaRedimensiona);

    if (window.ResizeObserver) {
        new ResizeObserver(mapaRedimensiona).observe(canvas.parentNode);
    }

    mapaGestos();

    document.getElementById("cmZoomMes").onclick = function () { mapaZoomA(m.zoom + 1); };
    document.getElementById("cmZoomMenys").onclick = function () { mapaZoomA(m.zoom - 1); };
    document.getElementById("cmAjusta").onclick = function () { m.seguir = false; mapaAjusta(true); mapaActualitzaBotons(); };

    document.getElementById("cmCentra").onclick = function () {

        if (!m.jugador) { m.avis = "Encara no hi ha posició GPS."; mapaPinta(); return; }

        m.seguir = !m.seguir;

        if (m.seguir) { mapaCentraJugador(); }

        mapaActualitzaBotons();
        mapaPinta();

    };

    document.getElementById("cmNord").onclick = function () {

        m.rumbAmunt = false;
        m.bearing = 0;
        mapaActualitzaBotons();
        mapaPinta();

    };

    document.getElementById("cmRumb").onclick = function () {

        if (m.rumb === null) { m.avis = "Aquest mòbil encara no dona el rumb."; mapaPinta(); return; }

        m.rumbAmunt = !m.rumbAmunt;

        if (m.rumbAmunt) { m.bearing = m.rumb; }

        mapaActualitzaBotons();
        mapaPinta();

    };

    document.getElementById("cmFull").onclick = function () {

        const visor = document.getElementById("campirmeMapaVisor");
        const full = visor.classList.toggle("campirme-mapa-full");

        document.body.classList.toggle("campirme-mapa-bloc", full);

        setTimeout(function () { mapaRedimensiona(); mapaAjusta(false); }, 50);

    };

    mapaRedimensiona();

}

function mapaActualitzaBotons() {

    const m = mapaEstat;

    const marca = function (id, actiu) {
        document.getElementById(id).classList.toggle("cm-actiu", !!actiu);
    };

    marca("cmCentra", m.seguir);
    marca("cmRumb", m.rumbAmunt);

    // La "N" gira per indicar on és el nord
    document.getElementById("cmNordIcona").style.transform =
        "rotate(" + (-m.bearing) + "deg)";

}

function mapaRedimensiona() {

    const m = mapaEstat;

    if (!m) { return; }

    const rect = m.canvas.getBoundingClientRect();

    if (rect.width < 10) { return; }

    m.dpr = window.devicePixelRatio || 1;
    m.w = rect.width;
    m.h = rect.height;

    m.canvas.width = Math.round(m.w * m.dpr);
    m.canvas.height = Math.round(m.h * m.dpr);

    mapaPinta();

}

/*************************************************
 * VISTA
 *************************************************/
function mapaMida(zoom) { return MAPA_TILE * Math.pow(2, zoom); }

function mapaClampZoom(z) {
    return Math.max(mapaEstat.minZoom - 1, Math.min(mapaEstat.maxZoom + 2, z));
}

/* pantalla → coordenades normalitzades */
function mapaPantallaANorm(sx, sy) {

    const m = mapaEstat;
    const W = mapaMida(m.zoom);
    const off = mapaRota(sx - m.w / 2, sy - m.h / 2, m.bearing);

    return { u: m.cu + off.x / W, v: m.cv + off.y / W };

}

/* coordenades normalitzades → pantalla */
function mapaNormAPantalla(u, v) {

    const m = mapaEstat;
    const W = mapaMida(m.zoom);
    const p = mapaRota((u - m.cu) * W, (v - m.cv) * W, -m.bearing);

    return { x: p.x + m.w / 2, y: p.y + m.h / 2 };

}

/* Fixa (u,v) a la posició de pantalla (sx,sy) */
function mapaAncora(u, v, sx, sy) {

    const m = mapaEstat;
    const W = mapaMida(m.zoom);
    const off = mapaRota(sx - m.w / 2, sy - m.h / 2, m.bearing);

    m.cu = u - off.x / W;
    m.cv = v - off.y / W;

}

function mapaZoomA(z, sx, sy) {

    const m = mapaEstat;

    if (sx === undefined) { sx = m.w / 2; sy = m.h / 2; }

    const ref = mapaPantallaANorm(sx, sy);

    m.zoom = mapaClampZoom(z);

    mapaAncora(ref.u, ref.v, sx, sy);

    mapaPinta();

}

function mapaAjusta(pinta) {

    const m = mapaEstat;

    const punts = [];

    (m.track || []).forEach(function (p) { punts.push(p); });

    [m.origen, m.desti].forEach(function (p) {
        if (p) { punts.push([p.lon, p.lat]); }
    });

    if (!punts.length) { return; }

    let u0 = 9, u1 = -9, v0 = 9, v1 = -9;

    punts.forEach(function (p) {

        const q = mapaProjecta(p[0], p[1]);

        u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u);
        v0 = Math.min(v0, q.v); v1 = Math.max(v1, q.v);

    });

    m.bearing = 0;
    m.rumbAmunt = false;

    const du = Math.max(u1 - u0, 1e-6), dv = Math.max(v1 - v0, 1e-6);

    const z = Math.log2(Math.min(m.w * 0.78 / (du * MAPA_TILE), m.h * 0.78 / (dv * MAPA_TILE)));

    m.zoom = mapaClampZoom(Math.min(z, m.maxZoom + 1));
    m.cu = (u0 + u1) / 2;
    m.cv = (v0 + v1) / 2;

    mapaActualitzaBotons();

    if (pinta !== false) { mapaPinta(); }

}

function mapaCentraJugador() {

    const m = mapaEstat;

    if (!m.jugador) { return; }

    const q = mapaProjecta(m.jugador.lng, m.jugador.lat);

    m.cu = q.u;
    m.cv = q.v;

}

/*************************************************
 * JUGADOR (el crida campirme-joc.js amb cada lectura)
 *************************************************/
function mapaActualitzaJugador() {

    const m = mapaEstat;

    if (!m || !m.obert) { return; }

    if (typeof campirmeBruixolaPosicio !== "undefined" && campirmeBruixolaPosicio) {

        m.jugador = {
            lat: campirmeBruixolaPosicio.lat,
            lng: campirmeBruixolaPosicio.lng,
            acc: campirmeBruixolaPrecisioGPS || 0
        };

    }

    m.rumb = (typeof campirmeBruixolaHeading !== "undefined") ? campirmeBruixolaHeading : null;

    if (m.rumbAmunt && m.rumb !== null) {
        m.bearing = mapaNorm360(m.bearing + 0.3 * mapaDeltaAngle(m.rumb, m.bearing));
    }

    if (m.seguir && m.jugador) { mapaCentraJugador(); }

    if (m.rumbAmunt) { mapaActualitzaBotons(); }

    mapaPinta();

}

/*************************************************
 * TESSEL·LES
 *************************************************/
function mapaTessel(z, x, y, demana) {

    const m = mapaEstat;

    if (!m.manifest) { return null; }

    const clau = z + "/" + x + "/" + y;
    let t = m.tessel[clau];

    if (t) { return t.ok ? t.img : null; }

    if (!demana) { return null; }

    t = m.tessel[clau] = { img: new Image(), ok: false, err: false };

    t.img.onload = function () { t.ok = true; mapaPinta(); };
    t.img.onerror = function () { t.err = true; };
    t.img.src = "mapa/" + clau + "." + m.ext;

    m.tesselOrdre.push(clau);

    // Memòria acotada
    if (m.tesselOrdre.length > 400) {
        delete m.tessel[m.tesselOrdre.shift()];
    }

    return null;

}

function mapaDibuixaTessel(ctx, z, x, y) {

    const n = Math.pow(2, z);

    if (y < 0 || y >= n) { return; }

    x = ((x % n) + n) % n;

    const img = mapaTessel(z, x, y, true);

    if (img) {
        ctx.drawImage(img, x * MAPA_TILE, y * MAPA_TILE, MAPA_TILE, MAPA_TILE);
        return;
    }

    // Mentre carrega (o si falta) fem servir una tessel·la de zoom inferior
    for (let d = 1; d <= 4; d++) {

        const zz = z - d;

        if (zz < 0) { break; }

        const f = Math.pow(2, d);
        const pare = mapaTessel(zz, Math.floor(x / f), Math.floor(y / f), true);

        if (pare) {

            const mida = MAPA_TILE / f;
            const sx = (x % f) * mida, sy = (y % f) * mida;

            ctx.drawImage(pare, sx, sy, mida, mida, x * MAPA_TILE, y * MAPA_TILE, MAPA_TILE, MAPA_TILE);
            return;

        }

    }

}

/*************************************************
 * PINTAT
 *************************************************/
function mapaPinta() {

    const m = mapaEstat;

    if (!m || !m.obert || m.brutPendent) { return; }

    m.brutPendent = true;

    requestAnimationFrame(function () {

        m.brutPendent = false;
        mapaDibuixa();

    });

}

function mapaDibuixa() {

    const m = mapaEstat;
    const ctx = m.ctx;
    const w = m.w, h = m.h;

    ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
    ctx.fillStyle = "#e9e4d6";
    ctx.fillRect(0, 0, w, h);

    // ---- Tessel·les
    if (m.manifest) {

        const tz = Math.max(m.minZoom, Math.min(m.maxZoom, Math.round(m.zoom)));
        const s = Math.pow(2, m.zoom - tz);
        const Wtz = MAPA_TILE * Math.pow(2, tz);

        // Rang visible: quatre cantonades de la pantalla en coordenades "world px" a tz
        let x0 = 1e18, x1 = -1e18, y0 = 1e18, y1 = -1e18;

        [[0, 0], [w, 0], [0, h], [w, h]].forEach(function (c) {

            const q = mapaPantallaANorm(c[0], c[1]);

            x0 = Math.min(x0, q.u * Wtz); x1 = Math.max(x1, q.u * Wtz);
            y0 = Math.min(y0, q.v * Wtz); y1 = Math.max(y1, q.v * Wtz);

        });

        ctx.save();

        ctx.translate(w / 2, h / 2);
        ctx.rotate(-m.bearing * Math.PI / 180);
        ctx.scale(s, s);
        ctx.translate(-m.cu * Wtz, -m.cv * Wtz);

        ctx.imageSmoothingEnabled = true;

        const tx0 = Math.floor(x0 / MAPA_TILE), tx1 = Math.floor(x1 / MAPA_TILE);
        const ty0 = Math.floor(y0 / MAPA_TILE), ty1 = Math.floor(y1 / MAPA_TILE);

        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                mapaDibuixaTessel(ctx, tz, tx, ty);
            }
        }

        ctx.restore();

    }

    // ---- Track del tram
    if (m.track && m.track.length > 1) {

        const pts = m.track.map(function (p) {
            const q = mapaProjecta(p[0], p[1]);
            return mapaNormAPantalla(q.u, q.v);
        });

        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        ctx.beginPath();
        pts.forEach(function (p, i) { if (i) { ctx.lineTo(p.x, p.y); } else { ctx.moveTo(p.x, p.y); } });
        ctx.strokeStyle = "rgba(255,255,255,.92)";
        ctx.lineWidth = 15;
        ctx.stroke();

        ctx.beginPath();
        pts.forEach(function (p, i) { if (i) { ctx.lineTo(p.x, p.y); } else { ctx.moveTo(p.x, p.y); } });
        ctx.strokeStyle = "#c0261c";
        ctx.lineWidth = 8;
        ctx.stroke();

    }

    // ---- Waypoints
    mapaWaypoint(ctx, m.origen, "#16a34a", false);
    mapaWaypoint(ctx, m.desti, "#d9a441", true);

    // ---- Jugador
    if (m.jugador) { mapaDibuixaJugador(ctx); }

    mapaEscala();

    const avis = document.getElementById("cmAvis");

    avis.innerText = m.avis || "";
    avis.style.display = m.avis ? "block" : "none";

}

function mapaWaypoint(ctx, p, color, bandera) {

    if (!p) { return; }

    const q = mapaProjecta(p.lon, p.lat);
    const s = mapaNormAPantalla(q.u, q.v);

    ctx.beginPath();
    ctx.arc(s.x, s.y, bandera ? 22 : 17, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#fff";
    ctx.stroke();

    if (bandera) {

        ctx.fillStyle = "#26332d";
        ctx.font = "900 26px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⚑", s.x, s.y + 1);

    }

    const etiqueta = p.nom + (p.altitud ? " · " + String(p.altitud).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " m" : "");

    ctx.font = "800 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(255,255,255,.95)";
    ctx.strokeText(etiqueta, s.x, s.y - 34);
    ctx.fillStyle = "#1c2a22";
    ctx.fillText(etiqueta, s.x, s.y - 34);

}

function mapaDibuixaJugador(ctx) {

    const m = mapaEstat;
    const q = mapaProjecta(m.jugador.lng, m.jugador.lat);
    const s = mapaNormAPantalla(q.u, q.v);

    // Precisió del GPS
    const metresPerPx = 40075016.686 * Math.cos(m.jugador.lat * Math.PI / 180) / mapaMida(m.zoom);
    const rAcc = Math.min(m.jugador.acc / metresPerPx, Math.max(m.w, m.h));

    if (rAcc > 14) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, rAcc, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(37,99,235,.14)";
        ctx.fill();
    }

    // Con de la direcció del mòbil
    if (m.rumb !== null) {

        const a = (m.rumb - m.bearing - 90) * Math.PI / 180;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.arc(s.x, s.y, 62, a - 0.5, a + 0.5);
        ctx.closePath();
        ctx.fillStyle = "rgba(37,99,235,.45)";
        ctx.fill();

    }

    ctx.beginPath();
    ctx.arc(s.x, s.y, 17, 0, Math.PI * 2);
    ctx.fillStyle = "#2563eb";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#fff";
    ctx.stroke();

}

function mapaEscala() {

    const m = mapaEstat;
    const lat = (m.cv !== undefined) ? (Math.atan(Math.sinh(Math.PI * (1 - 2 * m.cv))) * 180 / Math.PI) : 42.6;
    const mPx = 40075016.686 * Math.cos(lat * Math.PI / 180) / mapaMida(m.zoom);

    const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    let metres = nice[0];

    nice.forEach(function (n) { if (n / mPx <= 220) { metres = n; } });

    const el = document.getElementById("cmEscala");

    el.style.width = Math.round(metres / mPx) + "px";
    el.innerText = metres >= 1000 ? (metres / 1000) + " km" : metres + " m";

}

/*************************************************
 * GESTOS: arrossegar, pessic (zoom + gir), roda, doble toc
 *************************************************/
function mapaGestos() {

    const m = mapaEstat;
    const c = m.canvas;
    const punters = m.punters;

    let anterior = null;     // {x,y,dist,ang} del gest actual
    let ultimToc = 0;

    function pos(e) {
        const r = c.getBoundingClientRect();
        // el canvas pot estar escalat per CSS: passem a unitats de dibuix (m.w × m.h)
        return { x: (e.clientX - r.left) * (m.w / r.width), y: (e.clientY - r.top) * (m.h / r.height) };
    }

    function estat() {

        const ids = Object.keys(punters);

        if (ids.length === 1) { return { x: punters[ids[0]].x, y: punters[ids[0]].y }; }

        if (ids.length >= 2) {

            const a = punters[ids[0]], b = punters[ids[1]];

            return {
                x: (a.x + b.x) / 2,
                y: (a.y + b.y) / 2,
                dist: Math.hypot(a.x - b.x, a.y - b.y),
                ang: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
            };

        }

        return null;

    }

    c.addEventListener("pointerdown", function (e) {

        try { c.setPointerCapture(e.pointerId); } catch (err) { }
        punters[e.pointerId] = pos(e);
        anterior = estat();

        // doble toc = zoom +1
        if (Object.keys(punters).length === 1) {

            const ara = Date.now();

            if (ara - ultimToc < 320) { const p = pos(e); mapaZoomA(m.zoom + 1, p.x, p.y); }

            ultimToc = ara;

        }

    });

    c.addEventListener("pointermove", function (e) {

        if (!punters[e.pointerId]) { return; }

        punters[e.pointerId] = pos(e);

        const ara = estat();

        if (!anterior || !ara) { anterior = ara; return; }

        // Punt del món sota el centre del gest anterior
        const ref = mapaPantallaANorm(anterior.x, anterior.y);

        if (ara.dist && anterior.dist) {

            m.zoom = mapaClampZoom(m.zoom + Math.log2(ara.dist / anterior.dist));

            // girar l'estructura de coordenades al voltant del gest
            m.bearing = mapaNorm360(m.bearing - mapaDeltaAngle(ara.ang, anterior.ang));
            m.rumbAmunt = false;

        }

        mapaAncora(ref.u, ref.v, ara.x, ara.y);

        // Moure amb la mà desactiva el seguiment
        if (m.seguir) { m.seguir = false; }

        anterior = ara;

        mapaActualitzaBotons();
        mapaPinta();

    });

    function fi(e) {

        delete punters[e.pointerId];
        anterior = estat();

    }

    c.addEventListener("pointerup", fi);
    c.addEventListener("pointercancel", fi);

    c.addEventListener("wheel", function (e) {

        e.preventDefault();

        const p = pos(e);

        mapaZoomA(m.zoom - e.deltaY * 0.0015, p.x, p.y);

    }, { passive: false });

}
