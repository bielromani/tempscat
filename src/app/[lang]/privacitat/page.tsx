import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { External } from '@/components/External';
import { LEGAL_UPDATED, OWNER } from '@/lib/owner';
import { getLang } from '@/lib/i18n';
import { tr } from '@/lib/lang';
import { alternatesFor } from '@/lib/site';

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
 * aquell fitxer comença a desar un camp nou, aquesta secció l'ha de dir. El 5
 * de novembre se n'hi va afegir un, l'idioma, quan va arribar el castellà.
 *
 * Les dues versions diuen el mateix, punt per punt: si se'n canvia una, l'altra
 * el mateix dia.
 *
 * Pàgina estàtica: no porta cap dada d'ara.
 */
export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tr(lang, 'Privadesa i galetes · TempsCat', 'Privacidad y cookies · TempsCat'),
    description: tr(lang,
      'Quines dades personals tracta tempscat.cat (gairebé cap), qui les tracta i com exercir-hi els vostres drets. El lloc no fa servir galetes.',
      'Qué datos personales trata tempscat.cat (casi ninguno), quién los trata y cómo ejercer sus derechos. El sitio no utiliza cookies.'),
    alternates: alternatesFor('/privacitat'),
  };
}

export default async function Privacitat() {
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const es = lang === 'es';
  const trail = [
    { nom: t('Catalunya', 'Cataluña'), path: '/' },
    { nom: t('Privadesa i galetes', 'Privacidad y cookies'), path: '/privacitat' },
  ];

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail, lang))} />

      <PageHero
        crumbs={trail}
        eyebrow={t('El projecte', 'El proyecto')}
        title={t('Privadesa i galetes', 'Privacidad y cookies')}
        lead={es ? (
          <>
            Este sitio no utiliza cookies, no tiene analítica ni publicidad y no le
            pide ningún dato personal. La ubicación y los avisos en el móvil, solo si
            los pide usted.
          </>
        ) : (
          <>
            Aquest lloc no fa servir galetes, no té analítica ni publicitat i no us
            demana cap dada personal. La ubicació i els avisos al mòbil, només si els
            demaneu vosaltres.
          </>
        )}
        stats={[
          { label: t('Galetes', 'Cookies'), value: '0', sub: t('ni pròpies ni de tercers', 'ni propias ni de terceros') },
          { label: t('Analítica', 'Analítica'), value: t('Cap', 'Ninguna'), sub: t('ni publicitat', 'ni publicidad') },
          { label: t('Registre', 'Registro'), value: 'No', sub: t('cap formulari', 'ningún formulario') },
        ]}
        note={es ? `Última revisión: ${LEGAL_UPDATED.es}.` : `Darrera revisió: ${LEGAL_UPDATED.ca}.`}
      />

      <Section id="responsable" title={t('Responsable', 'Responsable')}>
        <div className="card prose">
          {es ? (
            <p>
              El responsable del sitio es <strong>{OWNER.name}</strong>. Puede
              escribirle a <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a> para
              cualquier cuestión sobre privacidad.
            </p>
          ) : (
            <p>
              El responsable del lloc és <strong>{OWNER.name}</strong>. Podeu
              escriure-hi a <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a> per a
              qualsevol qüestió sobre privadesa.
            </p>
          )}
        </div>
      </Section>

      <Section id="galetes" title={t('Galetes', 'Cookies')}>
        <div className="card prose">
          {es ? (
            <>
              <p>
                El sitio no instala ninguna cookie ni utiliza ninguna tecnología equivalente
                (almacenamiento local, píxeles de seguimiento o identificadores de
                dispositivo). La letra, los iconos y los mapas se sirven desde el
                mismo dominio, y el navegador no carga nada de ningún tercero mientras
                navega. Por eso no hay ningún banner de consentimiento.
              </p>
              <p>
                La única excepción la decide usted: si activa los{' '}
                <Link href="/avisos/alertes">avisos en el móvil</Link>, el navegador instala
                un pequeño programa (un <em>service worker</em>) que solo sirve para mostrar
                la notificación cuando llega. No guarda nada de las páginas ni sigue la
                navegación, y desaparece cuando los desactiva.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </Section>

      <Section id="dades" title={t('Quines dades es tracten', 'Qué datos se tratan')}>
        <div className="card prose">
          {es ? (
            <>
              <p>
                El sitio no tiene formularios, cuentas ni comentarios, y no recoge ningún dato
                personal con ninguna finalidad propia, excepto el que hace falta para enviarle los
                avisos en el móvil si los activa (vea el punto siguiente).
              </p>
              <p>
                Como cualquier servidor web, los proveedores que alojan el sitio registran
                datos técnicos de cada visita —la dirección IP, la página pedida,
                la hora y el navegador— para servirla y protegerla de abusos. Estos
                registros los conservan los proveedores durante un tiempo limitado y no
                se usan para identificar a nadie ni para hacer perfiles. La base es
                el interés legítimo de mantener el servicio en funcionamiento y seguro.
              </p>
              <p>
                Lo que escribe en el buscador se envía al servidor para proponerle
                lugares mientras escribe. No se guarda ni se asocia a ninguna persona.
              </p>
              <p>
                <strong>Su ubicación, solo si la pide.</strong> El botón de la
                flecha del buscador pide al navegador dónde está —el permiso lo da el
                navegador, y puede retirarlo cuando quiera— y envía al servidor la
                coordenada redondeada a un kilómetro, solo para encontrar la ficha del lugar
                donde está. No se guarda ni queda en la dirección de la página. En el mapa del
                radar, el botón de ubicación pinta su posición en el mapa sin enviarla
                a ninguna parte.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </Section>

      <Section id="avisos" title={t('Els avisos al mòbil', 'Los avisos en el móvil')}>
        <div className="card prose">
          {es ? (
            <>
              <p>
                Si activa los avisos naranjas y rojos en{' '}
                <Link href="/avisos/alertes">/avisos/alertes</Link>, se guarda, para cada
                dispositivo: la dirección que su navegador asigna a las notificaciones, las
                dos claves con que el navegador cifra los mensajes, los lugares que ha elegido,
                el idioma de la web desde la que los ha activado —catalán desde tempscat.cat,
                castellano desde es.tempscat.cat—, para escribirle los avisos en ese idioma, y
                las fechas de alta y del último cambio. No se guarda ningún nombre, correo,
                ubicación ni dirección IP, y no se asocia a ningún otro dato.
              </p>
              <p>
                Se usa solo para enviarle los avisos oficiales de AEMET de los lugares
                elegidos. La base es su consentimiento, que da al activarlos y al
                permitir las notificaciones en el navegador, y que puede retirar cuando quiera: al
                desactivarlos en la misma página, la suscripción se borra en ese momento. Si
                el navegador la da de baja por su cuenta, se borra en la primera notificación
                que ya no se puede entregar.
              </p>
              <p>
                Los datos se guardan en un almacenamiento privado de Cloudflare, separado del de
                los datos meteorológicos. El mensaje lo entrega el servicio de notificaciones de
                su navegador —Google para Chrome y Android, Mozilla para Firefox, Apple
                para Safari, Microsoft para Edge— y viaja cifrado, de manera que ese
                servicio no puede leer su contenido.
              </p>
            </>
          ) : (
            <>
              <p>
                Si activeu els avisos taronja i vermells a{' '}
                <Link href="/avisos/alertes">/avisos/alertes</Link>, es desa, per a cada
                aparell: l’adreça que el vostre navegador assigna a les notificacions, les
                dues claus amb què el navegador xifra els missatges, els llocs que heu triat,
                l’idioma del web des d’on els heu activat —català des de tempscat.cat,
                castellà des d’es.tempscat.cat—, per escriure-us els avisos en aquell idioma, i
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
            </>
          )}
        </div>
      </Section>

      <Section id="widget" title={t('El widget en altres webs', 'El widget en otras webs')}>
        <div className="card prose">
          {es ? (
            <p>
              El <Link href="/widget">widget</Link> que otras webs ponen en sus páginas se
              carga desde este dominio dentro de un <em>iframe</em>. Tampoco instala cookies ni
              guarda nada en el navegador, y no sabe en qué web está. Lleva un solo script de
              una línea, que comunica su altura a la página que lo contiene para que no quede
              cortado. Como cualquier página, la petición queda en los registros técnicos del
              proveedor que se describen arriba.
            </p>
          ) : (
            <p>
              El <Link href="/widget">widget</Link> que altres webs posen a les seves pàgines es
              carrega des d’aquest domini dins d’un <em>iframe</em>. Tampoc no instal·la
              galetes ni desa res al navegador, i no sap a quina web és. Porta un sol script
              d’una línia, que diu la seva alçada a la pàgina que el conté perquè no quedi
              tallat. Com qualsevol pàgina, la petició queda als registres tècnics del
              proveïdor que es descriuen més amunt.
            </p>
          )}
        </div>
      </Section>

      <Section id="proveidors" title={t('Proveïdors', 'Proveedores')}>
        <div className="card prose">
          {es ? (
            <>
              <ul>
                <li>
                  <strong>Vercel Inc.</strong> aloja el sitio y lo sirve.{' '}
                  <External href="https://vercel.com/legal/privacy-policy">Política de privacidad de Vercel</External>.
                </li>
                <li>
                  <strong>Cloudflare, Inc.</strong> resuelve el dominio, guarda los datos
                  meteorológicos que lee el sitio y, en un espacio privado aparte, las
                  suscripciones de los avisos en el móvil.{' '}
                  <External href="https://www.cloudflare.com/privacypolicy/">Política de privacidad de Cloudflare</External>.
                </li>
              </ul>
              <p>
                Ambas empresas son de Estados Unidos. Las transferencias de datos que
                esto pueda suponer se hacen con las garantías que prevé el Reglamento
                general de protección de datos.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </Section>

      <Section id="drets" title={t('Els vostres drets', 'Sus derechos')}>
        <div className="card prose">
          {es ? (
            <>
              <p>
                Puede pedir el acceso, la rectificación, la supresión, la limitación o
                la portabilidad de sus datos, u oponerse a su tratamiento, escribiendo a{' '}
                <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>. Si considera que no
                se han atendido bien, puede presentar una reclamación ante la{' '}
                <External href="https://www.aepd.es">Agencia Española de Protección de Datos</External>.
              </p>
              <p>
                Las condiciones de uso y las licencias de los datos están en el{' '}
                <Link href="/avis-legal">aviso legal</Link>.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </Section>
    </article>
  );
}
