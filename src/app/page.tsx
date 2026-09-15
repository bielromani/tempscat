import Link from 'next/link';
import { SECTIONS } from '@/lib/nav';
import { allComarques, buildSummary } from '@/lib/territory';
import { rankings } from '@/lib/rankings';
import { activeWarnings, groupWarnings } from '@/lib/weather';
import { phenomenonName } from '@/lib/warning-labels';
import { ago, num } from '@/lib/format';

/*
 * Deu minuts, i no una hora.
 *
 * La portada ha passat de ser un índex a contestar quin temps fa, i els
 * extrems d'ara mateix envelleixen com l'observació que els dona: amb una hora,
 * la xifra de «el més càlid» podria ser de fa seixanta minuts amb el rètol
 * dient que és d'ara. El que no envelleix —les seccions, les comarques— no
 * costa res de tornar a escriure.
 */
export const revalidate = 600;

export default async function Home() {
  const [rank, warnings] = await Promise.all([rankings(), activeWarnings()]);
  const comarques = allComarques();
  const summary = buildSummary() as {
    published: number;
    indexablePages: number;
    byLevel: Record<string, { total: number; published: number }>;
    stations: { total: number; operatives: number };
  };

  return (
    <div>
      <header className="page-head">
        <h1 className="page-title">
          El temps a Catalunya, poble a poble
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-[var(--ink-2)]">
          Predicció i observació real per a{' '}
          <strong className="font-semibold text-[var(--ink)]">
            {summary.published.toLocaleString('ca-ES')} llocs
          </strong>{' '}
          — no només els 947 municipis, sinó també els nuclis i les entitats
          de població. Cada punt amb la seva altitud
          real i l&apos;estació automàtica que li correspon.
        </p>
      </header>

      {/*
        ── Què fa ara mateix ──────────────────────────────────────────────────

        La portada d'un web del temps ha de dir quin temps fa, i aquesta no en
        deia cap: era un índex de seccions amb quatre comptadors de quantes
        pàgines hi ha. Els números de sota segueixen sent certs i no són el que
        ve a buscar ningú.

        Tot el que hi ha aquí surt de dades que ja hi eren —`rankings()` ja
        s'havia baixat l'observació sencera per a `/ranquings`— així que no hi
        ha ni una lectura nova ni una unitat de quota.

        Cada extrem porta **el seu lloc** i és un enllaç: la pregunta següent de
        qui llegeix «el més càlid, 32,1°» és «on», i la resposta és una
        pàgina.
      */}
      {rank && (
        <section className="card mb-8" aria-label="El temps ara mateix a Catalunya">
          <h2 className="card-title">Ara mateix a Catalunya</h2>
          <ul className="mt-3 grid list-none grid-cols-2 gap-x-6 gap-y-3.5 p-0">
            {([
              ['El més càlid', rank.stations.nowWarmest[0], (v: number) => `${num(v, 1)} °C`],
              ['El més fred', rank.stations.nowColdest[0], (v: number) => `${num(v, 1)} °C`],
              ['Més pluja avui', rank.stations.rain[0], (v: number) => `${num(v, 1)} mm`],
              /*
               * La ratxa ja ve en km/h.
               *
               * `rankings()` la converteix quan la desa —`describe(s, Math.round(msToKmh(v)))`—
               * i tornar-la a convertir aquí la multiplicava per 3,6 una segona
               * vegada: el Monestir de Montserrat sortia a **180 km/h** una
               * tarda de 37 °C. Ni un error, i un número que es pot llegir.
               */
              ['Ratxa més forta', rank.stations.gust[0], (v: number) => `${v.toFixed(0)} km/h`],
            ] as const).map(([label, row, fmt]) => {
              /* Una fila sense estació no s'escriu: un guió al costat d'una
                 etiqueta és una manera de dir que no ho sabem que ocupa el
                 mateix que dir-ho. */
              if (!row) return null;
              const name = row.placeNom ?? row.nom;
              return (
                /* L'etiqueta a dalt i la xifra a sota, i no als dos costats
                   d'una mateixa línia: amb «Ratxa més forta» i «Monestir de
                   Montserrat» a banda i banda, les dues es partien i la fila
                   ocupava quatre línies per dir una cosa. */
                <li key={label}>
                  <p className="text-[12px] text-[var(--muted)]">{label}</p>
                  <p className="tnum mt-0.5">
                    <strong className="text-[17px] font-semibold text-[var(--ink)]">{fmt(row.value)}</strong>{' '}
                    {row.path ? (
                      <Link href={row.path} className="text-sm text-[var(--ink-2)]">{name}</Link>
                    ) : (
                      <span className="text-sm text-[var(--ink-2)]">{name}</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="source">
            {rank.stations.total} estacions de la {rank.source}
            {rank.ageMin != null && ` · ${ago(rank.ageMin)}`}. La pluja i la ratxa són d&apos;avui
            des de mitjanit; la temperatura, de l&apos;última lectura.{' '}
            <Link href="/ranquings">Totes les llistes</Link>.
          </p>
        </section>
      )}

      {/*
        Els avisos, i només quan n'hi ha.

        Una franja que digui «cap avís» cada dia és una franja que ningú no
        llegeix el dia que en digui un.
      */}
      {(() => {
        const groups = groupWarnings(warnings);
        const worst = groups[0];
        if (!worst) return null;
        return (
          <section className="card mb-8" aria-label="Avisos oficials vigents">
            <h2 className="card-title">Avisos oficials</h2>
            <p className="mt-2 leading-relaxed text-[var(--ink-2)]">
              Hi ha <strong className="font-semibold text-[var(--ink)]">
                {groups.length} {groups.length === 1 ? 'avís' : 'avisos'}
              </strong>{' '}
              en vigor. El més alt és de nivell{' '}
              <strong className="font-semibold text-[var(--ink)]">{worst.level}</strong>, per{' '}
              {phenomenonName(worst.phenomenon).toLowerCase()}.{' '}
              <Link href="/avisos">Consulteu-los tots</Link>.
            </p>
            <p className="source">Agència Estatal de Meteorologia · avisos oficials.</p>
          </section>
        );
      })()}

      {/* Els números del territori. Segueixen sent certs; el que canvia és
          que ja no són el primer que es veu. */}
      <section className="card mb-10">
        <h2 className="card-title">Què hi ha cobert</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {[
            { v: comarques.length, k: 'comarques' },
            { v: summary.byLevel.municipi.published, k: 'municipis' },
            { v: summary.byLevel.entitat_singular.published + summary.byLevel.nucli.published, k: 'nuclis i entitats' },
            { v: summary.stations.operatives, k: 'estacions XEMA' },
          ].map((s) => (
            <div key={s.k}>
              <dd className="tnum text-2xl font-semibold tracking-tight text-[var(--ink)]">
                {s.v.toLocaleString('ca-ES')}
              </dd>
              <dt className="text-xs text-[var(--muted)]">{s.k}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/*
        * Totes les seccions, explicades.
        *
        * Abans n'hi havia dues aquí i quinze amagades a la barra de dalt.
        * Havent tret la barra, la portada és qui ha d'ensenyar què hi ha —i
        * ensenyar-ho amb una frase de què hi trobaràs, no amb una paraula
        * solta, que és el que fa que ningú entri a «Bolets» sense saber què
        * és.
        *
        * La llista surt de `src/lib/nav.ts`, la mateixa que fa servir el peu.
        */}
      {SECTIONS.map((g) => (
        <section key={g.title} className="mb-8">
          <h2 className="card-title mb-3">{g.title}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {g.links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="block h-full card no-underline hover:border-[var(--accent)]"
                >
                  <p className="font-semibold text-[var(--ink)]">{l.label}</p>
                  {l.blurb && <p className="mt-1 text-sm text-[var(--muted)]">{l.blurb}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h2 className="card-title mb-3">Comarques</h2>
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
