/* eslint-disable @next/next/no-img-element -- El por qué está en eslint.config.mjs: el
   worker ya ha desat cada fotograma en les dues mides que la web ensenya, i `next/image`
   només hi afegiria una quota de plataforma per repetir una feina feta. */
import Link from 'next/link';
import { ago, int, num } from '@/lib/format';
import { cameraImage, type CameraNow } from '@/lib/cameras';

/**
 * Les càmeres que hi ha a prop d'un poble.
 *
 * ## Por qué esto no está en las 4.293 fichas
 *
 * Porque solo hay cámaras en siete estaciones del Pirineu y del Montsec. La
 * lista llega ya filtrada por distancia desde `camerasNear()`, y en la inmensa
 * mayoría de las fichas viene vacía y el bloque no se dibuja: **una página baja
 * lo que enseña**, y una ficha del Baix Llobregat no baja ninguna miniatura.
 *
 * ## Y por qué la hora va en cada tarjeta y no en el título
 *
 * Porque cada cámara manda a su ritmo, y una puede haber refrescado hace diez
 * minutos y la de al lado hace cuatro horas. Una sola hora en la cabecera
 * afirmaría de las tres lo que solo es verdad de una.
 */
export function CameraBlock({ cameras }: { cameras: Array<CameraNow & { distKm: number }> }) {
  return (
    <>
      <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {cameras.map((c) => (
          <li key={c.id}>
            <Link
              href={`/cameres/${c.slug}`}
              className="block overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] no-underline"
            >
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
                <span className="block text-sm font-medium text-[var(--ink)]">{c.name}</span>
                <span className="block text-xs text-[var(--muted)]">
                  {[
                    c.resort,
                    `${num(c.distKm, 1)} km`,
                    c.altitudM != null && `${int(c.altitudM)} m`,
                  ].filter(Boolean).join(' · ')}
                </span>
                <span className="mt-1 block text-[11px] text-[var(--muted)]">
                  {c.current ? ago(c.ageMin) : `última imatge ${ago(c.ageMin)}`}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Imatges de Ferrocarrils de la Generalitat de Catalunya (CC BY 4.0), desades un
        cop per hora. <Link href="/cameres" className="text-[var(--ink-2)]">Totes les càmeres</Link>.
      </p>
    </>
  );
}
