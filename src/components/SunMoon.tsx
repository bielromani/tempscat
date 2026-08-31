import { moonEmoji } from '@/lib/astronomy';
import type { Astronomy } from '@/lib/weather';

/**
 * Sol y luna del día.
 *
 * Nada de esto se pide a ninguna API: se calcula en `src/lib/astronomy.ts`. Por
 * eso podemos dar crepúsculos, mediodía solar, cuánto alarga el día respecto a
 * ayer y la fase lunar — datos que ninguna API meteorológica ofrece y que a la
 * competencia le faltan.
 */

const fmt = (d: Date | null) =>
  d ? d.toLocaleTimeString('ca-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) : '—';

function duration(minutes: number | null): string {
  if (minutes == null) return '—';
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Arco solar: un dibujo diminuto que sitúa el momento del día de un vistazo. */
function SunArc({ astro }: { astro: Astronomy }) {
  if (!astro.sunrise || !astro.sunset) return null;

  const rise = astro.sunrise.getTime();
  const set = astro.sunset.getTime();
  const now = Date.now();
  const t = Math.max(0, Math.min(1, (now - rise) / (set - rise)));

  const W = 200, H = 62, PAD = 12;
  const x = PAD + t * (W - 2 * PAD);
  // Semicírculo: el sol sube y baja siguiendo el arco.
  const y = H - 8 - Math.sin(t * Math.PI) * (H - 24);
  const isUp = now >= rise && now <= set;

  const arc = Array.from({ length: 41 }, (_, i) => {
    const k = i / 40;
    const px = PAD + k * (W - 2 * PAD);
    const py = H - 8 - Math.sin(k * Math.PI) * (H - 24);
    return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img"
      aria-label={`El sol surt a les ${fmt(astro.sunrise)} i es pon a les ${fmt(astro.sunset)}`}>
      <line x1={0} y1={H - 8} x2={W} y2={H - 8} stroke="var(--line)" strokeWidth={1} />
      <path d={arc} fill="none" stroke="var(--line)" strokeWidth={1.5} strokeDasharray="3 3" />
      {isUp && (
        <>
          <circle cx={x} cy={y} r={5} fill="oklch(78% 0.15 75)" />
          <circle cx={x} cy={y} r={9} fill="oklch(78% 0.15 75)" opacity={0.22} />
        </>
      )}
      <text x={PAD} y={H - 1} fontSize={9} fill="var(--muted)" textAnchor="middle" className="tnum">
        {fmt(astro.sunrise)}
      </text>
      <text x={W - PAD} y={H - 1} fontSize={9} fill="var(--muted)" textAnchor="middle" className="tnum">
        {fmt(astro.sunset)}
      </text>
    </svg>
  );
}

/** Disco lunar con la fracción iluminada real, no un emoji escalado. */
function MoonDisc({ illumination, waxing, size = 44 }: { illumination: number; waxing: boolean; size?: number }) {
  const r = size / 2 - 2;
  const c = size / 2;
  // El terminador es una elipse cuyo semieje horizontal depende de la fase.
  const k = Math.abs(1 - 2 * illumination);
  const sweepOuter = waxing ? 1 : 0;
  const sweepInner = illumination > 0.5 ? (waxing ? 1 : 0) : (waxing ? 0 : 1);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`Lluna il·luminada al ${(illumination * 100).toFixed(0)} %`}>
      <circle cx={c} cy={c} r={r} fill="var(--surface-2)" stroke="var(--line)" strokeWidth={1} />
      {illumination > 0.01 && (
        <path
          d={`M ${c} ${c - r} A ${r} ${r} 0 0 ${sweepOuter} ${c} ${c + r} A ${r * k} ${r} 0 0 ${sweepInner} ${c} ${c - r} Z`}
          fill="oklch(88% 0.04 250)"
        />
      )}
    </svg>
  );
}

export function SunMoon({ astro }: { astro: Astronomy }) {
  const delta = astro.daylightDeltaMinutes;

  return (
    <section className="grid gap-4 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-5 sm:grid-cols-2">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Sol</h3>
        <SunArc astro={astro} />
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-[var(--muted)]">Alba civil</dt>
          <dd className="tnum text-right text-[var(--ink)]">{fmt(astro.dawn)}</dd>
          <dt className="text-[var(--muted)]">Migdia solar</dt>
          <dd className="tnum text-right text-[var(--ink)]">{fmt(astro.solarNoon)}</dd>
          <dt className="text-[var(--muted)]">Crepuscle civil</dt>
          <dd className="tnum text-right text-[var(--ink)]">{fmt(astro.dusk)}</dd>
          <dt className="text-[var(--muted)]">Durada del dia</dt>
          <dd className="tnum text-right text-[var(--ink)]">{duration(astro.daylightMinutes)}</dd>
        </dl>
        {delta != null && delta !== 0 && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            {delta > 0 ? 'Avui el dia allarga' : 'Avui el dia escurça'}{' '}
            <strong className="font-medium text-[var(--ink-2)]">
              {Math.abs(delta)} {Math.abs(delta) === 1 ? 'minut' : 'minuts'}
            </strong>{' '}
            respecte d&apos;ahir.
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Lluna</h3>
        <div className="flex items-center gap-3">
          <MoonDisc illumination={astro.moon.illumination} waxing={astro.moon.phase < 0.5} />
          <div>
            <p className="font-medium text-[var(--ink)]">{astro.moon.name}</p>
            <p className="tnum text-sm text-[var(--muted)]">
              {(astro.moon.illumination * 100).toFixed(0)} % il·luminada · {astro.moon.age.toFixed(0)} dies
            </p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-[var(--muted)]">{moonEmoji(0)} Propera nova</dt>
          <dd className="tnum text-right text-[var(--ink)]">
            {astro.nextNewMoon.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })}
          </dd>
          <dt className="text-[var(--muted)]">{moonEmoji(0.5)} Propera plena</dt>
          <dd className="tnum text-right text-[var(--ink)]">
            {astro.nextFullMoon.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })}
          </dd>
        </dl>
      </div>
    </section>
  );
}
