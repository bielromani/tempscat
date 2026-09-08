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
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { build } from '../lib/paths.ts';
import { madridToUtc } from '../lib/madrid.ts';
import {
  CACHE, DAILY_LIMITS, QuotaGuard, markForPublish, publish, pullSnapshot, recordFreshness,
  syncState, writeSnapshot,
} from '../lib/store.ts';
import { CATALUNYA_BBOX, project, tileGrid } from '../../src/lib/mercator.ts';
import { FORECAST_INDEX, forecastShard, type ForecastIndex } from '../../src/lib/shards.ts';
import { FIELD_DIR, fieldShard, type FieldIndex } from '../../src/lib/field.ts';

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
 * La malla on es calcula, abans d'ampliar-la a la mida del mosaic.
 *
 * Es calcula a un quart i s'amplia amb interpolació. No és una drecera: la
 * dada té un punt cada 3,2 km i el mosaic un píxel cada 460 m, o sigui que
 * entre dos punts hi ha set píxels. Calcular-los tots un per un seria set
 * vegades més feina per dibuixar la mateixa corba suau.
 */
const DOWNSCALE = 4;

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
  { mm: 0.1, rgb: [150, 200, 235], a: 110 },
  { mm: 0.5, rgb: [90, 160, 220], a: 140 },
  { mm: 1, rgb: [45, 115, 200], a: 170 },
  { mm: 2, rgb: [40, 160, 120], a: 190 },
  { mm: 5, rgb: [225, 195, 60], a: 205 },
  { mm: 10, rgb: [230, 140, 45], a: 215 },
  { mm: 20, rgb: [210, 60, 50], a: 225 },
  { mm: 40, rgb: [155, 40, 110], a: 235 },
];

function colorOf(mm: number): [number, number, number, number] {
  if (mm < SCALE[0].mm) return [0, 0, 0, 0];
  let band = SCALE[0];
  for (const s of SCALE) if (mm >= s.mm) band = s;
  return [band.rgb[0], band.rgb[1], band.rgb[2], band.a];
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
      if (v) precip.set(id, v);
    }
  }
  if (!precip.size) throw new Error('cap punt amb precipitació als trossos de predicció');

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
  const bucket = new Map<string, Array<{ px: number; py: number; id: string }>>();
  const keyOf = (px: number, py: number) => (
    `${Math.floor(px / radiusPx)},${Math.floor(py / radiusPx)}`
  );
  for (const p of placed) {
    const k = keyOf(p.px, p.py);
    if (!bucket.has(k)) bucket.set(k, []);
    bucket.get(k)!.push({ px: p.px, py: p.py, id: p.id });
  }

  console.log(`Punts amb predicció: ${placed.length} de ${points.length}`);
  console.log(`Requadre: ${bw}x${bh} px del mosaic · malla de càlcul ${gw}x${gh}`);
  console.log(`Radi: ${RADIUS_KM} km = ${radiusPx.toFixed(1)} px\n`);

  const dir = join(CACHE, FIELD_DIR);
  mkdirSync(dir, { recursive: true });
  const written: FieldIndex['hours'] = [];

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
        const cx = Math.floor(px / radiusPx);
        const cy = Math.floor(py / radiusPx);
        for (let ky = cy - 1; ky <= cy + 1; ky++) {
          for (let kx = cx - 1; kx <= cx + 1; kx++) {
            for (const p of bucket.get(`${kx},${ky}`) ?? []) {
              const dx = p.px - px;
              const dy = p.py - py;
              const d2 = dx * dx + dy * dy;
              if (d2 > radiusPx * radiusPx) continue;
              const v = precip.get(p.id)?.[i];
              if (v == null) continue;
              const w = 1 / Math.max(d2, 1);
              sum += v * w;
              weight += w;
            }
          }
        }

        const o = (gy * gw + gx) * 4;
        if (!weight) continue;
        covered++;
        const mm = sum / weight;
        if (mm > peak) peak = mm;
        if (mm >= SCALE[0].mm) wet++;
        const [r, g, b, a] = colorOf(mm);
        raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
      }
    }

    const webp = await sharp(raw, { raw: { width: gw, height: gh, channels: 4 } })
      .resize(bw, bh, { kernel: 'cubic' })
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer();

    const name = t.slice(0, 13).replace(/[-T]/g, '');
    writeFileSync(join(dir, `${name}.webp`), webp);
    markForPublish(`${FIELD_DIR}/${name}.webp`);
    written.push({ time: epochOf(t), iso: t, name });

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
