/**
 * Subir un objeto a un almacén compatible con S3, firmando a mano.
 *
 * ## Por qué no hay SDK
 *
 * Porque para lo que hacemos —un `PUT` de un fichero que ya tenemos en
 * memoria— el SDK de AWS son veinte megas de dependencia para construir una
 * cabecera. La firma v4 es un protocolo documentado y determinista: una cadena
 * canónica, cuatro HMAC encadenados y un `Authorization`. Nada de esto es
 * criptografía propia; es `node:crypto` aplicado en el orden que manda AWS.
 *
 * ## Por qué Cloudflare R2 y no el almacén de Vercel
 *
 * Porque **R2 no factura la salida de datos**. Este sitio existe para servir
 * datos públicos: su trabajo es justamente la salida. Con el almacén anterior,
 * un solo rastreo del sitemap consumía más de un mes de cuota —y lo consumió,
 * el 1 de septiembre de 2026, dejando el sitio a medias—.
 *
 * El resto de la partida lo perdemos: hay que llevar el DNS a Cloudflare y no
 * hay SDK ni panel integrado. Vale la pena igual.
 */
import { s3Error, s3Fetch, type S3Config } from '../../src/lib/s3-sign.ts';

export type { S3Config };

/**
 * La configuración, o `null` si no está puesta.
 *
 * Que falte es el caso normal cuando se trabaja en local: los workers escriben
 * en `data/cache/` y no publican. Que esté a medias no lo es, y se dice.
 */
export function s3Config(): S3Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId && !bucket && !accessKeyId && !secretAccessKey) return null;

  const missing = [
    !accountId && 'R2_ACCOUNT_ID',
    !bucket && 'R2_BUCKET',
    !accessKeyId && 'R2_ACCESS_KEY_ID',
    !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`configuració de R2 incompleta: falta ${missing.join(', ')}`);
  }
  return { accountId: accountId!, bucket: bucket!, accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! };
}

export interface PutOptions {
  contentType: string;
  /** Segundos que el CDN puede quedarse la copia. */
  cacheSeconds: number;
}

/**
 * Sube un objeto. Lanza con el cuerpo de la respuesta si el almacén dice que no.
 * La firma está en `src/lib/s3-sign.ts`, que comparte con la API de los avisos.
 *
 * El cuerpo importa: un error de firma responde `403` con un XML que dice
 * exactamente qué cabecera no cuadra, y sin él la depuración es a ciegas.
 */
export async function putObject(
  cfg: S3Config, key: string, body: Uint8Array, opts: PutOptions,
): Promise<void> {
  const res = await s3Fetch(cfg, {
    method: 'PUT',
    key,
    body,
    headers: {
      'cache-control': `public, max-age=${opts.cacheSeconds}`,
      'content-type': opts.contentType,
    },
  });
  if (!res.ok) throw await s3Error(res);
}
