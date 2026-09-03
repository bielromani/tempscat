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
  'water': 'Embassaments, cabals i sequera (ACA)',
  'air-stations': 'Qualitat de l’aire mesurada (XVPCA)',
  'sea': 'Banderes de platja i onatge',
  'cameras': 'Càmeres de muntanya (FGC)',
  'fgc-mountain': 'Neu i obertura d’estacions (FGC)',
};

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
    <article className="max-w-[68ch]">
      <h1 className="text-3xl font-semibold tracking-tight">Estat de les dades</h1>
      <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
        Quan es va actualitzar cada font per última vegada, i quina antiguitat
        té la dada més recent que en tenim. Serveix per saber, abans de fiar-se
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
                    {s.lastDataTs ? s.lastDataTs.slice(0, 16).replace('T', ' ') : '—'}
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
                    {!s.error && s.lastError && s.lastErrorAt && (
                      <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                        últim ensopec el {s.lastErrorAt.slice(0, 16).replace('T', ' ')}:{' '}
                        {s.lastError.slice(0, 90)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      <h2 className="mt-10 text-lg font-semibold tracking-tight">Per què l&apos;observació sempre porta retard</h2>
      <p className="mt-2 leading-relaxed text-[var(--ink-2)]">
        Les estacions de la XEMA prenen lectura cada mitja hora, i el portal de
        dades obertes de la Generalitat les publica amb un decalatge que hem
        mesurat entre <strong className="font-medium text-[var(--ink)]">45 i 65 minuts</strong>.
        No és un problema nostre ni el podem escurçar: és el temps que triga la
        dada a arribar-hi. Per això cada pàgina diu l&apos;hora exacta de la
        lectura en comptes de fer veure que és d&apos;ara mateix.
      </p>

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Validació</h2>
      <p className="mt-2 leading-relaxed text-[var(--ink-2)]">
        El Meteocat valida les lectures <em>a posteriori</em>, així que les dades
        recents arriben sense marca de validació i surten etiquetades com a
        provisionals. Un valor provisional pot canviar quan el Meteocat el
        revisi.
      </p>

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Territori</h2>
      <p className="mt-2 leading-relaxed text-[var(--ink-2)]">
        {summary.indexablePages.toLocaleString('ca-ES')} rutes territorials,
        construïdes a partir del Nomenclàtor estadístic (edició {summary.nomenclatorEdition}),
        els límits administratius de l&apos;ICGC i les metadades de la XEMA.
        Última construcció: {summary.builtAt.slice(0, 10)}.
      </p>
    </article>
  );
}
