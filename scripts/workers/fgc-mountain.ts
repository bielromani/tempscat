/**
 * Worker · estacions de muntanya de Ferrocarrils (neu, obertura i meteorologia).
 *
 * Tres coses que el portal de dades obertes de FGC dona i que enlloc més no hi
 * són amb aquesta cobertura:
 *
 *  1. **El comunicat de cada estació**: obert o tancat, gruix de neu, qualitat,
 *     última nevada, percentatge de pistes i de remuntadors oberts, cel i
 *     visibilitat. **Ja ve en català**, cosa que els avisos de l'AEMET no.
 *  2. **Nou estacions meteorològiques pròpies, de 1.664 a 2.537 m.** La XEMA
 *     amunt de 2.000 m té molt poc: això és mesura on abans hi havia model.
 *  3. **El catàleg tècnic de 181 pistes i 55 remuntadors**: cota mínima i
 *     màxima, longitud, dificultat i innivació. No canvia d'un dia per l'altre,
 *     i és el que dona sentit a un «50 % obert».
 *  4. **87 itineraris** de senderisme, raquetes, esquí de muntanya i fora de
 *     pista — dels quals només els 22 d'esquí de muntanya estan complets.
 *
 * ## Què no es publica, i per què
 *
 * **La pressió.** Les set estacions que semblen bones donen entre 1.018 i
 * 1.022 hPa a cotes d'entre 1.964 i 2.160 m, o sigui que la publiquen reduïda
 * al nivell del mar: a 2.000 m la pressió real són uns 795 hPa. Reduïda és el
 * mateix número que a la vall, i per tant no diu res que la XEMA no digui
 * millor. I una de les nou —Niu d'Àliga, a 2.537 m— dona **1.056,6 hPa**, que
 * no existeix a la Terra: el sensor està descalibrat i el fitxer no ho diu.
 *
 * **La velocitat del vent.** El camp `VentActual` de Boí Taüll marcava 16,1
 * durant trenta-cinc minuts seguits mentre `VentMitjana10min` i `VentMax` es
 * movien, i **era més gran que el seu propi màxim** (9,7). Amb un camp que es
 * contradiu amb el del costat no es pot dir de quina magnitud parla, i cap dels
 * fitxers declara la unitat. La direcció sí que es publica, perquè els graus no
 * tenen unitat ambigua — i només quan l'anemòmetre dona senyal de vida.
 *
 * **El risc d'allaus.** Aquest és el més important de tots. El camp hi és i
 * està temptadorament a punt, però el comunicat d'Espot del 8 d'abril seguia
 * dient «3 - Marcat» cinc mesos després. Un risc d'allaus caducat no és una
 * dada endarrerida: és una dada perillosa. El butlletí oficial el fa el
 * Meteocat amb l'ICGC, i aquí s'hi enllaça en comptes de copiar-lo.
 *
 * ## Dels 87 itineraris només se'n descriuen 22, i és a posta
 *
 * Mesurat: 68 dels 87 porten longitud, 57 porten dificultat i **només 31
 * porten cota**. Sense cota no es pot creuar amb la cota de neu, que és el que
 * faria útil un itinerari en aquesta web.
 *
 * Els 22 d'**esquí de muntanya** són l'excepció: tots 22 porten dificultat,
 * longitud, desnivell i les dues cotes. D'aquests se'n publica la fitxa; de les
 * altres tres menes, el recompte. Inventar la cota que falta a un itinerari de
 * senderisme per fer bonica una taula seria publicar 56 altituds falses.
 *
 * I un dels 22 porta **la longitud i el desnivell intercanviats**: «Clot de la
 * Bassa» diu 351 m de recorregut i 2.840 de desnivell, i 351 és exactament la
 * diferència entre les seves dues cotes. Es detecta perquè un desnivell més
 * gran que el recorregut vol dir un pendent de més de 45° tota l'estona, cosa
 * que no és cap itinerari d'esquí de muntanya.
 *
 * ## La trampa del tipus de pista
 *
 * La paginació del portal —cent files per petició, i el `total_count` en un
 * racó— viu a `scripts/lib/fgc.ts`, que és qui la comprova.
 *
 * **El tipus arriba de dues maneres.** El camp es diu
 * `facility_type_literals_ca` —o sigui, el literal en català— i porta «Pista»
 * en cent quatre files i **`ski_slope`** en vint-i-sis: la clau de l'enumerat
 * sense traduir. Filtrant per «Pista», Vallter es quedava amb una pista de les
 * cinc que en dona el catàleg. S'accepten les dues.
 *
 * ## El `last_update` diu `+00:00` i no és UTC
 *
 * És hora local de Madrid amb el desplaçament posat a zero. Es veu perquè el
 * comunicat de la Molina deia `2026-09-03T09:13:50+00:00` quan a Madrid eren
 * les 09:43: llegit com a UTC, el comunicat s'havia emès **d'aquí a mitja
 * hora**. Amb dues hores de regal, tot comunicat sembla més fresc del que és, i
 * els d'abans de les dues de la matinada semblen del dia anterior.
 *
 * Es reinterpreta el rellotge de paret com a hora de Madrid, i es comprova que
 * cap comunicat no quedi al futur: si algun dia FGC hi posa el desplaçament de
 * debò, això salta en comptes de restar dues hores a una hora ja correcta.
 *
 * ## I el comunicat caduca
 *
 * El tecleja el personal de l'estació, així que fora de temporada es queda
 * aturat: dels sis comunicats, tres eren d'avui i tres de fa setmanes o mesos.
 * Cada estació porta la seva hora i l'aplicació decideix què ensenya — igual
 * que amb les banderes de platja i les càmeres.
 *
 * Sortida: data/cache/muntanya.json
 */
import { readFileSync } from 'node:fs';
import { fetchWithRetry, throttledMap } from '../lib/http.ts';
import { allRecords } from '../lib/fgc.ts';
import { build } from '../lib/paths.ts';
import { slugify } from '../lib/catalan.ts';
import { fgcTimestamp, madridToUtc } from '../lib/madrid.ts';
import {
  DAILY_LIMITS, QuotaGuard, publish, recordFreshness, syncState, writeSnapshot,
} from '../lib/store.ts';
import type {
  LiftStats, MountainData, MountainStation, Resort, SlopeStats,
} from '../../src/lib/mountain-types.ts';

const API = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets';

/** Fins a quina distància una estació reclama un municipi com el seu més proper. */
const MAX_NEAREST_KM = 25;

/**
 * Pressió impossible: per damunt d'això el sensor està descalibrat.
 *
 * No s'arriba a publicar cap pressió —veure la capçalera—, però el llindar es
 * queda escrit perquè és la prova que el valor de Niu d'Àliga no és una
 * lectura: el rècord mundial a nivell del mar són 1.083,8 hPa.
 */
const PRESSURE_MAX_HPA = 1085;

interface StateRow {
  bunit_id: string;
  name_bu: string;
  last_update: string;
  is_open: number;
  snow_min_snow: string | null;
  snow_max_snow: string | null;
  snow_quality_literals_ca: string | null;
  snow_last_snowfall: string | null;
  snow_last_snowfall_thickness: string | null;
  snow_avalanche_risk_literals_ca: string | null;
  observed_meteo_sky_literals_ca: string | null;
  observed_meteo_visibility_literals_ca: string | null;
  skislopes_open_percentage: string | null;
  skilifts_open_percentage: string | null;
  coordenades: { lat: number; lon: number } | null;
  open_status: string;
}

interface MeteoRow {
  name_bu: string;
  name_ca: string;
  businessunit_id: string;
  is_active: number;
  url: string;
  coordenades: { lat: number; lon: number } | null;
  meteo_data_temperaturaactual_value: number | string | null;
  meteo_data_humitatactual_value: number | string | null;
}

interface SlopeRow {
  businessunit_id: string;
  facility_type_literals_ca: string | null;
  color_literals_ca: string | null;
  produced_snow: number | null;
  longitude: number | null;
  min_height: number | null;
  max_height: number | null;
}

interface LiftRow {
  businessunit_id: string;
  sections_item_facility_type_literals_ca: string | null;
}

interface CircuitRow {
  businessunit_id: string;
  name_ca: string;
  color_literals_ca?: string | null;
  /** Sí: al conjunt de raquetes el camp es diu així. Veure `difficultyOf()`. */
  color_literals_a?: string | null;
  longitude: number | null;
  slope: number | null;
  min_height: number | null;
  max_height: number | null;
}

/**
 * Els quatre conjunts d'itineraris, amb el nom que se'ls dona a la pàgina.
 *
 * L'ordre és el de la targeta: primer el que es fa a l'hivern amb esquís.
 */
const CIRCUIT_SETS: Array<{ kind: string; dataset: string }> = [
  { kind: 'esquí de muntanya', dataset: 'informacio-tecnica-circuits-esqui-de-muntanya' },
  { kind: 'fora de pista', dataset: 'informacio-tecnica-circuits-fora-de-pista' },
  { kind: 'raquetes', dataset: 'informacio-tecnica-circuits-amb-raquetes' },
  { kind: 'senderisme', dataset: 'informacio-tecnica-circuits-de-senderisme' },
];

/** L'índex del conjunt d'esquí de muntanya dins de `CIRCUIT_SETS`. */
const SKI_TOURING = 0;

interface BuildLocation {
  id: string; level: string; nom: string; path: string;
  lat: number | null; lon: number | null; published: boolean;
}

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * `2026-09-03T09:13:50+00:00` → l'instant de debò.
 *
 * El desplaçament del text es descarta i el rellotge de paret es llegeix com a
 * hora de Madrid. Veure la capçalera: el camp no és UTC per molt que ho digui.
 */
function reportInstant(raw: string): Date {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) throw new Error(`last_update no llegible: ${raw}`);
  return madridToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
}

/**
 * La dificultat d'un itinerari.
 *
 * El camp es diu `color_literals_ca` a tres dels quatre conjunts i
 * **`color_literals_a`** al de raquetes: una lletra menys al nom del camp, i
 * llegint només el primer els tretze itineraris amb raquetes es quedaven sense.
 * Que allà siguin tots nuls no treu que el nom del camp sigui una trampa.
 */
function difficultyOf(r: CircuitRow): string | null {
  return (r.color_literals_ca ?? r.color_literals_a)?.trim() || null;
}

/**
 * «A) Puigllançada» → «Puigllançada».
 *
 * Els itineraris de senderisme van numerats amb una lletra i un parèntesi que
 * és l'ordre del plànol de l'estació, no part del nom del lloc.
 */
function circuitName(raw: string): string {
  return raw.replace(/^\s*[A-Za-z0-9]{1,3}\)\s*/, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Longitud i desnivell, desfent l'intercanvi quan hi és.
 *
 * Un desnivell més gran que el recorregut és un pendent de més de 45° de mitjana
 * en tot l'itinerari. Quan passa, els dos valors estan girats — i es comprova
 * contra la diferència de cotes, que és qui té raó. Veure la capçalera.
 */
export function lengthAndAscent(
  longitude: number | null, slope: number | null, minM: number | null, maxM: number | null,
): { lengthM: number | null; ascentM: number | null; swapped: boolean } {
  if (longitude != null && slope != null && slope > longitude) {
    const drop = minM != null && maxM != null ? maxM - minM : null;
    // Si girant-los el desnivell quadra amb les cotes, estaven girats.
    if (drop == null || Math.abs(longitude - drop) <= Math.abs(slope - drop)) {
      return { lengthM: slope, ascentM: longitude, swapped: true };
    }
  }
  return { lengthM: longitude, ascentM: slope, swapped: false };
}

/** Un número que pot venir com a text, amb coma de milers o amb `N/A`. */
function numberOf(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s || /^n\/?a$/i.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * L'altitud que el nom de l'estació porta a dins.
 *
 * Vuit de les nou la porten, i cadascuna a la seva manera: «1664m», «1964 m»,
 * «Cota  2160 m», «2537m», «1964 m.» i —sense unitat i amb punt de milers—
 * «Base Estació 2.040». Per això no s'exigeix la `m` com a les càmeres: aquí
 * s'exigeix que el número caigui al rang on hi ha muntanya a Catalunya.
 */
export function altitudeOf(name: string): number | null {
  const numbers = [...name.matchAll(/(\d(?:[.\s]?\d{3}|\d{2,3}))/g)]
    .map((m) => Number(m[1].replace(/[.\s]/g, '')))
    .filter((n) => n >= 800 && n <= 3200);
  return numbers.length ? numbers[numbers.length - 1] : null;
}

/** Els camps `<Tag value="…"/>` d'un XML de FGC. */
function xmlValues(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of xml.matchAll(/<([A-Za-zÀ-ÿ0-9]+)\s+value="([^"]*)"\s*\/?>/g)) out[m[1]] = m[2];
  return out;
}

/**
 * Els dos valors que pren el tipus d'una pista.
 *
 * «Pista» és el literal en català i `ski_slope` la clau de l'enumerat sense
 * traduir, al mateix camp. Veure la capçalera.
 */
const SLOPE_TYPES = new Set(['pista', 'ski_slope']);

function slopeStats(rows: SlopeRow[]): SlopeStats | null {
  const slopes = rows.filter(
    (r) => SLOPE_TYPES.has((r.facility_type_literals_ca ?? '').trim().toLowerCase()),
  );
  if (!slopes.length) return null;

  const byColour = new Map<string, number>();
  for (const r of slopes) {
    const c = r.color_literals_ca?.trim();
    if (c) byColour.set(c, (byColour.get(c) ?? 0) + 1);
  }

  const lengths = slopes.map((r) => r.longitude).filter((v): v is number => v != null && v > 0);
  const mins = slopes.map((r) => r.min_height).filter((v): v is number => v != null && v > 0);
  const maxs = slopes.map((r) => r.max_height).filter((v): v is number => v != null && v > 0);

  return {
    byColour: [...byColour].map(([colour, count]) => ({ colour, count }))
      .sort((a, b) => b.count - a.count),
    count: slopes.length,
    km: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / 100) / 10 : null,
    minM: mins.length ? Math.min(...mins) : null,
    maxM: maxs.length ? Math.max(...maxs) : null,
    withSnowmaking: slopes.filter((r) => r.produced_snow === 1).length,
  };
}

function liftStats(rows: LiftRow[]): LiftStats | null {
  if (!rows.length) return null;
  const byType = new Map<string, number>();
  for (const r of rows) {
    const t = r.sections_item_facility_type_literals_ca?.trim();
    if (t) byType.set(t, (byType.get(t) ?? 0) + 1);
  }
  return {
    count: rows.length,
    byType: [...byType].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
  };
}

async function main() {
  await syncState();
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const [states, meteo, slopes, lifts, ...circuitSets] = await Promise.all([
    allRecords<StateRow>('estat-d-obertura-de-les-explotacions', API),
    allRecords<MeteoRow>('meteo-tim', API),
    allRecords<SlopeRow>('pistes-desqui', API),
    allRecords<LiftRow>('remuntadors', API),
    ...CIRCUIT_SETS.map((c) => allRecords<CircuitRow>(c.dataset, API)),
  ]);
  quota.spend('fgc', 10);

  if (!states.length) throw new Error('FGC no ha retornat cap estat d’obertura.');
  if (!meteo.length) throw new Error('FGC no ha retornat cap estació meteorològica.');
  let swapped = 0;
  console.log(
    `Catàleg: ${states.length} estacions · ${meteo.length} estacions meteorològiques`
    + ` · ${slopes.length} pistes · ${lifts.length} remuntadors`
    + ` · ${circuitSets.reduce((a, c) => a + c.length, 0)} itineraris\n`,
  );

  const municipis = (JSON.parse(readFileSync(build('locations.json'), 'utf8')) as BuildLocation[])
    .filter((l) => l.published && l.level === 'municipi' && l.lat != null && l.lon != null);

  const nearestOf = (lat: number, lon: number) => {
    let best: { l: BuildLocation; d: number } | null = null;
    for (const l of municipis) {
      const d = distKm(lat, lon, l.lat as number, l.lon as number);
      if (!best || d < best.d) best = { l, d };
    }
    if (!best || best.d > MAX_NEAREST_KM) return null;
    return { id: best.l.id, nom: best.l.nom, path: best.l.path, distKm: Math.round(best.d * 10) / 10 };
  };

  // ── Les estacions i el seu comunicat ─────────────────────────────────────
  const resorts: Resort[] = [];

  for (const r of states) {
    if (!r.coordenades) {
      console.log(`  fora — ${r.name_bu}: el catàleg no en dona la coordenada`);
      continue;
    }

    /*
     * `is_open` i `open_status` diuen el mateix dues vegades, i per tant poden
     * arribar a dir coses diferents. Si algun dia passa, val més plantar-se que
     * triar-ne un a l'atzar: obert i tancat no és un matís.
     */
    let label = '';
    let openValue = '';
    try {
      const parsed = JSON.parse(r.open_status) as { value: string; literals: Record<string, string> };
      openValue = parsed.value;
      label = parsed.literals?.ca ?? '';
    } catch {
      throw new Error(`${r.name_bu}: open_status no és JSON vàlid (${r.open_status.slice(0, 60)}).`);
    }
    const open = r.is_open === 1;
    if ((openValue === 'open') !== open) {
      throw new Error(
        `${r.name_bu}: is_open=${r.is_open} i open_status="${openValue}" no diuen el mateix.`,
      );
    }

    // «No aplica» és el que tria l'estació quan no hi ha neu. No és una qualitat.
    const quality = r.snow_quality_literals_ca?.trim();
    const snowQuality = quality && !/^no aplica$/i.test(quality) ? quality : null;

    resorts.push({
      bunitId: r.bunit_id,
      name: r.name_bu.trim(),
      slug: slugify(r.name_bu),
      lat: r.coordenades.lat,
      lon: r.coordenades.lon,
      nearest: nearestOf(r.coordenades.lat, r.coordenades.lon),
      open,
      openLabel: label || (open ? 'Obert' : 'Tancat'),
      reportAt: reportInstant(r.last_update).toISOString(),
      snowMinCm: numberOf(r.snow_min_snow),
      snowMaxCm: numberOf(r.snow_max_snow),
      snowQuality,
      lastSnowfall: r.snow_last_snowfall?.trim() || null,
      lastSnowfallCm: numberOf(r.snow_last_snowfall_thickness),
      slopesOpenPct: numberOf(r.skislopes_open_percentage),
      liftsOpenPct: numberOf(r.skilifts_open_percentage),
      sky: r.observed_meteo_sky_literals_ca?.trim() || null,
      visibility: r.observed_meteo_visibility_literals_ca?.trim() || null,
      slopes: slopeStats(slopes.filter((s) => s.businessunit_id === r.bunit_id)),
      lifts: liftStats(lifts.filter((l) => l.businessunit_id === r.bunit_id)),
      circuits: CIRCUIT_SETS
        .map((c, i) => ({
          kind: c.kind,
          count: circuitSets[i].filter((x) => x.businessunit_id === r.bunit_id).length,
        }))
        .filter((c) => c.count > 0),
      skiTouring: circuitSets[SKI_TOURING]
        .filter((x) => x.businessunit_id === r.bunit_id)
        .map((x) => {
          const { lengthM, ascentM, swapped: sw } = lengthAndAscent(
            x.longitude, x.slope, x.min_height, x.max_height,
          );
          if (sw) swapped++;
          return {
            name: circuitName(x.name_ca),
            difficulty: difficultyOf(x),
            lengthM,
            ascentM,
            minM: x.min_height,
            maxM: x.max_height,
          };
        })
        .sort((a, b) => (b.ascentM ?? 0) - (a.ascentM ?? 0)),
    });
  }

  // ── Les nou estacions meteorològiques ────────────────────────────────────
  const stations: MountainStation[] = [];
  let badPressure = 0;

  await throttledMap(meteo.filter((m) => m.is_active), async (m) => {
    const name = m.name_ca.replace(/\s{2,}/g, ' ').trim();
    /*
     * Es va a l'XML de l'estació i no només a l'API.
     *
     * L'API n'exposa set camps i l'XML en porta més: Boí Taüll dona extrems
     * del dia, sensació tèrmica i pluja, i el Parc Astronòmic dona UV i
     * radiació solar. Són nou peticions més per volta, i el que hi ha a
     * l'altra banda són fitxers de dues-centes lletres.
     */
    let values: Record<string, string> = {};
    try {
      const res = await fetchWithRetry(m.url.replace(/^http:/, 'https:'), { retries: 2, timeoutMs: 25_000 });
      values = xmlValues(await res.text());
      quota.spend('fgc', 1);
    } catch {
      // Si l'XML falla, queda el que l'API ja ha donat: temperatura i humitat.
      values = {};
    }

    const at = fgcTimestamp(values.Data ?? '', values.Hora ?? '');
    if (!at) {
      console.log(`  fora — ${m.name_bu} · ${name}: l'XML no dona una data llegible`);
      return;
    }

    const pressure = numberOf(values.PressioActual);
    if (pressure != null && pressure > PRESSURE_MAX_HPA) badPressure++;

    // La direcció només val si l'anemòmetre es mou. La Molina Telecabina dona
    // vent 0,00 i direcció 0 amb la pressió a `N/A`: aquell sensor no hi és.
    const speed = numberOf(values.VentActual);
    const dir = numberOf(values.DireccioVent);
    const windDirection = speed != null && speed > 0 && dir != null ? Math.round(dir) % 360 : null;

    stations.push({
      id: `${m.businessunit_id}-${slugify(name)}`,
      name,
      resort: m.name_bu.trim(),
      bunitId: m.businessunit_id,
      altitudM: altitudeOf(name),
      lat: m.coordenades?.lat ?? null,
      lon: m.coordenades?.lon ?? null,
      measuredAt: at.toISOString(),
      temperature: numberOf(values.TemperaturaActual) ?? numberOf(m.meteo_data_temperaturaactual_value),
      humidity: numberOf(values.HumitatActual) ?? numberOf(m.meteo_data_humitatactual_value),
      windDirection,
      tMax: numberOf(values.TemperaturaMaxActual),
      tMin: numberOf(values.TemperaturaMinActual),
      apparent: numberOf(values['SensacióTèrmicaActual']) ?? numberOf(values.THW),
      precipTodayMm: numberOf(values['Precipitació']) ?? numberOf(values.PlujaDia),
      uv: numberOf(values.UV),
      solarRadiation: numberOf(values.RadiacioSolar),
    });
  }, { concurrency: 4, minIntervalMs: 100 });

  stations.sort((a, b) => a.resort.localeCompare(b.resort, 'ca') || (b.altitudM ?? 0) - (a.altitudM ?? 0));
  resorts.sort((a, b) => a.name.localeCompare(b.name, 'ca'));

  /*
   * Cap comunicat no pot ser del futur.
   *
   * És la comprovació que sosté la reinterpretació del `last_update`: si FGC hi
   * posés el desplaçament de debò, restar-li dues hores el deixaria al passat i
   * ningú no se n'adonaria. Al revés sí que es veu. Cinc minuts de marge per si
   * els dos rellotges no van sincronitzats al segon.
   */
  const future = resorts.filter((r) => Date.parse(r.reportAt) > Date.now() + 5 * 60_000);
  if (future.length) {
    throw new Error(
      `${future.length} comunicat(s) queden al futur després de llegir-los com a hora de Madrid `
      + `(${future.map((r) => `${r.name}: ${r.reportAt}`).join(', ')}). `
      + 'Segurament FGC ja hi posa el desplaçament de debò i sobra la conversió.',
    );
  }

  // ── Informe ──────────────────────────────────────────────────────────────
  const fresh = resorts.filter((r) => Date.now() - Date.parse(r.reportAt) < 24 * 3600_000);
  console.log(`Estacions: ${resorts.length} · ${fresh.length} amb comunicat de menys de 24 h`);
  for (const r of resorts) {
    const age = Math.round((Date.now() - Date.parse(r.reportAt)) / 3600_000);
    const snow = r.snowMaxCm != null ? `neu ${r.snowMinCm}–${r.snowMaxCm} cm` : 'sense neu comunicada';
    console.log(
      `  ${r.name.padEnd(18)} ${r.openLabel.padEnd(7)} ${snow.padEnd(24)}`
      + ` pistes ${r.slopesOpenPct ?? '—'} % · remuntadors ${r.liftsOpenPct ?? '—'} %`
      + ` · comunicat de fa ${age} h`
      + (r.slopes ? ` · ${r.slopes.count} pistes de ${r.slopes.minM}–${r.slopes.maxM} m` : ''),
    );
  }
  console.log(`\nEstacions meteorològiques: ${stations.length}`);
  for (const s of stations) {
    console.log(
      `  ${(s.resort + ' · ' + s.name).padEnd(44)}`
      + ` ${s.altitudM ?? '—'} m · ${s.temperature ?? '—'} °C · ${s.humidity ?? '—'} %`
      + ` · ${s.measuredAt.slice(11, 16)} UTC`,
    );
  }
  if (swapped) {
    console.log(
      `\n${swapped} itinerari(s) d'esquí de muntanya portaven la longitud i el desnivell`
      + ' intercanviats. S’han girat.',
    );
  }
  if (badPressure) {
    console.log(`\n${badPressure} estació(ns) donen una pressió impossible. No se’n publica cap.`);
  }

  const data: MountainData = {
    resorts,
    stations,
    attribution: 'Ferrocarrils de la Generalitat de Catalunya',
    license: 'CC BY 4.0',
  };

  const newest = [
    ...resorts.map((r) => r.reportAt),
    ...stations.map((s) => s.measuredAt),
  ].sort().at(-1) ?? null;

  writeSnapshot('muntanya', 'Ferrocarrils de la Generalitat de Catalunya', data, newest);
  recordFreshness({
    source: 'fgc-mountain',
    lastSuccessAt: new Date().toISOString(),
    // La data de la mesura més recent, que fora de temporada són les estacions
    // meteorològiques: aquestes no s'aturen mai i els comunicats sí.
    lastDataTs: newest,
    stalenessLimitMin: 150,
    rows: resorts.length + stations.length,
    apiCalls: 10 + stations.length,
  });

  console.log(`\n→ data/cache/muntanya.json (${((Date.now() - started) / 1000).toFixed(1)} s)`);

  const pub = await publish();
  if (!pub.skipped) console.log(`Publicat: ${pub.uploaded} fitxers`);
}

main().catch((err) => {
  recordFreshness({
    source: 'fgc-mountain',
    lastSuccessAt: '',
    lastDataTs: null,
    stalenessLimitMin: 150,
    rows: 0,
    apiCalls: 0,
    error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
