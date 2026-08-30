# 02 — Arquitectura técnica

## Principio rector

> **La ingesta está completamente desacoplada del renderizado.**

Ninguna petición de un usuario dispara jamás una llamada a una API externa. Los workers
escriben en la base de datos siguiendo su propio reloj; las páginas leen de la base de datos.
Esto da tres cosas a la vez: cuotas bajo control, latencia de servidor predecible (p95 < 100 ms)
y un sitio que sigue funcionando aunque Open-Meteo esté caído.

Es también la diferencia entre poder servir 4.900 páginas y no poder.

---

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| Framework | **Next.js 16, App Router, RSC** | SSG/ISR sobre miles de rutas es exactamente su punto fuerte |
| Lenguaje | **TypeScript strict** (Node 24 lo ejecuta nativo: los scripts de datos no necesitan build) | El modelo de datos meteorológico tiene muchas unidades; los tipos evitan errores caros |
| Estilos | **Tailwind v4** | Tokens de diseño en CSS nativo, sin runtime |
| Base de datos | **PostgreSQL 16 + PostGIS + TimescaleDB** | Series temporales masivas + consultas espaciales ("estación más cercana") en el mismo motor |
| Hosting DB | **Neon** | Serverless, escala a cero, PostGIS disponible, buen tier gratuito |
| Caché caliente | **Upstash Redis** | Snapshot "condiciones ahora" y rate-limit del edge |
| Workers de ingesta | **Vercel Cron** (fase 1) → **Railway/Fly worker** (fase 3) | Cron basta al principio; un worker persistente cuando el histórico crezca |
| Mapas | **MapLibre GL JS + Protomaps** | Sin dependencia de Mapbox, sin coste por carga, estilo propio |
| Gráficos densos | **uPlot** | 40 KB, renderiza 10.000 puntos sin despeinarse |
| Gráficos de portada | **SVG generado en servidor** | Entra en el HTML: Google lo ve, no hay CLS, no hay JS |
| Despliegue | **Vercel** | ISR bajo demanda y edge network incluidos |
| Observabilidad | **Sentry + Vercel Analytics + panel propio de frescura** | El panel de frescura de datos es imprescindible: hay que saber al minuto si XEMA dejó de actualizar |

### Sobre los gráficos: la decisión no obvia

Hay dos tipos de gráfico y **necesitan tecnologías distintas**:

- **El meteograma principal** (temperatura + precipitación + viento de las próximas 48 h) es
  contenido SEO. Tiene que estar en el HTML que recibe el crawler. → **SVG renderizado en el
  servidor** con `d3-scale` y `d3-shape`, cero JavaScript en cliente.
- **Los gráficos exploratorios** (histórico de 10 años, comparativa de modelos, zoom sobre
  series) son interactividad pura y no aportan SEO. → **uPlot**, cargado con `dynamic()` e
  `IntersectionObserver`, solo cuando el usuario hace scroll hasta ellos.

Servirlo todo con una librería React de gráficos (Recharts, Chart.js) sería el camino fácil y
el error: hidrata todo, mete 150 KB en el bundle, y el contenido que más importa para el
posicionamiento acaba fuera del HTML inicial.

---

## Las cinco capas

```
┌──────────────────────────────────────────────────────────────────────┐
│  1. INGESTA          Workers programados, aislados por fuente        │
│     xema-obs 10min · forecast 3h · avisos 15min · verticales 1-24h   │
└────────────────────────────────┬─────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  2. NORMALIZACIÓN    Unidades SI · códigos de variable unificados    │
│     control de calidad · deduplicación · marcado de procedencia      │
└────────────────────────────────┬─────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  3. PERSISTENCIA     PostgreSQL + PostGIS + TimescaleDB              │
│     territorio (estático) · observación (hypertable) · forecast      │
│     scores de verificación · agregados continuos                     │
└────────────────────────────────┬─────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  4. FUSIÓN           Consenso multi-modelo ponderado por skill       │
│     corrección de sesgo por estación · lapse rate por altitud        │
│     índices derivados (bolets, senderismo, nieve, surf)              │
└────────────────────────────────┬─────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  5. PRESENTACIÓN     Next.js RSC · ISR · edge cache                  │
│     ~15.000 rutas · sitemaps · JSON-LD · API pública propia          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Capa 1 — Ingesta

Cada fuente es un módulo independiente que implementa el mismo contrato. Si una fuente falla,
las demás siguen; nunca se cae la ingesta entera por un `429` ajeno.

```ts
interface DataSource<TRaw, TNormalized> {
  readonly id: string;
  readonly cadence: string;              // cron expression
  fetch(since: Date): Promise<TRaw[]>;
  normalize(raw: TRaw[]): TNormalized[];
  readonly quota: { perDay: number; perMinute: number };
  readonly attribution: string;          // obligatorio, ver doc 09
}
```

### Calendario de ingesta

| Worker | Cadencia | Fuente | Volumen aproximado |
|---|---|---|---|
| `xema-observations` | `*/10 * * * *` | Socrata `nzvn-apee` | ~245 est. × ~12 var = ~3.000 filas/lectura |
| `xema-stations` | `0 4 * * *` | Socrata `yqwd-vj5e` | 245 filas |
| `forecast-refresh` | `0 */3 * * *` | Open-Meteo × 5 modelos | ~8 llamadas por modelo |
| `ensemble-refresh` | `0 */6 * * *` | Open-Meteo Ensemble | solo en puntos "cabecera" |
| `aemet-warnings` | `*/15 * * * *` | AEMET CAP | 1–2 llamadas |
| `air-quality` | `0 * * * *` | Open-Meteo AQ | 1 llamada multi-punto |
| `marine` | `0 */3 * * *` | Open-Meteo Marine | puntos de costa |
| `reservoirs` | `0 6 * * *` | Socrata `gn9e-3qhr` | ~30 filas |
| `avalanche` | `0 7,19 * * *` | Socrata `nnwt-dwkm` | temporada invernal |
| `verification` | `30 2 * * *` | interno | recalcula skill de modelos |

### Deduplicación de puntos de predicción

La clave para que 4.900 ubicaciones no cuesten 4.900 llamadas. Dos núcleos separados por menos
de 2 km y menos de 100 m de desnivel comparten punto de predicción, porque **caen en la misma
celda de AROME de todos modos**: pedir dos veces la misma celda no aporta información.

```
4.900 ubicaciones
   ↓  agrupación espacial (grid 0,02° ≈ 1,7 km) + bandas de altitud de 100 m
~1.500 puntos representativos
   ↓  lotes de 200 por petición
8 llamadas por modelo y refresco
```

Cada ubicación guarda su `forecast_point_id` y su **delta de altitud** respecto al punto
representativo. La corrección por lapse rate (doc 05) devuelve después la diferencia real. Un
núcleo a 700 m no muestra la temperatura de uno a 350 m.

### Manejo de cuota

Cada worker declara su cuota y un `QuotaGuard` compartido en Redis la contabiliza. Al llegar
al 80 % pasa a modo degradado (menos modelos, menos frecuencia) y al 95 % se detiene y avisa.
Nunca se descubre que se agotó la cuota porque el sitio dejó de funcionar.

---

## Capa 3 — Persistencia y estrategia de retención

El volumen es el riesgo real: 245 estaciones × 12 variables × 48 lecturas/día ≈ **140.000
filas/día**, unos 51 millones al año.

TimescaleDB con agregados continuos y política de retención escalonada:

| Antigüedad | Resolución conservada |
|---|---|
| 0–7 días | Semihoraria (nativa) |
| 7–90 días | Horaria |
| 90 días – 2 años | Diaria (mín/máx/media/acumulado) |
| > 2 años | Mensual + récords absolutos preservados siempre |

Los récords (máxima histórica, mínima histórica, día más lluvioso) se guardan en una tabla
aparte que **nunca** se poda. Son contenido SEO de alto valor y ocupan nada.

---

## Capa 5 — Renderizado y caché

### Tres niveles de frescura sobre la misma página

Una página de municipio no es una unidad de caché: son tres.

| Bloque | Frescura | Técnica |
|---|---|---|
| Estructura, altitud, población, enlaces, texto | Semanas | Estático en el build |
| Predicción, meteograma, resumen diario | 3 h | ISR (`revalidate = 10800`) |
| "Ahora mismo" (temperatura, viento, lluvia) | 10 min | Server Component en `<Suspense>` con su propio `revalidate` |

Así la parte pesada se genera una vez, y solo el bloque de observación se regenera cada 10
minutos.

### Estrategia de build

Pre-renderizar 4.900 páginas en cada despliegue haría los builds eternos. Solución:

```ts
export async function generateStaticParams() {
  // Solo el núcleo duro en build: comarcas + municipios de >2.000 hab
  // El resto se genera bajo demanda en la primera visita y queda cacheado.
  return await getHighPriorityLocations();   // ~350 rutas
}
export const dynamicParams = true;
```

Build de ~2 minutos en vez de ~40. Las ~4.500 páginas restantes se generan la primera vez que
alguien (o Googlebot) las pide, y se sirven estáticas a partir de ahí.

### Revalidación dirigida por eventos

Cuando entra un aviso meteorológico oficial, no se espera al ciclo de ISR:

```ts
revalidateTag(`comarca:${codi}`);   // invalida comarca y todos sus municipios
```

---

## Nuestra propia API pública

Exponer una API REST/JSON documentada desde el principio, aunque nadie la pida todavía:

```
GET /api/v1/locations/{codi13}/current
GET /api/v1/locations/{codi13}/forecast?model=consensus&hours=168
GET /api/v1/stations/{codi}/observations?from=…&to=…
GET /api/v1/comarques/{slug}/summary
GET /api/v1/warnings/active
```

No es una funcionalidad, es **estrategia de enlaces**. Una API pública y limpia se cita en
GitHub, foros y proyectos de terceros, y esos son los backlinks editoriales que ninguna
técnica de SEO on-page puede sustituir.

Con rate-limit por IP en el edge (Upstash) y atribución obligatoria en la respuesta.

---

## Rendimiento — objetivos innegociables

| Métrica | Objetivo | Cómo se consigue |
|---|---|---|
| LCP | < 1,2 s | Hero renderizado en servidor, sin imagen de fondo, fuentes locales con `font-display: swap` |
| CLS | < 0,05 | Todo contenedor de gráfico o mapa con `aspect-ratio` fijado en CSS |
| INP | < 200 ms | Casi nada hidratado; el mapa se carga solo bajo interacción explícita |
| JS inicial | < 90 KB | RSC por defecto; `use client` solo en mapa y gráficos interactivos |
| TTFB | < 200 ms | Página servida desde el edge cache de Vercel |

**El mapa nunca se carga automáticamente en una página de municipio.** Se muestra una imagen
estática con un botón. MapLibre son ~200 KB y arruinaría el LCP de las 4.900 páginas que más
importan.

---

## Estructura de carpetas

```
src/
├── app/
│   ├── (marketing)/            portada, sobre, metodología
│   ├── [comarca]/
│   │   ├── page.tsx
│   │   ├── [municipi]/
│   │   │   ├── page.tsx
│   │   │   ├── [entitat]/page.tsx
│   │   │   ├── dema/page.tsx
│   │   │   ├── cap-de-setmana/page.tsx
│   │   │   ├── 15-dies/page.tsx
│   │   │   └── historic/[any]/page.tsx
│   ├── mapa/                   mapa de capas a pantalla completa
│   ├── neu/ · platges/ · embassaments/ · bolets/      verticales
│   ├── estacions/[codi]/       fichas de estación XEMA
│   ├── models/                 página pública de verificación de modelos
│   ├── api/v1/                 API pública
│   ├── sitemap.xml/ · robots.ts
├── lib/
│   ├── sources/                un módulo por fuente externa
│   ├── fusion/                 consenso, corrección de sesgo, verificación
│   ├── territory/              nomenclátor, slugs, jerarquía
│   ├── indices/                bolets, senderismo, nieve, surf
│   └── db/                     esquema, consultas, migraciones
├── components/
│   ├── charts/                 SVG servidor + islas uPlot
│   ├── map/                    MapLibre, capas, controles
│   └── ui/                     sistema de diseño
└── content/                    plantillas de texto por idioma
```

---

## Internacionalización

Tres idiomas: **catalán (por defecto), castellano, inglés**. Con dominios de ruta, no
subdominios:

```
/                 catalán   (sin prefijo — es el idioma principal)
/es/…             castellano
/en/…             inglés
```

Los slugs territoriales **se mantienen en catalán en los tres idiomas** (`/es/conca-de-barbera/montblanc`).
Son topónimos oficiales; traducirlos crearía URLs duplicadas y confundiría a Google sobre qué
página es canónica. `hreflang` recíproco en las tres, más `x-default` al catalán.
