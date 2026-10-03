'use client';

import { useEffect, useRef } from 'react';

/**
 * Tanca el menú del mòbil quan ja ha fet la seva feina.
 *
 * ## Per què el `<details>` sol no n'hi ha prou
 *
 * El menú és un `<details>` i l'obre el navegador, sense JavaScript. Però els
 * enllaços de dins són `<Link>`: la navegació la fa React **sense recarregar la
 * capçalera**, que viu al `layout`. El `<details>` és el mateix element abans i
 * després de clicar, i per tant es quedava obert damunt de la pàgina nova. Ho
 * va veure l'usuari al telèfon el 4 d'octubre de 2026.
 *
 * Canviar els enllaços per `<a>` normals també ho arreglaria —una càrrega
 * sencera crea un `<details>` nou, tancat—, a canvi de tornar a baixar i
 * hidratar la pàgina a cada salt. Això no.
 *
 * ## Què fa, i què no
 *
 * No renderitza res: s'enganxa al `<details>` que el conté i el tanca quan es
 * clica un enllaç de dins, quan es clica a fora i amb Escape. **No l'obre mai**:
 * qui l'obre continua sent el navegador, així que sense JavaScript el menú
 * segueix funcionant exactament com abans, només que no es tanca sol.
 */
export function MenuClose() {
  const mark = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const menu = mark.current?.closest('details');
    if (!menu) return;

    const close = () => { menu.open = false; };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (!menu.contains(target)) close();
      else if (target.closest('a')) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menu.open) {
        close();
        menu.querySelector('summary')?.focus();
      }
    };

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return <span ref={mark} hidden />;
}
