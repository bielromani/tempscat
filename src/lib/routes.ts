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

/**
 * Els itineraris que passen a la vora d'una ubicació.
 *
 * Per comarca i no per distància: la comarca ja la porten calculada i un
 * itinerari de vint quilòmetres no té «una distància» a un poble — passa o no
 * passa per allà.
 */
export function routesNear(comarcaCodi: string, limit = 4): Route[] {
  return routesOfComarca(comarcaCodi)
    // Els de gran recorregut primer, i entre iguals el més llarg.
    .sort((a, b) => (a.network === b.network ? b.km - a.km : a.network === 'nwn' ? -1 : 1))
    .slice(0, limit);
}
