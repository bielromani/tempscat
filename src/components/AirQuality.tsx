import {
  airName, airShort, aqiAdvice, aqiBand, aqiLabel, pollenLevelName, pollenUnit, POLLEN_COLORS,
} from '@/lib/air-variables';
import { dateTiny, hour, num, relativeDayTiny } from '@/lib/format';
import type { AirQuality as AirQualityData } from '@/lib/weather';
import { sourceText } from '@/lib/sea';
import { getLang } from '@/lib/i18n';
import { tr, type Lang } from '@/lib/lang';

/**
 * Calidad del aire y polen.
 *
 * Tres decisiones que condicionan todo el bloque:
 *
 *  · **El color lo pone la Agencia Europea de Medio Ambiente**, no el tema. Es
 *    el mismo criterio que con los avisos del CAP: la gente ya reconoce el
 *    semáforo europeo, y sustituirlo por una escala más elegante convierte
 *    información en decoración. Igual que en el panel de temperatura, la tinta
 *    de dentro deriva del propio dato y no de los tokens, o en modo oscuro
 *    saldría gris claro sobre cian claro.
 *
 *  · **Se dice qué contaminante manda.** El índice europeo es el peor de sus
 *    subíndices, no una media, y un 62 por ozono en una tarde de julio no se
 *    parece en nada a un 62 por NO2 en hora punta. Sin esa palabra el número no
 *    sirve para decidir nada.
 *
 *  · **Se dice que el dato es de una celda de 11 km.** Es la resolución real de
 *    CAMS. Fingir un valor de calle sería inventar precisión, que es justo lo
 *    que este sitio no hace con las temperaturas.
 */

interface Props {
  air: AirQualityData;
  today: string;
  /** Si el qui crida ja el sap; si no, es demana amb `getLang()`. */
  lang?: Lang;
}

/** Barra de 24 h con el color de la banda: el perfil del día de un vistazo. */
function DayProfile({ hourly, lang }: { hourly: AirQualityData['hourly']; lang: Lang }) {
  const points = hourly.filter((h) => h.aqi != null);
  if (points.length < 6) return null;

  return (
    <div>
      <div className="flex h-9 items-end gap-px overflow-hidden rounded">
        {points.map((h) => {
          const band = aqiBand(h.aqi!);
          // La altura codifica el valor y el color la banda: dos canales para el
          // mismo dato, que es lo que hace que se lea sin consultar la leyenda.
          const height = Math.max(18, Math.min(100, (h.aqi! / 100) * 100));
          return (
            <div
              key={h.time}
              className="flex-1"
              style={{ height: `${height}%`, background: band.color }}
              title={`${hour(h.time)} · ${tr(lang, 'índex', 'índice')} ${h.aqi} · ${aqiLabel(band, lang).toLowerCase()}`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
        <span className="tnum">{hour(points[0].time)}</span>
        <span>{tr(lang, 'pròximes', 'próximas')} {points.length} h</span>
        <span className="tnum">{hour(points[points.length - 1].time)}</span>
      </div>
    </div>
  );
}

export async function AirQuality({ air, today, lang: given }: Props) {
  const lang = given ?? await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const band = air.aqi != null ? aqiBand(air.aqi) : null;

  return (
    <section>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_1fr]">
        {/* Panel del índice. Toda su tinta sale del color de la banda. */}
        <div
          className="rounded-lg p-4"
          style={band ? { background: band.color, color: band.ink } : { background: 'var(--surface-2)' }}
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ opacity: 0.75 }}>
            {t('Índex europeu', 'Índice europeo')}
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="tnum text-5xl font-semibold tracking-tight">{air.aqi ?? '—'}</span>
            <span className="text-sm font-medium">{band && aqiLabel(band, lang)}</span>
          </p>
          {air.driver && (
            <p className="mt-2 text-sm leading-snug" style={{ opacity: 0.85 }}>
              {lang === 'es'
                ? `El contaminante que lo marca: ${airName(air.driver.slug, lang).toLowerCase()}.`
                : <>Ho marca {air.driver.nom.toLowerCase()}.</>}
            </p>
          )}
          {band && (
            <p className="mt-2 text-xs leading-relaxed" style={{ opacity: 0.8 }}>{aqiAdvice(band, lang)}</p>
          )}
        </div>

        <div className="space-y-3">
          {air.pollutants.length > 0 && (
            <dl className="grid grid-cols-3 gap-x-4 gap-y-2 card text-sm sm:grid-cols-4">
              {air.pollutants.map((p) => (
                <div key={p.slug}>
                  <dt className="text-xs text-[var(--muted)]" title={lang === 'es' ? airName(p.slug, lang) : p.nom}>
                    {lang === 'es' ? airShort(p.slug, lang) : p.curt}
                  </dt>
                  <dd className="tnum font-medium text-[var(--ink)]">
                    {num(p.value, p.decimals)}
                    <span className="ml-1 text-[11px] font-normal text-[var(--muted)]">{p.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="card">
            <DayProfile hourly={air.hourly} lang={lang} />

            {air.daily.length > 1 && (
              <ul className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line-soft)] pt-3">
                {air.daily.map((d) => {
                  const b = aqiBand(d.max);
                  return (
                    <li key={d.date} className="flex items-baseline gap-1.5 text-xs">
                      <span className="text-[var(--muted)]">{relativeDayTiny(d.date, today, lang)}</span>
                      <span
                        className="tnum rounded px-1.5 py-0.5 font-semibold"
                        style={{ background: b.color, color: b.ink }}
                        title={t(
                          `Màxim de l'índex el ${dateTiny(d.date)}, cap a ${hour(d.maxHour)}`,
                          `Máximo del índice el ${dateTiny(d.date, lang)}, hacia las ${hour(d.maxHour)}`,
                        )}
                      >
                        {d.max}
                      </span>
                    </li>
                  );
                })}
                <li className="self-center text-xs text-[var(--muted)]">{t('màxim de cada dia', 'máximo de cada día')}</li>
              </ul>
            )}
          </div>
        </div>
      </div>

      {air.pollen.length > 0 && (
        <div className="mt-3 card">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{t("Pol·len a l'aire", 'Polen en el aire')}</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {air.pollen.map((p) => (
              <li key={p.slug} className="flex items-baseline gap-2">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: POLLEN_COLORS[p.level] }}
                />
                <span className="text-[var(--ink)]">{lang === 'es' ? airName(p.slug, lang) : p.nom}</span>
                <span className="text-xs text-[var(--muted)]">{pollenLevelName(p.level, lang)}</span>
                <span className="tnum text-xs text-[var(--muted)]">{num(p.value)} {pollenUnit(lang)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
            {lang === 'es' ? (
              <>
                Solo se muestran las especies que superan el umbral de presencia de
                la Red Española de Aerobiología. Los umbrales no son los mismos para
                todas: 30 granos de gramínea son muchos y 30 de olivo no lo son.
              </>
            ) : (
              <>
                Només es mostren les espècies que superen el llindar de presència de
                la Red Española de Aerobiología. Els llindars no són els mateixos per
                a totes: 30 grans de gramínia són molts i 30 d&apos;olivera no ho són.
              </>
            )}
          </p>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        {lang === 'es' ? (
          <>
            {sourceText(air.source, lang)}. Es un modelo, no una estación: el valor corresponde a una
            celda de {air.cellKm} km de lado, que es la resolución real de CAMS, y
            no a esta calle en concreto. Dato de las {hour(air.observedAt)}.
          </>
        ) : (
          <>
            {air.source}. És un model, no una estació: el valor correspon a una
            cel·la de {air.cellKm} km de costat, que és la resolució real de CAMS, i
            no a aquest carrer en concret. Dada de les {hour(air.observedAt)}.
          </>
        )}
      </p>
    </section>
  );
}
