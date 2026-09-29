/**
 * Worker · el camp de vent de la predicció, per al mapa que es pot moure.
 *
 * ## Què és
 *
 * Una graella regular de vent —les components u i v— per a cadascuna de les
 * dotze hores següents, que `/mapa/interactiu` mou amb partícules. Surt de la
 * predicció que ja es baixa per als 3.190 punts, més un anell de punts de fora
 * —el mar, França i l'Aragó— perquè el camp no s'acabi a la ratlla. La forma
 * del fitxer i com es llegeix són a `src/lib/wind.ts`.
 *
 * ## Per què es diu «field»
 *
 * Fins al 29 de setembre de 2026 aquest worker pintava sobretot **el camp de
 * pluja**: la precipitació dels 3.190 punts interpolada en una imatge per hora,
 * que feia de futur del radar a `/radar`, a `/mapa/interactiu` i a la fitxa.
 * El redisseny el va treure de les tres —el radar torna a ser només passat i
 * present— i les imatges es van quedar sense cap lector, així que es van deixar
 * de pintar i de publicar. El vent sortia del mateix recorregut i es queda.
 *
 * El nom del fitxer, el de l'script (`worker:field`) i el de la font a `/estat`
 * (`forecast-field`) no es canvien: el registre de frescor va lligat al nom de
 * la font, i canviant-lo `/estat` perdria l'historial d'errors d'aquest worker.
 *
 * Sortida: data/cache/wind/<hora>.png i data/cache/wind/index.json, i el
 * voltant a data/cache/field/voltant.json, que només llegeix aquest worker.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import { build } from '../lib/paths.ts';
import { madridToUtc } from '../lib/madrid.ts';
import {
  CACHE, DAILY_LIMITS, QuotaGuard, markForPublish, publish, pullSnapshot, recordFreshness, reportFailure,
  syncState, writeSnapshot,
} from '../lib/store.ts';
import { callWeight } from '../../src/lib/variables.ts';
import { FORECAST_INDEX, forecastShard, type ForecastIndex } from '../../src/lib/shards.ts';
import {
  WIND_DIR, WIND_MAX, WIND_STEP, windEncode, windShard,
  type WindHour, type WindIndex,
} from '../../src/lib/wind.ts';
import { MAP_BOX } from '../../src/lib/webmap.ts';
import { windGrid, type WindPoint } from '../lib/wind-grid.ts';

/** Hores de futur que es calculen: les que la barra del mapa pot recórrer. */
const HOURS = 12;

/**
 * La predicció del voltant —el mar, França i l'Aragó—, desada a part.
 *
 * Va al seu tros i no dins de l'índex del vent per una raó de cost: l'índex el
 * llegeix la pàgina del mapa a cada visita i només necessita saber quines hores
 * hi ha, mentre que això són tres dies de sèrie de 129 punts que **només**
 * llegeix aquest worker. És la mateixa regla que parteix la resta: una pàgina
 * baixa el que ensenya.
 *
 * Es queda a `field/` i no passa a `wind/` perquè el tros de la volta anterior
 * és el que es fa servir quan la quota no deixa demanar-ne un de nou: movent-lo,
 * la primera volta sense quota no en trobaria cap.
 */
const RING_SHARD = 'field/voltant';

/**
 * ── El voltant: el mar, França i l'Aragó ────────────────────────────────
 *
 * Els 3.190 punts són de Catalunya, i el mapa que es mou ensenya també el mar,
 * França i l'Aragó. Sense res a fora, les caselles de la graella que queden a
 * més de 40 km de qualsevol punt no en tindrien cap a l'abast —`windGrid` les
 * deixa en calma i el worker ho diu— i les partícules s'aturarien en sec a la
 * frontera i a la costa.
 *
 * La regla de no inventar-se res segueix igual de dreta: **no s'estira el
 * valor del punt més proper**. El que es fa és demanar la predicció també a
 * fora, en una malla molt més ampla, perquè allà no hi ha cap poble a qui
 * contestar-li res i només cal que el mapa digui cap on va l'aire.
 *
 * Val 129 unitats de quota i es demana **un cop al dia**, quan la sèrie de la
 * predicció canvia d'hora zero —no a cada volta ni a cada refresc de nivell—.
 * És l'1,3 % del sostre diari d'Open-Meteo.
 */
const RING_STEP = 0.25;

/**
 * Un pas de marge per fora de la finestra.
 *
 * Sense ell, les caselles de la vora del mapa només veurien punts cap a dins, i
 * el vent del caire seria el de vint-i-cinc quilòmetres més endins. Amb un pas
 * de més per cada costat, cada casella en té a totes bandes.
 */
const RING_MARGIN = RING_STEP;

/**
 * A quina distància d'un punt de la malla densa ja no s'hi afegeix res.
 *
 * Dins de Catalunya hi ha un punt cada 3,2 km; posar-n'hi un altre a 20 km
 * de separació no millora el dibuix i sí que costa quota.
 */
const RING_MIN_KM = 15;

interface Point { id: string; lat: number; lon: number }
interface ForecastValues {
  wind_speed?: Array<number | null>;
  wind_direction?: Array<number | null>;
}
interface ForecastPointValues {
  [model: string]: { values?: ForecastValues };
}
interface ForecastShard { times?: string[]; points: Record<string, ForecastPointValues> }

/**
 * `2026-09-08T22:00`, hora de rellotge de Madrid → segons des de l'epoch.
 *
 * ## Aquest número és una clau, no un adorn
 *
 * És el que el mapa fa servir per trobar l'hora que toca, i `windField()`
 * descarta les hores que no el porten. Amb `Math.floor(NaN / 1000)` sortia
 * `NaN`, `JSON.stringify` el va escriure com a **`null`**, i els dotze marcs de
 * futur del radar —quan el radar en tenia— van compartir `id="rf-null"`: en
 * arribar a la predicció s'encenien totes les hores alhora i la barra ja no
 * movia res. Cap error, cap execució en vermell, i les imatges eren correctes.
 *
 * El defecte era d'escriptura: `${t}:00:00Z` sobre una cadena que ja acaba en
 * `:00` dona `2026-09-08T22:00:00:00Z`, que no és cap data. I si s'hagués
 * escrit bé tampoc no hauria estat correcte, perquè aquestes hores són de
 * **Madrid** i no UTC. `madridToUtc` ja existia per a això.
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
  /**
   * L'empremta de la predicció amb què es va demanar.
   *
   * Hi va **la llista de variables** a dins. Sense això, el dia que se n'hi
   * afegeix o se n'hi treu una, l'empremta no canvia, el tros desat segueix
   * valent i el voltant es queda amb les variables d'abans fins que la
   * predicció es refresqui sola — o sigui fins a un dia, amb el camp de vent
   * acabant-se a la frontera i cap error enlloc.
   */
  key: string;
  times: string[];
  points: Array<{
    lat: number; lon: number;
    /** km/h i graus d'on ve, com els dona Open-Meteo. Opcionals: si un punt
     *  torna sense la sèrie, no entra al camp. */
    wind_speed?: Array<number | null>;
    wind_direction?: Array<number | null>;
  }>;
}

/**
 * El que se li demana al voltant: només el vent.
 *
 * Fins al 29 de setembre de 2026 també s'hi demanava la precipitació, per al
 * camp de pluja. Treure-la **no estalvia cap unitat**: `callWeight` fa
 * `max(1, variables/10) × …`, i amb aquell terra a 1 dues variables i tres
 * valen exactament el mateix. Els 129 punts segueixen costant 129 unitats.
 */
const RING_VARS = ['wind_speed_10m', 'wind_direction_10m'] as const;

/**
 * La predicció del voltant, demanada un cop i reaprofitada a cada volta.
 *
 * L'empremta és l'hora zero de la sèrie de dins: canvia quan canvia la
 * predicció de dins, i així el mar no es queda amb el model d'ahir mentre
 * Catalunya ja ensenya el d'avui.
 */
async function loadRing(
  index: { data: ForecastIndex; }, dense: Point[], quota: QuotaGuard,
): Promise<Ring | null> {
  /*
   * L'empremta és l'hora zero de la sèrie, o sigui **un cop al dia**.
   *
   * Amb el `refreshedAt` de cada nivell a dins es tornaria a demanar a cada
   * refresc —quatre cops— i serien cinc-centes unitats de quota diàries per a
   * un tros de mapa que no conté cap poble. El preu és que a la tarda el mar
   * ensenya la passada del matí mentre Catalunya ja ensenya la del vespre; a
   * la costa la diferència la difumina la ponderació, que dona molt més pes al
   * punt de terra que té a sobre que al de mar que té a 25 km.
   */
  const key = [index.data.times[0], index.data.times.length, RING_VARS.join(',')].join('|');

  const cached = await pullSnapshot<Ring>(RING_SHARD);
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

  /*
   * La finestra és `MAP_BOX`, la mateixa que cobreix la graella de vent, i no
   * una còpia dels seus graus. Hi havia una còpia —la del camp de pluja, que
   * retallava `/radar`— amb els mateixos números; el dia que un dels dos
   * canviés, el voltant pagaria punts que no es veuen o tornaria a deixar la
   * vora del mapa sense punts, i res no fallaria.
   */
  const wanted: Array<{ lat: number; lon: number }> = [];
  for (let lat = MAP_BOX.south - RING_MARGIN; lat <= MAP_BOX.north + RING_MARGIN + 1e-9; lat += RING_STEP) {
    for (let lon = MAP_BOX.west - RING_MARGIN; lon <= MAP_BOX.east + RING_MARGIN + 1e-9; lon += RING_STEP) {
      const la = Math.round(lat * 1e4) / 1e4;
      const lo = Math.round(lon * 1e4) / 1e4;
      if (!covered(la, lo)) wanted.push({ lat: la, lon: lo });
    }
  }
  if (!wanted.length) return null;

  // Una unitat per punt, ni més ni menys: vegeu `RING_VARS`.
  const cost = callWeight(RING_VARS.length, 3, wanted.length);
  if (!quota.canSpend('open-meteo', cost)) {
    console.warn(`Voltant: no hi cap a la quota (${cost} unitats). Es fa servir el de la volta anterior, si n'hi ha.`);
    return cached?.data ?? null;
  }

  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${wanted.map((p) => p.lat).join(',')}`
    + `&longitude=${wanted.map((p) => p.lon).join(',')}`
    + `&hourly=${RING_VARS.join(',')}&timezone=Europe%2FMadrid&forecast_days=3`;

  const res = await fetch(url, { headers: { 'user-agent': 'tempscat.cat' } });
  if (!res.ok) throw new Error(`el voltant no s'ha pogut demanar: HTTP ${res.status}`);
  // Open-Meteo torna `nan` sense cometes quan un punt cau fora del domini.
  const body = JSON.parse((await res.text()).replaceAll(':nan', ':null')) as Array<{
    latitude: number; longitude: number;
    hourly?: {
      time: string[];
      wind_speed_10m?: Array<number | null>;
      wind_direction_10m?: Array<number | null>;
    };
  }>;
  quota.spend('open-meteo', cost);

  const rows = Array.isArray(body) ? body : [body];
  const points = rows
    .filter((r) => r.hourly?.time?.length)
    .map((r) => ({
      lat: r.latitude, lon: r.longitude,
      wind_speed: r.hourly!.wind_speed_10m,
      wind_direction: r.hourly!.wind_direction_10m,
    }));
  const times = rows.find((r) => r.hourly?.time?.length)?.hourly!.time ?? [];

  if (!points.length || !times.length) {
    throw new Error('el voltant ha tornat sense cap sèrie');
  }

  const ring: Ring = { key, times, points };
  writeSnapshot(RING_SHARD, 'Open-Meteo · CC-BY 4.0', ring, times[0] ?? null);
  console.log(`Voltant: ${points.length} punts demanats de nou · ${cost} unitats`);
  return ring;
}

async function main() {
  await syncState('forecast-field');
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const points = JSON.parse(readFileSync(build('forecast-points.json'), 'utf8')) as Point[];

  const index = await pullSnapshot<ForecastIndex>(FORECAST_INDEX);
  if (!index) throw new Error('no hi ha índex de predicció: el worker de predicció no ha corregut mai');

  const times = index.data.times;
  /*
   * El vent de cada punt, dels 43 trossos de la predicció.
   *
   * No costa cap petició a Open-Meteo: la velocitat i la direcció ja són a
   * `ESSENTIAL_HOURLY` i els 3.190 punts les porten.
   */
  const wind = new Map<string, { speed: Array<number | null>; direction: Array<number | null> }>();
  for (const c of index.data.comarques) {
    // Sense captura, com a `forecast-refresh`: seguir voldria dir publicar un
    // camp al qual li falta una comarca sencera, i això no es veuria.
    const shard = await pullSnapshot<ForecastShard>(forecastShard(c.codi));
    if (!shard) continue;
    for (const [id, models] of Object.entries(shard.data.points)) {
      /*
       * El vent **no** es desplaça una hora, i això no és cap descuit.
       *
       * A Open-Meteo la pluja de l'hora `T` és la que ha caigut entre `T-1` i
       * `T` —per això `mergeHourly` la llegeix a `i + 1`— però la velocitat i
       * la direcció són **instantànies**: el valor de `T` és el vent que fa a
       * les `T`, que és exactament el que ha d'ensenyar l'hora `T` del mapa. A
       * `variables.ts`, `precedingHour` està posat a la pluja i a la ratxa, i
       * no a aquestes dues.
       *
       * Desplaçant-les «per coherència» amb la pluja, cada hora del mapa
       * portaria el vent de l'hora següent, i res no fallaria.
       */
      const w = models.best_match?.values ?? Object.values(models)[0]?.values;
      if (w?.wind_speed && w.wind_direction) {
        wind.set(id, { speed: w.wind_speed, direction: w.wind_direction });
      }
    }
  }
  /*
   * Sense cap punt de dins no es publica res.
   *
   * El llindar de cent punts de més avall no ho atura: el voltant sol ja en
   * porta 129. Sortiria un camp suau i versemblant fet només amb la malla de
   * fora, a 25 km, sense cap dada de Catalunya a dins.
   */
  if (!wind.size) throw new Error('cap punt amb vent als trossos de predicció');

  /*
   * El voltant no atura el worker si falla.
   *
   * Sense ell, les caselles que queden lluny de Catalunya es queden en calma
   * —el worker ho diu— però el vent de dins, que és el de qui mira el seu
   * poble, surt sencer. Si Open-Meteo no contesta o la quota s'ha acabat, val
   * més un camp que s'acaba a la ratlla que cap camp.
   */
  const ring = await loadRing(index, points, quota).catch((err) => {
    console.warn(`Voltant: ${String(err).slice(0, 160)} · el vent només surt dels punts de Catalunya`);
    return null;
  });

  /*
   * Les hores que es calculen: de la següent hora en punt endavant.
   *
   * Es compara la cadena de l'hora i no un índex: els trossos comparteixen
   * `times` per l'índex, però el que ha de quadrar amb el rellotge de qui mira
   * la pàgina és la marca de temps, no la posició.
   *
   * I es compara **en hora de Madrid**, que és en la que Open-Meteo torna la
   * sèrie. Amb `toISOString()`, que és UTC, a l'estiu la finestra sortia dues
   * hores enrere: la primera hora ja havia passat i a l'altre extrem en
   * faltaven dues. Les xifres eren correctes, només eren d'una altra hora —el
   * mateix error que ja va costar la predicció correguda un dia—.
   */
  const nowIso = new Date()
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .replace(' ', 'T')
    .slice(0, 13);
  const wanted = times
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.slice(0, 13) > nowIso)
    .slice(0, HOURS);

  if (!wanted.length) {
    throw new Error(`la predicció no arriba a cap hora futura: l'última és ${times.at(-1)}`);
  }

  /*
   * El voltant s'alinea **per marca de temps i no per posició**.
   *
   * `windGrid` llegeix l'hora `i` de cada punt, i `i` és una posició de la
   * sèrie de dins. La del voltant arrenca a les zero hores del dia en què es va
   * demanar, i la de dins pot ser d'un altre dia: passa si el voltant es torna
   * a demanar entre la mitjanit i el primer refresc del dia —el primer cop que
   * canvia `RING_VARS`, per exemple— o si la quota obliga a fer servir el de la
   * volta anterior. Llegit per posició, el mar portaria el vent de vint-i-quatre
   * hores més tard, que és exactament el que ja va córrer un dia sencer la
   * predicció i el que arregla `forecast-align.ts`.
   *
   * El camp de pluja ja el llegia per hora. El de vent, que el llegia per
   * posició, no ho va notar mai perquè gairebé sempre coincideixen: quan ho
   * fan, això dona els mateixos números.
   */
  const ringAt = new Map<string, number>();
  ring?.times.forEach((t, j) => ringAt.set(t.slice(0, 13), j));
  const onTimes = (series: Array<number | null>) => times.map((t) => {
    const j = ringAt.get(t.slice(0, 13));
    return j == null ? null : series[j] ?? null;
  });

  const windPoints: WindPoint[] = [];
  for (const p of points) {
    const w = wind.get(p.id);
    if (w) windPoints.push({ lat: p.lat, lon: p.lon, speed: w.speed, direction: w.direction });
  }
  const inside = windPoints.length;
  for (const r of ring?.points ?? []) {
    if (r.wind_speed && r.wind_direction) {
      windPoints.push({
        lat: r.lat, lon: r.lon, speed: onTimes(r.wind_speed), direction: onTimes(r.wind_direction),
      });
    }
  }

  const windDir = join(CACHE, WIND_DIR);
  mkdirSync(windDir, { recursive: true });
  /*
   * L'índex de la volta anterior, per saber quines hores ja hi són igual.
   * Del magatzem, que és l'únic lloc on hi és a totes dues bandes.
   */
  const previousWind = (await pullSnapshot<WindIndex>(windShard()))?.data ?? null;
  const windHours: WindHour[] = [];
  let windKept = 0;

  if (windPoints.length < 100) {
    /*
     * Sense prou punts no es publica un camp de vent: es deixa el de la volta
     * anterior. Amb quatre punts la interpolació dona un camp suau i
     * versemblant que no descriu res, i **això no es veu mirant-lo**.
     */
    console.warn(`Vent: només ${windPoints.length} punts amb vent. No es publica.`);
  } else {
    console.log(
      `Vent: ${windPoints.length} punts (${inside} de Catalunya, ${windPoints.length - inside} del voltant)`
      + ` · graella de ${WIND_STEP}°`,
    );

    for (const { t, i } of wanted) {
      const g = windGrid(windPoints, i, MAP_BOX, WIND_STEP);

      /*
       * Cap casella sense dada. Amb el voltant demanat no n'hi hauria d'haver
       * ni una, i si n'hi ha vol dir que el rectangle del mapa ha crescut o
       * que el voltant no ha arribat: val més dir-ho que publicar un camp amb
       * un forat de calma que sembla calma de debo.
       */
      if (g.empty) {
        console.warn(`  ${t}: ${g.empty} caselles de ${g.width * g.height} sense cap punt a l'abast`);
      }

      /*
       * Tres canals: u al vermell, v al verd i el blau a zero.
       *
       * El PNG és sense pèrdua —amb WebP amb pèrdua els bytes deixarien de ser
       * números— i entra a una textura de WebGL sense descodificar res.
       */
      const raw = Buffer.alloc(g.width * g.height * 3);
      for (let k = 0; k < g.width * g.height; k++) {
        raw[k * 3] = windEncode(g.u[k]);
        raw[k * 3 + 1] = windEncode(g.v[k]);
      }
      const png = await sharp(raw, { raw: { width: g.width, height: g.height, channels: 3 } })
        .png({ compressionLevel: 9 })
        .toBuffer();

      const name = t.slice(0, 13).replace(/[-T]/g, '');
      const hash = createHash('sha256').update(png).digest('hex').slice(0, 16);
      writeFileSync(join(windDir, `${name}.png`), png);
      /*
       * Si la graella d'aquesta hora ja és aquesta, no es torna a pujar.
       *
       * El worker corre cada hora perquè el futur del mapa no s'encongeixi al
       * llarg del dia, i entre una volta i la següent **onze de les dotze hores
       * són idèntiques**: la predicció no ha canviat i només entra una hora
       * nova per la cua. R2 cobra per operació, i és el mateix error que ja va
       * costar 4.032 pujades diàries idèntiques al radar.
       *
       * Es compara amb **l'índex publicat**, no amb el fitxer del disc: a GitHub
       * Actions el disc arrenca buit, així que mirant-lo la comparació sortiria
       * sempre negativa i es tornarien a pujar les dotze cada hora. `sharp` és
       * determinista amb la mateixa entrada, i per això n'hi ha prou amb
       * comparar l'empremta.
       */
      if (previousWind?.hours.find((h) => h.name === name)?.hash === hash) windKept++;
      else markForPublish(`${WIND_DIR}/${name}.png`);

      windHours.push({ time: epochOf(t), iso: t, name, hash, maxMs: Math.round(g.maxMs * 10) / 10 });
      console.log(
        `  ${t}  ${(png.length / 1024).toFixed(1)} kB`
        + ` · màxim ${(g.maxMs * 3.6).toFixed(0)} km/h`,
      );
    }

    /*
     * Dues hores no poden compartir instant, i cap no pot quedar sense.
     *
     * L'instant és la clau de cada hora —el mapa hi busca la que toca— i el nom
     * del fitxer en surt: dues hores amb el mateix instant serien un sol fitxer
     * sobreescrit i dues entrades a l'índex apuntant-hi. Cap error. Un índex
     * amb una clau repetida no s'ha de publicar; val més quedar-se amb el de la
     * volta anterior.
     */
    const seen = new Set<number>();
    for (const h of windHours) {
      if (seen.has(h.time)) {
        throw new Error(`dues hores amb el mateix instant (${h.time}, ${h.iso}): l'índex no es publica`);
      }
      seen.add(h.time);
    }

    const windIndex: WindIndex = {
      box: MAP_BOX,
      width: Math.round((MAP_BOX.east - MAP_BOX.west) / WIND_STEP) + 1,
      height: Math.round((MAP_BOX.north - MAP_BOX.south) / WIND_STEP) + 1,
      step: WIND_STEP,
      max: WIND_MAX,
      hours: windHours,
      points: windPoints.length,
      source: 'Open-Meteo · CC-BY 4.0',
    };
    writeSnapshot(windShard(), 'Open-Meteo · CC-BY 4.0', windIndex, windHours[0]?.iso ?? null);
    if (windKept) console.log(`  ${windKept} de ${windHours.length} hores de vent ja hi eren igual: no s'han tornat a pujar.`);
  }

  recordFreshness({
    source: 'forecast-field',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: index.dataTs ?? null,
    /*
     * El mateix límit que la predicció, perquè el camp **és** la predicció.
     *
     * No té rellotge propi: la dada només canvia quan aquella es refresca, i el
     * nivell més lent va un cop al dia. Amb set hores —que és el que hi havia—
     * sortia «endarrerida» amb les imatges acabades de fer, i un rètol que
     * sempre està en roig deixa d'avisar de res. És la mateixa trampa que ja
     * va passar amb els rècords de la XEMA i amb els avisos de l'AEMET: el
     * límit ha de ser el cicle real de la font.
     */
    stalenessLimitMin: 60 * 14,
    rows: windHours.length,
    apiCalls: 0,
  });

  console.log(`\n${quota.report()}`);
  console.log(`→ ${windHours.length} hores a data/cache/${WIND_DIR}/ (${((Date.now() - started) / 1000).toFixed(1)} s)`);

  const pub = await publish();
  if (!pub.skipped) {
    console.log(`Publicat a l'emmagatzematge: ${pub.uploaded} fitxers · ${(pub.bytes / 1048576).toFixed(1)} MB`);
  }
}

main().catch((err) => reportFailure({
  source: 'forecast-field', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 60 * 14, rows: 0, apiCalls: 0,
}, err));
