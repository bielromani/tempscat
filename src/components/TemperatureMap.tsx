import { num } from '@/lib/format';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import type { TemperatureMap as MapData } from '@/lib/map';

/**
 * El mapa de temperatures de Catalunya, sense una línia de JavaScript.
 *
 * Es un SVG del servidor: 43 `path` amb el seu `fill`, i prou. La geometria ja
 * ve projectada i simplificada del build; aquí només s'hi posa color.
 *
 * ## Es navega, i per això cada comarca és un enllaç
 *
 * Un mapa que no es pot clicar és una il·lustració. Embolcallant cada `path`
 * amb un `<a>` **d'SVG** es fa navegable sense cap script, i el teclat hi
 * arriba en l'ordre del document. Amb el ratolí, el `<title>` de dins fa de
 * tooltip.
 *
 * `<a>` i no `next/link`: el `Link` és un component de client i, amb 43
 * comarques, engegaria 43 precàrregues en obrir la pàgina. Aquí no cal — un
 * `<a>` navega igual i no porta res.
 *
 * ## El `<title>` va d'una peça
 *
 * React només omple un `<title>` si el seu únic fill és una cadena. Amb dos o
 * tres hi escriu `<title></title>` buit al servidor i el text al client, i
 * això és una discrepància d'hidratació que fa que React llenci l'arbre servit
 * i el torni a fer al navegador. Va passar amb la rosa dels vents i no dona cap
 * error visible.
 *
 * ## Les que no tenen dada no es pinten
 *
 * Es queden amb la trama de ratlles del `<defs>`. Un gris pla es llegiria com
 * «fa fred aquí», i el que passa és que no ho sabem.
 */
/**
 * Dues mides, perquè no és el mateix el mapa que la miniatura.
 *
 * A `/mapa` el dibuix és el contingut i ocupa l'ample: hi caben les xifres i,
 * on hi ha lloc, el nom de la comarca. A la fitxa d'una comarca el mapa serveix
 * per situar-se i ocupa un pam: allà només hi surt la xifra de la comarca
 * marcada, perquè el nom a aquella mida no es llegiria.
 */
export function TemperatureMap({
  data, highlight, variant = 'full',
}: { data: MapData; highlight?: string; variant?: 'full' | 'compact' }) {
  const { width, height, comarques } = data;
  const compact = variant === 'compact';

  /*
   * Quins noms es dibuixen ho decideix el build, no aquesta pàgina.
   *
   * És un problema de col·locació —que dos rètols no es trepitgin— i es resol
   * un cop a `scripts/10-map-geometry.ts` amb la geometria a la mà, no a cada
   * renderitzat amb una regla aproximada.
   */
  const NAME_SIZE = 15;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          data.min != null && data.max != null
            ? `Mapa de Catalunya per comarques: de ${num(data.min, 1)} a ${num(data.max, 1)} graus`
            : 'Mapa de Catalunya per comarques, sense dades'
        }
        className="block h-auto w-full"
      >
        <defs>
          {/* Trama per a les comarques sense observació suficient. */}
          <pattern id="sensedada" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--surface-2)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line)" strokeWidth="1.5" />
          </pattern>
        </defs>

        {comarques.map((c) => {
          const t = c.temperature;
          const on = highlight === c.code;
          const tip = t != null
            ? `${c.name}: ${num(t, 1)} °C · mediana de ${c.observed} municipis`
            : `${c.name}: sense observació suficient`;

          return (
            <a key={c.code} href={c.path}>
              <path
                d={c.d}
                fill={t != null ? temperatureColor(t) : 'url(#sensedada)'}
                stroke={on ? 'var(--ink)' : 'var(--surface)'}
                strokeWidth={on ? 4 : 1.5}
                strokeLinejoin="round"
              >
                <title>{tip}</title>
              </path>
            </a>
          );
        })}

        {/* Les etiquetes van al final: han de quedar per damunt de tots els traços. */}
        {comarques.map((c) => {
          if (c.temperature == null) return null;
          const on = highlight === c.code;
          // A la miniatura, només la comarca marcada porta etiqueta.
          if (compact && !on) return null;
          /*
           * A la miniatura no hi va cap nom. A 340 px d'ample, el cos 15 del
           * viewBox surt a cinc píxels: no es llegeix i només embruta. Qui és
           * la comarca marcada ho diu el títol de la pàgina.
           */
          const named = !compact && c.showName;
          const ink = temperatureInk(c.temperature);

          return (
            <g key={`t${c.code}`} style={{ pointerEvents: 'none' }}>
              <text
                x={c.label[0]}
                y={c.label[1] - (named ? 9 : 0)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={on ? 30 : 26}
                fontWeight={on ? 700 : 500}
                fill={ink}
              >
                {num(c.temperature, 0)}°
              </text>
              {named && (
                <text
                  x={c.label[0]}
                  y={c.label[1] + 13}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={NAME_SIZE}
                  fontWeight={on ? 600 : 400}
                  fill={ink}
                  opacity={0.82}
                >
                  {c.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {!compact && (
      <figcaption className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        Cada comarca porta la <strong className="font-medium text-[var(--ink-2)]">mediana
        dels seus municipis</strong>, amb l&apos;observació de cadascun corregida pel
        desnivell fins a la seva estació. {data.withData} de {comarques.length} en
        tenen prou; les ratllades, no.
      </figcaption>
      )}
    </figure>
  );
}

/**
 * La franja de color, amb el tram d'avui marcat a sobre.
 *
 * ## Per què l'escala és absoluta i no s'ajusta al dia
 *
 * Estirar els colors fins als extrems d'avui faria un mapa molt més vistós i
 * seria una trampa: una comarca sortiria vermella amb 31 graus al matí i blava
 * amb 33 a la tarda, perquè el que hauria canviat és l'escala i no el temps.
 * Aquí el taronja vol dir sempre el mateix.
 *
 * El preu és que un dia d'agost el mapa es veu gairebé d'un sol color. **Això
 * no és un defecte del mapa: és el que passa a fora.** Marcant el tram del dia
 * damunt de la franja, aquella planor passa a ser la informació — es veu d'un
 * cop que tot el país cap en cinc graus.
 */
export function TemperatureLegend({
  from = -5, to = 40, span,
}: { from?: number; to?: number; span?: { min: number; max: number } }) {
  const steps = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const pct = (t: number) => ((Math.max(from, Math.min(to, t)) - from) / (to - from)) * 100;

  return (
    <div className="mt-4">
      {span && (
        <div className="relative mb-1 h-4">
          <span
            className="absolute top-1.5 border-t-2 border-[var(--ink-2)]"
            style={{ left: `${pct(span.min)}%`, width: `${Math.max(1, pct(span.max) - pct(span.min))}%` }}
          />
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-[var(--ink-2)]"
            style={{ left: `${(pct(span.min) + pct(span.max)) / 2}%` }}
          >
            avui, tot Catalunya
          </span>
        </div>
      )}
      <div className="flex h-3 overflow-hidden rounded-full">
        {steps.map((t) => (
          <span key={t} className="flex-1" style={{ background: temperatureColor(t) }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-[var(--muted)]">
        {[from, 0, 15, 25, to].map((t) => <span key={t}>{t} °C</span>)}
      </div>
    </div>
  );
}
