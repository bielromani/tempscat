import { int, num } from '@/lib/format';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { projectToMap, tileWindow, type MapProjection } from '@/lib/mercator';
import type { MapFeature } from '@/lib/map';

/**
 * On són les sis estacions de muntanya, i quina temperatura hi fa.
 *
 * ## Per què està retallat al Pirineu i el de la costa no
 *
 * Perquè aquí es pot. Les sis estacions caben en una franja de 660 × 280 del
 * `viewBox`, i dibuixar-hi Catalunya sencera seria mig mapa buit —el Segrià,
 * el Camp de Tarragona i les Terres de l'Ebre no hi tenen res a dir— amb les
 * sis apinyades a dalt. La costa, en canvi, va de Portbou a Alcanar en
 * diagonal i la seva caixa **és** la del país: allà no hi ha res a retallar.
 *
 * El retall surt dels punts, no d'unes coordenades escrites a mà: si un dia
 * FGC n'obre una a la Val d'Aran o al Montsec, la finestra s'eixampla sola.
 *
 * ## Per què el número de dins és la temperatura i no el gruix de neu
 *
 * Perquè el gruix és nul vuit mesos l'any i la temperatura no ho és mai. Un
 * mapa que al setembre surt amb sis zeros no és un mapa: és un mapa apagat. La
 * temperatura la mesuren les estacions meteorològiques de cada domini cada
 * quart d'hora i tot l'any, i a 2.500 m és el que es va a mirar.
 *
 * El gruix hi és igualment, sota el nom, **quan n'hi ha**. I l'anell verd vol
 * dir oberta.
 *
 * ## Res no es trepitja, i no per sort
 *
 * Vall de Núria i Vallter estan a **35 unitats** l'una de l'altra. Amb un
 * cercle de 18 i un anell de 24, l'anell de Núria travessava el cercle de
 * Vallter i el seu rètol li queia a sobre. Per això el cercle és de 15 i
 * l'anell de 20 —35 justos— i el rètol de dalt se'n va prou amunt per no
 * tocar el cercle del veí.
 *
 * No es desplaça cap estació del seu lloc. Moure-la deu unitats són dos
 * quilòmetres, i un mapa que menteix dos quilòmetres per quedar més bonic
 * segueix mentint.
 */

export interface ResortPin {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  open: boolean;
  /** Temperatura de l'estació meteorològica més alta del domini. */
  temperature: number | null;
  /** Gruix màxim comunicat, si el comunicat encara val. */
  snowCm: number | null;
}

export function ResortMap({
  outline, projection, pins,
}: {
  outline: MapFeature[];
  projection: MapProjection;
  pins: ResortPin[];
}) {
  const placed = pins
    .map((p) => {
      const [x, y] = projectToMap(p.lon, p.lat, projection);
      return { ...p, x, y };
    })
    .sort((a, b) => a.x - b.x);

  // La finestra surt dels punts. Prou marge per veure on cau cada estació dins
  // del país i per encabir el rètol de sota.
  const MX = 110;
  const MY = 92;
  const x0 = Math.min(...placed.map((p) => p.x)) - MX;
  const x1 = Math.max(...placed.map((p) => p.x)) + MX;
  const y0 = Math.min(...placed.map((p) => p.y)) - MY;
  const y1 = Math.max(...placed.map((p) => p.y)) + MY;

  /*
   * Sota el veí de l'esquerra si hi ha lloc; a dalt si no n'hi ha.
   *
   * Amb `reduce` i no amb un `map` que arrossega dues variables de fora: el
   * lint del projecte prohibeix reassignar res després del render, i té raó —
   * un `map` que depèn de l'ordre en què s'ha cridat és una màquina d'estats
   * disfressada de transformació.
   */
  const APART = 95;
  const laid = placed.reduce<Array<typeof placed[number] & { up: boolean }>>((acc, p) => {
    const prev = acc[acc.length - 1];
    const up = prev != null && p.x - prev.x < APART ? !prev.up : false;
    return [...acc, { ...p, up }];
  }, []);

  /*
   * El relleu a sota, que aquí sí que diu alguna cosa.
   *
   * Als itineraris es va provar i no servia: la meitat passen per terreny pla i
   * un ombrejat d'un pla és un full en blanc. Aquí la finestra és el Pirineu
   * sencer, i el que es veu són les valls per on baixa cada estació.
   *
   * Les tessel·les i el zoom els tria `tileWindow()`, la mateixa funció que fa
   * servir el mapa dels itineraris — amb els zooms que `13-relief-tiles.ts`
   * calcula.
   */
  const terrain = tileWindow(
    { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    projection,
    [9, 10, 11, 12],
    24,
  );

  return (
    <figure className="m-0">
      <svg
        viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`}
        role="img"
        aria-label={`Mapa del Pirineu amb les ${pins.length} estacions de muntanya`}
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

        {terrain.map((t) => (
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

        {laid.map((p) => {
          const t = p.temperature;
          const tip = [
            p.name,
            p.open ? 'oberta' : 'tancada',
            t != null && `${num(t, 1)} °C`,
            p.snowCm != null && p.snowCm > 0 && `${int(p.snowCm)} cm de neu`,
          ].filter(Boolean).join(' · ');

          const ly = p.up ? p.y - 42 : p.y + 34;
          const sy = p.up ? p.y - 57 : p.y + 49;

          return (
            <a key={p.slug} href={`#e-${p.slug}`}>
              <g>
                {p.open && (
                  <circle cx={p.x} cy={p.y} r={20} fill="none" stroke="var(--good)" strokeWidth={4} />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={15}
                  fill={t != null ? temperatureColor(t) : 'var(--surface-2)'}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
                {t != null && (
                  <text
                    x={p.x} y={p.y}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={17} fontWeight={600} fill={temperatureInk(t)}
                    style={{ pointerEvents: 'none' }}
                  >
                    {num(t, 0)}
                  </text>
                )}
                <text
                  x={p.x} y={ly}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={17} fontWeight={600} fill="var(--ink)"
                  style={{ pointerEvents: 'none' }}
                >
                  {p.name}
                </text>
                {p.snowCm != null && p.snowCm > 0 && (
                  <text
                    x={p.x} y={sy}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={15} fill="var(--ink-2)"
                    style={{ pointerEvents: 'none' }}
                  >
                    {int(p.snowCm)} cm
                  </text>
                )}
                <title>{tip}</title>
              </g>
            </a>
          );
        })}
      </svg>

      <figcaption className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        El número és la <strong className="font-medium text-[var(--ink-2)]">temperatura
        mesurada</strong> a l&apos;estació meteorològica més alta de cada domini, que
        mesura tot l&apos;any. L&apos;anell verd vol dir oberta, i el gruix de neu hi surt
        quan el comunicat encara val. El relleu del fons és calculat del model
        d&apos;elevació de Copernicus.
      </figcaption>
    </figure>
  );
}
