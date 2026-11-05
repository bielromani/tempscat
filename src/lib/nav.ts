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
 * Com que aquest fitxer només importa `lang.ts`, que no importa res, el poden
 * llegir els dos costats.
 */

import { tr, type Lang } from './lang.ts';

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
export function primary(lang: Lang): NavLink[] {
  return [
    { href: '/radar', label: 'Radar' },
    { href: '/mapa', label: 'Mapa' },
    { href: '/avisos', label: tr(lang, 'Avisos', 'Avisos') },
    { href: '/mar', label: tr(lang, 'Platges', 'Playas') },
    { href: '/senderisme', label: tr(lang, 'Muntanya', 'Montaña') },
  ];
}

/** Tot el lloc, agrupat pel que va a buscar la gent i no per com està fet. */
export function sections(lang: Lang): NavGroup[] {
  const t = (ca: string, es: string) => tr(lang, ca, es);
  return [
    {
      title: t('El temps ara', 'El tiempo ahora'),
      links: [
        { href: '/radar', label: t('Radar de pluja', 'Radar de lluvia'), blurb: t('On plou ara, en un mapa que s’amplia, amb la temperatura i el vent.', 'Dónde llueve ahora, en un mapa ampliable, con la temperatura y el viento.'), icon: 'rain' },
        { href: '/mapa', label: t('Mapa de temperatures', 'Mapa de temperaturas'), blurb: t('La temperatura de cada comarca, ara mateix.', 'La temperatura de cada comarca, ahora mismo.'), icon: 'thermometer' },
        { href: '/avisos', label: t('Avisos oficials', 'Avisos oficiales'), blurb: t('Els avisos vigents de l’AEMET.', 'Los avisos vigentes de la AEMET.'), icon: 'code-orange' },
        { href: '/ranquings', label: t('Rànquings del dia', 'Rankings del día'), blurb: t('On fa més calor, més fred i on ha plogut més.', 'Dónde hace más calor, más frío y dónde ha llovido más.'), icon: 'clear-day' },
        { href: '/cameres', label: t('Càmeres de muntanya', 'Cámaras de montaña'), blurb: t('El Pirineu ara mateix, en imatges.', 'El Pirineo ahora mismo, en imágenes.'), icon: 'partly-cloudy-day' },
      ],
    },
    {
      title: t('Aire, aigua i neu', 'Aire, agua y nieve'),
      links: [
        { href: '/mar', label: t('Platges i mar', 'Playas y mar'), blurb: t('Banderes, temperatura de l’aigua, onatge i meduses.', 'Banderas, temperatura del agua, oleaje y medusas.'), icon: 'raindrops' },
        { href: '/neu', label: t('Neu i esquí', 'Nieve y esquí'), blurb: t('Gruix de neu, pistes obertes i fred a cota.', 'Espesor de nieve, pistas abiertas y frío en altura.'), icon: 'snow' },
        { href: '/aigua', label: t('Embassaments i rius', 'Embalses y ríos'), blurb: t('Com estan els pantans i els cabals.', 'Cómo están los pantanos y los caudales.'), icon: 'humidity' },
        { href: '/aire', label: t('Qualitat de l’aire', 'Calidad del aire'), blurb: t('L’índex europeu i el que mesuren les estacions.', 'El índice europeo y lo que miden las estaciones.'), icon: 'fog' },
      ],
    },
    {
      title: t('Per sortir', 'Para salir'),
      links: [
        { href: '/senderisme', label: t('Muntanya', 'Montaña'), blurb: t('Vent i fred als cims, i la cota de zero graus.', 'Viento y frío en las cimas, y la cota de cero grados.'), icon: 'wind' },
        { href: '/senderisme/rutes', label: t('Itineraris', 'Rutas'), blurb: t('Els GR i els PR-C, amb el temps a la cota per on passen.', 'Los GR y los PR-C, con el tiempo a la cota por la que pasan.'), icon: 'sunrise' },
        { href: '/nautica', label: t('Navegar', 'Navegar'), blurb: t('Vent, onatge i període, tram a tram de costa.', 'Viento, oleaje y periodo, tramo a tramo de costa.'), icon: 'barometer' },
      ],
    },
    {
      title: t('El projecte', 'El proyecto'),
      links: [
        { href: '/estacions', label: t('Estacions', 'Estaciones'), blurb: t('Les 189 estacions del Meteocat, una per una.', 'Las 189 estaciones del Meteocat, una a una.') },
        { href: '/dades', label: t('Dades obertes', 'Datos abiertos'), blurb: t('Tot en JSON i en CSV, per reutilitzar-ho.', 'Todo en JSON y en CSV, para reutilizarlo.') },
        { href: '/estat', label: t('Estat de les dades', 'Estado de los datos'), blurb: t('Quan s’ha actualitzat cada font.', 'Cuándo se ha actualizado cada fuente.') },
      ],
    },
  ];
}

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
