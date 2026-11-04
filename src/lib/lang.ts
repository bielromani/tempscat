/**
 * Els dos idiomes del web, i com es tria la frase de cada un.
 *
 * No importa res: el fan servir les pàgines, les frases de `narrative.ts` i
 * els scripts que les proven.
 *
 * ## On viu cada idioma
 *
 * El català és a `tempscat.cat` i el castellà a `es.tempscat.cat`, amb **les
 * mateixes rutes**: `/maresme/malgrat-de-mar` és la mateixa fitxa a tots dos
 * llocs. Per dins, `next.config.ts` reescriu l'adreça a `/ca/…` o `/es/…`
 * segons el domini, i `app/[lang]` en treu l'idioma.
 *
 * Es va triar el subdomini i no un prefix `/es/` per una raó: amb el prefix,
 * cadascun dels 165 enllaços del web l'hauria de portar, i un que se'n deixés
 * enviaria qui llegeix en castellà a una pàgina en català sense cap error. Amb
 * el subdomini, `href="/radar"` ja és bo als dos idiomes.
 *
 * ## Els topònims no es tradueixen
 *
 * En castellà també són els oficials: Lleida, Girona, l'Hospitalet. El que
 * canvia és la gramàtica que els envolta, i això és a `format.ts`.
 */

export const LANGS = ['ca', 'es'] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(s: unknown): s is Lang {
  return s === 'ca' || s === 'es';
}

/** La frase de l'idioma: `tr(lang, 'Pluja', 'Lluvia')`. */
export function tr<T>(lang: Lang, ca: T, es: T): T {
  return lang === 'es' ? es : ca;
}

/**
 * L'idioma d'una petició pel domini, per a les rutes de dades (`/api/…`), que
 * no passen per `[lang]` i on `getLang()` no arriba.
 */
export function langFromHost(host: string | null | undefined): Lang {
  return host?.startsWith('es.') ? 'es' : 'ca';
}

/** El codi BCP 47 de cada idioma, per a `<html lang>` i `hreflang`. */
export const LOCALE: Record<Lang, string> = { ca: 'ca', es: 'es' };

/** Per a `Intl` i per a Open Graph. */
export const OG_LOCALE: Record<Lang, string> = { ca: 'ca_ES', es: 'es_ES' };
