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

  const paths = trace
    .map((line) => line
      .map(([lat, lon], i) => {
        const [x, y] = projectToMap(lon, lat, projection);
        return `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' '))
    .filter(Boolean);

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
        className="routemap block h-auto w-full rounded-lg border border-[var(--line-soft)]"
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
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="#fff"
            strokeWidth={unit * 2.2}
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
            stroke="var(--route)"
            strokeWidth={unit * 1.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* L'inici, a sobre de tot. */}
        <circle
          cx={sx} cy={sy} r={unit * 1.7}
          fill="var(--good)" stroke="#fff" strokeWidth={unit * 0.6}
        />
        <title>{`Traçat de ${name}`}</title>
      </svg>

      <figcaption className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
        Mapa base de l&apos;{' '}
        <External href="https://www.icgc.cat/" className="text-[var(--ink-2)]" plain>
          Institut Cartogràfic i Geològic de Catalunya
        </External>{' '}
        (CC BY). Fora de Catalunya, ©OpenMapTiles i ©OpenStreetMap (ODbL). El
        traçat és d&apos;OpenStreetMap i el punt verd és l&apos;inici que aquesta
        pàgina fa servir per calcular la predicció.
      </figcaption>
    </figure>
  );
}
