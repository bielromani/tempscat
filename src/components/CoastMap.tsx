import { num } from '@/lib/format';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { projectToMap, type MapProjection } from '@/lib/mercator';
import type { MapFeature } from '@/lib/map';
import { flagStyle } from '@/lib/sea';

/**
 * La costa, amb la temperatura de l'aigua a cada tram.
 *
 * ## Per què el mapa el fan els punts del model i no les platges
 *
 * Perquè és el que sempre hi és. Les 229 platges del registre només porten
 * bandera **quan hi ha socorrista de servei**, i fora de temporada no n'hi ha
 * cap: un mapa de banderes seria un mapa buit vuit mesos l'any. Els vint punts
 * del model cobreixen tota la costa i totes les hores, i porten el que es va a
 * mirar —quina aigua hi ha i quina onada— també al gener a les tres de la nit.
 *
 * I són vint, no dos-cents vint-i-nou. Dibuixant les platges, la Costa Brava
 * seria una taca: entre Blanes i Portbou n'hi ha desenes en trenta
 * quilòmetres, i els punts se solaparien fins a no poder-ne clicar cap. Vint
 * punts repartits al llarg de dos-cents cinquanta quilòmetres de costa es
 * llegeixen d'un cop.
 *
 * Les banderes **sí** que hi surten quan n'hi ha: un anell de color al voltant
 * del punt més proper, que és informació de veritat i no substitueix res.
 *
 * ## El mar es pinta on hi ha mar, i no a tot el que sobra
 *
 * Un mapa de la costa on el mar és del color del fons no es llegeix com un
 * mapa. Però omplir de blau tot el que queda fora del contorn de Catalunya
 * **pinta l'Aragó i França de mar**, i això no és un detall d'estil: és una
 * falsedat en un mapa, que és el pitjor lloc per posar-ne una.
 *
 * El polígon del mar surt dels vint punts del model. Cada punt és a uns cinc
 * quilòmetres de la costa, així que desplaçant-los cap a l'interior queda una
 * línia que va **per terra** — i com que els polígons de les comarques es
 * dibuixen a sobre, aquell excés queda tapat. La direcció d'interior no és a
 * ull: surt de la perpendicular a la costa en cada punt, tria la banda que
 * apunta al centre del país. Del primer punt es puja recte fins al caire nord
 * i de l'últim es baixa recte fins al caire sud, que és on hi ha mar de veritat
 * a banda i banda.
 *
 * ## Cap línia de JavaScript
 *
 * SVG del servidor. Cada punt és un `<a>` d'SVG que porta a la seva fila de la
 * taula de sota —l'àncora `#p-<codi>`— i el `<title>` de dins fa de globus amb
 * el ratolí. Un mapa que no es pot clicar és una il·lustració.
 */

export interface CoastPoint {
  id: string;
  lat: number;
  lon: number;
  /** La platja més propera, que és com se'n diu el tram. */
  near: string;
  sst: number | null;
  wave: number | null;
  /** Bandera vigent de la platja d'aquell tram, quan n'hi ha. */
  flag: string | null;
  /** Codi de la platja, per portar a la seva fila. */
  beachCode: string | null;
}

export function CoastMap({
  outline, projection, width, height, points,
}: {
  outline: MapFeature[];
  projection: MapProjection;
  width: number;
  height: number;
  points: CoastPoint[];
}) {
  const temps = points.map((p) => p.sst).filter((v): v is number => v != null);

  /*
   * El marge, perquè els punts no quedin tallats.
   *
   * La caixa del build és la de la costa inclosa, i el punt de Portbou cau a
   * 982 de 1.000: amb un cercle de 18 i un anell de 24, la meitat en sortia.
   */
  const PAD = 30;

  const placed = points.map((p) => {
    const [x, y] = projectToMap(p.lon, p.lat, projection);
    return { ...p, x, y };
  });

  /*
   * El polígon del mar.
   *
   * `INLAND` són les unitats que cada punt es desplaça cap a terra. Amb 5 km de
   * distància a la costa i una escala d'unes 4,8 unitats per quilòmetre, 60 hi
   * entra de sobres — i sobrar-se és el que toca: el que quedi per terra el
   * tapen els polígons de les comarques, i el que es quedi curt deixaria una
   * franja de paper entre la costa i el mar.
   */
  const INLAND = 60;

  /*
   * Cap a on és terra: al nord-oest, sempre.
   *
   * La costa catalana va de nord-est a sud-oest de cap a cap, així que el mar
   * queda al sud-est i l'interior al nord-oest de qualsevol punt. Amb aquesta
   * referència fixa, la tria de perpendicular no depèn de la forma del país.
   *
   * La primera versió comparava amb el centre de Catalunya, i al delta de
   * l'Ebre fallava: el producte escalar sortia −27 sobre magnituds de
   * centenars, girava la normal cap al mar i el punt d'Alcanar es quedava
   * dibuixat damunt del paper, fora del blau. Un centroide no diu on és
   * l'interior quan el punt és a la cantonada del mapa.
   */
  const INLAND_DIR = [-1, -1];

  const tangentAt = (i: number) => {
    const a = placed[Math.max(0, i - 1)];
    const b = placed[Math.min(placed.length - 1, i + 1)];
    const [tx, ty] = [b.x - a.x, b.y - a.y];
    const len = Math.hypot(tx, ty) || 1;
    return [tx / len, ty / len] as const;
  };

  const edge = placed.map((p, i) => {
    const [tx, ty] = tangentAt(i);
    // Les dues perpendiculars; es queda la que va cap endins.
    let [nx, ny] = [-ty, tx];
    if (INLAND_DIR[0] * nx + INLAND_DIR[1] * ny < 0) [nx, ny] = [-nx, -ny];
    return [p.x + nx * INLAND, p.y + ny * INLAND] as const;
  });

  /*
   * Els dos extrems s'allarguen per la tangent, no en recte.
   *
   * Tallant en vertical, el punt del delta es quedava fora del mar: la costa
   * segueix cap al sud-oest fins a Alcanar i el model no hi arriba. I al nord,
   * un tall vertical hauria deixat una cantonada recta enmig del Golf de Roses.
   * Allargant la direcció que ja porta la costa, el mar acaba on ha d'acabar.
   *
   * S'allarga molt més enllà de la caixa: el `viewBox` ja retalla, i així no
   * cal calcular per quin caire surt.
   */
  const FAR = 3000;
  const t0 = tangentAt(0);
  const tN = tangentAt(placed.length - 1);
  const head = edge[0];
  const tail = edge[edge.length - 1];

  const seaPath = [
    `M ${(head[0] - t0[0] * FAR).toFixed(0)} ${(head[1] - t0[1] * FAR).toFixed(0)}`,
    ...edge.map(([x, y]) => `L ${x.toFixed(0)} ${y.toFixed(0)}`),
    `L ${(tail[0] + tN[0] * FAR).toFixed(0)} ${(tail[1] + tN[1] * FAR).toFixed(0)}`,
    `L ${width + FAR} ${height + FAR}`,
    `L ${width + FAR} ${-FAR}`,
    'Z',
  ].join(' ');

  return (
    <figure className="m-0">
      <svg
        viewBox={`${-PAD} ${-PAD} ${width + PAD * 2} ${height + PAD * 2}`}
        role="img"
        aria-label={
          temps.length
            ? `Mapa de la costa catalana: l'aigua va de ${num(Math.min(...temps), 1)} a ${num(Math.max(...temps), 1)} graus`
            : 'Mapa de la costa catalana'
        }
        className="geomap block h-auto w-full"
      >
        {/* El mar, a sota de tot, i només on n'hi ha. */}
        <path d={seaPath} fill="var(--sea)" />

        {/* La terra. Un sol color: aquí la dada és a l'aigua. */}
        {outline.map((f) => (
          <path
            key={f.code}
            d={f.d}
            fill="var(--land)"
            stroke="var(--surface)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        ))}

        {placed.map((p) => {
          const t = p.sst;
          const style = p.flag ? flagStyle(p.flag) : null;
          const tip = [
            p.near,
            t != null && `${num(t, 1)} °C`,
            p.wave != null && `onada de ${num(p.wave, 2)} m`,
            style && `bandera ${style.label.toLowerCase()}`,
          ].filter(Boolean).join(' · ');

          const dot = (
            <g>
              {/* L'anell de la bandera, quan n'hi ha una vigent. */}
              {style && (
                <circle cx={p.x} cy={p.y} r={24} fill="none" stroke={style.color} strokeWidth={5} />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={18}
                fill={t != null ? temperatureColor(t) : 'var(--surface-2)'}
                stroke="var(--surface)"
                strokeWidth={2}
              />
              {t != null && (
                <text
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={20}
                  fontWeight={600}
                  fill={temperatureInk(t)}
                  style={{ pointerEvents: 'none' }}
                >
                  {num(t, 0)}
                </text>
              )}
              <title>{tip}</title>
            </g>
          );

          return p.beachCode
            ? <a key={p.id} href={`#p-${p.beachCode}`}>{dot}</a>
            : <g key={p.id}>{dot}</g>;
        })}
      </svg>

      <figcaption className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        Cada cercle és un <strong className="font-medium text-[var(--ink-2)]">punt del
        model</strong> a uns cinc quilòmetres de la costa, amb la temperatura de
        l&apos;aigua en graus. Hi són tots els dies i totes les hores. L&apos;anell de
        color, quan hi és, és la bandera vigent de la platja d&apos;aquell tram —i
        aquesta la posa un socorrista, així que fora d&apos;horari no n&apos;hi ha cap.
      </figcaption>
    </figure>
  );
}
