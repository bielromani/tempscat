import { msToKmh } from '@/lib/variables';
import { int, num } from '@/lib/format';
import type { WindRose as WindRoseData } from '@/lib/weather';

/**
 * Rosa de los vientos, SVG de servidor.
 *
 * ## Qué mide y qué no
 *
 * Se construye con la **dirección de la racha máxima de cada día**, no con la
 * dirección media diaria. La media vectorial de un día entero cancela el ciclo
 * diurno: en el litoral, marinada de tarde y terral de madrugada se anulan y la
 * media apunta a un sector donde casi nunca sopla. La racha del día es un evento
 * real con una dirección real.
 *
 * Así que esto contesta «d'on ve el vent fort aquí» —la pregunta que distingue la
 * tramuntana del mestral y la que explica los árboles inclinados— y **no**
 * contesta la frecuencia de las brisas suaves. La leyenda lo dice, porque una
 * rosa sin esa aclaración se lee como si fueran todas las horas del año.
 *
 * ## Por qué el radio va con la raíz de la frecuencia
 *
 * El área de un sector crece con el cuadrado del radio, así que un radio
 * proporcional a la frecuencia hace que un sector del 20 % ocupe cuatro veces
 * más superficie que uno del 10 %, no el doble. El ojo compara áreas. Con la
 * raíz, el área sí es proporcional al dato — es el mismo argumento por el que un
 * gráfico de burbujas se escala por área y no por diámetro.
 */

const SIZE = 260;
const CENTER = SIZE / 2;
const R = 96;

/** Aguja de un sector, como un sector circular de 22,5°. */
function wedge(deg: number, radius: number): string {
  const half = 11.25;
  const a0 = ((deg - half - 90) * Math.PI) / 180;
  const a1 = ((deg + half - 90) * Math.PI) / 180;
  const x0 = CENTER + Math.cos(a0) * radius;
  const y0 = CENTER + Math.sin(a0) * radius;
  const x1 = CENTER + Math.cos(a1) * radius;
  const y1 = CENTER + Math.sin(a1) * radius;
  return `M${CENTER},${CENTER} L${x0.toFixed(1)},${y0.toFixed(1)} `
    + `A${radius.toFixed(1)},${radius.toFixed(1)} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`;
}

/** Color por racha media del sector: más fuerte, más intenso. */
function gustColor(kmh: number | null): string {
  if (kmh == null) return 'var(--line)';
  const k = Math.min(1, Math.max(0, (kmh - 15) / 45));
  const l = 68 - k * 22;
  const c = 0.04 + k * 0.14;
  return `oklch(${l.toFixed(0)}% ${c.toFixed(3)} ${(250 - k * 40).toFixed(0)})`;
}

export function WindRose({ rose }: { rose: WindRoseData }) {
  const maxShare = Math.max(...rose.sectors.map((s) => s.share));
  if (maxShare <= 0) return null;

  // Círculos de referencia en fracciones redondas de la frecuencia máxima.
  const rings = [0.25, 0.5, 0.75, 1].map((k) => ({
    k,
    r: Math.sqrt(k) * R,
    label: `${(maxShare * k * 100).toFixed(0)} %`,
  }));

  const cardinals = [
    { deg: 0, label: 'N' }, { deg: 90, label: 'E' },
    { deg: 180, label: 'S' }, { deg: 270, label: 'O' },
  ];

  const describe = `Rosa dels vents: les ratxes vénen sobretot del ${rose.prevailing?.label ?? '—'}, `
    + `en ${((rose.prevailing?.share ?? 0) * 100).toFixed(0)} % dels ${int(rose.days)} dies de sèrie.`;

  return (
    <figure className="m-0 flex flex-wrap items-start gap-6">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE} height={SIZE}
        role="img" aria-label={describe}
        style={{ flexShrink: 0, maxWidth: '100%' }}
      >
        <title>{describe}</title>

        {rings.map((ring) => (
          <circle
            key={ring.k} cx={CENTER} cy={CENTER} r={ring.r}
            fill="none" stroke="var(--line)" strokeWidth={1} strokeDasharray="2 3"
          />
        ))}

        {/* Ejes cardinales por debajo de las agujas. */}
        {cardinals.map((c) => {
          const a = ((c.deg - 90) * Math.PI) / 180;
          return (
            <line
              key={`ax${c.deg}`}
              x1={CENTER} y1={CENTER}
              x2={CENTER + Math.cos(a) * R} y2={CENTER + Math.sin(a) * R}
              stroke="var(--line)" strokeWidth={1}
            />
          );
        })}

        {rose.sectors.map((s) => {
          if (s.share <= 0) return null;
          const radius = Math.sqrt(s.share / maxShare) * R;
          const kmh = s.gustMean != null ? msToKmh(s.gustMean) : null;
          /*
           * Una sola cadena, y no tres trozos.
           *
           * React trata `<title>` como un elemento especial y **solo lo
           * rellena si su único hijo es una cadena**. Con tres hijos el
           * servidor escribía `<title></title>` vacío y el cliente ponía el
           * texto, así que las 4.293 páginas llegaban con una discrepancia de
           * hidratación: React tiraba el árbol servido y lo volvía a
           * renderizar entero en el navegador — justo lo contrario de lo que
           * persigue este proyecto.
           *
           * No daba ningún error visible. Solo el tooltip vacío, que nadie
           * mira, y el árbol rehecho, que no se ve.
           */
          const tip = [
            `${s.label} · ${num(s.share * 100, 1)} % dels dies`,
            kmh != null ? `ratxa mitjana ${int(kmh)} km/h` : null,
            s.gustMax != null ? `màxima ${int(msToKmh(s.gustMax))} km/h` : null,
          ].filter(Boolean).join(' · ');
          return (
            <path
              key={s.deg}
              d={wedge(s.deg, radius)}
              fill={gustColor(kmh)}
              stroke="var(--surface)"
              strokeWidth={1}
            >
              <title>{tip}</title>
            </path>
          );
        })}

        {cardinals.map((c) => {
          const a = ((c.deg - 90) * Math.PI) / 180;
          const x = CENTER + Math.cos(a) * (R + 14);
          const y = CENTER + Math.sin(a) * (R + 14);
          return (
            <text
              key={c.label} x={x} y={y + 4} textAnchor="middle"
              fontSize={12} fontWeight={600} fill="var(--ink-2)"
            >{c.label}</text>
          );
        })}

        <text
          x={CENTER + 4} y={CENTER - rings[rings.length - 1].r + 12}
          fontSize={9} fill="var(--muted)" className="tnum"
        >{rings[rings.length - 1].label}</text>
      </svg>

      <figcaption className="min-w-[16rem] flex-1 text-sm leading-relaxed text-[var(--ink-2)]">
        {rose.prevailing && (
          <p>
            Les ratxes més fortes de cada dia vénen del{' '}
            <strong className="font-medium text-[var(--ink)]">{rose.prevailing.label}</strong>{' '}
            en el {(rose.prevailing.share * 100).toFixed(0)} % dels dies.
          </p>
        )}
        <ul className="mt-2 space-y-1">
          {[...rose.sectors]
            .filter((s) => s.days > 0)
            .sort((a, b) => b.share - a.share)
            .slice(0, 4)
            .map((s) => (
              <li key={s.deg} className="flex items-baseline justify-between gap-3">
                <span className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: gustColor(s.gustMean != null ? msToKmh(s.gustMean) : null) }}
                  />
                  <span className="font-medium text-[var(--ink)]">{s.label}</span>
                </span>
                <span className="tnum text-xs text-[var(--muted)]">
                  {(s.share * 100).toFixed(0)} %
                  {s.gustMean != null && ` · ${msToKmh(s.gustMean).toFixed(0)} km/h de mitjana`}
                  {s.gustMax != null && ` · fins a ${num(msToKmh(s.gustMax), 0)}`}
                </span>
              </li>
            ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
          Cada dia compta una vegada, per la direcció de la seva ratxa màxima, sobre{' '}
          {int(rose.days)} dies de sèrie, mesurats{' '}
          <strong className="font-medium text-[var(--ink-2)]">a {rose.heightM} m</strong>
          {rose.heightM < 10 && ' — les estacions de muntanya mesuren més baix, '
            + 'perquè a 10 m el pal no aguanta el gel, i allà el vent es mesura més fluix'}. El radi va amb l&apos;arrel quadrada de la
          freqüència, perquè l&apos;ull compara àrees i no radis. I això diu d&apos;on
          ve el vent fort, no la freqüència de les brises fluixes: la marinada de
          cada tarda d&apos;estiu hi surt poc perquè poques vegades és la ratxa del dia.
        </p>
      </figcaption>
    </figure>
  );
}
