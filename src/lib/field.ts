/**
 * El camp de pluja de la predicció: on viu i quina forma té.
 *
 * Una imatge per hora, en píxels del **mosaic del radar**, perquè el mapa del
 * radar les pugui col·locar al costat de les seves tessel·les sense convertir
 * res. És el mateix truc que el relleu, i per la mateixa raó: dins d'aquell SVG
 * només hi ha un sistema de coordenades.
 *
 * No importa res a posta: el llegeixen el worker que les pinta i la pàgina que
 * les ensenya, i el requadre l'han d'entendre igual. Amb dues còpies, el dia
 * que una canviï, la pluja sortiria desplaçada respecte de les muntanyes i cap
 * de les dues coses no fallaria.
 */

export const FIELD_DIR = 'field';

/** L'índex, que diu quines hores hi ha i on van. */
export function fieldShard(): string {
  return `${FIELD_DIR}/index`;
}

export interface FieldHour {
  /** Segons des de l'epoch, com els marcs del radar. */
  time: number;
  /** `AAAA-MM-DDTHH`, l'hora local de la predicció. */
  iso: string;
  /** El nom del fitxer, sense sufix: `AAAAMMDDHH`. */
  name: string;
}

export interface FieldIndex {
  /** El requadre de les imatges, en píxels del mosaic del radar. */
  box: { x: number; y: number; w: number; h: number };
  mosaic: { z: number; tile: number };
  hours: FieldHour[];
  /**
   * Quants punts de predicció han entrat al càlcul.
   *
   * El publica el worker en comptes de ser una constant a la pàgina: és una
   * xifra que la pàgina ensenya al lector, i el dia que la malla creixi o que
   * una comarca no es llegeixi, el text ha de dir el que ha passat de debo.
   */
  points: number;
  source: string;
}
