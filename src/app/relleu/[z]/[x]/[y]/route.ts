import { blob } from '@/lib/cache-store';

/**
 * Serveix les tessel·les de relleu que `scripts/13-relief-tiles.ts` ja ha
 * calculat.
 *
 * No és un proxy. Si el fitxer no hi és, torna 404 i no surt a buscar-lo: és
 * el mateix principi que el radar i les càmeres, i el que fa que una visita no
 * es converteixi mai en una petició a un tercer.
 *
 * ## Els tres paràmetres es validen abans de tocar res
 *
 * Són tres segments d'URL que acaben concatenats en una ruta de l'emmagatzematge,
 * i sense validar-los un `..%2f` llegeix el que no ha de llegir. La comprovació
 * és estricta —només xifres i el zoom que existeix— i no és paranoia de manual:
 * és el mateix que ja fa la ruta del radar, i per la mateixa raó.
 *
 * ## Caduca d'aquí a un any
 *
 * L'altitud del terreny no canvia. La imatge es calcula un cop i el nom porta
 * el zoom a dins, així que si algun dia se'n fa una altra versió serà una altra
 * adreça. Amb `immutable`, un navegador que ja la tingui no torna a preguntar.
 */

/*
 * Els zooms que existeixen, i només aquests.
 *
 * Va quedar-hi `/^12$/` de quan només se n'havia calculat un, i els 29
 * itineraris prou grans per demanar el 10 o l'11 es quedaven sense relleu amb
 * un 404 per tessel·la. No es veia com un error: es veia com un mapa buit.
 */
const Z_RE = /^(9|10|11|12)$/;
const N_RE = /^\d{1,5}$/;
const Y_RE = /^\d{1,5}\.png$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await params;
  if (!Z_RE.test(z) || !N_RE.test(x) || !Y_RE.test(y)) {
    return new Response('Not found', { status: 404 });
  }

  const bytes = await blob(`relleu/${z}/${x}/${y}`);
  if (!bytes) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
