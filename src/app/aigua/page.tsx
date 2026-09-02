import type { Metadata } from 'next';
import Link from 'next/link';
import { dateFull, hour, int, num, signed } from '@/lib/format';
import { droughtLevel, droughtSummary, gaugeName, reservoirColor, reservoirs, riverGauges } from '@/lib/water';

/**
 * Los embalses, los ríos y la sequía.
 *
 * «Com està el pantà de Sau» es de las preguntas que más se hacen en Catalunya y
 * la respuesta vive hoy en un visor incómodo. Aquí son nueve barras y una cifra.
 *
 * Dos honestidades que van arriba y no en letra pequeña:
 *
 *  · **Solo las conques internes.** El Segre y el Ebro son de la Confederación
 *    Hidrográfica del Ebro. Un lector de Lleida no encontrará su embalse, y es
 *    mejor decírselo que dejar el hueco.
 *  · **El registro de sequía no es un dato en vivo.** Anota cambios de estado, y
 *    el último es de mayo de 2025. Se publica con esa fecha siempre al lado.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Els embassaments i els rius de Catalunya',
  description:
    'Com estan els embassaments de les conques internes: percentatge de volum, '
    + 'tendència del mes i cabal dels rius, amb dades de l\'Agència Catalana de l\'Aigua.',
  alternates: { canonical: '/aigua' },
};

export default async function AiguaPage() {
  const res = await reservoirs();
  const rivers = (await riverGauges()).filter((r) => r.flow != null);
  const drought = await droughtSummary();

  if (!res?.list.length) {
    return (
      <article>
        <h1 className="text-3xl font-semibold tracking-tight">Aigua</h1>
        <p className="mt-4 text-[var(--muted)]">
          Encara no hi ha dades descarregades. Apareixen quan el worker de
          l&apos;aigua hagi corregut per primera vegada.
        </p>
      </article>
    );
  }

  const total = res.list.reduce((a, r) => a + (r.volumeHm3 ?? 0), 0);
  const withPct = res.list.filter((r) => r.pct != null);
  // Media ponderada por volumen: la media simple daría el mismo peso a Foix, que
  // tiene 1,8 hm³, que a Susqueda, que tiene 192. Es la cifra que se publica como
  // «les conques internes estan al X %».
  const capacity = withPct.reduce((a, r) => a + (r.volumeHm3 ?? 0) / ((r.pct ?? 1) / 100), 0);
  const overall = capacity > 0 ? (total / capacity) * 100 : null;

  const byBasin = new Map<string, typeof rivers>();
  for (const r of rivers) {
    const arr = byBasin.get(r.basin) ?? [];
    arr.push(r);
    byBasin.set(r.basin, arr);
  }

  const abnormal = drought
    ? Object.entries(drought.counts).filter(([state]) => state !== 'NORMALITAT')
    : [];

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Aigua</span>
      </nav>

      <header className="mb-6 max-w-[64ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Com estan els embassaments
        </h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
          {overall != null && (
            <>
              Les conques internes estan al{' '}
              <strong className="tnum font-semibold text-[var(--ink)]">{num(overall, 1)} %</strong>
              , amb {num(total, 1)} hm³ embassats.{' '}
            </>
          )}
          Dada de {res.at ? `${dateFull(res.at)}, a les ${hour(res.at)}` : 'avui'}.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Aquests nou embassaments són els de les <strong className="font-medium text-[var(--ink-2)]">conques
          internes</strong>, que gestiona l&apos;Agència Catalana de l&apos;Aigua. Els
          del Segre i l&apos;Ebre —Rialb, Oliana, Mequinensa, Riba-roja— són de la
          Confederació Hidrogràfica de l&apos;Ebre i no surten aquí.
        </p>
      </header>

      <ul className="space-y-2">
        {res.list.map((r) => {
          const trend = r.pct != null && r.pct30d != null ? r.pct - r.pct30d : null;
          return (
            <li
              key={r.code}
              className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-medium text-[var(--ink)]">{r.name}</span>
                <span className="flex items-baseline gap-3">
                  <span className="tnum text-2xl font-semibold text-[var(--ink)]">
                    {num(r.pct, 1)} %
                  </span>
                  {trend != null && Math.abs(trend) >= 0.1 && (
                    <span
                      className="tnum text-xs"
                      style={{ color: trend < 0 ? 'var(--bad)' : 'var(--good)' }}
                      title="Diferència respecte de fa 30 dies"
                    >
                      {signed(trend, 1)} punts en 30 dies
                    </span>
                  )}
                </span>
              </div>

              {/* La barra es la lectura rápida; la cifra, la exacta. */}
              <div
                className="mt-2 h-3 overflow-hidden rounded-full"
                style={{ background: 'var(--surface-2)' }}
                role="img"
                aria-label={`${num(r.pct, 1)} % de volum embassat`}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(1, Math.min(100, r.pct ?? 0))}%`,
                    background: reservoirColor(r.pct ?? 0),
                  }}
                />
              </div>

              <p className="mt-1.5 text-xs text-[var(--muted)]">
                <span className="tnum">{num(r.volumeHm3, 1)} hm³</span>
                {r.basin && ` · conca ${r.basin}`}
                {r.levelM != null && <> · <span className="tnum">{num(r.levelM, 1)} m</span> sobre el nivell del mar</>}
              </p>
            </li>
          );
        })}
      </ul>

      {/* ── Sequía ── */}
      {drought && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Estat de sequera</h2>
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
            {abnormal.length === 0 ? (
              <p className="text-[var(--ink)]">
                Els {int(Object.keys(drought.byMunicipality).length)} municipis del registre
                estan en <strong className="font-medium">normalitat</strong>.
              </p>
            ) : (
              <ul className="space-y-1">
                {abnormal.map(([state, n]) => {
                  const lv = droughtLevel(state);
                  return (
                    <li key={state} className="flex items-baseline gap-2 text-sm">
                      <span
                        className="rounded px-2 py-0.5 text-xs font-semibold"
                        style={{ background: lv.color, color: lv.ink }}
                      >
                        {lv.label}
                      </span>
                      <span className="text-[var(--ink-2)]">{n} municipis</span>
                    </li>
                  );
                })}
              </ul>
            )}

            {/*
              La advertencia va aquí y no al pie: sin ella, «normalitat» se lee
              como una lectura de hoy, y es un estado que no cambia hasta que hay
              un decreto nuevo.
            */}
            <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
              El registre de sequera anota <strong className="font-medium text-[var(--ink-2)]">canvis
              d&apos;estat</strong>, no lectures diàries, i l&apos;últim que hi consta és
              {drought.lastChange ? ` del ${dateFull(drought.lastChange)}` : ' antic'}. Que no
              hi hagi canvis vol dir que no s&apos;ha decretat res de nou — però no es pot
              distingir d&apos;un registre que hagi deixat d&apos;actualitzar-se. Per a
              decisions que depenguin de restriccions, la font és l&apos;ACA.
            </p>
          </div>
        </section>
      )}

      {/* ── Ríos ── */}
      {rivers.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Cabal dels rius</h2>
            <p className="text-xs text-[var(--muted)]">{rivers.length} aforaments amb dada</p>
          </div>

          {[...byBasin]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([basin, list]) => (
              <div key={basin} className="mb-4">
                <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {basin || 'Sense conca'}
                </h3>
                <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {list
                    .slice()
                    .sort((a, b) => (b.flow ?? 0) - (a.flow ?? 0))
                    .map((r) => (
                      <li
                        key={r.code}
                        className="flex items-baseline justify-between gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm text-[var(--ink-2)]">
                          {gaugeName(r.name)}
                        </span>
                        <span className="tnum shrink-0 text-sm font-medium text-[var(--ink)]">
                          {num(r.flow, 2)}
                          <span className="ml-1 text-xs font-normal text-[var(--muted)]">m³/s</span>
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
        </section>
      )}

      <p className="mt-8 max-w-[65ch] text-xs leading-relaxed text-[var(--muted)]">
        {res.source}. Els cabals són lectures de registre, sense validar, i els
        aforaments es veuen afectats per les preses de riu amunt: un cabal baix no
        vol dir sempre que plogui poc. Les coordenades originals són en UTM 31N i
        aquí surten convertides a graus.
      </p>
    </article>
  );
}
