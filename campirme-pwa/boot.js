/*************************************************
 * BOOT.JS — arrencada de la PWA
 *
 * 1. Registra el Service Worker.
 * 2. Si l'activitat ja ha començat (flag de gate + paquet
 *    local) → entra directament al joc, SENSE xarxa.
 *    (És el camí d'un refresh sense cobertura.)
 * 3. Si no → pantalla "preparat per sortir" (amb cobertura).
 *************************************************/

function clauGate(codi) { return "campirme_gate_" + codi; }

function $(id) { return document.getElementById(id); }

function marca(id, estat, detall) {
    $("gIco" + id).innerText = { ok: "✅", espera: "⏳", error: "❌", avis: "⚠️", neutre: "⚪" }[estat];
    $("gDet" + id).innerText = detall || "";
}

/*************************************************
 * SERVICE WORKER
 *************************************************/
function registrarSW() {

    if (!("serviceWorker" in navigator)) {
        return Promise.reject(new Error("Aquest navegador no suporta mode offline."));
    }

    return navigator.serviceWorker.register("sw.js", { scope: "./" })
        .then(function () { return navigator.serviceWorker.ready; });

}

function comprovarAplicacioGuardada() {

    return caches.keys().then(function (noms) {

        const shell = noms.filter(function (n) { return n.indexOf("campirme-shell-") === 0; });

        if (shell.length === 0) { return false; }

        return caches.open(shell[shell.length - 1])
            .then(function (c) { return c.match("index.html"); })
            .then(function (r) { return !!r; });

    });

}

/*************************************************
 * ENTRAR AL JOC
 *************************************************/
function entrarAlJoc() {

    $("loading").style.display = "none";
    $("gate").style.display = "none";
    $("joc").style.display = "block";

    iniciarCampirme();

}

/*************************************************
 * GATE
 *************************************************/
let gateApp = false;
let gatePaquet = false;

function actualitzarBotoComencar() {
    $("gateComencar").disabled = !(gateApp && gatePaquet);
}

function gateAplicacio() {

    marca("App", "espera", "Guardant...");

    registrarSW()
        .then(comprovarAplicacioGuardada)
        .then(function (ok) {
            gateApp = ok;
            marca("App", ok ? "ok" : "error",
                ok ? "Disponible sense cobertura" : "No s'ha pogut guardar. Torna-ho a provar amb cobertura.");
            actualitzarBotoComencar();
        })
        .catch(function (err) {
            marca("App", "error", String(err.message || err));
        });

}

function gatePaquetContingut(codi) {

    marca("Paquet", "espera", "Descarregant...");
    $("gReintentar").style.display = "none";

    descarregarPaquetCampirme(

        codi,

        function () {
            gatePaquet = true;
            marca("Paquet", "ok", "Descarregat al mòbil");
            actualitzarBotoComencar();
        },

        function (missatge) {
            gatePaquet = false;
            marca("Paquet", "error", missatge);
            $("gReintentar").style.display = "block";
            actualitzarBotoComencar();
        }

    );

}

function gatePersistencia() {

    if (!(navigator.storage && navigator.storage.persist)) {
        marca("Persist", "avis", "No es pot garantir (continua igualment)");
        return;
    }

    navigator.storage.persist().then(function (ok) {
        marca("Persist", ok ? "ok" : "avis",
            ok ? "Les dades no s'esborraran soles" : "No garantida: no netegis les dades del navegador");
    });

}

function gateActivarGPS() {

    if (!navigator.geolocation) { marca("Gps", "error", "No disponible"); return; }

    marca("Gps", "espera", "Demanant permís...");

    navigator.geolocation.getCurrentPosition(
        function () { marca("Gps", "ok", "Permís concedit"); $("gBotoGps").style.display = "none"; },
        function () { marca("Gps", "error", "Permís denegat. Activa'l a la configuració del navegador."); },
        { enableHighAccuracy: true, timeout: 20000 }
    );

}

function gateActivarBruixola() {

    // iOS demana permís explícit i només dins d'un gest de l'usuari (aquest clic)
    if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
    ) {

        DeviceOrientationEvent.requestPermission()
            .then(function (r) {
                if (r === "granted") { marca("Brux", "ok", "Permís concedit"); $("gBotoBrux").style.display = "none"; }
                else { marca("Brux", "error", "Permís denegat"); }
            })
            .catch(function () { marca("Brux", "error", "Permís denegat"); });

        return;

    }

    if (typeof DeviceOrientationEvent === "undefined") {
        marca("Brux", "avis", "Aquest dispositiu no té brúixola");
        return;
    }

    marca("Brux", "ok", "No cal permís en aquest dispositiu");
    $("gBotoBrux").style.display = "none";

}

function gateComencar(codi) {

    const estat = llegirEstatCampirme(codi);

    if (!estat || !estat.paquet) { return; }

    // El cronòmetre arrenca ara, no en el moment de descarregar el paquet
    if (!estat.progres.comencat) {
        estat.progres.comencat = true;
        estat.progres.iniciat = new Date().toISOString();
        desarEstatCampirme(codi, estat);
    }

    try { localStorage.setItem(clauGate(codi), "1"); } catch (e) { }

    entrarAlJoc();

}

function mostrarGate(codi) {

    $("loading").style.display = "none";
    $("gate").style.display = "block";

    gateAplicacio();
    gatePaquetContingut(codi);
    gatePersistencia();

    $("gReintentar").onclick = function () { gatePaquetContingut(codi); };
    $("gBotoGps").onclick = gateActivarGPS;
    $("gBotoBrux").onclick = gateActivarBruixola;
    $("gateComencar").onclick = function () { gateComencar(codi); };

}

/*************************************************
 * ARRENCADA
 *************************************************/
window.addEventListener("DOMContentLoaded", function () {

    const codi = obtenirCodiTargeta();

    if (!codi) {
        mostrarError("No s'ha pogut identificar la targeta. Obre l'enllaç des de la targeta.");
        return;
    }

    // Sempre registrem el SW (també en reprendre), perquè s'actualitzi quan hi hagi cobertura
    registrarSW().catch(function () { });

    campirmeCodiActiu = codi;

    const estat = llegirEstatCampirme(codi);

    const jaComencat =
        estat && estat.paquet &&
        localStorage.getItem(clauGate(codi)) === "1";

    if (jaComencat) {
        entrarAlJoc();
        return;
    }

    mostrarGate(codi);

});
