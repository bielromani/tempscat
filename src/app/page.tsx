import Link from 'next/link';
import { allComarques, buildSummary } from '@/lib/territory';

export const revalidate = 3600;

export default function Home() {
  const comarques = allComarques();
  const summary = buildSummary() as {
    published: number;
    indexablePages: number;
    byLevel: Record<string, { total: number; published: number }>;
    stations: { total: number; operatives: number };
  };

  return (
    <div>
      <header className="mb-10 max-w-[62ch]">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          El temps a Catalunya, poble a poble
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-[var(--ink-2)]">
          Predicció i observació real per a{' '}
          <strong className="font-semibold text-[var(--ink)]">
            {summary.published.toLocaleString('ca-ES')} llocs
          </strong>{' '}
          — no només els 947 municipis, sinó també els nuclis i les entitats de
          població que la resta de webs ignoren. Cada punt amb la seva altitud
          real i l&apos;estació automàtica que li correspon.
        </p>
      </header>

      <section className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[var(--line-soft)] sm:grid-cols-4">
        {[
          { v: comarques.length, k: 'comarques' },
          { v: summary.byLevel.municipi.published, k: 'municipis' },
          { v: summary.byLevel.entitat_singular.published + summary.byLevel.nucli.published, k: 'nuclis i entitats' },
          { v: summary.stations.operatives, k: 'estacions XEMA' },
        ].map((s) => (
          <div key={s.k} className="bg-[var(--surface)] p-4">
            <p className="tnum text-2xl font-semibold tracking-tight text-[var(--accent)]">
              {s.v.toLocaleString('ca-ES')}
            </p>
            <p className="text-xs text-[var(--muted)]">{s.k}</p>
          </div>
        ))}
      </section>

      <h2 className="mb-3 text-lg font-semibold tracking-tight">Comarques</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {comarques.map((c) => (
          <li key={c.codi}>
            <Link
              href={c.path}
              className="flex items-baseline justify-between gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2 no-underline hover:border-[var(--accent)]"
            >
              <span className="text-[var(--ink)]">{c.nom}</span>
              <span className="tnum shrink-0 text-xs text-[var(--muted)]">
                {c.nMunicipis} mun.
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
