'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { tr, type Lang } from '@/lib/lang';

/**
 * El configurador del widget: es tria què hi surt i es veu com queda.
 *
 * És el sisè `'use client'` del projecte, i només viu a `/widget`. La pàgina
 * no és una fitxa: és una eina, i el que fa —tornar a dibuixar la vista prèvia
 * a cada clic i copiar el codi— sense script voldria un formulari i una
 * recàrrega per cada casella. El widget que es posa a l'altra web **no** porta
 * res d'això: és HTML del servidor (`src/lib/widget.ts`).
 *
 * La vista prèvia és el widget de veritat, en un `<iframe>`, i l'alçada la diu
 * ell mateix amb el mateix missatge que farà servir a l'altra web. Així
 * l'alçada que es copia és la que s'ha vist.
 */

type Piece = 'avisos' | 'hores' | 'vent' | 'sol' | 'aire' | 'mar' | 'bandera' | 'neu';
const ORDER: Piece[] = ['avisos', 'hores', 'vent', 'sol', 'aire', 'mar', 'bandera', 'neu'];
const DAYS = [0, 3, 5, 7];
const WIDTHS = ['260', '320', '400', '100%'];

const LABEL: Record<Piece, [string, string, string, string]> = {
  avisos: ['Avisos oficials', 'Avisos oficiales', 'Només surten quan n’hi ha', 'Solo aparecen cuando los hay'],
  hores: ['Les properes 12 hores', 'Las próximas 12 horas', '', ''],
  vent: ['Vent', 'Viento', 'Ara, amb la ratxa', 'Ahora, con la racha'],
  sol: ['Sortida i posta del sol', 'Salida y puesta del sol', '', ''],
  aire: ['Qualitat de l’aire', 'Calidad del aire', 'Índex europeu', 'Índice europeo'],
  mar: ['El mar', 'El mar', 'Temperatura de l’aigua i onatge', 'Temperatura del agua y oleaje'],
  bandera: ['Banderes i meduses', 'Banderas y medusas', 'Només quan hi ha socorristes de servei', 'Solo cuando hay socorristas de servicio'],
  neu: ['Neu', 'Nieve', 'L’estació d’esquí del costat i la neu prevista', 'La estación de esquí cercana y la nieve prevista'],
};

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
  const [pieces, setPieces] = useState<Piece[]>(['avisos']);
  const [days, setDays] = useState(5);
  const [theme, setTheme] = useState<'fosc' | 'clar'>('fosc');
  const [width, setWidth] = useState('320');
  const [height, setHeight] = useState(260);
  const [copied, setCopied] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    q.set('mostra', ORDER.filter((p) => pieces.includes(p)).join(','));
    if (days !== 5) q.set('dies', String(days));
    if (theme !== 'fosc') q.set('tema', theme);
    return q.toString().replace(/%2C/g, ',');
  }, [pieces, days, theme]);
  const src = `/widget${path}?${query}`;

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && e.data?.tempscat && typeof e.data.h === 'number') {
        setHeight(e.data.h);
      }
    };
    addEventListener('message', onMessage);
    const doc = frame.current?.contentDocument;
    if (doc?.readyState === 'complete' && doc.body?.childElementCount) {
      setHeight(Math.ceil(doc.body.getBoundingClientRect().height));
    }
    return () => removeEventListener('message', onMessage);
  }, []);

  const code = `<iframe src="${origin}${src}" width="${width}" height="${height}" style="border:0;max-width:100%" loading="lazy" title="${title}"></iframe>
<p style="margin:4px 0 0;font:13px sans-serif"><a href="${fitxa}">${title}</a> · TempsCat</p>
<script>addEventListener("message",function(e){if(e.origin!=="${origin}"||!e.data||!e.data.tempscat)return;document.querySelectorAll("iframe").forEach(function(f){if(f.contentWindow===e.source)f.style.height=e.data.h+"px"})})</script>`;

  const toggle = (p: Piece) => setPieces((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* el text és a sota, es pot seleccionar */ }
  };

  return (
    <div className="widget-builder">
      <form className="wb-options" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>{t('Què hi surt', 'Qué aparece')}</legend>
          <p className="wb-fixed">{t('Sempre: el lloc, la temperatura d’ara, el cel i la màxima i la mínima d’avui.', 'Siempre: el lugar, la temperatura de ahora, el cielo y la máxima y la mínima de hoy.')}</p>
          {ORDER.filter((p) => available.includes(p)).map((p) => (
            <label key={p} className="wb-check">
              <input type="checkbox" checked={pieces.includes(p)} onChange={() => toggle(p)} />
              <span>
                {tr(lang, LABEL[p][0], LABEL[p][1])}
                {LABEL[p][2] && <small>{tr(lang, LABEL[p][2], LABEL[p][3])}</small>}
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>{t('Dies de predicció', 'Días de previsión')}</legend>
          <div className="chips">
            {DAYS.map((d) => (
              <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
                {d === 0 ? t('Cap', 'Ninguno') : d}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>{t('Color', 'Color')}</legend>
          <div className="chips">
            <button type="button" aria-pressed={theme === 'fosc'} onClick={() => setTheme('fosc')}>{t('Fosc', 'Oscuro')}</button>
            <button type="button" aria-pressed={theme === 'clar'} onClick={() => setTheme('clar')}>{t('Clar', 'Claro')}</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t('Amplada', 'Anchura')}</legend>
          <div className="chips">
            {WIDTHS.map((w) => (
              <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)}>
                {w === '100%' ? t('Tota la columna', 'Toda la columna') : `${w} px`}
              </button>
            ))}
          </div>
        </fieldset>
      </form>

      <div className="wb-preview">
        <iframe
          ref={frame}
          src={src}
          // El missatge del widget pot arribar abans que la pàgina escolti (la
          // primera càrrega, abans d'hidratar). Com que és del mateix domini,
          // aquí es pot mesurar directament.
          onLoad={(e) => {
            const body = e.currentTarget.contentDocument?.body;
            if (body) setHeight(Math.ceil(body.getBoundingClientRect().height));
          }}
          title={title}
          style={{ border: 0, width: width === '100%' ? '100%' : `${width}px`, maxWidth: '100%', height }}
        />
        <p className="wb-link"><a href={fitxa}>{title}</a> · TempsCat</p>

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
