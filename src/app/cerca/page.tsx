import type { Metadata } from 'next';
import Link from 'next/link';
import { MIN_QUERY, search } from '@/lib/search';
import { KIND_LABEL } from '@/lib/search-kinds';
import { publishedPlaces } from '@/lib/territory';
import { SiteSearch } from '@/components/SiteSearch';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';

/**
 * El cercador.
 *
 * Un `<form method="get">` i prou: funciona sense JavaScript, funciona amb el
 * teclat, i cada cerca té la seva adreça, així que es pot desar o compartir.
 * El perquè d'aquesta decisió és a `src/lib/search.ts`.
 */
export const revalidate = 3600;
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cercar un poble, una platja o una estació',
  description:
    `Cerca entre les ${publishedPlaces().toLocaleString('ca-ES')} poblacions de Catalunya, les comarques, les platges, `
    + 'els embassaments, les estacions automàtiques, les càmeres de muntanya i '
    + 'els itineraris senyalitzats.',
  alternates: { canonical: '/cerca' },
  robots: { index: true, follow: true },
};

const TRAIL = [
  { nom: 'Catalunya', path: '/' },
  { nom: 'Cercar', path: '/cerca' },
];

export default async function CercaPage(
  { searchParams }: { searchParams: Promise<{ q?: string }> },
) {
  const { q = '' } = await searchParams;
  const results = await search(q);
  const asked = q.trim().length > 0;
  const short = asked && q.trim().length < MIN_QUERY;

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(TRAIL))} />

      <PageHero
        crumbs={TRAIL}
        eyebrow="Cercador"
        title="Cercar"
        lead={!asked && (
          <>
            Pobles, nuclis i comarques; platges, embassaments i aforaments;
            estacions de mesura, estacions de muntanya, càmeres i itineraris
            senyalitzats. Tot alhora, en una sola llista.
          </>
        )}
        note={!asked && (
          <>
            No cal escriure els accents, ni els articles, ni les preposicions:
            «mollo» troba Molló i «cala fosca», Cala la Fosca. Les platges, els
            embassaments i els aforaments porten a la seva fila dins de la pàgina
            corresponent, i la resta, a la seva fitxa.
          </>
        )}
      >
        {/* Mateix component que la capçalera: aquí també hi ha suggeriments
            mentre s'escriu, i sense JavaScript segueix sent el formulari. */}
        <div className="mt-6">
          <SiteSearch variant="page" defaultValue={q} autoFocus />
        </div>
      </PageHero>

      {short && (
        <div className="card max-w-[48rem]">
          <p className="text-[var(--ink-2)]">Escriviu com a mínim {MIN_QUERY} lletres.</p>
        </div>
      )}

      {asked && !short && (
        results.hits.length === 0 ? (
          <div className="card max-w-[48rem]">
            <p className="text-[17px] text-[var(--ink-2)]">
              Cap resultat per a <strong className="font-semibold text-[var(--ink)]">{q}</strong>.
            </p>
            <p className="source measure">
              Els accents, els articles i les preposicions no cal escriure&apos;ls:
              «cala fosca» troba Cala la Fosca i «sant cugat valles», Sant Cugat del
              Vallès. Els disseminats no tenen pàgina pròpia i es consulten des de
              la seva entitat.
            </p>
          </div>
        ) : (
          <Section
            id="resultats"
            className="mt-0! max-w-[48rem]"
            title={(
              <>
                {results.total === 1 ? 'Un resultat' : `${results.total} resultats`}
                {results.total > results.hits.length && (
                  <span className="ml-2 text-[15px] font-medium tracking-normal text-[var(--muted)]">
                    se n&apos;ensenyen {results.hits.length}
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
                        {KIND_LABEL[h.kind]}
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
