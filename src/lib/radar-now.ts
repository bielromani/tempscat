/**
 * El cel d'ara, contrastat amb el radar.
 *
 * ## Per què
 *
 * La icona i el nom del cel de l'hora en curs surten del model, i el model pot
 * posar pluja a una hora en què no plou: el 18 de novembre de 2026 a les 21 h la
 * fitxa de Barcelona deia «Pluja feble» amb el radar net damunt de la ciutat.
 * Que falli una previsió és normal; que falli el present, amb el radar de fa
 * deu minuts a la mà, no ho és. El radar és l'única observació de pluja que
 * cobreix tot el país cada deu minuts —una estació va amb una hora de retard i
 * pot ser a deu quilòmetres—, així que l'hora d'ara es contrasta amb ell.
 *
 * ## Què es considera pluja
 *
 * L'esquema de color que es baixa (Universal Blue de RainViewer) pinta **per
 * sota de 15 dBZ un vel beix translúcid** i a partir de 15 dBZ, que són uns
 * 0,3 mm/h, colors opacs. Aquell vel és el que el radar veu a l'aire i
 * sovint no arriba a terra —és el que hi havia damunt de Barcelona aquell
 * vespre, a 0 dBZ—, així que la frontera és l'opacitat: un píxel opac és
 * pluja, un de translúcid no. La taula és la que publica RainViewer
 * (`rainviewer_api_colors_table.csv`).
 *
 * ## Les dues direccions, i per què no pesen igual
 *
 *  · **El model diu pluja i el radar no en veu a menys de 4 km en cap dels dos
 *    últims marcs** (vint minuts): el cel d'ara és el dels núvols del model,
 *    sense pluja. El marge de 4 km i els dos marcs són perquè un ruixat que
 *    passa a tres quilòmetres o que acaba de marxar no es doni per sec.
 *  · **El model diu sec i el radar veu 20 dBZ o més a menys d'1,5 km**: plou.
 *    Aquí el llindar és més alt a posta: un eco feble aïllat pot ser una
 *    pluja que s'evapora abans d'arribar a terra, i dir «plou» quan no plou
 *    és justament el que això vol evitar.
 *
 * Amb el radar de més de 30 minuts no es toca res: un radar vell no és una
 * observació d'ara.
 *
 * ## Restricció
 *
 * Només importa `weather-codes.ts`, que no importa res: el fa servir el worker
 * del radar (amb `.ts`) i la pàgina.
 */
import { weatherCode } from './weather-codes.ts';

export const RADAR_NOW_SHARD = 'radar-ara';

/** El primer color opac de l'esquema: uns 0,3 mm/h. */
export const RAIN_DBZ = 15;
/** Llindar per dir que plou quan el model no ho diu. */
export const WET_DBZ = 20;
/** Fins on es busca pluja abans de dir que no en plou. */
export const NEAR_KM = 4;
/** On ha de ser l'eco per dir que plou aquí. */
export const HERE_KM = 1.5;
/** Més vell que això, el radar no diu res d'ara. */
export const RADAR_NOW_MAX_AGE_MIN = 30;

/**
 * El que el worker deixa per a cada punt de predicció **que té pluja a prop**.
 * Els punts que no hi són no en tenen: un dia sec el fitxer va buit.
 */
export interface RadarNow {
  /** L'instant de l'últim marc observat, ISO. */
  at: string;
  /** Quants marcs s'han mirat. */
  frames: number;
  /**
   * `[dBZ màxim a menys de NEAR_KM en els marcs mirats, dBZ màxim a menys de
   * HERE_KM a l'últim]`. Zero vol dir cap píxel opac.
   */
  points: Record<string, [number, number]>;
}

/**
 * La part opaca de l'esquema Universal Blue, de 15 a 65 dBZ, de la taula de
 * RainViewer. Amb el suavitzat activat els colors es barregen entre veïns, així
 * que es busca el més semblant i no l'exacte.
 */
const PALETTE: Array<[number, number, number, number]> = [
  [15, 0x88, 0xdd, 0xee], [16, 0x6c, 0xd1, 0xeb], [17, 0x51, 0xc5, 0xe8], [18, 0x36, 0xba, 0xe5],
  [19, 0x1b, 0xae, 0xe2], [20, 0x00, 0xa3, 0xe0], [21, 0x00, 0x9a, 0xd5], [22, 0x00, 0x91, 0xca],
  [23, 0x00, 0x88, 0xbf], [24, 0x00, 0x7f, 0xb4], [25, 0x00, 0x77, 0xaa], [26, 0x00, 0x70, 0xa3],
  [27, 0x00, 0x69, 0x9c], [28, 0x00, 0x62, 0x95], [29, 0x00, 0x5b, 0x8e], [30, 0x00, 0x55, 0x88],
  [31, 0x00, 0x51, 0x80], [32, 0x00, 0x4e, 0x78], [33, 0x00, 0x4a, 0x70], [34, 0x00, 0x47, 0x68],
  [35, 0xff, 0xee, 0x00], [36, 0xff, 0xe0, 0x00], [37, 0xff, 0xd2, 0x00], [38, 0xff, 0xc5, 0x00],
  [39, 0xff, 0xb7, 0x00], [40, 0xff, 0xaa, 0x00], [41, 0xff, 0x9f, 0x00], [42, 0xff, 0x95, 0x00],
  [43, 0xff, 0x8b, 0x00], [44, 0xff, 0x81, 0x00], [45, 0xff, 0x44, 0x00], [46, 0xf2, 0x36, 0x00],
  [47, 0xe6, 0x28, 0x00], [48, 0xd9, 0x1b, 0x00], [49, 0xcd, 0x0d, 0x00], [50, 0xc1, 0x00, 0x00],
  [51, 0xa8, 0x00, 0x00], [52, 0x8f, 0x00, 0x00], [53, 0x76, 0x00, 0x00], [54, 0x5d, 0x00, 0x00],
  [55, 0xff, 0xaa, 0xff], [57, 0xff, 0x95, 0xff], [60, 0xff, 0x77, 0xff], [63, 0xff, 0x58, 0xff],
  [65, 0xff, 0xff, 0xff],
];

/**
 * Opacitat a partir de la qual un píxel és pluja. La part translúcida de
 * l'esquema arriba a 190 (14 dBZ) i la opaca és 255; el suavitzat barreja les
 * vores, i 200 deixa fora el vel sense perdre la vora d'un ruixat.
 */
const OPAQUE = 200;

/** El dBZ d'un píxel de la tessel·la, o 0 si no és pluja. */
export function pixelDbz(r: number, g: number, b: number, a: number): number {
  if (a < OPAQUE) return 0;
  let best = RAIN_DBZ;
  let bestD = Infinity;
  for (const [dbz, pr, pg, pb] of PALETTE) {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) { bestD = d; best = dbz; }
  }
  return best;
}

/** Marshall-Palmer, `Z = 200·R^1,6`: la intensitat que correspon a un dBZ, en mm/h. */
export function dbzToMmH(dbz: number): number {
  return (10 ** (dbz / 10) / 200) ** (1 / 1.6);
}

const WET_GROUPS = new Set([
  'drizzle', 'rain', 'showers', 'snow', 'snow_showers', 'freezing', 'thunder', 'hail',
]);

/** El cel sense pluja que correspon a una nuvolositat, en codis WMO. */
function dryCode(cloudCover: number | null): number {
  if (cloudCover == null || cloudCover >= 85) return 3;
  if (cloudCover >= 45) return 2;
  if (cloudCover >= 15) return 1;
  return 0;
}

export interface RadarVerdict {
  weatherCode: number;
  precipitation: number;
  /** Què ha canviat: el model deia pluja i no n'hi ha, o al revés. */
  by: 'radar-dry' | 'radar-wet';
}

/**
 * L'hora d'ara corregida pel radar, o null si el radar no la contradiu (o no
 * es pot fer servir).
 *
 * `obs` és l'entrada del punt a `RadarNow.points`: sense entrada, no hi ha cap
 * píxel de pluja a `NEAR_KM`.
 */
export function radarVerdict(
  hour: { weatherCode: number | null; cloudCover: number | null; temperature: number | null; precipitation: number | null },
  obs: [number, number] | undefined,
): RadarVerdict | null {
  if (hour.weatherCode == null) return null;
  const wetModel = WET_GROUPS.has(weatherCode(hour.weatherCode).group);
  const [near, here] = obs ?? [0, 0];

  if (wetModel && near < RAIN_DBZ) {
    return { weatherCode: dryCode(hour.cloudCover), precipitation: 0, by: 'radar-dry' };
  }
  if (!wetModel && here >= WET_DBZ) {
    const snow = hour.temperature != null && hour.temperature <= 1;
    const code = snow ? (here < 30 ? 71 : 73) : here < 30 ? 61 : here < 40 ? 63 : 65;
    const rate = Math.round(dbzToMmH(here) * 10) / 10;
    return { weatherCode: code, precipitation: Math.max(hour.precipitation ?? 0, rate), by: 'radar-wet' };
  }
  return null;
}
