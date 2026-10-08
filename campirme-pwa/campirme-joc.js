/*************************************************
 * CAMPIRME.HTML — PART VISUAL
 *************************************************/

let campirmePuntActual = null;
let campirmeWatchGuia = null;
let campirmeWatchFinal = null;
let campirmeTramActiu = null;
let campirmeDestiActiu = null;
let campirmeMinutsPunt = {};

/*************************************************
 * INICI
 *
 * Si ja hi ha un paquet descarregat en local per
 * aquest codi, es reprèn directament sense xarxa
 * (necessari si es refresca la pàgina a mitja
 * ruta, sense cobertura).
 *************************************************/
function iniciarCampirme() {

    /* (a la PWA no existeixen els blocs de Petjades/Maquis) */

    document.getElementById(
        "contingutCampirme"
    ).style.display = "block";

    const codi = obtenirCodiTargeta();

    const carregant =
        document.getElementById("campirmeCarregant");

    carregant.style.display = "block";
    carregant.innerText = "Comprovant contingut local...";

    descarregarPaquetCampirme(

        codi,

        function(estat) {

            configurarPartidaCampirme(estat);

            carregant.style.display = "none";

            document.getElementById(
                "campirmeContingut"
            ).style.display = "block";

            mostrarPuntCampirme(
                estat.progres.puntActual || 1
            );

            intentarSincronitzarCampirme(codi);

        },

        function(missatgeError) {

            carregant.innerText =
                "⚠️ " + missatgeError;

        }

    );

}

/*************************************************
 * CAPÇALERA + CRONÒMETRE
 *
 * Reconstrueix un objecte "partida" local perquè
 * dibuixarHeader() i el cronòmetre (ja existents
 * al joc) funcionin també per Campirme, sense
 * necessitat del servidor.
 *************************************************/
function configurarPartidaCampirme(estat) {

    partida = {

        activitat: {
            id: "Campirme",
            nom: "Els Camins del Bestiar: Repte Campirme",
            icona: "🏔️"
        },

        equip: estat.paquet.equip || estat.equip || "",

        inici: estat.progres.iniciat

    };

    dibuixarHeader();

    iniciarCronometre();

}

function actualitzarProgresCampirme(puntNumero) {

    const total = 9;

    const progressText =
        document.getElementById("progressText");

    const progressFill =
        document.getElementById("progressFill");

    if (progressText) {

        progressText.innerText =
            Math.min(puntNumero, total) + " / " + total;

    }

    if (progressFill) {

        progressFill.style.width =
            ((Math.min(puntNumero, total) / total) * 100) +
            "%";

    }

}

/*************************************************
 * DISTÀNCIA ENTRE DOS PUNTS GPS (metres)
 *************************************************/
function distanciaMetresCampirme(lat1, lon1, lat2, lon2) {

    const R = 6371000;

    const toRad = function(v) { return v * Math.PI / 180; };

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    return 2 * R * Math.asin(Math.sqrt(a));

}

function trobarPuntCampirme(numero) {

    const estat = llegirEstatCampirme(campirmeCodiActiu);

    if (!estat || !estat.paquet) {
        return null;
    }

    return (estat.paquet.punts || []).find(function(p) {
        return p.numero === numero;
    }) || null;

}

function totesPreguntesResoltesCampirme(punt) {

    if (!punt.preguntes || punt.preguntes.length === 0) {
        return true;
    }

    const estat = llegirEstatCampirme(campirmeCodiActiu);

    return punt.preguntes.every(function(p) {

        return !!(
            estat.progres.respostesCorrectes[
                punt.id + ":" + p.id
            ]
        );

    });

}

/*************************************************
 * MOSTRAR UN PUNT (decideix quina secció toca)
 *************************************************/
function mostrarPuntCampirme(numero) {

    aturarGuiaGPSCampirme();

    const punt = trobarPuntCampirme(numero);

    if (!punt) {
        return;
    }

    campirmePuntActual = punt;

    actualitzarProgresCampirme(numero);

    document.getElementById("campirmeNom").innerText = punt.nom;

    document.getElementById("campirmeHistoria").innerHTML =
        convertirText(punt.historia);

    document.getElementById("campirmePreguntesWrap").style.display = "none";
    document.getElementById("campirmeDilemaWrap").style.display = "none";
    document.getElementById("campirmeMapaWrap").style.display = "none";
    document.getElementById("campirmeFinalGPS").style.display = "none";

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (
        punt.preguntes &&
        punt.preguntes.length > 0 &&
        !totesPreguntesResoltesCampirme(punt)
    ) {

        mostrarPreguntesCampirme(punt);
        return;

    }

    if (punt.dilema) {

        mostrarDilemaCampirme(punt);
        return;

    }

    if (punt.tramSeguent) {

        mostrarMapaAmbTram(punt.tramSeguent, punt.numero + 1);
        return;

    }

    if (punt.arribadaAutomaticaGPS) {

        mostrarEsperaFinalCampirme(punt);
        return;

    }

}

/*************************************************
 * PREGUNTES (reutilitza el component de Petjades)
 *************************************************/
function mostrarPreguntesCampirme(punt) {

    document.getElementById("campirmePreguntesWrap").style.display = "block";

    const estat = llegirEstatCampirme(campirmeCodiActiu);

    const primeraPendent =
        punt.preguntes.find(function(p) {

            return !estat.progres.respostesCorrectes[
                punt.id + ":" + p.id
            ];

        });

    dibuixarPreguntesPetjades(
        punt.preguntes,
        "preguntesCampirme",
        primeraPendent ? primeraPendent.id : null
    );

    const panelBonus =
        document.getElementById("campirmeBonusInfoPanel");

    const botoSaltar =
        document.getElementById("botoSaltarBonusCampirme");

    if (primeraPendent && primeraPendent.tipus === "bonus") {

        panelBonus.style.display = "block";

        document.getElementById("campirmeBonusInfoText").innerHTML =
            "Si l'encertes, guanyes <strong>" +
            (primeraPendent.bonusMin || 0) +
            " min</strong>. Cada resposta incorrecta et " +
            "suma <strong>+" +
            (primeraPendent.penalitzacioMin || 0) +
            " min</strong> — pots tornar a provar-ho tantes " +
            "vegades com vulguis.";

        botoSaltar.style.display = "block";

    }
    else {

        panelBonus.style.display = "none";
        botoSaltar.style.display = "none";

    }

}

function validarPreguntaCampirme() {

    const contenidor = document.getElementById("preguntesCampirme");

    const preguntaEl =
        contenidor
            ? contenidor.querySelector(".petjada-pregunta")
            : null;

    const preguntaId =
        preguntaEl
            ? preguntaEl.dataset.preguntaId
            : null;

    if (!preguntaId) {
        return;
    }

    const resposta =
        (window.petjadaRespostes &&
        window.petjadaRespostes[preguntaId]) ||
        "";

    document
        .querySelectorAll(".missatge-error-pregunta")
        .forEach(function(e) {
            e.innerText = "";
            e.style.display = "none";
        });

    if (!resposta) {

        const error =
            document.getElementById("error-" + preguntaId);

        if (error) {

            error.innerText = "Selecciona una resposta.";
            error.style.display = "block";

        }

        return;

    }

    const resultat =
        respondrePreguntaCampirmeOffline(
            campirmeCodiActiu,
            campirmePuntActual.id,
            preguntaId,
            resposta
        );

    if (!resultat.correcte) {

        const error =
            document.getElementById("error-" + preguntaId);

        if (error) {

            let text = resultat.missatge;

            if (resultat.minutsAplicats) {

                text +=
                    " (+" +
                    Math.abs(resultat.minutsAplicats) +
                    " min)";

            }

            error.innerText = text;
            error.style.display = "block";

        }

        return;

    }

    registrarMinutsPuntCampirme(resultat.minutsAplicats);

    continuarDespresDePreguntaCampirme();

}

function saltarBonusCampirme() {

    const contenidor = document.getElementById("preguntesCampirme");

    const preguntaEl =
        contenidor
            ? contenidor.querySelector(".petjada-pregunta")
            : null;

    const preguntaId =
        preguntaEl
            ? preguntaEl.dataset.preguntaId
            : null;

    if (!preguntaId) {
        return;
    }

    const estat = llegirEstatCampirme(campirmeCodiActiu);

    estat.progres.respostesCorrectes[
        campirmePuntActual.id + ":" + preguntaId
    ] = "saltada";

    desarEstatCampirme(campirmeCodiActiu, estat);

    continuarDespresDePreguntaCampirme();

}

function registrarMinutsPuntCampirme(minuts) {

    if (!minuts) {
        return;
    }

    const clau = campirmePuntActual.id;

    campirmeMinutsPunt[clau] =
        (campirmeMinutsPunt[clau] || 0) + minuts;

}

function continuarDespresDePreguntaCampirme() {

    if (totesPreguntesResoltesCampirme(campirmePuntActual)) {

        mostrarPopupPuntCompletatCampirme(campirmePuntActual);
        return;

    }

    mostrarPuntCampirme(campirmePuntActual.numero);

}

function mostrarPopupPuntCompletatCampirme(punt) {

    const minuts = campirmeMinutsPunt[punt.id] || 0;

    let bonusText = null;

    if (minuts > 0) {
        bonusText = "-" + minuts + " min";
    }
    else if (minuts < 0) {
        bonusText = "+" + Math.abs(minuts) + " min";
    }

    mostrarMissioCompletada(

        "Has superat el punt «" + punt.nom + "»!",

        bonusText,

        function() {
            mostrarPuntCampirme(punt.numero);
        },

        {
            icona: "⭐",
            titol: "ENHORABONA!"
        }

    );

}

/*************************************************
 * DILEMA (Punt 8: tria de camí, sense risc)
 *************************************************/
function mostrarDilemaCampirme(punt) {

    document.getElementById("campirmeDilemaWrap").style.display = "block";

    document.getElementById("campirmeDilemaText").innerHTML =
        convertirText(punt.dilema.historia);

    document.getElementById(
        "campirmeDilemaRenunciarText"
    ).innerText = punt.dilema.renunciar.etiqueta;

    document.getElementById(
        "campirmeDilemaAfrontarText"
    ).innerText = punt.dilema.afrontar.etiqueta;

    const botoAfrontar =
        document.getElementById("botoAfrontarDilemaCampirme");

    if (punt.dilema.afrontar.disponible === false) {

        botoAfrontar.disabled = true;
        botoAfrontar.style.opacity = ".5";

    }
    else {

        botoAfrontar.disabled = false;
        botoAfrontar.style.opacity = "1";

    }

}

function continuarDilemaCampirme(tram) {

    document.getElementById("campirmeDilemaWrap").style.display = "none";

    if (!tram) {

        /*
         * Encara no hi ha track d'aquesta variant
         * (per exemple, Mont Caubo). Tornem al mapa
         * estàndard perquè el jugador no es quedi
         * encallat.
         */
        tram = campirmePuntActual.dilema.renunciar.tram;

    }

    mostrarMissioCompletada(

        "🗺️ El següent tram ha estat desbloquejat.",

        null,

        function() {
            mostrarMapaAmbTram(tram, 9);
        },

        {
            icona: "🗺️",
            titol: "ENDAVANT!",
            confeti: false
        }

    );

}

function renunciarDilemaCampirme() {

    continuarDilemaCampirme(
        campirmePuntActual.dilema.renunciar.tram
    );

}

function afrontarDilemaCampirme() {

    if (campirmePuntActual.dilema.afrontar.disponible === false) {
        return;
    }

    if (
        Number(campirmePuntActual.dilema.afrontar.bonusMin || 0) !== 0
    ) {

        const estat = llegirEstatCampirme(campirmeCodiActiu);

        const minuts =
            Number(campirmePuntActual.dilema.afrontar.bonusMin);

        estat.progres.minutsAcumulats += minuts;

        estat.cua.push({
            id: nouIdEsdeveniment(),
            tipus: "ajustTemps",
            minuts: minuts
        });

        desarEstatCampirme(campirmeCodiActiu, estat);

    }

    continuarDilemaCampirme(
        campirmePuntActual.dilema.afrontar.tram
    );

}

/*************************************************
 * MAPA + BRÚIXOLA REAL (gir per orientació + GPS)
 *************************************************/
let campirmeBruixolaObjectiu = null;
let campirmeBruixolaPosicio = null;
let campirmeBruixolaHeading = null;
let campirmeOrientacioActiva = false;

function mostrarMapaAmbTram(tram, numeroDesti) {

    campirmeTramActiu = tram;
    campirmeDestiActiu = numeroDesti;

    document.getElementById("campirmeMapaWrap").style.display = "block";

    document.getElementById("botoObtenirMapaCampirme").style.display = "block";
    document.getElementById("botoHeArribatCampirme").style.display = "none";

    document.getElementById("campirmeBruixolaCos").style.display = "none";
    document.getElementById("campirmeMapaInfo").innerText = "";
    document.getElementById("campirmeGuiaGPS").innerText = "";

}

function mostrarMapaCampirme() {

    const tram = campirmeTramActiu;

    if (!tram) {
        return;
    }

    document.getElementById("campirmeMapaInfo").innerText =
        tram.distanciaKm + " km · " +
        (tram.desnivellNet >= 0 ? "+" : "") +
        tram.desnivellNet + " m";

    document.getElementById("botoObtenirMapaCampirme").style.display = "none";
    document.getElementById("botoHeArribatCampirme").style.display = "block";
    document.getElementById("campirmeBruixolaCos").style.display = "block";

    const desti = trobarPuntCampirme(campirmeDestiActiu);

    if (desti) {
        iniciarGuiaGPSCampirme(desti);
    }

}

function iniciarGuiaGPSCampirme(puntDesti) {

    aturarGuiaGPSCampirme();

    campirmeBruixolaObjectiu = puntDesti;
    campirmeBruixolaPosicio = null;
    campirmeBruixolaHeading = null;

    activarOrientacioCampirme();

    if (!navigator.geolocation) {
        return;
    }

    const info = document.getElementById("campirmeGuiaGPS");

    campirmeWatchGuia = navigator.geolocation.watchPosition(

        function(pos) {

            campirmeBruixolaPosicio = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            };

            const d = distanciaMetresBruixola(
                campirmeBruixolaPosicio.lat,
                campirmeBruixolaPosicio.lng,
                puntDesti.lat,
                puntDesti.lon
            );

            if (info) {

                info.innerText =
                    "📍 Ets a uns " +
                    Math.round(d) +
                    " m de " + puntDesti.nom;

            }

            actualitzarAgullaCampirme();

        },

        function(err) {
            console.log("GPS no disponible:", err);
        },

        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }

    );

}

function activarOrientacioCampirme() {

    if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
    ) {

        DeviceOrientationEvent.requestPermission()

            .then(function(resposta) {

                if (resposta === "granted") {
                    iniciarEscoltaOrientacioCampirme();
                }

            })

            .catch(function(err) {
                console.log("Permís de brúixola denegat:", err);
            });

    }
    else {

        iniciarEscoltaOrientacioCampirme();

    }

}

function iniciarEscoltaOrientacioCampirme() {

    if (campirmeOrientacioActiva) {
        return;
    }

    campirmeOrientacioActiva = true;

    window.addEventListener(
        "deviceorientationabsolute",
        gestionarOrientacioCampirme,
        true
    );

    window.addEventListener(
        "deviceorientation",
        gestionarOrientacioCampirme,
        true
    );

}

function gestionarOrientacioCampirme(event) {

    let heading = null;

    if (typeof event.webkitCompassHeading === "number") {

        heading = event.webkitCompassHeading;

    }
    else if (
        event.absolute === true &&
        typeof event.alpha === "number"
    ) {

        heading = (360 - event.alpha) % 360;

    }
    else if (typeof event.alpha === "number") {

        heading = (360 - event.alpha) % 360;

    }

    if (heading === null) {
        return;
    }

    campirmeBruixolaHeading = heading;

    actualitzarAgullaCampirme();

}

function actualitzarAgullaCampirme() {

    if (
        !campirmeBruixolaObjectiu ||
        !campirmeBruixolaPosicio ||
        campirmeBruixolaHeading === null
    ) {
        return;
    }

    const bearing =
        calcularBearingBruixola(
            campirmeBruixolaPosicio.lat,
            campirmeBruixolaPosicio.lng,
            campirmeBruixolaObjectiu.lat,
            campirmeBruixolaObjectiu.lon
        );

    const rotacio =
        (bearing - campirmeBruixolaHeading + 360) % 360;

    const agulla =
        document.getElementById("campirmeAgulla");

    if (agulla) {

        agulla.style.transform =
            "translate(-50%,-50%) rotate(" +
            rotacio + "deg)";

    }

}

function aturarGuiaGPSCampirme() {

    if (campirmeWatchGuia !== null) {

        navigator.geolocation.clearWatch(campirmeWatchGuia);
        campirmeWatchGuia = null;

    }

    window.removeEventListener(
        "deviceorientationabsolute",
        gestionarOrientacioCampirme,
        true
    );

    window.removeEventListener(
        "deviceorientation",
        gestionarOrientacioCampirme,
        true
    );

    campirmeOrientacioActiva = false;
    campirmeBruixolaHeading = null;
    campirmeBruixolaPosicio = null;
    campirmeBruixolaObjectiu = null;

}

function heArribatCampirme() {

    aturarGuiaGPSCampirme();

    marcarArribadaPuntCampirmeOffline(
        campirmeCodiActiu,
        campirmeDestiActiu
    );

    mostrarPuntCampirme(campirmeDestiActiu);

}

/*************************************************
 * ARRIBADA FINAL AUTOMÀTICA (Punt 9, per GPS)
 *************************************************/
function mostrarEsperaFinalCampirme(punt) {

    document.getElementById("campirmeFinalGPS").style.display = "block";

    document.getElementById("campirmeFinalText").innerHTML =
        "El cronòmetre s'aturarà automàticament quan " +
        "estiguis a menys de " +
        (punt.radiArribadaMetres || 20) +
        " metres d'Estaon.";

    if (campirmeWatchFinal === null && navigator.geolocation) {

        campirmeWatchFinal = navigator.geolocation.watchPosition(

            function(pos) {

                const d = distanciaMetresCampirme(
                    pos.coords.latitude,
                    pos.coords.longitude,
                    punt.lat,
                    punt.lon
                );

                const text =
                    document.getElementById("campirmeFinalText");

                if (text) {

                    text.innerHTML =
                        "Distància fins a Estaon: <strong>" +
                        Math.round(d) + " m</strong>";

                }

                if (d <= (punt.radiArribadaMetres || 20)) {

                    navigator.geolocation.clearWatch(
                        campirmeWatchFinal
                    );

                    campirmeWatchFinal = null;

                    finalitzarCampirmeAra();

                }

            },

            function(err) {
                console.log("Error GPS final:", err);
            },

            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }

        );

    }

}

function finalitzarCampirmeAra() {

    const estat = llegirEstatCampirme(campirmeCodiActiu);

    const cua =
        (estat && estat.cua) ? estat.cua.slice() : [];

    cua.push({
        id: nouIdEsdeveniment(),
        tipus: "arribadaPunt",
        puntNumero: 9
    });

    document.getElementById("campirmeFinalText").innerHTML =
        "🏡 Arribada detectada! Sincronitzant el " +
        "resultat final...";

    intentarFinalitzarCampirme(campirmeCodiActiu, cua);

}