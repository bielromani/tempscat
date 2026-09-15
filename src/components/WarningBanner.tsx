import { phenomenonName, probabilityText, thresholdValue, zoneName } from '@/lib/warning-labels';
import { stackWarnings, type WarningGroup, type WarningLevel } from '@/lib/weather';

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
 * perder el umbral de cada día. El porqué está en `src/lib/warning-stack.ts`.
 *
 * ## Uno manda y el resto acompañan
 *
 * Un lugar puede tener cuatro avisos a la vez, y lo normal es que tenga más de
 * uno: el 8 de septiembre de 2026, **3.548 de 4.048**. Con cuatro tarjetas del
 * mismo tamaño hay que leerlas todas para descubrir cuál importa.
 *
 * Así que el de nivel más alto va entero y los demás quedan a una línea, con su
 * color y desplegables. **No se esconde ninguno**, y el porqué —medido, no
 * supuesto— está en `warning-stack.ts`: sobre los avisos de aquel día, ni uno
 * solo decía algo que otro ya dijera.
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

/** El peor de los días del grupo: si el viernes son 36 °C y el miércoles 35, el titular dice 36. */
function worstThreshold(g: WarningGroup): { worst: string | null; perDay: boolean } {
  const values = g.spans
    .map((s) => thresholdValue(s.threshold))
    .filter((v): v is string => v != null);
  const worst = values.length
    ? values.reduce((a, b) => (b.localeCompare(a, 'ca', { numeric: true }) > 0 ? b : a))
    : null;
  return { worst, perDay: g.spans.length > 1 && new Set(values).size > 1 };
}

/** La cabecera del que manda: la pastilla del nivel, el fenómeno y el umbral. */
function Head({ g }: { g: WarningGroup }) {
  const style = LEVEL_STYLE[g.level];
  const { worst, perDay } = worstThreshold(g);

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span
        className="rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
        style={{ background: style.ink, color: style.bg }}
      >
        Avís {style.label}
      </span>
      <strong className="text-[15px] font-semibold">{phenomenonName(g.phenomenon)}</strong>
      {worst && (
        <span className="text-sm opacity-90">{perDay ? `fins a ${worst}` : worst}</span>
      )}
    </div>
  );
}

/**
 * Todo lo que dice un aviso menos su cabecera.
 *
 * Es lo mismo en el que manda y en los que acompañan: la diferencia entre ellos
 * es cuánto hay que hacer para verlo, no qué se ve. Un aviso que solo estuviera
 * entero en la tarjeta grande sería un aviso a medias en las otras.
 */
function Body({ g, showWhen = true }: { g: WarningGroup; showWhen?: boolean }) {
  const { perDay } = worstThreshold(g);
  const probability = probabilityText(g.probability);

  return (
    <>
      <p className="mt-1.5 text-sm leading-snug opacity-95">
        {g.zones.map(zoneName).join(', ')}
      </p>

      {/* Els que acompanyen ja porten la data a la línia que es veu plegada:
          repetir-la en obrir-los fa dubtar de si són dues coses. */}
      {(showWhen || probability) && (
        <p className="tnum mt-1 text-xs opacity-80">
          {showWhen && whenLine(g)}
          {probability && `${showWhen ? ' · ' : ''}probabilitat ${probability}`}
        </p>
      )}

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
    </>
  );
}

/**
 * Com s'apilen.
 *
 * `lloc` és la franja d'una fitxa: tots els avisos són **del mateix punt**, així
 * que n'hi ha un que mana i els altres l'acompanyen.
 *
 * `llista` és `/avisos`, que ensenya els de tot Catalunya. Allà no manen els
 * uns sobre els altres: un groc del Segrià no és un afegit al taronja del
 * Pirineu de Girona, és una altra cosa en un altre lloc. Apilar-los diria una
 * jerarquia que no existeix i deixaria divuit zones a mitja línia sense dir ni
 * quina zona són.
 */
export function WarningBanner({
  warnings, variant = 'lloc',
}: { warnings: WarningGroup[]; variant?: 'lloc' | 'llista' }) {
  if (variant === 'llista') {
    return (
      <section aria-label="Avisos meteorològics oficials" className="mb-5 flex flex-col gap-2">
        {warnings.map((g) => {
          const style = LEVEL_STYLE[g.level];
          return (
            <div
              key={g.key}
              className="rounded-lg px-4 py-3"
              style={{ background: style.bg, color: style.ink }}
            >
              <Head g={g} />
              <Body g={g} />
            </div>
          );
        })}
      </section>
    );
  }

  const stack = stackWarnings(warnings);
  if (!stack) return null;

  const leadStyle = LEVEL_STYLE[stack.lead.level];

  return (
    <section aria-label="Avisos meteorològics oficials" className="mb-5 flex flex-col gap-2">
      {/* El que mana, sencer i sense haver de tocar res. */}
      <div
        className="rounded-lg px-4 py-3"
        style={{ background: leadStyle.bg, color: leadStyle.ink }}
      >
        <Head g={stack.lead} />
        <Body g={stack.lead} />
      </div>

      {/*
        Els altres.

        Una línia cadascun i amb el seu color oficial, perquè es vegi d'un cop
        d'ull que n'hi ha més i de quin nivell són; el detall sencer és a un
        clic i sense una sola línia de JavaScript. El que **no** es fa és
        treure'n cap: el porquè, mesurat, és a `warning-stack.ts`.
      */}
      {stack.rest.length > 0 && (
        <ul className="flex list-none flex-col gap-1.5 p-0">
          {stack.rest.map((g) => {
            const style = LEVEL_STYLE[g.level];
            const { worst, perDay } = worstThreshold(g);
            return (
              <li key={g.key}>
                <details
                  className="rounded-lg border border-l-4 border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)]"
                  style={{ borderLeftColor: style.bg }}
                >
                  {/*
                    El contingut va **en línia** i no en un `flex`.

                    Amb `display:flex` el `summary` perd el triangle i llavors
                    res no diu que allò s'obri; posant el flex a dins, el bloc
                    ocupa tota l'amplada i el triangle es queda sol en una
                    línia. En línia, el triangle i el text van junts i el text
                    segueix passant de ratlla quan no hi cap.
                  */}
                  <summary className="cursor-pointer leading-relaxed">
                    <span
                      className="mr-2 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                      style={{ background: style.bg, color: style.ink }}
                    >
                      {style.label}
                    </span>
                    <strong className="mr-2 text-sm font-semibold">
                      {phenomenonName(g.phenomenon)}
                    </strong>
                    {worst && (
                      <span className="mr-2 text-[13px] text-[var(--ink-2)]">
                        {perDay ? `fins a ${worst}` : worst}
                      </span>
                    )}
                    <span className="tnum text-xs text-[var(--muted)]">{whenLine(g)}</span>
                  </summary>
                  <div className="text-[var(--ink-2)]">
                    <Body g={g} showWhen={false} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
