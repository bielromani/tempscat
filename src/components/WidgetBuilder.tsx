'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { tr, type Lang } from '@/lib/lang';

/**
 * El configurador del widget: es tria i es veu com queda mentre es tria.
 *
 * És un `'use client'` i només viu a `/widget`. La pàgina no és una fitxa: és
 * una eina, i tornar a dibuixar la vista prèvia a cada clic sense script voldria
 * un formulari i una recàrrega per casella. El widget que es posa a l'altra web
 * **no** porta res d'això: és HTML del servidor (`src/lib/widget.ts`).
 *
 * ## Dues vistes prèvies, i una no es veu
 *
 * La que es veu pot anar en mode de prova —avisos i banderes inventats, amb la
 * franja «Exemple»— perquè qui tria vegi com queda el dia que n'hi ha. Però
 * l'alçada que va al codi ha de ser la d'avui de veritat, així que una segona
 * còpia sense el mode de prova, amagada, és la que es mesura. Les dues diuen la
 * seva alçada amb el mateix missatge que farà servir el widget a l'altra web.
 */

type Piece =
  | 'avisos' | 'hores' | 'pluja' | 'vent' | 'humitat' | 'uv' | 'sol' | 'aire'
  | 'mar' | 'bandera' | 'muntanya' | 'neu';
type Format = 'mini' | 'targeta' | 'apaisat';

const ORDER: Piece[] = ['avisos', 'hores', 'pluja', 'vent', 'humitat', 'uv', 'sol', 'aire', 'mar', 'bandera', 'muntanya', 'neu'];
const GROUPS: Array<{ ca: string; es: string; pieces: Piece[] }> = [
  { ca: 'El temps', es: 'El tiempo', pieces: ['avisos', 'hores', 'pluja', 'vent', 'humitat', 'uv', 'sol', 'aire'] },
  { ca: 'La platja', es: 'La playa', pieces: ['mar', 'bandera'] },
  { ca: 'La muntanya', es: 'La montaña', pieces: ['muntanya', 'neu'] },
];

const LABEL: Record<Piece, [string, string, string, string]> = {
  avisos: ['Avisos oficials', 'Avisos oficiales', 'Només surten quan n’hi ha', 'Solo aparecen cuando los hay'],
  hores: ['Les properes 12 hores', 'Las próximas 12 horas', 'De dues en dues', 'De dos en dos'],
  pluja: ['Pluja d’avui', 'Lluvia de hoy', 'Probabilitat i litres', 'Probabilidad y litros'],
  vent: ['Vent', 'Viento', 'Ara, amb la ratxa', 'Ahora, con la racha'],
  humitat: ['Humitat', 'Humedad', '', ''],
  uv: ['Índex UV', 'Índice UV', 'El màxim d’avui', 'El máximo de hoy'],
  sol: ['Sortida i posta del sol', 'Salida y puesta del sol', '', ''],
  aire: ['Qualitat de l’aire', 'Calidad del aire', 'Índex europeu', 'Índice europeo'],
  mar: ['El mar', 'El mar', 'Temperatura de l’aigua i onatge', 'Temperatura del agua y oleaje'],
  bandera: ['Banderes i meduses', 'Banderas y medusas', 'Quan hi ha socorristes de servei', 'Cuando hay socorristas de servicio'],
  muntanya: ['Isozero i neu prevista', 'Isocero y nieve prevista', 'La cota de neu dels propers 3 dies', 'La cota de nieve de los próximos 3 días'],
  neu: ['L’estació d’esquí', 'La estación de esquí', 'Oberta o tancada, pistes i gruix', 'Abierta o cerrada, pistas y espesor'],
};

const FORMATS: Array<{ id: Format; ca: string; es: string; dca: string; des: string }> = [
  { id: 'mini', ca: 'Mini', es: 'Mini', dca: 'Només la temperatura d’ara', des: 'Solo la temperatura de ahora' },
  { id: 'targeta', ca: 'Targeta', es: 'Tarjeta', dca: 'Vertical, per a una columna', des: 'Vertical, para una columna' },
  { id: 'apaisat', ca: 'Apaisat', es: 'Apaisado', dca: 'Horitzontal, a tot l’ample', des: 'Horizontal, a todo lo ancho' },
];

const WIDTHS: Record<Format, string[]> = {
  mini: ['180', '220', '260'],
  targeta: ['280', '320', '380', '100%'],
  apaisat: ['560', '680', '800', '100%'],
};
const DEFAULT_WIDTH: Record<Format, string> = { mini: '220', targeta: '320', apaisat: '680' };

export function WidgetBuilder({ path, title, fitxa, origin, available, lang }: {
  /** `/maresme/malgrat-de-mar` */
  path: string;
  /** «El temps a Malgrat de Mar» */
  title: string;
  /** L'adreça absoluta de la fitxa: és on porta l'enllaç de fora de l'iframe. */
  fitxa: string;
  /** `https://tempscat.cat`, sense barra. */
  origin: string;
  available: Piece[];
  lang: Lang;
}) {
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const [format, setFormat] = useState<Format>('targeta');
  const [pieces, setPieces] = useState<Piece[]>(['avisos']);
  const [showDays, setShowDays] = useState(true);
  const [days, setDays] = useState(5);
  const [theme, setTheme] = useState<'fosc' | 'clar'>('fosc');
  const [icons, setIcons] = useState(true);
  const [width, setWidth] = useState(DEFAULT_WIDTH.targeta);
  const [demo, setDemo] = useState(true);
  const [shownHeight, setShownHeight] = useState(260);
  const [realHeight, setRealHeight] = useState(260);
  const [copied, setCopied] = useState(false);
  const shown = useRef<HTMLIFrameElement>(null);
  const real = useRef<HTMLIFrameElement>(null);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (format !== 'targeta') q.set('format', format);
    q.set('mostra', ORDER.filter((p) => pieces.includes(p) && available.includes(p)).join(','));
    const d = showDays ? days : 0;
    if (d !== 5) q.set('dies', String(d));
    if (theme !== 'fosc') q.set('tema', theme);
    if (!icons) q.set('icones', '0');
    return q.toString().replace(/%2C/g, ',');
  }, [format, pieces, available, showDays, days, theme, icons]);
  const src = `/widget${path}?${query}`;
  const shownSrc = demo ? `${src}&prova=1` : src;
  const cssWidth = width === '100%' ? '100%' : `${width}px`;

  useEffect(() => {
    const measure = (f: HTMLIFrameElement | null, set: (h: number) => void) => {
      const body = f?.contentDocument?.body;
      if (f?.contentDocument?.readyState === 'complete' && body?.childElementCount) set(Math.ceil(body.getBoundingClientRect().height));
    };
    const onMessage = (e: MessageEvent) => {
      if (!e.data?.tempscat || typeof e.data.h !== 'number') return;
      if (e.source === shown.current?.contentWindow) setShownHeight(e.data.h);
      if (e.source === real.current?.contentWindow) setRealHeight(e.data.h);
    };
    addEventListener('message', onMessage);
    // El primer missatge pot arribar abans que la pàgina escolti: es mesura directament.
    measure(shown.current, setShownHeight);
    measure(real.current, setRealHeight);
    return () => removeEventListener('message', onMessage);
  }, []);

  // L'enllaç que compta és aquest `<a>`: HTML pla, fora de l'iframe i fora de
  // l'script, perquè un cercador el llegeixi sense executar res.
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const code = `<iframe src="${origin}${esc(src)}" width="${width}" height="${realHeight}" style="border:0;max-width:100%" loading="lazy" title="${esc(title)}"></iframe>
<p style="margin:4px 0 0;font:13px sans-serif"><a href="${esc(fitxa)}">${esc(title)}</a> · TempsCat</p>
<script>addEventListener("message",function(e){if(e.origin!=="${origin}"||!e.data||!e.data.tempscat)return;document.querySelectorAll("iframe").forEach(function(f){if(f.contentWindow===e.source)f.style.height=e.data.h+"px"})})</script>`;

  const toggle = (p: Piece) => setPieces((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  const pickFormat = (f: Format) => { setFormat(f); setWidth(DEFAULT_WIDTH[f]); };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* el text és a sota, es pot seleccionar */ }
  };
  const onLoad = (set: (h: number) => void) => (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const body = e.currentTarget.contentDocument?.body;
    if (body) set(Math.ceil(body.getBoundingClientRect().height));
  };
  const mini = format === 'mini';
  const hasBeach = available.includes('bandera');

  return (
    <div className={`widget-builder wb-${format}`}>
      <form className="wb-options" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>{t('Format', 'Formato')}</legend>
          <div className="wb-formats">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" aria-pressed={format === f.id} onClick={() => pickFormat(f.id)}>
                <span className={`wb-shape wb-shape-${f.id}`} aria-hidden="true"><i /><i /><i /></span>
                <b>{tr(lang, f.ca, f.es)}</b>
                <small>{tr(lang, f.dca, f.des)}</small>
              </button>
            ))}
          </div>
        </fieldset>

        {GROUPS.map((g) => {
          const list = g.pieces.filter((p) => available.includes(p) && (!mini || p === 'avisos'));
          if (!list.length) return null;
          return (
            <fieldset key={g.ca}>
              <legend>{tr(lang, g.ca, g.es)}</legend>
              {list.map((p) => (
                <label key={p} className="wb-check">
                  <input type="checkbox" checked={pieces.includes(p)} onChange={() => toggle(p)} />
                  <span>
                    {tr(lang, LABEL[p][0], LABEL[p][1])}
                    {LABEL[p][2] && <small>{tr(lang, LABEL[p][2], LABEL[p][3])}</small>}
                  </span>
                </label>
              ))}
            </fieldset>
          );
        })}
        {mini && <p className="wb-note">{t('En format mini només hi ha la temperatura d’ara i, si n’hi ha, l’avís.', 'En formato mini solo está la temperatura de ahora y, si lo hay, el aviso.')}</p>}

        {!mini && (
          <fieldset>
            <legend>{t('Propers dies', 'Próximos días')}</legend>
            <label className="wb-check">
              <input type="checkbox" checked={showDays} onChange={() => setShowDays((v) => !v)} />
              <span>{t('Ensenya la predicció dels propers dies', 'Muestra la previsión de los próximos días')}</span>
            </label>
            {showDays && (
              <div className="chips">
                {[3, 5, 7].map((d) => (
                  <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{t(`${d} dies`, `${d} días`)}</button>
                ))}
              </div>
            )}
          </fieldset>
        )}

        <fieldset>
          <legend>{t('Aspecte', 'Aspecto')}</legend>
          <div className="chips">
            <button type="button" aria-pressed={theme === 'fosc'} onClick={() => setTheme('fosc')}>{t('Fosc', 'Oscuro')}</button>
            <button type="button" aria-pressed={theme === 'clar'} onClick={() => setTheme('clar')}>{t('Clar', 'Claro')}</button>
          </div>
          <label className="wb-check">
            <input type="checkbox" checked={icons} onChange={() => setIcons((v) => !v)} />
            <span>{t('Amb icones', 'Con iconos')}</span>
          </label>
        </fieldset>

        <fieldset>
          <legend>{t('Amplada', 'Anchura')}</legend>
          <div className="chips">
            {WIDTHS[format].map((w) => (
              <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)}>
                {w === '100%' ? t('Tot l’ample', 'Todo el ancho') : `${w} px`}
              </button>
            ))}
          </div>
        </fieldset>
      </form>

      <div className="wb-preview">
        <label className="wb-demo">
          <input type="checkbox" checked={demo} onChange={() => setDemo((v) => !v)} />
          <span>
            {hasBeach
              ? t('Veure-ho amb avisos i banderes d’exemple', 'Verlo con avisos y banderas de ejemplo')
              : t('Veure-ho amb avisos d’exemple', 'Verlo con avisos de ejemplo')}
            <small>{t('Només aquí: el codi ensenya les dades d’ara.', 'Solo aquí: el código enseña los datos de ahora.')}</small>
          </span>
        </label>
        <div className="wb-stage">
          <iframe
            ref={shown}
            src={shownSrc}
            title={title}
            onLoad={onLoad(setShownHeight)}
            style={{ border: 0, width: cssWidth, maxWidth: '100%', height: shownHeight }}
          />
          <p className="wb-link"><a href={fitxa}>{title}</a> · TempsCat</p>
        </div>
        {/* La que es mesura: la d'avui, sense res inventat. */}
        <iframe
          ref={real}
          src={src}
          title=""
          aria-hidden="true"
          tabIndex={-1}
          onLoad={onLoad(setRealHeight)}
          className="wb-measure"
          style={{ width: cssWidth, height: realHeight }}
        />

        <div className="wb-code">
          <div className="wb-code-head">
            <span>{t('El codi per a la vostra web', 'El código para su web')}</span>
            <button type="button" onClick={copy}>{copied ? t('Copiat', 'Copiado') : t('Copia', 'Copiar')}</button>
          </div>
          <textarea readOnly rows={7} value={code} onFocus={(e) => e.currentTarget.select()} aria-label={t('Codi per copiar', 'Código para copiar')} />
          <p>
            {t(
              'Tres línies: el requadre, l’enllaç a la fitxa del poble i un script que ajusta l’alçada quan surt o desapareix un avís. Si la vostra web no deixa posar scripts, podeu treure la tercera: el requadre es queda amb l’alçada d’ara.',
              'Tres líneas: el recuadro, el enlace a la ficha del pueblo y un script que ajusta la altura cuando aparece o desaparece un aviso. Si su web no permite scripts, puede quitar la tercera: el recuadro se queda con la altura de ahora.',
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
