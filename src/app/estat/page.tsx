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
};

function age(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} dies`;
}

export default function EstatPage() {
  const sources = freshness();
  const summary = buildSummary() as { builtAt: string; indexablePages: number; nomenclatorEdition: string };

  return (
    <article className="max-w-[68ch]">
      <h1 className="text-3xl font-semibold tracking-tight">Estat de les dades</h1>
      <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
        Aquesta pàgina diu quan es va actualitzar cada font per última vegada,
        encara que la resposta sigui incòmoda. Amagar que una dada porta hores
        aturada no la fa més fresca: només fa que l&apos;usuari ho descobreixi
        pel seu compte i deixi de fiar-se de tota la resta.
      </p>

      {sources.length === 0 ? (
        <p className="mt-8 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
          Encara no s&apos;ha executat cap ingesta.
        </p>
      ) : (
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
                    {s.error ? (
                      <span className="font-medium" style={{ color: 'var(--bad)' }}>error</span>
                    ) : s.stale ? (
                      <span className="font-medium" style={{ color: 'var(--warn)' }}>endarrerida</span>
                    ) : (
                      <span className="font-medium" style={{ color: 'var(--good)' }}>al dia</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
        El Meteocat valida les lectures <em>a posteriori</em>. Les dades recents
        arriben sense marca de validació, i les etiquetem com a provisionals.
        Filtrar-les deixaria el web sense cap dada actual; presentar-les com a
        definitives seria fals.
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
