import type { WarningGroup } from './warning-stack.ts';
import type { Lang } from './lang.ts';

/**
 * Quan val un avís, dit en una línia.
 *
 * Viu aquí, i no a la targeta, perquè el diuen dos llocs: la targeta de la
 * fitxa i la notificació al mòbil (`scripts/workers/push-alerts.ts`). Amb dues
 * còpies, el dia que se'n toqués una la targeta diria «de 13:00 a 21:00» i la
 * notificació del mateix avís, una altra cosa.
 *
 * No importa res més que un tipus, que desapareix en executar-se: el worker el
 * carrega amb Node tal qual.
 */

const DIES = ['dg.', 'dl.', 'dt.', 'dc.', 'dj.', 'dv.', 'ds.'];
const MESOS = [
  'de gener', 'de febrer', 'de març', 'd’abril', 'de maig', 'de juny',
  'de juliol', 'd’agost', 'de setembre', 'd’octubre', 'de novembre', 'de desembre',
];
const DIAS = ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'];
const MESES = [
  'de enero', 'de febrero', 'de marzo', 'de abril', 'de mayo', 'de junio',
  'de julio', 'de agosto', 'de septiembre', 'de octubre', 'de noviembre', 'de diciembre',
];

/**
 * La hora de AEMET en hora local de Madrid, partida en piezas.
 *
 * El CAP trae la hora local con su desplazamiento —`2026-09-02T13:00:00+02:00`—
 * así que cortar la cadena por caracteres daría lo correcto casi siempre. Se
 * convierte de verdad igualmente: si algún día emitieran en UTC, cortar la
 * cadena publicaría una ola de calor de las once de la mañana a las siete de la
 * tarde, y no fallaría nada.
 */
function parts(iso: string) {
  const local = new Date(iso)
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .replace(' ', 'T');
  const y = Number(local.slice(0, 4));
  const m = Number(local.slice(5, 7));
  const d = Number(local.slice(8, 10));
  return { y, m, d, hhmm: local.slice(11, 16), day: local.slice(0, 10), weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/**
 * El final d'un avís: el dia de l'instant, i l'hora arrodonida al minut següent
 * quan acaba en :59.
 *
 * L'AEMET tanca els trams a les 20:59:59, i escrit tal qual la targeta deia
 * «a 20:59», que es llegeix com un error de rellotge. Un tram que acaba a les
 * 23:59:59 és «a 24:00» del mateix dia, no «a 00:00» de l'endemà.
 */
function endParts(iso: string) {
  const p = parts(iso);
  if (!p.hhmm.endsWith(':59')) return p;
  const h = Number(p.hhmm.slice(0, 2)) + 1;
  return { ...p, hhmm: `${String(h).padStart(2, '0')}:00` };
}

/** «dc. 2 de setembre» · «mié. 2 de septiembre» */
function dayLabel(iso: string, lang: Lang): string {
  const p = parts(iso);
  return lang === 'es' ? `${DIAS[p.weekday]} ${p.d} ${MESES[p.m - 1]}` : `${DIES[p.weekday]} ${p.d} ${MESOS[p.m - 1]}`;
}

/** «dc. 2» — para la lista de días de un grupo, donde el mes ya se ha dicho. */
export function dayShort(iso: string, lang: Lang = 'ca'): string {
  const p = parts(iso);
  return `${(lang === 'es' ? DIAS : DIES)[p.weekday]} ${p.d}`;
}

/**
 * Cuándo vale el aviso, en una línea.
 *
 * Tres formas, y cada una dice algo distinto:
 *  · un solo tramo → «dc. 2 de setembre, de 13:00 a 21:00»; si passa la
 *    mitjanit, cada hora amb el seu dia: «de dc. 2, 22:00, a dj. 3 de
 *    setembre, 21:00». Amb un sol dia, «de 22:00 a 21:00» semblava al revés.
 *  · varios tramos con la misma franja horaria → «de dc. 2 a dv. 4 de setembre,
 *    de 13:00 a 21:00», que es el caso normal de una ola de calor
 *  · varios tramos con franjas distintas → solo el rango de días; las horas van
 *    en la lista de cada día, porque una franja única sería falsa
 */
export function whenLine(g: WarningGroup, lang: Lang = 'ca'): string {
  const expires = g.expires;
  const first = parts(g.onset);
  const last = endParts(expires);
  const sameWindow = g.spans.every(
    (s) => parts(s.onset).hhmm === first.hhmm && endParts(s.expires).hhmm === last.hhmm,
  );

  if (first.day === last.day) {
    return `${dayLabel(g.onset, lang)}, de ${first.hhmm} a ${last.hhmm}`;
  }
  if (g.spans.length === 1) {
    return `de ${dayShort(g.onset, lang)}, ${first.hhmm}, a ${dayLabel(expires, lang)}, ${last.hhmm}`;
  }
  if (sameWindow) {
    return `de ${dayShort(g.onset, lang)} a ${dayLabel(expires, lang)}, de ${first.hhmm} a ${last.hhmm}`;
  }
  return `de ${dayShort(g.onset, lang)} a ${dayLabel(expires, lang)}`;
}
