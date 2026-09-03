import type { Metadata } from 'next';
import Link from 'next/link';
import { IS_PRODUCTION, SITE_URL } from '@/lib/site';
import { PRIMARY, SECTIONS } from '@/lib/nav';
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
              * El cercador va a la capçalera i és un formulari, no un component.
              * Sense JavaScript no hi ha suggeriments mentre s'escriu, però hi ha
              * el que importa: es pot arribar a qualsevol lloc del web des de
              * qualsevol pàgina, amb el teclat i sense carregar res.
              *
              * El text de dins deia «Cercar un poble», i era una promesa curta:
              * també s'hi troben platges, pantans, estacions i itineraris. Un
              * exemple de cada mena en diu més que una llista.
              */}
            <form
              action="/cerca"
              method="get"
              role="search"
              className="ms-auto flex min-w-0 items-center"
            >
              <label htmlFor="site-q" className="sr-only">
                Cercar un poble, una platja, un pantà o una estació
              </label>
              <input
                id="site-q"
                name="q"
                type="search"
                placeholder="Cadaqués, Sau, GR-11…"
                className="w-36 min-w-0 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:w-52 focus:border-[var(--accent)] sm:w-44"
              />
            </form>
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
                <a
                  href="https://github.com/bielromani/tempscat"
                  className="text-[var(--ink-2)] no-underline hover:underline"
                >
                  GitHub
                </a>
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
