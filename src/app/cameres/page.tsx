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
              {cams.list.length} {cams.list.length === 1 ? 'càmera' : 'càmeres'} de
              Ferrocarrils, amb l’hora de cada fotografia. Una imatge diu en un segon
              el que un pronòstic no diu en un paràgraf: si hi ha boira al fons de la
              vall, si el cel és net o si la neu arriba fins baix.
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
            Consten com actives al catàleg i el seu servidor respon, però el fotograma
            que serveixen és el mateix des de la data que hi ha al costat. No s’ensenya:
            una foto de fa mesos presentada com la d’ara és pitjor que no tenir-ne cap.
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

      <section className="mt-8 max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
          Com es llegeix això
        </h2>
        <p>
          Cada fotograma porta l’hora en què el va fer la càmera, no l’hora en què
          nosaltres el vam desar. Per sota d’una hora i mitja és la imatge d’ara; més
          enllà surt amb l’antiguitat davant, i passades {CAMERA_SHOW_HOURS} hores es
          retira i la càmera passa a la llista de les aturades.
        </p>
        <p>
          De nit les imatges surten fosques. No és una errada: és el que hi ha, i
          guardar-se la de la tarda per ensenyar-la a mitjanit seria dir que la
          muntanya està com estava a les set.
        </p>
        <p>
          Les panoràmiques són fotogrames amples d’una càmera que gira. Aquí se’n
          serveix la imatge plana; per girar-la hi ha l’enllaç al visor original a la
          pàgina de cada càmera.
        </p>
      </section>

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
          . Les baixa i les reescala un servidor nostre cada hora: aquesta pàgina no
          fa cap petició a cap altre domini.
        </p>
        <p className="mt-1.5">
          El catàleg en publica 30. Cinc no s’hi poden incloure —la imatge és de la
          Corporació Catalana de Mitjans Audiovisuals, que no entra a la llicència del
          conjunt— i una altra és un reproductor incrustat, no una fotografia.
        </p>
      </footer>
    </article>
  );
}
