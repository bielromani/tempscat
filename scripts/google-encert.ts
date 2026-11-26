/**
 * Com va Google contra la fitxa, yr.no i OpenWeather: llegeix el registre del
 * cubell privat que deixa `worker:google` i l'escriu aquí, en local.
 *
 * No es publica enlloc ni surt al registre d'Actions: les condicions de Google
 * no deixen refer cap producte seu amb les seves dades, i el que es vol és
 * saber, nosaltres, en quina posició quedem. Necessita les `PUSH_R2_*` a
 * `.env.local`.
 */
import { getJson, pushStoreConfig } from '../src/lib/push-store.ts';
import type { GoogleScores, Source, Var } from './workers/google-verify.ts';

const NAMES: Record<Source, string> = {
  google: 'Google', tempscat: 'tempscat (fitxa)', yrno: 'yr.no', openweather: 'OpenWeather',
};
const LABEL: Record<Var, string> = {
  tMax: 'Màxima del dia',
  tMinNit: 'Mínima de 07 a 07 h (la de la nit següent)',
};

const store = pushStoreConfig();
if (!store) throw new Error('falten les PUSH_R2_* a .env.local');
const s = await getJson<GoogleScores>(store, 'privat/google/encert.json');
if (!s?.scored.length) {
  console.log('Encara no hi ha cap dia puntuat.');
} else {
  console.log(`${s.scored.length} dies, del ${s.scored[0]} al ${s.scored.at(-1)}\n`);
  for (const v of Object.keys(LABEL) as Var[]) {
    const by = s.vars[v];
    if (!by) continue;
    console.log(`${LABEL[v]} · ${s.pairs[v] ?? 0} comparacions estació-dia`);
    const rows = (Object.entries(by) as Array<[Source, { n: number; sumError: number; sumAbs: number }]>)
      .map(([k, t]) => ({ k, mae: t.sumAbs / t.n, bias: t.sumError / t.n }))
      .sort((a, b) => a.mae - b.mae);
    rows.forEach((r, i) => console.log(
      `  ${i + 1}. ${NAMES[r.k].padEnd(18)} error ${r.mae.toFixed(2)} °C · biaix ${r.bias >= 0 ? '+' : ''}${r.bias.toFixed(2)}`,
    ));
    console.log('');
  }
}
