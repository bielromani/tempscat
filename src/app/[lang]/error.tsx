'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { tr } from '@/lib/lang';

/**
 * Quan una pàgina peta al servidor.
 *
 * Ha de ser un component de client —és una frontera d'errors de React, i Next
 * no en deixa fer-la d'una altra manera—, i per això és el cinquè `'use client'`
 * del projecte. Només s'executa quan hi ha un error: el que afegeix a cada
 * pàgina és el codi d'aquest fitxer i prou, sense estat ni efectes.
 *
 * Abans sortia el missatge de Next en anglès. Passa poc: les lectures del
 * magatzem tornen la còpia anterior si fallen (vegeu `cache-store.ts`), així
 * que perquè s'arribi aquí ha de fallar una altra cosa. Quan passa, el més
 * útil és tornar-ho a provar, i `retry()` torna a demanar la pàgina al servidor
 * sense haver de recarregar-ho tot.
 *
 * El missatge de l'error no s'ensenya: en producció Next el substitueix per un
 * resum, i el que serveix per trobar-lo és el `digest`, que surt als registres
 * de Vercel amb el mateix codi.
 *
 * L'idioma surt del segment `[lang]` amb `useParams()`: `getLang()` és de
 * servidor i aquí no hi arriba.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const params = useParams<{ lang?: string }>();
  const lang = params?.lang === 'es' ? 'es' : 'ca';
  const t = (ca: string, es: string) => tr(lang, ca, es);
  return (
    <article className="mx-auto max-w-2xl py-6">
      <p className="page-eyebrow">Error</p>
      <h1 className="page-title">{t('Ara mateix no podem mostrar aquesta pàgina', 'Ahora mismo no podemos mostrar esta página')}</h1>
      <p className="mt-3 text-lg text-[var(--ink-2)]">
        {t("Hi ha hagut un problema en preparar-la. Normalment es resol tornant-ho a provar al cap d'un moment.",
          'Ha habido un problema al prepararla. Normalmente se resuelve volviendo a intentarlo al cabo de un momento.')}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-[15px] font-semibold text-white hover:brightness-110"
        >
          {t('Torneu-ho a provar', 'Vuelva a intentarlo')}
        </button>
        <Link href="/" prefetch={false}>{t('Anar a la portada', 'Ir a la portada')}</Link>
      </div>
      {error.digest && (
        <p className="mt-8 text-xs text-[var(--muted)]">{t("Codi de l'error: ", 'Código del error: ')}{error.digest}</p>
      )}
    </article>
  );
}
