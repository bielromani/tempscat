/**
 * Worker · avisos meteorológicos oficiales de AEMET.
 *
 * Es el dato más delicado del sitio: un aviso mal presentado no es un fallo de
 * diseño, es un riesgo de seguridad. Reglas:
 *
 *  · **Nunca se modifica el nivel ni el texto.** Se muestran tal cual, con el
 *    organismo emisor, la hora de emisión y enlace al original.
 *  · Los avisos en verde **no se muestran**: verde significa "sin aviso", y
 *    enseñarlo como si fuera algo sería ruido que resta a los que sí importan.
 *  · La asignación a cada ubicación se hace por **geometría**, no por nombre de
 *    zona: los polígonos de AEMET no siguen los límites comarcales.
 *
 * Requiere AEMET_API_KEY. El token caduca a los 90 días.
 *
 * Salida: data/cache/warnings.json
 */
import { readFileSync } from 'node:fs';
import { fetchJson, fetchWithRetry, sleep } from '../lib/http.ts';
import { build } from '../lib/paths.ts';
import { readTar } from '../lib/tar.ts';
import { parseCap, type CapAlert, type CapLevel } from '../lib/cap.ts';
import { pointInRing, ringBbox } from '../lib/geo.ts';
import {
  DAILY_LIMITS, QuotaGuard, publish, recordFreshness, syncState, writeSnapshot,
} from '../lib/store.ts';

/** Código de área de AEMET Meteoalerta para Catalunya. Verificado. */
const AREA_CATALUNYA = '69';
const BASE = 'https://opendata.aemet.es/opendata/api';

interface Location {
  id: string; path: string; nom: string;
  lat: number | null; lon: number | null;
  comarcaCodi: string; published: boolean;
}

export interface StoredWarning extends Omit<CapAlert, 'areas'> {
  /** Zonas nombradas que cubre, para el texto. */
  zones: string[];
  /** Ubicaciones afectadas, resueltas por geometría. */
  locationIds: string[];
  comarcaCodis: string[];
}

const LEVEL_ORDER: Record<CapLevel, number> = { verd: 0, groc: 1, taronja: 2, vermell: 3 };

async function main() {
  const key = process.env.AEMET_API_KEY;
  if (!key) {
    console.error('Falta AEMET_API_KEY. Copia .env.example a .env.local y pon la clave.');
    console.error('Se consigue gratis y al instante en opendata.aemet.es; caduca a los 90 días.');
    process.exit(1);
  }

  // El comptador de quota i el registre de frescor viuen al magatzem:
  // sense això, cada execució automàtica començaria de zero i en
  // publicaria un amb una sola entrada. Abans de construir el guardià.
  await syncState();
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  /*
   * AEMET responde en dos saltos: primero una URL temporal, luego el contenido.
   *
   * Y **el estado va dentro del cuerpo, no en el HTTP**: cuando están saturados
   * devuelven `200 OK` con `{"estado": 429, "descripcion": "Too Many
   * Requests"}` o con un 500 ahí dentro. `fetchWithRetry` ve el 200, no
   * reintenta, y el worker se planta — que es lo que le pasó a la ejecución de
   * las 09:15 del 3 de septiembre de 2026 y a unas cuantas más.
   *
   * Así que el reintento se hace aquí, mirando el estado de verdad. Cuatro
   * intentos con espera creciente; si a la cuarta sigue saturado, es que pasa
   * algo suyo y entonces sí que vale la pena que salte.
   */
  interface AemetMeta { estado: number; datos?: string; descripcion: string }
  let meta: AemetMeta | null = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    meta = await fetchJson<AemetMeta>(
      `${BASE}/avisos_cap/ultimoelaborado/area/${AREA_CATALUNYA}`,
      { headers: { api_key: key }, timeoutMs: 40_000 },
    );
    quota.spend('aemet', 1);
    if (meta.datos) break;

    console.log(`  AEMET diu ${meta.estado} ${meta.descripcion} (intent ${attempt} de 4)`);
    if (attempt < 4) await sleep(attempt * 5_000);
  }

  if (!meta?.datos) {
    throw new Error(
      `AEMET no ha donat dades en quatre intents: ${meta?.estado} ${meta?.descripcion}. `
      + 'L\'estat va dins del cos de la resposta, no a l\'HTTP.',
    );
  }

  const res = await fetchWithRetry(meta.datos, { timeoutMs: 90_000 });
  const tar = Buffer.from(await res.arrayBuffer());
  quota.spend('aemet', 1);

  const files = readTar(tar).filter((f) => f.name.endsWith('.xml'));
  console.log(`Fitxers CAP: ${files.length}`);

  const alerts = files
    .map((f) => parseCap(f.content.toString('utf8')))
    .filter((a): a is CapAlert => a !== null);

  const byLevel = new Map<CapLevel, number>();
  for (const a of alerts) byLevel.set(a.level, (byLevel.get(a.level) ?? 0) + 1);
  console.log(`Avisos llegits: ${alerts.length} · ${[...byLevel].map(([l, n]) => `${l}=${n}`).join(' · ')}`);

  // Verde = sin aviso. No se guarda: ocuparía la interfaz sin decir nada.
  const active = alerts.filter((a) => LEVEL_ORDER[a.level] > 0 && Date.parse(a.expires) > Date.now());
  console.log(`Actius i per damunt de verd: ${active.length}`);

  const locations: Location[] = JSON.parse(readFileSync(build('locations.json'), 'utf8'));
  const published = locations.filter((l) => l.published && l.lat != null && l.lon != null);

  const stored: StoredWarning[] = active.map((a) => {
    const ids = new Set<string>();
    const comarques = new Set<string>();

    for (const area of a.areas) {
      for (const ring of area.polygons) {
        const [minX, minY, maxX, maxY] = ringBbox(ring);
        for (const loc of published) {
          // Descarte rápido por caja antes del cruce de rayos.
          if (loc.lon! < minX || loc.lon! > maxX || loc.lat! < minY || loc.lat! > maxY) continue;
          if (pointInRing(loc.lon!, loc.lat!, ring)) {
            ids.add(loc.id);
            comarques.add(loc.comarcaCodi);
          }
        }
      }
    }

    const { areas, ...rest } = a;
    return {
      ...rest,
      zones: areas.map((x) => x.desc),
      locationIds: [...ids],
      comarcaCodis: [...comarques],
    };
  });

  for (const w of stored) {
    console.log(`  [${w.level}] ${w.event}`);
    console.log(`      ${w.onset.slice(0, 16).replace('T', ' ')} → ${w.expires.slice(0, 16).replace('T', ' ')}`);
    console.log(`      ${w.locationIds.length} ubicacions · ${w.comarcaCodis.length} comarques`);
    if (w.threshold) console.log(`      llindar: ${w.threshold}`);
  }

  if (!stored.length) {
    console.log('\nCap avís actiu per damunt de verd. La franja d\'avisos no es mostrarà.');
  }

  const newest = alerts.length
    ? alerts.map((a) => a.sent).sort().at(-1)!
    : null;

  writeSnapshot('warnings', 'AEMET · avisos oficials', stored, newest);
  recordFreshness({
    source: 'aemet-warnings',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: newest,
    /*
     * Trenta hores, i no tres.
     *
     * El limit es mesura contra la data de la **dada**, no contra l ultima
     * execucio, i la dada aqui es l hora en que AEMET va elaborar el lot de
     * CAP: ho fa un o dos cops al dia. Amb tres hores, /estat deia
     * 'endarrerida' la major part del dia amb el worker acabat de passar --el
     * mateix error que ja va passar amb els records de la XEMA-- i un rètol que
     * sempre esta en roig deixa d avisar de res.
     *
     * Trenta hores es el cicle diari amb marge. Si AEMET no elabora avisos en
     * trenta hores, alla passa alguna cosa i val la pena dir-ho.
     */
    stalenessLimitMin: 30 * 60,
    rows: alerts.length,
    apiCalls: 2,
  });

  console.log(`\n${quota.report()}`);
  console.log(`→ data/cache/warnings.json (${((Date.now() - started) / 1000).toFixed(1)} s)`);

  const pub = await publish();
  if (!pub.skipped) {
    console.log(`Publicat a l'emmagatzematge: ${pub.uploaded} fitxers · ${(pub.bytes / 1048576).toFixed(1)} MB`);
  }
}

main().catch((err) => {
  recordFreshness({
    source: 'aemet-warnings', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 30 * 60, rows: 0, apiCalls: 0, error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
