import { flagStyle, speciesInfo, STING_STYLE, type StingLevel } from '@/lib/sea';

/**
 * Els dos símbols del mar: la bandera i la medusa.
 *
 * ## Per què una bandera dibuixada i no una etiqueta
 *
 * Perquè és una bandera. Qui va a la platja no llegeix «Verda» en una capsa de
 * color verd: reconeix la forma abans que el text, i és el mateix objecte que
 * té clavat a la sorra a cinquanta metres.
 *
 * El color per si sol no n'hi hauria prou —hi ha qui no distingeix el verd del
 * vermell—, així que el text hi va al costat i no dins.
 */
export function FlagMark({ flag, size = 22 }: { flag: string; size?: number }) {
  const style = flagStyle(flag);
  const unknown = flag === 'sense informacio' || flag === 'complet';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={`Bandera ${style.label.toLowerCase()}`}
      className="shrink-0"
    >
      <title>{`Bandera ${style.label.toLowerCase()}: ${style.meaning.toLowerCase()}`}</title>
      {/* El pal, sempre igual: és el que fa que es llegeixi com una bandera. */}
      <line x1="4.5" y1="2" x2="4.5" y2="22" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinecap="round" />
      {unknown ? (
        <path
          d="M5.5 3.5 H20 V13 H5.5 Z"
          fill="none"
          stroke="var(--line)"
          strokeWidth="1.4"
          strokeDasharray="2.5 2"
        />
      ) : (
        <path d="M5.5 3.5 H20 V13 H5.5 Z" fill={style.color} stroke="var(--surface)" strokeWidth="0.8" />
      )}
    </svg>
  );
}

/**
 * Una medusa amb el que cal saber-ne: el nom que fa servir la gent i si pica.
 *
 * El registre només anota el nom científic. «Cotylorhiza tuberculata» no diu
 * res, i «Physalia physalis» —que és la que de debò importa— tampoc.
 */
export function JellyfishMark({
  species, amount, size,
}: { species: string; amount?: string; size?: string }) {
  const info = speciesInfo(species);
  const sting = STING_STYLE[info.sting];

  return (
    <div className="flex items-start gap-2">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden className="mt-0.5 shrink-0">
        {/* Campana i tentacles: prou per reconèixer-la a mida d'icona. */}
        <path d="M3.5 12a8.5 7 0 0 1 17 0Z" fill={sting.color} opacity="0.85" />
        <path
          d="M6.5 12c0 3-1 4-1 6M10 12c0 3.5-.6 5-.6 7M14 12c0 3.5.6 5 .6 7M17.5 12c0 3 1 4 1 6"
          fill="none" stroke={sting.color} strokeWidth="1.3" strokeLinecap="round" opacity="0.7"
        />
      </svg>
      <p className="text-xs leading-snug">
        <span className="italic text-[var(--ink-2)]">{species}</span>
        {info.common && <span className="text-[var(--ink-2)]">, {info.common}</span>}
        <span className="font-medium" style={{ color: sting.color }}> · {sting.label}</span>
        {(amount || size) && (
          <span className="text-[var(--muted)]">
            {' '}({[amount, size && `${size} cm`].filter(Boolean).join(', ')})
          </span>
        )}
        {info.note && <span className="block text-[var(--muted)]">{info.note}</span>}
      </p>
    </div>
  );
}

/** La llegenda de les banderes, per a qui no se les sap. */
export function FlagLegend({ flags }: { flags: string[] }) {
  const seen = [...new Set(flags)];
  if (!seen.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2">
      {seen.map((f) => (
        <li key={f} className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          <FlagMark flag={f} size={18} />
          {flagStyle(f).meaning}
        </li>
      ))}
    </ul>
  );
}

export type { StingLevel };
