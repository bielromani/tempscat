import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteSearch } from '@/components/SiteSearch';
import { QUICK_PLACES, SECTIONS } from '@/lib/nav';
import { locationByPath } from '@/lib/territory';

/**
 * La pàgina de «no trobada», per a qualsevol adreça que no existeix i per a
 * les que criden `notFound()`: una estació fora de servei, una càmera retirada.
 *
 * Fins al 5 d'octubre de 2026 era la de Next per defecte: «404: This page could
 * not be found.», en anglès i sense res del web. Qui hi arriba sol venir d'un
 * enllaç vell o d'un nom de poble escrit a mà a la barra, i el que necessita és
 * el cercador, no una disculpa.
 *
 * Next ja hi posa `noindex` i torna un 404, que és el que ha de fer.
 */
export const metadata: Metadata = {
  title: 'Pàgina no trobada · tempscat',
};

export default function NotFound() {
  const quick = QUICK_PLACES.map((p) => locationByPath(p)).filter((l) => l != null);
  const sections = SECTIONS.flatMap((g) => g.links).filter((l) => l.icon).slice(0, 6);

  return (
    <article className="mx-auto max-w-2xl py-6">
      <p className="page-eyebrow">Error 404</p>
      <h1 className="page-title">Aquesta pàgina no existeix</h1>
      <p className="mt-3 text-lg text-[var(--ink-2)]">
        Potser l&apos;enllaç és antic o l&apos;adreça té una lletra canviada. Cerqueu el
        poble, la platja o l&apos;estació que volíeu:
      </p>

      <div className="mt-6">
        <SiteSearch variant="page" />
      </div>
      <ul className="chips mt-4" aria-label="Accessos ràpids">
        {quick.map((l) => (
          <li key={l.path}><Link href={l.path}>{l.nom}</Link></li>
        ))}
      </ul>

      <h2 className="card-title mt-10">O aneu a una secció</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {sections.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="card flex items-center gap-3 no-underline">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src={`/icons/w/${l.icon}.svg`} width={32} height={32} alt="" />
              <span className="text-[var(--ink)]">{l.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-[var(--muted)]">
        O torneu a la <Link href="/">portada</Link>.
      </p>
    </article>
  );
}
