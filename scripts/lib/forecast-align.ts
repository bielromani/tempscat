/**
 * Cuadrar las series de prediccion contra una sola hora cero.
 *
 * Vive en su propio fichero para poder probarlo: `forecast-refresh.ts` llama a
 * `main()` nada mas cargarse, asi que importar cualquier cosa de alli lanzaria
 * el worker entero.
 */

/** Lo minimo que necesita saber de la prediccion. Encaja por forma. */
interface Alignable {
  times: string[];
  points: Record<string, Record<string, { values: Record<string, Array<number | null> | undefined> }>>;
}

/**
 * Cuadra todas las series contra la misma hora cero.
 *
 * ## El fallo que arregla
 *
 * Open-Meteo devuelve siempre desde **las cero horas del día en que se pide**.
 * Un refresco del nivel A del día 2 trae una serie que arranca el día 2; los
 * puntos del nivel C que se conservan del día 1 arrancan el día 1. Y el fichero
 * guarda **un solo array de horas para todos**.
 *
 * La regla que había —se queda la serie más larga— resolvía el caso de
 * estrenar horizonte, pero con las dos de 336 horas `336 > 336` es falso y el
 * array se quedaba congelado en el día 1 mientras los valores nuevos empezaban
 * el día 2. Resultado: **la predicción de los puntos refrescados se enseñaba
 * corrida un día**, y al siguiente dos. Sin error, sin hueco y sin nada raro en
 * la página: los números son plausibles, simplemente son de otro día.
 *
 * ## Cómo se cuadra
 *
 * Manda la hora cero **más reciente**, no la serie más larga. A los puntos que
 * vengan de antes se les corta la cabeza, que son horas ya pasadas.
 *
 * El desplazamiento se busca con `indexOf` dentro del array de horas viejo, no
 * restándole fechas. Las horas van en hora local de Madrid y el domingo del
 * cambio horario tiene 23 o 25: cualquier aritmética de calendario se
 * equivocaría en una hora justo ese día, que es la clase de error que nadie
 * mira.
 *
 * Un punto tan viejo que su serie ya no llega a la nueva hora cero **se
 * descarta**. Es un punto cuya predicción entera está en el pasado: la página
 * dirá que no hay predicción, que es la verdad.
 */
export function alignAll(result: Alignable, timesOf: Map<string, string[]>): void {
  /*
   * Mana l'hora zero mes recent i, amb la mateixa hora zero, la serie mes
   * llarga. La segona meitat de la regla no es cosmetica: el dia que
   * l'horitzo va passar de 168 a 336 hores, quedar-se amb la primera serie
   * que arribes deixava el fitxer amb les 168 velles mentre els punts nous
   * en portaven 336. La segona setmana hi era, escrita al disc, i no la veia
   * ningu.
   */
  let newest: string[] = result.times;
  for (const t of timesOf.values()) {
    if (!t.length) continue;
    if (!newest.length || t[0] > newest[0] || (t[0] === newest[0] && t.length > newest.length)) {
      newest = t;
    }
  }
  if (!newest.length) return;
  result.times = newest;

  let shifted = 0;
  let dropped = 0;
  for (const [id, byModel] of Object.entries(result.points)) {
    const own = timesOf.get(id);
    if (!own || own === newest || own[0] === newest[0]) continue;

    const delta = own.indexOf(newest[0]);
    if (delta < 0) {
      delete result.points[id];
      dropped++;
      continue;
    }
    for (const pf of Object.values(byModel)) {
      for (const slug of Object.keys(pf.values)) {
        const arr = pf.values[slug];
        if (arr) pf.values[slug] = arr.slice(delta);
      }
    }
    shifted++;
  }

  if (shifted) console.log(`S'han quadrat ${shifted.toLocaleString('ca-ES')} punts d'un refresc anterior amb l'hora zero d'ara`);
  if (dropped) console.warn(`avís: ${dropped.toLocaleString('ca-ES')} punts descartats — tota la seva sèrie és al passat`);
}
