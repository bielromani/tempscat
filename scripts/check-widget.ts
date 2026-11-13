/**
 * Que al widget no quedi res tallat, i que sigui una sola petició.
 *
 * ## Per què cal un navegador
 *
 * Un text que no hi cap no dona cap error: el navegador el talla, o el fa
 * sortir per la vora, i el widget es veu sencer a qui no el mira de prop. Va
 * passar amb la primera versió —el bloc del sol i el de l'aire sortien a
 * mitges— i es va veure a ull. Això només es pot mesurar amb la pàgina pintada,
 * així que s'obre Chrome sense finestra i se li parla pel protocol de
 * depuració (CDP), amb el `WebSocket` que Node ja porta: cap dependència.
 *
 * ## Què mira
 *
 * Per a cada lloc, format, amplada, amb icones i sense, i amb les dades de
 * prova (avisos, banderes i neu, que és el cas més ple):
 *
 *   - que cap element tingui més contingut que caixa (`scrollWidth >
 *     clientWidth`): és el que fa un `text-overflow: ellipsis` o un
 *     `overflow: hidden`;
 *   - que cap element surti per la dreta del widget;
 *   - que la pàgina no demani **res** més que l'HTML. Les icones van
 *     incrustades a posta —vegeu `iconUri()` a `src/lib/widget.ts`—: cada
 *     petició de més, multiplicada per les visites de totes les webs que el
 *     portin, es paga al CDN.
 *
 *     npm run check:widget
 *     npm run check:widget -- https://tempscat.cat
 *     npm run check:widget -- http://es.localhost:3000
 *
 * Chrome el busca a `CHROME_PATH` o als llocs de sempre. Surt amb codi 1 si
 * troba res.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = (process.argv.slice(2).find((a) => !a.startsWith('--')) ?? process.env.WIDGET_BASE ?? 'http://localhost:3000')
  .replace(/\/$/, '');

/** Un lloc de costa, un de ciutat, un de muntanya amb estació i un d'interior. */
const PLACES = [
  '/maresme/malgrat-de-mar',
  '/barcelones/barcelona',
  '/ripolles/queralbs',
  '/segria/lleida',
];
const ALL = 'avisos,hores,pluja,vent,humitat,uv,sol,aire,mar,bandera,muntanya,neu';

/** Les amplades del configurador (`WidgetBuilder.tsx`), més una de telèfon per als formats amples. */
const CASES: { format: string; widths: number[]; days: number[] }[] = [
  { format: 'mini', widths: [180, 220, 260], days: [0] },
  { format: 'targeta', widths: [280, 320, 380, 600], days: [0, 3, 7] },
  { format: 'apaisat', widths: [360, 560, 680, 800, 1100], days: [0, 5, 7] },
];

const CHROMES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((p): p is string => !!p);

/** El que s'avalua dins del widget. Torna una llista de problemes. */
const MEASURE = `(() => {
  const out = [];
  const W = document.documentElement.clientWidth;
  const name = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '');
  for (const e of document.body.querySelectorAll('*')) {
    if (e.tagName === 'SCRIPT' || e.closest('svg')) continue;
    const r = e.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const text = (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
    if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && getComputedStyle(e).overflowX !== 'visible')
      out.push('tallat ' + name(e) + ' (' + e.scrollWidth + ' > ' + e.clientWidth + ') «' + text + '»');
    if (r.right > W + 1) out.push('surt per la dreta ' + name(e) + ' (' + Math.round(r.right) + ' > ' + W + ') «' + text + '»');
  }
  // Sense el peu no és el widget: un 404, o una pàgina d'error. (Ho mira Chrome i
  // no un fetch de Node, que no sap resoldre es.localhost.)
  if (!document.querySelector('.ft .brand')) return ['no és el widget: ' + document.title];
  if (document.documentElement.scrollWidth > W + 1) out.push('la pàgina es desplaça de costat (' + document.documentElement.scrollWidth + ' > ' + W + ')');
  const extra = performance.getEntriesByType('resource').map((x) => x.name).filter((n) => !n.startsWith('data:'));
  for (const n of extra) out.push('petició de més: ' + n);
  return [...new Set(out)];
})()`;

class Cdp {
  private id = 0;
  private pending = new Map<number, (v: { result?: unknown; error?: { message: string } }) => void>();
  private events: ((m: { method: string; params: unknown; sessionId?: string }) => void)[] = [];
  private ws: WebSocket;
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)!(m); this.pending.delete(m.id); }
      else if (m.method) this.events.forEach((f) => f(m));
    });
  }
  static async open(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise((ok, ko) => { ws.addEventListener('open', ok); ws.addEventListener('error', ko); });
    return new Cdp(ws);
  }
  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((ok, ko) => this.pending.set(id, (m) => (m.error ? ko(new Error(`${method}: ${m.error.message}`)) : ok(m.result as T))));
  }
  waitFor(method: string, sessionId: string, ms = 20000): Promise<void> {
    return new Promise((ok, ko) => {
      const t = setTimeout(() => ko(new Error(`${method} no arriba`)), ms);
      const f = (m: { method: string; sessionId?: string }) => {
        if (m.method === method && m.sessionId === sessionId) { clearTimeout(t); this.events = this.events.filter((g) => g !== f); ok(); }
      };
      this.events.push(f);
    });
  }
  close() { this.ws.close(); }
}

async function main() {
  const chrome = CHROMES.find((p) => existsSync(p));
  if (!chrome) throw new Error('No trobo Chrome: poseu-ne el camí a CHROME_PATH');
  const profile = mkdtempSync(join(tmpdir(), 'check-widget-'));
  const proc = spawn(chrome, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise<string>((ok, ko) => {
    let buf = '';
    const t = setTimeout(() => ko(new Error('Chrome no ha arrencat')), 20000);
    proc.stderr!.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); ok(m[1]); }
    });
  });

  const cdp = await Cdp.open(wsUrl);
  const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);

  let checked = 0;
  const problems: string[] = [];
  try {
    for (const place of PLACES) {
      for (const { format, widths, days } of CASES) {
        for (const icons of [true, false]) {
          for (const dies of days) {
            const q = new URLSearchParams({ format, mostra: format === 'mini' ? 'avisos' : ALL, dies: String(dies), prova: '1' });
            if (!icons) q.set('icones', '0');
            const url = `${base}/widget${place}?${q}`;
            for (const width of widths) {
              await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
              const loaded = cdp.waitFor('Page.loadEventFired', sessionId);
              await cdp.send('Page.navigate', { url }, sessionId);
              await loaded;
              const { result } = await cdp.send<{ result: { value: string[] } }>('Runtime.evaluate', { expression: MEASURE, returnByValue: true }, sessionId);
              checked++;
              for (const p of result.value) problems.push(`${place} ${format} ${width}px dies=${dies}${icons ? '' : ' sense icones'}: ${p}`);
            }
          }
        }
      }
    }
  } finally {
    cdp.close();
    proc.kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Windows hi pot tenir un fitxer obert */ }
  }

  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(`${checked} vistes del widget a ${base}: ${problems.length ? `${problems.length} problemes` : 'res tallat, una sola petició'}`);
  if (problems.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
