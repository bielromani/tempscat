import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { absolute } from '@/lib/site';
import { publishedPlaces } from '@/lib/territory';

const PLACES = publishedPlaces().toLocaleString('ca-ES');

/**
 * Documentación del feed, en catalán y legible por una persona.
 *
 * El feed sin esta página es un secreto: nadie adivina una URL. Y va indexada a
 * propósito —al contrario que las respuestas del propio feed— porque «API del
 * temps a Catalunya» es una búsqueda con intención y sin nadie atendiéndola.
 */
export const revalidate = 86_400;

export const metadata: Metadata = {
  title: 'Dades obertes · API del temps a Catalunya',
  description:
    `Feed públic en JSON i CSV per a qualsevol dels ${PLACES} llocs de Catalunya: `
    + 'observació de la XEMA, predicció multimodel, qualitat de l\'aire i avisos oficials.',
  alternates: { canonical: '/dades' },
};

const EXAMPLE = '/api/lloc/conca-de-barbera/montblanc';

/** Un nom de camp o un fragment de codi dins d'una frase. */
function C({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-[var(--glass-line)] bg-[var(--paper)] px-1.5 py-px font-mono text-[0.86em] text-[var(--ink)]">
      {children}
    </code>
  );
}

/**
 * Un bloc de codi: fons fosc damunt del vidre, perquè la lletra de màquina es
 * llegeixi com a tal. El que no hi cap es parteix, no es desplaça.
 */
function Code({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <pre
      className={`whitespace-pre-wrap rounded-xl border border-[var(--glass-line)] bg-[var(--paper)] px-4 py-3 font-mono text-[13px] leading-relaxed text-[var(--ink-2)] [overflow-wrap:anywhere] ${className}`}
    >
      {children}
    </pre>
  );
}

/** Una adreça que es pot partir després de cada barra, i no pel mig d'un nom. */
function Path({ path }: { path: string }) {
  const parts = path.split('/');
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>{p}{i < parts.length - 1 && <>/<wbr /></>}</span>
      ))}
    </>
  );
}

/** Una clau del JSON d'exemple. */
function K({ children }: { children: string }) {
  return <span className="text-[var(--accent)]">&quot;{children}&quot;</span>;
}

function Endpoint({
  path, children, example,
}: {
  path: string;
  children: React.ReactNode;
  example: string;
}) {
  return (
    <li className="card flex flex-col">
      <Code>
        <span className="font-semibold text-[var(--accent)]">GET</span> <Path path={path} />
      </Code>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">{children}</p>
      <p className="card-foot pt-3" style={{ marginTop: 'auto' }}>
        <Link href={example} className="font-mono text-[13px] [overflow-wrap:anywhere]">{example} ›</Link>
      </p>
    </li>
  );
}

export default function DadesPage() {
  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Dades obertes', path: '/dades' },
  ];

  return (
    <article data-wide>
      {/*
        Això és un conjunt de dades, i té un tipus per dir-ho.

        `Dataset` és el marcatge que llegeix el cercador de conjunts de dades de
        Google, i és **l'únic tipus d'aquest web que descriu el que el lloc té
        de propi**: un punt per lloc amb la seva font, en JSON i en CSV, amb
        llicència declarada. Una pàgina de predicció competeix amb totes les
        altres pàgines de predicció; un conjunt de dades obert de Catalunya amb
        atribució per bloc, amb molt poques.

        La llicència va com a URL i no com a text: és el que la fa llegible per
        una màquina, que és per a qui s'escriu això.
      */}
      <JsonLd data={graph(
        {
          '@type': 'Dataset',
          name: 'El temps a Catalunya, poble a poble',
          description:
            `Observació i predicció per a ${PLACES} poblacions de Catalunya: municipis, `
            + 'nuclis i entitats de població, cada punt amb la seva altitud i '
            + "l'estació automàtica de referència. En JSON i en CSV, sense clau.",
          url: absolute('/dades'),
          inLanguage: 'ca',
          license: 'https://creativecommons.org/licenses/by/4.0/',
          isAccessibleForFree: true,
          keywords: ['meteorologia', 'Catalunya', 'predicció', 'observació', 'dades obertes'],
          spatialCoverage: { '@type': 'Place', name: 'Catalunya' },
          creator: { '@type': 'Organization', name: 'El temps a Catalunya', url: absolute('/') },
          distribution: [
            {
              '@type': 'DataDownload',
              encodingFormat: 'application/json',
              contentUrl: absolute('/api/lloc/maresme/malgrat-de-mar'),
            },
            {
              '@type': 'DataDownload',
              encodingFormat: 'text/csv',
              contentUrl: absolute('/api/lloc/maresme/malgrat-de-mar.csv'),
            },
          ],
        },
        breadcrumbLd(trail),
      )} />

      <PageHero
        crumbs={trail}
        eyebrow="API del temps a Catalunya"
        icon="barometer"
        title="Dades obertes"
        lead={(
          <>
            Tot el que es veu en aquest web es pot llegir en JSON o en CSV, per a
            qualsevol dels {PLACES} llocs. Sense clau, sense registre i sense límit
            de peticions.
          </>
        )}
        stats={[
          { label: 'Llocs', value: PLACES, sub: 'municipis, nuclis i entitats' },
          { label: 'Formats', value: 'JSON', unit: 'i CSV', sub: 'en CSV, la sèrie horària' },
          { label: 'Llicència', value: 'CC BY', unit: '4.0', sub: 'cal citar la font' },
        ]}
        note="El feed llegeix els mateixos fitxers que la pàgina: el que torna és el que s'hi veu."
        aside={(
          <section className="card" aria-label="Una resposta d'exemple">
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/barometer.svg" width={22} height={22} alt="" />
              Una resposta, per blocs
            </p>
            <Code>
              <span className="font-semibold text-[var(--accent)]">GET</span> <Path path={EXAMPLE} />
            </Code>
            <Code className="mt-3">
              {'{\n'}
              {'  '}<K>version</K>: 1,{'\n'}
              {'  '}<K>sources</K>: [ … ],{'\n'}
              {'  '}<K>location</K>: {'{'} … {'}'},{'\n'}
              {'  '}<K>observation</K>: {'{'} … {'}'},{'\n'}
              {'  '}<K>forecast</K>: {'{'}{'\n'}
              {'    '}<K>now</K>, <K>hourly</K>, <K>daily</K>, …{'\n'}
              {'  '}{'}'},{'\n'}
              {'  '}<K>rain_windows</K>: [ … ],{'\n'}
              {'  '}<K>summary</K>: {'{'} … {'}'},{'\n'}
              {'  '}<K>air_quality</K>: {'{'} … {'}'},{'\n'}
              {'  '}<K>warnings</K>: [ … ]{'\n'}
              {'}'}
            </Code>
            <p className="card-foot">
              <Link href={EXAMPLE}>Obriu-la sencera ›</Link>
            </p>
          </section>
        )}
      />

      <Section id="punts" title="Punts d'accés">
        <ul className="card-grid">
          <Endpoint path="/api/lloc/{comarca}/{municipi}" example={EXAMPLE}>
            Observació, predicció horària i diària, franges del dia, finestres de
            pluja amb la seva intensitat, qualitat de l&apos;aire, avisos oficials i
            el resum en català: les mateixes frases que surten a la fitxa.
          </Endpoint>

          <Endpoint path="/api/lloc/{comarca}/{municipi}/{nucli}" example="/api/lloc/conca-de-barbera/montblanc/lilla">
            Igual, per a un nucli o una entitat de població: la predicció de Lilla
            no és la de Montblanc.
          </Endpoint>

          <Endpoint path="/api/ranquings" example="/api/ranquings">
            Els extrems del dia: on ha fet la màxima i la mínima, quina estació ha
            tingut més amplitud tèrmica, on ha plogut més i les ratxes més fortes.
          </Endpoint>
        </ul>
      </Section>

      <Section id="parametres" title="Paràmetres">
        <div className="card">
          <div className="scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Paràmetre</th>
                  <th scope="col">Què fa</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="whitespace-nowrap"><C>hours</C></td>
                  <td className="leading-relaxed">
                    Hores de sèrie horària{' '}
                    <strong className="font-semibold text-[var(--ink)]">comptades des de les 00:00
                    d&apos;avui</strong>, no des d&apos;ara: el feed torna el mateix que dibuixa
                    la pàgina, dia sencer inclòs. Per defecte 48; el màxim és 168, que és
                    l&apos;horitzó del model.
                    <span className="mt-1.5 block">
                      Per a les pròximes N hores, <C>forecast.now</C> porta l&apos;hora en curs
                      i el seu índex dins la sèrie: així no cal recalcular la zona horària de
                      Madrid al client.
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap"><C>format=csv</C></td>
                  <td className="leading-relaxed">
                    La sèrie horària en CSV, amb el vent ja en km/h i la procedència a les
                    línies de comentari. Pensat per obrir-lo en un full de càlcul.
                    <span className="mt-1.5 block">
                      <Link
                        href={`${EXAMPLE}?format=csv`}
                        className="font-mono text-[13px] [overflow-wrap:anywhere]"
                        style={{ color: 'var(--accent)' }}
                      >
                        {EXAMPLE}?format=csv
                      </Link>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section id="camps" title="Què porta cada resposta">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4">
          <div className="card prose">
            <h3 style={{ marginTop: 0 }}>La procedència de cada número</h3>
            <p>
              Cada observació porta l&apos;estació d&apos;on surt, a quina distància és i
              quant desnivell hi ha. <C>temperature_station</C> és la lectura crua, i{' '}
              <C>temperature</C>, la mateixa corregida pel desnivell amb el gradient
              estàndard de 6,5 °C/km. Amb les dues podeu decidir si us fieu de la
              correcció.
            </p>
          </div>
          <div className="card prose">
            <h3 style={{ marginTop: 0 }}>La intensitat de la pluja, no només l&apos;acumulat</h3>
            <p>
              Cada finestra de pluja porta la seva hora punta i quants mil·límetres
              cauen en aquella hora, amb l&apos;escala de l&apos;AEMET. «Plou de 4 a 7» no
              distingeix el plugim d&apos;una tempesta; <C>peak_precipitation</C> sí.
            </p>
          </div>
          <div className="card prose">
            <h3 style={{ marginTop: 0 }}>El desacord entre models</h3>
            <p>
              <C>spread</C> és la desviació entre els models que entren al consens. Quan
              val <C>null</C>, en aquell punt només hi ha un model, i amb un de sol no hi
              ha desacord.
            </p>
          </div>
          <div className="card prose">
            <h3 style={{ marginTop: 0 }}>Les frases</h3>
            <p>
              <C>summary</C> porta el resum en català. El generen plantilles
              deterministes i no un model de llenguatge: amb les mateixes dades en surt
              sempre la mateixa frase.
            </p>
          </div>
        </div>
      </Section>

      <Section id="condicions" title="Condicions">
        <div className="card prose">
          <p>
            Les dades són <strong>CC BY 4.0</strong>: es poden fer servir per a
            qualsevol cosa, també comercial, però <strong>cal citar la font</strong>.
            Cada resposta porta un camp <C>sources</C> amb els crèdits exactes de cada
            bloc, perquè no són els mateixos: l&apos;observació és del Meteocat, la
            predicció d&apos;Open-Meteo, la qualitat de l&apos;aire de CAMS i els avisos
            de l&apos;AEMET.
          </p>
          <p>
            Cada resposta porta també un camp <C>version</C>. Mentre valgui 1, els
            noms de camp no desapareixeran: si cal canviar-los, pujarà el número.
          </p>
          <p>
            Els noms dels camps van en anglès: són els identificadors que fa servir
            el projecte per dins, i coincideixen amb els d&apos;Open-Meteo i de la XEMA.
          </p>
          <p className="text-sm text-[var(--muted)]">
            La predicció és orientativa i el feed no és un servei amb garanties. Per
            a decisions de seguretat, la font són el Meteocat i Protecció Civil. Si
            munteu res que en depengui, a <Link href="/estat">l&apos;estat de les dades</Link>{' '}
            hi ha quan es va actualitzar cada font per última vegada.
          </p>
        </div>
      </Section>
    </article>
  );
}
