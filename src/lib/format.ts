/**
 * Formato de fechas, horas y números en catalán.
 *
 * Existe porque la web estaba llena de rebanadas de cadena tipo
 * slice(5, 16).replace('T', ' '), que producían cosas como **08-31 00:00**: un
 * formato que no es de nadie —ni ISO, ni catalán, ni americano— y que obliga al
 * lector a descifrar si el 08 es el mes o la hora.
 *
 * Dos decisiones deliberadas:
 *
 *  · **No se usa toLocaleDateString** para los nombres de mes. No es
 *    desconfianza de la ICU: es que el catalán escribe «31 d'agost» y «1 de
 *    setembre», con apóstrofo delante de vocal, y ninguna combinación de
 *    opciones de Intl da esa alternancia. Salía «31 de agost».
 *
 *  · **Las cadenas de hora local no se convierten en Date** para leerlas. Las
 *    series de Open-Meteo ya vienen en hora de Madrid (2026-08-31T08:00), y
 *    pasarlas por new Date() las reinterpreta en la zona del servidor —que en
 *    Vercel es UTC—, así que las 08:00 se mostrarían como las 06:00. Aquí se
 *    trocea la cadena, que es exacto y no depende del entorno. Solo el día de
 *    la semana necesita un Date, y se calcula con Date.UTC para que la zona no
 *    intervenga.
 *
 * Este fichero no importa nada, así que lo pueden usar los componentes y los
 * scripts por igual.
 */

const MESOS = [
  'gener', 'febrer', 'març', 'abril', 'maig', 'juny',
  'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre',
];

const MESOS_ABREV = [
  'gen.', 'febr.', 'març', 'abr.', 'maig', 'juny',
  'jul.', 'ag.', 'set.', 'oct.', 'nov.', 'des.',
];

const DIES = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
const DIES_ABREV = ['dg.', 'dl.', 'dt.', 'dc.', 'dj.', 'dv.', 'ds.'];

interface Parts { y: number; m: number; d: number; hh: number; mm: number }

/** Trocea 2026-08-31T08:00 o 2026-08-31. Nunca construye un Date. */
function parse(iso: string): Parts {
  return {
    y: Number(iso.slice(0, 4)),
    m: Number(iso.slice(5, 7)),
    d: Number(iso.slice(8, 10)),
    hh: Number(iso.slice(11, 13)) || 0,
    mm: Number(iso.slice(14, 16)) || 0,
  };
}

/** Día de la semana, 0 = domingo. Con Date.UTC para que no dependa de la zona. */
function weekday(p: Parts): number {
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

/** «de» o «d'» según la inicial del mes: 31 d'agost, 1 de setembre. */
function deMes(m: number): string {
  const nom = MESOS[m - 1];
  return /^[aeiouàèéíòóú]/i.test(nom) ? `d'${nom}` : `de ${nom}`;
}

// ── Horas ───────────────────────────────────────────────────────────────────

/** 08:00 — la hora sola, para columnas de tabla. */
export function hour(iso: string): string {
  return iso.slice(11, 16);
}

/** 8 h, sin cero delante. Para ejes de gráfico, donde el ancho manda. */
export function hourAxis(iso: string): string {
  return `${parse(iso).hh} h`;
}

/** «les 8 h» / «les 8.30 h», como se escribe en catalán. */
export function hourSpoken(iso: string): string {
  const { hh, mm } = parse(iso);
  return mm === 0 ? `les ${hh} h` : `les ${hh}.${String(mm).padStart(2, '0')} h`;
}

// ── Fechas ──────────────────────────────────────────────────────────────────

/** 31 d'agost */
export function dateShort(iso: string): string {
  const p = parse(iso);
  return `${p.d} ${deMes(p.m)}`;
}

/** 31 ag. — para tarjetas estrechas. */
export function dateTiny(iso: string): string {
  const p = parse(iso);
  return `${p.d} ${MESOS_ABREV[p.m - 1]}`;
}

/** diumenge, 31 d'agost */
export function dateLong(iso: string): string {
  const p = parse(iso);
  return `${DIES[weekday(p)]}, ${p.d} ${deMes(p.m)}`;
}

/** dg. 31 */
export function dayTiny(iso: string): string {
  const p = parse(iso);
  return `${DIES_ABREV[weekday(p)]} ${p.d}`;
}

/** diumenge */
export function dayName(iso: string): string {
  return DIES[weekday(parse(iso))];
}

/** 31 d'agost de 2026 — para récords y fechas históricas. */
export function dateFull(iso: string): string {
  const p = parse(iso);
  return `${p.d} ${deMes(p.m)} de ${p.y}`;
}

export function monthName(m: number): string {
  return MESOS[m - 1];
}

/**
 * El mes con su preposición: «d'agost», «de setembre».
 *
 * Se exporta porque el error sale enseguida en cuanto alguien escribe «al llarg
 * de » y concatena el nombre: «al llarg de agost» estuvo publicado un rato.
 */
export function monthOf(m: number): string {
  return deMes(m);
}

// ── Topónimos con preposición ───────────────────────────────────────────────

/**
 * Contracciones del catalán delante de un topónimo.
 *
 * En catalán el artículo del topónimo forma parte del nombre —«el Prat de
 * Llobregat», «l'Aldea», «les Borges Blanques»— y se contrae con la
 * preposición. Escribir «de el Prat» o «a el Prat» es una falta que un lector
 * de aquí nota inmediatamente, y estaba en la web tres veces: en la
 * procedencia del dato, en los ránquings y en la descripción de cada ficha.
 *
 *     de + el Prat        → del Prat
 *     de + els Hostalets  → dels Hostalets
 *     de + la Seu         → de la Seu
 *     de + l'Aldea        → de l'Aldea
 *     de + Amposta        → d'Amposta
 *     a  + el Prat        → al Prat
 */
function splitArticle(nom: string): { article: string; rest: string } {
  const m = /^(l'|el |els |la |les )/i.exec(nom);
  return m ? { article: m[1].toLowerCase(), rest: nom.slice(m[1].length) } : { article: '', rest: nom };
}

/** «del Prat de Llobregat», «de l'Aldea», «d'Amposta». */
export function deName(nom: string): string {
  const { article, rest } = splitArticle(nom);
  switch (article) {
    case 'el ': return `del ${rest}`;
    case 'els ': return `dels ${rest}`;
    case 'la ': return `de la ${rest}`;
    case 'les ': return `de les ${rest}`;
    case "l'": return `de l'${rest}`;
    default:
      // Sin artículo, el apóstrofo depende de la inicial del propio nombre.
      return /^[aeiouàèéíòóúh]/i.test(nom) ? `d'${nom}` : `de ${nom}`;
  }
}

/** «al Prat de Llobregat», «a l'Aldea», «a Amposta». */
export function aName(nom: string): string {
  const { article, rest } = splitArticle(nom);
  switch (article) {
    case 'el ': return `al ${rest}`;
    case 'els ': return `als ${rest}`;
    case 'la ': return `a la ${rest}`;
    case 'les ': return `a les ${rest}`;
    case "l'": return `a l'${rest}`;
    default: return `a ${nom}`;
  }
}

// ── Comarcas ────────────────────────────────────────────────────────────────

/**
 * El artículo de cada comarca.
 *
 * En catalán la comarca lleva artículo y forma parte de cómo se nombra: es
 * **l'Alt Camp**, **el Bages**, **la Selva**, **les Garrigues**. El fichero de
 * territorio guarda el nombre pelado —«Alt Camp»— porque así viene del ICGC, y
 * eso hacía que la web escribiera «Municipis de Alt Camp» y «va de Alt Camp».
 *
 * Es una tabla y no una regla porque no hay regla: el género y el número no se
 * deducen de la terminación. La Selva y el Solsonès acaban distinto por casualidad,
 * y la Val d'Aran es femenina donde un castellanoparlante pondría masculino.
 *
 * **Osona es la única sin artículo**, y por eso está en la tabla con cadena
 * vacía en vez de faltar: así se distingue «no lleva» de «se nos ha olvidado».
 */
const COMARCA_ARTICLE: Record<string, string> = {
  'Alt Camp': "l'", 'Alt Empordà': "l'", 'Alt Penedès': "l'", 'Alt Urgell': "l'",
  'Alta Ribagorça': "l'", 'Anoia': "l'", 'Urgell': "l'",
  'Bages': 'el ', 'Baix Camp': 'el ', 'Baix Ebre': 'el ', 'Baix Empordà': 'el ',
  'Baix Llobregat': 'el ', 'Baix Penedès': 'el ', 'Barcelonès': 'el ', 'Berguedà': 'el ',
  'Garraf': 'el ', 'Gironès': 'el ', 'Lluçanès': 'el ', 'Maresme': 'el ', 'Moianès': 'el ',
  'Montsià': 'el ', 'Pallars Jussà': 'el ', 'Pallars Sobirà': 'el ',
  "Pla d'Urgell": 'el ', "Pla de l'Estany": 'el ', 'Priorat': 'el ', 'Ripollès': 'el ',
  'Segrià': 'el ', 'Solsonès': 'el ', 'Tarragonès': 'el ',
  'Vallès Occidental': 'el ', 'Vallès Oriental': 'el ',
  'Cerdanya': 'la ', 'Conca de Barberà': 'la ', 'Garrotxa': 'la ', 'Noguera': 'la ',
  "Ribera d'Ebre": 'la ', 'Segarra': 'la ', 'Selva': 'la ', 'Terra Alta': 'la ',
  "Val d'Aran": 'la ',
  'Garrigues': 'les ',
  // La única que no lleva artículo.
  'Osona': '',
};

/** «l'Alt Camp», «el Bages», «Osona». */
export function comarcaName(nom: string): string {
  const article = COMARCA_ARTICLE[nom];
  // Si aparece una comarca nueva y no está en la tabla, se devuelve pelada: es
  // preferible un artículo que falta a uno inventado del género equivocado.
  return article == null ? nom : `${article}${nom}`;
}

/** «de l'Alt Camp», «del Bages», «d'Osona». */
export function deComarca(nom: string): string {
  return deName(comarcaName(nom));
}

/** «a l'Alt Camp», «al Bages», «a Osona». */
export function aComarca(nom: string): string {
  return aName(comarcaName(nom));
}

// ── Fecha y hora juntas ─────────────────────────────────────────────────────

/**
 * dg. 31, 08:00
 *
 * Es el reemplazo de 08-31 00:00. Con el día de la semana delante ya no hay
 * ambigüedad posible entre el mes y la hora.
 */
export function dateTime(iso: string): string {
  return `${dayTiny(iso)}, ${hour(iso)}`;
}

/** diumenge 31, a les 8 h — para textos corridos. */
export function dateTimeLong(iso: string): string {
  const p = parse(iso);
  return `${DIES[weekday(p)]} ${p.d}, a ${hourSpoken(iso)}`;
}

/**
 * avui, demà, demà passat, ahir — o el nombre del día.
 *
 * El día de hoy se pasa siempre desde fuera (la fecha local de Madrid que la
 * página ya calcula) para no volver a plantear aquí el problema de las zonas.
 */
export function relativeDay(iso: string, today: string): string {
  const day = iso.slice(0, 10);
  if (day === today) return 'avui';
  const diff = Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (diff === 1) return 'demà';
  if (diff === 2) return 'demà passat';
  if (diff === -1) return 'ahir';
  return DIES[weekday(parse(iso))];
}

/** Igual que relativeDay pero abreviado, para las tarjetas de 7 días. */
export function relativeDayTiny(iso: string, today: string): string {
  const r = relativeDay(iso, today);
  if (r === 'avui' || r === 'demà') return r;
  return DIES_ABREV[weekday(parse(iso))];
}

// ── Tiempo transcurrido ─────────────────────────────────────────────────────

/** ara mateix · fa 12 min · fa 2 hores */
export function ago(minutes: number): string {
  if (minutes < 1) return 'ara mateix';
  if (minutes < 60) return `fa ${minutes} min`;
  const h = Math.round(minutes / 60);
  if (h < 24) return h === 1 ? 'fa 1 hora' : `fa ${h} hores`;
  const d = Math.round(h / 24);
  return d === 1 ? 'fa 1 dia' : `fa ${d} dies`;
}

// ── Números ─────────────────────────────────────────────────────────────────

/**
 * Número con coma decimal, que es la que se usa en catalán. El código estaba
 * lleno de toFixed(1).replace('.', ',') repetido.
 *
 * El signo negativo es el **menos tipográfico** (U+2212), no el guion del
 * teclado. No es preciosismo: el guion es más corto y más alto, así que en una
 * columna de temperaturas con cifras tabulares los negativos quedan
 * desalineados y a −4 °C se le ve un guion de separación en vez de un signo.
 * signed() ya lo hacía; num() escribía «-4» al lado de «−4» dos líneas más
 * arriba.
 */
export function num(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(decimals).replace('.', ',').replace('-', '−');
}

/** Millares agrupados: 10 899 */
export function int(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('ca-ES');
}

/** Temperatura con su unidad: 23,3 °C */
export function temp(value: number | null | undefined, decimals = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : `${num(value, decimals)} °C`;
}

/** Temperatura compacta para tarjetas: 23° */
export function tempTiny(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${Math.round(value)}°`;
}

/** Diferencia con signo explícito, que es lo que hace legible una anomalía. */
export function signed(value: number | null | undefined, decimals = 1, unit = ''): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const s = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${s}${num(Math.abs(value), decimals)}${unit ? ` ${unit}` : ''}`;
}

/**
 * Ordinal catalán: 1r, 2n, 3r, 4t y, a partir del cinco, siempre è. Vale
 * también para los compuestos, porque vint-i-unè es 21è.
 */
export function ordinal(n: number): string {
  if (n === 1) return '1r';
  if (n === 2) return '2n';
  if (n === 3) return '3r';
  if (n === 4) return '4t';
  return `${n}è`;
}
