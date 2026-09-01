import type { Metadata } from 'next';
import Link from 'next/link';
import { MIN_QUERY, search, type SearchKind } from '@/lib/search';

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
    'Cerca entre les 4.293 poblacions de Catalunya, les comarques, les platges i '
    + 'les estacions automàtiques del Meteocat.',
  alternates: { canonical: '/cerca' },
  robots: { index: true, follow: true },
};

const KIND_LABEL: Record<SearchKind, string> = {
  poblacio: 'Població',
  comarca: 'Comarca',
  estacio: 'Estació',
  platja: 'Platja',
  pagina: 'Pàgina',
};

export default async function CercaPage(
  { searchParams }: { searchParams: Promise<{ q?: string }> },
) {
  const { q = '' } = await searchParams;
  const results = await search(q);
  const asked = q.trim().length > 0;

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Cercar</span>
      </nav>

      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Cercar</h1>
      <p className="mt-2 max-w-[62ch] text-[var(--ink-2)]">
        Pobles, nuclis, comarques, platges i estacions, tot alhora.
      </p>

      <form action="/cerca" method="get" role="search" className="mt-5 flex max-w-lg gap-2">
        <label htmlFor="q" className="sr-only">Què busqueu</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          autoFocus
          placeholder="Molló, Cadaqués, Vall d&apos;Aran…"
          className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:border-[var(--accent)]"
        >
          Cercar
        </button>
      </form>

      {asked && q.trim().length < MIN_QUERY && (
        <p className="mt-6 text-[var(--ink-2)]">
          Escriviu com a mínim {MIN_QUERY} lletres.
        </p>
      )}

      {asked && q.trim().length >= MIN_QUERY && (
        results.hits.length === 0 ? (
          <div className="mt-6 max-w-[62ch]">
            <p className="text-[var(--ink-2)]">
              Cap resultat per a <strong className="font-medium text-[var(--ink)]">{q}</strong>.
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Els accents i els articles no cal escriure&apos;ls: «ametlla» troba
              l&apos;Ametlla del Vallès i «mollo», Molló. Els disseminats no tenen
              pàgina pròpia i es consulten des de la seva entitat.
            </p>
          </div>
        ) : (
          <section className="mt-6">
            <p className="mb-3 text-sm text-[var(--muted)]">
              {results.total === 1
                ? 'Un resultat'
                : `${results.total} resultats`}
              {results.total > results.hits.length && ` · se n'ensenyen ${results.hits.length}`}
            </p>
            <ul className="divide-y divide-[var(--line-soft)]">
              {results.hits.map((h) => (
                <li key={`${h.kind}:${h.href}:${h.title}`}>
                  <Link
                    href={h.href}
                    className="flex items-baseline justify-between gap-3 py-2.5 no-underline hover:bg-[var(--surface)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[var(--ink)]">{h.title}</span>
                      {h.context && (
                        <span className="block truncate text-xs text-[var(--muted)]">{h.context}</span>
                      )}
                    </span>
                    <span className="shrink-0 rounded border border-[var(--line-soft)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">
                      {KIND_LABEL[h.kind]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      )}

      {!asked && (
        <p className="mt-6 max-w-[62ch] text-sm leading-relaxed text-[var(--muted)]">
          No cal escriure els accents ni els articles: «ametlla» troba l&apos;Ametlla
          del Vallès i «mollo», Molló. Les platges porten a la pàgina del mar i les
          estacions, a la seva fitxa.
        </p>
      )}
    </article>
  );
}
