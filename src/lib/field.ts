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

/**
 * La predicció del voltant —el mar, França i l'Aragó—, desada a part.
 *
 * Va al seu tros i no dins de l'índex per una raó de cost: l'índex el llegeix
 * la pàgina del radar a cada visita i només necessita saber quines hores hi
 * ha, mentre que això són tres dies de sèrie de setanta-cinc punts que
 * **només** llegeix el worker. És la mateixa regla que parteix la resta:
 * una pàgina baixa el que ensenya.
 */
export function ringShard(): string {
  return `${FIELD_DIR}/voltant`;
}

export interface FieldHour {
  /** Segons des de l'epoch, com els marcs del radar. */
  time: number;
  /** `AAAA-MM-DDTHH`, l'hora local de la predicció. */
  iso: string;
  /** El nom del fitxer, sense sufix: `AAAAMMDDHH`. */
  name: string;
  /**
   * L'empremta de la imatge, per no tornar a pujar la que ja hi ha.
   *
   * El camp es repinta cada hora i entre dues voltes **onze de les dotze hores
   * són idèntiques**: la predicció no ha canviat i només n'entra una de nova
   * per la cua. Amb l'empremta al costat, el worker compara i puja només el
   * que ha canviat.
   *
   * Va aquí i no es compara amb el fitxer del disc perquè a GitHub Actions
   * **el disc arrenca buit**: allà «no hi és» i «no l'he sabut llegir» són el
   * mateix, i la comparació sortiria sempre negativa. És la mateixa trampa que
   * ja va fer publicar 350 punts de 3.190 amb l'execució en verd.
   *
   * Opcional perquè un índex escrit abans que existís no en porta; sense ella
   * es puja tot, que és el que es feia.
   */
  hash?: string;
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
