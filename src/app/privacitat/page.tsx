import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { External } from '@/components/External';
import { LEGAL_UPDATED, OWNER } from '@/lib/owner';

/**
 * La política de privadesa i de galetes.
 *
 * Diu el que el lloc fa de veritat, i és poc: **cap galeta, cap analítica,
 * cap publicitat, cap formulari**. La lletra és Inter, servida pel mateix
 * domini (`next/font`), les icones i les teselles també, i el navegador no
 * demana res a cap tercer. Per això no hi ha bàner de consentiment: no hi ha
 * res a consentir.
 *
 * Si algun dia entra una analítica, una font externa o un `localStorage` (el
 * tauler de `docs/13` en porta un), **aquesta pàgina s'ha de canviar el mateix
 * dia**. Una política de privadesa que diu «cap galeta» amb una galeta posada
 * és pitjor que no tenir-ne.
 *
 * Pàgina estàtica: no porta cap dada d'ara.
 */
export const metadata: Metadata = {
  title: 'Privadesa i galetes · tempscat',
  description: 'Quines dades personals tracta tempscat.cat (gairebé cap), qui les tracta i com exercir-hi els vostres drets. El lloc no fa servir galetes.',
  alternates: { canonical: '/privacitat' },
};

export default function Privacitat() {
  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Privadesa i galetes', path: '/privacitat' },
  ];

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="El projecte"
        title="Privadesa i galetes"
        lead={(
          <>
            Aquest lloc no fa servir galetes, no té analítica ni publicitat i no us
            demana cap dada personal.
          </>
        )}
        stats={[
          { label: 'Galetes', value: '0', sub: 'ni pròpies ni de tercers' },
          { label: 'Analítica', value: 'Cap', sub: 'ni publicitat' },
          { label: 'Registre', value: 'No', sub: 'cap formulari' },
        ]}
        note={`Darrera revisió: ${LEGAL_UPDATED}.`}
      />

      <Section id="responsable" title="Responsable">
        <div className="card prose">
          <p>
            El responsable del lloc és <strong>{OWNER.name}</strong>. Podeu
            escriure-hi a <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a> per a
            qualsevol qüestió sobre privadesa.
          </p>
        </div>
      </Section>

      <Section id="galetes" title="Galetes">
        <div className="card prose">
          <p>
            El lloc no instal·la cap galeta ni fa servir cap tecnologia equivalent
            (emmagatzematge local, píxels de seguiment o identificadors de
            dispositiu). La lletra, les icones i els mapes se serveixen des del
            mateix domini, i el navegador no carrega res de cap tercer mentre
            navegueu. Per això no hi ha cap bàner de consentiment.
          </p>
        </div>
      </Section>

      <Section id="dades" title="Quines dades es tracten">
        <div className="card prose">
          <p>
            El lloc no té formularis, comptes ni comentaris, i no recull cap dada
            personal amb cap finalitat pròpia.
          </p>
          <p>
            Com qualsevol servidor web, els proveïdors que allotgen el lloc registren
            dades tècniques de cada visita —l&apos;adreça IP, la pàgina demanada,
            l&apos;hora i el navegador— per servir-la i protegir-la d&apos;abusos. Aquests
            registres els conserven els proveïdors durant un temps limitat i no
            s&apos;usen per identificar ningú ni per fer perfils. La base és
            l&apos;interès legítim de mantenir el servei en funcionament i segur.
          </p>
          <p>
            El que escriviu al cercador s&apos;envia al servidor per proposar-vos
            llocs mentre escriviu. No es desa ni s&apos;associa a cap persona.
          </p>
        </div>
      </Section>

      <Section id="proveidors" title="Proveïdors">
        <div className="card prose">
          <ul>
            <li>
              <strong>Vercel Inc.</strong> allotja el lloc i el serveix.{' '}
              <External href="https://vercel.com/legal/privacy-policy">Política de privadesa de Vercel</External>.
            </li>
            <li>
              <strong>Cloudflare, Inc.</strong> resol el domini i guarda les dades
              meteorològiques que llegeix el lloc.{' '}
              <External href="https://www.cloudflare.com/privacypolicy/">Política de privadesa de Cloudflare</External>.
            </li>
          </ul>
          <p>
            Totes dues empreses són dels Estats Units. Les transferències de dades que
            això pugui comportar es fan amb les garanties que preveu el Reglament
            general de protecció de dades.
          </p>
        </div>
      </Section>

      <Section id="drets" title="Els vostres drets">
        <div className="card prose">
          <p>
            Podeu demanar l&apos;accés, la rectificació, la supressió, la limitació o
            la portabilitat de les vostres dades, o oposar-vos-hi, escrivint a{' '}
            <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>. Si considereu que no
            s&apos;han atès bé, podeu presentar una reclamació a l&apos;
            <External href="https://www.aepd.es">Agència Espanyola de Protecció de Dades</External>.
          </p>
          <p>
            Les condicions d&apos;ús i les llicències de les dades són a l&apos;
            <Link href="/avis-legal">avís legal</Link>.
          </p>
        </div>
      </Section>
    </article>
  );
}
