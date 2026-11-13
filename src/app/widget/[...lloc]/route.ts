import { locationByPath } from '@/lib/territory';
import { langFromHost } from '@/lib/lang';
import { absolute } from '@/lib/site';
import {
  renderWidget, widgetData, WIDGET_KINDS, WIDGET_SIZES, WIDGET_THEMES,
  type WidgetKind, type WidgetSize, type WidgetTheme,
} from '@/lib/widget';

/**
 * El widget d'un lloc: `/widget/<comarca>/<municipi>[/<entitat>]?tipus=&mida=&tema=`.
 *
 * Una route handler i no una pàgina: no passa pel layout del web ni porta cap
 * script. Vegeu `src/lib/widget.ts`.
 *
 * ## La memòria cau
 *
 * Cinc minuts al CDN, com les fitxes (`LIVE_PAGES` a `next.config.ts`). Cada
 * combinació d'adreça es genera com a molt 288 vegades al dia **la tingui posada
 * qui la tingui**: una web amb deu mil visites diàries que el porti no costa més
 * que una amb deu. La consulta forma part de la clau, i per això els valors que
 * no són a la llista es rebutgen en comptes d'ignorar-se: `?mida=gran&x=1`,
 * `?x=2`… serien entrades noves de la memòria cau per al mateix widget.
 *
 * ## Per què `noindex`
 *
 * Perquè és la fitxa dita més curta. Indexada, competiria amb ella.
 */
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['tipus', 'mida', 'tema']);

function pick<T extends string>(v: string | null, list: readonly T[], dflt: T): T | null {
  if (v == null) return dflt;
  return (list as readonly string[]).includes(v) ? (v as T) : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ lloc: string[] }> }) {
  const { lloc } = await params;
  const url = new URL(req.url);
  const notFound = () => new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });

  if ([...url.searchParams.keys()].some((k) => !ALLOWED.has(k))) return notFound();
  const kind = pick<WidgetKind>(url.searchParams.get('tipus'), WIDGET_KINDS, 'temps');
  const size = pick<WidgetSize>(url.searchParams.get('mida'), WIDGET_SIZES, 'mitja');
  const theme = pick<WidgetTheme>(url.searchParams.get('tema'), WIDGET_THEMES, 'fosc');
  if (!kind || !size || !theme || lloc.length < 2 || lloc.length > 3) return notFound();

  const loc = locationByPath(`/${lloc.join('/')}`);
  if (!loc || !loc.published || loc.level === 'comarca') return notFound();

  const lang = langFromHost(req.headers.get('host'));
  const data = await widgetData(loc);
  const html = renderWidget(loc, data, { kind, size, theme, lang, href: absolute(loc.path, lang) });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Vercel-CDN-Cache-Control': 'max-age=300',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex',
      // Es pot posar a qualsevol web: és el que és.
      'Content-Security-Policy': "frame-ancestors *; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
