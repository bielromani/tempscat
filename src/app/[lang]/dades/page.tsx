import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { absolute } from '@/lib/site';
import { publishedPlaces } from '@/lib/territory';
import { int } from '@/lib/format';
import { getLang } from '@/lib/i18n';
import { tr } from '@/lib/lang';

const PLACES = int(publishedPlaces());

/**
 * Documentación del feed, en catalán y legible por una persona.
 *
 * El feed sin esta página es un secreto: nadie adivina una URL. Y va indexada a
 * propósito —al contrario que las respuestas del propio feed— porque «API del
 * temps a Catalunya» es una búsqueda con intención y sin nadie atendiéndola.
 */
export const revalidate = 86_400;

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tr(lang, 'Dades obertes · API del temps a Catalunya', 'Datos abiertos · API del tiempo en Cataluña'),
    description: tr(lang,
      `Feed públic en JSON i CSV per a qualsevol dels ${PLACES} llocs de Catalunya: `
      + 'observació de la XEMA, predicció multimodel, qualitat de l\'aire i avisos oficials.',
      `Feed público en JSON y CSV para cualquiera de los ${PLACES} lugares de Cataluña: `
      + 'observación de la XEMA, predicción multimodelo, calidad del aire y avisos oficiales.'),
    alternates: { canonical: '/dades' },
  };
}

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

export default async function DadesPage() {
  const lang = await getLang();
  if (lang === 'es') return <DatosAbiertos />;
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
              <C>temperature</C>, la temperatura del lloc: el model meteorològic corregit
              amb el que marquen les estacions del voltant (<C>temperature_method</C>{' '}
              ho diu, i <Link href="/dades/encert">aquí hi ha quant encerta</Link>). Si
              aquesta xifra falta, és la lectura corregida pel desnivell amb el
              gradient estàndard de 6,5 °C/km.
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
            hi ha quan es va actualitzar cada font per última vegada, i a{' '}
            <Link href="/dades/encert">com encerta la temperatura</Link>, quant s&apos;equivoca
            la temperatura d&apos;ara comparada amb la dels models.
          </p>
        </div>
      </Section>
    </article>
  );
}

/**
 * La misma página en castellano. Dice lo mismo, punto por punto: si se cambia
 * una, la otra el mismo día.
 *
 * `/api/lloc` saca el idioma del dominio, así que desde es.tempscat.cat
 * `summary` llega en castellano.
 */
function DatosAbiertos() {
  const trail = [
    { nom: 'Cataluña', path: '/' },
    { nom: 'Datos abiertos', path: '/dades' },
  ];

  return (
    <article data-wide>
      <JsonLd data={graph(
        {
          '@type': 'Dataset',
          name: 'El tiempo en Cataluña, pueblo a pueblo',
          description:
            `Observación y predicción para ${PLACES} poblaciones de Cataluña: municipios, `
            + 'núcleos y entidades de población, cada punto con su altitud y '
            + 'la estación automática de referencia. En JSON y en CSV, sin clave.',
          url: absolute('/dades', 'es'),
          inLanguage: 'es',
          license: 'https://creativecommons.org/licenses/by/4.0/',
          isAccessibleForFree: true,
          keywords: ['meteorología', 'Cataluña', 'predicción', 'observación', 'datos abiertos'],
          spatialCoverage: { '@type': 'Place', name: 'Cataluña' },
          creator: { '@type': 'Organization', name: 'El temps a Catalunya', url: absolute('/', 'es') },
          distribution: [
            {
              '@type': 'DataDownload',
              encodingFormat: 'application/json',
              contentUrl: absolute('/api/lloc/maresme/malgrat-de-mar', 'es'),
            },
            {
              '@type': 'DataDownload',
              encodingFormat: 'text/csv',
              contentUrl: absolute('/api/lloc/maresme/malgrat-de-mar.csv', 'es'),
            },
          ],
        },
        breadcrumbLd(trail, 'es'),
      )} />

      <PageHero
        crumbs={trail}
        eyebrow="API del tiempo en Cataluña"
        icon="barometer"
        title="Datos abiertos"
        lead={(
          <>
            Todo lo que se ve en esta web se puede leer en JSON o en CSV, para
            cualquiera de los {PLACES} lugares. Sin clave, sin registro y sin límite
            de peticiones.
          </>
        )}
        stats={[
          { label: 'Lugares', value: PLACES, sub: 'municipios, núcleos y entidades' },
          { label: 'Formatos', value: 'JSON', unit: 'y CSV', sub: 'en CSV, la serie horaria' },
          { label: 'Licencia', value: 'CC BY', unit: '4.0', sub: 'hay que citar la fuente' },
        ]}
        note="El feed lee los mismos archivos que la página: lo que devuelve es lo que se ve en ella."
        aside={(
          <section className="card" aria-label="Una respuesta de ejemplo">
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/barometer.svg" width={22} height={22} alt="" />
              Una respuesta, por bloques
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
              <Link href={EXAMPLE}>Ábrala entera ›</Link>
            </p>
          </section>
        )}
      />

      <Section id="punts" title="Puntos de acceso">
        <ul className="card-grid">
          <Endpoint path="/api/lloc/{comarca}/{municipi}" example={EXAMPLE}>
            Observación, predicción horaria y diaria, franjas del día, ventanas de
            lluvia con su intensidad, calidad del aire, avisos oficiales y
            el resumen del día: las mismas frases que salen en la ficha.
          </Endpoint>

          <Endpoint path="/api/lloc/{comarca}/{municipi}/{nucli}" example="/api/lloc/conca-de-barbera/montblanc/lilla">
            Igual, para un núcleo o una entidad de población: la predicción de Lilla
            no es la de Montblanc.
          </Endpoint>

          <Endpoint path="/api/ranquings" example="/api/ranquings">
            Los extremos del día: dónde se ha registrado la máxima y la mínima, qué estación ha
            tenido más amplitud térmica, dónde ha llovido más y las rachas más fuertes.
          </Endpoint>
        </ul>
      </Section>

      <Section id="parametres" title="Parámetros">
        <div className="card">
          <div className="scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Parámetro</th>
                  <th scope="col">Qué hace</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="whitespace-nowrap"><C>hours</C></td>
                  <td className="leading-relaxed">
                    Horas de serie horaria{' '}
                    <strong className="font-semibold text-[var(--ink)]">contadas desde las 00:00
                    de hoy</strong>, no desde ahora: el feed devuelve lo mismo que dibuja
                    la página, día entero incluido. Por defecto 48; el máximo es 168, que es
                    el horizonte del modelo.
                    <span className="mt-1.5 block">
                      Para las próximas N horas, <C>forecast.now</C> lleva la hora en curso
                      y su índice dentro de la serie: así no hace falta recalcular la zona horaria de
                      Madrid en el cliente.
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap"><C>format=csv</C></td>
                  <td className="leading-relaxed">
                    La serie horaria en CSV, con el viento ya en km/h y la procedencia en las
                    líneas de comentario. Pensado para abrirlo en una hoja de cálculo.
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

      <Section id="camps" title="Qué lleva cada respuesta">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4">
          <div className="card prose">
            <h3 style={{ marginTop: 0 }}>La procedencia de cada número</h3>
            <p>
              Cada observación lleva la estación de donde sale, a qué distancia está y
              cuánto desnivel hay. <C>temperature_station</C> es la lectura en bruto, y{' '}
              <C>temperature</C>, la temperatura del lugar: el modelo meteorológico corregido
              con lo que marcan las estaciones de alrededor (<C>temperature_method</C>{' '}
              lo dice, y <Link href="/dades/encert">aquí está cuánto acierta</Link>). Si
              esa cifra falta, es la lectura corregida por el desnivel con el
              gradiente estándar de 6,5 °C/km.
            </p>
          </div>
          <div className="card prose">
            <h3 style={{ marginTop: 0 }}>La intensidad de la lluvia, no solo el acumulado</h3>
            <p>
              Cada ventana de lluvia lleva su hora punta y cuántos milímetros
              caen en esa hora, con la escala de AEMET. «Llueve de 4 a 7» no
              distingue la llovizna de una tormenta; <C>peak_precipitation</C> sí.
            </p>
          </div>
          <div className="card prose">
            <h3 style={{ marginTop: 0 }}>El desacuerdo entre modelos</h3>
            <p>
              <C>spread</C> es la desviación entre los modelos que entran en el consenso. Cuando
              vale <C>null</C>, en ese punto solo hay un modelo, y con uno solo no hay
              desacuerdo.
            </p>
          </div>
          <div className="card prose">
            <h3 style={{ marginTop: 0 }}>Las frases</h3>
            <p>
              <C>summary</C> lleva el resumen en el idioma del dominio: en castellano
              desde es.tempscat.cat y en catalán desde tempscat.cat. Lo generan plantillas
              deterministas y no un modelo de lenguaje: con los mismos datos sale
              siempre la misma frase.
            </p>
          </div>
        </div>
      </Section>

      <Section id="condicions" title="Condiciones">
        <div className="card prose">
          <p>
            Los datos son <strong>CC BY 4.0</strong>: se pueden usar para
            cualquier cosa, también comercial, pero <strong>hay que citar la fuente</strong>.
            Cada respuesta lleva un campo <C>sources</C> con los créditos exactos de cada
            bloque, porque no son los mismos: la observación es del Meteocat, la
            predicción de Open-Meteo, la calidad del aire de CAMS y los avisos
            de AEMET.
          </p>
          <p>
            Cada respuesta lleva también un campo <C>version</C>. Mientras valga 1, los
            nombres de campo no desaparecerán: si hay que cambiarlos, subirá el número.
          </p>
          <p>
            Los nombres de los campos van en inglés: son los identificadores que usa
            el proyecto por dentro, y coinciden con los de Open-Meteo y de la XEMA.
          </p>
          <p className="text-sm text-[var(--muted)]">
            La predicción es orientativa y el feed no es un servicio con garantías. Para
            decisiones de seguridad, la fuente son el Meteocat y Protecció Civil. Si
            monta algo que dependa de ello, en <Link href="/estat">el estado de los datos</Link>{' '}
            está cuándo se actualizó cada fuente por última vez, y en{' '}
            <Link href="/dades/encert">cómo acierta la temperatura</Link>, cuánto se equivoca
            la temperatura de ahora comparada con la de los modelos.
          </p>
        </div>
      </Section>
    </article>
  );
}