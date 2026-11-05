import type { Metadata } from 'next';
import { freshness } from '@/lib/weather';
import { buildSummary } from '@/lib/territory';
import { dateShort, int } from '@/lib/format';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { getLang } from '@/lib/i18n';
import { tr, type Lang } from '@/lib/lang';
import { alternatesFor } from '@/lib/site';

/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tr(lang, 'Estat de les dades', 'Estado de los datos'),
    description: tr(lang, 'Quan es va actualitzar per última vegada cada font de dades del web.',
      'Cuándo se actualizó por última vez cada fuente de datos de la web.'),
    alternates: alternatesFor('/estat'),
  };
}

const LABELS: Record<string, string> = {
  'xema-observations': 'Observació XEMA (Meteocat)',
  'forecast-refresh': 'Predicció (Open-Meteo)',
  'aemet-warnings': 'Avisos oficials (AEMET)',
  'xema-history': 'Rècords i normals (XEMA)',
  'air-quality': 'Qualitat de l’aire i pol·len (CAMS)',
  'radar': 'Radar de precipitació (RainViewer)',
  'forecast-field': 'Camp de vent del mapa (Open-Meteo)',
  'forecast-verify': 'Encert dels models, comprovat contra la XEMA',
  'temperature-compare': "La temperatura d'ara, comparada amb la dels models",
  'water': 'Embassaments, cabals i sequera (ACA)',
  'air-stations': 'Qualitat de l’aire mesurada (XVPCA)',
  'sea': 'Banderes de platja i onatge',
  'cameras': 'Càmeres de muntanya (FGC)',
  'fgc-mountain': 'Neu i obertura d’estacions (FGC)',
};

const ETIQUETAS: Record<string, string> = {
  'xema-observations': 'Observación XEMA (Meteocat)',
  'forecast-refresh': 'Predicción (Open-Meteo)',
  'aemet-warnings': 'Avisos oficiales (AEMET)',
  'xema-history': 'Récords y normales (XEMA)',
  'air-quality': 'Calidad del aire y polen (CAMS)',
  'radar': 'Radar de precipitación (RainViewer)',
  'forecast-field': 'Campo de viento del mapa (Open-Meteo)',
  'forecast-verify': 'Acierto de los modelos, comprobado contra la XEMA',
  'temperature-compare': 'La temperatura actual, comparada con la de los modelos',
  'water': 'Embalses, caudales y sequía (ACA)',
  'air-stations': 'Calidad del aire medida (XVPCA)',
  'sea': 'Banderas de playa y oleaje',
  'cameras': 'Cámaras de montaña (FGC)',
  'fgc-mountain': 'Nieve y apertura de estaciones (FGC)',
};

const labelOf = (source: string, lang: Lang) => (lang === 'es' ? ETIQUETAS : LABELS)[source] ?? source;

/**
 * Una marca de temps, en hora de Madrid.
 *
 * Les fonts no les desen igual: unes porten zona —`…Z`, `…-00:00`, instants en
 * UTC— i altres no —`2026-09-29T00:00`, que ja és l'hora local d'Open-Meteo, o
 * només una data—. La pàgina les tallava totes igual, així que la del radar
 * sortia a les 12:10 quan la fitxa de qualsevol poble deia 14:10. Només es
 * converteix la que diu de quina zona és: convertir les altres les mouria dues
 * hores en l'altra direcció.
 */
function localStamp(ts: string): string {
  if (/(?:[zZ]|[+-]\d\d:\d\d)$/.test(ts)) {
    return new Date(ts).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16);
  }
  return ts.slice(0, 16).replace('T', ' ');
}

function age(minutes: number | null, lang: Lang = 'ca'): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} ${tr(lang, 'dies', 'días')}`;
}

/**
 * Què vol dir el missatge del worker, en català.
 *
 * El missatge és el de la llibreria que ha fallat —«fetch failed», «HTTP 500
 * Internal Server Error», «Fallo tras 5 intentos»— i a la pàgina sortia tal
 * qual, tallat a mitja paraula. Aquí es diu de quina mena és; el text cru va
 * plegat a sota per a qui el necessiti.
 */
function errorReason(msg: string, lang: Lang = 'ca'): string {
  const http = /\b(?:HTTP|status)\s*:?\s*(\d{3})\b/i.exec(msg)?.[1];
  if (lang === 'es') return motivoError(msg, http);
  if (http === '429') return 'la font ha limitat les peticions';
  if (http === '401' || http === '403') return 'la font no ha acceptat la clau';
  if (http === '404') return 'la font no tenia el fitxer demanat';
  if (http && http.startsWith('5')) return `la font ha respost amb un error seu (HTTP ${http})`;
  if (/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|timeout|aborted|socket|network/i.test(msg)) {
    return 'no s’ha pogut connectar amb la font';
  }
  if (/JSON|Unexpected token|parse/i.test(msg)) return 'la font ha tornat una resposta il·legible';
  // Els que escriuen els workers ja són en català i diuen més que una etiqueta.
  const own = msg.replace(/^Error:\s*/, '');
  // Per l'accent, o per com comencen: «La font no ha publicat cap dia complet»
  // no en porta cap, i sortia com si fos el procés el que havia fallat.
  if ((/[àèéíòóúç·’]/.test(own) || /^La font /.test(own)) && !/\b(the|failed|is|not|of)\b/.test(own)) {
    return clip(own, 160);
  }
  return 'el procés s’ha aturat amb un error';
}

/**
 * El mateix en castellà. Els missatges que escriuen els workers són en català i
 * no es tradueixen: es diu que la font ha avisat d'un problema, i el text cru
 * segueix plegat a sota.
 */
function motivoError(msg: string, http: string | undefined): string {
  if (http === '429') return 'la fuente ha limitado las peticiones';
  if (http === '401' || http === '403') return 'la fuente no ha aceptado la clave';
  if (http === '404') return 'la fuente no tenía el archivo pedido';
  if (http && http.startsWith('5')) return `la fuente ha respondido con un error suyo (HTTP ${http})`;
  if (/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|timeout|aborted|socket|network/i.test(msg)) {
    return 'no se ha podido conectar con la fuente';
  }
  if (/JSON|Unexpected token|parse/i.test(msg)) return 'la fuente ha devuelto una respuesta ilegible';
  const own = msg.replace(/^Error:\s*/, '');
  if ((/[àèéíòóúç·’]/.test(own) || /^La font /.test(own)) && !/\b(the|failed|is|not|of)\b/.test(own)) {
    return 'el proceso ha dejado un aviso (detalle en catalán, debajo)';
  }
  return 'el proceso se ha detenido con un error';
}

/** Un missatge llarg, tallat per una paraula i dient-ho. */
const clip = (s: string, n = 240) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(' ', n) > n * 0.6 ? s.lastIndexOf(' ', n) : n)}…`);

/**
 * Els dies que falten, ajuntats en trams: «del 25 al 28 d'octubre».
 *
 * L'1 i l'11 porten apòstrof —«de l'1», «a l'11»—, i un tram que travessa
 * dos mesos diu tots dos: «del 30 de setembre al 2 d'octubre».
 */
function gapRanges(days: string[], lang: Lang = 'ca'): string {
  const sorted = [...new Set(days)].sort();
  const runs: Array<[string, string]> = [];
  for (const d of sorted) {
    const last = runs.at(-1);
    const next = last && new Date(Date.parse(`${last[1]}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    if (last && next === d) last[1] = d;
    else runs.push([d, d]);
  }
  const day = (iso: string) => Number(iso.slice(8, 10));
  const vowel = (iso: string) => day(iso) === 1 || day(iso) === 11;
  const the = (iso: string) => (vowel(iso) ? "l'" : 'el ');
  const from = (iso: string) => (vowel(iso) ? "de l'" : 'del ');
  const to = (iso: string) => (vowel(iso) ? "a l'" : 'al ');
  if (lang === 'es') {
    // En castellano no hay apóstrofo: «del 1 al 3 de octubre», «el 11 de octubre».
    const partes = runs.map(([a, b]) => {
      if (a === b) return `el ${dateShort(a, lang)}`;
      const head = a.slice(0, 7) === b.slice(0, 7) ? String(day(a)) : dateShort(a, lang);
      return `del ${head} al ${dateShort(b, lang)}`;
    });
    return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}` : partes[0];
  }
  const parts = runs.map(([a, b]) => {
    if (a === b) return `${the(a)}${dateShort(a)}`;
    const head = a.slice(0, 7) === b.slice(0, 7) ? String(day(a)) : dateShort(a);
    return `${from(a)}${head} ${to(b)}${dateShort(b)}`;
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} i ${parts.at(-1)}` : parts[0];
}

type Source = Awaited<ReturnType<typeof freshness>>[number];
type State = 'missing' | 'error' | 'stale' | 'ok';

const stateOf = (s: Source): State =>
  s.missing ? 'missing' : s.error ? 'error' : s.stale ? 'stale' : 'ok';

const STATE: Record<State, { label: string; etiqueta: string; color: string }> = {
  missing: { label: 'mai executada', etiqueta: 'nunca ejecutada', color: 'var(--muted)' },
  error: { label: 'error', etiqueta: 'error', color: 'var(--bad)' },
  stale: { label: 'endarrerida', etiqueta: 'con retraso', color: 'var(--warn)' },
  ok: { label: 'al dia', etiqueta: 'al día', color: 'var(--good)' },
};

/** Els noms de les fonts d'una llista, per a l'entradilla. */
const names = (list: Source[], lang: Lang) => list.map((s) => labelOf(s.source, lang)).join(', ');

export default async function EstatPage() {
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const sources = await freshness();
  const summary = buildSummary() as { builtAt: string; indexablePages: number; nomenclatorEdition: string };

  const by = (st: State) => sources.filter((s) => stateOf(s) === st);
  const ok = by('ok');
  const stale = by('stale');
  const failed = by('error');
  const missing = by('missing');

  const trail = [
    { nom: t('Catalunya', 'Cataluña'), path: '/' },
    { nom: t('Estat de les dades', 'Estado de los datos'), path: '/estat' },
  ];

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail, lang))} />

      <PageHero
        crumbs={trail}
        eyebrow={t('Les fonts del web', 'Las fuentes de la web')}
        icon="barometer"
        title={t('Estat de les dades', 'Estado de los datos')}
        lead={lang === 'es' ? (
          <>
            {ok.length === sources.length
              ? <>Las <strong>{sources.length} fuentes</strong> están al día.</>
              : <><strong>{ok.length} de las {sources.length} fuentes</strong> están al día.</>}
            {stale.length > 0 && <> {stale.length === 1 ? 'Va con retraso' : 'Van con retraso'}: {names(stale, lang)}.</>}
            {failed.length > 0 && <> Con error: {names(failed, lang)}.</>}
          </>
        ) : (
          <>
            {ok.length === sources.length
              ? <>Les <strong>{sources.length} fonts</strong> estan al dia.</>
              : <><strong>{ok.length} de les {sources.length} fonts</strong> estan al dia.</>}
            {stale.length > 0 && <> {stale.length === 1 ? 'Va endarrerida' : 'Van endarrerides'}: {names(stale, lang)}.</>}
            {failed.length > 0 && <> Amb error: {names(failed, lang)}.</>}
          </>
        )}
        stats={[
          { label: t('Al dia', 'Al día'), value: String(ok.length), sub: tr(lang, `de ${sources.length} fonts`, `de ${sources.length} fuentes`) },
          { label: t('Endarrerides', 'Con retraso'), value: String(stale.length) },
          { label: t('Amb error', 'Con error'), value: String(failed.length) },
          missing.length > 0 && { label: t('Mai executades', 'Nunca ejecutadas'), value: String(missing.length) },
        ]}
        note={lang === 'es' ? (
          <>
            Cuándo se actualizó cada fuente y qué antigüedad tiene el dato más
            reciente, en hora de Cataluña. Antes de fiarse de una cifra, mire
            si la fuente que hay detrás está al día.
          </>
        ) : (
          <>
            Quan es va actualitzar cada font i quina antiguitat té la dada més
            recent, en hora de Catalunya. Abans de fiar-vos d&apos;una xifra, mireu
            si la font que hi ha al darrere està al dia.
          </>
        )}
        aside={(
          <section className="card" aria-label={t('Territori', 'Territorio')}>
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/barometer.svg" width={22} height={22} alt="" />
              {t('Territori', 'Territorio')}
            </p>
            <ul className="rows">
              <li>
                <span className="row-main"><span className="row-title">{t('Rutes territorials', 'Rutas territoriales')}</span></span>
                <span className="row-value">{int(summary.indexablePages)}</span>
              </li>
              <li>
                <span className="row-main"><span className="row-title">{t('Nomenclàtor estadístic', 'Nomenclátor estadístico')}</span></span>
                <span className="row-value">{t('edició ', 'edición ')}{summary.nomenclatorEdition}</span>
              </li>
              <li>
                <span className="row-main"><span className="row-title">{t('Última construcció', 'Última construcción')}</span></span>
                <span className="row-value">{summary.builtAt.slice(0, 10)}</span>
              </li>
            </ul>
            {lang === 'es' ? (
              <p className="source">
                Construidas a partir del Nomenclàtor, los límites administrativos del
                ICGC y los metadatos de la XEMA.
              </p>
            ) : (
              <p className="source">
                Construïdes a partir del Nomenclàtor, els límits administratius de
                l&apos;ICGC i les metadades de la XEMA.
              </p>
            )}
          </section>
        )}
      />

      {/* Sempre les tretze fonts: una que no hagi publicat mai ha de sortir
          dient-ho, no desaparèixer del panell. Veure src/lib/shards.ts. */}
      <Section id="fonts" title={t('Font per font', 'Fuente por fuente')}>
        <div className="card">
          <div className="scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('Font', 'Fuente')}</th>
                  <th scope="col" className="hidden sm:table-cell">{t('Dada més recent', 'Dato más reciente')}</th>
                  <th scope="col" className="num hidden sm:table-cell">{t('Antiguitat', 'Antigüedad')}</th>
                  <th scope="col">{t('Estat', 'Estado')}</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const st = STATE[stateOf(s)];
                  return (
                    <tr key={s.source}>
                      <td className="sm:min-w-[11rem]">
                        <span className="font-medium text-[var(--ink)]">{labelOf(s.source, lang)}</span>
                        {/* Al mòbil les quatre columnes no hi caben i l'estat quedava
                            fora de la pantalla: la data i l'antiguitat van aquí, a sota
                            del nom, i les seves columnes s'amaguen. */}
                        <span className="tnum mt-0.5 block text-xs text-[var(--muted)] sm:hidden">
                          <span className="whitespace-nowrap">{s.lastDataTs ? localStamp(s.lastDataTs) : '—'}</span>
                          {' · '}<span className="whitespace-nowrap">{age(s.ageMin, lang)}</span>
                        </span>
                      </td>
                      <td className="tnum hidden whitespace-nowrap sm:table-cell">{s.lastDataTs ? localStamp(s.lastDataTs) : '—'}</td>
                      <td className="num hidden whitespace-nowrap sm:table-cell">{age(s.ageMin, lang)}</td>
                      <td className="min-w-[8.5rem]">
                        <span className="inline-flex items-center gap-2 font-semibold" style={{ color: st.color }}>
                          <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: st.color }} />
                          {tr(lang, st.label, st.etiqueta)}
                        </span>
                        {/*
                          L'últim ensopec, encara que ara vagi bé.
                          És el que converteix un correu de «Run failed» en una
                          cosa que es pot mirar: el registre d'Actions caduca i
                          demana autenticació, i això no. El motiu va en català
                          (`errorReason`); el missatge cru, plegat.
                        */}
                        {(s.error || (s.lastError && s.lastErrorAt)) && (
                          <details className="mt-1 text-[11.5px] text-[var(--muted)]">
                            <summary className="cursor-pointer hover:text-[var(--ink-2)]">
                              {s.error
                                ? errorReason(s.error, lang)
                                : lang === 'es'
                                  ? <>último fallo el {localStamp(s.lastErrorAt!)}: {errorReason(s.lastError!, lang)}</>
                                  : <>últim ensopec el {localStamp(s.lastErrorAt!)}: {errorReason(s.lastError!)}</>}
                            </summary>
                            {/* El missatge cru l'escriuen els workers, en català: en
                                castellà es marca, que és el que llegeix un lector de pantalla. */}
                            <span className="mt-0.5 block break-words font-mono" lang={lang === 'es' ? 'ca' : undefined}>
                              {clip(s.error ?? s.lastError!)}
                            </span>
                          </details>
                        )}
                        {/*
                          I quan caduca la clau, si en té una que caduqui.
                          Una font que depèn d'una clau de noranta dies no està
                          «al dia» del tot si li'n queden quatre: el dia que mori,
                          el bloc desapareix de les fitxes i el web surt sencer.
                          Qui avisa a temps és el workflow setmanal; això només
                          posa la data on es pot veure sense entrar enlloc.
                        */}
                        {s.credentialExpiresAt && s.keyDaysLeft != null && (
                          <span
                            className="mt-1 block text-[11.5px]"
                            style={{ color: s.keyDaysLeft <= 45 ? 'var(--warn)' : 'var(--muted)' }}
                          >
                            {s.keyDaysLeft < 0
                              ? tr(lang, `clau caducada el ${s.credentialExpiresAt}`, `clave caducada el ${s.credentialExpiresAt}`)
                              : tr(lang,
                                `clau vàlida fins al ${s.credentialExpiresAt} · ${s.keyDaysLeft} dies`,
                                `clave válida hasta el ${s.credentialExpiresAt} · ${s.keyDaysLeft} días`)}
                          </span>
                        )}
                        {/*
                          Els dies que la font no ha publicat per a gairebé cap
                          estació. No és una avaria nostra —el worker torna a
                          demanar-ho tot cada dia— però sense això es veia només
                          a les fitxes, estació per estació.
                        */}
                        {s.gaps && s.gaps.length > 0 && (
                          <span className="mt-1 block text-[11.5px] text-[var(--warn)]">
                            {t('sense sèrie diària ', 'sin serie diaria ')}{gapRanges(s.gaps, lang)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section id="retard" title={t("Per què l'observació sempre porta retard", 'Por qué la observación siempre lleva retraso')}>
        {lang === 'es' ? (
          <div className="card prose">
            <p>
              Las estaciones de la XEMA toman lectura cada media hora, y el portal de
              datos abiertos de la Generalitat las publica con un desfase de entre{' '}
              <strong>45 y 65 minutos</strong>. Por eso cada página lleva la hora
              exacta de la lectura que muestra.
            </p>
            <h3>Validación</h3>
            <p>
              El Meteocat valida las lecturas <em>a posteriori</em>: las recientes
              llegan sin marca de validación y salen como provisionales. Un valor
              provisional puede cambiar cuando el Meteocat lo revise.
            </p>
          </div>
        ) : (
        <div className="card prose">
          <p>
            Les estacions de la XEMA prenen lectura cada mitja hora, i el portal de
            dades obertes de la Generalitat les publica amb un decalatge d&apos;entre{' '}
            <strong>45 i 65 minuts</strong>. Per això cada pàgina porta l&apos;hora
            exacta de la lectura que ensenya.
          </p>
          <h3>Validació</h3>
          <p>
            El Meteocat valida les lectures <em>a posteriori</em>: les recents
            arriben sense marca de validació i surten com a provisionals. Un valor
            provisional pot canviar quan el Meteocat el revisi.
          </p>
        </div>
        )}
      </Section>
    </article>
  );
}
