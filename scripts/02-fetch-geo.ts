/**
 * Fase 0 · paso 2 — Coordenadas de los 947 municipios.
 *
 * `wpyq-we8x` (Caps de municipi georeferenciats) es la fuente primaria: da el
 * punto del núcleo cabecera, que es lo que queremos para la predicción — no el
 * centroide del término municipal, que a menudo cae en un bosque.
 * `9aju-tpwc` se usa solo como respaldo para lo que falte.
 *
 * Salida: data/raw/municipis-geo.json
 */
import { writeFileSync } from 'node:fs';
import { DATASETS, soqlAll } from './lib/socrata.ts';
import { ensureDirs, raw } from './lib/paths.ts';

interface CapMunicipi {
  codi_municipi: string;      // '250766' (6 dígitos, igual que codi_ine del nomenclátor)
  codi_municipi_ine: string;  // '25076'
  municipi: string;
  municipi_forma_indexada: string;
  comarca: string;
  codi_comarca: string;
  abreviatura_comarca?: string;
  prov_ncia?: string;
  codi_prov_ncia?: string;
  latitud: string;
  longitud: string;
}

interface MunicipiGeo {
  codi: string;
  nom: string;
  codi_comarca: string;
  nom_comarca: string;
  latitud: string;
  longitud: string;
}

export interface MunicipiPoint {
  codi: string;        // 6 dígitos
  codiIne5: string;    // 5 dígitos, el que usa AEMET
  nom: string;
  nomIndexat: string;
  comarcaCodi: string;
  comarcaNom: string;
  provincia?: string;
  lat: number;
  lon: number;
  source: 'cap-municipi' | 'centroide';
}

async function main() {
  ensureDirs();

  const caps = await soqlAll<CapMunicipi>(DATASETS.capsMunicipi, { order: 'codi_municipi' });
  console.log(`Caps de municipi: ${caps.length}`);

  const byCodi = new Map<string, MunicipiPoint>();
  for (const c of caps) {
    if (!c.latitud || !c.longitud) continue;
    byCodi.set(c.codi_municipi, {
      codi: c.codi_municipi,
      codiIne5: c.codi_municipi_ine,
      nom: c.municipi,
      nomIndexat: c.municipi_forma_indexada,
      comarcaCodi: c.codi_comarca.padStart(2, '0'),
      comarcaNom: c.comarca,
      provincia: c.prov_ncia,
      lat: Number(c.latitud),
      lon: Number(c.longitud),
      source: 'cap-municipi',
    });
  }
  console.log(`  con coordenadas: ${byCodi.size}`);

  // Respaldo: centroides, solo para lo que no cubra la fuente primaria.
  // El dataset de centroides incluye dos filas que no son municipios reales
  // ('999998 No consta' y '999999 Altres/Diversos'); hay que descartarlas o
  // acabamos con 949 municipios y tres comarcas fantasma.
  const centroides = await soqlAll<MunicipiGeo>(DATASETS.municipisGeo, { order: 'codi' });
  let filled = 0;
  for (const m of centroides) {
    if (m.codi.startsWith('9999')) continue;
    if (byCodi.has(m.codi) || !m.latitud || !m.longitud) continue;
    byCodi.set(m.codi, {
      codi: m.codi,
      codiIne5: m.codi.slice(0, 5),
      nom: m.nom,
      nomIndexat: m.nom,
      comarcaCodi: m.codi_comarca.padStart(2, '0'),
      comarcaNom: m.nom_comarca,
      lat: Number(m.latitud),
      lon: Number(m.longitud),
      source: 'centroide',
    });
    filled++;
  }
  if (filled) console.log(`  completados con centroide: ${filled}`);

  const municipis = [...byCodi.values()].sort((a, b) => a.codi.localeCompare(b.codi));

  // Comarcas derivadas: código, nombre y número de municipios.
  const comarques = new Map<string, { codi: string; nom: string; municipis: number }>();
  for (const m of municipis) {
    const c = comarques.get(m.comarcaCodi) ?? { codi: m.comarcaCodi, nom: m.comarcaNom, municipis: 0 };
    c.municipis++;
    comarques.set(m.comarcaCodi, c);
  }

  console.log(`\nMunicipios con punto: ${municipis.length} / 947`);
  console.log(`Comarcas: ${comarques.size}`);

  const sinPunto = 947 - municipis.length;
  if (sinPunto > 0) console.warn(`  ATENCIÓN: ${sinPunto} municipios sin coordenada`);

  // Este dataset está al día y el Nomenclàtor (edición 2021) no: el Lluçanès se
  // creó en 2023 segregando municipios de Osona, el Berguedà y el Bages. Por eso
  // la comarca la manda esta fuente, no el Nomenclàtor.
  const llucanes = municipis.filter((m) => m.comarcaCodi === '43');
  if (llucanes.length) {
    console.log(`\nComarca 43 · ${llucanes[0].comarcaNom}: ${llucanes.length} municipios`);
    console.log(`  ${llucanes.map((m) => m.nom).join(', ')}`);
  }

  const out = raw('municipis-geo.json');
  writeFileSync(
    out,
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      municipis,
      comarques: [...comarques.values()].sort((a, b) => a.codi.localeCompare(b.codi)),
    }),
    'utf8',
  );
  console.log(`\n→ ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
