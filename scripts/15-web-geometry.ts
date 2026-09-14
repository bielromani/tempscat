/**
 * La geometria per al mapa que es pot moure.
 *
 *   npm run data:web-geo
 *
 * ## Per què no serveixen els fitxers que ja hi ha
 *
 * N'hi ha tres, i cap dels tres fa aquesta feina:
 *
 *  · `comarques.geojson` i `municipis.geojson` són els bons —graus, WGS84, el
 *    que MapLibre menja— però pesen **269 kB i 1.596 kB**. Enviar el segon tal
 *    qual són 506 kB comprimits per dibuixar unes ratlles que a la pantalla no
 *    arriben a un píxel d'amplada.
 *  · `comarques-map.json` ja està aprimat, però està **projectat**: són camins
 *    d'SVG en unitats d'un `viewBox` de mil. Un mapa que es pot moure necessita
 *    graus, perquè qui decideix la finestra és qui mira.
 *
 * Així que aquí es fa l'únic pas que faltava: simplificar **en graus**.
 *
 * ## La tolerància, i per què aquesta
 *
 * 0,002°, que a la latitud de Catalunya són uns 200 m. Mesurat sobre els dos
 * fitxers:
 *
 * | | original | 0,001° | **0,002°** | 0,004° |
 * |---|---|---|---|---|
 * | comarques | 87 kB | 61 | **35** | 19 |
 * | municipis | 506 kB | 239 | **153** | 99 |
 *
 * *(comprimit)*
 *
 * El zoom més gran d'aquest mapa és l'11, i amb tessel·les de 512 píxels allà
 * un píxel són uns 28 m: una tolerància de 200 m es nota com a molt en set
 * píxels d'una costa. A 0,004° serien catorze i el delta de l'Ebre comença a
 * semblar una altra cosa. El que decideix no és el pes: és fins on es pot
 * arrodonir una frontera sense que deixi de ser aquella frontera.
 *
 * ## Els municipis van a part, i no per ordre
 *
 * Perquè **una pàgina baixa el que ensenya**, i el mapa obre amb el radar. Les
 * comarques són 35 kB i van sempre; els 153 kB dels municipis només els baixa
 * qui encén la capa de temperatura. És la mateixa regla que parteix la
 * predicció en 43 trossos.
 *
 * Sortida: data/build/geo/web/comarques.json i web/municipis.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { countPoints, round, simplify, type MultiPolygon } from './lib/gml.ts';
import { build } from './lib/paths.ts';

/**
 * 0,002° ≈ 200 m. Va aquí i no a la pàgina perquè és una decisió del build:
 * el navegador rep la geometria ja aprimada i no en sap res.
 */
const TOLERANCE = 0.002;

/**
 * Illots per sota de mig quilòmetre quadrat, fora.
 *
 * El valor per defecte de `simplify()` és 0,05 km², que per a un mapa de detall
 * està bé. Aquí el zoom màxim és l'11: un polígon de 0,05 km² hi ocupa **menys
 * de dos píxels** i el que s'hi veu no és una illa, és brutícia. Els Alfacs i
 * les illes Medes, que sí que es veuen, passen el llindar de sobra.
 */
const MIN_AREA_KM2 = 0.5;

interface Feature {
  type: 'Feature';
  properties: { code: string; name: string; areaKm2: number };
  geometry: { type: 'MultiPolygon'; coordinates: MultiPolygon };
}

interface Collection { type: 'FeatureCollection'; features: Feature[] }

function thin(name: string): { out: Collection; before: number; after: number } {
  const src = JSON.parse(
    readFileSync(build('geo', `${name}.geojson`), 'utf8'),
  ) as Collection;

  let before = 0;
  let after = 0;

  const features = src.features.map((f) => {
    before += countPoints(f.geometry.coordinates);
    const mp = round(simplify(f.geometry.coordinates, TOLERANCE, MIN_AREA_KM2), 4);
    after += countPoints(mp);
    return {
      type: 'Feature' as const,
      /*
       * `areaKm2` es queda fora: el mapa no l'ensenya i són 947 números que
       * viatgen a cada visita. La superfície d'un municipi ja és a la seva
       * fitxa, que és on algú la buscaria.
       */
      properties: { code: f.properties.code, name: f.properties.name },
      geometry: { type: 'MultiPolygon' as const, coordinates: mp },
    };
  });

  return { out: { type: 'FeatureCollection', features } as Collection, before, after };
}

const dir = build('geo', 'web');
mkdirSync(dir, { recursive: true });

for (const name of ['comarques', 'municipis']) {
  const { out, before, after } = thin(name);
  const json = JSON.stringify(out);
  writeFileSync(join(dir, `${name}.json`), json);

  const kb = (n: number) => `${(n / 1024).toFixed(0)} kB`;
  console.log(
    `${name.padEnd(10)} ${String(out.features.length).padStart(4)} peces · `
    + `${before} → ${after} punts · ${kb(json.length)} cru · ${kb(gzipSync(json).length)} comprimit`,
  );
}

console.log('\n→ data/build/geo/web/');
