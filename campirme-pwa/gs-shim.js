/*************************************************
 * GS-SHIM.JS
 *
 * Reimplementa la part de google.script.run que fa
 * servir Campirme, perquè el codi existent funcioni
 * SENSE canvis fora d'Apps Script:
 *
 *   google.script.run
 *     .withSuccessHandler(f).withFailureHandler(g)
 *     .apiXxx(arg1, arg2)
 *
 * → POST (text/plain, per evitar preflight CORS) a API_URL.
 * El servidor només executa funcions d'una llista blanca (vegeu doPost).
 *************************************************/
(function () {

    var PERMESES = {
        apiObtenirPaquetOffline: 1,
        apiSincronitzarCampirme: 1,
        apiFinalitzarCampirme: 1
    };

    function crida(nom, args, ok, ko) {

        function falla(err) {
            if (ko) { ko(err instanceof Error ? err : new Error(String(err))); }
        }

        if (!PERMESES[nom]) { falla("Funció no permesa: " + nom); return; }

        // Sense xarxa: fallem a l'instant (no esperem el timeout)
        if (navigator.onLine === false) { falla("Sense connexió"); return; }

        var ctrl = new AbortController();
        var t = setTimeout(function () { ctrl.abort(); }, API_TIMEOUT_MS);

        fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ fn: nom, args: args }),
            signal: ctrl.signal,
            redirect: "follow"
        })
            .then(function (r) {
                if (!r.ok) { throw new Error("HTTP " + r.status); }
                return r.json();
            })
            .then(function (env) {
                clearTimeout(t);
                if (env && env.ok) { if (ok) { ok(env.data); } }
                else { falla((env && env.error) || "Error del servidor"); }
            })
            .catch(function (err) {
                clearTimeout(t);
                falla(err);
            });
    }

    function nouConstructor() {
        var ok = null, ko = null;
        var p = new Proxy({}, {
            get: function (_, nom) {
                if (nom === "withSuccessHandler") { return function (f) { ok = f; return p; }; }
                if (nom === "withFailureHandler") { return function (f) { ko = f; return p; }; }
                return function () {
                    crida(String(nom), Array.prototype.slice.call(arguments), ok, ko);
                };
            }
        });
        return p;
    }

    window.google = window.google || {};
    window.google.script = {
        get run() { return nouConstructor(); }
    };

})();
