import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cameraBySlug, cameraImage, cameraSlugs, CAMERA_SHOW_HOURS } from '@/lib/cameras';
import { ago, dateFull, hour, int, num } from '@/lib/format';

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
 */
export const revalidate = 900;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await cameraSlugs()).map((slug) => ({ slug }));
}

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

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <Link href="/cameres" className="no-underline hover:text-[var(--ink)]">Càmeres</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">{cam.name}</span>
      </nav>

      <header className="mb-5 max-w-[64ch]">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{cam.name}</h1>
        <p className="mt-1.5 text-sm text-[var(--ink-2)]">
          {[
            cam.resort,
            cam.altitudM != null && `${int(cam.altitudM)} m`,
            cam.panoramic && 'panoràmica',
          ].filter(Boolean).join(' · ')}
        </p>
      </header>

      {shown ? (
        <figure className="m-0">
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
            alt={`Fotograma de la càmera ${cam.name}, a ${cam.resort}`}
            className="block h-auto w-full rounded-lg border border-[var(--line-soft)] bg-[var(--surface-2)]"
          />
          <figcaption className="mt-2 text-sm text-[var(--ink-2)]">
            {cam.current ? 'Imatge de les ' : 'Última imatge, de les '}
            <strong className="font-medium text-[var(--ink)]">{hour(cam.capturedLocal)}</strong>
            {' '}del {dateFull(cam.capturedLocal)} · {ago(cam.ageMin)}
          </figcaption>
        </figure>
      ) : (
        <section className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-5">
          <h2 className="text-base font-semibold tracking-tight">Aquesta càmera està aturada</h2>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-[var(--ink-2)]">
            Consta com a activa al catàleg de Ferrocarrils, però el fotograma que
            serveix és el mateix des del {dateFull(cam.capturedLocal)} a les{' '}
            {hour(cam.capturedLocal)}, {ago(cam.ageMin)}.
          </p>
        </section>
      )}

      <section className="mt-6 max-w-[64ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        {cam.nearest && (
          <p>
            El poble més proper amb fitxa és{' '}
            <Link href={cam.nearest.path} className="font-medium text-[var(--ink)]">
              {cam.nearest.nom}
            </Link>
            , a {num(cam.nearest.distKm, 1)} km en línia recta. Allà hi ha la predicció, el que
            mesura l’estació més propera i la cota de neu.
          </p>
        )}

        {cam.lat == null && (
          <p>
            El catàleg no en dona la coordenada, així que aquesta càmera no apareix a
            la fitxa de cap municipi.
          </p>
        )}

        {cam.panoramic && cam.viewer && (
          <p>
            És una càmera panoràmica i aquí se’n mostra la imatge plana. Al{' '}
            <a href={cam.viewer} rel="noopener noreferrer" className="font-medium text-[var(--ink)]">
              visor de Ferrocarrils
            </a>{' '}
            es pot girar.
          </p>
        )}
      </section>

      {siblings.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">
            Més càmeres {deResort(cam.resort)}
          </h2>
          <ul className="mt-3 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {siblings.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/cameres/${s.slug}`}
                  className="block overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] no-underline"
                >
                  <img
                    src={cameraImage(s, 'thumb')}
                    width={400}
                    height={225}
                    loading="lazy"
                    decoding="async"
                    alt={`Fotograma de la càmera ${s.name}, a ${s.resort}`}
                    className="block h-auto w-full bg-[var(--surface-2)]"
                  />
                  <div className="p-3">
                    <span className="block text-sm font-medium text-[var(--ink)]">{s.name}</span>
                    <span className="block text-[11px] text-[var(--muted)]">
                      {s.altitudM != null ? `${int(s.altitudM)} m · ` : ''}{ago(s.ageMin)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-8 border-t border-[var(--line-soft)] pt-4 text-xs leading-relaxed text-[var(--muted)]">
        {/* Redactat aixi perque val igual quan la imatge no s'ensenya: la
            camera i la llicencia son les mateixes tant si el fotograma es de
            fa deu minuts com si es d'abril. */}
        <p>
          Càmera de {cam.attribution}; les imatges es publiquen amb llicència{' '}
          {cam.license} i es desen un cop per hora.{' '}
          <Link href="/cameres" className="text-[var(--ink-2)]">Totes les càmeres</Link>.
        </p>
      </footer>
    </article>
  );
}

/**
 * «de La Molina», «d’Espot».
 *
 * Los nombres de las estaciones no llevan artículo en el catálogo, así que no
 * sirve `deName()` —que está para topónimos con artículo— pero la contracción
 * ante vocal sí hace falta: «Més càmeres de Espot» es una falta visible.
 */
function deResort(resort: string): string {
  return /^[aeiouàèéíòóúh]/i.test(resort) ? `d’${resort}` : `de ${resort}`;
}
