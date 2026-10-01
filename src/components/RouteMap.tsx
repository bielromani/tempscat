import { External } from './External';
import { fitBox, projectToMap, tileWindow, type MapProjection } from '@/lib/mercator';

/**
 * El traçat d'un itinerari damunt del mapa base de l'ICGC.
 *
 * ## Per què el fons és una cartografia i no un ombrejat
 *
 * Perquè un ombrejat no serveix on el terreny és pla. La primera versió posava
 * el relleu calculat del model d'altures a sota, i a la Plana de Vic —un anell
 * de vint-i-sis quilòmetres per terreny llis— no dibuixava res: el traçat
 * quedava flotant damunt del blanc i no deia ni on és ni per on va.
 *
 * El que fa útil un mapa a qui camina són els **camins, les carreteres, els
 * rius i els noms**. Això no surt d'un model d'altures; surt d'una cartografia,
 * i la del país és la de l'ICGC.
 *
 * ## Per què no s'incrusta el mapa de Google de l'ajuntament
 *
 * Perquè seria un `iframe` a google.com a cada pàgina d'itinerari —JavaScript i
 * galetes de tercers en un web que no en té ni una—, perquè aquell mapa
 * existeix per a **un** dels 683 i els altres 682 es quedarien igual, i perquè
 * el fons són tessel·les de Google, que no es poden copiar. Les de l'ICGC sí:
 * són CC BY i es desen al nostre emmagatzematge, dites d'on vénen.
 *
 * ## Els noms ja els porta el mapa
 *
 * Per això aquest component no en dibuixa cap. Posant-hi els nostres a sobre
 * sortien dos cops i mal alineats: el mapa base els col·loca amb la
 * cartografia a la mà, i nosaltres només amb un punt.
 *
 * ## Cada via és un `M`, i això no és un detall
 *
 * A OSM una relació d'itinerari és un sac de vies **sense ordre**. Dibuixant-ho
 * com una sola línia, entre via i via hi hauria una recta que travessa el mapa
 * pel mig. Cada una va amb el seu `M`, i així l'ordre deixa de tenir cap
 * importància. El perfil d'alçades, que sí que en necessita, es fa a part.
 */

/**
 * Els zooms i el sostre de tessel·les.
 *
 * **Han de ser els mateixos que `scripts/14-basemap-tiles.ts`.** Si divergeixen,
 * el worker en baixa unes i això en demana unes altres: el mapa surt amb forats
 * i res no dona error. El càlcul en si és compartit —`tileWindow()`— justament
 * per no tenir-ne dues còpies.
 *
 * Dotze és el sostre perquè cada tessel·la és una petició i uns cinquanta kB:
 * la pàgina més pesada es queda en mig mega i la normal, en un terç.
 */
const ZOOMS = [9, 10, 11, 12, 13, 14];
const MAX_TILES = 12;

export function RouteMap({
  projection, trace, start, name,
}: {
  projection: MapProjection;
  /** Cada via, en `[lat, lon]`. */
  trace: Array<Array<[number, number]>>;
  start: { lat: number; lon: number };
  name: string;
}) {
  const pts = trace.flat().map(([lat, lon]) => projectToMap(lon, lat, projection));
  if (!pts.length) return null;

  const view = fitBox(pts);
  const tiles = tileWindow(view, projection, ZOOMS, MAX_TILES);

  /*
   * Tot el traçat en **un sol `path`**, amb un `M` per via.
   *
   * Cada via era un `<path>` —dos, amb la vora— i cadascun repetia els seus
   * sis atributs: el GR 1, amb 1.153 vies, en feia 2.306 i l'article pesava
   * 527 kB, la major part atributs repetits. Un `M` ja comença un tros nou sense
   * unir-lo amb l'anterior, així que dibuixa exactament el mateix.
   *
   * I les coordenades, amb la precisió que es veu: en una finestra de mil
   * unitats per a quatre-cents píxels, una dècima són quatre centèsimes de
   * píxel. Els punts que arrodonits cauen al mateix lloc no s'hi tornen a posar.
   */
  const dp = Math.max(view.w, view.h) > 400 ? 0 : 1;
  const d = trace
    .map((line) => {
      const out: string[] = [];
      let prev = '';
      for (const [lat, lon] of line) {
        const [x, y] = projectToMap(lon, lat, projection);
        const xy = `${x.toFixed(dp)} ${y.toFixed(dp)}`;
        if (xy === prev) continue;
        out.push(`${out.length ? 'L' : 'M'}${xy}`);
        prev = xy;
      }
      return out.join('');
    })
    .join('');

  // El gruix del traçat s'escala amb la finestra: un valor fix seria una ratlla
  // d'un pam en un itinerari curt i un fil en un GR de quatre-cents quilòmetres.
  const unit = Math.max(view.w, view.h) / 100;
  const [sx, sy] = projectToMap(start.lon, start.lat, projection);

  return (
    <figure className="m-0">
      <svg
        viewBox={`${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`}
        role="img"
        aria-label={`Traçat de ${name} sobre el mapa topogràfic`}
        className="routemap block h-auto w-full rounded-2xl border border-[var(--line-soft)]"
        style={{ background: 'var(--surface-2)' }}
      >
        {tiles.map((t) => (
          <image
            key={`${t.z}/${t.x}/${t.y}`}
            href={`/base/${t.z}/${t.x}/${t.y}.webp`}
            x={t.px}
            y={t.py}
            width={t.pw}
            height={t.ph}
            preserveAspectRatio="none"
          />
        ))}

        {/*
          El traçat, amb una vora blanca a sota.
          Damunt d'un mapa amb verds, grisos i carreteres grogues, una línia
          sense vora es confon amb una carretera més. La vora la separa del
          fons sigui quin sigui el color que li toqui a sota.
        */}
        <path
          d={d}
          fill="none"
          stroke="#fff"
          strokeWidth={unit * 2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.85}
        />
        <path
          d={d}
          fill="none"
          stroke="var(--route)"
          strokeWidth={unit * 1.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* L'inici, a sobre de tot. */}
        <circle
          cx={sx} cy={sy} r={unit * 1.7}
          fill="var(--good)" stroke="#fff" strokeWidth={unit * 0.6}
        />
        <title>{`Traçat de ${name}`}</title>
      </svg>

      <figcaption className="source">
        Mapa base de l&apos;
        <External href="https://www.icgc.cat/" className="text-[var(--ink-2)]" plain>
          Institut Cartogràfic i Geològic de Catalunya
        </External>{' '}
        (CC BY); fora de Catalunya, ©OpenMapTiles i ©OpenStreetMap (ODbL). El traçat és
        d&apos;OpenStreetMap, i el punt verd és l&apos;inici, d&apos;on surt la predicció.
      </figcaption>
    </figure>
  );
}
