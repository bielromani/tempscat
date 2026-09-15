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
| `data/cache/field/` | El campo de lluvia de la predicción, una imagen por hora. Es el **futuro** del radar |
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

Hay ficheros que importan los dos lados: los scripts los cargan con extensión `.ts` y la
aplicación con el alias `@/`. La condición para añadir uno es que **no importe nada**.

La lista exacta la da `grep -rho "src/lib/[a-z-]*\.ts" scripts/ | sort -u`, y conviene sacarla de
ahí en vez de contar los de la tabla: la tabla lleva los que hay que entender antes de tocar
nada, no es un inventario, y un número escrito aquí se queda viejo a la primera.

`forecast-merge.ts` sí importa —y es la excepción que ya describe la sección de
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
| `src/lib/field.ts` | El recuadro del campo de lluvia, en píxeles del mosaico del radar |
| `src/lib/webmap.ts` | La ventana, los zooms y la dirección del worker del mapa que se mueve |
| `src/lib/warning-stack.ts` | Quin avís mana, quin acompanya i quin no diu res de nou |
| `src/lib/warning-zones.ts` | On viu el contorn de les 21 zones de Meteoalerta, i per què va a part |
| `src/lib/sky.ts` | De la nuvolositat, l'hora i la lluna a les capes del cel del titular |

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
npm run data:base       # teselas del mapa base: el país del zoom 6 al 11, y los itinerarios
npm run data:web-geo    # comarcas y municipios simplificados en grados, para MapLibre
npm run typecheck       # aplicación y scripts
npm run build           # `prebuild` copia antes el worker de MapLibre a public/
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
npm run worker:field      # el camp de pluja del radar · cada hora, i al final de `prediccio.yml`
npm run worker:verify     # quant encerta cada model, contra la XEMA · un cop al dia
```

Pruebas:

```bash
npm run test              # topónimos, astronomía, hora cero de la predicción, buscador y frases
npm run test:search       # lo que el buscador tiene que encontrar y lo que no
npm run test:climate      # los meses y los años que el histórico tiene que descartar
npm run test:hours        # qué tramo del reloj describe cada valor de la predicción
npm run check:credentials # a qué clave le queda poco. Lo corre `credencials.yml` cada lunes
npm run check:jsonld      # que cada tipus de pàgina segueixi portant el seu marcatge
npm run check:workflows   # claus repetides, `npm run` inexistents i workflows sense feines
npm run test:colors       # que el color que rep el mapa sigui el que pinta el navegador
npm run test:wind         # que el vent vagi cap on ha d'anar · amb `-- --api`, contra la marinada
npm run test:warnings     # que la pila d'avisos d'un lloc no perdi mai cap avís
npm run test:sky          # que el cel del titular digui el temps, i el contrast del text
npm run cels              # els dotze cels de cop a /__cels.html, per mirar-los de costat
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

Hay **tres** `'use client'` en el proyecto, y ninguno cambia una ficha de lugar:

- `SiteSearch.tsx`, el cuadro de búsqueda de la cabecera. Va en todas las páginas, así que el
  coste se midió antes de ponerlo: **1.546 bytes en gzip**, la diferencia de sumar todos los
  fragmentos de `.next/static/chunks` con y sin él. Es tan poco porque el runtime ya estaba
  —ver la tabla de abajo—. Lo que **no** se hizo fue bajar el índice al navegador: los
  sugerimientos los contesta `/api/cerca`, que solo llama quien escribe.
- `RadarScrubber.tsx`, la línea de tiempo del radar, y solo en `/radar`.
- `InteractiveMap.tsx`, el mapa que se puede mover, y solo en `/mapa/interactiu`.
  Este **no** es una mejora encima de algo que ya funcionaba: sin script no hay mapa
  que se mueva. Por eso vive en una dirección propia, `/mapa` sigue siendo el SVG de
  servidor de 10 kB que enlazan las 43 comarcas, y las dos páginas se enlazan entre sí
  diciendo qué es la otra. MapLibre son unos 200 kB y entra con un `import()` dentro
  del efecto: ninguna otra ruta lo toca.

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

- **Una clave que caduca no avisa, y la fecha vivía en un comentario.** La de AEMET dura
  **90 días**. El día que muera, el worker de avisos fallará, la tarjeta de avisos desaparecerá
  de las 4.293 fichas y el web seguirá saliendo entero: ni una página en blanco, ni un error
  visible, solo un bloque que ya no está. La fecha va ahora en `AEMET_API_KEY_EXPIRES`, y hay un
  workflow **aparte** —`credencials.yml`, semanal— que falla con 45 días de margen. Aparte a
  propósito: si fuera un paso del worker de avisos, el día que fallara dejaría el web sin avisos,
  que es justo lo que intenta evitar, y un run en rojo querría decir dos cosas distintas. Una
  clave **sin fecha registrada cuenta como caducada**: «no sé cuándo caduca» es el estado que
  llevó hasta aquí. Y `/estat` lo enseña en cada fuente que tenga clave.
- **Una variable que existe en el repositorio pero no está en el `env:` del workflow no existe
  para el worker.** `AEMET_API_KEY_EXPIRES` se puso como variable del repositorio y `/estat`
  siguió sin decir nada: `credencials.yml` sí la pasaba y `avisos.yml` no, así que el worker de
  avisos publicaba `credentialExpiresAt: null` en el registro de frescura y la página lo leía
  como «esta fuente no tiene clave». Ni un error, ni un run en rojo, y la variable estaba bien
  puesta. Si un worker lee una variable, **el workflow que lo lanza tiene que pasársela**, y la
  comprobación es mirar la página que la enseña, no el ajuste de GitHub.
- **Open-Meteo devuelve `nan` sin comillas** cuando un punto cae fuera del dominio de un modelo.
  No es JSON válido. Hay que sanear el texto antes de parsear.
- **La XEMA no rellena `codi_estat` en los datos recientes.** Filtrar por `'V'` deja la web sin
  ningún dato actual. Se etiquetan como provisionales.
- **El retraso de la XEMA es de 45 a 65 minutos**, variable. Nunca presentes la lectura como si
  fuera de ahora mismo.
- **El Nomenclàtor es de 2021 y dice 42 comarcas. Son 43** desde que se creó el Lluçanès.
- **El dataset de centroides `9aju-tpwc` trae dos filas basura** (`999998`, `999999`).
- **El futuro del radar no sale de un radar, y no puede salir de uno.** La API pública de
  RainViewer devuelve `nowcast: []`, y el Meteocat sí tiene nowcast —advección pySTEPS, +60 min
  en pasos de 6— pero **no está en su API**: se vende por contrato bilateral, y sus condiciones
  de uso prohiben expresamente «difondre a tercers», así que un web público entra en tarifa de
  difusión. Comprobado contra su documentación en septiembre de 2026; el detalle y los precios
  están en el hoja de ruta. Lo que sí tenemos es **nuestra propia predicción**: 3.190 puntos, uno
  cada 3,2 km, hora a hora, que `forecast-field.ts` pinta como un campo sobre el mismo mosaico.
  Se concatena a los marcos del radar y hereda la animación, el rótulo de la hora y la barra sin
  una línea más —toda la página cuenta grupos—, pero **no hereda el nombre**: la leyenda dice
  dónde acaba el radar y empieza el modelo, antes que ninguna otra cosa.
- **La pluja del model s'acabava dins del mapa, i això no es llegeix com «aquí no en sabem».**
  Los 3.190 puntos son de Catalunya, así que el campo de lluvia se cortaba en seco en la raya de
  la frontera y en la costa, con medio encuadre en blanco. Se arregló **sin inventar nada**: no
  se estira el valor del punto más cercano —eso sería dibujar lo que no sabemos— sino que se le
  pide la predicción también al mar, a Francia y a Aragón, en una malla de 0,25° (un punto cada
  25 km). Son 129 puntos, **129 unidades de cuota al día** —el 1,3 % del techo— porque se piden
  una sola vez por serie y se reaprovechan en cada repintada; van a su propio trozo
  (`field/voltant`) porque solo los lee el worker. Fuera se dice: la leyenda distingue los 3,2 km
  de dentro de los 25 de fuera.
  Tres cosas que costaron una vuelta cada una, y las tres eran de dibujo y no de datos:
  **un punto aislado con `1/d²` pinta un disco uniforme de su valor con el borde cortado**
  —si es el único que contribuye, la media ponderada es él mismo valga lo que valga la
  distancia—, así que el mar salía a lunares de 30 km; se apaga el peso con `(1 − d/r)²`, que es
  la ponderación de Shepard modificada, y el disco se funde en vez de acabarse. **Una paleta a
  escalones sobre un campo suave dibuja curvas de nivel**: encima de Catalunya no se veía
  —el campo cambia deprisa y salen finas y torcidas, como las de un radar— pero encima del mar
  cada umbral se convertía en un rectángulo y el mapa parecía de baldosas; se interpola entre
  los peldaños. Y **el umbral de abajo también es un borde duro**: se le puso un peldaño
  transparente a 0,05 mm/h para que la mancha se funda por fuera.
  El margen de la malla va un paso por fuera de la ventana visible a propósito: sin él, el
  desvanecimiento del último punto caería **dentro** del mapa y parecería que la lluvia se acaba
  en el marco.
- **El campo se repinta cada hora, y comparar con el disco para no repetir escrituras no
  funciona.** Se pintaba solo cuando se refrescaba la predicción —cuatro veces al día— y como la
  página únicamente enseña las horas que no han pasado, **el futuro del radar se iba encogiendo**:
  con el último refresco a las 17:00 UTC, a las nueve de la mañana siguiente no quedaba ninguna.
  Ahora hay `camp.yml` cada hora. Entre dos vueltas once de las doce imágenes son idénticas, así
  que se comparan y no se vuelven a subir — pero **la comparación tiene que ser contra el índice
  publicado, no contra el fichero del disco**: en GitHub Actions el disco arranca vacío, así que
  mirándolo la comparación sale siempre negativa y se subirían las doce cada hora. Escrito
  primero con `existsSync`, iba bien en local y no habría hecho nada en producción. Cada hora
  lleva su `hash` en el índice. Medido: primera vuelta 14 ficheros, segunda 2.
- **Un mapa pequeño no puede llevar el país entero dentro.** El bloque «Cap on va la pluja» de
  la ficha son cuatro cuadros de 100 km —el último radar y las tres horas siguientes— y la
  primera versión volcaba las 43 comarcas en cada uno: **320 kB de coordenadas, cuatro veces**,
  247 kB en gzip añadidos a una página que pesa 72. Dos arreglos, y los dos hacen falta:
  `comarcaPathsNear()` se queda con los trazos cuya caja toca la ventana —6 de 130 en el
  Portús— y van una sola vez en un `<defs>` que los cuatro cuadros referencian con `<use>`.
  Quedan **19 kB**. La ventana la calcula `windowOf()` una vez y la usan los dos lados: quien
  elige qué fronteras se envían y quien recorta el dibujo. Con dos cálculos, un día se enviarían
  las de un trozo y se recortaría otro.
- **El bloque de la ficha solo sale cuando la predicción de ese punto da lluvia**, y la puerta la
  mira la predicción y no el radar: un eco a cien kilómetros que se va hacia Francia no hace que
  la ficha de un pueblo de Ponent tenga que enseñar un mapa. Un mapa de lluvia sin lluvia no es
  información, es ruido en 4.293 páginas. Y el primer cuadro **siempre tiene más color que los
  otros** —medido en el Portús: 17 % de la ventana con eco de radar y 1,8 % con lluvia prevista, a
  la misma hora— porque un radar ve gotas en el aire y el campo pinta milímetros en el suelo. No
  se contradicen, pero quien lo mira leería que la lluvia se está acabando: el pie lo dice.
- **Una variable CSS solo la heredan los descendientes, y una `var()` vacía invalida la
  declaración entera.** `--rcycle` estaba en `.rmap` y el rótulo de la hora vive en `.rbar`, una
  rama hermana: `animation: rframe var(--rcycle) linear infinite` no era una abreviatura con un
  valor malo, era una abreviatura **inválida**, y el navegador la tiró en silencio. En el
  inspector solo se veía `animation-name: none`. Va en la figura, que es el padre de las dos.
- **Un `id` del DOM no se puede derivar de un número que puede no serlo.** Los doce marcos de
  futuro del radar salían del índice del campo con `"time": null` —`Math.floor(NaN / 1000)` es
  `NaN` y `JSON.stringify` lo escribe como `null`— así que compartían `id="rf-null"`: medido en
  la página publicada, **diez radios con el mismo id y sesenta reglas de CSS apuntando al
  mismo**. Al llegar a la predicción se encendían todas las horas a la vez, superpuestas, y la
  barra dejaba de mover nada. Ni un error, ni una ejecución en rojo, y las doce imágenes eran
  correctas. El defecto era `${t}:00:00Z` sobre una cadena que ya acaba en `:00`; y escrito bien
  tampoco habría valido, porque esas horas son de Madrid y no UTC —para eso está `madridToUtc`—.
  Ahora `epochOf` lanza si no puede fechar, el worker lanza si dos horas comparten instante, y la
  página descarta las horas sin instante y las que chocan con un marco de radar.
- **El tilecache público de RainViewer solo llega al zoom 7.** Del 8 en adelante devuelve un PNG
  que dice «Zoom Level Not Supported» **con código 200 y tipo `image/png`**: se descarga, se
  guarda y se pinta sin que nada falle. Se detecta porque dos teselas contiguas salen byte a byte
  idénticas. El worker comprueba el tamaño y aborta. **Vuelto a medir el 9 de septiembre de
  2026**, porque es la pregunta que se hace todo el mundo al comparar con meteo.cat: z7 son
  63.364 bytes de imagen buena y z8 y z9 son 3.269 bytes idénticos del cartel. Por eso las
  zonas de `/radar` amplían la misma imagen y no aparece más detalle: el que sí tiene zoom de
  verdad es el Meteocat, con su propio compuesto, y sus condiciones prohiben redistribuirlo.
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
- **Ordenar aparells no contesta una pregunta sobre boscos, i canviar-ne el títol tampoc.**
  `/bolets` obria amb «on més ha plogut és a Torredembarra», que és on hi ha un pluviòmetre i on
  va descarregar la tempesta. Es va retitular —«pluja acumulada per estació»— i seguia sent una
  llista d'aparells ordenada; el 8 de setembre de 2026 **es va retirar**. La pregunta es fa d'un
  lloc concret i es contesta a la fitxa d'aquell lloc amb `RainBlock`, i l'acumulat de la xarxa
  és a la llista de pluja de `/ranquings`. L'adreça redirigeix permanentment des de
  `next.config.ts`: una URL publicada no es deixa caure en un 404. Es corregiria de debò amb una
  capa d'usos del sòl, que no tenim.
- **La serie mensual va a su propio trozo, y no al del histórico.** Son 457 meses en la estación
  más antigua —desde septiembre de 1988— y meterlos en el trozo del histórico lo llevaba de 10 kB
  a 51. Ese trozo lo leen **las 4.293 fichas de pueblo** y ninguna enseña la serie: solo la ficha
  de la estación. `climateShard()` en `shards.ts`.
- **Un mes incompleto no es un mes frío, y un año al que le falta enero sale más cálido.** Todo
  `src/lib/climate.ts` descarta en vez de promediar lo que hay: meses con menos de 25 días fuera,
  años con menos de 12 meses fuera. Sin eso, una avería de dos semanas se lee como clima.
- **Un contador sin sensor no es un cero: es que no se mide.** Los cinco contadores del año se
  daban siempre, así que la Tosa d'Alp publicaba «0 dies de pluja l'any» a 2.478 m y el Pantà de
  Sau, «0 dies d'estiu». Se piden a `records`: `extremeOf` devuelve null cuando **no hay ni una
  fila** de esa variable, mientras que una serie de ceros —una estación en un sitio muy seco— sí
  devuelve extremo. Misma regla en la tabla diaria: las columnas salen de lo que esa estación
  tiene, porque siete columnas fijas para una variable eran treinta filas de guiones. Y en esa
  tabla, **0 mm medidos y ninguna medida se pintaban igual**: ahora el cero es un cero.
- **Contar los años de la serie en un solo conjunto para todas las variables convierte la falta
  de un sensor en un cero medido.** `normalsOf` sumaba la lluvia y la dividía entre los años que
  le daba la temperatura, así que una estación con termómetro y sin pluviómetro publicaba
  **«hi sol ploure 0 mm» en los doce meses**: la Tosa d'Alp, a 2.478 m, con 145 meses de serie y
  ni un registro de precipitación. Es el `?? 0` de la racha seca otra vez. Cada variable lleva su
  propio conjunto de años —`years` y `precipYears`— y sin ninguno la normal es **null**, no cero.
  Se vio contando por qué 24 estaciones no situaban el mes en curso, no mirando la página.
- **Cuatro estaciones de la XEMA solo miden lluvia, y pedírselo todo las deja sin página.** El
  Pantà de Sau, Sant Joan de les Abadesses, la Roca del Vallès - ETAP Cardedeu y Navès no
  tienen termómetro: `tMean`, `tMax` y `tMin` son nulos en toda la serie. Sau lleva **368 meses
  completos de pluviómetro** —treinta años— y, mientras los años se filtraban exigiendo media de
  temperatura, la sección de histórico no les enseñaba **nada**: ni el gráfico de lluvia que sí
  tenían. La regla es que **cada dibujo se gana con sus propios datos** —`rainYearsOf` aparte de
  `yearsOf`, y `sameMonthAcrossYears` sin exigir temperatura— y que el pie diga por qué falta lo
  que falta: «aquí no es mesura la temperatura», no «falten anys». La otra dirección también
  existe: la Tosa d'Alp tiene once años de temperatura y **cero** de lluvia completa.
- **La lluvia no se compara por meses: se compara por años.** Cinco días dicen algo de la
  temperatura de un septiembre —las medias diarias se parecen entre ellas— y no dicen **nada** de
  su lluvia, que la pone una tormenta de dos horas. Lo que tiene respuesta es el acumulado, y
  contra el mismo tramo: del 1 de enero al 5 de septiembre frente al 1 de enero al 5 de
  septiembre de cada año. Contra la media anual no, por lo mismo que en temperatura: decir en
  septiembre «hi solen caure 480 mm i en portem 312» sugiere un déficit de 168 que no existe,
  porque faltan octubre y noviembre, que son los que más traen. `rainProgressOf`.
- **A una suma le duelen los huecos mucho más que a una media**, y por eso la cobertura que se
  le exige es del 90 % y no del 80. Cada día que falta es agua que no se cuenta, **siempre hacia
  abajo**, así que un año con tres semanas de pluviómetro parado sale seco. Si el hueco está en
  el año en curso no se publica nada: la cifra que se enseñaría sería la corta.
- **La racha seca más larga no se puede buscar sobre la serie entera.** La mediana de días
  perdidos por año en la XEMA es **cero** —casi todos los años están completos— pero cada
  estación tiene un puñado que no: Tàrrega tiene 12 agujereados de 32. En un año al que le
  faltan 22 días repartidos, una sequía de 60 tiene dos tercios de probabilidades de toparse con
  uno y salir partida en dos de 30, y como los años agujereados son los viejos, **el récord se
  iría siempre a los recientes**. Se busca solo dentro de los años completos y se publican los
  dos números: sobre cuántos se ha buscado y cuántos tiene la serie. Y solo cuentan las rachas
  **cerradas por lluvia a los dos lados**: una que se corta porque se acaba el año medible o
  porque la serie llega hasta hoy es una cota inferior, no un récord —Fogars de la Selva
  publicaba «103 dies, del 20 de setembre al 31 de desembre», y ese 31 de diciembre no lo
  eligió el tiempo—. Comprobado después: 41 de 179 récords caen en 2026 y 34 en 2011, que son
  las dos sequías reales, y el más largo de todos es de **1998**.
- **«No consta» tapaba dos cosas distintas en el último chaparrón.** Salía tanto cuando un día
  sin dato cortaba la cuenta como cuando se había podido mirar la ventana entera sin encontrar
  un solo día de más de 5 mm. En Tàrrega, con 8,1 mm en treinta días repartidos en llovizna, la
  respuesta buena era «fa més de 45 dies», que es justo lo que quiere saber quien lo mira.
  `dryDaysChecked` dice hasta dónde se ha podido mirar hacia atrás.
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
- **Un rótulo que no cabe no se descarta a la primera.** El mapa de comarcas nombraba **26 de
  43**, y las que faltaban eran el Barcelonès, el Maresme, el Baix Llobregat y los dos Vallès: la
  parte del país donde vive más gente. La mitad no fallaban por falta de sitio sino por chocar
  con un rótulo ya puesto —el Vallès Oriental tiene 83 unidades libres—, así que se prueban ocho
  posiciones alrededor; los nombres largos se parten en dos líneas —«Conca de Barberà» mide 132
  unidades y la comarca tiene 79—; y las cinco con **cero** anchura libre llevan el rótulo fuera
  con una línea guía, que es lo que hace cualquier atlas. Con eso, 43 de 43, y medido en la
  página: cero solapamientos entre comarcas distintas.
- **La caja que el build reserva tiene que ser la que el navegador dibuja.** Para la cifra va de
  −22 a +4 respecto del punto, que es exactamente lo que ocupa un cuerpo 26 centrado en −9.
  Dibujarla en cero —quitando ese desplazamiento— la baja hasta +13 y se come su propio nombre:
  cuarenta solapamientos, y la colocación del build sin enterarse de nada, porque ella sigue
  creyendo que reservó bien.
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
- **En Open-Meteo, la lluvia de la hora `T` es la que cayó entre `T-1` y `T`.** Su tabla de
  variables lo dice de cinco de las que pedimos —`precipitation` y `snowfall` («Preceding hour
  sum»), `precipitation_probability` («probability»), `wind_gusts_10m` («max») y
  `shortwave_radiation` («mean»)— y del resto dice «Instant». O sea que **en una misma fila
  conviven dos convenios**: la lluvia de las 17 h es la de 16 a 17 y la temperatura de esa
  misma fila sí es la de las 17. El sitio los trataba a los dos como «lo que pasa a partir de
  esta hora», así que las frases decían «de les 15 a les 18 h» para una ventana que el modelo
  situaba de 14 a 17, la columna de mm y la de racha iban una hora tarde respecto de su fila,
  los marcos de futuro del radar llevaban la etiqueta de una hora más que la que pintaban, y el
  resumen diario sumaba de las 23 h del día anterior a las 23 h.
  **Arreglado el 9 de septiembre de 2026** con un solo desplazamiento en `mergeHourly`, que es
  el único sitio donde se casan `times` con los valores: las cinco variables se leen en `i + 1`
  y la última hora de la serie se cae, porque su tramo acabaría fuera. De ahí para abajo la hora
  `T` significa `T → T+1` en todo el proyecto — frases, tabla horaria, resumen diario y campo de
  lluvia del radar—, y `narrative.ts` no necesitó tocarse porque trabaja sobre la serie ya
  fusionada. El worker del campo no pasa por ahí, así que hace el mismo desplazamiento con un
  `slice(1)`.
  Dos cosas que conviene no repetir. La primera: **el total diario de Open-Meteo no sirve de
  árbitro.** Nuestra suma por día coincidía con su `precipitation_sum` al milímetro con las dos
  alineaciones, porque ellos también agrupan el día por etiqueta — o sea que su día natural
  arrastra el mismo desfase. La segunda: **lo que sí lo decide es la física.** La irradiancia es
  cero de noche, y su primera hora con valor son las 08:00 cuando el orto es a las 07:25; si la
  hora `T` cubriera `T → T+1`, las 07:00 tendrían media hora de sol dentro y no serían cero.
  Comprobado en cuatro puntos. `npm run test:hours`, y con `-- --api` se lo vuelve a preguntar
  a Open-Meteo.
- **Un historial de aciertos no se puede construir hacia atrás, y por eso el worker de
  verificación corre desde hoy aunque su resultado no sirva hasta dentro de dos meses.** La
  predicción de ayer no existe en ninguna parte: el fichero se reescribe en cada refresco. Así
  que `forecast-verify.ts` tiene dos mitades y la primera no sirve de nada sola — **captura** lo
  que cada modelo dice de un día que aún no ha pasado, y **puntúa** ese día cuando se cierra,
  contra la máxima, la mínima y la lluvia que han medido las estaciones.
  Tres decisiones que son las que hacen que el número signifique algo:
  **Se prefiere el punto de nivel A aunque no sea el más cercano.** Solo esos llevan más de un
  modelo —los demás únicamente `best_match`, que es el que Open-Meteo elige y no un modelo
  independiente—, así que emparejando por pura proximidad solo 38 de 189 estaciones podían
  comparar modelos. Con el nivel A como preferencia son **138**, y la mediana de la distancia es
  2,7 km: menos que la separación de la malla.
  **Se baja la predicción de la cota del modelo a la de la estación**, con el mismo gradiente que
  usa la página — que por eso vive ahora en `variables.ts` y no en `weather.ts`. Sin corregir, lo
  que se mediría es la diferencia de altura, y castigaría más a los modelos de malla ancha, que
  es exactamente el sesgo que esto tiene que evitar. Con más de 300 m de diferencia no se puntúa:
  ahí lo que se mide es la corrección.
  **El diario sale de `mergeHourly` y `aggregateDaily`**, no de sumar las horas a mano: el
  desplazamiento del convenio horario de Open-Meteo está ahí dentro, y una suma con otro criterio
  compararía el día del modelo con el de la estación corridos una hora.
  Se guardan `n`, la suma de errores y la de valores absolutos, no las medias: una media ya
  calculada no se puede seguir acumulando sin volver a ponderarla, y el día que alguien lo
  hiciera mal el número seguiría pareciendo una media. `/estat` enseña cuántos días lleva.
- **Un bloque de `JSON-LD` que desaparece no rompe nada.** No se ve, no da error y no hay prueba
  que lo note: el día que alguien reordene un `<article>` y el bloque se quede fuera, la página
  seguirá saliendo igual de bien y el buscador dejará de entenderla. Es la misma clase de fallo
  que las 4.293 canónicas apuntando a un dominio ajeno. Por eso hay `npm run check:jsonld`, que
  va **contra el HTML servido** y por tipo de página, no contra la función que lo construye.
  Y lo que ya estaba publicado roto: el `item` de cada miga de pan era **una ruta relativa**.
  Schema.org espera una URL; el navegador la resuelve pero ninguna herramienta la valida, así que
  el rastro de las 4.293 fichas se publicaba mal sin que nada avisara. Ahora las construye
  `breadcrumbLd()` con `absolute()`, en un solo sitio, y el marcado sale de las mismas migas que
  la página enseña — construyéndolas aparte, un día una diría tres al lector y cuatro al robot.
  **`WeatherForecast` no existe en schema.org**: quien lo usa inyecta marcado inválido. Lo que
  hay es `Place`, `BreadcrumbList`, un `WebSite` con su `SearchAction` en el esqueleto —porque un
  robot entra por cualquiera de las 4.293 páginas y puede no pasar nunca por la portada— y un
  `Dataset` en `/dades`, que es el único tipo que describe lo que este sitio tiene de propio.
- **Un worker que peta no deixava rastre enlloc, i el 13 de setembre de 2026 van arribar tres
  matins de correus de «Run failed» sense cap motiu.** `recordFreshness` escriu el perquè i el
  posa a la cua de publicació, però **la publicació només passava al camí bo**: quan el worker
  moria, el motiu es quedava al disc d'un contenidor que s'apaga, `/estat` seguia ensenyant
  l'última execució correcta envellint a poc a poc, i l'única còpia del perquè era el registre
  d'Actions —que demana un testimoni per llegir-lo i caduca—. Ara tots els workers acaben amb
  `reportFailure()`, que publica el motiu abans de sortir.
  La causa d'aquell cop: **la XVPCA va deixar de publicar**. El 10 de setembre no existeix al
  conjunt i el 9 es va quedar amb 22 hores, o sigui que a la finestra de quatre dies no hi havia
  cap dia complet i `air-stations` llançava. Que una font no publiqui **no és una avería nostra i
  no s'ha de comportar com si ho fos**: ara no publica res nou —la instantània anterior segueix
  sent bona i porta la seva data—, deixa dit per què, i surt bé. Qui avisa és el rètol
  d'endarreriment de `/estat`, que és el mecanisme que hi ha per a això. Llançar només es
  justifica quan el que es publicaria seria **fals**; aquí no es publicaria res.
  I el que ho va multiplicar: **el comentari de `diari.yml` deia que cada pas porta `if: always()`
  i dos no en portaven**. Amb `air-stations` en vermell, l'aigua de l'ACA i la verificació de
  models quedaven saltades — tres dies sense adonar-se'n. Un comentari que promet una cosa que
  el fitxer no fa és pitjor que cap comentari.
- **Una clau repetida dins d'un pas no fa fallar cap worker: fa que no se'n executi cap.**
  `diari.yml` va quedar amb `if: always()` dues vegades al darrer pas —una substitució
  automàtica damunt dels tretze workers— i GitHub va rebutjar el fitxer sencer. El correu
  no deia «tal cosa ha petat» sinó **`No jobs were run`**, i la feina d'un dia —rècords,
  aire, aigua i l'acumulació de l'encert— simplement no es va fer. YAML prohibeix la clau
  repetida però gairebé cap analitzador hi diu res: es queden l'última en silenci. `ci.yml`
  comprovava els dos projectes de TypeScript, el lint, les proves i el build — **tot menys
  els fitxers que ho llancen tot**. Ara hi ha `npm run check:workflows`, el primer pas de
  tots: claus repetides, tabuladors, `npm run` que no existeixen i workflows sense feines.

- **El camp que fa sobreviure un error a la volta bona no va funcionar mai fora d'un
  portàtil.** `recordFreshness` arrossega `lastError` llegint l'entrada anterior **del
  disc**, i el comentari deia que no passava res perquè «el pitjor que pot passar és
  perdre el rastre d'un error vell». A GitHub Actions el disc arrenca **sempre** buit:
  no era el pitjor cas, era l'únic. És la tercera vegada que la mateixa trampa surt
  —ja hi havia `pullSnapshot()` i l'empremta del camp de pluja— i aquesta va passar
  desapercebuda perquè el codi **sí que existia** i en local funcionava.
  El que es veia des de fora és exactament el que fa una font que falla una vegada de
  cada cent: arriba el correu de «Run failed», deu minuts després la volta següent va
  bé i publica una entrada neta, i a `/estat` no queda res. La pàgina ja sabia
  ensenyar-ho —«últim ensopec el...»—; el que no arribava mai era la dada.
  Ara `syncState(source)` es porta **la pròpia** entrada del magatzem abans de començar.
  Només la seva: portar el registre sencer és el que feia que dos workers simultanis
  s'esborressin l'entrada l'un a l'altre. I si un worker deixa de passar-li el seu nom,
  això torna a no fer res **sense donar cap error**.

- **Un comptador de dies que s'incrementa és un doble recompte esperant el seu torn.** El
  registre d'encert acumula sumatoris, així que un dia puntuat dues vegades —un
  `workflow_dispatch` a mà damunt de l'horari, o unes quantes proves seguides— infla `n` i fa
  que aquell dia pesi el doble dins de la mitjana. No dona cap error. Es va veure perquè el
  comptador deia **set dies cobrint-ne quatre de calendari**. Ara es desa **la llista de dates
  puntuades**: la comprovació és una pertinença i el nombre de dies és la seva mida, i no hi ha
  cap manera d'incrementar-lo sense dir quin dia és.
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
- **Un mapa de MapLibre que es dibuixa perfectament pot no estar carregat mai, i la
  pàgina no se n'assabenta.** Tot el que va costar el mapa de `/mapa/interactiu` és
  d'aquesta mateixa família: cap error, cap execució en roig, i una cosa que sembla bé.
  Quatre trampes, per ordre de descobriment:
  **El worker.** MapLibre no analitza el GeoJSON al fil principal: ho fa en un worker, i
  en compon el nom del fitxer amb una cadena en temps d'execució
  (`'maplibre-gl-worker.mjs'`) resolta contra `import.meta.url`. Qualsevol empaquetador
  hi posa l'empremta del contingut al nom —Turbopack el deixa a
  `/_next/static/media/maplibre-gl-worker.1n8lzpjb93uvs.mjs`— i llavors aquella cadena
  demana un fitxer que no existeix. **Cap dels dos s'equivoca i el resultat no funciona.**
  El 404 el contesta Next amb HTML, i a la consola surt «Failed to load module script:
  non-JavaScript MIME type text/html», que no anomena ni MapLibre ni cap mapa. El mapa es
  dibuixa igualment —les tessel·les són ràsters i no passen pel worker— però el GeoJSON no
  arriba mai; i com que `style.loaded()` demana que **totes** les fonts estiguin
  carregades, l'esdeveniment `load` no es dispara mai i la pàgina es queda ensenyant el
  missatge d'espera damunt d'un mapa ja dibuixat. Es va trobar comparant
  `isSourceLoaded('base')`, que deia sí, amb `isSourceLoaded('comarques')`, que deia no.
  `scripts/16-maplibre-worker.ts` el copia a `public/` amb un nom estable i
  `setWorkerUrl()` l'hi apunta — i el copia **amb tot el que importa**, perquè
  `maplibre-gl-worker.mjs` comença amb un `from "./maplibre-gl-shared.mjs"` i copiant-ne
  només un es torna a caure exactament pel mateix lloc, amb el mateix missatge.
  **L'espai de color.** Les escales del lloc són OKLCH; a l'analitzador de colors de
  MapLibre no hi surt la paraula `oklch` ni una vegada. No es queixa: no pinta la capa.
  Es converteix amb `oklchToHex()`, i la comprovació és contra el navegador —onze colors
  pintats per Chrome en un `canvas` d'un píxel— i no contra la fórmula: `npm run
  test:colors`.
  **`to-color`.** `['get', 'c']` torna una cadena i `fill-color` vol un color. MapLibre
  accepta la capa, l'afegeix i la dibuixa —`queryRenderedFeatures` en tornava 969— amb el
  color buit. Es va trobar posant-hi un vermell fix: si amb una constant es pinta i amb
  l'expressió no, el que falla és l'expressió.
  **Les tessel·les que no hi eren.** `14-basemap-tiles.ts` baixava el que els 683
  itineraris travessen, no el país: faltaven totes les del zoom 6, 7 i 8, 3 del 9, 35 del
  10 i 206 de l'11. En un mapa que es pot moure **una tessel·la que falta no sembla un
  error: sembla el mapa**. I el sostre de zoom cap avall també importa: amb el mínim al 7,
  un telèfon de 375 px obria ensenyant només el mig del país sense poder-se'n allunyar,
  perquè Catalunya sencera hi cau al 6,3.
- **El vent amb partícules no va costar cap unitat de quota, i la meitat de la feina va
  ser fer-lo visible.** `wind_speed` i `wind_direction` ja són a `ESSENTIAL_HOURLY` i a
  `RICH_HOURLY`: els 3.190 punts ja les porten. I a l'anell del camp de pluja se n'hi van
  poder afegir dues sense pagar res, perquè `callWeight` fa `max(1, variables/10)` i amb
  aquell terra a 1 una variable i tres valen igual — **però l'empremta del tros desat
  ha de portar la llista de variables a dins**, o el dia que se n'hi afegeix una, el
  tros vell segueix valent i el voltant es queda sense la nova fins que la predicció es
  refresqui sola.
  **La direcció no es pot interpolar, i el signe no es pot deduir.** Entre 350° i 10° la
  mitjana dona 180°: vent del sud exactament on bufa del nord. Es descompon en u i v
  abans d'interpolar. I la conversió —`u = −v·sinθ`, `v = −v·cosθ`, amb θ **d'on ve** el
  vent— es va escollir comprovant la **marinada**: a les quatre de la tarda, a Malgrat,
  Cambrils i Sant Feliu, la component cap al nord ha de sortir positiva. Amb el signe
  girat sortiria bufant mar endins una tarda de setembre i el mapa seguiria semblant un
  mapa. `npm run test:wind`.
  **El vent no es desplaça una hora i la pluja sí.** A Open-Meteo la pluja de l'hora `T`
  és la que va caure entre `T−1` i `T`, però la velocitat i la direcció són instantànies:
  `precedingHour` està posat a la pluja i a la ratxa, i no a aquestes dues. Desplaant-les
  «per coherència», el camp aniria una hora endavant de la pluja del mateix marc.
- **Una capa pròpia de MapLibre es pot dibuixar perfectament i no ensenyar res, i hi ha
  quatre maneres.** Les quatre van passar el mateix vespre, cap va donar un error, i el
  que les va separar va ser posar-hi **una creu fixa d'un cantó a l'altre del país amb
  l'alfa a 1**: si ni això surt, el que falla no és la geometria.
  **La matriu.** A la versió 6, `render(gl, options)` porta `modelViewProjectionMatrix` i
  `defaultProjectionData.mainMatrix`, i la que va amb coordenades de mercator 0–1 és **la
  segona**. Amb la primera es dibuixa fora de la pantalla, sense cap avís. (Passar-hi
  l'objecte sencer, en canvi, sí que es veu: `uniformMatrix4fv` es queixa que «no té un
  @@iterator».)
  **El VAO.** MapLibre deixa un objecte de vèrtexs seu enllaçat, així que
  `vertexAttribPointer` no configura els teus atributs: configura **els d'ell**. Cal
  crear-ne un de propi, enllaçar-lo i desenllaçar-lo.
  **El color.** Els camps de vent que tothom té al cap són blancs perquè van damunt d'un
  mapa negre. El nostre fons és la cartografia de l'ICGC, que és clara.
  **L'escala del moviment.** Avançant «tants minuts de rellotge per fotograma» —que sona
  més honest— un vent de tarda de setembre movia cada partícula un terç de píxel i el
  rastre sencer en feia dos: vint mil segments correctes i invisibles. Es compta en
  **píxels**, que a més arregla que la mateixa velocitat de terra surti disparada en
  ampliar. I el rang es comprimeix amb `velocitat^0,6`, perquè entre una calma d'1,5 m/s
  i una tramuntana de 25 no hi cap una sola constant: reescalant el vector —no girant-lo—
  les dues es veuen.

- **La geometria que va al navegador no és la mateixa que la del build.**
  `comarques.geojson` i `municipis.geojson` són graus —el que MapLibre menja— però pesen
  87 i 506 kB comprimits, i `comarques-map.json` ja està aprimat però està **projectat**,
  o sigui camins d'SVG en unitats d'un `viewBox`. `scripts/15-web-geometry.ts` fa l'únic
  pas que faltava: simplificar **en graus**, a 0,002° (uns 200 m), que al zoom 11 amb
  tessel·les de 512 píxels són set píxels de costa. Queden 34 i 144 kB. Els municipis van
  a part i només els baixa qui encén la capa de temperatura: una pàgina baixa el que
  ensenya.

- **Una variable CSS que no existeix no dona cap error: dona una declaració que el navegador
  s'empassa.** `var(--bg)` no estava definida enlloc i es feia servir en sis llocs. El que es
  veia al mapa interactiu és que el botó de la capa triada tenia **el text i el fons exactament
  del mateix color** —mesurat amb `getComputedStyle`: `lab(11.8 -1.7 -7.0)` als dos— o sigui una
  píndola negra amb la paraula «Pluja» a dins, invisible. A l'inspector no hi ha res a veure: la
  propietat, senzillament, no hi és. La bona és `--paper`. Ara `npm run test:colors` compara
  totes les `var(--…)` de `src/` amb les definides a `globals.css` i amb les que els components
  posen en línia —`--rcycle` és una d'aquestes—, i no compta les que surten dins d'un comentari,
  perquè mig projecte explica per què MapLibre no entén `var(--cap-orange)`.

- **Quatre avisos alhora al mateix poble és el cas normal, no l'excepció.** El 8 de setembre de
  2026, **3.548 de 4.048** ubicacions amb avís en tenien més d'un, i totes les targetes tenien el
  mateix pes: calia llegir-les per saber quina manava. Ara mana la de nivell més alt i la resta
  van a una línia desplegable.
  **El que no es fa és ensenyar només el més alt**, i això es va mesurar abans de decidir-ho: cap
  dels 34 avisos d'aquell dia en tapava cap altre. El nivell no és una escala d'importància
  general sinó la probabilitat i el llindar **d'aquell fenomen**, i a Barcelona el taronja eren
  40 mm en una hora i el groc 60 mm en dotze — dues coses que passen diferent i es preparen
  diferent. Se'n descarta un només quan no diu res de nou: mateix fenomen, **mateixa magnitud**,
  nivell més baix i hores completament dins de les de l'altre. Les quatre condicions hi han de
  ser, i la de la magnitud és la que ho salva tot. `npm run test:warnings`.
  Dos defectes que això va destapar i que es veien a la pàgina: **el llindar no deia en quant de
  temps s'acumula** —«Pluja 100 mm» i «Pluja 20 mm» semblaven el mateix avís repetit quan són 100
  mm en 12 h i 20 mm en 1 h— i **un llindar sense cap xifra és l'etiqueta repetida en castellà**,
  que feia que la targeta en català digués «Tempesta Tormentas» (i el feed, també).
  A `/avisos` no s'apila: allà els avisos són de llocs diferents i jerarquitzar-los seria dir una
  cosa que no és.

- **Els polígons de les zones d'avís hi eren i es llençaven.** El worker els feia servir per
  saber quins pobles toca cada avís i després es quedava només amb els noms de zona, així que el
  mapa que es pot moure no podia dibuixar-los. Són **21 zones i 912 punts en total** —contorns
  deliberadament bastos, que és el que ha de ser: la zona *és* la unitat de l'avís— i no canvien
  mai entre fitxers, comprovat. Van a `warnings-zones.json` i **no** dins de `warnings.json`,
  que és el que llegeixen les 4.293 fitxes de poble sense dibuixar-ne cap: la mateixa regla que
  parteix la predicció en 43 trossos. La clau és el **codi** (`692502`), no l'`areaDesc`: el nom
  és prosa en castellà i el dia que li canviïn un guionet, emparellar per nom deixaria la zona
  sense contorn sense donar cap error — el mapa sortiria sencer amb un tros menys pintat. El
  codi acabat en `C` és la franja costanera i **se solapa** amb la de terra a posta.

- **El cel del titular es calcula, i tota la feina és que digui el temps sense tapar el
  text.** El fons d'una fitxa surt de la nuvolositat, del codi de temps, dels mil·límetres de
  l'hora, de l'altura del sol en aquell punt i d'aquell dia, i de la fase de la lluna. És CSS i
  tres textures: **zero JavaScript**, que és la regla de les fitxes de lloc i aquí no hi ha
  excepció. El càlcul viu a `src/lib/sky.ts` i el dibuix a `LocationHero.tsx`.
  **El nom del temps no surt d'allà**: surt de `weather-codes.ts`, que és qui ja el diu a la
  taula i al resum del dia. El disseny original en portava una funció pròpia amb els seus
  llindars, i això hauria estat una segona descripció del mateix temps — el dia que algú en
  toqués un, el titular i la taula de sota haurien dit coses diferents de la mateixa hora.
  Quatre coses que van costar una volta cada una:
  **Una capa de núvol que no es veu s'ha de no existir, i amagar-la no n'hi ha prou.** Amb
  `opacity: 0` el navegador demana la imatge, això ja se sabia; el que no: amb `display: none`
  **al pare**, Chrome també la demana. Mesurat amb el registre de xarxa damunt d'un cel serè,
  les tres textures baixades i cap dibuixada — **149 kB** el dia que fa sol, que són la majoria.
  Ara la capa no es renderitza.
  **El contrast s'ha de mesurar on hi ha el text, i emparellat per alçada.** La primera versió
  de `test:sky` agafava la parada més clara del degradat i la posava sota la franja més
  transparent del vel: deia 1,83:1 per a una combinació que no existeix enlloc, perquè el cel
  s'aclareix cap avall i el vel s'enfosqueix cap avall justament per compensar-se. I la segona
  donava per fet que no hi havia text fins al 22 % de l'alçada, quan la ruta de navegació —dotze
  píxels, o sigui **text petit**— cau al 6 %. Ara es mesura des del 5 % i contra el pitjor núvol
  possible, que es pot saber: les tres textures arriben a **blanc pur amb alfa sencera**.
  **Apujar el vel sencer arregla el contrast i es carrega el cel.** Amb el vel pla a 0,54, els
  dotze estats posats de costat es veien igual de foscos: un migdia de juliol i un vespre de
  novembre plovent, iguals. Un fons que no distingeix el temps no serveix de res. El reforç va
  en un segon vel **en píxels i només a dalt**, perquè el text de dalt sempre és als mateixos
  píxels de dalt; en tant per cent, un titular més alt el faria caure en una franja més fluixa.
  `npm run cels` és el que ho va ensenyar, i per això existeix.
  I **tampoc pot ser una constant**: posat fix a 0,30, un migdia serè de 33 °C a Montblanc
  sortia dibuixat com un capvespre. El que amenaça el text de dalt no és el cel —el cel sol dona
  8:1— sinó les **textures de núvol**, que són clares i van justament per la part alta. Així que
  `scrimTop` es calcula amb la cobertura i el brillo d'aquell moment: un dia serè en porta
  **zero** i el cel es veu tal com es calcula. Es calibra a l'alçada del **text més amunt de
  tots**, que des que la barra del web va dins del titular són els seus enllaços i no la ruta de
  navegació — calibrat a la ruta, els enllaços queien a 3,84:1.

- **La màxima del dia no pot sortir només de la predicció.** Montblanc ensenyava «33,7°» amb
  «màx. 32°» just a sota: el model deia 32 i el termòmetre ja n'havia fet 33,7. Les dues xifres
  eren correctes i juntes es contradeien, que és el pitjor cas perquè no hi ha res per arreglar
  a cap de les dues. La màxima d'avui és, com a mínim, la que **ja s'ha fet**: es combina amb
  `current.todayMax`, que és l'agregat de l'estació des de mitjanit. Igual la mínima, cap avall.

- **Un límit de mesura dins d'una columna molt més ampla es llegeix com un error d'alineació.**
  Els paràgrafs porten un topall de 64 caràcters —a 18 px, **552 px**— i les targetes no en
  porten cap: dins dels 984 px de `main`, el text s'acabava a mig camí amb 432 px de blanc a la
  dreta al costat de blocs que arribaven fins al final. Cada bloc per separat estava bé i junts
  semblaven mal posats. La fitxa va ara en **una sola columna de 38 rem**, que és on la mesura
  del text hi cap sencera; els onze blocs que necessiten més amplada ja porten `scroll-x` i es
  desplacen, com ja feien al telèfon.

- **La barra del web va dins del titular, i qui ho decideix és CSS i no un estat compartit.**
  A les fitxes de lloc la capçalera se superposa al cel; ho connecta `body:has([data-hero])` a
  `globals.css`, perquè la capçalera viu al `layout` i la pàgina no li pot passar res. Es fa
  així per el que passa el dia que un navegador no entengui `:has()`: **no passa res** —la barra
  es queda blanca i a sobre, i la pàgina segueix sencera—. Amb un estat compartit, el mateix
  error deixaria la barra blanca amb el text blanc a sobre.
  L'espai que la barra deixa de ocupar el reserva el titular **amb un estil en línia i no amb
  una classe**: el valor és l'alçada d'una altra peça —92 px quan el cercador passa a la segona
  línia, en un telèfon de 375— i escrit com `pt-[92px]` sembla una tria d'espaiat que ningú no
  relacionarà amb la barra el dia que creixi.
  **El degradat porta `color-mix()` i per tant necessita un color pla a sota.** Si un navegador
  no l'entén, la declaració sencera queda invàlida, el fons desapareix i queda **text blanc
  damunt de blanc**. Amb un sòlid a sota, el pitjor cas és un cel d'un sol to.

- **El radi de les targetes es canvia al tema, no als cinquanta llocs que el fan servir.**
  El sistema del redisseny demana 14–16 px i Tailwind en porta 8 a `rounded-lg`. Es toca a
  `@theme inline` de `globals.css` —`--radius-md`, `--radius-lg`, `--radius-xl`— i amb això
  canvien totes alhora. Anant bloc per bloc n'hi hauria quatre que es quedarien enrere i ningú
  no ho veuria fins mesos després. El mateix amb la targeta: `.card` i `.card-title` i `.source`
  a `globals.css`, i `.card-block` quan a més li cal el marge de separació —**`.card` no en
  porta** perquè n'hi ha que viuen dins d'una graella, on un marge superior desquadra les files.

- **Una conversió d'unitats feta dues vegades dona un número que es pot llegir.** La portada
  nova ensenyava «Ratxa més forta · **180 km/h** · Monestir de Montserrat» una tarda de 37 °C.
  `rankings()` ja desa la ratxa en km/h —`describe(s, Math.round(msToKmh(v)))`— i la portada hi
  tornava a aplicar `msToKmh`: 50 × 3,6. Ni un error, ni una prova en roig, i un valor que
  existeix de veritat en un temporal. Si un valor ve d'una funció que ja el prepara per
  ensenyar-lo, **no se li torna a tocar la unitat**.

- **La portada d'un web del temps ha de dir quin temps fa.** Era un índex de seccions amb quatre
  comptadors de quantes pàgines hi ha: certs, i no el que ve a buscar ningú. Ara obre amb els
  extrems d'ara mateix —el més càlid, el més fred, la ratxa— cadascun **amb el seu lloc i
  enllaçat**, perquè la pregunta següent de qui llegeix «37,4 °C» és «on». Tot surt de
  `rankings()`, que ja s'havia baixat l'observació sencera per a `/ranquings`: ni una lectura
  nova ni una unitat de quota. I el `revalidate` baixa de 3.600 a 600, perquè ara la pàgina porta
  dades que envelleixen.

- **Al mòbil la barra són tres peces: el nom, el cercador i el menú.** Amb «El temps» i quatre
  enllaços i el cercador no cabien en una línia de 375 px: la fila passava a dues i el cercador
  quedava sol a la segona. Els enllaços viuen ara dins d'un desplegable que és un **`<details>`**
  i per tant l'obre el navegador — un desplegable amb estat de React hauria estat el segon
  component de client del projecte per a una llista de quatre enllaços que ja són al peu.

- **Vint-i-dues pàgines escrivien la mateixa capçalera a mà, i per tant amb números
  diferents.** El títol sortia en **quatre mides** —24, 30, 36 i 48 px segons la pàgina—, la
  mesura del text en **set** —de 60 a 70 caràcters— i la ruta de navegació estava copiada
  vint-i-una vegades. Cada pàgina per separat estava bé; el que es veia mirant-ne dues seguides
  és que el lloc estava fet a trossos.
  Ara hi ha tres classes a `globals.css` —`.crumbs`, `.page-title`, `.page-head`— més `.measure`
  per a qualsevol bloc de prosa, i `.card-title` per als **51 encapçalaments de secció** que
  anaven amb vuit combinacions diferents. El títol creix amb `clamp()` en comptes de saltar en un
  punt de ruptura.
  L'escombrada es va fer amb un script que **només toca les línies amb `<h2>`, `<h3>` o `<h4>`**:
  la mateixa classe en un `<p>` vol dir una altra cosa, i canviar-la seria canviar el que
  significa. I es va haver de repetir sencera perquè la primera passada va petar a mig camí —el
  servidor de desenvolupament tenia un fitxer bloquejat— i va deixar la meitat dels fitxers
  fets: un script d'escombrada ha de dir quants n'ha tocat, o no hi ha manera de saber si ha
  acabat.

- **L'amplada la posa `main` i les excepcions es marquen, no al revés.** Una sola columna de
  38 rem per a tot el web, i les poques pàgines que de veritat necessiten amplada —un mapa del
  país, una llista de dotze columnes— porten `data-wide` i recuperen els 64 rem. Ho connecta
  `body:has([data-wide]) > main`, per no haver de passar res del `layout` a cada pàgina. Si un
  navegador no entén `:has()`, el web sencer es queda a la columna estreta: estret però correcte
  i igual a tot arreu.

- **El camp de meduses porta diverses espècies separades per `;`.** Cada una és
  `espècie,abundància,talla`. Llegint només fins a la primera coma, a Castell-Platja d'Aro
  —que en reporta tres— sortia la inofensiva i **quedava amagada la que pica**. `parseJellyfish()`
  retorna la llista sencera, i una espècie que no consti a la taula es tracta com si piqués.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
