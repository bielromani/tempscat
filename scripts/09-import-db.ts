/**
 * Fase 0 · paso 8 (opcional) — Carga el territorio construido en PostgreSQL.
 *
 * No es necesario para que la aplicación funcione: el territorio es estático y
 * los JSON de `data/build/` bastan. Este paso existe para cuando llegue la
 * fase 1 y haga falta cruzar el territorio con series temporales dentro del
 * mismo motor (consultas espaciales, agregados por comarca, ránquings).
 *
 * Uso:
 *   DATABASE_URL=postgres://… npm run data:import
 *
 * Requiere `pg` instalado y la migración 001 aplicada:
 *   psql $DATABASE_URL -f db/migrations/001_territory.sql
 */
import { readFileSync } from 'node:fs';
import { build } from './lib/paths.ts';

interface Comarca {
  codi: string; nom: string; slug: string; path: string;
  lat: number; lon: number; nMunicipis: number; poblacio: number;
  altitudMin: number | null; altitudMax: number | null;
}

interface Location {
  id: string; level: string; parentId: string | null; comarcaCodi: string;
  municipiCodi?: string; municipiIne5?: string;
  nom: string; nomIndexat: string; slug: string; path: string;
  lat: number | null; lon: number | null; altitud: number | null;
  geocodeSource: string | null; geocodeConfidence: number;
  poblacio: number | null;
  stationRef?: { codi: string; distKm: number; dAltM: number | null };
  tier: string; published: boolean; canonicalOf?: string; reason?: string;
}

interface StationOut {
  codi: string; nom: string; slug: string; lat: number; lon: number;
  altitud: number | null; emplacament?: string; municipiIne5?: string;
  municipiNom?: string; comarcaCodi?: string; operativa: boolean;
  estat?: string; dataInici?: string; dataFi?: string;
}

interface Neighbour {
  locationId: string; neighbourId: string; relation: string; distKm: number; rank: number;
}

/** Comarcas del Pirineo y Prepirineo: activan la vertical de nieve. */
const PIRINENQUES = new Set(['Alta Ribagorça', 'Alt Urgell', 'Aran', 'Berguedà', 'Cerdanya',
  'Pallars Jussà', 'Pallars Sobirà', 'Ripollès', 'Solsonès']);
/** Comarcas con litoral: activan la vertical de mar y playas. */
const COSTANERES = new Set(['Alt Empordà', 'Baix Empordà', 'Gironès', 'Selva', 'Maresme',
  'Barcelonès', 'Baix Llobregat', 'Garraf', 'Baix Penedès', 'Tarragonès', 'Baix Camp',
  'Baix Ebre', 'Montsià']);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DATABASE_URL. Este paso es opcional en la fase 0:');
    console.error('la aplicación funciona leyendo data/build/ directamente.');
    process.exit(1);
  }

  // `pg` se importa aquí y no arriba para que el resto del pipeline no dependa
  // de él: quien solo quiera construir los JSON no necesita instalarlo.
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const comarques: Comarca[] = JSON.parse(readFileSync(build('comarques.json'), 'utf8'));
  const locations: Location[] = JSON.parse(readFileSync(build('locations.json'), 'utf8'));
  const stations: StationOut[] = JSON.parse(readFileSync(build('stations.json'), 'utf8'));
  const neighbours: Neighbour[] = JSON.parse(readFileSync(build('neighbours.json'), 'utf8'));

  try {
    await client.query('BEGIN');

    // Orden inverso a las dependencias de clave foránea.
    await client.query('TRUNCATE location_neighbour, location, station, comarca CASCADE');

    for (const c of comarques) {
      await client.query(
        `INSERT INTO comarca (codi, nom, slug, path, centroid, n_municipis, poblacio,
                              altitud_min, altitud_max, es_pirinenca, es_costanera)
         VALUES ($1,$2,$3,$4, ST_MakePoint($5,$6)::geography, $7,$8,$9,$10,$11,$12)`,
        [c.codi, c.nom, c.slug, c.path, c.lon, c.lat, c.nMunicipis, c.poblacio,
         c.altitudMin, c.altitudMax, PIRINENQUES.has(c.nom), COSTANERES.has(c.nom)],
      );
    }
    console.log(`comarca            ${comarques.length}`);

    for (const s of stations) {
      await client.query(
        `INSERT INTO station (codi, nom, slug, point, altitud, emplacament, municipi_ine5,
                              municipi_nom, comarca_codi, operativa, estat, data_inici, data_fi)
         VALUES ($1,$2,$3, ST_MakePoint($4,$5)::geography, $6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [s.codi, s.nom, s.slug, s.lon, s.lat, s.altitud, s.emplacament ?? null,
         s.municipiIne5 ?? null, s.municipiNom ?? null, s.comarcaCodi ?? null,
         s.operativa, s.estat ?? null, s.dataInici ?? null, s.dataFi ?? null],
      );
    }
    console.log(`station            ${stations.length}`);

    // Dos vueltas: primero sin `parent_id`, luego se rellena. Así no importa el
    // orden y no hace falta ordenar topológicamente la jerarquía.
    for (const l of locations) {
      await client.query(
        `INSERT INTO location (id, level, comarca_codi, municipi_codi, municipi_ine5,
                               nom, nom_indexat, slug, path, point, altitud,
                               geocode_source, geocode_confidence, poblacio,
                               station_ref_codi, station_ref_dist_km, station_ref_dalt_m,
                               tier, published, canonical_path, unpublished_reason)
         VALUES ($1,$2::location_level,$3,$4,$5,$6,$7,$8,$9,
                 CASE WHEN $10::float8 IS NULL THEN NULL ELSE ST_MakePoint($10,$11)::geography END,
                 $12,$13::geocode_source,$14,$15,$16,$17,$18,$19::index_tier,$20,$21,$22)`,
        [l.id, l.level, l.comarcaCodi, l.municipiCodi ?? null, l.municipiIne5 ?? null,
         l.nom, l.nomIndexat, l.slug, l.path, l.lon, l.lat, l.altitud,
         l.geocodeSource, l.geocodeConfidence, l.poblacio,
         l.stationRef?.codi ?? null, l.stationRef?.distKm ?? null, l.stationRef?.dAltM ?? null,
         l.tier, l.published, l.canonicalOf ?? null, l.reason ?? null],
      );
    }
    // Las comarcas no están en `location`, así que los municipios (cuyo padre es
    // una comarca) se quedan con parent_id nulo, que es lo correcto.
    for (const l of locations) {
      if (!l.parentId || l.parentId.startsWith('C')) continue;
      await client.query('UPDATE location SET parent_id = $2 WHERE id = $1', [l.id, l.parentId]);
    }
    console.log(`location           ${locations.length}`);

    for (const n of neighbours) {
      await client.query(
        `INSERT INTO location_neighbour (location_id, neighbour_id, relation, distance_km, rank)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [n.locationId, n.neighbourId, n.relation, n.distKm, n.rank],
      );
    }
    console.log(`location_neighbour ${neighbours.length}`);

    await client.query('COMMIT');
    console.log('\nImportación completada.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
