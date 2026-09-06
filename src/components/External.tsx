/**
 * Un enllaç que se'n va del web.
 *
 * ## Per què és un component i no un `<a>` escrit cada vegada
 *
 * Perquè escrivint-lo cada vegada se n'oblida un, i se'n va oblidar. La fitxa
 * d'un itinerari enllaçava la pàgina oficial de l'ajuntament amb `noopener
 * noreferrer` i prou: s'obria damunt del web —qui la seguia perdia el que
 * estava mirant— i sense `nofollow`, que en un enllaç que nosaltres no
 * controlem toca posar-hi.
 *
 * Amb un component, la propera vegada no hi ha res a recordar.
 *
 * ## Què posa, i per què cadascuna
 *
 *  · **`target="_blank"`** — el destí és d'un altre. Qui hi va, hi va a part.
 *  · **`rel="noopener"`** — sense això, la pàgina de destí pot tocar la
 *    nostra a través de `window.opener`.
 *  · **`rel="noreferrer"`** — no cal dir a ningú de quina pàgina exacta ve
 *    cada lector.
 *  · **`rel="nofollow"`** — no responem del que hi hagi a l'altra banda i no
 *    li passem autoritat. Val també per a l'atribució: la llicència demana
 *    **dir d'on ve la dada i enllaçar-hi**, no fer-li SEO.
 *
 * ## I es diu que s'obre en una finestra nova
 *
 * Un enllaç que fa una cosa que no s'espera ha d'avisar-ne. El símbol és
 * decoratiu —`aria-hidden`— i qui fa servir un lector de pantalla ho sap pel
 * text de dins de l'enllaç, que és on hi ha d'anar.
 */
export function External({
  href, children, className, plain = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  /** Sense el símbol, per quan el context ja diu que se'n va. */
  plain?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="nofollow noopener noreferrer"
      className={className}
    >
      {children}
      {!plain && (
        <span aria-hidden className="ms-1 text-[0.85em] text-[var(--muted)]">↗</span>
      )}
    </a>
  );
}
