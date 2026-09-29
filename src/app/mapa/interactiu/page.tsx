import type { Metadata } from 'next';
import Link from 'next/link';
import InteractiveMap, { type MapFrame } from '@/components/InteractiveMap';
import { TemperatureLegend } from '@/components/TemperatureMap';
import { JsonLd, breadcrumbLd } from '@/components/JsonLd';
import { municipalTemperatures, warningOverlay } from '@/lib/map';
import { radar, windField } from '@/lib/weather';
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
 * Hi ha la pluja del radar —les dues últimes hores—, la
 * temperatura municipi a municipi, el vent i **els avisos de l'AEMET**.
 *
 * Els avisos van per **zona de Meteoalerta** i no per comarca, i aquesta és
 * tota la raó per la qual van trigar: fins al 15 de setembre de 2026 el worker
 * desava les ubicacions que cada avís toca però llençava els polígons, i
 * pintar les comarques afectades hauria estat inventar-se una vora — un avís
 * del Pirineu de Girona no arriba a tota la Garrotxa, i una comarca sencera de
 * taronja diria que sí.
 *
 * I no són una capa de les tres que es trien: un avís no és una vista
 * alternativa de la pluja, és context. Té el seu interruptor i conviu amb el
 * que s'estigui mirant.
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
  const [rad, air, temps, warnings] = await Promise.all([
    radar(),
    windField(),
    municipalTemperatures(),
    warningOverlay(),
  ]);

  /*
   * Els marcs del radar, i només ells: passat i present.
   *
   * Fins al 29 de setembre de 2026 la barra seguia amb la predicció pintada
   * com un camp. Es va treure, com a `/radar`: un model no es mou com un eco,
   * i en passar del present al futur semblava que la pluja saltés.
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


  frames.sort((a, b) => a.time - b.time);

  const lastPast = frames.filter((f) => f.kind === 'past').at(-1);

  return (
    <article data-wide>
      <JsonLd data={breadcrumbLd([
        { nom: 'Catalunya', path: '/' },
        { nom: 'Mapa', path: '/mapa' },
        { nom: 'Mapa interactiu', path: '/mapa/interactiu' },
      ])}
      />

      <nav aria-label="Ruta de navegació" className="crumbs">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <Link href="/mapa" className="no-underline hover:text-[var(--ink)]">Mapa</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Interactiu</span>
      </nav>

      <header className="page-head">
        <h1 className="page-title">
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
        warnings={warnings}
        /*
         * El vent només s'ofereix si les seves hores són les mateixes que les
         * dels marcs. Les pinta el mateix worker de la mateixa sèrie, però si
         * un dia una de les dues es publiqués a mitges, la barra ensenyaria el
         * vent d'una hora damunt de la pluja d'una altra i tot semblaria bé.
         */
        wind={air && air.hours.every((h) => frames.some((f) => f.time === h.time))
          ? { width: air.width, height: air.height, box: air.box, hours: air.hours }
          : null}
        colors={temps.colors}
        degrees={temps.degrees}
        observed={temps.observed}
        total={temps.total}
        radarLegend={(
          <>
            {lastPast ? (
              <>
                Radar de precipitació de les dues últimes hores, fins a les{' '}
                <strong className="tnum">{lastPast.label}</strong>.
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
        windLegend={(
          <>
            On va l’aire, hora a hora. Cada fil és una partícula que segueix la
            predicció del vent a deu metres del terra; com més marcat, més
            força.{' '}
            {air ? (
              <>
                En les properes{' '}
                <strong className="tnum">{air.hours.length} hores</strong> el
                màxim previst arreu del mapa és de{' '}
                <strong className="tnum">
                  {num(Math.max(...air.hours.map((h) => h.maxMs)) * 3.6, 0)} km/h
                </strong>.{' '}
              </>
            ) : null}
            <strong className="font-medium text-[var(--ink-2)]">
              No és vent mesurat: és vent previst.
            </strong>{' '}
            Surt dels mateixos punts que la pluja, un cada 3,2 km dins de
            Catalunya i un cada 25 al mar i a fora. El que s’ha mesurat de debo
            és a la fitxa de cada lloc, amb la seva estació i la seva hora.
          </>
        )}
        warningsLegend={warnings ? (
          <>
            {' '}Les taques i els contorns de color són els{' '}
            <Link href="/avisos">avisos oficials de l’AEMET</Link> vigents:{' '}
            <strong className="tnum">{warnings.zones}</strong>{' '}
            {warnings.zones === 1 ? 'zona' : 'zones'} d’avís. Van per{' '}
            <strong className="font-medium text-[var(--ink-2)]">zona de
            Meteoalerta</strong>, que és la unitat en què l’AEMET els emet — no
            per comarca ni per municipi: dins d’una zona pintada, l’avís no
            distingeix un poble d’un altre. Quan una zona en té més d’un, el
            color és el del més greu. Per saber què diuen exactament, consulteu
            la fitxa del vostre poble o la <Link href="/avisos">llista
            d’avisos</Link>.
          </>
        ) : null}
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

      <section className="mt-8 measure text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="card-title mb-2">
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
