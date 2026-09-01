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

La prueba de que la frontera está bien puesta es medible, y la medida es la del
punto 11: **21 KB de HTML y ni un `'use client'`**. Si después de que exista
`/mapa` la página de Montblanc sigue igual, la frontera aguanta. (Lo que decía
esta línea antes —38 KB y sin hidratación— era falso en las dos mitades.)

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

### 3. Calidad del aire medida — XVPCA · hecho, con el diseno cambiado

`/aire` con las 75 estaciones de la Xarxa de Vigilancia, y un bloque bajo el de
CAMS en cada ficha con la estacion mas cercana dentro de 20 km.

**El diseno previsto no se sostenia y se vio midiendo antes de escribir la
pagina.** Aqui estaba anotado como «la medida frente al modelo, en vivo». No es
en vivo:

- El dataset `tasf-thgu` se escribe **una vez al dia**, de madrugada. El 31 de
  agosto la ultima escritura fue a las 06:30 UTC.
- Y en esa escritura, la fila del dia en curso solo llegaba a la **hora 4**. A las
  22:39 UTC seguia llegando a la hora 4: **veinte horas de retraso**.

El reparto queda al reves de lo que decia este documento, y la pagina lo dice en
voz alta:

| | Cubre | Cuando |
|---|---|---|
| **CAMS**, modelo | todo el territorio, celda de 11 km | ahora y tres dias |
| **XVPCA**, medido | solo donde hay aparato, 75 puntos | **ayer** |

Las dos son utiles y no son la misma. Publicar la medida vieja tiene sentido —una
medida vieja y verdadera vale mas que ninguna— **siempre que se diga que es
vieja**, que es lo que hace el bloque.

Tres detalles que costarian tiempo a quien lo repita:

- El formato es **ancho**: una fila por estacion, dia y contaminante, con 24
  columnas `h01`...`h24`. Socrata **omite los nulos**, asi que un hueco no es un
  cero. La media diaria solo se publica con las 24 horas presentes: con 18 seria
  una media de tres cuartos de dia llamada «mitjana diaria».
- **El CO viene en mg/m3** y el modelo lo da en ug/m3. Se convierte en el worker.
  Dos unidades para la misma magnitud en la misma pagina es como se publica una
  cifra mil veces menor sin que nada falle.
- Se publica el **tipo de estacion** —trafico, fondo, industrial— porque cambia lo
  que mide mas que la distancia. Una de trafico y una de fondo a un kilometro dan
  NO2 que no se parecen, y las dos estan bien.

### 4. El mar · hecho, y con una fuente que no estaba en el plan

`/mar` y un bloque en cada municipio con playa. Dos fuentes, y la segunda es el
hallazgo:

**Las banderas de playa se publican, y en vivo.** Dataset `4baz-cjv2`: 325
playas con bandera, motivo, estado del mar, transparencia del agua, temperatura
y **medusas con especie y abundancia**. Al inspeccionarlo, la última fila tenia
un minuto. Las ponen los socorristas — no es un modelo, es una persona mirando el
agua — y contesta «puc banyar-me» mucho mejor que ninguna predicción.

**El modelo marino** de Open-Meteo da temperatura del agua, altura, período y
dirección de ola en toda la costa, también de noche y también en enero.

#### La cuestión de la cuota, resuelta con números

Aquí estaba escrito que había que decidir si compartía contador con la
predicción. **No hacía falta ninguna decisión**: no se piden los 3.190 puntos.
Los puntos de mar se derivan de las propias playas —325 coordenadas reales
ordenadas de norte a sur, una cada quince kilómetros, empujada cinco kilómetros
mar adentro por la perpendicular al tramo— y salen **20 puntos**. Con 5 variables
y 3 días los dos factores de la fórmula valen 1, así que el coste es 20 unidades
por refresco. Aunque compartiera contador, es el 0,2 % del techo diario.

De las dos perpendiculares se toma la que apunta al **este**, porque en Catalunya
el mar siempre está a levante. Es una regla que no vale en cualquier costa y aquí
es exacta. Los puntos que caen en tierra devuelven la serie a null y se descartan
solos: los 20 dieron mar.

#### Lo que hay que vigilar: una bandera caduca

Es el riesgo más serio de todo el sitio. Fuera del horario de servicio nadie
actualiza nada y la última fila se queda ahí indefinidamente. **Publicar una verde
de anteayer como si fuera de ahora es el peor fallo posible**, porque alguien se
mete al agua por lo que dice una web.

Dos umbrales, no uno: por debajo de **3 h** la bandera se presenta vigente, hasta
**12 h** se enseña apagada y con la hora del parte delante, y más allá no se
enseña. La página lo explica en vez de esconderlo.

#### Rarezas del dataset de playas

- **`coordenada_x` es la latitud y `coordenada_y` la longitud.** Al revés de lo
  que dicen los nombres: sin darse cuenta, todas las playas caen en Somalia.
- **`estat_data` va en DD/MM/YYYY con una T pegada**: `01/09/2026T08:04:01.000Z`.
  No es ISO y `Date.parse` lo lee mal.
- Es un histórico de 231.530 filas; el estado actual es la última fila de cada
  playa, y hay que pedirlo por `:updated_at` porque `estat_data` es texto.
- Las medusas van con el nombre científico y **no se traduce**: «Pelagia
  noctiluca» es lo que permite buscar si pica, y los nombres populares cambian de
  una cala a otra.
- El modelo habla con **las mismas palabras que los socorristas** —plana,
  arrissada, marejol, maror—, que son las de la escala Douglas en catalán. La
  primera versión decía «marejolada», que no existe, y ponía los dos bloques a
  hablar idiomas distintos.

### 5. Agua: embalses, aforos y sequía · ✅ hecho

`/aigua` con los nueve embalses de las conques internes —porcentaje de volumen,
tendencia a 30 días y volumen en hm³—, los 73 aforos con caudal agrupados por
cuenca, y el estado de sequía. Más un bloque en cada ficha con el embalse y el
aforo más cercanos dentro de 25 km.

**El orden previsto era el equivocado y se cambió al mirar los datos.** La
sequía iba primero en esta lista; los embalses eran el acompañamiento. Es al
revés:

- **El registro de sequía no es un dato en vivo.** `i5n8-43cw` anota *cambios de
  estado*: 8.677 filas para 630 municipios, y la más reciente es del 16 de mayo
  de 2025. Hoy 628 de esos 630 están en NORMALITAT. No está roto —la sequía se
  acabó y no ha habido decretos nuevos— pero **no se puede distinguir «no ha
  cambiado» de «han dejado de publicarlo»**, así que el estado no se muestra
  jamás sin la fecha del último cambio al lado. Y en la ficha solo aparece cuando
  **no** es normalidad: una línea idéntica en 628 páginas deja de leerse.
- **Los embalses sí son de hoy** y traen el porcentaje de volumen, que es la
  cifra que la gente busca. «Com està el pantà de Sau» tiene respuesta y es 72,6 %.

Lo que cubre y lo que no: solo las **conques internes**. El Segre y el Ebro son
de la Confederación Hidrográfica del Ebro, así que Rialb, Oliana, Mequinensa y
Riba-roja no están. La página lo dice arriba en vez de dejar el hueco.

Notas de implementación que ahorran tiempo:

- Las coordenadas vienen en **UTM 31N** y hay un conversor propio en
  `scripts/lib/geo.ts`, treinta líneas y ninguna dependencia. **Verificado con
  los propios datos**: cada embalse cae dentro del municipio que lleva en su
  nombre —Sau en Vilanova de Sau, Susqueda en Osor— y 80 de 81 aforos caen dentro
  de algún municipio. Un error de huso o de elipsoide no da excepción: mueve los
  puntos unos kilómetros y solo se ve en un mapa, así que la comprobación se
  quedó dentro del worker.
- Las consultas van **filtradas por día**. Son datasets de 12 y 45 millones de
  filas y un `$group` sin filtro de fecha tarda minutos — la misma lección que ya
  costó tiempo con la XEMA.
- El nivel del embalse **no lleva semáforo**. No hay ningún umbral oficial que
  diga a partir de qué porcentaje un embalse está mal: depende del embalse, de la
  época y de para qué sirve. Tres bandas de colores serían una norma inventada,
  así que va un degradado continuo.

El caudal en tiempo real queda como base honesta de un aviso propio de riesgo de
crecida — ver el punto 9.

### 6. Nieve medida en el Pirineo · ✅ hecho

`/neu`, con las 20 estaciones que llevan sensor de espesor. Hasta ahora la nieve
del sitio era la **cota** estimada desde la isocero del modelo; esto es un
espesor medido, con su fecha. Las dos juntas contestan la pregunta real: «la cota
va a 1.800 m i a Bonaigua hi ha 40 cm».

La página **funciona también en agosto**, que era el riesgo: cuando no hay nieve,
cada estación enseña cuándo tuvo la última y cuánta llegó a haber. Bonaigua, 411
cm el 12 de febrero de 2013.

#### La trampa: el sensor miente en verano, y el portal no lo detecta

El registro daba **12 cm de nieve en Das el 28 de agosto**, a 1.100 m, con la
mínima de aquel día en 9,3 °C. Y 37 cm de nieve nueva en Mollò el mismo día. El
sensor es un ultrasonido que mide la distancia al suelo, y en verano se le cuela
la hierba, un objeto o una recalibración.

Lo grave: esas filas vienen marcadas **`Representatiu`**, que es el estado de
validación bueno del portal. La comprobación tiene que ser nuestra.

La regla, que es física y no estadística: **un espesor se acepta si la mínima del
día bajó de 2 °C, o si no ha aumentado respecto de la última lectura aceptada.**
Respeta los dos casos que importan — nieve de primavera fundiéndose con 6 °C de
mínima (no aumenta, se acepta) y nevada de invierno de 0 a 40 cm (hace frío, se
acepta) — y solo tumba el caso imposible: el manto que **crece** un día que no ha
helado. Se descartaron 22 lecturas en 11 estaciones, y el récord de Mollò pasó de
«40 cm el 28 d'agost de 2026» a los 35 cm reales de enero de 2020.

El valor descartado se pone a **null, no a cero**: no sabemos cuánta nieve había,
sabemos que la cifra no es creíble. Un cero diría que no había.

### 7. Condiciones para actividades · ✅ hecho

`/bolets`, con la lluvia acumulada de quince y treinta días en cada estación,
cuándo fue el último aguacero de más de 5 mm y con qué temperaturas.

**Sin índice ni nota del cero al diez**, que era la regla escrita aquí antes de
empezar: un número compuesto oculta qué lo mueve —si baja, el lector no sabe si
es la lluvia, la temperatura o un peso que alguien eligió a ojo— y nadie lo puede
discutir. Los tres datos por separado no ocultan nada, y quien sabe de bolets los
interpreta mejor que nosotros.

La página **funciona todo el año** porque en realidad es una página de lluvia
acumulada con el título por el que la gente la busca. En mayo sirve igual para
saber si el campo está seco.

**`/senderisme`** y **`/nautica`**, las dos sobre observación y no sobre predicción:
la racha que ha hecho hace media hora en la Tosa es un hecho, la de mañana es otra
conversación y ya tiene su página.

De senderisme salió algo que no estaba planeado y que es lo mejor de la página: **la
isoterma de cero grados, medida**. Una regresión de la temperatura contra la altitud
sobre las 183 estaciones que dan las dos cosas — hoy da un gradiente de −5,4 °C por
cada 1.000 m, contra el −6,5 teórico de manual, con un ajuste de 0,69.

Y **no se publica la cifra cuando habría que extrapolar**. Un día de agosto la recta
cruza el cero hacia los 5.500 m, que es tres kilómetros por encima de la estación más
alta: escribirlo sería precisión inventada. Se dice «per damunt de qualsevol cim» y ya.
Tampoco se le llama cota de nieve, que es el error clásico: la nieve se funde mientras
baja y llega blanca dos o tres centenares de metros más abajo.

De nàutica, lo que la distingue de `/mar`: **el viento**, que es lo que decide si se
sale, medido en la estación costera más próxima —19 de los 20 tramos tienen una a menos
de 13 km— y con su nombre y su distancia delante, porque un anemómetro tierra adentro no
mide el viento que hay en el agua. Más el **período de la ola**, que es el número que la
gente se salta y el que más dice: la misma altura con seis segundos o con nueve son dos
mares distintos.

### 8. Resumen de comarca · ✅ hecho

Una frase en cada página de comarca: de dónde a dónde va ahora, a cuánto se ha
llegado hoy y dónde ha llovido. Más la franja de avisos vigentes cuando los hay.

**Sale solo de la observación, no de la predicción.** Agregar `forecastFor` de
hasta 68 municipios —cada uno con su consenso hora a hora sobre 168 horas—
convertiría una página de listado en la más cara del sitio a cambio de una línea.
Con la observación basta para lo que la frase tiene que decir.

### 9. Avisos: página propia · ✅ hecho

`/avisos`, con los oficiales vigentes y su reparto por comarca. Las reglas no
cambian por estar en su propia página: colores del CAP, texto sin reescribir,
nivel sin ajustar, enlace al original. Se revalida cada cinco minutos y no cada
quince — en un episodio, quince minutos de retraso en la página que se consulta
*porque* hay un aviso son quince minutos de más.

Quedan los **avisos propios** —primera helada, noche tropical, crecida— en una
franja visualmente distinta de la oficial. La regla: si un lector no distingue de
un vistazo quién firma el aviso, el bloque está mal hecho aunque el dato sea
correcto.

### 10. Alertas por feed, sin backend · hecho

`/avisos/feed` y `/avisos/feed/{comarca}`, en **Atom** y en **iCalendar**.

Iban antes que el push por una diferencia de coste enorme: el push necesita
almacen de suscripciones, claves VAPID, consentimiento, politica de privacidad y
un proceso que decida a quien le toca cada aviso — es la primera cosa del
proyecto que de verdad necesita base de datos. Un feed no necesita **nada**: es un
`route.ts` que serializa lo que ya esta en memoria, funciona en cualquier lector,
se mete en Telegram o en Slack, y no guarda un solo dato de nadie.

Decisiones que quedan cerradas:

- **Atom y no RSS 2.0.** Atom obliga a fechas ISO y a identificadores estables, y
  aqui hacen falta: el CAP reemite el mismo episodio, y sin `id` estable cada
  reemision saldria como aviso nuevo. El `id` lleva el nivel pegado, para que una
  subida de amarillo a naranja **si** aparezca como entrada nueva — para el lector
  eso es informacion nueva.
- **El calendario es el formato natural de un aviso**: tiene principio y final, y
  aparece entre las reuniones con su ventana dibujada a escala. Ningun lector de
  RSS ensena eso. Los naranjas y rojos llevan `VALARM` dos horas antes; los
  amarillos no, porque un amarillo no debe despertar a nadie.
- El plegado de lineas del ICS cuenta **octetos, no caracteres**, y corta sin
  partir un caracter. «Acumulacio» ocupa once caracteres y doce bytes: contando
  caracteres, una linea con acentos se pasa del limite del RFC sin que nada lo
  note, y un lector estricto rechaza el fichero entero.

Queda el **digest diario** por comarca, que es el mismo mecanismo con otro
contenido.

### 11. Deuda técnica que ya duele — hecha, salvo una que se ha decidido no hacer

#### `forecast.json` partido por comarca · **hecho**

Ya no existe el fichero único. La predicción vive en `data/cache/forecast/`, un
fichero por comarca más un índice, y el porqué está escrito en
`src/lib/forecast-shards.ts`.

El argumento no era el que estaba apuntado aquí. Lo que se temía era el peso en
el paquete de despliegue; lo que de verdad se paga es el **arranque en frío**,
que en producción es el caso normal:

| | antes | ahora |
|---|---|---|
| Fichero que hay que abrir | 39,9 MB | 0,87 MB (el mayor, 2,03) |
| Lectura + parseo | 80 + 195 ms | 2 + 4 ms |
| Montículo | 132 MB | 2,9 MB |

Doscientos setenta y cinco milisegundos y ciento treinta megas para responder a
una página que necesitaba **un punto de 3.190**.

Tres decisiones que conviene no volver a discutir:

- **Por comarca y no por punto.** La comparativa comarcal de cada ficha mira a
  todos sus vecinos, así que la comarca es justo la unidad que una página
  necesita entera. Un fichero por punto serían 3.190 aperturas.
- **Los 27 puntos de frontera se duplican.** La celda de 0,02° no sabe de
  límites administrativos. Duplicarlos cuesta 0,5 MB sobre 40 y ahorra tener que
  consultar un índice antes de cada lectura.
- **Un tope de 8 trozos parseados a la vez** en `weather.ts`. Sin él, un proceso
  que atendiera a las 43 comarcas acabaría con los mismos 132 MB, solo que en
  cómodos plazos.

La migración de los datos que ya estaban en disco es
`scripts/migrate-split-forecast.ts`: reordena bytes en vez de gastar miles de
unidades de cuota volviendo a pedir lo mismo.

#### El aviso de hidratación · **era real en producción, y ya está arreglado**

La hipótesis escrita aquí —el doble render de desarrollo con textos que dependen
del reloj— **era falsa**, y por poco se da por buena: con `next start`,
`/alt-camp`, `/estat` y una ficha de municipio dan cero mensajes de consola. Con
esas tres páginas se habría cerrado el punto.

Aparece en otras. `/llucanes/sobremunt` en producción tira `Minified React error
#418`, que es exactamente «el HTML del servidor no coincide con el del cliente».

La causa, sacada del diff que enseña el overlay en desarrollo: **`WindRose`
pasaba tres hijos a un `<title>` de SVG**.

```jsx
<title>
  {`${s.label} · ${(s.share * 100).toFixed(1)} % dels dies`}
  {kmh != null ? ` · ratxa mitjana …` : ''}
  {s.gustMax != null ? ` · màxima …` : ''}
</title>
```

React trata `<title>` como elemento especial y **solo lo rellena si su único hijo
es una cadena**. Con tres hijos el servidor escribía `<title></title>` vacío —16
por rosa— y el cliente ponía el texto. Discrepancia en cada página con rosa de
los vientos, o sea en casi todas.

Lo que costaba: al no cuadrar el árbol, React **descarta el HTML servido y vuelve
a renderizarlo entero en el navegador**. Es justo el escenario que este punto
temía, «se come la ventaja de no llevar JavaScript», y llevaba ahí desde que la
rosa se puso en las 4.293 fichas.

Y no daba ningún error visible: el tooltip salía vacío, que nadie mira, y el
árbol se rehacía, que no se ve. Se arregla componiendo la cadena antes:

```jsx
const tip = [...].filter(Boolean).join(' · ');
<title>{tip}</title>
```

Comprobado después en producción sobre catorce tipos de página —portada, comarca,
municipio, entidad, estación, `/mar`, `/aire`, `/aigua`, `/neu`, `/bolets`,
`/avisos`, `/radar`, `/ranquings`, `/estat`—: **cero mensajes de consola**.

**La lección, que es la que hay que quedarse:** tres páginas no son una
comprobación. La que fallaba no estaba entre las que la sospecha señalaba.

#### Y de camino, el peso real de una página

Midiendo lo anterior salió esto, que no estaba apuntado en ninguna parte. Con
`next start` sobre `/maresme/malgrat-de-mar`:

| | crudo | gzip |
|---|---|---|
| HTML de verdad | 192 KB | **21 KB** |
| Carga RSC incrustada, que lo duplica | 320 KB | 30 KB |
| Runtime de React y Next, en seis ficheros | — | 137 KB |

El HTML sí baja de 40 KB; **la página no**, y hidratar hidrata. Los 167 KB que
sobran son el suelo del App Router: no los pone ningún componente nuestro —**no
hay un solo `'use client'` en el proyecto**— y solo se quitan saliendo del
framework. Queda escrito, no resuelto, y la frase «sin hidratación» ya está
corregida en `AGENTS.md`.

#### Aislar el bloque «ara mateix» · **medido y descartado, de momento**

La idea era buena y el número la desmonta. Con la predicción ya partida, un
render completo de una ficha cuesta **entre 73 y 229 ms en frío y 9-14 ms en
caliente**. Separar el bloque de condiciones actuales en su propio segmento
ahorraría unos 60 ms de CPU, en segundo plano, una vez cada media hora y solo en
las páginas que alguien visite — con ISR el usuario recibe la versión anterior al
instante y no espera nunca a esa regeneración.

El precio, en cambio, no es pequeño: en Next 16 el mecanismo es `cacheComponents`
con `cacheLife`, y activarlo cambia el comportamiento por defecto de **toda** la
aplicación, así que habría que auditar las 602 rutas. Sesenta milisegundos de
trabajo en segundo plano no lo pagan.

Se retoma si alguna vez el render pasa de ~300 ms o si `cacheComponents` deja de
ser un interruptor global.

---

## Fase 2 — SEO e indexación

Sin cambios respecto a lo ya escrito. El riesgo real del proyecto no es la falta
de datos: es el *index bloat* de 4.293 rutas. Los feeds del punto 1 y las páginas
de los puntos 7, 8 y 9 ayudan, porque dan razones para enlazar que no dependen de
posicionar cada núcleo por su cuenta.

---

## Fase 3 — mapas

### Antes del mapa interactivo: el mapa que no necesita JavaScript · ✅ hecho

`/mapa`, y también en cada una de las 43 fichas de comarca con la suya resaltada — que es
donde deja de ser decoración: saber que hace 26 °C no dice gran cosa; ver que el resto del
país está a 31 sí.

**Cada comarca lleva la mediana de sus municipios**, no la media de sus estaciones. En el
Ripollès hay estaciones a 1.900 m y a 700, y su media no describe ningún sitio donde viva
nadie; los municipios ya llevan la corrección de altitud hecha. Mediana y no media porque un
solo pueblo de montaña no debe teñir de azul una comarca entera. Las que no llegan a dos
municipios observados salen rayadas y no grises: un gris plano se lee como «aquí hace frío».

**La escala es absoluta y no se ajusta al día.** Estirar los colores hasta los extremos de hoy
daría un mapa mucho más vistoso y sería una trampa: una comarca saldría roja con 31 grados por
la mañana y azul con 33 por la tarde. El precio es que un día de agosto el mapa se ve casi de
un solo color, y eso no es un defecto del mapa: la leyenda marca el tramo del día y así la
planura pasa a ser la información — hoy Catalunya entera cabe en 5,6 grados.

Coste medido: 10 KB comprimidos de SVG, más otros 10 de la carga RSC que lo duplica. Una ficha
de comarca pasa de 7 a 29 KB, todavía por debajo del listón de 40.


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
