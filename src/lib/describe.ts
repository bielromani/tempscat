import { aName, deComarca, deName, int, num, ordinal, placeName } from './format.ts';
import type { Lang } from './lang.ts';
import type { Comarca, Location } from './territory.ts';

/**
 * Texto único por ubicación, generado con plantillas condicionales sobre datos
 * reales — **no con un LLM en tiempo de ejecución**.
 *
 * Es determinista, auditable, sin coste por página y sin riesgo de inventar.
 * Con 4.293 páginas, un modelo generativo produciría cuatro mil afirmaciones
 * que nadie ha comprobado; aquí cada frase sale de un número que está en la
 * base de datos.
 *
 * La regla de oro: **si el dato no está, la frase no se escribe.** Vale más un
 * párrafo corto y cierto que uno largo con rellenos.
 *
 * En castellano cada frase tiene su propia plantilla, con la gramática del
 * castellano —«de El Prat», «del Bages», «está a 548 m»— y no una traducción
 * palabra a palabra. Cada función acepta `lang` al final, `'ca'` por defecto.
 */

/** Coma decimal con un decimal: 0,5. */
const dec1 = (v: number) => v.toFixed(1).replace('.', ',');

/** Gradiente térmico estándar, °C por metro. */
const LAPSE = 0.0065;

function altitudeSentence(loc: Location, parent: Location | null, lang: Lang = 'ca'): string | null {
  if (loc.altitud == null) return null;

  if (lang === 'es') {
    const nom = placeName(loc.nom, lang);
    if (parent?.altitud != null && Math.abs(loc.altitud - parent.altitud) >= 60) {
      const d = loc.altitud - parent.altitud;
      const deg = Math.abs(d * LAPSE);
      const ref = loc.level === 'barri' ? `del centro ${deName(parent.nom, lang)}` : `del núcleo ${deName(parent.nom, lang)}`;
      return `${nom} está a ${int(loc.altitud)} m, ${int(Math.abs(d))} m ${d > 0 ? 'por encima' : 'por debajo'} ${ref}. `
        + `Por ese desnivel, la temperatura suele ser entre ${dec1(deg * 0.8)} y ${dec1(deg * 1.3)} °C `
        + `${d > 0 ? 'más baja' : 'más alta'}, y la diferencia se acentúa en las noches despejadas de invierno.`;
    }
    if (loc.altitud >= 1500) {
      return `${nom} está a ${int(loc.altitud)} m, en plena alta montaña: nieva varios meses al año `
        + 'y las temperaturas son sensiblemente más bajas que en el fondo del valle.';
    }
    if (loc.altitud >= 800) {
      return `${nom} está a ${int(loc.altitud)} m. A esta altitud las heladas empiezan pronto en `
        + 'otoño y se prolongan hasta bien entrada la primavera.';
    }
    if (loc.altitud <= 30) {
      return `${nom} está prácticamente al nivel del mar (${int(loc.altitud)} m), con el efecto `
        + 'moderador que eso supone: menos heladas en invierno y noches más suaves en verano.';
    }
    return `${nom} está a ${int(loc.altitud)} m de altitud.`;
  }

  if (parent?.altitud != null && Math.abs(loc.altitud - parent.altitud) >= 60) {
    const d = loc.altitud - parent.altitud;
    const deg = Math.abs(d * LAPSE);
    const dir = d > 0 ? 'per sobre' : 'per sota';
    const sense = d > 0 ? 'menys' : 'més';
    // Un barri es compara amb el centre de la ciutat, que és on es calcula la seva fitxa.
    const ref = loc.level === 'barri' ? `del centre ${deName(parent.nom)}` : `del nucli ${deName(parent.nom)}`;
    return `${loc.nom} és a ${int(loc.altitud)} m, ${int(Math.abs(d))} m ${dir} ${ref}. `
      + `Aquest desnivell fa que hi soli fer entre ${(deg * 0.8).toFixed(1).replace('.', ',')} i `
      + `${(deg * 1.3).toFixed(1).replace('.', ',')} °C ${sense}, i la diferència s'accentua `
      + `les nits serenes d'hivern.`;
  }

  if (loc.altitud >= 1500) {
    return `${loc.nom} és a ${int(loc.altitud)} m, en plena alta muntanya: hi neva diversos mesos l'any `
      + `i les temperatures hi són sensiblement més baixes que al fons de vall.`;
  }
  if (loc.altitud >= 800) {
    return `${loc.nom} és a ${int(loc.altitud)} m. A aquesta altitud les glaçades comencen aviat a la `
      + `tardor i s'allarguen fins ben entrada la primavera.`;
  }
  if (loc.altitud <= 30) {
    return `${loc.nom} és pràcticament al nivell del mar (${int(loc.altitud)} m), amb l'amortiment `
      + `tèrmic que això comporta: menys glaçades a l'hivern i nits més suaus a l'estiu.`;
  }
  return `${loc.nom} és a ${int(loc.altitud)} m d'altitud.`;
}

/**
 * L'estació, només quan cal dir-ne alguna cosa més que el nom.
 *
 * El nom, la distància i el desnivell ja els diu el titular de la fitxa, just
 * a sobre de la xifra; repetir-los aquí era llegir el mateix dues vegades. El
 * que el titular no diu és que, amb més de cent metres de diferència, la
 * temperatura que s'ensenya està corregida.
 */
function stationSentence(loc: Location, lang: Lang = 'ca'): string | null {
  if (!loc.stationRef) return null;
  const { nom, dAltM, distKm, nearest, ridgeM } = loc.stationRef;
  const parts: string[] = [];

  if (lang === 'es') {
    // `dAltM` es lugar menos estación: positivo quiere decir que la estación está más abajo.
    const vert = (d: number) => (d > 0 ? 'más abajo' : 'más arriba');
    if (nearest) {
      const nd = nearest.dAltM;
      const why = nd != null && Math.abs(nd) >= 50 ? `, que está ${Math.abs(nd)} m ${vert(nd)}` : '';
      parts.push(`La temperatura actual procede de la estación ${deName(nom, lang)}, a ${num(distKm, 1)} km, `
        + `y no de la más cercana, la ${deName(nearest.nom, lang)}, a ${num(nearest.distKm, 1)} km${why}: `
        + 'para la temperatura, una cota parecida cuenta más que la distancia.');
      if (ridgeM != null) {
        parts.push(`Entre este lugar y la estación hay una sierra que llega a los ${ridgeM} m: en las noches `
          + 'despejadas o con viento de mar, a cada lado puede hacer un tiempo distinto.');
      }
    }
    if (dAltM != null && Math.abs(dAltM) >= 100) {
      parts.push(nearest
        ? `Aun así, la estación está ${Math.abs(dAltM)} m ${vert(dAltM)}, y la temperatura que se `
          + 'muestra está corregida por esa diferencia.'
        : `La estación más cercana, la ${deName(nom, lang)}, está ${Math.abs(dAltM)} m ${vert(dAltM)}: `
          + 'la temperatura que se muestra está corregida por esa diferencia y no es la lectura '
          + 'directa del aparato.');
    }
    return parts.length ? parts.join(' ') : null;
  }

  /*
   * Quan l'estació no és la més propera, per què.
   *
   * La tria pesa la distància i el desnivell, i un de cada cinc llocs acaba
   * amb una estació més llunyana però d'una cota semblant. És la bona, però qui
   * veu escrit «Sant Cugat» a la fitxa d'Horta es pregunta per què no és la del
   * costat. I si entremig hi ha una serra, també es diu: a cada vessant hi pot
   * fer un temps diferent.
   */
  if (nearest) {
    const nd = nearest.dAltM;
    const why = nd != null && Math.abs(nd) >= 50
      ? `, però és ${Math.abs(nd)} m més ${nd > 0 ? 'avall' : 'amunt'}`
      : '';
    parts.push(`La temperatura d'ara surt de l'estació ${deName(nom)}, a ${num(distKm, 1)} km, `
      + `i no de la més propera, la ${deName(nearest.nom)}, a ${num(nearest.distKm, 1)} km${why}: `
      + `per a la temperatura, una cota semblant compta més que la distància.`);
    if (ridgeM != null) {
      parts.push(`Entre aquí i l'estació hi ha una serra que arriba als ${ridgeM} m: les nits serenes `
        + `o amb vent de mar, a cada vessant hi pot fer un temps diferent.`);
    }
  }

  if (dAltM != null && Math.abs(dAltM) >= 100) {
    parts.push(nearest
      ? `Tot i això, l'estació és ${Math.abs(dAltM)} m ${dAltM > 0 ? 'més avall' : 'més amunt'}, i la `
        + `temperatura que es mostra està corregida per aquesta diferència.`
      : `L'estació més propera, la ${deName(nom)}, és ${Math.abs(dAltM)} m `
        + `${dAltM > 0 ? 'més avall' : 'més amunt'}: la temperatura que es mostra està corregida `
        + `per aquesta diferència, i no és la lectura directa de l'aparell.`);
  }
  return parts.length ? parts.join(' ') : null;
}

function contextSentence(loc: Location, comarca: Comarca, siblings: Location[], lang: Lang = 'ca'): string | null {
  // Un barri es compara amb els altres barris, no amb els nuclis del municipi.
  const pool = loc.level === 'barri' ? siblings.filter((s) => s.level === 'barri') : siblings;
  const withAlt = pool.filter((s) => s.altitud != null);
  if (loc.altitud == null || withAlt.length < 2) return null;

  const sorted = [...withAlt, loc]
    .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i)
    .sort((a, b) => (b.altitud ?? 0) - (a.altitud ?? 0));
  const rank = sorted.findIndex((s) => s.id === loc.id) + 1;
  if (rank === 0) return null;

  const total = sorted.length;
  if (lang === 'es') {
    // «Ocupa el puesto 3» y no «es el 3.º»: el ordinal en cifra delante de un
    // nombre se lee mal en castellano («el 3.er barrio»).
    if (loc.level === 'barri') {
      if (rank === 1) return `Es el barrio más alto de los ${total} que tienen ficha propia.`;
      if (rank === total) return `Es el más bajo de los ${total} barrios que tienen ficha propia.`;
      return `Por altitud, ocupa el puesto ${rank} de los ${total} barrios que tienen ficha propia.`;
    }
    if (rank === 1) {
      return total - 1 === 1
        ? 'Es el núcleo más alto del municipio, por encima del otro que tiene.'
        : `Es el núcleo más alto del municipio, por encima de los otros ${total - 1}.`;
    }
    if (rank === total) return `Es el núcleo más bajo del municipio, de los ${total} que tiene.`;
    return `Por altitud, ocupa el puesto ${rank} de los ${total} núcleos del municipio.`;
  }
  if (loc.level === 'barri') {
    if (rank === 1) return `És el barri més enlairat dels ${total} que tenen fitxa pròpia.`;
    if (rank === total) return `És el més baix dels ${total} barris que tenen fitxa pròpia.`;
    return `És el ${ordinal(rank)} barri més enlairat dels ${total} que tenen fitxa pròpia.`;
  }
  if (rank === 1) {
    return `És el nucli més enlairat del municipi, per damunt dels altres ${total - 1}.`;
  }
  if (rank === total) {
    return `És el nucli més baix del municipi, dels ${total} que en té.`;
  }
  return `És el ${ordinal(rank)} nucli més enlairat dels ${total} del municipi.`;
}

function comarcaSentence(loc: Location, comarca: Comarca, lang: Lang = 'ca'): string | null {
  if (comarca.altitudMin == null || comarca.altitudMax == null || loc.altitud == null) return null;
  const range = comarca.altitudMax - comarca.altitudMin;
  if (range < 200) return null;
  const pos = (loc.altitud - comarca.altitudMin) / range;
  if (lang === 'es') {
    const where = pos > 0.75 ? 'en la parte alta' : pos < 0.25 ? 'en la parte baja' : 'en la franja media';
    return `Dentro ${deComarca(comarca.nom, lang)}, que va de los ${int(comarca.altitudMin)} a los `
      + `${int(comarca.altitudMax)} m, queda ${where} de la comarca.`;
  }
  const where = pos > 0.75 ? 'a la part alta' : pos < 0.25 ? 'a la part baixa' : 'a la franja mitjana';
  return `Dins ${deComarca(comarca.nom)}, que va dels ${int(comarca.altitudMin)} als ${int(comarca.altitudMax)} m, `
    + `queda ${where} de la comarca.`;
}

/**
 * Descripción de una ubicación poblada. Entre dos y cuatro frases, todas
 * derivadas de datos verificados.
 */
export function describeLocation(
  loc: Location,
  comarca: Comarca,
  parent: Location | null,
  siblings: Location[],
  lang: Lang = 'ca',
): string {
  return [
    altitudeSentence(loc, parent, lang),
    contextSentence(loc, comarca, siblings, lang),
    comarcaSentence(loc, comarca, lang),
    stationSentence(loc, lang),
  ].filter(Boolean).join(' ');
}

/** Descripción de un municipio: manda el territorio, no la comparación entre núcleos. */
export function describeMunicipi(
  loc: Location,
  comarca: Comarca,
  entitats: Location[],
  lang: Lang = 'ca',
): string {
  if (lang === 'es') return describeMunicipiEs(loc, entitats);
  const parts: string[] = [];

  if (loc.altitud != null) {
    parts.push(`El nucli ${deName(loc.nom)} és a ${int(loc.altitud)} m d'altitud`
      + (loc.areaKm2 ? `, en un terme municipal de ${loc.areaKm2.toFixed(1).replace('.', ',')} km²` : '')
      + '.');
  }

  const withAlt = entitats.filter((e) => e.altitud != null);
  if (withAlt.length >= 2 && withAlt.every((e) => e.level === 'barri')) {
    // Una ciutat amb barris: només tenen fitxa els que són prou amunt.
    const max = Math.max(...withAlt.map((e) => e.altitud!));
    const spread = max - (loc.altitud ?? 0);
    parts.push(`${withAlt.length} barris ${deName(loc.nom)} són prou amunt per tenir el temps propi, `
      + `i cadascun té la seva fitxa: el més alt és a ${max} m, i hi pot fer fins a `
      + `${(spread * LAPSE).toFixed(1).replace('.', ',')} °C menys que al centre.`);
  } else if (withAlt.length >= 2) {
    const alts = withAlt.map((e) => e.altitud!);
    const min = Math.min(...alts, loc.altitud ?? Infinity);
    const max = Math.max(...alts, loc.altitud ?? -Infinity);
    const spread = max - min;
    if (spread >= 100) {
      parts.push(`El municipi té ${withAlt.length} nuclis més enllà de la capital, repartits entre `
        + `els ${min} i els ${max} m. Aquest desnivell de ${spread} m es tradueix en diferències `
        + `de fins a ${(spread * LAPSE).toFixed(1).replace('.', ',')} °C entre uns i altres.`);
    } else {
      parts.push(`El municipi té ${withAlt.length} nuclis més enllà de la capital, tots a cotes similars.`);
    }
  }

  const st = stationSentence(loc);
  if (st) parts.push(st);

  return parts.join(' ');
}

/** El municipio en castellano: las mismas frases que el catalán de arriba. */
function describeMunicipiEs(loc: Location, entitats: Location[]): string {
  const parts: string[] = [];
  const de = deName(loc.nom, 'es');

  if (loc.altitud != null) {
    parts.push(`El núcleo ${de} está a ${int(loc.altitud)} m de altitud`
      + (loc.areaKm2 ? `, en un término municipal de ${dec1(loc.areaKm2)} km²` : '')
      + '.');
  }

  const withAlt = entitats.filter((e) => e.altitud != null);
  if (withAlt.length >= 2 && withAlt.every((e) => e.level === 'barri')) {
    const max = Math.max(...withAlt.map((e) => e.altitud!));
    const spread = max - (loc.altitud ?? 0);
    parts.push(`${withAlt.length} barrios ${de} están lo bastante altos para tener un tiempo propio, `
      + `y cada uno tiene su ficha: el más alto está a ${max} m, y allí puede hacer hasta `
      + `${dec1(spread * LAPSE)} °C menos que en el centro.`);
  } else if (withAlt.length >= 2) {
    const alts = withAlt.map((e) => e.altitud!);
    const min = Math.min(...alts, loc.altitud ?? Infinity);
    const max = Math.max(...alts, loc.altitud ?? -Infinity);
    const spread = max - min;
    parts.push(spread >= 100
      ? `El municipio tiene ${withAlt.length} núcleos además de la capital, repartidos entre `
        + `los ${min} y los ${max} m. Ese desnivel de ${spread} m se traduce en diferencias `
        + `de hasta ${dec1(spread * LAPSE)} °C entre unos y otros.`
      : `El municipio tiene ${withAlt.length} núcleos además de la capital, todos a cotas parecidas.`);
  }

  const st = stationSentence(loc, 'es');
  if (st) parts.push(st);
  return parts.join(' ');
}

/** Meta description: bajo 160 caracteres y con el dato que hace clicar. */
export function metaDescription(loc: Location, comarca: Comarca, lang: Lang = 'ca'): string {
  const alt = loc.altitud != null ? ` (${int(loc.altitud)} m)` : '';
  if (lang === 'es') {
    const es = `El tiempo ${aName(loc.nom, lang)}, ${comarca.nom}${alt}: predicción hora a hora, `
      + '14 días y observación real de la estación más cercana.';
    return es.length > 158 ? `${es.slice(0, 155)}…` : es;
  }
  const base = `El temps ${aName(loc.nom)}, ${comarca.nom}${alt}: predicció hora a hora, `
    + `14 dies i observació real de l'estació més propera.`;
  return base.length > 158 ? `${base.slice(0, 155)}…` : base;
}
