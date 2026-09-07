# Meteo Catalunya — notas para trabajar en este repositorio

> **Si acabas de entrar en el proyecto, lee primero
> [`docs/12-estado-y-continuacion.md`](docs/12-estado-y-continuacion.md).**
> Tiene el estado exacto, lo que falta y —lo que más tiempo ahorra— las trampas ya descubiertas
> de cada fuente. Casi ninguna da error: dan datos plausibles y equivocados.
>
> Los siguientes pasos, en orden y con la decisión técnica tomada, están en
> [`docs/13-full-de-ruta.md`](docs/13-full-de-ruta.md).

Plataforma meteorológica de Catalunya con cobertura hasta el núcleo de población.
Diseño completo en [`docs/`](docs/); la tesis está en
[`docs/00-resumen-ejecutivo.md`](docs/00-resumen-ejecutivo.md).

## Estructura

| Ruta | Qué es |
|---|---|
| `scripts/` | Pipeline de datos. Node ejecuta el TypeScript directamente, sin build |
| `scripts/workers/` | Ingesta periódica: observación, predicción, avisos |
| `src/lib/` | Frontera entre datos y aplicación |
| `src/lib/narrative.ts` | Del dato a la frase: el titular, las franjas del día, las preguntas |
| `data/cache/radar/` | Teselas de radar ya descargadas. Las sirve una route handler |
| `data/cache/cameres/` | Fotogramas de las cámaras de FGC, ya reescalados. Igual: los sirve una route handler |
| `src/lib/mountain.ts` | Las seis estaciones de esquí: qué hay abierto, cuánta nieve y la temperatura a cota |
| `src/lib/routes.ts` | Los 683 itinerarios señalizados. **ODbL, no CC-BY: fuera del API** |
| `data/build/routes.json` | Índice de los 683: nombre, código, km, cotas, comarcas. **Se versiona** |
| `data/build/routes/<slug>.json` | Trazado y perfil de alturas de uno. Solo lo lee su ficha |
| `data/cache/base/` | Teselas del mapa base del ICGC, ya en WebP. Las sirve una route handler |
| `src/app/` | Rutas Next.js |
| `data/build/` | Territorio construido. **Se versiona** |
| `data/build/geo/comarques-map.json` | El mapa, ya proyectado y simplificado en el build. Ver `scripts/10-map-geometry.ts` |
| `src/lib/cache-store.ts` | **La frontera de lectura.** Disco en local, almacén de objetos en producción |
| `data/cache/forecast/` | La predicción, un fichero por comarca. Nunca un monolito: ver `shards.ts` |
| `data/cache/history/`, `data/cache/air/` | Lo mismo, por estación y por celda. Una ficha no se baja el país |
| `data/cache/climate/` | La serie **mensual completa** de cada estación. Solo la lee `/estacions/<codi>` |
| `data/raw/`, `data/cache/` | Descargas y datos vivos. No se versionan |
| `db/migrations/` | Esquema PostgreSQL, sin aplicar todavía |

## Restricciones de TypeScript en los scripts

Node 24 ejecuta `.ts` **borrando los tipos, sin transformarlos**. Todo lo que genere código en
tiempo de ejecución falla al arrancar:

- ❌ Propiedades de parámetro: `constructor(private readonly x: T)`
- ❌ `enum` (usa `as const` o uniones de literales)
- ❌ `namespace`, decoradores
- ✅ Todo lo demás, incluidos genéricos y `satisfies`

Los imports relativos **necesitan la extensión `.ts` explícita**. Por eso `scripts/` tiene su
propio `tsconfig.json` y la raíz lo excluye.

La raíz ahora lleva `allowImportingTsExtensions`, así que un fichero de `src/lib/` **puede** usar
la extensión y quedar ejecutable por Node. Lo hacen dos: `narrative.ts`, para que
`scripts/test-narrative.ts` lo pueda cargar, y `forecast-merge.ts`, porque el worker necesita el
mismo cálculo que la página. El resto de la aplicación sigue con el alias `@/` y sin extensión.
Si añades otro, la condición es la misma: que toda su cadena de imports acabe en ficheros que no
importan nada.

Comprueba ambos proyectos con `npm run typecheck`.

## Código compartido entre scripts y aplicación

Hay diez ficheros que importan los dos lados: los scripts los cargan con extensión `.ts` y la
aplicación con el alias `@/`. Nueve **no importan nada**, y la condición para añadir uno es esa.

El noveno, `forecast-merge.ts`, sí importa —y es la excepción que ya describe la sección de
arriba: importa con extensión `.ts` y **toda su cadena acaba en ficheros que no importan nada**.
Está así porque duplicarlo sería tener dos predicciones distintas para el mismo sitio según
quién hiciera la cuenta. Fuera de ese caso, duplica antes que romper uno de los dos lados.

| Fichero | Qué comparte |
|---|---|
| `src/lib/variables.ts` | La tabla Rosetta: códigos XEMA ↔ nombres de Open-Meteo ↔ AEMET |
| `src/lib/air-variables.ts` | Variables de calidad del aire, bandas del AQI europeo, umbrales de polen |
| `src/lib/air-grid.ts` | La celda de 0,1° que es la unidad de consulta del aire |
| `src/lib/mercator.ts` | Proyección de las teselas del radar y de los polígonos que van encima |
| `src/lib/format.ts` | Fechas, horas, números y contracciones del catalán |
| `src/lib/forecast-types.ts` | Las formas de la observación y de la predicción, sin `node:fs` detrás |
| `src/lib/shards.ts` | Dónde vive cada trozo de cada dato, y por qué está partido |
| `src/lib/forecast-merge.ts` | De los modelos a una serie, y de la serie al resumen por días |
| `src/lib/search-match.ts` | Cómo se parece lo que se escribe en el buscador al nombre de un sitio |
| `src/lib/climate-math.ts` | Qué es un mes comparable, qué es un año entero y cómo se saca una tendencia |

## Dónde viven los datos vivos

En local, en `data/cache/`, y no hay más que decir. En producción **no hay
disco**: una función de Vercel arranca con el código del despliegue y nada más.

El almacén es **Cloudflare R2**, y la razón es una sola: **no factura la salida
de datos**. Este sitio existe para servir datos públicos —su trabajo es
justamente la salida— y con el almacén de Vercel un solo rastreo del sitemap
consumía más de un mes de cuota. Lo consumió, el 1 de septiembre de 2026, y
dejó el sitio a medias durante horas.

Así que hay dos mitades y conviene no confundirlas:

| | Quién | Variables |
|---|---|---|
| **Escribir** | los workers, con `publish()` al final | `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |
| **Leer** | la aplicación, en `cache-store.ts` | `DATA_BASE_URL` |

Sin esas variables todo funciona contra el disco, que es lo que pasa mientras
desarrollas. Con la mitad de escritura **a medias**, en cambio, se lanza: no
publicar es un estado normal, creer que publicas no lo es.

No hay SDK. La firma v4 son cuarenta líneas de `node:crypto` en
`scripts/lib/s3.ts`, y ahí está escrito por qué no vale la pena traerse veinte
megas de dependencia para construir una cabecera.

Cuatro cosas más que no son evidentes:

- **Una página descarga bytes en proporción a lo que enseña.** No a lo que
  existe. Es la regla que faltó al principio y salió cara: una ficha de
  municipio pedía 4.965 kB —el histórico de las 189 estaciones para usar una,
  las 372 celdas de aire para usar una— y el primer rastreo del sitemap se
  comió los 10 GB mensuales del almacén. El cómo y el porqué de cada partición
  están en `src/lib/shards.ts`; si añades una fuente, esa es la pregunta que
  hay que hacerse antes de escribirla.
- **Leer es asíncrono.** `currentFor`, `forecastFor`, `seaNear`… todos devuelven
  promesas. Si añades un lector nuevo, que salga de `cache-store.ts`.
- **No se usa la caché de `fetch` de Next.** Su límite por entrada son 2 MB y el
  trozo de predicción más grande ocupa 2,03: la entrada no se guardaría, se
  volvería a pedir en cada petición y nadie vería un error.
- **Si el almacén falla se sirve la copia anterior.** Un corte de red no puede
  dejar la web en blanco; un dato de hace veinte minutos con su hora bien puesta
  sigue siendo un dato.

## La ingesta automática

Los workers corren en GitHub Actions, en `.github/workflows/`. El reparto y el
porqué de cada hora están en `prediccio.yml`, que es el único que gasta cuota de
verdad: **A dos veces al día, B y C una** — 8.126 unidades diarias, el 81 % del
techo mensual.

**Pero el reloj de los tres de alta frecuencia no es de GitHub.** Su
planificador no cumple: declaraban cada 10, 15 y 30 minutos y corrían cada tres
horas largas, los tres a la vez. Los dispara un cron de Cloudflare que solo
llama a `workflow_dispatch` —`cloudflare/scheduler/worker.js`, donde está la
medición y el porqué—. La ingesta sigue en Actions: en Cloudflare no cabe, con
10 ms de CPU y 50 subpeticiones por invocación.

Las `schedule` de GitHub se quedan puestas, degradadas a una por hora: son la
red de seguridad si el reloj se para.

Dos cosas que no son evidentes y que cuestan caro descubrir:

- **El contador de cuota vive en el almacén, no en el disco.** Cada ejecución
  arranca con un contenedor limpio, así que sin `syncQuota()` el guardián creería
  cada vez que no se ha gastado nada. El síntoma no sería un error: sería un
  `429` a media tarde y media Catalunya sin predicción hasta el día siguiente.
- **El worker de predicción publica el contador después de cada lote**, no solo
  al final. Dura cuarenta minutos; si lo matan a la mitad, el gasto ya está hecho
  en Open-Meteo y sin `publishQuota()` no constaría en ninguna parte.

## Comandos

```bash
npm run data:all        # construye el territorio desde cero (~35 min)
npm run data:validate   # criterios de aceptación de la fase 0
npm run typecheck       # aplicación y scripts
npm run build
```

Workers:

```bash
npm run worker:xema       # observació, cada 10 min
npm run worker:radar      # radar RainViewer, cada 10 min
npm run worker:warnings   # avisos AEMET, cada 15 min · necessita .env.local
npm run worker:air        # qualitat de l'aire i pol·len, cada 12 h
npm run worker:forecast   # predicció · accepta --tiers=A,B,C i --fill
npm run worker:history    # rècords i normals, un cop al dia
npm run worker:cameres    # cameres de muntanya de FGC, cada hora
npm run worker:muntanya   # neu, obertura d'estacions i meteo d'FGC, cada hora
```

Pruebas:

```bash
npm run test              # topónimos, astronomía, hora cero de la predicción, buscador y frases
npm run test:search       # lo que el buscador tiene que encontrar y lo que no
npm run test:climate      # los meses y los años que el histórico tiene que descartar
npm run test:narrative    # las frases, con perfiles de lluvia sintéticos
```

## Cómo se escribe lo que lee el usuario

El razonamiento va en el código; en la página va lo que el lector necesita saber.
Son dos textos distintos y confundirlos se nota. Tres reglas, salidas de una
revisión de las 360 frases largas que el sitio renderiza:

- **La página no habla de sí misma.** «Ensenyar una verda d'abans-d'ahir com si
  fos d'ara és el pitjor que podria fer aquesta pàgina» explica *nuestra*
  decisión. Al lector le sirve: «la posa un socorrista quan és de servei, i fora
  d'horari no s'actualitza». Misma honestidad, sin la justificación.
- **Registro neutro.** Nada de «quatre gotes», «de debò» ni «tomba una para-sol».
  Se dice qué pasa —plugim, no arriba a mullar el terra— que además es
  comprobable.
- **Sin pullas a la competencia.** «Les estacions que hi ha de veritat» o «la
  pregunta que la gent fa de veritat» marcan que nosotros sí y otros no. Eso no
  es información.

El tratamiento es **de vós** en todo el sitio (`consulteu`, `podeu`, `vostre`).
No hay ni un «tu», y conviene que siga así.

## Principios que no se negocian

**La ingesta está desacoplada del renderizado.** Ninguna petición de un usuario dispara jamás
una llamada a una API externa. Los workers escriben en `data/cache/`; las páginas leen de ahí.

**Sin dato verificado no se publica.** Una ubicación sin coordenada fiable no tiene página. Vale
más un sitio con 4.293 páginas correctas que uno con 11.019 inventadas.

**No se llama "limítrofe" a lo que solo está cerca.** La colindancia real sale de las líneas de
frontera del ICGC (`relation: 'adjacent'`); la proximidad es `'nearest'` y se etiqueta distinto.
Esa diferencia acaba en el texto de las páginas.

**Se dice de dónde viene cada número.** Estación, distancia, desnivel y hora de la lectura.
Cumple CC-BY y es la mejor decisión de producto del sitio.

**No se promete precisión no demostrada.** Mientras no exista la verificación de la fase 4, los
modelos pesan igual y la página lo dice.

**Las frases se generan con plantillas, nunca con un modelo en tiempo de ejecución.** Con 4.293
páginas, un generativo produce cuatro mil afirmaciones que nadie ha comprobado. `describe.ts` y
`narrative.ts` son deterministas y auditables, y si el dato no está, la frase no se escribe.

**Cero JavaScript propio es una regla de las páginas territoriales, no del sitio.** Los mapas
interactivos y el tauler viven en `/mapa` y `/tauler` y cargan su código solo ahí.

Hay **dos** `'use client'` en el proyecto, y ninguno cambia una ficha de lugar:

- `SiteSearch.tsx`, el cuadro de búsqueda de la cabecera. Va en todas las páginas, así que el
  coste se midió antes de ponerlo: **1.546 bytes en gzip**, la diferencia de sumar todos los
  fragmentos de `.next/static/chunks` con y sin él. Es tan poco porque el runtime ya estaba
  —ver la tabla de abajo—. Lo que **no** se hizo fue bajar el índice al navegador: los
  sugerimientos los contesta `/api/cerca`, que solo llama quien escribe.
- `RadarScrubber.tsx`, la línea de tiempo del radar, y solo en `/radar`.

Los dos son mejoras **encima** de algo que ya funcionaba sin JavaScript, y los dos lo dejan
funcionando: el buscador sigue siendo un `<form method="get">` y el radar sigue siendo los
radios ocultos con sus reglas de `:checked`. La barra del radar no dibuja ni oculta ningún
fotograma — solo marca el radio que toca —, y las pastillas con la hora de cada instante siguen
en el HTML: se ocultan con una clase que el componente pone **al montarse**, así que sin
JavaScript no se ocultan nunca.

Lo que hay que dejar de decir es la cifra que acompañaba a la regla.
Medido con `next start` sobre `/maresme/malgrat-de-mar`:

| | crudo | gzip |
|---|---|---|
| HTML de verdad | 192 KB | **21 KB** |
| Carga RSC incrustada, que lo duplica | 320 KB | 30 KB |
| Runtime de React y Next, en seis ficheros | — | 137 KB |

O sea: el HTML sí baja de 40 KB, pero **la página no**, y hidratar hidrata. Los 167 KB que
sobran son el suelo del App Router y no los pone ningún componente nuestro. Decir «sin
hidratación» era falso y hay que decirlo así hasta que se decida qué hacer.

## Cuotas: la restricción que manda

Open-Meteo factura **ubicaciones**, no peticiones (10 variables × 7 días × 1 ubicación = 1
llamada). Refrescar los 3.190 puntos con 5 modelos son 15.950 unidades contra un límite diario
de 10.000: no cabe ni una vez al día. De ahí la política de modelos por nivel en
`scripts/workers/forecast-refresh.ts`.

`QuotaGuard` corta al 95 % y degrada al 80 %. No lo desactives para "hacer una prueba rápida".

**La calidad del aire tiene contador aparte.** `air-quality-api.open-meteo.com` no comparte cuota
con la de predicción, y por eso el bloque de aire cabe sin quitar ningún modelo. Se contabiliza
como `open-meteo-air`, nunca junto: mezclarlos da una lectura falsa en las dos direcciones.

Y **no se pide un punto por ubicación**: CAMS trabaja a 0,1° (11 km), así que la unidad de
consulta es la celda (`src/lib/air-grid.ts`). De 3.190 puntos salen 372 celdas — un décimo de la
cuota para exactamente la misma información.

## Rarezas de las fuentes, ya descubiertas a base de golpes

- **Open-Meteo devuelve `nan` sin comillas** cuando un punto cae fuera del dominio de un modelo.
  No es JSON válido. Hay que sanear el texto antes de parsear.
- **La XEMA no rellena `codi_estat` en los datos recientes.** Filtrar por `'V'` deja la web sin
  ningún dato actual. Se etiquetan como provisionales.
- **El retraso de la XEMA es de 45 a 65 minutos**, variable. Nunca presentes la lectura como si
  fuera de ahora mismo.
- **El Nomenclàtor es de 2021 y dice 42 comarcas. Son 43** desde que se creó el Lluçanès.
- **El dataset de centroides `9aju-tpwc` trae dos filas basura** (`999998`, `999999`).
- **El tilecache público de RainViewer solo llega al zoom 7.** Del 8 en adelante devuelve un PNG
  que dice «Zoom Level Not Supported» **con código 200 y tipo `image/png`**: se descarga, se
  guarda y se pinta sin que nada falle. Se detecta porque dos teselas contiguas salen byte a byte
  idénticas. El worker comprueba el tamaño y aborta.
- **En catalán el artículo forma parte del topónimo y se contrae.** «de el Prat» y «a el Prat» son
  faltas visibles; usa `deName()` y `aName()` de `src/lib/format.ts`, nunca concatenes la
  preposición a mano. Lo mismo con los meses: `monthOf()`, porque es «d'agost» y «de setembre».
- **Las comarcas llevan artículo y el fichero del ICGC no lo trae.** Es «l'Alt Camp», «el Bages»,
  «les Garrigues» — y **Osona** es la única sin artículo. Hay tabla de las 43 en `format.ts`:
  `comarcaName()`, `deComarca()`, `aComarca()`. No hay regla que lo deduzca de la terminación.
- **`Date.now()` dentro de un componente hace saltar `react-hooks/purity`** y el lint es un error,
  no un aviso. La hora del reloj es un dato: se calcula en `src/lib/weather.ts` y llega por props.
  Es lo que hizo aparecer `dayFraction` en `Astronomy` y `ageMin` en `radar()`.
- **`?? 0` sobre un dato que puede faltar convierte una laguna en un cero medido.** El contador de
  días sin lluvia daba 398 en el Port de Barcelona, que no tiene pluviómetro. Un dato ausente
  corta la cuenta; no la alimenta.
- **`worker:history --station=XX` fusiona, no sustituye.** Antes sustituía, y una comprobación de
  una estación dejaba el fichero con una sola: el bloque de clima desaparecía de las 4.293 páginas
  sin que nada diera error.
- **Un total del mes en curs s'ha de dir amb quants dies cobreix.** «Hi sol ploure 86 mm, i
  aquest mes en porta 0 mm» era cert el 4 de setembre —la sèrie diària va dos dies enrere i
  només tenia l'1 i el 2— i es llegia com que no hi havia plogut. Comparar dos dies contra la
  normal de trenta no és comparar res. Es va veure perquè el bloc de pluja acumulada, a la
  mateixa pàgina i just a sobre, deia 168,8 mm en trenta dies.
- **Ordenar aparells no contesta una pregunta sobre boscos.** `/bolets` obria amb «on més ha
  plogut és a Torredembarra», que és on hi ha un pluviòmetre i on va descarregar la tempesta.
  La pàgina ara diu el que és —pluja acumulada per estació— i la pregunta, que es fa d'un lloc
  concret, es contesta a la fitxa d'aquell lloc amb `RainBlock`. Es corregiria de debò amb una
  capa d'usos del sòl, que no tenim.
- **La serie mensual va a su propio trozo, y no al del histórico.** Son 457 meses en la estación
  más antigua —desde septiembre de 1988— y meterlos en el trozo del histórico lo llevaba de 10 kB
  a 51. Ese trozo lo leen **las 4.293 fichas de pueblo** y ninguna enseña la serie: solo la ficha
  de la estación. `climateShard()` en `shards.ts`.
- **Un mes incompleto no es un mes frío, y un año al que le falta enero sale más cálido.** Todo
  `src/lib/climate.ts` descarta en vez de promediar lo que hay: meses con menos de 25 días fuera,
  años con menos de 12 meses fuera. Sin eso, una avería de dos semanas se lee como clima.
- **Una anomalía del mes en curso medida contra la normal del mes entero mete dentro la deriva
  del propio mes.** Los cinco días que la serie tenía de septiembre de 2026 en Raimat daban
  **+6,9 °C** contra la normal de septiembre y **+4,8 °C** contra esos mismos cinco días de los
  otros 37 años: 2,1 °C de aquella cifra no eran anomalía, era que la primera semana de
  septiembre es más cálida que el septiembre medio. La cifra grande de la ficha sale ahora de
  `monthProgressOf`, que compara el mismo tramo; `monthAnomaly` se queda de respaldo para las
  series cortas y entonces la página dice contra qué se compara. Y la comparación de tramo
  descarta el año pasado al que le falte más del 20 % de los días de la ventana: con cuatro de
  cinco días ya no es la misma semana. Prueba: `npm run test:climate`.
- **La tendencia se calcula por mínimos cuadrados y no restando el primer año al último.** Con
  dos puntos, un año excepcional en cualquiera de los dos extremos decide el resultado entero.
  Y no se dibuja por debajo de 15 años completos: con menos, el pendiente de una serie de
  temperaturas es ruido con un signo. Medido sobre la red: 134 de 135 estaciones con serie
  suficiente dan pendiente positiva, mediana **+0,45 °C por década**.
- **El dataset diario `7bvh-jvq2` lleva dos días de retraso.** Su última fila el 31 de agosto era
  del 29, así que «ahir» nunca sale de ahí: los extremos de ayer los da el agregado semihorario
  del worker de observación.
- **El sensor de nieve miente en verano y el portal lo marca como bueno.** Daba 12 cm en Das el
  28 de agosto con la mínima en 9,3 °C, con el estado `Representatiu`. Hay un filtro físico en
  `xema-history.ts`: el espesor solo puede crecer un día que haya helado.
- **La dirección del viento diario también va en tres alturas** (1515/1516/1517, como los códigos
  semihorarios 30/48/46). Pidiendo solo la de 10 m, 87 de 189 estaciones se quedan sin rosa.
- **El registro de sequía `i5n8-43cw` anota cambios, no lecturas.** El último es de mayo de 2025 y
  628 de 630 municipios están en normalidad. No se muestra nunca sin la fecha del último cambio.
- **Las coordenadas de la ACA vienen en UTM 31N.** Hay conversor en `scripts/lib/geo.ts`,
  verificado porque cada embalse cae dentro del municipio que lleva en el nombre.
- **La XVPCA (`tasf-thgu`) no es un dato en vivo: lleva ~20 h de retraso.** Se escribe una vez
  al dia de madrugada y la fila del dia en curso se queda en la hora 4. Es la medida de *ayer*,
  y asi se presenta. El CO viene en mg/m3 y el modelo en ug/m3.
- **Socrata omite los campos nulos.** La ausencia de `h05` no es un cero: es que no esta. Una
  media diaria calculada solo sobre las horas presentes no es una media diaria.
- **En el registro de platges (`4baz-cjv2`), `coordenada_x` es la latitud y `coordenada_y` la
  longitud.** Al reves de lo que dicen los nombres. Y `estat_data` va en DD/MM/YYYY con una T.
- **Una bandera de platja caduca.** La ponen los socorristas de servicio; fuera de horario la
  ultima fila se queda ahi. Umbrales en `src/lib/sea.ts`: vigente < 3 h, se ensena < 12 h.
- **La predicción va partida en 43 ficheros y `forecastFor` necesita `loc.comarcaCodi`.** Sin él
  no busca en ninguna parte y devuelve `null` sin dar error: la página sale entera pero sin
  predicción. El punto de un municipio de frontera está duplicado en los dos trozos a propósito.
- **`data/cache/forecast/index.json` se escribe el último, y el orden importa.** Es el que dice
  qué trozos existen; mientras no esté, la aplicación lee los de la vuelta anterior en vez de una
  mezcla de dos refrescos. Si alguna vez se escribe antes, se sirven medias predicciones nuevas
  con medias viejas y ningún dato parece mal.
- **React solo rellena un `<title>` si su único hijo es una cadena.** Con tres hijos —una
  plantilla y dos condicionales— el servidor escribe `<title></title>` vacío y el cliente pone el
  texto: discrepancia de hidratación, y React vuelve a renderizar el árbol entero en el
  navegador. No da ningún error visible. Estuvo así en las rosas de los vientos de las 4.293
  páginas. Compón la cadena antes y pásala de una pieza.
- **La geometría del mapa no se simplifica en cada render.** Las 43 comarcas del ICGC son 14.347
  puntos, unos 154 KB de `path`. `scripts/10-map-geometry.ts` las proyecta, las simplifica con
  Douglas-Peucker a un píxel y las deja en enteros con órdenes relativas: 23 KB, y la aplicación
  solo pone el color. Si tocas la geometría, `npm run data:map`.
- **La proyección del mapa se publica en el JSON, y antes no.** `10-map-geometry.ts` se
  guardaba `minX`, `minY` y `scale` en variables locales, así que el fichero solo servía para
  pintar las 43 comarcas: no había manera de saber dónde cae un punto en grados. Es lo que hacía
  imposible poner playas o estaciones de esquí encima. La fórmula está en `mercator.ts`
  (`mercPoint`, `projectToMap`) y la usan los dos lados — con dos copias, un día se separarían.
- **Pintar de mar todo lo que queda fuera del contorno pinta Aragón y Francia de mar.** En un
  mapa eso no es un detalle de estilo. `CoastMap` deriva el polígono del mar de los 20 puntos
  del modelo: los desplaza 60 unidades tierra adentro —el exceso lo tapan los polígonos de las
  comarcas, que se dibujan encima— y alarga los dos extremos por la tangente. La dirección de
  «tierra adentro» es una referencia fija al noroeste y **no** el centroide: comparando con el
  centroide, en el delta el producto escalar salía −27 sobre magnitudes de centenares, giraba la
  normal hacia el mar y el punto de Alcanar quedaba dibujado sobre el papel.
- **La tinta de la escala de temperatura sale de la luminosidad del color, no de los grados.**
  El umbral estaba puesto a ojo —«a partir de 30 °C, texto claro»— y a 30 °C el fondo tiene un
  72 % de luminosidad: el mapa salía con los treintaytantos en blanco sobre naranja claro. En
  esta escala el extremo cálido nunca se oscurece lo bastante para pedir texto claro.
- **Un worker que fusiona con su estado anterior tiene que leerlo del almacén, no del disco.**
  `readSnapshot()` lee `data/cache/`, y en GitHub Actions ese directorio arranca vacío: «no hay
  nada anterior» y «no lo he sabido leer» acaban siendo lo mismo. Pasó de verdad — un refresco
  del nivel A publicó **350 puntos de 3.190** y dejó sin predicción la mayoría de las 4.293
  páginas, con la ejecución en verde. Usa `pullSnapshot()`, que va al almacén y **lanza** si no
  puede leer.
- **`nth-of-type` cuenta por etiqueta, no por clase.** Las pestañas de `NextHours` emparejan cada
  radio con su panel por posición; con los paneles en `div` y la barra de pestañas también en
  `div`, todos los índices quedaban corridos uno y no se enseñaba ningún panel. Los paneles son
  `<section>` por eso. Y `.tabs > label` no casaba nunca porque las etiquetas viven dentro del
  `.tablist`, no colgando de `.tabs`.
- **Open-Meteo devuelve siempre desde las cero horas del día en que se pide**, y el fichero de
  predicción guarda un solo array de horas para todos los puntos. Un nivel que se refresca hoy y
  otro que se conserva de ayer arrancan en días distintos: sin cuadrarlos, la predicción se
  sirve **corrida un día**, y al siguiente dos. No da ningún error —los números son plausibles,
  solo son de otro día—. Lo cuadra `scripts/lib/forecast-align.ts`, y el desplazamiento se busca
  con `indexOf` y no restándole fechas, porque el domingo del cambio horario tiene 23 o 25 horas.
- **La ventana horaria de la predicción son 120 horas, pero el horizonte son 14 días.** El resumen
  diario lo calcula el worker. Cualquier frase que hable del horizonte tiene que salir de
  `forecast.daily`: sacándola de `forecast.hourly` se afirma sobre catorce días habiendo mirado
  cinco. Pasó con la frase del desacuerdo entre modelos.
- **AEMET publica els avisos només en castellà i en anglès.** Els fitxers CAP de l'àrea 69
  porten dos blocs `<info>`, `es-ES` i `en-GB`, i cap més: no hi ha versió catalana per demanar.
  Per això la targeta d'avís **no fa servir el seu text**: el nivell, el fenomen, la zona,
  l'horari i el llindar venen com a codis i números, i amb això n'hi ha prou per escriure-la de
  zero. Les taules -10 fenòmens i 21 zones, tots dos conjunts tancats- són a
  `src/lib/warning-labels.ts`. El text oficial va plegat, etiquetat i en el seu idioma; traduir
  informació de seguretat no ho fem.
- **`warning.phenomenon` és el codi (`AT`, `PR`, `NE`), no un nom.** `/avisos` en va publicar
  «El més alt és de nivell groc per **at**». El nom en surt de `phenomenonName()`.
- **AEMET emet un fitxer CAP per dia i per zona.** Una onada de calor de tres dies arriba com
  tres avisos idèntics excepte la data, i la Vall de Boí ensenyava tres targetes seguides que
  calia comparar paraula per paraula. Els ajunta `groupWarnings()`, i **mai per menys que
  fenomen + nivell + zona**: si un dia puja a taronja, el taronja va a part. Dins del grup es
  conserva el llindar de cada dia.
- **Els noms de l'ACA porten l'etiqueta del tipus d'estació davant, i de vegades en porten
  dues.** Sis aforaments es diuen `Aforament - Qualitat - <lloc>`, i traient només la primera
  la fitxa de Malgrat ensenyava «Qualitat - Fogars de la Selva» sota «L'aforament més proper».
  Fes servir `gaugeName()`. I sis aforaments **són** a l'embassament més proper: repetir-ne el
  nom sota dos títols fa que sembli un error, i per això hi ha `sameSpot` a `WaterBlock`.
- **El motiu d'una bandera de platja el tecleja qui fa el comunicat.** La llista és tancada
  -`MEDUSES`, `Vent`, `Estat del mar`, `Qualitat de l'aigua`, `Altres`- però hi havia
  `MEDUSES` en majúscules i, en una platja, `Medusas` en castellà. Normalitza amb
  `flagReasonText()`.
- **El rètol d'endarreriment de `/estat` es mesura contra la data de la dada, no contra
  l'execució.** Una font que publica un cop al dia amb un límit de tres hores surt en roig
  sempre, també amb el worker acabat de passar — i un rètol que sempre està en roig deixa
  d'avisar de res. Va passar amb els rècords de la XEMA i amb els avisos de l'AEMET, que
  elabora el lot de fitxers CAP un o dos cops al dia. El límit ha de ser el cicle real de
  la font, no la cadència del worker.
- **En un ombrejat, el terreny pla no és negre al 40 %: és transparent.** Amb el sol a 45
  graus, un pla reflecteix `cos(45°) = 0,707`, no 1. Comptant l'ombra com «el que falta per
  arribar a 1», cada tessel·la plana sortia amb un alfa de 101 sobre 255 —mesurat al delta i a
  mar obert, uniforme— i tot el mapa hauria portat un vel fosc que tapava el color del terra i
  pintava el mar. Es compara contra el pla: per sota, ombra; per damunt, llum.
- **Un ombrejat no serveix on el terreny és pla, i mig país ho és.** El mapa d'un itinerari es
  va fer primer amb el relleu calculat del model d'altures, i a la Plana de Vic no dibuixava
  res: el traçat quedava flotant damunt del blanc. El que fa útil un mapa a qui camina són els
  camins, les carreteres, els rius i els noms — i això surt d'una cartografia, no d'un DEM. El
  fons és ara el **mapa base de l'ICGC**, que és CC BY i es pot desar i tornar a servir dient
  d'on ve. `scripts/14-basemap-tiles.ts`.
- **Les tessel·les del mapa base van en WebP i no en PNG.** L'ICGC les serveix en PNG de 512 px
  i entre 310 i 470 kB; en WebP de qualitat 80 es queden entre 36 i 66, vuit vegades menys, amb
  la mateixa resolució. Amb PNG, un mapa de dotze tessel·les serien quatre megues i mig.
- **La finestra i el zoom d'un mapa els calculen `fitBox()` i `tileWindow()`, i viuen a
  `mercator.ts` per una raó.** Els han de calcular **igual** el worker que baixa les imatges i
  la pàgina que les col·loca; amb dues còpies, el dia que una canviï el mapa surt amb forats i
  res no dona error. Els zooms i el sostre de tessel·les són constants als dos costats i el
  comentari de cada un remet a l'altre.
- **El relleu de `11-relief.ts` no serveix per a un mapa de detall.** És una sola imatge de 788
  × 1024 px per a tot el país, uns 400 m per píxel: retallant-ne el tros d'un itinerari de 26 km
  en surten noranta píxels. Per això hi ha `13-relief-tiles.ts`, que en fa tessel·les del zoom 9
  al 12 — i cada mapa tria el zoom on la seva finestra hi cap amb poques, perquè un GR de 400 km
  al zoom 12 en voldria tres mil per a un dibuix de set-cents píxels.
- **Els itineraris són d'OpenStreetMap i per tant **ODbL**, no CC-BY.** Ensenyar-los en una
  pàgina només demana atribució, però posar-los al feed de `/dades` en faria una base de dades
  derivada i xocaria amb el CC-BY que aquell feed promet. Es queden fora de l'API.
- **L'etiqueta `distance` d'OSM la tecleja qui mapa.** Hi havia cinc rutes seguides amb
  exactament «15.0 km», i en 26 dels 683 la geometria i l'etiqueta es separen més d'un 25 %. Es
  publica la calculada del traçat. El **desnivell acumulat**, en canvi, no es calcula: amb un
  model de 57 m sortiria curt sense que es notés, i només surt quan OSM el porta.
- **Una relació d'itinerari a OSM és un sac de vies sense ordre.** Per a la longitud dona
  igual —`lengthM()` només suma— però un perfil d'alçades és l'altura contra la distància
  **recorreguda**, i sense ordre aquella distància no vol dir res. `stitch()` les cus pels
  extrems i el perfil només es publica quan hi entra el 95 % de la longitud: 662 dels 683. El
  traçat, en canvi, es dibuixa via a via amb un `M` cadascuna, i per això no li cal cap ordre.
- **Una clau derivada es calcula un cop; qui la necessiti, la busca.** El slug d'un itinerari es
  desempata al final del worker —dues relacions amb el mateix nom hi porten l'`osmId`— i el bloc
  de la geometria el tornava a derivar pel seu compte. Hi ha dos «Camí de Sant Jaume»: el fitxer
  del de 232,9 km va sobreescriure el del de 3,6, la fitxa curta ensenyava el traçat del llarg i
  l'altra es quedava sense fitxer. Tot en verd. Ara la geometria va per `osmId` i el worker
  **llança** si algun itinerari es queda sense fitxer o si dos en comparteixen un.
- **La distància d'un perfil s'acumula sobre tot el traçat, no de mostra a mostra.** Sumant
  només entre punts de mostreig, cada revolt entremig es perd: l'Anella Verda de Vic, de 26,2
  km, sortia amb un perfil que s'acabava als 23,5. Un eix que no arriba on diu el titular fa
  dubtar dels dos números.
- **Els enllaços que se'n van del web passen per `<External>`.** Porta `target="_blank"` i
  `rel="nofollow noopener noreferrer"`, i ho diu amb un símbol. Escrivint-los a mà se'n va
  oblidar un: la fitxa d'un itinerari obria la pàgina de l'ajuntament damunt del web.
- **El filtre d'àrea d'Overpass agafa el que *passa* pel territori.** Entraven etapes de la
  Haute Randonnée Pyrénéenne amb un 3 % dins de Catalunya. Es demana la meitat com a mínim,
  mesurada amb els mateixos punts de mostreig que donen la cota.
- **El model d'elevació dona cotes negatives a la vora del mar.** És el soroll d'interpolar
  entre el terreny i la batimetria: `−4 m` en un camí de la costa. La cota mínima es limita a
  zero, i el `createDem()` de `scripts/lib/dem.ts` descarta el que baixa de −100.
- **El `limit` de l'API d'FGC té el sostre a cent, i el catàleg també pot arribar curt sense
  motiu.** `pistes-desqui` en té 181 i torna cent amb el `total_count` en un racó; i el 3 de
  setembre de 2026 el de càmeres —trenta files, que hi caben— va tornar una resposta parcial i
  el worker va publicar **quinze càmeres de vint-i-quatre en verd**, amb la Molina sencera fora
  del web. Fes servir `allRecords()` de `scripts/lib/fgc.ts`, que compara amb el `total_count`
  i llança: un catàleg incomplet és pitjor que la instantània anterior, que era sencera.
- **`facility_type_literals_ca` de les pistes porta el literal en català a 104 files i la clau
  de l'enumerat —`ski_slope`— a les altres 26.** Filtrant per «Pista», Vallter es quedava amb
  una pista de catorze.
- **El `last_update` de l'estat de les estacions diu `+00:00` i és hora local de Madrid.** Es va
  veure perquè un comunicat de les 09:13 «+00:00» quedava mitja hora al futur. Llegit com a UTC,
  tot comunicat sembla dues hores més fresc del que és. El worker el reinterpreta i comprova que
  cap no quedi al futur, que és l'única direcció on l'error es veu.
- **D'`FGC meteo-tim` no es publica ni la pressió ni la velocitat del vent, i és a posta.** La
  pressió ve reduïda al nivell del mar —per tant no diu res que la XEMA no digui millor— i una
  de les nou dona 1.056,6 hPa, que no existeix. El `VentActual` de Boí Taüll va estar clavat a
  16,1 mitja hora **sent més gran que el seu propi màxim**, i cap fitxer declara la unitat.
- **El risc d'allaus d'FGC no es publica mai.** El camp hi és i el comunicat d'Espot del 8
  d'abril seguia dient «3 - Marcat» cinc mesos després. Un risc d'allaus caducat no és una dada
  endarrerida: és perillosa. El butlletí oficial és el de l'ICGC amb el Meteocat, i s'hi enllaça.
- **Una càmera pot portar mesos aturada servint el mateix fotograma amb un 200.** És la
  trampa de la bandera de platja una altra vegada: cinc de les vint-i-quatre de FGC ho estaven,
  una des del 10 d'abril, i totes amb `is_active: 1`. Cada imatge viatja amb la seva hora de
  captura i els llindars són a `src/lib/cameras.ts`: vigent < 90 min, s'ensenya < 6 h.
- **A Roundshot, `og:updated_time` és l'hora en què s'ha generat la pàgina**, no la de la
  fotografia — les dotze càmeres tornaven el mateix segon—, i el `Last-Modified` de la imatge
  **falta justament a les aturades**. L'hora bona és a la ruta del fitxer al qual redirigeix, i
  és **hora local de Madrid**. El worker ho verifica cada volta contra les que sí que porten
  capçalera: si algun dia passa a UTC, salta amb dues hores de diferència en comptes de datar
  malament les vint-i-quatre.
- **Una càmera i la seva estació d'esquí es creuen pel `business_unit`, no pel nom.** Els noms
  coincideixen als dos catàlegs d'FGC —«La Molina» i «La Molina»— i és aquesta coincidència la
  que es trencaria sense avisar: amb un «Molina» o un «La Molina - Alp» l'estació es quedaria
  sense càmeres i tot seguiria en verd. El camp és `bunitId` a totes dues bandes. I els dos
  camins que **conserven** la fitxa de la volta anterior l'han de tornar a derivar del catàleg,
  com ja fan amb el `slug`: la fitxa d'abans surt del fitxer publicat, que pot ser d'una versió
  sense el camp.
- **Un fitxer d'imatge amb nom fix vol dir escriptura a cada volta, i R2 cobra per operació.**
  El nom no pot portar l'instant a dins —vint-i-quatre fotogrames nous cada hora amb nom propi
  són 3,6 GB al mes contra un cupó de deu— així que va a la consulta de la URL (`?v=<captura>`).
  I si la foto no ha canviat des de la volta anterior, no es reescriu: és el mateix error que ja
  va costar 4.032 pujades diàries idèntiques al radar.
- **`sharp` rebutja de sèrie imatges que qualsevol navegador pinta.** Quatre de les
  vint-i-quatre càmeres porten escombraries abans d'un marcador JPEG i amb `failOn: 'warning'`
  —el valor per defecte— es queden fora. Va amb `failOn: 'truncated'`, que continua rebutjant un
  fitxer tallat per la meitat.
- **Un cercador que no troba res no dona cap error: dona una pàgina sencera amb zero
  resultats.** La comparació es feia amb `includes()`, i per tant «cala fosca» no trobava
  **Cala la Fosca** —hi ha un «la» pel mig— ni «sant cugat valles», **Sant Cugat del
  Vallès**. Qualsevol consulta a la qual li faltés una paraula del nom deia que allò no
  existia. Ara la comparació és per paraules i viu a `src/lib/search-match.ts`, que no
  importa res i té prova: `npm run test:search`.
- **Un resultat que porta a una pàgina de 229 files no és un resultat.** Les platges anaven
  totes a `/mar` i trobar-hi la que s'havia demanat tornava a ser feina del lector. Les
  files porten `id` —`p-` platges, `e-` embassaments i estacions de muntanya, `a-`
  aforaments— i el `:target` de `globals.css` fa que es vegi en arribar-hi.
- **El camp de meduses porta diverses espècies separades per `;`.** Cada una és
  `espècie,abundància,talla`. Llegint només fins a la primera coma, a Castell-Platja d'Aro
  —que en reporta tres— sortia la inofensiva i **quedava amagada la que pica**. `parseJellyfish()`
  retorna la llista sencera, i una espècie que no consti a la taula es tracta com si piqués.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
