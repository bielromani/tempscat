/**
 * Worker · el camp de pluja de la predicció, com a imatges del mapa.
 *
 * ## Què és i per què existeix
 *
 * El radar ensenya el passat. El futur no el pot ensenyar: la seva font pública
 * torna `nowcast: []` i el radar del Meteocat que sí que en té no es pot servir
 * en un web públic —és tarifa de difusió, i els seus termes prohibeixen
 * expressament redistribuir—. Ho vam mirar i està escrit al full de ruta.
 *
 * Però la pregunta de qui obre el radar no és «on plou»: és **«plourà aquí?»**,
 * i per contestar-la ja tenim la dada. La predicció es baixa cada dia a 3.190
 * punts, un cada 3,2 km de mitjana, amb la precipitació hora a hora. Això és una
 * malla prou densa per pintar-la com un camp damunt del mateix mapa.
 *
 * No és radar i la pàgina no ho dissimula: és un model, i porta el seu rètol.
 *
 * ## Per què imatges i no punts a l'SVG
 *
 * Perquè 3.190 cercles per hora, dotze hores, són 38.280 elements dins d'una
 * pàgina que ha de pesar el mateix que ara. Una imatge per hora és un `<image>`
 * i prou, i el navegador la interpola sense que li costi res. És el mateix camí
 * que ja fa el relleu: una imatge amb les seves coordenades en píxels del mosaic
 * del radar, i la pàgina només la col·loca.
 *
 * ## L'única cosa delicada d'aquí dins
 *
 * **On no hi ha punt no es pinta res.** Els 3.190 punts són de Catalunya, així
 * que el mar, França i l'Aragó es queden buits, i és correcte que es quedin
 * buits: no en tenim predicció. La temptació d'estirar el valor del punt més
 * proper fins a omplir el requadre faria un mapa més bonic i diria una cosa que
 * no sabem. El radi de cerca és de 12 km i el que en queda fora és transparent.
 *
 * Sortida: data/cache/field/<hora>.webp i data/cache/field/index.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import { build } from '../lib/paths.ts';
import { madridToUtc } from '../lib/madrid.ts';
import {
  CACHE, DAILY_LIMITS, QuotaGuard, markForPublish, publish, pullSnapshot, recordFreshness,
  syncState, writeSnapshot,
} from '../lib/store.ts';
import { CATALUNYA_BBOX, project, tileGrid } from '../../src/lib/mercator.ts';
import { callWeight } from '../../src/lib/variables.ts';
import { FORECAST_INDEX, forecastShard, type ForecastIndex } from '../../src/lib/shards.ts';
import { FIELD_DIR, fieldShard, ringShard, type FieldIndex } from '../../src/lib/field.ts';

/** Hores de futur que es pinten. Més enllà, la quantitat ja no és fiable. */
const HOURS = 12;

/**
 * Radi de cerca, en quilòmetres.
 *
 * Els punts són a 3,2 km de mitjana, així que amb dotze sempre se'n troben
 * uns quants a dins. El que hi ha per fora —el mar, França, l'Aragó— es queda
 * transparent, que és el que toca: allà no en tenim.
 */
const RADIUS_KM = 12;

/**
 * ── El voltant: el mar, França i l'Aragó ────────────────────────────────
 *
 * Els 3.190 punts són de Catalunya, així que el camp s'acabava **dins del
 * mapa que es veu**: la pluja es tallava en sec a la ratlla de la frontera i
 * a la costa, i això no es llegeix com «aquí no en sabem» sinó com un error
 * de dibuix. En un radar, que ho ensenya tot, encara més.
 *
 * La regla de no inventar-se res segueix igual de dreta: **no s'estira el
 * valor del punt més proper**. El que es fa és demanar la predicció també a
 * fora, en una malla molt més ampla, perquè allà no hi ha cap poble a qui
 * contestar-li res i només cal que el mapa digui cap on va l'aigua.
 *
 * Val 129 unitats de quota i es demana **un cop al dia**, quan la sèrie de la
 * predicció canvia d'hora zero —no a cada repintada ni a cada refresc de
 * nivell—. És l'1,3 % del sostre diari d'Open-Meteo.
 */
const RING_STEP = 0.25;

/**
 * La finestra que la pàgina del radar ensenya.
 *
 * És la mateixa que retalla `/radar`, i per això va amb la seva referència:
 * ampliar-la voldria dir pagar per punts que no es veuen, i encongir-la,
 * tornar a tenir la vora dins del mapa.
 */
const RING_BOX = { west: 0.05, east: 3.45, south: 40.45, north: 42.95 };

/**
 * Un pas de marge per fora de la finestra.
 *
 * El pes d'un punt s'apaga al seu radi —vegeu el bucle del càlcul— i sense
 * marge aquell esvaïment cauria **dins** del mapa: la pluja s'aniria aclarint
 * cap a la vora i semblaria que s'acaba allà. Amb un pas de més per cada
 * costat, l'esvaïment queda fora del retall.
 */
const RING_MARGIN = RING_STEP;

/**
 * A quina distància d'un punt de la malla densa ja no s'hi afegeix res.
 *
 * Dins de Catalunya hi ha un punt cada 3,2 km; posar-n'hi un altre a 20 km
 * de separació no millora el dibuix i sí que costa quota.
 */
const RING_MIN_KM = 15;

/**
 * El radi de cerca dels punts de fora, més ample perquè la malla ho és.
 *
 * Amb els 12 km dels de dins, una malla de 21 × 28 km deixaria forats entre
 * punt i punt i el mar sortiria clapejat, que és pitjor que buit. Amb
 * quaranta-cinc, cada casella en veu sempre uns quants i el camp surt continu:
 * el que evita que s'emboiri és que el pes s'apaga amb la distància, no el
 * radi curt.
 *
 * Que el radi sigui més gran no fa que el de fora s'imposi al de dins: la
 * ponderació és `1/d²`, i un punt a 25 km pesa setanta vegades menys que un
 * a 3. La costa es fon, no fa esglaó.
 */
const RING_RADIUS_KM = 45;

/**
 * La malla on es calcula, abans d'ampliar-la a la mida del mosaic.
 *
 * Es calcula a un quart i s'amplia amb interpolació. No és una drecera: la
 * dada té un punt cada 3,2 km i el mosaic un píxel cada 460 m, o sigui que
 * entre dos punts hi ha set píxels. Calcular-los tots un per un seria set
 * vegades més feina per dibuixar la mateixa corba suau.
 */
const DOWNSCALE = 4;

/**
 * A partir de quant es compta una casella com a mullada al registre.
 *
 * És el segon graó de l'escala i no el primer: el primer és el que fa
 * l'esvaïment i val 0,05, i comptar-lo faria que el registre digués el doble
 * de caselles amb pluja de les que es veuen.
 */
const WET_MM = 0.1;

interface Relief { x: number; y: number; w: number; h: number }
interface Point { id: string; lat: number; lon: number }
interface ForecastPointValues {
  [model: string]: { values?: { precipitation?: Array<number | null> } };
}
interface ForecastShard { times?: string[]; points: Record<string, ForecastPointValues> }

/**
 * L'escala de color, en mm/hora.
 *
 * Va de menys a més i el primer llindar és 0,1: per sota, la predicció diu
 * «gairebé res» i pintar-ho tapa el mapa sense dir res. L'alfa puja amb la
 * intensitat perquè la pluja fluixa deixi veure el terreny de sota, que és el
 * que fa que un mapa de pluja s'entengui.
 */
const SCALE: Array<{ mm: number; rgb: [number, number, number]; a: number }> = [
  /*
   * El primer graó és transparent a posta.
   *
   * Amb l'escala començant de cop a 0,1 mm/h, la vora de cada taca és una
   * ratlla dura: damunt del mar, on el camp travessa aquell llindar molt a poc
   * a poc, la ratlla es converteix en un escaló de vint-i-cinc quilòmetres i
   * el mapa sembla fet de rajoles. Amb aquest graó, l'alfa puja de zero a 110
   * entre 0,05 i 0,1 i la taca es fon per fora.
   *
   * El que hi ha entre 0,05 i 0,1 gairebé no es veu, que és el que toca: la
   * predicció allà diu «gairebé res» i no ha de tapar el terreny.
   */
  { mm: 0.05, rgb: [150, 200, 235], a: 0 },
  { mm: 0.1, rgb: [150, 200, 235], a: 110 },
  { mm: 0.5, rgb: [90, 160, 220], a: 140 },
  { mm: 1, rgb: [45, 115, 200], a: 170 },
  { mm: 2, rgb: [40, 160, 120], a: 190 },
  { mm: 5, rgb: [225, 195, 60], a: 205 },
  { mm: 10, rgb: [230, 140, 45], a: 215 },
  { mm: 20, rgb: [210, 60, 50], a: 225 },
  { mm: 40, rgb: [155, 40, 110], a: 235 },
];

/**
 * El color d'una intensitat, **interpolat** entre els graons de l'escala.
 *
 * Amb els graons a seques, cada llindar dibuixa una corba de nivell. Damunt de
 * Catalunya no es notava —el camp hi canvia de pressa i les corbes surten
 * primes i tortes, com les d'un radar— però damunt del mar, on la malla és de
 * 25 km i el valor varia a poc a poc, cada llindar es convertia en un
 * **rectangle**: el mapa semblava fet de rajoles i el que es veia era la
 * quadrícula de la malla, no la pluja.
 *
 * Interpolant, el camp es dibuixa tan suau com és. No s'hi guanya ni es perd
 * informació: els graons no els posava la dada, els posava la paleta.
 *
 * El llindar de baix es queda dur a posta. Per sota de 0,1 mm/h la predicció
 * diu «gairebé res», i esvair-ho cap a zero pintaria de blau mig país els dies
 * de plugim.
 */
function colorOf(mm: number): [number, number, number, number] {
  if (mm < SCALE[0].mm) return [0, 0, 0, 0];

  let lo = SCALE[0];
  let hi = SCALE[SCALE.length - 1];
  for (let k = 0; k < SCALE.length - 1; k++) {
    if (mm >= SCALE[k].mm && mm < SCALE[k + 1].mm) { lo = SCALE[k]; hi = SCALE[k + 1]; break; }
  }
  if (mm >= hi.mm) return [hi.rgb[0], hi.rgb[1], hi.rgb[2], hi.a];

  const t = (mm - lo.mm) / (hi.mm - lo.mm);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return [
    mix(lo.rgb[0], hi.rgb[0]),
    mix(lo.rgb[1], hi.rgb[1]),
    mix(lo.rgb[2], hi.rgb[2]),
    mix(lo.a, hi.a),
  ];
}

/**
 * `2026-09-08T22:00`, hora de rellotge de Madrid → segons des de l'epoch.
 *
 * ## Aquest número és una clau, no un adorn
 *
 * La pàgina del radar el fa servir per a l'`id` del radio de cada marc
 * (`rf-<time>`) i per al paràmetre `?t=`. Amb `Math.floor(NaN / 1000)` sortia
 * `NaN`, `JSON.stringify` el va escriure com a **`null`**, i els dotze marcs de
 * futur van compartir `id="rf-null"`: seixanta regles de CSS apuntant al mateix
 * radio. El resultat era que en arribar a la predicció s'encenien **les dotze
 * hores alhora, superposades**, i la barra ja no movia res — que és exactament
 * el que es veia: un dibuix que no continua el radar i que es queda clavat.
 *
 * Cap error, cap execució en vermell, i les dotze imatges eren correctes.
 *
 * El defecte era d'escriptura: `${t}:00:00Z` sobre una cadena que ja acaba en
 * `:00` dona `2026-09-08T22:00:00:00Z`, que no és cap data. I si s'hagués
 * escrit bé tampoc no hauria estat correcte, perquè aquestes hores són de
 * **Madrid** i no UTC: a l'estiu haurien anat dues hores desplaçades respecte
 * dels marcs del radar, dins del mateix array. `madridToUtc` ja existia per a
 * això.
 */
function epochOf(local: string): number {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error(`hora de predicció amb un format que no s'entén: ${local}`);
  const at = madridToUtc(+m[1], +m[2], +m[3], +m[4], +m[5]);
  const s = Math.floor(at.getTime() / 1000);
  if (!Number.isFinite(s)) throw new Error(`no s'ha pogut datar ${local}`);
  return s;
}

/** Distància en quilòmetres entre dues coordenades. */
function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

interface Ring {
  /** L'empremta de la predicció amb què es va demanar. */
  key: string;
  times: string[];
  points: Array<{ lat: number; lon: number; precipitation: Array<number | null> }>;
}

/**
 * La predicció del voltant, demanada un cop i reaprofitada a cada repintada.
 *
 * L'empremta és l'hora zero de la sèrie més el `refreshedAt` de cada nivell:
 * canvia exactament quan canvia la predicció de dins, i així el mar no es
 * queda amb el model del matí mentre Catalunya ja ensenya el del vespre. Amb
 * una repintada cada hora i un refresc quatre cops al dia, són quatre
 * peticions i no vint-i-quatre.
 */
async function loadRing(
  index: { data: ForecastIndex; }, dense: Point[], quota: QuotaGuard,
): Promise<Ring | null> {
  /*
   * L'empremta és l'hora zero de la sèrie, o sigui **un cop al dia**.
   *
   * Amb el `refreshedAt` de cada nivell a dins es tornaria a demanar a cada
   * refresc —quatre cops— i serien cinc-centes unitats de quota diaries per a
   * un tros de mapa que no conté cap poble. El preu és que a la tarda el mar
   * ensenya la passada del matí mentre Catalunya ja ensenya la del vespre; a
   * la costa la diferència la difumina la pondèracio, que dona setanta vegades
   * més pes al punt de terra que té a sobre que al de mar que té a 25 km.
   */
  const key = [index.data.times[0], index.data.times.length].join('|');

  const cached = await pullSnapshot<Ring>(ringShard());
  if (cached?.data?.key === key && cached.data.points.length) {
    console.log(`Voltant: ${cached.data.points.length} punts reaprofitats (la predicció no ha canviat)`);
    return cached.data;
  }

  // Índex per casella de mig grau, per no comparar cada candidat amb 3.190.
  const near = new Map<string, Point[]>();
  for (const p of dense) {
    const k = `${Math.floor(p.lat * 2)},${Math.floor(p.lon * 2)}`;
    if (!near.has(k)) near.set(k, []);
    near.get(k)!.push(p);
  }
  const covered = (lat: number, lon: number) => {
    const la = Math.floor(lat * 2);
    const lo = Math.floor(lon * 2);
    for (let i = la - 1; i <= la + 1; i++) {
      for (let j = lo - 1; j <= lo + 1; j++) {
        for (const p of near.get(`${i},${j}`) ?? []) {
          if (distKm(lat, lon, p.lat, p.lon) < RING_MIN_KM) return true;
        }
      }
    }
    return false;
  };

  const wanted: Array<{ lat: number; lon: number }> = [];
  for (let lat = RING_BOX.south - RING_MARGIN; lat <= RING_BOX.north + RING_MARGIN + 1e-9; lat += RING_STEP) {
    for (let lon = RING_BOX.west - RING_MARGIN; lon <= RING_BOX.east + RING_MARGIN + 1e-9; lon += RING_STEP) {
      const la = Math.round(lat * 1e4) / 1e4;
      const lo = Math.round(lon * 1e4) / 1e4;
      if (!covered(la, lo)) wanted.push({ lat: la, lon: lo });
    }
  }
  if (!wanted.length) return null;

  /*
   * Una unitat per punt, ni més ni menys.
   *
   * `callWeight` no baixa d'1 per ubicació per molt poc que se li demani, així
   * que demanar-hi una sola variable no ho abarateix — però demanar-ne més
   * tampoc no ho encariria fins a passar de deu. Es demana només la pluja
   * perquè és l'única que es pinta.
   */
  const cost = callWeight(1, 3, wanted.length);
  if (!quota.canSpend('open-meteo', cost)) {
    console.warn(`Voltant: no hi cap a la quota (${cost} unitats). Es pinta només Catalunya.`);
    return cached?.data ?? null;
  }

  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${wanted.map((p) => p.lat).join(',')}`
    + `&longitude=${wanted.map((p) => p.lon).join(',')}`
    + '&hourly=precipitation&timezone=Europe%2FMadrid&forecast_days=3';

  const res = await fetch(url, { headers: { 'user-agent': 'tempscat.cat' } });
  if (!res.ok) throw new Error(`el voltant no s'ha pogut demanar: HTTP ${res.status}`);
  // Open-Meteo torna `nan` sense cometes quan un punt cau fora del domini.
  const body = JSON.parse((await res.text()).replaceAll(':nan', ':null')) as Array<{
    latitude: number; longitude: number;
    hourly?: { time: string[]; precipitation: Array<number | null> };
  }>;
  quota.spend('open-meteo', cost);

  const rows = Array.isArray(body) ? body : [body];
  const points = rows
    .filter((r) => r.hourly?.time?.length)
    .map((r) => ({
      lat: r.latitude, lon: r.longitude,
      precipitation: r.hourly!.precipitation,
    }));
  const times = rows.find((r) => r.hourly?.time?.length)?.hourly!.time ?? [];

  if (!points.length || !times.length) {
    throw new Error('el voltant ha tornat sense cap sèrie');
  }

  const ring: Ring = { key, times, points };
  writeSnapshot(ringShard(), 'Open-Meteo · CC-BY 4.0', ring, times[0] ?? null);
  console.log(`Voltant: ${points.length} punts demanats de nou · ${cost} unitats`);
  return ring;
}

async function main() {
  await syncState();
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const relief = JSON.parse(readFileSync(build('geo/relleu.json'), 'utf8')) as Relief & {
    mosaic: { z: number; tile: number };
  };
  const points = JSON.parse(readFileSync(build('forecast-points.json'), 'utf8')) as Point[];

  /*
   * El requadre és **el mateix que el del relleu**, i es llegeix del seu fitxer
   * en comptes de tornar-lo a calcular. Les dues imatges s'han de superposar
   * exactament dins del mateix SVG; amb dos càlculs, el dia que un canviï, la
   * pluja quedaria desplaçada respecte de les muntanyes i res no fallaria.
   */
  const { x: bx, y: by, w: bw, h: bh } = relief;

  /*
   * La graella és la mateixa que la del radar, i surt de la mateixa funció.
   *
   * El primer intent projectava a píxels **del món** amb una fórmula escrita
   * aquí mateix, i el mosaic no comença a l'origen del món: comença a la
   * tessel·la `x0, y0`. Els punts queien a setze mil píxels d'on tocava, cap
   * no entrava al requadre i les dotze imatges van sortir buides —sense cap
   * error, dotze fitxers de dos quilobytes—. `project()` de `mercator.ts`
   * n'hi resta l'origen, i és la que fa servir la pàgina.
   */
  const grid = tileGrid(CATALUNYA_BBOX, relief.mosaic.z, relief.mosaic.tile);

  const index = await pullSnapshot<ForecastIndex>(FORECAST_INDEX);
  if (!index) throw new Error('no hi ha índex de predicció: el worker de predicció no ha corregut mai');

  const times = index.data.times;
  const precip = new Map<string, Array<number | null>>();
  for (const c of index.data.comarques) {
    // Sense captura, com a `forecast-refresh`: seguir voldria dir publicar un
    // camp al qual li falta una comarca sencera, i això no es veuria.
    const shard = await pullSnapshot<ForecastShard>(forecastShard(c.codi));
    if (!shard) continue;
    for (const [id, models] of Object.entries(shard.data.points)) {
      const v = models.best_match?.values?.precipitation
        ?? Object.values(models)[0]?.values?.precipitation;
      /*
       * Desplaçat una posició, com a `mergeHourly`.
       *
       * Open-Meteo posa a l'hora `T` la pluja que ha caigut **entre `T-1` i
       * `T`**, i el que ha d'ensenyar el marc etiquetat `T` és la que caurà de
       * `T` a `T+1`. Aquest worker no passa per `mergeHourly` —només vol una
       * variable de 3.190 punts— així que el desplaçament es fa aquí, un cop,
       * en comptes de dins del bucle que recorre cinquanta mil caselles.
       *
       * Amb `slice(1)`, l'índex `i` de `times` torna a apuntar al valor que
       * toca, i l'última hora de la sèrie es queda sense: per això `wanted`
       * no hi arriba mai.
       */
      if (v) precip.set(id, v.slice(1));
    }
  }
  if (!precip.size) throw new Error('cap punt amb precipitació als trossos de predicció');

  /*
   * El voltant no atura el worker si falla.
   *
   * És el que evita que el dibuix es talli a la frontera, però el que la
   * pàgina ha de contestar és «plourà al meu poble», i això surt dels 3.190
   * punts de dins. Si Open-Meteo no contesta o la quota s'ha acabat, val més
   * un mapa que s'acaba a la ratlla que cap mapa.
   */
  const ring = await loadRing(index, points, quota).catch((err) => {
    console.warn(`Voltant: ${String(err).slice(0, 160)} · es pinta només Catalunya`);
    return null;
  });

  /*
   * Les hores que es pinten: de la següent hora en punt endavant.
   *
   * Es compara la cadena de l'hora i no un índex: els trossos comparteixen
   * `times` per l'índex, però el que ha de quadrar amb el rellotge de qui mira
   * la pàgina és la marca de temps, no la posició.
   *
   * I es compara **en hora de Madrid**, que és en la que Open-Meteo torna la
   * sèrie. Amb `toISOString()`, que és UTC, a l'estiu la finestra sortia dues
   * hores enrere: la primera imatge era d'una hora que ja havia passat i a
   * l'altre extrem en faltaven dues. Les xifres eren correctes, només eren
   * d'una altra hora —el mateix error que ja va costar la predicció correguda
   * un dia—.
   */
  const nowIso = new Date()
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .replace(' ', 'T')
    .slice(0, 13);
  const wanted = times
    .map((t, i) => ({ t, i }))
    // L'última hora no té acumulat: el seu tram acabaria a l'hora següent, que
    // no hi és. Fora d'aquí es quedaria transparent, que és pitjor que no ser-hi.
    .slice(0, -1)
    .filter(({ t }) => t.slice(0, 13) > nowIso)
    .slice(0, HOURS);

  if (!wanted.length) {
    throw new Error(`la predicció no arriba a cap hora futura: l'última és ${times.at(-1)}`);
  }

  const placed: Array<{ px: number; py: number; id: string; lat: number }> = [];
  for (const p of points) {
    if (!precip.has(p.id)) continue;
    const [px, py] = project(grid, p.lon, p.lat);
    placed.push({ px, py, id: p.id, lat: p.lat });
  }

  const gw = Math.ceil(bw / DOWNSCALE);
  const gh = Math.ceil(bh / DOWNSCALE);
  /** Metres per píxel del mosaic a la latitud mitjana: per passar km a píxels. */
  const midLat = placed.reduce((a, p) => a + p.lat, 0) / placed.length;
  const world = relief.mosaic.tile * 2 ** relief.mosaic.z;
  const mPerPx = (40075016.686 * Math.cos((midLat * Math.PI) / 180)) / world;
  const radiusPx = (RADIUS_KM * 1000) / mPerPx;

  /*
   * Un índex per caselles, i no mirar els 3.190 punts a cada casella.
   *
   * Sense ell són 50.000 caselles per 3.190 punts i dotze hores: mil nou-cents
   * milions de distàncies per a un dibuix que en necessita unes poques. Amb
   * caselles de la mida del radi, cada casella només ha de mirar les nou del
   * seu voltant, i cap punt que hi pugui entrar es queda fora.
   */
  /*
   * Dues capes, cadascuna amb el seu radi i el seu índex.
   *
   * La densa i la del voltant no es poden barrejar en un sol índex: si les
   * caselles fossin del radi gran, cada una en tindria vuit-cents a dins i el
   * càlcul es multiplicaria per deu; si fossin del petit, els punts de fora no
   * arribarien mai a la casella del costat. Cada capa porta les seves i totes
   * dues miren les nou del voltant, que és el que garanteix que no se'n perd
   * cap dins del radi.
   */
  interface Layer {
    name: string;
    radiusPx: number;
    /** El valor d'aquest punt a l'hora `i` de `times`. */
    at: (p: { k: string }, i: number) => number | null | undefined;
    bucket: Map<string, Array<{ px: number; py: number; k: string }>>;
    n: number;
  }

  const indexBy = (
    pts: Array<{ px: number; py: number; k: string }>, r: number,
  ): Map<string, Array<{ px: number; py: number; k: string }>> => {
    const m = new Map<string, Array<{ px: number; py: number; k: string }>>();
    for (const p of pts) {
      const key = `${Math.floor(p.px / r)},${Math.floor(p.py / r)}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    }
    return m;
  };

  const layers: Layer[] = [{
    name: 'Catalunya',
    radiusPx,
    at: (p, i) => precip.get(p.k)?.[i],
    bucket: indexBy(placed.map((p) => ({ px: p.px, py: p.py, k: p.id })), radiusPx),
    n: placed.length,
  }];

  if (ring) {
    /*
     * El voltant s'alinea **per marca de temps i no per posició**.
     *
     * La seva sèrie arrenca a les zero hores del dia que es va demanar i la de
     * dins pot ser d'un altre dia — és exactament el que ja va córrer un dia
     * sencer la predicció i el que arregla `forecast-align.ts`. Buscant l'hora
     * per nom, la pregunta «quina posició li toca» no arriba a fer-se.
     *
     * I porta el mateix desplaçament que la resta: el valor de l'hora `T` és
     * el del tram anterior, així que el que es vol és el de `T+1`.
     */
    const ringAt = new Map<string, number>();
    ring.times.forEach((t, i) => ringAt.set(t.slice(0, 13), i));
    const ringPts = ring.points.map((p, k) => {
      const [px, py] = project(grid, p.lon, p.lat);
      return { px, py, k: String(k) };
    });
    const ringRadiusPx = (RING_RADIUS_KM * 1000) / mPerPx;
    layers.push({
      name: 'voltant',
      radiusPx: ringRadiusPx,
      at: (p, i) => {
        const j = ringAt.get(times[i].slice(0, 13));
        return j == null ? null : ring.points[Number(p.k)]?.precipitation?.[j + 1];
      },
      bucket: indexBy(ringPts, ringRadiusPx),
      n: ringPts.length,
    });
  }

  console.log(`Punts amb predicció: ${placed.length} de ${points.length}`);
  console.log(`Requadre: ${bw}x${bh} px del mosaic · malla de càlcul ${gw}x${gh}`);
  console.log(`Radi: ${RADIUS_KM} km = ${radiusPx.toFixed(1)} px`);
  if (ring) {
    console.log(`Voltant: ${ring.points.length} punts · radi ${RING_RADIUS_KM} km`);
  }
  console.log();

  const dir = join(CACHE, FIELD_DIR);
  mkdirSync(dir, { recursive: true });
  /*
   * L'índex de la volta anterior, per saber quines imatges ja hi són igual.
   * Del magatzem, que és l'únic lloc on hi és a totes dues bandes.
   */
  const previous = (await pullSnapshot<FieldIndex>(fieldShard()))?.data ?? null;

  const written: FieldIndex['hours'] = [];
  /** Hores que ja hi eren igual i no s'han tornat a pujar. */
  let kept = 0;

  for (const { t, i } of wanted) {
    const raw = Buffer.alloc(gw * gh * 4);
    let wet = 0;
    let covered = 0;
    let peak = 0;

    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const px = bx + (gx + 0.5) * DOWNSCALE;
        const py = by + (gy + 0.5) * DOWNSCALE;

        /*
         * Mitjana ponderada per l'invers del quadrat de la distància.
         *
         * Amb l'invers a la primera, un punt a deu quilòmetres encara estira
         * el valor tant com per escampar una tempesta per mitja comarca. Amb
         * el quadrat, el que mana és el que hi ha a sobre.
         */
        let sum = 0;
        let weight = 0;
        for (const layer of layers) {
          const r = layer.radiusPx;
          const cx = Math.floor(px / r);
          const cy = Math.floor(py / r);
          for (let ky = cy - 1; ky <= cy + 1; ky++) {
            for (let kx = cx - 1; kx <= cx + 1; kx++) {
              for (const p of layer.bucket.get(`${kx},${ky}`) ?? []) {
                const dx = p.px - px;
                const dy = p.py - py;
                const d2 = dx * dx + dy * dy;
                if (d2 > r * r) continue;
                const v = layer.at(p, i);
                if (v == null) continue;
                /*
                 * El pes s'apaga al radi, i no es talla.
                 *
                 * Amb `1/d²` a seques, un punt sol —i al mar n'hi ha molts que
                 * ho són— pinta un **disc uniforme del seu valor amb la vora
                 * tallada en sec**, perquè si és l'únic que hi contribueix la
                 * mitjana ponderada és ell mateix valgui el que valgui la
                 * distància. El mar sortia a llunes, amb esglaons de trenta
                 * quilòmetres, i semblava una avaria del dibuix.
                 *
                 * Multiplicant per `(1 − d/r)²` el pes arriba a zero just al
                 * radi: el disc es fon en comptes d'acabar-se. És la ponderació
                 * de Shepard modificada, i dins de Catalunya no es nota perquè
                 * allà sempre hi ha desenes de punts a prop.
                 */
                const fade = 1 - Math.sqrt(d2) / r;
                const w = (fade * fade) / Math.max(d2, 1);
                sum += v * w;
                weight += w;
              }
            }
          }
        }

        const o = (gy * gw + gx) * 4;
        if (!weight) continue;
        covered++;
        const mm = sum / weight;
        if (mm > peak) peak = mm;
        if (mm >= WET_MM) wet++;
        const [r, g, b, a] = colorOf(mm);
        raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
      }
    }

    const webp = await sharp(raw, { raw: { width: gw, height: gh, channels: 4 } })
      .resize(bw, bh, { kernel: 'cubic' })
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer();

    /*
     * Si la imatge d'aquesta hora ja és aquesta, no es torna a pujar.
     *
     * Aquest worker es repinta cada hora perquè el futur del radar no s'encongeixi
     * al llarg del dia, i entre una volta i la següent **onze de les dotze hores
     * són idèntiques**: la predicció no ha canviat i només entra una hora nova
     * per la cua. Pujar-les totes serien 288 escriptures diàries per a dotze de
     * bones, i R2 cobra per operació. És el mateix error que ja va costar 4.032
     * pujades diàries idèntiques al radar i que les càmeres ja eviten.
     *
     * La comparació és byte a byte i no per data: `sharp` és determinista amb
     * la mateixa entrada, així que si el contingut no ha canviat el fitxer surt
     * igual.
     */
    const name = t.slice(0, 13).replace(/[-T]/g, '');
    const hash = createHash('sha256').update(webp).digest('hex').slice(0, 16);
    writeFileSync(join(dir, `${name}.webp`), webp);
    /*
     * Es compara amb **l'índex publicat**, no amb el fitxer del disc.
     *
     * A GitHub Actions el disc arrenca buit, així que mirant-lo la comparació
     * sortiria sempre negativa i es tornarien a pujar les dotze cada hora —288
     * escriptures diàries per a dotze de bones, i R2 cobra per operació—. Es
     * va escriure primer mirant el disc i anava bé en local i no hauria fet res
     * en producció: exactament la trampa que ja té fitxa a AGENTS.md.
     */
    if (previous?.hours.find((h) => h.name === name)?.hash === hash) {
      kept++;
    } else {
      markForPublish(`${FIELD_DIR}/${name}.webp`);
    }
    written.push({ time: epochOf(t), iso: t, name, hash });

    /*
     * El màxim, i no només el percentatge de caselles mullades.
     *
     * Amb el percentatge sol, una hora amb trenta caselles de pluja entre
     * dotze mil sortia com a «0 %» i semblava que el dibuix no funcionés. El
     * màxim diu si hi ha aigua i quanta, que és el que es vol saber quan es
     * mira el registre per veure si el camp s'ha pintat de debo.
     */
    console.log(
      `  ${t}  ${(webp.length / 1024).toFixed(0)} kB`
      + ` · ${((covered / (gw * gh)) * 100).toFixed(0)} % amb dada`
      + ` · ${wet} caselles amb pluja`
      + ` · màxim ${peak.toFixed(1)} mm/h`,
    );
  }

  /*
   * Dues hores no poden compartir instant, i cap no pot quedar sense.
   *
   * És la comprovació que hauria estalviat el `rf-null`: aquell número és
   * l'`id` d'un element del DOM, i dos elements amb el mateix `id` no donen
   * cap error —el navegador es queda amb el primer i les regles de CSS de tots
   * els altres l'apunten a ell—. Un índex amb una clau repetida no s'ha de
   * publicar; val més quedar-se amb el de la volta anterior.
   */
  const seen = new Set<number>();
  for (const h of written) {
    if (seen.has(h.time)) {
      throw new Error(`dues hores amb el mateix instant (${h.time}, ${h.iso}): l'índex no es publica`);
    }
    seen.add(h.time);
  }

  const fieldIndex: FieldIndex = {
    box: { x: bx, y: by, w: bw, h: bh },
    mosaic: relief.mosaic,
    hours: written,
    points: placed.length,
    source: 'Open-Meteo · CC-BY 4.0',
  };
  writeSnapshot(fieldShard(), 'Open-Meteo · CC-BY 4.0', fieldIndex, written[0]?.iso ?? null);

  recordFreshness({
    source: 'forecast-field',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: index.dataTs ?? null,
    /*
     * El mateix límit que la predicció, perquè el camp **és** la predicció.
     *
     * No té rellotge propi: es torna a pintar quan aquella es refresca, i el
     * nivell més lent va un cop al dia. Amb set hores —que és el que hi havia—
     * sortia «endarrerida» amb les imatges acabades de fer, i un rètol que
     * sempre està en roig deixa d'avisar de res. És la mateixa trampa que ja
     * va passar amb els rècords de la XEMA i amb els avisos de l'AEMET: el
     * límit ha de ser el cicle real de la font.
     */
    stalenessLimitMin: 60 * 14,
    rows: written.length,
    apiCalls: 0,
  });

  if (kept) {
    console.log(`
${kept} de ${written.length} hores ja hi eren igual: no s'han tornat a pujar.`);
  }
  console.log(`\n${quota.report()}`);
  console.log(`→ ${written.length} hores a data/cache/${FIELD_DIR}/ (${((Date.now() - started) / 1000).toFixed(1)} s)`);

  const pub = await publish();
  if (!pub.skipped) {
    console.log(`Publicat a l'emmagatzematge: ${pub.uploaded} fitxers · ${(pub.bytes / 1048576).toFixed(1)} MB`);
  }
}

main().catch((err) => {
  recordFreshness({
    source: 'forecast-field', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 60 * 14, rows: 0, apiCalls: 0, error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
