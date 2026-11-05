/**
 * Les menes de resultat i com se'n diu a la pantalla.
 *
 * Està a part de `search.ts` perquè aquell fitxer porta `server-only` —llegeix
 * el territori, el mar i la muntanya del disc— i això ho ha de poder llegir
 * **el navegador**: el desplegable de suggeriments pinta l'etiqueta de cada
 * resultat i és un component de client.
 *
 * No importa res —el tipus de `lang.ts` s'esborra en compilar—, i per això no
 * arrossega res al paquet del navegador.
 */

import type { Lang } from './lang.ts';

export type SearchKind =
  | 'poblacio' | 'comarca' | 'estacio' | 'platja' | 'embassament'
  | 'aforament' | 'esqui' | 'camera' | 'itinerari' | 'pagina';

const KIND_LABEL: Record<Lang, Record<SearchKind, string>> = {
  ca: {
    poblacio: 'Població',
    comarca: 'Comarca',
    estacio: 'Estació',
    platja: 'Platja',
    embassament: 'Embassament',
    aforament: 'Aforament',
    esqui: 'Muntanya',
    camera: 'Càmera',
    itinerari: 'Itinerari',
    pagina: 'Pàgina',
  },
  es: {
    poblacio: 'Población',
    comarca: 'Comarca',
    estacio: 'Estación',
    platja: 'Playa',
    embassament: 'Embalse',
    aforament: 'Aforo',
    esqui: 'Montaña',
    camera: 'Cámara',
    itinerari: 'Ruta',
    pagina: 'Página',
  },
};

export function kindLabel(lang: Lang, kind: SearchKind): string {
  return KIND_LABEL[lang][kind];
}

/** El que viatja per `/api/cerca`. */
export interface SearchSuggestion {
  kind: SearchKind;
  title: string;
  context: string | null;
  href: string;
}
