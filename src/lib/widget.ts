import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
 * ## Es munta per peces, i en tres formats
 *
 * Qui el posa tria el format (`format=mini|targeta|apaisat`), què hi surt
 * (`mostra=`), quants dies (`dies=`), el color (`tema=`) i si porta icones
 * (`icones=0`). La capçalera —el lloc, la temperatura d'ara i el cel— hi és
 * sempre. Les peces que depenen del lloc només es poden triar on tenen sentit:
 * el mar on hi ha platja al registre, la muntanya a partir de 600 m o a prop
 * d'una estació d'esquí, i l'estació d'esquí a 30 km. `piecesFor()` diu quines.
 *
 * ## Les peces que no sempre hi són
 *
 * Els avisos i les banderes de platja **no ocupen lloc quan no n'hi ha**: un
 * requadre que diu «sense avisos» tot l'any és soroll. Per això l'alçada no és
 * fixa i el widget l'anuncia a la pàgina que el porta amb un `postMessage`: és
 * l'únic script que hi ha. El codi que es copia porta les línies que
 * l'escolten; sense elles, l'`<iframe>` es queda amb l'alçada que es va mesurar
 * al configurador.
 *
 * ## El mode de prova
 *
 * `prova=1` hi posa dos avisos, banderes amb meduses i un comunicat de neu
 * inventats, perquè al configurador es pugui veure com queda el dia que n'hi
 * ha. El codi que es copia no el porta mai, i el widget ho diu amb una franja
 * («Exemple») que no es pot treure: un avís inventat en una web d'un altre, sense
 * dir-ho, seria l'error més greu que podria fer aquesta peça.
 *
 * ## Per què HTML escrit a mà i no un component de React
 *
 * Perquè es carrega dins de la web d'un altre, i hi ha d'anar el que s'ensenya i
 * prou: uns 6 kB més les icones, incrustades —vegeu `iconUri()`—, en comptes del runtime de
 * React i la càrrega RSC.
 *
 * ## Per què no diu d'on surt cada dada
 *
 * Ho va demanar l'usuari, i té una raó: no és la dada de la font tal com ve —la
 * temperatura és el model corregit amb les estacions, la màxima barreja
 * predicció i mesura— i la fitxa, on porta tot el widget, ho explica. La CC BY
 * 4.0 de les fonts admet donar el crèdit amb un enllaç a on es dona.
 */

export const WIDGET_FORMATS = ['mini', 'targeta', 'apaisat'] as const;
export type WidgetFormat = (typeof WIDGET_FORMATS)[number];
export const WIDGET_PIECES = [
  'avisos', 'hores', 'pluja', 'vent', 'humitat', 'uv', 'sol', 'aire', 'mar', 'bandera', 'muntanya', 'neu',
] as const;
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

/** A partir d'aquí la isozero i la cota de neu diuen alguna cosa del lloc. */
const MOUNTAIN_FROM_M = 600;

/** Les peces que aquest lloc pot portar. */
export function piecesFor(loc: Location, d: WidgetData): WidgetPiece[] {
  return WIDGET_PIECES.filter((p) => {
    if (p === 'mar') return Boolean(d.sea?.now);
    if (p === 'bandera') return Boolean(d.sea?.beaches.length);
    if (p === 'neu') return Boolean(d.resort);
    if (p === 'muntanya') return (loc.altitud ?? 0) >= MOUNTAIN_FROM_M || Boolean(d.resort);
    if (p === 'aire') return d.air?.aqi != null;
    return true;
  });
}

// ── El mode de prova ───────────────────────────────────────────────────────────

/** Les dades d'aquell lloc amb avisos, banderes i neu inventats. Vegeu «El mode de prova». */
export function withDemo(d: WidgetData): WidgetData {
  const h = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();
  const group = (key: string, level: WarningGroup['level'], phenomenon: string, a: number, b: number): WarningGroup => ({
    key, level, phenomenon, param: '', zones: [], onset: h(a), expires: h(b),
    spans: [{ id: key, onset: h(a), expires: h(b) }], web: '',
    official: { event: '', descriptions: [], instructions: [] },
  });
  const flags = ['verda', 'groga', 'vermella'];
  const jelly = ['', 'Pelagia noctiluca,poques,0-5', 'Rhizostoma pulmo,moltes,10-20'];
  return {
    ...d,
    warnings: [group('demo-pr', 'taronja', 'PR', 2, 11), group('demo-vi', 'groc', 'VI', 0, 20)],
    sea: d.sea && {
      ...d.sea,
      beaches: d.sea.beaches.slice(0, 3).map((b, i) => ({ ...b, ageHours: 1, flag: flags[i], jellyfish: jelly[i] || null })),
    },
    resort: d.resort && {
      ...d.resort,
      resort: {
        ...d.resort.resort, open: true, reportUsable: true,
        snowMinCm: 40, snowMaxCm: 95, slopesOpenPct: 85, liftsOpenPct: 80,
      },
    },
  };
}

// ── Les peces ──────────────────────────────────────────────────────────────────

export interface WidgetOptions {
  format: WidgetFormat;
  pieces: WidgetPiece[];
  days: number;
  theme: WidgetTheme;
  icons: boolean;
  demo: boolean;
  lang: Lang;
  /** L'adreça de la fitxa, absoluta: els enllaços surten de l'iframe cap a la web. */
  href: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const deg = (v: number | null | undefined) => (v == null ? '—' : `${num(v)}°`);
const kmh = (ms: number) => num(ms * 3.6);
const clock = (d: Date | null) => (d == null ? '—' : d.toLocaleTimeString('ca-ES', {
  timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit',
}));

const LEVEL: Record<string, [string, string]> = {
  groc: ['groc', 'amarillo'], taronja: ['taronja', 'naranja'], vermell: ['vermell', 'rojo'],
};
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const compass = (d: number) => COMPASS[Math.round((((d % 360) + 360) % 360) / 45) % 8];
/** Els colors, en hex: dins de l'iframe no hi ha les variables del web. */
const FLAG_HEX: Record<string, string> = { verda: '#2f9e5b', groga: '#e8b931', vermella: '#d23c32', complet: '#8796ad' };
const STING_HEX: Record<string, string> = {
  inofensiva: '#2f9e5b', lleu: '#e8b931', dolorosa: '#f2994a', perillosa: '#d23c32', desconeguda: '#8796ad',
};
const UV: Array<[number, string, string, string]> = [
  [3, 'baix', 'bajo', '#3fa96b'], [6, 'moderat', 'moderado', '#e8b931'], [8, 'alt', 'alto', '#f2994a'],
  [11, 'molt alt', 'muy alto', '#d23c32'], [Infinity, 'extrem', 'extremo', '#8e4bb8'],
];

/** Una bandera dibuixada, del color que toca. */
const flagIcon = (color: string, size = 18) =>
  `<svg class="flag" viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true"><path d="M3.2 1.5v13.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M4 2.2h9.2l-2.2 3.1 2.2 3.1H4z" fill="${color}"/></svg>`;

function nowIndex(f: LocationForecast | null): number {
  if (!f?.hourly.length) return -1;
  const h = localNowHour();
  return Math.max(0, f.hourly.findIndex((p) => p.time.slice(0, 13) === h));
}

interface Ctx {
  loc: Location;
  d: WidgetData;
  o: WidgetOptions;
  daily: DailyPoint[];
  today: DailyPoint | null;
  todayIso: string;
  t: (ca: string, es: string) => string;
  img: (name: string, size: number, alt?: string) => string;
  sky: (code: number | null | undefined, isDay: boolean, size: number) => string;
}

function header(c: Ctx): string {
  const { d, o, today } = c;
  const now = d.forecast?.hourly[nowIndex(d.forecast)] ?? null;
  const t = d.current?.temperatureAdjusted ?? now?.temperature ?? null;
  const code = now?.weatherCode ?? today?.weatherCode ?? null;
  const sky = codeLabel(weatherCode(code), o.lang);
  const mini = o.format === 'mini';
  return `<a class="hd" href="${esc(o.href)}" rel="noopener">
  ${c.sky(code, now?.isDay ?? true, mini ? 40 : 60)}
  <span class="t">${deg(t)}</span>
  <span class="who">
    <span class="name">${esc(placeName(c.loc.nom, o.lang))}</span>
    <span class="sky">${esc(sky)}</span>
    ${mini ? '' : `<span class="mm">${c.t('màx.', 'máx.')} <b>${deg(today?.tMax)}</b> · ${c.t('mín.', 'mín.')} <b>${deg(today?.tMin)}</b></span>`}
  </span>
</a>`;
}

/** Els avisos oficials, el més alt primer. Sense cap avís no hi ha res. */
function warnings(c: Ctx): string {
  const list = c.d.warnings
    .filter((g) => g.level !== 'verd')
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.onset.localeCompare(b.onset));
  if (!list.length) return '';
  if (c.o.format === 'mini') {
    const [ca, es] = LEVEL[list[0].level];
    return `<div class="warn-mini lv-${list[0].level}">${c.t(`Avís ${ca}`, `Aviso ${es}`)} · ${esc(phenomenonName(list[0].phenomenon, c.o.lang))}${list.length > 1 ? ` +${list.length - 1}` : ''}</div>`;
  }
  return `<ul class="warn">${list.slice(0, 3).map((g) => {
    const [ca, es] = LEVEL[g.level];
    return `<li class="lv-${g.level}"><span><b>${c.t(`Avís ${ca}`, `Aviso ${es}`)} · ${esc(phenomenonName(g.phenomenon, c.o.lang))}</b><small>${esc(whenLine(g, c.o.lang))}</small></span></li>`;
  }).join('')}</ul>`;
}

/** Un bloc: icona, etiqueta, xifra i una línia. El text es parteix; no es talla. */
function block(c: Ctx, icon: string, label: string, value: string, sub = '', accent = ''): string {
  return `<div class="blk"${accent ? ` style="--accent:${accent}"` : ''}>${c.o.icons && icon ? (icon.startsWith('<') ? icon : c.img(icon, 30)) : ''}<div><div class="bl">${esc(label)}</div><div class="bv">${value}</div>${sub ? `<div class="bs">${sub}</div>` : ''}</div></div>`;
}

function blocks(c: Ctx): string {
  const { d, o, t, today, daily } = c;
  const has = (p: WidgetPiece) => o.pieces.includes(p);
  const out: string[] = [];
  const cur = d.current;

  if (has('pluja') && today) {
    out.push(block(c, 'raindrops', t('Pluja avui', 'Lluvia hoy'), `${today.precipProbability} <small>%</small>`,
      today.precipitation >= 0.1 ? `${num(today.precipitation, 1)} mm` : t('sense pluja prevista', 'sin lluvia prevista')));
  }
  if (has('vent') && cur?.windSpeed != null) {
    out.push(block(c, 'wind', t('Vent', 'Viento'),
      `${kmh(cur.windSpeed)} <small>km/h</small>${cur.windDirection != null ? ` <small>${compass(cur.windDirection)}</small>` : ''}`,
      cur.windGust != null ? t(`ratxa ${kmh(cur.windGust)} km/h`, `racha ${kmh(cur.windGust)} km/h`) : ''));
  }
  if (has('humitat') && cur?.humidity != null) {
    out.push(block(c, 'humidity', t('Humitat', 'Humedad'), `${int(cur.humidity)} <small>%</small>`));
  }
  if (has('uv') && today?.uvMax != null) {
    const [, ca, es, color] = UV.find(([max]) => today.uvMax! < max)!;
    out.push(block(c, 'uv-index', t('Índex UV', 'Índice UV'), `${num(today.uvMax)}`, t(`${ca}, màxim d’avui`, `${es}, máximo de hoy`), color));
  }
  if (has('sol')) {
    const a = astronomyFor(c.loc, undefined, o.lang);
    if (a?.sunrise && a.sunset) {
      out.push(`<div class="blk sun">${o.icons ? c.img('sunrise', 30) : ''}<div><div class="bl">${t('Surt', 'Sale')}</div><div class="bv">${clock(a.sunrise)}</div></div>${o.icons ? c.img('sunset', 30) : ''}<div><div class="bl">${t('Es pon', 'Se pone')}</div><div class="bv">${clock(a.sunset)}</div></div></div>`);
    }
  }
  if (has('aire') && d.air?.aqi != null) {
    const band = aqiBand(d.air.aqi);
    out.push(block(c, 'haze', t('Qualitat de l’aire', 'Calidad del aire'), int(d.air.aqi),
      `<span class="pill" style="background:${band.color};color:${band.ink}">${esc(aqiLabel(band, o.lang))}</span>`));
  }
  if (has('mar') && d.sea?.now) {
    const n = d.sea.now;
    out.push(block(c, 'thermometer', t('Aigua del mar', 'Agua del mar'), deg(n.sst)));
    if (n.waveHeight != null) {
      out.push(block(c, 'tide-high', t('Onatge', 'Oleaje'), `${num(n.waveHeight, 1)} <small>m</small>`, esc(douglas(n.waveHeight, o.lang))));
    }
  }
  if (has('muntanya')) {
    const iso = d.forecast?.hourly[nowIndex(d.forecast)]?.freezingLevel ?? null;
    const level = daily.slice(0, 3).map((x) => x.snowLevel).find((v) => v != null) ?? null;
    const next = daily.slice(0, 3).reduce((a, x) => a + (x.snowfall ?? 0), 0);
    if (iso != null) out.push(block(c, 'thermometer', t('Isozero', 'Isocero'), `${int(Math.round(iso / 50) * 50)} <small>m</small>`, t('on fa 0 °C', 'donde hace 0 °C')));
    out.push(block(c, 'snow', t('Neu prevista', 'Nieve prevista'), `${next >= 0.5 ? num(next) : '0'} <small>cm</small>`,
      level != null ? t(`3 dies · cota ${int(level)} m`, `3 días · cota ${int(level)} m`) : t('en 3 dies', 'en 3 días')));
  }
  if (has('neu') && d.resort) {
    const s = d.resort.resort;
    out.push(block(c, 'snow', s.name, s.open ? t('Oberta', 'Abierta') : t('Tancada', 'Cerrada'),
      s.reportUsable && s.slopesOpenPct != null ? t(`${s.slopesOpenPct} % de pistes`, `${s.slopesOpenPct} % de pistas`) : '',
      s.open ? '#3fa96b' : '#8796ad'));
    if (s.reportUsable && s.snowMaxCm != null) {
      out.push(block(c, 'extreme-snow', t('Gruix de neu', 'Espesor de nieve'),
        `${s.snowMinCm != null && s.snowMinCm !== s.snowMaxCm ? `${s.snowMinCm}–` : ''}${s.snowMaxCm} <small>cm</small>`,
        t('comunicat de l’estació', 'parte de la estación')));
    }
  }
  if (!out.length) return '';
  // En dues columnes, un bloc sol a l'última fila deixa un forat: s'estira. El del sol ja n'ocupa dues.
  const cells = out.reduce((n, b) => n + (b.startsWith('<div class="blk sun"') ? 2 : 1), 0);
  if (cells % 2 === 1) out[out.length - 1] = out[out.length - 1].replace('class="blk', 'class="blk wide');
  return `<div class="blocks">${out.join('')}</div>`;
}

/**
 * Les banderes de les platges del municipi, només les d'ara: la posa el
 * socorrista de servei. Amb meduses, l'espècie que pica més. Sense cap
 * bandera vigent, res.
 */
function flags(c: Ctx): string {
  const current = (c.d.sea?.beaches ?? [])
    .filter((b) => b.ageHours <= FLAG_CURRENT_HOURS && b.flag && b.flag !== 'sense informacio');
  if (!current.length) return '';
  const row = (b: Beach) => {
    const f = flagStyle(b.flag, c.o.lang);
    const color = FLAG_HEX[b.flag] ?? '#8796ad';
    const jelly = worstJellyfish(parseJellyfish(b.jellyfish));
    const info = jelly ? speciesInfo(jelly.species, c.o.lang) : null;
    const sting = info ? STING_STYLE[info.sting] : null;
    const jf = jelly && info && sting
      ? `<span class="jf"><i style="background:${STING_HEX[info.sting]}"></i>${c.t('Meduses', 'Medusas')}: ${esc(info.common || jelly.species)} · ${esc(c.o.lang === 'es' ? sting.labelEs : sting.label)}</span>`
      : '';
    return `<li>${flagIcon(color)}<span class="bn">${esc(b.name)}</span><b style="color:${color}">${esc(f.label)}</b>${jf}</li>`;
  };
  return `<ul class="flags">${current.slice(0, 4).map(row).join('')}</ul>`;
}

function hours(c: Ctx): string {
  const f = c.d.forecast;
  if (!f) return '';
  const i = nowIndex(f);
  const pts = f.hourly.slice(i + 1, i + 13).filter((_, k) => k % 2 === 0);
  if (!pts.length) return '';
  return `<ol class="hours">${pts.map((p) => `<li>
  <span class="hn">${Number(p.time.slice(11, 13))} h</span>
  ${c.sky(p.weatherCode, p.isDay, 30)}
  <span class="ht">${deg(p.temperature)}</span>
  <span class="hp">${(p.precipitation ?? 0) >= 0.2 ? `${num(p.precipitation, 1)} mm` : ''}</span>
</li>`).join('')}</ol>`;
}

function days(c: Ctx): string {
  const n = c.o.days;
  if (!n || !c.daily.length) return '';
  const rows = c.o.format === 'targeta' && n > 5;
  return `<ol class="days${rows ? ' rows' : ''}">${c.daily.slice(0, n).map((d) => `<li>
  <span class="dn">${esc(relativeDayTiny(d.date, c.todayIso, c.o.lang))}</span>
  ${c.sky(d.weatherCode, true, rows ? 28 : 34)}
  <span class="dp">${d.precipProbability >= 20 ? `${d.precipProbability} %` : ''}</span>
  <span class="dx">${deg(d.tMax)}</span><span class="di">${deg(d.tMin)}</span>
</li>`).join('')}</ol>`;
}

const CSS = `
:root{--bg:#0e1e35;--bg2:#1a3b66;--ink:#f6f8fb;--ink2:#c3cfe0;--line:rgba(255,255,255,.14);--tile:rgba(255,255,255,.08);--cat:#7cc4ff;--wet:#7cc4ff;color-scheme:dark}
:root.clar{--bg:#d7e9fa;--bg2:#9cc7ee;--ink:#0f2440;--ink2:#2f4a6b;--line:rgba(15,36,64,.16);--tile:rgba(255,255,255,.5);--cat:#1257D6;--wet:#1257D6;color-scheme:light}
*{box-sizing:border-box;margin:0;padding:0}
html{background:transparent}
body{font:14px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:linear-gradient(160deg,var(--bg2),var(--bg) 78%);
border-radius:16px;overflow:hidden;padding:14px 16px 11px;display:grid;gap:12px;position:relative}
:root.clar img{filter:drop-shadow(0 1px 2px rgba(15,36,64,.3))}
a{color:inherit;text-decoration:none}
ul,ol{list-style:none}
small{font-size:.72em;font-weight:500;color:var(--ink2)}
.demo{background:#ffd166;color:#3a2a00;font:700 10px/1 system-ui,sans-serif;letter-spacing:.05em;text-transform:uppercase;padding:4px 7px;border-radius:5px}

.hd{display:flex;align-items:center;gap:10px;min-width:0}
.hd img{flex:none;margin:-8px -4px -8px -8px}
.t{font-size:46px;font-weight:300;letter-spacing:-1.5px;line-height:1;font-variant-numeric:tabular-nums}
.who{display:grid;gap:1px;min-width:0;padding-left:12px;border-left:1px solid var(--line)}
.name{font-weight:700;font-size:16px;line-height:1.15}
.sky,.mm{color:var(--ink2);font-size:13px}.mm{font-variant-numeric:tabular-nums}.mm b{color:var(--ink);font-weight:600}

.warn{display:grid;gap:6px}
.warn li{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:10px;font-size:13px}
.warn li img{flex:none;margin:-4px 0;filter:none}
.warn li span{display:grid}
.warn small{font-size:12px;color:inherit;opacity:.85}
.lv-groc{background:#f2c94c;color:#2a2306}.lv-taronja{background:#f2994a;color:#2b1404}.lv-vermell{background:#d9443b;color:#fff}

.blocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:7px}
.blk{display:flex;align-items:center;gap:8px;background:var(--tile);border-radius:12px;padding:9px 11px;box-shadow:inset 0 3px 0 var(--accent,transparent)}
.blk img{flex:none;margin:-4px -2px}
.blk.sun{grid-column:span 2;gap:6px}
.f-targeta .blk.wide{grid-column:1/-1}
.blk.sun>div{flex:1}
.bl{font-size:12px;color:var(--ink2)}
.bv{font-size:20px;font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums}
.bs{font-size:12px;color:var(--ink2);margin-top:1px}
.pill{display:inline-block;margin-top:2px;padding:1px 8px;border-radius:999px;font-size:11.5px;font-weight:600}

.flags{display:grid;gap:5px}
.flags li{display:grid;grid-template-columns:18px 1fr auto;column-gap:8px;align-items:center;font-size:13px;background:var(--tile);border-radius:10px;padding:6px 10px}
.flags .flag{color:var(--ink2)}
.flags b{font-weight:700}
.flags .jf{grid-column:2/4;font-size:12px;color:var(--ink2);display:flex;align-items:center;gap:5px}
.flags .jf i{width:8px;height:8px;border-radius:50%;flex:none}

.hours{display:grid;grid-template-columns:repeat(6,1fr);gap:2px;font-variant-numeric:tabular-nums;text-align:center}
.hours li{display:grid;justify-items:center;gap:1px}
.hn{font-size:12px;color:var(--ink2)}.ht{font-weight:600}.hp{font-size:11px;color:var(--wet);min-height:13px}

.days{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:5px;font-variant-numeric:tabular-nums}
.days li{display:grid;justify-items:center;gap:1px;background:var(--tile);border-radius:12px;padding:7px 2px}
.dn{font-size:12px;color:var(--ink2);text-transform:capitalize}
.dx{font-weight:700}.di{font-size:12.5px;color:var(--ink2)}
.dp{font-size:11px;color:var(--wet);min-height:13px;order:9}
.days.rows{grid-auto-flow:row;gap:3px}
.days.rows li{grid-template-columns:56px 32px 1fr 42px 42px;justify-items:start;align-items:center;padding:3px 10px;border-radius:9px}
.days.rows .dp{order:0;justify-self:end;padding-right:8px;min-height:0}
.days.rows .dx,.days.rows .di{justify-self:end}

.ft{display:flex;justify-content:space-between;align-items:center;gap:8px}
.ft .brand{margin-left:auto}
.brand{font-size:14px;font-weight:800;letter-spacing:-.02em}
.brand b{font-weight:800;color:var(--cat)}
.brand:hover{opacity:.85}

/* Sense icones: el text fa la feina, i res no queda coix. */
.noicons .who{border-left:0;padding-left:0}
.noicons .days li{padding:8px 2px}

/* Mini: només la temperatura d'ara, en una línia. */
.f-mini{padding:8px 12px;gap:6px}
.f-mini .hd{gap:6px}
.f-mini .t{font-size:30px;letter-spacing:-1px}
.f-mini .who{padding-left:8px}
.f-mini .name{font-size:13.5px}.f-mini .sky{font-size:12px}
.f-mini .ft{margin-top:-2px}
.f-mini .brand{font-size:11px;opacity:.85}
.f-mini .demo{font-size:9px;padding:3px 5px}
.warn-mini{font-size:11.5px;font-weight:600;padding:3px 8px;border-radius:7px;justify-self:start}

/* Apaisat: el lloc a l'esquerra i els dies a la dreta, i la resta a sota. */
.f-apaisat .top{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.f-apaisat .top .hd{flex:none}
.f-apaisat .top .days{flex:1 1 300px}
.f-apaisat .blocks{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.f-apaisat .flags{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.f-apaisat .hours{grid-template-columns:repeat(6,1fr)}
`;

/**
 * L'alçada, a la pàgina que porta el widget. `'*'` perquè el widget no sap on
 * és, i el missatge no porta res que no es vegi a la pantalla. Qui l'escolta
 * compara `e.source` amb el seu `<iframe>`.
 */
const SIZE_SCRIPT = `<script>(function(){function s(){parent.postMessage({tempscat:1,h:Math.ceil(document.body.getBoundingClientRect().height)},'*')}addEventListener('load',s);addEventListener('resize',s);s()})()</script>`;

/**
 * Les icones van **dins** de l'HTML, i no com a `/icons/w/<nom>.svg`.
 *
 * Una web amb el widget fa una petició al CDN per cada visita, i cada `<img>`
 * en seria una altra: amb set dies, sis hores i els blocs, una visita en feia
 * vint. El pla de Vercel es paga per peticions al CDN —vegeu «Les peticions al
 * CDN» a `AGENTS.md`—, així que un widget amb èxit hauria multiplicat per vint
 * el que costa. Incrustades, una visita és **una** petició, i la memòria cau de
 * cinc minuts la contesta sencera. Pesen 1–4 kB cadascuna i les repeticions les
 * aplana el gzip.
 *
 * Es llegeixen de `public/` en temps d'execució: `outputFileTracingIncludes` de
 * `next.config.ts` les fa viatjar amb la funció.
 */
const ICONS = new Map<string, string>();
function iconUri(name: string): string {
  let uri = ICONS.get(name);
  if (!uri) {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Icona amb un nom estrany: ${name}`);
    const svg = readFileSync(join(process.cwd(), 'public', 'icons', 'w', `${name}.svg`), 'utf8');
    uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    ICONS.set(name, uri);
  }
  return uri;
}

/** El `title` de l'iframe i de la pàgina de dins. */
export function widgetTitle(loc: Location, lang: Lang): string {
  return tr(lang, `El temps ${aName(loc.nom)}`, `El tiempo ${aName(loc.nom, lang)}`);
}

/** La pàgina sencera que va dins de l'`<iframe>`. */
export function renderWidget(loc: Location, raw: WidgetData, o: WidgetOptions): string {
  const d = o.demo ? withDemo(raw) : raw;
  const todayIso = localToday();
  const daily = d.forecast ? withObservedToday(d.forecast.daily, todayIso, d.current).filter((x) => x.date >= todayIso) : [];
  const allowed = piecesFor(loc, d);
  const opts: WidgetOptions = {
    ...o,
    pieces: o.format === 'mini' ? o.pieces.filter((p) => p === 'avisos') : o.pieces.filter((p) => allowed.includes(p)),
    days: o.format === 'mini' ? 0 : o.days,
  };
  const c: Ctx = {
    loc, d, o: opts, daily, todayIso,
    today: daily.find((x) => x.date === todayIso) ?? null,
    t: (ca, es) => tr(o.lang, ca, es),
    img: (name, size, alt = '') => `<img src="${iconUri(name)}" width="${size}" height="${size}" alt="${esc(alt)}">`,
    sky: (code, isDay, size) => (opts.icons
      ? `<img src="${iconUri(weatherIconName(code, isDay))}" width="${size}" height="${size}" alt="${esc(codeLabel(weatherCode(code), o.lang))}">`
      : ''),
  };
  const has = (p: WidgetPiece) => opts.pieces.includes(p);

  const head = header(c);
  const dayList = days(c);
  const parts = [
    opts.format === 'apaisat' ? `<div class="top">${head}${dayList}</div>` : head,
    has('avisos') ? warnings(c) : '',
    blocks(c),
    has('bandera') ? flags(c) : '',
    has('hores') ? hours(c) : '',
    opts.format === 'apaisat' ? '' : dayList,
  ].filter(Boolean);

  const cls = [`f-${opts.format}`, opts.icons ? '' : 'noicons'].filter(Boolean).join(' ');
  return `<!doctype html>
<html lang="${o.lang}" class="${o.theme === 'clar' ? 'clar' : ''}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(widgetTitle(loc, o.lang))} · TempsCat</title><base target="_blank"><style>${CSS}</style></head>
<body class="${cls}">
${parts.join('\n')}
<div class="ft">${o.demo ? `<span class="demo">${o.format === 'mini' ? tr(o.lang, 'Exemple', 'Ejemplo') : tr(o.lang, 'Exemple · dades de prova', 'Ejemplo · datos de prueba')}</span>` : ''}<a class="brand" href="${esc(o.href)}" rel="noopener">Temps<b>Cat</b></a></div>
${SIZE_SCRIPT}
</body></html>`;
}
