/**
 * Fase 0 · paso 1 — Nomenclàtor estadístic d'entitats i nuclis de població.
 *
 * Es la columna vertebral del proyecto: de aquí salen los 947 municipios, las
 * ~3.900 entidades singulares y los ~6.100 núcleos. Sin esto no hay territorio.
 *
 * Salida: data/raw/nomenclator.json
 */
import { writeFileSync } from 'node:fs';
import { DATASETS, soqlAll, views, count } from './lib/socrata.ts';
import { ensureDirs, raw } from './lib/paths.ts';

export interface NomenclatorRow {
  codi_ine: string;            // '430862' — municipio (INE + dígito de control)
  entitat_colectiva: string;   // '00'
  entitat_singular: string;    // '02'
  digit_control: string;       // '2'
  nucli_poblacio: string;      // '01', '99' = diseminado
  nom_normalitzat: string;     // 'Lilla' o 'Guàrdia dels Prats, la'
  codi_13: string;             // '4308620002201'
  nom_municipi: string;
  codi_comarca: string;
  nom_comarca: string;
  homes?: string;
  dones?: string;
  poblaci?: string;
  any: string;
}

async function main() {
  ensureDirs();

  const meta = await views(DATASETS.nomenclator);
  const total = await count(DATASETS.nomenclator);
  console.log(`Dataset: ${meta.name}`);
  console.log(`Actualizado: ${new Date(meta.rowsUpdatedAt * 1000).toISOString()}`);
  console.log(`Filas declaradas: ${total.toLocaleString('es-ES')}\n`);

  const rows = await soqlAll<NomenclatorRow>(
    DATASETS.nomenclator,
    { order: 'codi_13' },
    { onProgress: (n) => process.stdout.write(`\r  descargadas ${n.toLocaleString('es-ES')} filas`) },
  );
  process.stdout.write('\n');

  if (rows.length !== total) {
    throw new Error(`Se esperaban ${total} filas y llegaron ${rows.length}. Paginación incompleta.`);
  }

  // El dataset solo publica una edición; si algún día trae varias, quedarnos
  // con la más reciente en vez de mezclar años silenciosamente.
  const years = [...new Set(rows.map((r) => r.any))].sort();
  const latest = years[years.length - 1];
  const kept = rows.filter((r) => r.any === latest);
  if (years.length > 1) {
    console.log(`Años presentes: ${years.join(', ')} → se usa ${latest} (${kept.length} filas)`);
  } else {
    console.log(`Edición: ${latest}`);
  }

  // Desglose por nivel, para verificar contra las cifras conocidas.
  const level = (r: NomenclatorRow) => {
    if (r.entitat_colectiva === '00' && r.entitat_singular === '00') return 'municipi';
    if (r.entitat_singular === '00') return 'entitat_colectiva';
    if (r.nucli_poblacio === '00') return 'entitat_singular';
    if (r.nucli_poblacio === '99') return 'disseminat';
    return 'nucli';
  };
  const tally = new Map<string, number>();
  for (const r of kept) tally.set(level(r), (tally.get(level(r)) ?? 0) + 1);

  console.log('\nDesglose por nivel:');
  for (const [k, v] of [...tally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${String(v).padStart(6)}`);
  }
  console.log(`  ${'comarques'.padEnd(20)} ${String(new Set(kept.map((r) => r.codi_comarca)).size).padStart(6)}`);

  const out = raw('nomenclator.json');
  writeFileSync(out, JSON.stringify({ edition: latest, fetchedAt: new Date().toISOString(), rows: kept }), 'utf8');
  console.log(`\n→ ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
