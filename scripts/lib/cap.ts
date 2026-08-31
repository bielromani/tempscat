/**
 * Lector de alertas CAP 1.2 (Common Alerting Protocol) de AEMET.
 *
 * Cada fichero describe **un fenómeno** y contiene varios bloques `<info>`, uno
 * por idioma, y dentro de cada uno varias `<area>` con su polígono. Nos
 * quedamos con el castellano y con todas las áreas.
 *
 * Regla que no se negocia: **nunca se modifica el nivel ni el texto de un
 * aviso oficial**. Se muestra el organismo emisor, la hora y un enlace al
 * original. Un aviso mal presentado es un riesgo de seguridad, no un detalle
 * de diseño.
 */

export type CapLevel = 'verd' | 'groc' | 'taronja' | 'vermell';

export interface CapArea {
  desc: string;
  /** Anillos [lon, lat], listos para point-in-polygon. */
  polygons: Array<Array<[number, number]>>;
}

export interface CapAlert {
  id: string;
  sent: string;
  event: string;
  /** Código del fenómeno: AT temperaturas máximas, PR lluvias, NE nevadas… */
  phenomenon: string;
  severity: string;
  certainty: string;
  urgency: string;
  level: CapLevel;
  onset: string;
  expires: string;
  headline: string;
  description: string;
  instruction: string;
  probability?: string;
  /** Umbral concreto del aviso: "Temperatura máxima; 38 ºC". */
  threshold?: string;
  web: string;
  areas: CapArea[];
}

const LEVELS: Record<string, CapLevel> = {
  verde: 'verd', amarillo: 'groc', naranja: 'taronja', rojo: 'vermell',
};

function all(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function one(xml: string, tag: string): string {
  return all(xml, tag)[0]?.trim() ?? '';
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/** Los parámetros CAP son pares nombre/valor repetidos. */
function param(info: string, name: string): string | undefined {
  for (const p of all(info, 'parameter')) {
    if (one(p, 'valueName').includes(name)) return decode(one(p, 'value'));
  }
  return undefined;
}

/** `"41.2,2.1 41.3,2.2"` → `[[2.1, 41.2], [2.2, 41.3]]` (CAP va en lat,lon). */
function parsePolygon(raw: string): Array<[number, number]> {
  return raw.trim().split(/\s+/).map((pair) => {
    const [lat, lon] = pair.split(',').map(Number);
    return [lon, lat] as [number, number];
  }).filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

export function parseCap(xml: string): CapAlert | null {
  // Se prefiere el bloque en castellano; si no lo hay, el primero que venga.
  const infos = all(xml, 'info');
  const info = infos.find((i) => one(i, 'language').startsWith('es')) ?? infos[0];
  if (!info) return null;

  const nivel = (param(info, 'Meteoalerta nivel') ?? 'verde').toLowerCase();
  const level = LEVELS[nivel] ?? 'verd';

  const areas: CapArea[] = all(info, 'area').map((a) => ({
    desc: decode(one(a, 'areaDesc')),
    polygons: all(a, 'polygon').map(parsePolygon).filter((p) => p.length >= 3),
  }));

  const fenomeno = (() => {
    for (const ec of all(info, 'eventCode')) {
      if (one(ec, 'valueName').includes('fenomeno')) return decode(one(ec, 'value')).split(';')[0];
    }
    return '';
  })();

  return {
    id: one(xml, 'identifier'),
    sent: one(xml, 'sent'),
    event: decode(one(info, 'event')),
    phenomenon: fenomeno,
    severity: one(info, 'severity'),
    certainty: one(info, 'certainty'),
    urgency: one(info, 'urgency'),
    level,
    onset: one(info, 'onset'),
    expires: one(info, 'expires'),
    headline: decode(one(info, 'headline')),
    description: decode(one(info, 'description')),
    instruction: decode(one(info, 'instruction')),
    probability: param(info, 'probabilidad'),
    threshold: param(info, 'parametro')?.split(';').slice(1).join(' · '),
    web: one(info, 'web'),
    areas,
  };
}
