'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KIND_LABEL, type SearchSuggestion } from '@/lib/search-kinds';

/**
 * El quadre de cerca, amb suggeriments mentre s'escriu.
 *
 * ## L'únic `'use client'` que va a **totes** les pàgines, i per què
 *
 * N'hi ha cinc al projecte —aquest, `RadarScrubber` a `/radar`,
 * `InteractiveMap` a `/mapa/interactiu`, `MenuClose`, que només tanca el menú
 * del mòbil, i la pàgina d'error—. Els dos del mig viuen a la seva adreça i no els carrega ningú
 * més. Aquest sí: és a la capçalera.
 *
 * La regla del web és que les pàgines territorials no porten JavaScript propi,
 * i segueix sent certa: això no en canvia ni una. El que sí que canvia és que
 * el quadre viu a la capçalera, o sigui **a totes les pàgines**, incloses les
 * 4.293 fitxes.
 *
 * El cost està mesurat, no suposat: **1.546 bytes en gzip**. És la diferència
 * de sumar tots els fragments de `.next/static/chunks` amb aquest fitxer i
 * sense —181.739 contra 180.193— i és tan petita perquè el runtime ja hi era:
 * l'App Router ja serveix i ja hidrata 137 kB de React a cada pàgina, cosa que
 * ja consta a `AGENTS.md` i que feia fals dir «sense hidratació» abans que
 * existís aquest component. El que s'hi afegeix és el codi d'aquí i prou.
 *
 * Si algun dia es decideix treure React de les pàgines territorials, aquest
 * quadre és el primer que ho impedirà i s'haurà de tornar a plantejar. Mentre
 * el runtime hi sigui, 1,5 kB per no haver d'escriure a cegues és barat.
 *
 * El que **no** s'ha fet és baixar l'índex al navegador. Són 4.293 poblacions
 * més les platges, les estacions, els itineraris i la resta: uns quants
 * centenars de kB a cada pàgina perquè el quadre és a la capçalera. Els
 * suggeriments els contesta `/api/cerca`, que només crida qui escriu.
 *
 * ## Sense JavaScript segueix funcionant, i no per casualitat
 *
 * El que es renderitza al servidor és exactament el formulari d'abans:
 * `<form action="/cerca" method="get">` amb el seu camp i el seu botó. Els
 * suggeriments són una capa a sobre. Si el JavaScript no arriba, no s'executa o
 * falla, es prem Enter i s'obre `/cerca?q=…`, que és una pàgina de veritat amb
 * la seva adreça. Per això el desplegable no substitueix res: només s'hi afegeix.
 *
 * ## Detalls que es noten quan no hi són
 *
 *  · **La resposta que arriba tard no pot guanyar.** Escrivint de pressa surten
 *    quatre peticions i tornen desordenades; sense comprovar-ho, «cadaq» pot
 *    acabar ensenyant els resultats de «cad». Cada resposta porta la consulta
 *    que la va demanar i es descarta si ja no és la que hi ha al camp.
 *  · **El que ja s'ha demanat no es torna a demanar.** En esborrar lletres es
 *    passa per consultes ja contestades.
 *  · **`onMouseDown` i no `onClick`** als suggeriments: amb `onClick`, el `blur`
 *    del camp tanca la llista abans que el clic hi arribi.
 */
export function SiteSearch({
  variant = 'header', defaultValue = '', autoFocus = false,
}: {
  variant?: 'header' | 'page';
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;

  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  /*
   * Les respostes es desen per consulta i el que s'ensenya se'n **deriva**.
   *
   * Tenir una llista `hits` a part obligava a escriure-hi des de l'efecte cada
   * cop que canviava el camp —buidar-la per sota de dues lletres, omplir-la
   * quan la consulta ja estava desada— i escriure estat dins d'un efecte és un
   * render de més que es pot veure. Derivant-ho no hi ha res a sincronitzar:
   * l'efecte només demana el que encara no té.
   *
   * De passada, en esborrar lletres no es torna a demanar res: es passa per
   * consultes ja contestades.
   */
  const [answered, setAnswered] = useState<Record<string, SearchSuggestion[]>>({});
  const box = useRef<HTMLDivElement>(null);

  const q = value.trim();
  const hits = q.length >= 2 ? answered[q] ?? [] : [];

  useEffect(() => {
    if (q.length < 2 || answered[q]) return;

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cerca?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.json() as { hits: SearchSuggestion[] };
        /*
         * La consulta és la clau, així que una resposta que arriba tard no pot
         * guanyar: escrivint de pressa surten quatre peticions i tornen
         * desordenades, i sense això «cadaq» podria acabar ensenyant els
         * resultats de «cad».
         */
        setAnswered((prev) => ({ ...prev, [q]: data.hits }));
      } catch {
        /*
         * Un suggeriment que no arriba no és un error del lector: el formulari
         * segueix sent-hi i Enter segueix portant a la pàgina de resultats. Un
         * missatge vermell aquí espantaria per una cosa que no li ha fallat.
         */
      }
    }, 140);

    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q, answered]);

  // Clicar a fora tanca. El `blur` del camp no n'hi ha prou: entremig hi ha el
  // botó de cercar, i tancar en sortir del camp el faria inclicable.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const show = open && hits.length > 0;
  // La llista pot haver-se escurçat entre dues consultes; l'índex marcat no ha
  // d'apuntar mai a un lloc que ja no hi és.
  const marked = active >= 0 && active < hits.length ? active : -1;

  const go = (h: SearchSuggestion) => {
    setOpen(false);
    setValue('');
    router.push(h.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!show) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (e.key === 'Enter' && marked >= 0) {
      // Només quan n'hi ha un de marcat. Sense marcar, Enter fa el que sempre
      // ha fet: enviar el formulari i obrir la pàgina de resultats.
      e.preventDefault();
      go(hits[marked]);
    }
  };

  const header = variant === 'header';

  return (
    /*
     * Al mòbil la caixa **no** és el punt de referència de la llista.
     *
     * La llista s'alineava per la dreta amb el quadre i feia 335 px; el quadre
     * acaba abans del botó del menú, a 291 px, així que la llista començava 44 px
     * fora de la pantalla per l'esquerra i els resultats sortien tallats. Sota
     * `sm` la caixa és `static` i la llista es col·loca contra la fila de la
     * capçalera (que és `relative`), d'una vora a l'altra amb el mateix marge.
     */
    <div ref={box} className={header ? 'relative ms-auto flex min-w-0 flex-1 items-center justify-end max-sm:static' : 'relative max-w-xl'}>
      <form
        action="/cerca"
        method="get"
        role="search"
        className={header
          ? 'relative flex w-full min-w-0 max-w-[14rem] items-center sm:max-w-[16rem]'
          : 'flex items-center gap-2 rounded-2xl bg-white p-1.5 ps-4 text-[#0b1220] shadow-[var(--shadow)]'}
      >
        {/* La lupa: diu què és el quadre abans d'escriure-hi res. */}
        <svg
          viewBox="0 0 24 24" width={18} height={18} aria-hidden="true"
          className={header ? 'pointer-events-none absolute start-3 z-10 text-[var(--muted)]' : 'shrink-0 text-slate-500'}
        >
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <label htmlFor={id} className="sr-only">
          Cercar un poble, una platja, un pantà o una estació
        </label>
        <input
          id={id}
          name="q"
          type="search"
          value={value}
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={show && marked >= 0 ? `${id}-o${marked}` : undefined}
          onChange={(e) => { setValue(e.target.value); setActive(-1); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={header ? 'Cercar…' : 'Un poble, una platja…'}
          className={header
            ? 'h-10 w-full min-w-0 rounded-full border border-[var(--glass-line)] bg-[var(--glass)] ps-9 pe-3 text-sm text-[var(--ink)] outline-none backdrop-blur-md placeholder:text-[var(--muted)] focus:border-[var(--accent)]'
            : 'min-w-0 flex-1 bg-transparent py-2.5 text-[17px] outline-none placeholder:text-slate-500'}
        />
        {!header && (
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-[var(--brand)] px-5 py-2.5 text-[15px] font-semibold text-white hover:brightness-110"
          >
            Cercar
          </button>
        )}
      </form>

      {show && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggeriments"
          className={`absolute end-0 top-full z-50 mt-2 max-h-[70vh] w-[min(24rem,calc(100vw-2.5rem))] list-none overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow)]${header ? ' max-sm:inset-x-4 max-sm:mt-0 max-sm:w-auto' : ''}`}
        >
          {hits.map((h, i) => (
            <li
              key={`${h.href}|${h.title}`}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={i === marked}
              onMouseDown={(e) => { e.preventDefault(); go(h); }}
              onMouseEnter={() => setActive(i)}
              className="flex cursor-pointer items-baseline justify-between gap-3 rounded-xl px-3 py-2"
              style={{ background: i === marked ? 'var(--surface-2)' : undefined }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-[var(--ink)]">{h.title}</span>
                {h.context && (
                  <span className="block truncate text-xs text-[var(--muted)]">{h.context}</span>
                )}
              </span>
              <span className="shrink-0 text-[11px] text-[var(--muted)]">{KIND_LABEL[h.kind]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
