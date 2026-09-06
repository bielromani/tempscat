/**
 * Les menes de resultat i com se'n diu a la pantalla.
 *
 * Està a part de `search.ts` perquè aquell fitxer porta `server-only` —llegeix
 * el territori, el mar i la muntanya del disc— i això ho ha de poder llegir
 * **el navegador**: el desplegable de suggeriments pinta l'etiqueta de cada
 * resultat i és un component de client.
 *
 * No importa res, i per això no arrossega res al paquet del navegador.
 */

export type SearchKind =
  | 'poblacio' | 'comarca' | 'estacio' | 'platja' | 'embassament'
  | 'aforament' | 'esqui' | 'camera' | 'itinerari' | 'pagina';

export const KIND_LABEL: Record<SearchKind, string> = {
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
};

/** El que viatja per `/api/cerca`. */
export interface SearchSuggestion {
  kind: SearchKind;
  title: string;
  context: string | null;
  href: string;
}
