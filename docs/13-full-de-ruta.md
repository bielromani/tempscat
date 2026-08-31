# 13 — Hoja de ruta

Los pasos a seguir, en orden, con la decisión técnica de cada uno ya tomada y el
coste estimado. Complementa a [12 — Estado y continuación](12-estado-y-continuacion.md),
que dice dónde estamos; esto dice hacia dónde y por qué en ese orden.

---

## El criterio de orden

Tres reglas, y la tercera es la que más discusiones ahorra.

**1. Primero lo que no necesita nada nuevo.** Cada pieza que solo reorganiza
datos ya descargados sale gratis en cuota, en infraestructura y en riesgo. El
titular en catalán no costó ni una petición y es la mejora más grande que ha
tenido la web.

**2. Después las fuentes verificadas.** Verificada quiere decir *pedida contra la
API de verdad y con la respuesta pegada en el documento*, no encontrada en una
lista de fuentes prometedoras. Al final de este documento están las cinco que lo
están, con su identificador y su formato.

**3. Lo que rompe un principio va a su propia ruta, no a las 4.293 fichas.**

Esta última merece una explicación, porque es la que decide si los mapas
interactivos y los taulers son posibles o no.

### Cero JavaScript no significa cero JavaScript en el sitio

El principio dice: **cero JavaScript propio en las páginas territoriales.** Y ahí
se queda tal cual, porque el argumento sigue siendo el mismo: son 4.293 rutas que
viven del tráfico de búsqueda, el 90 % entra, mira si lloverá y se va, y ninguna
de ellas debe pagar un bundle para eso.

Un mapa interactivo y un tauler configurable son **otro producto** sobre los
mismos datos, con otro usuario: el que ya conoce el sitio y vuelve. Van en sus
propias rutas (`/mapa`, `/tauler`), cargan su JavaScript solo ahí, y no aparecen
en ningún sitemap de contenido territorial. El principio no se relaja: se le pone
frontera.

La prueba de que la frontera está bien puesta es medible: si la página de
Montblanc sigue pesando 38 KB por la red y sigue sirviéndose sin hidratación
después de que exista `/mapa`, la frontera aguanta.

---

## Fase 1.6 — cerrar la fase 1

Sin JavaScript, sin base de datos. Todo esto cabe con la arquitectura de hoy.

### 1. Feeds por ubicación · ✅ hecho

`/api/lloc/{comarca}/{municipi}[/{nucli}]` en JSON, con `?format=csv` para la
serie horaria y `?hours=` hasta 168. Más `/api/ranquings`. Documentado para
personas en `/dades`, que sí va indexada — al contrario que las respuestas del
feed, que llevan `X-Robots-Tag: noindex` para no alimentar el *index bloat* que
es el riesgo declarado del proyecto.

Iba primero por una razón de orden, no de valor: **es la API que consumirán el
tauler y los widgets.** Construir el tauler antes habría significado leer
directamente los ficheros de `data/cache/`, y el día de embeber un widget en otro
sitio habría tocado inventar la API otra vez y migrar el tauler.

Lo que lleva y nadie más publica: `temperature_station` junto a `temperature`
—cruda y corregida por desnivel, para que el consumidor juzgue la corrección—,
`peak_precipitation` con la intensidad de la hora punta, `spread` entre modelos,
y el bloque `summary` con las frases en catalán.

Decisiones que quedan cerradas: nombres de campo en **inglés y snake_case** (son
los slugs canónicos de `variables.ts`, y traducirlos crearía un segundo sistema
de nombres), `version` en cada respuesta, atribución dentro del propio JSON
porque la CC-BY la exige, y `Access-Control-Allow-Origin: *` porque el destino
natural es un widget en el navegador de otra persona.

### 2. Ficha de estación · ✅ hecho · 190 rutas nuevas

`/estacions` y `/estacions/[codi]`, con las 189 en servicio. Publica lo que ya
estaba descargado y no se veía: récords absolutos con su fecha, normales mes a
mes calculadas sobre la propia serie, contadores del año, los últimos 45 días — y
la rosa de los vientos.

Lo que separa esta página de la de un municipio, dicho arriba y no en una nota al
pie: **aquí no hay ninguna corrección**. Es la lectura del termómetro en su cota.

El índice dice también lo que suele esconderse: 4.293 lugares publicados con 189
termómetros, y qué comarca no tiene ninguno — hoy, el Moianès.

#### La rosa de los vientos

Se construye con la **dirección de la racha máxima de cada día** (variable 1515)
de toda la serie, no con la dirección media diaria (1509). La media vectorial de
un día entero cancela el ciclo diurno: en el litoral, marinada de tarde y terral
de madrugada se anulan y la media apunta a un sector donde casi nunca sopla.

Sale gratis en consultas: la dirección entra como una variable más en la consulta
de serie completa que el worker ya hacía.

Y hay que pedirla **en las tres alturas**, no solo a 10 m. Es la misma trampa que
`variables.ts` ya documentaba para los códigos semihorarios: las estaciones de
alta montaña y las de emplazamiento difícil miden a 6 o a 2 m, porque a 10 m el
mástil no aguanta el hielo. Pidiendo solo la de 10 m, **87 de 189 estaciones se
quedaban sin rosa**, algunas con cuatro mil días de serie. Con la cascada
10 → 6 → 2 son 166: cien miden a 10 m, quince a 6 y **cincuenta y una a 2**.

La altura elegida se publica en la propia rosa, porque cambia las cifras: a 2 m el
viento se mide sensiblemente más flojo, y comparar la racha media de una estación
de montaña con una de llano sin decirlo es comparar dos cosas distintas. Las tres
alturas no se mezclan nunca en la misma rosa: gana la que tenga más días.

La rosa se muestra **también en el bloque de clima de cada ficha**, no solo en
`/estacions`. Es una decisión de alcance: allí la ven 189 páginas y aquí 4.293, el
dato es el mismo —es de la estación de referencia— y esa sección ya va toda
atribuida a ella.

Dos detalles de dibujo que cambian la lectura:

- **El radio va con la raíz de la frecuencia.** El área crece con el cuadrado del
  radio, así que un radio proporcional al dato hace que un sector del 20 % ocupe
  cuatro veces más superficie que uno del 10 %, no el doble. El ojo compara áreas.
- **El color codifica la racha media del sector.** Frecuencia y fuerza son dos
  preguntas distintas y con dos canales caben las dos.

Y la leyenda dice qué **no** contesta: la frecuencia de las brisas suaves. La
marinada de cada tarde de verano sale poco porque pocas veces es la racha del día.

### 3. Calidad del aire medida — XVPCA

Dataset `tasf-thgu`, verificado. Estaciones reales frente a un modelo de 11 km:
el mismo argumento que ya se usa con la XEMA frente a la predicción. El bloque de
aire debe enseñar la medida cuando haya una estación cerca y el modelo cuando no,
diciendo cuál de las dos es.

Dos trampas ya vistas al inspeccionarlo:

- El formato es **ancho**: una fila por estación, día y contaminante, con 24
  columnas `h01`…`h24`. Hay que pivotarlo.
- **Socrata omite los campos nulos**, así que la ausencia de `h05` no es un cero:
  es que aún no está. A mediodía la fila del día solo traía hasta `h04`, o sea que
  el retraso es mucho mayor que el de la XEMA. Hay que medirlo antes de
  presentarlo como «ara mateix».

### 4. Mar: temperatura del agua y oleaje

`marine-api.open-meteo.com`, verificado. Devuelve `sea_surface_temperature`,
`wave_height`, `wave_period`, `wave_direction` y `swell_wave_height`.

580 km de costa y «quina temperatura té l'aigua» es *la* búsqueda de verano. Solo
se pide en los puntos costeros, no en los 3.190.

**Antes de activarlo hay que confirmar si tiene contador propio.** La de calidad
del aire lo tiene y es lo que la hizo viable; si la marina comparte contador con
la de predicción —que es la que va justa—, hay que presupuestarla como un modelo
más y decidir qué se quita. La única forma de confirmarlo es medir: lanzar un
refresco pequeño y vigilar el 429.

Con esto entra gratis el bloque de **condiciones náuticas**: oleaje, período y
viento son las tres cifras que decide un surfista o un patrón.

### 5. Sequía y embalses · datos por municipio

Tres datasets verificados y frescos hoy mismo:

- **`i5n8-43cw`** — estado de sequía por unidad de explotación **y por
  municipio**, con `codi_municipi`. Se une con `municipiIne5` de nuestras
  ubicaciones cortando los seis dígitos a cinco. Va directamente en la ficha: en
  Catalunya el estado de sequía es información de primera necesidad y hoy hay que
  buscarla en un PDF.
- **`vjx7-6kcp`** — nivel de los embalses, en tiempo casi real.
- **`3yr3-vq6y`** — **caudal de los ríos en tiempo real**, con coordenadas UTM.

Un detalle a resolver: las coordenadas vienen en **UTM 31N**, no en grados. Hace
falta un conversor a WGS84 en `scripts/lib/geo.ts`; son unas cuarenta líneas de
fórmula estándar y ninguna dependencia.

El caudal en tiempo real es además la base honesta de un aviso propio de riesgo
de crecida — ver el punto 9.

### 6. Nieve **medida** en el Pirineo · hallazgo nuevo

Encontrado al construir la rosa de los vientos: el dataset diario `7bvh-jvq2`
tiene **espesor de nieve medido por las estaciones**, y no se estaba usando.

| Código | Qué es |
|---|---|
| `1600` | Espesor medio diario, cm |
| `1601` | Espesor máximo diario + hora |
| `1602` | **Nieve nueva acumulada** en el día |
| `1603` | Espesor mínimo diario + hora |

152.900 registros, o sea que hay serie larga. Cambia la conversación: hasta ahora
la nieve del sitio era la **cota estimada** a partir de la isocero del modelo, y
esto es un espesor medido con su fecha. Con las dos se puede decir «la cota va a
1.800 m i a Certascan hi ha 40 cm», que es lo que se pregunta de verdad.

Va aquí y no en la lista de descartes porque son datos que ya se descargan del
mismo dataset: entra como una variable más, igual que la dirección de la racha.
Lo que falta es saber cuántas estaciones lo miden — probablemente solo las de alta
montaña — y no publicar un cero donde en realidad no hay sensor. La trampa es la
misma que ya nos comió una vez: `?? 0` convirtió la falta de pluviómetro en una
racha seca de 398 días en el Port de Barcelona.

### 7. Condiciones para actividades

Es la generalización del bloque de preguntas que ya existe. Mismo motor,
`src/lib/narrative.ts`, y una página por actividad, que además es una entrada de
búsqueda que nadie está atendiendo bien.

- **Bolets.** Lluvia acumulada de los últimos 10–15 días más temperatura: los dos
  datos están en `xema-history.json`, que guarda 45 días por estación. No hace
  falta pedir nada. Es la más catalana y la más compartible de la lista.
- **Senderisme.** Sensación térmica, lluvia, viento, UV y cota de nieve. Todo
  calculado ya.
- **Nàutica i surf.** Necesita el punto 4.

Regla para todas: **la condición se explica, no se puntúa.** Un «7,5/10 per anar a
buscar bolets» es un número inventado que nadie puede discutir. «Ha plogut 42 mm
en dotze dies i la mínima no ha baixat de 12 °C» es un dato que el que sabe de
bolets sabe interpretar mejor que nosotros.

### 8. Resumen de comarca y de Catalunya

El titular de ficha, un nivel arriba: «Avui, mig Ponent per damunt de 35 °C i
ruixats al Pirineu a la tarda». Es un agregado sobre datos ya en memoria, y es lo
que se comparte y lo que alimenta el digest del punto 10.

### 9. Avisos: página por comarca, y avisos propios separados

- **`/avisos`** y `/avisos/[comarca]`: los oficiales ya están en `warnings.json`
  con sus `comarcaCodis`. Es solo página.
- **Avisos propios**, en una franja visualmente **distinta** de la oficial:
  primera helada de la temporada, noche tropical, racha de días por encima de lo
  normal, crecida de un río con el caudal del punto 5. Los contadores ya están en
  `xema-history.json`.

La regla dura: los avisos oficiales no se reescriben ni se recolorean, y los
propios no pueden parecerse a uno oficial. Si un lector no distingue de un vistazo
quién firma el aviso, el bloque está mal hecho aunque el dato sea correcto.

### 10. Alertas geolocalizadas **sin backend**: RSS, Atom e ICS

Aquí hay un salto de coste que conviene ver antes de dar el paso.

- **Un feed RSS/Atom por comarca** con los avisos vigentes: cero infraestructura,
  funciona en cualquier lector, es enlazable e indexable. Un `route.ts`.
- **Un ICS por comarca**: los avisos aparecen en el calendario del usuario. Misma
  historia, cero infraestructura.
- **Un digest diario** por comarca, también como feed.

Esto cubre el 80 % de «alertes a la meva comarca» sin tocar la arquitectura. El
push de verdad está en la fase 4, y con motivo.

### 11. Deuda técnica que ya duele

- **Partir `forecast.json`** por comarca. 42 MB en un fichero: memorizado por
  `mtime` no se reparsea, pero en Vercel son 42 MB en el bundle de funciones.
- **Aislar el bloque «ara mateix»** en su propio segmento cacheado. Ahora la
  página entera se revalida cada 30 min por un número que cambia cada hora.
- **Un aviso de hidratación en desarrollo, sin diagnosticar.** Aparece en páginas
  que no se han tocado —`/alt-camp`, `/estat`—, así que no lo ha traído nada
  reciente. La sospecha razonable es el doble render de desarrollo con textos que
  dependen del reloj: si el minuto cambia entre el HTML y la carga RSC, «fa 49
  min» y «fa 50 min» no coinciden. Si es eso, en producción no se da, porque las
  dos salen del mismo render.

  Hay que **confirmarlo con `next start`** y no asumirlo, porque si de verdad hay
  discrepancia el cliente vuelve a renderizar el árbol entero y eso se come la
  ventaja de no llevar JavaScript, que es media tesis del proyecto.

---

## Fase 2 — SEO e indexación

Sin cambios respecto a lo ya escrito. El riesgo real del proyecto no es la falta
de datos: es el *index bloat* de 4.293 rutas. Los feeds del punto 1 y las páginas
de los puntos 7, 8 y 9 ayudan, porque dan razones para enlazar que no dependen de
posicionar cada núcleo por su cuenta.

---

## Fase 3 — mapas

### Antes del mapa interactivo: el mapa que no necesita JavaScript

La página del radar demostró que se puede: las teselas y los polígonos del ICGC
comparten proyección, así que un solo SVG de servidor lleva las dos cosas y el
`viewBox` hace de recorte. `src/lib/mercator.ts` ya está escrito y probado.

Con eso, **un mapa de temperaturas por comarca sale sin una línea de script**:
`data/build/geo/municipis.geojson` ya está construido, la escala de color está en
`src/lib/scales.ts` y la observación ya está en memoria. Es un `<path>` por
municipio con su `fill`.

Vale la pena hacerlo **antes** del interactivo, por dos razones: se puede poner en
la página de comarca —que es territorial y no debe cargar bundle— y sirve de
prueba de que los datos y la geometría encajan antes de meter 200 KB de MapLibre
en la ecuación.

### La decisión, para el interactivo: MapLibre GL JS, no Leaflet

**MapLibre GL**, por tres razones concretas y una que no lo es:

1. **Las partículas de viento necesitan la GPU.** El campo animado de Windy es un
   shader que mueve decenas de miles de partículas sobre una textura de viento.
   MapLibre es WebGL nativo y eso se implementa como una capa custom. Leaflet
   dibuja en DOM y canvas 2D: la misma animación pide un plugin que pinta en un
   canvas superpuesto y se despega del mapa al hacer zoom.
2. **Nuestros límites ya son vectoriales.** Los polígonos del ICGC están en
   `data/build/geo/`, y MapLibre los consume como fuente GeoJSON o como teselas
   vectoriales propias. Sin conversión y sin servidor de teselas ajeno.
3. **Ningún basemap de terceros, ninguna clave de API.** Y esto es una ventaja de
   producto, no solo de privacidad: el mapa no tiene que ser un callejero con
   nuestros datos encima. Puede ser **nuestro territorio**, con las comarcas, los
   municipios y los 4.293 puntos, que es lo único que este sitio tiene y los demás
   no. Mismo razonamiento que con las teselas del radar: se sirven de nuestro
   dominio y la IP del visitante no sale a ningún sitio.

Lo que cuesta: `maplibre-gl` son unos 200 KB comprimidos, contra 40 de Leaflet. Es
mucho, y es aceptable **solo porque vive en `/mapa`** y se carga en diferido. Si
alguien lo mete en `LocationView`, el principio se ha roto y hay que revertirlo.

### El orden de las capas

1. **Radar.** Las teselas ya se descargan y ya se sirven. Es la capa que menos
   trabajo nuevo necesita y la que más se usa.
2. **Temperatura por municipio.** Polígonos ya construidos, escala ya escrita en
   `src/lib/scales.ts`, observación ya en memoria. Es un `fill-color` con
   expresión sobre una propiedad.
3. **Avisos oficiales**, con los polígonos CAP que el worker ya recibe.
4. **Viento con partículas.** La última, porque es la única que necesita datos
   nuevos y presupuesto.

### El viento: lo que hace falta y lo que cuesta

Las partículas no se alimentan de puntos sueltos: necesitan un **campo regular de
u/v**. La conversión es trivial —`u = −v·sin(θ)`, `v = −v·cos(θ)`— pero la rejilla
hay que pedirla.

El mismo truco que con la calidad del aire: una rejilla regular en vez de los
3.190 puntos. Catalunya en 0,1° son unas **768 celdas**; en 0,2°, 192. Para un
campo visual, 0,1° sobra — el radar tiene 1 km y AROME 1,3, pero una partícula no
se lee a esa escala.

**Y aquí está el problema que hay que mirar de frente:** esto consume el contador
de la predicción, que es el que va justo. Son ~768 unidades por refresco; a cuatro
refrescos diarios, 3.072 al día sobre lo que ya se gasta. Antes de implementarlo
hay que sacar la proyección diaria real de `forecast-refresh.ts` y decidir si cabe
o si hay que bajar a 0,2° o a dos refrescos. **No se implementa y luego se mide.**

El transporte: un binario compacto (768 × 2 `Float32`, unos 6 KB) servido por un
`route.ts`, que el cliente convierte en textura. Nada de PNG codificado a mano.

---

## Fase 4 — verificación, tauler y push

### 12. Verificación de modelos

Ya planeada, y necesita 60 días de histórico acumulado. Es la que permite quitar
la nota de «els models pesen igual» y empezar a ponderar por acierto. Sigue siendo
la mejora de calidad más grande que le queda al proyecto.

### 13. Tauler configurable · `/tauler`

Widgets que el usuario ordena: temperatura, viento, UV, aire, mar, radar.

**Primera versión sin cuenta y sin base de datos:** la configuración vive en
`localStorage`. Cero backend, cero cookies, cero banner de consentimiento, y
funciona el primer día. Consume los feeds del punto 1, no los ficheros de
`data/cache/`.

Solo cuando alguien pida «lo quiero en el móvil y en el portátil» hace falta una
cuenta, y entonces ya se sabrá si merece la pena.

### 14. Alertas push · la primera cosa que de verdad necesita la base de datos

Un aviso empujado al móvil necesita: almacén de suscripciones, claves VAPID,
consentimiento explícito, política de privacidad, y un proceso que decida a quién
le toca cada aviso. Es trabajo real, no un componente.

Y necesita una decisión de producto antes de la primera línea de código: **un push
falso a las tres de la madrugada cuesta la confianza para siempre.** Los criterios
mínimos, escritos antes de implementar:

- Solo avisos **oficiales** naranja o rojo. Nunca uno propio, nunca uno amarillo.
- Nunca entre las 23 h y las 7 h salvo nivel rojo.
- Un solo push por episodio, no uno por actualización del CAP.
- Un interruptor de apagado que funcione sin desinstalar nada.

Por eso va al final, y por eso los feeds del punto 10 van antes: cubren la mayor
parte de la necesidad sin ninguno de estos riesgos.

---

## Lo que se descarta, y por qué

Dejarlo escrito ahorra que alguien lo vuelva a buscar.

| Idea | Estado |
|---|---|
| **Polen medido** | En el portal de datos abiertos **no hay** dataset (buscado: cero resultados). La referencia es el Punt d'Informació Aerobiològica de la UAB, que publica semanalmente y sin API. El modelo de CAMS es lo que hay, y la página ya dice que es un modelo |
| **Riesgo de incendio / pla ALFA** | En el portal solo hay estadística histórica (`9r29-e8ha`, `bks7-dkfd`), no el nivel en vigor. Hay que buscarlo por otra vía antes de prometerlo |
| **Boletín de aludes** | Cero resultados en el portal. Es el dato de seguridad más valioso del Pirineo en invierno: merece buscarlo en el ICGC directamente. Si aparece, se trata como los avisos del CAP — no se reescribe ni se recolorea |
| **Estado de las pistas de esquí** | No hay dataset abierto. Los agregadores son scrapes, y este proyecto no publica dato sin licencia que lo permita. Se publica lo que sí se puede calcular —cota de nieve, nieve prevista, espesor del modelo— y se enlaza a las estaciones |
| **Puntuar actividades de 1 a 10** | Un número inventado que nadie puede discutir. Se explican las condiciones y se deja interpretar |

---

## Fuentes verificadas

Pedidas contra la API real, con la respuesta comprobada. Fecha: 31 de agosto de 2026.

| Fuente | Identificador | Qué devuelve | Nota |
|---|---|---|---|
| Calidad del aire medida | `tasf-thgu` | Estación, municipio, comarca, coordenadas, altitud, contaminante, `h01`…`h24` | Formato ancho; Socrata omite nulos; retraso por medir |
| Mar y oleaje | `marine-api.open-meteo.com` | SST, altura, período y dirección de ola, mar de fondo | 27 °C de mar el 31/08; **contador por confirmar** |
| Sequía por municipio | `i5n8-43cw` | Unidad de explotación, estado hidrológico y pluviométrico, `codi_municipi` | Se une por los 5 primeros dígitos con `municipiIne5` |
| Embalses | `vjx7-6kcp` | Estación, cuenca, nivel absoluto, UTM | Fresco del día, 04:30 |
| Caudal de ríos | `3yr3-vq6y` | Estación, cuenca, caudal m³/s, UTM | Tiempo real; hace falta conversor UTM 31N → WGS84 |
