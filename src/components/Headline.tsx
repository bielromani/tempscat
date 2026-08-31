import { WeatherIcon } from './WeatherIcon';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { msToKmh } from '@/lib/variables';
import { hour, num, tempTiny } from '@/lib/format';
import type { DayPart, Narrative } from '@/lib/narrative';

/**
 * El titular: la interpretación de los datos, en catalán.
 *
 * Va justo después del panel de condiciones actuales. El número grande es el
 * gancho; esto es la respuesta. Antes se pasaba del termómetro directamente al
 * meteograma de 48 horas, y ahí se perdía a quien solo quería saber si hoy
 * llovería.
 *
 * ## Por qué no hay tarjetas de preguntas frecuentes
 *
 * La primera versión llevaba una rejilla de «cal paraigua?», «es pot estendre la
 * roba?», «millor moment per sortir?». Se quitó, y no por gusto:
 *
 *  · **Mitad de las preguntas no tenían umbral.** Tender la ropa se puede hacer a
 *    otra hora y no pasa nada, y el «mejor momento para salir» salía de una
 *    puntuación de comodidad con pesos que nos habíamos inventado. Este sitio no
 *    publica números que nadie pueda discutir.
 *  · **La otra mitad estaba duplicada.** El índice UV y la racha ya salen en las
 *    tarjetas de franja, y allí además están situados en el tiempo.
 *  · **El formato tampoco era el del sitio.** Aquí la información va en prosa o
 *    en tarjetas de datos con etiqueta en versalitas; una rejilla de tarjetas de
 *    pregunta y respuesta con un filete de color es un idioma distinto, y que
 *    dos partes de la misma página hablen distinto se nota antes que cualquier
 *    argumento.
 *
 * Lo que queda son tres cosas, en el orden en que se leen: la frase, la tira de
 * franjas, y lo que hay que tener en cuenta — solo con umbrales citables.
 */

function PartCard({ part }: { part: DayPart }) {
  const gust = part.gustMax != null ? msToKmh(part.gustMax) : null;

  return (
    <li className="w-[136px] shrink-0 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] p-2.5">
      <p className="truncate text-xs font-semibold text-[var(--ink-2)]" title={part.label}>
        {part.label}
      </p>
      <p className="tnum text-[11px] text-[var(--muted)]">
        {hour(part.first)}–{hour(part.last)}
      </p>

      <div className="mt-1.5 flex items-center gap-2">
        <WeatherIcon code={part.weatherCode} isDay={part.isDay} size={30} />
        <span className="flex items-baseline gap-1">
          {part.tMax != null && (
            <span
              className="tnum rounded px-1.5 py-0.5 text-sm font-semibold"
              style={{ background: temperatureColor(part.tMax), color: temperatureInk(part.tMax) }}
            >
              {tempTiny(part.tMax)}
            </span>
          )}
          {part.tMin != null && part.tMax != null && Math.round(part.tMax) !== Math.round(part.tMin) && (
            <span className="tnum text-xs text-[var(--muted)]">{tempTiny(part.tMin)}</span>
          )}
        </span>
      </div>

      <div className="mt-1.5 space-y-0.5 text-[11px] leading-tight">
        {part.precip >= 0.1 || part.precipProb >= 30 ? (
          <p className="tnum font-medium" style={{ color: 'oklch(52% 0.13 245)' }}>
            {part.precip >= 0.1 && `${num(part.precip, 1)} mm`}
            {part.precip >= 0.1 && part.precipProb > 0 && ' · '}
            {part.precipProb > 0 && `${part.precipProb} %`}
          </p>
        ) : (
          <p className="text-[var(--line)]">sense pluja</p>
        )}
        {/* Solo la racha realmente destacable: a 40 km/h salía en todas las
            franjas y dejaba de significar nada. */}
        {gust != null && gust >= 50 && (
          <p className="tnum text-[var(--muted)]">ratxa {gust.toFixed(0)} km/h</p>
        )}
        {part.uvMax != null && part.uvMax >= 6 && (
          <p className="tnum" style={{ color: part.uvMax >= 8 ? 'var(--bad)' : 'var(--warn)' }}>
            UV {part.uvMax}
          </p>
        )}
      </div>
    </li>
  );
}

export function Headline({ narrative }: { narrative: Narrative }) {
  const { today, change, tomorrow, vsYesterday, parts, notes } = narrative;

  return (
    <section className="mt-5">
      <div className="max-w-[64ch]">
        <p className="text-lg leading-snug text-[var(--ink)]">
          {today}
          {change && <span className="font-medium"> {change}</span>}
        </p>
        {(tomorrow || vsYesterday) && (
          <p className="mt-1.5 leading-snug text-[var(--ink-2)]">
            {[vsYesterday, tomorrow].filter(Boolean).join(' ')}
          </p>
        )}
      </div>

      {parts.length > 0 && (
        <div className="scroll-x mt-4">
          <ol className="flex min-w-max gap-2">
            {parts.map((p) => <PartCard key={`${p.day}${p.key}`} part={p} />)}
          </ol>
        </div>
      )}

      {/* Las advertencias van después de la tira, no antes: primero la respuesta
          y el panorama, luego los matices. Y en prosa, como el resto del sitio. */}
      {notes.length > 0 && (
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-[var(--ink-2)]">
          {notes.join(' ')}
        </p>
      )}
    </section>
  );
}
