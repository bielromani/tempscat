import { projectToMap, type MapProjection } from '@/lib/mercator';
import type { MapFeature } from '@/lib/map';

/**
 * El traçat d'un itinerari sobre el mapa.
 *
 * ## D'on surt el fons, que no costa cap dada nova
 *
 * Dels mateixos polígons de comarca que ja fan servir `/mapa` i els altres
 * mapes: 24 kB que la pàgina ja té. La finestra és la caixa del traçat, i com
 * que els polígons vénen en unitats d'aquell mateix `viewBox`, el retall és
 * gratis. A l'escala d'un itinerari —vint-i-sis quilòmetres— la línia de
 * comarca està simplificada a uns dos-cents metres, que és prou per situar-se
 * i no prou per fer-la servir de res més.
 *
 * ## Els pobles hi són perquè si no, això és un garabat
 *
 * Un traçat sol no diu on és. Els hi posa la fitxa, que és qui sap quins
 * municipis cauen a la vista, i van ordenats per població: amb tots, la Plana
 * de Vic seria una taca de noms.
 *
 * ## Cada via és un `M`, i això no és un detall
 *
 * A OSM una relació d'itinerari és un sac de vies **sense ordre**. Dibuixant-ho
 * com una sola línia, entre via i via hi hauria una recta que travessa el mapa
 * pel mig. Cada una va amb el seu `M`, i així l'ordre deixa de tenir cap
 * importància. El perfil d'alçades, que sí que en necessita, es fa a part.
 */

export interface RouteTown {
  nom: string;
  path: string;
  lat: number;
  lon: number;
}

export function RouteMap({
  outline, projection, trace, start, towns, name,
}: {
  outline: MapFeature[];
  projection: MapProjection;
  /** Cada via, en `[lat, lon]`. */
  trace: Array<Array<[number, number]>>;
  start: { lat: number; lon: number };
  towns: RouteTown[];
  name: string;
}) {
  const paths = trace
    .map((line) => line
      .map(([lat, lon], i) => {
        const [x, y] = projectToMap(lon, lat, projection);
        return `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' '))
    .filter(Boolean);

  const pts = trace.flat().map(([lat, lon]) => projectToMap(lon, lat, projection));
  if (!pts.length) return null;

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);

  /*
   * Un marge proporcional, amb un mínim.
   *
   * Un 12 % deixa respirar el traçat i encabeix els rètols dels pobles. El
   * mínim és per als itineraris molt petits o molt rectes: sense ell, una
   * pujada de dos quilòmetres en línia recta sortiria amb una caixa de dues
   * unitats d'alt i el mapa seria una ratlla.
   */
  const w0 = Math.max(...xs) - Math.min(...xs);
  const h0 = Math.max(...ys) - Math.min(...ys);
  const pad = Math.max(w0, h0) * 0.12 + 6;

  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  const w = w0 + pad * 2;
  const h = h0 + pad * 2;

  // El text s'escala amb la finestra: un cos fix serien lletres gegants en un
  // itinerari curt i il·legibles en un GR de quatre-cents quilòmetres.
  const unit = Math.max(w, h) / 100;
  const [sx, sy] = projectToMap(start.lon, start.lat, projection);

  const inView = towns.filter((t) => {
    const [tx, ty] = projectToMap(t.lon, t.lat, projection);
    return tx >= x0 && tx <= x0 + w && ty >= y0 && ty <= y0 + h;
  });

  return (
    <figure className="m-0">
      <svg
        viewBox={`${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`}
        role="img"
        aria-label={`Traçat de ${name} sobre el mapa`}
        className="block h-auto w-full rounded-lg border border-[var(--line-soft)]"
        style={{ background: 'var(--land)' }}
      >
        {/* Les línies de comarca, de fons. Es retallen soles amb la finestra. */}
        {outline.map((f) => (
          <path
            key={f.code}
            d={f.d}
            fill="none"
            stroke="var(--line)"
            strokeWidth={unit * 0.4}
            strokeLinejoin="round"
          />
        ))}

        {/* El traçat, amb una vora clara a sota perquè es vegi damunt de tot. */}
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--surface)"
            strokeWidth={unit * 1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {paths.map((d, i) => (
          <path
            key={`t${i}`}
            d={d}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={unit * 0.9}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {inView.map((t) => {
          const [tx, ty] = projectToMap(t.lon, t.lat, projection);
          /*
           * El rètol es gira cap endins a la vora dreta.
           *
           * Amb tots a la dreta del punt, «Calldetenes» sortia tallat pel
           * caire. El llindar és el 68 % de l'ample: passat aquí, un nom llarg
           * ja no hi cap.
           */
          const right = (tx - x0) / w > 0.68;
          return (
            <g key={t.path}>
              <circle cx={tx} cy={ty} r={unit * 0.7} fill="var(--ink-2)" />
              <text
                x={right ? tx - unit * 1.2 : tx + unit * 1.2}
                y={ty}
                textAnchor={right ? 'end' : 'start'}
                dominantBaseline="central"
                fontSize={unit * 3.4}
                fill="var(--ink)"
                stroke="var(--land)"
                strokeWidth={unit * 0.7}
                paintOrder="stroke"
              >
                {t.nom}
              </text>
            </g>
          );
        })}

        {/* L'inici, a sobre de tot. */}
        <circle cx={sx} cy={sy} r={unit * 1.6} fill="var(--good)" stroke="var(--surface)" strokeWidth={unit * 0.5} />
        <title>{`Traçat de ${name}`}</title>
      </svg>
    </figure>
  );
}
