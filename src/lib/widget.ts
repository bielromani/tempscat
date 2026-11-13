import 'server-only';
import { currentFor, forecastFor, groupWarnings, localNowHour, localToday, warningsFor } from './weather';
import { seaNear, douglas, flagStyle, FLAG_SHOW_HOURS, type SeaNearby } from './sea';
import { resortNear, type ResortNearby } from './mountain';
import { weatherCode, codeLabel } from './weather-codes';
import { weatherIconName } from '@/components/WeatherIcon';
import { withObservedToday } from '@/components/LocationView';
import { LEVEL_RANK, type WarningGroup } from './warning-stack';
import { phenomenonName } from './warning-labels';
import { whenLine } from './warning-when';
import { aName, int, num, placeName, relativeDayTiny } from './format';
import { tr, type Lang } from './lang';
import type { CurrentConditions, DailyPoint, HourlyPoint, LocationForecast } from './forecast-types';
import type { Location } from './territory';

/**
 * El widget: el temps d'un lloc, per posar-lo a una altra web.
 *
 * ## Per què HTML escrit a mà i no un component de React
 *
 * Perquè es carrega dins d'un `<iframe>` a la web d'un altre, i el que hi va ha
 * de ser **el que s'ensenya i prou**. Una pàgina de l'App Router porta el
 * runtime de React i la càrrega RSC —uns 170 kB en gzip, vegeu «Cero
 * JavaScript propio» a `AGENTS.md`— per a un requadre de tres línies. Aquí no
 * hi ha cap script: uns 4 kB d'HTML i les icones, que ja són fitxers.
 *
 * ## Per què l'alçada no depèn de les dades
 *
 * Qui el posa copia un `<iframe>` amb una alçada fixa i no el torna a tocar.
 * Si un avís afegís una línia, el widget quedaria tallat a la seva web el dia
 * que més importa. Per això cada mida té les seves files i cada fila té el seu
 * lloc reservat: la línia d'avisos diu «Sense avisos» quan no n'hi ha.
 *
 * ## Els tres tipus
 *
 * `temps` és per a tothom. `platja` només existeix si el municipi té platja al
 * registre (`seaNear`), i `neu` si hi ha una estació d'esquí a 30 km
 * (`resortNear`): un widget de neu a Reus no diria res.
 */

export const WIDGET_KINDS = ['temps', 'platja', 'neu'] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];
export const WIDGET_SIZES = ['petit', 'mitja', 'gran'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];
export const WIDGET_THEMES = ['fosc', 'clar'] as const;
export type WidgetTheme = (typeof WIDGET_THEMES)[number];

/**
 * L'alçada de l'`<iframe>`, en píxels. Les files de `renderWidget` hi han de
 * cabre **sempre**: `npm run test:widget` ho mesura amb un navegador.
 *
 * El mar i la neu porten una fila de més —les tres rajoles— i per això són més
 * alts. El codi que es copia ja porta l'alçada del seu tipus.
 */
export function widgetHeight(size: WidgetSize, kind: WidgetKind): number {
  const extra = kind === 'temps' ? 0 : 70;
  if (size === 'petit') return 132;
  if (size === 'mitja') return 248 + extra;
  return 410 + extra;
}

export interface WidgetData {
  current: CurrentConditions | null;
  forecast: LocationForecast | null;
  warnings: WarningGroup[];
  sea: SeaNearby | null;
  resort: ResortNearby | null;
}

export async function widgetData(loc: Location): Promise<WidgetData> {
  const [current, forecast, warnings, sea, resort] = await Promise.all([
    currentFor(loc), forecastFor(loc), warningsFor(loc), seaNear(loc), resortNear(loc),
  ]);
  return { current, forecast, warnings: groupWarnings(warnings), sea, resort };
}

/** Els tipus que aquell lloc pot portar. `temps`, sempre. */
export function kindsFor(d: WidgetData): WidgetKind[] {
  const out: WidgetKind[] = ['temps'];
  if (d.sea?.now) out.push('platja');
  if (d.resort) out.push('neu');
  return out;
}

export interface WidgetOptions {
  kind: WidgetKind;
  size: WidgetSize;
  theme: WidgetTheme;
  lang: Lang;
  /** L'adreça de la fitxa, absoluta: l'enllaç surt de l'iframe cap a la web. */
  href: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const deg = (v: number | null | undefined) => (v == null ? '—' : `${num(v)}°`);
const icon = (code: number | null | undefined, isDay: boolean, size: number, alt = '') =>
  `<img src="/icons/w/${weatherIconName(code, isDay)}.svg" width="${size}" height="${size}" alt="${esc(alt)}">`;

const LEVEL: Record<string, [string, string]> = {
  groc: ['groc', 'amarillo'], taronja: ['taronja', 'naranja'], vermell: ['vermell', 'rojo'],
};

function nowPoint(f: LocationForecast | null): HourlyPoint | null {
  if (!f?.hourly.length) return null;
  const h = localNowHour();
  return f.hourly.find((p) => p.time.slice(0, 13) === h) ?? f.hourly[0];
}

/** El que es veu a dalt: el lloc, la icona, la temperatura d'ara i el cel. */
function header(loc: Location, d: WidgetData, today: DailyPoint | null, o: WidgetOptions, big: boolean): string {
  const now = nowPoint(d.forecast);
  const t = d.current?.temperatureAdjusted ?? now?.temperature ?? null;
  const code = now?.weatherCode ?? today?.weatherCode ?? null;
  const sky = codeLabel(weatherCode(code), o.lang);
  return `<div class="hd">
  ${icon(code, now?.isDay ?? true, big ? 64 : 52, sky)}
  <div class="t">${deg(t)}</div>
  <div class="who">
    <div class="name">${esc(placeName(loc.nom, o.lang))}</div>
    <div class="sky">${esc(sky)}</div>
    <div class="mm">${tr(o.lang, 'màx.', 'máx.')} ${deg(today?.tMax)} · ${tr(o.lang, 'mín.', 'mín.')} ${deg(today?.tMin)}</div>
  </div>
</div>`;
}

/** L'avís que mana, en una línia. Sense avís, la línia diu que no n'hi ha: el lloc queda reservat. */
function warningLine(d: WidgetData, o: WidgetOptions): string {
  const top = d.warnings
    .filter((g) => g.level !== 'verd')
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0];
  if (!top) return `<div class="wl none">${tr(o.lang, 'Sense avisos oficials', 'Sin avisos oficiales')}</div>`;
  const [ca, es] = LEVEL[top.level];
  const more = d.warnings.filter((g) => g.level !== 'verd').length - 1;
  return `<div class="wl lv-${top.level}" title="${esc(whenLine(top, o.lang))}">
  <b>${tr(o.lang, `Avís ${ca}`, `Aviso ${es}`)}</b> · ${esc(phenomenonName(top.phenomenon, o.lang))}${more > 0 ? ` <span>+${more}</span>` : ''}
</div>`;
}

function days(daily: DailyPoint[], todayIso: string, n: number, o: WidgetOptions): string {
  return `<ol class="days">${daily.slice(0, n).map((d) => `<li>
  <span class="dn">${esc(relativeDayTiny(d.date, todayIso, o.lang))}</span>
  ${icon(d.weatherCode, true, 30, codeLabel(weatherCode(d.weatherCode), o.lang))}
  <span class="dx">${deg(d.tMax)}</span><span class="di">${deg(d.tMin)}</span>
  <span class="dp">${d.precipProbability >= 20 ? `${d.precipProbability}%` : ''}</span>
</li>`).join('')}</ol>`;
}

function hours(f: LocationForecast, o: WidgetOptions): string {
  const h = localNowHour();
  const i = Math.max(0, f.hourly.findIndex((p) => p.time.slice(0, 13) === h));
  const pts = f.hourly.slice(i + 1, i + 13).filter((_, k) => k % 2 === 0);
  return `<ol class="hours">${pts.map((p) => `<li>
  <span class="hn">${Number(p.time.slice(11, 13))} h</span>
  ${icon(p.weatherCode, p.isDay, 28, codeLabel(weatherCode(p.weatherCode), o.lang))}
  <span class="ht">${deg(p.temperature)}</span>
  <span class="hp">${(p.precipitation ?? 0) >= 0.2 ? `${num(p.precipitation, 1)}` : ''}</span>
</li>`).join('')}</ol>`;
}

function tile(label: string, value: string, sub = '', style = ''): string {
  return `<div class="tile"${style ? ` style="${style}"` : ''}><div class="tl">${esc(label)}</div><div class="tv">${value}</div><div class="ts">${esc(sub)}</div></div>`;
}

/** El mar: l'aigua, l'onatge i la bandera de la platja, si és d'avui. */
function seaTiles(sea: SeaNearby, current: CurrentConditions | null, o: WidgetOptions): string {
  const n = sea.now!;
  const beach = sea.beaches.find((b) => b.ageHours <= FLAG_SHOW_HOURS && b.flag && b.flag !== 'sense informacio');
  const flag = beach ? flagStyle(beach.flag, o.lang) : null;
  return `<div class="tiles">
  ${tile(tr(o.lang, 'Aigua', 'Agua'), deg(n.sst), tr(o.lang, 'ara', 'ahora'))}
  ${tile(tr(o.lang, 'Onatge', 'Oleaje'), n.waveHeight != null ? `${num(n.waveHeight, 1)} m` : '—', n.waveHeight != null ? douglas(n.waveHeight, o.lang) : '')}
  ${flag
    ? tile(tr(o.lang, 'Bandera', 'Bandera'), esc(flag.label), beach!.name, `--flag:${flag.color}`)
    : tile(tr(o.lang, 'Vent', 'Viento'), current?.windSpeed != null ? `${num(current.windSpeed * 3.6)} km/h` : '—',
      current?.windGust != null ? tr(o.lang, `ratxa ${num(current.windGust * 3.6)} km/h`, `racha ${num(current.windGust * 3.6)} km/h`) : '')}
</div>`;
}

/**
 * La neu: l'estació, el gruix i la que en preveu el model.
 *
 * El gruix només surt amb un comunicat vigent (`reportUsable`); sense, la
 * rajola diu on és la isozero, que és el que fa que plogui o nevi a cota i que
 * sí que hi és sempre.
 */
function snowTiles(r: ResortNearby, daily: DailyPoint[], f: LocationForecast | null, o: WidgetOptions): string {
  const s = r.resort;
  const next = daily.slice(0, 3).reduce((a, d) => a + (d.snowfall ?? 0), 0);
  const level = daily.slice(0, 3).map((d) => d.snowLevel).find((v) => v != null) ?? null;
  const iso = nowPoint(f)?.freezingLevel ?? null;
  const thick = s.reportUsable && s.snowMaxCm != null
    ? tile(tr(o.lang, 'Gruix', 'Espesor'),
      `${s.snowMinCm != null && s.snowMinCm !== s.snowMaxCm ? `${s.snowMinCm}–` : ''}${s.snowMaxCm} cm`,
      tr(o.lang, 'comunicat de l’estació', 'parte de la estación'))
    : tile(tr(o.lang, 'Isozero', 'Isocero'), iso != null ? `${int(Math.round(iso / 50) * 50)} m` : '—', tr(o.lang, 'ara', 'ahora'));
  return `<div class="tiles">
  ${tile(s.name, s.open ? tr(o.lang, 'Oberta', 'Abierta') : tr(o.lang, 'Tancada', 'Cerrada'),
    s.reportUsable && s.slopesOpenPct != null ? tr(o.lang, `${s.slopesOpenPct}% pistes`, `${s.slopesOpenPct}% pistas`) : '', `--flag:${s.open ? 'var(--ok)' : 'var(--off)'}`)}
  ${thick}
  ${tile(tr(o.lang, 'Neu prevista', 'Nieve prevista'), next >= 0.5 ? `${num(next)} cm` : '0 cm',
    level != null ? tr(o.lang, `cota ${int(level)} m`, `cota ${int(level)} m`) : tr(o.lang, '3 dies', '3 días'))}
</div>`;
}

const CSS = `
:root{--bg:#0e1e35;--bg2:#17345c;--ink:#f6f8fb;--ink2:#c9d3e2;--line:rgba(255,255,255,.14);--tile:rgba(255,255,255,.07);--ok:#3fa96b;--off:#8796ad;
--groc:#f2c94c;--taronja:#f2994a;--vermell:#d9443b;color-scheme:dark}
:root.clar{--bg:#cfe4f8;--bg2:#8fbfea;--ink:#0f2440;--ink2:#2f4a6b;--line:rgba(15,36,64,.16);--tile:rgba(255,255,255,.42);color-scheme:light}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font:14px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:linear-gradient(160deg,var(--bg2),var(--bg) 70%);
border-radius:14px;overflow:hidden;display:flex;flex-direction:column;padding:12px 14px 10px}
:root.clar img{filter:drop-shadow(0 1px 2px rgba(15,36,64,.35))}
a{color:inherit;text-decoration:none}
.hd{display:flex;align-items:center;gap:8px}
.hd img{flex:none;margin:-6px -2px -6px -6px}
.t{font-size:40px;font-weight:300;letter-spacing:-1px;font-variant-numeric:tabular-nums}
.gran .t{font-size:48px}
.who{min-width:0;margin-left:6px;border-left:1px solid var(--line);padding-left:10px}
.name{font-weight:650;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sky,.mm{color:var(--ink2);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mm{font-variant-numeric:tabular-nums}
.wl{margin-top:9px;font-size:12.5px;padding:4px 8px;border-radius:7px;background:var(--tile);color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wl b{font-weight:650}
.wl.lv-groc{background:var(--groc);color:#2a2306}.wl.lv-taronja{background:var(--taronja);color:#2b1404}.wl.lv-vermell{background:var(--vermell);color:#fff}
.wl span{opacity:.75}
.days{list-style:none;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;margin-top:10px}
.days li{display:grid;justify-items:center;background:var(--tile);border-radius:9px;padding:5px 2px;font-variant-numeric:tabular-nums}
.dn{font-size:12px;color:var(--ink2);text-transform:capitalize}
.dx{font-weight:600}.di{font-size:12px;color:var(--ink2)}
.dp{font-size:11px;color:#7cc4ff;min-height:13px}
:root.clar .dp,:root.clar .hp{color:#1a6fc0}
.gran .days{grid-auto-flow:row;grid-auto-columns:auto;gap:2px}
.gran .days li{grid-template-columns:52px 30px 1fr 40px 40px;justify-items:start;align-items:center;padding:1px 8px;border-radius:7px}
.gran .days li .dx{grid-column:4;justify-self:end}.gran .days li .di{grid-column:5;justify-self:end}
.gran .days li .dp{grid-column:3;grid-row:1;justify-self:end;padding-right:6px;min-height:0}
.hours{list-style:none;display:grid;grid-template-columns:repeat(6,1fr);gap:2px;margin-top:10px;font-variant-numeric:tabular-nums}
.hours li{display:grid;justify-items:center}
.hn{font-size:11.5px;color:var(--ink2)}.ht{font-weight:600;font-size:13px}.hp{font-size:11px;color:#7cc4ff;min-height:13px}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:10px}
.tile{background:var(--tile);border-radius:9px;padding:6px 8px;min-width:0;border-top:3px solid var(--flag,transparent)}
.tl,.ts{font-size:11.5px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tv{font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.ft{margin-top:auto;padding-top:7px;display:flex;justify-content:space-between;align-items:baseline;font-size:11.5px;color:var(--ink2);gap:8px}
.ft b{color:var(--ink);font-weight:700;font-size:13px}
.ft a:hover{text-decoration:underline}
.ft .src{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;

/** La pàgina sencera que va dins de l'`<iframe>`. */
export function renderWidget(loc: Location, d: WidgetData, o: WidgetOptions): string {
  const todayIso = localToday();
  const daily = d.forecast ? withObservedToday(d.forecast.daily, todayIso, d.current).filter((x) => x.date >= todayIso) : [];
  const today = daily.find((x) => x.date === todayIso) ?? null;
  const kind = kindsFor(d).includes(o.kind) ? o.kind : 'temps';

  const parts: string[] = [header(loc, d, today, o, o.size === 'gran')];
  if (o.size === 'petit') {
    parts.push(warningLine(d, o));
  } else {
    parts.push(warningLine(d, o));
    if (kind === 'platja') parts.push(seaTiles(d.sea!, d.current, o));
    else if (kind === 'neu') parts.push(snowTiles(d.resort!, daily, d.forecast, o));
    if (o.size === 'mitja') parts.push(days(daily, todayIso, 4, o));
    if (o.size === 'gran') {
      if (d.forecast) parts.push(hours(d.forecast, o));
      parts.push(days(daily, todayIso, 5, o));
    }
  }

  const title = tr(o.lang, `El temps ${aName(loc.nom)}`, `El tiempo ${aName(loc.nom, o.lang)}`);
  const src = kind === 'platja'
    ? tr(o.lang, 'Platges: Generalitat · mar: Open-Meteo', 'Playas: Generalitat · mar: Open-Meteo')
    : kind === 'neu'
      ? tr(o.lang, 'Neu: FGC · temps: XEMA i Open-Meteo', 'Nieve: FGC · tiempo: XEMA y Open-Meteo')
      : tr(o.lang, 'XEMA (Meteocat) i Open-Meteo', 'XEMA (Meteocat) y Open-Meteo');

  return `<!doctype html>
<html lang="${o.lang}" class="${o.theme === 'clar' ? 'clar' : ''}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · tempscat</title><base target="_blank"><style>${CSS}</style></head>
<body class="${o.size}">
<a href="${esc(o.href)}" rel="noopener" style="display:contents">
${parts.join('\n')}
</a>
<div class="ft"><span class="src">${esc(src)}</span><a href="${esc(o.href)}" rel="noopener"><b>tempscat</b> →</a></div>
</body></html>`;
}
