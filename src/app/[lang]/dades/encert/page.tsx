import type { Metadata } from 'next';
import Link from 'next/link';
import { temperatureCompare } from '@/lib/weather';
import { stationByCodi } from '@/lib/territory';
import { dateShort, int, num } from '@/lib/format';
import {
  COMPARE_SOURCES, OURS, OURS_A,
  compareBias, compareGt3, compareMae, sumTallies,
  type CompareScores, type CompareSource, type CompareStation, type CompareTally,
  sourceLabel,
} from '@/lib/temperature-compare';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { Fold } from '@/components/Fold';
import { getLang } from '@/lib/i18n';
import { tr, type Lang } from '@/lib/lang';

/*
 * Es genera a cada petició i el CDN la guarda cinc minuts: la regla és a
 * `next.config.ts`, «Les pàgines amb dades d'ara». La dada canvia un cop al
 * dia, però amb ISR la primera visita després del worker veuria la d'ahir.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tr(lang, 'Com encerta la temperatura', 'Cómo acierta la temperatura'),
    description: tr(lang,
      "L'error de la temperatura d'ara d'aquest web i el dels models meteorològics, "
      + 'mesurat hora a hora contra les estacions de la XEMA.',
      'El error de la temperatura actual de esta web y el de los modelos meteorológicos, '
      + 'medido hora a hora contra las estaciones de la XEMA.'),
    alternates: { canonical: '/dades/encert' },
  };
}

const trailOf = (lang: Lang) => [
  { nom: tr(lang, 'Catalunya', 'Cataluña'), path: '/' },
  { nom: tr(lang, 'Dades obertes', 'Datos abiertos'), path: '/dades' },
  { nom: tr(lang, 'Com encerta', 'Cómo acierta'), path: '/dades/encert' },
];

/** Els models sols, sense cap de les dues xifres d'aquest web. */
const MODELS = COMPARE_SOURCES.filter((s) => s !== OURS && s !== OURS_A);

/** Les fonts de la taula dels grups: les dues d'aquest web, la genèrica i la millor. */
const GROUP_SOURCES: CompareSource[] = [OURS, OURS_A, 'best_match', 'meteofrance_arome_france_hd'];
const GROUP_LABEL: Partial<Record<CompareSource, string>> = { [OURS]: 'Aquest web', [OURS_A]: 'Amb tres models' };
const GROUP_ETIQUETA: Partial<Record<CompareSource, string>> = { [OURS]: 'Esta web', [OURS_A]: 'Con tres modelos' };

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
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const trail = trailOf(lang);
  const cmp = await temperatureCompare();

  if (!cmp) {
    return (
      <article>
        <JsonLd data={graph(breadcrumbLd(trail, lang))} />
        <PageHero
          crumbs={trail}
          eyebrow={t('Dades obertes', 'Datos abiertos')}
          title={t('Com encerta la temperatura', 'Cómo acierta la temperatura')}
          lead={t('Encara no hi ha cap dia comparat. La comparació es fa un cop al dia, amb el dia anterior.',
            'Todavía no hay ningún día comparado. La comparación se hace una vez al día, con el día anterior.')}
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
    { label: t("L'estació veïna més propera, a menys de 10 km", 'La estación vecina más cercana, a menos de 10 km'), t: bySource(rows.filter((r) => r.km < 10)), k: rows.filter((r) => r.km < 10).length },
    { label: t('A 10 km o més', 'A 10 km o más'), t: bySource(rows.filter((r) => r.km >= 10)), k: rows.filter((r) => r.km >= 10).length },
    { label: t('Per sota de 300 m', 'Por debajo de 300 m'), t: bySource(rows.filter((r) => r.altitud < 300)), k: rows.filter((r) => r.altitud < 300).length },
    { label: t('De 300 a 800 m', 'De 300 a 800 m'), t: bySource(rows.filter((r) => r.altitud >= 300 && r.altitud < 800)), k: rows.filter((r) => r.altitud >= 300 && r.altitud < 800).length },
    { label: t('De 800 a 1.500 m', 'De 800 a 1.500 m'), t: bySource(rows.filter((r) => r.altitud >= 800 && r.altitud < 1500)), k: rows.filter((r) => r.altitud >= 800 && r.altitud < 1500).length },
    { label: t('A 1.500 m o més', 'A 1.500 m o más'), t: bySource(rows.filter((r) => r.altitud >= 1500)), k: rows.filter((r) => r.altitud >= 1500).length },
    {
      label: t('Amb més de 200 m de desnivell fins a la veïna més propera', 'Con más de 200 m de desnivel hasta la vecina más cercana'),
      t: bySource(rows.filter((r) => r.dAlt > 200)), k: rows.filter((r) => r.dAlt > 200).length,
    },
    // UTC: de 9 a 15 h són les hores centrals del dia amb horari d'estiu i d'hivern.
    { label: t('Hores centrals del dia', 'Horas centrales del día'), note: t('de 9 a 15 h UTC', 'de 9 a 15 h UTC'), t: byHours(data, (h) => h >= 9 && h <= 15) },
    { label: t('De nit', 'De noche'), note: t('de 19 a 5 h UTC', 'de 19 a 5 h UTC'), t: byHours(data, (h) => h >= 19 || h <= 5) },
  ];

  // Un registre d'abans pot no portar alguna de les fonts.
  const groupSources = GROUP_SOURCES.filter((s) => all[s]?.n);
  const oursA = compareMae(all[OURS_A]);

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail, lang))} />

      <PageHero
        crumbs={trail}
        eyebrow={t('Dades obertes', 'Datos abiertos')}
        icon="thermometer"
        title={t('Com encerta la temperatura', 'Cómo acierta la temperatura')}
        lead={ours != null && generic != null && best != null && bestModel ? (lang === 'es' ? (
          <>
            La temperatura actual que muestra esta web se equivoca, de media,{' '}
            <strong className="tnum">{num(ours, 2)} °C</strong>
            {oursA != null && <>, y <strong className="tnum">{num(oursA, 2)} °C</strong> en los pueblos donde se parte de tres modelos</>}.
            La que elige Open-Meteo para cada punto, <strong className="tnum">{num(generic, 2)} °C</strong>, y
            el modelo que más acierta, {sourceLabel(bestModel, lang)},{' '}
            <strong className="tnum">{num(best, 2)} °C</strong>.
          </>
        ) : (
          <>
            La temperatura d&apos;ara que ensenya aquest web s&apos;equivoca, de mitjana,{' '}
            <strong className="tnum">{num(ours, 2)} °C</strong>
            {oursA != null && <>, i <strong className="tnum">{num(oursA, 2)} °C</strong> als pobles on es parteix de tres models</>}.
            La que tria Open-Meteo per a cada punt, <strong className="tnum">{num(generic, 2)} °C</strong>, i
            el model que més encerta, {sourceLabel(bestModel)},{' '}
            <strong className="tnum">{num(best, 2)} °C</strong>.
          </>
        )) : undefined}
        stats={[
          ours != null && { label: t('Aquest web', 'Esta web'), icon: 'thermometer', value: num(ours, 2), unit: '°C', sub: t("d'error mitjà", 'de error medio') },
          generic != null && { label: 'Open-Meteo', icon: 'thermometer', value: num(generic, 2), unit: '°C', sub: t('el que tria per a cada punt', 'el que elige para cada punto') },
          { label: t('Comparacions', 'Comparaciones'), value: int(n), sub: tr(lang,
            `${int(rows.length)} estacions · ${days} ${days === 1 ? 'dia' : 'dies'}`,
            `${int(rows.length)} estaciones · ${days} ${days === 1 ? 'día' : 'días'}`) },
        ]}
        note={lang === 'es' ? (
          <>
            Del {dateShort(data.scored[0], lang)} al {dateShort(data.scored.at(-1)!, lang)}, hora a hora, contra
            lo que han medido las estaciones de la XEMA. Se actualiza cada mañana.
          </>
        ) : (
          <>
            Del {dateShort(data.scored[0])} al {dateShort(data.scored.at(-1)!)}, hora a hora, contra
            el que han mesurat les estacions de la XEMA. Es posa al dia cada matí.
          </>
        )}
      />

      <Section id="fonts" title={t('Totes les fonts', 'Todas las fuentes')}>
        <div className="card">
          <div className="scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('Font', 'Fuente')}</th>
                  <th scope="col" className="num">{t('Error mitjà', 'Error medio')}</th>
                  <th scope="col" className="num">{t('Biaix', 'Sesgo')}</th>
                  <th scope="col" className="num">{t('Errors de més de 3 °C', 'Errores de más de 3 °C')}</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s) => (
                  <tr key={s}>
                    <th scope="row" className={`text-left normal-case tracking-normal ${s === OURS ? 'font-semibold text-[var(--ink)]' : 'font-normal'}`}>
                      {sourceLabel(s, lang)}
                    </th>
                    <td className="num tnum">{deg(compareMae(all[s]))}</td>
                    <td className="num tnum">{signed(compareBias(all[s]))}</td>
                    <td className="num tnum">{pct(compareGt3(all[s]))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lang === 'es' ? (
            <p className="source">
              El error medio es la diferencia con la temperatura medida, sin signo. El
              sesgo es la misma diferencia con signo: positivo quiere decir que la fuente da más
              calor del que hace. La cifra de esta web acierta más que el mejor modelo en{' '}
              {wins} de las {rows.length} estaciones.
            </p>
          ) : (
          <p className="source">
            L&apos;error mitjà és la diferència amb la temperatura mesurada, sense signe. El
            biaix és la mateixa diferència amb signe: positiu vol dir que la font diu més
            calor de la que fa. La xifra d&apos;aquest web encerta més que el millor model a{' '}
            {wins} de les {rows.length} estacions.
          </p>
          )}
        </div>
      </Section>

      <Section id="on" title={t('On encerta més i on menys', 'Dónde acierta más y dónde menos')}>
        <div className="card">
          <div className="scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('Estacions', 'Estaciones')}</th>
                  {groupSources.map((s) => (
                    <th key={s} scope="col" className="num">{(lang === 'es' ? GROUP_ETIQUETA[s] : GROUP_LABEL[s]) ?? sourceLabel(s, lang).replace(/ \(.*\)$/, '')}</th>
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
                          {g.k != null ? `${g.k} ${g.k === 1 ? t('estació', 'estación') : t('estacions', 'estaciones')}` : g.note}
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
          {lang === 'es' ? (
            <p className="source">
              Error medio de cada grupo; en negrita, el más bajo. «Con tres modelos» es la
              misma cifra en los 350 puntos donde la predicción es la media de tres modelos —los
              pueblos más grandes—; el resto parte de la elección de Open-Meteo, y a partir de 500 m
              también de AROME.
            </p>
          ) : (
          <p className="source">
            Error mitjà de cada grup; en negreta, el més baix. «Amb tres models» és la
            mateixa xifra als 350 punts on la predicció és la mitjana de tres models —els
            pobles més grans—; la resta parteix de la tria d&apos;Open-Meteo, i a partir de 500 m
            també d&apos;AROME.
          </p>
          )}
        </div>
      </Section>

      <Fold title={t('Com es mesura', 'Cómo se mide')} summary={t('Traient cada estació, una per una', 'Quitando cada estación, una por una')}>
        {lang === 'es' ? (
          <div className="measure space-y-3">
            <p>
              La temperatura de una ficha parte del modelo meteorológico en ese punto y a
              esa altitud, y le suma el error que el mismo modelo está cometiendo en las
              estaciones de la XEMA de alrededor: cada estación pesa más cuanto más cerca está y
              cuanto más parecida es su altitud, y lejos de toda estación queda el modelo
              solo. El error se mide con la última lectura, que llega con una hora de
              retraso, y se suma al modelo de la hora actual.
            </p>
            <p>
              En el pueblo no hay ningún termómetro para comprobarlo, pero en cada estación sí: para
              cada estación y cada hora, se calcula la cifra que daría esta web{' '}
              <strong>sin esa estación</strong>, con las lecturas de las demás de
              la hora anterior, y se compara con lo que ha medido.
            </p>
            <p>
              A los modelos se les pide la temperatura que preveían para esa hora en las
              coordenadas y a la cota de la estación, en el archivo de predicción
              de Open-Meteo. Una hora solo cuenta si todas las fuentes tienen valor, y las
              lecturas que las estaciones vecinas desmienten no se usan.
            </p>
            <p>
              Es una comparación desfavorable para esta web: sin la estación, la vecina
              más cercana queda a {kmMedian != null ? `${num(kmMedian, 1)} km` : 'unos cuantos kilómetros'} de
              mediana, y la de un pueblo queda más cerca. Las aplicaciones comerciales no
              publican qué decían horas atrás y no se pueden medir así; la mayoría usan
              alguno de estos modelos.
            </p>
            <p>
              Cuándo se actualizó por última vez está en{' '}
              <Link href="/estat">el estado de los datos</Link>.
            </p>
          </div>
        ) : (
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
        )}
      </Fold>
    </article>
  );
}
