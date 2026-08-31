/**
 * Astronomía calculada localmente: sol y luna.
 *
 * No se pide a ninguna API, y no por ahorrar una dependencia sino por dos
 * razones concretas:
 *
 *  · **Cuota.** Open-Meteo cobra por variable pedida (peso = variables/10). El
 *    orto y el ocaso serían dos variables más en cada una de las 3.190
 *    peticiones diarias. Calcularlos cuesta microsegundos y es exacto.
 *  · **Alcance.** Ninguna API meteorológica da fase lunar, crepúsculos ni
 *    variación diaria de la duración del día, que es justo lo que hace rica una
 *    ficha de lugar.
 *
 * Algoritmo NOAA para la posición solar; precisión de segundos, muy por encima
 * de lo que necesita mostrar una web.
 *
 * Este fichero no importa nada: lo usan tanto los scripts como la aplicación.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Día juliano a partir de un instante UTC. */
function toJulian(date: Date): number {
  return date.getTime() / 86_400_000 + 2440587.5;
}

function fromJulian(j: number): Date {
  return new Date((j - 2440587.5) * 86_400_000);
}

/** Días desde J2000.0. */
function toDays(date: Date): number {
  return toJulian(date) - 2451545;
}

// ── Posición solar ──────────────────────────────────────────────────────────

const OBLIQUITY = 23.4397 * RAD;

function solarMeanAnomaly(d: number): number {
  return RAD * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(M: number): number {
  // Ecuación del centro + longitud del perihelio terrestre.
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372;
  return M + C + P + Math.PI;
}

function declination(L: number): number {
  return Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
}

function rightAscension(L: number): number {
  return Math.atan2(Math.sin(L) * Math.cos(OBLIQUITY), Math.cos(L));
}

function siderealTime(d: number, lw: number): number {
  return RAD * (280.16 + 360.9856235 * d) - lw;
}

export interface SunPosition {
  /** Altura sobre el horizonte, en grados. Negativa de noche. */
  altitude: number;
  /** Azimut en grados desde el norte, sentido horario. */
  azimuth: number;
}

export function sunPosition(date: Date, lat: number, lon: number): SunPosition {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(date);
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const ra = rightAscension(L);
  const H = siderealTime(d, lw) - ra;

  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H),
  );
  const azimuth = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi),
  );

  return { altitude: altitude * DEG, azimuth: (azimuth * DEG + 180) % 360 };
}

// ── Orto, ocaso y crepúsculos ───────────────────────────────────────────────

const J1970 = 2440588;
const J2000 = 2451545;

function julianCycle(d: number, lw: number): number {
  return Math.round(d - 0.0009 - lw / (2 * Math.PI));
}

function approxTransit(Ht: number, lw: number, n: number): number {
  return 0.0009 + (Ht + lw) / (2 * Math.PI) + n;
}

function solarTransitJ(ds: number, M: number, L: number): number {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
}

function hourAngle(h: number, phi: number, dec: number): number {
  const cosH = (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  // Sol circumpolar o que no sale: en Catalunya no ocurre, pero devolver NaN
  // silenciosamente produciría "Invalid Date" en la página.
  if (cosH > 1 || cosH < -1) return NaN;
  return Math.acos(cosH);
}

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  /** Crepúsculo civil: aún hay luz útil para caminar. */
  dawn: Date | null;
  dusk: Date | null;
  /** Duración del día en minutos. */
  daylightMinutes: number | null;
  /** Cuánto cambia respecto a ayer, en minutos. Positivo = días que alargan. */
  daylightDeltaMinutes: number | null;
}

/**
 * `-0.833°` incluye la refracción atmosférica y el radio aparente del disco
 * solar: es el ángulo estándar para orto y ocaso.
 */
const ANGLE_SUNRISE = -0.833;
const ANGLE_CIVIL = -6;

function timesForAngle(angleDeg: number, date: Date, lat: number, lon: number): { rise: Date | null; set: Date | null; noon: Date } {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const Jnoon = solarTransitJ(ds, M, L);

  const w = hourAngle(angleDeg * RAD, phi, dec);
  if (Number.isNaN(w)) return { rise: null, set: null, noon: fromJulian(Jnoon) };

  const a = approxTransit(w, lw, n);
  const Jset = solarTransitJ(a, M, L);
  const Jrise = Jnoon - (Jset - Jnoon);

  return { rise: fromJulian(Jrise), set: fromJulian(Jset), noon: fromJulian(Jnoon) };
}

export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  const today = timesForAngle(ANGLE_SUNRISE, date, lat, lon);
  const civil = timesForAngle(ANGLE_CIVIL, date, lat, lon);

  const daylight = today.rise && today.set
    ? Math.round((today.set.getTime() - today.rise.getTime()) / 60_000)
    : null;

  const yesterday = timesForAngle(ANGLE_SUNRISE, new Date(date.getTime() - 86_400_000), lat, lon);
  const dayBefore = yesterday.rise && yesterday.set
    ? Math.round((yesterday.set.getTime() - yesterday.rise.getTime()) / 60_000)
    : null;

  return {
    sunrise: today.rise,
    sunset: today.set,
    solarNoon: today.noon,
    dawn: civil.rise,
    dusk: civil.set,
    daylightMinutes: daylight,
    daylightDeltaMinutes: daylight != null && dayBefore != null ? daylight - dayBefore : null,
  };
}

// ── Luna ────────────────────────────────────────────────────────────────────

export interface MoonPhase {
  /** 0 = luna nueva, 0,5 = llena, 1 = nueva otra vez. */
  phase: number;
  /** Fracción iluminada del disco, 0–1. */
  illumination: number;
  /** Nombre catalán de la fase. */
  name: string;
  /** Días transcurridos desde la última luna nueva. */
  age: number;
}

/** Ciclo sinódico medio, en días. */
const SYNODIC = 29.530588853;

/**
 * Longitud eclíptica de la Luna con los términos principales de Meeus.
 *
 * Con solo el término de la anomalía media (6,289°) la fase y la iluminación
 * se contradicen: salía "gibosa creixent" con el disco al 98 %, que cualquiera
 * que mire al cielo ve que es luna llena. Los términos de evección y variación
 * son los que arreglan ese desfase de casi dos días.
 */
function moonLongitude(d: number): number {
  const L = 218.316 + 13.176396 * d;          // longitud media
  const M = RAD * (134.963 + 13.064993 * d);  // anomalía media lunar
  const D = RAD * (297.850 + 12.190749 * d);  // elongación media
  const Ms = RAD * (357.529 + 0.985600 * d);  // anomalía media solar
  const F = RAD * (93.272 + 13.229350 * d);   // argumento de latitud

  const corr =
    6.289 * Math.sin(M)
    + 1.274 * Math.sin(2 * D - M)               // evección
    + 0.658 * Math.sin(2 * D)                   // variación
    - 0.186 * Math.sin(Ms)                      // ecuación anual
    - 0.059 * Math.sin(2 * M - 2 * D)
    - 0.057 * Math.sin(M - 2 * D + Ms)
    + 0.053 * Math.sin(M + 2 * D)
    + 0.046 * Math.sin(2 * D - Ms)
    + 0.041 * Math.sin(M - Ms)
    - 0.035 * Math.sin(D)
    - 0.031 * Math.sin(M + Ms)
    - 0.015 * Math.sin(2 * F - 2 * D)
    + 0.011 * Math.sin(M - 4 * D);

  return RAD * (L + corr);
}

/**
 * Nombre de la fase a partir de la iluminación y de si crece o mengua.
 *
 * Deliberadamente **no** se deriva de la fracción de ciclo: la órbita lunar es
 * elíptica, así que a igual fracción de ciclo corresponde distinta iluminación,
 * y el nombre debe coincidir con lo que se ve, no con el calendario.
 */
function phaseName(illumination: number, waxing: boolean): string {
  const pct = illumination * 100;
  // Umbrales prácticos, no instantáneos: a partir del 97 % el disco se ve
  // lleno a simple vista, y por debajo del 3 % no se ve.
  if (pct < 3) return 'Lluna nova';
  if (pct > 97) return 'Lluna plena';
  if (pct < 45) return waxing ? 'Lluna creixent' : 'Lluna minvant';
  if (pct <= 55) return waxing ? 'Quart creixent' : 'Quart minvant';
  return waxing ? 'Gibosa creixent' : 'Gibosa minvant';
}

export function moonPhase(date: Date): MoonPhase {
  const d = toDays(date);
  const lonMoon = moonLongitude(d);
  const Ls = eclipticLongitude(solarMeanAnomaly(d));

  // Elongación normalizada a [0, 2π): 0 = nueva, π = llena.
  const elongation = ((lonMoon - Ls) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

  const phase = elongation / (2 * Math.PI);
  const illumination = (1 - Math.cos(elongation)) / 2;
  const waxing = phase < 0.5;

  return {
    phase,
    illumination,
    name: phaseName(illumination, waxing),
    age: phase * SYNODIC,
  };
}

/** Emoji de la fase. Se elige por iluminación, no por fracción de ciclo. */
export function moonEmoji(phase: number): string {
  const icons = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  return icons[Math.round(phase * 8) % 8];
}

/** Próxima luna nueva y próxima llena, buscando el cruce por bisección. */
export function nextMoonEvents(from: Date): { newMoon: Date; fullMoon: Date } {
  const find = (targetPhase: number): Date => {
    let t = from.getTime();
    const step = 3600_000; // una hora
    const dist = (ms: number) => {
      const p = moonPhase(new Date(ms)).phase;
      return ((p - targetPhase) % 1 + 1) % 1;
    };
    // Avanza hasta que la distancia al objetivo da la vuelta (lo cruza).
    let prev = dist(t);
    for (let i = 0; i < 24 * 40; i++) {
      t += step;
      const cur = dist(t);
      if (cur < prev && prev > 0.9) return new Date(t);
      prev = cur;
    }
    return new Date(t);
  };
  return { newMoon: find(0), fullMoon: find(0.5) };
}

/**
 * Índice de calidad del cielo nocturno para observación, 0–100.
 *
 * Solo combina lo que sabemos con certeza: nubosidad y luz lunar. No pretende
 * modelar contaminación lumínica, que necesitaría un dato que aún no tenemos —
 * inventarlo daría un número con aspecto de riguroso y sin base.
 */
export function stargazingScore(cloudCoverPct: number, moonIllumination: number): number {
  const clear = 1 - Math.min(1, Math.max(0, cloudCoverPct / 100));
  const dark = 1 - moonIllumination * 0.7;
  return Math.round(clear * dark * 100);
}
