import Link from 'next/link';
import { int, num, ordinal } from '@/lib/format';
import type { RainConditions } from '@/lib/conditions';
import type { RainProgress } from '@/lib/climate-math';
import type { StationRef } from '@/lib/territory';

/**
 * L'aigua que ha caigut, i quan.
 *
 * ## Per què això és una fitxa i no una pàgina de país
 *
 * Perquè existia com a pàgina de país —`/bolets`— i el que hi sortia a dalt
 * era «on més ha plogut aquests quinze dies és a Torredembarra». El número era
 * correcte i la lectura, absurda: ordenar les 189 estacions de la XEMA per
 * pluja acumulada no dona les millors zones de bolets, dona on hi ha
 * pluviòmetres i on va descarregar l'última tempesta. Ordenar **aparells**
 * quan la pregunta és sobre **boscos** és un error de concepte, no de dades.
 *
 * La pregunta es fa d'un lloc concret —«puc anar a buscar-ne aquí?»— i per això
 * la resposta va a la fitxa d'aquell lloc, amb l'estació que la mesura dita pel
 * seu nom, la seva distància i el seu desnivell.
 *
 * ## I per què no diu si hi haurà bolets
 *
 * Perquè no ho sabem. No hi ha cap índex ni cap nota del zero al deu: hi ha
 * l'aigua que ha caigut, quan va caure i amb quines temperatures. Són les tres
 * dades que fa servir qui hi entén, cadascuna es pot comprovar per separat, i
 * la conclusió la treu el lector.
 *
 * El que no es fa és tapar forats. **Un dia sense dada no és un dia sec**: si
 * l'estació no ha mesurat, l'acumulat es queda curt i el bloc ho diu en comptes
 * de sumar un zero.
 */
export function RainBlock({
  conditions, station, stationHref, ytd,
}: {
  conditions: RainConditions;
  station: StationRef;
  stationHref?: string;
  /**
   * L'acumulat de l'any contra el dels altres anys a la mateixa data.
   *
   * Nul quan la sèrie no arriba a deu anys comparables o quan a l'any en curs
   * li falta més d'un 10 % dels dies: una suma a la qual li falten dies surt
   * curta, sempre cap avall, i «va sec» seria una conclusió de l'avería.
   */
  ytd?: RainProgress | null;
}) {
  const c = conditions;

  /*
   * «No consta» no serveix per a les dues coses.
   *
   * Deia «no consta» tant quan un dia sense dada tallava el compte com quan
   * s'havia pogut mirar tota la finestra i no hi havia cap dia de més de 5 mm.
   * A Tàrrega, amb 8,1 mm en trenta dies escampats en plugim, la resposta bona
   * no era «no ho sabem»: era «fa més de quaranta dies», que és exactament el
   * que vol saber qui ho mira. Es distingeixen amb `dryDaysChecked`, que diu
   * fins on s'ha pogut mirar enrere.
   */
  const lastShower = c.daysSinceRain != null
    ? (c.daysSinceRain === 0 ? 'avui' : `fa ${c.daysSinceRain} ${c.daysSinceRain === 1 ? 'dia' : 'dies'}`)
    : c.dryDaysChecked >= 15
      ? `fa més de ${c.dryDaysChecked} dies`
      : 'no consta';

  return (
    <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">15 dies</dt>
          <dd className="tnum text-xl font-semibold text-[var(--ink)]">
            {num(c.rain15, 1)}
            <span className="ml-1 text-xs font-normal text-[var(--muted)]">mm</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">30 dies</dt>
          <dd className="tnum text-xl font-semibold text-[var(--ink)]">
            {num(c.rain30, 1)}
            <span className="ml-1 text-xs font-normal text-[var(--muted)]">mm</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Últim ruixat</dt>
          <dd className="text-xl font-semibold text-[var(--ink)]">{lastShower}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
            Mín. i màx. de 10 dies
          </dt>
          <dd className="tnum text-xl font-semibold text-[var(--ink)]">
            {c.tMinAvg10 != null && c.tMaxAvg10 != null
              ? `${num(c.tMinAvg10, 1)} / ${num(c.tMaxAvg10, 1)} °C`
              : '—'}
          </dd>
        </div>
      </dl>

      {c.frostRecently && (
        <p className="mt-3 text-sm text-[var(--ink-2)]">
          Hi ha glaçat en els últims deu dies.
        </p>
      )}

      {/*
        L'avís de sèrie incompleta va aquí i no en lletra petita: canvia el que
        volen dir els dos números de dalt. «Un dia sense dada no és un zero» és
        la mateixa regla que va donar 398 dies sense pluja al Port de Barcelona,
        que no té pluviòmetre.
      */}
      {c.days15 < 15 && (
        <p className="mt-3 text-sm text-[var(--ink-2)]">
          L&apos;estació té dada de {c.days15} dels últims quinze dies, així que
          l&apos;acumulat es queda curt: els dies que falten no compten com a secs.
        </p>
      )}

      {/*
        L'any, que és l'única finestra on la pluja diu alguna cosa.

        Quinze i trenta dies contesten «puc anar a buscar bolets»; no contesten
        «va sec, això?». Per a això calen els mil·límetres que porta l'any
        comparats amb els que en portaven els altres **a la mateixa data**, que
        no és el mateix que la mitjana anual: dir el setembre que hi solen caure
        480 mm i en portem 312 convida a llegir-hi un dèficit de 168 que no
        existeix, perquè encara falten l'octubre i el novembre. El càlcul és de
        `rainProgressOf`, al worker, que és on hi ha la sèrie sencera.
      */}
      {ytd && (
        <div className="mt-4 border-t border-[var(--line-soft)] pt-3">
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">
            De l&apos;1 de gener n&apos;han caigut{' '}
            <strong className="tnum font-semibold text-[var(--ink)]">{int(ytd.precip)} mm</strong>,
            quan a aquestes altures de l&apos;any se&apos;n solen portar {int(ytd.normal)}.{' '}
            {ytd.rank === 1
              ? `És l'any més plujós dels ${ytd.total} de la sèrie.`
              : ytd.rank === ytd.total
                ? `És l'any més sec dels ${ytd.total} de la sèrie.`
                : `És el ${ordinal(ytd.rank)} més plujós de ${ytd.total}.`}
            {ytd.rank !== 1 && ytd.rank !== ytd.total && (
              ` De més a menys, la sèrie va dels ${int(ytd.wettest.precip)} mm del `
              + `${ytd.wettest.year} als ${int(ytd.driest.precip)} del ${ytd.driest.year}.`
            )}
          </p>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        Mesurada a l&apos;estació de{' '}
        {stationHref
          ? (
            <Link href={stationHref} className="font-medium text-[var(--ink-2)] no-underline hover:underline">
              {station.nom}
            </Link>
          )
          : <strong className="font-medium text-[var(--ink-2)]">{station.nom}</strong>},
        a {num(station.distKm, 1)} km
        {station.dAltM != null && Math.abs(station.dAltM) >= 25
          && ` i ${station.dAltM > 0 ? '' : '−'}${Math.abs(station.dAltM)} m de desnivell`}.
        Una tempesta descarrega en una vall i no a la del costat: això situa, no
        substitueix el que hagi caigut aquí.
      </p>
    </div>
  );
}
