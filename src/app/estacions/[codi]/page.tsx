import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClimateBlock } from '@/components/ClimateBlock';
import { WindRose } from '@/components/WindRose';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { msToKmh, windCardinal } from '@/lib/variables';
import {
  aName, ago, dateFull, deName, int, num, signed, temp,
} from '@/lib/format';
import { historyOfStation, localToday, observationOfStation } from '@/lib/weather';
import { operativeStations, stationByCodi } from '@/lib/territory';

/**
 * Ficha de estación. 189 rutas operativas.
 *
 * Publica datos que ya estaban descargados y que no se veían en ninguna parte:
 * `xema-history.json` lleva desde el principio los récords absolutos, las
 * normales mes a mes calculadas sobre la propia serie, los contadores del año y
 * los últimos 45 días — y todo eso solo asomaba, resumido, dentro de la ficha de
 * un municipio.
 *
 * La diferencia entre esta página y la de un municipio es una y hay que decirla:
 * **aquí no hay ninguna corrección**. Es la lectura del termómetro, en su cota y
 * en su emplazamiento. En una ficha de pueblo la temperatura viene corregida por
 * el desnivel; aquí no hace falta corregir nada porque el dato es de este punto
 * exacto.
 */
export const dynamicParams = false;
export const revalidate = 1800;

type Params = Promise<{ codi: string }>;

export async function generateStaticParams() {
  return operativeStations().map((s) => ({ codi: s.codi }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { codi } = await params;
  const s = stationByCodi(codi);
  if (!s) return {};
  return {
    title: `Estació de ${s.nom} · ${s.comarcaNom ?? 'Catalunya'}`,
    description: `Dades de l'estació automàtica ${deName(s.nom)} (XEMA, codi ${s.codi}), `
      + `a ${s.altitud != null ? `${Math.round(s.altitud)} m` : 'cota desconeguda'}: `
      + 'rècords, normals mensuals, rosa dels vents i els últims 45 dies.',
    alternates: { canonical: `/estacions/${s.codi}` },
  };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2.5">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{children}</p>
    </div>
  );
}

export default async function EstacioPage({ params }: { params: Params }) {
  const { codi } = await params;
  const station = stationByCodi(codi);
  if (!station || !station.operativa) notFound();

  const history = await historyOfStation(station.codi);
  const obs = await observationOfStation(station.codi);
  const today = localToday();
  const month = Number(today.slice(5, 7));

  const t = obs?.values.temperature?.value ?? null;
  const wind = obs?.values.wind_speed?.value ?? null;
  const gust = obs?.values.wind_gust?.value ?? null;
  const dir = obs?.values.wind_direction?.value ?? null;

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <Link href="/estacions" className="no-underline hover:text-[var(--ink)]">Estacions</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">{station.nom}</span>
      </nav>

      <header className="mb-5">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{station.nom}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Estació automàtica de la XEMA · codi {station.codi}
          {station.altitud != null && ` · ${int(station.altitud)} m`}
          {station.comarcaNom && ` · ${station.comarcaNom}`}
        </p>
        {station.emplacament && (
          <p className="mt-0.5 text-sm text-[var(--muted)]">{station.emplacament}</p>
        )}
      </header>

      {/* Lectura actual, sin corregir: aquí el dato es de este punto exacto. */}
      {obs && t != null && (
        <section
          className="rounded-lg p-5"
          style={{
            background: `linear-gradient(135deg, ${temperatureColor(t)} 0%, ${temperatureColor(t - 3)} 100%)`,
            color: temperatureInk(t),
          }}
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ opacity: 0.75 }}>
            Última lectura
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="tnum text-5xl font-semibold tracking-tight">{num(t, 1)}</span>
            <span className="text-xl" style={{ opacity: 0.75 }}>°C</span>
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            {obs.today?.tMax != null && (
              <div>
                <dt style={{ opacity: 0.7 }}>Màxima d&apos;avui</dt>
                <dd className="tnum font-medium">{temp(obs.today.tMax)}</dd>
              </div>
            )}
            {obs.today?.tMin != null && (
              <div>
                <dt style={{ opacity: 0.7 }}>Mínima d&apos;avui</dt>
                <dd className="tnum font-medium">{temp(obs.today.tMin)}</dd>
              </div>
            )}
            {wind != null && (
              <div>
                <dt style={{ opacity: 0.7 }}>Vent</dt>
                <dd className="tnum font-medium">
                  {msToKmh(wind).toFixed(0)} km/h
                  {dir != null && <span className="ml-1 font-normal" style={{ opacity: 0.8 }}>{windCardinal(dir)}</span>}
                </dd>
              </div>
            )}
            {gust != null && (
              <div>
                <dt style={{ opacity: 0.7 }}>Ratxa</dt>
                <dd className="tnum font-medium">{msToKmh(gust).toFixed(0)} km/h</dd>
              </div>
            )}
            {obs.values.humidity?.value != null && (
              <div>
                <dt style={{ opacity: 0.7 }}>Humitat</dt>
                <dd className="tnum font-medium">{Math.round(obs.values.humidity.value)} %</dd>
              </div>
            )}
            {obs.precip24h != null && (
              <div>
                <dt style={{ opacity: 0.7 }}>Pluja 24 h</dt>
                <dd className="tnum font-medium">{num(obs.precip24h, 1)} mm</dd>
              </div>
            )}
            {obs.values.pressure?.value != null && (
              <div>
                <dt style={{ opacity: 0.7 }}>Pressió</dt>
                <dd className="tnum font-medium">{Math.round(obs.values.pressure.value)} hPa</dd>
              </div>
            )}
            {obs.yesterday?.tMax != null && (
              <div>
                <dt style={{ opacity: 0.7 }}>Màxima d&apos;ahir</dt>
                <dd className="tnum font-medium">{temp(obs.yesterday.tMax)}</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-xs" style={{ opacity: 0.72 }}>
            {ago(obs.ageMin)} · la pressió és de l&apos;estació, no reduïda al
            nivell del mar · lectura provisional, pendent de validació del Meteocat
          </p>
        </section>
      )}

      {/*
        La aclaración que separa esta página de la de un municipio. Va arriba y no
        en una nota al pie: es la diferencia entre un dato medido y uno calculado.
      */}
      <p className="mt-4 max-w-[65ch] text-sm leading-relaxed text-[var(--ink-2)]">
        Aquestes xifres són <strong className="font-medium text-[var(--ink)]">la lectura del
        termòmetre</strong>, sense cap correcció: són d&apos;aquest punt, a{' '}
        {station.altitud != null ? `${int(station.altitud)} m` : 'la seva cota'}. A les
        fitxes de poble la temperatura ve corregida pel desnivell entre el poble i
        la seva estació de referència; aquí no hi ha res a corregir.
        {station.nearestLocation && (
          <>
            {' '}El nucli habitat més proper és{' '}
            <Link href={station.nearestLocation.path} className="text-[var(--accent)] no-underline hover:underline">
              {station.nearestLocation.nom}
            </Link>
            , a {num(station.nearestLocation.distKm, 1)} km.
          </>
        )}
      </p>

      {history?.rose && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">D&apos;on ve el vent</h2>
          <WindRose rose={history.rose} />
        </section>
      )}

      {history && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Clima i rècords</h2>
          <ClimateBlock
            history={history}
            station={{
              codi: station.codi,
              nom: station.nom,
              distKm: 0,
              dAltM: 0,
            }}
            month={month}
          />
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Fitxa tècnica</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Codi XEMA">{station.codi}</Fact>
          <Fact label="Altitud">
            {station.altitud != null ? `${int(station.altitud)} m` : '—'}
          </Fact>
          <Fact label="Coordenades">
            <span className="tnum">{num(station.lat, 4)}, {num(station.lon, 4)}</span>
          </Fact>
          <Fact label="En servei des de">
            {station.dataInici ? dateFull(station.dataInici) : '—'}
          </Fact>
          {history?.records.since && (
            <Fact label="Sèrie diària">
              des {deName(dateFull(history.records.since))} · {int(history.records.days)} dies
            </Fact>
          )}
          {station.municipiNom && (
            <Fact label="Municipi">{station.municipiNom}</Fact>
          )}
          {history?.monthAnomaly != null && (
            <Fact label="Aquest mes">
              <span className="tnum">{signed(history.monthAnomaly, 1, '°C')}</span>{' '}
              <span className="font-normal text-[var(--muted)]">respecte de la normal</span>
            </Fact>
          )}
          {history != null && (
            <Fact label="Dies sense pluja">
              <span className="tnum">{history.dryStreak}</span>
            </Fact>
          )}
        </div>
      </section>

      <p className="mt-8 max-w-[65ch] text-xs leading-relaxed text-[var(--muted)]">
        Dades del Servei Meteorològic de Catalunya (XEMA), via el portal de dades
        obertes de la Generalitat. Les normals i els rècords es calculen sobre la
        sèrie d&apos;aquesta mateixa estació, no sobre cap reanàlisi ni cap mitjana
        regional — per això valen exactament per {aName(station.nom)} i no per la
        comarca.
      </p>
    </article>
  );
}
