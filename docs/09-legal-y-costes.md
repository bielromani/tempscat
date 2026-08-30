# 09 — Legal, licencias y costes

Este documento existe porque **el mayor riesgo no técnico del proyecto es de licencias**, y es
un riesgo que se materializa justo cuando el proyecto empieza a funcionar: en el momento de
monetizar.

---

## Situación por fuente

| Fuente | Licencia | ¿Redistribuible? | ¿Uso comercial? | Atribución |
|---|---|---|---|---|
| **XEMA vía datos abiertos** | Licencia abierta de la Generalitat (Llei 19/2014) | ✅ Sí | ✅ Sí | Obligatoria |
| **API directa de Meteocat, plan gratuito** | Condiciones de uso del SMC | ❌ **No** | ❌ No | — |
| **API directa de Meteocat, plan profesional** | Contrato | ✅ Sí | ✅ Sí | Obligatoria |
| **Open-Meteo gratuito** | CC-BY 4.0 | ✅ Sí | ❌ **No** | Obligatoria |
| **Open-Meteo de pago** | Comercial | ✅ Sí | ✅ Sí | Recomendada |
| **AEMET OpenData** | Licencia AEMET | ✅ Sí | ✅ Sí | Obligatoria: "© AEMET" |
| **OpenWeatherMap gratuito** | CC-BY-SA 4.0 | ✅ Sí | ✅ Sí | Obligatoria |
| **RainViewer** | Términos propios | ✅ Sí | ✅ con atribución | Obligatoria |
| **Protomaps / OSM** | ODbL | ✅ Sí | ✅ Sí | "© OpenStreetMap contributors" |
| **ICGC** | CC-BY 4.0 | ✅ Sí | ✅ Sí | Obligatoria |

---

## Los dos problemas reales

### 1. El plan gratuito de Meteocat no sirve

Sus condiciones de uso obligan a no difundir a terceros, ni total ni parcialmente, la
información recibida del SMC. Una web pública es exactamente difundir a terceros.

**No es una zona gris.** Usar la API gratuita de Meteocat para alimentar el sitio sería un
incumplimiento directo, y además innecesario: los mismos datos XEMA están en el portal de
datos abiertos con licencia que sí permite redistribuir.

**Decisión: no solicitar el plan gratuito de la API para este proyecto.** Consumir el portal de
datos abiertos, que es la vía diseñada precisamente para esto.

### 2. Open-Meteo gratuito es no comercial

Es el problema que **aparece exactamente cuando el proyecto empieza a ir bien**. El tier
gratuito exige uso no comercial, y "comercial" incluye publicidad.

Momentos de decisión:

| Situación | ¿Qué hace falta? |
|---|---|
| Proyecto personal, sin ingresos, sin publicidad | Tier gratuito ✅ |
| Con AdSense o cualquier publicidad | **Plan de pago obligatorio** |
| Con suscripciones o funciones de pago | **Plan de pago obligatorio** |
| Con patrocinio o donaciones | Zona gris — consultar con Open-Meteo |

**Recomendación:** presupuestar el plan de pago desde el primer día en que se plantee
monetizar, y no monetizar antes de contratarlo.

> Corrección respecto a la estimación inicial: Open-Meteo factura **ubicaciones**, no
> peticiones (verificado con un `429` real al construir el territorio). Refrescar los ~1.500
> puntos representativos con 5 modelos cuatro veces al día se sale del tier gratuito. Con
> refresco escalonado por niveles sí cabe; en cuanto haya monetización el plan de pago es
> obligatorio de todas formas por licencia, así que el problema se resuelve solo.

---

## Atribución: cómo hacerlo bien

CC-BY no es un formalismo del pie de página. La atribución debe ser:

- **Visible** en cada página que muestra el dato, no escondida en un aviso legal.
- **Específica**: qué dato viene de dónde. No "fuentes varias".
- **Enlazada** a la fuente original.

Implementación propuesta:

- Bajo cada bloque de dato, una línea discreta: *"Dada de l'estació de Vimbodí · Meteocat XEMA"*
  — que además de cumplir la licencia **es la mejor decisión de producto del sitio**: decir de
  dónde viene cada número genera confianza y ningún competidor lo hace.
- Página `/fonts` con el detalle completo de cada fuente, su licencia y su frecuencia.
- Campo `attribution` en las respuestas de nuestra API pública.
- `Dataset` en el JSON-LD con `creator` y `license` correctos.

---

## Otras obligaciones legales

**RGPD.** Si hay cuentas de usuario (fase 6): base legal, política de privacidad, derecho de
supresión, minimización. Recomendación: analítica sin cookies (Plausible o Umami
autoalojado) → **sin banner de cookies**, mejor experiencia y menos superficie legal.

**Geolocalización.** Solo bajo permiso explícito del navegador y sin almacenarla en servidor.
La ubicación se resuelve en el cliente contra un índice local.

**Avisos meteorológicos.** Retransmitir avisos oficiales exige rigor: mostrar siempre el
organismo emisor, la hora de emisión y un enlace al original, y **nunca modificar el nivel ni
el texto**. Un aviso mal presentado es un riesgo de seguridad, no un problema de diseño.

**Descargo de responsabilidad.** Visible: la predicción es orientativa; para decisiones de
seguridad, la referencia son Meteocat y Protecció Civil. Especialmente relevante en las
verticales de montaña, aludes y náutica.

**Nombre y marca.** Evitar cualquier nombre que sugiera relación con el Servei Meteorològic de
Catalunya. Nada de "Meteocat", "Meteo.cat" ni derivados confundibles. Conviene registrar el
dominio `.cat` y comprobar la marca antes de invertir en identidad.

---

## Costes mensuales

### Fase de lanzamiento (sin monetizar)

| Concepto | Coste |
|---|---|
| Vercel Hobby | 0 € |
| Neon (tier gratuito, 0,5 GB) | 0 € |
| Upstash Redis (tier gratuito) | 0 € |
| Open-Meteo gratuito | 0 € |
| AEMET OpenData | 0 € |
| Datos abiertos Generalitat | 0 € |
| Protomaps autoalojado | 0 € |
| Dominio `.cat` | ~2 €/mes |
| **Total** | **~2 €/mes** |

> La limitación real de esta configuración es Neon: 0,5 GB frente a los ~5 GB estimados. Se
> aguanta reduciendo la retención de `forecast` a 7 días hasta pasar a plan de pago.

### Fase de producción (tráfico real, sin publicidad)

| Concepto | Coste |
|---|---|
| Vercel Pro | 20 € |
| Neon Scale (10 GB) | ~25 € |
| Upstash pay-as-you-go | ~5 € |
| Sentry Team | ~26 € |
| Dominio | 2 € |
| **Total** | **~78 €/mes** |

### Fase monetizada (con publicidad o suscripciones)

| Concepto | Coste |
|---|---|
| Infraestructura anterior | 78 € |
| **Open-Meteo comercial** | ~29–99 € |
| OpenWeatherMap (si se superan las tiles gratuitas) | 0–40 € |
| **Total** | **~110–220 €/mes** |

### Opcional: API de pago de Meteocat

Solo aporta lo que no está en datos abiertos: **predicción oficial comarcal estructurada y
rayos XDDE en tiempo real**.

| Combinación | Coste |
|---|---|
| Predicció, Pla 20.000 | 79,12 €/mes |
| XDDE, Pla 20.000 | 79,12 €/mes |
| Ambas | **158,24 €/mes** |

**Recomendación:** no contratarla hasta que el sitio genere ingresos. Los rayos en tiempo real
son espectaculares y muy compartibles, pero no son el diferencial: el diferencial es el
territorio y la fusión, y ambos son gratis.

---

## Qué hacer ya, esta semana

1. **Pedir la API key de AEMET** — es inmediata, gratuita, y hay que empezar a probar la
   ingesta de avisos CAP. Recordar que caduca a los 90 días.
2. **Crear cuenta en OpenWeatherMap** — free tier, solo para las tiles del mapa.
3. **NO pedir la API de Meteocat.** Innecesaria y con condiciones incompatibles.
4. **Comprobar disponibilidad de dominio** `.cat` y `.com`, y verificar que el nombre no
   colisiona con marcas registradas.
5. ~~Descargar el CSV de ICGC "Noms geogràfics"~~ — **ya no hace falta.** El fichero que
   publica el ICGC es GML INSPIRE, pesado de parsear. La geocodificación se resolvió mejor con
   su **geocodificador oficial** (`eines.icgc.cat/geocodificador/cerca`), que devuelve GeoJSON
   con el código de municipio incluido y permite desambiguar homónimos con seguridad. Sin clave
   y sin cuota documentada. Ver [docs/10](10-pipeline-de-datos.md).
