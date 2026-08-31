import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://meteo.example'),
  title: {
    default: 'El temps a Catalunya, poble a poble',
    template: '%s',
  },
  description:
    'Predicció i observació real per a totes les comarques, municipis i nuclis de població de Catalunya, amb dades del Meteocat i consens multimodel.',
  alternates: { canonical: '/' },
  openGraph: { locale: 'ca_ES', type: 'website' },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto flex max-w-5xl items-baseline gap-6 px-5 py-3">
            <Link href="/" className="font-semibold tracking-tight no-underline text-[var(--ink)]">
              El temps
            </Link>
            <nav className="flex gap-5 text-sm text-[var(--muted)]">
              <Link href="/" className="no-underline hover:text-[var(--ink)]">Comarques</Link>
              <Link href="/estat" className="no-underline hover:text-[var(--ink)]">Estat de les dades</Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">{children}</main>

        <footer className="mt-16 border-t border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto max-w-5xl px-5 py-8 text-sm text-[var(--muted)] space-y-2">
            {/* La atribución no es un formalismo: CC-BY la exige, y decir de
                dónde viene cada número es además la mejor decisión de producto
                del sitio. */}
            <p>
              Observacions: <strong className="font-medium text-[var(--ink-2)]">Servei Meteorològic de Catalunya (XEMA)</strong>,
              via el portal de dades obertes de la Generalitat.
            </p>
            <p>
              Predicció: <strong className="font-medium text-[var(--ink-2)]">Open-Meteo</strong> (CC-BY 4.0) ·
              models AROME, HARMONIE i ECMWF. Altituds del model digital Copernicus GLO-90.
            </p>
            <p>
              Límits administratius i topònims: <strong className="font-medium text-[var(--ink-2)]">Institut Cartogràfic i Geològic de Catalunya</strong>.
            </p>
            <p className="pt-2 text-xs">
              La predicció és orientativa. Per a decisions de seguretat, consulteu
              el Meteocat i Protecció Civil.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
