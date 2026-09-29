import type { Metadata } from 'next';
import Link from 'next/link';
import InteractiveMap, { type MapFrame } from '@/components/InteractiveMap';
import { TemperatureLegend } from '@/components/TemperatureMap';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero } from '@/components/PageHero';
import { Fold } from '@/components/Fold';
import { municipalTemperatures, warningOverlay } from '@/lib/map';
import { radar, windField } from '@/lib/weather';
import { hour, num, theHour } from '@/lib/format';
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
    'El radar de les dues últimes hores, la temperatura de cada municipi, el vent '
    + 'previst i els avisos oficials, en un mapa que es pot moure i ampliar. '
    + 'Cartografia de l’ICGC.',
  alternates: { canonical: '/mapa/interactiu' },
};

/**
 * Quant pot distar l'hora del vent de l'última imatge del radar.
 *
 * El vent es publica per hores en punt i el radar cada deu minuts, així que
 * l'hora més propera és, com a molt, a mitja hora — i a una hora i poc quan la
 * predicció ja ha descartat l'hora en curs (`windField()` només en torna de
 * futures). Més enllà, el radar o el vent estan endarrerits, i ensenyar-los
 * junts seria posar el vent d'una tarda damunt de la pluja d'una altra.
 */
const WIND_MAX_GAP_S = 90 * 60;

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

  /*
   * El vent d'ara, i una sola hora.
   *
   * Abans el vent anava hora a hora per la mateixa barra que la pluja, i la
   * pàgina només el passava si **cada** hora del vent tenia el seu marc. Quan
   * la barra va quedar-se amb el radar i prou —dues hores enrere, ni una
   * endavant—, cap hora del vent hi coincidia i la capa desapareixia sense cap
   * error: el botó «Vent» deixava de sortir i prou.
   *
   * Ara va l'hora de la predicció més propera a l'última imatge del radar, que
   * és el «ara» de la pàgina, i només si hi és prou a prop (`WIND_MAX_GAP_S`).
   * `InteractiveMap` ensenya aquella hora sigui on sigui la barra, perquè
   * busca el marc i, si no el troba, agafa la primera. El rellotge no entra
   * aquí: l'instant de referència és el del radar, que ja és una dada.
   */
  const now = frames.at(-1);
  const nearest = air && now
    ? air.hours.reduce((best, h) => (
      Math.abs(h.time - now.time) < Math.abs(best.time - now.time) ? h : best
    ))
    : null;
  const windHour = nearest && now && Math.abs(nearest.time - now.time) <= WIND_MAX_GAP_S
    ? nearest
    : null;

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Mapa', path: '/mapa' },
    { nom: 'Mapa interactiu', path: '/mapa/interactiu' },
  ];

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Mapa interactiu"
        icon="partly-cloudy-day-rain"
        title="El mapa, de prop"
        lead={(
          <>
            La pluja del radar, la temperatura de cada municipi
            {windHour ? ', el vent previst' : ''} i els avisos, damunt de la
            cartografia de l’Institut Cartogràfic. Podeu moure’l i ampliar-lo.
          </>
        )}
        note={(
          <>
            Per veure el país sencer d’una ullada, sense esperar res, hi ha el{' '}
            <Link href="/mapa" className="text-[var(--accent)] no-underline hover:underline">
              mapa de temperatures per comarques
            </Link>.
          </>
        )}
      />

      <InteractiveMap
        frames={frames}
        warnings={warnings}
        wind={air && windHour
          ? { width: air.width, height: air.height, box: air.box, hours: [windHour] }
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
                <strong className="tnum text-[var(--ink-2)]">{lastPast.label}</strong>.
              </>
            ) : (
              'Encara no hi ha cap imatge de radar.'
            )}{' '}
            El mosaic públic del radar s’acaba al zoom 7: acostant-s’hi no
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
              <strong className="tnum text-[var(--ink-2)]">{temps.observed}</strong> municipis de{' '}
              {temps.total}, cadascuna corregida per l’altitud des de l’estació
              del Meteocat que li toca. Els que no surten pintats no tenen cap
              estació prou a prop.
              {temps.min != null && temps.max != null ? (
                <>
                  {' '}Ara mateix hi ha{' '}
                  <strong className="tnum text-[var(--ink-2)]">{num(temps.max - temps.min, 1)} graus</strong>{' '}
                  entre el municipi més càlid i el més fred.
                </>
              ) : null}
            </p>
          </>
        )}
        windLegend={windHour ? (
          <>
            Vent de la predicció per a{' '}
            <strong className="tnum text-[var(--ink-2)]">
              {theHour(Number(windHour.iso.slice(11, 13)))}
            </strong>, a deu metres del terra: cada fil és una partícula que el
            segueix, i com més marcat, més força. El màxim arreu del mapa és de{' '}
            <strong className="tnum text-[var(--ink-2)]">{num(windHour.maxMs * 3.6, 0)} km/h</strong>.{' '}
            <strong className="font-medium text-[var(--ink-2)]">
              És vent previst, no mesurat:
            </strong>{' '}
            surt dels punts de predicció, un cada 3,2 km dins de Catalunya i un
            cada 25 al mar i a fora. El mesurat és a la fitxa de cada lloc, amb la
            seva estació i la seva hora.
          </>
        ) : null}
        warningsLegend={warnings ? (
          <>
            {' '}Les taques de color són els{' '}
            <Link href="/avisos">avisos oficials de l’AEMET</Link> vigents, en{' '}
            <strong className="tnum text-[var(--ink-2)]">{warnings.zones}</strong>{' '}
            {warnings.zones === 1 ? 'zona' : 'zones'}. Van per{' '}
            <strong className="font-medium text-[var(--ink-2)]">zona de
            Meteoalerta</strong>, la unitat en què l’AEMET els emet: dins d’una
            zona pintada, l’avís no distingeix un poble d’un altre. Quan una zona
            en té més d’un, el color és el del més alt. El detall és a la{' '}
            <Link href="/avisos">llista d’avisos</Link> i a la fitxa de cada poble.
          </>
        ) : null}
        fallback={(
          <>
            <p>
              Aquest mapa necessita JavaScript i una targeta gràfica.
            </p>
            <p className="mt-2">
              La mateixa informació és{' '}
              <Link href="/mapa">al mapa de temperatures</Link> i{' '}
              <Link href="/radar">al radar</Link>, que funcionen sense
              executar res.
            </p>
          </>
        )}
      />

      <Fold title="D’on surt cada cosa" summary="ICGC, RainViewer, Open-Meteo, Meteocat i AEMET">
        <div className="card prose">
          <p>
            El fons és el mapa base de l’<strong>Institut Cartogràfic i Geològic
            de Catalunya</strong>, amb llicència CC BY, servit des d’aquest mateix
            domini: la vostra adreça IP no arriba a cap servidor de tessel·les de
            tercers. Arriba fins al zoom {MAP_NATIVE_MAX_ZOOM}; més a prop
            s’amplia la mateixa imatge, i per al carrer d’un poble hi ha la fitxa
            d’aquell poble.
          </p>
          <p>
            El radar és de <strong>RainViewer</strong>. El vent previst surt
            {air ? <> dels {air.points.toLocaleString('ca-ES')} punts</> : ' dels punts'} de
            predicció d’<strong>Open-Meteo</strong>, CC BY 4.0. La temperatura la
            mesuren les estacions de la XEMA del <strong>Meteocat</strong>, i els
            avisos són de l’<strong>AEMET</strong>.
          </p>
        </div>
      </Fold>
    </article>
  );
}
