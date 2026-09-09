import type { Metadata } from 'next';
import Link from 'next/link';
import { IS_PRODUCTION, SITE_URL } from '@/lib/site';
import { PRIMARY, SECTIONS } from '@/lib/nav';
import { SiteSearch } from '@/components/SiteSearch';
import './globals.css';
import { External } from '@/components/External';
import { JsonLd, graph } from '@/components/JsonLd';
import { absolute } from '@/lib/site';

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
            name: 'El temps a Catalunya',
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
          * La capçalera porta quatre enllaços, no quinze.
          *
          * Abans n'hi havia quinze en una barra que es desbordava i
          * s'arrossegava en horitzontal. Això no és navegació: és un calaix on
          * les coses desapareixen — a partir del cinquè ningú les troba, i al
          * mòbil ni se sospita que hi són.
          *
          * Els quatre que queden són els que es consulten cada dia. La resta
          * viu al peu, agrupada, i a la portada, explicada. I si la finestra és
          * estreta, la fila **passa a la línia de sota** en comptes de
          * desplaçar-se: dues línies visibles valen més que una amagada.
          */}
        <header className="border-b border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-baseline gap-x-6 gap-y-1 px-5 py-3">
            <Link
              href="/"
              className="shrink-0 whitespace-nowrap font-semibold tracking-tight text-[var(--ink)] no-underline"
            >
              El temps
            </Link>
            <nav aria-label="Principal" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--muted)]">
              {PRIMARY.map((l) => (
                <Link key={l.href} href={l.href} className="no-underline hover:text-[var(--ink)]">
                  {l.label}
                </Link>
              ))}
            </nav>

            {/*
              * El cercador va a la capçalera, i per tant a totes les pàgines.
              *
              * És l'únic component de client del projecte. La regla de zero
              * JavaScript propi és de les pàgines territorials i segueix sent
              * certa —cap de les 4.293 fitxes en canvia—, però aquest quadre hi
              * és a totes, així que el cost s'ha de dir: el runtime de React ja
              * hi era i ja hidratava, i això hi afegeix el seu propi codi i
              * prou. El perquè i el que s'ha descartat, a `SiteSearch.tsx`.
              *
              * Sense JavaScript continua sent el formulari d'abans: Enter obre
              * `/cerca?q=…`, que és una pàgina de veritat amb la seva adreça.
              */}
            <SiteSearch />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">{children}</main>

        <footer className="mt-16 border-t border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto max-w-5xl px-5 py-10">
            {/* El mapa del lloc sencer. És aquí on han d'aparèixer les pàgines
                que no caben a dalt, agrupades pel que va a buscar la gent. */}
            <nav aria-label="Mapa del lloc" className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {SECTIONS.map((g) => (
                <div key={g.title}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
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

            {/*
              * L'atribució no és un formalisme: la CC-BY l'exigeix, i dir d'on
              * ve cada número és la millor decisió de producte del lloc.
              *
              * Abans eren sis paràgrafs seguits que ningú llegia. Ara és una
              * llista, que és el que és.
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
              </ul>

              <p className="mt-6 max-w-[70ch] text-xs leading-relaxed">
                Cada pàgina diu de quina estació surt el seu número, a quina distància
                és i a quina hora es va prendre la lectura.{' '}
                <Link href="/dades" className="text-[var(--ink-2)] no-underline hover:underline">
                  Tot això es pot llegir en JSON i en CSV
                </Link>
                . El codi és a{' '}
                <External
                  href="https://github.com/bielromani/tempscat"
                  className="text-[var(--ink-2)] no-underline hover:underline"
                >
                  GitHub
                </External>
                .
              </p>

              <p className="mt-3 max-w-[70ch] text-xs leading-relaxed">
                La predicció és orientativa. Per a decisions de seguretat, consulteu
                el Meteocat i Protecció Civil.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
