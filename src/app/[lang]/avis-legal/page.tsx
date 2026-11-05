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
 * L'avís legal: qui és el titular, què es pot esperar del que s'hi publica i
 * de qui són les dades.
 *
 * La part de les llicències no és un tràmit: cada font té la seva, i la que
 * més es nota és que els itineraris són d'OpenStreetMap i van amb ODbL, no amb
 * CC BY com la resta. El detall tècnic de cada llicència és a
 * `docs/09-legal-y-costes.md`.
 *
 * Pàgina estàtica: no porta cap dada d'ara.
 */
export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tr(lang, 'Avís legal · tempscat', 'Aviso legal · tempscat'),
    description: tr(lang,
      'Titular del lloc, condicions d’ús de la informació meteorològica i llicències de les dades que s’hi publiquen.',
      'Titular del sitio, condiciones de uso de la información meteorológica y licencias de los datos que se publican.'),
    alternates: alternatesFor('/avis-legal'),
  };
}

export default async function AvisLegal() {
  const lang = await getLang();
  if (lang === 'es') return <AvisoLegal />;
  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Avís legal', path: '/avis-legal' },
  ];

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="El projecte"
        title="Avís legal"
        lead={(
          <>
            tempscat és un lloc web personal i sense ànim de lucre que publica
            informació meteorològica de Catalunya a partir de dades obertes.
          </>
        )}
        note={`Darrera revisió: ${LEGAL_UPDATED.ca}.`}
      />

      <Section id="titular" title="Titular">
        <div className="card prose">
          <p>
            El titular i responsable del lloc web <strong>tempscat.cat</strong> és{' '}
            <strong>{OWNER.name}</strong>. Per a qualsevol consulta, correcció o
            reclamació, podeu escriure a{' '}
            <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>.
          </p>
          <p>
            El lloc no té publicitat, no ven cap producte ni servei i no demana cap
            registre.
          </p>
        </div>
      </Section>

      <Section id="informacio" title="Què es pot esperar de la informació">
        <div className="card prose">
          <p>
            Les observacions vénen de les estacions automàtiques del Meteocat i
            arriben amb un retard d&apos;entre 45 i 65 minuts; cada lectura porta
            l&apos;estació, la distància i l&apos;hora. La predicció surt de models
            numèrics i és <strong>orientativa</strong>: pot errar, sobretot en
            tempestes locals i a més de tres dies vista.
          </p>
          <p>
            Els avisos són els oficials de l&apos;AEMET, amb el nivell, la zona i
            l&apos;horari tal com els publica; el text oficial es reprodueix en
            l&apos;idioma original.
          </p>
          <p>
            <strong>Per a decisions de seguretat</strong> —sortir a la muntanya, al
            mar o a la carretera amb un avís vigent— consulteu el{' '}
            <External href="https://www.meteo.cat">Meteocat</External>, l&apos;
            <External href="https://www.aemet.es">AEMET</External> i{' '}
            <External href="https://interior.gencat.cat/ca/arees_dactuacio/proteccio_civil/">Protecció Civil</External>.
            En una emergència, truqueu al 112.
          </p>
          <p>
            Les dades es publiquen tal com arriben de cada font, sense cap garantia
            d&apos;exactitud, de continuïtat ni de disponibilitat del servei. El
            titular no respon dels danys que es puguin derivar de l&apos;ús de la
            informació d&apos;aquest lloc. Quan una font deixa de publicar,{' '}
            <Link href="/estat">l&apos;estat de les dades</Link> ho indica.
          </p>
        </div>
      </Section>

      <Section id="llicencies" title="De qui són les dades">
        <div className="card prose">
          <p>
            Cada dada és de la font que la publica, i es fa servir d&apos;acord amb la
            seva llicència:
          </p>
          <ul>
            <li>
              <strong>Observació (XEMA)</strong>, del Servei Meteorològic de
              Catalunya, a través del portal de dades obertes de la Generalitat, amb
              la llicència oberta d&apos;ús d&apos;informació de Catalunya.
            </li>
            <li>
              <strong>Predicció</strong>, d&apos;<External href="https://open-meteo.com">Open-Meteo</External>, CC BY 4.0.
            </li>
            <li>
              <strong>Avisos oficials</strong>, © AEMET, a través d&apos;AEMET OpenData.
            </li>
            <li>
              <strong>Qualitat de l&apos;aire</strong>: el model és del Copernicus
              Atmosphere Monitoring Service (CAMS) i les mesures, de la Xarxa de
              Vigilància i Previsió de la Contaminació Atmosfèrica (XVPCA).
            </li>
            <li>
              <strong>Aigua</strong>, de l&apos;Agència Catalana de l&apos;Aigua;{' '}
              <strong>platges</strong>, de Protecció Civil; <strong>neu, estacions i
              càmeres</strong>, de Ferrocarrils de la Generalitat (FGC), totes via dades obertes.
            </li>
            <li>
              <strong>Radar</strong>, de <External href="https://www.rainviewer.com">RainViewer</External>.
            </li>
            <li>
              <strong>Límits, topònims i mapa base</strong>, de l&apos;
              <External href="https://www.icgc.cat">Institut Cartogràfic i Geològic de Catalunya</External>, CC BY 4.0.
            </li>
            <li>
              <strong>Barris de Barcelona</strong>, de l&apos;Ajuntament de Barcelona
              (Open Data BCN), CC BY 4.0. <strong>Barris de les altres ciutats</strong>, ©
              col·laboradors d&apos;
              <External href="https://www.openstreetmap.org/copyright">OpenStreetMap</External>, amb
              llicència ODbL: per això no surten a l&apos;API de dades.
            </li>
            <li>
              <strong>Itineraris</strong>, © col·laboradors d&apos;
              <External href="https://www.openstreetmap.org/copyright">OpenStreetMap</External>, amb llicència ODbL.
            </li>
            <li>
              <strong>Icones del temps</strong>: Meteocons, de Bas Milius, llicència MIT.
            </li>
          </ul>
          <p>
            El que el lloc hi afegeix —la correcció per altitud, els resums, les
            frases i el disseny— es pot reutilitzar amb llicència{' '}
            <strong>CC BY 4.0</strong>, citant tempscat.cat i les fonts originals. Les
            condicions del feed en JSON i CSV són a{' '}
            <Link href="/dades#condicions">Dades obertes</Link>. Els itineraris en
            queden fora: per la llicència ODbL, no es distribueixen pel feed.
          </p>
        </div>
      </Section>

      <Section id="enllacos" title="Enllaços i privadesa">
        <div className="card prose">
          <p>
            Els enllaços a altres llocs s&apos;indiquen amb un símbol i s&apos;obren en
            una pestanya nova; el titular no respon del seu contingut.
          </p>
          <p>
            Aquest lloc no fa servir galetes ni recull dades personals. El detall és
            a la <Link href="/privacitat">política de privadesa</Link>.
          </p>
        </div>
      </Section>
    </article>
  );
}

/** La misma página en castellano: dice lo mismo, punto por punto. */
function AvisoLegal() {
  const trail = [
    { nom: 'Cataluña', path: '/' },
    { nom: 'Aviso legal', path: '/avis-legal' },
  ];

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail, 'es'))} />

      <PageHero
        crumbs={trail}
        eyebrow="El proyecto"
        title="Aviso legal"
        lead={(
          <>
            tempscat es un sitio web personal y sin ánimo de lucro que publica
            información meteorológica de Cataluña a partir de datos abiertos.
          </>
        )}
        note={`Última revisión: ${LEGAL_UPDATED.es}.`}
      />

      <Section id="titular" title="Titular">
        <div className="card prose">
          <p>
            El titular y responsable del sitio web <strong>tempscat.cat</strong> es{' '}
            <strong>{OWNER.name}</strong>. Para cualquier consulta, corrección o
            reclamación, puede escribir a{' '}
            <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>.
          </p>
          <p>
            El sitio no tiene publicidad, no vende ningún producto ni servicio y no pide ningún
            registro.
          </p>
        </div>
      </Section>

      <Section id="informacio" title="Qué se puede esperar de la información">
        <div className="card prose">
          <p>
            Las observaciones proceden de las estaciones automáticas del Meteocat y
            llegan con un retraso de entre 45 y 65 minutos; cada lectura lleva
            la estación, la distancia y la hora. La predicción sale de modelos
            numéricos y es <strong>orientativa</strong>: puede fallar, sobre todo en
            tormentas locales y a más de tres días vista.
          </p>
          <p>
            Los avisos son los oficiales de AEMET, con el nivel, la zona y
            el horario tal como los publica; el texto oficial se reproduce en
            el idioma original.
          </p>
          <p>
            <strong>Para decisiones de seguridad</strong> —salir a la montaña, al
            mar o a la carretera con un aviso vigente— consulte el{' '}
            <External href="https://www.meteo.cat">Meteocat</External>,{' '}
            <External href="https://www.aemet.es">AEMET</External> y{' '}
            <External href="https://interior.gencat.cat/ca/arees_dactuacio/proteccio_civil/">Protecció Civil</External>.
            En una emergencia, llame al 112.
          </p>
          <p>
            Los datos se publican tal como llegan de cada fuente, sin ninguna garantía
            de exactitud, de continuidad ni de disponibilidad del servicio. El
            titular no responde de los daños que puedan derivarse del uso de la
            información de este sitio. Cuando una fuente deja de publicar,{' '}
            <Link href="/estat">el estado de los datos</Link> lo indica.
          </p>
        </div>
      </Section>

      <Section id="llicencies" title="De quién son los datos">
        <div className="card prose">
          <p>
            Cada dato es de la fuente que lo publica, y se utiliza de acuerdo con su
            licencia:
          </p>
          <ul>
            <li>
              <strong>Observación (XEMA)</strong>, del Servei Meteorològic de
              Catalunya, a través del portal de datos abiertos de la Generalitat, con
              la licencia abierta de uso de información de Cataluña.
            </li>
            <li>
              <strong>Predicción</strong>, de <External href="https://open-meteo.com">Open-Meteo</External>, CC BY 4.0.
            </li>
            <li>
              <strong>Avisos oficiales</strong>, © AEMET, a través de AEMET OpenData.
            </li>
            <li>
              <strong>Calidad del aire</strong>: el modelo es del Copernicus
              Atmosphere Monitoring Service (CAMS) y las mediciones, de la Xarxa de
              Vigilància i Previsió de la Contaminació Atmosfèrica (XVPCA).
            </li>
            <li>
              <strong>Agua</strong>, de la Agència Catalana de l&apos;Aigua;{' '}
              <strong>playas</strong>, de Protecció Civil; <strong>nieve, estaciones y
              cámaras</strong>, de Ferrocarrils de la Generalitat (FGC), todas a través de datos abiertos.
            </li>
            <li>
              <strong>Radar</strong>, de <External href="https://www.rainviewer.com">RainViewer</External>.
            </li>
            <li>
              <strong>Límites, topónimos y mapa base</strong>, del{' '}
              <External href="https://www.icgc.cat">Institut Cartogràfic i Geològic de Catalunya</External>, CC BY 4.0.
            </li>
            <li>
              <strong>Barrios de Barcelona</strong>, del Ajuntament de Barcelona
              (Open Data BCN), CC BY 4.0. <strong>Barrios de las demás ciudades</strong>, ©
              colaboradores de{' '}
              <External href="https://www.openstreetmap.org/copyright">OpenStreetMap</External>, con
              licencia ODbL: por eso no aparecen en la API de datos.
            </li>
            <li>
              <strong>Rutas</strong>, © colaboradores de{' '}
              <External href="https://www.openstreetmap.org/copyright">OpenStreetMap</External>, con licencia ODbL.
            </li>
            <li>
              <strong>Iconos del tiempo</strong>: Meteocons, de Bas Milius, licencia MIT.
            </li>
          </ul>
          <p>
            Lo que el sitio añade —la corrección por altitud, los resúmenes, las
            frases y el diseño— se puede reutilizar con licencia{' '}
            <strong>CC BY 4.0</strong>, citando tempscat.cat y las fuentes originales. Las
            condiciones del feed en JSON y CSV están en{' '}
            <Link href="/dades#condicions">Datos abiertos</Link>. Las rutas
            quedan fuera: por la licencia ODbL, no se distribuyen por el feed.
          </p>
        </div>
      </Section>

      <Section id="enllacos" title="Enlaces y privacidad">
        <div className="card prose">
          <p>
            Los enlaces a otros sitios se indican con un símbolo y se abren en
            una pestaña nueva; el titular no responde de su contenido.
          </p>
          <p>
            Este sitio no utiliza cookies ni recoge datos personales. El detalle está
            en la <Link href="/privacitat">política de privacidad</Link>.
          </p>
        </div>
      </Section>
    </article>
  );
}