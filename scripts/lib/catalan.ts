/**
 * Manejo de topónimos catalanes: forma indexada ↔ forma natural, y slugs de URL.
 *
 * El Nomenclàtor publica los nombres en forma indexada, con el artículo al final
 * ("Guàrdia dels Prats, la"). Para mostrar y para las URLs hace falta la forma
 * natural ("la Guàrdia dels Prats"), que es además la oficial.
 */

/** Artículos que el Nomenclàtor pospone tras coma. */
const ARTICLES = new Set(['el', 'la', 'els', 'les', 'lo', 'los', 'es', 'sa', 'ses', 'sos', "l'", "s'", 'ses']);

/**
 * "Guàrdia dels Prats, la" → "la Guàrdia dels Prats"
 * "Ametlla del Vallès, l'" → "l'Ametlla del Vallès"
 * "Montblanc"              → "Montblanc"
 */
export function toNaturalName(indexed: string): string {
  const trimmed = indexed.trim();
  const comma = trimmed.lastIndexOf(', ');
  if (comma === -1) return trimmed;

  const head = trimmed.slice(0, comma);
  const tail = trimmed.slice(comma + 2).trim();
  if (!ARTICLES.has(tail.toLowerCase())) return trimmed;

  // Los artículos apostrofados se pegan al nombre; el resto lleva espacio.
  return tail.endsWith("'") ? `${tail}${head}` : `${tail} ${head}`;
}

/**
 * "la Guàrdia dels Prats" → "la-guardia-dels-prats"
 * "l'Ametlla del Vallès"  → "l-ametlla-del-valles"
 * "Sant Llorenç Savall"   → "sant-llorenc-savall"
 * "Cabrera d'Anoia"       → "cabrera-d-anoia"
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    // ela geminada: l·l → ll (el punt volat no existe en URLs)
    .replace(/·/g, '')
    .replace(/ŀ/g, 'l')
    .replace(/Ŀ/g, 'L')
    // elimina diacríticos combinantes que NFD acaba de separar
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ñ/g, 'n')
    // apóstrofes (rectos y tipográficos) → separador
    .replace(/['’‘]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Clave de comparación tolerante a acentos y mayúsculas. */
export function normalizeKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ·]/g, '')
    .replace(/ŀ/g, 'l')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/['’‘]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Quita el artículo inicial para comparar nombres.
 * "la Guàrdia dels Prats" y "Guàrdia dels Prats" son el mismo lugar.
 */
export function stripArticle(name: string): string {
  const m = name.match(/^(el|la|els|les|lo|los|es|sa|ses)\s+/i);
  if (m) return name.slice(m[0].length);
  const ap = name.match(/^(l|s|d)['’]/i);
  if (ap) return name.slice(ap[0].length);
  return name;
}

/** Dos topónimos designan el mismo lugar (ignorando artículo, acentos y caja). */
export function sameName(a: string, b: string): boolean {
  return normalizeKey(stripArticle(a)) === normalizeKey(stripArticle(b));
}

/**
 * El Nomenclàtor escribe la ela geminada con punto normal ("Vil.les") y el ICGC
 * con punt volat ("Vil·les"). Sin unificarlas, dos grafías del mismo topónimo
 * no casan nunca.
 */
function unifyGeminate(s: string): string {
  return s.replace(/l\.l/gi, 'll').replace(/l·l/gi, 'll');
}

/** Distancia de edición, acotada: en cuanto supera `max` deja de calcular. */
export function levenshtein(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Coincidencia tolerante a variantes de grafía: "el Cònsul" ≈ "el Cònsol",
 * "les Vil.les" ≈ "les Vil·les". El umbral escala con la longitud para que en
 * nombres cortos siga siendo estricta.
 */
export function fuzzyMatch(a: string, b: string): boolean {
  const ka = normalizeKey(stripArticle(unifyGeminate(a)));
  const kb = normalizeKey(stripArticle(unifyGeminate(b)));
  if (ka === kb) return true;
  if (ka.length < 5 || kb.length < 5) return false;
  const tolerance = Math.min(2, Math.floor(Math.max(ka.length, kb.length) / 8) + 1);
  return levenshtein(ka, kb, tolerance) <= tolerance;
}

/**
 * El Nomenclàtor agrupa lugares con "i": "Porquerisses i Albarells",
 * "Can Valls i Torre del Negrell". El geocodificador solo conoce cada parte por
 * separado, así que hay que probarlas una a una.
 */
export function splitCompound(name: string): string[] {
  const parts = name.split(/\s+i\s+/).map((p) => p.trim()).filter((p) => p.length > 2);
  return parts.length > 1 ? [name, ...parts] : [name];
}

/**
 * Nombres que no son topónimos sino divisiones estadísticas del municipio
 * ("Entitat Est d'Abrera", "Barri Nord", "Sector 3"). Ningún geocodificador los
 * conoce porque no existen sobre el terreno, y no deben publicar página: quien
 * busca eso busca en realidad el municipio.
 */
export function isStatisticalUnit(name: string): boolean {
  return /^(entitat\s+(est|oest|nord|sud|centre)|barri\s+(nord|sud|est|oest|orient|ponent|centre|nou|vell)$|sector\s|zona\s+\d|pol[ií]gon\s|disseminat\b|nucli\s+(nord|sud|est|oest)|resta\s+de|altres\b)/i
    .test(name.trim());
}
