import 'server-only';
import { comarquesGeoJson } from './territory';
import { project, type TileGrid } from './mercator';

/**
 * Les zones del radar.
 *
 * ## Per què zones i no zoom lliure
 *
 * Perquè no hi ha més resolució. El tilecache públic de RainViewer arriba al
 * zoom 7 — del 8 en amunt retorna un cartell que diu «Zoom Level Not
 * Supported» amb codi 200 i tipus `image/png`, així que ni tan sols falla de
 * manera visible. Al zoom 7 amb tessel·les de 512 píxels, un píxel són uns
 * **460 metres** a la latítud de Catalunya.
 *
 * Amb això, una comarca de trenta quilòmetres són seixanta-cinc píxels: ampliada
 * a l'amplada d'una pantalla és una taca. Una zona de cent-cinquanta, en canvi,
 * es llegeix. Així que s'ofereix el que la imatge aguanta i prou.
 *
 * ## Per què les caixes no són a ull
 *
 * Cada zona és una llista de comarques, i la seva caixa surt de la
 * **geometria de l'ICGC** — la mateixa que dibuixa les fronteres a sobre. Posar
 * quatre coordenades a ull hauria estat més ràpid i hauria deixat mitja comarca
 * fora sense que es notes.
 *
 * Les agrupacions sí són nostres, i per tant es diuen pel nom geogràfic que fa
 * servir la gent i no com si fossin una divisió oficial. Cada comarca és
 * exactament a una zona, i això es comprova a `radarZones()`.
 */

export interface RadarZone {
  key: string;
  label: string;
  comarques: string[];
}

const ZONES: RadarZone[] = [
  {
    key: 'pirineu',
    label: 'Pirineu i Aran',
    comarques: ['39', '26', '05', '15', '04', '25', '31', '14'],
  },
  {
    key: 'girona',
    label: 'Girona i Costa Brava',
    comarques: ['02', '10', '20', '28', '19', '34'],
  },
  {
    key: 'central',
    label: 'Catalunya central',
    comarques: ['24', '43', '42', '07', '06', '32', '35'],
  },
  {
    key: 'ponent',
    label: 'Ponent',
    comarques: ['33', '23', '27', '38', '18'],
  },
  {
    key: 'barcelona',
    label: 'Barcelona i el Penedès',
    comarques: ['13', '11', '40', '41', '21', '03', '12', '17'],
  },
  {
    key: 'tarragona',
    label: "Tarragona i l'Ebre",
    comarques: ['36', '08', '01', '16', '29', '30', '37', '09', '22'],
  },
];

export interface ZoneView {
  key: string;
  label: string;
  /** Rectangle en unitats del mosaic, ja projectat i amb marge. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Marge al voltant de la zona, en tant per u del seu costat més llarg. */
const PAD = 0.06;

let memo: { key: string; zones: ZoneView[] } | null = null;

/**
 * Les zones amb la seva caixa projectada, més Catalunya sencera al davant.
 *
 * `full` és el retall de sempre: el mosaic cobreix fins a Mallorca per l'est i
 * no té sentit ensenyar-ho.
 */
export function radarZones(grid: TileGrid, full: ZoneView): ZoneView[] {
  const memoKey = `${grid.z}:${grid.x0}:${grid.y0}:${grid.size}`;
  if (memo?.key === memoKey) return memo.zones;

  const geo = comarquesGeoJson();
  const boxes = new Map<string, { lo: number[]; hi: number[] }>();
  for (const f of geo.features) {
    const code = String(f.properties.code);
    let minLon = Infinity; let minLat = Infinity;
    let maxLon = -Infinity; let maxLat = -Infinity;
    for (const polygon of f.geometry.coordinates) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
    boxes.set(code, { lo: [minLon, minLat], hi: [maxLon, maxLat] });
  }

  /*
   * Cada comarca a una zona i només a una.
   *
   * Es llança i no s'avisa: una comarca oblidada vol dir una zona amb mitja
   * comarca tallada, i una repetida vol dir una caixa més gran del que sembla.
   * Cap de les dues es veu mirant el mapa.
   */
  const seen = new Set<string>();
  for (const z of ZONES) {
    for (const c of z.comarques) {
      if (!boxes.has(c)) throw new Error(`zona ${z.key}: la comarca ${c} no existeix`);
      if (seen.has(c)) throw new Error(`la comarca ${c} és a més d'una zona del radar`);
      seen.add(c);
    }
  }
  if (seen.size !== boxes.size) {
    const missing = [...boxes.keys()].filter((c) => !seen.has(c));
    throw new Error(`comarques sense zona de radar: ${missing.join(', ')}`);
  }

  const zones: ZoneView[] = [full];
  for (const z of ZONES) {
    let minLon = Infinity; let minLat = Infinity;
    let maxLon = -Infinity; let maxLat = -Infinity;
    for (const c of z.comarques) {
      const b = boxes.get(c)!;
      minLon = Math.min(minLon, b.lo[0]);
      minLat = Math.min(minLat, b.lo[1]);
      maxLon = Math.max(maxLon, b.hi[0]);
      maxLat = Math.max(maxLat, b.hi[1]);
    }
    // Nord-oest i sud-est: a Mercator la y creix cap al sud.
    const [x0, y0] = project(grid, minLon, maxLat);
    const [x1, y1] = project(grid, maxLon, minLat);
    const pad = Math.max(x1 - x0, y1 - y0) * PAD;
    zones.push({
      key: z.key,
      label: z.label,
      x: x0 - pad,
      y: y0 - pad,
      w: (x1 - x0) + pad * 2,
      h: (y1 - y0) + pad * 2,
    });
  }

  memo = { key: memoKey, zones };
  return zones;
}
