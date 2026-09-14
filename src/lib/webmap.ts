/**
 * El mapa que es pot moure: la finestra, els zooms i les adreces.
 *
 * ## Per què això és un fitxer i no dues constants
 *
 * Perquè **ho han d'entendre igual el guió que baixa les tessel·les i la
 * pàgina que les col·loca**. Amb dues còpies, el dia que una canviï, el guió
 * baixaria un rectangle i el mapa en demanaria un altre: sortirien forats al
 * caire i **res no donaria cap error**, perquè un 404 d'una tessel·la a
 * MapLibre és un quadrat buit i prou. És el mateix motiu pel qual `fitBox()` i
 * `tileWindow()` viuen a `mercator.ts` i no dins del `RouteMap`.
 *
 * No importa res, com la resta de fitxers compartits.
 */

/**
 * La finestra del mapa, en graus.
 *
 * Un pas més enllà de la costa i de la ratlla de França a posta: si s'acabés
 * al límit exacte del país, arrossegar cap al mar ensenyaria el blanc just on
 * comença el Mediterrani. Són els mateixos graus que `RING_BOX` del camp de
 * pluja, i per la mateixa raó.
 */
export const MAP_BOX = { west: 0.05, east: 3.45, south: 40.45, north: 42.95 };

/**
 * Fins on es pot arrossegar, que és una mica més enllà d'on hi ha tessel·les.
 *
 * Amb el límit clavat a `MAP_BOX` no es podria centrar cap punt del caire: el
 * mapa rebotaria en arribar-hi. Amb mig grau de marge, l'Alt Empordà i el
 * delta es poden posar al mig i el que es veu més enllà és el fons de color,
 * que **és el que hi ha**: cartografia que no hem baixat, no territori buit.
 */
export const MAP_MAX_BOUNDS = { west: -0.6, east: 4.1, south: 39.9, north: 43.5 };

/**
 * Els zooms que tenen tessel·les de mapa base per a tot el país.
 *
 * Del **6**, i no del 7, per una raó que només es veu al telèfon: Catalunya
 * sencera en una finestra d'uns mil píxels cau cap al zoom 7,7, però en una de
 * 375 cau al **6,3**. Amb el terra al 7, el mapa d'un mòbil obria ensenyant
 * només el mig del país i no hi havia manera d'allunyar-se més — no com un
 * error, sinó com un mapa que comença massa a prop i no explica per què.
 * Costa dues tessel·les.
 *
 * Fins a l'11 perquè les de l'ICGC són de 512 píxels i allà ja s'hi llegeixen
 * els carrers d'un poble. Els ha de fer servir `14-basemap-tiles.ts` per decidir
 * què baixa.
 */
export const MAP_MIN_ZOOM = 6;
export const MAP_NATIVE_MAX_ZOOM = 11;

/**
 * I fins on deixem acostar-se, que és un pas més enllà del que hi ha.
 *
 * A partir de l'11 el que es veu és la mateixa imatge ampliada: no apareix cap
 * detall nou. S'hi deixa arribar igualment perquè un grau de sobreampliació fa
 * llegible la forma d'un municipi petit, i el peu del mapa ho diu — que és el
 * que ja es va haver de dir del radar, on el sostre real són tres zooms més
 * avall del que sembla.
 */
export const MAP_MAX_ZOOM = 12;

/** El zoom del mosaic del radar. No n'hi ha cap altre: el públic s'hi acaba. */
export const RADAR_ZOOM = 7;

/**
 * On viu el worker de MapLibre, i per què el servim nosaltres.
 *
 * MapLibre en compon el nom del fitxer amb una cadena en temps d'execució
 * (`'maplibre-gl-worker.mjs'`) i el resol contra `import.meta.url`. Turbopack,
 * com qualsevol empaquetador, hi posa l'empremta del contingut al nom, així que
 * aquella cadena demana un fitxer que no existeix: Next contesta amb la seva
 * pàgina d'error —HTML— i el worker no arrenca.
 *
 * El mapa es dibuixa igualment (les tessel·les no passen pel worker) però el
 * GeoJSON no arriba mai, `style.loaded()` no és cert mai i `load` no es dispara
 * mai. **Cap error.** Per això el copiem a `public/` amb un nom estable i li
 * passem l'adreça amb `setWorkerUrl()`.
 *
 * La còpia la fa `scripts/16-maplibre-worker.ts` a cada `build` i a cada `dev`,
 * des del paquet instal·lat. Aquesta constant i la destinació d'aquell guió
 * són la mateixa ruta: si una canvia, l'altra també.
 */
export const MAPLIBRE_WORKER = '/maplibre/maplibre-gl-worker.mjs';
