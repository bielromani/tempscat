import type { Metadata } from 'next';
import Link from 'next/link';
import { WarningBanner } from '@/components/WarningBanner';
import { comarcaName, dateTimeLong } from '@/lib/format';
import { phenomenonName } from '@/lib/warning-labels';
import { activeWarnings, groupWarnings } from '@/lib/weather';
import { allComarques } from '@/lib/territory';

/**
 * Los avisos oficiales vigentes, por comarca.
 *
 * Las reglas de los avisos no cambian por estar en su propia página, y son las
 * mismas que en la franja de cada ficha: **colores oficiales del CAP, texto sin
 * reescribir, nivel sin ajustar, y siempre quién lo emite con enlace al
 * original.** Un aviso mal presentado no es un fallo de diseño, es un riesgo.
 *
 * Los verdes no llegan aquí: verde significa «sin aviso», y llenar la página con
 * eso restaría fuerza a los que sí importan.
 *
 * Se revalida cada cinco minutos, no cada quince como el worker. La diferencia no
 * es cosmética: en un episodio, quince minutos de retraso en una página que se
 * consulta **porque** hay un aviso son quince minutos de más.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Avisos meteorològics vigents a Catalunya',
  description:
    'Els avisos oficials de l\'AEMET en vigor ara mateix, per comarca, amb el text '
    + 'original i l\'enllaç a la font.',
  alternates: { canonical: '/avisos' },
};

export default async function AvisosPage() {
  const warnings = await activeWarnings();
  const comarques = allComarques();

  /*
   * Los grupos, y el número que se enseña es el de los grupos.
   *
   * AEMET emite un fichero por día y por zona: hoy son 18 avisos que son 7
   * situaciones. Decir «18 avisos en vigor» encima de siete tarjetas obliga al
   * lector a contar para descubrir que no cuadra.
   */
  const groups = groupWarnings(warnings);

  // Una comarca puede tener varios avisos y un aviso puede cubrir varias
  // comarcas: la relación es de muchos a muchos y viene resuelta por geometría
  // desde el worker, no por nombre de zona.
  const byComarca = comarques
    .map((c) => ({ c, list: warnings.filter((w) => w.comarcaCodis.includes(c.codi)) }))
    .filter((x) => x.list.length > 0);

  // Ya vienen ordenados por nivel descendente desde `groupWarnings()`.
  const worst = groups[0];

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Avisos</span>
      </nav>

      <header className="mb-6 max-w-[64ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Avisos oficials vigents
        </h1>
        {warnings.length === 0 ? (
          <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
            Ara mateix <strong className="font-semibold text-[var(--ink)]">no hi ha cap avís
            groc, taronja ni vermell</strong> en vigor a Catalunya.
          </p>
        ) : (
          <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
            Hi ha{' '}
            <strong className="font-semibold text-[var(--ink)]">
              {groups.length} {groups.length === 1 ? 'avís' : 'avisos'}
            </strong>{' '}
            en vigor, que {byComarca.length === 1 ? 'afecten' : 'afecten'} {byComarca.length}{' '}
            {byComarca.length === 1 ? 'comarca' : 'comarques'}.
            {worst && (
              <> El més alt és de nivell {worst.level}, per {phenomenonName(worst.phenomenon).toLowerCase()}.</>
            )}
          </p>
        )}
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Els emet l&apos;Agència Estatal de Meteorologia, que els publica en
          castellà i en anglès. El nivell, el color, la zona, l&apos;horari i el
          llindar es reprodueixen tal com surten; el text oficial va sencer a cada
          avís, en el seu idioma i amb l&apos;enllaç a l&apos;original. Per a
          decisions de seguretat, la font són l&apos;AEMET, el Meteocat i Protecció
          Civil.
        </p>
      </header>

      {warnings.length > 0 && (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Tots els avisos</h2>
            <WarningBanner warnings={groups} />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Per comarca</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {byComarca.map(({ c, list }) => (
                <li
                  key={c.codi}
                  className="rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2.5"
                >
                  <Link href={c.path} className="font-medium text-[var(--ink)] no-underline hover:underline">
                    {comarcaName(c.nom)}
                  </Link>
                  <ul className="mt-1 space-y-0.5">
                    {list.map((w) => (
                      <li key={w.id} className="text-xs text-[var(--muted)]">
                        {phenomenonName(w.phenomenon)} · nivell {w.level} · fins {dateTimeLong(
                          new Date(w.expires)
                            .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
                            .replace(' ', 'T'),
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="mt-10 max-w-[65ch]">
        <h2 className="mb-2 text-lg font-semibold tracking-tight">Rebre&apos;ls sense entrar</h2>
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          Els avisos es publiquen també com a <strong className="font-medium text-[var(--ink)]">feed</strong> i
          com a <strong className="font-medium text-[var(--ink)]">calendari</strong>, de tot Catalunya o
          d&apos;una comarca. No cal registre ni permís de notificacions, i no es
          desa cap dada de qui s&apos;hi subscriu: el fitxer el va a buscar el
          vostre lector.
        </p>
        <ul className="mt-3 space-y-1 font-mono text-xs">
          <li>
            <Link href="/avisos/feed" className="text-[var(--accent)] no-underline hover:underline">
              /avisos/feed
            </Link>{' '}
            <span className="font-sans text-[var(--muted)]">— Atom, tot Catalunya</span>
          </li>
          <li>
            <Link href="/avisos/feed/bages" className="text-[var(--accent)] no-underline hover:underline">
              /avisos/feed/{'{comarca}'}
            </Link>{' '}
            <span className="font-sans text-[var(--muted)]">— Atom d&apos;una comarca</span>
          </li>
          <li>
            <Link href="/avisos/feed?format=ics" className="text-[var(--accent)] no-underline hover:underline">
              /avisos/feed?format=ics
            </Link>{' '}
            <span className="font-sans text-[var(--muted)]">— calendari subscribible</span>
          </li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          Un avís té principi i final, així que al calendari apareix entre la
          resta de cites amb la seva finestra de vigència a escala. Els taronges
          i els vermells porten un recordatori dues hores abans; els grocs, no.
        </p>
      </section>

      <p className="mt-8 max-w-[65ch] text-xs leading-relaxed text-[var(--muted)]">
        L&apos;assignació d&apos;avisos a comarques la fem per geometria, no per nom
        de zona: els polígons de l&apos;AEMET no segueixen els límits comarcals, i
        emparellar-los pel nom donaria avisos a municipis que no en tenen. En un
        avís de seguretat, un fals positiu costa tant com un fals negatiu.
      </p>
    </article>
  );
}
