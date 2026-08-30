# 00 — Resumen ejecutivo

## La tesis

Las webs meteorológicas que operan hoy en Catalunya se dividen en dos grupos, y ambos tienen
un hueco explotable:

- **Las oficiales** (meteo.cat, AEMET). Dato excelente, presentación anticuada, sin
  granularidad por debajo del municipio, sin fusión de fuentes, SEO pobre.
- **Las agregadoras** (eltiempo.es, meteored, AccuWeather, tiempo3.com…). SEO agresivo y buen
  producto, pero corren un único modelo global, no tienen observación catalana real, no
  bajan de municipio y no entienden el territorio.

**El hueco es el cruce de los dos: granularidad territorial extrema + observación local real +
fusión multi-modelo verificada.** Nadie lo está ocupando en Catalunya.

## Las cuatro decisiones que definen el producto

### 1. Granularidad hasta el núcleo de población

No paramos en el municipio. Bajamos a entidad singular y núcleo:

```
Catalunya
└── Conca de Barberà                     (comarca)
    └── Montblanc                        (municipio, 7.433 hab)
        ├── Montblanc (núcleo)           6.906 hab
        ├── Lilla                           92 hab
        ├── la Guàrdia dels Prats          157 hab
        ├── el Pinetell                      6 hab
        ├── Prenafeta                       …
        └── Rojals                          …
```

Esto no es decoración: **es la estrategia SEO entera**. "El temps a Lilla" tiene competencia
cero. Multiplicado por ~3.900 entidades es un foso defensivo que a un competidor le cuesta
años replicar, porque implica geocodificar y modelar el territorio, no solo llamar a una API.

> **Cuantificado sobre el territorio ya construido.** De las 3.303 entidades publicadas con
> altitud comparable, **el 29 % está a 100 m o más del núcleo de su municipio** y **el 15 % a
> 200 m o más** — un error sistemático de 1,3 °C o superior para 38.341 habitantes, todos los
> días del año, en toda web que muestre un único valor por municipio. El desnivel interno medio
> de los 619 municipios con más de un núcleo es de 182 m; el máximo, 1.059 m en Soriguera
> (Pallars Sobirà), que reparte 16 lugares habitados entre los 649 y los 1.708 m.
>
> Eso es exactamente el hueco: no es que la competencia sea menos precisa, es que para uno de
> cada siete núcleos **muestra la temperatura de otro sitio**.

### 2. Observación real catalana, gratis y legal

245 estaciones automáticas de la XEMA con lectura semihoraria, vía portal de datos abiertos
de la Generalitat. Latencia medida: **~45 minutos**. Sin API key, sin cuota dura, con licencia
que sí permite redistribuir. Ver [01 — Fuentes de datos](01-fuentes-de-datos.md).

Esto nos permite mostrar en cada página *lo que está pasando ahora mismo*, no solo lo que un
modelo predice. Ninguna agregadora internacional tiene esto para Catalunya.

### 3. Motor de consenso multi-modelo verificado

No elegimos "un" modelo. Consultamos AROME-HD (1,5 km), HARMONIE (2 km), ECMWF IFS, GFS e
ICON-EU, y los combinamos con pesos que **calculamos nosotros midiendo el error de cada
modelo contra las estaciones XEMA reales**, por variable, por horizonte y por zona.

El subproducto es una página pública de "cómo de bien acertó cada modelo el mes pasado en
Catalunya". Es contenido único, altamente enlazable y demuestra la afirmación en vez de
proclamarla. Ver [05 — Motor de fusión](05-motor-de-fusion.md).

### 4. SEO como arquitectura, no como añadido

~15.000 páginas indexables desde el día uno, todas renderizadas en servidor con el dato ya
dentro del HTML, agrupadas en un árbol de rutas que refleja la jerarquía territorial real,
con sitemaps segmentados, `lastmod` verídico, `hreflang` ca/es/en y datos estructurados
correctos. Ver [03 — SEO y árbol de rutas](03-seo-y-rutas.md).

## Números del territorio (verificados contra el dataset real)

| Nivel | Cantidad | ¿Página propia? |
|---|---|---|
| Comarcas | 43 (Aran y el Lluçanès incluidos) | 43 |
| Municipios | 947 | 947 |
| Entidades colectivas | 11 | 11 |
| Entidades singulares (pedanías, aldeas) | 3.903 | 2.759 |
| Núcleos | 3.283 | 533 |
| Diseminados | 2.875 | 0, se agregan al padre |
| Estaciones XEMA | 245 (189 operativas) | 245 |
| **Rutas territoriales indexables** | | **4.293** |

Cifras del territorio ya construido (fase 0 completada). Las entidades que no publican página
lo hacen por una razón concreta: 2.611 núcleos repiten el topónimo de su entidad singular, 879
son el núcleo cabecera del municipio, 350 no tienen coordenada fiable y 54 son unidades
estadísticas que no designan ningún lugar.

## Lo que NO vamos a hacer (y por qué)

- **No usaremos la API directa de Meteocat mientras el proyecto no monetice.** Su plan
  gratuito prohíbe redistribuir. Contratarla sería la primera compra cuando haya ingresos.
- **No generaremos páginas para los ~2.200 "diseminados".** Son ruido para el índice de
  Google; se agregan a su entidad padre.
- **No lanzaremos con alertas ni comunidad.** Están en el roadmap (fases 5 y 6) y la
  arquitectura las contempla, pero el diferencial inicial es dato + territorio + SEO.

## Riesgo principal y su mitigación

**Riesgo:** *index bloat*. Publicar 15.000 páginas casi idénticas es la forma más rápida de
que Google clasifique el sitio como contenido de baja calidad y no indexe nada.

**Mitigación:** cada página debe tener contenido genuinamente distinto —altitud real,
estación XEMA más cercana con su distancia y desnivel, orientación, texto generado a partir
de los datos concretos de ese punto, comparativa con el resto de la comarca— y un sistema de
niveles de indexación que solo abre al índice lo que aporta valor. Detallado en el doc 03.
