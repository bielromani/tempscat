import type { Metadata } from 'next';
import Link from 'next/link';
import { allCameras, cameraImage, CAMERA_SHOW_HOURS } from '@/lib/cameras';
import { ListFilter, groupsOf } from '@/components/ListFilter';
import { aName, ago, dateFull, int } from '@/lib/format';
import { External } from '@/components/External';
import { CameraCard } from '@/components/CameraBlock';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';

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
 *
 * ## La de la cabecera es la misma miniatura
 *
 * A la derecha del título va la cámara más reciente, y va **en la miniatura**,
 * no en el fotograma grande: es el mismo fichero que la primera tarjeta de la
 * reja, así que el navegador lo baja una vez y la cabecera no cuesta nada.
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Càmeres de muntanya del Pirineu',
  description:
    'Com està el temps ara mateix a La Molina, Vall de Núria, Espot, Boí Taüll, '
    + 'Port Ainé, Vallter i el Montsec, vist per les càmeres de Ferrocarrils.',
  alternates: { canonical: '/cameres' },
};

export default async function CameresPage() {
  const cams = await allCameras();

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Càmeres', path: '/cameres' },
  ];

  if (!cams) {
    return (
      <article>
        <JsonLd data={graph(breadcrumbLd(trail))} />
        <PageHero
          crumbs={trail}
          eyebrow="Càmeres de muntanya"
          icon="partly-cloudy-day"
          title="Com està la muntanya ara mateix"
          lead="Ara mateix no hi ha cap fotograma desat. Torneu-hi en una estona."
        />
      </article>
    );
  }

  const groups = groupsOf(cams.list, (c) => ({ key: c.resort, label: c.resort }));
  const latest = cams.list[0] ?? null;
  const resorts = new Set(cams.list.map((c) => c.resort)).size;

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Càmeres de muntanya"
        icon="partly-cloudy-day"
        title="Com està la muntanya ara mateix"
        lead={cams.list.length === 0 ? (
          <>
            Cap de les {cams.total} càmeres del catàleg de Ferrocarrils no ha enviat
            cap fotograma en les últimes {CAMERA_SHOW_HOURS} hores.
          </>
        ) : (
          <>
            Fotogrames de {cams.list.length}{' '}
            {cams.list.length === 1 ? 'càmera' : 'càmeres'} de Ferrocarrils al Pirineu
            i al Montsec, cada un amb l&apos;hora en què es va prendre.
          </>
        )}
        stats={cams.list.length > 0 ? [
          {
            label: 'Càmeres',
            icon: 'partly-cloudy-day',
            value: int(cams.list.length),
            unit: `de ${cams.total}`,
            sub: 'amb fotograma de les últimes hores',
          },
          {
            label: 'Estacions',
            icon: 'snow',
            value: int(resorts),
            sub: 'de muntanya amb imatge',
          },
          cams.stale.length > 0 && {
            label: 'Aturades',
            icon: 'not-available',
            value: int(cams.stale.length),
            sub: <a href="#aturades">sense fotograma nou</a>,
          },
        ] : undefined}
        note="No són imatges en directe: es desen un cop per hora."
        aside={latest && (
          /* Al mòbil no: seria la mateixa imatge que la primera de la reixa, just a sota. */
          <section className="card hidden lg:block" aria-label="La càmera amb el fotograma més recent">
            <p className="card-label">
              <img src="/icons/w/clear-day.svg" width={22} height={22} alt="" />
              La més recent
            </p>
            <Link href={`/cameres/${latest.slug}`} className="block no-underline">
              <img
                src={cameraImage(latest, 'thumb')}
                width={400}
                height={225}
                decoding="async"
                alt={`Fotograma de la càmera ${latest.name}, ${aName(latest.resort)}`}
                className="block aspect-video h-auto w-full rounded-[14px] bg-[var(--surface-2)] object-cover"
              />
              <span className="mt-2.5 block text-[15px] font-semibold text-[var(--ink)]">{latest.name}</span>
              <span className="block text-[13px] text-[var(--muted)]">
                {[latest.resort, latest.altitudM != null && `${int(latest.altitudM)} m`, ago(latest.ageMin)]
                  .filter(Boolean).join(' · ')}
              </span>
            </Link>
          </section>
        )}
      />

      {cams.list.length > 0 && (
        <Section id="totes" title={`Les ${cams.list.length} càmeres`}>
          <ListFilter id="fc" groups={groups} legend="Filtra per estació" allLabel="Totes les estacions">
            {/* Dues columnes també al mòbil: d'una en una, dinou fotogrames eren deu pantalles. */}
            <ul className="card-grid cols-4 max-sm:grid-cols-2! max-sm:gap-2.5!">
              {cams.list.map((c) => (
                <li key={c.id} data-lf={c.resort}>
                  <CameraCard
                    camera={c}
                    meta={[
                      c.resort,
                      c.altitudM != null && `${int(c.altitudM)} m`,
                      c.panoramic && 'panoràmica',
                    ]}
                  />
                </li>
              ))}
            </ul>
          </ListFilter>
          <p className="source">
            Imatges de {cams.attribution} ({cams.license}), del conjunt{' '}
            <External
              href="https://dadesobertes.fgc.cat/explore/dataset/webcams-actives-tim/"
              className="text-[var(--ink-2)]"
            >
              «Webcams dels equipaments turístics»
            </External>
            . Es desen un cop per hora i es retiren passades {CAMERA_SHOW_HOURS} hores
            sense fotograma nou.
          </p>
        </Section>
      )}

      {cams.stale.length > 0 && (
        <Section
          id="aturades"
          title={cams.stale.length === 1 ? 'Una càmera aturada' : `${cams.stale.length} càmeres aturades`}
        >
          <div className="card">
            <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">
              Consten com a actives al catàleg de Ferrocarrils, però el fotograma que
              serveixen no ha canviat des de la data indicada.
            </p>
            <ul className="rows mt-3">
              {cams.stale.map((c) => (
                <li key={c.id}>
                  <Link href={`/cameres/${c.slug}`} className="row-main">
                    <span className="row-title">{c.name}</span>
                    <span className="row-sub">{c.resort}</span>
                  </Link>
                  <span className="tnum shrink-0 text-right text-[13px] text-[var(--muted)]">
                    {dateFull(c.capturedLocal)}
                    <span className="block text-[12px]">{ago(c.ageMin)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {cams.list.length === 0 && (
        <p className="source">
          Imatges de {cams.attribution} ({cams.license}). Es desen un cop per hora i es
          retiren passades {CAMERA_SHOW_HOURS} hores sense fotograma nou.
        </p>
      )}
    </article>
  );
}
