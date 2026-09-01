import type { Metadata } from 'next';
import Link from 'next/link';
import { TemperatureLegend, TemperatureMap } from '@/components/TemperatureMap';
import { temperatureMap } from '@/lib/map';
import { comarcaName, num } from '@/lib/format';

/**
 * El mapa de temperatures, de tot Catalunya i d'una ullada.
 *
 * És la pàgina que fa evident el que el projecte diu de si mateix: que la
 * temperatura no és una xifra per a tot el país. Un dia d'agost hi ha catorze
 * graus de diferència entre el Pirineu i l'Ebre, i aquí es veuen.
 *
 * **No carrega ni una línia de JavaScript.** És un SVG del servidor amb 43
 * camins, i cada comarca és un enllaç a la seva pàgina. Els mapes que sí que
 * en necessiten —radar animat, vent amb partícules— aniran a la seva pròpia
 * ruta el dia que existeixin.
 */
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Mapa de temperatures de Catalunya, comarca a comarca',
  description:
    'Quina temperatura fa ara a cada comarca de Catalunya, mesurada per les '
    + 'estacions del Meteocat i corregida per l’altitud de cada municipi.',
  alternates: { canonical: '/mapa' },
};

export default async function MapaPage() {
  const data = await temperatureMap();

  const withData = data.comarques
    .filter((c) => c.temperature != null)
    .sort((a, b) => b.temperature! - a.temperature!);

  const warmest = withData[0];
  const coldest = withData.at(-1);

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Mapa</span>
      </nav>

      <header className="mb-6 max-w-[65ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          On fa fred i on fa calor
        </h1>
        {warmest && coldest && warmest.code !== coldest.code ? (
          <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
            Ara mateix hi ha{' '}
            <strong className="tnum font-semibold text-[var(--ink)]">
              {num(warmest.temperature! - coldest.temperature!, 1)} graus
            </strong>{' '}
            entre {comarcaName(warmest.name)} —la més càlida, amb{' '}
            <span className="tnum">{num(warmest.temperature, 1)} °C</span>— i{' '}
            {comarcaName(coldest.name)}, amb{' '}
            <span className="tnum">{num(coldest.temperature, 1)} °C</span>.
          </p>
        ) : (
          <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
            Encara no hi ha prou observació per dibuixar el mapa.
          </p>
        )}
      </header>

      <TemperatureMap data={data} />
      <TemperatureLegend
        span={data.min != null && data.max != null ? { min: data.min, max: data.max } : undefined}
      />

      {withData.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">
            De la més càlida a la més freda
          </h2>
          <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {withData.map((c) => (
              <li key={c.code} className="flex items-baseline justify-between gap-3 border-b border-[var(--line-soft)] py-1.5">
                <Link href={c.path} className="truncate text-sm text-[var(--ink-2)] no-underline hover:text-[var(--ink)]">
                  {comarcaName(c.name)}
                </Link>
                <span className="tnum shrink-0 text-sm font-medium text-[var(--ink)]">
                  {num(c.temperature, 1)} °C
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-8 max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
          Què és exactament cada xifra
        </h2>
        <p>
          <strong className="font-medium text-[var(--ink)]">La mediana dels municipis de la
          comarca</strong>, no la mitjana de les seves estacions. Al Ripollès hi ha
          estacions a 1.900 metres i a 700, i la mitjana entre elles no
          correspon a cap lloc habitat. Cada municipi porta l&apos;observació de la
          seva estació corregida pel desnivell, i la mediana d&apos;aquests valors sí
          que descriu la comarca.
        </p>
        <p>
          Mediana i no mitjana perquè <strong className="font-medium text-[var(--ink)]">un sol
          poble de muntanya no desplaci el valor de tota la comarca</strong>.
        </p>
        <p>
          Les comarques ratllades no tenen prou municipis amb observació ara
          mateix. La trama les distingeix d&apos;un color de l&apos;escala, que es
          llegiria com una temperatura.
        </p>
        <p className="text-[var(--muted)]">
          Observació del Meteocat (XEMA), dades obertes. Límits administratius de
          l&apos;Institut Cartogràfic i Geològic de Catalunya. Cada comarca porta a la
          seva pàgina, amb el detall municipi a municipi.
        </p>
      </section>
    </article>
  );
}
