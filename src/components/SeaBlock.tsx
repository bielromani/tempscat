import Link from 'next/link';
import { windCardinal } from '@/lib/variables';
import { ago, hour, num } from '@/lib/format';
import {
  douglas, flagReasonText, flagStyle, parseJellyfish, FLAG_CURRENT_HOURS, FLAG_SHOW_HOURS,
  type SeaNearby,
} from '@/lib/sea';
import { FlagMark, JellyfishMark } from '@/components/SeaMarks';

/**
 * El mar de un pueblo con playa.
 *
 * Dos bloques y la diferencia entre ellos escrita: arriba lo que ha visto un
 * socorrista, abajo lo que dice un modelo.
 *
 * ## La regla de la bandera
 *
 * Una bandera **caduca**, y aquí está toda la responsabilidad de este componente.
 * Por debajo de tres horas se presenta como vigente; hasta doce, como «l'últim
 * parte» con la hora delante y sin el color a toda pastilla; más allá no se
 * enseña. Nadie debe meterse al agua por una verde de anteayer.
 */
export function SeaBlock({ sea, nom }: { sea: SeaNearby; nom: string }) {
  const shown = sea.beaches.filter((b) => b.ageHours <= FLAG_SHOW_HOURS);
  const { now } = sea;

  return (
    <section>
      {shown.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((b) => {
            const style = flagStyle(b.flag);
            const current = b.ageHours <= FLAG_CURRENT_HOURS;
            const jellies = parseJellyfish(b.jellyfish);
            return (
              <li
                key={b.code}
                className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="font-medium text-[var(--ink)]">{b.name}</span>
                  {/* Una bandera vella s'ensenya apagada: el color a tota
                      intensitat diu «ara mateix» i no ho és. */}
                  <span
                    className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--ink-2)]"
                    style={{ opacity: current ? 1 : 0.55 }}
                  >
                    <FlagMark flag={b.flag} size={20} />
                    {style.label}
                  </span>
                </div>

                <p className="mt-1 text-sm text-[var(--ink-2)]">
                  {style.meaning}
                  {flagReasonText(b.flagReason) && <span className="text-[var(--muted)]"> · {flagReasonText(b.flagReason)}</span>}
                </p>

                <p className="mt-1.5 text-xs text-[var(--muted)]">
                  {[
                    b.seaState && `mar ${b.seaState}`,
                    b.temperature && `aigua ${b.temperature} °C`,
                    b.transparency && `aigua ${b.transparency}`,
                  ].filter(Boolean).join(' · ')}
                </p>

                {jellies.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {jellies.map((j) => (
                      <JellyfishMark key={j.species} species={j.species} amount={j.amount} size={j.size} />
                    ))}
                  </div>
                )}

                <p className="mt-2 text-[11px] text-[var(--muted)]">
                  {current
                    ? `Parte de ${hour(local(b.at))}, ${ago(b.ageHours * 60)}`
                    : `Últim parte: ${hour(local(b.at))}, ${ago(b.ageHours * 60)}`}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4 text-sm text-[var(--ink-2)]">
          Cap platja {nom.startsWith('l\'') ? 'd\'' : 'de '}{nom} té parte de les últimes
          dotze hores. Les posen els socorristes quan són de servei, i fora
          d&apos;horari o de temporada no se&apos;n publica cap de nova.
        </p>
      )}

      {now && (
        <div className="mt-3 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            El mar, segons el model
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {now.sst != null && (
              <div>
                <dt className="text-xs text-[var(--muted)]">Aigua</dt>
                <dd className="tnum font-medium text-[var(--ink)]">{num(now.sst, 1)} °C</dd>
              </div>
            )}
            {now.waveHeight != null && (
              <div>
                <dt className="text-xs text-[var(--muted)]">Onada</dt>
                <dd className="tnum font-medium text-[var(--ink)]">
                  {num(now.waveHeight, 2)} m
                  <span className="ml-1 text-[11px] font-normal text-[var(--muted)]">
                    {douglas(now.waveHeight)}
                  </span>
                </dd>
              </div>
            )}
            {now.wavePeriod != null && (
              <div>
                <dt className="text-xs text-[var(--muted)]">Període</dt>
                <dd className="tnum font-medium text-[var(--ink)]">{num(now.wavePeriod, 1)} s</dd>
              </div>
            )}
            {now.waveDirection != null && (
              <div>
                <dt className="text-xs text-[var(--muted)]">Direcció</dt>
                <dd className="font-medium text-[var(--ink)]">{windCardinal(now.waveDirection)}</dd>
              </div>
            )}
          </dl>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
            Punt de mar davant {now.near}, a {num(now.distKm, 0)} km. És un model
            d&apos;onatge en mar obert: no recull les corrents de ressaca ni el que
            passa dins d&apos;una cala.
          </p>
        </div>
      )}

      <p className="mt-3 max-w-[65ch] text-xs leading-relaxed text-[var(--muted)]">
        {sea.source}. La bandera la posa un socorrista mirant l&apos;aigua; l&apos;onatge
        del model cobreix les hores i els trams on no n&apos;hi ha.{' '}
        <Link href="/mar" className="text-[var(--ink-2)] no-underline hover:underline">
          Totes les platges ›
        </Link>
      </p>
    </section>
  );
}

/** El parte viene en UTC; se enseña en hora de aquí. */
function local(iso: string): string {
  return new Date(iso)
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .replace(' ', 'T')
    .slice(0, 16);
}
