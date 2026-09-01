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
export function capColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'extreme': return 'var(--cap-red)';
    case 'severe': return 'var(--cap-orange)';
    case 'moderate': return 'var(--cap-yellow)';
    default: return 'var(--cap-green)';
  }
}
