# 06 — UI/UX y visualización

## Principio

El producto tiene dos usuarios y no hay que elegir entre ellos:

- **El 90 %** entra desde Google, mira cinco segundos si lloverá y se va. Necesita la respuesta
  **por encima del pliegue, sin interacción, sin esperar**.
- **El 10 %** es aficionado a la meteorología, quiere modelos, series, comparativas y mapas.
  Es quien comparte enlaces, quien vuelve a diario y quien genera la reputación del sitio.

La solución no es un compromiso a medias: es **progresividad**. La respuesta arriba, la
profundidad debajo. Nadie paga el coste de lo que no usa.

---

## Sistema de diseño

### Color

El color en meteorología es **dato, no decoración**. Regla dura: si un color codifica un valor,
no puede usarse para nada más en la interfaz.

- **Temperatura:** escala divergente anclada en 15 °C, de azul frío a rojo cálido, con paso
  perceptualmente uniforme (OKLCH, no HSL — HSL produce saltos visuales falsos que el ojo
  interpreta como umbrales que no existen).
- **Precipitación:** escala secuencial de un solo tono, blanco → azul intenso, con corte
  explícito en 0 (0 mm debe ser visualmente *nada*, no "azul clarito").
- **Avisos:** los colores oficiales CAP (verde, amarillo, naranja, rojo). No inventarse otros:
  el usuario ya los conoce y cambiarlos es un fallo de seguridad, no de estilo.
- **Interfaz:** neutros. Nada compite con el dato.

Accesibilidad no negociable: contraste AA como mínimo, y **ninguna información codificada solo
por color** — cada aviso lleva icono y texto, cada serie del gráfico lleva etiqueta.

### Tema claro y oscuro

Ambos, respetando `prefers-color-scheme`. Las escalas de color se definen dos veces, no se
invierten mecánicamente: una escala de temperatura que funciona sobre blanco es ilegible sobre
negro.

### Tipografía

Una sola familia variable, autoalojada (nada de Google Fonts: es una petición externa que daña
el LCP y añade una dependencia de privacidad). Cifras tabulares obligatorias en tablas y
gráficos, para que las columnas de números no bailen.

---

## Anatomía de una página de ubicación

```
┌────────────────────────────────────────────────────────┐
│ Migas: Catalunya › Conca de Barberà › Montblanc › Lilla│
├────────────────────────────────────────────────────────┤
│ ⚠  Aviso oficial (solo si existe — nunca ocupa hueco)  │
├────────────────────────────────────────────────────────┤
│  LILLA                                    ☀           │  ← LCP
│  Montblanc · Conca de Barberà · 468 m                  │     HTML puro,
│                                                        │     cero JS
│      18,4°     Sensació 17°                            │
│      ↑24° ↓11°  Vent 12 km/h NO  ·  HR 62 %            │
│                                                        │
│  Dada de l'Espluga de Francolí, a 10,6 km i +22 m      │  ← honestidad
│  Fa 34 min · Meteocat XEMA                             │     radical
├────────────────────────────────────────────────────────┤
│  PRÒXIMES 48 HORES                                     │
│  [meteograma SVG servidor: T + precip + vent]          │  ← SEO
│  Predicció fiable · 5 models coincideixen              │
├────────────────────────────────────────────────────────┤
│  7 DIES  [tarjetas horizontales, tabla semántica]      │
├────────────────────────────────────────────────────────┤
│  Per què el temps a Lilla és diferent                  │  ← contenido
│  Text generat amb dades reals: altitud, orientació…    │     único
├────────────────────────────────────────────────────────┤
│  ▼ Comparativa de models    (plegado, uPlot en demanda)│
│  ▼ Mapa interactiu          (imagen + botón)           │
│  ▼ Històric i rècords                                  │
│  ▼ Índexs d'activitat: bolets, senderisme              │
├────────────────────────────────────────────────────────┤
│  Altres nuclis de Montblanc  ·  Municipis veïns        │  ← enlazado
└────────────────────────────────────────────────────────┘
```

Lo que hay que notar: **todo lo caro está plegado**. El mapa, los gráficos interactivos y el
histórico no se cargan hasta que el usuario los pide. El 90 % nunca paga por ellos, y las
métricas de rendimiento —que son factor de posicionamiento— se miden sobre lo que carga por
defecto.

---

## Los gráficos

### Meteograma principal — SVG de servidor

El componente central. Tres variables superpuestas en un solo gráfico legible:

- Área de temperatura con relleno de degradado según el valor.
- Barras de precipitación en un eje secundario, con la banda de incertidumbre p10–p90.
- Flechas de viento en una franja inferior, cada 3 h.
- Bandas verticales sutiles para la noche.
- Marcador claro de "ahora".

Renderizado como SVG en el servidor con `d3-scale` y `d3-shape`. Sin JavaScript, sin CLS, y
—decisivo— **el crawler ve los valores** dentro del marcado.

Interacción sin JS: una capa de `<title>` por punto da tooltip nativo del navegador. Si se
quiere hover fino, una isla de ~2 KB lo añade tras la hidratación, sin bloquear nada.

### Series exploratorias — uPlot

Para histórico largo, comparativa de modelos y ensembles. 40 KB, maneja decenas de miles de
puntos con zoom fluido. Se carga con `dynamic()` + `IntersectionObserver`.

### Visualizaciones específicas

| Visual | Uso | Por qué así |
|---|---|---|
| **Rosa de vientos** | Ficha de estación | Polar; una barra por sector con frecuencia e intensidad |
| **Espagueti de ensemble** | Predicción incierta | Muestra la dispersión real; comunica duda mejor que cualquier texto |
| **Heatmap año × día** | Climatología | Un año entero de anomalía térmica de un vistazo |
| **Perfil de altitud de cota de nieve** | Vertical nieve | Corte vertical del valle con la cota marcada; es *la* pregunta del Pirineo |
| **Barras apiladas de embalses** | Sequía | Volumen actual vs. capacidad vs. media histórica |
| **Pirámide de anomalía comarcal** | Comparativas | Ordena las 43 comarcas por desviación respecto a su normal |

---

## Mapa interactivo

MapLibre GL JS + Protomaps autoalojado. **Nunca autocarga en páginas territoriales**; vive en
`/mapa` y en un bloque plegado.

Capas conmutables:

- Observación XEMA en vivo (245 puntos, valor coloreado, cambia de variable)
- Radar de precipitación animado (RainViewer), últimos 90 min + 30 min de nowcast
- Temperatura / precipitación / viento / nubes (tiles OWM proxeadas)
- Avisos oficiales como polígonos CAP
- Rayos, cuando exista acceso a XDDE
- Contorno de comarcas y municipios, clicable → navega a la página

Detalles que marcan la diferencia:

- **Deep links con estado**: `/mapa?capa=radar&z=9&lat=41.8&lon=1.9` — compartible e indexable.
- **Clic en cualquier punto** → tarjeta con la ubicación poblada más cercana y enlace a su
  página. Convierte el mapa en un motor de enlazado interno.
- El mapa recuerda la última capa vista (`localStorage`).

---

## Responsive

Móvil primero de verdad: la mayoría del tráfico de búsqueda meteorológica es móvil y a menudo
en mala conexión.

| Ancho | Adaptación |
|---|---|
| < 640 px | Una columna. Meteograma con scroll horizontal dentro de su contenedor (nunca la página). Objetivos táctiles ≥ 44 px |
| 640–1024 px | Dos columnas para las tarjetas de 7 días |
| > 1024 px | Rejilla de dashboard; barra lateral con municipios de la comarca |
| > 1440 px | Ancho máximo de contenido; el mapa puede ocupar más |

Regla absoluta: **la página nunca hace scroll horizontal**. Todo contenido ancho (tablas,
gráficos, mapas) tiene su propio contenedor con `overflow-x: auto`.

---

## Búsqueda

Es la funcionalidad interactiva más usada y merece cuidado desproporcionado:

- Autocompletado sobre las ~11.000 ubicaciones, con `pg_trgm` + `unaccent`: "guardia prats"
  encuentra "la Guàrdia dels Prats", "montblanch" encuentra "Montblanc".
- Resultados jerárquicos: muestra el municipio y la comarca de cada núcleo, porque hay
  topónimos repetidos (hay varios "Sant Martí").
- Geolocalización opcional → núcleo más cercano, no municipio más cercano. Ese detalle es todo
  el producto en una interacción.
- Historial de las últimas ubicaciones consultadas en `localStorage`.
- Funciona sin JavaScript: `<form>` que hace GET a `/cerca?q=`, que es además una página
  indexable.

---

## Accesibilidad

No es opcional y además coincide con lo que Google premia:

- Navegación completa por teclado, incluido el mapa (flechas para desplazar, `+`/`-` para zoom).
- Cada gráfico con `role="img"` y un `aria-label` que resume la serie en palabras.
- Tabla equivalente disponible bajo cada gráfico, en un `<details>`.
- Contraste AA mínimo en ambos temas.
- `prefers-reduced-motion` respetado: sin animación de radar automática para quien la desactiva.
- Idioma correcto por página (`lang="ca"`, `lang="es"`, `lang="en"`).
