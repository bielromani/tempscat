/**
 * Les estacions de muntanya de Ferrocarrils: forma de les dades.
 *
 * Com la resta dels fitxers compartits, **no importa res**: el worker el carrega
 * amb l'extensió `.ts` i l'aplicació amb l'àlies `@/`.
 *
 * Els llindars de frescor i el que es pot ensenyar de cada camp són a
 * `src/lib/mountain.ts`, que és on es pot raonar amb el rellotge.
 */

/** Una pista d'esquí, del catàleg tècnic. No canvia d'un dia per l'altre. */
export interface SlopeStats {
  /** Quantes pistes hi ha, per color de dificultat. */
  byColour: Array<{ colour: string; count: number }>;
  count: number;
  /** Quilòmetres de pista sumats. Només de les que donen longitud. */
  km: number | null;
  /** Cota mínima i màxima de totes les pistes de l'estació. */
  minM: number | null;
  maxM: number | null;
  /** Quantes tenen innivació artificial. */
  withSnowmaking: number;
}

export interface LiftStats {
  count: number;
  /** Per tipus: telecabina, telecadira, teleesquí… */
  byType: Array<{ type: string; count: number }>;
}

/**
 * Una estació d'esquí o equipament de muntanya, amb el seu comunicat.
 *
 * El comunicat el tecleja el personal de l'estació, així que **caduca**: hi ha
 * `reportAt` a cada camp variable i l'aplicació decideix què ensenya. Fora de
 * temporada un comunicat pot portar mesos aturat.
 */
export interface Resort {
  /** La unitat de negoci de FGC. És la clau que lliga amb les càmeres. */
  bunitId: string;
  name: string;
  slug: string;
  lat: number;
  lon: number;
  /** El municipi publicat més proper, per poder anar de l'estació a la fitxa. */
  nearest: { id: string; nom: string; path: string; distKm: number } | null;

  /** Obert o tancat, en les paraules de FGC. */
  open: boolean;
  openLabel: string;
  /** Quan es va emetre el comunicat. Tot el que segueix és d'aquesta hora. */
  reportAt: string;

  /** Gruix de neu comunicat, en centímetres. Nul fora de temporada. */
  snowMinCm: number | null;
  snowMaxCm: number | null;
  /** Qualitat de la neu, en català i tal com la tria l'estació. */
  snowQuality: string | null;
  /** Última nevada i quants centímetres va deixar. */
  lastSnowfall: string | null;
  lastSnowfallCm: number | null;
  /** Percentatge de pistes i de remuntadors oberts. */
  slopesOpenPct: number | null;
  liftsOpenPct: number | null;
  /** Cel i visibilitat observats pel personal de l'estació, en català. */
  sky: string | null;
  visibility: string | null;

  slopes: SlopeStats | null;
  lifts: LiftStats | null;
}

/**
 * Una estació meteorològica de Ferrocarrils.
 *
 * Són nou, entre 1.664 i 2.537 m. La XEMA amunt de 2.000 m té molt poc, així
 * que aquestes són mesura de veritat on abans només hi havia model.
 *
 * **No hi ha ni pressió ni velocitat del vent**, i no és un oblit: el perquè és
 * a la capçalera de `scripts/workers/fgc-mountain.ts`.
 */
export interface MountainStation {
  id: string;
  name: string;
  /** L'estació de la qual depèn, per agrupar-les. */
  resort: string;
  bunitId: string;
  /** L'altitud que el nom porta a dins. Nul quan no en porta. */
  altitudM: number | null;
  lat: number | null;
  lon: number | null;

  /** L'hora que dona l'estació, no l'hora en què ho hem llegit. */
  measuredAt: string;
  temperature: number | null;
  humidity: number | null;
  /** Direcció del vent en graus. Només quan l'anemòmetre dona senyal de vida. */
  windDirection: number | null;

  /** Extrems del dia, sensació i pluja: només les estacions que els donen. */
  tMax: number | null;
  tMin: number | null;
  apparent: number | null;
  precipTodayMm: number | null;
  uv: number | null;
  solarRadiation: number | null;
}

export interface MountainData {
  resorts: Resort[];
  stations: MountainStation[];
  attribution: string;
  license: string;
}
