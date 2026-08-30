# 08 — Roadmap

Ocho fases. Cada una tiene **criterios de aceptación verificables**: no se pasa a la siguiente
sin cumplirlos. Las estimaciones asumen una persona a tiempo parcial con asistencia de IA.

---

## Fase 0 — Fundamentos de datos · 1 semana

Construir el territorio antes que la web. Sin territorio correcto, todo lo demás se reconstruye.

- [ ] Proyecto Next.js 15 + TypeScript strict + Tailwind v4
- [ ] Neon PostgreSQL con PostGIS y TimescaleDB; migraciones del doc 04
- [ ] Importar `tssr-jqsj` → 947 municipios + 3.903 entidades + 6.158 núcleos
- [ ] Importar `wpyq-we8x` → coordenadas de los 947 municipios
- [ ] Importar ICGC "Noms geogràfics" → geocodificar entidades y núcleos
- [ ] Polígonos de comarcas y municipios
- [ ] Generar slugs y `path`, resolver colisiones, validar unicidad
- [ ] Calcular vecindades con `ST_Touches`
- [ ] Importar 245 estaciones XEMA y el catálogo de variables

**Aceptación:** `/conca-de-barbera/montblanc/lilla` resuelve a una fila con coordenada,
altitud y estación de referencia correctas. **Más del 85 % de las entidades geocodificadas con
confianza > 60.** Las que no lleguen quedan como tier D y no publican página.

---

## Fase 1 — Ingesta y primera vertical completa · 2 semanas

- [ ] Worker `xema-observations` cada 10 min con carga incremental
- [ ] Deduplicación de puntos de predicción (4.900 → ~1.500)
- [ ] Worker `forecast-refresh` multi-punto, 5 modelos
- [ ] Worker `aemet-warnings` (requiere API key de AEMET — pedirla ya)
- [ ] Panel de frescura de datos y `QuotaGuard`
- [ ] Página de municipio completa: hero, meteograma SVG, 7 días, estación de referencia
- [ ] Página de comarca con listado y comparativa

**Aceptación:** las 947 páginas de municipio se renderizan con datos reales. **LCP < 1,2 s en
móvil 4G simulado.** Ningún worker supera el 30 % de su cuota.

---

## Fase 2 — Cobertura territorial completa y SEO · 2 semanas

- [ ] Páginas de entidad singular (~3.900)
- [ ] Generador de texto único por ubicación
- [ ] Sistema de niveles de indexación A/B/C/D
- [ ] Sitemaps segmentados con `lastmod` real
- [ ] JSON-LD: `Place`, `BreadcrumbList`, `Dataset`, `SpecialAnnouncement`
- [ ] i18n ca/es/en con `hreflang` recíproco
- [ ] Buscador con `pg_trgm` + `unaccent`
- [ ] Enlazado interno automático
- [ ] Alta en Search Console, envío escalonado de sitemaps

**Aceptación:** ~15.000 URLs válidas. Cero errores en Search Console. Ninguna página a más de
3 clics de la portada. **Nivel A indexado por encima del 80 % antes de abrir el nivel B.**

---

## Fase 3 — Visualización y mapas · 2 semanas

- [ ] `/mapa` con MapLibre + Protomaps autoalojado
- [ ] Capas: XEMA en vivo, radar RainViewer, tiles OWM, avisos CAP
- [ ] Deep links con estado en la URL
- [ ] Islas uPlot para histórico y comparativa de modelos
- [ ] Rosa de vientos, heatmap climático, espagueti de ensemble
- [ ] Fichas de estación (245 páginas) con récords
- [ ] `/rànquings` diarios

**Aceptación:** el mapa carga en menos de 2 s con radar activo y **no afecta al LCP de las
páginas territoriales** (se verifica que no aparece en el bundle de esas rutas).

---

## Fase 4 — Motor de fusión · 2 semanas

- [ ] Corrección de altitud con lapse rate variable y detección de inversión térmica
- [ ] Corrección de sesgo por estación, mes y franja horaria
- [ ] Verificación continua contra XEMA → `model_skill`
- [ ] Consenso ponderado; tratamiento probabilístico de la precipitación
- [ ] Cálculo de confianza y su traducción a lenguaje llano
- [ ] Página pública `/models`

**Aceptación — la más importante del proyecto:** con 60 días de datos acumulados, **el MAE del
consenso debe ser inferior al del mejor modelo individual** en temperatura a 24 h y a 72 h. Si
no lo es, no se pasa de fase: hay un error de implementación. El resultado se publica sea cual
sea.

> Nota de planificación: esta fase **necesita 60 días de histórico previo**. Los workers de la
> fase 1 deben estar acumulando datos desde el principio, aunque la fusión se implemente
> después. Es la única dependencia temporal dura del roadmap.

---

## Fase 5 — Verticales · 3 semanas

Por orden del doc 07: nieve → embalses → bolets → playas → senderismo.

- [ ] `/neu` con cota de nieve por macizo y corte vertical de valle
- [ ] `/embassaments` con el cruce lluvia de cuenca ↔ nivel
- [ ] `/bolets` con índice explicable por comarca
- [ ] `/platges` y `/surf`
- [ ] `/muntanya` con índice horario y riesgo de tormenta vespertina

**Aceptación:** cada índice muestra su desglose de factores. Ningún número sin explicación.

---

## Fase 6 — Alertas personalizadas · 2 semanas

Lo que el usuario pidió "para más adelante".

- [ ] Cuentas mínimas (magic link, sin contraseñas)
- [ ] Ubicaciones favoritas
- [ ] Reglas de alerta: "avísame si nieva en Lilla", "si llueve más de 20 mm en Montblanc",
      "si hay aviso naranja en mi comarca", "si la cota baja de 1.200 m en el Berguedà"
- [ ] Web Push (VAPID) + email
- [ ] Retransmisión inmediata de avisos oficiales CAP
- [ ] Preferencias de silencio y agrupación (nadie quiere 40 notificaciones en una DANA)

**Aceptación:** una alerta llega en menos de 5 min desde que el dato cambia. Cero duplicados.

---

## Fase 7 — Comunidad · 3 semanas

- [ ] Reportes ciudadanos: foto y estado actual geolocalizado
- [ ] Moderación y detección de reportes inverosímiles cruzando con la estación más cercana
- [ ] Integración de estaciones meteorológicas de particulares
- [ ] Widgets embebibles para webs de ayuntamientos y entidades — **excelente fuente de
      backlinks**: cada widget instalado es un enlace desde un dominio local relevante
- [ ] Ranking de contribuidores

---

## Fase 8 — Consolidación · continua

- [ ] Monitorización de indexación automatizada vía Search Console API
- [ ] Tests de regresión de rendimiento en CI (falla el build si el LCP sube)
- [ ] App móvil (PWA primero; nativa solo si los datos la justifican)
- [ ] Evaluar la contratación de la API de pago de Meteocat (predicción oficial + rayos)
- [ ] Contenido editorial: análisis de episodios, comparativas, divulgación

---

## Calendario resumido

| Fase | Duración | Acumulado |
|---|---|---|
| 0 · Fundamentos | 1 sem | 1 |
| 1 · Ingesta + municipios | 2 sem | 3 |
| 2 · Territorio + SEO | 2 sem | 5 |
| 3 · Visualización | 2 sem | 7 |
| 4 · Fusión | 2 sem | 9 |
| 5 · Verticales | 3 sem | 12 |
| 6 · Alertas | 2 sem | 14 |
| 7 · Comunidad | 3 sem | 17 |

**Producto público y competitivo en la semana 7.** Producto irreplicable en la semana 12.

---

## Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Geocodificación incompleta de núcleos | Media | **Alto** | Tres fuentes en cascada; sin coordenada verificada, no hay página |
| Index bloat / Google no indexa | Media | **Alto** | Niveles A/B/C/D; contenido único real; apertura escalonada |
| Cambio en el portal de datos abiertos | Baja | **Alto** | Abstracción por fuente; caché local; alertas de frescura |
| Open-Meteo cambia su tier gratuito | Baja | Medio | AEMET y OWM como respaldo; plan de pago presupuestado |
| El consenso no gana al mejor modelo | Media | Medio | Criterio de aceptación explícito en fase 4; se corrige antes de anunciar |
| Uso comercial sin licencia adecuada | Media | **Alto** | Ver doc 09; resolver **antes** de monetizar, no después |
| Coste de base de datos por volumen | Media | Bajo | Retención escalonada; bajar `forecast` a 14 días |
| Alcance excesivo | **Alta** | **Alto** | Fases con criterios de aceptación; nada de verticales antes de la fase 5 |

El último es el riesgo real de este proyecto. La tentación de saltar a los mapas bonitos y las
verticales antes de tener el territorio y el SEO sólidos es fuerte, y sería el error caro: **la
ventaja competitiva está en las fases 0–2, no en las vistosas.**
