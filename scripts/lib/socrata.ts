import { fetchJson } from './http.ts';

/**
 * Cliente mínimo para la API SODA 2.0 del portal de datos abiertos de la
 * Generalitat. No requiere clave; un app token solo sube el límite de
 * throughput, así que se usa si está en el entorno pero no es obligatorio.
 */

export const SOCRATA_HOST = 'analisi.transparenciacatalunya.cat';

const APP_TOKEN = process.env.SOCRATA_APP_TOKEN;

function headers(): Record<string, string> {
  return APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {};
}

export interface SoqlQuery {
  select?: string;
  where?: string;
  group?: string;
  order?: string;
  limit?: number;
  offset?: number;
}

function toParams(q: SoqlQuery): string {
  const p = new URLSearchParams();
  if (q.select) p.set('$select', q.select);
  if (q.where) p.set('$where', q.where);
  if (q.group) p.set('$group', q.group);
  if (q.order) p.set('$order', q.order);
  if (q.limit != null) p.set('$limit', String(q.limit));
  if (q.offset != null) p.set('$offset', String(q.offset));
  return p.toString();
}

export async function soql<T>(datasetId: string, q: SoqlQuery = {}): Promise<T[]> {
  const url = `https://${SOCRATA_HOST}/resource/${datasetId}.json?${toParams(q)}`;
  return fetchJson<T[]>(url, { headers: headers() });
}

/**
 * Descarga un dataset completo paginando. Socrata limita cada respuesta, así
 * que hay que recorrerlo por bloques con un `$order` estable — sin orden
 * explícito la paginación puede repetir o saltarse filas.
 */
export async function soqlAll<T>(
  datasetId: string,
  q: SoqlQuery & { order: string },
  { pageSize = 50_000, onProgress }: { pageSize?: number; onProgress?: (n: number) => void } = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await soql<T>(datasetId, { ...q, limit: pageSize, offset });
    out.push(...page);
    onProgress?.(out.length);
    if (page.length < pageSize) break;
  }
  return out;
}

export async function count(datasetId: string, where?: string): Promise<number> {
  const [row] = await soql<Record<string, string>>(datasetId, { select: 'count(*)', where });
  return Number(Object.values(row)[0]);
}

/** Metadatos del dataset, incluido cuándo se actualizaron las filas por última vez. */
export async function views(datasetId: string): Promise<{ name: string; rowsUpdatedAt: number }> {
  return fetchJson(`https://${SOCRATA_HOST}/api/views/${datasetId}.json`, { headers: headers() });
}

/** Identificadores de los datasets que usa el proyecto. */
export const DATASETS = {
  /** Nomenclàtor estadístic d'entitats i nuclis de població. 11.019 filas. */
  nomenclator: 'tssr-jqsj',
  /** Caps de municipi georeferenciats. 947 puntos con lat/lon. */
  capsMunicipi: 'wpyq-we8x',
  /** Municipis Catalunya Geo. Centroides. */
  municipisGeo: '9aju-tpwc',
  /** Metadades de les estacions automàtiques XEMA. 245 filas. */
  estacions: 'yqwd-vj5e',
  /** Metadades de les variables meteorològiques. */
  variables: '4fb2-n3yi',
  /** Dades meteorològiques de la XEMA. Lecturas semihorarias. */
  mesures: 'nzvn-apee',
  /** Quantitat d'aigua als embassaments de les conques internes. */
  embassaments: 'gn9e-3qhr',
} as const;
