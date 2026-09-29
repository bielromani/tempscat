import type { Metadata } from 'next';
import { freshness } from '@/lib/weather';
import { buildSummary } from '@/lib/territory';

export const revalidate = 300;

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

export default async function EstatPage() {
  const sources = await freshness();
  const summary = buildSummary() as { builtAt: string; indexablePages: number; nomenclatorEdition: string };

  return (
    <article data-wide className="measure">
      <h1 className="page-title">Estat de les dades</h1>
      <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
        Quan es va actualitzar cada font per última vegada, i quina antiguitat
        té la dada més recent que en tenim, en hora de Catalunya. Serveix per saber, abans de fiar-se
        d&apos;una xifra del lloc, si la font que hi ha al darrere està al dia.
      </p>

      {/* Sempre les nou fonts: una que no hagi publicat mai ha de sortir
          dient-ho, no desapareixer del panel. Veure src/lib/shards.ts. */}
        <div className="scroll-x mt-8">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Font</th>
                <th className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Dada més recent</th>
                <th className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Antiguitat</th>
                <th className="border-b border-[var(--line)] py-2 font-semibold">Estat</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source} className="border-b border-[var(--line-soft)]">
                  <td className="py-2.5 pr-4 text-[var(--ink)]">{LABELS[s.source] ?? s.source}</td>
                  <td className="tnum py-2.5 pr-4 text-[var(--ink-2)]">
                    {s.lastDataTs ? localStamp(s.lastDataTs) : '—'}
                  </td>
                  <td className="tnum py-2.5 pr-4 text-[var(--ink-2)]">{age(s.ageMin)}</td>
                  <td className="py-2.5">
                    {s.missing ? (
                      <span className="font-medium" style={{ color: 'var(--muted)' }}>mai executada</span>
                    ) : s.error ? (
                      <span className="font-medium" style={{ color: 'var(--bad)' }}>error</span>
                    ) : s.stale ? (
                      <span className="font-medium" style={{ color: 'var(--warn)' }}>endarrerida</span>
                    ) : (
                      <span className="font-medium" style={{ color: 'var(--good)' }}>al dia</span>
                    )}
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
                      <details className="mt-0.5 text-[11px] text-[var(--muted)]">
                        <summary className="cursor-pointer">
                          últim ensopec el {localStamp(s.lastErrorAt)}
                        </summary>
                        <span className="mt-0.5 block font-mono">{s.lastError.slice(0, 200)}</span>
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
                        className="mt-0.5 block text-[11px]"
                        style={{ color: s.keyDaysLeft <= 45 ? 'var(--warn)' : 'var(--muted)' }}
                      >
                        {s.keyDaysLeft < 0
                          ? `clau caducada el ${s.credentialExpiresAt}`
                          : `clau vàlida fins al ${s.credentialExpiresAt} · ${s.keyDaysLeft} dies`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      <h2 className="mt-10 card-title">Per què l&apos;observació sempre porta retard</h2>
      <p className="mt-2 leading-relaxed text-[var(--ink-2)]">
        Les estacions de la XEMA prenen lectura cada mitja hora, i el portal de
        dades obertes de la Generalitat les publica amb un decalatge que hem
        mesurat entre <strong className="font-medium text-[var(--ink)]">45 i 65 minuts</strong>.
        És el temps que triga la lectura a arribar al portal. Per això cada
        pàgina porta l&apos;hora exacta de la lectura que ensenya.
      </p>

      <h2 className="mt-8 card-title">Validació</h2>
      <p className="mt-2 leading-relaxed text-[var(--ink-2)]">
        El Meteocat valida les lectures <em>a posteriori</em>, així que les dades
        recents arriben sense marca de validació i surten etiquetades com a
        provisionals. Un valor provisional pot canviar quan el Meteocat el
        revisi.
      </p>

      <h2 className="mt-8 card-title">Territori</h2>
      <p className="mt-2 leading-relaxed text-[var(--ink-2)]">
        {summary.indexablePages.toLocaleString('ca-ES')} rutes territorials,
        construïdes a partir del Nomenclàtor estadístic (edició {summary.nomenclatorEdition}),
        els límits administratius de l&apos;ICGC i les metadades de la XEMA.
        Última construcció: {summary.builtAt.slice(0, 10)}.
      </p>
    </article>
  );
}
