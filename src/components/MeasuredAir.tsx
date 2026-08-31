import Link from 'next/link';
import { dateShort, num } from '@/lib/format';
import { stationKind, type NearestAirStation } from '@/lib/air-stations';

/**
 * La medida real, al lado del modelo.
 *
 * Va justo debajo del bloque de CAMS y su trabajo es marcar la diferencia, no
 * disimularla: arriba hay un índice modelado de ahora mismo en una celda de 11
 * km; aquí hay un aparato con nombre y sitio que dice qué midió **ayer**.
 *
 * Es el mismo argumento que el sitio ya usa con la XEMA frente a la predicción, y
 * la razón por la que se publica aunque llegue con veinte horas de retraso: una
 * medida vieja y verdadera vale más que ninguna, siempre que se diga que es vieja.
 */
export function MeasuredAir({ station }: { station: NearestAirStation }) {
  const shown = station.measurements
    .filter((m) => m.dailyMean != null)
    .slice(0, 6);

  if (!shown.length) return null;

  return (
    <div className="mt-3 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
          Mesurat de veritat, el {dateShort(station.day)}
        </p>
        <p className="text-xs text-[var(--muted)]">
          {station.name} · a <span className="tnum">{num(station.distKm, 0)} km</span>
          {stationKind(station) && ` · estació ${stationKind(station)}`}
        </p>
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2 text-sm sm:grid-cols-6">
        {shown.map((m) => (
          <div key={m.slug}>
            <dt className="text-xs text-[var(--muted)]" title={m.nom}>
              {m.slug === 'pm2_5' ? 'PM2,5' : m.slug.toUpperCase()}
            </dt>
            <dd className="tnum font-medium text-[var(--ink)]">
              {num(m.dailyMean, 1)}
              <span className="ml-1 text-[11px] font-normal text-[var(--muted)]">{m.unit}</span>
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
        Mitjanes de tot el dia a l&apos;estació, no lectures d&apos;ara: el registre
        de la XVPCA s&apos;actualitza un cop al dia i porta unes vint hores de
        retard. L&apos;índex de dalt és d&apos;un model i sí que va al dia.{' '}
        <Link href="/aire" className="text-[var(--ink-2)] no-underline hover:underline">
          Totes les estacions ›
        </Link>
      </p>
    </div>
  );
}
