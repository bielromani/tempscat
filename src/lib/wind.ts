/**
 * El camp de vent: on viu, quina forma té i com es llegeix.
 *
 * ## Què és, i per què no és una imatge de colors
 *
 * És una **graella regular de components u i v** —cap a l'est i cap al nord—
 * desada com un PNG on el vermell porta la u i el verd la v. No és un dibuix:
 * és el dat, i qui el pinta és el navegador movent-hi partícules a sobre.
 *
 * Va en PNG i no en un binari propi per una raó pràctica: una textura de WebGL
 * es fa amb una imatge sense descodificar res, i el PNG és sense pèrdua. Amb
 * un binari caldria escriure el lector, i amb JSON serien trenta quilobytes de
 * números en comptes de dos.
 *
 * ## Els dos bytes no són la velocitat: són u i v
 *
 * I això és el que fa que el camp es pugui interpolar. **La direcció no es pot
 * promitjar**: entre 350° i 10° la mitjana dona 180°, o sigui vent del sud
 * exactament on bufa del nord. Descompost en u i v, dos vents oposats es
 * cancel·len, que és el que fa l'aire de debò.
 *
 * ## La convenció, comprovada amb la marinada i no amb la fórmula
 *
 * Open-Meteo dona la direcció **d'on ve** el vent, com tota la meteorologia. O
 * sigui `u = −v·sin(θ)` i `v = −v·cos(θ)`.
 *
 * Que el signe és aquest i no l'altre està comprovat amb física: a les quatre
 * de la tarda, a Malgrat, Cambrils i Sant Feliu, la `v` surt **positiva** els
 * tres dies —cap al nord, o sigui del mar cap a terra—, que és exactament el
 * que fa la marinada. Amb el signe canviat sortiria bufant mar endins a les
 * quatre de la tarda de setembre, i el mapa seguiria semblant un mapa.
 * `npm run test:wind`.
 *
 * No importa res, com la resta de fitxers compartits: el llegeixen el worker
 * que el pinta i la pàgina que el mou, i les dues bandes han d'entendre igual
 * què vol dir un byte.
 */

export const WIND_DIR = 'wind';

/** L'índex: quines hores hi ha, quina graella i com es desfà l'escala. */
export function windShard(): string {
  return `${WIND_DIR}/index`;
}

/**
 * El pas de la graella, en graus.
 *
 * 0,05° són uns 4 km, i **no és la resolució del model**: els punts de dins
 * estan a 3,2 km i els de fora a 25. És la resolució del *dibuix*, i una
 * partícula no es llegeix més fina que això. Baixar-lo no afegiria informació
 * i multiplicaria el pes per quatre.
 */
export const WIND_STEP = 0.05;

/**
 * El sostre de l'escala, en m/s.
 *
 * Els dos components es desen en un byte cadascun, o sigui 256 graons entre
 * −30 i +30: un graó és de 0,235 m/s, menys d'un km/h. Per sobre es retalla,
 * i 30 m/s són 108 km/h — una tramuntana de les grosses. Retallar la punta
 * d'un temporal fa que les partícules hi vagin una mica més a poc a poc;
 * partir el rang en dos bytes per guanyar-hi precisió que ningú no veu, no.
 */
export const WIND_MAX = 30;

/** De byte a m/s. La inversa de com s'ha desat. */
export function windDecode(byte: number): number {
  return (byte / 255) * (2 * WIND_MAX) - WIND_MAX;
}

/** De m/s a byte, retallant fora de rang. */
export function windEncode(ms: number): number {
  const clamped = Math.max(-WIND_MAX, Math.min(WIND_MAX, ms));
  return Math.round(((clamped + WIND_MAX) / (2 * WIND_MAX)) * 255);
}

/**
 * De direcció meteorològica a components, en m/s.
 *
 * `speedKmh` ve d'Open-Meteo en km/h i `fromDeg` és **d'on ve** el vent.
 */
export function windComponents(speedKmh: number, fromDeg: number): { u: number; v: number } {
  const ms = speedKmh / 3.6;
  const rad = (fromDeg * Math.PI) / 180;
  return { u: -ms * Math.sin(rad), v: -ms * Math.cos(rad) };
}

export interface WindHour {
  /** Segons des de l'epoch, com els marcs del radar. */
  time: number;
  /** `AAAA-MM-DDTHH`, l'hora local de la predicció. */
  iso: string;
  /** El nom del fitxer, sense sufix: `AAAAMMDDHH`. */
  name: string;
  /** L'empremta, per no tornar a pujar la que ja hi ha. Com al camp de pluja. */
  hash?: string;
  /** La velocitat més alta de l'hora, en m/s. Per al peu del mapa. */
  maxMs: number;
}

export interface WindIndex {
  /** El rectangle que cobreix la graella, en graus. */
  box: { west: number; east: number; south: number; north: number };
  /** Quantes caselles té, i per tant la mida del PNG. */
  width: number;
  height: number;
  step: number;
  /** El sostre de l'escala, per desfer-la al navegador. */
  max: number;
  hours: WindHour[];
  /** Quants punts de predicció hi han entrat. */
  points: number;
  source: string;
}
