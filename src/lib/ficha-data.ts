import 'server-only';
import {
  airQualityFor, astronomyFor, currentFor, forecastFor, groupWarnings, historyFor,
  localNowHour, localToday, rainWarningsOf, warningsFor,
} from './weather';
import { comarcaComparison } from './comparison';
import { waterNear } from './water';
import { nearestAirStation } from './air-stations';
import { seaNear } from './sea';
import { camerasNear } from './cameras';
import { resortNear } from './mountain';
import { routesNear } from './routes';
import { narrativeFor } from './narrative';
import { localRainFor } from './local-rain';
import type { Location } from './territory';

/**
 * Tot el que llegeix una fitxa de lloc, en una sola tanda i alhora.
 *
 * ## Per què
 *
 * Les dues pàgines de fitxa —municipi i entitat— feien tretze lectures **una
 * darrere l'altra**, escrites com a `await` dins de les props. En una instància
 * que ja les té a la memòria no es nota; en una de freda, que és el cas normal
 * amb menys d'una visita diària per fitxa, cada una és una petició al magatzem i
 * les esperes se sumen. Mesurat el 29 de setembre de 2026 amb `next build` i
 * `next start` contra el magatzem de producció, deu fitxes de nucli de deu
 * comarques diferents, en fred:
 *
 *     en fila     mediana 795 ms
 *     alhora      mediana 349 ms i 498 ms, en dues tandes
 *
 * I és temps que algú espera: una fitxa que no és a la memòria cau es genera a
 * la petició, i quan es regenera per ISR la factura és la durada de la funció.
 * (Amb `next dev` no es veu: allà el render sol ja en porta 1,8 s.)
 *
 * ## Per què en un sol lloc
 *
 * Les dues pàgines portaven la mateixa llista copiada. El dia que una en
 * guanyés una lectura i l'altra no, la fitxa d'un nucli i la del seu municipi
 * ensenyarien blocs diferents sense que res fallés.
 *
 * La pluja local depèn de la predicció, així que arrenca quan aquesta arriba i
 * no quan han acabat totes les altres.
 */
export async function fichaData(loc: Location) {
  const forecastP = forecastFor(loc);
  const [
    current, forecast, history, warnings, air, comparison,
    water, airStation, sea, cameras, resort, localRain,
  ] = await Promise.all([
    currentFor(loc),
    forecastP,
    historyFor(loc),
    warningsFor(loc),
    airQualityFor(loc),
    comarcaComparison(loc),
    waterNear(loc),
    nearestAirStation(loc),
    seaNear(loc),
    camerasNear(loc),
    resortNear(loc),
    forecastP.then((f) => localRainFor(f, loc.lat, loc.lon)),
  ]);

  return {
    current,
    forecast,
    history,
    warnings: groupWarnings(warnings),
    astro: astronomyFor(loc),
    air,
    comparison,
    narrative: narrativeFor(forecast, current, localNowHour(), localToday(), rainWarningsOf(warnings)),
    water,
    airStation,
    sea,
    cameras,
    resort,
    routes: routesNear(loc),
    localRain,
  };
}
