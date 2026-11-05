import { NextResponse, type NextRequest } from 'next/server';
import { langFromHost } from '@/lib/lang';
import { absolute } from '@/lib/site';

/**
 * L'enllaç «En castellano» / «En català» del peu: la mateixa pàgina, a l'altre
 * idioma.
 *
 * El peu viu al `layout`, i un layout no sap en quina ruta és. Comptar-ho amb
 * un component de client seria JavaScript a les 4.293 fitxes per a un enllaç;
 * en canvi, el navegador ja diu d'on ve el clic a la capçalera `Referer` —dins
 * del mateix domini, amb la ruta sencera— i aquí només cal girar el domini.
 *
 * Del `Referer` se'n fa servir **només el camí**: el destí es construeix
 * sempre amb `absolute()`, així que aquesta adreça no pot portar a cap altre
 * lloc que no sigui aquest web. Sense `Referer` —un robot, una política de
 * privadesa estricta— porta a la portada de l'altre idioma, que és el que feia
 * l'enllaç abans.
 */
export function GET(req: NextRequest) {
  const from = langFromHost(req.headers.get('host'));
  const to = from === 'ca' ? 'es' : 'ca';

  let path = '/';
  const ref = req.headers.get('referer');
  if (ref) {
    try {
      const u = new URL(ref);
      // Només si ve d'aquest mateix domini: d'un altre lloc, la portada.
      if (u.host === req.headers.get('host')) path = `${u.pathname}${u.search}`;
    } catch {
      // Un `Referer` mal format: la portada.
    }
  }

  const res = NextResponse.redirect(absolute(path, to), 302);
  // Depèn de qui el demana: cap memòria cau no la pot guardar per a un altre.
  res.headers.set('Cache-Control', 'private, no-store');
  res.headers.set('X-Robots-Tag', 'noindex');
  return res;
}
