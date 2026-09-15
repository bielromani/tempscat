/**
 * Les zones d'avís de l'AEMET: la geometria, i per què va per separat.
 *
 * ## Què és
 *
 * Catalunya està partida en **21 zones de Meteoalerta**, i un avís es refereix
 * sempre a una zona sencera. Els fitxers CAP en porten el contorn, i fins ara
 * el worker el feia servir per saber quins pobles toca cada avís i després el
 * llençava.
 *
 * Són 912 punts en total —entre 11 i 88 per zona— perquè els contorns d'AEMET
 * són deliberadament bastos. Això no és una limitació que calgui disculpar: la
 * zona **és** la unitat de l'avís, i dibuixar-la més fina suggeriria una vora
 * que l'avís no té.
 *
 * ## Per què no va dins de `warnings.json`
 *
 * Perquè aquell fitxer el llegeixen **les 4.293 fitxes de poble** i cap
 * n'ensenya la geometria: el que necessiten és saber si l'avís les toca, i això
 * ja ve resolt en una llista d'identificadors. Ficant-hi els polígons, cada
 * fitxa es baixaria el contorn de tot Catalunya per pintar una targeta de text.
 * És la mateixa regla que parteix la predicció en 43 trossos.
 *
 * I també hi ha la repetició: AEMET emet un fitxer per dia i per zona, així que
 * en un dia moguts els mateixos 912 punts arriben quaranta vegades. Es desen un
 * cop, indexats pel codi.
 *
 * ## La clau és el codi, no el nom
 *
 * `692502`, no «Pirineo de Lleida». El nom és prosa —i està en castellà— i el
 * dia que li canviïn un guionet, emparellar per nom deixaria la zona sense
 * contorn sense donar cap error: el mapa sortiria sencer amb un tros menys
 * pintat. El codi acabat en `C` és la franja costanera, que **se solapa** amb la
 * de terra a posta.
 *
 * Com la resta de fitxers compartits, aquest no importa res.
 */

/** On viu la geometria. Fora de `warnings`, que és el que llegeix tothom. */
export const WARNING_ZONES_SHARD = 'warnings-zones';

export interface WarningZone {
  /** `692502`, `690804C`. La clau. */
  code: string;
  /** L'`areaDesc` d'AEMET, en castellà. El nom en català surt de `warning-labels`. */
  desc: string;
  /**
   * Els anells, en graus `[lon, lat]`.
   *
   * L'ordre és el d'AEMET, que dona `lat,lon`; qui els llegeix ja els rep
   * girats perquè és l'ordre que volen tant GeoJSON com el creuament de punt
   * en polígon. Girar-los dues vegades dibuixaria una Catalunya tombada que
   * segueix semblant un mapa.
   */
  rings: Array<Array<[number, number]>>;
}

export interface WarningZones {
  zones: WarningZone[];
  /** Quants punts hi ha en total. Per poder-ho dir sense tornar-los a comptar. */
  points: number;
}
