/**
 * Worker · calidad del aire **medida**: la XVPCA.
 *
 * ## Lo que cambió el diseño: no es un dato en vivo
 *
 * La hoja de ruta daba por hecho que esto sería el «ara mateix» medido frente al
 * modelo. **No lo es**, y se vio midiéndolo antes de escribir la página:
 *
 *  · El dataset `tasf-thgu` se actualiza **una vez al día**, de madrugada. El 31
 *    de agosto la última escritura fue a las 06:30 UTC.
 *  · Y en esa escritura, la fila del día en curso solo llegaba a la **hora 4**.
 *    A las 22:39 UTC seguía llegando a la hora 4: veinte horas de retraso.
 *
 * Así que la XVPCA no puede presentarse como condiciones actuales bajo ninguna
 * redacción. Lo que sí es, y es valioso: **la medida real de ayer**, con la que se
 * puede contrastar el modelo — que es la verificación de la fase 4 en pequeño.
 *
 * El reparto queda claro y la página lo dice:
 *
 *  · **CAMS** (modelo) → ahora y las próximas horas, en todas partes.
 *  · **XVPCA** (medido) → ayer, y solo donde hay aparato.
 *
 * ## El formato es ancho
 *
 * Una fila por estación, día y contaminante, con 24 columnas `h01`…`h24`. Y
 * **Socrata omite los campos nulos**, así que la ausencia de `h05` no es un cero:
 * es que aún no está. Confundirlo daría medias diarias calculadas sobre cuatro
 * horas presentadas como si fueran de veinticuatro.
 *
 * Salida: data/cache/air-stations.json
 */
import { soql } from '../lib/socrata.ts';
import { DAILY_LIMITS, QuotaGuard, recordFreshness, writeSnapshot } from '../lib/store.ts';

const DATASET = 'tasf-thgu';

/** Días que se descargan. Cuatro cubren el retraso con margen y siguen siendo pocas filas. */
const DAYS = 4;

/**
 * Contaminantes de la XVPCA y su equivalente en el catálogo del proyecto.
 *
 * Los que no tienen equivalente en CAMS se conservan igual: el sulfuro de
 * hidrógeno y el benceno no salen en ningún modelo global y son justamente lo que
 * se mide en el entorno petroquímico de Tarragona.
 *
 * **El CO viene en mg/m³ y el modelo lo da en µg/m³.** Se convierte aquí: dejar
 * dos unidades para la misma magnitud en el mismo sitio es la clase de detalle
 * que produce una cifra mil veces menor sin que nada falle.
 */
const POLLUTANTS: Record<string, { slug: string; nom: string; factor: number; unit: string }> = {
  'NO2': { slug: 'no2', nom: 'Diòxid de nitrogen', factor: 1, unit: 'µg/m³' },
  'O3': { slug: 'o3', nom: 'Ozó troposfèric', factor: 1, unit: 'µg/m³' },
  'PM10': { slug: 'pm10', nom: 'Partícules PM10', factor: 1, unit: 'µg/m³' },
  'PM2.5': { slug: 'pm2_5', nom: 'Partícules fines PM2,5', factor: 1, unit: 'µg/m³' },
  'SO2': { slug: 'so2', nom: 'Diòxid de sofre', factor: 1, unit: 'µg/m³' },
  'CO': { slug: 'co', nom: 'Monòxid de carboni', factor: 1000, unit: 'µg/m³' },
  'NO': { slug: 'no', nom: 'Monòxid de nitrogen', factor: 1, unit: 'µg/m³' },
  'H2S': { slug: 'h2s', nom: 'Sulfur d’hidrogen', factor: 1, unit: 'µg/m³' },
  'C6H6': { slug: 'c6h6', nom: 'Benzè', factor: 1, unit: 'µg/m³' },
};

interface Row { [k: string]: string }

export interface AirMeasurement {
  slug: string;
  nom: string;
  unit: string;
  /** Media del día, solo si el día está completo. */
  dailyMean: number | null;
  /** Máximo horario del día. */
  dailyMax: number | null;
  /** Horas con lectura, de 24. Se publica porque una media de 4 horas no es una media diaria. */
  hours: number;
}

export interface AirStation {
  code: string;
  name: string;
  municipality: string;
  comarca: string;
  lat: number;
  lon: number;
  elevation: number | null;
  /** Tipus: traffic, background, industrial… Cambia mucho lo que mide. */
  type: string;
  area: string;
  /** El último día **completo** con lecturas. */
  day: string;
  measurements: AirMeasurement[];
}

export interface AirStationsData {
  stations: AirStation[];
  /** Día al que se refieren las medias. */
  day: string | null;
  /** Horas de retraso de la lectura más reciente de todo el conjunto. */
  lagHours: number | null;
}

const num = (v: string | undefined) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

async function main() {
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const from = new Date(Date.now() - DAYS * 86_400_000).toISOString().slice(0, 10);

  const rows = await soql<Row>(DATASET, {
    where: `data >= '${from}'`,
    order: 'data DESC',
    limit: 20_000,
  });
  quota.spend('socrata', 1);
  console.log(`Files des de ${from}: ${rows.length}`);

  /*
   * Se agrupa por estación y día, y se elige el **último día completo**.
   *
   * Completo quiere decir con las 24 horas de al menos un contaminante. El día en
   * curso siempre está a medias —hoy llegaba a la hora 4— y publicar su media
   * como «la mitjana del dia» sería una media de la madrugada con el nombre de
   * otra cosa.
   */
  interface Bucket { row: Row; hours: Map<string, number[]> }
  const byStationDay = new Map<string, Bucket>();
  let latestHourStamp: string | null = null;

  for (const r of rows) {
    const day = (r.data ?? '').slice(0, 10);
    const code = r.codi_eoi;
    if (!day || !code) continue;

    const def = POLLUTANTS[r.contaminant];
    if (!def) continue;

    const values: number[] = [];
    for (let h = 1; h <= 24; h++) {
      const v = num(r[`h${String(h).padStart(2, '0')}`]);
      // Socrata omite los nulos, así que un hueco es «no hay», no «cero». Se
      // guarda la posición para poder contar cuántas horas hay de verdad.
      if (v == null) continue;
      values.push(v * def.factor);
      const stamp = `${day}T${String(h - 1).padStart(2, '0')}`;
      if (!latestHourStamp || stamp > latestHourStamp) latestHourStamp = stamp;
    }
    if (!values.length) continue;

    const key = `${code}|${day}`;
    let b = byStationDay.get(key);
    if (!b) { b = { row: r, hours: new Map() }; byStationDay.set(key, b); }
    b.hours.set(def.slug, values);
  }

  // El último día que tenga al menos una estación con 24 horas de algún
  // contaminante. Es el día del que se puede hablar sin matices.
  const completeDays = new Set<string>();
  for (const [key, b] of byStationDay) {
    const day = key.split('|')[1];
    for (const vs of b.hours.values()) if (vs.length >= 24) { completeDays.add(day); break; }
  }
  const day = [...completeDays].sort().at(-1) ?? null;
  if (!day) throw new Error('Cap dia complet a la finestra descarregada.');

  const stations: AirStation[] = [];
  for (const [key, b] of byStationDay) {
    const [code, d] = key.split('|');
    if (d !== day) continue;
    const r = b.row;

    const measurements: AirMeasurement[] = [];
    for (const [slug, values] of b.hours) {
      const def = Object.values(POLLUTANTS).find((p) => p.slug === slug)!;
      const mean = values.reduce((a, x) => a + x, 0) / values.length;
      measurements.push({
        slug,
        nom: def.nom,
        unit: def.unit,
        // La media solo se publica con el día entero: con 18 horas se llamaría
        // «mitjana diària» algo que no lo es.
        dailyMean: values.length >= 24 ? r1(mean) : null,
        dailyMax: r1(Math.max(...values)),
        hours: values.length,
      });
    }
    measurements.sort((a, b2) => a.slug.localeCompare(b2.slug));

    stations.push({
      code,
      name: r.nom_estacio ?? code,
      municipality: r.municipi ?? '',
      comarca: r.nom_comarca ?? '',
      lat: Number(r.latitud),
      lon: Number(r.longitud),
      elevation: num(r.altitud),
      type: r.tipus_estacio ?? '',
      area: r.area_urbana ?? '',
      day,
      measurements,
    });
  }
  stations.sort((a, b2) => a.name.localeCompare(b2.name, 'ca'));

  const lagHours = latestHourStamp
    ? Math.round((Date.now() - Date.parse(`${latestHourStamp}:00:00Z`)) / 3_600_000)
    : null;

  // ── Informe ───────────────────────────────────────────────────────────────
  console.log(`\nÚltim dia complet: ${day} · ${stations.length} estacions`);
  console.log(`Última hora amb lectura a tot el conjunt: ${latestHourStamp ?? '—'}`);
  if (lagHours != null) {
    console.log(`Retard: ${lagHours} h`);
    if (lagHours > 12) {
      console.warn('  Més de mig dia: això NO es pot presentar com a «ara mateix».');
      console.warn('  El model de CAMS cobreix l\'ara; això cobreix la mesura d\'ahir.');
    }
  }

  const cover = new Map<string, number>();
  for (const s of stations) for (const m of s.measurements) {
    if (m.dailyMean != null) cover.set(m.slug, (cover.get(m.slug) ?? 0) + 1);
  }
  console.log('\nEstacions amb mitjana diària completa:');
  for (const [slug, n] of [...cover].sort((a, b2) => b2[1] - a[1])) {
    console.log(`  ${slug.padEnd(8)} ${n}`);
  }

  const pm10 = stations
    .map((s) => ({ s, m: s.measurements.find((x) => x.slug === 'pm10') }))
    .filter((x) => x.m?.dailyMean != null)
    .sort((a, b2) => (b2.m!.dailyMean ?? 0) - (a.m!.dailyMean ?? 0));
  if (pm10.length) {
    console.log(`\nPM10 més alt: ${pm10[0].m!.dailyMean} µg/m³ a ${pm10[0].s.name}`);
  }

  const data: AirStationsData = { stations, day, lagHours };
  writeSnapshot('air-stations', 'XVPCA · Generalitat de Catalunya, dades obertes', data, `${day}T23:00`);
  recordFreshness({
    source: 'air-stations',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: latestHourStamp ? `${latestHourStamp}:00:00Z` : null,
    // 36 h: el dataset se escribe una vez al día y con retraso. Por debajo de eso
    // el panel de estado marcaría en rojo algo que simplemente funciona así.
    stalenessLimitMin: 60 * 36,
    rows: rows.length,
    apiCalls: 1,
  });

  console.log(`\n→ data/cache/air-stations.json (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}

main().catch((err) => {
  recordFreshness({
    source: 'air-stations', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 60 * 36, rows: 0, apiCalls: 0, error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
