import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Els itineraris de senderisme senyalitzats, del territori construït.
 *
 * ## Per què surten d'aquí i no d'un worker
 *
 * Perquè no canvien. Un GR és el mateix demà que avui: el que canvia és el
 * temps que hi farà, i això ja el té la predicció. Es construeixen un cop amb
 * `npm run data:routes` i el fitxer **es versiona**, com el territori.
 *
 * ## La llicència no és la del web
 *
 * Vénen d'**OpenStreetMap**, que és **ODbL 1.0** i no CC-BY. Una pàgina que ho
 * ensenya és una obra derivada i només demana atribució —que hi és, a cada
 * pàgina—, però una base de dades derivada hauria de ser ODbL i xocaria amb el
 * CC-BY que promet `/dades`. Per això **això no entra a l'API**: si algun dia
 * s'hi posa, ha d'anar a part i amb la seva llicència.
 */

const BUILD = join(process.cwd(), 'data', 'build');

export interface Route {
  osmId: number;
  slug: string;
  name: string;
  ref: string | null;
  /** `nwn` els de gran recorregut, `rwn` els de petit recorregut. */
  network: string;
  km: number;
  kmTagged: number | null;
  minM: number | null;
  maxM: number | null;
  /** Desnivell acumulat, i **només** quan OSM el porta. Mai calculat per nosaltres. */
  ascentM: number | null;
  roundtrip: boolean | null;
  from: string | null;
  to: string | null;
  website: string | null;
  operator: string | null;
  comarques: string[];
  /** Quina part del traçat cau dins de Catalunya, de 0 a 1. */
  insideShare: number;
  /**
   * El codi de l'eix del qual aquest itinerari és una etapa.
   *
   * A OSM un GR llarg no és una relació sinó una per etapa, totes amb el
   * mateix `ref`: el GR 92 en són 33 i el GR 3, 51. Són 209 dels 683, i sense
   * això cada etapa era una fitxa que no sabia que en tenia trenta-dues
   * germanes. Null quan el codi és d'un itinerari sol.
   */
  axis?: string | null;
  /** La seva posició dins de l'eix, en ordre de caminar-lo. */
  leg?: number | null;
  /** Quantes etapes té l'eix. */
  legs?: number | null;
  /**
   * Si l'etapa següent comença **on acaba aquesta**.
   *
   * A set dels onze eixos la sèrie d'OSM es parteix en trossos —al GR 92 li
   * falta un enllaç, i el GR 177 és circular—, i llavors el salt d'una etapa a
   * la següent no és un salt de caminar. Dir-ho és el que evita que la fitxa
   * prometi una continuïtat que no hi és.
   */
  linked?: boolean;
  /** El codi de la ruta mare, quan aquesta n'és una variant: `GR 11.18` → `GR 11`. */
  variantOf?: string | null;
  start: { lat: number; lon: number };
  nearest: { id: string; nom: string; path: string; distKm: number } | null;
}

interface RoutesFile {
  builtAt: string;
  source: string;
  license: string;
  /** El zoom del model d'elevació amb què es van mesurar les cotes. */
  demZoom: number;
  sampleM: number;
  routes: Route[];
}

let cache: RoutesFile | null = null;

function load(): RoutesFile {
  if (!cache) {
    cache = JSON.parse(readFileSync(join(BUILD, 'routes.json'), 'utf8')) as RoutesFile;
  }
  return cache;
}

/** Com se'n diu de cada xarxa, en paraules. */
export const NETWORK_LABEL: Record<string, string> = {
  nwn: 'gran recorregut',
  rwn: 'petit recorregut',
};

export function networkLabel(network: string): string {
  return NETWORK_LABEL[network] ?? 'senyalitzat';
}

/**
 * El codi, si val la pena dir-lo a part del nom.
 *
 * A OSM el `ref` de vegades **és** el nom: «Carros de Foc Plus» als dos camps,
 * i la fitxa deia «Carros de Foc Plus · Carros de Foc Plus». Quan el codi ja és
 * dins del nom no s'ensenya dues vegades.
 */
export function refApart(route: { ref: string | null; name: string }): string | null {
  if (!route.ref) return null;
  const fold = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return fold(route.name).includes(fold(route.ref)) ? null : route.ref;
}

export interface RoutesView {
  routes: Route[];
  source: string;
  license: string;
  demZoom: number;
  builtAt: string;
}

/** Tots, per a l'índex. */
export function allRoutes(): RoutesView {
  const f = load();
  return {
    routes: f.routes,
    source: f.source,
    license: f.license,
    demZoom: f.demZoom,
    builtAt: f.builtAt,
  };
}

export function routeBySlug(slug: string): Route | null {
  return load().routes.find((r) => r.slug === slug) ?? null;
}

export function routeSlugs(): string[] {
  return load().routes.map((r) => r.slug);
}

// ── Els eixos: un codi, moltes etapes ───────────────────────────────────────
//
// A OpenStreetMap un GR llarg no és una relació sinó una per etapa, totes amb
// el mateix `ref`. Són 209 dels 683, i fins ara cada etapa era una fitxa que no
// sabia que en tenia trenta-dues germanes: qui buscava «GR 92» es trobava
// trenta-tres pàgines soltes, sense saber quina va abans ni quants
// quilòmetres fa el conjunt.
//
// L'ordre el calcula el build encadenant el `to` d'una amb el `from` de la
// següent —vegeu `orderLegs` a `scripts/12-routes.ts`—, i aquí només es
// llegeix. Una clau derivada es calcula un cop.

export interface Axis {
  ref: string;
  slug: string;
  legs: Route[];
  /** La suma dels trams, que és el que fa l'eix. */
  km: number;
  minM: number | null;
  maxM: number | null;
  /** Els codis de comarca per on passa, sense repetir i en l'ordre del camí. */
  comarques: string[];
  /** Quantes vegades la sèrie d'OSM es trenca entre una etapa i la següent. */
  breaks: number;
}

/** El tros d'adreça d'un eix: `GR 92` → `gr-92`. */
export function axisSlug(ref: string): string {
  return ref.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function axisFrom(ref: string, legs: Route[]): Axis {
  const ordered = [...legs].sort((a, b) => (a.leg ?? 0) - (b.leg ?? 0));
  const comarques: string[] = [];
  for (const r of ordered) {
    for (const c of r.comarques) if (!comarques.includes(c)) comarques.push(c);
  }
  const mins = ordered.map((r) => r.minM).filter((v): v is number => v != null);
  const maxs = ordered.map((r) => r.maxM).filter((v): v is number => v != null);
  return {
    ref,
    slug: axisSlug(ref),
    legs: ordered,
    km: Math.round(ordered.reduce((s, r) => s + r.km, 0) * 10) / 10,
    minM: mins.length ? Math.min(...mins) : null,
    maxM: maxs.length ? Math.max(...maxs) : null,
    comarques,
    breaks: ordered.slice(0, -1).filter((r) => !r.linked).length,
  };
}

/** Tots els eixos, del més llarg al més curt. */
export function allAxes(): Axis[] {
  const by = new Map<string, Route[]>();
  for (const r of load().routes) {
    if (!r.axis) continue;
    if (!by.has(r.axis)) by.set(r.axis, []);
    by.get(r.axis)!.push(r);
  }
  return [...by].map(([ref, legs]) => axisFrom(ref, legs)).sort((a, b) => b.km - a.km);
}

export function axisBySlug(slug: string): Axis | null {
  return allAxes().find((a) => a.slug === slug) ?? null;
}

/** L'eix del qual un itinerari és etapa, amb les germanes en ordre. */
export function axisOfRoute(route: Route): Axis | null {
  if (!route.axis) return null;
  const legs = load().routes.filter((r) => r.axis === route.axis);
  return legs.length > 1 ? axisFrom(route.axis, legs) : null;
}

/**
 * Les variants que pengen d'un codi.
 *
 * `GR 11.18` penja de `GR 11`: al senyalitzar-les, el número de després del
 * punt vol dir «variant d'aquell». Només s'enllacen les que el build ha pogut
 * lligar a una mare que existeix al nostre índex.
 */
export function variantsOf(ref: string | null): Route[] {
  if (!ref) return [];
  return load().routes
    .filter((r) => r.variantOf === ref)
    .sort((a, b) => a.ref!.localeCompare(b.ref!, 'ca', { numeric: true }));
}

/**
 * Els itineraris que travessen una comarca.
 *
 * «Travessen» i no «comencen»: un GR de dues-centes cinquanta hores passa per
 * set comarques i és igual de seu a totes set. El worker les apunta en l'ordre
 * en què es troben.
 */
export function routesOfComarca(codi: string): Route[] {
  return load().routes.filter((r) => r.comarques.includes(codi));
}

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Els itineraris que una fitxa de poble ha d'ensenyar.
 *
 * Es filtra per comarca —que és el que hi ha calculat— i s'ordena **pel punt
 * d'inici més proper**, no pels més llargs.
 *
 * La primera versió posava els de gran recorregut al davant i Gósol acabava
 * ensenyant quatre GR de 400, 390, 198 i 180 km que travessen el Berguedà
 * sencer. Passen per allà, sí, però ningú que miri el temps a Gósol està
 * decidint fer el Camí Ramader de Marina: la pregunta és què es pot caminar
 * aquí, i la contesta el que comença a prop.
 */
export function routesNear(
  loc: { lat: number | null; lon: number | null; comarcaCodi: string }, limit = 4,
): Route[] {
  const list = routesOfComarca(loc.comarcaCodi);
  if (loc.lat == null || loc.lon == null) return list.slice(0, limit);

  return list
    .map((r) => ({ r, d: distKm(loc.lat as number, loc.lon as number, r.start.lat, r.start.lon) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.r);
}

/**
 * El traçat i el perfil d'un itinerari.
 *
 * ## Per què no és a `routes.json`
 *
 * Perquè són 5,7 MB per als 683 i l'índex en pesa 442 kB. Tot junt, cada fitxa
 * i cada llista es baixarien la geometria de tots per ensenyar-ne una: és la
 * regla de `shards.ts`, i aquí és un fitxer per itinerari.
 *
 * ## El traçat va via a via i el perfil no
 *
 * A OSM una relació d'itinerari és un sac de vies sense ordre. Per dibuixar-la
 * dona igual —cada via és un `M` del seu camí— però un perfil és l'altura
 * contra la distància **recorreguda**, i això demana posar-les en fila. El
 * worker les cus pels extrems i publica el perfil només quan hi entra el 95 %
 * de la longitud: 662 dels 683. La resta són relacions amb branques o amb
 * forats, i un perfil que salta d'un tros a l'altre és una serra inventada.
 */
export interface RouteGeometry {
  slug: string;
  /** Cada via, ja simplificada a 20 m. `[lat, lon]`. */
  trace: Array<Array<[number, number]>>;
  /** `[metres recorreguts, cota]`, o nul quan les vies no cusen. */
  profile: Array<[number, number]> | null;
  /** Quina part de la longitud va entrar a la cadena, de 0 a 1. */
  profileCovered: number;
}

export function routeGeometry(slug: string): RouteGeometry | null {
  try {
    return JSON.parse(
      readFileSync(join(BUILD, 'routes', `${slug}.json`), 'utf8'),
    ) as RouteGeometry;
  } catch {
    return null;
  }
}

/**
 * Quant s'hi triga a peu, per la regla de Naismith.
 *
 * Quatre quilòmetres i mig l'hora en pla, i una hora més per cada 600 m de
 * pujada. És la regla que fan servir les federacions excursionistes des de
 * 1892 i **no és una predicció**: és una referència amb un ritme dit en veu
 * alta, que és el que la fa comprovable. Qui camina més de pressa, ho sap.
 *
 * No s'hi descompta la baixada. Naismith en la seva forma original tampoc, i
 * les correccions que ho fan —Tranter, Langmuir— demanen saber la forma física
 * de qui camina, que no sabem.
 *
 * Sense desnivell publicat torna el temps del pla, i qui ho ensenyi ha de dir
 * que és un mínim: a muntanya, la pujada mana més que els quilòmetres.
 */
export const NAISMITH_KMH = 4.5;
export const NAISMITH_ASCENT_M_PER_H = 600;

export function walkingHours(km: number, ascentM: number | null): number {
  return km / NAISMITH_KMH + (ascentM ?? 0) / NAISMITH_ASCENT_M_PER_H;
}

/** «6 h 15 min», «45 min». Mai «6,25 h», que ningú no llegeix així. */
export function hoursText(h: number): string {
  const mins = Math.round(h * 60);
  if (mins < 60) return `${mins} min`;
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return mm === 0 ? `${hh} h` : `${hh} h ${mm} min`;
}
