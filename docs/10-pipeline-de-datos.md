# 10 — Pipeline de datos (fase 0)

Cómo se construye el territorio, cómo reejecutarlo y qué decisiones lleva dentro.

```bash
npm run data:all
```

Tarda unos 25 minutos en frío, casi todo en la geocodificación. Es idempotente: las descargas
se cachean en `data/raw/` y reejecutarlo no vuelve a pedir lo que ya tiene.

---

## Los siete pasos

| # | Script | Qué hace | Fuente | Duración |
|---|---|---|---|---|
| 1 | `01-fetch-nomenclator.ts` | 11.019 filas de la jerarquía poblacional | Socrata `tssr-jqsj` | ~5 s |
| 2 | `02-fetch-geo.ts` | Coordenadas de los 947 municipios y las 43 comarcas | Socrata `wpyq-we8x` | ~3 s |
| 3 | `03-geocode-entitats.ts` | Punto de cada entidad y núcleo | Geocodificador ICGC | ~22 min |
| 4 | `04-fetch-stations.ts` | 245 estaciones XEMA y 68 variables | Socrata `yqwd-vj5e`, `4fb2-n3yi` | ~4 s |
| 5 | `05-fetch-elevation.ts` | Altitud real de cada punto | Open-Meteo Elevation | ~2 min |
| 6 | `06-build-territory.ts` | Une todo, resuelve rutas y decide qué publica | local | ~3 s |
| 7 | `07-validate.ts` | Criterios de aceptación de la fase 0 | local | ~1 s |

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
├── comarques.json   43 comarcas con centroide, población y altitudes extremas
├── locations.json   el árbol completo, publicado y no publicado
├── paths.json       índice ruta → id, para resolver URLs en un solo lookup
├── stations.json    245 estaciones con su ubicación poblada más cercana
└── summary.json     estadísticas de la construcción
```

La aplicación no los lee directamente: pasa por `src/lib/territory.ts`, que es la frontera.
Cuando en la fase 1 exista PostgreSQL, ese módulo cambia por dentro y las páginas no se enteran.

---

## Lo que falta y por qué no bloquea

- **Polígonos de comarca y municipio.** El ICGC los publica en GML INSPIRE, que es pesado de
  parsear. Hacen falta para el mapa y para calcular colindancia real con `ST_Touches`; de
  momento la vecindad se calcula por distancia y se etiqueta como tal, sin fingir que es
  colindancia.
- **Orientación y pendiente** de cada núcleo (solana/obaga, fondo de valle). Requiere el
  modelo de elevación en malla, no puntos sueltos. Es lo que alimenta el texto único de cada
  página, así que entra en la fase 2.
- **PostgreSQL.** La migración está escrita en `db/migrations/001_territory.sql` y se aplica en
  cuanto haya un `DATABASE_URL`. Hasta entonces los JSON bastan: el territorio es estático.
