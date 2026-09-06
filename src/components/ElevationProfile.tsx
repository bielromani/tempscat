import { int, num } from '@/lib/format';

/**
 * El perfil d'alçades d'un itinerari.
 *
 * ## Què és i què no
 *
 * És l'altura del terreny contra la distància recorreguda, mesurada del model
 * d'elevació de Copernicus **cada 150 metres**. No és el desnivell acumulat: a
 * 57 m de píxel, sumar les pujades d'aquest perfil dona un número curt sense
 * que es noti, i per això el desnivell que la fitxa publica segueix sortint
 * només d'OSM. El que sí que diu bé aquest dibuix és **on** es puja i on es
 * baixa, que és el que es mira abans de sortir.
 *
 * ## Per què hi ha una àrea i no una línia sola
 *
 * Perquè una línia a mitja alçada no diu si el que hi ha a sota és el nivell
 * del mar o 1.800 metres. L'eix comença a la cota mínima arrodonida cap avall,
 * i totes dues cotes van escrites: sense això, el mateix dibuix serviria per a
 * un passeig pel delta i per a una cresta del Pirineu.
 *
 * ## Cap línia de JavaScript
 *
 * Un `path` calculat al servidor. El `<title>` fa de globus i el text de sota
 * diu el mateix per a qui no hi passi el ratolí per sobre.
 */
export function ElevationProfile({
  profile, km,
}: {
  /** `[metres recorreguts, cota]`. */
  profile: Array<[number, number]>;
  km: number;
}) {
  const W = 1000;
  const H = 260;
  const PAD_L = 52;
  const PAD_B = 26;
  const PAD_T = 12;

  const dist = profile.map((p) => p[0]);
  const alts = profile.map((p) => p[1]);
  const maxD = Math.max(...dist) || 1;
  const lo = Math.min(...alts);
  const hi = Math.max(...alts);

  /*
   * L'eix vertical s'arrodoneix a centenes cap enfora i mai no és pla.
   *
   * Amb el mínim i el màxim justos, l'itinerari toca el sostre i el terra del
   * dibuix i sembla que se surti. I amb un itinerari pla —n'hi ha, al delta—
   * el rang seria zero i la divisió, infinit.
   */
  const y0 = Math.floor(lo / 100) * 100;
  const y1 = Math.max(y0 + 50, Math.ceil(hi / 100) * 100);

  const X = (m: number) => PAD_L + (m / maxD) * (W - PAD_L - 8);
  const Y = (a: number) => PAD_T + (1 - (a - y0) / (y1 - y0)) * (H - PAD_T - PAD_B);

  const line = profile.map(([m, a], i) => `${i ? 'L' : 'M'} ${X(m).toFixed(1)} ${Y(a).toFixed(1)}`).join(' ');
  const area = `${line} L ${X(maxD).toFixed(1)} ${Y(y0).toFixed(1)} L ${X(0).toFixed(1)} ${Y(y0).toFixed(1)} Z`;

  // Marques de l'eix: la cota de baix, la de dalt i una al mig si hi cap.
  const ticks = y1 - y0 >= 400 ? [y0, Math.round((y0 + y1) / 200) * 100, y1] : [y0, y1];
  const kmTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxD);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Perfil d'alçades: de ${int(lo)} a ${int(hi)} metres al llarg de ${num(km, 1)} quilòmetres`}
        className="block h-auto w-full"
      >
        <defs>
          <linearGradient id="epfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_L} y1={Y(t)} x2={W - 8} y2={Y(t)}
              stroke="var(--line-soft)" strokeWidth="1"
            />
            <text
              x={PAD_L - 8} y={Y(t)}
              textAnchor="end" dominantBaseline="central"
              fontSize="16" fill="var(--muted)"
            >
              {int(t)}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#epfill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <title>{`De ${int(lo)} a ${int(hi)} m al llarg de ${num(km, 1)} km`}</title>
        </path>

        {kmTicks.map((m) => (
          <text
            key={m}
            x={X(m)} y={H - 6}
            textAnchor={m === 0 ? 'start' : m === maxD ? 'end' : 'middle'}
            fontSize="16" fill="var(--muted)"
          >
            {num(m / 1000, m === 0 ? 0 : 1)}
            {m === maxD && ' km'}
          </text>
        ))}

        <text x={PAD_L - 8} y={PAD_T - 2} textAnchor="end" fontSize="13" fill="var(--muted)">m</text>
      </svg>

      <figcaption className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
        Cota mesurada cada 150 m del model d&apos;elevació de Copernicus, que té un
        píxel de 57 m. Diu bé <strong className="font-medium text-[var(--ink-2)]">on
        es puja</strong>; el desnivell acumulat no se&apos;n calcula, perquè a
        aquesta resolució sortiria curt sense que es notés.
      </figcaption>
    </figure>
  );
}
