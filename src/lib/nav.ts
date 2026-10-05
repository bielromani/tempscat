/**
 * El mapa del lloc, en un sol lloc.
 *
 * Capçalera, peu i portada han de dir el mateix, i fins ara cadascun portava la
 * seva llista a mà. Afegir una pàgina volia dir recordar-se de tres fitxers, i
 * l'única llista completa era la de la capçalera — que és justament on no hi
 * cabia.
 *
 * ## Per què la capçalera només en porta cinc
 *
 * Perquè n'hi havia quinze en una barra que es desbordava, i una barra que
 * s'arrossega en horitzontal no és navegació: és un calaix on les coses
 * desapareixen. Les que hi queden són les que es consulten cada dia; la resta
 * viu al peu, agrupada, i a la portada, amb la seva icona.
 *
 * Com que aquest fitxer no importa res, el poden llegir els dos costats.
 */

export interface NavLink {
  href: string;
  label: string;
  /** Una línia del que hi trobarà. Només la fa servir la portada. */
  blurb?: string;
  /**
   * La icona de la portada: un nom de `public/icons/w/`. Qui no en porta no
   * surt a la portada, només al peu: són les pàgines del projecte i no del
   * temps.
   */
  icon?: string;
}

export interface NavGroup {
  title: string;
  links: NavLink[];
}

/** El que va a la capçalera. Cinc, i que hi càpiguen sense arrossegar. */
export const PRIMARY: NavLink[] = [
  { href: '/radar', label: 'Radar' },
  { href: '/mapa', label: 'Mapa' },
  { href: '/avisos', label: 'Avisos' },
  { href: '/mar', label: 'Platges' },
  { href: '/senderisme', label: 'Muntanya' },
];

/** Tot el lloc, agrupat pel que va a buscar la gent i no per com està fet. */
export const SECTIONS: NavGroup[] = [
  {
    title: 'El temps ara',
    links: [
      { href: '/radar', label: 'Radar de pluja', blurb: 'On plou ara i on ha plogut les dues últimes hores.', icon: 'rain' },
      { href: '/mapa', label: 'Mapa de temperatures', blurb: 'La temperatura de cada comarca, ara mateix.', icon: 'thermometer' },
      { href: '/avisos', label: 'Avisos oficials', blurb: 'Els avisos vigents de l’AEMET.', icon: 'code-orange' },
      { href: '/ranquings', label: 'Rànquings del dia', blurb: 'On fa més calor, més fred i on ha plogut més.', icon: 'clear-day' },
      { href: '/cameres', label: 'Càmeres de muntanya', blurb: 'El Pirineu ara mateix, en imatges.', icon: 'partly-cloudy-day' },
    ],
  },
  {
    title: 'Aire, aigua i neu',
    links: [
      { href: '/mar', label: 'Platges i mar', blurb: 'Banderes, temperatura de l’aigua, onatge i meduses.', icon: 'raindrops' },
      { href: '/neu', label: 'Neu i esquí', blurb: 'Gruix de neu, pistes obertes i fred a cota.', icon: 'snow' },
      { href: '/aigua', label: 'Embassaments i rius', blurb: 'Com estan els pantans i els cabals.', icon: 'humidity' },
      { href: '/aire', label: 'Qualitat de l’aire', blurb: 'L’índex europeu i el que mesuren les estacions.', icon: 'fog' },
    ],
  },
  {
    title: 'Per sortir',
    links: [
      { href: '/senderisme', label: 'Muntanya', blurb: 'Vent i fred als cims, i la cota de zero graus.', icon: 'wind' },
      { href: '/senderisme/rutes', label: 'Itineraris', blurb: 'Els GR i els PR-C, amb el temps a la cota per on passen.', icon: 'sunrise' },
      { href: '/nautica', label: 'Navegar', blurb: 'Vent, onatge i període, tram a tram de costa.', icon: 'barometer' },
    ],
  },
  {
    title: 'El projecte',
    links: [
      { href: '/estacions', label: 'Estacions', blurb: 'Les 189 estacions del Meteocat, una per una.' },
      { href: '/dades', label: 'Dades obertes', blurb: 'Tot en JSON i en CSV, per reutilitzar-ho.' },
      { href: '/estat', label: 'Estat de les dades', blurb: 'Quan s’ha actualitzat cada font.' },
    ],
  },
];

/** Les quatre capitals, amb el seu camí. Les fa servir la portada per a les targetes d'ara. */
export const CAPITAL_PATHS = ['/barcelones/barcelona', '/girones/girona', '/segria/lleida', '/tarragones/tarragona'];

/**
 * Els accessos ràpids de sota el cercador: les capitals i dos llocs de muntanya.
 * Surten a la portada i a la pàgina de «no trobada», que han de dir el mateix.
 */
export const QUICK_PLACES = [
  ...CAPITAL_PATHS,
  '/val-d-aran/vielha-e-mijaran/vielha',
  '/cerdanya/puigcerda',
];
