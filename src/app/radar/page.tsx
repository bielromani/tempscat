import type { Metadata } from 'next';
import Link from 'next/link';
import { radar, windField } from '@/lib/weather';
import { allComarques, comarcaPathsOn, locationByPath, municipisOfComarca } from '@/lib/territory';
import { project } from '@/lib/mercator';
import { radarZones } from '@/lib/radar-zones';
import { municipalTemperatures, warningOverlay } from '@/lib/map';
import { ago, dateLong, hour, hourSpoken, num } from '@/lib/format';
import RadarMap, { type RadarMapFrame, type RadarMapZone } from '@/components/RadarMap';
import { TemperatureLegend } from '@/components/TemperatureMap';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero } from '@/components/PageHero';
import { Fold } from '@/components/Fold';
import { MAP_BOX } from '@/lib/webmap';

/**
 * El radar: on plou ara, en un mapa que es mou.
 *
 * ## Una pàgina i no dues
 *
 * Fins al 6 d'octubre de 2026 hi havia `/radar`, una imatge fixa amb el
 * reproductor fet de CSS i sis zones per acostar-s'hi, i `/mapa/interactiu`,
 * el mapa de MapLibre amb la pluja, la temperatura, el vent i els avisos. La
 * segona era la que deixava veure **on cau exactament** la pluja, i era la que
 * costava més de trobar. Ara n'hi ha una: el mapa que es mou, amb els controls
 * del radar. `/mapa/interactiu` redirigeix aquí (`next.config.ts`).
 *
 * ## Sense JavaScript
 *
 * Es veu l'última imatge del radar dibuixada pel servidor: les mateixes
 * tessel·les, les fronteres de l'ICGC i les ciutats de referència. És el que
 * llegeix un cercador i el que veu qui no executa res; amb JavaScript, el mapa
 * la tapa, i les imatges ja baixades són les mateixes adreces que demana.
 *
 * ## Les adreces
 *
 * `?zona=pirineu` obre una de les sis zones, `?lloc=/conca-de-barbera/…` obre
 * centrat en un lloc amb una agulla —és on porta l'enllaç de cada fitxa— i
 * `?avisos=1` obre amb els avisos encesos, que és com s'hi arriba des de
 * `/avisos`. Sense res, Catalunya sencera i els avisos apagats: pintats
 * d'entrada tapaven la pluja que es ve a mirar.
 *
 * ## Lo que un radar no es
 *
 * Mide gotas en el aire, no lluvia en el suelo. En verano, con la capa baja
 * seca, media Catalunya ve ecos que se evaporan antes de llegar abajo; en el
 * Pirineo el relieve tapa el haz y hay valles enteros que el radar no ve. Un
 * mapa que no lo advierte hace que la gente crea que el radar se ha
 * equivocado, cuando lo que ha fallado es la explicación.
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Radar de pluja a Catalunya',
  description:
    'On plou ara mateix a Catalunya: el radar de les dues últimes hores en un mapa '
    + 'que es pot moure i ampliar, amb la temperatura de cada municipi, el vent '
    + 'previst i els avisos oficials. Cartografia de l’ICGC.',
  alternates: { canonical: '/radar' },
};

type Params = Promise<{ zona?: string; lloc?: string; avisos?: string }>;

/**
 * Quant pot distar l'hora del vent de l'última imatge del radar.
 *
 * El vent es publica per hores en punt i el radar cada deu minuts, així que
 * l'hora més propera és, com a molt, a mitja hora — i a una hora i poc quan la
 * predicció ja ha descartat l'hora en curs. Més enllà, el radar o el vent estan
 * endarrerits, i ensenyar-los junts seria posar el vent d'una tarda damunt de
 * la pluja d'una altra.
 */
const WIND_MAX_GAP_S = 90 * 60;

/**
 * Ciutats de referència per a la imatge sense JavaScript.
 *
 * Sense noms, el mapa és una taca de colors damunt d'una silueta. Es trien per
 * població i es descarten les que cauen a menys de 32 km d'una ja triada: així
 * no surten cinc etiquetes apilades a l'àrea metropolitana i cap a Ponent. El
 * mapa que es mou no les necessita: la cartografia de l'ICGC ja porta els noms.
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

export default async function RadarPage({ searchParams }: { searchParams: Params }) {
  const [data, air, temps, warnings, params] = await Promise.all([
    radar(),
    windField(),
    municipalTemperatures(),
    warningOverlay(),
    searchParams,
  ]);

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Radar', path: '/radar' },
  ];

  if (!data) {
    return (
      <article data-wide>
        <JsonLd data={graph(breadcrumbLd(trail))} />
        <PageHero
          crumbs={trail}
          eyebrow="Radar de pluja"
          icon="rain"
          title="On plou ara mateix"
          lead="Encara no hi ha cap imatge de radar."
        />
      </article>
    );
  }

  const { grid, tiles } = data;

  /*
   * Només passat i present.
   *
   * Fins al 29 de setembre de 2026 la línia de temps seguia endavant amb la
   * predicció pintada com un camp. Es va treure: un model no es mou com un eco
   * de radar, i a la pantalla semblava que la pluja saltava d'un lloc a un
   * altre en passar del present al futur. El que diu si plourà aquí és la
   * predicció de cada fitxa, en hores i mil·límetres.
   */
  const frames: RadarMapFrame[] = data.frames.map((f) => ({
    time: f.time, label: hour(f.local), kind: f.kind,
  }));
  const lastPast = data.frames.map((f) => f.kind).lastIndexOf('past');
  const frame = data.frames[Math.max(lastPast, 0)];

  // ── On obre ───────────────────────────────────────────────────────────────
  const zones: RadarMapZone[] = [
    { key: 'ca', label: 'Catalunya', box: [MAP_BOX.west, MAP_BOX.south, MAP_BOX.east, MAP_BOX.north] },
    ...radarZones(),
  ];
  const place = params.lloc ? locationByPath(params.lloc) : undefined;
  const focus = place?.lat != null && place.lon != null
    ? { point: { lon: place.lon, lat: place.lat, name: place.nom } }
    : zones.some((z) => z.key === params.zona) ? { zone: params.zona } : null;

  // ── El vent d'ara, i una sola hora ────────────────────────────────────────
  /*
   * L'hora de la predicció més propera a l'última imatge del radar, que és el
   * «ara» de la pàgina, i només si hi és prou a prop. El rellotge no entra
   * aquí: l'instant de referència és el del radar, que ja és una dada.
   */
  const nearest = air
    ? air.hours.reduce((best, h) => (
      Math.abs(h.time - frame.time) < Math.abs(best.time - frame.time) ? h : best
    ))
    : null;
  const windHour = nearest && Math.abs(nearest.time - frame.time) <= WIND_MAX_GAP_S ? nearest : null;

  // ── La imatge sense JavaScript ────────────────────────────────────────────
  const [xa, ya] = project(grid, MAP_BOX.west, MAP_BOX.north);
  const [xb, yb] = project(grid, MAP_BOX.east, MAP_BOX.south);
  const paths = comarcaPathsOn(grid);
  const cities = referenceCities();

  /*
   * Aquest element i els peus de sota porten `key` encara que no siguin una
   * llista: un element que el servidor passa per props a un component de
   * client hi arriba sense validar, i React demana la clau a la consola.
   */
  const fallback = (
    <div key="fallback" className="flex min-h-0 flex-1 flex-col">
      <svg
        viewBox={`${xa.toFixed(1)} ${ya.toFixed(1)} ${(xb - xa).toFixed(1)} ${(yb - ya).toFixed(1)}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Radar de precipitació sobre Catalunya a ${hour(frame.local)}`}
        className="min-h-0 w-full flex-1"
      >
        {tiles.map((tile) => (
          <image
            key={`${tile.x}_${tile.y}`}
            href={`/radar/t/${frame.time}/${grid.z}_${tile.x}_${tile.y}.png`}
            x={(tile.x - grid.x0) * grid.size}
            y={(tile.y - grid.y0) * grid.size}
            width={grid.size}
            height={grid.size}
          />
        ))}
        <g fill="none" strokeLinejoin="round">
          {paths.map((d, i) => (
            <path key={i} d={d} stroke="oklch(99% 0 0)" strokeWidth={0.6} opacity={0.6} />
          ))}
        </g>
        {cities.map((c) => {
          const [x, y] = project(grid, c.lon, c.lat);
          return (
            <g key={c.path}>
              <circle cx={x} cy={y} r={1.6} fill="oklch(99% 0 0)" />
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
      <p className="p-3 text-[13px] text-[var(--muted)]">
        L’última imatge del radar. Per moure el mapa, ampliar-lo i veure la
        seqüència, la temperatura i el vent cal JavaScript.
      </p>
    </div>
  );

  const { ageMin, lastObserved } = data;

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Radar de pluja"
        icon="rain"
        title="On plou ara mateix"
        lead={(
          <>
            Imatge del radar de {dateLong(frame.local)}, a{' '}
            <strong className="tnum">{hourSpoken(frame.local)}</strong>
            {ageMin != null && frame.time === lastObserved?.time && <>, {ago(ageMin)}</>}.
            {' '}Podeu moure el mapa i ampliar-lo per veure on cau.
          </>
        )}
      />

      <RadarMap
        frames={frames}
        tiles={{ z: grid.z, xy: tiles }}
        zones={zones}
        focus={focus}
        warnings={warnings}
        warningsOn={params.avisos === '1'}
        wind={air && windHour
          ? {
            width: air.width,
            height: air.height,
            box: air.box,
            hours: [{
              time: windHour.time,
              name: windHour.name,
              label: `${Number(windHour.iso.slice(11, 13))} h`,
              maxKmh: Math.round(windHour.maxMs * 3.6),
            }],
          }
          : null}
        colors={temps.colors}
        degrees={temps.degrees}
        observed={temps.observed}
        total={temps.total}
        range={temps.min != null && temps.max != null ? { min: temps.min, max: temps.max } : null}
        radarLegend={(
          <p key="radar">
            Radar de {data.source}, una imatge cada deu minuts. Un píxel del radar
            són uns 460 metres: acostant-s’hi, el mapa de sota guanya detall i la
            pluja s’amplia.
          </p>
        )}
        temperatureLegend={(
          <div key="temperatura">
            {temps.min != null && temps.max != null ? (
              <TemperatureLegend span={{ min: temps.min, max: temps.max }} />
            ) : null}
            <p className="mt-2">
              La temperatura de cada municipi, corregida per l’altitud des de
              l’estació del Meteocat que li toca. Els que no surten pintats no en
              tenen cap prou a prop.
              {temps.min != null && temps.max != null ? (
                <>
                  {' '}Ara hi ha{' '}
                  <strong className="tnum text-[var(--ink-2)]">{num(temps.max - temps.min, 1)} graus</strong>{' '}
                  entre el més càlid i el més fred.
                </>
              ) : null}
            </p>
          </div>
        )}
        windLegend={windHour ? (
          <p key="vent">
            Cada fil és una partícula que segueix el vent, i com més marcat, més
            força. <strong className="font-medium text-[var(--ink-2)]">És vent
            previst, no mesurat</strong>: el mesurat és a la fitxa de cada lloc, amb
            la seva estació i la seva hora.
          </p>
        ) : null}
        warningsLegend={warnings ? (
          <p key="avisos" className="mt-2">
            Les taques de color són els{' '}
            <Link href="/avisos">avisos oficials de l’AEMET</Link> vigents, per zona
            de Meteoalerta: dins d’una zona pintada, l’avís no distingeix un poble
            d’un altre. Quan una zona en té més d’un, el color és el del més alt.
          </p>
        ) : null}
        fallback={fallback}
      />

      <Fold title="Què veu i què no veu un radar" summary="Gotes a l’aire, que no sempre són pluja a terra">
        <div className="card prose">
          <p>
            Un radar no mesura la pluja que arriba a terra: mesura les gotes que
            hi ha <em>a l&apos;aire</em>, a uns quants centenars de metres
            d&apos;altura, i no sempre coincideixen.
          </p>
          <p>
            <strong>A l&apos;estiu, ecos que no mullen.</strong> Amb la capa baixa
            seca, la pluja s&apos;evapora abans de tocar a terra: el radar pinta
            blau i al carrer no cau res.
          </p>
          <p>
            <strong>Al Pirineu, valls cegues.</strong> El relleu tapa el feix, i hi
            ha fondalades que el radar no veu. Sense eco no vol dir sense pluja.
          </p>
          <p>
            <strong>A l&apos;hivern, neu i pluja es confonen.</strong> Quan els flocs
            es fonen just per sobre del terra, el radar exagera la intensitat. Per
            saber si nevarà, la cota de neu de cada fitxa és més fiable que aquesta
            imatge.
          </p>
        </div>
      </Fold>
    </article>
  );
}
