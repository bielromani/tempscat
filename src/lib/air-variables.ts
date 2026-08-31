/**
 * Catálogo de variables de calidad del aire.
 *
 * Va en su propio fichero y no en variables.ts porque es **otra API y otra
 * cuota**: air-quality-api.open-meteo.com no comparte contador con la de
 * predicción, y eso es justamente lo que hace viable añadir el bloque sin tocar
 * el reparto de modelos por nivel, que ya va justo.
 *
 * Fuente: CAMS Europa, 0,1° de resolución. De ahí que la unidad de consulta sea
 * la celda y no la ubicación — ver air-grid.ts.
 *
 * Misma restricción que variables.ts: **no importa nada**, porque lo cargan el
 * worker (con extensión .ts explícita) y la aplicación (con el alias @/).
 */

export type AirSlug =
  | 'aqi' | 'pm2_5' | 'pm10' | 'no2' | 'o3' | 'so2' | 'co' | 'dust'
  | 'aqi_pm2_5' | 'aqi_pm10' | 'aqi_no2' | 'aqi_o3'
  | 'pollen_grass' | 'pollen_olive' | 'pollen_birch' | 'pollen_alder'
  | 'pollen_mugwort' | 'pollen_ragweed';

export interface AirVariableDef {
  slug: AirSlug;
  openMeteo: string;
  unit: string;
  decimals: number;
  nom: { ca: string; es: string };
  /** Nombre corto, para etiquetas de tabla. */
  curt?: string;
  /** Los subíndices del AQI no se muestran como cifra: dicen qué contaminante manda. */
  subIndex?: boolean;
  pollen?: boolean;
}

export const AIR_VARIABLES: Record<AirSlug, AirVariableDef> = {
  aqi: {
    slug: 'aqi', openMeteo: 'european_aqi', unit: 'EAQI', decimals: 0,
    nom: { ca: 'Índex europeu de qualitat de l’aire', es: 'Índice europeo de calidad del aire' },
    curt: 'AQI',
  },
  pm2_5: {
    slug: 'pm2_5', openMeteo: 'pm2_5', unit: 'µg/m³', decimals: 1,
    nom: { ca: 'Partícules fines PM2,5', es: 'Partículas finas PM2,5' }, curt: 'PM2,5',
  },
  pm10: {
    slug: 'pm10', openMeteo: 'pm10', unit: 'µg/m³', decimals: 1,
    nom: { ca: 'Partícules PM10', es: 'Partículas PM10' }, curt: 'PM10',
  },
  no2: {
    slug: 'no2', openMeteo: 'nitrogen_dioxide', unit: 'µg/m³', decimals: 1,
    nom: { ca: 'Diòxid de nitrogen', es: 'Dióxido de nitrógeno' }, curt: 'NO₂',
  },
  o3: {
    slug: 'o3', openMeteo: 'ozone', unit: 'µg/m³', decimals: 0,
    nom: { ca: 'Ozó troposfèric', es: 'Ozono troposférico' }, curt: 'O₃',
  },
  so2: {
    slug: 'so2', openMeteo: 'sulphur_dioxide', unit: 'µg/m³', decimals: 1,
    nom: { ca: 'Diòxid de sofre', es: 'Dióxido de azufre' }, curt: 'SO₂',
  },
  co: {
    slug: 'co', openMeteo: 'carbon_monoxide', unit: 'µg/m³', decimals: 0,
    nom: { ca: 'Monòxid de carboni', es: 'Monóxido de carbono' }, curt: 'CO',
  },
  dust: {
    // Polvo mineral: en Catalunya son las intrusiones saharianas, que suben el
    // PM10 durante días y no tienen nada que ver con el tráfico. Separarlo evita
    // atribuir a la ciudad un episodio que viene de África.
    slug: 'dust', openMeteo: 'dust', unit: 'µg/m³', decimals: 0,
    nom: { ca: 'Pols mineral', es: 'Polvo mineral' }, curt: 'Pols',
  },

  aqi_pm2_5: {
    slug: 'aqi_pm2_5', openMeteo: 'european_aqi_pm2_5', unit: 'EAQI', decimals: 0,
    nom: { ca: 'Subíndex PM2,5', es: 'Subíndice PM2,5' }, curt: 'PM2,5', subIndex: true,
  },
  aqi_pm10: {
    slug: 'aqi_pm10', openMeteo: 'european_aqi_pm10', unit: 'EAQI', decimals: 0,
    nom: { ca: 'Subíndex PM10', es: 'Subíndice PM10' }, curt: 'PM10', subIndex: true,
  },
  aqi_no2: {
    slug: 'aqi_no2', openMeteo: 'european_aqi_nitrogen_dioxide', unit: 'EAQI', decimals: 0,
    nom: { ca: 'Subíndex NO₂', es: 'Subíndice NO₂' }, curt: 'NO₂', subIndex: true,
  },
  aqi_o3: {
    slug: 'aqi_o3', openMeteo: 'european_aqi_ozone', unit: 'EAQI', decimals: 0,
    nom: { ca: 'Subíndex ozó', es: 'Subíndice ozono' }, curt: 'O₃', subIndex: true,
  },

  pollen_grass: {
    slug: 'pollen_grass', openMeteo: 'grass_pollen', unit: 'grans/m³', decimals: 0,
    nom: { ca: 'Gramínies', es: 'Gramíneas' }, pollen: true,
  },
  pollen_olive: {
    slug: 'pollen_olive', openMeteo: 'olive_pollen', unit: 'grans/m³', decimals: 0,
    nom: { ca: 'Olivera', es: 'Olivo' }, pollen: true,
  },
  pollen_birch: {
    slug: 'pollen_birch', openMeteo: 'birch_pollen', unit: 'grans/m³', decimals: 0,
    nom: { ca: 'Bedoll', es: 'Abedul' }, pollen: true,
  },
  pollen_alder: {
    slug: 'pollen_alder', openMeteo: 'alder_pollen', unit: 'grans/m³', decimals: 0,
    nom: { ca: 'Vern', es: 'Aliso' }, pollen: true,
  },
  pollen_mugwort: {
    slug: 'pollen_mugwort', openMeteo: 'mugwort_pollen', unit: 'grans/m³', decimals: 0,
    nom: { ca: 'Artemisia', es: 'Artemisia' }, pollen: true,
  },
  pollen_ragweed: {
    slug: 'pollen_ragweed', openMeteo: 'ragweed_pollen', unit: 'grans/m³', decimals: 0,
    nom: { ca: 'Ambrosia', es: 'Ambrosía' }, pollen: true,
  },
};

export const ALL_AIR_VARIABLES = Object.values(AIR_VARIABLES);

/** Campos que se piden a la API de calidad del aire. */
export const AIR_HOURLY_FIELDS = ALL_AIR_VARIABLES.map((v) => v.openMeteo);

/** Índice inverso: nombre de Open-Meteo → variable canónica. */
export const AIR_FIELD_TO_SLUG: Record<string, AirSlug> = Object.fromEntries(
  ALL_AIR_VARIABLES.map((v) => [v.openMeteo, v.slug]),
) as Record<string, AirSlug>;

/** Contaminantes con medida directa, en el orden en que se muestran. */
export const POLLUTANTS: AirSlug[] = ['pm2_5', 'pm10', 'no2', 'o3', 'so2', 'co', 'dust'];

/** Subíndices del AQI, para saber qué contaminante determina el índice. */
export const SUB_INDICES: AirSlug[] = ['aqi_pm2_5', 'aqi_pm10', 'aqi_no2', 'aqi_o3'];

export const POLLENS: AirSlug[] = [
  'pollen_grass', 'pollen_olive', 'pollen_birch',
  'pollen_alder', 'pollen_mugwort', 'pollen_ragweed',
];

/** Qué contaminante mide cada subíndice, para poder nombrarlo. */
export const SUB_INDEX_OF: Partial<Record<AirSlug, AirSlug>> = {
  aqi_pm2_5: 'pm2_5', aqi_pm10: 'pm10', aqi_no2: 'no2', aqi_o3: 'o3',
};

// ── Bandas del índice europeo ───────────────────────────────────────────────

/**
 * Bandas del índice europeo de calidad del aire (EAQI).
 *
 * Los colores son los **oficiales de la Agencia Europea de Medio Ambiente**, no
 * una escala propia. Es el mismo criterio que con los avisos del CAP: el usuario
 * ya reconoce el semáforo europeo, y sustituirlo por una escala más bonita
 * convierte información en decoración.
 *
 * Los consejos están en el tono de la EEA —informativo, no alarmista— y no se
 * reescriben para dar más dramatismo.
 */
export interface AqiBand {
  /** Límite superior del tramo, inclusivo. */
  max: number;
  ca: string;
  color: string;
  /** Tinta legible sobre ese color. Va aquí y no en el tema: el fondo lo pinta el dato. */
  ink: string;
  consell: string;
}

export const AQI_BANDS: AqiBand[] = [
  {
    max: 20, ca: 'Bona', color: '#50f0e6', ink: '#093c39',
    consell: 'Es pot fer activitat a l’aire lliure sense cap limitació.',
  },
  {
    max: 40, ca: 'Raonablement bona', color: '#50ccaa', ink: '#08392c',
    consell: 'Cap precaució per a la població general.',
  },
  {
    max: 60, ca: 'Moderada', color: '#f0e641', ink: '#3a3406',
    consell: 'Les persones sensibles poden notar molèsties en esforços llargs a l’aire lliure.',
  },
  {
    max: 80, ca: 'Dolenta', color: '#ff5050', ink: '#fff4f4',
    consell: 'Qui tingui asma o problemes respiratoris hauria de moderar l’esforç intens a fora.',
  },
  {
    max: 100, ca: 'Molt dolenta', color: '#960032', ink: '#ffeff3',
    consell: 'Convé reduir l’activitat física a l’aire lliure, sobretot infants i gent gran.',
  },
  {
    max: Infinity, ca: 'Extremadament dolenta', color: '#7d2181', ink: '#fdf2fd',
    consell: 'S’aconsella evitar l’activitat física a l’aire lliure.',
  },
];

export function aqiBand(aqi: number): AqiBand {
  return AQI_BANDS.find((b) => aqi <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

// ── Polen ───────────────────────────────────────────────────────────────────

export type PollenLevel = 'baix' | 'moderat' | 'alt' | 'molt alt';

/**
 * Umbrales de polen por especie, en granos/m³: [presencia, moderado, alto].
 *
 * No hay una escala única, y usar una sería un error de bulto: 30 granos de
 * gramínea son muchos y 30 de olivo no son casi nada. Los cortes siguen los
 * niveles de la Red Española de Aerobiología, que es la referencia que usan los
 * servicios de alergología aquí.
 *
 * Por debajo del primer umbral la especie **no se muestra**: un valor de 0,4
 * granos no le sirve a nadie y llenaría la ficha de filas irrelevantes.
 */
export const POLLEN_THRESHOLDS: Record<string, [number, number, number]> = {
  pollen_grass: [1, 25, 50],
  pollen_olive: [1, 50, 200],
  pollen_birch: [1, 30, 100],
  pollen_alder: [1, 30, 100],
  pollen_mugwort: [1, 15, 30],
  pollen_ragweed: [1, 10, 25],
};

export function pollenLevel(slug: AirSlug, value: number): PollenLevel | null {
  const th = POLLEN_THRESHOLDS[slug];
  if (!th || value < th[0]) return null;
  if (value < th[1]) return 'baix';
  if (value < th[2]) return 'moderat';
  return value < th[2] * 4 ? 'alt' : 'molt alt';
}

export const POLLEN_COLORS: Record<PollenLevel, string> = {
  baix: 'var(--good)',
  moderat: 'var(--cap-yellow)',
  alt: 'var(--cap-orange)',
  'molt alt': 'var(--cap-red)',
};
