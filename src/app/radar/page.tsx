import type { Metadata } from 'next';
import Link from 'next/link';
import { radar } from '@/lib/weather';
import { allComarques, comarquesGeoJson, municipisOfComarca } from '@/lib/territory';
import { project, type TileGrid } from '@/lib/mercator';
import { radarZones } from '@/lib/radar-zones';
import { ago, hour, dateLong } from '@/lib/format';

/**
 * Radar de precipitación.
 *
 * ## Cómo puede haber un mapa sin JavaScript
 *
 * Las teselas del radar y las fronteras del ICGC están en la misma proyección
 * —Web Mercator—, así que un solo SVG puede llevar las imágenes dentro y los
 * límites administrativos encima, en el mismo sistema de coordenadas. El
 * viewBox hace de recorte y da la relación de aspecto, así que no hay salto de
 * layout ni un pixel de script.
 *
 * ## El movimiento, sin un pixel de script
 *
 * Los trece marcos —dos horas en pasos de diez minutos— están todos en el
 * mismo SVG, uno por grupo, y los mueve una animación de CSS: cada grupo tiene
 * el mismo `@keyframes` con un retardo distinto, así que se encienden por
 * turnos. Play y pausa son una casilla; `animation-play-state` hace el resto.
 *
 * **No arranca sola.** Movimiento que nadie ha pedido es movimiento que
 * molesta, y quien lo quiera lo pide con un clic. Mientras está parada se ve el
 * último marco, que es lo que alguien viene a mirar.
 *
 * Las 52 teselas que eso mete en la página no cuestan lo que parece: cada URL
 * lleva la marca de tiempo dentro y se sirve `immutable` con un año de caché
 * —ver la route handler—, así que el CDN las guarda y el almacén las ve una
 * vez.
 *
 * ## Y las zonas sí van por URL
 *
 * El instante (`?t=…`) y la zona (`?zona=…`) siguen siendo direcciones: cada
 * uno se puede compartir y el crawler ve una imagen de verdad. Lo que no puede
 * ir por URL es el movimiento, porque el movimiento **es** el producto.
 *
 * Por qué zonas y no zoom libre está escrito en `src/lib/radar-zones.ts`: el
 * tilecache público se acaba en el zoom 7 y un píxel son 460 metros.
 *
 * ## Lo que un radar no es
 *
 * Mide gotas en el aire, no lluvia en el suelo, y eso cambia cómo hay que
 * presentarlo. En verano, con la capa baja seca, media Catalunya ve ecos que se
 * evaporan antes de llegar abajo; en el Pirineo el relieve tapa el haz y hay
 * valles enteros que el radar no ve. Un mapa que no lo advierte hace que la
 * gente crea que el radar se ha equivocado, cuando lo que ha fallado es la
 * explicación.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Radar de precipitació a Catalunya',
  description:
    'On plou ara mateix a Catalunya. Imatge de radar de l\'última hora sobre els '
    + 'límits comarcals oficials, amb els avisos de què pot i què no pot veure un radar.',
  alternates: { canonical: '/radar' },
};

type Params = Promise<{ t?: string; zona?: string }>;

/**
 * Ciudades de referencia.
 *
 * Sin nombres el mapa es una mancha de colores sobre una silueta: la gente
 * necesita un ancla para situar la lluvia. Se eligen por población y se descartan
 * las que caen a menos de 32 km de una ya aceptada — así no salen cinco
 * etiquetas apiladas sobre el área metropolitana y ninguna en Ponent.
 */
function referenceCities(limit = 9): Array<{ nom: string; lat: number; lon: number; path: string }> {
  const all = allComarques()
    .flatMap((c) => municipisOfComarca(c.codi))
    .filter((m) => m.lat != null && m.lon != null && (m.poblacio ?? 0) > 0)
    .sort((a, b) => (b.poblacio ?? 0) - (a.poblacio ?? 0));

  const out: Array<{ nom: string; lat: number; lon: number; path: string }> = [];
  for (const m of all) {
    if (out.length >= limit) break;
    const far = out.every((o) => {
      const dLat = (o.lat - m.lat!) * 111;
      const dLon = (o.lon - m.lon!) * 111 * Math.cos((m.lat! * Math.PI) / 180);
      return Math.hypot(dLat, dLon) > 32;
    });
    if (far) out.push({ nom: m.nom, lat: m.lat!, lon: m.lon!, path: m.path });
  }
  return out;
}

/**
 * Contornos comarcales proyectados y decimados.
 *
 * La decimación no es un lujo: el GeoJSON son 276 KB de coordenadas, y volcarlo
 * entero en el marcado haría una página de radar más pesada que las 4.293 fichas
 * juntas. Se descartan los puntos que caen a menos de un píxel y medio del
 * anterior, que a esta escala es invisible, y se redondea a un decimal.
 */
/*
 * Se memoriza por proceso. La página es dinámica —el marco va en la URL— así que
 * sin caché cada visita reproyecta y decima quince mil coordenadas para dibujar
 * exactamente las mismas fronteras: la rejilla no cambia nunca.
 */
let pathsMemo: { key: string; paths: string[] } | null = null;

function comarcaPaths(grid: TileGrid): string[] {
  const key = `${grid.z}:${grid.x0}:${grid.y0}:${grid.size}`;
  if (pathsMemo?.key === key) return pathsMemo.paths;

  const geo = comarquesGeoJson();
  const out: string[] = [];

  for (const f of geo.features) {
    for (const polygon of f.geometry.coordinates) {
      for (const ring of polygon) {
        let d = '';
        let lastX = -1e9;
        let lastY = -1e9;
        let kept = 0;
        for (let i = 0; i < ring.length; i++) {
          const [lon, lat] = ring[i];
          const [x, y] = project(grid, lon, lat);
          const last = i === ring.length - 1;
          if (!last && kept > 0 && Math.hypot(x - lastX, y - lastY) < 1.5) continue;
          d += `${kept === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
          lastX = x; lastY = y; kept++;
        }
        if (kept > 3) out.push(`${d}Z`);
      }
    }
  }
  pathsMemo = { key, paths: out };
  return out;
}

export default async function RadarPage({ searchParams }: { searchParams: Params }) {
  const data = await radar();
  const { t, zona } = await searchParams;

  if (!data) {
    return (
      <article>
        <h1 className="text-3xl font-semibold tracking-tight">Radar de precipitació</h1>
        <p className="mt-4 max-w-[60ch] text-[var(--muted)]">
          Encara no hi ha cap imatge descarregada. El radar apareix tan aviat com
          el worker hagi corregut per primera vegada.
        </p>
      </article>
    );
  }

  const { grid, frames, tiles } = data;
  const asked = t ? frames.findIndex((f) => String(f.time) === t) : -1;
  const current = asked >= 0 ? asked : frames.length - 1;
  const frame = frames[current];

  // Recorte: el mosaico de teselas cubre más de lo que interesa —llega hasta
  // Mallorca por el este—, así que el viewBox se ajusta a Catalunya con margen.
  const [xa, ya] = project(grid, 0.05, 42.95);
  const [xb, yb] = project(grid, 3.45, 40.45);
  const full = { key: 'ca', label: 'Catalunya', x: xa, y: ya, w: xb - xa, h: yb - ya };

  const zones = radarZones(grid, full);
  const view = zones.find((z) => z.key === zona) ?? full;

  /*
   * La animación: dos `@keyframes` y un retardo por marco.
   *
   * Cada grupo está encendido durante una franja del ciclo y apagado el resto;
   * el retardo de cada uno lo coloca en su turno. **Positivo**, no negativo: un
   * retardo negativo adelanta la animación en vez de retrasarla, y con eso la
   * secuencia salía al revés — del marco más viejo al más nuevo pasando por
   * el final.
   *
   * El último marco ocupa **tres franjas** en lugar de una. Es el que alguien
   * quiere ver, y así el bucle se para un instante en el presente antes de
   * volver a empezar. Con un ciclo de N franjas justas no habría esa pausa; con
   * N+2 y todos los marcos de una franja, el mapa se quedaría en blanco dos
   * turnos.
   */
  const n = frames.length;
  const SLOT_S = 0.55;
  const slots = n + 2;
  const cycleS = slots * SLOT_S;
  const one = 100 / slots;
  const hold = (100 * 3) / slots;

  const css = [
    `@keyframes rframe{0%,${one.toFixed(3)}%{opacity:1}${(one + 0.001).toFixed(3)}%,100%{opacity:0}}`,
    `@keyframes rframe-last{0%,${hold.toFixed(3)}%{opacity:1}${(hold + 0.001).toFixed(3)}%,100%{opacity:0}}`,
    // Mientras se reproduce manda la animación; parada, manda el marco elegido.
    '#rplay:checked~.rmap .rframe{animation:rframe var(--rcycle) linear infinite}',
    '#rplay:checked~.rmap .rframes>g:last-of-type{animation-name:rframe-last}',
    /*
     * El marc triat s'encén **només amb l'animació parada**.
     *
     * Sense el `#rplay:not(:checked)` del davant, aquell marc es quedava a 1
     * durant tota la reproducció — mentre l'animació no li toca el torn no li
     * aporta cap valor, i la regla estàtica manava. I com que es dibuixa per
     * ordre del document, el més nou tapava tots els altres: l'animació corria
     * i no es veia.
     *
     * Les tres condicions són germanes en aquest ordre — casella, radios,
     * mapa — així que el combinador `~` les enfila sense `:has()`.
     */
    frames
      .map((f, i) => (
        `#rplay:not(:checked)~#rf-${f.time}:checked~.rmap .rframes>g:nth-of-type(${i + 1})`
      ))
      .join(',') + '{opacity:1}',
    frames
      .map((f) => `#rf-${f.time}:checked~.rbar label[for="rf-${f.time}"]`)
      .join(',')
      + '{border-color:var(--accent);background:var(--accent-soft);color:var(--ink)}',
  ].join('');

  const paths = comarcaPaths(grid);
  const cities = referenceCities();
  const { ageMin, lastObserved } = data;

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Radar</span>
      </nav>

      <header className="mb-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          On plou ara mateix
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {frame.kind === 'nowcast' ? (
            <>
              Previsió immediata per a {hour(frame.local)} — no és una imatge
              observada, és una extrapolació del moviment dels ecos.
            </>
          ) : (
            <>
              Imatge del radar de {dateLong(frame.local)} a {hour(frame.local)}
              {ageMin != null && frame.time === lastObserved?.time && ` · ${ago(ageMin)}`}
            </>
          )}
        </p>
      </header>

      <figure className="m-0 radar">
        {/*
          * Els controls van primer i germans del mapa: `~` no surt del pare.
          */}
        <input type="checkbox" id="rplay" />
        {frames.map((f, i) => (
          <input
            key={f.time}
            type="radio"
            name="rf"
            id={`rf-${f.time}`}
            defaultChecked={i === current}
          />
        ))}
        <style dangerouslySetInnerHTML={{ __html: css }} />

        <div
          className="rmap overflow-hidden rounded-lg border border-[var(--line-soft)]"
          style={{ background: 'var(--surface-2)', ['--rcycle' as string]: `${cycleS}s` }}
        >
          <svg
            viewBox={`${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`}
            width="100%"
            role="img"
            aria-label={`Radar de precipitació sobre ${view.label} a ${hour(frame.local)}`}
            style={{ display: 'block' }}
          >
            {/*
              * Els tretze marcs, un grup cadascun i tots amagats.
              *
              * El grup embolcall importa: `nth-of-type` compta per etiqueta, i
              * si les fronteres fossin germanes dels marcs tots els índexs
              * anirien correguts. Ja va passar amb les pestanyes.
              */}
            <g className="rframes">
              {frames.map((f, i) => (
                <g
                  key={f.time}
                  className="rframe"
                  /*
                   * Només el retard. L'`opacity: 0` va al full d'estils i no
                   * aquí: un estil en línia guanya a una regla normal, i la
                   * regla que encén el marc triat no hauria pogut apagar-lo.
                   * L'animació sí que hi guanya, així que reproduint anava —
                   * i parat no es veia res.
                   */
                  style={{ animationDelay: `${(i * SLOT_S).toFixed(2)}s` }}
                >
                  {tiles.map((tile) => (
                    <image
                      key={`${tile.x}_${tile.y}`}
                      href={`/radar/t/${f.time}/${grid.z}_${tile.x}_${tile.y}.png`}
                      x={(tile.x - grid.x0) * grid.size}
                      y={(tile.y - grid.y0) * grid.size}
                      width={grid.size}
                      height={grid.size}
                      // Sense això el navegador suavitza les tessel·les i l'eco
                      // —que ja ve interpolat per RainViewer— perd la poca vora
                      // que li queda.
                      style={{ imageRendering: 'auto' }}
                    />
                  ))}
                </g>
              ))}
            </g>

            {/* Els límits van damunt del radar, i en dos traços: un fosc ample
                a sota i un clar fi a dalt. Un sol color desapareix sobre blau
                intens o sobre fons buit, segúns el dia. */}
            <g fill="none" strokeLinejoin="round">
              {paths.map((d, i) => (
                <path key={`s${i}`} d={d} stroke="oklch(20% 0.02 250)" strokeWidth={1.6} opacity={0.35} />
              ))}
              {paths.map((d, i) => (
                <path key={`l${i}`} d={d} stroke="oklch(99% 0 0)" strokeWidth={0.6} opacity={0.7} />
              ))}
            </g>

            {cities.map((c) => {
              const [x, y] = project(grid, c.lon, c.lat);
              return (
                <g key={c.path}>
                  <circle cx={x} cy={y} r={2.8} fill="oklch(20% 0.02 250)" opacity={0.8} />
                  <circle cx={x} cy={y} r={1.3} fill="oklch(99% 0 0)" />
                  <text
                    x={x + 5} y={y + 3.5}
                    fontSize={11} fontWeight={600}
                    fill="oklch(99% 0 0)"
                    stroke="oklch(20% 0.02 250)" strokeWidth={2.4} paintOrder="stroke"
                  >{c.nom}</text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Reproduir i els instants. Les etiquetes són els controls; els radios
            queden invisibles però enfocables, i el focus es pinta a l'etiqueta. */}
        <div className="rbar mt-3">
          <label htmlFor="rplay" className="rplay-btn">
            <span className="rplay-on">Reprodueix les 2 hores</span>
            <span className="rplay-off">Atura</span>
          </label>

          <nav aria-label="Instants disponibles" className="scroll-x mt-2">
            <ol className="flex min-w-max gap-1.5">
              {frames.map((f) => (
                <li key={f.time}>
                  <label htmlFor={`rf-${f.time}`} className="rf-chip tnum">
                    {hour(f.local)}
                    {f.kind === 'nowcast' && <span className="ml-1">•</span>}
                  </label>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {/* Les zones sí van per URL: cada una es pot compartir. */}
        <nav aria-label="Zones" className="scroll-x mt-3">
          <ol className="flex min-w-max gap-1.5">
            {zones.map((z) => {
              const active = z.key === view.key;
              return (
                <li key={z.key}>
                  <Link
                    href={z.key === 'ca' ? '/radar' : `/radar?zona=${z.key}`}
                    aria-current={active ? 'true' : undefined}
                    className="block rounded-md border px-2.5 py-1.5 text-xs no-underline"
                    style={{
                      borderColor: active ? 'var(--accent)' : 'var(--line-soft)',
                      background: active ? 'var(--accent-soft)' : 'var(--surface)',
                      color: active ? 'var(--ink)' : 'var(--ink-2)',
                    }}
                  >
                    {z.label}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <figcaption className="mt-2 max-w-[65ch] text-xs leading-relaxed text-[var(--muted)]">
          {frames.some((f) => f.kind === 'nowcast') && (
            <>Els instants marcats amb un punt són previsió immediata, no observació. </>
          )}
          {/*
            * Dues coses que es veuen de seguida i decebrien sense avisar.
            *
            * La primera: aquí no hi ha minuts futurs. L'API pública de
            * RainViewer només publica marcs observats — dues hores enrere en
            * passos de deu minuts — i dir «ara mateix no hi ha previsió
            * immediata», com deia abans, prometia una cosa que no ha d'arribar.
            *
            * La segona: ampliar una zona no afina la imatge. El tilecache
            * públic s'acaba al zoom 7, on un píxel són uns 460 metres, i les
            * zones només la fan més gran. El que sí guanya definició és el que
            * hi va a sobre: les fronteres i els noms són vectors.
            */}
          Les dues hores són totes observades: aquest radar no porta minuts
          futurs. Les zones amplien la mateixa imatge — un píxel de radar són
          uns 460 metres i ampliant-la no n’apareixen més —, però les fronteres
          i els noms que hi van a sobre sí que s’afinen.
        </figcaption>
      </figure>

      <section className="mt-8 max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
          Què veu i què no veu un radar
        </h2>
        <p>
          Un radar meteorològic no mesura la pluja que arriba a terra: mesura les
          gotes que hi ha <em>a l&apos;aire</em> a uns quants centenars de metres
          d&apos;altura. Els dos no coincideixen sempre, i saber en què es
          diferencien evita la meitat dels malentesos.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">A l&apos;estiu, ecos que no mullen.</strong>{' '}
          Amb la capa baixa seca, la pluja s&apos;evapora abans de tocar el sòl. El
          radar pinta blau i al carrer no cau res: no és un error de l&apos;aparell,
          és evaporació.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">Al Pirineu, valls cegues.</strong>{' '}
          El relleu tapa el feix, i hi ha fondalades que el radar simplement no
          il·lumina. L&apos;absència d&apos;eco no és absència de pluja.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">A l&apos;hivern, neu i pluja es confonen.</strong>{' '}
          Quan els flocs es fonen just per sobre del terra, la capa de fusió
          reflecteix moltíssim i el radar exagera la intensitat. Per saber si
          nevarà, la cota de neu de cada fitxa és més fiable que aquesta imatge.
        </p>
        <p className="text-[var(--muted)]">
          Imatges de {data.source}. Límits comarcals de l&apos;Institut Cartogràfic
          i Geològic de Catalunya. Les tessel·les les descarrega el nostre worker
          cada deu minuts i les serveix aquest domini: així la vostra visita no
          arriba mai a un tercer.
        </p>
      </section>
    </article>
  );
}
