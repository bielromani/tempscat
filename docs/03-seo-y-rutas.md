# 03 — SEO y árbol de rutas

Este es el documento central del proyecto. El SEO aquí no es una capa que se añade al final:
es la razón por la que la arquitectura de datos tiene la forma que tiene.

---

## La apuesta estratégica

Competir por *"el tiempo en Barcelona"* es imposible: eltiempo.es y Meteored llevan veinte
años y miles de backlinks en esa consulta.

Competir por *"el temps a Lilla"*, *"quina temperatura fa a Prenafeta"* o *"previsió Guàrdia
dels Prats"* es **trivial**, porque literalmente no existe ninguna página dedicada a ello.

Cada consulta individual vale poco. Multiplicadas por ~3.900 entidades de población, por 3
idiomas y por ~6 intenciones temporales, suman más tráfico que la cabecera — y son
defendibles, porque replicarlas exige modelar el territorio, no llamar a una API.

**La long tail no es un complemento de la estrategia. Es la estrategia.**

---

## Árbol de rutas

### Núcleo territorial

```
/                                                    portada
/[comarca]                                           43
/[comarca]/[municipi]                                947
/[comarca]/[municipi]/[entitat]                      ~3.900
```

Ejemplos reales:

```
/conca-de-barbera
/conca-de-barbera/montblanc
/conca-de-barbera/montblanc/lilla
/conca-de-barbera/montblanc/la-guardia-dels-prats
/conca-de-barbera/montblanc/el-pinetell
/conca-de-barbera/montblanc/prenafeta
```

**Decisión: sin prefijo del tipo `/el-temps/`.** La brevedad de URL y la proximidad de la
palabra clave al dominio pesan más que la pulcritud del namespace. El coste es tener que
proteger las rutas de primer nivel de colisiones — se resuelve con una lista de palabras
reservadas validada en el build (`mapa`, `neu`, `platges`, `api`, `es`, `en`, `models`,
`estacions`, `embassaments`, `bolets`, `sobre`, `avisos`). En Next.js las rutas estáticas
ganan a las dinámicas, así que la colisión es de nomenclatura, no técnica.

### Modificadores temporales — el multiplicador de la long tail

```
/[comarca]/[municipi]/dema                  "el temps demà a Montblanc"
/[comarca]/[municipi]/cap-de-setmana        "temps cap de setmana Montblanc"
/[comarca]/[municipi]/per-hores             "temps hora a hora Montblanc"
/[comarca]/[municipi]/15-dies               "predicció 15 dies Montblanc"
/[comarca]/[municipi]/historic/[any]        "temps a Montblanc el 2024"
/[comarca]/[municipi]/clima                 "clima de Montblanc"
```

Estas páginas **solo se crean a nivel de municipio**, no de entidad. Aplicarlas a las 3.900
entidades daría ~28.000 páginas casi vacías y sería exactamente la receta del *index bloat*.

### Verticales territoriales

```
/neu                       · /neu/[estacio-esqui]     · /neu/cotes
/platges                   · /platges/[municipi]
/embassaments              · /embassaments/[embassament]
/bolets                    · /bolets/[comarca]
/allaus                    · /allaus/[zona]
/muntanya                  · /muntanya/[cim]
/avisos                    · /avisos/[comarca]
/estacions                 · /estacions/[codi]
/models                    verificación pública de modelos
/mapa                      mapa interactivo de capas
/rànquings                 el pueblo más frío/cálido/lluvioso de hoy
```

`/rànquings` merece atención especial: *"quin és el poble més fred de Catalunya avui"* es una
consulta con volumen real, se responde con datos que ya tenemos, se actualiza sola cada día y
es **altamente compartible en redes** — el tipo de página que genera backlinks orgánicos.

### Recuento

| Tipo | Páginas | ×3 idiomas |
|---|---|---|
| Portada + institucionales | 12 | 36 |
| Comarcas | 43 | 129 |
| Municipios | 947 | 2.841 |
| Entidades singulares | ~3.900 | ~11.700 |
| Modificadores temporales (municipios × 6) | 5.682 | 17.046 |
| Estaciones XEMA | 245 | 735 |
| Verticales | ~200 | 600 |
| **Total** | **~11.000** | **~33.000** |

Con los modificadores temporales activados solo en municipios de más de 500 habitantes, la
cifra realista de lanzamiento es **~15.000 URLs indexables**.

---

## Niveles de indexación — la protección contra el index bloat

Publicar 33.000 páginas de golpe es la forma más rápida de que Google decida que el sitio es
contenido generado de baja calidad. La defensa es escalonar.

| Nivel | Qué incluye | Sitemap | `robots` | Cuándo se abre |
|---|---|---|---|---|
| **A** | Comarcas, municipios > 2.000 hab, verticales, estaciones | Sí, prioridad alta | `index,follow` | Lanzamiento |
| **B** | Municipios restantes, entidades > 50 hab | Sí, prioridad media | `index,follow` | Semana 2, en tandas de ~500 |
| **C** | Entidades < 50 hab, modificadores temporales | Sí, prioridad baja | `index,follow` | Cuando la indexación de A y B sea > 80 % |
| **D** | Diseminados, entidades sin coordenada verificada | No | `noindex,follow` | Nunca; existen para el usuario, no para el índice |

El nivel se guarda como columna en la base de datos y se promociona con un job que mira Search
Console. **Nunca se abre un nivel si el anterior no está bien indexado.**

---

## Contenido único por página — la parte difícil

Google penaliza plantillas rellenadas con números distintos. Cada página necesita sustancia
que solo pueda tener ella. Lo que hace única a una página de núcleo:

1. **Altitud real y su consecuencia.** "Lilla està a 715 m, 365 m per sobre del nucli de
   Montblanc: a l'hivern hi sol fer entre 2 i 3 °C menys."
2. **Estación XEMA de referencia, con distancia y desnivel explícitos.** "L'estació més propera
   és Vimbodí (12,4 km, −180 m de desnivell)." Esto es honestidad radical sobre la
   procedencia del dato y **ningún competidor lo hace**.
3. **Posición relativa dentro de la comarca.** "És el tercer nucli més fred de la Conca de
   Barberà aquest mes."
4. **Récords propios** extraídos de la serie histórica de su estación de referencia.
5. **Orientación y exposición** derivadas del MDE: solana o obaga, fondo de valle propenso a
   inversión térmica, cresta expuesta al viento. Explica por qué el tiempo allí es distinto.
6. **Contexto climatológico** de ERA5: cómo se compara el mes actual con la media 1991–2020.
7. **Verticales relevantes según el lugar**: si está a >1.000 m, bloque de nieve; si es
   costero, bloque de mar; si está en zona forestal, índice de bolets.

Los textos se generan con plantillas condicionales sobre datos reales, **no con un LLM en
tiempo de ejecución**. Determinista, auditable, sin coste por página y sin riesgo de inventar.

### Enlazado interno

- Cada núcleo enlaza a sus hermanos del mismo municipio.
- Cada municipio enlaza a los 6 municipios limítrofes (calculados con PostGIS sobre los
  polígonos reales, no por cercanía de centroides).
- Cada comarca enlaza a las comarcas vecinas.
- Bloques dinámicos: "els 5 nuclis més freds d'aquesta comarca ara mateix" — enlaces que
  cambian a diario y mantienen el rastreo vivo.

Regla dura: **ninguna página a más de 3 clics de la portada**, y ningún enlace huérfano.

---

## Datos estructurados (JSON-LD)

Rigor aquí, porque hay mucha desinformación circulando:

- **No existe `schema.org/WeatherForecast`.** Quien lo use está inyectando marcado inválido.
- Lo correcto por página territorial:

```jsonc
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Place",
      "name": "Lilla",
      "containedInPlace": { "@type": "AdministrativeArea", "name": "Montblanc" },
      "geo": { "@type": "GeoCoordinates", "latitude": 41.34, "longitude": 1.20,
               "elevation": 715 } },
    { "@type": "BreadcrumbList", "itemListElement": [ /* Catalunya → Conca → Montblanc → Lilla */ ] },
    { "@type": "Dataset",
      "name": "Observacions i predicció per a Lilla",
      "license": "https://creativecommons.org/licenses/by/4.0/",
      "creator": [ /* Meteocat, Open-Meteo, AEMET */ ],
      "temporalCoverage": "2026-08-30/2026-09-13" }
  ]
}
```

- **`FAQPage`** en las páginas con preguntas reales ("Plourà demà a Montblanc?"). Ojo: Google
  redujo mucho la exhibición de rich results de FAQ, así que aporta claridad semántica, no
  necesariamente estrellas en la SERP.
- **`SpecialAnnouncement`** para los avisos meteorológicos oficiales — es el tipo correcto para
  alertas de emergencia y sí se muestra.
- **`WebSite` + `SearchAction`** en la portada, para el buscador de sitio.

---

## Sitemaps

Un índice y sitemaps segmentados por tipo y comarca, muy por debajo del límite de 50.000 URLs:

```
/sitemap.xml                       índice
/sitemaps/core.xml                 portada, comarcas, institucionales
/sitemaps/municipis-[1..3].xml     947 municipios en tandas
/sitemaps/entitats-[comarca].xml   una por comarca
/sitemaps/temporals-[1..n].xml     modificadores temporales
/sitemaps/verticals.xml
/sitemaps/estacions.xml
```

**`lastmod` tiene que ser verdad.** Poner la fecha de hoy en todas las URLs porque el dato
cambió es la forma más rápida de que Google deje de fiarse de tu sitemap entero. `lastmod`
refleja el cambio de *contenido sustancial* (texto, estructura, récords), no el refresco del
número de temperatura.

---

## Rendimiento como factor de posicionamiento

Los objetivos del doc 02 son requisitos SEO, no lujos. En concreto:

- Meteograma principal como **SVG en el HTML del servidor** → el crawler ve el contenido del
  gráfico, no un `<canvas>` vacío.
- **Nada de mapa autocargado** en páginas territoriales.
- Tabla de predicción horaria como **`<table>` semántica real**, no divs. Es contenido
  legible, extraíble y potencialmente elegible para featured snippet.

---

## Canonicalización y trampas conocidas

| Riesgo | Mitigación |
|---|---|
| Núcleo homónimo del municipio (Montblanc núcleo vs Montblanc municipio) | El núcleo cabecera **no tiene página propia**: canonical al municipio |
| Diseminados | `noindex`, se agregan a su entidad padre |
| Slugs duplicados en el mismo municipio | Desambiguación con sufijo del código INE, validada en build |
| Artículos catalanes ("la Guàrdia", "el Pinetell") | Slug con el artículo delante y en su forma natural: `la-guardia-dels-prats`. Redirección 301 desde la variante sin artículo |
| Paginación de listados de comarca | `rel=next/prev` ya no lo usa Google; se evita paginar y se listan todos los municipios (máx. 68 en el Baix Empordà, cabe de sobra) |
| Parámetros de consulta (`?dia=3`) | `canonical` a la URL limpia; los modificadores importantes son rutas, no parámetros |

---

## Medición

Los KPIs que de verdad indican si esto funciona, en orden:

1. **Ratio de indexación por nivel** (Search Console API, automatizado). Es el número uno: si
   las páginas de nivel B no se indexan, no se abre el nivel C.
2. **Consultas únicas con impresiones** — mide la anchura de la long tail capturada.
3. **Páginas con al menos un clic/mes** — mide cuántas de las 15.000 están *vivas*.
4. Posición media segmentada por nivel territorial.
5. Core Web Vitals por plantilla de página.

Se construye un panel interno que cruza Search Console con la base de datos territorial, para
poder responder "¿qué comarcas están indexando mal y por qué?".
