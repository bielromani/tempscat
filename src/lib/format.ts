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
 * scripts por igual. (El `import type` de `lang.ts` se borra al compilar.)
 *
 * ## Y en castellano
 *
 * Desde noviembre de 2026 cada función que escribe palabras acepta un `lang`
 * al final, que por defecto es `'ca'`: el código que no lo pasa sigue
 * escribiendo catalán. Las reglas del castellano que no son evidentes:
 *
 *  · **Los topónimos no se traducen**, pero el artículo que forma parte del
 *    nombre va en mayúscula y **no se contrae** (Ortografía de la RAE): «en El
 *    Prat de Llobregat», «de L'Hospitalet», «de Les Borges Blanques». Es lo que
 *    hace la prensa: «el aeropuerto de El Prat».
 *  · **Las comarcas, en cambio, sí contraen**, porque su artículo no es parte
 *    del nombre sino el de un nombre común: «del Bages», «al Maresme». Y tienen
 *    género propio en castellano: «la Anoia», «el Alt Camp», «las Garrigues».
 *  · El trato es de usted. El catalán del sitio es de vós, y el equivalente
 *    formal en castellano es usted, no vosotros.
 */

import type { Lang } from './lang.ts';

const MESOS = [
  'gener', 'febrer', 'març', 'abril', 'maig', 'juny',
  'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre',
];

const MESOS_ABREV = [
  'gen.', 'febr.', 'març', 'abr.', 'maig', 'juny',
  'jul.', 'ag.', 'set.', 'oct.', 'nov.', 'des.',
];

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MESES_ABREV = [
  'ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.',
  'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.',
];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_ABREV = ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'];

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

/** «de» o «d'» según la inicial del mes: 31 d'agost, 1 de setembre. En castellano, siempre «de». */
function deMes(m: number, lang: Lang = 'ca'): string {
  if (lang === 'es') return `de ${MESES[m - 1]}`;
  const nom = MESOS[m - 1];
  return /^[aeiouàèéíòóú]/i.test(nom) ? `d'${nom}` : `de ${nom}`;
}

// ── Hora local de Madrid → instante ─────────────────────────────────────────

/**
 * Hora local de Madrid → instante, sin biblioteca y sin restar horas a mano.
 *
 * Restar «dos horas en verano y una en invierno» es lo que se rompe el domingo
 * del cambio, y se rompe en silencio: la hora sale plausible y es de otra. Aquí
 * se supone que la hora leída es UTC, se pregunta qué hora marca ese instante
 * en Madrid, y la diferencia es el desplazamiento que hay que quitar.
 *
 * Se repite una vez porque en la madrugada del cambio el desplazamiento del
 * instante supuesto y el del real no son el mismo.
 *
 * Vivía en `scripts/lib/madrid.ts`, donde la aplicación no llega; está aquí
 * porque `/estat` la necesita también, y `madrid.ts` la reexporta: una copia.
 */
export function madridToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const asMadrid = new Date(guess)
      .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
      .replace(' ', 'T');
    const offset = Date.parse(`${asMadrid}Z`) - guess;
    guess = wall - offset;
  }
  return new Date(guess);
}

/**
 * Una marca de temps → mil·lisegons, digui o no de quina zona és.
 *
 * Les fonts no les desen igual: unes porten zona —`…Z`, `…-00:00`— i altres no
 * —`2026-09-29T00:00`, l'hora local d'Open-Meteo, o una data sola—. `Date.parse`
 * llegeix les segones com a hora **del servidor**, que a Vercel és UTC, i a
 * `/estat` la predicció sortia amb dues hores menys d'antiguitat de les que
 * tenia. Sense zona vol dir hora de Madrid, que és el que escriuen.
 */
export function instantOf(ts: string): number {
  if (/(?:[zZ]|[+-]\d\d:\d\d)$/.test(ts)) return Date.parse(ts);
  const n = (a: number, b: number) => Number(ts.slice(a, b)) || 0;
  return madridToUtc(n(0, 4), n(5, 7), n(8, 10), n(11, 13), n(14, 16)).getTime();
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

/**
 * «les 8 h», «la 1 h»: una hora en punt amb el seu article.
 *
 * La 1 és l'única en singular, i per això no es pot escriure «a les ${h} h» a
 * mà: la fitxa del Prat deia «fins demà a les 1 h». Sense `unit` no porta la
 * «h», per a la primera meitat d'un interval: «de la 1 a les 3 h».
 *
 * I les 0 són «mitjanit»: «cap a les 0 h» no ho diu ningú.
 */
export function theHour(h: number, unit = true, lang: Lang = 'ca'): string {
  const hh = ((h % 24) + 24) % 24;
  if (lang === 'es') {
    if (hh === 0) return 'medianoche';
    return `${hh === 1 ? 'la' : 'las'} ${hh}${unit ? ' h' : ''}`;
  }
  if (hh === 0) return 'mitjanit';
  return `${hh === 1 ? 'la' : 'les'} ${hh}${unit ? ' h' : ''}`;
}

/** «les 8 h» / «les 8.30 h» / «la 1 h», como se escribe en catalán. */
export function hourSpoken(iso: string, lang: Lang = 'ca'): string {
  const { hh, mm } = parse(iso);
  if (mm === 0) return theHour(hh, true, lang);
  const art = hh === 1 ? 'la' : lang === 'es' ? 'las' : 'les';
  return `${art} ${hh}${lang === 'es' ? ':' : '.'}${String(mm).padStart(2, '0')} h`;
}

// ── Fechas ──────────────────────────────────────────────────────────────────

/** 31 d'agost */
export function dateShort(iso: string, lang: Lang = 'ca'): string {
  const p = parse(iso);
  return `${p.d} ${deMes(p.m, lang)}`;
}

/** 31 ag. — para tarjetas estrechas. */
export function dateTiny(iso: string, lang: Lang = 'ca'): string {
  const p = parse(iso);
  return `${p.d} ${(lang === 'es' ? MESES_ABREV : MESOS_ABREV)[p.m - 1]}`;
}

/** diumenge, 31 d'agost */
export function dateLong(iso: string, lang: Lang = 'ca'): string {
  const p = parse(iso);
  return `${days(lang)[weekday(p)]}, ${p.d} ${deMes(p.m, lang)}`;
}

/** dg. 31 */
export function dayTiny(iso: string, lang: Lang = 'ca'): string {
  const p = parse(iso);
  return `${(lang === 'es' ? DIAS_ABREV : DIES_ABREV)[weekday(p)]} ${p.d}`;
}

/** diumenge */
export function dayName(iso: string, lang: Lang = 'ca'): string {
  return days(lang)[weekday(parse(iso))];
}

function days(lang: Lang): string[] {
  return lang === 'es' ? DIAS : DIES;
}

/** 31 d'agost de 2026 — para récords y fechas históricas. */
export function dateFull(iso: string, lang: Lang = 'ca'): string {
  const p = parse(iso);
  return `${p.d} ${deMes(p.m, lang)} de ${p.y}`;
}

export function monthName(m: number, lang: Lang = 'ca'): string {
  return (lang === 'es' ? MESES : MESOS)[m - 1];
}

/**
 * El mes con su preposición: «d'agost», «de setembre».
 *
 * Se exporta porque el error sale enseguida en cuanto alguien escribe «al llarg
 * de » y concatena el nombre: «al llarg de agost» estuvo publicado un rato.
 */
export function monthOf(m: number, lang: Lang = 'ca'): string {
  return deMes(m, lang);
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

/**
 * El topónimo como se escribe en castellano: el artículo del nombre en
 * mayúscula, «El Prat de Llobregat», «L'Hospitalet». Ver la cabecera.
 */
export function placeName(nom: string, lang: Lang = 'ca'): string {
  return lang === 'es' ? capFirst(nom) : nom;
}

/** «del Prat de Llobregat», «de l'Aldea», «d'Amposta». En castellano, «de El Prat». */
export function deName(nom: string, lang: Lang = 'ca'): string {
  if (lang === 'es') return `de ${placeName(nom, lang)}`;
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

/**
 * «del NNO», «de l'ESE»: d'on ve el vent, amb la contracció que toca.
 *
 * El rumb abreujat es llegeix sencer —«del nord-nord-oest», «de l'est-sud-est»—
 * i per tant contrau com el nom del punt cardinal: els que comencen per E (est)
 * o per O (oest) van amb apòstrof. La fitxa va publicar «vent del ESE» en totes
 * les que el tenien, i és la mateixa falta que «de el Prat».
 */
export function fromDirection(cardinal: string, lang: Lang = 'ca'): string {
  return `${directionPrep(cardinal, lang)}${cardinal}`;
}

/** Només la preposició, per quan el rumb va marcat a part: «de l'» o «del ». En castellà, sempre «del ». */
export function directionPrep(cardinal: string, lang: Lang = 'ca'): string {
  if (lang === 'es') return 'del ';
  return /^[EO]/.test(cardinal) ? "de l'" : 'del ';
}

/**
 * «l'Ametlla de Mar», i no «Ametlla de Mar, l'».
 *
 * Alguns registres de la Generalitat —el de platges, el de la qualitat de
 * l'aire— escriuen el municipi amb l'article al final, com en un índex. A la
 * pàgina es llegeix com una falta. Un nom sense article al final torna igual.
 */
export function articleFirst(nom: string): string {
  const m = /^(.+),\s*(el|la|els|les|l'|l’)$/i.exec(nom.trim());
  if (!m) return nom;
  const art = m[2].toLowerCase().replace('’', "'");
  return art.endsWith("'") ? `${art}${m[1]}` : `${art} ${m[1]}`;
}

/**
 * «al Prat de Llobregat», «a l'Aldea», «a Amposta».
 *
 * En castellano es «en», no «a»: «el tiempo en El Prat». Quien necesite el «a»
 * de dirección («ir a El Prat») lo escribe a mano con `placeName`.
 */
export function aName(nom: string, lang: Lang = 'ca'): string {
  if (lang === 'es') return `en ${placeName(nom, lang)}`;
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

/**
 * «a» i el topònim, en dues peces: `{ prep: 'als', rest: 'Albans i Cal Xeret' }`.
 *
 * Per als titulars que posen la preposició en una línia i el nom en una altra.
 * Escrivint «El temps a» damunt del nom, «els Albans» es llegia «El temps a
 * els Albans»: la preposició s'ha de contraure amb l'article, i per tant
 * l'article va amb ella. `joined` diu si entre les dues peces hi va un espai
 * —«a l'» s'enganxa al nom—, perquè el text del titular sencer sigui el correcte.
 */
export function aNameParts(nom: string, lang: Lang = 'ca'): { prep: string; rest: string; joined: boolean } {
  if (lang === 'es') return { prep: 'en', rest: placeName(nom, lang), joined: false };
  const { article, rest } = splitArticle(nom);
  switch (article) {
    case 'el ': return { prep: 'al', rest, joined: false };
    case 'els ': return { prep: 'als', rest, joined: false };
    case 'la ': return { prep: 'a la', rest, joined: false };
    case 'les ': return { prep: 'a les', rest, joined: false };
    case "l'": return { prep: "a l'", rest, joined: true };
    default: return { prep: 'a', rest: nom, joined: false };
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

/**
 * Y en castellano. El género es el del castellano y el apóstrofo desaparece:
 * «el Alt Camp», «la Anoia», «el Urgell», «las Garrigues». Osona, sin artículo.
 */
const COMARCA_ARTICULO: Record<string, string> = {
  ...Object.fromEntries(Object.entries(COMARCA_ARTICLE).map(([k, v]) => [k, v === 'les ' ? 'las ' : v])),
  'Alt Camp': 'el ', 'Alt Empordà': 'el ', 'Alt Penedès': 'el ', 'Alt Urgell': 'el ',
  'Alta Ribagorça': 'la ', 'Anoia': 'la ', 'Urgell': 'el ',
};

/** «l'Alt Camp», «el Bages», «Osona». */
/**
 * «de» o «d'» davant d'un mot que no porta article: d'esquí, de senderisme.
 *
 * No és `deName()`: aquell és per a topònims, on l'article forma part del nom i
 * es contrau («de l'Ametlla» → «de l'Ametlla», «de el Prat» mai). Aquí el mot
 * va pelat i l'única cosa que cal decidir és si comença per vocal.
 *
 * La `h` hi entra perquè és muda: «d'hivern», no «de hivern». La `u` de «uix»
 * i la `i` de «iogurt» serien excepcions de manual; no n'hi ha cap al lloc.
 */
export function deWord(word: string): string {
  return /^[aeiouàèéíòóúh]/i.test(word.trim()) ? `d'${word}` : `de ${word}`;
}

export function comarcaName(nom: string, lang: Lang = 'ca'): string {
  const article = (lang === 'es' ? COMARCA_ARTICULO : COMARCA_ARTICLE)[nom];
  // Si aparece una comarca nueva y no está en la tabla, se devuelve pelada: es
  // preferible un artículo que falta a uno inventado del género equivocado.
  return article == null ? nom : `${article}${nom}`;
}

/** «de l'Alt Camp», «del Bages», «d'Osona». En castellano, «del Alt Camp», «de la Anoia». */
export function deComarca(nom: string, lang: Lang = 'ca'): string {
  if (lang === 'es') {
    const n = comarcaName(nom, lang);
    return n.startsWith('el ') ? `del ${n.slice(3)}` : `de ${n}`;
  }
  return deName(comarcaName(nom));
}

/** «a l'Alt Camp», «al Bages», «a Osona». En castellano, «en el Bages», «en la Selva». */
export function aComarca(nom: string, lang: Lang = 'ca'): string {
  if (lang === 'es') return `en ${comarcaName(nom, lang)}`;
  return aName(comarcaName(nom));
}

// ── Fecha y hora juntas ─────────────────────────────────────────────────────

/**
 * dg. 31, 08:00
 *
 * Es el reemplazo de 08-31 00:00. Con el día de la semana delante ya no hay
 * ambigüedad posible entre el mes y la hora.
 */
export function dateTime(iso: string, lang: Lang = 'ca'): string {
  return `${dayTiny(iso, lang)}, ${hour(iso)}`;
}

/** diumenge 31, a les 8 h — para textos corridos. */
export function dateTimeLong(iso: string, lang: Lang = 'ca'): string {
  const p = parse(iso);
  return `${days(lang)[weekday(p)]} ${p.d}, a ${hourSpoken(iso, lang)}`;
}

/**
 * avui, demà, demà passat, ahir — o el nombre del día.
 *
 * El día de hoy se pasa siempre desde fuera (la fecha local de Madrid que la
 * página ya calcula) para no volver a plantear aquí el problema de las zonas.
 */
export function relativeDay(iso: string, today: string, lang: Lang = 'ca'): string {
  const day = iso.slice(0, 10);
  const es = lang === 'es';
  if (day === today) return es ? 'hoy' : 'avui';
  const diff = Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (diff === 1) return es ? 'mañana' : 'demà';
  if (diff === 2) return es ? 'pasado mañana' : 'demà passat';
  if (diff === -1) return es ? 'ayer' : 'ahir';
  return days(lang)[weekday(parse(iso))];
}

/** Igual que relativeDay pero abreviado, para las tarjetas de 7 días. */
export function relativeDayTiny(iso: string, today: string, lang: Lang = 'ca'): string {
  const r = relativeDay(iso, today, lang);
  if (['avui', 'demà', 'hoy', 'mañana'].includes(r)) return r;
  return (lang === 'es' ? DIAS_ABREV : DIES_ABREV)[weekday(parse(iso))];
}

// ── Tiempo transcurrido ─────────────────────────────────────────────────────

/** ara mateix · fa 12 min · fa 2 hores */
export function ago(minutes: number, lang: Lang = 'ca'): string {
  if (lang === 'es') {
    if (minutes < 1) return 'ahora mismo';
    if (minutes < 60) return `hace ${minutes} min`;
    const h = Math.round(minutes / 60);
    if (h < 24) return h === 1 ? 'hace 1 hora' : `hace ${h} horas`;
    const d = Math.round(h / 24);
    return d === 1 ? 'hace 1 día' : `hace ${d} días`;
  }
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
  const s = value.toFixed(decimals);
  // −0,2 arrodonit a zero decimals és «−0»: un zero no porta signe.
  return (/^-0(?:\.0*)?$/.test(s) ? s.slice(1) : s).replace('.', ',').replace('-', '−');
}

/**
 * Millars agrupats amb punt: 1.317, 10.899.
 *
 * No amb `toLocaleString('ca-ES')`: el català hi porta `minimumGroupingDigits`
 * 2, així que les xifres de quatre dígits sortien sense agrupar —«1317 m» al
 * costat de «10.899»— i el signe era el guió del teclat.
 */
export function int(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const n = Math.round(value);
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return n < 0 ? `−${digits}` : digits;
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
export function ordinal(n: number, lang: Lang = 'ca'): string {
  if (lang === 'es') return `${n}.º`;
  if (n === 1) return '1r';
  if (n === 2) return '2n';
  if (n === 3) return '3r';
  if (n === 4) return '4t';
  return `${n}è`;
}

/**
 * El nom d'una estació sense l'alçada entre parèntesis: «Boí (2.537 m)» → «Boí».
 * La XEMA la porta dins del nom de les de muntanya, i on ja hi ha una columna
 * d'altitud sortia dues vegades a la mateixa línia.
 */
export function stationShort(nom: string): string {
  return nom.replace(/\s*\([^)]*\)\s*$/, '');
}

/** La primera lletra en majúscula: «la Tosa d'Alp» a començament de línia. */
export function capFirst(s: string): string {
  return s ? `${s[0].toUpperCase()}${s.slice(1)}` : s;
}
