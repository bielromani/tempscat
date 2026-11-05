import Link from 'next/link';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { aName, deName, monthOf, num, ordinal, placeName, signed, temp } from '@/lib/format';
import { tr, type Lang } from '@/lib/lang';
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

function positionSentence(r: Ranking, nom: string, when: string, lang: Lang = 'ca'): string {
  if (lang === 'es') {
    const n = placeName(nom, lang);
    if (r.rank === 1) return `${when}, ${n} es el punto más fresco de los ${r.total} de la comarca.`;
    if (r.rank === r.total) return `${when}, ${n} es el punto más cálido de los ${r.total} de la comarca.`;
    const top = r.total - r.rank + 1;
    return top < r.rank
      ? `${when}, ${n} es el ${ordinal(top, lang)} punto más cálido de los ${r.total} de la comarca.`
      : `${when}, ${n} es el ${ordinal(r.rank, lang)} punto más fresco de los ${r.total} de la comarca.`;
  }
  if (r.rank === 1) return `${when}, ${nom} és el punt més fresc dels ${r.total} de la comarca.`;
  if (r.rank === r.total) return `${when}, ${nom} és el punt més càlid dels ${r.total} de la comarca.`;
  const fromTop = r.total - r.rank + 1;
  // Se cuenta desde el extremo más cercano: «el 3r més càlid» se entiende de
  // golpe, «el 21è més fresc de 23» obliga a hacer la resta mentalmente.
  return fromTop < r.rank
    ? `${when}, ${nom} és el ${ordinal(fromTop)} punt més càlid dels ${r.total} de la comarca.`
    : `${when}, ${nom} és el ${ordinal(r.rank)} punt més fresc dels ${r.total} de la comarca.`;
}

/**
 * On queda per altitud, dit des de l'extrem més proper.
 *
 * Deia «el 30è punt més enlairat dels 30», que vol dir el més baix i obliga a
 * fer la resta. I sense el total: les frases de temperatura compten només els
 * punts amb lectura —29 a Malgrat— i aquesta tots —30—, i dos «dels N»
 * diferents en el mateix bloc semblaven un error.
 */
function altitudeSentence(a: { rank: number; total: number }, lang: Lang = 'ca'): string {
  if (lang === 'es') {
    if (a.rank === 1) return 'Es el punto más alto de la comarca.';
    if (a.rank === a.total) return 'Es el punto más bajo de la comarca.';
    const bottom = a.total - a.rank + 1;
    return bottom < a.rank
      ? `Por altitud, es el ${ordinal(bottom, lang)} punto más bajo de la comarca.`
      : `Por altitud, es el ${ordinal(a.rank, lang)} punto más alto de la comarca.`;
  }
  if (a.rank === 1) return 'És el punt més enlairat de la comarca.';
  if (a.rank === a.total) return 'És el punt més baix de la comarca.';
  const fromBottom = a.total - a.rank + 1;
  return fromBottom < a.rank
    ? `Per altitud, és el ${ordinal(fromBottom)} punt més baix de la comarca.`
    : `Per altitud, és el ${ordinal(a.rank)} punt més enlairat de la comarca.`;
}

function Strip({ r, unit, lang }: { r: Ranking; unit: string; lang: Lang }) {
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
      <li className="sr-only">{tr(lang, 'Valors en', 'Valores en')} {unit}</li>
    </ol>
  );
}

function Extremes({ r, lang }: { r: Ranking; lang: Lang }) {
  return (
    <p className="mt-2 text-xs text-[var(--muted)]">
      {tr(lang, 'A la comarca, ', 'En la comarca, ')}{' '}
      <Link href={r.coldest.path} className="text-[var(--ink-2)] no-underline hover:underline">
        {deName(r.coldest.nom, lang)}
      </Link>{' '}
      <span className="tnum">({temp(r.coldest.value)})</span>{' '}
      <Link href={r.warmest.path} className="text-[var(--ink-2)] no-underline hover:underline">
        {/* «a» de hasta dónde, no el «en» de `aName()` en castellano. */}
        {lang === 'es' ? `a ${placeName(r.warmest.nom, lang)}` : aName(r.warmest.nom)}
      </Link>{' '}
      <span className="tnum">({temp(r.warmest.value)})</span>.
    </p>
  );
}

export function ComarcaCompare({ cmp, nom, lang = 'ca' }: { cmp: ComarcaComparison; nom: string; lang?: Lang }) {
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const { now, month } = cmp;
  if (!now && !month) return null;

  // Con una sola estación en toda la comarca, la clasificación no compara
  // medidas: compara altitudes sobre una misma lectura. Decirlo es la
  // diferencia entre un dato y un adorno.
  const singleStation = (now ?? month)!.nStations <= 1;

  return (
    <section>
      {now && (
        <div className="card">
          <p className="text-[var(--ink)]">{positionSentence(now, nom, t('Ara mateix', 'Ahora mismo'), lang)}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {Math.abs(now.vsMedian) < 0.3
              ? t('Pràcticament igual que la mitjana comarcal.', 'Prácticamente igual que la media comarcal.')
              : `${signed(now.vsMedian, 1, '°C')} ${t('respecte de la mediana de la comarca.', 'respecto a la mediana de la comarca.')}`}
          </p>
          <Strip r={now} unit={t('graus Celsius', 'grados Celsius')} lang={lang} />
          <Extremes r={now} lang={lang} />
        </div>
      )}

      {month && (
        <div className="mt-3 card">
          <p className="text-[var(--ink)]">
            {positionSentence(month, nom, tr(lang, `Al llarg ${monthOf(cmp.monthNumber)}`, `A lo largo ${monthOf(cmp.monthNumber, lang)}`), lang)}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t('Mitjana de les temperatures mitjanes diàries del mes,', 'Media de las temperaturas medias diarias del mes,')} {temp(month.value)}.
          </p>
          <Strip r={month} unit={t('graus Celsius', 'grados Celsius')} lang={lang} />
          <Extremes r={month} lang={lang} />
        </div>
      )}

      {cmp.altitude && (
        <p className="mt-3 text-xs text-[var(--muted)]">
          {altitudeSentence(cmp.altitude, lang)}
        </p>
      )}

      <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
        {singleStation ? (
          t(
            "Atenció: tota la comarca penja d'una sola estació automàtica, així que aquesta classificació ordena desnivells sobre una mateixa lectura, no mesures independents. És útil per situar-se, però no és el mateix que tenir un termòmetre a cada poble.",
            'Atención: toda la comarca depende de una sola estación automática, así que esta clasificación ordena desniveles sobre una misma lectura, no medidas independientes. Sirve para situarse, pero no es lo mismo que tener un termómetro en cada pueblo.',
          )
        ) : (
          tr(
            lang,
            `Cada valor surt de l'estació de referència del punt, corregida pel desnivell; hi intervenen ${(now ?? month)!.nStations} estacions diferents. No és un termòmetre a cada poble, i les nits d'inversió tèrmica la correcció pot quedar-se curta o passar-se.`,
            `Cada valor sale de la estación de referencia del punto, corregida por el desnivel; intervienen ${(now ?? month)!.nStations} estaciones distintas. No es un termómetro en cada pueblo, y en las noches de inversión térmica la corrección puede quedarse corta o pasarse.`,
          )
        )}
      </p>
    </section>
  );
}
