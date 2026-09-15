/**
 * El cel del titular: què es dibuixa darrere del nom d'un lloc.
 *
 * ## Què és, i què no
 *
 * És una **atmosfera calculada**, no una il·lustració triada d'un menú. Surt de
 * quatre eixos independents —nuvolositat, tipus de precipitació, intensitat i
 * aparell elèctric— més l'altura del sol i la fase de la lluna, i d'aquí en
 * surten totes les combinacions: sol amb quatre núvols, xàfec amb el cel
 * tancat, nevada feble, tempesta de nit.
 *
 * Amb cinc imatges fixes, «sol», «núvols» i «pluja» són tres estats i la resta
 * del temps no existeix. Amb quatre eixos continus, el dibuix diu el mateix que
 * diuen els números del costat.
 *
 * ## El nom del temps **no** surt d'aquí
 *
 * Surt de `weather-codes.ts`, que és qui ja el diu a la fitxa, a la taula
 * horària i al resum del dia. Aquest fitxer només decideix **com es pinta**.
 *
 * El disseny original en portava una funció pròpia —`describeSky()`, amb els
 * seus propis llindars de nuvolositat— i això hauria estat una segona
 * descripció del mateix temps: el dia que algú toqués un llindar, el titular i
 * la taula de sota haurien dit coses diferents de la mateixa hora sense que res
 * fallés. És el mateix motiu pel qual la projecció del mapa viu a `mercator.ts`
 * i no a cada pàgina que la fa servir.
 *
 * ## Quina hora es dibuixa
 *
 * La que li passin, i el que li passen és **l'hora que la pàgina ja està
 * ensenyant**: la de la predicció que hi ha al costat. Així el cel i els
 * números diuen sempre el mateix instant, que és una propietat que es pot
 * comprovar.
 *
 * El que aquest fitxer **no** pot arreglar és que la pàgina es genera un cop
 * cada mitja hora i es guarda: si ningú no la visita en tota la tarda, qui
 * arribi primer veurà la que es va generar abans. Això ja passa amb la
 * temperatura i amb el rètol de l'hora; el cel només ho fa visible. Qui ho diu
 * és la línia de l'estació, que porta la seva hora.
 *
 * ## Dues correccions físiques abans de dibuixar res
 *
 * Si precipita, la nuvolositat no pot baixar d'un mínim; si hi ha aparell
 * elèctric, tampoc. **No pot ploure amb el cel serè**, i un model que doni 10 %
 * de núvols amb 4 mm a la mateixa hora no és un cel que calgui dibuixar tal
 * qual: és un model que s'ha equivocat en una de les dues.
 *
 * ## Contrast
 *
 * El vel fosc de sobre no és decoració i **no es pot treure**: és el que fa que
 * el text blanc del titular passi de 4,5:1 damunt de qualsevol cel, inclòs un
 * migdia de juliol amb un núvol blanc just al darrere del topònim. Per això no
 * s'aprima cap amunt fins a l'última franja: les textures de núvol són clares i
 * van per la part alta, que és justament on hi ha el nom.
 */
import { weatherCode } from './weather-codes.ts';
import { oklchToHex } from './scales.ts';

/** Les cinc franges de llum. Quatre parades cadascuna, de dalt a baix. */
const SKY_STOPS = {
  night: ['oklch(17% 0.045 268)', 'oklch(23% 0.055 260)', 'oklch(29% 0.05 252)', 'oklch(34% 0.04 248)'],
  twilight: ['oklch(28% 0.09 280)', 'oklch(40% 0.12 298)', 'oklch(56% 0.15 18)', 'oklch(72% 0.15 48)'],
  golden: ['oklch(46% 0.13 262)', 'oklch(62% 0.12 250)', 'oklch(80% 0.10 62)', 'oklch(86% 0.13 56)'],
  day: ['oklch(56% 0.14 250)', 'oklch(68% 0.115 241)', 'oklch(81% 0.075 228)', 'oklch(87% 0.055 222)'],
  noon: ['oklch(50% 0.155 254)', 'oklch(63% 0.13 244)', 'oklch(77% 0.09 231)', 'oklch(85% 0.06 224)'],
} as const;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothStep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export type Precip = 'none' | 'rain' | 'snow';

export interface SkyInput {
  /** Hora local decimal del moment que es dibuixa: 14,5 són dos quarts de tres. */
  hour: number;
  /** Sortida i posta del sol d'aquell dia i d'aquell punt, en hores decimals. */
  sunriseH: number | null;
  sunsetH: number | null;
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
  precip: Precip;
  thunder: boolean;
  /** Nuvolositat ja corregida, 0–1. La que es dibuixa. */
  cover: number;
  /** Intensitat del dibuix de la precipitació, 0–100. */
  intensity: number;

  skyGradient: string;
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
   * Quant s'ha de reforçar el vel **a la franja de dalt**, on hi ha text petit.
   *
   * No és una constant, i aquesta és tota la gràcia: el que amenaça el text de
   * dalt són les **textures de núvol**, que són clares i van justament per
   * allà. Un dia serè no en té cap, i llavors això val zero i el cel es veu tal
   * com és.
   *
   * La primera versió el posava fix a 0,30 «per si de cas», i el resultat va
   * ser un migdia de sol amb 33 °C dibuixat com un capvespre. Un fons que no
   * distingeix el temps no serveix de res.
   */
  scrimTop: number;

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
function precipOf(code: number | null): { precip: Precip; thunder: boolean } {
  const group = weatherCode(code).group;
  switch (group) {
    case 'snow':
    case 'snow_showers':
      return { precip: 'snow', thunder: false };
    case 'drizzle':
    case 'rain':
    case 'showers':
    case 'freezing':
      return { precip: 'rain', thunder: false };
    case 'thunder':
    case 'hail':
      // Una tempesta porta aigua encara que el model no en declari a l'hora.
      return { precip: 'rain', thunder: true };
    default:
      return { precip: 'none', thunder: false };
  }
}


/*
 * ── El reforç de dalt, calculat i no posat a ull ──────────────────────────
 *
 * El vel de contrast es mesura en tant per cent de l'alçada del titular i a la
 * franja de dalt cedeix, perquè allà el disseny hi posa la barra de navegació,
 * que porta vidre fosc propi. Però a sobre de tot hi ha també la **ruta de
 * navegació**: dotze píxels, o sigui text petit, que demana 4,5:1.
 *
 * El que amenaça aquell text no és el cel —el cel sol dona 11:1— sinó les
 * **textures de núvol**, que són clares i van justament per la part alta. Així
 * que el reforç que cal depèn de si n'hi ha, i de quant brillen.
 *
 * Amb un valor fix el cel es perd: un migdia serè de 33 °C sortia dibuixat com
 * un capvespre perquè portava un reforç que no li feia cap falta. Ara un dia
 * serè en porta **zero** i el cel es veu tal com es calcula.
 */

/** La lluminositat d'un color en sRGB, sense linearitzar: com componen els navegadors. */
function srgbLum(css: string): number {
  const hex = oklchToHex(css);
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0.5;
  return (0.2126 * parseInt(hex.slice(1, 3), 16)
    + 0.7152 * parseInt(hex.slice(3, 5), 16)
    + 0.0722 * parseInt(hex.slice(5, 7), 16)) / 255;
}

const toSrgb = (v: number) => (v <= 0.00304 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/**
 * L'alfa que té el vel de contrast a la franja on comença el text.
 *
 * Al 2 % de l'alçada, que és on cau la barra del web d'ençà que va **dins** del
 * titular, i agafat una mica per sota del que hi ha de veritat perquè el reforç
 * surti amb marge. Abans es calibrava al 6 %, on hi ha la ruta de navegació, i
 * amb la barra a sobre del cel els seus enllaços queien a 3,84:1: estava
 * calculat per a una franja que ja no era la de més amunt.
 */
const TEXT_TOP_VEIL = 0.26;
/** El color del vel, que és pràcticament el mateix a totes les parades. */
const VEIL_L = srgbLum('oklch(19% 0.028 250)');
/** El sostre de lluminositat que encara dona 4,5:1 amb text blanc. */
const MAX_BEHIND = toSrgb(1.05 / 4.5 - 0.05);

function scrimFor(skyTopL: number, coverage: number, cloudL: number): number {
  const behind = mix(skyTopL, cloudL, clamp01(coverage));
  const withVeil = behind * (1 - TEXT_TOP_VEIL) + VEIL_L * TEXT_TOP_VEIL;
  if (withVeil <= MAX_BEHIND) return 0;
  /*
   * Quant d'un vel de color `VEIL_L` cal per baixar de `withVeil` a
   * `MAX_BEHIND`. Es limita a 0,46: per damunt d'això el titular deixaria de
   * ser un cel, i si algun dia calgués més voldria dir que les textures s'han
   * tornat més clares i el que s'ha d'arreglar són elles.
   */
  return Math.min(0.46, (withVeil - MAX_BEHIND) / (withVeil - VEIL_L));
}

export function skyStyle(input: SkyInput): Sky {
  const { precip, thunder } = precipOf(input.code);
  const intensity = intensityOf(input.precipitationMm ?? 0);
  const wet = precip !== 'none' && intensity > 3;

  /*
   * Les dues correccions físiques.
   *
   * Un model que doni 8 % de núvols i 3 mm a la mateixa hora s'ha equivocat en
   * una de les dues, i dibuixar-ho tal qual donaria pluja damunt d'un cel blau.
   */
  let cover = clamp01((input.cloudCover ?? 0) / 100);
  if (wet) cover = Math.max(cover, 0.55 + intensity / 320);
  if (thunder) cover = Math.max(cover, 0.82);

  /*
   * L'altura del sol.
   *
   * `sunriseH`/`sunsetH` són els d'aquell dia i d'aquell punt —els calcula
   * `astronomyFor()`, no són una constant—, i això es nota: entre el Cap de
   * Creus i la Val d'Aran hi ha vuit minuts de diferència, i entre juny i
   * desembre n'hi ha cinc hores i mitja. Amb un parell de números fixos, el
   * titular d'un poble de Ponent sortiria de nit al desembre a les cinc de la
   * tarda i de dia al juny a la mateixa hora.
   */
  const sunrise = input.sunriseH ?? 7;
  const sunset = input.sunsetH ?? 19;
  const span = sunset - sunrise > 0 ? sunset - sunrise : 12;

  const frac = (input.hour - sunrise) / span;
  const isDay = frac > -0.02 && frac < 1.02;
  const elev = isDay ? Math.sin(clamp01(frac) * Math.PI) : 0;
  const belowH = input.hour < sunrise
    ? sunrise - input.hour
    : input.hour > sunset ? input.hour - sunset : 0;

  // Les parades del cel, barrejades entre les dues franges veïnes.
  let stops: readonly string[];
  let mixTo: readonly string[] | null = null;
  let mixK = 0;
  if (!isDay) {
    stops = belowH < 1.3 ? SKY_STOPS.twilight : SKY_STOPS.night;
    if (belowH >= 1.3 && belowH < 2.4) {
      stops = SKY_STOPS.twilight; mixTo = SKY_STOPS.night; mixK = (belowH - 1.3) / 1.1;
    }
  } else if (elev < 0.28) {
    stops = SKY_STOPS.twilight; mixTo = SKY_STOPS.golden; mixK = elev / 0.28;
  } else if (elev < 0.62) {
    stops = SKY_STOPS.golden; mixTo = SKY_STOPS.day; mixK = (elev - 0.28) / 0.34;
  } else {
    stops = SKY_STOPS.day; mixTo = SKY_STOPS.noon; mixK = (elev - 0.62) / 0.38;
  }

  /*
   * La barreja la fa el navegador amb `color-mix(in oklab, …)`.
   *
   * En OKLab i no en sRGB perquè és on una barreja de colors no passa per un
   * gris mort pel mig: entre el taronja del crepuscle i el blau de la nit, en
   * sRGB hi ha un tram marró que no existeix al cel.
   */
  const ramp = stops.map((s, i) => (mixTo
    ? `color-mix(in oklab, ${s} ${Math.round((1 - mixK) * 100)}%, ${mixTo[i]})`
    : s));
  const skyGradient = `linear-gradient(178deg, ${ramp[0]} 0%, ${ramp[1]} 36%, ${ramp[2]} 72%, ${ramp[3]} 100%)`;

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
    ? Math.max(0, mix(1, -0.15, cover)) * mix(0.45, 1, Math.min(1, elev * 2.2))
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
   * cotó al sol de migdia i per a plom de tempesta. Cuinar-hi el color voldria
   * dir una imatge per hora del dia.
   */
  const dayness = isDay ? Math.min(1, elev * 2.4) : 0;
  const golden = isDay ? Math.max(0, 1 - elev / 0.42) : 0;
  const bright = mix(0.26, 1.04, dayness) - cover * 0.34 - (thunder ? 0.1 : 0);
  const cloudFx = (b: number) => `brightness(${clamp01(b).toFixed(3)}) `
    + `contrast(${(1.02 + cover * 0.14).toFixed(2)}) `
    + `sepia(${(golden * 0.42).toFixed(2)}) `
    + `hue-rotate(${(-8 * golden - (isDay ? 0 : 6)).toFixed(0)}deg) `
    + `saturate(${(1 + golden * 0.9 + (isDay ? 0 : 0.5)).toFixed(2)})`;

  // El vent inclina la pluja, i cada capa se'n desvia per no fer ratlles paral·leles.
  const rainTilt = 97 + Math.min(14, intensity / 7);

  /*
   * Les quatre opacitats de núvol, que decideixen el reforç de dalt.
   *
   * Se solapen, així que la cobertura total és la probabilitat que **cap** no
   * tapi, restada d'u. Sumant-les, un cel mig ennuvolat passaria de 1 i sortiria
   * més fosc que un de tancat.
   */
  const wispO = clamp01(cover * 3.2) * (1 - smoothStep(0.5, 0.92, cover));
  const farO = clamp01((cover - 0.06) * 2) * (1 - smoothStep(0.72, 1, cover) * 0.55);
  const nearO = clamp01((cover - 0.24) * 1.9) * (1 - smoothStep(0.78, 1, cover) * 0.6);
  const overO = clamp01((cover - 0.5) * 2.3);
  const coverage = 1 - (1 - wispO) * (1 - farO) * (1 - nearO) * (1 - overO);

  /*
   * El pitjor núvol possible: les tres textures arriben a **blanc pur amb alfa
   * sencera** —mesurat amb sharp damunt dels fitxers que se serveixen— així que
   * el que en surt després del filtre és la seva pròpia lluminositat.
   */
  const cloudL = clamp01(bright);
  const scrimTop = scrimFor(srgbLum(stops[0]), coverage, cloudL);

  return {
    isDay,
    precip,
    thunder,
    cover,
    intensity,

    skyGradient,
    bodyLeft,
    bodyTop,

    sunVisible: isDay && sunOpacityN > 0.04,
    sunOpacity: sunOpacityN.toFixed(2),
    sunBloom: `oklch(96% ${mix(0.12, 0.07, dayness).toFixed(3)} ${mix(66, 90, dayness).toFixed(0)} / ${mix(0.62, 0.3, cover).toFixed(2)})`,
    sunScatter: `oklch(94% ${mix(0.13, 0.06, dayness).toFixed(3)} ${mix(64, 92, dayness).toFixed(0)} / ${(mix(0.34, 0.1, cover) * sunOpacityN).toFixed(2)})`,
    sunRay: `oklch(97% 0.07 88 / ${mix(0.28, 0.05, cover).toFixed(2)})`,
    sunStreak: `oklch(99% 0.04 92 / ${mix(0.42, 0.06, cover).toFixed(2)})`,

    moonVisible: !isDay && Math.abs(phase - 0.5) < 0.46 && cover < 0.7,
    moonPath,

    starOpacity: (isDay ? 0 : clamp01((belowH - 0.6) / 1.4) * mix(1, 0.03, cover)).toFixed(2),

    cloudFilter: cloudFx(bright),
    cloudFilterNear: cloudFx(bright - 0.1),
    /*
     * Quina capa surt, i quant.
     *
     * Se **solapen**, no se substitueixen: un cel mig ennuvolat porta filaments
     * alts i cúmuls alhora, com el de veritat. Passant d'una capa a l'altra per
     * trams, la nuvolositat 0,49 i la 0,51 serien dos cels diferents.
     */
    wispOpacity: Number(wispO.toFixed(2)),
    cloudFarOpacity: Number(farO.toFixed(2)),
    cloudNearOpacity: Number(nearO.toFixed(2)),
    overcastOpacity: Number(overO.toFixed(2)),

    /*
     * El vel de nuvolositat, que és el que fa que un cel de pluja sigui **fosc**
     * i no un gris clar. Sense ell el text blanc del titular hi perd el
     * contrast justament els dies de mal temps.
     */
    scrimTop: Number(scrimTop.toFixed(3)),

    veilOpacity: (cover ** 1.9 * 0.72).toFixed(2),
    veilImage: `linear-gradient(180deg, oklch(${(mix(44, 80, dayness) - cover * 30).toFixed(0)}% 0.012 250) 0%, oklch(${(mix(38, 73, dayness) - cover * 28).toFixed(0)}% 0.014 250) 100%)`,

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
