/**
 * Fase 0 · paso 4 — Estaciones XEMA y catálogo de variables.
 *
 * Las 245 estaciones automáticas del Meteocat son la observación real del
 * proyecto. Se descargan del portal de datos abiertos (licencia redistribuible),
 * no de la API oficial, cuyo plan gratuito prohíbe difundir a terceros.
 *
 * Salida: data/raw/stations.json
 */
import { writeFileSync } from 'node:fs';
import { DATASETS, soqlAll, views } from './lib/socrata.ts';
import { ensureDirs, raw } from './lib/paths.ts';

interface StationRow {
  codi_estacio: string;
  nom_estacio: string;
  codi_tipus?: string;
  latitud: string;
  longitud: string;
  emplacament?: string;
  altitud?: string;
  codi_municipi?: string;   // 5 dígitos INE, sin dígito de control
  nom_municipi?: string;
  codi_comarca?: string;
  nom_comarca?: string;
  codi_provincia?: string;
  nom_provincia?: string;
  codi_xarxa?: string;
  nom_xarxa?: string;
  codi_estat_ema?: string;
  nom_estat_ema?: string;   // 'Operativa' | 'Desmantellada'
  data_inici?: string;
  data_fi?: string;
}

interface VariableRow {
  codi_variable: string;
  nom_variable: string;
  unitat: string;
  acronim?: string;
  codi_tipus_variable?: string;
  decimals?: string;
}

export interface Station {
  codi: string;
  nom: string;
  lat: number;
  lon: number;
  altitud: number | null;
  emplacament?: string;
  municipiIne5?: string;
  municipiNom?: string;
  comarcaCodi?: string;
  comarcaNom?: string;
  xarxa?: string;
  operativa: boolean;
  estat?: string;
  dataInici?: string;
  dataFi?: string;
}

export interface Variable {
  codi: string;
  nom: string;
  unitat: string;
  acronim?: string;
  decimals: number;
  /** true si al agregar hay que sumar (precipitación) en vez de promediar. */
  acumulada: boolean;
}

/** Variables que se acumulan en vez de promediarse al agregar por hora o día. */
const ACCUMULATED = /precipitaci|pluj/i;

async function main() {
  ensureDirs();

  const metaEst = await views(DATASETS.estacions);
  console.log(`${metaEst.name} — actualizado ${new Date(metaEst.rowsUpdatedAt * 1000).toISOString()}`);

  const rows = await soqlAll<StationRow>(DATASETS.estacions, { order: 'codi_estacio' });
  const stations: Station[] = rows
    .filter((r) => r.latitud && r.longitud)
    .map((r) => ({
      codi: r.codi_estacio,
      nom: r.nom_estacio,
      lat: Number(r.latitud),
      lon: Number(r.longitud),
      altitud: r.altitud ? Number(r.altitud) : null,
      emplacament: r.emplacament,
      municipiIne5: r.codi_municipi,
      municipiNom: r.nom_municipi,
      comarcaCodi: r.codi_comarca?.padStart(2, '0'),
      comarcaNom: r.nom_comarca,
      xarxa: r.nom_xarxa,
      operativa: r.nom_estat_ema === 'Operativa',
      estat: r.nom_estat_ema,
      dataInici: r.data_inici?.slice(0, 10),
      dataFi: r.data_fi?.slice(0, 10),
    }));

  const operatives = stations.filter((s) => s.operativa);
  console.log(`\nEstaciones: ${stations.length} (${operatives.length} operativas)`);

  const byEstat = new Map<string, number>();
  for (const s of stations) byEstat.set(s.estat ?? '?', (byEstat.get(s.estat ?? '?') ?? 0) + 1);
  for (const [k, v] of [...byEstat].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${v}`);

  const alts = operatives.map((s) => s.altitud).filter((a): a is number => a != null);
  console.log(`\nAltitud de las operativas: ${Math.min(...alts)} m – ${Math.max(...alts)} m`);
  const altas = operatives.filter((s) => (s.altitud ?? 0) >= 1500).sort((a, b) => (b.altitud ?? 0) - (a.altitud ?? 0));
  console.log(`Por encima de 1.500 m (vertical nieve): ${altas.length}`);
  for (const s of altas.slice(0, 8)) console.log(`  ${String(s.altitud).padStart(5)} m  ${s.nom}`);

  const varRows = await soqlAll<VariableRow>(DATASETS.variables, { order: 'codi_variable' });
  const variables: Variable[] = varRows.map((v) => ({
    codi: v.codi_variable,
    nom: v.nom_variable,
    unitat: v.unitat,
    acronim: v.acronim,
    decimals: v.decimals ? Number(v.decimals) : 1,
    acumulada: ACCUMULATED.test(v.nom_variable),
  }));
  console.log(`\nVariables: ${variables.length} (${variables.filter((v) => v.acumulada).length} acumuladas)`);
  for (const v of variables.filter((x) => ['32', '33', '35', '30', '31', '34'].includes(x.codi))) {
    console.log(`  ${v.codi.padStart(3)}  ${v.nom.slice(0, 44).padEnd(46)} ${v.unitat}`);
  }

  const out = raw('stations.json');
  writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), stations, variables }), 'utf8');
  console.log(`\n→ ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
