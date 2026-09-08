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
 *
 * ## Per què aquest fitxer no importa res
 *
 * Perquè el llegeixen els dos costats: el worker amb l'extensió `.ts` i
 * l'aplicació amb l'àlies `@/`. Els llindars —25 dies, 12 mesos, 15 anys— han
 * de ser **els mateixos** a la fitxa d'un poble i al gràfic de l'estació; amb
 * dues còpies, el dia que una canviï, la frase d'una pàgina i el dibuix de
 * l'altra dirien coses diferents del mateix mes i cap de les dues fallaria.
 * El lector de l'almacén és a `climate.ts`, que sí que importa.
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

/** Dies amb dada per considerar un mes comparable amb un altre. */
export const MONTH_MIN_DAYS = 25;

/** Mesos comparables per considerar un any comparable amb un altre. */
export const YEAR_MIN_MONTHS = 12;

/** Anys per dibuixar una tendència. Amb menys, el pendent és soroll. */
export const TREND_MIN_YEARS = 15;

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

export interface RainYear {
  year: number;
  /** Suma de l'any, mm. */
  precip: number;
  months: number;
}

/**
 * Els anys sencers de pluja, sense demanar-hi cap termòmetre.
 *
 * ## Per què no ho fa `yearsOf`
 *
 * Perquè aquella funció descarta els mesos sense mitjana de temperatura, i a la
 * XEMA hi ha estacions que **només mesuren pluja**: el Pantà de Sau, Sant Joan
 * de les Abadesses, la Roca del Vallès i Navès. Sau en porta 368 mesos sencers
 * —trenta anys de pluviòmetre— i amb la mateixa condició que la temperatura es
 * quedaven totes quatre sense cap gràfic: la pàgina no ensenyava trenta anys de
 * dada bona per la manca d'una altra que allí no es mesura.
 *
 * La condició de «sencer» és la mateixa: dotze mesos amb prou dies cadascun i
 * amb total de pluja. Un any al qual li falti l'octubre surt més sec que un que
 * el té, i posats al mateix gràfic la diferència sembla sequera.
 */
export function rainYearsOf(monthly: StationMonth[]): RainYear[] {
  const byYear = new Map<number, StationMonth[]>();
  for (const m of monthly) {
    if (m.days < MONTH_MIN_DAYS || m.precip == null) continue;
    const y = Number(m.ym.slice(0, 4));
    byYear.set(y, [...(byYear.get(y) ?? []), m]);
  }

  return [...byYear]
    .filter(([, ms]) => ms.length >= YEAR_MIN_MONTHS)
    .map(([year, ms]) => ({
      year,
      precip: Math.round(ms.reduce((a, m) => a + (m.precip as number), 0)),
      months: ms.length,
    }))
    .sort((a, b) => a.year - b.year);
}

/**
 * Un mes concret al llarg de tots els anys. Gener rere gener, posem.
 *
 * Només demana que el mes sigui **sencer**, no que tingui temperatura: així les
 * quatre estacions que només mesuren pluja poden dir quin va ser el seu
 * setembre més plujós. Qui dibuixi una mitjana de temperatures ha de filtrar
 * `tMean != null` ell mateix, que és una línia, i qui vulgui els extrems del
 * mes els té tots.
 */
export function sameMonthAcrossYears(
  monthly: StationMonth[], month: number,
): Array<StationMonth & { year: number }> {
  const mm = String(month).padStart(2, '0');
  return monthly
    .filter((m) => m.ym.endsWith(`-${mm}`) && m.days >= MONTH_MIN_DAYS)
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

/* ────────────────────────────────────────────────────────────────────────────
 * El mes en curs, comparat amb el mateix tros de mes dels altres anys
 * ──────────────────────────────────────────────────────────────────────────── */

/** Dies del mes en curs per comparar-lo amb res. Amb dos, la mitjana és el temps. */
export const PROGRESS_MIN_DAYS = 5;

/** Anys per posar-hi un número d'ordre. «El 3r de 4» no diu res. */
export const PROGRESS_MIN_YEARS = 10;

/**
 * Cobertura que se li demana a un any passat per entrar a la comparació,
 * sobre els dies que el mes en curs té mesurats.
 */
const PROGRESS_MIN_COVER = 0.8;

export interface MonthProgress {
  /** `AAAA-MM` del mes que es compara. */
  ym: string;
  /** Dies d'aquest mes que hi entren. La finestra és **aquests dies**, no l'1 al N. */
  days: number;
  /** L'últim dia de la finestra, `AAAA-MM-DD`. */
  lastDay: string;
  /** Mitjana d'aquests dies aquest any, °C. */
  tMean: number;
  /** Mitjana dels mateixos dies en tots els anys comparables, aquest inclòs. */
  normal: number;
  /** 1 és el més càlid. */
  rank: number;
  total: number;
  warmest: { year: number; tMean: number };
  coldest: { year: number; tMean: number };
}

/**
 * Com va el mes en curs comparat amb el mateix tros de mes dels altres anys.
 *
 * ## Per què no es compara amb la normal del mes sencer
 *
 * Perquè el mes en curs **no és un mes**. La sèrie diària de la XEMA va dos
 * dies enrere, així que el dia 7 d'un mes se'n tenen cinc dies, i dir que
 * aquests cinc dies van «+2,4 °C sobre la mitjana de setembre» és comparar
 * cinc dies contra trenta. Un setembre que comença amb quatre dies de xafogor
 * i s'acaba plovent no és un setembre càlid, i la frase l'hauria donat per
 * tancat el dia 7.
 *
 * El que sí que es pot comparar és **el mateix tros**: aquests cinc dies contra
 * els mateixos cinc dies de cada any de la sèrie. Amb això, «el tercer més
 * càlid de 38» vol dir exactament el que sembla, i es pot dir des del cinquè
 * dia del mes en comptes d'esperar-ne vint-i-cinc.
 *
 * ## El que descarta
 *
 * Un any passat hi entra si té almenys el 80 % dels dies de la finestra. Sense
 * aquesta condició, un any al qual li faltessin quatre dels cinc dies hi
 * entraria amb la mitjana d'un dia, i un dia qualsevol de setembre pot ser el
 * més càlid o el més fred de la sèrie sense que aquell setembre ho fos.
 *
 * Els dies de la finestra són els que el mes en curs **té mesurats**, no els
 * de l'1 al N: si aquest any hi falta el dia 3, tampoc no es compta el dia 3
 * dels altres anys.
 */
export function monthProgressOf(
  days: Array<{ day: string; tMean: number }>, today: string,
): MonthProgress | null {
  const ym = today.slice(0, 7);
  const mm = ym.slice(5, 7);

  const now = days
    .filter((d) => d.day.startsWith(`${ym}-`) && d.day <= today)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (now.length < PROGRESS_MIN_DAYS) return null;

  /** Els dies del mes que aquest any té mesurats. */
  const window = new Set(now.map((d) => d.day.slice(8, 10)));
  /*
   * Dies que se li demanen a un any passat.
   *
   * Són dues condicions alhora, i totes dues diuen el mateix: el 80 % de la
   * finestra, i mai menys dels que fan falta per obrir-la. En finestres curtes
   * manda la segona i acaba demanant-los tots, que és el que toca: amb cinc
   * dies, els quatre d'un any al qual li falta un dia ja no són la mateixa
   * setmana.
   */
  const need = Math.max(PROGRESS_MIN_DAYS, Math.ceil(window.size * PROGRESS_MIN_COVER));

  const byYear = new Map<number, number[]>();
  for (const d of days) {
    if (d.day.slice(5, 7) !== mm || !window.has(d.day.slice(8, 10))) continue;
    const y = Number(d.day.slice(0, 4));
    byYear.set(y, [...(byYear.get(y) ?? []), d.tMean]);
  }

  const means = [...byYear]
    .filter(([, vs]) => vs.length >= need)
    .map(([year, vs]) => ({ year, tMean: round1(vs.reduce((a, v) => a + v, 0) / vs.length) }))
    .sort((a, b) => a.year - b.year);

  const thisYear = Number(ym.slice(0, 4));
  const mine = means.find((m) => m.year === thisYear);
  if (!mine || means.length < PROGRESS_MIN_YEARS) return null;

  const warm = [...means].sort((a, b) => b.tMean - a.tMean);
  const { rank, total } = rankOf(mine.tMean, means.map((m) => m.tMean));

  return {
    ym,
    days: window.size,
    lastDay: now[now.length - 1].day,
    tMean: mine.tMean,
    normal: round1(means.reduce((a, m) => a + m.tMean, 0) / means.length),
    rank,
    total,
    warmest: warm[0],
    coldest: warm[warm.length - 1],
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * L'any en curs de pluja, comparat amb el mateix tros dels altres anys
 * ──────────────────────────────────────────────────────────────────────── */

/** Dies de finestra per dir res d'un any de pluja. Amb tres setmanes, no. */
export const RAIN_YTD_MIN_DAYS = 45;

/** Anys per posar-hi un número d'ordre. */
export const RAIN_YTD_MIN_YEARS = 10;

/**
 * Cobertura que se li demana a un any —el d'ara i els passats— sobre els dies
 * de calendari de la finestra.
 *
 * És més exigent que la de la temperatura, i per una raó que no és de prudència:
 * una mitjana no es mou gaire si li falten dies, però **una suma sí**. Cada dia
 * que falta és aigua que no es compta, sempre cap avall, i un any amb tres
 * setmanes de pluviòmetre espatllat sortiria com un any sec.
 */
const RAIN_YTD_MIN_COVER = 0.9;

export interface RainProgress {
  /** L'últim dia mesurat que hi entra, `AAAA-MM-DD`. */
  lastDay: string;
  /** Dies de calendari de l'1 de gener fins aquell dia. */
  span: number;
  /** Mil·límetres d'aquest any dins de la finestra. */
  precip: number;
  /** El que se'n sol portar a aquestes alçades: mitjana dels anys comparables. */
  normal: number;
  /** 1 és el més plujós. */
  rank: number;
  total: number;
  wettest: { year: number; precip: number };
  driest: { year: number; precip: number };
}

/**
 * Quanta aigua porta l'any, comparada amb el que en portaven els altres a la
 * mateixa data.
 *
 * ## Per què de l'any i no del mes
 *
 * Perquè la pluja no es reparteix com la temperatura. Cinc dies de setembre
 * diuen alguna cosa de la temperatura d'aquell setembre —les mitjanes diàries
 * s'assemblen entre elles— i no diuen res de la pluja: una tempesta de dues
 * hores hi posa el mes sencer i quinze dies de sol no en treuen res. La pregunta
 * que té resposta amb pluja és la de l'acumulat: **va sec, aquest any?**
 *
 * ## I per què no contra la mitjana anual
 *
 * Pel mateix motiu que la temperatura del mes en curs no es compara amb el mes
 * sencer. Dir el 8 de setembre que «hi solen caure 480 mm l'any i en portem
 * 312» convida a llegir-hi un dèficit de 168 que no existeix: encara falten
 * l'octubre i el novembre, que en aquest país són els que més en porten. El
 * que es compara és el mateix tros: de l'1 de gener al 5 de setembre, contra
 * l'1 de gener al 5 de setembre de cada any de la sèrie.
 *
 * Els dies han d'arribar amb la pluja mesurada; un dia sense dada **no és un
 * dia sec** i per això la cobertura es demana contra els dies de calendari, no
 * contra els que hi ha.
 */
export function rainProgressOf(
  days: Array<{ day: string; precip: number }>, today: string,
): RainProgress | null {
  const year = today.slice(0, 4);

  const mine = days
    .filter((d) => d.day.startsWith(`${year}-`) && d.day <= today)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (!mine.length) return null;

  const lastDay = mine[mine.length - 1].day;
  /** Fins on arriba la finestra dins de qualsevol any: `MM-DD`. */
  const md = lastDay.slice(5);
  const span = dayNumber(lastDay) - dayNumber(`${year}-01-01`) + 1;
  if (span < RAIN_YTD_MIN_DAYS) return null;

  const need = Math.ceil(span * RAIN_YTD_MIN_COVER);

  const acc = new Map<number, { sum: number; n: number }>();
  for (const d of days) {
    if (d.day.slice(5) > md) continue;
    const y = Number(d.day.slice(0, 4));
    const a = acc.get(y) ?? { sum: 0, n: 0 };
    a.sum += d.precip;
    a.n++;
    acc.set(y, a);
  }

  const totals = [...acc]
    .filter(([, a]) => a.n >= need)
    .map(([y, a]) => ({ year: y, precip: Math.round(a.sum) }))
    .sort((a, b) => a.year - b.year);

  const ours = totals.find((t) => t.year === Number(year));
  if (!ours || totals.length < RAIN_YTD_MIN_YEARS) return null;

  const wet = [...totals].sort((a, b) => b.precip - a.precip);
  const { rank, total } = rankOf(ours.precip, totals.map((t) => t.precip));

  return {
    lastDay,
    span,
    precip: ours.precip,
    normal: Math.round(totals.reduce((a, t) => a + t.precip, 0) / totals.length),
    rank,
    total,
    wettest: wet[0],
    driest: wet[wet.length - 1],
  };
}

/** Dies des de l'origen, per restar dues dates sense passar per cap zona horària. */
function dayNumber(iso: string) {
  return Math.round(
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000,
  );
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
