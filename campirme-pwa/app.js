/* APP.JS — utilitats compartides, extretes VERBATIM de javascript.html (només les que fa servir Campirme) */

let partida = null;
let cronometre = null;

function obtenirCodiTargeta() {

    if (
        typeof CODI_TARGETA_SERVIDOR !== "undefined" &&
        CODI_TARGETA_SERVIDOR
    ) {
        localStorage.setItem(
            "cards360_codi_actiu",
            CODI_TARGETA_SERVIDOR
        );

        return CODI_TARGETA_SERVIDOR;
    }

    return localStorage.getItem("cards360_codi_actiu") || "";

}

function convertirText(text) {

    if (!text) {
        return "";
    }

    return String(text).replace(/\n/g, "<br>");

}

function format2(valor) {

    valor = Number(valor) || 0;

    return valor < 10
        ? "0" + valor
        : String(valor);

}

function dibuixarHeader(){

    if(!partida){
        return;
    }

    const activitatNom =
        document.getElementById("activitatNom");

    if(activitatNom){

        activitatNom.innerText =
            partida.activitat.nom;

    }

    const activitatIcona =
        document.getElementById("activitatIcona");

    if(activitatIcona){

        activitatIcona.innerText =
            partida.activitat.icona || "🪖";

    }

    const equip =
        document.getElementById("equip");

    if(equip){

        equip.innerText =
            partida.equip || "";

    }

    const missioNumero =
    document.getElementById("missioNumero");

    const progressText =
        document.getElementById("progressText");

    const progressFill =
        document.getElementById("progressFill");

    // Petjades Cardós
    if (
        partida.activitat &&
        partida.activitat.id === "PetjadesCardos"
    ) {

        const descobertes =
            Array.isArray(partida.petjadesDescobertes)
                ? partida.petjadesDescobertes.length
                : 0;

        const total =
            Number(partida.totalMissions || 0);

        if (missioNumero) {
            missioNumero.innerText = "";
        }

        if (progressText) {
            progressText.innerText =
                descobertes +
                " / " +
                total;
        }

        if (progressFill) {
            progressFill.style.width =
                total > 0
                    ? ((descobertes / total) * 100) + "%"
                    : "0%";
        }

        return;
    }

    // Activitats amb missió
    if (partida.missio) {

        const missioId =
            Number(partida.missio.id);

        const total =
            Number(partida.totalMissions || 1);

        if (missioNumero) {

            missioNumero.innerText =
                "Missió " + partida.missio.id;

        }

        if (progressText) {

            progressText.innerText =
                partida.missio.id +
                " / " +
                total;

        }

        if (progressFill) {

            progressFill.style.width =
                ((missioId / total) * 100) + "%";

        }

    }


    // Activitats sense missió,
    // com Petjades Cardós
    else {

        if (missioNumero) {

            missioNumero.innerText =
                "";

        }

        if (progressText) {

            progressText.innerText =
                "";

        }

        if (progressFill) {

            progressFill.style.width =
                "0%";

        }

    }

}

function iniciarCronometre(){

    if(cronometre){

        clearInterval(cronometre);

    }

    actualitzarCronometre();

    cronometre =
        setInterval(
            actualitzarCronometre,
            1000
        );

}

function actualitzarCronometre(){

    if(
        !partida ||
        !partida.inici
    ){
        return;
    }

    const inici =
        new Date(partida.inici).getTime();

    const ara =
        Date.now();

    let segons =
        Math.floor(
            (ara - inici) / 1000
        );

    const hores =
        Math.floor(segons / 3600);

    segons =
        segons % 3600;

    const minuts =
        Math.floor(segons / 60);

    const segonsFinal =
        segons % 60;

    const crono =
        document.getElementById("cronometre");

    if(crono){

        crono.innerText =
            format2(hores) +
            ":" +
            format2(minuts) +
            ":" +
            format2(segonsFinal);

    }

}

function dibuixarPreguntesPetjades(
    preguntes,
    contenidorId,
    preguntaVisibleId
) {

    const contenidor =
        document.getElementById(
            contenidorId
        );

    if (!contenidor) {
        return;
    }

    contenidor.innerHTML = "";

    if (
        !Array.isArray(preguntes) ||
        preguntes.length === 0
    ) {
        return;
    }

    window.petjadaRespostes =
        window.petjadaRespostes || {};

    const principal =
        preguntes.find(function(pregunta) {
            return pregunta.tipus === "principal";
        });

    let preguntaActiva = null;

    if (preguntaVisibleId) {

        preguntaActiva =
            preguntes.find(function(pregunta) {
                return pregunta.id === preguntaVisibleId;
            }) || null;

    } else {

        preguntaActiva =
            principal || null;

    }

    if (!preguntaActiva) {
        return;
    }

    const esBonus =
        preguntaActiva.tipus === "bonus";

    const preguntaId =
        preguntaActiva.id ||
        "pregunta_petjada";

    const valorActual =
        String(
            window.petjadaRespostes[preguntaId] || ""
        )
            .trim()
            .toUpperCase();

    const opcions =
        Array.isArray(preguntaActiva.opcions)
            ? preguntaActiva.opcions
            : [];

    const classeBonus =
        esBonus
            ? " pregunta-bonus"
            : "";

    const etiquetaBonus =
        esBonus
            ? `
                <div class="petjada-bonus-cap">
                    💎 BONUS
                </div>
            `
            : "";

    const opcionsHtml =
        opcions.map(function(opcio) {

            const lletra =
                String(opcio || "")
                    .trim()
                    .charAt(0)
                    .toUpperCase();

            const text =
                String(opcio || "")
                    .replace(
                        /^[A-Ca-c]\)\s*/,
                        ""
                    )
                    .trim();

            const seleccionada =
                valorActual === lletra
                    ? " seleccionada"
                    : "";

            return `
                <button
                    type="button"
                    class="petjada-opcio${seleccionada}"
                    data-pregunta="${preguntaId}"
                    data-resposta="${lletra}"
                >
                    <span class="petjada-opcio-lletra">
                        ${lletra}
                    </span>

                    <span class="petjada-opcio-text">
                        ${text}
                    </span>
                </button>
            `;

        }).join("");

    const ajudaBruixolaHtml =
        preguntaActiva.bruixolaAjuda
            ? `
                <button
                    type="button"
                    class="petjada-boto-ajuda-bruixola"
                    data-pregunta-ajuda="${preguntaId}"
                >
                    🧭 Ajuda
                </button>
            `
            : "";

    const html = `
        <div
            class="pregunta petjada-pregunta${classeBonus}"
            data-pregunta-id="${preguntaId}"
            data-tipus="${preguntaActiva.tipus || "principal"}"
        >

            ${etiquetaBonus}

            <div class="petjada-pregunta-text">
                ${preguntaActiva.text || ""}
            </div>

            ${ajudaBruixolaHtml}

            <div class="petjada-opcions">
                ${opcionsHtml}
            </div>

            <div
                id="error-${preguntaId}"
                class="missatge-error-pregunta"
                style="display:none;">
            </div>

        </div>
    `;

    contenidor.insertAdjacentHTML(
        "beforeend",
        html
    );

    const botoAjudaBruixola =
        contenidor.querySelector(
            ".petjada-boto-ajuda-bruixola"
        );

    if (botoAjudaBruixola) {

        botoAjudaBruixola.addEventListener(
            "click",
            function() {

                obrirBruixolaAjuda(
                    preguntaActiva.bruixolaAjuda
                );

            }
        );

    }

    contenidor
        .querySelectorAll(
            ".petjada-opcio"
        )
        .forEach(function(boto) {

            boto.addEventListener(
                "click",
                function() {

                    const resposta =
                        String(
                            boto.dataset.resposta || ""
                        )
                            .trim()
                            .toUpperCase();

                    window.petjadaRespostes[
                        preguntaId
                    ] = resposta;

                    contenidor
                        .querySelectorAll(
                            ".petjada-opcio"
                        )
                        .forEach(function(opcio) {
                            opcio.classList.remove(
                                "seleccionada"
                            );
                        });

                    boto.classList.add(
                        "seleccionada"
                    );

                    const error =
                        document.getElementById(
                            "error-" + preguntaId
                        );

                    if (error) {
                        error.innerText = "";
                        error.style.display = "none";
                    }

                }
            );

        });

}

function mostrarError(text) {

    const loading =
        document.getElementById("loading");

    if (loading) {
        loading.style.display = "none";
    }

    const joc =
        document.getElementById("joc");

    if (joc) {
        joc.style.display = "none";
    }

    const global =
        document.getElementById("globalMessage");

    if (!global) {
        alert(text);
        return;
    }

    global.style.display = "block";

    global.innerHTML =
        "<div class='error'>" +
        text +
        "</div>";

}

function llançarConfeti(){

    const popup =
        document.querySelector(".missio-popup");

    if(!popup){
        return;
    }

    const r =
        popup.getBoundingClientRect();

    const cx =
        r.left + r.width / 2;

    const cy =
        r.top + r.height / 2;

    const colors = [
        "#ef4444",
        "#22c55e",
        "#3b82f6",
        "#f59e0b",
        "#ec4899",
        "#a855f7"
    ];

    for(let i=0;i<80;i++){

        const p =
            document.createElement("div");

        p.className = "confetti";

        const angle =
            Math.random() * Math.PI * 2;

        const dist =
            250 + Math.random() * 250;

        const x =
            Math.cos(angle) * dist;

        const y =
            Math.sin(angle) * dist;

        p.style.left = cx + "px";
        p.style.top = cy + "px";

        p.style.background =
            colors[
                Math.floor(
                    Math.random() * colors.length
                )
            ];

        document.body.appendChild(p);

        p.animate(

            [

                {
                    transform:
                        "translate(0,0) rotate(0deg)",
                    opacity:1
                },

                {
                    transform:
                        `translate(${x}px,${y}px) rotate(${720 + Math.random()*720}deg)`,
                    opacity:0
                }

            ],

            {

                duration:1400,
                easing:"cubic-bezier(.2,.8,.3,1)"

            }

        );

        setTimeout(function(){

            p.remove();

        },1500);

    }

}

function mostrarMissioCompletada(missatge, bonus, callback, opcions){

    opcions = opcions || {};

    const icona =
        opcions.icona || "⭐";

    const titol =
        opcions.titol || "ENHORABONA!";

    const confeti =
        opcions.confeti !== false;

    const negatiu =
        opcions.negatiu === true;

    const duracio =
        opcions.duracio || 3500;

    const overlay =
        document.getElementById("missioCompletada");

    const iconaDiv =
        document.getElementById("missioIcona");

    const titolDiv =
        document.getElementById("missioTitol");

    const text =
        document.getElementById("missioMissatge");

    const bonusDiv =
        document.getElementById("missioBonus");

    iconaDiv.textContent = icona;

    titolDiv.textContent = titol;

    titolDiv.classList.toggle(
        "missio-title-negatiu",
        negatiu
    );

    text.innerHTML = missatge;

    if(bonus){

        bonusDiv.style.display = "block";
        bonusDiv.innerHTML = "💎 " + bonus;

    }else{

        bonusDiv.style.display = "none";

    }

    overlay.style.display = "flex";

    const popup =
        overlay.querySelector(".missio-popup");

    popup.style.transform = "scale(0.4)";
    popup.style.opacity = "0";

    requestAnimationFrame(function(){

        popup.style.transition =
            "transform .35s cubic-bezier(.2,1.5,.4,1), opacity .25s";

        popup.style.transform = "scale(1.12)";
        popup.style.opacity = "1";

        setTimeout(function(){

            popup.style.transform = "scale(1)";

        },180);

    });

    if(confeti){

        llançarConfeti();

    }

    setTimeout(function(){

        overlay.style.display = "none";

        if(callback){

            callback();

        }

    },duracio);

}

function calcularBearingBruixola(lat1, lon1, lat2, lon2) {

    const toRad = function(v) { return v * Math.PI / 180; };
    const toDeg = function(v) { return v * 180 / Math.PI; };

    const dLon = toRad(lon2 - lon1);

    const y =
        Math.sin(dLon) * Math.cos(toRad(lat2));

    const x =
        Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.cos(dLon);

    const bearing =
        toDeg(Math.atan2(y, x));

    return (bearing + 360) % 360;

}

function distanciaMetresBruixola(lat1, lon1, lat2, lon2) {

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
