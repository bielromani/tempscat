# 08 — Roadmap

Ocho fases. Cada una tiene **criterios de aceptación verificables**: no se pasa a la siguiente
sin cumplirlos. Las estimaciones asumen una persona a tiempo parcial con asistencia de IA.

---

## Fase 0 — Fundamentos de datos · ✅ COMPLETADA

Construir el territorio antes que la web. Sin territorio correcto, todo lo demás se reconstruye.

- [x] Proyecto Next.js 16 + TypeScript strict + Tailwind v4
- [x] Migración PostgreSQL con PostGIS escrita (`db/migrations/001_territory.sql`) e
      importador listo (`scripts/08-import-db.ts`). **Sin aplicar todavía**: el territorio es
      estático y los JSON de `data/build/` bastan hasta la fase 1
- [x] Importar `tssr-jqsj` → 947 municipios, 11 entidades colectivas, 3.903 entidades
      singulares, 3.283 núcleos, 2.875 diseminados
- [x] Importar `wpyq-we8x` → coordenadas de los 947 municipios y las **43** comarcas
- [x] Geocodificar entidades y núcleos — vía **geocodificador oficial del ICGC**, no el CSV
- [x] Altitud real de los 5.127 puntos poblados (Open-Meteo Elevation)
- [x] Generar slugs y `path`, resolver colisiones, validar unicidad
- [x] Importar 245 estaciones XEMA (189 operativas) y 68 variables
- [x] Asignar estación de referencia ponderando distancia y desnivel
- [x] Polígonos de comarcas y municipios (GML INSPIRE del ICGC)
- [x] **Colindancia real** desde la topología oficial: 5.424 relaciones simétricas
- [x] Superficie y centroide reales; GeoJSON simplificado para el mapa

**Aceptación: cumplida, 0 fallos y 0 avisos** (`npm run data:validate`).

| Criterio | Objetivo | Resultado |
|---|---|---|
| `/conca-de-barbera/montblanc/lilla` resuelve | sí | ✅ 468 m, estación l'Espluga de Francolí a 10,6 km |
| Entidades geocodificadas con confianza ≥ 60 | > 85 % | **93,1 %** |
| Municipios con coordenada y altitud | 947 | **947** |
| Ubicaciones publicadas con estación de referencia | 100 % | **4.250 / 4.250** |
| Colisiones de ruta | 0 | **0** |
| Rutas territoriales indexables | — | **4.293** |
| Distancia mediana a la estación de referencia | — | 5,6 km (máx. 23,8 km) |
| Polígonos de municipio y comarca | 947 / 43 | **947 / 43** |
| Superficie total frente a los 32.108 km² oficiales | ±2 % | **32.068 km² (−0,1 %)** |
| Colindancia simétrica | sí | ✅ 5.424 relaciones, 5,7 de media |

---

## Fase 1 — Ingesta y primeras páginas · en curso

- [x] Worker `xema-observations`: 188 estaciones, precipitación acumulada 24 h
- [x] Deduplicación de puntos de predicción: 4.250 → **3.190** (1,3×, no 3× como se estimó)
- [x] Worker `forecast-refresh` multi-punto con política de modelos por nivel
- [x] `QuotaGuard` con corte al 95 % y degradación al 80 %
- [x] Panel público de frescura de datos (`/estat`)
- [x] Página de municipio: hero, meteograma SVG de servidor, 7 días, estación de referencia
- [x] Página de comarca con listado, temperaturas en vivo y extremos
- [x] Página de entidad y núcleo, con texto único generado de datos reales
- [x] JSON-LD `Place` + `BreadcrumbList` (nunca `WeatherForecast`, que no existe)
- [ ] Worker `aemet-warnings` — bloqueado: falta la API key de AEMET
- [ ] Sitemaps y niveles de indexación → fase 2

### Ronda de pulido (fase 1.5)

- [x] **Avisos oficiales de AEMET**, asignados por geometría (punto en polígono), no por nombre
      de zona. Los verdes no se muestran: verde significa "sin aviso"
- [x] **Astronomía calculada en local**: orto, ocaso, crepúsculos civiles, mediodía solar,
      duración del día y su variación diaria, fase lunar y próximas lunas. Cuota cero
- [x] **Nueve variables más** de predicción para el nivel A: UV, nubosidad, punto de rocío,
      presión, visibilidad, isocero, nieve, radiación y CAPE
- [x] **Códigos de tiempo WMO** con descripción en catalán e iconos SVG propios, en sprite
- [x] **Tabla hora a hora** de 48 h con once columnas, semántica y accesible
- [x] **Histórico y récords** de las 189 estaciones: máximas y mínimas absolutas con fecha, día
      más lluvioso, racha más fuerte, y **normales climáticas de la propia estación**
- [x] **Anomalía del mes en curso** frente a esa normal, no frente a una media regional
- [x] Contadores del año: días de verano, de calor, noches tropicales, heladas, días de lluvia
- [x] Gráfico y tabla de los últimos 30 días
- [x] **Cota de nieve** derivada de la isocero con corrección por fusión

**Estado medido:** 402 páginas prerenderizadas. TTFB de 21 ms en caliente. Página de municipio
de **38 KB por la red** (gzip), sin una sola línea de JavaScript propio. Predicción para las
4.250 ubicaciones. Consumo de Open-Meteo: 7.949 de 10.000 diarias y 238.470 de 300.000
mensuales.

Ver [docs/11 — Qué lleva dentro una página](11-contenido-de-pagina.md).

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
| ~~Geocodificación incompleta de núcleos~~ | — | — | **Resuelto en fase 0: 93,1 %.** Sin coordenada verificada no hay página |
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
