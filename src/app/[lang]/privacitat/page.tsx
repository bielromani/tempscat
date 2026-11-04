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
 * Des del 4 de novembre de 2026 hi ha una dada que sí que es desa: la
 * subscripció dels avisos al mòbil, només de qui els activa. La secció «Els
 * avisos al mòbil» diu exactament què hi ha a `src/lib/push-store.ts`; si
 * aquell fitxer comença a desar un camp nou, aquesta secció l'ha de dir.
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
            demana cap dada personal. La ubicació i els avisos al mòbil, només si els
            demaneu vosaltres.
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
          <p>
            L’única excepció la decidiu vosaltres: si activeu els{' '}
            <Link href="/avisos/alertes">avisos al mòbil</Link>, el navegador hi instal·la
            un petit programa (un <em>service worker</em>) que només serveix per ensenyar
            la notificació quan arriba. No desa res de les pàgines ni en segueix la
            navegació, i desapareix quan els apagueu.
          </p>
        </div>
      </Section>

      <Section id="dades" title="Quines dades es tracten">
        <div className="card prose">
          <p>
            El lloc no té formularis, comptes ni comentaris, i no recull cap dada
            personal amb cap finalitat pròpia, excepte la que cal per enviar-vos els
            avisos al mòbil si els activeu (vegeu el punt següent).
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
          <p>
            <strong>La vostra ubicació, només si la demaneu.</strong> El botó de la
            fletxa del cercador demana al navegador on sou —el permís el dona el
            navegador, i el podeu retirar quan vulgueu— i envia al servidor la
            coordenada arrodonida a un quilòmetre, només per trobar la fitxa del lloc
            on sou. No es desa ni queda a l&apos;adreça de la pàgina. Al mapa del
            radar, el botó «On sóc» pinta la vostra posició al mapa sense enviar-la
            enlloc.
          </p>
        </div>
      </Section>

      <Section id="avisos" title="Els avisos al mòbil">
        <div className="card prose">
          <p>
            Si activeu els avisos taronja i vermells a{' '}
            <Link href="/avisos/alertes">/avisos/alertes</Link>, es desa, per a cada
            aparell: l’adreça que el vostre navegador assigna a les notificacions, les
            dues claus amb què el navegador xifra els missatges, els llocs que heu triat i
            les dates d’alta i de l’últim canvi. No es desa cap nom, correu, ubicació ni
            adreça IP, i no s’associa a cap altra dada.
          </p>
          <p>
            Es fa servir només per enviar-vos els avisos oficials de l’AEMET dels llocs
            triats. La base és el vostre consentiment, que doneu en activar-los i en
            permetre les notificacions al navegador, i que podeu retirar quan vulgueu: en
            apagar-los a la mateixa pàgina, la subscripció s’esborra en aquell moment. Si
            el navegador la dona de baixa pel seu compte, s’esborra a la primera notificació
            que ja no es pot lliurar.
          </p>
          <p>
            Les dades es guarden en un emmagatzematge privat de Cloudflare, separat del de
            les dades meteorològiques. El missatge el lliura el servei de notificacions del
            vostre navegador —Google per a Chrome i Android, Mozilla per a Firefox, Apple
            per a Safari, Microsoft per a Edge— i hi viatja xifrat, de manera que aquest
            servei no en pot llegir el contingut.
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
              <strong>Cloudflare, Inc.</strong> resol el domini, guarda les dades
              meteorològiques que llegeix el lloc i, en un espai privat a part, les
              subscripcions dels avisos al mòbil.{' '}
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
