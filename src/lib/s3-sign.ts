/**
 * Una petició signada a un magatzem compatible amb S3 (Cloudflare R2).
 *
 * El perquè de no portar l'SDK —vint megues per construir una capçalera— és a
 * `scripts/lib/s3.ts`. Aquí només hi ha la firma v4, i viu a `src/lib/` perquè
 * la fan servir els dos costats: els workers, que publiquen les dades, i l'API
 * dels avisos al mòbil (`/api/alertes`), que desa les subscripcions en un
 * magatzem **privat**.
 *
 * Només importa `node:crypto`: el worker el carrega amb Node tal qual.
 */
import { createHash, createHmac } from 'node:crypto';

const SERVICE = 's3';
/** R2 no té regions a la manera d'AWS, però la firma n'exigeix una. */
const REGION = 'auto';

export interface S3Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const sha256 = (x: string | Uint8Array) => createHash('sha256').update(x).digest('hex');
const hmac = (key: Buffer | string, x: string) => createHmac('sha256', key).update(x).digest();

/**
 * Cada segment codificat, i S3 també vol codificats `!'()*`, que
 * `encodeURIComponent` deixa tal qual. Les claus que fem servir no en porten,
 * però una amb un apòstrof donaria una firma que no quadra i un error que no
 * diu per què.
 */
function encode(seg: string): string {
  return encodeURIComponent(seg)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface SignedRequest {
  method: 'GET' | 'PUT' | 'DELETE';
  /** Sense la barra del principi. Buida per a les operacions sobre el cubell (llistar). */
  key: string;
  query?: Record<string, string>;
  body?: Uint8Array;
  /** Capçaleres que viatgen signades, en minúscules. */
  headers?: Record<string, string>;
}

/**
 * Fa la petició i torna la resposta tal qual: qui crida decideix què és un
 * error. Un `404` en llegir una subscripció que no existeix no ho és.
 */
export async function s3Fetch(cfg: S3Config, req: SignedRequest): Promise<Response> {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const path = `/${cfg.bucket}${req.key ? `/${req.key.split('/').map(encode).join('/')}` : ''}`;
  const query = Object.entries(req.query ?? {})
    .map(([k, v]) => `${encode(k)}=${encode(v)}`)
    .sort()
    .join('&');
  const now = new Date();
  const amzDate = `${now.toISOString().slice(0, 19).replace(/[:-]/g, '')}Z`;
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(req.body ?? new Uint8Array());

  // Signades totes les que s'envien: si una viatja sense firma, qualsevol
  // intermediari la podria canviar sense invalidar res.
  const headers: Record<string, string> = {
    ...req.headers,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map((h) => `${h}:${headers[h].trim()}\n`).join('');
  const signedHeaderList = signedHeaders.join(';');

  const canonicalRequest = [
    req.method, path, query, canonicalHeaders, signedHeaderList, payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const signature = hmac(hmac(kService, 'aws4_request'), toSign).toString('hex');

  return fetch(`https://${host}${path}${query ? `?${query}` : ''}`, {
    method: req.method,
    // La DOM vol un `ArrayBuffer` de debò, i el que arriba sempre ho és: cap ve d'un `SharedArrayBuffer`.
    body: req.body as Uint8Array<ArrayBuffer> | undefined,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, `
        + `SignedHeaders=${signedHeaderList}, Signature=${signature}`,
    },
  });
}

/** El cos d'un error, retallat: un `403` de firma diu exactament què no quadra. */
export async function s3Error(res: Response): Promise<Error> {
  const detail = (await res.text().catch(() => '')).slice(0, 300);
  return new Error(`HTTP ${res.status}${detail ? ` · ${detail}` : ''}`);
}
