import { aName, deName } from './format';
import type { Comarca, Location } from './territory';

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
 */

/** Gradiente térmico estándar, °C por metro. */
const LAPSE = 0.0065;

function altitudeSentence(loc: Location, parent: Location | null): string | null {
  if (loc.altitud == null) return null;

  if (parent?.altitud != null && Math.abs(loc.altitud - parent.altitud) >= 60) {
    const d = loc.altitud - parent.altitud;
    const deg = Math.abs(d * LAPSE);
    const dir = d > 0 ? 'per sobre' : 'per sota';
    const sense = d > 0 ? 'menys' : 'més';
    return `${loc.nom} és a ${loc.altitud} m, ${Math.abs(d)} m ${dir} del nucli ${deName(parent.nom)}. `
      + `Aquest desnivell fa que hi soli fer entre ${(deg * 0.8).toFixed(1).replace('.', ',')} i `
      + `${(deg * 1.3).toFixed(1).replace('.', ',')} °C ${sense}, i la diferència s'accentua `
      + `les nits serenes d'hivern.`;
  }

  if (loc.altitud >= 1500) {
    return `${loc.nom} és a ${loc.altitud} m, en plena alta muntanya: hi neva diversos mesos l'any `
      + `i les temperatures hi són sensiblement més baixes que al fons de vall.`;
  }
  if (loc.altitud >= 800) {
    return `${loc.nom} és a ${loc.altitud} m. A aquesta altitud les glaçades comencen aviat a la `
      + `tardor i s'allarguen fins ben entrada la primavera.`;
  }
  if (loc.altitud <= 30) {
    return `${loc.nom} és pràcticament al nivell del mar (${loc.altitud} m), amb l'amortiment `
      + `tèrmic que això comporta: menys glaçades a l'hivern i nits més suaus a l'estiu.`;
  }
  return `${loc.nom} és a ${loc.altitud} m d'altitud.`;
}

function stationSentence(loc: Location): string | null {
  if (!loc.stationRef) return null;
  const { nom, distKm, dAltM } = loc.stationRef;

  const dist = distKm.toFixed(1).replace('.', ',');
  if (dAltM != null && Math.abs(dAltM) >= 100) {
    return `L'observació prové de l'estació automàtica ${deName(nom)}, a ${dist} km i `
      + `${dAltM > 0 ? '' : '−'}${Math.abs(dAltM)} m de desnivell. Com que la diferència d'altitud `
      + `és considerable, la temperatura que es mostra ja ve corregida; no és la lectura crua de l'estació.`;
  }
  return `L'observació prové de l'estació automàtica ${deName(nom)}, a ${dist} km`
    + (dAltM != null && Math.abs(dAltM) >= 25 ? ` i ${dAltM > 0 ? '' : '−'}${Math.abs(dAltM)} m de desnivell` : '')
    + `. És la més representativa d'aquest punt tenint en compte distància i cota.`;
}

function contextSentence(loc: Location, comarca: Comarca, siblings: Location[]): string | null {
  const withAlt = siblings.filter((s) => s.altitud != null);
  if (loc.altitud == null || withAlt.length < 2) return null;

  const sorted = [...withAlt, loc]
    .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i)
    .sort((a, b) => (b.altitud ?? 0) - (a.altitud ?? 0));
  const rank = sorted.findIndex((s) => s.id === loc.id) + 1;
  if (rank === 0) return null;

  const total = sorted.length;
  if (rank === 1) {
    return `És el nucli més enlairat del municipi, per damunt dels altres ${total - 1}.`;
  }
  if (rank === total) {
    return `És el nucli més baix del municipi, dels ${total} que en té.`;
  }
  return `És el ${rank}è nucli més enlairat dels ${total} del municipi.`;
}

function comarcaSentence(loc: Location, comarca: Comarca): string | null {
  if (comarca.altitudMin == null || comarca.altitudMax == null || loc.altitud == null) return null;
  const range = comarca.altitudMax - comarca.altitudMin;
  if (range < 200) return null;
  const pos = (loc.altitud - comarca.altitudMin) / range;
  const where = pos > 0.75 ? 'a la part alta' : pos < 0.25 ? 'a la part baixa' : 'a la franja mitjana';
  return `Dins de ${comarca.nom}, que va dels ${comarca.altitudMin} als ${comarca.altitudMax} m, `
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
): string {
  return [
    altitudeSentence(loc, parent),
    contextSentence(loc, comarca, siblings),
    comarcaSentence(loc, comarca),
    stationSentence(loc),
  ].filter(Boolean).join(' ');
}

/** Descripción de un municipio: manda el territorio, no la comparación entre núcleos. */
export function describeMunicipi(
  loc: Location,
  comarca: Comarca,
  entitats: Location[],
): string {
  const parts: string[] = [];

  if (loc.altitud != null) {
    parts.push(`El nucli ${deName(loc.nom)} és a ${loc.altitud} m d'altitud`
      + (loc.areaKm2 ? `, en un terme municipal de ${loc.areaKm2.toFixed(1).replace('.', ',')} km²` : '')
      + '.');
  }

  const withAlt = entitats.filter((e) => e.altitud != null);
  if (withAlt.length >= 2) {
    const alts = withAlt.map((e) => e.altitud!);
    const min = Math.min(...alts, loc.altitud ?? Infinity);
    const max = Math.max(...alts, loc.altitud ?? -Infinity);
    const spread = max - min;
    if (spread >= 100) {
      parts.push(`El municipi té ${withAlt.length} nuclis més enllà de la capital, repartits entre `
        + `els ${min} i els ${max} m. Aquest desnivell de ${spread} m es tradueix en diferències `
        + `de fins a ${(spread * LAPSE).toFixed(1).replace('.', ',')} °C entre uns i altres, `
        + `motiu pel qual cada nucli té la seva pàgina i la seva correcció.`);
    } else {
      parts.push(`El municipi té ${withAlt.length} nuclis més enllà de la capital, tots a cotes similars.`);
    }
  }

  const st = stationSentence(loc);
  if (st) parts.push(st);

  return parts.join(' ');
}

/** Meta description: bajo 160 caracteres y con el dato que hace clicar. */
export function metaDescription(loc: Location, comarca: Comarca): string {
  const alt = loc.altitud != null ? ` (${loc.altitud} m)` : '';
  const base = `El temps ${aName(loc.nom)}, ${comarca.nom}${alt}: predicció hora a hora, `
    + `7 dies i observació real de l'estació més propera.`;
  return base.length > 158 ? `${base.slice(0, 155)}…` : base;
}
