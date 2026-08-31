import Link from 'next/link';
import { dateFull, deName, num, signed } from '@/lib/format';
import { droughtLevel, reservoirColor, type WaterNearby } from '@/lib/water';

/**
 * El agua cerca de este pueblo.
 *
 * Aparece solo cuando hay algo que decir: un aforo o un embalse a menos de 25 km,
 * o un estado de sequía distinto de normalidad. En un pueblo de la conca del
 * Segre no sale nada, y es correcto — esos datos son de la Confederación
 * Hidrográfica del Ebro y no los tenemos.
 *
 * El estado de sequía **normal no se muestra**: lo tienen 628 de los 630
 * municipios del registro, y una línea idéntica en todas las páginas deja de
 * leerse. Cuando cambia se ve, que es cuando importa.
 */
export function WaterBlock({ water, nom }: { water: WaterNearby; nom: string }) {
  const { reservoir, river, drought } = water;

  return (
    <section>
      {drought && (
        <div
          className="mb-3 rounded-lg p-4"
          style={{
            background: droughtLevel(drought.hydro).color,
            color: droughtLevel(drought.hydro).ink,
          }}
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ opacity: 0.8 }}>
            Estat de sequera
          </p>
          <p className="mt-0.5 text-lg font-semibold">{droughtLevel(drought.hydro).label}</p>
          <p className="mt-1 text-sm" style={{ opacity: 0.9 }}>
            {drought.unit} · declarat el {dateFull(drought.since)}
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {reservoir && (
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              L&apos;embassament més proper
            </p>
            <p className="mt-0.5 font-medium text-[var(--ink)]">{reservoir.name}</p>
            <p className="mt-2 flex items-baseline gap-3">
              <span className="tnum text-3xl font-semibold text-[var(--ink)]">
                {num(reservoir.pct, 1)} %
              </span>
              {reservoir.pct != null && reservoir.pct30d != null
                && Math.abs(reservoir.pct - reservoir.pct30d) >= 0.1 && (
                <span
                  className="tnum text-xs"
                  style={{ color: reservoir.pct < reservoir.pct30d ? 'var(--bad)' : 'var(--good)' }}
                >
                  {signed(reservoir.pct - reservoir.pct30d, 1)} en 30 dies
                </span>
              )}
            </p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(1, Math.min(100, reservoir.pct ?? 0))}%`,
                  background: reservoirColor(reservoir.pct ?? 0),
                }}
              />
            </div>
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              <span className="tnum">{num(reservoir.volumeHm3, 1)} hm³</span> ·{' '}
              a <span className="tnum">{num(reservoir.distKm, 0)} km</span>{' '}
              {deName(nom)}
            </p>
          </div>
        )}

        {river && (
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              L&apos;aforament més proper
            </p>
            <p className="mt-0.5 font-medium text-[var(--ink)]">
              {river.name.replace(/^Aforament - /, '')}
            </p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="tnum text-3xl font-semibold text-[var(--ink)]">
                {num(river.flow, 2)}
              </span>
              <span className="text-sm text-[var(--muted)]">m³/s</span>
            </p>
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              {river.subbasin || river.basin} · a{' '}
              <span className="tnum">{num(river.distKm, 0)} km</span>
              {river.levelM != null && <> · nivell <span className="tnum">{num(river.levelM, 2)} m</span></>}
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 max-w-[65ch] text-xs leading-relaxed text-[var(--muted)]">
        {water.source}. Són les estacions més properes dins de 25 km, no
        necessàriament el riu que passa pel poble: els aforaments estan on hi ha
        instrumentació, no on hi ha nuclis.
        {!water.droughtCovered && (
          <> Aquest municipi no surt al registre de sequera de l&apos;ACA, que només
            cobreix les conques internes.</>
        )}{' '}
        <Link href="/aigua" className="text-[var(--ink-2)] no-underline hover:underline">
          Tots els embassaments i rius ›
        </Link>
      </p>
    </section>
  );
}
