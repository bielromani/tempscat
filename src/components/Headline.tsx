import { WeatherIcon } from './WeatherIcon';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { msToKmh } from '@/lib/variables';
import { hour, num, tempTiny } from '@/lib/format';
import type { Advice, AdviceTone, DayPart, Narrative } from '@/lib/narrative';

/**
 * El titular: la interpretación de los datos, en catalán.
 *
 * Va justo después del panel de condiciones actuales. El número grande es el
 * gancho; esto es la respuesta. Antes se pasaba del termómetro directamente al
 * meteograma de 48 horas, y ahí se perdía a quien solo quería saber si hoy
 * llovería.
 *
 * Tres bloques, de más general a más concreto:
 *
 *  1. **Las frases.** Hoy, lo que condiciona el día, mañana, y cómo va respecto
 *     de ayer. Texto de verdad, no números metidos en cajas: es lo que la gente
 *     repite y lo que puede acabar en un fragmento destacado de Google.
 *  2. **Las franjas.** Cuatro cifras en lugar de veinticuatro.
 *  3. **Las preguntas.** Paraigua, glaçada, protecció solar. Solo las que
 *     aplican — un bloque que dice «no cal paraigua» los 300 días que no llueve
 *     deja de leerse.
 */

const TONE: Record<AdviceTone, string> = {
  good: 'var(--good)',
  info: 'var(--accent)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
};

function PartCard({ part }: { part: DayPart }) {
  const gust = part.gustMax != null ? msToKmh(part.gustMax) : null;

  return (
    <li className="w-[128px] shrink-0 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] p-2.5">
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

function AdviceCard({ a }: { a: Advice }) {
  return (
    <li
      className="rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2.5"
      // El tono va en un filete lateral, no en el fondo. El color de fondo ya
      // está reservado para codificar temperatura y calidad del aire, y usarlo
      // aquí para "esto es un consejo" haría competir dos significados.
      style={{ borderLeft: `3px solid ${TONE[a.tone]}` }}
    >
      <p className="text-xs text-[var(--muted)]">{a.question}</p>
      <p className="mt-0.5 font-medium text-[var(--ink)]">{a.answer}</p>
      {a.detail && <p className="mt-0.5 text-xs text-[var(--muted)]">{a.detail}</p>}
    </li>
  );
}

export function Headline({ narrative }: { narrative: Narrative }) {
  const { today, change, tomorrow, vsYesterday, parts, advice } = narrative;

  return (
    <section className="mt-5">
      <div className="max-w-[62ch]">
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

      {advice.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {advice.map((a) => <AdviceCard key={a.key} a={a} />)}
        </ul>
      )}
    </section>
  );
}
