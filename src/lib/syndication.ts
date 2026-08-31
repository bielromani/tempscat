import 'server-only';
import { dateTimeLong } from './format';
import type { Warning } from './weather';

/**
 * Avisos como feed: Atom e iCalendar.
 *
 * ## Por qué esto va antes que las notificaciones push
 *
 * «Alertes a la meva comarca» tiene dos implementaciones posibles y una diferencia
 * de coste enorme entre ellas.
 *
 * El push necesita almacén de suscripciones, claves VAPID, consentimiento
 * explícito, política de privacidad y un proceso que decida a quién le toca cada
 * aviso. Es la primera cosa de este proyecto que de verdad necesita base de datos.
 *
 * Un feed no necesita **nada**: es un `route.ts` que serializa lo que ya está en
 * memoria. Funciona en cualquier lector, se puede meter en un canal de Telegram,
 * en Slack, en un IFTTT o en el calendario del móvil, y no guarda ni un dato de
 * nadie. Cubre la mayor parte de la necesidad con cero infraestructura y cero
 * riesgo de mandar un push falso a las tres de la madrugada.
 *
 * ## Por qué Atom y no RSS 2.0
 *
 * Atom obliga a fechas ISO 8601 y a identificadores estables, que es exactamente
 * lo que hace falta aquí: un aviso se actualiza —el CAP reemite con el mismo
 * episodio— y sin un `id` estable cada actualización aparecería como un aviso
 * nuevo en el lector. RSS 2.0 deja el `guid` como opcional y las fechas en formato
 * de correo, que es más fácil de escribir mal.
 */

/** Escapa texto para XML. Los avisos oficiales llevan comillas y ampersands. */
function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface FeedOptions {
  /** URL absoluta del feed, para el enlace propio que Atom exige. */
  self: string;
  /** URL del sitio. */
  site: string;
  title: string;
  subtitle: string;
}

export function atomFeed(warnings: Warning[], opts: FeedOptions): string {
  // La fecha del feed es la del aviso más reciente, no la de ahora: si no cambia
  // nada, el feed no cambia, y los lectores no lo marcan como actualizado cada
  // vez que alguien lo pide.
  const updated = warnings.length
    ? warnings.map((w) => w.onset).sort().at(-1)!
    : new Date(0).toISOString();

  const entries = warnings.map((w) => {
    // El id lleva el nivel: si la AEMET sube un aviso de amarillo a naranja
    // manteniendo el identificador, tiene que aparecer como entrada nueva, porque
    // para el lector es información nueva.
    const id = `${opts.site}/avisos#${w.id}-${w.level}`;
    const zones = w.zones.length ? `\n      Zones: ${w.zones.join(', ')}` : '';
    return `  <entry>
    <id>${xml(id)}</id>
    <title>${xml(`${w.level.toUpperCase()} · ${w.event}`)}</title>
    <updated>${xml(w.onset)}</updated>
    <link rel="alternate" href="${xml(w.web || `${opts.site}/avisos`)}"/>
    <author><name>AEMET</name></author>
    <category term="${xml(w.phenomenon)}"/>
    <summary type="text">${xml(`${w.headline}
      Vigent ${dateTimeLong(local(w.onset))} → ${dateTimeLong(local(w.expires))}${zones}
      ${w.description}
      ${w.instruction}`.replace(/\s+\n/g, '\n').trim())}</summary>
  </entry>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ca">
  <id>${xml(opts.self)}</id>
  <title>${xml(opts.title)}</title>
  <subtitle>${xml(opts.subtitle)}</subtitle>
  <updated>${xml(updated)}</updated>
  <link rel="self" href="${xml(opts.self)}"/>
  <link rel="alternate" href="${xml(`${opts.site}/avisos`)}"/>
  <rights>Avisos de l'Agència Estatal de Meteorologia, reproduïts sense modificar.</rights>
${entries}
</feed>
`;
}

/** Hora local de Madrid en el formato que espera format.ts. */
function local(iso: string): string {
  return new Date(iso)
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .replace(' ', 'T')
    .slice(0, 16);
}

/** Marca de tiempo de iCalendar: siempre en UTC, con la Z. */
function ics(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Plegado de líneas de iCalendar.
 *
 * El RFC 5545 limita las líneas a 75 **octetos** y obliga a continuar con un
 * espacio al principio de la siguiente. No es un detalle estético: un lector
 * estricto rechaza el fichero entero, y los textos de los avisos son largos.
 *
 * Octetos, no caracteres, y en catalán eso importa: «acumulació» ocupa once
 * caracteres y doce bytes, así que contando caracteres una línea con acentos se
 * pasa del límite sin que nada lo note aquí. Y hay que cortar **sin partir un
 * carácter por la mitad**: medio carácter UTF-8 no es texto válido.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let bytes = 0;

  // 73 y no 75: la continuación gasta un octeto en el espacio inicial, y hay que
  // dejarle sitio en el corte anterior.
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 73) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Los avisos como calendario.
 *
 * Un aviso **es** un evento con principio y final, así que el calendario es su
 * formato natural: se suscribe una vez y los avisos aparecen solos entre las
 * reuniones, con su ventana de vigencia dibujada a escala. Ningún lector de RSS
 * enseña eso.
 */
export function icsFeed(warnings: Warning[], name: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//El temps a Catalunya//Avisos AEMET//CA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${escapeIcs(name)}`),
    'X-WR-TIMEZONE:Europe/Madrid',
  ];

  for (const w of warnings) {
    lines.push(
      'BEGIN:VEVENT',
      fold(`UID:${w.id}-${w.level}@el-temps`),
      `DTSTAMP:${ics(w.onset)}`,
      `DTSTART:${ics(w.onset)}`,
      `DTEND:${ics(w.expires)}`,
      fold(`SUMMARY:${escapeIcs(`Avís ${w.level}: ${w.event}`)}`),
      fold(`DESCRIPTION:${escapeIcs([w.headline, w.description, w.instruction]
        .filter(Boolean).join('\n\n'))}`),
      fold(`URL:${escapeIcs(w.web)}`),
      // Naranja y rojo llevan aviso; el amarillo no despierta a nadie.
      ...(w.level === 'taronja' || w.level === 'vermell'
        ? ['BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT2H',
          fold(`DESCRIPTION:${escapeIcs(w.event)}`), 'END:VALARM']
        : []),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  // El RFC exige CRLF. Con LF, algunos clientes lo aceptan y otros no.
  return `${lines.join('\r\n')}\r\n`;
}
