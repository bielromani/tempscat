/**
 * Les estacions que corregeixen el NO₂ de CAMS: quant s'equivoca el model a
 * cada una, els últims 30 dies. El càlcul i el perquè són a
 * `src/lib/air-correction.ts`; aquí només hi ha d'on surten les dades.
 *
 * ## Dues fonts, la mateixa hora
 *
 *  · **Mesurat**: la XVPCA (`tasf-thgu`), en format ample —`h01`…`h24`, i
 *    `hNN` és l'hora que **acaba** a les NN locals—. Porta unes 20 h de retard,
 *    que aquí no importa: es fa servir la mitjana d'un mes.
 *  · **Model**: CAMS via Open-Meteo **a la coordenada exacta de l'estació**,
 *    amb `past_days`. No la cel·la de la fitxa: el que es vol saber és quant
 *    s'equivoca el model on hi ha l'aparell.
 *
 * L'hora `hNN` de la XVPCA es casa amb la `NN−1` de CAMS, que és l'instant de
 * dins de l'hora mesurada.
 */
import { soql } from './socrata.ts';
import { fetchWithRetry } from './http.ts';
import {
  NO2_MIN_COVERAGE, NO2_WINDOW_DAYS, correctNo2, no2Correction, type No2Donor,
} from '../../src/lib/air-correction.ts';

const DATASET = 'tasf-thgu';
const HOST = 'https://air-quality-api.open-meteo.com/v1/air-quality';
/** Dies de CAMS enrere: la finestra més el retard de la XVPCA. */
export const NO2_PAST_DAYS = NO2_WINDOW_DAYS + 2;

interface Row { codi_eoi: string; nom_estacio: string; data: string; tipus_estacio: string; latitud: string; longitud: string; [h: string]: string }

interface Station { code: string; name: string; type: string; lat: number; lon: number; obs: Map<string, number> }

export interface No2Check {
  /** Estacions de fons amb almenys una altra a l'abast, estimades deixant-les fora. */
  stations: number;
  hours: number;
  rmseCams: number;
  rmseCorrected: number;
  better: number;
  worse: number;
}

export interface No2Result {
  donors: No2Donor[];
  check: No2Check;
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Les estacions de la XVPCA amb NO₂, i les seves lectures horàries de la finestra. */
async function measured(): Promise<Station[]> {
  const from = new Date(Date.now() - NO2_PAST_DAYS * 864e5).toISOString().slice(0, 10);
  const rows = await soql<Row>(DATASET, {
    where: `data >= '${from}' AND contaminant = 'NO2'`,
    order: 'data,codi_eoi',
    limit: 50_000,
  });
  const byCode = new Map<string, Station>();
  for (const r of rows) {
    const lat = Number(r.latitud);
    const lon = Number(r.longitud);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    let s = byCode.get(r.codi_eoi);
    if (!s) {
      s = { code: r.codi_eoi, name: r.nom_estacio, type: r.tipus_estacio, lat, lon, obs: new Map() };
      byCode.set(r.codi_eoi, s);
    }
    const day = r.data.slice(0, 10);
    for (let h = 1; h <= 24; h++) {
      // Socrata no escriu els camps buits: l'absència és «no hi és», no un zero.
      const v = r[`h${pad(h)}`];
      if (v == null || v === '') continue;
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) s.obs.set(`${day}T${pad(h - 1)}:00`, n);
    }
  }
  return [...byCode.values()];
}

/** CAMS a la coordenada de cada estació, en lots. Torna hora local → valor. */
async function modelled(stations: Station[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  for (let i = 0; i < stations.length; i += 50) {
    const chunk = stations.slice(i, i + 50);
    const params = new URLSearchParams({
      latitude: chunk.map((s) => s.lat.toFixed(4)).join(','),
      longitude: chunk.map((s) => s.lon.toFixed(4)).join(','),
      hourly: 'nitrogen_dioxide',
      past_days: String(NO2_PAST_DAYS),
      forecast_days: '1',
      timezone: 'Europe/Madrid',
    });
    const res = await fetchWithRetry(`${HOST}?${params}`, { retries: 3, backoffMs: 5_000, timeoutMs: 90_000 });
    const text = (await res.text()).replace(/:\s*-?nan\b/gi, ':null');
    const list = [].concat(JSON.parse(text)) as Array<{ hourly?: { time: string[]; nitrogen_dioxide: Array<number | null> } }>;
    list.forEach((r, k) => {
      const s = chunk[k];
      if (!s || !r.hourly) return;
      const m = new Map<string, number>();
      r.hourly.time.forEach((t, j) => {
        const v = r.hourly!.nitrogen_dioxide[j];
        if (v != null) m.set(t, v);
      });
      out.set(s.code, m);
    });
  }
  return out;
}

/**
 * Les estacions donants i la comprovació de la finestra.
 *
 * La comprovació deixa cada estació de fons fora, l'estima amb les altres i la
 * compara amb el que va mesurar, hora a hora. És la mateixa que va decidir el
 * mètode, i es torna a fer a cada volta: si un dia la correcció deixés de
 * millorar CAMS, es veuria aquí abans que a cap fitxa.
 *
 * Deixa fora l'estació però no el temps: el biaix de les veïnes i l'error es
 * mesuren sobre els mateixos 30 dies. La prova que ho separa —el biaix dels 30
 * dies anteriors aplicat al dia següent— va donar 14,8 → 10,7 µg/m³ sobre 92
 * dies, i és la que es va fer servir per decidir.
 */
export async function no2Donors(): Promise<No2Result & { requested: number }> {
  const stations = await measured();
  const model = await modelled(stations);

  type Pair = { t: string; o: number; m: number };
  const pairs = new Map<string, Pair[]>();
  let from = '9999';
  let to = '';
  for (const s of stations) {
    const m = model.get(s.code);
    if (!m) continue;
    const list: Pair[] = [];
    for (const [t, o] of s.obs) {
      const v = m.get(t);
      if (v == null) continue;
      list.push({ t, o, m: v });
      if (t < from) from = t;
      if (t > to) to = t;
    }
    pairs.set(s.code, list);
  }

  // La finestra són els últims 30 dies amb dada, comptats des de la lectura més nova.
  const cut = new Date(new Date(`${to.slice(0, 10)}T00:00:00Z`).getTime() - (NO2_WINDOW_DAYS - 1) * 864e5)
    .toISOString().slice(0, 10);
  const minHours = Math.round(NO2_WINDOW_DAYS * 24 * NO2_MIN_COVERAGE);

  const donors: No2Donor[] = [];
  for (const s of stations) {
    // Una estació de trànsit mesura el carrer; la fitxa parla del poble.
    if (s.type === 'traffic') continue;
    const list = (pairs.get(s.code) ?? []).filter((p) => p.t >= cut);
    if (list.length < minHours) continue;
    const logRatio = list.reduce((a, p) => a + Math.log((p.o + 1) / (p.m + 1)), 0) / list.length;
    donors.push({
      code: s.code, name: s.name, lat: s.lat, lon: s.lon,
      logRatio: Math.round(logRatio * 1000) / 1000, hours: list.length,
    });
  }

  // ── Comprovació, deixant-ne una fora ──────────────────────────────────────
  let sc = 0;
  let sk = 0;
  let n = 0;
  let checked = 0;
  let better = 0;
  let worse = 0;
  for (const d of donors) {
    const s = stations.find((x) => x.code === d.code)!;
    if (s.type !== 'background') continue;
    const corr = no2Correction(d.lat, d.lon, donors.filter((x) => x.code !== d.code));
    if (!corr) continue;
    let ec = 0;
    let ek = 0;
    let k = 0;
    for (const p of pairs.get(d.code) ?? []) {
      if (p.t < cut) continue;
      ec += (p.m - p.o) ** 2;
      ek += (correctNo2(p.m, corr.logRatio) - p.o) ** 2;
      k++;
    }
    if (!k) continue;
    checked++;
    sc += ec;
    sk += ek;
    n += k;
    if (ek < ec * 0.96) better++;
    else if (ek > ec * 1.04) worse++;
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    donors,
    check: {
      stations: checked, hours: n,
      rmseCams: n ? r2(Math.sqrt(sc / n)) : 0,
      rmseCorrected: n ? r2(Math.sqrt(sk / n)) : 0,
      better, worse,
    },
    from: cut,
    to: to.slice(0, 10),
    requested: stations.length,
  };
}
