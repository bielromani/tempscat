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
`src/lib/shards.ts`.

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

## Tres cosas investigadas, con la respuesta ya medida

Pedidas contra las APIs reales el 1 de septiembre de 2026, no supuestas.

### Previsión a más días · ✅ **hecho: 14 días, y no ha costado una unidad**

La fórmula de Open-Meteo es `max(1, vars/10) × max(1, días/14) × ubicaciones`, y
ese segundo factor **tiene suelo en 1**. O sea que pedir 14 días cuesta
exactamente lo mismo que pedir 7:

| Horizonte | Coste diario | Al mes | Del techo |
|---|---|---|---|
| 7 días (hoy) | 8.126 | 243.780 | 81 % |
| **14 días** | **8.126** | **243.780** | **81 %** |
| 16 días | 9.287 | 278.606 | 93 % |

Los 16 días también funcionan —comprobado, devuelve los 16 con valor— pero nos
dejan al 93 % del techo mensual, sin margen para un `--fill` tras un corte.

**Así que 14 días, y la segunda semana presentada como lo que es.** Más allá del
día siete un modelo determinista tiene poca habilidad, y publicar «19 °C el
jueves que viene» sería precisión no demostrada. Sin horas, sin decimales, y
diciendo que es tendencia.

**Lo que sí ha costado es sitio, y no por donde se esperaba.** Al pasar de 168
a 336 horas por punto, la predicción iba camino de unos 80 MB por vuelta. Se
anotó aquí como deuda a pagar «antes de que el almacén empiece a doler», y
dolió — pero por **las lecturas**, no por las escrituras.

### El 1 de septiembre de 2026 el almacén se bloqueó · **resuelto**

Una ficha de municipio pedía **4.965 kB** en cada arranque en frío: el
histórico de las 189 estaciones para usar una, las 372 celdas de aire para usar
una, y la predicción de la comarca entera para usar un punto de sesenta y
cinco. Con 4.293 fichas, **un rastreo completo del sitemap son 22,8 GB**, y el
plan gratuito trae 10 GB al mes.

Google encontró el sitemap y se acabó la cuota. Las páginas ya generadas se
sirvieron congeladas —ISR conserva la anterior cuando la lectura falla, que es
lo que evitó servir 4.293 fichas en blanco— y los 3.283 núcleos que se generan
a demanda empezaron a dar 500. Los despliegues tampoco podían completarse: el
prerenderizado lee del almacén.

Lo hecho:

| | antes | ahora |
|---|---|---|
| `xema-history` | 1.959 kB | **10 kB** — un trozo por estación |
| `air-quality` | 1.410 kB | **5 kB** — un trozo por celda |
| `forecast/cNN` | 1.174 kB | **739 kB** — 120 h de detalle y el resumen diario ya hecho |
| **una página** | **4.965 kB** | **1.178 kB** |
| **un rastreo** | **22,8 GB** | **5,4 GB** |

La regla que faltaba está escrita en `src/lib/shards.ts`: *una página descarga
bytes en proporción a lo que enseña*. El monolito se sigue escribiendo, porque
`/neu`, `/bolets`, `/senderisme` y `/nautica` comparan estaciones entre ellas y
lo quieren entero — pero esas son cuatro URL, no cuatro mil.

Y `cache-store` pregunta ahora con `If-None-Match`: casi nada de lo que hay en
el almacén cambia al ritmo al que caduca aquí, y un `304` no gasta transferencia.

**Lo que queda de esos 1.178 kB** es predicción (739), observación en vivo
(153), mar (142) y agua (79). El mar se baja también en los pueblos de interior,
que son nueve de cada diez; partirlo por municipio costero es el siguiente
recorte fácil.

### Dos fallos que solo aparecían con el tiempo

**La segunda semana escrita y no vista.** El array de horas es común a todos los
puntos de un trozo, y los puntos que se conservan de un refresco anterior pueden
traer un horizonte más corto. Con `if (!result.times.length)` el fichero se
quedaba con las 168 horas viejas mientras los puntos nuevos traían 336.

**Y la predicción corrida un día.** Arreglar lo anterior con «manda la serie más
larga» resolvía estrenar horizonte y nada más: Open-Meteo devuelve siempre desde
las cero horas **del día en que se pide**, así que con dos series de 336 horas
`336 > 336` es falso y el array se quedaba congelado en el día 1 mientras los
puntos refrescados traían valores del día 2. Al día siguiente, dos. Sin error y
sin hueco: los números son plausibles, solo son de otro día.

Ahora manda la hora cero más reciente y, con la misma hora cero, la serie más
larga —las dos reglas, porque cada una tapa un agujero distinto—. Está en
`scripts/lib/forecast-align.ts` con `npm run test:align` delante, y el
desplazamiento se busca con `indexOf` y no restándole fechas: el domingo del
cambio horario tiene 23 o 25 horas.

### A un mes vista · **existe, pero no como número diario**

`seasonal-api.open-meteo.com` responde: **45 días y 51 miembros de ensemble**,
del 1 de septiembre al 15 de octubre. Los datos están.

Lo que no está es la habilidad. Un modelo estacional no acierta el día 15 de
octubre y publicarlo como si lo hiciera rompería el principio del sitio. Lo
honesto y lo que de verdad se puede decir es **la anomalía contra las normales
climáticas que ya tenemos en `xema-history`**, con el acuerdo entre miembros
como medida de confianza: «38 de 51 miembros apuntan a más cálido de lo normal
para la época». Eso es un pronóstico probabilístico bien presentado; una
temperatura para el 15 de octubre no lo es.

### Estaciones de esquí · **el catálogo de FGC tiene mucho más que cámaras**

Buscando si había más cámaras salió que no —en el portal de la Generalitat no
hay ni un dataset de cámaras—, pero el portal propio de Ferrocarrils tiene 50
conjuntos y varios son directamente lo que falta en `/neu` y en las fichas de
montaña:

| Conjunto | Qué trae |
|---|---|
| `estat-dels-serveis-explotacio-*` | **`is_open` por instalación**, una por estación: 83 solo en La Molina |
| `pistes-desqui` | 181 pistas con color, desnivel, longitud y si tiene nieve producida |
| `remuntadors` | 55 remontes con tipo, duración y cotas |
| `meteo-tim` | **9 estaciones meteorológicas propias** en las estaciones: temperatura, humedad, presión, viento y dirección |
| `informacio-tecnica-circuits-*` | Senderismo, raquetas, esquí de montaña, fuera de pista y bikepark |
| `avisos-i-alertes-de-tim` | Avisos propios de las estaciones |

Las dos primeras contestan «¿está abierto?», que es la pregunta que se hace
quien mira una estación de esquí, y `meteo-tim` añade **temperatura medida a
2.000 m** donde la XEMA es escasa. Misma licencia CC-BY y mismo portal que las
cámaras, así que el worker ya está escrito a medias.

### Cámaras · **hecho, y eran 24 de 30**

Está en `/cameres`, en una página por cámara y en las fichas de los pueblos que
tienen alguna a menos de 25 km. El worker es `scripts/workers/cameras.ts` y su
cabecera lleva el detalle; aquí queda lo que cambió respecto a lo que se
esperaba.

**Eran 30 y son 24.** Y ninguna de las seis que faltan da error. Cinco apuntan a
`api.pirineu365.cat`, que redirige a `statics.3cat.cat`: la imagen es de la CCMA
y la CC-BY del conjunto de FGC no cubre el material de un tercero que el
conjunto solo enlaza. La sexta es un reproductor de `webtv.feratel.com` con 404.

**Cinco traían la coordenada inventada** —tres en el centro de la península, dos
de Vallter con la longitud a cero—, así que el filtro es la ubicación publicada
más cercana: a más de 20 km, no hay coordenada. Vallter se queda sin ninguna
colocada, porque las dos que tiene están mal y no hay hermana buena.

**Y cinco llevan horas o meses paradas**, sirviendo el mismo fotograma con un
200 — una de ellas desde el 10 de abril. Salen en la página como paradas, con la
fecha, y sin imagen.

Lo que costó descubrir de verdad fue **datarlas**. En las panorámicas de
Roundshot, `og:updated_time` es la hora en que se ha generado la página y el
`Last-Modified` de la imagen falta justo en las paradas; la hora buena está en
la ruta del fichero al que redirige, en hora local de Madrid, y el worker lo
comprueba cada vuelta contra las que sí traen cabecera.

El coste no fue la transferencia sino **las escrituras**, que es lo único que el
almacén cobra. Se resolvió con nombre de fichero fijo —la hora de captura va en
la consulta de la URL, no en el nombre— y saltándose las cámaras cuya foto no ha
cambiado: 48 objetos por vuelta como mucho, unos 35.000 al mes contra el millón
del plan gratuito. Bajar y reescalar es gratis: 6,4 MB por vuelta que salen 2,0.

Lo que queda pendiente es lo que no depende de nosotros: **Vallter sin
coordenada** mientras el catálogo no la arregle.

### Mapa con relieve · **viable, pero hace falta pedir la altimetría**

No la tenemos: `data/raw/elevation.json` son las cotas de nuestros 5.127 puntos,
no una malla. Para un sombreado de relieve hace falta un modelo de elevación.

La API de elevación de Open-Meteo da **100 puntos por petición**, y la altitud no
cambia nunca, así que es un trabajo de una sola vez:

| Resolución | Puntos | Peticiones |
|---|---|---|
| 0,05° (~6 km) | 3.072 | 31 |
| 0,02° (~2 km) | 19.200 | 192 |
| 0,01° (~1 km) | 76.800 | 768 |

A 1 km se ven los Pirineos y las serralades con detalle de sobra, y son 768
peticiones **una vez en la vida**, no cada día. El resultado se guarda en
`data/build/` y el sombreado se calcula en el build, igual que la geometría de
las comarcas.

---

## Revisión del usuario, 3 de septiembre de 2026

Todo lo que salió de una pasada por el sitio, con lo que ya está medido de cada
cosa. Ordenado por lo que cuesta arreglarlo, no por lo que molesta.

### El radar · **hecho a medias**

Arreglado ya: el mapa ocupaba más de una pantalla de portátil y «Reprodueix les
2 hores» hacía saltar la página arriba. Los dos, con su porqué, en el commit.

**Lo que falta es el producto, y es lo más pedido:**

- **Mezclar observación y predicción en una sola línea de tiempo**, con el
  presente en el centro y el futuro a la derecha, como
  [meteo.cat](https://www.meteo.cat/observacions/radar). Hoy las dos horas son
  todas pasadas.
- **Arrastrar la línea** en vez de pinchar marcas sueltas. Esto **no cabe sin
  JavaScript**: un `input[type=range]` puede mover marcos con CSS
  (`:checked` no, pero sí con `accent-color` y hermanos), pero el gesto de
  arrastrar con inercia y el rótulo que sigue al dedo no. Es la primera cosa
  del sitio que justificaría un componente cliente, y hay que decidirlo a
  propósito, no por descuido.
- **Zoom de verdad y topónimos que aparecen al ampliar.** Hoy las seis zonas
  amplían la misma imagen: el tilecache público de RainViewer se acaba en el
  zoom 7 —un píxel son 460 m— así que ampliar no añade detalle de radar. Lo que
  sí gana son las fronteras y los nombres, que son vectores. Para más detalle de
  radar hace falta otra fuente: el del **Meteocat** llega a 1 km y pide clave.
- **El nowcast.** RainViewer publica marcos futuros en su API de pago; la
  pública no. Sin eso, «futuro» solo puede salir de nuestra predicción horaria,
  y entonces hay que etiquetarlo como lo que es: modelo, no radar.

### Platges i mar · **apuntado**

- **Un mapa de la costa con las playas encima**, cada una con su bandera,
  temperatura del agua, oleaje y medusas. Hoy es una lista.
- **Ordenar y filtrar por municipio**, no solo por tramo de costa.
- Un **buscador de playas** propio — descartado: las 229 ya están en `/cerca`
  con su etiqueta y su enlace a la fila. Ver la sección del buscador.

### Neu i estacions d'esquí · parcialmente hecho

- ✅ **Las cámaras de la estación, en la propia tarjeta.** Hecho el 4 de
  septiembre de 2026. El cruce **no** era directo como decía esta nota: las
  cámaras traían el nombre de la estación, no su `bunitId`. Se persiste ahora
  desde el `business_unit` del catálogo, porque un cruce por nombre es de los
  que se rompen sin dar error.
  - Solo entran las **vigentes** —menos de 90 minutos—. En `/cameres` hay sitio
    para poner la hora al lado de una imagen de hace cinco horas; dentro de una
    tarjeta que habla de nieve no lo hay, y una foto sin fecha se lee como si
    fuera de ahora. Cinco de las veinticuatro han estado meses paradas.
  - Dos por tarjeta, y el pie dice cuántas hay con enlace a todas. La Molina
    tiene nueve.
  - **No** van en la ficha de un pueblo: allí ya está el bloque de cámaras
    cercanas y saldría la misma fotografía dos veces en la misma página.
- **Un mapa** con las seis estaciones, el gruix y lo que hay abierto.
- Comprobar si alguna cámara da **vídeo en directo** y no solo fotograma. Las de
  Roundshot tienen visor con movimiento; habría que ver si hay un flujo servible
  sin incrustar su reproductor.

### El buscador · ✅ arreglado el 3 de septiembre de 2026

**Mi diagnóstico anterior era falso y conviene dejarlo escrito.** Dije que la
causa era de cobertura —«el buscador indexa solo las 4.250 ubicaciones del
territorio»— y no lo era: `git show HEAD:src/lib/search.ts` demuestra que las
229 playas y las 189 estaciones **ya estaban indexadas** desde el primer día.
La causa era una sola, y era la comparación.

**Lo que fallaba.** `match()` comparaba con `includes()` sobre el nombre entero
plegado, así que a cualquier consulta a la que le faltara una palabra del nombre
le tocaba cero resultados:

| consulta | no encontraba |
|---|---|
| `cala fosca` | Cala la Fosca — hay un «la» en medio |
| `sant cugat valles` | Sant Cugat del Vallès — falta el «del» |
| `vall aran` | Vall d'Aran |

El segundo es el que más se nota: no es un caso raro de playa, es cómo la gente
escribe el nombre de un municipio de 93.000 habitantes.

Y el fallo **no daba ningún error**. La página salía entera, con su formulario,
el contador a cero y un texto amable. El sitio parecía no tener aquel lugar.

**Lo que se hizo.**

- La comparación se fue a `src/lib/search-match.ts`, que **no importa nada** y
  por tanto tiene prueba: `npm run test:search`. Es la razón de partirlo — un
  fallo que no da error tiene que tener una prueba que sí la dé.
- La consulta se parte en palabras, los artículos y las preposiciones no cuentan
  y cada palabra tiene que encajar con el principio de alguna palabra del nombre.
  Seis escalones, del 100 al 25, documentados en la función.
- **Palabra entera y principio de palabra puntúan distinto.** Sin esa
  distinción, «sau» ponía *els Saulons d'en Deu* por delante de Vilanova de Sau.
- **Cobertura, que sí faltaba en parte**: se añadieron los 9 embalses, los 79
  aforos, las 6 estaciones de montaña, las 24 cámaras y los 683 itinerarios.
- **Los embalses se comparan con el nombre corto.** Entero es «Embassament de
  Sau (Vilanova de Sau)» y «sau» encajaba ahí como una palabra cualquiera;
  contra «Sau» es exacto. Está en `reservoirName()`.
- **Seis aforos están en el embalse y se llaman como él.** Indexados aparte,
  «susqueda» devolvía dos filas con el mismo título y una etiqueta distinta, que
  parece un error del sitio antes que una distinción. Se omiten.
- **Cada resultado lleva a su fila, no a la cabecera de la página.** Las playas
  iban todas a `/mar`, que tiene 229: encontrarla volvía a ser trabajo del
  lector. Ahora hay `id` en las filas y un `:target` que la señala al llegar.
- El *placeholder* decía «Cercar un poble» y era una promesa corta. Ahora dice
  «Cadaqués, Sau, GR-11…», que es un ejemplo de cada tipo.

**Lo que no se hizo.** Buscadores separados por dominio —uno de playas, otro de
ríos— como pedía el usuario. Con un solo índice que los incluye a todos y una
etiqueta por tipo en cada resultado, tres buscadores serían tres sitios donde
buscar en vez de uno. Si aparece la necesidad de filtrar por tipo, el sitio para
eso es un filtro en `/cerca`, no un buscador nuevo.

Y **la caja ya estaba en todas las páginas**: va en la cabecera de `layout.tsx`,
que envuelve el sitio entero. Eso también estaba mal en la nota anterior.

### Bolets · ✅ rehecha el 4 de septiembre de 2026

Se tomó la salida 2, la que esta nota ya decía que era mejor, y por la razón
que decía: el error era de concepto, no de datos. Ordenar **189 aparatos** por
lluvia acumulada no da las mejores zonas de setas — da dónde hay pluviómetros y
dónde descargó la última tormenta. Torredembarra encabezaba la lista con 187,7
mm, que es verdad y no significa nada sobre setas.

- **El bloque está ahora en la ficha de cada lugar** (`RainBlock`): acumulado de
  15 y 30 días, cuándo fue el último chubasco de más de 5 mm, y las medias de
  mínimas y máximas de la decena, atribuido a la estación más cercana con su
  distancia y su desnivel. **No cuesta ni una petición**: sale de la misma serie
  diaria que la ficha ya se baja para el bloque de clima, vía
  `rainConditionsOf()`.
- **La página de país sigue existiendo y ahora dice lo que es**: «Quanta pluja ha
  caigut», sin proclamar ningún ganador y diciendo explícitamente que la tabla no
  ordena ninguna «mejor zona». La URL se queda en `/bolets` —no se rompe un
  enlace publicado— pero el rótulo del menú pasa a «Pluja acumulada».
- **Lo que no se puede arreglar sin datos nuevos**: distinguir bosque de playa
  necesita una capa de usos del suelo (MCSC del CREAF, o CORINE). Mientras no
  esté, el sitio no puede decir dónde hay setas, y ahora tampoco lo insinúa.

**Y de paso apareció otro fallo del mismo tipo.** Con el acumulado de 30 días
—168,8 mm— escrito justo encima, el bloque de clima decía dos párrafos más abajo
«Hi sol ploure 86 mm, i aquest mes en porta **0 mm**». Cierto: la serie de la
XEMA va dos días atrás y el 4 de septiembre solo tenía el día 1 y el 2. Pero
comparar dos días contra la normal de treinta no es comparar nada. Ahora dice
cuántos días cubre la cifra.

### Los textos · **regla ya escrita, aplicarla a todo**

Está en `AGENTS.md`: la página no habla de sí misma, registro neutro, sin
pullas. Se aplicó a las cámaras después de que el usuario señalara «De nit les
imatges surten fosques. No és una errada: és el que hi ha…». Falta una pasada
por el resto con el mismo criterio.

---

## Pendiente de diseño y de producto

Apuntado tal como salió, para no perderlo. Nada de esto es de datos: es de que
lo que ya hay se entienda y se use.

### El radar, con el pasado y el futuro

Hoy `/radar` enseña los últimos marcos y ya está. Lo que se pide —y es lo que
hace [meteo.cat](https://www.meteo.cat/observacions/radar)— es **ver moverse la
lluvia**: de dónde viene, hacia dónde va, y si va a llegar aquí o va a pasar de
largo. Eso necesita tres cosas que hoy no hay:

- **El nowcast.** RainViewer publica marcos futuros además de los pasados, y el
  worker ya los lee (`maps.radar.nowcast`); simplemente ese día venían vacíos.
  Hay que guardarlos y distinguirlos de los observados, que no son lo mismo y
  no se pueden pintar igual.
- **Movimiento.** Una secuencia de marcos, no una foto. Sin JavaScript se puede
  con animación CSS pura, o con el mismo truco de los radios de `NextHours`.
- **Zoom y encuadre.** Hoy el tilecache público solo llega al zoom 7. Mirar una
  comarca de cerca exige más, y del 8 en adelante devuelve un PNG que dice
  «Zoom Level Not Supported» con código 200. Hay que ver si hay otra vía antes
  de prometerlo.

### El mapa no dice de quién es cada comarca

Solo sale la cifra grande. Quien no se sepa el mapa de memoria no sabe qué está
mirando, y el `<title>` del `hover` no existe en un móvil. Hay que poner el
nombre —al menos en las que quepa— o resolverlo de otra manera.

### El diseño general

- ~~**El menú principal con scroll horizontal**~~ · ✅ hecho. Eran **quince**
  enlaces en una barra que se desbordaba, y una barra que se arrastra no es
  navegación: es un cajón donde las cosas desaparecen — a partir del quinto
  nadie las encuentra, y en el móvil ni se sospecha que están.

  Ahora la cabecera lleva **cuatro**, los que se consultan a diario, y si la
  ventana es estrecha la fila se parte en dos líneas en vez de desplazarse.
  Medido en un móvil de 375 px: los cinco enlaces caben en una sola línea y no
  hay desbordamiento horizontal en ninguna parte.

  El resto vive en el **pie**, agrupado en cuatro columnas, y en la **portada**,
  explicado con una frase cada uno — que es lo que hace que alguien entre en
  «Bolets» sabiendo qué va a encontrar.

  Y las tres listas salen ahora de un solo sitio, `src/lib/nav.ts`: antes cada
  una iba a mano y añadir una página significaba acordarse de tres ficheros.
- **El mapa de comarcas ocupa más de una pantalla de ordenador.** Nació para
  `/mapa`, donde es el contenido; en una ficha de comarca tiene que ser mucho
  más pequeño.

### Los textos, escritos para el usuario y no para nosotros · ✅ hecho

Hay frases que son notas internas disfrazadas de texto público. El ejemplo que
lo dejó claro, en `/mar`:

> «ensenyar una verda d'abans-d'ahir com si fos d'ara és el pitjor que podria
> fer aquesta pàgina, perquè algú es fica a l'aigua pel que diu un web»

Eso explica **nuestra decisión de diseño**, no le dice nada al lector. Lo que él
necesita saber es que la bandera tiene una hora y que fuera de servicio no se
actualiza. Hay que repasar el sitio entero con ese criterio: el razonamiento va
en el código, no en la página.

### Un buscador de verdad · ✅ hecho

`/cerca`, y un formulario en la cabecera que llega desde cualquier página.
Busca a la vez en las 4.293 poblaciones, las 43 comarcas, las 189 estaciones,
las playas y las propias páginas del sitio — porque quien escribe «Cadaqués» no
sabe ni le importa si eso es un municipio, una playa o una estación.

**Es del servidor, no del navegador.** Un índice descargado y filtrado mientras
se escribe habrían sido las primeras líneas de JavaScript propio y unos 200 KB
para algo que un `<form method="get">` resuelve. El precio es tener que pulsar
Enter; a cambio funciona sin JavaScript y con el teclado, cada búsqueda tiene su
URL y el resultado es indexable.

Ni los acentos ni los artículos hacen falta: «mollo» encuentra Molló y «ametlla»
las cuatro l'Ametlla. Y el orden no es alfabético — «sant» devuelve 490
resultados con Santa Coloma, Sant Cugat y Sant Boi delante, porque entre
municipios manda la población.

Queda pendiente el filtro **dentro** de las páginas temáticas, que es otra cosa:
ahí no se busca, se acota una lista larga.

### Que las temáticas expliquen más y sean más visuales · 🟡 `/mar` hecho

`/bolets`, `/senderisme` y `/nàutica` son tablas correctas y áridas. En `/mar`,
en concreto: **una bandera dibujada de su color** en vez de una etiqueta de
texto, un símbolo para las medusas, y decir **si la especie pica o no** — que es
lo que quiere saber quien lo mira y hoy tiene que buscarlo fuera.

### Rutas de senderismo

Por explorar: si existe algún conjunto de datos abierto con los GR y PR
catalanes y con licencia que permita republicarlos. Si lo hay, encaja con el
mapa que ya está hecho.

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

## El planificador de GitHub no cumple las cadencias · **resuelto**

Los tres workers de alta frecuencia declaraban una cosa y hacían otra. Medido el
2 de septiembre de 2026 sobre las últimas veinte ejecuciones programadas:

| worker | `cron` declarado | intervalo real (mín / medio / máx) |
|---|---|---|
| Observació i radar | cada 10 min | 117 / **194** / 272 min |
| Avisos oficials | cada 15 min | 116 / **176** / 273 min |
| Mar i platges | cada 30 min | 117 / **190** / 267 min |

No es que uno fuera mal: iban **los tres igual y a la vez**, lo que delata que el
planificador los agrupa y se salta el intervalo pedido. Para un radar de siete
marcos de diez minutos eso no es un retraso, es otro producto.

La página no mentía —siempre ha enseñado la hora real de la lectura— pero la
frescura no era la que decían los documentos.

### Por qué no se movió la ingesta a Cloudflare, que era la idea

Porque no cabe en el plan gratuito, y no por poco:

| límite (plan gratuito) | valor | qué lo rompe |
|---|---|---|
| CPU por invocación | **10 ms** | la observación agrega 189 estaciones |
| Subpeticiones por invocación | **50** | el radar baja 28 teselas y sube 28 |
| Duración de un cron | 15 min | la predicción tarda 40 |

### Lo que sí se movió: el reloj

Un worker de Cloudflare que **solo llama a `workflow_dispatch`** de GitHub.
Una subpetición y unas décimas de milisegundo de CPU: **288 invocaciones al día
de las 100.000 gratuitas, el 0,3 %**. El trabajo se queda en Actions, donde en
un repositorio público los minutos no se cobran.

Está en `cloudflare/scheduler/`, con el porqué escrito en `worker.js`.

Se despliega desde el propio repositorio, que es lo que evita que el código de
ahí dentro y el que corre de verdad se separen:

```bash
cd cloudflare/scheduler
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN
```

El token es un **fine-grained PAT de GitHub** con acceso solo a este repositorio
y un único permiso: *Actions → Read and write*. Nada más; no puede leer código
ni escribir en el repositorio.

Los `schedule` de GitHub **se quedan puestos**, degradados a uno por hora y
escalonados. Si el reloj se para —el token caduca, Cloudflare tiene un mal
día— la ingesta vuelve a la cadencia mala en vez de apagarse, y `/estat` lo
enseña.

**El token va sin caducidad, y es una decisión, no un descuido.** Un token
caducado para el reloj sin avisar a nadie, que es justo la clase de fallo que
este proyecto lleva pagando. Y el daño si se filtrara es pequeño y acotado: con
`Actions: Read and write` sobre un repositorio público solo se pueden lanzar o
cancelar nuestros workflows. No da acceso al código, no permite escribir en el
repositorio, y **no llega a las credenciales de R2** — disparar un workflow no
entrega sus secretos a quien lo dispara.

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
