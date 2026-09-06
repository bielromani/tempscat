import 'server-only';
import { snapshot } from './cache-store';
import { climateShard } from './shards';

/**
 * La sèrie mensual d'una estació, i el que se'n pot dir sense inventar.
 *
 * ## Què hi ha i d'on surt
 *
 * De la sèrie diària sencera de la XEMA, agregada per mesos al worker
 * `xema-history.ts` — allà hi és entera; el tros que llegeixen les fitxes de
 * poble només porta 45 dies. La més llarga arranca el setembre de 1988 i la
 * mediana de la xarxa són 26 anys.
 *
 * ## La regla que mana en tot aquest fitxer
 *
 * **Un mes incomplet no és un mes fred.** Una estació que s'instal·la el dia 20,
 * una avaria de dues setmanes o un canvi de sensor deixen mesos amb quatre dies
 * de dada, i la seva mitjana no es pot comparar amb la d'un mes sencer. Per això
 * cada funció d'aquí demana una cobertura mínima i **descarta** el que no hi
 * arriba, en comptes de fer la mitjana del que hi ha.
 *
 * El mateix amb els anys: un any amb deu mesos no entra a la tendència. Amb la
 * regla contrària, una estació que va estar espatllada un hivern sortiria amb
 * un any anormalment càlid i la recta se n'aniria.
 *
 * ## I el que això no és
 *
 * És **el que ha mesurat una estació**, no el clima d'una comarca ni una
 * atribució. Un aparell es mou, canvia de sensor i li creixen cases al voltant,
 * i qualsevol d'aquestes tres coses mou una sèrie tant com una dècada. Les
 * pàgines que ho pinten ho diuen.
 */

export interface StationMonth {
  ym: string;
  tMean: number | null;
  tMax: number | null;
  tMin: number | null;
  precip: number | null;
  gustMax: number | null;
  days: number;
}

interface ClimateData {
  station: string;
  monthly: StationMonth[];
}

/** Dies amb dada per considerar un mes comparable amb un altre. */
export const MONTH_MIN_DAYS = 25;

/** Mesos comparables per considerar un any comparable amb un altre. */
export const YEAR_MIN_MONTHS = 12;

/** Anys per dibuixar una tendència. Amb menys, el pendent és soroll. */
export const TREND_MIN_YEARS = 15;

export async function climateOfStation(codi: string): Promise<StationMonth[] | null> {
  const snap = await snapshot<ClimateData>(climateShard(codi));
  return snap?.data?.monthly?.length ? snap.data.monthly : null;
}

export interface ClimateYear {
  year: number;
  tMean: number;
  /** La màxima absoluta de l'any i la mínima absoluta. */
  tMax: number | null;
  tMin: number | null;
  /** Suma de l'any, mm. Nul si algun mes no en té. */
  precip: number | null;
  months: number;
}

/**
 * Els anys sencers de la sèrie.
 *
 * «Sencer» vol dir dotze mesos amb prou dies cadascun. És exigent a posta: la
 * mitjana anual d'una estació a la qual li falta el gener és més alta que la
 * d'una a qui no li falta, i posades al mateix gràfic, la diferència sembla
 * clima i és una avaria.
 */
export function yearsOf(monthly: StationMonth[]): ClimateYear[] {
  const byYear = new Map<number, StationMonth[]>();
  for (const m of monthly) {
    if (m.days < MONTH_MIN_DAYS || m.tMean == null) continue;
    const y = Number(m.ym.slice(0, 4));
    byYear.set(y, [...(byYear.get(y) ?? []), m]);
  }

  return [...byYear]
    .filter(([, ms]) => ms.length >= YEAR_MIN_MONTHS)
    .map(([year, ms]) => {
      const precips = ms.map((m) => m.precip);
      return {
        year,
        tMean: round1(ms.reduce((a, m) => a + (m.tMean ?? 0), 0) / ms.length),
        tMax: max(ms.map((m) => m.tMax)),
        tMin: min(ms.map((m) => m.tMin)),
        precip: precips.every((p) => p != null)
          ? Math.round(precips.reduce((a: number, p) => a + (p as number), 0))
          : null,
        months: ms.length,
      };
    })
    .sort((a, b) => a.year - b.year);
}

/** Un mes concret al llarg de tots els anys. Gener rere gener, posem. */
export function sameMonthAcrossYears(
  monthly: StationMonth[], month: number,
): Array<StationMonth & { year: number }> {
  const mm = String(month).padStart(2, '0');
  return monthly
    .filter((m) => m.ym.endsWith(`-${mm}`) && m.days >= MONTH_MIN_DAYS && m.tMean != null)
    .map((m) => ({ ...m, year: Number(m.ym.slice(0, 4)) }))
    .sort((a, b) => a.year - b.year);
}

export interface Trend {
  /** Graus per dècada. Positiu, puja. */
  perDecade: number;
  years: number;
  from: number;
  to: number;
}

/**
 * El pendent de la recta de mínims quadrats, en graus per dècada.
 *
 * Mínims quadrats i no «l'última menys la primera»: amb dos punts, un any
 * excepcional a qualsevol dels dos extrems decideix el resultat sencer. La
 * recta els fa servir tots.
 *
 * Torna nul per sota de `TREND_MIN_YEARS`. No és prudència genèrica: amb vuit
 * anys, el pendent d'una sèrie de temperatures és soroll amb un signe, i
 * dibuixar-lo convida a llegir-hi una tendència que no hi és.
 */
export function trendOf(years: ClimateYear[]): Trend | null {
  if (years.length < TREND_MIN_YEARS) return null;

  const n = years.length;
  const mx = years.reduce((a, y) => a + y.year, 0) / n;
  const my = years.reduce((a, y) => a + y.tMean, 0) / n;
  let num = 0;
  let den = 0;
  for (const y of years) {
    num += (y.year - mx) * (y.tMean - my);
    den += (y.year - mx) ** 2;
  }
  if (den === 0) return null;

  return {
    perDecade: round2((num / den) * 10),
    years: n,
    from: years[0].year,
    to: years[years.length - 1].year,
  };
}

/** On queda un valor dins d'una llista: 1 és el més alt. */
export function rankOf(value: number, all: number[]): { rank: number; total: number } {
  const sorted = [...all].sort((a, b) => b - a);
  return { rank: sorted.findIndex((v) => v <= value) + 1, total: sorted.length };
}

function round1(v: number) { return Math.round(v * 10) / 10; }
function round2(v: number) { return Math.round(v * 100) / 100; }
function max(xs: Array<number | null>) {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.max(...v) : null;
}
function min(xs: Array<number | null>) {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.min(...v) : null;
}
