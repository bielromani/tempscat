import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cameraBySlug, cameraImage, CAMERA_SHOW_HOURS } from '@/lib/cameras';
import { aName, ago, dateFull, deName, hour, hourSpoken, int, num } from '@/lib/format';
import { CameraCard } from '@/components/CameraBlock';
import { External } from '@/components/External';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section, StatGrid } from '@/components/PageHero';

/**
 * Una cámara.
 *
 * ## Por qué cada cámara tiene página propia
 *
 * Porque el índice no puede enseñar veinticuatro fotogramas grandes —serían dos
 * megas y medio— y porque una cámara es una dirección que se comparte: «mira
 * cómo está el Torrent Negre» es un enlace, no una captura de pantalla.
 *
 * Y porque el truco de CSS para enseñar la imagen grande sin salir del índice
 * —un `:target` con la grande escondida— **no evita la descarga de forma
 * demostrable**: si el navegador decide bajar las veinticuatro imágenes
 * ocultas, el índice pasa de 250 kB a 2,5 MB sin que nada falle. Una ruta de
 * verdad no tiene esa duda.
 *
 * ## La imagen se enseña o no se enseña
 *
 * La página existe siempre, incluso para una cámara que lleve meses parada: eso
 * es información y tiene su sitio. Lo que no aparece es el fotograma caducado.
 * Enseñar la nieve de abril con la fecha en letra pequeña sería confiar en que
 * el lector lea la letra pequeña.
 *
 * ## La imagen a la izquierda y los datos al lado, salvo las panorámicas
 *
 * En escritorio el fotograma ocupa la columna ancha y la hora, la altitud y el
 * pueblo más cercano van en una columna estrecha a su derecha. Las panorámicas
 * no: son 1.280 × 167 —la de Clots—, y en dos tercios de la anchura quedarían
 * en una tira de cien píxeles. Esas van de lado a lado y los datos, debajo.
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const cam = await cameraBySlug(slug);
  if (!cam) return { title: 'Càmera no trobada' };

  // Compuesto antes y de una pieza: un `<title>` con varios hijos lo escribe
  // vacío el servidor y lo rellena el cliente, y eso vuelve a renderizar el
  // árbol entero en el navegador sin dar ningún error. Está en AGENTS.md.
  const alt = cam.altitudM != null ? `, a ${int(cam.altitudM)} m` : '';
  return {
    title: `Càmera de ${cam.name} — ${cam.resort}${alt}`,
    description:
      `Com està ara mateix ${cam.name}, a ${cam.resort}. Imatge de la càmera de `
      + 'Ferrocarrils amb l’hora de la fotografia.',
    alternates: { canonical: `/cameres/${cam.slug}` },
  };
}

export default async function CameraPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cam = await cameraBySlug(slug);
  if (!cam) notFound();

  const shown = cam.ageMin <= CAMERA_SHOW_HOURS * 60;
  const siblings = cam.siblings.filter((s) => s.ageMin <= CAMERA_SHOW_HOURS * 60);
  // Sense imatge, o amb una panoràmica, les dades van a sota i no al costat.
  const wide = !shown || cam.panoramic;

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Càmeres', path: '/cameres' },
    { nom: cam.name, path: `/cameres/${cam.slug}` },
  ];

  const facts = (
    <div className={wide ? 'grid gap-4 md:grid-cols-2' : 'flex flex-col gap-4'}>
      <StatGrid
        stats={[
          {
            label: shown && cam.current ? 'Fotografia' : 'Última imatge',
            icon: 'clear-day',
            value: hour(cam.capturedLocal),
            sub: `${dateFull(cam.capturedLocal)} · ${ago(cam.ageMin)}`,
          },
          cam.altitudM != null && {
            label: 'Altitud',
            icon: 'snow',
            value: int(cam.altitudM),
            unit: 'm',
            sub: cam.resort,
          },
          cam.nearest && {
            label: 'Poble més proper',
            icon: 'thermometer',
            value: num(cam.nearest.distKm, 1),
            unit: 'km',
            sub: <Link href={cam.nearest.path}>{cam.nearest.nom}</Link>,
          },
        ]}
      />

      {(cam.nearest || cam.lat == null || (cam.panoramic && cam.viewer)) && (
        <div className="card text-[14px] leading-relaxed text-[var(--ink-2)]">
          {cam.nearest && (
            <p>
              A la fitxa {deName(cam.nearest.nom)} hi ha la predicció, el que mesura
              l&apos;estació més propera i la cota de neu.
            </p>
          )}
          {cam.lat == null && (
            <p className={cam.nearest ? 'mt-2' : ''}>
              El catàleg no en dona la coordenada, així que aquesta càmera no apareix a
              la fitxa de cap municipi.
            </p>
          )}
          {cam.panoramic && cam.viewer && (
            <p className={cam.nearest || cam.lat == null ? 'mt-2' : ''}>
              És una càmera panoràmica i aquí se&apos;n mostra la imatge plana. Al{' '}
              <External href={cam.viewer} className="text-[var(--accent)]">
                visor de Ferrocarrils
              </External>{' '}
              es pot girar.
            </p>
          )}
          {cam.nearest && (
            <p className="card-foot">
              <Link href={cam.nearest.path}>El temps {aName(cam.nearest.nom)} ›</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow={`Càmera · ${cam.resort}`}
        icon="partly-cloudy-day"
        title={cam.name}
        lead={shown ? (
          <>
            {cam.current ? 'Imatge de ' : 'Última imatge, de '}
            <strong>{hourSpoken(cam.capturedLocal)}</strong>, {ago(cam.ageMin)}.
          </>
        ) : (
          <>
            Aquesta càmera està <strong>aturada</strong>: serveix el mateix fotograma
            des de {ago(cam.ageMin)}.
          </>
        )}
      />

      <div
        className={wide
          ? 'grid gap-6'
          : 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start'}
      >
        {shown ? (
          <figure className="m-0 min-w-0">
            {/*
              A mida natural del fitxer i amb les mesures posades. Les
              panoramiques son molt mes amples que altes -1280x167 la de Clots- i
              forcar-les a una proporcio comuna voldria dir retallar-les: el que
              s'ensenya es la fotografia que ha fet la camera.
            */}
            <img
              src={cameraImage(cam, 'view')}
              width={cam.width ?? undefined}
              height={cam.height ?? undefined}
              alt={`Fotograma de la càmera ${cam.name}, ${aName(cam.resort)}`}
              className="block h-auto w-full rounded-[22px] border border-[var(--glass-line)] bg-[var(--surface-2)]"
            />
            <figcaption className="source">
              {cam.name} · {cam.resort} · {dateFull(cam.capturedLocal)}, {hour(cam.capturedLocal)}
            </figcaption>
          </figure>
        ) : (
          <section className="card min-w-0">
            <p className="card-label">
              <img src="/icons/w/not-available.svg" width={22} height={22} alt="" />
              Sense imatge
            </p>
            <p className="measure text-[15px] leading-relaxed text-[var(--ink-2)]">
              Consta com a activa al catàleg de Ferrocarrils, però el fotograma que
              serveix no ha canviat. L&apos;últim: {dateFull(cam.capturedLocal)},{' '}
              {hour(cam.capturedLocal)} ({ago(cam.ageMin)}).
            </p>
          </section>
        )}

        {facts}
      </div>

      {siblings.length > 0 && (
        <Section
          id="mes"
          title={`Més càmeres ${deName(cam.resort)}`}
          action={{ href: '/cameres', label: 'Totes' }}
        >
          <ul className="card-grid cols-4 max-sm:grid-cols-2! max-sm:gap-2.5!">
            {siblings.map((s) => (
              <li key={s.id}>
                <CameraCard
                  camera={s}
                  meta={[s.altitudM != null && `${int(s.altitudM)} m`, s.panoramic && 'panoràmica']}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Redactat aixi perque val igual quan la imatge no s'ensenya: la
          camera i la llicencia son les mateixes tant si el fotograma es de
          fa deu minuts com si es d'abril. */}
      <p className="source mt-8!">
        Càmera de {cam.attribution}; les imatges es publiquen amb llicència{' '}
        {cam.license} i es desen un cop per hora.{' '}
        <Link href="/cameres" className="text-[var(--accent)] no-underline hover:underline">
          Totes les càmeres
        </Link>.
      </p>
    </article>
  );
}
