import Link from 'next/link';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { monthOf, num, ordinal, signed, temp } from '@/lib/format';
import type { ComarcaComparison, Ranking } from '@/lib/comparison';

/**
 * Dónde queda esta ubicación dentro de su comarca.
 *
 * La frase importa tanto como la tira de colores: «el 3r punt més fresc dels 23»
 * es lo que la gente repite, y es lo que puede acabar en un fragmento destacado
 * de Google. Por eso va escrita en texto de verdad, no compuesta con números
 * sueltos dentro de cajas.
 *
 * La tira muestra siete posiciones alrededor —no las veintitrés— porque una
 * lista completa obliga a buscar dónde estás. Con siete, se ve de un vistazo.
 */

function positionSentence(r: Ranking, nom: string, when: string): string {
  if (r.rank === 1) return `${when}, ${nom} és el punt més fresc dels ${r.total} de la comarca.`;
  if (r.rank === r.total) return `${when}, ${nom} és el punt més càlid dels ${r.total} de la comarca.`;
  const fromTop = r.total - r.rank + 1;
  // Se cuenta desde el extremo más cercano: «el 3r més càlid» se entiende de
  // golpe, «el 21è més fresc de 23» obliga a hacer la resta mentalmente.
  return fromTop < r.rank
    ? `${when}, ${nom} és el ${ordinal(fromTop)} punt més càlid dels ${r.total} de la comarca.`
    : `${when}, ${nom} és el ${ordinal(r.rank)} punt més fresc dels ${r.total} de la comarca.`;
}

function Strip({ r, unit }: { r: Ranking; unit: string }) {
  return (
    <ol className="mt-3 flex gap-1.5 overflow-x-auto">
      {r.around.map((p) => (
        <li key={p.id} className="min-w-0 flex-1">
          <Link
            href={p.path}
            aria-current={p.self ? 'page' : undefined}
            className="block rounded-md px-1.5 py-1.5 text-center no-underline"
            style={{
              background: temperatureColor(p.value),
              color: temperatureInk(p.value),
              // El punto actual se marca con un anillo, no con otro color: el
              // color ya está ocupado codificando la temperatura, y usarlo dos
              // veces para dos cosas distintas es lo que hace ilegible un gráfico.
              outline: p.self ? '2px solid var(--ink)' : 'none',
              outlineOffset: 1,
            }}
          >
            <span className="tnum block text-sm font-semibold">{num(p.value, 1)}</span>
            <span className="block truncate text-[10px] leading-tight" style={{ opacity: 0.85 }}>
              {p.nom}
            </span>
          </Link>
        </li>
      ))}
      <li className="sr-only">Valors en {unit}</li>
    </ol>
  );
}

function Extremes({ r }: { r: Ranking }) {
  return (
    <p className="mt-2 text-xs text-[var(--muted)]">
      A la comarca, de{' '}
      <Link href={r.coldest.path} className="text-[var(--ink-2)] no-underline hover:underline">
        {r.coldest.nom}
      </Link>{' '}
      <span className="tnum">({temp(r.coldest.value)})</span> a{' '}
      <Link href={r.warmest.path} className="text-[var(--ink-2)] no-underline hover:underline">
        {r.warmest.nom}
      </Link>{' '}
      <span className="tnum">({temp(r.warmest.value)})</span>.
    </p>
  );
}

export function ComarcaCompare({ cmp, nom }: { cmp: ComarcaComparison; nom: string }) {
  const { now, month } = cmp;
  if (!now && !month) return null;

  // Con una sola estación en toda la comarca, la clasificación no compara
  // medidas: compara altitudes sobre una misma lectura. Decirlo es la
  // diferencia entre un dato y un adorno.
  const singleStation = (now ?? month)!.nStations <= 1;

  return (
    <section>
      {now && (
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
          <p className="text-[var(--ink)]">{positionSentence(now, nom, 'Ara mateix')}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {Math.abs(now.vsMedian) < 0.3
              ? 'Pràcticament igual que la mitjana comarcal.'
              : `${signed(now.vsMedian, 1, '°C')} respecte de la mediana de la comarca.`}
          </p>
          <Strip r={now} unit="graus Celsius" />
          <Extremes r={now} />
        </div>
      )}

      {month && (
        <div className="mt-3 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
          <p className="text-[var(--ink)]">
            {positionSentence(month, nom, `Al llarg ${monthOf(cmp.monthNumber)}`)}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Mitjana de les temperatures mitjanes diàries del mes, {temp(month.value)}.
          </p>
          <Strip r={month} unit="graus Celsius" />
          <Extremes r={month} />
        </div>
      )}

      {cmp.altitude && (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Per altitud és el {ordinal(cmp.altitude.rank)} punt més enlairat dels{' '}
          {cmp.altitude.total} de la comarca.
        </p>
      )}

      <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
        {singleStation ? (
          <>
            Atenció: tota la comarca penja d&apos;una sola estació automàtica, així
            que aquesta classificació ordena desnivells sobre una mateixa lectura,
            no mesures independents. És útil per situar-se, però no és el mateix
            que tenir un termòmetre a cada poble.
          </>
        ) : (
          <>
            Cada valor surt de l&apos;estació de referència del punt, corregida pel
            desnivell; hi intervenen {(now ?? month)!.nStations} estacions
            diferents. No és un termòmetre a cada poble, i les nits d&apos;inversió
            tèrmica la correcció pot quedar-se curta o passar-se.
          </>
        )}
      </p>
    </section>
  );
}
