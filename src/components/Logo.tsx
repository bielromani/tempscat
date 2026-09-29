/**
 * La marca: tempscat.
 *
 * El símbol és un sol que surt darrere d'una muntanya, sobre un cel blau. La
 * muntanya no és decoració: és la tesi del lloc, que el temps d'un poble depèn
 * de l'altitud on és i no de la del municipi del costat. El nom és el del
 * domini, `tempscat.cat`, amb «cat» en blau cel.
 *
 * Triat el 29 de setembre de 2026 entre les dues direccions del redisseny. La
 * mateixa figura és la icona del navegador, a `src/app/icon.svg`: si una canvia,
 * l'altra també.
 *
 * `id` separa el degradat de cada còpia: la marca surt dues vegades a cada
 * pàgina —capçalera i peu— i dos `<linearGradient>` amb el mateix identificador
 * fan que el navegador pinti tots dos amb el primer que troba.
 */
export function Logo({ size = 30, id }: { size?: number; id: string }) {
  const sky = `tc-sky-${id}`;
  return (
    <span className="brand">
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={sky} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4AA8FF" />
            <stop offset="1" stopColor="#1257D6" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill={`url(#${sky})`} />
        <circle cx="21.5" cy="11" r="5" fill="#FFD166" />
        <path d="M2.5 26 L11 14.5 L15.8 20.5 L19.5 16 L29.5 26 Z" fill="#fff" />
        <path d="M11 14.5 L13.2 17.4 L11.8 17 L10.6 18 L9.6 16.7 Z" fill="#DDEBFF" />
      </svg>
      <span className="brand-word">temps<b>cat</b></span>
    </span>
  );
}
