import { projectToMap, type MapProjection } from '@/lib/mercator';
import type { MapFeature } from '@/lib/map';

/**
 * Punts damunt del contorn de Catalunya.
 *
 * ## Per què n'hi ha un de sol i no un per pàgina
 *
 * Perquè quatre pàgines temàtiques feien la mateixa pregunta —«on és cada cosa
 * i quant en té»— i cap d'elles la contestava: eren llistes. Embassaments,
 * extrems del dia, qualitat de l'aire i les 189 estacions són el mateix dibuix
 * amb un color diferent, i escrivint-lo quatre vegades s'acaben tenint quatre
 * mapes que no encaixen entre ells.
 *
 * `CoastMap` i `ResortMap` es queden a part a posta: cada un fa una cosa que
 * aquest no ha de fer mai —el polígon del mar, el retall al Pirineu— i
 * doblegar-lo perquè hi cabessin l'hauria convertit en un interruptor de
 * quatre posicions.
 *
 * ## Dos modes, i la frontera és el nombre de punts
 *
 * Amb deu punts es pot escriure el valor a dins i el nom a sota. Amb 189 no:
 * els rètols es trepitgen, i un mapa amb 189 noms superposats amaga
 * exactament el que hauria d'ensenyar. Per això `labels` és una decisió de qui
 * el crida i no una constant d'aquí.
 *
 * ## Res no es mou del seu lloc
 *
 * Els rètols s'escalonen a dalt i a baix quan dos punts són a prop, però el
 * **punt** es queda on és. Desplaçar-lo deu unitats són dos quilòmetres, i un
 * mapa que menteix dos quilòmetres per quedar més bonic segueix mentint. És la
 * mateixa regla que a `ResortMap`.
 */

export interface MapPoint {
  key: string;
  lat: number;
  lon: number;
  /** El color del cercle. El decideix l'escala de cada pàgina. */
  fill: string;
  /** La tinta del text de dins, quan n'hi ha. */
  ink?: string;
  /** El que va dins del cercle. Curt: dues o tres xifres. */
  value?: string;
  /** El que va a sota. Només amb `labels`. */
  label?: string;
  /** El text del `title`, que és el que llegeix qui hi passa per sobre. */
  tip?: string;
  /** Radi. Per defecte, el del mode. */
  r?: number;
}

/** Separació per sota de la qual dos rètols es trepitjarien. */
const APART = 95;

export function PointsMap({
  outline, projection, points, width, height,
  labels = false, values = labels, ariaLabel, footer, maxHeight = 460,
}: {
  outline: MapFeature[];
  projection: MapProjection;
  points: MapPoint[];
  /** La mida del `viewBox` del contorn, tal com la publica el build. */
  width: number;
  height: number;
  /** Escriure el nom sota cada punt. Amb més de vint es trepitgen. */
  labels?: boolean;
  /**
   * Escriure el valor dins del cercle.
   *
   * A part dels noms perquè no aguanten el mateix. Setze estacions de muntanya
   * escampades pel Pirineu porten bé el número a dins i malament el nom a
   * sota, i amb un sol interruptor calia triar entre un mapa de colors sense
   * xifres i un de xifres amb els noms encavalcats. Per defecte segueix
   * `labels`, que és el que volen els mapes de pocs punts.
   */
  values?: boolean;
  ariaLabel: string;
  footer?: React.ReactNode;
  /**
   * Alçada màxima en píxels.
   *
   * El contorn de Catalunya és de 1000 × 990, o sigui quadrat: a l'amplada
   * d'una columna de text són set-cents píxels d'alçada, que en un portàtil és
   * gairebé una pantalla sencera per a un mapa que acompanya una llista. Es
   * limita l'amplada del contenidor en comptes de retallar l'SVG, que és el
   * mateix que fa el mapa del radar a `globals.css`.
   */
  maxHeight?: number;
}) {
  if (!points.length) return null;

  const placed = points
    .map((p) => {
      const [x, y] = projectToMap(p.lon, p.lat, projection);
      return { ...p, x, y };
    })
    .sort((a, b) => a.x - b.x);

  const r = values ? 17 : 5;

  /*
   * A dalt o a baix, segons el veí de l'esquerra.
   *
   * Amb `reduce` i no amb un `map` que arrossega una variable de fora: el lint
   * del projecte prohibeix reassignar res després del render, i té raó — un
   * `map` que depèn de l'ordre en què s'ha cridat és una màquina d'estats
   * disfressada de transformació.
   */
  const laid = placed.reduce<Array<typeof placed[number] & { up: boolean }>>((acc, p) => {
    const prev = acc[acc.length - 1];
    const up = prev != null && p.x - prev.x < APART ? !prev.up : false;
    return [...acc, { ...p, up }];
  }, []);

  return (
    <figure className="m-0" style={{ maxWidth: (maxHeight * width) / height, marginInline: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className="block h-auto w-full"
      >
        {outline.map((f) => (
          <path
            key={f.code}
            d={f.d}
            fill="var(--land)"
            stroke="var(--line)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        ))}

        {laid.map((p) => (
          <g key={p.key}>
            {p.tip && <title>{p.tip}</title>}
            <circle
              cx={p.x} cy={p.y} r={p.r ?? r}
              fill={p.fill}
              stroke="oklch(100% 0 0 / 0.85)"
              strokeWidth={values ? 1.5 : 1}
            />
            {values && p.value && (
              <text
                x={p.x} y={p.y + 5}
                textAnchor="middle"
                fontSize={15}
                fontWeight={600}
                fill={p.ink ?? 'oklch(20% 0.02 250)'}
                className="tnum"
              >
                {p.value}
              </text>
            )}
            {labels && p.label && (
              <text
                x={p.x}
                y={p.up ? p.y - (p.r ?? r) - 8 : p.y + (p.r ?? r) + 17}
                textAnchor="middle"
                fontSize={13}
                fontWeight={500}
                fill="var(--ink)"
                stroke="var(--bg)"
                strokeWidth={3.5}
                paintOrder="stroke"
              >
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      {footer && (
        <figcaption className="mt-2 max-w-[65ch] text-xs leading-relaxed text-[var(--muted)]">
          {footer}
        </figcaption>
      )}
    </figure>
  );
}
