import type { Metadata } from 'next';
import Link from 'next/link';
import InteractiveMap, { type MapFrame } from '@/components/InteractiveMap';
import { TemperatureLegend } from '@/components/TemperatureMap';
import { JsonLd, breadcrumbLd } from '@/components/JsonLd';
import { municipalTemperatures } from '@/lib/map';
import { precipField, radar } from '@/lib/weather';
import { tileXToLon, tileYToLat } from '@/lib/mercator';
import { hour, num } from '@/lib/format';
import { MAP_NATIVE_MAX_ZOOM } from '@/lib/webmap';

/**
 * El mapa que es pot moure.
 *
 * ## Per què és una adreça a part i no substitueix `/mapa`
 *
 * Perquè `/mapa` fa una feina que aquest no pot fer: és el mapa que enllacen
 * les 43 fitxes de comarca, el que indexa el cercador i el que surt sense una
 * línia de JavaScript en 10 kB. Canviar-lo per dos-cents kB de WebGL seria
 * canviar una pàgina que funciona per a tothom per una que funciona per a qui
 * té una targeta gràfica.
 *
 * Així que conviuen i cadascuna diu què és l'altra: `/mapa` contesta «on fa
 * fred i on fa calor» d'una ullada i aquesta contesta «i què passa **aquí**»,
 * que és una pregunta que necessita acostar-s'hi.
 *
 * ## Què hi ha, i què no
 *
 * Hi ha la pluja —el radar i, a continuació, la nostra predicció— i la
 * temperatura municipi a municipi. **No hi ha avisos**, i no és un descuit: el
 * worker de l'AEMET desa les ubicacions que cada avís toca però no els
 * polígons, així que avui no hi ha geometria per dibuixar-los. Ensenyar-los
 * per comarques seria pintar de taronja comarques senceres per un avís que
 * cobreix una vall.
 */
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Mapa interactiu de Catalunya: pluja i temperatura',
  description:
    'El radar, la pluja prevista hora a hora i la temperatura de cada municipi, '
    + 'en un mapa que es pot moure i ampliar. Cartografia de l’ICGC.',
  alternates: { canonical: '/mapa/interactiu' },
};

export default async function MapaInteractiuPage() {
  const [rad, field, temps] = await Promise.all([
    radar(),
    precipField(),
    municipalTemperatures(),
  ]);

  /*
   * Els marcs, en ordre: primer el radar i després la predicció.
   *
   * Els dos jocs viuen en el mateix mosaic —el camp es pinta en píxels de les
   * tessel·les del radar a posta— però arriben de maneres diferents: el radar
   * són quatre tessel·les i el camp és una imatge sola. Per això aquí es fa
   * l'únic pas que els iguala: donar-li al camp els seus quatre cantons en
   * graus, que és el que MapLibre necessita per posar-lo al seu lloc.
   */
  const frames: MapFrame[] = [];

  if (rad) {
    for (const f of rad.frames) {
      frames.push({
        time: f.time,
        label: hour(f.local),
        kind: f.kind,
        tiles: `/radar/t/${f.time}/{z}_{x}_{y}.png`,
      });
    }
  }

  /*
   * El camp només entra si el seu mosaic és **el mateix** que el del radar.
   *
   * Els seus píxels es compten des de la tessel·la `(x0, y0)` de la graella del
   * radar, i el zoom i la mida els posa el worker del camp pel seu compte. Avui
   * són els mateixos —z7 i 512— i per això la comptabilitat surt: el cantó
   * nord-oest calculat cau exactament a 0,0000 / 43,0689, que és on diu la
   * graella. El dia que un dels dos canviï, aquesta mateixa aritmètica posaria
   * la pluja **desplaçada damunt d'un país que seguiria sortint bé**, que és el
   * tipus d'error que aquí no es veu fins que algú compara amb la finestra.
   *
   * Així que es comprova, i si no quadra no s'ensenya el futur: val més un
   * radar que s'acaba que una predicció posada on no toca.
   */
  const sameMosaic = !!rad && !!field
    && field.mosaic.z === rad.grid.z
    && field.mosaic.tile === rad.grid.size;

  if (rad && field && sameMosaic) {
    const { z, tile } = field.mosaic;
    const { x, y, w, h } = field.box;
    // El píxel (0,0) del mosaic és el cantó de la tessel·la (x0, y0).
    const lon = (px: number) => tileXToLon(rad.grid.x0 + px / tile, z);
    const lat = (py: number) => tileYToLat(rad.grid.y0 + py / tile, z);

    const seen = new Set(frames.map((f) => f.time));
    for (const hr of field.hours) {
      // Una hora que xoqui amb un marc de radar no entra: el radar ha mesurat
      // aquell instant i la predicció només l'endevinava.
      if (seen.has(hr.time)) continue;
      frames.push({
        time: hr.time,
        label: hour(`${hr.iso}:00`),
        kind: 'forecast',
        // Amb `.webp`: la ruta demana el nom sencer, i sense ell torna un 404
        // que no es veu — el marc queda buit i sembla que no hi plou.
        image: `/camp/${hr.name}.webp`,
        corners: [
          [lon(x), lat(y)],
          [lon(x + w), lat(y)],
          [lon(x + w), lat(y + h)],
          [lon(x), lat(y + h)],
        ],
      });
    }
  }

  frames.sort((a, b) => a.time - b.time);

  const lastPast = frames.filter((f) => f.kind === 'past').at(-1);
  const firstForecast = frames.find((f) => f.kind === 'forecast');

  return (
    <article>
      <JsonLd data={breadcrumbLd([
        { nom: 'Catalunya', path: '/' },
        { nom: 'Mapa', path: '/mapa' },
        { nom: 'Mapa interactiu', path: '/mapa/interactiu' },
      ])}
      />

      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <Link href="/mapa" className="no-underline hover:text-[var(--ink)]">Mapa</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Interactiu</span>
      </nav>

      <header className="mb-6 max-w-[65ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          El mapa, de prop
        </h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
          La pluja i la temperatura sobre la cartografia de l’Institut Cartogràfic,
          amb la finestra que trieu vós. Per veure el país sencer d’una ullada,
          sense esperar res, hi ha el{' '}
          <Link href="/mapa">mapa de temperatures per comarques</Link>.
        </p>
      </header>

      <InteractiveMap
        frames={frames}
        colors={temps.colors}
        degrees={temps.degrees}
        observed={temps.observed}
        total={temps.total}
        radarLegend={(
          <>
            {lastPast && firstForecast ? (
              <>
                Fins a les <strong className="tnum">{lastPast.label}</strong> és el
                radar: gotes mesurades a l’aire. A partir de les{' '}
                <strong className="tnum">{firstForecast.label}</strong> ja no hi ha
                cap radar al darrere — és la nostra predicció, mil·límetres previstos
                a terra. Són dues coses diferents i el primer quadre sempre té més
                color que els altres.
              </>
            ) : lastPast ? (
              <>
                Radar de precipitació fins a les{' '}
                <strong className="tnum">{lastPast.label}</strong>. Avui no hi ha
                predicció per encadenar-hi.
              </>
            ) : (
              'Encara no hi ha cap imatge de radar.'
            )}{' '}
            El mosaic públic del radar s’acaba al zoom 7: acostant-s’hi més no
            apareix cap detall nou, s’amplia la mateixa imatge.
          </>
        )}
        temperatureLegend={(
          <>
            {temps.min != null && temps.max != null ? (
              <TemperatureLegend span={{ min: temps.min, max: temps.max }} />
            ) : null}
            <p className="mt-2">
              La temperatura de{' '}
              <strong className="tnum">{temps.observed}</strong> municipis de{' '}
              {temps.total}, cadascuna corregida per l’altitud des de l’estació
              del Meteocat que li toca. Els que no surten pintats no tenen cap
              estació prou a prop: no s’hi inventa un color.
              {temps.min != null && temps.max != null ? (
                <>
                  {' '}Ara mateix hi ha{' '}
                  <strong className="tnum">{num(temps.max - temps.min, 1)} graus</strong>{' '}
                  entre el municipi més càlid i el més fred.
                </>
              ) : null}
            </p>
          </>
        )}
        fallback={(
          <>
            <p>
              Aquest mapa necessita JavaScript i una targeta gràfica, i és l’única
              pàgina del lloc que en demana.
            </p>
            <p className="mt-2">
              Sense això, la mateixa informació és{' '}
              <Link href="/mapa">al mapa de temperatures</Link> i{' '}
              <Link href="/radar">al radar</Link>, que funcionen igual sense
              executar res.
            </p>
          </>
        )}
      />

      <section className="mt-8 max-w-[65ch] text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="mb-2 text-base font-semibold text-[var(--ink)]">
          D’on surt cada cosa
        </h2>
        <p>
          El fons és el mapa base de l’<strong>Institut Cartogràfic i Geològic de
          Catalunya</strong>, amb llicència CC BY, desat i servit des d’aquí: cap
          petició d’aquesta pàgina no surt cap a un servidor de tessel·les de
          ningú, i per tant la vostra adreça IP tampoc. No hi ha cap clau d’API
          perquè no hi ha ningú a qui demanar-la.
        </p>
        <p className="mt-2">
          Les tessel·les cobreixen el país fins al zoom {MAP_NATIVE_MAX_ZOOM}. A
          partir d’aquí el que es veu és la mateixa imatge ampliada; per al
          carrer d’un poble, la fitxa d’aquell poble.
        </p>
        <p className="mt-2">
          La pluja observada és de <strong>RainViewer</strong> i la prevista surt
          dels nostres 3.190 punts de predicció d’<strong>Open-Meteo</strong>,
          CC BY 4.0. La temperatura la mesuren les estacions de la XEMA del{' '}
          <strong>Meteocat</strong>.
        </p>
      </section>
    </article>
  );
}
