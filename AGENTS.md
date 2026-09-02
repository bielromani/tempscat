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
| `src/app/` | Rutas Next.js |
| `data/build/` | Territorio construido. **Se versiona** |
| `data/build/geo/comarques-map.json` | El mapa, ya proyectado y simplificado en el build. Ver `scripts/10-map-geometry.ts` |
| `src/lib/cache-store.ts` | **La frontera de lectura.** Disco en local, almacén de objetos en producción |
| `data/cache/forecast/` | La predicción, un fichero por comarca. Nunca un monolito: ver `shards.ts` |
| `data/cache/history/`, `data/cache/air/` | Lo mismo, por estación y por celda. Una ficha no se baja el país |
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

Hay ocho ficheros que importan los dos lados: los scripts los cargan con extensión `.ts` y la
aplicación con el alias `@/`. Siete **no importan nada**, y la condición para añadir uno es esa.

El octavo, `forecast-merge.ts`, sí importa —y es la excepción que ya describe la sección de
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
```

Pruebas:

```bash
npm run test              # topónimos, astronomía, hora cero de la predicción y frases
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

La parte que se cumple está medida: **no hay un solo `'use client'` en el proyecto**, así que la
regla se sostiene al pie de la letra. Lo que hay que dejar de decir es la cifra que la acompañaba.
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
- **El camp de meduses porta diverses espècies separades per `;`.** Cada una és
  `espècie,abundància,talla`. Llegint només fins a la primera coma, a Castell-Platja d'Aro
  —que en reporta tres— sortia la inofensiva i **quedava amagada la que pica**. `parseJellyfish()`
  retorna la llista sencera, i una espècie que no consti a la taula es tracta com si piqués.

