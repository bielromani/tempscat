import type { Metadata } from 'next';
import Link from 'next/link';
import { comarcaName, dateLong, num } from '@/lib/format';
import { airStations, stationKind } from '@/lib/air-stations';
import { PointsMap } from '@/components/PointsMap';
import { mapOutline } from '@/lib/map';
import { concentrationColor } from '@/lib/scales';

/**
 * La calidad del aire medida, estación por estación.
 *
 * Es la contrapartida honesta del bloque de CAMS que ya sale en cada ficha: allí
 * un modelo de 11 km dice cómo está el aire **ahora** en todas partes; aquí unos
 * aparatos dicen cómo estuvo **ayer** donde los hay.
 *
 * La página existe en buena medida para poder decir esa diferencia en voz alta.
 * Y para decir la otra que casi nadie explica: **el tipo de estación cambia lo
 * que mide más que la distancia**. Una de tráfico en una calle con cuesta y otra
 * de fondo en un parque, a un kilómetro, dan NO₂ que no se parecen — y las dos
 * están bien.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Qualitat de l’aire mesurada a Catalunya',
  description:
    'Les mitjanes diàries de NO₂, ozó i partícules a les estacions de la Xarxa de '
    + 'Vigilància i Previsió de la Contaminació Atmosfèrica.',
  alternates: { canonical: '/aire' },
};

/** Los que se muestran en columna, en el orden en que importan. */
const COLUMNS = [
  { slug: 'no2', label: 'NO₂' },
  { slug: 'o3', label: 'O₃' },
  { slug: 'pm10', label: 'PM10' },
  { slug: 'pm2_5', label: 'PM2,5' },
  { slug: 'so2', label: 'SO₂' },
];

export default async function AirePage() {
  const data = await airStations();

  if (!data?.list.length) {
    return (
      <article>
        <h1 className="text-3xl font-semibold tracking-tight">Qualitat de l&apos;aire mesurada</h1>
        <p className="mt-4 text-[var(--muted)]">
          Encara no hi ha dades descarregades. Apareixen quan el worker de la XVPCA
          hagi corregut per primera vegada.
        </p>
      </article>
    );
  }

  const value = (s: (typeof data.list)[number], slug: string) =>
    s.measurements.find((m) => m.slug === slug && m.dailyMean != null)?.dailyMean ?? null;

  const rows = [...data.list].sort((a, b) => (value(b, 'no2') ?? -1) - (value(a, 'no2') ?? -1));

  const outline = mapOutline();
  /*
   * Les estacions amb NO₂ i el pitjor valor del dia, que és el que dóna
   * l'escala. Es calcula un cop: dins del `map` es tornaria a recalcular a
   * cada punt, i el dia que una acabi tenint un valor diferent del que ha
   * fixat l'escala, el mapa sortiria amb un color que no vol dir res.
   */
  const mapped = data.list
    .map((st) => ({ s: st, v: value(st, 'no2') }))
    .filter((x): x is { s: typeof x.s; v: number } => x.v != null);
  const worstNo2 = mapped.reduce((a, x) => Math.max(a, x.v), 0);

  const worstPm10 = rows
    .map((s) => ({ s, v: value(s, 'pm10') }))
    .filter((x) => x.v != null)
    .sort((a, b) => (b.v ?? 0) - (a.v ?? 0))[0];

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Aire mesurat</span>
      </nav>

      <header className="mb-6 max-w-[65ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          L&apos;aire, mesurat
        </h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
          Mitjanes de tot el dia a {rows.length} estacions de la XVPCA,{' '}
          {data.day ? <>del <strong className="font-medium text-[var(--ink)]">{dateLong(data.day)}</strong></> : 'del darrer dia complet'}.
          {worstPm10?.v != null && (
            <> El PM10 més alt va ser de{' '}
              <span className="tnum font-medium text-[var(--ink)]">{num(worstPm10.v, 1)} µg/m³</span>{' '}
              a {worstPm10.s.name}.</>
          )}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          <strong className="font-medium text-[var(--ink-2)]">Això no és l&apos;aire d&apos;ara.</strong>{' '}
          El registre s&apos;actualitza un cop al dia de matinada i porta unes vint
          hores de retard: són mesures del dia anterior, no lectures en viu.
          L&apos;índex que surt a cada fitxa és d&apos;un model, cobreix tot el
          territori i sí que va al dia — les dues coses són útils i no són la
          mateixa.
        </p>
      </header>

      {/*
        On són les estacions i quant hi van mesurar.

        La pàgina era una taula de 76 files ordenada per NO₂, i una taula no
        diu que el diòxid de nitrogen és una cosa de trànsit i que per tant es
        concentra a l'àrea de Barcelona. El mapa ho diu sense una frase.

        El color és **relatiu al pitjor del dia** i no una banda oficial: les
        bandes europees són d'un índex horari i això és una mitjana diària. El
        peu ho diu, perquè un mapa amb els colors de l'índex i uns valors que
        no són els que l'índex classifica seria una etiqueta manllevada.
      */}
      {mapped.length > 0 && (
        <section className="mb-8">
          <PointsMap
            outline={outline.features}
            projection={outline.projection}
            width={outline.width}
            height={outline.height}
            ariaLabel={`Mapa de Catalunya amb el diòxid de nitrogen mesurat a ${mapped.length} estacions`}
            points={mapped.map((m) => ({
              key: m.s.code,
              lat: m.s.lat,
              lon: m.s.lon,
              r: 6,
              fill: concentrationColor(m.v, worstNo2),
              tip: `${m.s.name}: ${num(m.v, 1)} µg/m³ de NO₂`,
            }))}
            footer={(
              <>
                Cada punt és una estació de la XVPCA i el color és el
                <strong className="font-medium text-[var(--ink-2)]"> diòxid de nitrogen</strong>,
                de clar a fosc segons el pitjor valor del dia. No és una
                qualificació: és una mitjana diària, i les bandes oficials són
                d&apos;un índex horari. El NO₂ ve del trànsit, i per això
                s&apos;acumula on n&apos;hi ha.
              </>
            )}
          />
        </section>
      )}

      <div className="scroll-x">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Mitjana diària de cada contaminant per estació, en µg/m³
          </caption>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Estació</th>
              {COLUMNS.map((c) => (
                <th key={c.slug} scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">
                  {c.label}
                </th>
              ))}
              <th scope="col" className="border-b border-[var(--line)] py-2 font-semibold">Tipus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.code} className="border-b border-[var(--line-soft)]">
                <td className="py-2.5 pr-4">
                  <span className="block text-[var(--ink)]">{s.name}</span>
                  <span className="block text-xs text-[var(--muted)]">
                    {s.municipality}
                    {s.comarca && ` · ${comarcaName(s.comarca)}`}
                  </span>
                </td>
                {COLUMNS.map((c) => {
                  const v = value(s, c.slug);
                  return (
                    <td key={c.slug} className="tnum py-2.5 pr-4 text-[var(--ink-2)]">
                      {v != null ? num(v, 1) : <span className="text-[var(--line)]">—</span>}
                    </td>
                  );
                })}
                <td className="py-2.5 text-xs text-[var(--muted)]">{stationKind(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-8 max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
          Com es llegeix
        </h2>
        <p>
          Totes les xifres són <strong className="font-medium text-[var(--ink)]">mitjanes de les
          24 hores</strong> del dia, en µg/m³, i només surten quan el dia està
          sencer: una mitjana de mitja jornada no és una mitjana diària.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">El tipus d&apos;estació canvia el
          que mesura més que la distància.</strong> Una de trànsit al costat d&apos;una
          via amb pendent i una de fons en un parc, a un quilòmetre l&apos;una de
          l&apos;altra, donen NO₂ que no s&apos;assemblen — i les dues estan bé. La
          columna de la dreta diu de quina mena és cadascuna.
        </p>
        <p>
          L&apos;ozó fa el camí contrari que el trànsit: puja on hi ha menys cotxes i
          més sol, perquè els òxids de nitrogen el destrueixen. Un valor alt d&apos;ozó
          en una estació rural i baix a la ciutat és el comportament normal, no un
          error.
        </p>
        <p className="text-[var(--muted)]">
          {data.source}. Els contaminants que no mesura cada estació surten amb un
          guió: no és un zero, és que allà no hi ha aparell.
        </p>
      </section>
    </article>
  );
}
