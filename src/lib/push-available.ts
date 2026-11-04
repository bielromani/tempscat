import 'server-only';
import { pushStoreConfig } from './push-store';

/**
 * Si els avisos al mòbil funcionen en aquest desplegament: la clau pública VAPID
 * si n'hi ha, o `null`.
 *
 * Calen les dues meitats —la clau, perquè el navegador es pugui subscriure, i
 * el magatzem privat, perquè la subscripció es pugui desar—. Amb una sola, el
 * botó funcionaria i la subscripció es perdria; així que, si en falta una,
 * l'enllaç de la fitxa no surt i la pàgina diu que no està disponible.
 */
export function pushAlertsAvailable(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return null;
  try {
    return pushStoreConfig() ? key : null;
  } catch {
    // A mitges: millor no oferir-ho que oferir-ho i perdre la subscripció.
    return null;
  }
}
