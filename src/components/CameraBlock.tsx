/* eslint-disable @next/next/no-img-element -- El por qué está en eslint.config.mjs: el
   worker ya ha desat cada fotograma en les dues mides que la web ensenya, i `next/image`
   només hi afegiria una quota de plataforma per repetir una feina feta. */
import Link from 'next/link';
import { aName, ago, int, num } from '@/lib/format';
import { cameraImage, type CameraNow } from '@/lib/cameras';

/**
 * La targeta d'una càmera: la miniatura a dalt, el nom, d'on és i de quan.
 *
 * ## Per què és una peça i no tres còpies
 *
 * La mateixa targeta surt a `/cameres`, a la pàgina de cada càmera («Més
 * càmeres de…») i a la fitxa d'un poble amb càmeres a prop. Eren tres còpies
 * del mateix marcatge, i el dia que una canviés la manera de dir de quan és la
 * imatge, les altres dues seguirien dient-ho a l'antiga.
 *
 * ## La miniatura, de vora a vora
 *
 * `.card` porta el seu farciment i aquí la imatge va enganxada a les vores de
 * dalt: per això el `p-0!`, que ha de guanyar a una regla sense capa de
 * `globals.css`. Amplada i alçada posades —sense elles la reixa salta quan
 * arriben les imatges— i càrrega diferida, perquè ningú baixa vint-i-quatre
 * fotogrames per veure'n tres.
 *
 * ## El color de l'hora
 *
 * Més clara només quan la imatge no és d'ara, i sense color d'avís: una hora
 * d'antiguitat en una càmera de muntanya no és cap alarma.
 */
export function CameraCard({ camera: c, meta, loading = 'lazy' }: {
  camera: CameraNow;
  /** El que va sota el nom: l'estació, la distància, l'altitud. */
  meta: Array<string | false | null | undefined>;
  loading?: 'lazy' | 'eager';
}) {
  const line = meta.filter(Boolean).join(' · ');
  return (
    <Link href={`/cameres/${c.slug}`} className="card flex h-full flex-col overflow-hidden p-0!">
      <img
        src={cameraImage(c, 'thumb')}
        width={400}
        height={225}
        loading={loading}
        decoding="async"
        alt={`Fotograma de la càmera ${c.name}, ${aName(c.resort)}`}
        className="block aspect-video h-auto w-full bg-[var(--surface-2)] object-cover"
      />
      <span className="flex flex-1 flex-col px-3.5 pb-3 pt-2.5">
        <span className="block text-[15px] font-semibold leading-snug text-[var(--ink)]">{c.name}</span>
        {line && <span className="block text-[12.5px] text-[var(--muted)]">{line}</span>}
        <span
          className="mt-auto block pt-1.5 text-[12px]"
          style={{ color: c.current ? 'var(--muted)' : 'var(--ink-2)' }}
        >
          {c.current ? ago(c.ageMin) : `última imatge ${ago(c.ageMin)}`}
        </span>
      </span>
    </Link>
  );
}

/**
 * Les càmeres que hi ha a prop d'un poble.
 *
 * ## Por qué esto no está en las 4.293 fichas
 *
 * Porque solo hay cámaras en siete estaciones del Pirineo y del Montsec. La
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
      <ul className="card-grid">
        {cameras.map((c) => (
          <li key={c.id}>
            <CameraCard
              camera={c}
              meta={[c.resort, `${num(c.distKm, 1)} km`, c.altitudM != null && `${int(c.altitudM)} m`]}
            />
          </li>
        ))}
      </ul>
      <p className="source">
        Imatges de Ferrocarrils de la Generalitat de Catalunya (CC BY 4.0), desades un
        cop per hora.{' '}
        <Link href="/cameres" className="text-[var(--accent)] no-underline hover:underline">
          Totes les càmeres
        </Link>.
      </p>
    </>
  );
}
