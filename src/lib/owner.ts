import type { Lang } from './lang.ts';

/**
 * Qui respon del lloc.
 *
 * Ho demanen l'avís legal i la política de privadesa —el RGPD vol que el
 * responsable sigui identificable i que s'hi pugui escriure— i surt en un sol
 * lloc perquè les dues pàgines no puguin dir coses diferents. Les dades les va
 * donar el titular el 4 d'octubre de 2026: nom i correu, i no més. La resta de
 * la identificació de la LSSI (NIF, adreça) només és obligatòria amb activitat
 * econòmica, i el lloc no en té: el dia que porti publicitat, va aquí.
 */
export const OWNER = {
  name: 'Biel Romaní',
  email: 'bielromani@hotmail.com',
} as const;

/**
 * La data de l'última revisió dels textos legals, per escriure-la al peu, en
 * cada idioma. Les dues han de dir sempre el mateix dia.
 */
export const LEGAL_UPDATED: Record<Lang, string> = {
  ca: '5 de novembre de 2026',
  es: '5 de noviembre de 2026',
};
