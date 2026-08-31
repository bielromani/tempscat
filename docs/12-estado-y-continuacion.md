# 12 — Estado del proyecto y cómo continuar

**Documento de traspaso.** Léelo entero antes de tocar nada: contiene el estado exacto, las
decisiones ya tomadas y —sobre todo— **las trampas que ya nos han costado horas**. Casi todas
son fallos que no dan error: dan datos plausibles y equivocados.

Última actualización: 31 de agosto de 2026, después de añadir calidad del aire, radar,
ránquings y comparativa comarcal.

---

## Cómo retomar en una conversación nueva

Basta con abrir Claude Code en `C:\Users\bromani\Desktop\Altres\Meteo` y decir:

> Lee `docs/12-estado-y-continuacion.md` y sigue con lo pendiente de la fase 1.

`AGENTS.md` se carga solo en cada sesión y ya contiene las restricciones técnicas duras.

---

## Qué es esto

Plataforma meteorológica de Catalunya con cobertura hasta el núcleo de población. La tesis, en
una frase: **no competir por «el tiempo en Barcelona», sino por «el temps a Lilla»** — 4.293
páginas territoriales con observación real, consenso multimodelo y corrección por altitud.

La justificación cuantificada: de las 3.303 entidades publicadas con altitud comparable, el
**29 % está a 100 m o más** del núcleo de su municipio y el **15 % a 200 m o más**. Eso es un
error sistemático de 1,3 °C o superior para 38.341 habitantes, todos los días, en cualquier web
que muestre un único valor por municipio.

Diseño completo en [`docs/`](.). Empieza por [00 — Resumen ejecutivo](00-resumen-ejecutivo.md).

---

## Estado exacto

| | |
|---|---|
| Fase 0 · territorio | ✅ completada y validada |
| Fase 1 · ingesta y páginas | 🟡 funcional, faltan piezas (ver abajo) |
| Fase 2 · SEO e indexación | ⬜ no empezada |

**Territorio construido** (`data/build/`, versionado):

- 43 comarcas · 947 municipios · 2.759 entidades singulares · 533 núcleos = **4.293 rutas**,
  más `/radar`, `/ranquings` y `/estat`
- 6.769 ubicaciones no publican, cada una con su motivo registrado
- 947 + 43 polígonos, 5.424 relaciones de colindancia real, 3.190 puntos de predicción
- 245 estaciones XEMA (189 operativas)

**Datos vivos** (`data/cache/`, no versionado, se regenera con los workers):

| Fichero | Qué es | Cadencia |
|---|---|---|
| `xema-current.json` | Observación de 188 estaciones, con los extremos del día natural | 10 min |
| `forecast.json` | 3.190 puntos × 19 variables × 168 h · **42 MB** | 12–24 h |
| `warnings.json` | Avisos CAP de AEMET | 15 min |
| `xema-history.json` | Récords y normales de 189 estaciones | 24 h |
| `air-quality.json` | 372 celdas de 0,1° × 18 variables × 72 h | 12 h |
| `radar.json` + `radar/` | 7 marcos de radar × 4 teselas de 512 px · 200 KB | 10 min |
| `freshness.json`, `quota.json` | Estado de las fuentes y consumo | — |

**Medido**: 402 páginas prerenderizadas, TTFB 21 ms en caliente, página de municipio de 38 KB
por la red, **cero JavaScript propio**.

---

## Ya hecho en esta tanda

- ✅ **Calidad del aire y polen.** `scripts/workers/air-quality.ts` + bloque en cada ficha. AQI
  europeo con los colores oficiales de la EEA, el contaminante que manda, siete contaminantes,
  perfil de 24 h, máximo de los próximos tres días y polen por especie con los umbrales de la
  Red Española de Aerobiología. Cuota aparte: 670 unidades por refresco.
- ✅ **Radar de precipitación** en `/radar`, **sin una línea de JavaScript**: las teselas y los
  polígonos del ICGC comparten proyección, así que van en el mismo SVG. El marco se elige por
  URL (`?t=…`), así que cada instante tiene su enlace compartible.
- ✅ **Ránquings** en `/ranquings`: extremos de ahora, máximas y mínimas del día natural,
  amplitud térmica, lluvia y rachas — más una clasificación de municipios corregida por altitud,
  separada y etiquetada como estimación.
- ✅ **Comparativa comarcal** en cada ficha: posición ahora y en el mes en curso, con la tira de
  siete vecinos y los extremos de la comarca.
- ✅ **Legibilidad.** `src/lib/format.ts` centraliza fechas, horas, números y las contracciones
  del catalán. Meteograma rehecho: iconos de cielo, marca de «ara», extremos de cada día
  rotulados, probabilidad de lluvia visible aunque sean 0 mm, unidades en los ejes y leyenda.

## Lo que falta para cerrar la fase 1

Por orden de valor. Ninguna necesita nada del usuario.

1. **Ficha de estación** (`/estacions/[codi]`, 245 rutas). `xema-history.json` ya tiene todo:
   récords, normales, serie de 45 días. Falta rosa de vientos.
2. **Aislar el bloque «ara mateix»** en su propio segmento cacheado. Ahora la página entera se
   revalida cada 30 min por un número que cambia cada hora.
3. **Partir `forecast.json`.** 42 MB en un solo fichero. Está memorizado por `mtime`, así que
   no se reparsea, pero en Vercel eso son 42 MB en el bundle de funciones. Trocear por comarca.
4. **Calidad del aire *medida*, no modelada.** La XVPCA publica los detectores automáticos en el
   portal de datos abiertos (dataset `tasf-thgu`): ~130 estaciones reales frente a un modelo de
   11 km. Es exactamente el mismo argumento que ya se usa con la XEMA frente a la predicción. El
   bloque de aire debería enseñar la medida cuando haya una cerca y el modelo cuando no.
5. **Nowcast del radar.** RainViewer lo publica, el worker ya lo guarda y la página ya lo
   etiqueta distinto — pero hoy la lista viene vacía porque no llueve. Falta verlo con lluvia.

---

## Trampas ya descubiertas

Esta es la parte que más tiempo ahorra. **Todas son reales, todas costaron encontrarlas.**

### Cuotas de Open-Meteo

- **Factura datos, no peticiones**: `peso = max(1, variables/10) × max(1, días/14) × ubicaciones`.
  El multi-punto abarata latencia y conexiones, **no cuota**.
- **Cuatro techos simultáneos**: 600/min, 5.000/hora, 10.000/día y **300.000/mes** (= 9.677/día,
  más apretado que el diario).
- **El que salta primero en un refresco masivo es el horario**, y su síntoma engaña: los lotes
  fallan como si fuera un corte de red y se reintentan seis veces sin éxito. El mensaje real solo
  aparece pidiendo a mano: `429 Hourly API request limit exceeded`.
- Si algo queda sin datos: `npm run worker:forecast -- --tiers=C --fill` pide **solo lo que
  falta**. Recuperar 161 puntos costó 306 unidades frente a 2.206 de relanzar el nivel.

### Formatos y respuestas raras

- **Open-Meteo devuelve `nan` sin comillas** cuando un punto cae fuera del dominio de un modelo.
  No es JSON válido: hay que sanear el texto antes de parsear o se pierde el lote entero.
- **`icon_d2` no cubre Catalunya.** Su dominio es Alemania y los Alpes. Devuelve serie vacía.
- **AROME-HD solo llega a ~48 h.** Como único modelo deja los días 3 a 7 en blanco.
- **AEMET sirve los avisos como un tar** de XML CAP, en ISO-8859-15, y en **dos saltos**: la
  primera petición devuelve una URL temporal.
- **El área de AEMET para Catalunya es la 69.** No está documentada en ningún sitio legible.
- **`tar` en Windows interpreta `C:/...` como host remoto** y falla en silencio. Por eso hay un
  lector de tar propio en `scripts/lib/tar.ts`.

### Socrata y la XEMA

- **`ORDER BY valor` tarda 110 s y expira**: no hay índice en esa columna. Los agregados
  (`max`, `avg`) sí van rápidos, pero no devuelven la fecha del extremo. Por eso el histórico se
  descarga entero y se calcula en local.
- **El dataset semihorario `nzvn-apee` no sirve para récords** (>120 s por consulta). Usa
  **`7bvh-jvq2`**, ya agregado por día: la misma pregunta en menos de un segundo.
- **`codi_estat` viene vacío en los datos recientes.** Filtrar por `'V'` deja la web sin ningún
  dato actual. Se etiquetan como provisionales.
- **El retraso de la XEMA es de 45 a 65 minutos**, variable. Nunca presentes la lectura como si
  fuera de ahora.
- **`9aju-tpwc` trae dos filas basura**: `999998` y `999999`.
- **El Nomenclàtor es de 2021 y dice 42 comarcas. Son 43** desde el Lluçanès (2023). La comarca
  la manda `wpyq-we8x`.

### RainViewer

- **El tilecache público solo llega al zoom 7.** Del 8 en adelante devuelve un PNG que dice
  «Zoom Level Not Supported» **con código 200 y tipo `image/png`**. No falla nada: se descarga, se
  guarda y se pinta. Se detectó porque dos teselas contiguas salían byte a byte idénticas — y
  porque la web mostraba el cartel en grande. El worker comprueba el tamaño y aborta.
- Con teselas de **512 px** el zoom 7 da la densidad de píxeles del 8: cuatro teselas cubren
  Catalunya a unos 460 m/px, por encima de la resolución nativa del radar (~1 km).
- La paleta del PNG **cambia de tesela a tesela** (son PNG indexados y cuantizados), así que no se
  puede extraer una escala de intensidad fija del propio fichero. Por eso la página no publica una
  leyenda numérica en dBZ: sería inventada.

### Calidad del aire

- **Contador aparte del de predicción**, verificado. Es lo que hace viable el bloque sin quitar
  ningún modelo.
- **CAMS trabaja a 0,1°**, así que pedir un punto por ubicación paga diez veces por el mismo
  número interpolado. La unidad es la celda (`src/lib/air-grid.ts`): 372 en vez de 3.190.
- La clave de celda se construye con `toFixed(1)`: la aritmética de coma flotante devuelve
  `41.30000000000001` y sin fijar decimales eso son dos celdas distintas para el mismo sitio.
- **El AQI europeo es el peor de sus subíndices, no una media.** Sin decir cuál manda, el número
  no sirve para decidir nada: un 62 por ozono en julio no se parece a un 62 por NO₂ en hora punta.
- **Los umbrales de polen no son los mismos para todas las especies.** 30 granos de gramínea son
  muchos y 30 de olivo no son casi nada. Una escala única sería un error de bulto.

### Catalán

- **El artículo forma parte del topónimo y se contrae con la preposición.** «de el Prat» y «a el
  Prat» estuvieron publicados. Se arregla con `deName()` y `aName()` de `src/lib/format.ts`.
- **Los meses también**: «al llarg de agost» estuvo publicado un rato. `monthOf()`.
- **`Intl` no da la alternancia `de` / `d'`** de «31 d'agost» y «1 de setembre» con ninguna
  combinación de opciones. Los nombres de mes van a mano, y es por esto.

### JavaScript y fechas

- **`toLocaleString('sv-SE')` devuelve `2026-08-31 10:30` con espacio**, y las series de
  Open-Meteo usan `T`. Sin unificarlos, la búsqueda de «la hora actual» no encuentra nada y cae
  al primer elemento — las 00:00, con UV cero y cielo despejado. No da error: da datos
  plausibles y falsos. Ahora vive en un solo sitio: `localNowHour()` en `src/lib/weather.ts`.
- **Las horas locales no se pasan por `new Date()` para leerlas.** Las series ya vienen en hora
  de Madrid; construir un `Date` las reinterpreta en la zona del servidor, que en Vercel es UTC,
  y las 08:00 se mostrarían como las 06:00. `src/lib/format.ts` trocea la cadena.
- **`Date.now()` dentro de un componente hace saltar `react-hooks/purity`**, y el lint lo marca
  como error, no como aviso. La hora del reloj es un dato y se calcula en la capa de datos: de ahí
  salieron `dayFraction` en `Astronomy` y `ageMin` en `radar()`.
- **Node 24 ejecuta TypeScript borrando tipos, sin transformarlos.** Nada de propiedades de
  parámetro (`constructor(private x)`), `enum`, `namespace` ni decoradores.
- **Los imports relativos de `scripts/` necesitan extensión `.ts` explícita**, que el tsconfig
  de Next no admite. Por eso hay dos proyectos de TypeScript.

### Meteorología

- **En la tabla WMO, el número no es la severidad.** La niebla es el 45 y el cielo cubierto el 3:
  quedarse con el máximo numérico pinta niebla en días de 32 °C.
- **Entre modelos, el más severo no es el consenso.** Si uno de tres ve niebla, quedarse con él
  hace la predicción sistemáticamente más sombría que cualquiera de los modelos por separado.
  Se usa mayoría, con severidad solo como desempate.
- **Una hora de niebla al alba no define un día soleado**, pero una hora de tormenta sí define el
  día. Por eso el resumen diario tiene dos reglas, no una.
- **La cota de nieve no es la isocero.** Con precipitación, la fusión enfría la capa que
  atraviesan los copos y la nieve cuaja 200–300 m por debajo.
- **La media de direcciones se hace con vectores.** La media aritmética de 350° y 10° da 180°,
  que es el viento contrario.
- **La precipitación no se promedia.** Promediar 20 mm y 0 mm da 10 mm, un valor que ningún
  modelo considera probable. Se usa mediana de los que dan lluvia, y probabilidad aparte.
- **La presión de la XEMA (código 34) es de estación, no reducida al nivel del mar.** Compararla
  con `pressure_msl` mete un sesgo proporcional a la altitud.

### Diseño

- **Un panel que se pinta con la escala de temperatura no puede coger los textos de los tokens
  del tema.** En modo oscuro salía gris claro sobre beige claro. Toda la tinta del panel deriva
  ahora del propio dato.
- **La rampa de croma tiene que ser no lineal.** Con rampa lineal, el tramo 15–22 °C —donde cae
  la mayoría de temperaturas catalanas— quedaba incoloro y una lista de municipios se veía toda
  igual.

---

## Decisiones tomadas que no se vuelven a discutir

- **No se usa la API directa de Meteocat.** Su plan gratuito prohíbe redistribuir. Los mismos
  datos XEMA están en el portal de datos abiertos con licencia que sí lo permite.
- **Open-Meteo gratuito es no comercial.** El día que haya publicidad hay que contratar el plan
  de pago **antes**, no después.
- **Sin coordenada fiable no hay página.** 4.293 páginas correctas antes que 11.019 con inventos.
- **No se llama «limítrofe» a lo que solo está cerca.** `adjacent` sale de las líneas de frontera
  del ICGC; la proximidad es `nearest` y se etiqueta distinto.
- **Se dice de dónde viene cada número**: estación, distancia, desnivel y hora de la lectura.
- **No se promete precisión no demostrada.** Hasta la verificación de la fase 4, los modelos
  pesan igual y la página lo dice.
- **Los avisos oficiales no se reescriben ni se recolorean.** Los verdes no se muestran.
- **La astronomía se calcula, no se pide.** Cuota cero y da lo que ninguna API ofrece.
- **Cero JavaScript propio en las páginas territoriales.** El mapa, cuando llegue, no autocarga.

---

## Comandos

```bash
npm run data:all          # reconstruye el territorio desde cero, ~35 min
npm run data:validate     # criterios de aceptación de la fase 0
npm run typecheck         # aplicación y scripts, son dos proyectos
npm run build
npm run start
```

Workers:

```bash
npm run worker:xema       # observación, cada 10 min
npm run worker:radar      # radar RainViewer, cada 10 min
npm run worker:warnings   # avisos AEMET, cada 15 min · necesita .env.local
npm run worker:air        # calidad del aire y polen, cada 12 h
npm run worker:forecast   # predicción · acepta --tiers=A,B,C y --fill
npm run worker:history    # récords y normales, una vez al día

npm run workers:frequent  # xema + radar, los de 10 min
npm run workers:daily     # history + air
```

Pruebas:

```bash
npm run test:catalan      # topónimos, slugs y emparejamiento
npm run test:astronomy    # sol y luna contra valores conocidos
```

---

## Credenciales

`.env.local` (ignorado por git; la plantilla es `.env.example`):

- **`AEMET_API_KEY`** — configurada. **Caduca el 9 de diciembre de 2026.** Se renueva gratis y
  al instante en `opendata.aemet.es`. El worker falla con un mensaje claro cuando toque.
- `SOCRATA_APP_TOKEN` — opcional, sube el throughput del portal de datos abiertos.
- `OPENWEATHER_API_KEY` — opcional, solo para teselas del mapa. Sin pedir todavía.

---

## Riesgos abiertos

| Riesgo | Estado |
|---|---|
| `forecast.json` de 42 MB en el bundle de Vercel | **Sin resolver.** Trocear por comarca |
| Sin base de datos: todo son ficheros | Deliberado. Migración escrita en `db/migrations/001` |
| El token de AEMET caduca cada 90 días | Contemplado, sin automatizar |
| Índice de indexación (fase 2) sin empezar | El riesgo real del proyecto es el *index bloat* |
| Sin verificación de modelos | Fase 4. Necesita 60 días de histórico acumulado |
