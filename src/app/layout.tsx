import type { Metadata } from 'next';
import Link from 'next/link';
import { IS_PRODUCTION, SITE_URL } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'El temps a Catalunya, poble a poble',
    template: '%s',
  },
  description:
    'Predicció i observació real per a totes les comarques, municipis i nuclis de població de Catalunya, amb dades del Meteocat i consens multimodel.',
  alternates: { canonical: '/' },
  openGraph: { locale: 'ca_ES', type: 'website', siteName: 'El temps a Catalunya' },
  /*
   * Un preview no se indexa. Vercel da una URL nueva a cada despliegue de
   * prueba, y sin esto acabarías con cuarenta copias del sitio compitiendo
   * entre ellas y con la de verdad.
   */
  robots: IS_PRODUCTION
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto flex max-w-5xl items-baseline gap-5 px-5 py-3">
            <Link href="/" className="shrink-0 font-semibold tracking-tight no-underline text-[var(--ink)] whitespace-nowrap">
              El temps
            </Link>
            {/* En móvil los cuatro enlaces no caben y se partían en tres líneas
                cada uno. Se desplazan en horizontal dentro de su caja, que es lo
                que hace el resto del contenido ancho del sitio. */}
            <nav className="scroll-x flex gap-5 whitespace-nowrap text-sm text-[var(--muted)]">
              <Link href="/" className="no-underline hover:text-[var(--ink)]">Comarques</Link>
              <Link href="/radar" className="no-underline hover:text-[var(--ink)]">Radar</Link>
              <Link href="/avisos" className="no-underline hover:text-[var(--ink)]">Avisos</Link>
              <Link href="/ranquings" className="no-underline hover:text-[var(--ink)]">Rànquings</Link>
              <Link href="/estacions" className="no-underline hover:text-[var(--ink)]">Estacions</Link>
              <Link href="/mar" className="no-underline hover:text-[var(--ink)]">Mar</Link>
              <Link href="/aigua" className="no-underline hover:text-[var(--ink)]">Aigua</Link>
              <Link href="/neu" className="no-underline hover:text-[var(--ink)]">Neu</Link>
              <Link href="/aire" className="no-underline hover:text-[var(--ink)]">Aire</Link>
              <Link href="/bolets" className="no-underline hover:text-[var(--ink)]">Bolets</Link>
              <Link href="/dades" className="no-underline hover:text-[var(--ink)]">Dades obertes</Link>
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
              Embassaments, cabals i sequera: <strong className="font-medium text-[var(--ink-2)]">Agència Catalana de l&apos;Aigua</strong>.
              Banderes de platja: socorristes i ajuntaments, via el portal de dades obertes.
            </p>
            <p>
              Qualitat de l&apos;aire i pol·len: <strong className="font-medium text-[var(--ink-2)]">CAMS Europa</strong>,
              del servei Copernicus, via Open-Meteo · mesures de la <strong className="font-medium text-[var(--ink-2)]">XVPCA</strong>. Radar de precipitació: <strong className="font-medium text-[var(--ink-2)]">RainViewer</strong>.
            </p>
            <p>
              Límits administratius i topònims: <strong className="font-medium text-[var(--ink-2)]">Institut Cartogràfic i Geològic de Catalunya</strong>.
            </p>
            <p>
              Tot això es pot llegir en JSON i en CSV:{' '}
              <Link href="/dades" className="text-[var(--ink-2)] no-underline hover:underline">
                dades obertes
              </Link>.
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
