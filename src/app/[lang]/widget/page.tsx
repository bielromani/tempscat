import type { Metadata } from 'next';
import Link from 'next/link';
import { getLang } from '@/lib/i18n';
import { tr } from '@/lib/lang';
import { placeName } from '@/lib/format';
import { locationByPath } from '@/lib/territory';
import { search } from '@/lib/search';
import { absolute, alternatesFor, siteUrl } from '@/lib/site';
import { piecesFor, widgetData, widgetTitle } from '@/lib/widget';
import { PageHero } from '@/components/PageHero';
import { WidgetBuilder } from '@/components/WidgetBuilder';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';

/**
 * El configurador del widget: es tria el lloc, es marquen les peces i es veu
 * com queda mentre es tria. Les caselles són de `WidgetBuilder.tsx`, que és un
 * component de client; el cercador de lloc segueix sent un `<form method="get">`
 * que torna aquí amb `?q=`, i triar un resultat posa `?lloc=`.
 *
 * ## Per què el codi porta un enllaç fora de l'iframe
 *
 * Un enllaç de dins de l'`<iframe>` és contingut de TempsCat, no de la web que
 * el posa: per als cercadors no és un enllaç d'aquella web. El `<a>` de sota sí.
 * Porta a la fitxa del poble, amb el nom del poble, visible i fàcil de treure,
 * que és com Google diu que ha de ser un enllaç que viatja amb un widget.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tr(lang, 'El temps del vostre poble, a la vostra web · TempsCat', 'El tiempo de su pueblo, en su web · TempsCat'),
    description: tr(lang,
      'Un requadre amb el temps d’ara, la predicció i els avisos de qualsevol poble de Catalunya per posar a una web. Trieu què hi surt i copieu el codi.',
      'Un recuadro con el tiempo de ahora, la previsión y los avisos de cualquier pueblo de Cataluña para poner en una web. Elija qué aparece y copie el código.'),
    alternates: alternatesFor('/widget'),
  };
}

/** El lloc d'exemple quan encara no se n'ha triat cap: té mar, que és el que ensenya més peces. */
const EXAMPLE = '/maresme/malgrat-de-mar';

export default async function WidgetPage({ searchParams }: {
  searchParams: Promise<{ lloc?: string; q?: string }>;
}) {
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const sp = await searchParams;
  const chosen = sp.lloc ? locationByPath(sp.lloc) : undefined;
  const picked = chosen && chosen.published && chosen.level !== 'comarca' ? chosen : undefined;
  const loc = picked ?? locationByPath(EXAMPLE)!;
  const hits = sp.q ? (await search(sp.q, lang)).hits.filter((h) => h.kind === 'poblacio').slice(0, 12) : [];
  const available = piecesFor(loc, await widgetData(loc, lang));

  const trail = [
    { nom: t('Inici', 'Inicio'), path: '/' },
    { nom: 'Widget', path: '/widget' },
  ];

  return (
    <article data-wide>
      <PageHero
        crumbs={trail}
        eyebrow="Widget"
        icon="partly-cloudy-day"
        title={t('El temps del vostre poble, a la vostra web', 'El tiempo de su pueblo, en su web')}
        lead={t(
          'Un requadre amb el temps d’ara i la predicció de qualsevol poble de Catalunya. Trieu què hi surt —els avisos, el vent, l’aire, el mar o la neu— i copieu el codi. S’actualitza sol, en temps real, i no porta cookies.',
          'Un recuadro con el tiempo de ahora y la previsión de cualquier pueblo de Cataluña. Elija qué aparece —los avisos, el viento, el aire, el mar o la nieve— y copie el código. Se actualiza solo, en tiempo real, y no lleva cookies.',
        )}
      >
        <form method="get" action="/widget" className="mt-6 flex flex-wrap gap-2">
          <input
            type="search" name="q" defaultValue={sp.q ?? ''} required minLength={2}
            placeholder={t('Busqueu el vostre poble', 'Busque su pueblo')}
            aria-label={t('Poble', 'Pueblo')}
            className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-transparent px-3 py-2"
          />
          <button type="submit" className="rounded-md bg-[var(--accent-soft)] px-4 py-2">{t('Busca', 'Buscar')}</button>
        </form>
        {hits.length > 0 && (
          <ul className="chips mt-3">
            {hits.map((h) => (
              <li key={h.href}><Link href={`/widget?lloc=${encodeURIComponent(h.href)}`}>{h.title}{h.context ? <span>{h.context}</span> : null}</Link></li>
            ))}
          </ul>
        )}
        {sp.q && !hits.length && <p className="mt-3">{t('No hi ha cap poble amb aquest nom.', 'No hay ningún pueblo con este nombre.')}</p>}
        <p className="mt-4">
          {picked
            ? <>{t('Widget de', 'Widget de')} <b>{placeName(loc.nom, lang)}</b></>
            : <>{t('D’exemple,', 'De ejemplo,')} <b>{placeName(loc.nom, lang)}</b>. {t('Busqueu el vostre poble a dalt.', 'Busque su pueblo arriba.')}</>}
        </p>
      </PageHero>

      <WidgetBuilder
        key={loc.path}
        path={loc.path}
        title={widgetTitle(loc, lang)}
        fitxa={absolute(loc.path, lang)}
        origin={siteUrl(lang).replace(/\/$/, '')}
        available={available}
        lang={lang}
      />

      <JsonLd data={graph(breadcrumbLd(trail, lang))} />
    </article>
  );
}
