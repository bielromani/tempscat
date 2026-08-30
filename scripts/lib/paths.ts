import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

/** Raíz del repositorio. */
export const ROOT = join(here, '..', '..');

/** Descargas crudas de fuentes externas. Se cachean y no se versionan. */
export const RAW = join(ROOT, 'data', 'raw');

/** Artefactos generados por el pipeline. Sí se versionan. */
export const BUILD = join(ROOT, 'data', 'build');

export function ensureDirs() {
  mkdirSync(RAW, { recursive: true });
  mkdirSync(BUILD, { recursive: true });
}

export const raw = (...p: string[]) => join(RAW, ...p);
export const build = (...p: string[]) => join(BUILD, ...p);
