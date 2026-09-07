import 'server-only';
import { snapshot } from './cache-store';
import { climateShard } from './shards';
import type { StationMonth } from './climate-math';

/**
 * El lector de la sèrie mensual d'una estació.
 *
 * Els càlculs són a `climate-math.ts`, que no importa res perquè el worker els
 * ha de fer **exactament iguals**; aquí només queda el que necessita l'almacén.
 * Es reexporta tot perquè les pàgines demanin la dada i les funcions al mateix
 * lloc.
 */

export * from './climate-math';

interface ClimateData {
  station: string;
  monthly: StationMonth[];
}

export async function climateOfStation(codi: string): Promise<StationMonth[] | null> {
  const snap = await snapshot<ClimateData>(climateShard(codi));
  return snap?.data?.monthly?.length ? snap.data.monthly : null;
}
