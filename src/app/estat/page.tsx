import type { Metadata } from 'next';
import { freshness } from '@/lib/weather';
import { buildSummary } from '@/lib/territory';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';

/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Estat de les dades',
  description: 'Quan es va actualitzar per última vegada cada font de dades del web.',
  alternates: { canonical: '/estat' },
};

const LABELS: Record<string, string> = {
  'xema-observations': 'Observació XEMA (Meteocat)',
  'forecast-refresh': 'Predicció (Open-Meteo)',
  'aemet-warnings': 'Avisos oficials (AEMET)',
  'xema-history': 'Rècords i normals (XEMA)',
  'air-quality': 'Qualitat de l’aire i pol·len (CAMS)',
  'radar': 'Radar de precipitació (RainViewer)',
  'forecast-field': 'Camp de vent del mapa (Open-Meteo)',
  'forecast-verify': 'Encert dels models, comprovat contra la XEMA',
  'water': 'Embassaments, cabals i sequera (ACA)',
  'air-stations': 'Qualitat de l’aire mesurada (XVPCA)',
  'sea': 'Banderes de platja i onatge',
  'cameras': 'Càmeres de muntanya (FGC)',
  'fgc-mountain': 'Neu i obertura d’estacions (FGC)',
};

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

function age(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} dies`;
}

type Source = Awaited<ReturnType<typeof freshness>>[number];
type State = 'missing' | 'error' | 'stale' | 'ok';

const stateOf = (s: Source): State =>
  s.missing ? 'missing' : s.error ? 'error' : s.stale ? 'stale' : 'ok';

const STATE: Record<State, { label: string; color: string }> = {
  missing: { label: 'mai executada', color: 'var(--muted)' },
  error: { label: 'error', color: 'var(--bad)' },
  stale: { label: 'endarrerida', color: 'var(--warn)' },
  ok: { label: 'al dia', color: 'var(--good)' },
};

/** Els noms de les fonts d'una llista, per a l'entradilla. */
const names = (list: Source[]) => list.map((s) => LABELS[s.source] ?? s.source).join(', ');

export default async function EstatPage() {
  const sources = await freshness();
  const summary = buildSummary() as { builtAt: string; indexablePages: number; nomenclatorEdition: string };

  const by = (st: State) => sources.filter((s) => stateOf(s) === st);
  const ok = by('ok');
  const stale = by('stale');
  const failed = by('error');
  const missing = by('missing');

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Estat de les dades', path: '/estat' },
  ];

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Les fonts del web"
        icon="barometer"
        title="Estat de les dades"
        lead={(
          <>
            {ok.length === sources.length
              ? <>Les <strong>{sources.length} fonts</strong> estan al dia.</>
              : <><strong>{ok.length} de les {sources.length} fonts</strong> estan al dia.</>}
            {stale.length > 0 && <> {stale.length === 1 ? 'Va endarrerida' : 'Van endarrerides'}: {names(stale)}.</>}
            {failed.length > 0 && <> Amb error: {names(failed)}.</>}
          </>
        )}
        stats={[
          { label: 'Al dia', value: String(ok.length), sub: `de ${sources.length} fonts` },
          { label: 'Endarrerides', value: String(stale.length) },
          { label: 'Amb error', value: String(failed.length) },
          missing.length > 0 && { label: 'Mai executades', value: String(missing.length) },
        ]}
        note={(
          <>
            Quan es va actualitzar cada font i quina antiguitat té la dada més
            recent, en hora de Catalunya. Abans de fiar-vos d&apos;una xifra, mireu
            si la font que hi ha al darrere està al dia.
          </>
        )}
        aside={(
          <section className="card" aria-label="Territori">
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/barometer.svg" width={22} height={22} alt="" />
              Territori
            </p>
            <ul className="rows">
              <li>
                <span className="row-main"><span className="row-title">Rutes territorials</span></span>
                <span className="row-value">{summary.indexablePages.toLocaleString('ca-ES')}</span>
              </li>
              <li>
                <span className="row-main"><span className="row-title">Nomenclàtor estadístic</span></span>
                <span className="row-value">edició {summary.nomenclatorEdition}</span>
              </li>
              <li>
                <span className="row-main"><span className="row-title">Última construcció</span></span>
                <span className="row-value">{summary.builtAt.slice(0, 10)}</span>
              </li>
            </ul>
            <p className="source">
              Construïdes a partir del Nomenclàtor, els límits administratius de
              l&apos;ICGC i les metadades de la XEMA.
            </p>
          </section>
        )}
      />

      {/* Sempre les tretze fonts: una que no hagi publicat mai ha de sortir
          dient-ho, no desaparèixer del panell. Veure src/lib/shards.ts. */}
      <Section id="fonts" title="Font per font">
        <div className="card">
          <div className="scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Font</th>
                  <th scope="col" className="hidden sm:table-cell">Dada més recent</th>
                  <th scope="col" className="num hidden sm:table-cell">Antiguitat</th>
                  <th scope="col">Estat</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const st = STATE[stateOf(s)];
                  return (
                    <tr key={s.source}>
                      <td className="sm:min-w-[11rem]">
                        <span className="font-medium text-[var(--ink)]">{LABELS[s.source] ?? s.source}</span>
                        {/* Al mòbil les quatre columnes no hi caben i l'estat quedava
                            fora de la pantalla: la data i l'antiguitat van aquí, a sota
                            del nom, i les seves columnes s'amaguen. */}
                        <span className="tnum mt-0.5 block text-xs text-[var(--muted)] sm:hidden">
                          <span className="whitespace-nowrap">{s.lastDataTs ? localStamp(s.lastDataTs) : '—'}</span>
                          {' · '}<span className="whitespace-nowrap">{age(s.ageMin)}</span>
                        </span>
                      </td>
                      <td className="tnum hidden whitespace-nowrap sm:table-cell">{s.lastDataTs ? localStamp(s.lastDataTs) : '—'}</td>
                      <td className="num hidden whitespace-nowrap sm:table-cell">{age(s.ageMin)}</td>
                      <td className="min-w-[8.5rem]">
                        <span className="inline-flex items-center gap-2 font-semibold" style={{ color: st.color }}>
                          <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: st.color }} />
                          {st.label}
                        </span>
                        {/*
                          L'ultim ensopec, encara que ara vagi be.
                          Es el que converteix un correu de «Run failed» en una
                          cosa que es pot mirar: el registre d'Actions caduca i
                          demana autenticacio, i aixo no.
                        */}
                        {/*
                          El missatge és el del worker, en l'idioma de la llibreria
                          que ha fallat —«fetch failed», «Fallo tras 5 intentos»—, i
                          no li diu res a qui mira si la font està al dia. Va plegat:
                          qui el necessita per saber què va passar l'obre.
                        */}
                        {!s.error && s.lastError && s.lastErrorAt && (
                          <details className="mt-1 text-[11.5px] text-[var(--muted)]">
                            <summary className="cursor-pointer hover:text-[var(--ink-2)]">
                              últim ensopec el {localStamp(s.lastErrorAt)}
                            </summary>
                            <span className="mt-0.5 block break-words font-mono">{s.lastError.slice(0, 200)}</span>
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
                              ? `clau caducada el ${s.credentialExpiresAt}`
                              : `clau vàlida fins al ${s.credentialExpiresAt} · ${s.keyDaysLeft} dies`}
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

      <Section id="retard" title="Per què l'observació sempre porta retard">
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
      </Section>
    </article>
  );
}
