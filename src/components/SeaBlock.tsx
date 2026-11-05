import Link from 'next/link';
import { windCardinal } from '@/lib/variables';
import { ago, deName, hour, num } from '@/lib/format';
import {
  beachWord, douglas, flagReasonText, flagStyle, parseJellyfish, sourceText, FLAG_CURRENT_HOURS, FLAG_SHOW_HOURS,
  type SeaNearby,
} from '@/lib/sea';
import { getLang } from '@/lib/i18n';
import { tr, type Lang } from '@/lib/lang';
import { FlagMark, JellyfishMark } from '@/components/SeaMarks';

/**
 * El mar de un pueblo con playa.
 *
 * Dos bloques y la diferencia entre ellos escrita: arriba lo que ha visto un
 * socorrista, abajo lo que dice un modelo.
 *
 * ## La regla de la bandera
 *
 * Una bandera **caduca**, y aquí está toda la responsabilidad de este componente.
 * Por debajo de tres horas se presenta como vigente; hasta doce, como «l'últim
 * parte» con la hora delante y sin el color a toda pastilla; más allá no se
 * enseña. Nadie debe meterse al agua por una verde de anteayer.
 */
export async function SeaBlock({ sea, nom, lang: given }: { sea: SeaNearby; nom: string; lang?: Lang }) {
  const lang = given ?? await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const shown = sea.beaches.filter((b) => b.ageHours <= FLAG_SHOW_HOURS);
  const { now } = sea;

  return (
    <section>
      {shown.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((b) => {
            const style = flagStyle(b.flag, lang);
            const current = b.ageHours <= FLAG_CURRENT_HOURS;
            const jellies = parseJellyfish(b.jellyfish);
            const reason = flagReasonText(b.flagReason, lang);
            return (
              <li
                key={b.code}
                className="card"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="font-medium text-[var(--ink)]">{b.name}</span>
                  {/* Una bandera vella s'ensenya apagada: el color a tota
                      intensitat diu «ara mateix» i no ho és. */}
                  <span
                    className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--ink-2)]"
                    style={{ opacity: current ? 1 : 0.55 }}
                  >
                    <FlagMark flag={b.flag} size={20} lang={lang} />
                    {style.label}
                  </span>
                </div>

                <p className="mt-1 text-sm text-[var(--ink-2)]">
                  {style.meaning}
                  {reason && <span className="text-[var(--muted)]"> · {reason}</span>}
                </p>

                <p className="mt-1.5 text-xs text-[var(--muted)]">
                  {[
                    b.seaState && `mar ${beachWord(b.seaState, lang)}`,
                    b.temperature && t(`aigua ${b.temperature} °C`, `agua a ${b.temperature} °C`),
                    b.transparency && t(`aigua ${b.transparency}`, `agua ${beachWord(b.transparency, lang)}`),
                  ].filter(Boolean).join(' · ')}
                </p>

                {jellies.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {jellies.map((j) => (
                      <JellyfishMark key={j.species} species={j.species} amount={j.amount} size={j.size} lang={lang} />
                    ))}
                  </div>
                )}

                <p className="mt-2 text-[11px] text-[var(--muted)]">
                  {current
                    ? t(`Parte de ${hour(local(b.at))}, ${ago(b.ageHours * 60)}`, `Parte de las ${hour(local(b.at))}, ${ago(b.ageHours * 60, lang)}`)
                    : t(`Últim comunicat: ${hour(local(b.at))}, ${ago(b.ageHours * 60)}`, `Último parte: ${hour(local(b.at))}, ${ago(b.ageHours * 60, lang)}`)}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="card text-sm text-[var(--ink-2)]">
          {lang === 'es' ? (
            <>
              Ninguna playa {deName(nom, lang)} tiene parte de las últimas doce horas.
              Lo ponen los socorristas cuando están de servicio, y fuera de horario o
              de temporada no se publica ninguno nuevo.
            </>
          ) : (
            <>
              Cap platja {deName(nom)} té comunicat de les últimes
              dotze hores. Les posen els socorristes quan són de servei, i fora
              d&apos;horari o de temporada no se&apos;n publica cap de nova.
            </>
          )}
        </p>
      )}

      {now && (
        <div className="mt-3 card">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            {t('El mar, segons el model', 'El mar, según el modelo')}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {now.sst != null && (
              <div>
                <dt className="text-xs text-[var(--muted)]">{t('Aigua', 'Agua')}</dt>
                <dd className="tnum font-medium text-[var(--ink)]">{num(now.sst, 1)} °C</dd>
              </div>
            )}
            {now.waveHeight != null && (
              <div>
                <dt className="text-xs text-[var(--muted)]">{t('Onada', 'Ola')}</dt>
                <dd className="tnum font-medium text-[var(--ink)]">
                  {num(now.waveHeight, 2)} m
                  <span className="ml-1 text-[11px] font-normal text-[var(--muted)]">
                    {douglas(now.waveHeight, lang)}
                  </span>
                </dd>
              </div>
            )}
            {now.wavePeriod != null && (
              <div>
                <dt className="text-xs text-[var(--muted)]">{t('Període', 'Periodo')}</dt>
                <dd className="tnum font-medium text-[var(--ink)]">{num(now.wavePeriod, 1)} s</dd>
              </div>
            )}
            {now.waveDirection != null && (
              <div>
                <dt className="text-xs text-[var(--muted)]">{t('Direcció', 'Dirección')}</dt>
                <dd className="font-medium text-[var(--ink)]">{windCardinal(now.waveDirection)}</dd>
              </div>
            )}
          </dl>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
            {lang === 'es' ? (
              <>
                Punto de mar frente a {now.near}, a {num(now.distKm, 0)} km. Es un modelo
                de oleaje en mar abierto: no recoge las corrientes de resaca ni lo que
                pasa dentro de una cala.
              </>
            ) : (
              <>
                Punt de mar davant {now.near}, a {num(now.distKm, 0)} km. És un model
                d&apos;onatge en mar obert: no recull les corrents de ressaca ni el que
                passa dins d&apos;una cala.
              </>
            )}
          </p>
        </div>
      )}

      <p className="mt-3 measure text-xs leading-relaxed text-[var(--muted)]">
        {lang === 'es' ? (
          <>
            {sourceText(sea.source, lang)}. La bandera la pone un socorrista mirando el agua; el
            oleaje del modelo cubre las horas y los tramos donde no la hay.{' '}
          </>
        ) : (
          <>
            {sea.source}. La bandera la posa un socorrista mirant l&apos;aigua; l&apos;onatge
            del model cobreix les hores i els trams on no n&apos;hi ha.{' '}
          </>
        )}
        <Link href="/mar" className="text-[var(--ink-2)] no-underline hover:underline">
          {t('Totes les platges ›', 'Todas las playas ›')}
        </Link>
      </p>
    </section>
  );
}

/** El parte viene en UTC; se enseña en hora de aquí. */
function local(iso: string): string {
  return new Date(iso)
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .replace(' ', 'T')
    .slice(0, 16);
}
