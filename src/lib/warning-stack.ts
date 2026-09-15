/**
 * La pila d'avisos d'un lloc: qui mana, qui acompanya i qui no diu res de nou.
 *
 * ## Per què això necessita un fitxer propi
 *
 * Perquè és **l'única part del web on amagar una dada pot fer mal a algú**, i
 * per tant és l'única que val la pena poder provar sense aixecar l'aplicació.
 * Com la resta de fitxers compartits, aquest no importa res: el llegeix la
 * pàgina i el llegeix `npm run test:warnings`.
 *
 * ## El problema que resol
 *
 * Un municipi pot tenir quatre avisos alhora, i amb les dades del 8 de setembre
 * de 2026 **3.548 de 4.048 ubicacions amb avís en tenien més d'un**. A
 * Barcelona eren quatre targetes del mateix pes visual:
 *
 *     taronja  PR  Precipitació acumulada en una hora · 40 mm
 *     groc     PR  Precipitació acumulada en 12 hores · 60 mm
 *     groc     TO  Tempestes
 *     groc     AT  Temperatura màxima · 34 °C
 *
 * Quatre caixes iguals i cap que digui quina mana: s'han de llegir totes per
 * saber-ho.
 *
 * ## I per què la solució no és ensenyar només el més alt
 *
 * Perquè el nivell **no és una escala d'importància general**: és la
 * probabilitat i el llindar *d'aquell fenomen*. Un groc de vent sota un taronja
 * de tempesta són dos perills diferents, i el groc de dalt no és el taronja dit
 * fluix — són 40 mm en una hora i 60 mm en dotze, que passen de manera diferent
 * i es preparen de manera diferent.
 *
 * Mesurat sobre els 34 avisos d'aquell dia i les 4.048 ubicacions afectades:
 * **cap avís en tapava cap altre**. O sigui que esborrar el de nivell més baix
 * hauria tret informació en tots els casos i no n'hauria estalviat cap.
 *
 * Així que es **jerarquitza, no s'amaga**: el més alt va sencer i la resta
 * queden a una línia cadascun, sempre visibles i desplegables. Es llegeix en
 * dos segons quin mana i no desapareix res.
 *
 * ## Quan sí que en sobra un
 *
 * Quan no diu literalment res que l'altre no digui: **mateix fenomen, mateixa
 * magnitud mesurada, nivell més baix i les hores completament dins de les de
 * l'altre**. Aleshores el de sota és el de dalt explicat més fluix.
 *
 * Les quatre condicions hi han de ser. La de la magnitud és la que costa de
 * veure i la que ho salva tot: sense ella, el groc de 60 mm en dotze hores de
 * Barcelona desapareixeria sota el taronja de 40 mm en una, i tots dos parlen
 * de pluja i coincideixen en les hores.
 */

export type WarningLevel = 'verd' | 'groc' | 'taronja' | 'vermell';

export const LEVEL_RANK: Record<WarningLevel, number> = {
  verd: 0, groc: 1, taronja: 2, vermell: 3,
};

export interface Warning {
  id: string;
  event: string;
  phenomenon: string;
  level: WarningLevel;
  severity: string;
  onset: string;
  expires: string;
  headline: string;
  description: string;
  instruction: string;
  probability?: string;
  threshold?: string;
  web: string;
  zones: string[];
  locationIds: string[];
  comarcaCodis: string[];
}

/**
 * Quina magnitud mesura el llindar, sense el valor.
 *
 * AEMET l'envia com `Precipitación acumulada en una hora · 40 mm`. El que
 * compta aquí és la part de l'esquerra: dos avisos de pluja amb magnituds
 * diferents **no són el mateix avís** per més que coincideixin en tota la
 * resta.
 *
 * Sense valor —«Tormentas», que no en porta— torna la mateixa cadena buida per
 * als dos, que és el que toca: dos avisos de tempesta sense llindar mesuren el
 * mateix no-res.
 */
export function thresholdParam(threshold: string | undefined): string {
  if (!threshold) return '';
  const [first] = threshold.split(/[;·]/);
  return (first ?? '').trim().toLowerCase();
}

export interface WarningGroup {
  /** Clau estable, per al `key` de React. */
  key: string;
  level: WarningLevel;
  /** Codi del fenomen: AT, PR, NE… El nom en català surt de `warning-labels`. */
  phenomenon: string;
  /** La magnitud del llindar, que forma part de la identitat de l'avís. */
  param: string;
  zones: string[];
  /** Del primer instant cobert a l'últim. */
  onset: string;
  expires: string;
  /** Un tram per avís original, en ordre. Un de sol quan no hi ha repetició. */
  spans: Array<{ id: string; onset: string; expires: string; threshold?: string }>;
  probability?: string;
  web: string;
  /** El text tal com l'emet AEMET, sense tocar. Pot diferir entre dies. */
  official: { event: string; descriptions: string[]; instructions: string[] };
}

/**
 * Ajunta els avisos que són el mateix avís en dies diferents.
 *
 * AEMET emet **un fitxer CAP per dia i per zona**, així que una onada de calor
 * de tres dies arriba com tres avisos idèntics excepte la data. La Vall de Boí
 * ensenyava tres targetes seguides —mateix fenomen, mateix nivell, mateixa
 * zona, les mateixes vuit hores de la tarda— que el lector havia de comparar
 * paraula per paraula per descobrir que només canviava el dia.
 *
 * S'agrupen per fenomen, **magnitud**, nivell i zona, i mai per menys: si el
 * divendres puja a taronja, el taronja va a la seva targeta. Dins del grup es
 * conserva cada dia amb el seu llindar, perquè 35 °C el dimecres i 36 °C el
 * divendres no són el mateix número.
 *
 * La magnitud hi va des del 15 de setembre de 2026. Sense ella, un groc de
 * «40 mm en una hora» i un de «60 mm en dotze» a la mateixa zona s'ajuntaven en
 * un sol grup i la llista de dies els ensenyava com si fossin dos dies de la
 * mateixa cosa — dos números correctes dient una cosa falsa. No passava amb les
 * dades d'aquell dia; passaria el primer cop que AEMET emetés les dues al
 * mateix nivell.
 *
 * Funció pura: no mira el rellotge. El filtre de vigència el fa qui la crida,
 * que és on viu el rellotge en aquest projecte.
 */
export function groupWarnings(warnings: Warning[]): WarningGroup[] {
  const byKey = new Map<string, WarningGroup>();

  for (const w of warnings) {
    const param = thresholdParam(w.threshold);
    const key = [w.phenomenon, param, w.level, [...w.zones].sort().join('+')].join('|');
    const span = { id: w.id, onset: w.onset, expires: w.expires, threshold: w.threshold };
    const found = byKey.get(key);

    if (!found) {
      byKey.set(key, {
        key,
        level: w.level,
        phenomenon: w.phenomenon,
        param,
        zones: w.zones,
        onset: w.onset,
        expires: w.expires,
        spans: [span],
        probability: w.probability,
        web: w.web,
        official: {
          event: w.event,
          descriptions: w.description ? [w.description] : [],
          instructions: w.instruction ? [w.instruction] : [],
        },
      });
      continue;
    }

    found.spans.push(span);
    if (w.onset < found.onset) found.onset = w.onset;
    if (w.expires > found.expires) found.expires = w.expires;
    // Repetit no es desa dues vegades; diferent no es perd.
    if (w.description && !found.official.descriptions.includes(w.description)) {
      found.official.descriptions.push(w.description);
    }
    if (w.instruction && !found.official.instructions.includes(w.instruction)) {
      found.official.instructions.push(w.instruction);
    }
  }

  const groups = [...byKey.values()];
  for (const g of groups) g.spans.sort((a, b) => a.onset.localeCompare(b.onset));
  return groups.sort(
    (a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.onset.localeCompare(b.onset),
  );
}

/**
 * `sota` no diu res que `sobre` no digui ja.
 *
 * Les quatre condicions hi han de ser totes. Treure'n una qualsevol fa que
 * això comenci a amagar avisos que porten informació pròpia, i amagar-los no
 * dona cap error: dona una targeta més neta.
 */
function subsumes(sobre: WarningGroup, sota: WarningGroup): boolean {
  return sobre.phenomenon === sota.phenomenon
    && sobre.param === sota.param
    && LEVEL_RANK[sobre.level] > LEVEL_RANK[sota.level]
    && sobre.onset <= sota.onset
    && sobre.expires >= sota.expires;
}

export interface WarningStack {
  /** El que mana. Va sencer. */
  lead: WarningGroup;
  /** Els altres, a una línia cadascun i desplegables. Cap no s'amaga. */
  rest: WarningGroup[];
  /**
   * Els que no deien res de nou.
   *
   * Es tornen perquè qui vulgui els pugui comptar o ensenyar; el que no es fa
   * és descartar-los en silenci. Amb les dades del 8 de setembre de 2026
   * aquesta llista sortia **buida a les 4.048 ubicacions**.
   */
  dropped: WarningGroup[];
}

/**
 * De la llista d'avisos d'un lloc a què n'ha de veure el lector.
 *
 * L'ordre d'entrada mana: `groupWarnings()` ja els torna de més greu a menys
 * greu i, dins del mateix nivell, del que comença abans al que comença després.
 * O sigui que el primer que queda dret és el que mana.
 */
export function stackWarnings(groups: WarningGroup[]): WarningStack | null {
  if (!groups.length) return null;

  const kept: WarningGroup[] = [];
  const dropped: WarningGroup[] = [];

  for (const g of groups) {
    if (groups.some((other) => other !== g && subsumes(other, g))) dropped.push(g);
    else kept.push(g);
  }

  /*
   * Si tot s'ha caigut, no s'amaga res.
   *
   * No hauria de passar mai —`subsumes()` demana un nivell estrictament més
   * alt, i el més alt de tots no en té cap per damunt— però una targeta buida
   * al lloc d'un avís vermell és l'únic resultat d'aquest fitxer que no es pot
   * permetre, i costa una línia assegurar-ho.
   */
  if (!kept.length) return { lead: groups[0], rest: groups.slice(1), dropped: [] };

  return { lead: kept[0], rest: kept.slice(1), dropped };
}
