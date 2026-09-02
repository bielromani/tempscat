import { phenomenonName, probabilityText, thresholdValue, zoneName } from '@/lib/warning-labels';
import type { WarningGroup, WarningLevel } from '@/lib/weather';

/**
 * Franja de avisos meteorológicos oficiales.
 *
 * Reglas que no se negocian, porque un aviso mal presentado no es un fallo de
 * diseño sino un riesgo de seguridad:
 *
 *  · Se muestran los colores oficiales CAP, no una paleta propia. El usuario ya
 *    los reconoce y cambiarlos le haría dudar del nivel.
 *  · **Nunca se reescribe el texto oficial ni se ajusta el nivel.** El texto de
 *    AEMET va aparte, en su idioma y dicho que es suyo.
 *  · Siempre se dice quién lo emite, cuándo vale y con enlace al original.
 *  · Los avisos verdes no llegan hasta aquí: verde significa «sin aviso», y
 *    ocupar la franja con eso restaría fuerza a los que sí importan.
 *
 * ## Por qué la tarjeta no usa el texto de AEMET
 *
 * Porque AEMET no lo publica en catalán —solo `es-ES` y `en-GB`— y esta página
 * es en catalán. La tarjeta se escribe desde los **códigos** del CAP, que no
 * son prosa: nivel, fenómeno, zona, ventana y umbral. El porqué y las tablas
 * están en `src/lib/warning-labels.ts`.
 *
 * ## Y por qué llegan agrupados
 *
 * Porque AEMET emite un fichero por día y por zona, y una ola de calor de tres
 * días son tres avisos iguales salvo la fecha. `groupWarnings()` los junta sin
 * perder el umbral de cada día. El porqué está en `src/lib/weather.ts`.
 */

const LEVEL_STYLE: Record<WarningLevel, { bg: string; ink: string; label: string }> = {
  verd: { bg: 'var(--cap-green)', ink: 'oklch(20% 0.02 150)', label: 'Verd' },
  groc: { bg: 'var(--cap-yellow)', ink: 'oklch(22% 0.04 95)', label: 'Groc' },
  taronja: { bg: 'var(--cap-orange)', ink: 'oklch(20% 0.04 55)', label: 'Taronja' },
  vermell: { bg: 'var(--cap-red)', ink: 'oklch(98% 0.01 27)', label: 'Vermell' },
};

const DIES = ['dg.', 'dl.', 'dt.', 'dc.', 'dj.', 'dv.', 'ds.'];
const MESOS = [
  'de gener', 'de febrer', 'de març', 'd’abril', 'de maig', 'de juny',
  'de juliol', 'd’agost', 'de setembre', 'd’octubre', 'de novembre', 'de desembre',
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

/** «dc. 2 de setembre» */
function dayLabel(iso: string): string {
  const p = parts(iso);
  return `${DIES[p.weekday]} ${p.d} ${MESOS[p.m - 1]}`;
}

/** «dc. 2» — para la lista de días de un grupo, donde el mes ya se ha dicho. */
function dayShort(iso: string): string {
  const p = parts(iso);
  return `${DIES[p.weekday]} ${p.d}`;
}

/**
 * Cuándo vale el aviso, en una línea.
 *
 * Tres formas, y cada una dice algo distinto:
 *  · un solo tramo → «dc. 2 de setembre, de 13:00 a 20:59»
 *  · varios tramos con la misma franja horaria → «de dc. 2 a dv. 4 de setembre,
 *    de 13:00 a 20:59», que es el caso normal de una ola de calor
 *  · varios tramos con franjas distintas → solo el rango de días; las horas van
 *    en la lista de cada día, porque una franja única sería falsa
 */
function whenLine(g: WarningGroup): string {
  const first = parts(g.onset);
  const last = parts(g.expires);
  const sameWindow = g.spans.every(
    (s) => parts(s.onset).hhmm === first.hhmm && parts(s.expires).hhmm === last.hhmm,
  );

  if (g.spans.length === 1 || first.day === last.day) {
    return `${dayLabel(g.onset)}, de ${first.hhmm} a ${last.hhmm}`;
  }
  if (sameWindow) {
    return `de ${dayShort(g.onset)} a ${dayLabel(g.expires)}, de ${first.hhmm} a ${last.hhmm}`;
  }
  return `de ${dayShort(g.onset)} a ${dayLabel(g.expires)}`;
}

export function WarningBanner({ warnings }: { warnings: WarningGroup[] }) {
  if (!warnings.length) return null;

  return (
    <section aria-label="Avisos meteorològics oficials" className="mb-5 flex flex-col gap-2">
      {warnings.map((g) => {
        const style = LEVEL_STYLE[g.level];
        // El pitjor dels dies del grup: si el divendres son 36 °C i el
        // dimecres 35, el titular ha de dir 36.
        const values = g.spans.map((s) => thresholdValue(s.threshold)).filter((v): v is string => v != null);
        const worst = values.length ? values.reduce((a, b) => (b.localeCompare(a, 'ca', { numeric: true }) > 0 ? b : a)) : null;
        const perDay = g.spans.length > 1 && new Set(values).size > 1;
        const probability = probabilityText(g.probability);

        return (
          <div
            key={g.key}
            className="rounded-lg px-4 py-3"
            style={{ background: style.bg, color: style.ink }}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                style={{ background: style.ink, color: style.bg }}
              >
                Avís {style.label}
              </span>
              <strong className="text-[15px] font-semibold">{phenomenonName(g.phenomenon)}</strong>
              {worst && (
                <span className="text-sm opacity-90">
                  {perDay ? `fins a ${worst}` : worst}
                </span>
              )}
            </div>

            <p className="mt-1.5 text-sm leading-snug opacity-95">
              {g.zones.map(zoneName).join(', ')}
            </p>

            <p className="tnum mt-1 text-xs opacity-80">
              {whenLine(g)}
              {probability && ` · probabilitat ${probability}`}
            </p>

            {/* Dia a dia només quan el llindar canvia: si els tres dies son
                35 °C, repetir-ho tres vegades no afegeix res. */}
            {perDay && (
              <ul className="tnum mt-1.5 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs opacity-90">
                {g.spans.map((s) => (
                  <li key={s.id}>
                    {dayShort(s.onset)} · {thresholdValue(s.threshold) ?? '—'}
                  </li>
                ))}
              </ul>
            )}

            {/*
              El text d'AEMET, sencer i en el seu idioma.
              Va plegat i etiquetat: es informacio oficial i no es toca, pero
              tampoc es fa passar per text nostre en una pagina en catala.
            */}
            {(g.official.descriptions.length > 0 || g.official.instructions.length > 0) && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium opacity-90">
                  Text oficial de l&apos;AEMET, en castellà
                </summary>
                <div className="mt-1 space-y-1 text-xs leading-snug opacity-90" lang="es">
                  <p className="font-medium">{g.official.event}</p>
                  {g.official.descriptions.map((d) => <p key={d}>{d}</p>)}
                  {g.official.instructions.map((i) => <p key={i}>{i}</p>)}
                </div>
              </details>
            )}

            <p className="mt-2 text-[11px] opacity-75">
              Avís de l&apos;<strong className="font-semibold">Agència Estatal de Meteorologia</strong>.{' '}
              <a href={g.web} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                Consulteu-lo a AEMET
              </a>
            </p>
          </div>
        );
      })}
    </section>
  );
}
