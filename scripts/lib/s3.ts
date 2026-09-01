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
import { createHash, createHmac } from 'node:crypto';

const SERVICE = 's3';
/** R2 no tiene regiones al modo de AWS, pero la firma exige uno. */
const REGION = 'auto';

export interface S3Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

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

const sha256 = (x: string | Uint8Array) => createHash('sha256').update(x).digest('hex');
const hmac = (key: Buffer | string, x: string) => createHmac('sha256', key).update(x).digest();

/**
 * Cada segmento de la ruta va codificado, pero las barras no.
 *
 * `encodeURIComponent` deja sin codificar `!'()*`, que S3 sí espera
 * codificados. Las claves que usamos son de la forma `forecast/c01.json`, así
 * que hoy no cambia nada — pero una clave con un apóstrofe daría una firma que
 * no cuadra, y el error que devuelve no dice qué pasa.
 */
function encodePath(key: string): string {
  return key.split('/').map((seg) => encodeURIComponent(seg)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}

export interface PutOptions {
  contentType: string;
  /** Segundos que el CDN puede quedarse la copia. */
  cacheSeconds: number;
}

/**
 * Sube un objeto. Lanza con el cuerpo de la respuesta si el almacén dice que no.
 *
 * El cuerpo importa: un error de firma responde `403` con un XML que dice
 * exactamente qué cabecera no cuadra, y sin él la depuración es a ciegas.
 */
export async function putObject(
  cfg: S3Config, key: string, body: Uint8Array, opts: PutOptions,
): Promise<void> {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const path = `/${cfg.bucket}/${encodePath(key)}`;
  const now = new Date();
  const amzDate = `${now.toISOString().slice(0, 19).replace(/[:-]/g, '')}Z`;
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const cacheControl = `public, max-age=${opts.cacheSeconds}`;

  // Firmadas todas las que enviamos con contenido: si una viaja y no está
  // firmada, cualquier intermediario podría cambiarla sin invalidar la firma.
  const headers: Record<string, string> = {
    'cache-control': cacheControl,
    'content-type': opts.contentType,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map((h) => `${h}:${headers[h].trim()}\n`).join('');
  const signedHeaderList = signedHeaders.join(';');

  const canonicalRequest = [
    'PUT', path, '', canonicalHeaders, signedHeaderList, payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const signature = hmac(hmac(kService, 'aws4_request'), toSign).toString('hex');

  const res = await fetch(`https://${host}${path}`, {
    method: 'PUT',
    body,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, `
        + `SignedHeaders=${signedHeaderList}, Signature=${signature}`,
    },
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`HTTP ${res.status}${detail ? ` · ${detail}` : ''}`);
  }
}
