import 'server-only';
import type { SeaStretch } from './activities';
import type { Beach } from './sea';
import { aName, articleFirst, deName, placeName } from './format';
import { fold } from './search-match';
import type { Lang } from './lang';

/**
 * La costa en trams: cada punt del model de mar, amb les platges que té més a
 * prop i un nom fet dels seus pobles.
 *
 * La fan servir `/mar` i `/nautica`, i viu aquí perquè les dues pàgines han de
 * partir i anomenar la costa igual: amb dues còpies, un dia un mateix tros de
 * mar es diria «De Vilassar de Mar a Montgat» a una i «Montgat» a l'altra.
 */

export interface Tram {
  /** L'àncora de la targeta, perquè el cercador de la pàgina hi pugui portar. */
  id: string;
  stretch: SeaStretch;
  beaches: Beach[];
  /** Els municipis de les seves platges, de nord a sud. */
  towns: string[];
  coast: string;
}

/** Distància aproximada, només per triar el punt més proper. */
function d2(aLat: number, aLon: number, bLat: number, bLon: number): number {
  return (aLat - bLat) ** 2 + ((aLon - bLon) * Math.cos((aLat * Math.PI) / 180)) ** 2;
}

/**
 * El nom d'un tram: «Roses i Castelló d'Empúries», o «De Vilassar de Mar a
 * Montgat» quan n'hi ha més de dos.
 *
 * Abans era «Vilassar de Mar, Premià de Mar i 5 més», i no hi havia manera de
 * saber quins eren els cinc. Ara el nom diu d'on a on va, i a dins de la
 * targeta hi ha tots els pobles amb les seves platges.
 */
export function tramName(towns: string[], lang: Lang = 'ca'): string {
  const cap = (t: string) => `${t[0].toUpperCase()}${t.slice(1)}`;
  if (lang === 'es') {
    if (towns.length <= 1) return placeName(towns[0] ?? '', lang);
    if (towns.length === 2 && !towns.some((t) => / i /.test(t))) return cap(pairEs(towns[0], towns[1]));
    return cap(`de ${placeName(towns[0], lang)} a ${placeName(towns.at(-1)!, lang)}`);
  }
  if (towns.length <= 1) return cap(towns[0] ?? '');
  // «Vandellòs i l'Hospitalet de l'Infant i l'Ametlla de Mar» no es llegeix: amb
  // una «i» dins d'un nom, es diu d'on a on.
  if (towns.length === 2 && !towns.some((t) => / i /.test(t))) return cap(`${towns[0]} i ${towns[1]}`);
  return cap(`${deName(towns[0])} ${aName(towns.at(-1)!)}`);
}

/**
 * «Gavà y Castelldefels», i «e» davant d'una i: «Calella e Igualada». En
 * castellà la conjunció canvia davant del so /i/, i no davant de «hie».
 */
function pairEs(a: string, b: string): string {
  const pb = placeName(b, 'es');
  return `${placeName(a, 'es')} ${/^h?i(?![aeiouáéíóú])/i.test(pb) ? 'e' : 'y'} ${pb}`;
}

/**
 * El tram dins d'una frase: «a Sitges», «entre Gavà i Castelldefels», «de
 * Tarragona a Cambrils». `tramName()` és un títol i no porta preposició:
 * escrivint-hi «a» davant sortia «a De Tarragona a Cambrils».
 *
 * En castellà, «en Sitges», «entre Gavà y Castelldefels» i «de Tarragona a
 * Cambrils»: aquí la «a» és de direcció, i `aName()` en castellà dona «en».
 */
export function tramPhrase(towns: string[], lang: Lang = 'ca'): string {
  if (lang === 'es') {
    if (towns.length <= 1) return aName(towns[0] ?? '', lang);
    if (towns.length === 2 && !towns.some((t) => / i /.test(t))) return `entre ${pairEs(towns[0], towns[1])}`;
    return `de ${placeName(towns[0], lang)} a ${placeName(towns.at(-1)!, lang)}`;
  }
  if (towns.length <= 1) return aName(towns[0] ?? '');
  if (towns.length === 2 && !towns.some((t) => / i /.test(t))) return `entre ${towns[0]} i ${towns[1]}`;
  return `${deName(towns[0])} ${aName(towns.at(-1)!)}`;
}

/** «Costa Brava» → `costa-brava`, per a les àncores. */
export const slug = (s: string) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Les targetes: cada platja al punt del model més proper, i cada punt partit
 * per costa.
 *
 * El punt de davant de Montgat és el més proper de les platges de Vilassar de
 * Mar fins a Barcelona. Posat sencer sota la costa de la majoria de les seves
 * platges, Vilassar i Premià sortien al Barcelonès. Ara aquell punt fa dues
 * targetes —una al Maresme i una al Barcelonès— amb les mateixes xifres del
 * model, que és el que són: el mateix tros de mar.
 */
export function buildTrams(stretches: SeaStretch[], beaches: Beach[]): Tram[] {
  const byPoint = stretches.map(() => new Map<string, Beach[]>());
  for (const b of beaches) {
    let best = 0;
    for (let k = 1; k < stretches.length; k++) {
      if (d2(b.lat, b.lon, stretches[k].lat, stretches[k].lon)
        < d2(b.lat, b.lon, stretches[best].lat, stretches[best].lon)) best = k;
    }
    const list = byPoint[best].get(b.coast) ?? [];
    list.push(b);
    byPoint[best].set(b.coast, list);
  }

  const out: Tram[] = [];
  stretches.forEach((stretch, k) => {
    const parts = [...byPoint[k]]
      .map(([coast, list]) => [coast, list.slice().sort((a, b) => b.lat - a.lat)] as const)
      .sort((a, b) => b[1][0].lat - a[1][0].lat);
    for (const [coast, list] of parts) {
      out.push({
        id: `t-${k}-${slug(coast)}`,
        stretch,
        beaches: list,
        towns: [...new Set(list.map((b) => articleFirst(b.municipality)))],
        coast,
      });
    }
  });
  return out;
}
