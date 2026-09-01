/**
 * Worker · agua: embalses, aforos de río y estado de sequía.
 *
 * Tres datasets de la Agència Catalana de l'Aigua en el portal de datos
 * abiertos. Todos cubren **solo las conques internes**: el Segre y el Ebro son
 * de la Confederación Hidrográfica del Ebro y no están aquí. Eso hay que decirlo
 * en la página, porque un mapa de embalses de Catalunya sin Riba-roja ni Rialb
 * parece incompleto — y lo es, pero no por nuestra culpa.
 *
 * ## Lo que se descubrió mirando los datos antes de escribir nada
 *
 * **El registro de sequía no es un dato en vivo.** `i5n8-43cw` guarda *cambios de
 * estado*, no lecturas: 8.677 filas para 630 municipios, y la más reciente es del
 * 16 de mayo de 2025. El estado actual de 628 de esos 630 municipios es
 * NORMALITAT.
 *
 * Eso no significa que el fichero esté roto — significa que la sequía se acabó y
 * desde entonces no ha habido decretos. Pero **no se puede distinguir** «no ha
 * cambiado» de «han dejado de publicarlo», así que el estado nunca se muestra sin
 * la fecha del último cambio al lado. Publicar «normalitat» a secas durante una
 * sequía nueva sería el peor fallo posible de esta fuente.
 *
 * **Los embalses y los aforos sí son de hoy**, actualizados a las 06:11 y 06:22.
 * Y los embalses traen el porcentaje de volumen, que es la cifra que la gente
 * busca de verdad.
 *
 * ## Consultas
 *
 * Las de embalses y ríos van **filtradas por día**, no agregadas sobre toda la
 * serie: son datasets de 12 y 45 millones de filas y un `$group` sin filtro de
 * fecha tarda minutos. Es la misma lección que ya costó tiempo con la XEMA.
 *
 * Salida: data/cache/water.json
 */
import { soql } from '../lib/socrata.ts';
import { utm31ToLatLon } from '../lib/geo.ts';
import {
  DAILY_LIMITS, QuotaGuard, publish, recordFreshness, writeSnapshot,
} from '../lib/store.ts';

const RESERVOIRS = 'vjx7-6kcp';
const RIVERS = '3yr3-vq6y';
const DROUGHT = 'i5n8-43cw';

interface Row { [k: string]: string }

export interface Reservoir {
  code: string;
  name: string;
  basin: string;
  lat: number;
  lon: number;
  /** Porcentaje de volumen embalsado. Es la cifra que la gente busca. */
  pct: number | null;
  volumeHm3: number | null;
  levelM: number | null;
  /** El mismo porcentaje hace 30 días, para poder decir si sube o baja. */
  pct30d: number | null;
  at: string;
}

export interface RiverGauge {
  code: string;
  name: string;
  basin: string;
  subbasin: string;
  lat: number;
  lon: number;
  /** Caudal en m³/s. */
  flow: number | null;
  levelM: number | null;
  at: string;
}

export interface DroughtEntry {
  /** Unidad de explotación: la sequía se declara por acuífero, no por municipio. */
  unit: string;
  /** Estado hidrológico: NORMALITAT, PREALERTA, ALERTA, EXCEPCIONALITAT, EMERGÈNCIA… */
  hydro: string;
  /** Estado pluviométrico, que va por su cuenta. */
  rain: string;
  /** Fecha del último cambio. **Nunca se muestra el estado sin ella.** */
  since: string;
}

export interface WaterData {
  reservoirs: Reservoir[];
  rivers: RiverGauge[];
  drought: {
    /** INE de 5 dígitos → estado. */
    byMunicipality: Record<string, DroughtEntry>;
    /** Fecha del cambio más reciente de todo el registro. */
    lastChange: string | null;
    /** Cuántos municipios hay en cada estado, para el resumen. */
    counts: Record<string, number>;
  };
}

const num = (v: string | undefined) => (v == null || v === '' ? null : Number(v));
const r1 = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r2 = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/**
 * La lectura más reciente de cada estación y variable.
 *
 * El dataset trae una fila por estación, variable y media hora, así que hay que
 * quedarse con la última de cada par. Se ordena por día y hora **en el servidor**
 * para que el recorte por `$limit` no deje fuera justo lo más nuevo.
 */
function latestByStation(rows: Row[], variable: string): Map<string, Row> {
  const out = new Map<string, Row>();
  for (const r of rows) {
    if (r.tipus_variable !== variable) continue;
    const prev = out.get(r.codi_estacio);
    const key = `${r.dia}${r.hora}`;
    if (!prev || key > `${prev.dia}${prev.hora}`) out.set(r.codi_estacio, r);
  }
  return out;
}

function stamp(r: Row | undefined): string {
  return r ? `${r.dia.slice(0, 10)}T${(r.hora ?? '00:00').slice(0, 5)}` : '';
}

async function main() {
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();
  let calls = 0;

  // ── Embalses ──────────────────────────────────────────────────────────────
  const resRows = await soql<Row>(RESERVOIRS, {
    select: 'codi_estacio,estacio,conca,utm_x,utm_y,dia,hora,tipus_variable,valor',
    where: `dia >= '${day(-2)}'`,
    order: 'dia DESC, hora DESC',
    limit: 20_000,
  });
  calls++;

  const pct = latestByStation(resRows, 'Percentatge volum embassat');
  const vol = latestByStation(resRows, 'Volum embassat');
  const lvl = latestByStation(resRows, 'Nivell absolut');

  // Comparación con hace un mes: un porcentaje suelto no dice si sube o baja, y
  // en un embalse la tendencia importa más que el nivel.
  const monthAgo = await soql<Row>(RESERVOIRS, {
    select: 'codi_estacio,valor,dia,hora',
    where: `dia = '${day(-30)}' AND tipus_variable = 'Percentatge volum embassat'`,
    order: 'hora DESC',
    limit: 5_000,
  });
  calls++;
  const pctThen = new Map<string, number>();
  for (const r of monthAgo) {
    if (!pctThen.has(r.codi_estacio)) {
      const v = num(r.valor);
      if (v != null) pctThen.set(r.codi_estacio, v);
    }
  }

  const reservoirs: Reservoir[] = [...pct.keys()].map((code) => {
    const p = pct.get(code)!;
    const { lat, lon } = utm31ToLatLon(Number(p.utm_x), Number(p.utm_y));
    return {
      code,
      name: p.estacio,
      basin: p.conca ?? '',
      lat: r2(lat)!,
      lon: r2(lon)!,
      pct: r1(num(p.valor)),
      volumeHm3: r1(num(vol.get(code)?.valor)),
      levelM: r1(num(lvl.get(code)?.valor)),
      pct30d: r1(pctThen.get(code) ?? null),
      at: stamp(p),
    };
  }).sort((a, b) => (b.volumeHm3 ?? 0) - (a.volumeHm3 ?? 0));

  // ── Aforos de río ─────────────────────────────────────────────────────────
  const riverRows = await soql<Row>(RIVERS, {
    select: 'codi_estacio,estacio,conca,subconca,utm_x,utm_y,dia,hora,tipus_variable,valor',
    where: `dia >= '${day(-1)}'`,
    order: 'dia DESC, hora DESC',
    limit: 30_000,
  });
  calls++;

  const flow = latestByStation(riverRows, 'Cabal riu');
  const level = latestByStation(riverRows, 'Nivell riu');

  const rivers: RiverGauge[] = [...new Set([...flow.keys(), ...level.keys()])].map((code) => {
    const r = flow.get(code) ?? level.get(code)!;
    const { lat, lon } = utm31ToLatLon(Number(r.utm_x), Number(r.utm_y));
    return {
      code,
      name: r.estacio,
      basin: r.conca ?? '',
      subbasin: r.subconca ?? '',
      lat: r2(lat)!,
      lon: r2(lon)!,
      flow: r2(num(flow.get(code)?.valor)),
      levelM: r2(num(level.get(code)?.valor)),
      at: stamp(flow.get(code) ?? level.get(code)),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ca'));

  // ── Sequía ────────────────────────────────────────────────────────────────
  // El registro entero cabe en una consulta: son 8.677 filas.
  const droughtRows = await soql<Row>(DROUGHT, {
    select: 'data_canvi_estat_sequera,codi_municipi,municipi,unitat_explotaci,'
      + 'estat_sequera_hidrol_gic,estat_sequera_pluviom_tric',
    limit: 20_000,
  });
  calls++;

  const byMunicipality: Record<string, DroughtEntry> = {};
  let lastChange: string | null = null;
  for (const r of droughtRows) {
    // El código del dataset lleva seis dígitos —el INE de cinco más el de
    // control— y nuestras ubicaciones guardan cinco. Sin recortar, no cruza nada.
    const ine5 = (r.codi_municipi ?? '').slice(0, 5);
    if (!ine5) continue;
    const since = (r.data_canvi_estat_sequera ?? '').slice(0, 10);
    const prev = byMunicipality[ine5];
    if (!prev || since > prev.since) {
      byMunicipality[ine5] = {
        unit: r.unitat_explotaci ?? '',
        hydro: r.estat_sequera_hidrol_gic ?? '',
        rain: r.estat_sequera_pluviom_tric ?? '',
        since,
      };
    }
    if (!lastChange || since > lastChange) lastChange = since;
  }

  const counts: Record<string, number> = {};
  for (const e of Object.values(byMunicipality)) {
    counts[e.hydro] = (counts[e.hydro] ?? 0) + 1;
  }

  quota.spend('socrata', calls);

  // ── Informe ───────────────────────────────────────────────────────────────
  //
  // Comprobar que la conversión de UTM cae dentro de Catalunya es la única forma
  // barata de saber que la fórmula es correcta: un error de huso o de elipsoide
  // no da excepción, mueve los puntos unos kilómetros y solo se ve en un mapa.
  const inBox = (p: { lat: number; lon: number }) =>
    p.lat > 40.4 && p.lat < 43.0 && p.lon > 0.0 && p.lon < 3.4;
  const strays = [...reservoirs, ...rivers].filter((p) => !inBox(p));

  console.log(`Embassaments: ${reservoirs.length}`);
  for (const r of reservoirs) {
    const trend = r.pct != null && r.pct30d != null
      ? ` (${r.pct - r.pct30d >= 0 ? '+' : ''}${(r.pct - r.pct30d).toFixed(1)} punts en 30 dies)`
      : '';
    console.log(`  ${r.name.slice(0, 40).padEnd(42)} ${String(r.pct ?? '—').padStart(5)} %`
      + ` · ${String(r.volumeHm3 ?? '—').padStart(7)} hm³${trend}`);
  }

  console.log(`\nAforaments de riu: ${rivers.length}`);
  const withFlow = rivers.filter((r) => r.flow != null);
  const top = [...withFlow].sort((a, b) => (b.flow ?? 0) - (a.flow ?? 0)).slice(0, 3);
  console.log(`  amb cabal: ${withFlow.length}`);
  for (const r of top) console.log(`  més cabal: ${r.flow} m³/s  ${r.name}`);

  console.log(`\nSequera: ${Object.keys(byMunicipality).length} municipis al registre`);
  for (const [state, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${state.padEnd(20)} ${n}`);
  }
  console.log(`  últim canvi registrat: ${lastChange}`);
  if (lastChange && Date.now() - Date.parse(lastChange) > 400 * 86_400_000) {
    console.warn('  avís: fa més d\'un any del darrer canvi. El registre només anota canvis,');
    console.warn('  però no es pot distingir «no ha canviat» de «han deixat de publicar-ho».');
  }

  if (strays.length) {
    console.warn(`\navís: ${strays.length} estacions cauen fora de Catalunya després de convertir`);
    for (const s of strays.slice(0, 5)) console.warn(`  ${s.name}: ${s.lat}, ${s.lon}`);
  } else {
    console.log('\nConversió UTM 31N: totes les estacions cauen dins de Catalunya.');
  }

  const data: WaterData = {
    reservoirs,
    rivers,
    drought: { byMunicipality, lastChange, counts },
  };

  const newest = reservoirs[0]?.at ?? null;
  writeSnapshot('water', 'Agència Catalana de l’Aigua · dades obertes', data, newest);
  recordFreshness({
    source: 'water',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: newest,
    // Los embalses se publican una vez al día de madrugada; 30 h da margen para
    // un retraso sin declarar obsoleto lo que solo llega tarde.
    stalenessLimitMin: 60 * 30,
    rows: reservoirs.length + rivers.length + Object.keys(byMunicipality).length,
    apiCalls: calls,
  });

  console.log(`\n→ data/cache/water.json (${((Date.now() - started) / 1000).toFixed(1)} s, ${calls} consultes)`);

  const pub = await publish();
  if (!pub.skipped) {
    console.log(`Publicat a l'emmagatzematge: ${pub.uploaded} fitxers · ${(pub.bytes / 1048576).toFixed(1)} MB`);
    if (pub.origin && process.env.BLOB_BASE_URL !== pub.origin) {
      console.log(`   BLOB_BASE_URL = ${pub.origin}`);
    }
  }
}

main().catch((err) => {
  recordFreshness({
    source: 'water', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 60 * 30, rows: 0, apiCalls: 0, error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
