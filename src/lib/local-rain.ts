import 'server-only';
import { comarcaPathsNear, relief } from './territory';
import { precipField, radar, localNowHour } from './weather';
import { project as projectPoint, type TileGrid } from './mercator';
import type { LocationForecast } from './forecast-types';
import type { RadarFrame } from './weather';

/**
 * Decideix si la fitxa d'un poble ha d'ensenyar cap on va la pluja, i amb què.
 *
 * ## Per què hi ha una porta
 *
 * Perquè la immensa majoria dels dies no hi ha pluja enlloc, i un mapa de
 * pluja sense pluja no és informació: és un requadre buit a 4.293 pàgines, i
 * quatre imatges que ningú no necessitava. Només s'obre quan la predicció
 * **d'aquest punt** dona aigua a les pròximes hores.
 *
 * ## I per què la porta la mira la predicció i no el radar
 *
 * Perquè la pregunta és «em plourà», no «plou en algun lloc». Un eco a
 * cent quilòmetres que se'n va cap a França no fa que la fitxa d'un poble de
 * Ponent hagi d'ensenyar cap mapa. La predicció d'aquell punt ja té dins la
 * resposta; això només l'acompanya amb el dibuix del moviment.
 *
 * ## Per què viu aquí i no a la pàgina
 *
 * Perquè les fitxes són dues —municipi i entitat— i totes dues han de fer la
 * mateixa pregunta. Amb la condició escrita a cada una, un dia una ensenyaria
 * el mapa i l'altra no, al mateix poble.
 */

/** Mitja amplada de la finestra del mapa, en quilòmetres. */
export const HALF_KM = 50;

/** Relació d'aspecte: més ample que alt, que és com es mira un mapa petit. */
export const ASPECT = 4 / 3;

export interface LocalRainFrame {
  time: number;
  local: string;
  kind: RadarFrame['kind'];
  /** El nom del fitxer del camp, quan el marc és predicció. */
  field?: string;
}

/** Hores endavant que es miren per decidir si val la pena dibuixar res. */
const LOOK_AHEAD_H = 6;

/** Mil·límetres en una hora a partir dels quals això és pluja i no humitat. */
const WET_MM = 0.2;

/** Hores de predicció que s'ensenyen, després de la del radar. */
const SHOW_H = 3;

/**
 * La finestra del mapa, en píxels del mosaic.
 *
 * Es calcula aquí **i** al component, i és la mateixa funció: aquí per triar
 * quines fronteres cal enviar i allà per retallar. Amb dos càlculs, un dia
 * s'enviarien les d'un tros i es dibuixaria un altre, i el mapa sortiria amb
 * fronteres a mitges sense que res fallés.
 */
export function windowOf(grid: TileGrid, lat: number, lon: number) {
  const [cx, cy] = projectPoint(grid, lon, lat);
  const world = grid.size * 2 ** grid.z;
  const mPerPx = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / world;
  const halfW = (HALF_KM * 1000) / mPerPx;
  const halfH = halfW / ASPECT;
  return { x: cx - halfW, y: cy - halfH, w: halfW * 2, h: halfH * 2, cx, cy };
}

export interface LocalRainData {
  frames: LocalRainFrame[];
  grid: TileGrid;
  tiles: Array<{ x: number; y: number }>;
  fieldBox: { x: number; y: number; w: number; h: number } | null;
  terrain: { src: string; x: number; y: number; w: number; h: number };
  paths: string[];
}

export async function localRainFor(
  forecast: LocationForecast | null,
  lat: number | null,
  lon: number | null,
): Promise<LocalRainData | null> {
  if (lat == null || lon == null) return null;
  if (!forecast?.hourly?.length) return null;

  const now = localNowHour();
  const ahead = forecast.hourly
    .filter((h) => h.time.slice(0, 13) >= now)
    .slice(0, LOOK_AHEAD_H);
  if (!ahead.some((h) => (h.precipitation ?? 0) >= WET_MM)) return null;

  const data = await radar();
  if (!data) return null;

  const field = await precipField();

  /*
   * L'última observació i les tres hores següents.
   *
   * Una sola de radar i no sis: el que fa falta és **d'on ve**, i això ja es
   * llegeix comparant on és ara amb on diu el model que serà. Sis marcs de
   * radar afegirien dotze tessel·les a la fitxa per ensenyar vint minuts de
   * moviment que la primera predicció ja explica millor.
   */
  const lastPast = [...data.frames].reverse().find((f) => f.kind === 'past');
  if (!lastPast) return null;

  const frames: LocalRainFrame[] = [
    { time: lastPast.time, local: lastPast.local, kind: 'past' },
    ...(field?.hours ?? []).slice(0, SHOW_H).map((h) => ({
      time: h.time,
      local: `${h.iso}:00`,
      kind: 'forecast' as const,
      field: h.name,
    })),
  ];
  if (frames.length < 2) return null;

  const terrain = relief();
  return {
    frames,
    grid: data.grid,
    tiles: data.tiles,
    fieldBox: field?.box ?? null,
    terrain: { src: terrain.src, x: terrain.x, y: terrain.y, w: terrain.w, h: terrain.h },
    paths: comarcaPathsNear(data.grid, windowOf(data.grid, lat, lon)),
  };
}
