'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  MAP_BOX, MAP_MAX_BOUNDS, MAP_MAX_ZOOM, MAP_MIN_ZOOM, MAP_NATIVE_MAX_ZOOM,
  MAPLIBRE_WORKER,
} from '@/lib/webmap';
/*
 * El full d'estil de MapLibre, i va importat aquí a posta.
 *
 * Next el posa al tros de CSS d'aquesta ruta, no al global: les altres 4.293
 * pàgines no el baixen. Importat des de `globals.css` sí que el baixarien
 * totes, per a uns controls que només existeixen en aquesta.
 *
 * I no pot anar dins de l'`import()` de l'efecte: sense ell el `canvas` no
 * s'estira i el mapa surt d'una alçada de zero — no dona cap error, es veu un
 * rectangle buit.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { WindLayer, decodeWind, type WindData } from './wind-layer';

/**
 * El radar: la pluja de les dues últimes hores en un mapa que es mou, i la
 * temperatura i el vent a un clic.
 *
 * ## Una sola pàgina, des del 6 d'octubre de 2026
 *
 * Abans n'hi havia dues: `/radar`, una imatge fixa amb el reproductor, i
 * `/mapa/interactiu`, el mapa que es mou amb una barra de temps més pobra.
 * Feien el mateix amb dues cares, i la que es podia ampliar —que és el que
 * vol qui mira on plou— era la que costava més de trobar. Ara és una: el mapa
 * de MapLibre amb els controls del radar. `/mapa/interactiu` redirigeix aquí.
 *
 * ## Per què se n'hi deixa entrar un `'use client'`
 *
 * Els altres són millores damunt d'una cosa que ja funcionava sense
 * JavaScript. Aquest **no**: sense script no hi ha mapa que es mogui. El que
 * es veu sense JavaScript és l'última imatge del radar dibuixada pel servidor
 * (`fallback`), que és la mateixa pàgina en petit.
 *
 * La regla del projecte mai no ha estat «zero JavaScript al lloc»: és zero
 * JavaScript **a les pàgines territorials**. MapLibre són uns 200 kB
 * comprimits i es carrega amb un `import()` dins de l'efecte, així que **no
 * toca cap altra ruta**.
 *
 * ## Per què cap tessel·la surt de fora
 *
 * El fons és el mapa base de l'ICGC que ja tenim desat, i el radar són les
 * imatges que el worker ja baixa. Cap petició d'un lector no dispara mai una
 * crida a un tercer: **l'adreça IP de qui mira no surt cap a cap servidor de
 * tessel·les**.
 *
 * ## El radar va en imatges soltes, i no com a font de tessel·les
 *
 * El mosaic públic només existeix al zoom 7. Declarat com a font de
 * tessel·les amb `minzoom: 7`, MapLibre **no la dibuixa per sota del 7** —no
 * dona cap error: no la demana—, i un telèfon obre Catalunya sencera al 6,3.
 * Al mòbil el mapa sortia sense pluja fins que s'hi feia zoom, i semblava
 * espatllat. Cada tessel·la és ara una font `image` amb els seus quatre
 * cantons en graus, que es dibuixa a qualsevol zoom.
 *
 * ## Els marcs es creen a mesura que es demanen
 *
 * Tretze marcs són cinquanta-dues imatges: crear-ho tot en obrir són
 * cinquanta-dues peticions per a algú que potser només vol veure l'última. Es
 * crea el que es mira i **el següent**, que és el que fa que arrossegar la
 * barra no parpellegi; en prémer «Reprodueix», tots.
 *
 * ## I per què el color de la temperatura el calcula el servidor
 *
 * Perquè hi ha una sola escala de temperatura, `temperatureColor()`. Reescrita
 * com una interpolació de MapLibre serien dues escales, i el dia que se'n
 * toqués una, el mapa de comarques i aquest pintarien el mateix grau de dos
 * colors diferents sense que res fallés.
 */

export interface RadarMapFrame {
  /** Segons des de l'epoch. */
  time: number;
  /** L'etiqueta que es llegeix: hora local. */
  label: string;
  kind: 'past' | 'nowcast';
}

interface Props {
  frames: RadarMapFrame[];
  /** Les tessel·les de cada marc: totes al mateix zoom i les mateixes per a tots. */
  tiles: { z: number; xy: Array<{ x: number; y: number }> };
  /** On obre: Catalunya sencera, o un lloc (`?lloc=`), que va marcat. */
  focus: { point: { lon: number; lat: number; name: string } } | null;
  /**
   * Les hores del camp de vent, amb la graella que les descriu.
   *
   * La pàgina en passa una sola, la més propera a l'últim marc del radar: el
   * vent no va marc a marc com la pluja.
   */
  wind: {
    width: number; height: number;
    box: { west: number; east: number; south: number; north: number };
    hours: Array<{ time: number; name: string; label: string; maxKmh: number }>;
  } | null;
  /** `codi INE → color`, ja calculat amb l'escala del lloc. */
  colors: Record<string, string>;
  degrees: Record<string, number>;
  observed: number;
  total: number;
  /** La més freda i la més càlida, per al rètol gran quan no se n'assenyala cap. */
  range: { min: number; max: number } | null;
  /**
   * Les zones amb avís vigent, ja en GeoJSON i amb el color escrit.
   *
   * No és una capa de les que es trien: un avís és context, que ha de poder
   * conviure amb el que s'estigui mirant. Va amb el seu interruptor, i
   * **arrenca apagat**: pintat d'entrada, tapava justament la pluja que es ve a
   * mirar.
   */
  warnings: {
    geojson: unknown;
    zones: number;
    worst: 'verd' | 'groc' | 'taronja' | 'vermell' | null;
  } | null;
  /** Encès d'entrada: només quan s'hi arriba des de `/avisos`. */
  warningsOn: boolean;
  /** Els peus, que els escriu el servidor perquè no n'hi hagi dues versions. */
  radarLegend: ReactNode;
  temperatureLegend: ReactNode;
  windLegend: ReactNode;
  warningsLegend: ReactNode;
  /** L'última imatge, dibuixada pel servidor: el que es veu sense JavaScript. */
  fallback: ReactNode;
}

type Capa = 'radar' | 'temperatura' | 'vent';

/**
 * L'adreça sencera, i és obligatori per a les fonts de GeoJSON.
 *
 * El GeoJSON el demana el worker de MapLibre, que és un `Blob`, i contra una
 * adreça `blob:` una ruta que comença per barra no es pot resoldre. La petició
 * no es fa, **no hi ha cap error ni cap 404**, la font es queda per sempre en
 * «encara no carregada» i l'esdeveniment `load` no arriba mai.
 */
function abs(path: string): string {
  return new URL(path, window.location.origin).href;
}

/** Els quatre cantons d'una tessel·la de Web Mercator, en graus, com els vol una font `image`. */
function tileCorners(z: number, x: number, y: number): [number, number][] {
  const n = 2 ** z;
  const lon = (tx: number) => (tx / n) * 360 - 180;
  const lat = (ty: number) => (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n)));
  return [
    [lon(x), lat(y)], [lon(x + 1), lat(y)],
    [lon(x + 1), lat(y + 1)], [lon(x), lat(y + 1)],
  ];
}

/** Un grau amb un decimal i coma, com a la resta del lloc. */
const deg = (t: number) => t.toFixed(1).replace('.', ',');

/** Quant dura cada marc quan corre sol. */
const FRAME_MS = 550;
/** I l'últim, que es queda una mica més perquè es pugui llegir. */
const LAST_MS = 1600;
/** L'opacitat de la pluja: prou per llegir el mapa de sota. */
const RAIN_OPACITY = 0.82;

type MapLike = {
  getLayer(id: string): unknown;
  getSource(id: string): unknown;
  addSource(id: string, s: unknown): void;
  addLayer(l: unknown, before?: string): void;
  setPaintProperty(id: string, k: string, v: unknown): void;
  setLayoutProperty(id: string, k: string, v: unknown): void;
  fitBounds(b: [[number, number], [number, number]], o?: unknown): void;
  on(ev: string, layerOrFn: unknown, fn?: (e: unknown) => void): void;
};

export default function RadarMap({
  frames, tiles, focus, wind, warnings, warningsOn, colors, degrees, observed, total, range,
  radarLegend, temperatureLegend, windLegend, warningsLegend, fallback,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLike | null>(null);
  /** Els marcs que ja tenen fonts i capes creades. */
  const built = useRef(new Set<number>());

  /**
   * L'última imatge del servidor, que es veu sense JavaScript.
   *
   * **S'amaga tocant el DOM**, no amb un estat: així, sense script, no
   * s'amaga mai. Si el mapa peta, torna a sortir — amb el motiu a sobre.
   */
  const fallbackBox = useRef<HTMLDivElement>(null);
  /** La capa de partícules. Es crea un cop i se li van donant hores. */
  const windLayer = useRef<WindLayer | null>(null);
  /** Les graelles ja descodificades, per hora. */
  const windCache = useRef(new Map<string, WindData>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capa, setCapa] = useState<Capa>('radar');
  const lastPast = frames.map((f) => f.kind).lastIndexOf('past');
  const [i, setI] = useState(Math.max(0, lastPast));
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<{ name: string; t: number | null } | null>(null);
  const [loadingTemp, setLoadingTemp] = useState(false);
  const [avisos, setAvisos] = useState(warningsOn);

  useEffect(() => {
    if (fallbackBox.current) fallbackBox.current.hidden = !error;
  }, [error]);

  // ── Arrencada ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!box.current) return;
    let dead = false;
    let instance: { remove(): void } | null = null;

    (async () => {
      try {
        const maplibre = await import('maplibre-gl');
        if (dead || !box.current) return;

        // Abans de crear el mapa: després ja l'hauria intentat carregar d'on no és.
        maplibre.setWorkerUrl(abs(MAPLIBRE_WORKER));

        const m = new maplibre.Map({
          container: box.current,
          minZoom: MAP_MIN_ZOOM,
          maxZoom: MAP_MAX_ZOOM,
          maxBounds: [
            [MAP_MAX_BOUNDS.west, MAP_MAX_BOUNDS.south],
            [MAP_MAX_BOUNDS.east, MAP_MAX_BOUNDS.north],
          ],
          // Sense rotació ni inclinació: és un mapa per llegir.
          dragRotate: false,
          pitchWithRotate: false,
          touchZoomRotate: true,
          attributionControl: { compact: true },
          style: {
            version: 8 as const,
            sources: {
              base: {
                type: 'raster' as const,
                tiles: ['/base/{z}/{x}/{y}.webp'],
                tileSize: 512,
                minzoom: MAP_MIN_ZOOM,
                maxzoom: MAP_NATIVE_MAX_ZOOM,
                bounds: [MAP_BOX.west, MAP_BOX.south, MAP_BOX.east, MAP_BOX.north],
                attribution:
                  '<a href="https://www.icgc.cat" target="_blank" rel="nofollow noopener noreferrer">ICGC</a>'
                  + ' CC BY · <a href="https://www.rainviewer.com" target="_blank" rel="nofollow noopener noreferrer">RainViewer</a>'
                  + ' · <a href="https://open-meteo.com" target="_blank" rel="nofollow noopener noreferrer">Open-Meteo</a>'
                  + ' CC BY 4.0 · Meteocat · AEMET',
              },
              comarques: { type: 'geojson' as const, data: abs('/mapa/geo/comarques') },
            },
            layers: [
              // El fons és el color del mar. Fora de les tessel·les que tenim
              // no hi ha territori buit: hi ha cartografia que no hem baixat.
              { id: 'fons', type: 'background' as const, paint: { 'background-color': '#cfdae4' } },
              { id: 'base', type: 'raster' as const, source: 'base' },
              {
                id: 'comarques-linia',
                type: 'line' as const,
                source: 'comarques',
                paint: {
                  'line-color': 'rgba(30,41,59,0.45)',
                  'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 11, 1.2],
                },
              },
            ],
          },
        });

        instance = m as unknown as { remove(): void };
        map.current = m as unknown as MapLike;

        m.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        m.addControl(new maplibre.ScaleControl({ maxWidth: 90, unit: 'metric' }));

        /*
         * On obre. Un lloc va centrat i a prop, amb una agulla: s'hi arriba des
         * de la fitxa, i la pregunta és «plourà aquí».
         */
        if (focus?.point) {
          m.jumpTo({ center: [focus.point.lon, focus.point.lat], zoom: 8.6 });
          const pin = document.createElement('div');
          pin.className = 'radar-pin';
          pin.textContent = focus.point.name;
          new maplibre.Marker({ element: pin, anchor: 'left', offset: [-6, 0] })
            .setLngLat([focus.point.lon, focus.point.lat])
            .addTo(m);
        } else {
          m.fitBounds(
            [[MAP_BOX.west, MAP_BOX.south], [MAP_BOX.east, MAP_BOX.north]],
            { padding: 12, animate: false },
          );
        }

        m.on('load', () => {
          if (dead) return;
          /*
           * L'atribució compacta arrenca desplegada i al mòbil tapa una franja
           * sencera del mapa fins que algú el mou. Es plega: la «i» hi segueix.
           */
          box.current?.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
          /*
           * La capa del vent es crea buida i s'afegeix un sol cop: afegir-la i
           * treure-la a cada canvi tornaria a compilar els shaders.
           */
          const layer = new WindLayer(() => m.getZoom(), () => m.triggerRepaint());
          windLayer.current = layer;
          m.addLayer(layer as unknown as Parameters<typeof m.addLayer>[0], 'comarques-linia');

          setReady(true);
        });
        /*
         * Un error de MapLibre acaba a la consola i enlloc més: la pàgina es
         * queda amb un rectangle gris i qui mira no sap si és que no plou. Una
         * tessel·la solta que falti no compta; que no arrenqui, sí.
         */
        m.on('error', (e) => {
          const msg = String((e as { error?: { message?: string } })?.error?.message ?? '');
          if (!msg || /tile|404|image/i.test(msg)) return;
          if (!dead) setError(msg.slice(0, 160));
        });
      } catch (err) {
        if (!dead) setError(String(err).slice(0, 160));
      }
    })();

    return () => { dead = true; instance?.remove(); map.current = null; };
    // L'arrencada és una: el focus només compta en obrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Els marcs, creats a mesura que fan falta ─────────────────────────────
  const build = useCallback((n: number) => {
    const m = map.current;
    const f = frames[n];
    if (!m || !f || built.current.has(n)) return;

    tiles.xy.forEach(({ x, y }, k) => {
      const id = `marc-${n}-${k}`;
      m.addSource(id, {
        type: 'image',
        url: abs(`/radar/t/${f.time}/${tiles.z}_${x}_${y}.png`),
        coordinates: tileCorners(tiles.z, x, y),
      });
      m.addLayer({
        id,
        type: 'raster',
        source: id,
        // Es crea apagada i s'encén: creant-la visible, un marc que encara
        // baixa apareixeria a trossos damunt del que s'estava mirant.
        paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
      }, 'comarques-linia');
    });

    built.current.add(n);
  }, [frames, tiles]);

  const paintFrames = useCallback((shown: number | null) => {
    const m = map.current;
    if (!m) return;
    for (const n of built.current) {
      for (let k = 0; k < tiles.xy.length; k++) {
        m.setPaintProperty(`marc-${n}-${k}`, 'raster-opacity', n === shown ? RAIN_OPACITY : 0);
      }
    }
  }, [tiles]);

  useEffect(() => {
    if (!ready) return;
    if (capa !== 'radar') { paintFrames(null); return; }
    build(i);
    // I el següent, que és el que fa que arrossegar no parpellegi.
    if (i + 1 < frames.length) build(i + 1);
    paintFrames(i);
  }, [ready, capa, i, build, paintFrames, frames.length]);

  // En prémer «Reprodueix», es demanen tots: la primera volta ja no va a salts.
  useEffect(() => {
    if (!ready || !playing) return;
    frames.forEach((_, n) => build(n));
  }, [ready, playing, frames, build]);

  // ── L'animació ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || capa !== 'radar' || frames.length < 2) return;
    const last = i === frames.length - 1;
    const t = setTimeout(
      () => setI((n) => (n + 1) % frames.length),
      last ? LAST_MS : FRAME_MS,
    );
    return () => clearTimeout(t);
  }, [playing, capa, i, frames.length]);

  // ── El vent, que es baixa quan s'encén ───────────────────────────────────
  const windShown = wind?.hours[0] ?? null;

  useEffect(() => {
    const layer = windLayer.current;
    if (!ready || !layer) return;
    if (capa !== 'vent' || !wind || !windShown) { layer.setData(null); return; }

    const hit = windCache.current.get(windShown.name);
    if (hit) { layer.setData(hit); return; }

    let dead = false;
    const img = new Image();
    img.onload = () => {
      if (dead) return;
      const cv = document.createElement('canvas');
      cv.width = wind.width;
      cv.height = wind.height;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const data = decodeWind(
        ctx.getImageData(0, 0, wind.width, wind.height).data,
        wind.width, wind.height, wind.box,
      );
      windCache.current.set(windShown.name, data);
      layer.setData(data);
    };
    img.onerror = () => { if (!dead) setError(`no s'ha pogut llegir el vent de ${windShown.label}`); };
    img.src = abs(`/vent/${windShown.name}.png`);

    return () => { dead = true; };
  }, [ready, capa, wind, windShown]);

  // ── La temperatura, que es baixa quan s'encén ────────────────────────────
  useEffect(() => {
    if (!ready || capa !== 'temperatura') return;
    const m = map.current;
    if (!m || m.getSource('municipis')) return;

    let dead = false;
    setLoadingTemp(true);

    (async () => {
      try {
        const res = await fetch(abs('/mapa/geo/municipis'));
        if (!res.ok) throw new Error(`la geometria dels municipis no ha arribat (${res.status})`);
        const geo = await res.json() as {
          features: Array<{ properties: { code: string; name: string; c?: string; t?: number } }>;
        };
        if (dead) return;

        // El color va escrit dins de cada peça: una expressió `match` amb 947
        // branques MapLibre l'avaluaria a cada fotograma.
        for (const f of geo.features) {
          const c = colors[f.properties.code];
          if (c) {
            f.properties.c = c;
            f.properties.t = degrees[f.properties.code];
          }
        }

        m.addSource('municipis', { type: 'geojson', data: geo });
        m.addLayer({
          id: 'municipis-color',
          type: 'fill',
          source: 'municipis',
          paint: {
            /*
             * `to-color` no és decoració: `['get', 'c']` torna una cadena i
             * `fill-color` vol un color. Sense, MapLibre dibuixa la capa sense
             * color i no es queixa. Un municipi sense observació queda sense
             * color: un gris es llegiria com «aquí fa fred».
             */
            'fill-color': ['to-color', ['coalesce', ['get', 'c'], 'rgba(0,0,0,0)']],
            'fill-opacity': 0.78,
          },
        }, 'comarques-linia');

        const pick = (e: unknown) => {
          const ev = e as { features?: Array<{ properties: { name: string; t?: number } }> };
          const p = ev.features?.[0]?.properties;
          if (p) setHover({ name: p.name, t: p.t ?? null });
        };
        // `mousemove` per al ratolí i `click` per al dit, que no passa per sobre de res.
        m.on('mousemove', 'municipis-color', pick);
        m.on('click', 'municipis-color', pick);
        m.on('mouseleave', 'municipis-color', () => setHover(null));
      } catch (err) {
        if (!dead) setError(String(err).slice(0, 160));
      } finally {
        if (!dead) setLoadingTemp(false);
      }
    })();

    return () => { dead = true; };
  }, [ready, capa, colors, degrees]);

  // ── Les zones d'avís ─────────────────────────────────────────────────────
  /*
   * Per damunt de tot: sota la pluja, un avís de pluja quedaria tapat justament
   * pel que avisa. Per això la taca és fluixa i qui fa la feina és el contorn.
   * El color ve escrit de cada element i li cal el `to-color`, com als
   * municipis.
   */
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !warnings || m.getLayer('avisos-taca')) return;

    m.addSource('avisos', { type: 'geojson', data: warnings.geojson });
    m.addLayer({
      id: 'avisos-taca',
      type: 'fill',
      source: 'avisos',
      layout: { visibility: 'none' },
      paint: { 'fill-color': ['to-color', ['get', 'color']], 'fill-opacity': 0.22 },
    });
    m.addLayer({
      id: 'avisos-vora',
      type: 'line',
      source: 'avisos',
      layout: { visibility: 'none' },
      paint: {
        'line-color': ['to-color', ['get', 'color']],
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.6, 11, 3.2],
      },
    });
  }, [ready, warnings]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (m.getLayer('municipis-color')) {
      m.setLayoutProperty('municipis-color', 'visibility', capa === 'temperatura' ? 'visible' : 'none');
    }
    for (const id of ['avisos-taca', 'avisos-vora']) {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', avisos ? 'visible' : 'none');
    }
  }, [ready, capa, avisos]);

  const f = frames[i] ?? frames[frames.length - 1];
  const span = Math.max(1, frames.length - 1);

  /*
   * L'ordre és el de llegir-lo de dalt a baix: què es mira (les tres capes),
   * el mapa, i a sota el que el mou. Amb la pluja, primer la barra —que és el
   * que es toca— i sota l'hora i el botó, a tocar del dit que l'arrossega.
   *
   * No hi ha dreceres a zones: fins al 6 d'octubre de 2026 n'hi havia sis
   * («Pirineu i Aran», «Ponent»…), que venien del radar d'imatge fixa. En un
   * mapa que s'amplia amb els dits, sobraven.
   */
  return (
    <figure className="card m-0 flex flex-col gap-4">
      {/* Les tres capes són excloents: o pluja, o temperatura, o vent. */}
      <div role="group" aria-label="Què s'ensenya al mapa" className="radar-seg sm:max-w-md">
        {([
          ['radar', 'Pluja'],
          ['temperatura', 'Temperatura'],
          ...(wind ? [['vent', 'Vent'] as const] : []),
        ] as const).map(([k, text]) => (
          <button
            key={k}
            type="button"
            // L'aturada va aquí i no a un efecte: canviar d'estat dins d'un
            // efecte encadena un segon dibuix.
            onClick={() => { setCapa(k); if (k !== 'radar') setPlaying(false); }}
            aria-pressed={capa === k}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[var(--line-soft)]">
        <div
          ref={box}
          className="h-[min(62vh,520px)] min-h-[340px] w-full bg-[#cfdae4] lg:h-[min(72vh,640px)]"
          // El mapa el dibuixa MapLibre en un `canvas`: el que porta informació
          // —l'hora, el peu, les xifres— és text de la pàgina.
          role="presentation"
        />

        <div
          ref={fallbackBox}
          className="absolute inset-0 z-10 flex flex-col bg-[var(--surface-2)]"
        >
          {error ? (
            <p className="m-3 rounded-xl bg-[var(--paper)] p-3 text-sm text-[var(--ink-2)]">
              <strong className="text-[var(--ink)]">El mapa no ha arrencat.</strong> {error}
            </p>
          ) : null}
          {fallback}
        </div>

        {!ready && !error ? (
          <p className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-[var(--paper)]/90 px-3 py-1 text-sm text-[var(--ink-2)] shadow-sm">
            S’està carregant el mapa…
          </p>
        ) : null}

        {ready && !error && capa === 'temperatura' ? (
          <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-[var(--paper)]/90 px-3 py-1 text-sm tabular-nums text-[var(--ink)] shadow-sm">
            {loadingTemp ? (
              <span className="text-[var(--muted)]">S’estan baixant els municipis…</span>
            ) : hover ? (
              <>
                <span className="font-semibold">{hover.name}</span>
                <span className="ml-2">
                  {hover.t != null ? `${deg(hover.t)} °C` : 'sense observació'}
                </span>
              </>
            ) : (
              <span className="text-[var(--muted)]">Toqueu un municipi</span>
            )}
          </p>
        ) : null}
      </div>

      {capa === 'radar' && (
        <div>
          {frames.length > 1 && (
            <>
              <input
                type="range"
                min={0}
                max={frames.length - 1}
                step={1}
                value={i}
                aria-label="Instant del radar"
                aria-valuetext={`${f?.label}, ${f?.kind === 'past' ? 'observació' : 'predicció'}`}
                onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }}
                className="rscrub w-full"
              />
              <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
                <span className="tnum">{frames[0].label}</span>
                <span className="tnum">{frames[Math.max(0, lastPast)]?.label} · ara</span>
                {lastPast < span && <span className="tnum">{frames[frames.length - 1].label}</span>}
              </div>
            </>
          )}
          <div className="mt-3 flex items-center justify-between gap-4">
            <div>
              <p className="radar-big tnum" aria-live="off">{f?.label}</p>
              <p className="mt-1 text-[12.5px] text-[var(--muted)]">
                {f?.kind === 'nowcast'
                  ? 'predicció immediata'
                  : i === lastPast ? 'l’última imatge' : 'observació'}
              </p>
            </div>
            {frames.length > 1 && (
              <button
                type="button"
                className="rplay-btn"
                aria-pressed={playing}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? 'Atura' : 'Reprodueix les 2 hores'}
              </button>
            )}
          </div>
        </div>
      )}

      {capa === 'temperatura' && (
        <div>
          <p className="radar-big tnum">
            {hover
              ? (hover.t != null ? `${deg(hover.t)}°` : '—')
              : range ? `${deg(range.min)}° a ${deg(range.max)}°` : '—'}
          </p>
          <p className="mt-1 text-[12.5px] text-[var(--muted)]">
            {hover
              ? (hover.t != null ? hover.name : `${hover.name}, sense observació`)
              : `ara, del municipi més fred al més càlid · ${observed} de ${total} amb observació`}
          </p>
        </div>
      )}

      {capa === 'vent' && windShown && (
        <div>
          <p className="radar-big tnum">{windShown.label}</p>
          <p className="mt-1 text-[12.5px] text-[var(--muted)]">
            vent previst a deu metres del terra · fins a {windShown.maxKmh} km/h
          </p>
        </div>
      )}

      {/*
        L'interruptor dels avisos, separat de les capes: aquelles són
        excloents i aquest no. A la mateixa filera diria que triar-lo apaga
        la pluja, que és el contrari del que fa.
      */}
      {warnings && warnings.zones > 0 ? (
        <button
          type="button"
          onClick={() => setAvisos((v) => !v)}
          aria-pressed={avisos}
          className="radar-toggle sm:max-w-md"
        >
          <span
            aria-hidden
            className="radar-toggle-dot"
            style={{ background: `var(--cap-${
              { verd: 'green', groc: 'yellow', taronja: 'orange', vermell: 'red' }[warnings.worst ?? 'groc']
            })` }}
          />
          {avisos ? 'Amaga els avisos' : 'Mostra els avisos'}
          <span className="ml-auto text-[var(--muted)] tnum">
            {warnings.zones} {warnings.zones === 1 ? 'zona' : 'zones'}
          </span>
        </button>
      ) : null}

      <figcaption className="measure text-[13px] leading-relaxed text-[var(--muted)]">
        {capa === 'radar' ? radarLegend : capa === 'vent' ? windLegend : temperatureLegend}
        {/* Els avisos conviuen amb les tres capes: el seu peu va a part. */}
        {warnings && avisos ? warningsLegend : null}
      </figcaption>
    </figure>
  );
}
