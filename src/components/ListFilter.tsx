import type { ReactNode } from 'react';

/**
 * Acotar una lista larga sin recargar la página y sin JavaScript.
 *
 * ## Por qué no es una consulta al servidor
 *
 * El buscador de `/cerca` sí lo es —y ahí está escrito el porqué— pero eso es
 * otra cosa: allí se **busca** algo que no se sabe dónde está, y cada búsqueda
 * merece su dirección. Aquí se **acota** una lista que ya se está mirando.
 *
 * Y hacerlo con un `?comarca=` tendría un precio concreto: estas cuatro
 * páginas son estáticas con ISR, y leer `searchParams` en un componente de
 * servidor las vuelve dinámicas. `/bolets` y `/senderisme` se bajan el
 * histórico entero de las 189 estaciones —dos megas— para comparar unas con
 * otras, y pasarían de bajarlo una vez cada cuarto de hora a bajarlo en cada
 * petición. Ver `src/lib/shards.ts`.
 *
 * ## Por qué sin JavaScript
 *
 * Porque no hace falta. Un radio marcado y unas reglas de CSS ocultan las filas
 * que no toca, igual que las pestañas de `NextHours`: instantáneo, funciona con
 * el teclado y funciona sin JavaScript.
 *
 * ## Por qué va plegado
 *
 * Porque cuarenta y dos pastillas son cinco líneas antes del contenido, y lo
 * que la gente ha venido a ver es la tabla. Se abre con un clic — y se abre
 * sola cuando hay un filtro puesto, para que nunca se vea una tabla acotada sin
 * nada que diga por qué.
 *
 * ## Por qué solo salen los grupos que existen
 *
 * Porque cuarenta y tres pastillas de comarca son un muro, y en `/mar` solo hay
 * costa en diez. Cada página pasa los grupos que de verdad tiene, con cuántas
 * filas cae en cada uno.
 */

export interface FilterGroup {
  /** Clave que llevan las filas en `data-lf`. */
  key: string;
  label: string;
  count: number;
}

export function ListFilter({
  id, groups, legend, allLabel = 'Totes', children,
}: {
  /** Prefijo de los radios. Único en la página. */
  id: string;
  groups: FilterGroup[];
  legend: string;
  allLabel?: string;
  children: ReactNode;
}) {
  // Con un solo grupo no hay nada que acotar y la barra sería decorado.
  if (groups.length < 2) return <>{children}</>;

  const sorted = [...groups].sort((a, b) => a.label.localeCompare(b.label, 'ca'));

  /*
   * Las reglas que dependen de la clave, y solo esas.
   *
   * El aspecto de las pastillas vive en `globals.css`, que es donde no cambia.
   * Aquí van únicamente los `:checked` — ocultar las filas ajenas y encender la
   * pastilla — porque el selector lleva la clave dentro y el CSS no sabe
   * compararla con un atributo.
   *
   * Las declaraciones se escriben **una vez** con la lista de selectores
   * delante, en vez de repetir el bloque por grupo. Repitiéndolo eran 12,8 kB
   * de CSS en una página de 42 comarcas.
   */
  const keys = [`${id}-all`, ...sorted.map((g) => `${id}-${g.key}`)];

  const rules = [
    sorted
      .map((g) => `#${id}-${g.key}:checked~.lf-body [data-lf]:not([data-lf="${g.key}"]){display:none}`)
      .join(''),
    /*
     * Y el epígrafe de una sección que se queda sin nada dentro.
     *
     * En `/mar` las playas van agrupadas por costa, con su título y su
     * recuento. Filtrando por bandera, una costa donde no haya ninguna de ese
     * color dejaría el título solo, prometiendo una lista que no está.
     *
     * `:has()` lo resuelve sin marcar nada más: se oculta la sección que no
     * contenga ninguna fila del grupo elegido.
     */
    sorted
      .map((g) => `#${id}-${g.key}:checked~.lf-body .lf-section:not(:has([data-lf="${g.key}"])){display:none}`)
      .join(''),
    `${keys.map((k) => `#${k}:checked~* label[for="${k}"]`).join(',')}`
      + '{background:var(--surface-2);border-color:var(--accent);color:var(--ink);font-weight:600}',
    `${keys.map((k) => `#${k}:focus-visible~* label[for="${k}"]`).join(',')}`
      + '{outline:2px solid var(--accent);outline-offset:2px}',
    /*
     * Con un filtro puesto, las pastillas se enseñan aunque el desplegable esté
     * cerrado. Si no, la tabla saldría con siete filas de doscientas y sin nada
     * a la vista que dijera por qué.
     *
     * Se sabe con el radio de «totes»: si no está marcado, hay filtro. Una
     * regla, no una por grupo.
     */
    `#${id}-all:not(:checked)~.lf-chips{display:flex}`,
    /*
     * Y con filtro puesto desaparece el recuento de cada sección.
     *
     * «Costa Daurada · 46» encima de cuatro fichas es un número que ya no
     * cuenta lo que se ve. Recalcularlo por grupo sería una tabla de cinco
     * costas por cada bandera; no enseñarlo dice la verdad y cuesta una regla.
     *
     * Lo que se enseña en su lugar es el recuento de la pastilla, que sí es el
     * de lo que hay delante.
     */
    `#${id}-all:not(:checked)~.lf-body .lf-total{display:none}`,
  ].join('');

  const total = groups.reduce((a, g) => a + g.count, 0);

  return (
    <div className="lfilter">
      {/*
        * Los radios y la casilla van primero y son hermanos del cuerpo: `~` no
        * sale del padre, y de ahí cuelga todo lo que hace esto funcionar.
        */}
      <input type="checkbox" id={`${id}-open`} />
      <input type="radio" id={`${id}-all`} name={id} defaultChecked />
      {sorted.map((g) => (
        <input key={g.key} type="radio" id={`${id}-${g.key}`} name={id} />
      ))}

      <style dangerouslySetInnerHTML={{ __html: rules }} />

      <p className="lf-toggle">
        <label htmlFor={`${id}-open`}>
          {legend} <span className="lf-count">{sorted.length}</span>
        </label>
      </p>

      <div className="lf-chips" role="group" aria-label={legend}>
        <label htmlFor={`${id}-all`}>
          {allLabel} <span className="lf-count">{total}</span>
        </label>
        {sorted.map((g) => (
          <label key={g.key} htmlFor={`${id}-${g.key}`}>
            {g.label} <span className="lf-count">{g.count}</span>
          </label>
        ))}
      </div>

      <div className="lf-body">{children}</div>
    </div>
  );
}

/**
 * Los grupos que hay en una lista, contados.
 *
 * Se pasa la clave y la etiqueta de cada fila y sale la lista de pastillas. Una
 * fila sin clave no cuenta para ninguna: es lo que pasa con una estación cuya
 * comarca no consta, y esconderla detrás de un grupo inventado sería peor.
 */
export function groupsOf<T>(
  rows: T[],
  of: (row: T) => { key: string; label: string } | null,
): FilterGroup[] {
  const seen = new Map<string, FilterGroup>();
  for (const row of rows) {
    const g = of(row);
    if (!g?.key) continue;
    const found = seen.get(g.key);
    if (found) found.count++;
    else seen.set(g.key, { key: g.key, label: g.label, count: 1 });
  }
  return [...seen.values()];
}
