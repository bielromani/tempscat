/**
 * Lector de archivos tar en memoria.
 *
 * AEMET sirve los avisos CAP como un tar de XML. Se lee aquí y no con el `tar`
 * del sistema por dos razones: en Windows, `tar` interpreta una ruta como
 * `C:/...` como un host remoto y falla con "Cannot connect to C" — un fallo
 * silencioso que hace parecer que no hay avisos cuando sí los hay; y porque un
 * worker no debería depender de qué binarios tenga la máquina.
 *
 * Solo implementa lo que hace falta: cabeceras USTAR/GNU y ficheros normales.
 */

export interface TarEntry {
  name: string;
  content: Buffer;
}

const BLOCK = 512;

function readString(buf: Buffer, offset: number, length: number): string {
  const end = buf.indexOf(0, offset);
  const stop = end === -1 || end > offset + length ? offset + length : end;
  return buf.toString('utf8', offset, stop).trim();
}

function readOctal(buf: Buffer, offset: number, length: number): number {
  const s = readString(buf, offset, length).replace(/[^0-7]/g, '');
  return s ? parseInt(s, 8) : 0;
}

export function readTar(buf: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + BLOCK <= buf.length) {
    // Dos bloques de ceros marcan el final del archivo.
    if (buf[offset] === 0) break;

    const name = readString(buf, offset, 100);
    const size = readOctal(buf, offset + 124, 12);
    const typeflag = String.fromCharCode(buf[offset + 156]);
    // Los tar GNU largos parten el nombre en prefijo + nombre.
    const prefix = readString(buf, offset + 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;

    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;

    // '0' y '\0' son ficheros normales; el resto (directorios, enlaces,
    // extensiones GNU) se salta.
    if ((typeflag === '0' || typeflag === '\0') && size > 0 && dataEnd <= buf.length) {
      entries.push({ name: fullName, content: buf.subarray(dataStart, dataEnd) });
    }

    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
  }

  return entries;
}
