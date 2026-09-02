/**
 * El mapa del lloc, en un sol lloc.
 *
 * Capçalera, peu i portada han de dir el mateix, i fins ara cadascun portava la
 * seva llista a mà. Afegir una pàgina volia dir recordar-se de tres fitxers, i
 * l'única llista completa era la de la capçalera — que és justament on no hi
 * cabia.
 *
 * ## Per què la capçalera només en porta quatre
 *
 * Perquè n'hi havia quinze en una barra que es desbordava, i una barra que
 * s'arrossega en horitzontal no és navegació: és un calaix on les coses
 * desapareixen. Les que hi queden són les que es consulten cada dia; la resta
 * viu al peu, agrupada, i a la portada, explicada.
 *
 * Com que aquest fitxer no importa res, el poden llegir els dos costats.
 */

export interface NavLink {
  href: string;
  label: string;
  /** Una línia del que hi trobarà. Només la fa servir la portada. */
  blurb?: string;
}

export interface NavGroup {
  title: string;
  links: NavLink[];
}

/** El que va a la capçalera. Quatre, i que hi càpiguen sense arrossegar. */
export const PRIMARY: NavLink[] = [
  { href: '/mapa', label: 'Mapa' },
  { href: '/radar', label: 'Radar' },
  { href: '/avisos', label: 'Avisos' },
  { href: '/ranquings', label: 'Rànquings' },
];

/** Tot el lloc, agrupat pel que va a buscar la gent i no per com està fet. */
export const SECTIONS: NavGroup[] = [
  {
    title: 'El temps ara',
    links: [
      { href: '/mapa', label: 'Mapa de temperatures', blurb: 'Quina temperatura fa a cada comarca, d’una ullada.' },
      { href: '/radar', label: 'Radar de pluja', blurb: 'On plou ara mateix, i el que un radar no pot veure.' },
      { href: '/avisos', label: 'Avisos oficials', blurb: 'Els avisos de l’AEMET vigents, sense reescriure.' },
      { href: '/ranquings', label: 'Rànquings del dia', blurb: 'El poble més fred i el més càlid, i on ha plogut més.' },
      { href: '/cameres', label: 'Càmeres de muntanya', blurb: 'Com està ara mateix el Pirineu, vist per les càmeres de Ferrocarrils.' },
    ],
  },
  {
    title: 'Aire, aigua i neu',
    links: [
      { href: '/aire', label: 'Qualitat de l’aire', blurb: 'L’índex europeu modelat i el que mesuren les estacions.' },
      { href: '/aigua', label: 'Embassaments i rius', blurb: 'Com estan els pantans, els cabals i la sequera.' },
      { href: '/mar', label: 'Platges i mar', blurb: 'Banderes, temperatura de l’aigua, onatge i meduses.' },
      { href: '/neu', label: 'Neu al Pirineu', blurb: 'El gruix mesurat a les estacions d’alçada.' },
    ],
  },
  {
    title: 'Per sortir',
    links: [
      { href: '/senderisme', label: 'Muntanya', blurb: 'Ratxes, fred i la isoterma de zero graus, mesurats.' },
      { href: '/nautica', label: 'Navegar', blurb: 'Vent mesurat, onatge i període, tram a tram.' },
      { href: '/bolets', label: 'Bolets', blurb: 'Quanta pluja ha caigut i quan va ser l’últim ruixat.' },
    ],
  },
  {
    title: 'El projecte',
    links: [
      { href: '/estacions', label: 'Estacions', blurb: 'Les 189 estacions de la XEMA, una per una.' },
      { href: '/dades', label: 'Dades obertes', blurb: 'Tot això en JSON i en CSV, documentat.' },
      { href: '/estat', label: 'Estat de les dades', blurb: 'Quan es va actualitzar cada font per última vegada.' },
    ],
  },
];
