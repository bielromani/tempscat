import Link from 'next/link';
import type { CurrentConditions, LocationForecast } from '@/lib/forecast-types';
import type { Location } from '@/lib/territory';
import { weatherCode } from '@/lib/weather-codes';
import { skyStyle, drawsRain, drawsSnow } from '@/lib/sky';
import { ago, deName, num, signed } from '@/lib/format';
import { feelsCause, msToKmh, windCardinal } from '@/lib/variables';

/**
 * El titular d'una fitxa: el cel del lloc, i a sobre el que cal saber.
 *
 * ## El fons no és una il·lustració: és el temps
 *
 * Es calcula amb `src/lib/sky.ts` a partir de la nuvolositat, del codi de
 * temps, dels mil·límetres de l'hora, de l'altura del sol en aquell punt i
 * d'aquell dia, i de la fase de la lluna. Per això un migdia de juliol amb
 * quatre núvols i un vespre de novembre plovent no s'assemblen, i per això
 * tampoc no hi ha cinc dibuixos entre els quals triar.
 *
 * **Tot és CSS i tres imatges**: cap línia de JavaScript. Les fitxes de lloc
 * són la part del web que ha de funcionar sense executar res, i això no hi
 * posa cap excepció.
 *
 * ## Quina hora dibuixa
 *
 * La de la predicció que la pàgina ja està ensenyant. Així el cel i els números
 * del costat parlen sempre del mateix instant — i si la pàgina és vella, ho és
 * sencera i la línia de l'estació ho diu, en comptes de tenir un cel d'ara
 * damunt d'una temperatura d'abans.
 *
 * ## El vel de contrast no es toca
 *
 * És l'última capa abans del text i **no s'aprima cap amunt**: les textures de
 * núvol són clares i van per la part alta, que és justament on hi ha el
 * topònim. Sense ell, un núvol blanc que hi derivi per damunt es menja el nom
 * del poble durant vint segons cada dos minuts, i això no surt a cap captura.
 * `npm run test:sky` comprova el contrast contra el cel; el dels núvols s'ha de
 * mesurar al navegador amb les animacions aturades en diverses fases.
 */

interface Props {
  loc: Location;
  comarcaLabel: string;
  breadcrumbs: Array<{ nom: string; path: string }>;
  current: CurrentConditions | null;
  nowHour: LocationForecast['hourly'][number] | null;
  today: LocationForecast['daily'][number] | null;
  /** Sortida i posta del sol d'avui en aquest punt, en hores decimals. */
  sunriseH: number | null;
  sunsetH: number | null;
  /** Posició al cicle lunar: 0 i 1 lluna nova, 0,5 plena. */
  moonPhase: number;
}

/** `2026-09-15T14` → 14,0. L'hora que la pàgina ja ensenya. */
function hourOf(iso: string | undefined): number {
  if (!iso) return 12;
  const h = Number(iso.slice(11, 13));
  return Number.isFinite(h) ? h : 12;
}

export function LocationHero({
  loc, comarcaLabel, breadcrumbs, current, nowHour, today, sunriseH, sunsetH, moonPhase,
}: Props) {
  const sky = skyStyle({
    hour: hourOf(nowHour?.time),
    sunriseH,
    sunsetH,
    cloudCover: nowHour?.cloudCover ?? null,
    code: nowHour?.weatherCode ?? null,
    precipitationMm: nowHour?.precipitation ?? null,
    moonPhase,
  });

  const t = current?.temperatureAdjusted ?? nowHour?.temperature ?? null;
  const whole = t != null ? Math.trunc(t) : null;
  const decimal = t != null ? Math.abs(Math.round((t - Math.trunc(t)) * 10)) : null;
  const condition = nowHour?.weatherCode != null ? weatherCode(nowHour.weatherCode).caLong : null;
  const corrected = current?.station.dAltM != null && Math.abs(current.station.dAltM) >= 25;

  /*
   * Una capa de núvol que no es veu **no s'escriu**, i no n'hi ha prou amb
   * amagar-la.
   *
   * Amb `opacity: 0` el navegador demana la imatge igualment, això ja se sabia.
   * El que no era evident: amb `display: none` **al pare**, Chrome també la
   * demana — mesurat amb el registre de xarxa damunt d'un cel serè, les tres
   * textures baixades i cap dibuixada. El subarbre amagat segueix tenint estil
   * calculat, i l'estil calculat porta un `background-image`.
   *
   * Són 149 kB, i els cels serens són la majoria dels dies de l'any. Així que
   * la capa no existeix: es decideix aquí i el component no la renderitza.
   */
  const VISIBLE = 0.004;

  return (
    <div
      className="relative -mx-5 -mt-8 mb-6 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-2xl"
      style={{
        /*
         * Un color pla a sota, i després el degradat.
         *
         * El degradat porta `color-mix()` per barrejar les dues franges de
         * llum veïnes. Si un navegador no l'entén, la declaració sencera queda
         * invàlida i el fons desapareix — i el que quedaria és **text blanc
         * damunt de blanc**, que és pitjor que qualsevol cel. Amb un color
         * sòlid a sota, el pitjor cas és un cel d'un sol to.
         */
        backgroundColor: 'oklch(42% 0.09 250)',
        backgroundImage: sky.skyGradient,
      }}
    >
      {/* ── El cel ─────────────────────────────────────────────────────── */}
      <div aria-hidden className="absolute inset-0" style={{ backgroundImage: sky.skyGradient }} />

      {/* La dispersió del sol va **darrere** dels núvols, com passa de veritat. */}
      {sky.sunVisible && (
        <div
          aria-hidden
          className="absolute h-0 w-0"
          style={{ left: sky.bodyLeft, top: sky.bodyTop }}
        >
          <div
            className="absolute rounded-full"
            style={{ inset: -230, background: `radial-gradient(circle, ${sky.sunScatter} 0%, transparent 64%)` }}
          />
        </div>
      )}

      {Number(sky.starOpacity) > 0.01 && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            opacity: Number(sky.starOpacity),
            backgroundImage: Array(9).fill('radial-gradient(circle, oklch(99% 0 0) 0%, transparent 100%)').join(','),
            backgroundSize: '3px 3px, 2px 2px, 4px 4px, 2px 2px, 3px 3px, 3px 3px, 2px 2px, 3px 3px, 2px 2px',
            backgroundPosition: '12% 14%, 27% 8%, 41% 22%, 58% 11%, 71% 26%, 84% 16%, 19% 33%, 63% 38%, 91% 31%',
            backgroundRepeat: 'no-repeat',
          }}
        />
      )}

      {sky.moonVisible && (
        <div
          aria-hidden
          className="cel-anim absolute"
          style={{
            left: sky.bodyLeft, top: sky.bodyTop, width: 76, height: 76, margin: '-38px 0 0 -38px',
            animation: 'cel-twinkle 9s ease-in-out infinite',
          }}
        >
          <div
            className="absolute rounded-full"
            style={{ inset: -34, background: 'radial-gradient(circle, oklch(92% 0.04 250 / 0.42) 0%, oklch(88% 0.05 250 / 0.14) 42%, transparent 70%)' }}
          />
          <svg viewBox="0 0 76 76" width="76" height="76" className="relative block">
            <circle cx="38" cy="38" r="24" fill="oklch(88% 0.03 250)" opacity="0.2" />
            <path d={sky.moonPath} fill="oklch(99% 0.015 100)" />
          </svg>
        </div>
      )}

      {sky.sunVisible && (
        <div
          aria-hidden
          className="cel-anim absolute"
          style={{
            left: sky.bodyLeft, top: sky.bodyTop, width: 84, height: 84, margin: '-42px 0 0 -42px',
            opacity: Number(sky.sunOpacity),
            animation: 'cel-swell 13s ease-in-out infinite',
          }}
        >
          <div className="absolute rounded-full" style={{ inset: -86, background: `radial-gradient(circle, ${sky.sunBloom} 0%, transparent 60%)` }} />
          <div
            className="cel-anim absolute"
            style={{
              inset: -64,
              background: `conic-gradient(from 0deg, transparent 0deg, ${sky.sunRay} 16deg, transparent 38deg, transparent 92deg, ${sky.sunRay} 106deg, transparent 128deg, transparent 182deg, ${sky.sunRay} 196deg, transparent 218deg, transparent 272deg, ${sky.sunRay} 286deg, transparent 308deg)`,
              animation: 'cel-flare 34s linear infinite',
              filter: 'blur(11px)',
            }}
          />
          {/* El reguerol anamòrfic: és el que fa que sembli llum i no un cercle groc. */}
          <div
            className="absolute"
            style={{
              left: -170, right: -170, top: '50%', height: 6, marginTop: -3,
              background: `linear-gradient(90deg, transparent 0%, ${sky.sunStreak} 26%, ${sky.sunStreak} 74%, transparent 100%)`,
              filter: 'blur(3.5px)',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{ inset: 20, background: 'radial-gradient(circle, oklch(100% 0 0) 0%, oklch(100% 0 0) 36%, oklch(98% 0.07 92 / 0.8) 62%, transparent 100%)', filter: 'blur(1.2px)' }}
          />
        </div>
      )}

      {/* El vel de nuvolositat: el que fa que un cel de pluja sigui fosc. */}
      <div aria-hidden className="absolute inset-0" style={{ opacity: Number(sky.veilOpacity), backgroundImage: sky.veilImage }} />

      {/* ── Les textures ───────────────────────────────────────────────── */}
      {sky.wispOpacity > VISIBLE && (
        <div aria-hidden className="absolute overflow-hidden" style={{ left: 0, right: 0, top: '-2%', height: '48%', filter: sky.cloudFilter, opacity: sky.wispOpacity }}>
          <div className="cel-anim absolute inset-0" style={{ backgroundImage: 'url(/cel/wisps.webp)', backgroundSize: '1280px 100%', backgroundRepeat: 'repeat-x', animation: 'cel-wisps 320s linear infinite' }} />
        </div>
      )}
      {sky.cloudFarOpacity > VISIBLE && (
        <div aria-hidden className="absolute overflow-hidden" style={{ left: 0, right: 0, top: 0, height: '62%', filter: sky.cloudFilter, opacity: sky.cloudFarOpacity }}>
          <div className="cel-anim absolute inset-0" style={{ backgroundImage: 'url(/cel/cumulus.webp)', backgroundSize: '900px 100%', backgroundRepeat: 'repeat-x', animation: 'cel-far 210s linear infinite' }} />
        </div>
      )}
      {sky.cloudNearOpacity > VISIBLE && (
        <div aria-hidden className="absolute overflow-hidden" style={{ left: 0, right: 0, top: '-12%', height: '82%', filter: sky.cloudFilterNear, opacity: sky.cloudNearOpacity }}>
          <div className="cel-anim absolute inset-0" style={{ backgroundImage: 'url(/cel/cumulus.webp)', backgroundSize: '1900px 100%', backgroundRepeat: 'repeat-x', animation: 'cel-near 95s linear infinite' }} />
        </div>
      )}
      {sky.overcastOpacity > VISIBLE && (
        <div aria-hidden className="absolute overflow-hidden" style={{ left: 0, right: 0, top: '-8%', height: '80%', filter: sky.cloudFilterNear, opacity: sky.overcastOpacity }}>
          <div className="cel-anim absolute inset-0" style={{ backgroundImage: 'url(/cel/overcast.webp)', backgroundSize: '1280px 100%', backgroundRepeat: 'repeat-x', animation: 'cel-sheet 150s linear infinite' }} />
        </div>
      )}

      {sky.thunder && (
        <div
          aria-hidden
          className="cel-anim absolute inset-0"
          style={{
            opacity: 0,
            background: 'radial-gradient(120% 74% at 64% 2%, oklch(99% 0.015 250 / 0.95) 0%, oklch(92% 0.04 250 / 0.42) 26%, transparent 62%)',
            animation: 'cel-bolt 9s linear infinite',
          }}
        />
      )}

      {drawsRain(sky) && (
        <div
          aria-hidden
          className="absolute inset-0 overflow-hidden"
          style={{
            opacity: Number(sky.rainOpacity),
            maskImage: 'linear-gradient(to bottom, transparent 0%, oklch(0% 0 0) 20%, oklch(0% 0 0) 84%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, oklch(0% 0 0) 20%, oklch(0% 0 0) 84%, transparent 100%)',
          }}
        >
          {/* Quatre velocitats és el mínim per no veure-hi el patró; les dues
              més ràpides van desenfocades perquè passen a prop de l'objectiu. */}
          <div className="cel-anim absolute" style={{ inset: '-20% -30%', animation: 'cel-rain 1.7s linear infinite', backgroundImage: `repeating-linear-gradient(${sky.rainAngle[0]}, transparent 0 15px, oklch(92% 0.015 240 / 0.14) 15px 16px, transparent 16px 31px)`, backgroundSize: '210px 760px' }} />
          <div className="cel-anim absolute" style={{ inset: '-20% -30%', animation: 'cel-rain 1.1s linear infinite', backgroundImage: `repeating-linear-gradient(${sky.rainAngle[1]}, transparent 0 9px, oklch(95% 0.012 240 / 0.24) 9px 10px, transparent 10px 23px)`, backgroundSize: '160px 640px' }} />
          <div className="cel-anim absolute" style={{ inset: '-20% -30%', filter: 'blur(0.7px)', animation: 'cel-rain 0.7s linear infinite', backgroundImage: `repeating-linear-gradient(${sky.rainAngle[1]}, transparent 0 17px, oklch(97% 0.01 240 / 0.4) 17px 18.5px, transparent 18.5px 37px)`, backgroundSize: '230px 840px' }} />
          <div className="cel-anim absolute" style={{ inset: '-20% -30%', filter: 'blur(2.4px)', animation: 'cel-rain 0.42s linear infinite', backgroundImage: `repeating-linear-gradient(${sky.rainAngle[2]}, transparent 0 34px, oklch(99% 0.006 240 / 0.55) 34px 37px, transparent 37px 74px)`, backgroundSize: '320px 1020px' }} />
        </div>
      )}

      {drawsSnow(sky) && (
        <div
          aria-hidden
          className="absolute inset-0 overflow-hidden"
          style={{
            opacity: Number(sky.snowOpacity),
            maskImage: 'linear-gradient(to bottom, transparent 0%, oklch(0% 0 0) 16%, oklch(0% 0 0) 88%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, oklch(0% 0 0) 16%, oklch(0% 0 0) 88%, transparent 100%)',
          }}
        >
          <div className="cel-anim absolute" style={{ inset: '-24%', animation: 'cel-snow-a 17s linear infinite', backgroundRepeat: 'repeat', backgroundImage: 'radial-gradient(circle, oklch(100% 0 0 / 0.6) 0%, oklch(100% 0 0 / 0.6) 5%, transparent 11%), radial-gradient(circle, oklch(100% 0 0 / 0.42) 0%, oklch(100% 0 0 / 0.42) 4%, transparent 9%)', backgroundSize: '37px 37px, 59px 59px' }} />
          <div className="cel-anim absolute" style={{ inset: '-24%', filter: 'blur(0.5px)', animation: 'cel-snow-b 11s linear infinite', backgroundRepeat: 'repeat', backgroundImage: 'radial-gradient(circle, oklch(100% 0 0 / 0.85) 0%, oklch(100% 0 0 / 0.85) 5%, transparent 11%), radial-gradient(circle, oklch(100% 0 0 / 0.62) 0%, oklch(100% 0 0 / 0.62) 4%, transparent 9%)', backgroundSize: '53px 53px, 79px 79px' }} />
          <div className="cel-anim absolute" style={{ inset: '-24%', filter: 'blur(1.5px)', animation: 'cel-snow-c 6.5s linear infinite', backgroundRepeat: 'repeat', backgroundImage: 'radial-gradient(circle, oklch(100% 0 0 / 0.95) 0%, oklch(100% 0 0 / 0.95) 4.5%, transparent 10%), radial-gradient(circle, oklch(100% 0 0 / 0.7) 0%, oklch(100% 0 0 / 0.7) 3.5%, transparent 8%)', backgroundSize: '89px 89px, 121px 121px' }} />
        </div>
      )}

      {/*
        La silueta del relleu.

        És decoració i va marcada com a tal: és el mateix retall per a tot
        Catalunya, no l'horitzó d'aquest poble, i fer-lo passar per l'horitzó
        del lloc seria dibuixar el que no sabem. El que fa és donar-li un terra
        al cel perquè no acabi en una ratlla recta.
      */}
      <div
        aria-hidden
        className="absolute"
        style={{
          left: 0, right: 0, bottom: 0, height: 140,
          backgroundImage: 'url(/relleu-v1.png)',
          backgroundSize: '1120px auto',
          backgroundPosition: '-160px -452px',
          backgroundRepeat: 'no-repeat',
          filter: 'brightness(0.26) contrast(1.45) saturate(0)',
          opacity: 0.74,
          maskImage: 'linear-gradient(to top, oklch(0% 0 0) 45%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, oklch(0% 0 0) 45%, transparent 100%)',
        }}
      />

      {/*
        El vel de contrast, i el perquè de cada parada.

        **No s'aprima cap amunt** fins a l'última franja: les textures de núvol
        són clares i van per la part alta, que és on hi ha el topònim. Si es
        toca, s'ha de tornar a mesurar — no amb una captura, que agafa un sol
        fotograma d'unes textures que es mouen.
      */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to top, oklch(17% 0.02 250 / 0.74) 0%, oklch(18% 0.024 250 / 0.66) 40%, oklch(19% 0.028 250 / 0.56) 72%, oklch(20% 0.03 250 / 0.5) 92%, oklch(21% 0.03 250 / 0.22) 100%)',
        }}
      />

      {/*
        I un segon vel, **en píxels i no en percentatge**, només a dalt.

        El vel de sobre es mesura en tant per cent de l'alçada del titular, i a
        l'última franja cedeix fins a 0,22 perquè allà hi va la barra de
        navegació, que ja porta vidre fosc propi. Aquí, en canvi, a dalt de tot
        hi ha la **ruta de navegació**: dotze píxels, o sigui text petit, que
        demana 4,5:1. Mesurat al navegador, cau al 6 % de l'alçada, dins
        d'aquella franja fluixa, i amb un núvol blanc opac al darrere es queda
        en 4,17:1.

        El primer intent va ser apujar el vel sencer fins a 0,54, i **va
        arreglar el contrast i es va carregar el cel**: amb els dotze estats
        posats de costat, un migdia de juliol i un vespre de novembre plovent
        es veien igual de foscos. Un fons que no distingeix el temps no serveix
        de res, que és justament el motiu de calcular-lo.
        
        Així que el reforç va aquí i en píxels: tapa els primers 150, es fon als
        300 i no toca la resta del cel. En píxels perquè el text de dalt sempre
        és als mateixos píxels de dalt; en percentatge, un titular més alt
        —una nota d'estació llarga— el faria caure en una franja més fluixa.
      */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{
          height: 300,
          background: 'linear-gradient(to bottom, oklch(17% 0.02 250 / 0.30) 0px, oklch(17% 0.02 250 / 0.26) 150px, transparent 300px)',
        }}
      />

      {/* ── El que es llegeix ──────────────────────────────────────────── */}
      <div className="relative px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-8" style={{ color: 'oklch(99% 0 0)' }}>
        <nav aria-label="Ruta de navegació" className="text-[12px] uppercase tracking-[0.08em]">
          <ol className="flex flex-wrap items-center gap-x-1.5">
            {/* L'últim element de la ruta és aquesta mateixa pàgina i el seu
                nom ja és el titular de sota: no s'escriu dues vegades. I el
                separador va **davant** i no darrere, o l'últim en deixa un
                penjat al final. */}
            {breadcrumbs.slice(0, -1).map((b, i) => (
              <li key={b.path} className="flex items-center gap-x-1.5">
                {i > 0 && <span aria-hidden className="opacity-60">›</span>}
                <Link href={b.path} className="no-underline opacity-90 hover:opacity-100" style={{ color: 'inherit' }}>
                  {b.nom}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <h1 className="mt-1.5 text-[34px] font-semibold leading-tight tracking-[-0.025em] sm:text-5xl">
          {loc.nom}
        </h1>
        <p className="mt-0.5 text-[13px] opacity-90">
          {loc.level !== 'municipi' && breadcrumbs.length > 2 && `${breadcrumbs[breadcrumbs.length - 2].nom} · `}
          {comarcaLabel}
          {loc.altitud != null && ` · ${loc.altitud} m`}
          {loc.poblacio != null && loc.poblacio > 0 && ` · ${loc.poblacio.toLocaleString('ca-ES')} hab.`}
        </p>

        {whole != null ? (
          <div className="mt-3 flex items-start gap-0.5">
            <span className="tnum text-[92px] font-light leading-[0.86] tracking-[-0.06em] sm:text-[118px]">
              {whole}
            </span>
            <span className="mt-2 text-[26px] font-light sm:text-3xl">,{decimal}°</span>
          </div>
        ) : (
          <p className="mt-4 text-lg opacity-90">Encara no hi ha observació per a aquest punt.</p>
        )}

        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 text-[17px] font-medium">
          {condition && <span>{condition}</span>}
          {today?.tMax != null && today?.tMin != null && (
            <span className="tnum opacity-90">
              · màx. {Math.round(today.tMax)}° mín. {Math.round(today.tMin)}°
            </span>
          )}
        </div>
        {/*
          La sensació, amb la causa quan es pot comprovar.

          «Sensació de 39°» sota un 32 no diu si és la humitat, el vent o el
          sol, i són tres coses que es porten diferent: de la xafogor s'escapa a
          l'ombra i del vent no. La comprovació és a `feelsCause()` i quan no en
          surt cap, no s'escriu la frase — que és el que ja feia la fitxa abans
          del redisseny i no es perd en el canvi.
        */}
        {(() => {
          const cause = current?.apparent != null && t != null
            ? feelsCause(t, current.apparent, current.windSpeed ?? null)
            : null;
          const feels = cause && current?.apparent != null
            ? cause === 'xafogor'
              ? `Xafogor: amb la humitat, se'n noten ${current.apparent.toFixed(0)}°`
              : cause === 'vent'
                ? `Amb el vent, se'n noten ${current.apparent.toFixed(0)}°`
                : `Sensació de ${current.apparent.toFixed(0)}°`
            : null;
          const wind = current?.windSpeed != null
            ? `vent ${msToKmh(current.windSpeed).toFixed(0)} km/h${
              current.windDirection != null ? ` del ${windCardinal(current.windDirection)}` : ''}`
            : null;
          if (!feels && !wind) return null;
          // Amb la sensació davant, el vent hi va en minúscula; sense ella, el
          // vent obre la frase i li toca la majúscula.
          const line = feels ? `${feels} · ${wind ?? ''}`.replace(/ · $/, '') : `V${wind!.slice(1)}`;
          return <p className="mt-1 text-sm opacity-85">{line}</p>;
        })()}

        {/*
          D'on surt el número, damunt de vidre fosc i no de blanc translúcid:
          ha d'aguantar un cel de migdia al darrere.

          Això no és una nota al peu: és el que distingeix el lloc. Estació,
          distància, desnivell i hora de la lectura, a la mateixa alçada que la
          xifra que en surt.
        */}
        {current && (
          <div
            className="mt-4 flex items-start gap-2.5 rounded-2xl px-3.5 py-3"
            style={{ background: 'oklch(20% 0.02 250 / 0.42)', backdropFilter: 'blur(10px)' }}
          >
            <span
              aria-hidden
              className="mt-[5px] size-[7px] shrink-0 rounded-full"
              style={{ background: current.ageMin <= 90 ? 'oklch(85% 0.16 145)' : 'oklch(83% 0.15 95)' }}
            />
            <p className="m-0 text-[12px] leading-relaxed">
              Mesurat a l&apos;estació{' '}
              <Link
                href={`/estacions/${current.station.codi}`}
                className="font-semibold underline decoration-1 underline-offset-2"
                style={{ color: 'inherit' }}
              >
                {deName(current.station.nom)}
              </Link>
              , a {num(current.station.distKm, 1)} km
              {current.station.dAltM != null && ` i ${signed(current.station.dAltM, 0, 'm')} de desnivell`}
              {' · '}{ago(current.ageMin)}
              {current.provisional && ' · lectura provisional'}
              {' · '}{current.source}.
              {corrected && current.temperature != null && (
                <> Temperatura corregida pel desnivell: l&apos;estació marca {num(current.temperature, 1)} °C
                  {' '}a {loc.altitud != null && current.station.dAltM != null ? loc.altitud - current.station.dAltM : '?'} m.
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
