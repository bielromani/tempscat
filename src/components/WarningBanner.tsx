import type { Warning, WarningLevel } from '@/lib/weather';

/**
 * Franja de avisos meteorológicos oficiales.
 *
 * Reglas que no se negocian, porque un aviso mal presentado no es un fallo de
 * diseño sino un riesgo de seguridad:
 *
 *  · Se muestran los colores oficiales CAP, no una paleta propia. El usuario ya
 *    los reconoce y cambiarlos le haría dudar del nivel.
 *  · Nunca se reescribe el texto ni se ajusta el nivel.
 *  · Siempre se dice quién lo emite y cuándo, con enlace al original.
 *  · Los avisos verdes no llegan hasta aquí: verde significa "sin aviso", y
 *    ocupar la franja con eso restaría fuerza a los que sí importan.
 */

const LEVEL_STYLE: Record<WarningLevel, { bg: string; ink: string; label: string }> = {
  verd: { bg: 'var(--cap-green)', ink: 'oklch(20% 0.02 150)', label: 'Verd' },
  groc: { bg: 'var(--cap-yellow)', ink: 'oklch(22% 0.04 95)', label: 'Groc' },
  taronja: { bg: 'var(--cap-orange)', ink: 'oklch(20% 0.04 55)', label: 'Taronja' },
  vermell: { bg: 'var(--cap-red)', ink: 'oklch(98% 0.01 27)', label: 'Vermell' },
};

function when(onset: string, expires: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('ca-ES', {
      timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  return `${fmt(onset)} → ${fmt(expires)}`;
}

export function WarningBanner({ warnings }: { warnings: Warning[] }) {
  if (!warnings.length) return null;

  return (
    <section aria-label="Avisos meteorològics oficials" className="mb-5 flex flex-col gap-2">
      {warnings.map((w) => {
        const style = LEVEL_STYLE[w.level];
        return (
          <div
            key={w.id}
            className="rounded-lg px-4 py-3"
            style={{ background: style.bg, color: style.ink }}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                style={{ background: style.ink, color: style.bg }}
              >
                Avís {style.label}
              </span>
              <strong className="text-[15px] font-semibold">{w.event.replace(/^Aviso de /i, '')}</strong>
              {w.threshold && <span className="text-sm opacity-90">{w.threshold}</span>}
            </div>

            {w.description && (
              <p className="mt-1.5 text-sm leading-snug opacity-95">{w.description}</p>
            )}

            <p className="tnum mt-1.5 text-xs opacity-80">
              {when(w.onset, w.expires)}
              {w.probability && ` · probabilitat ${w.probability}`}
            </p>

            {w.instruction && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium opacity-90">
                  Recomanacions
                </summary>
                <p className="mt-1 text-xs leading-snug opacity-90">{w.instruction}</p>
              </details>
            )}

            <p className="mt-2 text-[11px] opacity-75">
              Avís oficial de l&apos;<strong className="font-semibold">Agència Estatal de Meteorologia</strong>.{' '}
              <a href={w.web} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                Consulta&apos;l a AEMET
              </a>
            </p>
          </div>
        );
      })}
    </section>
  );
}
