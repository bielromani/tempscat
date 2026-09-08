/**
 * Les claus que caduquen, i quan.
 *
 * ## Per què existeix aquest fitxer
 *
 * Perquè una clau que caduca no avisa. El dia que la d'AEMET s'acabi, el worker
 * d'avisos fallarà, la targeta d'avisos desapareixerà de les 4.293 fitxes i el
 * web seguirà sortint sencer: cap error visible, cap pàgina en blanc, només un
 * bloc que ja no hi és. Fins ara la caducitat —noranta dies— vivia en un
 * comentari del codi, que és el mateix que no viure enlloc.
 *
 * ## El que fa i el que no fa
 *
 * **No** talla la ingesta. Una comprovació que aturés el worker d'avisos perquè
 * a la clau li queden cinc dies deixaria el web sense avisos cinc dies abans
 * d'hora: la cura pitjor que la malaltia. El que fa és fallar en un workflow
 * **a part**, que no toca cap dada, un cop per setmana. Un correu de GitHub que
 * arriba amb quaranta-cinc dies de marge és una feina apuntada a l'agenda; el
 * mateix correu el dia que peta és una avaria.
 *
 * ## I per què falla també quan no consta la data
 *
 * Perquè «no sé quan caduca» és exactament l'estat que va portar fins aquí.
 * Una clau sense data registrada compta com a caducada: val més una setmana de
 * correus molestos que una caducitat que ningú no veia venir.
 */

export interface Credential {
  /** El mateix nom que fa servir el registre de frescor, quan n'hi ha. */
  source: string;
  label: string;
  /** La variable d'entorn que porta la clau. */
  env: string;
  /** La que porta la data de caducitat, en `AAAA-MM-DD`. */
  expiresEnv: string;
  /** Quant dura des que es demana, en dies. Per al text que diu què cal fer. */
  lifetimeDays: number;
  /** On es renova. Va al missatge d'error: qui el rep no ha de buscar-ho. */
  renewAt: string;
}

export const CREDENTIALS: Credential[] = [
  {
    source: 'aemet-warnings',
    label: 'AEMET OpenData · avisos oficials',
    env: 'AEMET_API_KEY',
    expiresEnv: 'AEMET_API_KEY_EXPIRES',
    lifetimeDays: 90,
    renewAt: 'https://opendata.aemet.es/centrodedescargas/altaUsuario',
  },
];

/** Dies que queden fins a la data, negatius si ja ha passat. */
export function daysUntil(iso: string, now = new Date()): number {
  const target = Date.UTC(
    Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)),
  );
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

/** Una data és una data: `2026-11-30`, i cap altra cosa. */
export function isDate(v: string | undefined): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}
