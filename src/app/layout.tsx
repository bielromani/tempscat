import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter } from 'next/font/google';
import { Logo } from '@/components/Logo';
import { IS_PRODUCTION, SITE_URL } from '@/lib/site';
import { PRIMARY, SECTIONS } from '@/lib/nav';
import { SiteSearch } from '@/components/SiteSearch';
import './globals.css';
import { External } from '@/components/External';
import { JsonLd, graph } from '@/components/JsonLd';
import { absolute } from '@/lib/site';

/*
 * Inter, i servida pel mateix web.
 *
 * `globals.css` ja demanava «Inter Tight» des del principi, però no es carregava
 * enlloc i el navegador queia a la del sistema: Segoe UI a Windows, San
 * Francisco al Mac. Amb `next/font` el fitxer es baixa al build i surt del
 * nostre domini: cap petició a Google i cap salt de text en carregar.
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'El temps a Catalunya · tempscat',
    template: '%s',
  },
  description:
    'El temps a cada poble de Catalunya: l’observació de l’estació més propera, corregida per l’altitud, i la predicció hora a hora i a catorze dies.',
  alternates: { canonical: '/' },
  openGraph: { locale: 'ca_ES', type: 'website', siteName: 'tempscat' },
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
    <html lang="ca" className={inter.variable}>
      <body className="min-h-screen flex flex-col">
        {/*
          * Qui és aquest lloc i com s'hi busca, un cop i per a tot el web.
          *
          * Va a l'esquelet i no a la portada perquè un buscador pot entrar per
          * qualsevol de les 4.293 pàgines i sortir-ne sense passar per l'arrel:
          * declarant-ho només a la portada, la immensa majoria de les visites
          * d'un robot no ho veurien mai.
          *
          * El `SearchAction` apunta a `/cerca`, que és un `<form method="get">`
          * de veritat — o sigui que l'adreça que es promet aquí funciona tal
          * qual, sense JavaScript, i no és una declaració d'intencions.
          */}
        <JsonLd data={graph(
          {
            '@type': 'WebSite',
            name: 'tempscat',
            alternateName: 'El temps a Catalunya',
            url: absolute('/'),
            inLanguage: 'ca',
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: absolute('/cerca?q={search_term_string}'),
              },
              'query-input': 'required name=search_term_string',
            },
          },
        )} />
        {/*
          * La capçalera porta cinc enllaços, no quinze.
          *
          * Abans n'hi havia quinze en una barra que es desbordava i
          * s'arrossegava en horitzontal. Això no és navegació: és un calaix on
          * les coses desapareixen. Els cinc que queden són els que es
          * consulten cada dia; la resta viu al peu, agrupada, i a la portada.
          *
          * No porta fons: va damunt del cel de la pàgina, i a les fitxes, damunt
          * del cel del lloc (ver `body:has([data-hero])` a `globals.css`).
          */}
        <header className="site-top">
          <div className="mx-auto flex h-16 max-w-[70rem] items-center gap-x-6 px-5">
            <Link href="/" aria-label="tempscat, a la portada" className="shrink-0 no-underline">
              <Logo id="top" />
            </Link>

            {/*
              Els enllaços, **només quan hi caben**. Al mòbil viuen dins del
              desplegable i la fila té tres peces: la marca, el cercador i el
              menú.
            */}
            <nav aria-label="Principal" className="site-nav hidden md:flex">
              {PRIMARY.map((l) => (
                <Link key={l.href} href={l.href}>{l.label}</Link>
              ))}
            </nav>

            {/*
              * El cercador va a la capçalera, i per tant a totes les pàgines.
              *
              * És un component de client, i el cost es va mesurar abans de
              * posar-lo —el perquè és a `SiteSearch.tsx`—. Sense JavaScript
              * continua sent un formulari: Enter obre `/cerca?q=…`.
              */}
            <SiteSearch />

            {/*
              El menú, **sense una línia de JavaScript**: és un `<details>` i
              l'obre el navegador. Només al mòbil, on els enllaços no hi caben.
            */}
            <details className="menu relative shrink-0 md:hidden">
              <summary
                aria-label="Menú"
                className="flex size-10 cursor-pointer items-center justify-center rounded-full text-[var(--ink)]"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </summary>
              <nav aria-label="Seccions" className="menu-panel">
                <ul className="m-0 list-none p-0">
                  {PRIMARY.map((l) => (
                    <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
                  ))}
                  <li><Link href="/cerca">Cercar un lloc</Link></li>
                </ul>
              </nav>
            </details>
          </div>
        </header>

        <main className="mx-auto w-full flex-1 px-5 py-8">{children}</main>

        <footer className="site-foot">
          <div className="mx-auto max-w-[70rem] px-5 py-12">
            <div className="grid gap-10 lg:grid-cols-[1.4fr_3fr]">
              <div>
                <Link href="/" aria-label="tempscat, a la portada" className="no-underline">
                  <Logo id="foot" />
                </Link>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
                  El temps de cada poble de Catalunya, amb la seva altitud i
                  l&apos;estació que el mesura.
                </p>
              </div>
              {/* El mapa del lloc sencer: aquí hi ha les pàgines que no caben a dalt. */}
              <nav aria-label="Mapa del lloc" className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                {SECTIONS.map((g) => (
                  <div key={g.title}>
                    <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {g.title}
                    </h2>
                    <ul className="space-y-1.5">
                      {g.links.map((l) => (
                        <li key={l.href}>
                          <Link href={l.href} className="text-sm text-[var(--ink-2)] no-underline hover:text-[var(--ink)]">
                            {l.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </nav>
            </div>

            {/*
              * L'atribució no és un formalisme: la CC-BY l'exigeix, i dir d'on
              * ve cada número és la millor decisió de producte del lloc.
              */}
            <div className="mt-10 border-t border-[var(--line-soft)] pt-6 text-sm text-[var(--muted)]">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide">D&apos;on surten les dades</h2>
              <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
                <li>
                  <strong className="font-medium text-[var(--ink-2)]">Meteocat (XEMA)</strong> — observació de
                  189 estacions, via dades obertes de la Generalitat
                </li>
                <li>
                  <strong className="font-medium text-[var(--ink-2)]">Open-Meteo</strong> — predicció multimodel,
                  CC-BY 4.0
                </li>
                <li>
                  <strong className="font-medium text-[var(--ink-2)]">AEMET</strong> — avisos oficials en format CAP
                </li>
                <li>
                  <strong className="font-medium text-[var(--ink-2)]">Agència Catalana de l&apos;Aigua</strong> —
                  embassaments, cabals i sequera
                </li>
                <li>
                  <strong className="font-medium text-[var(--ink-2)]">CAMS Europa</strong> i{' '}
                  <strong className="font-medium text-[var(--ink-2)]">XVPCA</strong> — qualitat de l&apos;aire
                </li>
                <li>
                  <strong className="font-medium text-[var(--ink-2)]">RainViewer</strong> — tessel·les de radar
                </li>
                <li>
                  <strong className="font-medium text-[var(--ink-2)]">Protecció Civil</strong> i socorristes —
                  banderes de platja
                </li>
                <li>
                  <strong className="font-medium text-[var(--ink-2)]">ICGC</strong> — límits administratius i
                  topònims
                </li>
                <li>
                  <strong className="font-medium text-[var(--ink-2)]">Meteocons</strong>, de Bas Milius — icones
                  del temps, llicència MIT
                </li>
              </ul>

              <p className="mt-6 max-w-2xl text-xs leading-relaxed">
                Cada pàgina diu de quina estació surt el seu número, a quina distància
                és i a quina hora es va prendre la lectura.{' '}
                <Link href="/dades" className="text-[var(--ink-2)] no-underline hover:underline">
                  Tot es pot llegir en JSON i en CSV
                </Link>
                . El codi és a{' '}
                <External
                  href="https://github.com/bielromani/tempscat"
                  className="text-[var(--ink-2)] no-underline hover:underline"
                >
                  GitHub
                </External>
                . La predicció és orientativa: per a decisions de seguretat,
                consulteu el Meteocat i Protecció Civil.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
