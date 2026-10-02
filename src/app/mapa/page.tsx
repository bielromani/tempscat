import type { Metadata } from 'next';
import Link from 'next/link';
import { TemperatureLegend, TemperatureMap } from '@/components/TemperatureMap';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section, StatGrid } from '@/components/PageHero';
import { Fold } from '@/components/Fold';
import { temperatureMap } from '@/lib/map';
import { allObservations } from '@/lib/weather';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { comarcaName, hourSpoken, num } from '@/lib/format';

/**
 * El mapa de temperatures, de tot Catalunya i d'una ullada.
 *
 * És la pàgina que fa evident el que el projecte diu de si mateix: que la
 * temperatura no és una xifra per a tot el país. Un dia d'agost hi ha catorze
 * graus de diferència entre el Pirineu i l'Ebre, i aquí es veuen.
 *
 * **No carrega ni una línia de JavaScript.** És un SVG del servidor amb 43
 * camins, i cada comarca és un enllaç a la seva pàgina. El mapa que sí que en
 * necessita —radar, temperatura municipi a municipi, vent— és a
 * `/mapa/interactiu`.
 *
 * ## Per què el mapa no va a la capçalera
 *
 * A les altres pàgines de secció el dibuix va a la dreta del títol, en una
 * targeta de 30 rem. Aquí el mapa **és** el contingut: a aquella mida els noms
 * de les comarques surten a set píxels, i és justament el que la portada ja
 * ensenya en petit. Així que va a sota, a l'ample de la pàgina.
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mapa de temperatures de Catalunya, comarca a comarca',
  description:
    'Quina temperatura fa ara a cada comarca de Catalunya, mesurada per les '
    + 'estacions del Meteocat i corregida per l’altitud de cada municipi.',
  alternates: { canonical: '/mapa' },
};

/**
 * L'hora de la lectura més recent, en hora de Madrid.
 *
 * La XEMA publica amb 45–65 minuts de retard i cada estació va al seu pas, així
 * que es diu «fins a» i no «a»: és l'última que ha arribat, no la de totes. Surt
 * de la mateixa instantània que ja ha llegit `temperatureMap()`, que és en
 * memòria: no és una lectura nova.
 */
function lastReading(ts: string[]): string | null {
  const latest = ts.reduce<string | null>((a, b) => (a == null || b > a ? b : a), null);
  if (!latest || Number.isNaN(Date.parse(latest))) return null;
  return new Date(latest)
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .replace(' ', 'T');
}

export default async function MapaPage() {
  const data = await temperatureMap();
  const obs = await allObservations();
  const readAt = obs ? lastReading(obs.data.map((o) => o.ts)) : null;

  const withData = data.comarques
    .filter((c) => c.temperature != null)
    .sort((a, b) => b.temperature! - a.temperature!);

  const warmest = withData[0];
  const coldest = withData.at(-1);
  const spread = warmest && coldest && warmest.code !== coldest.code;

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Mapa', path: '/mapa' },
  ];

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Mapa de temperatures"
        icon="thermometer"
        title="On fa fred i on fa calor"
        lead={spread ? (
          <>
            Ara mateix hi ha{' '}
            <strong className="tnum">{num(warmest.temperature! - coldest.temperature!, 1)} graus</strong>{' '}
            de diferència entre {comarcaName(warmest.name)} i {comarcaName(coldest.name)}.
          </>
        ) : (
          'Encara no hi ha prou observació per dibuixar el mapa.'
        )}
        note={(
          <>
            Observació de les estacions de la XEMA del Meteocat
            {readAt && <>, amb lectures de fins a {hourSpoken(readAt)}</>}, corregida
            per l’altitud de cada municipi.
          </>
        )}
      >
        {/*
          Les xifres, en una columna de la mida de la de l'entradilla.
          Sense mapa a la dreta, la graella s'estiraria a l'ample de la pàgina i
          tres xifres quedarien a tres-cents píxels l'una de l'altra.
        */}
        {spread && (
          <div className="max-w-[40rem]">
            <StatGrid
              className="mt-6"
              stats={[
                {
                  label: 'La més càlida', icon: 'thermometer',
                  value: num(warmest.temperature, 1), unit: '°C',
                  sub: <Link href={warmest.path}>{comarcaName(warmest.name)}</Link>,
                },
                {
                  label: 'La més freda', icon: 'thermometer',
                  value: num(coldest.temperature, 1), unit: '°C',
                  sub: <Link href={coldest.path}>{comarcaName(coldest.name)}</Link>,
                },
                {
                  label: 'Amb observació',
                  value: String(data.withData), unit: `de ${data.comarques.length}`,
                  sub: data.withData < data.comarques.length
                    ? 'comarques; les altres, ratllades'
                    : 'comarques',
                },
              ]}
            />
          </div>
        )}
      </PageHero>

      <section className="card" aria-label="Temperatura de cada comarca, ara">
        <p className="card-label">
          {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
          <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
          Ara, comarca a comarca
        </p>
        <div className="mx-auto max-w-[50rem]">
          <TemperatureMap data={data} />
          <TemperatureLegend
            span={data.min != null && data.max != null ? { min: data.min, max: data.max } : undefined}
          />
        </div>
        <p className="card-foot">
          <Link href="/mapa/interactiu">
            El mapa que es pot moure, amb el radar i cada municipi ›
          </Link>
        </p>
      </section>

      {withData.length > 0 && (
        <Section id="ranquing" title="De la més càlida a la més freda">
          <div className="card">
            <ol className="rows rows-cols">
              {withData.map((c, i) => (
                <li key={c.code}>
                  <span className="w-5 shrink-0 text-right text-xs text-[var(--muted)] tnum" aria-hidden>
                    {i + 1}
                  </span>
                  <Link href={c.path} className="row-main flex-1">
                    <span className="row-title">{comarcaName(c.name)}</span>
                    {/* Al mòbil la llista va en una columna i són 43 files:
                        amb la segona línia, el doble d'alt. La xifra de
                        municipis també és al títol de cada comarca del mapa. */}
                    <span className="hidden truncate text-[12.5px] text-[var(--muted)] tnum sm:block">
                      {c.observed} de {c.total} municipis
                    </span>
                  </Link>
                  <span
                    className="temp-pill"
                    style={{ background: temperatureColor(c.temperature!), color: temperatureInk(c.temperature!) }}
                  >
                    {num(c.temperature, 1)}°
                  </span>
                </li>
              ))}
            </ol>
            <p className="source">
              Mediana de la temperatura dels municipis de cada comarca, cadascun amb
              l&apos;observació de la seva estació corregida pel desnivell.
              {obs && <> {obs.source}.</>} Límits administratius de l&apos;Institut
              Cartogràfic i Geològic de Catalunya.
            </p>
          </div>
        </Section>
      )}

      <Fold title="Què és exactament cada xifra" summary="La mediana dels municipis, no la mitjana de les estacions">
        <div className="card prose">
          <p>
            <strong>La mediana dels municipis de la comarca</strong>, no la
            mitjana de les seves estacions. Al Ripollès hi ha estacions a 1.900
            metres i a 700, i la mitjana entre elles no correspon a cap lloc
            habitat. Cada municipi porta l&apos;observació de la seva estació
            corregida pel desnivell, i la mediana d&apos;aquests valors descriu la
            comarca sense que un sol poble de muntanya la desplaci.
          </p>
          <p>
            Les comarques ratllades no tenen prou municipis amb observació ara
            mateix. Un color de l&apos;escala es llegiria com una temperatura.
          </p>
        </div>
      </Fold>
    </article>
  );
}
