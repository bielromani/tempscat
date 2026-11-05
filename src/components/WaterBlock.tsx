import Link from 'next/link';
import { dateFull, deName, num, signed } from '@/lib/format';
import { droughtLevel, gaugeName, reservoirColor, reservoirTitle, type WaterNearby } from '@/lib/water';
import { sourceText } from '@/lib/sea';
import { getLang } from '@/lib/i18n';
import { tr, type Lang } from '@/lib/lang';

/**
 * El agua cerca de este pueblo.
 *
 * Aparece solo cuando hay algo que decir: un aforo o un embalse a menos de 25 km,
 * o un estado de sequía distinto de normalidad. En un pueblo de la conca del
 * Segre no sale nada, y es correcto — esos datos son de la Confederación
 * Hidrográfica del Ebro y no los tenemos.
 *
 * El estado de sequía **normal no se muestra**: lo tienen 628 de los 630
 * municipios del registro, y una línea idéntica en todas las páginas deja de
 * leerse. Cuando cambia se ve, que es cuando importa.
 */
export async function WaterBlock({ water, nom, lang: given }: { water: WaterNearby; nom: string; lang?: Lang }) {
  const lang = given ?? await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const { reservoir, river, drought } = water;

  /*
   * Un aforament pot estar **al mateix embassament**, i sis ho estan.
   *
   * A la Morera de Montsant la fitxa ensenyava «Embassament de Siurana
   * (Cornudella de Montsant)» dues vegades seguides, sota dos titols diferents:
   * una amb el percentatge de reserva i l'altra amb el cabal. Son dues mesures
   * distintes i les dues valen, pero repetir el nom fa que sembli un error.
   */
  const gauge = river ? gaugeName(river.name) : null;
  const sameSpot = !!(reservoir && gauge && gauge === reservoir.name);

  return (
    <section>
      {drought && (
        <div
          className="mb-3 rounded-lg p-4"
          style={{
            background: droughtLevel(drought.hydro).color,
            color: droughtLevel(drought.hydro).ink,
          }}
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ opacity: 0.8 }}>
            {t('Estat de sequera', 'Estado de sequía')}
          </p>
          <p className="mt-0.5 text-lg font-semibold">{droughtLevel(drought.hydro, lang).label}</p>
          <p className="mt-1 text-sm" style={{ opacity: 0.9 }}>
            {drought.unit} · {t('declarat el', 'declarado el')} {dateFull(drought.since, lang)}
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {reservoir && (
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              {t("L'embassament més proper", 'El embalse más cercano')}
            </p>
            <p className="mt-0.5 font-medium text-[var(--ink)]">{reservoirTitle(reservoir.name, lang)}</p>
            <p className="mt-2 flex items-baseline gap-3">
              <span className="tnum text-3xl font-semibold text-[var(--ink)]">
                {num(reservoir.pct, 1)} %
              </span>
              {reservoir.pct != null && reservoir.pct30d != null
                && Math.abs(reservoir.pct - reservoir.pct30d) >= 0.1 && (
                <span
                  className="tnum text-xs"
                  style={{ color: reservoir.pct < reservoir.pct30d ? 'var(--bad)' : 'var(--good)' }}
                >
                  {signed(reservoir.pct - reservoir.pct30d, 1)} {t('en 30 dies', 'en 30 días')}
                </span>
              )}
            </p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(1, Math.min(100, reservoir.pct ?? 0))}%`,
                  background: reservoirColor(reservoir.pct ?? 0),
                }}
              />
            </div>
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              <span className="tnum">{num(reservoir.volumeHm3, 1)} hm³</span> ·{' '}
              a <span className="tnum">{num(reservoir.distKm, 0)} km</span>{' '}
              {deName(nom, lang)}
            </p>
          </div>
        )}

        {river && (
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              {t("L'aforament més proper", 'La estación de aforo más cercana')}
            </p>
            <p className="mt-0.5 font-medium text-[var(--ink)]">
              {sameSpot ? t('Al mateix embassament', 'En el mismo embalse') : gauge}
            </p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="tnum text-3xl font-semibold text-[var(--ink)]">
                {num(river.flow, 2)}
              </span>
              <span className="text-sm text-[var(--muted)]">m³/s</span>
            </p>
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              {river.subbasin || river.basin} · a{' '}
              <span className="tnum">{num(river.distKm, 0)} km</span>
              {river.levelM != null && <> · {t('nivell', 'nivel')} <span className="tnum">{num(river.levelM, 2)} m</span></>}
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 measure text-xs leading-relaxed text-[var(--muted)]">
        {lang === 'es' ? (
          <>
            {sourceText(water.source, lang)}. Son las estaciones más cercanas en 25 km, no
            necesariamente el río que pasa por el pueblo: los aforos están donde hay
            instrumentación, no donde hay núcleos.
            {!water.droughtCovered && (
              <> Este municipio no aparece en el registro de sequía de la ACA, que solo
                cubre las cuencas internas.</>
            )}{' '}
          </>
        ) : (
          <>
            {water.source}. Són les estacions més properes dins de 25 km, no
            necessàriament el riu que passa pel poble: els aforaments estan on hi ha
            instrumentació, no on hi ha nuclis.
            {!water.droughtCovered && (
              <> Aquest municipi no surt al registre de sequera de l&apos;ACA, que només
                cobreix les conques internes.</>
            )}{' '}
          </>
        )}
        <Link href="/aigua" className="text-[var(--ink-2)] no-underline hover:underline">
          {t('Tots els embassaments i rius ›', 'Todos los embalses y ríos ›')}
        </Link>
      </p>
    </section>
  );
}
