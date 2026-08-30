# 10 — Pipeline de datos (fase 0)

Cómo se construye el territorio, cómo reejecutarlo y qué decisiones lleva dentro.

```bash
npm run data:all
```

Tarda unos 35 minutos en frío: 22 min de geocodificación, 9 de altitudes (Open-Meteo limita por ubicaciones, no por peticiones) y 2 de polígonos. Es idempotente: las descargas
se cachean en `data/raw/` y reejecutarlo no vuelve a pedir lo que ya tiene.

---

## Los ocho pasos

| # | Script | Qué hace | Fuente | Duración |
|---|---|---|---|---|
| 1 | `01-fetch-nomenclator.ts` | 11.019 filas de la jerarquía poblacional | Socrata `tssr-jqsj` | ~5 s |
| 2 | `02-fetch-geo.ts` | Coordenadas de los 947 municipios y las 43 comarcas | Socrata `wpyq-we8x` | ~3 s |
| 3 | `03-geocode-entitats.ts` | Punto de cada entidad y núcleo | Geocodificador ICGC | ~22 min |
| 4 | `04-fetch-stations.ts` | 245 estaciones XEMA y 68 variables | Socrata `yqwd-vj5e`, `4fb2-n3yi` | ~4 s |
| 5 | `05-fetch-elevation.ts` | Altitud real de cada punto | Open-Meteo Elevation | ~9 min |
| 6 | `06-fetch-polygons.ts` | Polígonos, superficie y colindancia real | GML INSPIRE del ICGC | ~2 min |
| 7 | `07-build-territory.ts` | Une todo, resuelve rutas y decide qué publica | local | ~5 s |
| 8 | `08-validate.ts` | Criterios de aceptación de la fase 0 | local | ~2 s |
| — | `09-import-db.ts` | Carga en PostgreSQL. Opcional, requiere `DATABASE_URL` | local | — |

`data/raw/` está en `.gitignore` — se regenera. `data/build/` **sí se versiona**: es el
artefacto del que vive la aplicación.

---

## Decisiones que lleva dentro

### La comarca la manda el dataset de caps de municipi, no el Nomenclàtor

El Nomenclàtor publicado es la edición de 2021 y dice 42 comarcas. **Hoy son 43**: el Lluçanès
se constituyó en 2023 con 8 municipios segregados de Osona, el Berguedà y el Bages. El dataset
`wpyq-we8x` sí está al día, así que la adscripción comarcal sale de ahí y la jerarquía
poblacional del Nomenclàtor.

Mezclarlos al revés habría dado un sitio con una comarca inexistente y ocho municipios mal
colocados.

### Dos filas del dataset de centroides no son municipios

`9aju-tpwc` trae 949 filas: las 947 reales más `999998 No consta` y `999999 Altres/Diversos`.
Si se usan tal cual salen 949 municipios y tres comarcas fantasma. Se filtran por prefijo.

### Sin coordenada fiable no hay página

Cada entidad se geocodifica contra el geocodificador oficial del ICGC, que devuelve el código
de municipio junto al punto. Eso permite descartar homónimos con seguridad: un topónimo idéntico
en otro municipio es otro lugar, no una coincidencia aprovechable.

La puntuación:

| Confianza | Situación |
|---|---|
| 100 | Tipo habitado, nombre y municipio exactos |
| 90 | Tipo habitado, municipio exacto, nombre con variante de grafía |
| 85 | Tipo habitado, municipio exacto, nombre por prefijo |
| 75–65 | Tipo secundario (barrio, diseminado, edificación) con el nombre correcto |
| 60 | Tipo no habitado con nombre exacto: sitúa el paraje |
| < 60 | **Descartada.** La entidad existe en la base pero no publica página |

### Tres problemas de emparejamiento que hubo que resolver

1. **Ela geminada con dos grafías.** El Nomenclàtor escribe `Vil.les` con punto normal y el
   ICGC `Vil·les` con punt volat. Sin unificarlas no casan nunca.
2. **Nombres compuestos con «i».** El Nomenclàtor agrupa lugares: `Porquerisses i Albarells`,
   `Can Valls i Torre del Negrell`. El geocodificador solo conoce cada parte por separado, así
   que se prueban una a una.
3. **Variantes de grafía.** `el Cònsul` frente a `el Cònsol`. Se resuelve con distancia de
   edición acotada, con tolerancia proporcional a la longitud para que en nombres cortos siga
   siendo estricta.

### Unidades estadísticas: no son un fallo de geocodificación

El Nomenclàtor incluye divisiones estadísticas que no existen sobre el terreno: `Entitat Est
d'Abrera` (2.653 hab), `Entitat Oest d'Abrera` (9.967 hab), `Barri Nord`, `Sector 3`. Ningún
geocodificador las conoce porque no son topónimos, y **no deben publicar página**: quien busca
eso busca en realidad el municipio.

Se detectan por patrón y se marcan como tales, en vez de contarlas como fallos y ensuciar la
métrica de cobertura.

### Qué publica página y qué no

| Caso | ¿Publica? | Canonical |
|---|---|---|
| Comarca, municipio | Sí | — |
| Entidad singular con coordenada fiable | Sí | — |
| Núcleo con topónimo distinto al de su entidad | Sí | — |
| Núcleo cabecera con el nombre del municipio | No | al municipio |
| Núcleo con el mismo nombre que su entidad singular | No | a la entidad |
| Diseminado | No | a la entidad padre |
| Sin coordenada fiable o unidad estadística | No | al municipio |

Esto es lo que evita el *index bloat*: unas 4.000 páginas con contenido real en vez de 11.000
con la misma información repetida cuatro veces.

### La altitud sale del mismo modelo digital que usa la predicción

Se resuelve con el endpoint de elevación de Open-Meteo, no con la cota oficial del ICGC. Puede
parecer un paso atrás en precisión, pero es lo correcto: esa es la orografía que **asumen sus
modelos**, y lo que queremos es corregir respecto a ella. Una cota oficial más exacta pero
ajena al modelo introduciría un sesgo en vez de quitarlo.

### La estación de referencia pondera desnivel, no solo distancia

50 m de desnivel penalizan como 1 km horizontal. No es arbitrario: con un gradiente de
~0,65 °C/100 m, 300 m de altura cambian más la temperatura que 10 km de separación en llano.
Una estación cercana pero a otra cota es peor referencia que una algo más lejana a la misma
altura.

---

## Artefactos que produce

```
data/build/
├── comarques.json   43 comarcas con centroide y superficie reales, densidad
├── locations.json   el árbol completo, publicado y no publicado
├── paths.json       índice ruta → id, para resolver URLs en un solo lookup
├── stations.json    245 estaciones con su ubicación poblada más cercana
├── neighbours.json  24.484 relaciones: colindancia, hermanos y proximidad
├── summary.json     estadísticas de la construcción
└── geo/
    ├── municipis.geojson   947 polígonos simplificados · 1,63 MB
    └── comarques.geojson    43 polígonos simplificados · 0,28 MB
```

La aplicación no los lee directamente: pasa por `src/lib/territory.ts`, que es la frontera.
Cuando en la fase 1 exista PostgreSQL, ese módulo cambia por dentro y las páginas no se enteran.

---

## Polígonos: colindancia sin PostGIS

El GML INSPIRE del ICGC pesa 88 MB entre los dos ficheros, pero trae un regalo que no esperaba:
cada unidad **declara sus líneas de frontera** (`au:boundary`). Dos municipios que comparten
una línea se tocan, y eso es exactamente lo que responde `ST_Touches` — pero leído de la
topología oficial, sin tolerancias geométricas ni falsos positivos por vértices sueltos.

Resultado: **5.424 relaciones de colindancia**, simétricas, con una media de 5,7 vecinos por
municipio. Un solo municipio se queda sin ninguna: **Llívia**, que es un enclave español rodeado
por Francia. Que precisamente ese sea el único caso es la mejor prueba de que el cálculo está
bien.

Donde no hay colindancia se completa con proximidad, **etiquetada como `nearest`**. La
distinción no es cosmética: acaba en el texto de la página, y llamar "limítrofe" a un municipio
que solo está cerca es afirmar algo falso.

Los polígonos aportan además superficie y centroide reales. El total sale **32.068 km²** frente
a los 32.108 oficiales — un 0,1 % de desviación, atribuible a la aproximación esférica y a la
generalización de la costa. Que municipios y comarcas den la misma cifra por separado es otra
comprobación cruzada que sale gratis.

Para el mapa se simplifican con Douglas–Peucker: los municipios pierden el 95 % de los vértices
(1.577.193 → 79.120) y quedan en 1,63 MB; las comarcas, el 97,9 % y 0,28 MB. A escala de mapa
web la diferencia no se ve.

---

## Lo que falta y por qué no bloquea

- **Orientación y pendiente** de cada núcleo (solana/obaga, fondo de valle propenso a inversión
  térmica). Requiere el modelo de elevación en malla, no puntos sueltos. Es lo que alimenta el
  texto único de cada página, así que entra en la fase 2.
- **PostgreSQL.** La migración está escrita en `db/migrations/001_territory.sql` y se aplica en
  cuanto haya un `DATABASE_URL`. Hasta entonces los JSON bastan: el territorio es estático.
