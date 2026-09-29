import type { Narrative } from '@/lib/narrative';

/**
 * El resum del dia, en català i en una targeta: el que vol dir el número gran.
 *
 * La primera frase va en negreta perquè és la resposta —«Avui, tempesta.»— i la
 * resta la matisa: què passarà amb la pluja, com va respecte d'ahir, què fa
 * demà. Les advertències amb llindar citable —glaçada, UV, vent dur— van al
 * final i en prosa, com la resta del lloc.
 *
 * ## Per què ja no hi ha la tira de franges
 *
 * «Avui a la tarda · Avui a la nit · Demà a la matinada» deia el mateix que la
 * tira de les pròximes hores, just a sota, amb menys resolució. Al redisseny
 * del 29 de setembre de 2026 es va quedar una sola manera d'ensenyar les
 * pròximes hores. Les franges segueixen al feed JSON (`day_parts`), on sí que
 * són útils per a qui les vol reaprofitar.
 */
export function Headline({ narrative }: { narrative: Narrative }) {
  const { today, change, tomorrow, vsYesterday, notes } = narrative;
  const more = [vsYesterday, tomorrow].filter(Boolean).join(' ');

  return (
    <section className="card summary" aria-label="Resum del dia">
      <p className="summary-lead">
        <strong>{today}</strong>
        {change && <> {change}</>}
      </p>
      {more && <p className="summary-more">{more}</p>}
      {notes.length > 0 && <p className="summary-notes">{notes.join(' ')}</p>}
    </section>
  );
}
