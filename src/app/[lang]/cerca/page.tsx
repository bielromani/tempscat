import type { Metadata } from 'next';
import Link from 'next/link';
import { MIN_QUERY, search } from '@/lib/search';
import { kindLabel } from '@/lib/search-kinds';
import { getLang } from '@/lib/i18n';
import { tr } from '@/lib/lang';
import { publishedPlaces } from '@/lib/territory';
import { int } from '@/lib/format';
import { SiteSearch } from '@/components/SiteSearch';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { alternatesFor } from '@/lib/site';

/**
 * El cercador.
 *
 * Un `<form method="get">` i prou: funciona sense JavaScript, funciona amb el
 * teclat, i cada cerca té la seva adreça, així que es pot desar o compartir.
 * El perquè d'aquesta decisió és a `src/lib/search.ts`.
 */
export const revalidate = 3600;
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tr(lang, 'Cercar un poble, una platja o una estació', 'Buscar un pueblo, una playa o una estación'),
    description: tr(lang,
      `Cerca entre les ${int(publishedPlaces())} poblacions de Catalunya, les comarques, les platges, `
      + 'els embassaments, les estacions automàtiques, les càmeres de muntanya i '
      + 'els itineraris senyalitzats.',
      `Búsqueda entre las ${int(publishedPlaces())} poblaciones de Cataluña, las comarcas, las playas, `
      + 'los embalses, las estaciones automáticas, las cámaras de montaña y '
      + 'las rutas señalizadas.'),
    alternates: alternatesFor('/cerca'),
  };
}

export default async function CercaPage(
  { searchParams }: { searchParams: Promise<{ q?: string }> },
) {
  const { q = '' } = await searchParams;
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const TRAIL = [
    { nom: t('Catalunya', 'Cataluña'), path: '/' },
    { nom: t('Cercar', 'Buscar'), path: '/cerca' },
  ];
  const results = await search(q, lang);
  const asked = q.trim().length > 0;
  const short = asked && q.trim().length < MIN_QUERY;

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(TRAIL, lang))} />

      <PageHero
        crumbs={TRAIL}
        eyebrow={t('Cercador', 'Buscador')}
        title={t('Cercar', 'Buscar')}
        lead={!asked && t(
          'Pobles, nuclis i comarques; platges, embassaments i aforaments; estacions de mesura, estacions de muntanya, càmeres i itineraris senyalitzats. Tot alhora, en una sola llista.',
          'Pueblos, núcleos y comarcas; playas, embalses y aforos; estaciones de medida, estaciones de montaña, cámaras y rutas señalizadas. Todo a la vez, en una sola lista.',
        )}
        note={!asked && t(
          'No cal escriure els accents, ni els articles, ni les preposicions: «mollo» troba Molló i «cala fosca», Cala la Fosca. Les platges, els embassaments i els aforaments porten a la seva fila dins de la pàgina corresponent, i la resta, a la seva fitxa.',
          'No hace falta escribir los acentos, ni los artículos, ni las preposiciones: «mollo» encuentra Molló y «cala fosca», Cala la Fosca. Las playas, los embalses y los aforos llevan a su fila dentro de la página correspondiente, y el resto, a su ficha.',
        )}
      >
        {/* Mateix component que la capçalera: aquí també hi ha suggeriments
            mentre s'escriu, i sense JavaScript segueix sent el formulari. */}
        <div className="mt-6">
          <SiteSearch lang={lang} variant="page" defaultValue={q} autoFocus />
        </div>
      </PageHero>

      {short && (
        <div className="card max-w-[48rem]">
          <p className="text-[var(--ink-2)]">{t(`Escriviu com a mínim ${MIN_QUERY} lletres.`, `Escriba al menos ${MIN_QUERY} letras.`)}</p>
        </div>
      )}

      {asked && !short && (
        results.hits.length === 0 ? (
          <div className="card max-w-[48rem]">
            <p className="text-[17px] text-[var(--ink-2)]">
              {t('Cap resultat per a ', 'Ningún resultado para ')}<strong className="font-semibold text-[var(--ink)]">{q}</strong>.
            </p>
            <p className="source measure">
              {t('Els accents, els articles i les preposicions no cal escriure’ls: «cala fosca» troba Cala la Fosca i «sant cugat valles», Sant Cugat del Vallès. Els disseminats no tenen pàgina pròpia i es consulten des de la seva entitat.',
                'Los acentos, los artículos y las preposiciones no hace falta escribirlos: «cala fosca» encuentra Cala la Fosca y «sant cugat valles», Sant Cugat del Vallès. Los diseminados no tienen página propia y se consultan desde su entidad.')}
            </p>
          </div>
        ) : (
          <Section
            id="resultats"
            className="mt-0! max-w-[48rem]"
            title={(
              <>
                {results.total === 1 ? t('Un resultat', 'Un resultado') : t(`${results.total} resultats`, `${results.total} resultados`)}
                {results.total > results.hits.length && (
                  <span className="ml-2 text-[15px] font-medium tracking-normal text-[var(--muted)]">
                    {t(`se n’ensenyen ${results.hits.length}`, `se muestran ${results.hits.length}`)}
                  </span>
                )}
              </>
            )}
          >
            <div className="card">
              <ul className="rows">
                {results.hits.map((h) => (
                  <li key={`${h.kind}:${h.href}:${h.title}`}>
                    <Link href={h.href} className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <span className="row-main">
                        <span className="row-title">{h.title}</span>
                        {h.context && <span className="row-sub">{h.context}</span>}
                      </span>
                      <span className="shrink-0 rounded-full border border-[var(--glass-line)] bg-[var(--glass)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--ink-2)]">
                        {kindLabel(lang, h.kind)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        )
      )}
    </article>
  );
}
