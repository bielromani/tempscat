/**
 * Worker · observación XEMA — la que da el "ara mateix" de cada página.
 *
 * Lee las últimas lecturas semihorarias de las 189 estaciones automáticas desde
 * el portal de datos abiertos de la Generalitat. Cadencia recomendada: cada
 * 10 minutos.
 *
 * Dos cosas que solo se descubren ejecutándolo contra el portal de verdad:
 *
 *  · El retraso real es de **45 a 65 minutos**, no de 45 fijos. La página debe
 *    decir cuándo se tomó la lectura, no fingir que es de ahora mismo.
 *  · `codi_estat` viene **vacío** en los datos recientes: la validación del
 *    Meteocat es posterior. Filtrar por `V` dejaría la web sin ningún dato
 *    actual. Se etiquetan como provisionales, que es lo honesto.
 *
 * Salida: data/cache/xema-current.json
 */
import { readFileSync } from 'node:fs';
import { fetchJson } from '../lib/http.ts';
import { raw } from '../lib/paths.ts';
import { DAILY_LIMITS, QuotaGuard, recordFreshness, writeSnapshot } from '../lib/store.ts';
import { XEMA_TO_SLUG, type VariableSlug } from '../../src/lib/variables.ts';
import type { Station } from '../04-fetch-stations.ts';

const DATASET = 'nzvn-apee';
const HOST = 'analisi.transparenciacatalunya.cat';

/** Ventana de búsqueda. Con 65 min de retraso, 4 h da margen sobrado sin traer de más. */
const WINDOW_HOURS = 4;

interface Reading {
  codi_estacio: string;
  codi_variable: string;
  data_lectura: string;
  valor_lectura: string;
  codi_estat?: string;
}

export interface StationObservation {
  station: string;
  /** Marca de la lectura más reciente de esta estación. */
  ts: string;
  /** Minutos transcurridos desde esa lectura. */
  ageMin: number;
  values: Partial<Record<VariableSlug, { value: number; ts: string; provisional: boolean }>>;
  /** Precipitación acumulada en las últimas 24 h, sumando las semihorarias. */
  precip24h?: number;
}

async function main() {
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const { stations } = JSON.parse(readFileSync(raw('stations.json'), 'utf8')) as { stations: Station[] };
  const operative = new Set(stations.filter((s) => s.operativa).map((s) => s.codi));

  const codes = Object.keys(XEMA_TO_SLUG);
  const since = new Date(Date.now() - WINDOW_HOURS * 3600e3).toISOString().slice(0, 19);
  const where = `data_lectura > '${since}' AND codi_variable in(${codes.map((c) => `'${c}'`).join(',')})`;

  const params = new URLSearchParams({
    $where: where,
    $order: 'data_lectura',
    $limit: '50000',
  });
  const url = `https://${HOST}/resource/${DATASET}.json?${params}`;

  console.log(`Ventana: desde ${since} UTC (${WINDOW_HOURS} h)`);
  const rows = await fetchJson<Reading[]>(url, { timeoutMs: 60_000 });
  quota.spend('socrata', 1);
  console.log(`Lecturas: ${rows.length.toLocaleString('es-ES')}`);

  if (rows.length >= 50_000) {
    console.warn('  aviso: se alcanzó el límite de 50.000 filas, puede faltar dato reciente');
  }

  // Última lectura de cada estación y variable. Entre dos códigos XEMA que
  // mapean a la misma variable (viento a 10 m y a 6 m), gana el de más
  // prioridad; a igualdad, el más reciente.
  const byStation = new Map<string, StationObservation>();
  const precipBuckets = new Map<string, Array<{ ts: number; mm: number }>>();
  const chosenPriority = new Map<string, number>();

  for (const r of rows) {
    if (!operative.has(r.codi_estacio)) continue;
    const mapping = XEMA_TO_SLUG[r.codi_variable];
    if (!mapping) continue;
    const value = Number(r.valor_lectura);
    if (!Number.isFinite(value)) continue;

    const ts = `${r.data_lectura.slice(0, 19)}Z`;

    let obs = byStation.get(r.codi_estacio);
    if (!obs) {
      obs = { station: r.codi_estacio, ts, ageMin: 0, values: {} };
      byStation.set(r.codi_estacio, obs);
    }

    if (r.codi_variable === '35') {
      const arr = precipBuckets.get(r.codi_estacio) ?? [];
      arr.push({ ts: Date.parse(ts), mm: value });
      precipBuckets.set(r.codi_estacio, arr);
    }

    const key = `${r.codi_estacio}:${mapping.slug}`;
    const prev = obs.values[mapping.slug];
    const prevPriority = chosenPriority.get(key) ?? Infinity;

    const better =
      !prev ||
      mapping.priority < prevPriority ||
      (mapping.priority === prevPriority && ts > prev.ts);

    if (better) {
      obs.values[mapping.slug] = {
        value,
        ts,
        // Sin `codi_estat` el dato aún no ha pasado la validación del Meteocat.
        provisional: r.codi_estat !== 'V',
      };
      chosenPriority.set(key, mapping.priority);
      if (ts > obs.ts) obs.ts = ts;
    }
  }

  // Precipitación acumulada de las últimas 24 h. La ventana de 4 h no llega,
  // así que se pide aparte: es la cifra que la gente busca cuando ha llovido.
  const since24 = new Date(Date.now() - 24 * 3600e3).toISOString().slice(0, 19);
  const p24 = await fetchJson<Array<{ codi_estacio: string; suma: string }>>(
    `https://${HOST}/resource/${DATASET}.json?` + new URLSearchParams({
      $select: 'codi_estacio,sum(valor_lectura) as suma',
      $where: `data_lectura > '${since24}' AND codi_variable='35'`,
      $group: 'codi_estacio',
      $limit: '500',
    }),
    { timeoutMs: 60_000 },
  );
  quota.spend('socrata', 1);
  for (const p of p24) {
    const obs = byStation.get(p.codi_estacio);
    if (obs) obs.precip24h = Math.round(Number(p.suma) * 10) / 10;
  }

  const now = Date.now();
  let newest: string | null = null;
  for (const obs of byStation.values()) {
    obs.ageMin = Math.round((now - Date.parse(obs.ts)) / 60_000);
    if (!newest || obs.ts > newest) newest = obs.ts;
  }

  const observations = [...byStation.values()].sort((a, b) => a.station.localeCompare(b.station));

  // ── Informe ───────────────────────────────────────────────────────────────
  const ages = observations.map((o) => o.ageMin).sort((a, b) => a - b);
  const withTemp = observations.filter((o) => o.values.temperature).length;
  const withWind = observations.filter((o) => o.values.wind_speed).length;
  const withPrecip = observations.filter((o) => o.precip24h != null).length;

  console.log(`\nEstaciones con dato: ${observations.length} / ${operative.size} operativas`);
  console.log(`  con temperatura     ${withTemp}`);
  console.log(`  con viento          ${withWind}`);
  console.log(`  con lluvia 24 h     ${withPrecip}`);
  console.log(`\nRetraso: mediana ${ages[Math.floor(ages.length / 2)]} min · mín ${ages[0]} · máx ${ages[ages.length - 1]}`);

  const temps = observations
    .map((o) => ({ codi: o.station, t: o.values.temperature?.value }))
    .filter((x): x is { codi: string; t: number } => x.t != null)
    .sort((a, b) => a.t - b.t);
  const nom = new Map(stations.map((s) => [s.codi, s.nom]));
  if (temps.length) {
    console.log(`\nAhora mismo:`);
    console.log(`  más fría   ${temps[0].t.toFixed(1)} °C  ${nom.get(temps[0].codi)}`);
    console.log(`  más cálida ${temps[temps.length - 1].t.toFixed(1)} °C  ${nom.get(temps[temps.length - 1].codi)}`);
  }
  const lluvia = observations.filter((o) => (o.precip24h ?? 0) > 0).sort((a, b) => (b.precip24h ?? 0) - (a.precip24h ?? 0));
  if (lluvia.length) {
    console.log(`  más lluvia 24 h ${lluvia[0].precip24h} mm  ${nom.get(lluvia[0].station)} (${lluvia.length} estaciones con precipitación)`);
  }

  writeSnapshot('xema-current', 'Meteocat XEMA · dades obertes', observations, newest);
  recordFreshness({
    source: 'xema-observations',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: newest,
    stalenessLimitMin: 120,
    rows: rows.length,
    apiCalls: 2,
  });

  console.log(`\n${quota.report()}`);
  console.log(`→ data/cache/xema-current.json (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}

main().catch((err) => {
  recordFreshness({
    source: 'xema-observations',
    lastSuccessAt: '',
    lastDataTs: null,
    stalenessLimitMin: 120,
    rows: 0,
    apiCalls: 0,
    error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
