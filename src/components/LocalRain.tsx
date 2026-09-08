import Link from 'next/link';
// La preposició no es concatena a mà: en català l'article és del topònim i es
// contreu —«de el Prat» és una falta visible—. Ver `format.ts`.
import { deName, hour } from '@/lib/format';
import type { TileGrid } from '@/lib/mercator';
import type { FieldIndex } from '@/lib/field';
import { ASPECT, HALF_KM, windowOf, type LocalRainFrame } from '@/lib/local-rain';

/**
 * Cap on va la pluja, vista des d'aquest poble.
 *
 * ## Què contesta, que la resta de la fitxa no contesta
 *
 * La fitxa ja diu si plourà aquí i quant, hora a hora, i ho diu **millor que
 * cap mapa**: el punt de predicció és el d'aquest poble, mentre que el camp del
 * radar és aquella mateixa predicció escampada en una malla de 3,2 km. En
 * xifres no hi ha res a guanyar.
 *
 * El que les xifres no poden ensenyar és **el moviment**. Quatre imatges
 * seguides —on és ara, i on serà d'aquí a una, dues i tres hores— diuen si
 * allò que hi ha a trenta quilòmetres ve cap aquí o se'n va, i aquesta és la
 * pregunta que porta algú a mirar un radar des de la fitxa del seu poble.
 *
 * ## Quatre mapes petits i no un d'animat
 *
 * Perquè seguits es comparen d'un cop d'ull, i animats s'han de recordar. I
 * perquè no costen ni un radi amagat ni una regla de `:checked`: són quatre
 * `<svg>` estàtics, i el que es mou dins d'un mapa animat aquí es mou pels
 * ulls de qui mira.
 *
 * ## El que pesa, i per què pesa poc
 *
 * La imatge del camp de cada hora és **una per a tot el país** —la retalla el
 * `viewBox`— així que és la mateixa que ja demana `/radar` i la mateixa per a
 * les 4.293 fitxes. De radar només s'hi posen les tessel·les que toquen la
 * finestra: en un mosaic de 2 × 2 que cobreix 234 km cadascuna, normalment
 * n'és una.
 *
 * ## I per què no surt sempre
 *
 * Perquè la immensa majoria dels dies seria un requadre buit. Només es dibuixa
 * quan la predicció d'aquest punt dona pluja a les pròximes hores: la decisió
 * és de qui el crida, i el motiu és que un mapa de pluja sense pluja no és
 * informació, és soroll a 4.293 pàgines.
 */

export function LocalRain({
  frames, grid, tiles, fieldBox, terrain, paths, lat, lon, nom, zoneKey,
}: {
  frames: LocalRainFrame[];
  grid: TileGrid;
  tiles: Array<{ x: number; y: number }>;
  fieldBox: FieldIndex['box'] | null;
  terrain: { src: string; x: number; y: number; w: number; h: number };
  /** Els contorns de les comarques, ja projectats al mosaic. */
  paths: string[];
  lat: number;
  lon: number;
  nom: string;
  /** La zona del radar on cau el poble, per a l'enllaç del peu. */
  zoneKey: string | null;
}) {
  if (!frames.length) return null;

  /*
   * La finestra la calcula `windowOf()`, la mateixa que ha triat les fronteres
   * que arriben. Amb dos càlculs, un dia s'enviarien les d'un tros i es
   * retallaria un altre, i el mapa sortiria amb fronteres a mitges.
   */
  const view = windowOf(grid, lat, lon);
  const { cx, cy } = view;

  /** Un identificador per fitxa: quatre quadres reutilitzen un sol dibuix. */
  const outlineId = `lr-${Math.round(cx)}-${Math.round(cy)}`;

  /*
   * Només les tessel·les que toquen la finestra.
   *
   * Cada una cobreix 234 km, així que d'un mosaic de quatre normalment n'hi
   * entra una i de vegades dues. Posar-les totes quatre serien tres imatges
   * per marc que el `viewBox` retalla senceres.
   */
  const near = tiles.filter((t) => {
    const tx = (t.x - grid.x0) * grid.size;
    const ty = (t.y - grid.y0) * grid.size;
    return tx < view.x + view.w && tx + grid.size > view.x
      && ty < view.y + view.h && ty + grid.size > view.y;
  });

  return (
    <figure className="m-0">
      {/*
        Les fronteres del tros, definides un cop.

        Només les que toquen la finestra: les 43 comarques senceres són 320 kB
        de coordenades, i quatre còpies d'això afegien 247 kB en gzip a una
        fitxa que en pesa 72. És la regla de sempre —una pàgina es baixa bytes
        en proporció al que ensenya— i aquí ensenya cent quilòmetres.
      */}
      <svg width={0} height={0} aria-hidden className="absolute">
        <defs>
          <g id={outlineId} fill="none" stroke="oklch(99% 0 0)" strokeWidth={1.2} opacity={0.65}>
            {paths.map((d, i) => <path key={i} d={d} />)}
          </g>
        </defs>
      </svg>

      <div className="scroll-x">
        <ol className="flex min-w-max gap-2">
          {frames.map((f) => (
            <li key={f.time} className="w-[13.5rem] shrink-0">
              <p className="mb-1 flex items-baseline gap-1.5 text-xs">
                <span className="tnum font-semibold text-[var(--ink)]">{hour(f.local)}</span>
                <span className="text-[var(--muted)]">
                  {f.kind === 'past' ? 'radar' : 'predicció'}
                </span>
              </p>
              <svg
                viewBox={`${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`}
                width="100%"
                role="img"
                aria-label={
                  f.kind === 'past'
                    ? `Radar al voltant ${deName(nom)} a ${hour(f.local)}`
                    : `Pluja prevista al voltant ${deName(nom)} a ${hour(f.local)}`
                }
                className="block rounded-md border border-[var(--line-soft)]"
                style={{ background: 'var(--surface-2)', aspectRatio: String(ASPECT) }}
              >
                {/* El relleu, per endevinar on cau la pluja respecte de les
                    serralades. És la mateixa imatge de sempre i el `viewBox`
                    la retalla: no costa cap petició nova. */}
                <image
                  className="relief"
                  href={terrain.src}
                  x={terrain.x} y={terrain.y} width={terrain.w} height={terrain.h}
                />

                {f.field && fieldBox ? (
                  <image
                    href={`/camp/${f.field}.webp`}
                    x={fieldBox.x} y={fieldBox.y} width={fieldBox.w} height={fieldBox.h}
                  />
                ) : (
                  near.map((t) => (
                    <image
                      key={`${t.x}_${t.y}`}
                      href={`/radar/t/${f.time}/${grid.z}_${t.x}_${t.y}.png`}
                      x={(t.x - grid.x0) * grid.size}
                      y={(t.y - grid.y0) * grid.size}
                      width={grid.size}
                      height={grid.size}
                    />
                  ))
                )}

                {/* Les fronteres, una sola vegada al document i quatre usos.
                    Repetides a cada quadre eren quatre còpies del mateix
                    marcatge; el `<use>` les referència i prou. */}
                <use href={`#${outlineId}`} />

                {/* El punt del poble, que és tot el sentit d'aquest mapa: la
                    pluja es mira **respecte d'ell**. Amb halo fosc a sota,
                    perquè sobre blau intens un punt blanc desapareix. */}
                <circle cx={cx} cy={cy} r={4.2} fill="oklch(20% 0.02 250)" opacity={0.85} />
                <circle cx={cx} cy={cy} r={2} fill="oklch(99% 0 0)" />
              </svg>
            </li>
          ))}
        </ol>
      </div>

      <figcaption className="mt-2 max-w-[65ch] text-xs leading-relaxed text-[var(--muted)]">
        El punt blanc és {nom}, i cada quadre fa {HALF_KM * 2} km d&apos;ample. El
        primer és radar —gotes mesurades— i els altres, predicció.
        {/*
          El primer quadre sol tenir més color que els altres, i sense dir per
          què es llegeix com que la pluja s'està acabant. Mesurat al Portús: 17 %
          de la finestra amb eco de radar i 1,8 % amb pluja prevista, a la
          mateixa hora. No es contradiuen —mesuren coses diferents— però qui
          ho mira no té per què saber-ho.
        */}{' '}
        Un radar veu gotes a l&apos;aire, també les que s&apos;evaporen abans de
        tocar terra, i per això el primer quadre acostuma a tenir més color que
        els altres: no vol dir que la pluja se&apos;n vagi.{' '}
        Per saber quanta pluja caurà aquí i a quina hora, les xifres de més
        amunt ho diuen millor que aquests mapes: surten del punt de predicció
        d&apos;aquest poble i no d&apos;una malla de 3,2 km. El que això ensenya
        és cap on va.
        {zoneKey && (
          <>
            {' '}
            <Link href={`/radar?zona=${zoneKey}`} className="text-[var(--ink-2)] no-underline hover:underline">
              El radar sencer, amb les dues hores anteriors ›
            </Link>
          </>
        )}
      </figcaption>
    </figure>
  );
}
