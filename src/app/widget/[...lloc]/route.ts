import { locationByPath } from '@/lib/territory';
import { langFromHost } from '@/lib/lang';
import { absolute } from '@/lib/site';
import {
  renderWidget, widgetData, DEFAULT_DAYS, DEFAULT_PIECES, WIDGET_DAYS, WIDGET_PIECES, WIDGET_THEMES,
  type WidgetPiece, type WidgetTheme,
} from '@/lib/widget';

/**
 * El widget d'un lloc:
 *
 *     /widget/<comarca>/<municipi>[/<entitat>]?mostra=avisos,vent,aire&dies=5&tema=clar
 *
 * Una route handler i no una pàgina: no passa pel layout del web ni porta el
 * runtime de React. Vegeu `src/lib/widget.ts`.
 *
 * ## La memòria cau
 *
 * Cinc minuts al CDN, com les fitxes (`LIVE_PAGES` a `next.config.ts`). Cada
 * adreça es genera com a molt 288 vegades al dia **la tingui posada qui la
 * tingui**: una web amb deu mil visites diàries que el porti no costa més que
 * una amb deu. La consulta forma part de la clau, i per això el que no és a la
 * llista es rebutja en comptes d'ignorar-se: `?x=1`, `?x=2`… serien entrades
 * noves de la memòria cau per al mateix widget.
 *
 * ## Per què `noindex`
 *
 * Perquè és la fitxa dita més curta. Indexada, competiria amb ella.
 */
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['mostra', 'dies', 'tema']);

export async function GET(req: Request, { params }: { params: Promise<{ lloc: string[] }> }) {
  const { lloc } = await params;
  const q = new URL(req.url).searchParams;
  const notFound = () => new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });

  if ([...q.keys()].some((k) => !ALLOWED.has(k))) return notFound();

  const rawPieces = q.get('mostra');
  const pieces = rawPieces == null ? DEFAULT_PIECES : rawPieces === '' ? [] : rawPieces.split(',');
  if (!pieces.every((p) => (WIDGET_PIECES as readonly string[]).includes(p))) return notFound();

  const days = q.get('dies') == null ? DEFAULT_DAYS : Number(q.get('dies'));
  if (!(WIDGET_DAYS as readonly number[]).includes(days)) return notFound();

  const theme = (q.get('tema') ?? 'fosc') as WidgetTheme;
  if (!WIDGET_THEMES.includes(theme)) return notFound();

  if (lloc.length < 2 || lloc.length > 3) return notFound();
  const loc = locationByPath(`/${lloc.join('/')}`);
  if (!loc || !loc.published || loc.level === 'comarca') return notFound();

  const lang = langFromHost(req.headers.get('host'));
  const data = await widgetData(loc, lang);
  const html = renderWidget(loc, data, {
    pieces: pieces as WidgetPiece[], days, theme, lang, href: absolute(loc.path, lang),
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Vercel-CDN-Cache-Control': 'max-age=300',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex',
      // Es pot posar a qualsevol web: és el que és. L'únic script és el de l'alçada.
      'Content-Security-Policy': "frame-ancestors *; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    },
  });
}
