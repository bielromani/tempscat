import { feelsCause, msToKmh, seaLevelPressure, windCardinal } from '@/lib/variables';
import { aqiBand, aqiLabel } from '@/lib/air-variables';
import { tr, type Lang } from '@/lib/lang';
import { douglas } from '@/lib/sea';
import { fromDirection, int, num } from '@/lib/format';
import { lastWetDay } from './RainBlock';
import type { AirQuality, Astronomy, CurrentConditions, DailyPoint, HourlyPoint } from '@/lib/weather';
import type { RainConditions } from '@/lib/conditions';
import type { SeaNearby } from '@/lib/sea';

/**
 * Les rajoles del detall d'ara: sensació, vent, humitat, pluja, UV, sol,
 * pressió, aire i mar.
 *
 * Substitueixen «Ara mateix, tota la lectura», que era una llista de vuit
 * parells etiqueta-valor tots iguals. Cada rajola diu **un** número gran i
 * una frase que l'explica —«ve del S, ratxes de 19 km/h»—, i les que en
 * tenen un dibuix, el porten: la brúixola del vent, l'arc del sol, la barra de
 * l'índex europeu. És el que fan les aplicacions del temps al mòbil, i el que
 * fa que es llegeixi d'una ullada.
 *
 * Cada rajola surt **només si hi ha la dada**: una rajola amb un guió és una
 * manera de dir «no ho sabem» que ocupa el mateix que dir-ho.
 */

function Tile({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="tile">
      <p className="tile-label">
        {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
        <img src={`/icons/w/${icon}.svg`} width={20} height={20} alt="" />
        {label}
      </p>
      {children}
    </div>
  );
}

const clock = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleTimeString('ca-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) : null;

export function DetailTiles({
  current, nowHour, today, tomorrow, astro, air, sea, rain, stationAltitude, lang = 'ca',
}: {
  current: CurrentConditions | null;
  nowHour: HourlyPoint | null;
  today: DailyPoint | null;
  tomorrow: DailyPoint | null;
  astro: Astronomy | null;
  air: AirQuality | null;
  sea: SeaNearby | null;
  rain: RainConditions | null;
  /** Per reduir la pressió al nivell del mar. Ver `seaLevelPressure()`. */
  stationAltitude: number | null;
  lang?: Lang;
}) {
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const tiles: React.ReactNode[] = [];

  // ── Sensació ── només quan diu un número diferent del de la temperatura, i
  //    amb el perquè quan es pot comprovar. Si és el mateix, no hi ha rajola.
  const tNow = current?.temperatureAdjusted ?? current?.temperature ?? null;
  if (current?.apparent != null && tNow != null && Math.round(current.apparent) !== Math.round(tNow)) {
    const ap = current.apparent;
    const gap = ap - tNow;
    const cause = feelsCause(tNow, ap, current.windSpeed ?? null);
    tiles.push(
      <Tile key="sensacio" icon="thermometer" label={t('Sensació', 'Sensación')}>
        <p className="tile-value tnum">{ap.toFixed(0)}<small>°C</small></p>
        <p className="tile-note">
          {cause === 'xafogor'
            ? t('La humitat la fa més alta que la temperatura real.', 'La humedad la hace más alta que la temperatura real.')
            : cause === 'vent'
              ? t('El vent la fa més baixa que la temperatura real.', 'El viento la hace más baja que la temperatura real.')
              : tr(
                lang,
                `${num(Math.abs(gap), 1)} graus ${gap > 0 ? 'més' : 'menys'} que la temperatura real.`,
                `${num(Math.abs(gap), 1)} grados ${gap > 0 ? 'más' : 'menos'} que la temperatura real.`,
              )}
        </p>
      </Tile>,
    );
  }

  // ── Vent ── la brúixola apunta cap on va l'aire, que és com es llegeix un vent.
  if (current?.windSpeed != null) {
    const dir = current.windDirection;
    const card = dir != null ? windCardinal(dir) : null;
    const gust = current.windGust != null ? msToKmh(current.windGust) : null;
    tiles.push(
      <Tile key="vent" icon="wind" label={t('Vent', 'Viento')}>
        <div className="tile-row">
          <p className="tile-value tnum">{msToKmh(current.windSpeed).toFixed(0)}<small>km/h</small></p>
          {dir != null && (
            <svg viewBox="0 0 60 60" width={52} height={52} aria-hidden="true" className="tile-compass">
              <circle cx="30" cy="30" r="26" fill="none" stroke="currentColor" strokeOpacity=".22" strokeWidth="2" />
              <text x="30" y="11.5" fontSize="8" textAnchor="middle" fill="currentColor" opacity=".6">N</text>
              <g transform={`rotate(${dir + 180} 30 30)`}>
                <path d="M30 9 L35.5 25 L30 21.5 L24.5 25 Z" fill="currentColor" />
                <path d="M30 22 L30 50" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </g>
            </svg>
          )}
        </div>
        <p className="tile-note">
          {card ? `${t('Ve', 'Viene')} ${fromDirection(card, lang)}` : t('Direcció variable', 'Dirección variable')}
          {gust != null && gust > msToKmh(current.windSpeed) * 1.3 && t(` · ratxes de ${gust.toFixed(0)} km/h`, ` · rachas de ${gust.toFixed(0)} km/h`)}
        </p>
      </Tile>,
    );
  }

  // ── Humitat ── amb el punt de rosada, que és el que diu si és xafogós.
  if (current?.humidity != null) {
    const dew = nowHour?.dewPoint ?? null;
    tiles.push(
      <Tile key="humitat" icon="humidity" label={t('Humitat', 'Humedad')}>
        <p className="tile-value tnum">{Math.round(current.humidity)}<small>%</small></p>
        <p className="tile-note">
          {dew != null && t(`Punt de rosada de ${dew.toFixed(0)}°`, `Punto de rocío de ${dew.toFixed(0)}°`)}
          {dew != null && dew >= 20 && t('. Xafogós', '. Bochornoso')}
          {dew != null && dew < 5 && t('. Aire sec', '. Aire seco')}
        </p>
      </Tile>,
    );
  }

  // ── Pluja ── la de les últimes 24 h, i quan va ser l'últim dia de debò.
  if (current?.precip24h != null) {
    tiles.push(
      <Tile key="pluja" icon="raindrop" label={t('Pluja · 24 h', 'Lluvia · 24 h')}>
        <p className="tile-value tnum">{num(current.precip24h, 1)}<small>mm</small></p>
        {rain && <p className="tile-note">{t('Últim dia de més de 5 mm', 'Último día de más de 5 mm')}: {lastWetDay(rain, lang)}</p>}
      </Tile>,
    );
  }

  // ── UV ── l'índex d'ara i el màxim del dia, amb el nom de la banda de l'OMS.
  if (nowHour?.uvIndex != null) {
    const uv = nowHour.uvIndex;
    const band = uv >= 11 ? t('extrem', 'extremo') : uv >= 8 ? t('molt alt', 'muy alto') : uv >= 6 ? t('alt', 'alto')
      : uv >= 3 ? t('moderat', 'moderado') : t('baix', 'bajo');
    tiles.push(
      <Tile key="uv" icon="uv-index" label={t('Índex UV', 'Índice UV')}>
        <p className="tile-value tnum">{uv}<small>{band}</small></p>
        {today?.uvMax != null && <p className="tile-note">{t('El màxim d’avui és', 'El máximo de hoy es')} {today.uvMax}.</p>}
      </Tile>,
    );
  }

  // ── Sol ── la pròxima: la posta si encara no s'ha pogut, i si no, la sortida de demà.
  if (astro?.sunrise && astro.sunset) {
    /*
     * `dayFraction` va de 0 a la sortida a 1 a la posta, i s'hi queda fora
     * d'aquest tram: abans de sortir el sol val 0 i després de pondre's, 1. Per
     * això el dia és l'interval obert, i les dues nits es distingeixen.
     */
    const f = astro.dayFraction ?? 0;
    const up = f > 0 && f < 1;
    const after = f >= 1;
    const cx = 8 + f * 104;
    const cy = 36 - Math.sin(f * Math.PI) * 30;
    tiles.push(
      <Tile key="sol" icon={up ? 'sunset' : 'sunrise'} label={up ? t('Posta del sol', 'Puesta del sol') : t('Sortida del sol', 'Salida del sol')}>
        <p className="tile-value tnum">
          {up ? clock(astro.sunset) : clock(after ? tomorrow?.sunrise ?? astro.sunrise : astro.sunrise)}
        </p>
        <svg viewBox="0 0 120 40" width="100%" height={34} aria-hidden="true" className="tile-arc">
          <path d="M8 36 Q60 -24 112 36" fill="none" stroke="currentColor" strokeOpacity=".3" strokeWidth="2" strokeDasharray="3 4" />
          <line x1="2" y1="36" x2="118" y2="36" stroke="currentColor" strokeOpacity=".2" />
          {up && <circle cx={cx} cy={cy} r="5" fill="#FFD166" />}
        </svg>
        <p className="tile-note">
          {up
            ? t(`Ha sortit a les ${clock(astro.sunrise)}`, `Ha salido a las ${clock(astro.sunrise)}`)
            : after
              ? t(`Es va pondre a les ${clock(astro.sunset)}`, `Se puso a las ${clock(astro.sunset)}`)
              : t(`Es pondrà a les ${clock(astro.sunset)}`, `Se pondrá a las ${clock(astro.sunset)}`)}
        </p>
      </Tile>,
    );
  }

  // ── Pressió ── reduïda al nivell del mar, que és la que es compara amb un mapa.
  if (current?.pressure != null) {
    const reduced = stationAltitude != null && current.temperature != null
      ? seaLevelPressure(current.pressure, stationAltitude, current.temperature)
      : null;
    tiles.push(
      <Tile key="pressio" icon="barometer" label={t('Pressió', 'Presión')}>
        <p className="tile-value tnum">{int(reduced ?? current.pressure)}<small>hPa</small></p>
        <p className="tile-note">{reduced != null ? t('Al nivell del mar', 'Al nivel del mar') : t('A l’altura de l’estació', 'A la altura de la estación')}</p>
      </Tile>,
    );
  }

  // ── Aire ── l'índex europeu, i qui el marca: no és el mateix un 60 d'ozó que de NO₂.
  if (air?.aqi != null) {
    const band = aqiBand(air.aqi);
    tiles.push(
      <Tile key="aire" icon="haze" label="Aire">
        <p className="tile-value tnum">{air.aqi}</p>
        <p className="tile-band">{aqiLabel(band, lang)}</p>
        <div className="tile-aqi" aria-hidden="true">
          <i style={{ left: `${Math.min(97, (air.aqi / 100) * 100)}%` }} />
        </div>
        {air.driver && (
          <p className="tile-note">
            {/* En castellano el contaminante lleva artículo, y las partículas son
                femeninas y plurales. La fórmula no se pasa a minúscula: es «PM2,5». */}
            {t('Ho marca', air.driver.slug.startsWith('pm') ? 'Lo marcan las' : 'Lo marca el')}{' '}
            {lang === 'es'
              ? `${air.driver.nom[0].toLowerCase()}${air.driver.nom.slice(1)}`
              : air.driver.nom.toLowerCase()}.
          </p>
        )}
      </Tile>,
    );
  }

  // ── Mar ── només a la costa: la temperatura de l'aigua i l'onada, amb les
  //    paraules dels socorristes.
  if (sea?.now?.sst != null) {
    tiles.push(
      <Tile key="mar" icon="tide-high" label="El mar">
        <p className="tile-value tnum">{num(sea.now.sst, 1)}<small>°C</small></p>
        <p className="tile-note">
          {sea.now.waveHeight != null
            ? t(`Onada de ${num(sea.now.waveHeight, 1)} m, ${douglas(sea.now.waveHeight)}`,
              `Olas de ${num(sea.now.waveHeight, 1)} m, ${douglas(sea.now.waveHeight, lang)}`)
            : t('Temperatura de l’aigua', 'Temperatura del agua')}
        </p>
      </Tile>,
    );
  }

  // ── Núvols ── on no hi ha mar, o quan cal per no deixar una rajola sola a
  //    l'última fila. Si encara en queda una, el CSS la fa ocupar tota la fila.
  if (nowHour?.cloudCover != null && (sea?.now?.sst == null || tiles.length % 2 === 1)) {
    tiles.push(
      <Tile key="nuvols" icon="overcast" label={t('Nuvolositat', 'Nubosidad')}>
        <p className="tile-value tnum">{nowHour.cloudCover}<small>%</small></p>
        <p className="tile-note">{t('Del cel cobert, segons el model.', 'Parte del cielo cubierta, según el modelo.')}</p>
      </Tile>,
    );
  }

  if (!tiles.length) return null;
  return <div className="tiles">{tiles}</div>;
}
