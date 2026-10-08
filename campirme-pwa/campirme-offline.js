/*************************************************
 * CAMPIRMEOFFLINE.HTML
 *
 * Motor offline: descarregar / guardar / validar
 * / sincronitzar. No sap res del contingut concret
 * de Campirme (això és feina de l'Etapa 2) — només
 * sap moure les dades que li passin.
 *
 * TOT el que passa aquí funciona sense cobertura,
 * EXCEPTE la descàrrega inicial i la sincronització
 * (que s'intenta en segon pla i mai bloqueja res).
 *************************************************/

let campirmeCodiActiu = null;

function clauCampirme(codi) {
    return "campirme_" + codi;
}

/*************************************************
 * LLEGIR / DESAR L'ESTAT LOCAL
 *************************************************/
function llegirEstatCampirme(codi) {

    try {

        const text =
            localStorage.getItem(
                clauCampirme(codi)
            );

        if (!text) {
            return null;
        }

        return JSON.parse(text);

    }
    catch (err) {

        console.error(
            "Error llegint l'estat offline:",
            err
        );

        return null;

    }

}

function desarEstatCampirme(codi, estat) {

    try {

        localStorage.setItem(
            clauCampirme(codi),
            JSON.stringify(estat)
        );

        return true;

    }
    catch (err) {

        console.error(
            "Error desant l'estat offline:",
            err
        );

        return false;

    }

}

/*************************************************
 * ID ÚNIC PER A CADA ESDEVENIMENT
 * (necessari perquè la sincronització sigui
 * segura encara que s'intenti diverses vegades)
 *************************************************/
function nouIdEsdeveniment() {

    return (
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 8)
    );

}

/*************************************************
 * PAS 1 — DESCÀRREGA ABANS DE SORTIR
 *
 * S'ha de cridar mentre encara hi ha cobertura
 * (típicament, en obrir l'activitat a Estaon).
 * Si ja hi ha un paquet guardat d'aquest codi,
 * no el torna a descarregar (evita gastar dades
 * i sobreescriure progrés ja fet).
 *************************************************/
function descarregarPaquetCampirme(codi, onOk, onError) {

    campirmeCodiActiu = codi;

    const existent =
        llegirEstatCampirme(codi);

    if (existent && existent.paquet) {

        if (onOk) {
            onOk(existent);
        }

        return;

    }

    google.script.run

        .withSuccessHandler(function(resposta) {

            if (!resposta || !resposta.ok) {

                if (onError) {

                    onError(
                        (resposta && resposta.missatge) ||
                        "No s'ha pogut descarregar " +
                        "el contingut."
                    );

                }

                return;

            }

            const estat = {

                paquet: resposta.contingut,

                progres: {

                    puntActual: resposta.puntActual || 1,

                    minutsAcumulats:
                        resposta.minutsAcumulats || 0,

                    iniciat: new Date().toISOString(),

                    respostesCorrectes: {}

                },

                cua: []

            };

            desarEstatCampirme(codi, estat);

            if (onOk) {
                onOk(estat);
            }

        })

        .withFailureHandler(function(err) {

            if (onError) {

                onError(
                    "Sense cobertura ara mateix. " +
                    "Torna-ho a provar abans de sortir " +
                    "de la zona amb senyal."
                );

            }

            console.error(err);

        })

        .apiObtenirPaquetOffline(codi);

}

/*************************************************
 * PAS 2 — VALIDAR UNA RESPOSTA EN LOCAL
 *
 * puntId / preguntaId: identificadors dins del
 * paquet ja descarregat.
 * resposta: "A" | "B" | "C"
 *
 * Retorna un objecte de resultat IMMEDIATAMENT
 * (no cal cobertura ni esperar res):
 *   { correcte, minutsAplicats, missatge }
 *************************************************/
function respondrePreguntaCampirmeOffline(
    codi,
    puntId,
    preguntaId,
    resposta
) {

    const estat = llegirEstatCampirme(codi);

    if (!estat || !estat.paquet) {

        return {
            correcte: false,
            missatge:
                "No hi ha contingut descarregat " +
                "per aquest codi."
        };

    }

    const punt =
        (estat.paquet.punts || [])
            .find(function(p) {
                return p.id === puntId;
            });

    const pregunta =
        punt &&
        (punt.preguntes || [])
            .find(function(p) {
                return p.id === preguntaId;
            });

    if (!pregunta) {

        return {
            correcte: false,
            missatge: "Pregunta no trobada."
        };

    }

    resposta =
        String(resposta || "")
            .trim()
            .toUpperCase();

    const esCorrecta =
        resposta ===
        String(pregunta.correcta || "")
            .trim()
            .toUpperCase();

    let minutsAplicats = 0;

    if (esCorrecta) {

        /*
         * Només sumem el bonus la primera vegada
         * que s'encerta aquesta pregunta concreta.
         */
        const clauResposta = puntId + ":" + preguntaId;

        if (
            !estat.progres.respostesCorrectes[clauResposta]
        ) {

            estat.progres.respostesCorrectes[
                clauResposta
            ] = true;

            if (Number(pregunta.bonusMin || 0) > 0) {

                minutsAplicats =
                    Number(pregunta.bonusMin);

            }

        }

    }
    else {

        /*
         * Cada error suma minuts (penalització),
         * i es permet reintentar.
         */
        minutsAplicats =
            -Math.abs(
                Number(pregunta.penalitzacioMin || 0)
            );

    }

    if (minutsAplicats !== 0) {

        estat.progres.minutsAcumulats +=
            minutsAplicats;

        estat.cua.push({
            id: nouIdEsdeveniment(),
            tipus: "ajustTemps",
            minuts: minutsAplicats
        });

    }

    desarEstatCampirme(codi, estat);

    /*
     * Intent silenciós de sincronitzar ara mateix,
     * per si hi ha cobertura. Si no n'hi ha, no
     * passa res: es tornarà a provar més tard.
     */
    intentarSincronitzarCampirme(codi);

    return {
        correcte: esCorrecta,
        minutsAplicats: minutsAplicats,
        missatge:
            esCorrecta
                ? (pregunta.missatgeCorrecte || "")
                : (pregunta.missatgeError ||
                  "Resposta incorrecta.")
    };

}

/*************************************************
 * MARCAR ARRIBADA A UN PUNT (botó "HE ARRIBAT")
 *************************************************/
function marcarArribadaPuntCampirmeOffline(
    codi,
    puntNumero
) {

    const estat = llegirEstatCampirme(codi);

    if (!estat) {
        return false;
    }

    estat.progres.puntActual =
        Math.max(
            estat.progres.puntActual || 1,
            puntNumero
        );

    estat.cua.push({
        id: nouIdEsdeveniment(),
        tipus: "arribadaPunt",
        puntNumero: puntNumero
    });

    desarEstatCampirme(codi, estat);

    intentarSincronitzarCampirme(codi);

    return true;

}

/*************************************************
 * PAS 3 — SINCRONITZACIÓ EN SEGON PLA
 *
 * Es pot cridar tantes vegades com es vulgui.
 * Si no hi ha cobertura, falla en silenci i prou
 * (els esdeveniments es queden a la cua per al
 * proper intent). Si hi ha cobertura, buida la
 * cua dels esdeveniments que ja s'han confirmat.
 *************************************************/
let campirmeSincronitzant = false;

function intentarSincronitzarCampirme(codi) {

    if (campirmeSincronitzant) {
        return;
    }

    const estat = llegirEstatCampirme(codi);

    if (
        !estat ||
        !estat.cua ||
        estat.cua.length === 0
    ) {
        return;
    }

    campirmeSincronitzant = true;

    const cuaAEnviar = estat.cua.slice();

    google.script.run

        .withSuccessHandler(function(resposta) {

            campirmeSincronitzant = false;

            if (!resposta || !resposta.ok) {
                return;
            }

            const aplicats =
                resposta.aplicats || [];

            if (aplicats.length === 0) {
                return;
            }

            /*
             * Traiem de la cua local només els
             * esdeveniments que el servidor ja
             * ha confirmat.
             */
            const estatActual =
                llegirEstatCampirme(codi);

            if (!estatActual) {
                return;
            }

            estatActual.cua =
                estatActual.cua.filter(function(ev) {

                    return (
                        aplicats.indexOf(ev.id) === -1
                    );

                });

            desarEstatCampirme(codi, estatActual);

        })

        .withFailureHandler(function(err) {

            campirmeSincronitzant = false;

            /*
             * Sense cobertura: no fem res, ja ho
             * tornarem a provar més tard.
             */
            console.log(
                "Sincronització ajornada " +
                "(sense cobertura?)",
                err
            );

        })

        .apiSincronitzarCampirme(codi, cuaAEnviar);

}

/*************************************************
 * REINTENT AUTOMÀTIC EN SEGON PLA
 *
 * Cada 30 segons, i també just quan el mòbil
 * detecta que ha recuperat connexió.
 *************************************************/
setInterval(function() {

    if (campirmeCodiActiu) {

        intentarSincronitzarCampirme(
            campirmeCodiActiu
        );

    }

}, 30000);

window.addEventListener("online", function() {

    if (campirmeCodiActiu) {

        intentarSincronitzarCampirme(
            campirmeCodiActiu
        );

    }

});

/*************************************************
 * TANCAMENT FINAL (arribada GPS confirmada)
 *
 * Cridada crítica: es reintenta cada 10 segons
 * fins que el servidor confirma que ho ha rebut,
 * ja que aquí el jugador ja ha aturat la
 * caminada i està esperant la confirmació.
 *************************************************/
function intentarFinalitzarCampirme(codi, esdeveniments) {

    google.script.run

        .withSuccessHandler(function(resposta) {

            if (resposta && resposta.ok) {

                localStorage.removeItem(
                    clauCampirme(codi)
                );

                localStorage.removeItem("campirme_gate_" + codi);

                window.top.location.href =
                    scriptUrl +
                    "?view=Final&codi=" +
                    encodeURIComponent(codi);

            }
            else {

                setTimeout(function() {

                    intentarFinalitzarCampirme(
                        codi,
                        esdeveniments
                    );

                }, 10000);

            }

        })

        .withFailureHandler(function(err) {

            console.log(
                "Sense cobertura per finalitzar, " +
                "reintentant en 10s...",
                err
            );

            setTimeout(function() {

                intentarFinalitzarCampirme(
                    codi,
                    esdeveniments
                );

            }, 10000);

        })

        .apiFinalitzarCampirme(codi, esdeveniments);

}

/* (L'avís beforeunload s'ha retirat: amb la PWA refrescar sense cobertura és segur.) */
