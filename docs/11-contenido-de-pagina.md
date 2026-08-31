# 11 — Qué lleva dentro una página de ubicación

Referencia de qué se muestra, de dónde sale cada dato y por qué está donde está.

---

## El principio de orden

Dos usuarios, y no hay que elegir:

- **El 90 %** entra desde Google, mira si lloverá y se va en cinco segundos.
- **El 10 %** quiere modelos, series y récords. Es quien comparte enlaces y vuelve.

La solución no es un término medio: es **progresividad**. La respuesta arriba, sin interacción
y sin esperar; la profundidad debajo y plegada. Nadie paga el coste de lo que no usa, y las
métricas de rendimiento —que son factor de posicionamiento— se miden sobre lo que carga por
defecto.

**La página no lleva una sola línea de JavaScript propio.** Todo se renderiza en el servidor.

---

## Bloques, en orden de aparición

| # | Bloque | Fuente | Coste de cuota |
|---|---|---|---|
| 1 | Migas de pan | territorio | — |
| 2 | **Avisos oficiales** | AEMET CAP | 2 llamadas cada 15 min, para toda Catalunya |
| 3 | **Condiciones actuales** | XEMA + predicción de la hora | — |
| 4 | Meteograma 48 h | consenso multimodelo | incluido |
| 5 | Tarjetas de 7 días | consenso multimodelo | incluido |
| 6 | **Tabla hora a hora** | consenso multimodelo | incluido |
| 7 | **Sol i lluna** | calculado en local | **cero** |
| 8 | Texto único del lugar | territorio | — |
| 9 | **Clima i rècords** | serie diaria XEMA | 2 consultas/estación/día |
| 10 | Núcleos hermanos | territorio | — |
| 11 | Municipios limítrofes | colindancia ICGC | — |

---

## 2 · Avisos oficiales

Es el dato más delicado del sitio. Reglas que no se negocian:

- **Colores oficiales CAP**, no una paleta propia. El usuario ya los reconoce.
- **Nunca se reescribe el texto ni se ajusta el nivel.**
- Siempre se dice quién lo emite, cuándo, y con enlace al original.
- **Los avisos verdes no se muestran.** Verde significa «sin aviso»; ocupar la franja con eso
  restaría fuerza a los que sí importan.

La asignación a cada ubicación se hace **por geometría**, no por nombre de zona: los polígonos
de AEMET no siguen los límites comarcales. Se comprobó sobre un aviso real de nevadas: sus 16
zonas cubren 4.223 de las 4.250 ubicaciones publicadas, cada una asignada por punto en polígono.

Código de área de AEMET Meteoalerta para Catalunya: **69**. No está documentado en ninguna
parte legible; se dedujo descargando el archivo de toda España y mirando qué topónimos traía
cada código.

---

## 3 · Condiciones actuales

Mezcla dos fuentes y lo dice:

- **De la estación XEMA**: temperatura, humedad, viento, racha, presión, lluvia acumulada 24 h.
- **De la predicción de esa hora**: estado del cielo, nubosidad, punto de rocío, índice UV,
  visibilidad. Son variables que la estación no mide.

La temperatura viene **corregida por el desnivel** entre la ubicación y su estación, y el panel
lo dice explícitamente: «l'estació marca 18,2 °C a 446 m».

> **Un fallo de diseño que costó encontrar.** El panel se pinta con la escala de temperatura,
> pero los textos cogían color de los tokens del tema. En modo oscuro eso daba gris claro sobre
> beige claro: ilegible. Ahora **toda la tinta del panel deriva de la propia temperatura**, así
> que funciona a −10 °C y a 40 °C, y en los dos temas, porque no depende de ninguno.

---

## 6 · Tabla hora a hora

Es una `<table>` semántica de verdad, no una rejilla de divs. Tres razones:

1. Un lector de pantalla la recorre por filas y columnas.
2. El crawler la entiende como datos y puede acabar en un fragmento destacado.
3. El usuario puede copiarla y pegarla en una hoja de cálculo.

Once columnas: hora, cielo, temperatura, sensación, precipitación, probabilidad, viento, racha,
humedad, UV y nieve. Las dos últimas solo aparecen si hay dato.

---

## 7 · Sol y luna: cero coste, más alcance

Nada de este bloque se pide a ninguna API. Se calcula en `src/lib/astronomy.ts` con el
algoritmo NOAA para el sol y los términos principales de Meeus para la luna.

Dos razones, y la segunda importa más que la primera:

- **Cuota.** Orto y ocaso serían dos variables más en cada petición. Con peso = variables/10,
  eso es un 20 % de sobrecoste en 3.190 puntos diarios, para algo que se calcula exacto.
- **Alcance.** Ninguna API meteorológica da fase lunar, crepúsculos civiles, mediodía solar ni
  cuánto alarga el día respecto a ayer. Son justo los datos que enriquecen una ficha de lugar.

> **Un error que solo se ve comparando.** La primera versión usaba solo el término principal de
> la longitud lunar y daba «gibosa creixent» con el disco al 98 % — cualquiera que mire al cielo
> ve que eso es luna llena. Faltaban la evección y la variación, que corrigen un desfase de casi
> dos días. Y el nombre de la fase se deriva ahora de la **iluminación**, no de la fracción de
> ciclo: la órbita es elíptica, así que a igual fracción corresponde distinta iluminación.

Validación: solsticio de verano en Barcelona 06:19 → 21:29 (real 06:17 → 21:29), 15 h 10 min
de día frente a 9 h 11 min en el de invierno.

---

## 9 · Clima y récords

Es lo que separa una ficha de lugar de un widget de predicción, y sale entera de la serie
diaria de la XEMA:

- **Anomalía del mes en curso** frente a la normal de la propia estación. No frente a una media
  regional ni a una reanálisis global: para un fondo de valle con inversión térmica, la media de
  ERA5 en su celda de 25 km no describe lo que pasa allí.
- **Contadores del año**: días de verano, días de calor, noches tropicales, días de helada, días
  de lluvia. Mes y año.
- **Récords absolutos** con su fecha: máxima, mínima, día más lluvioso, racha de viento.
- **Últimos 30 días** en gráfico y tabla.
- **Racha seca** actual, si supera cinco días.

### Las dos consultas que lo hacen posible

**Uno.** El primer intento agregaba sobre `nzvn-apee`, la serie semihoraria: cientos de millones
de filas, y una sola consulta superaba los 120 s. La XEMA publica además **`7bvh-jvq2`, datos
diarios ya agregados** — 33 millones de filas — donde la misma pregunta se responde en menos de
un segundo.

**Dos.** En ese dataset, `ORDER BY valor` **tarda 110 segundos y expira**: no hay índice sobre
la columna de valores. Los agregados (`max`, `avg`) van por otro camino y sí responden rápido,
pero no devuelven la fecha del extremo.

La salida: descargar la serie diaria completa de cada estación —unos 40.000 registros, 4,6 s— y
calcular récords, normales y contadores **en local**. Dos peticiones por estación en vez de
nueve, y sin depender de qué indexa Socrata.

Resultado para Malgrat de Mar, con 21 años de serie: máxima 38,8 °C (16/8/2025), mínima −7,3 °C
(5/2/2012), día más lluvioso 131,6 mm (24/10/2011), racha 104 km/h (4/3/2017).

---

## Variables de predicción: qué se pide y a quién

Open-Meteo factura **datos**, no peticiones: `peso = max(1, variables/10) × max(1, días/14) ×
ubicaciones`. Pedir 19 variables en vez de 10 casi duplica el coste de cada punto.

Por eso hay dos conjuntos:

| Conjunto | Variables | Peso | A quién |
|---|---|---|---|
| **Esencial** | temperatura, sensación, precipitación, probabilidad, código de tiempo, nubosidad, humedad, viento, dirección, racha | 1,0 | todos los niveles |
| **Rico** | lo anterior + punto de rocío, presión, UV, visibilidad, isocero, nieve, gruesor, radiación, CAPE | 1,9 | solo nivel A |

Presupuesto resultante:

| Paso | Unidades/día |
|---|---|
| A · rico · `best_match` · 2 refrescos | 1.330 |
| A · esencial · AROME + ECMWF · 3 refrescos | 2.100 |
| B · esencial · 2 refrescos | 3.358 |
| C · esencial · 1 refresco | 1.161 |
| **Total** | **7.949 / 10.000 diario · 238.470 / 300.000 mensual** |

> **El techo que aprieta es el mensual, no el diario.** 300.000/mes son 9.677/día de media, no
> 10.000. Es un detalle fácil de pasar por alto y que se descubre tarde.

### Por qué `best_match` y no AROME en los niveles B y C

AROME resuelve a 1,5 km, que es mejor. Pero **solo llega a ~48 horas**: con él como único
modelo, 1.679 municipios mostraban las tarjetas de los días 3 a 7 vacías. Se vio renderizando,
no en los registros.

`best_match` es la mezcla propia de Open-Meteo: cubre los 7 días y, donde hay AROME, ya lo usa
para el corto plazo. No se pierde resolución; se gana horizonte, al mismo coste.

---

## Cota de nieve: por qué no es la isocero

La cota de nieve y el nivel de congelación no coinciden. Con precipitación, la fusión de los
copos enfría la capa de aire que atraviesan y la nieve cuaja **entre 200 y 300 m por debajo**
del nivel de congelación teórico.

Dar la isocero como cota de nieve es el error clásico, y hace que la gente suba a buscar nieve
donde no la hay. Se aplica una corrección de 250 m y se redondea a 50 m, que es la precisión
que el dato admite.
