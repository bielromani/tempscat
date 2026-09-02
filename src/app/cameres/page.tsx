import type { Metadata } from 'next';
import Link from 'next/link';
import { allCameras, cameraImage, CAMERA_SHOW_HOURS } from '@/lib/cameras';
import { ListFilter, groupsOf } from '@/components/ListFilter';
import { ago, dateFull, int } from '@/lib/format';

/**
 * Les càmeres de muntanya.
 *
 * ## Por qué las imágenes están en nuestro dominio
 *
 * Porque las del catálogo no lo están. Las treinta URL de FGC apuntan a cinco
 * proveedores distintos, y ponerlas en el HTML mandaría la IP de cada visitante
 * a los cinco. Aquí las baja un worker cada hora, las reescala y las sirve una
 * route handler desde nuestro almacén: la página no habla con nadie de fuera.
 *
 * ## Y por qué esta página enseña menos cámaras de las que hay
 *
 * Porque cinco de las veinticuatro llevan horas o meses paradas y **la
 * fotografía vieja se sirve con un 200 tan tranquilo**. Salen abajo, con la
 * fecha de su último fotograma y sin imagen: decir «esta cámara lleva cinco
 * meses sin mandar» es información; enseñar la nieve de abril en septiembre, no.
 *
 * La reja es de miniaturas de 400 píxeles —diez kilobytes cada una, y con carga
 * diferida— y el fotograma grande solo lo baja quien entra en una cámara. Es la
 * regla de `shards.ts` aplicada a las imágenes: una página baja lo que enseña.
 */
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Càmeres de muntanya del Pirineu',
  description:
    'Com està el temps ara mateix a La Molina, Vall de Núria, Espot, Boí Taüll, '
    + 'Port Ainé, Vallter i el Montsec, vist per les càmeres de Ferrocarrils.',
  alternates: { canonical: '/cameres' },
};

export default async function CameresPage() {
  const cams = await allCameras();

  if (!cams) {
    return (
      <article className="max-w-[65ch]">
        <h1 className="text-3xl font-semibold tracking-tight">Càmeres de muntanya</h1>
        <p className="mt-4 leading-relaxed text-[var(--ink-2)]">
          Ara mateix no hi ha cap fotograma desat. Torneu-hi en una estona.
        </p>
      </article>
    );
  }

  const groups = groupsOf(cams.list, (c) => ({ key: c.resort, label: c.resort }));

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Càmeres</span>
      </nav>

      <header className="mb-6 max-w-[64ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Com està la muntanya ara mateix
        </h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
          {cams.list.length === 0 ? (
            <>
              Cap de les {cams.total} càmeres del catàleg de Ferrocarrils no ha enviat
              cap fotograma en les últimes {CAMERA_SHOW_HOURS} hores.
            </>
          ) : (
            <>
              Fotogrames de {cams.list.length}{' '}
              {cams.list.length === 1 ? 'càmera' : 'càmeres'} de Ferrocarrils al Pirineu
              i al Montsec, cada un amb l’hora en què es va prendre. No són imatges en
              directe: s’actualitzen un cop per hora.
            </>
          )}
        </p>
      </header>

      {cams.list.length > 0 && (
        <ListFilter id="fc" groups={groups} legend="Filtra per estació" allLabel="Totes les estacions">
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {cams.list.map((c) => (
              <li key={c.id} data-lf={c.resort}>
                <Link
                  href={`/cameres/${c.slug}`}
                  className="block overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] no-underline"
                >
                  {/* Amplada i alçada posades: sense elles la reja salta quan
                      arriben les imatges, i van amb carrega diferida perque
                      ningu baixa vint-i-quatre fotogrames per veure’n tres. */}
                  <img
                    src={cameraImage(c, 'thumb')}
                    width={400}
                    height={225}
                    loading="lazy"
                    decoding="async"
                    alt={`Fotograma de la càmera ${c.name}, a ${c.resort}`}
                    className="block h-auto w-full bg-[var(--surface-2)]"
                  />
                  <div className="p-3">
                    <span className="block font-medium text-[var(--ink)]">{c.name}</span>
                    <span className="block text-xs text-[var(--muted)]">
                      {[
                        c.resort,
                        c.altitudM != null && `${int(c.altitudM)} m`,
                        c.panoramic && 'panoràmica',
                      ].filter(Boolean).join(' · ')}
                    </span>
                    {/* El color només quan la imatge no és d’ara: una hora
                        d’antiguitat en una càmera de muntanya no és cap avis. */}
                    <span
                      className="mt-1.5 block text-[11px]"
                      style={{ color: c.current ? 'var(--muted)' : 'var(--ink-2)' }}
                    >
                      {c.current ? ago(c.ageMin) : `última imatge ${ago(c.ageMin)}`}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </ListFilter>
      )}

      {cams.stale.length > 0 && (
        <section className="mt-8 max-w-[65ch]">
          <h2 className="text-lg font-semibold tracking-tight">
            {cams.stale.length === 1 ? 'Una càmera aturada' : `${cams.stale.length} càmeres aturades`}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
            Consten com a actives al catàleg de Ferrocarrils, però el fotograma que
            serveixen no ha canviat des de la data indicada.
          </p>
          <ul className="mt-3 list-none space-y-1.5 p-0 text-sm">
            {cams.stale.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-[var(--ink-2)]">
                  {c.resort} · {c.name}
                </span>
                <span className="tnum text-xs text-[var(--muted)]">
                  {dateFull(c.capturedLocal)} · {ago(c.ageMin)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-8 border-t border-[var(--line-soft)] pt-4 text-xs leading-relaxed text-[var(--muted)]">
        <p>
          Imatges de {cams.attribution} ({cams.license}), del conjunt{' '}
          <a
            href="https://dadesobertes.fgc.cat/explore/dataset/webcams-actives-tim/"
            rel="noopener noreferrer"
            className="text-[var(--ink-2)]"
          >
            «Webcams dels equipaments turístics»
          </a>
          . Es desen un cop per hora i es retiren passades {CAMERA_SHOW_HOURS} hores
          sense fotograma nou.
        </p>
      </footer>
    </article>
  );
}
