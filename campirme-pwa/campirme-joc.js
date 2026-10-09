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

    dibuixarEsferaCampirme();

    const desnivell = document.getElementById("campirmeBrxDesn");

    if (desnivell) {

        desnivell.textContent =
            "⛰ " + (tram.desnivellNet >= 0 ? "+" : "") +
            tram.desnivellNet + " m";

    }

    const desti = trobarPuntCampirme(campirmeDestiActiu);

    if (desti) {
        iniciarGuiaGPSCampirme(desti);
    }

}

/*************************************************
 * BRÚIXOLA — estat i utilitats
 *
 * Es manté el model original (agulla que apunta al
 * destí segons GPS + orientació del mòbil), però:
 *  - només es fa servir orientació ABSOLUTA (respecte
 *    al nord magnètic); l'orientació relativa de
 *    Android feia saltar l'agulla entre dues lectures;
 *  - el rumb es calcula amb compensació d'inclinació
 *    (funciona amb el mòbil inclinat, no només pla);
 *  - el filtre és circular (sense salt 359°→0°) i els
 *    angles CSS són continus (l'agulla no fa voltes);
 *  - la rosa gira perquè la N assenyali el nord real;
 *  - es mostra l'estat de GPS/brúixola en lloc de
 *    quedar-se en silenci.
 *************************************************/
let campirmeBruixolaObjectiu = null;
let campirmeBruixolaPosicio = null;
let campirmeBruixolaHeading = null;   // rumb filtrat (0-360) o null
let campirmeOrientacioActiva = false;

let campirmeBruixolaPrecisioGPS = null;
let campirmeBruixolaMissatge = "";
let campirmeBruixolaAccuracy = null;   // iOS: error en graus (-1 = sense calibrar)
let campirmeBruixolaUltimaLectura = 0;
let campirmeBruixolaTimerSenyal = null;
let campirmeBruixolaRaf = false;
let campirmeAngleAgulla = null;        // angle CSS acumulat (continu)
let campirmeAngleRosa = null;

const CAMPIRME_FILTRE_BRUIXOLA = 0.25;  // 0-1: més alt = més àgil, més nerviós

function campirmeNormalitza360(a) {
    return ((a % 360) + 360) % 360;
}

/* Diferència més curta entre dos angles, en (-180, 180] */
function campirmeDeltaAngle(destí, origen) {
    return ((destí - origen + 540) % 360 + 360) % 360 - 180;
}

/* Fa que 'nou' sigui el valor equivalent més proper a 'anterior' (sense salts de 360°) */
function campirmeAngleContinu(anterior, nou) {

    if (anterior === null) {
        return nou;
    }

    return anterior + campirmeDeltaAngle(nou, anterior);

}

/*
 * Rumb (0-360, sentit horari des del nord) cap on "apunta" el mòbil, a
 * partir d'alpha/beta/gamma d'un esdeveniment ABSOLUT.
 *  - Mòbil gairebé pla (com una brúixola): direcció de la part de dalt.
 *  - Mòbil dret/inclinat (>45° de la horitzontal): direcció de la part
 *    del darrere (com si apuntessis amb la càmera).
 * Per inclinar només endavant/endarrere els dos casos coincideixen,
 * així que el canvi no fa salts. (Fórmula W3C per al cas del darrere:
 * és indefinida amb el mòbil pla, per això cal la part de dalt.)
 */
function campirmeRumbDesdeEuler(alpha, beta, gamma) {

    const rad = Math.PI / 180;

    const x = (beta || 0) * rad;
    const y = (gamma || 0) * rad;
    const z = alpha * rad;

    const cX = Math.cos(x), cY = Math.cos(y), cZ = Math.cos(z);
    const sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);

    let est, nord;

    if (Math.abs(cX * cY) > 0.7) {

        // Gairebé pla: part de dalt del mòbil
        est = -sZ * cX;
        nord = cZ * cX;

    }
    else {

        // Dret/inclinat: part del darrere del mòbil
        est = -cZ * sY - sZ * sX * cY;
        nord = -sZ * sY + cZ * sX * cY;

    }

    return campirmeNormalitza360(Math.atan2(est, nord) / rad);

}

/*************************************************
 * ESFERA DE LA BRÚIXOLA (marques, graus, cardinals)
 *************************************************/
const CAMPIRME_NS_SVG = "http://www.w3.org/2000/svg";

function campirmeElSvg(nom, atributs, text) {

    const el = document.createElementNS(CAMPIRME_NS_SVG, nom);

    Object.keys(atributs).forEach(function(k) {
        el.setAttribute(k, atributs[k]);
    });

    if (text !== undefined) {
        el.textContent = text;
    }

    return el;

}

function dibuixarEsferaCampirme() {

    const g = document.getElementById("campirmeEsfera");

    if (!g || g.childNodes.length > 0) {
        return;
    }

    const cx = 150, cy = 150;
    const rad = Math.PI / 180;

    for (let deg = 0; deg < 360; deg += 5) {

        const gran = deg % 30 === 0;
        const mitja = deg % 10 === 0;

        const r1 = 137;
        const r2 = gran ? 124 : (mitja ? 130 : 133);

        const s = Math.sin(deg * rad);
        const c = Math.cos(deg * rad);

        g.appendChild(campirmeElSvg("line", {
            x1: cx + r1 * s, y1: cy - r1 * c,
            x2: cx + r2 * s, y2: cy - r2 * c,
            stroke: deg === 0 ? "#8d1712" : "#4a3210",
            "stroke-width": gran ? 2.6 : (mitja ? 1.6 : 1),
            "stroke-linecap": "round"
        }));

    }

    const cardinals = { 0: "N", 90: "E", 180: "S", 270: "O" };

    for (let deg = 0; deg < 360; deg += 30) {

        const cardinal = cardinals[deg];

        const r = cardinal ? 111 : 113;
        const x = cx + r * Math.sin(deg * rad);
        const y = cy - r * Math.cos(deg * rad);

        // El text gira amb l'esfera: cap de lletra sempre cap a fora
        const t = campirmeElSvg("text", {
            x: x,
            y: y,
            transform: "rotate(" + deg + " " + x + " " + y + ")",
            "text-anchor": "middle",
            "dominant-baseline": "central",
            "font-size": cardinal ? 24 : 11,
            "font-weight": cardinal ? 900 : 700,
            fill: deg === 0 ? "#8d1712" : (cardinal ? "#2b1d08" : "#6b4a17")
        }, cardinal || String(deg));

        g.appendChild(t);

    }

}

function campirmeNomRumb(graus) {

    const noms = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

    return noms[Math.round(graus / 45) % 8];

}

function campirmeFormatDistancia(metres) {

    if (metres >= 1000) {
        return (metres / 1000).toFixed(2).replace(".", ",") + " km";
    }

    return Math.round(metres) + " m";

}

function pintarInfoGuiaCampirme() {

    const info = document.getElementById("campirmeGuiaGPS");

    if (!info || !campirmeBruixolaObjectiu) {
        return;
    }

    // Dades al centre de la brúixola
    const dist = document.getElementById("campirmeBrxDist");

    if (dist) {

        if (campirmeBruixolaPosicio) {

            dist.textContent = campirmeFormatDistancia(
                distanciaMetresBruixola(
                    campirmeBruixolaPosicio.lat,
                    campirmeBruixolaPosicio.lng,
                    campirmeBruixolaObjectiu.lat,
                    campirmeBruixolaObjectiu.lon
                )
            );

        }
        else {

            dist.textContent = "—";

        }

    }

    // Text sota la brúixola: destí + avisos
    const linies = ["➜ " + campirmeBruixolaObjectiu.nom];

    if (campirmeBruixolaPosicio && campirmeBruixolaPrecisioGPS && campirmeBruixolaPrecisioGPS > 40) {
        linies.push("Precisió GPS baixa (±" + Math.round(campirmeBruixolaPrecisioGPS) + " m)");
    }

    if (campirmeBruixolaMissatge) {
        linies.push(campirmeBruixolaMissatge);
    }
    else if (
        campirmeBruixolaAccuracy !== null &&
        (campirmeBruixolaAccuracy < 0 || campirmeBruixolaAccuracy > 25)
    ) {
        linies.push("🧭 Calibra la brúixola movent el mòbil en forma de 8");
    }

    info.innerHTML = linies.join("<br>");

}

/*************************************************
 * GUIA GPS + BRÚIXOLA
 *************************************************/
function iniciarGuiaGPSCampirme(puntDesti) {

    aturarGuiaGPSCampirme();

    campirmeBruixolaObjectiu = puntDesti;
    campirmeBruixolaPosicio = null;
    campirmeBruixolaHeading = null;
    campirmeBruixolaPrecisioGPS = null;
    campirmeBruixolaAccuracy = null;
    campirmeBruixolaMissatge = "Buscant senyal GPS...";
    campirmeAngleAgulla = null;
    campirmeAngleRosa = null;

    activarOrientacioCampirme();

    pintarInfoGuiaCampirme();

    if (!navigator.geolocation) {

        campirmeBruixolaMissatge = "⚠️ Aquest dispositiu no té GPS.";
        pintarInfoGuiaCampirme();
        return;

    }

    campirmeWatchGuia = navigator.geolocation.watchPosition(

        function(pos) {

            campirmeBruixolaPosicio = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            };

            campirmeBruixolaPrecisioGPS = pos.coords.accuracy;

            if (campirmeBruixolaMissatge === "Buscant senyal GPS...") {
                campirmeBruixolaMissatge = "";
            }

            pintarInfoGuiaCampirme();

            actualitzarAgullaCampirme();

        },

        function(err) {

            console.log("GPS no disponible:", err);

            if (err && err.code === 1) {

                campirmeBruixolaMissatge =
                    "⚠️ GPS bloquejat. Activa la ubicació d'aquest lloc " +
                    "a la configuració del navegador.";

            }
            else if (!campirmeBruixolaPosicio) {

                campirmeBruixolaMissatge = "Buscant senyal GPS...";

            }

            pintarInfoGuiaCampirme();

        },

        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }

    );

}

function activarOrientacioCampirme() {

    if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
    ) {

        // iOS: només dins d'un gest de l'usuari (el clic d'ACTIVAR BRÚIXOLA)
        DeviceOrientationEvent.requestPermission()

            .then(function(resposta) {

                if (resposta === "granted") {
                    iniciarEscoltaOrientacioCampirme();
                }
                else {

                    campirmeBruixolaMissatge =
                        "⚠️ Permís de brúixola denegat. Tanca i obre el navegador per tornar-lo a demanar.";

                    pintarInfoGuiaCampirme();

                }

            })

            .catch(function(err) {

                console.log("Permís de brúixola denegat:", err);

                campirmeBruixolaMissatge = "⚠️ No s'ha pogut activar la brúixola.";

                pintarInfoGuiaCampirme();

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
    campirmeBruixolaUltimaLectura = 0;

    window.addEventListener(
        "deviceorientationabsolute",
        gestionarOrientacioCampirme,
        true
    );

    // iOS (webkitCompassHeading) i Firefox (absolute=true) arriben per aquí.
    // A Chrome/Android aquest esdeveniment és RELATIU i s'ignora al gestor.
    window.addEventListener(
        "deviceorientation",
        gestionarOrientacioCampirme,
        true
    );

    // Si en 4 s no ha arribat cap lectura absoluta, ho diem (sensor absent o bloquejat)
    campirmeBruixolaTimerSenyal = setTimeout(function() {

        if (campirmeOrientacioActiva && campirmeBruixolaUltimaLectura === 0) {

            campirmeBruixolaMissatge =
                "⚠️ Aquest mòbil no dona la direcció del nord. " +
                "Fes servir la distància i el mapa.";

            pintarInfoGuiaCampirme();

        }

    }, 4000);

}

function gestionarOrientacioCampirme(event) {

    let rumb = null;

    if (
        typeof event.webkitCompassHeading === "number" &&
        event.webkitCompassHeading >= 0
    ) {

        // iOS: ja és respecte al nord magnètic i compensat d'inclinació
        rumb = event.webkitCompassHeading;

        if (typeof event.webkitCompassAccuracy === "number") {
            campirmeBruixolaAccuracy = event.webkitCompassAccuracy;
        }

    }
    else if (
        (event.absolute === true || event.type === "deviceorientationabsolute") &&
        typeof event.alpha === "number"
    ) {

        rumb = campirmeRumbDesdeEuler(event.alpha, event.beta, event.gamma);

    }

    if (rumb === null) {
        return;
    }

    campirmeBruixolaUltimaLectura = Date.now();

    if (campirmeBruixolaMissatge.indexOf("no dona la direcció") !== -1) {
        campirmeBruixolaMissatge = "";
    }

    // Filtre passa-baixos circular
    if (campirmeBruixolaHeading === null) {
        campirmeBruixolaHeading = rumb;
    }
    else {

        campirmeBruixolaHeading = campirmeNormalitza360(
            campirmeBruixolaHeading +
            CAMPIRME_FILTRE_BRUIXOLA *
            campirmeDeltaAngle(rumb, campirmeBruixolaHeading)
        );

    }

    // Màxim un repintat per fotograma
    if (!campirmeBruixolaRaf) {

        campirmeBruixolaRaf = true;

        requestAnimationFrame(function() {

            campirmeBruixolaRaf = false;

            actualitzarAgullaCampirme();

        });

    }

}

function actualitzarAgullaCampirme() {

    if (!campirmeBruixolaObjectiu) {
        return;
    }

    // Sense lectura del sensor, la brúixola es queda amb el nord a dalt
    const rumb = campirmeBruixolaHeading === null ? 0 : campirmeBruixolaHeading;

    // L'esfera gira perquè la N assenyali el nord real
    const esfera = document.getElementById("campirmeEsfera");

    campirmeAngleRosa = campirmeAngleContinu(
        campirmeAngleRosa,
        campirmeNormalitza360(-rumb)
    );

    if (esfera) {
        esfera.style.transform = "rotate(" + campirmeAngleRosa + "deg)";
    }

    const textRumb = document.getElementById("campirmeBrxRumb");

    if (textRumb) {

        textRumb.textContent =
            campirmeBruixolaHeading === null
                ? "—"
                : Math.round(rumb) % 360 + "° " + campirmeNomRumb(rumb);

    }

    // La fletxa (que apunta al destí) necessita la posició GPS
    if (!campirmeBruixolaPosicio) {
        return;
    }

    const bearing =
        calcularBearingBruixola(
            campirmeBruixolaPosicio.lat,
            campirmeBruixolaPosicio.lng,
            campirmeBruixolaObjectiu.lat,
            campirmeBruixolaObjectiu.lon
        );

    campirmeAngleAgulla = campirmeAngleContinu(
        campirmeAngleAgulla,
        campirmeNormalitza360(bearing - rumb)
    );

    const agulla = document.getElementById("campirmeAgulla");

    if (agulla) {
        agulla.style.transform = "rotate(" + campirmeAngleAgulla + "deg)";
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

    if (campirmeBruixolaTimerSenyal !== null) {

        clearTimeout(campirmeBruixolaTimerSenyal);
        campirmeBruixolaTimerSenyal = null;

    }

    campirmeOrientacioActiva = false;
    campirmeBruixolaHeading = null;
    campirmeBruixolaPosicio = null;
    campirmeBruixolaObjectiu = null;
    campirmeBruixolaMissatge = "";
    campirmeBruixolaAccuracy = null;
    campirmeAngleAgulla = null;
    campirmeAngleRosa = null;

    ["campirmeEsfera", "campirmeAgulla"].forEach(function(id) {

        const el = document.getElementById(id);

        if (el) {
            el.style.transform = "";
        }

    });

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