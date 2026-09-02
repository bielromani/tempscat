/**
 * PNG a pelo: llegir-ne un i escriure'n un.
 *
 * ## Per que no hi ha dependencia
 *
 * Perque nomes cal aixo: llegir les tessel-les d'altitud -que venen en PNG RGB
 * de 8 bits- i escriure el relleu ja calculat. El format esta especificat i son
 * quatre trossos amb un CRC; les llibreries d'imatge porten codecs de mig mon
 * per fer-ne servir un.
 *
 * L'inflate i el deflate no es programen: son a `node:zlib`.
 *
 * ## Que suporta i que no
 *
 * Llegir: 8 bits per canal, RGB o RGBA, sense entrellacar. Es exactament el que
 * serveix el terrarium d'AWS, i si algun dia serveix una altra cosa **llanca**
 * en lloc de retornar pixels equivocats.
 *
 * Escriure: gris amb alfa, que es el que necessita un relleu on el mar es
 * transparent.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// -- CRC32, que cada tros del PNG porta al final -----------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface Raster {
  width: number;
  height: number;
  /** 1 gris, 2 gris amb alfa, 3 RGB, 4 RGBA. */
  channels: number;
  data: Uint8Array;
}

/**
 * Desfa el filtre d'una linia.
 *
 * Cada linia del PNG porta davant un byte que diu amb quin dels cinc filtres
 * s'ha codificat, i tots menys el primer es refereixen a la linia anterior. Es
 * la part que sembla mes fosca i es nomes aritmetica de bytes.
 */
function unfilter(
  type: number, line: Uint8Array, prev: Uint8Array | null, bpp: number,
): void {
  const n = line.length;
  switch (type) {
    case 0: return;
    case 1:
      for (let i = bpp; i < n; i++) line[i] = (line[i] + line[i - bpp]) & 0xff;
      return;
    case 2:
      if (prev) for (let i = 0; i < n; i++) line[i] = (line[i] + prev[i]) & 0xff;
      return;
    case 3:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const b = prev ? prev[i] : 0;
        line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
      }
      return;
    case 4:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const b = prev ? prev[i] : 0;
        const c = prev && i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[i] = (line[i] + pred) & 0xff;
      }
      return;
    default:
      throw new Error(`filtre de PNG desconegut: ${type}`);
  }
}

export function decodePng(buf: Buffer): Raster {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('no es un PNG');

  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];

  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.subarray(p + 4, p + 8).toString('latin1');
    const body = buf.subarray(p + 8, p + 8 + len);

    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const color = body[9];
      const interlace = body[12];
      if (depth !== 8) throw new Error(`PNG de ${depth} bits: nomes se'n llegeixen de 8`);
      if (interlace !== 0) throw new Error('PNG entrellacat: no se llegir-lo');
      // 0 gris, 2 RGB, 4 gris amb alfa, 6 RGBA. El gris amb alfa no el
      // necessita cap tessel-la: hi es per poder tornar a llegir el que
      // escrivim, que es l'unica manera de comprovar que ho escrivim be.
      if (color === 0) channels = 1;
      else if (color === 2) channels = 3;
      else if (color === 4) channels = 2;
      else if (color === 6) channels = 4;
      else throw new Error(`tipus de color ${color}: no se llegir-lo`);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(body));
    } else if (type === 'IEND') {
      break;
    }
    p += 12 + len;
  }

  if (!width || !height || !channels) throw new Error('PNG sense IHDR utilitzable');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);

  let prev: Uint8Array | null = null;
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1);
    const line = raw.subarray(at + 1, at + 1 + stride);
    const row = out.subarray(y * stride, (y + 1) * stride);
    row.set(line);
    unfilter(raw[at], row, prev, channels);
    prev = row;
  }

  return { width, height, channels, data: out };
}

function chunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([len, typed, crc]);
}

/**
 * Gris amb alfa, vuit bits cadascun.
 *
 * `gray` i `alpha` van separats perque es com surten del calcul: la ombra d'una
 * banda i el mar de l'altra.
 */
export function encodeGrayAlpha(
  width: number, height: number, gray: Uint8Array, alpha: Uint8Array,
): Buffer {
  const stride = width * 2;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1);
    // Filtre 0: la linia tal qual. El deflate ja hi treu prou.
    raw[at] = 0;
    for (let x = 0; x < width; x++) {
      raw[at + 1 + x * 2] = gray[y * width + x];
      raw[at + 2 + x * 2] = alpha[y * width + x];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bits per canal
  ihdr[9] = 4;    // gris amb alfa
  ihdr[10] = 0;   // deflate
  ihdr[11] = 0;   // filtre adaptatiu
  ihdr[12] = 0;   // sense entrellacar

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
