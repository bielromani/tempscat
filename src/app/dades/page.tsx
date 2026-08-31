import type { Metadata } from 'next';
import Link from 'next/link';

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
    'Feed públic en JSON i CSV per a qualsevol dels 4.293 llocs de Catalunya: '
    + 'observació de la XEMA, predicció multimodel, qualitat de l\'aire i avisos oficials.',
  alternates: { canonical: '/dades' },
};

const EXAMPLE = '/api/lloc/conca-de-barbera/montblanc';

function Endpoint({
  path, children, example,
}: {
  path: string;
  children: React.ReactNode;
  example?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
      <p className="font-mono text-sm text-[var(--ink)]">{path}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-2)]">{children}</p>
      {example && (
        <p className="mt-2 text-sm">
          <Link href={example} className="font-mono text-[var(--accent)] no-underline hover:underline">
            {example}
          </Link>
        </p>
      )}
    </div>
  );
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-[var(--line-soft)] last:border-0">
      <td className="py-2 pr-4 align-top font-mono text-xs text-[var(--ink)]">{name}</td>
      <td className="py-2 align-top text-sm leading-relaxed text-[var(--ink-2)]">{children}</td>
    </tr>
  );
}

export default function DadesPage() {
  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Dades obertes</span>
      </nav>

      <header className="mb-8 max-w-[62ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Dades obertes</h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
          Tot el que es veu en aquest web es pot llegir en JSON o en CSV, per a
          qualsevol dels 4.293 llocs. No cal clau, no cal registre i no hi ha
          límit de peticions — el feed llegeix exactament els mateixos fitxers que
          la pàgina, així que servir-lo no ens costa cap consulta a cap API.
        </p>
      </header>

      <h2 className="mb-3 text-lg font-semibold tracking-tight">Punts d&apos;accés</h2>
      <div className="space-y-3">
        <Endpoint path="GET /api/lloc/{comarca}/{municipi}" example={EXAMPLE}>
          Observació, predicció horària i diària, franges del dia, finestres de
          pluja amb la seva intensitat, qualitat de l&apos;aire, avisos oficials i
          el resum en català — les mateixes frases que surten a la fitxa.
        </Endpoint>

        <Endpoint path="GET /api/lloc/{comarca}/{municipi}/{nucli}" example="/api/lloc/conca-de-barbera/montblanc/lilla">
          Igual, per a un nucli o una entitat de població. És la raó de ser
          d&apos;aquest projecte: la predicció de Lilla no és la de Montblanc.
        </Endpoint>

        <Endpoint path="GET /api/ranquings" example="/api/ranquings">
          Els extrems del dia: on ha fet la màxima i la mínima, quina estació ha
          tingut més amplitud tèrmica, on ha plogut més i les ratxes més fortes.
        </Endpoint>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold tracking-tight">Paràmetres</h2>
      <div className="scroll-x">
        <table className="w-full border-collapse">
          <tbody>
            <Row name="hours">
              Hores de sèrie horària <strong className="font-medium text-[var(--ink)]">comptades
              des de les 00:00 d&apos;avui</strong>, no des d&apos;ara: el feed
              torna el mateix que dibuixa la pàgina, dia sencer inclòs. Per defecte
              48; el màxim és 168, que és l&apos;horitzó del model.
              <span className="mt-1 block">
                Si el que voleu són les pròximes N hores, el bloc{' '}
                <code className="font-mono text-xs">forecast.now</code> us diu
                l&apos;hora en curs i el seu índex dins la sèrie, i així no heu de
                recalcular la zona horària de Madrid al client — que és exactament
                on ens vam equivocar nosaltres.
              </span>
            </Row>
            <Row name="format=csv">
              La sèrie horària en CSV, amb el vent ja en km/h i la procedència a
              les línies de comentari. Pensat per obrir-lo en un full de càlcul.
              <span className="mt-1 block">
                <Link href={`${EXAMPLE}?format=csv`} className="font-mono text-xs text-[var(--accent)] no-underline hover:underline">
                  {EXAMPLE}?format=csv
                </Link>
              </span>
            </Row>
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold tracking-tight">
        Què hi trobareu que no hi és en altres llocs
      </h2>
      <div className="max-w-[65ch] space-y-3 leading-relaxed text-[var(--ink-2)]">
        <p>
          <strong className="font-medium text-[var(--ink)]">La procedència de cada número.</strong>{' '}
          Cada observació porta l&apos;estació d&apos;on surt, a quina distància
          és i quant desnivell hi ha. Trobareu <code className="font-mono text-sm">temperature_station</code>,
          que és la lectura crua, i <code className="font-mono text-sm">temperature</code>,
          que és la mateixa corregida pel desnivell amb el gradient estàndard de
          6,5 °C/km. Amb les dues podeu decidir si us fieu de la correcció.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">La intensitat de la pluja, no només l&apos;acumulat.</strong>{' '}
          Cada finestra de pluja porta la seva hora punta i quants mil·límetres
          cauen en aquella hora, amb l&apos;escala de l&apos;AEMET. «Plou de 4 a 7»
          no distingeix quatre gotes d&apos;una tempesta; <code className="font-mono text-sm">peak_precipitation</code> sí.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">El desacord entre models.</strong>{' '}
          El camp <code className="font-mono text-sm">spread</code> és la desviació
          entre els models que entren al consens. Quan val <code className="font-mono text-sm">null</code>,
          és que en aquell punt només hi ha un model — i que no ho diguem seria
          amagar la incertesa.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">Les frases.</strong>{' '}
          El bloc <code className="font-mono text-sm">summary</code> porta el resum
          en català generat amb plantilles deterministes. Qualsevol pot calcular
          una mitjana; això és el que costa de refer.
        </p>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold tracking-tight">Condicions</h2>
      <div className="max-w-[65ch] space-y-3 leading-relaxed text-[var(--ink-2)]">
        <p>
          Les dades són <strong className="font-medium text-[var(--ink)]">CC-BY 4.0</strong>:
          es poden fer servir per a qualsevol cosa, també comercial, però{' '}
          <strong className="font-medium text-[var(--ink)]">cal citar la font</strong>.
          Cada resposta porta un camp <code className="font-mono text-sm">sources</code> amb
          els crèdits exactes de cada bloc, perquè no són els mateixos:
          l&apos;observació és del Meteocat, la predicció d&apos;Open-Meteo, la
          qualitat de l&apos;aire de CAMS i els avisos de l&apos;AEMET.
        </p>
        <p>
          Cada resposta porta també un camp <code className="font-mono text-sm">version</code>.
          Mentre valgui 1, els noms de camp no desapareixeran: si cal canviar-los,
          pujarà el número.
        </p>
        <p>
          Els noms dels camps van en anglès i no en català. No és descuit: són els
          identificadors canònics que fa servir el projecte per dins, i coincideixen
          amb els d&apos;Open-Meteo i de la XEMA. Traduir-los crearia un segon
          sistema de noms.
        </p>
        <p className="text-sm text-[var(--muted)]">
          La predicció és orientativa i el feed no és un servei amb garanties. Per
          a decisions de seguretat, la font són el Meteocat i Protecció Civil. I si
          munteu res que depengui d&apos;això, mireu{' '}
          <Link href="/estat" className="text-[var(--ink-2)] no-underline hover:underline">
            l&apos;estat de les dades
          </Link>: diu quan es va actualitzar cada font per última vegada, encara
          que la resposta sigui incòmoda.
        </p>
      </div>
    </article>
  );
}
