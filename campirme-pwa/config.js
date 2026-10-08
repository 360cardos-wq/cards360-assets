/*************************************************
 * CONFIG.JS — els únics valors que cal ajustar
 *************************************************/

// Backend (Apps Script, desplegament "Aplicació web"). És l'URL /exec existent.
var API_URL = "https://script.google.com/macros/s/AKfycbxQEIQBk4pR08-NJ13BV64diBgPGQbtu6LXEocCoSkMI3ChQdz8gKEHZrgRGAsSw7zVmw/exec";

// El codi existent (campirmeOffline.js) redirigeix a scriptUrl+"?view=Final..."
var scriptUrl = API_URL;

// Codi de la targeta: de ?codi=... ; si no hi és (obert des de la icona), obtenirCodiTargeta()
// recupera l'últim guardat a localStorage.
var CODI_TARGETA_SERVIDOR = (new URLSearchParams(location.search).get("codi") || "").trim();

// Segons abans de donar una trucada al servidor per fallida (sense cobertura = fallar ràpid)
var API_TIMEOUT_MS = 20000;

/*
 * RESERVAT PER AL MAPA OFFLINE (encara no implementat).
 * - El SW ja separa els seus caches: "campirme-shell-*" (aplicació, es renova per versió)
 *   i "campirme-mapa-*" (mai s'esborren en actualitzar l'aplicació).
 * - El mapa es descarregarà al mòbil des del gate, però quedarà BLOQUEJAT al joc fins
 *   que el jugador el desbloquegi amb minuts: flag local "campirme_mapa_<codi>" = "1"
 *   (+ esdeveniment "ajustTemps" a la cua, com qualsevol altre cost de minuts).
 */
var MAPA_DESBLOQUEIG_CLAU = function (codi) { return "campirme_mapa_" + codi; };
