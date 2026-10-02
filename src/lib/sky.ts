/**
 * El cel del titular: què es dibuixa darrere del nom d'un lloc.
 *
 * ## Què és, i què no
 *
 * És una **atmosfera calculada**, no una il·lustració triada d'un menú. Surt de
 * l'altura del sol, la nuvolositat, el tipus de precipitació, la seva
 * intensitat, l'aparell elèctric i la fase de la lluna, i d'aquí en surten
 * totes les combinacions: sol amb quatre núvols, xàfec amb el cel tancat,
 * capvespre tapat, tempesta de nit.
 *
 * ## El nom del temps **no** surt d'aquí
 *
 * Surt de `weather-codes.ts`, que és qui ja el diu a la fitxa, a la taula
 * horària i al resum del dia. Aquest fitxer només decideix **com es pinta**.
 * Amb una segona descripció del mateix temps, el dia que algú toqués un
 * llindar el titular i la taula de sota dirien coses diferents de la mateixa
 * hora sense que res fallés.
 *
 * ## Quina hora es dibuixa
 *
 * **La del rellotge, amb els minuts**, i no l'hora en punt de la predicció.
 * El sol es mou quinze graus per hora, i al capvespre això és tot: a les 19.55
 * amb la posta a les 19.36, l'hora en punt dibuixava el cel de les 19.00, amb
 * el sol encara a dalt. La nuvolositat i la pluja sí que són les de l'hora de
 * la predicció, que és l'única resolució que tenen.
 *
 * I la fitxa ja no es guarda hores: es genera a la petició i el CDN la té
 * cinc minuts (ver `next.config.ts`). Un cel calculat amb l'hora d'ara no
 * serveix de res si després se serveix durant tota una tarda.
 *
 * ## La llum, que és el que estava malament
 *
 * Tres coses, corregides l'1 d'octubre de 2026 després que el cel sortís
 * **negre** en un lloc on hi havia claror de sobres:
 *
 *  · **L'altura del sol és la de veritat**, en graus, també sota l'horitzó.
 *    El dia es repartia en una fracció entre la sortida i la posta, i en
 *    pondre's el sol la llum queia a zero de cop. Ara hi ha crepuscle civil,
 *    nàutic i nit, cadascun amb la claror que li toca.
 *  · **Un núvol no és mai negre.** La claror es multiplica pel gruix del
 *    núvol; abans s'hi restava, i amb poc sol donava negatiu.
 *  · **El vel de contrast es calcula** per a cada cel. Era el mateix vel fosc
 *    per a totes les hores, i la nit i el capvespre —que ja són foscos—
 *    sortien tapats com un migdia de juliol.
 *
 * ## Dues correccions físiques abans de dibuixar res
 *
 * Si precipita, la nuvolositat no pot baixar d'un mínim; si hi ha aparell
 * elèctric o boira, tampoc. **No pot ploure amb el cel serè**, i un model que
 * doni 10 % de núvols amb 4 mm a la mateixa hora no és un cel que calgui
 * dibuixar tal qual: és un model que s'ha equivocat en una de les dues.
 *
 * ## Contrast
 *
 * El text blanc del titular ha de passar de 4,5:1 damunt de qualsevol cel,
 * inclòs un migdia de juliol amb un núvol blanc just darrere del topònim. Ho
 * garanteix `contrastVeil`, i `npm run test:sky` ho torna a mesurar capa a
 * capa. El que això vol dir, i convé no amagar-ho: **darrere del text, el cel
 * no pot ser mai més clar que un gris mitjà**. Un dia tapat es dibuixa de
 * color plom clar i no blanc, perquè en blanc el nom del poble no es llegiria.
 */
import { weatherCode } from './weather-codes.ts';
import { oklchToHex } from './scales.ts';

/**
 * Un color en OKLCH: lluminositat en tant per cent, croma i to en graus.
 *
 * Com a números i no com a cadenes perquè les parades del cel s'han de barrejar
 * **aquí**, i no al navegador amb `color-mix()`: el vel de contrast de sota es
 * calcula a partir de la lluminositat del que hi ha a darrere, i d'un color que
 * encara no s'ha barrejat no se'n pot saber la lluminositat.
 */
type LCH = readonly [number, number, number];

/**
 * El cel serè, segons **l'altura del sol en graus**. Quatre parades cadascun,
 * de dalt a baix.
 *
 * Les claus són les de l'astronomia i no hores del rellotge: el crepuscle civil
 * s'acaba amb el sol a −6°, el nàutic a −12° i la nit tancada comença a −18°.
 * A Catalunya això són uns trenta minuts, una hora i una hora i mitja després
 * de la posta, i a l'estiu més. La primera versió repartia el dia en una
 * fracció entre la sortida i la posta, i en el moment de pondre's el sol la
 * llum queia a zero de cop: un vespre ennuvolat sortia **negre** amb claror de
 * sobres per llegir al carrer.
 */
const SKY_KEYS: ReadonlyArray<readonly [number, readonly [LCH, LCH, LCH, LCH]]> = [
  [-18, [[17, 0.045, 268], [23, 0.055, 260], [29, 0.05, 252], [34, 0.04, 248]]],
  [-12, [[20, 0.055, 266], [27, 0.065, 260], [35, 0.065, 254], [43, 0.06, 248]]],
  [-6, [[28, 0.08, 266], [39, 0.09, 262], [52, 0.09, 256], [65, 0.07, 40]]],
  [0, [[36, 0.09, 272], [48, 0.11, 292], [64, 0.14, 22], [78, 0.15, 52]]],
  [6, [[46, 0.13, 262], [62, 0.12, 250], [80, 0.10, 62], [86, 0.13, 56]]],
  [20, [[56, 0.14, 250], [68, 0.115, 241], [81, 0.075, 228], [87, 0.055, 222]]],
  [50, [[50, 0.155, 254], [63, 0.13, 244], [77, 0.09, 231], [85, 0.06, 224]]],
];

/**
 * Quanta llum hi ha, de 0 a 1, segons l'altura del sol.
 *
 * No és la corba del cel serè sinó la de **la claror que arriba a terra**: amb
 * el sol a l'horitzó encara n'hi ha més de la meitat de la que il·lumina un
 * núvol al migdia, i al final del crepuscle civil, una cinquena part. És el que
 * decideix el color dels núvols, que no tenen llum pròpia.
 */
const LIGHT_KEYS: ReadonlyArray<readonly [number, number]> = [
  [-18, 0], [-12, 0.06], [-9, 0.12], [-6, 0.22], [-3, 0.36], [0, 0.55], [5, 0.8], [10, 0.92], [20, 1],
];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothStep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Interpola una taula de claus ordenades. Fora de la taula, el valor de l'extrem. */
function keyed(keys: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) {
      return mix(keys[i - 1][1], keys[i][1], (x - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * La barreja de dos colors, en OKLab.
 *
 * En OKLab i no en sRGB perquè és on una barreja no passa per un gris mort pel
 * mig: entre el taronja del crepuscle i el blau de la nit, en sRGB hi ha un
 * tram marró que no existeix al cel.
 */
function mixLch(p: LCH, q: LCH, t: number): LCH {
  const pa = p[1] * Math.cos(rad(p[2]));
  const pb = p[1] * Math.sin(rad(p[2]));
  const qa = q[1] * Math.cos(rad(q[2]));
  const qb = q[1] * Math.sin(rad(q[2]));
  const a = mix(pa, qa, t);
  const b = mix(pb, qb, t);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return [mix(p[0], q[0], t), Math.hypot(a, b), h < 0 ? h + 360 : h];
}

const css = ([l, c, h]: LCH, alpha?: number) =>
  `oklch(${l.toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(0)}${alpha == null ? '' : ` / ${alpha.toFixed(3)}`})`;

/** La lluminositat d'un color en sRGB, sense linearitzar: com componen els navegadors. */
function srgbLum(color: LCH): number {
  const hex = oklchToHex(css(color));
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0.5;
  return (0.2126 * parseInt(hex.slice(1, 3), 16)
    + 0.7152 * parseInt(hex.slice(3, 5), 16)
    + 0.0722 * parseInt(hex.slice(5, 7), 16)) / 255;
}

const toSrgb = (v: number) => (v <= 0.00304 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

export type Precip = 'none' | 'rain' | 'snow';

export interface SkyInput {
  /** Hora local decimal del moment que es dibuixa: 14,5 són dos quarts de tres. */
  hour: number;
  /** Sortida i posta del sol d'aquell dia i d'aquell punt, en hores decimals. */
  sunriseH: number | null;
  sunsetH: number | null;
  /** Latitud del lloc, en graus. Sense ella, la del centre de Catalunya. */
  lat?: number | null;
  /** Nuvolositat, 0–100. */
  cloudCover: number | null;
  /** El codi WMO de l'hora. D'aquí surten el tipus de precipitació i el llamp. */
  code: number | null;
  /** Mil·límetres d'aquella hora. Decideix la densitat del dibuix, no si plou. */
  precipitationMm: number | null;
  /** Posició al cicle lunar: 0 i 1 són lluna nova, 0,5 és plena. */
  moonPhase: number;
}

export interface Sky {
  /** De dia, per si qui dibuixa vol triar icona. */
  isDay: boolean;
  /** L'altura del sol, en graus. Negativa sota l'horitzó. */
  sunAltitude: number;
  /** La claror que arriba a terra, de 0 (nit tancada) a 1 (ple dia). */
  light: number;
  precip: Precip;
  thunder: boolean;
  /** Nuvolositat ja corregida, 0–1. La que es dibuixa. */
  cover: number;
  /** Intensitat del dibuix de la precipitació, 0–100. */
  intensity: number;

  skyGradient: string;
  /** El color de dalt del cel, sol: el fons pla per si el degradat no es pinta. */
  skyBase: string;
  bodyLeft: string;
  bodyTop: string;

  sunVisible: boolean;
  sunOpacity: string;
  sunBloom: string;
  sunScatter: string;
  sunRay: string;
  sunStreak: string;

  moonVisible: boolean;
  moonPath: string;

  starOpacity: string;

  cloudFilter: string;
  cloudFilterNear: string;
  wispOpacity: number;
  cloudFarOpacity: number;
  cloudNearOpacity: number;
  overcastOpacity: number;

  veilOpacity: string;
  veilImage: string;

  /**
   * El vel de contrast, **calculat per a aquest cel** i no una constant.
   *
   * És l'última capa abans del text i existeix per una sola raó: que el text
   * blanc del titular passi de 4,5:1. Abans era el mateix degradat fosc per a
   * totes les hores —del 22 al 74 % d'opacitat—, i una nit serena, que ja és
   * fosca, sortia tapada igual que un migdia de juliol. Ara cada franja
   * d'alçada porta només l'opacitat que li cal per al pitjor que hi pugui haver
   * al darrere: de nit gairebé gens, i de dia la justa.
   *
   * `contrastStops` són les mateixes parades en números —posició de dalt a
   * baix i opacitat—, perquè `npm run test:sky` pugui tornar a compondre el
   * titular capa a capa i mesurar-lo.
   */
  contrastVeil: string;
  contrastStops: Array<[number, number]>;

  rainOpacity: string;
  rainAngle: [string, string, string];
  snowOpacity: string;
}

/**
 * De mil·límetres a densitat de dibuix.
 *
 * Logarítmica i no lineal, per la mateixa raó que `precipitationColor()`: entre
 * 0,2 i 2 mm hi ha tota la diferència que es nota mirant per la finestra, i
 * entre 20 i 40 no n'hi ha cap que un dibuix de partícules pugui ensenyar.
 *
 * El terra importa: **0,1 mm no dibuixa res.** Surt per sota del llindar de 3 a
 * posta, perquè una dècima és una gota i pintar-hi ratlles diria que plou.
 */
function intensityOf(mm: number): number {
  if (!(mm > 0)) return 0;
  return 100 * Math.min(1, Math.log10(mm + 1) / Math.log10(31));
}

/** Del codi WMO al que s'ha de dibuixar. Els noms els diu `weather-codes`. */
function precipOf(code: number | null): { precip: Precip; thunder: boolean; fog: boolean } {
  const group = weatherCode(code).group;
  switch (group) {
    case 'snow':
    case 'snow_showers':
      return { precip: 'snow', thunder: false, fog: false };
    case 'drizzle':
    case 'rain':
    case 'showers':
    case 'freezing':
      return { precip: 'rain', thunder: false, fog: false };
    case 'thunder':
    case 'hail':
      // Una tempesta porta aigua encara que el model no en declari a l'hora.
      return { precip: 'rain', thunder: true, fog: false };
    case 'fog':
      return { precip: 'none', thunder: false, fog: true };
    default:
      return { precip: 'none', thunder: false, fog: false };
  }
}

/**
 * L'altura del sol, en graus, a partir de l'hora, la sortida, la posta i la
 * latitud.
 *
 * La durada del dia ja porta a dins la declinació —és el que fa que al juny
 * duri quinze hores i al desembre nou—, així que es treu d'aquí en comptes de
 * tornar-la a calcular amb la data: `cos(H₀) = −tan φ · tan δ`, on `H₀` és
 * mig dia en graus. Després, l'altura a qualsevol hora és la fórmula de
 * sempre, i **val igual per sota de l'horitzó**, que és el que calia: saber si
 * el sol és a −4° o a −15° és la diferència entre un cel blau fosc i la nit.
 *
 * S'ignora la refracció (la sortida oficial és amb el sol a −0,83°): l'error és
 * de menys d'un grau i el dibuix no el distingeix.
 */
export function sunAltitude(hour: number, sunriseH: number, sunsetH: number, latDeg: number): number {
  const span = sunsetH - sunriseH > 0 ? sunsetH - sunriseH : 12;
  const noon = sunriseH + span / 2;
  const lat = rad(latDeg);
  const h0 = rad((span / 2) * 15);
  const decl = Math.atan(-Math.cos(h0) / Math.tan(lat));
  // L'angle horari, portat a ±12 hores del migdia solar.
  const dh = ((((hour - noon) % 24) + 36) % 24) - 12;
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(rad(dh * 15));
  return (Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180) / Math.PI;
}

/** El color del vel de contrast, i la seva lluminositat. */
const VEIL: LCH = [19, 0.028, 250];
const VEIL_L = srgbLum(VEIL);
/**
 * El sostre de lluminositat que encara dona 4,5:1 amb text blanc, amb un marge:
 * es calcula per a 4,8:1 perquè entre dues parades el producte de dos
 * degradats lineals no és lineal i s'hi pot escapar una mica.
 */
const MAX_BEHIND = toSrgb(1.05 / 4.8 - 0.05);

/** On hi ha cada textura de núvol, en fracció de l'alçada del titular. */
const CLOUD_BANDS = { wisp: 0.46, far: 0.62, near: 0.70, over: 0.72 } as const;
/** Les alçades on es calcula el vel, de dalt (0) a baix (1). */
const VEIL_AT = [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.8, 0.9, 1] as const;
/** On són les quatre parades del cel. */
const SKY_AT = [0, 0.36, 0.72, 1] as const;

export function skyStyle(input: SkyInput): Sky {
  const { precip, thunder, fog } = precipOf(input.code);
  const intensity = intensityOf(input.precipitationMm ?? 0);
  const wet = precip !== 'none' && intensity > 3;

  /*
   * Les correccions físiques.
   *
   * Un model que doni 8 % de núvols i 3 mm a la mateixa hora s'ha equivocat en
   * una de les dues, i dibuixar-ho tal qual donaria pluja damunt d'un cel blau.
   * I la boira és un núvol a terra: el cel no es veu.
   */
  let cover = clamp01((input.cloudCover ?? 0) / 100);
  if (wet) cover = Math.max(cover, 0.55 + intensity / 320);
  if (thunder) cover = Math.max(cover, 0.82);
  if (fog) cover = Math.max(cover, 0.9);

  /*
   * L'altura del sol.
   *
   * `sunriseH`/`sunsetH` són els d'aquell dia i d'aquell punt —els calcula
   * `astronomyFor()`, no són una constant—, i això es nota: entre el Cap de
   * Creus i la Val d'Aran hi ha vuit minuts de diferència, i entre juny i
   * desembre n'hi ha cinc hores i mitja.
   */
  const sunrise = input.sunriseH ?? 7;
  const sunset = input.sunsetH ?? 19;
  const span = sunset - sunrise > 0 ? sunset - sunrise : 12;
  const alt = sunAltitude(input.hour, sunrise, sunset, input.lat ?? 41.7);
  const frac = (input.hour - sunrise) / span;
  // El sol es veu fins que el limbe de dalt toca l'horitzó.
  const isDay = alt > -0.8;
  const light = keyed(LIGHT_KEYS, alt);

  // ── El cel serè d'aquesta altura ─────────────────────────────────────────
  let stops: LCH[] = [...SKY_KEYS[SKY_KEYS.length - 1][1]];
  if (alt <= SKY_KEYS[0][0]) {
    stops = [...SKY_KEYS[0][1]];
  } else {
    for (let i = 1; i < SKY_KEYS.length; i++) {
      if (alt <= SKY_KEYS[i][0]) {
        const t = (alt - SKY_KEYS[i - 1][0]) / (SKY_KEYS[i][0] - SKY_KEYS[i - 1][0]);
        stops = SKY_KEYS[i - 1][1].map((p, k) => mixLch(p, SKY_KEYS[i][1][k], t));
        break;
      }
    }
  }
  const skyGradient = `linear-gradient(180deg, ${css(stops[0])} 0%, ${css(stops[1])} 36%, ${css(stops[2])} 72%, ${css(stops[3])} 100%)`;

  /*
   * L'arc del sol i de la lluna.
   *
   * Comparteixen recorregut i **mai coincideixen**: de dia hi ha sol i de nit,
   * lluna. Viu a la banda dreta i per sota de la barra de navegació a posta: si
   * puja més, el sol queda darrere del cercador i se li emporta el contrast; si
   * s'obre més cap a l'esquerra, la lluna cau damunt del topònim.
   */
  const bodyFrac = isDay
    ? clamp01(frac)
    : ((input.hour + 24 - sunset) % 24) / (24 - span);
  const bodyLeft = `${(56 + bodyFrac * 32).toFixed(1)}%`;
  const bodyTop = `${(36 - Math.sin(bodyFrac * Math.PI) * 15).toFixed(1)}%`;

  // Els núvols apaguen el sol, i l'horitzó també.
  const sunOpacityN = isDay
    ? Math.max(0, mix(1, -0.15, cover)) * mix(0.45, 1, clamp01(alt / 18))
    : 0;

  /*
   * El terminador de la lluna.
   *
   * Un semicercle pel costat il·luminat i una el·lipse que s'aplana i s'inverteix
   * segons la fracció il·luminada: amb `lit = 0,5` el radi menor és zero i surt
   * el quart exacte. `phase` és la posició al cicle, no la fracció il·luminada —
   * confondre-les dibuixa una lluna plena la nit de lluna nova.
   */
  const R = 24;
  const C = 38;
  const phase = clamp01(input.moonPhase);
  const lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const waxing = phase < 0.5;
  const rx = (R * Math.abs(1 - 2 * lit)).toFixed(2);
  const outer = waxing ? 1 : 0;
  const inner = (lit < 0.5) === waxing ? 0 : 1;
  const moonPath = `M ${C} ${C - R} A ${R} ${R} 0 0 ${outer} ${C} ${C + R} A ${rx} ${R} 0 0 ${inner} ${C} ${C - R} Z`;

  /*
   * La llum de les textures.
   *
   * Les tres imatges són **neutres**: porten el volum cuit a dins i cap color.
   * El color el posa aquest filtre, i per això la mateixa imatge serveix per a
   * cotó al sol de migdia i per a plom de tempesta.
   *
   * ## Un núvol no és mai negre
   *
   * La claror es **multiplica** pel gruix del núvol, no s'hi resta. Restant
   * —`0,26 − 0,34·nuvolositat`, que és com estava— un cel tapat amb poca llum
   * donava una lluminositat negativa, o sigui negre pur: mitja hora abans de
   * la posta, tot el crepuscle i tota la nit. I un cel tapat no és negre ni
   * de nit: els núvols baixos tornen la llum dels pobles, i de dia una capa de
   * núvols és **grisa i clara**, més clara que el blau que tapa.
   *
   * El terra de 0,34 és aquesta llum de nit. El gruix treu fins a una cinquena
   * part; la pluja i la tempesta, una mica més, perquè un núvol que descarrega
   * és més gruixut que un que només tapa.
   */
  const dayness = clamp01(alt / 20);
  // Càlid a prop de l'horitzó, i s'apaga dos graus per sota.
  const golden = alt >= 0 ? clamp01(1 - alt / 10) : clamp01(1 + alt / 2);
  // El daurat és dels núvols solts, que el sol baix agafa de costat. Una capa
  // gruixuda no el deixa passar: amb el cel tapat, la posta és grisa.
  const warm = golden * (1 - 0.8 * cover ** 2);
  // Blau de capvespre i de nit: de −2° cap avall.
  const cool = clamp01((-2 - alt) / 6);
  /*
   * I de dia, **l'ombra d'un núvol és blavosa**, no grisa.
   *
   * La primera versió deixava les textures neutres, i un cel tapat sortia d'un
   * gris de ciment sense ni un bri de blau: correcte de claror i mort de color.
   * La part de sota d'una capa de núvols la il·lumina el cel, no el sol, i per
   * això tira a blau; com més gruixuda la capa, més es nota.
   */
  const shade = light * cover ** 2 * 0.5;
  const thick = 1 - 0.2 * cover ** 1.5 - (thunder ? 0.14 : 0) - (wet ? Math.min(0.14, intensity / 700) : 0);
  const bright = mix(0.34, 1.04, light) * thick;
  const cloudContrast = 1.02 + cover * 0.08;
  // El to: càlid amb el sol baix, blau a l'ombra i de nit. Guanya el que pesa més.
  const warmAmt = warm * 0.42;
  const coolAmt = Math.max(cool * 0.3, shade * 0.6);
  const blue = coolAmt > warmAmt;
  const tint = Math.max(warmAmt, coolAmt);
  const cloudFx = (b: number) => `brightness(${clamp01(b).toFixed(3)}) `
    + `contrast(${cloudContrast.toFixed(2)}) `
    + `sepia(${tint.toFixed(2)}) `
    + `hue-rotate(${(blue ? 185 : -8 * warm).toFixed(0)}deg) `
    + `saturate(${(1 + (blue ? 0.6 * (tint / 0.3) : warm * 0.9)).toFixed(2)})`;
  /**
   * El que fan `contrast()` i `sepia()` a una lluminositat: el primer l'allunya
   * del gris mitjà i el segon l'apuja una mica, perquè la matriu del sèpia suma
   * més d'u.
   */
  const afterContrast = (b: number) =>
    clamp01(clamp01((clamp01(b) - 0.5) * cloudContrast + 0.5) * (1 + 0.215 * tint));

  // El vent inclina la pluja, i cada capa se'n desvia per no fer ratlles paral·leles.
  const rainTilt = 97 + Math.min(14, intensity / 7);

  /*
   * Quina capa de núvols surt, i quant.
   *
   * Se **solapen**, no se substitueixen: un cel mig ennuvolat porta filaments
   * alts i cúmuls alhora, com el de veritat. Passant d'una capa a l'altra per
   * trams, la nuvolositat 0,49 i la 0,51 serien dos cels diferents.
   */
  const wispO = clamp01(cover * 3.2) * (1 - smoothStep(0.5, 0.92, cover));
  const farO = clamp01((cover - 0.06) * 2) * (1 - smoothStep(0.72, 1, cover) * 0.55);
  const nearO = clamp01((cover - 0.24) * 1.9) * (1 - smoothStep(0.78, 1, cover) * 0.6);
  // La capa tancada no arriba a opaca: per les juntes es veu el cel de sota.
  const overO = clamp01((cover - 0.5) * 2.3) * 0.84;

  /*
   * El vel de nuvolositat: la capa plana i grisa que hi ha sota les textures.
   *
   * És el que fa que un cel tapat sigui **gris** i no blau amb núvols a sobre.
   * La seva claror segueix la del dia, igual que la de les textures: clara al
   * migdia, plom al capvespre, pissarra de nit. Abans baixava fins al 14 % amb
   * el 72 % d'opacitat, que és negre.
   */
  const storm = thunder ? 12 : wet ? Math.min(10, intensity / 8) : 0;
  /*
   * De color **blau plom**, no gris: és el cel que es veu a través d'una capa
   * de núvols, i sota una capa de núvols el cel segueix sent blau. Amb pluja o
   * tempesta el color s'apaga, que és el que passa de veritat.
   *
   * I **l'horitzó és més clar que el zenit**: sota un cel tapat la llum entra
   * de costat, per on la capa és més prima. Al revés —més fosc a baix— semblava
   * una paret.
   */
  const veilChroma = mix(0.03, 0.06, light) * (1 - storm / 24);
  const veilTop: LCH = [Math.max(17, mix(30, 70, light) - 6 * cover - storm), veilChroma, 246];
  const veilBottom: LCH = [Math.max(17, veilTop[0] + mix(2, 9, light)), veilChroma * 0.85, 240];
  // No tapa del tot: un terç del cel de sota hi passa.
  const veilO = cover ** 1.9 * 0.66;

  /*
   * ── El vel de contrast ───────────────────────────────────────────────────
   *
   * Per a cada alçada es compon, capa a capa i en el mateix ordre que el
   * component, **el pitjor que hi pot haver darrere d'una lletra**: el cel, el
   * vel de nuvolositat i, a les franges on arriben, les textures de núvol.
   * Les textures es mouen, però el seu pitjor cas es pot saber: les tres
   * arriben a blanc pur amb alfa sencera —mesurat amb sharp damunt dels fitxers
   * que se serveixen—, així que el pitjor és un núvol opac amb la lluminositat
   * que li deixa el filtre.
   *
   * I d'aquí surt l'opacitat que cal perquè aquella lluminositat baixi fins al
   * sostre que dona 4,5:1. Si ja hi és per sota —una nit, un capvespre tapat—,
   * no cal vel, i en queda un fil perquè el titular tingui fons.
   */
  const skyL = stops.map(srgbLum);
  const veilTopL = srgbLum(veilTop);
  const veilBottomL = srgbLum(veilBottom);
  const farL = afterContrast(bright);
  const nearL = afterContrast(bright * 0.9);
  const lumAt = (p: number): number => {
    let i = 1;
    while (i < SKY_AT.length - 1 && p > SKY_AT[i]) i++;
    const t = (p - SKY_AT[i - 1]) / (SKY_AT[i] - SKY_AT[i - 1]);
    let comp = mix(skyL[i - 1], skyL[i], clamp01(t));
    comp = comp * (1 - veilO) + mix(veilTopL, veilBottomL, p) * veilO;
    if (p <= CLOUD_BANDS.wisp) comp = comp * (1 - wispO) + farL * wispO;
    if (p <= CLOUD_BANDS.far) comp = comp * (1 - farO) + farL * farO;
    if (p <= CLOUD_BANDS.near) comp = comp * (1 - nearO) + nearL * nearO;
    if (p <= CLOUD_BANDS.over) comp = comp * (1 - overO) + nearL * overO;
    return comp;
  };
  const MIN_VEIL = 0.1;
  const contrastStops = VEIL_AT.map((p): [number, number] => {
    // El pitjor de la franja: aquesta alçada i una mica a banda i banda, perquè
    // el final d'una textura no caigui just entre dues parades.
    const worst = Math.max(lumAt(Math.max(0, p - 0.06)), lumAt(p), lumAt(Math.min(1, p + 0.06)));
    const need = worst > MAX_BEHIND ? (worst - MAX_BEHIND) / (worst - VEIL_L) : 0;
    return [p, Number(Math.min(0.86, Math.max(MIN_VEIL, need)).toFixed(3))];
  });
  const contrastVeil = `linear-gradient(to bottom, ${contrastStops
    .map(([p, a]) => `${css(VEIL, a)} ${(p * 100).toFixed(0)}%`).join(', ')})`;

  return {
    isDay,
    sunAltitude: Number(alt.toFixed(1)),
    light: Number(light.toFixed(3)),
    precip,
    thunder,
    cover,
    intensity,

    skyGradient,
    skyBase: css(stops[1]),
    bodyLeft,
    bodyTop,

    sunVisible: isDay && sunOpacityN > 0.04,
    sunOpacity: sunOpacityN.toFixed(2),
    sunBloom: `oklch(96% ${mix(0.12, 0.07, dayness).toFixed(3)} ${mix(66, 90, dayness).toFixed(0)} / ${mix(0.62, 0.3, cover).toFixed(2)})`,
    sunScatter: `oklch(94% ${mix(0.13, 0.06, dayness).toFixed(3)} ${mix(64, 92, dayness).toFixed(0)} / ${(mix(0.34, 0.1, cover) * sunOpacityN).toFixed(2)})`,
    sunRay: `oklch(97% 0.07 88 / ${mix(0.28, 0.05, cover).toFixed(2)})`,
    sunStreak: `oklch(99% 0.04 92 / ${mix(0.42, 0.06, cover).toFixed(2)})`,

    // La lluna, quan el cel ja s'ha enfosquit prou per veure-la.
    moonVisible: alt < -4 && Math.abs(phase - 0.5) < 0.46 && cover < 0.7,
    moonPath,

    // Les primeres estrelles surten al crepuscle nàutic, no a la posta.
    starOpacity: (clamp01((-alt - 7) / 7) * mix(1, 0.03, cover)).toFixed(2),

    cloudFilter: cloudFx(bright),
    cloudFilterNear: cloudFx(bright * 0.9),
    wispOpacity: Number(wispO.toFixed(2)),
    cloudFarOpacity: Number(farO.toFixed(2)),
    cloudNearOpacity: Number(nearO.toFixed(2)),
    overcastOpacity: Number(overO.toFixed(2)),

    veilOpacity: veilO.toFixed(2),
    veilImage: `linear-gradient(180deg, ${css(veilTop)} 0%, ${css(veilBottom)} 100%)`,

    contrastVeil,
    contrastStops,

    rainOpacity: clamp01(0.22 + intensity / 118).toFixed(2),
    rainAngle: [`${(rainTilt - 3).toFixed(0)}deg`, `${rainTilt.toFixed(0)}deg`, `${(rainTilt + 3).toFixed(0)}deg`],
    snowOpacity: clamp01(0.3 + intensity / 145).toFixed(2),
  };
}

/** Si s'ha de dibuixar pluja a sobre. */
export function drawsRain(s: Sky): boolean {
  return s.precip === 'rain' && s.intensity > 3;
}

/** Si s'ha de dibuixar neu a sobre. */
export function drawsSnow(s: Sky): boolean {
  return s.precip === 'snow' && s.intensity > 3;
}
