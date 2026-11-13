import type { Metadata } from 'next';
import Link from 'next/link';
import { getLang } from '@/lib/i18n';
import { tr, type Lang } from '@/lib/lang';
import { aName, placeName } from '@/lib/format';
import { locationByPath, type Location } from '@/lib/territory';
import { search } from '@/lib/search';
import { absolute, alternatesFor } from '@/lib/site';
import {
  kindsFor, widgetData, widgetHeight, WIDGET_SIZES, WIDGET_THEMES,
  type WidgetKind, type WidgetSize, type WidgetTheme,
} from '@/lib/widget';
import { PageHero, Section } from '@/components/PageHero';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';

/**
 * El configurador del widget: es tria el lloc, es veuen totes les variants que
 * aquell lloc pot portar i es copia el codi.
 *
 * Sense JavaScript, com les altres pàgines de secció: el cercador és un
 * `<form method="get">` que torna aquí amb `?q=`, i triar un resultat posa
 * `?lloc=`. El codi va en un `<textarea>` de només lectura perquè es pugui
 * seleccionar d'un toc.
 *
 * ## Per què el codi porta un enllaç fora de l'iframe
 *
 * Un enllaç de dins de l'`<iframe>` és contingut de tempscat, no de la web que
 * el posa: per als cercadors no és un enllaç d'aquella web. El `<a>` de sota sí.
 * Va amb el nom del lloc i de la marca, visible i fàcil de treure, que és com
 * Google diu que ha de ser un enllaç que viatja amb un widget.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tr(lang, 'El temps del vostre poble, a la vostra web · tempscat', 'El tiempo de su pueblo, en su web · tempscat'),
    description: tr(lang,
      'Un requadre amb el temps d’ara, la predicció i els avisos de qualsevol lloc de Catalunya, per posar-lo a una web. Sense galetes ni scripts.',
      'Un recuadro con el tiempo de ahora, la previsión y los avisos de cualquier lugar de Cataluña, para ponerlo en una web. Sin cookies ni scripts.'),
    alternates: alternatesFor('/widget'),
  };
}

/** Tres llocs per ensenyar els tres tipus quan encara no se n'ha triat cap. */
const EXAMPLES = ['/maresme/malgrat-de-mar', '/ripolles/queralbs', '/barcelones/barcelona'];

const KIND_LABEL: Record<WidgetKind, [string, string]> = {
  temps: ['El temps', 'El tiempo'],
  platja: ['Platja', 'Playa'],
  neu: ['Neu', 'Nieve'],
};
const SIZE_LABEL: Record<WidgetSize, [string, string]> = {
  petit: ['Petit', 'Pequeño'], mitja: ['Mitjà', 'Mediano'], gran: ['Gran', 'Grande'],
};

function widgetSrc(loc: Location, kind: WidgetKind, size: WidgetSize, theme: WidgetTheme): string {
  const q = new URLSearchParams();
  if (kind !== 'temps') q.set('tipus', kind);
  if (size !== 'mitja') q.set('mida', size);
  if (theme !== 'fosc') q.set('tema', theme);
  const s = q.toString();
  return `/widget${loc.path}${s ? `?${s}` : ''}`;
}

function snippet(loc: Location, kind: WidgetKind, size: WidgetSize, theme: WidgetTheme, lang: Lang): string {
  const title = tr(lang, `El temps ${aName(loc.nom)}`, `El tiempo ${aName(loc.nom, lang)}`);
  return `<iframe src="${absolute(widgetSrc(loc, kind, size, theme), lang)}" width="320" height="${widgetHeight(size, kind)}" style="border:0;max-width:100%" loading="lazy" title="${title}"></iframe>
<p style="margin:4px 0 0;font:13px sans-serif"><a href="${absolute(loc.path, lang)}">${title}</a> · tempscat</p>`;
}

async function Gallery({ loc, theme, lang, sizes }: {
  loc: Location; theme: WidgetTheme; lang: Lang; sizes: readonly WidgetSize[];
}) {
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const kinds = kindsFor(await widgetData(loc));
  return (
    <>
      {kinds.map((kind) => (
        <Section key={kind} id={`w-${loc.slug}-${kind}`} title={`${tr(lang, ...KIND_LABEL[kind])} · ${placeName(loc.nom, lang)}`}>
          <div className="flex flex-wrap items-start gap-6">
            {sizes.map((size) => (
              <figure key={size} className="m-0 grid gap-2" style={{ width: 320, maxWidth: '100%' }}>
                <iframe
                  src={widgetSrc(loc, kind, size, theme)}
                  width={320}
                  height={widgetHeight(size, kind)}
                  style={{ border: 0, maxWidth: '100%' }}
                  loading="lazy"
                  title={`${tr(lang, ...SIZE_LABEL[size])} · ${tr(lang, ...KIND_LABEL[kind])}`}
                />
                <figcaption className="text-sm text-[var(--ink-2)]">{tr(lang, ...SIZE_LABEL[size])} · 320 × {widgetHeight(size, kind)}</figcaption>
                <textarea
                  readOnly
                  rows={4}
                  className="w-full rounded-md border border-[var(--line)] bg-transparent p-2 font-mono text-xs"
                  aria-label={t('Codi per copiar', 'Código para copiar')}
                  defaultValue={snippet(loc, kind, size, theme, lang)}
                />
              </figure>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

export default async function WidgetPage({ searchParams }: {
  searchParams: Promise<{ lloc?: string; q?: string; tema?: string }>;
}) {
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const sp = await searchParams;
  const theme: WidgetTheme = (WIDGET_THEMES as readonly string[]).includes(sp.tema ?? '') ? sp.tema as WidgetTheme : 'fosc';
  const chosen = sp.lloc ? locationByPath(sp.lloc) : undefined;
  const loc = chosen && chosen.published && chosen.level !== 'comarca' ? chosen : undefined;
  const hits = sp.q ? (await search(sp.q, lang)).hits.filter((h) => h.kind === 'poblacio').slice(0, 12) : [];

  const trail = [
    { nom: t('Inici', 'Inicio'), path: '/' },
    { nom: 'Widget', path: '/widget' },
  ];
  const keep = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ ...(loc ? { lloc: loc.path } : {}), ...(theme !== 'fosc' ? { tema: theme } : {}), ...extra });
    return `/widget?${q.toString()}`;
  };

  return (
    <article data-wide>
      <PageHero
        crumbs={trail}
        eyebrow="Widget"
        icon="partly-cloudy-day"
        title={t('El temps del vostre poble, a la vostra web', 'El tiempo de su pueblo, en su web')}
        lead={t(
          'Un requadre amb la temperatura d’ara, la predicció i els avisos oficials de qualsevol lloc de Catalunya. Als pobles de costa també hi ha el mar, i als de muntanya, la neu. No porta galetes ni scripts, i s’actualitza sol cada cinc minuts.',
          'Un recuadro con la temperatura de ahora, la previsión y los avisos oficiales de cualquier lugar de Cataluña. En los pueblos de costa también está el mar, y en los de montaña, la nieve. No lleva cookies ni scripts, y se actualiza solo cada cinco minutos.',
        )}
      >
        <form method="get" action="/widget" className="mt-6 flex flex-wrap gap-2">
          <input
            type="search" name="q" defaultValue={sp.q ?? ''} required minLength={2}
            placeholder={t('Busqueu un poble o una ciutat', 'Busque un pueblo o una ciudad')}
            className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-transparent px-3 py-2"
          />
          {theme !== 'fosc' && <input type="hidden" name="tema" value={theme} />}
          <button type="submit" className="rounded-md bg-[var(--accent-soft)] px-4 py-2">{t('Busca', 'Buscar')}</button>
        </form>
        {hits.length > 0 && (
          <ul className="chips mt-3">
            {hits.map((h) => (
              <li key={h.href}><Link href={keep({ lloc: h.href })}>{h.title}{h.context ? ` · ${h.context}` : ''}</Link></li>
            ))}
          </ul>
        )}
        {sp.q && !hits.length && <p className="mt-3">{t('No hi ha cap poble amb aquest nom.', 'No hay ningún pueblo con este nombre.')}</p>}
        <p className="mt-4 text-sm">
          {t('Color:', 'Color:')}{' '}
          {WIDGET_THEMES.map((th, i) => (
            <span key={th}>
              {i > 0 && ' · '}
              {th === theme
                ? <b>{th === 'fosc' ? t('fosc', 'oscuro') : t('clar', 'claro')}</b>
                : <Link href={keep({ tema: th })}>{th === 'fosc' ? t('fosc', 'oscuro') : t('clar', 'claro')}</Link>}
            </span>
          ))}
        </p>
      </PageHero>

      {loc
        ? <Gallery loc={loc} theme={theme} lang={lang} sizes={WIDGET_SIZES} />
        : await Promise.all(EXAMPLES.map(async (p) => {
          const l = locationByPath(p);
          return l ? <Gallery key={p} loc={l} theme={theme} lang={lang} sizes={WIDGET_SIZES} /> : null;
        }))}

      <JsonLd data={graph(breadcrumbLd(trail, lang))} />
    </article>
  );
}
