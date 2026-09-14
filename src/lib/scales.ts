/**
 * Escalas de color para datos meteorológicos.
 *
 * Todo en OKLCH: pasos iguales de tono dan pasos iguales de luminosidad
 * percibida. En HSL no ocurre, y el resultado son bandas que el ojo lee como
 * umbrales inexistentes en los datos.
 */

/**
 * Temperatura: escala divergente anclada en 15 °C, del azul frío al rojo
 * cálido. El ancla no es arbitraria — es la temperatura en la que la mayoría de
 * la gente no siente ni frío ni calor, así que el punto neutro de la escala
 * coincide con el punto neutro de la experiencia.
 */
/**
 * Luminosidad que tendrá el color de esa temperatura, en porcentaje.
 *
 * La usan las dos funciones de abajo, y por eso existe: el color y la tinta que
 * va encima **tienen que salir del mismo cálculo**. Cuando no lo hacían, la
 * tinta se elegía comparando grados —«a partir de 30 °C, texto claro»— y eso es
 * adivinar: a 30 °C el fondo tiene un 72 % de luminosidad y el texto blanco
 * encima no se lee. Se veía en el mapa de comarques, con los 30 y los 31 en
 * blanco sobre naranja claro.
 */
function lightness(c: number): number {
  const t = Math.max(-15, Math.min(45, c));
  return t <= 15
    ? 55 + ((t + 15) / 30) * 33
    : 88 - ((t - 15) / 30) * 32;
}

export function temperatureColor(c: number): string {
  const t = Math.max(-15, Math.min(45, c));

  /*
   * El croma crece con raíz cuadrada, no linealmente.
   *
   * Con una rampa lineal, el tramo 15–22 °C —donde cae la mayoría de las
   * temperaturas catalanas la mayor parte del año— quedaba prácticamente
   * incoloro, y una lista de municipios con 16, 18 y 21 °C se veía toda igual.
   * El color dejaba de codificar nada justo donde más se consulta.
   *
   * La raíz concentra la diferenciación cerca del ancla sin quitar fuerza a los
   * extremos, que siguen llegando a azul y rojo saturados.
   */
  if (t <= 15) {
    const k = (t + 15) / 30;              // 0 = −15 °C, 1 = 15 °C
    const l = lightness(t);
    const chroma = 0.01 + 0.15 * Math.sqrt(1 - k);
    const hue = 250 - k * 25;
    return `oklch(${l.toFixed(1)}% ${chroma.toFixed(3)} ${hue.toFixed(0)})`;
  }
  const k = (t - 15) / 30;                // 0 = 15 °C, 1 = 45 °C
  const l = lightness(t);
  const chroma = 0.01 + 0.16 * Math.sqrt(k);
  const hue = 75 - k * 50;
  return `oklch(${l.toFixed(1)}% ${chroma.toFixed(3)} ${hue.toFixed(0)})`;
}

/**
 * Precipitación: secuencial de un solo tono. Corte explícito en 0 — cero
 * milímetros tiene que verse como *nada*, no como "azul clarito", que es el
 * error que hace que la gente crea que va a llover cuando no.
 */
export function precipitationColor(mm: number): string {
  if (mm < 0.1) return 'transparent';
  const k = Math.min(1, Math.log10(mm + 1) / Math.log10(51));
  const l = 78 - k * 32;
  const chroma = 0.05 + k * 0.13;
  return `oklch(${l.toFixed(1)}% ${chroma.toFixed(3)} 245)`;
}

/**
 * Texto legible sobre un fondo de la escala de temperatura.
 *
 * El umbral sale de la luminosidad real del fondo, no de la temperatura. En
 * esta escala el extremo cálido **nunca baja lo suficiente** como para pedir
 * texto claro —a 45 °C todavía está al 56 %—, así que el blanco solo aparece en
 * el frío de verdad, que es donde el fondo sí se oscurece.
 */
export function temperatureInk(c: number): string {
  return lightness(c) < 62 ? 'oklch(98% 0.005 240)' : 'oklch(24% 0.02 250)';
}

/** Nivel de aviso CAP → variable de color. Nunca se inventan colores propios. */
/**
 * Escala seqüencial per a una concentració, del zero al pitjor valor del dia.
 *
 * Relativa i no absoluta a posta. Les bandes europees d'`air-variables.ts`
 * són d'un **índex horàri** i el que la XVPCA publica és una **mitjana
 * diària**: pintar-hi els colors de l'índex donaria un mapa amb els noms de
 * les bandes oficials i uns valors que no són els que aquelles bandes
 * classifiquen. Això ordena el que hi ha —on n'hi ha més i on menys— i el
 * peu diu que és això i no una qualificació.
 */
export function concentrationColor(value: number, worst: number): string {
  const k = worst > 0 ? Math.max(0, Math.min(1, value / worst)) : 0;
  return `oklch(${(88 - k * 40).toFixed(0)}% ${(0.03 + k * 0.14).toFixed(3)} ${(95 - k * 75).toFixed(0)})`;
}

/**
 * De la cota al color: verd de plana, ocre de serra, blanc de cim.
 *
 * Per al mapa de la xarxa, on la pregunta és **on** hi ha termòmetres i a
 * quina alçada. El pas de 1.500 m és on la coberta canvia de bosc a prat, i
 * per això el color hi gira i no puja de manera plana.
 */
export function altitudeColor(m: number): string {
  const k = Math.max(0, Math.min(1, m / 2600));
  return `oklch(${(62 + k * 32).toFixed(0)}% ${(0.11 - k * 0.09).toFixed(3)} ${(145 - k * 65).toFixed(0)})`;
}

/**
 * De l'alçada de l'onada al color: del mar pla al gruixut.
 *
 * El sostre són quatre metres i no el màxim del dia, a diferència de
 * `concentrationColor`. Aquí hi ha una referència externa que tothom
 * comparteix —l'escala Douglas, que `sea.ts` ja fa servir per posar-hi nom— i
 * amb una escala relativa un dia de calma sortiria vermell perquè en algun
 * tram hi hauria mig metre.
 */
export function waveColor(m: number): string {
  const k = Math.max(0, Math.min(1, m / 4));
  return `oklch(${(84 - k * 34).toFixed(0)}% ${(0.04 + k * 0.13).toFixed(3)} ${(215 - k * 190).toFixed(0)})`;
}

/**
 * De la ratxa al color, amb el gir als 61 km/h.
 *
 * El llindar no és decoratiu: és el vuit de l'escala de Beaufort, on el vent
 * deixa de molestar i comença a decidir si es camina dret en una carena. Per
 * sota, l'escala puja de mica en mica; a partir d'allà se'n va cap al roig de
 * pressa, perquè la diferència entre 65 i 95 km/h importa molt més que la
 * que hi ha entre 15 i 45.
 */
export function gustColor(kmh: number): string {
  const k = Math.max(0, Math.min(1, kmh / 61));
  if (kmh <= 61) {
    return `oklch(${(90 - k * 22).toFixed(0)}% ${(0.02 + k * 0.09).toFixed(3)} ${(230 - k * 130).toFixed(0)})`;
  }
  const j = Math.max(0, Math.min(1, (kmh - 61) / 59));
  return `oklch(${(68 - j * 16).toFixed(0)}% ${(0.11 + j * 0.07).toFixed(3)} ${(100 - j * 75).toFixed(0)})`;
}

export function capColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'extreme': return 'var(--cap-red)';
    case 'severe': return 'var(--cap-orange)';
    case 'moderate': return 'var(--cap-yellow)';
    default: return 'var(--cap-green)';
  }
}

/**
 * El mateix color, escrit en hexadecimal.
 *
 * ## Per què cal, i per què no ho diu ningú
 *
 * Totes les escales d'aquest fitxer són OKLCH perquè és l'espai on una rampa
 * de color té passos que es veuen iguals. El navegador l'entén des de fa anys.
 * **MapLibre no**: al seu analitzador de colors no hi surt la paraula `oklch`
 * ni una sola vegada.
 *
 * I el que passa quan no l'entén no és un error: la capa es queda sense pintar
 * i el mapa surt igual de bé, amb el mapa base a sota i el rètol dient «924
 * municipis observats». Tot correcte i cap color. Es va veure mirant el mapa,
 * no cap registre.
 *
 * Així que la conversió es fa aquí i **l'escala segueix sent una de sola**:
 * `temperatureColor()` mana, i això només tradueix el que ella diu. Amb una
 * segona escala escrita com una interpolació de MapLibre, el dia que algú
 * toqués la rampa, el mapa de comarques i el de municipis pintarien el mateix
 * grau de dos colors diferents.
 *
 * Fora de gamut es retalla per canal. Amb els cromes d'aquestes escales
 * —0,15 com a màxim— no passa gairebé mai, i quan passa val més un color una
 * mica menys saturat que un de negre.
 */
export function oklchToHex(css: string): string {
  const m = css.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m) return css;

  const L = +m[1] / 100;
  const C = +m[2];
  const h = (+m[3] * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  // OKLab → LMS, i el cub que desfà l'arrel cúbica de la definició.
  const l3 = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;

  const lin = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
  ];

  const hex = lin.map((v) => {
    // Corba de transferència de l'sRGB, que no és una gamma de 2,2 i prou.
    const g = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.abs(v) ** (1 / 2.4) - 0.055;
    const n = Math.round(Math.min(1, Math.max(0, g)) * 255);
    return n.toString(16).padStart(2, '0');
  });

  return `#${hex.join('')}`;
}
