'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * La línia de temps del radar, arrossegable.
 *
 * ## Què fa i què no toca
 *
 * No dibuixa cap marc ni n'amaga cap. El radar segueix funcionant amb els
 * radios amagats i les regles de `:checked` de `globals.css` —això no ha
 * canviat— i això només **marca el radio que toca** mentre s'arrossega. Si el
 * JavaScript no arriba, el que hi ha és el que hi havia: la fila de pastilles
 * amb l'hora de cada marc, que són etiquetes d'aquells mateixos radios.
 *
 * Per això les pastilles no desapareixen del HTML: se n'amaguen amb una classe
 * que aquest component posa **en muntar-se**. Sense JavaScript la classe no hi
 * arriba mai i les pastilles es queden.
 *
 * ## Per què una barra i no tretze pastilles
 *
 * Perquè amb pastilles cal encertar-ne una per veure el marc següent, i mirar
 * com avança una tempesta vol dir clicar tretze vegades seguides. Arrossegant,
 * la seqüència es recorre endavant i endarrere a la velocitat que un vulgui,
 * que és com es mira un radar.
 *
 * La barra és un `<input type="range">` de veritat i no un `div` amb
 * `onPointerMove`: així les fletxes, l'inici i el final del teclat, i el gest
 * tàctil ja funcionen sense escriure'ls.
 *
 * ## Arrossegar atura la reproducció
 *
 * Perquè mentre l'animació corre, el marc que es veu el mana el CSS i no el
 * radio: sense aturar-la, la barra es mouria i la imatge no. El botó de
 * reproduir segueix sent una etiqueta i segueix funcionant sense JavaScript.
 *
 * ## El present, marcat
 *
 * Els marcs de RainViewer són observació (`past`) i predicció immediata
 * (`nowcast`), i la frontera entre les dues és **ara**. Va marcada a la barra
 * amb la seva etiqueta. Ara mateix l'API pública torna `nowcast: []` —zero
 * marcs de futur— així que la marca cau al final; el dia que en torni, la
 * barra ja té el tram de futur ombrejat i no cal tocar res.
 */

export interface ScrubFrame {
  time: number;
  /** Hora local, ja sense la `Z`. */
  local: string;
  kind: 'past' | 'nowcast' | 'forecast';
}

const hhmm = (local: string) => local.slice(11, 16);

export function RadarScrubber({
  frames, current,
}: {
  frames: ScrubFrame[];
  current: number;
}) {
  const [i, setI] = useState(current);
  const box = useRef<HTMLDivElement>(null);

  /*
   * Amaga les pastilles, que aquest component substitueix.
   *
   * La classe va a `.radar`, que és l'avi comú dels radios i de la barra. Es
   * posa des d'aquí i no al servidor perquè és la prova que el JavaScript ha
   * arribat: si no, les pastilles s'haurien amagat per a qui no en té.
   */
  useEffect(() => {
    const radar = box.current?.closest('.radar');
    radar?.classList.add('has-scrub');
    return () => radar?.classList.remove('has-scrub');
  }, []);

  // Marca el radio del marc triat, que és el que el CSS mira per ensenyar-lo.
  useEffect(() => {
    const f = frames[i];
    if (!f) return;
    const radio = document.getElementById(`rf-${f.time}`) as HTMLInputElement | null;
    if (radio && !radio.checked) radio.checked = true;
  }, [i, frames]);

  const stopPlaying = () => {
    const play = document.getElementById('rplay') as HTMLInputElement | null;
    if (play?.checked) play.checked = false;
  };

  const frame = frames[i] ?? frames[frames.length - 1];
  const lastPast = frames.map((f) => f.kind).lastIndexOf('past');
  const futureFrom = lastPast + 1;
  const span = Math.max(1, frames.length - 1);

  return (
    <div ref={box} className="mt-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="tnum text-xl font-semibold text-[var(--ink)]">{hhmm(frame.local)}</span>
        <span className="text-xs text-[var(--muted)]">
          {frame.kind === 'forecast'
            ? 'predicció, no radar'
            : frame.kind === 'nowcast'
              ? 'predicció immediata'
              : i === lastPast ? 'l’última imatge' : 'observació'}
        </span>
      </div>

      <div className="relative">
        {/* El tram de futur, ombrejat. Buit mentre l'API no en torni cap. */}
        {futureFrom < frames.length && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 rounded-r-full bg-[var(--accent-soft)]"
            style={{ left: `${(futureFrom / span) * 100}%`, right: 0 }}
          />
        )}
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          step={1}
          value={i}
          aria-label="Instant del radar"
          aria-valuetext={`${hhmm(frame.local)}, ${frame.kind === 'past' ? 'observació' : 'predicció'}`}
          onChange={(e) => { stopPlaying(); setI(Number(e.target.value)); }}
          className="rscrub relative w-full"
        />
      </div>

      <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
        <span className="tnum">{hhmm(frames[0].local)}</span>
        <span className="tnum">
          {hhmm(frames[lastPast]?.local ?? frame.local)} · ara
        </span>
        {futureFrom < frames.length && (
          <span className="tnum">{hhmm(frames[frames.length - 1].local)}</span>
        )}
      </div>
    </div>
  );
}
