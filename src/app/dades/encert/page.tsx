import type { Metadata } from 'next';
import Link from 'next/link';
import { temperatureCompare } from '@/lib/weather';
import { stationByCodi } from '@/lib/territory';
import { dateShort, int, num } from '@/lib/format';
import {
  COMPARE_SOURCES, OURS, OURS_A, SOURCE_LABEL,
  compareBias, compareGt3, compareMae, sumTallies,
  type CompareScores, type CompareSource, type CompareStation, type CompareTally,
} from '@/lib/temperature-compare';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { Fold } from '@/components/Fold';

/*
 * Es genera a cada petició i el CDN la guarda cinc minuts: la regla és a
 * `next.config.ts`, «Les pàgines amb dades d'ara». La dada canvia un cop al
 * dia, però amb ISR la primera visita després del worker veuria la d'ahir.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Com encerta la temperatura',
  description: "L'error de la temperatura d'ara d'aquest web i el dels models meteorològics, "
    + 'mesurat hora a hora contra les estacions de la XEMA.',
  alternates: { canonical: '/dades/encert' },
};

const trail = [
  { nom: 'Catalunya', path: '/' },
  { nom: 'Dades obertes', path: '/dades' },
  { nom: 'Com encerta', path: '/dades/encert' },
];

/** Els models sols, sense cap de les dues xifres d'aquest web. */
const MODELS = COMPARE_SOURCES.filter((s) => s !== OURS && s !== OURS_A);

/** Les fonts de la taula dels grups: les dues d'aquest web, la genèrica i la millor. */
const GROUP_SOURCES: CompareSource[] = [OURS, OURS_A, 'best_match', 'meteofrance_arome_france_hd'];
const GROUP_LABEL: Partial<Record<CompareSource, string>> = { [OURS]: 'Aquest web', [OURS_A]: 'Amb tres models' };

interface Row { codi: string; st: CompareStation; altitud: number; km: number; dAlt: number }

function bySource(rows: Row[]): Partial<Record<CompareSource, CompareTally>> {
  const out: Partial<Record<CompareSource, CompareTally>> = {};
  for (const s of COMPARE_SOURCES) out[s] = sumTallies(rows.map((r) => r.st.bySource[s]));
  return out;
}

/** Les hores UTC d'un tram, sumades. */
function byHours(data: CompareScores, keep: (h: number) => boolean) {
  const out: Partial<Record<CompareSource, CompareTally>> = {};
  const hours = Object.entries(data.byHour).filter(([h]) => keep(Number(h)));
  for (const s of COMPARE_SOURCES) out[s] = sumTallies(hours.map(([, v]) => v[s]));
  return out;
}

const deg = (v: number | null) => (v == null ? '—' : `${num(v, 2)} °C`);
const pct = (v: number | null) => (v == null ? '—' : `${num(v * 100, 0)} %`);
const signed = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${num(v, 2)} °C`);

export default async function EncertPage() {
  const cmp = await temperatureCompare();

  if (!cmp) {
    return (
      <article>
        <JsonLd data={graph(breadcrumbLd(trail))} />
        <PageHero
          crumbs={trail}
          eyebrow="Dades obertes"
          title="Com encerta la temperatura"
          lead="Encara no hi ha cap dia comparat. La comparació es fa un cop al dia, amb el dia anterior."
        />
      </article>
    );
  }

  const { data } = cmp;
  const rows: Row[] = Object.entries(data.stations).flatMap(([codi, st]) => {
    const n = st.bySource[OURS]?.n ?? 0;
    const altitud = stationByCodi(codi)?.altitud;
    if (!n || altitud == null) return [];
    return [{ codi, st, altitud, km: st.sumNeighbourKm / n, dAlt: st.sumNeighbourDAlt / n }];
  });

  const all = bySource(rows);
  const ranked = [...COMPARE_SOURCES]
    .filter((s) => all[s]?.n)
    .sort((a, b) => (compareMae(all[a]) ?? 99) - (compareMae(all[b]) ?? 99));
  const bestModel = MODELS
    .filter((s) => all[s]?.n)
    .sort((a, b) => (compareMae(all[a]) ?? 99) - (compareMae(all[b]) ?? 99))[0];
  const ours = compareMae(all[OURS]);
  const generic = compareMae(all.best_match);
  const best = bestModel ? compareMae(all[bestModel]) : null;
  const n = all[OURS]?.n ?? 0;
  const days = data.scored.length;

  // Les estacions on la nostra xifra encerta més que el millor model d'aquella estació.
  const wins = rows.filter((r) => {
    const o = compareMae(r.st.bySource[OURS]);
    const m = Math.min(...MODELS.map((s) => compareMae(r.st.bySource[s]) ?? 99));
    return o != null && o < m;
  }).length;

  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  const kmMedian = median(rows.map((r) => r.km));

  const groups: Array<{ label: string; note?: string; t: Partial<Record<CompareSource, CompareTally>>; k?: number }> = [
    { label: "L'estació veïna més propera, a menys de 10 km", t: bySource(rows.filter((r) => r.km < 10)), k: rows.filter((r) => r.km < 10).length },
    { label: 'A 10 km o més', t: bySource(rows.filter((r) => r.km >= 10)), k: rows.filter((r) => r.km >= 10).length },
    { label: 'Per sota de 300 m', t: bySource(rows.filter((r) => r.altitud < 300)), k: rows.filter((r) => r.altitud < 300).length },
    { label: 'De 300 a 800 m', t: bySource(rows.filter((r) => r.altitud >= 300 && r.altitud < 800)), k: rows.filter((r) => r.altitud >= 300 && r.altitud < 800).length },
    { label: 'De 800 a 1.500 m', t: bySource(rows.filter((r) => r.altitud >= 800 && r.altitud < 1500)), k: rows.filter((r) => r.altitud >= 800 && r.altitud < 1500).length },
    { label: 'A 1.500 m o més', t: bySource(rows.filter((r) => r.altitud >= 1500)), k: rows.filter((r) => r.altitud >= 1500).length },
    {
      label: 'Amb més de 200 m de desnivell fins a la veïna més propera',
      t: bySource(rows.filter((r) => r.dAlt > 200)), k: rows.filter((r) => r.dAlt > 200).length,
    },
    // UTC: de 9 a 15 h són les hores centrals del dia amb horari d'estiu i d'hivern.
    { label: 'Hores centrals del dia', note: 'de 9 a 15 h UTC', t: byHours(data, (h) => h >= 9 && h <= 15) },
    { label: 'De nit', note: 'de 19 a 5 h UTC', t: byHours(data, (h) => h >= 19 || h <= 5) },
  ];

  // Un registre d'abans pot no portar alguna de les fonts.
  const groupSources = GROUP_SOURCES.filter((s) => all[s]?.n);
  const oursA = compareMae(all[OURS_A]);

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Dades obertes"
        icon="thermometer"
        title="Com encerta la temperatura"
        lead={ours != null && generic != null && best != null && bestModel ? (
          <>
            La temperatura d&apos;ara que ensenya aquest web s&apos;equivoca, de mitjana,{' '}
            <strong className="tnum">{num(ours, 2)} °C</strong>
            {oursA != null && <>, i <strong className="tnum">{num(oursA, 2)} °C</strong> als pobles on es parteix de tres models</>}.
            La que tria Open-Meteo per a cada punt, <strong className="tnum">{num(generic, 2)} °C</strong>, i
            el model que més encerta, {SOURCE_LABEL[bestModel]},{' '}
            <strong className="tnum">{num(best, 2)} °C</strong>.
          </>
        ) : undefined}
        stats={[
          ours != null && { label: 'Aquest web', icon: 'thermometer', value: num(ours, 2), unit: '°C', sub: "d'error mitjà" },
          generic != null && { label: 'Open-Meteo', icon: 'thermometer', value: num(generic, 2), unit: '°C', sub: 'el que tria per a cada punt' },
          { label: 'Comparacions', value: int(n), sub: `${int(rows.length)} estacions · ${days} ${days === 1 ? 'dia' : 'dies'}` },
        ]}
        note={(
          <>
            Del {dateShort(data.scored[0])} al {dateShort(data.scored.at(-1)!)}, hora a hora, contra
            el que han mesurat les estacions de la XEMA. Es posa al dia cada matí.
          </>
        )}
      />

      <Section id="fonts" title="Totes les fonts">
        <div className="card">
          <div className="scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Font</th>
                  <th scope="col" className="num">Error mitjà</th>
                  <th scope="col" className="num">Biaix</th>
                  <th scope="col" className="num">Errors de més de 3 °C</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s) => (
                  <tr key={s}>
                    <th scope="row" className={`text-left normal-case tracking-normal ${s === OURS ? 'font-semibold text-[var(--ink)]' : 'font-normal'}`}>
                      {SOURCE_LABEL[s]}
                    </th>
                    <td className="num tnum">{deg(compareMae(all[s]))}</td>
                    <td className="num tnum">{signed(compareBias(all[s]))}</td>
                    <td className="num tnum">{pct(compareGt3(all[s]))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="source">
            L&apos;error mitjà és la diferència amb la temperatura mesurada, sense signe. El
            biaix és la mateixa diferència amb signe: positiu vol dir que la font diu més
            calor de la que fa. La xifra d&apos;aquest web encerta més que el millor model a{' '}
            {wins} de les {rows.length} estacions.
          </p>
        </div>
      </Section>

      <Section id="on" title="On encerta més i on menys">
        <div className="card">
          <div className="scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Estacions</th>
                  {groupSources.map((s) => (
                    <th key={s} scope="col" className="num">{GROUP_LABEL[s] ?? SOURCE_LABEL[s].replace(/ \(.*\)$/, '')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const maes = groupSources.map((s) => compareMae(g.t[s]));
                  const min = Math.min(...maes.filter((v): v is number => v != null));
                  return (
                    <tr key={g.label}>
                      <th scope="row" className="text-left font-normal normal-case tracking-normal">
                        {g.label}
                        <span className="block text-xs text-[var(--muted)]">
                          {g.k != null ? `${g.k} ${g.k === 1 ? 'estació' : 'estacions'}` : g.note}
                        </span>
                      </th>
                      {maes.map((v, i) => (
                        <td key={groupSources[i]} className={`num tnum ${v === min ? 'font-semibold text-[var(--ink)]' : ''}`}>
                          {deg(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="source">
            Error mitjà de cada grup; en negreta, el més baix. «Amb tres models» és la
            mateixa xifra als 350 punts on la predicció és la mitjana de tres models —els
            pobles més grans—; a la resta es parteix d&apos;un.
          </p>
        </div>
      </Section>

      <Fold title="Com es mesura" summary="Traient cada estació, una per una">
        <div className="measure space-y-3">
          <p>
            La temperatura d&apos;una fitxa parteix del model meteorològic en aquell punt i a
            aquella altitud, i li suma l&apos;error que el mateix model està fent a les
            estacions de la XEMA del voltant: cada estació hi pesa més com més a prop és i
            com més semblant és la seva altitud, i lluny de tota estació queda el model
            sol. L&apos;error es mesura amb la darrera lectura, que arriba amb una hora de
            retard, i se suma al model de l&apos;hora d&apos;ara.
          </p>
          <p>
            Al poble no hi ha cap termòmetre per comprovar-ho, però a cada estació sí: per
            a cada estació i cada hora, es calcula la xifra que en donaria aquest web{' '}
            <strong>sense aquella estació</strong>, amb les lectures de les altres de
            l&apos;hora anterior, i es compara amb el que ha mesurat.
          </p>
          <p>
            Als models se&apos;ls demana la temperatura que preveien per a aquella hora a les
            coordenades i a la cota de l&apos;estació, a l&apos;arxiu de predicció
            d&apos;Open-Meteo. Una hora només compta si totes les fonts hi tenen valor, i les
            lectures que les estacions veïnes desmenteixen no es fan servir.
          </p>
          <p>
            És una comparació desfavorable per a aquest web: sense l&apos;estació, la veïna
            més propera queda a {kmMedian != null ? `${num(kmMedian, 1)} km` : 'uns quants quilòmetres'} de
            mediana, i la d&apos;un poble queda més a prop. Les aplicacions comercials no
            publiquen què deien hores enrere i no es poden mesurar així; la majoria fan
            servir algun d&apos;aquests models.
          </p>
          <p>
            Quan es va posar al dia per última vegada és a{' '}
            <Link href="/estat">l&apos;estat de les dades</Link>.
          </p>
        </div>
      </Fold>
    </article>
  );
}
