import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteSearch } from '@/components/SiteSearch';
import { QUICK_PLACES, sections as navSections } from '@/lib/nav';
import { getLang } from '@/lib/i18n';
import { tr } from '@/lib/lang';
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
 * Next ja hi posa `noindex` i torna un 404, que és el que ha de fer. Però el
 * `layout` hi afegia les seves —`index, follow` i el canònic de la portada—, i la
 * pàgina sortia amb dues ordres de robots contradictòries i dient que era la
 * portada. Per això les dues es tornen a escriure aquí.
 *
 * ## Per què el cos arriba buit i el pinta el navegador
 *
 * Quan una pàgina dinàmica crida `notFound()`, Next 16 no pot pintar aquesta
 * pàgina al servidor: l'error arriba a la closca, i el que s'envia és un
 * `<html id="__next_error__">` amb el `<head>` bo, l'estat 404 i el cos buit, que
 * omple el navegador. Passa a totes les rutes dinàmiques —`[comarca]` les agafa
 * gairebé totes— i no a la de l'arrel, que es pregenera sencera.
 *
 * L'arreglaria un `proxy.ts` que retornés la 404 abans de renderitzar, però
 * hauria de mirar cada petició de pàgina, també les que el CDN ja té guardades:
 * mesurat del 28 d'octubre al 3 de novembre de 2026, 381.000 peticions bones
 * contra 903 de no trobades, i la majoria eren robots buscant `/wp-admin`. Un
 * cercador rep l'estat 404 igualment; qui no té JavaScript és qui veu la pàgina
 * en blanc.
 *
 * El títol porta els dos idiomes: una `not-found` només admet `metadata` fix,
 * i no pot saber en quin domini s'ha demanat.
 */
export const metadata: Metadata = {
  title: 'Pàgina no trobada · Página no encontrada · TempsCat',
  robots: { index: false, follow: true },
  alternates: { canonical: null },
};

export default async function NotFound() {
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const quick = QUICK_PLACES.map((p) => locationByPath(p)).filter((l) => l != null);
  const sections = navSections(lang).flatMap((g) => g.links).filter((l) => l.icon).slice(0, 6);

  return (
    <article className="mx-auto max-w-2xl py-6">
      <p className="page-eyebrow">Error 404</p>
      <h1 className="page-title">{t('Aquesta pàgina no existeix', 'Esta página no existe')}</h1>
      <p className="mt-3 text-lg text-[var(--ink-2)]">
        {t('Potser l’enllaç és antic o l’adreça té una lletra canviada. Cerqueu el poble, la platja o l’estació que volíeu:',
          'Quizá el enlace es antiguo o la dirección tiene una letra cambiada. Busque el pueblo, la playa o la estación que quería:')}
      </p>

      <div className="mt-6">
        <SiteSearch lang={lang} variant="page" />
      </div>
      <ul className="chips mt-4" aria-label={t('Accessos ràpids', 'Accesos rápidos')}>
        {quick.map((l) => (
          <li key={l.path}><Link href={l.path}>{l.nom}</Link></li>
        ))}
      </ul>

      <h2 className="card-title mt-10">{t('O aneu a una secció', 'O vaya a una sección')}</h2>
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
        {t('O torneu a la ', 'O vuelva a la ')}<Link href="/">{t('portada', 'portada')}</Link>.
      </p>
    </article>
  );
}
