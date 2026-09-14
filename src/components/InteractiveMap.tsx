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

/**
 * El mapa que es pot moure.
 *
 * ## El tercer `'use client'` del projecte, i per què se n'hi deixa entrar un
 *
 * Els altres dos són millores damunt d'una cosa que ja funcionava sense
 * JavaScript. Aquest **no**: sense script no hi ha mapa que es mogui, i per
 * això viu en una adreça pròpia i les 4.293 fitxes no en saben res.
 *
 * La regla del projecte mai no ha estat «zero JavaScript al lloc»: és zero
 * JavaScript **a les pàgines territorials**. El mapa de temperatures de
 * `/mapa`, que és el que enllacen les 43 comarques i el que indexa el cercador,
 * es queda tal com és: un SVG del servidor de 10 kB. Això és una pàgina a
 * part, i qui hi entra sap que hi entra.
 *
 * MapLibre són uns 200 kB comprimits. Es carrega amb un `import()` dins de
 * l'efecte, així que **no toca cap altra ruta**: ni el fragment compartit ni
 * el servidor, que no en veu ni una línia.
 *
 * ## Per què cap tessel·la surt de fora
 *
 * El fons és el mapa base de l'ICGC que ja tenim desat, i el radar són les
 * imatges que el worker ja baixa. Cap petició d'un lector no dispara mai una
 * crida a un tercer, i aquí això vol dir una cosa concreta que un mapa
 * qualsevol no compleix: **l'adreça IP de qui mira no surt cap a cap servidor
 * de tessel·les**. No hi ha clau d'API perquè no hi ha ningú a qui demanar-la.
 *
 * ## Els marcs es creen a mesura que es demanen
 *
 * Tretze marcs de radar són quatre tessel·les cadascun, i el camp de predicció
 * són dotze imatges més: crear-ho tot en obrir són seixanta-quatre peticions
 * per a algú que potser només vol veure l'última. Es crea el que es mira i
 * **el següent**, que és el que fa que arrossegar la barra no parpellegi.
 *
 * ## I per què el color el calcula el servidor
 *
 * Perquè hi ha una sola escala de temperatura, `temperatureColor()`, i està
 * ancorada als 15 °C amb un ram de croma per l'arrel quadrada. Reescrita com
 * una interpolació de MapLibre serien dues escales, i el dia que se'n toqués
 * una, el mapa de comarques i aquest pintarien el mateix grau de dos colors
 * diferents sense que res fallés.
 */

export interface MapFrame {
  /** Segons des de l'epoch. */
  time: number;
  /** L'etiqueta que es llegeix: hora local. */
  label: string;
  kind: 'past' | 'nowcast' | 'forecast';
  /**
   * D'on surt la imatge.
   *
   * Els marcs de radar són un mosaic de tessel·les i porten una plantilla amb
   * `{z}`, `{x}` i `{y}`; els del camp de predicció són una sola imatge i
   * porten els quatre cantons en graus. Són dues menes de font de MapLibre i
   * per això no es poden unificar en una.
   */
  tiles?: string;
  image?: string;
  corners?: [[number, number], [number, number], [number, number], [number, number]];
}

interface Props {
  frames: MapFrame[];
  /** `codi INE → color`, ja calculat amb l'escala del lloc. */
  colors: Record<string, string>;
  degrees: Record<string, number>;
  observed: number;
  total: number;
  /** Els peus, que els escriu el servidor perquè no n'hi hagi dues versions. */
  radarLegend: ReactNode;
  temperatureLegend: ReactNode;
  /** El text que es veu sense JavaScript, i mentre el mapa no ha arrencat. */
  fallback: ReactNode;
}

type Capa = 'radar' | 'temperatura';

/**
 * L'adreça sencera, i és obligatori per a les fonts de GeoJSON.
 *
 * ## La trampa, que no dona cap error
 *
 * Les tessel·les del mapa base i les del radar les demana el fil principal, i
 * allí `/base/7/64/47.webp` resol contra la pàgina i va bé. **El GeoJSON no**:
 * el demana el worker de MapLibre, que és un `Blob`, i la base d'un worker de
 * blob és una adreça `blob:` — un esquema de camí opac contra el qual una ruta
 * que comença per barra no es pot resoldre.
 *
 * El que passa llavors no s'assembla gens a la causa: la petició no es fa,
 * **no hi ha cap error ni cap 404**, i la font es queda per sempre en «encara
 * no carregada». I com que `style.loaded()` demana que ho estiguin totes,
 * l'esdeveniment `load` no arriba mai: el mapa es dibuixa perfectament —les
 * tessel·les sí que carreguen— però la pàgina no se n'assabenta mai i es
 * queda ensenyant el missatge d'espera per damunt d'un mapa que ja hi és.
 *
 * Mig matí. Es va trobar comparant `isSourceLoaded('base')`, que deia sí, amb
 * `isSourceLoaded('comarques')`, que deia no.
 */
function abs(path: string): string {
  return new URL(path, window.location.origin).href;
}

/** Quant dura cada marc quan corre sol. */
const FRAME_MS = 550;
/** I l'últim, que es queda una mica més perquè es pugui llegir. */
const LAST_MS = 1600;

export default function InteractiveMap({
  frames, colors, degrees, observed, total,
  radarLegend, temperatureLegend, fallback,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<unknown>(null);
  /** Els marcs que ja tenen font i capa creades. */
  const built = useRef(new Set<number>());

  /**
   * El rectangle amb el text que es veu sense JavaScript.
   *
   * L'escriu el servidor i **s'amaga tocant el DOM**, no amb un estat: així,
   * sense script, no s'amaga mai — és el mateix recurs que fan servir les
   * pastilles de la barra del radar, i per la mateixa raó.
   *
   * S'amaga en muntar-se i no en estar el mapa llest, a posta. El `load` de
   * MapLibre no arriba fins que **totes** les fonts han carregat, i entremig el
   * mapa ja porta una estona dibuixant-se: tapant-lo fins llavors, el que es
   * veia era un avís de «això necessita JavaScript» damunt d'un mapa que ja hi
   * era. Mentre carrega hi ha una pastilla que ho diu, i prou.
   */
  const fallbackBox = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capa, setCapa] = useState<Capa>('radar');
  const [i, setI] = useState(Math.max(0, frames.length - 1));
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<{ name: string; t: number | null } | null>(null);
  /** Els municipis encara s'estan baixant. */
  const [loadingTemp, setLoadingTemp] = useState(false);

  /*
   * Amagar-lo és sincronitzar el DOM amb el que ja sabem, no canviar d'estat:
   * per això va aquí i no amb un `useState`. Si el mapa peta, torna a sortir
   * — amb el motiu a sobre.
   */
  useEffect(() => {
    if (fallbackBox.current) fallbackBox.current.hidden = !error;
  }, [error]);

  // ── Arrencada ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!box.current || !frames.length) return;
    let dead = false;
    let instance: { remove(): void } | null = null;

    (async () => {
      try {
        const maplibre = await import('maplibre-gl');
        if (dead || !box.current) return;

        /*
         * Abans de res, d'on surt el worker. Ha d'anar abans de crear el mapa:
         * després ja l'hauria intentat carregar del lloc que no és.
         */
        maplibre.setWorkerUrl(abs(MAPLIBRE_WORKER));

        const m = new maplibre.Map({
          container: box.current,
          minZoom: MAP_MIN_ZOOM,
          maxZoom: MAP_MAX_ZOOM,
          maxBounds: [
            [MAP_MAX_BOUNDS.west, MAP_MAX_BOUNDS.south],
            [MAP_MAX_BOUNDS.east, MAP_MAX_BOUNDS.north],
          ],
          // Sense rotació ni inclinació: és un mapa per llegir, i un nord que
          // es mou fa que costi més situar-s'hi del que aporta.
          dragRotate: false,
          pitchWithRotate: false,
          touchZoomRotate: true,
          attributionControl: { compact: true },
          style: {
            version: 8 as const,
            // Cap font tipogràfica: no dibuixem ni una etiqueta nostra. Els
            // noms ja vénen pintats dins de la cartografia de l'ICGC.
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
                  + ' CC BY 4.0',
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
        map.current = m;

        m.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        m.addControl(new maplibre.ScaleControl({ maxWidth: 90, unit: 'metric' }));

        m.fitBounds(
          [[MAP_BOX.west, MAP_BOX.south], [MAP_BOX.east, MAP_BOX.north]],
          { padding: 12, animate: false },
        );

        m.on('load', () => { if (!dead) setReady(true); });
        /*
         * Un error de MapLibre acaba a la consola i enlloc més: la pàgina es
         * queda amb un rectangle gris i qui mira no sap si és que no plou.
         * Una tessel·la solta que falti no compta —n'hi ha als caires— però
         * que no arrenqui, sí.
         */
        m.on('error', (e) => {
          const msg = String((e as { error?: { message?: string } })?.error?.message ?? '');
          if (!msg || /tile|404/i.test(msg)) return;
          if (!dead) setError(msg.slice(0, 160));
        });
      } catch (err) {
        if (!dead) setError(String(err).slice(0, 160));
      }
    })();

    return () => { dead = true; instance?.remove(); map.current = null; };
  }, [frames.length]);

  // ── Els marcs, creats a mesura que fan falta ─────────────────────────────
  const build = useCallback((n: number) => {
    const m = map.current as {
      getLayer(id: string): unknown;
      addSource(id: string, s: unknown): void;
      addLayer(l: unknown, before?: string): void;
    } | null;
    const f = frames[n];
    if (!m || !f || built.current.has(n)) return;

    const id = `marc-${n}`;
    m.addSource(id, f.tiles
      ? { type: 'raster', tiles: [f.tiles], tileSize: 512, minzoom: 7, maxzoom: 7 }
      : { type: 'image', url: f.image, coordinates: f.corners });

    m.addLayer({
      id,
      type: 'raster',
      source: id,
      // Es crea apagada i s'encén: creant-la visible, un marc que encara baixa
      // tessel·les apareixeria a trossos damunt del que s'estava mirant.
      paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
    }, 'comarques-linia');

    built.current.add(n);
  }, [frames]);

  useEffect(() => {
    if (!ready || capa !== 'radar') return;
    const m = map.current as {
      setPaintProperty(id: string, k: string, v: unknown): void;
    } | null;
    if (!m) return;

    build(i);
    // I el següent, que és el que fa que arrossegar no parpellegi.
    if (i + 1 < frames.length) build(i + 1);

    for (const n of built.current) {
      m.setPaintProperty(`marc-${n}`, 'raster-opacity', n === i ? 0.82 : 0);
    }
  }, [ready, capa, i, build, frames.length]);

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

  // ── La capa de temperatura, que es baixa quan s'encén ────────────────────
  useEffect(() => {
    if (!ready || capa !== 'temperatura') return;
    const m = map.current as {
      getSource(id: string): unknown;
      addSource(id: string, s: unknown): void;
      addLayer(l: unknown, before?: string): void;
      on(ev: string, layer: string, fn: (e: unknown) => void): void;
    } | null;
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

        /*
         * El color s'escriu dins de cada peça abans de donar-la al mapa.
         *
         * L'alternativa seria una expressió `match` amb 947 branques, que
         * MapLibre avalua a cada fotograma i per a cada polígon. Això es fa un
         * cop.
         */
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
             * `to-color` no és decoració: sense ell no es pinta res.
             *
             * `['get', 'c']` torna una **cadena**, i `fill-color` vol un
             * color. MapLibre no coacciona sol i tampoc es queixa: accepta la
             * capa, l'afegeix, la dibuixa —`queryRenderedFeatures` en tornava
             * 969— i el color surt buit. El mapa queda perfecte amb el fons a
             * sota i el rètol dient «924 municipis observats de 947».
             *
             * Es va trobar posant-hi un vermell fix: si amb una constant es
             * pinta i amb l'expressió no, el que falla és l'expressió.
             *
             * Un municipi sense observació sí que ha de quedar sense color: es
             * deixa veure el mapa de sota. Un gris pla es llegiria com «aquí
             * fa fred», que és la mateixa raó per la qual al mapa de comarques
             * les que no en tenen surten ratllades i no grises.
             */
            'fill-color': ['to-color', ['coalesce', ['get', 'c'], 'rgba(0,0,0,0)']],
            'fill-opacity': 0.78,
          },
        }, 'comarques-linia');

        m.on('mousemove', 'municipis-color', (e) => {
          const ev = e as { features?: Array<{ properties: { name: string; t?: number } }> };
          const p = ev.features?.[0]?.properties;
          if (p) setHover({ name: p.name, t: p.t ?? null });
        });
        m.on('mouseleave', 'municipis-color', () => setHover(null));
      } catch (err) {
        if (!dead) setError(String(err).slice(0, 160));
      } finally {
        if (!dead) setLoadingTemp(false);
      }
    })();

    return () => { dead = true; };
  }, [ready, capa, colors, degrees]);

  // Canviar de capa apaga l'altra.
  useEffect(() => {
    const m = map.current as {
      getLayer(id: string): unknown;
      setLayoutProperty(id: string, k: string, v: unknown): void;
      setPaintProperty(id: string, k: string, v: unknown): void;
    } | null;
    if (!ready || !m) return;

    if (m.getLayer('municipis-color')) {
      m.setLayoutProperty('municipis-color', 'visibility', capa === 'temperatura' ? 'visible' : 'none');
    }
    for (const n of built.current) {
      m.setPaintProperty(`marc-${n}`, 'raster-opacity', capa === 'radar' && n === i ? 0.82 : 0);
    }
  }, [ready, capa, i]);

  const f = frames[i];

  return (
    <figure className="my-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Què s'ensenya al mapa" className="flex gap-1">
          {([['radar', 'Pluja'], ['temperatura', 'Temperatura']] as const).map(([k, text]) => (
            <button
              key={k}
              type="button"
              // L'aturada va aquí i no a l'efecte: canviar d'estat dins d'un
              // efecte encadena un segon dibuix, i el lint hi és per això.
              onClick={() => { setCapa(k); if (k !== 'radar') setPlaying(false); }}
              aria-pressed={capa === k}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                capa === k
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]'
                  : 'border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--ink-2)]'
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        {capa === 'radar' && frames.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-pressed={playing}
              className="rounded-full border border-[var(--line)] px-3 py-1 text-sm text-[var(--ink-2)] hover:border-[var(--ink-2)]"
            >
              {playing ? '❚❚ Atura' : '▶ Anima'}
            </button>
            <label className="flex min-w-[12rem] flex-1 items-center gap-2 text-sm">
              <span className="sr-only">Hora del mapa</span>
              <input
                type="range"
                min={0}
                max={frames.length - 1}
                value={i}
                onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }}
                className="w-full accent-[var(--ink)]"
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="relative overflow-hidden rounded-lg border border-[var(--line)]">
        <div
          ref={box}
          className="h-[min(72vh,620px)] w-full bg-[#cfdae4]"
          // El mapa el dibuixa MapLibre en un `canvas`: per a qui llegeix amb
          // un lector de pantalla no hi ha res a dir, i el que sí que porta
          // informació —les xifres, el peu, la llista de comarques— és text de
          // la pàgina. Marcar-lo com a decoratiu és més honest que fingir una
          // descripció d'una imatge que canvia cada deu minuts.
          role="presentation"
        />

        <div
          ref={fallbackBox}
          className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg)] p-6"
        >
          <div className="max-w-[46ch] text-sm leading-relaxed text-[var(--ink-2)]">
            {error ? (
              <p className="mb-2">
                <strong className="text-[var(--ink)]">El mapa no ha arrencat.</strong>{' '}
                {error}
              </p>
            ) : null}
            {fallback}
          </div>
        </div>

        {!ready && !error ? (
          <p className="pointer-events-none absolute left-3 top-3 rounded-md bg-[var(--bg)]/90 px-2.5 py-1 text-sm text-[var(--muted)] shadow-sm">
            S’està carregant el mapa…
          </p>
        ) : null}

        {ready && !error && capa === 'radar' && f ? (
          <p className="pointer-events-none absolute left-3 top-3 rounded-md bg-[var(--bg)]/90 px-2.5 py-1 text-sm tabular-nums shadow-sm">
            <span className="font-semibold">{f.label}</span>
            <span className="ml-2 text-[var(--muted)]">
              {f.kind === 'forecast' ? 'predicció' : 'radar'}
            </span>
          </p>
        ) : null}

        {ready && !error && capa === 'temperatura' ? (
          <p className="pointer-events-none absolute left-3 top-3 rounded-md bg-[var(--bg)]/90 px-2.5 py-1 text-sm tabular-nums shadow-sm">
            {loadingTemp ? (
              <span className="text-[var(--muted)]">S’estan baixant els municipis…</span>
            ) : hover ? (
              <>
                <span className="font-semibold">{hover.name}</span>
                <span className="ml-2">
                  {hover.t != null ? `${hover.t.toFixed(1).replace('.', ',')} °C` : 'sense observació'}
                </span>
              </>
            ) : (
              <span className="text-[var(--muted)]">
                {observed} municipis observats de {total}
              </span>
            )}
          </p>
        ) : null}
      </div>

      <figcaption className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
        {capa === 'radar' ? radarLegend : temperatureLegend}
      </figcaption>
    </figure>
  );
}
