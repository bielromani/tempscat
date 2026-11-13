import 'server-only';
import {
  airQualityFor, astronomyFor, currentFor, forecastFor, groupWarnings, localNowHour, localToday, warningsFor,
  type AirQuality,
} from './weather';
import {
  seaNear, douglas, flagStyle, parseJellyfish, speciesInfo, worstJellyfish, STING_STYLE, FLAG_CURRENT_HOURS,
  type Beach, type SeaNearby,
} from './sea';
import { resortNear, type ResortNearby } from './mountain';
import { aqiBand, aqiLabel } from './air-variables';
import { weatherCode, codeLabel } from './weather-codes';
import { weatherIconName } from '@/components/WeatherIcon';
import { withObservedToday } from '@/components/LocationView';
import { LEVEL_RANK, type WarningGroup } from './warning-stack';
import { phenomenonName } from './warning-labels';
import { whenLine } from './warning-when';
import { aName, int, num, placeName, relativeDayTiny } from './format';
import { tr, type Lang } from './lang';
import type { CurrentConditions, DailyPoint, LocationForecast } from './forecast-types';
import type { Location } from './territory';

/**
 * El widget: el temps d'un lloc, per posar-lo a una altra web.
 *
 * ## Es munta per peces
 *
 * Qui el posa tria què hi surt (`mostra=`) i quants dies (`dies=`); la capçalera
 * —el lloc, la temperatura d'ara, el cel, la màxima i la mínima— hi és sempre.
 * Les peces que depenen del lloc només es poden triar on tenen sentit: el mar on
 * hi ha platja al registre (`seaNear`), la neu on hi ha una estació d'esquí a
 * 30 km (`resortNear`). `piecesFor()` diu quines.
 *
 * ## Les peces que no sempre hi són
 *
 * Els avisos i les banderes de platja **no ocupen lloc quan no n'hi ha**: un
 * requadre que diu «sense avisos» tot l'any és soroll. Per això l'alçada no és
 * fixa i el widget l'anuncia a la pàgina que el porta amb un `postMessage`: és
 * l'únic script que hi ha, i no fa res més. El codi que es copia porta les
 * línies que l'escolten; sense elles, l'`<iframe>` es queda amb l'alçada que es
 * va mesurar al configurador, i el dia que surt un avís la part de baix queda
 * tallada, però no es trenca res.
 *
 * ## Per què HTML escrit a mà i no un component de React
 *
 * Perquè es carrega dins de la web d'un altre, i hi ha d'anar el que s'ensenya i
 * prou. Una pàgina de l'App Router porta el runtime de React i la càrrega RSC
 * —uns 170 kB en gzip— per a un requadre de deu línies. Així són uns 6 kB i les
 * icones, que ja són fitxers.
 *
 * ## Per què no diu d'on surt cada dada
 *
 * Perquè no és la dada de la font tal com ve: la temperatura és el model
 * corregit amb les estacions, la màxima del dia barreja predicció i mesura… La
 * fitxa ho explica tot, i el widget hi porta: la capçalera i la marca són un
 * enllaç a la fitxa, i el codi que es copia en porta un altre a fora. La CC BY
 * 4.0 de les fonts admet donar el crèdit amb un enllaç a on es dona.
 */

export const WIDGET_PIECES = ['avisos', 'hores', 'vent', 'sol', 'aire', 'mar', 'bandera', 'neu'] as const;
export type WidgetPiece = (typeof WIDGET_PIECES)[number];
export const WIDGET_DAYS = [0, 3, 5, 7] as const;
export const WIDGET_THEMES = ['fosc', 'clar'] as const;
export type WidgetTheme = (typeof WIDGET_THEMES)[number];

/** El que hi ha quan l'adreça no diu res. */
export const DEFAULT_PIECES: WidgetPiece[] = ['avisos'];
export const DEFAULT_DAYS = 5;

export interface WidgetData {
  current: CurrentConditions | null;
  forecast: LocationForecast | null;
  warnings: WarningGroup[];
  sea: SeaNearby | null;
  resort: ResortNearby | null;
  air: AirQuality | null;
}

export async function widgetData(loc: Location, lang: Lang): Promise<WidgetData> {
  const [current, forecast, warnings, sea, resort, air] = await Promise.all([
    currentFor(loc), forecastFor(loc), warningsFor(loc), seaNear(loc), resortNear(loc), airQualityFor(loc, lang),
  ]);
  return { current, forecast, warnings: groupWarnings(warnings), sea, resort, air };
}

/** Les peces que aquest lloc pot portar. */
export function piecesFor(d: WidgetData): WidgetPiece[] {
  return WIDGET_PIECES.filter((p) => {
    if (p === 'mar') return Boolean(d.sea?.now);
    if (p === 'bandera') return Boolean(d.sea?.beaches.length);
    if (p === 'neu') return Boolean(d.resort);
    if (p === 'aire') return d.air?.aqi != null;
    return true;
  });
}

export interface WidgetOptions {
  pieces: WidgetPiece[];
  days: number;
  theme: WidgetTheme;
  lang: Lang;
  /** L'adreça de la fitxa, absoluta: els enllaços surten de l'iframe cap a la web. */
  href: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const deg = (v: number | null | undefined) => (v == null ? '—' : `${num(v)}°`);
const kmh = (ms: number) => num(ms * 3.6);
const icon = (code: number | null | undefined, isDay: boolean, size: number, alt = '') =>
  `<img src="/icons/w/${weatherIconName(code, isDay)}.svg" width="${size}" height="${size}" alt="${esc(alt)}">`;
const clock = (d: Date | null) => (d == null ? '—' : d.toLocaleTimeString('ca-ES', {
  timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit',
}));

const LEVEL: Record<string, [string, string]> = {
  groc: ['groc', 'amarillo'], taronja: ['taronja', 'naranja'], vermell: ['vermell', 'rojo'],
};
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const compass = (d: number) => COMPASS[Math.round((((d % 360) + 360) % 360) / 45) % 8];
/** Els colors de les banderes, en hex: dins de l'iframe no hi ha les variables del web. */
const FLAG_HEX: Record<string, string> = { verda: '#2f9e5b', groga: '#e8b931', vermella: '#c7372f', complet: '#8796ad' };
const STING_HEX: Record<string, string> = {
  inofensiva: '#2f9e5b', lleu: '#e8b931', dolorosa: '#f2994a', perillosa: '#c7372f', desconeguda: '#8796ad',
};

function nowIndex(f: LocationForecast | null): number {
  if (!f?.hourly.length) return -1;
  const h = localNowHour();
  return Math.max(0, f.hourly.findIndex((p) => p.time.slice(0, 13) === h));
}

function header(loc: Location, d: WidgetData, today: DailyPoint | null, o: WidgetOptions): string {
  const now = d.forecast?.hourly[nowIndex(d.forecast)] ?? null;
  const t = d.current?.temperatureAdjusted ?? now?.temperature ?? null;
  const code = now?.weatherCode ?? today?.weatherCode ?? null;
  const sky = codeLabel(weatherCode(code), o.lang);
  return `<a class="hd" href="${esc(o.href)}" rel="noopener">
  ${icon(code, now?.isDay ?? true, 56, sky)}
  <span class="t">${deg(t)}</span>
  <span class="who">
    <span class="name">${esc(placeName(loc.nom, o.lang))}</span>
    <span class="sky">${esc(sky)}</span>
    <span class="mm">${tr(o.lang, 'màx.', 'máx.')} ${deg(today?.tMax)} · ${tr(o.lang, 'mín.', 'mín.')} ${deg(today?.tMin)}</span>
  </span>
</a>`;
}

/** Els avisos oficials, el més alt primer. Sense cap avís no hi ha res. */
function warnings(d: WidgetData, o: WidgetOptions): string {
  const list = d.warnings
    .filter((g) => g.level !== 'verd')
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.onset.localeCompare(b.onset))
    .slice(0, 3);
  if (!list.length) return '';
  return `<ul class="warn">${list.map((g) => {
    const [ca, es] = LEVEL[g.level];
    return `<li class="lv-${g.level}"><b>${tr(o.lang, `Avís ${ca}`, `Aviso ${es}`)} · ${esc(phenomenonName(g.phenomenon, o.lang))}</b><span>${esc(whenLine(g, o.lang))}</span></li>`;
  }).join('')}</ul>`;
}

function tile(label: string, value: string, sub = '', accent = ''): string {
  return `<div class="tile"${accent ? ` style="--accent:${accent}"` : ''}><div class="tl">${esc(label)}</div><div class="tv">${value}</div>${sub ? `<div class="ts">${esc(sub)}</div>` : ''}</div>`;
}

/** Les rajoles: cada peça petita en posa una o unes quantes, i es reparteixen soles. */
function tiles(loc: Location, d: WidgetData, daily: DailyPoint[], o: WidgetOptions): string {
  const has = (p: WidgetPiece) => o.pieces.includes(p);
  const t = (ca: string, es: string) => tr(o.lang, ca, es);
  const out: string[] = [];

  if (has('vent') && d.current?.windSpeed != null) {
    const c = d.current;
    out.push(tile(t('Vent', 'Viento'), `${kmh(c.windSpeed!)} <small>km/h</small>`,
      [c.windDirection != null ? compass(c.windDirection) : '', c.windGust != null ? t(`ratxa ${kmh(c.windGust)}`, `racha ${kmh(c.windGust)}`) : '']
        .filter(Boolean).join(' · ')));
  }
  if (has('sol')) {
    const a = astronomyFor(loc, undefined, o.lang);
    if (a?.sunrise && a.sunset) out.push(tile(t('Sol', 'Sol'), `${clock(a.sunrise)} <small>a</small> ${clock(a.sunset)}`, t('de sortida a posta', 'de salida a puesta')));
  }
  if (has('aire') && d.air?.aqi != null) {
    const band = aqiBand(d.air.aqi);
    out.push(tile(t('Aire', 'Aire'), int(d.air.aqi), aqiLabel(band, o.lang), band.color));
  }
  if (has('mar') && d.sea?.now) {
    const n = d.sea.now;
    out.push(tile(t('Aigua', 'Agua'), deg(n.sst), t('al mar, ara', 'en el mar, ahora')));
    if (n.waveHeight != null) out.push(tile(t('Onatge', 'Oleaje'), `${num(n.waveHeight, 1)} <small>m</small>`, douglas(n.waveHeight, o.lang)));
  }
  if (has('neu') && d.resort) {
    const s = d.resort.resort;
    out.push(tile(s.name, s.open ? t('Oberta', 'Abierta') : t('Tancada', 'Cerrada'),
      s.reportUsable && s.slopesOpenPct != null ? t(`${s.slopesOpenPct} % de pistes`, `${s.slopesOpenPct} % de pistas`) : '',
      s.open ? '#3fa96b' : '#8796ad'));
    if (s.reportUsable && s.snowMaxCm != null) {
      out.push(tile(t('Gruix', 'Espesor'),
        `${s.snowMinCm != null && s.snowMinCm !== s.snowMaxCm ? `${s.snowMinCm}–` : ''}${s.snowMaxCm} <small>cm</small>`,
        t('comunicat de l’estació', 'parte de la estación')));
    } else {
      const iso = d.forecast?.hourly[nowIndex(d.forecast)]?.freezingLevel ?? null;
      if (iso != null) out.push(tile(t('Isozero', 'Isocero'), `${int(Math.round(iso / 50) * 50)} <small>m</small>`, t('ara', 'ahora')));
    }
    const next = daily.slice(0, 3).reduce((a, x) => a + (x.snowfall ?? 0), 0);
    const level = daily.slice(0, 3).map((x) => x.snowLevel).find((v) => v != null) ?? null;
    out.push(tile(t('Neu prevista', 'Nieve prevista'), `${next >= 0.5 ? num(next) : '0'} <small>cm</small>`,
      level != null ? t(`3 dies · cota ${int(level)} m`, `3 días · cota ${int(level)} m`) : t('en 3 dies', 'en 3 días')));
  }
  return out.length ? `<div class="tiles">${out.join('')}</div>` : '';
}

/**
 * Les banderes de les platges del municipi, només les d'ara: la posa el
 * socorrista de servei, i fora d'horari la darrera es queda al registre. Amb
 * meduses, l'espècie que pica més. Sense cap bandera vigent, res.
 */
function flags(d: WidgetData, o: WidgetOptions): string {
  const current = (d.sea?.beaches ?? [])
    .filter((b) => b.ageHours <= FLAG_CURRENT_HOURS && b.flag && b.flag !== 'sense informacio');
  if (!current.length) return '';
  const row = (b: Beach) => {
    const f = flagStyle(b.flag, o.lang);
    const jelly = worstJellyfish(parseJellyfish(b.jellyfish));
    const info = jelly ? speciesInfo(jelly.species, o.lang) : null;
    const sting = info ? STING_STYLE[info.sting] : null;
    const jf = jelly && info && sting
      ? `<span class="jf"><i style="background:${STING_HEX[info.sting]}"></i>${tr(o.lang, 'Meduses', 'Medusas')}: ${esc(info.common || jelly.species)} · ${esc(o.lang === 'es' ? sting.labelEs : sting.label)}</span>`
      : '';
    return `<li><i style="background:${FLAG_HEX[b.flag] ?? '#8796ad'}"></i><span class="bn">${esc(b.name)}</span><b>${esc(f.label)}</b>${jf}</li>`;
  };
  return `<ul class="flags">${current.slice(0, 4).map(row).join('')}</ul>`;
}

function hours(f: LocationForecast, o: WidgetOptions): string {
  const i = nowIndex(f);
  const pts = f.hourly.slice(i + 1, i + 13).filter((_, k) => k % 2 === 0);
  if (!pts.length) return '';
  return `<ol class="hours">${pts.map((p) => `<li>
  <span class="hn">${Number(p.time.slice(11, 13))} h</span>
  ${icon(p.weatherCode, p.isDay, 28, codeLabel(weatherCode(p.weatherCode), o.lang))}
  <span class="ht">${deg(p.temperature)}</span>
  <span class="hp">${(p.precipitation ?? 0) >= 0.2 ? `${num(p.precipitation, 1)} mm` : ''}</span>
</li>`).join('')}</ol>`;
}

/** Fins a cinc dies, en columnes; set, en llista, que en columnes no hi caben. */
function days(daily: DailyPoint[], todayIso: string, n: number, o: WidgetOptions): string {
  if (!n || !daily.length) return '';
  return `<ol class="days${n > 5 ? ' rows' : ''}">${daily.slice(0, n).map((d) => `<li>
  <span class="dn">${esc(relativeDayTiny(d.date, todayIso, o.lang))}</span>
  ${icon(d.weatherCode, true, 30, codeLabel(weatherCode(d.weatherCode), o.lang))}
  <span class="dp">${d.precipProbability >= 20 ? `${d.precipProbability} %` : ''}</span>
  <span class="dx">${deg(d.tMax)}</span><span class="di">${deg(d.tMin)}</span>
</li>`).join('')}</ol>`;
}

/** La marca, amb el símbol del web: si canvia `src/components/Logo.tsx`, aquí també. */
const LOGO = `<svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4AA8FF"/><stop offset="1" stop-color="#1257D6"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#g)"/><circle cx="21.5" cy="11" r="5" fill="#FFD166"/><path d="M2.5 26 L11 14.5 L15.8 20.5 L19.5 16 L29.5 26 Z" fill="#fff"/></svg>`;

const CSS = `
:root{--bg:#0e1e35;--bg2:#17345c;--ink:#f6f8fb;--ink2:#c3cfe0;--line:rgba(255,255,255,.14);--tile:rgba(255,255,255,.07);--cat:#7cc4ff;--wet:#7cc4ff;color-scheme:dark}
:root.clar{--bg:#d7e9fa;--bg2:#9cc7ee;--ink:#0f2440;--ink2:#2f4a6b;--line:rgba(15,36,64,.16);--tile:rgba(255,255,255,.45);--cat:#1257D6;--wet:#1257D6;color-scheme:light}
*{box-sizing:border-box;margin:0;padding:0}
html{background:transparent}
body{font:14px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:linear-gradient(165deg,var(--bg2),var(--bg) 75%);
border-radius:14px;overflow:hidden;padding:12px 14px 10px;display:grid;gap:10px}
:root.clar img{filter:drop-shadow(0 1px 2px rgba(15,36,64,.35))}
a{color:inherit;text-decoration:none}
.hd{display:flex;align-items:center;gap:8px;min-width:0}
.hd img{flex:none;margin:-6px -2px -6px -6px}
.t{font-size:42px;font-weight:300;letter-spacing:-1px;font-variant-numeric:tabular-nums}
.who{display:grid;min-width:0;margin-left:6px;border-left:1px solid var(--line);padding-left:10px}
.who>*{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.name{font-weight:650;font-size:15px}
.sky,.mm{color:var(--ink2);font-size:12.5px}.mm{font-variant-numeric:tabular-nums}
.warn,.flags,.hours,.days{list-style:none}
.warn{display:grid;gap:4px}
.warn li{display:grid;font-size:12.5px;padding:5px 9px;border-radius:8px}
.warn span{opacity:.8;font-size:12px}
.lv-groc{background:#f2c94c;color:#2a2306}.lv-taronja{background:#f2994a;color:#2b1404}.lv-vermell{background:#d9443b;color:#fff}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:5px}
.tile{background:var(--tile);border-radius:9px;padding:6px 8px;min-width:0;border-top:3px solid var(--accent,transparent)}
.tl,.ts{font-size:11.5px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tv{font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.tv small{font-size:12px;font-weight:500;color:var(--ink2)}
.flags{display:grid;gap:3px}
.flags li{display:grid;grid-template-columns:10px 1fr auto;column-gap:7px;align-items:center;font-size:12.5px;background:var(--tile);border-radius:8px;padding:4px 9px}
.flags i{display:inline-block;width:10px;height:10px;border-radius:2px}
.flags .bn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.flags .jf{grid-column:2/4;font-size:11.5px;color:var(--ink2)}
.flags .jf i{width:7px;height:7px;border-radius:50%;margin-right:5px}
.hours{display:grid;grid-template-columns:repeat(6,1fr);gap:2px;font-variant-numeric:tabular-nums}
.hours li{display:grid;justify-items:center}
.hn{font-size:11.5px;color:var(--ink2)}.ht{font-weight:600;font-size:13px}.hp{font-size:10.5px;color:var(--wet);min-height:13px}
.days{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;font-variant-numeric:tabular-nums}
.days li{display:grid;justify-items:center;background:var(--tile);border-radius:9px;padding:5px 2px}
.dn{font-size:12px;color:var(--ink2);text-transform:capitalize}
.dx{font-weight:600}.di{font-size:12px;color:var(--ink2)}
.dp{font-size:11px;color:var(--wet);min-height:13px;order:9}
.days.rows{grid-auto-flow:row;gap:2px}
.days.rows li{grid-template-columns:52px 30px 1fr 40px 40px;justify-items:start;align-items:center;padding:1px 8px;border-radius:7px}
.days.rows .dp{order:0;justify-self:end;padding-right:6px;min-height:0}
.days.rows .dx,.days.rows .di{justify-self:end}
.ft{display:flex;justify-content:flex-end;align-items:center}
.brand{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:800;letter-spacing:-.03em}
.brand b{font-weight:800;color:var(--cat)}
.brand:hover{opacity:.85}
`;

/**
 * L'alçada, a la pàgina que porta el widget. `'*'` perquè el widget no sap on
 * és, i el missatge no porta res que no es vegi a la pantalla. Qui l'escolta
 * compara `e.source` amb el seu `<iframe>`, així que diversos widgets a la
 * mateixa pàgina no es barregen.
 */
const SIZE_SCRIPT = `<script>(function(){function s(){parent.postMessage({tempscat:1,h:Math.ceil(document.body.getBoundingClientRect().height)},'*')}addEventListener('load',s);addEventListener('resize',s);s()})()</script>`;

/** El `title` de l'iframe i de la pàgina de dins. */
export function widgetTitle(loc: Location, lang: Lang): string {
  return tr(lang, `El temps ${aName(loc.nom)}`, `El tiempo ${aName(loc.nom, lang)}`);
}

/** La pàgina sencera que va dins de l'`<iframe>`. */
export function renderWidget(loc: Location, d: WidgetData, o: WidgetOptions): string {
  const todayIso = localToday();
  const daily = d.forecast ? withObservedToday(d.forecast.daily, todayIso, d.current).filter((x) => x.date >= todayIso) : [];
  const today = daily.find((x) => x.date === todayIso) ?? null;
  const allowed = piecesFor(d);
  const opts = { ...o, pieces: o.pieces.filter((p) => allowed.includes(p)) };
  const has = (p: WidgetPiece) => opts.pieces.includes(p);

  const parts = [
    header(loc, d, today, opts),
    has('avisos') ? warnings(d, opts) : '',
    tiles(loc, d, daily, opts),
    has('bandera') ? flags(d, opts) : '',
    has('hores') && d.forecast ? hours(d.forecast, opts) : '',
    days(daily, todayIso, o.days, opts),
  ].filter(Boolean);

  return `<!doctype html>
<html lang="${o.lang}" class="${o.theme === 'clar' ? 'clar' : ''}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(widgetTitle(loc, o.lang))} · TempsCat</title><base target="_blank"><style>${CSS}</style></head>
<body>
${parts.join('\n')}
<div class="ft"><a class="brand" href="${esc(o.href)}" rel="noopener">${LOGO}<span>Temps<b>Cat</b></span></a></div>
${SIZE_SCRIPT}
</body></html>`;
}
