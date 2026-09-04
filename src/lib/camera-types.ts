/**
 * La forma de una cámara, sin nada detrás.
 *
 * Está aparte del lector porque la escribe el worker y la lee la aplicación, y
 * como el resto de los ficheros compartidos **no importa nada**: los scripts lo
 * cargan con la extensión `.ts` y la aplicación con el alias `@/`.
 *
 * Lo que este fichero no dice —cuántas horas se considera vigente una imagen,
 * cuándo se deja de enseñar— está en `src/lib/cameras.ts`, que es donde se
 * puede razonar con el reloj.
 */

export interface Camera {
  /** El de FGC. Es el nombre del fichero de la imagen en el almacén. */
  id: string;
  /** Estación y nombre, para la URL de su página. */
  slug: string;
  /** El sitio, ya sin «Webcam 360» ni «P4E» delante ni detrás. */
  name: string;
  /** La estación o el equipamiento: «La Molina», «Vall de Núria». */
  resort: string;
  /**
   * La unidad de negocio de FGC, que es la clave que ata la cámara a su
   * estación en `mountain-types.ts`.
   *
   * Va aquí y no se deduce del nombre a propósito. El nombre coincide hoy
   * —«La Molina» a los dos lados— y esa coincidencia es exactamente lo que se
   * rompe sin avisar: bastaría que un catálogo escribiera «Molina» o «La
   * Molina - Alp» para que la estación se quedara sin cámaras con todo en
   * verde. El `business_unit` es un número y va en los dos conjuntos.
   *
   * El 24 es el Parc Astronòmic del Montsec, que no es estación de esquí: su
   * cámara existe y no cruza con ninguna.
   */
  bunitId: string;
  /**
   * Los metros que el propio nombre llevaba dentro, cuando los llevaba.
   *
   * No es la altitud del catálogo —no la trae—, así que solo está en las que
   * la escribían en el nombre con la unidad puesta.
   */
  altitudM: number | null;
  /** Las de Roundshot son panorámicas anchas; el resto, fotogramas normales. */
  panoramic: boolean;
  /**
   * El visor original, solo en las panorámicas.
   *
   * Es un enlace, no una imagen: quien quiera girar la panorámica hace un clic
   * y sabe adónde va. Lo que no se hace es incrustarla, que es lo que mandaría
   * la IP de todo el mundo allí sin preguntar.
   */
  viewer: string | null;
  /**
   * Coordenada, **solo si el worker se la ha creído**.
   *
   * Nula cuando el catálogo daba un punto imposible. Ver la cabecera de
   * `scripts/workers/cameras.ts`: cinco de las treinta lo daban.
   */
  lat: number | null;
  lon: number | null;
  /** El municipio publicado más cercano, para poder ir de la cámara a su ficha. */
  nearest: { id: string; nom: string; path: string; distKm: number } | null;
  /** La hora de la fotografía, del `Last-Modified` de la imagen original. */
  capturedAt: string;
  /** Del JPEG ya reescalado, para que la reja no salte al cargar. */
  width: number | null;
  height: number | null;
}

export interface CamerasData {
  cameras: Camera[];
  /** Radio con el que una ficha de municipio reclama una cámara como suya. */
  nearKm: number;
  license: string;
  attribution: string;
}
