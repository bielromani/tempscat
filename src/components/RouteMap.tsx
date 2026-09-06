import { mapToTile, projectToMap, tileToMap, type MapProjection } from '@/lib/mercator';
import type { MapFeature } from '@/lib/map';

/**
 * El traçat d'un itinerari damunt del terreny.
 *
 * ## Per què hi ha relleu a sota
 *
 * Perquè sense, això és un gargot. La primera versió dibuixava la línia damunt
 * d'un rectangle de color amb les fronteres de comarca de fons, i a la Plana de
 * Vic —on la comarca queda a quinze quilòmetres— no hi havia absolutament res:
 * un traçat flotant que no diu ni on és ni per on puja.
 *
 * El relleu són tessel·les que calcula `scripts/13-relief-tiles.ts` del mateix
 * model d'elevació que dona les cotes. Van del zoom 9 al 12 i **aquí es tria el
 * que hi cap amb poques**: al 12 el píxel fa 29 m i un GR de quatre-cents
 * quilòmetres en voldria tres mil per a un dibuix de set-cents píxels.
 *
 * ## Per què no s'incrusta el mapa de Google que fa servir l'ajuntament
 *
 * Perquè seria un `iframe` a google.com a cada pàgina d'itinerari: JavaScript i
 * galetes de tercers en un web que no en té ni una, i un avís de consentiment
 * per a tothom. Perquè aquell mapa **existeix per a un** dels 683 —el va fer
 * l'Ajuntament de Vic— i els altres 682 es quedarien igual. I perquè el que s'hi
 * veu de fons són les tessel·les de Google, que no es poden copiar.
 *
 * L'enllaç a la pàgina oficial hi és, i és el que toca: qui la vulgui, hi va.
 *
 * ## Els noms surten del nostre territori
 *
 * Municipis **i** nuclis, ordenats per població i col·locats mentre no es
 * trepitgin. Amb només municipis, un itinerari per la plana quedava amb tres
 * noms; els nuclis són per on passa de veritat.
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
  lat: number;
  lon: number;
  poblacio: number | null;
}

/** Els que hi ha calculats. Del més ample al més fi. */
const ZOOMS = [9, 10, 11, 12];

/** Amb més d'aquestes, el mapa costa més peticions del que val. */
const MAX_TILES = 48;

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

  /*
   * El zoom més fi que hi càpiga amb poques tessel·les.
   *
   * Es prova de més fi a més ample i es queda el primer que compleix. Si cap
   * no hi cap —no passa amb els 683, però podria passar amb un traçat que
   * creués tot el país— es queda el més ample, que sempre en són poques.
   */
  const tiles = (() => {
    for (const z of [...ZOOMS].reverse()) {
      const [tx0, ty0] = mapToTile(x0, y0, projection, z);
      const [tx1, ty1] = mapToTile(x0 + w, y0 + h, projection, z);
      const a = Math.floor(tx0); const b = Math.floor(tx1);
      const c = Math.floor(ty0); const d = Math.floor(ty1);
      const count = (b - a + 1) * (d - c + 1);
      if (count <= MAX_TILES || z === ZOOMS[0]) {
        const out: Array<{ z: number; x: number; y: number; px: number; py: number; pw: number; ph: number }> = [];
        for (let ty = c; ty <= d; ty++) {
          for (let tx = a; tx <= b; tx++) {
            const [ax, ay] = tileToMap(tx, ty, projection, z);
            const [bx, by] = tileToMap(tx + 1, ty + 1, projection, z);
            out.push({ z, x: tx, y: ty, px: ax, py: ay, pw: bx - ax, ph: by - ay });
          }
        }
        return out;
      }
    }
    return [];
  })();

  const [sx, sy] = projectToMap(start.lon, start.lat, projection);

  /*
   * Els rètols, col·locats mentre no es trepitgin.
   *
   * Es prova el de més població primer i es descarta el que xoqui amb un de ja
   * posat. L'amplada es calcula del nombre de lletres per 0,52 del cos, que per
   * a una tipografia de pal sec s'hi acosta prou; no cal mesurar el text de
   * veritat per decidir si hi cap.
   */
  /*
   * El cos del rètol.
   *
   * Amb 3,4 unitats, «Santa Eulàlia de Riuprimer» ocupava un terç del mapa i
   * el dibuix passava a ser un cartell amb una ratlla a sota. A 2,4, a l'ample
   * de la columna surt a uns 15 px, que és el cos d'un peu de foto.
   */
  const FS = unit * 2.4;
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  const labels: Array<{ nom: string; x: number; y: number; right: boolean }> = [];

  for (const t of towns) {
    const [tx, ty] = projectToMap(t.lon, t.lat, projection);
    if (tx < x0 || tx > x0 + w || ty < y0 || ty > y0 + h) continue;

    const right = (tx - x0) / w > 0.68;
    const tw = t.nom.length * FS * 0.52;
    const box = {
      x: right ? tx - unit * 1.2 - tw : tx + unit * 1.2,
      y: ty - FS * 0.6,
      w: tw,
      h: FS * 1.2,
    };
    const hits = placed.some((p) => !(
      box.x + box.w < p.x || p.x + p.w < box.x || box.y + box.h < p.y || p.y + p.h < box.y
    ));
    if (hits) continue;

    placed.push(box);
    labels.push({ nom: t.nom, x: tx, y: ty, right });
  }

  return (
    <figure className="m-0">
      <svg
        viewBox={`${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`}
        role="img"
        aria-label={`Traçat de ${name} sobre el relleu`}
        className="block h-auto w-full rounded-lg border border-[var(--line-soft)]"
        style={{ background: 'var(--land)' }}
      >
        {/* El terreny. Gris amb alfa damunt del color del terra, així que el
            mateix fitxer val per al tema clar i per al fosc. */}
        {tiles.map((t) => (
          <image
            key={`${t.z}/${t.x}/${t.y}`}
            href={`/relleu/${t.z}/${t.x}/${t.y}.png`}
            x={t.px}
            y={t.py}
            width={t.pw}
            height={t.ph}
            preserveAspectRatio="none"
            className="relief"
          />
        ))}

        {/* Les línies de comarca. Es retallen soles amb la finestra. */}
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
            strokeWidth={unit * 2.1}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
          />
        ))}
        {paths.map((d, i) => (
          <path
            key={`t${i}`}
            d={d}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={unit * 1.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {labels.map((l) => (
          <g key={l.nom}>
            <circle cx={l.x} cy={l.y} r={unit * 0.7} fill="var(--ink-2)" stroke="var(--surface)" strokeWidth={unit * 0.25} />
            <text
              x={l.right ? l.x - unit * 1.2 : l.x + unit * 1.2}
              y={l.y}
              textAnchor={l.right ? 'end' : 'start'}
              dominantBaseline="central"
              fontSize={FS}
              fill="var(--ink)"
              stroke="var(--land)"
              strokeWidth={unit * 0.6}
              paintOrder="stroke"
            >
              {l.nom}
            </text>
          </g>
        ))}

        {/* L'inici, a sobre de tot. */}
        <circle cx={sx} cy={sy} r={unit * 1.6} fill="var(--good)" stroke="var(--surface)" strokeWidth={unit * 0.5} />
        <title>{`Traçat de ${name}`}</title>
      </svg>
    </figure>
  );
}
